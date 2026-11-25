import { choosePose, derivePoses, freshMemory, type Moment } from './CatPoses';
import { BLACK, sculpt, type Pixels } from './TokenVolume';

// Phaser is only touched when figures are put into textures.
jest.mock('phaser', () => ({}));

const blank = (width: number, height: number): Pixels => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
const paint = (p: Pixels, x0: number, y0: number, x1: number, y1: number, rgb = [0, 0, 0]): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.data.set([...rgb, 255], (y * p.width + x) * 4);
};
const alpha = (p: Pixels, x: number, y: number): number => p.data[(y * p.width + x) * 4 + 3];
const red = (p: Pixels, x: number, y: number): number => p.data[(y * p.width + x) * 4];
const topRow = (p: Pixels, x: number): number => {
    for (let y = 0; y < p.height; y++) if (alpha(p, x, y)) return y;
    return -1;
};

describe('sculpt', () => {
    // A black block, wide and thick, with a thin post off one end.
    const art = blank(12, 10);
    paint(art, 1, 2, 9, 7);
    paint(art, 10, 6, 10, 9);
    const figure = sculpt(art, BLACK);
    const lift = BLACK.depth;

    it('keeps the drawing, and adds only the back over it', () => {
        expect(figure.height).toBe(art.height + lift);
        for (let y = 0; y < art.height; y++) {
            for (let x = 0; x < art.width; x++) {
                const under = [0, 1, 2].some((k) => y + k < art.height && alpha(art, x, y + k) > 0);
                if (alpha(art, x, y)) expect(alpha(figure, x, y + lift)).toBe(255);
                else if (!under) expect(alpha(figure, x, y + lift)).toBe(0);
            }
        }
    });

    it('shows a lit back over a thick part, but not over a thin one', () => {
        expect(alpha(figure, 5, 2 + lift - 1)).toBe(255);
        expect(red(figure, 5, 2 + lift - 1)).toBeGreaterThan(40);
        expect(alpha(figure, 10, 6 + lift - 1)).toBe(0);
    });

    it('lights the upper left and keeps the middle of a black drawing black', () => {
        expect(red(figure, 1, 2 + lift)).toBeGreaterThan(red(figure, 9, 7 + lift));
        expect(red(figure, 5, 5 + lift)).toBe(0);
    });

    it('faces the other way when flipped, light still on the left', () => {
        const left = sculpt(art, BLACK, true);
        expect(alpha(left, 1, 6 + lift)).toBe(255);
        expect(alpha(left, 10, 6 + lift)).toBe(255);
        expect(alpha(left, 11, 9 + lift)).toBe(0);
        expect(red(left, 2, 2 + lift)).toBeGreaterThan(red(left, 10, 7 + lift));
    });
});

describe('derivePoses', () => {
    // The shared layout: ears, a body down to the belly, legs under it.
    const drawing = (legs: number[]): Pixels => {
        const p = blank(20, 20);
        paint(p, 12, 1, 12, 3);
        paint(p, 2, 8, 17, 14, [150, 100, 40]);
        for (const x of legs) paint(p, x, 15, x + 1, 19);
        return p;
    };
    const poses = derivePoses(drawing([1, 7, 11, 16]), drawing([3, 6, 11, 13]));

    it('keeps every pose the size of the drawings', () => {
        for (const pose of Object.values(poses)) expect([pose.width, pose.height]).toEqual([20, 20]);
    });

    it('bobs the body up and down over the legs, and crouches lower still', () => {
        expect(topRow(poses.contact, 5)).toBe(8);
        expect(topRow(poses.up, 5)).toBe(7);
        expect(topRow(poses.down, 5)).toBe(9);
        expect(topRow(poses.crouch, 5)).toBe(10);
        expect(alpha(poses.up, 5, 19)).toBe(0);
        expect(alpha(poses.up, 6, 19)).toBe(255);
    });

    it('spreads the legs to leap', () => {
        expect(alpha(poses.leap, 0, 19)).toBe(255);
        expect(alpha(poses.leap, 18, 19)).toBe(255);
        expect(alpha(poses.contact, 0, 19)).toBe(0);
    });
});

describe('choosePose', () => {
    const at = (now: number, over: Partial<Moment> = {}): Moment => ({
        now,
        jumping: false,
        moving: false,
        walking: false,
        dashing: false,
        hurt: false,
        alert: false,
        stride: 0,
        late: false,
        ...over
    });

    it('crouches, leaps, lands, then stands', () => {
        const memory = freshMemory();
        expect(choosePose(at(1000, { jumping: true }), memory)).toBe('crouch');
        expect(choosePose(at(1300, { jumping: true }), memory)).toBe('leap');
        expect(choosePose(at(1600), memory)).toBe('land');
        expect(choosePose(at(2000), memory)).toBe('stand');
    });

    it('strides in four, slides when the ice has it, and flinches when hurt', () => {
        const memory = freshMemory();
        const walk = { moving: true, walking: true } as const;
        expect(choosePose(at(0, { ...walk, stride: 0 }), memory)).toBe('contact');
        expect(choosePose(at(0, { ...walk, stride: 0, late: true }), memory)).toBe('down');
        expect(choosePose(at(0, { ...walk, stride: 1 }), memory)).toBe('passing');
        expect(choosePose(at(0, { ...walk, stride: 1, late: true }), memory)).toBe('up');
        expect(choosePose(at(0, { moving: true }), memory)).toBe('slide');
        expect(choosePose(at(0, { ...walk, hurt: true }), memory)).toBe('hurt');
        expect(choosePose(at(0, { alert: true }), memory)).toBe('alert');
    });
});
