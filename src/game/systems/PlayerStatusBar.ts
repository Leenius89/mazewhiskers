import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import { worldUi } from '../core/uiScale';
import type { GameScene } from '../scenes/GameScene';

/**
 * Health and jumps, floating over the cat's head.
 *
 * Both numbers already existed in the page header, but the header is nowhere
 * near where the player is looking. During a chase nobody glances up to a
 * different part of the screen — the information has to be on the thing it
 * describes.
 *
 * Jumps ride along as pips under the bar rather than as a separate readout: two
 * numbers about the same cat, in one place, read as one status.
 *
 * Hidden while a narrative beat is running, so the tutorial and the enemy's
 * entrance are not cluttered by a gauge that is not moving yet.
 */
export class PlayerStatusBar {
    private readonly scene: GameScene;
    private readonly graphics: Phaser.GameObjects.Graphics;

    constructor(scene: GameScene) {
        this.scene = scene;
        this.graphics = scene.add.graphics();
        this.graphics.setDepth(DEPTH.OVERLAY + 2);
    }

    private barColor(ratio: number): number {
        const cfg = GameConfig.STATUS_BAR;
        if (ratio <= cfg.CRITICAL_AT) return cfg.CRITICAL;
        if (ratio <= cfg.HURT_AT) return cfg.HURT;
        return cfg.HEALTHY;
    }

    /** Taken off screen entirely — the death animation owns the cat now. */
    setVisible(visible: boolean): void {
        this.graphics.setVisible(visible);
    }

    update(): void {
        this.graphics.clear();

        const player = this.scene.player;
        if (!player || !player.active || this.scene.narrativeActive) return;

        const cfg = GameConfig.STATUS_BAR;
        const camera = this.scene.cameras.main;
        const ratio = Phaser.Math.Clamp(this.scene.health / GameConfig.HEALTH.MAX, 0, 1);

        // Drawn against the screen it is on. A 46x5 bar and a 2.4-pixel jump dot
        // were already small on a monitor; on a phone they were unreadable.
        const width = worldUi(cfg.WIDTH, camera);
        const barHeight = worldUi(cfg.HEIGHT, camera);
        const edge = worldUi(1, camera);

        // Origin is the cat's feet, so its head is a sprite-height above.
        const headY = player.y - player.displayHeight;
        const left = player.x - width / 2;
        const top = headY - worldUi(cfg.OFFSET_Y, camera);

        this.graphics.fillStyle(cfg.BACKGROUND, 0.82);
        this.graphics.fillRect(left - edge, top - edge, width + edge * 2, barHeight + edge * 2);

        this.graphics.fillStyle(this.barColor(ratio), 1);
        this.graphics.fillRect(left, top, width * ratio, barHeight);

        this.graphics.lineStyle(edge, cfg.BORDER, 0.55);
        this.graphics.strokeRect(left - edge, top - edge, width + edge * 2, barHeight + edge * 2);

        this.drawJumpPips(player.x, top + barHeight + worldUi(cfg.PIP.OFFSET_Y, camera), player.jumpCount);
    }

    /** One pip per jump the player could hold, filled for the ones they have. */
    private drawJumpPips(centerX: number, y: number, held: number): void {
        const pip = GameConfig.STATUS_BAR.PIP;
        const camera = this.scene.cameras.main;
        const slots = GameConfig.PLAYER.JUMP.MAX_STOCK;
        const gap = worldUi(pip.GAP, camera);
        const radius = worldUi(pip.RADIUS, camera);
        const span = (slots - 1) * gap;

        for (let i = 0; i < slots; i++) {
            const filled = i < held;
            this.graphics.fillStyle(filled ? pip.FILLED : pip.EMPTY, filled ? 1 : 0.55);
            this.graphics.fillCircle(centerX - span / 2 + i * gap, y, radius);
        }
    }

    destroy(): void {
        this.graphics.destroy();
    }
}
