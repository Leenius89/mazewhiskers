import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

interface MainPageProps {
    onStartGame: () => void;
    gameSize: { width: number | string; height: number | string };
}

const MotionClickable = motion.div as any;

const MainPage: React.FC<MainPageProps> = ({ onStartGame, gameSize }) => {
    const [showButton, setShowButton] = useState(false);
    const [showTitle, setShowTitle] = useState(false);
    const [_cameraPosition, setCameraPosition] = useState(0);
    const [showStartScreen, setShowStartScreen] = useState(true);
    const [isMobile] = useState(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const startExperience = useCallback(async () => {
        try {
            audioRef.current = new Audio('sources/main.mp3');
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
    }, []);

    const handleStartGame = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        onStartGame();
    }, [onStartGame]);

    // 시작 화면에서 엔터키/스페이스바로 시작 가능하도록 키보드 이벤트 리스너
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (showStartScreen) {
                    // 첫 화면: "PRESS ENTER" → 음악 재생 + 타이틀 화면으로 전환
                    startExperience();
                } else if (showButton) {
                    // GAME START 버튼이 보이는 상태: 게임 시작
                    handleStartGame();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showStartScreen, showButton, startExperience, handleStartGame]);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        };
    }, []);

    // 첫 시작 화면: 게임 안내 + "PRESS ENTER" (한/영 병기)
    if (showStartScreen) {
        return (
            <div
                style={{
                    width: '100vw',
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: '#000',
                    cursor: 'pointer',
                    padding: '20px',
                    gap: '0px'
                }}
                onClick={startExperience}
            >
                {/* 게임 타이틀 */}
                <motion.h1
                    style={{
                        color: '#ffffff',
                        fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                        fontSize: isMobile ? 'clamp(1.5rem, 6vw, 2.5rem)' : '2.5rem',
                        textAlign: 'center',
                        marginBottom: '30px',
                        textShadow: '3px 3px 0px #8b0000',
                        lineHeight: '1.3'
                    }}
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    MAZE WHISKERS
                </motion.h1>

                {/* 게임 안내 박스 */}
                <motion.div
                    style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        border: '3px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '12px',
                        padding: isMobile ? '16px' : '24px',
                        maxWidth: '600px',
                        width: '90%',
                        textAlign: 'center'
                    }}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                >
                    {/* 게임 소개 */}
                    <p style={{
                        color: '#e2e8f0',
                        fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                        fontSize: isMobile ? '0.85rem' : '1.15rem',
                        lineHeight: '2',
                        marginBottom: '20px'
                    }}>
                        미로에 갇힌 고양이를 탈출시키세요!
                        <br />
                        <span style={{ color: '#a0aec0', fontSize: isMobile ? '0.65rem' : '0.85rem' }}>
                            Help the cat escape the maze!
                        </span>
                    </p>

                    {/* 조작법 */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        marginBottom: '16px'
                    }}>
                        <div style={{
                            color: '#fbbf24',
                            fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                            fontSize: isMobile ? '0.85rem' : '1.1rem',
                            marginBottom: '8px',
                            fontWeight: 'bold'
                        }}>
                            ── 조작법 / Controls ──
                        </div>

                        {isMobile ? (
                            <div style={{
                                color: '#e2e8f0',
                                fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                                fontSize: '0.8rem',
                                lineHeight: '2.2'
                            }}>
                                🕹️ 조이스틱: 이동 / Move<br />
                                🔴 버튼: 점프 / Jump
                            </div>
                        ) : (
                            <div style={{
                                color: '#e2e8f0',
                                fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                                fontSize: '0.9rem',
                                lineHeight: '2.2'
                            }}>
                                ⬆️⬇️⬅️➡️ 방향키: 이동 / Move<br />
                                SPACE 스페이스바: 점프 / Jump
                            </div>
                        )}
                    </div>

                    {/* 규칙 */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    }}>
                        <div style={{
                            color: '#fbbf24',
                            fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                            fontSize: isMobile ? '0.85rem' : '1.1rem',
                            marginBottom: '8px',
                            fontWeight: 'bold'
                        }}>
                            ── 규칙 / Rules ──
                        </div>

                        <div style={{
                            color: '#e2e8f0',
                            fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                            fontSize: isMobile ? '0.75rem' : '0.95rem',
                            lineHeight: '2.2',
                            textAlign: 'center'
                        }}>
                            ❤️ 체력이 서서히 줄어듭니다!<br />
                            <span style={{ color: '#a0aec0', fontSize: isMobile ? '0.6rem' : '0.75rem' }}>HP drops over time!</span><br />
                            🐟 생선을 먹으면 체력 회복 (+20)<br />
                            <span style={{ color: '#a0aec0', fontSize: isMobile ? '0.6rem' : '0.75rem' }}>Eat FISH to Heal (+20)</span><br />
                            🥛 우유를 마시면 점프 횟수 증가 (+1)<br />
                            <span style={{ color: '#a0aec0', fontSize: isMobile ? '0.6rem' : '0.75rem' }}>Drink MILK for Jump (+1)</span>
                        </div>
                    </div>
                </motion.div>

                {/* PRESS ENTER / CLICK 안내 */}
                <motion.div
                    style={{
                        color: 'white',
                        fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                        textAlign: 'center',
                        padding: '20px',
                        fontSize: isMobile ? '14px' : '18px',
                        marginTop: '30px'
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
                    {isMobile ? 'TAP TO START' : 'PRESS ENTER'}
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
                        justifyContent: 'center',
                        zIndex: 2
                    }}>
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
