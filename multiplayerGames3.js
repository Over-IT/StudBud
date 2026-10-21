(function (window) {
    'use strict';

    const A = window.StudBudArcade;
    const { TAU, clamp, dist, mulberry32, hashStr, roundRect, nameTag, drawFigureSide } = A.util;
    const clock = s => (Date.now() - s.startedAt) / 1000;
    const money = n => `$${Math.round(n).toLocaleString()}`;

    /* Immediate-mode button helper shared by the canvas-UI games. */
    class Ui {
        constructor(session) { this.s = session; this.rects = []; this.prev = []; }
        begin() { this.prev = this.rects; this.rects = []; this.transform = null; }
        addRect(rect) {
            const t = this.transform;
            const mapped = t ? { ...rect, x: t.x + rect.x * t.scale, y: t.y + rect.y * t.scale, w: rect.w * t.scale, h: rect.h * t.scale } : rect;
            this.rects.push(mapped);
            return mapped;
        }
        inside(r) {
            const m = this.s.mouse;
            return Boolean(r && r.on && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h);
        }
        hit(rects = this.prev) {
            if (!this.s.mouse.pressed) return null;
            for (let i = rects.length - 1; i >= 0; i--) if (this.inside(rects[i])) return rects[i].id;
            return null;
        }
        button(ctx, id, x, y, w, h, label, on = true, color = '#6366f1', sub = '') {
            const rect = { id, x, y, w, h, on };
            const hov = this.inside(this.addRect(rect));
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
            this.title = 'Crypto Trading';
            this.scoreGoal = false; this.goalLabel = 'Net worth'; this.formatValue = v => money(v);
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
                this.s.sfx('buy');
            } else {
                const n = Math.min(this.units[i], -qty);
                if (n < 1) { this.s.toast(`You don't own any ${ASSETS[i].sym}`, '#f87171'); return; }
                this.cash += n * price; this.units[i] -= n;
                this.pop(`Sold ${n} · ${money(n * price)}`, '#4ade80');
                this.s.sfx('coin');
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
                    this.researchCd = 1;
                    if (correct) { const gain = s.reward * 8 + this.intern * 40; this.cash += gain; this.pop(`Research +${money(gain)}`, '#38bdf8'); s.toast(`Great research! +${money(gain)}`, '#38bdf8'); }
                    else if (correct === false) s.toast('Bad intel — no payout.', '#f87171');
                }, `Correct answer: +${money(s.reward * 8 + this.intern * 40)} cash`, true);
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
        touchLayout() { return { stick: false, buttons: [{ k: 'KeyB', label: 'Buy', cls: 'buy' }, { k: 'KeyS', label: 'Sell', cls: 'sell' }, { k: 'ShiftLeft', label: 'Max', cls: 'max' }], cols: 3 }; }
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

            if (s.preview) {
                ASSETS.forEach((asset, i) => {
                    const x = 20 + (i % 3) * (w - 40) / 3, y = 20 + Math.floor(i / 3) * (h - 100) / 2;
                    this.chart(ctx, i, x, y, (w - 70) / 3, (h - 125) / 2, t, false);
                    ctx.fillStyle = asset.color; ctx.fillRect(x, y, 8, 8);
                });
                [...s.roster.values()].forEach((player, i) => drawFigureSide(ctx, player, w * (i + 1) / (s.roster.size + 1) - 13, h - 60, 26, 44, 1, this.anim, false, 1));
                return;
            }
            if (s.vw < 900 || s.overlay.classList.contains('has-touch')) { this.drawCompact(ctx); return; }
            ui.transform = s.placeHud(ctx, 0, 60, 1200, 660, 'center');
            w = 1200; h = 720;
            const lx = 18, lw = 300, top = 82, rw = 300, rx = w - rw - 18, cx = lx + lw + 18, cw = Math.max(300, rx - cx - 18);
            ctx.fillStyle = '#94a3b8'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'left'; ctx.fillText('MARKETS', lx, top - 8);
            ASSETS.forEach((a, i) => {
                const y = top + i * 74;
                const p = this.price(i, t), prev = this.price(i, Math.max(0, t - 20));
                const ch = (p - prev) / prev;
                ui.addRect({ id: `sel${i}`, x: lx, y, w: lw, h: 66, on: true });
                ctx.fillStyle = this.sel === i ? 'rgba(99,102,241,.35)' : 'rgba(15,23,42,.7)'; roundRect(ctx, lx, y, lw, 66, 12); ctx.fill();
                ctx.strokeStyle = this.sel === i ? a.color : 'rgba(148,163,184,.2)'; ctx.lineWidth = this.sel === i ? 3 : 1.5; ctx.stroke();
                ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(lx + 26, y + 33, 14, 0, TAU); ctx.fill();
                ctx.fillStyle = '#0f172a'; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(a.sym, lx + 26, y + 37);
                ctx.textAlign = 'left'; ctx.fillStyle = '#e2e8f0'; ctx.font = '800 14px system-ui'; ctx.fillText(a.name, lx + 50, y + 25);
                ctx.fillStyle = '#94a3b8'; ctx.font = '600 11px system-ui'; ctx.fillText(`${a.kind}${this.units[i] ? ` · own ${this.units[i]}` : ''}`, lx + 50, y + 44);
                this.chart(ctx, i, lx + 168, y + 12, 52, 40, t, false);
                ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '800 14px system-ui'; ctx.fillText(money(p), lx + lw - 10, y + 27);
                ctx.fillStyle = ch >= 0 ? '#4ade80' : '#f87171'; ctx.font = '700 12px system-ui'; ctx.fillText(`${ch >= 0 ? '▲' : '▼'} ${(Math.abs(ch) * 100).toFixed(2)}%`, lx + lw - 10, y + 46);
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
            ctx.restore();
        }

        drawCompact(ctx) {
            const s = this.s, ui = this.ui, t = clock(s), wide = s.vw > s.vh * 1.2;
            const width = wide ? 700 : 340, height = wide ? 280 : 430;
            ui.transform = s.placeHud(ctx, 0, 0, width, height, 'center');
            ctx.fillStyle = 'rgba(15,23,42,.92)'; roundRect(ctx, 0, 0, width, height, 12); ctx.fill();
            const a = ASSETS[this.sel], p = this.price(this.sel, t), own = this.units[this.sel];
            ctx.textAlign = 'left'; ctx.fillStyle = '#fde047'; ctx.font = '800 18px system-ui'; ctx.fillText(`Net worth ${money(this.netWorth(t))}`, 12, 27);
            ctx.fillStyle = '#cbd5e1'; ctx.font = '700 12px system-ui'; ctx.fillText(`Cash ${money(this.cash)} · Mining ${money(this.rigs * 7)}/s`, 12, 48, 316);
            ASSETS.forEach((asset, i) => ui.button(ctx, `sel${i}`, 12 + (i % 3) * 108, 60 + Math.floor(i / 3) * 39, 100, 32, asset.sym, true, this.sel === i ? '#4f46e5' : '#334155'));
            ctx.fillStyle = a.color; ctx.font = '800 16px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${a.name} · ${money(p)} · Own ${own}`, 12, 158, 316);
            this.chart(ctx, this.sel, 12, 168, 316, wide ? 100 : 72, t, true);
            const bx = wide ? 368 : 12, by = wide ? 12 : 248;
            ui.button(ctx, 'b1', bx, by, 73, 38, 'Buy 1', this.cash >= p, '#16a34a');
            ui.button(ctx, 'bmax', bx + 81, by, 73, 38, 'Buy max', this.cash >= p, '#15803d');
            ui.button(ctx, 's1', bx + 162, by, 73, 38, 'Sell 1', own > 0, '#dc2626');
            ui.button(ctx, 'sall', bx + 243, by, 73, 38, 'Sell all', own > 0, '#b91c1c');
            const rh = wide ? 56 : 36, gap = wide ? 64 : 44;
            ui.button(ctx, 'research', bx, by + 46, 316, rh, this.researchCd > 0 ? `Research ready in ${Math.ceil(this.researchCd)}s` : `Research question · ${money(150 + this.intern * 40)}`, this.researchCd <= 0, '#0284c7');
            ui.button(ctx, 'rig', bx, by + 46 + gap, 316, rh, `Build rig · ${money(this.rigCost())} · ${this.rigs} owned`, this.cash >= this.rigCost(), '#c2410c');
            ui.button(ctx, 'intern', bx, by + 46 + gap * 2, 316, rh, `Hire analyst · ${money(this.internCost())} · ${this.intern} hired`, this.cash >= this.internCost(), '#4f46e5');
            ctx.restore();
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
            this.res = new A.Resource('Bait', '#7dd3fc', 100, 20, 2);
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
            }, undefined, true);
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
                if (act && s.spend(A.ENERGY_COSTS.fishing.cast)) { this.st = 1; this.power = 0; this.dir = 1; s.sfx('cast'); }
            } else if (this.st === 1) {
                this.power += this.dir * dt * 1.4;
                if (this.power >= 1) { this.power = 1; this.dir = -1; } else if (this.power <= 0) { this.power = 0; this.dir = 1; }
                if (!(m.down || s.down('Space'))) {
                    this.depth = 0.12 + this.power * 0.88;
                    this.st = 2; this.timer = 1.1 + Math.random() * 2.2 + this.depth * 0.8;
                    this.splash.push({ t: 0 });
                    s.sfx('splash');
                }
            } else if (this.st === 2) {
                this.timer -= dt;
                if (act) { this.st = 0; this.say('Reeled in too early'); }
                else if (this.timer <= 0) { this.st = 3; this.timer = 0.85; s.sfx('tick'); }
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
                    const pts = this.catchPoints(this.targetType, this.combo);
                    s.addScore(pts);
                    s.sfx('catch');
                    this.say(`${this.target.name}! +${pts}${this.combo > 1 ? ` · combo x${this.combo}` : ''}`, this.target.color);
                    this.bag.unshift(this.target); this.bag.length = Math.min(this.bag.length, 6);
                    if (Math.random() < 0.14 + this.targetType * 0.06) { this.chests++; s.toast('Treasure chest found! Press C to open it.', '#fbbf24'); }
                    this.st = 0;
                } else if (this.prog <= 0) { this.st = 0; this.combo = 0; this.say('The fish escaped!'); }
            }
            s.setGoal(this.caught);
        }

        say(text, color = '#e2e8f0') { this.msg = text; this.msgT = 2.2; this.msgColor = color; }
        catchPoints(type, combo) { return Math.round(CATCH[type].v * (1 + Math.min(combo - 1, 5) * .1)); }
        catchSpeed(type) { return CATCH[type].spd; }

        net() { return { x: 0, y: 0, ex: { st: this.st, d: +this.depth.toFixed(2), p: +this.power.toFixed(2) } }; }
        goalText() { return `${this.caught} fish${this.combo > 1 ? ` · combo x${this.combo}` : ''}${this.chests ? ` · ${this.chests} chest` : ''}`; }
        touchLayout() { return { stick: false, buttons: [{ k: 'Space', label: 'Cast / Reel', cls: 'main' }, { k: 'KeyC', label: 'Chest' }] }; }
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
                if (fx < -35 || fx > w + 35 || fy < -20 || fy > h + 20) continue;
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
                if (!this.s.preview) nameTag(ctx, isMe ? 'You' : info.nickname, x, dockY - 70, isMe ? '#fff' : info.color);
                if (st >= 2) {
                    const bx = x + 52 + Math.sin(t * 2 + x) * 2;
                    const by = wy + 30 + depth * (h - wy - 120) + (st === 3 ? Math.sin(t * 40) * 5 : Math.sin(t * 3) * 2);
                    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 52, dockY - 62); ctx.lineTo(bx, wy); ctx.lineTo(bx, by); ctx.stroke();
                    ctx.fillStyle = st === 3 ? '#fde047' : '#ef4444'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.fill();
                    if (st === 3 && !s.preview) { ctx.fillStyle = '#fde047'; ctx.font = '900 30px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', bx, by - 14); }
                    if (st === 4) { ctx.fillStyle = 'rgba(253,224,71,.4)'; ctx.beginPath(); ctx.arc(bx, by, 18 + Math.sin(t * 12) * 4, 0, TAU); ctx.fill(); }
                } else if (st === 1 && !s.preview) {
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
            if (s.preview) return;
            if (this.st === 1) {
                s.placeHud(ctx, w / 2 - 160, h - 116, 320, 52, 'bottom-center');
                const mx = w / 2 - 160, my = h - 90;
                ctx.fillStyle = 'rgba(8,12,24,.7)'; roundRect(ctx, mx, my, 320, 26, 13); ctx.fill();
                const g = ctx.createLinearGradient(mx, 0, mx + 320, 0); g.addColorStop(0, '#4ade80'); g.addColorStop(1, '#ef4444');
                ctx.fillStyle = g; roundRect(ctx, mx + 3, my + 3, Math.max(8, 314 * this.power), 20, 10); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Release to cast — farther = deeper = rarer', w / 2, my - 8); ctx.restore();
            }
            if (this.st === 3) { s.placeHud(ctx, 0, 0, 340, 60, 'top-center'); ctx.fillStyle = '#fde047'; ctx.font = '900 48px system-ui'; ctx.textAlign = 'center'; ctx.fillText('BITE! CLICK!', 170, 45); ctx.restore(); }
            if (this.st === 4) {
                s.placeHud(ctx, 0, 0, 260, 340, 'center');
                const px = 70, py = 30;
                ctx.fillStyle = 'rgba(8,12,24,.82)'; roundRect(ctx, px - 70, py - 30, 260, 340, 18); ctx.fill();
                ctx.fillStyle = '#0c4a6e'; roundRect(ctx, px, py, 60, 300, 12); ctx.fill();
                ctx.fillStyle = 'rgba(74,222,128,.75)'; roundRect(ctx, px + 2, py + this.zone.y, 56, 70, 8); ctx.fill();
                ctx.fillStyle = this.target.color; ctx.beginPath(); ctx.ellipse(px + 30, py + 35 + this.fishY, 18, 10, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(px + 38, py + 33 + this.fishY, 2.5, 0, TAU); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(ctx, px + 82, py, 22, 300, 8); ctx.fill();
                ctx.fillStyle = this.prog > 0.5 ? '#4ade80' : '#fbbf24'; roundRect(ctx, px + 82, py + 300 * (1 - this.prog), 22, Math.max(6, 300 * this.prog), 8); ctx.fill();
                ctx.fillStyle = '#e2e8f0'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(this.target.name, px + 55, py - 8); ctx.restore();
            }
            if (this.msgT > 0 && this.st !== 4 && this.st !== 3 && !this.chests) { s.placeHud(ctx, 0, 0, 340, 40, 'top-center'); ctx.globalAlpha = Math.min(1, this.msgT); ctx.fillStyle = this.msgColor; ctx.font = '900 24px system-ui'; ctx.textAlign = 'center'; ctx.fillText(this.msg, 170, 28); ctx.restore(); }
            if (this.st === 0 && this.bag.length) {
                s.placeHud(ctx, 0, 0, Math.max(40, this.bag.length * 40), 24, 'bottom-left');
                this.bag.forEach((f, i) => { ctx.fillStyle = f.color; ctx.beginPath(); ctx.ellipse(20 + i * 40, 12, 14, 7, 0, 0, TAU); ctx.fill(); }); ctx.restore();
            }
            if (this.chests > 0 && this.st === 0) {
                this.ui.transform = s.placeHud(ctx, 0, 0, 210, 56, 'top-center');
                this.ui.button(ctx, 'chest', 0, 0, 210, 56, `Open treasure chest (${this.chests})`, true, '#7c3aed', 'Answer a question for loot · C'); ctx.restore();
            }
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
                    if (opened) t.cd = 1;
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
            this.s.sfx('confirm');
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
                s.sfx(loss ? 'danger' : 'deny');
            } else if (ev.k === 'lo' && ev.to === s.user.id) {
                this.crypto += ev.amt; this.stolen += ev.amt;
                this.pop(`+${ev.amt} stolen`, '#f87171');
                s.sfx(ev.amt ? 'coin' : 'deny');
                s.toast(ev.amt ? `Hack success! Stole ${ev.amt} crypto from ${from.name}` : `${from.name} was shielded.`, ev.amt ? '#4ade80' : '#fbbf24');
            }
        }

        ex() { return { sh: this.shield > 0 ? 1 : 0 }; }
        goalText() { return `${Math.round(this.crypto)} crypto · stolen ${this.stolen}`; }
        touchLayout() { return { stick: !this.hk, buttons: [] }; }
        hint() { return this.hk ? '1–5 type the code · Backspace delete · Esc abort' : 'WASD move · green terminals mine crypto (question) · red terminals crack a code to steal from rivals'; }

        draw(ctx, w, h) {
            const t = this.anim;
            this.ui.begin();
            ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h, 800);
            ctx.fillStyle = '#0a1224'; ctx.fillRect(0, 0, this.W, this.H);
            ctx.strokeStyle = 'rgba(34,211,238,.1)'; ctx.lineWidth = 1;
            for (let x = Math.max(0, Math.ceil(this.x0 / 60) * 60); x <= Math.min(this.W, this.x1); x += 60) { ctx.beginPath(); ctx.moveTo(x, Math.max(0, this.y0)); ctx.lineTo(x, Math.min(this.H, this.y1)); ctx.stroke(); }
            for (let y = Math.max(0, Math.ceil(this.y0 / 60) * 60); y <= Math.min(this.H, this.y1); y += 60) { ctx.beginPath(); ctx.moveTo(Math.max(0, this.x0), y); ctx.lineTo(Math.min(this.W, this.x1), y); ctx.stroke(); }
            for (const wl of this.walls) {
                if (!this.seenRect(wl.x, wl.y, wl.w, wl.h)) continue;
                ctx.fillStyle = '#1e293b'; ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
                ctx.strokeStyle = '#334155'; ctx.lineWidth = 3; ctx.strokeRect(wl.x + 1.5, wl.y + 1.5, wl.w - 3, wl.h - 3);
                if (wl.w > 100 && wl.h > 100) for (let i = 0; i < 8; i++) { ctx.fillStyle = (Math.floor(t * 4 + i * 1.7) % 3 === 0) ? '#22d3ee' : '#4ade80'; ctx.fillRect(wl.x + 14 + (i % 2) * 70, wl.y + 14 + Math.floor(i / 2) * 42, 10, 6); }
            }
            for (const term of this.terms) {
                if (!this.seen(term.x, term.y)) continue;
                const mine = term.kind === 'mine', color = mine ? '#4ade80' : '#f87171', on = term.cd <= 0;
                ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(term.x + 3, term.y + 26, 34, 12, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#0f172a'; roundRect(ctx, term.x - 30, term.y - 26, 60, 46, 8); ctx.fill();
                ctx.fillStyle = on ? color : '#334155'; roundRect(ctx, term.x - 25, term.y - 21, 50, 32, 5); ctx.fill();
                ctx.fillStyle = '#0f172a'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(mine ? 'MINE' : 'HACK', term.x, term.y + 1);
                if (on) this.ring(ctx, term.x, term.y, 44 + Math.sin(t * 5 + term.id) * 3, color + 'aa', 3);
            }
            this.drawPlayers(ctx, (c, x, y, r) => { if (r ? r.ex?.sh : this.shield > 0) this.ring(c, x, y, 28, 'rgba(56,189,248,.8)', 3); });
            for (const c of this.s.preview ? [] : this.pops) { if (!this.seen(c.x, c.y - c.t * 50, 180)) continue; ctx.globalAlpha = 1 - c.t / 1.2; ctx.fillStyle = c.color; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText(c.text, c.x, c.y - c.t * 50); ctx.globalAlpha = 1; }
            this.particles.draw(ctx);
            this.end(ctx);
            if (!this.s.preview && this.hk) this.drawHack(ctx, w, h);
        }

        drawHack(ctx, w, h) {
            const g = this.hk, ui = this.ui;
            ctx.fillStyle = 'rgba(2,6,16,.82)'; ctx.fillRect(0, 0, w, h);
            ui.transform = this.s.placeHud(ctx, 0, 0, 460, 540, 'center');
            w = 460; h = 540;
            const bx = 0, by = 0;
            ctx.fillStyle = '#04120b'; roundRect(ctx, bx, by, 460, 540, 18); ctx.fill();
            ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#4ade80'; ctx.font = '900 22px "Courier New", monospace'; ctx.textAlign = 'center';
            ctx.fillText('> BREACH TERMINAL', w / 2, by + 40);
            ctx.font = '600 13px "Courier New", monospace'; ctx.fillStyle = '#86efac';
            ctx.fillText('Crack the 3-digit code (digits 1-5). ■ right spot  □ wrong spot', w / 2, by + 66, 420);
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
            ctx.restore();
        }
    }

    const DEFENSE_TROOPS = [
        { name: 'Archer', cost: 60, range: 220, damage: 14, rate: .65, color: '#fde68a', desc: 'Fast single-target arrows' },
        { name: 'Cannon', cost: 110, range: 260, damage: 35, rate: 1.7, splash: 65, color: '#fb923c', desc: 'Explosive shells hit nearby enemies' },
        { name: 'Frost', cost: 90, range: 200, damage: 8, rate: .8, slow: true, color: '#67e8f9', desc: 'Slows targets for 1.5 seconds' },
        { name: 'Ballista', cost: 145, range: 340, damage: 80, rate: 2.2, pierce: true, color: '#fcd34d', desc: 'Long-range bolts ignore armor' },
        { name: 'Tesla', cost: 160, range: 230, damage: 22, rate: 1.1, chain: 3, color: '#c4b5fd', desc: 'Lightning chains to three enemies' },
        { name: 'Venom', cost: 125, range: 240, damage: 10, rate: .9, poison: 9, color: '#a3e635', desc: 'Poison: 9 damage/sec for 3 seconds' }
    ];
    const DEFENSE_ENEMIES = [
        { name: 'Scout', cost: 90, hp: 65, speed: 95, damage: 8, color: '#a3e635', desc: 'Balanced and inexpensive' },
        { name: 'Runner', cost: 150, hp: 90, speed: 145, damage: 12, color: '#facc15', desc: 'Fast flanking runner' },
        { name: 'Brute', cost: 300, hp: 330, speed: 65, damage: 25, color: '#c084fc', desc: 'Durable siege monster' },
        { name: 'Swarm', cost: 45, hp: 32, speed: 120, damage: 4, color: '#bef264', desc: 'Cheap beetles overwhelm slow towers' },
        { name: 'Sentinel', cost: 435, hp: 550, speed: 55, armor: .3, damage: 32, color: '#cbd5e1', desc: 'Armor reduces normal hits by 30%' },
        { name: 'Wisp', cost: 240, hp: 135, speed: 175, damage: 16, color: '#f0abfc', desc: 'Very fast, fragile spirit' }
    ];
    const DEFENSE_COLORS = ['#60a5fa', '#f87171'];

    class Defense extends A.Arena {
        constructor(s) {
            super(s, 2200, 1500);
            this.title = 'Team Tower Defense';
            this.scoreGoal = false; this.goalUnit = 'base damage'; this.goalLabel = 'Team';
            this.health = [100, 100]; this.teamDamage = [0, 0];
            const ids = [...s.roster.keys()];
            if (!s.spectator && !ids.includes(s.user.id)) ids.unshift(s.user.id);
            this.teams = Object.fromEntries(ids.map((id, i) => [id, i % 2]));
            if (s.room?.state?.defense_teams) this.teams = { ...s.room.state.defense_teams };
            this.wallets = Object.fromEntries(Object.keys(this.teams).map(id => [id, 180]));
            this.myTeam = this.teams[s.user.id] ?? 0;
            this.me.x = this.myTeam ? 1690 : 510; this.me.y = 1250;
            this.cam.x = this.me.x; this.cam.y = this.me.y;
            this.paths = [0, 1].map(team => {
                const offset = team * 1100;
                return [{ x: offset + 110, y: 160 }, { x: offset + 850, y: 160 }, { x: offset + 850, y: 500 },
                    { x: offset + 250, y: 500 }, { x: offset + 250, y: 900 }, { x: offset + 850, y: 900 }, { x: offset + 850, y: 1310 }];
            });
            this.buildGrid = this.paths.map((_, team) => Uint8Array.from({ length: 280 }, (_, cell) =>
                Number(this.distanceToPath(team * 1100 + 95 + cell % 14 * 70, 85 + Math.floor(cell / 14) * 70, team) > 68)));
            this.grass = this.paths.map((_, team) => {
                const items = [];
                for (let y = 0; y < this.H; y += 100) for (let x = team * 1100; x < (team + 1) * 1100; x += 100) {
                    const seed = hashStr(`${x}:${y}`), px = x + 20 + seed % 40, py = y + 30;
                    if (this.distanceToPath(px, py, team) >= 95) items.push({ x: px, y: py, rock: seed % 7 === 0 });
                }
                return items;
            });
            this.troops = []; this.enemies = []; this.shots = []; this.nextId = 1;
            this.waveNumber = 0; this.waveTimer = 20; this.waveSpawnRemaining = 0; this.waveSpawnTimer = 0;
            // Indexed by defending lane; freeze each wave's roster before deploying it.
            this.reinforcements = [Array(DEFENSE_ENEMIES.length).fill(0), Array(DEFENSE_ENEMIES.length).fill(0)];
            this.waveArmy = this.reinforcements.map(army => [...army]);
            this.lastSeq = {}; this.answers = {}; this.pending = []; this.sequence = 0; this.retryT = 0;
            this.answerCount = 0;
            this.ui = new Ui(s); this.buildType = null; this.selected = null;
            this.shopTab = 'build'; this.previewPoint = null; this.battleSounds = 0;
            this.pointerLook = false;
            this.anim = 0; this.serial = 0; this.receivedSerial = -1; this.saveT = 0;
            this.res = new A.Resource('Your cash', DEFENSE_COLORS[this.myTeam], 180, 0, 0);
            if (s.room?.state?.defense) this.applySnapshot(s.room.state.defense);
        }

        get authority() { return Boolean(this.s.isHost || this.s.practice || this.s.preview); }
        get unlimitedTestCash() { return this.s.testing === true && !this.s.limitedTestEnergy; }
        get troopTypes() { return DEFENSE_TROOPS; }
        get enemyTypes() { return DEFENSE_ENEMIES; }
        answerCash() { return this.s.rewardAmount() * 3; }
        cashFor(id) { return Object.hasOwn(this.wallets, id) ? this.wallets[id] : 180; }
        canAfford(id, cost) { return this.unlimitedTestCash || this.cashFor(id) >= cost; }
        upgradeCost(troop) { return DEFENSE_TROOPS[troop.type].cost * troop.level; }
        sellValue(troop) {
            return this.unlimitedTestCash ? 0 : Math.floor(DEFENSE_TROOPS[troop.type].cost * (1 + troop.level * (troop.level - 1) / 2) * .75);
        }
        waveEnemyHealth(type, wave) {
            const n = Math.max(0, wave - 1);
            return DEFENSE_ENEMIES[type].hp * (1 + n * .22 + n * n * .04);
        }
        waveEnemySpeed(enemy) {
            return DEFENSE_ENEMIES[enemy.type].speed * (1 + Math.min(.5, Math.max(0, (enemy.wave || 1) - 1) * .025));
        }
        waveEnemyDamage(enemy) {
            return Math.ceil(DEFENSE_ENEMIES[enemy.type].damage * (1 + Math.floor(Math.max(0, (enemy.wave || 1) - 1) / 3) * .2));
        }
        waveSize() { return 4 + this.waveNumber + Math.max(...this.waveArmy.map(army => army.reduce((a, b) => a + b, 0))); }
        waveTypeFor(team, slot) {
            for (let type = 0; type < DEFENSE_ENEMIES.length; type++) {
                if (slot < this.waveArmy[team][type]) return type;
                slot -= this.waveArmy[team][type];
            }
            return slot < 4 + this.waveNumber ? this.waveEnemyType(slot) : null;
        }
        waveEnemyType(slot) {
            if (this.waveNumber >= 8 && slot % 5 === 0) return 4;
            if (this.waveNumber >= 6 && slot % 4 === 1) return 5;
            if (this.waveNumber >= 4 && slot % 5 === 2) return 2;
            if (this.waveNumber >= 3 && slot % 3 === 1) return 1;
            if (this.waveNumber >= 2 && slot % 4 === 3) return 3;
            return 0;
        }
        waveStatusText() {
            return this.waveSpawnRemaining > 0
                ? `WAVE ${this.waveNumber} · DEPLOYING ${this.waveSpawnRemaining}`
                : `WAVE ${this.waveNumber + 1} IN ${Math.ceil(this.waveTimer)}s`;
        }
        troopStats(type, level = 1) {
            const spec = DEFENSE_TROOPS[type];
            return { range: spec.range + (level - 1) * 35, damage: spec.damage * (1 + (level - 1) * .65),
                rate: spec.rate / (1 + (level - 1) * .2), poison: (spec.poison || 0) * (1 + (level - 1) * .65) };
        }
        teamOf(id) { return this.teams[id]; }
        get gridSize() { return 70; }
        get teamTroopLimit() { return 40; }
        troopLimitFor(id) {
            const team = this.teamOf(id);
            const members = [...this.s.roster.keys()].filter(player => this.teamOf(player) === team).length;
            return Math.floor(this.teamTroopLimit / Math.max(1, members));
        }
        get playerTroopLimit() { return this.troopLimitFor(this.s.user.id); }
        troopCount(id) { return this.troops.filter(t => t.owner === id).length; }
        teamTroopCount(team) { return this.troops.filter(t => t.team === team).length; }
        canBuild(id) { return this.troopCount(id) < this.troopLimitFor(id) && this.teamTroopCount(this.teamOf(id)) < this.teamTroopLimit; }
        gridPoint(x, y, team = this.myTeam) {
            const originX = team * 1100 + 60, originY = 50, size = this.gridSize;
            return { x: originX + (Math.floor((x - originX) / size) + .5) * size,
                y: originY + (Math.floor((y - originY) / size) + .5) * size };
        }
        pointOnPath(enemy) {
            const path = this.paths[enemy.team], a = path[enemy.segment], b = path[enemy.segment + 1] || a;
            const length = dist(a.x, a.y, b.x, b.y) || 1, t = clamp(enemy.progress / length, 0, 1);
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
        distanceToPath(x, y, team) {
            let nearest = Infinity;
            const path = this.paths[team];
            for (let i = 1; i < path.length; i++) {
                const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y;
                const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
                nearest = Math.min(nearest, dist(x, y, a.x + dx * t, a.y + dy * t));
            }
            return nearest;
        }
        validPlacement(x, y, team) {
            const snapped = this.gridPoint(x, y, team);
            return Number.isFinite(x) && Number.isFinite(y) && x === snapped.x && y === snapped.y
                && x >= team * 1100 + 95 && x <= team * 1100 + 1005 && y >= 85 && y <= 1415
                && this.distanceToPath(x, y, team) > 68
                && !this.troops.some(t => dist(t.x, t.y, x, y) < 62);
        }
        request(action, data = {}) {
            if (this.finished || this.pending.length >= 8) {
                this.s.toast(this.finished ? 'The battle has ended' : 'Waiting for the host to process your orders', '#fbbf24');
                return false;
            }
            if (action === 'build') data = { ...data, ...this.gridPoint(data.x, data.y) };
            const command = { k: 'td-order', seq: ++this.sequence, action, ...data };
            if (this.authority) this.command(command, this.s.user.id);
            else { this.pending.push(command); this.s.emit(command); }
            return true;
        }
        reject(id, message) {
            if (id === this.s.user.id) this.s.toast(message, '#fbbf24');
            else this.s.emit({ k: 'td-error', to: id, message });
        }
        command(order, id) {
            if (!this.authority || this.finished || !Object.hasOwn(this.teams, id)) return;
            if (!this.s.preview && !this.s.practice && !this.s.roster.has(id)) return;
            if (!Number.isInteger(order.seq) || order.seq !== (this.lastSeq[id] || 0) + 1) return;
            this.lastSeq[id] = order.seq;
            if (!Object.hasOwn(this.wallets, id)) this.wallets[id] = 180;
            const team = this.teamOf(id), type = order.type;
            let cost = 0, execute;
            if (order.action === 'answer') {
                if (!Number.isInteger(order.count) || order.count !== (this.answers[id] || 0) + 1) return this.reject(id, 'Answer credit was not accepted; try the next question');
                this.answers[id] = order.count;
                this.wallets[id] += this.answerCash();
                return;
            }
            if (order.action === 'build' && Number.isInteger(type) && DEFENSE_TROOPS[type]) {
                if (!this.canBuild(id)) return this.reject(id, `Tower limit reached: ${this.troopLimitFor(id)} per player, ${this.teamTroopLimit} per team`);
                if (!this.validPlacement(order.x, order.y, team)) return this.reject(id, 'Choose an empty grid cell on your own side, away from the path');
                cost = DEFENSE_TROOPS[type].cost;
                execute = () => this.troops.push({ id: this.nextId++, owner: id, team, type, x: Math.round(order.x), y: Math.round(order.y), level: 1, cd: 0 });
            } else if (order.action === 'send' && Number.isInteger(type) && DEFENSE_ENEMIES[type]) {
                cost = DEFENSE_ENEMIES[type].cost;
                execute = () => { this.reinforcements[1 - team][type]++; };
            } else if (order.action === 'upgrade') {
                const troop = this.troops.find(t => t.id === order.id && t.team === team);
                if (!troop || troop.level >= 3) return this.reject(id, 'Select a friendly troop below level 3');
                cost = this.upgradeCost(troop);
                execute = () => { troop.level++; };
            } else if (order.action === 'sell') {
                const troop = this.troops.find(t => t.id === order.id && t.owner === id && t.team === team);
                if (!troop) return this.reject(id, 'You can only sell towers you own');
                const refund = this.sellValue(troop);
                this.troops = this.troops.filter(t => t !== troop);
                this.wallets[id] += refund;
                if (this.selected === troop.id) this.selected = null;
                this.s.sfx('coin', 80);
                return;
            } else return this.reject(id, 'Unknown defense order');
            if (!this.canAfford(id, cost)) return this.reject(id, 'Not enough cash - answer a flashcard to earn your own');
            if (!this.unlimitedTestCash) this.wallets[id] -= cost;
            execute();
            this.s.sfx(order.action === 'send' ? 'enemySend' : order.action === 'upgrade' ? 'towerUpgrade' : 'towerBuild', 80);
        }
        recharge() {
            if (this.s.over || this.finished || this.s.question || this.s.paused || this.s.countdown > 0) return;
            if (this.pending.length >= 8) {
                this.s.toast('Waiting for the host before another flashcard can earn cash', '#fbbf24');
                return;
            }
            this.s.ask(correct => {
                if (correct) {
                    const count = Math.max(this.answerCount, this.answers[this.s.user.id] || 0) + 1;
                    if (this.request('answer', { count })) this.answerCount = count;
                }
                else if (correct === false) this.s.toast('Wrong answer - no cash earned', '#f87171');
            }, `Correct answer: +$${this.answerCash()} to your wallet`, true);
        }
        simulate(dt) {
            if (this.waveSpawnRemaining > 0) {
                this.waveSpawnTimer -= dt;
                while (this.waveSpawnRemaining > 0 && this.waveSpawnTimer <= 0) {
                    const slot = this.waveSize() - this.waveSpawnRemaining;
                    if ([0, 1].some(team => this.waveTypeFor(team, slot) !== null && this.enemies.filter(e => e.team === team && e.hp > 0).length >= 60)) {
                        this.waveSpawnTimer = .7;
                        break;
                    }
                    for (const team of [0, 1]) {
                        const type = this.waveTypeFor(team, slot);
                        if (type === null) continue;
                        const hp = this.waveEnemyHealth(type, this.waveNumber);
                        this.enemies.push({ id: this.nextId++, team, type, wave: this.waveNumber, hp,
                            segment: 0, progress: 0, slow: 0 });
                    }
                    this.waveSpawnRemaining--;
                    if (this.waveSpawnRemaining > 0) this.waveSpawnTimer += Math.min(.7, 8 / this.waveSize());
                    else { this.waveTimer = 20; this.waveSpawnTimer = 0; }
                }
            } else {
                this.waveTimer -= dt;
                if (this.waveTimer <= 0) {
                    this.waveNumber++;
                    this.waveArmy = this.reinforcements.map(army => [...army]);
                    this.waveSpawnRemaining = this.waveSize();
                    this.waveSpawnTimer = 0; this.waveTimer = 0;
                }
            }
            for (const enemy of this.enemies) {
                if (enemy.hp <= 0) continue;
                enemy.slow = Math.max(0, enemy.slow - dt);
                if (enemy.poisonT > 0) {
                    const poisoned = Math.min(dt, enemy.poisonT);
                    enemy.hp -= enemy.poisonD * poisoned; enemy.poisonT -= poisoned;
                    if (enemy.hp <= 0) continue;
                }
                enemy.progress += this.waveEnemySpeed(enemy) * (enemy.slow > 0 ? .5 : 1) * dt;
                const path = this.paths[enemy.team];
                while (enemy.segment < path.length - 1) {
                    const a = path[enemy.segment], b = path[enemy.segment + 1], length = dist(a.x, a.y, b.x, b.y);
                    if (enemy.progress < length) break;
                    enemy.progress -= length; enemy.segment++;
                }
                if (enemy.segment === path.length - 1) {
                    const damage = Math.min(this.health[enemy.team], this.waveEnemyDamage(enemy));
                    this.health[enemy.team] = Math.max(0, this.health[enemy.team] - damage);
                    this.teamDamage[1 - enemy.team] += damage; enemy.hp = 0;
                    this.s.sfx('baseHit', 240);
                    if (this.health[enemy.team] === 0) { this.winner = 1 - enemy.team; this.finished = true; break; }
                }
            }
            if (!this.finished) for (const troop of this.troops) {
                troop.cd = Math.max(0, troop.cd - dt);
                if (troop.cd > 0) continue;
                const spec = DEFENSE_TROOPS[troop.type], stats = this.troopStats(troop.type, troop.level), range = stats.range;
                const target = this.enemies.find(e => e.hp > 0 && e.team === troop.team
                    && dist(troop.x, troop.y, this.pointOnPath(e).x, this.pointOnPath(e).y) <= range);
                if (!target) continue;
                const p = this.pointOnPath(target);
                troop.cd = stats.rate;
                this.shots.push({ x: troop.x, y: troop.y, tx: p.x, ty: p.y, color: spec.color, t: .16 });
                let chainLeft = (spec.chain || 1) - 1;
                for (const enemy of this.enemies) {
                    if (enemy.hp <= 0 || enemy.team !== troop.team) continue;
                    const ep = this.pointOnPath(enemy);
                    if (enemy !== target) {
                        if (spec.chain && chainLeft > 0 && dist(ep.x, ep.y, p.x, p.y) <= 130) {
                            chainLeft--; this.shots.push({ x: p.x, y: p.y, tx: ep.x, ty: ep.y, color: spec.color, t: .16 });
                        } else if (!spec.splash || dist(ep.x, ep.y, p.x, p.y) > spec.splash) continue;
                    }
                    enemy.hp -= stats.damage * (spec.pierce ? 1 : 1 - (DEFENSE_ENEMIES[enemy.type].armor || 0));
                    if (spec.slow) enemy.slow = 1.5;
                    if (spec.poison) { enemy.poisonT = 3; enemy.poisonD = stats.poison; }
                }
                this.battleSounds++; this.s.sfx(spec.splash ? 'cannon' : spec.chain ? 'zap' : 'towerShot', 160);
            }
            if (this.shots.length > 60) this.shots.splice(0, this.shots.length - 60);
            this.enemies = this.enemies.filter(e => e.hp > 0);
        }
        snapshot() {
            return { serial: ++this.serial, health: [...this.health],
                wallets: Object.fromEntries(Object.keys(this.teams).map(id => [id, this.cashFor(id)])), damage: [...this.teamDamage],
                waveNumber: this.waveNumber, waveTimer: this.waveTimer, waveSpawnRemaining: this.waveSpawnRemaining,
                waveSpawnTimer: this.waveSpawnTimer,
                reinforcements: this.reinforcements.map(army => [...army]), waveArmy: this.waveArmy.map(army => [...army]),
                teams: { ...this.teams }, lastSeq: { ...this.lastSeq }, answers: { ...this.answers }, nextId: this.nextId,
                troops: this.troops.map(t => ({ ...t })), enemies: this.enemies.map(e => ({ ...e })),
                shots: this.shots.map(shot => ({ ...shot })), battleSounds: this.battleSounds, winner: this.winner ?? null };
        }
        applySnapshot(state) {
            const pair = values => Array.isArray(values) && values.length === 2 && values.every(v => Number.isFinite(v) && v >= 0);
            const object = value => value && typeof value === 'object' && !Array.isArray(value);
            const teams = { ...(object(state?.teams) ? state.teams : {}), ...this.s.room?.state?.defense_teams };
            const legacyWallets = pair(state?.wallets) && state.wallets.every(cash => Number.isSafeInteger(cash) && cash <= 999999999);
            const validWallets = legacyWallets || (object(state?.wallets)
                && Object.entries(state.wallets).every(([id, cash]) => Object.hasOwn(teams, id)
                    && Number.isSafeInteger(cash) && cash >= 0 && cash <= 999999999)
                && Object.keys(state.teams || {}).every(id => Object.hasOwn(state.wallets, id)));
            const waveNumber = state?.waveNumber ?? 0, waveTimer = state?.waveTimer ?? 20;
            const waveSpawnRemaining = state?.waveSpawnRemaining ?? 0, waveSpawnTimer = state?.waveSpawnTimer ?? 0;
            const reinforcements = state?.reinforcements === undefined
                ? [Array(DEFENSE_ENEMIES.length).fill(0), Array(DEFENSE_ENEMIES.length).fill(0)] : state.reinforcements;
            const waveArmy = state?.waveArmy === undefined
                ? [Array(DEFENSE_ENEMIES.length).fill(0), Array(DEFENSE_ENEMIES.length).fill(0)] : state.waveArmy;
            const validArmy = armies => Array.isArray(armies) && armies.length === 2 && armies.every(army =>
                Array.isArray(army) && army.length === DEFENSE_ENEMIES.length && army.every(n => Number.isSafeInteger(n) && n >= 0)
                && Number.isSafeInteger(army.reduce((a, b) => a + b, 10004)));
            if (!state || !Number.isInteger(state.serial) || !pair(state.health) || state.health.some(v => v > 100)
                || !validArmy(reinforcements) || !validArmy(waveArmy)
                || waveArmy.some((army, team) => army.some((n, type) => n > reinforcements[team][type]))
                || !validWallets || !pair(state.damage) || !object(state.teams) || !object(state.lastSeq) || !object(state.answers)
                || (!this.s.spectator && ![0, 1].includes(teams[this.s.user.id])) || !Number.isInteger(state.nextId)
                || !Number.isInteger(waveNumber) || waveNumber < 0 || waveNumber > 10000
                || !Number.isFinite(waveTimer) || waveTimer < 0 || waveTimer > 32
                || !Number.isInteger(waveSpawnRemaining) || waveSpawnRemaining < 0 || waveSpawnRemaining > 4 + waveNumber + Math.max(...waveArmy.map(army => army.reduce((a, b) => a + b, 0)))
                || !Number.isFinite(waveSpawnTimer) || waveSpawnTimer < 0 || waveSpawnTimer > 1.2
                || !Array.isArray(state.troops) || state.troops.length > this.teamTroopLimit * 2
                || !Array.isArray(state.enemies) || state.enemies.length > 120
                || ![null, 0, 1].includes(state.winner)
                || state.troops.some(t => !t || !Number.isInteger(t.id) || ![0, 1].includes(t.team)
                    || typeof t.owner !== 'string' || !Object.hasOwn(teams, t.owner) || teams[t.owner] !== t.team
                    || !Number.isInteger(t.type) || !DEFENSE_TROOPS[t.type]
                    || ![1, 2, 3].includes(t.level) || !Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.cd)
                    || t.cd < 0 || t.cd > DEFENSE_TROOPS[t.type].rate
                    || t.x !== this.gridPoint(t.x, t.y, t.team).x || t.y !== this.gridPoint(t.x, t.y, t.team).y
                    || t.x < t.team * 1100 + 95 || t.x > t.team * 1100 + 1005 || t.y < 85 || t.y > 1415
                    || this.distanceToPath(t.x, t.y, t.team) <= 68)
                || state.enemies.some(e => !e || !Number.isInteger(e.id) || ![0, 1].includes(e.team) || !Number.isInteger(e.type) || !DEFENSE_ENEMIES[e.type]
                    || !Number.isInteger(e.segment) || e.segment < 0 || e.segment > 6 || !Number.isFinite(e.progress) || !Number.isFinite(e.hp) || !Number.isFinite(e.slow)
                    || e.hp <= 0 || e.hp > this.waveEnemyHealth(e.type, Number.isInteger(e.wave) ? e.wave : 1)
                    || (e.wave !== undefined && (!Number.isInteger(e.wave) || e.wave < 1 || e.wave > Math.max(1, waveNumber)))
                    || e.progress < 0 || e.progress > 740 || e.slow < 0 || e.slow > 1.5
                    || (e.poisonT !== undefined && (!Number.isFinite(e.poisonT) || e.poisonT < 0 || e.poisonT > 3))
                    || (e.poisonD !== undefined && (!Number.isFinite(e.poisonD) || e.poisonD < 0 || e.poisonD > 21)))) {
                console.error('[Tower Defense] Invalid battle snapshot');
                this.s.toast('Tower Defense received an invalid battle state. Reload or rejoin the room.', '#f87171');
                return;
            }
            const teamCounts = [0, 0], cells = new Set();
            for (const troop of state.troops) {
                const cell = `${troop.x}:${troop.y}`;
                teamCounts[troop.team]++;
                if (teamCounts[troop.team] > this.teamTroopLimit || cells.has(cell)) {
                    console.error('[Tower Defense] Invalid tower ownership limits or occupied grid cells');
                    this.s.toast('Tower Defense received invalid tower placements. Reload or rejoin the room.', '#f87171');
                    return;
                }
                cells.add(cell);
            }
            if (state.serial <= this.receivedSerial) return;
            if (!this.authority && this.receivedSerial >= 0) {
                if (state.health.some((v, i) => v < this.health[i])) this.s.sfx('baseHit', 240);
                else if (Number.isInteger(state.battleSounds) && state.battleSounds > this.battleSounds) this.s.sfx('towerShot', 160);
                if (state.troops.length > this.troops.length) this.s.sfx('towerBuild', 150);
                else if (state.troops.some(t => t.level > (this.troops.find(old => old.id === t.id)?.level || t.level))) this.s.sfx('towerUpgrade', 150);
            }
            this.battleSounds = state.battleSounds || 0;
            this.receivedSerial = state.serial; this.serial = state.serial;
            this.health = [...state.health]; this.teamDamage = [...state.damage];
            this.wallets = Object.fromEntries(Object.keys(teams).map(id => {
                if (!Object.hasOwn(state.teams, id)) return [id, this.cashFor(id)];
                if (!legacyWallets) return [id, state.wallets[id]];
                // Preserve each old team's remaining cash when resuming a shared-wallet battle.
                const members = Object.keys(state.teams).filter(player => state.teams[player] === teams[id]).sort();
                const total = Math.floor(state.wallets[teams[id]]);
                return [id, Math.floor(total / members.length) + (members.indexOf(id) < total % members.length ? 1 : 0)];
            }));
            this.waveNumber = waveNumber; this.waveTimer = waveTimer;
            this.waveSpawnRemaining = waveSpawnRemaining; this.waveSpawnTimer = waveSpawnTimer;
            this.reinforcements = reinforcements.map(army => [...army]); this.waveArmy = waveArmy.map(army => [...army]);
            this.teams = teams; this.lastSeq = { ...state.lastSeq }; this.answers = { ...state.answers };
            this.nextId = state.nextId; this.troops = state.troops.map(t => ({ ...t })); this.enemies = state.enemies.map(e => ({ wave: 1, ...e }));
            this.shots = (state.shots || []).map(shot => ({ ...shot })); this.winner = state.winner;
            this.finished = state.winner === 0 || state.winner === 1;
            this.myTeam = this.teams[this.s.user.id] ?? this.myTeam;
            this.sequence = Math.max(this.sequence, this.lastSeq[this.s.user.id] || 0);
            this.pending = this.pending.filter(p => p.seq > (this.lastSeq[this.s.user.id] || 0));
            this.res.value = this.cashFor(this.s.user.id);
            if (!this.s.spectator) this.s.score = this.teamValue(this.myTeam);
            this.s.setGoal(this.s.score);
        }
        onEvent(event, from) {
            if (event.k === 'td-order') this.command(event, from.id);
            else if (event.k === 'td-error' && from.id === this.s.room?.host_id && event.to === this.s.user.id) this.s.toast(event.message, '#fbbf24');
        }
        onState(ex, from) {
            if (!this.authority && from.id === this.s.room?.host_id && ex.td) this.applySnapshot(ex.td);
        }
        onRoom(room) {
            const state = room.state?.defense;
            if (state && state.serial > this.serial) this.applySnapshot(state);
            if (room.state?.defense_teams) {
                this.teams = { ...room.state.defense_teams };
                for (const id of Object.keys(this.teams)) if (!Object.hasOwn(this.wallets, id)) this.wallets[id] = 180;
                this.myTeam = this.teams[this.s.user.id] ?? 0;
            }
        }
        net() {
            const net = super.net();
            net.ex = { team: this.myTeam, ...(this.authority ? { td: this.snapshot() } : {}) };
            return net;
        }
        persist() {
            if (!this.s.isHost || this.s.practice || this.s.preview || !this.s.api?.saveDefenseState) return;
            const snapshot = this.snapshot();
            const save = () => this.s.api.saveDefenseState(this.s.code, snapshot);
            this.persistPromise = (this.persistPromise || Promise.resolve()).then(save, save);
            this.persistPromise.catch(error => {
                console.error('[Tower Defense] Could not save battle:', error);
                this.s.toast('Could not save Tower Defense. Check your connection.', '#f87171');
            });
        }
        updateSpectator(dt) {
            this.shots = this.shots.filter(shot => (shot.t -= dt) > 0);
            if (!this.authority || this.finished) return;
            this.simulate(dt);
            this.saveT += dt;
            if (this.saveT >= 5 || this.finished) { this.saveT = 0; this.persist(); }
        }
        update(dt) {
            if (this.finished) return;
            this.step(dt);
            this.shots = this.shots.filter(shot => (shot.t -= dt) > 0);
            const rects = this.ui.rects.length ? this.ui.rects : this.ui.prev;
            const action = this.ui.hit(rects);
            const overHud = rects.some(r => this.ui.inside({ ...r, on: true }));
            const pointer = this.mouseWorld();
            if (action?.startsWith('build:')) { this.buildType = Number(action.split(':')[1]); this.selected = null; }
            else if (this.s.pressed('Escape') || action === 'cancel') { this.selected = null; this.buildType = null; }
            else if (action === 'shop-build' || action === 'shop-send') { this.shopTab = action === 'shop-build' ? 'build' : 'send'; this.buildType = null; }
            else if (action?.startsWith('send:')) this.request('send', { type: Number(action.split(':')[1]) });
            else if (action === 'upgrade') this.request('upgrade', { id: this.selected });
            else if (action === 'sell') { if (this.request('sell', { id: this.selected })) this.selected = null; }
            else if (action === 'close-tower') this.selected = null;
            else if (action === 'earn' || this.s.pressed('KeyE')) this.recharge();
            else if (!action && this.s.mouse.pressed && !overHud) {
                const p = this.mouseWorld(), troop = this.troops.find(t => {
                    const cell = this.gridPoint(p.x, p.y, t.team);
                    return t.x === cell.x && t.y === cell.y;
                });
                if (troop) {
                    if (troop.team === this.myTeam) { this.selected = troop.id; this.buildType = null; }
                    else this.s.toast('Enemy troops cannot be upgraded', '#fbbf24');
                } else if (this.selected !== null) this.selected = null;
                else if (this.buildType !== null) {
                    const snapped = this.gridPoint(p.x, p.y), type = DEFENSE_TROOPS[this.buildType];
                    if (!this.canBuild(this.s.user.id)) this.s.toast('Your tower allowance or the team cap has been reached', '#fbbf24');
                    else if (!this.canAfford(this.s.user.id, type.cost)) this.s.toast('Not enough cash - answer a flashcard', '#fbbf24');
                    else if (!this.validPlacement(snapped.x, snapped.y, this.myTeam)) this.s.toast('Choose an empty grid cell on your side, away from the path', '#fbbf24');
                    else if (this.request('build', { type: this.buildType, ...snapped })) this.buildType = null;
                }
            }
            if (this.selected !== null && !this.troops.some(t => t.id === this.selected)) this.selected = null;
            this.previewPoint = this.buildType !== null && this.s.mouse.active && !overHud && !this.s.question && this.selected === null
                ? this.gridPoint(pointer.x, pointer.y) : null;
            if (this.authority) {
                this.simulate(dt);
                this.saveT += dt;
                if (this.saveT >= 5 || this.finished) { this.saveT = 0; this.persist(); }
            } else if (this.pending.length) {
                this.retryT -= dt;
                if (this.retryT <= 0) { this.retryT = .6; for (const order of this.pending) this.s.emit(order); }
            }
            this.res.value = this.cashFor(this.s.user.id);
            const value = this.teamValue(this.myTeam);
            this.s.score = value; this.s.setGoal(value);
        }
        teamValue(team) { return Math.min(100, Math.max(0, Math.floor(this.teamDamage[team]))); }
        standingValues(id) { const value = this.teamValue(this.teamOf(id) ?? this.myTeam); return { s: value, g: value }; }
        rankMetric(row) { return this.isWinner(null, row.id) ? 101 : row.g; }
        resultTitle() {
            return this.finished && [0, 1].includes(this.winner) ? `${this.winner ? 'Red' : 'Blue'} team wins!` : 'Battle ended';
        }
        isWinner(rows, id) { return this.finished && [0, 1].includes(this.winner) && this.winner === this.teamOf(id); }
        goalText() { return `${this.myTeam ? 'Red' : 'Blue'} team · Wave ${this.waveNumber} · Base ${this.health[this.myTeam]} HP · Towers ${this.troopCount(this.s.user.id)}/${this.playerTroopLimit} · Team ${this.teamTroopCount(this.myTeam)}/40 · ${this.unlimitedTestCash ? 'unlimited test cash' : `$${this.cashFor(this.s.user.id)} yours`}`; }
        hint() { return 'WASD walk · Choose a tower for one placement · Spend your cash to upgrade any friendly tower; only its owner can sell it for 75% · Enemy purchases add +1 every wave starting next wave · Kills give no cash · Q/E answer for your own cash'; }
        touchHint() { return 'Joystick to walk · Choose a tower, tap a free cell · Tap friendly towers to upgrade with your cash; sell only your own · 40 team slots divided among teammates · Answer for your own cash'; }
        touchLayout() { return { stick: true, buttons: [{ k: 'KeyE', label: 'Earn cash', cls: 'main' }] }; }
        drawTroop(ctx, troop, angle = -.6) {
            const spec = DEFENSE_TROOPS[troop.type], level = troop.level || 1;
            ctx.save(); ctx.translate(troop.x, troop.y);
            ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(3, 23, 31, 13, 0, 0, TAU); ctx.fill();
            if (troop.owner === this.s.user.id) {
                ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, 0, 33, 0, TAU); ctx.stroke();
            }
            ctx.fillStyle = '#1e293b'; roundRect(ctx, -27, -24, 54, 50, 9); ctx.fill();
            ctx.fillStyle = level === 3 ? '#d4a850' : level === 2 ? '#94a3b8' : '#64748b';
            roundRect(ctx, -25, -25, 50, 45, 7); ctx.fill();
            ctx.fillStyle = '#334155'; roundRect(ctx, -19, -20, 38, 34, 5); ctx.fill();
            ctx.strokeStyle = spec.color; ctx.lineWidth = level === 3 ? 3 : 2;
            roundRect(ctx, -19, -20, 38, 34, 5); ctx.stroke();
            if (level >= 2) {
                ctx.fillStyle = level === 3 ? '#fde68a' : '#e2e8f0';
                for (const side of [-1, 1]) {
                    ctx.fillRect(side * 22 - 3, -21, 6, 11);
                    ctx.fillRect(side * 22 - 3, 4, 6, 11);
                }
            }
            ctx.fillStyle = DEFENSE_COLORS[troop.team]; ctx.fillRect(-22, 17, 44, 6);
            for (let i = 0; i < level; i++) { ctx.fillStyle = '#fff'; ctx.fillRect(-13 + i * 10, 18, 5, 3); }
            ctx.rotate(angle);
            ctx.scale(1 + (level - 1) * .09, 1 + (level - 1) * .06);
            if (level === 3) {
                ctx.fillStyle = spec.color;
                for (const side of [-1, 1]) {
                    ctx.beginPath(); ctx.moveTo(-15, side * 10); ctx.lineTo(-7, side * 21); ctx.lineTo(12, side * 12); ctx.closePath(); ctx.fill();
                }
            }
            ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
            if (troop.type === 0 || troop.type === 3) {
                ctx.strokeStyle = '#92400e'; ctx.lineWidth = troop.type === 3 ? 6 : 4;
                ctx.beginPath(); ctx.moveTo(8, -22); ctx.quadraticCurveTo(-7, 0, 8, 22); ctx.stroke();
                ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(8, -22); ctx.lineTo(-6, 0); ctx.lineTo(8, 22); ctx.stroke();
                ctx.fillStyle = '#a16207'; ctx.fillRect(-12, -4, 34, 8);
                ctx.fillStyle = spec.color; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(19, -5); ctx.lineTo(19, 5); ctx.fill();
                if (troop.type === 3) { ctx.fillStyle = '#64748b'; ctx.fillRect(-19, -17, 8, 34); }
            } else if (troop.type === 1) {
                ctx.fillStyle = '#1e293b'; roundRect(ctx, -8, -11, 39, 22, 4); ctx.fill();
                ctx.fillStyle = '#94a3b8'; ctx.fillRect(19, -13, 7, 26);
                ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.ellipse(31, 0, 5, 10, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#fb923c'; ctx.fillRect(-8, -7, 8, 14);
            } else if (troop.type === 2) {
                ctx.fillStyle = '#67e8f9'; ctx.beginPath();
                ctx.moveTo(26, 0); ctx.lineTo(3, -16); ctx.lineTo(-10, 0); ctx.lineTo(3, 16); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(21, 0); ctx.moveTo(3, -12); ctx.lineTo(3, 12); ctx.stroke();
            } else if (troop.type === 4) {
                ctx.fillStyle = '#6d28d9'; ctx.fillRect(-6, -8, 27, 16);
                ctx.strokeStyle = '#c4b5fd'; ctx.lineWidth = 3;
                for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(i * 6, 0, 4, 12, 0, 0, TAU); ctx.stroke(); }
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(24, 0, 5 + Math.sin(this.anim * 6), 0, TAU); ctx.fill();
            } else {
                ctx.fillStyle = '#365314'; roundRect(ctx, -14, -12, 29, 24, 7); ctx.fill();
                ctx.fillStyle = '#a3e635'; ctx.beginPath(); ctx.arc(-4, 0, 9, 0, TAU); ctx.fill();
                ctx.fillStyle = '#64748b'; ctx.fillRect(8, -5, 22, 10);
                ctx.fillStyle = '#d9f99d'; ctx.fillRect(25, -7, 5, 14);
            }
            ctx.restore();
        }
        drawEnemy(ctx, enemy, x, y) {
            const spec = DEFENSE_ENEMIES[enemy.type], big = enemy.type === 2 || enemy.type === 4, r = big ? 22 : enemy.type === 3 ? 10 : 14;
            const path = this.paths[enemy.team], a = path[enemy.segment], b = path[enemy.segment + 1] || a;
            ctx.save(); ctx.translate(x, y);
            ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, r * .8, r + 4, r * .45, 0, 0, TAU); ctx.fill();
            ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
            if (enemy.type === 5) {
                ctx.fillStyle = 'rgba(240,171,252,.22)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill();
                ctx.fillStyle = spec.color; ctx.beginPath(); ctx.moveTo(-30, Math.sin(this.anim * 10) * 8);
                ctx.quadraticCurveTo(-10, -20, 12, -9); ctx.quadraticCurveTo(28, 0, 12, 9); ctx.quadraticCurveTo(-10, 20, -30, 0); ctx.fill();
            } else {
                ctx.strokeStyle = enemy.type === 4 ? '#475569' : '#422006'; ctx.lineWidth = big ? 6 : 3; ctx.beginPath();
                for (let i = -1; i <= 1; i++) for (const side of [-1, 1]) {
                    const sway = Math.sin(this.anim * 14 + i + side) * 4;
                    ctx.moveTo(i * r * .5, side * r * .5); ctx.lineTo(i * r * .5 - 7 + sway, side * (r + 6));
                }
                ctx.stroke(); ctx.fillStyle = spec.color; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * .8, 0, 0, TAU); ctx.fill();
                if (enemy.type === 4) {
                    ctx.fillStyle = '#64748b'; for (let i = -1; i <= 1; i++) roundRect(ctx, i * 10 - 6, -18, 11, 36, 3), ctx.fill();
                } else if (enemy.type === 2) {
                    ctx.fillStyle = '#7e22ce'; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(-8, -r - 9); ctx.lineTo(12, -r + 4); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(-8, r + 9); ctx.lineTo(12, r - 4); ctx.fill();
                } else {
                    ctx.strokeStyle = '#365314'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r * .6, 0); ctx.stroke();
                }
            }
            ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(r * .65, -4, 3, 0, TAU); ctx.arc(r * .65, 4, 3, 0, TAU); ctx.fill();
            ctx.strokeStyle = DEFENSE_COLORS[1 - enemy.team]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 6, -.5, .5); ctx.stroke();
            if (enemy.slow > 0 || enemy.poisonT > 0) { ctx.strokeStyle = enemy.poisonT > 0 ? '#a3e635' : '#67e8f9'; ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, TAU); ctx.stroke(); }
            ctx.restore();
        }
        draw(ctx, w, h) {
            ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h, 1100);
            const rects = this.ui.rects.length ? this.ui.rects : this.ui.prev;
            const overHud = rects.some(r => this.ui.inside({ ...r, on: true }));
            const pointer = this.mouseWorld();
            this.previewPoint = this.buildType !== null && this.s.mouse.active && !overHud && !this.s.question && this.selected === null
                ? this.gridPoint(pointer.x, pointer.y) : null;
            for (const team of [0, 1]) {
                const color = DEFENSE_COLORS[team], path = this.paths[team];
                if (!this.seenRect(team * 1100, 0, 1100, this.H, 120)) continue;
                ctx.fillStyle = team ? '#3f4934' : '#354c43'; ctx.fillRect(team * 1100, 0, 1100, this.H);
                for (const grass of this.grass[team]) {
                    const px = grass.x, py = grass.y;
                    if (!this.seen(px, py, 50)) continue;
                    ctx.strokeStyle = '#6b8e4e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - 7, py + 8); ctx.lineTo(px - 11, py - 2);
                    ctx.moveTo(px, py + 9); ctx.lineTo(px + 3, py - 6); ctx.moveTo(px + 7, py + 8); ctx.lineTo(px + 13, py); ctx.stroke();
                    if (grass.rock) { ctx.fillStyle = '#64746b'; ctx.beginPath(); ctx.ellipse(px + 30, py + 30, 12, 8, -.4, 0, TAU); ctx.fill(); }
                }
                ctx.strokeStyle = '#293c35'; ctx.lineWidth = 98; ctx.lineJoin = 'round';
                ctx.beginPath(); path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
                ctx.strokeStyle = '#988366'; ctx.lineWidth = 82; ctx.stroke();
                ctx.strokeStyle = '#bba581'; ctx.lineWidth = 62; ctx.stroke();
                ctx.strokeStyle = 'rgba(70,53,33,.22)'; ctx.lineWidth = 3; ctx.setLineDash([3, 28]); ctx.stroke(); ctx.setLineDash([]);
                for (let row = Math.max(0, Math.ceil((this.y0 - this.gridSize - 85) / this.gridSize)); row < Math.min(20, Math.floor((this.y1 + this.gridSize - 85) / this.gridSize) + 1); row++) for (let col = Math.max(0, Math.ceil((this.x0 - this.gridSize - team * 1100 - 95) / this.gridSize)); col < Math.min(14, Math.floor((this.x1 + this.gridSize - team * 1100 - 95) / this.gridSize) + 1); col++) {
                    const x = team * 1100 + 95 + col * this.gridSize, y = 85 + row * this.gridSize;
                    if (!this.seen(x, y, this.gridSize) || !this.buildGrid[team][row * 14 + col]) continue;
                    ctx.strokeStyle = team === this.myTeam ? 'rgba(226,232,240,.14)' : 'rgba(248,113,113,.07)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x - this.gridSize / 2, y - this.gridSize / 2, this.gridSize, this.gridSize);
                }
                for (let i = 1; i < path.length; i++) {
                    const a = path[i - 1], b = path[i], angle = Math.atan2(b.y - a.y, b.x - a.x);
                    if (!this.seen((a.x + b.x) / 2, (a.y + b.y) / 2, 24)) continue;
                    ctx.save(); ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.rotate(angle);
                    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.fill(); ctx.restore();
                }
                const start = path[0], base = path.at(-1);
                if (this.seen(start.x, start.y, 100)) {
                    this.ring(ctx, start.x, start.y, 44, color, 5);
                    ctx.fillStyle = '#334155'; ctx.fillRect(start.x - 44, start.y - 36, 16, 72); ctx.fillRect(start.x + 28, start.y - 36, 16, 72);
                    ctx.fillStyle = color; ctx.fillRect(start.x - 44, start.y - 40, 88, 12);
                    if (!this.s.preview) {
                        ctx.fillStyle = '#fff'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center';
                        ctx.fillText('ENTRY', start.x, start.y - 55);
                    }
                }
                if (this.seen(base.x, base.y, 120)) {
                    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(base.x, base.y + 38, 85, 28, 0, 0, TAU); ctx.fill();
                    ctx.fillStyle = '#94a3b8'; roundRect(ctx, base.x - 66, base.y - 44, 132, 90, 6); ctx.fill();
                    ctx.fillStyle = '#475569'; ctx.fillRect(base.x - 57, base.y - 29, 114, 65);
                    for (const side of [-1, 1]) {
                        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(base.x + side * 59 - 14, base.y - 66, 28, 98);
                        ctx.fillStyle = color; ctx.fillRect(base.x + side * 59 - 14, base.y - 73, 28, 20);
                        ctx.fillStyle = '#334155'; ctx.fillRect(base.x + side * 59 - 3, base.y - 44, 6, 18);
                    }
                    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(base.x, base.y - 68); ctx.lineTo(base.x + 39, base.y - 43); ctx.lineTo(base.x - 39, base.y - 43); ctx.fill();
                    ctx.fillStyle = '#0f172a'; roundRect(ctx, base.x - 20, base.y - 15, 40, 50, 15); ctx.fill();
                    ctx.fillStyle = '#fff'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center';
                    ctx.fillText(`${team ? 'RED' : 'BLUE'} ${this.health[team]} HP`, base.x, base.y + 65);
                }
            }
            ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 4; ctx.setLineDash([20, 15]);
            ctx.beginPath(); ctx.moveTo(1100, 0); ctx.lineTo(1100, this.H); ctx.stroke(); ctx.setLineDash([]);
            for (const troop of this.troops) {
                const spec = DEFENSE_TROOPS[troop.type];
                if (!this.seen(troop.x, troop.y, troop.id === this.selected ? spec.range + (troop.level - 1) * 35 : 40)) continue;
                if (troop.id === this.selected) this.ring(ctx, troop.x, troop.y, spec.range + (troop.level - 1) * 35, spec.color + '88', 2);
                const shot = this.shots.find(p => p.x === troop.x && p.y === troop.y);
                this.drawTroop(ctx, troop, shot ? Math.atan2(shot.ty - troop.y, shot.tx - troop.x) : -.6);
            }
            for (const enemy of this.enemies) {
                const p = this.pointOnPath(enemy);
                if (!this.seen(p.x, p.y)) continue;
                this.drawEnemy(ctx, enemy, p.x, p.y);
                ctx.fillStyle = '#0f172a'; ctx.fillRect(p.x - 20, p.y - 32, 40, 5);
                ctx.fillStyle = '#4ade80'; ctx.fillRect(p.x - 20, p.y - 32, 40 * clamp(enemy.hp / this.waveEnemyHealth(enemy.type, enemy.wave || 1), 0, 1), 5);
            }
            if (this.previewPoint && !this.s.preview) {
                const p = this.previewPoint, spec = DEFENSE_TROOPS[this.buildType];
                const atLimit = !this.canBuild(this.s.user.id);
                const valid = this.validPlacement(p.x, p.y, this.myTeam) && this.canAfford(this.s.user.id, spec.cost) && !atLimit;
                const color = valid ? '#86efac' : '#f87171';
                ctx.fillStyle = valid ? 'rgba(134,239,172,.25)' : 'rgba(248,113,113,.25)';
                ctx.fillRect(p.x - 35, p.y - 35, this.gridSize, this.gridSize);
                ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(p.x - 35, p.y - 35, this.gridSize, this.gridSize);
                ctx.fillStyle = valid ? 'rgba(134,239,172,.08)' : 'rgba(248,113,113,.08)'; ctx.beginPath(); ctx.arc(p.x, p.y, spec.range, 0, TAU); ctx.fill();
                this.ring(ctx, p.x, p.y, spec.range, color, 2);
                ctx.globalAlpha = .65; this.drawTroop(ctx, { x: p.x, y: p.y, type: this.buildType, team: this.myTeam, level: 1 }); ctx.globalAlpha = 1;
                ctx.fillStyle = color; ctx.font = '700 14px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(`${spec.name} $${spec.cost} · ${atLimit ? 'Tower limit reached' : valid ? `Range ${spec.range}` : 'Cannot place here'}`, p.x, p.y + 51);
            }
            for (const shot of this.shots) {
                if (!this.seenRect(Math.min(shot.x, shot.tx), Math.min(shot.y, shot.ty), Math.abs(shot.tx - shot.x), Math.abs(shot.ty - shot.y), 8)) continue;
                ctx.strokeStyle = shot.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(shot.x, shot.y); ctx.lineTo(shot.tx, shot.ty); ctx.stroke();
            }
            this.drawPlayers(ctx);
            this.end(ctx);
            this.ui.begin();
            if (this.s.preview || this.s.spectator) return;
            const selected = this.troops.find(t => t.id === this.selected);
            const compactPanels = (this.s.hudBounds?.().w ?? w) < 644 * Math.max(1, 1 / (this.s.scale || 1));
            if (!selected || !compactPanels) {
                this.ui.transform = this.s.placeHud(ctx, 0, 0, 320, 324, 'top-right');
                ctx.fillStyle = 'rgba(15,23,42,.95)'; roundRect(ctx, 0, 0, 320, 324, 12); ctx.fill();
                this.ui.addRect({ id: 'shop-panel', x: 0, y: 0, w: 320, h: 324, on: false });
                ctx.fillStyle = '#fff'; ctx.font = '800 14px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(`BLUE ${this.health[0]} HP  |  RED ${this.health[1]} HP`, 160, 20);
                ctx.fillStyle = DEFENSE_COLORS[this.myTeam]; ctx.fillText(`YOUR CASH: ${this.unlimitedTestCash ? 'UNLIMITED (TEST)' : `$${this.cashFor(this.s.user.id)}`}`, 160, 42);
                ctx.fillStyle = '#fbbf24'; ctx.font = '800 12px system-ui'; ctx.fillText(this.waveStatusText(), 160, 64);
                this.ui.button(ctx, 'shop-build', 8, 72, 148, 26, 'Build towers', true, this.shopTab === 'build' ? '#2563eb' : '#334155');
                this.ui.button(ctx, 'shop-send', 164, 72, 148, 26, 'Buy wave enemies', true, this.shopTab === 'send' ? '#be123c' : '#334155');
                const catalog = this.shopTab === 'build' ? DEFENSE_TROOPS : DEFENSE_ENEMIES;
                catalog.forEach((type, i) => {
                    const build = this.shopTab === 'build';
                    this.ui.button(ctx, `${build ? 'build' : 'send'}:${i}`, 8 + (i % 3) * 103, 106 + Math.floor(i / 3) * 50, 98, 44, type.name,
                        this.canAfford(this.s.user.id, type.cost) && (!build || this.canBuild(this.s.user.id)),
                        build ? i === this.buildType ? '#2563eb' : '#475569' : '#9f1239',
                        build ? `$${type.cost}` : `$${type.cost} · ${this.reinforcements[1 - this.myTeam][i]}/wave`);
                });
                const hover = this.ui.rects.find(r => this.ui.inside({ ...r, on: true }) && /^(build|send):/.test(r.id));
                const enemyInfo = hover?.id.startsWith('send:');
                const typeIndex = hover ? Number(hover.id.split(':')[1]) : this.buildType;
                const info = typeIndex === null ? null : enemyInfo ? DEFENSE_ENEMIES[typeIndex] : DEFENSE_TROOPS[typeIndex];
                ctx.textAlign = 'left'; ctx.fillStyle = '#cbd5e1'; ctx.font = '700 12px system-ui';
                ctx.fillText(`Your towers ${this.troopCount(this.s.user.id)}/${this.playerTroopLimit} · Team ${this.teamTroopCount(this.myTeam)}/40`, 12, 218);
                ctx.font = '600 11px system-ui';
                if (info) {
                    ctx.fillStyle = info.color; ctx.fillText(`${info.name} · ${info.desc}`, 12, 238);
                    ctx.fillStyle = '#cbd5e1';
                    if (enemyInfo) ctx.fillText(`+1 each wave from next wave · HP ${info.hp}`, 12, 254);
                    else ctx.fillText(`Damage ${info.damage} · Range ${info.range} · Fires ${info.rate.toFixed(2)}s`, 12, 254);
                } else {
                    ctx.fillText(this.shopTab === 'send' ? 'Each purchase adds +1 enemy every wave.' : 'Choose a tower for one placement, or select a built tower.', 12, 238);
                    ctx.fillText(this.shopTab === 'send' ? 'Starts next wave. Cash comes from questions, not kills.' : '40 team slots divided equally among active teammates.', 12, 254);
                }
                this.ui.button(ctx, 'earn', 8, 268, 148, 48, 'Answer for cash', !this.s.question, '#15803d', `+$${this.answerCash()} to you`);
                this.ui.button(ctx, 'cancel', 164, 268, 148, 48, 'Cancel placement', this.buildType !== null, '#475569', this.buildType === null ? 'Nothing selected' : 'Escape also cancels');
                ctx.restore();
            }
            if (selected) {
                const spec = DEFENSE_TROOPS[selected.type], stats = this.troopStats(selected.type, selected.level);
                this.ui.transform = this.s.placeHud(ctx, 0, 0, 304, 252, 'top-left');
                this.ui.addRect({ id: 'tower-panel', x: 0, y: 0, w: 304, h: 252, on: false });
                ctx.fillStyle = 'rgba(15,23,42,.96)'; roundRect(ctx, 0, 0, 304, 252, 12); ctx.fill();
                ctx.textAlign = 'left'; ctx.fillStyle = spec.color; ctx.font = '800 15px system-ui';
                ctx.fillText(`${spec.name} · Level ${selected.level}`, 12, 26);
                this.ui.button(ctx, 'close-tower', 264, 8, 32, 26, 'X', true, '#334155');
                const owner = this.s.roster.get(selected.owner);
                ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = '600 11px system-ui';
                ctx.fillText(selected.owner === this.s.user.id ? 'Your tower' : `Teammate: ${(owner?.name || owner?.nickname || 'Player').slice(0, 20)}`, 12, 48);
                ctx.fillStyle = '#e2e8f0'; ctx.font = '700 12px system-ui';
                ctx.fillText(`Damage ${stats.damage.toFixed(1)} · Range ${stats.range}`, 12, 74);
                ctx.fillText(`Fires every ${stats.rate.toFixed(2)}s`, 12, 94);
                ctx.font = '600 11px system-ui'; ctx.fillStyle = '#cbd5e1'; ctx.fillText(spec.desc, 12, 118);
                if (selected.level < 3) {
                    const next = this.troopStats(selected.type, selected.level + 1);
                    ctx.fillText(`Upgrade: +${(next.damage - stats.damage).toFixed(1)} dmg · +35 range`, 12, 140);
                    ctx.fillText(`Next firing interval: ${next.rate.toFixed(2)}s`, 12, 158);
                } else ctx.fillText('Fully upgraded', 12, 142);
                this.ui.button(ctx, 'upgrade', 8, 172, 140, 48, selected.level < 3 ? 'Upgrade' : 'Max level',
                    selected.level < 3 && this.canAfford(this.s.user.id, this.upgradeCost(selected)), '#7c3aed',
                    selected.level < 3 ? `$${this.upgradeCost(selected)}` : 'Level 3');
                this.ui.button(ctx, 'sell', 156, 172, 140, 48, 'Sell tower', selected.owner === this.s.user.id, '#b45309', `+$${this.sellValue(selected)} to you`);
                ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = '600 10px system-ui';
                ctx.fillText(compactPanels ? 'Close (X) or Escape to return to the shop' : 'Owner-only selling · 75% of build + upgrade costs', 12, 240);
                ctx.restore();
            }
            const mw = 160, mh = mw * this.H / this.W;
            this.ui.transform = this.s.placeHud(ctx, 0, 0, mw, mh, 'bottom-right');
            this.ui.addRect({ id: 'minimap', x: 0, y: 0, w: mw, h: mh, on: false });
            ctx.fillStyle = '#1c3042'; ctx.fillRect(0, 0, mw / 2, mh);
            ctx.fillStyle = '#30252c'; ctx.fillRect(mw / 2, 0, mw / 2, mh);
            for (const team of [0, 1]) {
                ctx.strokeStyle = DEFENSE_COLORS[team]; ctx.lineWidth = 2; ctx.beginPath();
                this.paths[team].forEach((p, i) => i ? ctx.lineTo(p.x / this.W * mw, p.y / this.H * mh) : ctx.moveTo(p.x / this.W * mw, p.y / this.H * mh)); ctx.stroke();
            }
            ctx.fillStyle = '#fff'; ctx.fillRect(this.me.x / this.W * mw - 2, this.me.y / this.H * mh - 2, 4, 4); ctx.restore();
        }
    }

    Object.assign(A.games, { crypto: Crypto, frenzy: Fishing, fishing: Fishing, hack: Hack, defense: Defense });
})(window);
