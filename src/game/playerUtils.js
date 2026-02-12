import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';

export const createMilkItems = (scene, walls, player) => {
  const milks = scene.physics.add.group();
  const mazeSize = GameConfig.MAZE_SIZE;
  const tileSize = GameConfig.TILE_SIZE;
  const spacing = GameConfig.SPACING;

  // milk 애니메이션 생성
  if (!scene.anims.exists('milkFloat')) {
    scene.anims.create({
      key: 'milkFloat',
      frames: [{ key: 'milk' }],
      frameRate: 1,
      repeat: -1
    });
  }

  for (let y = 0; y < mazeSize; y++) {
    for (let x = 0; x < mazeSize; x++) {
      const posX = x * tileSize * spacing;
      const posY = y * tileSize * spacing;

      const hasWall = walls.getChildren().some(wall =>
        Math.abs(wall.x - posX) < tileSize && Math.abs(wall.y - posY) < tileSize
      );

      if (!hasWall && Math.random() < 0.05 && !(x === 1 && y === 1)) {
        const milk = milks.create(posX, posY, 'milk');
        milk.setScale(0.05);
        milk.setDepth(y);

        scene.tweens.add({
          targets: milk,
          y: milk.y - 10,
          duration: 1500,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1
        });
      }
    }
  }

  // milk 충돌 처리를 여기서 직접 구현
  scene.physics.add.overlap(player, milks, (player, milk) => {
    if (!scene.gameOverStarted) {
      if (scene.soundManager) {
        scene.soundManager.playFishSound();
      }
      player.jumpCount++;
      // milk 카운트 업데이트
      scene.events.emit('collectMilk');
      scene.events.emit('updateJumpCount', player.jumpCount);
      milk.destroy();
    }
  });

  return milks;
};