import { CITY_KINDS } from './cityKinds';
import { isNextDay, kindForDay, todayKey } from './daily';

const DAY = 24 * 60 * 60 * 1000;
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe('today in Korea', () => {
    it('turns over at Korean midnight, not UTC midnight', () => {
        // 14:59 UTC is 23:59 KST; a minute later it is tomorrow in Seoul.
        expect(todayKey(Date.UTC(2026, 9, 3, 14, 59))).toBe('2026-10-03');
        expect(todayKey(Date.UTC(2026, 9, 3, 15, 0))).toBe('2026-10-04');
    });

    it('knows the day after, across a month and a year', () => {
        expect(isNextDay('2026-09-30', '2026-10-01')).toBe(true);
        expect(isNextDay('2026-12-31', '2027-01-01')).toBe(true);
        expect(isNextDay('2026-10-01', '2026-10-03')).toBe(false);
    });
});

describe('the city of the day', () => {
    const start = Date.UTC(2026, 0, 1);
    const days = Array.from({ length: 2000 }, (_, i) => kindForDay(keyOf(start + i * DAY)).key);

    it('never repeats the same kind two days running', () => {
        days.slice(1).forEach((kind, i) => expect(`${days[i]} -> ${kind}`).not.toBe(`${kind} -> ${kind}`));
    });

    it('shows every kind once in each twenty days', () => {
        for (let block = 0; block + CITY_KINDS.length <= days.length; block += CITY_KINDS.length) {
            expect(new Set(days.slice(block, block + CITY_KINDS.length)).size).toBe(CITY_KINDS.length);
        }
    });
});
