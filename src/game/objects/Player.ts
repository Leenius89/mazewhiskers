import Phaser from 'phaser';

import { GameConfig } from '../constants/GameConfig';

interface Cursors {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
}

interface CustomScene extends Phaser.Scene {
    goal?: Phaser.Physics.Arcade.Sprite;
    soundManager?: any; // To be typed
}

export class Player extends Phaser.Physics.Arcade.Sprite {
    public jumpCount: number;
    public isJumping: boolean;
    public lastDirection: string;
    private speed: number;
    private goalIndicator: Phaser.GameObjects.Graphics;

    // Override scene property with custom interface
    public scene: CustomScene;

    constructor(scene: CustomScene, x: number, y: number) {
        super(scene, x, y, 'cat1');
        this.scene = scene;

        // Add to scene
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Initialize properties - Default values to avoid 'undefined' before initProperties
        this.jumpCount = 0;
        this.isJumping = false;
        this.lastDirection = 'right';
        this.speed = GameConfig.PLAYER.SPEED;
        this.goalIndicator = this.scene.add.graphics(); // Initialize here or in initProperties

        this.initProperties();
        this.initPhysics();
        this.createAnimations();
    }

    initProperties() {
        this.setScale(GameConfig.PLAYER.SCALE);
        this.setDepth(10);
        this.jumpCount = 0;
        this.isJumping = false;
        this.lastDirection = 'right';
        this.speed = GameConfig.PLAYER.SPEED;

        // Goal Indicator arrow
        this.goalIndicator.setDepth(100);
    }

    initPhysics() {
        this.setCollideWorldBounds(true);

        const imageWidth = this.width * this.scaleX;
        const imageHeight = this.height * this.scaleY;
        this.body!.setSize(imageWidth, imageHeight);
        this.body!.setOffset((this.width - imageWidth) / 2, (this.height - imageHeight) / 2);
    }

    createAnimations() {
        if (!this.scene.anims.exists('walk')) {
            this.scene.anims.create({
                key: 'walk',
                frames: [
                    { key: 'cat1' },
                    { key: 'cat2' }
                ],
                frameRate: 8,
                repeat: -1
            });
        }

        if (!this.scene.anims.exists('idle')) {
            this.scene.anims.create({
                key: 'idle',
                frames: [{ key: 'cat1' }],
                frameRate: -1, // Wait, repeat -1? idle usually loops or just stays. original code had repeat -1
            });
        }
    }

    // Explicitly type cursors
    update(cursors?: Phaser.Types.Input.Keyboard.CursorKeys) {
        // Always update goal indicator
        this.updateGoalIndicator();

        if (this.isJumping) return;

        if (cursors) {
            this.handleMovement(cursors);
        }
        this.updateDepth();
    }

    handleMovement(cursors: Phaser.Types.Input.Keyboard.CursorKeys) {
        let isMoving = false;
        this.setVelocity(0);

        if (cursors.left.isDown) {
            this.setVelocityX(-this.speed);
            this.lastDirection = 'left';
            isMoving = true;
        } else if (cursors.right.isDown) {
            this.setVelocityX(this.speed);
            this.lastDirection = 'right';
            isMoving = true;
        }

        if (cursors.up.isDown) {
            this.setVelocityY(-this.speed);
            isMoving = true;
        } else if (cursors.down.isDown) {
            this.setVelocityY(this.speed);
            isMoving = true;
        }

        if (isMoving) {
            this.body!.velocity.normalize().scale(this.speed);
            this.anims.play('walk', true);
        } else {
            this.anims.stop();
            this.setTexture('cat1');
        }

        // Flip direction
        if (this.body!.velocity.x < 0) {
            this.setFlipX(true);
        } else if (this.body!.velocity.x > 0) {
            this.setFlipX(false);
        }
    }

    updateDepth() {
        this.setDepth(this.y);
    }

    updateGoalIndicator() {
        if (!this.scene.goal || !this.goalIndicator) return;

        this.goalIndicator.clear();

        const goal = this.scene.goal;
        const angle = Phaser.Math.Angle.Between(this.x, this.y, goal.x, goal.y);
        const dist = 60; // Distance from player center

        const arrowX = this.x + Math.cos(angle) * dist;
        const arrowY = this.y + Math.sin(angle) * dist;

        // Yellow arrow triangle
        this.goalIndicator.fillStyle(0xffff00, 0.9);
        this.goalIndicator.lineStyle(2, 0x000000, 0.8);

        const size = 12;
        // Tip of arrow
        const p1x = arrowX + Math.cos(angle) * size;
        const p1y = arrowY + Math.sin(angle) * size;
        // Back corners (120 degrees apart)
        const p2x = arrowX + Math.cos(angle + 2.5) * size;
        const p2y = arrowY + Math.sin(angle + 2.5) * size;
        const p3x = arrowX + Math.cos(angle - 2.5) * size;
        const p3y = arrowY + Math.sin(angle - 2.5) * size;

        this.goalIndicator.beginPath();
        this.goalIndicator.moveTo(p1x, p1y);
        this.goalIndicator.lineTo(p2x, p2y);
        this.goalIndicator.lineTo(p3x, p3y);
        this.goalIndicator.closePath();
        this.goalIndicator.fill();
        this.goalIndicator.strokePath();
    }

    jump(): boolean {
        console.log(`Jump Requested. Jumping: ${this.isJumping}, Count: ${this.jumpCount}`);
        if (this.isJumping || this.jumpCount <= 0) return false;
        return this.performJump();
    }

    performJump(): boolean {
        this.jumpCount--;
        this.scene.game.events.emit('updateJumpCount', this.jumpCount);

        if (this.scene.soundManager) {
            this.scene.soundManager.playJumpSound();
        }

        this.isJumping = true;
        const angle = this.lastDirection === 'left' ? Math.PI : 0;
        const jumpDistance = GameConfig.PLAYER.JUMP.DISTANCE;
        const jumpHeight = GameConfig.PLAYER.JUMP.HEIGHT;
        const jumpDuration = GameConfig.PLAYER.JUMP.DURATION;

        const startY = this.y;
        const targetX = this.x + Math.cos(angle) * jumpDistance;
        const targetY = this.y + Math.sin(angle) * jumpDistance;

        // Shadow
        const shadow = this.scene.add.ellipse(this.x, this.y + 5, 40, 10, 0x000000, 0.3);
        shadow.setDepth(this.depth - 1);

        this.scene.tweens.add({
            targets: this,
            x: targetX,
            duration: jumpDuration,
            ease: 'Linear',
            onUpdate: (tween: Phaser.Tweens.Tween) => {
                const progress = tween.progress;
                const heightOffset = Math.sin(progress * Math.PI) * jumpHeight;
                this.y = Phaser.Math.Linear(startY, targetY, progress) - heightOffset;

                shadow.setPosition(this.x, this.y + 5);
                shadow.setAlpha(0.3 * (1 - Math.sin(progress * Math.PI) * 0.5));
            },
            onComplete: () => {
                this.isJumping = false;
                this.y = targetY;
                shadow.destroy();
            },
            onStop: () => {
                this.isJumping = false;
                shadow.destroy();
            }
        });

        return true;
    }
}
