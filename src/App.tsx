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
import { GameScene } from './game/scenes/GameScene';
import { VictoryScene } from './game/victory/victoryUtils';

function App() {
    const gameRef = useRef<HTMLDivElement>(null);
    const game = useRef<Phaser.Game | null>(null);
    const [gameSize, setGameSize] = useState({ width: window.innerWidth, height: window.innerHeight });
    const [health, setHealth] = useState(100);
    const [showGame, setShowGame] = useState(false);
    const [isGameOver, setIsGameOver] = useState(false);
    const [isVictory, setIsVictory] = useState(false);
    const [victoryTime, setVictoryTime] = useState(0);
    const [jumpCount, setJumpCount] = useState(0);
    const [fishCount, setFishCount] = useState(0);
    const [milkCount, setMilkCount] = useState(0);
    const [showTutorial, setShowTutorial] = useState(false);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [leaderboardMode, setLeaderboardMode] = useState<'score' | 'time'>('score');

    // Track health in a ref so Phaser callbacks can read latest value
    const healthRef = useRef(100);

    useEffect(() => {
        if (game.current) {
            const pauseHandler = () => {
                if (showTutorial) {
                    game.current?.events.emit('pauseGame');
                }
            };

            game.current.events.on('gameReady', pauseHandler);

            return () => {
                if (game.current) {
                    game.current.events.off('gameReady', pauseHandler);
                }
            };
        }
    }, [showTutorial]);

    useEffect(() => {
        const handleResize = () => {
            const baseWidth = 768;
            const width = window.innerWidth;
            const height = window.innerHeight;
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (isMobile) {
                const maxWidth = Math.min(width * 0.9, baseWidth);
                setGameSize({
                    width: maxWidth,
                    height: height * 0.8
                });
            } else {
                setGameSize({
                    width: baseWidth,
                    height: Math.min(height * 0.9, baseWidth * 1.33)
                });
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, []);

    const handleHealthChange = useCallback((amount: number) => {
        setHealth(prevHealth => {
            const newHealth = Math.max(0, Math.min(prevHealth + amount, 100));
            // console.log(`Health Update: ${prevHealth} -> ${newHealth} (Amount: ${amount})`); // debug
            healthRef.current = newHealth;
            return newHealth;
        });
    }, []);

    const destroyGame = useCallback(() => {
        if (game.current) {
            // Remove all event listeners before destroying
            game.current.events.off('gameOver');
            game.current.events.off('victory');
            game.current.events.off('updateJumpCount');
            game.current.events.off('changeHealth');
            game.current.events.off('collectMilk');
            game.current.events.off('collectFish');
            game.current.events.off('pauseGame');
            game.current.events.off('resumeGame');
            game.current.events.off('gameReady');

            // Explicitly stop sound manager if accessible (though scene shutdown does it)
            // Ideally we just want to ensure we don't try to resume a closed context later.
            // Phaser 3.60+ handles this well usually, but safety check:
            if (game.current.sound) {
                game.current.sound.removeAllListeners();
                // Try to stop all sounds
                game.current.sound.stopAll();

                // Experimental: Attempt to detach context if possible, 
                // or at least ensure we don't hold references that try to resume it.
                // The error "Cannot resume a context that has been closed" comes from AudioContext.resume().
                // This often happens if user interaction triggers a resume on a destroyed game's sound manager.
            }

            game.current.destroy(true);
            game.current = null;
        }
    }, []);

    const createGame = useCallback(() => {
        // Always destroy previous game first
        destroyGame();

        const config: Phaser.Types.Core.GameConfig = {
            type: Phaser.AUTO,
            width: gameSize.width,
            height: gameSize.height,
            parent: 'game-container',
            backgroundColor: '#808080',
            physics: {
                default: 'arcade',
                arcade: { gravity: { y: 0, x: 0 }, debug: false }
            },
            scale: {
                mode: Phaser.Scale.RESIZE,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: gameSize.width,
                height: gameSize.height,
            },
            scene: [GameScene, VictoryScene]
        };

        game.current = new Phaser.Game(config);

        // Game Over event
        game.current.events.on('gameOver', (data: { milkCount?: number; fishCount?: number }) => {
            setIsGameOver(true);
            if (data) {
                setMilkCount(data.milkCount || 0);
                setFishCount(data.fishCount || 0);
            }
        });

        // Victory event
        game.current.events.on('victory', (data: { timeMs: number; milkCount?: number; fishCount?: number }) => {
            setVictoryTime(data.timeMs);
            setIsVictory(true);
            // Don't hide game immediately, maybe overlay?
            // Actually design asks for Victory screen.
            // Let's keep game visible in background or hide it.
            // Existing GameOver hides nothing effectively but overlays.
            // But we pause scene.
        });

        // Jump count update
        game.current.events.on('updateJumpCount', (count: number) => {
            setJumpCount(count);
        });

        // Health changes (HP drain + Fish heal)
        game.current.events.on('changeHealth', (amount: number) => {
            handleHealthChange(amount);

            // Check HP=0 game over after a tick so state updates
            setTimeout(() => {
                if (healthRef.current <= 0) {
                    // Trigger game over in Phaser scene
                    // Need to cast to GameScene or access safely
                    const scene = game.current?.scene?.getScene('GameScene') as GameScene;
                    if (scene && !scene.gameOverStarted) {
                        scene.gameOverAnimation();
                    }
                }
            }, 50);
        });

        // Milk & Fish counters
        game.current.events.on('collectMilk', (count: number) => setMilkCount(count));
        game.current.events.on('collectFish', (count: number) => setFishCount(count));

    }, [gameSize, handleHealthChange, destroyGame]);

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

    const restartGame = useCallback(() => {
        // 1. Destroy and cleanup
        destroyGame();

        // 2. Reset local state
        setIsGameOver(false);
        setIsVictory(false);
        setVictoryTime(0);
        setHealth(100);
        healthRef.current = 100;
        setMilkCount(0);
        setFishCount(0);
        setJumpCount(0);

        // 3. Force Unmount -> Remount to ensure fresh DOM and Phaser instance
        setShowGame(false);
        setTimeout(() => {
            setShowGame(true);
        }, 100);
    }, [destroyGame]);

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
        setShowTutorial(true);
        setHealth(100);
        healthRef.current = 100;
        setIsGameOver(false);
        setIsVictory(false);
        setMilkCount(0);
        setFishCount(0);
        setJumpCount(0);
    };

    const handleShowLeaderboard = (mode: 'score' | 'time') => {
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
                        health={health}
                        jumpCount={jumpCount}
                        milkCount={milkCount}
                        gameSize={gameSize}
                        orientation={gameSize.width > gameSize.height ? 'landscape' : 'portrait'}
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
                            maxWidth: '768px',
                            boxShadow: '0 0 10px rgba(0,0,0,0.3)'
                        }}
                    />

                    {/* Tutorial Overlay */}
                    {showTutorial && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '90%',
                            maxWidth: '600px',
                            backgroundColor: 'rgba(0, 0, 0, 0.9)',
                            border: '4px solid #ffffff',
                            padding: '20px',
                            color: 'white',
                            fontFamily: "'Press Start 2P', cursive",
                            zIndex: 2000,
                            fontSize: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? '0.8rem' : '1rem',
                            lineHeight: '1.5',
                            textAlign: 'center'
                        }}>
                            <h2 style={{ color: '#ffff00', marginBottom: '20px', marginTop: 0 }}>HOW TO PLAY</h2>

                            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                                <h3 style={{ color: '#00ff00', fontSize: '0.9em' }}>CONTROLS</h3>
                                {/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? (
                                    <ul style={{ listStyle: 'none', padding: 0 }}>
                                        <li>🕹️ Joystick: Move</li>
                                        <li>🔴 Button: Jump</li>
                                    </ul>
                                ) : (
                                    <ul style={{ listStyle: 'none', padding: 0 }}>
                                        <li>⬆️⬇️⬅️➡️ Arrow Keys: Move</li>
                                        <li>SPACE Bar: Jump</li>
                                    </ul>
                                )}
                            </div>

                            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                                <h3 style={{ color: '#00ff00', fontSize: '0.9em' }}>RULES</h3>
                                <ul style={{ listStyle: 'none', padding: 0 }}>
                                    <li style={{ marginBottom: '10px' }}>❤️ Health drops over time!</li>
                                    <li style={{ marginBottom: '10px' }}>🐟 Eat FISH to Heal (+20)</li>
                                    <li style={{ marginBottom: '10px' }}>🥛 Drink MILK for Jump (+1)</li>
                                </ul>
                            </div>

                            <button
                                style={{
                                    backgroundColor: '#00ff00',
                                    color: 'black',
                                    border: '4px solid #004d00',
                                    padding: '10px 30px',
                                    fontSize: '1.2rem',
                                    fontFamily: "'Press Start 2P', cursive",
                                    cursor: 'pointer',
                                    marginTop: '10px'
                                }}
                                onClick={() => {
                                    setShowTutorial(false);
                                    if (game.current) {
                                        game.current.events.emit('resumeGame');
                                    }
                                }}
                            >
                                GO!
                            </button>
                        </div>
                    )}
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
                    onShowLeaderboard={() => handleShowLeaderboard('score')}
                    milkCount={milkCount}
                    fishCount={fishCount}
                    score={(milkCount * 50) + (fishCount * 100) + (jumpCount * 10)}
                />
            )}

            {isVictory && (
                <Victory
                    onRetry={restartGame}
                    onMainMenu={() => {
                        setIsVictory(false);
                        setShowGame(false);
                    }}
                    onShowLeaderboard={() => handleShowLeaderboard('time')}
                    timeMs={victoryTime}
                    milkCount={milkCount}
                    fishCount={fishCount}
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
