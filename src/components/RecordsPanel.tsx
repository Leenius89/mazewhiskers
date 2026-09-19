import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useRecords } from '../platform/records';
import { formatClockShort } from '../platform/format';
import {
    button,
    eyebrow,
    hazardEdge,
    headline,
    hint,
    overlayBackdrop,
    panel,
    statCell,
    statGrid,
    statHero,
    statHeroValue,
    statLabel,
    statValue,
    theme
} from './theme';

interface RecordsPanelProps {
    onClose: () => void;
}

const MotionButton = motion.div as React.ElementType;

/**
 * The player's own shelf.
 *
 * Inside Toss the ranking button opens Toss's leaderboard, which knows who
 * everyone is and needs nothing from this page. This is what the same button
 * shows where there is no such board: what this player has done, kept under
 * the key Toss issued them, with nothing typed in and nothing sent anywhere.
 */
const RecordsPanel: React.FC<RecordsPanelProps> = ({ onClose }) => {
    const t = useTranslation();
    const records = useRecords();

    return (
        <div style={overlayBackdrop}>
            <motion.div
                style={panel}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
            >
                <div style={hazardEdge} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p style={eyebrow}>MY RECORDS</p>
                    <h2 style={{ ...headline(theme.accent), fontSize: '1.35rem' }}>{t('records.title')}</h2>
                </div>

                {records.runs === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.65, color: theme.inkMuted }}>
                        {t('records.empty')}
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={statHero}>
                            <span style={statLabel}>{t('records.bestScore')}</span>
                            <span style={{ ...statHeroValue, color: theme.accent }}>
                                {records.bestScore.toLocaleString()}
                            </span>
                        </div>
                        <div style={statGrid}>
                            <div style={statCell}>
                                <span style={statLabel}>{t('records.bestClear')}</span>
                                <span style={statValue}>
                                    {records.bestClearMs > 0 ? formatClockShort(records.bestClearMs) : '—'}
                                </span>
                            </div>
                            <div style={statCell}>
                                <span style={statLabel}>{t('records.longest')}</span>
                                <span style={statValue}>{formatClockShort(records.longestMs)}</span>
                            </div>
                        </div>
                        <div style={statGrid}>
                            <div style={statCell}>
                                <span style={statLabel}>{t('records.runs')}</span>
                                <span style={statValue}>{records.runs.toLocaleString()}</span>
                            </div>
                            <div style={statCell}>
                                <span style={statLabel}>{t('records.clears')}</span>
                                <span style={statValue}>{records.clears.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                )}

                <p style={hint}>{t('records.tossNote')}</p>

                <MotionButton style={button('primary')} onClick={onClose} whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                    <X size={13} />
                    {t('settings.close')}
                </MotionButton>
            </motion.div>
        </div>
    );
};

export default RecordsPanel;
