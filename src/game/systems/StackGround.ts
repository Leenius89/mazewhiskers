import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import { TILE_UNIT } from '../core/grid';
import type { SpriteStack } from './SpriteStack';

/**
 * Trial (`?stack`): the ground under the stacked city, and the shade on it.
 *
 * The road is pixel art baked into one canvas the size of the city: asphalt in
 * the streets, pavement under the blocks, a kerb where they meet. A second
 * canvas over it, in the same texels, holds the shade, multiplied into
 * whatever lies under it, the ice included:
 *
 * - The sun stands in the north-west, so every block casts its footprint
 *   swept south-east, as far as the block is tall. Swept a texel at a time,
 *   the shadow's sides step at 45 degrees the way pixel art steps, and its far
 *   end is dithered for one step of penumbra.
 * - Ambient occlusion: a dark ring at every block's foot, and a stepped wedge
 *   in every inside corner of a street.
 *
 * Tokens get a contact shadow each: a stepped ellipse in the same texels.
 *
 * Neither canvas is drawn per frame. They only go stale when a tower lands,
 * so that is when they are looked at again, and only the patch that changed
 * is redrawn: the road where the grid changed (a street became a plot, and
 * its neighbours' kerbs moved) and the shade round the blocks that came and
 * went.
 *
 * Nightmare, lit by the Flashlight, has no sun: it is night and the torch is
 * the only light. The torch already throws hard shadows away from the cat; a
 * second set falling south-east from a sun nobody can see would contradict
 * it, so there the cast shadows are left out. The occlusion and the contact
 * shadows stay. They are about how close things stand, not where the light
 * comes from, and they keep the walls and the cats on the ground inside the
 * torch's pool.
 */

/** Texels per cell: the ground is pixel art drawn at 32 to a cell, shown at 3x. */
const TEXELS = 32;
/** World pixels to a texel. */
const TEXEL = TILE_UNIT / TEXELS;

/** Ground pixels of shadow per pixel a block is drawn rising. */
const SHADOW_LENGTH = 0.5;
/** Texels of dithered penumbra past the far end of a shadow. */
const PENUMBRA = 2;
/** Texels of occlusion round a block's foot. */
const RING = 2;
/** Texels along each wall of the wedge darkening a street's inside corner. */
const CORNER = 8;
/** Multiplied into the ground: the sun's shadow, and the deeper occlusion. Cool, as shade is. */
const SHADOW = '#a4a6c0';
const OCCLUSION = '#80829e';
/**
 * A token's shadow: its width against the token's, its height against its own
 * width, and the rim's strength against the core's. Pickups stand in a lot of
 * empty picture, so theirs is narrower.
 */
const CONTACT = { width: 0.9, height: 0.3, rim: 0.55, pickup: 0.7 };
/** How dark a token's shadow is with it on the ground: darker than the plain game's, to read on asphalt. */
export const CONTACT_ALPHA = 0.45;
/** Over the ice (DEPTH.GROUND + 1); the tokens' shadows over the shade. */
const SHADE_DEPTH = DEPTH.GROUND + 1.5;
const CONTACT_DEPTH = DEPTH.GROUND + 1.6;

export interface GroundSources {
    maze: () => number[][] | undefined;
    /** The fish and the milk: they float, so their shadows stay on the ground under them. */
    pickups: () => Phaser.GameObjects.Sprite[];
    /** Whether the sun casts shadows. Not under the Flashlight: see above. */
    sun: boolean;
}

/** A block's footprint in texels, [x0, x1) by [y0, y1), and how far south-east its shadow runs. */
interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    reach: number;
}
type Rect = Omit<Box, 'reach'>;

const texel = (world: number): number => Math.round((world + TILE_UNIT / 2) / TEXEL);

/** Everything a block darkens. */
const extent = (b: Box): Rect => {
    const far = b.reach ? b.reach + PENUMBRA : RING;
    return { x0: b.x0 - RING, y0: b.y0 - RING, x1: b.x1 + far, y1: b.y1 + far };
};

const union = (a: Rect, b: Rect): Rect => ({
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1)
});

const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Merges the rects that overlap, so two blocks landing at once across the city
 * are two small patches rather than one spanning everything between them. A
 * merge it misses only means a patch is redrawn twice.
 */
const cluster = (rects: Rect[]): Rect[] => {
    const merged: Rect[] = [];
    for (let rect of rects) {
        for (let i = merged.length - 1; i >= 0; i--) {
            if (!overlaps(merged[i], rect)) continue;
            rect = union(merged[i], rect);
            merged.splice(i, 1);
        }
        merged.push(rect);
    }
    return merged;
};

/** The footprint swept `reach` texels south-east, a texel at a time: the shadow of a box. */
const sweep = (ctx: CanvasRenderingContext2D, b: Box, reach: number): void => {
    for (let t = 0; t <= reach; t++) ctx.fillRect(b.x0 + t, b.y0 + t, b.x1 - b.x0, b.y1 - b.y0);
};

const ring = (ctx: CanvasRenderingContext2D, b: Box, n: number): void =>
    ctx.fillRect(b.x0 - n, b.y0 - n, b.x1 - b.x0 + 2 * n, b.y1 - b.y0 + 2 * n);

/** A stepped wedge `size` texels along each wall, in the corner of a cell towards (sx, sy). */
const wedge = (ctx: CanvasRenderingContext2D, gx: number, gy: number, sx: number, sy: number, size: number): void => {
    for (let k = 0; k < size; k++) {
        const w = size - k;
        ctx.fillRect(
            sx < 0 ? gx * TEXELS : (gx + 1) * TEXELS - w,
            sy < 0 ? gy * TEXELS + k : (gy + 1) * TEXELS - 1 - k,
            w,
            1
        );
    }
};

/** The shadow colour on every other texel, for the penumbra. */
const checker = (ctx: CanvasRenderingContext2D): CanvasPattern | null => {
    const tile = document.createElement('canvas');
    tile.width = 2;
    tile.height = 2;
    const tileCtx = tile.getContext('2d') as CanvasRenderingContext2D;
    tileCtx.fillStyle = SHADOW;
    tileCtx.fillRect(0, 0, 1, 1);
    tileCtx.fillRect(1, 1, 1, 1);
    return ctx.createPattern(tile, 'repeat');
};

const canvasOf = (image: Phaser.GameObjects.Image): Phaser.Textures.CanvasTexture =>
    image.texture as Phaser.Textures.CanvasTexture;

/** Sends a redrawn canvas to the GPU. Refreshing resets the filter to smooth, so it is set again. */
const upload = (image: Phaser.GameObjects.Image): void => {
    canvasOf(image).refresh().setFilter(Phaser.Textures.FilterMode.NEAREST);
};

/**
 * A token's shadow: a stepped ellipse in the ground's texels, a solid core in
 * a fainter rim, nearly as wide as the token. Drawn at world size, so whoever
 * owns it can shrink and fade it as the token leaves the ground.
 */
export const contactShadow = (scene: Phaser.Scene, width: number): Phaser.GameObjects.Image => {
    // Even, so the ellipse sits on whole texels either side of its middle.
    const w = Math.max(4, 2 * Math.round((width * CONTACT.width) / TEXEL / 2));
    const h = Math.max(2, Math.round(w * CONTACT.height));
    const key = `stack-shadow-${w}x${h}`;

    if (!scene.textures.exists(key)) {
        const canvas = document.createElement('canvas');
        canvas.width = w * TEXEL;
        canvas.height = h * TEXEL;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const { r, g, b } = Phaser.Display.Color.IntegerToRGB(GameConfig.SHADOW.COLOR);
        for (const [scale, alpha] of [
            [1, CONTACT.rim],
            [0.6, 1]
        ]) {
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            for (let j = 0; j < h; j++) {
                const v = (((j + 0.5) / h) * 2 - 1) / scale;
                const half = Math.round((w / 2) * scale * Math.sqrt(Math.max(0, 1 - v * v)));
                if (half > 0) ctx.fillRect((w / 2 - half) * TEXEL, j * TEXEL, 2 * half * TEXEL, TEXEL);
            }
        }
        scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Centred a little behind the feet, under the body: mostly below them, it
    // read as the cat standing in front of its shadow, off the ground.
    return scene.add.image(0, 0, key).setOrigin(0.5, 0.6).setDepth(CONTACT_DEPTH);
};

export class StackGround {
    private readonly scene: Phaser.Scene;
    private readonly stacks: SpriteStack;
    private readonly sources: GroundSources;
    private readonly road: Phaser.GameObjects.Image;
    private readonly shade: Phaser.GameObjects.Image;
    private readonly dither: CanvasPattern | null;
    /** The grid as the road was last drawn. */
    private readonly drawn: number[][];
    /** The blocks the shade was last drawn for, by footprint. */
    private boxes = new Map<string, Box>();
    /** Set when a tower lands: the only time the blocks or the grid change. */
    private stale = true;
    private readonly floating = new Map<Phaser.GameObjects.Sprite, { shadow: Phaser.GameObjects.Image; restY: number }>();

    constructor(scene: Phaser.Scene, stacks: SpriteStack, sources: GroundSources) {
        this.scene = scene;
        this.stacks = stacks;
        this.sources = sources;

        const maze = sources.maze() ?? [];
        this.drawn = maze.map((row) => row.slice());
        const open = (gx: number, gy: number): boolean => maze[gy]?.[gx] === 0;
        this.road = bakeCity(scene, 'stack-ground', maze.length, DEPTH.GROUND - 1, (ctx) => {
            for (let gy = 0; gy < maze.length; gy++) {
                for (let gx = 0; gx < maze.length; gx++) drawGroundCell(ctx, open, gx, gy);
            }
        });
        this.shade = bakeCity(scene, 'stack-shade', maze.length, SHADE_DEPTH, () => undefined).setBlendMode(
            Phaser.BlendModes.MULTIPLY
        );
        this.dither = checker(canvasOf(this.shade).context);

        scene.sys.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
    }

    private onAdded(object: Phaser.GameObjects.GameObject): void {
        if (object instanceof Phaser.GameObjects.Sprite && String(object.texture.key).startsWith('apt')) this.stale = true;
    }

    /** The sun out (the stacked ending, waking from nightmare) or in: the shade is drawn again. */
    setSun(sun: boolean): void {
        if (this.sources.sun === sun) return;
        this.sources.sun = sun;
        this.stale = true;
    }

    /** After the stacked city's own update, so it reads this frame's blocks. */
    update(): void {
        this.placeFloating();

        const maze = this.sources.maze();
        if (!this.stale || !maze) return;
        this.stale = false;

        const dirty = this.redrawRoad(maze);

        const next = new Map<string, Box>();
        this.stacks.forEachFootprint((x, y, size, rise) => {
            const half = size / 2;
            const box = {
                x0: texel(x - half),
                y0: texel(y - half),
                x1: texel(x + half),
                y1: texel(y + half),
                reach: this.sources.sun ? Math.round((rise * SHADOW_LENGTH) / TEXEL) : 0
            };
            next.set(`${box.x0},${box.y0},${box.x1},${box.y1},${box.reach}`, box);
        });
        next.forEach((box, key) => {
            if (!this.boxes.has(key)) dirty.push(extent(box));
        });
        this.boxes.forEach((box, key) => {
            if (!next.has(key)) dirty.push(extent(box));
        });
        this.boxes = next;

        const patches = cluster(dirty);
        if (patches.length === 0) return;
        patches.forEach((patch) => this.paintShade(patch, maze));
        upload(this.shade);
    }

    /** Redraws the road round every cell the grid has changed, and returns those patches in texels. */
    private redrawRoad(maze: number[][]): Rect[] {
        const changed: Rect[] = [];
        for (let gy = 0; gy < maze.length; gy++) {
            for (let gx = 0; gx < maze[gy].length; gx++) {
                if (maze[gy][gx] === this.drawn[gy][gx]) continue;
                this.drawn[gy][gx] = maze[gy][gx];
                // Its neighbours too: their kerbs face it.
                changed.push({ x0: gx - 1, y0: gy - 1, x1: gx + 2, y1: gy + 2 });
            }
        }
        const patches = cluster(changed);
        if (patches.length === 0) return [];

        const ctx = canvasOf(this.road).context;
        const open = (gx: number, gy: number): boolean => maze[gy]?.[gx] === 0;
        for (const cells of patches) {
            for (let gy = Math.max(0, cells.y0); gy < Math.min(maze.length, cells.y1); gy++) {
                for (let gx = Math.max(0, cells.x0); gx < Math.min(maze.length, cells.x1); gx++) {
                    drawGroundCell(ctx, open, gx, gy);
                }
            }
        }
        upload(this.road);
        return patches.map((cells) => ({
            x0: cells.x0 * TEXELS,
            y0: cells.y0 * TEXELS,
            x1: cells.x1 * TEXELS,
            y1: cells.y1 * TEXELS
        }));
    }

    /** Clears a patch of the shade and draws back everything that darkens it. */
    private paintShade(patch: Rect, maze: number[][]): void {
        const ctx = canvasOf(this.shade).context;
        const near = Array.from(this.boxes.values()).filter((b) => overlaps(extent(b), patch));

        // Inside corners of the streets in the patch: both walls of the corner closed.
        const open = (gx: number, gy: number): boolean => maze[gy]?.[gx] === 0;
        const corners: number[][] = [];
        for (let gy = Math.floor(patch.y0 / TEXELS); gy < Math.ceil(patch.y1 / TEXELS); gy++) {
            for (let gx = Math.floor(patch.x0 / TEXELS); gx < Math.ceil(patch.x1 / TEXELS); gx++) {
                if (!open(gx, gy)) continue;
                for (const [sx, sy] of [
                    [-1, -1],
                    [1, -1],
                    [-1, 1],
                    [1, 1]
                ]) {
                    if (!open(gx + sx, gy) && !open(gx, gy + sy)) corners.push([gx, gy, sx, sy]);
                }
            }
        }

        const { x0, y0, x1, y1 } = patch;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
        ctx.clip();
        ctx.clearRect(x0, y0, x1 - x0, y1 - y0);

        // Lightest first, every layer opaque: where shapes overlap they merge
        // instead of darkening twice. The multiply does the darkening.
        if (this.dither) {
            ctx.fillStyle = this.dither;
            near.forEach((b) => {
                if (b.reach) sweep(ctx, b, b.reach + PENUMBRA);
            });
        }
        ctx.fillStyle = SHADOW;
        near.forEach((b) => {
            sweep(ctx, b, b.reach);
            ring(ctx, b, RING);
        });
        corners.forEach(([gx, gy, sx, sy]) => wedge(ctx, gx, gy, sx, sy, CORNER));
        ctx.fillStyle = OCCLUSION;
        near.forEach((b) => ring(ctx, b, 1));
        corners.forEach(([gx, gy, sx, sy]) => wedge(ctx, gx, gy, sx, sy, CORNER / 2));

        ctx.restore();
    }

    /**
     * The fish and the milk bob up and down. Their shadows stay on the ground
     * under the lowest point they reach, and shrink and fade as they rise, the
     * way a jumping cat's does.
     */
    private placeFloating(): void {
        for (const source of this.sources.pickups()) {
            let entry = this.floating.get(source);
            if (!entry) {
                entry = { shadow: contactShadow(this.scene, source.displayWidth * CONTACT.pickup), restY: source.y };
                this.floating.set(source, entry);
            }
            entry.restY = Math.max(entry.restY, source.y);
            const lift = (entry.restY - source.y) / source.displayHeight;
            entry.shadow
                .setVisible(source.visible)
                .setPosition(source.x, entry.restY + source.displayHeight * (1 - source.originY))
                .setScale(1 - lift * 0.45)
                .setAlpha(CONTACT_ALPHA * (1 - lift * 0.55));
        }

        // Eaten.
        this.floating.forEach((entry, source) => {
            if (source.scene) return;
            entry.shadow.destroy();
            this.floating.delete(source);
        });
    }

    destroy(): void {
        this.scene.sys.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
        this.floating.forEach((entry) => entry.shadow.destroy());
        this.floating.clear();
        this.road.destroy();
        this.shade.destroy();
    }
}

// ------------------------------------------------------------ pixel ground

/** A small seeded generator, so a city's ground looks the same every time. */
const noise = (seed: number) => {
    let t = seed >>> 0;
    return (): number => {
        t = (t + 0x6d2b79f5) >>> 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};

const pixel = (ctx: CanvasRenderingContext2D, colour: string, x: number, y: number, w = 1, h = 1): void => {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, w, h);
};

const spot = (rand: () => number, span = TEXELS): number => Math.floor(rand() * span);

/** One cell of asphalt: speckle, the odd patch and crack. */
const drawAsphalt = (ctx: CanvasRenderingContext2D, ox: number, oy: number, rand: () => number): void => {
    pixel(ctx, '#4b4e55', ox, oy, TEXELS, TEXELS);
    for (let i = 0; i < 70; i++) {
        const c = rand();
        pixel(ctx, c < 0.45 ? '#43464c' : c < 0.9 ? '#555960' : '#62666d', ox + spot(rand), oy + spot(rand));
    }
    if (rand() < 0.25) {
        const w = 6 + spot(rand, 8);
        const h = 4 + spot(rand, 6);
        pixel(ctx, '#45484e', ox + spot(rand, TEXELS - w), oy + spot(rand, TEXELS - h), w, h);
    }
    if (rand() < 0.35) {
        let x = ox + 4 + spot(rand, 24);
        let y = oy + 4 + spot(rand, 24);
        for (let i = 0; i < 7; i++) {
            pixel(ctx, '#393b40', x, y);
            x += rand() < 0.5 ? 1 : 0;
            y += rand() < 0.5 ? 1 : -1;
        }
    }
};

/** Pavement under and between the houses: square slabs with joints. */
const drawPavement = (ctx: CanvasRenderingContext2D, ox: number, oy: number, rand: () => number): void => {
    pixel(ctx, '#8b8d92', ox, oy, TEXELS, TEXELS);
    for (let k = 0; k < TEXELS; k += 8) {
        pixel(ctx, '#77797e', ox + k, oy, 1, TEXELS);
        pixel(ctx, '#77797e', ox, oy + k, TEXELS, 1);
    }
    for (let i = 0; i < 18; i++) pixel(ctx, rand() < 0.5 ? '#94969b' : '#808287', ox + spot(rand), oy + spot(rand));
};

/**
 * One cell of the road: pavement where a block stands, otherwise asphalt with
 * a kerb, a light edge and a dark lip, wherever it meets a block. Seeded by
 * the cell, so drawing a cell again draws the same cell.
 */
const drawGroundCell = (
    ctx: CanvasRenderingContext2D,
    open: (gx: number, gy: number) => boolean,
    gx: number,
    gy: number
): void => {
    const rand = noise(gx * 7919 + gy * 104729);
    const ox = gx * TEXELS;
    const oy = gy * TEXELS;
    if (!open(gx, gy)) {
        drawPavement(ctx, ox, oy, rand);
        return;
    }
    drawAsphalt(ctx, ox, oy, rand);
    const end = TEXELS - 3;
    if (!open(gx, gy - 1)) {
        pixel(ctx, '#a3a5aa', ox, oy, TEXELS, 2);
        pixel(ctx, '#2e3034', ox, oy + 2, TEXELS, 1);
    }
    if (!open(gx, gy + 1)) {
        pixel(ctx, '#2e3034', ox, oy + end, TEXELS, 1);
        pixel(ctx, '#a3a5aa', ox, oy + end + 1, TEXELS, 2);
    }
    if (!open(gx - 1, gy)) {
        pixel(ctx, '#a3a5aa', ox, oy, 2, TEXELS);
        pixel(ctx, '#2e3034', ox + 2, oy, 1, TEXELS);
    }
    if (!open(gx + 1, gy)) {
        pixel(ctx, '#2e3034', ox + end, oy, 1, TEXELS);
        pixel(ctx, '#a3a5aa', ox + end + 1, oy, 2, TEXELS);
    }
};

/** A canvas the size of the city at a texel a cell-thirty-second, shown at the city's scale. */
const bakeCity = (
    scene: Phaser.Scene,
    key: string,
    size: number,
    depth: number,
    paint: (ctx: CanvasRenderingContext2D) => void
): Phaser.GameObjects.Image => {
    const canvas = document.createElement('canvas');
    canvas.width = size * TEXELS;
    canvas.height = size * TEXELS;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    paint(ctx);

    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return scene.add
        .image(-TILE_UNIT / 2, -TILE_UNIT / 2, key)
        .setOrigin(0, 0)
        .setScale(TILE_UNIT / TEXELS)
        .setDepth(depth);
};

/**
 * Frozen streets in the same pixels: pale ice with darker drifts, glints and a
 * white crack, and a rim where the sheet ends.
 */
export const drawPixelIce = (
    scene: Phaser.Scene,
    size: number,
    frozen: { gx: number; gy: number }[],
    iced: (gx: number, gy: number) => boolean
): Phaser.GameObjects.Image =>
    bakeCity(scene, 'stack-ice', size, DEPTH.GROUND + 1, (ctx) => {
        for (const { gx, gy } of frozen) {
            const rand = noise(gx * 15485863 + gy * 32452843);
            const ox = gx * TEXELS;
            const oy = gy * TEXELS;
            pixel(ctx, '#8fd4e8', ox, oy, TEXELS, TEXELS);
            for (let i = 0; i < 5; i++) {
                const w = 4 + spot(rand, 10);
                pixel(ctx, '#7cc4dd', ox + spot(rand, TEXELS - w), oy + spot(rand, 30), w, 2);
            }
            for (let i = 0; i < 6; i++) pixel(ctx, '#e6f8ff', ox + spot(rand), oy + spot(rand));
            // One crack, stepped the way pixels step.
            let x = ox + 3 + spot(rand, 26);
            for (let y = oy + 3; y < oy + TEXELS - 3; y++) {
                pixel(ctx, '#f4fcff', x, y);
                const turn = rand();
                x = Math.min(ox + TEXELS - 2, Math.max(ox + 1, x + (turn < 0.33 ? -1 : turn < 0.66 ? 1 : 0)));
            }
            if (!iced(gx, gy - 1)) pixel(ctx, '#d8f2fb', ox, oy, TEXELS, 2);
            if (!iced(gx, gy + 1)) pixel(ctx, '#5fa9c4', ox, oy + TEXELS - 2, TEXELS, 2);
            if (!iced(gx - 1, gy)) pixel(ctx, '#d8f2fb', ox, oy, 2, TEXELS);
            if (!iced(gx + 1, gy)) pixel(ctx, '#5fa9c4', ox + TEXELS - 2, oy, 2, TEXELS);
        }
    });
