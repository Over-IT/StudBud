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

    class Miner extends Arena {
        constructor(s) {
            super(s, COLS * TS, ROWS * TS);
            this.title = 'Crystal Cartel';
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
        hint() { return 'WASD move · hold click / Space to dig (uses energy) · bank ore at the base · avoid lava · press Q for a question to recharge energy'; }

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
                    ctx.fillStyle = '#2b1b0c'; ctx.fillRect(x, y, TS, TS);
                    ctx.fillStyle = `rgba(249,115,22,${0.75 + Math.sin(time * 4 + tx) * 0.2})`; ctx.fillRect(x + 3, y + 3, TS - 6, TS - 6);
                    ctx.fillStyle = '#fde047'; ctx.fillRect(x + 12 + Math.sin(time * 3 + ty) * 6, y + 14, 10, 6);
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
            this.title = 'River Raiders';
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
            for (let i = 0; i < 7; i++) this.logs.push({ y: 300 + r() * (this.H - 600), x0: r() * this.W, spd: 55 + r() * 60 });
            this.rocks = [];
            for (let i = 0; i < 14; i++) this.rocks.push({ x: 600 + r() * (this.W - 900), y: 330 + r() * (this.H - 660), r: 28 + r() * 22 });
            this.pools = [];
            for (let i = 0; i < 3; i++) this.pools.push({ x: 900 + i * 1050 + r() * 300, y: 450 + r() * (this.H - 900), r: 130 });
            this.chests = [];
            for (let i = 0; i < 10; i++) this.chests.push({ i, x: 700 + r() * (this.W - 1000), y: 330 + r() * (this.H - 660), until: 0 });
            this.away = new Map();
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
                if (d < rock.r + me.r) { me.x = rock.x + (me.x - rock.x) / d * (rock.r + me.r); me.y = rock.y + (me.y - rock.y) / d * (rock.r + me.r); me.vx *= 0.5; me.vy *= 0.5; }
            }
            for (const lg of this.logs) {
                const x = mod(lg.x0 + lg.spd * now, this.W);
                const rect = { x: x - 60, y: lg.y - 15, w: 120, h: 30 };
                if (pushCircleOutOfRect(me, rect) && this.hurt <= 0) { this.hurt = 0.8; me.vx = 140; this.particles.burst(me.x, me.y, '#a16207', 10, 160, 0.4, 3); }
            }
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
                this.castCd = 1.1;
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
                    if (opened) { c.until = now + 30; s.emit({ k: 'ch', i: c.i, u: +(now + 30).toFixed(1) }); }
                }
            }
            s.setGoal(this.haul);
        }

        onEvent(ev) {
            if (ev.k === 'tk') this.away.set(ev.i, ev.u);
            else if (ev.k === 'ch' && this.chests[ev.i]) this.chests[ev.i].until = ev.u;
        }

        goalText() { return `Haul ${this.haul} · ${this.catches} fish${this.combo > 1 ? ` · combo x${this.combo}` : ''}`; }
        hint() { return 'WASD steer the boat · click to cast your net (10 bait) · dodge logs, rocks & whirlpools · press Q for a question to restock bait'; }
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
                ctx.fillStyle = '#78350f'; roundRect(ctx, x - 60, lg.y - 15, 120, 30, 14); ctx.fill();
                ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.ellipse(x + 56, lg.y, 6, 12, 0, 0, TAU); ctx.fill();
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
            this.title = 'Market Mayhem';
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
            for (let i = 0; i < 6; i++) {
                const col = 1 + Math.floor(r() * BC - 0.01), row = 1 + Math.floor(r() * BR - 0.01);
                this.vending.push({ i, x: col * (BW + ROAD) - ROAD / 2 + (i % 2 ? 62 : -62), y: row * (BH + ROAD) - ROAD / 2 + (i % 3 ? 62 : -62), until: 0 });
            }
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
            const sprint = s.down('ShiftLeft', 'ShiftRight') && this.res.has(1) && this.moving;
            if (sprint) this.res.drain(14 * dt);
            else if (s.down('ShiftLeft', 'ShiftRight') && this.moving) s.spend(1);
            this.boost = Math.max(0, this.boost - dt);
            this.speedMul = (sprint ? 1.5 : 1) * (this.boost > 0 ? 1.35 : 1);
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
                if (opened) v.until = now + 25;
            }
            s.setGoal(this.deliveries);
        }

        ex() { return { p: this.pkg ? 1 : 0 }; }
        goalText() { return `${this.deliveries} deliveries · streak ${this.streak}`; }
        hint() { return 'WASD move · hold Shift to sprint (uses energy) · deliver packages to marked houses · dodge cars · press Q for a question to recharge energy'; }

        draw(ctx, w, h) {
            const s = this.s, me = this.me, now = clock(s), t = this.anim;
            ctx.fillStyle = '#334155'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h);
            ctx.fillStyle = '#3b4252'; ctx.fillRect(0, 0, this.W, this.H);
            ctx.strokeStyle = 'rgba(250,204,21,.55)'; ctx.lineWidth = 3; ctx.setLineDash([26, 22]);
            for (let k = 0; k < BR + 1; k++) { const y = ROAD / 2 + k * (BH + ROAD); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke(); }
            for (let k = 0; k < BC + 1; k++) { const x = ROAD / 2 + k * (BW + ROAD); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H); ctx.stroke(); }
            ctx.setLineDash([]);
            for (const b of this.blocks) {
                if (!this.seen(b.x + b.w / 2, b.y + b.h / 2, 300)) continue;
                ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
                ctx.fillStyle = '#6b7280'; ctx.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
                ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.fillStyle = b.roof; ctx.fillRect(b.x + 18, b.y + 18, b.w - 36, b.h - 36);
                ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(b.x + 18, b.y + 18, b.w - 36, 22);
                ctx.fillStyle = b.shop ? '#fff' : 'rgba(255,255,255,.7)'; ctx.font = '900 26px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(b.shop ? 'MARKET' : 'HOME', b.x + b.w / 2, b.y + b.h / 2 + 8);
                ctx.fillStyle = b.shop ? '#fde047' : '#1e293b'; ctx.fillRect(b.door.x - 24, b.y + b.h - 8, 48, 8);
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
    /* Endzone Rally: top-down football run                                */
    /* ------------------------------------------------------------------ */
    class Sports extends Arena {
        constructor(s) {
            super(s, 2600, 900);
            this.title = 'Endzone Rally';
            this.scoreGoal = false;
            this.dir = 1; this.td = 0; this.yards = 0; this.progress = 0; this.best = 0;
            this.me.y = this.H / 2; this.baseSpeed = 255;
            this.res = new A.Resource('Energy', '#38bdf8', 100, 60, 2);
            this.dash = 0; this.dashCd = 0; this.bull = 0; this.msg = '';
            this.defenders = []; this.pads = [];
            this.newDrive();
            this.cam.x = this.me.x; this.cam.y = this.me.y;
        }

        newDrive() {
            const me = this.me, r = Math.random;
            me.x = this.dir > 0 ? 130 : this.W - 130; me.y = this.H / 2; me.vx = me.vy = 0;
            this.progress = 0; this.best = 0; this.checkpoint = 0;
            this.defenders = [];
            const count = Math.min(14, 7 + this.td * 2);
            for (let i = 0; i < count; i++) {
                const along = 380 + (i / count) * (this.W - 760);
                this.defenders.push({ x: this.dir > 0 ? along : this.W - along, y: 90 + r() * (this.H - 180), vx: 0, vy: 0, wake: 380 + r() * 140, sp: 165 + r() * 40 + this.td * 12, anim: r() * 6 });
            }
            this.pads = [];
            for (let i = 0; i < 3; i++) this.pads.push({ x: 500 + r() * (this.W - 1000), y: 120 + r() * (this.H - 240), used: false });
        }

        update(dt) {
            const s = this.s, me = this.me;
            this.dashCd -= dt; this.bull = Math.max(0, this.bull - dt); this.dash = Math.max(0, this.dash - dt);
            const wantsSprint = s.down('ShiftLeft', 'ShiftRight') && this.moving;
            const sprint = wantsSprint && this.res.has(1);
            if (sprint) this.res.drain(16 * dt);
            else if (wantsSprint) s.spend(1);
            this.speedMul = (sprint ? 1.4 : 1) * (this.bull > 0 ? 1.2 : 1) * (this.dash > 0 ? 2.4 : 1);
            if (s.pressed('Space') && this.dashCd <= 0 && this.stun <= 0 && s.spend(15)) {
                this.dash = 0.22; this.dashCd = 1.1;
                const a = s.axis();
                if (a.x || a.y) me.aim = Math.atan2(a.y, a.x);
                me.vx = Math.cos(me.aim) * 620; me.vy = Math.sin(me.aim) * 620;
                this.particles.burst(me.x, me.y, '#fde68a', 10, 160, 0.3, 3);
            }
            this.step(dt, 3000);
            const forward = this.dir > 0 ? me.x - 130 : this.W - 130 - me.x;
            this.progress = Math.max(0, forward);
            if (this.progress > this.best) {
                const gain = (this.progress - this.best) / 20;
                this.yards += gain; s.addScore(gain); this.best = this.progress;
            }
            this.checkpoint = Math.max(this.checkpoint, Math.floor(this.progress / 400) * 400);

            for (const d of this.defenders) {
                const dx = me.x - d.x, dy = me.y - d.y, dd = Math.hypot(dx, dy) || 1;
                d.anim += dt;
                if (dd < d.wake && this.stun <= 0) {
                    const lead = Math.min(0.5, dd / 600);
                    const tx = me.x + me.vx * lead - d.x, ty = me.y + me.vy * lead - d.y, tl = Math.hypot(tx, ty) || 1;
                    const sign = this.bull > 0 ? -0.8 : 1;
                    d.vx += clamp(tx / tl * d.sp * sign - d.vx, -900 * dt, 900 * dt);
                    d.vy += clamp(ty / tl * d.sp * sign - d.vy, -900 * dt, 900 * dt);
                } else { d.vx *= 0.9; d.vy *= 0.9; }
                for (const o of this.defenders) {
                    if (o === d) continue;
                    const ox = d.x - o.x, oy = d.y - o.y, od = Math.hypot(ox, oy);
                    if (od > 0 && od < 30) { d.x += ox / od * 30 * dt * 4; d.y += oy / od * 30 * dt * 4; }
                }
                d.x = clamp(d.x + d.vx * dt, 20, this.W - 20); d.y = clamp(d.y + d.vy * dt, 20, this.H - 20);
                if (dd < 30 && this.stun <= 0) {
                    if (this.bull > 0 || this.dash > 0.08) {
                        d.vx = dx / dd * -600; d.vy = dy / dd * -600; d.wake = 0;
                        this.particles.burst(d.x, d.y, '#fca5a5', 12, 240, 0.4, 4);
                        if (this.bull > 0) s.addScore(5);
                    } else {
                        this.stun = 1.3; this.msg = 'TACKLED!';
                        s.toast('Tackled! Back to the last marker.', '#f87171');
                        this.particles.burst(me.x, me.y, '#fecaca', 22, 280, 0.6, 5);
                        me.x = (this.dir > 0 ? 130 : this.W - 130) + this.dir * this.checkpoint; me.y = this.H / 2; me.vx = me.vy = 0;
                        this.defenders = this.defenders.filter(o => dist(o.x, o.y, me.x, me.y) > 380);
                        break;
                    }
                }
            }
            for (const p of this.pads) {
                if (p.used || dist(me.x, me.y, p.x, p.y) > 40) continue;
                const opened = s.ask(correct => {
                    if (correct) { this.bull = 8; s.refill(); s.addScore(40); s.toast('BULLDOZER! Smash through defenders', '#fde047'); }
                    else if (correct === false) s.toast('Fumbled the play call.', '#f87171');
                });
                if (opened) p.used = true;
            }
            const inEnd = this.dir > 0 ? me.x > this.W - 190 : me.x < 190;
            if (inEnd) {
                this.td++; s.addScore(100); s.setGoal(this.td);
                s.toast(`TOUCHDOWN! (${this.td})`, '#fde047');
                this.particles.burst(me.x, me.y, '#fde047', 50, 420, 1, 6);
                s.emit({ k: 'td', n: this.td });
                this.dir *= -1; this.newDrive(); this.stun = 0.6;
            }
            s.setGoal(this.td);
        }

        ex() { return { b: this.bull > 0 ? 1 : 0 }; }
        goalText() { return `${this.td} TD · ${Math.round(this.yards / 1)} yds`; }
        hint() { return 'WASD run · hold Shift to sprint · Space juke-dash (15 energy) · press Q for a question to recharge energy · reach the far endzone'; }

        draw(ctx, w, h) {
            const me = this.me, t = this.anim;
            ctx.fillStyle = '#14532d'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h, 760);
            for (let i = 0; i < 26; i++) { ctx.fillStyle = i % 2 ? '#15803d' : '#16a34a'; ctx.fillRect(i * 100, 0, 100, this.H); }
            ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0, 0, 190, this.H);
            ctx.fillStyle = '#dc2626'; ctx.fillRect(this.W - 190, 0, 190, this.H);
            ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '900 54px system-ui'; ctx.textAlign = 'center';
            ctx.save(); ctx.translate(95, this.H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('ENDZONE', 0, 18); ctx.restore();
            ctx.save(); ctx.translate(this.W - 95, this.H / 2); ctx.rotate(Math.PI / 2); ctx.fillText('ENDZONE', 0, 18); ctx.restore();
            ctx.fillStyle = 'rgba(255,255,255,.7)';
            for (let x = 190; x <= this.W - 190; x += 200) {
                ctx.fillRect(x - 2, 0, 4, this.H);
                ctx.font = '800 26px system-ui'; ctx.fillText(String(Math.round(Math.min(x - 190, this.W - 190 - x) / 20)), x, 60);
            }
            ctx.strokeStyle = 'rgba(253,224,71,.8)'; ctx.lineWidth = 6;
            const goalX = this.dir > 0 ? this.W - 190 : 190;
            ctx.beginPath(); ctx.moveTo(goalX, 0); ctx.lineTo(goalX, this.H); ctx.stroke();
            for (const p of this.pads) { if (!p.used) this.qMark(ctx, p.x, p.y, '#7c3aed', t); }
            for (const d of this.defenders) {
                if (!this.seen(d.x, d.y)) continue;
                drawFigureTop(ctx, { color: '#ef4444' }, d.x, d.y, 15, Math.atan2(d.vy, d.vx || 0.01), d.anim);
            }
            this.drawPlayers(ctx, (c, x, y, r) => {
                c.fillStyle = '#92400e'; c.beginPath(); c.ellipse(x + 14, y + 6, 8, 5, 0.4, 0, TAU); c.fill();
                if (r ? r.ex?.b : this.bull > 0) { this.ring(c, x, y, 26, 'rgba(253,224,71,.8)', 3); }
            });
            this.particles.draw(ctx);
            this.end(ctx);
            const frac = clamp(this.progress / (this.W - 380), 0, 1);
            ctx.fillStyle = 'rgba(8,12,24,.6)'; roundRect(ctx, w / 2 - 160, 70, 320, 12, 6); ctx.fill();
            ctx.fillStyle = '#fde047'; roundRect(ctx, w / 2 - 160, 70, 320 * frac, 12, 6); ctx.fill();
        }
    }

    Object.assign(A.games, { miner: Miner, river: River, market: Market, sports: Sports });
    A.Arena = Arena;
})(window);
