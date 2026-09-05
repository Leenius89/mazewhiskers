import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { RENDER_SCALE } from './renderScale';
import { isMobileDevice } from '../systems/InputManager';

/**
 * The canvas width every interface measurement in this game was written for.
 */
export const REFERENCE_WIDTH = 768;

/**
 * How far the interface is allowed to be scaled up on a narrow canvas.
 *
 * A phone canvas comes out around 337 CSS pixels wide, 44% of the reference.
 * Held to the same share of the screen the interface would have to be drawn at
 * 2.3x, and that is too much — a phone is held closer than a kiosk monitor, so
 * it does not need the full correction. It needs most of it.
 */
const MAX_SCALE = 1.55;

/** Camera zoom the scene starts at, before any punch-in or punch-out. */
const baseZoom = (): number =>
    isMobileDevice() ? GameConfig.CAMERA.MOBILE.ZOOM : GameConfig.CAMERA.DESKTOP.ZOOM;

/** CSS pixels across, whatever resolution the canvas is drawn at. */
const cssWidth = (camera: Phaser.Cameras.Scene2D.Camera): number => camera.width / RENDER_SCALE;

/**
 * How much bigger the interface has to be drawn on this screen, in CSS terms.
 *
 * This is the readability correction and nothing else: 1 on a monitor, up to
 * MAX_SCALE on a phone. The two scales below each turn it into the units their
 * own objects are measured in.
 */
const layoutScale = (camera: Phaser.Cameras.Scene2D.Camera): number => {
    const width = cssWidth(camera);
    if (width >= REFERENCE_WIDTH) return 1;
    return Phaser.Math.Clamp(REFERENCE_WIDTH / width, 1, MAX_SCALE);
};

/**
 * Scale for interface pinned to the screen — the dialogue box, the HUD.
 *
 * `pinToScreen` cancels the camera zoom, which leaves one local unit equal to
 * one canvas pixel. Canvas pixels are device pixels now, so the render scale is
 * part of every length: without it a sharper canvas would simply draw the whole
 * interface at half the size.
 */
export const uiScale = (camera: Phaser.Cameras.Scene2D.Camera): number =>
    camera ? RENDER_SCALE * layoutScale(camera) : RENDER_SCALE;

/**
 * Scale for interface that lives in the world — the health bar over the cat's
 * head, the speech bubbles, the sweat.
 *
 * These are drawn through the camera, so its zoom has already been applied to
 * them by the time they reach the screen. Multiplying by the render scale here
 * as well would count it twice; dividing by the base zoom is what actually
 * matters, and it is why the jump dots were half size on a phone — the mobile
 * camera sits at 0.5 and nothing compensated for it.
 */
export const worldUiScale = (camera: Phaser.Cameras.Scene2D.Camera): number =>
    camera ? layoutScale(camera) / baseZoom() : 1;

/** Any screen-pinned interface length at this screen's size. */
export const ui = (base: number, camera: Phaser.Cameras.Scene2D.Camera): number => base * uiScale(camera);

/** Any world-space interface length at this screen's size. */
export const worldUi = (base: number, camera: Phaser.Cameras.Scene2D.Camera): number =>
    base * worldUiScale(camera);

/** Font size for a screen-pinned element. */
export const fontPx = (base: number, camera: Phaser.Cameras.Scene2D.Camera): string =>
    `${Math.round(base * uiScale(camera))}px`;

/** Font size for an element that lives in the world. */
export const worldFontPx = (base: number, camera: Phaser.Cameras.Scene2D.Camera): string =>
    `${Math.round(base * worldUiScale(camera))}px`;

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
    return Math.min(ui(cfg.CELL, camera), capped);
};

/**
 * Widest a speech bubble may wrap.
 *
 * The cap is a share of the screen, converted into the world units the bubble
 * is actually measured in — a world length of W covers `W * zoom` of the
 * canvas.
 */
export const barkWrapWidth = (camera: Phaser.Cameras.Scene2D.Camera): number => {
    const onScreen = (camera.width * GameConfig.BARKS.MAX_WIDTH_FRACTION) / (camera.zoom || 1);
    return Math.min(worldUi(GameConfig.BARKS.MAX_WIDTH, camera), onScreen);
};
