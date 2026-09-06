import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings as SettingsIcon, Trophy } from 'lucide-react';
import { getSettings, subscribe, useSettings } from '../settings';
import type { Appearance } from '../settings';
import { useTranslation } from '../i18n';
import { theme } from './theme';
import { motion } from 'framer-motion';

interface MainPageProps {
    onShowLeaderboard: () => void;
    onShowSettings: () => void;
    onStartGame: () => void;
    gameSize: { width: number | string; height: number | string };
}

/**
 * How far short of the picture's top edge the climb stops.
 *
 * Ending flush with the top put more sky on screen than the shot wanted; fifty
 * pixels down keeps the skyline in frame under the logo.
 */
const PAN_END_OFFSET = 50;

const MotionClickable = motion.div as any;

/** Set once the opening has been seen, so a return to the menu is instant. */
const SEEN_INTRO = 'mazewhiskers.seenIntro';

/**
 * The one button design this screen has.
 *
 * The menu buttons were originally a quieter style so GAME START would still
 * read as the way in; size does that on its own, and two visual languages on
 * one screen read as two different screens.
 */
/**
 * Face colour and the darker edge it is cut from, in each light.
 *
 * The dark set was pure red, pure green, pure amber — three fully saturated
 * hues at equal weight, which is a toybox rather than a menu and left the
 * one button that matters no louder than the other two. These are the same
 * three signals pulled back into the game's own range: the way in keeps the
 * hazard red, the other two step down to where they read as choices rather
 * than alarms.
 *
 * The light set is not the dark one lightened. On a pale ground a bright
 * face has nothing to push against, so the faces darken and the text on them
 * turns to paper.
 */
const BUTTON_COLORS = {
    dark: {
        start: { face: '#D93A2B', edge: '#7C1D14', ink: '#FFF3EF' },
        ranking: { face: '#2C7A62', edge: '#164034', ink: '#EAF7F2' },
        settings: { face: '#C08A1E', edge: '#6B4A08', ink: '#FFF8E8' }
    },
    light: {
        start: { face: '#C0392C', edge: '#7A1F16', ink: '#FFF3EF' },
        ranking: { face: '#1B7A66', edge: '#0E4437', ink: '#EAF7F2' },
        settings: { face: '#A96B00', edge: '#6B4200', ink: '#FFF8E8' }
    }
} as const;

type ButtonKind = keyof (typeof BUTTON_COLORS)['dark'];

/**
 * One button, three colours, one size.
 *
 * They share every measurement so the stack reads as one control panel; only
 * the colour separates them, which is also what makes them findable at a
 * glance from across a room.
 */
const pixelButton = (
    isMobile: boolean,
    kind: ButtonKind,
    appearance: Appearance
): React.CSSProperties => {
    const { face, edge, ink } = BUTTON_COLORS[appearance][kind];

    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        width: isMobile ? '260px' : '380px',
        boxSizing: 'border-box',
        backgroundColor: face,
        color: ink,
        border: `4px solid ${edge}`,
        padding: isMobile ? '12px 16px' : '15px 20px',
        fontSize: isMobile ? '1.05rem' : '1.35rem',
        fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
        cursor: 'pointer',
        imageRendering: 'pixelated',
        boxShadow: `6px 6px 0px ${edge}`,
        whiteSpace: 'nowrap',
        maxWidth: '90%'
    };
};

const MainPage: React.FC<MainPageProps> = ({ onStartGame, onShowLeaderboard, onShowSettings, gameSize }) => {
    const [showButton, setShowButton] = useState(false);
    const [showTitle, setShowTitle] = useState(false);
    const [isMobile] = useState(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    const t = useTranslation();
    // Re-renders the menu when the light changes, which is also what makes the
    // palette below read the new values.
    const [settings] = useSettings();

    /**
     * The picture's own proportions, learned before anything is drawn.
     *
     * Measuring the rendered <img> in its `onLoad` was too late: Framer reads
     * `initial` once, at mount, and at that point the distance was still zero —
     * so the climb was set up to travel nowhere and never played at all.
     * Loading the image separately means the travel is known on the first
     * render that matters.
     */
    const [aspect, setAspect] = useState(0);

    useEffect(() => {
        const probe = new Image();
        probe.onload = () => setAspect(probe.naturalHeight / probe.naturalWidth);
        probe.src = 'sources/main.png';
    }, []);

    const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

    useEffect(() => {
        const onResize = () => setViewportHeight(window.innerHeight);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const containerWidth = typeof gameSize.width === 'number' ? gameSize.width : window.innerWidth;
    const imageHeight = aspect ? containerWidth * aspect : 0;
    /** How far there is to climb: the image's height beyond the screen's. */
    /** The whole picture: the climb starts at its bottom edge. */
    const panDistance = Math.max(0, imageHeight - viewportHeight);
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

        /*
         * The opening is a first impression, and only the first one.
         *
         * Title at 4.5s and buttons at 6.5s is the right pace for someone
         * who has just arrived. It is the wrong pace for the exhibition's
         * own idle timer dropping the previous player back here: the next
         * visitor walks up to a screen with nothing on it and no reason to
         * believe anything will appear. After the first visit the menu is
         * simply there.
         */
        const firstVisit = !sessionStorage.getItem(SEEN_INTRO);
        try {
            sessionStorage.setItem(SEEN_INTRO, '1');
        } catch {
            // Private mode. The opening plays every time; no harm done.
        }

        const titleAt = setTimeout(() => setShowTitle(true), firstVisit ? 4500 : 0);
        const buttonAt = setTimeout(() => setShowButton(true), firstVisit ? 6500 : 0);

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
            // The viewport as it stands, not the taller one that exists only
            // while a phone's address bar is out of the way.
            height: '100dvh',
            display: 'flex',
            justifyContent: 'center',
            // The letterbox either side of the picture. Part of the room,
            // so it follows the room's light rather than staying slate.
            backgroundColor: theme.ground,
            overflow: 'hidden'
        }}>
            <div style={{
                width: gameSize.width,
                height: '100%',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/*
                    The climb, measured rather than guessed.
                  *
                  * This was a box twice the height of the screen sliding half its
                  * own height, with the image inside it cropped to fit. That
                  * happened to land on the sky while the window was narrow; once
                  * the canvas filled the browser the crop took the top off and the
                  * pan stopped somewhere in the middle of the towers.
                  *
                  * The image now keeps its own proportions and the travel is the
                  * difference between its height and the screen's, in pixels — so
                  * it ends on the top edge of the picture at any window size, and
                  * stops there.
                */}
                {aspect > 0 && (
                    <motion.div
                        style={{
                            width: '100%',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            zIndex: 1
                        }}
                        initial={{ y: -panDistance }}
                        animate={{ y: -Math.min(PAN_END_OFFSET, panDistance) }}
                        transition={{ duration: 4, ease: 'linear' }}
                    >
                        <img
                            src="sources/main.png"
                            alt="Background"
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                        />
                    </motion.div>
                )}

                {/*
                    The same street, two hours of the day.
                  *
                  * There is one photograph and it is not going to be repainted,
                  * so the light comes from a veil over it rather than from a
                  * second asset. Dark mode is the picture as shot — dusk, which
                  * is what the game is about. Light mode lays a warm haze over
                  * it and lifts the whole menu into the afternoon.
                  *
                  * Deliberately weak. Enough to change the room, not enough to
                  * turn the city into a watercolour.
                */}
                {settings.appearance === 'light' && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 1,
                            pointerEvents: 'none',
                            background:
                                'linear-gradient(180deg, rgba(255,250,238,0.34) 0%, rgba(255,247,232,0.22) 55%, rgba(255,244,226,0.30) 100%)'
                        }}
                    />
                )}

                {/* 타이틀 */}
                <motion.div
                    style={{
                        // Centred in the sky, which is the part of the window
                        // the buttons do not use. Centring on the whole window
                        // put the title 36px into the RANKING button on a
                        // 1150x720 screen, and further in on anything shorter.
                        // Flexbox does the centring so the idle wobble below can
                        // keep the transform to itself.
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: '42%',
                        zIndex: 2,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        // The sky is the backdrop, not a target.
                        pointerEvents: 'none'
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
                            /*
                             * The floor used to be 2.6rem, which sets WHISKERS
                             * 333px wide — wider than a 320px phone, so the last
                             * letter fell off the right edge. 9.6vw is the size
                             * that actually fits there; the floor is only left to
                             * stop it collapsing on something tiny.
                             *
                             * Desktop is capped against the viewport for the same
                             * reason at the other end.
                             */
                            fontSize: isMobile
                                ? 'clamp(1.9rem, 9.6vw, 5.85rem)'
                                : 'min(5.85rem, 9.2vw)',
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
                        bottom: isMobile ? '9%' : '12%',
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
                            style={pixelButton(isMobile, 'ranking', settings.appearance)}
                            onClick={onShowLeaderboard}
                            whileHover={{ y: -2 }}
                            whileTap={{ y: 3 }}
                        >
                            <Trophy size={isMobile ? 13 : 15} />
                            {t('menu.ranking')}
                        </MotionClickable>

                        <MotionClickable
                            style={pixelButton(isMobile, 'settings', settings.appearance)}
                            onClick={onShowSettings}
                            whileHover={{ y: -2 }}
                            whileTap={{ y: 3 }}
                        >
                            <SettingsIcon size={isMobile ? 13 : 15} />
                            {t('menu.settings')}
                        </MotionClickable>

                        <MotionClickable
                            style={pixelButton(isMobile, 'start', settings.appearance)}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                                duration: 0.3,
                                type: "steps",
                                steps: 5
                            }}
                            whileHover={{ y: -2, transition: { duration: 0.1 } }}
                            whileTap={{
                                y: 4,
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
