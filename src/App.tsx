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
import type { BoardKey } from './components/Leaderboard';
import { GameScene } from './game/scenes/GameScene';
import { VictoryScene } from './game/victory/victoryUtils';
import { GameConfig } from './game/constants/GameConfig';
import { createGameEventBus, GameEventBus } from './game/core/GameEvents';
import type { GameOverPayload } from './game/core/GameEvents';
import { isDebugEnabled } from './game/core/debug';
import { RENDER_SCALE } from './game/core/renderScale';

import { resolveMode } from './game/core/modes';

/** Space the page furniture takes out of the window on desktop. */
const CHROME = { MARGIN_X: 24, HEADER_H: 76 };
/** Below this the layout stops making sense; scrollbars are better than nothing. */
const MIN_CANVAS = { WIDTH: 360, HEIGHT: 420 };


function App() {
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
    const [jumpCount, setJumpCount] = useState(0);
    const [survivedMs, setSurvivedMs] = useState(0);

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
        jumpCount * GameConfig.SCORE.PER_JUMP;

    const [showLeaderboard, setShowLeaderboard] = useState(false);
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
            const width = window.innerWidth;
            const height = window.innerHeight;
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (isMobile) {
                setGameSize({ width: width * 0.9, height: height * 0.8 });
                return;
            }

            // The window, less the run bar and a margin.
            //
            // It used to be pinned to 768 wide whatever the monitor was, which
            // left most of a desktop browser as background. The reference width
            // the interface is measured against is still 768 — that is a
            // readability baseline, not a canvas size — so a wider window simply
            // shows more city.
            setGameSize({
                width: Math.max(width - CHROME.MARGIN_X, MIN_CANVAS.WIDTH),
                height: Math.max(height - CHROME.HEADER_H, MIN_CANVAS.HEIGHT)
            });
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
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
        bus.current = createGameEventBus(game.current);

        bus.current.on('gameOver', ({ milkCount: milk, fishCount: fish, reason, survivedMs }) => {
            setMilkCount(milk);
            setFishCount(fish);
            setEndReason(reason);
            setSurvivedMs(survivedMs);
            setIsGameOver(true);
        });

        bus.current.on('victory', ({ timeMs }) => {
            setVictoryTime(timeMs);
            setIsVictory(true);
        });

        bus.current.on('jumpCountChanged', setJumpCount);

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
    useEffect(() => {
        gameSizeRef.current = gameSize;
        game.current?.scale.resize(gameSize.width * RENDER_SCALE, gameSize.height * RENDER_SCALE);
    }, [gameSize]);

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
        setJumpCount(0);

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

    const startGame = () => {
        setShowGame(true);
        setIsGameOver(false);
        setIsVictory(false);
        setIsShowingCredits(false);
        setMilkCount(0);
        setFishCount(0);
        setJumpCount(0);
    };

    const handleShowLeaderboard = (mode: BoardKey) => {
        setLeaderboardMode(mode);
        setShowLeaderboard(true);
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minHeight: '100vh',
            maxWidth: '100vw',
            overflow: 'hidden',
            position: 'relative',
            backgroundColor: '#1a1a1a',
            padding: '10px'
        }}>
            {showGame ? (
                <>
                    <Header
                        restartGame={restartGame}
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
                            margin: '10px auto',
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
                />
            )}

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
