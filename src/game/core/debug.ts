/**
 * Debug mode is opt-in per page load: append `?debug=1` to the URL.
 *
 * It turns on Arcade Physics body outlines and the DebugOverlay, which together
 * make collision bodies and depth values visible. Everything Phase 1 changes is
 * verified through this.
 */
export const isDebugEnabled = (): boolean => {
    try {
        const value = new URLSearchParams(window.location.search).get('debug');
        return value !== null && value !== '0' && value !== 'false';
    } catch {
        // SSR or a locked-down environment where `location` is unavailable.
        return false;
    }
};
