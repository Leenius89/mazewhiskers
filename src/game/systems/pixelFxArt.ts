/**
 * The pixel effects, drawn in code a texel at a time.
 *
 * Every effect is a short strip of frames in the city's own colours: the dust
 * is the dust the towers land in, the frost is the ice on the road, the
 * sparkles are the milk's and the fish's. A moment with a body in it is acted
 * the same way each time: a frame that gathers (the wind-up), a frame that is
 * held (the contact, where the world stops for a beat), then the throw, with
 * everything pushed outward and gone.
 *
 * Nothing here knows about Phaser. The strips are plain RGBA, so the same
 * drawings can be laid out and looked at offline.
 */

export interface Sheet {
    key: string;
    /** One frame's size, in texels. */
    w: number;
    h: number;
    /** How long each frame shows, in ms: one entry per frame. */
    ms: number[];
    /** Where the strip is pinned to the spot it plays at, as a share of its height. */
    originY: number;
    /** Plays round until it is put away, instead of once. */
    loop?: boolean;
    /** Named runs of frames, when one strip holds more than one animation. A held run stays on its last frame. */
    runs?: { key: string; frames: number[]; hold?: boolean }[];
    /** RGBA, the frames side by side. */
    data: Uint8ClampedArray<ArrayBuffer>;
}

type Put = (x: number, y: number, colour: number) => void;

const WHITE = 0xffffff;
// The towers' dust.
const DUST_HI = 0xefe1d5;
const DUST = 0xedcaa9;
const DUST_TAN = 0xeab773;
const DUST_MID = 0xbf8f52;
const DUST_LO = 0x845d2f;
// The road's ice.
const ICE_HI = 0xe6f8ff;
const ICE = 0x8fd4e8;
const ICE_LO = 0x5fa9c4;
// The fish.
const TEAL_HI = 0xa8e6e0;
const TEAL = 0x5ba6a8;
const TEAL_LO = 0x315b5b;
// The milk.
const MILK_HI = 0xededed;
// Heat, for a hit and for the alarm.
const GOLD_HI = 0xfff3a8;
const GOLD = 0xffd23f;
const ORANGE = 0xf07b2c;
const RED = 0xb43026;
const INK = 0x1b1420;
const GREEN = 0x6ee7a8;
// A tower's broken concrete.
const CONCRETE_HI = 0xa3a5aa;
const CONCRETE = 0x77797e;
const CONCRETE_LO = 0x3a3c42;
// Rain in the dark.
const RAIN_HI = 0xe8f0ff;
const RAIN = 0xa9bde0;

const strip = (
    key: string,
    w: number,
    h: number,
    ms: number[],
    draw: (put: Put, f: number) => void,
    extra: Partial<Sheet> = {}
): Sheet => {
    const stride = w * ms.length;
    const data = new Uint8ClampedArray(stride * h * 4);
    ms.forEach((_, f) => {
        const put: Put = (x, y, colour) => {
            const px = Math.round(x);
            const py = Math.round(y);
            if (px < 0 || py < 0 || px >= w || py >= h) return;
            const at = (py * stride + f * w + px) * 4;
            data[at] = (colour >> 16) & 255;
            data[at + 1] = (colour >> 8) & 255;
            data[at + 2] = colour & 255;
            data[at + 3] = 255;
        };
        draw(put, f);
    });
    return { key, w, h, ms, originY: 0.5, data, ...extra };
};

/** A fixed scatter: a dissolve eats the same texels every time it plays. */
const grain = (x: number, y: number): number => {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
};

/** `n` points round an ellipse, the first straight right of the centre. */
const around = (n: number, r: number, cx: number, cy: number, squash = 1, turn = 0) =>
    Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2 + turn;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash, k, a] as const;
    });

/** A plus, coloured by distance from its middle. */
const plus = (put: Put, x: number, y: number, arm: number, colour: (i: number) => number): void => {
    put(x, y, colour(0));
    for (let i = 1; i <= arm; i++) {
        put(x + i, y, colour(i));
        put(x - i, y, colour(i));
        put(x, y + i, colour(i));
        put(x, y - i, colour(i));
    }
};

/** A ray from `r0` to `r1` out along angle `a`, coloured by how far along it is (0 to 1). */
const ray = (put: Put, cx: number, cy: number, a: number, r0: number, r1: number, colour: (t: number) => number): void => {
    const n = Math.max(1, Math.ceil(r1 - r0));
    for (let i = 0; i <= n; i++) {
        const r = r0 + ((r1 - r0) * i) / n;
        put(cx + Math.cos(a) * r, cy + Math.sin(a) * r, colour(i / n));
    }
};

type Circle = [cx: number, cy: number, rx: number, ry?: number];
const circles =
    (list: Circle[]) =>
    (x: number, y: number): boolean =>
        list.some(([cx, cy, rx, ry = rx]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);

/**
 * A soft lump (dust, a cloud) lit from the top left: a light rim where the
 * light catches it, a shaded band and a dark rim underneath, and `eaten` of
 * it dissolved away.
 */
const lump = (
    put: Put,
    w: number,
    h: number,
    inside: (x: number, y: number) => boolean,
    eaten: number,
    [hi, body, lo, rim]: number[]
): void => {
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!inside(x, y) || grain(x, y) < eaten) continue;
            put(x, y, !inside(x - 1, y - 1) ? hi : !inside(x + 1, y + 1) ? rim : !inside(x + 1, y + 2) ? lo : body);
        }
    }
};

/** Sparkles bursting off something picked up, in its colours. */
const spark = (key: string, [hot, hi, mid, lo]: number[]): Sheet =>
    strip(key, 21, 21, [40, 50, 60, 70, 80, 100], (put, f) => {
        const c = 10;
        if (f === 0) {
            // Contact: a hard white point.
            plus(put, c, c, 2, (i) => (i < 2 ? hot : hi));
            for (const [x, y] of around(4, 1.5, c, c, 1, Math.PI / 4)) put(x, y, hi);
            return;
        }
        if (f === 1) {
            plus(put, c, c, 9, (i) => (i <= 3 ? hot : i <= 6 ? hi : mid));
            for (const [x, y] of around(4, 2.9, c, c, 1, Math.PI / 4)) put(x, y, hot);
            for (const [x, y] of around(4, 4.3, c, c, 1, Math.PI / 4)) put(x, y, hi);
            return;
        }
        const r = [5.5, 7.5, 9, 10][f - 2];
        if (f === 2) put(c, c, mid);
        for (const [x, y, k] of around(8, r, c, c)) {
            if (k % 2 === 0) {
                if (f === 2) plus(put, x, y, 1, (i) => (i ? hi : hot));
                else if (f === 3) plus(put, x, y, 1, (i) => (i ? mid : hi));
                else put(x, y, f === 4 ? hi : lo);
            } else if (f < 5) {
                const [dx, dy] = [(x - c) * 0.8 + c, (y - c) * 0.8 + c];
                put(dx, dy, [hot, hi, mid][f - 2]);
            }
        }
    });

/** Dust pressed flat by a landing, then thrown out in a ring. */
const landRing = (): Sheet =>
    strip('fx-ring', 37, 15, [60, 50, 60, 70, 80, 100], (put, f) => {
        const cx = 18;
        const cy = 7;
        if (f === 0) {
            for (let y = -1; y <= 1; y++) {
                for (let x = -8; x <= 8; x++) {
                    if ((x / 8.5) ** 2 + (y / 1.6) ** 2 <= 1) put(cx + x, cy + y, y < 0 ? DUST_HI : y > 0 ? DUST_TAN : DUST);
                }
            }
            return;
        }
        const s = (f - 1) / 4;
        const rx = 9 + 8.5 * s;
        const ry = rx * 0.4;
        const th = [4, 3.4, 2.6, 2, 1.5][f - 1];
        const outer = (x: number, y: number): boolean => {
            const dx = x - cx;
            const dy = y - cy;
            const bump = 1 + 0.1 * Math.sin(Math.atan2(dy / 0.4, dx) * 7 + f);
            return (dx / (rx * bump)) ** 2 + (dy / (ry * bump)) ** 2 <= 1;
        };
        for (let y = 0; y < 15; y++) {
            for (let x = 0; x < 37; x++) {
                if (!outer(x, y)) continue;
                if (((x - cx) / (rx - th)) ** 2 + ((y - cy) / (ry - Math.max(1.2, th * 0.55))) ** 2 <= 1) continue;
                if (grain(x + f * 3, y) < (s - 0.45) * 1.5) continue;
                put(x, y, !outer(x, y + 1) ? DUST_TAN : y < cy ? DUST_HI : DUST);
            }
        }
    });

/** The push off the ground at take-off: pressed flat, then two puffs kicked apart. */
const kick = (): Sheet =>
    strip(
        'fx-kick',
        33,
        11,
        [40, 50, 60, 80, 100],
        (put, f) => {
            const cx = 16;
            const ground = 9;
            if (f === 0) {
                for (let x = -6; x <= 6; x++) {
                    put(cx + x, ground - 1, Math.abs(x) < 6 ? DUST_HI : DUST);
                    put(cx + x, ground, Math.abs(x) < 6 ? DUST : DUST_TAN);
                }
                return;
            }
            const s = f / 4;
            const off = 4 + 10 * s;
            const r = [3, 3.7, 3.4, 2.6][f - 1];
            const lift = 1 + 2 * s;
            const inside = circles([
                [cx - off, ground - lift, r, r * 0.85],
                [cx + off, ground - lift, r, r * 0.85]
            ]);
            lump(put, 33, 11, inside, (s - 0.7) * 2, [DUST_HI, DUST, DUST, DUST_TAN]);
        },
        { originY: 9.5 / 11 }
    );

/** A footstep's puff. */
const step = (): Sheet =>
    strip(
        'fx-step',
        9,
        6,
        [60, 70, 90, 110],
        (put, f) => {
            const r = [1.6, 2.2, 2.6, 2.3][f];
            lump(put, 9, 6, circles([[4, 4 - f * 0.5, r, r * 0.8]]), [0, 0, 0.3, 0.6][f], [DUST_HI, DUST_HI, DUST, DUST]);
        },
        { originY: 4.5 / 6 }
    );

/** A glint and chips of ice off a sliding cat's feet. */
const frost = (): Sheet =>
    strip('fx-frost', 11, 11, [40, 60, 70, 80, 100], (put, f) => {
        const c = 5;
        if (f === 0) put(c, c, WHITE);
        if (f === 1) plus(put, c, c, 2, (i) => (i < 2 ? WHITE : ICE_HI));
        if (f === 2) plus(put, c, c, 3, (i) => (i <= 1 ? WHITE : i === 2 ? ICE_HI : ICE));
        if (f === 3) plus(put, c, c, 1, () => ICE_HI);
        if (f === 4) put(c, c, ICE_HI);
        for (const [x, y, k] of around(4, [1.5, 3, 4, 4.5, 5][f], c, c, 1, Math.PI / 4)) {
            if (f < 4 || k % 2 === 0) put(x, y, [WHITE, ICE_HI, ICE_HI, ICE_LO, ICE_LO][f]);
        }
    });

/** A tower's dust rolling out from its foot. */
const billow = (): Sheet =>
    strip(
        'fx-billow',
        23,
        18,
        [70, 80, 90, 100, 120, 130, 150],
        (put, f) => {
            const g = [0.45, 0.7, 0.88, 1, 1.05, 1.1, 1.12][f];
            const r = 5 * g;
            const cy = 12 - f * 0.6;
            const inside = circles([
                [11 - 3.8 * g, cy + 1, r],
                [11 + 3.8 * g, cy + 1.2, r * 0.95],
                [11, cy - 2.4 * g, r * 1.1]
            ]);
            lump(put, 23, 18, inside, [0, 0, 0, 0.12, 0.32, 0.55, 0.8][f], [DUST_HI, DUST_TAN, DUST_MID, DUST_LO]);
        },
        { originY: 16.5 / 18 }
    );

/** A lump of concrete, tumbling. */
const ROCK: [number, number, number][] = [
    [-1, -1, CONCRETE_HI],
    [0, -1, CONCRETE_HI],
    [1, -1, CONCRETE],
    [-1, 0, CONCRETE],
    [0, 0, CONCRETE],
    [1, 0, CONCRETE_LO],
    [-1, 1, CONCRETE],
    [0, 1, CONCRETE_LO]
];
const chunk = (): Sheet =>
    strip(
        'fx-chunk',
        5,
        5,
        [70, 70, 70, 70],
        (put, f) => {
            for (const [x, y, colour] of ROCK) {
                let [u, v] = [x, y];
                for (let i = 0; i < f; i++) [u, v] = [-v, u];
                put(2 + u, 2 + v, colour);
            }
        },
        { loop: true }
    );

/** The black cat's "!": a gathering spark, a white pop, the mark held, then squashed away. */
const alert = (): Sheet => {
    const bang = (x: number, y: number): boolean =>
        (y >= 1 && y <= 9 && x >= 5 && x <= 9) ||
        (y >= 10 && y <= 11 && x >= 6 && x <= 8) ||
        (y === 12 && x === 7) ||
        (y >= 15 && y <= 18 && x >= 5 && x <= 9);
    const glyph = (put: Put, fill: number, shine: number): void => {
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 15; x++) {
                if (bang(x, y)) put(x, y, x === 5 && y < 10 ? shine : fill);
                else if ([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => bang(x + dx, y + dy)))) put(x, y, INK);
            }
        }
    };
    return strip(
        'fx-alert',
        15,
        20,
        [40, 90, 70, 60, 50, 70],
        (put, f) => {
            if (f === 0) {
                plus(put, 7, 10, 3, (i) => (i ? GOLD : WHITE));
                for (const [x, y] of around(4, 5, 7, 10, 1, Math.PI / 4)) put(x, y, RED);
            }
            if (f === 1) {
                glyph(put, WHITE, WHITE);
                for (const [x, y] of [[1, 2], [2, 3], [13, 2], [12, 3], [1, 17], [2, 16], [13, 17], [12, 16]]) put(x, y, RED);
            }
            if (f === 2) {
                glyph(put, GOLD, GOLD_HI);
                for (const [x, y] of [[0, 1], [14, 1], [0, 18], [14, 18]]) put(x, y, RED);
            }
            if (f === 3) glyph(put, GOLD, GOLD_HI);
            // Out: squeezed to a line, then gone.
            if (f === 4) for (const y of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16]) put(7, y, GOLD_HI);
            if (f === 5) for (const [x, y] of [[5, 17], [7, 14], [9, 17]]) put(x, y, GOLD_HI);
        },
        {
            originY: 1,
            runs: [
                { key: 'fx-alert', frames: [0, 1, 2, 3], hold: true },
                { key: 'fx-alert-out', frames: [4, 5] }
            ]
        }
    );
};

/** Caught: a pinch, a white frame held through the hit-stop, then a star breaking into shards. */
const impact = (): Sheet =>
    strip('fx-impact', 27, 27, [30, 80, 50, 60, 70, 90], (put, f) => {
        const c = 13;
        if (f === 0) {
            plus(put, c, c, 1, () => WHITE);
            for (const [x, y] of around(8, 3.5, c, c)) put(x, y, GOLD);
        }
        if (f === 1) {
            for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 21) put(c + x, c + y, WHITE);
            for (const [, , k, a] of around(8, 0, c, c)) {
                const len = k % 2 ? 8 : 12;
                ray(put, c, c, a, 4, len, (t) => (t < 0.85 ? WHITE : GOLD_HI));
                if (k % 2 === 0) {
                    // The four main spikes are thick at the root.
                    const [nx, ny] = [-Math.sin(a), Math.cos(a)];
                    ray(put, c + nx, c + ny, a, 4, len * 0.5, () => WHITE);
                    ray(put, c - nx, c - ny, a, 4, len * 0.5, () => WHITE);
                }
            }
        }
        if (f === 2) {
            for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 9) put(c + x, c + y, x || y ? GOLD_HI : WHITE);
            for (const [, , k, a] of around(8, 0, c, c)) {
                ray(put, c, c, a, 3, k % 2 ? 7 : 11, (t) => (t < 0.4 ? GOLD_HI : t < 0.8 ? GOLD : ORANGE));
            }
            for (const [x, y, k] of around(16, 7, c, c)) if (k % 2 === 0) put(x, y, ORANGE);
        }
        if (f === 3) {
            for (const [x, y, k] of around(40, 9.5, c, c)) if (k % 5 < 3) put(x, y, ORANGE);
            for (const [, , , a] of around(8, 0, c, c)) ray(put, c, c, a, 5, 7, () => GOLD);
        }
        if (f === 4) {
            for (const [, , , a] of around(8, 0, c, c, 1, Math.PI / 8)) {
                put(c + Math.cos(a) * 11, c + Math.sin(a) * 11, ORANGE);
                put(c + Math.cos(a) * 12, c + Math.sin(a) * 12, RED);
            }
        }
        if (f === 5) for (const [x, y, k] of around(8, 12.5, c, c, 1, Math.PI / 8)) if (k % 2 === 0) put(x, y, RED);
    });

/** Home: a firework of the game's colours. */
const BURST = [GOLD, GREEN, ORANGE, TEAL_HI];
const burst = (): Sheet =>
    strip('fx-burst', 31, 31, [40, 60, 70, 80, 100, 120, 140], (put, f) => {
        const c = 15;
        if (f === 0) {
            plus(put, c, c, 3, (i) => (i < 2 ? WHITE : GOLD));
            return;
        }
        if (f === 1) {
            for (const [, , , a] of around(12, 0, c, c)) ray(put, c, c, a, 2, 6, (t) => (t < 0.5 ? WHITE : GOLD));
            return;
        }
        const r = [9, 11.5, 13, 14, 14.5][f - 2];
        const trail = [3, 2, 1, 0, 0][f - 2];
        const droop = [0, 0, 1, 2, 3][f - 2];
        for (const [, , k, a] of around(12, 0, c, c)) {
            const colour = BURST[k % BURST.length];
            if (f === 5 && grain(k, f) < 0.25) continue;
            if (f === 6 && k % 2) continue;
            const at = (d: number): [number, number] => [c + Math.cos(a) * d, c + Math.sin(a) * d + droop];
            for (let j = 1; j <= trail; j++) put(...at(r - j), f === 2 ? GOLD : colour);
            if (f <= 3) plus(put, ...at(r), 1, (i) => (i ? colour : f === 2 ? WHITE : GOLD));
            else put(...at(r), colour);
        }
    });

/** A scrap of confetti turning over. White, to be tinted. */
const confetti = (): Sheet =>
    strip(
        'fx-confetti',
        4,
        4,
        [80, 80, 80, 80],
        (put, f) => {
            const shapes = [
                [[0, 1, WHITE], [1, 1, WHITE], [2, 1, WHITE], [0, 2, 0xc0c0c0], [1, 2, 0xc0c0c0], [2, 2, 0xc0c0c0]],
                [[0, 1, WHITE], [1, 1, WHITE], [1, 2, 0xc0c0c0], [2, 2, 0xc0c0c0]],
                [[0, 2, 0xa0a0a0], [1, 2, 0xa0a0a0], [2, 2, 0xa0a0a0]],
                [[2, 1, WHITE], [1, 1, WHITE], [1, 2, 0xc0c0c0], [0, 2, 0xc0c0c0]]
            ];
            for (const [x, y, colour] of shapes[f]) put(x, y, colour);
        },
        { loop: true }
    );

/** Snowflakes, far to near. Frames are picked, not played. */
const flake = (): Sheet =>
    strip('fx-flake', 3, 3, [0, 0, 0], (put, f) => {
        if (f === 0) put(1, 1, WHITE);
        if (f === 1) plus(put, 1, 1, 1, (i) => (i ? ICE_HI : WHITE));
        if (f === 2) for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(x, y, x + y === 2 ? ICE_HI : WHITE);
    });

/** A streak of drizzle, falling a little to the left. Long and short. */
const drop = (): Sheet =>
    strip('fx-drop', 3, 7, [0, 0], (put, f) => {
        const streak =
            f === 0
                ? [[2, 0, RAIN], [2, 1, RAIN], [1, 2, RAIN_HI], [1, 3, RAIN_HI], [1, 4, RAIN_HI], [0, 5, RAIN_HI], [0, 6, WHITE]]
                : [[2, 1, RAIN], [1, 2, RAIN], [1, 3, RAIN_HI], [0, 4, RAIN_HI], [0, 5, WHITE]];
        for (const [x, y, colour] of streak) put(x, y, colour);
    });

/** Where a drop lands. */
const splash = (): Sheet =>
    strip(
        'fx-splash',
        7,
        5,
        [50, 60, 70, 90],
        (put, f) => {
            const frames = [
                [[3, 3, RAIN_HI], [3, 2, RAIN_HI]],
                [[1, 1, RAIN_HI], [5, 1, RAIN_HI], [2, 3, RAIN], [3, 3, RAIN], [4, 3, RAIN]],
                [[0, 2, RAIN], [6, 2, RAIN], [2, 2, RAIN_HI], [3, 2, RAIN_HI], [4, 2, RAIN_HI], [1, 3, RAIN_HI], [5, 3, RAIN_HI], [2, 4, RAIN_HI], [3, 4, RAIN_HI], [4, 4, RAIN_HI]],
                [[1, 2, RAIN], [5, 2, RAIN], [0, 3, RAIN], [6, 3, RAIN], [3, 4, RAIN]]
            ];
            for (const [x, y, colour] of frames[f]) put(x, y, colour);
        },
        { originY: 0.7 }
    );

/** Every strip, drawn. */
export const drawSheets = (): Sheet[] => [
    spark('fx-spark-milk', [WHITE, MILK_HI, ICE, ICE_LO]),
    spark('fx-spark-fish', [WHITE, TEAL_HI, TEAL, TEAL_LO]),
    landRing(),
    kick(),
    step(),
    frost(),
    billow(),
    chunk(),
    alert(),
    impact(),
    burst(),
    confetti(),
    flake(),
    drop(),
    splash()
];
