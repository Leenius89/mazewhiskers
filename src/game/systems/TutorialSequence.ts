import Phaser from 'phaser';
import { t } from '../../i18n';
import { GameConfig } from '../constants/GameConfig';
import { DEPTH, sortDepth } from '../core/depth';
import { TILE_UNIT, cellOf, hasLineOfSight, isOpen, worldOf } from '../core/grid';
import type { Cell } from '../core/grid';
import type { GameScene } from '../scenes/GameScene';
import { isMobileDevice } from './InputManager';

/**
 * Nearest member of a group that the player could actually see.
 *
 * Points at something with a clear line from the cat where possible, so the
 * camera does not fly to a fish standing behind a tower. Falls back to the
 * plain nearest if nothing is in the open — the beat still lifts its subject
 * above the buildings, so it stays visible either way.
 */
const nearestVisible = (
    group: Phaser.Physics.Arcade.Group | undefined,
    maze: number[][] | undefined,
    x: number,
    y: number
): Phaser.GameObjects.Sprite | null => {
    if (!group) return null;

    let best: Phaser.GameObjects.Sprite | null = null;
    let bestDistance = Infinity;
    let fallback: Phaser.GameObjects.Sprite | null = null;
    let fallbackDistance = Infinity;

    for (const child of group.getChildren() as Phaser.GameObjects.Sprite[]) {
        if (!child.active) continue;

        const distance = Phaser.Math.Distance.Between(x, y, child.x, child.y);
        if (distance < fallbackDistance) {
            fallbackDistance = distance;
            fallback = child;
        }

        if (distance < bestDistance && hasLineOfSight(maze, x, y, child.x, child.y)) {
            bestDistance = distance;
            best = child;
        }
    }

    return best ?? fallback;
};

/**
 * Redevelopment, shown once before it is ever done for real.
 *
 * This beat used to be the only one that pointed at nothing. Every other line
 * in the tutorial flies the camera to a thing that exists — the fish, the milk,
 * home — and then names it. Redevelopment had not happened yet, so it got a
 * spotlight on an empty patch of road and a sentence describing something the
 * player had never seen. The first hazard tape they actually met was the real
 * one, with three seconds to work out what it meant.
 *
 * So it is rehearsed here: the tape goes down around the cat, and then the
 * towers come up on it, in the same order and the same colours as the real
 * thing. Nothing about it is real — no bodies, no grid cells, no shove and no
 * cost. The sprites are ordinary images sitting on the road, and they are taken
 * away again when the line is done.
 */
interface Rehearsal {
    dismiss: () => void;
}

/**
 * How long the tape stands alone before the towers come up on it.
 *
 * Not the real warning of three seconds. The line is still being typed at
 * this point — the Korean takes about three quarters of a second — so the
 * towers arrive while the player is still reading, and the first thing they
 * can do about it is the acknowledgement that ends the beat. Waiting the
 * real three seconds meant the towers never appeared at all: the beat was
 * over long before the timer.
 */
const REHEARSAL_TAPE_MS = 700;

const rehearseRedevelopment = (scene: GameScene, at: Cell): Rehearsal => {
    const cfg = GameConfig.APARTMENT.WARNING;
    const half = TILE_UNIT / 2;

    // The ring around the cat, minus the cell it is standing in: the city
    // closing in on it, rather than landing on top of it. A tower dropped on
    // the cat with no consequence would teach the opposite of the rule.
    const ring: Cell[] = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const gx = at.gx + dx;
            const gy = at.gy + dy;
            if (!isOpen(scene.maze, gx, gy)) continue;
            ring.push({ gx, gy });
        }
    }

    const tape = scene.add.graphics();
    tape.setDepth(DEPTH.GROUND + 3);

    const paint = (alpha: number) => {
        tape.clear();
        tape.fillStyle(cfg.COLOR, cfg.ALPHA * 0.22 * alpha);
        tape.lineStyle(2, cfg.COLOR, cfg.ALPHA * alpha);

        ring.forEach((cell) => {
            const left = cell.gx * TILE_UNIT - half;
            const top = cell.gy * TILE_UNIT - half;

            tape.fillRect(left, top, TILE_UNIT, TILE_UNIT);
            tape.strokeRect(left + 2, top + 2, TILE_UNIT - 4, TILE_UNIT - 4);

            for (let offset = cfg.STRIPE; offset < TILE_UNIT; offset += cfg.STRIPE) {
                tape.lineBetween(left + offset, top, left, top + offset);
                tape.lineBetween(left + TILE_UNIT, top + offset, left + offset, top + TILE_UNIT);
            }
        });
    };

    paint(1);

    // Same pulse the real tape has, driven by a tween rather than the frame
    // loop, because the frame loop is what a narrated beat has stopped.
    const pulse = scene.tweens.addCounter({
        from: 0.6,
        to: 1,
        duration: cfg.PULSE_MS / 2,
        yoyo: true,
        repeat: -1,
        onUpdate: (tween) => paint(tween.getValue())
    });

    const raised: Phaser.GameObjects.Sprite[] = [];

    const raise = () => {
        ring.forEach((cell) => {
            const world = worldOf(cell);
            const baseY = world.y + half;

            const tower = scene.add.sprite(world.x, baseY, `apt${Phaser.Math.Between(1, 3)}`);
            tower.setOrigin(0.5, 1);
            const scale = (TILE_UNIT / tower.width) * GameConfig.APARTMENT.TILE_OVERLAP;
            tower.setScale(scale, scale * GameConfig.APARTMENT.HEIGHT_SCALE);
            tower.setDepth(sortDepth(baseY));
            tower.setAlpha(0);

            scene.tweens.add({
                targets: tower,
                alpha: 1,
                duration: GameConfig.APARTMENT.FADE_IN,
                ease: 'Power2'
            });

            raised.push(tower);
        });

        scene.soundManager?.playConstructSound();
    };

    let risen = false;
    const timer = scene.time.delayedCall(REHEARSAL_TAPE_MS, () => {
        risen = true;
        raise();
    });

    return {
        dismiss: () => {
            timer.remove(false);
            pulse.stop();
            // Read faster than the towers could land. Nothing to take away
            // but the tape, and no late arrival over the following beat.
            if (!risen) raised.length = 0;

            scene.tweens.add({
                targets: [tape, ...raised],
                alpha: 0,
                duration: 260,
                ease: 'Power2',
                onComplete: () => {
                    tape.destroy();
                    raised.forEach((tower) => tower.destroy());
                }
            });
        }
    };
};

/**
 * The opening, taught by showing rather than by listing.
 *
 * The previous version was a wall of text in front of a game the player had not
 * seen: it named fish and milk and hazard zones before any of them were on
 * screen. Here the camera flies to the actual object, the screen dims around it,
 * and one line explains what it is — so every noun in the tutorial has already
 * been pointed at.
 *
 * The enemy is deliberately absent. Meeting it should be an event, not an item
 * in a list, so it gets its own entrance later.
 */
export const runTutorial = async (scene: GameScene): Promise<void> => {
    const narrative = scene.narrative;
    const player = scene.player;
    if (!narrative || !player) return;

    const spotOn = (sprite: Phaser.GameObjects.Sprite, pad = 1.2) => ({
        x: sprite.x,
        y: sprite.y - sprite.displayHeight * (1 - sprite.originY) * 0.5,
        width: sprite.displayWidth * pad,
        height: sprite.displayHeight * pad
    });

    // A phone has no arrow keys, and the line that named them was the
    // first thing a visitor read.
    await narrative.play(t(isMobileDevice() ? 'tut.move.touch' : 'tut.move'), {
        speaker: '· 고양이',
        lookAt: { x: player.x, y: player.y },
        spotlight: spotOn(player, 1.8),
        subject: player
    });

    if (scene.goal) {
        await narrative.play(t('tut.goal'), {
            speaker: t('tut.goal.speaker'),
            lookAt: { x: scene.goal.x, y: scene.goal.y },
            spotlight: spotOn(scene.goal, 1.6),
            subject: scene.goal
        });
    }

    const fish = nearestVisible(scene.fishes, scene.maze, player.x, player.y);
    if (fish) {
        await narrative.play(t('tut.fish'), {
            speaker: t('tut.fish.speaker'),
            lookAt: { x: fish.x, y: fish.y },
            spotlight: spotOn(fish, 3),
            subject: fish
        });
    }

    const milk = nearestVisible(scene.milks, scene.maze, player.x, player.y);
    if (milk) {
        await narrative.play(
            t('tut.milk'),
            {
                speaker: t('tut.milk.speaker'),
                lookAt: { x: milk.x, y: milk.y },
                spotlight: spotOn(milk, 3),
                subject: milk
            }
        );
    }

    // Rehearsed rather than described. Wide enough a spotlight to hold the
    // ring and the towers standing on it, and lifted, because a tower is most
    // of two tiles tall and grows upward out of its own cell.
    const rehearsal = rehearseRedevelopment(scene, cellOf(player.x, player.groundY));

    await narrative.play(
        t('tut.apartment'),
        {
            speaker: t('tut.apartment.speaker'),
            lookAt: { x: player.x, y: player.y },
            spotlight: {
                x: player.x,
                y: player.y - TILE_UNIT * 0.7,
                width: TILE_UNIT * 4.4,
                height: TILE_UNIT * 4.6
            }
        }
    );

    rehearsal.dismiss();

    // Explicitly toured to. Every other beat points at something out in the
    // city, but this one points at the cat itself — and the cat starts in the
    // corner of the map, where a bounded camera cannot put it on screen centre.
    await narrative.play(t('tut.health'), {
        speaker: t('tut.health.speaker'),
        lookAt: { x: player.x, y: player.y },
        spotlight: spotOn(player, 2.2),
        subject: player,
        // The bar is normally hidden while anything is being narrated, which
        // meant this line described something the player could not see.
        showStatusBar: true
    });

    // Lit, not shaded. A null spotlight darkens the whole screen, so the last
    // thing the tutorial did was send the player off while hiding the cat.
    await narrative.play(t('tut.start'), {
        speaker: t('tut.start.speaker'),
        spotlight: spotOn(player, 2.6),
        subject: player,
        showStatusBar: true
    });

    await narrative.returnToPlayer();
    narrative.finish();
};

/**
 * The enemy's entrance.
 *
 * It gets a line and a held frame because arriving quietly would make it read as
 * one more hazard. It is the moment the run stops being about the city alone.
 */
export const playEnemyEntrance = async (
    scene: GameScene,
    enemy: Phaser.GameObjects.Sprite
): Promise<void> => {
    const narrative = scene.narrative;
    if (!narrative) return;

    await narrative.play(t('tut.enemy'), {
        speaker: '· ???',
        lookAt: { x: enemy.x, y: enemy.y },
        spotlight: {
            x: enemy.x,
            y: enemy.y - enemy.displayHeight * 0.5,
            width: enemy.displayWidth * 1.4,
            height: enemy.displayHeight * 1.3
        },
        subject: enemy
    });

    await narrative.returnToPlayer();
    narrative.finish();
};
