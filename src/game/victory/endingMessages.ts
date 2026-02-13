import Phaser from 'phaser';

export const showEndingMessages = async (scene: Phaser.Scene, width: number, height: number): Promise<{ texts: Phaser.GameObjects.Text[] }> => {
    const messages = [
        "Life begins without a rehearsal.",
        "Using the rough waves of anxiety as our drive",
        "we simply plunge toward an unknown point.",
        "Even if I were to open my eyes again,",
        "my choice remains the repetition of this very life."
    ];

    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: 'Arial',
        fontSize: '20px',
        color: '#ffffff',
        align: 'center',
        fixedWidth: width * 0.8,
        wordWrap: { width: width * 0.8 }
    };

    // Calculate positions
    const lineSpacing = 60;
    const startY = height / 2 - ((messages.length - 1) * lineSpacing) / 2;

    // Create text objects
    const texts = messages.map((_, i) => {
        const text = scene.add.text(width / 2, startY + i * lineSpacing, '', textStyle);
        text.setOrigin(0.5);
        text.setDepth(2);
        return text;
    });

    // Typewriter effect function
    const typewriteText = (text: string, textObject: Phaser.GameObjects.Text, duration: number = 1500): Promise<void> => {
        return new Promise((resolve) => {
            const length = text.length;
            let i = 0;

            scene.time.addEvent({
                callback: () => {
                    textObject.setText(text.slice(0, i + 1));
                    i++;
                    if (i === length) resolve();
                },
                repeat: length - 1,
                delay: duration / length
            });
        });
    };

    // Initial delay
    await new Promise(resolve => scene.time.delayedCall(2000, resolve));

    // Show messages sequentially
    for (let i = 0; i < messages.length; i++) {
        await typewriteText(messages[i], texts[i]);
        if (i < messages.length - 1) {
            await new Promise(resolve => scene.time.delayedCall(1000, resolve));
        }
    }

    // Final delay
    await new Promise(resolve => scene.time.delayedCall(4000, resolve));

    // Fade out
    texts.forEach(text => {
        scene.tweens.add({
            targets: text,
            alpha: 0,
            duration: 1000,
            ease: 'Power2'
        });
    });

    return { texts };
};
