import Phaser from 'phaser';
import { isValidPosition } from './enemyPathfinding';

interface CustomScene extends Phaser.Scene {
    worldWidth: number;
    worldHeight: number;
    walls: Phaser.Physics.Arcade.StaticGroup;
}

interface CustomEnemy extends Phaser.Physics.Arcade.Sprite {
    isJumping?: boolean;
    wobble?: Phaser.Tweens.Tween | null;
}

// Internal helper for jump (duplicated logic/similar to pathfinding but specialized for wall jump?)
// In original js, performJump used properties startY which was not defined in scope.
// Assuming startY means enemy.y at start.
const performJump = (enemy: CustomEnemy, scene: CustomScene, angle: number) => {
    const jumpHeight = 150;
    const jumpDistance = 200;
    const jumpDuration = 600;

    const startY = enemy.y; // Fix missing reference
    const targetX = enemy.x + Math.cos(angle) * jumpDistance;
    const targetY = enemy.y + Math.sin(angle) * jumpDistance;

    // Shadow effect
    const shadow = scene.add.ellipse(enemy.x, enemy.y + 5, 40, 10, 0x000000, 0.3);

    // Vertical jump
    scene.tweens.add({
        targets: enemy,
        scaleY: 1.2,
        duration: jumpDuration / 2,
        ease: 'Quad.easeOut',
        yoyo: true
    });

    // Jump trajectory
    scene.tweens.add({
        targets: enemy,
        x: targetX,
        y: targetY,
        duration: jumpDuration,
        ease: 'Quad.inOut',
        onUpdate: (tween) => {
            // Parabolic movement
            const progress = tween.progress;
            const heightOffset = Math.sin(progress * Math.PI) * jumpHeight;
            enemy.y = Phaser.Math.Linear(startY, targetY, progress) - heightOffset;

            // Update shadow
            shadow.setPosition(enemy.x, enemy.y + 5);
            shadow.setAlpha(0.3 * (1 - Math.sin(progress * Math.PI) * 0.5));
        },
        onComplete: () => {
            // Landing effect
            scene.tweens.add({
                targets: enemy,
                scaleY: 0.85,
                duration: 100,
                ease: 'Bounce.easeOut',
                onComplete: () => {
                    scene.tweens.add({
                        targets: enemy,
                        scaleY: 1,
                        duration: 100,
                        ease: 'Quad.easeOut',
                        onComplete: () => {
                            enemy.isJumping = false;
                            shadow.destroy();
                        }
                    });
                }
            });

            // Landing sound (if exists)
            if (scene.sound.get('landSound')) {
                scene.sound.play('landSound', { volume: 0.2 });
            }
        }
    });
};

export const handleWallJump = (enemy: CustomEnemy, scene: CustomScene, player: Phaser.GameObjects.Sprite): boolean => {
    if (enemy.isJumping) return false;

    // Calculate straight distance to player
    const distanceToPlayer = Phaser.Math.Distance.Between(
        enemy.x, enemy.y,
        player.x, player.y
    );

    // Raycast for wall ahead
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
    const lookAheadDist = 80;
    const lookX = enemy.x + Math.cos(angle) * lookAheadDist;
    const lookY = enemy.y + Math.sin(angle) * lookAheadDist;

    // Check wall and distance (only jump if far enough)
    if (!isValidPosition(lookX, lookY, scene) && distanceToPlayer > 200) {
        enemy.isJumping = true;

        // Jump start sound (if exists)
        if (scene.sound.get('jumpSound')) {
            scene.sound.play('jumpSound', { volume: 0.3 });
        }

        // Jump preparation
        scene.tweens.add({
            targets: enemy,
            scaleY: 0.8,
            duration: 100,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // Actual jump
                performJump(enemy, scene, angle);
            }
        });

        return true;
    }
    return false;
};


export const updateEnemyAnimation = (enemy: CustomEnemy, movement: Phaser.Math.Vector2, scene: CustomScene) => {
    // Do not change animation during jump
    if (enemy.isJumping) return;

    if (Math.abs(movement.x) > 0.1 || Math.abs(movement.y) > 0.1) {
        // Moving
        enemy.anims.play('enemyWalk', true);

        // Flip based on direction
        if (movement.x < 0) {
            enemy.setFlipX(true);
        } else if (movement.x > 0) {
            enemy.setFlipX(false);
        }

        // Wobble effect while moving
        if (!enemy.isJumping && !enemy.wobble && scene) {
            enemy.wobble = scene.tweens.add({
                targets: enemy,
                y: enemy.y + 2,
                duration: 200,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    } else {
        // Idle
        enemy.anims.play('enemyIdle', true);
        if (enemy.wobble) {
            if (enemy.wobble.isPlaying()) enemy.wobble.stop();
            enemy.wobble = null;
        }
    }
};
