import React from 'react';
import { useTranslation } from '../i18n';
import type { RunOutcome } from '../platform/score';
import { ENDING_KEYS } from '../platform/records';
import { shortDate } from '../platform/daily';
import { hint, statHero, statHeroValue, statLabel, theme } from './theme';

interface ScoreSlipProps {
    outcome: RunOutcome | null;
    /** The hero number's colour: the ending's own. */
    color: string;
}

/**
 * The run's score, itemised, and where it went.
 *
 * This is where the name box used to be. Nobody types anything now — Toss
 * knows who is playing — so the space says what the number is made of
 * instead. A score that arrives as one figure teaches nothing; one that shows
 * a thousand for getting home and eight hundred for doing it quickly tells
 * the player what the next run should be.
 */
const ScoreSlip: React.FC<ScoreSlipProps> = ({ outcome, color }) => {
    const t = useTranslation();
    if (!outcome) return null;

    const { breakdown, broken, sent, daily, endingsSeen } = outcome;

    const parts: Array<[string, string]> = [[t('slip.gathered'), breakdown.gathered.toLocaleString()]];
    if (breakdown.clearBonus > 0) parts.push([t('slip.clear'), `+${breakdown.clearBonus.toLocaleString()}`]);
    if (breakdown.timeBonus > 0) parts.push([t('slip.time'), `+${breakdown.timeBonus.toLocaleString()}`]);
    if (breakdown.weight !== 1) parts.push([t('slip.weight'), `×${breakdown.weight}`]);

    const status: Record<string, [string, string]> = {
        pending: [t('slip.sending'), theme.inkFaint],
        sent: [t('slip.sent'), theme.good],
        rejected: [t('slip.rejected'), theme.bad],
        unavailable: [t('slip.kept'), theme.inkMuted]
    };
    const [statusText, statusColor] = status[sent ?? 'pending'];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {daily && (
                <p style={{ ...hint, color: theme.accent, fontWeight: 600, textAlign: 'left' }}>
                    {t('daily.tag')} {shortDate(daily.date)} · {t('daily.best')} {daily.best.toLocaleString()} ·{' '}
                    {t('daily.tries').replace('{n}', String(daily.tries))}
                </p>
            )}

            <div style={statHero}>
                <span style={statLabel}>{t('slip.total')}</span>
                <span style={{ ...statHeroValue, color }}>{breakdown.total.toLocaleString()}</span>
            </div>

            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px 14px',
                    fontSize: '0.78rem',
                    color: theme.inkMuted,
                    fontVariantNumeric: 'tabular-nums'
                }}
            >
                {parts.map(([label, value]) => (
                    <span key={label} style={{ whiteSpace: 'nowrap' }}>
                        {label} <strong style={{ color: theme.ink, fontWeight: 600 }}>{value}</strong>
                    </span>
                ))}
            </div>

            {broken.newEnding && (
                <p style={{ ...hint, color: theme.accent, fontWeight: 600 }}>
                    {t('endings.found')} · {endingsSeen}/{ENDING_KEYS.length}
                </p>
            )}

            {broken.daily && !broken.score && !broken.clear && (
                <p style={{ ...hint, color: theme.accent, fontWeight: 600 }}>{t('daily.newBest')}</p>
            )}

            {(broken.score || broken.clear) && (
                <p style={{ ...hint, color: theme.accent, fontWeight: 600 }}>
                    {broken.clear ? t('slip.newClear') : t('slip.newScore')}
                </p>
            )}

            <p style={{ ...hint, color: statusColor }}>{statusText}</p>
        </div>
    );
};

export default ScoreSlip;
