import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import type { Vignette } from './Vignette';

/**
 * The look of the city degrades as it is replaced.
 *
 * Colour drains and the frame closes in, so the pressure is felt before it is
 * read off any gauge. This is the one place the theme is expressed purely
 * through presentation rather than rules — which is why it stays subtle: it
 * should register as unease, not as a filter.
 */
export class Atmosphere {
    private readonly scene: Phaser.Scene;
    private readonly vignette: Vignette;
    private colorMatrix: Phaser.FX.ColorMatrix | null = null;
    private applied = -1;

    constructor(scene: Phaser.Scene, vignette: Vignette) {
        this.scene = scene;
        this.vignette = vignette;

        // Post-processing is WebGL only; on the Canvas fallback the vignette
        // carries the effect alone rather than the page erroring out.
        if (scene.game.renderer.type === Phaser.WEBGL) {
            this.colorMatrix = scene.cameras.main.postFX.addColorMatrix();
        }
    }

    /** `development` is 0 to 1. Cheap to call every frame; only acts on change. */
    setDevelopment(development: number): void {
        const progress = Phaser.Math.Clamp(development, 0, 1);
        if (Math.abs(progress - this.applied) < 0.005) return;
        this.applied = progress;

        const { VIGNETTE, SATURATION } = GameConfig.ATMOSPHERE;
        this.vignette.setStrength(Phaser.Math.Linear(VIGNETTE.FROM, VIGNETTE.TO, progress));
        this.colorMatrix?.saturate(Phaser.Math.Linear(SATURATION.FROM, SATURATION.TO, progress), false);
    }

    destroy(): void {
        if (!this.colorMatrix) return;
        this.colorMatrix = null;

        // The camera manager is already torn down when a scene restarts, so the
        // main camera can be gone by the time this runs. Clearing is equivalent
        // to removing ours — this system is the only thing that attaches FX —
        // and `remove` does not accept a ColorMatrix in Phaser's own typings.
        this.scene.cameras?.main?.postFX?.clear();
    }
}
