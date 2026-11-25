import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import type { Player } from '../objects/Player';
import { choosePose, derivePoses, freshMemory } from './CatPoses';
import type { Moment, Pose, PoseMemory } from './CatPoses';

/**
 * Trial (`?stack`): the cats, the fish and the milk as solid little figures
 * rather than a pile of copies.
 *
 * Each drawing is read at its own resolution, a texel per art pixel, and
 * sculpted once into a figure as the city's camera sees it, from in front and
 * above:
 *
 * - The drawing is the figure's front, shaded in whole steps the way pixel art
 *   is. Rims open to the upper left catch the light, which comes from the
 *   north-west as it does for the whole city; rims open to the lower right
 *   fall into shade, two rows deep under a thick part (body, head) so that it
 *   rounds off. Light pulls a colour towards the figure's light colour, shade
 *   darkens it and cools it towards dusk. A drawing's own dark outline stays
 *   dark.
 * - Over the long top edge of a thick part the camera also sees its back: up
 *   to `depth` rows of that edge repeated above it, brightest nearest the
 *   front, so the stripes run on over the cat's back. Ears, tails and legs are
 *   thin and get none.
 *
 * A black cat cannot be shaded darker, so its light is a cool violet-grey: a
 * rim on the edges turned to the light and a lit back, the body still black.
 *
 * Milk's lettering is finer than its art pixels and would break up read at
 * them, so the bottle is sculpted plain and the lettering laid over its front
 * at the drawing's own size (see `letter`).
 *
 * A cat is drawn in the pose CatPoses picks for what it is doing. Each pose is
 * baked the first time it is needed, facing each way, so the light stays on
 * the upper left whichever way the cat looks.
 */

/** An RGBA picture, a texel per art pixel. An ImageData is one. */
export interface Pixels {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}

type RGB = readonly [number, number, number];

export interface Look {
    /** Rows of the figure's back the camera sees over its top, where it is thickest. */
    depth: number;
    /** The colour light pulls a pixel towards, and how far each step of light pulls it. */
    light: RGB;
    glow: number;
}

export const ORANGE: Look = { depth: 2, light: [255, 236, 190], glow: 0.24 };
export const BLACK: Look = { depth: 2, light: [176, 166, 226], glow: 0.36 };
export const ITEM: Look = { depth: 1, light: [255, 252, 236], glow: 0.3 };

/** Art pixels across every drawing the figures are made from. */
const ART = 20;
/** Alpha at which a texel counts as part of the drawing. */
const SOLID = 24;
/** How far a pixel looks for the deepest part of the shape it belongs to. */
const REACH = 2;
/** Each step of shade keeps this much of a colour, and leans it this far towards dusk. */
const DIM = 0.78;
const DUSK: RGB = [36, 32, 64];
const COOL = 0.12;
/** The back seen over the top: the row nearest the front is the brightest. */
const BACK_STEPS = [0, 2, 1, 1];
/** Top edges shorter than this (ear tips, a tail) get no back over them. */
const BACK_RUN = 3;
/** A rim pixel this much darker than its neighbours is the drawing's outline. */
const OUTLINE = 0.6;

const tone = (data: Uint8ClampedArray, at: number, step: number, look: Look, out: Uint8ClampedArray, to: number): void => {
    for (let c = 0; c < 3; c++) {
        const v = data[at + c];
        out[to + c] =
            step >= 0
                ? v + (look.light[c] - v) * Math.min(1, look.glow * step)
                : v * Math.pow(DIM, -step) + (DUSK[c] - v * Math.pow(DIM, -step)) * COOL * -step;
    }
};

/**
 * The figure for a drawing, facing the other way if `flip`. The light stays
 * on the upper left either way. `depth` rows are added above the drawing.
 */
export const sculpt = (art: Pixels, look: Look, flip = false): Pixels => {
    const { width: w, height: h, data } = art;
    const lift = look.depth;
    const index = (x: number, y: number): number => (y * w + (flip ? w - 1 - x : x)) * 4;
    const solid = (x: number, y: number): boolean =>
        x >= 0 && y >= 0 && x < w && y < h && data[index(x, y) + 3] > SOLID;
    const open = (x: number, y: number): number => (solid(x, y) ? 0 : 1);

    // Steps in from the edge, 1 on the rim.
    const inward = new Int16Array(w * h);
    const queue: number[] = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!solid(x, y) || !(open(x - 1, y) + open(x + 1, y) + open(x, y - 1) + open(x, y + 1))) continue;
            inward[y * w + x] = 1;
            queue.push(y * w + x);
        }
    }
    for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        const x = p % w;
        const y = (p - x) / w;
        for (const [nx, ny] of [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1]
        ]) {
            if (!solid(nx, ny) || inward[ny * w + nx]) continue;
            inward[ny * w + nx] = inward[p] + 1;
            queue.push(ny * w + nx);
        }
    }

    // How thick the part a pixel belongs to is: the deepest point within reach.
    const thick = (x: number, y: number): number => {
        let r = 1;
        for (let dy = -REACH; dy <= REACH; dy++) {
            for (let dx = -REACH; dx <= REACH; dx++) {
                if (solid(x + dx, y + dy)) r = Math.max(r, inward[(y + dy) * w + x + dx]);
            }
        }
        return r;
    };
    const topEdge = (x: number, y: number): boolean => solid(x, y) && !solid(x, y - 1);
    const luma = (x: number, y: number): number => {
        if (!solid(x, y)) return 0;
        const at = index(x, y);
        return data[at] * 0.3 + data[at + 1] * 0.59 + data[at + 2] * 0.11;
    };
    // A drawing's own dark outline stays dark: light falls on what it encloses.
    const outline = (x: number, y: number): boolean =>
        luma(x, y) < OUTLINE * Math.max(luma(x - 1, y), luma(x + 1, y), luma(x, y - 1), luma(x, y + 1));

    const out = new Uint8ClampedArray(w * (h + lift) * 4);

    // The back, over every long top edge of a thick part; deepest row first,
    // so the nearer rows paint over it.
    for (let k = lift; k >= 1; k--) {
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!topEdge(x, y) || solid(x, y - k) || thick(x, y) - 1 < k) continue;
                let a = x;
                let b = x;
                while (topEdge(a - 1, y)) a--;
                while (topEdge(b + 1, y)) b++;
                if (b - a + 1 < BACK_RUN) continue;
                const to = ((y - k + lift) * w + x) * 4;
                // The back is the colour under an outline, not the outline's.
                const top = outline(x, y) && solid(x, y + 1) ? y + 1 : y;
                tone(data, index(x, top), BACK_STEPS[Math.min(k, BACK_STEPS.length - 1)], look, out, to);
                out[to + 3] = 255;
            }
        }
    }

    // Then the front, a step of light or shade at a time.
    const stepAt = (x: number, y: number): number => {
        const facing = open(x, y - 1) + open(x - 1, y) - open(x, y + 1) - open(x + 1, y);
        const round = thick(x, y) >= 3;
        if (facing > 0) return outline(x, y) ? 0 : 1;
        if (facing < 0) return round && open(x, y + 1) ? -2 : -1;
        return round && open(x, y + 2) ? -1 : 0;
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!solid(x, y)) continue;
            const from = index(x, y);
            const to = ((y + lift) * w + x) * 4;
            tone(data, from, stepAt(x, y), look, out, to);
            out[to + 3] = data[from + 3];
        }
    }

    return { width: w, height: h + lift, data: out };
};

/** Under this brightness a pixel of an item is lettering, not the thing. */
const INK = 80;
/** Times finer than its art pixels a lettered figure is drawn. */
const FINE = 10;
const isInk = (p: Pixels, at: number): boolean =>
    p.data[at + 3] > SOLID && p.data[at] * 0.3 + p.data[at + 1] * 0.59 + p.data[at + 2] * 0.11 < INK;

/** The drawing with its lettering painted out in the colour beside it. */
export const unlettered = (art: Pixels): Pixels => {
    const data = art.data.slice();
    // Not spread: an ImageData's sizes are not its own properties.
    const plain = { width: art.width, height: art.height, data };
    for (let at = 4; at < data.length; at += 4) {
        if (at % (art.width * 4) && isInk(plain, at)) data.copyWithin(at, at - 4, at);
    }
    return plain;
};

/**
 * `figure` drawn `fine` times finer, with the lettering of `fineArt` (the
 * drawing read that much finer) laid on its front, `lift` rows down.
 */
export const letter = (figure: Pixels, fineArt: Pixels, fine: number, lift: number): Pixels => {
    const width = figure.width * fine;
    const height = figure.height * fine;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const from = (Math.floor(y / fine) * figure.width + Math.floor(x / fine)) * 4;
            data.set(figure.data.subarray(from, from + 4), (y * width + x) * 4);
        }
    }
    for (let at = 0; at < fineArt.data.length; at += 4) {
        if (!isInk(fineArt, at)) continue;
        const p = at / 4;
        const x = p % fineArt.width;
        const y = (p - x) / fineArt.width + lift * fine;
        if (y < height) data.set(fineArt.data.subarray(at, at + 4), (y * width + x) * 4);
    }
    return { width, height, data };
};

// ------------------------------------------------------------ in play

type Sprite = Phaser.GameObjects.Sprite;
/** What a pose reads off the player and the black cat, where they have it. */
type Cat = Sprite &
    Partial<Pick<Player, 'isJumping' | 'isInvulnerable' | 'isRecovering' | 'isDashing'>> &
    Partial<Pick<Enemy, 'awareness' | 'isSliding'>>;

/** Drawings with lettering finer than their art pixels. */
const LETTERED = /^milk/;

const familyOf = (key: string): string => (key.startsWith('enemy') ? 'enemy' : key.startsWith('cat') ? 'cat' : key);
const LOOKS: Record<string, Look> = { cat: ORANGE, enemy: BLACK };

/** A drawing read at a texel per art pixel, or `across` texels across. */
const readArt = (scene: Phaser.Scene, textureKey: string, across = ART): Pixels => {
    const frame = scene.textures.getFrame(textureKey);
    const rows = Math.round((across * frame.cutHeight) / frame.cutWidth);
    const canvas = document.createElement('canvas');
    canvas.width = across;
    canvas.height = rows;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    // Nearest sampling lands in the middle of each art pixel.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, across, rows);
    return ctx.getImageData(0, 0, across, rows);
};

/** Each cat's poses, made from its two walk drawings (`cat1`, `cat2`) the first time. */
const poseArt = new Map<string, Record<Pose, Pixels>>();
const posesOf = (scene: Phaser.Scene, family: string): Record<Pose, Pixels> => {
    let poses = poseArt.get(family);
    if (!poses) poseArt.set(family, (poses = derivePoses(readArt(scene, `${family}1`), readArt(scene, `${family}2`))));
    return poses;
};

/** Baked figures by family and pose (a fish's drawing is its pose), facing right then left. */
const baked = new Map<string, Record<string, string[]>>();
const memories = new WeakMap<Sprite, PoseMemory>();
/** Filled in afresh for each cat each frame, rather than made each time. */
const moment: Moment = {
    now: 0,
    jumping: false,
    moving: false,
    walking: false,
    dashing: false,
    hurt: false,
    alert: false,
    stride: 0
};

const poseOf = (cat: Cat): Pose => {
    let memory = memories.get(cat);
    if (!memory) memories.set(cat, (memory = freshMemory()));
    const body = cat.body as Phaser.Physics.Arcade.Body | null;
    const anims = cat.anims;
    moment.now = cat.scene.time.now;
    moment.jumping = !!cat.isJumping;
    moment.moving = !!body && body.velocity.lengthSq() > 64;
    // The black cat's legs keep walking while the ice carries it.
    moment.walking = anims.isPlaying && !cat.isSliding;
    moment.dashing = !!cat.isDashing;
    // The hit's white flash, then the shove that follows it.
    moment.hurt = cat.tintFill || (!!cat.isInvulnerable && !!cat.isRecovering && !cat.isDashing);
    moment.alert = cat.awareness === 'telegraph';
    moment.stride = String(cat.texture.key).endsWith('2') ? 1 : 0;
    return choosePose(moment, memory);
};

const figureOf = (source: Sprite): string => {
    const scene = source.scene;
    const key = String(source.texture.key);
    const family = familyOf(key);
    const look = LOOKS[family];
    const pose = look ? poseOf(source) : key;
    const left = source.flipX ? 1 : 0;

    let byPose = baked.get(family);
    if (!byPose) baked.set(family, (byPose = {}));
    const sides = (byPose[pose] ??= []);
    const name = sides[left];
    if (name && scene.textures.exists(name)) return name;

    const made = `figure-${family}-${pose}-${left ? 'left' : 'right'}`;
    if (!scene.textures.exists(made)) {
        const lettered = !look && LETTERED.test(key);
        const art = look ? posesOf(scene, family)[pose as Pose] : readArt(scene, key);
        let figure = sculpt(lettered ? unlettered(art) : art, look ?? ITEM, !!left);
        if (lettered) figure = letter(figure, readArt(scene, key, ART * FINE), FINE, ITEM.depth);
        const canvas = document.createElement('canvas');
        canvas.width = figure.width;
        canvas.height = figure.height;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const image = ctx.createImageData(figure.width, figure.height);
        image.data.set(figure.data);
        ctx.putImageData(image, 0, 0);
        scene.textures.addCanvas(made, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    return (sides[left] = made);
};

/**
 * Draws `copy` as `source`'s figure at `x`, `y`: the same size, origin, angle,
 * alpha and tint as the sprite it stands for. A figure is baked facing each
 * way, so `copy` is never flipped.
 */
export const placeFigure = (copy: Phaser.GameObjects.Image, source: Sprite, x: number, y: number): void => {
    const key = figureOf(source);
    if (copy.texture.key !== key) copy.setTexture(key);
    // Source pixels per texel of the figure, and the drawing's rows of them.
    const texel = source.frame.cutWidth / copy.frame.width;
    const rows = source.frame.cutHeight / texel;
    copy.setOrigin(source.flipX ? 1 - source.originX : source.originX, 1 - (rows * (1 - source.originY)) / copy.frame.height);
    copy.setScale(source.scaleX * texel, source.scaleY * texel);
    copy.setAngle(source.angle);
    copy.setAlpha(source.alpha);
    copy.setPosition(x, y);
    if (source.tintFill) copy.setTintFill(source.tintTopLeft);
    else if (source.isTinted) copy.setTint(source.tintTopLeft);
    else copy.clearTint();
};
