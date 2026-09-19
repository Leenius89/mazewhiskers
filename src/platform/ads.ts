import { useEffect, useState } from 'react';
import { isSimulated } from './chrome';
import { grantStartBonus, onStartBonusChanged, startBonusHeld } from './startBonus';
import { adsSupported, loadAd, showAd } from './toss';

/**
 * When an ad is shown, and what it is allowed to touch.
 *
 * Two placements, and both sit between runs. Nothing is ever shown while the
 * cat is moving, nothing covers the city, and a run never waits on an ad that
 * has not arrived: if it is not loaded by the time it would be shown, the
 * player simply goes on.
 *
 *   between runs   a full-screen ad on the way out of a results screen — not
 *                  after the first run of a visit, and not more often than
 *                  the gap below allows
 *   by choice      on the results screen, the player can watch one to start
 *                  the next run with a second carton of milk (one more jump)
 *
 * The reward changes what the cat sets out with and nothing about how the
 * city behaves, so a run with it plays by exactly the rules a run without it
 * does.
 */

/**
 * Ad group IDs, from the Toss console (워크스페이스 → 광고 → 광고 그룹).
 *
 * These are the SDK's public test IDs. They show a test ad and earn nothing;
 * using real IDs during testing is against the ad policy, so the real ones go
 * in through the build environment (see TOSS.md) and only in a release build.
 */
const TEST_UNITS = {
    interstitial: 'ait-ad-test-interstitial-id',
    rewarded: 'ait-ad-test-rewarded-id'
} as const;

export const AD_UNITS = {
    interstitial: process.env.REACT_APP_AD_INTERSTITIAL || TEST_UNITS.interstitial,
    rewarded: process.env.REACT_APP_AD_REWARDED || TEST_UNITS.rewarded
};

export const AD_POLICY = {
    /** Runs finished this visit before the first between-runs ad. */
    FREE_RUNS: 1,
    /** Least time between two between-runs ads. */
    MIN_GAP_MS: 150_000,
    /** Jumps added to the next run by a watched rewarded ad. */
    REWARD_JUMPS: 1
} as const;

type Unit = keyof typeof AD_UNITS;

const ready: Record<Unit, boolean> = { interstitial: false, rewarded: false };
const loading: Record<Unit, boolean> = { interstitial: false, rewarded: false };
const listeners = new Set<() => void>();
const changed = (): void => listeners.forEach((listener) => listener());

let runsThisVisit = 0;
let lastInterstitialAt = 0;

const available = (): boolean => adsSupported() || isSimulated();

const fetchUnit = async (unit: Unit): Promise<void> => {
    if (!available() || ready[unit] || loading[unit]) return;

    loading[unit] = true;
    // The simulator has nothing to fetch; it is "loaded" after a beat so the
    // not-ready-yet state is on screen long enough to be looked at.
    const ok = isSimulated()
        ? await new Promise<boolean>((resolve) => window.setTimeout(() => resolve(true), 600))
        : await loadAd(AD_UNITS[unit]);
    loading[unit] = false;
    ready[unit] = ok;
    changed();
};

/** Starts fetching both ads. Called once the first screen is up. */
export const warmAds = (): void => {
    void fetchUnit('interstitial');
    void fetchUnit('rewarded');
};

/** A stand-in for an ad, for a browser. Never part of a build that ships. */
const simulate = (label: string, ms: number): Promise<void> =>
    new Promise((resolve) => {
        const sheet = document.createElement('div');
        sheet.setAttribute('data-sim-ad', label);
        sheet.style.cssText =
            'position:fixed;inset:0;z-index:99999;background:#101114;color:#f4eee2;display:flex;' +
            'flex-direction:column;align-items:center;justify-content:center;gap:12px;' +
            "font:600 15px 'Pretendard',sans-serif;text-align:center";
        sheet.innerHTML = `<span style="font-size:11px;letter-spacing:.2em;opacity:.6">AD · SIMULATED</span><span>${label}</span>`;
        document.body.appendChild(sheet);
        window.setTimeout(() => {
            sheet.remove();
            resolve();
        }, ms);
    });

const present = async (unit: Unit): Promise<{ shown: boolean; rewarded: boolean }> => {
    ready[unit] = false;
    changed();

    const result = isSimulated()
        ? await simulate(unit, 1500).then(() => ({ shown: true, rewarded: unit === 'rewarded' }))
        : await showAd(AD_UNITS[unit]);

    // Load → show → load the next, as the ad guide asks.
    void fetchUnit(unit);
    return result;
};

/** Counts a finished run towards the between-runs ad. */
export const noteRunFinished = (): void => {
    runsThisVisit += 1;
};

/**
 * The between-runs ad, if one is due. Resolves when the way is clear.
 *
 * `quiet` and `resume` bracket the ad itself, so the music can be stopped for
 * exactly as long as something else is making noise.
 */
export const betweenRuns = async (quiet: () => void, resume: () => void): Promise<void> => {
    const due =
        available() &&
        ready.interstitial &&
        runsThisVisit > AD_POLICY.FREE_RUNS &&
        Date.now() - lastInterstitialAt >= AD_POLICY.MIN_GAP_MS;
    if (!due) return;

    quiet();
    try {
        const { shown } = await present('interstitial');
        if (shown) lastInterstitialAt = Date.now();
    } finally {
        resume();
    }
};

/**
 * The ad the player asked for. Resolves true when the reward is theirs.
 *
 * Watching it also stands in for the between-runs ad: nobody should sit
 * through one by choice and then another on the way out.
 */
export const watchForMilk = async (quiet: () => void, resume: () => void): Promise<boolean> => {
    if (!available() || !ready.rewarded) return false;

    quiet();
    try {
        const { shown, rewarded } = await present('rewarded');
        if (shown) lastInterstitialAt = Date.now();
        if (rewarded) {
            grantStartBonus(AD_POLICY.REWARD_JUMPS);
        }
        return rewarded;
    } finally {
        resume();
    }
};

export interface AdState {
    /** A rewarded ad is loaded and can be offered. */
    rewardedReady: boolean;
    /** The next run already has its extra milk. */
    bonusHeld: boolean;
}

const snapshot = (): AdState => ({ rewardedReady: available() && ready.rewarded, bonusHeld: startBonusHeld() });

export const useAds = (): AdState => {
    const [state, setState] = useState(snapshot);

    useEffect(() => {
        const listener = () => setState(snapshot());
        listeners.add(listener);
        const offBonus = onStartBonusChanged(listener);
        listener();
        return () => {
            listeners.delete(listener);
            offBonus();
        };
    }, []);

    return state;
};
