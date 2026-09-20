import { GameConfig } from '../constants/GameConfig';

/**
 * The layout of a city, and nothing else.
 *
 * Kept free of Phaser so it can be generated, walked and counted in a test:
 * the promises this file makes — every city can be walked from the doorstep
 * to home, and one seed always gives one city — are only worth anything if
 * they are checked across thousands of layouts rather than the dozen anyone
 * plays in an afternoon.
 */

/** The two draws the generator needs. Phaser's RandomDataGenerator fits. */
export interface GridRng {
    frac(): number;
    integerInRange(min: number, max: number): number;
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

/**
 * Opens a share of the dead ends into loops.
 *
 * A perfect maze is a tree: every chase ends against a wall. Braiding adds
 * cycles, which is what makes it possible to break line of sight and come
 * back around — the counterplay the enemy redesign depends on.
 */
const braid = (maze: number[][], mazeSize: number, rng: GridRng): void => {
    for (let y = 1; y < mazeSize - 1; y += 2) {
        for (let x = 1; x < mazeSize - 1; x += 2) {
            if (maze[y][x] !== 0) continue;

            const open = NEIGHBOURS.filter(([dx, dy]) => maze[y + dy]?.[x + dx] === 0);
            if (open.length !== 1) continue;
            if (rng.frac() >= GameConfig.MAZE.BRAID_CHANCE) continue;

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
const carvePlazas = (maze: number[][], mazeSize: number, rng: GridRng): void => {
    const radius = GameConfig.MAZE.PLAZA_RADIUS;
    const margin = radius + 3;

    for (let i = 0; i < GameConfig.MAZE.PLAZAS; i++) {
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

/** One candidate layout: carve, braid, open a few plazas. */
const generateGrid = (mazeSize: number, centre: GridCell, rng: GridRng): number[][] => {
    const maze: number[][] = Array(mazeSize)
        .fill(null)
        .map(() => Array(mazeSize).fill(1));

    // Clear the goal chamber.
    maze[centre.y][centre.x] = 0;
    maze[centre.y - 1][centre.x] = 0;
    maze[centre.y + 1][centre.x] = 0;
    maze[centre.y][centre.x - 1] = 0;
    maze[centre.y][centre.x + 1] = 0;

    // Clear the start pocket.
    const start = GameConfig.PLAYER.START_TILE;
    maze[start.Y][start.X] = 0;
    maze[start.Y][start.X + 1] = 0;
    maze[start.Y + 1][start.X] = 0;

    // Depth-first carve. Produces a perfect maze — no loops, many dead ends —
    // which braiding then opens up so the player has somewhere to run.
    //
    // An explicit stack rather than recursion: the biggest city has nine
    // hundred cells to visit, and a carve that deep is a lot to ask of a
    // phone's call stack.
    const stack: { x: number; y: number; order: Step[]; next: number }[] = [
        { x: start.X, y: start.Y, order: shuffled(NEIGHBOURS, rng), next: 0 }
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
        if (nx < 0 || nx >= mazeSize || ny < 0 || ny >= mazeSize || maze[ny][nx] !== 1) continue;

        maze[top.y + dy][top.x + dx] = 0;
        maze[ny][nx] = 0;
        stack.push({ x: nx, y: ny, order: shuffled(NEIGHBOURS, rng), next: 0 });
    }

    braid(maze, mazeSize, rng);
    carvePlazas(maze, mazeSize, rng);

    return maze;
};

/**
 * Cuts a walkable line from the doorstep to home.
 *
 * Never expected to run. The carve visits every odd cell and the goal
 * chamber opens onto one, so a walk always exists — the test beside this
 * file checks that over thousands of seeds. This is the belt to those
 * braces: if a later change to the generator ever breaks it, the player gets
 * a plain street instead of a city with no way home.
 */
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

/** Cell key, as the scene and the renderer hold them. */
export const iceKey = (x: number, y: number): string => `${x},${y}`;

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
const carveIce = (maze: number[][], rng: GridRng, share: number, centre: GridCell): string[] => {
    if (share <= 0) return [];

    const size = maze.length;
    const start = GameConfig.PLAYER.START_TILE;
    const safe = GameConfig.ICE.SAFE_RADIUS;
    const near = (x: number, y: number, to: { x: number; y: number }): boolean =>
        Math.abs(x - to.x) <= safe && Math.abs(y - to.y) <= safe;

    const open: GridCell[] = [];
    for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
            if (maze[y][x] !== 0) continue;
            if (near(x, y, { x: start.X, y: start.Y }) || near(x, y, centre)) continue;
            open.push({ x, y });
        }
    }
    if (open.length === 0) return [];

    const frozen = new Set<string>();
    const target = Math.round(open.length * Math.min(share, 0.9));
    const run = GameConfig.ICE.RUN;

    // Bounded: a city whose alleys are all too short would otherwise spin here.
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

    const out: string[] = [];
    frozen.forEach((key) => out.push(key));
    // Set order follows insertion, which follows the seeded draws — but the
    // scene hashes this list in the parity harness, so it is sorted to be
    // certain two runs of one seed hand over the same string.
    return out.sort();
};

/** What a city is asked for beyond its size. Absent fields mean the old city. */
export interface CityPlan {
    /** Share of walkable cells that freeze over. 0, or absent, for none. */
    ice?: number;
}

export interface CityLayout {
    maze: number[][];
    /** Shortest walk from the doorstep to home, in cells. Never -1. */
    walk: number;
    /** Whether the walk landed inside the fair band. */
    inBand: boolean;
    /** Frozen cells, as `x,y` keys. Empty for an ordinary city. */
    ice: string[];
}

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
    const start = GameConfig.PLAYER.START_TILE;
    const from = { x: start.X, y: start.Y };
    const centre = { x: Math.floor(mazeSize / 2), y: Math.floor(mazeSize / 2) };

    // The band was measured on the base city. A bigger one has longer walks
    // in proportion, so the band grows with it; otherwise every attempt on
    // nightmare would fail the ceiling.
    const scale = mazeSize / GameConfig.MAZE_SIZE;
    const min = Math.round(GameConfig.MAZE.WALK_LENGTH.MIN * scale);
    const max = Math.round(GameConfig.MAZE.WALK_LENGTH.MAX * scale);

    let best: CityLayout | null = null;
    let bestMiss = Infinity;

    for (let attempt = 0; attempt < GameConfig.MAZE.WALK_LENGTH.ATTEMPTS; attempt++) {
        const maze = generateGrid(mazeSize, centre, rng);
        const walk = walkLength(maze, from, centre);
        if (walk < 0) continue;

        if (walk >= min && walk <= max) {
            return { maze, walk, inBand: true, ice: carveIce(maze, rng, plan.ice ?? 0, centre) };
        }

        const miss = walk < min ? min - walk : walk - max;
        if (miss < bestMiss) {
            bestMiss = miss;
            best = { maze, walk, inBand: false, ice: [] };
        }
    }

    if (best) return { ...best, ice: carveIce(best.maze, rng, plan.ice ?? 0, centre) };

    const maze = generateGrid(mazeSize, centre, rng);
    forceRoute(maze, from, centre);
    return { maze, walk: walkLength(maze, from, centre), inBand: false, ice: [] };
};
