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
const sandbox = { window: {}, document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, createElement: () => ({ getContext: () => context }) }, console, Math, Date, performance: { now: () => 5000 } };
vm.createContext(sandbox);
for (const file of ['flashcardEngine.js', 'multiplayerEngine.js', 'multiplayerGames2.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}
const A = sandbox.window.StudBudArcade, tools = sandbox.window.FlashcardTools;

// Duel questions: identical choices and order for both players.
const cards = Array.from({ length: 8 }, (_, i) => ({ front: `Q${i}`, back: `Answer ${String.fromCharCode(65 + i)}` }));
const first = tools.distractors(cards[2], cards, 3).map(card => card.back);
for (let i = 0; i < 20; i++) assert.deepEqual(tools.distractors(cards[2], cards, 3).map(card => card.back), first, 'unvaried distractors are stable');
const asker = () => ({ cards, questionStats: new Map(), preview: false, showQuestion: () => true, toast: noop });
const options = [];
for (let player = 0; player < 6; player++) {
    const s = asker();
    assert.equal(A.Session.prototype.ask.call(s, noop, 'duel', true, { cardIndex: 5, seed: 1234567, duel: 'Rival', seconds: 8 }), true);
    assert.equal(s.question.card, cards[5]);
    assert.equal(s.question.duel, 'Rival');
    assert.ok(s.question.deadline > 5000 && s.question.seconds === 8, 'duels carry a countdown');
    options.push(s.question.options.join('|'));
}
assert.equal(new Set(options).size, 1, 'every duelist sees the same four choices in the same order');

function openRiver() {
    const s = {
        seed: 42, mode: 'river', startedAt: 0, testPauseAt: 0, preview: false, testing: false,
        local: { id: 'test', color: '#fff', cos: {} }, user: { id: 'test' },
        vw: 1280, vh: 720, mouse: { x: 640, y: 360, active: false },
        overlay: { classList: { contains: () => false } }, roster: new Map(),
        axis: () => ({ x: 0, y: 0 }), down: () => false, remoteList: () => [],
        sfx: noop, toast: message => s.messages.push(message), messages: [], score: 0,
        addScore: amount => { s.score += amount; }, setGoal: noop, emit: noop, ask: () => false,
        spend: amount => A.Session.prototype.spend.call(s, amount)
    };
    s.game = new A.games.river(s);
    const g = s.game;
    g.rocks = []; g.logs = []; g.pools = []; g.chests = []; g.fish = [];
    return s;
}

// Wave riding: a boat on the crest's face is carried along at wave speed without paying steering energy.
{
    const s = openRiver(), g = s.game, sounds = [];
    s.sfx = (...args) => sounds.push(args);
    s.addScore = amount => A.Session.prototype.addScore.call(s, amount);
    g.haul = 100; g.catches = 5; s.score = 100;
    g.loseFish();
    assert.equal(g.haul, 90); assert.equal(s.score, 90);
    g.loseFish();
    assert.equal(sounds.length, 0, 'incidental crashes retain fish losses without stacking hit sounds');
    s.addScore(50);
    assert.equal(s.score, 131, 'quiet river scoring still updates rewards');
    assert.equal(sounds.length, 0, 'catch scoring leaves audio to the explicit catch cue');
}
for (const fps of [30, 60, 120]) {
    const s = openRiver(), g = s.game;
    const start = 28.6;
    s.testPauseAt = start * 1000;
    const crest = g.surgeAt(start).x;
    Object.assign(g.me, { x: crest - 40, y: g.H / 2, vx: 0, vy: 0 });
    s.axis = () => ({ x: 1, y: 0 });
    g.res.value = 50;
    const x0 = g.me.x;
    let rode = 0;
    for (let frame = 1; frame <= fps * 3; frame++) {
        s.testPauseAt = (start + frame / fps) * 1000;
        g.update(1 / fps);
        if (g.riding) rode++;
    }
    const travelled = g.me.x - x0;
    assert.ok(rode > fps * 2.5, `${fps} FPS: the boat stays on the wave (${rode} frames)`);
    assert.ok(travelled > 1100, `${fps} FPS: surfing carries the boat ${Math.round(travelled)}px in 3s`);
    assert.ok(g.res.value > 49, `${fps} FPS: surfing steers for free`);
    const crestNow = g.waveCrest(g.me.y, start + 3);
    assert.ok(Math.abs(g.me.x - crestNow) < 200, 'the boat rides with the crest rather than being flung past it');
    s.axis = () => ({ x: -1, y: 0 });
    for (let frame = 1; frame <= fps * 2; frame++) {
        s.testPauseAt = (start + 3 + frame / fps) * 1000;
        g.update(1 / fps);
    }
    assert.ok(g.riding, 'paddling against the wave does not immediately escape its carry');
    s.axis = () => ({ x: 0, y: 0 });
    for (let frame = 1; frame <= fps; frame++) {
        s.testPauseAt = (start + 5 + frame / fps) * 1000;
        g.update(1 / fps);
    }
    assert.ok(g.riding, 'the wave keeps carrying without paddling');
    g.me.y = g.bank + 50;
    s.testPauseAt += 1000 / fps; g.update(1 / fps);
    assert.ok(s.messages.some(message => /Rode the wave/.test(message)), 'dropping off a long ride pays a surf bonus');
    assert.ok(s.score > 0 && g.haul > 0, 'surf bonus counts toward the haul');
    g.draw(context, 1280, 720);
}

// Shelter still works: the pale shallows never surf.
{
    const s = openRiver(), g = s.game;
    s.testPauseAt = 30000;
    Object.assign(g.me, { x: g.surgeAt(30).x - 40, y: g.bank + 50, vx: 0, vy: 0 });
    for (let i = 0; i < 30; i++) { s.testPauseAt = 30000 + i * 16; g.update(1 / 60); }
    assert.equal(g.riding, false);
}

// Whirlpool: automatic spin and launch ignore steering, including the ejection glide.
let automaticLaunch;
for (const steer of [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: 0 }]) {
    const s = openRiver(), g = s.game;
    s.testPauseAt = 5000;
    g.pools = [{ x: 1800, y: 900, r: 130, phase: 0, ampX: 0, ampY: 0 }];
    Object.assign(g.me, { x: 1800 + 60, y: 900, vx: 0, vy: 0 });
    g.whirlpool = { pool: g.pools[0], t: 0, radius: 60, angle: 0 };
    s.axis = () => steer;
    let last = { x: g.me.x, y: g.me.y }, maxStep = 0, released = false, frames = 0, preview = null;
    while (frames < 240) {
        frames++; s.testPauseAt = 5000 + frames * 1000 / 60;
        g.update(1 / 60);
        if (g.whirlpool?.dir != null) preview = g.whirlpool.dir;
        maxStep = Math.max(maxStep, Math.hypot(g.me.x - last.x, g.me.y - last.y));
        last = { x: g.me.x, y: g.me.y };
        if (!g.whirlpool && frames > 5) { released = true; break; }
    }
    assert.ok(released && frames / 60 < 2, 'the whirlpool releases within two seconds');
    assert.ok(preview != null, 'a launch direction is previewed while spinning');
    const speed = Math.hypot(g.me.vx, g.me.vy);
    assert.ok(speed > 700, 'launch is fast');
    assert.ok(maxStep < 40, `position is continuous through the launch (max ${maxStep.toFixed(1)}px/frame)`);
    assert.ok(Math.hypot(g.me.x - 1800, g.me.y - 900) > 180, 'boat clears the pool on release');
    const launch = { x: g.me.x, y: g.me.y, vx: g.me.vx, vy: g.me.vy, aim: g.me.aim };
    for (let i = 0; i < 30; i++) {
        s.testPauseAt += 1000 / 60;
        g.update(1 / 60);
    }
    const result = { launch, glide: { x: g.me.x, y: g.me.y, vx: g.me.vx, vy: g.me.vy } };
    if (!automaticLaunch) automaticLaunch = result;
    else assert.deepEqual(result, automaticLaunch, 'held steering cannot change whirlpool spin, launch direction or ejection glide');
}

// Market leaderboard formats money, not delivery counts.
{
    const s = openRiver();
    const market = new A.games.market(s);
    assert.equal(market.goalUnit, 'cash');
    assert.equal(market.formatValue(1234), '$1,234');
}

// Top-down figures draw with and without movement for every cosmetic slot.
for (const moving of [false, true]) {
    A.util.drawFigureTop(context, { color: '#38bdf8', cos: {} }, 0, 0, 15, 0, 1.2, 1, moving);
    A.util.drawFigureTop(context, { color: '#38bdf8', cos: { hat: 'crown', aura: 'flame' } }, 0, 0, 15, 0, 1.2, 1, moving);
}
console.log('Shared duel choices, wave surfing at 30/60/120 FPS, shallows shelter, automatic whirlpool launches, cash leaderboard and top-down figures passed.');
