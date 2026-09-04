import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import type { GameScene } from '../scenes/GameScene';

type AnyBody = Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody;

const DEPTH = 1_000_000;
const PANEL_DEPTH = DEPTH + 1;

/** World size of a collision body, in the same units the sprite is drawn at. */
const describeBody = (body?: AnyBody | null): string => {
    if (!body) return 'body 없음';
    if (body.isCircle) return `⌀${body.width.toFixed(1)}`;
    return `${body.width.toFixed(1)}×${body.height.toFixed(1)}`;
};

/**
 * Body area as a share of the drawn sprite's area.
 *
 * This is the number Phase 1 has to fix: a sprite whose body covers 0.6% of what
 * the player sees is the reason the cat sinks into buildings.
 */
const coverageRatio = (sprite: Phaser.GameObjects.Sprite, body?: AnyBody | null): string => {
    if (!body) return '—';
    const drawn = Math.abs(sprite.displayWidth * sprite.displayHeight);
    if (drawn === 0) return '—';
    return `${((body.width * body.height) / drawn * 100).toFixed(1)}%`;
};

const bodyOf = (obj: unknown): AnyBody | null => {
    const body = (obj as { body?: unknown } | null)?.body;
    return (body as AnyBody) ?? null;
};

/**
 * On-screen instrumentation for `?debug=1`.
 *
 * Draws the maze grid, marks each actor's body centre against its sprite centre,
 * and prints the depth / body numbers that the redesign plan calls out. Arcade's
 * own body outlines are enabled separately through the physics config.
 */
export class DebugOverlay {
    private readonly scene: GameScene;
    private readonly grid: Phaser.GameObjects.Graphics;
    private readonly marks: Phaser.GameObjects.Graphics;
    private readonly panel: Phaser.GameObjects.Text;
    private gridDrawn = false;

    constructor(scene: GameScene) {
        this.scene = scene;

        this.grid = scene.add.graphics().setDepth(DEPTH);
        this.marks = scene.add.graphics().setDepth(DEPTH);

        this.panel = scene.add
            .text(8, 8, '', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#00ff88',
                backgroundColor: 'rgba(0,0,0,0.72)',
                padding: { x: 8, y: 6 },
                lineSpacing: 2
            })
            .setScrollFactor(0)
            .setDepth(PANEL_DEPTH);
    }

    /** Grid never moves, so it is drawn once on the first update. */
    private drawGrid(): void {
        const maze = this.scene.maze;
        if (!maze) return;

        const unit = GameConfig.TILE_SIZE * GameConfig.SPACING;
        const span = GameConfig.MAZE_SIZE * unit;

        this.grid.lineStyle(1, 0x3399ff, 0.16);
        for (let i = 0; i <= GameConfig.MAZE_SIZE; i++) {
            const at = i * unit - unit / 2;
            this.grid.lineBetween(at, -unit / 2, at, span - unit / 2);
            this.grid.lineBetween(-unit / 2, at, span - unit / 2, at);
        }
        this.grid.strokePath();
        this.gridDrawn = true;
    }

    /** Cross at the sprite origin, dot at the body centre — the gap is the offset bug. */
    private markActor(sprite: Phaser.GameObjects.Sprite | null | undefined, color: number): void {
        if (!sprite || !sprite.active) return;

        this.marks.lineStyle(1, color, 0.9);
        this.marks.lineBetween(sprite.x - 8, sprite.y, sprite.x + 8, sprite.y);
        this.marks.lineBetween(sprite.x, sprite.y - 8, sprite.x, sprite.y + 8);

        const body = bodyOf(sprite);
        if (!body) return;

        this.marks.fillStyle(color, 0.9);
        this.marks.fillCircle(body.center.x, body.center.y, 3);

        // A visible line here means the body is not where the sprite is drawn.
        if (Phaser.Math.Distance.Between(sprite.x, sprite.y, body.center.x, body.center.y) > 1) {
            this.marks.lineStyle(1, 0xff3355, 0.9);
            this.marks.lineBetween(sprite.x, sprite.y, body.center.x, body.center.y);
        }
    }

    private describeActor(label: string, sprite: Phaser.GameObjects.Sprite | null | undefined): string {
        if (!sprite || !sprite.active) return `${label.padEnd(7)} —`;
        const body = bodyOf(sprite);
        return (
            `${label.padEnd(7)} depth=${sprite.depth.toFixed(0).padStart(6)}` +
            `  body=${describeBody(body).padEnd(13)}` +
            `  sprite=${sprite.displayWidth.toFixed(0)}×${sprite.displayHeight.toFixed(0)}` +
            `  덮개=${coverageRatio(sprite, body)}`
        );
    }

    update(): void {
        if (!this.gridDrawn) this.drawGrid();

        this.marks.clear();
        this.markActor(this.scene.player, 0x00ff88);
        this.markActor(this.scene.enemy, 0xff8800);
        this.markActor(this.scene.goal, 0xffff00);

        const wallCount = this.scene.walls ? this.scene.walls.getLength() : 0;

        this.panel.setText([
            `DEBUG  phase=${this.scene.state.current}  fps=${this.scene.game.loop.actualFps.toFixed(0)}`,
            `health ${this.scene.health}/${GameConfig.HEALTH.MAX}` +
                `   milk=${this.scene.registry.get('milkCount') ?? 0}` +
                `   fish=${this.scene.registry.get('fishCount') ?? 0}` +
                `   jump=${this.scene.player?.jumpCount ?? 0}`,
            this.describeActor('player', this.scene.player),
            this.describeActor('enemy', this.scene.enemy),
            this.describeActor('goal', this.scene.goal),
            `walls   ${wallCount}   zoom=${this.scene.cameras.main.zoom.toFixed(2)}`
        ]);
    }

    destroy(): void {
        this.grid.destroy();
        this.marks.destroy();
        this.panel.destroy();
    }
}
