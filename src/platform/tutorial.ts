import { remember } from './toss';

/**
 * Whether this player has already been walked through the city once.
 *
 * The gallery shows the tutorial on every run, because nearly everyone at a
 * gallery is seeing the game for the first time. A phone is the opposite: the
 * same person presses retry ten times in a row. So the lesson — the warning
 * line, the tower that follows it — is shown in full once, to the end, and
 * after that the run simply starts.
 *
 * Only a tutorial watched to the end counts. Leaving halfway means seeing it
 * again next time.
 */
export const TUTORIAL_KEY = 'mazewhiskers.tutorialSeen';

export const hasSeenTutorial = (): boolean => {
    try {
        return window.localStorage.getItem(TUTORIAL_KEY) !== null;
    } catch {
        return false;
    }
};

export const markTutorialSeen = (): void => remember(TUTORIAL_KEY, '1');

/** `?tutorial=1` shows it regardless, for checking it after a change. */
export const tutorialForced = (): boolean => {
    try {
        const value = new URLSearchParams(window.location.search).get('tutorial');
        return value === '1' || value === 'true';
    } catch {
        return false;
    }
};
