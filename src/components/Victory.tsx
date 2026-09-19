import React from 'react';
import { motion } from 'framer-motion';
import { Film, Home, RotateCcw, Trophy } from 'lucide-react';
import { useTranslation } from '../i18n';
import ScoreSlip from './ScoreSlip';
import MilkOffer from './MilkOffer';
import type { RunOutcome } from '../platform/score';
import { formatClock } from '../platform/format';
import {
    button,
    buttonRow,
    eyebrow,
    hazardEdge,
    headline,
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

interface VictoryProps {
    onRetry: () => void;
    onMainMenu: () => void;
    onShowLeaderboard: () => void;
    /** Shows the chosen ad; resolves true when the milk is earned. */
    onWatchAd: () => Promise<boolean>;
    onShowCredits: () => void;
    timeMs: number;
    milkCount: number;
    fishCount: number;
    /** Scored and sent by the time this is shown; see App's `settle`. */
    outcome: RunOutcome | null;
}

const MotionButton = motion.div as React.ElementType;

const Victory: React.FC<VictoryProps> = ({
    onRetry,
    onMainMenu,
    onShowLeaderboard,
    onWatchAd,
    onShowCredits,
    timeMs,
    milkCount,
    fishCount,
    outcome
}) => {
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <p style={eyebrow}>ARRIVED</p>
                    <h2 style={headline(theme.good)}>{t('win.title')}</h2>
                    <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.65, color: theme.inkMuted }}>
                        도시가 먼저 도착하지 못했습니다. 이번에는.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={statHero}>
                        <span style={statLabel}>CLEAR TIME</span>
                        <span style={{ ...statHeroValue, color: theme.good }}>{formatClock(timeMs)}</span>
                    </div>
                    <div style={statGrid}>
                        <div style={statCell}>
                            <span style={statLabel}>🐟 FISH</span>
                            <span style={statValue}>{fishCount}</span>
                        </div>
                        <div style={statCell}>
                            <span style={statLabel}>🥛 MILK</span>
                            <span style={statValue}>{milkCount}</span>
                        </div>
                    </div>
                </div>

                <ScoreSlip outcome={outcome} color={theme.accent} />

                <MilkOffer onWatch={onWatchAd} />

                <div style={buttonRow}>
                    <MotionButton style={button('primary')} onClick={onRetry} whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                        <RotateCcw size={13} />
                        다시 / RETRY
                    </MotionButton>
                    <MotionButton
                        style={button('quiet')}
                        onClick={onShowLeaderboard}
                        whileHover={{ y: -1 }}
                        whileTap={{ y: 0 }}
                    >
                        <Trophy size={13} />
                        랭킹
                    </MotionButton>
                </div>

                <div style={buttonRow}>
                    <MotionButton
                        style={button('quiet')}
                        onClick={onShowCredits}
                        whileHover={{ y: -1 }}
                        whileTap={{ y: 0 }}
                    >
                        <Film size={13} />
                        크레딧
                    </MotionButton>
                    <MotionButton
                        style={button('quiet')}
                        onClick={onMainMenu}
                        whileHover={{ y: -1 }}
                        whileTap={{ y: 0 }}
                    >
                        <Home size={13} />
                        메뉴
                    </MotionButton>
                </div>
            </motion.div>
        </div>
    );
};

export default Victory;
