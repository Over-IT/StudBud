const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
const documentHandlers = new Map();
let now = 1000, starts = 0, intervals = 0;
const param = () => ({
    value: 0,
    setValueAtTime(value, time) { assert.ok(Number.isFinite(value) && Number.isFinite(time)); this.value = value; },
    exponentialRampToValueAtTime(value, time) { assert.ok(value > 0 && Number.isFinite(time)); this.value = value; },
    setTargetAtTime: noop, cancelScheduledValues: noop
});
const node = () => ({
    connections: [], connect(destination) { this.connections.push(destination); },
    frequency: param(), Q: param(), detune: param(), gain: param(), delayTime: param(), playbackRate: param(),
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
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { getChannelData: channel => data[channel] };
    }
    resume() { return Promise.resolve(); }
}
const sandbox = {
    window: { AudioContext, addEventListener: noop, StudBudArcade: { previewDepth: 0 } },
    document: { addEventListener: (name, handler) => documentHandlers.set(name, handler) }, localStorage: { getItem: () => null },
    performance: { now: () => now }, Math: Object.assign(Object.create(Math), { random: () => 0 }), console,
    setInterval: () => { intervals++; return intervals; }, clearInterval: () => { intervals--; }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sfx.js'), 'utf8'), sandbox);
const sfx = sandbox.window.StudBudSfx;
{
    const tone = sfx.tone, noise = sfx.noise, signatures = new Set();
    try {
        sfx.noise = () => assert.fail('laser weapons should not use noisy gunshot bursts');
        for (const name of ['laserBlaster', 'laserScatter', 'laserRapid', 'laserRail']) {
            const layers = [];
            sfx.tone = (...args) => layers.push(args);
            now += 1000; sfx.play(name, 'game', 0);
            assert.ok(layers.length > 0 && layers.every(args => args[1] > args[2]), 'each weapon produces descending laser sweeps');
            signatures.add(JSON.stringify(layers));
        }
        assert.equal(signatures.size, 4, 'every weapon has its own firing signature');
    } finally { sfx.tone = tone; sfx.noise = noise; }
}
{
    const tones = [], tone = sfx.tone;
    sfx.tone = (...args) => tones.push(args);
    try {
        for (const name of ['quartzBreak', 'amethystBreak', 'emeraldBreak', 'sapphireBreak', 'rubyBreak', 'diamondBreak']) {
            now += 1000; sfx.play(name, 'game', 0);
        }
        assert.equal(tones.length, 6, 'each crystal break uses one accent, not a jingle');
        assert.equal(new Set(tones.map(args => args[1])).size, 6, 'all six crystals have distinct pitches');
        assert.ok(tones.every(args => args[3] <= .12 && args[4] <= .035), 'crystal accents stay brief and quiet');
    } finally { sfx.tone = tone; }
}
assert.ok(!documentHandlers.has('keydown') && !documentHandlers.has('input'), 'typing and slider movement never generate automatic ticking effects');
assert.ok(!documentHandlers.has('click') && !documentHandlers.has('change'), 'ordinary buttons, tabs and menus never add automatic UI effects');
let arrangement;
const musicStep = sfx.musicStep.bind(sfx);
sfx.musicStep = (style, ...args) => { arrangement = style; return musicStep(style, ...args); };
const styles = { skyline: 'summit', river: 'lagoon', market: 'bazaar', miner: 'cavern', duel: 'battle',
    shooter: 'orbit', sports: 'stadium', crypto: 'neon', defense: 'fortress', chess: 'zen',
    hack: 'midnight', frenzy: 'frenzy', fishing: 'tropic', classic: 'sunrise', rush: 'pixel', survival: 'survival' };
assert.equal(new Set(Object.values(styles)).size, Object.keys(styles).length, 'every game has its own default song');
const arrangements = [];
for (const [mode, style] of Object.entries(styles)) {
    assert.equal(sfx.styleFor(mode), style);
    sfx.startMusic(mode, true);
    assert.equal(sfx.mus.style, style);
    const before = starts;
    for (let i = 0; i < 80; i++) { sfx.ctx.currentTime += 1; sfx.pumpMusic(); }
    assert.ok(starts > before, `${mode} produces valid original music throughout its arrangement`);
    arrangements.push(JSON.stringify(arrangement));
    sfx.endMusic(); assert.equal(sfx.mus, null); assert.equal(intervals, 0);
}
assert.equal(new Set(arrangements).size, Object.keys(styles).length, 'games use distinct compositions, not renamed copies');
{
    const used = new Set();
    for (const mode of Object.keys(styles)) {
        for (const biome of mode === 'skyline' ? [0, 1, 3] : [0]) {
            sfx.musicBiome = biome;
            const pool = new Set();
            for (const random of [0, .5, .999]) {
                sfx.endMusic(); sfx.musicBiome = biome;
                sandbox.Math.random = () => random;
                sfx.startMusic(mode);
                const first = sfx.mus.style;
                pool.add(first); used.add(first);
                const same = sfx.mus;
                sfx.startMusic(mode);
                assert.equal(sfx.mus, same, 'ordinary updates never reroll a track');
                sfx.mus.step = 1024; sfx.mus.next = sfx.ctx.currentTime;
                sfx.pumpMusic();
                assert.notEqual(sfx.mus.style, first, 'a complete arrangement rotates without immediately repeating');
                pool.add(sfx.mus.style); used.add(sfx.mus.style);
                const selected = sfx.mus.style;
                sfx.stopMusic(); sfx.startMusic(mode);
                assert.equal(sfx.mus.style, selected, 'mute/resume retains the selected playlist track');
                sfx.pumpMusic();
                if (mode === 'miner' || (mode === 'skyline' && biome === 3)) {
                    assert.ok(arrangement.quiet && arrangement.bpm <= 80, 'all Mining and Space playlist choices remain calm');
                }
                const energetic = ['duel', 'shooter', 'sports', 'frenzy', 'rush', 'survival', 'defense'].includes(mode)
                    || (mode === 'skyline' && biome !== 3);
                if (energetic) {
                    const minimum = mode === 'defense' || mode === 'survival' ? 116 : 120;
                    assert.ok(arrangement.drive && !arrangement.quiet && arrangement.bpm >= minimum,
                        `${mode}/${biome}: every randomized playlist choice keeps an energetic pace`);
                }
            }
            assert.ok(pool.size >= 2, `${mode} has multiple usable tracks`);
        }
    }
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const tracks = [...html.matchAll(/<option value="([^"]+)">[^<]+<\/option>/g)]
        .map(match => match[1]).filter(style => used.has(style));
    assert.equal(used.size, 19, 'every composed song has a gameplay playlist home');
    assert.equal(new Set(tracks).size, 19, 'all gameplay songs are also available for preview');
    sfx.endMusic(); sandbox.Math.random = () => 0;
}
{
    sfx.settings.musicVolume = 0;
    sfx.startMusic('duel');
    assert.equal(sfx.mus, null);
    sfx.update({ musicVolume: .5 });
    assert.ok(sfx.mus, 'raising music volume from zero starts the active game soundtrack');
    sfx.endMusic();
    sfx.startMusic('lagoon');
    sfx.startMusic('river');
    assert.equal(sfx.mus.mode, 'river', 'starting a game with the same track as a preview still enables its playlist rotation');
    sfx.endMusic();
    const wood = sfx.wood;
    sfx.wood = () => assert.fail('landing and hit effects must not introduce wooden ticks');
    try {
        for (const random of [0, .999]) {
            sandbox.Math.random = () => random;
            for (const name of ['hit', 'act']) { now += 1000; sfx.play(name, 'game', 0); }
        }
    } finally { sfx.wood = wood; sandbox.Math.random = () => 0; }
}
for (const name of ['mine', 'rockBreak', 'crystal', 'cast', 'catch', 'wave', 'whirlpool', 'towerBuild', 'towerUpgrade',
    'towerShot', 'cannon', 'zap', 'enemySend', 'baseHit', 'jump', 'doubleJump', 'spring', 'dash', 'burn',
    'shieldBlock', 'shieldParry', 'shieldBreak', 'hammerSwing', 'hammerSpecial', 'hammerHit', 'fighterFall', 'fighterKO', 'hillTick']) {
    const before = starts; now += 1000; sfx.play(name, 'game', 150);
    assert.ok(starts > before, `${name} synthesizes its action sound`);
    const played = starts; sfx.play(name, 'game', 150); assert.equal(starts, played, 'effects are throttled');
}
{
    const buffer = sfx.springBuffer, samples = buffer.getChannelData(0);
    assert.equal(samples.length, Math.floor(sfx.ctx.sampleRate * .48));
    assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) < .26), 'spring launch is bounded and gentle, not a harsh alert');
    const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    assert.ok(rms(samples.slice(80, 800)) > rms(samples.slice(-800)) * 20, 'spring resonance decays naturally instead of sustaining a buzz');
    now += 1000; sfx.play('spring', 'game', 0);
    assert.equal(sfx.springBuffer, buffer, 'spring launch reuses its consistent cached physical resonance');
}
for (const voice of ['guitar', 'piano', 'marimba', 'bass']) {
    const buffer = sfx.acousticBuffer(voice), samples = buffer.getChannelData(0);
    assert.equal(buffer, sfx.acousticBuffer(voice), 'instrument samples are cached rather than regenerated per note');
    assert.ok(samples.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 1), 'instrument samples are finite and normalized');
    const rms = (start, end) => Math.sqrt(samples.slice(start, end).reduce((sum, value) => sum + value * value, 0) / (end - start));
    assert.ok(rms(100, 4000) > rms(samples.length - 4000, samples.length) * 8, 'acoustic notes decay instead of sustaining a synth buzz');
}
const notes = [], acousticNote = sfx.acousticNote.bind(sfx);
sfx.acousticNote = (...args) => { notes.push([args[0], args[1], args[2], args[4]]); acousticNote(...args); };
{
    const percussion = [], musicNoise = sfx.musicNoise;
    sfx.musicNoise = (...args) => percussion.push(args);
    try {
        for (const mode of Object.keys(styles)) {
            sfx.startMusic(mode, true); sfx.pumpMusic();
            notes.length = 0;
            for (let step = 16; step < 32; step++) musicStep(arrangement, step, step * .125, .125);
            assert.ok(!notes.some(note => note[0] === 170 && note[3] === 'marimba'), 'songs never add the wooden ticking backbeat');
            sfx.endMusic();
        }
        assert.equal(percussion.length, 0, 'songs contain no extra snare or high-hat ticking layer');
    } finally {
        sfx.musicNoise = musicNoise;
    }
}
sfx.startMusic('skyline', true);
const sections = [];
for (let section = 0; section < 4; section++) {
    notes.length = 0;
    for (let step = section * 128; step < (section + 1) * 128; step++) musicStep(arrangement, step, sfx.ctx.currentTime + step * .125, .125);
    sections.push(JSON.stringify(notes));
}
assert.equal(new Set(sections).size, 4, 'all four eight-bar sections have distinct composed arrangements');
sfx.endMusic();
{
    const moods = {};
    sfx.startMusic('skyline', true); sfx.pumpMusic();
    moods.city = arrangement;
    const cityTrack = sfx.mus;
    sfx.setMusicBiome('skyline', 0);
    assert.equal(sfx.mus, cityTrack, 'remaining in City never restarts its song');
    sfx.setMusicBiome('skyline', 1); sfx.pumpMusic(); moods.factory = arrangement;
    assert.equal(sfx.mus.style, 'foundry');
    sfx.setMusicBiome('skyline', 3); sfx.pumpMusic(); moods.space = arrangement;
    assert.equal(sfx.mus.style, 'starlight');
    sfx.setMusicBiome('skyline', 0);
    assert.equal(sfx.mus.style, 'summit', 'falling back into City restores its high-energy song');
    assert.ok(moods.city.bpm >= 130 && moods.city.drive && !moods.city.quiet, 'City is explicitly upbeat rather than chill');
    assert.equal(moods.city.voice, 'guitar', 'City returns to its softer guitar arrangement');
    assert.equal(moods.city.bpm, 136, 'City restores the original pace instead of the intensified 144 BPM version');
    for (const section of [0, 1, 2, 3]) {
        notes.length = 0;
        for (let step = section * 128; step < section * 128 + 16; step++) musicStep(moods.city, step, step * .125, .125);
        assert.equal(notes.filter(note => note[3] === 'bass').length, 2, 'City uses the restrained bassline rather than constant eighth notes');
        assert.ok(!notes.some(note => note[3] === 'bright'), 'City no longer uses the bright lead');
    }
    assert.ok(moods.factory.bpm >= 115 && moods.factory.drive, 'Factory keeps a driving mechanical pace');
    assert.ok(moods.space.bpm <= 80 && moods.space.quiet, 'Space uses a calm, sparse arrangement');
    let kicks = 0;
    const kick = sfx.musicKick;
    sfx.musicKick = () => kicks++;
    for (let step = 256; step < 272; step++) musicStep(moods.city, step, step * .125, .125);
    assert.equal(kicks, 4, 'even the City bridge keeps a four-beat pulse instead of becoming ambient');
    kicks = 0;
    for (let step = 256; step < 272; step++) musicStep(moods.space, step, step * .125, .125);
    assert.equal(kicks, 0, 'Space stays free of a driving kick pattern');
    sfx.musicKick = kick;
    sfx.settings.musicStyle = 'zen'; sfx.startMusic('skyline');
    assert.equal(sfx.mus.style, 'summit', 'saved preview tracks never override City');
    sfx.setMusicBiome('skyline', 1);
    assert.equal(sfx.mus.style, 'foundry', 'biome changes ignore the preview track choice');
    sfx.settings.musicStyle = 'auto';
    sfx.stopMusic(); sfx.setMusicBiome('skyline', 3);
    assert.equal(sfx.mus, null, 'biome updates never restart intentionally stopped music');
    sfx.startMusic('skyline');
    assert.equal(sfx.mus.style, 'starlight', 'resuming music uses the current biome');
    sfx.endMusic(); sfx.startMusic('miner'); sfx.pumpMusic();
    assert.ok(arrangement.quiet && arrangement.bpm <= 80, 'Crystal Mining keeps its relaxed pace');
    sfx.setMusicBiome('skyline', 0);
    assert.equal(sfx.mus.style, 'cavern', 'another game cannot change the active game soundtrack');
    sfx.endMusic();
}
{
    const identities = [new Set(), new Set(), new Set(), new Set()];
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    for (const [mode, style] of Object.entries(styles)) {
        assert.ok(html.includes(`value="${style}"`), 'each game song is also available in the track selector');
        sfx.startMusic(mode, true); sfx.pumpMusic();
        for (let section = 0; section < 4; section++) {
            notes.length = 0;
            for (let step = section * 128; step < (section + 1) * 128; step++) musicStep(arrangement, step, sfx.ctx.currentTime + step * .125, .125);
            identities[section].add(JSON.stringify(notes));
        }
        sfx.endMusic();
    }
    assert.ok(identities.every(section => section.size === Object.keys(styles).length),
        'every song keeps its own musical identity through the response, bridge and reprise');
    sfx.settings.musicStyle = 'zen';
    for (const mode of Object.keys(styles)) {
        sfx.startMusic(mode, true);
        assert.equal(sfx.mus.style, styles[mode], 'a saved global track never overrides a game soundtrack');
        assert.equal(sfx.activeMode, mode, 'game IDs that also name a song still retain their active game');
        sfx.endMusic();
    }
    sfx.settings.musicStyle = 'auto';
    sfx.startMusic('zen', true);
    assert.equal(sfx.mus.style, 'zen', 'explicit settings previews can still audition another track');
    sfx.endMusic();
}
{
    const gains = [], createGain = sfx.ctx.createGain;
    sfx.ctx.createGain = function () { const gain = createGain.call(this); gains.push(gain); return gain; };
    now += 1000; sfx.play('success', 'ui', 0, .25);
    assert.equal(gains[0].gain.value, .25); assert.ok(gains[0].connections.includes(sfx.master));
    const sends = gains.filter(gain => gain.connections.includes(sfx.verbIn));
    assert.ok(sends.length > 0 && sends.every(gain => gain.gain.value === .25), 'reverb is attenuated along with each distant effect');
    assert.equal(sfx.master.gain.value, Math.pow(sfx.settings.volume, 1.6), 'per-event volume never lowers the shared master');
    assert.equal(sfx.effectOut, null, 'the next local effect does not inherit remote attenuation');
    sfx.ctx.createGain = createGain;
}
{
    const tone = sfx.tone, whoosh = sfx.whoosh;
    let pitched = 0, air = 0;
    sfx.tone = () => pitched++; sfx.whoosh = () => air++;
    now += 1000; sfx.play('dash', 'game', 0);
    assert.equal(pitched, 0); assert.equal(air, 1, 'dash is a filtered-air whoosh, not an electronic pitch sweep');
    sfx.tone = tone; sfx.whoosh = whoosh;
}
const jumps = new Map();
{
    const noise = sfx.noise, tone = sfx.tone, chime = sfx.chime, bursts = [];
    sfx.noise = (...args) => bursts.push(args);
    sfx.tone = sfx.chime = () => assert.fail('burn damage must sizzle rather than play a musical cue');
    try {
        now += 1000; sfx.play('burn', 'game', 1000);
        assert.equal(bursts.length, 4, 'burn combines a soft hiss with three short crackles');
        assert.ok(bursts.every(([duration, volume, , delay = 0]) => duration + delay <= .25 && volume <= .12), 'burn stays brief and restrained');
        sfx.play('burn', 'game', 1000);
        assert.equal(bursts.length, 4, 'burn cannot stack rapidly');
    } finally {
        sfx.noise = noise; sfx.tone = tone; sfx.chime = chime;
    }
}
for (const [name, key, duration] of [['jump', 'ground', .12], ['doubleJump', 'air', .15]]) {
    now += 1000; notes.length = 0; sfx.play(name, 'game');
    const buffer = sfx.jumpBuffers.get(key), samples = buffer.getChannelData(0);
    assert.equal(notes.length, 0, 'jump uses a dedicated hop rather than a wooden musical note');
    assert.equal(samples.length, Math.floor(sfx.ctx.sampleRate * duration));
    assert.equal(samples[0], 0, 'hop starts smoothly without a click');
    assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) < .12), 'repeated hops stay short and quiet');
    const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    assert.ok(rms(samples.slice(100, 400)) > rms(samples.slice(-200)) * 10, 'hop fades out rather than ringing like a chime');
    const crossings = (start, end) => {
        let count = 0;
        for (let i = start + 1; i < end; i++) if (samples[i - 1] < 0 && samples[i] >= 0) count++;
        return count;
    };
    assert.ok(crossings(450, 750) > crossings(80, 380), 'hop rises in pitch to convey lift');
    now += 1000; sfx.play(name, 'game');
    assert.equal(sfx.jumpBuffers.get(key), buffer, 'repeated jumps reuse the same consistent hop');
    jumps.set(name, JSON.stringify(Array.from(samples)));
}
assert.notEqual(jumps.get('jump'), jumps.get('doubleJump'), 'the air jump has its own recognizable sound');
assert.equal(sfx.musicSources.size, 0, 'ending music cancels all scheduled sources before another track starts');
const before = starts;
sfx.settings.game = false; now += 1000; sfx.play('mine', 'game'); assert.equal(starts, before);
sfx.settings.game = true; sandbox.window.StudBudArcade.previewDepth = 1;
sfx.play('cannon', 'game'); sfx.startMusic('defense');
assert.equal(starts, before); assert.equal(sfx.mus, null, 'previews never start music or effects');
sandbox.window.StudBudArcade.previewDepth = 0; sfx.settings.music = false;
sfx.startMusic('river'); assert.equal(sfx.mus, null, 'music respects player settings');
console.log('All game music mappings/arrangements, action recipes, throttling, mute settings and silent previews passed.');
