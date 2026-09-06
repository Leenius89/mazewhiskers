import React from 'react';
import { motion } from 'framer-motion';
import { Home, Moon, Play, RotateCcw, Sun, Volume2, VolumeX } from 'lucide-react';
import { useSettings } from '../settings';
import type { Appearance, Language } from '../settings';
import { useTranslation } from '../i18n';
import { button, buttonRow, eyebrow, hazardEdge, headline, overlayBackdrop, panel, theme } from './theme';

interface PauseMenuProps {
    onResume: () => void;
    onRestart: () => void;
    onMainMenu: () => void;
}

const MotionButton = motion.div as React.ElementType;

/**
 * One button in the run bar, and everything behind it.
 *
 * The bar used to carry a mute toggle and a restart button, which is two
 * controls for the two things nobody needs mid-run and none for the things they
 * do: turning the sound down, changing the light, giving up and going back. It
 * is one button now, and opening it stops the game.
 *
 * Stopping it matters. The cat loses health by existing, so a menu that left the
 * clock running would charge rent for reading it — and the run's own timer would
 * bank the minutes. Everything is on the scene clock, and the scene is paused.
 */
const PauseMenu: React.FC<PauseMenuProps> = ({ onResume, onRestart, onMainMenu }) => {
    const [settings, update] = useSettings();
    const t = useTranslation();

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
                    <p style={eyebrow}>{t('pause.eyebrow')}</p>
                    <h2 style={{ ...headline(theme.accent), fontSize: '1.35rem' }}>{t('pause.title')}</h2>
                </div>

                <Row label={t('settings.sound')}>
                    <Choice on={!settings.muted} onClick={() => update({ muted: false })}>
                        <Volume2 size={14} /> {t('settings.on')}
                    </Choice>
                    <Choice on={settings.muted} onClick={() => update({ muted: true })}>
                        <VolumeX size={14} /> {t('settings.off')}
                    </Choice>
                </Row>

                <Row label={t('settings.appearance')}>
                    {([
                        ['dark', Moon, t('settings.dark')],
                        ['light', Sun, t('settings.light')]
                    ] as [Appearance, typeof Moon, string][]).map(([mode, Icon, label]) => (
                        <Choice
                            key={mode}
                            on={settings.appearance === mode}
                            onClick={() => update({ appearance: mode })}
                        >
                            <Icon size={14} /> {label}
                        </Choice>
                    ))}
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

                {/*
                    Difficulty is deliberately not here.
                    It is chosen before a run and recorded with the result; being
                    able to turn it down once the black cat is close would make
                    every board meaningless.
                */}

                <MotionButton
                    style={button('primary')}
                    onClick={onResume}
                    whileHover={{ y: -1 }}
                    whileTap={{ y: 0 }}
                >
                    <Play size={13} />
                    {t('pause.resume')}
                </MotionButton>

                <div style={buttonRow}>
                    <MotionButton style={button('quiet')} onClick={onRestart} whileTap={{ y: 1 }}>
                        <RotateCcw size={13} />
                        {t('pause.restart')}
                    </MotionButton>
                    <MotionButton style={button('quiet')} onClick={onMainMenu} whileTap={{ y: 1 }}>
                        <Home size={13} />
                        {t('pause.mainMenu')}
                    </MotionButton>
                </div>
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

export default PauseMenu;
