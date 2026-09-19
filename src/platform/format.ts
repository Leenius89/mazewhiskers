/** `02:31.20` — minutes, seconds, hundredths. The form every clock in the game uses. */
export const formatClock = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const hundredths = Math.floor((ms % 1000) / 10);

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
};

/**
 * `02:31` — for a cell too narrow for the hundredths.
 *
 * The pixel face is fifteen pixels a glyph; eight of them do not fit a third
 * of a phone-width panel, and a clock that runs out of its box reads as a bug.
 */
export const formatClockShort = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};
