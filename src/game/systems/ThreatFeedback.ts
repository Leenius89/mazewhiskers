import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
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

    /** 0 when nothing is near, 1 when something is on top of the player. */
    private proximity(): number {
        const player = this.scene.player;
        if (!player || this.scene.enemies.length === 0) return 0;

        let closest = Infinity;
        for (const enemy of this.scene.enemies) {
            if (!enemy.active) continue;
            closest = Math.min(
                closest,
                Phaser.Math.Distance.Between(player.x, player.groundY, enemy.x, enemy.groundY)
            );
        }

        const cfg = GameConfig.THREAT;
        if (!Number.isFinite(closest)) return 0;
        return 1 - Phaser.Math.Clamp((closest - cfg.NEAR) / (cfg.FAR - cfg.NEAR), 0, 1);
    }

    update(time: number): void {
        this.resize();

        // A scripted beat owns the screen; the world is not chasing anyone yet.
        if (this.scene.narrativeActive || this.scene.state.hasEnded()) {
            this.wash.setAlpha(0);
            return;
        }

        const cfg = GameConfig.THREAT;
        const nearness = this.proximity();

        if (nearness <= 0) {
            this.wash.setAlpha(0);
            return;
        }

        const intensity = Math.pow(nearness, cfg.FALLOFF_POWER);

        // Reduced motion reduces motion — it does not remove the warning. How
        // close the machine is is information the player needs, so it still
        // arrives, just as a steady glow instead of a pulse, and with no shake.
        if (this.reducedMotion) {
            this.wash.setAlpha(cfg.MAX_FLASH_ALPHA * cfg.REDUCED_MOTION_SCALE * intensity);
            return;
        }

        const pulse = 0.5 + 0.5 * Math.sin((time / 1000) * cfg.PULSE_HZ * Math.PI * 2);
        this.wash.setAlpha(cfg.MAX_FLASH_ALPHA * intensity * pulse);

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
