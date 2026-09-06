import type { CSSProperties } from 'react';
import { getSettings, subscribe } from '../settings';
import type { Appearance } from '../settings';

/**
 * One palette for every screen outside the canvas, in two lights.
 *
 * The result screens were each styled on their own — one green box, one red box,
 * different fonts, different buttons — so arriving at them felt like leaving the
 * game. These are the same colours the world uses: concrete, hazard amber, the
 * teal of the goal marker.
 *
 * The light set is the same city at midday rather than a different design.
 * Concrete stays concrete; the amber darkens because amber on white is not
 * legible, and the inks invert. Nothing changes place or size, so a screenshot
 * of one lines up with a screenshot of the other.
 */
interface Palette {
    ground: string;
    surface: string;
    surfaceRaised: string;
    rule: string;

    ink: string;
    inkMuted: string;
    inkFaint: string;

    accent: string;
    /** Text laid directly on `accent`. Dark on amber, either way round. */
    onAccent: string;
    good: string;
    bad: string;

    /** Behind a panel. Nearly opaque: a panel is a place to stop and read. */
    scrim: string;
    panelShadow: string;

    display: string;
    body: string;
}

const FACES = {
    /**
     * Pixel face for latin system labels only.
     *
     * Press Start 2P has no Korean glyphs, so Korean set in it falls back
     * per-character and the spacing comes apart. Anything with Korean in it uses
     * the body face instead — the split is by language, not by importance.
     */
    display: "'Press Start 2P', monospace",
    body: "'Pretendard', system-ui, -apple-system, 'Malgun Gothic', sans-serif"
};

const DARK: Palette = {
    /** Concrete, not black: the city's own neutral. */
    ground: '#121316',
    surface: '#191B1F',
    surfaceRaised: '#212429',
    rule: '#2C3037',

    ink: '#ECEEF1',
    inkMuted: '#A6ABB4',
    inkFaint: '#757B85',

    /** Hazard tape. The one loud colour, spent sparingly. */
    accent: '#F0B429',
    onAccent: '#1A1400',
    /** The goal marker's colour, used for anything that went right. */
    good: '#5CBBA6',
    /** Rent day, damage, loss. */
    bad: '#E8635A',

    scrim: 'rgba(6, 8, 12, 0.955)',
    panelShadow: '0 18px 50px rgba(0,0,0,0.45)',

    ...FACES
};

const LIGHT: Palette = {
    /**
     * Newsprint and poured concrete, not paper white.
     *
     * The first light set was built around #F6F4EF, which on a phone at full
     * brightness is a torch. This is the same idea taken several steps down and
     * several degrees warmer: the beige of a photocopied notice taped to a wall,
     * which is where this game's words would actually be.
     */
    ground: '#D8D2C3',
    surface: '#EAE3D3',
    surfaceRaised: '#E0D8C5',
    rule: '#BEB5A0',

    ink: '#24211A',
    inkMuted: '#575245',
    inkFaint: '#837C6B',

    /**
     * Amber, darkened until it holds its own on paper.
     *
     * The dark theme's #F0B429 reads as pale yellow highlighter on a light
     * ground and fails contrast against it; this is the same hue taken down to
     * where it stays a warning.
     */
    accent: '#96590A',
    onAccent: '#FFF6E4',
    good: '#186354',
    bad: '#AC3226',

    scrim: 'rgba(216, 210, 195, 0.96)',
    panelShadow: '0 18px 50px rgba(46,40,28,0.22)',

    ...FACES
};

export const PALETTES: Record<Appearance, Palette> = { dark: DARK, light: LIGHT };

/**
 * The palette in force, as one object that everything reads from.
 *
 * Mutated in place rather than replaced, because the styles below and every
 * component import this binding directly. React reads inline styles afresh on
 * each render and every screen re-renders when a setting changes, so updating
 * the contents is enough — and it keeps the call sites reading as `theme.ink`
 * rather than threading a palette through the tree.
 */
export const theme: Palette = { ...PALETTES[getSettings().appearance] };

/**
 * Full-screen dim behind a result panel.
 *
 * Nearly opaque rather than merely dark. At 82% the city behind it still read
 * through — the menu's title sat across the leaderboard, and a results panel was
 * competing with the frozen game underneath it.
 */
export const overlayBackdrop: CSSProperties = {} as CSSProperties;
export const panel: CSSProperties = {} as CSSProperties;
/** Diagonal hazard stripe, used once per panel as its top edge. */
export const hazardEdge: CSSProperties = {} as CSSProperties;
export const eyebrow: CSSProperties = {} as CSSProperties;
export const statGrid: CSSProperties = {} as CSSProperties;
/**
 * The one number that is the point of the screen, on its own line.
 *
 * Sharing a row with the tallies made a long clear time run into them.
 */
export const statHero: CSSProperties = {} as CSSProperties;
export const statHeroValue: CSSProperties = {} as CSSProperties;
export const statCell: CSSProperties = {} as CSSProperties;
export const statLabel: CSSProperties = {} as CSSProperties;
export const statValue: CSSProperties = {} as CSSProperties;
export const textInput: CSSProperties = {} as CSSProperties;
export const buttonRow: CSSProperties = {} as CSSProperties;
export const hint: CSSProperties = {} as CSSProperties;

/** Every derived style, rebuilt from whichever palette is in force. */
const derive = (): Record<string, CSSProperties> => ({
    overlayBackdrop: {
        position: 'fixed',
        inset: 0,
        background: theme.scrim,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        zIndex: 1000,
        overflowY: 'auto'
    },
    panel: {
        width: '100%',
        maxWidth: '440px',
        background: theme.surface,
        border: `1px solid ${theme.rule}`,
        borderRadius: '10px',
        padding: '28px 26px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        fontFamily: theme.body,
        color: theme.ink,
        boxShadow: theme.panelShadow
    },
    hazardEdge: {
        height: '4px',
        margin: '-28px -26px 0',
        borderRadius: '10px 10px 0 0',
        background: `repeating-linear-gradient(115deg, ${theme.accent} 0 10px, ${theme.ground} 10px 20px)`
    },
    eyebrow: {
        fontFamily: theme.display,
        fontSize: '0.55rem',
        letterSpacing: '0.16em',
        color: theme.inkFaint,
        margin: 0
    },
    statGrid: {
        display: 'flex',
        gap: '10px',
        background: theme.surfaceRaised,
        border: `1px solid ${theme.rule}`,
        borderRadius: '6px',
        padding: '14px 16px'
    },
    statHero: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        background: theme.surfaceRaised,
        border: `1px solid ${theme.rule}`,
        borderRadius: '6px',
        padding: '14px 16px'
    },
    statHeroValue: {
        fontFamily: theme.display,
        fontSize: '1.5rem',
        letterSpacing: '0.02em',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap'
    },
    statCell: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        minWidth: 0
    },
    statLabel: {
        fontFamily: theme.display,
        fontSize: '0.5rem',
        letterSpacing: '0.1em',
        color: theme.inkFaint,
        whiteSpace: 'nowrap'
    },
    statValue: {
        fontFamily: theme.display,
        fontSize: '0.95rem',
        color: theme.ink,
        fontVariantNumeric: 'tabular-nums'
    },
    textInput: {
        width: '100%',
        padding: '12px 14px',
        fontSize: '0.85rem',
        fontFamily: theme.body,
        fontWeight: 600,
        textAlign: 'center',
        textTransform: 'uppercase',
        background: theme.ground,
        color: theme.ink,
        border: `1px solid ${theme.rule}`,
        borderRadius: '6px',
        boxSizing: 'border-box'
    },
    buttonRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px'
    },
    hint: {
        fontFamily: theme.body,
        fontSize: '0.72rem',
        color: theme.inkFaint,
        textAlign: 'center',
        margin: 0
    }
});

const TARGETS: Record<string, CSSProperties> = {
    overlayBackdrop,
    panel,
    hazardEdge,
    eyebrow,
    statGrid,
    statHero,
    statHeroValue,
    statCell,
    statLabel,
    statValue,
    textInput,
    buttonRow,
    hint
};

/**
 * Points every exported style at the palette now in force.
 *
 * Each object is emptied and refilled rather than swapped, so the bindings
 * components already hold stay correct.
 */
export const applyAppearance = (appearance: Appearance): void => {
    Object.keys(theme).forEach((key) => delete (theme as unknown as Record<string, unknown>)[key]);
    Object.assign(theme, PALETTES[appearance]);

    const next = derive();
    Object.entries(TARGETS).forEach(([key, target]) => {
        Object.keys(target).forEach((prop) => delete (target as unknown as Record<string, unknown>)[prop]);
        Object.assign(target, next[key]);
    });
};

applyAppearance(getSettings().appearance);
subscribe((settings) => applyAppearance(settings.appearance));

export const headline = (color: string): CSSProperties => ({
    fontFamily: theme.body,
    fontSize: '1.6rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
    color,
    margin: 0
});

type ButtonTone = 'primary' | 'quiet' | 'danger';

/**
 * Buttons carry weight by role, not by all being equally loud.
 *
 * Exactly one primary per screen; everything else recedes.
 */
export const button = (tone: ButtonTone, disabled = false): CSSProperties => {
    const tones: Record<ButtonTone, { bg: string; fg: string; border: string }> = {
        primary: { bg: theme.accent, fg: theme.onAccent, border: theme.accent },
        quiet: { bg: 'transparent', fg: theme.inkMuted, border: theme.rule },
        danger: { bg: 'transparent', fg: theme.bad, border: theme.bad }
    };
    const t = tones[tone];

    return {
        flex: '1 1 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
        padding: '12px 14px',
        fontFamily: theme.body,
        fontSize: '0.82rem',
        fontWeight: 600,
        letterSpacing: '0.01em',
        background: disabled ? theme.surfaceRaised : t.bg,
        color: disabled ? theme.inkFaint : t.fg,
        border: `1px solid ${disabled ? theme.rule : t.border}`,
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        userSelect: 'none'
    };
};
