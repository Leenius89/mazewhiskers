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
export const DIFFICULTIES: Record<DifficultyKey, Difficulty> = {
    easy: {
        key: 'easy',
        label: 'EASY',
        color: '#5cbba6',
        apartmentScale: 1,
        enemyJumpScale: 1,
        rankWeight: 1
    },
    normal: {
        key: 'normal',
        label: 'NORMAL',
        color: '#f0b429',
        apartmentScale: 0.72,
        enemyJumpScale: 0.65,
        rankWeight: 1.3
    },
    hard: {
        key: 'hard',
        label: 'HARD',
        color: '#e8635a',
        apartmentScale: 0.5,
        enemyJumpScale: 0.42,
        rankWeight: 1.7
    }
};

export const DIFFICULTY_ORDER: DifficultyKey[] = ['easy', 'normal', 'hard'];

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
