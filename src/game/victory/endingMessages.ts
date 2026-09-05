import Phaser from 'phaser';
import { fontPx, ui } from '../core/uiScale';

/** How long the ending holds the screen before it can be skipped. */
const SKIP_AFTER_MS = 3000;

export const showEndingMessages = async (
    scene: Phaser.Scene,
    width: number,
    height: number
): Promise<{ texts: Phaser.GameObjects.Text[] }> => {
    const messages = [
        'Life begins without a rehearsal.\n인생은 리허설 없이 시작된다.',
        'Using the rough waves of anxiety as our drive\n불안이라는 거친 파도를 동력 삼아',
        'we simply plunge toward an unknown point.\n우리는 그저 미지의 점을 향해 뛰어든다.',
        'Even if I were to open my eyes again,\n내가 다시 눈을 뜬다 해도,',
        'my choice remains the repetition of this very life.\n나의 선택은 바로 이 삶의 반복이다.'
    ];

    const camera = scene.cameras.main;

    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: "'Pretendard', sans-serif",
        fontSize: fontPx(18, camera),
        color: '#ffffff',
        align: 'center',
        fixedWidth: width * 0.8,
        wordWrap: { width: width * 0.8 }
    };

    const lineSpacing = ui(85, camera);
    const startY = height / 2 - ((messages.length - 1) * lineSpacing) / 2;

    const texts = messages.map((_, i) => {
        const text = scene.add.text(width / 2, startY + i * lineSpacing, '', textStyle);
        text.setOrigin(0.5);
        text.setDepth(2);
        return text;
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
        .text(width / 2, height - ui(56, camera), '▸  SKIP  /  건너뛰기', {
            fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
            fontSize: fontPx(13, camera),
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
