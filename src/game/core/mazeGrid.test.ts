import { GameConfig } from '../constants/GameConfig';
import { generateCity, walkLength, GridRng } from './mazeGrid';

// The generator the game really uses, loaded on its own: the whole of Phaser
// wants a canvas, this one file wants nothing.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RandomDataGenerator = require('phaser/src/math/random-data-generator/RandomDataGenerator');

const seeded = (seed: string): GridRng => new RandomDataGenerator([seed]);

/** The base city, and nightmare's city at one and a half times the side. */
const SIZES = [41, 61];
const SEEDS = 1500;

const start = { x: GameConfig.PLAYER.START_TILE.X, y: GameConfig.PLAYER.START_TILE.Y };
const centreOf = (size: number) => ({ x: Math.floor(size / 2), y: Math.floor(size / 2) });

describe('generateCity', () => {
    it.each(SIZES)('always leaves a walk from the doorstep to home (%i cells a side)', (size) => {
        let inBand = 0;

        for (let i = 0; i < SEEDS; i++) {
            const city = generateCity(size, seeded(`daily-test-${i}#1`));
            const walk = walkLength(city.maze, start, centreOf(size));

            // No jump needed: the one the cat starts with is spare, not a key.
            expect(walk).toBeGreaterThan(0);
            expect(walk).toBe(city.walk);
            if (city.inBand) inBand++;
        }

        // The fair-length band is a preference, not a promise, but if it ever
        // stops being met nearly always the numbers behind it have gone stale.
        expect(inBand / SEEDS).toBeGreaterThan(0.97);
    });

    it('draws the same city from the same seed, every time', () => {
        for (const size of SIZES) {
            const first = generateCity(size, seeded('daily-2026-09-20#1'));
            const second = generateCity(size, seeded('daily-2026-09-20#1'));
            expect(second.maze).toEqual(first.maze);
        }
    });

    it('draws different cities from different seeds', () => {
        const one = generateCity(41, seeded('daily-2026-09-20#1'));
        const other = generateCity(41, seeded('daily-2026-09-21#1'));
        expect(other.maze).not.toEqual(one.maze);
    });

    it('asks the generator for nothing when no ice is wanted', () => {
        const plain = generateCity(41, seeded('ice-none#1'));
        const same = generateCity(41, seeded('ice-none#1'), {});
        const iced = generateCity(41, seeded('ice-none#1'), { ice: 0.3 });

        expect(plain.ice).toEqual([]);
        expect(same.maze).toEqual(plain.maze);
        // The ice is drawn after the layout, so asking for it must not move a
        // single wall: an ordinary city and an icy one of the same seed are
        // the same city underneath.
        expect(iced.maze).toEqual(plain.maze);
        expect(iced.ice.length).toBeGreaterThan(0);
    });

    it('freezes open street, in runs, away from the doorstep and home', () => {
        const size = 41;
        const centre = centreOf(size);
        const safe = GameConfig.ICE.SAFE_RADIUS;

        for (let i = 0; i < 200; i++) {
            const city = generateCity(size, seeded(`ice-${i}#1`), { ice: 0.3 });
            const frozen = new Set(city.ice);
            expect(frozen.size).toBe(city.ice.length);

            let touching = 0;
            city.ice.forEach((key) => {
                const [x, y] = key.split(',').map(Number);

                expect(city.maze[y][x]).toBe(0);
                expect(Math.max(Math.abs(x - start.x), Math.abs(y - start.y))).toBeGreaterThan(safe);
                expect(Math.max(Math.abs(x - centre.x), Math.abs(y - centre.y))).toBeGreaterThan(safe);

                const neighbours = [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`];
                if (neighbours.some((n) => frozen.has(n))) touching++;
            });

            // One frozen cell on its own is a stumble; the mechanic is the run.
            expect(touching / city.ice.length).toBeGreaterThan(0.85);
            // Still walkable: ice is a surface, not a wall.
            expect(walkLength(city.maze, start, centre)).toBeGreaterThan(0);
        }
    });

    it('freezes the same streets from the same seed, and more of them when asked', () => {
        const once = generateCity(41, seeded('ice-same#1'), { ice: 0.3 });
        const twice = generateCity(41, seeded('ice-same#1'), { ice: 0.3 });
        expect(twice.ice).toEqual(once.ice);

        const heavy = generateCity(41, seeded('ice-same#1'), { ice: 0.55 });
        expect(heavy.ice.length).toBeGreaterThan(once.ice.length);
    });

    it('keeps the start pocket, the goal chamber and the outer wall', () => {
        const { maze } = generateCity(41, seeded('edges#1'));
        const c = centreOf(41);

        expect(maze[start.y][start.x]).toBe(0);
        expect(maze[c.y][c.x]).toBe(0);
        for (let i = 0; i < 41; i++) {
            expect(maze[0][i]).toBe(1);
            expect(maze[i][0]).toBe(1);
            expect(maze[40][i]).toBe(1);
            expect(maze[i][40]).toBe(1);
        }
    });
});
