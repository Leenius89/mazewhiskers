import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { setFootBody } from '../core/bodies';
import { DEPTH, sortDepth } from '../core/depth';
import type { GameScene } from '../scenes/GameScene';

export class Player extends Phaser.Physics.Arcade.Sprite {
    public jumpCount = GameConfig.PLAYER.JUMP.START_STOCK;
    public isJumping = false;
    public lastDirection: 'left' | 'right' = 'right';

    /**
     * Where the cat is standing, as opposed to where it is drawn.
     *
     * During a jump the sprite rises off the ground, but the shadow, the depth
     * sort and the landing test all have to follow the ground path.
     */
    public groundY: number;

    private readonly speed: number = GameConfig.PLAYER.SPEED;
    private readonly goalIndicator: Phaser.GameObjects.Graphics;
    private readonly landingPreview: Phaser.GameObjects.Graphics;
    private readonly shadow: Phaser.GameObjects.Ellipse;

    /** Facing used when a jump is taken with no direction held. */
    private readonly facing = new Phaser.Math.Vector2(1, 0);
    /** Brief freeze after touching down, so a landing has weight. */
    private recoveryUntil = 0;
    /**
     * Dash after-images still fading.
     *
     * Tracked so they can be removed outright: they clear themselves through a
     * tween, and the scene is paused the instant the run ends — a dash into a
     * death left one frozen mid-fade.
     */
    private readonly dashGhosts: Phaser.GameObjects.Image[] = [];

    /** Base scale, so procedural squash always modulates a known value. */
    private readonly baseScale = GameConfig.PLAYER.SCALE;
    /** Eased lean, in degrees. */
    private lean = 0;
    /** Set on touchdown; decays over LAND_RECOVER_MS. */
    private landedAt = -Infinity;

    /** Untouchable window after a hit, and during a dash. */
    private invulnerableUntil = 0;
    private dashUntil = 0;
    private dashReadyAt = 0;
    private readonly dashDirection = new Phaser.Math.Vector2(1, 0);

    public scene: GameScene;

    constructor(scene: GameScene, x: number, y: number) {
        super(scene, x, y, 'cat1');
        this.scene = scene;
        this.groundY = y;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Feet at `y`, like the towers.
        //
        // With a centred origin the collision box sits half a sprite below the
        // cell the sprite appears to be in — for the 150px enemy that is almost
        // a whole cell, which made it collide with walls it was nowhere near.
        // Anchoring to the feet makes position, depth, collision and grid cell
        // all mean the same thing.
        this.setOrigin(0.5, 1);
        this.setScale(GameConfig.PLAYER.SCALE);

        this.shadow = scene.add.ellipse(
            x,
            y,
            GameConfig.SHADOW.PLAYER.WIDTH,
            GameConfig.SHADOW.PLAYER.HEIGHT,
            GameConfig.SHADOW.COLOR,
            GameConfig.SHADOW.ALPHA
        );
        this.shadow.setDepth(DEPTH.GROUND);

        this.landingPreview = scene.add.graphics();
        this.landingPreview.setDepth(DEPTH.GROUND + 1);

        this.goalIndicator = scene.add.graphics();
        this.goalIndicator.setDepth(DEPTH.OVERLAY);

        this.setCollideWorldBounds(true);
        setFootBody(this, {
            width: GameConfig.HITBOX.PLAYER.WIDTH,
            height: GameConfig.HITBOX.PLAYER.HEIGHT,
            footInset: GameConfig.HITBOX.PLAYER.FOOT_INSET
        });

        this.createAnimations();
        this.syncGroundVisuals();
    }

    createAnimations() {
        if (!this.scene.anims.exists('walk')) {
            this.scene.anims.create({
                key: 'walk',
                frames: [{ key: 'cat1' }, { key: 'cat2' }],
                frameRate: 8,
                repeat: -1
            });
        }

        if (!this.scene.anims.exists('idle')) {
            this.scene.anims.create({
                key: 'idle',
                frames: [{ key: 'cat1' }],
                frameRate: -1
            });
        }
    }

    /**
     * Runs every frame, including mid-jump.
     *
     * The scene used to skip this entirely while jumping, which froze the goal
     * arrow and the depth sort for the whole arc.
     */
    update(moveDirection: Phaser.Math.Vector2, jumpHeld: boolean): void {
        this.updateGoalIndicator();
        this.updateLandingPreview(moveDirection, jumpHeld);
        this.updateInvulnerabilityBlink();

        if (this.isJumping) return;

        if (this.isDashing) {
            // The dash drives velocity itself so walls still stop it.
            this.setVelocity(
                this.dashDirection.x * GameConfig.PLAYER.DASH.SPEED,
                this.dashDirection.y * GameConfig.PLAYER.DASH.SPEED
            );
        } else {
            this.handleMovement(moveDirection);
        }

        this.groundY = this.y;
        this.syncGroundVisuals();
        this.updateProceduralMotion();
    }

    /**
     * Life the two-frame sprite sheet cannot provide on its own.
     *
     * Squash and stretch on the step cycle, a slow breath when still, and a lean
     * into the direction of travel. The scale change is small enough that the
     * foot box it drives varies by under a pixel.
     */
    private updateProceduralMotion(): void {
        const cfg = GameConfig.PROCEDURAL_MOTION;
        const now = this.scene.time.now;
        const speed = this.body ? this.body.velocity.length() : 0;
        const moving = speed > 8;

        let squash: number;
        if (this.isJumping) {
            // Stretched along the arc, which reads as leaving the ground.
            squash = -cfg.WALK_SQUASH * 1.4;
        } else if (moving) {
            squash = Math.sin((now / 1000) * cfg.WALK_HZ * Math.PI * 2) * cfg.WALK_SQUASH;
        } else {
            squash = Math.sin((now / 1000) * cfg.BREATH_HZ * Math.PI * 2) * cfg.BREATH_SQUASH;
        }

        // A landing overrides the cycle with a hard compression that decays.
        const sinceLanding = now - this.landedAt;
        if (sinceLanding < cfg.LAND_RECOVER_MS) {
            const remaining = 1 - sinceLanding / cfg.LAND_RECOVER_MS;
            squash = cfg.LAND_SQUASH * remaining * remaining;
        }

        this.setScale(this.baseScale * (1 + squash * 0.6), this.baseScale * (1 - squash));

        const targetLean = this.isJumping || !moving ? 0 : Phaser.Math.Clamp(this.body!.velocity.x / this.speed, -1, 1) * cfg.LEAN_DEG;
        this.lean = Phaser.Math.Linear(this.lean, this.flipX ? -targetLean : targetLean, cfg.LEAN_EASE);
        this.setAngle(this.lean);
    }

    get isDashing(): boolean {
        return this.scene.time.now < this.dashUntil;
    }

    get isInvulnerable(): boolean {
        return this.scene.time.now < this.invulnerableUntil;
    }

    /** Blink while untouchable, so the state is never a mystery. */
    private updateInvulnerabilityBlink(): void {
        if (!this.isInvulnerable) {
            this.setAlpha(1);
            return;
        }

        const period = GameConfig.PLAYER.INVULNERABLE_BLINK_MS;
        this.setAlpha(Math.floor(this.scene.time.now / period) % 2 === 0 ? 1 : 0.35);
    }

    /**
     * Dash: a short burst with a few frames of immunity.
     *
     * Free to use but on a cooldown, so it rewards reading the enemy's
     * telegraph rather than hoarding a resource.
     */
    tryDash(moveDirection: Phaser.Math.Vector2): boolean {
        if (!this.scene.mode.dashEnabled) return false;

        const now = this.scene.time.now;
        if (this.isJumping || this.isDashing || now < this.dashReadyAt) return false;

        const dash = GameConfig.PLAYER.DASH;
        const source = moveDirection.lengthSq() > 0 ? moveDirection : this.facing;
        this.dashDirection.copy(source).normalize();
        this.facing.copy(this.dashDirection);

        this.dashUntil = now + dash.DURATION_MS;
        this.dashReadyAt = now + dash.COOLDOWN_MS;
        this.invulnerableUntil = Math.max(this.invulnerableUntil, now + dash.INVULNERABLE_MS);

        if (this.dashDirection.x < 0) this.setFlipX(true);
        else if (this.dashDirection.x > 0) this.setFlipX(false);

        this.spawnDashTrail();
        return true;
    }

    /** Fading copies left behind, so the burst is visible at speed. */
    private spawnDashTrail(): void {
        const dash = GameConfig.PLAYER.DASH;
        const steps = 3;

        for (let i = 0; i < steps; i++) {
            this.scene.time.delayedCall((dash.DURATION_MS / steps) * i, () => {
                if (!this.active) return;
                const ghost = this.scene.add.image(this.x, this.y, this.texture.key);
                this.dashGhosts.push(ghost);
                ghost.setOrigin(this.originX, this.originY);
                ghost.setScale(this.scaleX, this.scaleY);
                ghost.setFlipX(this.flipX);
                ghost.setDepth(this.depth - 1);
                ghost.setAlpha(dash.TRAIL_ALPHA);
                ghost.setTint(0x9fd8ff);

                this.scene.tweens.add({
                    targets: ghost,
                    alpha: 0,
                    duration: 220,
                    onComplete: () => this.clearGhost(ghost)
                });
            });
        }
    }

    private clearGhost(ghost: Phaser.GameObjects.Image): void {
        const index = this.dashGhosts.indexOf(ghost);
        if (index >= 0) this.dashGhosts.splice(index, 1);
        ghost.destroy();
    }

    /**
     * Knocked back by the machine rather than killed by it.
     *
     * Returns false when the hit did not land, so the caller does not spend
     * health or sound on an already-immune player.
     */
    takeHit(fromX: number, fromY: number): boolean {
        if (this.isInvulnerable) return false;

        const contact = GameConfig.ENEMY.CONTACT;
        this.invulnerableUntil = this.scene.time.now + contact.INVULNERABLE_MS;
        this.recoveryUntil = this.scene.time.now + GameConfig.APARTMENT.PUSH.DURATION;
        this.dashUntil = 0;

        this.knockback(fromX, fromY, contact.KNOCKBACK, contact.KNOCKBACK_MS);
        return true;
    }

    /**
     * Thrown away from a point, without the damage a hit carries.
     *
     * `handleMovement` yields to `recoveryUntil`, so the shove plays out
     * instead of being cancelled by whichever key is held down.
     */
    knockback(fromX: number, fromY: number, speed: number, durationMs: number): void {
        if (speed <= 0) return;

        this.recoveryUntil = Math.max(this.recoveryUntil, this.scene.time.now + durationMs);

        const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.groundY);
        this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    }

    private handleMovement(moveDirection: Phaser.Math.Vector2): void {
        // Knockback owns velocity for its duration; do not fight it.
        if (this.scene.time.now < this.recoveryUntil) return;

        const moving = moveDirection.lengthSq() > 0;

        if (moving) {
            this.setVelocity(moveDirection.x * this.speed, moveDirection.y * this.speed);
            this.facing.copy(moveDirection).normalize();
            this.anims.play('walk', true);

            if (moveDirection.x < 0) {
                this.setFlipX(true);
                this.lastDirection = 'left';
            } else if (moveDirection.x > 0) {
                this.setFlipX(false);
                this.lastDirection = 'right';
            }
        } else {
            this.setVelocity(0);
            this.anims.stop();
            this.setTexture('cat1');
        }
    }

    /** Sorts by the feet and keeps the shadow on the ground under them. */
    syncGroundVisuals(heightOffGround = 0): void {
        const feetY = this.groundY + this.displayHeight * (1 - this.originY);
        this.setDepth(sortDepth(feetY));

        this.shadow.setPosition(this.x, feetY);

        // Shrinking and fading the shadow is what actually reads as height here.
        const lift = Phaser.Math.Clamp(heightOffGround / GameConfig.PLAYER.JUMP.HEIGHT, 0, 1);
        this.shadow.setScale(1 - lift * 0.45);
        this.shadow.setAlpha(GameConfig.SHADOW.ALPHA * (1 - lift * 0.55));
    }

    // ------------------------------------------------------------------ jump

    /**
     * The eight-way direction a jump would take, quantised to whole cells.
     *
     * Each axis is independently pushed to -1, 0 or 1, so a stick held at any
     * angle resolves to one of the eight the grid can actually express.
     */
    private jumpDirection(moveDirection: Phaser.Math.Vector2): Phaser.Math.Vector2 {
        const source = moveDirection.lengthSq() > 0 ? moveDirection : this.facing;
        const threshold = GameConfig.PLAYER.JUMP.DIRECTION_THRESHOLD;

        const x = Math.abs(source.x) > threshold ? Math.sign(source.x) : 0;
        const y = Math.abs(source.y) > threshold ? Math.sign(source.y) : 0;

        if (x === 0 && y === 0) return new Phaser.Math.Vector2(Math.sign(this.facing.x) || 1, 0);
        return new Phaser.Math.Vector2(x, y);
    }

    private get tileUnit(): number {
        return GameConfig.TILE_SIZE * GameConfig.SPACING;
    }

    /** Grid cell a jump in `direction` would land on. */
    private landingCellFor(direction: Phaser.Math.Vector2): { gx: number; gy: number } {
        const cells = GameConfig.PLAYER.JUMP.CELLS;
        return {
            gx: Math.round(this.x / this.tileUnit) + direction.x * cells,
            gy: Math.round(this.groundY / this.tileUnit) + direction.y * cells
        };
    }

    /** Centre of that cell, in world pixels. Landing always re-centres the cat. */
    private landingPointFor(direction: Phaser.Math.Vector2): Phaser.Math.Vector2 {
        const cell = this.landingCellFor(direction);
        return new Phaser.Math.Vector2(cell.gx * this.tileUnit, cell.gy * this.tileUnit);
    }

    /** A landing spot must be inside the world and on an open grid cell. */
    private canLandAt(direction: Phaser.Math.Vector2): boolean {
        const maze = this.scene.maze;
        if (!maze) return true;

        const { gx, gy } = this.landingCellFor(direction);
        return maze[gy] !== undefined && maze[gy][gx] === 0;
    }

    /**
     * Ring on the ground showing where a jump would put you, green when it is
     * clear and red when it is not — so milk is never spent on a wall.
     */
    private updateLandingPreview(moveDirection: Phaser.Math.Vector2, jumpHeld: boolean): void {
        this.landingPreview.clear();

        if (!jumpHeld || this.isJumping || this.jumpCount <= 0) return;

        const cfg = GameConfig.PLAYER.LANDING_PREVIEW;
        const direction = this.jumpDirection(moveDirection);
        const target = this.landingPointFor(direction);
        const valid = this.canLandAt(direction);
        const color = valid ? cfg.VALID_COLOR : cfg.BLOCKED_COLOR;

        this.landingPreview.lineStyle(cfg.THICKNESS, color, 0.95);
        this.landingPreview.strokeEllipse(target.x, target.y, cfg.RADIUS * 2, cfg.RADIUS);
        this.landingPreview.fillStyle(color, 0.18);
        this.landingPreview.fillEllipse(target.x, target.y, cfg.RADIUS * 2, cfg.RADIUS);

        if (valid) return;

        // A cross reads as "not here" faster than colour alone.
        const arm = cfg.RADIUS * 0.6;
        this.landingPreview.lineStyle(cfg.THICKNESS, color, 0.95);
        this.landingPreview.lineBetween(target.x - arm, target.y - arm / 2, target.x + arm, target.y + arm / 2);
        this.landingPreview.lineBetween(target.x - arm, target.y + arm / 2, target.x + arm, target.y - arm / 2);
    }

    /**
     * Shoved out of a cell that is about to be built on.
     *
     * Being moved rather than killed is the whole argument of the game, so it
     * is a visible, physical event: control is taken away for the duration and
     * the cat is put down somewhere it did not choose.
     */
    shoveTo(x: number, y: number): void {
        const duration = GameConfig.APARTMENT.PUSH.DURATION;

        this.recoveryUntil = this.scene.time.now + duration;
        this.setVelocity(0);

        this.scene.tweens.add({
            targets: this,
            x,
            y,
            duration,
            ease: 'Back.easeOut',
            onUpdate: () => {
                this.groundY = this.y;
                this.syncGroundVisuals();
            },
            onComplete: () => {
                this.groundY = this.y;
                this.syncGroundVisuals();
            }
        });
    }

    /**
     * Hands the sprite over to the death animation and stops fighting it.
     *
     * Everything that writes to this sprite has to stop first. The physics
     * body is the important one: Arcade writes the body's position back onto
     * the sprite every step, and the wall colliders separate it out of
     * whatever the animation moves it into — which is why the cat used to
     * rise, turn over, and then simply stand up again in one piece.
     */
    beginDeath(): void {
        this.setVelocity(0, 0);
        if (this.body) (this.body as Phaser.Physics.Arcade.Body).enable = false;

        this.anims.stop();
        this.setTexture('cat1');
        this.clearTint();
        this.setAlpha(1);
        this.setScale(this.baseScale);

        // Ground furniture is drawn from a position the cat is about to leave.
        this.shadow.setVisible(false);
        this.goalIndicator.setVisible(false);
        this.landingPreview.setVisible(false);

        // Any after-image still fading would be frozen by the scene pause that
        // ends the run, leaving a second, translucent cat behind.
        this.scene.tweens.killTweensOf(this.dashGhosts);
        [...this.dashGhosts].forEach((ghost) => this.clearGhost(ghost));
    }

    /** Solid white for a beat. The single clearest way to sell a hit. */
    flashHit(): void {
        this.setTintFill(0xffffff);
        this.scene.time.delayedCall(GameConfig.HIT.FLASH_MS, () => {
            if (this.active) this.clearTint();
        });
    }

    /** True while a shove or a hit still owns the cat's movement. */
    get isRecovering(): boolean {
        return this.scene.time.now < this.recoveryUntil;
    }

    /** Called by the scene when the buffered jump input is consumed. */
    tryJump(moveDirection: Phaser.Math.Vector2): boolean {
        if (this.isJumping || this.jumpCount <= 0) return false;

        const direction = this.jumpDirection(moveDirection);

        // Refusing the jump costs nothing; taking it would cost a milk and land
        // the cat in a wall.
        if (!this.canLandAt(direction)) return false;

        return this.performJump(direction, this.landingPointFor(direction));
    }

    private performJump(direction: Phaser.Math.Vector2, target: Phaser.Math.Vector2): boolean {
        this.jumpCount--;
        this.scene.bus.emit('jumpCountChanged', this.jumpCount);
        this.scene.registerJumpUsed();
        this.scene.soundManager?.playJumpSound();

        this.isJumping = true;
        this.setVelocity(0, 0);

        if (direction.x < 0) {
            this.setFlipX(true);
            this.lastDirection = 'left';
        } else if (direction.x > 0) {
            this.setFlipX(false);
            this.lastDirection = 'right';
        }
        this.facing.copy(direction);

        const jumpHeight = GameConfig.PLAYER.JUMP.HEIGHT;
        const from = new Phaser.Math.Vector2(this.x, this.groundY);

        // A diagonal covers more ground, so it stays in the air longer. Reach
        // and exposure scale together instead of the diagonal being free value.
        const straightReach = GameConfig.PLAYER.JUMP.CELLS * this.tileUnit;
        const duration = Math.round(
            GameConfig.PLAYER.JUMP.DURATION * (from.distance(target) / straightReach)
        );

        this.scene.cameraDirector?.punchOutForJump(duration);

        // A plain progress object, so both axes move from one source of truth.
        const arc = { t: 0 };
        this.scene.tweens.add({
            targets: arc,
            t: 1,
            duration,
            ease: 'Linear',
            onUpdate: () => {
                const heightOffGround = Math.sin(arc.t * Math.PI) * jumpHeight;
                this.x = Phaser.Math.Linear(from.x, target.x, arc.t);
                this.groundY = Phaser.Math.Linear(from.y, target.y, arc.t);
                this.y = this.groundY - heightOffGround;
                this.syncGroundVisuals(heightOffGround);
            },
            onComplete: () => this.land(target),
            onStop: () => {
                this.isJumping = false;
                this.groundY = this.y;
                this.syncGroundVisuals();
            }
        });

        return true;
    }

    private land(at: Phaser.Math.Vector2): void {
        this.isJumping = false;
        this.landedAt = this.scene.time.now;
        this.x = at.x;
        this.groundY = at.y;
        this.y = at.y;
        this.syncGroundVisuals();

        this.recoveryUntil = this.scene.time.now + GameConfig.PLAYER.JUMP.RECOVERY_MS;
        this.setVelocity(0);

        this.spawnLandingDust();
        this.scene.cameraDirector?.shakeFrom(
            this.x,
            this.groundY,
            GameConfig.PLAYER.JUMP.LANDING_SHAKE,
            GameConfig.PLAYER.JUMP.LANDING_SHAKE_MS
        );
    }

    /**
     * Small puffs kicked outward on touchdown.
     *
     * Drawn as tweened ellipses rather than a particle emitter so it needs no
     * new texture and stays under a dozen objects per landing.
     */
    private spawnLandingDust(): void {
        const cfg = GameConfig.PLAYER.JUMP.DUST;
        const feetY = this.groundY + this.displayHeight * (1 - this.originY);

        for (let i = 0; i < cfg.COUNT; i++) {
            const angle = (Math.PI * 2 * i) / cfg.COUNT + Phaser.Math.FloatBetween(-0.3, 0.3);
            const puff = this.scene.add.ellipse(this.x, feetY, cfg.SIZE, cfg.SIZE * 0.6, cfg.COLOR, 0.5);
            puff.setDepth(DEPTH.GROUND + 2);

            this.scene.tweens.add({
                targets: puff,
                x: this.x + Math.cos(angle) * cfg.SPREAD,
                y: feetY + Math.sin(angle) * cfg.SPREAD * 0.45,
                scale: 0.2,
                alpha: 0,
                duration: cfg.DURATION,
                ease: 'Quad.easeOut',
                onComplete: () => puff.destroy()
            });
        }
    }

    // ------------------------------------------------------------- indicator

    updateGoalIndicator() {
        const goal = this.scene.goal;
        if (!goal) return;

        const cfg = GameConfig.PLAYER.GOAL_INDICATOR;
        this.goalIndicator.clear();

        const angle = Phaser.Math.Angle.Between(this.x, this.y, goal.x, goal.y);
        const arrowX = this.x + Math.cos(angle) * cfg.DISTANCE;
        const arrowY = this.y + Math.sin(angle) * cfg.DISTANCE;

        this.goalIndicator.fillStyle(cfg.COLOR, 0.9);
        this.goalIndicator.lineStyle(2, 0x000000, 0.8);

        this.goalIndicator.beginPath();
        this.goalIndicator.moveTo(arrowX + Math.cos(angle) * cfg.SIZE, arrowY + Math.sin(angle) * cfg.SIZE);
        this.goalIndicator.lineTo(
            arrowX + Math.cos(angle + cfg.SPREAD) * cfg.SIZE,
            arrowY + Math.sin(angle + cfg.SPREAD) * cfg.SIZE
        );
        this.goalIndicator.lineTo(
            arrowX + Math.cos(angle - cfg.SPREAD) * cfg.SIZE,
            arrowY + Math.sin(angle - cfg.SPREAD) * cfg.SIZE
        );
        this.goalIndicator.closePath();
        this.goalIndicator.fill();
        this.goalIndicator.strokePath();
    }

    destroy(fromScene?: boolean) {
        this.shadow.destroy();
        this.goalIndicator.destroy();
        this.landingPreview.destroy();
        super.destroy(fromScene);
    }
}
