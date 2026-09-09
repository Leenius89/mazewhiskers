import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { theme } from './theme';

/**
 * The black cat, loose on whatever screen it is put on.
 *
 * It is the one thing in the game nobody gets to look at properly — in a run
 * it is either far enough away to be a rumour or close enough to be a problem,
 * and either way you do not stop to watch it walk. So it walks here, and on
 * the screen where the player has just lost to it, it climbs onto the panel
 * and says something about that.
 *
 * Everything it does is decoration. It is not the enemy, it does not know the
 * difficulty, nothing it says is true, and it can never take a click — the
 * whole layer is pointer-events: none.
 *
 * Driven by a small state machine on timers rather than by requestAnimationFrame:
 * the movement is a CSS transition between two points, so the browser
 * interpolates it and nothing has to run per frame. The arc of a jump is the
 * one thing a transition cannot do on its own, so that is a keyframe on an
 * inner element while the outer one carries the horizontal travel.
 */

/** Held per walk frame. Two frames, so this is the whole gait. */
const STEP_MS = 170;

/** Ground speed, in pixels a second. A prowl, not a commute. */
const WALK_SPEED = 62;

/**
 * How long a hop takes, and how high it arcs over the straight line.
 *
 * The duration grows with the distance rather than being fixed. A fixed one
 * looked right for a hop along the pavement and absurd for the leap onto the
 * panel — six hundred pixels in under half a second is not a jump, it is a
 * cut. The arc is added on top of wherever it is going, so a climb still
 * rises before it lands.
 */
const JUMP_BASE_MS = 340;
const JUMP_PER_PX = 0.55;
const JUMP_MAX_MS = 1100;
const JUMP_RISE = 78;

const jumpTime = (dx: number, dy: number): number =>
    Math.min(JUMP_MAX_MS, JUMP_BASE_MS + Math.hypot(dx, dy) * JUMP_PER_PX);

/** How long it sits still before deciding what to do next. */
const SIT_MIN_MS = 1100;
const SIT_MAX_MS = 2800;

/** How long a line stays up. */
const SPEAK_MS = 2300;

type Pose = 'walk' | 'sit' | 'air';

/**
 * How high off the bottom of the window the pavement is.
 *
 * A value rather than a CSS offset on the container: the perch is
 * measured from the bottom of the window too, and mixing the two put
 * the cat a few centimetres above whatever it was sitting on.
 */
const floorY = (): number => Math.round(window.innerHeight * 0.03);

interface Props {
    /**
     * A selector for something it is allowed to sit on top of.
     *
     * The results panel, on the screens that have one. Without it the cat
     * stays on the floor, which is what the menu wants.
     */
    perchSelector?: string;
    /** Which set of lines it draws from. */
    mood?: 'idle' | 'taunt';
    /** Height of the sprite in pixels. */
    size?: number;
}

const ProwlingCat: React.FC<Props> = ({ perchSelector, mood = 'idle', size = 92 }) => {
    const t = useTranslation();

    const [frame, setFrame] = useState(1);
    const [pose, setPose] = useState<Pose>('walk');
    const [line, setLine] = useState<string | null>(null);
    const [facing, setFacing] = useState(1);
    const [spot, setSpot] = useState({ x: 80, y: floorY() });
    const [travelMs, setTravelMs] = useState(0);
    const [hop, setHop] = useState(JUMP_RISE);
    const [perched, setPerched] = useState(false);

    // Read inside timers that outlive the render they were made in.
    const state = useRef({ x: 80, y: floorY(), perched: false });
    state.current = { x: spot.x, y: spot.y, perched };

    // The gait. Only while its feet are on something.
    useEffect(() => {
        if (pose !== 'walk') return;
        const id = window.setInterval(() => setFrame((f) => (f === 1 ? 2 : 1)), STEP_MS);
        return () => window.clearInterval(id);
    }, [pose]);

    useEffect(() => {
        const lines =
            mood === 'taunt'
                ? [t('cat.taunt.1'), t('cat.taunt.2'), t('cat.taunt.3'), t('cat.taunt.4'), t('cat.taunt.5')]
                : [t('cat.idle.1'), t('cat.idle.2'), t('cat.idle.3'), t('cat.idle.4')];

        let step = 0;
        let hideAt = 0;
        /** The spot on the panel it is walking towards, if it is. */
        let wantsPerch: number | null = null;

        const say = () => {
            setLine(lines[Math.floor(Math.random() * lines.length)]);
            hideAt = window.setTimeout(() => setLine(null), SPEAK_MS);
        };

        /** Where the panel's top edge is, in the same coordinates the cat uses. */
        const perchLine = (): { top: number; left: number; right: number } | null => {
            if (!perchSelector) return null;
            const el = document.querySelector(perchSelector);
            if (!el) return null;
            const box = el.getBoundingClientRect();
            if (box.width < 40) return null;
            // Measured from the bottom, which is the axis the cat moves on.
            return { top: window.innerHeight - box.top, left: box.left, right: box.right };
        };

        const walkTo = (x: number) => {
            const from = state.current.x;
            const distance = Math.abs(x - from);
            setFacing(x >= from ? 1 : -1);
            setPose('walk');
            setTravelMs((distance / WALK_SPEED) * 1000);
            setSpot({ x, y: state.current.y });
            return (distance / WALK_SPEED) * 1000;
        };

        const jumpTo = (x: number, y: number) => {
            const ms = jumpTime(x - state.current.x, y - state.current.y);
            setFacing(x >= state.current.x ? 1 : -1);
            setPose('air');
            setTravelMs(ms);
            setSpot({ x, y });

            // A climb is already going up; adding a full arc on top of it sent
            // the cat off the top of the window on the way to the panel, which
            // is six hundred pixels of rise before the arc is even counted.
            // Level and downward hops keep the arc, because that is the only
            // thing making them read as jumps at all.
            const climb = y - state.current.y;
            setHop(climb > 60 ? 26 : JUMP_RISE);
            return ms;
        };

        const sit = () => {
            setPose('sit');
            return Phaser_Between(SIT_MIN_MS, SIT_MAX_MS);
        };

        /**
         * One decision, then a timer for the next.
         *
         * Weighted rather than uniform: mostly it walks, because a cat that
         * changes its mind every two seconds reads as a bug. The perch is the
         * rarest and the most deliberate — it has to walk under the panel
         * first, which is itself part of the performance.
         */
        const decide = (): number => {
            const perch = perchLine();
            const width = window.innerWidth;
            step += 1;

            if (state.current.perched) {
                // Down again, and it always speaks on the way out.
                setPerched(false);
                say();
                return jumpTo(
                    Math.min(width - 90, Math.max(60, state.current.x + 120 * (Math.random() < 0.5 ? -1 : 1))),
                    floorY()
                );
            }

            // Every few decisions, and only when there is something to climb.
            //
            // The intent has to survive the walk. The first version picked a
            // spot on the panel, found it was too far to jump, walked there —
            // and then forgot, because the next decision was a fresh roll and
            // the climb only came up every fourth one. Over forty seconds of
            // watching it never once got up there. Now it remembers it was
            // going somewhere.
            if (perch && (wantsPerch || step % 3 === 0)) {
                const target = wantsPerch ?? Phaser_Between(perch.left + 40, perch.right - 40);

                if (Math.abs(target - state.current.x) > 130) {
                    wantsPerch = target;
                    return walkTo(target);
                }

                wantsPerch = null;
                setPerched(true);
                say();
                return jumpTo(target, perch.top);
            }

            const roll = Math.random();
            if (roll < 0.24) {
                say();
                return sit();
            }
            if (roll < 0.44) {
                // A hop for no reason, which is the most cat thing it does.
                const ahead = state.current.x + facingStep() * Phaser_Between(70, 150);
                return jumpTo(Math.min(width - 70, Math.max(50, ahead)), floorY());
            }

            if (roll > 0.9) say();
            return walkTo(Phaser_Between(50, Math.max(60, width - 70)));
        };

        const facingStep = () => (Math.random() < 0.5 ? -1 : 1);

        let next = 0;
        const tick = () => {
            const hold = decide();
            next = window.setTimeout(tick, hold + 120);
        };
        next = window.setTimeout(tick, 700);

        return () => {
            window.clearTimeout(next);
            window.clearTimeout(hideAt);
        };
    }, [t, mood, perchSelector]);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 3,
                pointerEvents: 'none',
                overflow: 'hidden'
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    bottom: 0,
                    transform: `translate(${spot.x}px, ${-spot.y}px)`,
                    transition: `transform ${travelMs}ms ${pose === 'air' ? 'ease-out' : 'linear'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '5px'
                }}
            >
                <span
                    style={{
                        // Kept in the layout whether or not it is speaking, so
                        // the cat does not bob as lines come and go.
                        visibility: line ? 'visible' : 'hidden',
                        whiteSpace: 'nowrap',
                        fontFamily: theme.body,
                        fontSize: '0.76rem',
                        color: '#f4eee2',
                        background: 'rgba(12,10,16,0.86)',
                        border: '1px solid rgba(244,238,226,0.24)',
                        borderRadius: '4px',
                        padding: '4px 8px'
                    }}
                >
                    {line ?? ' '}
                </span>

                <img
                    key={pose === 'air' ? `air-${spot.x}-${spot.y}` : 'grounded'}
                    src={`sources/enemy${pose === 'walk' ? frame : 1}.png`}
                    alt=""
                    style={{
                        width: `${size}px`,
                        height: 'auto',
                        display: 'block',
                        imageRendering: 'pixelated',
                        transform: `scaleX(${facing})`,
                        // A pale rim first, then the usual drop shadow. A black
                        // cat on a dark street lit by a dark shadow is a black
                        // rectangle; the rim is what gives it an outline to read.
                        filter:
                            'drop-shadow(0 0 2px rgba(236,228,214,0.55)) ' +
                            'drop-shadow(0 0 7px rgba(236,228,214,0.22)) ' +
                            'drop-shadow(0 5px 7px rgba(0,0,0,0.6))',
                        // Matched to the travel, so the arc peaks in mid-flight
                        // rather than finishing before the cat has landed.
                        animation: pose === 'air' ? `mw-cat-hop ${Math.round(travelMs)}ms ease-out 1` : undefined,
                        // Read by the hop keyframe, so one rule covers every jump.
                        ['--mw-hop' as string]: `${hop}px`
                    }}
                />
            </div>
        </div>
    );
};

/** Inclusive integer between two bounds. Phaser is not loaded on these screens. */
const Phaser_Between = (min: number, max: number): number =>
    Math.floor(min + Math.random() * (max - min + 1));

export default ProwlingCat;
