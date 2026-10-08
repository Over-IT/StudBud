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
    const MODE_STYLE = { skyline: 'summit', river: 'lagoon', fishing: 'lagoon', market: 'bazaar', miner: 'cavern', duel: 'battle', shooter: 'battle', sports: 'bazaar', crypto: 'neon', hack: 'neon' };

    // Every sound is synthesized on the fly, so there are no audio files to load.
    const RECIPES = {
        click: c => { c.tone('triangle', 620, 440, 0.06, 0.18); },
        tick: c => { c.tone('sine', 880, 880, 0.04, 0.12); },
        toggle: c => { c.tone('square', 520, 760, 0.07, 0.1); },
        success: c => { c.tone('sine', 660, 660, 0.12, 0.2); c.tone('sine', 880, 880, 0.16, 0.2, 0.09); c.tone('sine', 1320, 1320, 0.22, 0.18, 0.18); },
        error: c => { c.tone('sawtooth', 220, 140, 0.22, 0.18); c.tone('sawtooth', 196, 110, 0.26, 0.15, 0.1); },
        buy: c => { c.tone('square', 988, 988, 0.07, 0.1); c.tone('square', 1318, 1318, 0.16, 0.1, 0.07); },
        coin: c => { c.tone('square', 1046, 1046, 0.06, 0.09); c.tone('square', 1568, 1568, 0.18, 0.09, 0.06); },
        open: c => { c.tone('sine', 220, 880, 0.5, 0.22); c.noise(0.4, 0.07, 2500); c.tone('sine', 1318, 1318, 0.3, 0.16, 0.45); },
        question: c => { c.tone('sine', 520, 520, 0.09, 0.16); c.tone('sine', 780, 780, 0.12, 0.16, 0.09); },
        correct: c => { c.tone('triangle', 523, 523, 0.1, 0.22); c.tone('triangle', 659, 659, 0.1, 0.22, 0.08); c.tone('triangle', 784, 784, 0.2, 0.22, 0.16); },
        wrong: c => { c.tone('sawtooth', 190, 120, 0.3, 0.2); },
        refill: c => { c.tone('sine', 330, 990, 0.28, 0.2); },
        jump: c => { c.tone('square', 260, 620, 0.14, 0.09); },
        dash: c => { c.noise(0.16, 0.12, 1800); c.tone('sawtooth', 300, 700, 0.12, 0.05); },
        act: c => { c.tone('square', 420, 300, 0.05, 0.05); },
        shoot: c => { c.noise(0.09, 0.14, 3200); c.tone('sawtooth', 700, 140, 0.11, 0.1); },
        hit: c => { c.noise(0.12, 0.2, 900); c.tone('square', 180, 70, 0.14, 0.14); },
        pop: c => { c.tone('sine', 520, 220, 0.09, 0.16); },
        boom: c => { c.noise(0.5, 0.3, 500); c.tone('sine', 120, 40, 0.45, 0.3); },
        splash: c => { c.noise(0.3, 0.14, 1400); c.tone('sine', 700, 300, 0.12, 0.08); },
        countdown: c => { c.tone('sine', 660, 660, 0.14, 0.22); },
        go: c => { c.tone('sine', 990, 990, 0.4, 0.26); c.tone('triangle', 1320, 1320, 0.4, 0.14); },
        powerup: c => { c.tone('square', 400, 1200, 0.2, 0.1); },
        win: c => { [523, 659, 784, 1046].forEach((f, i) => c.tone('triangle', f, f, 0.22, 0.22, i * 0.12)); c.tone('triangle', 1318, 1318, 0.5, 0.22, 0.5); },
        lose: c => { [392, 330, 262].forEach((f, i) => c.tone('triangle', f, f * 0.96, 0.28, 0.2, i * 0.18)); }
    };

    class Sfx {
        constructor() {
            this.ctx = null;
            this.master = null;
            this.last = {};
            this.settings = { ...defaults };
            try { Object.assign(this.settings, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch (error) { /* use defaults */ }
        }

        save() {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch (error) { /* storage unavailable */ }
        }

        update(patch) {
            Object.assign(this.settings, patch);
            this.save();
            if ('musicVolume' in patch) this.applyMusicLevel();
            if (patch.music === false) this.stopMusic();
        }

        applyMusicLevel() {
            if (this.musicGain) this.musicGain.gain.setTargetAtTime(Math.pow(this.settings.musicVolume, 1.6) * 0.6, this.ctx.currentTime, 0.05);
        }

        styleFor(mode) {
            const chosen = this.settings.musicStyle;
            return MUSIC[chosen] ? chosen : (MODE_STYLE[mode] || 'summit');
        }

        // mode is a game id (or a style id for previews); restarts only when the style changes.
        startMusic(mode, forceRestart = false) {
            if (!this.settings.music || !this.settings.musicVolume || !this.unlock()) return;
            const style = MUSIC[mode] ? mode : this.styleFor(mode);
            if (this.mus && this.mus.style === style && !forceRestart) return;
            this.stopMusic();
            if (!this.musicGain) {
                this.musicGain = this.ctx.createGain();
                this.musicGain.connect(this.ctx.destination);
                const length = this.ctx.sampleRate;
                this.noiseBuf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
                const data = this.noiseBuf.getChannelData(0);
                for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
            }
            this.applyMusicLevel();
            this.mus = { style, step: 0, next: this.ctx.currentTime + 0.15, timer: setInterval(() => this.pumpMusic(), 60) };
        }

        stopMusic() {
            if (!this.mus) return;
            clearInterval(this.mus.timer);
            this.mus = null;
            if (this.musicGain) {
                const g = this.musicGain.gain, t = this.ctx.currentTime;
                g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + 0.25);
            }
        }

        pumpMusic() {
            const m = this.mus;
            if (!m) return;
            const T = MUSIC[m.style], spb = 60 / T.bpm / 4, now = this.ctx.currentTime;
            if (m.next < now - 0.3) m.next = now + 0.05;
            while (m.next < now + 0.7) { this.musicStep(T, m.step, m.next, spb); m.next += spb; m.step++; }
        }

        musicStep(T, step, t, spb) {
            const s = step % 16, barIndex = Math.floor(step / 16), [root, minor] = T.chords[barIndex % T.chords.length];
            const tones = [root, root + (minor ? 3 : 4), root + 7, root + 12];
            const hz = n => 440 * Math.pow(2, (n - 69) / 12);
            if (s === 0) tones.slice(0, 3).forEach(n => this.musicTone(hz(n), spb * 15, 0.07, 'triangle', t));
            if (T.bass[s] === '1') this.musicTone(hz(root - 24), spb * 1.8, 0.32, T.bassWave, t, 600);
            if (T.lead[s] === '1') {
                const up = barIndex % 8 >= 4 ? 12 : 0;
                this.musicTone(hz(tones[T.arp[step % T.arp.length]] + 12 + up), spb * 1.4, 0.1, T.leadWave, t, 3200);
            }
            if (T.kick[s] === '1') this.musicKick(t);
            if (T.snare[s] === '1') this.musicNoise(t, 0.14, 0.16, 1800, 'highpass');
            if (T.hat[s] === '1') this.musicNoise(t, 0.04, 0.05, 7000, 'highpass');
        }

        musicTone(freq, dur, vol, type, t, cutoff = 5000) {
            const ctx = this.ctx, osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
            osc.type = type; osc.frequency.setValueAtTime(freq, t);
            filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, t);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(filter); filter.connect(gain); gain.connect(this.musicGain);
            osc.start(t); osc.stop(t + dur + 0.05);
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
                this.master.connect(this.ctx.destination);
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
            RECIPES[name](this);
        }

        tone(type, from, to, dur, vol, delay = 0) {
            const ctx = this.ctx;
            const t = ctx.currentTime + delay;
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
            osc.start(t);
            osc.stop(t + dur + 0.02);
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
})(window);
