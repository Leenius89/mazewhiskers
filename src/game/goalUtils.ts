import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';
import { setCircleBody } from './core/bodies';
import { DEPTH, sortDepth } from './core/depth';
import type { GameScene } from './scenes/GameScene';

/**
 * Pixelated wipe to black, spreading outward from the centre of the screen.
 * Resolves once the screen is fully covered.
 */
const create8BitTransition = (scene: Phaser.Scene): Promise<void> => {
    return new Promise((resolve) => {
        const { width, height } = scene.cameras.main;
        const { PIXEL_SIZE: pixelSize, STEPS: steps, STEP_DELAY: stepDelay } = GameConfig.GOAL.TRANSITION;

        const graphics = scene.add.graphics();
        graphics.setScrollFactor(0);
        graphics.setDepth(DEPTH.OVERLAY + 1);

        const centerX = width / 2;
        const centerY = height / 2;
        const cols = Math.ceil(width / pixelSize);
        const rows = Math.ceil(height / pixelSize);

        const pixels: { x: number; y: number; distance: number }[] = [];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                pixels.push({
                    x,
                    y,
                    distance: Math.hypot(x * pixelSize - centerX, y * pixelSize - centerY)
                });
            }
        }
        pixels.sort((a, b) => a.distance - b.distance);

        const pixelsPerStep = Math.ceil(pixels.length / steps);
        let currentStep = 0;

        const drawStep = () => {
            if (currentStep >= steps) {
                resolve();
                return;
            }

            graphics.clear();
            graphics.fillStyle(0x000000, 1);

            const endIdx = Math.min((currentStep + 1) * pixelsPerStep, pixels.length);
            for (let i = 0; i < endIdx; i++) {
                graphics.fillRect(pixels[i].x * pixelSize, pixels[i].y * pixelSize, pixelSize, pixelSize);
            }

            currentStep++;
            scene.time.delayedCall(stepDelay, drawStep);
        };

        drawStep();
    });
};

/**
 * Hands control straight over.
 *
 * There used to be a fly-over here that held on the player, flew to the goal
 * and came back. The tutorial's second beat does exactly that and then
 * explains what the player is looking at, so the fly-over was the same trip
 * twice — the first one silent and unexplained.
 */
const beginPlayImmediately = (scene: GameScene, player: Phaser.Physics.Arcade.Sprite) => {
    scene.cameras.main.startFollow(player);
    scene.time.delayedCall(GameConfig.GOAL.INTRO.START_DELAY, () => scene.events.emit('introComplete'));
};

export const createGoal = (
    scene: GameScene,
    player: Phaser.Physics.Arcade.Sprite,
    centerX: number,
    centerY: number
): Phaser.Physics.Arcade.Sprite => {
    const goal = scene.physics.add.sprite(centerX, centerY, 'goal');
    goal.setScale(GameConfig.GOAL.SCALE);
    goal.setDepth(sortDepth(centerY + goal.displayHeight / 2));

    // Generous on purpose — arriving home must never feel like a pixel hunt.
    setCircleBody(goal, GameConfig.HITBOX.GOAL_RADIUS);

    beginPlayImmediately(scene, player);

    scene.physics.add.overlap(player, goal, async () => {
        // Reaching home means different things depending on where you are in
        // the run. The state machine rejects a second transition either way,
        // which is what replaces the ad-hoc flag this used to carry.
        const finishing = scene.isFinalDistrict;
        if (!scene.state.transitionTo(finishing ? 'victory' : 'clearing')) return;

        scene.physics.pause();
        player.setVelocity(0, 0);

        scene.apartmentSystem?.destroy();

        if (scene.enemy) {
            scene.enemy.setVelocity(0, 0);
            if (scene.enemy.enemySound) {
                scene.soundManager?.stopEnemySound(scene.enemy.enemySound);
            }
        }

        scene.time.removeAllEvents();

        try {
            if (scene.soundManager) {
                scene.soundManager.stopAllSounds();
                scene.sound.removeAllListeners();
            }

            await create8BitTransition(scene);

            // Another district to go: keep the totals and rebuild the city.
            if (!finishing) {
                scene.advanceDistrict();
                return;
            }

            // Every enemy track is stopped first, so the win lands on the main
            // theme rather than on top of the chase music.
            scene.enemies.forEach((enemy) => {
                if (enemy.enemySound) scene.soundManager?.stopEnemySound(enemy.enemySound);
            });
            scene.soundManager?.playMainBGM();

            scene.time.delayedCall(GameConfig.GOAL.VICTORY_DELAY, () => {
                const carried = scene.registry.get('carriedMs') || 0;
                scene.scene.launch('VictoryScene', {
                    timeMs: carried + (Date.now() - scene.startTime),
                    milkCount: scene.registry.get('milkCount') || 0,
                    fishCount: scene.registry.get('fishCount') || 0,
                    healthLeft: Math.max(0, Math.round(scene.health))
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
