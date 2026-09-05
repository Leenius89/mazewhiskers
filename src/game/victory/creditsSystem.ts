import Phaser from 'phaser';
import { fontPx, ui } from '../core/uiScale';

/** How long the roll holds the screen before it can be dismissed. */
const SKIP_AFTER_MS = 3000;

interface CreditsObjects {
    creditsBg: Phaser.GameObjects.Graphics;
    creditsText: Phaser.GameObjects.Text;
    clickableArea: Phaser.GameObjects.Rectangle;
    skipPrompt: Phaser.GameObjects.Text;
}

export const showCredits = (
    scene: Phaser.Scene,
    width: number,
    height: number,
    onStart?: () => void,
    onEnd?: () => void
): CreditsObjects => {
    if (onStart) onStart();

    const camera = scene.cameras.main;

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
        ""
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

    /**
     * The prompt to leave, and the ability to, arrive together — three
     * seconds in.
     *
     * The credits were dismissable from the first frame, with the invitation
     * to dismiss them printed in the roll itself: the click that ended the
     * run tended to carry straight through and skip the ending before anyone
     * had read a line of it.
     */
    const skipPrompt = scene.add.text(width / 2, height - ui(56, camera), '▸  SKIP  /  건너뛰기', {
        fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
        fontSize: fontPx(13, camera),
        color: '#ffffff',
        align: 'center',
        backgroundColor: 'rgba(20,22,28,0.92)',
        padding: { x: ui(16, camera), y: ui(11, camera) }
    } as Phaser.Types.GameObjects.Text.TextStyle);
    skipPrompt.setOrigin(0.5, 0.5);
    skipPrompt.setDepth(1003);
    skipPrompt.setAlpha(0);

    // Full screen clickable area
    const clickableArea = scene.add.rectangle(width / 2, height / 2, width, height);
    clickableArea.setOrigin(0.5, 0.5);
    clickableArea.setDepth(1002);

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
                skipPrompt.destroy();
                clickableArea.destroy();
                if (onEnd) onEnd();
            }
        });
    };

    scene.time.delayedCall(SKIP_AFTER_MS, () => {
        if (!clickableArea.active) return;

        clickableArea.setInteractive({ useHandCursor: true });
        clickableArea.on('pointerdown', handleClick);

        scene.tweens.add({ targets: skipPrompt, alpha: 1, duration: 400, ease: 'Power2' });
    });

    return { creditsBg, creditsText, clickableArea, skipPrompt };
};
