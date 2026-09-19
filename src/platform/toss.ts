import {
    SafeArea,
    Storage,
    closeView,
    generateHapticFeedback,
    getOperationalEnvironment,
    getUserKeyForGame,
    graniteEvent,
    loadFullScreenAd,
    openGameCenterLeaderboard,
    setDeviceOrientation,
    setIosSwipeGestureEnabled,
    showFullScreenAd,
    submitGameCenterLeaderBoardScore
} from '@apps-in-toss/web-framework';

/**
 * The only file that talks to the Toss app.
 *
 * Every function the SDK exports throws when it is called anywhere but inside
 * the Toss WebView — not a rejected promise that could be ignored, a thrown
 * TypeError on the first property it reads. This build has to run in an
 * ordinary browser as well: that is how it is developed, and it is what the
 * rating board is handed as "the executable game". So nothing else in the
 * source imports the SDK, and everything here answers quietly with a fallback
 * when there is no Toss to talk to.
 */

let inside: boolean | null = null;

/** Whether the page is running inside the Toss app. Decided once. */
export const inToss = (): boolean => {
    if (inside !== null) return inside;

    try {
        const where = getOperationalEnvironment();
        inside = where === 'toss' || where === 'sandbox';
    } catch {
        inside = false;
    }

    return inside;
};

const warn = (what: string, error: unknown): void => {
    // Worth a line in a remote inspector, never worth interrupting a run.
    console.warn(`[toss] ${what}`, error);
};

/** Runs an SDK call if there is a Toss to run it against. */
const attempt = async <T>(what: string, run: () => Promise<T> | T, fallback: T): Promise<T> => {
    if (!inToss()) return fallback;

    try {
        return await run();
    } catch (error) {
        warn(what, error);
        return fallback;
    }
};

// ------------------------------------------------------------------ identity

/**
 * The player, as far as this game is allowed to know them.
 *
 * A hash that is the same for the same person in this mini-app on any device,
 * and different in every other mini-app. It never leaves the device from
 * here: it names the save slot and nothing else.
 */
export const fetchUserKey = async (): Promise<string | null> => {
    const result = await attempt('getUserKeyForGame', () => getUserKeyForGame(), undefined);

    if (result && typeof result === 'object' && result.type === 'HASH') return result.hash;
    return null;
};

// ------------------------------------------------------------------- storage

/**
 * Reads a value, preferring the copy the Toss app keeps.
 *
 * `localStorage` is synchronous and is what the settings module was built
 * on, so it stays the working copy. But iOS clears a WebView's storage after
 * a week of disuse, and a player who comes back on day eight should still
 * have their best run — the SDK's store is the one that survives that.
 */
export const recall = async (key: string): Promise<string | null> => {
    const kept = await attempt(`Storage.getItem(${key})`, () => Storage.getItem(key), null);
    if (kept !== null) return kept;

    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

/** Writes to both copies. Neither failing is allowed to fail the caller. */
export const remember = (key: string, value: string): void => {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Private mode. The Toss copy below still gets it.
    }

    void attempt(`Storage.setItem(${key})`, () => Storage.setItem(key, value), undefined);
};

/**
 * Brings the working copy back after the browser has thrown it away.
 *
 * Only fills gaps: a value already in `localStorage` is this session's and
 * is newer than anything the mirror holds.
 */
export const restore = async (keys: string[]): Promise<void> => {
    if (!inToss()) return;

    await Promise.all(
        keys.map(async (key) => {
            try {
                if (window.localStorage.getItem(key) !== null) return;
            } catch {
                return;
            }

            const kept = await attempt(`Storage.getItem(${key})`, () => Storage.getItem(key), null);
            if (kept === null) return;

            try {
                window.localStorage.setItem(key, kept);
            } catch {
                // Nothing to restore into.
            }
        })
    );
};

// --------------------------------------------------------------- leaderboard

export type SubmitOutcome =
    /** On the board. */
    | 'sent'
    /** Not in Toss, or a Toss too old to have a game centre. */
    | 'unavailable'
    /** Toss answered, and the answer was no. */
    | 'rejected';

/**
 * Puts a finished run on the Toss leaderboard.
 *
 * Only ever called after a run has ended. The game profile is created by
 * the Toss app as the game opens, and a score sent before that has finished
 * comes back PROFILE_NOT_FOUND.
 */
export const submitScore = async (score: number): Promise<SubmitOutcome> => {
    const result = await attempt(
        'submitGameCenterLeaderBoardScore',
        () => submitGameCenterLeaderBoardScore({ score: String(Math.max(0, Math.round(score))) }),
        undefined
    );

    if (!result) return 'unavailable';
    if (result.statusCode === 'SUCCESS') return 'sent';

    warn('submitGameCenterLeaderBoardScore', result.statusCode);
    return 'rejected';
};

/**
 * Opens Toss's own leaderboard screen.
 *
 * The mini-app goes to the background while it is up, so the visibility
 * handling in `lifecycle.ts` is what keeps the music from playing under it.
 * Resolves false when there is no such screen to open.
 */
export const openLeaderboard = async (): Promise<boolean> =>
    attempt(
        'openGameCenterLeaderboard',
        async () => {
            await openGameCenterLeaderboard();
            return true;
        },
        false
    );

// ---------------------------------------------------------------- navigation

/**
 * Takes over the Android back button.
 *
 * Subscribing at all switches off the default, which for a game with no
 * history is "close immediately" — so whoever calls this owes the player a
 * way out, and `leave` below is it. Returns the unsubscribe function.
 */
export const onBack = (handler: () => void): (() => void) => {
    if (!inToss()) return () => undefined;

    try {
        return graniteEvent.addEventListener('backEvent', {
            onEvent: handler,
            onError: (error) => warn('backEvent', error)
        });
    } catch (error) {
        warn('backEvent subscribe', error);
        return () => undefined;
    }
};

/** Closes the mini-app. Only after the player has said so. */
export const leave = (): void => {
    void attempt('closeView', () => closeView(), undefined);
};

// -------------------------------------------------------------------- screen

export interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export const readInsets = (): Insets => {
    if (!inToss()) return NO_INSETS;

    try {
        const { top, right, bottom, left } = SafeArea.get();
        return { top, right, bottom, left };
    } catch (error) {
        warn('SafeArea.get', error);
        return NO_INSETS;
    }
};

export const watchInsets = (listener: (insets: Insets) => void): (() => void) => {
    if (!inToss()) return () => undefined;

    try {
        return SafeArea.subscribe({
            onEvent: ({ top, right, bottom, left }) => listener({ top, right, bottom, left })
        });
    } catch (error) {
        warn('SafeArea.subscribe', error);
        return () => undefined;
    }
};

/**
 * Portrait, and no swipe-to-leave.
 *
 * Neither is in the config file: orientation only exists as a call, and the
 * iOS edge swipe has a config switch and a call and the forum says to use
 * both. A Toss too old for either just stays as it is.
 */
export const settleScreen = async (): Promise<void> => {
    await attempt('setDeviceOrientation', () => setDeviceOrientation({ type: 'portrait' }), undefined);
    await attempt('setIosSwipeGestureEnabled', () => setIosSwipeGestureEnabled({ isEnabled: false }), undefined);
};

// -------------------------------------------------------------------- haptics

export type Haptic = 'tap' | 'tickMedium' | 'success' | 'error';

let hapticsOn = true;

/** The game's own switch, on top of the one in Toss. Set from the settings at boot. */
export const setHaptics = (on: boolean): void => {
    hapticsOn = on;
};

/** A nudge. Does nothing when the player has vibration switched off, here or in Toss. */
export const haptic = (type: Haptic): void => {
    if (!hapticsOn) return;
    void attempt('generateHapticFeedback', () => generateHapticFeedback({ type }), undefined);
};

// ------------------------------------------------------------------------ ads

/** Whether this Toss can show a full-screen ad at all (5.227.0 and later). */
export const adsSupported = (): boolean => {
    if (!inToss()) return false;

    try {
        return loadFullScreenAd.isSupported() && showFullScreenAd.isSupported();
    } catch {
        return false;
    }
};

const AD_LOAD_TIMEOUT_MS = 15_000;
/** If nothing has appeared by now, the run carries on without it. */
const AD_APPEAR_TIMEOUT_MS = 6_000;

/** Fetches an ad ahead of time. Resolves false rather than rejecting. */
export const loadAd = (adGroupId: string): Promise<boolean> =>
    new Promise((resolve) => {
        if (!adsSupported()) return resolve(false);

        let settled = false;
        let unregister: (() => void) | undefined;
        const finish = (ok: boolean): void => {
            if (settled) return;
            settled = true;
            try {
                unregister?.();
            } catch {
                // Already gone.
            }
            resolve(ok);
        };

        try {
            unregister = loadFullScreenAd({
                options: { adGroupId },
                onEvent: (event) => {
                    if (event.type === 'loaded') finish(true);
                },
                onError: (error) => {
                    warn('loadFullScreenAd', error);
                    finish(false);
                }
            });
        } catch (error) {
            warn('loadFullScreenAd', error);
            finish(false);
        }

        window.setTimeout(() => finish(false), AD_LOAD_TIMEOUT_MS);
    });

export interface AdResult {
    /** The ad reached the screen. */
    shown: boolean;
    /** A rewarded ad was watched to the point where the reward is owed. */
    rewarded: boolean;
}

/**
 * Shows an ad that `loadAd` has already fetched, and waits for it to close.
 *
 * The reward is only ever taken from `userEarnedReward` — closing an ad is not
 * the same as having watched it, and the ad policy says so in as many words.
 */
export const showAd = (adGroupId: string): Promise<AdResult> =>
    new Promise((resolve) => {
        if (!adsSupported()) return resolve({ shown: false, rewarded: false });

        let settled = false;
        let shown = false;
        let rewarded = false;
        let unregister: (() => void) | undefined;
        const finish = (): void => {
            if (settled) return;
            settled = true;
            try {
                unregister?.();
            } catch {
                // Already gone.
            }
            resolve({ shown, rewarded });
        };

        try {
            unregister = showFullScreenAd({
                options: { adGroupId },
                onEvent: (event) => {
                    if (event.type === 'show' || event.type === 'impression') shown = true;
                    if (event.type === 'userEarnedReward') rewarded = true;
                    if (event.type === 'dismissed' || event.type === 'failedToShow') finish();
                },
                onError: (error) => {
                    warn('showFullScreenAd', error);
                    finish();
                }
            });
        } catch (error) {
            warn('showFullScreenAd', error);
            finish();
        }

        window.setTimeout(() => {
            if (!shown) finish();
        }, AD_APPEAR_TIMEOUT_MS);
    });
