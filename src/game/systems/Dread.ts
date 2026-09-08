import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import { viewportOf } from '../core/screenSpace';
import type { GameScene } from '../scenes/GameScene';

/**
 * Nightmare's presentation: the same city, remembered wrong.
 *
 * Three things, none of which change a rule. The light goes violet, the
 * picture breathes and now and then tears across, and the soundtrack sags flat
 * and slow. A player who could switch all of it off would finish with exactly
 * the same score.
 *
 * That is deliberate. The setting's actual difficulty is the fog and the
 * closed-in dark, and both of those are quiet — a player two minutes in might
 * reasonably wonder whether anything is different at all. This is the setting
 * saying what it is, immediately and without a line of text.
 *
 * The warp is WebGL only, like the colour grade in Atmosphere; the wash, the
 * tears and the detune all work on the canvas fallback, so the setting still
 * reads as wrong on a machine that cannot run shaders.
 */
export class Dread {
    private readonly scene: GameScene;

    /** Violet over everything, multiplied so it stains rather than fogs. */
    private readonly wash: Phaser.GameObjects.Rectangle;
    /** Horizontal tears, drawn for a few frames at a time. */
    private readonly tear: Phaser.GameObjects.Graphics;

    private barrel: Phaser.FX.Barrel | null = null;
    private glitchUntil = 0;
    private nextGlitchAt = 0;
    private elapsed = 0;

    /** Advanced by rate * delta, so quickening it does not jump the wave. */
    private breath = 0;

    /** Eased, so rounding a corner into the enemy winds up rather than snaps. */
    private nearness = 0;

    constructor(scene: GameScene) {
        this.scene = scene;

        const cfg = GameConfig.DREAD;

        // Fill alpha left at 1 and the strength carried on the object's own
        // alpha instead. Setting both multiplies them together, which is how
        // a wash asked for at 0.42 arrived on screen at 0.18.
        this.wash = scene.add
            .rectangle(0, 0, 1, 1, cfg.TINT)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setAlpha(cfg.TINT_ALPHA)
            .setBlendMode(Phaser.BlendModes.MULTIPLY)
            .setDepth(DEPTH.OVERLAY - 2);

        this.tear = scene.add
            .graphics()
            .setScrollFactor(0)
            .setDepth(DEPTH.OVERLAY - 2);

        // Same guard Atmosphere uses: post-processing is WebGL only, and on the
        // canvas fallback asking for it throws rather than doing nothing.
        if (scene.game.renderer.type === Phaser.WEBGL) {
            this.barrel = scene.cameras.main.postFX.addBarrel(1);
        }

        this.resize();
        scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
        scene.events.once('shutdown', () => this.destroy());
    }

    private resize(): void {
        const camera = this.scene.cameras?.main;
        if (!camera || !this.wash.active) return;

        const viewport = viewportOf(camera);
        this.wash.setPosition(viewport.x, viewport.y);
        this.wash.setSize(viewport.width * viewport.scale, viewport.height * viewport.scale);
    }

    /**
     * @param delta Milliseconds since the last frame, so the breathing is
     *              tied to real time rather than to frame count.
     */
    update(delta: number): void {
        const cfg = GameConfig.DREAD;
        this.elapsed += delta;

        // Everything here gets worse as the black cat closes. The wash is
        // already violet and the picture already breathes; what nearness
        // changes is how fast and how far, which is the difference between a
        // place being wrong and a place coming apart.
        this.nearness = Phaser.Math.Linear(this.nearness, this.scene.enemyNearness, cfg.CLOSING.EASE);
        const panic = this.nearness;

        // Two waves at unrelated periods, so the pulse never settles into a
        // rhythm the player can hold on to. Both quicken together.
        const rush = 1 + panic * cfg.CLOSING.BREATH_RUSH;
        this.breath += (delta / cfg.BREATH_MS) * rush;

        const slow = Math.sin(this.breath);
        const fast = Math.sin(this.breath / 0.37);
        const breath = (slow * 0.65 + fast * 0.35);

        const swing = cfg.TINT_SWING * (1 + panic * cfg.CLOSING.SWING_GAIN);
        this.wash.setAlpha(Math.min(1, cfg.TINT_ALPHA + panic * cfg.CLOSING.TINT_GAIN + breath * swing));

        // Towards red as it arrives: the violet is the setting, the red is the
        // thing in it. They meet in the middle, which is an ugly colour on
        // purpose.
        //
        // `Interpolate` hands back a plain {r,g,b,a}, not a Color — reading
        // `.color` off it gives undefined, and assigning that to fillColor
        // leaves the wash with no colour at all.
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(
            Phaser.Display.Color.ValueToColor(cfg.TINT),
            Phaser.Display.Color.ValueToColor(cfg.CLOSING.TINT_NEAR),
            100,
            Math.round(panic * 100)
        );
        this.wash.fillColor = Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);

        if (this.barrel) {
            const warp = cfg.WARP * (1 + panic * cfg.CLOSING.WARP_GAIN);
            this.barrel.amount = 1 + warp + breath * warp;
        }

        this.updateGlitch(panic);
        this.resize();
    }

    /**
     * Torn bands across the screen, briefly, at intervals that do not repeat.
     *
     * The interval is randomised inside a window rather than fixed: a tear
     * that arrives exactly every four seconds stops being a fault and becomes
     * a metronome, and the player starts waiting for it.
     */
    private updateGlitch(panic: number): void {
        const cfg = GameConfig.DREAD;
        const now = this.elapsed;

        if (now >= this.nextGlitchAt) {
            // The gap collapses as it closes: a fault every four seconds at
            // rest, several a second when the thing is on top of you.
            const squeeze = 1 - panic * cfg.CLOSING.GAP_SQUEEZE;
            this.nextGlitchAt =
                now + Phaser.Math.Between(cfg.GLITCH.GAP_MIN_MS, cfg.GLITCH.GAP_MAX_MS) * squeeze;
            this.glitchUntil = now + Phaser.Math.Between(cfg.GLITCH.HOLD_MIN_MS, cfg.GLITCH.HOLD_MAX_MS);
            this.scene.cameras.main.shake(cfg.GLITCH.SHAKE_MS, cfg.GLITCH.SHAKE * (1 + panic * 2), true);
        }

        this.tear.clear();
        if (now >= this.glitchUntil) return;

        const camera = this.scene.cameras.main;
        const viewport = viewportOf(camera);
        const width = viewport.width * viewport.scale;
        const height = viewport.height * viewport.scale;

        const bands = cfg.GLITCH.BANDS + Math.round(panic * cfg.CLOSING.EXTRA_BANDS);

        for (let band = 0; band < bands; band++) {
            const y = viewport.y + Math.random() * height;
            const thickness = Phaser.Math.Between(cfg.GLITCH.BAND_MIN, cfg.GLITCH.BAND_MAX);
            const reach = cfg.GLITCH.SHIFT * (1 + panic * cfg.CLOSING.SHIFT_GAIN);
            const shift = Phaser.Math.Between(-reach, reach);

            this.tear.fillStyle(cfg.GLITCH.COLORS[band % cfg.GLITCH.COLORS.length], cfg.GLITCH.ALPHA);
            this.tear.fillRect(viewport.x + shift, y, width, thickness);
        }
    }

    destroy(): void {
        this.scene.scale?.off(Phaser.Scale.Events.RESIZE, this.resize, this);
        this.wash.destroy();
        this.tear.destroy();
        this.barrel = null;
    }
}

/**
 * Bends a sound flat and slow, or puts it back.
 *
 * Detune is in cents, so -150 is a semitone and a half — far enough to be
 * unmistakably wrong, near enough that the tune is still recognisably the tune.
 * The rate drag is what makes it sound like it is being played by something
 * tired rather than merely mistuned.
 *
 * Guarded on every property: the Web Audio and HTML5 Audio backings expose
 * different subsets, and a muted run creates a NoAudioSound that has none of
 * them at all.
 */
export const bendSound = (sound: Phaser.Sound.BaseSound | undefined, bent: boolean): void => {
    if (!sound) return;

    const cfg = GameConfig.DREAD.AUDIO;
    const target = sound as Phaser.Sound.BaseSound & { detune?: number; rate?: number };

    try {
        if (typeof target.detune === 'number') target.detune = bent ? cfg.DETUNE : 0;
        if (typeof target.rate === 'number') target.rate = bent ? cfg.RATE : 1;
    } catch {
        // A backing that will not be bent is not worth failing a run over.
    }
};
