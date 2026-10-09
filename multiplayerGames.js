(function (window) {
    'use strict';

    const A = window.StudBudArcade;
    const { TAU, clamp, lerp, dist, overlap, mulberry32, hashStr, moveBody, pushCircleOutOfRect, roundRect, nameTag } = A.util;

    function drawRunner(ctx, x, y, w, h, who, face, time, state, alpha = 1) {
        A.util.drawFigureSide(ctx, who, x, y, w, h, face, time, state === 1, alpha);
    }
    A.util.drawRunner = drawRunner;

    function skyBackdrop(ctx, w, h, camX, top, bottom, accent) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(w * 0.78, h * 0.28, 70, 0, TAU);
        ctx.fill();
        [[0.15, '#1b2342', 330, 150], [0.3, '#161c36', 260, 110], [0.5, '#10152b', 190, 80]].forEach(([f, color, base, span], layer) => {
            ctx.fillStyle = color;
            const size = 150 + layer * 20;
            const start = Math.floor((camX * f) / size) - 1;
            for (let i = start; i < start + w / size + 3; i++) {
                const hh = hashStr(`b${layer}:${i}`);
                const bw = size - 14 + (hh % 30);
                const bh = base + (hh % span);
                const bx = Math.round(i * size - camX * f);
                ctx.fillRect(bx, h - bh, bw, bh);
                ctx.fillStyle = 'rgba(250,204,21,.22)';
                for (let row = 0, wy = h - bh + 14; wy < h - 20; wy += 26, row++) {
                    for (let col = 0, wx = bx + 10; wx < bx + bw - 12; wx += 22, col++) {
                        if ((hh >> ((row * 5 + col * 3) % 20) & 7) < 2) ctx.fillRect(wx, wy, 8, 11);
                    }
                }
                ctx.fillStyle = color;
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Rooftop Rumble: vertical parkour climb through four biomes          */
    /* ------------------------------------------------------------------ */
    const SKY_BIOMES = [
        { name: 'Rooftops', top: '#1e1b4b', bottom: '#7c3aed', body: '#334155', edge: '#64748b', ledge: '#94a3b8', ledgeTop: '#e2e8f0' },
        { name: 'Cloud Gardens', top: '#0284c7', bottom: '#bae6fd', body: '#e0f2fe', edge: '#ffffff', ledge: '#f1f5f9', ledgeTop: '#ffffff' },
        { name: 'Storm Foundry', top: '#1c1917', bottom: '#9a3412', body: '#44403c', edge: '#fbbf24', ledge: '#78716c', ledgeTop: '#d6d3d1' },
        { name: 'Starlight Summit', top: '#020617', bottom: '#5b21b6', body: '#312e81', edge: '#c4b5fd', ledge: '#6d28d9', ledgeTop: '#c4b5fd' }
    ];
    const ihash = (a, b) => { let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return (n ^ (n >>> 16)) >>> 0; };
    const mixHex = (a, b, t) => {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const c = sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
        return `rgb(${c(16)},${c(8)},${c(0)})`;
    };
    const bell = (p, a, b, c, d) => clamp(Math.min((p - a) / (b - a), (d - p) / (d - c), 1), 0, 1);

    // p is climb progress scaled 0..4 (one unit per biome); everything is anchored to world cells so nothing flickers.
    function climbBackdrop(ctx, w, h, cam, camStart, p, anim) {
        const i = Math.min(3, Math.floor(p)), j = Math.min(3, i + 1);
        const t = i < 3 ? clamp((p - i - 0.4) / 0.6, 0, 1) : 0;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, mixHex(SKY_BIOMES[i].top, SKY_BIOMES[j].top, t));
        g.addColorStop(1, mixHex(SKY_BIOMES[i].bottom, SKY_BIOMES[j].bottom, t));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const down = camStart - cam.y;
        const cells = (f, size, fn) => {
            const ox = cam.x * f, oy = cam.y * f;
            const x0 = Math.floor(ox / size) - 1, y0 = Math.floor(oy / size) - 1;
            for (let gx = x0; gx < x0 + w / size + 3; gx++) for (let gy = y0; gy < y0 + h / size + 3; gy++) fn(ihash(gx, gy + (f * 1000 | 0)), gx * size - ox, gy * size - oy);
        };
        const stars = clamp((p - 1.2) / 2, 0, 1);
        if (stars > 0) {
            ctx.fillStyle = '#fff'; ctx.globalAlpha = stars * 0.9;
            cells(0.05, 150, (hh, px, py) => {
                const sz = 1 + ((hh >> 20) & 1) + ((hh & 7) === 0 ? 1 : 0);
                ctx.fillRect(px + (hh & 127), py + ((hh >> 8) & 127), sz, sz);
            });
            ctx.globalAlpha = 1;
        }
        const cA = clamp((1.3 - p) / 0.8, 0, 1);
        if (cA > 0) {
            ctx.globalAlpha = cA;
            ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(w * 0.78, h * 0.28 + down * 0.04, 70, 0, TAU); ctx.fill();
            [[0.15, '#1b2342', 330, 150], [0.3, '#161c36', 260, 110], [0.5, '#10152b', 190, 80]].forEach(([f, color, base, span], layer) => {
                const size = 150 + layer * 20, baseY = h * 0.78 + down * f;
                const start = Math.floor(cam.x * f / size) - 1;
                for (let n = start; n < start + w / size + 3; n++) {
                    const hh = ihash(n, layer);
                    const bw = size - 14 + (hh % 30), bh = base + (hh % span);
                    const bx = Math.round(n * size - cam.x * f);
                    ctx.fillStyle = color; ctx.fillRect(bx, baseY - bh, bw, bh + h);
                    ctx.fillStyle = 'rgba(250,204,21,.22)';
                    for (let row = 0, wy = baseY - bh + 14; wy < baseY - 20; wy += 26, row++) {
                        for (let col = 0, wx = bx + 10; wx < bx + bw - 12; wx += 22, col++) if (((hh >> ((row * 5 + col * 3) % 20)) & 7) < 2) ctx.fillRect(wx, wy, 8, 11);
                    }
                }
            });
            ctx.globalAlpha = 1;
        }
        const cl = bell(p, 0.5, 1.2, 1.8, 2.5);
        if (cl > 0) {
            for (const [f, size, al] of [[0.25, 520, 0.5], [0.5, 440, 0.85]]) {
                ctx.fillStyle = `rgba(255,255,255,${al * cl})`;
                cells(f, size, (hh, px, py) => {
                    if (hh % 3 === 0) return;
                    const cx = px + (hh & 255), cy = py + ((hh >> 8) & 255), r = 40 + ((hh >> 16) & 31);
                    for (const [dx, dy, k] of [[0, 0, 1], [-r, 12, 0.7], [r * 1.1, 14, 0.75]]) { ctx.beginPath(); ctx.ellipse(cx + dx, cy + dy, r * 1.7 * k, r * 0.7 * k, 0, 0, TAU); ctx.fill(); }
                });
            }
        }
        const fo = bell(p, 1.6, 2.3, 2.8, 3.4);
        if (fo > 0) {
            ctx.globalAlpha = fo * 0.6;
            cells(0.2, 300, (hh, px) => { ctx.fillStyle = '#1c1917'; ctx.fillRect(px + (hh & 127), 0, 34, h); ctx.fillStyle = '#7c2d12'; ctx.fillRect(px + (hh & 127) + 12, 0, 4, h); });
            cells(0.35, 380, (hh, px, py) => {
                if (hh % 3 === 0) return;
                const gx = px + (hh & 255), gy = py + ((hh >> 8) & 255), r = 50 + ((hh >> 16) & 63);
                ctx.save(); ctx.translate(gx, gy); ctx.rotate(anim * 0.15 * (hh & 1 ? 1 : -1));
                ctx.fillStyle = '#292524'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
                for (let k = 0; k < 10; k++) { ctx.rotate(TAU / 10); ctx.fillRect(-8, -r - 13, 16, 18); }
                ctx.fillStyle = '#44403c'; ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, TAU); ctx.fill();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        }
        const au = bell(p, 2.8, 3.4, 5, 6);
        if (au > 0) {
            ctx.globalAlpha = au * 0.8;
            ctx.fillStyle = '#6d28d9'; ctx.beginPath(); ctx.arc(w * 0.2, h * 0.3 + down * 0.02, 90, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(196,181,253,.8)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(w * 0.2, h * 0.3 + down * 0.02, 160, 28, -0.3, 0, TAU); ctx.stroke();
            const cols = ['rgba(52,211,153,.16)', 'rgba(167,139,250,.16)', 'rgba(56,189,248,.16)'];
            for (let b = 0; b < 3; b++) {
                ctx.strokeStyle = cols[b]; ctx.lineWidth = 46 - b * 10; ctx.beginPath();
                for (let x = -20; x <= w + 20; x += 40) {
                    const y = h * (0.5 + b * 0.1) + Math.sin(x * 0.004 + anim * 0.15 + b * 2) * 40 + down * 0.03;
                    if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
    }

    class Skyline extends A.BaseGame {
        constructor(s) {
            super(s);
            this.title = 'Rooftop Rumble';
            this.race = true;
            this.WIDTH = 2000; this.SUMMIT = 48000; this.biomeSeen = 0;
            this.build();
            const c = this.checkpoints[0];
            this.me = { x: c.x, y: c.y - 44, w: 26, h: 44, vx: 0, vy: 0, face: 1 };
            this.cp = c;
            this.cam = { x: 0, y: 0 };
            this.coyote = 0; this.buffer = 0; this.airJumps = 1; this.dash = 0; this.dashCd = 0;
            this.boost = 0; this.slow = 0; this.dead = 0; this.maxH = 0; this.bonus = 0; this.deaths = 0;
            this.res = new A.Resource('Energy', '#facc15', 100, 50, 2);
            this.anim = 0; this.finished = false; this.state = 0; this.carry = null;
            this.tideY = 1100; this.kick = 0; this.wallDir = 0; this.tideWarn = false;
        }

        build() {
            const r = mulberry32(this.s.seed);
            const solids = this.solids = [];
            this.spikes = []; this.saws = []; this.lasers = []; this.springs = []; this.boxes = []; this.checkpoints = [];
            this.movers = []; this.crumbles = []; this.winds = []; this.balls = []; this.blinkers = [];
            const W = this.WIDTH, SUM = this.SUMMIT;
            solids.push({ x: -240, y: -SUM - 2500, w: 240, h: SUM + 4000, wall: true });
            solids.push({ x: W, y: -SUM - 2500, w: 240, h: SUM + 4000, wall: true });
            solids.push({ x: -240, y: 0, w: W + 480, h: 1400, ground: true, bi: 0 });
            let cx = W / 2, y = 0;
            this.checkpoints.push({ x: cx - 40, y: 0, id: 0 });
            const biome = () => Math.min(3, Math.floor(-y / SUM * 4));
            const dirNow = () => cx < 380 ? 1 : cx > W - 380 ? -1 : (r() < 0.5 ? -1 : 1);
            const flip = d => cx < 380 ? 1 : cx > W - 380 ? -1 : -d;
            // Everything is fully solid, so a new platform is moved sideways until nothing sits right under it that you would bonk your head on.
            const walkable = s => !s.wall && !s.ground && !s.wallJ;
            const ledge = (dx, rise, wd0, extra) => {
                const ny = y - rise, dir0 = dx !== 0 ? Math.sign(dx) : dirNow();
                let wd = wd0, found = null;
                while (found === null) {
                    const lo = 90 + wd / 2, hi = W - 90 - wd / 2;
                    const blocked = c => (ny > -330 && c - wd / 2 < W / 2 + 150 && c + wd / 2 > W / 2 - 150) || solids.some(s => {
                        if (s.wall || s.ground) return false;
                        const sl = s.mover && !s.vert ? s.bx - s.amp : s.x, sr = s.mover && !s.vert ? s.bx + s.w + s.amp : s.x + s.w;
                        if (!(c - wd / 2 < sr + 30 && c + wd / 2 > sl - 30)) return false;
                        // never overlap anything at the same height or leave less than a body of headroom
                        if (s.y < ny + 20 && s.y + s.h > ny - 130) return true;
                        const dy = s.y - ny;
                        return !(extra && extra.jt) && walkable(s) && dy > 0 && dy <= 150;
                    });
                    for (const dir of [dir0, -dir0]) {
                        let c = clamp(cx + dx, lo, hi);
                        for (let k = 0; k < 45; k++) {
                            if (!blocked(c)) { found = c; break; }
                            const n = c + dir * 40;
                            if (n < lo || n > hi) break;
                            c = n;
                        }
                        if (found !== null) break;
                    }
                    if (found === null) {
                        if (wd <= 240) found = clamp(cx + dx, lo, hi);
                        else wd = Math.max(220, wd - 120);
                    }
                }
                cx = found; y = ny;
                const p = Object.assign({ x: cx - wd / 2, y, w: wd, h: 14, thin: true, bi: biome() }, extra);
                if (p.jt) p.oneway = true;
                if (p.y + p.h > -100 && !p.thin) p.h = Math.max(14, -100 - p.y);
                solids.push(p);
                return p;
            };
            const rest = () => {
                const p = ledge(0, 110, 520, { roof: true, thin: false, h: 60 });
                this.boxes.push({ x: cx + 120, y: y - 55, t: 0 });
                return p;
            };
            const startPad = () => {
                const p = rest();
                this.checkpoints.push({ x: p.x + 70, y, id: this.checkpoints.length, biome: biome() });
            };
            const box = (x, top, w, h, prop) => { const p = { x, y: top, w, h, prop, bi: biome() }; solids.push(p); return p; };
            const segs = {
                // ---- Ability checks: the gaps are too wide for a single jump, so you need jump + double jump + dash (and energy to match) ----
                leap: () => {
                    let d = dirNow();
                    const n = 5 + Math.floor(r() * 2);
                    for (let i = 0; i < n; i++) {
                        const p = ledge(d * (500 + r() * 40), 30 + r() * 40, 100, i === 2 ? { crumble: true, timer: 0, gone: 0 } : null);
                        if (i === 2) this.crumbles.push(p);
                        if (i === 3) this.boxes.push({ x: cx, y: p.y - 55, t: 0 });
                        d = flip(d);
                    }
                    ledge(d * 200, 105, 260);
                },
                springdash: () => {
                    let d = dirNow();
                    for (let i = 0; i < 3; i++) {
                        const a = ledge(d * 190, 100, 180);
                        this.springs.push({ x: a.x + 67, y: a.y - 16, w: 46, h: 16 });
                        d = flip(d);
                        const b = ledge(d * (430 + r() * 50), 330, 90);
                        if (i === 1) this.spikes.push({ x: b.x - 70, y: b.y - 20, w: 40, h: 20 });
                    }
                    ledge(d * 160, 105, 240);
                },
                gatekeeper: () => {
                    // wall-jump shaft with lasers, then a dash gap guarded by pendulums, then a spring finish
                    const base = ledge(dirNow() * 180, 105, 360);
                    const gx = clamp(base.x + base.w / 2, 360, W - 360), b = biome();
                    solids.push({ x: gx - 150, y: base.y - 620, w: 55, h: 510, wallJ: true, bi: b });
                    solids.push({ x: gx + 95, y: base.y - 620, w: 55, h: 510, wallJ: true, bi: b });
                    this.lasers.push({ x: gx - 95, y: base.y - 330, w: 190, h: 10, period: 3, phase: r() * 2 });
                    cx = gx; y = base.y - 620;
                    let d = cx < W / 2 ? 1 : -1;
                    for (let i = 0; i < 3; i++) {
                        const p = ledge(d * (470 + r() * 30), 40, 110);
                        this.balls.push({ px: p.x - d * 230 + 55, py: p.y - 200, len: 140, amp: 0.9, speed: 1.6 + r() * 0.4, phase: r() * 6, r: 22, x: 0, y: 0 });
                        d = flip(d);
                    }
                    const sp = ledge(d * 160, 105, 220);
                    this.springs.push({ x: sp.x + 87, y: sp.y - 16, w: 46, h: 16 });
                    ledge(0, 330, 260);
                },
                marathon: () => {
                    // one long mixed run: every platform type, tight gaps, hazards between
                    let d = dirNow();
                    const kinds = ['plain', 'ice', 'crumble', 'belt', 'plain', 'saw', 'ice', 'leap', 'crumble', 'belt', 'plain', 'saw'];
                    for (const k of kinds) {
                        const wide = k === 'leap';
                        const extra = k === 'ice' ? { ice: true } : k === 'crumble' ? { crumble: true, timer: 0, gone: 0 } : k === 'belt' ? { belt: d * -120 } : null;
                        const p = ledge(d * (wide ? 470 : 250 + r() * 70), wide ? 60 : 55 + r() * 45, wide ? 100 : 120, extra);
                        if (k === 'crumble') this.crumbles.push(p);
                        if (k === 'saw') this.saws.push({ cx: p.x + p.w / 2, cy: p.y - 120, amp: 50, speed: 1.9, phase: r() * 6, r: 20, x: 0, y: 0 });
                        d = flip(d);
                    }
                    this.boxes.push({ x: cx, y: y - 55, t: 0 });
                    ledge(0, 105, 260);
                },
                skybridge: () => {
                    // long moving-platform bridge over a wide gap with wind pushing you off
                    let d = dirNow();
                    const y0 = y;
                    for (let i = 0; i < 4; i++) {
                        const mx = clamp(cx + d * 330, 260, W - 260);
                        const m = { x: mx - 55, y: y - 105, w: 110, h: 18, bx: mx - 55, by: y - 105, amp: 150, speed: 0.9 + r() * 0.5, phase: r() * 6, dx: 0, dy: 0, mover: true, oneway: true, bi: biome() };
                        solids.push(m); this.movers.push(m);
                        y -= 105; cx = mx; d = flip(d);
                    }
                    this.winds.push({ x: 60, y: y - 100, w: W - 120, h: y0 - y + 200, fx: (r() < 0.5 ? -1 : 1) * 200 });
                    ledge(d * 200, 105, 180);
                },
                // ---- Glass platforms: you pass up through them, so stacks and tight spots are climbable ----
                ghostclimb: () => {
                    const b = biome(), dif = clamp(-y / SUM * 4, 0, 4);
                    const base = ledge(dirNow() * 200, 105, 260);
                    const x0 = clamp(base.x + base.w / 2, 360, W - 360);
                    const n = 5 + Math.floor(dif);
                    const rise = 118 + Math.round(dif * 8);
                    let d = x0 < W / 2 ? 1 : -1;
                    for (let i = 0; i < n; i++) {
                        y -= rise;
                        const px = x0 + (i % 2 ? d : -d) * 130;
                        solids.push({ x: px - 70, y, w: 140, h: 14, thin: true, jt: true, oneway: true, bi: b });
                        if (i === 2) this.boxes.push({ x: px, y: y - 55, t: 0 });
                        if (dif > 2 && i === n - 2) this.spikes.push({ x: px - 20, y: y - 20, w: 40, h: 20 });
                        cx = px;
                    }
                    ledge(d * 260, 105, 240);
                },
                // ---- Timing: platforms that fade in and out. They flash right before they vanish. ----
                blinkpath: () => {
                    const b = biome(), dif = clamp(-y / SUM * 4, 0, 4);
                    let d = cx < W / 2 ? 1 : -1;
                    ledge(d * 200, 105, 240);
                    const n = 4 + Math.floor(r() * 2), step = 270 + Math.round(dif * 20);
                    for (let i = 0; i < n; i++) {
                        if (d > 0 ? cx + step > W - 260 : cx - step < 260) d = -d;
                        cx += d * step; y -= i === 0 ? 60 : (r() < 0.5 ? 0 : 50);
                        const p = { x: cx - 60, y, w: 120, h: 14, thin: true, jt: true, oneway: true, blink: true, period: 3.6, on: 2.4, phase: i * 0.8, bi: b };
                        solids.push(p); this.blinkers.push(p);
                    }
                    ledge(d * 250, 100, 260);
                },                // ---- Travel: long roofs you run across, with props to hop over ----
                rooftops: () => {
                    const b = biome();
                    let side = dirNow();
                    const n = 3 + Math.floor(r() * 2);
                    for (let i = 0; i < n; i++) {
                        const t = ledge(side * 700, 120, 1000, { roof: true, thin: false, h: 40, bodyH: 100 });
                        const kinds = ['crate', 'ac', 'tank'];
                        for (let px = t.x + 120; px < t.x + t.w - 160; px += 200 + r() * 160) {
                            const h2 = 52 + Math.floor(r() * 3) * 20;
                            box(px, y - h2, 60 + Math.floor(r() * 3) * 16, h2, kinds[Math.floor(r() * 3)]);
                        }
                        if (b >= 2 && i === 1) this.saws.push({ cx: t.x + t.w / 2, cy: y - 110, amp: 120, speed: 1.6, phase: r() * 6, r: 20, x: 0, y: 0 });
                        side = -side;
                    }
                    ledge(0, 105, 220);
                },
                // ---- Head hitters: a low ceiling over a run of obstacles, so a full jump bonks your head and you must time a short hop ----
                corridor: () => {
                    const b = biome(), dif = clamp(-y / SUM * 4, 0, 4);
                    const base = ledge(0, 110, 1300, { roof: true, thin: false, h: 60, bodyH: 100 });
                    const gy = y, wd = base.w, left = r() < 0.5;
                    const put = (rel, w) => left ? base.x + wd - rel - w : base.x + rel;
                    const oh = 52, clr = 44 + oh + Math.round(56 - dif * 7);
                    const slabW = Math.max(300, wd - 600);
                    solids.push({ x: put(280, slabW), y: gy - clr - 40, w: slabW, h: 40, prop: 'ac', bi: b });
                    for (let rel = 280 + 160; rel < 280 + slabW - 120; rel += 200 + r() * 40) box(put(rel, 56), gy - oh, 56, oh, 'crate');
                    if (dif > 1.5) this.spikes.push({ x: put(280 + slabW / 2, 60), y: gy - 20, w: 60, h: 20 });
                    const ex = { x: put(wd - 200, 200), y: gy - 120, w: 200, h: 14, thin: true, bi: b };
                    solids.push(ex);
                    cx = ex.x + ex.w / 2; y = ex.y;
                    this.boxes.push({ x: base.x + wd / 2, y: gy - 55, t: 0 });
                },
                ramps: () => {
                    // walk up sloped roofs, then hop wider and wider gaps between the plateaus
                    const b = biome(), dif = clamp(-y / SUM * 4, 0, 4);
                    let d = cx < W / 2 ? 1 : -1;
                    const n = dif > 1.5 ? 3 : 2;
                    let a = ledge(d * 200, 100, 320);
                    for (let i = 0; i < n; i++) {
                        const rise = 120 + Math.round(r() * 60), sw = 360 + Math.round(r() * 80);
                        if (d > 0 ? a.x + a.w + sw + 260 > W - 60 : a.x - sw - 260 < 60) d = -d;
                        const clash = dd => {
                            const x0 = dd > 0 ? a.x + a.w : a.x - sw - 220, x1 = dd > 0 ? a.x + a.w + sw + 220 : a.x;
                            return solids.some(o => !o.wall && !o.ground && o.x < x1 && o.x + o.w > x0 && o.y < a.y + 150 && o.y + o.h > a.y - rise - 140);
                        };
                        if (clash(d)) { d = -d; if (clash(d)) break; }
                        const sx = d > 0 ? a.x + a.w : a.x - sw;
                        solids.push({ x: sx, y: a.y - rise, w: sw, h: rise, slope: d > 0 ? 1 : -1, bi: b });
                        const top = { x: d > 0 ? sx + sw : sx - 220, y: a.y - rise, w: 220, h: 14, thin: true, bi: b };
                        solids.push(top);
                        cx = top.x + top.w / 2; y = top.y;
                        if (i < n - 1) {
                            const gap = 230 + Math.round(dif * 28);
                            a = ledge(d * (gap + 260), 70, 300);
                        }
                    }
                    ledge(d * 160, 105, 260);
                },
                needle: () => {
                    // very hard: long gaps under a low ceiling, so you have to hop low and dash
                    const b = biome(), dif = clamp(-y / SUM * 4, 0, 4);
                    const d = cx < W / 2 ? 1 : -1;
                    let a = ledge(d * 260, 100, 200);
                    for (let i = 0; i < 3; i++) {
                        const gap = 250 + Math.round(dif * 8) + i * 8;
                        const c = ledge(d * (gap + 200), 0, 200);
                        const lft = Math.min(a.x, c.x) - 40, rgt = Math.max(a.x + a.w, c.x + c.w) + 40;
                        solids.push({ x: lft, y: a.y - 118 - 40, w: rgt - lft, h: 40, prop: 'ac', bi: b });
                        if (i === 1) this.spikes.push({ x: (a.x + a.w + c.x) / 2 - 20 + (d < 0 ? 0 : 0), y: a.y + 180, w: 40, h: 20 });
                        a = c;
                    }
                    ledge(d * 220, 105, 260);
                },
                bonkgap: () => {
                    // a jump gap under a low ceiling: a full jump bonks your head, so you need a flat hop plus dash/double jump
                    const b = biome(), dif = clamp(-y / SUM * 4, 0, 4);
                    const d = cx < W / 2 ? 1 : -1;
                    const a = ledge(d * 260, 100, 280);
                    const gap = 190 + Math.round(dif * 25);
                    const c = ledge(d * (280 + gap), 0, 280);
                    const i1 = d > 0 ? a.x + a.w : a.x, i2 = d > 0 ? c.x : c.x + c.w;
                    const lft = Math.min(i1, i2) - 80, rgt = Math.max(i1, i2) + 80;
                    solids.push({ x: lft, y: a.y - 125 - 40, w: rgt - lft, h: 40, prop: 'ac', bi: b });
                    if (dif > 2) this.saws.push({ cx: (i1 + i2) / 2, cy: a.y + 90, amp: 0, speed: 1, phase: 0, r: 20, x: 0, y: 0 });
                    ledge(d * 260, 105, 220);
                },
                // ---- Large walkable structures (Only Up style): plenty of room to run around, hop over props and pick a route ----
                plaza: () => {
                    const b = biome();
                    const base = ledge(0, 110, 1100, { roof: true, thin: false, h: 60 });
                    const wd = base.w;
                    const kinds = ['crate', 'ac', 'tank'];
                    const left = r() < 0.5, deckW = Math.min(520, wd - 140);
                    // props only on the half without the stepped deck, so nothing overlaps or blocks it
                    const from = left ? base.x + deckW + 220 : base.x + 120, to = left ? base.x + wd - 120 : base.x + wd - deckW - 220;
                    for (let px = from; px + 90 < to; px += 70 + 140 + r() * 110) {
                        const w2 = 70 + Math.floor(r() * 3) * 20, h2 = 56 + Math.floor(r() * 3) * 18;
                        box(px, y - h2, w2, h2, kinds[Math.floor(r() * 3)]);
                    }
                    const dx = left ? base.x + 40 : base.x + wd - 40 - deckW;
                    solids.push({ x: left ? dx + deckW - 20 : dx - 140, y: y - 115, w: 160, h: 14, oneway: true, jt: true, thin: true, bi: b });
                    solids.push({ x: dx, y: y - 230, w: deckW, h: 14, oneway: true, jt: true, thin: true, bi: b });
                    this.boxes.push({ x: dx + deckW / 2, y: y - 285, t: 0 });
                    cx = dx + deckW / 2; y -= 230;
                    ledge(0, 105, 220);
                },
                tower: () => {
                    const b = biome();
                    let side = dirNow();
                    for (let i = 0; i < 4; i++) {
                        const t = ledge(side * 700, 120, 760, { roof: true, thin: false, h: 40, bodyH: 120 });
                        if (i < 3) box(t.x + 70 + r() * (t.w - 220), y - 66, 76, 66, r() < 0.5 ? 'crate' : 'ac');
                        if (i === 2 && b >= 2) this.saws.push({ cx: cx, cy: y - 120, amp: 90, speed: 1.5, phase: r() * 6, r: 20, x: 0, y: 0 });
                        side = -side;
                    }
                    ledge(0, 105, 220);
                },
                scaffold: () => {
                    cx = clamp(cx, 800, W - 800);
                    const b = biome(), base = cx;
                    for (let row = 0; row < 4; row++) {
                        y -= 120;
                        for (const o of (row % 2 ? [-600, 0, 600] : [-300, 300])) {
                            solids.push({ x: base + o - 90, y, w: 180, h: 14, thin: true, bi: b });
                        }
                        if (row === 1) this.boxes.push({ x: base + 600, y: y - 55, t: 0 });
                    }
                    cx = base;
                    ledge(0, 105, 220);
                },
                cratestack: () => {
                    const b = biome(), left = r() < 0.5;
                    const base = ledge(0, 110, 960, { roof: true, thin: false, h: 40, bodyH: 100 });
                    const gy = y;
                    let topX = 0;
                    for (let i = 0; i < 3; i++) {
                        const wdt = 480 - i * 140;
                        const x0 = left ? base.x + 60 : base.x + base.w - 60 - wdt;
                        box(x0, gy - 80 * (i + 1), wdt, 80, 'crate');
                        topX = x0 + wdt / 2;
                    }
                    if (b >= 2) this.spikes.push({ x: left ? base.x + 600 : base.x + 300, y: gy - 20, w: 60, h: 20 });
                    cx = topX; y = gy - 240;
                    ledge(0, 110, 220);
                },
                pipes: () => {
                    const b = biome();
                    let d = dirNow();
                    for (let i = 0; i < 5; i++) {
                        ledge(d * 560, 120, 520, { pipe: true, thin: false, h: 22 });
                        if (i === 2) this.boxes.push({ x: cx, y: y - 55, t: 0 });
                        d = flip(d);
                    }
                    ledge(0, 105, 220);
                },
                stairs: () => {
                    let d = dirNow();
                    const n = 6 + Math.floor(r() * 4);
                    for (let i = 0; i < n; i++) {
                        const p = ledge(d * (170 + r() * 70), 100 + r() * 15, 120 + r() * 50);
                        if (i === 3 && r() < 0.5) this.boxes.push({ x: cx, y: p.y - 60, t: 0 });
                        d = flip(d);
                    }
                },
                spikes: () => {
                    const d = dirNow();
                    const p = ledge(d * 200, 105, 400);
                    this.spikes.push({ x: p.x + 170, y: p.y - 20, w: 60, h: 20 });
                    ledge(d * 260, 105, 150);
                },
                springs: () => {
                    const n = 2 + Math.floor(r() * 3);
                    for (let i = 0; i < n; i++) {
                        const d = dirNow();
                        const p = ledge(i ? d * 300 : d * 190, i ? 300 : 105, 170);
                        this.springs.push({ x: p.x + 62, y: p.y - 16, w: 46, h: 16 });
                    }
                    ledge(dirNow() * 300, 300, 200);
                },
                movers: () => {
                    const n = 3 + Math.floor(r() * 2);
                    for (let i = 0; i < n; i++) {
                        cx = clamp(cx + (i % 2 ? -400 : 400), 300, W - 300);
                        y -= 110;
                        const m = { x: cx - 60, y, w: 120, h: 20, bx: cx - 60, by: y, amp: 130, speed: 0.9 + r() * 0.6, phase: r() * 6, dx: 0, dy: 0, mover: true, oneway: true, bi: biome() };
                        solids.push(m); this.movers.push(m);
                    }
                    ledge(0, 110, 220);
                },
                crumbles: () => {
                    let d = dirNow();
                    const n = 5 + Math.floor(r() * 3);
                    for (let i = 0; i < n; i++) {
                        const p = ledge(d * (150 + r() * 50), 100, 120, { crumble: true, timer: 0, gone: 0 });
                        this.crumbles.push(p);
                        d = flip(d);
                    }
                    ledge(d * 150, 105, 220);
                },
                saws: () => {
                    let d = dirNow();
                    for (let i = 0; i < 5; i++) {
                        const p = ledge(d * 200, 105, 150);
                        if (i % 2 === 1) this.saws.push({ cx: p.x + p.w / 2, cy: p.y - 135, amp: 42, speed: 1.6 + r() * 0.8, phase: r() * 6, r: 20, x: 0, y: 0 });
                        d = flip(d);
                    }
                },
                lasers: () => {
                    const dir = cx < W / 2 ? 1 : -1, wd = 640;
                    const p = ledge(0, 110, wd, { roof: true, thin: false, h: 60 });
                    for (let i = 0; i < 3; i++) this.lasers.push({ x: p.x + 150 + i * 170, y: y - 210, w: 10, h: 210, period: 2.2 + (i % 2) * 0.4, phase: i * 0.8 });
                    cx = p.x + p.w / 2 < W / 2 ? p.x + p.w + 110 : p.x - 110;
                    y -= 105;
                    solids.push({ x: cx - 75, y, w: 150, h: 14, oneway: true, jt: true, thin: true, bi: biome() });
                },
                precision: () => {
                    let d = dirNow();
                    for (let i = 0; i < 7; i++) { ledge(d * (170 + r() * 40), 100, 64); d = flip(d); }
                },
                chimney: () => {
                    const base = ledge(dirNow() * 160, 105, 420);
                    const gx = base.x + base.w / 2, top = base.y - 640, b = biome();
                    solids.push({ x: gx - 155, y: top, w: 60, h: 530, wallJ: true, bi: b });
                    solids.push({ x: gx + 95, y: top, w: 60, h: 530, wallJ: true, bi: b });
                    cx = gx + (gx < W / 2 ? 1 : -1) * 330; y = top;
                    ledge(0, 0, 340);
                    this.boxes.push({ x: gx, y: base.y - 330, t: 0 });
                },
                wind: () => {
                    const y0 = y, fx = (r() < 0.5 ? -1 : 1) * (150 + r() * 50);
                    let d = dirNow();
                    for (let i = 0; i < 6; i++) { ledge(d * (150 + r() * 50), 100, 130); d = flip(d); }
                    this.winds.push({ x: 60, y: y - 160, w: W - 120, h: y0 - y + 200, fx });
                },
                ice: () => {
                    let d = dirNow();
                    for (let i = 0; i < 6; i++) { ledge(d * (160 + r() * 60), 100, 190, { ice: true }); d = flip(d); }
                },
                conveyors: () => {
                    let d = dirNow();
                    for (let i = 0; i < 5; i++) { ledge(d * (150 + r() * 50), 100, 230, { belt: (i % 2 ? -1 : 1) * 130 }); d = flip(d); }
                },
                pendulums: () => {
                    let d = dirNow();
                    for (let i = 0; i < 5; i++) {
                        const p = ledge(d * 200, 105, 170);
                        if (i % 2 === 1) this.balls.push({ px: p.x + p.w / 2, py: p.y - 230, len: 150, amp: 0.95, speed: 1.5 + r() * 0.5, phase: r() * 6, r: 26, x: 0, y: 0 });
                        d = flip(d);
                    }
                },
                gauntlet: () => {
                    // Mixed run: spring pad up to a ledge, then spiked crumbling steps, then a saw gap
                    let d = dirNow();
                    const a = ledge(d * 190, 105, 170);
                    this.springs.push({ x: a.x + 62, y: a.y - 16, w: 46, h: 16 });
                    d = flip(d);
                    const b = ledge(d * 330, 300, 230);
                    this.spikes.push({ x: b.x + (d > 0 ? 170 : 20), y: b.y - 20, w: 40, h: 20 });
                    for (let i = 0; i < 3; i++) {
                        d = flip(d);
                        const c = ledge(d * 160, 100, 110, { crumble: true, timer: 0, gone: 0 });
                        this.crumbles.push(c);
                        if (i === 1) this.saws.push({ cx: c.x + c.w / 2, cy: c.y - 120, amp: 36, speed: 1.8, phase: r() * 6, r: 18, x: 0, y: 0 });
                    }
                    ledge(flip(d) * 160, 105, 200);
                },
                shaft: () => {
                    // Wall-jump shaft with a belt floor and a pendulum guarding the exit
                    const base = ledge(dirNow() * 160, 105, 380, { belt: 110 });
                    const gx = base.x + base.w / 2, top = base.y - 560, b = biome();
                    solids.push({ x: gx - 140, y: top, w: 55, h: 450, wallJ: true, bi: b });
                    solids.push({ x: gx + 85, y: top, w: 55, h: 450, wallJ: true, bi: b });
                    this.balls.push({ px: gx, py: top + 60, len: 130, amp: 0.8, speed: 1.4, phase: r() * 6, r: 24, x: 0, y: 0 });
                    cx = gx + (gx < W / 2 ? 1 : -1) * 290; y = top;
                    ledge(0, 0, 300, { ice: true });
                },
                islands: () => {
                    // Floating islands with moving bridges between them
                    let d = dirNow();
                    for (let i = 0; i < 3; i++) {
                        const p = ledge(d * 230, 110, 140);
                        if (i === 1) this.winds.push({ x: p.x - 160, y: p.y - 200, w: 460, h: 260, fx: d * -170 });
                        const mx = clamp(cx + d * 270, 260, W - 260);
                        const m = { x: mx - 50, y: y - 80, w: 100, h: 18, bx: mx - 50, by: y - 80, amp: 90, speed: 1.1 + r() * 0.5, phase: r() * 6, dx: 0, dy: 0, mover: true, oneway: true, bi: biome() };
                        solids.push(m); this.movers.push(m);
                        y -= 80; cx = clamp(mx, 300, W - 300);
                        d = flip(d);
                    }
                    ledge(0, 100, 220);
                },
                fork: () => {
                    // Two routes up from a hub: left = crumbling steps, right = hazards with a mystery box. They rejoin above.
                    const hub = ledge(0, 105, 460);
                    const hx = clamp(cx, 720, W - 720), hy = y, b = biome();
                    const step = (x, yy, wd, extra) => { const p = Object.assign({ x: x - wd / 2, y: yy, w: wd, h: 14, thin: true, bi: b }, extra); solids.push(p); return p; };
                    const lx = [hx - 340, hx - 540, hx - 340, hx - 540];
                    const rx = [hx + 340, hx + 540, hx + 340, hx + 540];
                    for (let i = 0; i < 4; i++) {
                        const yy = hy - 100 * (i + 1);
                        const c = step(lx[i], yy, 120, { crumble: true, timer: 0, gone: 0 });
                        this.crumbles.push(c);
                        const p = step(rx[i], yy, 150);
                        if (i === 0 || i === 2) this.saws.push({ cx: rx[i], cy: yy - 120, amp: 38, speed: 1.7 + r() * 0.5, phase: r() * 6, r: 19, x: 0, y: 0 });
                        if (i === 1) this.spikes.push({ x: p.x + (r() < 0.5 ? 10 : 100), y: yy - 20, w: 40, h: 20 });
                        if (i === 3) this.boxes.push({ x: rx[i], y: yy - 55, t: 0 });
                    }
                    y = hy - 500; cx = hx;
                    const top = { x: hx - 260, y, w: 520, h: 14, thin: true, bi: b };
                    solids.push(top);
                },
                traverse: () => {
                    // Long sideways crossing with opposing conveyors and a laser gate
                    const d = cx < W / 2 ? 1 : -1;
                    for (let i = 0; i < 7; i++) {
                        const p = ledge(d * 230, 45, 150, i % 2 ? { belt: -d * 110 } : null);
                        if (i === 3) this.lasers.push({ x: p.x + p.w / 2 - 5, y: p.y - 200, w: 10, h: 200, period: 2.6, phase: r() * 2 });
                        if (i === 5) this.saws.push({ cx: p.x + p.w / 2, cy: p.y - 130, amp: 40, speed: 2, phase: r() * 6, r: 19, x: 0, y: 0 });
                    }
                    ledge(-d * 120, 105, 240);
                },
                ladder: () => {
                    // Alternating wall pieces: kick between the left and right walls to climb
                    const base = ledge(dirNow() * 160, 105, 360);
                    const gx = clamp(base.x + base.w / 2, 330, W - 330), b = biome();
                    const n = 5;
                    for (let i = 0; i < n; i++) {
                        const side = i % 2 ? 95 : -155;
                        solids.push({ x: gx + side, y: base.y - 120 * (i + 1) - 100, w: 60, h: 220, wallJ: true, bi: b });
                    }
                    cx = gx + (gx < W / 2 ? 1 : -1) * 350; y = base.y - 700;
                    ledge(0, 0, 300);
                    this.boxes.push({ x: gx, y: base.y - 260, t: 0 });
                },
                lifts: () => {
                    // Vertical lifts carry you between ledges
                    let d = dirNow();
                    for (let i = 0; i < 2; i++) {
                        const a = ledge(0, 105, 180);
                        const lxm = clamp(cx + d * 230, 200, W - 200);
                        const m = { x: lxm - 55, y: y - 160, w: 110, h: 18, bx: lxm - 55, by: y - 160, amp: 160, speed: 0.8 + r() * 0.3, phase: r() * 6, dx: 0, dy: 0, mover: true, vert: true, oneway: true, bi: biome() };
                        solids.push(m); this.movers.push(m);
                        cx = clamp(lxm + d * 150, 120, W - 120); y -= 320;
                        const p = { x: cx - 90, y, w: 180, h: 14, oneway: true, jt: true, thin: true, bi: biome() };
                        solids.push(p);
                        d = flip(d);
                    }
                    ledge(0, 105, 220);
                }
            };
            const table = [
                ['plaza', 'rooftops', 'tower', 'scaffold', 'cratestack', 'pipes', 'rooftops', 'plaza', 'stairs', 'springs', 'movers', 'conveyors', 'chimney', 'fork', 'islands', 'traverse', 'corridor', 'ramps', 'ramps', 'ghostclimb'],
                ['rooftops', 'rooftops', 'corridor', 'bonkgap', 'plaza', 'tower', 'scaffold', 'cratestack', 'pipes', 'movers', 'springs', 'crumbles', 'ice', 'wind', 'chimney', 'gauntlet', 'fork', 'shaft', 'skybridge', 'springdash', 'ramps', 'ramps', 'ghostclimb', 'blinkpath'],
                ['rooftops', 'corridor', 'corridor', 'bonkgap', 'bonkgap', 'tower', 'pipes', 'conveyors', 'pendulums', 'saws', 'lasers', 'spikes', 'gauntlet', 'shaft', 'fork', 'gatekeeper', 'leap', 'skybridge', 'springdash', 'chimney', 'ramps', 'needle', 'blinkpath', 'blinkpath'],
                ['corridor', 'corridor', 'bonkgap', 'bonkgap', 'rooftops', 'leap', 'gatekeeper', 'marathon', 'pipes', 'tower', 'saws', 'lasers', 'pendulums', 'crumbles', 'ice', 'wind', 'shaft', 'gauntlet', 'springdash', 'chimney', 'precision', 'ramps', 'needle', 'needle', 'blinkpath', 'blinkpath']
            ];            const rank = { rooftops: 0, ghostclimb: 1, blinkpath: 5, ramps: 1, needle: 9, corridor: 3, bonkgap: 5, plaza: 0, stairs: 0, tower: 1, scaffold: 1, cratestack: 1, springs: 1, pipes: 2, conveyors: 2, movers: 2, spikes: 2, lifts: 2, traverse: 2, ladder: 2, islands: 3, fork: 3, chimney: 3, crumbles: 3, wind: 3, ice: 3, skybridge: 4, shaft: 4, precision: 4, saws: 4, lasers: 4, springdash: 5, pendulums: 5, gauntlet: 5, leap: 6, gatekeeper: 7, marathon: 8 };
            const pools = table.map(names => [...new Set(names)].sort((a, b) => rank[a] - rank[b] || (r() < 0.5 ? -1 : 1)));
            let count = 0, lastName = '', curBiome = -1, startY = 0;
            while (y > -SUM + 700) {
                const b = biome();
                if (b !== curBiome) {
                    curBiome = b; startY = y;
                    if (b > 0) startPad();
                }
                const pool = pools[b];
                const f = clamp((startY - y) / (SUM / 4), 0, 0.999);
                const lo = Math.floor(f * Math.max(1, pool.length - 5));
                let name;
                for (let tries = 0; tries < 6; tries++) {
                    name = pool[Math.min(pool.length - 1, lo + Math.floor(r() * 6))];
                    if (name !== lastName) break;
                }
                lastName = name;
                segs[name]();
                if (++count % 2 === 0) rest();
            }
            ledge(0, 110, 220);
            const summit = this.summit = ledge(0, 110, 900, { roof: true, thin: false, h: 60, bi: 3 });
            this.summitH = -y;
            // any thin platform with another walkable one right under it becomes a jump-through glass platform, so tight spots never bonk you
            for (const q of solids) {
                if (!q.thin || q.jt || q.mover || q.crumble || q.wall || q.ground) continue;
                if (solids.some(p => p !== q && walkable(p) && !p.mover && p.y - q.y > 0 && p.y - q.y <= 150 && p.x < q.x + q.w - 10 && p.x + p.w > q.x + 10)) q.jt = true;
            }
            // a slope's body must never leave a cramped slot over a platform: nudge that platform down so there is real headroom
            for (const sl of solids) {
                if (!sl.slope) continue;
                for (const q of solids) {
                    if (q === sl || q.slope || q.mover || q.wall || q.ground) continue;
                    const gap = q.y - (sl.y + sl.h);
                    if (gap <= 0 || gap >= 130 || q.x >= sl.x + sl.w || q.x + q.w <= sl.x) continue;
                    const ny = q.y + (130 - gap);
                    if (!solids.some(o => o !== q && o.x < q.x + q.w && o.x + o.w > q.x && o.y < ny + q.h + 10 && o.y + o.h > q.y)) q.y = ny;
                }
            }
            for (const p of solids) p.oneway = !!p.jt;
            // purely visual rooftop clutter, placed only in free gaps (no props, spikes, springs, boxes, flags or ceilings)
            const rd = mulberry32((this.s.seed ^ 0x9e3779b1) >>> 0), DW = [80, 110, 80, 100, 110, 110, 90, 70, 100];
            for (const p of solids) {
                if (!p.roof || p.w < 200) continue;
                const bl = [];
                for (const s of solids) {
                    if (s === p || s.wall || s.ground || s.x >= p.x + p.w || s.x + s.w <= p.x) continue;
                    if (s.y + s.h > p.y - 80 && s.y < p.y + 4) bl.push([s.x - 12, s.x + s.w + 12]);
                }
                for (const o of this.spikes.concat(this.springs)) if (Math.abs(o.y + o.h - p.y) < 8) bl.push([o.x - 14, o.x + o.w + 14]);
                for (const o of this.boxes) if (Math.abs(o.y + 55 - p.y) < 12) bl.push([o.x - 44, o.x + 44]);
                for (const o of this.checkpoints) if (Math.abs(o.y - p.y) < 6) bl.push([o.x - 20, o.x + 210]);
                p.decor = [];
                let dx = p.x + 24 + rd() * 40, prev = -1;
                while (dx + 110 < p.x + p.w - 24) {
                    let k = Math.floor(rd() * 9);
                    if (k === prev) k = (k + 1) % 9;
                    const w = DW[k], hit = bl.find(b => dx < b[1] && dx + w > b[0]);
                    if (hit) { dx = hit[1] + 6; continue; }
                    p.decor.push({ x: dx, k, w, s: Math.floor(rd() * 1000) });
                    prev = k; dx += w + 50 + rd() * 120;
                }
            }
            const back = p => p.roof || p.wall || p.ground;
            this.drawList = [...solids.filter(back), ...solids.filter(p => !back(p))];
            for (const w of this.saws) { w.x = w.cx; w.y = w.cy; }
        }

        hurt() {
            if (this.dead > 0 || this.finished) return;
            this.dead = 1;
            this.deaths++;
            this.particles.burst(this.me.x + 13, this.me.y + 22, this.s.local.color, 22, 320, 0.7, 5);
            this.shake = 0.3;
        }

        update(dt) {
            const s = this.s, me = this.me, t = s.t;
            this.anim += dt; this.dtLast = dt;
            const clock = (Date.now() - s.startedAt) / 1000;
            this.clock = clock;

            for (const m of this.movers) {
                if (m.vert) {
                    const ny = m.by + Math.sin(clock * m.speed + m.phase) * m.amp;
                    m.dx = 0; m.dy = ny - m.y; m.y = ny;
                    continue;
                }
                const nx = m.bx + Math.sin(clock * m.speed + m.phase) * m.amp;
                m.dx = nx - m.x; m.dy = 0; m.x = nx;
            }
            for (const p of this.blinkers) { const u = (this.anim + p.phase) % p.period; p.off = u > p.on; p.warn = !p.off && u > p.on - 0.6; }
            for (const c of this.crumbles) {
                if (c.gone > 0) { c.gone -= dt; if (c.gone <= 0) { c.off = false; c.timer = 0; } continue; }
                if (c.timer > 0) { c.timer -= dt; if (c.timer <= 0) { c.off = true; c.gone = 3; } }
            }
            for (const w of this.saws) { w.x = w.cx; w.y = w.cy + Math.sin(clock * w.speed + w.phase) * w.amp; }
            for (const b of this.balls) {
                const a = b.amp * Math.sin(clock * b.speed + b.phase);
                b.x = b.px + b.len * Math.sin(a); b.y = b.py + b.len * Math.cos(a);
            }
            for (const b of this.boxes) if (b.t > 0) b.t -= dt;

            if (this.dead > 0) {
                this.dead -= dt;
                if (this.dead <= 0) {
                    me.x = this.cp.x; me.y = this.cp.y - me.h - 2; me.vx = 0; me.vy = 0; this.dash = 0; this.kick = 0;
                    this.tideY = this.cp.y + 900; this.tideWarn = false; this.snapCam = true;
                }
                this.state = 4;
                this.particles.update(dt, 600);
                return;
            }

            if (this.finished) { me.vx *= 0.9; }
            const exhausted = !this.finished && s.game.res.value < 0.5;
            if (exhausted && !this.wasExhausted) s.toast('Out of energy — no control! Press Q for a question', '#f87171');
            this.wasExhausted = exhausted;

            if (!this.finished) {
                this.tideY -= (24 + Math.min(3, Math.floor(this.maxH / this.summitH * 4)) * 6) * dt;
                this.tideY = Math.min(this.tideY, me.y + 1700);
                const gap = this.tideY - (me.y + me.h);
                if (gap < 420 && !this.tideWarn) { this.tideWarn = true; s.toast('The tide is rising — keep climbing!', '#fb923c'); }
                else if (gap > 800) this.tideWarn = false;
            }

            this.wallDir = 0;
            if (!me.onGround && !this.finished && !exhausted && this.dash <= 0) {
                const L = { x: me.x - 5, y: me.y + 6, w: 5, h: me.h - 12 }, R = { x: me.x + me.w, y: me.y + 6, w: 5, h: me.h - 12 };
                for (const p of this.solids) {
                    if (!p.wallJ) continue;
                    if (overlap(L, p)) { this.wallDir = -1; break; }
                    if (overlap(R, p)) { this.wallDir = 1; break; }
                }
            }
            for (const wz of this.winds) {
                if (overlap(me, wz)) me.x += wz.fx * dt;
            }

            const ax = this.finished || exhausted ? 0 : s.axis().x;
            if (ax && !this.finished) s.game.res.drain((me.onGround ? 2 : 1.2) * dt);
            const speedMul = this.boost > 0 ? 1.3 : this.slow > 0 ? 0.6 : 1;
            this.boost = Math.max(0, this.boost - dt);
            this.slow = Math.max(0, this.slow - dt);
            this.dashCd -= dt;
            const prevGround = me.ground;
            if (prevGround && (prevGround.dx || prevGround.dy)) { me.x += prevGround.dx || 0; me.y += prevGround.dy || 0; }
            if (prevGround && prevGround.belt) me.x += prevGround.belt * dt;

            if (this.dash > 0) {
                this.dash -= dt;
                me.vx = me.face * 760 * speedMul; me.vy = 0;
                if (Math.random() < 0.7) this.particles.burst(me.x + 13, me.y + 28, '#e0f2fe', 1, 40, 0.3, 4);
            } else {
                const max = 340 * speedMul;
                const target = ax * max;
                const onIce = me.onGround && me.ground?.ice;
                const accel = (onIce ? 420 : me.onGround ? 3400 : 2300) * dt;
                if (this.kick > 0) this.kick -= dt;
                else me.vx += clamp(target - me.vx, -accel, accel);
                if (ax) me.face = ax;
                me.vy = Math.min(1150, me.vy + 2300 * dt);
                if (this.wallDir && me.vy > 130) me.vy = 130;
                if (!s.down('Space', 'ArrowUp', 'KeyW') && me.vy < -250 && !this.sprung) me.vy += 2600 * dt;
                if (!exhausted && s.pressed('ShiftLeft', 'ShiftRight', 'KeyK') && this.dashCd <= 0 && !this.finished && s.spend(25)) {
                    this.dash = 0.16; this.dashCd = 0.9; s.sfx('dash');
                }
            }
            if (me.onGround) { this.coyote = 0.1; this.airJumps = 1; this.sprung = false; } else this.coyote -= dt;
            if (s.pressed('Space', 'ArrowUp', 'KeyW') && !this.finished && !exhausted) this.buffer = 0.13; else this.buffer -= dt;
            if (this.buffer > 0) {
                if (this.coyote > 0) {
                    if (!s.spend(6)) { this.buffer = 0; } else {
                        me.vy = -850; this.coyote = 0; this.buffer = 0; s.sfx('jump');
                        this.particles.burst(me.x + 13, me.y + me.h, '#cbd5e1', 6, 90, 0.3, 4);
                    }
                } else if (this.wallDir && s.spend(10)) {
                    me.vy = -820; me.vx = -this.wallDir * 400; me.face = -this.wallDir; this.kick = 0.22; this.buffer = 0; this.sprung = false;
                    this.airJumps = Math.max(this.airJumps, 1); s.sfx('jump');
                    this.particles.burst(me.x + (this.wallDir > 0 ? me.w : 0), me.y + 22, '#e2e8f0', 8, 120, 0.3, 4);
                } else if (this.airJumps > 0 && s.spend(12)) {
                    me.vy = -780; this.airJumps--; this.buffer = 0; s.sfx('jump');
                    this.particles.burst(me.x + 13, me.y + me.h, '#7dd3fc', 10, 140, 0.35, 4);
                }
            }

            const wasAir = !me.onGround;
            moveBody(me, this.solids, dt);
            if (me.onGround && wasAir) this.particles.burst(me.x + 13, me.y + me.h, '#94a3b8', 5, 70, 0.25, 3);
            if (me.onGround && me.ground?.crumble && me.ground.timer <= 0 && !me.ground.off) me.ground.timer = 0.5;

            const box = { x: me.x + 3, y: me.y + 3, w: me.w - 6, h: me.h - 6 };
            for (const sp of this.springs) {
                if (overlap(box, sp) && me.vy >= 0) {
                    me.vy = -1280; this.sprung = true; this.airJumps = 1; s.sfx('powerup');
                    this.particles.burst(sp.x + 23, sp.y, '#fbbf24', 12, 160, 0.4, 4);
                }
            }
            if (!this.finished) {
                for (const sp of this.spikes) if (overlap(box, sp)) this.hurt();
                for (const w of this.saws) if (dist(me.x + 13, me.y + 22, w.x, w.y) < w.r + 14) this.hurt();
                for (const b of this.balls) if (dist(me.x + 13, me.y + 22, b.x, b.y) < b.r + 12) this.hurt();
                if (me.y + me.h > this.tideY) this.hurt();
                for (const l of this.lasers) {
                    const on = ((clock + l.phase) % l.period) < l.period * 0.55;
                    l.on = on;
                    if (on && overlap(box, l)) this.hurt();
                }
                if (me.y > this.cp.y + 800) this.hurt();
                for (const c of this.checkpoints) {
                    if (c.id > this.cp.id && Math.abs(me.x + 13 - c.x - 20) < 90 && Math.abs(me.y + me.h - c.y) < 70) { this.cp = c; s.toast(`Checkpoint ${c.id} of ${this.checkpoints.length - 1}`, '#34d399'); s.sfx('powerup'); }
                }
                for (const b of this.boxes) {
                    if (b.t > 0) continue;
                    if (dist(me.x + 13, me.y + 22, b.x, b.y) < 36) {
                        const opened = s.ask(correct => {
                            if (correct === null) { b.t = 4; return; }
                            if (correct) { this.boost = 8; this.bonus += 80; s.refill(); s.toast('Speed boost! +80', '#34d399'); }
                            else { this.slow = 2.5; s.toast('Stumbled…', '#f87171'); }
                        });
                        if (opened) b.t = 1e9;
                    }
                }
                if (me.onGround && me.ground === this.summit) {
                    this.finished = true;
                    s.done = true; s.finishMs = Math.round(s.t * 1000);
                    this.bonus += 400 + Math.max(0, Math.round(500 - s.t * 2));
                    s.toast('FINISH! Waiting for the others…', '#facc15');
                    this.particles.burst(me.x, me.y, '#facc15', 40, 400, 1, 6);
                }
            }
            this.maxH = Math.max(this.maxH, -(me.y + me.h));
            s.score = Math.floor(Math.min(1, this.maxH / this.summitH) * 900) + this.bonus;
            const bi = Math.min(3, Math.floor(this.maxH / this.summitH * 4));
            if (bi > this.biomeSeen) { this.biomeSeen = bi; s.toast(`Entering ${SKY_BIOMES[bi].name}`, '#fbbf24'); s.sfx('powerup'); }
            this.state = this.dash > 0 ? 3 : !me.onGround ? 2 : Math.abs(me.vx) > 40 ? 1 : 0;
            this.particles.update(dt, 500);
        }

        net() {
            const m = this.me;
            return { x: Math.round(m.x), y: Math.round(m.y), vx: Math.round(m.vx), vy: Math.round(m.vy), f: m.face, a: this.state };
        }

        goalText() { const last = this.checkpoints.length - 1; return `${this.cp.id ? `Checkpoint ${this.cp.id}/${last}` : 'Start'} · ${Math.round(this.maxH / 40)}m / ${Math.round(this.summitH / 40)}m · ${SKY_BIOMES[Math.min(3, Math.floor(this.maxH / this.summitH * 4))].name}`; }
        hint() { return 'A/D run · Space jump (twice) · Shift dash · climb to the summit before the tide · Q = recharge'; }

        drawProp(ctx, p) {
            const { x, y, w, h } = p;
            if (p.prop === 'ac') {
                ctx.fillStyle = '#64748b'; roundRect(ctx, x, y, w, h, 4); ctx.fill();
                ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.32, 0, TAU); ctx.fill();
                ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + w / 2 - 14, y + h / 2 + i * 7); ctx.lineTo(x + w / 2 + 14, y + h / 2 + i * 7); ctx.stroke(); }
                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(x, y, w, 4);
            } else if (p.prop === 'tank') {
                ctx.fillStyle = '#92400e'; roundRect(ctx, x, y, w, h, 10); ctx.fill();
                ctx.fillStyle = '#451a03'; for (let by = y + 14; by < y + h - 6; by += 16) ctx.fillRect(x, by, w, 3);
                ctx.fillStyle = '#b45309'; ctx.fillRect(x, y, w, 5);
            } else {
                ctx.fillStyle = '#b7791f'; ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
                ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4); ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4); ctx.stroke();
                ctx.fillStyle = '#fcd34d'; ctx.fillRect(x, y, w, 3);
            }
        }

        drawGlass(ctx, p) {
            const a = p.off ? 0.14 : p.warn && Math.floor(this.anim * 10) % 2 ? 0.3 : 0.85, col = p.blink ? '#fb7185' : '#22d3ee';
            ctx.save(); ctx.globalAlpha = a;
            ctx.fillStyle = p.blink ? 'rgba(251,113,133,.14)' : 'rgba(103,232,249,.14)'; ctx.fillRect(p.x - 5, p.y - 7, p.w + 10, p.h + 14);
            ctx.fillStyle = p.blink ? 'rgba(254,205,211,.45)' : 'rgba(165,243,252,.45)'; roundRect(ctx, p.x, p.y, p.w, p.h, 5); ctx.fill();
            ctx.fillStyle = col; ctx.fillRect(p.x, p.y, p.w, 3);
            ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2); ctx.setLineDash([]);
            ctx.lineWidth = 2; ctx.beginPath();
            for (let x = p.x + 18; x < p.x + p.w - 8; x += 30) { ctx.moveTo(x - 5, p.y + p.h + 13); ctx.lineTo(x, p.y + p.h + 7); ctx.lineTo(x + 5, p.y + p.h + 13); }
            ctx.stroke(); ctx.restore();
        }

        drawDecor(ctx, p) {
            if (!p.decor) return;
            const y = p.y, t = this.anim, neon = p.bi === 3;
            const cols = ['#f472b6', '#22d3ee', '#fbbf24', '#a78bfa', '#4ade80'];
            for (const d of p.decor) {
                const x = d.x, w = d.w;
                if (d.k === 0) {
                    ctx.fillStyle = '#7c2d12'; ctx.fillRect(x + 20, y - 46, 30, 46);
                    ctx.fillStyle = '#9a3412'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 20, y - 40 + i * 11, 30, 2);
                    ctx.fillStyle = '#431407'; ctx.fillRect(x + 16, y - 52, 38, 8);
                    ctx.fillStyle = '#64748b'; ctx.fillRect(x + 62, y - 18, 10, 18); ctx.fillStyle = '#94a3b8'; ctx.fillRect(x + 59, y - 22, 16, 5);
                    for (let i = 0; i < 4; i++) { const u = (t * 0.45 + i / 4) % 1; ctx.fillStyle = 'rgba(226,232,240,' + (0.34 * (1 - u)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x + 35 + Math.sin(u * 5 + i) * 9, y - 58 - u * 64, 6 + u * 13, 0, TAU); ctx.fill(); }
                } else if (d.k === 1) {
                    ctx.fillStyle = '#334155'; ctx.fillRect(x + 12, y - 40, 5, 40); ctx.fillRect(x + w - 17, y - 40, 5, 40);
                    ctx.fillStyle = '#0f172a'; roundRect(ctx, x, y - 78, w, 40, 5); ctx.fill();
                    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y - 77, w - 2, 38);
                    ctx.fillStyle = cols[d.s % 5]; ctx.fillRect(x + 8, y - 70, w - 16, 6);
                    ctx.fillStyle = cols[(d.s + 2) % 5]; ctx.fillRect(x + 8, y - 59, w * 0.6, 5);
                    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 8, y - 49, w * 0.4, 4);
                    for (let i = 0; i < 3; i++) { ctx.fillStyle = '#334155'; ctx.fillRect(x + 20 + i * 32, y - 84, 2, 6); ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(x + 21 + i * 32, y - 86, 3, 0, TAU); ctx.fill(); }
                } else if (d.k === 2) {
                    const hs = [60, 82, 46], xs = [12, 40, 66];
                    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
                    for (let i = 0; i < 3; i++) {
                        ctx.beginPath(); ctx.moveTo(x + xs[i], y); ctx.lineTo(x + xs[i], y - hs[i]);
                        for (let j = 1; j <= 3; j++) { const yy = y - hs[i] + j * 10; ctx.moveTo(x + xs[i] - 9 + j * 2, yy); ctx.lineTo(x + xs[i] + 9 - j * 2, yy); }
                        ctx.stroke();
                        ctx.fillStyle = ((t * 1.6 + i) % 2) < 1 ? '#ef4444' : '#7f1d1d'; ctx.beginPath(); ctx.arc(x + xs[i], y - hs[i] - 3, 3, 0, TAU); ctx.fill();
                    }
                    ctx.strokeStyle = 'rgba(148,163,184,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + xs[0], y - hs[0]); ctx.quadraticCurveTo(x + 26, y - hs[0] + 18, x + xs[1], y - hs[1]); ctx.quadraticCurveTo(x + 53, y - hs[1] + 22, x + xs[2], y - hs[2]); ctx.stroke();
                } else if (d.k === 3) {
                    ctx.fillStyle = '#78350f'; ctx.fillRect(x, y - 16, w, 16); ctx.fillStyle = '#92400e'; ctx.fillRect(x, y - 16, w, 3); ctx.fillStyle = '#451a03'; ctx.fillRect(x + 10, y - 16, 3, 16); ctx.fillRect(x + w - 13, y - 16, 3, 16);
                    for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#16a34a' : '#22c55e'; ctx.beginPath(); ctx.arc(x + 14 + i * ((w - 28) / 4), y - 22 - (i % 2) * 5, 12 - (i % 3) * 2, 0, TAU); ctx.fill(); }
                    for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[(d.s + i) % 5]; ctx.beginPath(); ctx.arc(x + 20 + i * 22, y - 30 - (i % 2) * 6, 3, 0, TAU); ctx.fill(); }
                } else if (d.k === 4) {
                    ctx.fillStyle = '#475569'; ctx.fillRect(x + 12, y - 10, 6, 10); ctx.fillRect(x + 60, y - 10, 6, 10);
                    ctx.fillStyle = '#94a3b8'; roundRect(ctx, x, y - 26, w - 22, 16, 4); ctx.fill();
                    ctx.fillStyle = '#64748b'; for (let i = 14; i < w - 30; i += 16) ctx.fillRect(x + i, y - 26, 3, 16);
                    ctx.fillStyle = '#94a3b8'; ctx.fillRect(x + w - 40, y - 62, 18, 46);
                    ctx.fillStyle = '#cbd5e1'; ctx.fillRect(x + w - 44, y - 66, 26, 6);
                    ctx.save(); ctx.translate(x + w - 31, y - 76); ctx.rotate(t * 8); ctx.fillStyle = '#475569'; ctx.fillRect(-10, -2, 20, 4); ctx.fillRect(-2, -10, 4, 20); ctx.restore();
                } else if (d.k === 5) {
                    ctx.fillStyle = '#334155'; ctx.fillRect(x + 2, y - 58, 4, 58); ctx.fillRect(x + w - 6, y - 58, 4, 58);
                    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 4, y - 56); ctx.quadraticCurveTo(x + w / 2, y - 48, x + w - 4, y - 56); ctx.stroke();
                    for (let i = 0; i < 4; i++) { const cx2 = x + 14 + i * 24, sw = Math.sin(t * 2 + i) * 2; ctx.fillStyle = cols[(d.s + i) % 5]; ctx.beginPath(); ctx.moveTo(cx2, y - 52); ctx.lineTo(cx2 + 16, y - 52); ctx.lineTo(cx2 + 15 + sw, y - 24); ctx.lineTo(cx2 + 1 + sw, y - 24); ctx.closePath(); ctx.fill(); }
                } else if (d.k === 6) {
                    ctx.fillStyle = '#475569'; ctx.fillRect(x + 6, y - 12, 78, 12);
                    for (const [dx2, s2, ang] of [[24, 17, -0.6], [62, 12, -0.9]]) {
                        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + dx2, y - 12); ctx.lineTo(x + dx2 + 4, y - 12 - s2 * 1.6); ctx.stroke();
                        ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.ellipse(x + dx2 + 6, y - 14 - s2 * 1.8, s2, s2 * 0.5, ang, 0, TAU); ctx.fill();
                        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(x + dx2 + 6, y - 14 - s2 * 1.8, 2.5, 0, TAU); ctx.fill();
                    }
                } else if (d.k === 7) {
                    ctx.fillStyle = '#334155'; roundRect(ctx, x, y - 38, 56, 38, 4); ctx.fill();
                    ctx.fillStyle = '#1e293b'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 8, y - 30 + i * 6, 40, 2);
                    ctx.fillStyle = '#facc15'; for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 14, y - 5, 7, 5);
                    ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 28, y - 38); ctx.lineTo(x + 28, y - 52); ctx.stroke();
                    ctx.fillStyle = ((t * 1.2 + d.s) % 2) < 1 ? '#4ade80' : '#14532d'; ctx.beginPath(); ctx.arc(x + 28, y - 54, 4, 0, TAU); ctx.fill();
                    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 56, y - 14); ctx.quadraticCurveTo(x + 66, y - 2, x + 70, y); ctx.stroke();
                } else {
                    ctx.fillStyle = '#57534e'; ctx.fillRect(x, y - 52, 90, 52);
                    ctx.fillStyle = '#44403c'; ctx.beginPath(); ctx.moveTo(x - 6, y - 52); ctx.lineTo(x + 45, y - 70); ctx.lineTo(x + 96, y - 52); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = '#292524'; ctx.fillRect(x + 12, y - 38, 24, 38);
                    ctx.fillStyle = neon ? '#c4b5fd' : '#fde68a'; ctx.fillRect(x + 52, y - 38, 26, 20);
                    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + 64, y - 38, 2, 20); ctx.fillRect(x + 52, y - 29, 26, 2);
                    ctx.fillStyle = '#a8a29e'; ctx.fillRect(x + 31, y - 20, 3, 3);
                }
            }
        }

        drawLedge(ctx, p, B) {
            ctx.fillStyle = B.ledge; roundRect(ctx, p.x, p.y, p.w, p.h, 3); ctx.fill();
            ctx.fillStyle = B.ledgeTop; ctx.fillRect(p.x, p.y, p.w, 4);
            if (p.bi === 3) { ctx.fillStyle = 'rgba(196,181,253,.35)'; ctx.fillRect(p.x - 3, p.y - 3, p.w + 6, 3); }
            ctx.fillStyle = 'rgba(0,0,0,.28)';
            ctx.beginPath(); ctx.moveTo(p.x + 10, p.y + p.h); ctx.lineTo(p.x + 10 + Math.min(34, p.w / 3), p.y + p.h); ctx.lineTo(p.x + 10, p.y + p.h + 22); ctx.fill();
            ctx.beginPath(); ctx.moveTo(p.x + p.w - 10, p.y + p.h); ctx.lineTo(p.x + p.w - 10 - Math.min(34, p.w / 3), p.y + p.h); ctx.lineTo(p.x + p.w - 10, p.y + p.h + 22); ctx.fill();
            ctx.fillStyle = 'rgba(226,232,240,.5)';
            for (let rx = p.x + 12; rx < p.x + p.w - 8; rx += 26) ctx.fillRect(rx, p.y + 7, 3, 3);
            if (p.w < 120) return;
            const hsh = Math.abs(Math.round(p.x) * 73856093 ^ Math.round(p.y) * 19349663);
            const kind = hsh % 9, px = p.x + 14 + (hsh >> 3) % Math.max(1, p.w - 56);
            if (kind === 0) { ctx.fillStyle = '#64748b'; ctx.fillRect(px, p.y - 14, 28, 14); ctx.fillStyle = '#94a3b8'; ctx.fillRect(px + 3, p.y - 11, 22, 2); ctx.fillRect(px + 3, p.y - 7, 22, 2); }
            else if (kind === 1) { ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, p.y); ctx.lineTo(px, p.y - 34); ctx.moveTo(px - 8, p.y - 26); ctx.lineTo(px + 8, p.y - 26); ctx.moveTo(px - 5, p.y - 18); ctx.lineTo(px + 5, p.y - 18); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(px, p.y - 36, 3, 0, TAU); ctx.fill(); }
            else if (kind === 2) { ctx.fillStyle = '#92400e'; ctx.fillRect(px, p.y - 10, 16, 10); ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(px + 8, p.y - 14, 9, 0, TAU); ctx.fill(); }
            else if (kind === 3) { ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, p.y); ctx.lineTo(px, p.y - 30); ctx.lineTo(px + 14, p.y - 30); ctx.stroke(); ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(px + 14, p.y - 27, 4, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(253,230,138,.15)'; ctx.beginPath(); ctx.arc(px + 14, p.y - 27, 14, 0, TAU); ctx.fill(); }
            else if (kind === 4) { ctx.fillStyle = '#334155'; ctx.fillRect(px, p.y - 22, 20, 22); ctx.fillStyle = '#38bdf8'; ctx.fillRect(px + 4, p.y - 18, 12, 8); }
            else if (kind === 5) { ctx.strokeStyle = '#64748b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, p.y); ctx.lineTo(px + 6, p.y - 22); ctx.stroke(); ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.ellipse(px + 8, p.y - 26, 15, 8, -0.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(px + 8, p.y - 26, 2.5, 0, TAU); ctx.fill(); }
            else if (kind === 6) { ctx.fillStyle = '#7c2d12'; ctx.fillRect(px + 3, p.y - 10, 4, 10); ctx.fillRect(px + 21, p.y - 10, 4, 10); ctx.fillStyle = '#a16207'; roundRect(ctx, px, p.y - 34, 28, 24, 6); ctx.fill(); ctx.fillStyle = '#713f12'; ctx.fillRect(px, p.y - 26, 28, 3); ctx.fillRect(px, p.y - 18, 28, 3); ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.moveTo(px - 2, p.y - 34); ctx.lineTo(px + 14, p.y - 44); ctx.lineTo(px + 30, p.y - 34); ctx.fill(); }
            else if (kind === 7) { ctx.fillStyle = '#475569'; ctx.fillRect(px + 12, p.y - 16, 4, 16); ctx.fillStyle = '#0f172a'; ctx.fillRect(px, p.y - 38, 28, 22); ctx.fillStyle = ((hsh >> 5) & 1) ? '#f472b6' : '#22d3ee'; ctx.fillRect(px + 3, p.y - 35, 22, 3); ctx.fillRect(px + 3, p.y - 28, 14, 3); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(px - 4, p.y - 42, 36, 30); }
            else { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px - 10, p.y - 30); ctx.quadraticCurveTo(px + 20, p.y - 18, px + 50, p.y - 30); ctx.stroke(); const cols = ['#f87171', '#fde047', '#4ade80', '#60a5fa']; for (let i = 0; i < 5; i++) { ctx.fillStyle = cols[i % 4]; ctx.beginPath(); ctx.arc(px - 6 + i * 11, p.y - 27 + Math.sin(i / 4 * Math.PI) * 8, 2.5, 0, TAU); ctx.fill(); } ctx.fillStyle = '#334155'; ctx.fillRect(px - 11, p.y - 34, 3, 34); ctx.fillRect(px + 49, p.y - 34, 3, 34); }
        }

        draw(ctx, w, h) {
            const s = this.s, me = this.me, W = this.WIDTH;
            const k = 1 - Math.exp(-6 * (this.dtLast || 0.016));
            const targetX = w >= W + 120 ? (W - w) / 2 : clamp(me.x + 13 - w / 2, -60, W + 60 - w);
            const targetY = me.y - h * 0.62;
            if (!this.camInit || this.dead > 0.9 || this.snapCam) { this.cam.x = targetX; this.cam.y = targetY; if (!this.camInit) this.camStart = targetY; this.camInit = true; this.snapCam = false; }
            this.cam.x += (targetX - this.cam.x) * k;
            this.cam.y += (targetY - this.cam.y) * k * 0.9;
            const prog = clamp(-(this.cam.y + h * 0.62) / this.summitH, 0, 1) * 4;
            climbBackdrop(ctx, w, h, this.cam, this.camStart, prog, this.anim);
            ctx.save();
            ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
            const left = this.cam.x - 50, right = this.cam.x + w + 50, top = this.cam.y - 60, bottom = this.cam.y + h + 60;
            const seen = (y) => y > top - 300 && y < bottom + 300;
            for (const p of this.drawList) {
                if (p.x > right || p.x + p.w < left || (p.off && !p.blink) || p.y > bottom || p.y + (p.roof ? (p.bodyH || 90) : Math.min(p.h, 1200)) < top) continue;
                const B = SKY_BIOMES[p.bi || 0];
                if (p.wall) {
                    ctx.fillStyle = 'rgba(8,10,28,.88)'; ctx.fillRect(p.x, p.y, p.w, p.h);
                    ctx.fillStyle = 'rgba(148,163,184,.35)'; ctx.fillRect(p.x < 0 ? p.x + p.w - 6 : p.x, p.y, 6, p.h);
                } else if (p.ground) {
                    ctx.fillStyle = '#1e293b'; ctx.fillRect(p.x, p.y, p.w, 400);
                    ctx.fillStyle = '#64748b'; ctx.fillRect(p.x, p.y, p.w, 10);
                } else if (p.roof) {
                    const bodyH = p.bodyH || 90;
                    if (p.bi === 1) {
                        ctx.fillStyle = '#f8fafc'; ctx.fillRect(p.x, p.y + 10, p.w, bodyH - 10);
                        for (let cx = p.x + 20; cx < p.x + p.w; cx += 60) { ctx.beginPath(); ctx.arc(cx, p.y + 12, 30, Math.PI, 0); ctx.fill(); }
                        const g = ctx.createLinearGradient(0, p.y, 0, p.y + bodyH); g.addColorStop(0, 'rgba(186,230,253,0)'); g.addColorStop(1, 'rgba(56,189,248,.55)');
                        ctx.fillStyle = g; ctx.fillRect(p.x, p.y + 10, p.w, bodyH - 10);
                    } else if (p.bi === 2) {
                        ctx.fillStyle = '#44403c'; ctx.fillRect(p.x, p.y, p.w, bodyH);
                        ctx.fillStyle = '#292524'; for (let rx = p.x + 20; rx < p.x + p.w; rx += 40) for (let ry = p.y + 36; ry < p.y + bodyH - 10; ry += 40) { ctx.beginPath(); ctx.arc(rx, ry, 4, 0, TAU); ctx.fill(); }
                        for (let sx = p.x; sx < p.x + p.w; sx += 32) { ctx.fillStyle = (((sx - p.x) / 32) | 0) % 2 ? '#fbbf24' : '#1c1917'; ctx.fillRect(sx, p.y, Math.min(32, p.x + p.w - sx), 9); }
                    } else if (p.bi === 3) {
                        const g = ctx.createLinearGradient(0, p.y, 0, p.y + bodyH); g.addColorStop(0, '#4c1d95'); g.addColorStop(1, '#1e1b4b');
                        ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, bodyH);
                        ctx.fillStyle = 'rgba(196,181,253,.25)'; for (let lx = p.x + 30; lx < p.x + p.w; lx += 70) ctx.fillRect(lx, p.y + 10, 3, bodyH - 10);
                        ctx.fillStyle = '#c4b5fd'; ctx.fillRect(p.x - 3, p.y, p.w + 6, 8);
                    } else {
                        const g = ctx.createLinearGradient(0, p.y, 0, p.y + 400);
                        g.addColorStop(0, '#334155'); g.addColorStop(1, '#0f172a');
                        ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, bodyH);
                        ctx.fillStyle = '#64748b'; ctx.fillRect(p.x - 4, p.y, p.w + 8, 9);
                        ctx.fillStyle = '#475569'; ctx.fillRect(p.x - 4, p.y + 9, p.w + 8, 4);
                        for (let wx = p.x + 18; wx < p.x + p.w - 30; wx += 54) {
                            for (let wy = p.y + 28; wy < p.y + bodyH - 18; wy += 56) {
                                ctx.fillStyle = (hashStr(`${wx}:${wy}`) & 3) === 0 ? '#fde68a' : '#1e293b';
                                ctx.fillRect(wx, wy, 24, 30);
                            }
                        }
                    }
                    this.drawDecor(ctx, p);
                } else if (p.prop) {
                    this.drawProp(ctx, p);
                } else if (p.pipe) {
                    ctx.fillStyle = '#475569'; roundRect(ctx, p.x, p.y, p.w, p.h, 10); ctx.fill();
                    ctx.fillStyle = '#94a3b8'; ctx.fillRect(p.x + 6, p.y + 3, p.w - 12, 4);
                    ctx.fillStyle = '#334155'; for (let fx = p.x + 40; fx < p.x + p.w - 20; fx += 90) ctx.fillRect(fx, p.y - 2, 8, p.h + 4);
                } else if (p.wallJ) {
                    const g = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0); g.addColorStop(0, '#475569'); g.addColorStop(1, '#1e293b');
                    ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
                    ctx.fillStyle = B.ledgeTop; ctx.fillRect(p.x, p.y, p.w, 6);
                    ctx.fillStyle = 'rgba(226,232,240,.35)';
                    for (let ay = Math.max(p.y + 40, Math.floor(top / 60) * 60); ay < Math.min(p.y + p.h - 20, bottom); ay += 60) {
                        const ix = p.x < this.WIDTH / 2 ? p.x + p.w - 8 : p.x + 8;
                        ctx.fillRect(ix - 2, ay, 4, 26);
                    }
                } else if (p.ice) {
                    ctx.fillStyle = '#7dd3fc'; roundRect(ctx, p.x, p.y, p.w, 16, 6); ctx.fill();
                    ctx.fillStyle = '#e0f2fe'; ctx.fillRect(p.x + 6, p.y, p.w - 12, 4);
                } else if (p.belt) {
                    ctx.fillStyle = '#1c1917'; roundRect(ctx, p.x, p.y, p.w, 16, 7); ctx.fill();
                    ctx.fillStyle = '#fbbf24';
                    const off = (this.anim * p.belt * 0.5) % 24;
                    for (let bx = p.x + 8 + (off < 0 ? off + 24 : off); bx < p.x + p.w - 14; bx += 24) {
                        ctx.beginPath(); if (p.belt > 0) { ctx.moveTo(bx, p.y + 3); ctx.lineTo(bx + 8, p.y + 8); ctx.lineTo(bx, p.y + 13); } else { ctx.moveTo(bx + 8, p.y + 3); ctx.lineTo(bx, p.y + 8); ctx.lineTo(bx + 8, p.y + 13); } ctx.fill();
                    }
                } else if (p.crumble) {
                    const shake = p.timer > 0 ? Math.sin(this.anim * 60) * 2 : 0;
                    ctx.fillStyle = '#b45309'; roundRect(ctx, p.x + shake, p.y, p.w, 16, 4); ctx.fill();
                    ctx.fillStyle = '#f59e0b'; ctx.fillRect(p.x + shake + 4, p.y, p.w - 8, 5);
                    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2; ctx.beginPath();
                    for (let cx2 = p.x + 18; cx2 < p.x + p.w - 10; cx2 += 34) { ctx.moveTo(cx2 + shake, p.y + 5); ctx.lineTo(cx2 + 5 + shake, p.y + 10); ctx.lineTo(cx2 + 1 + shake, p.y + 15); }
                    ctx.stroke();
                } else if (p.jt) {
                    this.drawGlass(ctx, p);
                } else if (p.slope) {
                    const lowL = p.slope > 0, hx = lowL ? p.x + p.w : p.x, lx = lowL ? p.x : p.x + p.w;
                    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.moveTo(lx, p.y + p.h); ctx.lineTo(hx, p.y); ctx.lineTo(hx, p.y + p.h); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = 'rgba(148,163,184,.35)'; ctx.lineWidth = 2; ctx.beginPath();
                    for (let k = 1; k < 6; k++) { const t = k / 6; ctx.moveTo(lx + (hx - lx) * t, p.y + p.h - p.h * t); ctx.lineTo(lx + (hx - lx) * t, p.y + p.h); }
                    ctx.stroke();
                    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(lx, p.y + p.h); ctx.lineTo(hx, p.y); ctx.stroke();
                } else if (p.mover) {
                    ctx.fillStyle = 'rgba(56,189,248,.22)'; ctx.fillRect(p.x + 12, p.y + p.h, 14, 14 + Math.sin(this.anim * 20) * 4); ctx.fillRect(p.x + p.w - 26, p.y + p.h, 14, 14 + Math.cos(this.anim * 20) * 4);
                    ctx.fillStyle = '#0369a1'; roundRect(ctx, p.x, p.y + 4, p.w, p.h - 2, 5); ctx.fill();
                    ctx.fillStyle = '#0ea5e9'; roundRect(ctx, p.x, p.y, p.w, p.h - 4, 5); ctx.fill();
                    ctx.fillStyle = '#bae6fd'; ctx.fillRect(p.x + 4, p.y, p.w - 8, 4);
                    ctx.fillStyle = '#fde047'; for (let hx = p.x + 12; hx < p.x + p.w - 8; hx += 22) ctx.fillRect(hx, p.y + 8, 10, 3);
                } else if (p.bi === 1) {
                    ctx.fillStyle = '#bae6fd'; roundRect(ctx, p.x, p.y + 2, p.w, 14, 7); ctx.fill();
                    ctx.fillStyle = '#fff'; roundRect(ctx, p.x, p.y - 2, p.w, 12, 6); ctx.fill();
                } else {
                    this.drawLedge(ctx, p, B);
                }
            }
            for (const c of this.checkpoints) {
                if (c.x > right || c.x < left || !seen(c.y)) continue;
                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(c.x, c.y - 70, 4, 70);
                ctx.fillStyle = this.cp.id >= c.id ? '#34d399' : '#f87171';
                ctx.beginPath(); ctx.moveTo(c.x + 4, c.y - 70); ctx.lineTo(c.x + 38, c.y - 58); ctx.lineTo(c.x + 4, c.y - 44); ctx.fill();
                ctx.textAlign = 'left'; ctx.font = '800 20px system-ui'; ctx.fillStyle = '#fff';
                ctx.fillText(c.id ? `CHECKPOINT ${c.id}` : 'START', c.x + 46, c.y - 52);
            }
            ctx.fillStyle = '#ef4444';
            for (const sp of this.spikes) {
                if (sp.x > right || sp.x + sp.w < left || !seen(sp.y)) continue;
                for (let i = 0; i < sp.w; i += 15) { ctx.beginPath(); ctx.moveTo(sp.x + i, sp.y + sp.h); ctx.lineTo(sp.x + i + 7.5, sp.y); ctx.lineTo(sp.x + i + 15, sp.y + sp.h); ctx.fill(); }
            }
            for (const sp of this.springs) {
                ctx.fillStyle = '#475569'; ctx.fillRect(sp.x, sp.y + 12, sp.w, 4);
                ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sp.x + 6, sp.y + 12);
                for (let i = 0; i < 4; i++) { ctx.lineTo(sp.x + sp.w - 6, sp.y + 10 - i * 2.5); ctx.lineTo(sp.x + 6, sp.y + 8.5 - i * 2.5); }
                ctx.stroke();
                ctx.fillStyle = '#f97316'; roundRect(ctx, sp.x + 2, sp.y - 2, sp.w - 4, 6, 3); ctx.fill();
                ctx.fillStyle = '#fde68a'; ctx.fillRect(sp.x + 8, sp.y - 1, sp.w - 16, 2);
            }
            for (const l of this.lasers) {
                if (l.x > right || l.x < left || !seen(l.y)) continue;
                ctx.fillStyle = '#334155'; roundRect(ctx, l.x - 8, l.y - 10, 26, 14, 4); ctx.fill(); ctx.fillStyle = l.on ? '#f87171' : '#7f1d1d'; ctx.fillRect(l.x + 1, l.y + 2, 8, 3);
                ctx.fillStyle = '#334155'; roundRect(ctx, l.x - 8, l.y + l.h - 4, 26, 14, 4); ctx.fill(); ctx.fillStyle = l.on ? '#f87171' : '#7f1d1d'; ctx.fillRect(l.x + 1, l.y + l.h - 5, 8, 3);
                if (l.on) { ctx.fillStyle = 'rgba(248,113,113,.9)'; ctx.fillRect(l.x, l.y, l.w, l.h); ctx.fillStyle = 'rgba(254,202,202,.5)'; ctx.fillRect(l.x - 5, l.y, l.w + 10, l.h); }
                else { ctx.fillStyle = 'rgba(248,113,113,.18)'; ctx.fillRect(l.x + 3, l.y, 3, l.h); }
            }
            for (const sw of this.saws) {
                if (sw.x > right || sw.x < left || !seen(sw.y)) continue;
                ctx.fillStyle = 'rgba(239,68,68,.18)'; ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r + 14, 0, TAU); ctx.fill();
                ctx.save(); ctx.translate(sw.x, sw.y); ctx.rotate(this.anim * 9);
                ctx.fillStyle = '#e2e8f0';
                for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(sw.r - 3, -5); ctx.lineTo(sw.r + 7, 0); ctx.lineTo(sw.r - 3, 5); ctx.fill(); }
                ctx.beginPath(); ctx.arc(0, 0, sw.r, 0, TAU); ctx.fillStyle = '#94a3b8'; ctx.fill();
                ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, sw.r - 7, 0, TAU); ctx.moveTo(-(sw.r - 7), 0); ctx.lineTo(sw.r - 7, 0); ctx.moveTo(0, -(sw.r - 7)); ctx.lineTo(0, sw.r - 7); ctx.stroke();
                ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
                ctx.restore();
            }
            for (const wz of this.winds) {
                if (wz.y > bottom || wz.y + wz.h < top) continue;
                ctx.strokeStyle = 'rgba(226,232,240,.35)'; ctx.lineWidth = 2;
                for (let i = 0; i < 14; i++) {
                    const sx = (hashStr(`w${wz.y | 0}:${i}`) % wz.w), sy = wz.y + (hashStr(`v${wz.y | 0}:${i}`) % wz.h);
                    const x = wz.x + ((sx + this.anim * wz.fx * 2.2) % wz.w + wz.w) % wz.w;
                    ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + Math.sign(wz.fx) * 46, sy); ctx.stroke();
                }
            }
            for (const b of this.balls) {
                if (b.px > right || b.px < left || !seen(b.y)) continue;
                ctx.strokeStyle = '#64748b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(b.px, b.py); ctx.lineTo(b.x, b.y); ctx.stroke();
                ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(b.px, b.py, 9, 0, TAU); ctx.fill();
                ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
                ctx.fillStyle = '#ef4444';
                for (let i = 0; i < 8; i++) { const a = i * TAU / 8; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, 4, 0, TAU); ctx.fill(); }
            }
            for (const b of this.boxes) {
                if (b.t > 0 || b.x > right || b.x < left || !seen(b.y)) continue;
                const bob = Math.sin(this.anim * 3 + b.x) * 5;
                ctx.fillStyle = 'rgba(250,204,21,' + (0.14 + Math.sin(this.anim * 4 + b.x) * 0.06) + ')'; ctx.beginPath(); ctx.arc(b.x, b.y + bob, 34, 0, TAU); ctx.fill();
                ctx.fillStyle = '#f59e0b'; roundRect(ctx, b.x - 20, b.y - 15 + bob, 40, 36, 9); ctx.fill();
                ctx.fillStyle = '#facc15'; roundRect(ctx, b.x - 18, b.y - 18 + bob, 36, 36, 8); ctx.fill();
                ctx.fillStyle = '#fef08a'; ctx.fillRect(b.x - 14, b.y - 15 + bob, 28, 4);
                ctx.fillStyle = '#92400e'; ctx.font = '900 24px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', b.x, b.y + 9 + bob);
            }
            if (this.tideY < bottom) {
                const tb = Math.min(3, Math.floor(-this.tideY / this.summitH * 4));
                const col = [['#f97316', '#7c2d12'], ['#38bdf8', '#0c4a6e'], ['#ef4444', '#450a0a'], ['#a855f7', '#2e1065']][Math.max(0, tb)];
                const g = ctx.createLinearGradient(0, this.tideY, 0, this.tideY + 500);
                g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.moveTo(left - 10, bottom + 80); ctx.lineTo(left - 10, this.tideY);
                for (let x = left - 10; x <= right + 10; x += 24) ctx.lineTo(x, this.tideY + Math.sin(x * 0.03 + this.anim * 2.4) * 7);
                ctx.lineTo(right + 10, bottom + 80); ctx.closePath(); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,.35)';
                for (let x = left; x <= right; x += 24) ctx.fillRect(x, this.tideY + Math.sin(x * 0.03 + this.anim * 2.4) * 7, 12, 3);
            }
            // summit flag
            const sm = this.summit, sx = sm.x + sm.w / 2;
            if (seen(sm.y)) {
                ctx.fillStyle = '#e2e8f0'; ctx.fillRect(sx - 3, sm.y - 220, 6, 220);
                ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(sx + 3, sm.y - 220); ctx.lineTo(sx + 90, sm.y - 190); ctx.lineTo(sx + 3, sm.y - 160); ctx.fill();
                ctx.fillStyle = '#facc15'; ctx.font = '900 34px system-ui'; ctx.textAlign = 'center';
                ctx.fillText('SUMMIT', sx, sm.y - 250);
            }

            for (const r of s.remoteList()) {
                drawRunner(ctx, r.x, r.y, 26, 44, r, r.f || 1, this.anim + r.x * 0.01, r.a === 1 ? 1 : 0, 0.8);
                nameTag(ctx, r.name || '', r.x + 13, r.y - 14, r.color);
            }
            if (this.dead <= 0) {
                const blink = this.boost > 0 ? 0.7 + Math.sin(this.anim * 20) * 0.3 : 1;
                drawRunner(ctx, me.x, me.y, me.w, me.h, s.local, me.face, this.anim, this.state === 1 ? 1 : 0, blink);
                nameTag(ctx, 'You', me.x + 13, me.y - 14, '#fff');
            }
            this.particles.draw(ctx);
            ctx.restore();
        }
    }

    /* ------------------------------------------------------------------ */
    /* Hammerheart Showdown: platform brawler                              */
    /* ------------------------------------------------------------------ */
    class Duel extends A.BaseGame {
        constructor(s) {
            super(s);
            this.title = 'Hammerheart Showdown';
            this.solids = [
                { x: 300, y: 520, w: 1000, h: 260, main: true },
                { x: 400, y: 390, w: 220, h: 14, oneway: true },
                { x: 980, y: 390, w: 220, h: 14, oneway: true },
                { x: 690, y: 270, w: 220, h: 14, oneway: true }
            ];
            this.me = { x: 790, y: 200, w: 34, h: 56, vx: 0, vy: 0, face: 1 };
            const spawns = [[480, 440], [1080, 440], [790, 200], [790, 460]];
            this.spawn = spawns[hashStr(s.user.id) % spawns.length];
            this.me.x = this.spawn[0]; this.me.y = this.spawn[1] - 60;
            this.dmg = 0; this.stun = 0; this.invuln = 1.5; this.swingT = 0; this.swingCd = 0;
            this.guard = false; this.airJumps = 1; this.coyote = 0; this.hammer = 0; this.kos = 0; this.respawn = 0;
            this.lastHit = { by: null, at: 0 }; this.anim = 0; this.orb = { x: 800, y: 150, t: 0 }; this.state = 0; this.shake = 0;
            this.hitFlash = 0; this.view = { z: 1 };
            this.hillTick = 0; this.hillState = 'away';
            this.zones = [
                { x: 690, y: 270, w: 220, name: 'Top ledge' }, { x: 640, y: 520, w: 320, name: 'Center stage' },
                { x: 400, y: 390, w: 220, name: 'Left ledge' }, { x: 980, y: 390, w: 220, name: 'Right ledge' }
            ];
            this.res = new A.Resource('Energy', '#fb7185', 100, 60, 2);
        }

        // The hill moves every 20 seconds; all clients derive it from the shared start time
        hill() {
            const elapsed = Math.max(0, Date.now() - this.s.startedAt) / 1000;
            const index = Math.floor(elapsed / 20) % this.zones.length;
            return { zone: this.zones[index], left: 20 - (elapsed % 20) };
        }

        inHill(body, zone) {
            const cx = body.x + 17, feet = body.y + 56;
            return cx > zone.x && cx < zone.x + zone.w && Math.abs(feet - zone.y) < 14;
        }

        update(dt) {
            const s = this.s, me = this.me;
            this.anim += dt; this.shake = Math.max(0, this.shake - dt); this.hitFlash = Math.max(0, this.hitFlash - dt);
            this.orb.t = Math.max(0, this.orb.t - dt);
            this.invuln = Math.max(0, this.invuln - dt);
            this.hammer = Math.max(0, this.hammer - dt);
            this.swingCd -= dt; this.swingT = Math.max(0, this.swingT - dt); this.stun = Math.max(0, this.stun - dt);
            if (this.respawn > 0) {
                this.respawn -= dt;
                if (this.respawn <= 0) {
                    const sp = this.spawn;
                    me.x = sp[0]; me.y = sp[1] - 60; me.vx = me.vy = 0; this.dmg = 0; this.invuln = 2.2; this.hammer = 0;
                }
                this.state = 5; this.particles.update(dt, 500);
                return;
            }
            const ax = this.stun > 0 ? 0 : s.axis().x;
            this.guard = this.stun <= 0 && s.down('KeyS', 'ArrowDown', 'ShiftLeft', 'ShiftRight') && me.onGround;
            const target = this.guard ? 0 : ax * 320;
            const acc = (me.onGround ? 3000 : 1500) * dt;
            me.vx += clamp(target - me.vx, -acc, acc);
            if (ax && this.swingT <= 0) me.face = ax;
            me.vy = Math.min(1200, me.vy + 2400 * dt);
            if (me.onGround) { this.airJumps = 1; this.coyote = 0.1; } else this.coyote -= dt;
            if (this.stun <= 0 && s.pressed('Space', 'KeyW', 'ArrowUp')) {
                if (this.coyote > 0) { me.vy = -900; this.coyote = 0; s.sfx('jump'); }
                else if (this.airJumps > 0) { me.vy = -820; this.airJumps--; s.sfx('jump'); this.particles.burst(me.x + 17, me.y + 56, '#bae6fd', 8, 120, 0.3, 4); }
            }
            if (this.stun <= 0 && !this.guard && this.swingCd <= 0 && (s.mouse.pressed || s.pressed('KeyJ', 'KeyK')) && s.spend(8)) {
                this.swingT = 0.22; this.swingCd = 0.5; s.sfx('dash');
                s.emit({ k: 'sw', x: Math.round(me.x + 17), y: Math.round(me.y + 28), d: me.face, p: this.hammer > 0 ? 1.6 : 1, by: s.user.id, c: (this.dmg | 0) });
                this.particles.burst(me.x + 17 + me.face * 70, me.y + 28, '#fde68a', 8, 200, 0.25, 4);
            }
            moveBody(me, this.solids, dt);
            const drag = me.onGround ? 1 : 0;
            if (drag && this.stun > 0) me.vx *= 0.92;

            if (this.orb.t <= 0 && dist(me.x + 17, me.y + 28, this.orb.x, this.orb.y) < 44) {
                const opened = s.ask(correct => {
                    if (correct) { this.hammer = 10; this.dmg = Math.max(0, this.dmg - 25); s.refill(); s.addScore(40); s.toast('Heart Hammer! Hits hit harder', '#f472b6'); }
                    else if (correct === false) s.toast('Missed the power-up', '#f87171');
                });
                if (opened) this.orb.t = 1e9;
            }
            if (me.x < -150 || me.x > 1750 || me.y > 950 || me.y < -500) this.ko();
            if (!s.question && this.respawn <= 0) {
                const zone = this.hill().zone;
                const mine = this.inHill(me, zone);
                const rivals = s.remoteList().some(r => r.a !== 5 && this.inHill({ x: r.x, y: r.y }, zone));
                this.hillState = !mine ? 'away' : rivals ? 'contested' : 'holding';
                if (this.hillState === 'holding') {
                    this.hillTick += dt;
                    if (this.hillTick >= 1) { this.hillTick -= 1; s.addScore(12); s.sfx('coin', 300); this.particles.burst(me.x + 17, me.y, '#fde047', 4, 120, 0.4, 3); }
                } else this.hillTick = 0;
            }
            this.state = this.guard ? 4 : this.swingT > 0 ? 3 : !me.onGround ? 2 : Math.abs(me.vx) > 40 ? 1 : 0;
            this.particles.update(dt, 300);
        }

        screenToWorldX(sx) { return (sx - this.offX) / this.view.z; }

        ko() {
            const s = this.s;
            this.particles.burst(this.me.x, this.me.y, s.local.color, 30, 500, 0.8, 6); s.sfx('boom');
            const by = Date.now() - this.lastHit.at < 6000 ? this.lastHit.by : null;
            s.emit({ k: 'ko', to: s.user.id, by });
            this.respawn = 1.4; this.shake = 0.4; this.dmg = 0; this.lastHit = { by: null, at: 0 };
        }

        onEvent(ev, from) {
            const s = this.s, me = this.me;
            if (ev.k === 'sw') {
                from.swing = performance.now();
                if (this.respawn > 0 || this.invuln > 0 || this.stun > 0.2) return;
                const cx = ev.x, cy = ev.y;
                const box = { x: ev.d > 0 ? cx : cx - 125, y: cy - 50, w: 125, h: 90 };
                if (!overlap(box, me)) return;
                const power = ev.p || 1;
                const blocked = this.guard && me.face === -ev.d;
                const base = 9 * power;
                const taken = blocked ? base * 0.3 : base;
                this.dmg += taken;
                const force = (280 + this.dmg * 9) * power * (blocked ? 0.25 : 1);
                me.vx = ev.d * force; me.vy = blocked ? 0 : -(100 + this.dmg * 2);
                me.onGround = false;
                this.stun = blocked ? 0.08 : clamp(0.2 + this.dmg / 400, 0.2, 0.55);
                this.hitFlash = 0.2; this.shake = 0.18; s.sfx(blocked ? 'click' : 'hit', 60);
                this.lastHit = { by: ev.by, at: Date.now() };
                this.particles.burst(me.x + 17, me.y + 28, blocked ? '#7dd3fc' : '#fca5a5', 14, 260, 0.4, 5);
                s.emit({ k: 'hit', by: ev.by, blocked });
            } else if (ev.k === 'hit' && ev.by === s.user.id) {
                s.addScore(ev.blocked ? 3 : 10); s.sfx('pop', 60);
                this.particles.burst(from.x + 17, from.y + 28, '#fde68a', 8, 200, 0.3, 4);
            } else if (ev.k === 'ko' && ev.by === s.user.id) {
                this.kos++; s.addScore(100); s.sfx('win'); s.toast(`KO! ${from.name} launched out`, '#facc15');
            }
        }

        net() {
            const m = this.me;
            return { x: Math.round(m.x), y: Math.round(m.y), vx: Math.round(m.vx), vy: Math.round(m.vy), f: m.face, a: this.state, ex: { d: Math.round(this.dmg), h: this.hammer > 0 ? 1 : 0, i: this.invuln > 0 ? 1 : 0 } };
        }

        goalText() { return `${this.kos} KOs · ${Math.round(this.dmg)}% damage`; }
        hint() { return 'A/D move · Space jump · Click swing where you face · Shift guard · hold the glowing hill alone to score · Q = recharge'; }

        drawFighter(ctx, x, y, who, face, state, dmg, name, hammer, swingAge, alpha, you) {
            const color = who.color;
            drawRunner(ctx, x, y, 34, 56, who, face, this.anim, state === 1 ? 1 : 0, alpha);
            const cx = x + 34 / 2, cy = y + 30;
            const swinging = state === 3 || swingAge < 0.22;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(face, 1);
            const angle = swinging ? -1.2 + Math.min(1, (swingAge < 0.22 ? swingAge / 0.22 : 0.5)) * 2.6 : -0.5;
            ctx.rotate(angle);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#92400e'; ctx.fillRect(0, -3, 62, 6);
            ctx.fillStyle = hammer ? '#f472b6' : '#9ca3af'; roundRect(ctx, 52, -17, 30, 34, 6); ctx.fill();
            if (swinging) { ctx.strokeStyle = 'rgba(253,230,138,.6)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 80, -1, 1); ctx.stroke(); }
            ctx.restore();
            if (state === 4) { ctx.strokeStyle = 'rgba(125,211,252,.85)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, TAU); ctx.stroke(); }
            nameTag(ctx, `${you ? 'You' : name} · ${Math.round(dmg)}%`, cx, y - 14, you ? '#fff' : color);
        }

        draw(ctx, w, h) {
            const s = this.s, me = this.me;
            const z = Math.min(w / 1700, h / 900);
            this.view.z = z;
            this.offX = (w - 1600 * z) / 2;
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, '#0b1230'); g.addColorStop(1, '#3b1a5c');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 70; i++) {
                ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.12})`;
                ctx.fillRect((hashStr(`st${i}`) % 1000) / 1000 * w, (hashStr(`sy${i}`) % 600) / 600 * h * 0.8, 2, 2);
            }
            ctx.save();
            const sh = this.shake > 0 ? 8 : 0;
            ctx.translate(this.offX + (Math.random() - 0.5) * sh, h * 0.14 + (Math.random() - 0.5) * sh);
            ctx.scale(z, z);
            for (const p of this.solids) {
                if (p.main) {
                    ctx.fillStyle = '#1f2937'; ctx.fillRect(p.x, p.y, p.w, p.h);
                    ctx.fillStyle = '#6366f1'; ctx.fillRect(p.x, p.y, p.w, 12);
                    ctx.fillStyle = '#4338ca'; ctx.fillRect(p.x, p.y + 12, p.w, 6);
                } else {
                    ctx.fillStyle = '#818cf8'; roundRect(ctx, p.x, p.y, p.w, p.h, 6); ctx.fill();
                }
            }
            const hill = this.hill();
            const hz = hill.zone;
            const pulse = 0.25 + Math.sin(this.anim * 4) * 0.08;
            ctx.fillStyle = this.hillState === 'holding' ? `rgba(250,204,21,${pulse + 0.2})` : this.hillState === 'contested' ? `rgba(248,113,113,${pulse + 0.15})` : `rgba(250,204,21,${pulse})`;
            ctx.fillRect(hz.x, hz.y - 150, hz.w, 150);
            ctx.strokeStyle = '#facc15'; ctx.lineWidth = 4; ctx.strokeRect(hz.x, hz.y - 150, hz.w, 150);
            ctx.fillStyle = '#fef08a'; ctx.font = '900 22px system-ui'; ctx.textAlign = 'center';
            ctx.fillText(`♛ HILL · ${Math.ceil(hill.left)}s`, hz.x + hz.w / 2, hz.y - 160);
            if (this.orb.t <= 0) {
                const bob = Math.sin(this.anim * 3) * 8;
                ctx.shadowColor = '#f472b6'; ctx.shadowBlur = 24;
                ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.arc(this.orb.x, this.orb.y + bob, 24, 0, TAU); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff'; ctx.font = '900 26px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', this.orb.x, this.orb.y + bob + 9);
            }
            for (const r of s.remoteList()) {
                if (r.a === 5) continue;
                const swingAge = r.swing ? (performance.now() - r.swing) / 1000 : 9;
                this.drawFighter(ctx, r.x, r.y, r, r.f || 1, r.a, r.ex?.d || 0, r.name, r.ex?.h, swingAge, r.ex?.i ? 0.5 : 0.95, false);
            }
            if (this.respawn <= 0) {
                const alpha = this.invuln > 0 ? 0.55 + Math.sin(this.anim * 22) * 0.25 : 1;
                this.drawFighter(ctx, me.x, me.y, s.local, me.face, this.state, this.dmg, 'You', this.hammer > 0, this.swingT > 0 ? 0.22 - this.swingT : 9, alpha, true);
                if (this.hitFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(me.x, me.y, me.w, me.h); }
            }
            this.particles.draw(ctx);
            ctx.restore();
        }
    }

    /* ------------------------------------------------------------------ */
    /* Starfall Blasters: top-down twin-stick arena shooter                */
    /* ------------------------------------------------------------------ */
    class Shooter extends A.BaseGame {
        constructor(s) {
            super(s);
            this.title = 'Starfall Blasters';
            this.touchBlast = true; this.touchMain = 'Dash';
            this.scoreGoal = false;
            this.W = 2600; this.H = 1700;
            const r = mulberry32(s.seed);
            this.walls = [
                { x: -60, y: -60, w: this.W + 120, h: 60 }, { x: -60, y: this.H, w: this.W + 120, h: 60 },
                { x: -60, y: 0, w: 60, h: this.H }, { x: this.W, y: 0, w: 60, h: this.H }
            ];
            this.cover = [];
            for (let i = 0; i < 20; i++) {
                const horizontal = r() < 0.5;
                const wall = { x: 200 + r() * (this.W - 500), y: 200 + r() * (this.H - 450), w: horizontal ? 160 + r() * 200 : 50, h: horizontal ? 50 : 160 + r() * 200 };
                if (dist(wall.x + wall.w / 2, wall.y + wall.h / 2, this.W / 2, this.H / 2) < 260) continue;
                this.cover.push(wall);
            }
            this.walls.push(...this.cover);
            this.orbs = [];
            for (let i = 0; i < 8; i++) this.orbs.push({ x: 250 + r() * (this.W - 500), y: 250 + r() * (this.H - 500), t: 0 });
            this.orbs = this.orbs.filter(o => !this.walls.some(w => o.x > w.x - 40 && o.x < w.x + w.w + 40 && o.y > w.y - 40 && o.y < w.y + w.h + 40));
            this.me = { x: 0, y: 0, r: 16, vx: 0, vy: 0, aim: 0 };
            this.respawnAt();
            this.hp = 100; this.maxHp = 100; this.dead = 0; this.invuln = 2;
            this.bullets = []; this.drones = []; this.packs = []; this.spawnT = 1.5; this.fireCd = 0;
            this.dashT = 0; this.dashCd = 0; this.nova = 0; this.novaCd = 0; this.overdrive = 0; this.jam = 0; this.kills = 0; this.pk = 0; this.deaths = 0;
            this.res = new A.Resource('Ammo', '#67e8f9', 150, 60, 3);
            this.cam = { x: this.me.x, y: this.me.y }; this.anim = 0; this.shake = 0; this.hitmark = 0; this.flash = 0; this.dx = 1; this.dy = 0;
            s.canvas.style.cursor = 'none';
        }

        respawnAt() {
            const r = Math.random;
            for (let i = 0; i < 30; i++) {
                const x = 150 + r() * (this.W - 300), y = 150 + r() * (this.H - 300);
                const c = { x, y, r: 24 };
                if (this.walls.some(w => overlap({ x: x - 24, y: y - 24, w: 48, h: 48 }, w))) continue;
                if (this.s.remoteList().some(p => dist(p.x, p.y, x, y) < 350)) continue;
                this.me.x = c.x; this.me.y = c.y; return;
            }
            this.me.x = this.W / 2; this.me.y = this.H / 2;
        }

        spawnDrone() {
            const r = Math.random;
            const wave = 1 + Math.floor(this.s.t / 35);
            const shooter = this.s.t > 25 && r() < Math.min(0.4, 0.12 + wave * 0.04);
            const heavy = !shooter && this.s.t > 60 && r() < 0.15;
            for (let i = 0; i < 12; i++) {
                const ang = r() * TAU, d = 650 + r() * 250;
                const x = clamp(this.me.x + Math.cos(ang) * d, 80, this.W - 80), y = clamp(this.me.y + Math.sin(ang) * d, 80, this.H - 80);
                if (this.walls.some(w => overlap({ x: x - 20, y: y - 20, w: 40, h: 40 }, w))) continue;
                this.drones.push({ x, y, r: heavy ? 24 : 16, hp: shooter ? 60 : heavy ? 120 : 30, max: shooter ? 60 : heavy ? 120 : 30, heavy, shooter, fire: 1 + r() * 1.5, vx: 0, vy: 0, hit: 0, ph: r() * 6 });
                return;
            }
        }

        fire(angle, speed, own, by, dmg, color) {
            this.bullets.push({ x: this.me.x + Math.cos(angle) * 24, y: this.me.y + Math.sin(angle) * 24, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.9, own, by, dmg, color });
        }

        update(dt) {
            const s = this.s, me = this.me;
            this.anim += dt; this.shake = Math.max(0, this.shake - dt); this.hitmark = Math.max(0, this.hitmark - dt); this.flash = Math.max(0, this.flash - dt);
            this.overdrive = Math.max(0, this.overdrive - dt); this.jam = Math.max(0, this.jam - dt);
            this.invuln = Math.max(0, this.invuln - dt); this.fireCd -= dt; this.dashCd -= dt; this.novaCd -= dt; this.nova = Math.max(0, this.nova - dt);
            const zoom = this.zoom || 1;
            const mx = this.cam.x + (s.mouse.x - s.vw / 2) / zoom, my = this.cam.y + (s.mouse.y - s.vh / 2) / zoom;
            this.mouseWorld = { x: mx, y: my };

            if (this.dead > 0) {
                this.dead -= dt;
                if (this.dead <= 0) { this.respawnAt(); this.hp = 100; this.invuln = 2; this.drones = this.drones.filter(d => dist(d.x, d.y, me.x, me.y) > 500); }
            } else {
                me.aim = Math.atan2(my - me.y, mx - me.x);
                // On phones the Hit button fires at the nearest target unless you just tapped the screen to aim
                if (s.overlay?.classList.contains('has-touch') && s.keys.has('KeyJ') && performance.now() - (s.mouse.touchAt || 0) > 1500) {
                    let best = null, bd = 900;
                    for (const t of [...this.drones, ...s.remoteList()]) { const d = dist(t.x, t.y, me.x, me.y); if (d < bd && !t.dead) { bd = d; best = t; } }
                    if (best) me.aim = Math.atan2(best.y - me.y, best.x - me.x);
                }
                const a = s.axis();
                const len = Math.hypot(a.x, a.y) || 1;
                const speed = this.dashT > 0 ? 760 : 270;
                const tx = this.dashT > 0 ? this.dx * speed : (a.x / len) * speed * (a.x || a.y ? 1 : 0);
                const ty = this.dashT > 0 ? this.dy * speed : (a.y / len) * speed * (a.x || a.y ? 1 : 0);
                const acc = 2600 * dt;
                me.vx += clamp(tx - me.vx, -acc, acc); me.vy += clamp(ty - me.vy, -acc, acc);
                if (a.x || a.y) { this.dx = a.x / len; this.dy = a.y / len; }
                if (s.pressed('Space', 'ShiftLeft') && this.dashCd <= 0) { this.dashT = 0.16; this.dashCd = 1.1; this.invuln = Math.max(this.invuln, 0.2); this.particles.burst(me.x, me.y, '#7dd3fc', 12, 200, 0.3, 4); }
                if (s.pressed('KeyE') && this.novaCd <= 0 && s.spend(30)) {
                    this.novaCd = 7; this.nova = 0.45;                     this.shake = 0.25; s.sfx('boom'); this.particles.burst(me.x, me.y, '#67e8f9', 40, 520, 0.5, 5);
                    for (const d of this.drones) if (dist(d.x, d.y, me.x, me.y) < 280) { d.hp -= 60; d.hit = 0.2; const a = Math.atan2(d.y - me.y, d.x - me.x); d.vx = Math.cos(a) * 500; d.vy = Math.sin(a) * 500; if (d.hp <= 0) this.killDrone(d); }
                    this.bullets = this.bullets.filter(b => b.own || dist(b.x, b.y, me.x, me.y) > 280);
                }
                this.dashT = Math.max(0, this.dashT - dt);
                me.x += me.vx * dt; me.y += me.vy * dt;
                for (const w of this.walls) pushCircleOutOfRect(me, w);
                const cd = this.overdrive > 0 ? 0.075 : 0.16;
                if ((s.mouse.down || s.down('KeyJ')) && this.fireCd <= 0 && this.jam <= 0 && s.spend(1)) {
                    this.fireCd = cd; s.sfx('shoot', 40);
                    const spread = (Math.random() - 0.5) * (this.overdrive > 0 ? 0.1 : 0.04);
                    this.fire(me.aim + spread, 950, true, s.user.id, 25, '#67e8f9');
                    s.emit({ k: 'sh', x: Math.round(me.x + Math.cos(me.aim) * 24), y: Math.round(me.y + Math.sin(me.aim) * 24), a: +(me.aim + spread).toFixed(3), by: s.user.id });
                    me.vx -= Math.cos(me.aim) * 25; me.vy -= Math.sin(me.aim) * 25;
                    this.shake = Math.max(this.shake, 0.05); this.muzzle = 0.05;
                }
                for (const o of this.orbs) {
                    o.t = Math.max(0, o.t - dt);
                    if (o.t <= 0 && dist(me.x, me.y, o.x, o.y) < 34) {
                        const opened = s.ask(correct => {
                            if (correct) { this.overdrive = 12; this.hp = Math.min(this.maxHp, this.hp + 40); s.refill(); s.addScore(30); s.toast('Overdrive! Rapid fire + repair', '#67e8f9'); }
                            else if (correct === false) { this.jam = 2; s.toast('Blaster jammed!', '#f87171'); }
                        });
                        if (opened) o.t = 1e9;
                    }
                }
                for (const p of this.packs) if (dist(me.x, me.y, p.x, p.y) < 30) { this.hp = Math.min(this.maxHp, this.hp + 25); p.gone = true; this.particles.burst(p.x, p.y, '#4ade80', 10, 120, 0.4, 4); }
                this.packs = this.packs.filter(p => !p.gone);
            }
            this.muzzle = Math.max(0, (this.muzzle || 0) - dt);

            // drones
            if (this.dead <= 0) {
                this.spawnT -= dt;
                const cap = Math.min(22, 5 + Math.floor(s.t / 12));
                if (this.spawnT <= 0 && this.drones.length < cap) { this.spawnDrone(); this.spawnT = Math.max(0.5, 1.9 - s.t / 100); }
            }
            const targets = this.dead > 0 ? null : me;
            for (const d of this.drones) {
                d.hit = Math.max(0, d.hit - dt);
                if (!targets) { d.vx *= 0.95; d.vy *= 0.95; }
                else {
                    const dx = me.x - d.x, dy = me.y - d.y, dd = Math.hypot(dx, dy) || 1;
                    let wantX = dx / dd, wantY = dy / dd, sp = d.shooter ? 130 : d.heavy ? 95 : 150 + Math.min(70, s.t * 0.4);
                    if (d.shooter) {
                        if (dd < 300) { wantX = -dx / dd * 0.6 + -dy / dd * 0.8; wantY = -dy / dd * 0.6 + dx / dd * 0.8; }
                        d.fire -= dt;
                        if (d.fire <= 0 && dd < 650) {
                            d.fire = 1.8; const ang = Math.atan2(dy, dx);
                            this.bullets.push({ x: d.x, y: d.y, vx: Math.cos(ang) * 340, vy: Math.sin(ang) * 340, life: 2.2, own: false, enemy: true, dmg: 10, color: '#f87171' });
                        }
                    }
                    for (const o of this.drones) {
                        if (o === d) continue;
                        const ox = d.x - o.x, oy = d.y - o.y, od = Math.hypot(ox, oy);
                        if (od > 0 && od < 40) { wantX += ox / od * 0.8; wantY += oy / od * 0.8; }
                    }
                    d.vx = lerp(d.vx, wantX * sp, 0.08); d.vy = lerp(d.vy, wantY * sp, 0.08);
                    if (dd < d.r + me.r && this.invuln <= 0) this.damage(15, null, d);
                }
                d.x += d.vx * dt; d.y += d.vy * dt;
                for (const w of this.cover) pushCircleOutOfRect(d, w);
            }

            // bullets
            for (const b of this.bullets) {
                b.life -= dt;
                const steps = 2;
                for (let i = 0; i < steps && b.life > 0; i++) {
                    b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
                    if (this.walls.some(w => b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h)) { b.life = 0; this.particles.burst(b.x, b.y, '#94a3b8', 4, 80, 0.2, 3); break; }
                    if (b.own) {
                        for (const d of this.drones) {
                            if (d.hp > 0 && dist(b.x, b.y, d.x, d.y) < d.r + 4) {
                                d.hp -= b.dmg; d.hit = 0.1; b.life = 0; this.hitmark = 0.12;
                                this.particles.burst(b.x, b.y, '#fde68a', 5, 120, 0.25, 3);
                                if (d.hp <= 0) this.killDrone(d);
                                break;
                            }
                        }
                    } else if (this.dead <= 0 && this.invuln <= 0 && dist(b.x, b.y, me.x, me.y) < me.r + 4) {
                        b.life = 0;
                        this.damage(b.dmg, b.by, null);
                    }
                }
            }
            this.bullets = this.bullets.filter(b => b.life > 0);
            this.drones = this.drones.filter(d => d.hp > 0);

            const tx = me.x + (this.mouseWorld.x - me.x) * 0.18, ty = me.y + (this.mouseWorld.y - me.y) * 0.18;
            this.cam.x = lerp(this.cam.x, tx, 0.14); this.cam.y = lerp(this.cam.y, ty, 0.14);
            s.setGoal(this.kills + this.pk * 3);
            this.particles.update(dt, 0);
        }

        killDrone(d) {
            this.kills++;
            this.s.addScore(d.heavy ? 30 : d.shooter ? 15 : 10); this.s.sfx('pop', 50);
            this.particles.burst(d.x, d.y, d.shooter ? '#f97316' : '#a78bfa', 16, 260, 0.5, 5);
            if (Math.random() < (d.heavy ? 0.6 : 0.14)) this.packs.push({ x: d.x, y: d.y });
        }

        damage(amount, by, drone) {
            if (this.overdrive > 0) amount *= 0.5;
            this.hp -= amount; this.flash = 0.2; this.shake = 0.2; this.s.sfx('hit', 80);
            this.particles.burst(this.me.x, this.me.y, '#f87171', 8, 160, 0.3, 4);
            if (drone) { this.invuln = 0.5; const a = Math.atan2(this.me.y - drone.y, this.me.x - drone.x); this.me.vx += Math.cos(a) * 320; this.me.vy += Math.sin(a) * 320; drone.vx = -Math.cos(a) * 200; drone.vy = -Math.sin(a) * 200; }
            if (by) this.s.emit({ k: 'hit', by });
            if (this.hp <= 0) {
                this.dead = 2; this.deaths++;
                this.particles.burst(this.me.x, this.me.y, this.s.local.color, 30, 380, 0.8, 6);
                this.s.emit({ k: 'ko', by: by || null, to: this.s.user.id });
            }
        }

        onEvent(ev, from) {
            const s = this.s;
            if (ev.k === 'sh') {
                this.bullets.push({ x: ev.x, y: ev.y, vx: Math.cos(ev.a) * 950, vy: Math.sin(ev.a) * 950, life: 0.9, own: false, by: ev.by, dmg: 20, color: from.color });
                from.muzzle = performance.now();
            } else if (ev.k === 'hit' && ev.by === s.user.id) { s.addScore(4); this.hitmark = 0.15; }
            else if (ev.k === 'ko' && ev.by === s.user.id) { this.pk++; s.addScore(100); s.toast(`You eliminated ${from.name}!`, '#facc15'); }
        }

        net() {
            const m = this.me;
            return { x: Math.round(m.x), y: Math.round(m.y), vx: Math.round(m.vx), vy: Math.round(m.vy), f: +m.aim.toFixed(2), a: this.dead > 0 ? 1 : 0, hp: Math.round(this.hp), ex: { o: this.overdrive > 0 ? 1 : 0 } };
        }

        goalText() { return `${this.kills} drones · ${this.pk} players · HP ${Math.max(0, Math.round(this.hp))}`; }
        hint() { return 'WASD move · mouse aim · click fire · Space dash · E = shockwave · Q = reload'; }

        drawShip(ctx, x, y, aim, who, hp, name, you, alpha = 1, over = false) {
            const color = who.color;
            ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
            if (over) { ctx.strokeStyle = 'rgba(103,232,249,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.stroke(); }
            ctx.save(); ctx.rotate(aim);
            ctx.fillStyle = '#0f172a'; ctx.fillRect(8, -4, 22, 8);
            ctx.fillStyle = '#e2e8f0'; ctx.fillRect(26, -3, 6, 6);
            ctx.restore();
            ctx.restore();
            A.util.drawFigureTop(ctx, who, x, y, 16, aim, this.anim || 0, alpha);
            if (hp !== undefined) {
                ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 22, y + 24, 44, 5);
                ctx.fillStyle = hp > 40 ? '#4ade80' : '#f87171'; ctx.fillRect(x - 22, y + 24, 44 * clamp(hp / 100, 0, 1), 5);
            }
            nameTag(ctx, you ? 'You' : name, x, y - 28, you ? '#fff' : color);
        }

        draw(ctx, w, h) {
            const s = this.s, me = this.me;
            const zoom = this.zoom = clamp(h / 900, 0.7, 1.2);
            ctx.fillStyle = '#070b17'; ctx.fillRect(0, 0, w, h);
            ctx.save();
            const sh = this.shake > 0 ? 7 : 0;
            ctx.translate(w / 2 + (Math.random() - 0.5) * sh, h / 2 + (Math.random() - 0.5) * sh);
            ctx.scale(zoom, zoom);
            ctx.translate(-this.cam.x, -this.cam.y);
            const x0 = this.cam.x - w / zoom / 2, y0 = this.cam.y - h / zoom / 2;
            ctx.fillStyle = '#0d1428'; ctx.fillRect(0, 0, this.W, this.H);
            ctx.strokeStyle = 'rgba(99,102,241,.14)'; ctx.lineWidth = 1;
            ctx.beginPath();
            for (let gx = Math.max(0, Math.floor(x0 / 80) * 80); gx < Math.min(this.W, x0 + w / zoom + 80); gx += 80) { ctx.moveTo(gx, Math.max(0, y0)); ctx.lineTo(gx, Math.min(this.H, y0 + h / zoom + 80)); }
            for (let gy = Math.max(0, Math.floor(y0 / 80) * 80); gy < Math.min(this.H, y0 + h / zoom + 80); gy += 80) { ctx.moveTo(Math.max(0, x0), gy); ctx.lineTo(Math.min(this.W, x0 + w / zoom + 80), gy); }
            ctx.stroke();
            for (const wl of this.walls) {
                if (wl.x > x0 + w / zoom + 50 || wl.x + wl.w < x0 - 50 || wl.y > y0 + h / zoom + 50 || wl.y + wl.h < y0 - 50) continue;
                ctx.fillStyle = '#1e293b'; ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
                ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 3; ctx.strokeRect(wl.x + 1.5, wl.y + 1.5, wl.w - 3, wl.h - 3);
            }
            for (const o of this.orbs) {
                if (o.t > 0) continue;
                const pulse = 1 + Math.sin(this.anim * 4) * 0.12;
                ctx.shadowColor = '#facc15'; ctx.shadowBlur = 22;
                ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(o.x, o.y, 20 * pulse, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
                ctx.fillStyle = '#78350f'; ctx.font = '900 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', o.x, o.y + 8);
            }
            for (const p of this.packs) { ctx.fillStyle = '#4ade80'; ctx.fillRect(p.x - 10, p.y - 3, 20, 6); ctx.fillRect(p.x - 3, p.y - 10, 6, 20); }
            for (const d of this.drones) {
                ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(this.anim * 2 + d.ph);
                ctx.fillStyle = d.hit > 0 ? '#fff' : d.shooter ? '#f97316' : '#8b5cf6';
                ctx.beginPath();
                for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.lineTo(Math.cos(a) * d.r, Math.sin(a) * d.r); }
                ctx.fill();
                ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
                ctx.fillStyle = d.shooter ? '#fde68a' : '#ddd6fe'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
                ctx.restore();
            }
            for (const b of this.bullets) {
                ctx.strokeStyle = b.color; ctx.lineWidth = b.enemy ? 5 : 4; ctx.lineCap = 'round';
                ctx.globalAlpha = 0.9;
                ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025); ctx.lineTo(b.x, b.y); ctx.stroke();
                ctx.globalAlpha = 1;
            }
            for (const r of s.remoteList()) {
                if (r.a === 1) continue;
                this.drawShip(ctx, r.x, r.y, r.f || 0, r, r.hp, r.name, false, 0.95, r.ex?.o);
            }
            if (this.dead <= 0) {
                const alpha = this.invuln > 0 ? 0.55 + Math.sin(this.anim * 24) * 0.3 : 1;
                this.drawShip(ctx, me.x, me.y, me.aim, s.local, this.hp, 'You', true, alpha, this.overdrive > 0);
                if (this.muzzle > 0) { ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(me.x + Math.cos(me.aim) * 34, me.y + Math.sin(me.aim) * 34, 9, 0, TAU); ctx.fill(); }
                ctx.strokeStyle = 'rgba(103,232,249,.22)'; ctx.setLineDash([8, 10]); ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(me.x + Math.cos(me.aim) * 30, me.y + Math.sin(me.aim) * 30); ctx.lineTo(me.x + Math.cos(me.aim) * 330, me.y + Math.sin(me.aim) * 330); ctx.stroke(); ctx.setLineDash([]);
            }
            this.particles.draw(ctx);
            ctx.restore();
            if (this.flash > 0) { ctx.fillStyle = `rgba(239,68,68,${this.flash * 1.4})`; ctx.fillRect(0, 0, w, h); }
            if (this.dead > 0) { ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.font = '800 36px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`Respawning in ${Math.ceil(this.dead)}…`, w / 2, h / 2); }
            else {
                const cx = s.mouse.x, cy = s.mouse.y, gap = this.hitmark > 0 ? 14 : 10;
                ctx.strokeStyle = this.hitmark > 0 ? '#facc15' : '#e0f2fe'; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(cx, cy, 11, 0, TAU);
                ctx.moveTo(cx - gap - 8, cy); ctx.lineTo(cx - gap, cy); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + 8, cy);
                ctx.moveTo(cx, cy - gap - 8); ctx.lineTo(cx, cy - gap); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + 8); ctx.stroke();
            }
            // minimap
            const mw = 170, mh = mw * this.H / this.W, mx = w - mw - 16, my = h - mh - 16;
            ctx.fillStyle = 'rgba(8,12,24,.7)'; ctx.fillRect(mx, my, mw, mh);
            ctx.fillStyle = '#334155';
            for (const wl of this.cover) ctx.fillRect(mx + wl.x / this.W * mw, my + wl.y / this.H * mh, Math.max(2, wl.w / this.W * mw), Math.max(2, wl.h / this.H * mh));
            ctx.fillStyle = '#a78bfa'; for (const d of this.drones) ctx.fillRect(mx + d.x / this.W * mw - 1, my + d.y / this.H * mh - 1, 2, 2);
            for (const r of s.remoteList()) { ctx.fillStyle = r.color; ctx.fillRect(mx + r.x / this.W * mw - 2, my + r.y / this.H * mh - 2, 4, 4); }
            ctx.fillStyle = '#fff'; ctx.fillRect(mx + me.x / this.W * mw - 3, my + me.y / this.H * mh - 3, 6, 6);
        }
    }

    Object.assign(A.games, { skyline: Skyline, duel: Duel, shooter: Shooter });
})(window);
