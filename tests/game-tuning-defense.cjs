const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
const texts = [];
let drawCalls = 0;
const ctx = new Proxy({
    fillText: text => texts.push(text),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 50 })
}, { get: (target, key) => target[key] || (() => { drawCalls++; }) });
const sandbox = {
    window: {}, document: { addEventListener: noop, createElement: () => ({ getContext: () => ctx }) },
    console, Math, Date, performance
};
vm.createContext(sandbox);
for (const file of ['multiplayerEngine.js', 'multiplayerGames.js', 'multiplayerGames2.js', 'multiplayerGames3.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}
const A = sandbox.window.StudBudArcade;
{
    const marker = A.games.skyline.prototype.drawJumpThroughMarker;
    const lines = [];
    const markerCtx = { save: noop, restore: noop, beginPath: noop, stroke: noop,
        moveTo: (x, y) => lines.push(['move', x, y]), lineTo: (x, y) => lines.push(['line', x, y]) };
    const platform = { x: 100, y: 200, w: 160, h: 14, oneway: true, cityKit: 'scaffold' };
    marker.call({}, markerCtx, platform);
    assert.deepEqual(lines[0], ['move', 180, 191], 'one centered arrow marks a jump-through scaffold');
    assert.deepEqual(lines[1], ['line', 180, 177], 'arrow points up through the deck');
    for (const override of [{ oneway: false }, { stair: true }, { fireEscape: true }, { factoryStep: true }, { off: true }]) {
        lines.length = 0;
        marker.call({}, markerCtx, { ...platform, ...override });
        assert.equal(lines.length, 0, 'solid platforms, stairs and inactive decks remain unmarked');
    }
}
{
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert.doesNotMatch(app, /fillText\(['"]LOG RIDE['"]/, 'Crossy Road no longer displays the redundant log-riding label');
    assert.match(app, /effect\.kind === 'log-land'[\s\S]*?ctx\.ellipse/, 'log landings retain their visual ripple');
}
{
    const g = new A.games.skyline({ seed: 42, local: { color: '#fff' }, user: { id: 'culling-test' } });
    const floor = g.checkpoints.find(cp => cp.biome === 1).y;
    const chamber = { id: -1, top: floor - 1000, bottom: floor + 1000, columns: Array.from({ length: 100 }, (_, i) => i * 500) };
    for (const method of ['drawStationFrame']) {
        drawCalls = 0;
        g[method](ctx, chamber, floor - 1300, floor + 1200);
        const full = drawCalls;
        drawCalls = 0;
        g[method](ctx, chamber, floor - 1300, floor + 1200, 900, 1900);
        assert.ok(drawCalls < full * .15, `${method} skips at least 85% of draw operations outside a narrow viewport`);
    }
    const bottoms = [], supportCtx = new Proxy({
        fillRect: (x, y, w, h) => bottoms.push(y + h),
        moveTo: (x, y) => bottoms.push(y), lineTo: (x, y) => bottoms.push(y),
        arc: (x, y, r) => bottoms.push(y + r)
    }, { get: (target, key) => target[key] || noop });
    g.drawFactoryFrame(supportCtx, chamber, floor - 1300, floor + 1200);
    assert.equal(bottoms.length, 0, 'unconnected factory columns and roof trusses are not drawn');
    bottoms.length = 0;
    g.drawMachineSupport(supportCtx, { x: 100, y: floor - 25, w: 200, h: 14, bi: 1 });
    assert.equal(bottoms.length, 0, 'factory pads have no floating feet');
    bottoms.length = 0;
    g.drawMachineSupport(supportCtx, { x: 100, y: floor - 50, w: 200, h: 14, bi: 1,
        below: { x: 100, y: floor + 300, w: 200 } });
    assert.equal(bottoms.length, 0, 'factory supports cannot connect to nonexistent decks or cross the biome boundary');
    const below = { x: 100, y: floor - 50, w: 200, h: 14 };
    g.solids.push(below);
    g.drawMachineSupport(supportCtx, { x: 100, y: floor - 200, w: 200, h: 14, bi: 1, below });
    assert.ok(bottoms.length > 0 && bottoms.every(y => y <= below.y), 'connected factory supports end on an actual lower deck');
    const machine = g.drills.find(d => d.gantry), factory = g.challenges[machine.chamber];
    drawCalls = 0;
    g.drawFactoryFrame(ctx, factory, factory.top - 300, factory.bottom + 300);
    assert.ok(drawCalls > 0, 'frames carrying real machines remain visible');
    drawCalls = 0;
    g.drawFactoryFrame(ctx, factory, factory.top - 300, factory.bottom + 300, factory.right + 1000, factory.right + 2000);
    assert.equal(drawCalls, 2, 'offscreen machine frames only save/restore context and skip their geometry');
}
function session(mode, id = 'host', ids = ['host', 'guest', 'ally', 'rival']) {
    const events = [], messages = [], taps = new Set();
    const s = {
        mode, seed: 42, user: { id }, local: { id, color: '#60a5fa', cos: {} },
        room: { host_id: 'host', state: {} }, roster: new Map(ids.map(key => [key, { id: key }])),
        isHost: id === 'host', practice: false, preview: false, countdown: 0, reward: 20,
        rewardAmount: () => 20,
        startedAt: Date.now(), t: 0, vw: 1280, vh: 720, canvas: { style: {} },
        mouse: { x: 640, y: 360, active: false }, overlay: { classList: { contains: () => false } },
        axis: () => ({ x: 0, y: 0 }), down: () => false, pressed: (...keys) => keys.some(key => taps.has(key)),
        remoteList: () => [], sfx: noop, addScore: n => { s.score = (s.score || 0) + n; },
        setGoal: n => { s.goal = n; }, emit: event => events.push(event), toast: message => messages.push(message),
        spend: amount => s.game.res.spend(amount), ask: callback => { s.answer = callback; return true; },
        refill: noop, placeHud: (c, x, y, w, h) => { c.save(); return { x: 0, y: 0, scale: 1 }; },
        events, messages, taps
    };
    s.game = new A.games[mode](s);
    return s;
}
{
    const s = session('skyline'), g = s.game;
    for (const flight of [false, true]) {
        s.testing = flight; s.testFlight = flight; s.testInvincible = flight;
        g.cp = g.checkpoints[1];
        Object.assign(g.me, { x: 1, y: 300, vx: 400, vy: 900 });
        Object.assign(g, { dead: .8, dash: .15, kick: .2, slow: 2, boost: 3, buffer: .1, sprung: true });
        const deaths = g.deaths, energy = g.res.value;
        s.taps.add('KeyR'); g.updatePlayer(1 / 60); s.taps.clear();
        assert.equal(g.me.x, g.cp.x); assert.equal(g.me.y, g.cp.y - g.me.h - 2);
        assert.equal(g.dead, 0); assert.equal(g.dash, 0); assert.equal(g.kick, 0); assert.equal(g.slow, 0);
        assert.equal(g.me.vx, 0); assert.equal(g.me.vy, 0);
        assert.equal(g.deaths, deaths, 'manual return is recovery, not a hazard death');
        assert.equal(g.res.value, energy, 'checkpoint return neither grants nor drains energy');
        g.returnToCheckpoint();
        assert.equal(g.me.x, g.cp.x, 'button and keyboard share immediate recovery, including during flight');
    }
    const lines = [];
    let point;
    const frameCtx = new Proxy({
        moveTo(x, y) { point = [x, y]; },
        lineTo(x, y) { lines.push([point, [x, y]]); point = [x, y]; }
    }, { get: (target, key) => target[key] || noop });
    g.drawFactoryFrame(frameCtx, { top: 0, bottom: 1200, columns: [0, 500, 1000], id: -1 }, 0, 1000);
    assert.equal(lines.length, 0, 'factory walls no longer add floating cross-braces between unsupported interior columns');
}
for (const fps of [30, 60, 120]) {
    const s = session('duel'), g = s.game, sounds = [];
    s.sfx = name => sounds.push(name);
    g.updateHill = noop; g.updateCamera = noop;
    g.orb.t = 999; g.invuln = 999;
    g.me.x = g.stage.x + g.stage.w / 2; g.me.y = g.stage.y - g.me.h;
    g.shield = 30; g.shieldRest = 1;
    for (let i = 0; i < fps * 2; i++) g.update(1 / fps);
    assert.ok(Math.abs(g.shield - 52) < .001, `${fps} FPS: lowered shield recovers exactly 22 points after one second of rest`);
    g.shield = 90; g.shieldRest = 0;
    for (let i = 0; i < fps; i++) g.update(1 / fps);
    assert.equal(g.shield, 100, 'shield regeneration never exceeds full durability');
    s.down = key => key === 'KeyS'; g.stun = 0;
    g.shield = 70;
    for (let i = 0; i < fps / 2; i++) g.update(1 / fps);
    assert.ok(g.shield < 70, 'holding guard wears down the shield instead of healing it');
    s.down = () => false;
    g.breakShield();
    assert.equal(sounds.at(-1), 'shieldBreak', 'breaking guard uses its own shattering effect');
    g.hitlag = .2;
    for (let i = 0; i < fps * 2; i++) g.update(1 / fps);
    assert.ok(Math.abs(g.shield - 22) < .001, 'broken shields recover while lowered, including during hitlag');
    assert.ok(g.shieldBreak > 0, 'recovery does not bypass the guard lockout');
    g.respawn = 1; g.shieldRest = 0;
    const before = g.shield;
    g.update(1 / fps);
    assert.ok(g.shield > before, 'unused shields also recover during respawn');
    assert.ok(!sounds.includes('click') && !sounds.includes('boom'), 'shield feedback never falls back to UI clicks or explosions');
}
{
    const s = session('duel'), g = s.game, sounds = [];
    s.sfx = name => sounds.push(name);
    g.attackHits = () => true;
    const swing = { k: 'sw', by: 'guest', x: 0, y: 0, d: 1, p: 1 }, from = { x: 0, y: 0, name: 'Rival' };
    const reset = () => Object.assign(g, { invuln: 0, stun: 0, guard: true, guardT: .5, shield: 100 });
    g.me.face = -1;
    reset(); g.receiveSwing(swing, from);
    assert.equal(sounds.at(-1), 'shieldBlock');
    reset(); g.guardT = .1; g.receiveSwing(swing, from);
    assert.equal(sounds.at(-1), 'shieldParry');
    reset(); sounds.length = 0; g.receiveSwing({ ...swing, h: 1, p: 3 }, from);
    assert.deepEqual(sounds, ['shieldBreak'], 'a guard-breaking Special plays one shatter, not an overlapping generic hit');
    reset(); g.guard = false; g.receiveSwing(swing, from);
    assert.equal(sounds.at(-1), 'hammerHit');
    g.onEvent({ k: 'hit', by: 'host', broke: true }, from);
    assert.equal(sounds.at(-1), 'shieldBreak', 'attacker hears the shield break too');
    g.onEvent({ k: 'hit', by: 'host', parry: true }, from);
    assert.equal(sounds.at(-1), 'shieldParry', 'attacker hears the parry too');
    g.onEvent({ k: 'ko', by: 'host' }, from);
    assert.equal(sounds.at(-1), 'fighterKO', 'KO feedback is short instead of a match victory jingle');
}
for (const fps of [30, 60, 120]) {
    const s = session('river'), g = s.game;
    assert.equal(g.rocks.length, 18);
    g.logs = [{ x0: 0, y: 800, spd: 200, phase: 0, fq: 0, brokenLap: -1 }];
    g.rocks = [{ x: 450, y: 800, r: 40 }];
    for (let i = 0; i <= fps * 3; i++) g.updateLogs(i / fps);
    assert.equal(g.logs[0].brokenLap, 0, `${fps} FPS logs break before passing through rocks`);
    const fresh = session('river').game;
    fresh.logs = [{ ...g.logs[0], brokenLap: -1, breakLap: undefined }]; fresh.rocks = g.rocks;
    fresh.updateLogs(3);
    assert.equal(fresh.logs[0].brokenLap, 0, 'late-joining clients derive the same broken log');
    g.rocks = []; g.logs = []; g.chests = [];
    g.pools = [{ x: 1200, y: 850, r: 130, phase: 0, ampX: 0, ampY: 0 }];
    Object.assign(g.me, { x: 1250, y: 850, vx: 0, vy: 0 });
    g.update(1 / fps);
    assert.ok(g.whirlpool, 'boat is captured in a whirlpool');
    const before = g.me.aim;
    for (let i = 0; i < fps / 2; i++) g.update(1 / fps);
    assert.ok(g.whirlpool && Math.abs(g.me.aim - before) > 2, 'captured boat visibly rotates');
    for (let i = 0; i < fps * 2 && g.whirlpool; i++) g.update(1 / fps);
    assert.equal(g.whirlpool, null);
    assert.ok(Math.hypot(g.me.vx, g.me.vy) > 700, 'boat is shot out, not merely stunned');
    assert.ok(Math.hypot(g.me.x - 1200, g.me.y - 850) > 200);
}
const market = session('market').game;
assert.equal(market.cars.length, 25, 'traffic is reduced by 37.5%');
for (const block of market.blocks) for (const [ox, oy] of [[40, 40], [block.w - 40, 40], [40, block.h - 40], [block.w - 40, block.h - 40]]) {
    const body = { x: block.x + ox - 15, y: block.y + oy - 15, w: 30, h: 30 };
    assert.ok(!market.walls.some(w => A.util.overlap(body, w)), 'all four safe corners are walkable');
    for (let time = 0; time < 120; time += 3) {
        assert.ok(!market.cars.some(car => A.util.overlap(body, market.carHitRect(car, time))), 'corners stay outside enlarged traffic hitboxes');
    }
}
for (const car of market.cars) {
    const a = market.carRect(car, 0), b = market.carRect(car, 13), hit = market.carHitRect(car, 0);
    assert.equal(car.horiz ? a.y : a.x, car.horiz ? b.y : b.x, 'cars do not weave into sidewalks');
    assert.ok(Math.abs(car.lane) + 17 <= 73, 'car artwork stays inside the road, before the 12px curb');
    assert.equal(hit.w, a.w + 10); assert.equal(hit.h, a.h + 10);
}
for (const seed of [1, 42, 12345, 67890]) {
    const s = session('miner'); s.seed = seed; const g = new A.games.miner(s);
    let dry = 0, volcanic = 0, caveLava = 0;
    for (let i = 0; i < g.T.length; i++) {
        if (g.naturalCaves[i] === 1) dry++;
        if (g.naturalCaves[i] === 2) volcanic++;
        if (g.naturalCaves[i] && g.T[i] === 6) caveLava++;
    }
    assert.ok(dry > volcanic * 2, 'most natural cave area is dry');
    assert.ok(caveLava < (dry + volcanic) * .08, 'lava does not fill natural caves');
    assert.equal(g.tileHashes.length, g.T.length, 'tile detail hashes are precomputed rather than regenerated per frame');
    g.draw(ctx, 1280, 720);
    assert.ok(drawCalls < 50000, 'mining draws only the visible tile region');
    drawCalls = 0;
}
const settled = session('miner').game;
{
    const s = session('miner'), g = s.game, sounds = [];
    s.sfx = (...args) => sounds.push(args);
    g.tile = () => 0;
    g.hitLava();
    assert.equal(sounds.length, 0, 'dry ground never plays a burn sound');
    g.tile = () => 6;
    g.hitLava();
    assert.deepEqual(sounds, [['burn', 1000]], 'actual lava contact plays the dedicated burn effect');
    g.hitLava();
    assert.equal(sounds.length, 1, 'remaining in lava respects the damage cooldown');
    g.lavaCd = 0; g.hitLava();
    assert.equal(sounds.length, 2, 'the next lava damage tick sizzles again');
}
settled.T.fill(1); settled.F.fill(0); settled.D.fill(0); settled.flowing.clear();
const source = 10 * 110 + 10;
settled.T[source] = 6; settled.flowing.add(source);
settled.flowLava(2);
assert.equal(settled.flowing.size, 0, 'fully blocked lava retires from the active simulation');
settled.T[source + 110] = 0; settled.wakeLava(10, 11); settled.flowLava(1);
assert.equal(settled.T[source + 110], 6, 'mining next to settled lava wakes it and preserves downward flow');
for (const fps of [30, 60, 120]) {
    const s = session('shooter'), g = s.game;
    assert.ok(g.W > 2600 && g.H > 1700);
    g.pickups = []; g.orbs = []; g.multiplayer = true;
    g.weapon = 'rail'; g.weaponT = 20;
    const before = g.zoom, target = g.cameraZoom();
    g.update(1 / fps);
    assert.ok(g.zoom < before && g.zoom > target, 'weapon zoom eases rather than snapping');
    texts.length = 0; g.draw(ctx, 1280, 720);
    assert.ok(texts.includes('Long-range scope: view widening'), 'zoom change is explained visually');
    for (let i = 0; i < fps * 2; i++) g.update(1 / fps);
    assert.ok(Math.abs(g.zoom - target) < .001);
    g.me.x = 16; g.me.y = 16; g.cam.x = 16; g.cam.y = 16;
    for (let i = 0; i < fps; i++) g.update(1 / fps);
    const half = s.vw / g.zoom / 2;
    assert.ok(half - g.cam.x > 100 && half - g.cam.x <= 110.001, 'camera can show 110 world units beyond perimeter walls');
    s.overlay.classList.contains = () => true;
    for (const pointerType of ['mouse', 'pen', 'touch']) {
        g.me.x = g.W / 2; g.me.y = g.H / 2;
        g.cam.x = g.me.x; g.cam.y = g.me.y;
        Object.assign(s.mouse, { x: s.vw, y: s.vh / 2, active: true, pointerType });
        for (let i = 0; i < fps; i++) g.update(1 / fps);
        if (pointerType === 'touch') assert.ok(Math.abs(g.cam.x - g.me.x) < 1, 'touch input does not trigger hover look-ahead');
        else assert.ok(g.cam.x > g.me.x + 40, `${pointerType} moves the camera on hybrid touch devices`);
    }
}
const hill = session('duel'), hg = hill.game;
{
    const s = session('shooter'), g = s.game, sounds = [];
    s.sfx = (...args) => sounds.push(args);
    g.pickups = []; g.orbs = [];
    s.down = key => key === 'KeyF';
    for (const [type, sound] of Object.entries({ blaster: 'laserBlaster', shotgun: 'laserScatter', rapid: 'laserRapid', rail: 'laserRail' })) {
        g.weapon = type; g.weaponT = 20; g.fireCd = 0; g.res.value = 150;
        sounds.length = 0;
        g.update(1 / 60);
        assert.equal(sounds.filter(args => args[0] === sound).length, 1, `${type} fires one cue per trigger, not per pellet`);
        assert.ok(!sounds.some(args => args[0] === 'shoot'));
        sounds.length = 0;
        const event = { k: 'sh', w: type, x: g.me.x + 100, y: g.me.y, a: 0, by: 'guest' };
        g.onEvent(event, { id: 'guest', color: '#fff' });
        assert.equal(sounds[0][0], sound);
        assert.ok(sounds[0][2] > 0 && sounds[0][2] < .35, 'nearby remote lasers are attenuated');
        sounds.length = 0;
        g.onEvent({ ...event, x: g.me.x + 900 }, { id: 'guest' });
        g.onEvent(event, { id: s.user.id });
        assert.equal(sounds.length, 0, 'distant shots and local echoes stay silent');
    }
    assert.equal(g.weaponInfo('unknown').sound, 'laserBlaster', 'legacy or unknown weapons retain the default sound');
}
hg.hill = () => ({ zone: { x: hg.me.x, y: hg.me.y + hg.me.h, w: 200 }, left: 20 });
hg.specialCharge = 0; hg.updateHill(5);
assert.equal(hg.specialCharge, 100, 'five uncontested hill seconds charge the special');
hg.specialCharge = 0; hg.invuln = 0;
for (let i = 0; i < 3; i++) hg.onEvent({ k: 'hit', by: hill.user.id }, { id: 'guest', x: 0, y: 0 });
assert.equal(hg.specialCharge, 100, 'three landed attacks charge the special');
const skyline = session('skyline').game;
const oldCount = skyline.solids.length;
skyline.cp = skyline.checkpoints[2]; skyline.captureCheckpoint();
assert.equal(skyline.solids.length, oldCount, 'lower routes remain playable after reaching Space');
assert.ok(skyline.solids.includes(skyline.summit), 'culling preserves the finish');
assert.ok(skyline.solids.some(p => p.boundary), 'culling preserves boundary walls');
skyline.draw(ctx, 1280, 720);
console.log('Fishing destruction/spin/ejection, dry caves, four traffic-safe corners, eased shooter zoom, charged specials and retained Escape to Space routes passed.');

const host = session('defense'), game = host.game;
assert.equal(game.teamOf('host'), game.teamOf('ally'));
assert.notEqual(game.teamOf('host'), game.teamOf('guest'));
const order = (id, action, data = {}) => game.command({ seq: (game.lastSeq[id] || 0) + 1, action, ...data,
    ...(action === 'build' ? game.gridPoint(data.x, data.y, game.teamOf(id)) : {}) }, id);
order('host', 'build', { type: 0, x: 500, y: 340 });
assert.equal(game.troops.length, 1); assert.equal(game.wallets[0], 120);
order('ally', 'upgrade', { id: game.troops[0].id });
assert.equal(game.troops[0].level, 2); assert.equal(game.wallets[0], 60, 'teammates spend the same wallet');
order('guest', 'upgrade', { id: game.troops[0].id });
assert.equal(game.troops[0].level, 2, 'rivals cannot upgrade friendly troops');
order('host', 'build', { type: 0, x: 1700, y: 340 });
order('host', 'build', { type: 0, x: 500, y: 160 });
assert.equal(game.troops.length, 1, 'enemy-side and path construction are rejected');
order('host', 'build', { type: 'map', x: 400, y: 300 });
assert.equal(game.troops.length, 1, 'invalid troop types are rejected without spending money');
order('host', 'answer', { count: 1 });
assert.equal(game.wallets[0], 120);
order('ally', 'answer', { count: 1 });
assert.equal(game.wallets[0], 180, 'answers credit the shared wallet');
order('guest', 'send', { type: 0 });
const enemy = game.enemies[0];
assert.equal(enemy.team, 0); assert.equal(enemy.segment, 0); assert.equal(enemy.progress, 0);
assert.equal(game.pointOnPath(enemy).x, game.paths[0][0].x, 'sent enemies start at the opposing entry');
game.command({ seq: game.lastSeq.guest, action: 'send', type: 0 }, 'guest');
assert.equal(game.enemies.length, 1, 'retransmitted commands cannot duplicate enemies');
const earned = game.wallets[0];
for (let i = 0; i < 1000 && game.enemies.length; i++) game.simulate(1 / 60);
assert.equal(game.enemies.length, 0);
assert.equal(game.health[0], 100, 'the archer defends the path');
assert.equal(game.wallets[0], earned + 14, 'kill bounties go to the defending team wallet');
order('host', 'upgrade', { id: game.troops[0].id });
assert.equal(game.troops[0].level, 3);
const finalWallet = game.wallets[0];
order('host', 'upgrade', { id: game.troops[0].id });
assert.equal(game.wallets[0], finalWallet, 'max-level upgrades do not consume money');
game.troops = [];
order('host', 'send', { type: 2 });
assert.equal(game.enemies.length, 0, 'unaffordable sends are rejected');
for (let i = 2; i <= 10; i++) order('host', 'answer', { count: i });
for (let i = 0; i < 4; i++) order('host', 'send', { type: 2 });
for (let i = 0; i < 6000 && !game.finished; i++) game.simulate(1 / 60);
assert.equal(game.health[1], 0); assert.equal(game.winner, 0); assert.equal(game.finished, true);
assert.ok(game.teamValue(0) > game.teamValue(1));
const snapshot = game.snapshot();
const guest = session('defense', 'guest');
guest.game.onState({ td: snapshot }, { id: 'rival' });
assert.equal(guest.game.finished, undefined, 'non-host snapshots are ignored');
guest.game.onState({ td: snapshot }, { id: 'host' });
assert.equal(guest.game.winner, 0);
assert.equal(JSON.stringify(guest.game.wallets), JSON.stringify(game.wallets));
const rejoining = session('defense', 'ally').game;
rejoining.onRoom({ state: { defense: snapshot } });
assert.equal(rejoining.winner, 0, 'persisted room updates restore final results before standings are calculated');
assert.equal(rejoining.s.goal, game.teamValue(0), 'final room snapshots update reportable scores without requiring another simulation frame');
rejoining.onRoom({ state: { defense: { ...snapshot, serial: snapshot.serial - 1, winner: 1 } } });
assert.equal(rejoining.winner, 0, 'older database saves cannot roll back newer realtime state');
guest.game.onState({ td: { ...snapshot, serial: snapshot.serial - 1, winner: 1 } }, { id: 'host' });
assert.equal(guest.game.winner, 0, 'stale snapshots cannot roll back the battle');
const rows = ['host', 'ally', 'guest', 'rival'].map(id => ({ id, ...game.standingValues(id) }));
assert.equal(game.resultTitle(rows), 'Blue team wins!');
assert.equal(game.isWinner(rows, 'ally'), true, 'all winning teammates receive the winning result');
const client = session('defense', 'guest', ['host', 'guest']);
{
    const late = session('defense', 'late', ['host', 'guest', 'late']);
    const authoritativeTeams = { host: 0, guest: 1, late: 1 };
    const existing = session('defense', 'host', ['host', 'guest']).game;
    existing.simulate(3);
    existing.wallets = [230, 95]; existing.health = [91, 75];
    const snapshot = existing.snapshot();
    late.room.state = { defense: snapshot, defense_teams: authoritativeTeams };
    late.game.onRoom(late.room);
    assert.equal(late.game.myTeam, 1, 'late arrivals follow server teams, not client roster alternation');
    assert.equal(late.game.teamOf('late'), 1, 'older snapshots cannot erase a late arrival');
    assert.deepEqual([...late.game.wallets], [...existing.wallets], 'late arrivals share the current wallet instead of resetting the economy');
    assert.deepEqual([...late.game.health], [...existing.health], 'late arrivals inherit the current base health');
    existing.s.room.state = { defense_teams: authoritativeTeams };
    existing.onRoom(existing.s.room);
    assert.equal(existing.teamOf('late'), 1, 'the host includes newcomers in the next battle snapshot');
    assert.equal(existing.snapshot().teams.late, 1);
}
client.game.request('send', { type: 0 });
assert.equal(client.game.enemies.length, 0, 'non-hosts never simulate or spend optimistically');
client.game.update(.7);
assert.ok(client.events.length >= 2, 'unacknowledged orders are retried');
const authority = session('defense', 'host', ['host', 'guest']).game;
for (const event of client.events) authority.onEvent(event, { id: 'guest' });
assert.equal(authority.enemies.length, 1, 'retries execute exactly once on the host');
client.game.onState({ td: authority.snapshot() }, { id: 'host' });
assert.equal(client.game.pending.length, 0, 'host acknowledgements clear pending orders');
assert.equal(client.game.teamOf('host'), 0); assert.equal(client.game.teamOf('guest'), 1, 'two-player rooms are 1v1');
client.game.recharge();
for (let i = 0; i < 8; i++) client.game.request('send', { type: 0 });
client.answer(true);
assert.equal(client.game.answerCount, 0, 'a full pending queue does not skip an answer-credit counter');
client.answer = undefined; client.game.recharge();
assert.equal(client.answer, undefined, 'full queues block new questions instead of losing earned cash');
client.game.onState({ td: authority.snapshot() }, { id: 'host' });
for (const event of client.game.pending) authority.onEvent(event, { id: 'guest' });
client.game.onState({ td: authority.snapshot() }, { id: 'host' });
client.game.recharge(); client.answer(true);
assert.equal(client.game.pending[0].count, 1, 'the next accepted answer still uses the consecutive credit counter');
client.game.draw(ctx, 390, 844);
assert.ok(client.game.ui.rects.length >= 8, 'touch play exposes build, send, upgrade and answer controls');
console.log('1v1/teams, shared wallets, paid placement/upgrades/sends, path entry, kills, defeat, host authority, retries, acknowledgements and team-wide results passed.');
const admin = session('defense');
admin.testing = true; admin.game.wallets[0] = 0;
admin.game.request('build', { type: 1, x: 500, y: 340 });
admin.game.request('upgrade', { id: admin.game.troops[0].id });
admin.game.request('upgrade', { id: admin.game.troops[0].id });
admin.game.request('send', { type: 2 });
assert.equal(admin.game.troops[0].level, 3);
assert.equal(admin.game.enemies.length, 1);
assert.equal(admin.game.wallets[0], 0, 'admin test purchases are free rather than bypassing the shared wallet only visually');
admin.game.draw(ctx, 1280, 720);
assert.ok(admin.game.ui.rects.filter(r => r.id.startsWith('send:')).every(r => r.on), 'admin send controls remain enabled with an empty wallet');
assert.match(admin.game.goalText(), /unlimited test cash/);
{
    const limited = session('defense');
    limited.testing = true; limited.limitedTestEnergy = true;
    limited.game.wallets[0] = 0;
    limited.game.request('build', { type: 1, x: 500, y: 340 });
    assert.equal(limited.game.troops.length, 0, 'limited staff tests cannot build without cash');
    limited.game.wallets[0] = 1000;
    limited.game.request('build', { type: 1, x: 500, y: 340 });
    assert.equal(limited.game.troops.length, 1);
    assert.ok(limited.game.wallets[0] < 1000, 'limited staff tests debit the shared wallet');
    assert.ok(limited.game.sellValue(limited.game.troops[0]) > 0, 'paid test towers retain their normal refund');
    assert.doesNotMatch(limited.game.goalText(), /unlimited/);
}
console.log('Admin Tower Defense builds, upgrades and sends honor infinite test resources without changing normal paid matches.');
{
    const ids = ['host', 'guest', 'ally', 'rival', 'blue3', 'red3', 'blue4', 'red4'];
    const s = session('defense', 'host', ids), g = s.game;
    s.testing = true;
    const nextCell = team => {
        for (let y = 85; y <= 1415; y += g.gridSize) for (let x = team * 1100 + 95; x <= team * 1100 + 1005; x += g.gridSize) {
            if (g.validPlacement(x, y, team)) return { x, y };
        }
        throw new Error('No empty test cell');
    };
    const build = (id, data = {}) => g.command({ seq: (g.lastSeq[id] || 0) + 1, action: 'build', type: 0,
        ...nextCell(g.teamOf(id)), ...data }, id);
    for (const id of ids) {
        for (let i = 0; i < 10; i++) build(id, { owner: 'spoofed' });
        assert.equal(g.troopCount(id), 10, 'four teammates share forty slots equally');
        const before = g.troops.length; build(id);
        assert.equal(g.troops.length, before, 'an eleventh tower is rejected even with unlimited admin cash');
    }
    assert.equal(g.troops.length, 80, 'each team has a hard forty-tower maximum');
    assert.equal(g.troops.filter(t => t.team === 0).length, 40);
    assert.ok(g.troops.every(t => t.owner !== 'spoofed'), 'ownership comes from the authenticated order sender');
    g.draw(ctx, 1280, 720);
    assert.ok(g.ui.rects.filter(r => r.id.startsWith('build:')).every(r => !r.on), 'build buttons disable at the personal cap');
    assert.match(g.goalText(), /Towers 10\/10/);
    const restored = session('defense', 'guest', ids).game;
    const state = g.snapshot(); restored.applySnapshot(state);
    assert.equal(restored.troopCount('ally'), 10, 'ownership survives snapshot restoration');
    assert.equal(restored.troops.length, 80);
    const previousSerial = restored.receivedSerial, originalError = sandbox.console.error;
    sandbox.console.error = noop;
    try {
        const extra = { ...state.troops[0], id: state.nextId, ...nextCell(0) };
        restored.applySnapshot({ ...state, serial: state.serial + 1, troops: [...state.troops, extra] });
        assert.equal(restored.receivedSerial, previousSerial, 'over-cap snapshots do not overwrite valid battle state');
        restored.applySnapshot({ ...state, serial: state.serial + 1, troops: state.troops.map((t, i) => i ? t : { ...t, owner: 'guest' }) });
        assert.equal(restored.receivedSerial, previousSerial, 'ownership cannot be reassigned to an opposing player');
    } finally { sandbox.console.error = originalError; }
    assert.ok(restored.s.messages.some(message => /invalid tower|invalid battle/i.test(message)), 'invalid ownership is reported explicitly');
}
console.log('Grid placement, authenticated ownership, equal forty-tower team shares and snapshot restoration passed.');
for (const count of [1, 2, 3, 4, 8]) {
    const ids = Array.from({ length: count }, (_, i) => [`blue${i}`, `red${i}`]).flat();
    const s = session('defense', 'blue0', ids);
    assert.equal(s.game.playerTroopLimit, Math.floor(40 / count), 'tower allowance rounds down equally for each team size');
    assert.ok(s.game.playerTroopLimit * count <= 40);
    assert.equal(s.game.buildType, null, 'no Archer or other tower is selected at startup');
    s.mouse.active = true; s.game.update(0);
    s.game.draw(ctx, s.vw, s.vh);
    assert.equal(s.game.previewPoint, null, 'a pointer alone cannot create a tower preview');
}
{
    const s = session('defense'), g = s.game;
    g.wallets[0] = 1000;
    g.request('build', { type: 0, x: 515, y: 1135 });
    const tower = g.troops[0];
    assert.equal(g.sellValue(tower), 45);
    g.request('upgrade', { id: tower.id }); assert.equal(g.sellValue(tower), 90);
    g.request('upgrade', { id: tower.id }); assert.equal(g.sellValue(tower), 180, 'refund includes every paid upgrade');
    const wallet = g.wallets[0];
    for (const id of ['ally', 'guest']) g.command({ seq: (g.lastSeq[id] || 0) + 1, action: 'sell', id: tower.id }, id);
    assert.equal(g.troops.length, 1, 'teammates and opponents cannot sell someone else’s tower');
    assert.equal(g.wallets[0], wallet);
    const sell = { seq: (g.lastSeq.host || 0) + 1, action: 'sell', id: tower.id };
    g.command(sell, 'host'); g.command(sell, 'host');
    assert.equal(g.troops.length, 0);
    assert.equal(g.wallets[0], wallet + 180, 'retransmitted sell orders refund only once');
    assert.ok(g.s.events.some(event => event.k === 'td-error' && /only sell towers you own/.test(event.message)), 'rejected selling is reported to the requesting player');
    s.testing = true;
    g.request('build', { type: 0, x: 515, y: 1135 });
    assert.equal(g.sellValue(g.troops[0]), 0, 'free staff-test towers do not generate refunds');
}
console.log('Rounded team-size quotas, unselected startup, owner-only selling, upgrade refunds and duplicate-order safety passed.');
{
    const s = session('defense', 'host', ['host', 'guest']), g = s.game;
    s.testing = true;
    const build = id => {
        for (let y = 85; y <= 1415; y += 70) for (let x = 95; x <= 1005; x += 70) {
            if (g.validPlacement(x, y, 0)) {
                g.command({ seq: (g.lastSeq[id] || 0) + 1, action: 'build', type: 0, x, y }, id);
                return;
            }
        }
        throw new Error('No empty test cell');
    };
    for (let i = 0; i < 25; i++) build('host');
    s.roster.set('ally', { id: 'ally' }); g.teams.ally = 0;
    assert.equal(g.playerTroopLimit, 20);
    build('host'); assert.equal(g.troops.length, 25, 'late joining preserves old towers but blocks an over-quota owner');
    for (let i = 0; i < 15; i++) build('ally');
    build('ally'); assert.equal(g.teamTroopCount(0), 40, 'team cap applies even when a newcomer has individual slots left');
    const restored = session('defense', 'guest', ['host', 'guest', 'ally']).game;
    restored.applySnapshot(g.snapshot());
    assert.equal(restored.troopCount('host'), 25, 'late-join snapshots preserve existing owners above their new quota');
    g.selected = g.troops[0].id;
    for (const [w, h] of [[1280, 720], [390, 844], [844, 390]]) {
        s.vw = w; s.vh = h; s.scale = 1;
        s.hudBounds = A.Session.prototype.hudBounds; s.placeHud = A.Session.prototype.placeHud;
        g.draw(ctx, w, h);
        assert.ok(g.ui.rects.some(r => r.id === 'tower-panel'));
        assert.equal(g.ui.rects.some(r => r.id === 'shop-panel'), w >= 668, 'narrow displays show management separately rather than overlapping the shop');
        for (const rect of g.ui.rects) {
            assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= w + .01 && rect.y + rect.h <= h + .01, 'HUD controls remain inside the viewport');
        }
    }
    s.taps.add('Escape'); g.update(0); s.taps.clear();
    assert.equal(g.selected, null); assert.equal(g.buildType, null);
}
console.log('Late-join tower retention, forty-tower team ceiling and responsive separate management panels passed.');
{
    const s = session('skyline'), g = s.game;
    const plank = { x: 1050, y: -500, w: 150, h: 16, cityKit: 'scaffold', frame: [1000, 2200], below: 0, bi: 0 };
    g.drawList.push(plank);
    g.drawIndex = null;
    const seen = new Set(), drawCityKit = g.drawCityKit;
    g.drawCityKit = function (c, p, ...args) { seen.add(p); return drawCityKit.call(this, c, p, ...args); };
    for (const offset of [0, .25, .5, .75]) {
        Object.assign(g.me, { x: plank.frame[1] - 20 + offset, y: plank.y - 44, vx: 0, vy: 0 });
        g.snapCam = true; seen.clear(); g.draw(ctx, 390, 720);
        assert.ok(plank.x + plank.w < g.cam.x - 120, 'the small collision plank is outside the render margin');
        assert.ok(seen.has(plank), 'its wider scaffold support remains drawn while intersecting the viewport');
    }
    g.me.x = plank.frame[1] + 3000; g.snapCam = true; seen.clear(); g.draw(ctx, 390, 720);
    assert.ok(!seen.has(plank), 'a truly offscreen support still gets culled');
    for (const p of g.solids.filter(p => p.cityKit === 'catwalk' && p.board.panel)) {
        assert.ok(g.solids.some(roof => roof.roof && roof.tower && roof.y === p.board.base
            && p.x >= roof.x - 1 && p.x + p.w <= roof.x + roof.w + 1), 'billboard supports terminate on a real building roof');
    }
}
console.log('Scaffold support visibility across fractional camera offsets, offscreen culling and roof-mounted billboards passed.');
{
    const g = session('skyline').game;
    for (const pole of g.movers.filter(p => p.cityKit === 'pole')) {
        for (const amount of [0, .5, 1]) {
            const drawn = [], p = { ...pole, sunk: pole.depth * amount, y: pole.by + pole.depth * amount };
            const poleCtx = new Proxy(ctx, { get: (target, key) => key === 'fillRect'
                ? (x, y, w, h) => drawn.push({ x, y, w, h }) : target[key] });
            g.drawCityKit(poleCtx, p);
            assert.ok(drawn.every(rect => rect.h >= 0), 'pole sleeves and chrome rods never invert as the cap compresses');
            const rod = drawn.find(rect => rect.w === 10);
            assert.equal(rod.y, p.y + p.h, 'the telescoping rod remains attached beneath the moving cap');
            assert.ok(rod.h >= 22, 'the moving rod remains above the fixed sleeve even at full compression');
        }
    }
}
{
    const s = session('skyline'), g = s.game, buildings = [];
    let backdrop = true;
    const backdropCtx = new Proxy(ctx, { get: (target, key) => key === 'scale' ? () => { backdrop = false; }
        : key === 'fillRect' ? (x, y, w, h) => {
            if (backdrop && ['#1b2342', '#161c36', '#10152b'].includes(target.fillStyle)) buildings.push({ y, h });
        } : target[key] });
    g.camInit = true; g.camStart = -12000; g.snapCam = true; g.me.y = 400;
    g.draw(backdropCtx, 1280, 720);
    assert.ok(buildings.length > 10, 'descending still draws all three city parallax layers');
    assert.ok(buildings.every(rect => rect.h > 0 && Math.abs(rect.y + rect.h - 720) < .001),
        'background buildings reach the viewport bottom even far below the initial camera position');
}
{
    const s = session('skyline'), g = s.game, poses = [];
    const original = A.util.drawFigureSide;
    let scale = [1, 1], tilt = 0;
    const poseCtx = new Proxy(ctx, { get: (target, key) => key === 'scale' ? (x, y) => { scale = [x, y]; }
        : key === 'rotate' ? angle => { tilt = angle; } : target[key] });
    A.util.drawFigureSide = (...args) => { poses.push({ scale, tilt, limbs: args[10] }); return original(...args); };
    try {
        const pose = (state, motion, vy = state === 2 ? -850 : 0) => {
            Object.assign(g, { state, dash: 0, dashPose: 0, wallPose: 0, kick: 0, landingPose: 0, jumpPulse: 0, airJumpPulse: 0, ...motion });
            g.me.vy = vy;
            const body = JSON.stringify(g.me); poses.length = 0; g.draw(poseCtx, 1280, 720);
            assert.equal(JSON.stringify(g.me), body, 'render poses do not change physics or hitboxes');
            return poses.at(-1);
        };
        const originalScale = pose(0).scale;
        const air = pose(2, { jumpPulse: .125 }); assert.deepEqual(air.scale, originalScale, 'jumping preserves the original model proportions');
        assert.equal(g.net().ex.jp, .125, 'ground-jump animation state is sent to other players');
        assert.ok(air.limbs.legs[0] > 0 && air.limbs.legs[0] <= .25, 'jumping rotates the front leg slightly outward');
        assert.equal(air.limbs.legs[1], -air.limbs.legs[0], 'both legs rotate outward by the same small angle');
        assert.equal(air.limbs.bob, 0, 'jumping only changes the leg pose, not body height');
        assert.equal(air.limbs.arms, undefined, 'animation preserves the original armless character');
        assert.ok(air.limbs.legs.every(Number.isFinite), 'each leg has one rigid hip angle rather than a curved or hinged knee');
        const fall = pose(2, {}, 650);
        assert.ok(fall.limbs.legs.every(angle => angle === 0), 'falling without a jump pulse keeps the legs neutral');
        assert.ok(pose(2).limbs.legs.every(angle => angle === 0), 'being airborne alone does not trigger a leg animation');
        const start = pose(2, { jumpPulse: .25 });
        assert.ok(Math.abs(start.limbs.legs[0]) < .001, 'the jump rotation starts neutral instead of snapping outward');
        const release = pose(2, { jumpPulse: .025 });
        assert.ok(release.limbs.legs[0] > 0 && release.limbs.legs[0] < air.limbs.legs[0], 'the rotation returns toward neutral at the end of the jump pulse');
        const double = pose(2, { airJumpPulse: .125 });
        assert.deepEqual(double.limbs.legs, air.limbs.legs, 'double jumps keep the same subtle outward rotation without tucking');
        assert.equal(g.net().ex.j, .125, 'double-jump animation state is sent to other players');
        const dash = pose(3, { dash: .1, dashPose: 1 }); assert.deepEqual(dash.scale, originalScale); assert.equal(Math.abs(dash.tilt), .35);
        assert.ok(dash.limbs.legs[0] < -1, 'dashing trails the straight legs');
        const partial = pose(3, { dash: .1, dashPose: .5 }); assert.ok(Math.abs(partial.tilt) < Math.abs(dash.tilt), 'dash pose blends instead of snapping');
        const wall = pose(2, { wallPose: 1, wallSide: 1 }, 130);
        assert.ok(wall.tilt < 0 && wall.limbs.legs[0] > .5, 'wall sliding braces an existing straight leg against the wall');
        const land = pose(0, { landingPose: .16 }); assert.deepEqual(land.scale, originalScale); assert.ok(land.limbs.bob > 0, 'landing lowers the original body without deforming it');
        const duel = session('duel').game;
        poses.length = 0;
        duel.drawFighter(poseCtx, 500, 500, s.local, 1, 3, 0, 'You', false, .2, 1, true, 0, 0, true);
        assert.ok(poses[0].tilt > 0 && poses[0].tilt < .2, 'heavy attacks use follow-through, not the dash pose');
    } finally { A.util.drawFigureSide = original; }
}
for (const fps of [30, 60, 120]) {
    const s = session('skyline'), g = s.game;
    g.solids = [{ x: 100, y: 500, w: 800, h: 40 }];
    Object.assign(g.me, { x: 300, y: 456, vx: 0, vy: 0, onGround: true, ground: g.solids[0] });
    s.axis = () => ({ x: 0, y: 0 });
    s.down = key => key === 'Space';
    s.taps.add('Space'); g.updatePlayer(1 / fps); s.taps.clear();
    assert.equal(g.jumpPulse, .25, 'a successful ground jump triggers one short pose pulse');
    for (let frame = 0; frame < Math.ceil(fps * .3); frame++) g.updatePlayer(1 / fps);
    assert.equal(g.jumpPulse, 0, 'holding jump while airborne does not replay the animation');
    assert.equal(g.me.onGround, false, 'the first jump animation finishes before landing');
    s.taps.add('Space'); g.updatePlayer(1 / fps); s.taps.clear();
    assert.equal(g.airJumpPulse, .25, 'double jumping triggers the animation again');
    assert.equal(g.jumpPulse, 0, 'a double jump restarts a single pulse instead of overlapping ground-jump animation');
    for (let frame = 0; frame < Math.ceil(fps * .3); frame++) g.updatePlayer(1 / fps);
    assert.equal(g.airJumpPulse, 0, 'double-jump animation ends while airborne too');
}
console.log('Original-model jump, landing, eased dash, straight-leg wall brace and heavy-attack poses preserve character physics passed.');
{
    const s = session('skyline'), g = s.game, biomes = [];
    const previousAudio = sandbox.window.StudBudSfx;
    sandbox.window.StudBudSfx = { setMusicBiome: (mode, biome) => biomes.push([mode, biome]) };
    const originalUpdate = g.updatePlayer;
    g.updatePlayer = () => {};
    try {
        for (const [height, biome] of [[100, 0], [g.checkpoints[1].y * -1 + 100, 1], [g.checkpoints[2].y * -1 + 100, 3], [100, 0]]) {
            g.me.y = -height - g.me.h;
            g.me.onGround = true; g.me.ground = { bi: biome };
            g.update(1 / 60);
            assert.deepEqual(biomes.at(-1), ['skyline', biome], 'music follows the landed biome rather than transient height during falls');
        }
        g.me.onGround = false; g.me.ground = null;
        g.me.y = g.checkpoints[2].y - 100;
        g.update(1 / 60);
        assert.deepEqual(biomes.at(-1), ['skyline', 0], 'crossing a biome boundary in midair does not interrupt the track');
        g.dead = .5;
        const beforeDeath = biomes.length;
        g.update(1 / 60);
        assert.equal(biomes.length, beforeDeath, 'dying does not request a soundtrack switch');
        g.dead = 0;
        const count = biomes.length; s.preview = true; g.update(1 / 60);
        assert.equal(biomes.length, count, 'passive previews cannot change game music');
    } finally {
        sandbox.window.StudBudSfx = previousAudio;
        g.updatePlayer = originalUpdate;
    }
}
{
    const s = session('skyline'), g = s.game, sounds = [];
    g.solids = [{ x: 100, y: 500, w: 800, h: 40 }];
    g.springs = [{ x: 300, y: 484, w: 46, h: 16, city: true }];
    g.trapChecks = false;
    Object.assign(g.me, { x: 310, y: 456, vx: 0, vy: 0, onGround: true, ground: g.solids[0] });
    s.axis = () => ({ x: 0, y: 0 });
    s.sfx = name => sounds.push(name);
    g.updatePlayer(1 / 60);
    assert.ok(g.sprung && g.me.vy === -1280, 'the spring pad retains its existing launch strength');
    assert.equal(sounds.filter(name => name === 'spring').length, 1, 'spring contact plays its dedicated launch sound once');
    assert.ok(!sounds.includes('powerup'), 'a spring launch is not a musical power-up jingle');
    for (let frame = 0; frame < 10; frame++) g.updatePlayer(1 / 60);
    assert.equal(sounds.filter(name => name === 'spring').length, 1, 'leaving the spring does not repeat the launch sound');
}
for (const fps of [30, 60, 120]) {
    const s = session('skyline'), g = s.game;
    g.solids = [{ x: 400, y: 0, w: 40, h: 800, wallJ: true }];
    Object.assign(g.me, { x: 374, y: 200, vx: 0, vy: 100, onGround: false });
    s.axis = () => ({ x: 1, y: 0 });
    g.updatePlayer(1 / fps);
    assert.ok(g.wallPose > 0 && g.wallPose < 1, 'wall attachment eases in rather than snapping');
    for (let frame = 1; frame < fps / 5; frame++) g.updatePlayer(1 / fps);
    assert.ok(g.wallPose > .98 && g.wallSide === 1, 'wall-slide pose settles against the contacted wall');
    assert.equal(g.net().ex.wa, g.wallPose); assert.equal(g.net().ex.ws, 1);
    s.taps.add('Space'); g.updatePlayer(1 / fps); s.taps.clear();
    assert.ok(g.kick > 0 && g.me.vx < 0 && g.me.vy < 0, 'wall jumping pushes away from the wall with the real jump physics');
    assert.equal(g.net().ex.wk, g.kick, 'remote players receive the wall-jump animation');
    s.axis = () => ({ x: 0, y: 0 });
    for (let frame = 0; frame < fps / 5; frame++) g.updatePlayer(1 / fps);
    assert.ok(g.wallPose < .02, 'the wall brace releases after pushing off');
    for (let frame = 0; frame < fps / 5; frame++) g.updatePlayer(1 / fps);
    assert.equal(g.wallPose, 0, 'the released wall pose fully clears so ordinary running animation resumes');
    g.dash = .3; g.dashPose = 0;
    g.updatePlayer(1 / fps);
    assert.ok(g.dashPose > 0 && g.dashPose < 1, 'dash attack is eased at every supported frame rate');
    const amount = g.dashPose; g.dash = 0; g.updatePlayer(1 / fps);
    assert.ok(g.dashPose > 0 && g.dashPose < amount, 'dash release is eased too');
}
for (const fps of [30, 60, 120]) {
    for (const side of [-1, 1]) {
        for (const input of [0, -side, side]) {
            const s = session('skyline'), g = s.game;
            g.solids = [{ x: 400, y: 0, w: 40, h: 800, wallJ: true }];
            Object.assign(g.me, { x: side === 1 ? 374 : 440, y: 200, vx: 0, vy: 100, face: side, onGround: false });
            s.axis = () => ({ x: input, y: 0 });
            g.updatePlayer(1 / fps);
            assert.equal(g.me.face, -side, 'sliding looks away from the contacted wall toward the next jump regardless of directional input');
            assert.equal(g.net().f, -side, 'other players see the eyes facing toward the next jump');
            s.taps.add('Space');
            g.updatePlayer(1 / fps);
            s.taps.clear();
            assert.equal(g.me.face, -side, 'wall jumping immediately faces away from the wall');
            assert.equal(Math.sign(g.me.vx), -side, 'the wall jump still pushes away from the contacted wall');
        }
    }
}
{
    const s = session('miner'), g = s.game, sounds = [];
    s.sfx = (...args) => sounds.push(args);
    const x = 20, y = 12, index = y * 110 + x;
    const previousAudio = sandbox.window.StudBudSfx;
    sandbox.window.StudBudSfx = { play: (...args) => sounds.push(args) };
    Object.assign(g.me, { x: x * 48, y: y * 48 });
    g.T[index] = 2;
    g.onEvent({ k: 'mh', x, y }, { id: 'guest' });
    assert.equal(sounds.length, 0, 'old clients cannot trigger mid-dig sounds');
    g.onEvent({ k: 'dg', x, y }, { id: s.user.id });
    g.onEvent({ k: 'dg', x: 1.5, y }, { id: 'guest' });
    g.onEvent({ k: 'dg', x: -1, y }, { id: 'guest' });
    g.onEvent({ k: 'dg', x, y: 80 }, { id: 'guest' });
    assert.equal(sounds.length, 0, 'self and invalid block-break events are silent');
    g.T[70 * 110 + 100] = 2;
    g.onEvent({ k: 'dg', x: 100, y: 70 }, { id: 'guest' });
    assert.equal(sounds.length, 0, 'distant players do not play global block-break sounds');
    g.onEvent({ k: 'dg', x, y }, { id: 'guest' });
    assert.equal(sounds.length, 0, 'nearby opponents break rocks silently');
    g.T[index] = 3;
    const carry = g.carry, items = g.items, events = s.events.length;
    g.onEvent({ k: 'dg', x, y }, { id: 'guest' });
    assert.equal(g.T[index], 0); assert.equal(sounds.length, 0, 'remote crystal particles do not play generic pops');
    assert.equal(g.carry, carry); assert.equal(g.items, items); assert.equal(s.events.length, events, 'remote breaks neither award local loot nor rebroadcast');
    const names = new Set();
    for (const type of [3, 4, 5, 7, 8, 9]) {
        g.T[index] = type;
        g.onEvent({ k: 'dg', x, y }, { id: 'guest' });
        const before = sounds.length;
        assert.equal(g.T[index], 0, 'remote breaks still update the shared mine');
        assert.equal(sounds.length, names.size, 'remote crystal breaks remain silent');
        g.T[index] = type;
        g.breakTile(x, y, type, true);
        assert.equal(sounds.length, before + 1, 'local mining plays exactly one crystal-specific cue, with no generic particle pop');
        names.add(sounds.at(-1)[0]);
    }
    assert.equal(names.size, 6);
    const beforeBot = sounds.length;
    g.T[index] = 9;
    const particles = g.particles.items.length;
    g.breakTile(x, y, 9, false);
    assert.equal(sounds.length, beforeBot, 'bot crystal breaks are silent too');
    assert.ok(g.particles.items.length > particles, 'silent bot breaks retain visible particles');
    sandbox.window.StudBudSfx = previousAudio;
}
console.log('Wall attachment/push-off and eased dash transitions at 30/60/120 FPS, break-only mining audio and remote-loot isolation passed.');
{
    const idle = session('defense'), g = idle.game;
    assert.equal(g.waveNumber, 0); assert.equal(g.enemies.length, 0);
    for (let elapsed = 0; elapsed < 25.2; elapsed += .05) g.simulate(.05);
    assert.equal(g.waveNumber, 1, 'the first wave starts on its timer without player orders');
    assert.ok(g.enemies.length > 0, 'automatic waves spawn enemies without player action');
    assert.match(g.waveStatusText(), /WAVE 1 · DEPLOYING/);
    texts.length = 0; g.draw(ctx, 1280, 720);
    assert.ok(texts.includes(g.waveStatusText()), 'HUD visibly shows wave deployment/countdown');
    assert.ok(g.waveEnemyHealth(0, 6) > g.waveEnemyHealth(0, 1), 'enemy health increases with wave number');
    assert.ok(g.waveEnemySpeed({ type: 0, wave: 6 }) > g.waveEnemySpeed({ type: 0, wave: 1 }), 'enemy speed increases with wave number');
    g.waveNumber = 8;
    assert.equal(g.waveEnemyType(0), 4, 'late waves include armored Sentinels');
    assert.equal(g.waveEnemyType(1), 5, 'late waves include fast Wisps');
    const idleBattle = session('defense').game;
    let elapsed = 0;
    while (!idleBattle.finished && elapsed < 180) { idleBattle.simulate(.05); elapsed += .05; }
    assert.ok(idleBattle.finished, `an idle battle ends automatically (${elapsed.toFixed(1)} seconds)`);
    assert.ok(elapsed >= 120 && elapsed <= 180, `idle teams lose in roughly two to three minutes (${elapsed.toFixed(1)}s)`);
    assert.ok(idleBattle.teamValue(idleBattle.winner) >= 1000000, 'the wave-driven finish records a winning result score');
    const restored = session('defense', 'guest').game;
    const state = idle.game.snapshot(); restored.applySnapshot(state);
    assert.equal(restored.waveNumber, idle.game.waveNumber);
    assert.equal(restored.waveSpawnRemaining, idle.game.waveSpawnRemaining, 'host snapshots synchronize wave progress');
    const serial = restored.receivedSerial, originalError = sandbox.console.error;
    sandbox.console.error = noop;
    try {
        restored.applySnapshot({ ...state, serial: state.serial + 1, waveNumber: -1 });
        assert.equal(restored.receivedSerial, serial, 'invalid wave snapshots are rejected');
    } finally { sandbox.console.error = originalError; }
}
console.log('Automatic waves, wave scaling, host-synchronized progress and idle match completion passed.');{
    const s = session('defense'), g = s.game;
    assert.equal(g.troopTypes.length, 6); assert.equal(g.enemyTypes.length, 6);
    s.testing = true;
    for (let type = 0; type < 6; type++) {
        g.request('build', { type, x: 380 + type * 70, y: 340 });
        g.request('send', { type });
    }
    assert.equal(g.troops.length, 6); assert.equal(g.enemies.length, 6);
    assert.ok(g.troops.every(t => (t.x - t.team * 1100 - 95) % 70 === 0 && (t.y - 85) % 70 === 0), 'all placements snap to cell centers');
    const placed = g.troops[0], cash = g.wallets[0];
    g.request('build', { type: 0, x: placed.x + 20, y: placed.y + 20 });
    assert.equal(g.troops.length, 6); assert.equal(g.wallets[0], cash, 'one tower per cell; duplicate cells do not spend cash');
    g.command({ action: 'build', seq: g.lastSeq.host + 1, type: 0, x: 510, y: 320 }, 'host');
    assert.equal(g.troops.length, 6, 'host rejects unsnapped remote placement orders');
    const restored = session('defense', 'guest').game;
    restored.applySnapshot(g.snapshot());
    assert.equal(restored.troops[5].type, 5); assert.equal(restored.enemies[4].hp, 550);
    for (const troop of g.troops) {
        const current = g.troopStats(troop.type, 1), next = g.troopStats(troop.type, 2);
        assert.equal(next.range - current.range, 35);
        assert.ok(next.damage > current.damage && next.rate < current.rate, 'described upgrade deltas match combat');
    }
    g.draw(ctx, 1280, 720);
    assert.ok(g.ui.rects.some(r => r.id === 'build:5'));
    g.shopTab = 'send'; g.draw(ctx, 1280, 720);
    assert.ok(g.ui.rects.some(r => r.id === 'send:5'));
    texts.length = 0; g.selected = g.troops[3].id; g.draw(ctx, 1280, 720);
    assert.ok(texts.some(text => text.startsWith('Upgrade: +52.0 dmg · +35 range')), 'upgrade panel describes actual ballista stats');
    assert.ok(g.ui.rects.some(r => r.id === 'tower-panel') && g.ui.rects.some(r => r.id === 'shop-panel'), 'tower management is separate from the shop');
    g.selected = null; g.buildType = 0; g.ui.rects = []; g.ui.prev = [];
    s.mouse.active = true; s.mouse.x = 500; s.mouse.y = 400;
    g.update(0); assert.ok(g.previewPoint, 'moving pointer creates a placement ghost');
    texts.length = 0; g.draw(ctx, 1280, 720);
    assert.ok(texts.some(text => /Range|Cannot place here/.test(text)), 'ghost visibly reports placement validity/range');
    g.ui.rects = [{ id: 'panel', x: 0, y: 0, w: 600, h: 600, on: false }];
    g.update(0); assert.equal(g.previewPoint, null, 'range ghost is suppressed over the HUD');
}
for (const [type, enemyType, expected] of [[0, 4, 14 * .7], [3, 4, 80], [4, 0, 22]]) {
    const g = session('defense').game;
    g.troops = [{ id: 1, team: 0, type, x: 300, y: 240, level: 1, cd: 0 }];
    g.enemies = Array.from({ length: 4 }, (_, i) => ({ id: 2 + i, team: 0, type: enemyType,
        hp: g.enemyTypes[enemyType].hp, segment: 0, progress: 180 + i * 20, slow: 0 }));
    const hp = g.enemies[0].hp; g.simulate(0);
    assert.ok(Math.abs(hp - g.enemies[0].hp - expected) < 1e-8);
    if (type === 4) {
        assert.equal(g.enemies.filter(e => e.hp < hp).length, 3, 'Tesla hits exactly three clustered enemies');
        assert.equal(g.shots.length, 3);
    }
}
for (const fps of [30, 60, 120]) {
    const g = session('defense').game;
    g.troops = [{ id: 1, team: 0, type: 5, x: 300, y: 240, level: 1, cd: 0 }];
    g.enemies = [{ id: 2, team: 0, type: 2, hp: 330, segment: 0, progress: 180, slow: 0 }];
    g.simulate(0); assert.equal(g.enemies[0].poisonT, 3);
    g.troops = []; for (let i = 0; i < fps * 3; i++) g.simulate(1 / fps);
    assert.ok(Math.abs(g.enemies[0].hp - 293) < 1e-6, 'poison damage is frame-rate independent');
    const s = session('river'), river = s.game;
    river.rocks = []; river.logs = []; river.pools = []; river.chests = [];
    Object.assign(river.me, { x: 2000, y: river.H / 2, vx: 0, vy: 0 });
    s.startedAt = Date.now() - 32000;
    const waveX = river.surgeAt(32).x; river.me.x = waveX;
    for (let i = 0; i < fps / 4; i++) river.update(1 / fps);
    assert.ok(river.me.vx > 100 && river.me.x > waveX, 'tsunami pushes the boat with sustained physical momentum');
    river.me.x = waveX; river.me.y = river.bank + 50; river.me.vx = 0; river.surgePush = 0;
    river.update(1 / fps);
    assert.ok(river.me.vx < 5, 'shoreline shelter avoids tsunami force');
}
{
    const s = session('miner'), g = s.game, sounds = [];
    s.sfx = name => sounds.push(name);
    g.dig.p = .1; g.aimAngle = .7;
    assert.equal(g.net().ex.digging, true); assert.equal(g.net().ex.aim, .7);
    g.draw(ctx, 1280, 720);
    const river = session('river'), r = river.game;
    river.mouse.active = true; river.mouse.x = 800; river.mouse.y = 360; river.mouse.pressed = true;
    r.update(.01); assert.ok(r.cast && Number.isFinite(r.cast.fromX), 'bait begins at the boat rather than teleporting');
    river.mouse.pressed = false; r.update(.24); assert.ok(r.cast.landed, 'bait lands with a timed splash before the catch resolves');
    r.draw(ctx, 1280, 720);
}
console.log('Six-type catalogs, armor/piercing/chain/poison, upgrade details, placement ghosts, shoreline-safe tsunami momentum, pickaxes and bait flight passed.');
{
    const s = session('miner'), g = s.game, transforms = [], rotations = [], arcs = [], rects = [];
    const original = { translate: ctx.translate, rotate: ctx.rotate, scale: ctx.scale, arc: ctx.arc, fillRect: ctx.fillRect };
    ctx.translate = (...args) => { transforms.push(args); };
    ctx.rotate = angle => { rotations.push(angle); };
    ctx.scale = (...args) => { transforms.push(args); };
    ctx.arc = (...args) => { arcs.push(args); };
    ctx.fillRect = (...args) => { rects.push(args); };
    g.drawPickaxe(ctx, 100, 50, 0, true, 0);
    assert.deepEqual(transforms[0], [109, 54], 'right-hand grip sits beside the body, not at its center');
    assert.ok(rects.some(r => r[2] === 5 && r[3] === 6), 'forged head has a distinct metal socket');
    assert.equal(arcs[0][2], 25, 'smaller pickaxe has a 25-unit swing trail instead of 35');
    transforms.length = 0;
    g.drawPickaxe(ctx, 100, 50, Math.PI, false, .2);
    assert.deepEqual(transforms[0], [91, 54], 'left-hand grip mirrors its placement');
    assert.deepEqual(transforms[1], [-1, 1], 'left-facing pickaxe mirrors its head instead of turning upside down');
    assert.notEqual(rotations[0], rotations[1], 'active swing differs from the resting pose');
    Object.assign(ctx, original);
    const drawn = [], draw = g.drawPickaxe.bind(g);
    g.drawPickaxe = (...args) => { drawn.push(args); draw(...args); };
    g.me.face = -1; g.aimAngle = 0; g.dig.p = 0;
    s.remoteList = () => [{ x: g.me.x + 50, y: g.me.y, f: -1, a: 1, color: '#fff', ex: { aim: 0, digging: false } }];
    g.seen = () => true; g.draw(ctx, 1280, 720);
    assert.equal(drawn.length, 2);
    assert.ok(drawn.every(args => args[3] === Math.PI), 'local and remote idle tools follow facing instead of stale mining aim');
}
console.log('Compact forged pickaxe, mirrored hand anchors, swing and local/remote idle placement passed.');
for (const fps of [30, 60, 120]) {
    const s = session('defense'), g = s.game;
    s.testing = true;
    g.draw(ctx, 1280, 720);
    g.cam.x = g.me.x; g.cam.y = g.me.y;
    s.mouse.active = true; s.mouse.x = 1150; s.mouse.y = 200;
    const startCamera = { ...g.cam };
    for (let i = 0; i < fps; i++) g.step(1 / fps);
    assert.equal(g.cam.x, startCamera.x); assert.equal(g.cam.y, startCamera.y, 'pointer movement cannot pan a stationary placement grid');
    g.ui.rects = []; g.ui.prev = [];
    g.request('build', { type: 0, x: 515, y: 1135 });
    const tower = g.troops[0];
    const pointAt = (x, y) => {
        s.mouse.x = s.vw / 2 + (x - g.camX) * g.zoom;
        s.mouse.y = s.vh / 2 + (y - g.camY) * g.zoom;
        s.mouse.pressed = true;
    };
    pointAt(tower.x + 25, tower.y - 25);
    g.update(0);
    assert.equal(g.selected, tower.id, 'clicking anywhere in the tower cell selects it');
    pointAt(655, 1135); g.update(0);
    assert.equal(g.selected, null); assert.equal(g.troops.length, 1, 'clicking empty ground first deselects without building');
    g.update(0); assert.equal(g.troops.length, 1, 'another ground click cannot build without choosing a tower');
    g.buildType = 0;
    g.update(0); assert.equal(g.troops.length, 2, 'choosing a tower arms exactly one placement');
    g.draw(ctx, s.vw, s.vh);
    assert.equal(g.buildType, null); assert.equal(g.previewPoint, null, 'placing a tower removes its selection and preview in both update and render');
    pointAt(725, 1135);
    g.ui.prev = [{ id: 'build:0', x: s.mouse.x - 10, y: s.mouse.y - 10, w: 30, h: 30, on: true }];
    g.ui.rects = [{ id: 'minimap', x: s.mouse.x - 10, y: s.mouse.y - 10, w: 30, h: 30, on: false }];
    g.update(0);
    assert.equal(g.troops.length, 2); assert.equal(g.previewPoint, null, 'minimap/current HUD rectangles block placement, ignoring stale buttons');
}
console.log('Stationary grid aim, full-cell selection, safe deselection and current-HUD/minimap click blocking passed at 30/60/120 FPS.');
{
    const s = session('skyline'), g = s.game;
    s.testing = true;
    const counts = { belt: 0, deck: 0, frame: 0, drill: 0, space: 0, station: 0, scaffold: 0 };
    for (const [method, key] of [['drawConveyor', 'belt'], ['drawFactoryDeck', 'deck'], ['drawFactoryFrame', 'frame'], ['drawDrill', 'drill'], ['drawSpaceDeck', 'space'], ['drawStationFrame', 'station'], ['drawGirders', 'scaffold']]) {
        const draw = g[method].bind(g);
        g[method] = (...args) => { counts[key]++; return draw(...args); };
    }
    g.testTeleport(1);
    for (const deck of g.solids.filter(p => p.bi === 1 && p.factoryBelt).slice(0, 12)) {
        g.me.x = deck.x + deck.w / 2; g.me.y = deck.y - g.me.h; g.snapCam = true;
        g.draw(ctx, 1280, 720);
    }
    assert.ok(counts.belt > 0 && counts.deck > 0 && counts.frame > 0 && counts.drill > 0, 'factory render path draws conveyor decks, the building frame and drills/crushers');
    assert.equal(counts.scaffold, 0, 'factory no longer renders construction scaffolding');
    g.testTeleport(2); g.draw(ctx, 1280, 720);
    assert.ok(counts.space > 0 && counts.station > 0, 'space platform styles and the station frame render ahead of generic roofs');
    const crusher = g.drills.find(d => d.crusher);
    const box = { x: crusher.x - 13, y: crusher.surfaceY - 44, w: 26, h: 44 };
    g.updateDrill(crusher, crusher.period * .675 - crusher.phase);
    assert.equal(g.drillHits(box, crusher), true, 'slamming crushers crush the supported landing');
    g.updateDrill(crusher, crusher.period * .75 - crusher.phase);
    assert.equal(g.drillHits(box, crusher), false, 'a crusher holding still on the deck does not kill');
    g.updateDrill(crusher, -crusher.phase);
    assert.equal(g.drillHits(box, crusher), false, 'retracted crushers leave safe clearance');
}
console.log('Industrial conveyor/deck/prop render dispatch, no construction scaffolds, orbital deck rendering and crusher collision passed.');
{
    const g = session('skyline').game;
    const p = { x: 117, y: -500, w: 1400, h: 32, belt: -150, roof: true, bodyH: 40 };
    g.viewWidth = 720; g.clock = 2;
    for (const cameraX of [0, 181.25, 399.5, 630]) {
        g.cam.x = cameraX;
        const braces = [], rivets = [], lights = [];
        const trace = new Proxy({
            moveTo(x, y) { if (y === p.y + 38) braces.push(x); },
            fillRect(x, y, w, h) { if (y === p.y + 9 && w === 3 && h === 3) rivets.push(x); },
            arc(x, y, r) { if (r === 3) lights.push(y); }
        }, { get: (target, key) => target[key] || ctx[key] });
        g.drawConveyor(trace, p);
        assert.ok(braces.length > 0);
        assert.ok(braces.every(x => Math.abs((x - p.x - 30) / 110 - Math.round((x - p.x - 30) / 110)) < 1e-9), 'conveyor braces stay on their world-space lattice as the camera moves');
        g.drawFactoryDeck(trace, p);
        assert.ok(rivets.length > 0 && rivets.every(x => (x - p.x - 12) % 60 === 0), 'deck rivets never change grid origin at a viewport edge');
        const chamber = { id: -1, top: -900, bottom: -100, columns: [100, 620] };
        g.drawStationFrame(trace, chamber, -700 + cameraX / 4, 100 + cameraX / 4);
        assert.equal(lights.length, 0, 'background station pylons do not use bright markers that resemble solid gameplay objects');
    }
}
console.log('World-anchored conveyor bracing, deck rivets and station end lights remain stable under fractional camera movement.');
{
    const s = session('skyline'), g = s.game, shapes = [];
    s.testing = true; g.testTeleport(2);
    assert.ok(g.goalText().endsWith('Space'), 'Space HUD uses the remaining biome order');
    assert.ok(s.messages.includes('Testing Space'), 'staff teleport toast names Space rather than the removed Sky');
    const ellipse = ctx.ellipse, arc = ctx.arc;
    ctx.ellipse = (...args) => { shapes.push({ kind: 'ellipse', args }); return ellipse(...args); };
    ctx.arc = (...args) => { shapes.push({ kind: 'arc', args }); return arc(...args); };
    g.draw(ctx, 1280, 720);
    ctx.ellipse = ellipse; ctx.arc = arc;
    const rings = shapes.filter(shape => shape.kind === 'ellipse' && Math.abs(shape.args[2] / shape.args[3] - 5.5) < 1e-9);
    assert.ok(rings.length > 0, 'Space includes ringed planets');
    for (const rear of rings.filter(shape => shape.args[5] === Math.PI)) {
        const front = rings.find(shape => shape.args[0] === rear.args[0] && shape.args[1] === rear.args[1] && shape.args[5] === 0);
        assert.ok(front && rear.args[6] === Math.PI * 2 && front.args[6] === Math.PI, 'matching halves complete each tilted ring');
        const disk = shapes.find(shape => shape.kind === 'arc' && shape.args[0] === rear.args[0] && shape.args[1] === rear.args[1] && Math.abs(shape.args[2] - rear.args[2] / 1.65) < 1e-9);
        assert.ok(disk && shapes.indexOf(rear) < shapes.indexOf(disk) && shapes.indexOf(disk) < shapes.indexOf(front), 'rear ring is behind the planet; front ring is in front');
    }
    assert.equal(rings.filter(shape => shape.args[5] === Math.PI).length, rings.filter(shape => shape.args[5] === 0).length);
}
console.log('Complete planet rings and correct rear/disk/front drawing order passed.');
for (const fps of [30, 60, 120]) {
    const s = session('skyline'), g = s.game;
    s.testing = true; s.testNoTide = true; s.testInvincible = true; g.testTeleport(2);
    assert.equal(g.inDeepSpace(), true, 'Space keeps low gravity after removing Sky');
    const climb = g.lanes.filter(lane => lane.axis === 'x');
    assert.ok(climb.length >= 3, 'Space builds asteroid lanes');
    for (const lane of climb) assert.ok(lane.x1 - lane.x0 >= 1200, 'asteroids enter from well outside the viewport and cross the whole lane');
    const lane = climb[0], rocks = g.meteors.filter(m => m.lane === lane), rock = rocks[0];
    g.spikes = []; g.saws = []; g.drills = []; g.balls = []; g.lasers = []; g.springs = []; g.debris = [];
    g.solids = [...rocks]; g.movers = [...rocks]; g.meteors = [...rocks];
    const start = s.startedAt;
    let t = 0;
    const step = () => { t += 1 / fps; s.testPauseAt = start + t * 1000; g.update(1 / fps); };
    s.testPauseAt = start; g.update(0);
    // wait until the tracked rock has just appeared at its entry end
    let guard = 0;
    while (!(rock.off === false && rock.fade < .5 && Math.abs((lane.speed > 0 ? lane.x0 : lane.x1 - lane.size) - rock.x) < 40) && guard++ < fps * 60) step();
    assert.ok(guard < fps * 60, 'every rock periodically spawns at the entry end of its lane');
    const firstSeed = rock.seed, firstLap = rock.lap;
    Object.assign(g.me, { x: rock.x + rock.w / 2 - 13, y: rock.y - g.me.h, vx: 0, vy: 0, ground: rock, onGround: true });
    s.axis = () => ({ x: 0, y: 0 }); s.down = () => false; s.pressed = () => false;
    let rode = 0, previous = { x: g.me.x, y: g.me.y };
    for (let frame = 0; frame < fps * 30 && rock.lap === firstLap && !rock.off; frame++) {
        const x = rock.x;
        step();
        if (rock.off || rock.lap !== firstLap) break;
        assert.ok((rock.x - x) * Math.sign(lane.speed) >= -1e-6, `${fps} FPS: asteroids never reverse direction`);
        if (g.me.ground === rock) {
            rode++;
            assert.ok(Math.abs(g.me.x - previous.x) <= Math.abs(lane.speed) / fps + 2, 'rider is carried continuously');
        }
        previous = { x: g.me.x, y: g.me.y };
    }
    assert.ok(rode > fps, `${fps} FPS: a standing player rides the asteroid`);
    while ((rock.off || rock.lap === firstLap) && guard++ < fps * 120) step();
    assert.notEqual(g.me.ground, rock, 'a rock leaving its lane drops its rider instead of carrying them back');
    assert.notEqual(rock.seed, firstSeed, 'a respawned asteroid looks like a new rock');
    assert.ok(Math.abs(rock.x - (lane.speed > 0 ? lane.x0 : lane.x1 - lane.size)) < Math.abs(lane.speed) / fps + 2, 'new rocks appear back at the entry end, not mid-lane');
}
{
    const g = session('skyline').game;
    for (const lane of g.lanes) {
        const positions = [];
        for (let k = 0; k < lane.count; k++) for (let t = 0; t < 20; t += .25) {
            const pos = g.lanePos(lane, k, t);
            if (pos) positions.push(pos.at);
        }
        const lo = lane.axis === 'y' ? lane.y0 : lane.x0, hi = (lane.axis === 'y' ? lane.y1 : lane.x1) - lane.size;
        assert.ok(positions.every(at => at >= lo - 1e-6 && at <= hi + 1e-6), 'lane traffic stays inside its reserved lane');
    }
    const shower = g.lanes.find(lane => lane.axis === 'y');
    assert.ok(shower && shower.hazard, 'Space includes falling debris showers');
    const climb = g.solids.filter(p => p.motif === 'meteor-climb' && p.via);
    assert.ok(climb.length > 0, 'Space includes a climb that is only reachable by hopping between moving asteroids');
    for (const top of climb) for (const lane of top.via) assert.ok(lane.y > top.y, 'climb lanes sit between the dock and the upper dock');
}
console.log('Off-screen asteroid spawns, one-way crossings, fresh rock looks, continuous riders, safe drop-offs and the asteroid climb passed at 30/60/120 FPS.');
for (const fps of [30, 60, 120]) {
    const s = session('skyline'), g = s.game;
    s.testing = true; s.testNoTide = true; s.testInvincible = true;
    const deck = g.solids.find(p => p.factoryBelt && p.w >= 600);
    g.solids = [deck]; g.springs = []; g.winds = []; g.boxes = []; g.drills = [];
    Object.assign(g.me, { x: deck.x + deck.w / 2, y: deck.y - g.me.h, vx: 0, vy: 0, ground: deck, onGround: true });
    const x = g.me.x;
    for (let i = 0; i < fps; i++) g.update(1 / fps);
    assert.ok(Math.abs(g.me.x - x - deck.belt) < 1, `${fps} FPS: wide conveyors physically carry an idle player`);
    s.testFreezeHazards = true;
    const frozenX = g.me.x;
    for (let i = 0; i < fps / 2; i++) g.update(1 / fps);
    assert.ok(Math.abs(g.me.x - frozenX) < 1, 'staff freeze stops conveyor transport too');
}
{
    const s = session('skyline'), g = s.game;
    s.testNoTide = true; g.cp = g.checkpoints[1];
    Object.assign(g.me, { x: g.cp.x, y: g.cp.y - g.me.h - 2, vx: 0, vy: 0 });
    g.tideY = g.cp.y - 100; g.update(0);
    assert.equal(g.deaths, 0, 'ordinary games have no rising tide that kills a recoverable fall');
    s.testing = true; g.dead = 0; g.tideY = g.cp.y - 100; g.update(0);
    assert.equal(g.deaths, 0, 'staff tests use the same fall-friendly world');
    g.testTeleport(0);
    const arcs = [], sunStops = [], strokes = [];
    const oldGradient = ctx.createRadialGradient, oldStroke = ctx.stroke;
    ctx.createRadialGradient = (...args) => ({ addColorStop: (position, color) => sunStops.push({ radius: args[5], position, color }) });
    ctx.stroke = () => strokes.push(ctx.strokeStyle);
    ctx.arc = (...args) => arcs.push({ args, color: ctx.fillStyle, alpha: ctx.globalAlpha });
    for (const low of [false, true]) {
        s.graphics = { low }; arcs.length = 0; sunStops.length = 0; strokes.length = 0; ctx.globalAlpha = 1;
        g.draw(ctx, 1280, 720);
        assert.equal(arcs[0].args[2], 84, 'sun is a large circular disk even on low-detail settings');
        assert.equal(arcs[0].alpha, 1);
        assert.ok(sunStops.some(stop => stop.radius === 84 && stop.position === .8 && stop.color === '#fcd34d'), 'sun stays solid through 80% of its radius');
        assert.ok(sunStops.some(stop => stop.radius === 84 && stop.position === 1 && stop.color.endsWith(',0)')), 'only the sun edge fades to transparent');
        assert.ok(!strokes.includes('#f59e0b'), 'sun has no orange border');
    }
    delete ctx.arc;
    ctx.createRadialGradient = oldGradient; ctx.stroke = oldStroke;
}
console.log('Wide conveyor motion/freeze at 30/60/120 FPS, tide-free falls and subtly faded borderless circular sun in both graphics modes passed.');
for (const fps of [30, 60, 120]) {
    const s = session('skyline'), g = s.game;
    g.spikes = []; g.saws = []; g.drills = []; g.balls = []; g.lasers = []; g.springs = [];
    const cp = g.checkpoints[1];
    Object.assign(g.me, { x: 50, y: cp.y - g.me.h + 1, vx: 0, vy: 0, onGround: false, ground: null });
    g.update(0); assert.equal(g.cp.id, 0, 'height checkpoint never activates while feet are below its threshold');
    g.me.vy = -240; g.update(1 / fps);
    assert.equal(g.cp.id, 1, `${fps} FPS: crossing biome height saves despite being far from the flag`);
    const powerups = s.messages.filter(message => message.includes('saved by height')).length;
    g.update(0); assert.equal(s.messages.filter(message => message.includes('saved by height')).length, powerups, 'saved checkpoint does not activate again');
    g.hurt(true); g.update(1.1);
    assert.equal(g.me.x, cp.x); assert.equal(g.me.y, cp.y - g.me.h - 2, 'automatic checkpoints retain a safe real respawn landing');
    g.me.y = g.checkpoints[2].y - g.me.h - 100;
    g.update(0); assert.equal(g.cp.id, 2, 'one update crossing multiple thresholds saves the highest reached biome');
    assert.equal(g.checkpoints.length, 3, 'automatic capture does not add intermediate checkpoints');
}
for (const fps of [30, 60, 120]) {
    const g = session('skyline').game;
    g.me.onGround = false;
    for (let i = 0; i < fps; i++) {
        g.me.y = g.checkpoints[1].y + Math.sin(i) * 300;
        g.updateBackdrop(1 / fps);
        assert.equal(g.backdropBlend(-100000, 720).to, 0, 'jumping or moving the camera near the next area cannot trigger its background');
    }
    g.me.onGround = true; g.me.ground = { bi: 1 };
    g.updateBackdrop(.45);
    assert.ok(Math.abs(g.backdropBlend().amount - .5) < 1e-10, 'landing in Factory starts a time-based eased transition');
    g.me.onGround = false; g.me.ground = null;
    for (let i = 0; i < fps; i++) g.updateBackdrop(1 / fps);
    assert.equal(g.backdropBlend().to, 1, 'jumping away from a Factory platform does not reverse the fade');
    assert.equal(g.backdropBlend().from, 1);
    g.me.onGround = true; g.me.ground = { bi: 0 };
    for (let i = 0; i < fps; i++) g.updateBackdrop(1 / fps);
    assert.equal(g.backdropBlend().to, 0, 'actually landing back in City restores its background');
    g.me.ground = { bi: 3 };
    for (let i = 0; i < fps * 2; i++) g.updateBackdrop(1 / fps);
    assert.equal(g.backdropBlend().to, 3, 'Space scenery follows actual Space footing');
}
console.log('Automatic height checkpoints, safe respawns and landing-triggered stable biome fades passed at 30/60/120 FPS.');
