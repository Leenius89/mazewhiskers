import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';
import { difficultyOf } from './core/difficulty';
import { getSettings } from '../settings';
import { setStaticFootBody } from './core/bodies';
import { DEPTH, sortDepth } from './core/depth';
import { TILE_UNIT, cellOf, isOpen, worldOf } from './core/grid';
import type { Cell } from './core/grid';
import type { GameOverReason, GameScene } from './scenes/GameScene';

interface PendingCell {
    gx: number;
    gy: number;
}

interface Point {
    x: number;
    y: number;
}

type KnockbackFn = (fromX: number, fromY: number, speed: number, durationMs: number) => void;

/**
 * Redevelopment: the thing actually hunting the player.
 *
 * It arrives as whole blocks dropped anywhere on the map — not as tidy rows
 * marching in from the edges. Edges gave the player a safe middle and one clear
 * direction to run, which is neither how a city gets redeveloped nor an
 * interesting thing to play against. A block can land on the alley you were
 * about to take.
 *
 * Each block runs a four-stage cycle, so the pressure can be read and answered
 * rather than merely suffered:
 *
 *   1. warning  — hazard tape over the whole block, three seconds ahead
 *   2. clearing — anyone still standing there is shoved out, not killed
 *   3. landing  — dust, a shake, and the towers drop in solid
 *   4. pressure — those cells join the grid, so the reachable city is smaller
 *
 * Death only happens when there is nowhere left to be shoved to. That is the
 * point: the player is not crushed, they are displaced until displacement runs
 * out of room.
 */
export class ApartmentSystem {
    private readonly scene: GameScene;
    private readonly player: Phaser.Physics.Arcade.Sprite;
    private readonly goal: Phaser.Physics.Arcade.Sprite | null;
    private readonly apartments: Phaser.Physics.Arcade.StaticGroup;

    private readonly mazeSize = GameConfig.MAZE_SIZE;
    private readonly tileUnit = TILE_UNIT;
    private readonly wallScale = GameConfig.APARTMENT.WALL_SCALE;

    private readonly occupiedPositions = new Set<string>();
    /** Cells currently under hazard tape, keyed by cell. */
    readonly pending = new Map<string, PendingCell>();

    private readonly warningGraphics: Phaser.GameObjects.Graphics;
    private spawnTimer: Phaser.Time.TimerEvent | null = null;
    private openCellsAtStart = 0;
    private builtCells = 0;

    constructor(scene: GameScene, player: Phaser.Physics.Arcade.Sprite, goal: Phaser.Physics.Arcade.Sprite | null) {
        this.scene = scene;
        this.player = player;
        this.goal = goal;
        this.apartments = scene.physics.add.staticGroup();

        this.warningGraphics = scene.add.graphics();
        this.warningGraphics.setDepth(DEPTH.GROUND + 3);

        this.createDustAnimation();
        this.countOpenCells();

        const difficulty = difficultyOf(getSettings().difficulty);
        const delay =
            GameConfig.APARTMENT.DELAY *
            scene.mode.apartmentDelayScale *
            scene.pressure *
            difficulty.apartmentScale;
        scene.time.delayedCall(delay, () => this.startSpawning(), [], this);
    }

    /** Exposed so the scene can collide the player and enemy against it. */
    get group(): Phaser.Physics.Arcade.StaticGroup {
        return this.apartments;
    }

    private countOpenCells(): void {
        const maze = this.scene.maze;
        if (!maze) return;
        this.openCellsAtStart = maze.reduce((total, row) => total + row.filter((cell) => cell === 0).length, 0);
    }

    /** Share of the original walkable city still standing, 0 to 1. */
    get alleysRemaining(): number {
        const maze = this.scene.maze;
        if (!maze || this.openCellsAtStart === 0) return 1;

        const open = maze.reduce((total, row) => total + row.filter((cell) => cell === 0).length, 0);
        return Phaser.Math.Clamp(open / this.openCellsAtStart, 0, 1);
    }

    /** How far the redevelopment has advanced overall, 0 to 1. */
    get development(): number {
        if (this.openCellsAtStart === 0) return 0;
        return Phaser.Math.Clamp(this.builtCells / this.openCellsAtStart, 0, 1);
    }

    private createDustAnimation(): void {
        if (this.scene.anims.exists('dust')) return;

        this.scene.anims.create({
            key: 'dust',
            frames: [
                { key: 'dust1', frame: 0 },
                { key: 'dust2', frame: 0 }
            ],
            frameRate: 8,
            repeat: 3,
            duration: 1000
        });
    }

    private startSpawning(): void {
        this.spawnTimer = this.scene.time.addEvent({
            delay:
                GameConfig.APARTMENT.SPAWN_INTERVAL *
                this.scene.mode.apartmentIntervalScale *
                this.scene.pressure,
            callback: () => this.announceBlock(),
            callbackScope: this,
            loop: true
        });

        this.announceBlock();
    }

    // ------------------------------------------------------------- 1. warning

    /** Picks a block and puts hazard tape over every cell in it. */
    private announceBlock(): void {
        if (this.scene.state.hasEnded() || this.scene.narrativeActive) return;

        const block = this.chooseBlock();
        if (!block) return;

        const cells: PendingCell[] = [];
        for (let gy = block.gy; gy < block.gy + block.height; gy++) {
            for (let gx = block.gx; gx < block.gx + block.width; gx++) {
                if (this.isCellBuilt(gx, gy)) continue;
                if (this.isProtectedGoal(gx, gy)) continue;

                const cell = { gx, gy };
                this.pending.set(this.cellKey(gx, gy), cell);
                cells.push(cell);
            }
        }

        if (cells.length === 0) return;

        this.scene.soundManager?.playConstructSound();
        this.scene.cameraDirector?.shakeFrom(
            (block.gx + block.width / 2) * this.tileUnit,
            (block.gy + block.height / 2) * this.tileUnit,
            0.0022,
            420
        );

        this.scene.time.delayedCall(GameConfig.APARTMENT.WARNING_MS, () => this.clearBlock(cells));
    }

    /**
     * Where the next block lands.
     *
     * Blocks grow as the redevelopment advances, and never land centred on the
     * player — being announced on top of leaves no moment to move. Tries a
     * handful of spots and gives up rather than looping: a skipped block is
     * invisible, a hung frame is not.
     */
    private chooseBlock(): { gx: number; gy: number; width: number; height: number } | null {
        const cfg = GameConfig.APARTMENT.BLOCK;
        const maxSize = Math.round(Phaser.Math.Linear(cfg.MIN_SIZE, cfg.MAX_SIZE, this.development));
        const playerCell = cellOf(this.player.x, this.scene.player?.groundY ?? this.player.y);

        for (let attempt = 0; attempt < cfg.PLACEMENT_ATTEMPTS; attempt++) {
            const width = Phaser.Math.Between(cfg.MIN_SIZE, Math.max(cfg.MIN_SIZE, maxSize));
            const height = Phaser.Math.Between(cfg.MIN_SIZE, Math.max(cfg.MIN_SIZE, maxSize));
            const gx = Phaser.Math.Between(0, this.mazeSize - width);
            const gy = Phaser.Math.Between(0, this.mazeSize - height);

            const distance = Phaser.Math.Distance.Between(
                gx + width / 2,
                gy + height / 2,
                playerCell.gx,
                playerCell.gy
            );
            if (distance < cfg.MIN_PLAYER_DISTANCE_CELLS) continue;

            // A block that walls the cat off from home is not pressure, it
            // is a coin toss. Once the towers were built often enough and
            // large enough to be felt, two runs in three ended with the
            // route severed inside a minute — at five per cent built, which
            // is nothing like a city that has closed in. Candidates that cut
            // the map are simply not chosen.
            //
            // Late on, when home itself is fair game, this stops applying:
            // by then being cut off is the thing the game has been saying
            // would happen, and it has earned the right to say it.
            if (this.development < GameConfig.APARTMENT.GOAL_SAFE_UNTIL && this.wouldSeverRoute(gx, gy, width, height)) {
                continue;
            }

            return { gx, gy, width, height };
        }

        return null;
    }

    /** The goal survives until the redevelopment is well advanced. */
    /**
     * Every open cell the cat can currently walk to.
     *
     * `skip` is treated as already built, which is how a candidate block is
     * tried on for size before it is announced.
     */
    private reachableFrom(origin: Cell, skip: Set<string>): Set<string> {
        const maze = this.scene.maze;
        const seen = new Set<string>();
        if (!maze) return seen;

        const size = maze.length;
        const startKey = this.cellKey(origin.gx, origin.gy);
        seen.add(startKey);
        const queue: Cell[] = [origin];

        while (queue.length) {
            const cell = queue.shift()!;

            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const gx = cell.gx + dx;
                const gy = cell.gy + dy;
                if (gx < 0 || gy < 0 || gx >= size || gy >= size) continue;

                const key = this.cellKey(gx, gy);
                if (seen.has(key) || skip.has(key)) continue;
                if (maze[gy][gx] !== 0) continue;
                if (this.isCellBuilt(gx, gy)) continue;
                if (this.pending.has(key)) continue;

                seen.add(key);
                queue.push({ gx, gy });
            }
        }

        return seen;
    }

    /**
     * Whether this block would cut anywhere the cat can walk off from home.
     *
     * Not just the cat's own route. Checking only that stopped the obvious
     * case and left a subtler one: a block can leave the current position
     * connected while sealing a pocket a few streets over, and a cat that
     * wanders into it is stranded through no decision of its own. The test is
     * therefore the whole region — every cell reachable now must still reach
     * home afterwards.
     *
     * Two flood fills over a forty-one square grid, run only while a block is
     * looking for somewhere to land.
     */
    private wouldSeverRoute(gx: number, gy: number, width: number, height: number): boolean {
        const maze = this.scene.maze;
        const player = this.scene.player;
        if (!maze || !player || !this.goal) return false;

        const doomed = new Set<string>();
        for (let y = gy; y < gy + height; y++) {
            for (let x = gx; x < gx + width; x++) doomed.add(this.cellKey(x, y));
        }

        const from = cellOf(player.x, player.groundY);
        const to = cellOf(this.goal.x, this.goal.y);

        // Where the cat could get to before the block, and where home can get
        // to after it. The first must be contained in the second.
        const nowReachable = this.reachableFrom(from, new Set());
        const stillHome = this.reachableFrom(to, doomed);

        // `forEach` rather than `for...of`: this project compiles to ES5, where
        // iterating a Set directly needs downlevelIteration turned on.
        let severed = false;
        nowReachable.forEach((key) => {
            if (severed || doomed.has(key)) return;
            if (!stillHome.has(key)) severed = true;
        });

        return severed;
    }

    private isProtectedGoal(gx: number, gy: number): boolean {
        if (!this.goal) return false;
        if (this.development >= GameConfig.APARTMENT.GOAL_SAFE_UNTIL) return false;

        const goalCell = cellOf(this.goal.x, this.goal.y);
        return Math.abs(goalCell.gx - gx) <= 1 && Math.abs(goalCell.gy - gy) <= 1;
    }

    /** Hazard tape, redrawn every frame so it can pulse. */
    drawWarnings(time: number): void {
        this.warningGraphics.clear();
        if (this.pending.size === 0) return;

        const cfg = GameConfig.APARTMENT.WARNING;
        const half = this.tileUnit / 2;
        const pulse = 0.6 + 0.4 * Math.sin((time / cfg.PULSE_MS) * Math.PI * 2);

        this.warningGraphics.fillStyle(cfg.COLOR, cfg.ALPHA * 0.22 * pulse);
        this.warningGraphics.lineStyle(2, cfg.COLOR, cfg.ALPHA * pulse);

        this.pending.forEach((cell) => {
            const left = cell.gx * this.tileUnit - half;
            const top = cell.gy * this.tileUnit - half;

            this.warningGraphics.fillRect(left, top, this.tileUnit, this.tileUnit);
            this.warningGraphics.strokeRect(left + 2, top + 2, this.tileUnit - 4, this.tileUnit - 4);

            for (let offset = cfg.STRIPE; offset < this.tileUnit; offset += cfg.STRIPE) {
                this.warningGraphics.lineBetween(left + offset, top, left, top + offset);
                this.warningGraphics.lineBetween(
                    left + this.tileUnit,
                    top + offset,
                    left + offset,
                    top + this.tileUnit
                );
            }
        });
    }

    /**
     * Nobody is left standing inside a tower, on any frame.
     *
     * `settleBlock` clears the block the moment it lands, which covers the
     * cat being there when it arrives. It does not cover every other way of
     * ending up inside one — a shove that lands in a cell a second block is
     * about to take, a jump that clears a wall into a footprint, physics
     * separating a body the wrong side of a static box. The result was a cat
     * standing in the middle of an apartment with no way out and nothing
     * pushing it, which is what the knockback was supposed to prevent.
     *
     * Checked continuously rather than at landing, so however it happens, it
     * is undone on the next frame.
     */
    enforceClearance(): void {
        const player = this.scene.player;
        if (!player || this.scene.state.hasEnded()) return;

        // A shove already in flight is the fix, not the problem.
        if (player.isRecovering) return;

        // Being hit throws the cat about, and a hit is never allowed to end the
        // run this way — that loss belongs to the towers, not to the black cat.
        if (player.isInvulnerable) return;

        const cell = cellOf(player.x, player.groundY);
        if (!this.isCellBuilt(cell.gx, cell.gy)) return;

        const here = worldOf(cell);
        const exit = this.exitCell(cell, this.outward(here, player.x, player.groundY), new Set());

        // Pushed with nowhere to be pushed to. That is the loss this game is
        // about, so it ends the run rather than leaving the cat embedded.
        if (!exit) {
            this.triggerGameOver('apartment:player');
            return;
        }

        player.shoveTo(exit.x, exit.y);
    }

    isPendingCell(gx: number, gy: number): boolean {
        return this.pending.has(this.cellKey(gx, gy));
    }

    // ----------------------------------------------- 2. clearing, 3. landing

    private clearBlock(cells: PendingCell[]): void {
        if (this.scene.state.hasEnded()) return;

        const playerCell = cellOf(this.player.x, this.scene.player?.groundY ?? this.player.y);
        cells.forEach((cell) => this.pending.delete(this.cellKey(cell.gx, cell.gy)));

        // Displace before building, so the shove target is judged against the
        // grid as it stands rather than as it is about to be.
        const doomed = cells.some((cell) => cell.gx === playerCell.gx && cell.gy === playerCell.gy);
        if (doomed && !this.displacePlayer(playerCell, cells)) {
            this.triggerGameOver('apartment:player');
            return;
        }

        cells.forEach((cell) => this.buildAt(cell));

        // Registered after the towers' own timers, so it runs on the frame
        // they become solid rather than a frame before.
        this.scene.time.delayedCall(GameConfig.APARTMENT.DUST_MS, () => {
            this.settleBlock(cells);
            this.scene.barks?.redevelopment();
        });

        if (this.goal) {
            const goalCell = cellOf(this.goal.x, this.goal.y);
            if (cells.some((cell) => cell.gx === goalCell.gx && cell.gy === goalCell.gy)) {
                this.triggerGameOver('apartment:goal');
            }
        }
    }

    /**
     * Shoves the player out of the block, on the side they are already on.
     *
     * Returns false only when every cell within reach is a wall, doomed or
     * already built — the one case that kills.
     */
    private displacePlayer(from: Cell, doomedCells: PendingCell[]): boolean {
        const player = this.scene.player;
        if (!player) return true;

        const centre = this.blockCentre(doomedCells);
        const blocked = new Set(doomedCells.map((cell) => this.cellKey(cell.gx, cell.gy)));
        const exit = this.exitCell(from, this.outward(centre, player.x, player.groundY), blocked);

        if (!exit) return false;

        player.shoveTo(exit.x, exit.y);
        return true;
    }

    /**
     * Nothing may be left standing inside a tower once it is solid.
     *
     * `clearBlock` displaces the player before the build, which buys them a
     * beat to run — but the towers do not land for another `DUST_MS`, and
     * anyone can walk straight into the dust in that time. That is how the cat
     * ended up standing inside a building: the displacement had already run
     * and nothing checked again. This runs when the bodies really exist.
     *
     * It also shoves whoever is merely standing next to the block, outward in
     * every direction, so a tower landing lands on the player as weight rather
     * than as a sprite appearing.
     */
    private settleBlock(cells: PendingCell[]): void {
        if (this.scene.state.hasEnded()) return;

        const blocked = new Set(cells.map((cell) => this.cellKey(cell.gx, cell.gy)));
        const centre = this.blockCentre(cells);
        const inside = (x: number, y: number): boolean => {
            const cell = cellOf(x, y);
            return blocked.has(this.cellKey(cell.gx, cell.gy));
        };

        const player = this.scene.player;
        if (player) {
            if (inside(player.x, player.groundY)) {
                const from = cellOf(player.x, player.groundY);
                const exit = this.exitCell(from, this.outward(centre, player.x, player.groundY), blocked);

                if (!exit) {
                    this.triggerGameOver('apartment:player');
                    return;
                }
                player.shoveTo(exit.x, exit.y);
            } else {
                this.knockClear(player, cells);
            }
        }

        this.scene.enemies.forEach((enemy) => {
            if (!enemy.active) return;

            if (inside(enemy.x, enemy.groundY)) {
                const from = cellOf(enemy.x, enemy.groundY);
                const exit = this.exitCell(from, this.outward(centre, enemy.x, enemy.groundY), blocked);
                if (exit) enemy.placeAt(exit.x, exit.y);
            } else {
                this.knockClear(enemy, cells);
            }
        });
    }

    /**
     * Outward impulse, away from the tower that landed nearest.
     *
     * Measured from the closest cell rather than from the block's centre: a
     * seven-by-seven block has a centre most of a screen away from its own edge,
     * so a centre-based reach would have shoved nobody at all on the big blocks
     * — the ones that most need to feel heavy.
     */
    private knockClear(target: { x: number; groundY: number; knockback: KnockbackFn }, cells: PendingCell[]): void {
        const cfg = GameConfig.APARTMENT.KNOCKBACK;
        const reach = cfg.RADIUS_CELLS * this.tileUnit;

        let nearest: Point | null = null;
        let distance = Infinity;

        for (const cell of cells) {
            const world = worldOf(cell);
            const gap = Phaser.Math.Distance.Between(world.x, world.y, target.x, target.groundY);

            if (gap < distance) {
                distance = gap;
                nearest = world;
            }
        }

        if (!nearest || distance > reach) return;

        target.knockback(nearest.x, nearest.y, cfg.SPEED * (1 - distance / reach), cfg.DURATION);
    }

    /**
     * The nearest cell outside the block, on the side the target is already on.
     *
     * Rings outward as the old search did, but within a ring it takes the cell
     * lying furthest along `outward`. A cat at the south edge of a block
     * therefore leaves by the south side, instead of being flung across the
     * whole block to whichever cell the loop happened to reach first.
     */
    private exitCell(from: Cell, outward: Phaser.Math.Vector2, blocked: Set<string>): Point | null {
        const maze = this.scene.maze;
        if (!maze) return null;

        for (let radius = 1; radius <= GameConfig.APARTMENT.PUSH.SEARCH_CELLS; radius++) {
            let best: Cell | null = null;
            let bestScore = -Infinity;

            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    // Only the ring at this radius; inner ones were already tried.
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;

                    const gx = from.gx + dx;
                    const gy = from.gy + dy;

                    if (!isOpen(maze, gx, gy)) continue;
                    if (blocked.has(this.cellKey(gx, gy))) continue;
                    // A cell already carrying a tower, or about to, is not an exit.
                    if (this.isPendingCell(gx, gy) || this.isCellBuilt(gx, gy)) continue;

                    const length = Math.hypot(dx, dy) || 1;
                    const score = (dx / length) * outward.x + (dy / length) * outward.y;

                    if (score > bestScore) {
                        bestScore = score;
                        best = { gx, gy };
                    }
                }
            }

            if (best) return worldOf(best);
        }

        return null;
    }

    private blockCentre(cells: PendingCell[]): Point {
        const total = cells.reduce(
            (sum, cell) => ({ gx: sum.gx + cell.gx, gy: sum.gy + cell.gy }),
            { gx: 0, gy: 0 }
        );

        return worldOf({ gx: total.gx / cells.length, gy: total.gy / cells.length });
    }

    /** Unit vector pointing away from the block. */
    private outward(centre: Point, x: number, y: number): Phaser.Math.Vector2 {
        const vector = new Phaser.Math.Vector2(x - centre.x, y - centre.y);

        // Dead centre of the block has no side to leave by; south is as good
        // as any, and it is the direction the camera can see.
        return vector.lengthSq() < 1 ? new Phaser.Math.Vector2(0, 1) : vector.normalize();
    }

    private buildAt(cell: PendingCell): void {
        const x = cell.gx * this.tileUnit;
        const y = cell.gy * this.tileUnit;

        if (this.isCellBuilt(cell.gx, cell.gy)) return;
        this.occupiedPositions.add(this.cellKey(cell.gx, cell.gy));

        const baseY = y + this.tileUnit / 2;

        const dust = this.scene.add.sprite(x, baseY, 'dust1');
        dust.setOrigin(0.5, 1);
        dust.setScale(this.wallScale);
        dust.setDepth(sortDepth(baseY) + 1);
        dust.play('dust');

        this.scene.time.delayedCall(GameConfig.APARTMENT.DUST_MS, () => {
            dust.destroy();
            this.raiseTower(cell, x, baseY);
        });
    }

    private raiseTower(cell: PendingCell, x: number, baseY: number): void {
        this.removeExistingWalls(x, cell.gy * this.tileUnit);

        const apartmentType = Phaser.Math.Between(1, 3);
        // Origin at the base, placed on the tile's ground line, so the tower
        // stands on its own cell instead of straddling it. Depth, collision and
        // occlusion all key off that base.
        const apartment = this.apartments.create(x, baseY, `apt${apartmentType}`) as Phaser.Physics.Arcade.Sprite;

        apartment.setOrigin(0.5, 1);
        apartment.setScale(this.wallScale, this.wallScale * GameConfig.APARTMENT.HEIGHT_SCALE);
        apartment.setDepth(sortDepth(baseY));

        setStaticFootBody(apartment, {
            width: GameConfig.HITBOX.APARTMENT.WIDTH,
            height: GameConfig.HITBOX.APARTMENT.HEIGHT
        });

        // The grid is what the enemy and the jump preview read, so it has to
        // agree with the world.
        if (this.scene.maze?.[cell.gy]?.[cell.gx] === 0) {
            this.scene.maze[cell.gy][cell.gx] = 1;
            this.builtCells++;
        }
        this.scene.occluders.set(this.cellKey(cell.gx, cell.gy), apartment);

        this.scene.cameraDirector?.shakeFrom(
            x,
            baseY,
            GameConfig.APARTMENT.LANDING_SHAKE,
            GameConfig.APARTMENT.LANDING_SHAKE_MS
        );
        this.rattleNeighbours(cell);

        apartment.setAlpha(0);
        this.scene.tweens.add({
            targets: apartment,
            alpha: 1,
            duration: GameConfig.APARTMENT.FADE_IN,
            ease: 'Power2'
        });
    }

    /**
     * The block next door feels it land.
     *
     * A tower dropping in silently beside untouched neighbours reads as a sprite
     * appearing; a short wobble through the surrounding buildings makes it read
     * as something heavy arriving in a place where people live.
     */
    private rattleNeighbours(cell: PendingCell): void {
        const cfg = GameConfig.APARTMENT.NEIGHBOUR_SHAKE;

        for (let dy = -cfg.CELLS; dy <= cfg.CELLS; dy++) {
            for (let dx = -cfg.CELLS; dx <= cfg.CELLS; dx++) {
                if (dx === 0 && dy === 0) continue;

                const neighbour = this.scene.occluders.get(this.cellKey(cell.gx + dx, cell.gy + dy));
                if (!neighbour || !neighbour.active) continue;
                // Already wobbling from another tower in the same block.
                if (this.scene.tweens.isTweening(neighbour)) continue;

                const distance = Math.max(Math.abs(dx), Math.abs(dy));
                const amount = cfg.ANGLE * (1 - (distance - 1) / cfg.CELLS);

                this.scene.tweens.add({
                    targets: neighbour,
                    angle: { from: -amount, to: amount },
                    duration: cfg.DURATION / 4,
                    yoyo: true,
                    repeat: 1,
                    ease: 'Sine.easeInOut',
                    onComplete: () => neighbour.setAngle(0)
                });
            }
        }
    }

    // --------------------------------------------------------------- geometry

    private cellKey(gx: number, gy: number): string {
        return `${gx},${gy}`;
    }

    /** Whether a tower already stands on this cell. Public: the scene's
     *  reachability check needs to know which cells are gone. */
    isCellBuilt(gx: number, gy: number): boolean {
        return this.occupiedPositions.has(this.cellKey(gx, gy));
    }

    private removeExistingWalls(x: number, y: number): void {
        const walls = this.scene.walls;
        if (!walls) return;

        const children = walls.getChildren() as Phaser.Physics.Arcade.Sprite[];
        for (let i = children.length - 1; i >= 0; i--) {
            const wall = children[i];
            if (wall.active && Math.abs(wall.x - x) < this.tileUnit && Math.abs(wall.y - y) < this.tileUnit) {
                const { gx, gy } = cellOf(wall.x, wall.y);
                this.scene.occluders.delete(this.cellKey(gx, gy));
                wall.destroy();
            }
        }
    }

    // ------------------------------------------------------------------ state

    private triggerGameOver(reason: GameOverReason): void {
        if (this.scene.state.hasEnded()) return;
        this.stopSpawning();
        this.scene.beginGameOver(reason);
    }

    stopSpawning(): void {
        this.spawnTimer?.remove();
        this.spawnTimer = null;
    }

    destroy(): void {
        this.stopSpawning();
        this.pending.clear();
        this.warningGraphics.destroy();

        // Phaser's own plugins shut down before this scene's SHUTDOWN listeners
        // run, so on a restart the group's internals may already be gone.
        if (this.apartments?.children) this.apartments.clear(true, true);
    }
}
