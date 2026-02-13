import Phaser from 'phaser';

import { GameConfig } from '../constants/GameConfig';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
    public isJumping: boolean;
    private mazeGrid: number[][] | undefined; // Allow undefined if maze is optional or initially missing
    private player: Phaser.Physics.Arcade.Sprite;
    private speed: number;
    public enemySound?: Phaser.Sound.BaseSound;

    // Use specific types if possible, otherwise keep generic
    constructor(scene: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite, worldWidth: number, worldHeight: number, maze: number[][]) {
        // Calculate spawn position BEFORE super() (cannot use `this` yet)
        let x = 0, y = 0;
        const minDistance = GameConfig.ENEMY.SPAWN.MIN_DISTANCE;
        const tileUnit = GameConfig.TILE_SIZE * GameConfig.SPACING;

        let attempts = 0;
        let found = false;
        while (attempts < 100) {
            x = Phaser.Math.Between(0, worldWidth);
            y = Phaser.Math.Between(0, worldHeight);

            // Check if position is in empty space (not a wall)
            const gridX = Math.floor(x / tileUnit);
            const gridY = Math.floor(y / tileUnit);

            let validPosition = true;
            if (maze) {
                if (gridY >= 0 && gridY < maze.length &&
                    gridX >= 0 && gridX < maze[0].length) {
                    if (maze[gridY][gridX] === 1) {
                        validPosition = false;
                    }
                } else {
                    validPosition = false;
                }
            }

            attempts++;
            if (!validPosition) continue;

            // Check distance from player
            if (Phaser.Math.Distance.Between(x, y, player.x, player.y) >= minDistance) {
                found = true;
                break;
            }
        }

        if (!found) {
            console.warn("Could not find suitable spawn location for enemy after 100 attempts");
            x = worldWidth - 100;
            y = worldHeight - 100;
        }

        // NOW call super() with the calculated position
        super(scene, x, y, 'enemy1');

        // Store references AFTER super()
        this.scene = scene;
        this.player = player;
        this.mazeGrid = maze; // Renamed to mazeGrid match original

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.isJumping = false;
        this.speed = GameConfig.ENEMY.SPEED;

        this.initProperties();
        this.createAnimations();
    }

    createAnimations() {
        if (!this.scene.anims.exists('enemyWalk')) {
            this.scene.anims.create({
                key: 'enemyWalk',
                frames: [
                    { key: 'enemy1' },
                    { key: 'enemy2' }
                ],
                frameRate: 4,
                repeat: -1
            });
        }
        this.play('enemyWalk', true);
    }

    initProperties() {
        this.setScale(GameConfig.ENEMY.SCALE);
        this.setDepth(99999); // Guaranteed to be on top
        this.isJumping = false;
        this.speed = GameConfig.ENEMY.SPEED;

        const imageWidth = this.width * this.scaleX;
        const imageHeight = this.height * this.scaleY;
        const hitboxScale = (GameConfig.ENEMY as any).HITBOX_SCALE || 1; // Type assertion if property missing in GameConfig type
        this.body!.setSize(imageWidth * hitboxScale, imageHeight * hitboxScale);
        this.body!.setOffset(
            (this.width - imageWidth * hitboxScale) / 2,
            (this.height - imageHeight * hitboxScale) / 2
        );
    }

    update() {
        if (!this.active || this.isJumping) return;

        this.handleMovement();
        // Keep enemy depth above all apartments
        this.setDepth(99999);
    }

    handleMovement() {
        // Move directly towards player (shortest path, jump over walls)
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.player.x, this.player.y);
        const tileUnit = GameConfig.TILE_SIZE * GameConfig.SPACING;

        // Check ahead for walls
        const lookAheadDist = GameConfig.ENEMY.LOOK_AHEAD_DIST;
        const lookX = this.x + Math.cos(angle) * lookAheadDist;
        const lookY = this.y + Math.sin(angle) * lookAheadDist;

        let wallAhead = false;
        if (this.mazeGrid) {
            const gridX = Math.floor(lookX / tileUnit);
            const gridY = Math.floor(lookY / tileUnit);

            if (gridY >= 0 && gridY < this.mazeGrid.length &&
                gridX >= 0 && gridX < this.mazeGrid[0].length) {
                if (this.mazeGrid[gridY][gridX] === 1) {
                    wallAhead = true;
                }
            }
        }

        if (wallAhead) {
            this.performJump();
            return;
        }

        // Normal movement towards player
        const velocityX = Math.cos(angle) * this.speed;
        const velocityY = Math.sin(angle) * this.speed;
        this.setVelocity(velocityX, velocityY);

        // Flip sprite based on direction
        if (velocityX < 0) {
            this.setFlipX(true);
        } else if (velocityX > 0) {
            this.setFlipX(false);
        }
    }

    performJump() {
        if (this.isJumping) return;

        this.isJumping = true;
        this.setVelocity(0, 0);

        const jumpDuration = GameConfig.ENEMY.JUMP.DURATION;
        const jumpHeight = GameConfig.ENEMY.JUMP.HEIGHT;

        const startX = this.x;
        const startY = this.y;
        const angle = Phaser.Math.Angle.Between(startX, startY, this.player.x, this.player.y);
        const jumpDistance = GameConfig.ENEMY.JUMP.DISTANCE;
        const endX = startX + Math.cos(angle) * jumpDistance;
        const endY = startY + Math.sin(angle) * jumpDistance;

        // Shadow
        const shadow = this.scene.add.ellipse(this.x, this.y + 5, 40, 10, 0x000000, 0.3);
        shadow.setDepth(this.depth - 1);

        this.scene.tweens.add({
            targets: this,
            x: endX,
            duration: jumpDuration,
            ease: 'Linear',
            onUpdate: (tween: Phaser.Tweens.Tween) => {
                const progress = tween.progress;
                const heightOffset = Math.sin(progress * Math.PI) * jumpHeight;
                this.y = Phaser.Math.Linear(startY, endY, progress) - heightOffset;

                shadow.setPosition(this.x, this.y + 5);
                shadow.setAlpha(0.3 * (1 - Math.sin(progress * Math.PI) * 0.5));
            },
            onComplete: () => {
                this.isJumping = false;
                shadow.destroy();
                this.play('enemyWalk', true);
            }
        });
    }
}
