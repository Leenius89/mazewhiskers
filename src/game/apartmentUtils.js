import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';

export class ApartmentSystem {
  constructor(scene, player, goal) {
    this.scene = scene;
    this.player = player;
    this.goal = goal;
    this.apartments = scene.physics.add.staticGroup();
    this.mazeSize = GameConfig.MAZE_SIZE;
    this.tileSize = GameConfig.TILE_SIZE;
    this.spacing = GameConfig.SPACING;
    this.wallScale = GameConfig.APARTMENT.WALL_SCALE;
    this.isGameOver = false;
    this.baseDepth = GameConfig.APARTMENT.BASE_DEPTH;
    // O(1) position tracking
    this.occupiedPositions = new Set();

    // 각 방향별 현재 진행 상태
    this.progress = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    };

    // dust 애니메이션 생성
    this.createDustAnimation();

    // 15초 후에 시작
    this.scene.time.delayedCall(GameConfig.APARTMENT.DELAY, () => this.startApartmentSpawn(), [], this);
  }

  createDustAnimation() {
    if (!this.scene.anims.exists('dust')) {
      this.scene.anims.create({
        key: 'dust',
        frames: [
          { key: 'dust1', frame: null },
          { key: 'dust2', frame: null }
        ],
        frameRate: 8,
        repeat: 3,
        duration: 1000
      });
    }
  }

  startApartmentSpawn() {
    // 각 방향별로 타이머 설정
    this.spawnTimers = {
      top: this.createSpawnTimer('top'),
      right: this.createSpawnTimer('right'),
      bottom: this.createSpawnTimer('bottom'),
      left: this.createSpawnTimer('left')
    };

    // 각 방향에서 첫 번째 행 즉시 생성
    this.spawnApartmentRow('top');
    this.spawnApartmentRow('right');
    this.spawnApartmentRow('bottom');
    this.spawnApartmentRow('left');
  }

  createSpawnTimer(direction) {
    return this.scene.time.addEvent({
      delay: GameConfig.APARTMENT.SPAWN_INTERVAL,
      callback: () => this.spawnApartmentRow(direction),
      callbackScope: this,
      loop: true
    });
  }

  calculatePosition(direction, progress) {
    switch (direction) {
      case 'top':
        return {
          x: (index) => index * this.tileSize * this.spacing,
          y: () => progress * this.tileSize * this.spacing
        };
      case 'right':
        return {
          x: () => (this.mazeSize - 1) * this.tileSize * this.spacing - progress * this.tileSize * this.spacing,
          y: (index) => index * this.tileSize * this.spacing
        };
      case 'bottom':
        return {
          x: (index) => index * this.tileSize * this.spacing,
          y: () => (this.mazeSize - 1) * this.tileSize * this.spacing - progress * this.tileSize * this.spacing
        };
      case 'left':
        return {
          x: () => progress * this.tileSize * this.spacing,
          y: (index) => index * this.tileSize * this.spacing
        };
      default:
        return {
          x: (index) => index * this.tileSize * this.spacing,
          y: () => progress * this.tileSize * this.spacing
        };
    }
  }

  spawnApartmentRow(direction) {
    if (this.isGameOver || this.progress[direction] >= this.mazeSize / 2) return;

    const getPosition = this.calculatePosition(direction, this.progress[direction]);
    const dustSprites = [];

    // 방향에 따라 반복 범위 결정
    let range = this.mazeSize;
    if (direction === 'right' || direction === 'left') {
      range = this.mazeSize;
    }

    for (let i = 0; i < range; i++) {
      const xPos = getPosition.x(i);
      const yPos = getPosition.y(i);

      // 이미 아파트가 있는지 확인
      if (this.isPositionOccupied(xPos, yPos)) continue;

      this.removeExistingWalls(xPos, yPos);

      const dust = this.scene.add.sprite(xPos, yPos, 'dust1');
      dust.setScale(this.wallScale);
      dust.setDepth(this.baseDepth + this.progress[direction] * 10);

      dust.play('dust');
      dust.on('animationcomplete', () => {
        this.createApartment(xPos, yPos, i, dust, direction);
      });

      dustSprites.push(dust);
    }

    if (dustSprites.length > 0) {
      this.scene.soundManager.playConstructSound();
    }

    this.progress[direction]++;
    this.checkGameOver();
  }

  _posKey(x, y) {
    // Round to grid for O(1) lookup
    const unit = this.tileSize * this.spacing;
    return `${Math.round(x / unit)},${Math.round(y / unit)}`;
  }

  isPositionOccupied(x, y) {
    return this.occupiedPositions.has(this._posKey(x, y));
  }

  createApartment(xPos, yPos, index, dust, direction) {
    // 다시 한번 위치 확인 (애니메이션 도중 다른 아파트가 생겼을 수 있음)
    if (this.isPositionOccupied(xPos, yPos)) {
      dust.destroy();
      return;
    }

    // Mark position as occupied
    this.occupiedPositions.add(this._posKey(xPos, yPos));

    const apartmentType = Phaser.Math.Between(1, 3);
    const apartment = this.apartments.create(xPos, yPos, `apt${apartmentType}`);

    apartment.setScale(this.wallScale);
    apartment.setOrigin(0.5, 0.5);
    apartment.setDepth(this.baseDepth + this.progress[direction] * 10);

    const imageWidth = apartment.width * this.wallScale;
    const imageHeight = apartment.height * this.wallScale;
    apartment.body.setSize(imageWidth, imageHeight);
    apartment.body.setOffset((apartment.width - imageWidth) / 2, (apartment.height - imageHeight) / 2);

    apartment.setAlpha(0);
    this.scene.tweens.add({
      targets: apartment,
      alpha: 1,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        dust.destroy();
        this.checkCollisions(apartment);
      }
    });
  }

  removeExistingWalls(x, y) {
    // Only check walls within a reasonable distance
    const threshold = this.tileSize * this.spacing;
    const walls = this.scene.walls.getChildren();
    for (let i = walls.length - 1; i >= 0; i--) {
      const wall = walls[i];
      if (wall.active && Math.abs(wall.x - x) < threshold && Math.abs(wall.y - y) < threshold) {
        wall.destroy();
      }
    }
  }

  checkCollisions(apartment) {
    const playerBounds = this.player.getBounds();
    const apartmentBounds = apartment.getBounds();

    if (Phaser.Geom.Rectangle.Overlaps(playerBounds, apartmentBounds)) {
      this.triggerGameOver('player');
      return;
    }

    if (this.goal) {
      const goalBounds = this.goal.getBounds();
      if (Phaser.Geom.Rectangle.Overlaps(goalBounds, apartmentBounds)) {
        this.triggerGameOver('goal');
      }
    }
  }

  checkGameOver() {
    // 모든 방향이 중간까지 도달했는지 확인
    if (Object.values(this.progress).every(p => p >= this.mazeSize / 2)) {
      this.stopSpawning();
    }
  }

  triggerGameOver(reason) {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.stopSpawning();
    this.scene.gameOverAnimation();
  }

  stopSpawning() {
    if (this.spawnTimers) {
      Object.values(this.spawnTimers).forEach(timer => timer.remove());
      this.spawnTimers = null;
    }
  }

  destroy() {
    this.stopSpawning();
    this.apartments.clear(true, true);
  }
}