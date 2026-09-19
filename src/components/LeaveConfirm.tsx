import React from 'react';
import { motion } from 'framer-motion';
import { DoorOpen, Play } from 'lucide-react';
import { useTranslation } from '../i18n';
import { button, buttonRow, eyebrow, hazardEdge, headline, overlayBackdrop, panel, theme } from './theme';

interface LeaveConfirmProps {
    onStay: () => void;
    onLeave: () => void;
}

const MotionButton = motion.div as React.ElementType;
// The library's typings and React 19's disagree about ARIA attributes.
const MotionPanel = motion.div as React.ElementType;

/**
 * Asked once, at the last press of back.
 *
 * Toss requires that leaving is confirmed, and confirms it itself when the
 * player uses its X. The Android back button is the other way out, and once
 * a page subscribes to it the asking is the page's job. "Stay" is the loud
 * button: a stray press of back is far more common than a decision to go.
 */
const LeaveConfirm: React.FC<LeaveConfirmProps> = ({ onStay, onLeave }) => {
    const t = useTranslation();

    return (
        <div style={{ ...overlayBackdrop, zIndex: 1100 }}>
            <MotionPanel
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="mw-leave-title"
                style={{ ...panel, maxWidth: '400px' }}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
            >
                <div style={hazardEdge} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p style={eyebrow}>LEAVING</p>
                    <h2 id="mw-leave-title" style={{ ...headline(theme.accent), fontSize: '1.35rem' }}>
                        {t('leave.title')}
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.65, color: theme.inkMuted }}>
                        {t('leave.body')}
                    </p>
                </div>

                <div style={buttonRow}>
                    <MotionButton style={button('primary')} onClick={onStay} whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                        <Play size={13} />
                        {t('leave.stay')}
                    </MotionButton>
                    <MotionButton style={button('quiet')} onClick={onLeave} whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                        <DoorOpen size={13} />
                        {t('leave.go')}
                    </MotionButton>
                </div>
            </MotionPanel>
        </div>
    );
};

export default LeaveConfirm;
