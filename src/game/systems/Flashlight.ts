import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import { isOpen, TILE_UNIT } from '../core/grid';
import type { GameScene } from '../scenes/GameScene';

/** Texels across the light's picture: chunky on purpose, so the light is pixels too. */
const TEXELS = 160;
/** Light levels the falloff is stepped into, the way pixel art shades. */
const LEVELS = 6;
/** Rays cast round the cat each frame. */
const RAYS = 480;
const WARM = 0xffc86e;

/**
 * Nightmare's light, for the stacked city (`?stack`): a torch held at the cat.
 *
 * The cell-shaped fog stays as the dark, and this cuts the lit part out of it
 * every frame: rays cast from the cat stop at the first building, so the light
 * is the shape of the streets it can reach and every building throws a hard
 * shadow away from the cat. The faces of buildings turned towards the cat are
 * lit up their height; roofs stay dark, since a torch at a cat's height cannot
 * reach them. Inside the lit shape a stepped cone sets how bright: hot ahead,
 * fading with distance and off to the sides, with a dim pool around the cat.
 */
export class Flashlight {
    private readonly scene: GameScene;
    private readonly riseAt: (gx: number, gy: number) => number;
    private readonly shape: Phaser.GameObjects.Graphics;
    private readonly dark: Phaser.GameObjects.Image;
    private readonly glow: Phaser.GameObjects.Image;
    /** Cuts the light out of the fog. */
    readonly hole: Phaser.Display.Masks.GeometryMask;
    private readonly reach = (GameConfig.FOG.SIGHT_CELLS + 0.5) * TILE_UNIT;

    constructor(scene: GameScene, riseAt: (gx: number, gy: number) => number) {
        this.scene = scene;
        this.riseAt = riseAt;
        this.shape = scene.make.graphics({}, false);
        this.hole = this.shape.createGeometryMask().setInvertAlpha(true);
        const inside = this.shape.createGeometryMask();

        const { dark, glow } = this.bake(scene);
        const scale = (this.reach * 2) / TEXELS;
        this.dark = scene.add.image(0, 0, dark).setScale(scale).setDepth(DEPTH.OVERLAY - 19).setMask(inside);
        this.glow = scene.add
            .image(0, 0, glow)
            .setScale(scale)
            .setDepth(DEPTH.OVERLAY - 18)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setMask(inside);
    }

    update(): void {
        const player = this.scene.player;
        const shown = !!player && !this.scene.narrativeActive;
        this.dark.setVisible(shown);
        this.glow.setVisible(shown);
        if (!player || !shown) return;

        const x = player.x;
        const y = player.groundY;
        const facing = player.facingAngle;
        this.dark.setPosition(x, y).setRotation(facing);
        this.glow.setPosition(x, y).setRotation(facing);

        // Rays only need to run as far as the light carries that way.
        const wide = Phaser.Math.DegToRad(GameConfig.FOG.CONE_HALF_ANGLE_DEG + 20);
        const pool = GameConfig.FOG.NEAR_CELLS * TILE_UNIT * 1.2;
        const hits: { x: number; y: number; face: number }[] = [];
        for (let i = 0; i < RAYS; i++) {
            const angle = facing + (i / RAYS) * Math.PI * 2;
            const ahead = Math.abs(Phaser.Math.Angle.Wrap(angle - facing)) <= wide;
            hits.push(this.cast(x, y, angle, ahead ? this.reach : pool));
        }

        const g = this.shape.clear().fillStyle(0xffffff);
        g.beginPath();
        hits.forEach((h, i) => (i ? g.lineTo(h.x, h.y) : g.moveTo(h.x, h.y)));
        g.closePath().fillPath();

        // Faces turned to the cat, lit up their height between neighbouring rays.
        hits.forEach((a, i) => {
            const b = hits[(i + 1) % RAYS];
            if (!a.face || !b.face || a.y !== b.y) return;
            g.fillPoints(
                [
                    { x: a.x, y: a.y },
                    { x: b.x, y: b.y },
                    { x: b.x, y: b.y - b.face },
                    { x: a.x, y: a.y - a.face }
                ],
                true
            );
        });
    }

    /**
     * Walks a ray cell by cell to the first building, or to `length`. `face` is
     * the drawn height of the wall it struck when that wall faces the camera.
     */
    private cast(x: number, y: number, angle: number, length: number): { x: number; y: number; face: number } {
        const maze = this.scene.maze;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        // Cell gx spans [gx - 0.5, gx + 0.5) in cell units.
        const u = x / TILE_UNIT + 0.5;
        const v = y / TILE_UNIT + 0.5;
        let gx = Math.floor(u);
        let gy = Math.floor(v);
        const stepX = dx > 0 ? 1 : -1;
        const stepY = dy > 0 ? 1 : -1;
        const deltaX = Math.abs(1 / dx);
        const deltaY = Math.abs(1 / dy);
        let nextX = (dx > 0 ? gx + 1 - u : u - gx) * deltaX;
        let nextY = (dy > 0 ? gy + 1 - v : v - gy) * deltaY;
        const end = length / TILE_UNIT;

        // Bounded: a ray straight along a grid line has an infinite step one way.
        for (let n = 0; n < 64; n++) {
            const alongY = nextY < nextX;
            const t = alongY ? nextY : nextX;
            if (t >= end) break;
            if (alongY) {
                gy += stepY;
                nextY += deltaY;
            } else {
                gx += stepX;
                nextX += deltaX;
            }
            if (isOpen(maze, gx, gy)) continue;
            const face = alongY && stepY < 0 ? this.riseAt(gx, gy) : 0;
            return { x: x + dx * t * TILE_UNIT, y: y + dy * t * TILE_UNIT, face };
        }
        return { x: x + dx * length, y: y + dy * length, face: 0 };
    }

    /**
     * The light as two pictures facing +x: the dark left inside the lit shape,
     * and the warm glow added over it. Stepped into a few levels.
     */
    private bake(scene: Phaser.Scene): { dark: string; glow: string } {
        const fog = GameConfig.FOG;
        const half = Phaser.Math.DegToRad(fog.CONE_HALF_ANGLE_DEG);
        const soft = Phaser.Math.DegToRad(18);
        const pool = (fog.NEAR_CELLS * TILE_UNIT) / this.reach;
        const smooth = (from: number, to: number, at: number): number => {
            const k = Phaser.Math.Clamp((at - from) / (to - from), 0, 1);
            return k * k * (3 - 2 * k);
        };
        const light = (px: number, py: number): number => {
            const nx = (px + 0.5) / TEXELS - 0.5;
            const ny = (py + 0.5) / TEXELS - 0.5;
            const d = Math.hypot(nx, ny) * 2;
            const off = Math.abs(Math.atan2(ny, nx));
            const cone = smooth(half + soft, half - soft, off) * (1 - smooth(0.5, 1, d));
            const hot = smooth(Phaser.Math.DegToRad(28), 0, off) * (1 - smooth(0.2, 0.85, d));
            const around = (1 - smooth(pool * 0.5, pool, d)) * 0.7;
            const level = Math.min(1, Math.max(cone * 0.75 + hot * 0.25, around));
            return Math.round(level * LEVELS) / LEVELS;
        };

        const paint = (key: string, pixel: (level: number) => [number, number, number, number]): string => {
            const canvas = document.createElement('canvas');
            canvas.width = TEXELS;
            canvas.height = TEXELS;
            const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
            const image = ctx.createImageData(TEXELS, TEXELS);
            for (let py = 0; py < TEXELS; py++) {
                for (let px = 0; px < TEXELS; px++) {
                    image.data.set(pixel(light(px, py)), (py * TEXELS + px) * 4);
                }
            }
            ctx.putImageData(image, 0, 0);
            if (scene.textures.exists(key)) scene.textures.remove(key);
            scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
            return key;
        };

        const c = Phaser.Display.Color.IntegerToRGB(fog.COLOR);
        const w = Phaser.Display.Color.IntegerToRGB(WARM);
        return {
            dark: paint('flashlight-dark', (l) => [c.r, c.g, c.b, Math.round(255 * fog.UNKNOWN_ALPHA * (1 - l))]),
            glow: paint('flashlight-glow', (l) => [w.r, w.g, w.b, Math.round(255 * 0.7 * l * l)])
        };
    }

    destroy(): void {
        this.dark.destroy();
        this.glow.destroy();
        this.shape.destroy();
    }
}
