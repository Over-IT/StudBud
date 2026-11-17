const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const noop = () => {};
const math = Object.create(Math); math.random = () => .5;
const sandbox = { window: {}, document: { addEventListener: noop }, console, Math: math, Date, performance: { now: () => 5000 } };
vm.createContext(sandbox);
for (const file of ['multiplayerEngine.js', 'multiplayerGames.js', 'multiplayerGames2.js', 'multiplayerGames3.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
const A = sandbox.window.StudBudArcade;
function session(mode, practice = false) {
    const s = {
        mode, practice, seed: 42, reward: 30, user: { id: 'player' }, local: { id: 'player', color: '#fff' },
        room: { host_id: 'player', state: {} }, roster: new Map([['player', { id: 'player' }]]),
        startedAt: Date.now(), countdown: 0, t: 0, vw: 1280, vh: 720,
        canvas: { style: {} }, overlay: { classList: { contains: () => false } },
        mouse: { x: 640, y: 360, down: false, pressed: false, active: false },
        axis: () => ({ x: 0, y: 0 }), down: () => false, pressed: () => false,
        remoteList: () => [], sfx: noop, toast: noop, emit: noop, addScore: noop, setGoal: noop,
        ask: () => false, updateResourceNotice: noop,
        rewardAmount: A.Session.prototype.rewardAmount, refill: A.Session.prototype.refill,
        spend(amount) { const ok = this.game.res.spend(amount); if (!ok) this.failed = true; return ok; }
    };
    s.game = new A.games[mode](s);
    return s;
}
function prepare(mode, practice) {
    const s = session(mode, practice), g = s.game;
    // Measure a refill from empty, not the game's starting allowance.
    const start = g.res.value;
    g.res.value = 0;
    s.refill();
    assert.equal(start, g.res.value, `${mode} starts with one default answer`);
    if (mode === 'skyline') {
        const floor = { x: 0, y: -100, w: 20000, h: 100, bi: 0 };
        g.solids = [floor];
        for (const name of ['winds', 'drills', 'springs', 'spikes', 'saws', 'debris', 'balls', 'lasers', 'boxes']) g[name] = [];
        Object.assign(g.me, { x: 100, y: floor.y - g.me.h, vx: 0, vy: 0, onGround: true, ground: floor });
        s.axis = () => ({ x: 1, y: 0 });
    } else if (mode === 'duel') {
        g.orb.t = 1e9; g.specialCharge = 100;
    } else if (mode === 'miner') {
        g.tile = () => 1; g.collisionSolids = () => []; g.breakTile = noop;
        g.hitLava = g.flowLava = g.revealLava = noop;
    } else if (mode === 'river') {
        g.rocks = []; g.logs = []; g.pools = []; g.chests = []; g.fish = [];
        g.surgeAt = () => ({ active: false, warning: false, cycle: 0 });
        s.axis = () => ({ x: -1, y: 0 });
    } else if (mode === 'market') {
        g.cars = []; g.walls = []; g.vending = []; g.shops = [];
        s.axis = () => ({ x: 1, y: 0 });
    } else if (mode === 'shooter') {
        g.pickups = []; g.orbs = []; g.spawnT = 1e9; g.multiplayer = true; s.mouse.down = true;
    }
    return s;
}
function measure(mode, fps, practice) {
    const s = prepare(mode, practice), g = s.game, dt = 1 / fps;
    let lastCast = -1, previousState = 0;
    for (let frame = 0; frame < 25 * fps; frame++) {
        const t = frame / fps; s.t = t; s.mouse.pressed = false; s.failed = false;
        if (mode === 'duel') {
            s.down = key => key === 'KeyS' && t % 10 >= 8;
            const strike = frame % fps === 0 && t % 10 < 8;
            s.pressed = key => strike && key === (Math.floor(t) % 10 === 5 ? 'KeyR' : 'KeyE');
        } else if (mode === 'miner') {
            // Fixed mining face isolates work from map layout; 70% digging, 23% jetting.
            Object.assign(g.me, { x: 500, y: 500, vx: 0, vy: 0 });
            s.down = (...keys) => (t % 10 < 7 && keys.includes('KeyS')) || (t % 10 >= 7 && t % 10 < 9.3 && keys.includes('KeyW'));
        } else if (mode === 'river') {
            s.mouse.pressed = frame % (4 * fps) === 0;
        } else if (mode === 'market') {
            s.down = (...keys) => keys.includes('ShiftLeft') && t % 5 >= 4;
        } else if (mode === 'fishing' || mode === 'frenzy') {
            // Half-strength cast, immediate bite reaction, then track the fish with the reel.
            if (g.st !== previousState) { previousState = g.st; lastCast = t; }
            s.mouse.pressed = g.st === 0 || g.st === 3;
            s.mouse.down = g.st === 1 ? t - lastCast < .36 : g.st === 4 && g.fishY < g.zone.y + 37 + g.zone.v * .12;
        }
        if (mode === 'skyline') g.updatePlayer(dt); else g.update(dt);
        if (s.failed) return t;
        if (mode === 'skyline' || mode === 'market' || mode === 'duel') {
            if (g.res.value < (mode === 'skyline' ? .5 : .05)) return t + dt;
        }
    }
    throw new Error(`${mode} did not exhaust a default answer`);
}
for (const mode of ['skyline', 'duel', 'miner', 'river', 'market', 'shooter', 'frenzy', 'fishing']) {
    for (const fps of [30, 60, 120]) {
        const seconds = measure(mode, fps, false);
        console.log(`${mode} ${fps}fps: ${seconds.toFixed(2)}s`);
        assert.ok(seconds >= 8 && seconds <= 12, `${mode} ${fps}fps: ${seconds.toFixed(2)}s is outside the representative range`);
        assert.ok(Math.abs(measure(mode, fps, true) - seconds) < .05, `${mode}: solo and multiplayer use the same budget`);
    }
}
{
    const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp =')), sandbox);
    const app = vm.runInContext('Object.create(AppOrchestrator.prototype)', sandbox);
    for (const mode of ['skyline', 'duel', 'miner', 'river', 'market', 'shooter', 'frenzy', 'fishing']) {
        const s = session(mode);
        assert.equal(app.questionRewardRecommendation(mode).suggested, 30);
        assert.equal(app.questionRewardInfo(mode).multiplier, A.resourceRewardMultiplier(mode));
        s.reward = 17;
        s.game.res.value = 0;
        const first = s.refill();
        assert.equal(first, Math.round(17 * app.questionRewardInfo(mode).multiplier));
        s.refill();
        assert.equal(s.game.res.value, 2 * first, `${mode} answers accumulate without a cap`);
    }
    for (const mode of ['crypto', 'hack', 'defense', 'chess']) {
        const actor = { mode, reward: mode === 'chess' ? 1 : 30 };
        assert.equal(A.Session.prototype.rewardAmount.call(actor), actor.reward, `${mode} keeps its own reward rules`);
    }
    const rewardInput = {}, indicator = {};
    const s = session('shooter');
    Object.assign(s, { testing: true, limitedTestEnergy: true,
        overlay: { querySelector: selector => selector === '[data-test-reward]' ? rewardInput : indicator },
        updateMeter: noop, layoutHud: noop });
    A.Session.prototype.updateTestEnergy.call(s, { dataset: { testReward: '' }, value: '17' });
    assert.equal(s.rewardAmount(), 34);
    assert.equal(rewardInput.value, '17', 'test controls show the setting, not the converted payout');
    const invalid = { dataset: { testReward: '' }, value: '17.5' };
    A.Session.prototype.updateTestEnergy.call(s, invalid);
    assert.equal(invalid.value, '17');

    const realSession = A.Session;
    const launched = [];
    A.Session = class {
        constructor(options) {
            this.options = options; this.mode = options.room.mode; this.reward = options.questionReward;
            this.limitedTestEnergy = options.limitedTestEnergy;
            this.overlay = { isConnected: true }; this.game = {};
            this.roster = new Map(); this.remotes = new Map();
            launched.push(this);
        }
        rewardAmount() { return realSession.prototype.rewardAmount.call(this); }
        emit() {}
        destroy() {}
    };
    sandbox.AppState = { get: () => [] };
    sandbox.document.getElementById = () => null;
    sandbox.document.body = { classList: { add: noop, remove: noop } };
    Object.assign(app, { canTestGames: true, profileCosmetics: () => ({}), roomStudyDeck: () => null,
        initPreviewBots: () => [], pingPresence: noop });
    try {
        for (const mode of ['shooter', 'miner', 'fishing']) {
            app.startPractice(mode, { testing: true, limitedTestEnergy: true, questionReward: 30, botCount: 0 });
            let current = launched.at(-1);
            current.reward = 17;
            const payout = current.rewardAmount();
            for (let restart = 0; restart < 3; restart++) {
                current.options.onRestart();
                current = launched.at(-1);
                assert.equal(current.options.questionReward, 17, `${mode} restart retains the raw setting`);
                assert.equal(current.rewardAmount(), payout, `${mode} restart does not compound conversion`);
                assert.equal(current.limitedTestEnergy, true);
            }
            app.closePractice();
        }
    } finally { A.Session = realSession; }
}
