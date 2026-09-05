import type { CSSProperties } from 'react';

/**
 * One palette for every screen outside the canvas.
 *
 * The result screens were each styled on their own — one green box, one red box,
 * different fonts, different buttons — so arriving at them felt like leaving the
 * game. These are the same colours the world uses: concrete, hazard amber, the
 * teal of the goal marker.
 */
export const theme = {
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
    /** The goal marker's colour, used for anything that went right. */
    good: '#5CBBA6',
    /** Rent day, damage, loss. */
    bad: '#E8635A',

    /**
     * Pixel face for latin system labels only.
     *
     * Press Start 2P has no Korean glyphs, so Korean set in it falls back
     * per-character and the spacing comes apart. Anything with Korean in it uses
     * the body face instead — the split is by language, not by importance.
     */
    display: "'Press Start 2P', monospace",
    body: "'Pretendard', system-ui, -apple-system, 'Malgun Gothic', sans-serif"
} as const;

/**
 * Full-screen dim behind a result panel.
 *
 * Nearly opaque rather than merely dark. At 82% the city behind it still read
 * through — the menu's black-on-cyan title sat across the leaderboard, and a
 * results panel was competing with the frozen game underneath it. A panel is a
 * place to stop and read, so what is behind it stops.
 */
export const overlayBackdrop: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(6, 8, 12, 0.955)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    zIndex: 1000,
    overflowY: 'auto'
};

export const panel: CSSProperties = {
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
    boxShadow: '0 18px 50px rgba(0,0,0,0.45)'
};

/** Diagonal hazard stripe, used once per panel as its top edge. */
export const hazardEdge: CSSProperties = {
    height: '4px',
    margin: '-28px -26px 0',
    borderRadius: '10px 10px 0 0',
    background: `repeating-linear-gradient(115deg, ${theme.accent} 0 10px, ${theme.ground} 10px 20px)`
};

export const eyebrow: CSSProperties = {
    fontFamily: theme.display,
    fontSize: '0.55rem',
    letterSpacing: '0.16em',
    color: theme.inkFaint,
    margin: 0
};

export const headline = (color: string): CSSProperties => ({
    fontFamily: theme.body,
    fontSize: '1.6rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
    color,
    margin: 0
});

export const statGrid: CSSProperties = {
    display: 'flex',
    gap: '10px',
    background: theme.surfaceRaised,
    border: `1px solid ${theme.rule}`,
    borderRadius: '6px',
    padding: '14px 16px'
};

/**
 * The one number that is the point of the screen, on its own line.
 *
 * Sharing a row with the tallies made a long clear time run into them.
 */
export const statHero: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    background: theme.surfaceRaised,
    border: `1px solid ${theme.rule}`,
    borderRadius: '6px',
    padding: '14px 16px'
};

export const statHeroValue: CSSProperties = {
    fontFamily: theme.display,
    fontSize: '1.5rem',
    letterSpacing: '0.02em',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap'
};

export const statCell: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    minWidth: 0
};

export const statLabel: CSSProperties = {
    fontFamily: theme.display,
    fontSize: '0.5rem',
    letterSpacing: '0.1em',
    color: theme.inkFaint,
    whiteSpace: 'nowrap'
};

export const statValue: CSSProperties = {
    fontFamily: theme.display,
    fontSize: '0.95rem',
    color: theme.ink,
    fontVariantNumeric: 'tabular-nums'
};

export const textInput: CSSProperties = {
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
};

type ButtonTone = 'primary' | 'quiet' | 'danger';

/**
 * Buttons carry weight by role, not by all being equally loud.
 *
 * Exactly one primary per screen; everything else recedes.
 */
export const button = (tone: ButtonTone, disabled = false): CSSProperties => {
    const tones: Record<ButtonTone, { bg: string; fg: string; border: string }> = {
        primary: { bg: theme.accent, fg: '#1A1400', border: theme.accent },
        quiet: { bg: 'transparent', fg: theme.inkMuted, border: theme.rule },
        danger: { bg: 'transparent', fg: theme.bad, border: 'rgba(232,99,90,0.4)' }
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

export const buttonRow: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
};

export const hint: CSSProperties = {
    fontFamily: theme.body,
    fontSize: '0.72rem',
    color: theme.inkFaint,
    textAlign: 'center',
    margin: 0
};
