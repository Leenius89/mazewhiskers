import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';

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
    private deferredRequested = false;
    /**
     * The enemy arrived before its 4.7MB track had finished downloading.
     *
     * On a cold cache the spawn regularly wins that race, and the swap used to
     * be dropped on the floor — the chase would play out over the main theme.
     * The request is held here and honoured the moment the file lands.
     */
    private enemySwapPending = false;

    /**
     * The chase track that is actually sounding, whoever asked for it.
     *
     * The scene used to hold this, on the enemy that triggered it. That worked
     * only when the file was already cached: on the slow path `playEnemySound`
     * returned null, the enemy stored nothing, and when the download finished
     * the deferred swap started the loop with nobody holding the handle. The
     * game over screen then had nothing to stop, and the chase music played on
     * over the results — for the full forty-five seconds an exhibition waits
     * before it returns to the menu.
     *
     * Kept here instead, where every start and every stop can see it.
     */
    private activeEnemyTrack: Phaser.Sound.BaseSound | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.sounds = {};
        this.soundsLoaded = false;
    }

    /**
     * Blocking load: only what the first seconds of play actually need.
     *
     * The audio for this game is 9MB, and 5.4MB of that is two files that are
     * silent for the first fifteen seconds. Loading everything up front made a
     * kiosk or a phone stare at a black screen for no reason. Nothing is
     * re-encoded here — the files are untouched, they just arrive later.
     */
    preloadSounds() {
        try {
            this.scene.load.audio('mainBGM', 'sources/main.mp3');
            this.scene.load.audio('fishSound', 'sources/fish.mp3');
            this.scene.load.audio('dyingSound', 'sources/dying.mp3');
            this.scene.load.audio('jumpSound', 'sources/jump.mp3');
            this.scene.load.audio('construct2', 'sources/construct2.mp3');
            this.scene.load.audio('construct3', 'sources/construct3.mp3');

            // `once`, not `on`. A persistent listener fired again when the
            // deferred audio finished downloading, which rebuilt every sound
            // object and dropped the reference to the BGM that was already
            // playing — so nothing could stop it, and the enemy's track ended
            // up layered on top of it instead of replacing it.
            this.scene.load.once('complete', () => this.initializeSounds());
        } catch (error) {
            console.error('Error loading audio files:', error);
        }
    }

    /**
     * Fetches the heavy files in the background once the world is up.
     *
     * `enemy.mp3` is 4.7MB and cannot be heard until the enemy appears;
     * `construct1.mp3` is 0.7MB and waits for the first demolition.
     */
    loadDeferredSounds() {
        if (this.deferredRequested) return;
        this.deferredRequested = true;

        const loader = this.scene.load;
        if (!this.scene.cache.audio.exists('enemySound')) {
            loader.audio('enemySound', 'sources/enemy.mp3');
        }
        if (!this.scene.cache.audio.exists('construct1')) {
            loader.audio('construct1', 'sources/construct1.mp3');
        }

        loader.once('complete', () => {
            if (!this.sounds.enemySound && this.scene.cache.audio.exists('enemySound')) {
                this.sounds.enemySound = this.scene.sound.add('enemySound', { loop: true, volume: 0 });
            }
            if (this.enemySwapPending) {
                this.enemySwapPending = false;
                this.playEnemySound();
            }
        });
        loader.start();
    }

    initializeSounds() {
        if (this.soundsLoaded) return;

        try {
            this.sounds = {
                mainBGM: this.scene.sound.add('mainBGM', { loop: true, volume: 0.5 }),
                fishSound: this.scene.sound.add('fishSound', { loop: false, volume: 0.5 }),
                dyingSound: this.scene.sound.add('dyingSound', { loop: false, volume: 0.5 })
            };

            // Added later by loadDeferredSounds, if it has arrived by then.
            if (this.scene.cache.audio.exists('enemySound')) {
                this.sounds.enemySound = this.scene.sound.add('enemySound', { loop: true, volume: 0 });
            }
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

    /** Returns to the main theme, silencing anything else looping. */
    playMainBGM() {
        // A swap still waiting on its download must not fire after the win.
        this.enemySwapPending = false;

        if (this.soundsLoaded) {
            try {
                if (this.sounds.mainBGM && this.sounds.mainBGM.isPlaying) return;

                // Every copy, not just the one this manager is holding — the
                // same reason playEnemySound sweeps the main theme.
                this.scene.sound.getAllPlaying().forEach((sound) => {
                    if (sound.key === 'enemySound') sound.stop();
                });

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

    /**
     * Swaps the soundtrack for the enemy's.
     *
     * Stops every copy of the main theme rather than only the one this manager
     * is holding — the swap has to be audible even if something else started a
     * second copy.
     */
    playEnemySound(): Phaser.Sound.BaseSound | null {
        if (this.soundsLoaded && this.sounds.enemySound) {
            try {
                this.scene.sound.getAllPlaying().forEach((sound) => {
                    if (sound.key === 'mainBGM') sound.stop();
                });

                const enemySound = this.sounds.enemySound;
                enemySound.play();
                this.activeEnemyTrack = enemySound;

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
            return null;
        }

        // Not downloaded yet. Remember the request rather than losing it.
        this.enemySwapPending = true;
        this.loadDeferredSounds();
        return null;
    }

    /**
     * Alert sting when the machine locks on.
     *
     * Placeholder: a construction hit, pitched up, standing in for a horn
     * until a dedicated alert asset exists.
     */
    playEnemyAlert() {
        if (!this.soundsLoaded) return;

        try {
            if (!this.scene.cache.audio.exists('construct2')) return;
            const alert = this.scene.sound.add('construct2', { volume: 0.45, loop: false });
            (alert as Phaser.Sound.WebAudioSound).detune = 600;
            alert.play();
            alert.once('complete', () => alert.destroy());
        } catch (error) {
            console.error('Error playing enemy alert:', error);
        }
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

    stopEnemySound(enemySound?: Phaser.Sound.BaseSound) {
        const track = enemySound ?? this.activeEnemyTrack;
        if (track && track.isPlaying) {
            track.stop();
        }
        if (!enemySound || enemySound === this.activeEnemyTrack) {
            this.activeEnemyTrack = null;
        }
    }

    /**
     * Silences the chase track however it was started.
     *
     * Also cancels a swap that has been requested but not yet honoured, so a
     * download that lands after the run is over does not start the music on
     * the results screen.
     */
    stopEnemyTrack(): void {
        this.enemySwapPending = false;
        this.stopEnemySound();

        // Belt and braces: anything looping this key, whoever created it.
        this.scene.sound.getAllPlaying().forEach((sound) => {
            if (sound.key === 'enemySound') sound.stop();
        });
    }

    stopAllSounds() {
        this.enemySwapPending = false;
        this.activeEnemyTrack = null;
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
            // Only what has actually finished downloading; construct1 is deferred.
            const available = [1, 2, 3].filter((num) => this.scene.cache.audio.exists(`construct${num}`));
            if (available.length === 0) return;

            const count = Phaser.Math.Between(1, available.length);
            Phaser.Utils.Array.Shuffle(available)
                .slice(0, count)
                .forEach((num) => {
                    const constructSound = this.scene.sound.add(`construct${num}`, {
                        volume: GameConfig.AUDIO.CONSTRUCT_VOLUME,
                        loop: false
                    });
                    constructSound.play();
                    constructSound.once('complete', () => constructSound.destroy());
                });
        } catch (error) {
            console.error('Error playing construct sound:', error);
        }
    }
}
