export const GameConfig = {
    // World & Map
    TILE_SIZE: 64,
    SPACING: 1.5,
    MAZE_SIZE: 41,
    WALL_SCALE: 0.5,

    // Player
    PLAYER: {
        SCALE: 0.08,
        SPEED: 160,
        JUMP: {
            HEIGHT: 150,
            DISTANCE: 200,
            DURATION: 600
        },
        DEPTH: 21,
        LOOK_AHEAD_DIST: 50
    },

    // Enemy
    ENEMY: {
        SCALE: 0.15,
        SPEED: 80,
        JUMP: {
            HEIGHT: 120,
            DISTANCE: 200,
            DURATION: 800
        },
        DEPTH: 15,
        SPAWN: {
            MIN_DISTANCE: 500
        },
        LOOK_AHEAD_DIST: 50
    },

    // Items
    MILK: {
        PROBABILITY: 0.05,
        SCALE: 0.05,
        ANIM_DURATION: 1500
    },
    FISH: {
        PROBABILITY: 0.1,
        SCALE: 0.05,
        ANIM_DURATION: 1000,
        HEAL_AMOUNT: 20
    },

    // Apartment System
    APARTMENT: {
        WALL_SCALE: 0.22,
        BASE_DEPTH: 1000,
        DELAY: 15000,
        SPAWN_INTERVAL: 10000
    }
};
