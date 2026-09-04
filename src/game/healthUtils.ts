import Phaser from 'phaser';
import { GameConfig } from './constants/GameConfig';
import type { GameScene } from './scenes/GameScene';

/**
 * The cost of living, and the income that offsets it.
 *
 * Two clocks run here. The steady drain is the cost of merely existing; the
 * rent charge is a deadline that arrives whether or not you were ready. A
 * flat trickle is a number going down — a periodic lump is something you have
 * to plan around, which is the point.
 *
 * Health is owned by the scene, so both paths call `scene.applyHealth()`
 * rather than emitting a delta for React to accumulate.
 */
export const setupHealthSystem = (
    scene: GameScene,
    player: Phaser.Physics.Arcade.Sprite,
    fishes: Phaser.Physics.Arcade.Group
) => {
    // Standing still still costs you something.
    scene.time.addEvent({
        delay: GameConfig.HEALTH.DRAIN_INTERVAL,
        callback: () => {
            // No control, no cost: the opening fly-over and every scripted beat
            // are free. Charging for time the player cannot act in is a cheap
            // way to lose.
            if (!scene.state.is('playing') || scene.narrativeActive) return;
            scene.applyHealth(GameConfig.HEALTH.DRAIN_AMOUNT);
        },
        loop: true
    });

    scheduleRent(scene);

    scene.physics.add.overlap(player, fishes, (_p, f) => {
        if (scene.state.hasEnded()) return;

        const fish = f as Phaser.Physics.Arcade.Sprite;

        // A fish standing inside a marked construction site is worth more.
        // That is the whole risk/reward loop: the good money is where the
        // bulldozers are about to be.
        const unit = GameConfig.TILE_SIZE * GameConfig.SPACING;
        const atRisk = !!scene.apartmentSystem?.isPendingCell(
            Math.round(fish.x / unit),
            Math.round(fish.y / unit)
        );

        scene.applyHealth(atRisk ? GameConfig.FISH.RISK_HEAL_AMOUNT : GameConfig.FISH.HEAL_AMOUNT);
        scene.soundManager?.playFishSound();
        scene.events.emit('collectFish');

        fish.destroy();
    });
};

/** Rent day: a periodic lump sum, announced before it lands. */
const scheduleRent = (scene: GameScene) => {
    const rent = GameConfig.HEALTH.RENT;

    scene.time.addEvent({
        delay: rent.INTERVAL,
        loop: true,
        callback: () => {
            if (scene.state.hasEnded()) return;
            scene.chargeRent();
        }
    });
};
