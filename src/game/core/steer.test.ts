import { STANDING, steer } from './steer';
import type { Blocked, Steering, Vec } from './steer';

/*
 * A street along row 1, with side streets down from columns 2 and 4.
 *
 *   ######
 *   #....#
 *   ##.#.#
 *   ##.#.#
 *   ######
 */
const MAP = ['######', '#....#', '##.#.#', '##.#.#', '######'];
const U = 96;
const street = { unit: U, open: (gx: number, gy: number) => MAP[gy]?.[gx] === '.' };
const box = { left: -18, right: 18, top: -20, bottom: -2 };
const cfg = { speed: 160, keepDeg: 15, sideShare: 0.5, bufferMs: 300, assistPx: 24, centring: 8, edgePx: 1 };
const free: Blocked = { up: false, down: false, left: false, right: false };

const RIGHT = { x: 1, y: 0 };
const DOWN = { x: 0, y: 1 };
const walking = (heading: Vec): Steering => ({ ...STANDING, heading });
const run = (feet: Vec, input: Vec, state: Steering = STANDING, now = 0, blocked = free) =>
    steer(feet, input, state, street, box, blocked, now, cfg);

test('a stick pushed a little walks at full speed', () => {
    expect(run({ x: U, y: U }, { x: 0.3, y: 0 }).velocity).toEqual({ x: 160, y: 0 });
});

test('a stick a little off straight walks straight, eased to the middle of the street', () => {
    const angle = (20 * Math.PI) / 180;
    const { velocity, facing } = run({ x: U, y: U + 10 }, { x: Math.cos(angle), y: Math.sin(angle) });
    expect(facing).toEqual(RIGHT);
    expect(velocity.x).toBe(160);
    expect(velocity.y).toBeLessThan(0);
});

test('a turn pressed beside the corner slides along to the opening, then takes it', () => {
    // 40px short of column 2's middle: the feet still overlap the building.
    const before = run({ x: 2 * U - 40, y: U }, DOWN, walking(RIGHT));
    expect(before.velocity).toEqual({ x: 160, y: 0 });

    const inside = run({ x: 2 * U - 26, y: U }, DOWN, walking(RIGHT));
    expect(inside.velocity.y).toBe(160);
    expect(inside.steering.heading).toEqual(DOWN);
});

test('a turn pressed early is held while the cat carries on, then lapses', () => {
    // Column 1 has no street down; column 2, a cell on, does.
    const early = run({ x: U + 10, y: U }, DOWN, walking(RIGHT), 1000);
    expect(early.velocity.x).toBe(160);
    expect(early.steering.pending).toEqual(DOWN);
    expect(early.steering.pendingUntil).toBe(1300);

    const held = run({ x: U + 30, y: U }, DOWN, early.steering, 1200);
    expect(held.velocity.x).toBe(160);
    expect(held.steering.pendingUntil).toBe(1300);

    const lapsed = run({ x: U + 40, y: U }, DOWN, held.steering, 1301);
    expect(lapsed.velocity).toEqual({ x: 0, y: 0 });
    expect(lapsed.facing).toEqual(DOWN);
});

test('a turn pressed just past the opening comes back to it', () => {
    const late = run({ x: 2 * U + 40, y: U }, DOWN, walking(RIGHT));
    expect(late.velocity).toEqual({ x: -160, y: 0 });
});

test('a stick leaning on is not slid back to an opening already passed', () => {
    const lean = run({ x: 2 * U + 40, y: U }, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, walking(RIGHT));
    expect(lean.velocity.x).toBe(160);
    expect(lean.steering.heading).toEqual(RIGHT);
});

test('a diagonal turns at the first open crossing, and only once there', () => {
    const diagonal = { x: Math.SQRT1_2, y: Math.SQRT1_2 };

    const passing = run({ x: U, y: U }, diagonal, walking(RIGHT));
    expect(passing.steering.heading).toEqual(RIGHT);

    const turning = run({ x: 2 * U, y: U }, diagonal, passing.steering);
    expect(turning.steering.heading).toEqual(DOWN);
    expect(turning.steering.turnedAt).toBe('2,1');

    // Still in that crossing, with the push still leaning right: no turning back.
    const after = run({ x: 2 * U, y: U + 5 }, diagonal, turning.steering);
    expect(after.steering.heading).toEqual(DOWN);
});

test('reversing is immediate, and letting go stands', () => {
    expect(run({ x: 2 * U, y: U }, { x: -1, y: 0 }, walking(RIGHT)).velocity.x).toBe(-160);
    const idle = run({ x: 2 * U, y: U }, { x: 0, y: 0 }, walking(RIGHT));
    expect(idle.velocity).toEqual({ x: 0, y: 0 });
    expect(idle.steering).toEqual(STANDING);
});

test('pressed against a wall with no turn to take, the cat stands rather than carrying on', () => {
    const stuck = run({ x: U, y: U }, DOWN, walking(RIGHT), 0, { ...free, right: true });
    expect(stuck.velocity).toEqual({ x: 0, y: 0 });
});
