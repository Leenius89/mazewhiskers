import { drawSheets } from './pixelFxArt';

describe('pixel effect strips', () => {
    const sheets = drawSheets();

    it('draws something in every frame', () => {
        for (const sheet of sheets) {
            const stride = sheet.w * sheet.ms.length;
            expect(sheet.data.length).toBe(stride * sheet.h * 4);
            sheet.ms.forEach((_, f) => {
                let opaque = 0;
                for (let y = 0; y < sheet.h; y++) {
                    for (let x = 0; x < sheet.w; x++) opaque += sheet.data[(y * stride + f * sheet.w + x) * 4 + 3] ? 1 : 0;
                }
                expect({ key: sheet.key, frame: f, empty: opaque === 0 }).toEqual({ key: sheet.key, frame: f, empty: false });
            });
        }
    });

    it('has every animation the effects play, and none the stacked city would take for dust', () => {
        const names = sheets.flatMap((sheet) => sheet.runs?.map((run) => run.key) ?? [sheet.key]);
        for (const key of [
            'fx-spark-milk', 'fx-spark-fish', 'fx-ring', 'fx-kick', 'fx-step', 'fx-frost', 'fx-billow', 'fx-chunk',
            'fx-alert', 'fx-alert-out', 'fx-impact', 'fx-burst', 'fx-confetti', 'fx-splash'
        ]) {
            expect(names).toContain(key);
        }
        // SpriteStack piles up any sprite whose texture starts with "dust".
        expect(sheets.filter((sheet) => sheet.key.startsWith('dust'))).toEqual([]);
    });
});
