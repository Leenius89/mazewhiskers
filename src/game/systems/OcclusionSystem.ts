import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import type { GameScene } from '../scenes/GameScene';

/**
 * Keeps the cat findable when the city hides it.
 *
 * With a real y-sort, walking behind a tower means the tower is drawn over the
 * player — which is the point, but it also means the player can lose track of
 * themselves. While the cat is covered, a tinted copy of its current frame is
 * drawn on top so its position stays readable without cancelling the occlusion.
 */
export class OcclusionSystem {
    private readonly scene: GameScene;
    private readonly silhouette: Phaser.GameObjects.Sprite;

    constructor(scene: GameScene) {
        this.scene = scene;

        this.silhouette = scene.add.sprite(0, 0, 'cat1');
        // Must match the player's foot origin. A default centred origin drew
        // the copy half a sprite above the cat, which read as a second ghost
        // cat following it around.
        this.silhouette.setOrigin(0.5, 1);
        this.silhouette.setDepth(DEPTH.OVERLAY);
        this.silhouette.setVisible(false);
        this.silhouette.setTint(GameConfig.OCCLUSION.TINT);
        this.silhouette.setAlpha(GameConfig.OCCLUSION.ALPHA);
    }

    /**
     * Only cells at or below the player can cover it, and only ones within a
     * tower's height matter — so this looks at a small fixed window rather than
     * every building in the world.
     */
    private findOccluder(player: Phaser.GameObjects.Sprite): boolean {
        const occluders = this.scene.occluders;
        if (!occluders || occluders.size === 0) return false;

        const tileUnit = GameConfig.TILE_SIZE * GameConfig.SPACING;
        const gx = Math.round(player.x / tileUnit);
        const gy = Math.round(player.y / tileUnit);

        const playerBounds = player.getBounds();
        const rows = GameConfig.OCCLUSION.SEARCH_ROWS;

        for (let dy = 0; dy <= rows; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const occluder = occluders.get(`${gx + dx},${gy + dy}`);
                if (!occluder || !occluder.active) continue;
                if (occluder.depth <= player.depth) continue;
                if (Phaser.Geom.Rectangle.Overlaps(playerBounds, occluder.getBounds())) return true;
            }
        }

        return false;
    }

    /**
     * Takes the copy off screen and keeps it off.
     *
     * `update` stops being called the moment the run ends, so whatever the
     * silhouette looked like on that frame is what stays on screen — a
     * half-transparent tinted cat hanging in the air over the city. The death
     * animation has to switch it off explicitly.
     */
    hide(): void {
        this.silhouette.setVisible(false);
    }

    update(): void {
        const player = this.scene.player;
        if (!player || !player.active) {
            this.silhouette.setVisible(false);
            return;
        }

        if (!this.findOccluder(player)) {
            this.silhouette.setVisible(false);
            return;
        }

        this.silhouette.setTexture(player.texture.key);
        this.silhouette.setOrigin(player.originX, player.originY);
        this.silhouette.setPosition(player.x, player.y);
        this.silhouette.setScale(player.scaleX, player.scaleY);
        this.silhouette.setFlipX(player.flipX);
        this.silhouette.setVisible(true);
    }

    destroy(): void {
        this.silhouette.destroy();
    }
}
