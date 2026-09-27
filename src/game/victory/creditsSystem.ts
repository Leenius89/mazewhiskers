import { VERSION } from '../../version';
import Phaser from 'phaser';
import { TEXT, fontPx, ui } from '../core/uiScale';
import { t } from '../../i18n';

/** How long the roll holds the screen before it can be dismissed. */
const SKIP_AFTER_MS = 1500;

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
    // Over-drawn on every side, like the victory overlay: sized exactly to
    // the camera it left a sliver of the game showing along the top edge.
    creditsBg.fillRect(-width, -height, width * 3, height * 3);
    creditsBg.setDepth(1000);
    creditsBg.setAlpha(0);

    const credits = [
        // Major and minor only: the roll names the release, not the patch.
        `Maze Whiskers v.${VERSION.split('.').slice(0, 2).join('.')}`,
        "",
        "A game about housing and equality",
        "",
        "Developer",
        "Joongmin Lee",
        "",
        "Art & Design",
        "Joongmin Lee",
        "",
        "Music",
        "Spencer_YK — Little Slime's Adventure",
        "Lesiakower — Battle Time",
        "",
        "Sound Effects",
        "Pixabay",
        "",
        "Special Thanks",
        "알투스통합예술연구소",
        // The two people whose music carries every run. Pixabay asks for no
        // credit; they get it anyway, and by name, where a player can see it.
        "Spencer_YK",
        "Lesiakower",
        "and everyone who shares their sound on Pixabay",
        "",
        "© 2026 Joongmin Lee",
        "",
        ""
    ];

    // Place text in center
    const creditsText = scene.add.text(width / 2, height / 2, credits.join('\n'), {
        fontFamily: 'Arial',
        fontSize: fontPx(18, camera, TEXT.PROSE),
        color: '#ffffff',
        align: 'center',
        lineSpacing: ui(10, camera)
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
    const skipPrompt = scene.add.text(width / 2, height - ui(56, camera), t('credits.return'), {
        fontFamily: "'Press Start 2P', 'Pretendard', sans-serif",
        fontSize: fontPx(13, camera, TEXT.PROMPT),
        color: '#ffffff',
        align: 'center',
        backgroundColor: 'rgba(20,22,28,0.92)',
        padding: { x: ui(16, camera), y: ui(11, camera) }
    } as Phaser.Types.GameObjects.Text.TextStyle);
    skipPrompt.setOrigin(0.5, 0.5);
    skipPrompt.setDepth(1003);
    skipPrompt.setAlpha(0);

    /**
     * Shrunk to fit between the top of the screen and the prompt, never
     * grown past its own size.
     *
     * The roll outgrew a phone once the people whose music carries the game
     * were thanked by name: the first lines ran off the top and the names
     * sat underneath the skip prompt, which is the one place a credit cannot
     * be read. Fitting the block keeps every line on screen, whatever the
     * screen.
     */
    const margin = ui(24, camera);
    const bandTop = margin;
    const bandBottom = skipPrompt.y - skipPrompt.displayHeight / 2 - margin;
    const room = Math.max(1, bandBottom - bandTop);
    creditsText.setScale(Math.min(1, room / creditsText.height, (width - margin * 2) / creditsText.width));
    creditsText.setPosition(width / 2, bandTop + room / 2);

    // Full screen clickable area
    const clickableArea = scene.add.rectangle(width / 2, height / 2, width * 2, height * 2);
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
