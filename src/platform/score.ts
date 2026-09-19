import { difficultyOf } from '../game/core/difficulty';
import type { RecordsBroken } from './records';
import type { SubmitOutcome } from './toss';

/**
 * The one number a run is worth on the Toss leaderboard.
 *
 * The web build ranks four things on four boards. Toss gives a mini-app one
 * board and one number, so the four have to be folded into it without any of
 * them making the others pointless:
 *
 *   what was gathered      milk, fish and jumps, exactly as the run bar counts
 *   getting home           a flat bonus, because a clear is the point
 *   getting home quickly   ten points for every second under par
 *   how hard it was        all of it multiplied by the difficulty's weight
 *
 * The sizes come from the runs already on the web boards: a clear takes
 * between twenty seconds and two minutes with a median near thirty-seven, and
 * a decent haul is about a thousand points. So a fast clear is worth roughly
 * a good haul — neither sprinting past everything nor hoovering up the map
 * and dying wins on its own, and the best score is the run that did both.
 */
export const TOSS_SCORE = {
    CLEAR_BONUS: 1000,
    /** Seconds allowed on a standard map before the time bonus reaches zero. */
    PAR_SECONDS: 120,
    PER_SECOND_UNDER_PAR: 10
} as const;

export interface RunResult {
    /** The run bar's score: milk, fish and jumps. */
    gathered: number;
    difficulty: string;
    /** Time to the goal. Absent when the run ended any other way. */
    clearedMs?: number;
}

export interface ScoreBreakdown {
    gathered: number;
    clearBonus: number;
    timeBonus: number;
    weight: number;
    total: number;
}

export const scoreRun = ({ gathered, difficulty, clearedMs }: RunResult): ScoreBreakdown => {
    const level = difficultyOf(difficulty);
    const cleared = typeof clearedMs === 'number';

    // Nightmare's city is half as large again, and par stretches with it:
    // the same pace should earn the same bonus.
    const par = TOSS_SCORE.PAR_SECONDS * level.mapScale;
    const seconds = cleared ? (clearedMs as number) / 1000 : par;

    const clearBonus = cleared ? TOSS_SCORE.CLEAR_BONUS : 0;
    const timeBonus = cleared ? Math.round(Math.max(0, par - seconds) * TOSS_SCORE.PER_SECOND_UNDER_PAR) : 0;

    return {
        gathered,
        clearBonus,
        timeBonus,
        weight: level.rankWeight,
        total: Math.round((gathered + clearBonus + timeBonus) * level.rankWeight)
    };
};

/**
 * What the results screens are told about the run that just ended.
 *
 * Worked out once, as the run ends, rather than by whichever panel happens
 * to mount: the score goes to Toss exactly once per run, and a panel that
 * re-renders must not be able to send it again.
 */
export interface RunOutcome {
    breakdown: ScoreBreakdown;
    broken: RecordsBroken;
    /** Null while Toss has not answered yet. */
    sent: SubmitOutcome | null;
    /** How many of the endings this player has now seen. */
    endingsSeen: number;
    /** Set for a run of today's city: the day, and where the player stands on it. */
    daily: { date: string; best: number; tries: number; streak: number } | null;
}
