import React, {
    useState,
    useEffect,
    useRef,
    useCallback
} from 'react';
import Phaser from 'phaser';
import Header from './components/Header';
import MainPage from './components/MainPage';
import GameOver from './components/GameOver';
import Victory from './components/Victory';
import Leaderboard from './components/Leaderboard';
import SettingsPanel from './components/SettingsPanel';
import PauseMenu from './components/PauseMenu';
import { getSettings, subscribe, useSettings } from './settings';
import { theme } from './components/theme';
import { isMobileDevice } from './game/systems/InputManager';
import type { BoardKey } from './components/Leaderboard';
import { GameScene } from './game/scenes/GameScene';
import { VictoryScene } from './game/victory/victoryUtils';
import { GameConfig } from './game/constants/GameConfig';
import { createGameEventBus, GameEventBus } from './game/core/GameEvents';
import type { GameOverPayload } from './game/core/GameEvents';
import { isDebugEnabled } from './game/core/debug';
import { RENDER_SCALE } from './game/core/renderScale';

import { resolveMode } from './game/core/modes';

/**
 * How tall the run bar is. The canvas gets everything else.
 *
 * Kept in one place because both the layout and the size handed to Phaser
 * have to agree about it; they drifted apart before, which is how the canvas
 * ended up hanging past the bottom of a short window.
 */
const HEADER_H = 42;
/** Breathing room on a desktop, where the page is not the whole screen. */
const DESKTOP_INSET = { X: 24, Y: 20 };

/**
 * The area actually visible right now, in CSS pixels.
 *
 * `innerHeight` on a phone is the window including whatever the browser has
 * temporarily slid out of the way — the address bar on Safari and Chrome
 * both — so a layout built on it is taller than the screen and the bottom of
 * the game sits under the toolbar. `visualViewport` is what the person can
 * see, and it changes as the bar hides and returns.
 */
const viewport = (): { width: number; height: number } => {
    const vv = window.visualViewport;
    return {
        width: Math.round(vv?.width ?? window.innerWidth),
        height: Math.round(vv?.height ?? window.innerHeight)
    };
};
/**
 * Below this the layout stops making sense.
 *
 * The height used to be a hard floor of 420, which is taller than a phone held
 * sideways: on a short window the canvas ran a hundred pixels past the bottom
 * of the screen and took the dialogue box with it. Nobody scrolls mid-run, so
 * the tutorial simply could not be read. The floor now yields to the window,
 * and only holds the line on something genuinely tiny.
 */
const MIN_CANVAS = { WIDTH: 320, HEIGHT: 280 };


function App() {
    // Subscribed so a change of light repaints the page around the canvas; the
    // palette itself is a module-level object that the change has already
    // updated by the time this render reads it.
    useSettings();

    const gameRef = useRef<HTMLDivElement>(null);
    const game = useRef<Phaser.Game | null>(null);
    const [gameSize, setGameSize] = useState({ width: window.innerWidth, height: window.innerHeight });
    /**
     * Latest size, read by createGame without becoming one of its dependencies.
     *
     * Depending on `gameSize` directly meant every resize gave `createGame` a
     * new identity, which re-ran the effect and rebuilt the whole Phaser game.
     * Phaser tears down asynchronously, so the outgoing game was still playing
     * its BGM when the incoming one started its own — two soundtracks at once.
     */
    const gameSizeRef = useRef(gameSize);
    const [showGame, setShowGame] = useState(false);
    const [isGameOver, setIsGameOver] = useState(false);
    const [isVictory, setIsVictory] = useState(false);
    const [victoryTime, setVictoryTime] = useState(0);
    /** Jumps spent this run — what the jump bonus is paid on. */
    const [jumpsUsed, setJumpsUsed] = useState(0);
    const [survivedMs, setSurvivedMs] = useState(0);
    const [healthLeft, setHealthLeft] = useState(0);

    const [fishCount, setFishCount] = useState(0);
    const [milkCount, setMilkCount] = useState(0);
    /**
     * The run's score, in one place.
     *
     * It used to be assembled inline where the game-over screen was rendered,
     * which meant it existed only once the run was already over — there was
     * nothing to show a player while they were still playing for it.
     */
    const score =
        milkCount * GameConfig.SCORE.PER_MILK +
        fishCount * GameConfig.SCORE.PER_FISH +
        jumpsUsed * GameConfig.SCORE.PER_JUMP;

    const [showLeaderboard, setShowLeaderboard] = useState(false);
    /** The run bar's menu, which holds the game still while it is open. */
    const [showPause, setShowPause] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [leaderboardMode, setLeaderboardMode] = useState<BoardKey>('survived');
    const [isShowingCredits, setIsShowingCredits] = useState(false);
    const [endReason, setEndReason] = useState<GameOverPayload['reason']>('health');

    // Exhibition or arcade, fixed for the page load. A kiosk pins it in the URL.
    const mode = useRef(resolveMode()).current;

    // Typed view onto the game's event emitter. The scene owns game state;
    // React only subscribes to it.
    const bus = useRef<GameEventBus | null>(null);



    useEffect(() => {
        const handleResize = () => {
            const { width, height } = viewport();
            const isMobile = isMobileDevice();

            /*
             * The whole window, less the run bar.
             *
             * A phone used to be given ninety per cent of the width and eighty
             * of the height, which left a visible frame of page all the way
             * round the game and threw away a fifth of the screen — on the one
             * device that has the least of it. There is no reason for the
             * margin: the canvas is the game.
             *
             * A desktop keeps a little inset, because there the page around it
             * is a window on a larger screen rather than the whole device.
             */
            const insetX = isMobile ? 0 : DESKTOP_INSET.X;
            const insetY = isMobile ? 0 : DESKTOP_INSET.Y;

            setGameSize({
                width: Math.max(width - insetX, MIN_CANVAS.WIDTH),
                height: Math.max(height - HEADER_H - insetY, MIN_CANVAS.HEIGHT)
            });
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);
        // Fires when the address bar slides away, which `resize` does not.
        window.visualViewport?.addEventListener('resize', handleResize);
        window.visualViewport?.addEventListener('scroll', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
            window.visualViewport?.removeEventListener('resize', handleResize);
            window.visualViewport?.removeEventListener('scroll', handleResize);
        };
    }, []);

    const destroyGame = useCallback(() => {
        if (!game.current) return;

        bus.current?.removeAll();
        bus.current = null;

        // Stop audio before teardown so a later user gesture cannot try to
        // resume an AudioContext that has already been closed.
        if (game.current.sound) {
            game.current.sound.removeAllListeners();
            game.current.sound.stopAll();
        }

        game.current.destroy(true);
        game.current = null;
    }, []);

    const createGame = useCallback(() => {
        // One game at a time. A second instance would bring its own audio
        // context and its own soundtrack.
        if (game.current) return;

        const size = gameSizeRef.current;

        // The canvas is built at the screen's real resolution and shrunk back to
        // the requested size with CSS. See core/renderScale.
        const config: Phaser.Types.Core.GameConfig = {
            type: Phaser.AUTO,
            width: size.width * RENDER_SCALE,
            height: size.height * RENDER_SCALE,
            parent: 'game-container',
            backgroundColor: '#808080',
            physics: {
                default: 'arcade',
                // `?debug=1` draws Arcade body outlines; DebugOverlay adds the numbers.
                arcade: { gravity: { y: 0, x: 0 }, debug: isDebugEnabled() }
            },
            scale: {
                // FIT, not RESIZE. RESIZE makes the game size follow the parent
                // element, which would immediately throw away the higher
                // resolution asked for below; FIT keeps the internal size and
                // scales the canvas with CSS to fit. The requested size is the
                // parent's exact aspect ratio, so nothing is letterboxed.
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: size.width * RENDER_SCALE,
                height: size.height * RENDER_SCALE
            },
            scene: [GameScene, VictoryScene]
        };

        game.current = new Phaser.Game(config);

        // Applied here, not only from the settings effect.
        //
        // That effect runs when `showGame` flips, which is fifty milliseconds
        // before this function is called from its timer — so it looked at a
        // null game and did nothing. Starting a run with the sound switched off
        // played the music anyway, while the header button said it was muted.
        game.current.sound.mute = getSettings().muted;

        bus.current = createGameEventBus(game.current);

        bus.current.on('gameOver', ({ milkCount: milk, fishCount: fish, reason, survivedMs, healthLeft: left }) => {
            setMilkCount(milk);
            setFishCount(fish);
            setHealthLeft(left ?? 0);
            setEndReason(reason);
            setSurvivedMs(survivedMs);
            setIsGameOver(true);
        });

        bus.current.on('victory', ({ timeMs, healthLeft: left }) => {
            setVictoryTime(timeMs);
            setHealthLeft(left ?? 0);
            setIsVictory(true);
        });

        bus.current.on('jumpsUsedChanged', setJumpsUsed);

        // Health is not mirrored here any more: the scene owns it and draws it
        // over the cat's head, so a second copy in React had nothing to render.

        bus.current.on('milkCollected', setMilkCount);
        bus.current.on('fishCollected', setFishCount);

        bus.current.on('creditsClosed', () => setIsShowingCredits(false));
    }, []);

    useEffect(() => {
        if (showGame && !isGameOver && !isVictory) {
            // Small delay to ensure DOM container exists
            const timer = setTimeout(() => {
                createGame();
            }, 50);
            return () => clearTimeout(timer);
        }

        return () => {
            // Cleanup on unmount
            destroyGame();
        };
    }, [showGame, isGameOver, isVictory, createGame, destroyGame]);

    /**
     * Resizing reshapes the running game instead of replacing it.
     *
     * The scale mode is RESIZE, so Phaser handles the new viewport itself.
     */
    /**
     * One switch for everything the game plays.
     *
     * Phaser has a global mute, so the setting does not have to reach every
     * `sound.add` call individually — and it applies to a game created after the
     * setting was changed, which is why this also runs when `showGame` flips.
     */
    useEffect(() => {
        const apply = () => {
            if (game.current) game.current.sound.mute = getSettings().muted;
        };

        apply();
        return subscribe(apply);
    }, [showGame]);

    useEffect(() => {
        gameSizeRef.current = gameSize;
        game.current?.scale.resize(gameSize.width * RENDER_SCALE, gameSize.height * RENDER_SCALE);
    }, [gameSize]);

    /**
     * Re-fits the canvas whenever its container's real size changes.
     *
     * Window resize events are not the whole story: the container gets its
     * size from layout, which can settle after the game has already booted,
     * and a page that never receives an animation frame (a tab opened in the
     * background) leaves Phaser's own parent-size poll unrun. Either way the
     * canvas stays at whatever it was born with — sometimes nothing at all.
     * Watching the element itself closes both holes.
     */
    useEffect(() => {
        const container = gameRef.current;
        if (!container || typeof ResizeObserver === 'undefined') return;

        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (!width || !height || !game.current) return;

            // `resize` rather than `refresh`: refresh re-fits within the aspect
            // ratio the game was born with, and a game created while the window
            // measured zero was born at the fallback size. Handing it the box it
            // is actually sitting in replaces that ratio instead of working
            // around it.
            game.current.scale.resize(width * RENDER_SCALE, height * RENDER_SCALE);
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [showGame]);

    const restartGame = useCallback(() => {
        // 1. Destroy and cleanup
        destroyGame();

        // 2. Reset local state
        setIsGameOver(false);
        setIsVictory(false);
        setIsShowingCredits(false);
        setVictoryTime(0);
        setMilkCount(0);
        setFishCount(0);
        setJumpsUsed(0);

        // 3. Force Unmount -> Remount to ensure fresh DOM and Phaser instance
        setShowGame(false);
        setTimeout(() => {
            setShowGame(true);
        }, 100);
    }, [destroyGame]);

    /**
     * Kiosk idle return.
     *
     * An unattended exhibition machine is left on a results screen by whoever
     * walked away, and the next visitor should find the attract screen rather
     * than someone else's game over. Only runs in exhibition mode, and only
     * while a results screen is up — never mid-play.
     */
    useEffect(() => {
        const timeout = mode.idleReturnMs;
        if (!timeout) return;
        if (!isGameOver && !isVictory) return;
        if (isShowingCredits || showLeaderboard) return;

        let timer = window.setTimeout(() => {
            setIsGameOver(false);
            setIsVictory(false);
            setShowGame(false);
        }, timeout);

        const postpone = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                setIsGameOver(false);
                setIsVictory(false);
                setShowGame(false);
            }, timeout);
        };

        const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
        events.forEach((event) => window.addEventListener(event, postpone));

        return () => {
            window.clearTimeout(timer);
            events.forEach((event) => window.removeEventListener(event, postpone));
        };
    }, [mode.idleReturnMs, isGameOver, isVictory, isShowingCredits, showLeaderboard]);

    // Global Event handlers (if any)
    useEffect(() => {
        // Define event type for CustomEvent
        const handleVictory = (event: Event) => {
            const customEvent = event as CustomEvent;
            const action = customEvent.detail?.action;

            if (action === 'mainMenu') {
                setIsVictory(false);
                setIsGameOver(false);
                setShowGame(false);
            } else if (action === 'retry') {
                restartGame();
            }
        };

        document.addEventListener('gameVictory', handleVictory);
        return () => document.removeEventListener('gameVictory', handleVictory);
    }, [restartGame]);

    /**
     * Opens the run menu and stops the world behind it.
     *
     * The scene refuses to pause once a run has ended, and the results panel
     * is already covering the screen at that point, so the menu simply does
     * not open there.
     */
    const openPause = useCallback(() => {
        if (isGameOver || isVictory || isShowingCredits) return;
        bus.current?.emit('pauseGame');
        setShowPause(true);
    }, [isGameOver, isVictory, isShowingCredits]);

    const closePause = useCallback(() => {
        setShowPause(false);
        bus.current?.emit('resumeGame');
    }, []);

    const startGame = () => {
        setShowGame(true);
        setIsGameOver(false);
        setIsVictory(false);
        setIsShowingCredits(false);
        setMilkCount(0);
        setFishCount(0);
        setJumpsUsed(0);
    };

    const restartFromPause = useCallback(() => {
        setShowPause(false);
        restartGame();
    }, [restartGame]);

    const mainMenuFromPause = useCallback(() => {
        setShowPause(false);
        setIsGameOver(false);
        setIsVictory(false);
        setShowGame(false);
    }, []);

    const handleShowLeaderboard = (mode: BoardKey) => {
        setLeaderboardMode(mode);
        setShowLeaderboard(true);
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            // `dvh` is the viewport as it stands right now; `vh` on a phone is
            // the taller one that exists only while the address bar is hidden,
            // and building on it puts the bottom of the page under the bar.
            minHeight: '100dvh',
            maxWidth: '100vw',
            overflow: 'hidden',
            position: 'relative',
            // The page around the canvas. Follows the interface's light, not
            // the game world's — the world is a night city either way.
            backgroundColor: theme.ground,
            padding: 0
        }}>
            {showGame ? (
                <>
                    <Header
                        onOpenMenu={openPause}
                        milkCount={milkCount}
                        fishCount={fishCount}
                        score={score}
                        gameSize={gameSize}
                    />
                    <div
                        id="game-container"
                        ref={gameRef}
                        style={{
                            width: `${gameSize.width}px`,
                            height: `${gameSize.height}px`,
                            margin: '0 auto',
                            touchAction: 'none',
                            // WebkitTouchCallout: 'none', // React doesn't support this style property directly without casing or ignore
                            userSelect: 'none',
                            position: 'relative',
                            // Was capped at 768, which quietly undid any wider
                            // canvas the resize handler asked for.
                            maxWidth: '100%',
                            boxShadow: '0 0 10px rgba(0,0,0,0.3)'
                        }}
                    />

                </>
            ) : (
                <MainPage
                    onStartGame={startGame}
                    onShowLeaderboard={() => handleShowLeaderboard('fastest')}
                    onShowSettings={() => setShowSettings(true)}
                    gameSize={gameSize}
                />
            )}

            {isGameOver && (
                <GameOver
                    onRetry={restartGame}
                    onShowLeaderboard={() => handleShowLeaderboard('survived')}
                    milkCount={milkCount}
                    fishCount={fishCount}
                    reason={endReason}
                    score={score}
                    survivedMs={survivedMs}
                    healthLeft={healthLeft}
                />
            )}

            {/* Hidden while the credits roll: this overlay is position:fixed over
                the whole viewport, so it would cover the canvas they render on. */}
            {isVictory && !isShowingCredits && (
                <Victory
                    onRetry={restartGame}
                    onMainMenu={() => {
                        setIsVictory(false);
                        setShowGame(false);
                    }}
                    onShowLeaderboard={() => handleShowLeaderboard('fastest')}
                    onShowCredits={() => {
                        setIsShowingCredits(true);
                        bus.current?.emit('showCredits');
                    }}
                    timeMs={victoryTime}
                    milkCount={milkCount}
                    fishCount={fishCount}
                    score={score}
                    healthLeft={healthLeft}
                />
            )}

            {showPause && (
                <PauseMenu
                    onResume={closePause}
                    onRestart={restartFromPause}
                    onMainMenu={mainMenuFromPause}
                />
            )}

            {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

            {showLeaderboard && (
                <Leaderboard
                    onClose={() => setShowLeaderboard(false)}
                    mode={leaderboardMode}
                />
            )}
        </div>
    );
}

export default App;
