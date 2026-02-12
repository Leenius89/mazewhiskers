import { GameConfig } from './constants/GameConfig';

export const setupHealthSystem = (scene, player, fishes) => {
  // HP auto-drain timer (1 HP per second)
  scene.time.addEvent({
    delay: 1000,
    callback: () => {
      if (!scene.gameOverStarted) {
        // Use game.events so React App.js can hear it
        scene.game.events.emit('changeHealth', -1);
      }
    },
    loop: true
  });

  // Fish collision - heals HP
  scene.physics.add.overlap(player, fishes, (player, fish) => {
    if (scene.gameOverStarted) return;

    // Heal HP via game event bus (reaches App.js)
    console.log('Fish eaten. Emitting changeHealth:', GameConfig.FISH.HEAL_AMOUNT);
    scene.game.events.emit('changeHealth', GameConfig.FISH.HEAL_AMOUNT);

    // Sound
    if (scene.soundManager) {
      scene.soundManager.playFishSound();
    }

    // Track fish count
    scene.events.emit('collectFish');

    // Remove fish
    fish.destroy();
  });
};