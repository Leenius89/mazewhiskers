/**
 * Debug mode is opt-in per page load: append `?debug=1` to the URL.
 *
 * It turns on Arcade Physics body outlines and the DebugOverlay, which together
 * make collision bodies and depth values visible. Everything Phase 1 changes is
 * verified through this.
 */
export const isDebugEnabled = (): boolean => {
    // The Toss bundle is handed to a reviewer and then to the public. A URL
    // switch that draws collision boxes and hangs the scene off `window` has
    // no business in it; it stays for development and for verification
    // builds, which are made with REACT_APP_TOSS_SIM=1.
    if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_TOSS_SIM !== '1') return false;

    try {
        const value = new URLSearchParams(window.location.search).get('debug');
        return value !== null && value !== '0' && value !== 'false';
    } catch {
        // SSR or a locked-down environment where `location` is unavailable.
        return false;
    }
};
