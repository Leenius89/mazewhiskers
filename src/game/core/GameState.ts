/**
 * Explicit run state.
 *
 * This replaces the single `gameOverStarted` boolean that used to stand in for
 * "dying", "dead", "won" and "paused" all at once. Every guard in the game now
 * asks this machine a question instead of reading a flag whose meaning depended
 * on where you read it from.
 */
export type GamePhase =
    | 'loading'   // scene is building the world
    | 'intro'     // camera fly-over to the goal and back
    | 'playing'   // player has control
    | 'paused'    // tutorial overlay or focus loss
    | 'dying'     // death animation running, input ignored
    | 'clearing'  // district finished; the next one is loading
    | 'gameover'  // run lost, results handed to React
    | 'victory';  // run won, results handed to React

/** Which phases each phase is allowed to move to. */
const TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
    loading: ['intro', 'playing', 'paused'],
    intro: ['playing', 'paused', 'dying', 'victory', 'clearing'],
    playing: ['paused', 'dying', 'victory', 'clearing'],
    paused: ['loading', 'intro', 'playing', 'dying', 'victory', 'clearing'],
    dying: ['gameover'],
    clearing: [],
    gameover: [],
    victory: []
};

export type PhaseListener = (to: GamePhase, from: GamePhase) => void;

export class GameStateMachine {
    private phase: GamePhase = 'loading';
    /** Phase to fall back to when `resume()` is called. */
    private resumeTarget: GamePhase = 'loading';
    private readonly listeners: PhaseListener[] = [];

    get current(): GamePhase {
        return this.phase;
    }

    onChange(listener: PhaseListener): void {
        this.listeners.push(listener);
    }

    is(...phases: GamePhase[]): boolean {
        return phases.includes(this.phase);
    }

    /**
     * True once the run is over in any way — dying, dead or won.
     *
     * This is the direct replacement for the old `gameOverStarted` check. It is
     * deliberately broader: the old flag stayed false through victory, which was
     * only safe because `goalUtils` happened to pause physics and drop every
     * timer first.
     */
    hasEnded(): boolean {
        return this.is('dying', 'clearing', 'gameover', 'victory');
    }

    /** True while the player is meant to have control. */
    acceptsInput(): boolean {
        return this.is('intro', 'playing');
    }

    canTransitionTo(to: GamePhase): boolean {
        return TRANSITIONS[this.phase].includes(to);
    }

    /**
     * Move to `to`. Returns false and warns if the transition is not allowed,
     * so an illegal transition shows up in the console instead of silently
     * corrupting state the way overlapping booleans used to.
     */
    transitionTo(to: GamePhase): boolean {
        if (to === this.phase) return false;

        if (!this.canTransitionTo(to)) {
            console.warn(`[GameState] 허용되지 않은 전이: ${this.phase} -> ${to}`);
            return false;
        }

        const from = this.phase;
        this.phase = to;
        this.listeners.forEach((listener) => listener(to, from));
        return true;
    }

    /** Suspend the run, remembering where to come back to. */
    pause(): boolean {
        if (this.phase === 'paused' || this.hasEnded()) return false;
        this.resumeTarget = this.phase;
        return this.transitionTo('paused');
    }

    /** Return to whatever phase was active before `pause()`. */
    resume(): boolean {
        if (this.phase !== 'paused') return false;
        return this.transitionTo(this.resumeTarget);
    }

    reset(): void {
        this.phase = 'loading';
        this.resumeTarget = 'loading';
        this.listeners.length = 0;
    }
}
