/*
 * Determinism harness for comparing two builds of the same game.
 *
 * Injected ahead of the app. It takes over the three things that make two
 * runs differ — the frame clock, requestAnimationFrame and Math.random — so
 * that the same seed and the same key presses must produce the same run in
 * any build whose game logic is the same.
 */
(function () {
    var params = new URLSearchParams(location.search);

    // Settings and "seen the opening" before the app reads them.
    try {
        var diff = params.get('qaDiff') || 'easy';
        localStorage.setItem('mazewhiskers.settings', JSON.stringify({ muted: true, language: 'ko', difficulty: diff, appearance: 'dark' }));
        localStorage.setItem('mazewhiskers.seenIntro', '1');
        sessionStorage.setItem('mazewhiskers.seenIntro', '1');
        // A first-time player, as far as anything the game remembers goes.
        // Without it the Toss build skips the tutorial the original shows.
        if (params.get('qaFresh') !== '0') {
            ['mazewhiskers.tutorialSeen', 'mazewhiskers.owner'].forEach(function (k) { localStorage.removeItem(k); });
            Object.keys(localStorage).forEach(function (k) { if (k.indexOf('mazewhiskers.records.') === 0) localStorage.removeItem(k); });
        }
    } catch (e) {}

    /*
     * A sort whose comparator calls are fixed by the input alone.
     *
     * The maze carver shuffles with `sort(() => rng.frac() - 0.5)`. With an
     * inconsistent comparator the order is up to the engine, and V8 gives a
     * different one before and after it has optimised the code — so the same
     * seed made different cities on different runs of the same build. Both
     * builds get this same merge sort, which takes that variable out.
     */
    var nativeSort = Array.prototype.sort;
    Array.prototype.sort = function (compare) {
        if (typeof compare !== 'function') return nativeSort.call(this, compare);
        var a = Array.prototype.slice.call(this);
        var merge = function (lo, hi) {
            if (hi - lo < 2) return a.slice(lo, hi);
            var mid = (lo + hi) >> 1, l = merge(lo, mid), r = merge(mid, hi), out = [], i = 0, j = 0;
            while (i < l.length && j < r.length) out.push(compare(l[i], r[j]) <= 0 ? l[i++] : r[j++]);
            while (i < l.length) out.push(l[i++]);
            while (j < r.length) out.push(r[j++]);
            return out;
        };
        var sorted = merge(0, a.length);
        for (var k = 0; k < sorted.length; k++) this[k] = sorted[k];
        return this;
    };

    var queue = [];
    var nextId = 0;
    var clock = 1000;
    var realNow = performance.now.bind(performance);
    // Frozen from the first line: the game loop's start time and every frame
    // after it read this clock, so they are the same numbers in every run.
    var frozen = true;

    window.requestAnimationFrame = function (cb) {
        queue.push({ id: ++nextId, cb: cb });
        return nextId;
    };
    window.cancelAnimationFrame = function (id) {
        queue = queue.filter(function (e) { return e.id !== id; });
    };
    performance.now = function () { return frozen ? clock : realNow(); };
    // Phaser's tweens run on the wall clock, not the game loop — which is why
    // a jump's arc came out differently depending on how fast the machine
    // stepped the frames. Tie it to the same clock.
    var DATE_BASE = 1758240000000;
    Date.now = function () { return DATE_BASE + clock; };

    var calls = 0;
    var seeded = false;

    var qa = {
        freeze: function () { clock = realNow(); frozen = true; },
        pending: function () { return queue.length; },
        /** One frame, only if something is waiting for one. */
        frame: function (dt) {
            if (!queue.length) return false;
            var batch = queue;
            // Only Phaser's own frames move the clock. The menu's animation
            // library also asks for frames, and how many of those happen
            // before the game starts depends on nothing but timing.
            var phaser = batch.some(function (e) { return e.cb.__phaser; });
            if (phaser) { clock += dt === undefined ? 1000 / 60 : dt; qa.phaserSteps++; }
            queue = [];
            for (var i = 0; i < batch.length; i++) {
                try { batch[i].cb(clock); } catch (e) { console.error('[qa] frame', e); }
            }
            return true;
        },
        seed: function (s) {
            var a = s >>> 0;
            calls = 0;
            seeded = true;
            Math.random = function () {
                calls++;
                a |= 0; a = (a + 0x6d2b79f5) | 0;
                var t = Math.imul(a ^ (a >>> 15), 1 | a);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        },
        randomCalls: function () { return seeded ? calls : -1; },
        key: function (type, key, code, keyCode) {
            var ev = new KeyboardEvent(type, { key: key, code: code, bubbles: true, cancelable: true });
            Object.defineProperty(ev, 'keyCode', { get: function () { return keyCode; } });
            Object.defineProperty(ev, 'which', { get: function () { return keyCode; } });
            window.dispatchEvent(ev);
        },
        post: function (name, data) {
            return fetch('/__trace?name=' + encodeURIComponent(name), { method: 'POST', body: JSON.stringify(data) });
        }
    };

    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    var r1 = function (v) { return Math.round(v * 10) / 10; };
    var hash = function (s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };

    var KEYS = {
        up: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40],
        left: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39],
        space: [' ', 'Space', 32], enter: ['Enter', 'Enter', 13]
    };
    var press = function (k) { qa.key('keydown', KEYS[k][0], KEYS[k][1], KEYS[k][2]); };
    var release = function (k) { qa.key('keyup', KEYS[k][0], KEYS[k][1], KEYS[k][2]); };

    /**
     * Start a run, then drive it with a fixed script and record it.
     *
     * The script's own choices come from a generator separate from the game's,
     * so the key presses are the same in every build whatever the game does.
     */
    qa.run = async function (o) {
        var findStart = function () {
            return Array.prototype.find.call(document.querySelectorAll('div'), function (d) {
                return d.textContent.trim() === 'GAME START' && d.style.boxShadow;
            });
        };
        // Tag the game loop's frame callback so it can be told apart.
        var RAF = window.Phaser && window.Phaser.DOM && window.Phaser.DOM.RequestAnimationFrame;
        if (RAF && !RAF.prototype.__qaTagged) {
            var start = RAF.prototype.start;
            RAF.prototype.start = function () {
                var out = start.apply(this, arguments);
                if (this.step) this.step.__phaser = true;
                return out;
            };
            RAF.prototype.__qaTagged = true;
        }
        // And know when loading has finished, so frames are never spent
        // waiting on the network — that is where the runs drifted apart.
        var LP = window.Phaser && window.Phaser.Loader && window.Phaser.Loader.LoaderPlugin;
        if (LP && !LP.prototype.__qaTagged) {
            var loadComplete = LP.prototype.loadComplete;
            LP.prototype.loadComplete = function () {
                window.__qaLoaded = (window.__qaLoaded || 0) + 1;
                return loadComplete.apply(this, arguments);
            };
            LP.prototype.__qaTagged = true;
        }
        window.__qaLoaded = 0;
        qa.phaserSteps = 0;

        for (var i = 0; i < 100 && !findStart(); i++) await wait(100);
        if (!findStart()) return { error: 'no start button' };
        findStart().click();

        for (i = 0; i < 100 && !document.querySelector('canvas'); i++) await wait(50);
        if (!document.querySelector('canvas')) return { error: 'no canvas' };

        qa.seed(o.seed);

        // Boot: exactly three game frames, enough for the scene to start
        // loading. Then no frames at all until it has been created — loading
        // finishes on its own callbacks, so the scene is born at the same
        // clock reading in every run however long the files took.
        var bootFrames = 0;
        var loopRunning = function () { return queue.some(function (e) { return e.cb.__phaser; }); };
        for (i = 0; i < 400 && !loopRunning(); i++) await wait(20);
        // Loading needs frames to progress, and how many depends on the
        // network. So every boot frame takes zero time: the scene is born at
        // the same clock reading however many it took. Twelve of them first,
        // back to back, so the loop's delta history is all zeros by then in
        // every run rather than zeros in proportion to the download.
        while (qa.phaserSteps < 12 && !window.__MW__) {
            qa.frame(0);
            bootFrames++;
            await Promise.resolve();
        }
        for (i = 0; i < 600 && !window.__MW__; i++) {
            qa.frame(0);
            bootFrames++;
            await wait(50);
        }
        var loadedAtStep = qa.phaserSteps;
        var sc = window.__MW__ && window.__MW__.scene;
        if (!sc) return { error: 'scene never created', bootFrames: bootFrames };

        // Debug mode is only how the harness reaches the scene. Its drawing
        // is taken off the screen for captures; it never touched the run.
        if (params.get('qaClean') === '1') {
            var world = sc.physics && sc.physics.world;
            if (world) {
                world.drawDebug = false;
                if (world.debugGraphic) world.debugGraphic.clear().setVisible(false);
            }
            if (sc.debugOverlay) { try { sc.debugOverlay.destroy(); } catch (e) {} sc.debugOverlay = null; }
        }

        var createdAt = {
            phaserSteps: qa.phaserSteps,
            loadedAtStep: loadedAtStep,
            randomCalls: qa.randomCalls(), time: r2(sc.time.now), maze: hash(JSON.stringify(sc.maze || [])),
            mode: sc.mode && sc.mode.key, size: sc.maze ? sc.maze.length : 0, search: location.search,
            camera: [sc.cameras.main.width, sc.cameras.main.height, r2(sc.cameras.main.zoom)],
            player: sc.player ? [r2(sc.player.x), r2(sc.player.y)] : null
        };
        var mazeRows = (sc.maze || []).map(function (row) { return row.join(''); });

        var s = (o.seed ^ 0x9e3779b9) >>> 0;
        var inputRandom = function () {
            s |= 0; s = (s + 0x6d2b79f5) | 0;
            var t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        var samples = [];
        var held = null;
        var endedAt = -1;
        var introFrames = -1;
        var dirs = ['up', 'down', 'left', 'right'];

        for (var f = 0; f < o.frames; f++) {
            // Through the tutorial the way a player would: read, press Enter.
            if (sc.narrativeActive) {
                if (f % 20 === 0) press('enter');
                if (f % 20 === 2) release('enter');
            } else {
                if (introFrames < 0) introFrames = f;
                var t = f - introFrames;
                if (t % 40 === 0) {
                    if (held) release(held);
                    held = dirs[Math.floor(inputRandom() * 4)];
                    press(held);
                }
                if (t % 150 === 75) press('space');
                if (t % 150 === 77) release('space');
            }

            qa.frame();
            await Promise.resolve();

            if (f % 30 === 0) {
                var p = sc.player;
                samples.push([
                    f,
                    sc.state && sc.state.current,
                    p ? r2(p.x) : null, p ? r2(p.y) : null,
                    r2(sc.health),
                    (sc.enemies || []).map(function (e) { return [r1(e.x), r1(e.y)]; }),
                    sc.apartmentSystem && sc.apartmentSystem.group ? sc.apartmentSystem.group.getLength() : null,
                    qa.randomCalls()
                ]);
            }

            var phase = sc.state && sc.state.current;
            if (endedAt < 0 && (phase === 'gameover' || phase === 'victory')) endedAt = f;
            if (endedAt >= 0 && f - endedAt > 60) break;
        }

        var result = {
            name: o.name, seed: o.seed, bootFrames: bootFrames, createdAt: createdAt,
            introFrames: introFrames, endedAt: endedAt, finalPhase: sc.state && sc.state.current,
            framesRun: f, samples: samples, mazeRows: mazeRows
        };
        await qa.post(o.name, result);
        return {
            name: o.name, bootFrames: bootFrames, createdAt: createdAt, introFrames: introFrames,
            endedAt: endedAt, finalPhase: result.finalPhase, framesRun: f,
            last: samples[samples.length - 1]
        };
    };

    window.__qa = qa;
})();
