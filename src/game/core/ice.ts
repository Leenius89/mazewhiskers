import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { TILE_UNIT, cellOf } from './grid';
import type { GameScene } from '../scenes/GameScene';

/**
 * What the ice does, written once for everything that stands on it.
 *
 * The cat and the thing chasing it obey the same street. That is the whole
 * reason this is a module rather than a method: a slide the player can read
 * on themselves and not on the black cat would be a trick rather than a rule,
 * and the moment the two differed the ice would stop being a place and start
 * being a mechanic that happens to the player.
 */

/** Anything the ice can take: a sprite with feet and a body. */
export interface Slippery {
    x: number;
    y: number;
    groundY: number;
    body: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | null;
}

/**
 * The nearest of the four directions, or null for nothing worth calling one.
 *
 * Alleys run on a grid, so a diagonal slide would carry a body into a corner
 * it never steered for. The dominant axis is the one it was mostly going.
 */
export const axisOf = (x: number, y: number): Phaser.Math.Vector2 | null => {
    if (x === 0 && y === 0) return null;

    return Math.abs(x) >= Math.abs(y)
        ? new Phaser.Math.Vector2(Math.sign(x), 0)
        : new Phaser.Math.Vector2(0, Math.sign(y));
};

/**
 * Whether a body standing here would be carried off in `dir`.
 *
 * False where there is nowhere to be carried to — stopped against a building
 * or a tower — so a body that has slid into a wall stays where it landed
 * instead of grinding against it for the rest of the run.
 */
export const iceTakes = (scene: GameScene, from: Slippery, dir: Phaser.Math.Vector2): boolean => {
    const here = cellOf(from.x, from.groundY);
    if (!scene.isIce(here.gx, here.gy)) return false;

    const gx = here.gx + dir.x;
    const gy = here.gy + dir.y;
    if (scene.maze?.[gy]?.[gx] !== 0) return false;
    return !scene.apartmentSystem?.isCellBuilt(gx, gy);
};

/**
 * The velocity a slide wants this frame, or null when the slide is over.
 *
 * Two ends, and no third: the first ordinary cell reached, or whatever the
 * body has slid into. Nothing pressed in between changes either.
 */
export const slideVelocity = (
    scene: GameScene,
    sliding: Slippery,
    dir: Phaser.Math.Vector2
): Phaser.Math.Vector2 | null => {
    const here = cellOf(sliding.x, sliding.groundY);
    if (!scene.isIce(here.gx, here.gy)) return null;

    // Actually touching something, rather than merely approaching it: a body
    // has to reach the wall at the end of a run, not stop a cell short.
    const body = sliding.body as Phaser.Physics.Arcade.Body | null;
    const jammed = body
        ? (dir.x < 0 && body.blocked.left) ||
          (dir.x > 0 && body.blocked.right) ||
          (dir.y < 0 && body.blocked.up) ||
          (dir.y > 0 && body.blocked.down)
        : false;
    if (jammed) return null;

    const speed = GameConfig.ICE.SPEED;
    const pull = GameConfig.ICE.CENTRING;

    // Held to the middle of the lane. Entering a slide a few pixels off centre
    // would otherwise scrape a body along a building for the whole run, which
    // reads as being stuck rather than as being carried.
    if (dir.x !== 0) {
        const lane = Math.round(sliding.groundY / TILE_UNIT) * TILE_UNIT;
        return new Phaser.Math.Vector2(
            dir.x * speed,
            Phaser.Math.Clamp((lane - sliding.y) * pull, -speed, speed)
        );
    }

    const lane = Math.round(sliding.x / TILE_UNIT) * TILE_UNIT;
    return new Phaser.Math.Vector2(
        Phaser.Math.Clamp((lane - sliding.x) * pull, -speed, speed),
        dir.y * speed
    );
};
