import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { currentDifficulty, difficultyOf } from '../core/difficulty';
import { getSettings } from '../../settings';
import { setFootBody } from '../core/bodies';
import { DEPTH, sortDepth } from '../core/depth';
import { cellOf, isOpen, worldOf } from '../core/grid';
import type { GameScene } from '../scenes/GameScene';

/**
 * The machine only ever does two things: announce itself, then come for you.
 *
 * An earlier version patrolled, lost track of the player and searched. It was
 * more sophisticated and much worse to play against — it wandered off, and the
 * pressure it was supposed to apply came and went at random. Relentless and
 * predictable beats clever and erratic: the player can plan around a thing that
 * is always coming.
 */
export type EnemyAwareness = 'telegraph' | 'chase';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
    public isJumping = false;
    public enemySound?: Phaser.Sound.BaseSound;

    /** Ground position, which differs from `y` while the jump arc is playing. */
    public groundY: number;

    public awareness: EnemyAwareness = 'chase';

    private readonly player: Phaser.Physics.Arcade.Sprite;
    private shadow!: Phaser.GameObjects.Ellipse;
    private cone!: Phaser.GameObjects.Graphics;

    /** Direction the headlight points; eased so it does not snap around. */
    private facing = 0;
    private jumpReadyAt = 0;
    private telegraphUntil = 0;
    /** Knocked off its feet by a tower landing; not pursuing this beat. */
    private staggerUntil = 0;

    public scene: GameScene;

    constructor(
        scene: GameScene,
        player: Phaser.Physics.Arcade.Sprite,
        worldWidth: number,
        worldHeight: number,
        maze: number[][]
    ) {
        const spawn = Enemy.findSpawnPoint(player, worldWidth, worldHeight, maze);
        super(scene, spawn.x, spawn.y, 'enemy1');

        this.scene = scene;
        this.player = player;
        this.groundY = spawn.y;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.initProperties();
        this.createAnimations();
    }

    private get maze(): number[][] | undefined {
        return this.scene.maze;
    }

    /** Picks an open tile far enough from the player. Static so it can run before super(). */
    private static findSpawnPoint(
        player: Phaser.Physics.Arcade.Sprite,
        worldWidth: number,
        worldHeight: number,
        maze: number[][]
    ): { x: number; y: number } {
        const { MIN_DISTANCE, MAX_ATTEMPTS } = GameConfig.ENEMY.SPAWN;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const x = Phaser.Math.Between(0, worldWidth);
            const y = Phaser.Math.Between(0, worldHeight);
            const { gx, gy } = cellOf(x, y);

            if (!isOpen(maze, gx, gy)) continue;
            if (Phaser.Math.Distance.Between(x, y, player.x, player.y) >= MIN_DISTANCE) {
                return worldOf({ gx, gy });
            }
        }

        console.warn(`[Enemy] ${MAX_ATTEMPTS}회 시도 후에도 스폰 위치를 찾지 못해 모서리로 대체합니다.`);
        return { x: worldWidth - 100, y: worldHeight - 100 };
    }

    createAnimations() {
        if (!this.scene.anims.exists('enemyWalk')) {
            this.scene.anims.create({
                key: 'enemyWalk',
                frames: [{ key: 'enemy1' }, { key: 'enemy2' }],
                frameRate: 4,
                repeat: -1
            });
        }
        this.play('enemyWalk', true);
    }

    initProperties() {
        // Feet at `y` — see the note in Player. Matters most here: this sprite
        // is 150px tall, so a centred origin put its foot box a full cell below
        // the cell it looked like it occupied.
        this.setOrigin(0.5, 1);
        this.setScale(GameConfig.ENEMY.SCALE);

        this.shadow = this.scene.add.ellipse(
            this.x,
            this.y,
            GameConfig.SHADOW.ENEMY.WIDTH,
            GameConfig.SHADOW.ENEMY.HEIGHT,
            GameConfig.SHADOW.COLOR,
            GameConfig.SHADOW.ALPHA
        );
        this.shadow.setDepth(DEPTH.GROUND);

        // Under the actors but over the ground, so the beam reads as light on
        // the road rather than a shape floating above the city.
        this.cone = this.scene.add.graphics();
        this.cone.setDepth(DEPTH.GROUND + 2);

        setFootBody(this, {
            width: GameConfig.HITBOX.ENEMY.WIDTH,
            height: GameConfig.HITBOX.ENEMY.HEIGHT,
            footInset: GameConfig.HITBOX.ENEMY.FOOT_INSET
        });

        this.syncGroundVisuals();
    }

    /** Sorts by the feet and keeps the shadow on the ground, as the player does. */
    syncGroundVisuals(heightOffGround = 0): void {
        const feetY = this.groundY + this.displayHeight * (1 - this.originY);
        this.setDepth(sortDepth(feetY));

        this.shadow.setPosition(this.x, feetY);

        const lift = Phaser.Math.Clamp(heightOffGround / GameConfig.ENEMY.JUMP.HEIGHT, 0, 1);
        this.shadow.setScale(1 - lift * 0.45);
        this.shadow.setAlpha(GameConfig.SHADOW.ALPHA * (1 - lift * 0.55));
    }

    /** Thrown away from a point — a tower landing beside it, usually. */
    knockback(fromX: number, fromY: number, speed: number, durationMs: number): void {
        if (speed <= 0 || this.isJumping) return;

        this.staggerUntil = this.scene.time.now + durationMs;

        const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.groundY);
        this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    }

    /** Teleported clear of somewhere it must not be. */
    placeAt(x: number, y: number): void {
        this.setPosition(x, y);
        this.groundY = y;
        this.body?.reset(x, y);
        this.setVelocity(0, 0);
        this.syncGroundVisuals();
    }

    /** Holds still for a beat, so its arrival registers before it moves. */
    announce(): void {
        this.awareness = 'telegraph';
        this.telegraphUntil = this.scene.time.now + GameConfig.ENEMY.TELEGRAPH.DURATION_MS;
        this.setVelocity(0, 0);
        this.scene.soundManager?.playEnemyAlert();
    }

    // ------------------------------------------------------------------ update

    update(): void {
        if (!this.active || this.isJumping) return;

        const now = this.scene.time.now;

        if (this.awareness === 'telegraph') {
            this.setVelocity(0, 0);
            if (now >= this.telegraphUntil) this.awareness = 'chase';
        } else if (now >= this.staggerUntil) {
            // While staggered the knockback owns velocity; pursuing would
            // overwrite it on the very next frame and the shove would not read.
            this.pursue();
        }

        this.groundY = this.y;
        this.syncGroundVisuals();
        this.drawCone(now);
    }

    /**
     * Straight at the player, over a wall only when a wall is in the way.
     *
     * The jump used to fire on a timer and whenever it felt stuck, which read
     * as the thing hopping about at random. Now it is the single, legible
     * answer to one specific problem: the direct path is blocked.
     */
    private pursue(): void {
        const target = { x: this.player.x, y: this.player.y };
        const angle = Phaser.Math.Angle.Between(this.x, this.groundY, target.x, target.y);

        const look = cellOf(
            this.x + Math.cos(angle) * GameConfig.ENEMY.LOOK_AHEAD_DIST,
            this.groundY + Math.sin(angle) * GameConfig.ENEMY.LOOK_AHEAD_DIST
        );

        if (!isOpen(this.maze, look.gx, look.gy) && this.tryJumpToward(target.x, target.y)) {
            return;
        }

        this.steerTo(target, GameConfig.ENEMY.SPEED * currentDifficulty().enemySpeedScale);
    }

    private steerTo(target: { x: number; y: number }, speed: number): void {
        const angle = Phaser.Math.Angle.Between(this.x, this.groundY, target.x, target.y);

        this.facing = Phaser.Math.Angle.RotateTo(this.facing, angle, 0.12);
        this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

        if (Math.cos(angle) < 0) this.setFlipX(true);
        else if (Math.cos(angle) > 0) this.setFlipX(false);
    }

    /** Headlight. Purely directional now — it shows where the thing is heading. */
    private drawCone(now: number): void {
        const vision = GameConfig.ENEMY.VISION;
        const alert = true;

        // During the telegraph the beam flashes, which is the warning itself.
        const flash = this.awareness === 'telegraph' ? 0.5 + 0.5 * Math.sin(now / 60) : 1;
        const alpha = (alert ? vision.CONE_ALPHA_ALERT : vision.CONE_ALPHA_CALM) * flash;
        const color = alert ? vision.CONE_COLOR_ALERT : vision.CONE_COLOR;

        const half = Phaser.Math.DegToRad(vision.HALF_ANGLE_DEG);

        this.cone.clear();
        this.cone.fillStyle(color, alpha);
        const reach = vision.RANGE * currentDifficulty().enemyVisionScale;
        this.cone.slice(this.x, this.groundY, reach, this.facing - half, this.facing + half, false);
        this.cone.fillPath();
    }

    // -------------------------------------------------------------------- jump

    /**
     * Hops two cells toward a point, if that lands somewhere open and the
     * cooldown has expired. Returns false when the hop is refused.
     */
    tryJumpToward(targetX: number, targetY: number): boolean {
        const now = this.scene.time.now;
        if (this.isJumping || now < this.jumpReadyAt) return false;

        const cfg = GameConfig.ENEMY.JUMP;
        const angle = Phaser.Math.Angle.Between(this.x, this.groundY, targetX, targetY);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const dx = Math.abs(cos) > cfg.DIRECTION_THRESHOLD ? Math.sign(cos) : 0;
        const dy = Math.abs(sin) > cfg.DIRECTION_THRESHOLD ? Math.sign(sin) : 0;
        if (dx === 0 && dy === 0) return false;

        const here = cellOf(this.x, this.groundY);
        const landing = { gx: here.gx + dx * cfg.CELLS, gy: here.gy + dy * cfg.CELLS };
        if (!isOpen(this.maze, landing.gx, landing.gy)) return false;

        this.performJump(worldOf(landing));
        return true;
    }

    private performJump(landing: { x: number; y: number }) {
        if (this.isJumping) return;

        this.isJumping = true;
        this.setVelocity(0, 0);

        const { HEIGHT: jumpHeight, DURATION: jumpDuration } = GameConfig.ENEMY.JUMP;

        // Only the vertical path is interpolated by hand; the tween drives x.
        const startY = this.groundY;
        const endX = landing.x;
        const endY = landing.y;

        this.scene.tweens.add({
            targets: this,
            x: endX,
            duration: jumpDuration,
            ease: 'Linear',
            onUpdate: (tween: Phaser.Tweens.Tween) => {
                const heightOffGround = Math.sin(tween.progress * Math.PI) * jumpHeight;
                this.groundY = Phaser.Math.Linear(startY, endY, tween.progress);
                this.y = this.groundY - heightOffGround;
                this.syncGroundVisuals(heightOffGround);
            },
            onComplete: () => {
                this.isJumping = false;
                this.x = endX;
                this.groundY = endY;
                this.y = endY;
                this.jumpReadyAt =
                    this.scene.time.now +
                    GameConfig.ENEMY.JUMP.COOLDOWN_MS * difficultyOf(getSettings().difficulty).enemyJumpScale;
                this.syncGroundVisuals();
                this.play('enemyWalk', true);
            }
        });
    }

    destroy(fromScene?: boolean) {
        this.shadow?.destroy();
        this.cone?.destroy();
        super.destroy(fromScene);
    }
}
