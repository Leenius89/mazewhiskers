import Phaser from 'phaser';

interface SoundMap {
    mainBGM?: Phaser.Sound.BaseSound;
    fishSound?: Phaser.Sound.BaseSound;
    dyingSound?: Phaser.Sound.BaseSound;
    enemySound?: Phaser.Sound.BaseSound;
    jumpSound?: Phaser.Sound.BaseSound;
    [key: string]: Phaser.Sound.BaseSound | undefined;
}

export class SoundManager {
    private scene: Phaser.Scene;
    private sounds: SoundMap;
    private soundsLoaded: boolean;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.sounds = {};
        this.soundsLoaded = false;
    }

    preloadSounds() {
        try {
            // Relative paths
            this.scene.load.audio('mainBGM', 'sources/main.mp3');
            this.scene.load.audio('enemySound', 'sources/enemy.mp3');
            this.scene.load.audio('fishSound', 'sources/fish.mp3');
            this.scene.load.audio('dyingSound', 'sources/dying.mp3');
            this.scene.load.audio('construct1', 'sources/construct1.mp3');
            this.scene.load.audio('construct2', 'sources/construct2.mp3');
            this.scene.load.audio('construct3', 'sources/construct3.mp3');
            this.scene.load.audio('jumpSound', 'sources/jump.mp3');

            // Setup complete event
            this.scene.load.on('complete', this.initializeSounds.bind(this));
        } catch (error) {
            console.error('Error loading audio files:', error);
        }
    }

    initializeSounds() {
        try {
            this.sounds = {
                mainBGM: this.scene.sound.add('mainBGM', { loop: true, volume: 0.5 }),
                fishSound: this.scene.sound.add('fishSound', { loop: false, volume: 0.5 }),
                dyingSound: this.scene.sound.add('dyingSound', { loop: false, volume: 0.5 }),
                enemySound: this.scene.sound.add('enemySound', { loop: true, volume: 0 }),
            };
            this.sounds.jumpSound = this.scene.sound.add('jumpSound', { loop: false, volume: 0.3 });
            this.soundsLoaded = true;
        } catch (error) {
            console.error('Error initializing sounds:', error);
            this.soundsLoaded = false;
        }
    }

    playJumpSound() {
        if (this.soundsLoaded && this.sounds.jumpSound) {
            try {
                this.sounds.jumpSound.play();
            } catch (error) {
                console.error('Error playing jumpSound:', error);
            }
        }
    }

    playMainBGM() {
        if (this.soundsLoaded) {
            try {
                // Ignore if already playing
                if (this.sounds.mainBGM && this.sounds.mainBGM.isPlaying) return;

                // Stop Enemy BGM if playing
                if (this.sounds.enemySound && this.sounds.enemySound.isPlaying) {
                    this.sounds.enemySound.stop();
                }

                // Recreate if destroyed or missing
                // Type assertion for scene check as BaseSound might not expose it directly in all versions, but generally it does.
                // Or safely check if it exists.
                if (!this.sounds.mainBGM) {
                    this.sounds.mainBGM = this.scene.sound.add('mainBGM', {
                        loop: true,
                        volume: 0.5
                    });
                }

                this.sounds.mainBGM.play();
                console.log('Main BGM started playing');
            } catch (error) {
                console.error('Error playing mainBGM:', error);
            }
        }
    }

    playFishSound() {
        if (!this.soundsLoaded) {
            console.warn('Sounds not loaded yet');
            return;
        }

        try {
            // Create new instance
            const fishSound = this.scene.sound.add('fishSound', {
                volume: 0.5,
                loop: false
            });

            fishSound.play();
            console.log('Fish sound played');

            // Cleanup on complete
            fishSound.once('complete', () => {
                fishSound.destroy();
            });
        } catch (error) {
            console.error('Error playing fish sound:', error);
        }
    }

    playEnemySound(): Phaser.Sound.BaseSound | null {
        if (this.soundsLoaded && this.sounds.enemySound) {
            try {
                // Stop Main BGM
                if (this.sounds.mainBGM && this.sounds.mainBGM.isPlaying) {
                    this.sounds.mainBGM.stop();
                }

                const enemySound = this.sounds.enemySound;
                enemySound.play();

                // Fade in
                this.scene.tweens.add({
                    targets: enemySound,
                    volume: 0.3,
                    duration: 1000
                });

                return enemySound;
            } catch (error) {
                console.error('Error playing enemySound:', error);
            }
        }
        return null;
    }

    playDyingSound() {
        if (this.soundsLoaded && this.sounds.dyingSound) {
            try {
                this.sounds.dyingSound.play();
            } catch (error) {
                console.error('Error playing dyingSound:', error);
            }
        }
    }

    stopMainBGM() {
        if (this.soundsLoaded && this.sounds.mainBGM) {
            this.sounds.mainBGM.stop();
            this.sounds.mainBGM.destroy();
            // Remove reference so it can be recreated safely
            delete this.sounds.mainBGM;
        }
    }

    stopEnemySound(enemySound: Phaser.Sound.BaseSound) {
        if (enemySound && enemySound.isPlaying) {
            enemySound.stop();
        }
    }

    stopAllSounds() {
        if (this.soundsLoaded) {
            // Stop all currently playing sounds
            this.scene.sound.getAllPlaying().forEach(sound => {
                sound.stop();
            });

            // Explicitly stop and cleanup managed sounds
            Object.values(this.sounds).forEach((sound) => {
                if (sound && sound.isPlaying) {
                    sound.stop();
                }
            });

            // Cleanup listeners
            this.scene.sound.removeAllListeners();
        }
    }

    playConstructSound() {
        if (!this.soundsLoaded) {
            console.warn('Sounds not loaded yet');
            return;
        }

        try {
            const numSounds = Phaser.Math.Between(1, 3);
            const availableSounds = [1, 2, 3];
            const selectedSounds = Phaser.Utils.Array.Shuffle(availableSounds).slice(0, numSounds);

            selectedSounds.forEach(num => {
                const constructSound = this.scene.sound.add(`construct${num}`, {
                    volume: 0.1,
                    loop: false
                });
                constructSound.play();
            });
        } catch (error) {
            console.error('Error playing construct sound:', error);
        }
    }
}
