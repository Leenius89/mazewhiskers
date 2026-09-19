import { getSettings } from '../../settings';

/**
 * Whether the screen should be kept still.
 *
 * True when the player has asked for it in the settings, or when their phone
 * already asks every app for it. Read where an effect is about to fire rather
 * than once at start, so the switch takes hold in the middle of a run.
 *
 * What it changes is only ever what is drawn. Nothing the cat, the black cat
 * or the towers do depends on it, so a run plays out the same either way.
 */
export const calm = (): boolean => {
    if (getSettings().reducedEffects) return true;

    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
};

/** How much of a shake or a flash survives when the screen is being kept still. */
export const CALM_SCALE = 0.25;
