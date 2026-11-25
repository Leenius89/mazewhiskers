/**
 * The stacked city's blocks, painted texel by texel (see SpriteStack's `cutOf`).
 *
 * A block's front drawing is first shrunk to the city's own pixel size — the
 * ground's three world units to a texel — so facades, roofs, ground and cats
 * read as one size of pixel. Shrinking keeps each texel one of the drawing's
 * own colours, and a dark detail that covers a good share of a texel wins it,
 * so window frames and outlines survive a twenty-fold shrink instead of being
 * averaged into mud.
 *
 * Each slice is a square, as wide as the drawing is over its rows, with its
 * rows wrapped round the rim. The light comes from the north-west, the upper
 * left of the screen: west and north faces are lifted, south shaded a little
 * and east more. The outer columns of every slice are drawn dark, which on
 * screen is a crisp line down every corner and along the side a tower leans
 * to. Inside the rim, and on the last frame, is the roof: a plate painted
 * once per drawing from its own palette, with a dark edge, a lit parapet and
 * the shadow it throws, and things on it by kind — tiles and a chimney on a
 * house, plant and a stair hut on a tower, a garden on home. Wherever a
 * slice is narrower than the one under it, the ledge shows that plate too,
 * shaded where the part above blocks the light.
 *
 * Plain DOM canvas, no Phaser: done once per drawing, and runnable on its own.
 */

export type BlockKind = 'building' | 'apt' | 'goal';
type RGB = [number, number, number];

/** A drawing's pixels and its opaque box. */
export interface Art {
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    widthShare: number;
    heightShare: number;
    /** Rows shrunk across to a width, kept per width: the costly half of shrinking. */
    strips: Map<number, Uint8ClampedArray>;
}

export interface SliceSpec {
    kind: BlockKind;
    /** Texels across a frame: the drawing's width at the city's pixel size. */
    px: number;
    slices: number;
    /** Texel rows of facade each slice carries. */
    rowsPerSlice: number;
    /** Same seed, same roof. */
    seed: string;
    /** Nightmare: some windows lit from inside. */
    glow: boolean;
}

/** Below this a drawing's pixel is empty. */
const OPAQUE = 24;
/** A texel goes to its darker pixels when they are this much darker than the mean... */
const DARK_GAP = 16;
/** ...and cover at least this share of it: a one-pixel line in a three-pixel texel survives. */
const DARK_SHARE = 0.3;
/** Faces against a light from the north-west. */
const LIGHT = { N: 1.1, W: 1.05, S: 0.86, E: 0.7 };
/** Corners and the roof's edge. */
const OUTLINE = 0.42;
const WARM_WHITE: RGB = [255, 244, 214];
const WINDOW_GLOW: RGB = [255, 205, 112];
const SKY_GLASS: RGB = [150, 196, 222];
const GRASS: RGB = [86, 140, 74];
const SIGNAL: RGB = [214, 64, 56];

const arts = new WeakMap<object, Art>();

/** Reads a drawing once: its pixels and the box its opaque part fills. */
export const readArt = (image: HTMLImageElement | HTMLCanvasElement): Art => {
    const known = arts.get(image);
    if (known) return known;

    const { width, height } = image;
    const read = document.createElement('canvas');
    read.width = width;
    read.height = height;
    const ctx = read.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height).data;

    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (pixels[(y * width + x) * 4 + 3] <= OPAQUE) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            bottom = y;
        }
    }
    if (right < 0) {
        left = top = 0;
        right = width - 1;
        bottom = height - 1;
    }
    const art: Art = {
        pixels,
        width,
        height,
        left,
        right,
        top,
        bottom,
        widthShare: (right - left + 1) / width,
        heightShare: (bottom - top + 1) / height,
        strips: new Map()
    };
    arts.set(image, art);
    return art;
};

// ------------------------------------------------------------------ colour

const luma = (r: number, g: number, b: number): number => (r * 77 + g * 150 + b * 29) >> 8;
const lumaOf = (c: RGB): number => luma(c[0], c[1], c[2]);
const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a: RGB, b: RGB, t: number): RGB => [
    clamp(a[0] + (b[0] - a[0]) * t),
    clamp(a[1] + (b[1] - a[1]) * t),
    clamp(a[2] + (b[2] - a[2]) * t)
];
/** Below 1 darkens and leans cool, above 1 lifts and leans warm, the way pixel art shades. */
const tone = (c: RGB, f: number): RGB =>
    f > 1 ? mix(c, WARM_WHITE, f - 1) : [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * Math.min(1, f + (1 - f) * 0.35))];

/** A small seeded generator (the ground's), so a roof is the same every time. */
const random = (seed: number) => {
    let t = seed >>> 0;
    return (): number => {
        t = (t + 0x6d2b79f5) >>> 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};

const hash = (text: string): number => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
};

// --------------------------------------------------------------- shrinking

/**
 * The colour a run of pixels shrinks to, written to `out` at `at`: the run's
 * darker or lighter pixels, whichever side wins (dark wins on a third), as the
 * one of their own colours nearest their mean. Empty if under half is opaque.
 */
const pick = (
    buf: Uint8ClampedArray,
    start: number,
    stride: number,
    count: number,
    out: Uint8ClampedArray,
    at: number
): void => {
    let n = 0;
    let sum = 0;
    for (let k = 0, o = start; k < count; k++, o += stride) {
        if (buf[o + 3] <= OPAQUE) continue;
        n++;
        sum += luma(buf[o], buf[o + 1], buf[o + 2]);
    }
    if (n * 2 < count || n === 0) {
        out[at + 3] = 0;
        return;
    }
    const split = sum / n - DARK_GAP;
    const dark = [0, 0, 0, 0];
    const light = [0, 0, 0, 0];
    for (let k = 0, o = start; k < count; k++, o += stride) {
        if (buf[o + 3] <= OPAQUE) continue;
        const side = luma(buf[o], buf[o + 1], buf[o + 2]) < split ? dark : light;
        side[0]++;
        side[1] += buf[o];
        side[2] += buf[o + 1];
        side[3] += buf[o + 2];
    }
    const takeDark = dark[0] >= n * DARK_SHARE;
    const [m, r, g, b] = takeDark ? dark : light;
    let best = Infinity;
    for (let k = 0, o = start; k < count; k++, o += stride) {
        if (buf[o + 3] <= OPAQUE) continue;
        if ((luma(buf[o], buf[o + 1], buf[o + 2]) < split) !== takeDark) continue;
        const d = Math.abs(buf[o] - r / m) + Math.abs(buf[o + 1] - g / m) + Math.abs(buf[o + 2] - b / m);
        if (d >= best) continue;
        best = d;
        out[at] = buf[o];
        out[at + 1] = buf[o + 1];
        out[at + 2] = buf[o + 2];
    }
    out[at + 3] = 255;
};

/** The drawing's opaque box shrunk to `w` x `h` texels, row 0 at the top. Across first, then down. */
export const shrink = (art: Art, w: number, h: number): Uint8ClampedArray => {
    const boxWidth = art.right - art.left + 1;
    const boxHeight = art.bottom - art.top + 1;
    let strip = art.strips.get(w);
    if (!strip) {
        strip = new Uint8ClampedArray(w * boxHeight * 4);
        for (let y = 0; y < boxHeight; y++) {
            for (let x = 0; x < w; x++) {
                const x0 = art.left + Math.floor((x * boxWidth) / w);
                const x1 = art.left + Math.floor(((x + 1) * boxWidth) / w);
                pick(art.pixels, ((art.top + y) * art.width + x0) * 4, 4, x1 - x0, strip, (y * w + x) * 4);
            }
        }
        art.strips.set(w, strip);
    }
    const mini = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        const y0 = Math.floor((y * boxHeight) / h);
        const y1 = Math.floor(((y + 1) * boxHeight) / h);
        for (let x = 0; x < w; x++) pick(strip, (y0 * w + x) * 4, w * 4, y1 - y0, mini, (y * w + x) * 4);
    }
    return mini;
};

interface Palette {
    /** The commonest colour: the walls. */
    main: RGB;
    light: RGB;
    dark: RGB;
    /** The most colourful common one: home's green trim, a tower's brick. */
    accent: RGB;
    /** The drawing's top, toned towards concrete: a flat roof seen from above. */
    concrete: RGB;
}

const paletteOf = (mini: Uint8ClampedArray, w: number, h: number): Palette => {
    const counts = new Map<number, { c: RGB; n: number }>();
    let total = 0;
    for (let o = 0; o < mini.length; o += 4) {
        if (!mini[o + 3]) continue;
        const bin = ((mini[o] >> 4) << 8) | ((mini[o + 1] >> 4) << 4) | (mini[o + 2] >> 4);
        const known = counts.get(bin);
        if (known) known.n++;
        else counts.set(bin, { c: [mini[o], mini[o + 1], mini[o + 2]], n: 1 });
        total++;
    }
    const all: { c: RGB; n: number }[] = [];
    counts.forEach((v) => all.push(v));
    all.sort((a, b) => b.n - a.n);
    const common = all.filter((v, i) => i === 0 || v.n >= total * 0.03);
    const by = (list: { c: RGB }[], score: (c: RGB) => number): RGB =>
        list.reduce((a, b) => (score(b.c) > score(a.c) ? b : a)).c;
    const chroma = (c: RGB) => Math.max(...c) - Math.min(...c);

    // The top twelfth of the drawing, averaged and halved towards grey.
    const sum = [0, 0, 0, 0];
    for (let y = 0; y < Math.max(1, Math.round(h / 12)); y++) {
        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            if (!mini[o + 3]) continue;
            sum[0]++;
            sum[1] += mini[o];
            sum[2] += mini[o + 1];
            sum[3] += mini[o + 2];
        }
    }
    const top: RGB = sum[0] ? [sum[1] / sum[0], sum[2] / sum[0], sum[3] / sum[0]] : [128, 128, 128];

    return {
        main: all.length ? all[0].c : [128, 128, 128],
        light: common.length ? by(common, lumaOf) : [200, 200, 200],
        dark: common.length ? by(common, (c) => -lumaOf(c)) : [40, 40, 40],
        accent: all.length ? by(all.filter((v, i) => i === 0 || v.n >= total * 0.01), chroma) : [128, 128, 128],
        concrete: mix(top, [138, 138, 138], 0.5)
    };
};

// ------------------------------------------------------------------- roofs

interface Square {
    /** Where the square starts in its frame, both ways. */
    at: number;
    side: number;
    /** The first texel column of the drawing it carries. */
    col: number;
}

const inside = (s: Square | null, x: number, y: number): boolean =>
    !!s && x >= s.at && y >= s.at && x < s.at + s.side && y < s.at + s.side;

/** A plate the size of a frame: the roof wherever a slice shows its top. */
class Plate {
    readonly texels: RGB[];
    private readonly taken: boolean[];

    constructor(readonly px: number, fill: (x: number, y: number) => RGB) {
        this.texels = [];
        this.taken = [];
        for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) this.texels.push(fill(x, y));
    }

    at(x: number, y: number): RGB {
        return this.texels[y * this.px + x];
    }

    rect(x: number, y: number, w: number, h: number, paint: RGB | ((c: RGB) => RGB)): void {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (i < 0 || j < 0 || i >= this.px || j >= this.px) continue;
                const k = j * this.px + i;
                this.texels[k] = typeof paint === 'function' ? paint(this.texels[k]) : paint;
            }
        }
    }

    /**
     * A box standing on the roof: its top, its south face under that, and a
     * shadow thrown south-east. Claims the ground it covers, and refuses
     * ground already claimed or outside `room`.
     */
    box(room: Square, rand: () => number, w: number, d: number, h: number, colour: RGB): { x: number; y: number } | null {
        const lo = room.at + 3;
        const hiX = room.at + room.side - 3 - (w + 1);
        const hiY = room.at + room.side - 3 - (d + h + 1);
        if (hiX < lo || hiY < lo) return null;
        for (let tries = 0; tries < 24; tries++) {
            const x = lo + Math.floor(rand() * (hiX - lo + 1));
            const y = lo + Math.floor(rand() * (hiY - lo + 1));
            let free = true;
            for (let j = y - 1; j <= y + d + h + 1 && free; j++) {
                for (let i = x - 1; i <= x + w + 1 && free; i++) free = !this.taken[j * this.px + i];
            }
            if (!free) continue;
            for (let j = y - 1; j <= y + d + h + 1; j++) for (let i = x - 1; i <= x + w + 1; i++) this.taken[j * this.px + i] = true;

            this.rect(x + 1, y + 1, w, d + h, (c) => tone(c, 0.7));
            this.rect(x, y, w, d, colour);
            this.rect(x, y, w, 1, tone(colour, 1.15));
            this.rect(x, y, 1, d, tone(colour, 1.08));
            this.rect(x, y + d, w, h, tone(colour, 0.72));
            this.rect(x, y + d + h - 1, w, 1, tone(colour, 0.5));
            return { x, y };
        }
        return null;
    }
}

type HouseRoof = 'tiles' | 'flat';

/** A pitched roof, ridge along the street: the north slope lit, the south in its own shade. */
const tiledRoof = (palette: Palette, px: number, room: Square): Plate => {
    const tile = mix(palette.main, palette.light, 0.2);
    const ridge = room.at + Math.floor(room.side / 2);
    return new Plate(px, (x, y) => {
        if (y === ridge - 1) return tone(mix(tile, palette.light, 0.35), 1.1);
        if (y === ridge) return tone(tile, 0.55);
        const north = y < ridge;
        const slope = tone(tile, north ? 1.12 : 0.88);
        const course = Math.floor((north ? ridge - 1 - y : y - ridge - 1) / 2);
        if ((north ? ridge - 1 - y : y - ridge - 1) % 2 === 1) return tone(slope, 0.8);
        return (x + (course % 2) * 2) % 4 === 0 ? tone(slope, 0.9) : slope;
    });
};

/** Tar and gravel inside a parapet. */
const flatRoof = (palette: Palette, px: number, rand: () => number): Plate => {
    const tar = mix(palette.dark, palette.concrete, 0.55);
    return new Plate(px, () => {
        const r = rand();
        return r < 0.08 ? tone(tar, 1.1) : r < 0.14 ? tone(tar, 0.85) : tar;
    });
};

/** Concrete in slabs, speckled. */
const concreteRoof = (palette: Palette, px: number, rand: () => number): Plate =>
    new Plate(px, (x, y) => {
        const base = x % 7 === 0 || y % 7 === 0 ? tone(palette.concrete, 0.93) : palette.concrete;
        const r = rand();
        return r < 0.05 ? tone(base, 1.08) : r < 0.1 ? tone(base, 0.92) : base;
    });

const chimney = (plate: Plate, room: Square, rand: () => number, brick: RGB): void => {
    const spot = plate.box(room, rand, 3, 2, 3, brick);
    if (spot) plate.rect(spot.x + 1, spot.y, 1, 1, [28, 24, 26]);
};

const houseRoof = (style: HouseRoof, palette: Palette, px: number, room: Square, rand: () => number): Plate => {
    if (style === 'tiles') {
        const plate = tiledRoof(palette, px, room);
        chimney(plate, room, rand, mix(palette.main, palette.light, 0.3));
        return plate;
    }
    const plate = flatRoof(palette, px, rand);
    const glass = plate.box(room, rand, 4, 3, 1, mix(SKY_GLASS, palette.light, 0.2));
    if (glass) plate.rect(glass.x + 1, glass.y + 1, 2, 1, tone(SKY_GLASS, 1.3));
    chimney(plate, room, rand, mix(palette.main, palette.light, 0.3));
    plate.box(room, rand, 1, 1, 1, tone(palette.concrete, 0.7));
    return plate;
};

/** A tower's plant: a stair hut, a water tank, air conditioners, vents and an aerial. */
const towerRoof = (palette: Palette, px: number, room: Square, rand: () => number): Plate => {
    const plate = concreteRoof(palette, px, rand);
    const metal = mix(palette.concrete, palette.light, 0.6);
    const hut = plate.box(room, rand, 9, 5, 3, mix(palette.main, palette.concrete, 0.3));
    if (hut) plate.rect(hut.x + 4, hut.y + 6, 2, 2, tone(palette.dark, 0.8));
    const tank = plate.box(room, rand, 6, 5, 2, mix(palette.accent, metal, 0.6));
    if (tank) {
        // Rounded: the corners are roof again.
        for (const [dx, dy] of [
            [0, 0],
            [5, 0],
            [0, 6],
            [5, 6]
        ]) {
            plate.rect(tank.x + dx, tank.y + dy, 1, 1, palette.concrete);
        }
        plate.rect(tank.x + 1, tank.y + 1, 2, 1, tone(metal, 1.3));
    }
    const units = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < units; i++) {
        const unit = plate.box(room, rand, 3, 2, 1, metal);
        if (unit) plate.rect(unit.x + 1, unit.y, 1, 1, tone(metal, 0.45));
    }
    for (let i = 0; i < 4; i++) plate.box(room, rand, 1, 1, 1, tone(palette.concrete, 0.6));
    // The aerial: a mast up the screen, a red light on it, its shadow down to the right.
    const mast = plate.box(room, rand, 1, 1, 0, tone(palette.dark, 0.8));
    if (mast && mast.y - 7 >= room.at + 2) {
        plate.rect(mast.x, mast.y - 6, 1, 6, tone(palette.dark, 0.9));
        plate.rect(mast.x, mast.y - 7, 1, 1, SIGNAL);
        for (let s = 1; s <= 4; s++) plate.rect(mast.x + s, mast.y + s, 1, 1, (c) => tone(c, 0.72));
    }
    return plate;
};

/** Home is the one roof in the city with a garden on it. */
const gardenRoof = (palette: Palette, px: number, room: Square, rand: () => number): Plate => {
    const accent = palette.accent;
    const green = accent[1] > accent[0] && accent[1] > accent[2] ? mix(accent, GRASS, 0.4) : GRASS;
    const path = mix(palette.light, [196, 160, 112], 0.5);
    const middle = room.at + Math.floor(room.side / 2);
    const plate = new Plate(px, (x, y) => {
        if (x === middle || y === middle) return (x + y) % 2 ? path : tone(path, 0.9);
        const r = rand();
        return r < 0.12 ? tone(green, 1.18) : r < 0.22 ? tone(green, 0.8) : green;
    });
    const flowers: RGB[] = [palette.main, palette.light, [236, 190, 72]];
    for (let i = 0; i < 14; i++) {
        const x = room.at + 2 + Math.floor(rand() * (room.side - 4));
        const y = room.at + 2 + Math.floor(rand() * (room.side - 4));
        if (x === middle || y === middle) continue;
        plate.rect(x, y, 1, 1, flowers[i % flowers.length]);
        plate.rect(x, y + 1, 1, 1, tone(green, 0.7));
    }
    return plate;
};

// ------------------------------------------------------------------ slices

/** The drawing's span over `k` rows from `row`, as a square centred in a frame of `px`. */
const squareOf = (mini: Uint8ClampedArray, px: number, row: number, k: number): Square | null => {
    let a = px;
    let b = -1;
    for (let y = row; y < row + k; y++) {
        for (let x = 0; x < px; x++) {
            if (!mini[(y * px + x) * 4 + 3]) continue;
            if (x < a) a = x;
            if (x > b) b = x;
        }
    }
    if (b < a) return null;
    const side = b - a + 1;
    return { at: Math.floor((px - side) / 2), side, col: a };
};

/** Small patches of the facade's darkest fifth (its glass), some of which nightmare lights. */
const windowsOf = (mini: Uint8ClampedArray, px: number, rows: number, rand: () => number): Uint8Array => {
    const lit = new Uint8Array(px * rows);
    const lumas: number[] = [];
    for (let o = 0; o < mini.length; o += 4) if (mini[o + 3]) lumas.push(luma(mini[o], mini[o + 1], mini[o + 2]));
    lumas.sort((a, b) => a - b);
    const cut = lumas[Math.floor(lumas.length / 5)] ?? -1;
    const dark = (i: number) => !!mini[i * 4 + 3] && luma(mini[i * 4], mini[i * 4 + 1], mini[i * 4 + 2]) <= cut;
    const seen = new Uint8Array(px * rows);
    for (let start = 0; start < px * rows; start++) {
        if (seen[start] || !dark(start)) continue;
        const patch = [start];
        seen[start] = 1;
        for (let n = 0; n < patch.length; n++) {
            const i = patch[n];
            const x = i % px;
            for (const j of [x > 0 ? i - 1 : -1, x < px - 1 ? i + 1 : -1, i - px, i + px]) {
                if (j < 0 || j >= px * rows || seen[j] || !dark(j)) continue;
                seen[j] = 1;
                patch.push(j);
            }
        }
        if (patch.length >= 2 && patch.length <= 12 && rand() < 0.3) patch.forEach((i) => (lit[i] = 1));
    }
    return lit;
};

/** Roofs painted per drawing, so a block of one drawing does not wear one roof. */
export const ROOF_VARIANTS = 3;

/** Frames sit side by side with a clear texel round each, so none bleeds into the next. */
export const frameX = (i: number, px: number): number => i * (px + 2) + 1;

/**
 * A drawing cut into slices: one canvas, a `px` square frame per slice from
 * the ground up (at `frameX`, y 1), then `ROOF_VARIANTS` roofs to choose from.
 */
export const paintSlices = (art: Art, spec: SliceSpec): HTMLCanvasElement => {
    const { px, slices, rowsPerSlice: k } = spec;
    const rows = slices * k;
    const mini = shrink(art, px, rows);
    const palette = paletteOf(mini, px, rows);
    const squares = Array.from({ length: slices }, (_, i) => squareOf(mini, px, rows - (i + 1) * k, k));
    const roof = squares.reduce<Square | null>((last, s) => s || last, null) ?? { at: 0, side: px, col: 0 };

    const style: HouseRoof = hash(spec.seed) % 2 ? 'flat' : 'tiles';
    const flat = spec.kind !== 'building' || style === 'flat';
    const plates = Array.from({ length: ROOF_VARIANTS }, (_, v) => {
        const rand = random(hash(`${spec.seed}:${v}`));
        if (spec.kind === 'apt') return towerRoof(palette, px, roof, rand);
        if (spec.kind === 'goal') return gardenRoof(palette, px, roof, rand);
        return houseRoof(style, palette, px, roof, rand);
    });
    const parapet = mix(palette.light, palette.concrete, 0.4);
    const lit = spec.glow ? windowsOf(mini, px, rows, random(hash(`${spec.seed}:windows`))) : null;
    // Pulled towards the drawing's darkest colour, so a white wall's edge is as crisp as a brick one's.
    const edge = (c: RGB) => tone(mix(c, palette.dark, 0.5), OUTLINE);

    const canvas = document.createElement('canvas');
    canvas.width = frameX(slices + ROOF_VARIANTS, px) - 1;
    canvas.height = px + 2;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const image = ctx.createImageData(canvas.width, canvas.height);
    const put = (frame: number, x: number, y: number, c: RGB) =>
        image.data.set([c[0], c[1], c[2], 255], ((y + 1) * canvas.width + frameX(frame, px) + x) * 4);

    const walk = (s: Square, visit: (x: number, y: number, du: number, dv: number, depth: number, face: keyof typeof LIGHT) => void) => {
        for (let dv = 0; dv < s.side; dv++) {
            for (let du = 0; du < s.side; du++) {
                const across = Math.min(du, s.side - 1 - du);
                const down = Math.min(dv, s.side - 1 - dv);
                // Corners go to the sides, so the corner line runs unbroken.
                const face = across <= down ? (du <= s.side - 1 - du ? 'W' : 'E') : dv < s.side - 1 - dv ? 'N' : 'S';
                visit(s.at + du, s.at + dv, du, dv, Math.min(across, down), face);
            }
        }
    };

    squares.forEach((s, i) => {
        if (!s) return;
        const rim = Math.min(2 * k + 1, Math.floor(s.side / 2));
        const above = squares[i + 1] ?? null;
        const top = rows - (i + 1) * k;
        walk(s, (x, y, du, dv, depth, face) => {
            if (depth < rim) {
                // The rows run up the wall from its foot; deeper than they reach,
                // the top row carries on, so a slice that rises further than
                // usual (leaning at the screen's top) shows no gap.
                const along = face === 'S' ? du : face === 'N' ? s.side - 1 - du : face === 'E' ? s.side - 1 - dv : dv;
                const at = (top + (depth < k ? k - 1 - depth : 0)) * px + s.col + along;
                if (mini[at * 4 + 3]) {
                    const c: RGB = [mini[at * 4], mini[at * 4 + 1], mini[at * 4 + 2]];
                    const outline = du === 0 || du === s.side - 1;
                    put(i, x, y, outline ? edge(c) : lit && lit[at] ? WINDOW_GLOW : tone(c, LIGHT[face]));
                    return;
                }
            }
            // The top of this slice: roof, under the parapet's and the part above's shadows.
            const c = plates[0].at(x, y);
            const shaded =
                (depth === rim && (face === 'N' || face === 'W')) ||
                (!inside(above, x, y) && (inside(above, x - 1, y - 1) || inside(above, x - 2, y - 2)));
            put(i, x, y, shaded ? tone(c, 0.74) : c);
        });
    });

    // The roofs: a dark edge, and on a flat roof a parapet lit on its north-west and its shadow inside.
    plates.forEach((plate, v) =>
        walk(roof, (x, y, _du, _dv, depth, face) => {
            const c = plate.at(x, y);
            const sunny = face === 'N' || face === 'W';
            if (depth === 0) put(slices + v, x, y, edge(c));
            else if (flat && roof.side >= 8 && depth === 1) put(slices + v, x, y, tone(parapet, sunny ? 1.12 : 0.82));
            else if (flat && roof.side >= 8 && depth === 2 && sunny) put(slices + v, x, y, tone(c, 0.74));
            else put(slices + v, x, y, c);
        })
    );

    ctx.putImageData(image, 0, 0);
    return canvas;
};
