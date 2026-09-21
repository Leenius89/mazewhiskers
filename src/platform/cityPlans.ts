import { CITY_KINDS, kindOf } from '../game/core/cityKinds';
import type { CityKind } from '../game/core/cityKinds';

/**
 * Which kind of city today is.
 *
 * Today's city is not a map taken off a shelf: the layout comes from the
 * day's seed, so there are as many cities as there are days. What this file
 * settles is what *kind* of place today is — the twenty kinds live in the
 * game itself (`game/core/cityKinds`), since they are the generator's
 * business rather than Toss's.
 *
 * Twenty days is one turn of the wheel: every kind appears exactly once
 * before any of them appears twice, and the order is reshuffled each time
 * round, so nobody can say "it is Tuesday, so it is the ring city".
 */
export type DailyPlan = CityKind;

export const DAILY_PLANS = CITY_KINDS;

/** Day zero. Only its distance from a date matters, never the date itself. */
const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A shuffle that depends on nothing but the number it is given.
 *
 * Its own little generator rather than the city's: the kind has to be known
 * before the city is drawn (the menu names it), and it must not spend draws
 * the layout is going to need.
 */
const orderFor = (block: number): number[] => {
    let state = (block * 2654435761 + 1013904223) >>> 0;
    const next = (): number => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };

    const order = CITY_KINDS.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const held = order[i];
        order[i] = order[j];
        order[j] = held;
    }
    return order;
};

export const planFor = (date: string): DailyPlan => {
    const forced = forcedPlan();
    if (forced) return forced;

    const day = Math.floor((Date.parse(`${date}T00:00:00Z`) - EPOCH) / DAY_MS);
    // Days before the epoch would index backwards; this only matters to a
    // device with its clock set wrong, which still deserves a city.
    const turn = ((day % CITY_KINDS.length) + CITY_KINDS.length) % CITY_KINDS.length;
    const block = Math.floor(day / CITY_KINDS.length);

    return CITY_KINDS[orderFor(block)[turn]];
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
        return asked ? kindOf(asked) ?? null : null;
    } catch {
        return null;
    }
};
