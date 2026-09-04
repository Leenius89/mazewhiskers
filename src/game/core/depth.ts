import Phaser from 'phaser';

/**
 * One depth axis for the whole world.
 *
 * Before Phase 1 three different units shared this axis — grid rows (0-40) for
 * buildings, the constant 21 for the player, 99999 for the enemy and 1000+ for
 * apartments. Nothing could sort against anything else, so the cat was drawn in
 * front of half the city and behind the other half regardless of where it stood.
 *
 * Now every world object sorts by the same number: the world Y of the point
 * where it touches the ground. Occlusion then falls out for free — walk behind
 * a tower and the tower is drawn over you, because its feet are further down
 * the screen than yours.
 */
export const DEPTH = {
    /** Flat ground decals: shadows, markers. Always under everything. */
    GROUND: 100,
    /** Base for y-sorted world objects. World Y is added to this. */
    SORTED: 1_000,
    /** Above the whole world: silhouettes, goal arrow, screen effects. */
    OVERLAY: 900_000,
    /** `?debug=1` instrumentation. */
    DEBUG: 1_000_000
} as const;

/** World Y of a sprite's ground contact — its bottom edge. */
export const footY = (sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image): number =>
    sprite.y + sprite.displayHeight * (1 - sprite.originY);

/** Depth for an object whose feet are at `y`. */
export const sortDepth = (y: number): number => DEPTH.SORTED + y;

/**
 * Sorts a sprite by its own feet.
 *
 * Call once for anything that never moves, every frame for anything that does.
 */
export const applySortDepth = (sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image): void => {
    sprite.setDepth(sortDepth(footY(sprite)));
};
