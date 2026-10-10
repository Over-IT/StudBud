(function (window) {
    'use strict';

    const TAU = Math.PI * 2;
    const sfx = (name, gap) => { try { window.StudBudSfx?.play(name, 'game', gap); } catch (error) { /* audio is optional */ } };
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hashStr(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
        return h >>> 0;
    }

    const PALETTE = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#e879f9', '#2dd4bf', '#facc15'];

    function playerColor(player) {
        const palette = String(player?.palette || '');
        if (palette.includes('ocean')) return '#38bdf8';
        if (palette.includes('sunset')) return '#fb923c';
        if (palette.includes('violet')) return '#a78bfa';
        const themed = palette && (window.StudBudCommunityGames?.catalog || []).find(item => item.id === palette && item.hue != null);
        if (themed) return `hsl(${themed.hue2} 80% 62%)`;
        return PALETTE[hashStr(String(player?.id || 'x')) % PALETTE.length];
    }

    // Slope solids: slope: 1 rises to the right, -1 rises to the left; the box is x/y/w/h and the surface runs corner to corner.
    function slopeY(s, cx) {
        const t = clamp((cx - s.x) / s.w, 0, 1);
        return s.slope > 0 ? s.y + s.h - t * s.h : s.y + t * s.h;
    }

    // Axis-aligned body vs. rectangles. Solids may carry dx/dy (moving platforms) and `oneway`/`off` flags.
    function moveBody(b, solids, dt) {
        b.onGround = false;
        b.wall = 0;
        b.ground = null;
        b.x += b.vx * dt;
        for (const s of solids) {
            if (s.oneway || s.off || s.slope || !overlap(b, s)) continue;
            if (b.vx > 0 || (b.vx === 0 && b.x + b.w / 2 < s.x + s.w / 2)) { b.x = s.x - b.w; b.wall = 1; }
            else { b.x = s.x + s.w; b.wall = -1; }
            b.vx = 0;
        }
        for (const s of solids) {
            if (!s.slope || !overlap(b, s)) continue;
            const ratio = s.h / s.w, sy = slopeY(s, b.x + b.w / 2);
            if (b.y + b.h > sy + ratio * Math.abs(b.vx) * dt + 12) {
                if (b.vx > 0 || (b.vx === 0 && b.x + b.w / 2 < s.x + s.w / 2)) { b.x = s.x - b.w; b.wall = 1; }
                else { b.x = s.x + s.w; b.wall = -1; }
                b.vx = 0;
            }
        }
        const prevBottom = b.y + b.h;
        b.y += b.vy * dt;
        for (const s of solids) {
            if (s.slope && !s.off) {
                const cx = b.x + b.w / 2;
                if (cx >= s.x && cx <= s.x + s.w && b.vy < 0 && b.y < s.y + s.h && prevBottom - b.h >= s.y + s.h - 1) {
                    b.y = s.y + s.h; b.vy = 0;
                    continue;
                }
                if (cx < s.x || cx > s.x + s.w || b.vy < 0) continue;
                const sy = slopeY(s, cx), ratio = s.h / s.w, bottom = b.y + b.h;
                const reach = ratio * Math.abs(b.vx) * dt + 3;
                if ((bottom >= sy && prevBottom <= sy + reach + 12 + b.vy * dt) || (bottom < sy && sy - bottom <= reach && b.vy < 400 && prevBottom >= sy - reach - 2)) {
                    b.y = sy - b.h; b.vy = 0; b.onGround = true; b.ground = s;
                }
                continue;
            }
            if (s.off || !overlap(b, s)) continue;
            if (s.oneway) {
                if (b.vy >= 0 && prevBottom <= s.y + 6) { b.y = s.y - b.h; b.vy = 0; b.onGround = true; b.ground = s; }
            } else if (b.vy >= 0 && prevBottom <= s.y + 12 + Math.abs(b.vy) * dt) {
                b.y = s.y - b.h; b.vy = 0; b.onGround = true; b.ground = s;
            } else if (b.vy < 0) {
                b.y = s.y + s.h; b.vy = 0;
            } else {
                b.y = s.y - b.h; b.vy = 0; b.onGround = true; b.ground = s;
            }
        }
    }

    // Circle vs. rectangle push-out. Returns true if a collision was resolved.
    function pushCircleOutOfRect(c, r) {
        const nx = clamp(c.x, r.x, r.x + r.w);
        const ny = clamp(c.y, r.y, r.y + r.h);
        let dx = c.x - nx;
        let dy = c.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= c.r * c.r) return false;
        if (d2 === 0) {
            const left = c.x - r.x, right = r.x + r.w - c.x, top = c.y - r.y, bottom = r.y + r.h - c.y;
            const m = Math.min(left, right, top, bottom);
            if (m === left) c.x = r.x - c.r; else if (m === right) c.x = r.x + r.w + c.r;
            else if (m === top) c.y = r.y - c.r; else c.y = r.y + r.h + c.r;
            return true;
        }
        const d = Math.sqrt(d2);
        c.x = nx + dx / d * c.r;
        c.y = ny + dy / d * c.r;
        return true;
    }

    function roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function nameTag(ctx, name, x, y, color) {
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const w = ctx.measureText(name).width + 12;
        ctx.fillStyle = 'rgba(8,12,24,.62)';
        roundRect(ctx, x - w / 2, y - 14, w, 19, 9);
        ctx.fill();
        ctx.fillStyle = color || '#fff';
        ctx.fillText(name, x, y);
    }

    class Particles {
        constructor() { this.items = []; }
        burst(x, y, color, count = 10, speed = 160, life = 0.5, size = 4) {
            if (count >= 24) sfx('boom', 160);
            else if (count >= 8) sfx('pop', 70);
            for (let i = 0; i < count; i++) {
                const a = Math.random() * TAU;
                const v = speed * (0.3 + Math.random() * 0.7);
                this.items.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size });
            }
        }
        update(dt, gravity = 0) {
            for (const p of this.items) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += gravity * dt; }
            this.items = this.items.filter(p => p.life > 0);
        }
        draw(ctx) {
            for (const p of this.items) {
                ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
            ctx.globalAlpha = 1;
        }
    }

    // A meter (ammo, energy, bait…) that is spent by playing and refilled by answering questions.
    class Resource {
        constructor(label, color, max, start, mult = 1) {
            this.label = label; this.color = color; this.max = max; this.value = start; this.mult = mult;
        }
        has(n = 1) { return this.value >= n; }
        spend(n = 1) { if (this.value < n) return false; this.value -= n; return true; }
        drain(n) { this.value = Math.max(0, this.value - n); }
        add(n) { this.value += n; }
    }

    class BaseGame {
        constructor(session) { this.s = session; this.particles = new Particles(); }
        update() { }
        draw() { }
        net() { return {}; }
        onEvent() { }
        goalText() { return ''; }
        hint() { return ''; }
    }

    class Session {
        constructor(options) {
            this.room = options.room;
            this.user = options.user;
            this.api = options.api;
            this.isHost = Boolean(options.isHost);
            this.onLeave = options.onLeave;
            this.finishRoom = options.finishRoom;
            this.practice = Boolean(options.practice);
            this.correct = 0;
            this.reward = Math.min(100, Math.max(5, Number(this.room.state?.question_reward) || 20));
            this.mode = this.room.mode;
            this.code = this.room.room_code;
            this.seed = hashStr(`${this.code}:${this.mode}`);
            this.roster = new Map();
            this.remotes = new Map();
            this.keys = new Set();
            this.justPressed = new Set();
            this.mouse = { x: 0, y: 0, down: false, pressed: false, rdown: false, rpressed: false };
            this.score = 0;
            this.goal = 0;
            this.answered = 0;
            this.paused = false;
            this.over = false;
            this.ending = false;
            this.countdown = 3.4;
            this.t = 0;
            this.cards = [];
            this.lastCard = -1;
            this.outbox = [];
            this.rewards = null;
            this.standingsCache = null;
            this.firstDone = 0;
            this.finishMs = 0;
            this.done = false;
            this.lastReport = { score: -1, answered: -1, at: 0 };
            this.startedAt = Date.parse(this.room.started_at) || Date.now();
            this.deadline = this.practice ? Infinity : this.room.goal_type === 'time'
                ? this.startedAt + Number(this.room.time_limit_seconds) * 1000
                : this.startedAt + 12 * 60000;
            this.updateRoster(this.room);
            this.local = this.roster.get(this.user.id) || { id: this.user.id, nickname: 'Player', color: PALETTE[0] };

            const Game = (window.StudBudArcade.games[this.mode]) || window.StudBudArcade.games.skyline;
            this.buildDom();
            this.game = new Game(this);
            window.StudBudSfx?.startMusic(this.mode);
            this.bind();
            if (!this.practice) this.connect();
            this.loadCards(options.fallbackCards);
            this.resize();
            if (this.practice) this.countdown = 1.2;
            this.lastFrame = performance.now();
            this.raf = requestAnimationFrame(now => this.frame(now));
            if (!this.practice) {
                this.sendTimer = setInterval(() => this.sendState(), 100);
                this.reportTimer = setInterval(() => this.reportScore(false), 5000);
                this.overlay.requestFullscreen?.().catch(() => { });
            }
            this.hudTimer = setInterval(() => this.updateHud(), 250);
        }

        // ---------- roster / network ----------
        updateRoster(room) {
            const players = Array.isArray(room.state?.players) ? room.state.players : [];
            const ids = new Set();
            players.forEach(player => {
                ids.add(player.id);
                this.roster.set(player.id, {
                    id: player.id, nickname: player.nickname, score: Number(player.score || 0), color: playerColor(player), avatar: player.avatar,
                    cos: { skin: player.skin || '', hat: player.hat || '', acc: player.accessory || '' }
                });
            });
            for (const id of [...this.roster.keys()]) if (!ids.has(id)) { this.roster.delete(id); this.remotes.delete(id); }
        }

        updateRoom(room) {
            if (this.over && room.status === 'finished') {
                const rewards = room.state?.coin_rewards;
                if (rewards && !this.rewards) { this.rewards = rewards; this.renderResults(); }
            }
            this.room = room;
            this.updateRoster(room);
            if (room.status === 'finished' && !this.over) this.finish(this.standings());
        }

        connect() {
            try {
                this.channel = this.api.openChannel(this.code);
                this.channel.on('broadcast', { event: 'm' }, ({ payload }) => this.receive(payload));
                this.channel.subscribe(status => { this.connected = status === 'SUBSCRIBED'; });
            } catch (error) {
                console.error('[Arcade] Realtime unavailable:', error);
            }
        }

        async loadCards(fallback) {
            try {
                this.cards = await this.api.getCards(this.code);
            } catch (error) {
                console.warn('[Arcade] Using local cards:', error.message);
            }
            if (!this.cards.length && fallback?.length) this.cards = fallback;
        }

        send(payload) {
            if (!this.connected || !this.channel) return;
            this.channel.send({ type: 'broadcast', event: 'm', payload });
        }

        emit(event) { if (this.outbox.length < 60) this.outbox.push(event); }

        sendState() {
            if (this.over || this.countdown > 0) return;
            this.send({
                t: 's', id: this.user.id, s: Math.round(this.score), g: Math.round(this.goal), q: this.answered,
                d: this.done ? 1 : 0, ft: this.finishMs, ...this.game.net(), ev: this.outbox.splice(0, 40)
            });
        }

        receive(p) {
            if (!p || p.id === this.user.id) return;
            if (p.t === 'end') {
                if (p.id === this.room.host_id) this.finish(p.st);
                return;
            }
            if (p.t !== 's' || !this.roster.has(p.id)) return;
            let r = this.remotes.get(p.id);
            const info = this.roster.get(p.id);
            if (!r) { r = { id: p.id, x: p.x, y: p.y, tx: p.x, ty: p.y }; this.remotes.set(p.id, r); }
            r.name = info.nickname; r.color = info.color; r.cos = info.cos;
            r.tx = p.x; r.ty = p.y; r.vx = p.vx || 0; r.vy = p.vy || 0; r.f = p.f || 0; r.a = p.a || 0;
            r.hp = p.hp; r.ex = p.ex || {};
            r.score = p.s || 0; r.goal = p.g || 0; r.answered = p.q || 0; r.done = p.d; r.ft = p.ft || 0;
            r.seen = performance.now();
            if (p.d && !this.firstDone) this.firstDone = Date.now();
            for (const ev of p.ev || []) this.game.onEvent(ev, r);
        }

        remoteList() { return [...this.remotes.values()]; }

        // ---------- scoring / end of match ----------
        sfx(name, gap) { sfx(name, gap); }

        addScore(n) {
            this.score = Math.max(0, this.score + n);
            if (n >= 40) sfx('coin', 120);
            else if (n > 0) sfx('pop', 90);
            else if (n < 0) sfx('hit');
        }
        setGoal(n) { this.goal = n; }

        standings() {
            const rows = [];
            for (const info of this.roster.values()) {
                const r = this.remotes.get(info.id);
                const isMe = info.id === this.user.id;
                rows.push({
                    id: info.id, n: info.nickname, color: info.color,
                    s: Math.round(isMe ? this.score : r ? r.score : info.score),
                    g: Math.round(isMe ? this.goal : r ? r.goal : (this.game?.scoreGoal === false ? info.score || 0 : 0)),
                    d: isMe ? this.done : Boolean(r?.done)
                });
            }
            return rows.sort((a, b) => (this.metric(b) - this.metric(a)) || (b.s - a.s));
        }

        metric(row) { return this.game?.scoreGoal === false ? row.g : row.s; }

        // What the leaderboard shows for a player: the number their game is actually won by.
        valueText(row) {
            if (this.game?.scoreGoal === false) return this.game.formatValue ? this.game.formatValue(row.g) : `${row.g.toLocaleString()} ${this.game.goalUnit || 'pts'}`;
            return `${row.s.toLocaleString()} pts`;
        }

        checkEnd() {
            if (this.practice || this.over || this.ending || !this.isHost || this.countdown > 0) return;
            const now = Date.now();
            const rows = this.standings();
            const limit = Number(this.room.point_limit);
            let end = now >= this.deadline;
            if (this.room.goal_type !== 'time' && !this.game.race && rows.some(row => this.metric(row) >= limit)) end = true;
            if (this.game.race) {
                if (rows.length && rows.every(row => row.d)) end = true;
                const first = this.done && !this.firstDone ? now : this.firstDone;
                if (first && now - first > 20000) end = true;
            }
            if (end) this.hostEnd();
        }

        hostEnd() {
            if (this.ending || this.over) return;
            this.ending = true;
            const st = this.standings();
            this.send({ t: 'end', id: this.user.id, st });
            this.finish(st);
            setTimeout(async () => {
                try {
                    const room = await this.finishRoom();
                    if (room?.state?.coin_rewards) { this.rewards = room.state.coin_rewards; this.renderResults(); }
                } catch (error) { console.error('[Arcade] Could not finish room:', error); }
            }, 1800);
        }

        async reportScore(force) {
            if (this.practice) return;
            const last = this.lastReport;
            const answered = this.answered + Math.floor(this.t / 20);
            const value = this.game?.scoreGoal === false ? Math.max(0, Math.round(this.goal)) : this.score;
            if (!force && last.score === value && last.answered === answered && last.correct === this.correct) return;
            this.lastReport = { score: value, answered, correct: this.correct, at: Date.now() };
            try { await this.api.reportScore(this.code, value, answered, this.correct); } catch (error) { /* rewards are best effort */ }
        }

        finish(standings) {
            if (this.over) return;
            this.over = true;
            this.standingsCache = (standings || this.standings()).map(row => ({ ...row, color: row.color || this.roster.get(row.id)?.color || '#94a3b8' }));
            this.reportScore(true);
            this.closeQuestion(true);
            this.renderResults();
            const me = this.standingsCache.findIndex(row => row.id === this.user.id);
            window.StudBudSfx?.stopMusic();
            sfx(me === 0 ? 'win' : 'lose');
        }

        // ---------- questions ----------
        // Spend from the game's resource; nags the player to answer a question when empty.
        spend(n) {
            const res = this.game.res;
            if (res.spend(n)) return true;
            const now = performance.now();
            if (now - (this.lastNeed || 0) > 1800) {
                this.lastNeed = now;
                sfx('wrong');
                this.toast(`Out of ${res.label.toLowerCase()} — press Q to answer a question`, '#f87171');
            }
            return false;
        }

        // Amount of the game's resource a correct answer is worth (host-configured).
        rewardAmount() { return Math.max(1, Math.round(this.reward * (this.game.res?.mult || 1))); }

        refill() {
            const res = this.game.res;
            if (!res) return 0;
            const n = this.rewardAmount();
            res.add(n);
            sfx('refill');
            this.toast(`+${n} ${res.label}`, res.color);
            return n;
        }

        // Player-triggered question that refills the game's resource.
        recharge() {
            const res = this.game.res;
            if (!res || this.paused || this.question || this.over || this.countdown > 0) return;
            this.ask(correct => {
                if (correct) this.refill();
                else if (correct === false) this.toast(`Wrong answer — no ${res.label.toLowerCase()}`, '#f87171');
            }, `Correct answer: +${this.rewardAmount()} ${res.label}`, true);
        }

        // Automatic triggers (mystery boxes, chests, pads) are blocked briefly after any question closes.
        ask(callback, note, manual, opts) {
            if (opts?.force && this.question) this.closeQuestion(true);
            if (this.paused || this.question || this.over || this.countdown > 0) return false;
            if (!manual && performance.now() < (this.askCooldownUntil || 0)) return false;
            if (!this.cards.length) { this.toast('Questions are still loading…', '#fbbf24'); return false; }
            let index = opts?.cardIndex !== undefined ? opts.cardIndex % this.cards.length : Math.floor(Math.random() * this.cards.length);
            if (opts?.cardIndex === undefined && this.cards.length > 1 && index === this.lastCard) index = (index + 1) % this.cards.length;
            this.lastCard = index;
            this.lastCardIndex = index;
            const card = this.cards[index];
            const wrong = [...new Set(this.cards.filter(c => c.back !== card.back).map(c => c.back))];
            for (let i = wrong.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [wrong[i], wrong[j]] = [wrong[j], wrong[i]]; }
            const options = wrong.slice(0, 3).concat(card.back);
            for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
            this.question = { card, options, callback, locked: false, onAnswer: opts?.onAnswer };
            return this.showQuestion(card, options, note);
        }

        showQuestion(card, options, note) {
            this.keys.clear(); this.mouse.down = false; this.mouse.rdown = false;
            const box = this.overlay.querySelector('.mpg-question');
            box.querySelector('.mpg-q-prompt').textContent = card.front;
            box.querySelector('.mpg-q-options').innerHTML = options.map((option, i) =>
                `<button type="button" data-q="${i}"><kbd>${i + 1}</kbd><span>${esc(option)}</span></button>`).join('');
            box.querySelector('.mpg-q-result').textContent = '';
            const res = this.game.res;
            box.querySelector('small').textContent = note || (res ? `Correct answer: +${this.rewardAmount()} ${res.label}` : 'Question');
            box.classList.remove('hidden');
            sfx('question');
        }

        answerQuestion(index) {
            const q = this.question;
            if (!q || q.locked) return;
            q.locked = true;
            const correct = q.options[index] === q.card.back;
            this.answered++;
            if (correct) this.correct++;
            try { q.onAnswer?.(correct); } catch (error) { console.error(error); }
            sfx(correct ? 'correct' : 'wrong');
            const box = this.overlay.querySelector('.mpg-question');
            box.querySelectorAll('[data-q]').forEach((button, i) => {
                button.classList.toggle('right', q.options[i] === q.card.back);
                button.classList.toggle('wrong', i === index && !correct);
            });
            box.querySelector('.mpg-q-result').textContent = correct ? 'Correct!' : `Not quite — ${q.card.back}`;
            setTimeout(() => {
                if (this.question !== q) return;
                this.closeQuestion(true);
                try { q.callback?.(correct); } catch (error) { console.error(error); }
            }, correct ? 650 : 1400);
        }

        skipQuestion() {
            const q = this.question;
            if (!q || q.locked) return;
            this.closeQuestion(true);
            q.callback?.(null);
        }

        closeQuestion(resume) {
            this.question = null;
            this.askCooldownUntil = performance.now() + 6000;
            this.overlay.querySelector('.mpg-question').classList.add('hidden');
            if (resume) this.paused = false;
        }

        toast(text, color = '#e2e8f0') {
            const holder = this.overlay.querySelector('.mpg-toasts');
            const item = document.createElement('div');
            item.textContent = text;
            item.style.borderColor = color;
            holder.appendChild(item);
            setTimeout(() => item.remove(), 2400);
            while (holder.children.length > 4) holder.firstChild.remove();
        }

        // ---------- input ----------
        axis() {
            const k = this.keys;
            return {
                x: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
                y: (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
            };
        }
        pressed(...codes) { return codes.some(code => this.justPressed.has(code)); }
        down(...codes) { return codes.some(code => this.keys.has(code)); }

        bind() {
            const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
            this.handlers = {
                keydown: e => {
                    if (typing(e)) return;
                    if (this.question) {
                        const n = Number(e.key);
                        if (n >= 1 && n <= 4) this.answerQuestion(n - 1);
                        e.preventDefault();
                        return;
                    }
                    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
                    if (e.code === 'KeyQ' && !e.repeat && this.game?.res) { this.recharge(); return; }
                    if (!e.repeat) this.justPressed.add(e.code);
                    this.keys.add(e.code);
                },
                keyup: e => this.keys.delete(e.code),
                blur: () => { this.keys.clear(); this.mouse.down = false; this.mouse.rdown = false; },
                resize: () => this.resize()
            };
            window.addEventListener('keydown', this.handlers.keydown);
            window.addEventListener('keyup', this.handlers.keyup);
            window.addEventListener('blur', this.handlers.blur);
            window.addEventListener('resize', this.handlers.resize);
            const canvas = this.canvas;
            canvas.addEventListener('pointermove', e => {
                const b = canvas.getBoundingClientRect();
                this.mouse.x = (e.clientX - b.left) / this.scale;
                this.mouse.y = (e.clientY - b.top) / this.scale;
            });
            canvas.addEventListener('pointerdown', e => {
                if (e.pointerType === 'touch') this.mouse.touchAt = performance.now();
                const b = canvas.getBoundingClientRect();
                this.mouse.x = (e.clientX - b.left) / this.scale;
                this.mouse.y = (e.clientY - b.top) / this.scale;
                if (e.button === 2) { this.mouse.rdown = true; this.mouse.rpressed = true; }
                else { this.mouse.down = true; this.mouse.pressed = true; }
                canvas.setPointerCapture?.(e.pointerId);
            });
            canvas.addEventListener('pointerup', e => { if (e.button === 2) this.mouse.rdown = false; else this.mouse.down = false; });
            canvas.addEventListener('contextmenu', e => e.preventDefault());
            this.overlay.addEventListener('click', e => {
                const target = e.target.closest('button');
                if (!target) return;
                if (target.dataset.q !== undefined) this.answerQuestion(Number(target.dataset.q));
                else if (target.classList.contains('mpg-q-skip')) this.skipQuestion();
                else if (target.classList.contains('mpg-recharge')) this.recharge();
                else if (target.classList.contains('mpg-leave') || target.classList.contains('mpg-exit')) this.onLeave?.();
                else if (target.classList.contains('mpg-end')) this.hostEnd();
            });
        }

        // ---------- DOM ----------
        buildDom() {
            const overlay = document.createElement('div');
            overlay.className = 'mpg-overlay';
            overlay.innerHTML = `
                <canvas class="mpg-canvas"></canvas>
                <div class="mpg-top">
                    <div class="mpg-chip"><strong class="mpg-name"></strong><span class="mpg-goal"></span></div>
                    <div class="mpg-timer"></div>
                    <div class="mpg-actions">
                        <button type="button" class="mpg-end ${this.isHost && !this.practice ? '' : 'hidden'}">End match</button>
                        <button type="button" class="mpg-leave">${this.practice ? 'Close' : 'Leave'}</button>
                    </div>
                </div>
                <ol class="mpg-board"></ol>
                <div class="mpg-score"><span>Score</span><strong>0</strong></div>
                <div class="mpg-meter hidden">
                    <div class="mpg-meter-head"><span class="mpg-meter-label"></span><b class="mpg-meter-value"></b></div>
                    <div class="mpg-meter-bar"><i></i></div>
                    <button type="button" class="mpg-recharge">Answer a question <kbd>Q</kbd></button>
                </div>
                <div class="mpg-hint"></div>
                <div class="mpg-touch" aria-label="Touch controls">
                    <div class="mpg-stick" role="application" aria-label="Movement joystick"><i class="mpg-knob"></i></div>
                    <div class="mpg-btns"></div>
                </div>
                <div class="mpg-toasts"></div>
                <div class="mpg-countdown"></div>
                <div class="mpg-question hidden" role="dialog" aria-modal="true" aria-label="Question">
                    <div class="mpg-q-card">
                        <small>Question</small>
                        <h3 class="mpg-q-prompt"></h3>
                        <div class="mpg-q-options"></div>
                        <p class="mpg-q-result" role="status"></p>
                        <button type="button" class="mpg-q-skip">Skip</button>
                    </div>
                </div>
                <div class="mpg-results hidden"></div>`;
            document.body.appendChild(overlay);
            document.body.classList.add('mpg-active');
            this.overlay = overlay;
            this.canvas = overlay.querySelector('.mpg-canvas');
            this.ctx = this.canvas.getContext('2d');
            overlay.querySelector('.mpg-name').textContent = this.game?.title || this.mode;
            this.bindTouch(overlay);
        }

        // On-screen buttons feed the same key state as the keyboard, so every game works on phones.
        bindTouch(overlay) {
            const pad = overlay.querySelector('.mpg-touch');
            if (!pad) return;
            if (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) overlay.classList.add('has-touch');
            const release = btn => {
                const code = btn.dataset.k;
                if (code) this.keys.delete(code);
                if (btn.dataset.click) this.mouse.down = false;
                btn.classList.remove('on');
            };
            const stick = pad.querySelector('.mpg-stick'), knob = stick?.querySelector('.mpg-knob');
            if (stick) {
                const dirs = { KeyA: false, KeyD: false, KeyW: false, KeyS: false };
                let activeId = null;
                const setDirs = next => {
                    for (const code in dirs) {
                        if (next[code] && !dirs[code]) this.justPressed.add(code);
                        if (next[code]) this.keys.add(code); else this.keys.delete(code);
                        dirs[code] = next[code];
                    }
                };
                const reset = () => {
                    activeId = null;
                    setDirs({ KeyA: false, KeyD: false, KeyW: false, KeyS: false });
                    knob.style.transform = '';
                };
                const move = e => {
                    const b = stick.getBoundingClientRect();
                    const max = b.width / 2;
                    let dx = e.clientX - (b.left + max), dy = e.clientY - (b.top + max);
                    const len = Math.hypot(dx, dy);
                    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
                    knob.style.transform = `translate(${dx}px, ${dy}px)`;
                    if (this.question || this.over) { setDirs({ KeyA: false, KeyD: false, KeyW: false, KeyS: false }); return; }
                    const dead = max * 0.3;
                    setDirs({ KeyA: dx < -dead, KeyD: dx > dead, KeyW: dy < -dead, KeyS: dy > dead });
                };
                stick.addEventListener('pointerdown', e => {
                    e.preventDefault();
                    activeId = e.pointerId;
                    stick.setPointerCapture?.(e.pointerId);
                    move(e);
                });
                stick.addEventListener('pointermove', e => { if (e.pointerId === activeId) move(e); });
                for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, reset);
                stick.addEventListener('contextmenu', e => e.preventDefault());
            }
            const bindBtn = btn => {
                btn.addEventListener('pointerdown', e => {
                    e.preventDefault();
                    btn.setPointerCapture?.(e.pointerId);
                    if (this.question || this.over) return;
                    btn.classList.add('on');
                    if (btn.dataset.q) { if (this.game?.res) this.recharge(); return; }
                    this.justPressed.add(btn.dataset.k);
                    this.keys.add(btn.dataset.k);
                    if (btn.dataset.click) { this.mouse.down = true; this.mouse.pressed = true; }
                });
                for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(type, () => release(btn));
                btn.addEventListener('contextmenu', e => e.preventDefault());
            };
            // Each game describes its own on-screen controls: { stick, buttons: [{ k, label, cls, click }] }. The recharge button is added automatically.
            const DEFAULT_LAYOUT = { stick: true, buttons: [{ k: 'Space', label: 'Jump', cls: 'main' }, { k: 'ShiftLeft', label: 'Dash' }] };
            this.applyTouchLayout = () => {
                const layout = this.game?.touchLayout?.() || DEFAULT_LAYOUT;
                const key = JSON.stringify(layout) + (this.game?.res ? 'q' : '');
                if (key === this.touchLayoutKey) return;
                this.touchLayoutKey = key;
                const box = pad.querySelector('.mpg-btns');
                box.innerHTML = '';
                const list = (layout.buttons || []).concat(this.game?.res ? [{ q: true, label: 'Q', cls: 'q' }] : []);
                for (const def of list) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = def.label;
                    if (def.q) btn.dataset.q = '1'; else btn.dataset.k = def.k;
                    if (def.click) btn.dataset.click = '1';
                    if (def.cls) btn.className = `b-${def.cls}`;
                    if (def.small) btn.classList.add('b-small');
                    bindBtn(btn);
                    box.appendChild(btn);
                }
                box.style.setProperty('--cols', String(Math.min(3, Math.max(2, layout.cols || 2))));
                pad.classList.toggle('no-stick', layout.stick === false);
                pad.dataset.game = this.mode || '';
            };
        }

        resize() {
            const dpr = window.devicePixelRatio || 1;
            const w = window.innerWidth, h = window.innerHeight;
            this.canvas.width = Math.floor(w * dpr);
            this.canvas.height = Math.floor(h * dpr);
            this.dpr = dpr;
            this.scale = Math.max(0.45, h / 720);
            this.vw = w / this.scale;
            this.vh = 720;
        }

        updateHud() {
            if (this.over) return;
            const o = this.overlay;
            o.querySelector('.mpg-name').textContent = this.game.title || '';
            o.querySelector('.mpg-goal').textContent = this.game.goalText();
            const objective = this.game.scoreGoal === false;
            const scoreBox = o.querySelector('.mpg-score');
            scoreBox.querySelector('span').textContent = objective ? (this.game.goalLabel || 'Score') : 'Score';
            scoreBox.querySelector('strong').textContent = objective
                ? (this.game.formatValue ? this.game.formatValue(Math.round(this.goal)) : Math.round(this.goal).toLocaleString())
                : Math.round(this.score).toLocaleString();
            const left = Math.max(0, this.deadline - Date.now());
            o.querySelector('.mpg-timer').textContent = this.room.goal_type === 'time' && Number.isFinite(left)
                ? `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`
                : `${Math.floor(this.t / 60)}:${String(Math.floor(this.t) % 60).padStart(2, '0')}`;
            o.querySelector('.mpg-hint').textContent = this.question ? '' : this.game.hint();
            this.applyTouchLayout?.();
            o.querySelector('.mpg-board').innerHTML = this.standings().slice(0, 6).map((row, i) =>
                `<li class="${row.id === this.user.id ? 'me' : ''}"><i style="background:${row.color}"></i><span>${i + 1}. ${esc(row.n)}</span><b>${this.valueText(row)}</b></li>`).join('');
        }

        updateMeter() {
            const res = this.game.res;
            const box = this.overlay.querySelector('.mpg-meter');
            if (!res) { box.classList.add('hidden'); return; }
            box.classList.remove('hidden');
            const value = Math.round(res.value);
            box.querySelector('.mpg-meter-label').textContent = res.label;
            box.querySelector('.mpg-meter-value').textContent = `${value}`;
            const fill = box.querySelector('.mpg-meter-bar i');
            fill.style.width = `${Math.max(0, Math.min(100, res.value / res.max * 100))}%`;
            fill.style.background = res.color;
            box.classList.toggle('low', res.value < res.max * 0.2);
        }

        renderResults() {
            const panel = this.overlay.querySelector('.mpg-results');
            const rows = this.standingsCache || this.standings();
            const winner = rows[0];
            panel.classList.remove('hidden');
            panel.innerHTML = `<div class="mpg-results-card">
                <small>Match over</small>
                <h2>${winner ? `${esc(winner.n)} wins!` : 'Game over'}</h2>
                <ol>${rows.map((row, i) => `<li class="${row.id === this.user.id ? 'me' : ''}"><span class="rank">${i + 1}</span><i style="background:${row.color}"></i><strong>${esc(row.n)}</strong><b>${this.valueText(row)}</b><em>${this.rewards ? `+${Number(this.rewards[row.id] || 0)} coins` : ''}</em></li>`).join('')}</ol>
                <p>${this.rewards ? 'Coins have been added to your multiplayer wallet.' : 'Tallying coin rewards…'}</p>
                <button type="button" class="mpg-exit">Back to lobby</button>
            </div>`;
        }

        // ---------- main loop ----------
        frame(now) {
            if (this.destroyed) return;
            const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
            this.lastFrame = now;
            if (!this.over) {
                if (this.countdown > 0) {
                    this.countdown -= dt;
                    const step = this.countdown > 0.4 ? Math.ceil(this.countdown - 0.4) : 0;
                    if (step !== this.lastCountStep) {
                        this.lastCountStep = step;
                        sfx(step ? 'countdown' : 'go');
                    }
                    const text = this.countdown > 0.4 ? String(Math.ceil(this.countdown - 0.4)) : 'GO!';
                    const el = this.overlay.querySelector('.mpg-countdown');
                    el.textContent = this.countdown > -0.2 ? text : '';
                    el.classList.toggle('hidden', this.countdown <= -0.2);
                } else {
                    this.overlay.querySelector('.mpg-countdown').classList.add('hidden');
                    this.t += dt;
                    if (!this.paused) { this.onTick?.(dt); this.game.update(dt); }
                    this.checkEnd();
                    if (!this.practice && !this.isHost && !this.over && Date.now() > this.deadline + 9000) this.finish(this.standings());
                }
            }
            for (const r of this.remotes.values()) {
                if (now - r.seen > 5000) { this.remotes.delete(r.id); continue; }
                const gap = dist(r.x, r.y, r.tx, r.ty);
                const k = gap > 500 ? 1 : Math.min(1, dt * 14);
                r.x += (r.tx - r.x) * k;
                r.y += (r.ty - r.y) * k;
            }
            this.updateMeter();
            this.justPressed.clear();
            this.mouse.pressed = false;
            this.mouse.rpressed = false;
            const ctx = this.ctx;
            ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
            this.game.draw(ctx, this.vw, this.vh);
            this.raf = requestAnimationFrame(t => this.frame(t));
        }

        destroy() {
            this.destroyed = true;
            window.StudBudSfx?.endMusic();
            cancelAnimationFrame(this.raf);
            clearInterval(this.sendTimer);
            clearInterval(this.hudTimer);
            clearInterval(this.reportTimer);
            window.removeEventListener('keydown', this.handlers.keydown);
            window.removeEventListener('keyup', this.handlers.keyup);
            window.removeEventListener('blur', this.handlers.blur);
            window.removeEventListener('resize', this.handlers.resize);
            try { if (this.channel) this.api.getClient().removeChannel(this.channel); } catch (error) { /* already closed */ }
            this.overlay.remove();
            document.body.classList.remove('mpg-active');
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { });
        }
    }

    // ---------- cosmetics ----------
    const SKINS = {
        skin_robot: { body: '#94a3b8', head: '#cbd5e1', eye: '#06b6d4', trim: '#475569' },
        skin_ninja: { body: '#111827', head: '#1f2937', eye: '#f8fafc', trim: '#dc2626' },
        skin_alien: { body: '#16a34a', head: '#86efac', eye: '#0f172a', trim: '#14532d' },
        skin_ghost: { body: '#e2e8f0', head: '#f8fafc', eye: '#0f172a', trim: '#94a3b8', alpha: 0.88 },
        skin_lava: { body: '#ea580c', head: '#7c2d12', eye: '#fde047', trim: '#fbbf24' },
        skin_gold: { body: '#f59e0b', head: '#fcd34d', eye: '#451a03', trim: '#b45309' },
        skin_zombie: { body: '#4d7c0f', head: '#a3e635', eye: '#7f1d1d', trim: '#365314' },
        skin_snow: { body: '#e0f2fe', head: '#f0f9ff', eye: '#0f172a', trim: '#7dd3fc' },
        skin_pumpkin: { body: '#f97316', head: '#fb923c', eye: '#111827', trim: '#9a3412' },
        skin_bubble: { body: '#f472b6', head: '#fbcfe8', eye: '#831843', trim: '#be185d' },
        skin_cyber: { body: '#0f172a', head: '#1e293b', eye: '#22d3ee', trim: '#06b6d4' },
        skin_crystal: { body: '#67e8f9', head: '#cffafe', eye: '#164e63', trim: '#0891b2', alpha: 0.92 },
        skin_shadow: { body: '#312e81', head: '#4c1d95', eye: '#f0abfc', trim: '#1e1b4b', alpha: 0.9 },
        skin_galaxy: { body: '#1e1b4b', head: '#312e81', eye: '#fde047', trim: '#a78bfa' },
        skin_dragon: { body: '#15803d', head: '#4ade80', eye: '#fde047', trim: '#7f1d1d' },
        skin_candy: { body: '#fb7185', head: '#fecdd3', eye: '#4c0519', trim: '#fff1f2' },
        skin_mummy: { body: '#d6c7a1', head: '#e7dcc0', eye: '#1c1917', trim: '#a8946a' },
        skin_vampire: { body: '#7f1d1d', head: '#f1e4e4', eye: '#ef4444', trim: '#1c1917' },
        skin_samurai: { body: '#b91c1c', head: '#fde7c8', eye: '#111827', trim: '#facc15' },
        skin_neon: { body: '#22d3ee', head: '#e879f9', eye: '#0f172a', trim: '#a3e635' },
        skin_pixel: { body: '#4ade80', head: '#bbf7d0', eye: '#052e16', trim: '#166534' },
        skin_steampunk: { body: '#a16207', head: '#fcd9a8', eye: '#422006', trim: '#78350f' },
        skin_rainbow: { body: '#a855f7', head: '#fde047', eye: '#0f172a', trim: '#22c55e' }
    };

    const LEGACY_HATS = { accessory_cap: 'hat_cap', accessory_halo: 'hat_halo', accessory_headphones: 'hat_headphones' };
    let petMap = null;
    function petEmoji(id) {
        if (!id) return '';
        if (!petMap) {
            const catalog = window.StudBudCommunityGames?.catalog || [];
            petMap = new Map(catalog.filter(item => item.emoji).map(item => [item.id, item.emoji]));
        }
        return petMap.get(id) || '';
    }

    function drawPet(ctx, emoji, x, y, size, time) {
        if (!emoji) return;
        ctx.save();
        ctx.font = `${size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, x, y + Math.sin(time * 5) * 2);
        ctx.restore();
    }

    // Accepts either a colour string or a player-like object ({ color, cos }).
    function who(p) {
        if (typeof p === 'string') return { color: p, skin: null, hat: '', acc: '' };
        const cos = p?.cos || {};
        return { color: p?.color || '#94a3b8', skin: SKINS[cos.skin] || null, hat: LEGACY_HATS[cos.hat] || cos.hat || '', acc: cos.acc || '' };
    }

    function drawHat(ctx, hat, cx, top, r, tilt = 0) {
        if (!hat) return;
        ctx.save();
        ctx.translate(cx, top);
        ctx.rotate(tilt);
        const fill = (color, fn) => { ctx.fillStyle = color; ctx.beginPath(); fn(); ctx.fill(); };
        if (hat === 'hat_cap') {
            fill('#ef4444', () => ctx.arc(0, r * 0.35, r * 1.02, Math.PI, TAU));
            fill('#b91c1c', () => ctx.rect(0, r * 0.2, r * 1.5, r * 0.28));
        } else if (hat === 'hat_party') {
            fill('#a855f7', () => { ctx.moveTo(-r * 0.8, r * 0.4); ctx.lineTo(0, -r * 1.7); ctx.lineTo(r * 0.8, r * 0.4); });
            fill('#fde047', () => ctx.arc(0, -r * 1.7, r * 0.25, 0, TAU));
            ctx.fillStyle = '#f472b6'; ctx.fillRect(-r * 0.5, -r * 0.4, r, r * 0.22);
        } else if (hat === 'hat_cowboy') {
            fill('#92400e', () => ctx.ellipse(0, r * 0.35, r * 1.7, r * 0.35, 0, 0, TAU));
            fill('#b45309', () => { ctx.moveTo(-r * 0.8, r * 0.3); ctx.quadraticCurveTo(-r * 0.7, -r * 1.1, 0, -r * 0.7); ctx.quadraticCurveTo(r * 0.7, -r * 1.1, r * 0.8, r * 0.3); });
        } else if (hat === 'hat_headphones') {
            ctx.strokeStyle = '#1e293b'; ctx.lineWidth = r * 0.28;
            ctx.beginPath(); ctx.arc(0, r * 0.8, r * 1.1, Math.PI, TAU); ctx.stroke();
            fill('#ef4444', () => { ctx.arc(-r * 1.1, r * 0.9, r * 0.38, 0, TAU); ctx.arc(r * 1.1, r * 0.9, r * 0.38, 0, TAU); });
        } else if (hat === 'hat_tophat') {
            ctx.fillStyle = '#111827'; ctx.fillRect(-r * 0.75, -r * 1.5, r * 1.5, r * 1.8);
            ctx.fillRect(-r * 1.3, r * 0.2, r * 2.6, r * 0.28);
            ctx.fillStyle = '#dc2626'; ctx.fillRect(-r * 0.75, -r * 0.1, r * 1.5, r * 0.3);
        } else if (hat === 'hat_wizard') {
            fill('#4f46e5', () => { ctx.moveTo(-r * 1.1, r * 0.4); ctx.lineTo(r * 0.2, -r * 2.1); ctx.lineTo(r * 1.1, r * 0.4); });
            fill('#4338ca', () => ctx.ellipse(0, r * 0.4, r * 1.5, r * 0.3, 0, 0, TAU));
            fill('#fde047', () => ctx.arc(r * 0.1, -r * 0.5, r * 0.2, 0, TAU));
        } else if (hat === 'hat_viking') {
            fill('#9ca3af', () => ctx.arc(0, r * 0.4, r * 1.05, Math.PI, TAU));
            fill('#fef3c7', () => { ctx.moveTo(-r * 0.9, r * 0.1); ctx.lineTo(-r * 1.6, -r * 1.1); ctx.lineTo(-r * 0.6, -r * 0.3); });
            fill('#fef3c7', () => { ctx.moveTo(r * 0.9, r * 0.1); ctx.lineTo(r * 1.6, -r * 1.1); ctx.lineTo(r * 0.6, -r * 0.3); });
        } else if (hat === 'hat_halo') {
            ctx.strokeStyle = '#fde047'; ctx.lineWidth = r * 0.24;
            ctx.beginPath(); ctx.ellipse(0, -r * 0.7, r * 0.95, r * 0.28, 0, 0, TAU); ctx.stroke();
        } else if (hat === 'hat_crown') {
            fill('#facc15', () => {
                ctx.moveTo(-r * 0.95, r * 0.35); ctx.lineTo(-r * 1.0, -r * 0.95); ctx.lineTo(-r * 0.45, -r * 0.35);
                ctx.lineTo(0, -r * 1.1); ctx.lineTo(r * 0.45, -r * 0.35); ctx.lineTo(r * 1.0, -r * 0.95); ctx.lineTo(r * 0.95, r * 0.35);
            });
            fill('#ef4444', () => ctx.arc(0, -r * 0.1, r * 0.2, 0, TAU));
        } else if (hat === 'hat_beanie') {
            fill('#2563eb', () => ctx.arc(0, r * 0.4, r, Math.PI, TAU));
            ctx.fillStyle = '#f8fafc'; ctx.fillRect(-r, r * 0.15, r * 2, r * 0.32);
            fill('#f8fafc', () => ctx.arc(0, -r * 0.65, r * 0.28, 0, TAU));
        } else if (hat === 'hat_chef') {
            ctx.fillStyle = '#f8fafc'; ctx.fillRect(-r * 0.8, -r * 0.2, r * 1.6, r * 0.6);
            fill('#f8fafc', () => { ctx.arc(-r * 0.5, -r * 0.5, r * 0.55, 0, TAU); ctx.arc(0, -r * 0.95, r * 0.6, 0, TAU); ctx.arc(r * 0.5, -r * 0.5, r * 0.55, 0, TAU); });
        } else if (hat === 'hat_pirate') {
            fill('#111827', () => { ctx.moveTo(-r * 1.5, r * 0.4); ctx.quadraticCurveTo(0, -r * 1.8, r * 1.5, r * 0.4); });
            fill('#f8fafc', () => ctx.arc(0, -r * 0.25, r * 0.25, 0, TAU));
        } else if (hat === 'hat_bunny') {
            fill('#f8fafc', () => { ctx.ellipse(-r * 0.45, -r * 1.0, r * 0.25, r * 0.9, -0.15, 0, TAU); ctx.ellipse(r * 0.45, -r * 1.0, r * 0.25, r * 0.9, 0.15, 0, TAU); });
            fill('#f9a8d4', () => { ctx.ellipse(-r * 0.45, -r * 1.0, r * 0.11, r * 0.6, -0.15, 0, TAU); ctx.ellipse(r * 0.45, -r * 1.0, r * 0.11, r * 0.6, 0.15, 0, TAU); });
        } else if (hat === 'hat_cat') {
            fill('#f59e0b', () => { ctx.moveTo(-r * 0.95, r * 0.2); ctx.lineTo(-r * 0.8, -r * 0.95); ctx.lineTo(-r * 0.1, -r * 0.2); });
            fill('#f59e0b', () => { ctx.moveTo(r * 0.95, r * 0.2); ctx.lineTo(r * 0.8, -r * 0.95); ctx.lineTo(r * 0.1, -r * 0.2); });
        } else if (hat === 'hat_flower') {
            for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; fill('#f472b6', () => ctx.arc(r * 0.5 + Math.cos(a) * r * 0.4, -r * 0.2 + Math.sin(a) * r * 0.4, r * 0.28, 0, TAU)); }
            fill('#fde047', () => ctx.arc(r * 0.5, -r * 0.2, r * 0.22, 0, TAU));
        } else if (hat === 'hat_horns') {
            fill('#dc2626', () => { ctx.moveTo(-r * 0.9, r * 0.1); ctx.quadraticCurveTo(-r * 1.4, -r * 0.9, -r * 0.5, -r * 1.0); ctx.lineTo(-r * 0.5, -r * 0.2); });
            fill('#dc2626', () => { ctx.moveTo(r * 0.9, r * 0.1); ctx.quadraticCurveTo(r * 1.4, -r * 0.9, r * 0.5, -r * 1.0); ctx.lineTo(r * 0.5, -r * 0.2); });
        } else if (hat === 'hat_santa') {
            fill('#dc2626', () => { ctx.moveTo(-r, r * 0.4); ctx.quadraticCurveTo(-r * 0.2, -r * 1.7, r * 1.2, -r * 0.3); ctx.lineTo(r, r * 0.4); });
            ctx.fillStyle = '#f8fafc'; ctx.fillRect(-r * 1.05, r * 0.1, r * 2.1, r * 0.34);
            fill('#f8fafc', () => ctx.arc(r * 1.2, -r * 0.3, r * 0.3, 0, TAU));
        } else if (hat === 'hat_grad') {
            ctx.fillStyle = '#111827'; ctx.fillRect(-r * 0.7, -r * 0.2, r * 1.4, r * 0.6);
            fill('#1f2937', () => { ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 1.5, -r * 0.4); ctx.lineTo(0, r * 0.1); ctx.lineTo(-r * 1.5, -r * 0.4); });
            ctx.strokeStyle = '#facc15'; ctx.lineWidth = r * 0.12;
            ctx.beginPath(); ctx.moveTo(r * 1.2, -r * 0.35); ctx.lineTo(r * 1.2, r * 0.5); ctx.stroke();
        } else if (hat === 'hat_propeller') {
            fill('#3b82f6', () => ctx.arc(0, r * 0.4, r * 0.95, Math.PI, TAU));
            ctx.fillStyle = '#ef4444'; ctx.fillRect(-r * 0.12, -r * 0.9, r * 0.24, r * 0.5);
            fill('#facc15', () => { ctx.ellipse(-r * 0.6, -r * 0.95, r * 0.65, r * 0.14, 0, 0, TAU); ctx.ellipse(r * 0.6, -r * 0.95, r * 0.65, r * 0.14, 0, 0, TAU); });
        } else if (hat === 'hat_helmet') {
            fill('#64748b', () => ctx.arc(0, r * 0.4, r * 1.1, Math.PI, TAU));
            ctx.fillStyle = '#e2e8f0'; ctx.fillRect(-r * 0.12, -r * 0.7, r * 0.24, r * 1.1);
            ctx.fillStyle = '#334155'; ctx.fillRect(-r * 1.1, r * 0.25, r * 2.2, r * 0.2);
        } else if (hat === 'hat_straw') {
            fill('#fcd34d', () => ctx.ellipse(0, r * 0.35, r * 1.8, r * 0.3, 0, 0, TAU));
            fill('#fbbf24', () => ctx.arc(0, r * 0.3, r * 0.85, Math.PI, TAU));
            ctx.fillStyle = '#dc2626'; ctx.fillRect(-r * 0.85, r * 0.05, r * 1.7, r * 0.2);
        }
        ctx.restore();
    }

    // Side-on character. (x, y) is the top-left of the body box.
    function drawFigureSide(ctx, p, x, y, w, h, face, time, running, alpha = 1) {
        const c = who(p);
        const body = c.skin?.body || c.color;
        const head = c.skin?.head || '#fde7c8';
        const cx = x + w / 2;
        const run = running ? Math.sin(time * 18) : 0;
        const bob = running ? Math.abs(Math.sin(time * 9)) * 1.5 : Math.sin(time * 3) * 0.8;
        ctx.save();
        ctx.globalAlpha = alpha * (c.skin?.alpha || 1);
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(x + 2, y + h - 2, w - 4, 3);
        if (c.acc === 'acc_wings') {
            ctx.fillStyle = 'rgba(226,232,240,.9)';
            const flap = Math.sin(time * 10) * 4;
            ctx.beginPath(); ctx.moveTo(cx - face * w * 0.3, y + 16); ctx.quadraticCurveTo(cx - face * w * 1.6, y - 6 + flap, cx - face * w * 1.1, y + 30); ctx.fill();
        }
        if (c.acc === 'acc_cape') {
            ctx.fillStyle = '#dc2626';
            ctx.beginPath(); ctx.moveTo(cx - face * 3, y + 14); ctx.lineTo(cx - face * (w * 0.9 + run * 4), y + h - 8); ctx.lineTo(cx - face * 2, y + h - 12); ctx.fill();
        }
        if (c.acc === 'acc_backpack') {
            ctx.fillStyle = '#b45309'; roundRect(ctx, cx - face * w * 0.78 - 5, y + 16 + bob, 10, 20, 3); ctx.fill();
        }
        if (c.acc === 'acc_phoenix') {
            const flap = Math.sin(time * 9) * 5;
            ctx.fillStyle = '#f97316';
            ctx.beginPath(); ctx.moveTo(cx - face * w * 0.3, y + 16); ctx.quadraticCurveTo(cx - face * w * 1.8, y - 10 + flap, cx - face * w * 1.2, y + 34); ctx.lineTo(cx - face * w * 0.3, y + 28); ctx.fill();
            ctx.fillStyle = '#fde047';
            ctx.beginPath(); ctx.moveTo(cx - face * w * 0.3, y + 18); ctx.quadraticCurveTo(cx - face * w * 1.2, y + 2 + flap, cx - face * w * 0.9, y + 28); ctx.fill();
        }
        if (c.acc === 'acc_fairy') {
            const flap = Math.sin(time * 12) * 0.15;
            ctx.fillStyle = 'rgba(244,114,182,.65)';
            ctx.beginPath(); ctx.ellipse(cx - face * w * 0.55, y + 14 + bob, 6, 15, -face * (0.5 + flap), 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(147,197,253,.65)';
            ctx.beginPath(); ctx.ellipse(cx - face * w * 0.5, y + 28 + bob, 5, 10, face * (0.6 + flap), 0, TAU); ctx.fill();
        }
        if (c.acc === 'acc_jetpack') {
            ctx.fillStyle = '#64748b'; roundRect(ctx, cx - face * w * 0.78 - 6, y + 14 + bob, 12, 22, 3); ctx.fill();
            ctx.fillStyle = '#f97316';
            const fl = 6 + Math.sin(time * 30) * 3;
            ctx.beginPath(); ctx.moveTo(cx - face * w * 0.78 - 4, y + 36 + bob); ctx.lineTo(cx - face * w * 0.78, y + 36 + fl + bob); ctx.lineTo(cx - face * w * 0.78 + 4, y + 36 + bob); ctx.fill();
        }
        if (c.acc === 'acc_sword') {
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(cx - face * 3, y + 36 + bob); ctx.lineTo(cx - face * 15, y + 2 + bob); ctx.stroke();
            ctx.strokeStyle = '#92400e'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(cx - face * 2, y + 40 + bob); ctx.lineTo(cx - face * 4, y + 34 + bob); ctx.stroke();
        }
        if (c.acc === 'acc_tail') {
            const wag = Math.sin(time * 6) * 0.25;
            ctx.fillStyle = '#f97316';
            ctx.beginPath(); ctx.ellipse(cx - face * w * 0.8, y + h - 20 + bob, 6, 13, face * (0.7 + wag), 0, TAU); ctx.fill();
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath(); ctx.arc(cx - face * (w * 0.8 + 6), y + h - 30 + bob, 4, 0, TAU); ctx.fill();
        }
        if (c.acc === 'acc_flame') {
            for (let i = 0; i < 4; i++) {
                ctx.fillStyle = i % 2 ? 'rgba(251,191,36,.8)' : 'rgba(249,115,22,.75)';
                ctx.beginPath(); ctx.ellipse(x + w * (i / 3), y + h * 0.6, 4, 11 + Math.sin(time * 9 + i * 1.7) * 4, 0, 0, TAU); ctx.fill();
            }
        }
        ctx.fillStyle = c.skin?.trim || '#1e293b';
        ctx.fillRect(cx - 8 + run * 5, y + h - 14, 7, 14);
        ctx.fillRect(cx + 1 - run * 5, y + h - 14, 7, 14);
        ctx.fillStyle = body;
        roundRect(ctx, x, y + 12 + bob, w, h - 24, 8);
        ctx.fill();
        if (c.acc === 'acc_scarf') { ctx.fillStyle = '#ef4444'; ctx.fillRect(x + 1, y + 12 + bob, w - 2, 5); ctx.fillRect(cx - face * 6 - 2, y + 15 + bob, 5, 12); }
        ctx.fillStyle = head;
        ctx.beginPath(); ctx.arc(cx, y + 11 + bob, 11, 0, TAU); ctx.fill();
        if (!c.hat && !c.skin) { ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, y + 8 + bob, 11.5, Math.PI, TAU); ctx.fill(); }
        if (c.skin === SKINS.skin_ninja) { ctx.fillStyle = '#111827'; ctx.fillRect(cx - 11, y + 4 + bob, 22, 5); ctx.fillStyle = '#dc2626'; ctx.fillRect(cx - 11, y + 8 + bob, 22, 2); }
        if (c.skin === SKINS.skin_robot) { ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, y + bob); ctx.lineTo(cx, y - 7 + bob); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(cx, y - 8 + bob, 2.5, 0, TAU); ctx.fill(); }
        if (c.skin === SKINS.skin_alien) { ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 5, y + 1 + bob); ctx.lineTo(cx - 8, y - 6 + bob); ctx.moveTo(cx + 5, y + 1 + bob); ctx.lineTo(cx + 8, y - 6 + bob); ctx.stroke(); }
        ctx.fillStyle = c.skin?.eye || '#0f172a';
        ctx.fillRect(cx + face * 4 - 1.5, y + 9 + bob, 3, 4);
        if (c.acc === 'acc_shades') { ctx.fillStyle = '#0f172a'; ctx.fillRect(cx + face * 4 - 6, y + 8 + bob, 12, 5); }
        if (c.acc === 'acc_monocle') { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx + face * 5, y + 11 + bob, 4.5, 0, TAU); ctx.stroke(); }
        if (c.acc === 'acc_eyepatch') { ctx.fillStyle = '#0f172a'; ctx.fillRect(cx + face * 4 - 3, y + 8 + bob, 6, 5); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - 11, y + 5 + bob); ctx.lineTo(cx + 11, y + 12 + bob); ctx.stroke(); }
        if (c.acc === 'acc_bowtie') { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(cx, y + 21 + bob); ctx.lineTo(cx - 7, y + 17 + bob); ctx.lineTo(cx - 7, y + 25 + bob); ctx.moveTo(cx, y + 21 + bob); ctx.lineTo(cx + 7, y + 17 + bob); ctx.lineTo(cx + 7, y + 25 + bob); ctx.fill(); }
        if (c.acc === 'acc_sparkles') { ctx.font = '10px serif'; ctx.textAlign = 'center'; for (let i = 0; i < 3; i++) { const a = time * 2 + i * 2.1; ctx.globalAlpha = 0.6 + Math.sin(time * 6 + i) * 0.4; ctx.fillText('✨', cx + Math.cos(a) * (w * 0.9), y + 22 + Math.sin(a) * 18); } ctx.globalAlpha = alpha; }
        const orbit = { acc_hearts: '❤️', acc_stars: '⭐', acc_snow: '❄️' }[c.acc];
        if (orbit) { ctx.font = '9px serif'; ctx.textAlign = 'center'; for (let i = 0; i < 3; i++) { const a = time * 1.6 + i * 2.1; ctx.fillText(orbit, cx + Math.cos(a) * (w * 0.85), y + 20 + Math.sin(a) * 20); } }
        if (c.acc === 'acc_glasses') { ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx + face * 5, y + 11 + bob, 4, 0, TAU); ctx.moveTo(cx + face * 1, y + 11 + bob); ctx.lineTo(cx - face * 10, y + 9 + bob); ctx.stroke(); }
        if (c.acc === 'acc_mask') { ctx.fillStyle = '#7c3aed'; ctx.fillRect(cx - 10, y + 7 + bob, 20, 6); ctx.fillStyle = '#f8fafc'; ctx.fillRect(cx + face * 4 - 1.5, y + 8.5 + bob, 3, 3); }
        if (c.acc === 'acc_headband') { ctx.fillStyle = '#ef4444'; ctx.fillRect(cx - 11, y + 3 + bob, 22, 3.5); ctx.beginPath(); ctx.moveTo(cx - face * 10, y + 4 + bob); ctx.lineTo(cx - face * 19, y + 7 + bob + run * 2); ctx.lineTo(cx - face * 10, y + 7.5 + bob); ctx.fill(); }
        if (c.acc === 'acc_bandana') { ctx.fillStyle = '#2563eb'; ctx.fillRect(cx - 11, y + 2 + bob, 22, 5); ctx.beginPath(); ctx.moveTo(cx - face * 10, y + 3 + bob); ctx.lineTo(cx - face * 18, y + 9 + bob + run * 2); ctx.lineTo(cx - face * 10, y + 7 + bob); ctx.fill(); }
        if (c.acc === 'acc_goggles') { ctx.fillStyle = '#0f172a'; ctx.fillRect(cx - 11, y + 3 + bob, 22, 3); ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(cx + face * 3, y + 4.5 + bob, 5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.stroke(); }
        if (c.acc === 'acc_mustache') { ctx.fillStyle = '#451a03'; ctx.beginPath(); ctx.ellipse(cx + face * 6, y + 15.5 + bob, 5, 2, 0, 0, TAU); ctx.fill(); }
        if (c.acc === 'acc_beard') { ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.arc(cx, y + 13 + bob, 10.5, 0.15, Math.PI - 0.15); ctx.fill(); }
        if (c.acc === 'acc_chain') { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx, y + 15 + bob, 7, 0.2, Math.PI - 0.2); ctx.stroke(); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(cx, y + 24 + bob, 2.5, 0, TAU); ctx.fill(); }
        if (c.acc === 'acc_tie') { ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.moveTo(cx - 3, y + 18 + bob); ctx.lineTo(cx + 3, y + 18 + bob); ctx.lineTo(cx + 2.5, y + 30 + bob); ctx.lineTo(cx, y + 33 + bob); ctx.lineTo(cx - 2.5, y + 30 + bob); ctx.fill(); }
        if (c.acc === 'acc_medal') { ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 6, y + 15 + bob); ctx.lineTo(cx, y + 26 + bob); ctx.lineTo(cx + 6, y + 15 + bob); ctx.stroke(); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(cx, y + 28 + bob, 4, 0, TAU); ctx.fill(); }
        drawHat(ctx, c.hat, cx, y + 3 + bob, 10, face * 0.08);
        ctx.restore();
    }

    // Top-down character; the body faces `aim` and hats are drawn upright on top.
    function drawFigureTop(ctx, p, x, y, r, aim, time, alpha = 1) {
        const c = who(p);
        const body = c.skin?.body || c.color;
        ctx.save();
        ctx.globalAlpha = alpha * (c.skin?.alpha || 1);
        ctx.translate(x, y);
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath(); ctx.ellipse(2, 4, r, r * 0.8, 0, 0, TAU); ctx.fill();
        ctx.save();
        ctx.rotate(aim);
        if (c.acc === 'acc_cape') { ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.9); ctx.lineTo(-r * 1.7, 0); ctx.lineTo(-r * 0.2, r * 0.9); ctx.fill(); }
        if (c.acc === 'acc_wings') { ctx.fillStyle = 'rgba(226,232,240,.9)'; const f = Math.sin(time * 10) * 0.12; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 1.15, r * 0.35, r * (1 + f), 0.4, 0, TAU); ctx.ellipse(-r * 0.3, r * 1.15, r * 0.35, r * (1 + f), -0.4, 0, TAU); ctx.fill(); }
        if (c.acc === 'acc_backpack') { ctx.fillStyle = '#b45309'; roundRect(ctx, -r * 1.25, -r * 0.5, r * 0.7, r, 3); ctx.fill(); }
        if (c.acc === 'acc_jetpack') { ctx.fillStyle = '#64748b'; roundRect(ctx, -r * 1.3, -r * 0.5, r * 0.7, r, 3); ctx.fill(); ctx.fillStyle = '#f97316'; ctx.fillRect(-r * 1.6 - Math.sin(time * 30) * 2, -r * 0.25, r * 0.4, r * 0.5); }
        if (c.acc === 'acc_tail') { ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.ellipse(-r * 1.3, Math.sin(time * 6) * r * 0.3, r * 0.6, r * 0.28, 0, 0, TAU); ctx.fill(); }
        if (c.acc === 'acc_fairy' || c.acc === 'acc_phoenix') { ctx.fillStyle = c.acc === 'acc_fairy' ? 'rgba(244,114,182,.7)' : 'rgba(249,115,22,.85)'; const f = Math.sin(time * 10) * 0.12; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 1.15, r * 0.35, r * (1 + f), 0.4, 0, TAU); ctx.ellipse(-r * 0.3, r * 1.15, r * 0.35, r * (1 + f), -0.4, 0, TAU); ctx.fill(); }
        if (c.acc === 'acc_flame') { ctx.fillStyle = 'rgba(249,115,22,.55)'; ctx.beginPath(); ctx.arc(0, 0, r * (1.35 + Math.sin(time * 9) * 0.1), 0, TAU); ctx.fill(); }
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.fillStyle = c.skin?.trim || 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.arc(0, 0, r, -0.9, 0.9); ctx.lineTo(0, 0); ctx.fill();
        if (c.acc === 'acc_scarf') { ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0.6, 2.6); ctx.stroke(); }
        ctx.fillStyle = c.skin?.head || '#fde7c8';
        ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.62, 0, TAU); ctx.fill();
        ctx.fillStyle = c.skin?.eye || '#0f172a';
        ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.2, r * 0.1, 0, TAU); ctx.arc(r * 0.5, r * 0.2, r * 0.1, 0, TAU); ctx.fill();
        if (c.acc === 'acc_shades') { ctx.fillStyle = '#0f172a'; ctx.fillRect(r * 0.4, -r * 0.34, r * 0.26, r * 0.68); }
        if (c.acc === 'acc_monocle') { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(r * 0.55, r * 0.2, r * 0.18, 0, TAU); ctx.stroke(); }
        if (c.acc === 'acc_headband' || c.acc === 'acc_bandana') { ctx.strokeStyle = c.acc === 'acc_headband' ? '#ef4444' : '#2563eb'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.62, -1.2, 1.2); ctx.stroke(); }
        if (c.acc === 'acc_glasses' || c.acc === 'acc_goggles' || c.acc === 'acc_mask') { ctx.fillStyle = c.acc === 'acc_mask' ? '#7c3aed' : '#0f172a'; ctx.fillRect(r * 0.4, -r * 0.34, r * 0.26, r * 0.68); }
        if (c.acc === 'acc_medal' || c.acc === 'acc_chain') { ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(r * 0.3, 0, r * 0.14, 0, TAU); ctx.fill(); }
        const orbitTop = { acc_hearts: '❤️', acc_stars: '⭐', acc_snow: '❄️' }[c.acc];
        ctx.restore();
        if (orbitTop) { ctx.font = `${Math.round(r * 0.7)}px serif`; ctx.textAlign = 'center'; for (let i = 0; i < 3; i++) { const a = time * 1.6 + i * 2.1; ctx.fillText(orbitTop, Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5); } }
        if (c.hat) drawHat(ctx, c.hat, 0, -r * 0.55, r * 0.55);
        ctx.restore();
    }

    window.StudBudArcade = {
        Session, BaseGame, Particles, Resource, games: {},
        util: { TAU, clamp, lerp, dist, overlap, mulberry32, hashStr, moveBody, pushCircleOutOfRect, roundRect, nameTag, esc, who, drawHat, drawFigureSide, drawFigureTop }
    };
})(window);
