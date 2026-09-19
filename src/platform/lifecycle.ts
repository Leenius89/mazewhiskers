/**
 * Going to the background, and coming back.
 *
 * Toss's review checks two things by hand: that the sound stops the moment
 * the mini-app is backgrounded, and that it is there again on return. Nothing
 * in the platform does either for a WebView. Phaser silences itself on
 * `window.onblur`, which a WebView being covered is under no obligation to
 * fire, and the menu's soundtrack is a bare `Audio` element that nothing at
 * all was watching — so the music carried on under the home screen.
 *
 * `visibilitychange` is the signal Toss's own staff point to. This module
 * listens for it once and tells whoever has something to stop.
 */
export interface BackgroundHook {
    /** The page can no longer be seen. Be silent before returning. */
    onHide: () => void;
    /** The page is back in front of the player. */
    onShow: () => void;
}

const hooks = new Set<BackgroundHook>();
let hidden = false;

const hide = (): void => {
    if (hidden) return;
    hidden = true;
    hooks.forEach((hook) => hook.onHide());
};

const show = (): void => {
    if (!hidden) return;
    hidden = false;
    hooks.forEach((hook) => hook.onShow());
};

/** Returns the function that removes the hook again. */
export const onBackground = (hook: BackgroundHook): (() => void) => {
    hooks.add(hook);
    return () => {
        hooks.delete(hook);
    };
};

export const isBackgrounded = (): boolean => hidden;

/**
 * For screens Toss lays over the game without hiding the page.
 *
 * Its leaderboard is documented as backgrounding the mini-app, but whether
 * the WebView is told so is not, and music under a ranking table is exactly
 * what a reviewer would hear. So the caller goes quiet first, and the game
 * comes back on whichever arrives first: the page being shown again, or the
 * player touching it — which they cannot do while something is covering it.
 */
export const stepAside = (): void => {
    hide();

    const back = () => {
        window.removeEventListener('pointerdown', back, true);
        window.removeEventListener('focus', back);
        show();
    };

    // Not armed synchronously: the tap that opened the covering screen is
    // still being delivered, and would count as the player coming back.
    window.setTimeout(() => {
        if (!hidden) return;
        window.addEventListener('pointerdown', back, true);
        window.addEventListener('focus', back);
    }, 600);
};

let started = false;

export const startLifecycle = (): void => {
    if (started) return;
    started = true;

    document.addEventListener('visibilitychange', () => (document.hidden ? hide() : show()));
    // iOS does not always deliver visibilitychange to a page being put away;
    // pagehide is the one it does.
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', () => {
        if (!document.hidden) show();
    });
};
