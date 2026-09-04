import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { button, eyebrow, hazardEdge, headline, hint, overlayBackdrop, panel, theme } from './theme';

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
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
};

const MotionButton = motion.div as React.ElementType;

const Leaderboard: React.FC<LeaderboardProps> = ({ onClose, mode = 'score' }) => {
    const [scores, setScores] = useState<Score[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const fetchScores = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const query =
                mode === 'time'
                    ? supabase
                          .from('speedrun_leaderboard')
                          .select('*')
                          .order('time_ms', { ascending: true })
                          .limit(8)
                    : supabase.from('scores').select('*').order('score', { ascending: false }).limit(8);

            const { data, error } = await query;
            if (error) throw error;
            setScores(data || []);
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [mode]);

    useEffect(() => {
        fetchScores();
    }, [fetchScores]);

    const isTime = mode === 'time';

    return (
        <div style={overlayBackdrop}>
            <motion.div
                style={panel}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
            >
                <div style={hazardEdge} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p style={eyebrow}>{isTime ? 'FASTEST HOME' : 'HIGH SCORES'}</p>
                    <h2 style={{ ...headline(theme.accent), fontSize: '1.35rem' }}>
                        {isTime ? '가장 빨리 집에 닿은 사람' : '가장 멀리 버틴 사람'}
                    </h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minHeight: '180px' }}>
                    {loading && <p style={hint}>불러오는 중…</p>}

                    {!loading && failed && (
                        <p style={{ ...hint, color: theme.bad }}>기록을 불러오지 못했습니다.</p>
                    )}

                    {!loading && !failed && scores.length === 0 && (
                        <p style={hint}>아직 기록이 없습니다. 첫 번째가 되어 보세요.</p>
                    )}

                    {!loading &&
                        !failed &&
                        scores.map((entry, index) => (
                            <Row
                                key={entry.id}
                                rank={index + 1}
                                name={entry.username}
                                value={isTime ? formatTime(entry.time_ms ?? 0) : (entry.score ?? 0).toLocaleString()}
                            />
                        ))}
                </div>

                <MotionButton style={button('primary')} onClick={onClose} whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                    <X size={13} />
                    닫기 / CLOSE
                </MotionButton>
            </motion.div>
        </div>
    );
};

/** Top three are marked; the rest are a quiet list, so the podium reads first. */
const Row: React.FC<{ rank: number; name: string; value: string }> = ({ rank, name, value }) => {
    const podium = rank <= 3;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '9px 12px',
                borderRadius: '5px',
                background: podium ? theme.surfaceRaised : 'transparent',
                borderLeft: `2px solid ${podium ? theme.accent : 'transparent'}`
            }}
        >
            <span
                style={{
                    fontFamily: theme.display,
                    fontSize: '0.6rem',
                    color: podium ? theme.accent : theme.inkFaint,
                    width: '18px',
                    fontVariantNumeric: 'tabular-nums'
                }}
            >
                {rank}
            </span>
            <span
                style={{
                    flex: 1,
                    fontFamily: theme.display,
                    fontSize: '0.62rem',
                    color: theme.ink,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}
            >
                {name}
            </span>
            <span
                style={{
                    fontFamily: theme.display,
                    fontSize: '0.68rem',
                    color: podium ? theme.ink : theme.inkMuted,
                    fontVariantNumeric: 'tabular-nums'
                }}
            >
                {value}
            </span>
        </div>
    );
};

export default Leaderboard;
