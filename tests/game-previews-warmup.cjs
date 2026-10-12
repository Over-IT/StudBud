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
const localValues = new Map();
const sandbox = {
    console: { ...console, warn: (...args) => { errors.push(args); console.warn(...args); } },
    performance, Date, Math, Map, Set, Uint8Array,
    document: { addEventListener() {}, getElementById() { return { textContent: '' }; } },
    window: { devicePixelRatio: 1, addEventListener() {} },
    navigator: { maxTouchPoints: 0 },
    localStorage: {
        getItem: key => localValues.get(key) ?? null,
        setItem: (key, value) => localValues.set(key, String(value))
    }
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
assert.equal(app.drawLivePreview(failedCanvas, 'miner', 1016), true, 'new preview renders its initial state before the first physics step');
assert.equal(app.drawLivePreview(failedCanvas, 'miner', 1032), false);
assert.ok(clears >= beforeClears + 2, 'mode switch and failure must clear the previous game');
assert.equal(messages.at(-1), 'Game preview unavailable');
assert.equal(app.livePreviews.has(failedCanvas), false);
app.previewControls = originalControls;
assert.equal(app.drawLivePreview(failedCanvas, 'miner', 1048), true, 'preview can recover after a failure');
console.log('Mining card and selected previews passed.');

const previewPositions = [];
for (const fps of [30, 60, 120]) {
    const c = canvas(360, 200);
    app.drawLivePreview(c, 'skyline', 1000);
    const demo = app.livePreviews.get(c);
    for (let frame = 1; frame <= fps * 3; frame++) app.drawLivePreview(c, 'skyline', 1000 + frame * 1000 / fps);
    assert.ok(Math.abs(demo.clock - 3) < 1e-8, 'preview simulation keeps real elapsed time at each refresh rate');
    assert.ok(Math.abs(demo.game.drawDt - 1 / fps) < 1e-8, 'camera interpolation uses render time, not the physics substep');
    previewPositions.push([demo.game.me.x, demo.game.me.y]);
}
for (const position of previewPositions) {
    assert.ok(Math.hypot(position[0] - previewPositions[0][0], position[1] - previewPositions[0][1]) < .01, 'fixed-step parkour previews follow the same route at 30/60/120 FPS');
}
assert.doesNotMatch(source, /drawRecordedCityPreview|recordedCityPreview/);
console.log('Live parkour previews have consistent physics and camera timing at 30, 60 and 120 FPS.');

const demoFor = mode => {
    const c = canvas(900, 500);
    assert.equal(app.drawLivePreview(c, mode, 1000), true);
    return app.livePreviews.get(c);
};
for (const mode of ['skyline', 'duel']) {
    const { session, game, hold, tap } = demoFor(mode);
    hold.clear(); tap.clear();
    session.axis = () => ({ x: 0, y: 0 });
    session.mouse.pressed = false;
    session.stickJumpHeld = true;
    session.spend = amount => game.res.spend(amount);
    game.res.value = 1000;
    game.solids = [{ x: -1000, y: 0, w: 4000, h: 40 }];
    Object.assign(game.me, { x: 400, y: -game.me.h, vx: 0, vy: 0, onGround: true, ground: null });
    game.stun = game.respawn = game.hitlag = 0;
    game.update(1 / 120);
    assert.ok(game.me.vy < -700, `${mode} firm upward joystick jumps from the ground`);
    for (let i = 0; i < 20; i++) game.update(1 / 120);
    assert.equal(game.airJumps, 1, `${mode} held joystick does not spend the air jump`);
    Object.assign(game.me, { y: -game.me.h, vy: 0, onGround: true });
    game.update(1 / 120);
    assert.ok(game.me.vy < -700, `${mode} still-held joystick jumps again after landing`);
    assert.equal(game.airJumps, 1);
    tap.add('Space');
    game.update(1 / 120);
    assert.equal(game.airJumps, 0, `${mode} deliberate Jump button still triggers an air jump`);
}
for (const mode of Object.keys(A.games)) {
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [2000, 300], [1366, 768], [2560, 1440]]) {
        const { session, game } = demoFor(mode);
        session.preview = false;
        session.scale = A.util.clamp(height / 720, .65, 1.25);
        session.vw = width / session.scale; session.vh = height / session.scale;
        session.overlay.classList.contains = () => width < 900;
        game.draw(context, session.vw, session.vh);
        const zoom = mode === 'duel' ? game.view.z : game.zoom;
        if (Number.isFinite(zoom)) {
            const physicalZoom = zoom * session.scale;
            assert.ok(physicalZoom >= .65 - 1e-9 && physicalZoom <= 1.15 + 1e-9, `${mode} has readable, bounded world zoom at ${width}x${height}: ${physicalZoom}`);
        }
        if (game.mouseWorld && typeof game.mouseWorld === 'function') {
            session.mouse.x = session.vw / 2; session.mouse.y = session.vh / 2;
            const target = game.mouseWorld();
            assert.ok(Number.isFinite(target.x) && Number.isFinite(target.y), `${mode} camera-to-input mapping stays finite`);
        }
    }
}
console.log('Grounded joystick auto-jump, deliberate air jumps, and readable scene zoom across all modes passed.');
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
const realDate = sandbox.Date;
let ballNow = 100000;
sandbox.Date = class extends Date { static now() { return ballNow; } };
const soccerPeer = id => {
    const { session, game } = demoFor('sports');
    session.user = { id };
    session.roster = new Map([['a', {}], ['b', {}]]);
    session.practice = session.preview = false;
    session.remotes = new Map();
    session.remoteList = () => [];
    session.mouse.pressed = false;
    session.axis = () => ({ x: 0, y: 0 });
    session.down = session.pressed = () => false;
    const events = [];
    let sends = 0;
    session.emit = event => events.push(event);
    session.sendState = () => sends++;
    game.teamsOn = true; game.teamIds = ['a', 'b']; game.myTeam = id === 'a' ? 0 : 1;
    game.freeze = 0; game.me.x = 300; game.me.y = 200;
    game.pads = [];
    Object.assign(game.ball, { x: 1200, y: 550, vx: 0, vy: 0 });
    return { session, game, events, sends: () => sends };
};
const left = soccerPeer('a'), right = soccerPeer('b');
const advanceSoccer = (peer, seconds) => {
    for (let i = 0; i < Math.round(seconds * 120); i++) peer.game.update(1 / 120);
};
for (let pass = 0; pass < 12; pass++) {
    const sender = pass % 2 ? right : left, receiver = pass % 2 ? left : right;
    sender.game.ball.vx = pass % 2 ? -650 : 650;
    sender.game.ball.vy = pass % 3 ? 80 : -80;
    sender.game.lastTouch = sender.session.user.id;
    sender.game.sendKick();
    const event = sender.events.at(-1);
    assert.equal(sender.sends(), Math.floor(pass / 2) + 1, 'contacts flush immediately, not on the 100ms timer');
    const transit = [.05, .15, .3][pass % 3];
    ballNow += transit * 1000;
    advanceSoccer(sender, transit);
    receiver.game.ball.vx += 120;
    receiver.game.ball.x -= 20;
    receiver.game.onEvent(event, { id: sender.session.user.id });
    assert.ok(Math.hypot(sender.game.ball.x - receiver.game.ball.x, sender.game.ball.y - receiver.game.ball.y) < .01, 'remote kick accounts for variable 50–300ms transit using the same physics');
    assert.ok(Math.hypot(sender.game.ball.vx - receiver.game.ball.vx, sender.game.ball.vy - receiver.game.ball.vy) < .01, 'remote kick replaces divergent velocity rather than stacking impulses');
    const beforeDuplicate = JSON.stringify(receiver.game.ball);
    receiver.game.onEvent(event, { id: sender.session.user.id });
    assert.equal(JSON.stringify(receiver.game.ball), beforeDuplicate, 'duplicate kick does not apply twice');
    assert.ok(!receiver.game.ex().ball, 'non-owner does not broadcast a competing ball state');
    const snapshot = sender.game.ex();
    receiver.game.ball.x += 15; receiver.game.ball.vx += 40;
    receiver.game.onState(snapshot, { id: sender.session.user.id });
    assert.ok(Math.abs(receiver.game.ball.x - sender.game.ball.x) < .01, 'owner heartbeat corrects drift even without a new kick');
    assert.ok(Math.abs(receiver.game.ballSpin - sender.game.ballSpin) < .01, 'snapshots do not double-count ball rotation during latency projection');
    const corrected = JSON.stringify(receiver.game.ball);
    receiver.game.onState(snapshot, { id: sender.session.user.id });
    receiver.game.onEvent(event, { id: sender.session.user.id });
    assert.equal(JSON.stringify(receiver.game.ball), corrected, 'older events and duplicate snapshots cannot rewind the ball');
    advanceSoccer(sender, .1); advanceSoccer(receiver, .1); ballNow += 100;
    assert.ok(Math.abs(sender.game.ball.x - receiver.game.ball.x) < .01, 'visual smoothing never changes physical trajectory');
}
const simultaneousA = soccerPeer('a'), simultaneousB = soccerPeer('b');
simultaneousA.game.ball.vx = 500; simultaneousB.game.ball.vx = -700;
simultaneousA.game.sendKick(); simultaneousB.game.sendKick();
simultaneousA.game.onEvent(simultaneousB.events.at(-1), { id: 'b' });
simultaneousB.game.onEvent(simultaneousA.events.at(-1), { id: 'a' });
assert.equal(simultaneousA.game.ballOwner, 'b');
assert.equal(simultaneousB.game.ballOwner, 'b');
assert.equal(simultaneousA.game.ball.vx, simultaneousB.game.ball.vx, 'simultaneous touches resolve identically on both clients');
const staleBeforeReset = simultaneousB.game.ex();
simultaneousA.game.kickoff();
simultaneousA.game.onState(staleBeforeReset, { id: 'b' });
assert.equal(simultaneousA.game.ball.vx, 0, 'pre-goal snapshot cannot undo a kickoff');
simultaneousA.game.freeze = 1;
simultaneousB.game.sendKick();
simultaneousA.game.onEvent(simultaneousB.events.at(-1), { id: 'b' });
assert.equal(simultaneousA.game.ball.vx, 0, 'goal freeze rejects incoming kicks');
simultaneousA.game.freeze = 0;
simultaneousA.game.onEvent({ ...simultaneousB.events.at(-1), vx: NaN }, { id: 'b' });
assert.equal(simultaneousA.game.ball.vx, 0, 'malformed realtime state cannot poison ball physics');
const bounceSender = soccerPeer('a'), bounceReceiver = soccerPeer('b');
Object.assign(bounceSender.game.ball, { y: 25, vx: 400, vy: -600 });
bounceSender.game.sendKick();
ballNow += 200; advanceSoccer(bounceSender, .2);
bounceReceiver.game.onEvent(bounceSender.events.at(-1), { id: 'a' });
assert.ok(Math.abs(bounceSender.game.ball.y - bounceReceiver.game.ball.y) < .01, 'latency projection includes pitch-wall bounces');
assert.ok(bounceReceiver.game.ball.vy > 0);
const transportSender = soccerPeer('a'), transportReceiver = soccerPeer('b');
transportSender.session.connected = true;
transportSender.session.outbox = [];
transportSender.session.emit = A.Session.prototype.emit;
transportSender.session.sendState = A.Session.prototype.sendState;
transportSender.session.send = packet => A.Session.prototype.receive.call(transportReceiver.session, packet);
transportSender.game.ball.vx = 600;
transportSender.game.lastTouch = 'a';
transportSender.game.sendKick();
assert.equal(transportReceiver.game.ball.vx, 600, 'actual session packets deliver kick events and owner snapshots');
transportSender.game.update(.1);
transportReceiver.game.ball.vx = -100;
transportSender.session.sendState();
assert.equal(transportReceiver.game.ball.vx, transportSender.game.ball.vx, 'actual periodic state packets reconcile ball motion');
sandbox.Date = realDate;
console.log('Soccer alternating passes, latency, owner snapshots, duplicate/reordered updates, simultaneous touches, resets, and wall bounces passed.');
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
    for (const item of catalog.filter(item => ['hat', 'accessory', 'effect'].includes(item.type))) {
        const cosmetics = item.type === 'hat' ? { skin: skin.id, hat: item.id } : { skin: skin.id, accessory: item.id };
        A.util.drawFigureSide(context, cosmetics, 0, 0, 26, 42, 1, 0, false);
        A.util.drawFigureTop(context, cosmetics, 100, 100, 15, Math.PI / 2, 0);
    }
}
console.log('Every catalog skin/hat/accessory combination renders in side and top-down views.');

const sql = fs.readFileSync(path.join(root, 'supabase-setup.sql'), 'utf8');
const addedParticles = [
    'acc_cloud_effect', 'acc_confetti_effect', 'acc_sakura_effect', 'acc_pixel_effect',
    'acc_meteor_effect', 'acc_aurora_effect', 'acc_rune_effect', 'acc_lunar_effect',
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
    assert.equal(item.type, 'effect');
    assert.ok(item.description);
}
for (const type of ['effect']) {
    const box = sandbox.window.StudBudCommunityGames.constructor.boxes.find(entry => entry.id === type);
    if (type === 'effect') assert.equal(box.name, 'Auras Box', 'aura box keeps its compatible effect ID with the new visible name');
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
assert.match(sql, /elsif p_box = 'effect' then\s+v_cost := 200/);
const retiredTrails = [
    'acc_leaves', 'acc_notes', 'acc_bubbles', 'acc_comet',
    'acc_rainbow_trail', 'acc_firefly_trail', 'acc_stardust_trail', 'acc_leaf_trail',
    'acc_dust_trail', 'acc_confetti_trail', 'acc_sakura_trail', 'acc_pixel_trail',
    'acc_meteor_trail', 'acc_aurora_trail'
];
assert.equal(catalog.filter(item => item.type === 'effect').length, 22);
assert.ok(!catalog.some(item => item.type === 'trail' || retiredTrails.includes(item.id)));
assert.ok(!sandbox.window.StudBudCommunityGames.constructor.boxes.some(box => box.id === 'trail'));
assert.doesNotMatch(source, /\['trail',|trail: 'Trails'|item\.type === 'trail'/);
assert.doesNotMatch(sql, /p_box = 'trail'|p_box in \('effect', 'trail'\)/);
const retirement = sql.match(/with retired\(ids\) as \(values \(array\[([\s\S]*?)\]::text\[\]\)\)([\s\S]*?);/);
assert.ok(retirement, 'server provides an idempotent trail cleanup');
assert.deepEqual([...retirement[1].matchAll(/'([^']+)'/g)].map(match => match[1]), retiredTrails);
assert.match(retirement[2], /where not \(item = any\(r\.ids\)\)\s+order by position/);
assert.match(retirement[2], /equipped_accessory = case when p\.equipped_accessory = any\(r\.ids\)\s+then '' else p\.equipped_accessory end/);
assert.match(retirement[2], /where p\.owned_items && r\.ids or p\.equipped_accessory = any\(r\.ids\)/);
assert.doesNotMatch(retirement[2], /coins\s*=|equipped_(hat|skin|pet|palette|avatar)\s*=/);
for (const id of retiredTrails) assert.doesNotMatch(sql, new RegExp(`\\('${id}',\\s*\\d+\\)`), `${id} cannot be bought or dropped`);
assert.match(sql, /raise exception 'Trails have been retired/);
assert.match(source, /\['effect', 'Auras'\]/, 'cosmetic tab displays Auras');
assert.match(source, /effect: 'Auras'/, 'inventory category displays Auras');
assert.doesNotMatch(source, /\['effect', 'Effects'\]|effect: 'Effects'/);
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
    for (const id of retiredTrails) {
        for (const time of [0, 1.7, 13.2]) {
            assert.equal(particleTrace(id, top, time), particleTrace('', top, time), `${id} no longer renders from stale equipment`);
        }
    }
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

let questionNow = 0;
const originalPerformance = sandbox.performance;
const originalTimers = sandbox.setTimeout;
const pendingAnswers = [];
sandbox.performance = { now: () => questionNow };
sandbox.setTimeout = callback => pendingAnswers.push(callback);
const questionBox = {
    contains: () => false, classList: { add: noop },
    querySelectorAll: () => [],
    querySelector: () => ({ textContent: '' })
};
const questionSession = Object.assign(Object.create(A.Session.prototype), {
    preview: false, countdown: 0, answered: 0, correct: 0,
    cards: [{ front: 'One plus one?', back: 'Two' }, { front: 'One plus two?', back: 'Three' }],
    overlay: { querySelector: () => questionBox }, canvas: { focus: noop },
    showQuestion: () => true, sfx: noop, toast: noop
});
for (const result of ['skip', 'correct', 'wrong']) {
    assert.equal(questionSession.ask(noop), true);
    if (result === 'skip') questionSession.skipQuestion();
    else {
        const correctIndex = questionSession.question.options.indexOf(questionSession.question.card.back);
        questionSession.answerQuestion(result === 'correct' ? correctIndex : -1);
        pendingAnswers.shift()();
    }
    questionNow += 999;
    assert.equal(questionSession.ask(noop), false, `${result}: automatic question stays blocked before one second`);
    questionNow++;
    assert.equal(questionSession.ask(noop), true, `${result}: automatic question reopens at one second`);
    questionSession.skipQuestion();
    assert.equal(questionSession.ask(noop, '', true), true, 'manual refill remains available during the automatic cooldown');
    questionSession.skipQuestion();
    questionNow += 1000;
}

const repeatMarket = demoFor('market');
Object.assign(repeatMarket.session, questionSession, {
    ask: A.Session.prototype.ask, closeQuestion: A.Session.prototype.closeQuestion,
    skipQuestion: A.Session.prototype.skipQuestion, question: null, askCooldownUntil: 0
});
repeatMarket.game.s = repeatMarket.session;
repeatMarket.session.startedAt = Date.now();
Object.assign(repeatMarket.game.me, { x: repeatMarket.game.vending[0].x, y: repeatMarket.game.vending[0].y });
repeatMarket.game.update(0);
assert.ok(repeatMarket.session.question, 'vending machine opens a real automatic question');
assert.ok(repeatMarket.game.vending[0].until <= 1.01, 'vending machine is reusable rather than consumed for the match');
repeatMarket.session.skipQuestion();
repeatMarket.game.vending[0].until = 0;
questionNow += 999;
repeatMarket.game.update(0);
assert.equal(repeatMarket.session.question, null, 'standing on a vending machine cannot immediately loop into another question');
questionNow++;
repeatMarket.game.update(0);
assert.ok(repeatMarket.session.question, 'the same vending machine can reopen after one second');
sandbox.performance = originalPerformance;
sandbox.setTimeout = originalTimers;
console.log('One-second question cooldown after skips/correct/wrong answers, manual refill and reusable market triggers passed.');

for (const mode of ['duel', 'shooter', 'skyline']) {
    const demo = demoFor(mode), bot = demo.bots[0];
    Object.assign(bot, { respawn: .01, vx: 900, vy: 900, stun: 1 });
    if (mode === 'duel') { bot.dmg = 150; app.stepDuelBots(demo, .02); assert.equal(bot.dmg, 0); }
    else if (mode === 'shooter') { bot.hp = 0; app.stepShooterBots(demo, .02); assert.equal(bot.hp, 100); }
    else {
        bot.st.checkpoint = 1;
        app.stepSkylineBot(demo, bot, 0, .02);
        assert.equal(bot.y, demo.game.checkpoints[1].y - bot.h, 'parkour bot returns to its latest checkpoint');
        bot.invuln = 0; bot.y = demo.game.checkpoints[1].y + 900;
        app.stepSkylineBot(demo, bot, 0, .02);
        assert.ok(bot.respawn > 0, 'falling parkour bot starts its respawn timer');
        app.stepSkylineBot(demo, bot, 0, 2);
    }
    assert.ok(bot.respawn <= 0 && bot.invuln > 0, `${mode} bot respawns with protection`);
    assert.equal(bot.vx, 0); assert.equal(bot.vy, 0);
    assert.ok(Number.isFinite(bot.x) && Number.isFinite(bot.y));
}
const kickoff = demoFor('sports');
kickoff.game.freeze = 1; kickoff.botKickoff = false;
for (const bot of kickoff.bots) Object.assign(bot, { x: 50, y: 50, vx: 500, vy: 500 });
app.stepSportsBots(kickoff, 0);
for (const bot of kickoff.bots) {
    assert.equal(bot.x, bot.home[0]); assert.equal(bot.y, bot.home[1]);
    assert.equal(bot.vx, 0); assert.equal(bot.vy, 0);
}
console.log('Forced bot respawns, parkour fall recovery and soccer kickoff resets passed.');

for (const mode of Object.keys(A.games)) {
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
        if (mode === 'market') assert.ok(demo.bots.every(bot => bot.deliveries > 0), 'every market bot must complete real deliveries over a full run');
        if (mode === 'miner') assert.ok(demo.bots.every(bot => bot.goal > 0), 'every mining bot must bank real crystals');
        if (mode === 'sports') assert.ok(demo.bots.some(bot => bot.goal > 0), 'soccer bots must score team goals');
        if (mode === 'frenzy' || mode === 'fishing' || mode === 'river' || mode === 'hack') {
            assert.ok(demo.bots.every(bot => bot.goal > 0), `${mode} every bot must complete the objective`);
        }
        if (mode === 'crypto') {
            assert.ok(demo.bots.every(bot => bot.ai.trades > 0), 'every trading bot must buy or sell assets');
            for (const bot of demo.bots) assert.equal(bot.score, Math.round(bot.ai.cash + bot.ai.units.reduce((sum, units, asset) => sum + units * demo.game.price(asset, demo.clock), 0)), 'trading scores use actual portfolios');
        }
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
        'admin-search-form', 'admin-notice-message', 'site-notice', 'site-notice-message', 'site-notice-status',
        'announcement-history', 'announcement-history-status', 'dismiss-notice', 'admin-deck-full-set'].map(id => [id, node()]));
    sandbox.document.querySelector = selector => selector === '[data-action="dismiss-site-notice"]' ? nodes.get('dismiss-notice') : null;
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
    let notice = { publication_id: '1', message: '</textarea><script>not executable</script>', active: true, updated_at: 'first' };
    const dismissals = new Set();
    const history = [{ ...notice, published_at: '2026-10-12T00:00:00Z' }];
    sandbox.window.StudBudCommunityGames = {
        searchDecks: async () => shared,
        importDeck: async id => { imports++; return { id, title: 'New shared set', owner_id: 'author', cards: [{ front: 'Term', back: 'Definition' }] }; },
        getUserProfile: async () => ({ username: 'Author', show_stats: false, decks: shared }),
        getSiteNotice: async () => ({ ...notice, dismissed: dismissals.has(`${sandbox.window.StudBudCloud.user.id}:${notice.publication_id}`) }),
        dismissSiteNotice: async id => { dismissals.add(`${sandbox.window.StudBudCloud.user.id}:${id}`); },
        getSiteNoticeHistory: async () => [...history].reverse(),
        adminCall: async (name, args) => {
            calls.push({ name, args });
            if (name === 'studbud_admin_set_site_notice') {
                notice = { ...notice, message: args.p_message, active: args.p_active, updated_at: 'updated' };
                if (args.p_active) {
                    notice.publication_id = String(history.length + 1);
                    history.push({ ...notice, published_at: '2026-10-12T01:00:00Z' });
                }
                return;
            }
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
    await app.dismissSiteNotice();
    assert.equal(nodes.get('site-notice-status').textContent, '');
    assert.equal(nodes.get('dismiss-notice').disabled, false);
    assert.ok(dismissals.has('qa-user:1'), 'dismissal is stored for the signed-in account');
    assert.equal(localValues.get(app.siteNoticeDismissalKey('qa-user', '1')), '1', 'successful dismissal is mirrored on the device');
    await app.loadSiteNotice(true);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), true);
    const reloadedApp = Object.create(sandbox.window.TestApp.prototype);
    await reloadedApp.loadSiteNotice(true);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), true, 'a fresh app instance retains server-backed dismissal');
    dismissals.delete('qa-user:1');
    await reloadedApp.loadSiteNotice(true);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), true, 'device dismissal prevents a stale server response from showing the banner after reload');
    dismissals.add('qa-user:1');
    localValues.delete(app.siteNoticeDismissalKey('qa-user', '1'));
    await reloadedApp.loadSiteNotice(true);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), true, 'server dismissal works on another device without a local mirror');
    notice = { ...notice, updated_at: 'newer' };
    await reloadedApp.loadSiteNotice(true);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), true, 'changing metadata must not reshow the same publication');
    sandbox.window.StudBudCloud.user.id = 'second-user';
    await reloadedApp.loadSiteNotice(true);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), false, 'another account has its own dismissal state');
    sandbox.window.StudBudCloud.user.id = 'qa-user';
    notice = { ...notice, publication_id: '2' };
    history.push({ ...notice, published_at: '2026-10-12T00:30:00Z' });
    await app.loadSiteNotice(true);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), false, 'a new publication is shown even if its text is unchanged');
    await app.loadAnnouncementHistory();
    assert.match(nodes.get('announcement-history').innerHTML, /&lt;\/textarea&gt;&lt;script&gt;/);
    assert.ok(!nodes.get('announcement-history').innerHTML.includes('<script>'), 'history escapes announcement content');
    const chronologicalApi = sandbox.window.StudBudCommunityGames.getSiteNoticeHistory;
    sandbox.window.StudBudCommunityGames.getSiteNoticeHistory = async () => [
        { publication_id: '10', published_at: '2026-10-10T01:00:00Z', message: 'Oldest', author_name: 'andy' },
        { publication_id: '2', published_at: '2026-10-12T01:00:00Z', message: 'Newest', author_name: 'overit', dismissed: false },
        { publication_id: '1', published_at: '2026-10-11T01:00:00Z', message: 'Middle', author_name: '<script>author</script>', dismissed: true },
        { publication_id: '3', published_at: '2026-10-10T02:00:00Z', message: 'Future admin publication', author_name: 'future_admin' }
    ];
    await app.loadAnnouncementHistory();
    const sortedHistory = nodes.get('announcement-history').innerHTML;
    assert.ok(sortedHistory.indexOf('Newest') < sortedHistory.indexOf('Middle'));
    assert.ok(sortedHistory.indexOf('Middle') < sortedHistory.indexOf('Oldest'), 'history sorts by publication date, not insertion ID or dismissal');
    assert.equal((sortedHistory.match(/Latest announcement/g) || []).length, 1);
    assert.match(sortedHistory, /By overit/);
    assert.match(sortedHistory, /By future_admin/, 'author names work for newly authorized admins without a hardcoded username list');
    assert.match(sortedHistory, /By &lt;script&gt;author&lt;\/script&gt;/);
    assert.match(sortedHistory, /datetime="2026-10-12T01:00:00Z"/);
    assert.match(app.formatAnnouncementTime('2026-10-12T01:00:00Z'), /\d{1,2}:\d{2}:\d{2}/, 'publication timestamp includes time down to seconds');
    sandbox.window.StudBudCommunityGames.getSiteNoticeHistory = chronologicalApi;
    const dismissApi = sandbox.window.StudBudCommunityGames.dismissSiteNotice;
    const logError = sandbox.console.error;
    const failures = [];
    sandbox.console.error = (...args) => failures.push(args);
    sandbox.window.StudBudCommunityGames.dismissSiteNotice = async () => { throw new Error('Network unavailable'); };
    await app.dismissSiteNotice();
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), false, 'failed dismissal must not pretend to be saved');
    assert.equal(localValues.has(app.siteNoticeDismissalKey('qa-user', '2')), false, 'failed server save must not create a success-shaped device record');
    assert.match(nodes.get('site-notice-status').textContent, /Network unavailable/);
    assert.equal(nodes.get('dismiss-notice').disabled, false, 'failed dismissal can be retried');
    assert.equal(failures.length, 1, 'dismissal failure is logged');
    sandbox.window.StudBudCommunityGames.dismissSiteNotice = dismissApi;
    const historyApi = sandbox.window.StudBudCommunityGames.getSiteNoticeHistory;
    sandbox.window.StudBudCommunityGames.getSiteNoticeHistory = async () => { throw new Error('History unavailable'); };
    await app.loadAnnouncementHistory();
    assert.match(nodes.get('announcement-history-status').textContent, /History unavailable/);
    assert.equal(nodes.get('announcement-history').innerHTML, '');
    sandbox.window.StudBudCommunityGames.getSiteNoticeHistory = async () => [];
    await app.loadAnnouncementHistory();
    assert.match(nodes.get('announcement-history-status').textContent, /No announcements/);
    sandbox.window.StudBudCommunityGames.getSiteNoticeHistory = historyApi;
    sandbox.console.error = logError;
    let finishDismissal;
    let pendingCalls = 0;
    sandbox.window.StudBudCommunityGames.dismissSiteNotice = () => {
        pendingCalls++;
        return new Promise(resolve => { finishDismissal = resolve; });
    };
    const pendingDismissal = app.dismissSiteNotice();
    await app.dismissSiteNotice();
    assert.equal(pendingCalls, 1, 'repeated dismiss clicks do not send duplicate requests');
    app.siteNotice = { ...app.siteNotice, publication_id: 'new-during-save' };
    finishDismissal();
    await pendingDismissal;
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), false, 'saving an old dismissal cannot hide a newer banner');
    sandbox.window.StudBudCommunityGames.dismissSiteNotice = dismissApi;
    nodes.get('admin-notice-message').value = '   ';
    const beforePublish = calls.length;
    await app.runAdminAction('publish-notice', {});
    assert.equal(calls.length, beforePublish);
    assert.match(nodes.get('admin-status').textContent, /Enter an announcement/);
    nodes.get('admin-notice-message').value = '  Test announcement  ';
    await app.runAdminAction('publish-notice', {});
    assert.equal(notice.message, 'Test announcement');
    assert.equal(notice.active, true);
    assert.equal(history.length, 3);
    assert.ok(nodes.get('announcement-history').innerHTML.includes('Test announcement'));
    await app.dismissSiteNotice();
    await app.runAdminAction('hide-notice', {});
    assert.equal(notice.active, false);
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), true);
    assert.equal(history.length, 3, 'unpublishing retains history without creating a new announcement');
    assert.ok(nodes.get('announcement-history').innerHTML.includes('Test announcement'), 'unpublished announcements stay in About');
    console.log('Admin moderation and announcement history, escaping, account-scoped persistent dismissal, reload and failure handling passed.');
}
checkCommunityAndAdminUi().catch(error => { console.error(error); process.exitCode = 1; });
