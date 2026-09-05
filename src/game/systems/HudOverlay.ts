import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import { pinToScreen, viewportOf } from '../core/screenSpace';
import { TEXT, fontPx, minimapCell, ui, uiScale } from '../core/uiScale';
import type { GameScene } from '../scenes/GameScene';

/**
 * Screen-space readouts for the pressure systems.
 *
 * The minimap is not a convenience here — it is the only way to see the thing
 * the game is about. From inside an alley the city closing in is invisible;
 * from above it is the whole picture. It also shows which cells are under
 * hazard tape right now, which is what makes the risk/reward on fish legible.
 *
 * Drawn in Phaser rather than React so it shares the scene's clock and pauses
 * with it.
 */
export class HudOverlay {
    private readonly scene: GameScene;

    /** Static layer: the grid. Redrawn only when the grid actually changes. */
    private readonly mapLayer: Phaser.GameObjects.Graphics;
    /** Live layer: actors and hazard tape. Redrawn every frame. */
    private readonly markerLayer: Phaser.GameObjects.Graphics;
    private readonly readout: Phaser.GameObjects.Text;
    private readonly rentBar: Phaser.GameObjects.Graphics;
    private readonly flash: Phaser.GameObjects.Rectangle;

    private mapDirty = true;
    private lastOpenCount = -1;
    private origin = { x: 0, y: 0 };
    private readoutOffset = { x: 0, y: 0 };
    private appliedScale = 0;

    /**
     * Screen rectangle the HUD occupies in the top-right corner.
     *
     * Published so world-space things that can drift under it — the speech
     * bubbles — can step aside instead of being buried by it.
     */
    private reserved = new Phaser.Geom.Rectangle(0, 0, 0, 0);

    constructor(scene: GameScene) {
        this.scene = scene;

        this.mapLayer = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.OVERLAY + 10);
        this.markerLayer = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.OVERLAY + 11);
        this.rentBar = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.OVERLAY + 11);

        this.readout = scene.add
            .text(0, 0, '', {
                fontFamily: "'Press Start 2P', monospace",
                fontSize: fontPx(9, scene.cameras.main, TEXT.HUD),
                color: GameConfig.HUD.TEXT_COLOR,
                align: 'right'
            })
            .setOrigin(1, 0)
            .setScrollFactor(0)
            .setDepth(DEPTH.OVERLAY + 12);

        // Full-screen wash used for the rent-day hit.
        this.flash = scene.add
            .rectangle(0, 0, 10, 10, GameConfig.HEALTH.RENT.FLASH_COLOR, 1)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(DEPTH.OVERLAY + 20)
            .setAlpha(0);

        this.layout();
    }

    /** Marks the minimap for a redraw; called when a tower changes the grid. */
    invalidateMap(): void {
        this.mapDirty = true;
    }

    /**
     * Anchors every layer to real screen pixels.
     *
     * Scroll-locked objects are still scaled by the camera zoom, so each layer
     * is pinned to a position and scale that cancel it out. Everything below
     * then works in plain screen coordinates regardless of zoom — which is why
     * this runs every frame, not only on a resize: the jump changes the zoom.
     */
    private layout(): void {
        const camera = this.scene.cameras?.main;
        if (!camera) return;

        const viewport = viewportOf(camera);
        pinToScreen(this.mapLayer, viewport);
        pinToScreen(this.markerLayer, viewport);
        pinToScreen(this.rentBar, viewport);
        pinToScreen(this.readout, viewport);
        pinToScreen(this.flash, viewport);

        const scale = uiScale(camera);
        if (scale !== this.appliedScale) {
            this.appliedScale = scale;
            this.readout.setFontSize(fontPx(9, camera, TEXT.HUD));
        }

        const cell = minimapCell(camera);
        const size = GameConfig.MAZE_SIZE * cell;
        const margin = ui(GameConfig.HUD.MARGIN, camera);

        this.origin = { x: viewport.width - margin - size, y: margin };
        this.readoutOffset = { x: viewport.width - margin, y: margin + size + ui(6, camera) };

        // The map, plus the readout and rent bar stacked under it.
        this.reserved.setTo(
            this.origin.x - margin,
            0,
            viewport.width - this.origin.x + margin,
            margin + size + ui(6, camera) + this.readout.height + ui(GameConfig.HUD.RESERVED_TAIL, camera)
        );
        this.flash.setSize(viewport.width, viewport.height);
        this.mapDirty = true;
    }

    private drawMap(): void {
        const maze = this.scene.maze;
        if (!maze) return;

        const cfg = GameConfig.HUD.MINIMAP;
        const cell = cfg.CELL;
        const size = GameConfig.MAZE_SIZE * cell;

        this.mapLayer.clear();
        this.mapLayer.fillStyle(cfg.BACKGROUND, cfg.ALPHA);
        this.mapLayer.fillRect(this.origin.x - 2, this.origin.y - 2, size + 4, size + 4);

        for (let gy = 0; gy < GameConfig.MAZE_SIZE; gy++) {
            for (let gx = 0; gx < GameConfig.MAZE_SIZE; gx++) {
                const built = this.scene.occluders.get(`${gx},${gy}`);
                const isTower = built?.texture.key.startsWith('apt');

                if (maze[gy][gx] === 0) {
                    this.mapLayer.fillStyle(cfg.OPEN, cfg.ALPHA);
                } else if (isTower) {
                    this.mapLayer.fillStyle(cfg.APARTMENT, cfg.ALPHA);
                } else {
                    this.mapLayer.fillStyle(cfg.WALL, cfg.ALPHA);
                }

                this.mapLayer.fillRect(this.origin.x + gx * cell, this.origin.y + gy * cell, cell, cell);
            }
        }

        this.mapDirty = false;
    }

    private drawMarkers(time: number): void {
        const cfg = GameConfig.HUD.MINIMAP;
        const cell = cfg.CELL;
        this.markerLayer.clear();

        const plot = (worldX: number, worldY: number, color: number, scale = 1) => {
            const unit = GameConfig.TILE_SIZE * GameConfig.SPACING;
            const gx = worldX / unit;
            const gy = worldY / unit;
            this.markerLayer.fillStyle(color, 1);
            this.markerLayer.fillRect(
                this.origin.x + gx * cell - cell * scale * 0.5,
                this.origin.y + gy * cell - cell * scale * 0.5,
                cell * scale,
                cell * scale
            );
        };

        // Hazard tape, pulsing in step with the world markers.
        const pending = this.scene.apartmentSystem?.pending;
        if (pending && pending.size > 0) {
            const pulse = 0.5 + 0.5 * Math.sin((time / GameConfig.APARTMENT.WARNING.PULSE_MS) * Math.PI * 2);
            this.markerLayer.fillStyle(cfg.WARNING, 0.35 + 0.5 * pulse);
            pending.forEach((c) => {
                this.markerLayer.fillRect(this.origin.x + c.gx * cell, this.origin.y + c.gy * cell, cell, cell);
            });
        }

        if (this.scene.goal) plot(this.scene.goal.x, this.scene.goal.y, cfg.GOAL, 2);
        if (this.scene.enemy?.active) plot(this.scene.enemy.x, this.scene.enemy.y, cfg.ENEMY, 2);
        if (this.scene.player?.active) plot(this.scene.player.x, this.scene.player.groundY, cfg.PLAYER, 2.4);
    }

    /** Time-to-rent bar under the minimap, turning amber as the deadline nears. */
    private drawRentBar(): void {
        const cell = minimapCell(this.scene.cameras.main);
        const width = GameConfig.MAZE_SIZE * cell;
        const y = this.readoutOffset.y + this.readout.height + ui(6, this.scene.cameras.main);
        const rent = GameConfig.HEALTH.RENT;

        const remaining = this.scene.msUntilRent();
        const ratio = Phaser.Math.Clamp(remaining / rent.INTERVAL, 0, 1);
        const imminent = remaining <= rent.WARN_MS;

        this.rentBar.clear();
        this.rentBar.fillStyle(0x11131a, 0.8);
        this.rentBar.fillRect(this.origin.x - 2, y - 2, width + 4, 8);
        this.rentBar.fillStyle(imminent ? 0xf0b429 : 0x5cbba6, 0.95);
        this.rentBar.fillRect(this.origin.x, y, width * ratio, 4);
    }

    /** Red wash when the rent lands. */
    playRentFlash(): void {
        const rent = GameConfig.HEALTH.RENT;
        this.flash.setAlpha(rent.FLASH_ALPHA);
        this.scene.tweens.add({
            targets: this.flash,
            alpha: 0,
            duration: rent.FLASH_MS,
            ease: 'Quad.easeOut'
        });
    }

    /** See `reserved`. Screen pixels, top-right corner. */
    get reservedScreenRect(): Phaser.Geom.Rectangle {
        return this.reserved;
    }

    update(time: number): void {
        const maze = this.scene.maze;
        if (!maze) return;

        this.layout();
        this.readout.setPosition(this.readoutOffset.x, this.readoutOffset.y);

        // Cheap dirty check: the grid only ever gains walls.
        const openCount = this.scene.apartmentSystem?.alleysRemaining ?? 1;
        if (openCount !== this.lastOpenCount) {
            this.lastOpenCount = openCount;
            this.mapDirty = true;
        }

        if (this.mapDirty) this.drawMap();
        this.drawMarkers(time);
        this.drawRentBar();

        const alleys = Math.round((this.scene.apartmentSystem?.alleysRemaining ?? 1) * 100);
        const districts = this.scene.mode.districts;
        const label =
            districts > 1
                ? `구역 ${this.scene.district}/${districts}   남은 골목 ${alleys}%`
                : `남은 골목 ${alleys}%`;
        this.readout.setText(label);
        this.readout.setColor(alleys <= 35 ? GameConfig.HUD.WARN_COLOR : GameConfig.HUD.TEXT_COLOR);
    }

    destroy(): void {
        this.mapLayer.destroy();
        this.markerLayer.destroy();
        this.rentBar.destroy();
        this.readout.destroy();
        this.flash.destroy();
    }
}
