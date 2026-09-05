import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { difficultyOf, weighted } from '../game/core/difficulty';
import { useTranslation } from '../i18n';
import { button, eyebrow, hazardEdge, headline, hint, overlayBackdrop, panel, theme } from './theme';

interface Score {
    id: number;
    username: string;
    score?: number;
    time_ms?: number;
    survived_ms?: number;
    fish_count?: number;
    health_left?: number;
    difficulty?: string;
    created_at: string;
}

export type BoardKey = 'fastest' | 'survived' | 'fed' | 'closest';

/**
 * Three ways to be good at this, each with its own board.
 *
 * There used to be two, reachable only from the screen that happened to end
 * your run — win and you could see the fastest times, lose and you could see
 * the scores, and neither screen admitted the other board existed. They are all
 * reachable from all of them now, because a player who just lost still wants to
 * know what a fast run looks like.
 */
interface Board {
    key: BoardKey;
    /** Table it reads, and the column it ranks by. */
    table: string;
    column: string;
    /** True when a smaller number is the better result. */
    ascending: boolean;
    format: (row: Score) => string;
}

const BOARDS: Board[] = [
    {
        key: 'fastest',
        table: 'speedrun_leaderboard',
        column: 'time_ms',
        ascending: true,
        format: (row) => formatTime(row.time_ms ?? 0)
    },
    {
        key: 'survived',
        table: 'scores',
        column: 'survived_ms',
        ascending: false,
        format: (row) => formatTime(row.survived_ms ?? 0)
    },
    {
        key: 'fed',
        table: 'scores',
        column: 'fish_count',
        ascending: false,
        format: (row) => `🐟 ${row.fish_count ?? 0}`
    },
    {
        /**
         * Cleared, but only just.
         *
         * The other three all reward the same kind of good — more, faster,
         * longer — so one player tends to take all of them. This one is a
         * different story: it is the run that should not have made it.
         */
        key: 'closest',
        table: 'scores',
        column: 'health_left',
        ascending: true,
        format: (row) => `❤ ${row.health_left ?? 0}`
    }
];

interface LeaderboardProps {
    onClose: () => void;
    mode?: BoardKey;
}

const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
};

const MotionButton = motion.div as React.ElementType;

const Leaderboard: React.FC<LeaderboardProps> = ({ onClose, mode = 'survived' }) => {
    const [active, setActive] = useState<BoardKey>(mode);
    const t = useTranslation();
    const board = BOARDS.find((b) => b.key === active) ?? BOARDS[0];
    const [scores, setScores] = useState<Score[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const fetchScores = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            /**
             * Fetched wide, then ranked here.
             *
             * The difficulty weight has to be applied to the value before the
             * ordering means anything, and the database has no column holding
             * the weighted number. So a generous slice comes back sorted by the
             * raw value and the weighting decides the eight that are shown —
             * which is why a slower run on HARD can still take first.
             */
            const { data, error } = await supabase
                .from(board.table)
                .select('*')
                // Rows written before the column existed sort as null; excluded
                // rather than shown as an empty first place.
                .not(board.column, 'is', null)
                .order(board.column, { ascending: board.ascending })
                .limit(120);

            if (error) throw error;

            const ranked = [...(data ?? [])]
                .map((row) => ({
                    row,
                    value: weighted(
                        Number((row as Record<string, unknown>)[board.column] ?? 0),
                        row.difficulty,
                        !board.ascending
                    )
                }))
                .sort((a, b) => (board.ascending ? a.value - b.value : b.value - a.value))
                .slice(0, 8)
                .map((entry) => entry.row);

            setScores(ranked);
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [board]);

    useEffect(() => {
        fetchScores();
    }, [fetchScores]);

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
                    <p style={eyebrow}>{t(`board.${board.key}.eyebrow`)}</p>
                    <h2 style={{ ...headline(theme.accent), fontSize: '1.35rem' }}>
                        {t(`board.${board.key}`)}
                    </h2>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {BOARDS.map((option) => {
                        const on = option.key === board.key;
                        return (
                            <MotionButton
                                key={option.key}
                                onClick={() => setActive(option.key)}
                                whileTap={{ y: 1 }}
                                style={{
                                    flex: '1 1 auto',
                                    padding: '8px 10px',
                                    borderRadius: '5px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    fontFamily: theme.body,
                                    fontSize: '0.78rem',
                                    background: on ? theme.surfaceRaised : 'transparent',
                                    border: `1px solid ${on ? theme.accent : theme.rule}`,
                                    color: on ? theme.accent : theme.inkFaint
                                }}
                            >
                                {t(`board.${option.key}`)}
                            </MotionButton>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minHeight: '180px' }}>
                    {loading && <p style={hint}>{t('board.loading')}</p>}

                    {!loading && failed && (
                        <p style={{ ...hint, color: theme.bad }}>{t('board.failed')}</p>
                    )}

                    {!loading && !failed && scores.length === 0 && (
                        <p style={hint}>{t('board.empty')}</p>
                    )}

                    {!loading &&
                        !failed &&
                        scores.map((entry, index) => (
                            <Row
                                key={entry.id}
                                rank={index + 1}
                                name={entry.username}
                                value={board.format(entry)}
                                difficulty={entry.difficulty}
                            />
                        ))}
                </div>

                <MotionButton style={button('primary')} onClick={onClose} whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                    <X size={13} />
                    {t('board.close')}
                </MotionButton>
            </motion.div>
        </div>
    );
};

/** Top three are marked; the rest are a quiet list, so the podium reads first. */
const Row: React.FC<{ rank: number; name: string; value: string; difficulty?: string }> = ({
    rank,
    name,
    value,
    difficulty
}) => {
    const podium = rank <= 3;
    const level = difficultyOf(difficulty);

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

            {/* Which setting the run was made on. The colour carries it. */}
            <span
                style={{
                    fontFamily: theme.display,
                    fontSize: '0.44rem',
                    letterSpacing: '0.06em',
                    padding: '3px 6px',
                    borderRadius: '3px',
                    color: level.color,
                    border: `1px solid ${level.color}66`,
                    background: `${level.color}18`,
                    whiteSpace: 'nowrap'
                }}
            >
                {level.label}
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
