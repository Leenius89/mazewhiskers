import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';

/**
 * The canvas width every interface measurement in this game was written for.
 */
export const REFERENCE_WIDTH = 768;

/**
 * How far the interface is allowed to be scaled up on a narrow canvas.
 *
 * A phone canvas comes out around 337 wide, which is 44% of the reference. Held
 * to the same share of the screen the interface would have to be drawn at 2.3x,
 * and that is too much — a phone is held closer than a kiosk monitor, so it does
 * not need the full correction to read at the same effort. It needs most of it.
 *
 * The first attempt at this used 1.15x, which is barely half the distance and is
 * why everything still looked small: the text grew by a sixth while the screen
 * it sat on had shrunk by more than half.
 */
const MAX_SCALE = 1.55;

/**
 * One number the whole interface is drawn against.
 *
 * Returns exactly 1 at or above the reference width, so the exhibition build is
 * untouched by any of this.
 */
export const uiScale = (camera: Phaser.Cameras.Scene2D.Camera): number => {
    if (!camera || camera.width >= REFERENCE_WIDTH) return 1;
    return Phaser.Math.Clamp(REFERENCE_WIDTH / camera.width, 1, MAX_SCALE);
};

/** Any interface length — a bar, a gap, a radius — at this screen's size. */
export const ui = (base: number, camera: Phaser.Cameras.Scene2D.Camera): number => base * uiScale(camera);

/** Font size for an element, given the size it wants at the reference width. */
export const fontPx = (base: number, camera: Phaser.Cameras.Scene2D.Camera): string =>
    `${Math.round(base * uiScale(camera))}px`;

/**
 * How wide one minimap cell may be drawn.
 *
 * The one part of the interface that does not grow on a phone. It is a corner
 * ornament, and at three pixels a cell it was taking 44% of the screen width —
 * playfield, not decoration. Capped as a share of the canvas instead.
 */
export const minimapCell = (camera: Phaser.Cameras.Scene2D.Camera): number => {
    const cfg = GameConfig.HUD.MINIMAP;
    const capped = (camera.width * cfg.MAX_WIDTH_FRACTION) / GameConfig.MAZE_SIZE;
    return Math.min(cfg.CELL, capped);
};

/** Widest a speech bubble may wrap: big enough for the larger type, still on screen. */
export const barkWrapWidth = (camera: Phaser.Cameras.Scene2D.Camera): number =>
    Math.min(ui(GameConfig.BARKS.MAX_WIDTH, camera), camera.width * GameConfig.BARKS.MAX_WIDTH_FRACTION);
