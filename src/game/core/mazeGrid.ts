import { GameConfig } from '../constants/GameConfig';

/**
 * The layout of a city, and nothing else.
 *
 * Kept free of Phaser so it can be generated, walked and counted in a test:
 * the promises this file makes — every city can be walked from the doorstep
 * to home, and one seed always gives one city — are only worth anything if
 * they are checked across thousands of layouts rather than the dozen anyone
 * plays in an afternoon.
 *
 * A plain city is drawn exactly as it always was. Everything below that takes
 * a plan — an outline, a way of filling it, a size — exists for the daily
 * city, which has to be a different *kind* of place every day without ever
 * being a place you cannot get home from.
 */

/** The three draws the generator needs. Phaser's RandomDataGenerator fits. */
export interface GridRng {
    frac(): number;
    integerInRange(min: number, max: number): number;
    realInRange(min: number, max: number): number;
}

export interface GridCell {
    x: number;
    y: number;
}

type Step = readonly [number, number];

const NEIGHBOURS: ReadonlyArray<Step> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
];

/**
 * Fisher–Yates, drawn from the seeded generator.
 *
 * This used to be `sort(() => rng.frac() - 0.5)`. A comparator that answers
 * at random has no defined result: how many times it is asked, and in what
 * order, belongs to the engine's sort — and differs between V8 and
 * JavaScriptCore, and within V8 between cold and optimised code. So one seed
 * drew different cities on different phones, and sometimes on the same one.
 * It was a poor shuffle besides; the first direction stayed first far too
 * often. This draws exactly three numbers, the same three everywhere.
 */
const shuffled = <T>(items: ReadonlyArray<T>, rng: GridRng): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = rng.integerInRange(0, i);
        const held = out[i];
        out[i] = out[j];
        out[j] = held;
    }
    return out;
};

// ---------------------------------------------------------------- the outline

/**
 * The shape of the city, before a single alley is cut.
 *
 * A mask says which cells may ever become street. Everything outside it is
 * building, permanently, which is how a square grid of tiles comes to read as
 * a circle or a cross without anything in the engine below it changing: the
 * physics, the hit boxes and the minimap still see the same square grid of
 * ones and zeroes they always saw.
 */
export type MaskKind = 'square' | 'circle' | 'diamond' | 'cross' | 'tall' | 'ring';

export type Mask = (x: number, y: number) => boolean;

export const maskFor = (kind: MaskKind, size: number): Mask => {
    const centre = (size - 1) / 2;
    const reach = centre - 1;

    switch (kind) {
        case 'circle':
            return (x, y) => Math.sqrt((x - centre) ** 2 + (y - centre) ** 2) <= reach;
        case 'diamond':
            return (x, y) => Math.abs(x - centre) + Math.abs(y - centre) <= reach;
        case 'cross': {
            // The four quarters of the city are joined only across the middle.
            const arm = Math.max(3, Math.round(size / 6));
            return (x, y) => Math.abs(x - centre) <= arm || Math.abs(y - centre) <= arm;
        }
        case 'tall': {
            // Nowhere sideways to run.
            const half = Math.max(3, Math.round(size / 5));
            return (x, y) => Math.abs(x - centre) <= half;
        }
        case 'ring': {
            // A band of streets with home in the middle of it, reached by four
            // spokes. Home stays at the centre, as it does in every city here.
            const outer = reach;
            const inner = Math.round(reach * 0.45);
            return (x, y) => {
                const dx = x - centre;
                const dy = y - centre;
                const r = Math.sqrt(dx ** 2 + dy ** 2);
                if (r > outer) return false;
                return r >= inner || Math.abs(dx) <= 1 || Math.abs(dy) <= 1;
            };
        }
        default:
            return () => true;
    }
};

/** Whether a cell may be carved at all: inside the walls, and inside the shape. */
const carvable = (x: number, y: number, size: number, mask: Mask): boolean =>
    x >= 1 && y >= 1 && x <= size - 2 && y <= size - 2 && mask(x, y);

// ------------------------------------------------------------------- carvers

export type GeneratorKind =
    | 'backtracker'
    | 'prim'
    | 'division'
    | 'blocks'
    | 'caves'
    | 'spiral'
    | 'radial';

/**
 * Depth-first carve. Long, winding alleys with few junctions.
 *
 * An explicit stack rather than recursion: the biggest city has nine hundred
 * cells to visit, and a carve that deep is a lot to ask of a phone's stack.
 */
const carveBacktracker = (
    maze: number[][],
    size: number,
    mask: Mask,
    rng: GridRng,
    from: GridCell
): void => {
    const stack: { x: number; y: number; order: Step[]; next: number }[] = [
        { x: from.x, y: from.y, order: shuffled(NEIGHBOURS, rng), next: 0 }
    ];

    while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.next >= top.order.length) {
            stack.pop();
            continue;
        }

        const [dx, dy] = top.order[top.next++];
        const nx = top.x + dx * 2;
        const ny = top.y + dy * 2;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size || maze[ny][nx] !== 1) continue;
        if (!carvable(nx, ny, size, mask) || !carvable(top.x + dx, top.y + dy, size, mask)) continue;

        maze[top.y + dy][top.x + dx] = 0;
        maze[ny][nx] = 0;
        stack.push({ x: nx, y: ny, order: shuffled(NEIGHBOURS, rng), next: 0 });
    }
};

/**
 * Prim's, grown from a frontier rather than walked.
 *
 * Where the backtracker wanders off and leaves one long corridor behind it,
 * this spreads evenly in every direction: short alleys, junctions everywhere,
 * and no sense of which way you came from.
 */
const carvePrim = (maze: number[][], size: number, mask: Mask, rng: GridRng, from: GridCell): void => {
    const frontier: GridCell[] = [];
    const queued = new Set<string>();

    const push = (x: number, y: number): void => {
        for (const [dx, dy] of NEIGHBOURS) {
            const nx = x + dx * 2;
            const ny = y + dy * 2;
            if (!carvable(nx, ny, size, mask) || maze[ny][nx] === 0) continue;

            const key = `${nx},${ny}`;
            if (queued.has(key)) continue;
            queued.add(key);
            frontier.push({ x: nx, y: ny });
        }
    };

    maze[from.y][from.x] = 0;
    push(from.x, from.y);

    while (frontier.length) {
        const cell = frontier.splice(rng.integerInRange(0, frontier.length - 1), 1)[0];
        if (maze[cell.y][cell.x] === 0) continue;

        // Joined back to whatever is already street, through one wall.
        const joins: Step[] = [];
        for (const [dx, dy] of NEIGHBOURS) {
            const nx = cell.x + dx * 2;
            const ny = cell.y + dy * 2;
            if (carvable(nx, ny, size, mask) && maze[ny][nx] === 0) joins.push([dx, dy]);
        }
        if (joins.length === 0) continue;

        const [dx, dy] = joins[rng.integerInRange(0, joins.length - 1)];
        maze[cell.y][cell.x] = 0;
        maze[cell.y + dy][cell.x + dx] = 0;
        push(cell.x, cell.y);
    }
};

/**
 * Recursive division: an open field, cut in two over and over.
 *
 * Every wall it draws is straight and runs the width of whatever it is
 * dividing, so the result reads as a planned city — long avenues, square
 * blocks — rather than as something grown.
 */
const carveDivision = (maze: number[][], size: number, mask: Mask, rng: GridRng): void => {
    for (let y = 1; y <= size - 2; y++) {
        for (let x = 1; x <= size - 2; x++) {
            if (carvable(x, y, size, mask)) maze[y][x] = 0;
        }
    }

    const oddish = (value: number): number => (value % 2 === 0 ? value + 1 : value);
    const evenish = (value: number): number => (value % 2 === 0 ? value : value + 1);

    const divide = (left: number, top: number, right: number, bottom: number, depth: number): void => {
        const width = right - left + 1;
        const height = bottom - top + 1;
        if (depth > 12 || width < 5 || height < 5) return;

        const horizontal = width === height ? rng.frac() < 0.5 : width < height;

        if (horizontal) {
            const wallY = evenish(rng.integerInRange(top + 1, bottom - 2));
            const gapX = oddish(rng.integerInRange(left, right - 1));
            for (let x = left; x <= right; x++) {
                if (x !== gapX && carvable(x, wallY, size, mask)) maze[wallY][x] = 1;
            }
            divide(left, top, right, wallY - 1, depth + 1);
            divide(left, wallY + 1, right, bottom, depth + 1);
            return;
        }

        const wallX = evenish(rng.integerInRange(left + 1, right - 2));
        const gapY = oddish(rng.integerInRange(top, bottom - 1));
        for (let y = top; y <= bottom; y++) {
            if (y !== gapY && carvable(wallX, y, size, mask)) maze[y][wallX] = 1;
        }
        divide(left, top, wallX - 1, bottom, depth + 1);
        divide(wallX + 1, top, right, bottom, depth + 1);
    };

    divide(1, 1, size - 2, size - 2, 0);
};

/**
 * Blocks: a street grid with housing too deep to cross.
 *
 * Streets every fourth cell leave blocks three cells thick — wider than a
 * jump, which clears two — so a wrong turn here costs a walk back rather than
 * a carton of milk. A quarter of the stretches between junctions are built
 * over, so it is a city rather than a chessboard.
 */
const carveBlocks = (maze: number[][], size: number, mask: Mask, rng: GridRng): void => {
    const SPACING = 4;
    const onGrid = (value: number): boolean => (value - 1) % SPACING === 0;

    for (let y = 1; y <= size - 2; y++) {
        for (let x = 1; x <= size - 2; x++) {
            if (!carvable(x, y, size, mask)) continue;
            if (onGrid(x) || onGrid(y)) maze[y][x] = 0;
        }
    }

    // A sixth of the stretches between junctions are built over — the whole
    // stretch, not a cell out of the middle of it, which would leave two
    // stubs going nowhere and read as rubble rather than as housing.
    for (let y = 1; y <= size - 2; y++) {
        for (let x = 1; x <= size - 2; x++) {
            if (maze[y][x] !== 0 || !(onGrid(x) || onGrid(y))) continue;
            if (onGrid(x) && onGrid(y)) continue;
            // Only from the junction end, so each stretch is considered once.
            if (onGrid(y) && !onGrid(x - 1)) continue;
            if (onGrid(x) && !onGrid(y - 1)) continue;
            if (rng.frac() >= 0.16) continue;

            const [dx, dy] = onGrid(y) ? [1, 0] : [0, 1];
            for (let step = 0; step < SPACING - 1; step++) {
                const cx = x + dx * step;
                const cy = y + dy * step;
                if (maze[cy]?.[cx] === 0) maze[cy][cx] = 1;
            }
        }
    }
};

/**
 * Cellular automata: the part of the city nobody planned.
 *
 * Noise, then four passes of "become whatever most of your neighbours are".
 * Organic clumps of housing, and alleys that wander and pinch — a shanty town
 * rather than a grid.
 */
const carveCaves = (maze: number[][], size: number, mask: Mask, rng: GridRng): void => {
    for (let y = 1; y <= size - 2; y++) {
        for (let x = 1; x <= size - 2; x++) {
            if (!carvable(x, y, size, mask)) continue;
            maze[y][x] = rng.frac() < 0.48 ? 1 : 0;
        }
    }

    for (let pass = 0; pass < 4; pass++) {
        const next = maze.map((row) => row.slice());

        for (let y = 1; y <= size - 2; y++) {
            for (let x = 1; x <= size - 2; x++) {
                if (!carvable(x, y, size, mask)) continue;

                let walls = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        if (maze[y + dy]?.[x + dx] !== 0) walls++;
                    }
                }
                // Five neighbours or more and it builds up; three or fewer and
                // it opens out; in between it stays as it is, which is what
                // keeps the clumps from melting into one open field.
                next[y][x] = walls >= 5 ? 1 : walls <= 3 ? 0 : maze[y][x];
            }
        }

        for (let y = 1; y <= size - 2; y++) {
            for (let x = 1; x <= size - 2; x++) maze[y][x] = next[y][x];
        }
    }
};

/**
 * One street, wound from the edge to the middle.
 *
 * The longest walk in the collection and the only one nobody can get lost in:
 * there are no decisions at all, which turns the run into a race against the
 * towers rather than a search.
 */
const carveSpiral = (maze: number[][], size: number, mask: Mask): void => {
    const open = (x: number, y: number): void => {
        if (carvable(x, y, size, mask)) maze[y][x] = 0;
    };

    let left = 1;
    let top = 1;
    let right = size - 2;
    let bottom = size - 2;

    while (left <= right && top <= bottom) {
        for (let x = left; x <= right; x++) open(x, top);
        for (let y = top; y <= bottom; y++) open(right, y);
        for (let x = right; x >= left; x--) open(x, bottom);
        for (let y = bottom; y >= top + 2; y--) open(left, y);

        // Step in two rings, leaving the way through to the next turn.
        open(left, top + 2);
        open(left + 1, top + 2);

        left += 2;
        top += 2;
        right -= 2;
        bottom -= 2;
    }
};

/**
 * Avenues out of the middle, with alleys between them.
 *
 * Every avenue points at home, so this is the kindest city in the collection:
 * find a big road, follow it inwards, and you arrive. The maze between them
 * is what the black cat uses.
 */
const carveRadial = (maze: number[][], size: number, mask: Mask, rng: GridRng, centre: GridCell): void => {
    const rays: Step[] = [
        [0, -1],
        [1, -1],
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1]
    ];

    for (const [dx, dy] of rays) {
        let x = centre.x;
        let y = centre.y;

        while (carvable(x, y, size, mask)) {
            maze[y][x] = 0;

            // Two cells wide, so an avenue reads as an avenue from the ground
            // rather than as one more alley that happens to be straight. On a
            // diagonal the second cell is what makes it walkable at all: a
            // strict diagonal is a line of corners, and a body cannot round a
            // corner on the diagonal.
            const [ax, ay] = dx !== 0 && dy !== 0 ? [dx, 0] : [dy, dx];
            if (carvable(x + ax, y + ay, size, mask)) maze[y + ay][x + ax] = 0;

            x += dx;
            y += dy;
        }
    }

    // The ground between the avenues is filled with ordinary alleys, seeded
    // off whatever is still solid, so everything joins up to something.
    for (let y = 1; y <= size - 2; y += 2) {
        for (let x = 1; x <= size - 2; x += 2) {
            if (!carvable(x, y, size, mask) || maze[y][x] === 0) continue;
            carveBacktracker(maze, size, mask, rng, { x, y });
        }
    }
};

// ------------------------------------------------------------- after the cut

/**
 * Opens a share of the dead ends into loops.
 *
 * A perfect maze is a tree: every chase ends against a wall. Braiding adds
 * cycles, which is what makes it possible to break line of sight and come
 * back around — the counterplay the enemy redesign depends on.
 */
const braid = (maze: number[][], mazeSize: number, rng: GridRng, chance: number): void => {
    if (chance <= 0) return;

    for (let y = 1; y < mazeSize - 1; y += 2) {
        for (let x = 1; x < mazeSize - 1; x += 2) {
            if (maze[y][x] !== 0) continue;

            const open = NEIGHBOURS.filter(([dx, dy]) => maze[y + dy]?.[x + dx] === 0);
            if (open.length !== 1) continue;
            if (rng.frac() >= chance) continue;

            // Knock through a wall that leads somewhere new, never off the edge.
            const walls = NEIGHBOURS.filter(
                ([dx, dy]) =>
                    maze[y + dy]?.[x + dx] === 1 &&
                    maze[y + dy * 2]?.[x + dx * 2] !== undefined
            );
            if (walls.length === 0) continue;

            const [dx, dy] = walls[rng.integerInRange(0, walls.length - 1)];
            maze[y + dy][x + dx] = 0;
            maze[y + dy * 2][x + dx * 2] = 0;
        }
    }
};

/**
 * A handful of open squares.
 *
 * They read as somewhere to breathe and carry more to pick up, but they cost
 * the cover the alleys give — the terrain itself becomes a risk decision.
 */
const carvePlazas = (maze: number[][], mazeSize: number, rng: GridRng, count: number): void => {
    const radius = GameConfig.MAZE.PLAZA_RADIUS;
    const margin = radius + 3;
    if (count <= 0 || mazeSize - 1 - margin <= margin) return;

    for (let i = 0; i < count; i++) {
        const cx = rng.integerInRange(margin, mazeSize - 1 - margin);
        const cy = rng.integerInRange(margin, mazeSize - 1 - margin);

        for (let y = cy - radius; y <= cy + radius; y++) {
            for (let x = cx - radius; x <= cx + radius; x++) {
                if (maze[y]?.[x] !== undefined) maze[y][x] = 0;
            }
        }
    }
};

/**
 * Steps along the shortest open walk between two cells, or -1 if there is none.
 *
 * Used to judge a layout before anything is built on it.
 */
export const walkLength = (maze: number[][], from: GridCell, to: GridCell): number => {
    const size = maze.length;
    const seen = new Set<string>([`${from.x},${from.y}`]);
    let frontier = [from];
    let steps = 0;

    while (frontier.length) {
        const next: GridCell[] = [];

        for (const cell of frontier) {
            if (cell.x === to.x && cell.y === to.y) return steps;

            for (const [dx, dy] of NEIGHBOURS) {
                const x = cell.x + dx;
                const y = cell.y + dy;
                if (x < 0 || y < 0 || x >= size || y >= size) continue;
                if (maze[y][x] !== 0) continue;

                const key = `${x},${y}`;
                if (seen.has(key)) continue;
                seen.add(key);
                next.push({ x, y });
            }
        }

        frontier = next;
        steps++;
    }

    return -1;
};

/** Every open cell that can be walked to from here. */
const reachableFrom = (maze: number[][], from: GridCell): Set<string> => {
    const size = maze.length;
    const seen = new Set<string>([`${from.x},${from.y}`]);
    const queue: GridCell[] = [from];

    while (queue.length) {
        const cell = queue.shift()!;

        for (const [dx, dy] of NEIGHBOURS) {
            const x = cell.x + dx;
            const y = cell.y + dy;
            if (x < 0 || y < 0 || x >= size || y >= size) continue;
            if (maze[y][x] !== 0) continue;

            const key = `${x},${y}`;
            if (seen.has(key)) continue;
            seen.add(key);
            queue.push({ x, y });
        }
    }

    return seen;
};

/** Cuts a walkable line between two cells. Corners once, never diagonally. */
const forceRoute = (maze: number[][], from: GridCell, to: GridCell): void => {
    let { x, y } = from;
    while (x !== to.x) {
        x += to.x > x ? 1 : -1;
        maze[y][x] = 0;
    }
    while (y !== to.y) {
        y += to.y > y ? 1 : -1;
        maze[y][x] = 0;
    }
};

/**
 * Joins the doorstep to the city, and throws away anything still cut off.
 *
 * A shape can leave the doorstep outside the walls — a circle has no corner
 * for it to stand in — so a short road is cut from the door to the nearest
 * street that can reach home. Pockets nothing can reach are filled in rather
 * than left as places to be stranded in later by a tower.
 */
const joinUp = (maze: number[][], start: GridCell, centre: GridCell): void => {
    const size = maze.length;
    const home = reachableFrom(maze, centre);

    if (!home.has(`${start.x},${start.y}`)) {
        let best: GridCell | null = null;
        let bestGap = Infinity;

        home.forEach((key) => {
            const [x, y] = key.split(',').map(Number);
            const gap = Math.abs(x - start.x) + Math.abs(y - start.y);
            if (gap < bestGap) {
                bestGap = gap;
                best = { x, y };
            }
        });

        maze[start.y][start.x] = 0;
        forceRoute(maze, start, best ?? centre);
    }

    const joined = reachableFrom(maze, centre);
    for (let y = 1; y <= size - 2; y++) {
        for (let x = 1; x <= size - 2; x++) {
            if (maze[y][x] === 0 && !joined.has(`${x},${y}`)) maze[y][x] = 1;
        }
    }
};

// ---------------------------------------------------------------------- ice

/** Cell key, as the scene and the renderer hold them. */
export const iceKey = (x: number, y: number): string => `${x},${y}`;

export type IceStyle = 'runs' | 'avenues';

/**
 * Freezes runs of street.
 *
 * Grown as random walks down the alleys rather than sprinkled cell by cell:
 * the mechanic only exists in a run of two or more, because one frozen cell
 * is a stumble and six in a row is somewhere you commit to.
 *
 * The doorstep and home are kept clear — a cat that starts the run already
 * sliding has been deprived of the first decision, and home is a place you
 * should be able to stop on.
 *
 * Draws nothing from the generator when no ice is asked for, so an ordinary
 * city is bit for bit the city it was before this existed.
 */
const carveIce = (
    maze: number[][],
    rng: GridRng,
    share: number,
    centre: GridCell,
    style: IceStyle
): string[] => {
    if (share <= 0) return [];

    const size = maze.length;
    const start = GameConfig.PLAYER.START_TILE;
    const safe = GameConfig.ICE.SAFE_RADIUS;
    const near = (x: number, y: number, to: { x: number; y: number }): boolean =>
        Math.abs(x - to.x) <= safe && Math.abs(y - to.y) <= safe;
    const free = (x: number, y: number): boolean =>
        maze[y]?.[x] === 0 && !near(x, y, { x: start.X, y: start.Y }) && !near(x, y, centre);

    const open: GridCell[] = [];
    for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
            if (free(x, y)) open.push({ x, y });
        }
    }
    if (open.length === 0) return [];

    const frozen = new Set<string>();
    const target = Math.round(open.length * Math.min(share, 0.9));

    if (style === 'avenues') {
        // Only the long straight stretches freeze, so the ice is an express
        // lane rather than weather: step on and you are committed to the far
        // end of the block.
        const runs: GridCell[][] = [];

        const scan = (dx: number, dy: number): void => {
            for (let y = 1; y < size - 1; y++) {
                for (let x = 1; x < size - 1; x++) {
                    if (!free(x, y) || free(x - dx, y - dy)) continue;

                    const run: GridCell[] = [];
                    let cx = x;
                    let cy = y;
                    while (free(cx, cy)) {
                        run.push({ x: cx, y: cy });
                        cx += dx;
                        cy += dy;
                    }
                    if (run.length >= 5) runs.push(run);
                }
            }
        };
        scan(1, 0);
        scan(0, 1);

        while (runs.length && frozen.size < target) {
            const run = runs.splice(rng.integerInRange(0, runs.length - 1), 1)[0];
            run.forEach((cell) => frozen.add(iceKey(cell.x, cell.y)));
        }
    } else {
        const run = GameConfig.ICE.RUN;

        // Bounded: a city whose alleys are all too short would otherwise spin.
        for (let attempt = 0; frozen.size < target && attempt < target * 4 + 40; attempt++) {
            const from = open[rng.integerInRange(0, open.length - 1)];
            let { x, y } = from;

            // One direction per run, turning only where it must. A run that
            // wandered cell by cell would fill a block instead of crossing it.
            let dx = 0;
            let dy = 0;
            const length = rng.integerInRange(run.MIN, run.MAX);

            for (let step = 0; step < length; step++) {
                frozen.add(iceKey(x, y));

                const ahead = dx !== 0 || dy !== 0 ? maze[y + dy]?.[x + dx] === 0 : false;
                if (!ahead) {
                    // A plain loop rather than a filter: this one is inside the
                    // walk, and a closure here captures the cell it started from.
                    const ways: Step[] = [];
                    for (let i = 0; i < NEIGHBOURS.length; i++) {
                        const [nx, ny] = NEIGHBOURS[i];
                        if (maze[y + ny]?.[x + nx] === 0) ways.push(NEIGHBOURS[i]);
                    }
                    if (ways.length === 0) break;
                    const [px, py] = ways[rng.integerInRange(0, ways.length - 1)];
                    dx = px;
                    dy = py;
                }

                x += dx;
                y += dy;
                if (maze[y]?.[x] !== 0) break;
                if (near(x, y, { x: start.X, y: start.Y }) || near(x, y, centre)) break;
            }
        }
    }

    const out: string[] = [];
    frozen.forEach((key) => out.push(key));
    // Set order follows insertion, which follows the seeded draws — but the
    // scene hashes this list in the parity harness, so it is sorted to be
    // certain two runs of one seed hand over the same string.
    return out.sort();
};

// -------------------------------------------------------------------- plans

/** What a city is asked for beyond its size. Absent fields mean the old city. */
export interface CityPlan {
    /** Share of walkable cells that freeze over. 0, or absent, for none. */
    ice?: number;
    /** How the ice is laid: in wandering runs, or down the long straights. */
    iceStyle?: IceStyle;
    /** Cells per side, forced odd. Absent means whatever the difficulty says. */
    size?: number;
    /** The city's outline. */
    mask?: MaskKind;
    /** How the alleys are cut. */
    generator?: GeneratorKind;
    /** Share of dead ends opened into loops. 0 for a maze with no way round. */
    braid?: number;
    /** Open squares. */
    plazas?: number;
}

export interface CityLayout {
    maze: number[][];
    /** Shortest walk from the doorstep to home, in cells. Never -1. */
    walk: number;
    /** Whether the walk landed inside the fair band. */
    inBand: boolean;
    /** Frozen cells, as `x,y` keys. Empty for an ordinary city. */
    ice: string[];
    /** Cells per side, which a plan may have changed. */
    size: number;
}

/** One candidate layout: carve, braid, open a few plazas, join it all up. */
const generateGrid = (size: number, centre: GridCell, rng: GridRng, plan: CityPlan): number[][] => {
    const maze: number[][] = Array(size)
        .fill(null)
        .map(() => Array(size).fill(1));

    const mask = maskFor(plan.mask ?? 'square', size);
    const start = { x: GameConfig.PLAYER.START_TILE.X, y: GameConfig.PLAYER.START_TILE.Y };

    const clearLandmarks = (): void => {
        // The goal chamber.
        maze[centre.y][centre.x] = 0;
        maze[centre.y - 1][centre.x] = 0;
        maze[centre.y + 1][centre.x] = 0;
        maze[centre.y][centre.x - 1] = 0;
        maze[centre.y][centre.x + 1] = 0;

        // The start pocket.
        maze[start.y][start.x] = 0;
        maze[start.y][start.x + 1] = 0;
        maze[start.y + 1][start.x] = 0;
    };

    clearLandmarks();

    // Carving begins at the doorstep where the doorstep is part of the city,
    // and at home where the shape has left it outside the walls.
    const seed = carvable(start.x, start.y, size, mask) ? start : centre;

    switch (plan.generator ?? 'backtracker') {
        case 'prim':
            carvePrim(maze, size, mask, rng, seed);
            break;
        case 'division':
            carveDivision(maze, size, mask, rng);
            break;
        case 'blocks':
            carveBlocks(maze, size, mask, rng);
            break;
        case 'caves':
            carveCaves(maze, size, mask, rng);
            break;
        case 'spiral':
            carveSpiral(maze, size, mask);
            break;
        case 'radial':
            carveRadial(maze, size, mask, rng, centre);
            break;
        default:
            carveBacktracker(maze, size, mask, rng, seed);
    }

    braid(maze, size, rng, plan.braid ?? GameConfig.MAZE.BRAID_CHANCE);
    carvePlazas(maze, size, rng, plan.plazas ?? GameConfig.MAZE.PLAZAS);

    // Again: a generator that fills its own ground (division, blocks, caves)
    // may have built over the door or the doorway to home.
    clearLandmarks();
    joinUp(maze, start, centre);

    return maze;
};

/**
 * A city that can certainly be walked, of a fair length wherever possible.
 *
 * Layouts are drawn until one is a fair length, then kept.
 *
 * Measured across twenty-four generations, the walk from the doorstep to
 * home ran from forty-five cells to two hundred and sixty-three — the same
 * run, done equally well, taking half a minute or two and a half. One player
 * in eight drew a maze three to five times longer than the median, which
 * makes a race for the fastest time mostly a draw for it.
 *
 * If no draw lands in the band, the one that came closest is kept — not
 * whichever happened to be last. A seeded run keeps drawing from the same
 * seeded generator, so it stays reproducible: it simply arrives at the
 * layout that qualified.
 */
export const generateCity = (mazeSize: number, rng: GridRng, plan: CityPlan = {}): CityLayout => {
    // Odd, always: corridors sit on an odd lattice, and an even side would
    // leave a solid row along two edges.
    const size = plan.size ? 2 * Math.round((plan.size - 1) / 2) + 1 : mazeSize;

    const start = { x: GameConfig.PLAYER.START_TILE.X, y: GameConfig.PLAYER.START_TILE.Y };
    const centre = { x: Math.floor(size / 2), y: Math.floor(size / 2) };

    // The band was measured on the base city. A bigger one has longer walks
    // in proportion, so the band grows with it; otherwise every attempt on
    // nightmare would fail the ceiling. A shape that throws away half the
    // ground has shorter walks in it, and keeps whichever came closest.
    const scale = size / GameConfig.MAZE_SIZE;
    const min = Math.round(GameConfig.MAZE.WALK_LENGTH.MIN * scale);
    const max = Math.round(GameConfig.MAZE.WALK_LENGTH.MAX * scale);

    const ice = (maze: number[][]): string[] =>
        carveIce(maze, rng, plan.ice ?? 0, centre, plan.iceStyle ?? 'runs');

    let best: CityLayout | null = null;
    let bestMiss = Infinity;

    for (let attempt = 0; attempt < GameConfig.MAZE.WALK_LENGTH.ATTEMPTS; attempt++) {
        const maze = generateGrid(size, centre, rng, plan);
        const walk = walkLength(maze, start, centre);
        if (walk < 0) continue;

        if (walk >= min && walk <= max) return { maze, walk, inBand: true, ice: ice(maze), size };

        const miss = walk < min ? min - walk : walk - max;
        if (miss < bestMiss) {
            bestMiss = miss;
            best = { maze, walk, inBand: false, ice: [], size };
        }
    }

    if (best) return { ...best, ice: ice(best.maze) };

    // Never reached: `joinUp` leaves every city walkable. The belt to those
    // braces — a plain street rather than a city with no way home.
    const maze = generateGrid(size, centre, rng, plan);
    forceRoute(maze, start, centre);
    return { maze, walk: walkLength(maze, start, centre), inBand: false, ice: [], size };
};
