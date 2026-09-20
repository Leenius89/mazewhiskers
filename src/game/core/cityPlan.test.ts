import { GameConfig } from '../constants/GameConfig';
import { resolveCityPlan, setCityPlan } from './cityPlan';
import type { GridRng } from './mazeGrid';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RandomDataGenerator = require('phaser/src/math/random-data-generator/RandomDataGenerator');

const seeded = (seed: string): GridRng => new RandomDataGenerator([seed]);

afterEach(() => setCityPlan(null));

describe('resolveCityPlan', () => {
    it('freezes about a quarter of ordinary cities, and nothing else decides it', () => {
        let frozen = 0;
        const shares: number[] = [];

        for (let i = 0; i < 4000; i++) {
            const plan = resolveCityPlan(seeded(`run-${i}`));
            if (plan.ice) {
                frozen++;
                shares.push(plan.ice);
            }
        }

        const rate = frozen / 4000;
        expect(rate).toBeGreaterThan(GameConfig.ICE.CHANCE - 0.03);
        expect(rate).toBeLessThan(GameConfig.ICE.CHANCE + 0.03);

        expect(Math.min(...shares)).toBeGreaterThanOrEqual(GameConfig.ICE.ORDINARY.MIN);
        expect(Math.max(...shares)).toBeLessThanOrEqual(GameConfig.ICE.ORDINARY.MAX);
    });

    it('takes the same two draws whichever way the roll goes', () => {
        // Otherwise a frozen city and a clear one would leave the generator in
        // different places, and everything downstream of it — the buildings,
        // the fish, the milk — would differ for a reason the player cannot see.
        const iced = seeded('stream-check');
        const plain = seeded('stream-check');

        resolveCityPlan(iced);
        resolveCityPlan(plain);
        expect(iced.frac()).toBe(plain.frac());
    });

    it('gives one seed the same weather twice', () => {
        expect(resolveCityPlan(seeded('same-seed'))).toEqual(resolveCityPlan(seeded('same-seed')));
    });

    it('yields to a build that has its own idea of the city', () => {
        setCityPlan({ ice: 0.55 });
        for (let i = 0; i < 20; i++) {
            expect(resolveCityPlan(seeded(`ignored-${i}`))).toEqual({ ice: 0.55 });
        }

        setCityPlan(null);
        expect(resolveCityPlan(seeded('back-to-weather')).ice).not.toBe(0.55);
    });
});
