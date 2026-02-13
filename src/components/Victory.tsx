import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Home, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface VictoryProps {
    onRetry: () => void;
    onMainMenu: () => void;
    onShowLeaderboard: () => void;
    timeMs: number;
    milkCount: number;
    fishCount: number;
}

const MotionClickable = motion.div as any;

const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10); // Display 2 digits
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
};

const Victory: React.FC<VictoryProps> = ({ onRetry, onMainMenu, onShowLeaderboard, timeMs, milkCount, fishCount }) => {
    const [username, setUsername] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmitScore = async () => {
        if (!username.trim()) return;
        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('speedrun_leaderboard')
                .insert([{ username: username.toUpperCase(), time_ms: timeMs }]);

            if (error) throw error;
            setSubmitted(true);
        } catch (error) {
            console.error('Error submitting time:', error);
            alert('Failed to submit time. Please try again.');
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
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                zIndex: 1000,
                paddingTop: '15vh' // Position 15% from the top
            }}
        >
            <motion.div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1.5rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Slightly more transparent
                    padding: '2rem',
                    borderRadius: '1rem',
                    width: '90%',
                    maxWidth: '500px',
                    border: '4px solid #48bb78',
                    // transform removed
                }}
                initial={{ scale: 0.8, opacity: 0, y: -50 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 15 }}
            >
                {/* Victory Text */}
                <motion.h1
                    style={{
                        fontSize: '3rem',
                        fontWeight: 'bold',
                        color: '#48bb78',
                        textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
                        marginBottom: '0',
                        textAlign: 'center',
                        fontFamily: "'Press Start 2P', cursive"
                    }}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                >
                    VICTORY!
                </motion.h1>

                {/* Time Display */}
                <motion.div
                    style={{
                        color: '#fbbf24',
                        fontSize: '1.2rem',
                        fontFamily: "'Press Start 2P', cursive",
                        textAlign: 'center',
                        lineHeight: '1.5'
                    }}
                >
                    <div style={{ fontSize: '0.8em', marginBottom: '5px' }}>CLEAR TIME</div>
                    <div style={{ fontSize: '2rem', color: '#fff' }}>{formatTime(timeMs)}</div>
                </motion.div>

                {/* Items Stats */}
                <div style={{
                    display: 'flex',
                    gap: '2rem',
                    justifyContent: 'center',
                    width: '100%',
                    fontFamily: "'Press Start 2P', cursive",
                    color: 'white',
                    fontSize: '1rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img src="sources/milk.png" alt="milk" style={{ width: '32px', height: '32px', imageRendering: 'pixelated' }} />
                        <span>× {milkCount}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img src="sources/fish1.png" alt="fish" style={{ width: '32px', height: '32px', imageRendering: 'pixelated' }} />
                        <span>× {fishCount}</span>
                    </div>
                </div>

                {/* Score Submission Form */}
                {!submitted ? (
                    <div style={{ display: 'flex', gap: '10px', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        <input
                            type="text"
                            placeholder="YOUR NAME"
                            maxLength={10}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={{
                                padding: '15px',
                                fontSize: '1rem',
                                fontFamily: "'Press Start 2P', cursive",
                                textAlign: 'center',
                                width: '80%',
                                textTransform: 'uppercase',
                                backgroundColor: '#2d3748',
                                color: 'white',
                                border: '2px solid #4a5568'
                            }}
                        />
                        <button
                            onClick={handleSubmitScore}
                            disabled={isSubmitting || !username.trim()}
                            style={{
                                padding: '15px 20px',
                                fontSize: '1rem',
                                fontFamily: "'Press Start 2P', cursive",
                                cursor: isSubmitting || !username.trim() ? 'not-allowed' : 'pointer',
                                backgroundColor: isSubmitting || !username.trim() ? '#718096' : '#48bb78',
                                color: 'white',
                                border: 'none',
                                width: '80%'
                            }}
                        >
                            {isSubmitting ? 'SUBMITTING...' : 'SUBMIT TIME'}
                        </button>
                    </div>
                ) : (
                    <div style={{ color: '#48bb78', fontFamily: "'Press Start 2P', cursive", padding: '10px', textAlign: 'center' }}>
                        TIME SUBMITTED!
                        <div style={{ fontSize: '0.8rem', marginTop: '10px', color: '#a0aec0' }}>CHECK LEADERBOARD</div>
                    </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                    <MotionClickable
                        style={{
                            backgroundColor: '#ecc94b',
                            color: 'black',
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 4px 0px rgba(0, 0, 0, 0.2)',
                            fontFamily: "'Press Start 2P', cursive"
                        }}
                        onClick={onShowLeaderboard}
                        whileHover={{ y: -2 }}
                        whileTap={{ y: 0 }}
                    >
                        <Trophy size={16} />
                        RANKING
                    </MotionClickable>

                    <MotionClickable
                        style={{
                            backgroundColor: '#4299e1',
                            color: 'white',
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 4px 0px rgba(0, 0, 0, 0.2)',
                            fontFamily: "'Press Start 2P', cursive"
                        }}
                        onClick={onRetry}
                        whileHover={{ y: -2 }}
                        whileTap={{ y: 0 }}
                    >
                        <RotateCcw size={16} />
                        RETRY
                    </MotionClickable>

                    <MotionClickable
                        style={{
                            backgroundColor: '#e53e3e',
                            color: 'white',
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 4px 0px rgba(0, 0, 0, 0.2)',
                            fontFamily: "'Press Start 2P', cursive"
                        }}
                        onClick={onMainMenu}
                        whileHover={{ y: -2 }}
                        whileTap={{ y: 0 }}
                    >
                        <Home size={16} />
                        MENU
                    </MotionClickable>
                </div>
            </motion.div>
        </div>
    );
};

export default Victory;
