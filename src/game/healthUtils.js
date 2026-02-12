import { GameConfig } from './constants/GameConfig';

export const setupHealthSystem = (scene, player, fishes) => {
  // 체력 자동 감소 타이머 설정
  scene.time.addEvent({
    delay: 1000,
    callback: () => {
      if (!scene.gameOverStarted) {
        scene.events.emit('changeHealth', -1);
      }
    },
    loop: true
  });

  // fish 충돌 처리 설정
  scene.physics.add.overlap(player, fishes, (player, fish) => {
    if (scene.gameOverStarted) return;

    // 체력 회복을 위한 이벤트 발생
    scene.events.emit('changeHealth', GameConfig.FISH.HEAL_AMOUNT);

    // 사운드 직접 재생
    if (scene.soundManager) {
      scene.soundManager.playFishSound();
      console.log("Attempting to play fish sound"); // 디버깅용
    } else {
      console.warn("Sound manager not found"); // 디버깅용
    }

    // fish 제거
    fish.destroy();
  });
};