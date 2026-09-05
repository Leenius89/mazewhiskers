/**
 * Every tunable number in the game.
 *
 * Nothing outside this file should hard-code a value a designer might want to
 * change. Mode presets (exhibition / arcade) will branch here rather than in
 * game code.
 */
export const GameConfig = {
    // World & Map
    TILE_SIZE: 64,
    SPACING: 1.5,
    MAZE_SIZE: 41,
    /** Walls are drawn slightly larger than a tile so seams do not show. */
    WALL_OVERLAP: 1.05,

    /**
     * Buildings stand up rather than lying flat.
     *
     * The art is a front elevation, so drawing it inside a square tile made
     * the city read as a floor pattern. Stretching each building vertically
     * and anchoring it to the back of its tile gives the skyline a silhouette
     * and lets near buildings overlap far ones — which is what the y-sort was
     * built for and had almost nothing to chew on.
     *
     * The footprint on the grid is unchanged, so nothing about movement,
     * collision or pathing shifts.
     */
    BUILDING_HEIGHT: { MIN: 1.15, MAX: 1.95 },

    MAZE: {
        /**
         * Share of dead ends opened into a loop.
         *
         * A perfect maze has no cycles, which means a chase can only ever end
         * in a corner. Braiding is what makes being hunted survivable — and
         * therefore what makes the enemy worth having.
         */
        BRAID_CHANCE: 0.4,
        /** Open squares: more to find, nowhere to hide. */
        PLAZAS: 5,
        PLAZA_RADIUS: 1
    },

    /**
     * Collision boxes, in world pixels.
     *
     * The bias is deliberate and consistent: pickups are far larger than they
     * look, threats are smaller than they look, and walls match exactly.
     */
    HITBOX: {
        /** Foot boxes: width x height at the sprite's base. */
        PLAYER: { WIDTH: 36, HEIGHT: 18, FOOT_INSET: 2 },
        ENEMY: { WIDTH: 48, HEIGHT: 24, FOOT_INSET: 4 },
        /** A wall tile is its own footprint, so the box is centred, not foot-aligned. */
        WALL: { WIDTH: 96, HEIGHT: 96 },
        /** Ground footprint of an apartment tower — one tile, slightly inset. */
        APARTMENT: { WIDTH: 92, HEIGHT: 64 },
        GOAL_RADIUS: 48,
        PICKUP_RADIUS: 44
    },

    /** Tinted copy of the cat drawn on top while a building covers it. */
    OCCLUSION: {
        TINT: 0xffd166,
        ALPHA: 0.5,
        /** How many grid rows below the player can still cover it. */
        SEARCH_ROWS: 3,
        /**
         * How much of the cat has to be hidden before the copy is drawn.
         *
         * Any overlap at all used to qualify, so brushing the edge of a
         * building drew a second, half-transparent cat over the visible one.
         */
        MIN_COVERED: 0.42
    },

    /**
     * Being walled in is a loss, not a stalemate.
     *
     * A cat sealed into a dead end with full health has already lost — leaving
     * it there to watch the bar tick down is just a long wait for the same
     * ending. Standing still on purpose is fine; being unable to go anywhere
     * is not.
     */
    TRAPPED: {
        /** No open neighbouring cell for this long ends the run. */
        ENCLOSED_MS: 2200,
        /** Not moving at all for this long ends it too — an abandoned kiosk. */
        IDLE_MS: 30000,
        /** Movement below this counts as standing still. */
        MIN_TRAVEL: 14
    },

    /**
     * Motion the art does not have.
     *
     * There are two walk frames and no jump or idle art, so the life has to come
     * from how the sprite is transformed rather than from more drawings: a step
     * bounce while moving, a slow breath while still, a lean into the direction
     * of travel and a squash on landing. Costs no new assets and reads as
     * animation.
     */
    PROCEDURAL_MOTION: {
        /** Step bounce: squash/stretch amount and cycles per second. */
        WALK_SQUASH: 0.05,
        WALK_HZ: 4.2,
        /** Idle breathing. */
        BREATH_SQUASH: 0.018,
        BREATH_HZ: 0.7,
        /** Degrees of lean at full speed. */
        LEAN_DEG: 5,
        LEAN_EASE: 0.18,
        /** Landing impact. */
        LAND_SQUASH: 0.3,
        LAND_RECOVER_MS: 220
    },

    AUDIO: {
        /** Demolition. Present in the mix without drowning the music. */
        CONSTRUCT_VOLUME: 0.32
    },

    /**
     * How near the machine feels.
     *
     * Shake and a red wash rise as it closes in, so the threat is felt before it
     * is seen — in a maze it is usually behind a building when it matters.
     *
     * Deliberately gentle: the pulse stays near 1.5Hz and well under the three
     * flashes per second that photosensitivity guidance warns about, the red
     * never gets close to opaque, and everything here switches off for anyone
     * who has asked their system for reduced motion.
     */
    THREAT: {
        /** Distance at which the player starts feeling it, and where it peaks. */
        FAR: 700,
        NEAR: 190,
        PULSE_HZ: 1.5,
        /**
         * Strong enough to be a warning.
         *
         * The first pass squared the falloff and capped the red so low that at
         * any realistic distance the effect was invisible. Still well inside
         * photosensitivity guidance: 1.5Hz is half the three-per-second limit,
         * and the wash stays a long way from opaque.
         */
        FLASH_COLOR: 0xff3b30,
        MAX_FLASH_ALPHA: 0.34,
        MAX_SHAKE: 0.007,
        SHAKE_INTERVAL_MS: 260,
        /** Below 1 makes the effect ramp up earlier rather than only at contact. */
        FALLOFF_POWER: 1.15,
        /** Steady-glow strength when the system asks for reduced motion. */
        REDUCED_MOTION_SCALE: 0.55
    },

    /** Guided tutorial and story beats. */
    NARRATIVE: {
        /** Milliseconds per character. Fast enough to read, slow enough to feel spoken. */
        TYPE_MS: 28,
        PAN_MS: 700,
        PULSE_MS: 900,
        SHADE_COLOR: 0x05070c,
        SHADE_ALPHA: 0.78,
        SPOTLIGHT_PADDING: 14,
        HIGHLIGHT_COLOR: 0xf0b429,
        BOX_COLOR: 0x0b0d13,
        BOX_ALPHA: 0.94,
        /**
         * A floor, not a height. The box grows to whatever the line needs.
         *
         * It used to be fixed, which was fine at 768 pixels wide and wrong
         * everywhere else: on a phone the same sentence wraps to four lines
         * instead of two and 31 pixels of it fell out of the bottom.
         */
        BOX_MIN_HEIGHT: 104,
        BOX_MARGIN: 18,
        /** Inner gaps the box is measured from. */
        PADDING_X: 14,
        BODY_TOP: 18,
        BODY_TOP_WITH_SPEAKER: 32,
        /** Room kept under the text for the ENTER hint. */
        HINT_ROOM: 26,
        TEXT_COLOR: '#e7e9ee',
        SPEAKER_COLOR: '#f0b429',
        HINT_COLOR: '#8b919c',
        SKIP_COLOR: '#ffffff',
        SKIP_SIZE: '12px',
        /** Gap between the skip button and the top of the dialogue box. */
        SKIP_GAP: 10,
        ENEMY_LINE: '인생은 뜻하지 않은 위기가 도사리지 캬캬'
    },

    /**
     * Small talk over the head, in a bubble that never stops play.
     *
     * Everything the game had to say went through the dialogue box, which pauses
     * the world. That is right for the beats that matter and much too heavy for
     * a passing grumble, so most of the cat's character had nowhere to live.
     * These lines cost nothing to hear: they fade on their own, take no input,
     * and carry the theme in the places the tutorial has no room for.
     */
    BARKS: {
        MAX_WIDTH: 190,
        /** And never wider than this share of a narrow screen. */
        MAX_WIDTH_FRACTION: 0.66,
        PADDING: { X: 10, Y: 6 },
        FONT_SIZE: 13,
        BOX_COLOR: 0x05070c,
        BOX_ALPHA: 0.72,
        TEXT_COLOR: '#f2f4f8',
        /** The machine speaks in a colder register. */
        ENEMY_TEXT_COLOR: '#ffc9c4',
        CORNER: 8,
        TAIL: 7,
        /** Clear of the head and of the status bar above it. */
        OFFSET_Y: 26,
        /** Where it sits when flipped under the speaker instead. */
        OFFSET_Y_BELOW: 10,
        /** Keeps a flipped-up bubble off the very top edge of the view. */
        EDGE_MARGIN: 8,
        FADE_MS: 170,
        /** Long enough to read, scaled by how much there is to read. */
        HOLD_BASE_MS: 1100,
        HOLD_PER_CHAR_MS: 58,
        MAX_HOLD_MS: 3400,
        /**
         * Idle chatter is rolled, not fired, so it never feels metronomic.
         *
         * Measured rather than guessed: at one roll every 8.5s and a 0.65 chance
         * the cat managed a single line in forty seconds, because the tower and
         * panic lines outrank ambient ones and hold the bubble while they show.
         * These numbers are what actually reads as a talkative cat.
         */
        AMBIENT_INTERVAL_MS: 6000,
        AMBIENT_CHANCE: 0.8,
        PANIC_DISTANCE: 340,
        PANIC_COOLDOWN_MS: 4200,
        TAUNT_DISTANCE: 430,
        TAUNT_COOLDOWN_MS: 6500,
        LINES: {
            /** The first tower is the one that gets a written line. */
            FIRST_TOWER: '재개발이 시작되는구나!',
            TOWER: [
                '또 하나 올라갔어...',
                '여기도 아파트야?',
                '내 골목 내놔!',
                '어? 길이 없어졌잖아',
                '아니 저기 내 자리인데',
                '이러다 앉을 데도 없겠다'
            ],
            PANIC: [
                '살려줘! 도망가!',
                '아오 %$#%!',
                '$@#^%#&*!',
                '왜 나만 쫓아와!',
                '헉헉... 안 돼!',
                '@#$%! 저리 가!',
                '어어어 오지 마!'
            ],
            HURT: ['아야!', '#$%@!', '아 진짜!'],
            IDLE: [
                '여긴 또 어디야...',
                '월세가 또 올랐대',
                '집이 있으면 좋겠다',
                '보증금이 뭔데 그렇게 비싸',
                '배고파...',
                '다리 아파',
                '이 골목 아까 왔는데?',
                '내 방 한 칸이면 되는데',
                '따뜻한 데서 자고 싶다',
                '여기 원래 우리 동네였는데'
            ],
            TAUNT: [
                '캬캬캬',
                '어디 가시나~',
                '집은 있고?',
                '월세나 내라옹',
                '거기 서라옹',
                '보증금 5억이다냥',
                '재개발은 못 참지',
                '도망가봐야 소용없다냥',
                '여긴 이제 내 구역이다'
            ]
        }
    },

    /** Health and jumps, read where the player is actually looking. */
    STATUS_BAR: {
        WIDTH: 46,
        HEIGHT: 5,
        /** Gap between the cat's head and the bar. */
        OFFSET_Y: 14,
        BACKGROUND: 0x11131a,
        BORDER: 0x000000,
        HEALTHY: 0x5cbba6,
        HURT: 0xf0b429,
        CRITICAL: 0xe8635a,
        /** Below this share of max health the bar turns. */
        HURT_AT: 0.55,
        CRITICAL_AT: 0.25,
        /** Jump stock. The dots were 2.4px across — too small to count at a glance. */
        PIP: { RADIUS: 3.4, GAP: 10, FILLED: 0xffe27a, EMPTY: 0x3d424b, OFFSET_Y: 8 }
    },

    /** Contact shadows, drawn procedurally until the shadow asset lands. */
    SHADOW: {
        PLAYER: { WIDTH: 34, HEIGHT: 12 },
        ENEMY: { WIDTH: 54, HEIGHT: 18 },
        ALPHA: 0.28,
        COLOR: 0x000000
    },

    HEALTH: {
        MAX: 100,
        /** The cost of simply existing. Applied every DRAIN_INTERVAL ms. */
        DRAIN_AMOUNT: -1,
        DRAIN_INTERVAL: 1000,
        /**
         * Rent day.
         *
         * A flat drain is a number going down; a periodic lump is a *deadline*.
         * The warning window exists so the player can decide whether to grab one
         * more fish before it lands.
         */
        RENT: {
            INTERVAL: 30000,
            AMOUNT: -12,
            WARN_MS: 5000,
            FLASH_COLOR: 0xb43026,
            FLASH_ALPHA: 0.34,
            FLASH_MS: 420
        }
    },

    PLAYER: {
        SCALE: 0.08,
        SPEED: 160,
        JUMP: {
            HEIGHT: 150,
            /**
             * Reach in grid cells, not pixels.
             *
             * Corridors sit on a two-cell lattice, so a jump measured in pixels
             * lands between cells on the diagonal and reads as blocked. Snapping
             * to cells makes every direction behave the same and always drops
             * the cat in the middle of a tile.
             */
            CELLS: 2,
            /** Airtime for a straight two-cell hop; diagonals scale up from this. */
            DURATION: 600,
            /** Held stock. Capped so jumps cannot be hoarded for the endgame. */
            MAX_STOCK: 3,
            /** Axis input above this magnitude counts toward the eight-way direction. */
            DIRECTION_THRESHOLD: 0.38,
            /** Brief freeze on touchdown, so landing has weight. */
            RECOVERY_MS: 80,
            LANDING_SHAKE: 0.004,
            LANDING_SHAKE_MS: 120,
            DUST: { COUNT: 6, SIZE: 14, SPREAD: 34, DURATION: 320, COLOR: 0xd9d2c5 }
        },
        LOOK_AHEAD_DIST: 50,
        /** Grid cell the run starts in. `createMaze` clears this and its neighbours. */
        START_TILE: { X: 1, Y: 1 },
        GOAL_INDICATOR: {
            DISTANCE: 60,
            SIZE: 12,
            SPREAD: 2.5,
            COLOR: 0xffff00
        },
        /**
         * Dash: the one active answer to being seen.
         *
         * Costs no resource, so it is always available to a player who reads
         * the telegraph — the skill is in the timing, not in having saved up.
         */
        DASH: {
            /**
             * Tuned so one dash covers a little over a cell — far enough to pass
             * through the enemy's 48px body rather than stopping inside it.
             * Provisional until it has been played by hand.
             */
            SPEED: 520,
            DURATION_MS: 200,
            COOLDOWN_MS: 2000,
            /** Covers the whole burst plus a beat on either side. */
            INVULNERABLE_MS: 300,
            TRAIL_ALPHA: 0.4
        },
        /** Flash while the cat is briefly untouchable after a hit. */
        INVULNERABLE_BLINK_MS: 110,

        /** Ring showing where a jump would land, drawn while jump is held. */
        LANDING_PREVIEW: {
            RADIUS: 26,
            THICKNESS: 2,
            VALID_COLOR: 0x6ee7a8,
            BLOCKED_COLOR: 0xff5c5c
        }
    },

    ENEMY: {
        SCALE: 0.15,
        /** Chase speed. The player runs at 160, so it can always be outrun. */
        SPEED: 110,

        /**
         * What the machine can actually see.
         *
         * A cone with real line-of-sight is what turns the enemy from a
         * homing instant-death into something a corner can beat.
         */
        VISION: {
            RANGE: 400,
            HALF_ANGLE_DEG: 45,
            CONE_COLOR: 0xffe27a,
            CONE_ALPHA_CALM: 0.08,
            CONE_ALPHA_ALERT: 0.2,
            CONE_COLOR_ALERT: 0xff6b5c
        },
        PATROL: { SPEED: 55, REPICK_MS: 2600 },
        /** Heard something: walks to where the player was last seen. */
        SUSPICIOUS: { SPEED: 72, GIVE_UP_MS: 3000 },
        /** A beat of warning before the chase starts. */
        TELEGRAPH: { DURATION_MS: 1200 },
        /** Sight lost for this long ends a chase. */
        LOSE_SIGHT_MS: 3000,
        /**
         * Contact is a heavy hit, not a death.
         *
         * An instant kill gives an exhibition visitor nothing to learn from.
         * Two hits still end the run, so it stays frightening.
         */
        CONTACT: { DAMAGE: -35, KNOCKBACK: 300, INVULNERABLE_MS: 1500 },
        JUMP: {
            HEIGHT: 120,
            /** Reach in grid cells, matching the player's. */
            CELLS: 2,
            DURATION: 800,
            /**
             * Without this the wall collider fired a jump on every contact,
             * so the enemy hammered itself against the same wall instead of
             * going around it.
             */
            COOLDOWN_MS: 2500,
            /** Axis input above this counts toward the eight-way direction. */
            DIRECTION_THRESHOLD: 0.38
        },
        SPAWN: {
            MIN_DISTANCE: 500,
            MAX_ATTEMPTS: 100,
            /** Delay after the intro camera sequence finishes. */
            DELAY_AFTER_INTRO: 10000
        },
        LOOK_AHEAD_DIST: 50,
        /** Camera move that introduces the enemy. */
        INTRO: {
            PAN_DURATION: 1000,
            ZOOM: 1.3,
            HOLD: 2000,
            RETURN_DURATION: 500
        },
    },

    MILK: {
        PROBABILITY: 0.05,
        SCALE: 0.05,
        ANIM_DURATION: 1500,
        FLOAT_DISTANCE: 10
    },

    FISH: {
        PROBABILITY: 0.1,
        SCALE: 0.05,
        ANIM_DURATION: 1000,
        FLOAT_DISTANCE: 15,
        HEAL_AMOUNT: 20,
        /** Worth more inside a cell that is about to be built on. */
        RISK_HEAL_AMOUNT: 35,
        FRAME_RATE: 4
    },

    GOAL: {
        SCALE: 0.1,
        /** Beat of stillness before the tutorial starts talking. */
        INTRO: { START_DELAY: 700 },
        /** Pixelated fade used when the player reaches the goal. */
        TRANSITION: {
            PIXEL_SIZE: 32,
            STEPS: 8,
            STEP_DELAY: 200
        },
        VICTORY_DELAY: 500
    },

    APARTMENT: {
        /**
         * Towers loom. They were drawn barely larger than the houses they
         * replace, which undersold the only thing in the game that is winning.
         * The ground footprint is unchanged — this is purely how big it reads.
         */
        WALL_SCALE: 0.34,
        /** Stretched further upward, like the buildings. */
        HEIGHT_SCALE: 1.15,
        /** Time from world creation to the first row being announced. */
        DELAY: 15000,
        SPAWN_INTERVAL: 10000,
        FADE_IN: 300,
        /**
         * Blocks, not rows.
         *
         * They land anywhere and grow as the redevelopment advances, so there is
         * no safe middle and no single direction to run.
         */
        BLOCK: {
            MIN_SIZE: 3,
            MAX_SIZE: 7,
            /** Never announced on top of the player; they need a beat to move. */
            MIN_PLAYER_DISTANCE_CELLS: 4,
            PLACEMENT_ATTEMPTS: 24
        },
        /** The goal is off-limits until this much of the city is gone. */
        GOAL_SAFE_UNTIL: 0.55,
        /** Hazard tape goes up this long before the towers land. */
        WARNING_MS: 3000,
        /** Dust burst between the warning ending and the tower appearing. */
        DUST_MS: 700,
        /** Nearby buildings rattle when a tower lands beside them. */
        NEIGHBOUR_SHAKE: { CELLS: 2, ANGLE: 1.6, DURATION: 260 },
        WARNING: {
            COLOR: 0xf0b429,
            STRIPE: 12,
            PULSE_MS: 600,
            ALPHA: 0.5
        },
        /** Being shoved clear of a construction site. */
        PUSH: { DURATION: 220, SEARCH_CELLS: 6 },
        /**
         * A tower landing shoves whatever is standing beside it.
         *
         * Radially, away from the block — so the direction you are thrown is
         * the direction you were already standing in, and a block landing
         * around you scatters everyone outward rather than into each other.
         */
        KNOCKBACK: { RADIUS_CELLS: 2.2, SPEED: 400, DURATION: 240 },
        LANDING_SHAKE: 0.006,
        LANDING_SHAKE_MS: 220
    },

    /** Screen-space HUD drawn by the scene: minimap, rent meter, alley gauge. */
    HUD: {
        MARGIN: 12,
        /** Room under the minimap for the readout and rent bar. */
        RESERVED_TAIL: 18,
        MINIMAP: {
            CELL: 3,
            /** Never more than this share of the canvas width. */
            MAX_WIDTH_FRACTION: 0.26,
            BACKGROUND: 0x11131a,
            OPEN: 0x4a5568,
            WALL: 0x22262f,
            APARTMENT: 0x8b5a2b,
            WARNING: 0xf0b429,
            PLAYER: 0xffe27a,
            GOAL: 0x5cbba6,
            ENEMY: 0xe8635a,
            ALPHA: 0.82
        },
        TEXT_COLOR: '#d7dae0',
        WARN_COLOR: '#f0b429'
    },

    /** Atmosphere driven by how far the redevelopment has got. */
    ATMOSPHERE: {
        VIGNETTE: { FROM: 0.45, TO: 0.72 },
        /** Colour drains out of the city as it is replaced. WebGL only. */
        SATURATION: { FROM: 0, TO: -0.55 }
    },

    /** Phaser does not cull plain sprites, so the scene does it here. */
    CULLING: { INTERVAL_MS: 220, PADDING: 260 },

    CAMERA: {
        MOBILE: {
            ZOOM: 0.5,
            LERP: 0.1
        },
        DESKTOP: { ZOOM: 1 },
        /** How far the frame leans toward the direction of travel. */
        LOOKAHEAD: { DISTANCE: 72, EASE: 0.06 },
        /** Pull-back during a jump arc. */
        JUMP_ZOOM: { SCALE: 0.93, OUT_FRACTION: 0.45 },
        /** Shake is silent beyond this distance from the camera centre. */
        SHAKE_FALLOFF: 900
    },

    INPUT: {
        /** A jump pressed this long before it becomes possible still counts. */
        JUMP_BUFFER_MS: 120,
        JOYSTICK: {
            AREA_SIZE: 120,
            HANDLE_SIZE: 60,
            /** Distance at which the stick reads as fully deflected. */
            MAX_RADIUS: 60,
            /** Deflection below this reads as centred, so a resting thumb does not creep. */
            DEAD_ZONE: 0.18,
            JUMP_BUTTON_SIZE: 80
        }
    },

    SCORE: {
        PER_MILK: 50,
        PER_FISH: 100,
        PER_JUMP: 10
    },

    /**
     * The floor gives way.
     *
     * A hole opens under the cat, it turns over, and it drops through. The
     * sequence was already written this way and never played: the hole was
     * drawn with no depth, which put it behind the entire city, and the cat
     * kept its physics body, so the wall colliders separated it back out of
     * every position the animation moved it to — it stood up again mid-death.
     */
    GAME_OVER: {
        RISE: 46,
        RISE_DURATION: 420,
        FALL: 96,
        FALL_DURATION: 460,
        /** Drawn as an ellipse: a circle reads as a ball, not an opening. */
        HOLE_RADIUS: 34,
        HOLE_SQUASH: 0.5,
        HOLE_COLOR: 0x05070c,
        HOLE_OPEN_MS: 300,
        HOLE_CLOSE_MS: 260,
        /**
         * How small the cat is by the time the hole has it, as a fraction of
         * its own scale — the sprite is drawn at 0.08, so an absolute value
         * here made it swell on the way down instead of dropping away.
         */
        VANISH_SCALE: 0.3,
        EMIT_DELAY: 500
    },

    /**
     * Getting hit has to land.
     *
     * Damage used to be a number going down, a shake and a sound. The hit
     * itself is sold by the hitch: a beat where the world stops dead, the cat
     * flashes solid white, and only then does motion resume.
     */
    HIT: {
        /** Frozen physics. Long enough to feel, short enough not to read as lag. */
        STOP_MS: 80,
        FLASH_MS: 110,
        SHAKE: 0.014,
        SHAKE_MS: 200
    },

    /**
     * The cat sweats when the machine is close.
     *
     * Blue against an orange cat and a red warning wash, so it stays legible
     * on top of both.
     */
    SWEAT: {
        POOL: 12,
        NEAR: 180,
        FAR: 520,
        COLOR: 0x7fd4ff,
        SIZE: 4,
        HEAD_OFFSET_X: 13,
        HEAD_OFFSET_Y: 8,
        MIN_INTERVAL_MS: 130,
        MAX_INTERVAL_MS: 620,
        RISE: 15,
        DRIFT: 26,
        FALL: 34,
        DURATION: 520,
        /** Reduced motion thins the drops rather than removing the cue. */
        REDUCED_MOTION_SCALE: 0.45
    }
};
