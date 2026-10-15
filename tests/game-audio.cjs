const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
let now = 1000, starts = 0, intervals = 0;
const param = () => ({
    value: 0,
    setValueAtTime(value, time) { assert.ok(Number.isFinite(value) && Number.isFinite(time)); this.value = value; },
    exponentialRampToValueAtTime(value, time) { assert.ok(value > 0 && Number.isFinite(time)); this.value = value; },
    setTargetAtTime: noop, cancelScheduledValues: noop
});
const node = () => ({
    connect: noop, frequency: param(), detune: param(), gain: param(), delayTime: param(),
    start() { starts++; }, stop: noop
});
class AudioContext {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = node(); }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBiquadFilter() { return node(); }
    createBufferSource() { return node(); }
    createDynamicsCompressor() { return node(); }
    createDelay() { return node(); }
    createConvolver() { return node(); }
    createBuffer(channels, length) {
        assert.ok(Number.isInteger(length) && length > 0);
        return { getChannelData: () => new Float32Array(length) };
    }
    resume() { return Promise.resolve(); }
}
const sandbox = {
    window: { AudioContext, addEventListener: noop, StudBudArcade: { previewDepth: 0 } },
    document: { addEventListener: noop }, localStorage: { getItem: () => null },
    performance: { now: () => now }, Math, console,
    setInterval: () => { intervals++; return intervals; }, clearInterval: () => { intervals--; }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sfx.js'), 'utf8'), sandbox);
const sfx = sandbox.window.StudBudSfx;
const styles = { skyline: 'summit', river: 'lagoon', market: 'bazaar', miner: 'cavern', duel: 'battle',
    shooter: 'orbit', sports: 'stadium', crypto: 'neon', defense: 'fortress', chess: 'zen',
    hack: 'midnight', frenzy: 'tropic', fishing: 'tropic', classic: 'sunrise', rush: 'pixel', survival: 'battle' };
for (const [mode, style] of Object.entries(styles)) {
    assert.equal(sfx.styleFor(mode), style);
    sfx.startMusic(mode, true);
    assert.equal(sfx.mus.style, style);
    const before = starts;
    for (let i = 0; i < 80; i++) { sfx.ctx.currentTime += 1; sfx.pumpMusic(); }
    assert.ok(starts > before, `${mode} produces valid original music throughout its arrangement`);
    sfx.endMusic(); assert.equal(sfx.mus, null); assert.equal(intervals, 0);
}
for (const name of ['mine', 'rockBreak', 'crystal', 'cast', 'catch', 'wave', 'whirlpool', 'towerBuild', 'towerUpgrade',
    'towerShot', 'cannon', 'zap', 'enemySend', 'baseHit']) {
    const before = starts; now += 1000; sfx.play(name, 'game', 150);
    assert.ok(starts > before, `${name} synthesizes its action sound`);
    const played = starts; sfx.play(name, 'game', 150); assert.equal(starts, played, 'effects are throttled');
}
const before = starts;
sfx.settings.game = false; now += 1000; sfx.play('mine', 'game'); assert.equal(starts, before);
sfx.settings.game = true; sandbox.window.StudBudArcade.previewDepth = 1;
sfx.play('cannon', 'game'); sfx.startMusic('defense');
assert.equal(starts, before); assert.equal(sfx.mus, null, 'previews never start music or effects');
sandbox.window.StudBudArcade.previewDepth = 0; sfx.settings.music = false;
sfx.startMusic('river'); assert.equal(sfx.mus, null, 'music respects player settings');
console.log('All game music mappings/arrangements, action recipes, throttling, mute settings and silent previews passed.');
