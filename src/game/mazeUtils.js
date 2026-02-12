import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';

export const createMaze = (scene, player) => {
  const tileSize = GameConfig.TILE_SIZE;
  const wallScale = GameConfig.WALL_SCALE;
  const mazeSize = GameConfig.MAZE_SIZE;
  const spacing = GameConfig.SPACING;

  // 미로 배열 초기화 - 모든 칸을 벽(1)으로 채움
  let maze = Array(mazeSize).fill().map(() => Array(mazeSize).fill(1));

  // 중앙 위치 계산
  const centerX = Math.floor(mazeSize / 2);
  const centerY = Math.floor(mazeSize / 2);

  // 중앙 위치와 주변을 비움 (0으로 설정)
  maze[centerY][centerX] = 0;
  maze[centerY - 1][centerX] = 0;
  maze[centerY + 1][centerX] = 0;
  maze[centerY][centerX - 1] = 0;
  maze[centerY][centerX + 1] = 0;

  // 시작 위치와 주변을 비움
  maze[1][1] = 0;
  maze[1][2] = 0;
  maze[2][1] = 0;

  const carve = (x, y) => {
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    directions.sort(() => Math.random() - 0.5);

    for (let [dx, dy] of directions) {
      let nx = x + dx * 2, ny = y + dy * 2;
      if (nx >= 0 && nx < mazeSize && ny >= 0 && ny < mazeSize && maze[ny][nx] === 1) {
        maze[y + dy][x + dx] = 0;
        maze[ny][nx] = 0;
        carve(nx, ny);
      }
    }
  };

  carve(1, 1);

  const walls = scene.physics.add.staticGroup();
  const fishes = scene.physics.add.group();

  const worldWidth = mazeSize * tileSize * spacing;
  const worldHeight = mazeSize * tileSize * spacing;

  scene.physics.world.setBounds(0, 0, worldWidth, worldHeight);

  // Create fish animation
  if (!scene.anims.exists('fishSwim')) {
    scene.anims.create({
      key: 'fishSwim',
      frames: [
        { key: 'fish1' },
        { key: 'fish2' }
      ],
      frameRate: 4,
      repeat: -1
    });
  }

  for (let y = 0; y < mazeSize; y++) {
    for (let x = 0; x < mazeSize; x++) {
      if (maze[y][x] === 1) {
        const buildingType = Phaser.Math.Between(1, 3);
        const wall = walls.create(x * tileSize * spacing, y * tileSize * spacing, `building${buildingType}`);
        wall.setScale(wallScale);
        wall.setOrigin(0.5, 0.5);
        wall.setDepth(y);

        const imageWidth = wall.width * wallScale;
        const imageHeight = wall.height * wallScale;
        wall.body.setSize(imageWidth, imageHeight);
        wall.body.setOffset((wall.width - imageWidth) / 2, (wall.height - imageHeight) / 2);
      } else if (Math.random() < 0.1 && !(x === 1 && y === 1)) {
        const fish = fishes.create(x * tileSize * spacing, y * tileSize * spacing, 'fish1');
        fish.setScale(0.05);
        fish.setDepth(y);
        fish.play('fishSwim');

        scene.tweens.add({
          targets: fish,
          y: fish.y - 15,
          duration: 1000,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1
        });
      }
    }
  }

  scene.physics.add.collider(player, walls);

  scene.physics.add.overlap(player, fishes, (player, fish) => {
    if (!scene.gameOverStarted) {
      scene.soundManager.playFishSound();
      scene.events.emit('changeHealth', GameConfig.FISH.HEAL_AMOUNT);
      // fish 카운트 업데이트
      scene.events.emit('collectFish');
      fish.destroy();
    }
  });

  return { walls, fishes, worldWidth, worldHeight, centerX, centerY };
};

export const updatePlayerDepth = (player, mazeSize) => {
  player.setDepth(mazeSize);
};