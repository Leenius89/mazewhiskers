import Phaser from 'phaser';

interface CreditsObjects {
    creditsBg: Phaser.GameObjects.Graphics;
    creditsText: Phaser.GameObjects.Text;
    clickableArea: Phaser.GameObjects.Rectangle;
}

export const showCredits = (
    scene: Phaser.Scene,
    width: number,
    height: number,
    onStart?: () => void,
    onEnd?: () => void
): CreditsObjects => {
    if (onStart) onStart();

    const creditsBg = scene.add.graphics();
    creditsBg.fillStyle(0x000000, 1);
    creditsBg.fillRect(0, 0, width, height);
    creditsBg.setDepth(1000);
    creditsBg.setAlpha(0);

    const credits = [
        "Maze Whiskers",
        "",
        "A game about housing and equality",
        "",
        "Developer",
        "Joongmin Lee",
        "",
        "Art & Design",
        "Joongmin Lee",
        "",
        "Music & Sound",
        "Pixabay",
        "Lesiakower - Battle Time",
        "Spencer_YK - Little Slime's Adventure",
        "",
        "Special Thanks",
        "알투스통합예술연구소",
        "",
        "© 2024 studio 凹凸",
        "",
        "Click anywhere to return"
    ];

    // Place text in center
    const creditsText = scene.add.text(width / 2, height / 2, credits.join('\n'), {
        fontFamily: 'Arial',
        fontSize: '20px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 10
    } as Phaser.Types.GameObjects.Text.TextStyle); // Explicit cast for stricter typing if needed
    creditsText.setOrigin(0.5, 0.5);
    creditsText.setDepth(1001);
    creditsText.setAlpha(0);

    // Full screen clickable area
    const clickableArea = scene.add.rectangle(width / 2, height / 2, width, height);
    clickableArea.setOrigin(0.5, 0.5);
    clickableArea.setDepth(1002);
    clickableArea.setInteractive({ useHandCursor: true });
    clickableArea.input!.enabled = true;

    // Fade in
    scene.tweens.add({
        targets: [creditsBg, creditsText],
        alpha: 1,
        duration: 1000,
        ease: 'Power2'
    });

    // Click handler
    const handleClick = () => {
        // Remove listener immediately
        clickableArea.removeInteractive();

        scene.tweens.add({
            targets: [creditsBg, creditsText],
            alpha: 0,
            duration: 500,
            ease: 'Power2',
            onComplete: () => {
                creditsBg.destroy();
                creditsText.destroy();
                clickableArea.destroy();
                if (onEnd) onEnd();
            }
        });
    };

    // Add listener
    clickableArea.on('pointerdown', handleClick);

    return { creditsBg, creditsText, clickableArea };
};
