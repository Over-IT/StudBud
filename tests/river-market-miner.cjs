const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
const context = new Proxy({
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 40 })
}, { get: (target, key) => target[key] || noop });
const sandbox = { window: {}, document: { addEventListener: noop, createElement: () => ({ getContext: () => context }) }, console, Math, Date, performance: { now: () => 5000 } };
vm.createContext(sandbox);
for (const file of ['multiplayerEngine.js', 'multiplayerGames2.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}
const A = sandbox.window.StudBudArcade;
function session(mode) {
    const s = {
        seed: 42, mode, startedAt: 0, testPauseAt: 0, preview: false, testing: false,
        local: { id: 'test', color: '#fff', cos: {} }, user: { id: 'test' },
        vw: 1280, vh: 720, mouse: { x: 640, y: 360, active: false },
        overlay: { classList: { contains: () => false } },
        axis: () => ({ x: 0, y: 0 }), down: () => false, remoteList: () => [],
        sfx: noop, toast: message => s.messages.push(message), messages: [],
        addScore: noop, setGoal: noop, emit: noop, ask: () => false,
        spend: amount => A.Session.prototype.spend.call(s, amount)
    };
    s.game = new A.games[mode](s);
    return s;
}
function openRiver() {
    const s = session('river'), g = s.game;
    g.rocks = []; g.logs = []; g.pools = []; g.chests = [];
    Object.assign(g.me, { x: 800, y: g.H / 2, vx: 0, vy: 0 });
    return s;
}
{
    const create = sandbox.document.createElement, originalWarn = sandbox.console.warn;
    const warnings = [], layers = [];
    sandbox.console = { ...console, warn: message => warnings.push(message) };
    sandbox.document.createElement = () => {
        const handlers = new Map();
        const layer = { handlers, lost: false, getContext: () => new Proxy({ ...context, isContextLost: () => layer.lost }, { get: (target, key) => target[key] || noop }),
            addEventListener: (name, handler) => handlers.set(name, handler) };
        layers.push(layer); return layer;
    };
    try {
        const s = session('market'), g = s.game;
        s.preview = true; g.draw(context, 900, 270);
        const first = g.cityLayer;
        g.draw(context, 900, 270);
        assert.equal(g.cityLayer, first, 'ordinary preview frames reuse the town art');
        let prevented = false;
        first.handlers.get('contextlost')({ preventDefault() { prevented = true; } });
        assert.ok(prevented); assert.equal(g.cityLayer, null);
        assert.equal(warnings.length, 1, 'cache loss is surfaced explicitly');
        g.draw(context, 900, 270);
        assert.notEqual(g.cityLayer, first, 'a lost town layer is rebuilt instead of remaining a blank map');
        const restored = g.cityLayer;
        restored.handlers.get('contextrestored')();
        g.draw(context, 900, 270);
        assert.notEqual(g.cityLayer, restored, 'restoration invalidates cleared cached pixels too');
        const missedEvent = g.cityLayer; missedEvent.lost = true;
        g.draw(context, 900, 270);
        assert.notEqual(g.cityLayer, missedEvent, 'drawing detects context loss even before its event arrives');
    } finally { sandbox.document.createElement = create; sandbox.console = { ...console, warn: originalWarn }; }
}
assert.equal(A.games.sports, undefined, 'Soccer is not registered');
const costs = A.ENERGY_COSTS;
assert.equal(session('miner').game.res.value, 40);
assert.equal(session('market').game.res.value, 40);
assert.equal(session('river').game.res.value, 30);
assert.equal(session('river').game.res.label, 'Energy');
assert.ok(Math.abs(40 / (.7 * costs.miner.dig + .23 * costs.miner.jet) - 10) < .1);
assert.equal(40 / (.8 * costs.market.walk + .2 * costs.market.sprint), 10);
assert.equal(30 / (costs.river.walk + costs.river.cast / 4), 10);
for (const fps of [30, 60, 120]) {
    const s = openRiver(), g = s.game;
    s.axis = () => ({ x: 1, y: 0 });
    g.res.value = 100;
    for (let frame = 0; frame < fps * 10; frame++) {
        s.testPauseAt = frame / fps * 1000;
        g.update(1 / fps);
    }
    assert.ok(Math.abs(g.res.value - 80) < 1e-8, `${fps} FPS steering costs exactly 2 energy/s`);
    const before = g.res.value;
    s.mouse.pressed = true; g.update(1 / fps); s.mouse.pressed = false;
    assert.ok(g.cast, 'a funded cast launches');
    assert.ok(Math.abs(before - g.res.value - costs.river.cast - costs.river.walk / fps) < 1e-8);
    g.res.value = 0;
    for (let i = 0; i < fps; i++) g.update(1 / fps);
    assert.ok(g.me.vx <= g.baseSpeed * .08 + 24 + .001, 'empty boat cannot chase at full speed');
    assert.ok(s.messages.some(message => /Out of energy/.test(message)), 'empty steering prompts a question');
    g.cast = null; g.castCd = 0; s.mouse.pressed = true; g.update(1 / fps);
    assert.equal(g.cast, null, 'empty boats cannot cast');
    s.mouse.pressed = false; s.axis = () => ({ x: 0, y: 0 });
    g.me.y = g.bank + 50; g.me.vx = g.me.vy = 0; g.surgePush = 0;
    s.testPauseAt = 32000; g.me.x = g.surgeAt(32).x;
    g.update(1 / fps);
    assert.equal(g.me.vx, 0, 'pale bank water is sheltered');
    g.me.y = g.H / 2; g.me.x = g.surgeAt(32).x;
    for (let i = 0; i < fps / 4; i++) g.update(1 / fps);
    assert.ok(g.me.vx > 100 && g.me.vx <= (g.W + 500) / 9 + 24 + 180, 'stronger wave carry has smooth, bounded forward momentum');
    Object.assign(g.me, { x: g.W - 10, y: g.bank + 1, vx: 700, vy: -700 });
    g.update(1 / fps);
    assert.ok(g.me.x >= g.W - 100, 'river edges do not teleport boats across the map');
    assert.ok(g.me.x + g.me.r <= g.W && g.me.y - g.me.r >= g.bank, 'entire hull stays inside the water');
    s.testing = true; s.axis = () => ({ x: -1, y: 0 }); g.res.value = 0;
    g.update(1 / fps);
    assert.equal(g.speedMul, 1, 'test/preview infinite resources also cover steering');
    g.draw(context, 1280, 720);
    const market = session('market'), town = market.game;
    town.cars = []; town.walls = []; town.vending = []; town.shops = []; town.moving = true;
    market.axis = () => ({ x: 1, y: 0 });
    for (let frame = 0; frame < fps * 10; frame++) {
        market.testPauseAt = frame / fps * 1000;
        market.down = () => frame % (fps * 5) >= fps * 4;
        town.update(1 / fps);
    }
    assert.ok(town.res.value < .01, `${fps} FPS typical deliveries consume 40 energy in 10 seconds`);
}
const market = session('market').game;
assert.equal(market.cars.length, 25, 'traffic reduced by 37.5%');
for (const spot of [...market.vending, ...market.blocks.map(block => block.door)]) {
    const body = { x: spot.x - 15, y: spot.y - 15, w: 30, h: 30 };
    assert.ok(!market.walls.some(wall => A.util.overlap(body, wall)), 'courtyard spots are walkable');
    // Include the entire interaction radius and the hull, not only the exact spot center.
    const interaction = { x: spot.x - 39, y: spot.y - 39, w: 78, h: 78 };
    for (const car of market.cars) {
        const lane = car.horiz
            ? { x: 0, y: car.c + car.lane - 22, w: market.W, h: 44 }
            : { x: car.c + car.lane - 22, y: 0, w: 44, h: market.H };
        assert.ok(!A.util.overlap(interaction, lane), 'every activation position is outside the full enlarged car lane');
    }
}
for (const shop of market.shops) {
    const s = session('market'), g = s.game;
    g.cars = []; Object.assign(g.me, shop.door);
    g.update(1 / 60);
    assert.ok(g.pkg, 'recessed pickup points remain reachable');
    Object.assign(g.me, g.pkg.to.door); g.update(1 / 60);
    assert.equal(g.deliveries, 1, 'recessed dropoffs complete deliveries');
}
console.log('River energy, 30/60/120 FPS currents/waves/hull bounds, 10-second budgets, recessed pickup/dropoff geometry and reduced traffic passed.');
