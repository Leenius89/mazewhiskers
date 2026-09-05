import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import { worldUi } from '../core/uiScale';
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
 * The cat sweats when the machine gets close.
 *
 * The red wash and the tremble say something is wrong with the world; this says
 * something is wrong with the cat. It reads from across the room, which the
 * exhibition needs, and it is the one proximity cue that survives being looked
 * at directly rather than only at the edges of vision.
 *
 * Drops are cheap rectangles rather than a particle emitter: at this size a
 * four-pixel square is the whole of the art, and a pool of a dozen covers the
 * closest the enemy can get.
 */
export class SweatDrops {
    private readonly scene: GameScene;
    private readonly pool: Phaser.GameObjects.Rectangle[] = [];
    private readonly reducedMotion = prefersReducedMotion();

    private nextDropAt = 0;

    constructor(scene: GameScene) {
        this.scene = scene;

        const cfg = GameConfig.SWEAT;
        for (let i = 0; i < cfg.POOL; i++) {
            this.pool.push(
                scene.add
                    .rectangle(0, 0, worldUi(cfg.SIZE, scene.cameras.main), worldUi(cfg.SIZE, scene.cameras.main), cfg.COLOR, 1)
                    .setDepth(DEPTH.OVERLAY - 20)
                    .setVisible(false)
                    .setActive(false)
            );
        }
    }

    /** 0 when nothing is near, 1 when something is on top of the player. */
    private proximity(): number {
        const player = this.scene.player;
        if (!player) return 0;

        let closest = Infinity;
        for (const enemy of this.scene.enemies) {
            if (!enemy.active) continue;
            closest = Math.min(
                closest,
                Phaser.Math.Distance.Between(player.x, player.groundY, enemy.x, enemy.groundY)
            );
        }

        if (!Number.isFinite(closest)) return 0;

        const cfg = GameConfig.SWEAT;
        return 1 - Phaser.Math.Clamp((closest - cfg.NEAR) / (cfg.FAR - cfg.NEAR), 0, 1);
    }

    update(time: number): void {
        if (this.scene.narrativeActive || this.scene.state.hasEnded()) return;

        const nearness = this.proximity();
        if (nearness <= 0) return;

        if (time < this.nextDropAt) return;

        const cfg = GameConfig.SWEAT;
        // Closer means more often, not merely bigger — panic is a rate.
        const interval = Phaser.Math.Linear(cfg.MAX_INTERVAL_MS, cfg.MIN_INTERVAL_MS, nearness);
        this.nextDropAt = time + interval / (this.reducedMotion ? cfg.REDUCED_MOTION_SCALE : 1);

        this.fling();
    }

    private fling(): void {
        const player = this.scene.player;
        const drop = this.pool.find((candidate) => !candidate.active);
        if (!player || !drop) return;

        const cfg = GameConfig.SWEAT;
        // Off the side of the head, whichever way the cat is facing.
        const side = Math.random() < 0.5 ? -1 : 1;
        const camera = this.scene.cameras.main;
        const startX = player.x + side * worldUi(cfg.HEAD_OFFSET_X, camera);
        const startY = player.y - player.displayHeight + worldUi(cfg.HEAD_OFFSET_Y, camera);

        drop.setPosition(startX, startY).setScale(1).setAlpha(1).setVisible(true).setActive(true);

        this.scene.tweens.add({
            targets: drop,
            x: startX + side * Phaser.Math.Between(worldUi(cfg.DRIFT, camera) * 0.4, worldUi(cfg.DRIFT, camera)),
            y: startY - worldUi(cfg.RISE, camera),
            duration: cfg.DURATION * 0.4,
            ease: 'Sine.easeOut',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: drop,
                    y: startY - worldUi(cfg.RISE, camera) + worldUi(cfg.FALL, camera),
                    alpha: 0,
                    duration: cfg.DURATION * 0.6,
                    ease: 'Sine.easeIn',
                    onComplete: () => drop.setVisible(false).setActive(false)
                });
            }
        });
    }

    destroy(): void {
        this.pool.forEach((drop) => drop.destroy());
        this.pool.length = 0;
    }
}
