import pkg from '../package.json';

/**
 * The build's version, taken from package.json rather than written out again.
 *
 * A number typed into a component is a number that goes stale the first time
 * somebody bumps the real one, and nobody ever notices because a wrong version
 * looks exactly like a right one. This is the same string npm and the tag see.
 */
export const VERSION: string = pkg.version;

/** How it is shown: `v0.1.0`. */
export const VERSION_LABEL = `v${VERSION}`;
