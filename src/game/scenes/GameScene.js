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

export class GameScene extends Phaser.Scene {
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
    this.soundManager.playMainBGM();

    // Player 클래스 사용
    const player = new Player(this, 100, 100);

    const { walls, fishes, worldWidth, worldHeight, centerX, centerY, maze } = createMaze(this, player);
    this.maze = maze;

    // 플레이어 위치를 시작 지점으로 이동
    player.setPosition(this.tileSize * this.spacing, this.tileSize * this.spacing);

    // 모바일 컨트롤 추가
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      this.input.addPointer(1);
      this.setupMobileControls(player);
    }

    // 초기 점프 카운트 설정
    this.game.events.emit('updateJumpCount', 0);

    // Milk items (overlap handler is inside createMilkItems)
    const milks = createMilkItems(this, walls, player);

    const spaceBar = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
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

    // HP=0 -> Game Over
    this.game.events.on('changeHealth', (amount) => {
      // Check if health reached 0 (App.js tracks actual value)
      // We use a flag here so the scene knows when to trigger game over
    });

    const centerPosX = centerX * this.tileSize * this.spacing;
    const centerPosY = centerY * this.tileSize * this.spacing;
    this.goal = createGoal(this, player, centerPosX, centerPosY);

    // Pause/Resume 이벤트 리스너
    this.game.events.on('pauseGame', () => {
      this.scene.pause();
      if (this.soundManager) this.soundManager.stopAllSounds(); // 소리도 멈춤 (선택사항)
    });

    this.game.events.on('resumeGame', () => {
      this.scene.resume();
      this.physics.resume();
      this.input.keyboard.enabled = true;
      this.input.enabled = true;
      if (this.soundManager) this.soundManager.playMainBGM(); // BGM 재개
    });

    this.apartmentSystem = new ApartmentSystem(this, player, this.goal);

    const cursors = this.input.keyboard.createCursorKeys();
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    // 카메라 설정
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

    this.player = player;
    this.cursors = cursors;
    this.walls = walls;

    setupHealthSystem(this, player, fishes);

    const spawnDelay = Phaser.Math.Between(8000, 12000);
    this.time.delayedCall(spawnDelay, () => {
      if (!this.gameOverStarted) {
        // Enemy 클래스 사용
        // Pass maze grid to Enemy for optimized collision
        this.enemy = new Enemy(this, this.player, worldWidth, worldHeight, this.maze);
        this.enemy.enemySound = this.soundManager.playEnemySound();
        this.enemySpawned = true;

        // Add collider to prevent walking through walls, trigger jump on contact
        this.physics.add.collider(this.enemy, this.walls, () => {
          if (this.enemy && !this.enemy.isJumping) this.enemy.performJump();
        });

        // Camera Pan Sequence
        const originalZoom = this.cameras.main.zoom;

        // Debug enemy position
        console.log(`Enemy Spawned at: ${this.enemy.x}, ${this.enemy.y}`);

        // Pan to Enemy (Phaser automatically stops following player when pan starts)
        this.cameras.main.pan(this.enemy.x, this.enemy.y, 1000, 'Power2');
        this.cameras.main.zoomTo(1.3, 1000);

        this.time.delayedCall(2000, () => {
          if (this.gameOverStarted) return;

          // Pan back to Player
          this.cameras.main.pan(this.player.x, this.player.y, 1000, 'Power2');
          this.cameras.main.zoomTo(originalZoom, 1000);

          this.time.delayedCall(1000, () => {
            if (!this.gameOverStarted) {
              this.cameras.main.startFollow(this.player, true);
            }
          });
        });

        this.physics.add.overlap(this.player, this.enemy, () => {
          if (!this.gameOverStarted) {
            this.gameOverAnimation();
          }
        });
      }
    });

    // 게임 준비 완료 이벤트 발송
    this.game.events.emit('gameReady');
  }

  setupMobileControls(player) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) return;

    // UI 컨테이너 생성
    const gameContainer = document.getElementById('game-container');
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

    // 조이스틱 영역
    const joystickArea = document.createElement('div');
    Object.assign(joystickArea.style, {
      width: '120px',
      height: '120px',
      borderRadius: '50%',
      background: 'rgba(0, 0, 0, 0.3)',
      position: 'relative',
      pointerEvents: 'auto'
    });

    // 조이스틱 핸들
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

    // 점프 버튼
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

    // UI 조립
    joystickArea.appendChild(joystickHandle);
    controlsContainer.appendChild(joystickArea);
    controlsContainer.appendChild(jumpButton);
    gameContainer.appendChild(controlsContainer);

    // 조이스틱 이벤트 처리
    let isJoystickActive = false;
    let joystickOrigin = { x: 0, y: 0 };

    joystickArea.addEventListener('pointerdown', (e) => {
      isJoystickActive = true;
      const rect = joystickArea.getBoundingClientRect();
      joystickOrigin.x = e.clientX - rect.left;
      joystickOrigin.y = e.clientY - rect.top;
      joystickHandle.style.left = `${joystickOrigin.x}px`;
      joystickHandle.style.top = `${joystickOrigin.y}px`;
    });

    document.addEventListener('pointermove', (e) => {
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

      // 플레이어 이동
      const speed = 160 * (distance / 60);
      player.setVelocity(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      );

      // 애니메이션
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
    });

    const endJoystick = () => {
      if (!isJoystickActive) return;
      isJoystickActive = false;
      joystickHandle.style.transform = 'translate(-50%, -50%)';
      player.setVelocity(0);
      player.anims.play('idle', true);
    };

    document.addEventListener('pointerup', endJoystick);
    document.addEventListener('pointercancel', endJoystick);

    // 점프 버튼 이벤트
    jumpButton.addEventListener('pointerdown', () => {
      if (!player.isJumping && player.jumpCount > 0) {
        player.jump();
      }
    });

    // 씬 종료 시 정리를 위해 저장
    this.mobileControls = { controlsContainer, joystickArea, jumpButton };

    // 씬 종료 시 정리 함수
    this.events.once('shutdown', () => {
      controlsContainer.remove();
    });
  }

  update() {
    if (this.player && !this.gameOverStarted) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (!this.player.isJumping) {
        if (isMobile) {
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
    this.soundManager.playDyingSound();
    this.soundManager.stopMainBGM();

    if (this.enemy && this.enemy.enemySound) {
      this.soundManager.stopEnemySound(this.enemy.enemySound);
    }

    if (this.apartmentSystem) {
      this.apartmentSystem.stopSpawning();
    }

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
        graphics.arc(this.player.x, this.player.y + 50, 30, 0, Math.PI, false);
        graphics.closePath();
        graphics.fill();

        this.tweens.add({
          targets: this.player,
          y: this.player.y + 100,
          alpha: 0,
          duration: 500,
          ease: 'Power2',
          onComplete: () => {
            setTimeout(() => {
              // React 컴포넌트로 게임 오버 이벤트 전송
              this.game.events.emit('gameOver', {
                milkCount: this.registry.get('milkCount'),
                fishCount: this.registry.get('fishCount')
              });
              this.scene.pause();
            }, 500);
          }
        });
      }
    });
  }

  shutdown() {
    // Clean up game-level event listeners (scene-level auto-cleanup on restart)
    this.game.events.off('pauseGame');
    this.game.events.off('resumeGame');
    this.game.events.off('changeHealth');

    if (this.apartmentSystem) {
      this.apartmentSystem.destroy();
      this.apartmentSystem = null;
    }
    if (this.enemy) {
      if (this.enemy.enemySound) {
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
