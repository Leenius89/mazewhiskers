import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Film, Home, RotateCcw, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getSettings } from '../settings';
import { useTranslation } from '../i18n';
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

interface VictoryProps {
    onRetry: () => void;
    onMainMenu: () => void;
    onShowLeaderboard: () => void;
    onShowCredits: () => void;
    timeMs: number;
    milkCount: number;
    fishCount: number;
    score: number;
    healthLeft: number;
}

const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
};

const MotionButton = motion.div as React.ElementType;

const Victory: React.FC<VictoryProps> = ({
    onRetry,
    onMainMenu,
    onShowLeaderboard,
    onShowCredits,
    timeMs,
    milkCount,
    fishCount,
    score,
    healthLeft
}) => {
    const t = useTranslation();
    const [username, setUsername] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmitScore = async () => {
        if (!username.trim()) return;
        setIsSubmitting(true);
        try {
            const name = username.toUpperCase();

            const { error } = await supabase
                .from('speedrun_leaderboard')
                .insert([{ username: name, time_ms: timeMs, difficulty: getSettings().difficulty }]);

            if (error) throw error;

            /**
             * A win belongs on the other two boards as well.
             *
             * Winning wrote to the speedrun table and nowhere else, so a run
             * that took the longest way round eating everything in sight
             * vanished from "longest on the street" and "best fed" the moment it
             * succeeded — the only runs those boards ever saw were the losing
             * ones. Time to the goal is time survived.
             */
            const { error: runError } = await supabase
                .from('scores')
                .insert([
                    {
                        username: name,
                        score,
                        survived_ms: timeMs,
                        fish_count: fishCount,
                        health_left: healthLeft,
                        difficulty: getSettings().difficulty
                    }
                ]);

            if (runError) {
                // The run is already recorded where it matters most; the other
                // boards are worth a warning, not a failed submission.
                console.warn('클리어 기록을 scores 에 남기지 못했습니다:', runError.message);
            }
            setSubmitted(true);
        } catch (error) {
            console.error('Error submitting time:', error);
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
                    <p style={eyebrow}>ARRIVED</p>
                    <h2 style={headline(theme.good)}>{t('win.title')}</h2>
                    <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.65, color: theme.inkMuted }}>
                        도시가 먼저 도착하지 못했습니다. 이번에는.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={statHero}>
                        <span style={statLabel}>CLEAR TIME</span>
                        <span style={{ ...statHeroValue, color: theme.good }}>{formatTime(timeMs)}</span>
                    </div>
                    <div style={statGrid}>
                        <div style={statCell}>
                            <span style={statLabel}>🐟 FISH</span>
                            <span style={statValue}>{fishCount}</span>
                        </div>
                        <div style={statCell}>
                            <span style={statLabel}>🥛 MILK</span>
                            <span style={statValue}>{milkCount}</span>
                        </div>
                    </div>
                </div>

                {submitted ? (
                    <p style={{ ...hint, color: theme.good }}>기록 등록 완료 / SUBMITTED</p>
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
                            {isSubmitting ? t('over.submitting') : t('win.submit')}
                        </button>
                    </div>
                )}

                <div style={buttonRow}>
                    <MotionButton style={button('primary')} onClick={onRetry} whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                        <RotateCcw size={13} />
                        다시 / RETRY
                    </MotionButton>
                    <MotionButton
                        style={button('quiet')}
                        onClick={onShowLeaderboard}
                        whileHover={{ y: -1 }}
                        whileTap={{ y: 0 }}
                    >
                        <Trophy size={13} />
                        랭킹
                    </MotionButton>
                </div>

                <div style={buttonRow}>
                    <MotionButton
                        style={button('quiet')}
                        onClick={onShowCredits}
                        whileHover={{ y: -1 }}
                        whileTap={{ y: 0 }}
                    >
                        <Film size={13} />
                        크레딧
                    </MotionButton>
                    <MotionButton
                        style={button('quiet')}
                        onClick={onMainMenu}
                        whileHover={{ y: -1 }}
                        whileTap={{ y: 0 }}
                    >
                        <Home size={13} />
                        메뉴
                    </MotionButton>
                </div>
            </motion.div>
        </div>
    );
};

export default Victory;
