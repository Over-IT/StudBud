(function (window) {
    'use strict';

    const STORAGE_KEY = 'studbud-sfx';
    const defaults = { volume: 0.7, ui: true, game: true, music: true, musicVolume: 0.5, musicStyle: 'auto' };

    // Original two-bar phrases played with decaying acoustic-style instruments.
    const MUSIC = {
        summit: { name: 'Rooftop Rush', bpm: 144, drive: true, upbeat: true, chords: [[60, 0], [55, 0], [57, 1], [53, 0]], voice: 'bright',
            melody: [0, 2, 3, 4, 3, null, 2, 3, 4, 3, 2, 1, 2, 3, 1, 0] },
        foundry: { name: 'Foundry Motion', bpm: 120, drive: true, chords: [[50, 1], [58, 0], [53, 0], [48, 0]], voice: 'marimba',
            melody: [0, null, 2, 0, 3, 2, null, 4, 3, 1, null, 2, 1, 0, 2, null] },
        starlight: { name: 'Starlight Drift', bpm: 78, quiet: true, chords: [[60, 0], [55, 0], [57, 1], [53, 0]], voice: 'piano',
            melody: [0, null, null, 3, null, 2, null, null, 4, null, null, 2, null, 1, 0, null] },
        lagoon: { name: 'Lagoon Breeze', bpm: 88, swing: .1, chords: [[60, 0], [57, 1], [53, 0], [55, 0]], voice: 'marimba',
            melody: [2, null, 3, 4, 2, null, 1, null, 0, 1, 2, null, 1, null, 0, null] },
        bazaar: { name: 'Bazaar Bounce', bpm: 110, swing: .12, chords: [[62, 0], [67, 0], [59, 1], [57, 0]], voice: 'guitar',
            melody: [0, 2, null, 3, 2, 1, null, 2, 3, null, 4, 3, 2, null, 0, null] },
        cavern: { name: 'Crystal Cavern', bpm: 76, chords: [[52, 1], [48, 0], [55, 0], [50, 1]], voice: 'piano', quiet: true,
            melody: [0, null, null, 2, null, 3, null, null, 4, null, 2, null, 1, null, 0, null] },
        battle: { name: 'Battle Drive', bpm: 116, chords: [[52, 1], [48, 0], [55, 0], [50, 0]], voice: 'piano',
            melody: [0, 0, 2, null, 3, 2, 1, null, 2, 3, 4, null, 3, 1, 0, null] },
        neon: { name: 'Neon Exchange', bpm: 94, swing: .14, chords: [[57, 1], [53, 0], [48, 0], [55, 0]], voice: 'piano',
            melody: [2, null, 1, 0, null, 2, 3, null, 4, null, 3, 2, null, 1, 0, null] },
        fortress: { name: 'Twin Citadels', bpm: 96, chords: [[50, 1], [46, 0], [53, 0], [48, 0]], voice: 'guitar',
            melody: [0, null, 2, 3, 4, null, 3, 2, 1, null, 2, null, 0, null, null, null] },
        sunrise: { name: 'Sunrise Run', bpm: 108, chords: [[60, 0], [67, 0], [57, 1], [65, 0]], voice: 'piano',
            melody: [0, 1, 2, null, 4, 3, null, 2, 3, 4, null, 3, 2, 1, 0, null] },
        midnight: { name: 'Midnight Drive', bpm: 88, swing: .18, chords: [[57, 1], [53, 0], [60, 0], [55, 0]], voice: 'piano',
            melody: [0, null, 2, null, 3, 2, null, 1, 2, null, 4, 3, null, 1, 0, null] },
        pixel: { name: 'Pixel Quest', bpm: 120, chords: [[60, 0], [57, 1], [53, 0], [55, 0]], voice: 'marimba',
            melody: [0, 2, 3, null, 4, 3, 2, null, 1, 2, 3, 1, 0, null, 0, null] },
        zen: { name: 'Zen Garden', bpm: 68, chords: [[62, 0], [59, 1], [55, 0], [57, 0]], voice: 'piano', quiet: true,
            melody: [0, null, null, 2, null, null, 3, null, 2, null, 1, null, 0, null, null, null] },
        funk: { name: 'Funky Groove', bpm: 104, swing: .16, chords: [[57, 1], [62, 1], [57, 1], [64, 1]], voice: 'guitar',
            melody: [0, null, 2, 3, null, 2, 1, null, 2, null, 3, 4, null, 2, 0, null] },
        orbit: { name: 'Orbit Station', bpm: 102, chords: [[50, 1], [46, 0], [53, 0], [48, 0]], voice: 'piano',
            melody: [0, 2, null, 3, 4, null, 3, null, 2, 1, null, 2, 0, null, null, null] },
        tropic: { name: 'Tropic Sunset', bpm: 94, swing: .1, chords: [[65, 0], [62, 1], [58, 0], [60, 0]], voice: 'marimba',
            melody: [2, null, 3, 2, 1, null, 0, null, 1, 2, null, 4, 3, 1, 0, null] },
        stadium: { name: 'Stadium Anthem', bpm: 112, chords: [[55, 0], [60, 0], [62, 0], [60, 0]], voice: 'piano',
            melody: [0, 0, 2, null, 3, null, 4, null, 4, 3, 2, null, 1, 2, 0, null] },
        frenzy: { name: 'Feeding Frenzy', bpm: 118, swing: .08, chords: [[62, 1], [65, 0], [60, 0], [57, 1]], voice: 'marimba',
            melody: [0, 2, null, 4, 3, null, 2, 1, 2, null, 3, 4, null, 2, 1, 0] },
        survival: { name: 'Last Light', bpm: 100, chords: [[45, 1], [53, 0], [50, 1], [52, 0]], voice: 'guitar',
            melody: [0, null, 0, 2, null, 1, null, 3, 2, null, 4, null, 3, 1, null, 0] }
    };
    const MODE_STYLE = { skyline: 'summit', river: 'lagoon', market: 'bazaar', miner: 'cavern', duel: 'battle', shooter: 'orbit',
        sports: 'stadium', crypto: 'neon', defense: 'fortress', chess: 'zen', hack: 'midnight', frenzy: 'frenzy', fishing: 'tropic',
        classic: 'sunrise', rush: 'pixel', survival: 'survival' };

    // Every sound is synthesized on the fly, so there are no audio files to load.
    const RECIPES = {
        click: c => { c.tone('triangle', 720, 460, 0.06, 0.16); c.tone('sine', 1440, 920, 0.03, 0.05); },
        tick: c => { c.tone('sine', 920, 880, 0.04, 0.1); },
        toggle: c => { c.tone('triangle', 520, 780, 0.08, 0.12); c.tone('sine', 1040, 1560, 0.06, 0.04, 0.02); },
        success: c => { [660, 880, 1320].forEach((f, i) => c.chime(f, 0.26, 0.17, i * 0.09)); },
        error: c => { c.wood(220, .18, .14); c.wood(165, .2, .12, .12); },
        buy: c => { c.chime(988, 0.12, 0.12); c.chime(1318, 0.22, 0.12, 0.07); c.noise(0.05, 0.03, 6000); },
        coin: c => { c.chime(1046, 0.1, 0.1); c.chime(1568, 0.3, 0.1, 0.06); },
        open: c => { c.tone('sine', 220, 880, 0.5, 0.2); c.noise(0.4, 0.06, 2500); c.chime(1318, 0.4, 0.14, 0.42); },
        question: c => { c.chime(520, 0.12, 0.14); c.chime(780, 0.16, 0.14, 0.09); },
        correct: c => { [523, 659, 784, 1046].forEach((f, i) => c.chime(f, i === 3 ? 0.35 : 0.14, 0.18, i * 0.07)); },
        wrong: c => { c.pluck(196, .3, .14); c.pluck(147, .3, .12, .12); },
        refill: c => { [330, 440, 660].forEach((f, i) => c.pluck(f, .3, .14, i * .08)); },
        jump: c => { c.jumpSound(false); },
        doubleJump: c => { c.jumpSound(true); },
        spring: c => { c.springJump(); },
        dash: c => { c.whoosh(); },
        act: c => { c.wood(360, .055, .07); },
        shoot: c => { c.noise(.055, .085, 2200); c.tone('sine', 150, 65, .07, .1); },
        hit: c => { c.noise(.065, .075, 850); c.tone('sine', 120, 55, .1, .13); },
        burn: c => {
            c.noise(.24, .075, 1800);
            c.noise(.045, .12, 3400);
            c.noise(.065, .085, 2800, .065);
            c.noise(.085, .055, 2200, .15);
        },
        pop: c => { c.tone('sine', 560, 200, 0.09, 0.15); c.noise(0.03, 0.05, 5000); },
        boom: c => { c.noise(0.6, 0.24, 520); c.tone('sine', 85, 38, .28, .2); },
        splash: c => { c.noise(.1, .13, 4200); c.noise(.35, .09, 1200, .025); },
        countdown: c => { c.chime(660, 0.16, 0.2); },
        go: c => { c.chime(990, 0.5, 0.24); c.chime(1320, 0.5, 0.14, 0.02); c.tone('triangle', 495, 495, 0.4, 0.1); },
        powerup: c => { [392, 523, 659].forEach((f, i) => c.pluck(f, .35, .15, i * .08)); },
        win: c => { [523, 659, 784, 1046].forEach((f, i) => c.chime(f, 0.26, 0.2, i * 0.12)); c.chime(1318, 0.7, 0.2, 0.5); c.chime(659, 0.7, 0.1, 0.5); },
        lose: c => { [392, 330, 262].forEach((f, i) => c.tone('triangle', f, f * 0.95, 0.32, 0.18, i * 0.2)); },
        swing: [
            c => { c.whoosh(.16, .055); },
            c => { c.whoosh(.19, .05); }
        ],
        pickup: c => { c.chime(784, 0.1, 0.12); c.chime(1175, 0.18, 0.12, 0.06); c.tone('triangle', 392, 784, 0.12, 0.05); },
        reload: c => { c.wood(540, .04, .07); c.wood(380, .05, .08, .12); c.noise(.05, .04, 3000, .12); },
        score: c => { [659, 784, 988, 1319].forEach((f, i) => c.chime(f, 0.18, 0.15, i * 0.06)); c.tone('triangle', 330, 660, 0.3, 0.08); },
        whoosh: c => { c.whoosh(); }
    };
    Object.assign(RECIPES, {
        mine: c => { c.noise(.035, .16, 4200); c.noise(.11, .065, 1000, .015);
            c.tone('sine', 1280, 1280, .045, .035); c.tone('sine', 2176, 2176, .03, .018); },
        dig: c => { c.noise(.065, .13, 650); c.noise(.16, .07, 1700, .025); },
        rockBreak: c => { c.noise(.065, .17, 3200); c.noise(.22, .1, 850, .035); c.noise(.09, .065, 1800, .1); },
        crystal: c => { [1175, 1568, 2093].forEach((f, i) => c.chime(f, .25, .07, i * .04)); },
        cast: c => { c.noise(.18, .07, 2300); },
        catch: c => { c.noise(.12, .07, 1700); c.chime(784, .12, .1); c.chime(1175, .24, .1, .08); },
        wave: c => { c.noise(1.1, .17, 600); c.noise(.75, .08, 2600, .15); },
        whirlpool: c => { c.whoosh(.7, .1); c.noise(.8, .09, 700); },
        towerBuild: c => { c.wood(180, .12, .1); c.wood(280, .1, .09, .07); c.noise(.06, .04, 1400); },
        towerUpgrade: c => { [440, 660, 880].forEach((f, i) => c.chime(f, .24, .1, i * .07)); },
        towerShot: c => { c.noise(.09, .06, 2300); c.wood(270, .07, .06); },
        cannon: c => { c.noise(.3, .13, 650); c.tone('sine', 130, 40, .26, .15); },
        zap: c => { c.noise(.12, .06, 4500); c.tone('sawtooth', 1100, 250, .15, .07); },
        enemySend: c => { c.wood(140, .12, .09); c.wood(190, .12, .07, .09); },
        baseHit: c => { c.noise(.4, .15, 550); c.tone('sine', 90, 35, .35, .18); c.chime(220, .12, .09); }
    });
    // Jingles and alerts keep their exact pitch
    const NO_PITCH_SHIFT = new Set(['success', 'win', 'lose', 'go', 'countdown', 'score', 'error', 'jump', 'doubleJump', 'spring']);
    // Extra variants for sounds that play over and over
    Object.assign(RECIPES, {
        click: [RECIPES.click, c => { c.tone('sine', 880, 620, 0.05, 0.15); c.tone('triangle', 1760, 1200, 0.025, 0.04); }, c => { c.tone('triangle', 640, 420, 0.07, 0.15); c.noise(0.015, 0.03, 6000); }],
        shoot: [RECIPES.shoot, c => { c.noise(.07, .12, 3700); c.wood(155, .08, .09); }],
        hit: [RECIPES.hit, c => { c.noise(.1, .16, 1400); c.wood(135, .12, .14); }],
        pop: [RECIPES.pop, c => { c.tone('triangle', 700, 260, 0.08, 0.14); c.noise(0.025, 0.05, 6000); }, c => { c.tone('sine', 440, 160, 0.1, 0.15); c.tone('sine', 880, 320, 0.05, 0.05); }],
        correct: [RECIPES.correct, c => { [587, 740, 880, 1175].forEach((f, i) => c.chime(f, i === 3 ? 0.35 : 0.14, 0.18, i * 0.07)); }, c => { [440, 554, 659, 880].forEach((f, i) => c.chime(f, i === 3 ? 0.35 : 0.14, 0.18, i * 0.07)); }],
        wrong: [RECIPES.wrong, c => { c.wood(220, .2, .13); c.wood(165, .24, .11, .12); }],
        coin: [RECIPES.coin, c => { c.chime(1175, 0.1, 0.1); c.chime(1760, 0.3, 0.1, 0.06); }],
        boom: [RECIPES.boom, c => { c.noise(0.7, 0.3, 380); c.tone('sine', 100, 30, 0.6, 0.34); }],
        splash: [RECIPES.splash, c => { c.noise(.08, .13, 3400); c.noise(.38, .1, 1500, .025); }]
    });

    // Interface sounds: each kind of control gets its own voice, with variants so repeats never feel identical
    Object.assign(RECIPES, {
        nav: [
            c => { c.tone('sine', 380, 760, 0.12, 0.13); c.noise(0.08, 0.04, 2400); },
            c => { c.tone('triangle', 420, 840, 0.11, 0.12); c.chime(1260, 0.12, 0.05, 0.05); },
            c => { c.tone('sine', 340, 680, 0.13, 0.13); c.tone('sine', 1020, 1360, 0.07, 0.04, 0.04); }
        ],
        tab: [
            c => { c.tone('square', 600, 600, 0.03, 0.05); c.tone('triangle', 900, 700, 0.06, 0.1); },
            c => { c.tone('triangle', 760, 620, 0.06, 0.12); c.noise(0.012, 0.03, 7000); },
            c => { c.tone('sine', 680, 540, 0.07, 0.13); c.tone('square', 1360, 1080, 0.02, 0.03); }
        ],
        confirm: [
            c => { c.chime(660, 0.14, 0.13); c.chime(990, 0.22, 0.13, 0.07); },
            c => { c.chime(587, 0.14, 0.13); c.chime(880, 0.24, 0.13, 0.07); },
            c => { c.chime(784, 0.12, 0.12); c.chime(1175, 0.26, 0.12, 0.06); c.tone('triangle', 392, 392, 0.2, 0.05); }
        ],
        danger: [
            c => { c.tone('square', 300, 180, 0.12, 0.1); c.tone('sawtooth', 150, 90, 0.16, 0.08, 0.04); },
            c => { c.tone('triangle', 260, 150, 0.14, 0.13); c.noise(0.07, 0.08, 1200); }
        ],
        close: [
            c => { c.tone('sine', 640, 320, 0.1, 0.13); },
            c => { c.tone('triangle', 560, 280, 0.11, 0.12); c.noise(0.04, 0.04, 2000); }
        ],
        deny: [
            c => { c.tone('square', 180, 150, 0.07, 0.09); c.tone('square', 180, 150, 0.07, 0.09, 0.1); },
            c => { c.tone('sawtooth', 210, 160, 0.1, 0.09); c.tone('sawtooth', 160, 120, 0.1, 0.09, 0.1); }
        ],
        flip: [
            c => { c.noise(0.12, 0.1, 3200); c.tone('triangle', 300, 520, 0.1, 0.07); },
            c => { c.noise(0.14, 0.09, 2600); c.tone('sine', 260, 460, 0.12, 0.07); }
        ],
        typeKey: [
            c => { c.tone('square', 1500, 1200, 0.018, 0.035); },
            c => { c.tone('triangle', 1300, 1000, 0.02, 0.05); },
            c => { c.tone('square', 1700, 1300, 0.015, 0.03); c.noise(0.008, 0.02, 7000); }
        ],
        enter: [
            c => { c.tone('triangle', 520, 520, 0.05, 0.1); c.tone('sine', 780, 780, 0.08, 0.09, 0.05); },
            c => { c.tone('triangle', 480, 480, 0.05, 0.1); c.tone('sine', 720, 960, 0.09, 0.09, 0.05); }
        ],
        slide: [
            c => { c.tone('sine', 700, 700, 0.025, 0.07); },
            c => { c.tone('triangle', 820, 820, 0.025, 0.07); }
        ],
        hover: [c => { c.tone('sine', 1100, 1200, 0.025, 0.025); }]
    });
    Object.assign(RECIPES, {
        toggle: [RECIPES.toggle, c => { c.tone('square', 480, 720, 0.06, 0.07); c.chime(1200, 0.08, 0.05, 0.03); }]
    });
    Object.assign(RECIPES, { tick: [RECIPES.tick, c => { c.tone('triangle', 840, 780, 0.04, 0.1); }] });

    class Sfx {
        constructor() {
            this.ctx = null;
            this.master = null;
            this.last = {};
            this.settings = { ...defaults };
            try { Object.assign(this.settings, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch (error) { /* use defaults */ }
            // Browsers keep audio suspended until the player interacts, so resume on the next input.
            ['pointerdown', 'keydown', 'touchstart'].forEach(name => window.addEventListener(name, () => {
                if (this.ctx && this.ctx.state !== 'running') this.ctx.resume?.().catch(() => { });
            }, { passive: true }));
        }

        save() {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch (error) { /* storage unavailable */ }
        }

        update(patch) {
            Object.assign(this.settings, patch);
            this.save();
            if ('musicVolume' in patch) this.applyMusicLevel();
            if (patch.music === false) this.stopMusic();
            else if (patch.music === true && this.activeMode && !this.mus) this.startMusic(this.activeMode);
            else if ('musicStyle' in patch && this.activeMode) this.startMusic(this.activeMode);
        }

        applyMusicLevel() {
            if (!this.musicGain) return;
            const g = this.musicGain.gain, t = this.ctx.currentTime;
            g.cancelScheduledValues(t);
            g.setValueAtTime(g.value, t);
            g.setTargetAtTime(Math.pow(this.settings.musicVolume, 1.4), t, 0.05);
        }

        styleFor(mode) {
            const chosen = this.settings.musicStyle;
            if (mode === 'skyline' && !MUSIC[chosen]) return this.musicBiome === 3 ? 'starlight' : this.musicBiome === 1 ? 'foundry' : 'summit';
            return MUSIC[chosen] ? chosen : (MODE_STYLE[mode] || 'summit');
        }

        setMusicBiome(mode, biome) {
            if (window.StudBudArcade?.previewDepth > 0 || this.activeMode !== mode || this.musicBiome === biome) return;
            this.musicBiome = biome;
            if (this.mus) this.startMusic(mode);
        }

        // mode is a game id (or a style id for previews); restarts only when the style changes.
        // Call when a match ends: stops the music and forgets the active mode so settings changes don't restart it.
        endMusic() { this.activeMode = null; this.musicBiome = null; this.stopMusic(); }

        makeReverb(seconds, decay) {
            const ctx = this.ctx, length = Math.floor(ctx.sampleRate * seconds);
            const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const data = impulse.getChannelData(ch);
                for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
            const convolver = ctx.createConvolver();
            convolver.buffer = impulse;
            return convolver;
        }

        startMusic(mode, forceRestart = false) {
            if (window.StudBudArcade?.previewDepth > 0) return;
            if (MODE_STYLE[mode]) this.activeMode = mode;
            if (!this.settings.music || !this.settings.musicVolume || !this.unlock()) return;
            const style = MODE_STYLE[mode] ? this.styleFor(mode) : MUSIC[mode] ? mode : this.styleFor(mode);
            if (this.mus && this.mus.style === style && !forceRestart) return;
            this.stopMusic();
            if (!this.musicGain) {
                this.musicGain = this.ctx.createGain();
                this.musicGain.gain.value = 0.0001;
                const comp = this.ctx.createDynamicsCompressor();
                this.musicGain.connect(comp); comp.connect(this.ctx.destination);
                const length = this.ctx.sampleRate;
                this.noiseBuf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
                const data = this.noiseBuf.getChannelData(0);
                for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
                this.fxIn = this.ctx.createGain();
                const reverb = this.makeReverb(.85, 3), wet = this.ctx.createGain();
                wet.gain.value = .14;
                this.fxIn.connect(reverb); reverb.connect(wet); wet.connect(this.musicGain);
            }
            this.applyMusicLevel();
            this.mus = { style, step: 0, next: this.ctx.currentTime + 0.15, timer: setInterval(() => this.pumpMusic(), 60) };
        }

        stopMusic() {
            if (!this.mus) return;
            clearInterval(this.mus.timer);
            this.mus = null;
            for (const source of this.musicSources || []) source.stop(this.ctx.currentTime + .03);
            this.musicSources?.clear();
            if (this.musicGain) {
                const g = this.musicGain.gain, t = this.ctx.currentTime;
                g.cancelScheduledValues(t); g.setValueAtTime(Math.max(g.value, 0.0001), t); g.exponentialRampToValueAtTime(0.0001, t + 0.25);
            }
        }

        pumpMusic() {
            const m = this.mus;
            if (!m) return;
            if (this.ctx.state !== 'running') { this.ctx.resume?.().catch(() => { }); m.next = this.ctx.currentTime + 0.1; return; }
            const T = MUSIC[m.style], spb = 60 / T.bpm / 4, now = this.ctx.currentTime;
            if (m.next < now - 0.3) m.next = now + 0.05;
            while (m.next < now + 0.7) { this.musicStep(T, m.step, m.next, spb); m.next += spb; m.step++; }
        }

        musicStep(T, step, t0, spb) {
            const s = step % 16, barIndex = Math.floor(step / 16);
            const section = Math.floor(barIndex / 8) % 4;
            const changes = [0, 1, 2, 3, 0, 2, 1, 3, 2, 1, 0, 3, 0, 1, 3, 0];
            const [root, minor] = T.chords[changes[Math.floor(barIndex / 2) % changes.length] % T.chords.length];
            const melody = section === 1 ? T.melody.map((_, i) => T.melody[(i + 8) % 16])
                : section === 2 ? T.melody.map((degree, i) => i % 3 === 1 || degree === null ? null : 4 - degree) : T.melody;
            const t = t0 + (s % 4 === 2 ? spb * (T.swing || 0) : 0);
            const hz = n => 440 * Math.pow(2, (n - 69) / 12);
            const sparse = (section === 2 && !T.drive) || T.quiet;
            const chord = [root, root + (minor ? 3 : 4), root + 7];
            if (T.upbeat ? s % 4 === 2 : s === 0 || (!sparse && s === 8)) {
                const accompaniment = T.upbeat ? 'bright' : section === 1 && T.voice === 'guitar' ? 'piano' : 'guitar';
                chord.forEach((n, i) => this.acousticNote(hz(n + (section === 2 ? 12 : 0)), spb * (T.upbeat ? 1.3 : sparse ? 10 : 7), T.upbeat ? .085 : .065, t + i * (T.upbeat ? .004 : .018), accompaniment, this.musicGain));
            }
            if (T.upbeat ? s % 2 === 0 : s === 0 || s === 8) {
                const bass = root - 12 + (T.upbeat ? [0, 0, 7, 12, 0, 7, 12, 7][s / 2] : s === 8 ? section === 1 ? 12 : 7 : 0);
                this.acousticNote(hz(bass), spb * (T.upbeat ? 1.5 : 5), T.upbeat ? .24 : .21, t, 'bass', this.musicGain);
            }
            if (s % 2 === 0 && (T.upbeat || barIndex > 0)) {
                const index = (barIndex % 2) * 8 + s / 2, degree = melody[index];
                if (degree !== null) {
                    const scale = minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
                    let note = root + 12 + scale[degree];
                    if (this.mus?.lastNote !== undefined) {
                        while (note - this.mus.lastNote > 7 && note > 64) note -= 12;
                        while (this.mus.lastNote - note > 7 && note < 76) note += 12;
                    }
                    if (this.mus) this.mus.lastNote = note;
                    const held = T.upbeat ? 1.35 : melody[(index + 1) % 16] === null ? 3.6 : 1.8;
                    const voice = section === 2 && T.voice !== 'piano' && !T.upbeat ? 'piano' : T.voice;
                    this.acousticNote(hz(note), spb * held, T.upbeat ? .22 : T.quiet ? .14 : section === 3 ? .17 : .19, t, voice, this.musicGain);
                }
            }
            if (!T.quiet && (s === 0 || (!sparse && (s === 8 || (T.drive && s % 4 === 0))))) this.musicKick(t);
            if (!sparse && (s === 4 || s === 12)) {
                this.acousticNote(170, .09, .075, t, 'marimba', this.musicGain);
                this.musicNoise(t, T.upbeat ? .11 : .085, T.upbeat ? .075 : .035, T.upbeat ? 2200 : 1400, 'bandpass');
            }
            if (!sparse && s % (T.drive ? 2 : 4) === (T.drive ? 1 : 2)) this.musicNoise(t, .045, .018, 3600, 'highpass');
        }

        acousticBuffer(voice) {
            this.instrumentBuffers ||= new Map();
            if (this.instrumentBuffers.has(voice)) return this.instrumentBuffers.get(voice);
            const profiles = {
                guitar: { ratios: [1, 2, 3, 4, 5, 6], weights: [1, .42, .21, .1, .05, .025], decay: 2.1, attack: .004 },
                piano: { ratios: [1, 2.001, 3.004, 4.01], weights: [1, .32, .13, .045], decay: 1.7, attack: .009 },
                marimba: { ratios: [1, 4, 9], weights: [1, .09, .012], decay: 5.5, attack: .003 },
                bass: { ratios: [1, 2, 3], weights: [1, .24, .055], decay: 2.5, attack: .012 },
                bright: { ratios: [1, 2, 3, 4, 5], weights: [1, .65, .38, .18, .08], decay: 3.2, attack: .003 }
            };
            const profile = profiles[voice];
            if (!profile) throw new Error(`Unknown acoustic voice: ${voice}`);
            const ctx = this.ctx, buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 3), ctx.sampleRate);
            const data = buffer.getChannelData(0), weight = profile.weights.reduce((a, b) => a + b, 0);
            for (let i = 0; i < data.length; i++) {
                const time = i / ctx.sampleRate;
                let sample = 0;
                for (let partial = 0; partial < profile.ratios.length; partial++) {
                    sample += Math.sin(2 * Math.PI * 220 * profile.ratios[partial] * time)
                        * profile.weights[partial] * Math.exp(-time * (profile.decay + partial * 1.6));
                }
                data[i] = sample / weight * Math.min(1, time / profile.attack) * Math.min(1, (data.length - i - 1) / (ctx.sampleRate * .02));
            }
            this.instrumentBuffers.set(voice, buffer);
            return buffer;
        }

        acousticNote(freq, dur, vol, t, voice, destination) {
            const ctx = this.ctx, source = ctx.createBufferSource(), gain = ctx.createGain();
            source.buffer = this.acousticBuffer(voice);
            source.playbackRate.setValueAtTime(freq / 220, t);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(vol, t + .006);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            source.connect(gain); gain.connect(destination);
            if (destination === this.musicGain && this.fxIn) {
                const send = ctx.createGain(); send.gain.value = .12;
                gain.connect(send); send.connect(this.fxIn);
            }
            source.start(t);
            if (destination === this.musicGain) this.finishMusicSource(source, t + dur + .03);
            else source.stop(t + dur + .03);
        }

        finishMusicSource(source, end) {
            this.musicSources ||= new Set();
            this.musicSources.add(source);
            source.onended = () => this.musicSources.delete(source);
            source.stop(end);
        }

        musicKick(t) {
            const ctx = this.ctx, osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.frequency.setValueAtTime(90, t); osc.frequency.exponentialRampToValueAtTime(52, t + 0.06);
            gain.gain.setValueAtTime(0.16, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
            osc.connect(gain); gain.connect(this.musicGain); osc.start(t); this.finishMusicSource(osc, t + 0.18);
        }

        musicNoise(t, dur, vol, cutoff, type) {
            const ctx = this.ctx, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
            src.buffer = this.noiseBuf;
            filter.type = type; filter.frequency.setValueAtTime(cutoff, t);
            gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            src.connect(filter); filter.connect(gain); gain.connect(this.musicGain);
            src.start(t, Math.random() * 0.5); this.finishMusicSource(src, t + dur + 0.02);
        }

        unlock() {
            if (!this.ctx) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return false;
                this.ctx = new Ctx();
                this.master = this.ctx.createGain();
                const comp = this.ctx.createDynamicsCompressor();
                this.master.connect(comp); comp.connect(this.ctx.destination);
                // A short reverb tail gives effects some space
                this.verbIn = this.ctx.createGain();
                this.verbIn.gain.value = 0.22;
                const verb = this.makeReverb(0.7, 3);
                this.verbIn.connect(verb); verb.connect(this.master);
            }
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return true;
        }

        // category is 'ui' or 'game'; sounds in a muted category are skipped.
        play(name, category = 'ui', minGapMs = 45, volume = 1) {
            if (window.StudBudArcade?.previewDepth > 0) return;
            const s = this.settings;
            if (!s.volume || !s[category] || !RECIPES[name] || !Number.isFinite(volume) || volume <= 0 || !this.unlock()) return;
            const now = performance.now();
            if (now - (this.last[name] || 0) < minGapMs) return;
            this.last[name] = now;
            this.master.gain.setValueAtTime(Math.pow(s.volume, 1.6), this.ctx.currentTime);
            // Repeated sounds get a random variant and a slight pitch shift so they never feel mechanical
            let recipe = RECIPES[name];
            if (Array.isArray(recipe)) recipe = recipe[Math.floor(Math.random() * recipe.length)];
            this.pitch = NO_PITCH_SHIFT.has(name) ? 1 : 0.93 + Math.random() * 0.14;
            if (volume < 1) {
                this.effectOut = this.ctx.createGain();
                this.effectOut.gain.value = volume;
                this.effectOut.connect(this.master);
            }
            try { recipe(this); } finally { this.pitch = 1; this.effectOut = null; }
        }

        tone(type, from, to, dur, vol, delay = 0) {
            const ctx = this.ctx;
            const t = ctx.currentTime + delay;
            const shift = this.pitch || 1;
            from *= shift; to *= shift;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(from, t);
            if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(gain);
            gain.connect(this.effectOut || this.master);
            if (this.verbIn && dur > 0.1) {
                if (this.effectOut) {
                    const send = ctx.createGain(); send.gain.value = this.effectOut.gain.value;
                    gain.connect(send); send.connect(this.verbIn);
                } else gain.connect(this.verbIn);
            }
            osc.start(t);
            osc.stop(t + dur + 0.02);
        }

        // Bell-like note: fundamental plus soft overtones
        chime(freq, dur, vol, delay = 0) {
            this.tone('sine', freq, freq, dur, vol, delay);
            this.tone('sine', freq * 2, freq * 2, dur * 0.7, vol * 0.3, delay);
            this.tone('triangle', freq * 3.01, freq * 3.01, dur * 0.4, vol * 0.1, delay);
        }

        pluck(freq, dur, vol, delay = 0) {
            this.acousticNote(freq * (this.pitch || 1), dur, vol, this.ctx.currentTime + delay, 'guitar', this.effectOut || this.master);
        }

        wood(freq, dur, vol, delay = 0) {
            this.acousticNote(freq * (this.pitch || 1), dur, vol, this.ctx.currentTime + delay, 'marimba', this.effectOut || this.master);
        }

        jumpSound(airborne) {
            const ctx = this.ctx, key = airborne ? 'air' : 'ground', duration = airborne ? .21 : .17;
            this.jumpBuffers ||= new Map();
            if (!this.jumpBuffers.has(key)) {
                const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
                const data = buffer.getChannelData(0);
                let phase = 0, air = 0, seed = 173;
                for (let i = 0; i < data.length; i++) {
                    const t = i / ctx.sampleRate, progress = t / duration;
                    const frequency = (airborne ? 230 : 165) + (airborne ? 330 : 255) * (1 - Math.exp(-progress * 3));
                    phase += 2 * Math.PI * frequency / ctx.sampleRate;
                    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                    air += .16 * (seed / 2147483648 - 1 - air);
                    const envelope = Math.min(1, t / .008) * Math.pow(1 - progress, 2);
                    const push = Math.sin(2 * Math.PI * 85 * t) * Math.exp(-t * 65);
                    data[i] = envelope * (.18 * Math.sin(phase) + .045 * air + (airborne ? 0 : .07 * push));
                }
                this.jumpBuffers.set(key, buffer);
            }
            const source = ctx.createBufferSource();
            source.buffer = this.jumpBuffers.get(key);
            source.connect(this.effectOut || this.master);
            source.start(ctx.currentTime);
            source.stop(ctx.currentTime + duration);
        }

        springJump() {
            const ctx = this.ctx, duration = .48;
            if (!this.springBuffer) {
                const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
                const data = buffer.getChannelData(0);
                let phase = 0;
                for (let i = 0; i < data.length; i++) {
                    const t = i / ctx.sampleRate;
                    const frequency = 155 + 125 * Math.exp(-t * 7) + 65 * Math.sin(t * 2 * Math.PI * 13) * Math.exp(-t * 9);
                    phase += 2 * Math.PI * frequency / ctx.sampleRate;
                    const envelope = (1 - Math.exp(-t * 180)) * Math.exp(-t * 11) * Math.pow(1 - t / duration, 2);
                    data[i] = (Math.sin(phase) + .16 * Math.sin(phase * 2.03)) * envelope * .22;
                }
                this.springBuffer = buffer;
            }
            const source = ctx.createBufferSource();
            source.buffer = this.springBuffer;
            source.connect(this.effectOut || this.master);
            source.start(ctx.currentTime);
            source.stop(ctx.currentTime + duration);
        }

        whoosh(dur = .22, vol = .055) {
            const ctx = this.ctx, t = ctx.currentTime;
            const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
            source.buffer = buffer; filter.type = 'lowpass'; filter.Q.value = .35;
            filter.frequency.setValueAtTime(450, t);
            filter.frequency.exponentialRampToValueAtTime(1200, t + dur * .4);
            filter.frequency.exponentialRampToValueAtTime(400, t + dur);
            gain.gain.setValueAtTime(.0001, t);
            gain.gain.exponentialRampToValueAtTime(vol, t + dur * .35);
            gain.gain.exponentialRampToValueAtTime(.0001, t + dur);
            source.connect(filter); filter.connect(gain); gain.connect(this.effectOut || this.master);
            source.start(t); source.stop(t + dur);
        }

        noise(dur, vol, cutoff, delay = 0) {
            const ctx = this.ctx;
            const t = ctx.currentTime + delay;
            const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            const source = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            source.buffer = buffer;
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(cutoff, t);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            source.connect(filter);
            filter.connect(gain);
            gain.connect(this.effectOut || this.master);
            source.start(t);
        }
    }

    window.StudBudSfx = new Sfx();
    // Pause everything while the tab is hidden so music never plays in the background
    document.addEventListener('visibilitychange', () => {
        const c = window.StudBudSfx.ctx;
        if (!c) return;
        if (document.hidden) c.suspend?.().catch(() => { });
        else if (window.StudBudSfx.mus) c.resume?.().catch(() => { });
    });
    // Browsers keep audio suspended until the user interacts; wake it on the first gesture
    const wake = () => {
        const sfx = window.StudBudSfx;
        if (sfx.ctx && sfx.ctx.state === 'suspended') sfx.ctx.resume();
        else if (!sfx.ctx) sfx.unlock();
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(type => window.addEventListener(type, wake, { passive: true }));

    // ---- Automatic interface sounds: the kind of control decides what plays ----
    const uiSfx = (name, gap) => { try { window.StudBudSfx.play(name, 'ui', gap); } catch (error) { /* audio is optional */ } };
    const TEXT_INPUT = 'input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="password"], input[type="number"], input[type="url"], textarea';
    const DANGER = /\b(delete|remove|clear|reset|discard|ban|sign out|log out|logout|wipe)\b/i;
    const CONFIRM = /\b(save|add|create|submit|import|start|finish|done|apply|sign in|log in|login|register|sign up|change|claim|publish|generate|continue)\b/i;
    const CLOSE = /\b(close|cancel|back|dismiss|no thanks)\b|^[×x✕]$/i;

    function kindOf(el) {
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return 'deny';
        if (el.matches('input[type="checkbox"], input[type="radio"]')) return 'toggle';
        const label = ((el.getAttribute('aria-label') || el.textContent || el.value || '') + ' ' + (el.dataset?.action || '') + ' ' + (el.dataset?.adminAction || '')).trim().slice(0, 80);
        const cls = el.className && typeof el.className === 'string' ? el.className : '';
        if (el.matches('[role="tab"]') || /\b(tab|segment|filter-chip|period-btn)\b/.test(cls)) return 'tab';
        if (el.closest('nav, .sidebar, .nav-list, [role="navigation"]') || /\bnav/.test(cls) || el.dataset?.route || el.dataset?.view) return 'nav';
        if (el.closest('.flashcard, .flip-card, #flashcard-container, [data-flip]') || /\bflip/i.test(label)) return 'flip';
        if (CLOSE.test(label) || /\b(close|dismiss|modal-close)\b/.test(cls)) return 'close';
        if (/\b(danger|destructive|delete)\b/.test(cls) || DANGER.test(label)) return 'danger';
        if (/\bprimary/.test(cls) || CONFIRM.test(label)) return 'confirm';
        return 'click';
    }

    document.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('button, a[href], [role="button"], [role="tab"], summary, input[type="checkbox"], input[type="radio"], label.toggle, .nav-item, .nav-link');
        if (!el || el.closest('canvas, .mpg-pad, [data-action^="multiplayer-"]')) return;
        if (el.tagName === 'LABEL' && el.querySelector('input')) return;
        uiSfx(kindOf(el), 30);
    }, true);

    // Select menus, sliders and typing each have their own small sounds
    document.addEventListener('change', event => {
        const t = event.target;
        if (t instanceof HTMLSelectElement) uiSfx('tick', 30);
    }, true);
    let lastSlider = 0;
    document.addEventListener('input', event => {
        const t = event.target;
        if (t instanceof HTMLInputElement && t.type === 'range') {
            const now = performance.now();
            if (now - lastSlider > 70) { lastSlider = now; uiSfx('slide', 0); }
        }
    }, true);
    document.addEventListener('keydown', event => {
        const t = event.target;
        if (!(t instanceof Element) || !t.matches(TEXT_INPUT) || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === 'Enter') uiSfx('enter', 80);
        else if (event.key.length === 1 || event.key === 'Backspace') uiSfx('typeKey', 35);
    }, true);
})(window);
