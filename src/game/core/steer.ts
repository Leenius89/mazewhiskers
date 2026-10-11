/**
 * Walking a grid with a thumb.
 *
 * The streets run four ways and are one cell wide. The cat's feet are 36px
 * across in a 96px street and it walks 160px a second, so the moment for
 * turning into a side street lasts about four tenths of a second. Taken
 * literally, a stick held a few degrees off straight scraped the cat along a
 * wall, a turn pressed a moment early ran it into the corner and stopped it,
 * and a stick pushed halfway walked it at half speed. This reads what the
 * player meant instead:
 *
 * - one of the four directions, keeping the one being walked a little past
 *   the halfway angle so a wobbling thumb does not flip it;
 * - full speed whenever the stick is pushed at all;
 * - a diagonal means "this way, and turn that way where a street opens";
 * - a turn pressed early is held for a moment while the cat carries on;
 * - a turn pressed beside an opening first slides the cat along to it;
 * - and a walking cat is eased to the middle of its street.
 *
 * The keys go through the same rules, so the keyboard and the stick — and the
 * web game and the Toss one — still judge a run the same way. Jumps do not:
 * they read the stick as it is, in eight directions.
 */

export interface Vec {
    x: number;
    y: number;
}

/** The feet's collision box around the feet, in world pixels. */
export interface FootBox {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** The streets, as far as walking is concerned. */
export interface Street {
    /** A cell's size; cell (gx, gy) is centred on (gx * unit, gy * unit). */
    unit: number;
    /** Whether a body can walk into this cell: inside the city, not a building, not a tower. */
    open(gx: number, gy: number): boolean;
}

/** Which way the body is pressed against something, as of the last physics step. */
export interface Blocked {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}

export interface Steering {
    /** The direction being walked, or null when standing. */
    heading: Vec | null;
    /** A turn pressed before its street opened, held until `pendingUntil`. */
    pending: Vec | null;
    pendingUntil: number;
    /** The cell of the last turn: a diagonal turns once per crossing, not back and forth in it. */
    turnedAt: string | null;
}

export const STANDING: Steering = { heading: null, pending: null, pendingUntil: 0, turnedAt: null };

export interface SteerConfig {
    speed: number;
    /** Degrees past halfway the direction being walked is kept. */
    keepDeg: number;
    /** A diagonal's smaller part, as a share of the push, that asks for a turn. */
    sideShare: number;
    /** How long a turn pressed early is held. */
    bufferMs: number;
    /** Furthest the cat is slid sideways to line up with an opening. */
    assistPx: number;
    /** Per second: how hard a walking cat is eased to the middle of its street. */
    centring: number;
    /** Clearance kept from a wall when judging whether the feet fit a street. */
    edgePx: number;
}

export interface Step {
    velocity: Vec;
    steering: Steering;
    /** The way the cat faces: where it walks, or where it is pressing. */
    facing: Vec | null;
}

const ZERO: Vec = { x: 0, y: 0 };

const same = (a: Vec | null, b: Vec | null): boolean => !!a && !!b && a.x === b.x && a.y === b.y;
const across = (a: Vec, b: Vec): boolean => a.x * b.x + a.y * b.y === 0;
const cellKey = (feet: Vec, unit: number): string => `${Math.round(feet.x / unit)},${Math.round(feet.y / unit)}`;

/** The nearest of the four directions; ties go across. */
const axisOf = (v: Vec): Vec =>
    Math.abs(v.x) >= Math.abs(v.y) ? { x: Math.sign(v.x), y: 0 } : { x: 0, y: Math.sign(v.y) };

/** The direction the push means, holding on to the one being walked. */
const primaryOf = (input: Vec, heading: Vec | null, keepDeg: number): Vec => {
    if (heading) {
        const cos = (input.x * heading.x + input.y * heading.y) / Math.hypot(input.x, input.y);
        if (cos >= Math.cos(((45 + keepDeg) * Math.PI) / 180)) return heading;
    }
    return axisOf(input);
};

/** The turn a diagonal asks for alongside `primary`, if the push leans far enough. */
const sideOf = (input: Vec, primary: Vec, share: number): Vec | null => {
    const lean = primary.x !== 0 ? input.y : input.x;
    if (Math.abs(lean) < share * Math.hypot(input.x, input.y)) return null;
    return primary.x !== 0 ? { x: 0, y: Math.sign(lean) } : { x: Math.sign(lean), y: 0 };
};

interface Lane {
    /** The next cell in this direction can be walked into. */
    open: boolean;
    /** The feet sit wholly inside this direction's street. */
    fits: boolean;
    /** Sideways distance to where they would, when they do not. */
    shift: number;
}

/** Whether the feet fit the street that runs in `dir` through the nearest cell. */
const laneOf = (feet: Vec, dir: Vec, street: Street, box: FootBox, edge: number): Lane => {
    const u = street.unit;
    const gx = Math.round(feet.x / u);
    const gy = Math.round(feet.y / u);
    const open = street.open(gx + dir.x, gy + dir.y);

    // Up or down: the feet between the column's walls. Across: between the row's.
    const [at, centre, near, far] = dir.y !== 0 ? [feet.x, gx * u, box.left, box.right] : [feet.y, gy * u, box.top, box.bottom];
    const lo = centre - u / 2 + edge - near;
    const hi = centre + u / 2 - edge - far;
    const fits = at >= lo && at <= hi;

    return { open, fits, shift: fits ? 0 : at < lo ? lo - at : hi - at };
};

/** Walking `dir`, eased towards the middle of its street. */
const walk = (feet: Vec, dir: Vec, street: Street, cfg: SteerConfig): Vec => {
    const u = street.unit;
    const ease = (at: number) =>
        Math.max(-cfg.speed / 2, Math.min(cfg.speed / 2, (Math.round(at / u) * u - at) * cfg.centring));

    return dir.x !== 0 ? { x: dir.x * cfg.speed, y: ease(feet.y) } : { x: ease(feet.x), y: dir.y * cfg.speed };
};

/** Sliding sideways to line up with a street, at walking pace. */
const slideOver = (dir: Vec, shift: number, speed: number): Vec =>
    dir.y !== 0 ? { x: Math.sign(shift) * speed, y: 0 } : { x: 0, y: Math.sign(shift) * speed };

/** A sideways slide the push does not argue with: a stick leaning one way is not slid the other. */
const agrees = (input: Vec, dir: Vec, shift: number, share: number): boolean => {
    const lean = dir.y !== 0 ? input.x : input.y;
    if (Math.abs(lean) < share * Math.hypot(input.x, input.y)) return true;
    return Math.sign(lean) === Math.sign(shift);
};

const pressedAgainst = (dir: Vec, blocked: Blocked): boolean =>
    (dir.x > 0 && blocked.right) || (dir.x < 0 && blocked.left) || (dir.y > 0 && blocked.down) || (dir.y < 0 && blocked.up);

/**
 * One frame of walking: the velocity the push asks for, and what to remember.
 *
 * `feet` is where the cat stands (its ground point), `input` the raw push —
 * keys or stick, any length up to one.
 */
export const steer = (
    feet: Vec,
    input: Vec,
    state: Steering,
    street: Street,
    box: FootBox,
    blocked: Blocked,
    now: number,
    cfg: SteerConfig
): Step => {
    if (input.x === 0 && input.y === 0) return { velocity: ZERO, steering: STANDING, facing: null };

    const heading = state.heading;
    const here = cellKey(feet, street.unit);
    const primary = primaryOf(input, heading, cfg.keepDeg);
    const side = sideOf(input, primary, cfg.sideShare);

    const go = (dir: Vec, turned: boolean): Step => ({
        velocity: walk(feet, dir, street, cfg),
        steering: { heading: dir, pending: null, pendingUntil: 0, turnedAt: turned ? here : state.turnedAt },
        facing: dir
    });

    // A diagonal turns where its side street opens, once per crossing.
    if (side && here !== state.turnedAt) {
        const lane = laneOf(feet, side, street, box, cfg.edgePx);
        if (lane.open && lane.fits) return go(side, true);
    }

    const turning = !!heading && across(primary, heading);
    const lane = laneOf(feet, primary, street, box, cfg.edgePx);

    // Off a street with an opening beside the feet: slide along to it first.
    const lineUp =
        lane.open &&
        !lane.fits &&
        Math.abs(lane.shift) <= cfg.assistPx &&
        agrees(input, primary, lane.shift, cfg.sideShare);

    if (!turning) {
        if (lineUp) {
            return {
                velocity: slideOver(primary, lane.shift, cfg.speed),
                steering: { ...state, heading: null, pending: null },
                facing: primary
            };
        }
        return go(primary, false);
    }

    // A turn off the street being walked.
    if (lane.open && lane.fits) return go(primary, true);
    if (lineUp) {
        return {
            velocity: slideOver(primary, lane.shift, cfg.speed),
            steering: { ...state, pending: null },
            facing: primary
        };
    }

    // Not open yet: carry on along the street a moment, the turn held.
    const until = same(state.pending, primary) ? state.pendingUntil : now + cfg.bufferMs;
    const along = heading as Vec;
    if (now < until && !pressedAgainst(along, blocked)) {
        return {
            velocity: walk(feet, along, street, cfg),
            steering: { heading: along, pending: primary, pendingUntil: until, turnedAt: state.turnedAt },
            facing: along
        };
    }

    // Lapsed, or nowhere to carry on to: stand, facing the way pressed.
    return {
        velocity: ZERO,
        steering: { heading: null, pending: primary, pendingUntil: until, turnedAt: state.turnedAt },
        facing: primary
    };
};
