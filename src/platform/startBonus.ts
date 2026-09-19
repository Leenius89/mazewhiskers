/**
 * Milk the next run sets out with, beyond the one carton every run gets.
 *
 * Its own file, with nothing in it but the number, so the game scene can ask
 * for it without pulling the ad code (and React) in after it.
 */
let owed = 0;
const listeners = new Set<() => void>();

export const grantStartBonus = (jumps: number): void => {
    owed = jumps;
    listeners.forEach((listener) => listener());
};

export const startBonusHeld = (): boolean => owed > 0;

/** Handed over once, to the run that is starting. */
export const takeStartBonus = (): number => {
    const taken = owed;
    owed = 0;
    if (taken) listeners.forEach((listener) => listener());
    return taken;
};

export const onStartBonusChanged = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
