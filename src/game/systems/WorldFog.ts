import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import { TILE_UNIT } from '../core/grid';
import type { GameScene } from '../scenes/GameScene';

/**
 * Fog over the city itself, not over a drawing of it.
 *
 * The map in the corner was only ever the report. This is the thing being
 * reported: on nightmare the streets themselves are hidden, and what lifts
 * them is where the cat is looking. Walk down a street and it opens ahead of
 * you and closes behind; turn round and the way you came is a grey memory
 * rather than a place you can see into.
 *
 * Three states, the same three the minimap draws, so the two never disagree:
 *
 *   in sight    — nothing drawn, the city as it is
 *   remembered  — thin fog, enough to read the shape and not the detail
 *   never seen  — fog, and whatever is standing in it is standing in it
 *
 * Deliberately cell-shaped rather than a smooth cone. A soft arc would have to
 * be a geometric slice, and a geometric slice sees through buildings — it would
 * light the inside of a block the cat cannot possibly see into. The lit region
 * is the set of cells that passed a line of sight test, which is truthful, and
 * on a city that is already a grid it reads as deliberate.
 *
 * Redrawn only when what is visible changes — on a new cell or a real turn —
 * rather than every frame. It is sixteen hundred rectangles either way, and
 * one of those is a few times a second instead of sixty.
 */
export class WorldFog {
    private readonly scene: GameScene;
    private readonly layer: Phaser.GameObjects.Graphics;
    private dirty = true;

    constructor(scene: GameScene) {
        this.scene = scene;

        // Above every sorted world object, so the black cat standing in an
        // unseen street is hidden by this as surely as the street is. Below
        // the screen effects, which are the game talking rather than the world.
        this.layer = scene.add.graphics().setDepth(DEPTH.OVERLAY - 20);
    }

    /** Marks the fog for a redraw. Called when the cat moves or turns. */
    invalidate(): void {
        this.dirty = true;
    }

    update(): void {
        // Lifted entirely while a beat is on screen. The tutorial flies the
        // camera to home, to a fish, to a bottle of milk, and names each one —
        // all of them streets away and all of them, to the cat, unseen. Fog
        // over a beat is the game pointing at something it is also hiding.
        const narrating = this.scene.narrativeActive;
        if (this.layer.visible === narrating) this.layer.setVisible(!narrating);

        if (!this.dirty) return;
        this.dirty = false;
        this.redraw();
    }

    private redraw(): void {
        const maze = this.scene.maze;
        if (!maze) return;

        const cfg = GameConfig.FOG;
        const size = maze.length;
        const half = TILE_UNIT / 2;
        // A hair over a whole cell, so neighbouring squares of fog overlap
        // instead of leaving a lit seam between them.
        const bleed = 1;

        this.layer.clear();

        for (let gy = 0; gy < size; gy++) {
            for (let gx = 0; gx < size; gx++) {
                const key = `${gx},${gy}`;
                if (this.scene.visible.has(key)) continue;

                const remembered = this.scene.visited.has(key);
                this.layer.fillStyle(cfg.COLOR, remembered ? cfg.REMEMBERED_ALPHA : cfg.UNKNOWN_ALPHA);
                this.layer.fillRect(
                    gx * TILE_UNIT - half - bleed,
                    gy * TILE_UNIT - half - bleed,
                    TILE_UNIT + bleed * 2,
                    TILE_UNIT + bleed * 2
                );
            }
        }
    }

    destroy(): void {
        this.layer.destroy();
    }
}
