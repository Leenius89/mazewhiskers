import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { theme } from './theme';

/**
 * Both cats, loose on the menu, getting on with it.
 *
 * The black cat was already down here on its own. Two changes everything: a
 * lone cat walking is decoration, and two cats are a situation. The stray the
 * player is about to be is out there too now, and the pair of them talk, keep
 * out of each other's way, and every so often the whole thing turns into the
 * chase the game is about — thirty seconds before anybody has pressed START.
 *
 * It is all pantomime. Neither knows about difficulty, nothing said is true,
 * and the layer cannot take a click.
 *
 * One director rather than two independent cats, because everything worth
 * watching needs both of them to agree: you cannot walk over to someone who is
 * walking away, and a chase where the quarry has not been told is a cat
 * running past another cat. The director picks a scene, moves both, and comes
 * back when it is over.
 */

/** Held per walk frame. Two frames per cat, so this is the whole gait. */
const STEP_MS = 165;
/** And faster when running, which is most of what selling a chase takes. */
const RUN_STEP_MS = 95;

/** Pixels a second. A prowl, and a bolt. */
const WALK_SPEED = 74;
const RUN_SPEED = 230;

/**
 * How far a stroll goes, in pixels.
 *
 * Bounded rather than "anywhere on the street". Picking a target uniformly
 * across the window meant that on a desktop a cat would set off on a
 * eleven-hundred-pixel walk at seventy pixels a second — a fifteen-second
 * scene in which nothing else could happen. Measured over thirty seconds on a
 * 1280 window: four movements, one line of dialogue, no hops. Short errands
 * keep the street busy.
 */
const STROLL_MIN = 170;
const STROLL_MAX = 430;

const JUMP_BASE_MS = 300;
const JUMP_PER_PX = 0.5;
const JUMP_MAX_MS = 900;
const JUMP_RISE = 74;

const SPEAK_MS = 2200;


type Pose = 'walk' | 'sit' | 'air';

interface Actor {
    x: number;
    /** Height above the pavement. Only ever non-zero mid-hop. */
    y: number;
    facing: 1 | -1;
    pose: Pose;
    travelMs: number;
    hop: number;
    line: string | null;
    running: boolean;
}

const floorY = (): number => Math.round(window.innerHeight * 0.03);

const jumpTime = (dx: number, dy: number): number =>
    Math.min(JUMP_MAX_MS, JUMP_BASE_MS + Math.hypot(dx, dy) * JUMP_PER_PX);

const between = (min: number, max: number): number =>
    Math.floor(min + Math.random() * (max - min + 1));

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const start = (x: number): Actor => ({
    x,
    y: 0,
    facing: 1,
    pose: 'walk',
    travelMs: 0,
    hop: JUMP_RISE,
    line: null,
    running: false
});

interface Props {
    /** Height of each sprite in pixels, on a window with room for it. */
    size?: number;
}

/**
 * How wide the street is, and how big the cats on it are.
 *
 * A phone is three hundred pixels across. Two seventy-six pixel cats with a
 * seventy pixel margin each side left them a hundred and forty pixels to share
 * — they spent the whole time standing on each other, and a chase across a
 * hundred and forty pixels is a twitch. Both the cats and the margins come
 * down with the window so there is always a street to walk down.
 */
const stage = (size: number) => {
    const width = window.innerWidth;
    const scale = Math.min(1, width / 720);
    return {
        size: Math.round(size * Math.max(0.62, scale)),
        inset: Math.round(Math.max(26, Math.min(70, width * 0.08)))
    };
};

const MenuCats: React.FC<Props> = ({ size: baseSize = 76 }) => {
    const t = useTranslation();

    const [tabby, setTabby] = useState<Actor>(() => start(140));
    const [black, setBlack] = useState<Actor>(() => start(520));
    const [frame, setFrame] = useState(1);
    const [fit, setFit] = useState(() => stage(baseSize));

    useEffect(() => {
        const refit = () => setFit(stage(baseSize));
        window.addEventListener('resize', refit);
        return () => window.removeEventListener('resize', refit);
    }, [baseSize]);

    // Read inside timers that outlive the render that made them.
    const live = useRef({ tabby, black });
    live.current = { tabby, black };

    // One gait for both. Whoever is running sets the tempo, so a chase reads
    // as a chase rather than two cats strolling very quickly.
    const running = tabby.running || black.running;
    useEffect(() => {
        const id = window.setInterval(
            () => setFrame((f) => (f === 1 ? 2 : 1)),
            running ? RUN_STEP_MS : STEP_MS
        );
        return () => window.clearInterval(id);
    }, [running]);

    useEffect(() => {
        const width = () => window.innerWidth;
        const inset = stage(baseSize).inset;
        const clamp = (x: number) => Math.min(width() - inset, Math.max(inset, x));

        /** Somewhere worth walking to from here: an errand, not an expedition. */
        const spot = (from: number) => {
            const reach = between(STROLL_MIN, STROLL_MAX);
            const away = Math.random() < 0.5 ? -reach : reach;
            const wanted = from + away;
            // Turn round at the kerb rather than piling up against it.
            return clamp(wanted < inset || wanted > width() - inset ? from - away : wanted);
        };

        const timers: number[] = [];
        const later = (ms: number, run: () => void) => {
            timers.push(window.setTimeout(run, ms));
        };

        const set = (who: 'tabby' | 'black', patch: Partial<Actor>) =>
            (who === 'tabby' ? setTabby : setBlack)((a) => ({ ...a, ...patch }));

        const say = (who: 'tabby' | 'black', line: string) => {
            set(who, { line });
            later(SPEAK_MS, () => set(who, { line: null }));
        };

        const walkTo = (who: 'tabby' | 'black', x: number, run = false): number => {
            const from = live.current[who].x;
            const speed = run ? RUN_SPEED : WALK_SPEED;
            const ms = (Math.abs(x - from) / speed) * 1000;
            set(who, {
                x,
                y: 0,
                pose: 'walk',
                running: run,
                facing: x >= from ? 1 : -1,
                travelMs: ms
            });
            return ms;
        };

        const hopTo = (who: 'tabby' | 'black', x: number): number => {
            const from = live.current[who].x;
            const ms = jumpTime(x - from, 0);
            set(who, {
                x,
                pose: 'air',
                hop: JUMP_RISE,
                facing: x >= from ? 1 : -1,
                travelMs: ms
            });
            later(ms, () => set(who, { pose: 'sit' }));
            return ms;
        };

        const sit = (who: 'tabby' | 'black'): void => {
            set(who, { pose: 'sit', running: false });
        };

        /** Both look at each other, whichever way round they happen to be. */
        const faceOff = (): void => {
            const { tabby: a, black: b } = live.current;
            set('tabby', { facing: b.x >= a.x ? 1 : -1, pose: 'sit', running: false });
            set('black', { facing: a.x >= b.x ? 1 : -1, pose: 'sit', running: false });
        };

        // ------------------------------------------------------------ scenes

        /** Each wanders somewhere on its own. Most of what happens down here. */
        const stroll = (): number => {
            const a = walkTo('tabby', spot(live.current.tabby.x));
            const b = walkTo('black', spot(live.current.black.x));
            if (Math.random() < 0.35) say(pick(['tabby', 'black'] as const), t(pick(IDLE)));
            return Math.max(a, b) + 400;
        };

        /**
         * They walk up to each other and have a word.
         *
         * The lines alternate on a timer rather than arriving at once, because
         * two speech bubbles up together is not a conversation, it is a poster.
         */
        const meet = (): number => {
            // Halfway between the two of them, not the middle of the screen:
            // a meeting should cost each of them half the gap, not half the
            // window, which on a desktop was most of a minute of walking.
            const { tabby: ta, black: bl } = live.current;
            const middle = (ta.x + bl.x) / 2;
            const left = ta.x <= bl.x;
            const a = walkTo('tabby', clamp(middle + (left ? -55 : 55)));
            const b = walkTo('black', clamp(middle + (left ? 55 : -55)));
            const travel = Math.max(a, b);

            later(travel, faceOff);

            const exchange = pick(BANTER);
            let at = travel + 300;
            exchange.forEach((entry, i) => {
                later(at, () => say(entry.who, t(entry.key)));
                at += SPEAK_MS - 500 + i * 60;
            });

            return at + 500;
        };

        /**
         * The one the game is about.
         *
         * The stray bolts for the far side, the black cat comes after it, and
         * because the black cat is a shade faster it gains — which is the
         * lie the game tells about that chase, told here for free. The hop is
         * the stray's, and it is what a player will be doing in a minute.
         */
        const chase = (): number => {
            const { tabby: a } = live.current;
            const runLeft = a.x > width() / 2;
            const flee = runLeft ? inset : width() - inset;

            say('tabby', t(pick(CHASE_TABBY)));
            const fleeMs = walkTo('tabby', flee, true);

            later(220, () => {
                say('black', t(pick(CHASE_BLACK)));
                walkTo('black', flee + (runLeft ? 150 : -150), true);
            });

            // A hop partway, because a stray being chased does not run in a
            // straight line and neither will the player.
            later(fleeMs * 0.45, () => {
                const mid = live.current.tabby;
                hopTo('tabby', mid.x + (runLeft ? -90 : 90));
                later(260, () => set('tabby', { pose: 'walk', running: true }));
            });

            later(fleeMs + 300, () => {
                sit('tabby');
                sit('black');
                say('tabby', t(pick(ESCAPED)));
            });

            return fleeMs + 1800;
        };

        /** One sits and says something while the other keeps moving. */
        const loiter = (): number => {
            const who = pick(['tabby', 'black'] as const);
            const other = who === 'tabby' ? 'black' : 'tabby';
            sit(who);
            say(who, t(pick(IDLE)));
            const ms = walkTo(other, spot(live.current[other].x));
            return Math.max(ms, between(1600, 2800));
        };

        /** A hop for no reason, which is the most cat thing either of them does. */
        const pounce = (): number => {
            const who = pick(['tabby', 'black'] as const);
            const from = live.current[who].x;
            const to = clamp(from + between(-160, 160));
            const ms = hopTo(who, to);
            if (Math.random() < 0.4) say(who, t(pick(IDLE)));
            return ms + 500;
        };

        /*
         * Weighted, and the chase is rare on purpose.
         *
         * It is the loudest thing down here, and something loud on a loop stops
         * being an event. Mostly they mill about; now and then they talk; once
         * in a while the street empties.
         */
        const scenes: Array<[() => number, number]> = [
            [stroll, 34],
            [meet, 22],
            [loiter, 20],
            [pounce, 14],
            [chase, 10]
        ];

        const next = (): void => {
            const total = scenes.reduce((sum, [, w]) => sum + w, 0);
            let roll = Math.random() * total;
            let chosen = scenes[0][0];
            for (const [scene, weight] of scenes) {
                roll -= weight;
                if (roll <= 0) {
                    chosen = scene;
                    break;
                }
            }

            const hold = chosen();
            later(hold + between(200, 900), next);
        };

        later(700, next);

        return () => timers.forEach((id) => window.clearTimeout(id));
    }, [t, baseSize]);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2,
                // The menu is above this and has to stay clickable.
                pointerEvents: 'none',
                overflow: 'hidden'
            }}
        >
            <Cat actor={tabby} sprite={`sources/cat${frame}.png`} size={fit.size} />
            <Cat actor={black} sprite={`sources/enemy${frame}.png`} size={fit.size} />
        </div>
    );
};

const Cat: React.FC<{ actor: Actor; sprite: string; size: number }> = ({ actor, sprite, size }) => (
    <div
        style={{
            position: 'absolute',
            left: 0,
            bottom: floorY(),
            transform: `translate(${actor.x}px, ${-actor.y}px)`,
            transition: `transform ${actor.travelMs}ms ${actor.pose === 'air' ? 'ease-out' : 'linear'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '5px'
        }}
    >
        <span
            style={{
                // Kept in the layout whether or not it is speaking, so the cat
                // does not bob as lines come and go.
                visibility: actor.line ? 'visible' : 'hidden',
                whiteSpace: 'nowrap',
                fontFamily: theme.body,
                fontSize: '0.72rem',
                color: '#f4eee2',
                background: 'rgba(12,10,16,0.86)',
                border: '1px solid rgba(244,238,226,0.24)',
                borderRadius: '4px',
                padding: '3px 7px'
            }}
        >
            {actor.line ?? ' '}
        </span>

        <img
            src={sprite}
            alt=""
            style={{
                width: `${size}px`,
                height: 'auto',
                display: 'block',
                imageRendering: 'pixelated',
                transform: `scaleX(${actor.facing})`,
                // A pale rim first: a black cat on a dark photograph lit only
                // by a dark shadow is a black rectangle.
                filter:
                    'drop-shadow(0 0 2px rgba(236,228,214,0.5)) ' +
                    'drop-shadow(0 4px 6px rgba(0,0,0,0.55))',
                animation: actor.pose === 'air' ? `mw-cat-hop ${Math.round(actor.travelMs)}ms ease-out 1` : undefined,
                ['--mw-hop' as string]: `${actor.hop}px`
            }}
        />
    </div>
);

/** Said by either of them, apropos of nothing. */
const IDLE = ['cat.idle.1', 'cat.idle.2', 'cat.idle.3', 'cat.idle.4', 'cat.idle.5', 'cat.idle.6'];

/** Two or three lines, alternating, when they meet in the middle. */
const BANTER: Array<Array<{ who: 'tabby' | 'black'; key: string }>> = [
    [
        { who: 'black', key: 'cat.meet.a.1' },
        { who: 'tabby', key: 'cat.meet.a.2' },
        { who: 'black', key: 'cat.meet.a.3' }
    ],
    [
        { who: 'tabby', key: 'cat.meet.b.1' },
        { who: 'black', key: 'cat.meet.b.2' }
    ],
    [
        { who: 'tabby', key: 'cat.meet.c.1' },
        { who: 'black', key: 'cat.meet.c.2' },
        { who: 'tabby', key: 'cat.meet.c.3' }
    ]
];

const CHASE_TABBY = ['cat.chase.tabby.1', 'cat.chase.tabby.2', 'cat.chase.tabby.3'];
const CHASE_BLACK = ['cat.chase.black.1', 'cat.chase.black.2', 'cat.chase.black.3'];
const ESCAPED = ['cat.escaped.1', 'cat.escaped.2'];

export default MenuCats;
