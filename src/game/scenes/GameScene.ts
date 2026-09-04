import Phaser from 'phaser';
import { createMaze } from '../mazeUtils';
import { Player } from '../objects/Player';
import { Enemy } from '../objects/Enemy';
import { createMilkItems } from '../playerUtils';
import { createGoal } from '../goalUtils';
import { setupHealthSystem } from '../healthUtils';
import { SoundManager } from '../soundUtils';
import { ApartmentSystem } from '../apartmentUtils';
import { GameConfig } from '../constants/GameConfig';
import { AssetLoader } from '../managers/AssetLoader';
import { GameEventBus } from '../core/GameEvents';
import { GameStateMachine } from '../core/GameState';
import { DebugOverlay } from '../core/DebugOverlay';
import { isDebugEnabled } from '../core/debug';
import { OcclusionSystem } from '../systems/OcclusionSystem';
import { Vignette } from '../systems/Vignette';
import { InputManager, isMobileDevice } from '../systems/InputManager';
import { CameraDirector } from '../systems/CameraDirector';
import { HudOverlay } from '../systems/HudOverlay';
import { Atmosphere } from '../systems/Atmosphere';
import { BarkSystem } from '../systems/BarkSystem';
import { SweatDrops } from '../systems/SweatDrops';
import { CullingSystem } from '../systems/CullingSystem';
import { PlayerStatusBar } from '../systems/PlayerStatusBar';
import { cellOf, openNeighbours } from '../core/grid';
import { sortDepth } from '../core/depth';
import { ThreatFeedback } from '../systems/ThreatFeedback';
import { NarrativeOverlay } from '../systems/NarrativeOverlay';
import { playEnemyEntrance, runTutorial } from '../systems/TutorialSequence';
import { districtPressure, resolveMode } from '../core/modes';
import type { ModeSettings } from '../core/modes';

/** Which system ended the run. Logged on every game over. */
export type GameOverReason = 'health' | 'enemy' | 'apartment:player' | 'apartment:goal' | 'trapped';

export class GameScene extends Phaser.Scene {
    /**
     * Authoritative health. React mirrors this through `healthChanged`; it no
     * longer owns the value or decides when the run ends.
     */
    public health: number = GameConfig.HEALTH.MAX;

    /** Exhibition or arcade. Resolved once per run from the URL. */
    public mode: ModeSettings = resolveMode();
    /** 1-based district within a run. Arcade plays several; exhibition one. */
    public district = 1;
    /** Difficulty multiplier for this district. Below 1 means tighter. */
    public pressure = 1;

    /**
     * A scripted beat is on screen: the tutorial, or the enemy's entrance.
     *
     * The world holds its breath while this is true — nothing drains, nothing
     * advances, nothing hunts. A player being talked to is not playing, and
     * charging them for the time would be a cheap way to lose.
     */
    public narrativeActive = false;

    /** Spotlight + dialogue. Owns the tutorial and the enemy's entrance. */
    public narrative: NarrativeOverlay | null = null;

    /** Pickup groups, kept so the tutorial can point at a real one. */
    public fishes: Phaser.Physics.Arcade.Group | undefined;
    public milks: Phaser.Physics.Arcade.Group | undefined;

    /** Replaces the old `gameOverStarted` boolean. */
    public readonly state = new GameStateMachine();
    public bus!: GameEventBus;

    /** Most recently spawned enemy — the HUD and camera focus on this one. */
    public enemy: Enemy | null = null;
    /** Every live enemy. Arcade districts add more. */
    public readonly enemies: Enemy[] = [];
    public enemySpawned = false;
    public worldWidth = 0;
    public worldHeight = 0;
    public soundManager: SoundManager | null = null;
    public apartmentSystem: ApartmentSystem | null = null;
    /** Speech bubbles. Public so the apartment system can react in character. */
    public barks: BarkSystem | null = null;
    private sweat: SweatDrops | null = null;
    public tileSize: number = GameConfig.TILE_SIZE;
    public spacing: number = GameConfig.SPACING;
    public maze: number[][] | undefined;
    public player: Player | null = null;
    /** Unified keyboard + touch intent. See InputManager. */
    public controls!: InputManager;
    public cameraDirector: CameraDirector | null = null;
    public walls: Phaser.Physics.Arcade.StaticGroup | undefined;
    public goal: Phaser.Physics.Arcade.Sprite | undefined;
    public startTime = 0;

    /**
     * Every sprite that can hide the player, keyed by grid cell.
     *
     * Lets the occlusion check look at a handful of neighbouring cells instead
     * of testing the player against hundreds of buildings every frame.
     */
    public readonly occluders = new Map<string, Phaser.GameObjects.Sprite>();

    private debugOverlay: DebugOverlay | null = null;
    private occlusion: OcclusionSystem | null = null;
    private vignette: Vignette | null = null;
    /** Public so world-space overlays can keep clear of it. */
    public hud: HudOverlay | null = null;
    private atmosphere: Atmosphere | null = null;
    private culling: CullingSystem | null = null;
    private statusBar: PlayerStatusBar | null = null;
    private threat: ThreatFeedback | null = null;

    /** Scene clock reading of the next rent charge, for the HUD countdown. */
    private nextRentAt = 0;

    /** Why the run ended, carried through to the results screen. */
    private endReason: GameOverReason = 'health';

    /** Where the player was when the trapped check last sampled. */
    private trapAnchor = { x: 0, y: 0 };
    private trapCheckAt = 0;
    private stillSince = 0;
    private enclosedSince = 0;

    constructor() {
        super('GameScene');
    }

    /** Districts re-enter this scene, carrying how far into the run we are. */
    init(data?: { district?: number }) {
        this.mode = resolveMode();
        this.district = data?.district ?? 1;
        this.pressure = districtPressure(this.mode, this.district);

        // A restarted scene reuses this instance, so the state machine has to
        // be told the run is starting over — its field initializer will not
        // run a second time.
        this.state.reset();
        this.narrativeActive = false;
    }

    preload() {
        new AssetLoader(this).preload();

        this.soundManager = new SoundManager(this);
        this.soundManager.preloadSounds();
    }

    create() {
        this.bus = new GameEventBus(this.game.events);

        this.state.onChange((to, from) => this.bus.emit('phaseChanged', { from, to }));

        // Phaser does not call a `shutdown` method on a Scene subclass, so wire
        // teardown to the lifecycle event explicitly.
        this.events.once('shutdown', this.handleShutdown, this);

        this.controls = new InputManager(this);

        // Prevent duplicate BGM by stopping all previous sounds
        this.sound.stopAll();
        this.soundManager?.playMainBGM();

        this.startTime = Date.now();
        this.health = GameConfig.HEALTH.MAX;
        this.occluders.clear();
        this.nextRentAt = this.time.now + GameConfig.HEALTH.RENT.INTERVAL;

        const player = new Player(this, 100, 100);
        this.player = player;

        const { walls, fishes, worldWidth, worldHeight, centerX, centerY, maze, rng } = createMaze(this, player);
        this.walls = walls;
        this.maze = maze;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;

        player.setPosition(
            GameConfig.PLAYER.START_TILE.X * this.tileSize * this.spacing,
            GameConfig.PLAYER.START_TILE.Y * this.tileSize * this.spacing
        );

        this.bus.emit('jumpCountChanged', 0);
        this.bus.emit('healthChanged', { health: this.health, max: GameConfig.HEALTH.MAX, delta: 0 });

        this.fishes = fishes;
        this.milks = createMilkItems(this, walls, player, rng);

        // District 1 starts a fresh run; later districts continue the totals.
        if (this.district === 1) {
            this.registry.set('carriedMilk', 0);
            this.registry.set('carriedFish', 0);
            this.registry.set('carriedMs', 0);
        }
        this.registry.set('milkCount', this.registry.get('carriedMilk') || 0);
        this.registry.set('fishCount', this.registry.get('carriedFish') || 0);

        // Scene-local collect events are counted here, then forwarded to React.
        this.events.on('collectMilk', () => {
            const count = (this.registry.get('milkCount') || 0) + 1;
            this.registry.set('milkCount', count);
            this.bus.emit('milkCollected', count);
        });

        this.events.on('collectFish', () => {
            const count = (this.registry.get('fishCount') || 0) + 1;
            this.registry.set('fishCount', count);
            this.bus.emit('fishCollected', count);
        });

        const centerPosX = centerX * this.tileSize * this.spacing;
        const centerPosY = centerY * this.tileSize * this.spacing;
        this.goal = createGoal(this, player, centerPosX, centerPosY);

        this.bus.on('pauseGame', this.handlePauseRequest, this);
        this.bus.on('resumeGame', this.handleResumeRequest, this);

        this.barks = new BarkSystem(this);
        this.sweat = new SweatDrops(this);
        this.apartmentSystem = new ApartmentSystem(this, player, this.goal);

        // Towers are solid from Phase 1 on: the city actually closes in.
        this.physics.add.collider(player, this.apartmentSystem.group);

        this.cameras.main.startFollow(player, true);
        this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);

        const baseZoom = isMobileDevice() ? GameConfig.CAMERA.MOBILE.ZOOM : GameConfig.CAMERA.DESKTOP.ZOOM;
        this.cameras.main.setZoom(baseZoom);
        if (isMobileDevice()) {
            this.cameras.main.setLerp(GameConfig.CAMERA.MOBILE.LERP, GameConfig.CAMERA.MOBILE.LERP);
        }

        // The opening fly-over owns the camera until `introComplete`.
        this.cameraDirector = new CameraDirector(this, baseZoom);

        setupHealthSystem(this, player, fishes);

        this.events.once('introComplete', () => this.beginPlay());

        this.occlusion = new OcclusionSystem(this);
        this.vignette = new Vignette(this, GameConfig.ATMOSPHERE.VIGNETTE.FROM);
        this.atmosphere = new Atmosphere(this, this.vignette);
        this.hud = new HudOverlay(this);

        this.statusBar = new PlayerStatusBar(this);
        this.threat = new ThreatFeedback(this);
        this.narrative = new NarrativeOverlay(this);

        // One place to acknowledge a line, whichever device is used.
        this.input.on('pointerdown', () => this.narrative?.acknowledge());
        this.input.keyboard?.on('keydown-ENTER', () => this.narrative?.acknowledge());
        this.input.keyboard?.on('keydown-SPACE', () => this.narrative?.acknowledge());
        this.input.keyboard?.on('keydown-ESC', () => this.narrative?.requestSkip());

        this.culling = new CullingSystem(this);
        this.culling.watch(walls);
        this.culling.watch(this.apartmentSystem.group);

        if (isDebugEnabled()) {
            this.debugOverlay = new DebugOverlay(this);
            // Console handle for inspecting live bodies and depths. Debug-only.
            (window as unknown as { __MW__?: unknown }).__MW__ = { scene: this, config: GameConfig };
        }

        this.state.transitionTo('intro');
        this.bus.emit('gameReady');
    }

    /**
     * Hands control over once the opening fly-over lands.
     *
     * The tutorial only runs on the first district — an arcade player already
     * knows what a fish is by the second one.
     */
    private async beginPlay(): Promise<void> {
        this.state.transitionTo('playing');
        this.cameraDirector?.setEnabled(true);

        // Heavy audio is only needed from here on, so it downloads now rather
        // than holding up the opening.
        this.soundManager?.loadDeferredSounds();

        if (this.district === 1 && this.tutorialEnabled) {
            await runTutorial(this);
            if (this.state.hasEnded()) return;
        }

        const count = this.mode.enemies + this.mode.enemiesPerDistrict * (this.district - 1);
        for (let i = 0; i < count; i++) {
            this.time.delayedCall(GameConfig.ENEMY.SPAWN.DELAY_AFTER_INTRO + i * 4000, () =>
                this.spawnEnemy()
            );
        }
    }

    // ---------------------------------------------------------------- health

    /**
     * Single entry point for every health change. The scene decides when the
     * run ends — previously React did, on a 50ms timer, which raced.
     */
    applyHealth(delta: number): void {
        if (this.state.hasEnded()) return;

        const max = GameConfig.HEALTH.MAX;
        const next = Phaser.Math.Clamp(this.health + delta, 0, max);
        if (next === this.health) return;

        this.health = next;
        this.bus.emit('healthChanged', { health: next, max, delta });

        if (next <= 0) {
            this.beginGameOver('health');
        }
    }

    /**
     * Contact with the machine.
     *
     * A heavy hit rather than a death: the run survives one mistake, which is
     * what makes the telegraph worth reading. Two hits still end it.
     */
    private handleEnemyContact(enemy: Enemy): void {
        if (this.state.hasEnded() || !this.player) return;
        if (!this.player.takeHit(enemy.x, enemy.groundY)) return;

        const hit = GameConfig.HIT;

        this.soundManager?.playDyingSound();
        this.cameraDirector?.shakeFrom(this.player.x, this.player.groundY, hit.SHAKE, hit.SHAKE_MS);
        this.player.flashHit();
        this.barks?.hurt();

        // Hit-stop. A beat of frozen world is what turns a number going down
        // into a hit — everything else here only decorates it.
        this.physics.world.pause();
        this.time.delayedCall(hit.STOP_MS, () => this.physics.world.resume());

        this.applyHealth(this.mode.contactDamage);
    }

    /**
     * Whether the guided opening runs.
     *
     * On by default for exhibition, where most players have never seen the
     * game; off for arcade, where it would be in the way. `?tutorial=0` or
     * `?tutorial=1` overrides either.
     */
    private get tutorialEnabled(): boolean {
        try {
            const override = new URLSearchParams(window.location.search).get('tutorial');
            if (override !== null) return override !== '0' && override !== 'false';
        } catch {
            // No location available; fall through to the mode default.
        }
        return !this.mode.allowTutorialSkip;
    }

    /** True when finishing this district ends the whole run. */
    get isFinalDistrict(): boolean {
        return this.district >= this.mode.districts;
    }

    /**
     * Moves on to the next district instead of ending the run.
     *
     * Counts carry in the registry, which survives a scene restart, so an
     * arcade run totals across all of its districts.
     */
    advanceDistrict(): void {
        this.registry.set('carriedMilk', this.registry.get('milkCount') || 0);
        this.registry.set('carriedFish', this.registry.get('fishCount') || 0);
        this.registry.set('carriedMs', (this.registry.get('carriedMs') || 0) + (Date.now() - this.startTime));

        this.scene.restart({ district: this.district + 1 });
    }

    /**
     * Ends the run when the player has nowhere left to go.
     *
     * Two cases: sealed in by towers with no open neighbour, or simply not
     * moving for a very long time. Both are checked only while the player
     * actually has control — a scripted beat is not a stalemate.
     */
    private checkTrapped(now: number): void {
        const player = this.player;
        if (!player || this.narrativeActive || !this.state.is('playing')) {
            this.stillSince = 0;
            this.enclosedSince = 0;
            this.trapCheckAt = now + GameConfig.TRAPPED.MIN_TRAVEL;
            this.trapAnchor = { x: player?.x ?? 0, y: player?.groundY ?? 0 };
            return;
        }

        const cfg = GameConfig.TRAPPED;
        const here = cellOf(player.x, player.groundY);
        const boxedIn = openNeighbours(this.maze, here).length === 0;

        if (boxedIn) {
            if (this.enclosedSince === 0) this.enclosedSince = now;
            if (now - this.enclosedSince >= cfg.ENCLOSED_MS) this.beginGameOver('trapped');
        } else {
            this.enclosedSince = 0;
        }

        // Sampled on an interval rather than per frame; a single slow frame
        // should not read as the player having stopped.
        if (now < this.trapCheckAt) return;
        this.trapCheckAt = now + 1000;

        const travelled = Phaser.Math.Distance.Between(
            this.trapAnchor.x,
            this.trapAnchor.y,
            player.x,
            player.groundY
        );
        this.trapAnchor = { x: player.x, y: player.groundY };

        if (travelled >= cfg.MIN_TRAVEL) {
            this.stillSince = 0;
            return;
        }

        if (this.stillSince === 0) this.stillSince = now;
        if (now - this.stillSince >= cfg.IDLE_MS) this.beginGameOver('trapped');
    }

    /** Milliseconds until the next rent charge, for the HUD. */
    msUntilRent(): number {
        return Math.max(0, this.nextRentAt - this.time.now);
    }

    /**
     * Rent day.
     *
     * Deliberately loud: a red wash and a lump taken out at once, so it reads
     * as an event that happened *to* the player rather than as more drain.
     */
    chargeRent(): void {
        if (this.state.hasEnded() || this.narrativeActive) return;

        this.nextRentAt = this.time.now + GameConfig.HEALTH.RENT.INTERVAL;
        this.hud?.playRentFlash();
        this.cameraDirector?.shakeFrom(this.player?.x ?? 0, this.player?.y ?? 0, 0.005, 260);
        this.applyHealth(GameConfig.HEALTH.RENT.AMOUNT);
    }

    // ----------------------------------------------------------- pause/resume

    private handlePauseRequest(): void {
        if (!this.state.pause()) return;
        this.scene.pause();
        this.soundManager?.stopAllSounds();
    }

    private handleResumeRequest(): void {
        if (!this.state.resume()) return;
        this.scene.resume();
        this.physics.resume();
        if (this.input.keyboard) this.input.keyboard.enabled = true;
        this.input.enabled = true;
        this.soundManager?.playMainBGM();
    }

    // ----------------------------------------------------------------- enemy

    private spawnEnemy(): void {
        if (this.state.hasEnded() || !this.maze || !this.player) return;

        const enemy = new Enemy(this, this.player, this.worldWidth, this.worldHeight, this.maze);
        this.enemy = enemy;
        this.enemies.push(enemy);
        if (this.enemies.length === 1) {
            enemy.enemySound = this.soundManager?.playEnemySound() || undefined;
        }
        this.enemySpawned = true;

        if (this.walls) {
            // The jump is cooled down inside tryJumpToward, so bumping a wall
            // every frame can no longer spam it.
            this.physics.add.collider(enemy, this.walls, () => {
                enemy.tryJumpToward(this.player?.x ?? enemy.x, this.player?.groundY ?? enemy.groundY);
            });
        }

        if (this.apartmentSystem) {
            this.physics.add.collider(enemy, this.apartmentSystem.group, () => {
                enemy.tryJumpToward(this.player?.x ?? enemy.x, this.player?.groundY ?? enemy.groundY);
            });
        }

        this.physics.add.overlap(this.player, enemy, () => this.handleEnemyContact(enemy));

        // Only the first arrival is announced; the rest just turn up.
        if (this.enemies.length === 1) {
            enemy.announce();
            playEnemyEntrance(this, enemy);
        }
    }

    /** Camera pans to the enemy, holds, then returns to the player. */
    private playEnemyIntro(enemy: Enemy): void {
        const intro = GameConfig.ENEMY.INTRO;
        const camera = this.cameras.main;
        const originalZoom = camera.zoom;

        this.cameraDirector?.setEnabled(false);
        camera.stopFollow();
        camera.setFollowOffset(0, 0);
        camera.pan(enemy.x, enemy.y, intro.PAN_DURATION, 'Power2');
        camera.zoomTo(intro.ZOOM, intro.PAN_DURATION);

        this.time.delayedCall(intro.HOLD, () => {
            if (this.state.hasEnded() || !this.player) return;

            camera.pan(this.player.x, this.player.y, intro.RETURN_DURATION, 'Power2');
            camera.zoomTo(originalZoom, intro.RETURN_DURATION);

            this.time.delayedCall(intro.RETURN_DURATION, () => {
                if (this.state.hasEnded() || !this.player) return;
                camera.startFollow(this.player, true);
                this.cameraDirector?.setEnabled(true);
            });
        });
    }

    // ---------------------------------------------------------------- update

    update() {
        this.debugOverlay?.update();

        if (!this.player || this.state.hasEnded()) return;

        this.controls.update();

        // A scripted beat takes the controls away entirely, so a dropped
        // keypress cannot walk the cat into something while it is talking.
        const idle = new Phaser.Math.Vector2(0, 0);
        const moveIntent = this.narrativeActive ? idle : this.controls.move;

        // Runs during the jump arc too — the goal arrow, depth sort and
        // landing preview all have to keep up mid-air.
        this.player.update(moveIntent, !this.narrativeActive && this.controls.isJumpHeld);

        if (!this.narrativeActive) {
            if (this.controls.consumeJump()) this.player.tryJump(this.controls.move);
            if (this.controls.consumeDash()) this.player.tryDash(this.controls.move);

            for (const enemy of this.enemies) enemy.update();
        } else {
            for (const enemy of this.enemies) enemy.setVelocity(0, 0);
        }

        this.cameraDirector?.update(this.controls.move);

        // After the actors move, so the silhouette matches this frame.
        this.occlusion?.update();

        const now = this.time.now;
        this.barks?.update(now);
        this.sweat?.update(now);
        this.apartmentSystem?.drawWarnings(now);
        this.atmosphere?.setDevelopment(this.apartmentSystem?.development ?? 0);
        // Refitted per frame: the jump's camera punch-out changes the zoom, and a
        // screen overlay sized for zoom 1 stops covering the screen.
        this.vignette?.resize();
        this.culling?.update(now);
        this.hud?.update(now);
        this.statusBar?.update();
        this.narrative?.update(now);
        this.threat?.update(now);
        this.checkTrapped(now);
    }

    // ------------------------------------------------------------- game over

    /**
     * Runs the death animation, then hands the result to React.
     * `reason` says which system killed the player; it shows up in the console
     * so an unexplained death can be traced without guesswork.
     */
    beginGameOver(reason: GameOverReason): void {
        if (!this.state.transitionTo('dying')) return;

        this.endReason = reason;
        console.info(`[GameScene] 게임오버 원인: ${reason} (health=${this.health}, t=${Date.now() - this.startTime}ms)`);

        this.soundManager?.playDyingSound();
        this.soundManager?.stopMainBGM();
        if (this.enemy?.enemySound) {
            this.soundManager?.stopEnemySound(this.enemy.enemySound);
        }

        this.apartmentSystem?.stopSpawning();

        const player = this.player;
        if (!player) {
            this.finishGameOver();
            return;
        }

        const cfg = GameConfig.GAME_OVER;

        // Before anything is tweened. See Player.beginDeath.
        player.beginDeath();
        this.statusBar?.setVisible(false);
        this.occlusion?.hide();
        this.physics.world.resume();

        const groundY = player.groundY;

        // On the ground at the cat's feet, under the cat and over the road.
        // It carried no depth at all before, which put it behind every
        // building in the city and made the hole impossible to see.
        const hole = this.add.graphics().setDepth(sortDepth(groundY) - 1);
        hole.fillStyle(cfg.HOLE_COLOR, 1);
        hole.fillEllipse(0, 0, cfg.HOLE_RADIUS * 2, cfg.HOLE_RADIUS * 2 * cfg.HOLE_SQUASH);
        hole.setPosition(player.x, groundY).setScale(0);

        this.tweens.add({
            targets: hole,
            scale: 1,
            duration: cfg.HOLE_OPEN_MS,
            ease: 'Back.easeOut'
        });

        this.tweens.add({
            targets: player,
            y: groundY - cfg.RISE,
            angle: 180,
            duration: cfg.RISE_DURATION,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: player,
                    y: groundY + cfg.FALL,
                    scale: player.scaleX * cfg.VANISH_SCALE,
                    alpha: 0,
                    duration: cfg.FALL_DURATION,
                    ease: 'Back.easeIn',
                    onComplete: () => {
                        this.tweens.add({
                            targets: hole,
                            scale: 0,
                            duration: cfg.HOLE_CLOSE_MS,
                            ease: 'Sine.easeIn',
                            onComplete: () => hole.destroy()
                        });

                        this.time.delayedCall(cfg.EMIT_DELAY, () => this.finishGameOver());
                    }
                });
            }
        });
    }

    private finishGameOver(): void {
        this.state.transitionTo('gameover');
        this.bus.emit('gameOver', {
            reason: this.endReason,
            milkCount: this.registry.get('milkCount') || 0,
            fishCount: this.registry.get('fishCount') || 0
        });
        this.scene.pause();
    }

    // -------------------------------------------------------------- teardown

    private handleShutdown(): void {
        this.bus?.off('pauseGame', this.handlePauseRequest, this);
        this.bus?.off('resumeGame', this.handleResumeRequest, this);

        this.debugOverlay?.destroy();
        this.debugOverlay = null;

        this.occlusion?.destroy();
        this.occlusion = null;

        this.vignette?.destroy();
        this.vignette = null;

        this.hud?.destroy();
        this.hud = null;

        this.atmosphere?.destroy();
        this.atmosphere = null;

        this.culling?.destroy();
        this.culling = null;

        this.statusBar?.destroy();
        this.statusBar = null;

        this.narrative?.destroy();
        this.narrative = null;

        this.threat?.destroy();
        this.threat = null;

        this.occluders.clear();

        this.apartmentSystem?.destroy();
        this.apartmentSystem = null;
        this.barks?.destroy();
        this.barks = null;

        this.sweat?.destroy();
        this.sweat = null;

        // Only the sounds need stopping — Phaser destroys the sprites with the
        // scene, and by the time this runs its plugins are already torn down.
        for (const enemy of this.enemies) {
            if (enemy.enemySound) this.soundManager?.stopEnemySound(enemy.enemySound);
        }
        this.enemies.length = 0;
        this.enemy = null;
        this.enemySpawned = false;

        this.soundManager?.stopAllSounds();
        this.cameraDirector = null;
    }
}
