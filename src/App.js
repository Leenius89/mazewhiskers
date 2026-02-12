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
import { GameScene } from './game/scenes/GameScene';

function App() {
  const gameRef = useRef(null);
  const game = useRef(null);
  const [gameSize, setGameSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [health, setHealth] = useState(100);
  const [showGame, setShowGame] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isVictory, setIsVictory] = useState(false);
  const [jumpCount, setJumpCount] = useState(0);
  const [fishCount, setFishCount] = useState(0);
  const [milkCount, setMilkCount] = useState(0);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (showGame && showTutorial && game.current) {
      // 게임 루프가 시작된 후 잠시 대기했다가 일시정지
      setTimeout(() => {
        game.current.events.emit('pauseGame');
      }, 100);
    }
  }, [showGame, showTutorial]);

  useEffect(() => {
    const handleResize = () => {
      const baseWidth = 768;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        // 모바일에서는 화면 너비의 90%를 사용
        const maxWidth = Math.min(width * 0.9, baseWidth);

        setGameSize({
          width: maxWidth,
          height: height * 0.8 // 화면 높이의 80%만 사용
        });
      } else {
        // 데스크톱에서는 768px 고정 너비 사용
        setGameSize({
          width: baseWidth,
          height: Math.min(height * 0.9, baseWidth * 1.33) // 4:3 비율 유지하되 화면 높이의 90% 제한
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

  const handleHealthChange = useCallback((amount) => {
    setHealth(prevHealth => {
      const newHealth = Math.max(0, Math.min(prevHealth + amount, 100));
      return newHealth;
    });
  }, []);

  const createGame = useCallback(() => {
    const config = {
      type: Phaser.AUTO,
      width: gameSize.width,
      height: gameSize.height,
      parent: 'game-container',
      backgroundColor: '#808080',
      physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: gameSize.width,
        height: gameSize.height,
      },
      scene: [GameScene]
    };

    if (game.current) game.current.destroy(true);
    game.current = new Phaser.Game(config);

    // 이벤트 리스너 설정
    game.current.events.on('gameOver', (data) => {
      setIsGameOver(true);
      if (data) {
        setMilkCount(data.milkCount || 0);
        setFishCount(data.fishCount || 0);
      }
    });

    game.current.events.on('updateJumpCount', (count) => {
      setJumpCount(count);
    });

    game.current.events.on('changeHealth', handleHealthChange);
    game.current.events.on('collectMilk', (count) => setMilkCount(count));
    game.current.events.on('collectFish', (count) => setFishCount(count));

  }, [gameSize, handleHealthChange]);

  useEffect(() => {
    if (showGame && !isGameOver) {
      createGame();
    }

    const handleVictory = (event) => {
      const action = event.detail?.action;

      if (action === 'mainMenu') {
        setIsVictory(true);
        setShowGame(false);
      } else if (action === 'retry') {
        setIsVictory(false);
        setHealth(100);
        setShowGame(true);
        setTimeout(() => {
          if (game.current) {
            game.current.destroy(true);
          }
          createGame();
        }, 100);
      }
    };

    document.addEventListener('gameVictory', handleVictory);

    return () => {
      if (game.current) game.current.destroy(true);
      document.removeEventListener('gameVictory', handleVictory);
    };
  }, [showGame, createGame, isGameOver]);

  const startGame = () => {
    setShowGame(true);
    setShowTutorial(true);
    setHealth(100);
    setIsGameOver(false);
    setMilkCount(0);
    setFishCount(0);
    setJumpCount(0);
  };

  const restartGame = () => {
    setIsGameOver(false);
    setHealth(100);
    setMilkCount(0);
    setFishCount(0);
    setJumpCount(0);
    setTimeout(() => {
      if (game.current) {
        game.current.destroy(true);
      }
      setShowGame(true);
    }, 100);
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
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
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
                  <li style={{ marginBottom: '10px' }}>🥛 Drink MILK for Double Jumps</li>
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
          milkCount={milkCount}
          fishCount={fishCount}
        />
      )}
    </div>
  );
}

export default App;