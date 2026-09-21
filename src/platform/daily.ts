/**
 * Today's city, as the Toss build refers to it.
 *
 * The mode itself lives in the game (`game/core/daily`): the Korean date, the
 * twenty-day wheel of city kinds, and the arming that fixes both the seed and
 * the kind. This file exists so the Toss-side screens have one import to
 * reach for, and so the names they were written against keep working.
 */
export {
    todayKey,
    isNextDay,
    shortDate,
    armDaily,
    disarmDaily,
    dailyDate,
    dailySeed,
    dailyKind,
    dailyKind as dailyPlan,
    kindForDay,
    kindForDay as planFor
} from '../game/core/daily';

export type { CityKind as DailyPlan } from '../game/core/cityKinds';
export { CITY_KINDS as DAILY_PLANS } from '../game/core/cityKinds';
