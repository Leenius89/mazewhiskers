import React, { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import { theme } from './theme';

/**
 * The black cat, loose on the menu.
 *
 * It is the only thing in the game the player never gets to look at properly —
 * in a run it is either far enough away to be a rumour or close enough to be a
 * problem, and either way nobody stops to watch it walk. So it walks here,
 * under the buttons, before anything is at stake.
 *
 * It is also doing a job. The menu is three buttons on a photograph and holds
 * still; a thing moving along the bottom of it says the city is inhabited, and
 * gives the screen somewhere for the eye to go while the player decides.
 *
 * Purely decorative. It is not the enemy, it does not know about difficulty,
 * and nothing it says means anything.
 */

/** Milliseconds a walk frame is held. Two frames, so this is the whole gait. */
const STEP_MS = 190;

/** How long one crossing takes. Slow: it is prowling, not commuting. */
const CROSS_MS = 22000;

/** Roughly how often it says something, and how long the line stays up. */
const TAUNT_GAP_MS = 5200;
const TAUNT_HOLD_MS = 2400;

const ProwlingCat: React.FC = () => {
    const t = useTranslation();
    const [frame, setFrame] = useState(1);
    const [line, setLine] = useState<string | null>(null);

    // The two-frame walk. Cheap enough to run off a timer rather than a
    // sprite sheet, and there are only ever two frames to hold.
    useEffect(() => {
        const id = window.setInterval(() => setFrame((f) => (f === 1 ? 2 : 1)), STEP_MS);
        return () => window.clearInterval(id);
    }, []);

    // Says something now and then, and shuts up in between. A bubble that is
    // always up stops being something the cat said and becomes a label.
    useEffect(() => {
        const lines = [t('menu.cat.1'), t('menu.cat.2'), t('menu.cat.3'), t('menu.cat.4')];
        let hide = 0;

        const speak = () => {
            setLine(lines[Math.floor(Math.random() * lines.length)]);
            hide = window.setTimeout(() => setLine(null), TAUNT_HOLD_MS);
        };

        const id = window.setInterval(speak, TAUNT_GAP_MS);
        const first = window.setTimeout(speak, 1600);

        return () => {
            window.clearInterval(id);
            window.clearTimeout(first);
            window.clearTimeout(hide);
        };
    }, [t]);

    return (
        <div
            style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: '4%',
                height: '96px',
                zIndex: 2,
                // The menu is above it and has to stay clickable.
                pointerEvents: 'none',
                overflow: 'hidden'
            }}
        >
            <div
                className="mw-prowl"
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    animation: `mw-prowl ${CROSS_MS}ms linear infinite`
                }}
            >
                <span
                    style={{
                        // Held in the layout at all times so the cat does not
                        // hop up and down as the line comes and goes.
                        visibility: line ? 'visible' : 'hidden',
                        whiteSpace: 'nowrap',
                        fontFamily: theme.body,
                        fontSize: '0.72rem',
                        color: '#f4eee2',
                        background: 'rgba(12,10,16,0.82)',
                        border: '1px solid rgba(244,238,226,0.22)',
                        borderRadius: '4px',
                        padding: '3px 7px'
                    }}
                >
                    {line ?? ' '}
                </span>

                <img
                    src={`sources/enemy${frame}.png`}
                    alt=""
                    className="mw-prowl-cat"
                    style={{
                        width: '58px',
                        height: 'auto',
                        display: 'block',
                        imageRendering: 'pixelated',
                        filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.5))'
                    }}
                />
            </div>
        </div>
    );
};

export default ProwlingCat;
