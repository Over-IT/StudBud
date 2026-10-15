(function (window) {
    'use strict';

    const A = window.StudBudArcade;
    const { TAU, clamp, lerp, dist, overlap, mulberry32, hashStr, moveBody, pushCircleOutOfRect, roundRect, nameTag } = A.util;

    function compactAlive(items, field) {
        let kept = 0;
        for (let i = 0; i < items.length; i++) if (items[i][field] > 0) items[kept++] = items[i];
        items.length = kept;
    }

    function duelBackdrop(ctx, w, h, game) {
        const low = !!game.s.graphics?.low;
        let layer = game.backdropLayer;
        if (!layer || layer.w !== w || layer.h !== h || layer.low !== low) {
            const canvas = document.createElement?.('canvas');
            if (canvas) {
                canvas.width = Math.ceil(w); canvas.height = Math.ceil(h);
                const paint = canvas.getContext('2d');
                if (paint) {
                    if (low) paint.fillStyle = '#0b1230';
                    else {
                        const gradient = paint.createLinearGradient(0, 0, 0, h);
                        gradient.addColorStop(0, '#0b1230'); gradient.addColorStop(1, '#3b1a5c');
                        paint.fillStyle = gradient;
                    }
                    paint.fillRect(0, 0, w, h);
                    for (let i = 0; i < (low ? 16 : 70); i++) {
                        paint.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.12})`;
                        paint.fillRect((hashStr(`st${i}`) % 1000) / 1000 * w, (hashStr(`sy${i}`) % 600) / 600 * h * 0.8, 2, 2);
                    }
                    layer = game.backdropLayer = { canvas, w, h, low };
                }
            }
        }
        if (layer) ctx.drawImage(layer.canvas, 0, 0, w, h);
        else { ctx.fillStyle = '#0b1230'; ctx.fillRect(0, 0, w, h); }
    }

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
    /* Rooftop Rumble: vertical parkour climb through three biomes         */
    /* ------------------------------------------------------------------ */
    const SKY_BIOMES = [
        { name: 'City Rooftops', top: '#1e1b4b', bottom: '#7c3aed', body: '#334155', edge: '#64748b', ledge: '#94a3b8', ledgeTop: '#e2e8f0', curve: '#4c7383', accent: '#e4bc77' },
        { name: 'Factory', top: '#17212b', bottom: '#475569', body: '#334155', edge: '#94a3b8', ledge: '#64748b', ledgeTop: '#cbd5e1', curve: '#526579', accent: '#fbbf24' },
        { name: 'Cloud Skies', top: '#0284c7', bottom: '#bae6fd', body: '#9cc5cc', edge: '#ffffff', ledge: '#f1f5f9', ledgeTop: '#ffffff', curve: '#9bd4ea', accent: '#7dd3fc' },
        { name: 'Space', top: '#020617', bottom: '#172554', body: '#312e81', edge: '#c4b5fd', ledge: '#6d28d9', ledgeTop: '#c4b5fd', curve: '#7056a0', accent: '#67e8f9' }
    ];
    // Keep the existing art IDs while removing the cloud layer from the playable course.
    const SKY_ROUTE = [0, 1, 3];
    const ihash = (a, b) => { let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return (n ^ (n >>> 16)) >>> 0; };
    const mixHex = (a, b, t) => {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const c = sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
        return `rgb(${c(16)},${c(8)},${c(0)})`;
    };

    // One unit of climb progress per biome; scenery stays anchored to world cells.
    function climbBackdrop(ctx, w, h, cam, camStart, blend, anim, low = false) {
        const { from: i, to: j, amount: t } = blend;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, mixHex(SKY_BIOMES[i].top, SKY_BIOMES[j].top, t));
        g.addColorStop(1, mixHex(SKY_BIOMES[i].bottom, SKY_BIOMES[j].bottom, t));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const down = camStart - cam.y;
        const weight = biome => (i === biome ? 1 - t : 0) + (j === biome ? t : 0);
        const cA = weight(0);
        if (cA > 0) {
            ctx.globalAlpha = cA;
            const sx0 = w * 0.8, sy0 = h * 0.2 + Math.min(40, Math.max(0, down) * 0.01);
            const sun = ctx.createRadialGradient(sx0, sy0, 0, sx0, sy0, 84);
            sun.addColorStop(0, '#fcd34d'); sun.addColorStop(.8, '#fcd34d');
            sun.addColorStop(.92, 'rgba(252,211,77,.8)'); sun.addColorStop(1, 'rgba(252,211,77,0)');
            ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx0, sy0, 84, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
        }
        if (low) return;
        const cells = (f, size, fn) => {
            const ox = cam.x * f, oy = cam.y * f;
            const x0 = Math.floor(ox / size) - 1, y0 = Math.floor(oy / size) - 1;
            for (let gx = x0; gx < x0 + w / size + 3; gx++) for (let gy = y0; gy < y0 + h / size + 3; gy++) fn(ihash(gx, gy + (f * 1000 | 0)), gx * size - ox, gy * size - oy);
        };
        const stars = weight(3);
        if (stars > 0) {
            ctx.fillStyle = '#fff'; ctx.globalAlpha = stars * 0.9;
            cells(0.05, 150, (hh, px, py) => {
                const sz = 1 + ((hh >> 20) & 1) + ((hh & 7) === 0 ? 1 : 0);
                ctx.fillRect(px + (hh & 127), py + ((hh >> 8) & 127), sz, sz);
            });
            ctx.globalAlpha = 1;
        }
        if (cA > 0) {
            ctx.globalAlpha = cA;
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
        const cl = weight(2);
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
        const fo = weight(1);
        if (fo > 0) {
            ctx.globalAlpha = fo * 0.6;
            cells(.2, 720, (hh, px, py) => {
                const gx = px + 150, gy = py + 360;
                ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 22; ctx.beginPath();
                ctx.moveTo(gx, py); ctx.lineTo(gx, gy - 54);
                ctx.quadraticCurveTo(gx, gy - 24, gx + 30, gy - 24);
                ctx.lineTo(gx + 450, gy - 24); ctx.quadraticCurveTo(gx + 480, gy - 24, gx + 480, gy + 6);
                ctx.lineTo(gx + 480, py + 630); ctx.quadraticCurveTo(gx + 480, py + 660, gx + 450, py + 660);
                ctx.lineTo(gx + 30, py + 660); ctx.quadraticCurveTo(gx, py + 660, gx, py + 690);
                ctx.lineTo(gx, py + 720);
                ctx.moveTo(px, gy); ctx.lineTo(px + 720, gy); ctx.stroke();
                ctx.strokeStyle = '#64748b'; ctx.lineWidth = 3; ctx.stroke();
                ctx.fillStyle = '#334155';
                for (const y of [py + 80, py + 600]) { ctx.fillRect(gx - 26, y, 52, 16); ctx.fillRect(gx - 8, y - 8, 16, 32); }
                const gear = (x, y, radius, direction) => {
                    ctx.save(); ctx.translate(x, y); ctx.rotate(anim * .45 * direction * 72 / radius + (hh % 10));
                    ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill();
                    for (let k = 0; k < 16; k++) { ctx.rotate(TAU / 16); ctx.fillRect(-7, -radius - 9, 14, 14); }
                    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, radius * .75, 0, TAU); ctx.stroke();
                    for (let k = 0; k < 5; k++) { ctx.rotate(TAU / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, radius * .75); ctx.stroke(); }
                    ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill(); ctx.restore();
                };
                ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 10; ctx.beginPath();
                ctx.moveTo(gx + 234, gy - 30); ctx.lineTo(gx + 234, gy - 235);
                ctx.arc(gx + 234, gy - 235, 30, Math.PI, 0); ctx.lineTo(gx + 294, gy - 30);
                ctx.arc(gx + 264, gy - 30, 30, 0, Math.PI); ctx.stroke();
                gear(gx, gy, 72, 1); gear(gx + 126, gy, 48, -1); gear(gx + 264, gy, 84, 1);
                ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(gx + 264, gy - 235, 30, 0, TAU); ctx.fill();
                ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.beginPath();
                const angle = anim * .9;
                ctx.moveTo(gx + 264 - Math.cos(angle) * 24, gy - 235 - Math.sin(angle) * 24);
                ctx.lineTo(gx + 264 + Math.cos(angle) * 24, gy - 235 + Math.sin(angle) * 24); ctx.stroke();
            });
            ctx.globalAlpha = 1;
        }
        const au = weight(3);
        if (au > 0) {
            ctx.globalAlpha = au * 0.8;
            cells(.035, 750, (hh, px, py) => {
                const x = px + 180 + (hh & 127), y = py + 160 + ((hh >>> 8) & 127), radius = 55 + ((hh >>> 16) % 90);
                const palettes = [['#0e7490', '#67e8f9'], ['#7c2d12', '#fdba74'], ['#581c87', '#d8b4fe'], ['#1e3a8a', '#93c5fd']];
                const colors = palettes[hh % palettes.length];
                if (hh % 3 === 0) {
                    ctx.strokeStyle = colors[1] + '99'; ctx.lineWidth = 7; ctx.beginPath();
                    ctx.ellipse(x, y, radius * 1.65, radius * .3, -.3, Math.PI, TAU); ctx.stroke();
                }
                const planet = ctx.createRadialGradient(x - radius * .35, y - radius * .4, 5, x, y, radius);
                planet.addColorStop(0, colors[1]); planet.addColorStop(.55, colors[0]); planet.addColorStop(1, '#020617');
                ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
                ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius - 2, 0, TAU); ctx.clip();
                if (hh % 2) {
                    ctx.strokeStyle = colors[1] + '66'; ctx.lineWidth = 9;
                    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(x, y + i * radius * .28, radius, radius * .13, -.25, 0, TAU); ctx.stroke(); }
                } else {
                    ctx.fillStyle = 'rgba(15,23,42,.3)';
                    for (let i = 0; i < 6; i++) {
                        const angle = i * 2.4 + hh, d = radius * (.25 + (i % 3) * .2);
                        ctx.beginPath(); ctx.arc(x + Math.cos(angle) * d, y + Math.sin(angle) * d, radius * (.08 + (i % 2) * .05), 0, TAU); ctx.fill();
                    }
                }
                ctx.restore();
                if (hh % 3 === 0) {
                    ctx.strokeStyle = colors[1] + '99'; ctx.lineWidth = 7; ctx.beginPath();
                    ctx.ellipse(x, y, radius * 1.65, radius * .3, -.3, 0, Math.PI); ctx.stroke();
                }
                ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(x + radius * 1.9, y - radius * .8, radius * .14, 0, TAU); ctx.fill();
            });
            cells(.14, 640, (hh, px, py) => {
                if (hh % 3) return;
                ctx.save(); ctx.translate(px + 300, py + 240); ctx.rotate((hh % 10) * .3);
                ctx.fillStyle = '#1d4ed8'; ctx.fillRect(-90, -25, 65, 50); ctx.fillRect(25, -25, 65, 50);
                ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 1;
                for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-90 + i * 17, -25); ctx.lineTo(-90 + i * 17, 25); ctx.moveTo(25 + i * 17, -25); ctx.lineTo(25 + i * 17, 25); ctx.stroke(); }
                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(-25, -4, 50, 8); ctx.fillRect(-12, -18, 24, 36);
                ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -42); ctx.stroke(); ctx.restore();
            });
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
            this.title = 'City Escape';
            this.scoreGoal = false; this.goalUnit = 'm'; this.goalLabel = 'Meters';
            this.formatValue = v => `${v.toLocaleString()} m`;
            this.race = true;
            this.WIDTH = 14000; this.SUMMIT = 45000; this.biomeSeen = 0;
            this.build();
            const c = this.checkpoints[0];
            this.me = { x: c.x, y: c.y - 44, w: 26, h: 44, vx: 0, vy: 0, face: 1 };
            this.cp = c;
            this.cam = { x: 0, y: 0 };
            this.coyote = 0; this.buffer = 0; this.airJumps = 1; this.dash = 0; this.dashCd = 0;
            this.boost = 0; this.slow = 0; this.dead = 0; this.maxH = 0; this.deaths = 0;
            this.res = new A.Resource('Energy', '#facc15', 100, 50, 2);
            this.anim = 0; this.finished = false; this.state = 0; this.carry = null;
            this.tideY = 1100; this.kick = 0; this.wallDir = 0; this.tideWarn = false;
        }

        build() {
            const r = mulberry32(this.s.seed);
            const solids = this.solids = [];
            this.spikes = []; this.saws = []; this.lasers = []; this.springs = []; this.boxes = []; this.checkpoints = [];
            this.movers = []; this.meteors = []; this.drills = []; this.crumbles = []; this.winds = []; this.balls = []; this.blinkers = [];
            const W = this.WIDTH, SUM = this.SUMMIT;
            solids.push({ x: -240, y: -SUM - 2500, w: 240, h: SUM + 4000, wall: true, boundary: true });
            solids.push({ x: W, y: -SUM - 2500, w: 240, h: SUM + 4000, wall: true, boundary: true });
            solids.push({ x: -240, y: 0, w: W + 480, h: 1400, ground: true, bi: 0 });
            let cx = W / 2, y = 0, travelDirection = 1, cityH = 0;
            this.checkpoints.push({ x: cx - 40, y: 0, id: 0, biome: 0 });
            // The city is a long horizontal run; the sky above it is split evenly between the remaining biomes.
            const biome = () => cityH === 0 ? 0 : SKY_ROUTE[Math.min(SKY_ROUTE.length - 1, 1 + Math.floor((-y - cityH) / ((SUM - cityH) / (SKY_ROUTE.length - 1))))];
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
                        if (s.wall || s.ground || s.meteor) return false;
                        // keep the space above a wall-jump shaft open, so a low roof can never trap you at the top of it
                        if (s.wallJ && ny < s.y - 20 && ny > s.y - 330 && c - wd / 2 < s.x + s.w + 200 && c + wd / 2 > s.x - 200) return true;
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
                cx = clamp(cx + travelDirection * 240, 400, W - 400); y -= 160;
                const p = { x: cx - 180, y, w: 360, h: 40, roof: true, island: true, bodyH: 40, bi: biome() };
                solids.push(p);
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
                    this.winds.push({ x: 60, y: y - 100, w: W - 120, h: y0 - y + 200, fx: (r() < 0.5 ? -1 : 1) * 90 });
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
                        const t = ledge(side * 700, 145, 1000, { roof: true, thin: false, h: 40, bodyH: 100 });
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
                        const t = ledge(side * 700, 145, 760, { roof: true, thin: false, h: 40, bodyH: 120 });
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
                        y -= 140;
                        const x = base + (row % 2 ? -280 : 280) - 480;
                        solids.push({ x, y, w: 960, h: 18, thin: true, jt: true, oneway: true, scaffold: true, bi: b });
                        box(x + (row % 2 ? 740 : 120), y - 52, 76, 52, 'crate');
                        if (row === 1) this.boxes.push({ x: base, y: y - 55, t: 0 });
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
                    const y0 = y, fx = (r() < 0.5 ? -1 : 1) * (70 + r() * 30);
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
                        if (i === 1) this.winds.push({ x: p.x - 160, y: p.y - 200, w: 460, h: 260, fx: d * -80 });
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
            this.challenges = [];
            const challengeKinds = ['workyard', 'arcade', 'courtyard', 'rooftop', 'skywalk', 'foundry'];
            const shuffle = names => {
                const bag = [...names];
                for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
                return bag;
            };
            const challenge = kind => {
                if (cx > W - 1800) travelDirection = -1;
                else if (cx < 1800) travelDirection = 1;
                cx += travelDirection * (this.challenges.length ? 320 : 170);
                y -= this.challenges.length ? 160 : 100;
                const b = Math.min(3, biome());
                const baseHeight = b === 0 ? this.challenges.length ? 100 : -y : 40;
                const base = { x: cx - 140, y, w: 280, h: baseHeight, roof: true, island: true, bodyH: baseHeight, bi: b };
                if (b === 3) base.spaceStyle = hashStr(kind) % 3;
                solids.push(base);
                const bottom = base.y;
                const middle = cx + travelDirection * 320, left = middle - 860, right = middle + 860;
                const id = this.challenges.length;
                const introductory = id === 0;
                let hazardBudget = introductory ? 0 : b === 0 ? 1 : b === 2 ? 2 : b === 1 ? 5 : 3;
                base.chamber = id;
                const put = (x, yy, w, h = 16, extra = {}) => {
                    const p = { x, y: yy, w, h, bi: b, chamber: id, ...extra };
                    solids.push(p); return p;
                };
                const recipes = {
                    workyard: ['terrain', 'belt', 'lift', 'balcony', 'spring', 'crumble', 'balcony', 'precision'],
                    arcade: ['balcony', 'terrain', 'crumble', 'spring', 'balcony', 'precision', 'lift', 'belt'],
                    courtyard: ['precision', 'terrain', 'spring', 'balcony', 'lift', 'belt', 'balcony', 'crumble'],
                    rooftop: ['terrain', 'crumble', 'balcony', 'lift', 'balcony', 'spring', 'precision', 'belt'],
                    skywalk: ['belt', 'spring', 'precision', 'terrain', 'balcony', 'balcony', 'blink', 'lift'],
                    foundry: ['lift', 'balcony', 'terrain', 'belt', 'spring', 'balcony', 'crumble', 'precision']
                };
                const nodes = [base], motifs = recipes[kind].map(m => m === 'terrain' ? id % 2 ? 'terrace' : id % 4 ? 'ramp' : 'arch' : m);
                if (b === 2 && !introductory) {
                    // the cloud layer swaps solid decks for cloud behaviours: heavy rain clouds sink under you,
                    // little puffs bob up and down, and the second deck becomes either of those
                    let balconies = 0;
                    for (let i = 0; i < motifs.length; i++) {
                        if (motifs[i] === 'terrace') motifs[i] = 'sink';
                        else if (motifs[i] === 'balcony' && balconies++) motifs[i] = id % 2 ? 'bob' : 'sink';
                    }
                }
                let yy = bottom, last = base, center = base.x + base.w / 2;
                const mirror = center < middle;
                const offsets = [-1, -.25, 1, .35, -.9, -.3, .85, .2];
                for (let i = 0; i < motifs.length; i++) {
                    const motif = motifs[i], offset = (i === motifs.length - 1 ? .15 : i === motifs.length - 2 ? .5 : offsets[(i + id % 3) % offsets.length]) * (mirror ? -1 : 1);
                    const nextCenter = middle + offset * (introductory ? 270 : 390 + b * 30) + (r() - .5) * 20;
                    let direction = Math.sign(nextCenter - center) || 1;
                    yy -= motifs[i - 1] === 'spring' ? b === 3 ? 340 : introductory ? 220 : 260 : (b === 3 ? [190, 220, 200, 210] : b === 1 ? [100, 115, 110, 120] : introductory ? [100, 115, 110, 120] : [125, 150, 110, 140])[(i + id) % 4];
                    const curveHeight = introductory ? 24 : 36;
                    if ((motif === 'arch' || motif === 'ramp') && motifs[i - 1] !== 'spring') {
                        yy = Math.min(yy, last.y - curveHeight - 90);
                    }
                    center = nextCenter;
                    const nextWidth = motif === 'arch' || motif === 'ramp' ? 460 : motif === 'terrace' ? 440 : motif === 'balcony' ? 340 : motif === 'sink' ? 250 : motif === 'bob' ? 150 : motif === 'lift' ? 124 : motif === 'spring' ? 180 : motif === 'belt' ? b === 1 ? 440 : 190 : motif === 'precision' ? introductory ? 120 : 76 : 116;
                    const nextHeight = motif === 'balcony' || motif === 'terrace' ? 32 : motif === 'arch' || motif === 'ramp' ? curveHeight : 24;
                    if (motif === 'spring') center = middle + Math.sign(offset) * 330;
                    if (motifs[i - 1] === 'spring') {
                        const transfer = last.x + last.w / 2 < middle ? 1 : -1;
                        center = last.x + last.w / 2 + transfer * (last.w / 2 + nextWidth / 2 + 40);
                    }
                    center = clamp(center, left + nextWidth / 2 + 10, right - nextWidth / 2 - 10);
                    if (motifs[i - 1] !== 'spring') {
                        const reach = last.w / 2 + nextWidth / 2 + (b === 3 ? 290 : introductory ? 140 : 170);
                        center = clamp(center, last.x + last.w / 2 - reach, last.x + last.w / 2 + reach);
                    }
                    if (b === 1 && motifs[i - 1] !== 'spring') {
                        const gap = motif === 'lift' || last.mover ? 100 : 60;
                        const choices = [direction, -direction].map(side => last.x + last.w / 2 + side * (last.w / 2 + nextWidth / 2 + gap))
                            .filter(x => x - nextWidth / 2 >= left + 10 && x + nextWidth / 2 <= right - 10);
                        if (!choices.length) throw new Error(`Factory route ${id}: no head-clear connection for ${motif}`);
                        center = choices[0];
                        direction = Math.sign(center - last.x - last.w / 2) || 1;
                    }
                    if (center - nextWidth / 2 < last.x + 30 && center + nextWidth / 2 > last.x + last.w - 30) {
                        const candidates = [-1, 1].map(side => clamp(last.x + last.w / 2 + side * (nextWidth / 2 + last.w / 2 - 24),
                            left + nextWidth / 2 + 10, right - nextWidth / 2 - 10))
                            .filter(candidate => candidate - nextWidth / 2 >= last.x + 30 || candidate + nextWidth / 2 <= last.x + last.w - 30);
                        candidates.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
                        if (!candidates.length) throw new Error(`City Escape route ${id}: no clear takeoff for ${motif}`);
                        center = candidates[0];
                    }
                    if (motifs[i - 1] !== 'spring' && center - nextWidth / 2 < last.x + last.w && center + nextWidth / 2 > last.x) {
                        yy = Math.min(yy, last.y - nextHeight - 120);
                    }
                    if (motif === 'arch' || motif === 'ramp') {
                        center = clamp(center, left + 240, right - 240);
                        last = put(center - 230, yy, 460, curveHeight,
                            { slope: -direction, curve: motif === 'arch' ? 'arch' : 'ease',
                                curveStart: .25, curveEnd: .75, route: true, motif });
                    } else if (motif === 'terrace') {
                        last = put(center - 220, yy, 440, 32, { roof: true, island: true, bodyH: 32, motif });
                    } else if (motif === 'balcony') {
                        last = put(center - 170, yy, 340, 32, { roof: true, bodyH: 32, motif });
                        put(center + 78, yy - 48, 48, 48, { prop: ['ac', 'turbine', 'cloudbank', 'power-core'][b] });
                        // clouds never carry spikes: their danger comes from drifting and vanishing puffs instead
                        const hazard = { x: center + 84, y: yy - 66, w: 36, h: 18, support: last, mounted: true, bi: b };
                        if (hazardBudget > 0 && b !== 2 && b !== 1) { this.spikes.push(hazard); hazardBudget--; }
                    } else if (motif === 'sink') {
                        last = put(center - 125, yy, 250, 26, { motif, cloud: true, mover: true, sinker: true, sunk: 0, depth: 80, amp: 0,
                            bx: center - 125, by: yy, dx: 0, dy: 0 });
                        this.movers.push(last);
                    } else if (motif === 'bob') {
                        last = put(center - 75, yy, 150, 22, { motif, cloud: true, mover: true, vert: true,
                            bx: center - 75, by: yy, amp: 34, speed: .9 + r() * .3, phase: r() * 6, dx: 0, dy: 0 });
                        this.movers.push(last);
                    } else if (motif === 'lift') {
                        last = put(center - 62, yy, 124, 20,
                            { mover: true, bx: center - 62, by: yy, amp: introductory ? 30 : 54, speed: introductory ? .8 : 1.1, phase: r() * 6, dx: 0, dy: 0, motif });
                        this.movers.push(last);
                    } else if (motif === 'spring') {
                        last = put(center - 90, yy, 180, 24, { pipe: b !== 2, motif });
                        this.springs.push({ x: center - 23, y: yy - 16, w: 46, h: 16, bi: b });
                    } else if (motif === 'belt' && b === 2) {
                        // a cloud drifting sideways replaces the conveyor: wait for it, then ride it across
                        last = put(center - 95, yy, 190, 22, { motif: 'drift', cloud: true, mover: true,
                            bx: center - 95, by: yy, amp: 85, speed: .55 + r() * .2, phase: r() * 6, dx: 0, dy: 0 });
                        this.movers.push(last);
                    } else {
                        const width = motif === 'precision' ? introductory ? 120 : 76 : motif === 'belt' ? b === 1 ? 440 : 190 : 116;
                        const vanishing = b === 2 && motif === 'precision' && !introductory;
                        last = put(center - width / 2, yy, width, 18, { thin: true, motif,
                            belt: motif === 'belt' ? -direction * 110 : 0,
                            crumble: motif === 'crumble' && !introductory, timer: 0, gone: 0,
                            blink: (motif === 'blink' || vanishing) && !introductory, period: 3.8, on: 2.8, phase: r() * 3 });
                        if (last.crumble) this.crumbles.push(last);
                        if (last.blink) this.blinkers.push(last);
                    }
                    if (b === 1) {
                        if (motif === 'belt') {
                            last.factoryBelt = true; last.belt = direction * 150;
                        }
                        if (last.mover) last.factoryLift = true;
                    }
                    if (b === 3 && !last.slope) last.spaceStyle = (id + i) % 3;
                    nodes.push(last);
                    // Broad production decks host factory presses; narrow route connections stay safe.
                    if (motif === 'terrace' && b === 1 && hazardBudget > 0) {
                        this.drills.push({ x: center + direction * 86, mountY: yy - 130, surfaceY: yy, period: 2.8, phase: r() * 2.8, chamber: id, bi: b, tipY: yy - 104 });
                        hazardBudget--;
                    } else if ((motif === 'arch' || motif === 'terrace') && (b === 1 || b === 3) && hazardBudget > 0) {
                        this.saws.push({ cx: center + direction * 86, cy: yy - 78, amp: 28, speed: 1.35, phase: r() * 6, r: 18, x: 0, y: 0, mountY: yy + last.h, chamber: id, bi: b });
                        hazardBudget--;
                    }
                    if (motif === 'belt' && b !== 1 && b !== 2 && hazardBudget > 0) {
                        this.lasers.push({ x: center + direction * 45, y: yy - 116, w: 10, h: 116, period: 3.2, phase: r() * 3, mounted: true, support: last, bi: b });
                        hazardBudget--;
                    }
                }
                const lowerTop = yy - (b === 0 ? 240 : 170), top = lowerTop - 140, exitX = clamp(center, middle - 170, middle + 170);
                const lowerLeft = center < middle;
                const sideTops = [lowerLeft ? lowerTop : top, lowerLeft ? top : lowerTop];
                const islandHeight = [110, 40, 64, 48][b];
                const leftRoof = put(left, sideTops[0], exitX - 90 - left, islandHeight, { roof: true, island: true, bodyH: islandHeight, motif: 'rooftop-walk', navX: exitX - 130 });
                const rightRoof = put(exitX + 90, sideTops[1], right - exitX - 90, islandHeight, { roof: true, island: true, bodyH: islandHeight, motif: 'rooftop-walk', navX: exitX + 130 });
                const lowerRoof = lowerLeft ? leftRoof : rightRoof, upperRoof = lowerLeft ? rightRoof : leftRoof;
                const factorySteps = b === 1 ? [1, 2].map(step => put(
                    lowerLeft ? exitX - 90 + (step - 1) * 90 : exitX + 90 - step * 90,
                    lowerTop - step * 140 / 3, 90, 16, { factoryStep: true, oneway: true, motif: 'service-step', route: true }
                )) : [];
                const factoryEntry = b === 1 ? put(exitX - 70, lowerTop + 80, 140, 16, {
                    factoryStep: true, factoryEntry: true, oneway: true, motif: 'service-entry', route: true
                }) : null;
                const roomCenter = lowerLeft ? left + 105 : right - 105;
                const room = put(roomCenter - 65, lowerTop - 90, 130, 90, { roof: true, island: true, bodyH: 90, motif: 'rooftop-room' });
                const exitCenter = lowerLeft ? right - 170 : left + 170;
                const exit = put(exitCenter - 90, top - 120, 180, 120, { roof: true, island: true, bodyH: 120, motif: 'penthouse' });
                for (const deck of [lowerRoof, upperRoof]) {
                    const featureX = deck.x + deck.w / 2;
                    put(featureX - 28, deck.y - 32, 56, 32, { prop: ['crate', 'turbine', 'cloudbank', 'power-core'][b] });
                    if (b === 1 && deck === lowerRoof) { deck.factoryBelt = true; deck.belt = (lowerLeft ? 1 : -1) * 150; }
                    if (b === 3) deck.spaceStyle = (id + (deck === lowerRoof ? 0 : 1)) % 3;
                }
                nodes.push(...(factoryEntry ? [factoryEntry, factorySteps[0]] : []), lowerRoof, room, lowerRoof, ...factorySteps, upperRoof, exit);
                const chamberSolids = solids.filter(p => p.chamber === id);
                for (let i = this.drills.length - 1; i >= 0; i--) {
                    const d = this.drills[i];
                    if (d.chamber !== id) continue;
                    const zone = { x: d.x - 24, y: d.mountY - 40, w: 48, h: d.surfaceY - d.mountY + 39 };
                    if (chamberSolids.some(p => overlap(zone, p))) { this.drills.splice(i, 1); }
                }
                if (b === 1 && !introductory) {
                    const decks = [lowerRoof, upperRoof, ...nodes.filter(p => p.motif === 'belt')];
                    for (const [machineIndex, deck] of decks.entries()) {
                        if (hazardBudget <= 0) break;
                        const crusher = machineIndex % 2 === 0, width = crusher ? 96 : 24;
                        const candidates = [deck.x + 160, deck.x + deck.w - 160, deck.x + deck.w / 2];
                        const x = candidates.find(x => x - width / 2 > deck.x + 65 && x + width / 2 < deck.x + deck.w - 65
                            && !chamberSolids.some(p => p !== deck && overlap({ x: x - width / 2 - 8, y: deck.y - 230, w: width + 16, h: 229 }, p)));
                        if (x === undefined) continue;
                        this.drills.push({ x, mountY: deck.y - 190, surfaceY: deck.y, period: 3.4 + machineIndex * .3,
                            phase: r() * 3, chamber: id, bi: b, tipY: deck.y - 164, crusher, width });
                        hazardBudget--;
                    }
                }
                this.challenges.push({ kind, motifs, nodes, introductory, left, right, middle, bottom, top, sideTops, exitX, exit, id });
                cx = exitCenter; y = exit.y;
            };
            // ---- Area 1: a skyscraper run. You start boxed into an alley, climb fixtures bolted to the walls,
            // then travel roof to roof; every tower reaches the street and every gameplay piece hangs off a real wall. ----
            const towers = this.towers = [], cityPath = this.cityPath = [];
            const cityPut = p => { p.city = true; p.bi = 0; solids.push(p); return p; };
            const path = (...list) => { for (const p of list) if (cityPath[cityPath.length - 1] !== p) cityPath.push(p); };
            const tower = (x, top, w) => {
                const t = cityPut({ x, y: top, w, h: -top, bodyH: -top, roof: true, tower: true, style: towers.length % 3 });
                towers.push(t); return t;
            };
            const MOUNT = { ledge: [112, 18], ac: [84, 40], awning: [150, 30], sign: [104, 40], neon: [104, 18] };
            const mount = (wallX, side, top, kind, far = false) => {
                const [depth, h] = MOUNT[kind], off = far ? 150 : 0;
                const p = cityPut({ x: side > 0 ? wallX + off : wallX - off - depth, y: top, w: depth, h, wallX, wallSide: side, mount: kind, far });
                // awnings slope down away from the wall with a soft curve, so the high end is always at the building
                if (kind === 'awning') Object.assign(p, { slope: -side, curve: 'ease', curveStart: .15, curveEnd: .85, route: true });
                if (kind === 'neon') { Object.assign(p, { blink: true, period: 3.6, on: 2.6, phase: r() * 3 }); this.blinkers.push(p); }
                return p;
            };
            const towerWidth = () => 760 + Math.floor(r() * 220);
            // The opening alley: two walls you cannot leave, fixtures alternating sides and a window-washer gondola halfway up.
            const T0 = tower(160, -1950, 900), T1 = tower(1400, -1320, 880);
            this.checkpoints[0].x = 1190;
            const L = (yy, k) => mount(1060, 1, yy, k), Rm = (yy, k) => mount(1400, -1, yy, k);
            const alley = [L(-115, 'ledge'), Rm(-235, 'ac'), L(-355, 'ledge')];
            const cab = cityPut({ x: 1180, y: -650, w: 100, h: 18, mover: true, vert: true, bx: 1180, by: -650, amp: 180, speed: .75, phase: r() * 6,
                dx: 0, dy: 0, gondola: true, cableTop: -1010, spanX0: 1060, spanX1: 1400 });
            this.movers.push(cab);
            alley.push(cab, L(-830, 'ledge'), Rm(-950, 'ledge'), L(-1070, 'ac'), Rm(-1190, 'ledge'));
            path(...alley, T1);
            const furnish = (A, level) => {
                const hi = A.x + A.w - 170, kinds = ['crown', 'ac', 'tank'];
                if (level >= 3) kinds.push('laser', 'laser');
                let x = A.x + 150 + r() * 60, n = 0, prev = '';
                while (n < 2) {
                    let k = kinds[Math.floor(r() * kinds.length)];
                    if (k === prev) k = kinds[(kinds.indexOf(k) + 1) % kinds.length];
                    const w = k === 'crown' ? 260 : k === 'ac' ? 192 : k === 'tank' ? 90 : 40;
                    if (x + w > hi) break;
                    if (k === 'crown') {
                        cityPut({ x, y: A.y - 60, w: 260, h: 60, bodyH: 60, roof: true, crown: true });
                        cityPut({ x: x + 65, y: A.y - 120, w: 130, h: 60, bodyH: 60, roof: true, crown: true });
                    } else if (k === 'ac') {
                        cityPut({ x, y: A.y - 46, w: 64, h: 46, prop: 'ac' });
                        cityPut({ x: x + 128, y: A.y - 46, w: 64, h: 46, prop: 'ac' });
                    } else if (k === 'tank') cityPut({ x, y: A.y - 80, w: 90, h: 80, prop: 'tank' });
                    else this.lasers.push({ x: x + 15, y: A.y - 300, w: 10, h: 300, period: 3.2, phase: r() * 3, mounted: true, support: A, bi: 0, city: true });
                    prev = k; x += w + 140 + r() * 80; n++;
                }
            };
            const crossings = ['hop', 'climb', 'scale', 'spring', 'cart', 'climb', 'skybridge', 'scale', 'climb', 'scale'];
            const climb = (A, level, gapX, n) => {
                const B = tower(gapX + 280 + Math.floor(r() * 20), A.y - 120 * (n + 1), towerWidth());
                const rungs = [];
                for (let i = 1; i <= n; i++) {
                    const yy = A.y - 120 * i;
                    if (i % 2) {
                        const p = mount(B.x, -1, yy, ['ledge', 'ac', 'awning'][(i + level) % 3]);
                        if (level >= 3 && i === 3 && p.mount === 'ledge') { Object.assign(p, { crumble: true, timer: 0, gone: 0 }); this.crumbles.push(p); }
                        rungs.push(p);
                    } else rungs.push(mount(B.x, -1, yy, level >= 3 && r() < .5 ? 'neon' : 'sign', true));
                }
                return { B, pieces: rungs };
            };
            const cross = (A, kind, level) => {
                const gapX = A.x + A.w;
                if (kind === 'climb') return climb(A, level, gapX, 7 + Math.floor(r() * 4));
                if (kind === 'hop') {
                    const gap = level < 2 ? 150 + r() * 40 : 170 + r() * 70;
                    return { B: tower(Math.round(gapX + gap), Math.round(A.y + (A.y < -1000 ? 60 : 0) - r() * 130), towerWidth()), pieces: [] };
                }
                if (kind === 'drop') return { B: tower(Math.round(gapX + 230 + r() * 70), Math.round(A.y + 170 + r() * 90), towerWidth()), pieces: [] };
                if (kind === 'scale') {
                    // hop off the roof edge into a narrow shaft and wall-hop between a blade sign on stilts and B's climbing rail
                    const shaft = 190, H = Math.round(1000 + r() * 250);
                    const B = tower(gapX + shaft, A.y - H, towerWidth());
                    const sign = cityPut({ x: gapX - 110, y: B.y + 40, w: 110, h: A.y - 210 - (B.y + 40), wallJ: true, bladeSign: true, scaleTower: true, stiltY: A.y, hue: Math.floor(r() * 3) });
                    const rail = cityPut({ x: B.x, y: B.y + 8, w: 8, h: H + 160, wallJ: true, climbRail: true });
                    return { B, pieces: [], rig: [sign, rail] };
                }
                if (kind === 'spring') {
                    this.springs.push({ x: gapX - 100, y: A.y - 16, w: 46, h: 16, city: true });
                    return { B: tower(Math.round(gapX + 190 + r() * 40), Math.round(A.y - 200 - r() * 60), towerWidth()), pieces: [] };
                }
                if (kind === 'cart') {
                    const gap = Math.round(460 + r() * 80), amp = (gap - 144) / 2;
                    const cart = cityPut({ x: gapX + 12 + amp, y: A.y, w: 120, h: 18, mover: true, bx: gapX + 12 + amp, by: A.y, amp, speed: .7, phase: r() * 6,
                        dx: 0, dy: 0, cart: true, railX0: gapX, railX1: gapX + gap });
                    this.movers.push(cart);
                    return { B: tower(gapX + gap, Math.round(A.y - 20 - r() * 40), towerWidth()), pieces: [cart] };
                }
                if (kind === 'gondola') {
                    const gap = Math.round(230 + r() * 30), rise = Math.round(300 + r() * 120);
                    const B = tower(gapX + gap, A.y - rise, towerWidth()), x = gapX + gap / 2 - 55;
                    const g = cityPut({ x, y: A.y - rise / 2, w: 110, h: 18, mover: true, vert: true, bx: x, by: A.y - rise / 2, amp: rise / 2, speed: .75, phase: r() * 6,
                        dx: 0, dy: 0, gondola: true, cableTop: B.y - 150, davitX: B.x + 34, davitY: B.y });
                    this.movers.push(g);
                    return { B, pieces: [g] };
                }
                // skybridge: drop onto a truss bridge, hop its missing span, then climb the far tower's wall
                const gap = Math.round(520 + r() * 120), deck = A.y + 130, half = (gap - 150) / 2;
                const left = cityPut({ x: gapX, y: deck, w: half, h: 24, bridge: true }), right = cityPut({ x: gapX + half + 150, y: deck, w: half, h: 24, bridge: true });
                const B = tower(gapX + gap, deck - 240, towerWidth()), ledge = mount(B.x, -1, deck - 120, 'ledge');
                if (level >= 3) this.lasers.push({ x: left.x + half / 2, y: deck - 150, w: 10, h: 150, period: 2.8, phase: r() * 3, mounted: true, support: left, bi: 0, city: true });
                return { B, pieces: [left, right, ledge] };
            };
            let at = T1, level = 0, crossingBag = ['climb', 'scale', 'climb'];
            this.cityCrossings = [];
            while (at.x + at.w < W - 3000) {
                if (!crossingBag.length) crossingBag = shuffle(crossings);
                let kind = crossingBag.pop();
                if (kind === this.cityCrossings[this.cityCrossings.length - 1]?.kind && crossingBag.length) [kind, crossingBag[0]] = [crossingBag[0], kind];
                if (kind === 'drop' && at.y > -1100) kind = 'hop';
                furnish(at, level);
                const { B, pieces, rig } = cross(at, kind, level);
                this.cityCrossings.push({ kind, from: at, to: B, pieces, level, rig });
                path(...pieces, B);
                at = B; level++;
            }
            // the last climb lifts you clear of every rooftop before the clouds begin
            const highest = Math.min(...towers.map(t => t.y));
            furnish(at, level);
            const finale = climb(at, level, at.x + at.w, Math.max(3, Math.ceil((at.y - highest + 200) / 120) - 1));
            this.cityCrossings.push({ kind: 'climb', from: at, to: finale.B, pieces: finale.pieces, level });
            path(...finale.pieces, finale.B);
            const F = finale.B;
            const cloudPad = { x: F.x + F.w + 140, y: F.y - 140, w: 360, h: 40, roof: true, island: true, bodyH: 40, bi: 1 };
            solids.push(cloudPad); path(cloudPad);
            this.checkpoints.push({ x: cloudPad.x + 70, y: cloudPad.y, id: 1, biome: 1 });
            cx = cloudPad.x + cloudPad.w / 2; y = cloudPad.y; cityH = -cloudPad.y; travelDirection = -1;

            let challengeBag = shuffle(challengeKinds);
            let count = 0, curBiome = 1, spaceRoutes = 0;
            while (y > -SUM + 700) {
                const b = biome();
                if (b !== curBiome) {
                    curBiome = b;
                    if (b > 0) startPad();
                }
                if (!challengeBag.length) challengeBag = shuffle(challengeKinds);
                challenge(challengeBag.pop());
                if (b === 3) {
                    this.spaceLaunch ||= solids.find(p => p.y === this.checkpoints.find(cp => cp.biome === 3).y && !p.wall);
                    spaceRoutes++;
                    if (spaceRoutes % 2 === 1) {
                        const wait = this.challenges[this.challenges.length - 1].exit;
                        let direction = cx < W / 2 ? 1 : -1;
                        if (cx + direction * 2260 < 300 || cx + direction * 2260 > W - 300) direction *= -1;
                        const startX = cx + direction * 220 - 70, startY = y - 120;
                        const endX = startX + direction * 1800, endY = startY - 420;
                        const landing = { x: cx + direction * 2260 - 140, y: endY - 100, w: 280, h: 32,
                            roof: true, island: true, bodyH: 32, bi: 3, spaceStyle: 1, meteorLanding: true };
                        const meteor = { x: startX, y: startY, by: startY, bx: startX, w: 140, h: 140,
                            bi: 3, meteor: true, meteorRide: true, mover: true, off: true, oneway: true, jt: true,
                            startX, startY, endX, endY, wait, landing, direction, speed: 300,
                            verticalSpeed: -70, rideTime: 0, rideDuration: 6, dwell: 2,
                            phase: 0, delay: 0, respawnDelay: 0, anchorX: cx, spawned: false,
                            dx: 0, dy: 0, seed: Math.floor(r() * 10000) };
                        wait.meteorWait = true; wait.meteorDirection = direction; landing.meteorDirection = direction;
                        solids.push(meteor); this.movers.push(meteor); this.meteors.push(meteor);
                        solids.push(landing);
                        cx = landing.x + landing.w / 2; y = landing.y;
                    }
                }
                if (count % 2 === 1 && !(b === 3 && spaceRoutes % 2 === 1)) rest();
                count++;
            }
            ledge(0, 110, 220);
            const summit = this.summit = ledge(0, 110, 900, { roof: true, island: true, thin: false, h: 60, bi: 3 });
            this.summitH = -y;
            // any thin platform with another walkable one right under it becomes a jump-through glass platform, so tight spots never bonk you
            for (const q of solids) {
                if (q.chamber !== undefined || !q.thin || q.jt || q.mover || q.crumble || q.wall || q.ground) continue;
                if (solids.some(p => {
                    if (p === q || !walkable(p)) return false;
                    const py = p.mover ? (p.by !== undefined ? p.by : p.y) : p.y, rx = p.mover && !p.vert ? p.amp || 0 : 0, ry = p.meteor ? 500 : p.mover && p.vert ? p.amp || 0 : 0;
                    return py + ry - q.y > 0 && py - ry - q.y <= 150 && p.x - rx < q.x + q.w - 10 && p.x + p.w + rx > q.x + 10;
                })) q.jt = true;
            }
            // a slope's body must never leave a cramped slot over a platform: nudge that platform down so there is real headroom
            for (const sl of solids) {
                if (!sl.slope || sl.chamber !== undefined || sl.city) continue;
                for (const q of solids) {
                    if (q.chamber !== undefined || q.city || q === sl || q.slope || q.mover || q.wall || q.ground) continue;
                    const gap = q.y - (sl.y + sl.h);
                    if (gap <= 0 || gap >= 130 || q.x >= sl.x + sl.w || q.x + q.w <= sl.x) continue;
                    const ny = q.y + (130 - gap);
                    if (!solids.some(o => o !== q && o.x < q.x + q.w && o.x + o.w > q.x && o.y < ny + q.h + 10 && o.y + o.h > q.y)) q.y = ny;
                }
            }
            // Map sanity: a thin platform buried inside a roof or prop is unreachable and can trap you, so drop it
            for (let i = solids.length - 1; i >= 0; i--) {
                const q = solids[i];
                if (!q.thin || q.roof || q.prop || q.wall || q.ground || q.mover || q === this.summit) continue;
                if (solids.some(p => p !== q && (p.roof || p.prop) && !p.slope && q.x < p.x + p.w - 4 && q.x + q.w > p.x + 4 && q.y + q.h > p.y + 4 && q.y < p.y + p.h - 4)) solids.splice(i, 1);
            }
            // Glass arrows and open factory stair grates allow ascent; main decks remain solid from below.
            for (const p of solids) p.oneway = !!(p.jt || p.factoryStep);
            // purely visual rooftop clutter, placed only in free gaps (no props, spikes, springs, boxes, flags or ceilings)
            const rd = mulberry32((this.s.seed ^ 0x9e3779b1) >>> 0), DW = [80, 110, 80, 100, 110, 110, 90, 70, 100];
            for (const p of solids) {
                if (!p.roof || p.w < 200 || p.bi > 0) continue;
                const bl = [];
                for (const s of solids) {
                    if (s === p || s.wall || s.ground || s.x >= p.x + p.w || s.x + s.w <= p.x) continue;
                    if (s.y + s.h > p.y - 80 && s.y < p.y + 4) bl.push([s.x - 12, s.x + s.w + 12]);
                }
                for (const o of this.spikes.concat(this.springs, this.lasers)) if (Math.abs(o.y + o.h - p.y) < 8) bl.push([o.x - 14, o.x + o.w + 14]);
                for (const o of this.boxes) if (Math.abs(o.y + 55 - p.y) < 12) bl.push([o.x - 44, o.x + 44]);
                for (const o of this.checkpoints) if (Math.abs(o.y - p.y) < 6) bl.push([o.x - 20, o.x + 210]);
                // keep the landing and take-off edges of skyscraper roofs clear
                if (p.tower) bl.push([p.x - 20, p.x + 150], [p.x + p.w - 170, p.x + p.w + 20]);
                p.decor = [];
                let dx = p.x + 24 + rd() * 40, prev = -1;
                while (dx + 110 < p.x + p.w - 24 && p.decor.length < (p.tower ? 2 : p.w >= 600 ? 3 : 1)) {
                    let k = Math.floor(rd() * 9);
                    if (k === prev) k = (k + 1) % 9;
                    const w = DW[k], hit = bl.find(b => dx < b[1] && dx + w > b[0]);
                    if (hit) { dx = hit[1] + 6; continue; }
                    p.decor.push({ x: dx, k, w, s: Math.floor(rd() * 1000) });
                    prev = k; dx += w + 50 + rd() * 120;
                }
            }
            // construction pieces stand on steel columns that reach the nearest surface below (or fade into the haze)
            for (const p of solids) {
                if (p.bi !== 2 || p.chamber === undefined || p.prop || p.mover || p.wall || p.blink || p.crumble) continue;
                const c = this.challenges[p.chamber];
                if (!c) continue;
                const inset = Math.min(p.island ? 40 : 22, p.w / 4);
                p.beams = [p.x + inset, p.x + p.w - inset].map(x => {
                    const foot = p.slope ? A.util.slopeY(p, x) + 6 : p.y + (p.roof ? p.bodyH || p.h : p.h);
                    let floor = Infinity;
                    for (const q of solids) {
                        if (q === p || q.chamber !== p.chamber || q.prop || q.mover || q.blink || q.crumble || x <= q.x || x >= q.x + q.w) continue;
                        const qy = q.slope ? A.util.slopeY(q, x) : q.y;
                        if (qy >= foot - 2) floor = Math.min(floor, qy);
                    }
                    return floor === Infinity ? [x, foot, foot + 420, true] : [x, foot, floor, false];
                });
            }
            const back = p => p.roof || p.wall || p.ground;
            this.drawList = [...solids.filter(back), ...solids.filter(p => !back(p))];
            solids.spatialIndex = new A.util.VerticalIndex(solids);
            this.drawIndex = new A.util.VerticalIndex(this.drawList, p => this.drawBounds(p));
            for (const w of this.saws) { w.x = w.cx; w.y = w.cy; }
            for (const b of this.balls) {
                const a = b.amp * Math.sin(b.phase);
                b.x = b.px + b.len * Math.sin(a); b.y = b.py + b.len * Math.cos(a);
            }
        }

        hurt(force = false) {
            if (this.dead > 0 || this.finished || (!force && this.s.testing === true && this.s.testInvincible === true)) return;
            this.dead = 1;
            this.deaths++;
            this.particles.burst(this.me.x + 13, this.me.y + 22, this.s.local.color, 22, 320, 0.7, 5);
            this.shake = 0.3;
        }

        biomeProgress(height) {
            let index = 0;
            for (let i = 1; i < this.checkpoints.length; i++) if (height >= -this.checkpoints[i].y) index = i;
            const start = -this.checkpoints[index].y;
            const end = index + 1 < this.checkpoints.length ? -this.checkpoints[index + 1].y : this.summitH;
            return index + clamp((height - start) / Math.max(1, end - start), 0, 1);
        }

        backdropBlend(viewTop, viewHeight) {
            const height = -(viewTop + Math.min(120, viewHeight * .18));
            let to = 0;
            for (let i = 1; i < this.checkpoints.length; i++) if (height >= -this.checkpoints[i].y) to = i;
            const distance = height + this.checkpoints[to].y;
            const u = to === 0 ? 1 : clamp(distance / 240, 0, 1);
            return { from: SKY_ROUTE[Math.max(0, to - 1)], to: SKY_ROUTE[to], amount: u * u * (3 - 2 * u) };
        }

        captureCheckpoint() {
            if (this.dead > 0 || this.finished) return;
            let destination = this.cp;
            for (const cp of this.checkpoints) if (cp.id > destination.id && this.me.y + this.me.h <= cp.y) destination = cp;
            if (destination === this.cp) return;
            this.cp = destination;
            this.retirePassedAreas();
            this.s.toast(`Checkpoint ${destination.id + 1} of ${this.checkpoints.length} saved by height · ${SKY_BIOMES[destination.biome].name}`, '#34d399');
            this.s.sfx('powerup');
        }

        spikeHits(body, spike) {
            if (!overlap(body, spike)) return false;
            for (let offset = 0; offset < spike.w; offset += 15) {
                const width = Math.min(15, spike.w - offset), x = spike.x + offset;
                if (body.x + body.w <= x || body.x >= x + width) continue;
                const nearest = clamp(x + width / 2, body.x, body.x + body.w);
                const surface = spike.y + Math.abs(nearest - x - width / 2) / (width / 2) * spike.h;
                if (body.y + body.h > surface && body.y < spike.y + spike.h) return true;
            }
            return false;
        }

        circleHits(body, hazard) {
            const x = clamp(hazard.x, body.x, body.x + body.w), y = clamp(hazard.y, body.y, body.y + body.h);
            return (hazard.x - x) ** 2 + (hazard.y - y) ** 2 < hazard.r ** 2;
        }

        // Pile drill cycle: rest retracted, shake as a warning, slam to the deck, hold, then retract.
        updateDrill(d, clock) {
            const u = (((clock + d.phase) % d.period) + d.period) % d.period / d.period;
            const up = d.mountY + 26, down = d.surfaceY - 2;
            const k = u < .6 ? 0 : u < .68 ? (u - .6) / .08 : u < .85 ? 1 : 1 - (u - .85) / .15;
            d.tipY = up + (down - up) * k;
            d.warn = u >= .45 && u < .6;
        }

        drillHits(body, d) {
            if (d.crusher) return overlap(body, { x: d.x - d.width / 2, y: d.tipY - 22, w: d.width, h: 22 });
            const shaft = { x: d.x - 6, y: d.mountY, w: 12, h: Math.max(0, d.tipY - 20 - d.mountY) };
            if (shaft.h > 0 && overlap(body, shaft)) return true;
            const bitTop = d.tipY - 20, yTop = Math.max(body.y, bitTop);
            if (yTop > d.tipY || body.y + body.h < bitTop) return false;
            const half = 12 * (d.tipY - yTop) / 20;
            return body.x < d.x + half && body.x + body.w > d.x - half;
        }

        inDeepSpace(body = this.me) {
            const launch = this.checkpoints.find(cp => cp.biome === 3);
            return !!launch && body.y + body.h <= launch.y + 60;
        }

        meteorPathBlocked(m, x, y, fromX = x, fromY = y) {
            const corridor = { x: Math.min(x, fromX) - 16, y: Math.min(y, fromY) - 60,
                w: m.w + Math.abs(x - fromX) + 32, h: m.h + Math.abs(y - fromY) + 76 };
            return (this.solids.spatialIndex?.query(corridor.y, corridor.y + corridor.h) || this.solids)
                .some(p => p !== m && !p.meteor && !p.off && overlap(corridor, p));
        }

        despawnMeteor(m, delay = m.respawnDelay) {
            if (this.me.ground === m) { this.me.ground = null; this.me.onGround = false; }
            m.off = true; m.spawned = false; m.delay = delay; m.dx = 0; m.dy = 0;
        }

        updateMeteor(m, dt) {
            m.dx = 0; m.dy = 0;
            if (m.meteorRide) {
                if (Math.abs(m.by - this.me.y) > 1400 && this.me.ground !== m) { this.despawnMeteor(m, 0); m.rideTime = 0; return; }
                if (!m.spawned) {
                    m.x = m.startX; m.y = m.startY; m.rideTime = 0; m.spawned = true; m.off = false;
                    return;
                }
                const leg = m.rideDuration + m.dwell, cycle = leg * 2;
                const time = (m.rideTime + dt) % cycle;
                const u = time < leg ? clamp((time - m.dwell) / m.rideDuration, 0, 1)
                    : 1 - clamp((time - leg - m.dwell) / m.rideDuration, 0, 1);
                const x = m.startX + (m.endX - m.startX) * u, y = m.startY + (m.endY - m.startY) * u;
                if (this.meteorPathBlocked(m, x, y, m.x, m.y)) return;
                m.rideTime = time; m.dx = x - m.x; m.dy = y - m.y; m.x = x; m.y = y;
                m.direction = time < leg ? Math.sign(m.endX - m.startX) : -Math.sign(m.endX - m.startX);
                m.verticalSpeed = time < leg ? -70 : 70;
                return;
            }
            if (Math.abs(m.by - this.me.y) > 1400) { this.despawnMeteor(m, 0); return; }
            if (m.delay > 0) { m.delay -= dt; return; }
            if (!m.spawned) {
                const viewWidth = this.viewWidth || 900;
                const viewLeft = this.camInit ? this.cam.x : m.anchorX - viewWidth / 2;
                let spawn;
                for (const direction of [m.direction, -m.direction]) {
                    for (let margin = 220; margin <= 700 && !spawn; margin += 160) {
                        const x = direction > 0 ? viewLeft - m.w - margin : viewLeft + viewWidth + margin;
                        for (let i = 0; i <= 20; i++) {
                            const y = m.by + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 50;
                            if (!this.meteorPathBlocked(m, x, y)) { spawn = { x, y, direction }; break; }
                        }
                    }
                    if (spawn) break;
                }
                if (!spawn) { this.despawnMeteor(m, .5); return; }
                m.x = spawn.x; m.y = spawn.y; m.direction = spawn.direction;
                m.viewLeft = viewLeft; m.viewWidth = viewWidth; m.travelTime = 0;
                m.endX = m.direction > 0 ? viewLeft + viewWidth + 350 : viewLeft - m.w - 350;
                m.spawned = true; m.off = false;
                return;
            }

            m.travelTime += dt;
            if (m.travelTime > 25 || this.meteorPathBlocked(m, m.x, m.y)) { this.despawnMeteor(m); return; }
            const x = m.x + m.direction * m.speed * dt, y = clamp(m.y + m.verticalSpeed * dt, m.by - 500, m.by + 500);
            if (this.meteorPathBlocked(m, x, y, m.x, m.y)) {
                m.direction *= -1; m.verticalSpeed *= -1;
                m.endX = m.direction > 0 ? m.viewLeft + m.viewWidth + 350 : m.viewLeft - m.w - 350;
                return;
            }
            m.dx = x - m.x; m.dy = y - m.y; m.x = x; m.y = y;
            if (Math.abs(m.y - m.by) >= 500) m.verticalSpeed = -Math.sign(m.y - m.by) * Math.abs(m.verticalSpeed);
            if (m.direction > 0 ? m.x > m.endX : m.x < m.endX) {
                this.despawnMeteor(m);
            }
        }

        retirePassedAreas() {
            if (this.cp.id <= (this.retiredArea || 0)) return;
            this.retiredArea = this.cp.id;
            const cutoff = this.cp.y + 1400;
            const keep = p => p.boundary || p.ground || (p.by ?? p.cy ?? p.y ?? p.py ?? 0) < cutoff;
            for (const list of [this.solids, this.movers, this.meteors, this.spikes, this.saws, this.lasers,
                this.springs, this.boxes, this.drills, this.crumbles, this.balls, this.blinkers, this.towers]) {
                let count = 0;
                for (const item of list) if (keep(item)) list[count++] = item;
                list.length = count;
            }
            this.drawList = this.drawList.filter(keep);
            this.solids.spatialIndex = new A.util.VerticalIndex(this.solids);
            this.drawIndex = new A.util.VerticalIndex(this.drawList, p => this.drawBounds(p));
            this.challenges = this.challenges.map(c => c && c.top < cutoff ? c : null);
            this.cityPath.length = 0; this.cityCrossings.length = 0;
        }

        static get testDestinations() { return SKY_ROUTE.map((biome, id) => ({ id, name: SKY_BIOMES[biome].name })); }
        testTeleport(index) {
            if (this.s.testing !== true || !Number.isInteger(index) || !this.checkpoints[index]) {
                this.s.toast('Biome teleport is only available for valid staff test destinations', '#fbbf24');
                return false;
            }
            this.build();
            this.retiredArea = 0;
            this.cp = this.checkpoints[index];
            Object.assign(this.me, { x: this.cp.x, y: this.cp.y - this.me.h - 2, vx: 0, vy: 0, onGround: false, ground: null });
            this.dead = 0; this.finished = false; this.dash = 0; this.kick = 0; this.buffer = 0; this.coyote = 0;
            this.airJumps = 1; this.carry = null; this.stuckT = 0; this.snapCam = true; this.camInit = false;
            this.tideY = this.cp.y + 1200; this.tideWarn = false; this.maxH = -this.cp.y; this.biomeSeen = index;
            this.s.setGoal(Math.round(this.maxH / 40)); this.s.toast(`Testing ${SKY_BIOMES[SKY_ROUTE[index]].name}`, '#67e8f9');
            return true;
        }

        update(dt) {
            const s = this.s, me = this.me, t = s.t;
            this.anim += dt; this.dtLast = dt;
            const freezeHazards = s.testing === true && s.testFreezeHazards === true;
            const hazardDt = freezeHazards ? 0 : dt;
            this.hazardAnim = (this.hazardAnim || 0) + hazardDt;
            const elapsed = ((typeof s.testPauseAt === 'number' ? s.testPauseAt : Date.now()) - s.startedAt) / 1000;
            if (freezeHazards) this.hazardOffset = (this.hazardOffset || 0) + Math.max(0, elapsed - (this.lastHazardElapsed ?? elapsed));
            this.lastHazardElapsed = elapsed;
            const clock = this.hazardClock = elapsed - (this.hazardOffset || 0);
            this.clock = clock;

            for (const m of this.movers) {
                if (freezeHazards) { m.dx = 0; m.dy = 0; continue; }
                if (m.meteor) { this.updateMeteor(m, dt); continue; }
                if (m.sinker) {
                    // rain clouds sag while someone stands on them and slowly float back up once they leave
                    const loaded = me.onGround && me.ground === m;
                    m.sunk = loaded ? Math.min(m.depth, m.sunk + 60 * dt) : Math.max(0, m.sunk - 35 * dt);
                    const ny = m.by + m.sunk;
                    m.dx = 0; m.dy = ny - m.y; m.y = ny;
                    continue;
                }
                if (m.vert) {
                    const ny = m.by + Math.sin(clock * m.speed + m.phase) * m.amp;
                    m.dx = 0; m.dy = ny - m.y; m.y = ny;
                    continue;
                }
                const nx = m.bx + Math.sin(clock * m.speed + m.phase) * m.amp;
                m.dx = nx - m.x; m.dy = 0; m.x = nx;
            }
            for (const p of this.blinkers) { const u = (this.hazardAnim + p.phase) % p.period; p.off = u > p.on; p.warn = !p.off && u > p.on - 0.6; }
            for (const c of this.crumbles) {
                if (c.gone > 0) { c.gone -= hazardDt; if (c.gone <= 0) { c.off = false; c.timer = 0; } continue; }
                if (c.timer > 0) { c.timer -= hazardDt; if (c.timer <= 0) { c.off = true; c.gone = 3; } }
            }
            for (const w of this.saws) { w.x = w.cx; w.y = w.cy + Math.sin(clock * w.speed + w.phase) * w.amp; }
            for (const d of this.drills) this.updateDrill(d, clock);
            for (const b of this.balls) {
                const a = b.amp * Math.sin(clock * b.speed + b.phase);
                b.x = b.px + b.len * Math.sin(a); b.y = b.py + b.len * Math.cos(a);
            }
            for (const b of this.boxes) if (b.t > 0) b.t -= hazardDt;

            if (s.testing === true && s.testFlight === true) {
                const configured = Number.isFinite(s.testFlySpeed) ? clamp(s.testFlySpeed, 100, 3000) : 600;
                const speed = configured * (s.down('ShiftLeft', 'ShiftRight') ? 11 / 6 : 1);
                const axis = s.axis(), vertical = Number(s.down('KeyS', 'ArrowDown')) - Number(s.down('KeyW', 'ArrowUp', 'Space'));
                me.vx = axis.x * speed; me.vy = vertical * speed;
                me.x = clamp(me.x + me.vx * dt, 0, this.WIDTH - me.w);
                me.y = clamp(me.y + me.vy * dt, -this.summitH - 400, -me.h);
                me.ground = null; me.onGround = false;
                this.dead = 0; this.dash = 0; this.buffer = 0; this.kick = 0;
                this.maxH = Math.max(this.maxH, -(me.y + me.h));
                this.captureCheckpoint();
                this.tideY = Math.max(this.tideY, me.y + 1200);
                this.state = 0;
                this.particles.update(dt, 600);
                return;
            }

            if (this.dead > 0) {
                this.dead -= dt;
                if (this.dead <= 0) {
                    const spot = this.cp;
                    me.x = spot.x; me.y = spot.y - me.h - 2; me.vx = 0; me.vy = 0; this.dash = 0; this.kick = 0;
                    this.tideY = spot.y + 900; this.tideWarn = false; this.snapCam = true;
                }
                this.state = 4;
                this.particles.update(dt, 600);
                return;
            }

            if (this.finished) { me.vx *= 0.9; }
            // Safety net: R (or being stuck for a few seconds) returns you to the last checkpoint
            if (!this.finished) {
                this.captureCheckpoint();
                this.stuckT = (this.stuckT || 0) + dt;
                if (Math.hypot(me.x - (this.stuckX ?? me.x), me.y - (this.stuckY ?? me.y)) > 80 || this.stuckX === undefined) { this.stuckX = me.x; this.stuckY = me.y; this.stuckT = 0; }
                const idle = s.game.res.value >= 0.5 && this.stuckT > 5 && !me.ground?.mover;
                if (idle && !this.stuckHinted) { this.stuckHinted = true; s.toast('Stuck? Press R to return to your checkpoint', '#fbbf24'); }
                if (this.stuckT < 5) this.stuckHinted = false;
                if (s.pressed('KeyR')) { this.stuckT = 0; this.hurt(true); return; }
            }
            const exhausted = !this.finished && s.game.res.value < 0.5;
            if (exhausted && !this.wasExhausted) s.toast('Out of energy — no control! Press Q for a question', '#f87171');
            this.wasExhausted = exhausted;

            const deepSpace = this.inDeepSpace();
            if (!this.finished && !deepSpace && this.cp.id > 0 && !(s.testing === true && s.testNoTide === true)) {
                this.tideY -= (24 + Math.min(3, Math.floor(this.biomeProgress(this.maxH))) * 6) * dt;
                this.tideY = Math.min(this.tideY, me.y + 1700);
                const gap = this.tideY - (me.y + me.h);
                if (gap < 420 && !this.tideWarn) { this.tideWarn = true; s.toast('The tide is rising — keep climbing!', '#fb923c'); }
                else if (gap > 800) this.tideWarn = false;
            } else if (deepSpace) {
                this.tideY = Math.max(this.tideY, me.y + 1500);
                this.tideWarn = false;
            }

            this.wallDir = 0;
            if (!me.onGround && !this.finished && !exhausted && this.dash <= 0) {
                const L = { x: me.x - 5, y: me.y + 6, w: 5, h: me.h - 12 }, R = { x: me.x + me.w, y: me.y + 6, w: 5, h: me.h - 12 };
                for (const p of this.solids.spatialIndex?.query(me.y - 64, me.y + me.h + 64) || this.solids) {
                    if (!p.wallJ) continue;
                    if (overlap(L, p)) { this.wallDir = -1; break; }
                    if (overlap(R, p)) { this.wallDir = 1; break; }
                }
            }
            // Wind never overpowers a player: it is weaker in the air than a run, ignored while dashing, and nearly cancelled when pushing against it.
            let windPush = 0;
            for (const wz of this.winds) {
                if (overlap(me, wz) && Math.abs(wz.fx) > Math.abs(windPush)) windPush = wz.fx;
            }
            if (windPush && this.dash <= 0) {
                const inputAx = this.finished ? 0 : s.axis().x;
                const against = inputAx && Math.sign(inputAx) === -Math.sign(windPush);
                me.x += windPush * dt * (me.onGround ? 0.7 : 1.15) * (against ? 0.75 : 1);
            }

            const ax = this.finished || exhausted ? 0 : s.axis().x;
            if (ax && !this.finished) s.game.res.drain((me.onGround ? 2 : 1.2) * dt);
            const speedMul = this.boost > 0 ? 1.3 : this.slow > 0 ? 0.6 : 1;
            this.boost = Math.max(0, this.boost - dt);
            this.slow = Math.max(0, this.slow - dt);
            this.dashCd -= dt;
            const prevGround = me.ground;
            if (prevGround && !prevGround.off && (prevGround.dx || prevGround.dy)) {
                me.x += prevGround.dx || 0; me.y += prevGround.dy || 0;
                // ride exactly on the deck: rounding must never sink feet into it and trigger a sideways push-out
                if (!prevGround.slope && !prevGround.off) me.y = prevGround.y - me.h;
            }
            if (prevGround && prevGround.belt) me.x += prevGround.belt * hazardDt;

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
                me.vy = Math.min(deepSpace ? 650 : 1150, me.vy + (deepSpace ? 650 : 2300) * dt);
                if (this.wallDir && me.vy > 130) me.vy = 130;
                if (!s.down('Space', 'ArrowUp', 'KeyW') && !s.stickJumpHeld && me.vy < -250 && !this.sprung) me.vy += (deepSpace ? 600 : 2600) * dt;
                if (!exhausted && s.pressed('ShiftLeft', 'ShiftRight') && this.dashCd <= 0 && !this.finished && s.spend(25)) {
                    this.dash = 0.16; this.dashCd = 0.9; s.sfx('dash');
                }
            }
            if (me.onGround) { this.coyote = 0.1; this.airJumps = 1; this.sprung = false; } else this.coyote -= dt;
            if ((s.pressed('Space', 'ArrowUp', 'KeyW') || (s.stickJumpHeld && me.onGround)) && !this.finished && !exhausted) this.buffer = 0.13; else this.buffer -= dt;
            if (this.buffer > 0) {
                if (this.coyote > 0) {
                    if (!s.spend(6)) { this.buffer = 0; } else {
                        me.vy = deepSpace ? -560 : -850; this.coyote = 0; this.buffer = 0; s.sfx('jump');
                        this.particles.burst(me.x + 13, me.y + me.h, '#cbd5e1', 6, 90, 0.3, 4);
                    }
                } else if (this.wallDir && s.spend(10)) {
                    me.vy = -820; me.vx = -this.wallDir * 400; me.face = -this.wallDir; this.kick = 0.22; this.buffer = 0; this.sprung = false;
                    this.airJumps = Math.max(this.airJumps, 1); s.sfx('jump');
                    this.particles.burst(me.x + (this.wallDir > 0 ? me.w : 0), me.y + 22, '#e2e8f0', 8, 120, 0.3, 4);
                } else if (this.airJumps > 0 && s.spend(12)) {
                    me.vy = deepSpace ? -520 : -780; this.airJumps--; this.buffer = 0; s.sfx('jump');
                    this.particles.burst(me.x + 13, me.y + me.h, '#7dd3fc', 10, 140, 0.35, 4);
                }
            }

            const wasAir = !me.onGround, previousFeet = me.y + me.h;
            moveBody(me, this.solids, dt);
            if (me.onGround && wasAir) this.particles.burst(me.x + 13, me.y + me.h, '#94a3b8', 5, 70, 0.25, 3);
            if (me.onGround && me.ground?.crumble && me.ground.timer <= 0 && !me.ground.off) me.ground.timer = 0.5;

            const box = { x: me.x + 3, y: me.y + 3, w: me.w - 6, h: me.h - 6 };
            for (const sp of this.springs) {
                if (me.x + me.w > sp.x - 4 && me.x < sp.x + sp.w + 4 && me.vy >= 0
                    && previousFeet <= sp.y + sp.h + 8 && me.y + me.h >= sp.y - 3) {
                    me.vy = sp.bi === 3 ? -720 : -1280; me.onGround = false; me.ground = null;
                    this.sprung = true; this.airJumps = 1; s.sfx('powerup'); sp.hit = this.anim;
                    this.particles.burst(sp.x + 23, sp.y, sp.bi === 2 ? '#ffffff' : '#fbbf24', 12, 160, 0.4, 4);
                }
            }
            if (!this.finished) {
                this.captureCheckpoint();
                for (const sp of this.spikes) if (this.spikeHits(box, sp)) this.hurt();
                for (const w of this.saws) if (this.circleHits(box, w)) this.hurt();
                for (const d of this.drills) if (this.drillHits(box, d)) this.hurt();
                for (const b of this.balls) if (this.circleHits(box, b)) this.hurt();
                if (me.y + me.h > this.tideY && !(s.testing === true && s.testNoTide === true)) this.hurt();
                for (const l of this.lasers) {
                    const on = ((clock + l.phase) % l.period) < l.period * 0.55;
                    l.on = on;
                    if (on && overlap(box, l)) this.hurt();
                }
                if (me.y > this.cp.y + 800 || (this.cp.id === 0 && this.maxH > 500 && me.onGround && me.ground?.ground)) this.hurt();
                for (const b of this.boxes) {
                    if (b.t > 0) continue;
                    b.t = 1e9; // question boxes are disabled in the parkour climb
                }
                if (me.onGround && me.ground === this.summit) {
                    this.finished = true;
                    s.done = true; s.finishMs = Math.round(s.t * 1000);
                    s.toast('FINISH! Waiting for the others…', '#facc15');
                    this.particles.burst(me.x, me.y, '#facc15', 40, 400, 1, 6);
                }
            }
            this.maxH = Math.max(this.maxH, -(me.y + me.h));
            s.score = Math.round(this.maxH / 40);
            s.setGoal(Math.round(this.maxH / 40));
            const bi = Math.min(SKY_ROUTE.length - 1, Math.floor(this.biomeProgress(this.maxH)));
            if (bi > this.biomeSeen) { this.biomeSeen = bi; s.toast(`Entering ${SKY_BIOMES[SKY_ROUTE[bi]].name}`, '#fbbf24'); s.sfx('powerup'); }
            this.state = this.dash > 0 ? 3 : !me.onGround ? 2 : Math.abs(me.vx) > 40 ? 1 : 0;
            this.particles.update(dt, 500);
        }

        net() {
            const m = this.me;
            return { x: Math.round(m.x), y: Math.round(m.y), vx: Math.round(m.vx), vy: Math.round(m.vy), f: m.face, a: this.state };
        }

        goalText() { const current = Math.max(0, -(this.me.y + this.me.h)); return `Checkpoint ${this.cp.id + 1}/${this.checkpoints.length} · Height ${Math.round(current / 40)}m · Best ${Math.round(this.maxH / 40)}m / ${Math.round(this.summitH / 40)}m · ${SKY_BIOMES[SKY_ROUTE[Math.min(SKY_ROUTE.length - 1, Math.floor(this.biomeProgress(current)))]].name}`; }
        touchLayout() {
            if (this.s.testing === true && this.s.testFlight === true) return { stick: true, buttons: [{ k: 'KeyW', label: 'Fly up', cls: 'main' }, { k: 'KeyS', label: 'Fly down' }, { k: 'ShiftLeft', label: 'Fast' }] };
            return { stick: true, buttons: [{ k: 'Space', label: 'Jump', cls: 'main' }, { k: 'ShiftLeft', label: 'Dash' }] };
        }
        hint() { return 'Scale city walls, cross factory machinery and explore low-gravity space · Wait at marked ledges, board a meteor and ride it to the landing beacon · Biome checkpoints save automatically by height · A/D run · Space double jump · Shift dash · R = checkpoint · Q = recharge'; }

        drawArchitecture(ctx, p, top, bottom) {
            const B = SKY_BIOMES[p.bi || 0], low = this.s.graphics?.low || this.s.lowDetail;
            if (p.bridge) {
                ctx.fillStyle = B.body; ctx.fillRect(p.x, p.y, p.w, p.h);
                ctx.fillStyle = B.ledgeTop; ctx.fillRect(p.x, p.y, p.w, 5);
                ctx.fillStyle = '#1e293b'; ctx.fillRect(p.x + 4, p.y + 10, p.w - 8, 10);
                ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath();
                for (let x = p.x + 12; x < p.x + p.w - 20; x += 44) {
                    ctx.moveTo(x, p.y + 9); ctx.lineTo(x + 30, p.y + 22);
                    ctx.moveTo(x + 30, p.y + 9); ctx.lineTo(x, p.y + 22);
                }
                ctx.stroke();
                ctx.fillStyle = '#fbbf24';
                const hatch = p.x === 0 ? p.x + p.w - 18 : p.x + 4;
                ctx.fillRect(hatch, p.y, 14, 5);
                return;
            }
            const colors = [['#475569', '#334155', '#cbd5e1'], ['#785448', '#503b37', '#d6b599'], ['#52646a', '#33454b', '#a5c4cc']];
            const material = colors[p.style || 0];
            const body = mixHex(B.body, material[0], .2), shade = mixHex(B.body, '#0f172a', .3), trim = B.edge;
            const gradient = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
            gradient.addColorStop(0, shade); gradient.addColorStop(.55, body); gradient.addColorStop(1, shade);
            ctx.fillStyle = low ? body : gradient; ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = trim; ctx.fillRect(p.x, p.y, p.w, 8);
            ctx.fillStyle = shade; ctx.fillRect(p.x, p.y + 8, p.w, 6);
            const edge = p.x === 0 ? p.x + p.w - 18 : p.x + 10;
            ctx.fillStyle = trim; ctx.fillRect(edge, p.y + 14, 8, p.h - 14);
            if (low) return;
            for (let yy = Math.ceil((p.y + 24) / 76) * 76; yy < p.y + p.h - 34; yy += 76) {
                if (yy < top - 60 || yy > bottom) continue;
                ctx.fillStyle = 'rgba(15,23,42,.2)'; ctx.fillRect(p.x + 10, yy + 54, p.w - 20, 3);
                for (let xx = p.x + 34; xx < p.x + p.w - 42; xx += 62) {
                    const lit = ihash(Math.round(xx), Math.round(yy)) % 4 === 0;
                    ctx.fillStyle = shade; ctx.fillRect(xx - 3, yy - 3, 35, 46);
                    ctx.fillStyle = lit ? B.accent : mixHex(B.body, '#0f172a', .6); ctx.fillRect(xx, yy, 29, 38);
                    ctx.fillStyle = trim; ctx.fillRect(xx + 13, yy, 3, 38); ctx.fillRect(xx, yy + 18, 29, 3);
                    ctx.fillRect(xx - 4, yy + 38, 37, 4);
                }
            }
            ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.beginPath();
            const pipeX = p.x === 0 ? edge - 18 : edge + 26;
            ctx.moveTo(pipeX, p.y + 18); ctx.lineTo(pipeX, p.y + p.h - 18);
            ctx.stroke();
            ctx.fillStyle = shade;
            for (let yy = p.y + 46; yy < p.y + p.h - 18; yy += 100) ctx.fillRect(pipeX - 5, yy, 10, 5);
            if (p.bi === 2) {
                ctx.strokeStyle = '#4d7c62'; ctx.lineWidth = 3; ctx.beginPath();
                ctx.moveTo(edge - 8, p.y + 18); ctx.lineTo(edge - 8, p.y + p.h - 16); ctx.stroke();
                ctx.fillStyle = '#86b99a';
                for (let yy = p.y + 34; yy < p.y + p.h - 20; yy += 36) {
                    ctx.beginPath(); ctx.ellipse(edge - 13, yy, 7, 3, -.6, 0, TAU); ctx.fill();
                }
            } else if (p.bi === 1) {
                for (let yy = p.y + 22; yy < p.y + p.h - 10; yy += 48) {
                    ctx.fillStyle = '#fbbf24'; ctx.fillRect(edge - 4, yy, 16, 8);
                    ctx.fillStyle = '#292524'; ctx.fillRect(edge + 2, yy, 4, 8);
                }
            } else if (p.bi === 3) {
                ctx.fillStyle = '#c4b5fd'; ctx.fillRect(edge + 2, p.y + 18, 2, p.h - 36);
            }
        }

        // Riveted I-beam columns with cross bracing; open columns fade out into the haze below.
        drawGirders(ctx, p) {
            const [a, b] = p.beams, low = this.s.graphics?.low || this.s.lowDetail;
            const column = ([x, y0, y1, open]) => {
                const len = y1 - y0;
                if (len < 8) return;
                if (open) {
                    for (let i = 0; i < 3; i++) {
                        ctx.globalAlpha = 1 - i * .33;
                        ctx.fillStyle = '#292524'; ctx.fillRect(x - 6, y0 + len * i / 3, 12, len / 3 + 1);
                        ctx.fillStyle = '#78716c'; ctx.fillRect(x - 3, y0 + len * i / 3, 6, len / 3 + 1);
                    }
                    ctx.globalAlpha = 1;
                } else {
                    ctx.fillStyle = '#292524'; ctx.fillRect(x - 6, y0, 12, len);
                    ctx.fillStyle = '#78716c'; ctx.fillRect(x - 3, y0, 6, len);
                    ctx.fillStyle = '#44403c'; ctx.fillRect(x - 11, y1 - 5, 22, 5);
                }
                ctx.fillStyle = '#a8a29e'; ctx.fillRect(x - 6, y0, 2, open ? len * .5 : len);
                ctx.fillStyle = '#facc15'; ctx.fillRect(x - 9, y0 - 1, 18, 4);
            };
            column(a); column(b);
            if (low) return;
            const yTop = Math.max(a[1], b[1]) + 18, yEnd = Math.min(a[2], b[2]) - (a[3] || b[3] ? 160 : 14);
            ctx.strokeStyle = '#57534e'; ctx.lineWidth = 3; ctx.beginPath();
            if (b[0] - a[0] < 380) {
                for (let y = yTop; y + 60 <= yEnd; y += 70) {
                    ctx.moveTo(a[0], y); ctx.lineTo(b[0], y + 60); ctx.moveTo(b[0], y); ctx.lineTo(a[0], y + 60);
                    ctx.moveTo(a[0], y); ctx.lineTo(b[0], y);
                }
            } else {
                // wide decks hang a shallow Warren truss between the columns
                const y0 = Math.max(a[1], b[1]) + 2, step = (b[0] - a[0]) / Math.max(2, Math.round((b[0] - a[0]) / 60));
                ctx.moveTo(a[0], y0 + 26); ctx.lineTo(b[0], y0 + 26);
                for (let x = a[0]; x < b[0] - 1; x += step) { ctx.moveTo(x, y0 + 26); ctx.lineTo(x + step / 2, y0); ctx.lineTo(x + step, y0 + 26); }
                for (const x of [a[0], b[0]]) { ctx.moveTo(x, y0 + 70); ctx.lineTo(x + (x === a[0] ? 40 : -40), y0 + 26); }
            }
            ctx.stroke();
            ctx.fillStyle = '#d6d3d1';
            for (const [x, y0] of [a, b]) for (let y = y0 + 14; y < y0 + 60; y += 16) { ctx.fillRect(x - 1, y, 2, 2); }
        }

        drawPlatformSupport(ctx, p) {
            if (p.bi === 1) {
                const chamber = this.challenges[p.chamber];
                if (!chamber || p.prop || p.slope || p.factoryLift) return;
                const center = p.x + p.w / 2, anchor = center < chamber.middle ? chamber.left + 14 : chamber.right - 14;
                const attach = center < chamber.middle ? p.x + 16 : p.x + p.w - 16;
                ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 10; ctx.beginPath();
                ctx.moveTo(anchor, p.y + p.h + 42); ctx.lineTo(attach, p.y + p.h + 42); ctx.lineTo(attach, p.y + p.h); ctx.stroke();
                ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(attach, p.y + p.h + 42, 5, 0, TAU); ctx.fill();
                return;
            }
            if (p.beams) { this.drawGirders(ctx, p); return; }
            const c = this.challenges[p.chamber];
            if (!c || p.wall || p.prop || p.island || p.motif === 'rooftop-room' || p === c.exit) return;
            const B = SKY_BIOMES[p.bi || 0], center = p.x + p.w / 2;
            if (p.bi === 2 || p.bi === 3) return;
            const side = center < (c.left + c.right) / 2 ? -1 : 1;
            const support = c.nodes.find(s => s.island && s !== p && s.y > p.y + p.h);
            if (!support) return;
            const anchor = clamp(center + side * 110, support.x + 12, support.x + support.w - 12);
            const tip = side < 0 ? p.x + Math.min(36, p.w / 3) : p.x + p.w - Math.min(36, p.w / 3);
            const yy = p.y + p.h - 2;
            ctx.strokeStyle = mixHex(B.edge, B.body, .45); ctx.lineWidth = 4; ctx.beginPath();
            if (p.mover) {
                const x0 = p.bx - p.amp, x1 = p.bx + p.w + p.amp;
                ctx.moveTo(x0, p.by - 70); ctx.lineTo(x1, p.by - 70);
                ctx.moveTo(p.x + 16, p.by - 70); ctx.lineTo(p.x + 16, p.y);
                ctx.moveTo(p.x + p.w - 16, p.by - 70); ctx.lineTo(p.x + p.w - 16, p.y);
                ctx.moveTo(anchor, p.by - 70); ctx.lineTo(side < 0 ? x0 : x1, p.by - 70);
                ctx.moveTo(anchor, p.by - 70); ctx.lineTo(anchor, p.by + 68);
            } else {
                ctx.moveTo(anchor, yy); ctx.lineTo(tip, yy);
                ctx.moveTo(anchor, yy + 68); ctx.lineTo(tip, yy);
                ctx.moveTo(anchor, yy); ctx.lineTo(anchor, yy + 68);
                ctx.moveTo(tip, yy); ctx.lineTo(tip, p.y + p.h - 6);
            }
            ctx.stroke();
            ctx.fillStyle = B.edge; ctx.fillRect(anchor - 5, p.mover ? p.by - 76 : yy - 8, 10, 16);
        }

        drawBounds(p) {
            if (p.meteorRide) return { y: p.endY - 60, h: p.startY - p.endY + p.h + 120 };
            if (p.meteor) return { y: p.by - 500, h: p.h + 1000 };
            if (p.factoryBelt) return { y: p.y - 10, h: Math.max(p.h, 80) + 20 };
            if (p.factoryLift) return { y: p.by - p.amp - 180, h: p.h + p.amp * 2 + 205 };
            if (p.bladeSign) return { y: p.y - 30, h: p.stiltY - p.y + 30 };
            if (p.gondola) return { y: p.cableTop - 20, h: p.by + p.amp + p.h + 20 - p.cableTop };
            if (p.sinker) return { y: p.by - 10, h: p.h + p.depth + 100 };
            if (p.mover && p.vert) return { y: p.by - p.amp, h: p.h + p.amp * 2 + (p.bi === 2 ? 60 : 0) };
            if (p.wallX !== undefined) return { y: p.y - 60, h: p.h + 140 };
            if (p.bi === 2 && !p.prop) return { y: p.y - 10, h: (p.roof ? p.bodyH || p.h : p.h) + 150 };
            if (p.beams) return { y: p.y - 80, h: Math.max(p.beams[0][2], p.beams[1][2]) - p.y + 90 };
            const supported = p.chamber !== undefined && !p.prop && (p.bi === 1 || (!p.island && p.bi === 0));
            return { y: p.y - (supported ? 80 : 0), h: (p.roof ? p.bodyH || p.h : p.h) + (supported ? 160 : 0) };
        }

        // Scale crossing: a vertical blade billboard on roof stilts faces a climbing rail bolted to the taller tower.
        drawScaleRig(ctx, p) {
            if (p.climbRail) {
                ctx.fillStyle = '#334155'; ctx.fillRect(p.x, p.y, p.w, p.h);
                ctx.fillStyle = '#facc15'; ctx.fillRect(p.x - 3, p.y, 3, p.h);
                ctx.fillStyle = '#94a3b8';
                for (let y = p.y + 20; y < p.y + p.h; y += 46) { ctx.fillRect(p.x - 7, y, 15, 5); ctx.fillStyle = '#64748b'; ctx.fillRect(p.x - 7, y + 5, 15, 2); ctx.fillStyle = '#94a3b8'; }
                return;
            }
            const bottom = p.y + p.h, glow = ['#f472b6', '#38bdf8', '#facc15'][p.hue || 0];
            if (p.scaleTower) {
                ctx.fillStyle = '#334155'; ctx.fillRect(p.x, p.y, p.w, p.h);
                ctx.fillStyle = '#64748b'; ctx.fillRect(p.x, p.y, p.w, 12);
                const top = Math.max(p.y + 30, this.cam.y - 100), end = Math.min(bottom, this.cam.y + (this.viewHeight || 900) + 100);
                for (let y = top - ((top - p.y - 30) % 65); y < end; y += 65) {
                    ctx.fillStyle = '#a5d9ed';
                    for (let x = p.x + 16; x < p.x + p.w - 12; x += 32) ctx.fillRect(x, y, 18, 28);
                }
                ctx.fillStyle = '#475569';
                for (const x of [p.x, p.x + p.w - 18]) ctx.fillRect(x, bottom, 18, p.stiltY - bottom);
                ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.moveTo(p.x + 18, bottom + 40);
                ctx.quadraticCurveTo(p.x + p.w / 2, bottom - 10, p.x + p.w - 18, bottom + 40); ctx.stroke();
                return;
            }
            ctx.fillStyle = '#475569';
            for (const sx of [p.x + 6, p.x + p.w - 12]) ctx.fillRect(sx, bottom, 6, p.stiltY - bottom);
            ctx.strokeStyle = '#475569'; ctx.lineWidth = 3; ctx.beginPath();
            ctx.moveTo(p.x + 9, bottom + 10); ctx.lineTo(p.x + p.w - 9, bottom + 70); ctx.moveTo(p.x + p.w - 9, bottom + 10); ctx.lineTo(p.x + 9, bottom + 70);
            ctx.stroke();
            ctx.fillStyle = '#334155'; ctx.fillRect(p.x - 2, p.stiltY - 6, p.w + 4, 6);
            ctx.fillStyle = '#0f172a'; roundRect(ctx, p.x, p.y, p.w, p.h, 6); ctx.fill();
            ctx.fillStyle = glow; ctx.globalAlpha = .85;
            ctx.fillRect(p.x + 8, p.y + 10, p.w - 16, p.h - 20);
            ctx.globalAlpha = 1; ctx.fillStyle = '#0f172a';
            for (let y = p.y + 34; y < bottom - 24; y += 52) ctx.fillRect(p.x + 8, y, p.w - 16, 10);
            ctx.fillStyle = '#e2e8f0'; ctx.fillRect(p.x + p.w - 4, p.y + 4, 4, p.h - 8);
        }

        drawTower(ctx, p, top, bottom) {
            this.drawArchitecture(ctx, { ...p, h: Math.min(p.h, bottom - p.y + 80) }, top, bottom);
            const low = this.s.graphics?.low || this.s.lowDetail;
            // parapet cap and a darker roof membrane make the walkable top read clearly
            ctx.fillStyle = '#94a3b8'; ctx.fillRect(p.x, p.y, p.w, 6);
            ctx.fillStyle = '#1e293b'; ctx.fillRect(p.x + 8, p.y + 6, p.w - 16, 4);
            if (!low) {
                ctx.fillStyle = 'rgba(15,23,42,.35)';
                for (let x = p.x + 40; x < p.x + p.w - 30; x += 120) ctx.fillRect(x, p.y + 1, 3, 5);
            }
            this.drawDecor(ctx, p);
        }

        // Steel brackets and arms tie every wall fixture back into its building.
        drawWallMount(ctx, p) {
            const side = p.wallSide, wx = p.wallX, near = side > 0 ? p.x : p.x + p.w, outer = side > 0 ? p.x + p.w - 12 : p.x + 12;
            ctx.strokeStyle = '#64748b'; ctx.lineWidth = 4; ctx.beginPath();
            if (p.far) {
                const arm = p.y + p.h + 2;
                ctx.moveTo(wx, arm); ctx.lineTo(outer, arm);
                ctx.moveTo(wx, arm + 64); ctx.lineTo(near + side * 18, arm);
                ctx.stroke();
                ctx.lineWidth = 2; ctx.strokeStyle = '#94a3b8'; ctx.beginPath();
                ctx.moveTo(wx, arm - 1); ctx.lineTo(outer, arm - 1);
            } else if (p.mount === 'awning') {
                const lowX = side > 0 ? p.x + p.w - 8 : p.x + 8;
                ctx.lineWidth = 2;
                ctx.moveTo(wx, p.y - 46); ctx.lineTo(lowX, A.util.slopeY(p, lowX) + 2);
            } else {
                const yy = p.y + p.h;
                ctx.moveTo(wx, yy + 44); ctx.lineTo(outer, yy);
                ctx.moveTo(wx, yy + 1); ctx.lineTo(outer, yy + 1);
            }
            ctx.stroke();
            ctx.fillStyle = '#334155';
            const plateY = p.far ? p.y + p.h - 6 : p.mount === 'awning' ? p.y - 52 : p.y + p.h - 4;
            ctx.fillRect(side > 0 ? wx : wx - 8, plateY, 8, p.far ? 80 : 54);
        }

        drawMountPiece(ctx, p) {
            const side = p.wallSide;
            if (p.mount === 'awning') {
                const stripes = 6, step = p.w / stripes;
                for (let i = 0; i < stripes; i++) {
                    const x0 = p.x + i * step, x1 = x0 + step;
                    ctx.fillStyle = i % 2 ? '#f8fafc' : '#dc2626';
                    ctx.beginPath(); ctx.moveTo(x0, A.util.slopeY(p, x0)); ctx.lineTo(x1, A.util.slopeY(p, x1));
                    ctx.lineTo(x1, A.util.slopeY(p, x1) + 10); ctx.lineTo(x0, A.util.slopeY(p, x0) + 10); ctx.closePath(); ctx.fill();
                }
                const lowX = side > 0 ? p.x + p.w : p.x, lowY = A.util.slopeY(p, lowX);
                ctx.fillStyle = '#dc2626';
                for (let k = 0; k < 4; k++) {
                    const sx = lowX - side * (k * 14 + 7);
                    ctx.beginPath(); ctx.arc(sx, lowY + 10, 7, 0, Math.PI); ctx.fill();
                }
                ctx.strokeStyle = '#fecaca'; ctx.lineWidth = 2; ctx.beginPath();
                for (let i = 0; i <= 24; i++) { const x = p.x + p.w * i / 24; if (i) ctx.lineTo(x, A.util.slopeY(p, x)); else ctx.moveTo(x, A.util.slopeY(p, x)); }
                ctx.stroke();
            } else if (p.mount === 'ac') {
                ctx.fillStyle = '#94a3b8'; roundRect(ctx, p.x, p.y, p.w, p.h, 4); ctx.fill();
                ctx.fillStyle = '#e2e8f0'; ctx.fillRect(p.x + 2, p.y, p.w - 4, 4);
                ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h / 2 + 2, 13, 0, TAU); ctx.fill();
                ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath();
                const spin = this.anim * 8;
                for (let k = 0; k < 3; k++) { const a = spin + k * TAU / 3; ctx.moveTo(p.x + p.w / 2, p.y + p.h / 2 + 2); ctx.lineTo(p.x + p.w / 2 + Math.cos(a) * 11, p.y + p.h / 2 + 2 + Math.sin(a) * 11); }
                ctx.stroke();
            } else if (p.mount === 'sign') {
                const hue = ['#38bdf8', '#f472b6', '#facc15', '#34d399'][ihash(Math.round(p.x), Math.round(p.y)) % 4];
                ctx.fillStyle = '#0f172a'; roundRect(ctx, p.x, p.y, p.w, p.h, 4); ctx.fill();
                ctx.strokeStyle = hue; ctx.lineWidth = 2; roundRect(ctx, p.x + 4, p.y + 9, p.w - 8, p.h - 13, 3); ctx.stroke();
                ctx.fillStyle = hue;
                for (let x = p.x + 12; x < p.x + p.w - 14; x += 16) ctx.fillRect(x, p.y + 19, 10, 10);
                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(p.x, p.y, p.w, 5);
            } else {
                ctx.fillStyle = '#475569'; roundRect(ctx, p.x, p.y, p.w, p.h, 3); ctx.fill();
                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(p.x, p.y, p.w, 5);
                ctx.fillStyle = '#334155'; ctx.fillRect(p.x, p.y + p.h - 4, p.w, 4);
            }
        }

        // Cables, davits and rails stay visible even while their car is far away.
        drawCityRig(ctx, p) {
            ctx.lineWidth = 2; ctx.strokeStyle = '#94a3b8'; ctx.beginPath();
            if (p.gondola) {
                const l = p.x + 10, r = p.x + p.w - 10;
                if (p.spanX0 !== undefined) {
                    // overhead I-beam span with a trolley the cables hang from
                    ctx.fillStyle = '#334155'; ctx.fillRect(p.spanX0, p.cableTop - 7, p.spanX1 - p.spanX0, 14);
                    ctx.fillStyle = '#64748b'; ctx.fillRect(p.spanX0, p.cableTop - 7, p.spanX1 - p.spanX0, 3);
                    ctx.fillStyle = '#1e293b'; roundRect(ctx, l - 6, p.cableTop - 10, r - l + 12, 20, 5); ctx.fill();
                    ctx.fillStyle = '#94a3b8'; for (const x of [l + 6, r - 6]) { ctx.beginPath(); ctx.arc(x, p.cableTop, 5, 0, TAU); ctx.fill(); }
                } else {
                    // roof davit: mast, boom arm reaching over the edge and a pulley block above each cable
                    const dir = Math.sign(p.x + p.w / 2 - p.davitX) || 1, tip = dir > 0 ? Math.max(r + 8, p.davitX + 30) : Math.min(l - 8, p.davitX - 30);
                    ctx.fillStyle = '#334155'; ctx.fillRect(p.davitX - 5, p.cableTop - 4, 10, p.davitY - p.cableTop + 4);
                    ctx.fillRect(Math.min(p.davitX, tip), p.cableTop - 6, Math.abs(tip - p.davitX), 10);
                    ctx.strokeStyle = '#475569'; ctx.lineWidth = 3; ctx.beginPath();
                    ctx.moveTo(p.davitX, p.cableTop + 40); ctx.lineTo(p.davitX + dir * 40, p.cableTop + 4); ctx.stroke();
                    ctx.fillStyle = '#1e293b'; ctx.fillRect(p.davitX - 12, p.davitY - 8, 24, 8);
                    ctx.fillStyle = '#94a3b8'; for (const x of [l, r]) { ctx.beginPath(); ctx.arc(x, p.cableTop + 4, 5, 0, TAU); ctx.fill(); }
                }
                ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.beginPath();
                for (const x of [l, r]) { ctx.moveTo(x, p.cableTop + 4); ctx.lineTo(x, p.y - 26); }
                ctx.stroke();
                return;
            }
            const yy = p.by + p.h + 10;
            ctx.lineWidth = 5; ctx.strokeStyle = '#475569';
            ctx.moveTo(p.railX0, yy); ctx.lineTo(p.railX1, yy); ctx.stroke();
            ctx.fillStyle = '#334155'; ctx.fillRect(p.railX0, yy - 8, 10, 22); ctx.fillRect(p.railX1 - 10, yy - 8, 10, 22);
        }

        drawCityCar(ctx, p) {
            if (p.gondola) {
                // window-washer cradle: deck, back mesh panel, top rail where both cables clip on
                const l = p.x + 10, r = p.x + p.w - 10;
                ctx.fillStyle = 'rgba(148,163,184,.18)'; ctx.fillRect(p.x + 4, p.y - 26, p.w - 8, 26);
                ctx.strokeStyle = 'rgba(203,213,225,.45)'; ctx.lineWidth = 1; ctx.beginPath();
                for (let x = p.x + 14; x < p.x + p.w - 6; x += 12) { ctx.moveTo(x, p.y - 24); ctx.lineTo(x - 8, p.y); }
                ctx.stroke();
                ctx.fillStyle = '#ca8a04'; ctx.fillRect(p.x + 2, p.y - 28, p.w - 4, 4);
                ctx.fillRect(p.x + 2, p.y - 28, 4, 28); ctx.fillRect(p.x + p.w - 6, p.y - 28, 4, 28);
                ctx.fillStyle = '#e2e8f0'; for (const x of [l, r]) ctx.fillRect(x - 2, p.y - 32, 4, 6);
                ctx.fillStyle = '#facc15'; roundRect(ctx, p.x, p.y, p.w, p.h, 3); ctx.fill();
                ctx.fillStyle = '#a16207'; ctx.fillRect(p.x, p.y + p.h - 5, p.w, 5);
                ctx.fillStyle = '#fef08a'; ctx.fillRect(p.x + 3, p.y, p.w - 6, 3);
                ctx.fillStyle = '#1f2937'; for (const x of [p.x + 8, p.x + p.w - 16]) ctx.fillRect(x, p.y + p.h, 8, 5);
                return;
            }
            ctx.fillStyle = '#1e293b';
            for (const wx of [p.x + 22, p.x + p.w - 22]) { ctx.beginPath(); ctx.arc(wx, p.y + p.h + 8, 7, 0, TAU); ctx.fill(); }
            ctx.fillStyle = '#0ea5e9'; roundRect(ctx, p.x, p.y, p.w, p.h, 4); ctx.fill();
            ctx.fillStyle = '#bae6fd'; ctx.fillRect(p.x + 3, p.y, p.w - 6, 4);
            ctx.fillStyle = '#facc15'; for (let x = p.x + 10; x < p.x + p.w - 10; x += 20) ctx.fillRect(x, p.y + 9, 10, 3);
        }

        drawIsland(ctx, p, top, bottom) {
            const B = SKY_BIOMES[p.bi || 0];
            if (!p.bi) {
                this.drawArchitecture(ctx, { ...p, style: p.x < this.WIDTH / 2 ? 0 : 2 }, top, bottom);
                this.drawDecor(ctx, p);
                return;
            }
            if (p.bi === 2) {
                const h = p.bodyH || p.h;
                this.drawCloud(ctx, p, p.x, p.y, p.w, h, { under: '#bfdbfe', style: p.w > 400 ? (p.cloudStyle === 2 ? 0 : p.cloudStyle) : undefined });
            } else if (p.bi === 1) {
                this.drawFactoryDeck(ctx, p);
            } else {
                ctx.fillStyle = '#1e1b4b'; roundRect(ctx, p.x, p.y, p.w, p.h, 8); ctx.fill();
                ctx.fillStyle = '#6d28d9'; ctx.fillRect(p.x + 4, p.y + 10, p.w - 8, p.h - 14);
                ctx.fillStyle = B.edge; ctx.fillRect(p.x, p.y, p.w, 5);
                ctx.strokeStyle = B.accent; ctx.lineWidth = 2; ctx.beginPath();
                for (let x = p.x + 20; x < p.x + p.w - 30; x += 70) {
                    ctx.moveTo(x, p.y + 16); ctx.lineTo(x + 18, p.y + 16);
                    ctx.lineTo(x + 28, p.y + p.h - 10); ctx.lineTo(x + 48, p.y + p.h - 10);
                }
                ctx.stroke();
                ctx.fillStyle = '#a5f3fc';
                for (let x = p.x + 28; x < p.x + p.w - 10; x += 70) ctx.fillRect(x, p.y + p.h - 9, 10, 3);
            }
        }

        drawProp(ctx, p) {
            const { x, y, w, h } = p;
            const B = SKY_BIOMES[p.bi || 0];
            if (p.bi === 1) {
                const tank = p.prop === 'tank', turbine = p.prop === 'turbine' || p.prop === 'wind-unit';
                ctx.fillStyle = '#1e293b'; roundRect(ctx, x, y, w, h, tank ? 12 : 4); ctx.fill();
                ctx.fillStyle = '#64748b'; roundRect(ctx, x + 3, y + 3, w - 6, h - 6, tank ? 10 : 3); ctx.fill();
                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(x + 5, y + 3, w - 10, 3);
                if (tank) {
                    ctx.fillStyle = '#334155'; for (const yy of [y + h * .25, y + h * .75]) ctx.fillRect(x, yy, w, 5);
                    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * .17, 0, TAU); ctx.fill();
                    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w / 2, y + h / 2); ctx.lineTo(x + w * .6, y + h * .43); ctx.stroke();
                } else if (turbine) {
                    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * .35, 0, TAU); ctx.fill();
                    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 5; ctx.beginPath();
                    for (let i = 0; i < 4; i++) {
                        const angle = i * TAU / 4 + (this.hazardClock || 0) * 2;
                        ctx.moveTo(x + w / 2, y + h / 2); ctx.lineTo(x + w / 2 + Math.cos(angle) * w * .25, y + h / 2 + Math.sin(angle) * h * .25);
                    }
                    ctx.stroke();
                } else {
                    ctx.fillStyle = '#1e293b'; roundRect(ctx, x + 8, y + 11, w - 16, h - 20, 2); ctx.fill();
                    ctx.fillStyle = '#94a3b8'; for (let yy = y + 16; yy < y + h - 12; yy += 8) ctx.fillRect(x + 12, yy, w * .5, 3);
                    ctx.fillStyle = '#34d399'; ctx.fillRect(x + w - 15, y + 13, 5, 5);
                    ctx.fillStyle = '#fbbf24'; ctx.fillRect(x + w - 15, y + 23, 5, 5);
                }
                ctx.fillStyle = '#cbd5e1'; for (const xx of [x + 5, x + w - 7]) for (const yy of [y + 7, y + h - 9]) ctx.fillRect(xx, yy, 2, 2);
            } else if (p.prop === 'cloudbank') {
                this.drawCloud(ctx, p, x, y, w, h, { style: 0, under: '#bae6fd' });
            } else if (p.prop === 'power-core') {
                ctx.fillStyle = '#312e81'; roundRect(ctx, x, y, w, h, 4); ctx.fill();
                ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2; ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
                ctx.fillStyle = '#a78bfa'; ctx.fillRect(x + w / 2 - 4, y + 8, 8, h - 16);
                ctx.fillStyle = '#e0f2fe'; ctx.fillRect(x, y, w, 4);
            } else if (p.prop === 'ac' || p.prop === 'turbine' || p.prop === 'wind-unit') {
                ctx.fillStyle = B.edge; roundRect(ctx, x, y, w, h, 4); ctx.fill();
                ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.32, 0, TAU); ctx.fill();
                ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + w / 2 - 14, y + h / 2 + i * 7); ctx.lineTo(x + w / 2 + 14, y + h / 2 + i * 7); ctx.stroke(); }
                ctx.fillStyle = B.ledgeTop; ctx.fillRect(x, y, w, 4);
            } else if (p.prop === 'tank') {
                ctx.fillStyle = '#92400e'; roundRect(ctx, x, y, w, h, 10); ctx.fill();
                ctx.fillStyle = '#451a03'; for (let by = y + 14; by < y + h - 6; by += 16) ctx.fillRect(x, by, w, 3);
                ctx.fillStyle = '#b45309'; ctx.fillRect(x, y, w, 5);
            } else {
                const seed = Math.abs(Math.round(x * 7 + y * 13));
                if (seed % 2) {
                    // wooden crate: frame, diagonal brace and plank seams
                    ctx.fillStyle = '#b07a43'; roundRect(ctx, x, y, w, h, 3); ctx.fill();
                    ctx.fillStyle = 'rgba(0,0,0,.14)'; for (let py = y + h / 4; py < y + h - 4; py += h / 4) ctx.fillRect(x + 6, py, w - 12, 2);
                    ctx.strokeStyle = '#7c4a1e'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x + 7, y + h - 7); ctx.lineTo(x + w - 7, y + 7); ctx.stroke();
                    ctx.strokeStyle = '#6b3d16'; ctx.lineWidth = 6; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
                    ctx.fillStyle = '#d6d3d1'; for (const [cx, cy] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) { ctx.beginPath(); ctx.arc(cx, cy, 2, 0, TAU); ctx.fill(); }
                    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 2, y + 1, w - 4, 2);
                } else {
                    // cardboard box: lit top flaps, packing tape and a shipping label
                    ctx.fillStyle = '#c99a5b'; roundRect(ctx, x, y, w, h, 3); ctx.fill();
                    ctx.fillStyle = '#ddb57a'; ctx.fillRect(x + 1, y + 1, w - 2, Math.min(12, h * 0.18));
                    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + 1, y + Math.min(12, h * 0.18), w - 2, 2);
                    ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(x + w - 8, y + 2, 6, h - 4);
                    ctx.fillStyle = 'rgba(230,214,170,.85)'; ctx.fillRect(x + w / 2 - 5, y + 1, 10, h * 0.45);
                    ctx.fillStyle = '#f8f5ec'; ctx.fillRect(x + 7, y + h * 0.58, Math.min(26, w * 0.42), Math.min(16, h * 0.24));
                    ctx.fillStyle = '#57534e'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 10, y + h * 0.58 + 4 + i * 4, Math.min(18, w * 0.3) - i * 4, 1.5);
                    ctx.strokeStyle = 'rgba(120,80,40,.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
                }
            }
        }

        drawGlass(ctx, p) {
            if (p.scaffold) {
                ctx.strokeStyle = '#475569'; ctx.lineWidth = 5; ctx.beginPath();
                for (let x = p.x + 30; x < p.x + p.w; x += 180) {
                    ctx.moveTo(x, p.y + 18); ctx.lineTo(x, p.y + 140);
                    ctx.moveTo(x, p.y + 22); ctx.lineTo(Math.min(x + 180, p.x + p.w - 30), p.y + 136);
                }
                ctx.stroke();
            }
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

        // A real cloud silhouette: lumpy top whose highest bumps sit exactly on the collision line,
        // rounded ends and a soft belly underneath. Four shapes (cumulus, wispy, cluster, stratus) by position hash.
        drawCloud(ctx, p, x, y, w, h, look = {}) {
            if (p.cloudStyle === undefined) p.cloudStyle = hashStr(`${Math.round(p.bx ?? p.x)}:${Math.round(p.by ?? p.y)}`) % 4;
            const style = look.style ?? p.cloudStyle, low = this.s.graphics?.low || this.s.lowDetail;
            const bumps = Math.max(2, Math.round(w / (style === 2 ? 30 : style === 3 ? 56 : 40))), step = w / bumps;
            const dip = style === 3 ? 3 : style === 2 ? 7 : 5;
            const depth = look.depth ?? (style === 3 ? 30 : style === 1 ? 42 : style === 2 ? 64 : 52) + h * .9 + (hashStr(`${p.bx ?? p.x}:${p.by ?? p.y}`) % 24);
            const breathe = low ? 0 : Math.sin(this.anim * 1.2 + style + (p.bx ?? p.x) * .01) * 3;
            const lobes = Math.max(2, Math.round(w / (style === 3 ? 90 : 58))), ls = (w - 8) / lobes;
            const shape = d => {
                ctx.beginPath(); ctx.moveTo(x, y + dip);
                for (let i = 0; i < bumps; i++) {
                    const x0 = x + step * i;
                    ctx.quadraticCurveTo(x0 + step / 2, y - dip, x0 + step, y + dip);
                }
                ctx.quadraticCurveTo(x + w + 10, y + dip + d * .3, x + w - 4, y + d * .7);
                for (let i = lobes - 1; i >= 0; i--) {
                    const x1 = x + 4 + ls * i, swell = style === 3 ? .75 : .9 + ((i + style) % 2) * .25;
                    ctx.quadraticCurveTo(x1 + ls / 2, y + d * (.7 + swell * .6) + breathe * (i % 2 ? 1 : -1), x1, y + d * .7);
                }
                ctx.quadraticCurveTo(x - 10, y + dip + d * .3, x, y + dip);
                ctx.closePath();
            };
            const under = look.under || '#bfdbfe', body = look.body || '#ffffff';
            if (style === 1 && !low) {
                // wispy tails trail below the walkable line so they never read as floor
                ctx.fillStyle = under; const a = ctx.globalAlpha; ctx.globalAlpha = a * .45;
                const drift = Math.sin(this.anim * .8 + x * .01) * 6;
                ctx.beginPath(); ctx.ellipse(x - 18 + drift, y + depth * .7, 34, 7, 0, 0, TAU); ctx.fill();
                ctx.beginPath(); ctx.ellipse(x + w + 22 - drift, y + depth * .55, 42, 6, 0, 0, TAU); ctx.fill();
                ctx.globalAlpha = a;
            }
            ctx.fillStyle = under; shape(depth); ctx.fill();
            ctx.fillStyle = body; shape(depth * .55); ctx.fill();
            if (low) return;
            if (style === 2) {
                ctx.fillStyle = under;
                for (let i = 0; i < 3; i++) {
                    const bob = Math.sin(this.anim * 1.6 + i * 2 + x * .02) * 4;
                    ctx.beginPath(); ctx.ellipse(x + w * (.25 + i * .25), y + depth * 1.25 + 8 + bob + (i % 2) * 6, 9 - (i % 2) * 3, 7 - (i % 2) * 2, 0, 0, TAU); ctx.fill();
                }
            } else if (style === 3) {
                ctx.fillStyle = 'rgba(148,163,184,.35)'; roundRect(ctx, x + 10, y + depth * .95, w - 20, 4, 2); ctx.fill();
            }
            ctx.fillStyle = 'rgba(255,255,255,.9)';
            for (let i = 0; i < bumps; i += 2) { ctx.beginPath(); ctx.ellipse(x + step * (i + .5), y + 3, step * .22, 2, 0, 0, TAU); ctx.fill(); }
        }

        drawCloudPuff(ctx, x, y, w, h, tint = '#bfdbfe', p = { x, y }) {
            this.drawCloud(ctx, p, x, y, w, h, { under: tint });
        }

        drawCloudMound(ctx, p) {
            const surface = () => {
                for (let i = 0; i <= 48; i++) {
                    const x = p.x + p.w * i / 48, y = A.util.slopeY(p, x);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
            };
            const base = p.y + p.h, puffs = Math.round(p.w / 52), step = p.w / puffs;
            ctx.fillStyle = '#bae6fd';
            for (let i = 0; i < puffs; i++) { ctx.beginPath(); ctx.ellipse(p.x + step * (i + .5), base - 6, step * .6, 16, 0, 0, TAU); ctx.fill(); }
            const g = ctx.createLinearGradient ? ctx.createLinearGradient(0, p.y, 0, base) : null;
            if (g) { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dbeafe'); }
            ctx.fillStyle = g || '#f8fafc';
            ctx.beginPath(); surface(); ctx.lineTo(p.x + p.w, base - 4); ctx.lineTo(p.x, base - 4); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); surface(); ctx.stroke();
        }

        drawFactoryFrame(ctx, chamber, top, bottom) {
            const upper = Math.max(chamber.top - 220, top), lower = Math.min(chamber.bottom + 100, bottom);
            if (upper >= lower) return;
            ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 22; ctx.beginPath();
            for (const x of [chamber.left + 14, chamber.right - 14]) { ctx.moveTo(x, upper); ctx.lineTo(x, lower); }
            ctx.stroke(); ctx.strokeStyle = '#64748b'; ctx.lineWidth = 3; ctx.stroke();
            for (let y = Math.ceil(upper / 200) * 200; y < lower; y += 200) {
                ctx.fillStyle = '#334155'; ctx.fillRect(chamber.left, y, 28, 16); ctx.fillRect(chamber.right - 28, y, 28, 16);
                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(chamber.left + 12, y + 5, 4, 4); ctx.fillRect(chamber.right - 16, y + 5, 4, 4);
            }
            const steps = chamber.nodes.filter(p => p.factoryStep);
            if (steps.length) {
                const roofs = chamber.nodes.filter(p => p.motif === 'rooftop-walk');
                const leftDeck = roofs.find(p => p.x < chamber.exitX), rightDeck = roofs.find(p => p.x > chamber.exitX);
                ctx.strokeStyle = '#475569'; ctx.lineWidth = 6; ctx.beginPath();
                ctx.moveTo(chamber.exitX - 96, leftDeck.y + 22);
                ctx.lineTo(chamber.exitX + 96, rightDeck.y + 22); ctx.stroke();
            }
        }

        drawFactoryDeck(ctx, p) {
            const bodyH = p.roof ? p.bodyH || p.h : p.h;
            ctx.fillStyle = '#1e293b'; roundRect(ctx, p.x, p.y, p.w, bodyH, 4); ctx.fill();
            ctx.fillStyle = '#475569'; ctx.fillRect(p.x + 3, p.y + 5, p.w - 6, Math.max(2, bodyH - 8));
            ctx.fillStyle = '#cbd5e1'; ctx.fillRect(p.x, p.y, p.w, 4);
            const left = Math.max(p.x + 12, Math.floor((this.cam.x - 60) / 60) * 60);
            const right = Math.min(p.x + p.w - 48, this.cam.x + (this.viewWidth || 1000) + 60);
            for (let x = left; x < right; x += 60) {
                ctx.fillStyle = '#94a3b8'; ctx.fillRect(x, p.y + 9, 3, 3);
                if (bodyH > 32) {
                    ctx.fillStyle = '#0f172a'; roundRect(ctx, x, p.y + 22, 44, Math.min(28, bodyH - 27), 3); ctx.fill();
                    ctx.fillStyle = '#64748b'; for (let yy = p.y + 26; yy < Math.min(p.y + 47, p.y + bodyH - 5); yy += 6) ctx.fillRect(x + 4, yy, 36, 2);
                }
            }
            ctx.fillStyle = '#fbbf24'; ctx.fillRect(p.x + 4, p.y + 5, 6, Math.min(10, bodyH - 6));
        }

        drawConveyor(ctx, p) {
            const low = this.s.lowDetail || this.s.graphics?.low;
            const left = Math.max(p.x, this.cam.x - 80), right = Math.min(p.x + p.w, this.cam.x + (this.viewWidth || 1000) + 80);
            ctx.fillStyle = '#1e293b'; roundRect(ctx, p.x, p.y, p.w, Math.max(20, p.h), 8); ctx.fill();
            ctx.fillStyle = '#94a3b8'; ctx.fillRect(p.x + 5, p.y + 2, p.w - 10, 5);
            ctx.fillStyle = '#0f172a'; ctx.fillRect(p.x + 8, p.y + 8, p.w - 16, 10);
            const shift = ((this.clock || 0) * p.belt % 28 + 28) % 28;
            ctx.strokeStyle = '#a8a29e'; ctx.lineWidth = 3; ctx.beginPath();
            for (let x = Math.floor((left - p.x) / 28) * 28 + p.x + shift; x < right; x += 28) {
                if (x <= p.x + 8 || x >= p.x + p.w - 8) continue;
                ctx.moveTo(x, p.y + 9); ctx.lineTo(x, p.y + 17);
            }
            ctx.stroke();
            for (let x = p.x + 18; x <= p.x + p.w - 18; x += 60) {
                if (x < left || x > right) continue;
                ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(x, p.y + 26, 12, 0, TAU); ctx.fill();
                ctx.strokeStyle = '#a8a29e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, p.y + 26, 9, 0, TAU); ctx.stroke();
                const angle = (this.clock || 0) * p.belt / 12;
                ctx.beginPath(); ctx.moveTo(x - Math.cos(angle) * 8, p.y + 26 - Math.sin(angle) * 8);
                ctx.lineTo(x + Math.cos(angle) * 8, p.y + 26 + Math.sin(angle) * 8); ctx.stroke();
            }
            ctx.fillStyle = '#fbbf24';
            for (const x of [p.x, p.x + p.w - 12]) ctx.fillRect(x, p.y, 12, 7);
            ctx.fillStyle = '#64748b'; ctx.fillRect(p.x + 18, p.y + 32, 9, 40); ctx.fillRect(p.x + p.w - 27, p.y + 32, 9, 40);
            if (!low) {
                ctx.strokeStyle = '#475569'; ctx.lineWidth = 4; ctx.beginPath();
                for (let x = left + 30; x < right - 40; x += 110) { ctx.moveTo(x, p.y + 38); ctx.lineTo(x + 55, p.y + 67); ctx.lineTo(x + 110, p.y + 38); }
                ctx.stroke();
            }
            ctx.fillStyle = '#fbbf24'; ctx.beginPath();
            const center = p.x + p.w / 2, dir = Math.sign(p.belt);
            ctx.moveTo(center + dir * 13, p.y + 13); ctx.lineTo(center - dir * 5, p.y + 7); ctx.lineTo(center - dir * 5, p.y + 19); ctx.fill();
        }

        drawSpaceDeck(ctx, p) {
            if (p.spaceStyle === 0) {
                ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y);
                ctx.lineTo(p.x + p.w - 12, p.y + p.h);
                for (let x = p.x + p.w - 30; x > p.x + 10; x -= 35) ctx.lineTo(x, p.y + p.h - (ihash(Math.round(x), Math.round(p.y)) % 12));
                ctx.lineTo(p.x, p.y + p.h - 8); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y); ctx.stroke();
                ctx.fillStyle = '#334155'; for (let x = p.x + 24; x < p.x + p.w - 12; x += 70) {
                    ctx.beginPath(); ctx.ellipse(x, p.y + p.h * .6, 10, 5, -.3, 0, TAU); ctx.fill();
                }
            } else {
                ctx.fillStyle = p.spaceStyle === 1 ? '#334155' : '#312e81'; roundRect(ctx, p.x, p.y, p.w, p.h, 5); ctx.fill();
                ctx.fillStyle = p.spaceStyle === 1 ? '#cbd5e1' : '#67e8f9'; ctx.fillRect(p.x, p.y, p.w, 5);
                ctx.fillStyle = '#0f172a'; for (let x = p.x + 15; x < p.x + p.w - 8; x += 40) ctx.fillRect(x, p.y + 9, 22, Math.min(18, p.h - 12));
                ctx.fillStyle = p.spaceStyle === 1 ? '#38bdf8' : '#c4b5fd';
                for (let x = p.x + 17; x < p.x + p.w - 10; x += 40) ctx.fillRect(x, p.y + 12, 18, Math.min(10, p.h - 15));
                if (p.spaceStyle === 2) {
                    ctx.fillStyle = 'rgba(34,211,238,.3)';
                    for (const x of [p.x + 12, p.x + p.w - 28]) { ctx.beginPath(); ctx.moveTo(x, p.y + p.h); ctx.lineTo(x + 16, p.y + p.h); ctx.lineTo(x + 8, p.y + p.h + 22 + Math.sin(this.anim * 8) * 6); ctx.fill(); }
                }
            }
        }

        drawDrill(ctx, d) {
            const shake = d.warn ? Math.sin(this.anim * 70) * 2 : 0, x = d.x + shake;
            ctx.strokeStyle = '#57534e'; ctx.lineWidth = 2; ctx.beginPath();
            ctx.moveTo(d.x - 10, d.mountY - 34); ctx.lineTo(d.x - 10, d.mountY - 220);
            ctx.moveTo(d.x + 10, d.mountY - 34); ctx.lineTo(d.x + 10, d.mountY - 220); ctx.stroke();
            ctx.fillStyle = '#44403c'; roundRect(ctx, d.x - 22, d.mountY - 34, 44, 34, 5); ctx.fill();
            ctx.fillStyle = '#fbbf24'; for (let i = 0; i < 4; i++) ctx.fillRect(d.x - 20 + i * 11, d.mountY - 9, 6, 7);
            ctx.fillStyle = d.warn || d.tipY > d.mountY + 40 ? '#ef4444' : '#7f1d1d';
            ctx.beginPath(); ctx.arc(d.x, d.mountY - 22, 4, 0, TAU); ctx.fill();
            ctx.fillStyle = '#a8a29e'; ctx.fillRect(x - 6, d.mountY, 12, Math.max(0, d.tipY - 20 - d.mountY));
            if (d.crusher) {
                ctx.fillStyle = '#44403c'; roundRect(ctx, x - d.width / 2, d.tipY - 22, d.width, 22, 3); ctx.fill();
                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(x - d.width / 2, d.tipY - 22, d.width, 4);
                for (let i = 0; i < d.width; i += 16) {
                    ctx.fillStyle = i % 32 ? '#1c1917' : '#fbbf24'; ctx.fillRect(x - d.width / 2 + i, d.tipY - 15, Math.min(16, d.width - i), 11);
                }
                if (d.warn) { ctx.fillStyle = 'rgba(239,68,68,.2)'; ctx.fillRect(d.x - d.width / 2, d.mountY, d.width, d.surfaceY - d.mountY); }
                return;
            }
            ctx.fillStyle = '#d6d3d1'; ctx.beginPath(); ctx.moveTo(x - 12, d.tipY - 20); ctx.lineTo(x + 12, d.tipY - 20); ctx.lineTo(x, d.tipY); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#78716c'; ctx.lineWidth = 2; ctx.beginPath();
            const spin = (this.anim * 40) % 8;
            for (let yy = d.tipY - 18 + spin; yy < d.tipY - 2; yy += 8) { const half = 12 * (d.tipY - yy) / 20; ctx.moveTo(x - half, yy); ctx.lineTo(x + half, yy + 3); }
            ctx.stroke();
            if (d.tipY > d.surfaceY - 8) { ctx.fillStyle = 'rgba(214,211,209,.5)'; ctx.fillRect(d.x - 26, d.surfaceY - 6, 52, 6); }
            if (d.warn) { ctx.fillStyle = 'rgba(239,68,68,.2)'; ctx.fillRect(d.x - 14, d.mountY, 28, d.surfaceY - d.mountY); }
        }

        drawUnstablePlatform(ctx, p, B) {
            const warning = p.blink ? p.warn : p.timer > 0;
            const remaining = !warning ? 1 : clamp(p.blink ? (p.on - ((this.hazardAnim ?? this.anim) + p.phase) % p.period) / .6 : p.timer / .5, 0, 1);
            if (p.bi === 2) {
                // fading clouds thin out and shimmer; dissolving clouds shake apart and shed wisps
                ctx.save();
                const look = p.blink ? { under: '#c4b5fd', body: '#f5f3ff' } : { under: '#94a3b8', body: '#f1f5f9' };
                if (p.off) {
                    ctx.globalAlpha = .14 + Math.sin(this.anim * 2 + p.x) * .04;
                    this.drawCloud(ctx, p, p.x, p.y, p.w, p.h, look);
                    ctx.restore(); return;
                }
                const shimmer = p.blink ? .88 + Math.sin(this.anim * 2.4 + p.phase) * .12 : 1;
                ctx.globalAlpha = shimmer * (.25 + .75 * remaining);
                const shake = !p.blink && warning ? Math.sin(this.anim * 55) * 3 * (1 - remaining) : 0;
                this.drawCloud(ctx, p, p.x + shake, p.y, p.w, p.h, look);
                if (warning && !(this.s.graphics?.low || this.s.lowDetail)) {
                    ctx.fillStyle = look.under;
                    for (let i = 0; i < 5; i++) {
                        const u = (this.anim * 1.4 + i / 5) % 1;
                        ctx.globalAlpha = (1 - u) * .7;
                        ctx.beginPath(); ctx.ellipse(p.x + p.w * (.12 + i * .19), p.y + p.h + 6 + u * 40, 7 - u * 4, 5 - u * 3, 0, 0, TAU); ctx.fill();
                    }
                }
                ctx.restore(); return;
            }
            if (p.off) {
                ctx.save();
                ctx.strokeStyle = B.accent; ctx.globalAlpha = .35; ctx.lineWidth = 2;
                ctx.setLineDash([6, 6]); ctx.strokeRect(p.x, p.y, p.w, p.h);
                ctx.restore();
                return;
            }
            ctx.save();
            if (warning) ctx.globalAlpha = Math.floor(this.anim * 8) % 2 ? .45 : 1;
            this.drawPlatformSupport(ctx, p);
            {
                ctx.fillStyle = mixHex(B.body, p.blink ? '#be123c' : '#b45309', .4);
                roundRect(ctx, p.x, p.y, p.w, p.h, 4); ctx.fill();
                ctx.fillStyle = warning ? '#fbbf24' : B.accent;
                ctx.fillRect(p.x + 3, p.y, p.w - 6, 5);
                ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.beginPath();
                for (let x = p.x + 12; x < p.x + p.w - 10; x += 24) {
                    ctx.moveTo(x, p.y + 6); ctx.lineTo(x + 7, p.y + p.h - 3);
                }
                ctx.stroke();
            }
            ctx.restore();
            if (warning) { ctx.fillStyle = '#fbbf24'; ctx.fillRect(p.x, p.y + p.h + 4, p.w * remaining, 3); }
        }

        drawDecor(ctx, p) {
            if (!p.decor || this.s.graphics?.low || this.s.lowDetail) return;
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
            // soft drop shadow so ledges separate from the backdrop
            ctx.fillStyle = 'rgba(0,0,0,.22)'; roundRect(ctx, p.x + 3, p.y + 6, p.w, p.h + 2, 5); ctx.fill();
            if (this.s.lowDetail || this.s.graphics?.low) ctx.fillStyle = B.ledge;
            else {
                const lg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
                lg.addColorStop(0, B.ledgeTop); lg.addColorStop(0.3, B.ledge); lg.addColorStop(1, mixHex(B.ledge, '#0f172a', 0.45));
                ctx.fillStyle = lg;
            }
            roundRect(ctx, p.x, p.y, p.w, p.h, 4); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(p.x + 3, p.y, p.w - 6, 2);
            ctx.fillStyle = B.ledgeTop; ctx.fillRect(p.x, p.y, p.w, 3);
            if (p.bi === 3) { ctx.fillStyle = 'rgba(196,181,253,.35)'; ctx.fillRect(p.x - 3, p.y - 3, p.w + 6, 3); }
            if (this.s.lowDetail || this.s.graphics?.low) return;
            const hsh = Math.abs(Math.round(p.x) * 73856093 ^ Math.round(p.y) * 19349663);
            const material = p.bi === 1 ? [0, 3][(hsh >> 2) % 2] : (hsh >> 2) % 4, base = B.ledge, dark = mixHex(base, '#0f172a', 0.55), lip = Math.max(0, p.h - 4);
            if (material === 0) {
                // steel girder with an open truss hanging underneath
                ctx.fillStyle = dark; ctx.fillRect(p.x + 6, p.y + p.h, p.w - 12, 5); ctx.fillRect(p.x + 6, p.y + p.h + 24, p.w - 12, 5);
                ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.beginPath();
                for (let x = p.x + 6; x < p.x + p.w - 30; x += 30) { ctx.moveTo(x, p.y + p.h + 3); ctx.lineTo(x + 30, p.y + p.h + 26); ctx.moveTo(x + 30, p.y + p.h + 3); ctx.lineTo(x, p.y + p.h + 26); }
                ctx.stroke();
                ctx.fillStyle = 'rgba(226,232,240,.55)'; for (let x = p.x + 10; x < p.x + p.w - 6; x += 20) { ctx.beginPath(); ctx.arc(x, p.y + p.h / 2 + 2, 1.8, 0, TAU); ctx.fill(); }
            } else if (material === 1) {
                // brick ledge with mortar lines and a stone cap
                ctx.fillStyle = mixHex('#b45309', base, 0.35); ctx.fillRect(p.x + 2, p.y + 4, p.w - 4, lip);
                ctx.fillStyle = 'rgba(15,23,42,.35)';
                for (let row = 0, y = p.y + 4; y < p.y + p.h - 2; y += 8, row++) {
                    ctx.fillRect(p.x + 2, y + 7, p.w - 4, 1);
                    for (let x = p.x + 2 + (row % 2) * 9; x < p.x + p.w - 4; x += 18) ctx.fillRect(x, y, 1, 7);
                }
                ctx.fillStyle = '#e7e5e4'; ctx.fillRect(p.x - 2, p.y, p.w + 4, 4);
                ctx.fillStyle = dark; for (const x of [p.x + 14, p.x + p.w - 22]) ctx.fillRect(x, p.y + p.h, 8, 18);
            } else if (material === 2) {
                // wooden boardwalk with planks, nails and posts
                const planks = ['#a16207', '#92400e', '#b45309'];
                for (let k = 0, x = p.x + 2; x < p.x + p.w - 2; x += 22, k++) {
                    ctx.fillStyle = mixHex(planks[(k + hsh) % 3], base, 0.25); ctx.fillRect(x, p.y + 3, Math.min(21, p.x + p.w - 2 - x), lip);
                    ctx.fillStyle = 'rgba(254,243,199,.5)'; ctx.fillRect(x + 3, p.y + 6, 2, 2); ctx.fillRect(x + 15, p.y + 6, 2, 2);
                }
                ctx.fillStyle = '#78350f'; for (const x of [p.x + 10, p.x + p.w / 2 - 4, p.x + p.w - 18]) ctx.fillRect(x, p.y + p.h, 8, 30);
                ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(p.x + 10, p.y + p.h + 12, p.w - 20, 4);
            } else {
                // concrete slab with panel seams, rebar stubs and a hanging pipe
                ctx.fillStyle = 'rgba(15,23,42,.28)';
                for (let x = p.x + 36; x < p.x + p.w - 6; x += 46) ctx.fillRect(x, p.y + 4, 2, lip);
                ctx.fillStyle = dark; ctx.fillRect(p.x + 4, p.y + p.h, p.w - 8, 7);
                ctx.fillStyle = '#64748b'; roundRect(ctx, p.x + 12, p.y + p.h + 9, p.w - 24, 7, 3); ctx.fill();
                ctx.fillStyle = '#a8a29e'; for (let x = p.x + 22; x < p.x + p.w - 14; x += 64) ctx.fillRect(x, p.y + p.h + 7, 4, 11);
            }
            ctx.fillStyle = 'rgba(15,23,42,.35)';
            for (let rx = p.x + 12; rx < p.x + p.w - 8; rx += 26) ctx.fillRect(rx, p.y + 7, 3, 3);
            if (p.bi === 1) {
                // hazard-striped end caps on every construction deck
                for (const ex of [p.x, p.x + p.w - 14]) for (let i = 0; i < 2; i++) { ctx.fillStyle = i ? '#1c1917' : '#facc15'; ctx.fillRect(ex + i * 7, p.y, 7, Math.min(p.h, 10)); }
            }
            if (p.chamber !== undefined || p.w < 120) return;
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
            const k = 1 - Math.exp(-6 * (this.drawDt ?? this.dtLast ?? 0.016));
            const cssScale = s.scale || 1, cssW = w * cssScale, cssH = h * cssScale;
            const small = !s.preview && (cssW < 700 || cssH < 550);
            const zoom = this.zoom = s.preview ? 1 : A.util.sceneZoom(s, w, h, 720);
            const viewW = w / zoom, viewH = h / zoom;
            this.viewWidth = viewW;
            const lookX = small ? clamp((me.vx || 0) * 0.12, -80, 80) : 0;
            const lookY = small ? clamp(-(me.vy || 0) * 0.09, 0, 70) : 0;
            const targetX = viewW >= W + 120 ? (W - viewW) / 2 : clamp(me.x + 13 + lookX - viewW / 2, -60, W + 60 - viewW);
            const targetY = me.y - viewH * 0.62 - lookY;
            if (!this.camInit || this.dead > 0.9 || this.snapCam) { this.cam.x = targetX; this.cam.y = targetY; if (!this.camInit) this.camStart = targetY; this.camInit = true; this.snapCam = false; }
            this.cam.x += (targetX - this.cam.x) * k;
            this.cam.y += (targetY - this.cam.y) * k * 0.9;
            const blend = this.backdropBlend(this.cam.y, viewH);
            climbBackdrop(ctx, w, h, this.cam, this.camStart, blend, this.hazardAnim ?? this.anim, !!s.graphics?.low);
            ctx.save();
            ctx.scale(zoom, zoom);
            ctx.translate(-this.cam.x, -this.cam.y);
            const left = this.cam.x - 50, right = this.cam.x + viewW + 50, top = this.cam.y - 60, bottom = this.cam.y + viewH + 60;
            const seen = (y) => y > top - 300 && y < bottom + 300;
            const visible = this.drawIndex?.items === this.drawList ? this.drawIndex.query(top, bottom) : this.drawList;
            for (const chamber of this.challenges) {
                if (!chamber || chamber.nodes[0].bi !== 1 || chamber.left > right || chamber.right < left) continue;
                this.drawFactoryFrame(ctx, chamber, top, bottom);
            }
            for (const p of visible) {
                if (p.boundary || p.x > right + 200 || p.x + p.w < left - 200) continue;
                if (p.wallX !== undefined) { this.drawWallMount(ctx, p); continue; }
                if (p.gondola || p.cart) { this.drawCityRig(ctx, p); continue; }
                if (p.off || p.blink || p.crumble) continue;
                if (p.chamber !== undefined) this.drawPlatformSupport(ctx, p);
            }
            for (const p of visible) {
                const bounds = this.drawBounds(p);
                if (p.boundary || p.x > right || p.x + p.w < left || (p.off && !p.blink && !p.crumble) || bounds.y > bottom || bounds.y + bounds.h < top) continue;
                const B = SKY_BIOMES[p.bi || 0];
                if (p.meteorWait || p.meteorLanding) {
                    const beaconX = p.x + p.w / 2;
                    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 3; ctx.beginPath();
                    ctx.moveTo(beaconX, p.y - 12); ctx.lineTo(beaconX, p.y - 62); ctx.stroke();
                    ctx.fillStyle = '#67e8f9'; ctx.beginPath();
                    ctx.moveTo(beaconX + p.meteorDirection * 26, p.y - 50);
                    ctx.lineTo(beaconX, p.y - 62); ctx.lineTo(beaconX, p.y - 38); ctx.closePath(); ctx.fill();
                    ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
                    ctx.fillText(p.meteorWait ? 'WAIT FOR METEOR' : 'METEOR LANDING', beaconX, p.y - 76);
                }
                if (p.blink || p.crumble) { this.drawUnstablePlatform(ctx, p, B); continue; }
                if (p.meteor) {
                    const mx = p.x + p.w / 2, my = p.y + p.h / 2, radius = p.w / 2;
                    ctx.strokeStyle = 'rgba(165,243,252,.2)'; ctx.lineWidth = 12; ctx.beginPath();
                    ctx.moveTo(mx, my); ctx.lineTo(mx - p.direction * 90, my - p.verticalSpeed * .6); ctx.stroke();
                    ctx.fillStyle = '#64748b'; ctx.beginPath();
                    for (let i = 0; i < 14; i++) {
                        const angle = i * TAU / 14, rr = radius * (.86 + (ihash(p.seed, i) % 15) / 100);
                        const xx = mx + Math.cos(angle) * rr, yy = my + Math.sin(angle) * rr;
                        if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
                    }
                    ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.stroke();
                    ctx.fillStyle = '#334155';
                    for (let i = 0; i < 5; i++) {
                        const angle = i * TAU / 5 + p.seed, rr = radius * .5;
                        ctx.beginPath(); ctx.ellipse(mx + Math.cos(angle) * rr, my + Math.sin(angle) * rr, radius * .17, radius * .12, angle, 0, TAU); ctx.fill();
                    }
                } else if (p.bladeSign || p.climbRail) {
                    this.drawScaleRig(ctx, p);
                } else if (p.tower) {
                    this.drawTower(ctx, p, top, bottom);
                } else if (p.mount) {
                    this.drawMountPiece(ctx, p);
                } else if (p.gondola || p.cart) {
                    this.drawCityCar(ctx, p);
                } else if (p.factoryBelt) {
                    this.drawConveyor(ctx, p);
                } else if (p.factoryStep) {
                    ctx.fillStyle = '#cbd5e1'; ctx.fillRect(p.x, p.y, p.w, 4);
                    ctx.fillStyle = '#64748b';
                    for (let x = p.x + 4; x < p.x + p.w - 4; x += 12) ctx.fillRect(x, p.y + 4, 4, 10);
                    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath();
                    ctx.moveTo(p.x + p.w / 2 - 5, p.y + 23); ctx.lineTo(p.x + p.w / 2, p.y + 18); ctx.lineTo(p.x + p.w / 2 + 5, p.y + 23); ctx.stroke();
                } else if (p.spaceStyle !== undefined) {
                    this.drawSpaceDeck(ctx, p);
                } else if (p.bi === 1 && !p.prop && !p.slope && !p.mover) {
                    this.drawFactoryDeck(ctx, p);
                } else if (p.island || (p.roof && p.bi > 0)) {
                    this.drawIsland(ctx, p, top, bottom);
                } else if (p.facade || p.bridge) {
                    this.drawArchitecture(ctx, p, top, bottom);
                } else if (p.wall) {
                    ctx.fillStyle = 'rgba(8,10,28,.88)'; ctx.fillRect(p.x, p.y, p.w, p.h);
                    ctx.fillStyle = 'rgba(148,163,184,.35)'; ctx.fillRect(p.x < 0 ? p.x + p.w - 6 : p.x, p.y, 6, p.h);
                } else if (p.ground) {
                    ctx.fillStyle = '#1e293b'; ctx.fillRect(p.x, p.y, p.w, 400);
                    ctx.fillStyle = '#64748b'; ctx.fillRect(p.x, p.y, p.w, 10);
                } else if (p.roof) {
                    const bodyH = p.bodyH || 90;
                    if (p.bi === 2) {
                        ctx.fillStyle = '#f8fafc'; ctx.fillRect(p.x, p.y + 10, p.w, bodyH - 10);
                        for (let cx = p.x + 20; cx < p.x + p.w; cx += 60) { ctx.beginPath(); ctx.arc(cx, p.y + 12, 30, Math.PI, 0); ctx.fill(); }
                        const g = ctx.createLinearGradient(0, p.y, 0, p.y + bodyH); g.addColorStop(0, 'rgba(186,230,253,0)'); g.addColorStop(1, 'rgba(56,189,248,.55)');
                        ctx.fillStyle = g; ctx.fillRect(p.x, p.y + 10, p.w, bodyH - 10);
                    } else if (p.bi === 1) {
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
                    ctx.fillStyle = B.body; roundRect(ctx, p.x, p.y, p.w, p.h, 10); ctx.fill();
                    ctx.fillStyle = B.edge; ctx.fillRect(p.x + 6, p.y + 3, p.w - 12, 4);
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
                    ctx.fillStyle = B.accent;
                    const off = (this.anim * p.belt * 0.5) % 24;
                    for (let bx = p.x + 8 + (off < 0 ? off + 24 : off); bx < p.x + p.w - 14; bx += 24) {
                        ctx.beginPath(); if (p.belt > 0) { ctx.moveTo(bx, p.y + 3); ctx.lineTo(bx + 8, p.y + 8); ctx.lineTo(bx, p.y + 13); } else { ctx.moveTo(bx + 8, p.y + 3); ctx.lineTo(bx, p.y + 8); ctx.lineTo(bx + 8, p.y + 13); } ctx.fill();
                    }
                } else if (p.crumble) {
                    const shake = p.timer > 0 ? Math.sin(this.anim * 60) * 2 : 0;
                    ctx.fillStyle = mixHex(B.body, '#b45309', .35); roundRect(ctx, p.x + shake, p.y, p.w, 16, 4); ctx.fill();
                    ctx.fillStyle = B.accent; ctx.fillRect(p.x + shake + 4, p.y, p.w - 8, 5);
                    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2; ctx.beginPath();
                    for (let cx2 = p.x + 18; cx2 < p.x + p.w - 10; cx2 += 34) { ctx.moveTo(cx2 + shake, p.y + 5); ctx.lineTo(cx2 + 5 + shake, p.y + 10); ctx.lineTo(cx2 + 1 + shake, p.y + 15); }
                    ctx.stroke();
                } else if (p.jt) {
                    this.drawGlass(ctx, p);
                } else if (p.slope && p.bi === 2) {
                    this.drawCloudMound(ctx, p);
                } else if (p.slope) {
                    const surface = () => {
                        for (let i = 0; i <= 48; i++) {
                            const x = p.x + p.w * i / 48, y = A.util.slopeY(p, x);
                            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                        }
                    };
                    ctx.fillStyle = p.curve === 'arch' ? B.curve : mixHex(B.curve, B.body, .4); ctx.beginPath(); surface();
                    ctx.lineTo(p.x + p.w, p.y + p.h); ctx.lineTo(p.x, p.y + p.h); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = 'rgba(226,232,240,.3)'; ctx.lineWidth = 2; ctx.beginPath();
                    for (let x = p.x + 20; x < p.x + p.w; x += 32) {
                        ctx.moveTo(x, A.util.slopeY(p, x) + 3); ctx.lineTo(x, p.y + p.h);
                    }
                    ctx.stroke();
                    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 3; ctx.beginPath(); surface(); ctx.stroke();
                    ctx.fillStyle = '#475569'; ctx.fillRect(p.x, p.y + p.h - 3, p.w, 3);
                } else if (p.mover && p.bi === 2) {
                    if (p.sinker) {
                        // heavy rain cloud: it drizzles harder the deeper it is pushed down
                        const load = p.sunk / p.depth;
                        this.drawCloud(ctx, p, p.x, p.y, p.w, p.h, { under: mixHex('#bfdbfe', '#64748b', .25 + load * .5), body: mixHex('#ffffff', '#cbd5e1', load * .6), style: 3 });
                        if (!(s.graphics?.low || s.lowDetail)) {
                            ctx.strokeStyle = `rgba(147,197,253,${(.25 + load * .6).toFixed(2)})`; ctx.lineWidth = 2; ctx.beginPath();
                            for (let i = 0; i < Math.round(p.w / 26); i++) {
                                const rx = p.x + 14 + i * 26 + (i % 2) * 9, u = (this.anim * (1.4 + load * 2) + i * .37) % 1, ry = p.y + p.h + 10 + u * 70;
                                ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 9);
                            }
                            ctx.stroke();
                        }
                    } else this.drawCloud(ctx, p, p.x, p.y, p.w, p.h, p.vert ? { under: '#a5f3fc' } : {});
                } else if (p.mover) {
                    if (p.factoryLift) {
                        ctx.strokeStyle = '#78716c'; ctx.lineWidth = 4; ctx.beginPath();
                        const railY = p.by - 157, chamber = this.challenges[p.chamber];
                        const railLeft = chamber ? chamber.left + 14 : p.bx - p.amp;
                        const railRight = chamber ? chamber.right - 14 : p.bx + p.w + p.amp;
                        ctx.moveTo(p.x + 14, p.y); ctx.lineTo(p.x + 14, railY);
                        ctx.moveTo(p.x + p.w - 14, p.y); ctx.lineTo(p.x + p.w - 14, railY); ctx.stroke();
                        ctx.fillStyle = '#475569'; ctx.fillRect(railLeft, railY - 4, railRight - railLeft, 8);
                        ctx.fillStyle = '#334155'; roundRect(ctx, p.x + p.w / 2 - 18, railY - 17, 36, 26, 4); ctx.fill();
                        ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.arc(p.x + p.w / 2, railY - 4, 8, 0, TAU); ctx.fill();
                        this.drawFactoryDeck(ctx, p);
                        continue;
                    }
                    ctx.fillStyle = 'rgba(56,189,248,.22)'; ctx.fillRect(p.x + 12, p.y + p.h, 14, 14 + Math.sin(this.anim * 20) * 4); ctx.fillRect(p.x + p.w - 26, p.y + p.h, 14, 14 + Math.cos(this.anim * 20) * 4);
                    ctx.fillStyle = B.body; roundRect(ctx, p.x, p.y + 4, p.w, p.h - 2, 5); ctx.fill();
                    ctx.fillStyle = B.edge; roundRect(ctx, p.x, p.y, p.w, p.h - 4, 5); ctx.fill();
                    ctx.fillStyle = B.ledgeTop; ctx.fillRect(p.x + 4, p.y, p.w - 8, 4);
                    ctx.fillStyle = B.accent; for (let hx = p.x + 12; hx < p.x + p.w - 8; hx += 22) ctx.fillRect(hx, p.y + 8, 10, 3);
                } else if (p.bi === 2) {
                    this.drawCloud(ctx, p, p.x, p.y, p.w, Math.max(p.h, 18));
                } else {
                    this.drawLedge(ctx, p, B);
                }
            }
            for (const c of this.checkpoints) {
                if (c.x > right || c.x < left || !seen(c.y)) continue;
                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(c.x, c.y - 70, 4, 70);
                ctx.fillStyle = this.cp.id >= c.id ? '#34d399' : '#f87171';
                ctx.beginPath(); ctx.moveTo(c.x + 4, c.y - 70); ctx.lineTo(c.x + 38, c.y - 58); ctx.lineTo(c.x + 4, c.y - 44); ctx.fill();
            }
            for (const sp of this.spikes) {
                if (sp.x > right || sp.x + sp.w < left || !seen(sp.y)) continue;
                ctx.fillStyle = '#475569'; ctx.fillRect(sp.x - 2, sp.y + sp.h - 2, sp.w + 4, 4);
                ctx.fillStyle = SKY_BIOMES[sp.bi || 0].accent;
                for (let i = 0; i < sp.w; i += 15) { const width = Math.min(15, sp.w - i); ctx.beginPath(); ctx.moveTo(sp.x + i, sp.y + sp.h); ctx.lineTo(sp.x + i + width / 2, sp.y); ctx.lineTo(sp.x + i + width, sp.y + sp.h); ctx.fill(); }
            }
            for (const sp of this.springs) {
                if (sp.x > right || sp.x + sp.w < left || !seen(sp.y)) continue;
                if (sp.bi === 2) {
                    // bouncy cloud: a springy puff that squashes and rebounds when you land on it
                    const since = sp.hit === undefined ? 9 : this.anim - sp.hit;
                    const squash = since < .5 ? Math.sin(since * 22) * Math.exp(-since * 7) : Math.sin(this.anim * 3 + sp.x) * .06;
                    const cx = sp.x + sp.w / 2, base = sp.y + sp.h, rw = 30 * (1 + squash * .5), rh = 14 * (1 - squash * .6);
                    ctx.fillStyle = '#f9a8d4';
                    ctx.beginPath(); ctx.ellipse(cx, base - rh * .45, rw + 4, rh * .7, 0, 0, TAU); ctx.fill();
                    ctx.fillStyle = '#fdf2f8';
                    for (const [ox, oy, r] of [[-15, -.55, .55], [0, -.95, .7], [15, -.55, .55]]) {
                        ctx.beginPath(); ctx.ellipse(cx + ox * (1 + squash * .4), base + oy * rh, rw * r, rh * r * 1.1, 0, 0, TAU); ctx.fill();
                    }
                    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(cx - 6, base - rh * 1.3, 7, 2.5, 0, 0, TAU); ctx.fill();
                    continue;
                }
                ctx.fillStyle = '#475569'; ctx.fillRect(sp.x, sp.y + 12, sp.w, 4);
                ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sp.x + 6, sp.y + 12);
                for (let i = 0; i < 4; i++) { ctx.lineTo(sp.x + sp.w - 6, sp.y + 10 - i * 2.5); ctx.lineTo(sp.x + 6, sp.y + 8.5 - i * 2.5); }
                ctx.stroke();
                ctx.fillStyle = '#f97316'; roundRect(ctx, sp.x + 2, sp.y - 2, sp.w - 4, 6, 3); ctx.fill();
                ctx.fillStyle = '#fde68a'; ctx.fillRect(sp.x + 8, sp.y - 1, sp.w - 16, 2);
            }
            for (const l of this.lasers) {
                if (l.x > right || l.x < left || !seen(l.y)) continue;
                if (l.mounted) {
                    ctx.strokeStyle = SKY_BIOMES[l.bi || 0].edge; ctx.lineWidth = 3; ctx.beginPath();
                    ctx.moveTo(l.x - 16, l.y + l.h); ctx.lineTo(l.x - 16, l.y - 10); ctx.lineTo(l.x + 16, l.y - 10); ctx.stroke();
                }
                ctx.fillStyle = '#334155'; roundRect(ctx, l.x - 8, l.y - 10, 26, 14, 4); ctx.fill(); ctx.fillStyle = l.on ? '#f87171' : '#7f1d1d'; ctx.fillRect(l.x + 1, l.y + 2, 8, 3);
                ctx.fillStyle = '#334155'; roundRect(ctx, l.x - 8, l.y + l.h - 4, 26, 14, 4); ctx.fill(); ctx.fillStyle = l.on ? '#f87171' : '#7f1d1d'; ctx.fillRect(l.x + 1, l.y + l.h - 5, 8, 3);
                if (l.on) { ctx.fillStyle = 'rgba(248,113,113,.9)'; ctx.fillRect(l.x, l.y, l.w, l.h); ctx.fillStyle = 'rgba(254,202,202,.5)'; ctx.fillRect(l.x - 5, l.y, l.w + 10, l.h); }
                else { ctx.fillStyle = 'rgba(248,113,113,.18)'; ctx.fillRect(l.x + 3, l.y, 3, l.h); }
            }
            for (const sw of this.saws) {
                if (sw.x > right || sw.x < left || !seen(sw.y)) continue;
                if (sw.mountY !== undefined) {
                    ctx.strokeStyle = SKY_BIOMES[sw.bi || 0].edge; ctx.lineWidth = 4; ctx.beginPath();
                    ctx.moveTo(sw.cx, sw.mountY); ctx.lineTo(sw.cx, sw.cy - sw.amp - 10); ctx.stroke();
                    ctx.fillStyle = '#475569'; ctx.fillRect(sw.cx - 8, sw.mountY - 5, 16, 5);
                }
                if (sw.bi === 3) {
                    const pulse = 1 + Math.sin(this.anim * 8) * .12;
                    ctx.fillStyle = 'rgba(103,232,249,.22)'; ctx.beginPath(); ctx.arc(sw.x, sw.y, (sw.r + 12) * pulse, 0, TAU); ctx.fill();
                    ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r, 0, TAU); ctx.fill();
                    ctx.fillStyle = '#e0f2fe'; ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r * .45, 0, TAU); ctx.fill();
                    continue;
                }
                ctx.fillStyle = 'rgba(239,68,68,.18)'; ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r + 14, 0, TAU); ctx.fill();
                ctx.save(); ctx.translate(sw.x, sw.y); ctx.rotate(this.anim * 9);
                ctx.fillStyle = '#e2e8f0';
                for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(sw.r - 3, -5); ctx.lineTo(sw.r + 7, 0); ctx.lineTo(sw.r - 3, 5); ctx.fill(); }
                ctx.beginPath(); ctx.arc(0, 0, sw.r, 0, TAU); ctx.fillStyle = '#94a3b8'; ctx.fill();
                ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, sw.r - 7, 0, TAU); ctx.moveTo(-(sw.r - 7), 0); ctx.lineTo(sw.r - 7, 0); ctx.moveTo(0, -(sw.r - 7)); ctx.lineTo(0, sw.r - 7); ctx.stroke();
                ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
                ctx.restore();
            }
            for (const d of this.drills) {
                if (d.x > right + 30 || d.x < left - 30 || !seen(d.surfaceY)) continue;
                this.drawDrill(ctx, d);
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
            if (this.tideY < bottom && !(s.testing === true && s.testNoTide === true)) {
                const tb = SKY_ROUTE[Math.min(SKY_ROUTE.length - 1, Math.floor(this.biomeProgress(-this.tideY)))];
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
            }

            for (const r of s.remoteList()) {
                if (r.x > right || r.x + 26 < left || r.y > bottom || r.y + 44 < top) continue;
                drawRunner(ctx, r.x, r.y, 26, 44, r, r.f || 1, this.anim + r.x * 0.01, r.a === 1 ? 1 : 0, 0.8);
                if (!this.s.preview) nameTag(ctx, r.name || '', r.x + 13, r.y - 14, r.color);
            }
            if (this.dead <= 0) {
                const blink = this.boost > 0 ? 0.7 + Math.sin(this.anim * 20) * 0.3 : 1;
                drawRunner(ctx, me.x, me.y, me.w, me.h, s.local, me.face, this.anim, this.state === 1 ? 1 : 0, blink);
                if (!this.s.preview) nameTag(ctx, 'You', me.x + 13, me.y - 14, '#fff');
            }
            this.particles.draw(ctx);
            ctx.restore();
            // foreground: soft vignette and drifting haze for depth
            if (!s.graphics?.low) {
                const transformScale = (s.dpr || 1) * (s.scale || 1);
                if (!this.foreground || this.foreground.w !== w || this.foreground.h !== h || this.foreground.scale !== transformScale) {
                    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.8);
                    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,6,23,.38)');
                    const hz = ctx.createLinearGradient(0, h * 0.8, 0, h);
                    hz.addColorStop(0, 'rgba(148,163,184,0)'); hz.addColorStop(1, 'rgba(148,163,184,.14)');
                    this.foreground = { w, h, scale: transformScale, vg, hz };
                }
                ctx.fillStyle = this.foreground.vg; ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = this.foreground.hz; ctx.fillRect(0, h * 0.8, w, h * 0.2);
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Hammerheart Showdown: platform brawler                              */
    /* ------------------------------------------------------------------ */
    class Duel extends A.BaseGame {
        constructor(s) {
            super(s);
            this.title = 'King of the Hill';
            this.W = 2000; this.H = 920;
            const scaleX = this.W / 1600;
            this.scoreGoal = false; this.goalUnit = 'sec on hill'; this.goalLabel = 'On the hill';
            this.formatValue = v => `${v}s`;
            this.solids = [
                { x: 300, y: 520, w: 1000, h: 260, main: true },
                { x: 400, y: 390, w: 220, h: 14, oneway: true },
                { x: 980, y: 390, w: 220, h: 14, oneway: true },
                { x: 690, y: 270, w: 220, h: 14, oneway: true }
            ];
            this.solids = this.solids.map(platform => ({ ...platform, x: platform.x * scaleX, w: platform.w * scaleX }));
            this.stage = this.solids[0];
            this.me = { x: 790, y: 200, w: 34, h: 56, vx: 0, vy: 0, face: 1 };
            const spawns = [[480, 440], [1080, 440], [790, 200], [790, 460]].map(([x, y]) => [(x + 17) * scaleX - 17, y]);
            this.botSpawns = [[390, 440], [1190, 440], [790, 200]].map(([x, y]) => [(x + 17) * scaleX - 17, y]);
            this.spawn = spawns[hashStr(s.user.id) % spawns.length];
            this.placeAtSpawn(this.me, this.spawn);
            this.dmg = 0; this.stun = 0; this.invuln = 1.5; this.swingT = 0; this.swingCd = 0; this.heavyCd = 0; this.swingHeavy = false; this.specialCharge = 0;
            this.guard = false; this.airJumps = 1; this.coyote = 0; this.hammer = 0; this.kos = 0; this.falls = 0; this.respawn = 0;
            this.lastHit = { by: null, at: 0 }; this.anim = 0; this.orb = { x: this.W / 2, y: 150, t: 0 }; this.state = 0; this.shake = 0;
            this.hitFlash = 0; this.hitlag = 0; this.dropTimer = 0; this.dodge = 0; this.dodgeCd = 0; this.shieldBreak = 0;
            this.view = { z: 1, x: this.me.x + 17, y: this.me.y + 28 }; this.aim = 0; this.swingAim = 0; this.offX = 0; this.offY = 0; this.touchAim = null;
            this.hillTick = 0; this.hillState = 'away';
            this.zones = [
                { x: 690, y: 270, w: 220, name: 'Top ledge' }, { x: 640, y: 520, w: 320, name: 'Center stage' },
                { x: 400, y: 390, w: 220, name: 'Left ledge' }, { x: 980, y: 390, w: 220, name: 'Right ledge' }
            ];
            this.zones = this.zones.map(zone => ({ ...zone, x: zone.x * scaleX, w: zone.w * scaleX }));
            this.res = new A.Resource('Energy', '#fb7185', 100, 60, 2);
        }

        // The hill moves every 20 seconds; all clients derive it from the shared start time
        placeAtSpawn(body, point) {
            body.x = clamp(point[0], this.stage.x + 8, this.stage.x + this.stage.w - body.w - 8);
            const support = this.solids.filter(p => body.x >= p.x + 4 && body.x + body.w <= p.x + p.w - 4 && p.y >= point[1] - 60)
                .sort((a, b) => a.y - b.y)[0] || this.stage;
            body.y = support.y - body.h;
            body.vx = body.vy = 0; body.onGround = true; body.ground = support;
        }

        hill() {
            const elapsed = Math.max(0, Date.now() - this.s.startedAt) / 1000;
            const index = Math.floor(elapsed / 20) % this.zones.length;
            return { zone: this.zones[index], left: 20 - (elapsed % 20) };
        }

        inHill(body, zone) {
            const cx = body.x + (body.w ?? 34) / 2, feet = body.y + (body.h ?? 56);
            return cx >= zone.x && cx <= zone.x + zone.w && feet >= zone.y - 150 && feet <= zone.y + 14;
        }

        updateHill(dt) {
            const s = this.s, zone = this.hill().zone;
            const mine = this.respawn <= 0 && !s.question && this.inHill(this.me, zone);
            const rivals = s.remoteList().some(r => r.a !== 5 && this.inHill(r, zone));
            this.hillState = !mine ? 'away' : rivals ? 'contested' : 'holding';
            if (this.hillState !== 'holding') return;
            this.hillTick += dt;
            const seconds = Math.floor(this.hillTick + 1e-9);
            if (seconds > 0) {
                this.hillTick = Math.max(0, this.hillTick - seconds);
                this.hillSecs = (this.hillSecs || 0) + seconds;
                this.specialCharge = Math.min(100, this.specialCharge + seconds * 20);
                s.setGoal(this.hillSecs); s.addScore(12 * seconds); s.sfx('coin', 300);
                this.particles.burst(this.me.x + 17, this.me.y, '#fde047', 4, 120, 0.4, 3);
            }
        }

        update(dt) {
            const s = this.s, me = this.me;
            this.updateCamera(s.vw, s.vh, dt);
            this.anim += dt; this.shake = Math.max(0, this.shake - dt); this.hitFlash = Math.max(0, this.hitFlash - dt);
            this.orb.t = Math.max(0, this.orb.t - dt);
            this.invuln = Math.max(0, this.invuln - dt);
            this.hammer = Math.max(0, this.hammer - dt);
            this.swingCd = Math.max(0, this.swingCd - dt); this.swingT = Math.max(0, this.swingT - dt); this.stun = Math.max(0, this.stun - dt);
            this.heavyCd = Math.max(0, this.heavyCd - dt);
            this.dodgeCd = Math.max(0, this.dodgeCd - dt); this.dodge = Math.max(0, this.dodge - dt);
            this.shieldBreak = Math.max(0, this.shieldBreak - dt);
            if (this.dropTimer > 0) {
                this.dropTimer = Math.max(0, this.dropTimer - dt);
                if (this.dropTimer === 0) for (const p of this.solids) if (p.oneway) p.off = false;
            }
            if (this.hitlag > 0) {
                this.hitlag = Math.max(0, this.hitlag - dt);
                this.updateHill(dt);
                this.particles.update(dt, 300);
                return;
            }
            if (this.respawn > 0) {
                this.respawn -= dt;
                if (this.respawn <= 0) {
                    this.placeAtSpawn(me, this.spawn);
                    this.dmg = 0; this.invuln = 2.2; this.hammer = 0; this.airJumps = 1;
                }
                this.state = 5; this.particles.update(dt, 500);
                this.hillState = 'away';
                return;
            }
            const ax = this.stun > 0 || this.dodge > 0 ? 0 : s.axis().x;
            this.guard = this.stun <= 0 && this.dodge <= 0 && this.shieldBreak <= 0 && s.down('KeyS');
            if (this.guard) {
                this.res.drain(dt * 16);
                if (this.res.value <= 0) { this.guard = false; this.shieldBreak = 0.8; s.sfx('click'); }
            }
            if (this.stun <= 0 && this.dodgeCd <= 0 && s.pressed('ShiftLeft', 'ShiftRight', 'KeyF')) {
                this.dodge = 0.18; this.dodgeCd = 0.85; this.invuln = Math.max(this.invuln, 0.16);
                me.vx = (ax || me.face || 1) * 760; me.vy *= 0.45; this.guard = false; s.sfx('dash');
            }
            if (this.stun <= 0 && me.onGround && me.ground?.oneway && s.pressed('ArrowDown')) {
                this.dropTimer = 0.24; me.y += 3; me.vy = 120;
                for (const p of this.solids) if (p.oneway) p.off = true;
            }
            const target = this.guard ? 0 : ax * 340;
            const acc = (me.onGround ? 3000 : 2100) * dt;
            if (this.dodge <= 0) me.vx += clamp(target - me.vx, -acc, acc);
            const mouseAim = this.aimAngle();
            if (mouseAim !== null) {
                // The player always looks toward the cursor
                this.aim = mouseAim;
                if (Math.abs(Math.cos(mouseAim)) > 0.05) me.face = Math.cos(mouseAim) >= 0 ? 1 : -1;
            } else {
                if (ax && this.swingT <= 0) me.face = ax;
                this.aim = me.face > 0 ? 0 : Math.PI;
            }
            const fastFalling = !me.onGround && s.down('ArrowDown') && this.stun <= 0;
            me.vy = Math.min(fastFalling ? 1650 : 1200, me.vy + (fastFalling ? 3200 : 2400) * dt);
            if (me.onGround) { this.airJumps = 1; this.coyote = 0.1; } else this.coyote -= dt;
            if (this.stun <= 0 && (s.pressed('Space', 'KeyW', 'ArrowUp') || (s.stickJumpHeld && me.onGround))) {
                if (this.coyote > 0) { me.vy = -900; this.coyote = 0; s.sfx('jump'); }
                else if (this.airJumps > 0) { me.vy = -820; this.airJumps--; s.sfx('jump'); this.particles.burst(me.x + 17, me.y + 56, '#bae6fd', 8, 120, 0.3, 4); }
            }
            const heavy = s.pressed('KeyR');
            const attack = heavy ? this.heavyCd <= 0 && this.specialCharge >= 100 : s.mouse.pressed || s.pressed('KeyE');
            if (heavy && !attack) s.toast(this.heavyCd > 0 ? `Special recharging: ${Math.ceil(this.heavyCd)}s` : 'Charge Special: hold the hill or land attacks', '#fbbf24');
            if (this.stun <= 0 && !this.guard && this.dodge <= 0 && this.swingCd <= 0 && attack && s.spend(heavy ? 24 : 8)) {
                this.swingHeavy = heavy;
                if (heavy) { this.heavyCd = 12; this.specialCharge = 0; this.shake = .4; s.toast('THUNDER HAMMER!', '#fbbf24'); }
                this.swingT = heavy ? 0.45 : 0.22; this.swingCd = heavy ? 1 : 0.52; s.sfx('swing'); this.swingAim = this.aim;
                s.emit({ k: 'sw', x: Math.round(me.x + 17), y: Math.round(me.y + 28), d: me.face, a: +this.aim.toFixed(2), p: (this.hammer > 0 ? 1.6 : 1) * (heavy ? 3 : 1), h: heavy ? 1 : 0, by: s.user.id, c: (this.dmg | 0) });
                this.particles.burst(me.x + 17 + Math.cos(this.aim) * 70, me.y + 28 + Math.sin(this.aim) * 70, '#fde68a', heavy ? 32 : 8, heavy ? 420 : 200, heavy ? .65 : .25, heavy ? 7 : 4);
            }
            moveBody(me, this.solids, dt);
            const drag = me.onGround ? 1 : 0;
            if (drag && this.stun > 0) me.vx *= 0.92;

            if (this.orb.t <= 0 && dist(me.x + 17, me.y + 28, this.orb.x, this.orb.y) < 44) {
                const opened = s.ask(correct => {
                    if (correct) { this.hammer = 10; this.dmg = Math.max(0, this.dmg - 25); s.refill(); s.addScore(40); s.toast('Heart Hammer! Hits hit harder', '#f472b6'); }
                    else if (correct === false) s.toast('Missed the power-up', '#f87171');
                });
                if (opened) this.orb.t = 1;
            }
            if (this.respawn <= 0 && (me.x < -180 || me.x > this.W + 180 || me.y > this.H || me.y < -650
                || (me.y > this.stage.y + 80 && me.x + me.w > this.stage.x && me.x < this.stage.x + this.stage.w))) this.ko();
            this.updateHill(dt);
            this.state = this.guard ? 4 : this.dodge > 0 ? 6 : this.swingT > 0 ? 3 : !me.onGround ? 2 : Math.abs(me.vx) > 40 ? 1 : 0;
            this.particles.update(dt, 300);
        }

        screenToWorldX(sx) { return (sx - this.offX) / this.view.z; }

        aimAngle() {
            const m = this.s.mouse, me = this.me;
            const touch = this.s.overlay.classList.contains('has-touch');
            if (touch && !m.down && !m.pressed) return this.touchAim;
            if (!touch && !(m.x || m.y || m.pressed)) return null;
            const wx = (m.x - this.offX) / this.view.z, wy = (m.y - this.offY) / this.view.z;
            const angle = Math.atan2(wy - (me.y + 28), wx - (me.x + 17));
            if (touch) this.touchAim = angle;
            return angle;
        }

        updateCamera(w, h, dt = 0) {
            const minX = Math.min(...this.solids.map(p => p.x)) - 80;
            const maxX = Math.max(...this.solids.map(p => p.x + p.w)) + 80;
            const minY = Math.min(this.orb.y - 24, ...this.zones.map(zone => zone.y - 150)) - 70;
            const maxY = Math.max(...this.solids.map(p => p.y + p.h)) + 70;
            const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
            const fit = Math.min(w / (maxX - minX), h / (maxY - minY));
            const cssScale = this.s.scale || 1;
            const z = this.s.preview ? fit : clamp(fit, .65 / cssScale, 1.15 / cssScale);
            const halfW = w / (2 * z), halfH = h / (2 * z);
            const fitsX = halfW * 2 >= maxX - minX - 0.01;
            const fitsY = halfH * 2 >= maxY - minY - 0.01;
            const targetX = fitsX ? centerX : clamp(this.me.x + 17, minX + halfW, maxX - halfW);
            const targetY = fitsY ? centerY : clamp(this.me.y + 28, minY + halfH, maxY - halfH);
            const follow = 1 - Math.exp(-Math.max(0, dt) * 8);
            this.view.x = fitsX ? centerX : clamp(lerp(this.view.x, targetX, follow), minX + halfW, maxX - halfW);
            this.view.y = fitsY ? centerY : clamp(lerp(this.view.y, targetY, follow), minY + halfH, maxY - halfH);
            this.view.z = z;
            this.offX = w / 2 - this.view.x * z;
            this.offY = h / 2 - this.view.y * z;
            this.cameraBounds = { minX, maxX, minY, maxY, fitsX, fitsY };
        }

        edgeArrow(ctx, x, y, label, color, w, h) {
            const sx = x * this.view.z + this.offX, sy = y * this.view.z + this.offY;
            const safe = this.s.hudBounds(), cx = safe.x + safe.w / 2, cy = safe.y + safe.h / 2;
            if (sx > 8 && sx < w - 8 && sy > 8 && sy < h - 8) return;
            const dx = sx - cx, dy = sy - cy;
            const scale = Math.min(Math.max(1, safe.w / 2 - 32) / Math.max(1, Math.abs(dx)), Math.max(1, safe.h / 2 - 32) / Math.max(1, Math.abs(dy)));
            const px = cx + dx * scale, py = cy + dy * scale;
            ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(dy, dx));
            ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.restore();
            ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = color;
            ctx.fillText(label, clamp(px, safe.x + 50, safe.x + safe.w - 50), py + (py < cy ? 23 : -17));
        }

        ko() {
            if (this.respawn > 0) return;
            const s = this.s;
            this.particles.burst(this.me.x, this.me.y, s.local.color, 30, 500, 0.8, 6); s.sfx('boom');
            const by = Date.now() - this.lastHit.at < 6000 ? this.lastHit.by : null;
            this.falls++;
            s.emit({ k: 'ko', to: s.user.id, by, falls: this.falls });
            this.respawn = 1.4; this.shake = 0.4; this.dmg = 0; this.lastHit = { by: null, at: 0 };
        }

        attackHits(ev, body) {
            const angle = typeof ev.a === 'number' ? ev.a : (ev.d > 0 ? 0 : Math.PI);
            const reach = ev.h === 1 ? 180 : 110;
            const sweep = [{ x: ev.x, y: ev.y }];
            for (let i = 0; i <= 16; i++) {
                const a = angle - 0.86 + i * 1.72 / 16;
                sweep.push({ x: ev.x + Math.cos(a) * reach, y: ev.y + Math.sin(a) * reach });
            }
            const rect = [
                { x: body.x, y: body.y }, { x: body.x + body.w, y: body.y },
                { x: body.x + body.w, y: body.y + body.h }, { x: body.x, y: body.y + body.h }
            ];
            // Test the whole fighter rectangle against the visible hammer sweep.
            const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
            for (let i = 0; i < sweep.length; i++) {
                const next = sweep[(i + 1) % sweep.length];
                axes.push({ x: next.y - sweep[i].y, y: sweep[i].x - next.x });
            }
            return axes.every(axis => {
                const a = sweep.map(p => p.x * axis.x + p.y * axis.y);
                const b = rect.map(p => p.x * axis.x + p.y * axis.y);
                return Math.max(...a) >= Math.min(...b) && Math.max(...b) >= Math.min(...a);
            });
        }

        hitImpact(ev, damage, blocked = false) {
            const power = ev.p || 1;
            const nextDamage = Math.min(999, damage + 9 * power * (blocked ? 0.22 : 1));
            return {
                damage: nextDamage,
                force: clamp((360 + nextDamage * 12) * power * (blocked ? 0.24 : 1), 0, 1700),
                stun: blocked ? 0.1 : clamp(0.18 + nextDamage / 180, 0.18, 0.82)
            };
        }

        onEvent(ev, from) {
            const s = this.s, me = this.me;
            if (ev.k === 'sw') {
                from.swing = performance.now();
                from.swingAim = typeof ev.a === 'number' ? ev.a : (ev.d > 0 ? 0 : Math.PI);
                from.swingHeavy = ev.h === 1;
                if (this.respawn > 0 || this.invuln > 0 || this.stun > 0.2 || !this.attackHits(ev, me)) return;
                const angle = from.swingAim, dx = Math.cos(angle), dy = Math.sin(angle);
                const blocked = this.guard && me.face === -(dx >= 0 ? 1 : -1);
                const impact = this.hitImpact(ev, this.dmg, blocked), force = impact.force;
                this.dmg = impact.damage;
                me.vx = dx * force; me.vy = blocked ? 0 : dy * force * 0.58 - (150 + this.dmg * 2.2);
                me.onGround = false;
                this.stun = impact.stun;
                this.hitlag = blocked ? 0.035 : 0.055; this.hitFlash = 0.2; this.shake = 0.24;
                s.sfx(blocked ? 'click' : 'hit', 60);
                this.lastHit = { by: ev.by, at: Date.now() };
                this.particles.burst(me.x + 17, me.y + 28, blocked ? '#7dd3fc' : '#fca5a5', 14, 320, 0.45, 5);
                s.emit({ k: 'hit', by: ev.by, blocked });
            } else if (ev.k === 'hit' && ev.by === s.user.id) {
                this.specialCharge = Math.min(100, this.specialCharge + (ev.blocked ? 10 : 35));
                this.hitlag = Math.max(this.hitlag, 0.04); this.shake = 0.18;
                s.addScore(ev.blocked ? 3 : 10); s.sfx('pop', 60);
                this.particles.burst(from.x + 17, from.y + 28, '#fde68a', 8, 200, 0.3, 4);
            } else if (ev.k === 'ko' && ev.by === s.user.id) {
                this.kos++; s.addScore(100); s.sfx('win'); s.toast(`KO! ${from.name} launched out`, '#facc15');
            }
        }

        net() {
            const m = this.me;
            return { x: Math.round(m.x), y: Math.round(m.y), vx: Math.round(m.vx), vy: Math.round(m.vy), f: m.face, a: this.state,
                ex: { d: Math.round(this.dmg), h: this.hammer > 0 ? 1 : 0, hv: this.swingHeavy ? 1 : 0, i: this.invuln > 0 ? 1 : 0, t: +(this.aim || 0).toFixed(2), k: this.kos, f: this.falls } };
        }

        goalText() { return `${this.kos} KOs · ${Math.round(this.dmg)}% damage · Special ${this.heavyCd > 0 ? `${this.heavyCd.toFixed(1)}s` : this.specialCharge >= 100 ? 'READY' : `${Math.floor(this.specialCharge)}%`}`; }
        touchLayout() { return { stick: true, platform: true, buttons: [{ k: 'Space', label: 'Jump' }, { k: 'KeyS', label: 'Guard' }, { k: 'KeyR', label: 'Special', small: true }, { k: 'ShiftLeft', label: 'Dodge' }] }; }
        touchHint() { return 'Joystick to move · Jump for an air jump · Tap to swing · Charge Special by holding the hill or hitting rivals: 3x power, 24 energy, 12s cooldown'; }
        hint() { return 'A/D move · Space jump twice · S guard · E/click swing · R Special (charge on hill/hits, 3x power, 24 energy, 12s cooldown) · Shift/F dodge · Down fast-fall · Q recharge'; }

        drawFighter(ctx, x, y, who, face, state, dmg, name, hammer, swingAge, alpha, you, aim, swingAim, heavySwing = false) {
            const color = who.color;
            drawRunner(ctx, x, y, 34, 56, who, face, this.anim, state === 1 ? 1 : 0, alpha);
            const cx = x + 34 / 2, cy = y + 28;
            const duration = heavySwing ? 0.45 : 0.22;
            const swinging = state === 3 || swingAge < duration;
            ctx.save();
            ctx.translate(cx, cy);
            const base = swinging && typeof swingAim === 'number' ? swingAim : (typeof aim === 'number' ? aim : (face > 0 ? 0 : Math.PI));
            const sweepProgress = Math.max(0, Math.min(1, swingAge / duration));
            const strike = Math.max(0, Math.min(1, (sweepProgress - .18) / .55));
            const eased = 1 - Math.pow(1 - strike, 3);
            const angle = base + (swinging ? sweepProgress < .18 ? -.62 - .24 * Math.sin(sweepProgress / .18 * Math.PI / 2) : -.86 + eased * 1.72 : -.35);
            ctx.globalAlpha = alpha;
            const reach = heavySwing ? 180 : 110;
            if (heavySwing && swinging) {
                ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 8 * (1 - sweepProgress) + 2;
                ctx.globalAlpha = alpha * (1 - sweepProgress);
                ctx.beginPath(); ctx.arc(0, 0, reach * Math.min(1, sweepProgress * 3), base - 1.1, base + 1.1); ctx.stroke();
                ctx.globalAlpha = alpha;
            }
            if (swinging && strike > 0 && sweepProgress < .85) {
                for (let trail = 0; trail < 3; trail++) {
                    ctx.globalAlpha = alpha * (.5 - trail * .13);
                    ctx.strokeStyle = hammer ? '#f9a8d4' : '#fde68a';
                    ctx.lineWidth = (heavySwing ? 7 : 4) - trail;
                    ctx.beginPath(); ctx.arc(0, 0, reach - 8 - trail * 8, Math.max(base - .86, angle - .55), angle); ctx.stroke();
                }
                ctx.globalAlpha = alpha;
            }
            ctx.rotate(angle);
            const shaft = swinging ? 62 + (reach - 82) * Math.min(1, strike * 4) : 62;
            ctx.fillStyle = '#713f12'; roundRect(ctx, 0, -4, shaft, 8, 3); ctx.fill();
            ctx.fillStyle = '#d6a56a'; ctx.fillRect(6, -3, shaft - 16, 2);
            ctx.fillStyle = '#334155';
            for (let grip = 8; grip < 30; grip += 6) ctx.fillRect(grip, -5, 3, 10);
            const headW = heavySwing ? 38 : 30, headH = heavySwing ? 44 : 34;
            ctx.fillStyle = hammer ? '#be185d' : '#475569'; roundRect(ctx, shaft - headW / 2, -headH / 2, headW, headH, 6); ctx.fill();
            ctx.fillStyle = hammer ? '#f9a8d4' : '#cbd5e1'; roundRect(ctx, shaft - headW / 2 + 3, -headH / 2 + 3, headW - 6, headH - 9, 4); ctx.fill();
            ctx.fillStyle = hammer ? '#ec4899' : '#94a3b8'; ctx.fillRect(shaft - headW / 2 + 3, headH / 2 - 8, headW - 6, 4);
            ctx.restore();
            if (state === 6) { ctx.strokeStyle = 'rgba(56,189,248,.9)'; ctx.lineWidth = 3; ctx.strokeRect(x - 3, y - 3, 40, 62); }
            if (state === 4) { ctx.strokeStyle = 'rgba(125,211,252,.85)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, TAU); ctx.stroke(); }
            if (!this.s.preview) nameTag(ctx, `${you ? 'You' : name} · ${Math.round(dmg)}%`, cx, y - 14, you ? '#fff' : color);
        }

        draw(ctx, w, h) {
            const s = this.s, me = this.me;
            this.updateCamera(w, h);
            const z = this.view.z;
            duelBackdrop(ctx, w, h, this);
            ctx.save();
            const sh = this.shake > 0 ? 8 : 0;
            ctx.translate(this.offX + (Math.random() - 0.5) * sh, this.offY + (Math.random() - 0.5) * sh);
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
            if (!s.preview) ctx.fillText(`♛ HILL · ${Math.ceil(hill.left)}s`, hz.x + hz.w / 2, hz.y - 160);
            if (this.orb.t <= 0) {
                const bob = Math.sin(this.anim * 3) * 8;
                ctx.shadowColor = '#f472b6'; ctx.shadowBlur = s.graphics?.low ? 0 : 24;
                ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.arc(this.orb.x, this.orb.y + bob, 24, 0, TAU); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff'; ctx.font = '900 26px system-ui'; ctx.textAlign = 'center'; if (!s.preview) ctx.fillText('?', this.orb.x, this.orb.y + bob + 9);
            }
            for (const r of s.remoteList()) {
                if (r.a === 5) continue;
                const swingAge = r.swing ? (performance.now() - r.swing) / 1000 : 9;
                this.drawFighter(ctx, r.x, r.y, r, r.f || 1, r.a, r.ex?.d || 0, r.name, r.ex?.h, swingAge, r.ex?.i ? 0.5 : 0.95, false, r.ex?.t, r.swingAim, r.swingHeavy ?? Boolean(r.ex?.hv));
            }
            if (this.respawn <= 0) {
                const alpha = this.invuln > 0 ? 0.55 + Math.sin(this.anim * 22) * 0.25 : 1;
                this.drawFighter(ctx, me.x, me.y, s.local, me.face, this.state, this.dmg, 'You', this.hammer > 0, this.swingT > 0 ? (this.swingHeavy ? 0.45 : 0.22) - this.swingT : 9, alpha, true, this.aim, this.swingAim, this.swingHeavy);
                if (!s.preview) {
                    ctx.fillStyle = '#1e293b'; ctx.fillRect(me.x - 8, me.y - 42, 50, 6);
                    ctx.fillStyle = this.specialCharge >= 100 && this.heavyCd <= 0 ? '#fef08a' : '#f59e0b';
                    ctx.fillRect(me.x - 8, me.y - 42, this.specialCharge / 2, 6);
                    if (this.specialCharge >= 100 && this.heavyCd <= 0) {
                        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3;
                        ctx.beginPath(); ctx.arc(me.x + 17, me.y + 28, 48 + Math.sin(this.anim * 5) * 4, 0, TAU); ctx.stroke();
                        ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('SPECIAL READY', me.x + 17, me.y - 48);
                    }
                }
                if (this.hitFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(me.x, me.y, me.w, me.h); }
            }
            this.particles.draw(ctx);
            ctx.restore();
            if (s.preview) return;
            this.edgeArrow(ctx, hz.x + hz.w / 2, hz.y - 75, `HILL ${Math.ceil(hill.left)}s`, '#facc15', w, h);
            for (const r of s.remoteList()) if (r.a !== 5) this.edgeArrow(ctx, r.x + 17, r.y + 28, r.name, r.color, w, h);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Starfall Blasters: top-down twin-stick arena shooter                */
    /* ------------------------------------------------------------------ */
    class Shooter extends A.BaseGame {
        constructor(s) {
            super(s);
            this.title = 'Arena Shooter';
            this.touchBlast = true; this.touchMain = 'Dash';
            this.scoreGoal = false; this.goalUnit = 'kill pts';
            this.W = 3100; this.H = 2050;
            const r = mulberry32(s.seed);
            this.walls = [
                { x: -60, y: -60, w: this.W + 120, h: 60 }, { x: -60, y: this.H, w: this.W + 120, h: 60 },
                { x: -60, y: 0, w: 60, h: this.H }, { x: this.W, y: 0, w: 60, h: this.H }
            ];
            this.cover = [];
            for (const [x, y] of [[440, 350], [880, 620]]) {
                for (const sx of [1, -1]) for (const sy of [1, -1]) {
                    const mirror = wall => ({
                        x: sx > 0 ? wall.x : this.W - wall.x - wall.w,
                        y: sy > 0 ? wall.y : this.H - wall.y - wall.h,
                        w: wall.w, h: wall.h
                    });
                    this.cover.push(mirror({ x, y, w: 210, h: 46 }), mirror({ x, y: y + 46, w: 46, h: 140 }));
                }
            }
            this.multiplayer = !s.preview && s.roster.size > 1;
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
            this.weapon = 'blaster'; this.weaponT = 0; this.damageTexts = []; this.streak = 0; this.streakT = 0; this.wave = 1;
            this.pickups = [];
            const types = ['shotgun', 'rapid', 'rail', 'health'];
            for (let i = 0; i < 8; i++) {
                const p = { x: 140 + r() * (this.W - 280), y: 140 + r() * (this.H - 280), type: types[i % types.length], t: 0 };
                if (!this.walls.some(w => overlap({ x: p.x - 30, y: p.y - 30, w: 60, h: 60 }, w))) this.pickups.push(p);
            }
            this.weaponZoom = 1; this.zoom = this.cameraZoom(s.vw, s.vh); this.zoomWeapon = this.weapon; this.weaponNotice = 0;
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
            const heavy = !shooter && this.s.t > 20 && r() < 0.18;
            const fast = !shooter && !heavy && r() < 0.3;
            for (let i = 0; i < 12; i++) {
                const ang = r() * TAU, d = 650 + r() * 250;
                const x = clamp(this.me.x + Math.cos(ang) * d, 80, this.W - 80), y = clamp(this.me.y + Math.sin(ang) * d, 80, this.H - 80);
                if (this.walls.some(w => overlap({ x: x - 20, y: y - 20, w: 40, h: 40 }, w))) continue;
                this.drones.push({ x, y, r: heavy ? 24 : fast ? 12 : 16, hp: shooter ? 60 : heavy ? 120 : fast ? 22 : 30, max: shooter ? 60 : heavy ? 120 : fast ? 22 : 30, heavy, shooter, fast, fire: 1 + r() * 1.5, vx: 0, vy: 0, hit: 0, ph: r() * 6 });
                return;
            }
        }

        cameraZoom(w = this.s.vw || 1280, h = this.s.vh || 720) {
            const range = this.weaponRange();
            return A.util.sceneZoom(this.s, w, h, 780) * range;
        }

        weaponRange() { return { shotgun: 1.12, rapid: 1, blaster: 1, rail: .78 }[this.weapon] || 1; }

        weaponInfo(type = this.weapon) {
            return {
                blaster: { name: 'Blaster', cd: 0.16, speed: 950, dmg: 25, life: 0.9, color: '#67e8f9', pellets: 1, cost: 1 },
                shotgun: { name: 'Scattergun', cd: 0.55, speed: 820, dmg: 16, life: 0.48, color: '#fbbf24', pellets: 5, cost: 3 },
                rapid: { name: 'Rapid pulse', cd: 0.065, speed: 1050, dmg: 16, life: 0.85, color: '#a78bfa', pellets: 1, cost: 1 },
                rail: { name: 'Rail sniper', cd: 0.75, speed: 1900, dmg: 85, life: 0.85, color: '#f472b6', pellets: 1, cost: 4 }
            }[type] || this.weaponInfo('blaster');
        }

        fire(angle, speed, own, by, dmg, color, life = 0.9) {
            this.bullets.push({ x: this.me.x + Math.cos(angle) * 24, y: this.me.y + Math.sin(angle) * 24, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, own, by, dmg, color });
        }

        showDamage(x, y, amount, color = '#fde68a') {
            this.damageTexts.push({ x, y, amount: Math.round(amount), color, t: 0.7 });
            if (this.damageTexts.length > 40) this.damageTexts.shift();
            this.hitmark = 0.16; this.shake = Math.max(this.shake, 0.09);
        }

        registerKill() {
            this.streak = this.streakT > 0 ? this.streak + 1 : 1; this.streakT = 5;
            if (this.streak === 3 || this.streak === 5 || this.streak % 10 === 0) this.s.toast(`${this.streak} KILL STREAK!`, '#fbbf24');
        }

        update(dt) {
            const s = this.s, me = this.me;
            this.anim += dt; this.shake = Math.max(0, this.shake - dt); this.hitmark = Math.max(0, this.hitmark - dt); this.flash = Math.max(0, this.flash - dt);
            this.overdrive = Math.max(0, this.overdrive - dt); this.jam = Math.max(0, this.jam - dt);
            this.weaponT = Math.max(0, this.weaponT - dt); if (!this.weaponT) this.weapon = 'blaster';
            this.streakT = Math.max(0, this.streakT - dt);
            for (const n of this.damageTexts) { n.t -= dt; n.y -= 38 * dt; }
            compactAlive(this.damageTexts, 't');
            for (const p of this.pickups) p.t = Math.max(0, p.t - dt);
            for (const p of this.packs) p.t = (p.t ?? 18) - dt;
            compactAlive(this.packs, 't');
            const wave = 1 + Math.floor(s.t / 35);
            if (wave !== this.wave) { this.wave = wave; if (!this.multiplayer) s.toast(`WAVE ${wave} · reinforcements incoming`, '#a78bfa'); }
            this.invuln = Math.max(0, this.invuln - dt); this.fireCd -= dt; this.dashCd -= dt; this.novaCd -= dt; this.nova = Math.max(0, this.nova - dt);
            const zoom = this.zoom || 1;
            const mx = this.cam.x + (s.mouse.x - s.vw / 2) / zoom, my = this.cam.y + (s.mouse.y - s.vh / 2) / zoom;
            this.mouseWorld = { x: mx, y: my };

            if (this.dead > 0) {
                this.dead -= dt;
                if (this.dead <= 0) { this.respawnAt(); this.hp = 100; this.invuln = 2; this.drones = this.drones.filter(d => dist(d.x, d.y, me.x, me.y) > 500); }
            } else {
                if (!s.overlay.classList.contains('has-touch') || s.mouse.down || s.mouse.pressed) me.aim = Math.atan2(my - me.y, mx - me.x);
                const a = s.axis();
                const len = Math.hypot(a.x, a.y) || 1;
                const speed = this.dashT > 0 ? 760 : 270;
                const tx = this.dashT > 0 ? this.dx * speed : (a.x / len) * speed * (a.x || a.y ? 1 : 0);
                const ty = this.dashT > 0 ? this.dy * speed : (a.y / len) * speed * (a.x || a.y ? 1 : 0);
                const acc = 2600 * dt;
                me.vx += clamp(tx - me.vx, -acc, acc); me.vy += clamp(ty - me.vy, -acc, acc);
                if (a.x || a.y) { this.dx = a.x / len; this.dy = a.y / len; }
                if (s.pressed('ShiftLeft', 'ShiftRight') && this.dashCd <= 0) { this.dashT = 0.16; this.dashCd = 1.1; this.invuln = Math.max(this.invuln, 0.2); this.particles.burst(me.x, me.y, '#7dd3fc', 12, 200, 0.3, 4); }
                if (s.pressed('Space', 'KeyE') && this.novaCd <= 0 && s.spend(30)) {
                    this.novaCd = 7; this.nova = 0.45;                     this.shake = 0.25; s.sfx('boom'); this.particles.burst(me.x, me.y, '#67e8f9', 40, 520, 0.5, 5);
                    for (const d of this.drones) if (dist(d.x, d.y, me.x, me.y) < 280) { d.hp -= 60; d.hit = 0.2; this.showDamage(d.x, d.y - d.r, 60); const a = Math.atan2(d.y - me.y, d.x - me.x); d.vx = Math.cos(a) * 500; d.vy = Math.sin(a) * 500; if (d.hp <= 0) this.killDrone(d); }
                    this.bullets = this.bullets.filter(b => b.own || dist(b.x, b.y, me.x, me.y) > 280);
                }
                this.dashT = Math.max(0, this.dashT - dt);
                me.x += me.vx * dt; me.y += me.vy * dt;
                for (const w of this.walls) pushCircleOutOfRect(me, w);
                const weapon = this.weaponInfo();
                const cd = this.overdrive > 0 ? weapon.cd * 0.55 : weapon.cd;
                if ((s.mouse.down || s.down('KeyF')) && this.fireCd <= 0 && this.jam <= 0 && s.spend(weapon.cost)) {
                    this.fireCd = cd; s.sfx('shoot', 40);
                    for (let i = 0; i < weapon.pellets; i++) {
                        const spread = weapon.pellets > 1 ? (i - 2) * 0.12 : (Math.random() - 0.5) * (this.weapon === 'rail' ? 0 : 0.04);
                        const angle = me.aim + spread;
                        this.fire(angle, weapon.speed, true, s.user.id, weapon.dmg, weapon.color, weapon.life);
                        s.emit({ k: 'sh', x: Math.round(me.x + Math.cos(angle) * 24), y: Math.round(me.y + Math.sin(angle) * 24), a: +angle.toFixed(3), by: s.user.id, w: this.weapon, v: weapon.speed, dmg: weapon.dmg, life: weapon.life });
                    }
                    me.vx -= Math.cos(me.aim) * 25; me.vy -= Math.sin(me.aim) * 25;
                    this.shake = Math.max(this.shake, this.weapon === 'rail' ? 0.12 : 0.05); this.muzzle = 0.07;
                }
                for (const p of this.pickups) {
                    if (p.t > 0 || dist(me.x, me.y, p.x, p.y) > 34 || (p.type === 'health' && this.hp >= this.maxHp)) continue;
                    if (p.type === 'health') { this.hp = Math.min(this.maxHp, this.hp + 35); s.toast('Repair +35 HP', '#4ade80'); }
                    else { this.weapon = p.type; this.weaponT = 14; s.toast(`${this.weaponInfo().name} · 14 seconds`, this.weaponInfo().color); }
                    p.t = 40; s.sfx('coin'); this.particles.burst(p.x, p.y, p.type === 'health' ? '#4ade80' : this.weaponInfo().color, 12, 160, 0.4, 4);
                }
                for (const o of this.orbs) {
                    o.t = Math.max(0, o.t - dt);
                    if (o.t <= 0 && dist(me.x, me.y, o.x, o.y) < 34) {
                        const opened = s.ask(correct => {
                            if (correct) { this.overdrive = 12; this.hp = Math.min(this.maxHp, this.hp + 40); s.refill(); s.addScore(30); s.toast('Overdrive! Rapid fire + repair', '#67e8f9'); }
                            else if (correct === false) { this.jam = 2; s.toast('Blaster jammed!', '#f87171'); }
                        });
                        if (opened) o.t = 1;
                    }
                }
                for (const p of this.packs) if (dist(me.x, me.y, p.x, p.y) < 30) { this.hp = Math.min(this.maxHp, this.hp + 25); p.gone = true; this.particles.burst(p.x, p.y, '#4ade80', 10, 120, 0.4, 4); }
                this.packs = this.packs.filter(p => !p.gone);
            }
            this.muzzle = Math.max(0, (this.muzzle || 0) - dt);

            // drones
            if (this.dead <= 0 && !this.multiplayer) {
                this.spawnT -= dt;
                const cap = 4;
                if (this.spawnT <= 0 && this.drones.length < cap) { this.spawnDrone(); this.spawnT = Math.max(1.8, 3.6 - s.t / 300); }
            }
            const targets = this.dead > 0 ? null : me;
            for (const d of this.drones) {
                d.hit = Math.max(0, d.hit - dt);
                if (!targets) { d.vx *= 0.95; d.vy *= 0.95; }
                else {
                    const dx = me.x - d.x, dy = me.y - d.y, dd = Math.hypot(dx, dy) || 1;
                    let wantX = dx / dd, wantY = dy / dd, sp = d.shooter ? 130 : d.heavy ? 95 : d.fast ? 260 + Math.min(40, s.t * 0.2) : 150 + Math.min(70, s.t * 0.4);
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
                const steps = Math.max(2, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 10));
                for (let i = 0; i < steps && b.life > 0; i++) {
                    b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
                    if (this.walls.some(w => b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h)) { b.life = 0; this.particles.burst(b.x, b.y, '#94a3b8', 4, 80, 0.2, 3); break; }
                    if (this.hitBot?.(b)) break;
                    if (b.own) {
                        for (const d of this.drones) {
                            if (d.hp > 0 && dist(b.x, b.y, d.x, d.y) < d.r + 4) {
                                d.hp -= b.dmg; d.hit = 0.1; b.life = 0; this.showDamage(d.x, d.y - d.r, b.dmg);
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
            compactAlive(this.bullets, 'life');
            compactAlive(this.drones, 'hp');

            if (this.zoomWeapon !== this.weapon) { this.zoomWeapon = this.weapon; this.weaponNotice = 2.5; }
            this.weaponNotice = Math.max(0, this.weaponNotice - dt);
            this.weaponZoom = lerp(this.weaponZoom, this.weaponRange(), 1 - Math.exp(-dt * 5));
            this.zoom = this.cameraZoom(s.vw, s.vh) * this.weaponZoom / this.weaponRange();
            const halfW = s.vw / this.zoom / 2, halfH = s.vh / this.zoom / 2;
            const touch = s.overlay.classList.contains('has-touch');
            const inside = s.mouse.x >= 0 && s.mouse.x <= s.vw && s.mouse.y >= 0 && s.mouse.y <= s.vh;
            const look = !s.preview && s.mouse.active && inside && s.mouse.pointerType !== 'touch' && (!touch || s.mouse.pointerType === 'mouse') ? (this.weapon === 'rail' ? .68 : .58) : 0;
            const fitsX = halfW * 2 >= this.W, fitsY = halfH * 2 >= this.H;
            const edge = 110;
            const tx = fitsX ? this.W / 2 : clamp(me.x + clamp((s.mouse.x - s.vw / 2) / this.zoom * look, -halfW * .52, halfW * .52), halfW - edge, this.W - halfW + edge);
            const ty = fitsY ? this.H / 2 : clamp(me.y + clamp((s.mouse.y - s.vh / 2) / this.zoom * look, -halfH * .52, halfH * .52), halfH - edge, this.H - halfH + edge);
            const follow = 1 - Math.exp(-dt * 9);
            this.cam.x = fitsX ? tx : clamp(lerp(this.cam.x, tx, follow), halfW - edge, this.W - halfW + edge);
            this.cam.y = fitsY ? ty : clamp(lerp(this.cam.y, ty, follow), halfH - edge, this.H - halfH + edge);
            s.setGoal(this.kills + this.pk * 3);
            this.particles.update(dt, 0);
        }

        killDrone(d) {
            this.kills++; this.registerKill();
            this.s.addScore(d.heavy ? 30 : d.shooter ? 15 : 10); this.s.sfx('pop', 50);
            this.particles.burst(d.x, d.y, d.shooter ? '#f97316' : '#a78bfa', 16, 260, 0.5, 5);
            if (Math.random() < (d.heavy ? 0.6 : 0.14)) this.packs.push({ x: d.x, y: d.y });
        }

        damage(amount, by, drone) {
            if (this.overdrive > 0) amount *= 0.5;
            this.hp -= amount; this.flash = 0.2; this.shake = 0.2; this.s.sfx('hit', 80);
            this.particles.burst(this.me.x, this.me.y, '#f87171', 8, 160, 0.3, 4);
            if (drone) { this.invuln = 0.5; const a = Math.atan2(this.me.y - drone.y, this.me.x - drone.x); this.me.vx += Math.cos(a) * 320; this.me.vy += Math.sin(a) * 320; drone.vx = -Math.cos(a) * 200; drone.vy = -Math.sin(a) * 200; }
            if (by) this.s.emit({ k: 'hit', by, dmg: Math.round(amount) });
            if (this.hp <= 0) {
                this.dead = 2; this.deaths++; this.streak = 0; this.streakT = 0; this.weaponT = 0; this.weapon = 'blaster';
                this.particles.burst(this.me.x, this.me.y, this.s.local.color, 30, 380, 0.8, 6);
                this.s.emit({ k: 'ko', by: by || null, to: this.s.user.id });
            }
        }

        onEvent(ev, from) {
            const s = this.s;
            if (ev.k === 'sh') {
                const weapon = this.weaponInfo(ev.w || 'blaster');
                const speed = Number.isFinite(ev.v) ? clamp(ev.v, 300, 1900) : 950;
                const dmg = Number.isFinite(ev.dmg) ? clamp(ev.dmg, 1, 85) : 20;
                const life = Number.isFinite(ev.life) ? clamp(ev.life, 0.1, 1.2) : 0.9;
                this.bullets.push({ x: ev.x, y: ev.y, vx: Math.cos(ev.a) * speed, vy: Math.sin(ev.a) * speed, life, own: false, by: ev.by, dmg, color: ev.w ? weapon.color : from.color });
                from.muzzle = performance.now();
            } else if (ev.k === 'hit' && ev.by === s.user.id) { s.addScore(4); this.showDamage(from.x, from.y - 25, Number.isFinite(ev.dmg) ? ev.dmg : 20); }
            else if (ev.k === 'ko' && ev.by === s.user.id) { this.pk++; this.registerKill(); s.addScore(100); s.toast(`You eliminated ${from.name}!`, '#facc15'); }
        }

        net() {
            const m = this.me;
            return { x: Math.round(m.x), y: Math.round(m.y), vx: Math.round(m.vx), vy: Math.round(m.vy), f: +m.aim.toFixed(2), a: this.dead > 0 ? 1 : 0, hp: Math.round(this.hp), ex: { o: this.overdrive > 0 ? 1 : 0, w: this.weapon } };
        }

        goalText() { return `${this.multiplayer ? `${this.pk} player KOs` : `${this.kills} drones · ${this.pk} players`} · HP ${Math.max(0, Math.round(this.hp))}`; }
        touchLayout() { return { stick: true, buttons: [{ k: 'ShiftLeft', label: 'Dash' }, { k: 'Space', label: 'Blast', cls: 'e' }] }; }
        hint() { return 'WASD move · hold F / click / canvas touch to fire · mouse aims and looks ahead · Shift dash · Space / E shockwave · colored pickups = timed weapons / repairs · Q reload'; }

        drawShip(ctx, x, y, aim, who, hp, name, you, alpha = 1, over = false) {
            const color = who.color;
            ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
            if (over) { ctx.strokeStyle = 'rgba(103,232,249,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.stroke(); }
            ctx.save(); ctx.rotate(aim);
            const type = you ? this.weapon : who.ex?.w || 'blaster', info = this.weaponInfo(type);
            const length = type === 'rail' ? 38 : type === 'shotgun' ? 23 : 28, thick = type === 'shotgun' ? 13 : type === 'rapid' ? 10 : 7;
            ctx.fillStyle = '#334155'; ctx.fillRect(8, -thick / 2, length, thick);
            ctx.fillStyle = info.color; ctx.fillRect(12, -thick / 2, length - 4, 3);
            ctx.fillRect(8 + length - 4, -thick / 2 - 2, 6, thick + 4);
            if (type === 'rail') ctx.fillRect(16, -8, 12, 4);
            if (type === 'shotgun') { ctx.fillStyle = '#0f172a'; ctx.fillRect(12, -1, length, 2); }
            ctx.restore();
            ctx.restore();
            A.util.drawFigureTop(ctx, who, x, y, 16, aim, this.anim || 0, alpha);
            if (!this.s.preview && hp !== undefined) {
                ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 22, y + 24, 44, 5);
                ctx.fillStyle = hp > 40 ? '#4ade80' : '#f87171'; ctx.fillRect(x - 22, y + 24, 44 * clamp(hp / 100, 0, 1), 5);
            }
            if (!this.s.preview) nameTag(ctx, you ? 'You' : name, x, y - 28, you ? '#fff' : color);
        }

        draw(ctx, w, h) {
            const s = this.s, me = this.me;
            const zoom = this.zoom = this.cameraZoom(w, h) * (this.s.preview ? 1 : this.weaponZoom / this.weaponRange());
            ctx.fillStyle = '#070b17'; ctx.fillRect(0, 0, w, h);
            ctx.save();
            const sh = this.shake > 0 ? 7 : 0;
            ctx.translate(w / 2 + (Math.random() - 0.5) * sh, h / 2 + (Math.random() - 0.5) * sh);
            ctx.scale(zoom, zoom);
            ctx.translate(-this.cam.x, -this.cam.y);
            const x0 = this.cam.x - w / zoom / 2, y0 = this.cam.y - h / zoom / 2;
            const x1 = x0 + w / zoom, y1 = y0 + h / zoom;
            const visible = (x, y, pad = 70) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
            if (!this.floorPattern && ctx.createPattern && !s.preview) {
                const tile = document.createElement('canvas');
                tile.width = tile.height = 160;
                const paint = tile.getContext('2d');
                paint.fillStyle = '#0d1428'; paint.fillRect(0, 0, 160, 160);
                for (let y = 0; y < 160; y += 80) for (let x = 0; x < 160; x += 80) {
                    paint.fillStyle = (x + y) % 160 ? '#111c31' : '#0e182b';
                    paint.fillRect(x + 2, y + 2, 76, 76);
                    paint.fillStyle = 'rgba(148,163,184,.08)'; paint.fillRect(x + 9, y + 11, 20, 2); paint.fillRect(x + 67, y + 67, 3, 3);
                    paint.strokeStyle = 'rgba(99,102,241,.14)';
                    paint.strokeRect(x, y, 80, 80);
                }
                this.floorPattern = ctx.createPattern(tile, 'repeat');
            }
            ctx.fillStyle = this.floorPattern || '#0e182b'; ctx.fillRect(0, 0, this.W, this.H);
            for (const wl of this.walls) {
                if (wl.x > x0 + w / zoom + 50 || wl.x + wl.w < x0 - 50 || wl.y > y0 + h / zoom + 50 || wl.y + wl.h < y0 - 50) continue;
                ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(wl.x + 10, wl.y + 13, wl.w, wl.h);
                ctx.fillStyle = '#1e293b'; ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
                ctx.fillStyle = '#34445f'; ctx.fillRect(wl.x, wl.y, wl.w, 8);
                ctx.fillStyle = '#101a2c'; ctx.fillRect(wl.x, wl.y + wl.h - 9, wl.w, 9);
                ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2; ctx.strokeRect(wl.x + 1.5, wl.y + 1.5, wl.w - 3, wl.h - 3);
                ctx.fillStyle = '#fbbf24';
                for (let i = 12; i < wl.w - 8; i += 36) ctx.fillRect(wl.x + i, wl.y + wl.h - 7, 12, 3);
                if (wl.h > 60 && wl.w > 30) {
                    ctx.strokeStyle = 'rgba(148,163,184,.25)'; ctx.lineWidth = 1;
                    for (let y = 20; y < wl.h - 15; y += 30) {
                        ctx.beginPath(); ctx.moveTo(wl.x + 6, wl.y + y); ctx.lineTo(wl.x + wl.w - 6, wl.y + y); ctx.stroke();
                    }
                    ctx.fillStyle = '#38bdf8'; ctx.fillRect(wl.x + 8, wl.y + 14, 4, 8);
                }
            }
            for (const o of this.orbs) {
                if (o.t > 0 || !visible(o.x, o.y)) continue;
                const pulse = 1 + Math.sin(this.anim * 4) * 0.12;
                ctx.shadowColor = '#facc15'; ctx.shadowBlur = s.graphics?.low ? 0 : 22;
                ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(o.x, o.y, 20 * pulse, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
                ctx.fillStyle = '#78350f'; ctx.font = '900 22px system-ui'; ctx.textAlign = 'center'; if (!s.preview) ctx.fillText('?', o.x, o.y + 8);
            }
            for (const p of this.pickups) {
                if (p.t > 0 || !visible(p.x, p.y)) continue;
                const info = this.weaponInfo(p.type), color = p.type === 'health' ? '#4ade80' : info.color;
                const bob = Math.sin(this.anim * 3 + p.x) * 3;
                ctx.save(); ctx.translate(p.x, p.y + bob);
                ctx.fillStyle = '#101a2c'; ctx.strokeStyle = color; ctx.lineWidth = 3;
                roundRect(ctx, -19, -19, 38, 38, 8); ctx.fill(); ctx.stroke();
                ctx.fillStyle = color; ctx.font = '900 16px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(p.type === 'health' ? '+' : p.type === 'shotgun' ? 'S' : p.type === 'rapid' ? 'R' : '⚡', 0, 6);
                ctx.font = '700 11px system-ui'; if (!s.preview) ctx.fillText(p.type === 'health' ? 'REPAIR' : info.name.toUpperCase(), 0, -28); ctx.restore();
            }
            for (const p of this.packs) {
                if (!visible(p.x, p.y)) continue;
                ctx.fillStyle = '#123528'; roundRect(ctx, p.x - 15, p.y - 15, 30, 30, 6); ctx.fill();
                ctx.fillStyle = '#4ade80'; ctx.fillRect(p.x - 10, p.y - 3, 20, 6); ctx.fillRect(p.x - 3, p.y - 10, 6, 20);
            }
            for (const d of this.drones) {
                if (!visible(d.x, d.y, d.r + 30)) continue;
                ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(this.anim * 2 + d.ph);
                ctx.fillStyle = d.hit > 0 ? '#fff' : d.shooter ? '#f97316' : d.heavy ? '#ef4444' : d.fast ? '#2dd4bf' : '#8b5cf6';
                ctx.beginPath();
                for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.lineTo(Math.cos(a) * d.r, Math.sin(a) * d.r); }
                ctx.fill();
                ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
                ctx.fillStyle = d.shooter ? '#fde68a' : '#ddd6fe'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
                if (d.heavy) { ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 3; ctx.strokeRect(-18, -18, 36, 36); }
                if (d.shooter) { ctx.fillStyle = '#fdba74'; ctx.fillRect(6, -4, 20, 8); }
                ctx.restore();
                if (!s.preview && d.hp < d.max) {
                    ctx.fillStyle = '#111827'; ctx.fillRect(d.x - 18, d.y - d.r - 10, 36, 4);
                    ctx.fillStyle = '#f87171'; ctx.fillRect(d.x - 18, d.y - d.r - 10, 36 * Math.max(0, d.hp / d.max), 4);
                }
            }
            for (const b of this.bullets) {
                if (!visible(b.x, b.y, 100)) continue;
                ctx.strokeStyle = b.color; ctx.lineWidth = b.enemy ? 5 : 4; ctx.lineCap = 'round';
                ctx.globalAlpha = 0.9;
                ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025); ctx.lineTo(b.x, b.y); ctx.stroke();
                ctx.globalAlpha = 1;
            }
            for (const r of s.remoteList()) {
                if (r.a === 1 || !visible(r.x, r.y)) continue;
                this.drawShip(ctx, r.x, r.y, r.f || 0, r, r.hp, r.name, false, 0.95, r.ex?.o);
                if (r.muzzle && performance.now() - r.muzzle < 70) {
                    ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(r.x + Math.cos(r.f || 0) * 34, r.y + Math.sin(r.f || 0) * 34, 8, 0, TAU); ctx.fill();
                }
            }
            if (this.dead <= 0) {
                const alpha = this.invuln > 0 ? 0.55 + Math.sin(this.anim * 24) * 0.3 : 1;
                this.drawShip(ctx, me.x, me.y, me.aim, s.local, this.hp, 'You', true, alpha, this.overdrive > 0);
                if (this.muzzle > 0) { ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(me.x + Math.cos(me.aim) * 34, me.y + Math.sin(me.aim) * 34, 9, 0, TAU); ctx.fill(); }
                ctx.strokeStyle = 'rgba(103,232,249,.22)'; ctx.setLineDash([8, 10]); ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(me.x + Math.cos(me.aim) * 30, me.y + Math.sin(me.aim) * 30); ctx.lineTo(me.x + Math.cos(me.aim) * 330, me.y + Math.sin(me.aim) * 330); ctx.stroke(); ctx.setLineDash([]);
            }
            this.particles.draw(ctx);
            for (const n of s.preview ? [] : this.damageTexts) {
                if (!visible(n.x, n.y)) continue;
                ctx.globalAlpha = Math.min(1, n.t * 3); ctx.fillStyle = n.color; ctx.font = '900 20px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(n.amount, n.x, n.y); ctx.globalAlpha = 1;
            }
            ctx.restore();
            if (s.preview) return;
            s.placeHud(ctx, 14, 142, 270, 58, 'top-left');
            ctx.fillStyle = 'rgba(8,12,24,.8)'; roundRect(ctx, 14, 142, 270, 58, 9); ctx.fill();
            ctx.textAlign = 'left'; ctx.font = '800 14px system-ui'; ctx.fillStyle = '#e2e8f0';
            ctx.fillText(`${this.multiplayer ? `${this.pk} player KOs · PvP` : `WAVE ${this.wave} · ${this.drones.length} drones`}${this.streakT > 0 && this.streak > 1 ? ` · ${this.streak} streak` : ''}`, 25, 163, 248);
            const weapon = this.weaponInfo(); ctx.fillStyle = weapon.color;
            ctx.fillText(`${weapon.name}${this.weaponT > 0 ? ` · ${Math.ceil(this.weaponT)}s` : ''} · HP ${Math.max(0, Math.round(this.hp))}`, 25, 185, 248); ctx.restore();
            if (this.weaponNotice > 0) {
                s.placeHud(ctx, 0, 0, 280, 48, 'top-right');
                ctx.fillStyle = '#111827'; roundRect(ctx, 0, 0, 280, 48, 8); ctx.fill();
                ctx.fillStyle = weapon.color; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(`${weapon.name.toUpperCase()} EQUIPPED`, 140, 19);
                ctx.font = '600 12px system-ui';
                ctx.fillText(this.weapon === 'rail' ? 'Long-range scope: view widening' : this.weapon === 'shotgun' ? 'Close-range spread: view tightening' : 'Standard weapon field of view', 140, 37);
                ctx.restore();
            }
            if (this.flash > 0) { ctx.fillStyle = `rgba(239,68,68,${this.flash * 1.4})`; ctx.fillRect(0, 0, w, h); }
            if (this.dead > 0) { ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.font = '800 36px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`Respawning in ${Math.ceil(this.dead)}…`, w / 2, h / 2); }
            else {
                const enemy = s.remoteList().filter(player => player.a !== 1)
                    .sort((a, b) => dist(a.x, a.y, me.x, me.y) - dist(b.x, b.y, me.x, me.y))[0];
                if (enemy) {
                    const sx = w / 2 + (enemy.x - this.cam.x) * zoom, sy = h / 2 + (enemy.y - this.cam.y) * zoom;
                    if (sx < 35 || sx > w - 35 || sy < 80 || sy > h - 90) {
                        const dx = sx - w / 2, dy = sy - h / 2;
                        const ratio = Math.min((w / 2 - 35) / Math.max(1, Math.abs(dx)), (h / 2 - 90) / Math.max(1, Math.abs(dy)));
                        const x = w / 2 + dx * ratio, y = h / 2 + dy * ratio;
                        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
                        ctx.fillStyle = enemy.color || '#fb7185';
                        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.restore();
                        ctx.fillStyle = '#f8fafc'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center';
                        ctx.fillText(`${Math.round(dist(enemy.x, enemy.y, me.x, me.y) / 40)}m`, x, y + 22);
                    }
                }
                const cx = s.mouse.x, cy = s.mouse.y, gap = this.hitmark > 0 ? 14 : 10;
                ctx.strokeStyle = this.hitmark > 0 ? '#facc15' : '#e0f2fe'; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(cx, cy, 11, 0, TAU);
                ctx.moveTo(cx - gap - 8, cy); ctx.lineTo(cx - gap, cy); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + 8, cy);
                ctx.moveTo(cx, cy - gap - 8); ctx.lineTo(cx, cy - gap); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + 8); ctx.stroke();
            }
            // minimap
            const touch = s.overlay.classList.contains('has-touch');
            const mw = touch ? 106 : 170, mh = mw * this.H / this.W, mx = 0, my = 0;
            s.placeHud(ctx, 0, 0, mw, mh, 'bottom-right');
            ctx.beginPath(); ctx.rect(0, 0, mw, mh); ctx.clip();
            ctx.fillStyle = 'rgba(8,12,24,.7)'; ctx.fillRect(mx, my, mw, mh);
            ctx.fillStyle = '#334155';
            for (const wl of this.cover) ctx.fillRect(mx + wl.x / this.W * mw, my + wl.y / this.H * mh, Math.max(2, wl.w / this.W * mw), Math.max(2, wl.h / this.H * mh));
            ctx.fillStyle = '#a78bfa'; for (const d of this.drones) ctx.fillRect(mx + d.x / this.W * mw - 1, my + d.y / this.H * mh - 1, 2, 2);
            for (const r of s.remoteList()) { ctx.fillStyle = r.color; ctx.fillRect(mx + r.x / this.W * mw - 2, my + r.y / this.H * mh - 2, 4, 4); }
            for (const p of this.pickups) if (p.t <= 0) { ctx.fillStyle = p.type === 'health' ? '#4ade80' : this.weaponInfo(p.type).color; ctx.fillRect(mx + p.x / this.W * mw - 2, my + p.y / this.H * mh - 2, 4, 4); }
            ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
            ctx.strokeRect(mx + (this.cam.x - w / zoom / 2) / this.W * mw, my + (this.cam.y - h / zoom / 2) / this.H * mh, w / zoom / this.W * mw, h / zoom / this.H * mh);
            ctx.fillStyle = '#fff'; ctx.fillRect(mx + me.x / this.W * mw - 3, my + me.y / this.H * mh - 3, 6, 6); ctx.restore();
        }
    }

    Object.assign(A.games, { skyline: Skyline, duel: Duel, shooter: Shooter });
})(window);
