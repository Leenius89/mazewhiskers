import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { useTranslation } from '../i18n';
import { theme } from './theme';

interface HeaderProps {
    onOpenMenu: () => void;
    milkCount: number;
    fishCount: number;
    score: number;
    gameSize: { width: number | string; height: number | string };
}

/**
 * A thin run bar, not a dashboard.
 *
 * Health and jumps used to live here, a screen's width away from the cat they
 * describe — nobody looks up here mid-chase. They now float over the player's
 * head, so this keeps only what is genuinely about the run as a whole: what has
 * been collected, and the way out.
 */
/**
 * Below this the bar has to give something up.
 *
 * Everything in here refuses to wrap, so on a 375px phone the row simply
 * kept going: the tallies started at x=166 and the restart button ran to
 * x=467, ninety pixels past the edge of the screen, leaving three pixels of
 * it visible. A four-digit score pushed the mute button off as well.
 */
const TIGHT_WIDTH = 520;

const Header: React.FC<HeaderProps> = ({ onOpenMenu, milkCount, fishCount, score, gameSize }) => {
    const width = typeof gameSize.width === 'number' ? `${gameSize.width}px` : gameSize.width;
    const t = useTranslation();

    const [tight, setTight] = useState(() => window.innerWidth < TIGHT_WIDTH);
    useEffect(() => {
        const onResize = () => setTight(window.innerWidth < TIGHT_WIDTH);
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, []);

    return (
        <div
            style={{
                width,
                maxWidth: '100%',
                height: '40px',
                background: theme.surface,
                borderBottom: `1px solid ${theme.rule}`,
                borderRadius: '6px 6px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: tight ? '0 8px' : '0 12px',
                boxSizing: 'border-box',
                margin: '0 auto',
                position: 'relative',
                overflow: 'hidden',
                zIndex: 1000
            }}
        >
            {/* The first thing to go when the bar runs out of room. The game's
                name is on the tab and on the menu; the run's numbers are not. */}
            {!tight && (
                <span
                    style={{
                        fontFamily: theme.display,
                        fontSize: '0.6rem',
                        letterSpacing: '0.08em',
                        color: theme.inkMuted,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0
                    }}
                >
                    MAZE WHISKERS
                </span>
            )}

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: tight ? '9px' : '14px',
                    marginLeft: 'auto',
                    minWidth: 0
                }}
            >
                <Tally icon="🐟" value={fishCount} />
                <Tally icon="🥛" value={milkCount} />

                {/* What the fish and milk were actually for. Both tallies were
                    visible from the start and neither said what they bought. */}
                <span
                    style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '5px',
                        fontFamily: theme.display,
                        fontSize: '0.5rem',
                        letterSpacing: '0.06em',
                        color: theme.inkFaint,
                        whiteSpace: 'nowrap'
                    }}
                >
                    {!tight && t('header.score')}
                    <strong style={{ fontSize: '0.72rem', color: theme.accent }}>{score}</strong>
                </span>

                {/*
                    One way in, rather than two things to press by accident.
                  *
                  * A mute toggle and a restart button is two controls for the
                  * two things nobody wants mid-run — and restart sat one thumb
                  * away from the game with nothing between it and losing a run.
                  * Everything is behind this now, and opening it stops the
                  * clock.
                */}
                <button
                    onClick={onOpenMenu}
                    title={t('header.menu')}
                    aria-label={t('header.menu')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: tight ? '7px' : '6px 11px',
                        background: 'transparent',
                        border: `1px solid ${theme.rule}`,
                        borderRadius: '4px',
                        color: theme.inkMuted,
                        fontFamily: theme.display,
                        fontSize: '0.5rem',
                        letterSpacing: '0.06em',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        cursor: 'pointer'
                    }}
                >
                    <Menu size={13} />
                    {!tight && 'MENU'}
                </button>
            </div>
        </div>
    );
};

const Tally: React.FC<{ icon: string; value: number }> = ({ icon, value }) => (
    <span
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: theme.display,
            fontSize: '0.6rem',
            color: theme.ink,
            fontVariantNumeric: 'tabular-nums'
        }}
    >
        <span style={{ fontSize: '0.8rem' }}>{icon}</span>
        {value}
    </span>
);

export default Header;
