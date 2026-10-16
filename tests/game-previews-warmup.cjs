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
    Path2D: class { constructor(d) { assert.equal(typeof d, "string"); this.d = d; } },
    document: { addEventListener() {}, getElementById() { return { textContent: '' }; } },
    window: { devicePixelRatio: 1, addEventListener() {} },
    navigator: { maxTouchPoints: 0 },
    localStorage: {
        getItem: key => localValues.get(key) ?? null,
        setItem: (key, value) => localValues.set(key, String(value))
    }
};
vm.createContext(sandbox);
for (const file of ['flashcardEngine.js', 'communityGames.js', 'multiplayerEngine.js', 'multiplayerGames.js', 'multiplayerGames2.js', 'multiplayerGames3.js', 'chessGame.js', 'plannerEngine.js']) {
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

{
    const c = canvas(200, 112);
    app.drawLivePreview(c, 'skyline', 1000);
    const demo = app.livePreviews.get(c), game = demo.game;
    const count = game.solids.length, scenes = new Set();
    for (let frame = 1; frame <= 650; frame++) {
        assert.equal(app.drawLivePreview(c, 'skyline', 1000 + frame * 100), true);
        scenes.add(demo.sky.start);
        assert.equal(game.solids.length, count, 'looping previews retain scenery for revisited biomes');
        if (demo.clock - demo.sky.sceneStarted < .11) {
            const visible = game.drawList.filter(p => p.x < game.cam.x + 900 && p.x + p.w > game.cam.x
                && p.y < game.cam.y + demo.session.vh && p.y + p.h > game.cam.y);
            assert.ok(visible.length, 'each preview scene starts with visible level geometry');
        }
    }
    assert.equal(scenes.size, game.checkpoints.length, 'the preview rotates through every checkpoint instead of stalling');
    assert.equal(demo.sky.start, 1, 'preview scenes loop back through the city after space');
    assert.equal(game.retiredArea || 0, 0);
}
console.log('Looping City Escape previews preserve visible scenery and rotate through every biome.');

{
    let frame;
    const oldRaf = sandbox.requestAnimationFrame, oldBody = sandbox.document.body;
    sandbox.requestAnimationFrame = callback => { frame = callback; return 1; };
    sandbox.document.body = { classList: { contains: name => name === 'mpg-active' } };
    sandbox.document.visibilityState = 'visible';
    sandbox.Router = { activeRoute: 'multiplayer' };
    const backgroundApp = Object.create(sandbox.window.TestApp.prototype);
    backgroundApp.livePreviews = new Map([[{}, {}]]);
    backgroundApp.startMultiplayerAnimation();
    frame(performance.now() + 16);
    assert.equal(backgroundApp.livePreviews.size, 0, 'covered lobby previews release their simulation while an actual game is open');
    sandbox.requestAnimationFrame = oldRaf;
    sandbox.document.body = oldBody;
    delete sandbox.Router;
}

const demoFor = mode => {
    const c = canvas(900, 500);
    assert.equal(app.drawLivePreview(c, mode, 1000), true);
    return app.livePreviews.get(c);
};
{
    const demo = demoFor('skyline');
    demo.session.testing = true;
    for (const index of [1, 2, 0]) {
        assert.equal(demo.game.testTeleport(index), true);
        for (const [i, bot] of demo.bots.entries()) {
            app.stepSkylineBot(demo, bot, i, 1 / 60);
            assert.equal(bot.st.checkpoint, index, 'staff teleports relocate simulated players to the selected biome');
            assert.equal(bot.st.teleportVersion, demo.game.testTeleportVersion);
            assert.ok(!bot.ground || demo.game.solids.includes(bot.ground), 'bot actors never keep geometry from before the level rebuild');
        }
    }
}
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
            assert.ok(physicalZoom >= .65 - 1e-9 && physicalZoom <= (mode === 'miner' ? 2 : 1.6) + 1e-9, `${mode} has readable, bounded world zoom at ${width}x${height}: ${physicalZoom}`);
        }
        if (game.mouseWorld && typeof game.mouseWorld === 'function') {
            session.mouse.x = session.vw / 2; session.mouse.y = session.vh / 2;
            const target = game.mouseWorld();
            assert.ok(Number.isFinite(target.x) && Number.isFinite(target.y), `${mode} camera-to-input mapping stays finite`);
        }
    }
}
for (const [width, height] of [[320, 568], [844, 390], [1366, 768], [2560, 1440]]) {
    const { session, game } = demoFor('shooter');
    session.preview = false;
    session.scale = A.util.clamp(height / 720, .65, 1.25);
    session.vw = width / session.scale; session.vh = height / session.scale;
    game.weapon = 'rail';
    const sniper = game.cameraZoom();
    game.weapon = 'blaster';
    const normal = game.cameraZoom();
    game.weapon = 'shotgun';
    assert.ok(sniper < normal && normal < game.cameraZoom(), `sniper sees farther and shotgun is closer at ${width}x${height}`);
}
console.log('Grounded joystick auto-jump, deliberate air jumps, and readable weapon-specific scene zoom across all modes passed.');
for (const [code, expected] of [['KeyS', 'guard'], ['KeyE', 'swing'], ['KeyR', 'heavy'], ['ShiftLeft', 'dodge'], ['KeyF', 'dodge']]) {
    const { session, game, hold, tap } = demoFor('duel');
    hold.clear(); tap.clear();
    session.mouse.pressed = false;
    game.swingCd = game.swingT = game.dodge = game.dodgeCd = game.stun = game.hitlag = game.respawn = 0;
    game.orb.t = 100;
    game.specialCharge = 100;
    hold.add(code); tap.add(code);
    game.update(1 / 60);
    if (expected === 'guard') assert.equal(game.guard, true, 'S guards');
    if (expected === 'swing') assert.ok(game.swingT > 0 && !game.swingHeavy, 'E swings');
    if (expected === 'heavy') assert.ok(game.swingT > 0 && game.swingHeavy && !game.guard, 'R performs a heavy swing, not guard');
    if (expected === 'dodge') assert.ok(game.dodge > 0, 'Shift or F dodges');
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
        hold.add('Space');
        for (let i = 0; i < 48; i++) {
            game.ball.x = game.me.x + 45;
            game.ball.y = game.me.y;
            game.update(1 / 60);
        }
        assert.ok(game.kickCharge >= .99, 'holding Space charges the power kick');
        hold.delete('Space');
        game.ball.x = game.me.x + 45;
        game.ball.y = game.me.y;
    }
    game.update(1 / 60);
    assert.ok(game.kickCd > 0, `${action} kicks the ball`);
    assert.ok(game.res.value < before, `${action} spends energy`);
    assert.ok(Math.hypot(game.ball.vx, game.ball.vy) > (action === 'power' ? 900 : 400), `${action} applies the expected impulse`);
}
console.log('Nearby King of the Hill actions and Soccer pass/charged power-kick input passed.');
{
    const { session, game, tap, hold } = demoFor('duel');
    hold.clear(); tap.clear(); session.mouse.pressed = false;
    game.orb.t = 100; game.stun = game.hitlag = game.respawn = game.swingCd = 0;
    const swings = [];
    session.emit = event => { if (event.k === 'sw') swings.push(event); };
    let spent = 0;
    session.spend = amount => { spent += amount; return true; };
    game.specialCharge = 0;
    tap.add('KeyR'); game.update(0);
    assert.equal(swings.length, 0, 'uncharged specials are blocked');
    assert.equal(spent, 0, 'uncharged specials consume no energy');
    game.specialCharge = 100;
    tap.add('KeyR'); game.update(0);
    assert.equal(swings[0].p, 3, 'charged specials have three times normal power');
    assert.equal(game.heavyCd, 12, 'specials start a separate twelve-second cooldown');
    assert.equal(game.specialCharge, 0, 'special consumes its charge');
    game.swingCd = 0; game.update(0);
    assert.equal(swings.length, 1, 'a second heavy is blocked during cooldown');
    assert.equal(spent, A.ENERGY_COSTS.duel.special, 'blocked specials consume no energy');
    tap.clear(); tap.add('KeyE'); game.update(0);
    assert.equal(swings.length, 2, 'light attacks still work during heavy cooldown');
    assert.equal(swings[1].p, 1);
    game.hitlag = 20; game.update(11.99);
    assert.ok(game.heavyCd > 0);
    game.update(.01); game.hitlag = game.swingCd = 0;
    game.specialCharge = 100;
    tap.clear(); tap.add('KeyR'); game.update(0);
    assert.equal(swings.length, 3, 'charged special becomes usable at exactly twelve seconds');
    const light = game.hitImpact({ p: 1 }, 0), heavy = game.hitImpact({ p: 2 }, 0);
    assert.equal(light.damage, 9);
    assert.equal(heavy.damage, 18);
    assert.ok(heavy.force > light.force * 2, 'heavies increase damage and launch strength');
    assert.ok(heavy.stun > light.stun, 'heavy hits cause longer hitstun');
    assert.ok(game.hitImpact({ p: 2 }, 0, true).damage < light.damage, 'guard still reduces heavy damage');

    const ev = { x: 0, y: 0, a: 0, h: 0 };
    const fighter = (x, y) => ({ x, y, w: 34, h: 56 });
    assert.equal(game.attackHits(ev, fighter(105, -28)), true, 'grazing the front of the fighter counts even when its center is beyond reach');
    assert.equal(game.attackHits(ev, fighter(60, 75)), true, 'the swing can hit a corner rather than only the center');
    assert.equal(game.attackHits(ev, fighter(-17, -28)), true, 'point-blank overlapping attacks are not lost in a dead zone');
    assert.equal(game.attackHits(ev, fighter(-60, -28)), false, 'attacks do not hit wholly behind the attacker');
    assert.equal(game.attackHits(ev, fighter(111, -28)), false, 'light attacks do not hit beyond their visible reach');
    assert.equal(game.attackHits({ ...ev, h: 1 }, fighter(125, -28)), true, 'heavy attacks have their visible longer reach');
    assert.equal(game.attackHits({ ...ev, h: 1 }, fighter(181, -28)), false, 'specials do not hit beyond their visible reach');
    assert.equal(game.attackHits({ ...ev, a: Math.PI }, fighter(-139, -28)), true, 'left-facing sweeps use the same geometry');
    assert.equal(game.attackHits({ ...ev, a: Math.PI / 2 }, fighter(-17, 105)), true, 'vertical aiming uses fighter bounds too');
    const bot = { ...fighter(75, -28), id: 'victim', dmg: 0, stun: 0, respawn: 0, invuln: 0 };
    app.duelSwing({ game, bots: [bot], meId: 'attacker' }, { ...ev, h: 1, p: 2, by: 'attacker' });
    assert.equal(bot.dmg, heavy.damage, 'solo bots take the same heavy damage as multiplayer players');
    assert.equal(bot.vx, heavy.force, 'solo bots use the same heavy launch force');
}
for (const fps of [30, 60, 120]) {
    const { session, game } = demoFor('duel');
    const zone = game.zones[0];
    game.hill = () => ({ zone, left: 20 });
    game.me.x = zone.x + zone.w / 2 - 17; game.me.y = zone.y - 56;
    game.respawn = 0; session.question = null;
    let rivals = [], goal = 0, score = 0;
    session.remoteList = () => rivals;
    session.setGoal = value => { goal = value; };
    session.addScore = value => { score += value; };
    for (let i = 0; i < fps / 2; i++) game.updateHill(1 / fps);
    rivals = [{ x: game.me.x, y: game.me.y, a: 0 }];
    for (let i = 0; i < fps; i++) game.updateHill(1 / fps);
    assert.equal(goal, 0, 'contested time earns nothing');
    assert.equal(game.hillState, 'contested');
    rivals = [];
    game.me.x = zone.x - 100;
    game.updateHill(.5);
    assert.equal(game.hillState, 'away');
    game.me.x = zone.x + zone.w / 2 - 17;
    for (let i = 0; i < fps / 2; i++) game.updateHill(1 / fps);
    assert.equal(goal, 1, `${fps} FPS: separate half-second holds combine instead of being discarded`);
    assert.equal(score, 12);
    game.me.y = zone.y - 100;
    game.updateHill(1);
    assert.equal(goal, 2, 'jumping within the visible hill zone still earns time');
    rivals = [{ x: game.me.x, y: game.me.y, a: 5 }];
    game.updateHill(1);
    assert.equal(goal, 3, 'knocked-out opponents do not contest the hill');
    session.question = {};
    game.updateHill(1);
    assert.equal(goal, 3, 'answering a question does not earn hill time');
    session.question = null;
    game.respawn = 1;
    game.updateHill(1);
    assert.equal(goal, 3, 'knocked-out players cannot earn time');
    game.respawn = 0; rivals = [];
    game.hitlag = .2;
    game.update(.1);
    assert.ok(Math.abs(game.hillTick - .1) < 1e-9, 'hitlag does not drop uncontested time');
    game.updateHill(2.4);
    assert.equal(goal, 5, 'all full seconds are awarded even in a longer update');
    assert.ok(Math.abs(game.hillTick - .5) < 1e-9);
    assert.equal(game.inHill({ x: zone.x - 17, y: zone.y - 56 }, zone), true, 'standing on the boundary counts');
    assert.equal(game.inHill({ x: zone.x, y: zone.y - 207 }, zone), false, 'above the visible zone does not count');
    assert.equal(game.inHill({ x: zone.x, y: zone.y + 20 }, zone), false, 'below the platform does not count');
}
{
    const { session, game, hold, tap } = demoFor('sports');
    hold.clear(); tap.clear(); session.mouse.pressed = false;
    session.spend = () => true;
    session.remoteList = () => [];
    game.freeze = game.stun = game.kickCd = 0;
    game.pads.forEach(pad => { pad.used = true; });
    const nearBall = () => { game.ball.x = game.me.x + 45; game.ball.y = game.me.y; game.ball.vx = game.ball.vy = 0; };
    hold.add('Space'); nearBall(); game.update(.8);
    hold.delete('Space'); nearBall(); game.update(0);
    assert.equal(game.heavyCd, 3, 'soccer power kicks start a three-second cooldown');
    game.kickCd = 0;
    hold.add('Space'); nearBall(); game.update(0);
    assert.equal(game.kickCharge, 0, 'power kick cannot charge during cooldown');
    hold.delete('Space'); nearBall(); game.update(0);
    assert.equal(game.kickCd, 0, 'releasing the blocked heavy cannot shoot');
    tap.add('KeyE'); nearBall(); game.update(0);
    assert.ok(game.kickCd > 0, 'passing remains available during heavy cooldown');
    assert.equal(game.heavyCd, 3, 'passes do not restart heavy cooldown');
    tap.clear(); nearBall(); game.update(2.99);
    assert.ok(game.heavyCd > 0);
    nearBall(); game.update(.01);
    assert.equal(game.heavyCd, 0);
    game.freeze = game.stun = game.kickCd = 0;
    hold.add('Space'); nearBall(); game.update(.8);
    assert.ok(game.kickCharge >= .99, 'power kicks charge again after cooldown');
    hold.delete('Space'); nearBall(); game.update(0);
    assert.equal(game.heavyCd, 3);
}
console.log('Charged twelve-second specials, triple-power hill swings, fighter-bound hitboxes and cumulative sole-control hill time passed.');
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
const lava = demoFor('miner').game, C = lava.cols;
lava.T.fill(1); lava.F.fill(0); lava.D.fill(0); lava.flowing.clear();
for (let x = 2; x <= 40; x++) {
    lava.T[10 * C + x] = 0;
    for (let y = 12; y <= 20; y++) lava.T[y * C + x] = 0;
}
lava.T[11 * C + 14] = 0;
lava.T[10 * C + 10] = 6; lava.flowing.add(10 * C + 10);
lava.flowClock = lava.flowSideClock = 0;
lava.flowLava(0.3);
assert.equal(lava.tile(11, 10), 0, 'sideways lava waits for its slower interval');
for (let i = 0; i < 300; i++) lava.flowLava(0.1);
assert.equal(lava.tile(6, 10), 6, 'source spreads four blocks sideways');
assert.equal(lava.tile(5, 10), 0, 'source cannot spread beyond four blocks');
assert.equal(lava.F[10 * C + 6], 4);
assert.equal(lava.tile(14, 20), 6, 'lava falls all the way to the lower floor');
assert.equal(lava.F[20 * C + 14], 0, 'falling resets lateral reach');
assert.equal(lava.D[15 * C + 14], 1, 'falling columns remain full-height');
assert.equal(lava.tile(18, 20), 6, 'landed waterfall has a fresh sideways allowance');
assert.equal(lava.tile(19, 20), 0);
assert.equal(lava.D[10 * C + 10], 0, 'source stays a source rather than a falling block');
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
assert.equal(A.util.playerCosmetics({ cos: { skin: 'skin_gold', acc: 'acc_sparkles' } }).effect, 'acc_sparkles');
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
    'acc_dew_effect', 'acc_leaf_effect', 'acc_snowflake_effect', 'acc_electric_effect', 'acc_solar_effect', 'acc_vortex_effect',
    'acc_storm_effect', 'acc_blackhole_effect', 'acc_firefly_effect', 'acc_jellyfish_effect'
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
assert.equal(catalog.filter(item => item.type === 'effect' && !item.season).length, 36);
assert.equal(catalog.filter(item => item.season).length, 84, 'twelve seasonal sets of seven cosmetics');
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
assert.match(source, /\[\['all', 'All'\],[^\n]*\['effect', 'Auras'\]/, 'inventory category displays Auras');
assert.doesNotMatch(source, /\['effect', 'Effects'\]|effect: 'Effects'/);
for (const box of sandbox.window.StudBudCommunityGames.constructor.boxes) {
    const weights = sql.match(new RegExp(`when '${box.id}' then '(\\{[^']+\\})'::jsonb`));
    assert.ok(weights, `${box.name} has explicit server odds`);
    assert.deepEqual(JSON.parse(weights[1]), JSON.parse(JSON.stringify(box.chances)), `${box.name} client/server odds agree`);
}

const particleTrace = (id, top, time, face = 1) => {
    const commands = [], stack = [];
    const state = { globalAlpha: .7 };
    const ctx = new Proxy(state, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'save') return () => stack.push({ ...state });
            if (key === 'restore') return () => { Object.assign(state, stack.pop()); };
            if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => {
                commands.push([key, ...args]);
                return { addColorStop: (...stops) => commands.push(['addColorStop', ...stops]) };
            };
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
{
    const demo = demoFor('shooter'), attacker = demo.bots[0], victim = demo.bots[1];
    Object.assign(victim, { x: 1800, y: 850, hp: 25, invuln: 0, respawn: 0 });
    const bullet = { x: victim.x, y: victim.y, by: attacker.id, own: false, dmg: 10, life: 1 };
    demo.game.hitBot(bullet);
    app.tickPracticeBots(demo, 0);
    assert.equal(attacker.score, 4);
    assert.equal(attacker.goal, 0, 'hitting a bot does not count as an elimination');
    demo.game.hitBot({ ...bullet, dmg: 30, life: 1 });
    app.tickPracticeBots(demo, 0);
    assert.equal(attacker.playerKills, 1);
    assert.equal(attacker.goal, 3, 'bot-vs-bot elimination matches the player objective weighting');
    demo.game.hitBot({ ...bullet, dmg: 30, life: 1 });
    assert.equal(attacker.playerKills, 1, 'respawning victims cannot be credited twice');
    demo.onEmit({ k: 'ko', by: attacker.id });
    app.tickPracticeBots(demo, 0);
    assert.equal(attacker.goal, 6, 'local-player eliminations use the same leaderboard metric');
    assert.equal(attacker.goal, attacker.playerKills * 3);
    console.log('Shooter bot leaderboard counts actual eliminations rather than raw hit/KO points.');
}

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
    preview: false, countdown: 0, answered: 0, correct: 0, questionHistory: [], questionStats: new Map(),
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
        bot.st.actor = app.skyBotActor(demo, bot);
        bot.st.actor.hurt(true);
        bot.st.actor.dead = .01;
        app.stepSkylineBot(demo, bot, 0, .02);
        assert.equal(bot.y, demo.game.checkpoints[1].y - bot.h - 2, 'parkour bot returns to its latest checkpoint');
        bot.y = demo.game.checkpoints[1].y + 1500;
        app.stepSkylineBot(demo, bot, 0, .02);
        assert.ok(bot.respawn > 0, 'a fallen bot dies instead of flying back onto the route');
        assert.equal(bot.st.assist, undefined);
        app.stepSkylineBot(demo, bot, 0, 1.1);
    }
    assert.ok(bot.respawn <= 0 && (mode === 'skyline' || bot.invuln > 0), `${mode} bot respawns`);
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
{
    const demo = demoFor('duel'), bot = demo.bots[0];
    const oldRaf = sandbox.requestAnimationFrame;
    sandbox.requestAnimationFrame = () => 1;
    for (const fps of [30, 60, 120]) for (let cycle = 0; cycle < 3; cycle++) {
        bot.y = bot.ty = demo.game.H + 100;
        bot.x = bot.tx = -500;
        bot.respawn = .001;
        const now = performance.now();
        const live = {
            lastFrame: now - 1000 / fps, mode: 'duel', countdown: 0, countdownHidden: true,
            practice: true, t: 0, game: demo.game, ctx: context, remotes: new Map([[bot.id, bot]]),
            justPressed: new Set(), mouse: {}, checkEnd: noop, updateMeter: noop,
            dpr: 1, scale: 1, vw: 900, vh: 500,
            onTick: dt => app.stepDuelBots(demo, dt)
        };
        A.Session.prototype.frame.call(live, now);
        assert.equal(bot.tx, bot.x, 'respawn resets the horizontal interpolation target');
        assert.equal(bot.ty, bot.y, 'the actual remote-interpolation frame preserves the new spawn');
        assert.ok(bot.onGround && bot.ground && bot.y + bot.h <= demo.game.stage.y, `${fps} FPS repeated respawn stays on map support`);
    }
    sandbox.requestAnimationFrame = oldRaf;
}
for (const fps of [30, 60, 120]) {
    const demo = demoFor('duel'), bot = demo.bots[0];
    Object.assign(bot, { x: demo.game.stage.x + 100, y: demo.game.stage.y + 300, invuln: 0 });
    app.stepDuelBots(demo, 1 / fps);
    assert.ok(bot.respawn > 0, `${fps} FPS bot under the stage is recovered, not trapped there`);
    app.stepDuelBots(demo, 2);
    assert.ok(bot.y + bot.h <= demo.game.stage.y && bot.x >= demo.game.stage.x);
    assert.ok(bot.onGround && bot.ground && bot.x >= bot.ground.x && bot.x + bot.w <= bot.ground.x + bot.ground.w, 'respawn places the full bot body directly on a map platform');
}
const rememberedLava = demoFor('miner').game;
rememberedLava.me.x = 20 * 48; rememberedLava.me.y = 20 * 48;
const lavaIndex = 20 * rememberedLava.cols + 21;
rememberedLava.T[lavaIndex] = 6;
rememberedLava.revealLava(1 / 60);
assert.ok(rememberedLava.lavaVisibility[lavaIndex] > 0 && rememberedLava.lavaVisibility[lavaIndex] < .1, 'lava fades in rather than appearing instantly');
for (let i = 0; i < 120; i++) rememberedLava.revealLava(1 / 60);
assert.equal(rememberedLava.lavaVisibility[lavaIndex], 1);
rememberedLava.me.x = 100; rememberedLava.me.y = 100;
rememberedLava.revealLava(5);
assert.equal(rememberedLava.lavaVisibility[lavaIndex], 1, 'revealed lava remains known after leaving');
for (const [fps, seed] of [[30, 12345], [60, 67890], [120, 45678], [30, 1], [60, 42], [120, 0xffffffff]]) {
    const paced = demoFor('skyline');
    paced.session.seed = seed;
    paced.session.preview = false;
    paced.session.testing = false;
    paced.game = new paced.game.constructor(paced.session);
    paced.bots = app.initPreviewBots(paced, 'skyline', paced.game);
    const finishTimes = new Map();
    for (let i = 0; i < fps * 3600 && !paced.bots.every(bot => bot.done); i++) {
        paced.clock += 1 / fps;
        paced.session.t = paced.clock;
        paced.session.testPauseAt = paced.session.startedAt + paced.clock * 1000;
        paced.game.update(1 / fps);
        paced.bots.forEach((bot, index) => {
            const previousNode = bot.st.i;
            const landed = bot.onGround;
            app.stepSkylineBot(paced, bot, index, 1 / fps);
            assert.ok(bot.st.i >= previousNode || landed || bot.st.i === app.skyRoute(paced.game).cpNode[bot.st.checkpoint || 0], 'lost progress requires a physical lower landing or a checkpoint respawn');
            if (bot.done && !finishTimes.has(bot.id)) finishTimes.set(bot.id, paced.clock);
        });
    }
    assert.ok(paced.bots.every(bot => bot.done), `${fps} FPS seed ${seed}: all parkour bots reach the summit: ${paced.bots.map(bot => bot.st.i)}`);
    assert.ok(paced.bots.every(bot => bot.st.assist === undefined), 'normal bots never use forward position assists');
    assert.ok(paced.bots.every(bot => bot.st.actor.res.value >= 0 && bot.st.actor.res.value <= 100), 'normal bots spend and refill bounded energy');
    assert.ok(new Set(finishTimes.values()).size > 1, 'different bot paces produce different finish times');
    console.log(`${fps} FPS seed ${seed}: all three normal-energy bots completed the course.`);
}
for (const fps of [30, 60, 120]) {
    const { game } = demoFor('skyline');
    game.solids = []; game.spikes = []; game.saws = []; game.lasers = []; game.balls = [];
    game.springs = [{ x: 100, y: -100, w: 40, h: 16 }];
    Object.assign(game.me, { x: 100 - game.me.w - 2, y: -100 - game.me.h - 10, vx: 0, vy: 1100, onGround: false, ground: null });
    game.update(1 / fps);
    if (game.me.vy >= 0) game.update(1 / fps);
    assert.equal(game.me.vy, -1280, 'fast downward near-edge foot contact launches reliably');
    game.update(1 / fps);
    assert.ok(game.me.vy > -1280 && game.me.vy < 0, 'upward departure does not trigger the spring again');
}
console.log('Safe below-stage recovery, gradual permanent lava discovery and normal-energy parkour completion with physical checkpoint retries passed.');

const wall = [{ x: 100, y: 50, w: 50, h: 100 }];
assert.equal(app.botLineClear(50, 100, 200, 100, wall), false, 'bots cannot shoot through cover');
assert.equal(app.botLineClear(50, 25, 200, 25, wall), true);
const navigating = { x: 50, y: 100, r: 15, ai: {} };
for (let frame = 0; frame < 300; frame++) {
    app.moveNavigatingBot(navigating, 200, 100, 100, 1 / 30, wall);
    assert.ok(!A.util.overlap({ x: navigating.x - 15, y: navigating.y - 15, w: 30, h: 30 }, wall[0]), 'detour cannot cut through cover');
}
assert.ok(Math.hypot(navigating.x - 200, navigating.y - 100) < 10, `bots make progress around a blocked direct route: ${JSON.stringify(navigating)}`);
const spawn = demoFor('shooter');
const originalRandom = A.util.rand;
A.util.rand = () => 0;
app.placeShooterBot({ W: 500, H: 500, walls: [{ x: 0, y: 0, w: 230, h: 230 }] }, spawn.bots[0], 0);
assert.ok(!A.util.overlap({ x: spawn.bots[0].x - 22, y: spawn.bots[0].y - 22, w: 44, h: 44 }, { x: 0, y: 0, w: 230, h: 230 }), 'fallback spawn is also collision-safe');
A.util.rand = originalRandom;

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
        if (mode === 'market') assert.ok(demo.bots.every(bot => bot.deliveries > 0), `every market bot must complete real deliveries over a full run: ${JSON.stringify(demo.bots.filter(bot => !bot.deliveries))}`);
        if (mode === 'defense') {
            assert.ok(demo.game.wallets.every(Number.isFinite), 'shared defense wallets remain finite in previews and practice');
            assert.ok(demo.bots.every(bot => demo.game.answers[bot.id] > 0), 'every defense bot earns cash through simulated correct answers');
            assert.ok(demo.game.troops.length > 0 && demo.game.nextId > 10, 'defense bots build troops and send real enemies');
        }
        if (mode === 'miner') assert.ok(demo.bots.every(bot => bot.goal > 0), 'every mining bot must bank real crystals');
        if (mode === 'sports') assert.ok(demo.bots.some(bot => bot.goal > 0), 'soccer bots must score team goals');
        if (mode === 'frenzy' || mode === 'fishing' || mode === 'river' || mode === 'hack') {
            assert.ok(demo.bots.every(bot => bot.goal > 0), `${mode} every bot must complete the objective`);
        }
        if (mode === 'crypto') {
            assert.ok(demo.bots.every(bot => bot.ai.trades > 0), 'every trading bot must buy or sell assets');
            assert.ok(demo.bots.every(bot => bot.ai.researchAnswers > 0), 'trading bots replenish funds by researching');
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
            if (name === 'studbud_admin_delete_site_notice') {
                const index = history.findIndex(item => item.publication_id === args.p_publication_id);
                if (index < 0) throw new Error('That announcement no longer exists.');
                history.splice(index, 1);
                if (notice.publication_id === args.p_publication_id) notice = { ...notice, message: '', active: false, publication_id: null };
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
    assert.equal((nodes.get('community-deck-results').innerHTML.match(/In your decks/g) || []).length, 2);
    assert.equal((nodes.get('community-deck-results').innerHTML.match(/data-action="import-community-deck"/g) || []).length, 1);
    await app.openUserProfile('author');
    assert.equal((profile.innerHTML.match(/In your decks/g) || []).length, 2);
    assert.equal((profile.innerHTML.match(/data-action="import-community-deck"/g) || []).length, 1);
    for (const [username, tag] of [['overit', 'Owner'], ['andy', 'Co-owner'], ['student', '']]) {
        sandbox.window.StudBudCommunityGames.getUserProfile = async () => ({ username, show_stats: false, decks: shared });
        await app.openUserProfile('author');
        if (tag) assert.ok(profile.innerHTML.includes(`>${tag}</span>`), `${username} public profile shows its account tag`);
        else assert.ok(!profile.innerHTML.includes('account-tag'), 'ordinary profiles do not gain an account tag');
    }
    const friendProfile = node();
    friendProfile.scrollIntoView = () => {};
    nodes.set('friend-profile', friendProfile);
    for (const displayName of ['Ada <Lovelace>', null, '']) {
        const payload = { username: 'student', display_name: displayName, is_me: true, show_stats: false, decks: shared };
        sandbox.window.StudBudCommunityGames.getUserProfile = async () => payload;
        sandbox.window.StudBudCommunityGames.friendCall = async () => payload;
        await app.openUserProfile('author');
        await app.showFriendProfile('author');
        for (const markup of [profile.innerHTML, friendProfile.innerHTML]) {
            assert.match(markup, /<h3>student /, 'public and bud profiles always lead with the username');
            if (displayName) {
                assert.match(markup, /<\/h3><small class="profile-real-name">Ada &lt;Lovelace&gt;<\/small>/,
                    'the disclosed real name is escaped and displayed below the username');
            } else {
                assert.ok(!markup.includes('profile-real-name'), 'private or empty real names have no subtitle');
            }
        }
        assert.match(profile.innerHTML, /class="you-badge">you<\/em>/, 'own profiles retain their badge');
    }
    await app.importCommunityDeck('saved-set');
    await app.importCommunityDeck('owned-set');
    assert.equal(imports, 0, 'already-added and original published sets must not call the import RPC');
    await app.importCommunityDeck('new-set');
    assert.equal(imports, 1);
    assert.equal(saves, 1);
    actions.forEach(action => assert.match(action.outerHTML, /In your decks/));
    await app.importCommunityDeck('new-set');
    assert.equal(imports, 1);
    assert.equal(saves, 1);
    state.flashcards = state.flashcards.filter(deck => deck.communitySourceId !== 'new-set');
    app.refreshCommunityDeckActions();
    actions.forEach(action => assert.match(action.outerHTML, /Add to my decks/));
    console.log('Community search/profile added labels, duplicate prevention, and deletion refresh passed.');

    app.canAccessStaff = true;
    app.canModerateFlashcards = true;
    app.canTestGames = true;
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
    const latestId = notice.publication_id;
    assert.match(nodes.get('admin-list').innerHTML, /Delete announcement/);
    sandbox.confirm = () => true;
    await app.runAdminAction('delete-notice', { id: latestId });
    assert.equal(history.length, 2, 'deleting removes the selected history entry');
    assert.ok(!nodes.get('announcement-history').innerHTML.includes('Test announcement'));
    assert.equal(nodes.get('site-notice').classList.contains('hidden'), true);
    console.log('Admin moderation and announcement history, escaping, account-scoped persistent dismissal, reload and failure handling passed.');
}
checkCommunityAndAdminUi().catch(error => { console.error(error); process.exitCode = 1; });
