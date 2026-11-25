import { pileOf } from './StackEnding';

// Phaser is only touched when the ending runs.
jest.mock('phaser', () => ({}));

describe('pileOf', () => {
    it('piles nothing for nothing, and one on the ground for one', () => {
        expect(pileOf(0)).toEqual([]);
        expect(pileOf(1)).toEqual([{ x: 0, row: 0 }]);
    });

    it('fills each row before the next, every row narrower and centred', () => {
        const spots = pileOf(6);
        expect(spots.map((s) => s.row)).toEqual([0, 0, 0, 1, 1, 2]);
        expect(spots.map((s) => s.x)).toEqual([-1, 0, 1, -0.5, 0.5, 0]);
    });

    it('leaves a top row short rather than adding a row', () => {
        const spots = pileOf(4);
        expect(spots.filter((s) => s.row === 0)).toHaveLength(3);
        expect(spots.filter((s) => s.row === 1)).toHaveLength(1);
    });
});
