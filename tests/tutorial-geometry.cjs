const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const methods = source.slice(source.indexOf('        tutorialViewport() {'), source.indexOf('        endTutorialUI() {'));
let target = null, viewport, selector = '#target';
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const spot = { hidden: true, style: {} };
const card = {
    style: {},
    getBoundingClientRect() {
        return rect(parseFloat(this.style.left) || 0, parseFloat(this.style.top) || 0,
            parseFloat(this.style.width) || 500, Math.min(300, parseFloat(this.style.maxHeight) || 300));
    }
};
const root = { querySelector: name => name === '.tutorial-spot' ? spot : card };
const document = {
    body: {}, documentElement: { clientWidth: 1366 }, getElementById: () => root,
    querySelectorAll: name => name === selector && target ? [target] : []
};
const window = { devicePixelRatio: 1.5, innerHeight: 768 };
const sandbox = { document, window, performance, getComputedStyle: element => element.computed || { visibility: 'visible', display: 'block', opacity: '1', overflowX: 'visible', overflowY: 'visible' }, requestAnimationFrame: () => 1 };
vm.createContext(sandbox);
const app = vm.runInContext(`new (class { ${methods} })()`, sandbox);
app.tutorialPreparing = false;
const makeTarget = bounds => ({ parentElement: document.body, getBoundingClientRect: () => bounds, getClientRects: () => [bounds] });
for (const [width, height] of [[320, 568], [375, 667], [768, 1024], [1366, 768], [1920, 1080], [3440, 1440]]) {
    viewport = { offsetLeft: 0, offsetTop: 0, width, height };
    window.visualViewport = viewport;
    app.tutorialSel = selector;
    target = makeTarget(rect(30.25, 90.5, Math.min(width - 60, 300), 80.25));
    app.positionTutorialSpot();
    assert.equal(spot.hidden, false);
    const bounds = target.getBoundingClientRect();
    for (const [edge, expected] of [['left', bounds.left - 6], ['top', bounds.top - 6]]) {
        assert.ok(Math.abs(parseFloat(spot.style[edge]) - expected) <= 1 / window.devicePixelRatio, `${width}: spotlight ${edge}`);
    }
    assert.ok(parseFloat(spot.style.left) + parseFloat(spot.style.width) >= bounds.right + 6);
    assert.ok(parseFloat(spot.style.top) + parseFloat(spot.style.height) >= bounds.bottom + 6);
    const cardBounds = card.getBoundingClientRect();
    assert.ok(cardBounds.left >= 12 && cardBounds.right <= width - 11);
    assert.ok(cardBounds.top >= 12 && cardBounds.bottom <= height - 11);
    assert.ok(cardBounds.top >= bounds.bottom || cardBounds.bottom <= bounds.top || cardBounds.left >= bounds.right || cardBounds.right <= bounds.left, 'card uses available space instead of trimming the spotlight');
}
window.visualViewport = { offsetLeft: 125, offsetTop: 260, width: 320, height: 290 };
target = null;
app.positionTutorialSpot();
assert.equal(spot.hidden, true, 'missing target has no empty spotlight');
let bounds = card.getBoundingClientRect();
assert.ok(bounds.left >= 137 && bounds.right <= 433 && bounds.top >= 272 && bounds.bottom <= 538, 'zoom/keyboard card stays in visual viewport');
target = makeTarget(rect(-300, -400, 20, 20));
app.positionTutorialSpot();
assert.equal(spot.hidden, true, 'offscreen target is not spotlighted');
window.visualViewport = { offsetLeft: 0, offsetTop: 0, width: 375, height: 667 };
target = makeTarget(rect(20, 100, 200, 200));
target.parentElement = { parentElement: document.body, computed: { overflowX: 'hidden', overflowY: 'auto' }, getBoundingClientRect: () => rect(30, 120, 100, 80) };
app.positionTutorialSpot();
assert.equal(parseFloat(spot.style.left), 24);
assert.equal(parseFloat(spot.style.top), 114);
assert.equal(parseFloat(spot.style.width), 112);
assert.equal(parseFloat(spot.style.height), 92, 'scroll-container clipping is respected');
const sizeWrites = [];
card.style = new Proxy(card.style, { set(object, key, value) { if (key === 'width' || key === 'maxHeight') sizeWrites.push(key); object[key] = value; return true; } });
card.scrollHeight = 480;
app.positionTutorialSpot();
assert.equal(sizeWrites.filter(key => key === 'maxHeight').length, 1, 'do not temporarily expand a scrollable card during measurement');
assert.equal(sizeWrites.filter(key => key === 'width').length, 1, 'only apply final card dimensions');
const originalQuery = document.querySelectorAll;
app.tutorialSel = '#classes-nav-item:not(.hidden)';
target = makeTarget(rect(20, 20, 40, 40));
document.querySelectorAll = name => name === '#workspace-tabs [aria-current="page"]' ? [target] : [];
assert.equal(app.tutorialTarget(), target, 'hidden navigation falls back to a visible workspace tab');
document.querySelectorAll = originalQuery;
assert.match(source, /window\.visualViewport\?\.addEventListener\('resize', this\.tutorialResize\)/);
assert.match(source, /window\.removeEventListener\('orientationchange', this\.tutorialResize\)/);
assert.match(source, /this\.tutorialObserver\?\.disconnect\(\)/);
console.log('Tutorial: six viewport sizes, exact padded highlights, non-overlapping clamped cards, zoom/keyboard offsets, clipping and hidden-nav fallback passed.');
