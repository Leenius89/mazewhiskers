import Phaser from 'phaser';

/**
 * Collision-body helpers.
 *
 * Arcade Physics has two body types with *different unit conventions*, which is
 * what every hitbox in this game got wrong before Phase 1:
 *
 *   Dynamic `Body`
 *     - `setSize(w, h)` treats w/h as SOURCE pixels and stores `width = w * scaleX`.
 *       Passing already-scaled values applies the scale twice.
 *     - `offset` is in SOURCE pixels and is multiplied by the scale when the
 *       body is positioned.
 *
 *   `StaticBody`
 *     - `setSize(w, h)` treats w/h as WORLD pixels — no scale is applied.
 *     - `setOffset(x, y)` is in WORLD pixels, and *shifts* the body by the
 *       difference from the current offset rather than setting an absolute one.
 *     - `setScale()` does not refresh a static body at all, so its position can
 *       be left over from before the scale was applied.
 *
 * Everything below takes plain world pixels and converts as each type requires.
 */

/**
 * In a 3/4 top-down view, only the feet collide. A box around the whole sprite
 * makes a character shove walls with its head.
 */
export interface FootBodyOptions {
    /** Body width in world pixels. */
    width: number;
    /** Body height in world pixels. */
    height: number;
    /** Gap between the body's bottom edge and the sprite's bottom, in world pixels. */
    footInset?: number;
}

/**
 * Gives a dynamic sprite a foot-aligned box.
 *
 * The offset formula is independent of the sprite's origin: the origin term
 * cancels between the body's top-left and the sprite's bottom edge.
 */
export const setFootBody = (sprite: Phaser.Physics.Arcade.Sprite, options: FootBodyOptions): void => {
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    const { width, height, footInset = 0 } = options;
    const scaleX = Math.abs(sprite.scaleX) || 1;
    const scaleY = Math.abs(sprite.scaleY) || 1;

    // Source pixels, because a dynamic body multiplies by the scale itself.
    const sourceWidth = width / scaleX;
    const sourceHeight = height / scaleY;

    body.setSize(sourceWidth, sourceHeight, false);
    body.setOffset((sprite.width - sourceWidth) / 2, sprite.height - (height + footInset) / scaleY);
};

/**
 * Gives a static sprite a foot-aligned box.
 *
 * `refreshBody()` first, so the body's position reflects the scale that was
 * applied after it was created; then the body is moved to the measured target
 * rather than trusting the stale `offset` value.
 */
export const setStaticFootBody = (sprite: Phaser.Physics.Arcade.Sprite, options: FootBodyOptions): void => {
    sprite.refreshBody();

    const body = sprite.body as Phaser.Physics.Arcade.StaticBody | null;
    if (!body) return;

    const { width, height, footInset = 0 } = options;
    const topLeft = sprite.getTopLeft();

    const targetX = (topLeft.x ?? 0) + (sprite.displayWidth - width) / 2;
    const targetY = (topLeft.y ?? 0) + sprite.displayHeight - height - footInset;

    body.setSize(width, height, false);
    body.setOffset(body.offset.x + (targetX - body.position.x), body.offset.y + (targetY - body.position.y));
};

/** Static box covering the whole sprite — for tiles that *are* their own footprint. */
export const setStaticFullBody = (sprite: Phaser.Physics.Arcade.Sprite, width: number, height: number): void => {
    sprite.refreshBody();

    const body = sprite.body as Phaser.Physics.Arcade.StaticBody | null;
    if (!body) return;

    const topLeft = sprite.getTopLeft();
    const targetX = (topLeft.x ?? 0) + (sprite.displayWidth - width) / 2;
    const targetY = (topLeft.y ?? 0) + (sprite.displayHeight - height) / 2;

    body.setSize(width, height, false);
    body.setOffset(body.offset.x + (targetX - body.position.x), body.offset.y + (targetY - body.position.y));
};

/**
 * Circular body centred on the sprite, sized in world pixels.
 *
 * Used for pickups, which are deliberately far more generous than they look —
 * the player should never feel they walked through a fish.
 */
export const setCircleBody = (sprite: Phaser.Physics.Arcade.Sprite, worldRadius: number): void => {
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    const scale = Math.abs(sprite.scaleX) || 1;
    const sourceRadius = worldRadius / scale;

    body.setCircle(sourceRadius, sprite.width / 2 - sourceRadius, sprite.height / 2 - sourceRadius);
};
