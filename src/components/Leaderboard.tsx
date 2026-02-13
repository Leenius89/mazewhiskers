import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { motion } from 'framer-motion';

interface Score {
    id: number;
    username: string;
    score?: number;
    time_ms?: number;
    created_at: string;
}

interface LeaderboardProps {
    onClose: () => void;
    mode?: 'score' | 'time';
}

const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
};

const Leaderboard: React.FC<LeaderboardProps> = ({ onClose, mode = 'score' }) => {
    const [scores, setScores] = useState<Score[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchScores();
    }, [mode]);

    const fetchScores = async () => {
        setLoading(true);
        try {
            let query;
            if (mode === 'time') {
                query = supabase
                    .from('speedrun_leaderboard')
                    .select('*')
                    .order('time_ms', { ascending: true }) // Faster is better for time
                    .limit(6);
            } else {
                query = supabase
                    .from('scores')
                    .select('*')
                    .order('score', { ascending: false }) // Higher is better for score
                    .limit(6);
            }

            const { data, error } = await query;

            if (error) throw error;
            setScores(data || []);
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            fontFamily: "'Press Start 2P', cursive",
        }}>
            <motion.div
                style={{
                    width: '90%',
                    maxWidth: '500px',
                    backgroundColor: '#2d3748',
                    border: '4px solid #4a5568',
                    padding: '20px',
                    color: 'white',
                    position: 'relative'
                }}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
            >
                <h2 style={{ textAlign: 'center', color: mode === 'time' ? '#48bb78' : '#fbbf24', marginBottom: '20px' }}>
                    {mode === 'time' ? 'SPEEDRUN RANKING' : 'HIGH SCORE RANKING'}
                </h2>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>Loading...</div>
                ) : (
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '2px solid #4a5568', color: '#a0aec0', fontSize: '0.8em' }}>
                            <span style={{ width: '20%' }}>RANK</span>
                            <span style={{ width: '40%' }}>NAME</span>
                            <span style={{ width: '40%', textAlign: 'right' }}>{mode === 'time' ? 'TIME' : 'SCORE'}</span>
                        </div>
                        {scores.map((score, index) => (
                            <div key={score.id} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '10px 0',
                                borderBottom: '1px solid #4a5568',
                                color: index < 3 ? (mode === 'time' ? '#48bb78' : '#fbbf24') : 'white'
                            }}>
                                <span style={{ width: '20%' }}>#{index + 1}</span>
                                <span style={{ width: '40%' }}>{score.username}</span>
                                <span style={{ width: '40%', textAlign: 'right' }}>
                                    {mode === 'time'
                                        ? (score.time_ms ? formatTime(score.time_ms) : 'N/A')
                                        : score.score}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                <button
                    onClick={onClose}
                    style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: '#f56565',
                        color: 'white',
                        border: 'none',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        marginTop: '10px'
                    }}
                >
                    CLOSE
                </button>
            </motion.div>
        </div>
    );
};

export default Leaderboard;
