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
        if (doubled > -dy) {
            error -= dy;
            gx += stepX;
        }
        if (doubled < dx) {
            error += dx;
            gy += stepY;
        }
    }

    return true;
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
