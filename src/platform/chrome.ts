import { useEffect, useState } from 'react';
import { inToss, readInsets, watchInsets } from './toss';
import type { Insets } from './toss';

/**
 * The parts of the screen that belong to somebody else.
 *
 * Inside Toss a game is drawn edge to edge, under the status bar, and the app
 * floats two buttons of its own — "more" and a close X — over the top right
 * corner. The documentation gives the X's position (right inset + 10, top
 * inset + 5 on iOS and + 10 on Android) and says a game control overlapping
 * it is grounds for rejection; it does not give the buttons' size. The only
 * published figure is the 54px the devtools simulator uses for the bar, so
 * that is the band kept clear here until it has been measured on a phone.
 */
export interface Chrome extends Insets {
    /** Height of the strip under the top inset that the Toss buttons sit in. */
    navBand: number;
    /** Width kept empty at the right end of that strip. */
    navReserve: number;
}

const NAV_BAND = 54;
const NAV_RESERVE = 124;

const NONE: Chrome = { top: 0, right: 0, bottom: 0, left: 0, navBand: 0, navReserve: 0 };

/**
 * A stand-in phone, for checking the layout without one.
 *
 * `?tossSim=1` gives the page an iPhone's insets and draws the two buttons
 * where Toss would. It exists in development and in builds made with
 * REACT_APP_TOSS_SIM=1, and not in anything that ships.
 */
export const isSimulated = (): boolean => {
    if (inToss()) return false;
    if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_TOSS_SIM !== '1') return false;

    try {
        return new URLSearchParams(window.location.search).get('tossSim') === '1';
    } catch {
        return false;
    }
};

const SIMULATED: Insets = { top: 47, right: 0, bottom: 34, left: 0 };

const withNav = (insets: Insets): Chrome => ({ ...insets, navBand: NAV_BAND, navReserve: NAV_RESERVE });

const measure = (): Chrome => {
    if (inToss()) return withNav(readInsets());
    if (isSimulated()) return withNav(SIMULATED);
    return NONE;
};

let current: Chrome = NONE;
const listeners = new Set<(chrome: Chrome) => void>();

/** Publishes the numbers to CSS as well, for the styles that are not React's. */
const publish = (chrome: Chrome): void => {
    current = chrome;

    const root = document.documentElement.style;
    root.setProperty('--mw-top', `${chrome.top}px`);
    root.setProperty('--mw-right', `${chrome.right}px`);
    root.setProperty('--mw-bottom', `${chrome.bottom}px`);
    root.setProperty('--mw-left', `${chrome.left}px`);
    root.setProperty('--mw-nav', `${chrome.navBand}px`);

    listeners.forEach((listener) => listener(chrome));
};

/** Reads the insets once and keeps them current. Call once, at boot. */
export const startChrome = (): void => {
    publish(measure());
    watchInsets((insets) => publish(withNav(insets)));
};

export const getChrome = (): Chrome => current;

export const useChrome = (): Chrome => {
    const [chrome, setChrome] = useState(current);

    useEffect(() => {
        // Boot may have finished between the first render and this effect.
        setChrome(current);
        listeners.add(setChrome);
        return () => {
            listeners.delete(setChrome);
        };
    }, []);

    return chrome;
};
