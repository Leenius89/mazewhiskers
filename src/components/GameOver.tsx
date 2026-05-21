import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface GameOverProps {
    onRetry: () => void;
    onShowLeaderboard: () => void;
    milkCount?: number;
    fishCount?: number;
    score: number;
}

const MotionClickable = motion.div as any;

const GameOver: React.FC<GameOverProps> = ({ onRetry, onShowLeaderboard, milkCount = 0, fishCount = 0, score }) => {
    const [username, setUsername] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // 게임 오버 상태에서 스페이스바를 누르면 retry(재시작)가 작동하도록 키 바인딩 추가
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 이름 입력란(input) 등에 포커스가 있을 때는 스페이스바 재시작 방지
            const activeElement = document.activeElement;
            if (
                activeElement &&
                (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.getAttribute('contenteditable') === 'true')
            ) {
                return;
            }

            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault(); // 스페이스바로 인한 브라우저 스크롤 등의 기본 동작 방지
                onRetry();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onRetry]);

    const handleSubmitScore = async () => {
        if (!username.trim()) return;
        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('scores')
                .insert([{ username: username.toUpperCase(), score: score }]);

            if (error) throw error;
            setSubmitted(true);
        } catch (error) {
            console.error('Error submitting score:', error);
            alert('Failed to submit score. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
            }}
        >
            <motion.div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: '2rem',
                    borderRadius: '1rem',
                    width: '90%',
                    maxWidth: '500px'
                }}
                initial={{ y: '100vh' }}
                animate={{ y: 0 }}
                transition={{
                    type: 'spring',
                    damping: 20,
                    stiffness: 100,
                    duration: 0.8
                }}
            >
                {/* Game Over Text */}
                <motion.h1
                    style={{
                        fontSize: '3rem',
                        fontWeight: 'bold',
                        color: '#ff0000',
                        textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
                        marginBottom: '0.5rem',
                        textAlign: 'center',
                        fontFamily: "'Press Start 2P', 'Pretendard', sans-serif"
                    }}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    GAME OVER
                </motion.h1>

                {/* Score Display */}
                <motion.div
                    style={{
                        color: '#fbbf24',
                        fontSize: '1.2rem',
                        fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                        marginBottom: '1rem'
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                >
                    SCORE: {score}
                </motion.div>

                {/* Items Collected */}
                <motion.div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: '2rem',
                        color: 'white',
                        fontSize: '1.2rem',
                        marginBottom: '1rem',
                        fontFamily: "'Press Start 2P', 'Pretendard', sans-serif"
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <img src="sources/milk.png" alt="milk" style={{ width: '32px', height: '32px' }} />
                        <span>× {milkCount}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <img src="sources/fish1.png" alt="fish" style={{ width: '32px', height: '32px' }} />
                        <span>× {fishCount}</span>
                    </div>
                </motion.div>

                {/* Score Submission Form */}
                {!submitted ? (
                    <div style={{ display: 'flex', gap: '10px', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        <input
                            type="text"
                            placeholder="YOUR NAME"
                            maxLength={8}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={{
                                padding: '10px',
                                fontSize: '1rem',
                                fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                                textAlign: 'center',
                                width: '80%',
                                textTransform: 'uppercase'
                            }}
                        />
                        <button
                            onClick={handleSubmitScore}
                            disabled={isSubmitting || !username.trim()}
                            style={{
                                padding: '10px 20px',
                                fontSize: '1rem',
                                fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                                cursor: isSubmitting || !username.trim() ? 'not-allowed' : 'pointer',
                                backgroundColor: isSubmitting || !username.trim() ? '#718096' : '#48bb78',
                                color: 'white',
                                border: 'none',
                                width: '80%'
                            }}
                        >
                            {isSubmitting ? 'SUBMITTING...' : 'SUBMIT SCORE'}
                        </button>
                    </div>
                ) : (
                    <div style={{ color: '#48bb78', fontFamily: "'Press Start 2P', 'Pretendard', sans-serif", padding: '10px' }}>
                        SCORE SUBMITTED!
                    </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <MotionClickable
                        style={{
                            backgroundColor: '#ff0000',
                            color: 'white',
                            padding: '1rem 1.5rem',
                            borderRadius: '0.5rem',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                            fontFamily: "'Press Start 2P', 'Pretendard', sans-serif"
                        }}
                        onClick={onRetry}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        whileHover={{
                            scale: 1.05,
                            backgroundColor: '#cc0000'
                        }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                    >
                        <RotateCcw size={20} />
                        RETRY
                    </MotionClickable>

                    <MotionClickable
                        style={{
                            backgroundColor: '#ecc94b',
                            color: 'black',
                            padding: '1rem 1.5rem',
                            borderRadius: '0.5rem',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                            fontFamily: "'Press Start 2P', 'Pretendard', sans-serif"
                        }}
                        onClick={onShowLeaderboard}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        whileHover={{
                            scale: 1.05,
                            backgroundColor: '#d69e2e'
                        }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                    >
                        RANKING
                    </MotionClickable>
                </div>
            </motion.div>
        </div>
    );
};

export default GameOver;
