import Phaser from 'phaser';
import { DEPTH } from '../core/depth';
import { viewportOf } from '../core/screenSpace';

const TEXTURE_SIZE = 512;

/**
 * Where the gradient's stops sit, at the two extremes of tightness.
 *
 * `open` is the ordinary frame: clear well past a third of the way out, and
 * never quite black even in the corners. `closed` is nightmare's, where the
 * clear circle is barely wider than the cat and the dark is total two
 * streets away — the difference between a frame around the picture and a
 * limit on how far you can see.
 */
const STOPS = {
    open: { clear: 0.35, mid: 0.65, midAlpha: 0.28, edgeAlpha: 0.92 },
    closed: { clear: 0.08, mid: 0.34, midAlpha: 0.72, edgeAlpha: 1 }
};

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

    /**
     * @param tightness 0 for the ordinary frame, 1 for as far in as it goes.
     */
    constructor(scene: Phaser.Scene, strength = 0.5, tightness = 0) {
        this.scene = scene;

        const key = Vignette.ensureTexture(scene, tightness);

        this.image = scene.add
            .image(0, 0, key)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(DEPTH.OVERLAY - 1)
            .setAlpha(strength);

        this.resize();
        scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
        scene.events.once('shutdown', () => this.destroy());
    }

    /**
     * Radial gradient baked once per tightness into a canvas texture.
     *
     * Keyed by the value it was baked with, because the stops are in the
     * pixels: a scene that wants a tighter one cannot be handed the cached
     * open one. Two settings in practice, so two textures at most.
     */
    private static ensureTexture(scene: Phaser.Scene, tightness: number): string {
        const amount = Phaser.Math.Clamp(tightness, 0, 1);
        const key = `vignette-radial-${amount.toFixed(2)}`;
        if (scene.textures.exists(key)) return key;

        const canvasTexture = scene.textures.createCanvas(key, TEXTURE_SIZE, TEXTURE_SIZE);
        if (!canvasTexture) return key;

        const at = (from: number, to: number) => Phaser.Math.Linear(from, to, amount);
        const clear = at(STOPS.open.clear, STOPS.closed.clear);
        const mid = at(STOPS.open.mid, STOPS.closed.mid);
        const midAlpha = at(STOPS.open.midAlpha, STOPS.closed.midAlpha);
        const edgeAlpha = at(STOPS.open.edgeAlpha, STOPS.closed.edgeAlpha);

        const ctx = canvasTexture.getContext();
        const half = TEXTURE_SIZE / 2;
        const gradient = ctx.createRadialGradient(half, half, half * clear, half, half, half);

        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(mid, `rgba(0,0,0,${midAlpha})`);
        gradient.addColorStop(1, `rgba(6,8,14,${edgeAlpha})`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
        canvasTexture.refresh();

        return key;
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
