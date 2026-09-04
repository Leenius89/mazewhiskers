export type GameMode = 'exhibition' | 'arcade';

/**
 * The two audiences, expressed as settings rather than as separate code paths.
 *
 * A gallery visitor gets one short, forgiving run they can understand without
 * being told; a returning player gets a longer, harder run worth putting on a
 * leaderboard. Everything that differs between them lives here, so the game
 * itself never branches on which one is playing.
 */
export interface ModeSettings {
    key: GameMode;
    label: string;

    /** Enemies in the first district. */
    enemies: number;
    /** Added per district after the first. */
    enemiesPerDistrict: number;

    /** Multiplies the grace period before redevelopment begins. */
    apartmentDelayScale: number;
    /** Multiplies the gap between rows. Below 1 means the city closes faster. */
    apartmentIntervalScale: number;
    /** Compounds per district, so later districts are tighter. */
    districtPressureStep: number;

    contactDamage: number;
    dashEnabled: boolean;

    /** Districts that make up one run. */
    districts: number;

    /** Exhibition holds the visitor on the tutorial until they choose to start. */
    allowTutorialSkip: boolean;

    /** Where the maze seed comes from. */
    seedStrategy: 'url' | 'daily';

    /** Returns to the attract screen on its own. Kiosks are unattended. */
    idleReturnMs: number | null;
}

const EXHIBITION: ModeSettings = {
    key: 'exhibition',
    label: '전시 / EXHIBITION',
    enemies: 1,
    enemiesPerDistrict: 0,
    apartmentDelayScale: 1.3,
    apartmentIntervalScale: 1.15,
    districtPressureStep: 1,
    contactDamage: -35,
    dashEnabled: false,
    districts: 1,
    allowTutorialSkip: false,
    seedStrategy: 'url',
    idleReturnMs: 45_000
};

const ARCADE: ModeSettings = {
    key: 'arcade',
    label: '아케이드 / ARCADE',
    enemies: 1,
    enemiesPerDistrict: 1,
    apartmentDelayScale: 0.75,
    apartmentIntervalScale: 0.85,
    districtPressureStep: 0.85,
    contactDamage: -50,
    dashEnabled: true,
    districts: 3,
    allowTutorialSkip: true,
    seedStrategy: 'daily',
    idleReturnMs: null
};

const MODES: Record<GameMode, ModeSettings> = {
    exhibition: EXHIBITION,
    arcade: ARCADE
};

const readParam = (name: string): string | null => {
    try {
        return new URLSearchParams(window.location.search).get(name);
    } catch {
        return null;
    }
};

/** Exhibition is the default: an unconfigured kiosk should behave as one. */
export const resolveMode = (): ModeSettings => {
    const requested = readParam('mode');
    return requested === 'arcade' ? MODES.arcade : MODES.exhibition;
};

export const getMode = (key: GameMode): ModeSettings => MODES[key];

/**
 * Seed for the maze.
 *
 * Exhibition takes it from the URL so a show can pin one city for the day.
 * Arcade uses the date, so everyone competing on a given day faces the same
 * maze — a leaderboard over different mazes compares nothing.
 */
export const resolveSeed = (mode: ModeSettings): string | null => {
    if (mode.seedStrategy === 'daily') {
        return `daily-${new Date().toISOString().slice(0, 10)}`;
    }
    return readParam('seed');
};

/** Pressure multiplier for a given district, 1-based. */
export const districtPressure = (mode: ModeSettings, district: number): number =>
    Math.pow(mode.districtPressureStep, Math.max(0, district - 1));
