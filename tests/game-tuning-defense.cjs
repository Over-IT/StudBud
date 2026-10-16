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
    const g = new A.games.skyline({ seed: 42, local: { color: '#fff' }, user: { id: 'culling-test' } });
    const chamber = { id: -1, top: -1000, bottom: 1000, columns: Array.from({ length: 100 }, (_, i) => i * 500) };
    for (const method of ['drawFactoryFrame', 'drawStationFrame']) {
        drawCalls = 0;
        g[method](ctx, chamber, -1300, 1200);
        const full = drawCalls;
        drawCalls = 0;
        g[method](ctx, chamber, -1300, 1200, 900, 1900);
        assert.ok(drawCalls < full * .15, `${method} skips at least 85% of draw operations outside a narrow viewport`);
    }
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
hg.hill = () => ({ zone: { x: hg.me.x, y: hg.me.y + hg.me.h, w: 200 }, left: 20 });
hg.specialCharge = 0; hg.updateHill(5);
assert.equal(hg.specialCharge, 100, 'five uncontested hill seconds charge the special');
hg.specialCharge = 0; hg.invuln = 0;
for (let i = 0; i < 3; i++) hg.onEvent({ k: 'hit', by: hill.user.id }, { id: 'guest', x: 0, y: 0 });
assert.equal(hg.specialCharge, 100, 'three landed attacks charge the special');
const skyline = session('skyline').game;
const oldCount = skyline.solids.length;
skyline.cp = skyline.checkpoints[2]; skyline.retirePassedAreas();
assert.ok(skyline.solids.length < oldCount * .65, 'passed areas release at least 35% of solids');
assert.ok(skyline.solids.includes(skyline.summit), 'culling preserves the finish');
assert.ok(skyline.solids.some(p => p.boundary), 'culling preserves boundary walls');
skyline.draw(ctx, 1280, 720);
console.log('Fishing destruction/spin/ejection, dry caves, four traffic-safe corners, eased shooter zoom, charged specials and Escape to Space retirement passed.');

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
        for (let i = 0; i < 12; i++) build(id, { owner: 'spoofed' });
        assert.equal(g.troopCount(id), 12, 'every player gets twelve independently owned towers');
        const before = g.troops.length; build(id);
        assert.equal(g.troops.length, before, 'a thirteenth tower is rejected even with unlimited admin cash');
    }
    assert.equal(g.troops.length, 96, 'snapshots allow more than the former global 72/team 36 limits');
    assert.equal(g.troops.filter(t => t.team === 0).length, 48, 'four teammates each retain their twelve-tower allowance');
    assert.ok(g.troops.every(t => t.owner !== 'spoofed'), 'ownership comes from the authenticated order sender');
    g.draw(ctx, 1280, 720);
    assert.ok(g.ui.rects.filter(r => r.id.startsWith('build:')).every(r => !r.on), 'build buttons disable at the personal cap');
    assert.match(g.goalText(), /Towers 12\/12/);
    const restored = session('defense', 'guest', ids).game;
    const state = g.snapshot(); restored.applySnapshot(state);
    assert.equal(restored.troopCount('ally'), 12, 'ownership survives snapshot restoration');
    assert.equal(restored.troops.length, 96);
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
console.log('Grid placement, authenticated tower ownership, independent 12-player caps, expanded team capacity and snapshot restoration passed.');
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
    g.catalogPage = 1; g.draw(ctx, 1280, 720);
    assert.ok(g.ui.rects.some(r => r.id === 'build:5'));
    assert.ok(g.ui.rects.some(r => r.id === 'send:5'));
    texts.length = 0; g.selected = g.troops[3].id; g.draw(ctx, 1280, 720);
    assert.ok(texts.some(text => text.startsWith('Upgrade: +52.0 dmg · +35 range')), 'upgrade panel describes actual ballista stats');
    g.selected = null; g.ui.prev = [];
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
    g.update(0); assert.equal(g.troops.length, 2, 'a subsequent deliberate build click places the tower');
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
        assert.ok(lights.length > 0 && lights.every(y => y === chamber.top - 220 + 3), 'station end lights are anchored to the structure, never the clipped viewport edge');
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
    assert.equal(g.deaths, 1, 'ordinary games cannot disable the tide using staff flags');
    s.testing = true; g.dead = 0; g.tideY = g.cp.y - 100; g.update(0);
    assert.equal(g.deaths, 1, 'staff tide toggle prevents tide death without enabling invincibility');
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
console.log('Wide conveyor motion/freeze at 30/60/120 FPS, staff-only tide control and subtly faded borderless circular sun in both graphics modes passed.');
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
{
    const g = session('skyline').game;
    for (const viewHeight of [360, 720, 1000]) for (const cp of g.checkpoints.slice(1)) {
        const inset = Math.min(120, viewHeight * .18), start = cp.y - inset;
        assert.equal(g.backdropBlend(cp.y + 1, viewHeight).to, cp.id - 1, 'next-biome scenery cannot appear while its entrance is above the screen');
        assert.equal(g.backdropBlend(start + 1, viewHeight).to, cp.id - 1, 'the next biome must be meaningfully visible before the fade starts');
        const span = Math.max(640, viewHeight * 1.1);
        assert.equal(g.backdropBlend(start, viewHeight).amount, 0, 'visible boundary starts the fade continuously');
        assert.ok(Math.abs(g.backdropBlend(start - span / 2, viewHeight).amount - .5) < 1e-10, 'fade midpoint scales with the viewport');
        assert.equal(g.backdropBlend(start - span, viewHeight).amount, 1, 'the entire transition completes within its viewport-scaled span');
    }
}
console.log('Automatic height checkpoints, safe respawns and viewport-scaled biome fades passed at 30/60/120 FPS.');
