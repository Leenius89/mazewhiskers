import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';

/**
 * The canvas width every interface measurement in this game was written for.
 *
 * On a phone the canvas is roughly 340 wide, which is where the numbers stopped
 * working: the minimap took 44% of the screen and the dialogue box kept its
 * fixed height while the text inside it wrapped to twice as many lines and ran
 * out of the bottom.
 */
export const REFERENCE_WIDTH = 768;

/** Nothing below this is readable at arm's length on a phone. */
const MIN_FONT_PX = 11;

/** Small screens get slightly larger type, not slightly smaller. */
const NARROW_TEXT_SCALE = 1.15;

const isNarrow = (camera: Phaser.Cameras.Scene2D.Camera): boolean => camera.width < REFERENCE_WIDTH;

/**
 * Font size for a UI element, given the size it wants at the reference width.
 *
 * Panels shrink with the canvas; text does the opposite. A phone screen is not
 * a small desktop screen viewed from the same distance — it is held closer, and
 * eight-pixel hint text that was fine on a kiosk monitor is unreadable there.
 *
 * At or above the reference width this returns the size unchanged, so the
 * exhibition build is not touched by any of it.
 */
export const fontPx = (base: number, camera: Phaser.Cameras.Scene2D.Camera): string => {
    if (!isNarrow(camera)) return `${base}px`;
    return `${Math.max(Math.round(base * NARROW_TEXT_SCALE), MIN_FONT_PX)}px`;
};

/**
 * How wide one minimap cell may be drawn.
 *
 * Capped as a fraction of the canvas rather than fixed, so the map stays a
 * corner ornament instead of becoming half the playfield.
 */
export const minimapCell = (camera: Phaser.Cameras.Scene2D.Camera): number => {
    const cfg = GameConfig.HUD.MINIMAP;
    const capped = (camera.width * cfg.MAX_WIDTH_FRACTION) / GameConfig.MAZE_SIZE;
    return Math.min(cfg.CELL, capped);
};

/** Widest a speech bubble may wrap, so it cannot span the whole phone. */
export const barkWrapWidth = (camera: Phaser.Cameras.Scene2D.Camera): number =>
    Math.min(GameConfig.BARKS.MAX_WIDTH, camera.width * GameConfig.BARKS.MAX_WIDTH_FRACTION);
