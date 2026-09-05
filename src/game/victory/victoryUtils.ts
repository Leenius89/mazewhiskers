import Phaser from 'phaser';
import { showEndingMessages } from './endingMessages';
import { showCredits } from './creditsSystem';
import { GameEventBus } from '../core/GameEvents';

export class VictoryScene extends Phaser.Scene {
    private buttonsContainer: HTMLDivElement | null;
    /** Guards against a second credits roll while one is already on screen. */
    private isShowingCredits: boolean;
    private bus!: GameEventBus;
    private timeMs: number = 0;
    private milkCount: number = 0;
    private fishCount: number = 0;
    /** Health the run finished on; the closest-call board ranks by it. */
    private healthLeft: number = 0;
    private blackOverlay: Phaser.GameObjects.Graphics | undefined;
    private background: Phaser.GameObjects.Image | undefined;

    constructor() {
        super('VictoryScene');
        this.buttonsContainer = null;
        this.isShowingCredits = false;
        this.milkCount = 0;
        this.fishCount = 0;
        this.healthLeft = 0;
        this.timeMs = 0;
    }

    preload() {
        // Relative paths assumed correct based on AssetLoader usage
        if (!this.textures.exists('goalBackground')) {
            this.load.image('goalBackground', 'sources/goalbackground.png');
        }
        if (!this.textures.exists('victoryCat1')) {
            this.load.image('victoryCat1', 'sources/catfish1.png');
        }
        if (!this.textures.exists('victoryCat2')) {
            this.load.image('victoryCat2', 'sources/catfish2.png');
        }
    }

    init(data: { milkCount?: number; fishCount?: number; healthLeft?: number; timeMs: number }) {
        this.milkCount = data.milkCount || 0;
        this.fishCount = data.fishCount || 0;
        this.healthLeft = data.healthLeft || 0;
        this.timeMs = data.timeMs || 0;
    }

    async create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        this.bus = new GameEventBus(this.game.events);
        this.bus.on('showCredits', this.rollCredits, this);
        this.events.once('shutdown', () => this.bus.off('showCredits', this.rollCredits, this));

        // Black overlay setup
        this.blackOverlay = this.add.graphics();
        this.blackOverlay.setDepth(1);
        this.blackOverlay.fillStyle(0x000000, 1);
        // Drawn well past the viewport on every side. Sized exactly to the
        // camera it left a sliver of the game showing along the top edge, and a
        // black fill costs nothing to over-draw.
        this.blackOverlay.fillRect(-width, -height, width * 3, height * 3);

        // Background image
        this.background = this.add.image(0, 0, 'goalBackground');
        this.background.setOrigin(0, 0);
        this.background.setDisplaySize(width, height);
        this.background.setAlpha(0);

        // Show ending messages
        await showEndingMessages(this, width, height);

        // Transition background and overlay
        this.tweens.add({
            targets: this.background,
            alpha: 1,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => {
                if (this.blackOverlay) {
                    this.tweens.add({
                        targets: this.blackOverlay,
                        alpha: 0,
                        duration: 1000,
                        ease: 'Power2',
                        onComplete: () => {
                            this.startCatfishAnimation(width, height);

                            // Emit Victory Event for React UI after background is visible
                            this.bus.emit('victory', {
                                timeMs: this.timeMs,
                                milkCount: this.milkCount,
                                fishCount: this.fishCount,
                                healthLeft: this.healthLeft
                            });
                        }
                    });
                }
            }
        });
    }

    /**
     * Rolls the end credits over the canvas.
     *
     * React hides its results panel first, otherwise the fixed-position overlay
     * would sit on top of the canvas and the credits would never be seen.
     */
    private rollCredits() {
        if (this.isShowingCredits) return;

        showCredits(
            this,
            this.cameras.main.width,
            this.cameras.main.height,
            () => {
                this.isShowingCredits = true;
            },
            () => {
                this.isShowingCredits = false;
                this.bus.emit('creditsClosed');
            }
        );
    }

    startCatfishAnimation(width: number, height: number) {
        if (!this.anims.exists('victoryCatSwim')) {
            this.anims.create({
                key: 'victoryCatSwim',
                frames: [
                    { key: 'victoryCat1' },
                    { key: 'victoryCat2' }
                ],
                frameRate: 4,
                repeat: -1
            });
        }

        const cat = this.add.sprite(-100, height * 0.8, 'victoryCat1');
        cat.setScale(0.15);
        cat.play('victoryCatSwim');

        this.tweens.add({
            targets: cat,
            x: width / 2,
            duration: 4000,
            ease: 'Power1',
            onComplete: () => {
                cat.anims.stop();
                cat.setTexture('victoryCat1');
            }
        });
    }
}
