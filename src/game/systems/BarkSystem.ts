import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH } from '../core/depth';
import { barkWrapWidth, fontPx, uiScale } from '../core/uiScale';
import type { GameScene } from '../scenes/GameScene';

/** Anything that can hold a bubble over its head. */
interface Speaker {
    x: number;
    y: number;
    displayHeight: number;
    active: boolean;
}

/**
 * Higher wins. A line already on screen is never interrupted by a quieter one,
 * so the panic shout cannot be talked over by an idle grumble.
 */
const PRIORITY = {
    AMBIENT: 1,
    REACTION: 2,
    SCRIPTED: 3
} as const;

/**
 * One black bubble, following one head.
 *
 * Positioned at the tail tip — the point just above the speaker — and drawn
 * upward from there, so the pop-in scale grows out of the head rather than out
 * of the middle of the text.
 */
class Bubble {
    private readonly container: Phaser.GameObjects.Container;
    private readonly box: Phaser.GameObjects.Graphics;
    private readonly label: Phaser.GameObjects.Text;

    private speaker: Speaker | null = null;
    private tween: Phaser.Tweens.Tween | null = null;
    private hide: Phaser.Time.TimerEvent | null = null;

    /** Size of the drawn box, needed to fit it into the view. */
    private boxWidth = 0;
    private boxHeight = 0;
    /** Drawn under the speaker instead of over it. See `follow`. */
    private flipped = false;

    /** Priority of the line currently showing; 0 when the bubble is idle. */
    private priority = 0;
    /** Interface scale the type was last sized for. */
    private appliedScale = 0;

    constructor(private readonly scene: GameScene, colour: string) {
        const cfg = GameConfig.BARKS;

        this.box = scene.add.graphics();
        this.label = scene.add
            .text(0, -cfg.TAIL - cfg.PADDING.Y, '', {
                fontFamily: "'Pretendard', sans-serif",
                fontSize: fontPx(cfg.FONT_SIZE, scene.cameras.main),
                color: colour,
                align: 'center',
                wordWrap: { width: barkWrapWidth(scene.cameras.main) }
            })
            .setOrigin(0.5, 1);

        this.container = scene.add
            .container(0, 0, [this.box, this.label])
            .setDepth(DEPTH.OVERLAY - 10)
            .setVisible(false);
    }

    get busy(): boolean {
        return this.container.visible;
    }

    get level(): number {
        return this.priority;
    }

    say(speaker: Speaker, text: string, priority: number): void {
        const cfg = GameConfig.BARKS;
        const camera = this.scene.cameras.main;

        // Re-sized per line rather than once at construction, so a rotated phone
        // does not keep type meant for the screen it used to be.
        const scale = uiScale(camera);
        if (scale !== this.appliedScale) {
            this.appliedScale = scale;
            this.label.setFontSize(fontPx(cfg.FONT_SIZE, camera));
            this.label.setWordWrapWidth(barkWrapWidth(camera));
        }

        this.speaker = speaker;
        this.priority = priority;

        this.tween?.remove();
        this.hide?.remove();

        this.label.setText(text);
        this.flipped = false;
        this.draw();
        this.follow();

        this.container.setVisible(true).setAlpha(0).setScale(0.8);
        this.tween = this.scene.tweens.add({
            targets: this.container,
            alpha: 1,
            scale: 1,
            duration: cfg.FADE_MS,
            ease: 'Back.easeOut'
        });

        const hold = Math.min(cfg.HOLD_BASE_MS + text.length * cfg.HOLD_PER_CHAR_MS, cfg.MAX_HOLD_MS);
        this.hide = this.scene.time.delayedCall(hold, () => this.dismiss());
    }

    /** Fades out and releases the priority slot. */
    dismiss(): void {
        if (!this.container.visible) return;

        this.tween?.remove();
        this.tween = this.scene.tweens.add({
            targets: this.container,
            alpha: 0,
            duration: GameConfig.BARKS.FADE_MS,
            onComplete: () => {
                this.container.setVisible(false);
                this.priority = 0;
                this.speaker = null;
            }
        });
    }

    /** Cut off without a fade — the dialogue box is taking the screen. */
    silence(): void {
        this.tween?.remove();
        this.hide?.remove();
        this.container.setVisible(false);
        this.priority = 0;
        this.speaker = null;
    }

    /**
     * Sits over the head, or under it when there is no room over it.
     *
     * The run starts in the top-left corner of the map, where the camera cannot
     * scroll any further up — a bubble drawn above the cat there is simply off
     * screen, which would have made the first line of the game invisible.
     */
    follow(): void {
        const speaker = this.speaker;
        if (!speaker || !this.container.visible) return;

        // The speaker can die or be despawned mid-line.
        if (!speaker.active) {
            this.silence();
            return;
        }

        const cfg = GameConfig.BARKS;
        const camera = this.scene.cameras.main;
        const above = speaker.y - speaker.displayHeight - cfg.OFFSET_Y;
        const flipped = above - cfg.TAIL - this.boxHeight < camera.scrollY + cfg.EDGE_MARGIN;

        if (flipped !== this.flipped) {
            this.flipped = flipped;
            this.draw();
        }

        const y = flipped ? speaker.y + cfg.OFFSET_Y_BELOW : above;
        this.container.setPosition(this.fitOnScreen(speaker.x, y, camera), y);
    }

    /**
     * Keeps the whole bubble inside the view.
     *
     * On a phone the bubble is half the width of the screen, so a speaker
     * anywhere near an edge would have had its line cut off by it. Clamped
     * after the HUD dodge, because staying on screen matters more than
     * clearing the minimap.
     */
    private fitOnScreen(x: number, y: number, camera: Phaser.Cameras.Scene2D.Camera): number {
        const view = camera.worldView;
        const margin = GameConfig.BARKS.EDGE_MARGIN / (camera.zoom || 1);
        const half = this.boxWidth / 2;

        const dodged = this.dodgeHud(x, y, camera);

        // A bubble wider than the view cannot satisfy both edges; centre it.
        if (half * 2 + margin * 2 >= view.width) return view.centerX;

        return Phaser.Math.Clamp(dodged, view.left + margin + half, view.right - margin - half);
    }

    /**
     * Slides left rather than sitting under the minimap.
     *
     * The bubbles live in the world and the HUD is pinned to the screen, so the
     * two cross whenever the speaker walks into the top-right corner of the
     * view — and the HUD, drawn later, wins. Rather than fight over depth the
     * bubble simply steps out of the way, which also keeps it on screen.
     */
    private dodgeHud(x: number, y: number, camera: Phaser.Cameras.Scene2D.Camera): number {
        const reserved = this.scene.hud?.reservedScreenRect;
        if (!reserved || reserved.width <= 0) return x;

        const zoom = camera.zoom || 1;
        // Screen pixels map into the world at 1/zoom around the camera's view.
        const view = camera.worldView;
        const left = view.x + reserved.left / zoom;
        const bottom = view.y + reserved.bottom / zoom;
        const top = view.y + reserved.top / zoom;

        const boxTop = this.flipped ? y : y - GameConfig.BARKS.TAIL - this.boxHeight;
        const boxBottom = this.flipped ? y + GameConfig.BARKS.TAIL + this.boxHeight : y;

        // Only a bubble that actually shares rows with the HUD needs to move.
        if (boxBottom < top || boxTop > bottom) return x;

        const halfWidth = this.boxWidth / 2;
        const rightmost = left - GameConfig.BARKS.EDGE_MARGIN / zoom - halfWidth;

        return Math.min(x, rightmost);
    }

    private draw(): void {
        const cfg = GameConfig.BARKS;
        const width = this.label.width + cfg.PADDING.X * 2;
        const height = this.label.height + cfg.PADDING.Y * 2;
        // Positive is downward, so flipping is a sign change on everything.
        const direction = this.flipped ? -1 : 1;

        this.boxWidth = width;
        this.boxHeight = height;
        this.label.setY(direction * -(cfg.TAIL + cfg.PADDING.Y) + (this.flipped ? height : 0));

        this.box.clear();
        this.box.fillStyle(cfg.BOX_COLOR, cfg.BOX_ALPHA);
        this.box.fillRoundedRect(
            -width / 2,
            this.flipped ? cfg.TAIL : -cfg.TAIL - height,
            width,
            height,
            cfg.CORNER
        );

        // Tail: a small wedge from the bubble back to the head.
        this.box.fillTriangle(
            -cfg.TAIL,
            direction * -cfg.TAIL,
            cfg.TAIL,
            direction * -cfg.TAIL,
            0,
            0
        );
    }

    destroy(): void {
        this.tween?.remove();
        this.hide?.remove();
        this.container.destroy();
    }
}

/**
 * The cat thinks out loud, and the machine answers.
 *
 * The game says everything important through a dialogue box that stops play,
 * which is right for the beats that matter and far too heavy for everything
 * else. These are the everything else: a grumble about rent while wandering, a
 * swear when the black cat rounds the corner, a taunt back. They never pause the
 * game, never take input and never need dismissing — a bubble over the head that
 * fades on its own.
 *
 * They also carry the story cheaply. A tower landing is a sprite until the cat
 * says what it means, and there is no room in the tutorial for that line.
 *
 * Nothing here speaks over the dialogue box: `update` silences every bubble
 * while a scripted beat owns the screen.
 */
export class BarkSystem {
    private readonly scene: GameScene;
    private readonly playerBubble: Bubble;
    private readonly enemyBubble: Bubble;

    private nextAmbientAt = 0;
    private nextPanicAt = 0;
    private nextTauntAt = 0;
    private seenRedevelopment = false;

    constructor(scene: GameScene) {
        this.scene = scene;

        const cfg = GameConfig.BARKS;
        this.playerBubble = new Bubble(scene, cfg.TEXT_COLOR);
        this.enemyBubble = new Bubble(scene, cfg.ENEMY_TEXT_COLOR);
    }

    /** The first block landing is the one that gets the scripted line. */
    redevelopment(): void {
        const lines = GameConfig.BARKS.LINES;

        if (!this.seenRedevelopment) {
            this.seenRedevelopment = true;
            this.sayPlayer(lines.FIRST_TOWER, PRIORITY.SCRIPTED);
            return;
        }

        this.sayPlayer(Phaser.Utils.Array.GetRandom(lines.TOWER), PRIORITY.REACTION);
    }

    /** Took a hit from the machine. */
    hurt(): void {
        this.sayPlayer(Phaser.Utils.Array.GetRandom(GameConfig.BARKS.LINES.HURT), PRIORITY.REACTION);
    }

    update(time: number): void {
        // A scripted beat owns the screen; two boxes of text at once reads as a bug.
        if (this.scene.narrativeActive || this.scene.state.hasEnded()) {
            this.playerBubble.silence();
            this.enemyBubble.silence();
            return;
        }

        this.playerBubble.follow();
        this.enemyBubble.follow();

        const threat = this.nearestEnemy();

        if (threat) {
            this.panic(time, threat.distance);
            this.taunt(time, threat.enemy, threat.distance);
        }

        this.ambient(time, threat?.distance ?? Infinity);
    }

    /** Panic when the black cat is close, at most every few seconds. */
    private panic(time: number, distance: number): void {
        const cfg = GameConfig.BARKS;
        if (distance > cfg.PANIC_DISTANCE || time < this.nextPanicAt) return;

        this.nextPanicAt = time + cfg.PANIC_COOLDOWN_MS;
        this.sayPlayer(Phaser.Utils.Array.GetRandom(cfg.LINES.PANIC), PRIORITY.REACTION);
    }

    private taunt(time: number, enemy: Speaker, distance: number): void {
        const cfg = GameConfig.BARKS;
        if (distance > cfg.TAUNT_DISTANCE || time < this.nextTauntAt) return;

        this.nextTauntAt = time + cfg.TAUNT_COOLDOWN_MS;
        this.say(this.enemyBubble, enemy, Phaser.Utils.Array.GetRandom(cfg.LINES.TAUNT), PRIORITY.REACTION);
    }

    /**
     * Idle chatter while nothing is happening.
     *
     * Rolled rather than fired, so the cat is talkative without being metronomic
     * — and skipped entirely while something is chasing it, where the panic
     * lines are the ones worth hearing.
     */
    private ambient(time: number, threatDistance: number): void {
        const cfg = GameConfig.BARKS;
        if (time < this.nextAmbientAt) return;

        this.nextAmbientAt = time + cfg.AMBIENT_INTERVAL_MS;

        if (threatDistance <= cfg.PANIC_DISTANCE) return;
        if (Math.random() > cfg.AMBIENT_CHANCE) return;

        this.sayPlayer(Phaser.Utils.Array.GetRandom(cfg.LINES.IDLE), PRIORITY.AMBIENT);
    }

    private nearestEnemy(): { enemy: Speaker; distance: number } | null {
        const player = this.scene.player;
        if (!player) return null;

        let closest: Speaker | null = null;
        let distance = Infinity;

        for (const enemy of this.scene.enemies) {
            if (!enemy.active) continue;

            const gap = Phaser.Math.Distance.Between(player.x, player.groundY, enemy.x, enemy.groundY);
            if (gap < distance) {
                distance = gap;
                closest = enemy;
            }
        }

        return closest ? { enemy: closest, distance } : null;
    }

    private sayPlayer(text: string, priority: number): void {
        const player = this.scene.player;
        if (player) this.say(this.playerBubble, player, text, priority);
    }

    private say(bubble: Bubble, speaker: Speaker, text: string, priority: number): void {
        // Never talk over something more urgent that is still on screen.
        if (bubble.busy && bubble.level > priority) return;

        bubble.say(speaker, text, priority);
    }

    destroy(): void {
        this.playerBubble.destroy();
        this.enemyBubble.destroy();
    }
}
