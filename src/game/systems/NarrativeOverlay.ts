import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import { pinToScreen, viewportOf } from '../core/screenSpace';
import { fontPx, uiScale } from '../core/uiScale';
import type { GameScene } from '../scenes/GameScene';

export interface SpotlightTarget {
    /** World position to cut a hole around. */
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BeatOptions {
    /** Keeps the health bar on screen for a beat that is talking about it. */
    showStatusBar?: boolean;
    /** Who is speaking. Shown above the line. */
    speaker?: string;
    /** World rectangle to cut out of the dimming. */
    spotlight?: SpotlightTarget | null;
    /**
     * The object being talked about.
     *
     * Lifted above the buildings for the duration of the beat. A spotlight on a
     * fish that a tower happens to be standing in front of explains nothing —
     * the hole in the darkness was there, but the fish was not.
     */
    subject?: Phaser.GameObjects.Sprite | null;
    /** Pan the camera here before the line starts. */
    lookAt?: { x: number; y: number } | null;
    /** Skip waiting for input and continue after this long instead. */
    autoAdvanceMs?: number;
}

/**
 * The game speaking directly to the player.
 *
 * Used for the opening tutorial and for the enemy's entrance. Both need the same
 * three things, so they share one implementation: darken everything except the
 * thing being talked about, type the line out rather than dumping it, and wait
 * for the player to acknowledge before moving on.
 *
 * A wall of explanatory text before the game starts is the thing this replaces.
 * Nobody reads it, and it describes systems the player has not seen yet — a
 * spotlight on the actual fish, with the camera looking at it, does not have
 * that problem.
 */
export class NarrativeOverlay {
    private readonly scene: GameScene;

    /** Dimming plus the cut-out, in screen space. */
    private readonly shade: Phaser.GameObjects.Graphics;
    /** Leader line from the box to the highlighted thing. */
    private readonly pointer: Phaser.GameObjects.Graphics;
    private readonly box: Phaser.GameObjects.Graphics;
    private readonly speakerText: Phaser.GameObjects.Text;
    private readonly bodyText: Phaser.GameObjects.Text;
    private readonly measure: Phaser.GameObjects.Text;
    private readonly hintText: Phaser.GameObjects.Text;
    private readonly skipText: Phaser.GameObjects.Text;

    private activeSpotlight: SpotlightTarget | null = null;
    private liftedSubject: Phaser.GameObjects.Sprite | null = null;
    private liftedDepth = 0;
    private waitingForInput = false;
    private skipped = false;

    /**
     * The whole line, kept so the box can be sized before it is typed.
     *
     * Measuring the visible text instead would grow the box one line at a
     * time as the typewriter ran, which reads as the interface twitching.
     */
    private fullText = '';
    private measureKey = '';
    private measuredHeight = 0;
    /** Top edge of the box as last drawn; the pointer aims at it. */
    private boxTop = 0;
    /** Interface scale the type was last sized for. See `resizeText`. */
    private appliedScale = 0;
    /** Camera bounds set aside while a beat tours the map. See `releaseBounds`. */
    private savedBounds: Phaser.Geom.Rectangle | null = null;
    private resolveWait: (() => void) | null = null;
    private typingEvent: Phaser.Time.TimerEvent | null = null;

    constructor(scene: GameScene) {
        this.scene = scene;
        const cfg = GameConfig.NARRATIVE;
        const camera = scene.cameras.main;

        this.shade = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.OVERLAY + 100);
        this.pointer = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.OVERLAY + 101);
        this.box = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.OVERLAY + 102);

        this.speakerText = scene.add
            .text(0, 0, '', {
                fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                fontSize: fontPx(10, camera),
                color: cfg.SPEAKER_COLOR
            })
            .setScrollFactor(0)
            .setDepth(DEPTH.OVERLAY + 103);

        this.bodyText = scene.add
            .text(0, 0, '', {
                fontFamily: "'Pretendard', sans-serif",
                fontSize: fontPx(15, camera),
                color: cfg.TEXT_COLOR,
                lineSpacing: 7,
                wordWrap: { width: 100 }
            })
            .setScrollFactor(0)
            .setDepth(DEPTH.OVERLAY + 103);

        // Never drawn. It exists only so the finished line can be measured while
        // the visible one is still being typed.
        this.measure = scene.add
            .text(0, 0, '', {
                fontFamily: "'Pretendard', sans-serif",
                fontSize: fontPx(15, camera),
                color: cfg.TEXT_COLOR,
                lineSpacing: 7,
                wordWrap: { width: 100 }
            })
            .setVisible(false)
            .setActive(false);

        this.hintText = scene.add
            .text(0, 0, '', {
                fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
                fontSize: fontPx(8, camera),
                color: cfg.HINT_COLOR
            })
            .setOrigin(1, 1)
            .setScrollFactor(0)
            .setDepth(DEPTH.OVERLAY + 103);

        // Skipping has to be reachable without reading every line first — a
        // returning player should not have to sit through the introduction.
        // It sits just above the dialogue box, where the player is already
        // looking; in the far top corner at eight grey pixels it was, in
        // practice, invisible.
        this.skipText = scene.add
            .text(0, 0, 'SKIP ▸', {
                fontFamily: "'Press Start 2P', monospace",
                fontSize: fontPx(parseInt(cfg.SKIP_SIZE, 10), camera),
                color: cfg.SKIP_COLOR,
                backgroundColor: 'rgba(11,13,19,0.92)',
                padding: { x: 11, y: 8 }
            })
            .setOrigin(1, 1)
            .setScrollFactor(0)
            .setDepth(DEPTH.OVERLAY + 104)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.requestSkip());

        this.setVisible(false);
    }

    /** True once the player has asked to stop being talked to. */
    get wasSkipped(): boolean {
        return this.skipped;
    }

    /**
     * Abandons the rest of the sequence.
     *
     * Resolves whatever beat is waiting so the caller's `await` chain unwinds;
     * each beat then checks `wasSkipped` and returns early.
     */
    requestSkip(): void {
        this.skipped = true;
        this.acknowledge();
    }

    get isWaiting(): boolean {
        return this.waitingForInput;
    }

    private setVisible(visible: boolean): void {
        this.shade.setVisible(visible);
        this.pointer.setVisible(visible);
        this.box.setVisible(visible);
        this.speakerText.setVisible(visible);
        this.bodyText.setVisible(visible);
        this.hintText.setVisible(visible);
        this.skipText.setVisible(visible);
    }

    /**
     * Plays one beat and resolves when the player has acknowledged it.
     *
     * The caller decides what to do next, so a sequence is just an `await` list.
     */
    async play(text: string, options: BeatOptions = {}): Promise<void> {
        if (this.skipped) return;

        this.scene.narrativeActive = true;
        this.scene.narrativeShowsStatus = options.showStatusBar ?? false;
        this.activeSpotlight = options.spotlight ?? null;

        // Cleared before the box is shown. Leaving the previous line in place
        // meant the enemy's entrance opened on the last thing the tutorial had
        // said, for as long as the camera took to get there.
        this.speakerText.setText(options.speaker ?? '');
        this.bodyText.setText('');
        this.hintText.setText('');
        this.fullText = text;

        this.setVisible(true);
        this.lift(options.subject ?? null);

        if (options.lookAt) {
            await this.panTo(options.lookAt.x, options.lookAt.y);
        }

        await this.typeOut(text);

        if (options.autoAdvanceMs) {
            await this.wait(options.autoAdvanceMs);
        } else {
            await this.waitForAcknowledgement();
        }
    }

    /** Raises the subject clear of anything that would hide it, then restores it. */
    private lift(subject: Phaser.GameObjects.Sprite | null): void {
        this.drop();
        if (!subject || !subject.active) return;

        this.liftedSubject = subject;
        this.liftedDepth = subject.depth;
        subject.setDepth(DEPTH.OVERLAY + 90);
    }

    private drop(): void {
        if (!this.liftedSubject) return;
        if (this.liftedSubject.active) this.liftedSubject.setDepth(this.liftedDepth);
        this.liftedSubject = null;
    }

    /** Ends the sequence and hands the world back. */
    finish(): void {
        this.scene.narrativeShowsStatus = false;
        this.restoreBounds();
        this.drop();
        this.skipped = false;
        this.stopTyping();
        this.waitingForInput = false;
        this.resolveWait = null;
        this.activeSpotlight = null;
        this.setVisible(false);
        this.scene.narrativeActive = false;
    }

    private wait(ms: number): Promise<void> {
        return new Promise((resolve) => this.scene.time.delayedCall(ms, resolve));
    }

    private panTo(x: number, y: number): Promise<void> {
        return new Promise((resolve) => {
            const camera = this.scene.cameras.main;
            const duration = GameConfig.NARRATIVE.PAN_MS;

            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
            };

            this.scene.cameraDirector?.setEnabled(false);
            camera.stopFollow();

            // Bounds are dropped for the duration of the tour.
            //
            // The run starts in the top-left corner of the map, so a camera held
            // inside the world could not actually centre on the cat there — the
            // beat that explains the health bar pointed at a spotlight stuck in
            // the corner of the screen, half of it off the edge.
            this.releaseBounds();

            // force = true. Phaser drops a pan requested while another is still
            // running and never calls its callback, and the opening fly-over is
            // still technically in flight when it announces that it finished —
            // which left the tutorial waiting on a promise nothing would resolve.
            camera.pan(x, y, duration, 'Sine.easeInOut', true, (_cam, progress) => {
                if (progress === 1) finish();
            });

            // A soft-locked tutorial on an unattended kiosk is unrecoverable, so
            // the sequence never depends on a camera effect to move it along.
            this.scene.time.delayedCall(duration + 250, finish);
        });
    }

    /**
     * Lets the camera leave the world for the length of a scripted beat.
     *
     * Remembered rather than recomputed, so `restoreBounds` puts back exactly
     * what the scene set up.
     */
    private releaseBounds(): void {
        const camera = this.scene.cameras.main;
        if (this.savedBounds) return;

        this.savedBounds = camera.getBounds();
        camera.removeBounds();
    }

    /** Puts the camera back inside the world. */
    restoreBounds(): void {
        const camera = this.scene.cameras?.main;
        if (!camera || !this.savedBounds) return;

        const b = this.savedBounds;
        this.savedBounds = null;
        camera.setBounds(b.x, b.y, b.width, b.height);
    }

    /** Returns the camera to the player and re-enables the follow director. */
    returnToPlayer(): Promise<void> {
        const player = this.scene.player;
        if (!player) return Promise.resolve();

        return new Promise((resolve) => {
            const camera = this.scene.cameras.main;
            const duration = GameConfig.NARRATIVE.PAN_MS;
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                camera.startFollow(player, true);
                this.scene.cameraDirector?.setEnabled(true);
                resolve();
            };

            camera.pan(player.x, player.y, duration, 'Sine.easeInOut', true, (_c, progress) => {
                if (progress === 1) finish();
            });
            this.scene.time.delayedCall(duration + 250, finish);
        });
    }

    private stopTyping(): void {
        this.typingEvent?.remove();
        this.typingEvent = null;
    }

    /** One character at a time, so the line arrives rather than appears. */
    private typeOut(text: string): Promise<void> {
        this.stopTyping();
        this.bodyText.setText('');

        return new Promise((resolve) => {
            let index = 0;
            this.typingEvent = this.scene.time.addEvent({
                delay: GameConfig.NARRATIVE.TYPE_MS,
                repeat: text.length - 1,
                callback: () => {
                    index++;
                    this.bodyText.setText(text.slice(0, index));
                    if (index >= text.length) {
                        this.typingEvent = null;
                        resolve();
                    }
                }
            });
        });
    }

    private waitForAcknowledgement(): Promise<void> {
        return new Promise((resolve) => {
            this.waitingForInput = true;
            this.resolveWait = resolve;
        });
    }

    /** Called by the scene when the player presses or clicks. */
    acknowledge(): void {
        if (!this.waitingForInput) return;
        this.waitingForInput = false;
        const resolve = this.resolveWait;
        this.resolveWait = null;
        resolve?.();
    }

    /**
     * Redraws in screen space every frame.
     *
     * The spotlight is given in world coordinates and converted here, so it keeps
     * tracking its subject while the camera moves.
     */
    update(time: number): void {
        if (!this.scene.narrativeActive) return;

        const camera = this.scene.cameras.main;
        const cfg = GameConfig.NARRATIVE;

        // Pinned every frame: the camera zoom moves under the overlay during a
        // jump, and a dimming layer that does not cover the screen is worse
        // than no dimming at all.
        const viewport = viewportOf(camera);
        [this.shade, this.pointer, this.box, this.speakerText, this.bodyText, this.hintText, this.skipText].forEach(
            (layer) => pinToScreen(layer, viewport)
        );

        const width = viewport.width;
        const height = viewport.height;

        this.drawShade(camera, width, height, time);
        this.drawBox(width, height, cfg);
    }

    /** Four rectangles around the hole, rather than a mask — cheap and exact. */
    private drawShade(
        camera: Phaser.Cameras.Scene2D.Camera,
        width: number,
        height: number,
        time: number
    ): void {
        const cfg = GameConfig.NARRATIVE;
        this.shade.clear();
        this.pointer.clear();
        this.shade.fillStyle(cfg.SHADE_COLOR, cfg.SHADE_ALPHA);

        const spot = this.activeSpotlight;
        if (!spot) {
            this.shade.fillRect(0, 0, width, height);
            return;
        }

        const zoom = camera.zoom;
        const cx = (spot.x - camera.worldView.x) * zoom;
        const cy = (spot.y - camera.worldView.y) * zoom;
        const halfW = (spot.width / 2) * zoom + cfg.SPOTLIGHT_PADDING;
        const halfH = (spot.height / 2) * zoom + cfg.SPOTLIGHT_PADDING;

        const left = cx - halfW;
        const right = cx + halfW;
        const top = cy - halfH;
        const bottom = cy + halfH;

        this.shade.fillRect(0, 0, width, Math.max(0, top));
        this.shade.fillRect(0, Math.min(height, bottom), width, height);
        this.shade.fillRect(0, Math.max(0, top), Math.max(0, left), Math.max(0, bottom - top));
        this.shade.fillRect(Math.min(width, right), Math.max(0, top), width, Math.max(0, bottom - top));

        // Pulsing frame, so the eye lands on the hole rather than the darkness.
        const pulse = 0.65 + 0.35 * Math.sin((time / cfg.PULSE_MS) * Math.PI * 2);
        this.pointer.lineStyle(2, cfg.HIGHLIGHT_COLOR, pulse);
        this.pointer.strokeRect(left, top, right - left, bottom - top);

        this.drawCorners(left, top, right, bottom, cfg.HIGHLIGHT_COLOR);
        this.pointer.lineStyle(1, cfg.HIGHLIGHT_COLOR, 0.5 * pulse);
        this.pointer.lineBetween(cx, bottom, cx, this.boxTop - 6);
    }

    /** Corner ticks read as a viewfinder rather than a plain box. */
    private drawCorners(left: number, top: number, right: number, bottom: number, color: number): void {
        const k = uiScale(this.scene.cameras.main);
        const arm = 10 * k;
        this.pointer.lineStyle(3 * k, color, 1);
        this.pointer.lineBetween(left, top, left + arm, top);
        this.pointer.lineBetween(left, top, left, top + arm);
        this.pointer.lineBetween(right, top, right - arm, top);
        this.pointer.lineBetween(right, top, right, top + arm);
        this.pointer.lineBetween(left, bottom, left + arm, bottom);
        this.pointer.lineBetween(left, bottom, left, bottom - arm);
        this.pointer.lineBetween(right, bottom, right - arm, bottom);
        this.pointer.lineBetween(right, bottom, right, bottom - arm);
    }

    /**
     * Height of the full line at this width, measured once and remembered.
     *
     * A separate, invisible Text carries the whole sentence so the visible
     * one can stay mid-typewriter while the box is sized for the finished
     * line. Re-measured only when the line or the width actually changes.
     */
    private bodyHeightFor(wrapWidth: number): number {
        const key = `${Math.round(wrapWidth)}|${this.fullText}`;
        if (key === this.measureKey) return this.measuredHeight;

        this.measure.setWordWrapWidth(wrapWidth);
        this.measure.setText(this.fullText);

        this.measureKey = key;
        this.measuredHeight = this.measure.height;
        return this.measuredHeight;
    }

    /**
     * Re-sizes the type when the screen the game is on changes.
     *
     * Fonts were chosen once, in the constructor, against whatever the camera
     * happened to be then — so a phone rotated into landscape, or a canvas that
     * had not settled at construction time, kept type sized for a screen it is
     * no longer on.
     */
    private resizeText(): void {
        const scale = uiScale(this.scene.cameras.main);
        if (scale === this.appliedScale) return;
        this.appliedScale = scale;

        const camera = this.scene.cameras.main;
        this.speakerText.setFontSize(fontPx(10, camera));
        this.bodyText.setFontSize(fontPx(15, camera));
        this.measure.setFontSize(fontPx(15, camera));
        this.hintText.setFontSize(fontPx(8, camera));
        this.skipText.setFontSize(fontPx(parseInt(GameConfig.NARRATIVE.SKIP_SIZE, 10), camera));

        // The cached measurement was taken at the old size.
        this.measureKey = '';
    }

    private drawBox(width: number, height: number, cfg: typeof GameConfig.NARRATIVE): void {
        this.resizeText();

        // Every length here is a device pixel, so all of them ride the interface
        // scale rather than only the type inside them.
        const k = uiScale(this.scene.cameras.main);
        const margin = cfg.BOX_MARGIN * k;
        const padding = cfg.PADDING_X * k;
        const boxWidth = Math.min(width - margin * 2, cfg.BOX_MAX_WIDTH * k);
        // Centred once it stops filling the width.
        const left = (width - boxWidth) / 2;

        // Wrapped first: the box is measured from the text, so the text has to
        // know how wide it may be before anything can be sized.
        const wrapWidth = boxWidth - padding * 2;
        this.bodyText.setWordWrapWidth(wrapWidth);

        const bodyTop = (this.speakerText.text ? cfg.BODY_TOP_WITH_SPEAKER : cfg.BODY_TOP) * k;
        const boxHeight = Math.max(
            cfg.BOX_MIN_HEIGHT * k,
            bodyTop + this.bodyHeightFor(wrapWidth) + cfg.HINT_ROOM * k
        );
        const top = height - boxHeight - margin;
        this.boxTop = top;

        this.box.clear();
        this.box.fillStyle(cfg.BOX_COLOR, cfg.BOX_ALPHA);
        this.box.fillRect(left, top, boxWidth, boxHeight);
        this.box.lineStyle(2 * k, cfg.HIGHLIGHT_COLOR, 0.9);
        this.box.strokeRect(left, top, boxWidth, boxHeight);

        this.speakerText.setPosition(left + padding, top + 12 * k);
        this.bodyText.setPosition(left + padding, top + bodyTop);

        this.hintText.setPosition(left + boxWidth - 12 * k, top + boxHeight - 8 * k);
        this.hintText.setText(this.waitingForInput ? '▸ ENTER / CLICK' : '');

        this.skipText.setPosition(left + boxWidth, top - cfg.SKIP_GAP * k);
    }

    destroy(): void {
        this.stopTyping();
        this.shade.destroy();
        this.pointer.destroy();
        this.box.destroy();
        this.measure.destroy();
        this.speakerText.destroy();
        this.bodyText.destroy();
        this.hintText.destroy();
        this.skipText.destroy();
    }
}
