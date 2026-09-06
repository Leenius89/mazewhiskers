import { getSettings } from '../../settings';

export type DifficultyKey = 'easy' | 'normal' | 'hard';

export interface Difficulty {
    key: DifficultyKey;
    /** Shown on the settings panel and beside every leaderboard row. */
    label: string;
    color: string;

    /**
     * Multiplies both the grace period before redevelopment starts and the gap
     * between blocks. Below 1 means the city closes in sooner and faster.
     */
    apartmentScale: number;

    /** Multiplies how fast health drains and how much rent takes. */
    costScale: number;

    /** Multiplies the black cat's chase speed. Never past the player's own. */
    enemySpeedScale: number;

    /**
     * How far the vision cone is drawn.
     *
     * The cone is a signal, not a sensor — the black cat always knows where
     * you are, and always has. A longer reach on a harder setting is honest
     * about that: it tells the player how much of the street is unsafe
     * before they learn it the expensive way.
     */
    enemyVisionScale: number;

    /**
     * Multiplies the enemy's jump cooldown. Below 1 means it clears the wall it
     * just hit sooner, so a corner buys less time.
     */
    enemyJumpScale: number;

    /**
     * What a run on this setting is worth on the boards.
     *
     * Applied to whatever each board ranks by, so a slower time on hard can
     * still beat a faster one on easy. Without it the boards would only ever
     * reward turning the difficulty down.
     */
    rankWeight: number;
}

/**
 * Three settings, of which the first is the game as it already was.
 *
 * Nothing is described in words on the panel — the colour and the name carry
 * it, and a paragraph explaining what a difficulty does is a paragraph nobody
 * in a gallery is going to read.
 */
/**
 * Three settings that should feel like three games.
 *
 * They used to differ in two numbers — how often a tower went up, and how
 * often the black cat could jump a wall — and both of those are things a
 * player only notices in hindsight. Whether a run was hard is decided by how
 * fast the money goes and how soon you are seen, so those are here too.
 *
 * The chase speed stays under the player's 160 at every setting: the point is
 * that it can always be outrun, and losing that would turn a chase into a
 * coin toss.
 */
export const DIFFICULTIES: Record<DifficultyKey, Difficulty> = {
    easy: {
        key: 'easy',
        label: 'EASY',
        color: '#5cbba6',
        apartmentScale: 1,
        costScale: 1,
        enemySpeedScale: 1,
        enemyVisionScale: 1,
        enemyJumpScale: 1,
        rankWeight: 1
    },
    normal: {
        key: 'normal',
        label: 'NORMAL',
        color: '#f0b429',
        apartmentScale: 0.6,
        costScale: 1.3,
        enemySpeedScale: 1.14,
        enemyVisionScale: 1.25,
        enemyJumpScale: 0.6,
        rankWeight: 1.3
    },
    hard: {
        key: 'hard',
        label: 'HARD',
        color: '#e8635a',
        apartmentScale: 0.36,
        costScale: 1.75,
        enemySpeedScale: 1.3,
        enemyVisionScale: 1.55,
        enemyJumpScale: 0.34,
        rankWeight: 1.7
    }
};

export const DIFFICULTY_ORDER: DifficultyKey[] = ['easy', 'normal', 'hard'];

/** The setting this run is being played on. */
export const currentDifficulty = (): Difficulty => difficultyOf(getSettings().difficulty);

export const difficultyOf = (key: string | undefined | null): Difficulty =>
    DIFFICULTIES[(key as DifficultyKey) ?? 'easy'] ?? DIFFICULTIES.easy;

/**
 * Turns a raw board value into the one it is ranked by.
 *
 * `higherIsBetter` decides which way the weight pulls: more fish on hard should
 * count for more, a slower time on hard should count as faster.
 */
export const weighted = (value: number, key: string | undefined | null, higherIsBetter: boolean): number => {
    const weight = difficultyOf(key).rankWeight;
    return higherIsBetter ? value * weight : value / weight;
};
