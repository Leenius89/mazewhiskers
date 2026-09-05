import Phaser from 'phaser';
import { TEXT, fontPx, ui } from '../core/uiScale';
import { t } from '../../i18n';

/** How long the ending holds the screen before it can be skipped. */
const SKIP_AFTER_MS = 3000;

export const showEndingMessages = async (
    scene: Phaser.Scene,
    width: number,
    height: number
): Promise<{ texts: Phaser.GameObjects.Text[] }> => {
    const messages = ['ending.1', 'ending.2', 'ending.3', 'ending.4', 'ending.5'].map(t);

    const camera = scene.cameras.main;

    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: "'Pretendard', sans-serif",
        fontSize: fontPx(16, camera, TEXT.PROSE),
        color: '#ffffff',
        align: 'center',
        fixedWidth: width * 0.8,
        wordWrap: { width: width * 0.8 }
    };

    /**
     * Stacked by measured height, not by a fixed interval.
     *
     * The stanzas used to sit 85px apart regardless of how tall they were. On a
     * wide screen each one is two lines and that is fine; on a phone the same
     * stanza wraps to five or six, and the next one was drawn straight over
     * the bottom of it. Each text is given its full line to measure, then
     * cleared for the typewriter, so the layout knows the finished shape
     * before a character has appeared.
     */
    const gap = ui(18, camera);
    const texts = messages.map((message) => {
        const text = scene.add.text(0, 0, message, textStyle);
        text.setOrigin(0.5, 0);
        text.setDepth(2);
        return text;
    });

    const heights = texts.map((text) => text.height);
    const total = heights.reduce((sum, h) => sum + h, 0) + gap * (messages.length - 1);
    let cursor = height / 2 - total / 2;
    texts.forEach((text, i) => {
        text.setPosition(width / 2, cursor);
        cursor += heights[i] + gap;
        text.setText('');
    });

    /**
     * The ending runs for the better part of twenty seconds and had no way out
     * of it at all — the skip that was added went onto the credits, which are a
     * different screen that comes later. This is the one people were sitting
     * through.
     *
     * Skipping does not cut to black: it fills every line in at once and lets
     * the sequence finish, so the words are all still there to be read.
     */
    let skipped = false;
    let releaseSkip: (() => void) | null = null;
    const skipRequested = new Promise<void>((resolve) => {
        releaseSkip = resolve;
    });

    const skipPrompt = scene.add
        .text(width / 2, height - ui(56, camera), t('ending.skip'), {
            fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
            fontSize: fontPx(13, camera, TEXT.PROMPT),
            color: '#ffffff',
            align: 'center',
            backgroundColor: 'rgba(20,22,28,0.92)',
            padding: { x: ui(16, camera), y: ui(11, camera) }
        } as Phaser.Types.GameObjects.Text.TextStyle)
        .setOrigin(0.5, 0.5)
        .setDepth(4)
        .setAlpha(0);

    const requestSkip = (): void => {
        if (skipped) return;
        skipped = true;

        // Every line, in full, immediately.
        texts.forEach((text, i) => text.setText(messages[i]));
        skipPrompt.setAlpha(0);
        releaseSkip?.();
    };

    const skipArea = scene.add
        .rectangle(width / 2, height / 2, width * 2, height * 2)
        .setDepth(3);

    scene.time.delayedCall(SKIP_AFTER_MS, () => {
        if (skipped || !skipArea.active) return;

        skipArea.setInteractive({ useHandCursor: true });
        skipArea.on('pointerdown', requestSkip);
        scene.input.keyboard?.on('keydown-ENTER', requestSkip);
        scene.input.keyboard?.on('keydown-SPACE', requestSkip);

        scene.tweens.add({ targets: skipPrompt, alpha: 1, duration: 400, ease: 'Power2' });
    });

    /** A wait that ends early once the player has asked to move on. */
    const hold = (ms: number): Promise<unknown> =>
        Promise.race([new Promise((resolve) => scene.time.delayedCall(ms, resolve)), skipRequested]);

    const typewriteText = (text: string, textObject: Phaser.GameObjects.Text, duration = 1500): Promise<void> =>
        new Promise((resolve) => {
            const length = text.length;
            let i = 0;

            const event = scene.time.addEvent({
                callback: () => {
                    if (skipped) {
                        textObject.setText(text);
                        event.remove();
                        resolve();
                        return;
                    }

                    textObject.setText(text.slice(0, i + 1));
                    i++;
                    if (i === length) resolve();
                },
                repeat: length - 1,
                delay: duration / length
            });
        });

    await hold(2000);

    for (let i = 0; i < messages.length; i++) {
        if (skipped) {
            texts[i].setText(messages[i]);
            continue;
        }

        await typewriteText(messages[i], texts[i]);
        if (i < messages.length - 1) await hold(1000);
    }

    // Once skipped the whole roll has been read at once, so it does not need
    // the long beat that a played-out ending earns.
    await hold(skipped ? 1200 : 4000);

    scene.input.keyboard?.off('keydown-ENTER', requestSkip);
    scene.input.keyboard?.off('keydown-SPACE', requestSkip);
    skipArea.destroy();

    scene.tweens.add({
        targets: [...texts, skipPrompt],
        alpha: 0,
        duration: 1000,
        ease: 'Power2',
        onComplete: () => skipPrompt.destroy()
    });

    return { texts };
};
