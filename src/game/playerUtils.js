import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';

export const createMilkItems = (scene, walls, player) => {
  const milks = scene.physics.add.group();
  const mazeSize = GameConfig.MAZE_SIZE;
  const tileSize = GameConfig.TILE_SIZE;
  const spacing = GameConfig.SPACING;

  // Milk animation
  if (!scene.anims.exists('milkFloat')) {
    scene.anims.create({
      key: 'milkFloat',
      frames: [{ key: 'milk' }],
      frameRate: 1,
      repeat: -1
    });
  }

  // Use maze grid for fast wall check instead of iterating all wall sprites
  const tileUnit = tileSize * spacing;

  for (let y = 0; y < mazeSize; y++) {
    for (let x = 0; x < mazeSize; x++) {
      const posX = x * tileUnit;
      const posY = y * tileUnit;

      // Check maze grid (O(1)) instead of iterating walls (O(N))
      let hasWall = false;
      if (scene.maze) {
        hasWall = scene.maze[y] && scene.maze[y][x] === 1;
      } else {
        hasWall = walls.getChildren().some(wall =>
          Math.abs(wall.x - posX) < tileSize && Math.abs(wall.y - posY) < tileSize
        );
      }

      if (!hasWall && Math.random() < GameConfig.MILK.PROBABILITY && !(x === 1 && y === 1)) {
        const milk = milks.create(posX, posY, 'milk');
        milk.setScale(GameConfig.MILK.SCALE);
        milk.setDepth(y);

        scene.tweens.add({
          targets: milk,
          y: milk.y - 10,
          duration: GameConfig.MILK.ANIM_DURATION,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1
        });
      }
    }
  }

  // Milk collision: +1 jump per milk
  scene.physics.add.overlap(player, milks, (player, milk) => {
    if (scene.gameOverStarted) return;

    // Sound
    if (scene.soundManager) {
      scene.soundManager.playFishSound();
    }

    // +1 jump
    player.jumpCount++;

    // Emit events to update React UI
    scene.game.events.emit('updateJumpCount', player.jumpCount);
    scene.events.emit('collectMilk');

    milk.destroy();
  });

  return milks;
};