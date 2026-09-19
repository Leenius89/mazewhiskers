import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { ENDING_KEYS, useRecords } from '../platform/records';
import { button, eyebrow, hazardEdge, headline, hint, overlayBackdrop, panel, theme } from './theme';

interface EndingsPanelProps {
    onClose: () => void;
}

const MotionButton = motion.div as React.ElementType;

/**
 * Every way a run has ended for this player, and the ways it has not yet.
 *
 * The endings were always the part of the game that says what it is about:
 * caught, priced out, built over, walled in, or simply standing still while
 * the rent went out. Seen one at a time, on the way to a retry button, they
 * pass as flavour. Laid out together they read as what they are — a list of
 * the ways a city gets rid of someone — with one line on it that is not.
 *
 * An ending that has not been reached is a blank, not a spoiler: its title
 * is withheld and nothing hints at how to find it.
 */
const EndingsPanel: React.FC<EndingsPanelProps> = ({ onClose }) => {
    const t = useTranslation();
    const { endings } = useRecords();
    const seen = ENDING_KEYS.filter((key) => endings[key]).length;

    return (
        <div style={overlayBackdrop}>
            <motion.div
                style={{ ...panel, gap: '18px' }}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
            >
                <div style={hazardEdge} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p style={eyebrow}>
                        ENDINGS {seen}/{ENDING_KEYS.length}
                    </p>
                    <h2 style={{ ...headline(theme.accent), fontSize: '1.35rem' }}>{t('endings.title')}</h2>
                </div>

                {/* The list scrolls, the way out does not: with every ending
                    found this is taller than a phone inside Toss, and the
                    close button should not be something to go looking for. */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        maxHeight: '46vh',
                        overflowY: 'auto',
                        overscrollBehavior: 'contain'
                    }}
                >
                    {ENDING_KEYS.map((key, index) => {
                        const count = endings[key] ?? 0;
                        const found = count > 0;
                        const home = key === 'home';
                        const color = home ? theme.good : theme.accent;

                        return (
                            <div
                                key={key}
                                style={{
                                    display: 'flex',
                                    gap: '10px',
                                    alignItems: 'baseline',
                                    padding: '9px 11px',
                                    borderRadius: '5px',
                                    border: `1px solid ${found ? `${color}66` : theme.rule}`,
                                    background: found ? `${color}14` : 'transparent'
                                }}
                            >
                                <span
                                    style={{
                                        fontFamily: theme.display,
                                        fontSize: '0.5rem',
                                        color: found ? color : theme.inkFaint,
                                        minWidth: '1.6em'
                                    }}
                                >
                                    {String(index + 1).padStart(2, '0')}
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                                    <span
                                        style={{
                                            fontSize: '0.88rem',
                                            fontWeight: 600,
                                            color: found ? theme.ink : theme.inkFaint
                                        }}
                                    >
                                        {found ? t(home ? 'win.title' : `over.${key}.title`) : '？？？'}
                                    </span>
                                    {found && (
                                        <span style={{ fontSize: '0.74rem', lineHeight: 1.55, color: theme.inkMuted }}>
                                            {t(home ? 'endings.home.body' : `over.${key}.body`)}
                                        </span>
                                    )}
                                </div>
                                {found && (
                                    <span
                                        style={{
                                            fontSize: '0.72rem',
                                            color: theme.inkFaint,
                                            fontVariantNumeric: 'tabular-nums',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        ×{count.toLocaleString()}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                <p style={hint}>{t(seen === ENDING_KEYS.length ? 'endings.complete' : 'endings.note')}</p>

                <MotionButton style={button('primary')} onClick={onClose} whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                    <X size={13} />
                    {t('settings.close')}
                </MotionButton>
            </motion.div>
        </div>
    );
};

export default EndingsPanel;
