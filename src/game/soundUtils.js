import Phaser from 'phaser';

export class SoundManager {
  constructor(scene) {
    this.scene = scene;
    this.sounds = {};
    this.soundsLoaded = false;
    this.currentFishSound = null;
  }

  preloadSounds() {
    try {
      // 상대 경로로 수정
      this.scene.load.audio('mainBGM', 'sources/main.mp3');
      this.scene.load.audio('enemySound', 'sources/enemy.mp3');
      this.scene.load.audio('fishSound', 'sources/fish.mp3');
      this.scene.load.audio('dyingSound', 'sources/dying.mp3');
      this.scene.load.audio('construct1', 'sources/construct1.mp3');
      this.scene.load.audio('construct2', 'sources/construct2.mp3');
      this.scene.load.audio('construct3', 'sources/construct3.mp3');
      this.scene.load.audio('jumpSound', 'sources/jump.mp3');

      // 로드 완료 이벤트 설정
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
        // 이미 재생 중이면 무시
        if (this.sounds.mainBGM && this.sounds.mainBGM.isPlaying) return;

        // Enemy BGM이 재생 중이면 중지
        if (this.sounds.enemySound && this.sounds.enemySound.isPlaying) {
          this.sounds.enemySound.stop();
        }

        // 기존 인스턴스가 파괴되었거나 없는 경우 새로 생성
        if (!this.sounds.mainBGM || !this.sounds.mainBGM.scene) {
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
      // 새 사운드 인스턴스 생성 및 재생
      const fishSound = this.scene.sound.add('fishSound', {
        volume: 0.5,
        loop: false
      });

      fishSound.play();
      console.log('Fish sound played');

      // 재생 완료 시 정리
      fishSound.once('complete', () => {
        fishSound.destroy();
      });
    } catch (error) {
      console.error('Error playing fish sound:', error);
    }
  }

  playEnemySound() {
    if (this.soundsLoaded && this.sounds.enemySound) {
      try {
        // Main BGM 중지
        if (this.sounds.mainBGM && this.sounds.mainBGM.isPlaying) {
          this.sounds.mainBGM.stop();
        }

        const enemySound = this.sounds.enemySound;
        enemySound.play();

        // 페이드 인
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
    }
  }

  stopEnemySound(enemySound) {
    if (enemySound && enemySound.isPlaying) {
      enemySound.stop();
    }
  }

  stopAllSounds() {
    if (this.soundsLoaded) {
      // 현재 재생 중인 모든 사운드 중지
      this.scene.sound.getAllPlaying().forEach(sound => {
        sound.stop();
      });

      // 개별 사운드들도 명시적으로 중지 및 정리
      Object.values(this.sounds).forEach(sound => {
        if (sound && sound.isPlaying) {
          sound.stop();
        }
      });

      // 타이머나 사운드 이벤트 정리
      this.scene.sound.removeAllListeners();
    }
  }

  playConstructSound() {
    if (!this.soundsLoaded) {
      console.warn('Sounds not loaded yet');
      return;
    }

    try {
      // 랜덤하게 1~3개의 사운드 선택
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