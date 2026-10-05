jest.mock('./toss', () => ({ fetchUserKey: jest.fn(), recall: jest.fn(), remember: jest.fn() }));

const stored: Record<string, string> = {};
let toss: { fetchUserKey: jest.Mock; recall: jest.Mock; remember: jest.Mock };

/** The records module as a fresh page loads it, over the same storage. */
const load = () => {
    jest.resetModules();
    toss = require('./toss');
    toss.recall.mockImplementation(async (key: string) => stored[key] ?? null);
    toss.remember.mockImplementation((key: string, value: string) => {
        stored[key] = value;
    });
    return require('./records') as typeof import('./records');
};

beforeEach(() => Object.keys(stored).forEach((key) => delete stored[key]));

test('a run filed before the key arrives is kept, and written with the slot', async () => {
    stored['mazewhiskers.records.k1'] = JSON.stringify({ runs: 3, bestScore: 900, endings: { idle: 2 } });
    const { openRecords, fileRun, getRecords } = load();
    let answer: (key: string) => void = () => undefined;
    toss.fetchUserKey.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    const opening = openRecords();
    fileRun({ score: 500, lastedMs: 20_000, ending: 'idle' });
    expect(stored['mazewhiskers.records.local']).toBeUndefined();

    answer('k1');
    await opening;
    expect(getRecords()).toMatchObject({ runs: 4, bestScore: 900, endings: { idle: 3 } });
    expect(JSON.parse(stored['mazewhiskers.records.k1']).runs).toBe(4);
});

test('runs from a session without a key join the player once a key comes, once', async () => {
    stored['mazewhiskers.records.local'] = JSON.stringify({ runs: 2, clears: 1, bestClearMs: 40_000, endings: { home: 1 } });
    stored['mazewhiskers.records.k1'] = JSON.stringify({ runs: 5, clears: 1, bestClearMs: 55_000, endings: { idle: 5 } });

    for (let page = 0; page < 2; page++) {
        const { openRecords, getRecords } = load();
        toss.fetchUserKey.mockResolvedValue('k1');
        await openRecords();
        expect(getRecords()).toMatchObject({ runs: 7, clears: 2, bestClearMs: 40_000, endings: { home: 1, idle: 5 } });
    }
    expect(JSON.parse(stored['mazewhiskers.records.local']).runs).toBe(0);
});
