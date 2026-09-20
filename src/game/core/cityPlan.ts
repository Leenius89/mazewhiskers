import { GameConfig } from '../constants/GameConfig';
import type { CityPlan, GridRng } from './mazeGrid';

/**
 * What kind of city this run gets.
 *
 * Ice is weather. Nothing the player did decides it: no streak, no unlock, no
 * difficulty, no time of day — a quarter of cities have some, drawn from the
 * run's own seeded generator so a seeded run is still the same run twice.
 *
 * A build that has another idea — the Toss daily, which owes every player the
 * same city — sets the override, and then that is the city for as long as it
 * is set.
 */
let override: CityPlan | null = null;

/** Fixes the plan for every city drawn until it is cleared with null. */
export const setCityPlan = (plan: CityPlan | null): void => {
    override = plan;
};

export const cityPlanOverride = (): CityPlan | null => override;

export const resolveCityPlan = (rng: GridRng): CityPlan => {
    if (override) return override;

    // Both draws happen either way, so the stream does not fork on the
    // outcome: two runs of one seed freeze the same streets or neither does.
    const rolled = rng.frac();
    const share = rng.realInRange(GameConfig.ICE.ORDINARY.MIN, GameConfig.ICE.ORDINARY.MAX);

    return rolled < GameConfig.ICE.CHANCE ? { ice: share } : {};
};
