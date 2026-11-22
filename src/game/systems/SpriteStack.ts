import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { sortDepth } from '../core/depth';

/**
 * Trial: the city drawn as stacked slices. Only with `?stack` in the address.
 *
 * Every original sprite stays where it is and keeps doing its job — collision,
 * occlusion, culling, tweens, the towers that replace buildings — but is hidden
 * from the main camera. What the camera sees instead is a pile of copies:
 *
 * - blocks (buildings, towers): flat slices over the footprint, each lifted by
 *   its height and pushed away from the middle of the screen in proportion to
 *   it, so the city leans like a camera looking down on it;
 * - tokens (cats, milk, fish): the sprite's own frame stacked a few times, the
 *   lower copies darker, so a flat drawing gets thickness, and the whole pile
 *   leans with the city at its middle height.
 *
 * `?stack=flat` drops the lean, to compare.
 *
 * ponytail: slices are generated squares, not art. If the look earns its keep,
 * real slices (voxel export) replace the textures and nothing else.
 */

/** Screen pixels a slice rises per pixel of height. */
const TILT = 0.55;
/** How far a slice leans per pixel of height and pixel off the screen's middle. */
const LEAN = 0.0012;
/** Drawn height of a block as a share of the old sprite's drawn height. */
const HEIGHT_SHARE = 0.75;

const BUILDING = { floors: 6, tints: [0x8a4b3c, 0x6f5a4a, 0x7b6f86], roofs: [0xd8b48c, 0xc9bca8, 0xb9b2cc] };
const TOWER = { floors: 10, tints: [0xb8b4aa, 0xa9aeb6, 0xc4b7a4], roofs: [0xe6e2d8, 0xdfe3ea, 0xeadfcf] };

/** Copies under a token, and the screen pixels between them. */
const TOKEN_LAYERS = 4;
const TOKEN_STEP = 1.5;

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

interface Pile {
    kind: 'block' | 'token';
    copies: Phaser.GameObjects.Image[];
    /** Blocks: height of each slice. */
    heights: number[];
}

export interface StackSources {
    blocks: () => Source[];
    tokens: () => Source[];
}

const shade = (color: number, amount: number): number => {
    const c = Phaser.Display.Color.IntegerToColor(color);
    return Phaser.Display.Color.GetColor(c.red * amount, c.green * amount, c.blue * amount);
};

/**
 * Phaser re-sorts the whole display list whenever any depth is set, changed or
 * not; with thousands of slices that sort every frame cost most of the frame.
 */
const setDepthIfChanged = (object: Phaser.GameObjects.Image, depth: number): void => {
    if (object.depth !== depth) object.setDepth(depth);
};

const typeOf = (sprite: Source): number => Number(String(sprite.texture.key).slice(-1)) || 1;

export class SpriteStack {
    private readonly scene: Phaser.Scene;
    private readonly sources: StackSources;
    private readonly piles = new Map<Source, Pile>();
    private readonly lean: number;
    private readonly cameraId: number;

    constructor(scene: Phaser.Scene, sources: StackSources) {
        this.scene = scene;
        this.sources = sources;
        this.lean = isFlat() ? 0 : LEAN;
        this.cameraId = scene.cameras.main.id;
        this.makeTextures(Math.round(GameConfig.TILE_SIZE * GameConfig.SPACING * GameConfig.WALL_OVERLAP));
    }

    /** White squares with a rim, to be tinted: plain floors, tower floors with windows, a roof. */
    private makeTextures(size: number): void {
        if (this.scene.textures.exists('stack-floor')) return;
        const g = this.scene.make.graphics({ x: 0, y: 0 }, false);

        g.fillStyle(0x999999).fillRect(0, 0, size, size);
        g.fillStyle(0xffffff).fillRect(3, 3, size - 6, size - 6);
        g.generateTexture('stack-floor', size, size);

        g.clear();
        g.fillStyle(0x888888).fillRect(0, 0, size, size);
        g.fillStyle(0xffffff).fillRect(2, 2, size - 4, size - 4);
        g.fillStyle(0x6b7a8c);
        for (let i = 0; i < 5; i++) {
            const at = 8 + i * ((size - 16) / 4.5);
            g.fillRect(at, 2, 5, 3).fillRect(at, size - 5, 5, 3).fillRect(2, at, 3, 5).fillRect(size - 5, at, 3, 5);
        }
        g.generateTexture('stack-tower', size, size);

        g.clear();
        g.fillStyle(0xbbbbbb).fillRect(0, 0, size, size);
        g.fillStyle(0xffffff).fillRect(4, 4, size - 8, size - 8);
        g.fillStyle(0xcccccc).fillRect(size * 0.6, size * 0.15, size * 0.22, size * 0.22);
        g.generateTexture('stack-roof', size, size);
        g.destroy();
    }

    private hide(source: Source): void {
        // Off the main camera only: visible, alpha and angle stay the source's
        // own, for culling and tweens to drive and for the pile to copy.
        source.cameraFilter |= this.cameraId;
    }

    private makeBlock(source: Source): Pile {
        const tower = !this.isBuilding(source);
        const style = tower ? TOWER : BUILDING;
        const type = typeOf(source) - 1;
        const height = source.displayHeight * HEIGHT_SHARE;
        const copies: Phaser.GameObjects.Image[] = [];
        const heights: number[] = [];

        for (let i = 0; i <= style.floors; i++) {
            const roof = i === style.floors;
            const slice = this.scene.add.image(source.x, source.y, roof ? 'stack-roof' : tower ? 'stack-tower' : 'stack-floor');
            // Lower floors darker, so the sides read as walls going down.
            const tint = (roof ? style.roofs : style.tints)[type] ?? style.tints[0];
            slice.setTint(roof ? tint : shade(tint, 0.55 + (0.45 * i) / style.floors));
            if (tower) slice.setScale(GameConfig.APARTMENT.TILE_OVERLAP / GameConfig.WALL_OVERLAP);
            copies.push(slice);
            heights.push((height * i) / style.floors);
        }

        this.hide(source);
        return { kind: 'block', copies, heights };
    }

    private makeToken(source: Source): Pile {
        const copies: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i <= TOKEN_LAYERS; i++) copies.push(this.scene.add.image(source.x, source.y, source.texture.key));
        this.hide(source);
        return { kind: 'token', copies, heights: [] };
    }

    private isBuilding(source: Source): boolean {
        return String(source.texture.key).startsWith('building');
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

        for (const source of this.sources.tokens()) {
            seen.add(source);
            let pile = this.piles.get(source);
            if (!pile) {
                pile = this.makeToken(source);
                this.piles.set(source, pile);
            }
            const inView =
                source.x > view.x - pad && source.x < view.right + pad && source.y > view.y - pad && source.y < view.bottom + pad;
            this.placeToken(source, pile, cx, cy, inView);
        }

        // Gone from its group (a building a tower replaced, a fish eaten and freed).
        this.piles.forEach((pile, source) => {
            if (seen.has(source) && source.scene) return;
            for (const copy of pile.copies) copy.destroy();
            this.piles.delete(source);
        });
    }

    private placeBlock(source: Source, pile: Pile, cx: number, cy: number): void {
        const shown = source.active && source.visible && source.alpha > 0;
        const half = (GameConfig.TILE_SIZE * GameConfig.SPACING) / 2;
        const x = source.x;
        const y = source.y - half;
        const depth = sortDepth(source.y);

        pile.copies.forEach((slice, i) => {
            slice.setVisible(shown);
            if (!shown) return;
            const h = pile.heights[i];
            slice.setPosition(x + (x - cx) * h * this.lean, y + (y - cy) * h * this.lean - h * TILT);
            setDepthIfChanged(slice, depth + i * 0.001);
            slice.setAlpha(source.alpha);
            slice.setAngle(source.angle);
        });
    }

    private placeToken(source: Source, pile: Pile, cx: number, cy: number, inView: boolean): void {
        const shown = inView && source.active && source.visible && source.alpha > 0;
        const top = pile.copies.length - 1;
        // Lean the drawing as the city leans at its middle height.
        const mid = source.displayHeight / 2;
        const dx = (source.x - cx) * mid * this.lean;
        const dy = (source.y - cy) * mid * this.lean;

        pile.copies.forEach((copy, i) => {
            copy.setVisible(shown);
            if (!shown) return;
            copy.setTexture(source.texture.key, source.frame.name);
            copy.setOrigin(source.originX, source.originY);
            copy.setScale(source.scaleX, source.scaleY);
            copy.setFlip(source.flipX, source.flipY);
            copy.setAngle(source.angle);
            copy.setAlpha(source.alpha);
            copy.setPosition(source.x + dx, source.y + dy + (top - i) * TOKEN_STEP);
            setDepthIfChanged(copy, source.depth - (top - i) * 0.0001);

            if (i === top) {
                if (source.isTinted) copy.setTint(source.tintTopLeft);
                else copy.clearTint();
            } else {
                copy.setTint(shade(0xffffff, 0.35 + (0.35 * i) / top));
            }
        });
    }

    destroy(): void {
        this.piles.forEach((pile) => pile.copies.forEach((copy) => copy.destroy()));
        this.piles.clear();
    }
}
