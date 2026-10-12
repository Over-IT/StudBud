const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class Element {
    constructor() {
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.handlers = {};
        this.classes = new Set();
        this.classList = {
            add: name => this.classes.add(name),
            remove: name => this.classes.delete(name),
            contains: name => this.classes.has(name),
            toggle: (name, force = !this.classes.has(name)) => {
                if (force) this.classes.add(name); else this.classes.delete(name);
                return force;
            }
        };
        this.style = { setProperty() {} };
        this.offsetHeight = 100;
    }
    set innerHTML(value) { this.children = []; }
    appendChild(child) { child.parent = this; this.children.push(child); }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); }
    setPointerCapture() {}
    getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
    emit(name, x, y) {
        for (const handler of this.handlers[name] || []) {
            handler({ pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, preventDefault() {} });
        }
    }
}

const sandbox = {
    console, performance, Date, Math, Map, Set,
    navigator: { maxTouchPoints: 1 },
    requestAnimationFrame() {},
    document: { addEventListener() {}, createElement: () => new Element() },
    window: { matchMedia: () => ({ matches: true }) }
};
vm.createContext(sandbox);
for (const file of ['multiplayerEngine.js', 'multiplayerGames.js', 'multiplayerGames2.js', 'multiplayerGames3.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}

const A = sandbox.window.StudBudArcade;
function controlsFor(mode) {
    const session = Object.create(A.Session.prototype);
    session.keys = new Set();
    session.justPressed = new Set();
    session.mouse = {};
    session.mode = mode;
    session.layoutHud = () => {};
    session.resize = () => {};
    session.game = Object.create(A.games[mode].prototype);
    session.game.res = { label: 'Energy' };
    const overlay = new Element();
    const pad = new Element();
    const stick = new Element();
    const knob = new Element();
    const zone = new Element();
    const buttons = new Element();
    const status = new Element();
    const details = new Element();
    const hint = new Element();
    const toggle = new Element();
    const elements = { '.mpg-touch': pad, '.mpg-stick-zone': zone, '.mpg-status': status,
        '.mpg-match-details': details, '.mpg-hint': hint, '.mpg-hud-toggle': toggle };
    overlay.querySelector = selector => selector === '.mpg-qbtn'
        ? status.children.find(el => el.className?.includes('mpg-qbtn'))
        : elements[selector];
    pad.querySelector = selector => selector === '.mpg-stick' ? stick : buttons;
    stick.querySelector = () => knob;
    session.overlay = overlay;
    session.bindTouch(overlay);
    session.applyTouchLayout();
    return { session, stick, knob, zone, buttons, status, details, hint, toggle };
}

for (const mode of ['skyline', 'duel']) {
    const { session, stick, knob, zone, buttons } = controlsFor(mode);
    assert.equal(session.stickHorizontal, true, `${mode} must have horizontal-only movement`);
    assert.match(stick.attributes['aria-label'], /left or right/);
    for (const surface of [stick, zone]) {
        surface.emit('pointerdown', 50, 50);
        surface.emit('pointermove', 50, -100);
        assert.equal(session.keys.size, 0, 'pushing straight up must not jump');
        assert.match(knob.style.transform, /^translate\(-?\d+px, 0px\)$/, 'knob stays on horizontal rail');
        surface.emit('pointermove', 100, -100);
        assert.equal(session.keys.has('KeyD'), true);
        assert.equal(session.keys.has('KeyW'), false);
        assert.equal(session.keys.has('KeyS'), false);
        assert.equal(session.keys.has('Space'), false);
        surface.emit('pointermove', -100, 100);
        assert.equal(session.keys.has('KeyA'), true);
        assert.equal(session.keys.has('KeyD'), false);
        surface.emit('pointercancel');
        assert.equal(session.keys.size, 0, 'cancel releases joystick movement');
        session.justPressed.clear();
    }
    const jump = buttons.children.find(button => button.dataset.k === 'Space');
    jump.emit('pointerdown');
    assert.equal(session.keys.has('Space'), true, 'Jump button holds jump');
    assert.equal(session.justPressed.has('Space'), true, 'Jump button triggers jump');
    stick.emit('pointerdown', 100, 50);
    assert.equal(session.keys.has('Space'), true, 'joystick must not release the Jump button');
    stick.emit('pointerup');
    jump.emit('pointerup');
    assert.equal(session.keys.size, 0);
}

for (const mode of ['miner', 'shooter', 'sports', 'market', 'river']) {
    const { session, stick } = controlsFor(mode);
    assert.equal(session.stickHorizontal, false, `${mode} retains vertical movement`);
    stick.emit('pointerdown', 50, 0);
    assert.equal(session.keys.has('KeyW'), true, `${mode} retains up input`);
    stick.emit('pointermove', 50, 100);
    assert.equal(session.keys.has('KeyS'), true, `${mode} retains down input`);
    stick.emit('lostpointercapture');
    assert.equal(session.keys.size, 0);
}

const { session, details, hint, toggle, status } = controlsFor('skyline');
for (const collapsed of [true, false, true]) {
    session.setHudCollapsed(collapsed);
    assert.equal(session.overlay.classList.contains('hud-collapsed'), collapsed);
    assert.equal(details.hidden, collapsed);
    assert.equal(hint.hidden, collapsed);
    assert.equal(toggle.attributes['aria-expanded'], String(!collapsed));
    assert.equal(toggle.attributes['aria-label'], collapsed ? 'Show match details' : 'Hide match details');
    assert.equal(status.children[0].hidden, undefined, 'refill button remains available');
}
console.log('Horizontal parkour joysticks, separate Jump buttons, vertical non-parkour input, pointer release, and HUD disclosure passed.');
