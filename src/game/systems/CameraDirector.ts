import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import type { GameScene } from '../scenes/GameScene';

/**
 * Leans the camera the way the player is heading, and pulls back a little
 * during a jump.
 *
 * A camera locked dead centre makes a maze feel like a keyhole: you always see
 * as much behind you as ahead. Biasing the frame toward the direction of travel
 * gives back the reaction time the maze takes away.
 *
 * Disabled while a scripted move (the opening fly-over, the enemy reveal) owns
 * the camera, so the two never fight over the same properties.
 */
export class CameraDirector {
    private readonly scene: GameScene;
    private readonly camera: Phaser.Cameras.Scene2D.Camera;
    private readonly lookahead = new Phaser.Math.Vector2(0, 0);

    private baseZoom: number;
    private enabled = false;

    constructor(scene: GameScene, baseZoom: number) {
        this.scene = scene;
        this.camera = scene.cameras.main;
        this.baseZoom = baseZoom;
    }

    /** Hands control to (or back from) a scripted camera move. */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) return;

        this.baseZoom = this.camera.zoom;
        this.lookahead.set(0, 0);
        this.camera.setFollowOffset(0, 0);
    }

    update(moveDirection: Phaser.Math.Vector2): void {
        if (!this.enabled) return;

        const cfg = GameConfig.CAMERA.LOOKAHEAD;
        const targetX = moveDirection.x * cfg.DISTANCE;
        const targetY = moveDirection.y * cfg.DISTANCE;

        this.lookahead.x = Phaser.Math.Linear(this.lookahead.x, targetX, cfg.EASE);
        this.lookahead.y = Phaser.Math.Linear(this.lookahead.y, targetY, cfg.EASE);

        // Follow offset shifts the camera *away* from the target, so the sign is
        // inverted to put the empty space ahead of the cat rather than behind it.
        this.camera.setFollowOffset(-this.lookahead.x, -this.lookahead.y);
    }

    /** Small pull-back for the duration of a jump arc, then back to normal. */
    punchOutForJump(duration: number): void {
        if (!this.enabled) return;

        const cfg = GameConfig.CAMERA.JUMP_ZOOM;
        this.camera.zoomTo(this.baseZoom * cfg.SCALE, duration * cfg.OUT_FRACTION, 'Sine.easeOut');

        this.scene.time.delayedCall(duration * cfg.OUT_FRACTION, () => {
            if (!this.enabled) return;
            this.camera.zoomTo(this.baseZoom, duration * (1 - cfg.OUT_FRACTION), 'Sine.easeIn');
        });
    }

    /** Distance-attenuated shake, so a far-off event does not rattle the frame. */
    shakeFrom(x: number, y: number, intensity: number, duration: number): void {
        const focus = this.camera.worldView;
        const distance = Phaser.Math.Distance.Between(
            x,
            y,
            focus.centerX,
            focus.centerY
        );
        const falloff = Phaser.Math.Clamp(1 - distance / GameConfig.CAMERA.SHAKE_FALLOFF, 0, 1);
        if (falloff <= 0) return;

        this.camera.shake(duration, intensity * falloff);
    }
}
