import { GameConfig } from '../constants/GameConfig';
import { CITY_KINDS } from './cityKinds';
import { generateCity, maskFor, walkLength } from './mazeGrid';
import type { GridRng } from './mazeGrid';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RandomDataGenerator = require('phaser/src/math/random-data-generator/RandomDataGenerator');

const seeded = (seed: string): GridRng => new RandomDataGenerator([seed]);

const start = { x: GameConfig.PLAYER.START_TILE.X, y: GameConfig.PLAYER.START_TILE.Y };
const centreOf = (size: number) => ({ x: Math.floor(size / 2), y: Math.floor(size / 2) });

/** Enough of them to catch a kind that fails one city in fifty. */
const SEEDS = 80;

describe.each(CITY_KINDS.map((kind) => [kind.key, kind] as const))('%s', (key, kind) => {
    it('can always be walked home, without spending a jump', () => {
        let shortest = Infinity;
        let longest = 0;

        for (let i = 0; i < SEEDS; i++) {
            const city = generateCity(41, seeded(`${key}-${i}#1`), kind.plan);
            const centre = centreOf(city.size);
            const walk = walkLength(city.maze, start, centre);

            expect(walk).toBeGreaterThan(0);
            expect(city.walk).toBe(walk);

            shortest = Math.min(shortest, walk);
            longest = Math.max(longest, walk);
        }

        // A kind whose every city is a dash to the door, or an hour of
        // walking, is a bug in its dials rather than a style.
        expect(shortest).toBeGreaterThan(8);
        expect(longest).toBeLessThan(2000);
    });

    it('is the size and shape it says it is, and is drawn the same way twice', () => {
        const once = generateCity(41, seeded(`${key}-shape#1`), kind.plan);
        const twice = generateCity(41, seeded(`${key}-shape#1`), kind.plan);

        expect(twice.maze).toEqual(once.maze);
        expect(twice.ice).toEqual(once.ice);

        expect(once.size % 2).toBe(1);
        expect(once.maze.length).toBe(once.size);
        if (kind.plan.size) expect(once.size).toBe(kind.plan.size);

        // The outer ring is always building: the city has walls.
        for (let i = 0; i < once.size; i++) {
            expect(once.maze[0][i]).toBe(1);
            expect(once.maze[once.size - 1][i]).toBe(1);
            expect(once.maze[i][0]).toBe(1);
            expect(once.maze[i][once.size - 1]).toBe(1);
        }

        // The doorstep and home are open, whatever the shape did.
        const centre = centreOf(once.size);
        expect(once.maze[start.y][start.x]).toBe(0);
        expect(once.maze[centre.y][centre.x]).toBe(0);
    });

    it('has more ways round with braiding than without', () => {
        // Braiding opens dead ends into loops. It once did nothing at all in
        // the shaped cities, which were carved on the lattice it never reads.
        // (The caves and blocks kinds are open ground; braiding is noise there.)
        if (!kind.plan.mask) return;
        const loops = (maze: number[][]): number => {
            let cells = 0;
            let links = 0;
            maze.forEach((row, y) =>
                row.forEach((cell, x) => {
                    if (cell !== 0) return;
                    cells++;
                    if (row[x + 1] === 0) links++;
                    if (maze[y + 1]?.[x] === 0) links++;
                })
            );
            return links - cells + 1;
        };
        let braided = 0;
        let plain = 0;
        for (let i = 0; i < 10; i++) {
            braided += loops(generateCity(41, seeded(`${key}-braid-${i}#1`), kind.plan).maze);
            plain += loops(generateCity(41, seeded(`${key}-braid-${i}#1`), { ...kind.plan, braid: 0 }).maze);
        }
        expect(braided).toBeGreaterThan(plain);
    });

    it('keeps to its outline: outside the shape, only the way in from the doorstep', () => {
        for (let i = 0; i < 20; i++) {
            const city = generateCity(41, seeded(`${key}-outline-${i}#1`), kind.plan);
            const inside = maskFor(kind.plan.mask ?? 'square', city.size);
            const outside = (x: number, y: number) => city.maze[y]?.[x] === 0 && !inside(x, y);

            // The doorway: open ground outside the shape, joined to the doorstep.
            const door = new Set<string>();
            const todo = [start];
            while (todo.length) {
                const { x, y } = todo.pop()!;
                if (door.has(`${x},${y}`) || !outside(x, y)) continue;
                door.add(`${x},${y}`);
                todo.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
            }

            for (let y = 0; y < city.size; y++) {
                for (let x = 0; x < city.size; x++) {
                    if (outside(x, y)) expect(door.has(`${x},${y}`) ? 'doorway' : `leak at ${x},${y}`).toBe('doorway');
                }
            }
        }
    });

    it('freezes only walkable street, and only when asked', () => {
        const city = generateCity(41, seeded(`${key}-ice#1`), kind.plan);

        if (!kind.plan.ice) {
            expect(city.ice).toEqual([]);
            return;
        }

        expect(city.ice.length).toBeGreaterThan(0);
        city.ice.forEach((cellKey) => {
            const [x, y] = cellKey.split(',').map(Number);
            expect(city.maze[y][x]).toBe(0);
        });
    });
});

describe('the collection as a whole', () => {
    it('has twenty kinds with distinct keys', () => {
        expect(CITY_KINDS).toHaveLength(20);
        expect(new Set(CITY_KINDS.map((kind) => kind.key)).size).toBe(20);
    });

    it('leaves nothing stranded: every open cell can reach home', () => {
        // A pocket that cannot reach home is where a player gets shoved by a
        // tower and then simply loses, having done nothing wrong.
        for (const kind of CITY_KINDS) {
            const city = generateCity(41, seeded(`${kind.key}-pockets#1`), kind.plan);
            const centre = centreOf(city.size);

            for (let y = 1; y < city.size - 1; y++) {
                for (let x = 1; x < city.size - 1; x++) {
                    if (city.maze[y][x] !== 0) continue;
                    expect(walkLength(city.maze, { x, y }, centre)).toBeGreaterThanOrEqual(0);
                }
            }
        }
    });
});
