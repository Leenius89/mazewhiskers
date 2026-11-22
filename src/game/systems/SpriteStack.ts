import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { sortDepth } from '../core/depth';

/**
 * Trial: buildings drawn as stacked slices instead of one painted sprite.
 *
 * Only with `?stack` in the address. The original building sprite stays where it
 * was, made transparent, so collisions, occlusion, culling and the towers that
 * replace buildings all carry on reading it. Each building gets a pile of flat
 * slices over its footprint; a slice at height h is pushed up by h, and away
 * from the middle of the screen in proportion to h, so the city leans like a
 * camera looking down on it. `?stack=flat` drops the lean, to compare.
 *
 * ponytail: slices are plain generated squares, not art. If the look earns its
 * keep, real slices (voxel export) replace the two textures and nothing else.
 */

const FLOORS = 6;
/** Screen pixels a slice rises per world pixel of height. */
const TILT = 0.55;
/** How far a slice leans per pixel of height and pixel off the screen's middle. */
const LEAN = 0.0012;
/** Drawn height as a share of the old sprite's drawn height. */
const HEIGHT_SHARE = 0.75;
const TINTS = [0x8a4b3c, 0x6f5a4a, 0x7b6f86];
const ROOF_TINTS = [0xd8b48c, 0xc9bca8, 0xb9b2cc];

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

interface Pile {
    wall: Phaser.GameObjects.Sprite;
    slices: Phaser.GameObjects.Image[];
    heights: number[];
}

export class SpriteStack {
    private readonly scene: Phaser.Scene;
    private readonly piles: Pile[] = [];
    private readonly lean: number;

    constructor(scene: Phaser.Scene, walls: Phaser.GameObjects.Group) {
        this.scene = scene;
        this.lean = isFlat() ? 0 : LEAN;
        const size = Math.round(GameConfig.TILE_SIZE * GameConfig.SPACING * GameConfig.WALL_OVERLAP);
        this.makeTextures(size);

        for (const child of walls.getChildren() as Phaser.GameObjects.Sprite[]) {
            const type = Number(String(child.texture.key).slice(-1)) || 1;
            const height = child.displayHeight * HEIGHT_SHARE;
            const slices: Phaser.GameObjects.Image[] = [];
            const heights: number[] = [];

            for (let i = 0; i <= FLOORS; i++) {
                const roof = i === FLOORS;
                const slice = scene.add.image(child.x, child.y, roof ? 'stack-roof' : 'stack-floor');
                // Lower floors darker, so the sides read as walls going down.
                const shade = roof ? 1 : 0.55 + (0.45 * i) / FLOORS;
                const base = Phaser.Display.Color.IntegerToColor((roof ? ROOF_TINTS : TINTS)[type - 1] ?? TINTS[0]);
                slice.setTint(
                    Phaser.Display.Color.GetColor(base.red * shade, base.green * shade, base.blue * shade)
                );
                slice.setDepth(sortDepth(child.y) + i * 0.001);
                slices.push(slice);
                heights.push((height * i) / FLOORS);
            }

            child.setAlpha(0);
            this.piles.push({ wall: child, slices, heights });
        }
    }

    /** A white square with a darker rim (floors) or a rooftop (roof), to be tinted. */
    private makeTextures(size: number): void {
        if (this.scene.textures.exists('stack-floor')) return;

        const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0x999999).fillRect(0, 0, size, size);
        g.fillStyle(0xffffff).fillRect(3, 3, size - 6, size - 6);
        g.generateTexture('stack-floor', size, size);

        g.clear();
        g.fillStyle(0xbbbbbb).fillRect(0, 0, size, size);
        g.fillStyle(0xffffff).fillRect(4, 4, size - 8, size - 8);
        g.fillStyle(0xcccccc).fillRect(size * 0.6, size * 0.15, size * 0.22, size * 0.22);
        g.generateTexture('stack-roof', size, size);
        g.destroy();
    }

    update(): void {
        const view = this.scene.cameras.main.worldView;
        const cx = view.centerX;
        const cy = view.centerY;
        const half = (GameConfig.TILE_SIZE * GameConfig.SPACING) / 2;

        for (let p = this.piles.length - 1; p >= 0; p--) {
            const { wall, slices, heights } = this.piles[p];

            // A tower took the cell: the building is gone, and so is its pile.
            if (!wall.active) {
                for (const s of slices) s.destroy();
                this.piles.splice(p, 1);
                continue;
            }

            const shown = wall.visible;
            const x = wall.x;
            const y = wall.y - half;
            for (let i = 0; i < slices.length; i++) {
                const slice = slices[i];
                slice.setVisible(shown);
                if (!shown) continue;
                const h = heights[i];
                slice.setPosition(x + (x - cx) * h * this.lean, y + (y - cy) * h * this.lean - h * TILT);
            }
        }
    }

    destroy(): void {
        for (const pile of this.piles) for (const s of pile.slices) s.destroy();
        this.piles.length = 0;
    }
}
