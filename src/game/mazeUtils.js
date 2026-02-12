import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';

export const createMaze = (scene, player) => {
  const tileSize = GameConfig.TILE_SIZE;
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

        // 이미지 크기에 따라 스케일 동적 계산 (타일 크기에 맞춤)
        // 가로 길이를 그리드 간격에 맞추고, 약간의 오버랩(10%)을 둠
        const targetSize = tileSize * spacing;
        const scaleX = (targetSize / wall.width) * 1.1;
        const scaleY = (targetSize / wall.height) * 1.1;

        // 비율 유지를 위해 더 작은 스케일 기준, 혹은 가로 기준? 
        // 미로 벽이므로 가로가 꽉 차는게 중요함. 비율 유지하면서 가로 기준.
        const scale = targetSize / wall.width * 1.05;

        wall.setScale(scale);
        wall.setOrigin(0.5, 0.5);
        wall.setDepth(y);

        const imageWidth = wall.width * scale;
        const imageHeight = wall.height * scale;
        wall.body.setSize(imageWidth, imageHeight);
        // 중앙 정렬을 위한 오프셋
        // wall.body.setOffset((wall.width - imageWidth) / 2, (wall.height - imageHeight) / 2); // setSize가 이미 처리할 수 있음, 확인 필요
        // Physics Body Offset은 원본 크기 기준이 아님. setSize 후에는 중심이 맞아야 함.
        // Arcade Physics setSize는 중앙 정렬인 경우 offset을 자동 조정하지 않음. 수동 계산 필요.
        // 하지만 static body이고 create()로 만들었음.

        // Phaser Arcade Physics Body 오프셋 계산 (중앙 정렬 기준)
        // wall.body.setOffset(
        //   wall.width * 0.5 - (imageWidth * 0.5) / scale, 
        //   ... 복잡함.
        // );

        // 간단히: refreshBody() 호출하면 static body는 현재 스케일/위치로 업데이트됨.
        wall.refreshBody();
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

  // Fish collision is handled in healthUtils.js
  scene.physics.add.collider(player, walls);

  return { walls, fishes, worldWidth, worldHeight, centerX, centerY };
};

export const updatePlayerDepth = (player, mazeSize) => {
  player.setDepth(mazeSize);
};