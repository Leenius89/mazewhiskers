import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { sortDepth } from '../core/depth';
import { TILE_UNIT } from '../core/grid';

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
 * Tokens (cats, milk, fish, dust) keep their drawing, stacked a few times with
 * the lower copies darker, and lean with the city at their middle height.
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
/** Slice texture size. */
const SLICE_PX = 96;
/** Slices per kind of drawing: enough for its floors to read. */
const SLICES = { building: 10, apt: 22, goal: 16 };
type Family = keyof typeof SLICES;

interface TokenStyle {
    layers: number;
    step: number;
    /** Scale of the top copy against the bottom one: below 1 piles into a mound. */
    taper: number;
    /** Drawn bigger than the sprite the game plays with. */
    grow: number;
    /**
     * Solid colours for the copies under the top one, bottom first. Darkening
     * a black drawing changes nothing, so the black cat's layers are filled
     * with greys instead: still a black cat, with a body under it.
     */
    fills?: number[];
}
const TOKEN: TokenStyle = { layers: 4, step: 1.5, taper: 1, grow: 1 };
const CAT: TokenStyle = { layers: 4, step: 1.8, taper: 1, grow: 1 };
const BLACK_CAT: TokenStyle = { ...CAT, step: 2.6, fills: [0x2e2b3a, 0x46425a, 0x625d7d, 0x8a84a8] };
const DUST: TokenStyle = { layers: 6, step: 4, taper: 0.7, grow: 1 };

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
    /** The drawing's opaque box, as a share of the whole picture. */
    widthShare: number;
    heightShare: number;
}

interface Pile {
    copies: Phaser.GameObjects.Image[];
    cut?: Cut;
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

const isCat = (source: Source): boolean => /^(cat|enemy)/.test(String(source.texture.key));

const familyOf = (key: string): Family =>
    key.startsWith('apt') ? 'apt' : key === 'building4' ? 'goal' : 'building';

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
     * Cuts a front drawing into rim-painted slices: one texture, a frame per
     * slice, the last a plain roof. `riseShare` is how far each slice's strip
     * shows on screen, as a share of the drawing's drawn width, for the tallest
     * block that will use it.
     */
    private cutOf(textureKey: string, riseShare: number): Cut {
        const known = this.cuts.get(textureKey);
        if (known) return known;

        const image = this.scene.textures.get(textureKey).getSourceImage() as HTMLImageElement;
        const width = image.width;
        const height = image.height;
        const read = document.createElement('canvas');
        read.width = width;
        read.height = height;
        const readCtx = read.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
        readCtx.drawImage(image, 0, 0);
        const pixels = readCtx.getImageData(0, 0, width, height).data;

        // Each row's opaque span, and the drawing's opaque box.
        let top = height;
        let bottom = -1;
        let left = width;
        let right = -1;
        const spans: Array<[number, number] | null> = [];
        for (let y = 0; y < height; y++) {
            let a = -1;
            let b = -1;
            for (let x = 0; x < width; x++) {
                if (pixels[(y * width + x) * 4 + 3] <= 24) continue;
                if (a < 0) a = x;
                b = x;
            }
            spans.push(a < 0 ? null : [a, b]);
            if (a < 0) continue;
            top = Math.min(top, y);
            bottom = y;
            left = Math.min(left, a);
            right = Math.max(right, b);
        }
        const boxWidth = right - left + 1;
        const boxHeight = bottom - top + 1;
        const widthShare = boxWidth / width;

        const family = familyOf(textureKey);
        const slices = SLICES[family];
        // In texture pixels, a touch more than shows, so no gap opens between strips.
        const strip = Math.max(2, Math.ceil((riseShare / widthShare) * SLICE_PX) + 1);
        const roof = this.roofColour(pixels, width, spans, top, boxHeight);

        const canvas = document.createElement('canvas');
        canvas.width = SLICE_PX * (slices + 1);
        canvas.height = SLICE_PX;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        ctx.imageSmoothingEnabled = false;

        for (let i = 0; i <= slices; i++) {
            const isRoof = i === slices;
            // The band of the drawing this slice carries, counted from the ground.
            const bandBottom = bottom + 1 - Math.round((boxHeight * i) / slices);
            const bandTop = isRoof ? top : bottom + 1 - Math.round((boxHeight * (i + 1)) / slices);
            const rows = isRoof ? [top] : Array.from({ length: bandBottom - bandTop }, (_, k) => bandTop + k);

            let a = right;
            let b = left;
            for (const y of rows) {
                const span = spans[y];
                if (!span) continue;
                a = Math.min(a, span[0]);
                b = Math.max(b, span[1]);
            }
            if (b < a) continue;

            const side = Math.max(4, Math.round((SLICE_PX * (b - a + 1)) / boxWidth));
            const x0 = i * SLICE_PX + Math.round((SLICE_PX - side) / 2);
            const y0 = Math.round((SLICE_PX - side) / 2);

            ctx.fillStyle = roof;
            ctx.fillRect(x0, y0, side, side);
            if (isRoof) continue;

            const t = Math.min(strip, Math.floor(side / 2));
            const draw = (dx: number, dy: number) =>
                ctx.drawImage(image, a, bandTop, b - a + 1, Math.max(1, bandBottom - bandTop), dx, dy, side, t);

            draw(x0, y0 + side - t); // south
            draw(x0, y0); // north
            for (const [centreX, turn] of [
                [x0 + t / 2, Math.PI / 2],
                [x0 + side - t / 2, -Math.PI / 2]
            ]) {
                // West and east: the band turned on its side.
                ctx.save();
                ctx.translate(centreX, y0 + side / 2);
                ctx.rotate(turn);
                draw(-side / 2, -t / 2);
                ctx.restore();
            }
        }

        const key = `stack-${textureKey}`;
        const texture = this.scene.textures.exists(key) ? this.scene.textures.get(key) : this.scene.textures.addCanvas(key, canvas);
        if (texture) {
            for (let i = 0; i <= slices; i++) if (!texture.has(String(i))) texture.add(i, 0, i * SLICE_PX, 0, SLICE_PX, SLICE_PX);
            texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        }

        const cut = { key, family, slices, widthShare, heightShare: boxHeight / height };
        this.cuts.set(textureKey, cut);
        return cut;
    }

    /** The top of the drawing, toned down towards concrete: what a roof looks like from above. */
    private roofColour(
        pixels: Uint8ClampedArray,
        width: number,
        spans: Array<[number, number] | null>,
        top: number,
        boxHeight: number
    ): string {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let y = top; y < top + Math.max(1, Math.round(boxHeight * 0.08)); y++) {
            const span = spans[y];
            if (!span) continue;
            for (let x = span[0]; x <= span[1]; x++) {
                const at = (y * width + x) * 4;
                if (pixels[at + 3] <= 24) continue;
                r += pixels[at];
                g += pixels[at + 1];
                b += pixels[at + 2];
                n++;
            }
        }
        const mix = (v: number) => Math.round(((n ? v / n : 128) + 138) / 2);
        return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
    }

    // ----------------------------------------------------------------- piles

    private hide(source: Source): void {
        // Off the main camera only: visible, alpha and angle stay the source's
        // own, for culling and tweens to drive and for the pile to copy.
        source.cameraFilter |= this.cameraId;
    }

    private makeBlock(source: Source): Pile {
        const key = String(source.texture.key);
        const family = familyOf(key);
        // Houses come in random heights; cut for the tallest so no strip falls short.
        const tallest =
            family === 'building'
                ? source.width * source.scaleX * GameConfig.BUILDING_HEIGHT.MAX
                : source.displayHeight;
        const riseShare = (tallest * HEIGHT_SHARE[family] * TILT) / SLICES[family] / source.displayWidth;
        const cut = this.cutOf(key, riseShare);

        this.making = true;
        const copies: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i <= cut.slices; i++) copies.push(this.scene.add.image(source.x, source.y, cut.key, i));
        this.making = false;

        this.hide(source);
        return { copies, cut };
    }

    private makeToken(source: Source, style: TokenStyle): Pile {
        this.making = true;
        const copies: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i <= style.layers; i++) copies.push(this.scene.add.image(source.x, source.y, source.texture.key));
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
                pile = this.makeToken(source, this.dust.has(source) ? DUST : isCat(source) ? (String(source.texture.key).startsWith('enemy') ? BLACK_CAT : CAT) : TOKEN);
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

    private placeBlock(source: Source, pile: Pile, cx: number, cy: number): void {
        const cut = pile.cut as Cut;
        let shown = source.active && source.visible && source.alpha > 0;
        let alpha = source.alpha;
        let footprint = source.displayWidth * cut.widthShare;
        let height = source.displayHeight * cut.heightShare * HEIGHT_SHARE[cut.family];
        // The ground line under the drawing, and the footprint's middle behind it.
        let base = source.y + source.displayHeight * (1 - source.originY);
        let x = source.x;

        if (cut.family === 'apt') {
            const complex = this.complexOf(source, base);
            if (complex === 'covered') shown = false;
            else if (complex) {
                ({ x, base } = complex);
                alpha = complex.alpha;
                footprint = 2 * TILE_UNIT * COMPLEX.footprint;
                height *= COMPLEX.height;
            }
        }

        if (shown) {
            const gx = Math.round((x - (footprint > TILE_UNIT ? TILE_UNIT / 2 : 0)) / TILE_UNIT);
            const gy = Math.round((base - TILE_UNIT / 2) / TILE_UNIT);
            const span = footprint > TILE_UNIT ? 2 : 1;
            for (let i = 0; i < span; i++) {
                for (let j = 0; j < span; j++) this.rises.set(`${gx + i},${gy - j}`, height * TILT);
            }
        }

        const y = base - footprint / 2;
        const depth = sortDepth(base);

        pile.copies.forEach((slice, i) => {
            slice.setVisible(shown);
            if (!shown) return;
            const h = (height * i) / cut.slices;
            slice.setDisplaySize(footprint, footprint);
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
        const style = pile.style as TokenStyle;
        const shown = inView && source.active && source.visible && source.alpha > 0;
        const top = pile.copies.length - 1;
        // Lean the drawing as the city leans at its middle height.
        const mid = (source.displayHeight * style.grow) / 2;
        const dx = (source.x - cx) * mid * this.lean;
        const dy = (source.y - cy) * mid * this.lean;

        pile.copies.forEach((copy, i) => {
            copy.setVisible(shown);
            if (!shown) return;
            const taper = 1 - (1 - style.taper) * (i / top);
            copy.setTexture(source.texture.key, source.frame.name);
            copy.setOrigin(source.originX, source.originY);
            copy.setScale(source.scaleX * taper * style.grow, source.scaleY * taper * style.grow);
            copy.setFlip(source.flipX, source.flipY);
            copy.setAngle(source.angle);
            copy.setAlpha(source.alpha);
            copy.setPosition(source.x + dx, source.y + dy + (top - i) * style.step);
            setDepthIfChanged(copy, source.depth - (top - i) * 0.0001);

            if (i === top) {
                if (source.isTinted) copy.setTint(source.tintTopLeft);
                else copy.clearTint();
            } else if (style.fills) {
                copy.setTintFill(style.fills[Math.min(i, style.fills.length - 1)]);
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
            const cut = pile.cut;
            if (!cut || !source.active) return;
            let footprint = source.displayWidth * cut.widthShare;
            let height = source.displayHeight * cut.heightShare * HEIGHT_SHARE[cut.family];
            let base = source.y + source.displayHeight * (1 - source.originY);
            let x = source.x;
            if (cut.family === 'apt') {
                const complex = this.complexOf(source, base);
                if (complex === 'covered') return;
                if (complex) {
                    ({ x, base } = complex);
                    footprint = 2 * TILE_UNIT * COMPLEX.footprint;
                    height *= COMPLEX.height;
                }
            }
            visit(x, base - footprint / 2, footprint, height * TILT);
        });
    }

    destroy(): void {
        this.scene.sys.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
        this.piles.forEach((pile) => pile.copies.forEach((copy) => copy.destroy()));
        this.piles.clear();
    }
}
