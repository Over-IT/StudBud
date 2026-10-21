const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {}, document: { addEventListener() {} }, console, Math, Date, Map, Set, performance };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'multiplayerEngine.js'), 'utf8'), sandbox);
let queries = 0, writes = 0, toggles = 0;
const label = {}, value = {};
for (const element of [label, value]) {
    Object.defineProperty(element, 'textContent', { set(text) { writes++; this.text = text; } });
}
const classes = new Map();
const box = { classList: { toggle(name, enabled) { toggles++; classes.set(name, enabled); } },
    querySelector(selector) { return selector === '.mpg-meter-label' ? label : value; } };
const session = {
    preview: false, testing: false, game: { res: { label: 'Energy', value: 100 } },
    overlay: { querySelector() { queries++; return box; } }
};
const update = () => sandbox.window.StudBudArcade.Session.prototype.updateMeter.call(session);
for (let i = 0; i < 6000; i++) update();
assert.equal(queries, 1, '6000 unchanged frames query the meter only once');
assert.equal(writes, 2, 'unchanged frames do not replace meter text nodes');
assert.equal(toggles, 3, 'unchanged frames do not repeatedly mutate CSS classes');
session.game.res.value = 99.6; update();
assert.equal(writes, 2, 'sub-integer drain does not repaint an unchanged displayed value');
session.game.res.value = 99.4; update();
assert.equal(value.text, '99');
session.game.res.value = 10.1; update();
assert.equal(classes.get('low'), false);
session.game.res.value = 10; update();
assert.equal(classes.get('low'), true, 'low-energy indication starts at ten, before depletion');
session.game.res.value = .6; update();
assert.equal(classes.get('empty'), true);
session.game.res.value = 1; update();
assert.equal(classes.get('empty'), false, 'depletion state updates even when rounded display remains one');
session.game.res.value = 0; update();
assert.equal(classes.get('low'), true);
assert.equal(classes.get('empty'), true);
session.game.res.value = 5; update();
assert.equal(classes.get('low'), true, 'nearly depleted resources warn before running out');
assert.equal(classes.get('empty'), false);
session.testing = true; update();
assert.equal(classes.get('hidden'), true);
session.limitedTestEnergy = true; update();
assert.equal(classes.get('hidden'), false, 'limited staff tests show the normal resource meter');
session.limitedTestEnergy = false; update();
session.game.res = { label: 'Ammo', value: 30 }; update();
session.testing = false; update();
assert.equal(label.text, 'Ammo', 'resource replacement while hidden updates when shown');
assert.equal(value.text, '30');
assert.equal(classes.get('hidden'), false);
assert.equal(classes.get('low'), false);
session.game.res = null; update();
assert.equal(classes.get('hidden'), true);
session.game.res = { label: 'Bait', value: 4 }; update();
assert.equal(label.text, 'Bait');
assert.equal(value.text, '4');
session.game.res.value = 30; update();
assert.equal(classes.get('low'), false, 'answering a refill question clears the warning');
console.log('6000-frame meter DOM-query/write bounds, rounding, depleted state, testing visibility and resource replacement passed.');
{
    const sounds = [], noticeClasses = new Set(['hidden']), text = {}, hint = {};
    let noticeQueries = 0;
    const notice = { classList: { toggle: (name, force) => force ? noticeClasses.add(name) : noticeClasses.delete(name) }, querySelector: selector => selector === 'span' ? text : hint };
    const actor = { t: 0, countdown: 0, sfx: (...args) => sounds.push(args),
        overlay: { querySelector: () => { noticeQueries++; return notice; } } };
    const resource = { value: 30, label: 'Energy' };
    const tick = (hidden = false) => sandbox.window.StudBudArcade.Session.prototype.updateResourceNotice.call(actor, resource, hidden);
    tick();
    assert.equal(sounds.length, 0);
    assert.equal(noticeQueries, 0, 'healthy resources do not query the notification DOM');
    resource.value = 10.1; tick();
    assert.equal(sounds.length, 0, 'warning does not trigger above ten energy');
    assert.equal(noticeClasses.has('hidden'), true);
    resource.value = 10; tick();
    assert.equal(sounds.length, 1);
    assert.equal(sounds[0][0], 'lowResource');
    assert.equal(sounds[0][2], .6, 'warning uses the quiet sound effect volume');
    assert.equal(text.textContent, 'Low energy');
    assert.equal(noticeClasses.has('hidden'), false);
    for (let i = 0; i < 600; i++) { actor.t += 1 / 60; tick(); }
    assert.equal(sounds.length, 1, 'staying low never repeats the sound');
    assert.equal(noticeClasses.has('hidden'), true, 'center notice disappears after four seconds');
    resource.value = 11; tick(); resource.value = 10; tick();
    assert.equal(sounds.length, 1, 'small fluctuations near the threshold do not retrigger alerts');
    resource.value = 30; tick(); resource.value = 5;
    actor.question = {}; tick(); assert.equal(sounds.length, 1, 'questions suppress alerts');
    actor.question = null; actor.paused = true; tick(); assert.equal(sounds.length, 1, 'pause suppresses alerts');
    actor.paused = false; tick(true); assert.equal(sounds.length, 1, 'staff/invisible meters suppress alerts');
    tick(); assert.equal(sounds.length, 2, 'refilling above fifteen rearms one subsequent low warning');
    assert.equal(noticeQueries, 1, 'the center notice is cached rather than queried every frame');
    actor.over = true; tick(); assert.equal(noticeClasses.has('hidden'), true);
    actor.over = false;
    sandbox.window.StudBudArcade.Session.prototype.updateResourceNotice.call(actor, null, true);
    assert.equal(noticeClasses.has('hidden'), true, 'games without a resource do not show a false warning');
}
const A = sandbox.window.StudBudArcade;
{
    const now = sandbox.Date.now;
    let time = 10000;
    sandbox.Date.now = () => time;
    try {
        const host = { connected: true, cardsReady: true, user: { id: 'host' }, isHost: true,
            readyPlayers: new Set(), roster: new Map([['host', {}], ['guest', {}]]), startedAt: 9000, deadline: 69000, countdown: 3.4 };
        const sync = actor => A.Session.prototype.syncStart.call(actor);
        assert.equal(sync(host), false, 'host waits for peers to load instead of playing early');
        time += 5000; assert.equal(sync(host), false);
        host.readyPlayers.add('guest'); sync(host);
        assert.equal(host.countdown, 3.4, 'full countdown starts after every player is ready');
        const guest = { ...host, user: { id: 'guest' }, isHost: false, readyPlayers: new Set(), startClockSynced: false, startedAt: 9000, deadline: 69000 };
        time += 100; sync(guest);
        assert.equal(guest.localStartAt, host.localStartAt, 'all initial clients use the host scheduled countdown epoch');
        assert.equal(host.startedAt, 9000, 'loading preserves the authoritative server start time');
        assert.equal(host.deadline, 69000, 'loading never extends the client deadline beyond the server deadline');
        assert.equal(guest.deadline, host.deadline, 'clients retain the same server match deadline');
        time = host.matchStartAt; sync(host); sync(guest);
        assert.equal(host.countdown, 0); assert.equal(guest.countdown, 0);
        const late = { ...guest, startClockSynced: false, startedAt: 9000, deadline: 69000 };
        time += 20000; sync(late);
        assert.equal(late.countdown, 1.2, 'late joiner gets a local countdown without restarting the match');
        assert.equal(late.startedAt, host.startedAt);
        assert.equal(sync({ ...host, cardsReady: false }), false, 'question loading is part of readiness');
        assert.equal(sync({ ...host, connected: false }), false, 'network subscription is part of readiness');
        const departed = { user: { id: 'host' }, roster: new Map([['guest', {}]]), remotes: new Map(), readyPlayers: new Set(['guest']) };
        A.Session.prototype.updateRoster.call(departed, { state: { players: [] } });
        assert.equal(departed.readyPlayers.size, 0, 'departed players cannot leave stale readiness behind');
    } finally { sandbox.Date.now = now; }
}
{
    const createElement = sandbox.document.createElement;
    const context = new Proxy({}, { get: () => () => {} });
    sandbox.document.createElement = () => ({ getContext: () => context, toDataURL: () => 'data:image/png;base64,test' });
    const details = {}, card = { scrollTop: 12 }, exit = { focus() {} };
    const panel = { classList: { remove() {} }, contains: () => false,
        querySelector: selector => selector === '.mpg-summary' ? details : selector === '.mpg-results-card' ? card : exit };
    const actor = { user: { id: 'me', is_anonymous: true }, game: { scoreGoal: false, goalUnit: 'm' },
        metric: A.Session.prototype.metric, sameRank: A.Session.prototype.sameRank,
        valueText: A.Session.prototype.valueText, answered: 0, correct: 0, t: 30,
        overlay: { querySelector: () => panel } };
    try {
        for (const count of [0, 1, 2, 3, 4]) {
            actor.standingsCache = Array.from({ length: count }, (_, i) => ({
                id: i === 0 ? 'me' : `p${i}`, n: i === 0 ? '<Winner>' : `Player ${i}`, s: 100 - i, g: 100 - i
            }));
            A.Session.prototype.renderResults.call(actor);
            assert.equal((panel.innerHTML.match(/class="mpg-podium-player /g) || []).length, Math.min(3, count));
            assert.equal((panel.innerHTML.match(/<li /g) || []).length, count, 'podium retains full standings');
            if (count) {
                assert.ok(panel.innerHTML.includes('&lt;Winner&gt;'), 'podium names are escaped');
                assert.ok(panel.innerHTML.indexOf('mpg-podium') < panel.innerHTML.indexOf('Final standings'));
            }
        }
        actor.standingsCache[1].g = actor.standingsCache[0].g;
        A.Session.prototype.renderResults.call(actor);
        assert.equal((panel.innerHTML.match(/mpg-podium-rank">1</g) || []).length, 2, 'ties keep shared podium ranks');
        assert.equal(card.scrollTop, 12, 'reward refresh preserves result scroll position');
    } finally { sandbox.document.createElement = createElement; }
}
for (const [mode, threshold] of Object.entries({
    skyline: 15, duel: 18, miner: 20, river: 20, frenzy: 10, fishing: 10,
    market: 25, shooter: 30, defense: 45
})) {
    const classes = new Map(), sounds = [];
    const notice = { classList: { toggle(name, enabled) { classes.set(name, enabled); } }, querySelector: () => ({}) };
    const meter = { classList: notice.classList, querySelector: () => ({}) };
    const resource = { label: 'Energy', value: threshold + .1 };
    const actor = { mode, t: 1, game: { res: resource }, sfx: (...args) => sounds.push(args),
        overlay: { querySelector: selector => selector === '.mpg-meter' ? meter : notice },
        updateResourceNotice: A.Session.prototype.updateResourceNotice };
    const tick = () => A.Session.prototype.updateMeter.call(actor);
    tick();
    assert.equal(classes.get('low'), false, `${mode} meter stays normal above ${threshold}`);
    assert.equal(sounds.length, 0);
    resource.value = threshold; tick();
    assert.equal(classes.get('low'), true, `${mode} meter and notice share the threshold`);
    assert.equal(actor.resourceNoticeVisible, true);
    assert.equal(sounds.length, 1, `${mode} warns at ${threshold}`);
    resource.value = threshold + .1; tick();
    resource.value = threshold; tick();
    assert.equal(sounds.length, 1, `${mode} threshold fluctuations do not repeat sounds`);
    resource.value = threshold * 1.5 + .1; tick();
    resource.value = threshold; tick();
    assert.equal(sounds.length, 2, `${mode} refill rearms the warning`);
}
{
    const notices = [], sounds = [], resource = { label: 'Moves', value: 0 };
    const notice = { classList: { toggle: (name, hidden) => notices.push(hidden) }, querySelector: () => ({}) };
    const actor = { mode: 'chess', t: 1, sfx: (...args) => sounds.push(args), game: {
        resourceNotice: () => resource, resourceWarningThreshold: () => 0
    }, overlay: { querySelector: selector => selector === '.mpg-resource-notice' ? notice
        : { classList: { toggle() {} }, querySelector: () => ({}) } },
        updateResourceNotice: A.Session.prototype.updateResourceNotice };
    const tick = () => A.Session.prototype.updateMeter.call(actor);
    tick();
    assert.equal(actor.resourceNoticeVisible, true, 'Question Chess has a shared no-moves warning without inventing energy');
    assert.equal(sounds.length, 1);
    resource.value = 1; tick();
    assert.equal(actor.resourceNoticeVisible, false, 'earning a move clears the prompt');
    resource.value = 0; tick();
    assert.equal(sounds.length, 2, 'using the move rearms one prompt');
    const miner = { ...actor, mode: 'miner', game: { resourceWarningThreshold: () => 60 }, resourceNoticeVisible: false, noticeResource: null };
    A.Session.prototype.updateResourceNotice.call(miner, { label: 'Fuel', value: 59 }, false);
    assert.equal(miner.resourceNoticeVisible, true, 'deep mining uses the shared warning with the return-trip threshold');
    for (const file of ['multiplayerGames.js', 'multiplayerGames2.js']) {
        const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        assert.doesNotMatch(code, /LOW FUEL|this\.lowFuel|s\.toast\('Out of energy/, 'mode-specific duplicate resource warnings are removed');
    }
}
{
    const reward = {}, indicator = {}, messages = [];
    const actor = {
        testing: true, limitedTestEnergy: false, mode: 'skyline', reward: 20,
        rewardAmount: A.Session.prototype.rewardAmount,
        game: { res: { value: 30, max: 100 } },
        overlay: { querySelector: selector => selector === '[data-test-reward]' ? reward : indicator },
        updateMeter() {}, layoutHud() {}, toast: message => messages.push(message)
    };
    const change = input => A.Session.prototype.updateTestEnergy.call(actor, input);
    change({ dataset: { testEnergy: '' }, checked: false });
    assert.equal(actor.limitedTestEnergy, true);
    assert.equal(reward.disabled, false);
    assert.equal(actor.game.res.value, 30, 'switching to limited preserves current resources');
    change({ dataset: { testReward: '' }, value: '21' });
    assert.equal(actor.rewardAmount(), 21);
    const invalid = { dataset: { testReward: '' }, value: '21.5' };
    change(invalid);
    assert.equal(actor.rewardAmount(), 21);
    assert.equal(invalid.value, '21');
    assert.equal(messages.length, 1, 'invalid rewards explicitly notify the tester');
    change({ dataset: { testEnergy: '' }, checked: true });
    assert.equal(actor.game.res.value, 100);
    assert.equal(reward.disabled, true);
    assert.match(indicator.textContent, /infinite/);
    actor.testing = false;
    change({ dataset: { testEnergy: '' }, checked: false });
    assert.equal(actor.limitedTestEnergy, false, 'non-staff games cannot enable test controls');
}
sandbox.window.matchMedia = () => ({ matches: true });
sandbox.window.NexusApp = { AppState: { get: () => ({ gameQuality: 'low' }) } };
const full = A.graphicsProfile();
assert.equal(full.low, false, 'legacy saved low quality is ignored');
for (const mode of ['auto', 'low', 'full', 'high', undefined]) {
    const profile = A.graphicsProfile(mode, { hardwareConcurrency: 2, deviceMemory: 2, connection: { saveData: true } });
    assert.equal(profile.low, false, 'hardware, reduced motion and saved settings cannot lower game quality');
    assert.equal(profile.maxDpr, 2);
    assert.equal(profile.fps, Infinity, 'game rendering is not frame capped');
    assert.equal(profile.particleScale, 1);
}
const particles = new A.Particles({ graphics: full, preview: true });
for (let i = 0; i < 100; i++) particles.burst(0, 0, '#fff', 100);
assert.equal(particles.items.length, 320, 'full-detail particle growth is bounded');
const array = particles.items;
particles.update(2);
assert.equal(particles.items.length, 0);
assert.equal(particles.items, array, 'particle cleanup reuses its allocation');
let ticks = 0, draws = 0;
sandbox.requestAnimationFrame = () => 1;
const frameSession = {
    lastFrame: 0, graphics: full, mode: 'market', countdown: 0, practice: true, testing: false, paused: false,
    game: { update() { ticks++; }, draw() { draws++; } }, overlay: { querySelector: () => ({ classList: { add() {} } }) },
    ctx: { setTransform() {} }, remotes: new Map(), justPressed: new Set(), mouse: {},
    checkEnd() {}, updateMeter() {}, dpr: 1, scale: 1, vw: 100, vh: 100
};
for (let i = 1; i <= 6000; i++) A.Session.prototype.frame.call(frameSession, i * 1000 / 60);
assert.equal(ticks, 6000, 'all game physics updates survive render throttling');
assert.equal(draws, 6000, 'full detail renders all 60 Hz display frames');
frameSession.testing = true;
frameSession.game.res = { value: 10, max: 100 };
A.Session.prototype.frame.call(frameSession, 100010);
assert.equal(frameSession.game.res.value, 100, 'unlimited tests automatically keep resources full');
frameSession.limitedTestEnergy = true;
frameSession.game.res.value = 10;
A.Session.prototype.frame.call(frameSession, 100020);
assert.equal(frameSession.game.res.value, 10, 'limited tests never auto-refill resources');
frameSession.testing = false;
frameSession.mode = 'chess';
A.Session.prototype.frame.call(frameSession, 100100);
assert.equal(draws, 6002, 'DOM chess avoids redundant canvas frames');
assert.equal(frameSession.graphics.low, false);
assert.equal(frameSession.resolutionScale, undefined, 'frame timing never silently lowers render resolution');
const resizeSession = {
    adaptiveLow: true, resolutionScale: .5, overlay: { clientWidth: 800, clientHeight: 600 },
    canvas: {}, layoutHud() {}
};
sandbox.window.devicePixelRatio = 2;
A.Session.prototype.resize.call(resizeSession);
assert.equal(resizeSession.graphics.low, false, 'stale adaptive low flags cannot affect graphics');
assert.equal(resizeSession.dpr, 2, 'stale resolution scales cannot degrade rendering');
assert.equal(resizeSession.canvas.width, 1600);
assert.equal(resizeSession.graphics.particleLimit, 320);
const particleState = (x, y, size = 4) => ({ x, y, size, vx: 0, vy: 0, life: 1, max: 1, color: '#fff' });
particles.items.push(particleState(50, 30), particleState(1000, 30), particleState(-10, 30, 30));
const paint = {
    canvas: { width: 200, height: 100 },
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }),
    fillRect() { this.calls = (this.calls || 0) + 1; }
};
particles.draw(paint);
assert.equal(paint.calls, 2, 'off-screen particles skip drawing while edge-overlapping effects remain');
assert.equal(particles.items.length, 3, 'drawing does not remove particles or alter simulation');
assert.equal(paint.globalAlpha, 1);
particles.update(.25);
assert.equal(particles.items[1].life, .75, 'off-screen effects still expire at the same rate');
const rotated = A.util.canvasView({ canvas: { width: 200, height: 100 }, getTransform: () => ({ a: 0, b: 2, c: -2, d: 0, e: 200, f: 0 }) });
assert.deepEqual(JSON.parse(JSON.stringify(rotated)), { x0: 0, x1: 50, y0: 0, y1: 100 }, 'viewport handles rotated, scaled cameras');
assert.equal(A.util.canvasView({ getTransform: () => ({ a: 0, b: 0, c: 0, d: 0 }), canvas: paint.canvas }), null);
assert.equal(A.util.canvasView({}), null, 'lightweight preview contexts retain a safe fallback');
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(!uiSource.includes('id="game-quality"'), 'obsolete quality selector is absent');
assert.ok(!fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8').includes('low-effects'), 'quality CSS cannot silently suppress effects');
console.log('Full-quality rendering, legacy preference compatibility, viewport particle culling and unchanged simulation passed.');
{
    const recorder = (transform, width = 200, height = 100) => {
        const log = { rects: [], gradients: 0, images: [], styles: [] };
        let m = { ...transform };
        const stack = [];
        const ctx = {
            canvas: { width, height }, log,
            getTransform: () => ({ ...m }),
            setTransform(a, b, c, d, e, f) { m = { a, b, c, d, e, f }; },
            save() { stack.push({ ...m }); }, restore() { m = stack.pop(); },
            createLinearGradient() { log.gradients++; return { addColorStop() {} }; },
            createRadialGradient() { log.gradients++; return { addColorStop() {} }; },
            fillRect(x, y, w, h) { log.rects.push({ x, y, w, h, m: { ...m }, style: ctx.fillStyle }); },
            drawImage(image, x, y) { log.images.push({ image, x, y, m: { ...m } }); }
        };
        return ctx;
    };
    const banded = recorder({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    A.util.bandGradient(banded, 0, -100, 100, 400, [[0, '#000000'], [1, '#ffffff']]);
    assert.equal(banded.log.gradients, 0, 'band gradients use solid fills instead of gradient rasterization');
    assert.ok(banded.log.rects.length > 0 && banded.log.rects.length <= 40, 'only bands inside the 50px-tall view are drawn');
    assert.ok(banded.log.rects.every(r => r.y + r.h >= 0 && r.y <= 50), 'off-screen bands are culled');
    assert.ok(banded.log.rects.every(r => r.h <= 400 / 1024 * 3 + 2 * 1.5 + 1e-9), 'bands stay a few device pixels tall');
    const shades = banded.log.rects.map(r => +r.style.match(/\d+/)[0]);
    assert.ok(shades.every((v, i) => !i || v >= shades[i - 1]) && shades[0] > 50 && shades.at(-1) < 100, 'band colours follow the gradient at its visible position');
    const plain = { fillRect() {}, createLinearGradient() { plain.made = true; return { addColorStop() {} }; } };
    A.util.bandGradient(plain, 0, 0, 10, 10, [[0, '#000'], [1, '#fff']]);
    assert.ok(plain.made, 'band gradients fall back to a real gradient on lightweight contexts');
    assert.deepEqual([...A.util.parseRgb('#0e7490')], [14, 116, 144]);
    assert.deepEqual([...A.util.parseRgb('#fff')], [255, 255, 255]);
    assert.deepEqual([...A.util.parseRgb('rgb(1, 2, 3)')], [1, 2, 3]);

    const oldCreate = sandbox.document.createElement;
    const surfaces = [];
    sandbox.document.createElement = () => { const surface = { width: 0, height: 0 }; surface.getContext = () => (surface.ctx ||= recorder({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, 0, 0)); surfaces.push(surface); return surface; };
    try {
        const screen = recorder({ a: 3, b: 0, c: 0, d: 3, e: 0, f: 0 }, 300, 150), owner = {};
        let paints = 0;
        const painter = p => { paints++; p.fillRect(0, 0, 100, 50); };
        for (let i = 0; i < 5; i++) A.util.screenLayer(owner, 'layer', 'a', screen, painter);
        assert.equal(paints, 1, 'static screen layers are painted once and reused');
        assert.equal(screen.log.images.length, 5, 'cached layers are blitted every frame');
        assert.ok(screen.log.images.every(img => img.m.a === 1 && img.m.d === 1 && img.x === 0 && img.y === 0), 'layers are copied 1:1 at device resolution');
        assert.deepEqual({ ...screen.getTransform() }, { a: 3, b: 0, c: 0, d: 3, e: 0, f: 0 }, 'caller transform is restored');
        assert.equal(surfaces[0].width, 300, 'layer matches device pixels');
        A.util.screenLayer(owner, 'layer', 'b', screen, painter);
        assert.equal(paints, 2, 'changed signatures repaint the layer');
        let direct = 0;
        A.util.screenLayer({}, 'layer', 'a', { fillRect() {} }, () => direct++);
        assert.equal(direct, 1, 'contexts without transforms paint directly');

        const fogCtx = recorder({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }, 1000, 600), fogOwner = {};
        const fogStops = [[0, 'rgba(255,224,160,.05)'], [1, 'rgba(2,5,14,.5)']];
        for (let i = 0; i < 4; i++) A.util.radialOverlay(fogOwner, 'fog', fogCtx, 250, 150, 20, 100, fogStops, 500, 300);
        assert.equal(fogCtx.log.gradients, 0, 'fog gradient is never rasterized full-screen on the main canvas');
        assert.equal(fogCtx.log.images.length, 4, 'cached fog disc is blitted each frame');
        assert.equal(fogCtx.log.images[0].x, 300, 'fog disc is centred on the light in device pixels');
        const surround = fogCtx.log.rects.slice(0, 4);
        assert.equal(surround.length, 4, 'area beyond the fog radius is covered with solid rectangles');
        assert.ok(surround.every(r => r.style === 'rgba(2,5,14,.5)'), 'surrounding fog uses the outer stop colour');
        assert.equal(surround.reduce((sum, r) => sum + r.w * r.h, 0) + 400 * 400, 1000 * 600, 'disc plus surrounding rectangles cover the screen exactly once');
    } finally { sandbox.document.createElement = oldCreate; }
    for (const [file, banned] of [['multiplayerGames.js', ['floorPattern', 'createPattern']], ['multiplayerGames2.js', ['ctx.createRadialGradient(px, py']]]) {
        const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        for (const text of banned) assert.ok(!source.includes(text), `${file} avoids slow full-screen ${text}`);
    }
    console.log('Banded gradients, cached screen layers and fog overlays passed.');
}
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'multiplayerGames2.js'), 'utf8'), sandbox);
const arenaView = { x0: 500, x1: 800, y0: 400, y1: 600 };
assert.equal(A.Arena.prototype.seenRect.call(arenaView, 0, 450, 600, 20, 0), true, 'large rectangles crossing the view are retained');
assert.equal(A.Arena.prototype.seenRect.call(arenaView, 0, 0, 100, 100, 0), false, 'distant scenery is rejected');
console.log('Arena rectangle intersection passed.');
const U = A.util;
const solids = Array.from({ length: 10000 }, (_, i) => ({ x: (i % 5) * 100, y: -i * 90, w: 90, h: 16, oneway: true }));
solids.push({ x: -50, y: -60000, w: 12, h: 62000 }, { x: 120, y: 150, w: 80, h: 15, mover: true },
    { x: 0, y: 280, w: 500, h: 30 }, { x: 240, y: 180, w: 90, h: 100, slope: 1 });
const indexed = [...solids];
indexed.spatialIndex = new U.VerticalIndex(indexed);
assert.ok(indexed.spatialIndex.query(0, 600).length < 20, 'large levels reduce collision candidates by more than 99%');
for (const fps of [30, 60, 120]) {
    const fullBody = { x: 30, y: 0, w: 26, h: 44, vx: 80, vy: 120 };
    const fastBody = { ...fullBody };
    for (let i = 0; i < fps * 4; i++) {
        const mover = solids[10001];
        mover.y = 150 + Math.sin(i / fps) * 90;
        fullBody.vy += 1500 / fps; fastBody.vy += 1500 / fps;
        U.moveBody(fullBody, solids, 1 / fps);
        U.moveBody(fastBody, indexed, 1 / fps);
        for (const key of ['x', 'y', 'vx', 'vy', 'wall', 'onGround', 'ground']) assert.equal(fastBody[key], fullBody[key], `${fps} FPS indexed ${key} matches full collision scan`);
    }
}
indexed.push({ x: 0, y: 200, w: 500, h: 20 });
assert.ok(indexed.spatialIndex.query(180, 240).includes(indexed.at(-1)), 'array additions refresh the index');
const benchmark = list => {
    const start = performance.now();
    for (let i = 0; i < 2000; i++) U.moveBody({ x: 20, y: 180, w: 26, h: 44, vx: 50, vy: 80 }, list, 1 / 60);
    return performance.now() - start;
};
benchmark(indexed); benchmark(solids);
const fullMs = benchmark(solids), indexedMs = benchmark(indexed);
assert.ok(indexedMs < fullMs * .5, `indexed collision CPU time must improve by at least 50%: ${indexedMs.toFixed(1)} vs ${fullMs.toFixed(1)} ms`);
console.log(`10,004-solid collision benchmark: full ${fullMs.toFixed(1)}ms, indexed ${indexedMs.toFixed(1)}ms; trajectory parity at 30/60/120 FPS passed.`);
