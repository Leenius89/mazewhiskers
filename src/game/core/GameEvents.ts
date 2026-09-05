import Phaser from 'phaser';
import type { GamePhase } from './GameState';

/**
 * Typed wrapper around the game-level event emitter.
 *
 * Every message that crosses the Phaser <-> React boundary is declared in
 * `GameEventMap`. Previously these were bare strings passed to `game.events`,
 * so a typo in either an `emit` or an `on` failed silently at runtime.
 */

export interface HealthChangedPayload {
    /** Current health after the change, already clamped to [0, max]. */
    health: number;
    max: number;
    /** Signed amount that was applied. */
    delta: number;
}

export interface RunSummary {
    milkCount: number;
    fishCount: number;
}

export interface GameOverPayload extends RunSummary {
    /**
     * What ended the run.
     *
     * The results screen names it. "You died" tells a first-time player nothing;
     * "there was nowhere left to be pushed" tells them what the game is about.
     */
    reason: 'health' | 'enemy' | 'apartment:player' | 'apartment:goal' | 'trapped';
    /**
     * How long the cat lasted, districts included.
     *
     * A losing run had nothing to be proud of and nothing to record. Time
     * survived is the thing it was actually measuring all along.
     */
    survivedMs: number;
}

export interface VictoryPayload extends RunSummary {
    timeMs: number;
}

export interface PhaseChangedPayload {
    from: GamePhase;
    to: GamePhase;
}

export interface GameEventMap {
    /** Scene finished `create()`; React may now show the tutorial overlay. */
    gameReady: void;
    /** React asks the scene to suspend. */
    pauseGame: void;
    /** React asks the scene to continue. */
    resumeGame: void;
    phaseChanged: PhaseChangedPayload;
    /** Authoritative health, owned by the scene. React only displays it. */
    healthChanged: HealthChangedPayload;
    jumpCountChanged: number;
    milkCollected: number;
    fishCollected: number;
    gameOver: GameOverPayload;
    victory: VictoryPayload;
    /** React asks the VictoryScene to roll the credits over the canvas. */
    showCredits: void;
    /** Credits dismissed; React brings its results panel back. */
    creditsClosed: void;
}

type EventKey = keyof GameEventMap;
type Payload<K extends EventKey> = GameEventMap[K];
type EmitArgs<K extends EventKey> = Payload<K> extends void ? [] : [Payload<K>];
type Handler<K extends EventKey> = (payload: Payload<K>) => void;

export class GameEventBus {
    constructor(private readonly emitter: Phaser.Events.EventEmitter) {}

    emit<K extends EventKey>(key: K, ...args: EmitArgs<K>): void {
        this.emitter.emit(key, ...args);
    }

    on<K extends EventKey>(key: K, handler: Handler<K>, context?: unknown): this {
        this.emitter.on(key, handler, context);
        return this;
    }

    once<K extends EventKey>(key: K, handler: Handler<K>, context?: unknown): this {
        this.emitter.once(key, handler, context);
        return this;
    }

    off<K extends EventKey>(key: K, handler?: Handler<K>, context?: unknown): this {
        this.emitter.off(key, handler, context);
        return this;
    }

    /** Drop every listener this game registered. Used on teardown. */
    removeAll(): void {
        (Object.keys(EVENT_KEYS) as EventKey[]).forEach((key) => this.emitter.off(key));
    }
}

/**
 * Runtime list of the event names, so `removeAll` cannot drift from the map.
 * Declared as an object rather than an array so the compiler errors if a key
 * is added to `GameEventMap` and forgotten here.
 */
const EVENT_KEYS: Record<EventKey, true> = {
    gameReady: true,
    pauseGame: true,
    resumeGame: true,
    phaseChanged: true,
    healthChanged: true,
    jumpCountChanged: true,
    milkCollected: true,
    fishCollected: true,
    gameOver: true,
    victory: true,
    showCredits: true,
    creditsClosed: true
};

export const createGameEventBus = (game: Phaser.Game): GameEventBus => new GameEventBus(game.events);
