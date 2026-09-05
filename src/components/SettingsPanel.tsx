import React from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, X } from 'lucide-react';
import { useSettings } from '../settings';
import type { Language } from '../settings';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../game/core/difficulty';
import { useTranslation } from '../i18n';
import { button, eyebrow, hazardEdge, headline, overlayBackdrop, panel, theme } from './theme';

interface SettingsPanelProps {
    onClose: () => void;
}

const MotionButton = motion.div as React.ElementType;

/**
 * Preferences, reachable before a run rather than buried in one.
 *
 * Only what has been agreed so far: sound and language. It is laid out as a
 * list of rows so more can be added without the panel needing to be redesigned
 * around them.
 */
const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
    const [settings, update] = useSettings();
    const t = useTranslation();

    return (
        <div style={overlayBackdrop}>
            <motion.div
                style={panel}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
            >
                <div style={hazardEdge} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p style={eyebrow}>{t('settings.eyebrow')}</p>
                    <h2 style={{ ...headline(theme.accent), fontSize: '1.35rem' }}>{t('settings.title')}</h2>
                </div>

                <Row label={t('settings.sound')}>
                    <Choice on={!settings.muted} onClick={() => update({ muted: false })}>
                        <Volume2 size={14} /> {t('settings.on')}
                    </Choice>
                    <Choice on={settings.muted} onClick={() => update({ muted: true })}>
                        <VolumeX size={14} /> {t('settings.off')}
                    </Choice>
                </Row>

                <Row label={t('settings.language')}>
                    {(['ko', 'en'] as Language[]).map((code) => (
                        <Choice
                            key={code}
                            on={settings.language === code}
                            onClick={() => update({ language: code })}
                        >
                            {code === 'ko' ? '한국어' : 'ENGLISH'}
                        </Choice>
                    ))}
                </Row>

                <Row label={t('settings.difficulty')}>
                    {DIFFICULTY_ORDER.map((key) => {
                        const level = DIFFICULTIES[key];
                        const on = settings.difficulty === key;

                        return (
                            <MotionButton
                                key={key}
                                onClick={() => update({ difficulty: key })}
                                whileTap={{ y: 1 }}
                                style={{
                                    flex: '1 1 0',
                                    padding: '9px 8px',
                                    borderRadius: '5px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    fontFamily: theme.display,
                                    fontSize: '0.56rem',
                                    letterSpacing: '0.06em',
                                    // The colour is the explanation.
                                    background: on ? `${level.color}22` : 'transparent',
                                    border: `1px solid ${on ? level.color : theme.rule}`,
                                    color: on ? level.color : theme.inkFaint
                                }}
                            >
                                {level.label}
                            </MotionButton>
                        );
                    })}
                </Row>

                <MotionButton style={button('primary')} onClick={onClose} whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                    <X size={13} />
                    {t('settings.close')}
                </MotionButton>
            </motion.div>
        </div>
    );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        <span
            style={{
                fontFamily: theme.display,
                fontSize: '0.55rem',
                letterSpacing: '0.07em',
                color: theme.inkFaint
            }}
        >
            {label}
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>{children}</div>
    </div>
);

const Choice: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({
    on,
    onClick,
    children
}) => (
    <MotionButton
        onClick={onClick}
        whileTap={{ y: 1 }}
        style={{
            flex: '1 1 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '9px 10px',
            borderRadius: '5px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontFamily: theme.body,
            fontSize: '0.8rem',
            background: on ? theme.surfaceRaised : 'transparent',
            border: `1px solid ${on ? theme.accent : theme.rule}`,
            color: on ? theme.accent : theme.inkFaint
        }}
    >
        {children}
    </MotionButton>
);

export default SettingsPanel;
