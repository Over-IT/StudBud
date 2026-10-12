const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.equal(manifest.name, 'StudBud');
assert.equal(manifest.short_name, 'StudBud');
assert.match(html, /<title>StudBud<\/title>/);
assert.equal([...html.matchAll(/<span class="logo-text">StudBud<\/span>/g)].length, 2);
const errors = [];
const sandbox = {
    console: { ...console, warn: (...args) => { errors.push(args); console.warn(...args); } },
    performance, Date, Math, Map, Set, Uint8Array,
    document: { addEventListener() {}, getElementById() { return { textContent: '' }; } },
    window: { devicePixelRatio: 1, addEventListener() {} },
    navigator: { maxTouchPoints: 0 }
};
vm.createContext(sandbox);
for (const file of ['communityGames.js', 'multiplayerEngine.js', 'multiplayerGames.js', 'multiplayerGames2.js', 'multiplayerGames3.js', 'plannerEngine.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
vm.runInContext(source.slice(source.indexOf('    class AppOrchestrator {'), source.indexOf('    window.NexusApp =')) + '\nwindow.TestApp = AppOrchestrator;', sandbox);
const app = Object.create(sandbox.window.TestApp.prototype);
app.profileCosmetics = () => ({});
app.canvasIsVisible = () => true;
const noop = () => {};
let clears = 0;
const messages = [];
const context = new Proxy({
    clearRect: () => { clears++; },
    fillText: text => { messages.push(text); },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 50 })
}, { get: (target, key) => key in target ? target[key] : noop });
const canvas = (width, height) => ({
    width, height, getBoundingClientRect: () => ({ width, height }),
    getContext: () => context
});
sandbox.document.createElement = () => canvas(900, 500);
const A = sandbox.window.StudBudArcade;
for (const mode of Object.keys(A.games)) {
    for (const size of [[200, 52], [360, 780], [780, 360], [1366, 768]]) {
        const c = canvas(...size);
        for (let frame = 0; frame < 90; frame++) assert.equal(app.drawLivePreview(c, mode, frame * 16 + 1000), true, `${mode} preview ${size}`);
        const demo = app.livePreviews.get(c);
        for (const bot of demo.bots) assert.ok(Number.isFinite(bot.x) && Number.isFinite(bot.y), `${mode} bot position is finite`);
    }
}
console.log('All game previews and bot positions passed across four aspect ratios.');
for (const size of [[200, 52], [900, 500], [360, 240]]) {
    const c = canvas(...size);
    assert.equal(app.drawLivePreview(c, 'market', 1000), true);
    assert.equal(app.drawLivePreview(c, 'miner', 1016), true);
    for (let i = 2; i <= 120; i++) assert.equal(app.drawLivePreview(c, 'miner', 1000 + i * 16), true);
    assert.equal(app.livePreviews.get(c).mode, 'miner');
}
assert.equal(errors.length, 0);
const failedCanvas = canvas(900, 500);
assert.equal(app.drawLivePreview(failedCanvas, 'market', 1000), true);
const beforeClears = clears;
const originalControls = app.previewControls;
app.previewControls = () => { throw new Error('Simulated preview failure'); };
sandbox.console.warn = (...args) => errors.push(args);
assert.equal(app.drawLivePreview(failedCanvas, 'miner', 1016), false);
assert.ok(clears >= beforeClears + 2, 'mode switch and failure must clear the previous game');
assert.equal(messages.at(-1), 'Game preview unavailable');
assert.equal(app.livePreviews.has(failedCanvas), false);
app.previewControls = originalControls;
assert.equal(app.drawLivePreview(failedCanvas, 'miner', 1032), true, 'preview can recover after a failure');
console.log('Mining card and selected previews passed.');

const createElement = sandbox.document.createElement;
const videoEvents = new Map();
let pauses = 0;
const recordedVideo = {
    canPlayType: () => 'probably', paused: true, readyState: 2, videoWidth: 1280, videoHeight: 720,
    addEventListener: (name, callback) => videoEvents.set(name, callback),
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; pauses++; }
};
sandbox.document.createElement = tag => tag === 'video' ? recordedVideo : createElement(tag);
const recordedApp = Object.create(sandbox.window.TestApp.prototype);
recordedApp.canvasIsVisible = () => true;
assert.equal(recordedApp.drawLivePreview(canvas(200, 112), 'skyline', 1000), true);
assert.match(recordedVideo.src, /start\.mp4$/);
assert.equal(recordedVideo.muted, true);
assert.equal(recordedVideo.playsInline, true);
for (const clip of ['checkpoint-1', 'checkpoint-2', 'checkpoint-3', 'start']) {
    videoEvents.get('ended')();
    assert.ok(recordedVideo.src.endsWith(`${clip}.mp4`));
}
recordedApp.stopMultiplayerAnimation();
assert.equal(pauses, 1);
recordedVideo.readyState = 0;
assert.equal(recordedApp.drawRecordedCityPreview(canvas(360, 240)), false, 'loading clips must allow the live fallback');
videoEvents.get('error')();
assert.equal(recordedApp.drawRecordedCityPreview(canvas(360, 240)), false, 'failed clips must allow the live fallback');
sandbox.document.createElement = createElement;
console.log('Recorded City Escape playlist, muted playback, pause, loading, and failure fallbacks passed.');

const demoFor = mode => {
    const c = canvas(900, 500);
    assert.equal(app.drawLivePreview(c, mode, 1000), true);
    return app.livePreviews.get(c);
};
for (const [code, expected] of [['KeyS', 'guard'], ['KeyE', 'swing'], ['ShiftLeft', 'heavy'], ['KeyF', 'dodge']]) {
    const { session, game, hold, tap } = demoFor('duel');
    hold.clear(); tap.clear();
    session.mouse.pressed = false;
    game.swingCd = game.swingT = game.dodge = game.dodgeCd = game.stun = game.hitlag = game.respawn = 0;
    game.orb.t = 100;
    hold.add(code); tap.add(code);
    game.update(1 / 60);
    if (expected === 'guard') assert.equal(game.guard, true, 'S guards');
    if (expected === 'swing') assert.ok(game.swingT > 0 && !game.swingHeavy, 'E swings');
    if (expected === 'heavy') assert.ok(game.swingT > 0 && game.swingHeavy && !game.guard, 'Shift performs a heavy swing, not guard');
    if (expected === 'dodge') assert.ok(game.dodge > 0, 'F dodges');
}
for (const action of ['pass', 'power']) {
    const { session, game, hold, tap } = demoFor('sports');
    hold.clear(); tap.clear();
    session.spend = amount => game.res.spend(amount);
    session.mouse.pressed = false;
    game.kickCd = game.kickCharge = 0;
    game.kickHeld = false;
    game.freeze = 0;
    game.pads.forEach(pad => { pad.used = true; });
    game.ball.x = game.me.x + 45;
    game.ball.y = game.me.y;
    game.ball.vx = game.ball.vy = 0;
    const before = game.res.value;
    if (action === 'pass') tap.add('KeyE');
    else {
        hold.add('ShiftLeft');
        for (let i = 0; i < 48; i++) {
            game.ball.x = game.me.x + 45;
            game.ball.y = game.me.y;
            game.update(1 / 60);
        }
        assert.ok(game.kickCharge >= .99, 'holding Shift charges the power kick');
        hold.delete('ShiftLeft');
        game.ball.x = game.me.x + 45;
        game.ball.y = game.me.y;
    }
    game.update(1 / 60);
    assert.ok(game.kickCd > 0, `${action} kicks the ball`);
    assert.ok(game.res.value < before, `${action} spends energy`);
    assert.ok(Math.hypot(game.ball.vx, game.ball.vy) > (action === 'power' ? 900 : 400), `${action} applies the expected impulse`);
}
console.log('Nearby King of the Hill actions and Soccer pass/charged power-kick input passed.');
const lava = demoFor('miner').game;
lava.T.fill(1); lava.F.fill(0); lava.D.fill(0); lava.flowing.clear();
for (let x = 2; x <= 40; x++) {
    lava.T[10 * 70 + x] = 0;
    for (let y = 12; y <= 20; y++) lava.T[y * 70 + x] = 0;
}
lava.T[11 * 70 + 16] = 0;
lava.T[10 * 70 + 10] = 6; lava.flowing.add(10 * 70 + 10);
lava.flowClock = lava.flowSideClock = 0;
lava.flowLava(0.3);
assert.equal(lava.tile(11, 10), 0, 'sideways lava waits for its slower interval');
for (let i = 0; i < 300; i++) lava.flowLava(0.1);
assert.equal(lava.tile(3, 10), 6, 'source spreads seven blocks sideways');
assert.equal(lava.tile(2, 10), 0, 'source cannot spread beyond seven blocks');
assert.equal(lava.F[10 * 70 + 3], 7);
assert.equal(lava.tile(16, 20), 6, 'lava falls all the way to the lower floor');
assert.equal(lava.F[20 * 70 + 16], 0, 'falling resets lateral reach');
assert.equal(lava.D[15 * 70 + 16], 1, 'falling columns remain full-height');
assert.equal(lava.tile(23, 20), 6, 'landed waterfall has a fresh sideways allowance');
assert.equal(lava.tile(24, 20), 0);
assert.equal(lava.D[10 * 70 + 10], 0, 'source stays a source rather than a falling block');
assert.equal(lava.tile(15, 15), 0, 'falling lava does not spread sideways in midair');
console.log('Source, lateral reach, falling columns, and waterfall lava regressions passed.');

const sessionPrototype = A.Session.prototype;
const localCards = [{ front: 'Question', back: 'Answer' }];
const localCardSession = { practice: true, cards: [], api: { getCards() { assert.fail('local games must not request a fake room from Supabase'); } } };
sessionPrototype.loadCards.call(localCardSession, localCards);
assert.equal(localCardSession.cards, localCards);
const uncappedResource = new A.Resource('Energy', '#fff', 100, 90);
uncappedResource.add(500);
assert.equal(uncappedResource.value, 590, 'question refills must accumulate above the former cap');
assert.equal(uncappedResource.spend(120), true);
assert.equal(uncappedResource.value, 470);
assert.equal(uncappedResource.spend(471), false);
for (const practice of [false, true]) assert.equal(sessionPrototype.rewardAmount.call({ reward: 20, practice, game: { res: { mult: 3 } } }), 20);
const rosterSession = { user: { id: 'me' }, roster: new Map(), remotes: new Map() };
sessionPrototype.updateRoster.call(rosterSession, { state: { players: [{ id: 'me', nickname: 'Me', skin: 'skin_robot' }, { id: 'other', nickname: 'Other', skin: 'skin_ninja' }] } });
const local = rosterSession.local;
rosterSession.remotes.set('other', {});
sessionPrototype.updateRoster.call(rosterSession, { state: { players: [{ id: 'me', nickname: 'Me', skin: 'skin_alien' }, { id: 'other', nickname: 'Other', equipped_skin: 'skin_gold' }] } });
assert.equal(local, rosterSession.local, 'roster refresh preserves the live local player reference');
assert.equal(local.cos.skin, 'skin_alien');
assert.equal(rosterSession.remotes.get('other').cos.skin, 'skin_gold');
assert.equal(A.util.playerCosmetics({ equipped_skin: '', skin: 'skin_robot' }).skin, '', 'unequipping does not restore a stale skin');
assert.equal(A.util.playerCosmetics({ cos: { skin: 'skin_gold', acc: 'acc_sparkles' } }).acc, 'acc_sparkles');
assert.equal(A.util.who({ skin: 'skin_robot' }).skin.body, '#94a3b8');
console.log('Resource parity and live cosmetic refresh regressions passed.');

sandbox.requestAnimationFrame = () => 0;
const pausedBot = { x: 10, y: 20, tx: 100, ty: 200, seen: 0 };
const pausedSession = {
    lastFrame: 5984, over: false, countdown: 0, paused: true, t: 10,
    remotes: new Map([['bot', pausedBot]]), justPressed: new Set(), mouse: {},
    overlay: { querySelector: () => ({ classList: { add: noop } }) },
    game: { draw: noop, update: () => assert.fail('paused game must not update') },
    ctx: context, dpr: 1, scale: 1, vw: 900, vh: 500,
    updateMeter: noop, checkEnd: noop
};
A.Session.prototype.frame.call(pausedSession, 6000);
assert.equal(pausedSession.remotes.size, 1, 'admin pause must not expire bots after five seconds');
assert.equal(pausedBot.x, 10, 'admin pause must freeze remote interpolation');
assert.equal(pausedBot.y, 20);
assert.equal(pausedSession.t, 10);
console.log('Admin pause freezes gameplay and retains stationary bots after the remote timeout.');

const catalog = sandbox.window.StudBudCommunityGames.catalog;
const skins = catalog.filter(item => item.type === 'skin');
for (const skin of skins) {
    for (const item of catalog.filter(item => ['hat', 'accessory', 'effect', 'trail'].includes(item.type))) {
        const cosmetics = item.type === 'hat' ? { skin: skin.id, hat: item.id } : { skin: skin.id, accessory: item.id };
        A.util.drawFigureSide(context, cosmetics, 0, 0, 26, 42, 1, 0, false);
        A.util.drawFigureTop(context, cosmetics, 100, 100, 15, Math.PI / 2, 0);
    }
}
console.log('Every catalog skin/hat/accessory combination renders in side and top-down views.');

const sql = fs.readFileSync(path.join(root, 'supabase-setup.sql'), 'utf8');
const addedParticles = [
    'acc_dust_trail', 'acc_confetti_trail', 'acc_sakura_trail', 'acc_pixel_trail', 'acc_meteor_trail', 'acc_aurora_trail',
    'acc_dew_effect', 'acc_leaf_effect', 'acc_snowflake_effect', 'acc_electric_effect', 'acc_solar_effect', 'acc_vortex_effect'
];
const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
for (const id of addedParticles) {
    const item = catalog.find(entry => entry.id === id);
    const tuple = sql.match(new RegExp(`\\('${id}',\\s*(\\d+)\\)`));
    assert.ok(item && tuple, `${id} exists in client and server catalogs`);
    const basePrice = Number(tuple[1]);
    assert.equal(item.price, Math.round(basePrice * 2.5 / 5) * 5, `${id} price matches server`);
    assert.equal(item.rarity, sandbox.window.StudBudCommunityGames.constructor.rarityForPrice(basePrice));
    assert.ok(item.type === 'effect' || item.type === 'trail');
    assert.ok(item.description);
}
for (const type of ['effect', 'trail']) {
    const box = sandbox.window.StudBudCommunityGames.constructor.boxes.find(entry => entry.id === type);
    assert.equal(box.price, 200);
    assert.equal(Object.values(box.chances).reduce((sum, value) => sum + value, 0), 100);
    assert.deepEqual(Object.values(box.chances), [25, 35, 25, 12, 2, 1]);
    for (const rarity of rarityOrder) {
        assert.ok(catalog.some(item => item.type === type && item.rarity === rarity), `${type} box has ${rarity} items`);
    }
    const suffixPool = catalog.filter(item => item.id.endsWith(`_${type}`) && item.id.startsWith('acc_'));
    assert.ok(suffixPool.every(item => item.type === type), `${type} suffix cannot select another category`);
    assert.ok(sql.includes(`s.id like 'acc\\_%\\_${type}'`), `${type} server pool matches item suffix`);
}
assert.match(sql, /elsif p_box in \('effect', 'trail'\) then\s+v_cost := 200/);
assert.match(sql, /v_roll < 0\.25[\s\S]*v_roll < 0\.60[\s\S]*v_roll < 0\.85[\s\S]*v_roll < 0\.97[\s\S]*v_roll < 0\.99/);

const particleTrace = (id, top, time, face = 1) => {
    const commands = [], stack = [];
    const state = { globalAlpha: .7 };
    const ctx = new Proxy(state, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'save') return () => stack.push({ ...state });
            if (key === 'restore') return () => { Object.assign(state, stack.pop()); };
            return (...args) => {
                for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${id} ${key} geometry is finite`);
                commands.push([key, ...args]);
            };
        },
        set(target, key, value) {
            if (typeof value === 'number') assert.ok(Number.isFinite(value), `${id} ${key} is finite`);
            target[key] = value;
            return true;
        }
    });
    const p = { accessory: id };
    if (top) A.util.drawFigureTop(ctx, p, 100, 100, 15, Math.PI / 2, time, .7);
    else A.util.drawFigureSide(ctx, p, 100, 100, 26, 42, face, time, false, .7);
    assert.equal(stack.length, 0, `${id} balances canvas save/restore`);
    assert.equal(state.globalAlpha, .7, `${id} preserves caller alpha`);
    assert.ok(commands.length < 800, `${id} has bounded drawing work`);
    return JSON.stringify(commands);
};
for (const top of [false, true]) {
    const baseline = particleTrace('', top, 0);
    const shapes = new Set();
    for (const id of addedParticles) {
        const frame = particleTrace(id, top, 0);
        assert.notEqual(frame, baseline, `${id} is visible in a static shop preview`);
        assert.notEqual(frame, particleTrace(id, top, 1.7), `${id} animates in ${top ? 'top' : 'side'} view`);
        particleTrace(id, top, 13.2, -1);
        shapes.add(frame);
    }
    assert.equal(shapes.size, addedParticles.length, 'new particle items produce distinct drawings');
}
assert.match(A.util.accountTagMarkup('OverIT'), />Owner<\/span>/);
assert.match(A.util.accountTagMarkup('ANDY'), />Co-owner<\/span>/);
for (const name of ['', undefined, 'overit2', '<img src=x>', 'andy_owner']) assert.equal(A.util.accountTagMarkup(name), '');
sessionPrototype.updateRoster.call(rosterSession, { state: { players: [{ id: 'me', nickname: 'Nickname', username: 'overit' }, { id: 'other', nickname: 'overit', username: 'student' }] } });
rosterSession.user = { id: 'me' };
rosterSession.game = { scoreGoal: true };
rosterSession.score = rosterSession.goal = 0;
rosterSession.metric = sessionPrototype.metric;
const taggedStandings = sessionPrototype.standings.call(rosterSession);
assert.equal(taggedStandings.find(row => row.id === 'me').username, 'overit');
assert.equal(A.util.accountTagMarkup(taggedStandings.find(row => row.id === 'other').username), '', 'an arbitrary multiplayer nickname cannot claim an account tag');
assert.match(sql, /'username', coalesce\(account\.raw_user_meta_data ->> 'username', ''\)/);
assert.match(sql, /left join auth\.users account on account\.id::text = player ->> 'id'/);
console.log('New box catalog/rarity parity, distinct animated particles, and canonical username tags passed.');

const scheduleState = {
    courses: [{ code: 'math', title: 'Math & Science' }, { code: 'english', title: 'English' }],
    schedule: { odd: { 1: 'math' }, even: { 2: 'english' }, all: {} },
    assignments: [
        { id: 'test', courseCode: 'math', title: 'Unit <test>', dueDate: '2026-10-12', kind: 'test', status: 'pending' },
        { id: 'work', courseCode: 'english', title: 'Essay', dueDate: '2026-10-12', kind: 'assignment', status: 'pending' },
        { id: 'weekend', courseCode: 'math', title: 'Sunday homework', dueDate: '2026-10-11', kind: 'assignment', status: 'pending' },
        { id: 'done', courseCode: 'math', title: 'Completed work', dueDate: '2026-10-12', status: 'completed' },
        { id: 'graded', courseCode: 'math', title: 'Graded work', dueDate: '2026-10-12', graded: true }
    ]
};
sandbox.AppState = { get: key => scheduleState[key] };
sandbox.localDateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const scheduleNodes = new Map(['daily-schedule-list', 'daily-schedule-type', 'daily-schedule-edit'].map(id => [id, {}]));
const originalGetElement = sandbox.document.getElementById;
sandbox.document.getElementById = id => scheduleNodes.get(id);
app.renderDailySchedule(new Date(2026, 9, 11));
assert.equal(scheduleNodes.get('daily-schedule-edit').textContent, 'Edit schedule');
assert.match(scheduleNodes.get('daily-schedule-list').innerHTML, /Your schedule is saved/);
assert.match(scheduleNodes.get('daily-schedule-list').innerHTML, /Next classes/);
assert.match(scheduleNodes.get('daily-schedule-list').innerHTML, /Sunday homework/);
app.renderDailySchedule(new Date(2026, 9, 12));
const monday = scheduleNodes.get('daily-schedule-list').innerHTML;
assert.match(monday, /Math &amp; Science/);
assert.match(monday, /Unit &lt;test&gt;/);
assert.match(monday, /Essay/);
assert.doesNotMatch(monday, /Completed work|Graded work|Sunday homework/);
assert.equal(app.getScheduleEntries(new Date(2026, 9, 13)).entries.filter(entry => entry.course).length, 1);
scheduleState.schedule = { all: { 2: 'english' } };
app.renderDailySchedule(new Date(2026, 9, 13));
assert.match(scheduleNodes.get('daily-schedule-list').innerHTML, /none of your classes use today/);
assert.equal(scheduleNodes.get('daily-schedule-edit').textContent, 'Edit schedule');
scheduleState.schedule = {};
app.renderDailySchedule(new Date(2026, 9, 12));
assert.equal(scheduleNodes.get('daily-schedule-edit').textContent, 'Set schedule');
sandbox.document.getElementById = originalGetElement;
console.log('Saved weekday/weekend schedules, upcoming classes, and due work/tests passed.');

const delivery = demoFor('market');
const market = delivery.game;
for (const block of market.blocks) {
    const shelter = { x: block.x + 40, y: block.y + 40, r: 15 };
    assert.ok(!market.walls.some(wall => A.util.overlap({ x: shelter.x - 15, y: shelter.y - 15, w: 30, h: 30 }, wall)), 'shelter must be accessible');
    for (let t = 0; t < 120; t += 0.5) {
        assert.ok(!market.cars.some(car => A.util.overlap({ x: shelter.x - 12, y: shelter.y - 12, w: 24, h: 24 }, market.carRect(car, t))), 'shelter must stay outside every traffic lane');
    }
}
const deliveryBot = delivery.bots[0];
deliveryBot.ai.target = { x: market.W - 100, y: market.H - 100 };
deliveryBot.ai.targetUntil = 0; deliveryBot.ai.carrying = true; deliveryBot.ai.path = [deliveryBot.ai.target];
delivery.clock = 20;
app.stepAmbientBot(delivery, deliveryBot, 0, 1 / 60);
assert.equal(deliveryBot.deliveries || 0, 0, 'a target timeout cannot score an undelivered package');

const mining = demoFor('miner');
const miningBot = mining.bots[0];
const untouchedTiles = mining.game.T.slice();
miningBot.ai.ore = { x: 12, y: 24 }; miningBot.ai.oreUntil = 1000;
for (let i = 0; i < 360; i++) { mining.clock += 1 / 60; app.stepAmbientBot(mining, miningBot, 0, 1 / 60); }
assert.ok(mining.game.T.some((tile, i) => tile !== untouchedTiles[i]), 'mining bots must dig a path toward distant ore');
console.log('Safe delivery recesses, real delivery credit, and active mining bots passed.');

const arena = demoFor('shooter');
arena.game.me.x = 1300; arena.game.me.y = 850;
arena.game.bullets = [];
Object.assign(arena.bots[0], { x: 1410, y: 850, hp: 100, invuln: 0, respawn: 0 });
arena.game.fire(0, 1900, true, arena.meId, 85, '#fff', 0.5);
arena.game.update(0.05);
assert.equal(arena.bots[0].hp, 15, 'fast bullets must hit bots during collision substeps');
const soloResource = { mode: 'shooter', game: { res: { value: 0, max: 100 } }, session: { practice: true, preview: false, rewardAmount: () => 20 }, clock: 0 };
const resourceBot = { ai: { reaction: 0.2 } };
assert.equal(app.botResourceReady(soloResource, resourceBot, 0.1), false);
soloResource.clock = 4;
assert.equal(app.botResourceReady(soloResource, resourceBot, 0.1), true);
assert.equal(resourceBot.ai.energy, 20);
soloResource.session.testing = true;
assert.equal(app.botResourceReady(soloResource, resourceBot, 0.1), true);
assert.equal(resourceBot.ai.energy, 100, 'infinite energy belongs to testing');
console.log('Shooter collision substeps and solo/test bot resources passed.');

for (const mode of ['skyline', 'river', 'market', 'miner', 'duel', 'shooter', 'sports']) {
    for (const testing of [false, true]) {
        const demo = demoFor(mode);
        const s = demo.session;
        let simulatedNow = Date.now();
        sandbox.Date = class extends Date { static now() { return simulatedNow; } };
        s.startedAt = simulatedNow - demo.clock * 1000;
        s.preview = false; s.practice = true; s.testing = testing;
        s.roster = new Map(demo.bots.map(bot => [bot.id, { id: bot.id }]));
        s.rewardAmount = () => 5;
        s.axis = () => ({ x: 0, y: 0 }); s.down = s.pressed = () => false;
        s.mouse = { x: 0, y: 0, down: false, pressed: false };
        for (let frame = 0; frame < 5400; frame++) {
            simulatedNow += 1000 / 30;
            app.tickPracticeBots(demo, 1 / 30);
            for (const bot of demo.bots) {
                assert.ok(Number.isFinite(bot.x) && Number.isFinite(bot.y), `${mode} long-run position`);
                assert.ok(Number.isFinite(bot.score || 0) && Number.isFinite(bot.goal || 0), `${mode} long-run score`);
                assert.equal(s.roster.get(bot.id).score, bot.score, `${mode} roster uses the real score`);
                assert.equal(s.roster.get(bot.id).goal, bot.goal, `${mode} roster uses the real objective`);
            }
            demo.game.update(1 / 30);
        }
        console.log(`${mode} ${testing ? 'testing' : 'solo'} three-minute bot objectives: ${demo.bots.map(bot => bot.goal).join(', ')}`);
        if (mode === 'market') assert.ok(demo.bots.some(bot => bot.deliveries > 0), 'market bots must complete real deliveries over a full run');
        if (mode === 'miner' || mode === 'sports') assert.ok(demo.bots.some(bot => bot.goal > 0), `${mode} bots must bank crystals or score team goals`);
        sandbox.Date = Date;
    }
}

app.waitingLane = () => ({ type: 'grass', blockers: [] });
app.waitingDeath = reason => {
    app.waitingRunner.dead = true;
    app.waitingRunner.running = false;
    app.waitingRunner.deathReason = reason;
};
const runner = row => ({
    running: true, started: true, x: 4, row, rowFloat: row,
    cameraX: 4, cameraRow: row - 3.5, score: row,
    clock: 0, fx: [], viewCols: 9, hop: null
});
for (const fps of [30, 60, 120]) {
    app.waitingRunner = runner(100);
    for (let i = 0; i < fps; i++) {
        const before = app.waitingRunner.cameraRow;
        app.stepWaitingRunner(1 / fps);
        assert.ok(app.waitingRunner.cameraRow >= before + 0.85 / fps - 1e-9, 'camera must advance every frame, even far ahead of the start');
    }
    assert.ok(!app.waitingRunner.dead);
    assert.ok(app.waitingRunner.cameraRow > 97.56 && app.waitingRunner.cameraRow < 97.58);
    for (let i = 0; i < fps * 6 && !app.waitingRunner.dead; i++) app.stepWaitingRunner(1 / fps);
    assert.equal(app.waitingRunner.deathReason, 'The trail caught up', 'pausing after getting ahead must still lose');
}
app.waitingRunner = runner(0);
for (let i = 0; i < 300; i++) {
    app.waitingRunner.rowFloat += 1 / 12;
    app.waitingRunner.row = Math.floor(app.waitingRunner.rowFloat);
    app.waitingRunner.score = app.waitingRunner.row;
    const before = app.waitingRunner.cameraRow;
    app.stepWaitingRunner(1 / 60);
    assert.ok(app.waitingRunner.cameraRow > before);
    assert.ok(app.waitingRunner.rowFloat - app.waitingRunner.cameraRow < 4.25, 'forward recentering must keep the runner near the screen');
    assert.ok(!app.waitingRunner.dead);
}
const aheadCamera = app.waitingRunner.cameraRow;
app.waitingRunner.rowFloat -= 1;
app.waitingRunner.row = Math.floor(app.waitingRunner.rowFloat);
app.stepWaitingRunner(1 / 60);
assert.ok(app.waitingRunner.cameraRow > aheadCamera, 'backward movement must not reverse the camera');
console.log('Continuous camera, bounded recentering, pause loss, and frame-rate regressions passed.');

async function checkCommunityAndAdminUi() {
    const node = () => {
        const classes = new Set();
        return {
            textContent: '', innerHTML: '', value: '', dataset: {},
            classList: {
                add: name => classes.add(name), remove: name => classes.delete(name),
                contains: name => classes.has(name),
                toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
            }
        };
    };
    const nodes = new Map(['community-deck-status', 'community-deck-results', 'admin-list', 'admin-status', 'admin-search',
        'admin-search-form', 'admin-notice-message', 'site-notice', 'site-notice-message', 'admin-deck-full-set'].map(id => [id, node()]));
    const profile = node();
    const overlay = node();
    overlay.firstElementChild = profile;
    nodes.set('user-profile-overlay', overlay);
    sandbox.document.getElementById = id => nodes.get(id);
    const actions = [node(), node()];
    actions.forEach(action => { action.dataset.communityDeckId = 'new-set'; });
    sandbox.document.querySelectorAll = () => actions;
    const state = { flashcards: [
        { id: 'imported', title: 'Renamed locally', communitySourceId: 'saved-set' },
        { id: 'original', title: 'My shared set', communityDeckId: 'owned-set' }
    ], courses: [] };
    let saves = 0, imports = 0;
    sandbox.AppState = { get: key => state[key], saveFlashcardDeck: async deck => { state.flashcards.push(deck); saves++; } };
    sandbox.window.StudBudCloud = { user: { id: 'qa-user' } };
    const shared = [
        { id: 'saved-set', title: 'Original shared title', card_count: 1, study_count: 0 },
        { id: 'owned-set', title: 'My shared set', card_count: 1, study_count: 0 },
        { id: 'new-set', title: 'New shared set', card_count: 1, study_count: 0 }
    ];
    const calls = [];
    let notice = { message: '</textarea><script>not executable</script>', active: true, updated_at: 'first' };
    sandbox.window.StudBudCommunityGames = {
        searchDecks: async () => shared,
        importDeck: async id => { imports++; return { id, title: 'New shared set', owner_id: 'author', cards: [{ front: 'Term', back: 'Definition' }] }; },
        getUserProfile: async () => ({ username: 'Author', show_stats: false, decks: shared }),
        getSiteNotice: async () => notice,
        adminCall: async (name, args) => {
            calls.push({ name, args });
            if (name === 'studbud_admin_set_site_notice') { notice = { message: args.p_message, active: args.p_active, updated_at: 'updated' }; return; }
            if (name === 'studbud_admin_get_deck') return { title: 'Full <set>', card_count: 2, cards: [{ front: '<term>', back: '<definition>' }, { front: 'Second', back: 'Card' }] };
            if (name === 'studbud_admin_list_users') return [{ id: 'user', username: 'Student', banned: true, ban_reason: '<reason>', created_at: '2026-10-01', last_sign_in_at: '2026-10-12', coins: 10, wins: 1, decks: 2 }];
            return [];
        }
    };
    app.multiplayerAvatarMarkup = () => '<img alt="">';
    app.isAdmin = true;
    await app.searchCommunityDecks('');
    assert.equal((nodes.get('community-deck-results').innerHTML.match(/Already in your decks/g) || []).length, 2);
    assert.equal((nodes.get('community-deck-results').innerHTML.match(/data-action="import-community-deck"/g) || []).length, 1);
    await app.openUserProfile('author');
    assert.equal((profile.innerHTML.match(/Already in your decks/g) || []).length, 2);
    assert.equal((profile.innerHTML.match(/data-action="import-community-deck"/g) || []).length, 1);
    for (const [username, tag] of [['overit', 'Owner'], ['andy', 'Co-owner'], ['student', '']]) {
        sandbox.window.StudBudCommunityGames.getUserProfile = async () => ({ username, show_stats: false, decks: shared });
        await app.openUserProfile('author');
        if (tag) assert.ok(profile.innerHTML.includes(`>${tag}</span>`), `${username} public profile shows its account tag`);
        else assert.ok(!profile.innerHTML.includes('account-tag'), 'ordinary profiles do not gain an account tag');
    }
    await app.importCommunityDeck('saved-set');
    await app.importCommunityDeck('owned-set');
    assert.equal(imports, 0, 'already-added and original published sets must not call the import RPC');
    await app.importCommunityDeck('new-set');
    assert.equal(imports, 1);
    assert.equal(saves, 1);
    actions.forEach(action => assert.match(action.outerHTML, /Already in your decks/));
    await app.importCommunityDeck('new-set');
    assert.equal(imports, 1);
    assert.equal(saves, 1);
    state.flashcards = state.flashcards.filter(deck => deck.communitySourceId !== 'new-set');
    app.refreshCommunityDeckActions();
    actions.forEach(action => assert.match(action.outerHTML, /Add to my decks/));
    console.log('Community search/profile added labels, duplicate prevention, and deletion refresh passed.');

    app.adminTab = 'users';
    await app.loadAdminList();
    assert.match(nodes.get('admin-list').innerHTML, /<details class="admin-tools">/);
    assert.match(nodes.get('admin-list').innerHTML, /Last sign-in:/);
    assert.match(nodes.get('admin-list').innerHTML, /Ban reason: &lt;reason&gt;/);
    await app.runAdminAction('inspect-deck', { id: 'full-set' });
    assert.match(nodes.get('admin-deck-full-set').innerHTML, /&lt;term&gt;/);
    assert.match(nodes.get('admin-deck-full-set').innerHTML, /Second/);
    app.adminTab = 'notices';
    await app.loadAdminList();
    assert.match(nodes.get('admin-list').innerHTML, /&lt;\/textarea&gt;&lt;script&gt;/);
    await app.loadSiteNotice(true);
    assert.equal(nodes.get('site-notice-message').textContent, notice.message);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), false);
    app.dismissedSiteNotice = notice.updated_at;
    await app.loadSiteNotice(true);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), true);
    notice = { ...notice, updated_at: 'newer' };
    await app.loadSiteNotice(true);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), false);
    nodes.get('admin-notice-message').value = '   ';
    const beforePublish = calls.length;
    await app.runAdminAction('publish-notice', {});
    assert.equal(calls.length, beforePublish);
    assert.match(nodes.get('admin-status').textContent, /Enter an announcement/);
    nodes.get('admin-notice-message').value = '  Test announcement  ';
    await app.runAdminAction('publish-notice', {});
    assert.equal(notice.message, 'Test announcement');
    assert.equal(notice.active, true);
    await app.runAdminAction('hide-notice', {});
    assert.equal(notice.active, false);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), true);
    console.log('Admin moderation/deck inspection and announcement validation/escaping/dismissal passed with local fixtures.');
}
checkCommunityAndAdminUi().catch(error => { console.error(error); process.exitCode = 1; });
