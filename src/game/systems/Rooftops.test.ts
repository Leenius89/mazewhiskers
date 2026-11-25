import { shrink } from './Rooftops';
import type { Art } from './Rooftops';

/** A 6x6 drawing: tan wall, a one-pixel dark line down column 1, the top-right quarter empty. */
const drawing = (): Art => {
    const pixels = new Uint8ClampedArray(6 * 6 * 4);
    for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 6; x++) {
            const empty = x >= 3 && y < 3;
            pixels.set(empty ? [0, 0, 0, 0] : x === 1 ? [20, 20, 30, 255] : [200, 170, 120, 255], (y * 6 + x) * 4);
        }
    }
    return { pixels, width: 6, height: 6, left: 0, right: 5, top: 0, bottom: 5, widthShare: 1, heightShare: 1, strips: new Map() };
};

test("shrinking keeps a thin dark line, the drawing's own colours, and its holes", () => {
    const mini = shrink(drawing(), 2, 2);
    const at = (x: number, y: number) => Array.from(mini.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4));
    // The line is a third of each left texel, and still wins it.
    expect(at(0, 0)).toEqual([20, 20, 30, 255]);
    expect(at(0, 1)).toEqual([20, 20, 30, 255]);
    expect(at(1, 0)[3]).toBe(0);
    expect(at(1, 1)).toEqual([200, 170, 120, 255]);
});
