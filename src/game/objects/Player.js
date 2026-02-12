import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';

export class Player extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'cat1');

        // 씬에 추가
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // 속성 초기화
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
    }

    initPhysics() {
        this.setCollideWorldBounds(true);

        // 히트박스 조정
        const imageWidth = this.width * this.scaleX;
        const imageHeight = this.height * this.scaleY;
        this.body.setSize(imageWidth, imageHeight);
        this.body.setOffset((this.width - imageWidth) / 2, (this.height - imageHeight) / 2);
    }
    // ... (skip animations)
    update(cursors) {
        if (this.isJumping) return;

        this.handleMovement(cursors);
        this.updateDepth();
    }

    handleMovement(cursors) {
        if (!cursors) return;

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
            this.body.velocity.normalize().scale(this.speed);
            this.anims.play('walk', true);
        } else {
            this.anims.stop();
            this.setTexture('cat1');
        }

        // 방향 전환
        if (this.body.velocity.x < 0) {
            this.setFlipX(true);
        } else if (this.body.velocity.x > 0) {
            this.setFlipX(false);
        }
    }

    updateDepth() {
        this.setDepth(this.y);
    }

    jump() {
        if (this.isJumping || this.jumpCount <= 0) return false;

        // 벽 체크 로직은 Scene에서 Wall Group 접근이 필요하므로,
        // 충돌 체크는 Scene이나 별도 메서드로 분리하는게 좋지만,
        // 여기서는 간단히 Scene의 walls에 접근한다고 가정합니다.
        if (!this.checkWallAhead()) return false;

        return this.performJump();
    }

    checkWallAhead() {
        const angle = this.lastDirection === 'left' ? Math.PI : 0;
        const lookAheadDist = GameConfig.PLAYER.LOOK_AHEAD_DIST;
        const lookX = this.x + Math.cos(angle) * lookAheadDist;
        const lookY = this.y + Math.sin(angle) * lookAheadDist;

        const bounds = new Phaser.Geom.Rectangle(lookX - 16, lookY - 16, 32, 32);

        // Scene의 walls 그룹에 접근 (GameScene에서 this.walls로 저장해뒀다고 가정)
        if (!this.scene.walls) return false;

        return this.scene.walls.getChildren().some(wall =>
            Phaser.Geom.Rectangle.Overlaps(bounds, wall.getBounds())
        );
    }

    performJump() {
        this.jumpCount--;
        this.scene.events.emit('updateJumpCount', this.jumpCount);

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

        // 그림자
        const shadow = this.scene.add.ellipse(this.x, this.y + 5, 40, 10, 0x000000, 0.3);
        shadow.setDepth(this.depth - 1);

        this.scene.tweens.add({
            targets: this,
            x: targetX,
            duration: jumpDuration,
            ease: 'Linear',
            onUpdate: (tween) => {
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
