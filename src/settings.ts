import { useCallback, useEffect, useState } from 'react';
import { DIFFICULTIES } from './game/core/difficulty';
import type { DifficultyKey } from './game/core/difficulty';

export type Language = 'ko' | 'en';

/**
 * Which light the interface is in.
 *
 * The game world is a night city and stays one; this is the chrome around it —
 * the menu, the panels, the leaderboard. A kiosk under gallery lights and a
 * phone in a dark room want opposite things from the same screens.
 */
export type Appearance = 'dark' | 'light';

export interface Settings {
    muted: boolean;
    language: Language;
    difficulty: DifficultyKey;
    appearance: Appearance;
}

const STORAGE_KEY = 'mazewhiskers.settings';

const DEFAULTS: Settings = {
    muted: false,
    language: 'ko',
    // The game as it already was.
    difficulty: 'easy',
    appearance: 'dark'
};

/**
 * Preferences that outlive a run, and the page.
 *
 * Deliberately a module-level store rather than React context: the Phaser side
 * has to read these too, and it lives outside the component tree. Subscribers
 * cover both — React through the hook below, the game through `subscribe`.
 *
 * A kiosk that has been muted should stay muted when the next visitor restarts
 * it, so this survives a reload; a private window that refuses storage falls
 * back to the defaults rather than breaking.
 */
let current: Settings = load();

const listeners = new Set<(settings: Settings) => void>();

function load(): Settings {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULTS };

        const parsed = JSON.parse(raw) as Partial<Settings>;
        return {
            muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULTS.muted,
            language: parsed.language === 'en' ? 'en' : 'ko',
            difficulty:
                parsed.difficulty && parsed.difficulty in DIFFICULTIES
                    ? parsed.difficulty
                    : DEFAULTS.difficulty,
            appearance: parsed.appearance === 'light' ? 'light' : 'dark'
        };
    } catch {
        return { ...DEFAULTS };
    }
}

export const getSettings = (): Settings => current;

export const setSettings = (patch: Partial<Settings>): void => {
    current = { ...current, ...patch };

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
        // A locked-down browser still gets the setting for this session.
    }

    listeners.forEach((listener) => listener(current));
};

/** Returns an unsubscribe function. */
export const subscribe = (listener: (settings: Settings) => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** React binding. Re-renders the component whenever any setting changes. */
export const useSettings = (): [Settings, (patch: Partial<Settings>) => void] => {
    const [settings, setLocal] = useState(current);

    useEffect(() => subscribe(setLocal), []);

    const update = useCallback((patch: Partial<Settings>) => setSettings(patch), []);

    return [settings, update];
};
