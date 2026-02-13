import Phaser from 'phaser';
import { isValidPosition } from './enemyPathfinding';

interface CustomScene extends Phaser.Scene {
    walls: Phaser.Physics.Arcade.StaticGroup;
    worldWidth: number;
    worldHeight: number;
    soundManager?: any;
}

interface PathFinderState {
    path: any[]; // define path node type if possible, or any for now
    currentNode: number;
    lastPathFinding: number;
}

interface CustomEnemy extends Phaser.Physics.Arcade.Sprite {
    behaviorType?: number;
    isJumping?: boolean;
    active: boolean;
    pathFinder?: PathFinderState;
    enemySound?: Phaser.Sound.BaseSound | null;
}

export const createEnemyAnimations = (scene: Phaser.Scene) => {
    if (!scene.anims.exists('enemyWalk')) {
        scene.anims.create({
            key: 'enemyWalk',
            frames: [
                { key: 'enemy1' },
                { key: 'enemy2' }
            ],
            frameRate: 8,
            repeat: -1
        });
    }

    if (!scene.anims.exists('enemyIdle')) {
        scene.anims.create({
            key: 'enemyIdle',
            frames: [{ key: 'enemy1' }],
            frameRate: 1,
            repeat: 0
        });
    }
};

const setupEnemyPhysics = (enemy: Phaser.Physics.Arcade.Sprite, scale: number) => {
    enemy.setScale(scale);
    enemy.setOrigin(0.5, 0.5);
    enemy.setDepth(10000);

    const imageWidth = enemy.width * scale;
    const imageHeight = enemy.height * scale;
    if (enemy.body) {
        enemy.body.setSize(imageWidth, imageHeight);
        enemy.body.setOffset((enemy.width - imageWidth) / 2, (enemy.height - imageHeight) / 2);
    }
};

const executeCutscene = (scene: CustomScene, enemy: CustomEnemy, player: Phaser.GameObjects.Sprite) => {
    scene.cameras.main.pan(enemy.x, enemy.y, 1000, 'Power2', true, (_camera, progress) => {
        if (progress === 1) {
            scene.time.delayedCall(3500, () => {
                scene.cameras.main.pan(player.x, player.y, 1000, 'Power2', true, (_cam, prog) => {
                    if (prog === 1) {
                        enemy.active = true; // Now safe to activate
                        if (scene.cameras.main) scene.cameras.main.startFollow(player);

                        // Fade out main BGM
                        if (scene.soundManager) {
                            scene.soundManager.stopMainBGM();
                            // Start enemy sound
                            enemy.enemySound = scene.soundManager.playEnemySound();
                        }
                    }
                });
            });
        }
    });
};

export const createEnemy = (scene: CustomScene, player: Phaser.Physics.Arcade.Sprite, worldWidth: number, worldHeight: number): CustomEnemy => {
    const enemyScale = 0.08;
    const minSpawnDistance = 800;

    // Decide spawn position
    let enemyX, enemyY;
    let distance;
    do {
        enemyX = Phaser.Math.Between(100, worldWidth - 100);
        enemyY = Phaser.Math.Between(100, worldHeight - 100);
        distance = Phaser.Math.Distance.Between(enemyX, enemyY, player.x, player.y);
    } while (distance < minSpawnDistance || !isValidPosition(enemyX, enemyY, scene));

    // Create enemy sprite
    const newEnemy = scene.physics.add.sprite(enemyX, enemyY, 'enemy1') as CustomEnemy;
    setupEnemyPhysics(newEnemy, enemyScale);

    // Setup behavior and state
    newEnemy.behaviorType = Phaser.Math.Between(0, 1);
    newEnemy.isJumping = false;
    newEnemy.active = false; // Initially inactive until cutscene ends

    // Collision with walls
    scene.physics.add.collider(newEnemy, scene.walls);

    // Pathfinding state
    newEnemy.pathFinder = {
        path: [],
        currentNode: 0,
        lastPathFinding: 0
    };

    // Run cutscene // Check if we should wait or run immediately. Logic says run immediately on spawn.
    executeCutscene(scene, newEnemy, player);

    return newEnemy;
};
