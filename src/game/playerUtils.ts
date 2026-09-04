import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';
import { setCircleBody } from './core/bodies';
import { sortDepth } from './core/depth';
import type { GameScene } from './scenes/GameScene';
import type { Player } from './objects/Player';

export const createMilkItems = (
    scene: GameScene,
    walls: Phaser.Physics.Arcade.StaticGroup,
    player: Player,
    rng: Phaser.Math.RandomDataGenerator
): Phaser.Physics.Arcade.Group => {
    const milks = scene.physics.add.group();
    const { MAZE_SIZE: mazeSize, TILE_SIZE: tileSize, SPACING: spacing } = GameConfig;
    const tileUnit = tileSize * spacing;

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
            const posX = x * tileUnit;
            const posY = y * tileUnit;

            // The maze grid answers this in O(1); walking every wall sprite was O(N).
            const hasWall = scene.maze
                ? scene.maze[y]?.[x] === 1
                : walls.getChildren().some((wall) => {
                      const sprite = wall as Phaser.Physics.Arcade.Sprite;
                      return Math.abs(sprite.x - posX) < tileSize && Math.abs(sprite.y - posY) < tileSize;
                  });

            const isStartTile = x === GameConfig.PLAYER.START_TILE.X && y === GameConfig.PLAYER.START_TILE.Y;
            if (hasWall || isStartTile || rng.frac() >= GameConfig.MILK.PROBABILITY) continue;

            const milk = milks.create(posX, posY, 'milk') as Phaser.Physics.Arcade.Sprite;
            milk.setScale(GameConfig.MILK.SCALE);
            milk.setDepth(sortDepth(posY + milk.displayHeight / 2));
            setCircleBody(milk, GameConfig.HITBOX.PICKUP_RADIUS);

            scene.tweens.add({
                targets: milk,
                y: milk.y - GameConfig.MILK.FLOAT_DISTANCE,
                duration: GameConfig.MILK.ANIM_DURATION,
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1
            });
        }
    }

    scene.physics.add.overlap(player, milks, (_p, m) => {
        if (scene.state.hasEnded()) return;

        // At the cap the bottle is left where it is rather than wasted, so a
        // full player can come back for it. Jumps still cannot be hoarded.
        if (player.jumpCount >= GameConfig.PLAYER.JUMP.MAX_STOCK) return;

        const milk = m as Phaser.Physics.Arcade.Sprite;

        // Milk shares the fish pickup sound by design.
        scene.soundManager?.playFishSound();

        player.jumpCount++;
        scene.bus.emit('jumpCountChanged', player.jumpCount);
        scene.events.emit('collectMilk');

        milk.destroy();
    });

    return milks;
};
