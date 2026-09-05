import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { DIFFICULTY_ORDER, difficultyOf, weighted } from '../game/core/difficulty';
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

/** How many places every board shows, and the height it is held at. */
const ROWS = 10;
const ROW_HEIGHT = 34;

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
        /**
         * Read from the clear table, not the run table.
         *
         * `scores` takes a row from every run, won or lost, and a run that
         * lost to rent ends on exactly zero health. Ranked by "least health
         * remaining", a death is unbeatable — this board's first place was a
         * player who did not make it, permanently. `speedrun_leaderboard` is
         * only ever written on a clear, which is the condition the board was
         * describing all along.
         */
        table: 'speedrun_leaderboard',
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
             * One short query per difficulty, then ranked here.
             *
             * The weight has to be applied before the ordering means anything,
             * and no column holds the weighted number. This used to be handled
             * by taking the best hundred-and-twenty rows by raw value and
             * re-sorting those, which quietly discards the very rows the
             * weighting exists for: a hard run of ninety seconds counts as
             * fifty-three and belongs at the top, but once a hundred and twenty
             * easier runs sit above it on raw time it is never fetched at all.
             *
             * Within one difficulty the weight is a constant, so raw order and
             * weighted order agree and only that difficulty's own top ten can
             * reach the final ten. Asking each of them separately makes the
             * result exact however many records pile up.
             */
            const groups = await Promise.all(
                [...DIFFICULTY_ORDER, null].map((level) => {
                    const query = supabase
                        .from(board.table)
                        .select('*')
                        // Rows written before the column existed sort as null;
                        // excluded rather than shown as an empty first place.
                        .not(board.column, 'is', null);

                    // The last pass picks up runs recorded before difficulty
                    // was a setting. Read as easy, as they are everywhere else.
                    const scoped = level
                        ? query.eq('difficulty', level)
                        : query.is('difficulty', null);

                    return scoped.order(board.column, { ascending: board.ascending }).limit(ROWS);
                })
            );

            const failure = groups.find((group) => group.error);
            if (failure?.error) {
                /*
                 * A board whose column has not been migrated yet is empty, not
                 * broken.
                 *
                 * PostgreSQL answers 42703 for a column that does not exist. The
                 * closest-call board reads `health_left` off the clear table,
                 * which only arrives with the migration; until it is applied,
                 * "no records yet" is both true and far less alarming than a
                 * red failure notice on a board nobody has broken.
                 */
                if (failure.error.code === '42703') {
                    setScores([]);
                    return;
                }
                throw failure.error;
            }

            const ranked = groups
                .flatMap((group) => group.data ?? [])
                .map((row) => ({
                    row,
                    value: weighted(
                        Number((row as Record<string, unknown>)[board.column] ?? 0),
                        row.difficulty,
                        !board.ascending
                    )
                }))
                .sort((a, b) => (board.ascending ? a.value - b.value : b.value - a.value))
                .slice(0, ROWS)
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
                // Wider than a results panel: four tabs have to sit on one line,
                // and a table of ten is a different shape from a paragraph.
                style={{ ...panel, maxWidth: '620px' }}
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
                    {/* Without this the list reads as broken: a slower time can
                        sit above a faster one and only a small badge hints at why. */}
                    <p style={{ ...hint, margin: 0 }}>{t('board.weighted')}</p>
                </div>

                {/* Four across on a panel that has the width for it, two by two
                    when it does not. Forcing one row onto a phone left every tab
                    64px wide, so three of the four read as "가장 …" and the
                    board you were looking at could not be told from the rest. */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {BOARDS.map((option) => {
                        const on = option.key === board.key;
                        return (
                            <MotionButton
                                key={option.key}
                                onClick={() => setActive(option.key)}
                                whileTap={{ y: 1 }}
                                style={{
                                    flex: '1 1 130px',
                                    minWidth: 0,
                                    padding: '8px 6px',
                                    borderRadius: '5px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    fontFamily: theme.body,
                                    fontSize: '0.66rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
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

                {/* Held at a fixed height so switching tabs does not make the
                    panel jump around under the cursor. */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        height: `${ROWS * ROW_HEIGHT}px`,
                        overflow: 'hidden'
                    }}
                >
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
                                adjusted={adjustedLabel(board, entry)}
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

/**
 * What a row counts as once its difficulty is taken into account.
 *
 * Only produced when it differs from the raw figure, so an easy run is not
 * decorated with a second copy of its own number.
 */
const adjustedLabel = (board: Board, row: Score): string | null => {
    if (difficultyOf(row.difficulty).rankWeight === 1) return null;

    const raw = Number((row as unknown as Record<string, unknown>)[board.column] ?? 0);
    const value = weighted(raw, row.difficulty, !board.ascending);
    return board.format({ ...row, [board.column]: Math.round(value) } as Score);
};

/** Top three are marked; the rest are a quiet list, so the podium reads first. */
const Row: React.FC<{
    rank: number;
    name: string;
    value: string;
    adjusted: string | null;
    difficulty?: string;
}> = ({ rank, name, value, adjusted, difficulty }) => {
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    fontFamily: theme.display,
                    fontSize: '0.68rem',
                    color: podium ? theme.ink : theme.inkMuted,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.15
                }}
            >
                {value}
                {adjusted && (
                    <span style={{ fontSize: '0.44rem', color: level.color }}>→ {adjusted}</span>
                )}
            </span>
        </div>
    );
};

export default Leaderboard;
