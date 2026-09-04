import Phaser from 'phaser';
import { GameConfig } from '../constants/GameConfig';
import { TILE_UNIT, hasLineOfSight } from '../core/grid';
import type { GameScene } from '../scenes/GameScene';

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

    const cell = (x: number, y: number, cells = 1.6) => ({
        x,
        y,
        width: TILE_UNIT * cells,
        height: TILE_UNIT * cells
    });

    await narrative.play('당신은 길고양이입니다. 방향키로 골목을 걸어 다닐 수 있습니다.', {
        speaker: '· 고양이',
        lookAt: { x: player.x, y: player.y },
        spotlight: spotOn(player, 1.8),
        subject: player
    });

    if (scene.goal) {
        await narrative.play('저기 도시 한가운데가 당신의 집입니다. 노란 화살표가 늘 그쪽을 가리킵니다.', {
            speaker: '· 집',
            lookAt: { x: scene.goal.x, y: scene.goal.y },
            spotlight: spotOn(scene.goal, 1.6),
            subject: scene.goal
        });
    }

    const fish = nearestVisible(scene.fishes, scene.maze, player.x, player.y);
    if (fish) {
        await narrative.play('생선은 체력을 채워 줍니다. 모아 둘 수는 없고, 계속 구해야 합니다.', {
            speaker: '· 생선',
            lookAt: { x: fish.x, y: fish.y },
            spotlight: spotOn(fish, 3),
            subject: fish
        });
    }

    const milk = nearestVisible(scene.milks, scene.maze, player.x, player.y);
    if (milk) {
        await narrative.play(
            '우유를 마시면 두 칸을 뛰어넘을 수 있습니다. 스페이스바를 누른 채로 방향을 보면 착지 지점이 보입니다.',
            {
                speaker: '· 우유',
                lookAt: { x: milk.x, y: milk.y },
                spotlight: spotOn(milk, 3),
                subject: milk
            }
        );
    }

    // The one thing that has not happened yet, so it is described on the grid
    // it will happen to rather than on an object.
    await narrative.play(
        '도시 아무 데나 노란 줄이 쳐집니다. 3초 뒤 그 구역 전체에 아파트가 들어섭니다. 안에 있으면 바깥으로 밀려나고, 밀려날 곳이 없으면 거기서 끝입니다.',
        {
            speaker: '· 재개발',
            lookAt: { x: player.x, y: player.y },
            spotlight: cell(player.x, player.y, 2.4)
        }
    );

    await narrative.play('체력은 가만히 있어도 줄어듭니다. 머리 위 막대가 당신에게 남은 시간입니다.', {
        speaker: '· 체력',
        spotlight: spotOn(player, 2.2),
        subject: player
    });

    await narrative.play('집까지 가세요. 도시가 먼저 도착하기 전에.', {
        speaker: '· 시작',
        spotlight: null
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

    await narrative.play(GameConfig.NARRATIVE.ENEMY_LINE, {
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
