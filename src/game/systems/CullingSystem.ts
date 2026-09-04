import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';

/**
 * Hides world sprites the camera cannot see.
 *
 * Phaser culls tilemap layers but not plain sprites, so every one of the ~1,500
 * buildings and towers is submitted to the renderer each frame otherwise. Static
 * physics bodies are unaffected by visibility, so collisions keep working on the
 * hidden ones.
 *
 * Runs on an interval rather than per frame — the view moves slowly enough that
 * a few hundred milliseconds of slack is invisible, and the padding covers it.
 */
export class CullingSystem {
    private readonly scene: Phaser.Scene;
    private readonly groups: Phaser.GameObjects.Group[] = [];
    private nextRunAt = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    watch(group?: Phaser.GameObjects.Group | null): void {
        if (group) this.groups.push(group);
    }

    update(time: number): void {
        if (time < this.nextRunAt) return;
        this.nextRunAt = time + GameConfig.CULLING.INTERVAL_MS;

        const view = this.scene.cameras.main.worldView;
        const pad = GameConfig.CULLING.PADDING;

        const left = view.x - pad;
        const right = view.right + pad;
        const top = view.y - pad;
        const bottom = view.bottom + pad;

        for (const group of this.groups) {
            const children = group.getChildren() as Phaser.GameObjects.Sprite[];
            for (const child of children) {
                if (!child.active) continue;

                // Towers are tall: test the drawn bounds, not just the origin,
                // or their tops pop in and out at the top of the screen.
                const halfWidth = child.displayWidth / 2;
                const bottomY = child.y + child.displayHeight * (1 - child.originY);
                const topY = bottomY - child.displayHeight;

                child.setVisible(
                    child.x + halfWidth >= left &&
                        child.x - halfWidth <= right &&
                        bottomY >= top &&
                        topY <= bottom
                );
            }
        }
    }

    destroy(): void {
        this.groups.length = 0;
    }
}
