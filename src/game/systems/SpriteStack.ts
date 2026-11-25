import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { sortDepth } from '../core/depth';
import { currentDifficulty } from '../core/difficulty';
import { TILE_UNIT } from '../core/grid';
import { ROOF_VARIANTS, frameX, paintSlices, readArt } from './Rooftops';
import type { Art } from './Rooftops';
import { placeFigure } from './TokenVolume';

/**
 * Trial: the city drawn as stacked slices. Only with `?stack` in the address.
 *
 * Every original sprite stays where it is and keeps doing its job — collision,
 * occlusion, culling, tweens, the towers that replace buildings — but is hidden
 * from the main camera. What the camera sees instead is a pile of copies.
 *
 * Blocks (houses, towers, the goal) are built from their own front drawings.
 * The drawing is cut into horizontal bands, bottom to top, one per slice. Each
 * slice is the building's footprint, as wide as the drawing is at that height
 * (so a tower's setbacks and rooftop plant come out as narrower slices), with
 * its band painted round the rim. Stacked, lifted and leaned away from the
 * middle of the screen, the visible strip of each rim is that band, and the
 * strips together redraw the facade on the walls the camera can see.
 *
 * Cats, fish and milk are drawn as solid little figures (see TokenVolume), the
 * cats in more poses than their two walk drawings (see CatPoses). Dust keeps
 * its drawing, stacked a few times into a mound with the lower copies darker.
 * Every token leans with the city at its middle height.
 *
 * `?stack=flat` drops the lean, to compare.
 */

/** Screen pixels a slice rises per pixel of height. */
const TILT = 0.55;
/** How far a slice leans per pixel of height and pixel off the screen's middle. */
const LEAN = 0.0012;
/** Drawn height of a block as a share of its drawing's drawn height. Houses sit low. */
const HEIGHT_SHARE = { building: 0.45, apt: 0.75, goal: 0.75 };
/**
 * Towers that fill a 2x2 square of cells are drawn as one tower over all four,
 * the size of four houses. One tower per cell drawn that big would overlap its
 * neighbours into one smear; this keeps each tower on its own ground.
 */
const COMPLEX = { footprint: 0.92, height: 1.5 };
const COMPLEX_FOOTPRINT = 2 * TILE_UNIT * COMPLEX.footprint;
/**
 * World units to a texel of a block's slices: the ground's (32 to a cell), so
 * facades, roofs and road are drawn in one size of pixel.
 */
const TEXEL = TILE_UNIT / 32;
/**
 * Texel rows of facade per slice. A block's height is rounded so each slice
 * rises exactly this many texels, and its pixels stay square. Two keeps the
 * piles short; home has a chimney and a railing to step in, so it gets one.
 */
const ROWS_PER_SLICE = { building: 2, apt: 2, goal: 1 };
type Family = keyof typeof ROWS_PER_SLICE;

interface TokenStyle {
    layers: number;
    step: number;
    /** Scale of the top copy against the bottom one: below 1 piles into a mound. */
    taper: number;
}
const DUST: TokenStyle = { layers: 6, step: 4, taper: 0.7 };

export const isStackEnabled = (): boolean => {
    try {
        const value = new URLSearchParams(window.location.search).get('stack');
        return value !== null && value !== '0' && value !== 'false';
    } catch {
        return false;
    }
};

const isFlat = (): boolean => {
    try {
        return new URLSearchParams(window.location.search).get('stack') === 'flat';
    } catch {
        return false;
    }
};

type Source = Phaser.GameObjects.Sprite;

/** A drawing cut into slices, made once per texture. */
interface Cut {
    key: string;
    family: Family;
    slices: number;
    /** Texels across a frame, and rows of facade up all the slices. */
    px: number;
    rows: number;
    /** The drawing's opaque width, as a share of the whole picture. */
    widthShare: number;
}

interface Pile {
    copies: Phaser.GameObjects.Image[];
    cut?: Cut;
    /** A tower cut for its own cell, not for a square of four. */
    lone?: boolean;
    /** A token's stacking; a figure has none, and one copy. */
    style?: TokenStyle;
}

export interface StackSources {
    blocks: () => Source[];
    tokens: () => Source[];
    /** The city's grid, for the ground under it. */
    maze: () => number[][] | undefined;
    /** The tower standing on a cell, if any. */
    towerAt: (gx: number, gy: number) => Source | null;
    /** Whether a cell is taped off for a tower that has not landed yet. */
    pendingAt: (gx: number, gy: number) => boolean;
}

const shade = (amount: number): number => {
    const v = Math.round(255 * amount);
    return Phaser.Display.Color.GetColor(v, v, v);
};

/**
 * Phaser re-sorts the whole display list whenever any depth is set, changed or
 * not; with thousands of slices that sort every frame cost most of the frame.
 */
const setDepthIfChanged = (object: Phaser.GameObjects.Image, depth: number): void => {
    if (object.depth !== depth) object.setDepth(depth);
};

// Home's drawing is building4.png, loaded under the key 'goal'.
const familyOf = (key: string): Family =>
    key.startsWith('apt') ? 'apt' : key === 'goal' || key === 'building4' ? 'goal' : 'building';

export class SpriteStack {
    private readonly scene: Phaser.Scene;
    private readonly sources: StackSources;
    private readonly piles = new Map<Source, Pile>();
    private readonly cuts = new Map<string, Cut>();
    private readonly dust = new Set<Source>();
    /** How far each standing block's top is drawn above its ground, by cell. */
    private readonly rises = new Map<string, number>();
    private readonly lean: number;
    private readonly cameraId: number;
    private making = false;

    constructor(scene: Phaser.Scene, sources: StackSources) {
        this.scene = scene;
        this.sources = sources;
        this.lean = isFlat() ? 0 : LEAN;
        this.cameraId = scene.cameras.main.id;

        // Dust is made and thrown away as towers land, outside any group.
        scene.sys.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
    }

    private onAdded(object: Phaser.GameObjects.GameObject): void {
        if (this.making || !(object instanceof Phaser.GameObjects.Sprite)) return;
        if (String(object.texture.key).startsWith('dust')) this.dust.add(object);
    }

    // ------------------------------------------------------------ cutting art

    /**
     * Cuts a front drawing into slices (see Rooftops): one texture, a `px`
     * square frame per slice from the ground up, the last the roof. Made once
     * per drawing and number of slices — houses come in a few heights — and
     * with lit windows on nightmare.
     */
    private cutOf(textureKey: string, family: Family, art: Art, px: number, slices: number): Cut {
        const glow = currentDifficulty().dread;
        const key = `stack-${textureKey}-${px}-${slices}${glow ? '-lit' : ''}`;
        const known = this.cuts.get(key);
        if (known) return known;

        const rowsPerSlice = ROWS_PER_SLICE[family];
        const texture = this.scene.textures.exists(key)
            ? this.scene.textures.get(key)
            : this.scene.textures.addCanvas(key, paintSlices(art, { kind: family, px, slices, rowsPerSlice, seed: textureKey, glow }));
        if (texture) {
            for (let i = 0; i < slices + ROOF_VARIANTS; i++) if (!texture.has(String(i))) texture.add(i, 0, frameX(i, px), 1, px, px);
            texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        }

        const cut = { key, family, slices, px, rows: slices * rowsPerSlice, widthShare: art.widthShare };
        this.cuts.set(key, cut);
        return cut;
    }

    // ----------------------------------------------------------------- piles

    private hide(source: Source): void {
        // Off the main camera only: visible, alpha and angle stay the source's
        // own, for culling and tweens to drive and for the pile to copy.
        source.cameraFilter |= this.cameraId;
    }

    /** The cut for a block of `key`'s drawing shown `width` by `height`. */
    private cutFor(key: string, width: number, height: number, lone = false): Cut {
        const family = familyOf(key);
        const art = readArt(this.scene.textures.get(key).getSourceImage() as HTMLImageElement);
        // Towers are cut for the complex of four cells nearly all of them stand
        // in; one by home, where a square cannot fill, for its own cell.
        const tower = family === 'apt' && !lone;
        const footprint = tower ? COMPLEX_FOOTPRINT : width * art.widthShare;
        const rise = height * art.heightShare * HEIGHT_SHARE[family] * (tower ? COMPLEX.height : 1) * TILT;
        const px = Math.round(footprint / TEXEL);
        const slices = Math.max(1, Math.round(rise / ((footprint / px) * ROWS_PER_SLICE[family])));
        return this.cutOf(key, family, art, px, slices);
    }

    private makeBlock(source: Source, lone = false): Pile {
        // The first block of a run: cut the towers now, under the opening
        // fly-over, not in the frame the first one lands (tens of milliseconds
        // each). They are drawn as the tower system sizes them.
        if (!this.cuts.size) {
            const width = TILE_UNIT * GameConfig.APARTMENT.TILE_OVERLAP;
            this.scene.textures.getTextureKeys().forEach((k) => {
                if (familyOf(k) !== 'apt') return;
                const image = this.scene.textures.get(k).getSourceImage();
                this.cutFor(k, width, (width * image.height * GameConfig.APARTMENT.HEIGHT_SCALE) / image.width);
            });
        }

        const cut = this.cutFor(String(source.texture.key), source.displayWidth, source.displayHeight, lone);

        // Which of the drawing's roofs, by where it stands.
        const roof = cut.slices + (Math.abs(Math.round(source.x / TILE_UNIT) * 7 + Math.round(source.y / TILE_UNIT) * 13) % ROOF_VARIANTS);
        this.making = true;
        const copies: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i <= cut.slices; i++) copies.push(this.scene.add.image(source.x, source.y, cut.key, i < cut.slices ? i : roof));
        this.making = false;

        this.hide(source);
        return { copies, cut, lone };
    }

    private makeToken(source: Source, style?: TokenStyle): Pile {
        this.making = true;
        const copies: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i <= (style?.layers ?? 0); i++) copies.push(this.scene.add.image(source.x, source.y, source.texture.key));
        this.making = false;
        this.hide(source);
        return { copies, style };
    }

    update(): void {
        const view = this.scene.cameras.main.worldView;
        const cx = view.centerX;
        const cy = view.centerY;
        const pad = GameConfig.CULLING.PADDING;
        const seen = new Set<Source>();

        for (const source of this.sources.blocks()) {
            seen.add(source);
            let pile = this.piles.get(source);
            if (!pile) {
                pile = this.makeBlock(source);
                this.piles.set(source, pile);
            }
            this.placeBlock(source, pile, cx, cy);
        }

        const tokens = this.sources.tokens();
        this.dust.forEach((d) => (d.scene ? tokens.push(d) : this.dust.delete(d)));
        for (const source of tokens) {
            seen.add(source);
            let pile = this.piles.get(source);
            if (!pile) {
                pile = this.makeToken(source, this.dust.has(source) ? DUST : undefined);
                this.piles.set(source, pile);
            }
            const inView =
                source.x > view.x - pad && source.x < view.right + pad && source.y > view.y - pad && source.y < view.bottom + pad;
            this.placeToken(source, pile, cx, cy, inView);
        }

        // Gone (a house a tower replaced, dust that settled, a fish freed).
        this.piles.forEach((pile, source) => {
            if (seen.has(source) && source.scene) return;
            for (const copy of pile.copies) copy.destroy();
            this.piles.delete(source);
        });
    }

    /**
     * Where a block stands and how tall it is drawn, or null for a tower another
     * tower of its square draws. One sum for the slices and the shade under them.
     */
    private footprintOf(
        source: Source,
        cut: Cut
    ): { x: number; base: number; size: number; height: number; alpha: number; lone: boolean } | null {
        let alpha = source.alpha;
        let size = source.displayWidth * cut.widthShare;
        // The ground line under the drawing, and the footprint's middle behind it.
        let base = source.y + source.displayHeight * (1 - source.originY);
        let x = source.x;
        let lone = false;

        if (cut.family === 'apt') {
            const complex = this.complexOf(source, base);
            if (complex === 'covered') return null;
            if (complex) {
                ({ x, base, alpha } = complex);
                size = COMPLEX_FOOTPRINT;
            } else lone = true;
        }
        // Each slice rises a whole number of its texels.
        const height = (cut.rows * size) / cut.px / TILT;
        return { x, base, size, height, alpha, lone };
    }

    private placeBlock(source: Source, pile: Pile, cx: number, cy: number): void {
        let at = this.footprintOf(source, pile.cut as Cut);
        // A tower whose square stopped (or started) filling is cut again for its ground.
        if (at && at.lone !== !!pile.lone) {
            pile.copies.forEach((copy) => copy.destroy());
            Object.assign(pile, this.makeBlock(source, at.lone));
            at = this.footprintOf(source, pile.cut as Cut);
        }
        const cut = pile.cut as Cut;
        const shown = !!at && source.active && source.visible && source.alpha > 0;
        if (!at || !shown) {
            pile.copies.forEach((slice) => slice.setVisible(false));
            return;
        }
        const { x, base, size, height, alpha } = at;

        const gx = Math.round((x - (size > TILE_UNIT ? TILE_UNIT / 2 : 0)) / TILE_UNIT);
        const gy = Math.round((base - TILE_UNIT / 2) / TILE_UNIT);
        const span = size > TILE_UNIT ? 2 : 1;
        for (let i = 0; i < span; i++) {
            for (let j = 0; j < span; j++) this.rises.set(`${gx + i},${gy - j}`, height * TILT);
        }

        const y = base - size / 2;
        const depth = sortDepth(base);

        pile.copies.forEach((slice, i) => {
            slice.setVisible(true);
            const h = (height * i) / cut.slices;
            slice.setDisplaySize(size, size);
            slice.setPosition(x + (x - cx) * h * this.lean, y + (y - cy) * h * this.lean - h * TILT);
            setDepthIfChanged(slice, depth + i * 0.001);
            slice.setAlpha(alpha);
            slice.setAngle(source.angle);
        });
    }

    /**
     * Towers come in 2x2 squares (squares start on even cells; with `?stack`
     * the blocks are laid on that grid). Once every cell of a square is a tower
     * or taped for one, its first standing tower draws one tower over all four
     * and the rest draw nothing, so a block never shows small towers among big.
     */
    private complexOf(source: Source, base: number): { x: number; base: number; alpha: number } | 'covered' | null {
        const gx = Math.round(source.x / TILE_UNIT);
        const gy = Math.round((base - TILE_UNIT / 2) / TILE_UNIT);
        const ax = gx - (((gx % 2) + 2) % 2);
        const ay = gy - (((gy % 2) + 2) % 2);
        const cells = [
            [ax, ay],
            [ax + 1, ay],
            [ax, ay + 1],
            [ax + 1, ay + 1]
        ];
        const towers = cells.map(([x, y]) => this.sources.towerAt(x, y));
        if (cells.some(([x, y], i) => !towers[i] && !this.sources.pendingAt(x, y))) return null;
        if (towers.find((t) => t) !== source) return 'covered';
        // Fade in with whichever of its towers has landed furthest.
        const alpha = Math.max(...towers.map((t) => (t ? t.alpha : 0)));
        return { x: (ax + 0.5) * TILE_UNIT, base: (ay + 1) * TILE_UNIT + TILE_UNIT / 2, alpha };
    }

    private placeToken(source: Source, pile: Pile, cx: number, cy: number, inView: boolean): void {
        const style = pile.style;
        const shown = inView && source.active && source.visible && source.alpha > 0;
        const top = pile.copies.length - 1;
        // Lean the drawing as the city leans at its middle height.
        const mid = source.displayHeight / 2;
        const dx = (source.x - cx) * mid * this.lean;
        const dy = (source.y - cy) * mid * this.lean;

        if (!style) {
            const figure = pile.copies[0];
            figure.setVisible(shown);
            if (!shown) return;
            placeFigure(figure, source, source.x + dx, source.y + dy);
            setDepthIfChanged(figure, source.depth);
            return;
        }

        pile.copies.forEach((copy, i) => {
            copy.setVisible(shown);
            if (!shown) return;
            const taper = 1 - (1 - style.taper) * (i / top);
            copy.setTexture(source.texture.key, source.frame.name);
            copy.setOrigin(source.originX, source.originY);
            copy.setScale(source.scaleX * taper, source.scaleY * taper);
            copy.setFlip(source.flipX, source.flipY);
            copy.setAngle(source.angle);
            copy.setAlpha(source.alpha);
            copy.setPosition(source.x + dx, source.y + dy + (top - i) * style.step);
            setDepthIfChanged(copy, source.depth - (top - i) * 0.0001);

            if (i === top) {
                if (source.isTinted) copy.setTint(source.tintTopLeft);
                else copy.clearTint();
            } else {
                copy.setTint(shade(0.35 + (0.35 * i) / top));
            }
        });
    }

    /** The drawn height of the block on a cell, for the light to climb. */
    riseAt(gx: number, gy: number): number {
        return this.rises.get(`${gx},${gy}`) ?? TILE_UNIT * 0.5;
    }

    /**
     * Every standing block's footprint on the ground (its middle and side) and
     * how far its top is drawn above it, for the ground to shade. The same sums
     * as placeBlock, but for every block, culled or not: culling hides what is
     * off screen, and the shade is baked for the whole city.
     */
    forEachFootprint(visit: (x: number, y: number, size: number, rise: number) => void): void {
        this.piles.forEach((pile, source) => {
            if (!pile.cut || !source.active) return;
            const at = this.footprintOf(source, pile.cut);
            if (at) visit(at.x, at.base - at.size / 2, at.size, at.height * TILT);
        });
    }

    destroy(): void {
        this.scene.sys.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
        this.piles.forEach((pile) => pile.copies.forEach((copy) => copy.destroy()));
        this.piles.clear();
    }
}
