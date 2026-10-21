const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const noop = () => {};

function harness(nativeDpr = 2, uncullEndpoints = false, legacyLava = false) {
    let time = 0, calls = 0, hypots = 0;
    const document = { hidden: false, addEventListener: noop, removeEventListener: noop };
    function canvas() {
        const surface = { width: 0, height: 0, style: {} };
        let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        const stack = [];
        const ctx = new Proxy({
            canvas: surface, isContextLost: () => false,
            getTransform: () => ({ ...m }),
            setTransform(a, b, c, d, e, f) { m = { a, b, c, d, e, f }; },
            save() { stack.push({ ...m }); }, restore() { m = stack.pop(); },
            translate(x, y) { m.e += m.a * x + m.c * y; m.f += m.b * x + m.d * y; },
            scale(x, y) { m.a *= x; m.b *= x; m.c *= y; m.d *= y; },
            rotate: noop, measureText: () => ({ width: 50 }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop })
        }, { get: (target, key) => key in target ? target[key] : () => { calls++; } });
        surface.getContext = () => ctx;
        return surface;
    }
    document.createElement = () => canvas();
    const math = Object.create(Math);
    math.random = () => .5;
    math.hypot = (...args) => { hypots++; return Math.hypot(...args); };
    const sandbox = {
        window: { devicePixelRatio: nativeDpr }, document, console, Math: math,
        Date: class extends Date { static now() { return time; } },
        performance, requestAnimationFrame: () => 1
    };
    vm.createContext(sandbox);
    for (const file of ['multiplayerEngine.js', 'multiplayerGames.js', 'multiplayerGames2.js', 'multiplayerGames3.js']) {
        let source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
        if (legacyLava && file === 'multiplayerGames2.js') source = source.replace(
            'if (this.T[index] !== 6) continue;\n                    const distance = Math.hypot',
            'const distance = Math.hypot').replace(
            'if (distance > radius) continue;', 'if (this.T[index] !== 6 || distance > radius) continue;');
        if (file === 'multiplayerGames3.js') {
            if (uncullEndpoints === true || uncullEndpoints === 'start') source = source.replace('if (this.seen(start.x, start.y, 100))', uncullEndpoints === true ? 'if (true)' : 'if (team === 0 || this.seen(start.x, start.y, 100))');
            if (uncullEndpoints === true || uncullEndpoints === 'base') source = source.replace('if (this.seen(base.x, base.y, 120))', uncullEndpoints === true ? 'if (true)' : 'if (team === 0 || this.seen(base.x, base.y, 120))');
        }
        vm.runInContext(source, sandbox, { filename: file });
    }
    const A = sandbox.window.StudBudArcade;
    function session(mode, fullResolution = false) {
        const button = { setAttribute: noop };
        const surface = canvas();
        const s = Object.assign(Object.create(A.Session.prototype), {
            mode, seed: 42, user: { id: 'host' }, local: { id: 'host', color: '#60a5fa', cos: {} },
            room: { host_id: 'host', state: {} }, roster: new Map([['host', { id: 'host' }]]),
            remotes: new Map(), keys: new Set(), justPressed: new Set(),
            isHost: true, practice: true, preview: false, countdown: 0, countdownHidden: true,
            reward: 20, fullResolution, startedAt: 0, t: 0, lastFrame: 0,
            mouse: { x: 640, y: 360, active: false },
            overlay: { clientWidth: 1366, clientHeight: 768, classList: { contains: () => false },
                querySelector: selector => selector === '.mpg-resolution' ? button : null },
            canvas: surface, ctx: surface.getContext(), layoutHud: noop, checkEnd: noop, updateMeter: noop,
            axis: () => ({ x: 0, y: 0 }), down: () => false, pressed: () => false, sfx: noop,
            addScore: noop, setGoal: noop, emit: noop, toast: noop, finish: noop,
            placeHud(c) { c.save(); return { x: 0, y: 0, scale: 1 }; }
        });
        s.game = new A.games[mode](s);
        s.resize();
        return s;
    }
    return { A, document, session, setTime(value) { time = value; }, get calls() { return calls; }, get hypots() { return hypots; } };
}

// Exercise the actual Session.frame -> game.update -> game.draw path, not isolated drawing helpers.
for (const nativeDpr of [1, 2]) for (const mode of ['defense', 'miner', 'market']) {
    function run(fullResolution) {
        const h = harness(nativeDpr), s = h.session(mode, fullResolution);
        let updates = 0, draws = 0, finalPixels = 0;
        const update = s.game.update.bind(s.game), draw = s.game.draw.bind(s.game);
        s.game.update = dt => { updates++; update(dt); };
        s.game.draw = (...args) => {
            draws++;
            if (draws > 500) finalPixels += s.canvas.width * s.canvas.height;
            draw(...args);
        };
        for (let i = 1; i <= 600; i++) {
            h.setTime(i * 40);
            s.frame(i * 40); // Deliberately sustained 25 FPS input; not a measured browser FPS.
        }
        return { s, updates, draws, finalPixels, state: JSON.stringify({
            me: s.game.me, net: s.game.net(), resource: s.game.res?.value,
            health: s.game.health, wave: s.game.waveNumber, enemies: s.game.enemies,
            tiles: s.game.T && Array.from(s.game.T), cash: s.game.wallets
        }) };
    }
    const full = run(true), auto = run(false);
    assert.equal(auto.state, full.state, `${mode}: resolution preserves actual game simulation and network state`);
    assert.equal(auto.updates, 600);
    assert.equal(auto.draws, 600, 'auto resolution never drops rendering or physics frames');
    assert.equal(auto.s.dpr, .75);
    assert.equal(auto.s.vw, full.s.vw);
    assert.equal(auto.s.vh, full.s.vh);
    assert.equal(auto.s.scale, full.s.scale, 'input coordinate conversion is unchanged');
    assert.ok(auto.finalPixels < full.finalPixels * (nativeDpr === 2 ? .15 : .57));
    console.log(`${mode}, native DPR ${nativeDpr}: 600 full Session frames, identical simulation; final 100-frame backing pixels ${full.finalPixels.toLocaleString()} -> ${auto.finalPixels.toLocaleString()} (${(100 * (1 - auto.finalPixels / full.finalPixels)).toFixed(2)}% fewer).`);
}
{
    function run(legacy) {
        const h = harness(1, false, legacy), s = h.session('miner', true);
        // Include visible lava so preserving its exact reveal/fade values is checked too.
        s.game.T[4 * s.game.cols + s.game.spawnCol + 2] = 6;
        const before = h.hypots;
        for (let i = 1; i <= 600; i++) { h.setTime(i * 16); s.frame(i * 16); }
        return { hypots: h.hypots - before, state: JSON.stringify({
            me: s.game.me, lava: Array.from(s.game.lavaVisibility), tiles: Array.from(s.game.T)
        }) };
    }
    const before = run(true), after = run(false);
    assert.equal(after.state, before.state, 'actual mining frames retain exact lava reveals and physics');
    assert.ok(before.hypots - after.hypots > 30000, 'non-lava cells no longer invoke expensive distance math');
    console.log(`600 complete Miner Session frames: ${before.hypots} -> ${after.hypots} Math.hypot calls; identical tiles, lava visibility and physics.`);
}

{
    const h = harness(), s = h.session('defense');
    s.frame(16);
    s.frame(1000); // An isolated long stall must not lower sharpness.
    assert.equal(s.dpr, 2);
    for (let i = 1; i <= 90; i++) s.frame(1000 + i * 40);
    assert.equal(s.dpr, 1.75);
    for (let i = 1; i <= 600; i++) s.frame(4600 + i * 1000 / 60);
    assert.equal(s.dpr, 2, 'healthy frame cadence restores native resolution');
    s.fullResolution = true;
    for (let i = 1; i <= 300; i++) s.frame(14600 + i * 40);
    assert.equal(s.dpr, 2, 'full-resolution lock opts out of adaptation');
    h.document.hidden = true;
    let updates = 0, draws = 0;
    s.game.update = () => { updates++; };
    s.game.draw = () => { draws++; };
    for (let i = 1; i <= 100; i++) s.frame(26600 + i * 40);
    assert.equal(updates, 100, 'hidden live hosts retain authoritative simulation');
    assert.equal(draws, 0, 'hidden live sessions submit no canvas work');
    s.preview = true;
    s.frame(31000);
    assert.equal(updates, 100, 'hidden disposable previews do not simulate either');
}
{
    function scene(uncull, x, y) {
        const h = harness(1, uncull), s = h.session('defense');
        s.spectator = true;
        s.game.cam = { x, y };
        const before = h.calls;
        s.game.draw(s.ctx, 360, 200);
        return h.calls - before;
    }
    const before = scene(true, 500, 650), after = scene(false, 500, 650);
    assert.ok(before - after >= 30, `offscreen entry/base decorations skip actual Defense drawing commands: ${before} -> ${after}`);
    for (const [endpoint, x, y] of [['start', 110, 160], ['base', 850, 1310], ['start', 110, 245], ['base', 850, 1410]]) {
        assert.equal(scene(false, x, y), scene(endpoint, x, y), 'visible/edge-straddling endpoints retain all decoration commands');
    }
    console.log(`Complete Defense.draw, narrow mid-lane viewport: ${before} -> ${after} canvas commands (${before - after} offscreen commands removed). Visible/partial endpoint parity passed.`);
}
console.log('Adaptive hysteresis/recovery/opt-out, logical input bounds, hidden live host simulation and preview suspension passed. Pixel/command work measurements only; GPU raster time and Chromebook FPS require browser/device profiling.');
