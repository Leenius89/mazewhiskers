import Phaser from 'phaser'; // Import standard Phaser types
import { GameConfig } from './constants/GameConfig';

// Define return type interface
interface MazeData {
    walls: Phaser.Physics.Arcade.StaticGroup;
    fishes: Phaser.Physics.Arcade.Group;
    worldWidth: number;
    worldHeight: number;
    centerX: number;
    centerY: number;
    maze: number[][]; // Add maze grid to return type
}

export const createMaze = (scene: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite | Phaser.GameObjects.Sprite): MazeData => {
    const tileSize = GameConfig.TILE_SIZE;
    const mazeSize = GameConfig.MAZE_SIZE;
    const spacing = GameConfig.SPACING;

    // Initialize maze array - fill all cells with walls (1)
    let maze: number[][] = Array(mazeSize).fill(null).map(() => Array(mazeSize).fill(1));

    // Calculate center position
    const centerX = Math.floor(mazeSize / 2);
    const centerY = Math.floor(mazeSize / 2);

    // Clear center and surrounding area (set to 0)
    maze[centerY][centerX] = 0;
    maze[centerY - 1][centerX] = 0;
    maze[centerY + 1][centerX] = 0;
    maze[centerY][centerX - 1] = 0;
    maze[centerY][centerX + 1] = 0;

    // Clear start position and surrounding area
    maze[1][1] = 0;
    maze[1][2] = 0;
    maze[2][1] = 0;

    const carve = (x: number, y: number) => {
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
                const wall = walls.create(x * tileSize * spacing, y * tileSize * spacing, `building${buildingType}`) as Phaser.Physics.Arcade.Sprite;

                // Dynamic scale calculation based on image size (fit to tile size)
                const targetSize = tileSize * spacing;
                // const scaleX = (targetSize / wall.width) * 1.1; // Unused
                // const scaleY = (targetSize / wall.height) * 1.1; // Unused

                const scale = targetSize / wall.width * 1.05;

                wall.setScale(scale);
                wall.setOrigin(0.5, 0.5);
                wall.setDepth(y);

                const imageWidth = wall.width * scale;
                const imageHeight = wall.height * scale;
                wall.body!.setSize(imageWidth, imageHeight);
                wall.refreshBody();
            } else if (Math.random() < 0.1 && !(x === 1 && y === 1)) {
                const fish = fishes.create(x * tileSize * spacing, y * tileSize * spacing, 'fish1') as Phaser.Physics.Arcade.Sprite;
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

    return { walls, fishes, worldWidth, worldHeight, centerX, centerY, maze };
};

export const updatePlayerDepth = (player: Phaser.GameObjects.Sprite, mazeSize: number) => {
    player.setDepth(mazeSize);
};
