import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';

/** World pixels per grid cell. */
export const TILE_UNIT = GameConfig.TILE_SIZE * GameConfig.SPACING;

export interface Cell {
    gx: number;
    gy: number;
}

/** Nearest grid cell to a world point. Cell centres sit on multiples of TILE_UNIT. */
export const cellOf = (x: number, y: number): Cell => ({
    gx: Math.round(x / TILE_UNIT),
    gy: Math.round(y / TILE_UNIT)
});

export const worldOf = (cell: Cell): { x: number; y: number } => ({
    x: cell.gx * TILE_UNIT,
    y: cell.gy * TILE_UNIT
});

export const isOpen = (maze: number[][] | undefined, gx: number, gy: number): boolean =>
    maze?.[gy]?.[gx] === 0;

/**
 * Can a straight line between two world points reach the far end without
 * crossing a solid cell?
 *
 * This is what lets the player break line of sight by turning a corner — the
 * whole counterplay against the enemy rests on it. Walks the grid with a DDA
 * step rather than sampling at a fixed interval, so a thin wall can never be
 * skipped over.
 */
export const hasLineOfSight = (
    maze: number[][] | undefined,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
): boolean => {
    if (!maze) return true;

    const start = cellOf(fromX, fromY);
    const end = cellOf(toX, toY);

    let { gx, gy } = start;
    const dx = Math.abs(end.gx - gx);
    const dy = Math.abs(end.gy - gy);
    const stepX = gx < end.gx ? 1 : -1;
    const stepY = gy < end.gy ? 1 : -1;

    let error = dx - dy;
    // Bounded so a malformed grid cannot spin here.
    const maxSteps = dx + dy + 2;

    for (let i = 0; i < maxSteps; i++) {
        if (gx === end.gx && gy === end.gy) return true;

        // The origin cell is never a blocker: an actor standing in a doorway
        // should still be able to see out of it.
        if (!(gx === start.gx && gy === start.gy) && maze[gy]?.[gx] !== 0) return false;

        const doubled = error * 2;
        const stepsX = doubled > -dy;
        const stepsY = doubled < dx;

        /*
         * A diagonal step may not squeeze between two solid corners.
         *
         * Bresenham moves both axes in the same iteration when the error term
         * allows it, and the old loop tested only the cell it landed on. The
         * two cells it passed BETWEEN were never looked at — so a ray between
         * two diagonally-touching buildings reported clear sight straight
         * through the pair of them.
         *
         * That was not a cosmetic error. `Enemy.pursue` abandons its whole
         * route the moment this returns true and walks in a straight line, so
         * one false clear put a 48px body into a corner it could not pass and
         * left it there. It is also what nightmare's fog uses to decide what
         * the cat can see, which was lighting the insides of blocks.
         *
         * The diagonal is allowed only if at least one of the two cells beside
         * it is open — the same rule a body actually obeys.
         */
        if (stepsX && stepsY) {
            const sideA = maze[gy]?.[gx + stepX];
            const sideB = maze[gy + stepY]?.[gx];
            if (sideA !== 0 && sideB !== 0) return false;
        }

        if (stepsX) {
            error -= dy;
            gx += stepX;
        }
        if (stepsY) {
            error += dx;
            gy += stepY;
        }
    }

    return true;
};

/**
 * The cell an actor is physically standing in, judged from its body.
 *
 * `cellOf(x, groundY)` is the wrong question to ask about occupancy, and the
 * difference is not academic. An actor's foot body sits ABOVE its ground point:
 * the enemy's is 24px tall with a 4px inset, so it spans groundY-28 to
 * groundY-4. Rest that body against the north face of a building and physics
 * separates it so its bottom edge sits exactly on the wall's top edge — which
 * puts groundY four pixels INTO the wall's row. `cellOf` then rounds to the
 * solid cell and reports that the cat is inside a building it is merely
 * leaning on.
 *
 * Anything that then "rescues" it teleports a perfectly fine cat backwards,
 * every frame it touches a wall, which makes sliding along one impossible —
 * and sliding along a wall is how a steering agent gets past anything.
 *
 * The body's centre is in the cell the actor is really in. Use this wherever
 * the question is "is it inside something solid"; `cellOf` on the ground point
 * is still right for depth sorting and for where it is standing on the floor.
 */
export const bodyCell = (sprite: Phaser.GameObjects.Sprite & { body?: unknown }): Cell => {
    const body = sprite.body as { center?: { x: number; y: number } } | undefined;
    const centre = body?.center;
    if (!centre) {
        const fallback = sprite as unknown as { x: number; groundY?: number; y: number };
        return cellOf(fallback.x, fallback.groundY ?? fallback.y);
    }
    return cellOf(centre.x, centre.y);
};

/** The four orthogonal neighbours of a cell that are open. */
export const openNeighbours = (maze: number[][] | undefined, cell: Cell): Cell[] => {
    const offsets = [
        { gx: 0, gy: -1 },
        { gx: 1, gy: 0 },
        { gx: 0, gy: 1 },
        { gx: -1, gy: 0 }
    ];

    return offsets
        .map((offset) => ({ gx: cell.gx + offset.gx, gy: cell.gy + offset.gy }))
        .filter((next) => isOpen(maze, next.gx, next.gy));
};
