import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const MainPage = ({ onStartGame, gameSize }) => {
  const [showButton, setShowButton] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [cameraPosition, setCameraPosition] = useState(0);
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [isMobile] = useState(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  const audioRef = useRef(null);

  const startExperience = async () => {
    try {
      audioRef.current = new Audio('/sources/main.mp3');
      audioRef.current.loop = true;
      audioRef.current.volume = 0.5;
      await audioRef.current.play();

      setShowStartScreen(false);

      setTimeout(() => {
        setCameraPosition(1);
        setTimeout(() => {
          setShowTitle(true);
          setTimeout(() => {
            setShowButton(true);
          }, 2000);
        }, 4000);
      }, 500);
    } catch (error) {
      console.error('Failed to play music:', error);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  if (showStartScreen) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#000',
          cursor: 'pointer'
        }}
        onClick={startExperience}
      >
        <motion.div
          style={{
            color: 'white',
            fontFamily: "'Press Start 2P', cursive",
            textAlign: 'center',
            padding: '20px',
            fontSize: isMobile ? '18px' : '24px'
          }}
          animate={{
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            times: [0, 0.4, 0.6, 1],
            ease: "easeInOut"
          }}
        >
          CLICK TO START
        </motion.div>
      </div>
    );
  }

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
        {/* Background */}
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
            src="/sources/main.png"
            alt="Background"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        </motion.div>

        {/* Title */}
        <motion.div
          style={{
            position: 'fixed',
            top: isMobile ? '10%' : '15%',
            left: '0',
            right: '0',
            marginLeft: 'auto',
            marginRight: 'auto',
            zIndex: 2,
            width: gameSize.width,
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
              fontFamily: "'Press Start 2P', cursive",
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

        {/* Start Button */}
        {showButton && !showTutorial && (
          <div style={{
            position: 'fixed',
            bottom: isMobile ? '15%' : '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: gameSize.width,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 2
          }}>
            <motion.button
              style={{
                backgroundColor: '#ff0000',
                color: 'white',
                border: '4px solid #8b0000',
                padding: isMobile ? '12px 30px' : '15px 40px',
                fontSize: isMobile ? '1.5rem' : '2rem',
                fontFamily: "'Press Start 2P', cursive",
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
              onClick={() => {
                setShowTutorial(true);
              }}
            >
              GAME START
            </motion.button>
          </div>
        )}

        {/* Tutorial Overlay */}
        {showTutorial && (
          <motion.div
            style={{
              position: 'fixed',
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
              zIndex: 10,
              fontSize: isMobile ? '0.8rem' : '1rem',
              lineHeight: '1.5',
              textAlign: 'center'
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <h2 style={{ color: '#ffff00', marginBottom: '20px' }}>HOW TO PLAY</h2>

            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <h3 style={{ color: '#00ff00', fontSize: '0.9em' }}>CONTROLS</h3>
              {isMobile ? (
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

            <motion.button
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
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                }
                onStartGame();
              }}
            >
              GO!
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default MainPage;