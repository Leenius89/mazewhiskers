import React from 'react';
import { RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useSettings } from '../settings';
import { theme } from './theme';

interface HeaderProps {
    restartGame: () => void;
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
const Header: React.FC<HeaderProps> = ({ restartGame, milkCount, fishCount, score, gameSize }) => {
    const width = typeof gameSize.width === 'number' ? `${gameSize.width}px` : gameSize.width;
    const [settings, update] = useSettings();

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
                padding: '0 12px',
                boxSizing: 'border-box',
                margin: '0 auto',
                position: 'relative',
                zIndex: 1000
            }}
        >
            <span
                style={{
                    fontFamily: theme.display,
                    fontSize: '0.6rem',
                    letterSpacing: '0.08em',
                    color: theme.inkMuted,
                    whiteSpace: 'nowrap'
                }}
            >
                MAZE WHISKERS
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
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
                    SCORE
                    <strong style={{ fontSize: '0.72rem', color: theme.accent }}>{score}</strong>
                </span>

                <button
                    onClick={() => update({ muted: !settings.muted })}
                    title={settings.muted ? '소리 켜기 / Unmute' : '소리 끄기 / Mute'}
                    aria-label={settings.muted ? '소리 켜기' : '소리 끄기'}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px',
                        background: 'transparent',
                        border: `1px solid ${theme.rule}`,
                        borderRadius: '4px',
                        color: settings.muted ? theme.bad : theme.inkFaint,
                        cursor: 'pointer'
                    }}
                >
                    {settings.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>

                <button
                    onClick={restartGame}
                    title="다시 시작 / Restart"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 9px',
                        background: 'transparent',
                        border: `1px solid ${theme.rule}`,
                        borderRadius: '4px',
                        color: theme.inkFaint,
                        fontFamily: theme.display,
                        fontSize: '0.5rem',
                        letterSpacing: '0.06em',
                        cursor: 'pointer'
                    }}
                >
                    <RotateCcw size={11} />
                    RESTART
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
