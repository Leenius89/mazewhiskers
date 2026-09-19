import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * How this build presents itself to the Toss app.
 *
 * `appName` is the one value here that cannot be changed later: it is the id
 * registered in the console, the deep link (`intoss://mazewhiskers`) and the
 * host the game is served from (`https://mazewhiskers.apps.tossmini.com`).
 * It is lower case because the SDK insists on kebab-case and a hostname would
 * fold it anyway.
 *
 * Whether this is a game is not set here any more. SDK 2.x had
 * `webViewProps.type`; 3.x takes it from the category chosen in the console.
 */
export default defineConfig({
    appName: 'mazewhiskers',
    brand: {
        // Hazard tape. The one loud colour the game has.
        primaryColor: '#F0B429'
    },
    // The game asks the device for nothing.
    permissions: [],
    navigationBar: {
        // A game draws under the bar and keeps clear of its two buttons
        // itself; an opaque bar would take a strip off the top of the city.
        transparentBackground: true,
        // Said outright rather than left to defaults: the packer fills these
        // in as true, which is the non-game bar. A game's bar is "more" and
        // close, and nothing that could land on top of the run bar.
        withBackButton: false,
        withHomeButton: false,
        withTitle: false
    },
    webView: {
        // The joystick lives on the left edge. A thumb starting a drag there
        // is not asking to leave.
        allowsBackForwardNavigationGestures: false,
        // Nothing on these screens scrolls, so nothing should rubber-band.
        bounces: false,
        overScrollMode: 'never',
        pullToRefreshEnabled: false,
        allowsInlineMediaPlayback: true
    },
    // Where Create React App leaves its output.
    webBundleDir: 'build'
});
