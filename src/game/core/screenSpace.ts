import Phaser from 'phaser';

export interface Viewport {
    /** Where to place a UI object so its local origin lands on the screen's. */
    x: number;
    y: number;
    /** Scale that cancels the camera zoom, so local units are screen pixels. */
    scale: number;
    /** Screen size in pixels — the space a UI layer should lay itself out in. */
    width: number;
    height: number;
}

/**
 * Makes a scroll-locked object draw in real screen pixels.
 *
 * `setScrollFactor(0)` stops an object following the world, but it does *not*
 * exempt it from the camera's zoom: Phaser's camera matrix scales everything
 * about the viewport centre. So a full-screen overlay sized to `camera.width`
 * only covers the screen while the zoom happens to be exactly 1 — at the 0.93
 * of a jump it shrinks and leaves a gap all the way around, and at the 0.5 used
 * on mobile the whole HUD is half size and in the wrong place.
 *
 * Placing a UI object at this position with this scale undoes the zoom exactly,
 * so its local coordinates become screen coordinates: draw at (0, 0) and it is
 * the top-left corner of the viewport, whatever the camera is doing.
 */
export const viewportOf = (camera: Phaser.Cameras.Scene2D.Camera): Viewport => {
    const zoom = camera.zoom || 1;
    const inverse = 1 / zoom;

    return {
        x: (camera.width / 2) * (1 - inverse),
        y: (camera.height / 2) * (1 - inverse),
        scale: inverse,
        width: camera.width,
        height: camera.height
    };
};

/**
 * Puts a pinned object at a point measured in viewport pixels.
 *
 * `pinToScreen` puts an object at the viewport's own origin, which is what a
 * Graphics wants: everything it draws afterwards is in viewport pixels, and
 * the pin carries the lot. An object positioned individually — a Text, which
 * has nowhere to draw into — has to be told where that point *is*, and the
 * answer is not the number itself whenever the camera is zoomed.
 *
 * Writing the raw number worked at zoom 1 and quietly put the dialogue text
 * a few hundred pixels away from the dialogue box everywhere else, which is
 * to say on every desktop screen the game has ever been opened on.
 */
export const placeOnScreen = (
    target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.ScrollFactor,
    viewport: Viewport,
    x: number,
    y: number
): void => {
    target.setScrollFactor(0);
    target.setPosition(viewport.x + x * viewport.scale, viewport.y + y * viewport.scale);
    target.setScale(viewport.scale);
};

/** Pins a UI object to the viewport so it renders 1:1 in screen pixels. */
export const pinToScreen = (
    target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.ScrollFactor,
    viewport: Viewport
): void => {
    target.setScrollFactor(0);
    target.setPosition(viewport.x, viewport.y);
    target.setScale(viewport.scale);
};
