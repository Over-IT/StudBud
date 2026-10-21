const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
let allocations = 0;
function context(width = 360, height = 200) {
    const calls = [], stack = [];
    let matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const target = {
        calls, canvas: { width, height },
        isContextLost: () => false,
        getTransform: () => ({ ...matrix }),
        save() { stack.push({ ...matrix }); },
        restore() { matrix = stack.pop(); },
        setTransform(a, b, c, d, e, f) { matrix = { a, b, c, d, e, f }; },
        createLinearGradient() { calls.push(['linear']); return { addColorStop() {} }; },
        createRadialGradient() { calls.push(['radial']); return { addColorStop() {} }; }
    };
    return new Proxy(target, {
        get(obj, key) {
            if (key in obj) return obj[key];
            return (...args) => calls.push([key, ...args, obj.fillStyle]);
        }
    });
}
const surfaces = [];
const sandbox = {
    window: {}, console, Math, Date, Map, Set, performance,
    document: {
        addEventListener() {},
        createElement(tag) {
            assert.equal(tag, 'canvas');
            allocations++;
            const c = context(), surface = { width: 0, height: 0, getContext: () => c };
            surfaces.push(surface);
            return surface;
        }
    }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'multiplayerEngine.js'), 'utf8'), sandbox);
for (const [file, exports] of [
    ['multiplayerGames.js', 'climbBackdrop'],
    ['multiplayerGames2.js', 'mineFog']
]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(source.replace('})(window);', `window.${exports} = ${exports};\n})(window);`), sandbox, { filename: file });
}
const A = sandbox.window.StudBudArcade;
const operations = ctx => ctx.calls.length;
const drawBackdrop = (biome, cam, start = cam.y) => {
    const ctx = context();
    sandbox.window.climbBackdrop(ctx, 360, 200, cam, start, { from: biome, to: biome, amount: 0 }, 1);
    return ctx;
};

const factory = drawBackdrop(1, { x: 0, y: 0 });
assert.ok(operations(factory) < 220, `factory backdrop must skip hidden cells/gears: ${operations(factory)} operations`);
const partialGear = drawBackdrop(1, { x: 850, y: 950 });
assert.ok(partialGear.calls.some(c => c[0] === 'fillRect' && c[1] === -7 && c[3] === 14 && c[4] === 14),
    'gear teeth remain visible when the gear center is just outside the viewport');
const city = drawBackdrop(0, { x: 0, y: -10000 }, 0);
assert.equal(city.calls.filter(c => c[0] === 'rect').length, 0, 'city windows below the viewport are not submitted');
assert.equal(city.calls.filter(c => c[0] === 'fillRect').length, 50, 'hidden city buildings add no fills beyond the 50 gradient bands');
const stars = drawBackdrop(3, { x: -5150, y: -9820 });
const starRects = stars.calls.filter(c => c[0] === 'fillRect' && c[3] <= 3 && c[4] <= 3);
assert.ok(starRects.length > 0);
assert.ok(starRects.every(c => c[1] + c[3] >= 0 && c[1] <= 360 && c[2] + c[4] >= 0 && c[2] <= 200),
    'star cells may straddle the screen but fully hidden stars never draw');

const skyline = Object.create(A.games.skyline.prototype);
skyline.s = { graphics: { low: false } };
skyline.cam = { x: 0, y: 0 };
skyline.viewHeight = 200;
const wall = { x: 0, y: -500000, w: 180, h: 1000000, bi: 1 };
const architecture = context();
skyline.drawArchitecture(architecture, wall, 0, 200);
assert.ok(operations(architecture) < 220, `million-unit wall details stay viewport-bounded: ${operations(architecture)}`);
const stripes = architecture.calls.filter(c => c[0] === 'fillRect' && c[3] === 16 && c[4] === 8);
const expectedStripes = [];
for (let y = wall.y + 22; y < wall.y + wall.h - 10; y += 48) if (y >= -8 && y <= 200) expectedStripes.push(y);
assert.deepEqual(stripes.map(c => c[2]), expectedStripes, 'intersecting tall walls keep the original stripe positions');
const rail = context();
skyline.drawScaleRig(rail, { ...wall, climbRail: true });
assert.ok(operations(rail) < 35, `million-unit rail details stay viewport-bounded: ${operations(rail)}`);
const expectedRungs = [];
for (let y = wall.y + 20; y < wall.y + wall.h; y += 46) if (y >= -27 && y < 220) expectedRungs.push(y);
assert.deepEqual(rail.calls.filter(c => c[0] === 'fillRect' && c[3] === 15 && c[4] === 5).map(c => c[2]), expectedRungs,
    'partially intersecting ladder rungs are retained on the original lattice');

const stops = [[0, 'rgba(255,224,160,.05)'], [.35, 'rgba(2,5,14,.2)'], [1, 'rgba(2,5,14,.7)']];
const miner = {}, fog = context();
const drawFog = (x = 180, y = 100) => sandbox.window.mineFog(miner, fog, x, y, 100, 400, stops, 360, 200);
drawFog();
const initialAllocations = allocations;
fog.calls.length = 0;
for (let frame = 0; frame < 600; frame++) drawFog(180 + Math.sin(frame / 20) * 20, 100 + Math.cos(frame / 20) * 20);
assert.equal(allocations, initialAllocations, '600 moving-light frames reuse the one cached fog surface');
const images = fog.calls.filter(c => c[0] === 'drawImage');
assert.equal(images.length, 600);
assert.ok(images.every(c => c.length === 11 && c[4] * c[5] <= 360 * 200),
    'warm fog blits crop both source and destination to at most the viewport, not the 800x800 sprite');
assert.ok(images.every(c => c[2] >= 0 && c[3] >= 0 && c[2] + c[4] <= 800 && c[3] + c[5] <= 800
    && c[6] >= 0 && c[7] >= 0 && c[6] + c[8] <= 360 && c[7] + c[9] <= 200
    && c[4] === c[8] && c[5] === c[9]), 'fog crops preserve one-to-one source pixel mapping');
assert.equal(fog.calls.filter(c => c[0] === 'radial').length, 0);
assert.equal(miner.fogLayer.canvas.width, 800);
assert.equal(miner.fogLayer.canvas.height, 800);
fog.calls.length = 0;
drawFog(-1000, -1000);
assert.equal(fog.calls.filter(c => c[0] === 'drawImage').length, 0, 'fully offscreen lantern sprites do not blit');
assert.ok(fog.calls.some(c => c[0] === 'fillRect' && c[3] === 360 && c[4] === 200),
    'outer fog still covers the viewport when its center is offscreen');
fog.setTransform(2, 0, 0, 2, 0, 0);
drawFog();
assert.equal(allocations, initialAllocations, 'DPR/zoom rebuilds reuse rather than accumulate fog surfaces');
assert.equal(miner.fogLayer.canvas.width, 1600);
fog.calls.length = 0;
drawFog();
assert.ok(fog.calls.filter(c => c[0] === 'drawImage').every(c => c[4] * c[5] <= 360 * 200),
    'cropping uses physical canvas bounds under DPR transforms');
for (const [x, y] of [[180, 100], [500, 100], [-500, 100], [180, -500], [180, 800]]) {
    fog.setTransform(1, 0, 0, 1, 0, 0);
    drawFog(x, y);
    fog.calls.length = 0;
    drawFog(x, y);
    const coveredArea = fog.calls.reduce((area, c) => area + (c[0] === 'drawImage' ? c[8] * c[9] : c[0] === 'fillRect' ? c[3] * c[4] : 0), 0);
    assert.equal(coveredArea, 360 * 200, 'fog sprite and outer fills cover the viewport exactly once, including offscreen light centers');
}

console.log(`Render operation bounds passed: factory ${operations(factory)}, hidden-city ${operations(city)}, tall-wall ${operations(architecture)}, tall-rail ${operations(rail)}.`);
console.log('600 warm fog frames: 0 allocations/gradients; 72,000 source pixels/blit versus 640,000 uncropped (88.75% fewer submitted pixels). No FPS claim.');
