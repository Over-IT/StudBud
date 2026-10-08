(function (window) {
    'use strict';

    const A = window.StudBudArcade;
    const { TAU, clamp, dist, mulberry32, hashStr, roundRect, nameTag, drawFigureSide } = A.util;
    const clock = s => (Date.now() - s.startedAt) / 1000;
    const money = n => `$${Math.round(n).toLocaleString()}`;

    /* Immediate-mode button helper shared by the canvas-UI games. */
    class Ui {
        constructor(session) { this.s = session; this.rects = []; this.prev = []; }
        begin() { this.prev = this.rects; this.rects = []; }
        inside(r) {
            const m = this.s.mouse;
            return Boolean(r && r.on && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h);
        }
        hit() {
            if (!this.s.mouse.pressed) return null;
            for (let i = this.prev.length - 1; i >= 0; i--) if (this.inside(this.prev[i])) return this.prev[i].id;
            return null;
        }
        button(ctx, id, x, y, w, h, label, on = true, color = '#6366f1', sub = '') {
            const rect = { id, x, y, w, h, on };
            this.rects.push(rect);
            const hov = this.inside(rect);
            ctx.fillStyle = on ? (hov ? color : color + 'cc') : 'rgba(71,85,105,.55)';
            roundRect(ctx, x, y, w, h, 10); ctx.fill();
            ctx.strokeStyle = on ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = on ? '#fff' : '#94a3b8'; ctx.font = '800 14px system-ui'; ctx.textAlign = 'center';
            ctx.fillText(label, x + w / 2, y + h / 2 + (sub ? -1 : 5));
            if (sub) { ctx.font = '600 11px system-ui'; ctx.fillStyle = on ? 'rgba(255,255,255,.8)' : '#64748b'; ctx.fillText(sub, x + w / 2, y + h / 2 + 14); }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Crypto Exchange                                                     */
    /* ------------------------------------------------------------------ */
    const ASSETS = [
        { id: 'btx', sym: 'BTX', name: 'Bitbux', kind: 'Crypto', base: 100, vol: 0.5, drift: 0.2, color: '#f59e0b' },
        { id: 'dgl', sym: 'DGL', name: 'DogeLeaf', kind: 'Meme coin', base: 8, vol: 0.72, drift: 0, color: '#a3e635' },
        { id: 'gld', sym: 'GLD', name: 'Gold Bars', kind: 'Commodity', base: 60, vol: 0.16, drift: 0.05, color: '#fde047' },
        { id: 'tch', sym: 'TCH', name: 'Techcorp', kind: 'Stock', base: 140, vol: 0.3, drift: 0.12, color: '#38bdf8' },
        { id: 'bnd', sym: 'BND', name: 'SafeBond', kind: 'Bond', base: 50, vol: 0.05, drift: 0.04, color: '#94a3b8' },
        { id: 'min', sym: 'MIN', name: 'DeepDig Mining', kind: 'Mining stock', base: 35, vol: 0.45, drift: 0.1, color: '#fb923c' }
    ];
    const NEWS = [
        ['{n} announces a breakthrough!', '{n} faces a regulation scare.'],
        ['Whales are buying {n}.', 'Investors dump {n}.'],
        ['{n} partners with a giant.', '{n} suffers a major outage.']
    ];

    class Crypto extends A.BaseGame {
        constructor(s) {
            super(s);
            this.title = 'Crypto Exchange';
            this.ui = new Ui(s);
            const r = mulberry32(s.seed);
            this.params = ASSETS.map(a => ({
                waves: [0, 1, 2].map(k => ({ amp: a.vol * [0.5, 0.3, 0.2][k], per: [11, 38, 110][k] * (0.8 + r() * 0.5), ph: r() * TAU }))
            }));
            this.cash = 200; this.units = ASSETS.map(() => 0); this.sel = 0;
            this.rigs = 0; this.intern = 0; this.researchCd = 0;
            this.anim = 0; this.lastNews = -1; this.fx = [];
            s.overlay.querySelector('.mpg-board').style.display = 'none';
            s.overlay.querySelector('.mpg-score').style.display = 'none';
            s.canvas.style.cursor = 'default';
        }

        newsEvent(k) {
            const h = hashStr(`${this.s.seed}:${k}`);
            const asset = h % ASSETS.length;
            const up = ((h >>> 5) & 1) === 1;
            const mag = 0.14 + (((h >>> 9) % 100) / 100) * 0.22;
            const text = NEWS[(h >>> 13) % NEWS.length][up ? 0 : 1].replace('{n}', ASSETS[asset].name);
            return { k, asset, up, mag, start: k * 22, text };
        }

        price(i, t) {
            const a = ASSETS[i], p = this.params[i];
            let m = 1 + a.drift * Math.min(t, 900) / 900;
            for (const w of p.waves) m += w.amp * Math.sin((t / w.per) * TAU * 0.16 + w.ph);
            const k0 = Math.floor(t / 22);
            for (let k = Math.max(1, k0 - 3); k <= k0; k++) {
                const e = this.newsEvent(k);
                if (e.asset !== i) continue;
                const dt = t - e.start;
                if (dt < 0) continue;
                m *= 1 + (e.up ? 1 : -1) * e.mag * Math.min(1, dt / 6) * Math.exp(-dt / 38);
            }
            return Math.max(a.base * 0.08, a.base * m);
        }

        netWorth(t) { return this.cash + this.units.reduce((sum, u, i) => sum + u * this.price(i, t), 0); }

        trade(i, qty, t) {
            const price = this.price(i, t);
            if (qty > 0) {
                const n = Math.min(qty, Math.floor(this.cash / price));
                if (n < 1) { this.s.toast('Not enough cash', '#f87171'); return; }
                this.cash -= n * price; this.units[i] += n;
                this.pop(`+${n} ${ASSETS[i].sym}`, ASSETS[i].color);
            } else {
                const n = Math.min(this.units[i], -qty);
                if (n < 1) { this.s.toast(`You don't own any ${ASSETS[i].sym}`, '#f87171'); return; }
                this.cash += n * price; this.units[i] -= n;
                this.pop(`Sold ${n} · ${money(n * price)}`, '#4ade80');
            }
        }

        pop(text, color) { this.fx.push({ text, color, t: 0 }); }
        rigCost() { return Math.round(250 * Math.pow(1.7, this.rigs)); }
        internCost() { return Math.round(400 * Math.pow(1.9, this.intern)); }

        update(dt) {
            const s = this.s, t = clock(s);
            this.anim += dt;
            this.researchCd = Math.max(0, this.researchCd - dt);
            this.cash += this.rigs * 7 * dt;
            for (const f of this.fx) f.t += dt;
            this.fx = this.fx.filter(f => f.t < 1.4);
            const e = this.newsEvent(Math.max(0, Math.floor(t / 22)));
            if (e.k !== this.lastNews) { this.lastNews = e.k; if (e.k > 0) s.toast(`📰 ${e.text}`, e.up ? '#4ade80' : '#f87171'); }
            for (let i = 0; i < ASSETS.length; i++) if (s.pressed(`Digit${i + 1}`)) this.sel = i;
            const shift = s.down('ShiftLeft', 'ShiftRight');
            if (s.pressed('KeyB')) this.trade(this.sel, shift ? 1e9 : 1, t);
            if (s.pressed('KeyS')) this.trade(this.sel, shift ? -1e9 : -1, t);
            const id = this.ui.hit();
            if (id) this.click(id, t);
            s.score = Math.round(this.netWorth(t));
            s.setGoal(s.score);
        }

        click(id, t) {
            const s = this.s;
            if (id.startsWith('sel')) this.sel = Number(id.slice(3));
            else if (id === 'b1') this.trade(this.sel, 1, t);
            else if (id === 'b10') this.trade(this.sel, 10, t);
            else if (id === 'bmax') this.trade(this.sel, 1e9, t);
            else if (id === 's1') this.trade(this.sel, -1, t);
            else if (id === 's10') this.trade(this.sel, -10, t);
            else if (id === 'sall') this.trade(this.sel, -1e9, t);
            else if (id === 'research' && this.researchCd <= 0) {
                s.ask(correct => {
                    this.researchCd = 6;
                    if (correct) { const gain = s.reward * 8 + this.intern * 40; this.cash += gain; this.pop(`Research +${money(gain)}`, '#38bdf8'); s.toast(`Great research! +${money(gain)}`, '#38bdf8'); }
                    else if (correct === false) s.toast('Bad intel — no payout.', '#f87171');
                }, `Correct answer: +${money(s.reward * 8 + this.intern * 40)} cash`);
            } else if (id === 'rig') {
                const cost = this.rigCost();
                if (this.cash >= cost) { this.cash -= cost; this.rigs++; s.toast('Mining rig online! +$7/sec', '#fb923c'); } else s.toast('Not enough cash', '#f87171');
            } else if (id === 'intern') {
                const cost = this.internCost();
                if (this.cash >= cost) { this.cash -= cost; this.intern++; s.toast('Analyst hired: research pays more', '#38bdf8'); } else s.toast('Not enough cash', '#f87171');
            }
        }

        net() { return { x: 0, y: 0, ex: {} }; }
        goalText() { return `Net worth ${money(this.s.score)}`; }
        hint() { return '1-6 pick an asset · B / S buy & sell (Shift = max) · Research questions pay cash (set by the host) · build mining rigs for passive income'; }

        chart(ctx, i, x, y, w, h, t, detailed) {
            const span = detailed ? 120 : 40, n = detailed ? 60 : 20;
            const pts = [];
            let lo = Infinity, hi = -Infinity;
            for (let k = 0; k <= n; k++) {
                const p = this.price(i, Math.max(0, t - span + (span * k) / n));
                pts.push(p); lo = Math.min(lo, p); hi = Math.max(hi, p);
            }
            const pad = (hi - lo) * 0.12 || 1;
            lo -= pad; hi += pad;
            if (detailed) {
                ctx.strokeStyle = 'rgba(148,163,184,.15)'; ctx.lineWidth = 1; ctx.fillStyle = '#64748b'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'right';
                for (let g = 0; g <= 4; g++) { const gy = y + (h * g) / 4; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); ctx.fillText(money(hi - ((hi - lo) * g) / 4), x + w - 4, gy - 3); }
            }
            const up = pts[pts.length - 1] >= pts[0];
            ctx.beginPath();
            pts.forEach((p, k) => { const px = x + (w * k) / n, py = y + h - ((p - lo) / (hi - lo)) * h; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
            ctx.strokeStyle = up ? '#4ade80' : '#f87171'; ctx.lineWidth = detailed ? 3 : 2; ctx.lineJoin = 'round'; ctx.stroke();
            if (detailed) {
                ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
                const g = ctx.createLinearGradient(0, y, 0, y + h);
                g.addColorStop(0, up ? 'rgba(74,222,128,.28)' : 'rgba(248,113,113,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g; ctx.fill();
            }
        }

        draw(ctx, w, h) {
            const s = this.s, t = clock(s), ui = this.ui;
            ui.begin();
            const bg = ctx.createLinearGradient(0, 0, w, h);
            bg.addColorStop(0, '#0b1020'); bg.addColorStop(1, '#10213f');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(56,189,248,.05)'; ctx.lineWidth = 1;
            for (let x = 0; x < w; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }

            const lx = 18, lw = 300, top = 82, rw = 300, rx = w - rw - 18, cx = lx + lw + 18, cw = Math.max(300, rx - cx - 18);
            ctx.fillStyle = '#94a3b8'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'left'; ctx.fillText('MARKETS', lx, top - 8);
            ASSETS.forEach((a, i) => {
                const y = top + i * 74;
                const p = this.price(i, t), prev = this.price(i, Math.max(0, t - 20));
                const ch = (p - prev) / prev;
                ui.rects.push({ id: `sel${i}`, x: lx, y, w: lw, h: 66, on: true });
                ctx.fillStyle = this.sel === i ? 'rgba(99,102,241,.35)' : 'rgba(15,23,42,.7)'; roundRect(ctx, lx, y, lw, 66, 12); ctx.fill();
                ctx.strokeStyle = this.sel === i ? a.color : 'rgba(148,163,184,.2)'; ctx.lineWidth = this.sel === i ? 3 : 1.5; ctx.stroke();
                ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(lx + 26, y + 33, 14, 0, TAU); ctx.fill();
                ctx.fillStyle = '#0f172a'; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(a.sym, lx + 26, y + 37);
                ctx.textAlign = 'left'; ctx.fillStyle = '#e2e8f0'; ctx.font = '800 14px system-ui'; ctx.fillText(a.name, lx + 50, y + 25);
                ctx.fillStyle = '#94a3b8'; ctx.font = '600 11px system-ui'; ctx.fillText(`${a.kind}${this.units[i] ? ` · own ${this.units[i]}` : ''}`, lx + 50, y + 44);
                this.chart(ctx, i, lx + 168, y + 12, 52, 40, t, false);
                ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '800 14px system-ui'; ctx.fillText(money(p), lx + lw - 10, y + 27);
                ctx.fillStyle = ch >= 0 ? '#4ade80' : '#f87171'; ctx.font = '700 12px system-ui'; ctx.fillText(`${ch >= 0 ? '▲' : '▼'} ${(Math.abs(ch) * 100).toFixed(1)}%`, lx + lw - 10, y + 46);
            });

            const e = this.newsEvent(Math.max(0, Math.floor(t / 22)));
            ctx.fillStyle = 'rgba(15,23,42,.8)'; roundRect(ctx, cx, top - 8, cw, 38, 10); ctx.fill();
            ctx.fillStyle = e.k === 0 ? '#94a3b8' : (e.up ? '#4ade80' : '#f87171'); ctx.font = '800 14px system-ui'; ctx.textAlign = 'left';
            ctx.fillText(e.k === 0 ? '📰 Markets are opening… prices will swing with the news.' : `📰 ${e.text}`, cx + 14, top + 16);
            const a = ASSETS[this.sel], p = this.price(this.sel, t);
            ctx.fillStyle = 'rgba(15,23,42,.72)'; roundRect(ctx, cx, top + 42, cw, 330, 14); ctx.fill();
            ctx.fillStyle = a.color; ctx.font = '900 22px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${a.name} (${a.sym})`, cx + 18, top + 76);
            ctx.fillStyle = '#fff'; ctx.font = '900 30px system-ui'; ctx.fillText(money(p), cx + 18, top + 112);
            ctx.fillStyle = '#94a3b8'; ctx.font = '600 12px system-ui'; ctx.fillText(`${a.kind} · you own ${this.units[this.sel]} (${money(this.units[this.sel] * p)})`, cx + 18, top + 132);
            this.chart(ctx, this.sel, cx + 18, top + 150, cw - 36, 200, t, true);

            const by = top + 384, bw = (cw - 40) / 3, own = this.units[this.sel];
            ui.button(ctx, 'b1', cx, by, bw, 46, 'Buy 1', this.cash >= p, '#16a34a', money(p));
            ui.button(ctx, 'b10', cx + bw + 20, by, bw, 46, 'Buy 10', this.cash >= p * 10, '#16a34a', money(p * 10));
            ui.button(ctx, 'bmax', cx + (bw + 20) * 2, by, bw, 46, 'Buy max', this.cash >= p, '#15803d', `${Math.floor(this.cash / p)} units`);
            ui.button(ctx, 's1', cx, by + 56, bw, 46, 'Sell 1', own >= 1, '#dc2626');
            ui.button(ctx, 's10', cx + bw + 20, by + 56, bw, 46, 'Sell 10', own >= 10, '#dc2626');
            ui.button(ctx, 'sall', cx + (bw + 20) * 2, by + 56, bw, 46, 'Sell all', own >= 1, '#b91c1c', money(own * p));

            const nw = this.netWorth(t);
            ctx.fillStyle = 'rgba(15,23,42,.78)'; roundRect(ctx, rx, top - 8, rw, 168, 14); ctx.fill();
            ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = '800 12px system-ui'; ctx.fillText('NET WORTH', rx + 18, top + 18);
            ctx.fillStyle = '#fde047'; ctx.font = '900 34px system-ui'; ctx.fillText(money(nw), rx + 18, top + 56);
            ctx.fillStyle = '#cbd5e1'; ctx.font = '700 14px system-ui'; ctx.fillText(`Cash ${money(this.cash)}`, rx + 18, top + 84);
            ctx.fillText(`Invested ${money(nw - this.cash)}`, rx + 18, top + 106);
            ctx.fillStyle = '#fb923c'; ctx.fillText(`Mining income ${money(this.rigs * 7)}/sec`, rx + 18, top + 128);
            ctx.fillStyle = '#38bdf8'; ctx.fillText(`Research payout ${money(150 + this.intern * 40)}`, rx + 18, top + 150);
            ui.button(ctx, 'research', rx, top + 172, rw, 56, this.researchCd > 0 ? `Research ready in ${Math.ceil(this.researchCd)}s` : 'Research (answer a question)', this.researchCd <= 0, '#0284c7', 'Correct answers pay cash');
            ui.button(ctx, 'rig', rx, top + 238, rw, 56, `Build mining rig · ${this.rigs} owned`, this.cash >= this.rigCost(), '#c2410c', `${money(this.rigCost())} · +$7/sec`);
            ui.button(ctx, 'intern', rx, top + 304, rw, 56, `Hire analyst · ${this.intern} hired`, this.cash >= this.internCost(), '#4f46e5', `${money(this.internCost())} · +$40 per research`);

            const rows = s.standings();
            const slot = Math.min(150, (w - 40) / Math.max(1, rows.length));
            rows.forEach((row, i) => {
                const px = 20 + i * slot, py = h - 100;
                const info = s.roster.get(row.id);
                ctx.fillStyle = row.id === s.user.id ? 'rgba(99,102,241,.3)' : 'rgba(15,23,42,.6)'; roundRect(ctx, px, py, slot - 8, 84, 12); ctx.fill();
                drawFigureSide(ctx, info || row.color, px + 12, py + 18, 26, 44, 1, this.anim, false, 1);
                ctx.textAlign = 'left'; ctx.fillStyle = '#e2e8f0'; ctx.font = '800 12px system-ui'; ctx.fillText(`${i + 1}. ${row.n}`.slice(0, 14), px + 46, py + 34);
                ctx.fillStyle = '#fde047'; ctx.font = '800 13px system-ui'; ctx.fillText(money(row.s), px + 46, py + 54);
            });
            for (const f of this.fx) {
                ctx.globalAlpha = 1 - f.t / 1.4; ctx.fillStyle = f.color; ctx.font = '900 22px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(f.text, cx + cw / 2, top + 230 - f.t * 50); ctx.globalAlpha = 1;
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Fishing Frenzy                                                      */
    /* ------------------------------------------------------------------ */
    const CATCH = [
        { name: 'Minnow', v: 8, color: '#7dd3fc', spd: 1.1 }, { name: 'Bass', v: 18, color: '#4ade80', spd: 1.5 },
        { name: 'Salmon', v: 45, color: '#fb7185', spd: 2.1 }, { name: 'Golden Koi', v: 120, color: '#fbbf24', spd: 2.8 }
    ];

    class Fishing extends A.BaseGame {
        constructor(s) {
            super(s);
            this.title = 'Fishing Frenzy';
            this.st = 0; // 0 idle, 1 charge, 2 wait, 3 bite, 4 reel
            this.power = 0; this.dir = 1; this.depth = 0.5; this.timer = 0; this.anim = 0;
            this.zone = { y: 150, v: 0 }; this.fishY = 150; this.fishT = 150; this.prog = 0.3; this.target = null; this.targetType = 0;
            this.caught = 0; this.combo = 0; this.chests = 0; this.msg = ''; this.msgT = 0; this.msgColor = '#e2e8f0'; this.bag = [];
            this.ui = new Ui(s);
            this.splash = [];
            const r = mulberry32(s.seed);
            this.res = new A.Resource('Bait', '#7dd3fc', 100, 50, 2);
            this.school = Array.from({ length: 22 }, () => ({ y: r(), x0: r() * 3000, spd: (30 + r() * 60) * (r() < 0.5 ? 1 : -1), type: r() < 0.5 ? 0 : r() < 0.6 ? 1 : r() < 0.85 ? 2 : 3 }));
        }

        slotOf(id, w) {
            const ids = [...this.s.roster.keys()].sort();
            const n = Math.max(1, ids.length);
            const step = Math.min(170, (w - 260) / n);
            return w / 2 - ((n - 1) * step) / 2 + Math.max(0, ids.indexOf(id)) * step;
        }

        openChest() {
            if (this.chests < 1 || this.st !== 0) return;
            const opened = this.s.ask(correct => {
                if (correct) { this.s.refill(); this.s.addScore(90); this.s.toast('Treasure! +90', '#fbbf24'); }
                else if (correct === false) this.s.toast('The chest was empty…', '#f87171');
            });
            if (opened) this.chests--;
        }

        update(dt) {
            const s = this.s, m = s.mouse;
            this.anim += dt; this.msgT = Math.max(0, this.msgT - dt);
            for (const sp of this.splash) sp.t += dt;
            this.splash = this.splash.filter(sp => sp.t < 0.8);
            const id = this.ui.hit();
            if (id === 'chest' || s.pressed('KeyC')) this.openChest();
            const click = m.pressed && id !== 'chest';
            const space = s.pressed('Space');
            const act = click || space;
            if (this.st === 0) {
                if (act && s.spend(10)) { this.st = 1; this.power = 0; this.dir = 1; }
            } else if (this.st === 1) {
                this.power += this.dir * dt * 1.4;
                if (this.power >= 1) { this.power = 1; this.dir = -1; } else if (this.power <= 0) { this.power = 0; this.dir = 1; }
                if (!(m.down || s.down('Space'))) {
                    this.depth = 0.12 + this.power * 0.88;
                    this.st = 2; this.timer = 1.1 + Math.random() * 2.2 + this.depth * 0.8;
                    this.splash.push({ t: 0 });
                }
            } else if (this.st === 2) {
                this.timer -= dt;
                if (act) { this.st = 0; this.say('Reeled in too early'); }
                else if (this.timer <= 0) { this.st = 3; this.timer = 0.85; }
            } else if (this.st === 3) {
                this.timer -= dt;
                if (act) {
                    const d = this.depth;
                    const wgt = [0.62 - d * 0.5, 0.3 + d * 0.05, 0.07 + d * 0.3, 0.01 + d * 0.15];
                    let k = Math.random() * wgt.reduce((a, b) => a + b, 0), type = 0;
                    for (; type < 3; type++) { k -= wgt[type]; if (k <= 0) break; }
                    this.target = CATCH[type]; this.targetType = type;
                    this.st = 4; this.prog = 0.3; this.zone = { y: 150, v: 0 }; this.fishY = 150; this.fishT = 150;
                } else if (this.timer <= 0) { this.st = 0; this.combo = 0; this.say('Too slow — it got away!'); }
            } else if (this.st === 4) {
                const held = m.down || s.down('Space');
                this.zone.v = clamp(this.zone.v + (held ? -1500 : 900) * dt, -420, 420);
                this.zone.y = clamp(this.zone.y + this.zone.v * dt, 0, 230);
                if (Math.abs(this.fishY - this.fishT) < 8 || Math.random() < dt * 0.9) this.fishT = Math.random() * 230;
                this.fishY += clamp(this.fishT - this.fishY, -1, 1) * 110 * this.target.spd * dt;
                const inside = this.fishY > this.zone.y - 4 && this.fishY < this.zone.y + 74;
                this.prog = clamp(this.prog + (inside ? 0.34 : -0.2 - this.target.spd * 0.03) * dt, 0, 1);
                if (this.prog >= 1) {
                    this.combo++; this.caught++;
                    const pts = Math.round(this.target.v * (1 + Math.min(this.combo - 1, 5) * 0.1));
                    s.addScore(pts);
                    this.say(`${this.target.name}! +${pts}${this.combo > 1 ? ` · combo x${this.combo}` : ''}`, this.target.color);
                    this.bag.unshift(this.target); this.bag.length = Math.min(this.bag.length, 6);
                    if (Math.random() < 0.14 + this.targetType * 0.06) { this.chests++; s.toast('Treasure chest found! Press C to open it.', '#fbbf24'); }
                    this.st = 0;
                } else if (this.prog <= 0) { this.st = 0; this.combo = 0; this.say('The fish escaped!'); }
            }
            s.setGoal(this.caught);
        }

        say(text, color = '#e2e8f0') { this.msg = text; this.msgT = 2.2; this.msgColor = color; }

        net() { return { x: 0, y: 0, ex: { st: this.st, d: +this.depth.toFixed(2), p: +this.power.toFixed(2) } }; }
        goalText() { return `${this.caught} fish${this.combo > 1 ? ` · combo x${this.combo}` : ''}${this.chests ? ` · ${this.chests} chest` : ''}`; }
        hint() {
            return ['Click / Space to cast (10 bait) · Q for a question to restock bait', 'Release at the right strength — deeper water holds rarer fish', 'Waiting for a bite… click to pull back', 'BITE! Click now!', 'Hold click / Space to lift the green zone onto the fish'][this.st];
        }

        draw(ctx, w, h) {
            const s = this.s, wy = h * 0.4, t = this.anim;
            this.ui.begin();
            const sky = ctx.createLinearGradient(0, 0, 0, wy);
            sky.addColorStop(0, '#38bdf8'); sky.addColorStop(1, '#fde68a');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, w, wy);
            ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(w * 0.85, wy * 0.45, 46, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.85)';
            for (let i = 0; i < 4; i++) { const cx = ((i * 380 + t * 12) % (w + 300)) - 150; ctx.beginPath(); ctx.ellipse(cx, 80 + (i % 2) * 40, 70, 22, 0, 0, TAU); ctx.ellipse(cx + 40, 74 + (i % 2) * 40, 46, 20, 0, 0, TAU); ctx.fill(); }
            const water = ctx.createLinearGradient(0, wy, 0, h);
            water.addColorStop(0, '#22d3ee'); water.addColorStop(0.4, '#0e7490'); water.addColorStop(1, '#083344');
            ctx.fillStyle = water; ctx.fillRect(0, wy, w, h - wy);
            ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath();
            for (let x = 0; x <= w; x += 12) { const y = wy + Math.sin(x / 30 + t * 2) * 3; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
            for (const f of this.school) {
                const span = w + 200;
                const fx = ((((f.x0 + f.spd * t) % span) + span) % span) - 100;
                const fy = wy + 40 + f.y * (h - wy - 70);
                const kind = CATCH[f.type];
                ctx.save(); ctx.translate(fx, fy); ctx.scale(Math.sign(f.spd), 1); ctx.globalAlpha = 0.5;
                ctx.fillStyle = kind.color; ctx.beginPath(); ctx.ellipse(0, 0, 14 + f.type * 3, 7 + f.type, 0, 0, TAU); ctx.fill();
                ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-24, -6); ctx.lineTo(-24, 6); ctx.fill(); ctx.restore();
            }
            const dockY = wy - 6;
            ctx.fillStyle = '#92400e'; ctx.fillRect(0, dockY, w, 16);
            ctx.fillStyle = '#78350f'; for (let x = 20; x < w; x += 80) ctx.fillRect(x, dockY + 16, 10, 60);

            const angler = (info, st, depth, power, isMe) => {
                const x = this.slotOf(info.id, w);
                drawFigureSide(ctx, info, x - 13, dockY - 44, 26, 44, 1, t, false, 1);
                ctx.strokeStyle = '#a16207'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 6, dockY - 24); ctx.lineTo(x + 52, dockY - 62); ctx.stroke();
                nameTag(ctx, isMe ? 'You' : info.nickname, x, dockY - 70, isMe ? '#fff' : info.color);
                if (st >= 2) {
                    const bx = x + 52 + Math.sin(t * 2 + x) * 2;
                    const by = wy + 30 + depth * (h - wy - 120) + (st === 3 ? Math.sin(t * 40) * 5 : Math.sin(t * 3) * 2);
                    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 52, dockY - 62); ctx.lineTo(bx, wy); ctx.lineTo(bx, by); ctx.stroke();
                    ctx.fillStyle = st === 3 ? '#fde047' : '#ef4444'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.fill();
                    if (st === 3) { ctx.fillStyle = '#fde047'; ctx.font = '900 30px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', bx, by - 14); }
                    if (st === 4) { ctx.fillStyle = 'rgba(253,224,71,.4)'; ctx.beginPath(); ctx.arc(bx, by, 18 + Math.sin(t * 12) * 4, 0, TAU); ctx.fill(); }
                } else if (st === 1) {
                    ctx.fillStyle = 'rgba(8,12,24,.7)'; ctx.fillRect(x - 30, dockY + 24, 60, 10);
                    ctx.fillStyle = '#f97316'; ctx.fillRect(x - 30, dockY + 24, 60 * power, 10);
                }
            };
            for (const info of s.roster.values()) {
                if (info.id === s.user.id) continue;
                const r = s.remotes.get(info.id);
                if (r) angler(info, r.ex?.st || 0, r.ex?.d || 0.5, r.ex?.p || 0, false);
            }
            angler(s.local, this.st, this.depth, this.power, true);
            for (const sp of this.splash) {
                const x = this.slotOf(s.user.id, w) + 52;
                ctx.strokeStyle = `rgba(255,255,255,${1 - sp.t / 0.8})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, wy + 2, 10 + sp.t * 50, 4 + sp.t * 14, 0, 0, TAU); ctx.stroke();
            }
            if (this.st === 1) {
                const mx = w / 2 - 160, my = h - 90;
                ctx.fillStyle = 'rgba(8,12,24,.7)'; roundRect(ctx, mx, my, 320, 26, 13); ctx.fill();
                const g = ctx.createLinearGradient(mx, 0, mx + 320, 0); g.addColorStop(0, '#4ade80'); g.addColorStop(1, '#ef4444');
                ctx.fillStyle = g; roundRect(ctx, mx + 3, my + 3, Math.max(8, 314 * this.power), 20, 10); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Release to cast — farther = deeper = rarer', w / 2, my - 8);
            }
            if (this.st === 3) { ctx.fillStyle = '#fde047'; ctx.font = '900 54px system-ui'; ctx.textAlign = 'center'; ctx.fillText('BITE! CLICK!', w / 2, h * 0.28); }
            if (this.st === 4) {
                const px = w / 2 - 40, py = h / 2 - 90;
                ctx.fillStyle = 'rgba(8,12,24,.82)'; roundRect(ctx, px - 70, py - 30, 260, 340, 18); ctx.fill();
                ctx.fillStyle = '#0c4a6e'; roundRect(ctx, px, py, 60, 300, 12); ctx.fill();
                ctx.fillStyle = 'rgba(74,222,128,.75)'; roundRect(ctx, px + 2, py + this.zone.y, 56, 70, 8); ctx.fill();
                ctx.fillStyle = this.target.color; ctx.beginPath(); ctx.ellipse(px + 30, py + 35 + this.fishY, 18, 10, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(px + 38, py + 33 + this.fishY, 2.5, 0, TAU); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(ctx, px + 82, py, 22, 300, 8); ctx.fill();
                ctx.fillStyle = this.prog > 0.5 ? '#4ade80' : '#fbbf24'; roundRect(ctx, px + 82, py + 300 * (1 - this.prog), 22, Math.max(6, 300 * this.prog), 8); ctx.fill();
                ctx.fillStyle = '#e2e8f0'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(this.target.name, px + 55, py - 8);
            }
            if (this.msgT > 0) { ctx.globalAlpha = Math.min(1, this.msgT); ctx.fillStyle = this.msgColor; ctx.font = '900 28px system-ui'; ctx.textAlign = 'center'; ctx.fillText(this.msg, w / 2, h * 0.2); ctx.globalAlpha = 1; }
            this.bag.forEach((f, i) => { ctx.fillStyle = f.color; ctx.beginPath(); ctx.ellipse(40 + i * 40, h - 40, 14, 7, 0, 0, TAU); ctx.fill(); });
            if (this.chests > 0) this.ui.button(ctx, 'chest', w - 230, h - 80, 210, 56, `Open treasure chest (${this.chests})`, this.st === 0, '#7c3aed', 'Answer a question for loot · C');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Crypto Hack                                                         */
    /* ------------------------------------------------------------------ */
    class Hack extends A.Arena {
        constructor(s) {
            super(s, 1900, 1250);
            this.title = 'Crypto Hack';
            this.crypto = 0; this.shield = 0; this.stolen = 0;
            this.baseSpeed = 260;
            [[300, 260], [300, 640], [300, 960], [820, 140], [820, 1020], [1160, 140], [1160, 1020], [1480, 260], [1480, 640], [1480, 960]]
                .forEach(([x, y]) => this.walls.push({ x, y, w: 120, h: 190 }));
            this.walls.push({ x: 780, y: 520, w: 340, h: 40 }, { x: 780, y: 700, w: 340, h: 40 });
            this.terms = [
                { id: 0, kind: 'mine', x: 220, y: 120, cd: 0 }, { id: 1, kind: 'mine', x: 1680, y: 120, cd: 0 },
                { id: 2, kind: 'mine', x: 220, y: 1130, cd: 0 }, { id: 3, kind: 'mine', x: 1680, y: 1130, cd: 0 },
                { id: 4, kind: 'hack', x: 950, y: 460, cd: 0 }, { id: 5, kind: 'hack', x: 950, y: 790, cd: 0 },
                { id: 6, kind: 'hack', x: 600, y: 625, cd: 0 }, { id: 7, kind: 'hack', x: 1300, y: 625, cd: 0 }
            ];
            this.me.x = 950; this.me.y = 625; this.cam.x = this.me.x; this.cam.y = this.me.y;
            this.hk = null; this.ui = new Ui(s); this.pops = [];
        }

        update(dt) {
            const s = this.s;
            this.shield = Math.max(0, this.shield - dt);
            for (const c of this.pops) c.t += dt;
            this.pops = this.pops.filter(c => c.t < 1.2);
            s.score = Math.max(0, Math.round(this.crypto));
            s.setGoal(s.score);
            if (this.hk) { this.anim += dt; this.hackUpdate(); return; }
            this.step(dt);
            for (const t of this.terms) t.cd = Math.max(0, t.cd - dt);
            for (const t of this.terms) {
                if (t.cd > 0 || dist(this.me.x, this.me.y, t.x, t.y) > 46) continue;
                if (t.kind === 'mine') {
                    const gain = s.reward * 3;
                    const opened = s.ask(correct => {
                        if (correct) { this.crypto += gain; this.pop(`+${gain} crypto`, '#4ade80'); s.toast(`Mined ${gain} crypto!`, '#4ade80'); }
                        else if (correct === false) s.toast('Mining failed — try again later.', '#f87171');
                    }, `Correct answer: +${gain} crypto`);
                    if (opened) t.cd = 10;
                } else {
                    t.cd = 8;
                    this.hk = { code: [0, 1, 2].map(() => 1 + Math.floor(Math.random() * 5)), guess: [], rows: [], tries: 7, phase: 'code' };
                }
            }
        }

        pop(text, color) { this.pops.push({ text, color, t: 0, x: this.me.x, y: this.me.y - 30 }); }

        endHack(delay = 0) {
            const h = this.hk;
            if (delay) setTimeout(() => { if (this.hk === h) this.hk = null; }, delay); else this.hk = null;
        }

        hackUpdate() {
            const s = this.s, g = this.hk;
            const id = this.ui.hit();
            if (g.phase === 'code') {
                for (let n = 1; n <= 5; n++) if (s.pressed(`Digit${n}`, `Numpad${n}`) && g.guess.length < 3) g.guess.push(n);
                if (s.pressed('Backspace')) g.guess.pop();
                if (s.pressed('Escape')) { this.endHack(); return; }
                if (id && id[0] === 'd' && id !== 'del' && g.guess.length < 3) g.guess.push(Number(id.slice(1)));
                else if (id === 'del') g.guess.pop();
                else if (id === 'quit') { this.endHack(); return; }
                if (g.guess.length === 3) {
                    const exact = g.guess.filter((d, i) => d === g.code[i]).length;
                    const rest = g.code.filter((d, i) => d !== g.guess[i]);
                    let near = 0;
                    for (const d of g.guess.filter((d, i) => d !== g.code[i])) { const k = rest.indexOf(d); if (k >= 0) { near++; rest.splice(k, 1); } }
                    g.rows.push({ guess: g.guess.slice(), exact, near });
                    g.guess = []; g.tries--;
                    if (exact === 3) this.accessGranted(g);
                    else if (g.tries <= 0) { g.phase = 'fail'; this.endHack(1400); }
                }
            } else if (g.phase === 'target') {
                if (id && id[0] === 'v') this.steal(id.slice(1), g);
                else if (id === 'quit' || s.pressed('Escape')) this.endHack();
            }
        }

        accessGranted(g) {
            const list = this.s.remoteList();
            if (!list.length) { this.crypto += 80; this.pop('+80 crypto', '#fbbf24'); g.phase = 'done'; this.endHack(900); return; }
            g.phase = 'target';
            g.targets = list.map(r => ({ id: r.id, name: r.name, score: r.score }));
        }

        steal(id, g) {
            const r = this.s.remotes.get(id);
            if (!r) { this.endHack(); return; }
            this.s.emit({ k: 'st', to: id, amt: Math.max(30, Math.floor((r.score || 0) * 0.25)) });
            this.s.toast(`Hacking ${r.name}…`, '#f87171');
            g.phase = 'done';
            this.endHack(500);
        }

        onEvent(ev, from) {
            const s = this.s;
            if (ev.k === 'st' && ev.to === s.user.id) {
                let loss = 0;
                if (this.shield <= 0) { loss = Math.min(Math.round(this.crypto), Math.max(0, ev.amt)); this.crypto -= loss; this.shield = 6; }
                s.toast(loss ? `${from.name} hacked you! −${loss}` : `${from.name} tried to hack you, but your firewall held.`, '#f87171');
                s.emit({ k: 'lo', to: from.id, amt: loss });
            } else if (ev.k === 'lo' && ev.to === s.user.id) {
                this.crypto += ev.amt; this.stolen += ev.amt;
                this.pop(`+${ev.amt} stolen`, '#f87171');
                s.toast(ev.amt ? `Hack success! Stole ${ev.amt} crypto from ${from.name}` : `${from.name} was shielded.`, ev.amt ? '#4ade80' : '#fbbf24');
            }
        }

        ex() { return { sh: this.shield > 0 ? 1 : 0 }; }
        goalText() { return `${Math.round(this.crypto)} crypto · stolen ${this.stolen}`; }
        hint() { return this.hk ? '1–5 type the code · Backspace delete · Esc abort' : 'WASD move · green terminals mine crypto (question) · red terminals crack a code to steal from rivals'; }

        draw(ctx, w, h) {
            const t = this.anim;
            this.ui.begin();
            ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h, 800);
            ctx.fillStyle = '#0a1224'; ctx.fillRect(0, 0, this.W, this.H);
            ctx.strokeStyle = 'rgba(34,211,238,.1)'; ctx.lineWidth = 1;
            for (let x = 0; x <= this.W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H); ctx.stroke(); }
            for (let y = 0; y <= this.H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke(); }
            for (const wl of this.walls) {
                ctx.fillStyle = '#1e293b'; ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
                ctx.strokeStyle = '#334155'; ctx.lineWidth = 3; ctx.strokeRect(wl.x + 1.5, wl.y + 1.5, wl.w - 3, wl.h - 3);
                if (wl.w > 100 && wl.h > 100) for (let i = 0; i < 8; i++) { ctx.fillStyle = (Math.floor(t * 4 + i * 1.7) % 3 === 0) ? '#22d3ee' : '#4ade80'; ctx.fillRect(wl.x + 14 + (i % 2) * 70, wl.y + 14 + Math.floor(i / 2) * 42, 10, 6); }
            }
            for (const term of this.terms) {
                const mine = term.kind === 'mine', color = mine ? '#4ade80' : '#f87171', on = term.cd <= 0;
                ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(term.x + 3, term.y + 26, 34, 12, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#0f172a'; roundRect(ctx, term.x - 30, term.y - 26, 60, 46, 8); ctx.fill();
                ctx.fillStyle = on ? color : '#334155'; roundRect(ctx, term.x - 25, term.y - 21, 50, 32, 5); ctx.fill();
                ctx.fillStyle = '#0f172a'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(mine ? 'MINE' : 'HACK', term.x, term.y + 1);
                if (on) this.ring(ctx, term.x, term.y, 44 + Math.sin(t * 5 + term.id) * 3, color + 'aa', 3);
            }
            this.drawPlayers(ctx, (c, x, y, r) => { if (r ? r.ex?.sh : this.shield > 0) this.ring(c, x, y, 28, 'rgba(56,189,248,.8)', 3); });
            for (const c of this.pops) { ctx.globalAlpha = 1 - c.t / 1.2; ctx.fillStyle = c.color; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText(c.text, c.x, c.y - c.t * 50); ctx.globalAlpha = 1; }
            this.particles.draw(ctx);
            this.end(ctx);
            if (this.hk) this.drawHack(ctx, w, h);
        }

        drawHack(ctx, w, h) {
            const g = this.hk, ui = this.ui;
            ctx.fillStyle = 'rgba(2,6,16,.82)'; ctx.fillRect(0, 0, w, h);
            const bx = w / 2 - 230, by = Math.max(10, h / 2 - 270);
            ctx.fillStyle = '#04120b'; roundRect(ctx, bx, by, 460, 540, 18); ctx.fill();
            ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#4ade80'; ctx.font = '900 22px "Courier New", monospace'; ctx.textAlign = 'center';
            ctx.fillText('> BREACH TERMINAL', w / 2, by + 40);
            ctx.font = '600 13px "Courier New", monospace'; ctx.fillStyle = '#86efac';
            ctx.fillText('Crack the 3-digit code (digits 1-5). ■ right spot  □ wrong spot', w / 2, by + 66);
            ctx.fillText(`Attempts left: ${Math.max(0, g.tries)}`, w / 2, by + 88);
            g.rows.slice(-6).forEach((row, i) => {
                const y = by + 124 + i * 34;
                ctx.fillStyle = '#e2e8f0'; ctx.font = '800 22px "Courier New", monospace'; ctx.textAlign = 'right'; ctx.fillText(row.guess.join('  '), w / 2 - 20, y);
                ctx.textAlign = 'left'; ctx.fillStyle = '#4ade80'; ctx.fillText('■'.repeat(row.exact), w / 2 + 20, y);
                ctx.fillStyle = '#fbbf24'; ctx.fillText('□'.repeat(row.near), w / 2 + 20 + row.exact * 17, y);
            });
            ctx.textAlign = 'center';
            if (g.phase === 'code') {
                ctx.fillStyle = '#e2e8f0'; ctx.font = '900 30px "Courier New", monospace';
                ctx.fillText([0, 1, 2].map(i => g.guess[i] ?? '_').join('  '), w / 2, by + 360);
                for (let n = 1; n <= 5; n++) ui.button(ctx, `d${n}`, bx + 40 + (n - 1) * 78, by + 390, 66, 50, String(n), g.guess.length < 3, '#166534');
                ui.button(ctx, 'del', bx + 40, by + 456, 150, 44, 'Delete', true, '#475569');
                ui.button(ctx, 'quit', bx + 270, by + 456, 150, 44, 'Abort', true, '#991b1b');
            } else if (g.phase === 'target') {
                ctx.fillStyle = '#4ade80'; ctx.font = '900 20px "Courier New", monospace'; ctx.fillText('ACCESS GRANTED — choose a target', w / 2, by + 340);
                (g.targets || []).slice(0, 4).forEach((tg, i) => ui.button(ctx, `v${tg.id}`, bx + 40, by + 356 + i * 36, 380, 30, `${tg.name} · ${Math.round(tg.score)} crypto`, true, '#b91c1c'));
                ui.button(ctx, 'quit', bx + 150, by + 504, 160, 28, 'Cancel', true, '#475569');
            } else if (g.phase === 'fail') {
                ctx.fillStyle = '#f87171'; ctx.font = '900 26px "Courier New", monospace'; ctx.fillText('LOCKED OUT', w / 2, by + 400);
            } else {
                ctx.fillStyle = '#4ade80'; ctx.font = '900 26px "Courier New", monospace'; ctx.fillText('TRANSFER STARTED…', w / 2, by + 400);
            }
        }
    }

    Object.assign(A.games, { crypto: Crypto, fishing: Fishing, hack: Hack });
})(window);
