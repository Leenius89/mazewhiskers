import Phaser from 'phaser';
import { DEPTH } from '../core/depth';
import { viewportOf } from '../core/screenSpace';

const TEXTURE_KEY = 'vignette-radial';
const TEXTURE_SIZE = 512;

/**
 * Screen-space darkening toward the edges.
 *
 * A flat top-down grid reads as a diagram; pulling the corners down gives the
 * frame a centre and makes the city feel like somewhere you are *inside*.
 * Phase 3 drives its strength from how far the redevelopment has progressed.
 */
export class Vignette {
    private readonly scene: Phaser.Scene;
    private readonly image: Phaser.GameObjects.Image;

    constructor(scene: Phaser.Scene, strength = 0.5) {
        this.scene = scene;

        Vignette.ensureTexture(scene);

        this.image = scene.add
            .image(0, 0, TEXTURE_KEY)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(DEPTH.OVERLAY - 1)
            .setAlpha(strength);

        this.resize();
        scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
        scene.events.once('shutdown', () => this.destroy());
    }

    /** Radial gradient baked once into a canvas texture and reused. */
    private static ensureTexture(scene: Phaser.Scene): void {
        if (scene.textures.exists(TEXTURE_KEY)) return;

        const canvasTexture = scene.textures.createCanvas(TEXTURE_KEY, TEXTURE_SIZE, TEXTURE_SIZE);
        if (!canvasTexture) return;

        const ctx = canvasTexture.getContext();
        const half = TEXTURE_SIZE / 2;
        const gradient = ctx.createRadialGradient(half, half, half * 0.35, half, half, half);

        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.65, 'rgba(0,0,0,0.28)');
        gradient.addColorStop(1, 'rgba(6,8,14,0.92)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
        canvasTexture.refresh();
    }

    /**
     * Re-fits to the viewport, including whatever zoom is in effect.
     *
     * Called every frame rather than only on resize, because the jump's
     * camera punch-out changes the zoom without changing the size.
     */
    resize(): void {
        const camera = this.scene.cameras?.main;
        if (!camera || !this.image.active) return;

        const viewport = viewportOf(camera);
        this.image.setPosition(viewport.x, viewport.y);
        this.image.setDisplaySize(viewport.width * viewport.scale, viewport.height * viewport.scale);
    }

    setStrength(strength: number): void {
        this.image.setAlpha(Phaser.Math.Clamp(strength, 0, 1));
    }

    destroy(): void {
        // Runs from both the scene's teardown and its own shutdown hook, so it
        // has to tolerate being called twice and called late.
        this.scene.scale?.off(Phaser.Scale.Events.RESIZE, this.resize, this);
        this.image.destroy();
    }
}
