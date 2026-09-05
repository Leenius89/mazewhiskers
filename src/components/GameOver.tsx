import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getSettings } from '../settings';
import { useTranslation } from '../i18n';
import { isMobileDevice } from '../game/systems/InputManager';
import type { GameOverPayload } from '../game/core/GameEvents';
import {
    button,
    buttonRow,
    eyebrow,
    hazardEdge,
    headline,
    hint,
    overlayBackdrop,
    panel,
    statCell,
    statGrid,
    statHero,
    statHeroValue,
    statLabel,
    statValue,
    textInput,
    theme
} from './theme';

interface GameOverProps {
    onRetry: () => void;
    onShowLeaderboard: () => void;
    reason: GameOverPayload['reason'];
    milkCount?: number;
    fishCount?: number;
    score: number;
    survivedMs: number;
    healthLeft: number;
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
    onShowLeaderboard,
    reason,
    milkCount = 0,
    fishCount = 0,
    score,
    survivedMs,
    healthLeft
}) => {
    const t = useTranslation();
    const [username, setUsername] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    /** Recorded, but without the fields the other two boards rank by. */
    const [partial, setPartial] = useState(false);

    // Space restarts, unless the player is typing their name into the form.
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

    const handleSubmitScore = async () => {
        if (!username.trim()) return;
        setIsSubmitting(true);
        try {
            const name = username.toUpperCase();

            // Survival time and fish are what the other two boards rank by. They
            // are sent as their own columns, and if the database has not been
            // migrated yet the insert falls back to the shape it always had —
            // a run should never fail to record because a board is new.
            const { error } = await supabase
                .from('scores')
                .insert([
                    {
                        username: name,
                        score,
                        survived_ms: survivedMs,
                        fish_count: fishCount ?? 0,
                        health_left: healthLeft,
                        difficulty: getSettings().difficulty
                    }
                ]);

            if (error) {
                // Any failure at all, not just an unknown column: a stale insert
                // policy rejects the new fields as a row-level security
                // violation, which reads nothing like a missing column and used
                // to lose the run entirely.
                console.warn('기록 저장 1차 실패, 축소 형태로 재시도:', error.message);

                const retry = await supabase.from('scores').insert([{ username: name, score }]);
                if (retry.error) throw retry.error;

                // Saved, but only onto the score board. Saying so beats a silent
                // success the player cannot tell apart from a real one.
                setPartial(true);
            }
            setSubmitted(true);
        } catch (error) {
            console.error('Error submitting score:', error);
            alert(t('over.saveFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const canSubmit = !isSubmitting && username.trim().length > 0;

    return (
        <div style={overlayBackdrop}>
            <motion.div
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
                    <div style={statHero}>
                        <span style={statLabel}>SCORE</span>
                        <span style={{ ...statHeroValue, color: theme.accent }}>{score.toLocaleString()}</span>
                    </div>
                    <div style={statGrid}>
                        <div style={statCell}>
                            <span style={statLabel}>{t('over.fish')}</span>
                            <span style={statValue}>{fishCount}</span>
                        </div>
                        <div style={statCell}>
                            <span style={statLabel}>{t('over.milk')}</span>
                            <span style={statValue}>{milkCount}</span>
                        </div>
                    </div>
                </div>

                {submitted ? (
                    <p style={{ ...hint, color: partial ? theme.bad : theme.good }}>
                        {partial
                            ? t('over.partial')
                            : t('over.submitted')}
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder={t('over.name')}
                            maxLength={10}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={textInput}
                        />
                        <button
                            onClick={handleSubmitScore}
                            disabled={!canSubmit}
                            style={button('quiet', !canSubmit)}
                        >
                            {t(isSubmitting ? 'over.submitting' : 'over.submit')}
                        </button>
                    </div>
                )}

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

                {/* There is no space bar on a phone, and the line was pointing
                    at a key the player does not have. */}
                {!isMobileDevice() && <p style={hint}>{t('over.spaceHint')}</p>}
            </motion.div>
        </div>
    );
};

export default GameOver;
