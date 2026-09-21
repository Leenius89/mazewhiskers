import { CITY_KINDS, kindOf } from './cityKinds';
import type { CityKind } from './cityKinds';
import { setCityPlan } from './cityPlan';

/**
 * Today's city.
 *
 * One seed a day, the same for everybody: the same streets, the same fish,
 * home in the same place. What differs is the player — and the towers, which
 * go up around wherever this particular cat happens to be and so cannot be
 * the same for two people even in principle.
 *
 * Twenty days is one turn of the wheel: every kind of city comes up exactly
 * once before any of them comes up twice, and the order is reshuffled each
 * time round, so nobody can say "it is Tuesday, so it is the ring city".
 *
 * A seeded city only means anything because one seed now draws one city on
 * every machine (see mazeGrid). Before that fix this mode could not have
 * existed.
 */

/** The date in Korea, where the day turns over for everyone at once. */
export const todayKey = (now: number = Date.now()): string =>
    new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Whether `later` is the day after `earlier`. Both are `todayKey` strings. */
export const isNextDay = (earlier: string, later: string): boolean => {
    const a = Date.parse(`${earlier}T00:00:00Z`);
    const b = Date.parse(`${later}T00:00:00Z`);
    return Number.isFinite(a) && Number.isFinite(b) && b - a === 24 * 60 * 60 * 1000;
};

/** "9/21" — the day, the way it is said. */
export const shortDate = (key: string): string => {
    const [, month, day] = key.split('-');
    return `${Number(month)}/${Number(day)}`;
};

/** Day zero. Only its distance from a date matters, never the date itself. */
const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A shuffle that depends on nothing but the number it is given.
 *
 * Its own little generator rather than the city's: the kind has to be known
 * before the city is drawn — the menu names it — and it must not spend draws
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

/**
 * `?plan=glacier`, for looking at a kind of city without waiting for its day.
 *
 * Testing only: a released build ignores the address bar, so nobody can hand
 * a friend a link to an easier city than the one everyone else is playing.
 */
const forcedKind = (): CityKind | null => {
    if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_TOSS_SIM !== '1') return null;

    try {
        const asked = new URLSearchParams(window.location.search).get('plan');
        return asked ? kindOf(asked) ?? null : null;
    } catch {
        return null;
    }
};

export const kindForDay = (date: string): CityKind => {
    const forced = forcedKind();
    if (forced) return forced;

    const day = Math.floor((Date.parse(`${date}T00:00:00Z`) - EPOCH) / DAY_MS);
    // Days before the epoch would index backwards; this only matters to a
    // device with its clock set wrong, which still deserves a city.
    const turn = ((day % CITY_KINDS.length) + CITY_KINDS.length) % CITY_KINDS.length;
    const block = Math.floor(day / CITY_KINDS.length);

    return CITY_KINDS[orderFor(block)[turn]];
};

/**
 * The day the current run belongs to, or null for an ordinary run.
 *
 * Fixed when the run is chosen, not read again at the end of it: a run begun
 * at 23:59 is a run of that day's city and is filed under it.
 */
let armed: string | null = null;

export const armDaily = (): string => {
    armed = todayKey();

    // Everyone gets the same city, so the weather is not rolled for it: the
    // day's kind is fixed and the generator is told to stop improvising.
    setCityPlan(kindForDay(armed).plan);
    return armed;
};

export const disarmDaily = (): void => {
    armed = null;
    setCityPlan(null);
};

export const dailyDate = (): string | null => armed;

/** What kind of city today's is, or null on an ordinary run. */
export const dailyKind = (): CityKind | null => (armed ? kindForDay(armed) : null);

/** What the maze generator is seeded with. The district is folded in later. */
export const dailySeed = (): string | null => (armed ? `daily-${armed}` : null);
