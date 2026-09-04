import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
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
}

/**
 * What each ending actually means.
 *
 * A player who reads "GAME OVER" learns nothing; the whole point of the
 * redevelopment system is that the ways you lose are different in kind. Naming
 * the cause is the last chance the game has to say what it was about.
 */
const ENDINGS: Record<GameOverPayload['reason'], { title: string; line: string; color: string }> = {
    health: {
        title: '버티지 못했다',
        line: '월세와 생활비가 남은 것을 다 가져갔습니다. 생선은 모아 둘 수 없습니다.',
        color: theme.bad
    },
    enemy: {
        title: '붙잡혔다',
        line: '한 번은 버틸 수 있었습니다. 두 번은 아니었습니다.',
        color: theme.bad
    },
    'apartment:player': {
        title: '밀려날 곳이 없었다',
        line: '짓눌린 것이 아닙니다. 밀려나고 또 밀려나다, 물러설 자리가 사라졌을 뿐입니다.',
        color: theme.accent
    },
    'apartment:goal': {
        title: '집이 먼저 사라졌다',
        line: '도착하기 전에 그 자리에 아파트가 들어섰습니다.',
        color: theme.accent
    },
    trapped: {
        title: '갈 곳이 없었다',
        line: '사방이 막혔습니다. 체력이 남아 있어도 나갈 길이 없으면 끝난 것입니다.',
        color: theme.accent
    }
};

const MotionButton = motion.div as React.ElementType;

const GameOver: React.FC<GameOverProps> = ({
    onRetry,
    onShowLeaderboard,
    reason,
    milkCount = 0,
    fishCount = 0,
    score
}) => {
    const [username, setUsername] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const ending = ENDINGS[reason] ?? ENDINGS.health;

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
            const { error } = await supabase
                .from('scores')
                .insert([{ username: username.toUpperCase(), score }]);

            if (error) throw error;
            setSubmitted(true);
        } catch (error) {
            console.error('Error submitting score:', error);
            alert('기록을 저장하지 못했습니다. 다시 시도해 주세요.');
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
                    <p style={eyebrow}>RUN ENDED</p>
                    <h2 style={headline(ending.color)}>{ending.title}</h2>
                    <p
                        style={{
                            margin: 0,
                            fontSize: '0.9rem',
                            lineHeight: 1.65,
                            color: theme.inkMuted
                        }}
                    >
                        {ending.line}
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={statHero}>
                        <span style={statLabel}>SCORE</span>
                        <span style={{ ...statHeroValue, color: theme.accent }}>{score.toLocaleString()}</span>
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
                            placeholder="이름 / YOUR NAME"
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
                            {isSubmitting ? '전송 중…' : '기록 등록 / SUBMIT'}
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

                <p style={hint}>SPACE 로도 다시 시작합니다</p>
            </motion.div>
        </div>
    );
};

export default GameOver;
