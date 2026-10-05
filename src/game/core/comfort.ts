import { getSettings } from '../../settings';

/** Asked once: some callers ask every frame, and `matches` follows the setting live. */
const phoneAsks: MediaQueryList | null = (() => {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
        return null;
    }
})();

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
export const calm = (): boolean => getSettings().reducedEffects || !!phoneAsks?.matches;

/** How much of a shake or a flash survives when the screen is being kept still. */
export const CALM_SCALE = 0.25;
