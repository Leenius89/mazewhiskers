/**
 * Today's city.
 *
 * One seed a day, the same for everybody: the same streets, the same fish,
 * home in the same place. What differs is the player — and the towers, which
 * go up around wherever this particular cat happens to be and so cannot be
 * the same for two people even in principle.
 *
 * A seeded city only means something because one seed now draws one city on
 * every phone (see game/core/mazeGrid). Before that fix this mode could not
 * have existed.
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

/**
 * The day the current run belongs to, or null for an ordinary run.
 *
 * Fixed when the run is chosen, not read again at the end of it: a run begun
 * at 23:59 is a run of that day's city and is filed under it.
 */
let armed: string | null = null;

export const armDaily = (): string => {
    armed = todayKey();
    return armed;
};

export const disarmDaily = (): void => {
    armed = null;
};

export const dailyDate = (): string | null => armed;

/** What the maze generator is seeded with. The district is folded in later. */
export const dailySeed = (): string | null => (armed ? `daily-${armed}` : null);

/** "9/20" — the day, the way it is said. */
export const shortDate = (key: string): string => {
    const [, month, day] = key.split('-');
    return `${Number(month)}/${Number(day)}`;
};
