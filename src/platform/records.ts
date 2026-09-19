import { useEffect, useState } from 'react';
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
}

const EMPTY: Records = { runs: 0, clears: 0, bestScore: 0, bestClearMs: 0, longestMs: 0 };

const KEY_OWNER = 'mazewhiskers.owner';
const slotFor = (owner: string): string => `mazewhiskers.records.${owner}`;

/** Runs played without a key — a browser, or a Toss that would not give one. */
const ANONYMOUS = 'local';

let owner = ANONYMOUS;
let current: Records = { ...EMPTY };
const listeners = new Set<(records: Records) => void>();

const parse = (raw: string | null): Records => {
    if (!raw) return { ...EMPTY };

    try {
        const stored = JSON.parse(raw) as Partial<Records>;
        const whole = (value: unknown): number =>
            typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

        return {
            runs: whole(stored.runs),
            clears: whole(stored.clears),
            bestScore: whole(stored.bestScore),
            bestClearMs: whole(stored.bestClearMs),
            longestMs: whole(stored.longestMs)
        };
    } catch {
        return { ...EMPTY };
    }
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
}

export interface RecordsBroken {
    score: boolean;
    clear: boolean;
}

/** Files a finished run, and says which of the player's own records it beat. */
export const fileRun = ({ score, lastedMs, clearedMs }: FinishedRun): RecordsBroken => {
    const cleared = typeof clearedMs === 'number' && clearedMs > 0;

    const broken: RecordsBroken = {
        // A first run is not a record, it is just a run.
        score: current.runs > 0 && score > current.bestScore,
        clear: cleared && current.bestClearMs > 0 && (clearedMs as number) < current.bestClearMs
    };

    const next: Records = {
        runs: current.runs + 1,
        clears: current.clears + (cleared ? 1 : 0),
        bestScore: Math.max(current.bestScore, Math.round(score)),
        bestClearMs: cleared
            ? current.bestClearMs > 0
                ? Math.min(current.bestClearMs, Math.round(clearedMs as number))
                : Math.round(clearedMs as number)
            : current.bestClearMs,
        longestMs: Math.max(current.longestMs, Math.round(lastedMs))
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
