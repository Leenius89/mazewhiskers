import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';
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

/**
 * Opens a share of the dead ends into loops.
 *
 * A perfect maze is a tree: every chase ends against a wall. Braiding adds
 * cycles, which is what makes it possible to break line of sight and come
 * back around — the counterplay the enemy redesign depends on.
 */
const braid = (maze: number[][], mazeSize: number, rng: Phaser.Math.RandomDataGenerator): void => {
    const neighbours = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0]
    ];

    for (let y = 1; y < mazeSize - 1; y += 2) {
        for (let x = 1; x < mazeSize - 1; x += 2) {
            if (maze[y][x] !== 0) continue;

            const open = neighbours.filter(([dx, dy]) => maze[y + dy]?.[x + dx] === 0);
            if (open.length !== 1) continue;
            if (rng.frac() >= GameConfig.MAZE.BRAID_CHANCE) continue;

            // Knock through a wall that leads somewhere new, never off the edge.
            const walls = neighbours.filter(
                ([dx, dy]) =>
                    maze[y + dy]?.[x + dx] === 1 &&
                    maze[y + dy * 2]?.[x + dx * 2] !== undefined
            );
            if (walls.length === 0) continue;

            const [dx, dy] = walls[rng.integerInRange(0, walls.length - 1)];
            maze[y + dy][x + dx] = 0;
            maze[y + dy * 2][x + dx * 2] = 0;
        }
    }
};

/**
 * A handful of open squares.
 *
 * They read as somewhere to breathe and carry more to pick up, but they cost
 * the cover the alleys give — the terrain itself becomes a risk decision.
 */
const carvePlazas = (maze: number[][], mazeSize: number, rng: Phaser.Math.RandomDataGenerator): void => {
    const radius = GameConfig.MAZE.PLAZA_RADIUS;
    const margin = radius + 3;

    for (let i = 0; i < GameConfig.MAZE.PLAZAS; i++) {
        const cx = rng.integerInRange(margin, mazeSize - 1 - margin);
        const cy = rng.integerInRange(margin, mazeSize - 1 - margin);

        for (let y = cy - radius; y <= cy + radius; y++) {
            for (let x = cx - radius; x <= cx + radius; x++) {
                if (maze[y]?.[x] !== undefined) maze[y][x] = 0;
            }
        }
    }
};

export const createMaze = (scene: GameScene, player: Phaser.Physics.Arcade.Sprite): MazeData => {
    const { TILE_SIZE: tileSize, MAZE_SIZE: mazeSize, SPACING: spacing } = GameConfig;
    const tileUnit = tileSize * spacing;

    // Districts past the first must not reuse the same maze, so the district
    // number is folded into the seed.
    const seed = resolveSeed(scene.mode);
    const districtSeed = seed ? `${seed}#${scene.district}` : null;
    const rng = new Phaser.Math.RandomDataGenerator(districtSeed ? [districtSeed] : undefined);

    const maze: number[][] = Array(mazeSize)
        .fill(null)
        .map(() => Array(mazeSize).fill(1));

    const centerX = Math.floor(mazeSize / 2);
    const centerY = Math.floor(mazeSize / 2);

    // Clear the goal chamber.
    maze[centerY][centerX] = 0;
    maze[centerY - 1][centerX] = 0;
    maze[centerY + 1][centerX] = 0;
    maze[centerY][centerX - 1] = 0;
    maze[centerY][centerX + 1] = 0;

    // Clear the start pocket.
    const start = GameConfig.PLAYER.START_TILE;
    maze[start.Y][start.X] = 0;
    maze[start.Y][start.X + 1] = 0;
    maze[start.Y + 1][start.X] = 0;

    // Depth-first carve. Produces a perfect maze — no loops, many dead ends.
    // Phase 4 braids this so the player has somewhere to run.
    const carve = (x: number, y: number) => {
        const directions = [
            [0, -1],
            [1, 0],
            [0, 1],
            [-1, 0]
        ];
        directions.sort(() => rng.frac() - 0.5);

        for (const [dx, dy] of directions) {
            const nx = x + dx * 2;
            const ny = y + dy * 2;
            if (nx >= 0 && nx < mazeSize && ny >= 0 && ny < mazeSize && maze[ny][nx] === 1) {
                maze[y + dy][x + dx] = 0;
                maze[ny][nx] = 0;
                carve(nx, ny);
            }
        }
    };

    carve(start.X, start.Y);
    braid(maze, mazeSize, rng);
    carvePlazas(maze, mazeSize, rng);

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

