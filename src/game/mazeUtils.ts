import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';
import { mazeSize as currentMazeSize } from './core/grid';
import { generateCity } from './core/mazeGrid';
import { setCircleBody, setStaticFootBody } from './core/bodies';
import { sortDepth } from './core/depth';
import { resolveSeed } from './core/modes';
import type { GameScene } from './scenes/GameScene';

interface MazeData {
    walls: Phaser.Physics.Arcade.StaticGroup;
    fishes: Phaser.Physics.Arcade.Group;
    worldWidth: number;
    worldHeight: number;
    centerX: number;
    centerY: number;
    /** Grid of 1 (wall) and 0 (open), indexed [y][x]. */
    maze: number[][];
    /** Seeded generator, shared so every placement in a run is reproducible. */
    rng: Phaser.Math.RandomDataGenerator;
}

export const createMaze = (scene: GameScene, player: Phaser.Physics.Arcade.Sprite): MazeData => {
    const { TILE_SIZE: tileSize, SPACING: spacing } = GameConfig;
    const mazeSize = currentMazeSize();
    const tileUnit = tileSize * spacing;

    // Districts past the first must not reuse the same maze, so the district
    // number is folded into the seed.
    const seed = resolveSeed(scene.mode);
    const districtSeed = seed ? `${seed}#${scene.district}` : null;
    const rng = new Phaser.Math.RandomDataGenerator(districtSeed ? [districtSeed] : undefined);

    const centerX = Math.floor(mazeSize / 2);
    const centerY = Math.floor(mazeSize / 2);

    // Carved, braided and checked for a way home before anything stands on
    // it. See core/mazeGrid for what is promised and how it is tested.
    const { maze } = generateCity(mazeSize, rng);

    const walls = scene.physics.add.staticGroup();
    const fishes = scene.physics.add.group();

    const worldWidth = mazeSize * tileUnit;
    const worldHeight = mazeSize * tileUnit;

    scene.physics.world.setBounds(0, 0, worldWidth, worldHeight);

    if (!scene.anims.exists('fishSwim')) {
        scene.anims.create({
            key: 'fishSwim',
            frames: [{ key: 'fish1' }, { key: 'fish2' }],
            frameRate: GameConfig.FISH.FRAME_RATE,
            repeat: -1
        });
    }

    return buildWorld(scene, player, { maze, walls, fishes, worldWidth, worldHeight, centerX, centerY, rng });
};

/** Everything that stands on a finished grid: buildings, fish, the world box. */
const buildWorld = (
    scene: GameScene,
    player: Phaser.Physics.Arcade.Sprite,
    {
        maze,
        walls,
        fishes,
        worldWidth,
        worldHeight,
        centerX,
        centerY,
        rng
    }: {
        maze: number[][];
        walls: Phaser.Physics.Arcade.StaticGroup;
        fishes: Phaser.Physics.Arcade.Group;
        worldWidth: number;
        worldHeight: number;
        centerX: number;
        centerY: number;
        rng: Phaser.Math.RandomDataGenerator;
    }
): MazeData => {
    const { TILE_SIZE: tileSize, SPACING: spacing } = GameConfig;
    const mazeSize = currentMazeSize();
    const tileUnit = tileSize * spacing;
    const start = GameConfig.PLAYER.START_TILE;

    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            const posX = x * tileUnit;
            const posY = y * tileUnit;

            if (maze[y][x] === 1) {
                const buildingType = rng.integerInRange(1, 3);

                // Anchored to the back edge of its tile and stretched upward,
                // so it stands on the grid instead of tiling it.
                const baseY = posY + tileUnit / 2;
                const wall = walls.create(posX, baseY, `building${buildingType}`) as Phaser.Physics.Arcade.Sprite;

                wall.setOrigin(0.5, 1);
                const scale = (tileUnit / wall.width) * GameConfig.WALL_OVERLAP;
                const height = rng.realInRange(
                    GameConfig.BUILDING_HEIGHT.MIN,
                    GameConfig.BUILDING_HEIGHT.MAX
                );
                wall.setScale(scale, scale * height);

                // The footprint stays exactly one tile however tall it is.
                setStaticFootBody(wall, {
                    width: GameConfig.HITBOX.WALL.WIDTH,
                    height: GameConfig.HITBOX.WALL.HEIGHT
                });

                wall.setDepth(sortDepth(baseY));
                scene.occluders.set(`${x},${y}`, wall);
                continue;
            }

            const isStartTile = x === start.X && y === start.Y;
            if (isStartTile || rng.frac() >= GameConfig.FISH.PROBABILITY) continue;

            const fish = fishes.create(posX, posY, 'fish1') as Phaser.Physics.Arcade.Sprite;
            fish.setScale(GameConfig.FISH.SCALE);
            fish.setDepth(sortDepth(posY + fish.displayHeight / 2));
            fish.play('fishSwim');

            // Pickups are far more generous than they look: nobody should feel
            // they walked straight through a fish.
            setCircleBody(fish, GameConfig.HITBOX.PICKUP_RADIUS);

            scene.tweens.add({
                targets: fish,
                y: fish.y - GameConfig.FISH.FLOAT_DISTANCE,
                duration: GameConfig.FISH.ANIM_DURATION,
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1
            });
        }
    }

    // Fish overlap is registered by setupHealthSystem.
    scene.physics.add.collider(player, walls);

    return { walls, fishes, worldWidth, worldHeight, centerX, centerY, maze, rng };
};

