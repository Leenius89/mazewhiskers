import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { currentDifficulty } from '../core/difficulty';
import { DEPTH } from '../core/depth';
import { viewportOf } from '../core/screenSpace';
import type { GameScene } from '../scenes/GameScene';

/** Honours a system-level request for less motion. */
const prefersReducedMotion = (): boolean => {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
};

/**
 * How near the machine feels.
 *
 * In a maze the thing chasing you is usually behind a building at the moment it
 * matters, so proximity has to reach the player some other way: the frame starts
 * to tremble and a red wash breathes at the edges as it closes.
 *
 * Held deliberately gentle. The pulse runs at about 1.5Hz — well under the three
 * flashes per second that photosensitivity guidance warns about — the red never
 * approaches opaque, and both the shake and the wash switch off entirely for
 * anyone whose system asks for reduced motion.
 */
export class ThreatFeedback {
    private readonly scene: GameScene;
    private readonly wash: Phaser.GameObjects.Rectangle;
    private readonly reducedMotion = prefersReducedMotion();

    private nextShakeAt = 0;

    /**
     * Where the pulse is in its cycle, carried between frames.
     *
     * The rate changes with distance, and a wave written as
     * `sin(time * rate)` jumps every time the rate does — the phase
     * is time multiplied by it. Advancing a phase by rate * delta
     * instead means the pulse quickens smoothly rather than
     * restarting each time the enemy moves.
     */
    private phase = 0;
    private lastTime = 0;

    constructor(scene: GameScene) {
        this.scene = scene;

        this.wash = scene.add
            .rectangle(0, 0, 10, 10, GameConfig.THREAT.FLASH_COLOR, 1)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(DEPTH.OVERLAY + 1)
            .setAlpha(0);

        this.resize();
    }

    /** Refitted each frame so the zoom of a jump cannot uncover the edges. */
    private resize(): void {
        const camera = this.scene.cameras?.main;
        if (!camera || !this.wash.active) return;

        const viewport = viewportOf(camera);
        this.wash.setPosition(viewport.x, viewport.y);
        this.wash.setSize(viewport.width * viewport.scale, viewport.height * viewport.scale);
    }

    update(time: number): void {
        this.resize();

        // A scripted beat owns the screen; the world is not chasing anyone yet.
        if (this.scene.narrativeActive || this.scene.state.hasEnded()) {
            this.wash.setAlpha(0);
            return;
        }

        const cfg = GameConfig.THREAT;
        const nearness = this.scene.enemyNearness;

        // The chase music hears about this whether or not anything is drawn,
        // so it can wind back down as the enemy loses the player — and it
        // hears over a wider band than the wash is drawn across.
        this.scene.soundManager?.setChaseUrgency(this.scene.enemyAudioNearness);

        const delta = this.lastTime ? Math.min(time - this.lastTime, 100) : 0;
        this.lastTime = time;

        if (nearness <= 0) {
            this.wash.setAlpha(0);
            return;
        }

        const intensity = Math.pow(nearness, cfg.FALLOFF_POWER);
        const dread = currentDifficulty().dread;

        // Reduced motion reduces motion — it does not remove the warning. How
        // close the machine is is information the player needs, so it still
        // arrives, just as a steady glow instead of a pulse, and with no shake.
        if (this.reducedMotion) {
            this.wash.setAlpha(cfg.MAX_FLASH_ALPHA * cfg.REDUCED_MOTION_SCALE * intensity);

            return;
        }

        // Quickens as it closes, from the resting rate up to the ceiling that
        // photosensitivity guidance allows — never past it, on any setting.
        const rate = Phaser.Math.Linear(cfg.PULSE_HZ, cfg.PULSE_HZ_NEAR, intensity);
        this.phase += (delta / 1000) * rate * Math.PI * 2;

        const pulse = 0.5 + 0.5 * Math.sin(this.phase);
        const bite = dread ? cfg.DREAD_ALPHA_SCALE : 1;
        this.wash.setAlpha(Math.min(1, cfg.MAX_FLASH_ALPHA * bite * intensity * pulse));

        // Shaking on an interval rather than every frame keeps it a tremble
        // rather than a vibration.
        if (time >= this.nextShakeAt) {
            this.nextShakeAt = time + cfg.SHAKE_INTERVAL_MS;
            this.scene.cameras.main.shake(cfg.SHAKE_INTERVAL_MS, cfg.MAX_SHAKE * intensity, true);
        }
    }

    destroy(): void {
        this.wash.destroy();
    }
}
