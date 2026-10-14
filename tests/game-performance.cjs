const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {}, document: { addEventListener() {} }, console, Math, Date, Map, Set };
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
assert.equal(toggles, 2, 'unchanged frames do not repeatedly mutate CSS classes');
session.game.res.value = 99.6; update();
assert.equal(writes, 2, 'sub-integer drain does not repaint an unchanged displayed value');
session.game.res.value = 99.4; update();
assert.equal(value.text, '99');
session.game.res.value = 0; update();
assert.equal(classes.get('low'), true);
session.testing = true; update();
assert.equal(classes.get('hidden'), true);
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
console.log('6000-frame meter DOM-query/write bounds, rounding, depleted state, testing visibility and resource replacement passed.');
const A = sandbox.window.StudBudArcade;
const low = A.graphicsProfile('auto', { hardwareConcurrency: 2, deviceMemory: 2 });
assert.equal(low.maxDpr, 1);
assert.equal(low.fps, 30);
assert.equal(A.graphicsProfile('full', { hardwareConcurrency: 2 }).fps, 60);
assert.equal(A.graphicsProfile('auto', { connection: { saveData: true } }).low, true);
const particles = new A.Particles({ graphics: low, preview: true });
for (let i = 0; i < 100; i++) particles.burst(0, 0, '#fff', 100);
assert.equal(particles.items.length, 90, 'low-end particle growth is bounded');
const array = particles.items;
particles.update(2);
assert.equal(particles.items.length, 0);
assert.equal(particles.items, array, 'particle cleanup reuses its allocation');
let ticks = 0, draws = 0;
sandbox.requestAnimationFrame = () => 1;
const frameSession = {
    lastFrame: 0, graphics: low, mode: 'sports', countdown: 0, practice: true, testing: false, paused: false,
    game: { update() { ticks++; }, draw() { draws++; } }, overlay: { querySelector: () => ({ classList: { add() {} } }) },
    ctx: { setTransform() {} }, remotes: new Map(), justPressed: new Set(), mouse: {},
    checkEnd() {}, updateMeter() {}, dpr: 1, scale: 1, vw: 100, vh: 100
};
for (let i = 1; i <= 6000; i++) A.Session.prototype.frame.call(frameSession, i * 1000 / 60);
assert.equal(ticks, 6000, 'all game physics updates survive render throttling');
assert.ok(draws >= 2999 && draws <= 3001, `${draws} draws for 6000 simulation frames`);
frameSession.mode = 'chess';
A.Session.prototype.frame.call(frameSession, 100100);
assert.ok(draws <= 3001, 'DOM chess avoids redundant canvas frames');
console.log('Low-end GPU resolution/frame policy, bounded effects, zero-allocation cleanup and full-rate game simulation passed.');
