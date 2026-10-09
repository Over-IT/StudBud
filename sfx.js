(function (window) {
    'use strict';

    const STORAGE_KEY = 'studbud-sfx';
    const defaults = { volume: 0.7, ui: true, game: true, music: true, musicVolume: 0.5, musicStyle: 'auto' };

    // Procedural game music: each style is a chord loop with bass, pad, arpeggio lead and drums (16 steps per bar).
    const MUSIC = {
        summit: { name: 'Summit Run', bpm: 116, chords: [[57, 1], [53, 0], [48, 0], [55, 0]], bass: '1010001010100010', lead: '1011101110111011', arp: [0, 1, 2, 3, 2, 1, 2, 1], leadWave: 'square', bassWave: 'sawtooth', kick: '1000100010001000', snare: '0000100000001000', hat: '0010001000100010' },
        lagoon: { name: 'Lagoon Breeze', bpm: 92, chords: [[60, 0], [57, 1], [53, 0], [55, 0]], bass: '1000001010000010', lead: '1001001010010010', arp: [0, 2, 1, 3, 2, 1], leadWave: 'triangle', bassWave: 'sine', kick: '1000000010000000', snare: '0000100000001000', hat: '1010101010101010' },
        bazaar: { name: 'Bazaar Bounce', bpm: 124, chords: [[62, 0], [67, 0], [57, 1], [67, 0]], bass: '1001001010010010', lead: '1010110110101101', arp: [0, 2, 3, 2, 1, 2], leadWave: 'square', bassWave: 'triangle', kick: '1000100010001000', snare: '0000100000001001', hat: '0110011001100110' },
        cavern: { name: 'Crystal Cavern', bpm: 84, chords: [[52, 1], [48, 0], [55, 0], [50, 1]], bass: '1000000010000000', lead: '0010000100100001', arp: [3, 2, 1, 0, 2, 1], leadWave: 'sine', bassWave: 'sine', kick: '1000000000100000', snare: '0000000010000000', hat: '0000100000001000' },
        battle: { name: 'Battle Drive', bpm: 140, chords: [[52, 1], [52, 1], [55, 0], [50, 0]], bass: '1011101110111011', lead: '1000100110001001', arp: [0, 2, 3, 2, 3, 1], leadWave: 'sawtooth', bassWave: 'sawtooth', kick: '1001100110011001', snare: '0000100000001000', hat: '1111111111111111' },
        neon: { name: 'Neon Exchange', bpm: 108, chords: [[57, 1], [55, 0], [53, 0], [52, 0]], bass: '1100110011001100', lead: '1010101010101010', arp: [0, 1, 2, 3, 3, 2, 1, 0], leadWave: 'square', bassWave: 'square', kick: '1000100010001000', snare: '0000100000001000', hat: '0101010101010101' }
    };
    const MODE_STYLE = { skyline: 'summit', river: 'lagoon', market: 'bazaar', miner: 'cavern', duel: 'battle', shooter: 'orbit', sports: 'stadium', crypto: 'neon' };
    Object.assign(MUSIC, {
        sunrise: { name: 'Sunrise Run', bpm: 128, chords: [[60, 0], [67, 0], [57, 1], [65, 0]], bass: '1010101010101010', lead: '1011011010110110', arp: [0, 1, 2, 3, 2, 1], leadWave: 'triangle', bassWave: 'sawtooth', kick: '1000100010001000', snare: '0000100000001000', hat: '0010001000100010', openHat: '0010001000100010' },
        midnight: { name: 'Midnight Drive', bpm: 100, swing: 0.16, chords: [[57, 1], [53, 0], [60, 0], [55, 0]], bass: '1001001010010010', lead: '1001010010010100', arp: [0, 2, 1, 3, 2, 3, 1, 2], leadWave: 'sawtooth', bassWave: 'sawtooth', kick: '1000000110000010', snare: '0000100000001000', hat: '1010101010101010' },
        pixel: { name: 'Pixel Quest', bpm: 150, chords: [[60, 0], [57, 1], [53, 0], [55, 0]], bass: '1011101110111011', lead: '1111101111101011', arp: [0, 1, 2, 3, 2, 1, 3, 2], leadWave: 'square', bassWave: 'square', kick: '1000100010001000', snare: '0000100000001000', hat: '0101010101010101' },
        zen: { name: 'Zen Garden', bpm: 70, chords: [[62, 0], [59, 1], [55, 0], [57, 0]], bass: '1000000000000000', lead: '1000001000100000', arp: [0, 2, 3, 1, 2], leadWave: 'sine', bassWave: 'sine', kick: '0000000000000000', snare: '0000000000000000', hat: '0000001000000010' },
        funk: { name: 'Funky Groove', bpm: 112, swing: 0.2, chords: [[57, 1], [62, 1], [57, 1], [64, 0]], bass: '1011001010110010', lead: '0010100100101001', arp: [0, 2, 1, 3, 1, 2], leadWave: 'square', bassWave: 'triangle', kick: '1000001010000010', snare: '0000100000001000', hat: '1011101110111011' },
        orbit: { name: 'Orbit Station', bpm: 120, chords: [[50, 1], [46, 0], [53, 0], [48, 0]], bass: '1000100110001001', lead: '1010010110100101', arp: [0, 3, 2, 1, 2, 3], leadWave: 'sawtooth', bassWave: 'square', kick: '1000100010001000', snare: '0000100000001000', hat: '0010001000100011', openHat: '0010001000100010' },
        tropic: { name: 'Tropic Sunset', bpm: 98, swing: 0.1, chords: [[65, 0], [64, 1], [62, 1], [67, 0]], bass: '1000101010001010', lead: '1001001010010010', arp: [0, 1, 2, 1, 3, 2], leadWave: 'triangle', bassWave: 'sine', kick: '1000000010010000', snare: '0000100000001000', hat: '1010101010101010' },
        stadium: { name: 'Stadium Anthem', bpm: 132, chords: [[55, 0], [60, 0], [62, 0], [60, 0]], bass: '1000100010001000', lead: '1001001010010010', arp: [0, 2, 3, 2, 1, 2], leadWave: 'square', bassWave: 'sawtooth', kick: '1000100010001000', snare: '0000100000001000', hat: '0000000000000000', openHat: '0010001000100010' }
    });

    // Every sound is synthesized on the fly, so there are no audio files to load.
    const RECIPES = {
        click: c => { c.tone('triangle', 720, 460, 0.06, 0.16); c.tone('sine', 1440, 920, 0.03, 0.05); },
        tick: c => { c.tone('sine', 920, 880, 0.04, 0.1); },
        toggle: c => { c.tone('triangle', 520, 780, 0.08, 0.12); c.tone('sine', 1040, 1560, 0.06, 0.04, 0.02); },
        success: c => { [660, 880, 1320].forEach((f, i) => c.chime(f, 0.26, 0.17, i * 0.09)); },
        error: c => { c.tone('sawtooth', 220, 140, 0.22, 0.14); c.tone('square', 196, 110, 0.26, 0.08, 0.1); },
        buy: c => { c.chime(988, 0.12, 0.12); c.chime(1318, 0.22, 0.12, 0.07); c.noise(0.05, 0.03, 6000); },
        coin: c => { c.chime(1046, 0.1, 0.1); c.chime(1568, 0.3, 0.1, 0.06); },
        open: c => { c.tone('sine', 220, 880, 0.5, 0.2); c.noise(0.4, 0.06, 2500); c.chime(1318, 0.4, 0.14, 0.42); },
        question: c => { c.chime(520, 0.12, 0.14); c.chime(780, 0.16, 0.14, 0.09); },
        correct: c => { [523, 659, 784, 1046].forEach((f, i) => c.chime(f, i === 3 ? 0.35 : 0.14, 0.18, i * 0.07)); },
        wrong: c => { c.tone('sawtooth', 190, 110, 0.32, 0.16); c.tone('triangle', 95, 60, 0.3, 0.2); },
        refill: c => { c.tone('sine', 330, 990, 0.3, 0.18); c.chime(1320, 0.2, 0.1, 0.25); },
        jump: c => { c.tone('square', 260, 640, 0.14, 0.07); c.tone('triangle', 520, 1280, 0.12, 0.05); },
        dash: c => { c.noise(0.18, 0.12, 2400); c.tone('sawtooth', 300, 760, 0.12, 0.05); },
        act: c => { c.tone('square', 420, 300, 0.05, 0.05); },
        shoot: c => { c.noise(0.1, 0.14, 3600); c.tone('sawtooth', 820, 120, 0.12, 0.1); c.tone('sine', 140, 60, 0.1, 0.12); },
        hit: c => { c.noise(0.14, 0.2, 1000); c.tone('square', 190, 60, 0.15, 0.12); c.tone('sine', 90, 40, 0.18, 0.2); },
        pop: c => { c.tone('sine', 560, 200, 0.09, 0.15); c.noise(0.03, 0.05, 5000); },
        boom: c => { c.noise(0.6, 0.3, 520); c.tone('sine', 120, 36, 0.5, 0.32); c.tone('sawtooth', 80, 30, 0.4, 0.1); },
        splash: c => { c.noise(0.32, 0.14, 1600); c.tone('sine', 740, 280, 0.14, 0.07); },
        countdown: c => { c.chime(660, 0.16, 0.2); },
        go: c => { c.chime(990, 0.5, 0.24); c.chime(1320, 0.5, 0.14, 0.02); c.tone('triangle', 495, 495, 0.4, 0.1); },
        powerup: c => { c.tone('square', 400, 1200, 0.22, 0.08); c.chime(1568, 0.25, 0.1, 0.18); },
        win: c => { [523, 659, 784, 1046].forEach((f, i) => c.chime(f, 0.26, 0.2, i * 0.12)); c.chime(1318, 0.7, 0.2, 0.5); c.chime(659, 0.7, 0.1, 0.5); },
        lose: c => { [392, 330, 262].forEach((f, i) => c.tone('triangle', f, f * 0.95, 0.32, 0.18, i * 0.2)); },
        swing: [
            c => { c.noise(0.16, 0.14, 1800); c.tone('sawtooth', 180, 520, 0.14, 0.06); },
            c => { c.noise(0.2, 0.12, 1200); c.tone('triangle', 140, 420, 0.18, 0.08); }
        ],
        pickup: c => { c.chime(784, 0.1, 0.12); c.chime(1175, 0.18, 0.12, 0.06); c.tone('triangle', 392, 784, 0.12, 0.05); },
        reload: c => { c.tone('square', 300, 300, 0.04, 0.06); c.tone('square', 450, 450, 0.05, 0.06, 0.12); c.noise(0.05, 0.05, 4000, 0.12); },
        score: c => { [659, 784, 988, 1319].forEach((f, i) => c.chime(f, 0.18, 0.15, i * 0.06)); c.tone('triangle', 330, 660, 0.3, 0.08); },
        whoosh: c => { c.noise(0.3, 0.1, 900); c.tone('sine', 200, 900, 0.28, 0.05); }
    };
    // Jingles and alerts keep their exact pitch
    const NO_PITCH_SHIFT = new Set(['success', 'win', 'lose', 'go', 'countdown', 'score', 'error']);
    // Extra variants for sounds that play over and over
    Object.assign(RECIPES, {
        click: [RECIPES.click, c => { c.tone('sine', 880, 620, 0.05, 0.15); c.tone('triangle', 1760, 1200, 0.025, 0.04); }, c => { c.tone('triangle', 640, 420, 0.07, 0.15); c.noise(0.015, 0.03, 6000); }],
        shoot: [RECIPES.shoot, c => { c.noise(0.08, 0.12, 4200); c.tone('square', 960, 160, 0.1, 0.07); c.tone('sine', 160, 70, 0.09, 0.12); }, c => { c.noise(0.12, 0.13, 3000); c.tone('sawtooth', 700, 90, 0.14, 0.09); }],
        hit: [RECIPES.hit, c => { c.noise(0.1, 0.22, 1400); c.tone('triangle', 240, 80, 0.12, 0.14); }, c => { c.noise(0.16, 0.18, 800); c.tone('square', 150, 50, 0.16, 0.1); }],
        pop: [RECIPES.pop, c => { c.tone('triangle', 700, 260, 0.08, 0.14); c.noise(0.025, 0.05, 6000); }, c => { c.tone('sine', 440, 160, 0.1, 0.15); c.tone('sine', 880, 320, 0.05, 0.05); }],
        jump: [RECIPES.jump, c => { c.tone('triangle', 300, 760, 0.13, 0.09); }, c => { c.tone('square', 340, 880, 0.11, 0.06); c.tone('sine', 680, 1500, 0.1, 0.04); }],
        dash: [RECIPES.dash, c => { c.noise(0.22, 0.1, 3000); c.tone('triangle', 260, 900, 0.14, 0.06); }],
        correct: [RECIPES.correct, c => { [587, 740, 880, 1175].forEach((f, i) => c.chime(f, i === 3 ? 0.35 : 0.14, 0.18, i * 0.07)); }, c => { [440, 554, 659, 880].forEach((f, i) => c.chime(f, i === 3 ? 0.35 : 0.14, 0.18, i * 0.07)); }],
        wrong: [RECIPES.wrong, c => { c.tone('square', 220, 120, 0.28, 0.1); c.tone('sawtooth', 110, 70, 0.3, 0.14); }],
        coin: [RECIPES.coin, c => { c.chime(1175, 0.1, 0.1); c.chime(1760, 0.3, 0.1, 0.06); }],
        boom: [RECIPES.boom, c => { c.noise(0.7, 0.3, 380); c.tone('sine', 100, 30, 0.6, 0.34); }],
        splash: [RECIPES.splash, c => { c.noise(0.38, 0.14, 2200); c.tone('sine', 620, 240, 0.16, 0.07); }]
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
            g.setTargetAtTime(Math.pow(this.settings.musicVolume, 1.4) * 2.2, t, 0.05);
        }

        styleFor(mode) {
            const chosen = this.settings.musicStyle;
            return MUSIC[chosen] ? chosen : (MODE_STYLE[mode] || 'summit');
        }

        // mode is a game id (or a style id for previews); restarts only when the style changes.
        // Call when a match ends: stops the music and forgets the active mode so settings changes don't restart it.
        endMusic() { this.activeMode = null; this.stopMusic(); }

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
            if (!MUSIC[mode]) this.activeMode = mode;
            if (!this.settings.music || !this.settings.musicVolume || !this.unlock()) return;
            const style = MUSIC[mode] ? mode : this.styleFor(mode);
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
                // Shared reverb and tempo-synced echo make the synthesized parts sound fuller
                this.fxIn = this.ctx.createGain();
                const reverb = this.makeReverb(2.2, 2.5), wet = this.ctx.createGain();
                wet.gain.value = 0.35;
                this.fxIn.connect(reverb); reverb.connect(wet); wet.connect(this.musicGain);
                this.echoIn = this.ctx.createGain();
                this.echoDelay = this.ctx.createDelay(1.5);
                const feedback = this.ctx.createGain(), echoFilter = this.ctx.createBiquadFilter();
                feedback.gain.value = 0.32; echoFilter.type = 'lowpass'; echoFilter.frequency.value = 2600;
                this.echoIn.connect(this.echoDelay); this.echoDelay.connect(echoFilter);
                echoFilter.connect(feedback); feedback.connect(this.echoDelay); echoFilter.connect(this.musicGain);
            }
            this.echoDelay.delayTime.value = 60 / MUSIC[style].bpm * 0.75;
            this.applyMusicLevel();
            this.mus = { style, step: 0, next: this.ctx.currentTime + 0.15, timer: setInterval(() => this.pumpMusic(), 60) };
        }

        stopMusic() {
            if (!this.mus) return;
            clearInterval(this.mus.timer);
            this.mus = null;
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
            const s = step % 16, barIndex = Math.floor(step / 16), [root, minor] = T.chords[barIndex % T.chords.length];
            // Swing delays every other sixteenth for a looser feel
            const t = T.swing && s % 2 === 1 ? t0 + spb * T.swing : t0;
            const tones = [root, root + (minor ? 3 : 4), root + 7, root + 12];
            const hz = n => 440 * Math.pow(2, (n - 69) / 12);
            if (s === 0) {
                tones.slice(0, 3).forEach(n => {
                    this.musicTone(hz(n), spb * 15, 0.045, 'sawtooth', t, 1100, { detune: 9, attack: 0.12, send: 0.7 });
                    this.musicTone(hz(n), spb * 15, 0.05, 'triangle', t, 2200, { attack: 0.06, send: 0.4 });
                });
            }
            if (T.bass[s] === '1') {
                const hop = barIndex % 4 === 3 && s >= 8 ? 12 : 0;
                this.musicTone(hz(root - 24 + hop), spb * 1.8, 0.3, T.bassWave, t, 600);
                this.musicTone(hz(root - 36 + hop), spb * 1.8, 0.2, 'sine', t, 300);
            }
            if (T.lead[s] === '1') {
                const up = barIndex % 8 >= 4 ? 12 : 0;
                const note = hz(tones[T.arp[step % T.arp.length]] + 12 + up);
                this.musicTone(note, spb * 1.4, 0.085, T.leadWave, t, 3200, { detune: 6, send: 0.45, echo: 0.35 });
            }
            if (T.kick[s] === '1') this.musicKick(t);
            const fill = barIndex % 4 === 3 && s >= 12;
            if (T.snare[s] === '1' || fill) this.musicNoise(t, 0.14, fill ? 0.12 : 0.16, 1800, 'highpass');
            if (T.snare[s] === '1' && T.snare !== '0000000000000000') this.musicTone(190, 0.09, 0.08, 'triangle', t, 1200);
            if (T.hat[s] === '1') this.musicNoise(t, 0.04, 0.05, 7000, 'highpass');
            if (T.openHat && T.openHat[s] === '1' && s % 4 === 2) this.musicNoise(t, 0.16, 0.04, 8000, 'highpass');
        }

        musicTone(freq, dur, vol, type, t, cutoff = 5000, opts = {}) {
            const ctx = this.ctx, gain = ctx.createGain(), filter = ctx.createBiquadFilter();
            const attack = opts.attack || 0.015;
            filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, t);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(vol, t + attack);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            filter.connect(gain); gain.connect(this.musicGain);
            if (opts.send && this.fxIn) { const s = ctx.createGain(); s.gain.value = opts.send; gain.connect(s); s.connect(this.fxIn); }
            if (opts.echo && this.echoIn) { const e = ctx.createGain(); e.gain.value = opts.echo; gain.connect(e); e.connect(this.echoIn); }
            (opts.detune ? [-opts.detune, opts.detune] : [0]).forEach(cents => {
                const osc = ctx.createOscillator();
                osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.detune.value = cents;
                osc.connect(filter); osc.start(t); osc.stop(t + dur + 0.05);
            });
        }

        musicKick(t) {
            const ctx = this.ctx, osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
            gain.gain.setValueAtTime(0.5, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
            osc.connect(gain); gain.connect(this.musicGain); osc.start(t); osc.stop(t + 0.2);
        }

        musicNoise(t, dur, vol, cutoff, type) {
            const ctx = this.ctx, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
            src.buffer = this.noiseBuf;
            filter.type = type; filter.frequency.setValueAtTime(cutoff, t);
            gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            src.connect(filter); filter.connect(gain); gain.connect(this.musicGain);
            src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
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
        play(name, category = 'ui', minGapMs = 45) {
            const s = this.settings;
            if (!s.volume || !s[category] || !RECIPES[name] || !this.unlock()) return;
            const now = performance.now();
            if (now - (this.last[name] || 0) < minGapMs) return;
            this.last[name] = now;
            this.master.gain.setValueAtTime(Math.pow(s.volume, 1.6), this.ctx.currentTime);
            // Repeated sounds get a random variant and a slight pitch shift so they never feel mechanical
            let recipe = RECIPES[name];
            if (Array.isArray(recipe)) recipe = recipe[Math.floor(Math.random() * recipe.length)];
            this.pitch = NO_PITCH_SHIFT.has(name) ? 1 : 0.93 + Math.random() * 0.14;
            try { recipe(this); } finally { this.pitch = 1; }
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
            gain.connect(this.master);
            if (this.verbIn && dur > 0.1) gain.connect(this.verbIn);
            osc.start(t);
            osc.stop(t + dur + 0.02);
        }

        // Bell-like note: fundamental plus soft overtones
        chime(freq, dur, vol, delay = 0) {
            this.tone('sine', freq, freq, dur, vol, delay);
            this.tone('sine', freq * 2, freq * 2, dur * 0.7, vol * 0.3, delay);
            this.tone('triangle', freq * 3.01, freq * 3.01, dur * 0.4, vol * 0.1, delay);
        }

        noise(dur, vol, cutoff) {
            const ctx = this.ctx;
            const t = ctx.currentTime;
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
            gain.connect(this.master);
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
