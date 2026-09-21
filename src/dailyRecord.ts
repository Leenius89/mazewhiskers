import { isNextDay } from './game/core/daily';

/**
 * What this browser has done with today's city.
 *
 * The web build has no idea who is playing — the leaderboard asks for a name
 * at the end of a run and forgets it — so this is deliberately small: the
 * day, the best score on it, how many goes it took, and how many days in a
 * row the city has been visited. It never leaves the machine.
 */
export interface DailyRecord {
    /** The day `best` and `tries` belong to. Empty until the first daily run. */
    date: string;
    best: number;
    tries: number;
    /** Days in a row with at least one run of that day's city. */
    streak: number;
}

const KEY = 'mazewhiskers.daily';
const EMPTY: DailyRecord = { date: '', best: 0, tries: 0, streak: 0 };

const whole = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

export const readDailyRecord = (): DailyRecord => {
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return { ...EMPTY };

        const stored = JSON.parse(raw) as Partial<DailyRecord>;
        if (typeof stored.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(stored.date)) return { ...EMPTY };

        return {
            date: stored.date,
            best: whole(stored.best),
            tries: whole(stored.tries),
            streak: whole(stored.streak)
        };
    } catch {
        // A private window, or storage switched off. Today is simply new.
        return { ...EMPTY };
    }
};

/** Files a finished run of a day's city and hands back the shelf as it now is. */
export const fileDailyRun = (date: string, score: number): DailyRecord => {
    const held = readDailyRecord();
    const sameDay = held.date === date;

    const next: DailyRecord = sameDay
        ? { ...held, best: Math.max(held.best, Math.round(score)), tries: held.tries + 1 }
        : {
              date,
              best: Math.round(score),
              tries: 1,
              // Yesterday's city keeps the run of days going; any gap starts it again.
              streak: held.date && isNextDay(held.date, date) ? held.streak + 1 : 1
          };

    try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        // Not worth failing a run over; the number is a nicety.
    }

    return next;
};
