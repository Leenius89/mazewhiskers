import { getSettings, subscribe } from '../../settings';
import type { Appearance } from '../../settings';

/**
 * The two colours the canvas needs from the interface's palette.
 *
 * Almost nothing drawn inside the game changes with the light: the city is a
 * night city in both, and repainting it would mean redrawing every sprite. What
 * does change is the furniture laid over it — the dialogue box the tutorial
 * speaks through, and the shade behind it. Those are the game talking to the
 * player rather than the player looking at the world, so they belong to the
 * same palette as the panels outside the canvas.
 *
 * Numbers here are Phaser colours (0xRRGGBB) and CSS strings, because that is
 * what the two APIs take; they are the same values as the light and dark sets
 * in components/theme.
 */
export interface CanvasPalette {
    /** Dialogue box fill. */
    box: number;
    boxAlpha: number;
    /** Its border, and the highlight ring around whatever is being pointed at. */
    highlight: number;
    /** The dim laid over the world while a beat is on screen. */
    shade: number;
    shadeAlpha: number;

    text: string;
    speaker: string;
    hint: string;
    skip: string;
    /** Behind the skip prompt, so it stays readable over whatever it sits on. */
    skipBackground: string;
}

const DARK: CanvasPalette = {
    box: 0x0b0d13,
    boxAlpha: 0.94,
    highlight: 0xf0b429,
    shade: 0x05070c,
    shadeAlpha: 0.78,

    text: '#e7e9ee',
    speaker: '#f0b429',
    hint: '#8b919c',
    skip: '#ffffff',
    skipBackground: 'rgba(11,13,19,0.92)'
};

/**
 * Beige, and a lighter shade over the world.
 *
 * The box is the same notice-board colour the panels use. The shade behind it
 * is still a dim rather than a wash — the world underneath is dark, so lifting
 * it towards white would turn the city grey and lose the one thing the dim is
 * for, which is telling the player the game has stopped.
 */
const LIGHT: CanvasPalette = {
    box: 0xeae3d3,
    boxAlpha: 0.97,
    highlight: 0x96590a,
    shade: 0x1a1710,
    shadeAlpha: 0.66,

    text: '#24211a',
    speaker: '#96590a',
    hint: '#6d6656',
    skip: '#24211a',
    skipBackground: 'rgba(234,227,211,0.94)'
};

const PALETTES: Record<Appearance, CanvasPalette> = { dark: DARK, light: LIGHT };

/**
 * The set in force, mutated in place.
 *
 * Same arrangement as the interface palette: callers hold this object, and a
 * change of setting refills it rather than replacing it.
 */
export const canvasTheme: CanvasPalette = { ...PALETTES[getSettings().appearance] };

const listeners = new Set<() => void>();

const apply = (appearance: Appearance): void => {
    Object.assign(canvasTheme, PALETTES[appearance]);
    listeners.forEach((listener) => listener());
};

subscribe((settings) => apply(settings.appearance));

/**
 * Called after the palette has changed, so anything already drawn can repaint.
 *
 * A Graphics object holds pixels, not a colour: changing the palette does
 * nothing to a box that was filled before the change. Returns an unsubscribe.
 */
export const onCanvasThemeChange = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
