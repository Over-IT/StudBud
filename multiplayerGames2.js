(function (window) {
    'use strict';

    const A = window.StudBudArcade;
    const { TAU, clamp, lerp, dist, overlap, mulberry32, pushCircleOutOfRect, roundRect, nameTag, drawFigureTop } = A.util;

    const clock = s => (Date.now() - s.startedAt) / 1000;
    const mod = (n, m) => ((n % m) + m) % m;

    /* Shared top-down world: movement, collisions, follow camera, player drawing. */
    class Arena extends A.BaseGame {
        constructor(s, W, H) {
            super(s);
            this.W = W; this.H = H;
            this.walls = [];
            this.me = { x: W / 2, y: H / 2, r: 15, vx: 0, vy: 0, aim: 0 };
            this.cam = { x: W / 2, y: H / 2 };
            this.camX = W / 2; this.camY = H / 2;
            this.anim = 0; this.zoom = 1;
            this.baseSpeed = 250; this.speedMul = 1; this.moving = false; this.stun = 0;
        }

        step(dt, accel = 2400) {
            const s = this.s, me = this.me;
            this.anim += dt;
            this.stun = Math.max(0, this.stun - dt);
            const a = this.stun > 0 ? { x: 0, y: 0 } : s.axis();
            const len = Math.hypot(a.x, a.y) || 1;
            const sp = this.baseSpeed * this.speedMul;
            const tx = a.x || a.y ? (a.x / len) * sp : 0;
            const ty = a.x || a.y ? (a.y / len) * sp : 0;
            const acc = accel * dt;
            me.vx += clamp(tx - me.vx, -acc, acc);
            me.vy += clamp(ty - me.vy, -acc, acc);
            me.x += me.vx * dt; me.y += me.vy * dt;
            for (const w of this.walls) pushCircleOutOfRect(me, w);
            me.x = clamp(me.x, me.r, this.W - me.r);
            me.y = clamp(me.y, me.r, this.H - me.r);
            this.moving = Math.hypot(me.vx, me.vy) > 30;
            if (this.moving && !this.aimLocked) me.aim = Math.atan2(me.vy, me.vx);
            const k = Math.min(1, dt * 6);
            this.cam.x += (me.x - this.cam.x) * k;
            this.cam.y += (me.y - this.cam.y) * k;
            this.particles.update(dt);
        }

        mouseWorld() {
            const s = this.s;
            return { x: this.camX + (s.mouse.x - s.vw / 2) / this.zoom, y: this.camY + (s.mouse.y - s.vh / 2) / this.zoom };
        }

        begin(ctx, w, h, zoomBase = 820) {
            this.zoom = clamp(h / zoomBase, 0.6, 1.25);
            const hw = w / this.zoom / 2, hh = h / this.zoom / 2;
            this.camX = this.W <= hw * 2 ? this.W / 2 : clamp(this.cam.x, hw, this.W - hw);
            this.camY = this.H <= hh * 2 ? this.H / 2 : clamp(this.cam.y, hh, this.H - hh);
            this.x0 = this.camX - hw; this.x1 = this.camX + hw; this.y0 = this.camY - hh; this.y1 = this.camY + hh;
            ctx.save();
            ctx.translate(w / 2, h / 2);
            ctx.scale(this.zoom, this.zoom);
            ctx.translate(-this.camX, -this.camY);
        }

        end(ctx) { ctx.restore(); }

        seen(x, y, pad = 80) { return x > this.x0 - pad && x < this.x1 + pad && y > this.y0 - pad && y < this.y1 + pad; }

        drawPlayers(ctx, extra) {
            const s = this.s, me = this.me;
            for (const r of s.remoteList()) {
                if (!this.seen(r.x, r.y)) continue;
                drawFigureTop(ctx, r, r.x, r.y, 15, r.f || 0, this.anim + r.x * 0.01, 0.95);
                if (extra) extra(ctx, r.x, r.y, r);
                nameTag(ctx, r.name || '', r.x, r.y - 30, r.color);
            }
            const alpha = this.stun > 0 ? 0.5 + Math.sin(this.anim * 30) * 0.3 : 1;
            drawFigureTop(ctx, s.local, me.x, me.y, 15, me.aim, this.anim, alpha);
            if (extra) extra(ctx, me.x, me.y, null);
            nameTag(ctx, 'You', me.x, me.y - 30, '#fff');
        }

        net() {
            const me = this.me;
            return { x: Math.round(me.x), y: Math.round(me.y), vx: Math.round(me.vx), vy: Math.round(me.vy), f: +me.aim.toFixed(2), a: this.moving ? 1 : 0, ex: this.ex ? this.ex() : {} };
        }

        ring(ctx, x, y, r, color, width = 3) {
            ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        }

        qMark(ctx, x, y, color, pulse) {
            const r = 20 + Math.sin(pulse * 4) * 2;
            ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 6, r, r * 0.8, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = '900 24px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', x, y + 8);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Crystal Cartel: dig for ore, avoid lava, bank your haul             */
    /* ------------------------------------------------------------------ */
    const TS = 48, COLS = 70, ROWS = 46;
    const DIG_TIME = [0, 0.28, 0.62, 0.4, 0.55, 0.7, 0, 0.5, 9999];
    const ORE_VALUE = { 3: 5, 4: 15, 5: 40 };
    const LAVA_REACH = 5;

    class Miner extends Arena {
        constructor(s) {
            super(s, COLS * TS, ROWS * TS);
            this.title = 'Crystal Mining';
            this.scoreGoal = false; this.goalUnit = 'crystals'; this.goalLabel = 'Crystals';
            this.touchMain = 'Dig';
            const r = mulberry32(s.seed);
            const T = this.T = new Uint8Array(COLS * ROWS);
            for (let y = 4; y < ROWS; y++) {
                for (let x = 0; x < COLS; x++) {
                    const depth = y - 4;
                    let t = r() < 0.05 + depth * 0.004 ? 2 : 1;
                    const o = r();
                    if (o < 0.07) t = 3;
                    else if (o >= 0.07 && o < 0.11 && depth > 8) t = 4;
                    else if (o >= 0.11 && o < 0.135 && depth > 18) t = 5;
                    else if (o >= 0.135 && o < 0.17 && depth > 10) t = 6;
                    else if (o >= 0.17 && o < 0.178) t = 7;
                    T[y * COLS + x] = t;
                }
            }
            for (let k = 0; k < 16; k++) {
                let x = 2 + Math.floor(r() * (COLS - 4)), y = 6 + Math.floor(r() * (ROWS - 8));
                for (let i = 0; i < 55; i++) {
                    if (T[y * COLS + x] !== 6) T[y * COLS + x] = 0;
                    const d = Math.floor(r() * 4);
                    x = clamp(x + (d === 0 ? 1 : d === 1 ? -1 : 0), 1, COLS - 2);
                    y = clamp(y + (d === 2 ? 1 : d === 3 ? -1 : 0), 4, ROWS - 2);
                }
            }
            for (let y = 4; y < 6; y++) for (let x = 27; x < 43; x++) T[y * COLS + x] = 0;
            for (let y = 0; y < ROWS; y++) { T[y * COLS] = 8; T[y * COLS + COLS - 1] = 8; }
            for (let x = 0; x < COLS; x++) T[(ROWS - 1) * COLS + x] = 8;
            this.base = { x: 30 * TS, y: 0, w: 10 * TS, h: 3 * TS };
            this.me.x = 35 * TS; this.me.y = 2.3 * TS;
            this.cam.x = this.me.x; this.cam.y = this.me.y;
            this.carry = 0; this.items = 0; this.cap = 14; this.dig = { tx: -1, ty: -1, p: 0 }; this.banked = 0;
            this.baseSpeed = 235; this.aimLocked = false; this.depthMax = 0;
            this.res = new A.Resource('Energy', '#facc15', 100, 70, 2);
            this.F = new Uint8Array(COLS * ROWS);
            this.flowing = new Set();
            this.flowClock = 0;
        }

        // Minecraft-style lava: once a block next to lava is opened the lava creeps outward and downward, thinning with distance.
        wakeLava(tx, ty) {
            for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const x = tx + dx, y = ty + dy;
                if (x >= 0 && y >= 0 && x < COLS && y < ROWS && this.T[y * COLS + x] === 6) this.flowing.add(y * COLS + x);
            }
        }

        flowLava(dt) {
            if (!this.flowing.size) return;
            this.flowClock += dt;
            if (this.flowClock < 0.45) return;
            this.flowClock = 0;
            const active = [...this.flowing];
            this.flowing.clear();
            for (const idx of active) {
                const d = this.F[idx];
                if (this.T[idx] !== 6 || d >= LAVA_REACH) continue;
                const x = idx % COLS, y = Math.floor(idx / COLS);
                for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0]]) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 1 || nx >= COLS - 1 || ny < 4 || ny >= ROWS - 1) continue;
                    if (ny < 6 && nx >= 27 && nx < 43) continue;
                    const n = ny * COLS + nx;
                    if (this.T[n] !== 0) continue;
                    this.T[n] = 6; this.F[n] = d + 1;
                    this.flowing.add(n);
                    this.particles.burst(nx * TS + TS / 2, ny * TS + TS / 2, '#fb923c', 5, 90, 0.4, 3);
                }
            }
        }

        tile(tx, ty) { return tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? 8 : this.T[ty * COLS + tx]; }
        solid(t) { return t !== 0 && t !== 6; }

        update(dt) {
            const s = this.s, me = this.me;
            this.step(dt, 3000);
            const tx0 = Math.floor(me.x / TS), ty0 = Math.floor(me.y / TS);
            for (let ty = ty0 - 2; ty <= ty0 + 2; ty++) for (let tx = tx0 - 2; tx <= tx0 + 2; tx++) {
                if (this.solid(this.tile(tx, ty))) pushCircleOutOfRect(me, { x: tx * TS, y: ty * TS, w: TS, h: TS });
            }
            if (this.tile(Math.floor(me.x / TS), Math.floor(me.y / TS)) === 6 && this.stun <= 0) {
                if (this.carry > 0) s.toast('Lava! You dropped your haul', '#f97316');
                else s.toast('Lava!', '#f97316');
                this.carry = 0; this.items = 0;
                this.particles.burst(me.x, me.y, '#f97316', 24, 260, 0.6, 5);
                me.x = 35 * TS; me.y = 2.3 * TS; me.vx = me.vy = 0; this.stun = 1.2;
            }
            this.depthMax = Math.max(this.depthMax, Math.floor(me.y / TS) - 3);
            this.flowLava(dt);

            const m = this.mouseWorld();
            const digging = s.mouse.down || s.down('Space', 'KeyE');
            this.aimLocked = digging;
            if (digging && this.stun <= 0 && !this.res.has(0.5)) s.spend(1);
            if (digging && this.stun <= 0 && this.res.has(0.5)) {
                let tx, ty;
                if (s.mouse.down && dist(m.x, m.y, me.x, me.y) < 120) {
                    tx = Math.floor(m.x / TS); ty = Math.floor(m.y / TS);
                    me.aim = Math.atan2(m.y - me.y, m.x - me.x);
                } else {
                    if (s.mouse.down) me.aim = Math.atan2(m.y - me.y, m.x - me.x);
                    tx = Math.floor((me.x + Math.cos(me.aim) * 34) / TS); ty = Math.floor((me.y + Math.sin(me.aim) * 34) / TS);
                }
                const t = this.tile(tx, ty);
                const reach = dist(me.x, me.y, tx * TS + TS / 2, ty * TS + TS / 2) < 96;
                if (this.solid(t) && t !== 8 && reach) {
                    if (this.dig.tx !== tx || this.dig.ty !== ty) this.dig = { tx, ty, p: 0 };
                    this.dig.p += dt;
                    this.res.drain(7 * dt);
                    if (Math.random() < dt * 22) this.particles.burst(tx * TS + TS / 2, ty * TS + TS / 2, '#a16207', 2, 90, 0.35, 3);
                    if (this.dig.p >= DIG_TIME[t]) this.breakTile(tx, ty, t, true);
                } else this.dig.p = 0;
            } else this.dig.p = 0;

            if (overlap({ x: me.x - 10, y: me.y - 10, w: 20, h: 20 }, this.base) && this.carry > 0) {
                s.addScore(this.carry);
                this.banked += this.carry;
                s.toast(`Banked ${this.carry} crystals!`, '#fbbf24');
                this.particles.burst(me.x, me.y, '#fbbf24', 26, 300, 0.7, 5);
                this.carry = 0; this.items = 0;
            }
            s.setGoal(this.banked);
        }

        breakTile(tx, ty, t, mine) {
            this.T[ty * COLS + tx] = 0;
            this.wakeLava(tx, ty);
            const cx = tx * TS + TS / 2, cy = ty * TS + TS / 2;
            const color = { 1: '#a16207', 2: '#94a3b8', 3: '#fb923c', 4: '#facc15', 5: '#22d3ee', 7: '#c084fc' }[t] || '#a16207';
            this.particles.burst(cx, cy, color, t > 2 ? 14 : 8, 170, 0.5, 4);
            if (!mine) return;
            this.s.emit({ k: 'dg', x: tx, y: ty, t });
            this.dig = { tx: -1, ty: -1, p: 0 };
            if (ORE_VALUE[t]) {
                if (this.items >= this.cap) this.s.toast('Bag full — return to base to bank!', '#fbbf24');
                else { this.carry += ORE_VALUE[t]; this.items++; }
            } else if (t === 7) {
                this.s.ask(correct => {
                    if (correct) { this.s.refill(); this.s.addScore(120); this.banked += 120; this.s.toast('Treasure vault cracked: +120', '#c084fc'); this.particles.burst(cx, cy, '#c084fc', 30, 320, 0.8, 5); }
                    else if (correct === false) this.s.toast('The vault stayed locked.', '#f87171');
                });
            }
        }

        onEvent(ev) {
            if (ev.k === 'dg' && this.tile(ev.x, ev.y) !== 0) this.breakTile(ev.x, ev.y, ev.t, false);
        }

        ex() { return { c: this.carry }; }
        goalText() { return `Banked ${this.banked} · Bag ${this.items}/${this.cap} (${this.carry})`; }
        touchLayout() { return { stick: true, buttons: [{ k: 'Space', label: 'Dig', cls: 'main' }] }; }
        hint() { return 'WASD move · hold click to dig · bank ore at base · avoid lava · Q = recharge'; }

        draw(ctx, w, h) {
            const s = this.s, me = this.me;
            ctx.fillStyle = '#1b1208'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h);
            const sky = ctx.createLinearGradient(0, 0, 0, 3 * TS);
            sky.addColorStop(0, '#38bdf8'); sky.addColorStop(1, '#bae6fd');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, this.W, 3 * TS);
            ctx.fillStyle = '#4ade80'; ctx.fillRect(0, 3 * TS - 14, this.W, 14 + TS);
            const c0 = Math.max(0, Math.floor(this.x0 / TS)), c1 = Math.min(COLS - 1, Math.ceil(this.x1 / TS));
            const r0 = Math.max(0, Math.floor(this.y0 / TS)), r1 = Math.min(ROWS - 1, Math.ceil(this.y1 / TS));
            const time = this.anim;
            for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
                const t = this.T[ty * COLS + tx];
                const x = tx * TS, y = ty * TS;
                if (ty < 4 && t === 0) continue;
                if (t === 0) {
                    ctx.fillStyle = '#2b1b0c'; ctx.fillRect(x, y, TS, TS);
                    continue;
                }
                if (t === 6) {
                    const fd = this.F[ty * COLS + tx];
                    ctx.fillStyle = '#2b1b0c'; ctx.fillRect(x, y, TS, TS);
                    ctx.fillStyle = `rgba(${fd ? 251 : 249},${fd ? 146 : 115},22,${(fd ? 0.8 - fd * 0.1 : 0.75) + Math.sin(time * 4 + tx) * 0.15})`; ctx.fillRect(x + 3, y + 3, TS - 6, TS - 6);
                    if (!fd) { ctx.fillStyle = '#fde047'; ctx.fillRect(x + 12 + Math.sin(time * 3 + ty) * 6, y + 14, 10, 6); }
                    continue;
                }
                ctx.fillStyle = t === 2 ? '#64748b' : t === 8 ? '#0f172a' : '#92591c';
                ctx.fillRect(x, y, TS, TS);
                ctx.fillStyle = t === 2 ? '#475569' : t === 8 ? '#1e293b' : '#7a4814';
                ctx.fillRect(x + 4, y + 4, 10, 8); ctx.fillRect(x + 28, y + 26, 12, 10);
                ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1);
                if (t === 3 || t === 4) {
                    ctx.fillStyle = t === 3 ? '#fb923c' : '#facc15';
                    for (const [ox, oy] of [[10, 12], [28, 10], [20, 28], [32, 32]]) { ctx.beginPath(); ctx.arc(x + ox, y + oy, 5, 0, TAU); ctx.fill(); }
                } else if (t === 5) {
                    ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.moveTo(x + 24, y + 6); ctx.lineTo(x + 38, y + 22); ctx.lineTo(x + 24, y + 42); ctx.lineTo(x + 10, y + 22); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x + 20, y + 14, 4, 8);
                } else if (t === 7) {
                    ctx.fillStyle = '#7c3aed'; roundRect(ctx, x + 6, y + 10, TS - 12, TS - 20, 6); ctx.fill();
                    ctx.fillStyle = '#fde047'; ctx.font = '900 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', x + TS / 2, y + TS / 2 + 8);
                }
                if (this.dig.tx === tx && this.dig.ty === ty && DIG_TIME[t] < 9000) {
                    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x, y + TS - 8, TS, 8);
                    ctx.fillStyle = '#fde047'; ctx.fillRect(x, y + TS - 8, TS * clamp(this.dig.p / DIG_TIME[t], 0, 1), 8);
                }
            }
            const b = this.base;
            ctx.fillStyle = '#334155'; roundRect(ctx, b.x, b.y + 30, b.w, b.h - 36, 10); ctx.fill();
            ctx.fillStyle = '#fbbf24'; ctx.fillRect(b.x + 10, b.y + 44, b.w - 20, 14);
            ctx.fillStyle = '#0f172a'; ctx.font = '900 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('CRYSTAL BANK', b.x + b.w / 2, b.y + 100);
            this.drawPlayers(ctx, (c, x, y, r) => {
                const carry = r ? r.ex?.c : this.carry;
                if (carry > 0) { c.fillStyle = '#fbbf24'; c.font = '800 12px system-ui'; c.textAlign = 'center'; c.fillText(`◆ ${carry}`, x, y + 32); }
            });
            this.particles.draw(ctx);
            this.end(ctx);
            const depth = Math.max(0, Math.floor(me.y / TS) - 3);
            ctx.fillStyle = 'rgba(8,12,24,.6)'; roundRect(ctx, w - 130, h - 70, 116, 54, 12); ctx.fill();
            ctx.fillStyle = '#cbd5e1'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('DEPTH', w - 72, h - 50);
            ctx.fillStyle = '#fff'; ctx.font = '900 22px system-ui'; ctx.fillText(`${depth * 5}m`, w - 72, h - 26);
            ctx.fillStyle = `rgba(0,0,0,${clamp(depth / 80, 0, 0.5)})`; ctx.fillRect(0, 0, w, h);
        }
    }

    /* ------------------------------------------------------------------ */
    /* River Raiders: boat down a river, cast your net for fish            */
    /* ------------------------------------------------------------------ */
    const FISH = [
        { v: 5, r: 11, color: '#7dd3fc', name: 'Minnow' }, { v: 15, r: 14, color: '#4ade80', name: 'Bass' },
        { v: 40, r: 18, color: '#c084fc', name: 'Salmon' }, { v: 100, r: 17, color: '#fbbf24', name: 'Golden carp' }
    ];

    class River extends Arena {
        constructor(s) {
            super(s, 3600, 1800);
            this.title = 'River Fishing';
            this.scoreGoal = false; this.goalUnit = 'fish pts'; this.goalLabel = 'Haul';
            const r = mulberry32(s.seed);
            this.bank = 210;
            this.me.x = 400; this.me.y = this.H / 2; this.baseSpeed = 235;
            this.cam.x = this.me.x; this.cam.y = this.me.y;
            this.fish = [];
            for (let i = 0; i < 48; i++) {
                const kind = r();
                const type = kind < 0.55 ? 0 : kind < 0.82 ? 1 : kind < 0.96 ? 2 : 3;
                this.fish.push({ i, type, y0: 300 + r() * (this.H - 600), amp: 20 + r() * 80, fq: 0.4 + r() * 0.8, ph: r() * TAU, x0: r() * this.W, spd: (type === 3 ? 140 : 40 + r() * 80) * (r() < 0.5 ? 1 : -1) });
            }
            this.logs = [];
            for (let i = 0; i < 11; i++) this.logs.push({ y: 300 + r() * (this.H - 600), x0: r() * this.W, spd: 70 + r() * 80 });
            this.rocks = [];
            for (let i = 0; i < 22; i++) this.rocks.push({ x: 600 + r() * (this.W - 900), y: 330 + r() * (this.H - 660), r: 30 + r() * 24 });
            this.pools = [];
            for (let i = 0; i < 3; i++) this.pools.push({ x: 900 + i * 1050 + r() * 300, y: 450 + r() * (this.H - 900), r: 130 });
            this.chests = [];
            for (let i = 0; i < 10; i++) this.chests.push({ i, x: 700 + r() * (this.W - 1000), y: 330 + r() * (this.H - 660), until: 0 });
            this.away = new Map();
            this.duelCd = new Map(); this.duel = null;
            this.cast = null; this.castCd = 0; this.hurt = 0; this.haul = 0; this.catches = 0; this.combo = 0; this.comboT = 0;
            this.wake = [];
            this.res = new A.Resource('Bait', '#7dd3fc', 100, 50, 2);
        }

        fishPos(f, now) {
            return { x: mod(f.x0 + f.spd * now, this.W), y: f.y0 + Math.sin(now * f.fq + f.ph) * f.amp };
        }

        update(dt) {
            const s = this.s, me = this.me, now = clock(s);
            this.step(dt, 1800);
            this.castCd -= dt; this.hurt = Math.max(0, this.hurt - dt); this.comboT -= dt;
            if (this.comboT <= 0) this.combo = 0;
            me.vx += 42 * dt;
            // banks
            if (me.y < this.bank + me.r) { me.y = this.bank + me.r; me.vy = Math.max(0, me.vy); }
            if (me.y > this.H - this.bank - me.r) { me.y = this.H - this.bank - me.r; me.vy = Math.min(0, me.vy); }
            if (me.x > this.W - 60) me.x = 120;
            for (const rock of this.rocks) {
                const d = dist(me.x, me.y, rock.x, rock.y);
                if (d < rock.r + me.r) {
                    me.x = rock.x + (me.x - rock.x) / d * (rock.r + me.r); me.y = rock.y + (me.y - rock.y) / d * (rock.r + me.r); me.vx *= 0.5; me.vy *= 0.5;
                    if (this.hurt <= 0) { this.hurt = 1; this.loseFish(); this.particles.burst(me.x, me.y, '#94a3b8', 10, 160, 0.4, 3); }
                }
            }
            for (const lg of this.logs) {
                const x = mod(lg.x0 + lg.spd * now, this.W);
                const rect = { x: x - 70, y: lg.y - 18, w: 140, h: 36 };
                if (pushCircleOutOfRect(me, rect) && this.hurt <= 0) { this.hurt = 1; me.vx = 160; this.loseFish(); this.particles.burst(me.x, me.y, '#a16207', 10, 160, 0.4, 3); }
            }
            this.duelCheck(now);
            for (const p of this.pools) {
                const d = dist(me.x, me.y, p.x, p.y);
                if (d < p.r) {
                    const pull = (1 - d / p.r) * 520 * dt;
                    me.vx += (p.x - me.x) / (d || 1) * pull + (-(me.y - p.y) / (d || 1)) * pull * 0.9;
                    me.vy += (p.y - me.y) / (d || 1) * pull + ((me.x - p.x) / (d || 1)) * pull * 0.9;
                }
            }
            if (this.moving && Math.random() < dt * 14) this.wake.push({ x: me.x - Math.cos(me.aim) * 16, y: me.y - Math.sin(me.aim) * 16, t: 0 });
            for (const w of this.wake) w.t += dt;
            this.wake = this.wake.filter(w => w.t < 1);

            // net casting
            const m = this.mouseWorld();
            if (s.mouse.pressed && this.castCd <= 0 && !this.cast && s.spend(10)) {
                const ang = Math.atan2(m.y - me.y, m.x - me.x);
                const d = Math.min(320, dist(m.x, m.y, me.x, me.y));
                this.cast = { x: me.x + Math.cos(ang) * d, y: me.y + Math.sin(ang) * d, t: 0 };
                this.castCd = 1.1; s.sfx('splash');
            }
            if (this.cast) {
                this.cast.t += dt;
                if (this.cast.t >= 0.6) {
                    const n = this.cast; this.cast = null;
                    let got = 0;
                    for (const f of this.fish) {
                        if ((this.away.get(f.i) || 0) > now) continue;
                        const p = this.fishPos(f, now);
                        if (dist(p.x, p.y, n.x, n.y) < 78 + FISH[f.type].r) {
                            this.away.set(f.i, now + 9);
                            s.emit({ k: 'tk', i: f.i, u: +(now + 9).toFixed(1) });
                            got += FISH[f.type].v; this.catches++;
                            this.particles.burst(p.x, p.y, FISH[f.type].color, 14, 200, 0.5, 4);
                        }
                    }
                    if (got) {
                        this.combo = Math.min(5, this.combo + 1); this.comboT = 6;
                        const bonus = Math.round(got * (1 + (this.combo - 1) * 0.15));
                        s.addScore(bonus); this.haul += bonus;
                        s.toast(`+${bonus} fish${this.combo > 1 ? ` · x${this.combo} combo` : ''}`, '#7dd3fc');
                    } else { this.combo = 0; this.particles.burst(n.x, n.y, '#e0f2fe', 10, 120, 0.4, 3); }
                }
            }
            for (const c of this.chests) {
                if (c.until > now) continue;
                if (dist(me.x, me.y, c.x, c.y) < 42) {
                    const opened = s.ask(correct => {
                        if (correct) { s.refill(); s.addScore(90); this.haul += 90; s.toast('Treasure chest: +90', '#fbbf24'); this.particles.burst(c.x, c.y, '#fbbf24', 28, 300, 0.8, 5); }
                        else if (correct === false) s.toast('The chest sank!', '#f87171');
                    });
                    if (opened) { c.until = now + 1e6; s.emit({ k: 'ch', i: c.i, u: +(now + 1e6).toFixed(1) }); }
                }
            }
            s.setGoal(this.haul);
        }

        onEvent(ev, from) {
            if (ev.k === 'tk') this.away.set(ev.i, ev.u);
            else if (ev.k === 'ch' && this.chests[ev.i]) this.chests[ev.i].until = ev.u;
            else if (ev.k === 'dq' && ev.to === this.s.user.id) this.duelStart(from.id, ev.ci, ev.i, false);
            else if (ev.k === 'dw' && ev.to === this.s.user.id) this.duelLost(ev);
        }

        loseFish() {
            const s = this.s;
            const lose = Math.ceil(this.haul * 0.1);
            if (lose > 0) {
                this.haul -= lose; s.addScore(-lose);
                this.catches = Math.max(0, this.catches - Math.ceil(this.catches * 0.1));
                s.toast(`Crash! Lost ${lose} fish pts`, '#f87171');
            } else s.toast('Crash!', '#f87171');
            s.sfx('hit');
        }

        // Boats that bump each other face the same question; the first correct answer steals 25% of the loser's haul.
        duelCheck(now) {
            const s = this.s, me = this.me;
            if (s.question || s.countdown > 0 || s.paused) return;
            for (const r of s.remoteList()) {
                if (s.user.id > r.id || r.done || (this.duelCd.get(r.id) || 0) > now) continue;
                if (dist(me.x, me.y, r.x, r.y) > 40 || !s.cards.length) continue;
                const ci = Math.floor(Math.random() * s.cards.length);
                const token = Math.floor(now * 1000);
                s.emit({ k: 'dq', to: r.id, ci, i: token });
                this.duelStart(r.id, ci, token, true);
                break;
            }
        }

        duelStart(oppId, ci, token, initiator) {
            const s = this.s, now = clock(s);
            if ((this.duelCd.get(oppId) || 0) > now && !initiator) return;
            this.duelCd.set(oppId, now + 20);
            this.duel = { opp: oppId, token, resolved: false, won: null };
            const name = s.roster.get(oppId)?.nickname || 'a rival';
            this.hurt = Math.max(this.hurt, 0.5);
            s.ask(() => { }, `Duel with ${name}! First correct answer steals 25% of their fish`, true, {
                cardIndex: ci, force: true,
                onAnswer: correct => { if (correct) this.duelWin(oppId, token); }
            });
        }

        duelWin(oppId, token) {
            const s = this.s;
            const d = this.duel;
            if (!d || d.token !== token || d.resolved) return;
            const opp = s.remotes.get(oppId);
            const amt = Math.max(0, Math.floor((opp?.goal || 0) * 0.25));
            d.resolved = true; d.won = { amt, t: clock(s) };
            this.haul += amt; s.addScore(amt);
            s.emit({ k: 'dw', to: oppId, i: token, a: amt, t: d.won.t });
            s.toast(amt ? `Duel won! Stole ${amt} fish pts` : 'Duel won!', '#4ade80');
            this.particles.burst(this.me.x, this.me.y, '#4ade80', 20, 240, 0.6, 4);
        }

        duelLost(ev) {
            const s = this.s;
            const d = this.duel;
            if (!d || d.token !== ev.i) return;
            if (d.won) {
                if (ev.t >= d.won.t) return;
                this.haul -= d.won.amt; s.addScore(-d.won.amt); d.won = null;
            }
            if (d.resolved && d.lost) return;
            d.resolved = true; d.lost = true;
            const lose = Math.min(this.haul, ev.a || 0);
            this.haul -= lose; s.addScore(-lose);
            if (s.question) s.closeQuestion(true);
            s.toast(lose ? `Too slow! They stole ${lose} fish pts` : 'Too slow! They won the duel', '#f87171');
        }

        goalText() { return `Haul ${this.haul} · ${this.catches} fish${this.combo > 1 ? ` · combo x${this.combo}` : ''}`; }
        touchLayout() { return { stick: true, buttons: [{ k: 'KeyJ', label: 'Cast', cls: 'main', click: true }] }; }
        hint() { return 'WASD steer · click to cast net · dodge obstacles · Q = restock bait'; }
        ex() { return { n: this.cast ? 1 : 0 }; }

        draw(ctx, w, h) {
            const s = this.s, me = this.me, now = clock(s), t = this.anim;
            ctx.fillStyle = '#0c4a6e'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h);
            const g = ctx.createLinearGradient(0, this.bank, 0, this.H - this.bank);
            g.addColorStop(0, '#0e7490'); g.addColorStop(0.5, '#0891b2'); g.addColorStop(1, '#0e7490');
            ctx.fillStyle = g; ctx.fillRect(this.x0, this.bank, this.x1 - this.x0, this.H - this.bank * 2);
            ctx.strokeStyle = 'rgba(224,242,254,.22)'; ctx.lineWidth = 2;
            for (let y = Math.ceil((this.y0 - 0) / 70) * 70; y < this.y1; y += 70) {
                if (y < this.bank || y > this.H - this.bank) continue;
                ctx.beginPath();
                for (let x = this.x0; x <= this.x1; x += 40) { const yy = y + Math.sin((x + t * 90) / 60 + y) * 6; if (x === this.x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
                ctx.stroke();
            }
            for (const [top, y0] of [[true, 0], [false, this.H - this.bank]]) {
                ctx.fillStyle = '#365314'; ctx.fillRect(this.x0, y0, this.x1 - this.x0, this.bank);
                ctx.fillStyle = '#4d7c0f'; ctx.fillRect(this.x0, top ? this.bank - 36 : y0, this.x1 - this.x0, 36);
                ctx.fillStyle = '#166534';
                for (let x = Math.floor(this.x0 / 120) * 120; x < this.x1; x += 120) { const ty = top ? this.bank - 90 - ((x / 120) % 3) * 30 : y0 + 80 + ((x / 120) % 3) * 30; ctx.beginPath(); ctx.arc(x + 30, ty, 36, 0, TAU); ctx.fill(); }
            }
            for (const p of this.pools) {
                if (!this.seen(p.x, p.y, p.r)) continue;
                ctx.strokeStyle = 'rgba(224,242,254,.6)'; ctx.lineWidth = 4;
                for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.3 + i * 0.22), t * 2 + i, t * 2 + i + 4.2); ctx.stroke(); }
            }
            for (const wk of this.wake) { ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - wk.t)})`; ctx.beginPath(); ctx.arc(wk.x, wk.y, 6 + wk.t * 12, 0, TAU); ctx.fill(); }
            for (const f of this.fish) {
                if ((this.away.get(f.i) || 0) > now) continue;
                const p = this.fishPos(f, now);
                if (!this.seen(p.x, p.y)) continue;
                const kind = FISH[f.type];
                const dir = Math.sign(f.spd);
                ctx.save(); ctx.translate(p.x, p.y); ctx.scale(dir, 1);
                ctx.globalAlpha = 0.9;
                if (f.type === 3) { ctx.fillStyle = 'rgba(251,191,36,.25)'; ctx.beginPath(); ctx.arc(0, 0, 30 + Math.sin(t * 5) * 4, 0, TAU); ctx.fill(); }
                ctx.fillStyle = kind.color;
                ctx.beginPath(); ctx.ellipse(0, 0, kind.r * 1.4, kind.r * 0.8, 0, 0, TAU); ctx.fill();
                ctx.beginPath(); ctx.moveTo(-kind.r * 1.2, 0); ctx.lineTo(-kind.r * 2.1, -kind.r * 0.8 + Math.sin(t * 9 + f.i) * 4); ctx.lineTo(-kind.r * 2.1, kind.r * 0.8 + Math.sin(t * 9 + f.i) * 4); ctx.fill();
                ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(kind.r * 0.7, -kind.r * 0.15, 2.5, 0, TAU); ctx.fill();
                ctx.restore();
            }
            for (const rock of this.rocks) {
                if (!this.seen(rock.x, rock.y)) continue;
                ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(rock.x, rock.y, rock.r, 0, TAU); ctx.fill();
                ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.arc(rock.x - rock.r * 0.25, rock.y - rock.r * 0.25, rock.r * 0.55, 0, TAU); ctx.fill();
            }
            for (const lg of this.logs) {
                const x = mod(lg.x0 + lg.spd * now, this.W);
                if (!this.seen(x, lg.y, 120)) continue;
                ctx.fillStyle = '#78350f'; roundRect(ctx, x - 70, lg.y - 18, 140, 36, 16); ctx.fill();
                ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.ellipse(x + 66, lg.y, 7, 14, 0, 0, TAU); ctx.fill();
            }
            for (const c of this.chests) {
                if (c.until > now || !this.seen(c.x, c.y)) continue;
                this.qMark(ctx, c.x, c.y + Math.sin(t * 2 + c.i) * 4, '#7c3aed', t);
            }
            if (this.cast) {
                const k = this.cast.t / 0.6;
                ctx.strokeStyle = 'rgba(254,243,199,.9)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
                ctx.beginPath(); ctx.arc(this.cast.x, this.cast.y, 78 * Math.min(1, k * 1.2), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
                ctx.strokeStyle = 'rgba(254,243,199,.4)'; ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(this.cast.x, this.cast.y); ctx.stroke();
            }
            const boat = (x, y, aim) => {
                ctx.save(); ctx.translate(x, y); ctx.rotate(aim);
                ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.ellipse(0, 0, 32, 18, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 12, 0, 0, TAU); ctx.fill();
                ctx.restore();
            };
            for (const r of s.remoteList()) { if (this.seen(r.x, r.y)) boat(r.x, r.y, r.f || 0); }
            boat(me.x, me.y, me.aim);
            this.drawPlayers(ctx);
            const mw = this.mouseWorld();
            if (!s.question) {
                const ang = Math.atan2(mw.y - me.y, mw.x - me.x), d = Math.min(320, dist(mw.x, mw.y, me.x, me.y));
                this.ring(ctx, me.x + Math.cos(ang) * d, me.y + Math.sin(ang) * d, 78, this.castCd > 0 ? 'rgba(255,255,255,.18)' : 'rgba(254,243,199,.65)', 2);
            }
            this.particles.draw(ctx);
            this.end(ctx);
            if (this.hurt > 0) { ctx.fillStyle = `rgba(248,113,113,${this.hurt * 0.25})`; ctx.fillRect(0, 0, w, h); }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Market Mayhem: town delivery rush with traffic                      */
    /* ------------------------------------------------------------------ */
    const ROAD = 170, BW = 380, BH = 300, BC = 5, BR = 3;

    class Market extends Arena {
        constructor(s) {
            super(s, ROAD * (BC + 1) + BW * BC, ROAD * (BR + 1) + BH * BR);
            this.title = 'Package Delivery';
            const r = mulberry32(s.seed);
            this.blocks = [];
            for (let row = 0; row < BR; row++) for (let col = 0; col < BC; col++) {
                const x = ROAD + col * (BW + ROAD), y = ROAD + row * (BH + ROAD);
                const shop = (row === 1 && (col === 1 || col === 3));
                const b = { x, y, w: BW, h: BH, shop, color: shop ? '#f59e0b' : ['#64748b', '#7c6f64', '#6b7280', '#78716c'][Math.floor(r() * 4)], roof: shop ? '#dc2626' : ['#475569', '#9a3412', '#1d4ed8', '#166534'][Math.floor(r() * 4)] };
                b.door = { x: x + BW / 2, y: y + BH + 24 };
                this.blocks.push(b);
                this.walls.push({ x, y, w: BW, h: BH });
            }
            this.shops = this.blocks.filter(b => b.shop);
            this.houses = this.blocks.filter(b => !b.shop);
            this.cars = [];
            for (let k = 0; k < BR + 1; k++) for (let j = 0; j < 2; j++) this.cars.push({ horiz: true, c: ROAD / 2 + k * (BH + ROAD), p0: r() * this.W, spd: (130 + r() * 90) * (j ? -1 : 1), lane: j ? -26 : 26, color: ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316'][Math.floor(r() * 5)] });
            for (let k = 0; k < BC + 1; k++) this.cars.push({ horiz: false, c: ROAD / 2 + k * (BW + ROAD), p0: r() * this.H, spd: (130 + r() * 90) * (r() < 0.5 ? 1 : -1), lane: r() < 0.5 ? 26 : -26, color: ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316'][Math.floor(r() * 5)] });
            this.vending = [];
            for (let i = 0; i < 24; i++) {
                const side = i % 2 ? 56 : -56;
                if (i < 8) {
                    const col = 1 + Math.floor(r() * BC - 0.01), row = 1 + Math.floor(r() * BR - 0.01);
                    this.vending.push({ i, x: col * (BW + ROAD) - ROAD / 2 + (i % 2 ? 62 : -62), y: row * (BH + ROAD) - ROAD / 2 + (i % 3 ? 62 : -62), until: 0 });
                } else if (i % 3 === 0) {
                    const k = Math.floor(r() * (BR + 1));
                    this.vending.push({ i, x: 120 + r() * (this.W - 240), y: ROAD / 2 + k * (BH + ROAD) + side, until: 0 });
                } else {
                    const k = Math.floor(r() * (BC + 1));
                    this.vending.push({ i, x: ROAD / 2 + k * (BW + ROAD) + side, y: 120 + r() * (this.H - 240), until: 0 });
                }
            }
            this.trees = [];
            for (const b of this.blocks) for (let k = 0; k < 4; k++) this.trees.push({ x: b.x + (k % 2 ? b.w + 30 : -30), y: b.y + (k < 2 ? 20 : b.h - 20) + r() * 40, r: 12 + r() * 6 });
            this.scoreGoal = false; this.goalUnit = 'deliveries'; this.goalLabel = 'Deliveries';
            this.me.x = this.W / 2; this.me.y = ROAD / 2 + BH + ROAD; this.cam.x = this.me.x; this.cam.y = this.me.y;
            this.baseSpeed = 245; this.boost = 0;
            this.res = new A.Resource('Energy', '#38bdf8', 100, 60, 2);
            this.pkg = null; this.deliveries = 0; this.streak = 0; this.earned = 0;
        }

        carRect(c, now) {
            const along = mod(c.p0 + c.spd * now, c.horiz ? this.W : this.H);
            return c.horiz ? { x: along - 38, y: c.c + c.lane - 17, w: 76, h: 34 } : { x: c.c + c.lane - 17, y: along - 38, w: 34, h: 76 };
        }

        update(dt) {
            const s = this.s, me = this.me, now = clock(s);
            const wantsSprint = s.down('ShiftLeft', 'ShiftRight') && this.moving;
            const winded = this.moving && !this.res.has(1);
            const sprint = wantsSprint && this.res.has(1);
            if (this.moving) {
                if (winded) s.spend(1);
                else this.res.drain((sprint ? 14 : 3) * dt);
            }
            this.boost = Math.max(0, this.boost - dt);
            this.speedMul = (winded ? 0.5 : sprint ? 1.5 : 1) * (this.boost > 0 ? 1.35 : 1);
            this.step(dt);
            const hit = { x: me.x - 12, y: me.y - 12, w: 24, h: 24 };
            if (this.stun <= 0) {
                for (const c of this.cars) {
                    const rect = this.carRect(c, now);
                    if (!overlap(hit, rect)) continue;
                    const sign = Math.sign(c.spd) || 1;
                    me.vx = c.horiz ? sign * 420 : (me.x < rect.x + rect.w / 2 ? -380 : 380);
                    me.vy = c.horiz ? (me.y < rect.y + rect.h / 2 ? -380 : 380) : sign * 420;
                    this.stun = 1.1;
                    this.particles.burst(me.x, me.y, '#fbbf24', 18, 260, 0.5, 4);
                    if (this.pkg) { s.toast('Hit by a car! Package lost.', '#f87171'); this.pkg = null; }
                    else s.toast('Watch out for traffic!', '#f87171');
                    this.streak = 0;
                    break;
                }
            }
            if (!this.pkg) {
                for (const shop of this.shops) {
                    if (dist(me.x, me.y, shop.door.x, shop.door.y) < 60) {
                        const to = this.houses[Math.floor(Math.random() * this.houses.length)];
                        this.pkg = { to, from: shop, t: 0 };
                        s.toast('Package picked up — deliver it to the marked house!', '#fbbf24');
                        break;
                    }
                }
            } else {
                this.pkg.t += dt;
                const d = this.pkg.to.door;
                if (dist(me.x, me.y, d.x, d.y) < 56) {
                    const far = dist(this.pkg.from.door.x, this.pkg.from.door.y, d.x, d.y);
                    this.streak++;
                    const pay = Math.round(30 + far / 35 + Math.min(this.streak, 8) * 6 + Math.max(0, 25 - this.pkg.t) * 1.5);
                    s.addScore(pay); this.earned += pay; this.deliveries++;
                    s.toast(`Delivered! +${pay}${this.streak > 1 ? ` · streak ${this.streak}` : ''}`, '#4ade80');
                    this.particles.burst(d.x, d.y - 10, '#4ade80', 24, 280, 0.7, 5);
                    this.pkg = null;
                }
            }
            for (const v of this.vending) {
                if (v.until > now || dist(me.x, me.y, v.x, v.y) > 44) continue;
                const opened = s.ask(correct => {
                    if (correct) { s.addScore(40); this.earned += 40; this.boost = 8; s.refill(); s.toast('Snack break: +40 and a speed boost!', '#38bdf8'); }
                    else if (correct === false) s.toast('Machine ate your coin.', '#f87171');
                });
                if (opened) v.until = now + 1e6;
            }
            s.setGoal(this.deliveries);
        }

        ex() { return { p: this.pkg ? 1 : 0 }; }
        goalText() { return `${this.deliveries} deliveries · streak ${this.streak}`; }
        touchLayout() { return { stick: true, buttons: [{ k: 'ShiftLeft', label: 'Sprint', cls: 'main' }] }; }
        hint() { return 'WASD move (uses a little energy) · Shift sprint (more energy) · deliver to marked houses · dodge cars · Q = recharge'; }

        draw(ctx, w, h) {
            const s = this.s, me = this.me, now = clock(s), t = this.anim;
            ctx.fillStyle = '#334155'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h);
            ctx.fillStyle = '#3b4252'; ctx.fillRect(0, 0, this.W, this.H);
            ctx.strokeStyle = 'rgba(250,204,21,.55)'; ctx.lineWidth = 3; ctx.setLineDash([26, 22]);
            for (let k = 0; k < BR + 1; k++) { const y = ROAD / 2 + k * (BH + ROAD); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke(); }
            for (let k = 0; k < BC + 1; k++) { const x = ROAD / 2 + k * (BW + ROAD); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H); ctx.stroke(); }
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(241,245,249,.5)';
            for (let kr = 0; kr < BR + 1; kr++) for (let kc = 0; kc < BC + 1; kc++) {
                const ix = ROAD / 2 + kc * (BW + ROAD), iy = ROAD / 2 + kr * (BH + ROAD);
                if (!this.seen(ix, iy, 200)) continue;
                for (let j = -3; j <= 3; j++) {
                    ctx.fillRect(ix + j * 20 - 5, iy - ROAD / 2 + 4, 10, 18); ctx.fillRect(ix + j * 20 - 5, iy + ROAD / 2 - 22, 10, 18);
                    ctx.fillRect(ix - ROAD / 2 + 4, iy + j * 20 - 5, 18, 10); ctx.fillRect(ix + ROAD / 2 - 22, iy + j * 20 - 5, 18, 10);
                }
            }
            for (const b of this.blocks) {
                if (!this.seen(b.x + b.w / 2, b.y + b.h / 2, 300)) continue;
                ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
                ctx.fillStyle = '#9ca3af'; ctx.fillRect(b.x - 22, b.y - 22, b.w + 44, b.h + 44);
                ctx.fillStyle = '#6b7280'; ctx.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
                ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.fillStyle = b.roof; ctx.fillRect(b.x + 18, b.y + 18, b.w - 36, b.h - 36);
                ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(b.x + 18, b.y + 18, b.w - 36, 22);
                ctx.fillStyle = b.shop ? '#fff' : 'rgba(255,255,255,.7)'; ctx.font = '900 26px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(b.shop ? 'MARKET' : 'HOME', b.x + b.w / 2, b.y + b.h / 2 + 8);
                for (let wx = 0; wx < 5; wx++) {
                    ctx.fillStyle = 'rgba(253,230,138,.85)'; ctx.fillRect(b.x + 48 + wx * 60, b.y + b.h - 54, 34, 24);
                    ctx.fillStyle = 'rgba(15,23,42,.5)'; ctx.fillRect(b.x + 64 + wx * 60, b.y + b.h - 54, 2, 24);
                }
                if (b.shop) {
                    for (let st = 0; st < 8; st++) { ctx.fillStyle = st % 2 ? '#f8fafc' : '#ef4444'; ctx.fillRect(b.door.x - 64 + st * 16, b.y + b.h - 4, 16, 14); }
                } else {
                    ctx.fillStyle = '#7f1d1d'; ctx.fillRect(b.x + b.w - 70, b.y + 4, 20, 16);
                    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(b.door.x + 36, b.y + b.h + 6, 12, 10);
                    ctx.fillStyle = '#ef4444'; ctx.fillRect(b.door.x + 36, b.y + b.h + 4, 12, 4);
                }
                ctx.fillStyle = b.shop ? '#fde047' : '#1e293b'; ctx.fillRect(b.door.x - 24, b.y + b.h - 8, 48, 8);
            }
            for (const tr of this.trees) {
                if (!this.seen(tr.x, tr.y)) continue;
                ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(tr.x + 5, tr.y + 8, tr.r, tr.r * 0.7, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#78350f'; ctx.fillRect(tr.x - 2, tr.y, 4, 9);
                ctx.fillStyle = '#16a34a'; ctx.beginPath(); ctx.arc(tr.x, tr.y - 4, tr.r, 0, TAU); ctx.fill();
                ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(tr.x - 3, tr.y - 7, tr.r * 0.55, 0, TAU); ctx.fill();
            }
            for (const shop of this.shops) {
                if (this.pkg) continue;
                this.ring(ctx, shop.door.x, shop.door.y, 42 + Math.sin(t * 5) * 4, '#fde047', 4);
                ctx.fillStyle = '#fde047'; ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText('PICK UP', shop.door.x, shop.door.y + 5);
            }
            if (this.pkg) {
                const d = this.pkg.to.door;
                this.ring(ctx, d.x, d.y, 44 + Math.sin(t * 6) * 5, '#4ade80', 5);
                ctx.fillStyle = '#4ade80'; ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText('DELIVER', d.x, d.y + 5);
            }
            for (const v of this.vending) {
                if (!this.seen(v.x, v.y)) continue;
                if (v.until > now) { ctx.fillStyle = 'rgba(100,116,139,.6)'; ctx.fillRect(v.x - 16, v.y - 22, 32, 44); continue; }
                this.qMark(ctx, v.x, v.y, '#0ea5e9', t + v.i);
            }
            for (const c of this.cars) {
                const rect = this.carRect(c, now);
                if (!this.seen(rect.x + rect.w / 2, rect.y + rect.h / 2, 120)) continue;
                ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(ctx, rect.x + 4, rect.y + 5, rect.w, rect.h, 9); ctx.fill();
                ctx.fillStyle = c.color; roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 9); ctx.fill();
                ctx.fillStyle = 'rgba(15,23,42,.75)';
                if (c.horiz) { const sg = Math.sign(c.spd); ctx.fillRect(rect.x + rect.w / 2 + (sg > 0 ? 6 : -22), rect.y + 5, 16, rect.h - 10); ctx.fillStyle = '#fef08a'; ctx.fillRect(sg > 0 ? rect.x + rect.w - 6 : rect.x, rect.y + 4, 6, 8); ctx.fillRect(sg > 0 ? rect.x + rect.w - 6 : rect.x, rect.y + rect.h - 12, 6, 8); }
                else { const sg = Math.sign(c.spd); ctx.fillRect(rect.x + 5, rect.y + rect.h / 2 + (sg > 0 ? 6 : -22), rect.w - 10, 16); ctx.fillStyle = '#fef08a'; ctx.fillRect(rect.x + 4, sg > 0 ? rect.y + rect.h - 6 : rect.y, 8, 6); ctx.fillRect(rect.x + rect.w - 12, sg > 0 ? rect.y + rect.h - 6 : rect.y, 8, 6); }
            }
            this.drawPlayers(ctx, (c, x, y, r) => {
                const has = r ? r.ex?.p : this.pkg;
                if (has) { c.fillStyle = '#d97706'; c.fillRect(x - 8, y - 48, 16, 14); c.strokeStyle = '#fef3c7'; c.lineWidth = 2; c.strokeRect(x - 8, y - 48, 16, 14); }
            });
            this.particles.draw(ctx);
            if (this.pkg) {
                const d = this.pkg.to.door;
                const ang = Math.atan2(d.y - me.y, d.x - me.x);
                ctx.save(); ctx.translate(me.x + Math.cos(ang) * 58, me.y + Math.sin(ang) * 58); ctx.rotate(ang);
                ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.fill(); ctx.restore();
            }
            this.end(ctx);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Soccer: two teams, one ball, energy for sprinting and power kicks    */
    /* ------------------------------------------------------------------ */
    class Sports extends Arena {
        constructor(s) {
            super(s, 2400, 1100);
            this.title = 'Soccer';
            this.touchMain = 'Kick';
            this.scoreGoal = false; this.goalUnit = 'goals'; this.goalLabel = 'Team goals';
            this.dir = 1; this.td = 0; this.yards = 0;
            this.me.y = this.H / 2; this.baseSpeed = 250;
            this.res = new A.Resource('Energy', '#38bdf8', 100, 60, 2);
            this.kickCd = 0; this.turbo = 0; this.freeze = 0; this.touchT = 0; this.msg = '';
            this.goalH = 340; this.netD = 70;
            this.ball = { x: this.W / 2, y: this.H / 2, vx: 0, vy: 0, r: 13 };
            this.lastTouch = null; this.unclaimed = null;
            // Everyone is split into two teams (blue vs red) that attack opposite goals
            this.teamIds = [...s.roster.keys()].sort();
            this.teamsOn = this.teamIds.length >= 2;
            this.myTeam = this.teamsOn ? this.teamIds.indexOf(s.user.id) % 2 : -1;
            if (this.teamsOn && this.myTeam === 1) this.dir = -1;
            this.teamTd = [0, 0];
            this.pads = [];
            this.kickoff();
            this.cam.x = this.me.x; this.cam.y = this.me.y;
        }

        teamOf(id) { return this.teamsOn ? this.teamIds.indexOf(id) % 2 : -1; }

        spawnY() {
            if (!this.teamsOn) return this.H / 2;
            const mates = this.teamIds.filter(id => this.teamOf(id) === this.myTeam);
            const slot = Math.max(0, mates.indexOf(this.s.user.id));
            return this.H * (slot + 1) / (mates.length + 1);
        }

        // Puts the ball back on the centre spot, sends everyone home and respawns the power-up pads
        kickoff() {
            const me = this.me, r = Math.random;
            Object.assign(this.ball, { x: this.W / 2, y: this.H / 2, vx: 0, vy: 0 });
            me.x = this.W * (this.dir > 0 ? 0.3 : 0.7); me.y = this.spawnY(); me.vx = me.vy = 0;
            this.pads = [];
            for (let i = 0; i < 3; i++) this.pads.push({ x: 500 + r() * (this.W - 1000), y: 140 + r() * (this.H - 280), used: false });
        }

        inMouth(y, pad = 0) { return Math.abs(y - this.H / 2) < this.goalH / 2 - pad; }

        // Moves the ball in sub-steps (so fast shots can't tunnel); returns the team that scored if it reached a goal.
        stepBall(dt) {
            const b = this.ball;
            const speed = Math.hypot(b.vx, b.vy);
            if (speed > 1250) { b.vx *= 1250 / speed; b.vy *= 1250 / speed; }
            const steps = clamp(Math.ceil(Math.min(speed, 1250) * dt / (b.r * 0.6)), 1, 10);
            const h = dt / steps;
            for (let i = 0; i < steps; i++) {
                const scored = this.subStepBall(h);
                if (scored >= 0) return scored;
            }
            // rolling resistance plus air drag
            const drag = Math.exp(-0.55 * dt);
            b.vx *= drag; b.vy *= drag;
            const sp = Math.hypot(b.vx, b.vy);
            if (sp < 8) b.vx = b.vy = 0;
            else { const k = Math.max(0, sp - 40 * dt) / sp; b.vx *= k; b.vy *= k; }
            return -1;
        }

        subStepBall(dt) {
            const b = this.ball, W = this.W, H = this.H, r = b.r, bounce = 0.78;
            b.x += b.vx * dt; b.y += b.vy * dt;
            if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * bounce; b.vx *= 0.97; }
            if (b.y > H - r) { b.y = H - r; b.vy = -Math.abs(b.vy) * bounce; b.vx *= 0.97; }
            // goal posts are solid circles
            const gy0 = H / 2 - this.goalH / 2;
            for (const px of [4, W - 4]) for (const py of [gy0, gy0 + this.goalH]) {
                const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), min = r + 9;
                if (d < min) {
                    const nx = dx / (d || 1), ny = dy / (d || 1);
                    b.x = px + nx * min; b.y = py + ny * min;
                    const vn = b.vx * nx + b.vy * ny;
                    if (vn < 0) { b.vx -= (1 + 0.8) * vn * nx; b.vy -= (1 + 0.8) * vn * ny; }
                }
            }
            if (b.x < r) {
                if (this.teamsOn && this.inMouth(b.y, r)) { if (b.x < 40) return 1; }
                else { b.x = r; b.vx = Math.abs(b.vx) * bounce; b.vy *= 0.97; }
            }
            if (b.x > W - r) {
                if (this.inMouth(b.y, r)) { if (b.x > W - 40) return 0; }
                else { b.x = W - r; b.vx = -Math.abs(b.vx) * bounce; b.vy *= 0.97; }
            }
            return -1;
        }

        goalScored(team) {
            const s = this.s, b = this.ball;
            this.freeze = 1.8;
            this.particles.burst(b.x, b.y, team === 0 ? '#60a5fa' : '#f87171', 50, 420, 1, 6);
            const mine = this.lastTouch === s.user.id;
            if (this.teamsOn) {
                if (mine) {
                    this.teamTd[team]++;
                    s.emit({ k: 'gl', team });
                    if (team === this.myTeam) { this.td++; s.addScore(100); s.toast(`GOAL! (${this.td})`, '#fde047'); s.sfx('score'); }
                    else s.toast(`Own goal! It counts for ${team === 0 ? 'Blue' : 'Red'}`, '#f87171');
                } else this.unclaimed = team;
            } else if (mine) {
                this.td++; s.addScore(100); s.toast(`GOAL! (${this.td})`, '#fde047'); s.sfx('score');
            }
            this.kickoff();
            this.stun = 0.5;
        }

        onEvent(ev, from) {
            if (ev.k === 'kick' && this.freeze <= 0) {
                const b = this.ball, mine = this.lastSent;
                if (mine && performance.now() - mine.at < 220) {
                    // Both players hit the ball at once: combine the two impulses identically on every client
                    const pvx = (mine.pvx + (ev.pvx ?? mine.pvx)) / 2, pvy = (mine.pvy + (ev.pvy ?? mine.pvy)) / 2;
                    let vx = mine.vx + ev.vx - pvx, vy = mine.vy + ev.vy - pvy;
                    const sp = Math.hypot(vx, vy);
                    if (sp > 1250) { vx *= 1250 / sp; vy *= 1250 / sp; }
                    Object.assign(b, { x: (b.x + ev.x) / 2, y: (b.y + ev.y) / 2, vx, vy });
                    this.lastSent = null;
                    this.lastTouch = this.lastTouch || (from ? from.id : null);
                } else {
                    Object.assign(b, { x: ev.x, y: ev.y, vx: ev.vx, vy: ev.vy });
                    this.lastTouch = from ? from.id : this.lastTouch;
                }
            } else if (ev.k === 'gl' && this.teamsOn) {
                if (this.unclaimed === ev.team || this.freeze <= 0) {
                    this.teamTd[ev.team]++;
                    this.freeze = 1.8;
                    const b = this.ball;
                    this.particles.burst(b.x, b.y, ev.team === 0 ? '#60a5fa' : '#f87171', 40, 380, 0.9, 5);
                    Object.assign(b, { x: this.W / 2, y: this.H / 2, vx: 0, vy: 0 });
                    if (from) this.s.toast(`${from.name} scored for ${ev.team === 0 ? 'Blue' : 'Red'}!`, ev.team === 0 ? '#60a5fa' : '#f87171');
                }
                this.unclaimed = null;
            }
        }

        sendKick(pre) {
            const b = this.ball, p = pre || b;
            const msg = { x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), pvx: Math.round(p.vx), pvy: Math.round(p.vy) };
            this.lastSent = { ...msg, at: performance.now() };
            this.s.emit({ k: 'kick', ...msg });
        }

        update(dt) {
            const s = this.s, me = this.me, b = this.ball;
            this.kickCd -= dt; this.turbo = Math.max(0, this.turbo - dt); this.touchT -= dt;
            const wasFrozen = this.freeze > 0;
            this.freeze = Math.max(0, this.freeze - dt);
            const wantsSprint = s.down('ShiftLeft', 'ShiftRight') && this.moving;
            const free = this.turbo > 0;
            const winded = this.moving && !free && !this.res.has(1);
            const sprint = wantsSprint && (free || this.res.has(1));
            if (this.moving && !free) {
                if (winded) s.spend(1);
                else this.res.drain((sprint ? 16 : 3) * dt);
            }
            this.speedMul = (winded ? 0.5 : sprint ? 1.4 : 1) * (free ? 1.15 : 1);
            this.step(dt, 3000);

            if (this.freeze <= 0) {
                if (wasFrozen) this.lastTouch = null;
                const dx = b.x - me.x, dy = b.y - me.y, d = Math.hypot(dx, dy), min = me.r + b.r;
                if (this.stun <= 0) {
                    const pre = { vx: b.vx, vy: b.vy };
                    // Walking into the ball dribbles it; Space is a power kick that costs energy
                    if (d < min) {
                        const nx = dx / (d || 1), ny = dy / (d || 1), tx = -ny, ty = nx;
                        b.x = me.x + nx * min; b.y = me.y + ny * min;
                        const pvn = me.vx * nx + me.vy * ny, bvn = b.vx * nx + b.vy * ny;
                        const bvt = b.vx * tx + b.vy * ty, pvt = me.vx * tx + me.vy * ty;
                        let outN = bvn - pvn < 0 ? pvn - (bvn - pvn) * 0.55 : bvn;
                        outN = Math.max(outN, pvn * 1.08 + 70);
                        const outT = bvt + (pvt - bvt) * 0.3;
                        b.vx = nx * outN + tx * outT; b.vy = ny * outN + ty * outT;
                        this.lastTouch = s.user.id;
                        if (this.touchT <= 0) { this.touchT = 0.1; this.sendKick(pre); s.sfx('act', 90); }
                    }
                    if (s.pressed('Space') && this.kickCd <= 0 && d < 64 && s.spend(15)) {
                        const a = d > 1 ? Math.atan2(dy, dx) * 0.35 + me.aim * 0.65 : me.aim;
                        b.vx = Math.cos(a) * 1050; b.vy = Math.sin(a) * 1050;
                        this.kickCd = 0.45; this.lastTouch = s.user.id;
                        this.sendKick(pre); s.sfx('shoot');
                        this.particles.burst(b.x, b.y, '#fde68a', 12, 220, 0.35, 3);
                    }
                }
                const scored = this.stepBall(dt);
                if (scored >= 0) this.goalScored(scored);
            }

            for (const p of this.pads) {
                if (p.used || dist(me.x, me.y, p.x, p.y) > 40) continue;
                const opened = s.ask(correct => {
                    if (correct) { this.turbo = 10; s.refill(); s.addScore(40); s.toast('TURBO! Free sprint and extra speed', '#fde047'); }
                    else if (correct === false) s.toast('Missed the play call.', '#f87171');
                });
                if (opened) p.used = true;
            }
            this.yards = this.td;
            s.setGoal(this.teamsOn ? this.teamTd[this.myTeam] : this.td);
        }

        ex() { return { t: this.turbo > 0 ? 1 : 0 }; }
        goalText() {
            return this.teamsOn ? `Blue ${this.teamTd[0]} – ${this.teamTd[1]} Red · You ${this.td} goal${this.td === 1 ? '' : 's'}` : `${this.td} goal${this.td === 1 ? '' : 's'}`;
        }
        touchLayout() { return { stick: true, buttons: [{ k: 'Space', label: 'Kick', cls: 'main' }, { k: 'ShiftLeft', label: 'Sprint' }] }; }
        hint() { return `${this.teamsOn ? `${this.myTeam === 0 ? 'Blue' : 'Red'} team · ` : ''}WASD run (uses a little energy) · walk into the ball to dribble · Shift sprint (more energy) · Space power kick (15 energy) · Q = recharge`; }

        draw(ctx, w, h) {
            const me = this.me, t = this.anim, b = this.ball, W = this.W, H = this.H, gy0 = H / 2 - this.goalH / 2;
            ctx.fillStyle = '#14532d'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h, 800);
            for (let i = 0; i < 24; i++) { ctx.fillStyle = i % 2 ? '#15803d' : '#16a34a'; ctx.fillRect(i * 100, 0, 100, H); }
            ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 5;
            ctx.strokeRect(3, 3, W - 6, H - 6);
            ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
            ctx.beginPath(); ctx.arc(W / 2, H / 2, 130, 0, TAU); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 6, 0, TAU); ctx.fill();
            for (const side of [0, 1]) {
                const bx = side ? W - 260 : 0;
                ctx.strokeRect(bx, H / 2 - 260, 260, 520);
                ctx.strokeRect(side ? W - 110 : 0, H / 2 - 150, 110, 300);
                const nx = side ? W - this.netD : 0;
                ctx.fillStyle = side ? 'rgba(248,113,113,.22)' : (this.teamsOn ? 'rgba(96,165,250,.22)' : 'rgba(255,255,255,.1)');
                ctx.fillRect(nx, gy0, this.netD, this.goalH);
                ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath();
                for (let k = 0; k <= this.goalH; k += 20) { ctx.moveTo(nx, gy0 + k); ctx.lineTo(nx + this.netD, gy0 + k); }
                for (let k = 0; k <= this.netD; k += 20) { ctx.moveTo(nx + k, gy0); ctx.lineTo(nx + k, gy0 + this.goalH); }
                ctx.stroke();
                ctx.fillStyle = '#f8fafc'; ctx.fillRect(side ? W - 6 : 0, gy0 - 6, 6, this.goalH + 12);
                ctx.beginPath(); ctx.arc(side ? W - 4 : 4, gy0, 9, 0, TAU); ctx.arc(side ? W - 4 : 4, gy0 + this.goalH, 9, 0, TAU); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 5;
            }
            for (const p of this.pads) { if (!p.used) this.qMark(ctx, p.x, p.y, '#7c3aed', t); }
            // ball: shadow, white body with dark patches; glows when a power kick is in reach
            const near = dist(me.x, me.y, b.x, b.y) < 64 && this.kickCd <= 0;
            ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + 6, b.r, b.r * 0.6, 0, 0, TAU); ctx.fill();
            if (near) this.ring(ctx, b.x, b.y, b.r + 9, 'rgba(253,224,71,.85)', 3);
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
            ctx.fillStyle = '#1e293b';
            const spin = (b.x + b.y) * 0.04;
            for (let k = 0; k < 5; k++) { const a = spin + k * TAU / 5; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * b.r * 0.58, b.y + Math.sin(a) * b.r * 0.58, 3, 0, TAU); ctx.fill(); }
            ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, TAU); ctx.fill();
            this.drawPlayers(ctx, (c, x, y, r) => {
                if (this.teamsOn) this.ring(c, x, y, 21, this.teamOf(r ? r.id : this.s.user.id) === 0 ? '#60a5fa' : '#f87171', 3);
                if (r ? r.ex?.t : this.turbo > 0) { this.ring(c, x, y, 26, 'rgba(253,224,71,.8)', 3); }
            });
            this.particles.draw(ctx);
            this.end(ctx);
            if (this.freeze > 0) {
                ctx.fillStyle = '#fde047'; ctx.font = '900 54px system-ui'; ctx.textAlign = 'center';
                ctx.fillText('GOAL!', w / 2, h / 2 - 60); ctx.textAlign = 'left';
            }
        }
    }

    Object.assign(A.games, { miner: Miner, river: River, market: Market, sports: Sports });
    A.Arena = Arena;
})(window);
