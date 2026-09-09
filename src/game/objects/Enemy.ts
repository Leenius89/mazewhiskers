import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { currentDifficulty, difficultyOf } from '../core/difficulty';
import { getSettings } from '../../settings';
import { setFootBody } from '../core/bodies';
import { DEPTH, sortDepth } from '../core/depth';
import { cellOf, hasLineOfSight, isOpen, worldOf } from '../core/grid';
import type { Cell } from '../core/grid';
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

    /** Cells still to walk, nearest first. Empty means going straight. */
    private path: Cell[] = [];
    /** The cell the current path was worked out to. */
    private pathTo = '';
    /** When it was worked out, on the run clock. */
    private pathAt = 0;

    /** When a failed route may be attempted again. Stops a per-frame flood fill. */
    private routeRetryAt = 0;

    /** When the current waypoint was first aimed at, so a hopeless one is dropped. */
    private waypointSince = 0;

    /**
     * Where it was when the watchdog last looked, and when that was.
     *
     * Every previous fix for "the black cat is stuck" repaired one specific way
     * of getting stuck: inside a tower, then inside an original building, then
     * without a route. Each time another way turned up. This does not care how
     * it happened — it watches for the symptom, which is a cat that means to be
     * moving and is not, and it is the reason a fourth cause would not need a
     * fourth report.
     */
    private anchorAt = 0;
    private anchor = { x: 0, y: 0 };
    /** 0 nothing tried, 1 jumped, 2 asked to be rehomed. Reset by real progress. */
    private escalated = 0;

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

        this.staggerUntil = this.scene.runNow + durationMs;

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

        // The route was worked out from where it used to be. Keeping it meant
        // that for up to PATH.REFRESH_MS after every rescue the cat walked
        // towards a waypoint chosen for a different part of the city.
        this.forgetRoute();
    }

    /** Drops the cached route so the next frame works out a fresh one. */
    forgetRoute(): void {
        this.path = [];
        this.pathTo = '';
        this.pathAt = 0;
        this.routeRetryAt = 0;
    }

    /** Holds still for a beat, so its arrival registers before it moves. */
    announce(): void {
        this.awareness = 'telegraph';
        this.telegraphUntil = this.scene.runNow + GameConfig.ENEMY.TELEGRAPH.DURATION_MS;
        this.setVelocity(0, 0);
        this.scene.soundManager?.playEnemyAlert();
    }

    // ------------------------------------------------------------------ update

    update(): void {
        if (!this.active || this.isJumping) return;

        const now = this.scene.runNow;

        if (this.awareness === 'telegraph') {
            this.setVelocity(0, 0);
            if (now >= this.telegraphUntil) this.awareness = 'chase';
        } else if (now >= this.staggerUntil) {
            // While staggered the knockback owns velocity; pursuing would
            // overwrite it on the very next frame and the shove would not read.
            this.pursue();
        }

        this.watchProgress(now);

        this.groundY = this.y;
        this.syncGroundVisuals();
        this.drawCone(now);
    }

    /**
     * Notices that it is not getting anywhere, and does something about it.
     *
     * Intent is the test, not velocity alone: a cat holding still through its
     * telegraph is not stuck, and neither is one mid-jump. What counts is
     * asking to move and not moving — pressed into a corner the steering
     * cannot round, standing on a waypoint it cannot leave, or in an open
     * pocket with no way to the player at all.
     *
     * Two escalations, in order. First a jump, which is the answer when a wall
     * is the only thing in the way and is what the harder settings can now
     * actually clear. If it is still stuck after that, the apartment system is
     * asked to put it somewhere it can walk — which is the only answer left
     * when the cat is in a sealed pocket, because nothing it does on its own
     * will ever get it out.
     */
    private watchProgress(now: number): void {
        const cfg = GameConfig.ENEMY.STUCK;

        // Not trying to move is not being stuck: a cat holding still through
        // its telegraph, mid-jump, or staggered by a shove is behaving.
        const trying = this.awareness === 'chase' && !this.isJumping && now >= this.staggerUntil;
        if (!trying) {
            this.anchorAt = now;
            this.anchor = { x: this.x, y: this.groundY };
            return;
        }

        /*
         * Measured against an anchor it has to get AWAY from, not frame to frame.
         *
         * The first version compared each sample to the last one and called any
         * movement progress. A cat sealed into a single cell fails that test
         * beautifully: the cell is 96px and the body 48, so it slides back and
         * forth across forty-odd pixels forever, reports movement every sample,
         * and never goes anywhere. Measured this way it has to actually leave
         * the neighbourhood — a real chase covers a tile a second and clears
         * this immediately, and no amount of rattling inside one ever will.
         */
        if (!this.anchorAt) {
            this.anchorAt = now;
            this.anchor = { x: this.x, y: this.groundY };
            return;
        }

        const gone = Phaser.Math.Distance.Between(this.anchor.x, this.anchor.y, this.x, this.groundY);

        if (gone >= cfg.PROGRESS_PX) {
            this.anchorAt = now;
            this.anchor = { x: this.x, y: this.groundY };
            this.escalated = 0;
            return;
        }

        const stalled = now - this.anchorAt;

        if (stalled >= cfg.RESCUE_MS && this.escalated < 2) {
            this.escalated = 2;
            this.forgetRoute();
            this.scene.apartmentSystem?.rehomeEnemy(this);
            return;
        }

        if (stalled >= cfg.JUMP_MS && this.escalated < 1) {
            this.escalated = 1;
            // A fresh route first: the one it is following may be the problem.
            this.forgetRoute();
            this.tryJumpToward(
                this.player.x,
                (this.player as { groundY?: number }).groundY ?? this.player.y
            );
        }
    }

    /**
     * Along a route through the streets, not straight through the buildings.
     *
     * It used to walk at the player and nothing else — a look-ahead of one
     * cell, a two-cell hop when that cell was a wall, and no idea of the city
     * beyond that. Against the old maze that was survivable, because a wall is
     * one cell thick and the hop clears it. Against the towers it was not: a
     * block is several cells of solid on every side, the hop lands in more of
     * it and is refused, and the thing spends the rest of the run grinding
     * into a wall four streets from anybody. That is the shape a chase should
     * never have — it stops being a threat and becomes scenery.
     *
     * So it walks a real route now. The straight line is still preferred when
     * the street is actually straight, both because it is cheaper and because
     * a cat that can see you should come at you rather than pick its way along
     * a grid. The route is only for when it cannot.
     */
    private pursue(): void {
        const speed = GameConfig.ENEMY.SPEED * currentDifficulty().enemySpeedScale;
        const targetY = this.player.body ? (this.player as { groundY?: number }).groundY ?? this.player.y : this.player.y;
        const target = { x: this.player.x, y: targetY };

        // In the open, go straight. This is also what keeps the chase reading
        // as a chase in the parts of the map that have not been built over.
        //
        // The route is kept rather than deleted. Sight is a shortcut, not a
        // decision: throwing the path away on every sighted frame meant a
        // single wrong answer from hasLineOfSight left the cat with nothing to
        // fall back on, walking into a corner with no memory of the way round.
        // Now the shortcut can be wrong and the next frame still has a route.
        if (hasLineOfSight(this.maze, this.x, this.groundY, target.x, target.y)) {
            this.steerTo(target, speed);
            return;
        }

        const from = cellOf(this.x, this.groundY);
        const to = cellOf(target.x, target.y);
        this.ensurePath(from, to);

        const next = this.path[0];
        if (!next) {
            // No route at all: walled in, or the player is. The wall is the
            // only way through, which is exactly what the hop is for. If that
            // is refused too, the watchdog will have it rehomed shortly.
            if (this.tryJumpToward(target.x, target.y)) return;
            this.steerTo(target, speed);
            return;
        }

        const step = worldOf(next);
        const gap = Phaser.Math.Distance.Between(this.x, this.groundY, step.x, step.y);

        if (gap <= GameConfig.ENEMY.PATH.ARRIVE) {
            this.path.shift();
            this.waypointSince = 0;
        } else {
            // A waypoint it cannot stand on used to be held forever, because
            // arriving was the only way to leave one. Give up on it and let the
            // next be tried instead.
            if (!this.waypointSince) this.waypointSince = this.scene.runNow;
            else if (this.scene.runNow - this.waypointSince > GameConfig.ENEMY.PATH.WAYPOINT_MS) {
                this.waypointSince = 0;
                this.path.shift();
            }
        }

        this.steerTo(step, speed);
    }

    /**
     * Keeps the route fresh enough to be worth following.
     *
     * Recomputed when the player has moved to a different cell, when the next
     * step has had a tower dropped on it, and on a slow tick regardless —
     * the city changes underneath a route that is otherwise perfectly valid.
     * Not every frame: this is a flood fill over sixteen hundred cells and it
     * would be the most expensive thing in the game for no gain.
     */
    private ensurePath(from: Cell, to: Cell): void {
        const key = `${to.gx},${to.gy}`;
        const now = this.scene.runNow;
        const next = this.path[0];

        const stale =
            key !== this.pathTo ||
            now - this.pathAt > GameConfig.ENEMY.PATH.REFRESH_MS ||
            this.path.length === 0 ||
            !isOpen(this.maze, next.gx, next.gy);

        if (!stale) return;

        // An unreachable target is stale on every frame by definition — the
        // route is empty, so the test above is always true — and the old code
        // answered that by re-running a whole-grid flood fill sixty times a
        // second, throwing each failure away. Once a route has failed, wait
        // before asking again; the city has to change for the answer to.
        if (this.path.length === 0 && now < this.routeRetryAt) return;

        this.pathTo = key;
        this.pathAt = now;
        this.waypointSince = 0;
        this.path = this.route(from, to);

        if (this.path.length === 0) {
            this.routeRetryAt = now + GameConfig.ENEMY.PATH.NO_ROUTE_BACKOFF_MS;
        }
    }

    /**
     * Shortest walk between two cells, as a list of cells to stand on.
     *
     * A breadth-first fill, which on a grid this size is both exact and cheap.
     * Indexed by `gy * size + gx` into flat arrays rather than a Set of string
     * keys: same answer, without allocating a few thousand strings every time
     * the black cat loses sight of the player.
     */
    private route(from: Cell, to: Cell): Cell[] {
        const maze = this.maze;
        if (!maze) return [];

        const size = maze.length;
        const inside = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < size && gy < size;
        if (!inside(from.gx, from.gy) || !inside(to.gx, to.gy)) return [];

        const start = from.gy * size + from.gx;
        const goal = to.gy * size + to.gx;
        if (start === goal) return [];

        const cameFrom = new Int32Array(size * size).fill(-1);
        const seen = new Uint8Array(size * size);
        seen[start] = 1;

        const queue = [start];
        let head = 0;
        let found = false;

        while (head < queue.length) {
            const at = queue[head++];
            if (at === goal) {
                found = true;
                break;
            }

            const gx = at % size;
            const gy = (at - gx) / size;

            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = gx + dx;
                const ny = gy + dy;
                if (!inside(nx, ny)) continue;

                const index = ny * size + nx;
                if (seen[index]) continue;
                // The goal cell is entered even if something has been built on
                // it, so a player standing somewhere impossible still has a
                // route drawn to them rather than none at all.
                if (index !== goal && maze[ny][nx] !== 0) continue;

                seen[index] = 1;
                cameFrom[index] = at;
                queue.push(index);
            }
        }

        if (!found) return [];

        const cells: Cell[] = [];
        for (let at = goal; at !== start && at !== -1; at = cameFrom[at]) {
            const gx = at % size;
            cells.push({ gx, gy: (at - gx) / size });
        }

        return cells.reverse();
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
        const now = this.scene.runNow;
        if (this.isJumping || now < this.jumpReadyAt) return false;

        const cfg = GameConfig.ENEMY.JUMP;
        const angle = Phaser.Math.Angle.Between(this.x, this.groundY, targetX, targetY);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const dx = Math.abs(cos) > cfg.DIRECTION_THRESHOLD ? Math.sign(cos) : 0;
        const dy = Math.abs(sin) > cfg.DIRECTION_THRESHOLD ? Math.sign(sin) : 0;
        if (dx === 0 && dy === 0) return false;

        const here = cellOf(this.x, this.groundY);

        /*
         * Look for somewhere to land, rather than testing one cell and giving up.
         *
         * The old version checked exactly `CELLS` cells ahead and refused if
         * that square was solid. Against a maze wall one cell thick that
         * works. Against an apartment block four to nine cells on a side the
         * landing is always inside the block, so the hop was refused every
         * time — the black cat could not cross a single tower at any setting,
         * which by the end of a run is most of the city.
         *
         * It now walks outward along the chosen direction and takes the first
         * open cell it finds, up to the reach its difficulty allows. Easy and
         * normal reach two cells, exactly as before, so nothing about those
         * settings changes; hard and nightmare reach far enough to come over
         * the top of a block.
         */
        const reach = Math.max(cfg.CELLS, currentDifficulty().jumpCells);
        let landing: { gx: number; gy: number } | null = null;

        for (let step = cfg.CELLS; step <= reach; step++) {
            const spot = { gx: here.gx + dx * step, gy: here.gy + dy * step };
            if (!isOpen(this.maze, spot.gx, spot.gy)) continue;
            landing = spot;
            break;
        }

        if (!landing) return false;

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
                    this.scene.runNow +
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
