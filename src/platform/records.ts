import { useEffect, useState } from 'react';
import { isNextDay } from './daily';
import { fetchUserKey, recall, remember } from './toss';

/**
 * What this player has done before.
 *
 * The web build has no idea who is playing: a record exists only if somebody
 * types a name under it, and the next run starts from nothing. Toss's
 * checklist asks for the opposite — that the game knows the player from the
 * key Toss issues, and that their runs are still there when they come back.
 *
 * So the key is fetched as the page boots and used as the name of a save
 * slot. It is never sent anywhere. The ranking that has to survive a change
 * of phone lives in Toss's game centre; this is the player's own shelf.
 */
export interface Records {
    runs: number;
    clears: number;
    /** Best leaderboard score, on any difficulty. */
    bestScore: number;
    /** Fastest clear, in milliseconds. Zero until there has been one. */
    bestClearMs: number;
    /** Longest a run has lasted, cleared or not. */
    longestMs: number;
    /**
     * How many times each ending has been reached, by its key.
     *
     * The seven ways a run is lost, and `home` for the one way it is not.
     * An ending that is absent has not been seen.
     */
    endings: Record<string, number>;
    /** Today's city. One entry, overwritten when the day changes. */
    daily: DailyRecord;
}

export interface DailyRecord {
    /** The day `best` and `tries` belong to. Empty until the first daily run. */
    date: string;
    best: number;
    tries: number;
    /** Days in a row with at least one run of that day's city. */
    streak: number;
}

/** Every ending there is to find, in the order the catalogue lists them. */
export const ENDING_KEYS = [
    'home',
    'enemy',
    'health',
    'apartment:player',
    'apartment:goal',
    'sealed',
    'trapped',
    'idle'
] as const;

const NO_DAILY: DailyRecord = { date: '', best: 0, tries: 0, streak: 0 };

const empty = (): Records => ({
    runs: 0,
    clears: 0,
    bestScore: 0,
    bestClearMs: 0,
    longestMs: 0,
    endings: {},
    daily: { ...NO_DAILY }
});

const KEY_OWNER = 'mazewhiskers.owner';
const slotFor = (owner: string): string => `mazewhiskers.records.${owner}`;

/** Runs played without a key — a browser, or a Toss that would not give one. */
const ANONYMOUS = 'local';

let owner = ANONYMOUS;
let current: Records = empty();
const listeners = new Set<(records: Records) => void>();

const parse = (raw: string | null): Records => {
    if (!raw) return empty();

    try {
        const stored = JSON.parse(raw) as Partial<Records>;
        const whole = (value: unknown): number =>
            typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

        return {
            runs: whole(stored.runs),
            clears: whole(stored.clears),
            bestScore: whole(stored.bestScore),
            bestClearMs: whole(stored.bestClearMs),
            longestMs: whole(stored.longestMs),
            endings: endingsOf(stored.endings, whole),
            daily: dailyOf(stored.daily, whole)
        };
    } catch {
        return empty();
    }
};

const endingsOf = (stored: unknown, whole: (value: unknown) => number): Record<string, number> => {
    const out: Record<string, number> = {};
    if (!stored || typeof stored !== 'object') return out;

    ENDING_KEYS.forEach((key) => {
        const seen = whole((stored as Record<string, unknown>)[key]);
        if (seen > 0) out[key] = seen;
    });
    return out;
};

const dailyOf = (stored: unknown, whole: (value: unknown) => number): DailyRecord => {
    if (!stored || typeof stored !== 'object') return { ...NO_DAILY };

    const daily = stored as Partial<DailyRecord>;
    if (typeof daily.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(daily.date)) return { ...NO_DAILY };

    return { date: daily.date, best: whole(daily.best), tries: whole(daily.tries), streak: whole(daily.streak) };
};

const publish = (records: Records): void => {
    current = records;
    listeners.forEach((listener) => listener(records));
};

/**
 * Finds out who is playing and opens their slot.
 *
 * Never rejects, and the game does not wait on it: a Toss that refuses the
 * key, or takes its time, costs the player their shelf for this session and
 * nothing else.
 */
export const openRecords = async (): Promise<void> => {
    const key = await fetchUserKey();

    if (key) {
        owner = key;
        remember(KEY_OWNER, key);
    } else {
        // Offline or refused this time: fall back to whoever was here last,
        // so a flaky start does not show a returning player an empty shelf.
        owner = (await recall(KEY_OWNER)) ?? ANONYMOUS;
    }

    publish(parse(await recall(slotFor(owner))));
};

export interface FinishedRun {
    score: number;
    lastedMs: number;
    clearedMs?: number;
    /** One of `ENDING_KEYS`. */
    ending: string;
    /** The day whose city this was, for a run of today's city. */
    dailyDate?: string | null;
}

export interface RecordsBroken {
    score: boolean;
    clear: boolean;
    /** First time this ending has been reached. */
    newEnding: boolean;
    /** Beat this player's own best on today's city (never true on the first try). */
    daily: boolean;
}

/** Files a finished run, and says which of the player's own records it beat. */
export const fileRun = ({ score, lastedMs, clearedMs, ending, dailyDate }: FinishedRun): RecordsBroken => {
    const cleared = typeof clearedMs === 'number' && clearedMs > 0;

    const broken: RecordsBroken = {
        // A first run is not a record, it is just a run.
        score: current.runs > 0 && score > current.bestScore,
        clear: cleared && current.bestClearMs > 0 && (clearedMs as number) < current.bestClearMs,
        newEnding: !current.endings[ending],
        daily: false
    };

    let daily = current.daily;
    if (dailyDate) {
        const sameDay = daily.date === dailyDate;
        broken.daily = sameDay && daily.tries > 0 && score > daily.best;

        daily = sameDay
            ? { ...daily, best: Math.max(daily.best, Math.round(score)), tries: daily.tries + 1 }
            : {
                  date: dailyDate,
                  best: Math.round(score),
                  tries: 1,
                  // Yesterday's city keeps the run of days going; any gap starts it again.
                  streak: daily.date && isNextDay(daily.date, dailyDate) ? daily.streak + 1 : 1
              };
    }

    const next: Records = {
        runs: current.runs + 1,
        clears: current.clears + (cleared ? 1 : 0),
        bestScore: Math.max(current.bestScore, Math.round(score)),
        bestClearMs: cleared
            ? current.bestClearMs > 0
                ? Math.min(current.bestClearMs, Math.round(clearedMs as number))
                : Math.round(clearedMs as number)
            : current.bestClearMs,
        longestMs: Math.max(current.longestMs, Math.round(lastedMs)),
        endings: { ...current.endings, [ending]: (current.endings[ending] ?? 0) + 1 },
        daily
    };

    remember(slotFor(owner), JSON.stringify(next));
    publish(next);

    return broken;
};

export const getRecords = (): Records => current;

export const useRecords = (): Records => {
    const [records, setRecords] = useState(current);

    useEffect(() => {
        setRecords(current);
        listeners.add(setRecords);
        return () => {
            listeners.delete(setRecords);
        };
    }, []);

    return records;
};
