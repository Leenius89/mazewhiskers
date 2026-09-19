import { startChrome } from './chrome';
import { startLifecycle } from './lifecycle';
import { openRecords } from './records';
import { restore, settleScreen } from './toss';
import { SETTINGS_KEY, reloadSettings } from '../settings';

/** Longest the first render will wait for Toss to hand back saved settings. */
const RESTORE_BUDGET_MS = 600;

/** The opening is only played once; this is where that is remembered. */
export const SEEN_INTRO_KEY = 'mazewhiskers.seenIntro';

/**
 * Asks for every face up front.
 *
 * The browser fetches a font the first time something on the page uses it,
 * which is fine for HTML and wrong for a canvas: Phaser draws a line of
 * dialogue into a texture once, in whatever font was ready at that moment,
 * and never redraws it. The bold weight is first needed mid-game, so without
 * this the first bold line is set in the system fallback for good.
 */
const warmFonts = (): void => {
    try {
        const faces = ["16px 'Press Start 2P'", '400 16px Pretendard', '600 16px Pretendard', '700 16px Pretendard'];
        // A Hangul sample: `load` only fetches faces that cover the text given.
        faces.forEach((face) => void document.fonts.load(face, 'A가').catch(() => undefined));
    } catch {
        // No Font Loading API. The faces still arrive, a little later.
    }
};

/**
 * Everything that has to be true before the first frame.
 *
 * Only one thing here is waited for: getting the player's settings back if
 * the browser has dropped them, because a game that was muted has to come up
 * muted rather than correct itself a second into the title music. It is given
 * a short budget and then the page renders regardless — Toss's review allows
 * ten seconds to the first screen and this should not be what spends them.
 *
 * The player's key, their records and the screen lock all arrive when they
 * arrive; nothing on the first screen depends on them.
 */
export const bootPlatform = async (): Promise<void> => {
    startLifecycle();
    startChrome();

    void settleScreen();
    void openRecords();
    warmFonts();

    await Promise.race([
        restore([SETTINGS_KEY, SEEN_INTRO_KEY]).then(reloadSettings),
        new Promise<void>((resolve) => window.setTimeout(resolve, RESTORE_BUDGET_MS))
    ]);
};
