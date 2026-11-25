import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { currentDifficulty } from '../core/difficulty';
import { DEPTH, sortDepth } from '../core/depth';
import { TILE_UNIT } from '../core/grid';
import type { Enemy } from '../objects/Enemy';
import type { Player } from '../objects/Player';
import type { GameScene } from '../scenes/GameScene';
import { drawSheets, type Sheet } from './pixelFxArt';

/**
 * Pixel effects for the stacked city (`?stack`): the game's moments acted out
 * in drawn frames, the way a fighting game sells a hit.
 *
 * Picking up milk or a fish squashes it, flashes it white and pops it away in
 * a burst of its own colours. A jump pushes dust flat and kicks it apart; a
 * landing throws a ring. Walking leaves the odd puff, sliding throws frost, a
 * tower landing rolls dust and concrete out from its foot. The black cat's
 * arrival pops a "!" that holds until it gives chase. Being caught is a pinch,
 * a white star held through the hit-stop, a punch of the camera and a skid of
 * dust as the cat is thrown. Home is fireworks over the closing wipe. And the
 * weather: snow on a frozen city, drizzle on nightmare, seen only where the
 * torch is.
 *
 * All of it is look. Nothing here touches a body, a timer or a rule.
 *
 * Every sprite comes from one pool and goes back to it, and the strips are
 * drawn once (see pixelFxArt) at the stacked city's own texel, 32 to a cell.
 */

/** World pixels to a texel: the stacked city's own, 32 to a cell. */
const TEXEL = TILE_UNIT / 32;
/** Most effect sprites alive at once; past this a new one is skipped. */
const CAP = 200;
/** On the road: over the ice, under anything standing. */
const GROUND = DEPTH.GROUND + 2;
/** Over every standing thing, under nightmare's fog: seen only where the city is. */
const AIR = DEPTH.OVERLAY - 21;
/** Over the wipe that closes a district, so the cheer plays out on the black. */
const CHEER = DEPTH.OVERLAY + 2;
/** How far the camera punches in on a hit. */
const PUNCH = 1.06;
const CONFETTI = [0xffd23f, 0x6ee7a8, 0xf07b2c, 0xa8e6e0, 0xffffff];
/** Fireworks round the cat at home: offset x, offset y, delay. */
const FIREWORKS = [
    [0, -50, 0],
    [-80, -10, 110],
    [75, -30, 200],
    [-35, -105, 300],
    [50, -115, 420]
];
const SIDES = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
];

/** Honours a system-level request for less motion. */
const prefersReducedMotion = (): boolean => {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
};

/** Where each animation's strip is pinned, as a share of its height. */
const ORIGIN = new Map<string, number>();
let sheets: Sheet[] | null = null;

/** The strips as textures and animations. Both outlive the scene, so made once a game. */
const makeSheets = (scene: Phaser.Scene): void => {
    sheets ??= drawSheets();
    for (const sheet of sheets) {
        if (!scene.textures.exists(sheet.key)) {
            const canvas = document.createElement('canvas');
            canvas.width = sheet.w * sheet.ms.length;
            canvas.height = sheet.h;
            canvas.getContext('2d')?.putImageData(new ImageData(sheet.data, canvas.width, canvas.height), 0, 0);
            const texture = scene.textures.addCanvas(sheet.key, canvas);
            sheet.ms.forEach((_, i) => texture?.add(i, 0, i * sheet.w, 0, sheet.w, sheet.h));
            texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
        const runs = sheet.runs ?? [{ key: sheet.key, frames: sheet.ms.map((_, i) => i), hold: false }];
        for (const run of runs) {
            ORIGIN.set(run.key, sheet.originY);
            if (scene.anims.exists(run.key)) continue;
            scene.anims.create({
                key: run.key,
                frames: run.frames.map((i) => ({ key: sheet.key, frame: i, duration: sheet.ms[i] })),
                repeat: sheet.loop ? -1 : 0,
                showOnStart: true,
                hideOnComplete: !run.hold
            });
        }
    }
};

/** One pooled sprite, and how it is moving if it is. */
interface Mote {
    sprite: Phaser.GameObjects.Sprite;
    /** Ground position; the sprite is drawn `z` above it. */
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    gravity: number;
    /** Share of speed lost per second. */
    drag: number;
    /** Ms left, for one that ends on a clock rather than with its animation. */
    life: number;
    /** The last ms of `life`, faded out. */
    fade: number;
    moving: boolean;
}

type Motion = Partial<Pick<Mote, 'vx' | 'vy' | 'vz' | 'gravity' | 'drag' | 'life' | 'fade'>>;
/** A mote at rest, copied over one taken from the pool. */
const REST = { z: 0, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, life: 0, fade: 0, moving: false };

type Actor = Phaser.GameObjects.Sprite & { groundY: number; isJumping: boolean };

/** Weather: a flake or a drop, kept in the view as the camera moves. */
interface Flake {
    image: Phaser.GameObjects.Image;
    x: number;
    y: number;
    vx: number;
    vy: number;
    phase: number;
    life: number;
}

const wrap = (value: number, start: number, span: number): number => start + ((((value - start) % span) + span) % span);

export class PixelFx {
    private readonly scene: GameScene;
    private readonly motes: Mote[] = [];
    /** Motes in use. */
    private live = 0;
    /** Where each cat's feet were last frame, and when they may next leave a mark. */
    private readonly feet = new Map<Actor, { x: number; y: number; next: number }>();
    private readonly flakes: Flake[] = [];
    private readonly reducedMotion = prefersReducedMotion();
    private readonly weather: 'snow' | 'drizzle' | null;
    private alerting: { mote: Mote; enemy: Enemy } | null = null;
    /** Moving effects hold still until then: the hit-stop reaches them too. */
    private frozenUntil = 0;
    private cheered = false;

    constructor(scene: GameScene) {
        this.scene = scene;
        makeSheets(scene);

        this.weather = this.reducedMotion ? null : scene.ice.size > 0 ? 'snow' : currentDifficulty().dread ? 'drizzle' : null;
        this.makeWeather();

        // The scene drops every collect listener when it shuts down.
        scene.events.on('collectMilk', (item?: Phaser.GameObjects.Sprite) => this.pickup(item, 'fx-spark-milk'));
        scene.events.on('collectFish', (item?: Phaser.GameObjects.Sprite) => this.pickup(item, 'fx-spark-fish'));
        // Its own clock rather than the scene's update, which stops when a run
        // ends: the cheer at home plays after that.
        scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this));
    }

    // ------------------------------------------------------------------ pool

    /** A pooled sprite at a spot, reset and not yet shown. Null when the pool is spent. */
    private take(x: number, y: number, depth: number): Mote | null {
        let mote = this.motes.find((m) => !m.sprite.active);
        if (!mote) {
            if (this.motes.length >= CAP) return null;
            const sprite = this.scene.add.sprite(x, y, 'fx-step');
            const made: Mote = { sprite, x, y, ...REST };
            sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (played: Phaser.Animations.Animation) => {
                if (played.hideOnComplete) this.free(made);
            });
            this.motes.push(made);
            mote = made;
        }
        this.live++;
        Object.assign(mote, REST);
        mote.x = x;
        mote.y = y;
        const { sprite } = mote;
        sprite.setActive(true).setVisible(false).setPosition(x, y).setScale(TEXEL).setAlpha(1).setFlipX(false).clearTint();
        if (sprite.depth !== depth) sprite.setDepth(depth);
        return mote;
    }

    /** A pooled sprite playing `anim` at a spot (after `delay` ms). */
    private spawn(anim: string, x: number, y: number, depth: number, delay = 0): Mote | null {
        const mote = this.take(x, y, depth);
        if (!mote) return null;
        mote.sprite.setOrigin(0.5, ORIGIN.get(anim) ?? 0.5);
        if (delay > 0) mote.sprite.playAfterDelay(anim, delay);
        else mote.sprite.play(anim);
        return mote;
    }

    /** Sets a spawned effect moving. */
    private fling(mote: Mote | null, motion: Motion): Mote | null {
        if (mote) Object.assign(mote, motion, { moving: true });
        return mote;
    }

    private free(mote: Mote): void {
        if (mote.sprite.active) this.live--;
        mote.moving = false;
        mote.sprite.anims.stop();
        mote.sprite.setActive(false).setVisible(false);
    }

    // --------------------------------------------------------------- moments

    /**
     * The item squashes (the wind-up), stretches white for a beat (the
     * contact), then is thrown up and away in a burst of its colours.
     */
    private pickup(item: Phaser.GameObjects.Sprite | undefined, spark: string): void {
        if (!item) return;
        const depth = sortDepth(item.y + item.displayHeight / 2) + 1;
        // Over the item's ghost, which would otherwise cover the burst's heart.
        this.spawn(spark, item.x, item.y, depth + 1, 50);

        const ghost = this.take(item.x, item.y, depth);
        if (!ghost) return;
        const { sprite } = ghost;
        const scale = item.scaleX;
        sprite.setTexture(item.texture.key, item.frame.name).setOrigin(item.originX, item.originY).setScale(scale).setVisible(true);
        this.scene.tweens.chain({
            targets: sprite,
            tweens: [
                { scaleX: scale * 1.3, scaleY: scale * 0.7, duration: 50, ease: 'Quad.easeOut' },
                {
                    scaleX: scale * 0.85,
                    scaleY: scale * 1.4,
                    y: item.y - 8,
                    duration: 40,
                    ease: 'Quad.easeOut',
                    onStart: () => sprite.setTintFill(0xffffff)
                },
                {
                    scaleX: scale * 1.15,
                    scaleY: scale * 1.15,
                    y: item.y - 34,
                    alpha: 0,
                    delay: 60,
                    duration: 240,
                    ease: 'Quad.easeOut',
                    onStart: () => sprite.clearTint()
                }
            ],
            onComplete: () => this.free(ghost)
        });
    }

    /** Dust pressed flat at the feet and kicked apart. */
    takeOff(actor: Actor): void {
        this.spawn('fx-kick', actor.x, actor.groundY, GROUND);
    }

    /** A ring of dust thrown out from where a cat comes down. */
    land(actor: Actor): void {
        this.spawn('fx-ring', actor.x, actor.groundY, GROUND);
    }

    /** The black cat has arrived: a "!" over it until it gives chase. */
    alert(enemy: Enemy): void {
        const mote = this.spawn('fx-alert', enemy.x, enemy.y, AIR);
        if (mote) this.alerting = { mote, enemy };
    }

    /**
     * Caught. A star at the point of contact whose white frame is held as long
     * as the scene's hit-stop, the camera punched in through it and let back
     * out, and every moving effect held still for the beat as well. The skid
     * that follows is the cat's feet, in `step`.
     */
    hit(player: Player, enemy: Enemy): void {
        const x = (player.x + enemy.x) / 2;
        const y = (player.groundY + enemy.groundY) / 2 - player.displayHeight * 0.5;
        this.spawn('fx-impact', x, y, AIR);
        this.frozenUntil = this.scene.time.now + GameConfig.HIT.STOP_MS;

        const camera = this.scene.cameras.main;
        if (this.reducedMotion || player.isJumping || camera.zoomEffect.isRunning) return;
        const zoom = camera.zoom;
        camera.zoomTo(zoom * PUNCH, GameConfig.HIT.STOP_MS, 'Quad.easeOut');
        camera.once(Phaser.Cameras.Scene2D.Events.ZOOM_COMPLETE, () => camera.zoomTo(zoom, 220, 'Quad.easeOut'));
    }

    /**
     * A block of towers has come down: dust rolls out from every side of it
     * that faces a street, with lumps of concrete thrown ahead of it. Adds to
     * the dust the towers land in rather than replacing it.
     */
    blockLanded(cells: { gx: number; gy: number }[]): void {
        const view = this.scene.cameras.main.worldView;
        const pad = TILE_UNIT * 2;
        const block = new Set(cells.map(({ gx, gy }) => `${gx},${gy}`));
        for (const { gx, gy } of cells) {
            for (const [dx, dy] of SIDES) {
                if (block.has(`${gx + dx},${gy + dy}`)) continue;
                const along = Phaser.Math.FloatBetween(-0.35, 0.35) * TILE_UNIT;
                const x = gx * TILE_UNIT + (dx * TILE_UNIT) / 2 + (dy ? along : 0);
                const y = gy * TILE_UNIT + (dy * TILE_UNIT) / 2 + (dx ? along : 0);
                if (x < view.x - pad || x > view.right + pad || y < view.y - pad || y > view.bottom + pad) continue;

                const speed = Phaser.Math.Between(70, 120);
                const puff = this.spawn('fx-billow', x, y, sortDepth(y) + 2, Phaser.Math.Between(0, 90));
                this.fling(puff, { vx: dx * speed + (dy ? Phaser.Math.Between(-20, 20) : 0), vy: dy * speed * 0.8, drag: 2.5 });
                if (Math.random() < 0.5) continue;

                const rock = this.fling(this.spawn('fx-chunk', x, y, sortDepth(y) + 2), {
                    vx: dx * Phaser.Math.Between(80, 170) + Phaser.Math.Between(-40, 40),
                    vy: dy * Phaser.Math.Between(60, 130) + Phaser.Math.Between(-30, 30),
                    vz: Phaser.Math.Between(140, 240),
                    gravity: 650,
                    drag: 0.5,
                    life: 1000,
                    fade: 300
                });
                rock?.sprite.setFlipX(Math.random() < 0.5);
            }
        }
    }

    /** Home: fireworks and confetti round the cat, over the wipe that ends the district. */
    private cheer(): void {
        this.cheered = true;
        const player = this.scene.player;
        if (!player) return;
        const x = player.x;
        const y = player.y - player.displayHeight / 2;
        // Home is often by the city's edge, where the camera stops short of the cat.
        const view = this.scene.cameras.main.worldView;
        const inside = (v: number, from: number, to: number) => Phaser.Math.Clamp(v, from + 40, to - 40);
        for (const [dx, dy, delay] of FIREWORKS) {
            this.spawn('fx-burst', inside(x + dx, view.x, view.right), inside(y + dy, view.y, view.bottom), CHEER, delay);
        }
        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Phaser.Math.Between(80, 230);
            const bit = this.fling(this.spawn('fx-confetti', x, y, CHEER), {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed * 0.6,
                vz: Phaser.Math.Between(160, 340),
                gravity: 420,
                drag: 1.2,
                life: Phaser.Math.Between(1100, 1700),
                fade: 400
            });
            bit?.sprite.setTint(CONFETTI[i % CONFETTI.length]).setFlipX(i % 2 === 0);
        }
    }

    // ---------------------------------------------------------------- update

    private update(_time: number, delta: number): void {
        const now = this.scene.time.now;
        const dt = Math.min(delta, 50) / 1000;

        if (!this.cheered && this.scene.state.is('clearing', 'victory')) this.cheer();
        if (now >= this.frozenUntil) this.move(dt);
        this.holdAlert(now);

        const player = this.scene.player;
        if (player && this.scene.state.is('playing')) {
            this.step(player, now, dt, player.isRecovering);
            for (const enemy of this.scene.enemies) this.step(enemy, now, dt, false);
        }
        this.blow(dt, now);
    }

    private move(dt: number): void {
        for (const m of this.motes) {
            if (!m.moving || !m.sprite.active) continue;
            const slow = Math.max(0, 1 - m.drag * dt);
            m.vx *= slow;
            m.vy *= slow;
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            if (m.gravity) {
                m.vz -= m.gravity * dt;
                m.z += m.vz * dt;
                if (m.z < 0) {
                    // Down, with a small bounce and a scrape along the ground.
                    m.z = 0;
                    m.vz *= -0.3;
                    m.vx *= 0.5;
                    m.vy *= 0.5;
                }
            }
            m.sprite.setPosition(m.x, m.y - m.z);
            if (m.life <= 0) continue;
            m.life -= dt * 1000;
            if (m.life <= 0) this.free(m);
            else if (m.life < m.fade) m.sprite.setAlpha(m.life / m.fade);
        }
    }

    /** Keeps the "!" over the black cat, bobbing a texel, and pops it when the chase starts. */
    private holdAlert(now: number): void {
        if (!this.alerting) return;
        const { mote, enemy } = this.alerting;
        if (!mote.sprite.active) {
            this.alerting = null;
            return;
        }
        mote.sprite.setPosition(enemy.x, enemy.y - enemy.displayHeight * 0.9 - (Math.floor(now / 160) % 2) * TEXEL);
        if (enemy.active && enemy.awareness === 'telegraph') return;
        mote.sprite.play('fx-alert-out');
        this.alerting = null;
    }

    /**
     * Marks under a cat's feet, from how far they moved since last frame:
     * frost on ice, a puff now and then on the road, and a run of puffs while
     * the cat is thrown (a hit, a shove), which is the skid of the knockback.
     */
    private step(actor: Actor, now: number, dt: number, skid: boolean): void {
        let track = this.feet.get(actor);
        if (!track) {
            track = { x: actor.x, y: actor.groundY, next: 0 };
            this.feet.set(actor, track);
        }
        const dx = actor.x - track.x;
        const dy = actor.groundY - track.y;
        track.x = actor.x;
        track.y = actor.groundY;

        const moved = Math.hypot(dx, dy);
        const speed = moved / Math.max(dt, 0.001);
        // Still, in the air, or put somewhere rather than walked there.
        if (!actor.active || actor.isJumping || speed < 40 || speed > 2000 || now < track.next) return;

        const x = actor.x;
        const y = actor.groundY;
        if (this.scene.isIce(Math.round(x / TILE_UNIT), Math.round(y / TILE_UNIT))) {
            this.spawn('fx-frost', x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-4, 4), GROUND);
            track.next = now + 55;
            return;
        }

        // Behind the feet, drifting back the way the cat came.
        const ux = dx / moved;
        const uy = dy / moved;
        const puff = this.spawn('fx-step', x - ux * 10, y - uy * 6, GROUND);
        if (skid) this.fling(puff, { vx: -ux * 40, vy: -uy * 30, drag: 4 });
        track.next = now + (skid ? 45 : Phaser.Math.Between(230, 330));
    }

    // --------------------------------------------------------------- weather

    private makeWeather(): void {
        if (!this.weather) return;
        const snow = this.weather === 'snow';
        for (let i = 0; i < (snow ? 70 : 64); i++) {
            // Three layers, far to near: the nearer, the bigger, faster and brighter.
            const layer = i % 3;
            const image = this.scene.add
                .image(0, 0, snow ? 'fx-flake' : 'fx-drop', snow ? layer : layer === 2 ? 0 : 1)
                .setScale(TEXEL)
                .setDepth(AIR)
                .setAlpha(snow ? 0.55 + layer * 0.15 : 0.6 + layer * 0.15);
            this.flakes.push({
                image,
                x: Number.NaN,
                y: Number.NaN,
                vx: snow ? 10 + layer * 8 : -50 - layer * 10,
                vy: snow ? 16 + layer * 14 : 430 + layer * 60,
                phase: Math.random() * Math.PI * 2,
                life: 0
            });
        }
    }

    /**
     * Snow drifts and sways, wrapping round the view so it never runs out;
     * drizzle falls in short streaks that splash where they land. World-space,
     * so it passes by as the camera moves, and under nightmare's fog, so in the
     * dark it is only seen in the torch.
     */
    private blow(dt: number, now: number): void {
        if (!this.weather) return;
        const view = this.scene.cameras.main.worldView;
        const pad = 24;
        const left = view.x - pad;
        const top = view.y - pad;
        const width = view.width + pad * 2;
        const height = view.height + pad * 2;
        const snow = this.weather === 'snow';

        for (const f of this.flakes) {
            if (Number.isNaN(f.x)) {
                f.x = left + Math.random() * width;
                f.y = top + Math.random() * height;
                f.life = Math.random() * 0.4;
            }
            if (snow) {
                f.x = wrap(f.x + (f.vx + Math.sin(now / 700 + f.phase) * 14) * dt, left, width);
                f.y = wrap(f.y + f.vy * dt, top, height);
            } else {
                f.life -= dt;
                if (f.life <= 0) {
                    // Weather never takes the last of the pool from a moment.
                    if (this.live < CAP - 60 && Math.random() < 0.6) this.spawn('fx-splash', f.x, f.y, GROUND);
                    f.x = left + Math.random() * width;
                    f.y = top + Math.random() * height;
                    f.life = 0.2 + Math.random() * 0.35;
                }
                f.x += f.vx * dt;
                f.y += f.vy * dt;
            }
            f.image.setPosition(f.x, f.y);
        }
    }
}
