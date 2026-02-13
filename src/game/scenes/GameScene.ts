import Phaser from 'phaser';
import { createMaze, updatePlayerDepth } from '../mazeUtils';
import { Player } from '../objects/Player';
import { Enemy } from '../objects/Enemy';
import { createMilkItems } from '../playerUtils';
import { createGoal } from '../goalUtils';
import { setupHealthSystem } from '../healthUtils';
import { SoundManager } from '../soundUtils';
import { ApartmentSystem } from '../apartmentUtils';
import { GameConfig } from '../constants/GameConfig';
import { AssetLoader } from '../managers/AssetLoader';

interface JoystickOrigin {
    x: number;
    y: number;
}

interface MobileControls {
    controlsContainer: HTMLDivElement;
    joystickArea: HTMLDivElement;
    jumpButton: HTMLButtonElement;
}

export class GameScene extends Phaser.Scene {
    public health: number;
    public enemy: Enemy | null;
    public enemySpawned: boolean;
    public worldWidth: number;
    public worldHeight: number;
    public gameOverStarted: boolean;
    public soundManager: SoundManager | null;
    public apartmentSystem: ApartmentSystem | null;
    public tileSize: number;
    public spacing: number;
    public maze: number[][] | undefined;
    public player: Player | null; // Typed as Player
    public cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
    public walls: Phaser.Physics.Arcade.StaticGroup | undefined;
    public goal: Phaser.Physics.Arcade.Sprite | undefined;
    private mobileControls: MobileControls | null;
    public startTime: number = 0;

    constructor() {
        super('GameScene');
        this.health = 100;
        this.enemy = null;
        this.enemySpawned = false;
        this.worldWidth = 0;
        this.worldHeight = 0;
        this.gameOverStarted = false;
        this.soundManager = null;
        this.apartmentSystem = null;
        this.tileSize = GameConfig.TILE_SIZE;
        this.spacing = GameConfig.SPACING;
        this.player = null;
        this.mobileControls = null;
    }

    preload() {
        const assetLoader = new AssetLoader(this);
        assetLoader.preload();

        this.soundManager = new SoundManager(this);
        this.soundManager.preloadSounds();
    }

    create() {
        // Prevent duplicate BGM by stopping all previous sounds
        this.sound.stopAll();
        if (this.soundManager) this.soundManager.playMainBGM();

        // Start Timer
        this.startTime = Date.now();

        // Create Player
        const player = new Player(this, 100, 100);
        this.player = player;

        const { walls, fishes, worldWidth, worldHeight, centerX, centerY, maze } = createMaze(this, player);
        this.walls = walls;
        this.maze = maze;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        // Move player to start position
        player.setPosition(this.tileSize * this.spacing, this.tileSize * this.spacing);

        // Mobile controls
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            this.input.addPointer(1);
            this.setupMobileControls(player);
        }

        // Reset Jump Count
        this.game.events.emit('updateJumpCount', 0);

        // Milk items
        if (this.walls) {
            createMilkItems(this as any, walls, player as any);
        }

        const spaceBar = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        spaceBar.on('down', () => {
            player.jump();
        });

        this.registry.set('milkCount', 0);
        this.registry.set('fishCount', 0);

        // Forward scene-level collect events to game-level for React UI
        this.events.on('collectMilk', () => {
            const currentCount = this.registry.get('milkCount') || 0;
            this.registry.set('milkCount', currentCount + 1);
            this.game.events.emit('collectMilk', currentCount + 1);
        });

        this.events.on('collectFish', () => {
            const currentCount = this.registry.get('fishCount') || 0;
            this.registry.set('fishCount', currentCount + 1);
            this.game.events.emit('collectFish', currentCount + 1);
        });

        // HP=0 -> Game Over logic handled in App.js usually but scene listens for signal
        this.game.events.on('changeHealth', (amount: number) => {
            // Logic handled via App.js checking health ref
        });

        const centerPosX = centerX * this.tileSize * this.spacing;
        const centerPosY = centerY * this.tileSize * this.spacing;
        this.goal = createGoal(this as any, player, centerPosX, centerPosY);

        // Pause/Resume listeners
        this.game.events.on('pauseGame', () => {
            this.scene.pause();
            if (this.soundManager) this.soundManager.stopAllSounds();
        });

        this.game.events.on('resumeGame', () => {
            this.scene.resume();
            this.physics.resume();
            if (this.input.keyboard) this.input.keyboard.enabled = true;
            this.input.enabled = true;
            if (this.soundManager) this.soundManager.playMainBGM();
        });

        this.apartmentSystem = new ApartmentSystem(this as any, player, this.goal);

        if (!this.sys.game.device.os.android && !this.sys.game.device.os.iOS) { // Desktop check rough approximation
            this.cursors = this.input.keyboard!.createCursorKeys();
        }

        // Camera
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        this.cameras.main.startFollow(player, true);
        this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);

        if (isMobile) {
            this.cameras.main.setZoom(0.5);
            this.cameras.main.setFollowOffset(-50, -50);
            this.cameras.main.setLerp(0.1, 0.1);
        } else {
            this.cameras.main.setZoom(1);
        }

        setupHealthSystem(this as any, player, fishes);

        // Enemy Spawn Logic: Wait for introComplete event, then wait 10 seconds
        this.events.once('introComplete', () => {
            this.time.delayedCall(10000, () => {
                if (!this.gameOverStarted && this.maze) {
                    // Enemy
                    this.enemy = new Enemy(this, this.player!, worldWidth, worldHeight, this.maze);
                    if (this.soundManager) this.enemy.enemySound = this.soundManager.playEnemySound() || undefined;
                    this.enemySpawned = true;

                    if (this.walls) {
                        this.physics.add.collider(this.enemy, this.walls, () => {
                            if (this.enemy && !this.enemy.isJumping) (this.enemy as any).performJump();
                        });
                    }

                    // Camera Pan Sequence (Enemy Introduction)
                    const originalZoom = this.cameras.main.zoom;

                    // Explicitly stop follow
                    this.cameras.main.stopFollow();

                    // Pan to Enemy
                    this.cameras.main.pan(this.enemy.x, this.enemy.y, 1000, 'Power2');
                    this.cameras.main.zoomTo(1.3, 1000);

                    this.time.delayedCall(2000, () => {
                        if (this.gameOverStarted) return;

                        // Pan back to Player quickly
                        if (this.player) {
                            this.cameras.main.pan(this.player.x, this.player.y, 500, 'Power2'); // Fast return
                            this.cameras.main.zoomTo(originalZoom, 500);

                            this.time.delayedCall(500, () => {
                                if (!this.gameOverStarted && this.player) {
                                    this.cameras.main.startFollow(this.player, true);
                                }
                            });
                        }
                    });

                    if (this.player) {
                        this.physics.add.overlap(this.player, this.enemy, () => {
                            if (!this.gameOverStarted) {
                                this.gameOverAnimation();
                            }
                        });
                    }
                }
            });
        });

        this.game.events.emit('gameReady');
    }

    setupMobileControls(player: Player) {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (!isMobile) return;

        // UI Container
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;

        const controlsContainer = document.createElement('div');
        Object.assign(controlsContainer.style, {
            position: 'absolute',
            bottom: '20px',
            left: '0',
            right: '0',
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 20px',
            pointerEvents: 'none',
            zIndex: '1000'
        });

        // Joystick Area
        const joystickArea = document.createElement('div');
        Object.assign(joystickArea.style, {
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.3)',
            position: 'relative',
            pointerEvents: 'auto'
        });

        // Joystick Handle
        const joystickHandle = document.createElement('div');
        Object.assign(joystickHandle.style, {
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.5)',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none'
        });

        // Jump Button
        const jumpButton = document.createElement('button');
        Object.assign(jumpButton.style, {
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(255, 0, 0, 0.5)',
            border: 'none',
            color: 'white',
            fontSize: '18px',
            fontWeight: 'bold',
            pointerEvents: 'auto',
            cursor: 'pointer'
        });
        jumpButton.textContent = 'JUMP';

        // Assemble
        joystickArea.appendChild(joystickHandle);
        controlsContainer.appendChild(joystickArea);
        controlsContainer.appendChild(jumpButton);
        gameContainer.appendChild(controlsContainer);

        // Joystick Logic
        let isJoystickActive = false;
        let joystickOrigin: JoystickOrigin = { x: 0, y: 0 };

        joystickArea.addEventListener('pointerdown', (e) => {
            isJoystickActive = true;
            const rect = joystickArea.getBoundingClientRect();
            joystickOrigin.x = e.clientX - rect.left;
            joystickOrigin.y = e.clientY - rect.top;
            joystickHandle.style.left = `${joystickOrigin.x}px`;
            joystickHandle.style.top = `${joystickOrigin.y}px`;
        });

        // Type definition for document pointermove event
        const handlePointerMove = (e: PointerEvent) => {
            if (!isJoystickActive) return;

            const rect = joystickArea.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const dx = x - joystickOrigin.x;
            const dy = y - joystickOrigin.y;
            const angle = Math.atan2(dy, dx);
            const distance = Math.min(60, Math.sqrt(dx * dx + dy * dy));

            const moveX = Math.cos(angle) * distance;
            const moveY = Math.sin(angle) * distance;

            joystickHandle.style.transform = `translate(${moveX}px, ${moveY}px)`;

            // Move player
            const speed = 160 * (distance / 60);
            player.setVelocity(
                Math.cos(angle) * speed,
                Math.sin(angle) * speed
            );

            // Animation
            if (Math.abs(moveX) > 0 || Math.abs(moveY) > 0) {
                player.anims.play('walk', true);
                if (moveX < 0) {
                    player.setFlipX(true);
                    player.lastDirection = 'left';
                } else {
                    player.setFlipX(false);
                    player.lastDirection = 'right';
                }
            }
        };
        document.addEventListener('pointermove', handlePointerMove);

        const endJoystick = () => {
            if (!isJoystickActive) return;
            isJoystickActive = false;
            joystickHandle.style.transform = 'translate(-50%, -50%)';
            player.setVelocity(0);
            player.anims.play('idle', true);
        };

        document.addEventListener('pointerup', endJoystick);
        document.addEventListener('pointercancel', endJoystick);

        // Jump Button Event
        const handleJump = () => {
            if (!player.isJumping && player.jumpCount > 0) {
                player.jump();
            }
        };
        jumpButton.addEventListener('pointerdown', handleJump);

        this.mobileControls = { controlsContainer, joystickArea, jumpButton };

        // Clean up on scene shutdown
        this.events.once('shutdown', () => {
            controlsContainer.remove();
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', endJoystick);
            document.removeEventListener('pointercancel', endJoystick);
        });
    }

    update() {
        if (this.player && !this.gameOverStarted) {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (!this.player.isJumping) {
                if (isMobile) {
                    // Player update logic for mobile (controlled by joystick event) is mostly event driven,
                    // but we call updateDepth.
                    // Logic regarding cursors is in Player.ts update() which takes optional cursors.
                    this.player.update();
                } else {
                    this.player.update(this.cursors);
                }

                updatePlayerDepth(this.player, 21);
            }

            if (this.enemySpawned && this.enemy) {
                this.enemy.update();
            }
        }
    }

    gameOverAnimation() {
        this.gameOverStarted = true;
        if (this.soundManager) {
            this.soundManager.playDyingSound();
            this.soundManager.stopMainBGM();

            if (this.enemy && this.enemy.enemySound) {
                this.soundManager.stopEnemySound(this.enemy.enemySound);
            }
        }

        if (this.apartmentSystem) {
            this.apartmentSystem.stopSpawning();
        }

        if (this.player) {
            this.tweens.add({
                targets: this.player,
                y: this.player.y - 50,
                angle: 180,
                duration: 500,
                ease: 'Power2',
                onComplete: () => {
                    const graphics = this.add.graphics();
                    graphics.fillStyle(0x000000, 1);
                    graphics.beginPath();
                    if (this.player) graphics.arc(this.player.x, this.player.y + 50, 30, 0, Math.PI, false);
                    graphics.closePath();
                    graphics.fill();

                    if (this.player) {
                        this.tweens.add({
                            targets: this.player,
                            y: this.player.y + 100,
                            alpha: 0,
                            duration: 500,
                            ease: 'Power2',
                            onComplete: () => {
                                setTimeout(() => {
                                    // Emit Game Over to React
                                    this.game.events.emit('gameOver', {
                                        milkCount: this.registry.get('milkCount'),
                                        fishCount: this.registry.get('fishCount')
                                    });
                                    this.scene.pause();
                                }, 500);
                            }
                        });
                    }
                }
            });
        }
    }

    shutdown() {
        // Clean up game-level event listeners
        this.game.events.off('pauseGame');
        this.game.events.off('resumeGame');
        this.game.events.off('changeHealth');

        if (this.apartmentSystem) {
            this.apartmentSystem.destroy();
            this.apartmentSystem = null;
        }
        if (this.enemy) {
            if (this.enemy.enemySound && this.soundManager) {
                this.soundManager.stopEnemySound(this.enemy.enemySound);
            }
            this.enemy.destroy();
            this.enemy = null;
        }
        if (this.soundManager) {
            this.soundManager.stopAllSounds();
        }
        if (this.mobileControls) {
            this.mobileControls.controlsContainer.remove();
        }
    }
}
