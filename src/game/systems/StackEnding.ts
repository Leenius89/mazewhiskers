import Phaser from 'phaser';
import { DEPTH, sortDepth } from '../core/depth';
import { TILE_UNIT, isOpen } from '../core/grid';
import { pinToScreen, viewportOf } from '../core/screenSpace';
import type { GameScene } from '../scenes/GameScene';
import type { Flashlight } from './Flashlight';
import type { SpriteStack } from './SpriteStack';
import { CONTACT_ALPHA, contactShadow } from './StackGround';
import type { StackGround } from './StackGround';
import { itemFigure } from './TokenVolume';
import type { WorldFog } from './WorldFog';

/**
 * Trial (`?stack`): the end of a run, staged in the stacked city.
 *
 * 1. Home. On nightmare the torch goes out, then light pours out of home and
 *    drives the dark back; under its flash the nightmare ends (fog, torch,
 *    violet, drizzle, lit windows) and the city is an ordinary one again.
 *    Then, on every setting: the black cats turn their backs and go, the cat
 *    goes in at the door and home's windows come on, fireworks, and the
 *    picture closes in on home.
 * 2. While the closing lines are read, the camera rises off the city until the
 *    whole way the cat came is in view, drawn in light over the streets.
 * 3. Then down again to home for the results: the cat at the door with a fish
 *    in its mouth, what it ate piled beside it.
 *
 * Nothing here touches the run or its record, and the lines are the same lines.
 */

export interface EndingParts {
    stacks: SpriteStack;
    ground: StackGround;
    flashlight: Flashlight | null;
    fog: WorldFog | null;
    /** Off the screen: what only play needs (the HUD, the health bar, the red wash, the silhouette, the barks). */
    quiet: () => void;
    /** Nightmare's look ended: the fog, the torch, the violet, the closed-in frame. */
    wake: () => void;
    /** Culling kept up with a camera the ending moves. */
    cull: () => void;
}

type Point = { x: number; y: number };

const WARM = 0xffc86e;
const FLASH = 0xffe9c2;
const TRAIL_CORE = 0xfff1c8;
/** World pixels to a texel of the ending's own pixel art: the ground's. */
const TEXEL = TILE_UNIT / 32;
/** The cat's way is noted each time it has gone this far. */
const STRIDE = TILE_UNIT / 4;
/** At most this many of each kind are piled at home; the panel has the count. */
const PILE_MAX = 10;
/** Results beside the panel, not under it, on a screen this wide (as Victory.tsx). */
const WIDE = 960;
/** Texels across the ending's baked light pictures. */
const PICTURE = 64;

/** A pile's places, bottom row first: across in item widths from its middle, and the row. */
export const pileOf = (n: number): { x: number; row: number }[] => {
    let base = 0;
    while ((base * (base + 1)) / 2 < n) base++;
    const spots: { x: number; row: number }[] = [];
    for (let row = 0; spots.length < n; row++) {
        const across = base - row;
        for (let i = 0; i < across && spots.length < n; i++) spots.push({ x: i - (across - 1) / 2, row });
    }
    return spots;
};

const wait = (scene: Phaser.Scene, ms: number): Promise<void> =>
    new Promise((resolve) => scene.time.delayedCall(ms, () => resolve()));

/** A 0-to-1 tween; resolves when it finishes, never if it is stopped. */
const counter = (
    scene: Phaser.Scene,
    duration: number,
    ease: string,
    onUpdate: (v: number) => void
): { tween: Phaser.Tweens.Tween; done: Promise<void> } => {
    let tween!: Phaser.Tweens.Tween;
    const done = new Promise<void>((resolve) => {
        tween = scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration,
            ease,
            onUpdate: (t) => onUpdate(t.getValue() ?? 0),
            onComplete: () => {
                onUpdate(1);
                resolve();
            }
        });
    });
    return { tween, done };
};

/**
 * A round picture in stepped levels, for light (alpha falling from the middle)
 * or for shade (alpha rising past `clear` of the radius, full at `full`).
 */
const bakeRound = (scene: Phaser.Scene, key: string, colour: number, alpha: (d: number) => number): string => {
    if (scene.textures.exists(key)) return key;
    const canvas = document.createElement('canvas');
    canvas.width = PICTURE;
    canvas.height = PICTURE;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const image = ctx.createImageData(PICTURE, PICTURE);
    const { r, g, b } = Phaser.Display.Color.IntegerToRGB(colour);
    for (let y = 0; y < PICTURE; y++) {
        for (let x = 0; x < PICTURE; x++) {
            const d = Math.hypot(x + 0.5 - PICTURE / 2, y + 0.5 - PICTURE / 2) / (PICTURE / 2);
            const level = Math.round(Phaser.Math.Clamp(alpha(d), 0, 1) * 6) / 6;
            image.data.set([r, g, b, Math.round(255 * level)], (y * PICTURE + x) * 4);
        }
    }
    ctx.putImageData(image, 0, 0);
    scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return key;
};
const glowOf = (scene: Phaser.Scene): string =>
    bakeRound(scene, 'ending-glow', WARM, (d) => 0.85 * Math.pow(Math.max(0, 1 - d), 1.6));
const spotlightOf = (scene: Phaser.Scene): string =>
    bakeRound(scene, 'ending-spotlight', 0x05060c, (d) => 0.6 * Phaser.Math.Clamp((d - 0.22) / 0.3, 0, 1));

/** A circle in rows of whole texels, for the light from home to cut out of the dark. */
const stepCircle = (g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void => {
    const row = TEXEL * 2;
    g.clear().fillStyle(0xffffff);
    for (let dy = -r; dy < r; dy += row) {
        const half = Math.floor(Math.sqrt(Math.max(0, r * r - (dy + row / 2) ** 2)) / row) * row;
        if (half > 0) g.fillRect(x - half, y + dy, half * 2, row);
    }
};

export class StackEnding {
    private readonly scene: GameScene;
    private readonly parts: EndingParts;
    /** Where the cat went, noted as it went. */
    private readonly route: Point[] = [];
    /** From home on: the scene's update has stopped, so this keeps the city drawn. */
    private running = false;
    private playZoom = 1;
    private cameraMove: Phaser.Tweens.Tween | null = null;
    private curtain: Phaser.GameObjects.Graphics | null = null;
    private trail: Phaser.GameObjects.Graphics | null = null;
    private trailDrawn = 0;
    private trailLast = '';
    /** Half the trail's bright core, sized for the zoom it is seen at. */
    private trailHalf = TEXEL * 3;
    private halo: Phaser.GameObjects.Image | null = null;
    private mouthful: Phaser.GameObjects.Image | null = null;

    constructor(scene: GameScene, parts: EndingParts) {
        this.scene = scene;
        this.parts = parts;
    }

    /** Called by the scene every frame, in play and after it. */
    update(): void {
        const player = this.scene.player;
        if (!player) return;
        if (!this.running) {
            if (this.scene.state.is('playing')) this.note(player.x, player.groundY);
            return;
        }

        player.standForEnding();
        this.parts.cull();
        this.parts.stacks.update();
        this.parts.ground.update();

        const cam = this.scene.cameras.main;
        // Home stays the brightest thing in view however far out the camera goes.
        this.halo?.setScale(((TILE_UNIT * 3.4) / PICTURE) * Math.max(1, Math.pow(this.playZoom / cam.zoom, 0.7)));
        if (this.mouthful) {
            const facing = player.flipX ? -1 : 1;
            this.mouthful
                .setPosition(player.x + facing * player.displayWidth * 0.3, player.groundY - player.displayHeight * 0.4)
                .setFlipX(player.flipX)
                .setDepth(player.depth + 0.01);
        }
    }

    private note(x: number, y: number): void {
        const last = this.route[this.route.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) >= STRIDE) this.route.push({ x, y });
    }

    // ---------------------------------------------------------------- 1. home

    /** From touching home to the picture closed on the cat. */
    async homecoming(): Promise<void> {
        const { scene } = this;
        const player = scene.player;
        const home = scene.goal;
        if (!player || !home) return;

        const cam = scene.cameras.main;
        this.running = true;
        this.playZoom = cam.zoom;
        this.note(player.x, player.groundY);
        this.parts.quiet();
        cam.stopFollow();

        const door = { x: home.x, y: home.y + home.displayHeight * (1 - home.originY) };
        if (this.parts.flashlight && this.parts.fog) await this.lightFromHome(door);

        // The black cats give up and go, and the cat goes in.
        scene.enemies.forEach((enemy) => enemy.retreat(home.x, 1400));
        const look = this.moveCamera(door.x, door.y - TILE_UNIT * 0.5, this.playZoom * 1.3, 1400, 'Sine.easeInOut');
        await this.goIn(player, door);
        await look;

        await this.lightsOn(home, door);
        scene.fx?.cheer();
        await wait(scene, 1700);
        await this.iris(door.x, door.y - TILE_UNIT * 0.4);

        // Unseen, in the dark: out at the door, where the results are staged,
        // and what was left uneaten cleared from the streets, so the only fish
        // and milk in view are the cat's.
        const spot = this.doorstep(home);
        player.setPosition(spot.x, spot.y).setFlipX(false).setAlpha(1);
        player.groundY = spot.y;
        [scene.fishes, scene.milks].forEach((group) =>
            group?.getChildren().forEach((item) => (item as Phaser.GameObjects.Sprite).setVisible(false))
        );
    }

    /** The cat walks to the door and in, fading as it goes through. */
    private async goIn(player: Phaser.GameObjects.Sprite, door: Point): Promise<void> {
        const from = { x: player.x, y: player.y };
        const to = { x: door.x, y: door.y - TILE_UNIT * 0.15 };
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        const body = player.body as Phaser.Physics.Arcade.Body;
        player.setFlipX(to.x < from.x);
        player.anims.play('walk', true);
        // Physics is stopped: the walk is a tween, and this only what its pose reads.
        body.velocity.set(((to.x - from.x) / Math.max(1, distance)) * 100, ((to.y - from.y) / Math.max(1, distance)) * 100);
        await counter(this.scene, Phaser.Math.Clamp(distance * 7, 400, 1100), 'Linear', (v) => {
            player.setPosition(Phaser.Math.Linear(from.x, to.x, v), Phaser.Math.Linear(from.y, to.y, v));
            player.setAlpha(v < 0.55 ? 1 : 1 - (v - 0.55) / 0.45);
        }).done;
        body.velocity.set(0, 0);
        player.anims.stop();
    }

    /** Nightmare: the torch goes out, and the light from home drives the dark back. */
    private async lightFromHome(door: Point): Promise<void> {
        const { scene } = this;
        const cam = scene.cameras.main;
        await wait(scene, 250);
        this.parts.flashlight?.out();
        await wait(scene, 700);

        const shape = scene.make.graphics({}, false);
        this.parts.fog?.lightWith(shape.createGeometryMask().setInvertAlpha(true));
        const glow = scene.add
            .image(door.x, door.y, glowOf(scene))
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(DEPTH.OVERLAY - 17)
            .setScale(0);
        const view = cam.worldView;
        const far =
            Math.max(
                Math.hypot(view.x - door.x, view.y - door.y),
                Math.hypot(view.right - door.x, view.y - door.y),
                Math.hypot(view.x - door.x, view.bottom - door.y),
                Math.hypot(view.right - door.x, view.bottom - door.y)
            ) + TILE_UNIT;
        await counter(scene, 2000, 'Quad.easeIn', (v) => {
            stepCircle(shape, door.x, door.y, far * v);
            glow.setScale((far * v * 2.4) / PICTURE).setAlpha(1 - v * 0.4);
        }).done;

        const flash = scene.add
            .rectangle(0, 0, cam.width, cam.height, FLASH)
            .setOrigin(0)
            .setAlpha(0)
            .setDepth(DEPTH.OVERLAY + 25);
        pinToScreen(flash, viewportOf(cam));
        await counter(scene, 260, 'Linear', (v) => flash.setAlpha(0.92 * v)).done;

        // Under the flash, and once: every drawing is cut again here.
        this.parts.wake();
        this.parts.stacks.setWindows(0);
        this.parts.ground.setSun(true);
        scene.fx?.clearSkies();
        glow.destroy();
        shape.destroy();

        await wait(scene, 380);
        await counter(scene, 1000, 'Sine.easeOut', (v) => flash.setAlpha(0.92 * (1 - v))).done;
        flash.destroy();
    }

    /** Home's windows come on (a flicker first), and a warm light round it. */
    private async lightsOn(home: Phaser.GameObjects.Sprite, door: Point): Promise<void> {
        const { scene } = this;
        const stacks = this.parts.stacks;
        stacks.setWindows(1, home);
        await wait(scene, 90);
        stacks.setWindows(0, home);
        await wait(scene, 120);
        stacks.setWindows(1, home);

        this.halo = scene.add
            .image(door.x, door.y - TILE_UNIT * 0.4, glowOf(scene))
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(DEPTH.OVERLAY - 40)
            .setAlpha(0);
        await counter(scene, 500, 'Sine.easeOut', (v) => this.halo?.setAlpha(0.5 * v)).done;
    }

    /** The picture closes in, in squares, on (`x`, `y`), holds a moment round it, then shuts. */
    private async iris(x: number, y: number): Promise<void> {
        const { scene } = this;
        const cam = scene.cameras.main;
        const g = (this.curtain = scene.add.graphics().setDepth(DEPTH.OVERLAY + 30));
        const block = 20;
        const sx = (x - cam.worldView.x) * cam.zoom;
        const sy = (y - cam.worldView.y) * cam.zoom;
        const far = Math.hypot(Math.max(sx, cam.width - sx), Math.max(sy, cam.height - sy));
        const near = Math.min(cam.width, cam.height) * 0.13;
        const draw = (r: number): void => {
            pinToScreen(g, viewportOf(cam));
            g.clear().fillStyle(0x000000, 1);
            for (let by = 0; by < cam.height; by += block) {
                for (let bx = 0; bx < cam.width; bx += block) {
                    if (Math.hypot(bx + block / 2 - sx, by + block / 2 - sy) > r) g.fillRect(bx, by, block, block);
                }
            }
        };
        await counter(scene, 950, 'Sine.easeIn', (v) => draw(Phaser.Math.Linear(far, near, v))).done;
        await wait(scene, 700);
        await counter(scene, 380, 'Sine.easeIn', (v) => draw(near * (1 - v))).done;
    }

    /** Where the cat stands for the results: in front of home if that is a street, else beside or behind it. */
    private doorstep(home: Phaser.GameObjects.Sprite): Point {
        const gx = Math.round(home.x / TILE_UNIT);
        const gy = Math.round(home.y / TILE_UNIT);
        const maze = this.scene.maze;
        for (const [dx, dy] of [
            [0, 1],
            [1, 0],
            [-1, 0],
            [0, -1]
        ]) {
            const x = gx + dx;
            const y = gy + dy;
            if (maze && isOpen(maze, x, y) && !this.scene.apartmentSystem?.isCellBuilt(x, y)) {
                return { x: x * TILE_UNIT, y: y * TILE_UNIT + TILE_UNIT * 0.2 };
            }
        }
        const player = this.scene.player;
        return { x: player?.x ?? home.x, y: player?.groundY ?? home.y };
    }

    // ------------------------------------------------------------- 2. the city

    /**
     * Up and away until the whole way the cat came is in view (never further
     * out than the whole city), the way drawn in light as it goes.
     */
    async pullBack(ms: number): Promise<void> {
        const { scene } = this;
        const cam = scene.cameras.main;
        const maze = scene.maze;
        this.curtain?.destroy();
        this.curtain = null;
        if (!maze) return;

        cam.removeBounds();
        const pad = TILE_UNIT * 2;
        const xs = this.route.map((p) => p.x);
        const ys = this.route.map((p) => p.y);
        const left = Math.min(...xs) - pad;
        const top = Math.min(...ys) - pad;
        const width = Math.max(...xs) + pad - left;
        const height = Math.max(...ys) + pad - top;
        const whole = (maze.length * TILE_UNIT) / 0.9;
        const zoom = Math.max(Math.min(cam.width / width, cam.height / height) * 0.9, Math.min(cam.width, cam.height) / whole);
        // A few screen pixels wide however far out.
        this.trailHalf = Math.max(TEXEL * 3, Math.round(2.5 / zoom / TEXEL) * TEXEL);

        this.trail = scene.add.graphics().setDepth(DEPTH.GROUND + 3).setBlendMode(Phaser.BlendModes.ADD);
        const lengths = [0];
        for (let i = 1; i < this.route.length; i++) {
            const a = this.route[i - 1];
            const b = this.route[i];
            lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
        }
        const total = lengths[lengths.length - 1];

        const trail = counter(scene, ms * 0.8, 'Sine.easeInOut', (v) => this.drawTrail(lengths, total * v));
        await Promise.all([this.moveCamera(left + width / 2, top + height / 2, zoom, ms, 'Sine.easeInOut'), trail.done]);
    }

    /** The route up to `upTo` along it, in warm texel squares: a glow and a bright core. */
    private drawTrail(lengths: number[], upTo: number): void {
        const g = this.trail;
        if (!g) return;
        const step = Math.max(TEXEL * 3, this.trailHalf);
        for (let s = this.trailDrawn; s <= upTo; s += step) {
            let i = 1;
            while (i < lengths.length - 1 && lengths[i] < s) i++;
            const a = this.route[i - 1];
            const b = this.route[i];
            if (!a || !b) break;
            const t = (s - lengths[i - 1]) / Math.max(1, lengths[i] - lengths[i - 1]);
            const x = Math.round(Phaser.Math.Linear(a.x, b.x, t) / TEXEL) * TEXEL;
            const y = Math.round(Phaser.Math.Linear(a.y, b.y, t) / TEXEL) * TEXEL;
            const at = `${x},${y}`;
            if (at === this.trailLast) continue;
            this.trailLast = at;
            const core = this.trailHalf;
            const glow = core * 2.6;
            g.fillStyle(WARM, 0.28).fillRect(x - glow, y - glow, glow * 2, glow * 2);
            g.fillStyle(TRAIL_CORE, 1).fillRect(x - core, y - core, core * 2, core * 2);
        }
        this.trailDrawn = Math.max(this.trailDrawn, upTo);
    }

    // ----------------------------------------------------------- 3. results

    /** Down to home: the cat with a fish in its mouth, and what it ate piled up beside it. */
    async tableau(fish: number, milk: number): Promise<void> {
        const { scene } = this;
        const player = scene.player;
        if (!player) return;
        const cam = scene.cameras.main;

        if (this.trail) {
            const trail = this.trail;
            counter(scene, 900, 'Sine.easeIn', (v) => trail.setAlpha(1 - v));
        }

        // Clear of the panel (see Victory.tsx): on a wide screen a fifth of the
        // way across, the panel to its right; on a narrow one near the top and
        // filling the width, the panel below it.
        const wide = window.innerWidth >= WIDE;
        const zoom = wide ? this.playZoom * 1.25 : Math.max(this.playZoom * 1.3, cam.width / (TILE_UNIT * 4.4));
        const x = player.x + (wide ? (cam.width / zoom) * 0.3 : 0);
        const y = player.groundY - TILE_UNIT * 0.55 + (wide ? 0 : (cam.height / zoom) * 0.34);

        const spotlight = scene.add
            .image(player.x, player.groundY - TILE_UNIT * 0.3, spotlightOf(scene))
            .setScale((TILE_UNIT * 18) / PICTURE)
            .setDepth(DEPTH.OVERLAY - 30)
            .setAlpha(0);
        await this.moveCamera(x, y, zoom, 2000, 'Sine.easeInOut');
        await counter(scene, 600, 'Sine.easeOut', (v) => spotlight.setAlpha(v)).done;

        const fishKey = itemFigure(scene, 'fish1');
        this.mouthful = scene.add
            .image(0, 0, fishKey)
            .setOrigin(0.5, 0.5)
            .setAngle(90)
            .setScale((player.displayWidth * 0.42) / scene.textures.getFrame(fishKey).width);
        this.update();

        const drops = [
            ...this.pile(fishKey, Math.min(fish, PILE_MAX), player.x, player.groundY, TILE_UNIT * 0.36, -1),
            ...this.pile(itemFigure(scene, 'milk'), Math.min(milk, PILE_MAX), player.x, player.groundY, TILE_UNIT * 0.3, 1)
        ];
        // Fish and milk landing in turn, bottom rows first.
        drops.sort((a, b) => a.order - b.order);
        await Promise.all(
            drops.map(({ image, restY }, i) =>
                wait(scene, i * 85).then(() => {
                    const from = restY - TILE_UNIT;
                    return counter(scene, 420, 'Bounce.easeOut', (v) =>
                        image.setY(Phaser.Math.Linear(from, restY, v)).setAlpha(Math.min(1, v * 3))
                    ).done;
                })
            )
        );
        await wait(scene, 450);
    }

    /**
     * `n` figures of `key`, each `width` across, piled on the ground beside the
     * cat at `catX`, `y`: to its left (`side` -1) or right. Not shown yet.
     */
    private pile(key: string, n: number, catX: number, y: number, width: number, side: -1 | 1) {
        const { scene } = this;
        const frame = scene.textures.getFrame(key);
        const scale = width / frame.width;
        const rise = frame.height * scale * 0.55;
        const spots = pileOf(n);
        const base = spots.filter((s) => s.row === 0).length * width;
        const x = catX + side * (TILE_UNIT * 0.42 + base / 2);
        if (n > 0) contactShadow(scene, base * 1.1).setPosition(x, y).setAlpha(CONTACT_ALPHA);
        return spots.map(({ x: across, row }, i) => ({
            image: scene.add
                .image(x + across * width, y - row * rise, key)
                .setOrigin(0.5, 1)
                .setScale(scale)
                .setAlpha(0)
                .setDepth(sortDepth(y) + row * 0.01 + i * 0.0001),
            restY: y - row * rise,
            order: row * 100 + i * 2
        }));
    }

    // ------------------------------------------------------------- the camera

    /** To a middle and a zoom, eased; a newer move stops an older one. */
    private moveCamera(x: number, y: number, zoom: number, ms: number, ease: string): Promise<void> {
        const cam = this.scene.cameras.main;
        this.cameraMove?.stop();
        const from = { x: cam.midPoint.x, y: cam.midPoint.y, zoom: cam.zoom };
        const move = counter(this.scene, ms, ease, (v) => {
            // Zoom eased in proportion, so a long pull-back does not rush its start.
            cam.setZoom(from.zoom * Math.pow(zoom / from.zoom, v));
            cam.centerOn(Phaser.Math.Linear(from.x, x, v), Phaser.Math.Linear(from.y, y, v));
        });
        this.cameraMove = move.tween;
        return move.done;
    }
}
