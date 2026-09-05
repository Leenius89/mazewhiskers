import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings as SettingsIcon, Trophy } from 'lucide-react';
import { getSettings, subscribe } from '../settings';
import { useTranslation } from '../i18n';
import { motion } from 'framer-motion';

interface MainPageProps {
    onShowLeaderboard: () => void;
    onShowSettings: () => void;
    onStartGame: () => void;
    gameSize: { width: number | string; height: number | string };
}

const MotionClickable = motion.div as any;

/**
 * The one button design this screen has.
 *
 * The menu buttons were originally a quieter style so GAME START would still
 * read as the way in; size does that on its own, and two visual languages on
 * one screen read as two different screens.
 */
const pixelButton = (isMobile: boolean, size: 'primary' | 'menu'): React.CSSProperties => {
    const primary = size === 'primary';

    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: primary ? '0' : '10px',
        backgroundColor: '#ff0000',
        color: 'white',
        border: `${primary ? 4 : 3}px solid #8b0000`,
        padding: primary
            ? isMobile
                ? '12px 30px'
                : '15px 40px'
            : isMobile
              ? '8px 18px'
              : '10px 24px',
        fontSize: primary ? (isMobile ? '1.5rem' : '2rem') : isMobile ? '0.7rem' : '0.9rem',
        fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
        cursor: 'pointer',
        imageRendering: 'pixelated',
        boxShadow: `${primary ? 6 : 4}px ${primary ? 6 : 4}px 0px #8b0000`,
        whiteSpace: 'nowrap',
        maxWidth: '90%'
    };
};

const MainPage: React.FC<MainPageProps> = ({ onStartGame, onShowLeaderboard, onShowSettings, gameSize }) => {
    const [showButton, setShowButton] = useState(false);
    const [showTitle, setShowTitle] = useState(false);
    const [isMobile] = useState(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    const t = useTranslation();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    /**
     * Guards the opening against running twice.
     *
     * Autoplay and the first-touch fallback can both reach `startMusic`, and
     * each call used to build a fresh Audio and overwrite the reference to the
     * previous one — which kept playing with nothing left able to stop it. That
     * is the doubled soundtrack: two copies of the same track, one orphaned.
     */
    const startedRef = useRef(false);

    const stopMusic = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
        audioRef.current = null;
    }, []);

    /**
     * Starts the soundtrack, or arranges to start it at the first touch.
     *
     * Browsers refuse to play audio until the page has been interacted with,
     * which is the only reason the opening ever had a black "PRESS ENTER"
     * screen in front of it. The screen is gone; the rule is not. So the
     * sequence plays regardless and the music joins it either immediately —
     * when the browser allows it, as on a return visit — or on the first
     * thing the player does.
     */
    const startMusic = useCallback(async () => {
        if (startedRef.current) return;
        startedRef.current = true;

        try {
            stopMusic();
            const audio = new Audio('sources/main.mp3');
            audio.loop = true;
            audio.volume = 0.5;
            audio.muted = getSettings().muted;
            audioRef.current = audio;
            await audio.play();
        } catch {
            // Autoplay refused. Try again the moment the player touches anything.
            startedRef.current = false;
        }
    }, [stopMusic]);

    const handleStartGame = useCallback(() => {
        // The game brings its own copy of this track, so this one has to be
        // released rather than merely paused.
        stopMusic();
        onStartGame();
    }, [onStartGame, stopMusic]);

    // The fly-over runs the moment the page is up. No gate in front of it.
    useEffect(() => {
        startMusic();

        const titleAt = setTimeout(() => setShowTitle(true), 4500);
        const buttonAt = setTimeout(() => setShowButton(true), 6500);

        return () => {
            clearTimeout(titleAt);
            clearTimeout(buttonAt);
        };
    }, [startMusic]);

    // Whatever the player touches first also unblocks the audio.
    useEffect(() => {
        const unlock = () => startMusic();
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);

        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, [startMusic]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Enter' || e.key === ' ') && showButton) {
                e.preventDefault();
                handleStartGame();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showButton, handleStartGame]);

    // The title track is a detached Audio element, so the global Phaser mute
    // never reaches it. Muting while it is playing has to mute it too.
    useEffect(
        () =>
            subscribe(({ muted }) => {
                if (audioRef.current) audioRef.current.muted = muted;
            }),
        []
    );

    useEffect(() => stopMusic, [stopMusic]);

    return (
        <div style={{
            width: '100%',
            height: '100vh',
            display: 'flex',
            justifyContent: 'center',
            backgroundColor: '#2d3748',
            overflow: 'hidden'
        }}>
            <div style={{
                width: gameSize.width,
                height: '100%',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* 배경 이미지 */}
                <motion.div
                    style={{
                        width: '100%',
                        height: '200%',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        zIndex: 1
                    }}
                    initial={{ y: "-50%" }}
                    animate={{ y: "0%" }}
                    transition={{
                        duration: 4,
                        ease: "linear"
                    }}
                >
                    <img
                        src="sources/main.png"
                        alt="Background"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                        }}
                    />
                </motion.div>

                {/* 타이틀 */}
                <motion.div
                    style={{
                        position: 'fixed',
                        top: isMobile ? '10%' : '15%',
                        left: '0',
                        right: '0',
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        zIndex: 2,
                        width: typeof gameSize.width === 'number' ? `${gameSize.width}px` : gameSize.width,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                    animate={{
                        x: [0, 10, 0, -10, 0],
                        y: [0, -10, 0, -10, 0]
                    }}
                    transition={{
                        duration: 4,
                        ease: "easeInOut",
                        repeat: Infinity
                    }}
                >
                    <motion.h1
                        style={{
                            fontSize: isMobile ? 'clamp(2rem, 8vw, 4.5rem)' : '4.5rem',
                            fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                            textShadow: '4px 4px 0px rgba(0, 0, 0, 0.2)',
                            margin: 0,
                            textAlign: 'center',
                            lineHeight: '1.2',
                            imageRendering: 'pixelated',
                            width: '100%',
                            padding: '0 20px'
                        }}
                        initial={{ opacity: 0 }}
                        animate={{
                            opacity: showTitle ? 1 : 0,
                            color: [
                                '#000000',
                                '#202020',
                                '#404040',
                                '#606060',
                                '#808080',
                                '#a0a0a0',
                                '#ffffff',
                                '#a0a0a0',
                                '#808080',
                                '#606060',
                                '#404040',
                                '#202020',
                                '#000000'
                            ]
                        }}
                        transition={{
                            opacity: {
                                duration: 0.5,
                                ease: "easeInOut"
                            },
                            color: {
                                duration: 4,
                                repeat: Infinity,
                                ease: "linear"
                            }
                        }}
                    >
                        MAZE WHISKERS
                    </motion.h1>
                </motion.div>

                {/* GAME START 버튼 */}
                {showButton && (
                    <div style={{
                        position: 'fixed',
                        bottom: isMobile ? '15%' : '20%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: typeof gameSize.width === 'number' ? `${gameSize.width}px` : gameSize.width,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        // Ranking on top, then settings, then the way in — the
                        // order they are reached for, least often first.
                        gap: isMobile ? '10px' : '12px',
                        zIndex: 2
                    }}>
                        <MotionClickable
                            style={pixelButton(isMobile, 'menu')}
                            onClick={onShowLeaderboard}
                            whileHover={{ y: -2, boxShadow: '6px 6px 0px #8b0000' }}
                            whileTap={{ y: 3, boxShadow: '1px 1px 0px #8b0000' }}
                        >
                            <Trophy size={isMobile ? 13 : 15} />
                            {t('menu.ranking')}
                        </MotionClickable>

                        <MotionClickable
                            style={pixelButton(isMobile, 'menu')}
                            onClick={onShowSettings}
                            whileHover={{ y: -2, boxShadow: '6px 6px 0px #8b0000' }}
                            whileTap={{ y: 3, boxShadow: '1px 1px 0px #8b0000' }}
                        >
                            <SettingsIcon size={isMobile ? 13 : 15} />
                            {t('menu.settings')}
                        </MotionClickable>

                        <MotionClickable
                            style={{
                                backgroundColor: '#ff0000',
                                color: 'white',
                                border: '4px solid #8b0000',
                                padding: isMobile ? '12px 30px' : '15px 40px',
                                fontSize: isMobile ? '1.5rem' : '2rem',
                                fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                                cursor: 'pointer',
                                imageRendering: 'pixelated',
                                boxShadow: '6px 6px 0px #8b0000',
                                whiteSpace: 'nowrap',
                                maxWidth: '90%'
                            }}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                                duration: 0.3,
                                type: "steps",
                                steps: 5
                            }}
                            whileHover={{
                                y: -2,
                                boxShadow: '8px 8px 0px #8b0000',
                                transition: { duration: 0.1 }
                            }}
                            whileTap={{
                                y: 4,
                                boxShadow: '2px 2px 0px #8b0000',
                            }}
                            onClick={handleStartGame}
                        >
                            GAME START
                        </MotionClickable>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MainPage;
