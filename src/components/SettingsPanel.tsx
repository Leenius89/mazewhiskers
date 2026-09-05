import React from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, X } from 'lucide-react';
import { useSettings } from '../settings';
import type { Language } from '../settings';
import { button, eyebrow, hazardEdge, headline, hint, overlayBackdrop, panel, theme } from './theme';

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
                    <p style={eyebrow}>SETTINGS</p>
                    <h2 style={{ ...headline(theme.accent), fontSize: '1.35rem' }}>설정</h2>
                </div>

                <Row label="소리 / SOUND">
                    <Choice on={!settings.muted} onClick={() => update({ muted: false })}>
                        <Volume2 size={14} /> 켬 / ON
                    </Choice>
                    <Choice on={settings.muted} onClick={() => update({ muted: true })}>
                        <VolumeX size={14} /> 끔 / OFF
                    </Choice>
                </Row>

                <Row label="언어 / LANGUAGE">
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

                <p style={hint}>
                    언어는 메뉴와 결과 화면에 적용됩니다. 게임 중 대사는 아직 한국어입니다.
                </p>

                <MotionButton style={button('primary')} onClick={onClose} whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                    <X size={13} />
                    닫기 / CLOSE
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
