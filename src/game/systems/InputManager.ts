import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';

export const isMobileDevice = (): boolean => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

/**
 * One place that answers "where does the player want to go, and do they want to
 * jump?" — whichever device is asking.
 *
 * Before this, the keyboard path lived in `Player.handleMovement` while the
 * touch path set velocities directly from a DOM pointer handler in the scene,
 * so the two controls could not share a single behaviour (the joystick could
 * not aim a jump, for one).
 */
export class InputManager {
    /** Movement intent this frame: a unit-ish vector, length 0 to 1. */
    readonly move = new Phaser.Math.Vector2(0, 0);

    private readonly scene: Phaser.Scene;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private jumpKey?: Phaser.Input.Keyboard.Key;
    private dashKey?: Phaser.Input.Keyboard.Key;

    /** Timestamp of the most recent unconsumed jump press. */
    private jumpRequestedAt = -Infinity;
    private dashRequestedAt = -Infinity;
    private touchJumpHeld = false;

    private controlsContainer: HTMLDivElement | null = null;
    private readonly domCleanups: (() => void)[] = [];

    constructor(scene: Phaser.Scene) {
        this.scene = scene;

        if (scene.input.keyboard) {
            this.cursors = scene.input.keyboard.createCursorKeys();
            this.jumpKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
            this.jumpKey.on('down', () => this.requestJump());

            this.dashKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
            this.dashKey.on('down', () => this.requestDash());
        }

        if (isMobileDevice()) {
            scene.input.addPointer(1);
            this.buildTouchControls();
        }

        scene.events.once('shutdown', () => this.destroy());
    }

    /** Records a jump press. Held briefly so a press just before landing counts. */
    requestJump(): void {
        this.jumpRequestedAt = this.scene.time.now;
    }

    /**
     * True at most once per press, and only if the press is still fresh.
     *
     * The buffer is what stops a jump from being swallowed when the player
     * presses a few frames before the previous one finishes.
     */
    consumeJump(): boolean {
        if (this.scene.time.now - this.jumpRequestedAt > GameConfig.INPUT.JUMP_BUFFER_MS) return false;
        this.jumpRequestedAt = -Infinity;
        return true;
    }

    get isJumpHeld(): boolean {
        return this.touchJumpHeld || !!this.jumpKey?.isDown;
    }

    requestDash(): void {
        this.dashRequestedAt = this.scene.time.now;
    }

    /** Buffered like the jump, for the same reason. */
    consumeDash(): boolean {
        if (this.scene.time.now - this.dashRequestedAt > GameConfig.INPUT.JUMP_BUFFER_MS) return false;
        this.dashRequestedAt = -Infinity;
        return true;
    }

    /** Reads the keyboard; the joystick writes into `move` as it is dragged. */
    update(): void {
        if (!this.cursors) return;

        // A held joystick owns the vector; the keyboard only speaks when idle.
        if (this.touchStickActive) return;

        this.move.set(0, 0);
        if (this.cursors.left.isDown) this.move.x -= 1;
        if (this.cursors.right.isDown) this.move.x += 1;
        if (this.cursors.up.isDown) this.move.y -= 1;
        if (this.cursors.down.isDown) this.move.y += 1;

        if (this.move.lengthSq() > 1) this.move.normalize();
    }

    private touchStickActive = false;

    private buildTouchControls(): void {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;

        const stick = GameConfig.INPUT.JOYSTICK;

        const controlsContainer = document.createElement('div');
        Object.assign(controlsContainer.style, {
            position: 'absolute',
            bottom: '20px',
            left: '0',
            right: '0',
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 20px',
            pointerEvents: 'none',
            zIndex: '1000'
        });

        const joystickArea = document.createElement('div');
        Object.assign(joystickArea.style, {
            width: `${stick.AREA_SIZE}px`,
            height: `${stick.AREA_SIZE}px`,
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.3)',
            position: 'relative',
            pointerEvents: 'auto',
            touchAction: 'none'
        });

        const joystickHandle = document.createElement('div');
        Object.assign(joystickHandle.style, {
            width: `${stick.HANDLE_SIZE}px`,
            height: `${stick.HANDLE_SIZE}px`,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.5)',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none'
        });

        const jumpButton = document.createElement('button');
        Object.assign(jumpButton.style, {
            width: `${stick.JUMP_BUTTON_SIZE}px`,
            height: `${stick.JUMP_BUTTON_SIZE}px`,
            borderRadius: '50%',
            background: 'rgba(255, 0, 0, 0.5)',
            border: 'none',
            color: 'white',
            fontSize: '18px',
            fontWeight: 'bold',
            pointerEvents: 'auto',
            touchAction: 'none',
            cursor: 'pointer'
        });
        jumpButton.textContent = 'JUMP';

        const dashButton = document.createElement('button');
        Object.assign(dashButton.style, {
            width: `${stick.JUMP_BUTTON_SIZE * 0.8}px`,
            height: `${stick.JUMP_BUTTON_SIZE * 0.8}px`,
            borderRadius: '50%',
            background: 'rgba(60, 140, 255, 0.5)',
            border: 'none',
            color: 'white',
            fontSize: '14px',
            fontWeight: 'bold',
            pointerEvents: 'auto',
            touchAction: 'none',
            cursor: 'pointer',
            alignSelf: 'flex-end'
        });
        dashButton.textContent = 'DASH';

        const actions = document.createElement('div');
        Object.assign(actions.style, {
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-end',
            pointerEvents: 'none'
        });
        actions.appendChild(dashButton);
        actions.appendChild(jumpButton);

        joystickArea.appendChild(joystickHandle);
        controlsContainer.appendChild(joystickArea);
        controlsContainer.appendChild(actions);
        gameContainer.appendChild(controlsContainer);

        const origin = { x: 0, y: 0 };

        const onStickDown = (e: PointerEvent) => {
            this.touchStickActive = true;
            const rect = joystickArea.getBoundingClientRect();
            origin.x = e.clientX - rect.left;
            origin.y = e.clientY - rect.top;
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!this.touchStickActive) return;

            const rect = joystickArea.getBoundingClientRect();
            const dx = e.clientX - rect.left - origin.x;
            const dy = e.clientY - rect.top - origin.y;
            const distance = Math.min(stick.MAX_RADIUS, Math.hypot(dx, dy));
            const angle = Math.atan2(dy, dx);

            joystickHandle.style.transform =
                `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px))`;

            // Below the dead zone the stick reads as centred, so resting a thumb
            // on it does not creep the cat forward.
            const strength = distance / stick.MAX_RADIUS;
            if (strength < stick.DEAD_ZONE) {
                this.move.set(0, 0);
                return;
            }

            const scaled = (strength - stick.DEAD_ZONE) / (1 - stick.DEAD_ZONE);
            this.move.set(Math.cos(angle) * scaled, Math.sin(angle) * scaled);
        };

        const onStickEnd = () => {
            if (!this.touchStickActive) return;
            this.touchStickActive = false;
            joystickHandle.style.transform = 'translate(-50%, -50%)';
            this.move.set(0, 0);
        };

        const onJumpDown = () => {
            this.touchJumpHeld = true;
            this.requestJump();
        };
        const onJumpUp = () => {
            this.touchJumpHeld = false;
        };

        const onDashDown = () => this.requestDash();
        dashButton.addEventListener('pointerdown', onDashDown);

        joystickArea.addEventListener('pointerdown', onStickDown);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onStickEnd);
        document.addEventListener('pointercancel', onStickEnd);
        jumpButton.addEventListener('pointerdown', onJumpDown);
        jumpButton.addEventListener('pointerup', onJumpUp);
        jumpButton.addEventListener('pointercancel', onJumpUp);

        this.controlsContainer = controlsContainer;
        this.domCleanups.push(() => {
            joystickArea.removeEventListener('pointerdown', onStickDown);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onStickEnd);
            document.removeEventListener('pointercancel', onStickEnd);
            jumpButton.removeEventListener('pointerdown', onJumpDown);
            jumpButton.removeEventListener('pointerup', onJumpUp);
            dashButton.removeEventListener('pointerdown', onDashDown);
        });
    }

    destroy(): void {
        this.domCleanups.forEach((cleanup) => cleanup());
        this.domCleanups.length = 0;
        this.controlsContainer?.remove();
        this.controlsContainer = null;
    }
}
