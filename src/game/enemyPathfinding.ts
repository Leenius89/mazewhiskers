import Phaser from 'phaser';

interface CustomScene extends Phaser.Scene {
    worldWidth: number;
    worldHeight: number;
    walls: Phaser.Physics.Arcade.StaticGroup;
}

interface CustomEnemy extends Phaser.Physics.Arcade.Sprite {
    isJumping?: boolean;
}

export const isValidPosition = (x: number, y: number, scene: CustomScene, allowClose: boolean = false): boolean => {
    if (x < 0 || x >= scene.worldWidth || y < 0 || y >= scene.worldHeight) {
        return false;
    }

    const hitbox = new Phaser.Geom.Rectangle(x - 16, y - 16, 32, 32);
    const bodies = scene.walls.getChildren() as Phaser.Physics.Arcade.Sprite[];

    for (let wall of bodies) {
        const wallBounds = wall.getBounds();
        if (Phaser.Geom.Rectangle.Overlaps(hitbox, wallBounds)) {
            return false;
        }
    }

    return true;
};

// Detect wall ahead
const detectWallAhead = (enemy: CustomEnemy, targetX: number, targetY: number, scene: CustomScene): boolean => {
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, targetX, targetY);
    const distance = 50; // Detection distance
    const lookX = enemy.x + Math.cos(angle) * distance;
    const lookY = enemy.y + Math.sin(angle) * distance;

    return !isValidPosition(lookX, lookY, scene);
};

// Perform jump action
const performJump = (enemy: CustomEnemy, targetX: number, targetY: number, scene: CustomScene): boolean => {
    const jumpDuration = 500;
    const jumpHeight = 100;

    // Save start position
    const startX = enemy.x;
    const startY = enemy.y;

    // Calculate jump target (further in current direction)
    const angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);
    const jumpDistance = 150;
    const endX = startX + Math.cos(angle) * jumpDistance;
    const endY = startY + Math.sin(angle) * jumpDistance;

    // Shadow effect
    const shadow = scene.add.ellipse(enemy.x, enemy.y + 5, 40, 10, 0x000000, 0.3);

    // Jump start squash effect
    scene.tweens.add({
        targets: enemy,
        scaleY: 0.8,
        duration: 100,
        ease: 'Quad.easeOut',
        onComplete: () => {
            // Actual jump motion
            scene.tweens.add({
                targets: enemy,
                scaleY: 1.2,
                duration: jumpDuration / 2,
                ease: 'Quad.easeOut',
                yoyo: true
            });

            scene.tweens.add({
                targets: enemy,
                x: endX,
                y: endY,
                duration: jumpDuration,
                ease: 'Quad.inOut',
                onUpdate: (tween) => {
                    const progress = tween.progress;
                    const heightOffset = Math.sin(progress * Math.PI) * jumpHeight;
                    enemy.y = Phaser.Math.Linear(startY, endY, progress) - heightOffset;

                    // Update shadow
                    shadow.setPosition(enemy.x, enemy.y + 5);
                    shadow.setAlpha(0.3 * (1 - Math.sin(progress * Math.PI) * 0.5));
                },
                onComplete: () => {
                    // Landing effect
                    scene.tweens.add({
                        targets: enemy,
                        scaleY: 0.7,
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
                }
            });
        }
    });

    return true;
};

export const moveTowardsPlayer = (enemy: CustomEnemy, player: Phaser.GameObjects.Sprite | Phaser.Types.Physics.Arcade.GameObjectWithBody, scene: CustomScene) => {
    if (enemy.isJumping) return;

    // Cast player to Sprite to access x, y safely
    const target = player as Phaser.GameObjects.Sprite;

    // Calculate angle to player
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);

    // Check for wall ahead
    if (detectWallAhead(enemy, target.x, target.y, scene)) {
        enemy.isJumping = true;
        performJump(enemy, target.x, target.y, scene);
        return;
    }

    // Normal movement
    const speed = 120;
    const velocityX = Math.cos(angle) * speed;
    const velocityY = Math.sin(angle) * speed;

    enemy.setVelocity(velocityX, velocityY);

    // Set sprite flip based on direction
    if (velocityX < 0) {
        enemy.setFlipX(true);
    } else if (velocityX > 0) {
        enemy.setFlipX(false);
    }

    // Walk animation
    if (!enemy.isJumping) {
        enemy.anims.play('enemyWalk', true);
    }
};
