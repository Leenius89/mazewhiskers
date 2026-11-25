import type { Pixels } from './TokenVolume';

/**
 * Trial (`?stack`): more poses for the cats than their two walk drawings, the
 * way a key-pose tool works: the drawings are the key poses, and the rest are
 * made from them by moving whole art pixels, so every pose keeps the drawings'
 * palette and outline.
 *
 * Both cats are drawn on the same 20x20 layout (the black cat is the orange one
 * filled in), so one set of landmarks serves both. The first drawing has its
 * legs apart (a stride's contact), the second has them gathered (passing).
 *
 * - The body above the belly can be raised or lowered column by column: legs
 *   stretch or fold to meet it, which is a crouch, a breath or an arched back.
 * - Legs can be spread, hind legs back and front legs forward.
 * - Ears can be pinned or perked, eyes squeezed shut, the tail lifted.
 *
 * The real sprite keeps its two drawings for physics and size; only the figure
 * drawn for it changes (see TokenVolume).
 */

export type Pose =
    | 'contact'
    | 'passing'
    | 'stand'
    | 'inhale'
    | 'crouch'
    | 'leap'
    | 'land'
    | 'slide'
    | 'hurt'
    | 'alert';

/** First row of belly and legs: everything above it moves as one body. */
const BELLY = 13;
/** First row of legs alone. */
const FEET = 15;
/** Hind legs are left of this column, front legs from it on; the head is from it on too. */
const MIDDLE = 10;
/** The back between the tail and the head, and how far each column of it arches. */
const ARCH = [0, 0, 0, 1, 2, 2, 2, 2, 2, 1];
/** Where the eyes are: a row through their middle, and their columns. */
const EYE_ROW = 7;
const EYES = [12, 13, 14, 16, 17, 18];
/** The tail's columns, left of the body. */
const TAIL = 2;

const clone = (p: Pixels): Pixels => ({ width: p.width, height: p.height, data: p.data.slice() });

/** Copies a pixel of `from` into `to`; from outside the picture, a clear one. */
const put = (to: Pixels, x: number, y: number, from: Pixels, fx: number, fy: number): void => {
    const at = (y * to.width + x) * 4;
    if (fx < 0 || fy < 0 || fx >= from.width || fy >= from.height) {
        to.data.fill(0, at, at + 4);
        return;
    }
    const src = (fy * from.width + fx) * 4;
    for (let c = 0; c < 4; c++) to.data[at + c] = from.data[src + c];
};

/**
 * The body above the belly raised (`dy` < 0) or lowered, in columns `x0` to
 * `x1`. Raised, the first belly row stretches to fill under it; lowered, it
 * folds the top of the legs away.
 */
const rise = (p: Pixels, dy: number, x0 = 0, x1 = p.width - 1): Pixels => {
    const q = clone(p);
    for (let x = x0; x <= x1; x++) {
        if (dy < 0) for (let y = 0; y < BELLY; y++) put(q, x, y, p, x, Math.min(y - dy, BELLY));
        else for (let y = 0; y < BELLY + dy; y++) put(q, x, y, p, x, y - dy);
    }
    return q;
};

/** Hind legs moved back by `hind` and front legs forward by `front`. */
const spread = (p: Pixels, hind: number, front: number): Pixels => {
    const q = clone(p);
    for (let y = FEET; y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
            const from = x < MIDDLE ? x + hind : x - front;
            put(q, x, y, p, (from < MIDDLE) === (x < MIDDLE) ? from : -1, y);
        }
    }
    return q;
};

/** Ears pinned back: cleared down to row `to` (their tips are on row 1). */
const pin = (p: Pixels, to: number): Pixels => {
    const q = clone(p);
    for (let y = 0; y <= to; y++) for (let x = MIDDLE; x < p.width; x++) put(q, x, y, p, -1, -1);
    return q;
};

/** Ears pricked up a row taller. */
const perk = (p: Pixels): Pixels => {
    const q = clone(p);
    for (let y = 0; y < 3; y++) for (let x = MIDDLE; x < p.width; x++) put(q, x, y, p, x, y + 1);
    return q;
};

/** The tail's tip lifted a row. */
const tailUp = (p: Pixels): Pixels => {
    const q = clone(p);
    for (let y = 0; y < BELLY; y++) for (let x = 0; x < TAIL; x++) put(q, x, y, p, x, y + 1);
    return q;
};

/**
 * Eyes squeezed shut: a line through the middle and fur above and below. The
 * line is the pupils' dark on a light coat and the eyes' own glow on a black
 * one, where a dark line would not show.
 */
const squint = (p: Pixels): Pixels => {
    const q = clone(p);
    const fur = (5 * p.width + 13) * 4;
    const dark = p.data[fur] * 0.3 + p.data[fur + 1] * 0.59 + p.data[fur + 2] * 0.11 < 40;
    // An iris pixel on a black coat, a pupil pixel on a light one.
    const line = dark ? 12 : 13;
    for (const x of EYES) {
        put(q, x, EYE_ROW - 1, p, x, EYE_ROW - 2);
        put(q, x, EYE_ROW, p, line, EYE_ROW);
        put(q, x, EYE_ROW + 1, p, x, EYE_ROW - 2);
    }
    return q;
};

/** Every pose, from the two walk drawings: legs apart, then legs gathered. */
export const derivePoses = (apart: Pixels, gathered: Pixels): Record<Pose, Pixels> => {
    // Raised a column at a time, each by its own amount.
    let arched = gathered;
    ARCH.forEach((n, x) => {
        if (n) arched = rise(arched, -n, x, x);
    });
    return {
        contact: apart,
        passing: gathered,
        stand: gathered,
        inhale: rise(gathered, -1, 4, 8),
        crouch: rise(gathered, 2),
        leap: rise(spread(apart, 1, 1), -1),
        land: rise(spread(apart, 1, 1), 2),
        slide: pin(rise(spread(gathered, 0, 2), 1), 1),
        hurt: rise(pin(squint(gathered), 1), -1),
        alert: tailUp(perk(arched))
    };
};

// ------------------------------------------------------------ which pose

/** What a cat is doing this frame, as far as its pose cares. */
export interface Moment {
    now: number;
    jumping: boolean;
    moving: boolean;
    /** Its legs are walking, as opposed to the ice carrying it. */
    walking: boolean;
    dashing: boolean;
    hurt: boolean;
    alert: boolean;
    /** Which walk drawing is up. */
    stride: 0 | 1;
}

/** What a cat's pose remembers between frames. */
export interface PoseMemory {
    tookOffAt: number;
    landedAt: number;
    airborne: boolean;
}

export const freshMemory = (): PoseMemory => ({ tookOffAt: -Infinity, landedAt: -Infinity, airborne: false });

/** A jump starts crouched, and a landing stays squashed, for this long. */
const CROUCH_MS = 110;
const LAND_MS = 170;
/** Half a breath, in and out, matching the sprite's own breathing squash. */
const BREATH_MS = 715;

export const choosePose = (m: Moment, memory: PoseMemory): Pose => {
    if (m.jumping && !memory.airborne) memory.tookOffAt = m.now;
    if (!m.jumping && memory.airborne) memory.landedAt = m.now;
    memory.airborne = m.jumping;

    if (m.hurt) return 'hurt';
    if (m.jumping) return m.now - memory.tookOffAt < CROUCH_MS ? 'crouch' : 'leap';
    if (m.now - memory.landedAt < LAND_MS) return 'land';
    if (m.alert) return 'alert';
    if (m.dashing) return 'leap';
    if (m.moving && !m.walking) return 'slide';
    // A stride is the two drawings and nothing between: in-betweens read as a shiver.
    if (m.moving) return m.stride ? 'passing' : 'contact';
    return Math.floor(m.now / BREATH_MS) % 2 ? 'inhale' : 'stand';
};
