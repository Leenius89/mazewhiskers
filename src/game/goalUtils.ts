import Phaser from 'phaser';
// @ts-ignore
import { VictoryScene } from './victory/victoryUtils';

interface CustomScene extends Phaser.Scene {
    apartmentSystem?: any;
    enemy?: any;
    soundManager?: any;
    walls?: Phaser.Physics.Arcade.StaticGroup;
    gameOverStarted?: boolean;
}

const create8BitTransition = (scene: Phaser.Scene, player: Phaser.GameObjects.Sprite): Promise<void> => {
    return new Promise((resolve) => {
        const { width, height } = scene.cameras.main;
        const graphics = scene.add.graphics();
        graphics.setScrollFactor(0);  // Fix to camera
        graphics.setDepth(9999);

        // Calculate center of screen
        const centerX = width / 2;
        const centerY = height / 2;

        // Create 8x8 pixel grid
        const pixelSize = 32;
        const cols = Math.ceil(width / pixelSize);
        const rows = Math.ceil(height / pixelSize);

        // Calculate distance from center for each pixel
        const pixels: { x: number; y: number; distance: number }[] = [];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const distance = Math.sqrt(
                    Math.pow(x * pixelSize - centerX, 2) +
                    Math.pow(y * pixelSize - centerY, 2)
                );
                pixels.push({ x, y, distance });
            }
        }

        // Sort by distance (closest first)
        pixels.sort((a, b) => a.distance - b.distance);

        const darkSteps = 8;
        let currentStep = 0;

        const updateDarkness = () => {
            if (currentStep >= darkSteps) {
                resolve();
                return;
            }

            graphics.clear();  // Clear previous graphics
            const pixelsThisStep = Math.ceil(pixels.length / darkSteps);
            const endIdx = Math.min((currentStep + 1) * pixelsThisStep, pixels.length);

            for (let i = 0; i < endIdx; i++) {
                const pixel = pixels[i];
                graphics.fillStyle(0x000000, 1);
                graphics.fillRect(
                    pixel.x * pixelSize,
                    pixel.y * pixelSize,
                    pixelSize,
                    pixelSize
                );
            }

            currentStep++;
            scene.time.delayedCall(200, updateDarkness);
        };

        updateDarkness();
    });
};

export const createGoal = (scene: CustomScene, player: Phaser.Physics.Arcade.Sprite, centerX: number, centerY: number): Phaser.Physics.Arcade.Sprite => {
    const goal = scene.physics.add.sprite(centerX, centerY, 'goal');
    goal.setScale(0.1);

    const hitboxScale = 1.5;
    const hitboxSize = goal.width * goal.scale * hitboxScale;
    if (goal.body) {
        goal.body.setCircle(hitboxSize / 2);
        goal.body.setOffset(goal.width / 2 - hitboxSize / 2, goal.height / 2 - hitboxSize / 2);
    }

    // Start Intro Camera Sequence
    scene.cameras.main.startFollow(player); // Follow player initially

    // Move to goal after 2 seconds
    scene.time.delayedCall(2000, () => {
        scene.cameras.main.stopFollow();
        scene.cameras.main.pan(
            centerX,
            centerY,
            800, // Pan to goal 0.8s
            'Power1', // Smoother easing
            false,
            (_camera, _progress) => {  // Callback signature might differ based on Phaser version, usage usually (camera, progress) or just () depending on 3.60+
                if (_progress === 1) { // checking completion manually if callback is onUpdate, but usually this is onComplete? pan(x,y,duration,ease,force,callback)
                    // Check Phaser docs: pan(x, y, [duration], [ease], [force], [callback], [context])
                    // The callback is onComplete.

                    // Wait 1 second at goal
                    scene.time.delayedCall(1000, () => {
                        scene.cameras.main.pan(
                            player.x,
                            player.y,
                            600, // Return trip 0.6s (very fast)
                            'Power1',
                            false,
                            (_cam, _prog) => {
                                if (_prog === 1) {
                                    scene.cameras.main.startFollow(player);
                                    scene.events.emit('introComplete');
                                }
                            }
                        );
                    });
                }
            }
        );
    });

    let isVictoryHandled = false;

    scene.physics.add.overlap(player, goal, async () => {
        if (isVictoryHandled) return;
        isVictoryHandled = true;

        // Stop all systems immediately
        scene.physics.pause();
        player.setVelocity(0, 0);

        // Cleanup Apartment System
        if (scene.apartmentSystem) {
            scene.apartmentSystem.destroy(); // destroy call
        }

        // Stop and cleanup Enemy
        if (scene.enemy) {
            scene.enemy.setVelocity(0, 0);
            if (scene.enemy.enemySound && scene.soundManager) {
                scene.soundManager.stopEnemySound(scene.enemy.enemySound);
            }
        }

        // Clear all scene timers
        scene.time.removeAllEvents();

        try {
            if (scene.soundManager) {
                // Stop all sounds immediately
                scene.soundManager.stopAllSounds();
                scene.sound.removeAllListeners();
            }

            // Screen Transition Effect
            await create8BitTransition(scene, player);

            // Restart specific BGM
            // Restart specific BGM
            if (scene.soundManager) {
                scene.soundManager.playMainBGM();
            }

            // Emit Victory Event with Time
            scene.time.delayedCall(500, () => {
                const endTime = Date.now();
                const startTime = (scene as any).startTime || 0;
                const timeTaken = endTime - startTime;

                // Launch Phaser VictoryScene first for the sequence
                scene.scene.launch('VictoryScene', {
                    timeMs: timeTaken,
                    milkCount: scene.registry.get('milkCount') || 0,
                    fishCount: scene.registry.get('fishCount') || 0
                });

                scene.scene.pause();
            });

        } catch (error) {
            console.error('Transition failed:', error);
        }
    });

    if (scene.walls) {
        scene.physics.add.collider(goal, scene.walls);
    }

    return goal;
};
