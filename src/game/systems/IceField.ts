import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import { TILE_UNIT } from '../core/grid';
import type { GameScene } from '../scenes/GameScene';

/**
 * The frozen streets, drawn flat on the road.
 *
 * Ground depth, under everything that stands on it: the cat, the towers and
 * the fog all sort above, so on nightmare a frozen alley is hidden until it
 * has been seen, exactly like the rest of the city.
 *
 * Drawn once, and again only when the towers have taken some of it: a cell
 * with a building on it is no longer street, and a pale blue square peeking
 * out from under a block would read as a bug rather than as weather.
 */
export class IceField {
    private readonly scene: GameScene;
    private readonly layer: Phaser.GameObjects.Graphics;
    private lastBuilt = -1;

    constructor(scene: GameScene) {
        this.scene = scene;
        this.layer = scene.add.graphics().setDepth(DEPTH.GROUND + 1);
        this.draw();
    }

    /**
     * Cheap dirty check, the same one the minimap uses: the city only ever
     * gains buildings, so a change in the count is the only way the drawing
     * can go stale.
     */
    update(): void {
        const built = this.scene.apartmentSystem?.alleysRemaining ?? -1;
        if (built === this.lastBuilt) return;

        this.lastBuilt = built;
        this.draw();
    }

    private draw(): void {
        this.layer.clear();
        if (this.scene.ice.size === 0) return;

        const look = GameConfig.ICE.LOOK;
        const half = TILE_UNIT / 2;

        // Two passes, so a run of frozen cells reads as one sheet rather than
        // as a row of blue squares: every cell is filled first, and only the
        // edges where the ice actually ends are drawn.
        const frozen: { gx: number; gy: number; left: number; top: number }[] = [];
        this.scene.ice.forEach((key) => {
            const [gx, gy] = key.split(',').map(Number);
            if (this.scene.apartmentSystem?.isCellBuilt(gx, gy)) return;
            frozen.push({ gx, gy, left: gx * TILE_UNIT - half, top: gy * TILE_UNIT - half });
        });

        const iced = (gx: number, gy: number): boolean => this.scene.isIce(gx, gy);

        frozen.forEach(({ left, top }) => {
            this.layer.fillStyle(look.FILL, look.FILL_ALPHA);
            this.layer.fillRect(left, top, TILE_UNIT, TILE_UNIT);
        });

        frozen.forEach(({ gx, gy, left, top }) => {
            // A pale wedge where the sheet begins, which is where the light
            // would catch it. Inside the sheet there is nothing to catch.
            if (!iced(gx - 1, gy) || !iced(gx, gy - 1)) {
                this.layer.fillStyle(look.SHEEN, look.SHEEN_ALPHA);
                this.layer.fillTriangle(left, top, left + TILE_UNIT, top, left, top + TILE_UNIT);
            }

            this.layer.lineStyle(2, look.EDGE, 0.6);
            if (!iced(gx, gy - 1)) this.layer.lineBetween(left, top, left + TILE_UNIT, top);
            if (!iced(gx, gy + 1)) this.layer.lineBetween(left, top + TILE_UNIT, left + TILE_UNIT, top + TILE_UNIT);
            if (!iced(gx - 1, gy)) this.layer.lineBetween(left, top, left, top + TILE_UNIT);
            if (!iced(gx + 1, gy)) this.layer.lineBetween(left + TILE_UNIT, top, left + TILE_UNIT, top + TILE_UNIT);

            // Cracks, placed from the cell's own coordinates rather than from
            // chance: the same city always freezes the same way, and nothing
            // here touches the run's seeded generator.
            this.layer.lineStyle(1, look.CRACK, look.CRACK_ALPHA);
            for (let i = 0; i < look.CRACKS; i++) {
                const a = ((gx * 7 + gy * 13 + i * 29) % 100) / 100;
                const b = ((gx * 17 + gy * 5 + i * 47) % 100) / 100;
                this.layer.lineBetween(
                    left + a * TILE_UNIT,
                    top + b * TILE_UNIT,
                    left + b * TILE_UNIT,
                    top + TILE_UNIT - a * TILE_UNIT
                );
            }
        });
    }

    destroy(): void {
        this.layer.destroy();
    }
}
