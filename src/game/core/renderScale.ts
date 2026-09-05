/**
 * How many device pixels the game draws per CSS pixel.
 *
 * Phaser's RESIZE mode sizes the canvas backing store in CSS pixels, so on a
 * phone reporting a device pixel ratio of 2 or 3 the whole game was rendered at
 * a third of the screen's real resolution and stretched back up by the browser.
 * Nothing was wrong with the layout; every edge in it was simply being drawn
 * once and displayed three times. That is the entire reason the game looked
 * softer on a phone than on a monitor.
 *
 * The fix is to hand Phaser a canvas that many times larger and shrink it back
 * with CSS. Two consequences follow, and both are handled rather than hidden:
 *
 *  - The camera zoom is multiplied by this, so the world keeps its framing and
 *    is merely drawn at higher resolution (see GameScene's `baseZoom`).
 *  - Every interface measurement is now in device pixels rather than CSS ones,
 *    so `uiScale` folds this in and the whole interface is measured against it.
 *
 * Capped at 2. Three times the pixels is three times the fill rate for a
 * difference almost nobody can see, and phones are where the frame budget is
 * tightest.
 */
const MAX_RENDER_SCALE = 2;

const detect = (): number => {
    try {
        const ratio = window.devicePixelRatio || 1;
        return Math.min(Math.max(ratio, 1), MAX_RENDER_SCALE);
    } catch {
        return 1;
    }
};

/**
 * Read once, at module load.
 *
 * Dragging a window between a retina and a non-retina monitor changes the ratio
 * mid-run, and rebuilding the canvas underneath a running game to chase it would
 * cost more than the sharpness is worth. A reload picks up the new one.
 */
export const RENDER_SCALE = detect();
