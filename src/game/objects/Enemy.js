import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, player, worldWidth, worldHeight) {
        // 초기 위치는 랜덤 결정 (안전한 거리 확보)
        let x, y;
        const minDistance = GameConfig.ENEMY.SPAWN.MIN_DISTANCE;

        do {
            x = Phaser.Math.Between(0, worldWidth);
            y = Phaser.Math.Between(0, worldHeight);
        } while (Phaser.Math.Distance.Between(x, y, player.x, player.y) < minDistance);

        super(scene, x, y, 'enemy1');

        this.scene = scene;
        this.player = player;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.initProperties();
        this.createAnimations();
    }

    initProperties() {
        this.setScale(GameConfig.ENEMY.SCALE);
        this.setDepth(GameConfig.ENEMY.DEPTH);
        this.isJumping = false;
        this.speed = GameConfig.ENEMY.SPEED;

        const imageWidth = this.width * this.scaleX;
        const imageHeight = this.height * this.scaleY;
        const hitboxScale = GameConfig.ENEMY.HITBOX_SCALE;
        this.body.setSize(imageWidth * hitboxScale, imageHeight * hitboxScale);
        this.body.setOffset((this.width - imageWidth * hitboxScale) / 2, (this.height - imageHeight * hitboxScale) / 2);
    }
    // ...
    update() {
        if (!this.active || this.isJumping) return;

        this.handleMovement();
        this.setDepth(this.y);
    }

    handleMovement() {
        // 벽 감지 및 점프 판단
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.player.x, this.player.y);
        const lookAheadDist = GameConfig.ENEMY.LOOK_AHEAD_DIST;
        const lookX = this.x + Math.cos(angle) * lookAheadDist;
        const lookY = this.y + Math.sin(angle) * lookAheadDist;

        const hitbox = new Phaser.Geom.Rectangle(lookX - 16, lookY - 16, 32, 32);

        let wallAhead = false;
        if (this.scene.walls) {
            wallAhead = this.scene.walls.getChildren().some(wall =>
                Phaser.Geom.Rectangle.Overlaps(hitbox, wall.getBounds())
            );
        }

        if (wallAhead) {
            this.performJump();
            return;
        }

        // 일반 이동
        const velocityX = Math.cos(angle) * this.speed;
        const velocityY = Math.sin(angle) * this.speed;

        this.setVelocity(velocityX, velocityY);

        // 방향 전환
        if (velocityX < 0) {
            this.setFlipX(true);
        } else if (velocityX > 0) {
            this.setFlipX(false);
        }
    }

    performJump() {
        if (this.isJumping) return;

        this.isJumping = true;
        this.anims.stop();
        this.setVelocity(0, 0);

        const jumpDuration = GameConfig.ENEMY.JUMP.DURATION;
        const jumpHeight = GameConfig.ENEMY.JUMP.HEIGHT;

        const startX = this.x;
        const startY = this.y;
        const angle = Phaser.Math.Angle.Between(startX, startY, this.player.x, this.player.y);
        const jumpDistance = GameConfig.ENEMY.JUMP.DISTANCE;
        const endX = startX + Math.cos(angle) * jumpDistance;
        const endY = startY + Math.sin(angle) * jumpDistance;

        // 그림자
        const shadow = this.scene.add.ellipse(this.x, this.y + 5, 40, 10, 0x000000, 0.3);
        shadow.setDepth(this.depth - 1);

        this.scene.tweens.add({
            targets: this,
            x: endX,
            duration: jumpDuration,
            ease: 'Linear',
            onUpdate: (tween) => {
                const progress = tween.progress;
                const heightOffset = Math.sin(progress * Math.PI) * jumpHeight;
                this.y = Phaser.Math.Linear(startY, endY, progress) - heightOffset;

                shadow.setPosition(this.x, this.y + 5);
                shadow.setAlpha(0.3 * (1 - Math.sin(progress * Math.PI) * 0.5));
            },
            onComplete: () => {
                this.isJumping = false;
                shadow.destroy();
                this.play('enemyWalk');
            }
        });
    }
}
