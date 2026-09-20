import type { CityPlan } from '../game/core/mazeGrid';

/**
 * What kind of city today is.
 *
 * Today's city is not a fixed list of maps that runs out: the layout is drawn
 * from the day's seed, so there are as many cities as there are days. What
 * this file adds is the other half of the variety — what *kind* of city it is
 * — so two days running do not feel like the same place with the walls moved.
 *
 * Each plan is a set of dials on the generator, and the day chooses one. The
 * full set of twenty is a design document (store-assets/plan/오늘의-도시-20종.md);
 * what is implemented here is the dial that exists today, which is the ice.
 */
export interface DailyPlan extends CityPlan {
    /** Stable id, so a plan can be named in records and in a screenshot. */
    key: string;
    /** Shown on the menu button and the results screen. */
    label: { ko: string; en: string };
}

export const DAILY_PLANS: DailyPlan[] = [
    { key: 'plain', label: { ko: '보통 도시', en: 'Ordinary city' } },
    { key: 'frost', label: { ko: '서리 낀 골목', en: 'Frosted alleys' }, ice: 0.1 },
    { key: 'blackice', label: { ko: '빙판 도시', en: 'Black ice' }, ice: 0.3 },
    { key: 'glacier', label: { ko: '얼어붙은 도시', en: 'Frozen over' }, ice: 0.55 }
];

/**
 * The same day gives the same plan to everybody.
 *
 * A cheap string hash rather than the seeded generator: the plan has to be
 * known before the city is drawn (the menu names it), and it must not consume
 * draws the layout is going to need.
 */
export const planFor = (date: string): DailyPlan => {
    const forced = forcedPlan();
    if (forced) return forced;

    let hash = 0;
    for (let i = 0; i < date.length; i++) hash = (hash * 31 + date.charCodeAt(i)) >>> 0;
    return DAILY_PLANS[hash % DAILY_PLANS.length];
};

/**
 * `?plan=glacier`, for looking at a kind of city without waiting for its day.
 *
 * Testing only: a released build ignores the address bar, so nobody can hand
 * a friend a link to an easier city than the one everyone else is playing.
 */
const forcedPlan = (): DailyPlan | null => {
    if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_TOSS_SIM !== '1') return null;

    try {
        const asked = new URLSearchParams(window.location.search).get('plan');
        return DAILY_PLANS.find((plan) => plan.key === asked) ?? null;
    } catch {
        return null;
    }
};
