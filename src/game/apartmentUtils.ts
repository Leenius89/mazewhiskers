import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';

interface CustomScene extends Phaser.Scene {
    walls: Phaser.Physics.Arcade.StaticGroup;
    soundManager: any; // Type this properly later
    gameOverAnimation: () => void;
    maze?: number[][];
}

interface ProgressMap {
    [key: string]: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export class ApartmentSystem {
    private scene: CustomScene;
    private player: Phaser.Physics.Arcade.Sprite;
    private goal: Phaser.Physics.Arcade.Sprite | null;
    private apartments: Phaser.Physics.Arcade.StaticGroup;
    private mazeSize: number;
    private tileSize: number;
    private spacing: number;
    private wallScale: number;
    private isGameOver: boolean;
    private baseDepth: number;
    private occupiedPositions: Set<string>;
    private progress: ProgressMap;
    private spawnTimers: Record<string, Phaser.Time.TimerEvent> | null;

    constructor(scene: CustomScene, player: Phaser.Physics.Arcade.Sprite, goal: Phaser.Physics.Arcade.Sprite | null) {
        this.scene = scene;
        this.player = player;
        this.goal = goal;
        this.apartments = scene.physics.add.staticGroup();
        this.mazeSize = GameConfig.MAZE_SIZE;
        this.tileSize = GameConfig.TILE_SIZE;
        this.spacing = GameConfig.SPACING;
        this.wallScale = GameConfig.APARTMENT.WALL_SCALE;
        this.isGameOver = false;
        this.baseDepth = GameConfig.APARTMENT.BASE_DEPTH;
        // O(1) position tracking
        this.occupiedPositions = new Set();
        this.spawnTimers = null;

        // Progress for each direction
        this.progress = {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0
        };

        // Create dust animation
        this.createDustAnimation();

        // Start after 15 seconds
        this.scene.time.delayedCall(GameConfig.APARTMENT.DELAY, () => this.startApartmentSpawn(), [], this);
    }

    createDustAnimation() {
        if (!this.scene.anims.exists('dust')) {
            this.scene.anims.create({
                key: 'dust',
                frames: [
                    { key: 'dust1', frame: 0 },
                    { key: 'dust2', frame: 0 }
                ],
                frameRate: 8,
                repeat: 3,
                duration: 1000
            });
        }
    }

    startApartmentSpawn() {
        // Timers for each direction
        this.spawnTimers = {
            top: this.createSpawnTimer('top'),
            right: this.createSpawnTimer('right'),
            bottom: this.createSpawnTimer('bottom'),
            left: this.createSpawnTimer('left')
        };

        // Spawn first row immediately
        this.spawnApartmentRow('top');
        this.spawnApartmentRow('right');
        this.spawnApartmentRow('bottom');
        this.spawnApartmentRow('left');
    }

    createSpawnTimer(direction: keyof ProgressMap): Phaser.Time.TimerEvent {
        return this.scene.time.addEvent({
            delay: GameConfig.APARTMENT.SPAWN_INTERVAL,
            callback: () => this.spawnApartmentRow(direction),
            callbackScope: this,
            loop: true
        });
    }

    calculatePosition(direction: string, progress: number) {
        switch (direction) {
            case 'top':
                return {
                    x: (index: number) => index * this.tileSize * this.spacing,
                    y: () => progress * this.tileSize * this.spacing
                };
            case 'right':
                return {
                    x: () => (this.mazeSize - 1) * this.tileSize * this.spacing - progress * this.tileSize * this.spacing,
                    y: (index: number) => index * this.tileSize * this.spacing
                };
            case 'bottom':
                return {
                    x: (index: number) => index * this.tileSize * this.spacing,
                    y: () => (this.mazeSize - 1) * this.tileSize * this.spacing - progress * this.tileSize * this.spacing
                };
            case 'left':
                return {
                    x: () => progress * this.tileSize * this.spacing,
                    y: (index: number) => index * this.tileSize * this.spacing
                };
            default:
                return {
                    x: (index: number) => index * this.tileSize * this.spacing,
                    y: () => progress * this.tileSize * this.spacing
                };
        }
    }

    spawnApartmentRow(direction: keyof ProgressMap) {
        if (this.isGameOver || this.progress[direction] >= this.mazeSize / 2) return;

        const getPosition = this.calculatePosition(direction as string, this.progress[direction]);
        const dustSprites: Phaser.GameObjects.Sprite[] = [];

        // Direction range
        let range = this.mazeSize;
        if (direction === 'right' || direction === 'left') {
            range = this.mazeSize;
        }

        for (let i = 0; i < range; i++) {
            const xPos = getPosition.x(i);
            const yPos = getPosition.y(i);

            // Check if position occupied
            if (this.isPositionOccupied(xPos, yPos)) continue;

            this.removeExistingWalls(xPos, yPos);

            const dust = this.scene.add.sprite(xPos, yPos, 'dust1');
            dust.setScale(this.wallScale);
            dust.setDepth(this.baseDepth + this.progress[direction] * 10);

            dust.play('dust');
            dust.on('animationcomplete', () => {
                this.createApartment(xPos, yPos, i, dust, direction);
            });

            dustSprites.push(dust);
        }

        if (dustSprites.length > 0 && this.scene.soundManager) {
            this.scene.soundManager.playConstructSound();
        }

        this.progress[direction]++;
        this.checkGameOver();
    }

    _posKey(x: number, y: number): string {
        // Round to grid for O(1) lookup
        const unit = this.tileSize * this.spacing;
        return `${Math.round(x / unit)},${Math.round(y / unit)}`;
    }

    isPositionOccupied(x: number, y: number): boolean {
        return this.occupiedPositions.has(this._posKey(x, y));
    }

    createApartment(xPos: number, yPos: number, index: number, dust: Phaser.GameObjects.Sprite, direction: keyof ProgressMap) {
        // Double check position (animation delay)
        if (this.isPositionOccupied(xPos, yPos)) {
            dust.destroy();
            return;
        }

        // Mark position as occupied
        this.occupiedPositions.add(this._posKey(xPos, yPos));

        const apartmentType = Phaser.Math.Between(1, 3);
        const apartment = this.apartments.create(xPos, yPos, `apt${apartmentType}`) as Phaser.Physics.Arcade.Sprite;

        apartment.setScale(this.wallScale);
        apartment.setOrigin(0.5, 0.5);
        apartment.setDepth(this.baseDepth + this.progress[direction] * 10);

        const imageWidth = apartment.width * this.wallScale;
        const imageHeight = apartment.height * this.wallScale;
        apartment.body!.setSize(imageWidth, imageHeight);
        apartment.body!.setOffset((apartment.width - imageWidth) / 2, (apartment.height - imageHeight) / 2);

        apartment.setAlpha(0);
        this.scene.tweens.add({
            targets: apartment,
            alpha: 1,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                dust.destroy();
                this.checkCollisions(apartment);
            }
        });
    }

    removeExistingWalls(x: number, y: number) {
        // Only check walls within a reasonable distance
        const threshold = this.tileSize * this.spacing;
        const walls = this.scene.walls.getChildren() as Phaser.Physics.Arcade.Sprite[];
        for (let i = walls.length - 1; i >= 0; i--) {
            const wall = walls[i];
            if (wall.active && Math.abs(wall.x - x) < threshold && Math.abs(wall.y - y) < threshold) {
                wall.destroy();
            }
        }
    }

    checkCollisions(apartment: Phaser.Physics.Arcade.Sprite) {
        const playerBounds = this.player.getBounds();
        const apartmentBounds = apartment.getBounds();

        if (Phaser.Geom.Rectangle.Overlaps(playerBounds, apartmentBounds)) {
            this.triggerGameOver('player');
            return;
        }

        if (this.goal) {
            const goalBounds = this.goal.getBounds();
            if (Phaser.Geom.Rectangle.Overlaps(goalBounds, apartmentBounds)) {
                this.triggerGameOver('goal');
            }
        }
    }

    checkGameOver() {
        // Check if limits reached
        if (Object.values(this.progress).every(p => p >= this.mazeSize / 2)) {
            this.stopSpawning();
        }
    }

    triggerGameOver(reason: string) {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.stopSpawning();
        this.scene.gameOverAnimation();
    }

    stopSpawning() {
        if (this.spawnTimers) {
            Object.values(this.spawnTimers).forEach(timer => timer.remove());
            this.spawnTimers = null;
        }
    }

    destroy() {
        this.stopSpawning();
        this.apartments.clear(true, true);
    }
}
