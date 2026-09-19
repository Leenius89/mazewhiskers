import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Home, RotateCcw, Trophy } from 'lucide-react';
import { useTranslation } from '../i18n';
import { isMobileDevice } from '../game/systems/InputManager';
import ProwlingCat from './ProwlingCat';
import ScoreSlip from './ScoreSlip';
import type { RunOutcome } from '../platform/score';
import { formatClockShort } from '../platform/format';
import type { GameOverPayload } from '../game/core/GameEvents';
import {
    button,
    buttonRow,
    eyebrow,
    hazardEdge,
    headline,
    hint,
    overlayBackdropSoft,
    panel,
    statCell,
    statGrid,
    statLabel,
    statValue,
    theme
} from './theme';

interface GameOverProps {
    onRetry: () => void;
    onMainMenu: () => void;
    onShowLeaderboard: () => void;
    reason: GameOverPayload['reason'];
    milkCount?: number;
    fishCount?: number;
    survivedMs: number;
    /** Scored and sent by the time this is shown; see App's `settle`. */
    outcome: RunOutcome | null;
}

/**
 * What each ending actually means.
 *
 * A player who reads "GAME OVER" learns nothing; the whole point of the
 * redevelopment system is that the ways you lose are different in kind. Naming
 * the cause is the last chance the game has to say what it was about.
 */
const ENDING_COLORS: Record<GameOverPayload['reason'], string> = {
    health: theme.bad,
    enemy: theme.bad,
    'apartment:player': theme.accent,
    'apartment:goal': theme.accent,
    trapped: theme.accent,
    sealed: theme.accent,
    idle: theme.accent
};

const MotionButton = motion.div as React.ElementType;

const GameOver: React.FC<GameOverProps> = ({
    onRetry,
    onMainMenu,
    onShowLeaderboard,
    reason,
    milkCount = 0,
    fishCount = 0,
    survivedMs,
    outcome
}) => {
    const t = useTranslation();

    // Space restarts, unless the player is typing somewhere.
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement;
            if (
                active &&
                (active.tagName === 'INPUT' ||
                    active.tagName === 'TEXTAREA' ||
                    active.getAttribute('contenteditable') === 'true')
            ) {
                return;
            }

            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                onRetry();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onRetry]);

    return (
        <div style={overlayBackdropSoft}>
            <motion.div
                // Named so the cat can find its top edge and sit on it.
                data-mw-perch=""
                style={panel}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
            >
                <div style={hazardEdge} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <p style={eyebrow}>{t('over.eyebrow')}</p>
                    <h2 style={headline(ENDING_COLORS[reason])}>{t(`over.${reason}.title`)}</h2>
                    <p
                        style={{
                            margin: 0,
                            fontSize: '0.9rem',
                            lineHeight: 1.65,
                            color: theme.inkMuted
                        }}
                    >
                        {t(`over.${reason}.body`)}
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/*
                        Where the name box was. Toss knows who is playing, so
                        nothing is typed: the run is scored and on the board
                        by the time this panel has finished sliding in.
                    */}
                    <ScoreSlip outcome={outcome} color={theme.accent} />
                    <div style={statGrid}>
                        <div style={statCell}>
                            <span style={statLabel}>{t('over.fish')}</span>
                            <span style={statValue}>{fishCount}</span>
                        </div>
                        <div style={statCell}>
                            <span style={statLabel}>{t('over.milk')}</span>
                            <span style={statValue}>{milkCount}</span>
                        </div>
                        <div style={{ ...statCell, flex: 1.4 }}>
                            <span style={statLabel}>{t('over.lasted')}</span>
                            <span style={statValue}>{formatClockShort(survivedMs)}</span>
                        </div>
                    </div>
                </div>

                <div style={buttonRow}>
                    <MotionButton
                        style={button('primary')}
                        onClick={onRetry}
                        whileHover={{ y: -1 }}
                        whileTap={{ y: 0 }}
                    >
                        <RotateCcw size={13} />
                        {t('over.retry')}
                    </MotionButton>
                    <MotionButton
                        style={button('quiet')}
                        onClick={onShowLeaderboard}
                        whileHover={{ y: -1 }}
                        whileTap={{ y: 0 }}
                    >
                        <Trophy size={13} />
                        {t('over.ranking')}
                    </MotionButton>
                </div>

                {/*
                    On its own row, and quiet.

                    Losing left three ways forward and none of them was out:
                    try again, look at the board, or close the tab. The victory
                    screen has had a way back to the menu since it was written,
                    and there is no reason the losing one should be the screen
                    that traps you — least of all in a gallery, where the next
                    person needs the menu and not somebody else's death.
                */}
                <MotionButton
                    style={button('quiet')}
                    onClick={onMainMenu}
                    whileHover={{ y: -1 }}
                    whileTap={{ y: 0 }}
                >
                    <Home size={13} />
                    {t('over.mainMenu')}
                </MotionButton>

                {/* There is no space bar on a phone, and the line was pointing
                    at a key the player does not have. */}
                {!isMobileDevice() && <p style={hint}>{t('over.spaceHint')}</p>}
            </motion.div>

            {/*
                The thing that just won, taking its time about it.

                On the menu the cat is scenery; here it is the other party to
                what happened, which is why it gets the taunts and why it is
                allowed to climb onto the panel and read the score from up
                there. It still cannot take a click — the whole layer is
                pointer-events: none, and the buttons underneath it are the
                point of the screen.
            */}
            <ProwlingCat perchSelector="[data-mw-perch]" mood="taunt" />
        </div>
    );
};

export default GameOver;
