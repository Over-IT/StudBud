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
                const bx = i * size - camX * f;
                ctx.fillRect(bx, h - bh, bw, bh);
                ctx.fillStyle = 'rgba(250,204,21,.28)';
                for (let wy = h - bh + 14; wy < h - 20; wy += 26) {
                    for (let wx = bx + 10; wx < bx + bw - 12; wx += 22) if ((hashStr(`${wx | 0}:${wy | 0}:${layer}`) & 7) < 2) ctx.fillRect(wx, wy, 8, 11);
                }
                ctx.fillStyle = color;
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Rooftop Rumble: side-scrolling parkour race                         */
    /* ------------------------------------------------------------------ */
    class Skyline extends A.BaseGame {
        constructor(s) {
            super(s);
            this.title = 'Rooftop Rumble';
            this.race = true;
            this.LENGTH = 11000;
            this.build();
            const c = this.checkpoints[0];
            this.me = { x: c.x, y: c.y - 44, w: 26, h: 44, vx: 0, vy: 0, face: 1 };
            this.cp = c;
            this.cam = { x: 0, y: 0 };
            this.coyote = 0; this.buffer = 0; this.airJumps = 1; this.dash = 0; this.dashCd = 0;
            this.boost = 0; this.slow = 0; this.dead = 0; this.maxX = 0; this.bonus = 0; this.deaths = 0;
            this.res = new A.Resource('Energy', '#facc15', 100, 50, 2);
            this.anim = 0; this.finished = false; this.state = 0; this.carry = null;
        }

        build() {
            const r = mulberry32(this.s.seed);
            const solids = this.solids = [];
            this.spikes = []; this.saws = []; this.lasers = []; this.springs = []; this.boxes = []; this.checkpoints = [];
            this.movers = []; this.crumbles = [];
            let x = 700, y = 520;
            solids.push({ x: -300, y, w: 1000, h: 600, roof: true });
            this.checkpoints.push({ x: 80, y, id: 0 });
            let sinceCp = 0;
            while (x < this.LENGTH) {
                const kind = Math.floor(r() * 9);
                let w, g;
                const place = (gap, width, dy) => {
                    const ny = clamp(y + dy, 280, 600);
                    const p = { x: x + gap, y: ny, w: width, h: 700, roof: true };
                    solids.push(p);
                    x = p.x + p.w; y = ny;
                    return p;
                };
                if (kind === 0 || kind === 8) {
                    g = 100 + r() * 120; w = 300 + r() * 320;
                    const p = place(g, w, (r() - 0.6) * 170);
                    if (r() < 0.6) this.spikes.push({ x: p.x + p.w * (0.3 + r() * 0.3), y: p.y - 20, w: 60, h: 20 });
                    if (r() < 0.5) this.boxes.push({ x: p.x + p.w * 0.5, y: p.y - 125, t: 0 });
                } else if (kind === 1) {
                    for (let i = 0; i < 4; i++) place(i ? 70 : 110, 130, -55);
                    solids[solids.length - 1].w = 260;
                    x = solids[solids.length - 1].x + 260;
                    this.boxes.push({ x: solids[solids.length - 2].x + 65, y: solids[solids.length - 2].y - 120, t: 0 });
                } else if (kind === 2) {
                    const gapW = 380;
                    const mover = { x: x + 40, y: y + 10, w: 120, h: 20, bx: x + 40, by: y + 10, amp: 110, speed: 1 + r() * 0.8, phase: r() * 6, dx: 0, dy: 0, mover: true };
                    solids.push(mover); this.movers.push(mover);
                    place(gapW, 340, (r() - 0.5) * 80);
                } else if (kind === 3) {
                    for (let i = 0; i < 4; i++) {
                        const t = { x: x + 100, y: y - (i % 2) * 30, w: 105, h: 22, crumble: true, timer: 0, gone: 0 };
                        solids.push(t); this.crumbles.push(t);
                        x += 100 + 105; y = t.y;
                    }
                    x -= 0; place(90, 360, 0);
                } else if (kind === 4) {
                    const p = place(110 + r() * 60, 600, 0);
                    for (let i = 0; i < 2; i++) this.saws.push({ cx: p.x + 190 + i * 210, cy: p.y - 70, amp: 55, speed: 2 + r(), phase: r() * 6, r: 22, x: 0, y: 0 });
                } else if (kind === 5) {
                    const p = place(120, 520, 0);
                    for (let i = 0; i < 2; i++) this.lasers.push({ x: p.x + 170 + i * 190, y: p.y - 210, w: 10, h: 210, period: 2.6, phase: r() * 2.6 });
                    this.boxes.push({ x: p.x + p.w - 70, y: p.y - 120, t: 0 });
                } else if (kind === 6 && y > 400) {
                    const p = place(120, 300, 0);
                    this.springs.push({ x: p.x + p.w - 70, y: p.y - 16, w: 46, h: 16 });
                    place(150, 340, -230 + 40 * r());
                } else if (kind === 7) {
                    const gapW = 380;
                    for (let i = 0; i < 3; i++) {
                        solids.push({ x: x + 40 + i * 110, y: y - 20 - (i % 2) * 90, w: 90, h: 14, oneway: true, thin: true });
                    }
                    place(gapW, 320, (r() - 0.5) * 90);
                    this.boxes.push({ x: x - 160, y: y - 150, t: 0 });
                } else {
                    const p = place(120 + r() * 100, 360, 120);
                    this.spikes.push({ x: p.x + 130, y: p.y - 20, w: 50, h: 20 });
                }
                sinceCp += 1;
                if (sinceCp >= 4) {
                    const last = solids.filter(p => p.roof).pop();
                    if (last && last.w >= 300) { this.checkpoints.push({ x: last.x + 60, y: last.y, id: this.checkpoints.length }); sinceCp = 0; }
                }
            }
            const fin = { x: x + 120, y, w: 900, h: 700, roof: true };
            solids.push(fin);
            this.finishX = fin.x + 200;
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
            this.anim += dt;
            this.shake = Math.max(0, (this.shake || 0) - dt);
            const clock = (Date.now() - s.startedAt) / 1000;
            this.clock = clock;

            for (const m of this.movers) {
                const nx = m.bx + Math.sin(clock * m.speed + m.phase) * m.amp;
                m.dx = nx - m.x; m.dy = 0; m.x = nx;
            }
            for (const c of this.crumbles) {
                if (c.gone > 0) { c.gone -= dt; if (c.gone <= 0) { c.off = false; c.timer = 0; } continue; }
                if (c.timer > 0) { c.timer -= dt; if (c.timer <= 0) { c.off = true; c.gone = 3; } }
            }
            for (const w of this.saws) { w.x = w.cx; w.y = w.cy + Math.sin(clock * w.speed + w.phase) * w.amp; }
            for (const b of this.boxes) if (b.t > 0) b.t -= dt;

            if (this.dead > 0) {
                this.dead -= dt;
                if (this.dead <= 0) {
                    me.x = this.cp.x; me.y = this.cp.y - me.h - 2; me.vx = 0; me.vy = 0; this.dash = 0;
                }
                this.state = 4;
                this.particles.update(dt, 600);
                return;
            }

            if (this.finished) { me.vx *= 0.9; }
            const ax = this.finished ? 0 : s.axis().x;
            const speedMul = this.boost > 0 ? 1.3 : this.slow > 0 ? 0.6 : 1;
            this.boost = Math.max(0, this.boost - dt);
            this.slow = Math.max(0, this.slow - dt);
            this.dashCd -= dt;
            const prevGround = me.ground;
            if (prevGround && (prevGround.dx || prevGround.dy)) { me.x += prevGround.dx || 0; me.y += prevGround.dy || 0; }

            if (this.dash > 0) {
                this.dash -= dt;
                me.vx = me.face * 760 * speedMul; me.vy = 0;
                if (Math.random() < 0.7) this.particles.burst(me.x + 13, me.y + 28, '#e0f2fe', 1, 40, 0.3, 4);
            } else {
                const max = 340 * speedMul;
                const target = ax * max;
                const accel = (me.onGround ? 3400 : 2300) * dt;
                me.vx += clamp(target - me.vx, -accel, accel);
                if (ax) me.face = ax;
                me.vy = Math.min(1150, me.vy + 2300 * dt);
                if (!s.down('Space', 'ArrowUp', 'KeyW') && me.vy < -250 && !this.sprung) me.vy += 2600 * dt;
                if (s.pressed('ShiftLeft', 'ShiftRight', 'KeyK') && this.dashCd <= 0 && !this.finished && s.spend(15)) {
                    this.dash = 0.16; this.dashCd = 0.9;
                }
            }
            if (me.onGround) { this.coyote = 0.1; this.airJumps = 1; this.sprung = false; } else this.coyote -= dt;
            if (s.pressed('Space', 'ArrowUp', 'KeyW') && !this.finished) this.buffer = 0.13; else this.buffer -= dt;
            if (this.buffer > 0) {
                if (this.coyote > 0) {
                    me.vy = -850; this.coyote = 0; this.buffer = 0;
                    this.particles.burst(me.x + 13, me.y + me.h, '#cbd5e1', 6, 90, 0.3, 4);
                } else if (this.airJumps > 0 && s.spend(10)) {
                    me.vy = -780; this.airJumps--; this.buffer = 0;
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
                    me.vy = -1280; this.sprung = true; this.airJumps = 1;
                    this.particles.burst(sp.x + 23, sp.y, '#fbbf24', 12, 160, 0.4, 4);
                }
            }
            if (!this.finished) {
                for (const sp of this.spikes) if (overlap(box, sp)) this.hurt();
                for (const w of this.saws) if (dist(me.x + 13, me.y + 22, w.x, w.y) < w.r + 14) this.hurt();
                for (const l of this.lasers) {
                    const on = ((clock + l.phase) % l.period) < l.period * 0.55;
                    l.on = on;
                    if (on && overlap(box, l)) this.hurt();
                }
                if (me.y > 1100) this.hurt();
                for (const c of this.checkpoints) {
                    if (c.id > this.cp.id && me.x > c.x - 30) { this.cp = c; s.toast('Checkpoint!', '#34d399'); }
                }
                for (const b of this.boxes) {
                    if (b.t > 0) continue;
                    if (dist(me.x + 13, me.y + 22, b.x, b.y) < 36) {
                        const opened = s.ask(correct => {
                            if (correct === null) { b.t = 4; return; }
                            if (correct) { this.boost = 8; this.bonus += 80; s.refill(); s.toast('Speed boost! +80', '#34d399'); }
                            else { this.slow = 2.5; s.toast('Stumbled…', '#f87171'); }
                        });
                        if (opened) b.t = 14;
                    }
                }
                if (me.x > this.finishX && me.onGround) {
                    this.finished = true;
                    s.done = true; s.finishMs = Math.round(s.t * 1000);
                    this.bonus += 400 + Math.max(0, Math.round(500 - s.t * 2));
                    s.toast('FINISH! Waiting for the others…', '#facc15');
                    this.particles.burst(me.x, me.y, '#facc15', 40, 400, 1, 6);
                }
            }
            this.maxX = Math.max(this.maxX, me.x);
            s.score = Math.floor(Math.min(1, this.maxX / this.finishX) * 900) + this.bonus;
            this.state = this.dash > 0 ? 3 : !me.onGround ? 2 : Math.abs(me.vx) > 40 ? 1 : 0;
            this.particles.update(dt, 500);
        }

        net() {
            const m = this.me;
            return { x: Math.round(m.x), y: Math.round(m.y), vx: Math.round(m.vx), vy: Math.round(m.vy), f: m.face, a: this.state };
        }

        goalText() { return `${Math.min(100, Math.round(this.maxX / this.finishX * 100))}% of the course`; }
        hint() { return 'A/D run · Space jump · double-jump (10 energy) · Shift dash (15 energy) · press Q for a question to recharge energy'; }

        draw(ctx, w, h) {
            const s = this.s, me = this.me;
            const targetX = me.x - w * 0.33 + me.face * 60;
            this.cam.x = lerp(this.cam.x, targetX, 0.12);
            this.cam.y = lerp(this.cam.y, clamp(me.y - h * 0.58, -220, 260), 0.08);
            skyBackdrop(ctx, w, h, this.cam.x, '#1e1b4b', '#7c3aed', '#fbbf24');
            ctx.save();
            const sh = this.shake > 0 ? 6 : 0;
            ctx.translate(-Math.round(this.cam.x) + (Math.random() - 0.5) * sh, -Math.round(this.cam.y) + (Math.random() - 0.5) * sh);
            const left = this.cam.x - 50, right = this.cam.x + w + 50;
            for (const p of this.solids) {
                if (p.x > right || p.x + p.w < left || p.off) continue;
                if (p.roof) {
                    const g = ctx.createLinearGradient(0, p.y, 0, p.y + 400);
                    g.addColorStop(0, '#334155'); g.addColorStop(1, '#0f172a');
                    ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, Math.min(p.h, 1200));
                    ctx.fillStyle = '#64748b'; ctx.fillRect(p.x - 4, p.y, p.w + 8, 9);
                    ctx.fillStyle = '#475569'; ctx.fillRect(p.x - 4, p.y + 9, p.w + 8, 4);
                    for (let wx = p.x + 18; wx < p.x + p.w - 30; wx += 54) {
                        for (let wy = p.y + 40; wy < p.y + 340; wy += 56) {
                            ctx.fillStyle = (hashStr(`${wx}:${wy}`) & 3) === 0 ? '#fde68a' : '#1e293b';
                            ctx.fillRect(wx, wy, 24, 30);
                        }
                    }
                } else if (p.crumble) {
                    const shake = p.timer > 0 ? (Math.random() - 0.5) * 4 : 0;
                    ctx.fillStyle = '#b45309'; ctx.fillRect(p.x + shake, p.y, p.w, p.h);
                    ctx.fillStyle = '#f59e0b'; ctx.fillRect(p.x + shake, p.y, p.w, 6);
                } else if (p.mover) {
                    ctx.fillStyle = '#0ea5e9'; ctx.fillRect(p.x, p.y, p.w, p.h);
                    ctx.fillStyle = '#bae6fd'; ctx.fillRect(p.x, p.y, p.w, 5);
                } else {
                    ctx.fillStyle = '#94a3b8'; ctx.fillRect(p.x, p.y, p.w, p.h);
                    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(p.x, p.y, p.w, 4);
                }
            }
            for (const c of this.checkpoints) {
                if (c.x > right || c.x < left) continue;
                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(c.x, c.y - 70, 4, 70);
                ctx.fillStyle = this.cp.id >= c.id ? '#34d399' : '#f87171';
                ctx.beginPath(); ctx.moveTo(c.x + 4, c.y - 70); ctx.lineTo(c.x + 38, c.y - 58); ctx.lineTo(c.x + 4, c.y - 44); ctx.fill();
            }
            ctx.fillStyle = '#ef4444';
            for (const sp of this.spikes) {
                if (sp.x > right || sp.x + sp.w < left) continue;
                for (let i = 0; i < sp.w; i += 15) { ctx.beginPath(); ctx.moveTo(sp.x + i, sp.y + sp.h); ctx.lineTo(sp.x + i + 7.5, sp.y); ctx.lineTo(sp.x + i + 15, sp.y + sp.h); ctx.fill(); }
            }
            for (const sp of this.springs) {
                ctx.fillStyle = '#fbbf24'; ctx.fillRect(sp.x, sp.y + 8, sp.w, 8);
                ctx.fillStyle = '#f97316'; ctx.fillRect(sp.x + 4, sp.y, sp.w - 8, 8);
            }
            for (const l of this.lasers) {
                if (l.x > right || l.x < left) continue;
                ctx.fillStyle = '#475569'; ctx.fillRect(l.x - 6, l.y - 8, 22, 10);
                if (l.on) { ctx.fillStyle = 'rgba(248,113,113,.9)'; ctx.fillRect(l.x, l.y, l.w, l.h); ctx.fillStyle = 'rgba(254,202,202,.5)'; ctx.fillRect(l.x - 5, l.y, l.w + 10, l.h); }
                else { ctx.fillStyle = 'rgba(248,113,113,.18)'; ctx.fillRect(l.x + 3, l.y, 3, l.h); }
            }
            for (const sw of this.saws) {
                if (sw.x > right || sw.x < left) continue;
                ctx.save(); ctx.translate(sw.x, sw.y); ctx.rotate(this.anim * 9);
                ctx.fillStyle = '#e2e8f0';
                for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(sw.r - 3, -5); ctx.lineTo(sw.r + 7, 0); ctx.lineTo(sw.r - 3, 5); ctx.fill(); }
                ctx.beginPath(); ctx.arc(0, 0, sw.r, 0, TAU); ctx.fillStyle = '#94a3b8'; ctx.fill();
                ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
                ctx.restore();
            }
            for (const b of this.boxes) {
                if (b.t > 0 || b.x > right || b.x < left) continue;
                const bob = Math.sin(this.anim * 3 + b.x) * 5;
                ctx.fillStyle = '#facc15'; roundRect(ctx, b.x - 18, b.y - 18 + bob, 36, 36, 8); ctx.fill();
                ctx.fillStyle = '#92400e'; ctx.font = '900 24px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', b.x, b.y + 9 + bob);
            }
            // finish arch
            const fx = this.finishX;
            for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#0f172a'; ctx.fillRect(fx, this.solids[this.solids.length - 1].y - 240 + i * 24, 14, 24); }
            ctx.fillStyle = '#facc15'; ctx.font = '900 30px system-ui'; ctx.textAlign = 'center';
            ctx.fillText('FINISH', fx + 7, this.solids[this.solids.length - 1].y - 260);

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
            this.res = new A.Resource('Energy', '#fb7185', 100, 60, 2);
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
                if (this.coyote > 0) { me.vy = -900; this.coyote = 0; }
                else if (this.airJumps > 0) { me.vy = -820; this.airJumps--; this.particles.burst(me.x + 17, me.y + 56, '#bae6fd', 8, 120, 0.3, 4); }
            }
            if (this.stun <= 0 && !this.guard && this.swingCd <= 0 && (s.mouse.pressed || s.pressed('KeyJ', 'KeyK')) && s.spend(8)) {
                const aimDir = s.mouse.pressed ? Math.sign(this.screenToWorldX(s.mouse.x) - (me.x + 17)) || me.face : me.face;
                me.face = aimDir;
                this.swingT = 0.22; this.swingCd = 0.5;
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
                if (opened) this.orb.t = 14;
            }
            if (me.x < -150 || me.x > 1750 || me.y > 950 || me.y < -500) this.ko();
            this.state = this.guard ? 4 : this.swingT > 0 ? 3 : !me.onGround ? 2 : Math.abs(me.vx) > 40 ? 1 : 0;
            this.particles.update(dt, 300);
        }

        screenToWorldX(sx) { return (sx - this.offX) / this.view.z; }

        ko() {
            const s = this.s;
            this.particles.burst(this.me.x, this.me.y, s.local.color, 30, 500, 0.8, 6);
            const by = Date.now() - this.lastHit.at < 6000 ? this.lastHit.by : null;
            s.emit({ k: 'ko', to: s.user.id, by });
            this.respawn = 1.4; this.shake = 0.4; this.dmg = 0; this.lastHit = { by: null, at: 0 };
        }

        onEvent(ev, from) {
            const s = this.s, me = this.me;
            if (ev.k === 'sw') {
                from.swing = performance.now();
                if (this.respawn > 0 || this.invuln > 0 || s.paused || this.stun > 0.2) return;
                const cx = ev.x, cy = ev.y;
                const box = { x: ev.d > 0 ? cx - 10 : cx - 125, y: cy - 62, w: 135, h: 100 };
                if (!overlap(box, me)) return;
                const power = ev.p || 1;
                const blocked = this.guard && Math.sign(me.x + 17 - cx) === ev.d * 1 ? false : this.guard;
                const base = 9 * power;
                const taken = blocked ? base * 0.3 : base;
                this.dmg += taken;
                const force = (280 + this.dmg * 9) * power * (blocked ? 0.25 : 1);
                me.vx = ev.d * force; me.vy = -(160 + this.dmg * 3) * (blocked ? 0.1 : 1) - 120;
                me.onGround = false;
                this.stun = blocked ? 0.08 : clamp(0.2 + this.dmg / 400, 0.2, 0.55);
                this.hitFlash = 0.2; this.shake = 0.18;
                this.lastHit = { by: ev.by, at: Date.now() };
                this.particles.burst(me.x + 17, me.y + 28, blocked ? '#7dd3fc' : '#fca5a5', 14, 260, 0.4, 5);
                s.emit({ k: 'hit', by: ev.by, blocked });
            } else if (ev.k === 'hit' && ev.by === s.user.id) {
                s.addScore(ev.blocked ? 3 : 10);
                this.particles.burst(from.x + 17, from.y + 28, '#fde68a', 8, 200, 0.3, 4);
            } else if (ev.k === 'ko' && ev.by === s.user.id) {
                this.kos++; s.addScore(100); s.toast(`KO! ${from.name} launched out`, '#facc15');
            }
        }

        net() {
            const m = this.me;
            return { x: Math.round(m.x), y: Math.round(m.y), vx: Math.round(m.vx), vy: Math.round(m.vy), f: m.face, a: this.state, ex: { d: Math.round(this.dmg), h: this.hammer > 0 ? 1 : 0, i: this.invuln > 0 ? 1 : 0 } };
        }

        goalText() { return `${this.kos} KOs · ${Math.round(this.dmg)}% damage`; }
        hint() { return 'A/D move · Space jump · Click/J swing (8 energy) · S/Shift guard · press Q for a question to recharge energy'; }

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
            this.dashT = 0; this.dashCd = 0; this.overdrive = 0; this.jam = 0; this.kills = 0; this.pk = 0; this.deaths = 0;
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
            for (let i = 0; i < 12; i++) {
                const ang = r() * TAU, d = 650 + r() * 250;
                const x = clamp(this.me.x + Math.cos(ang) * d, 80, this.W - 80), y = clamp(this.me.y + Math.sin(ang) * d, 80, this.H - 80);
                if (this.walls.some(w => overlap({ x: x - 20, y: y - 20, w: 40, h: 40 }, w))) continue;
                this.drones.push({ x, y, r: 16, hp: shooter ? 60 : 30, max: shooter ? 60 : 30, shooter, fire: 1 + r() * 1.5, vx: 0, vy: 0, hit: 0, ph: r() * 6 });
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
            this.invuln = Math.max(0, this.invuln - dt); this.fireCd -= dt; this.dashCd -= dt;
            const zoom = this.zoom || 1;
            const mx = this.cam.x + (s.mouse.x - s.vw / 2) / zoom, my = this.cam.y + (s.mouse.y - s.vh / 2) / zoom;
            this.mouseWorld = { x: mx, y: my };

            if (this.dead > 0) {
                this.dead -= dt;
                if (this.dead <= 0) { this.respawnAt(); this.hp = 100; this.invuln = 2; this.drones = this.drones.filter(d => dist(d.x, d.y, me.x, me.y) > 500); }
            } else {
                me.aim = Math.atan2(my - me.y, mx - me.x);
                const a = s.axis();
                const len = Math.hypot(a.x, a.y) || 1;
                const speed = this.dashT > 0 ? 760 : 270;
                const tx = this.dashT > 0 ? this.dx * speed : (a.x / len) * speed * (a.x || a.y ? 1 : 0);
                const ty = this.dashT > 0 ? this.dy * speed : (a.y / len) * speed * (a.x || a.y ? 1 : 0);
                const acc = 2600 * dt;
                me.vx += clamp(tx - me.vx, -acc, acc); me.vy += clamp(ty - me.vy, -acc, acc);
                if (a.x || a.y) { this.dx = a.x / len; this.dy = a.y / len; }
                if (s.pressed('Space', 'ShiftLeft') && this.dashCd <= 0) { this.dashT = 0.16; this.dashCd = 1.1; this.invuln = Math.max(this.invuln, 0.2); this.particles.burst(me.x, me.y, '#7dd3fc', 12, 200, 0.3, 4); }
                this.dashT = Math.max(0, this.dashT - dt);
                me.x += me.vx * dt; me.y += me.vy * dt;
                for (const w of this.walls) pushCircleOutOfRect(me, w);
                const cd = this.overdrive > 0 ? 0.075 : 0.16;
                if ((s.mouse.down || s.down('KeyJ')) && this.fireCd <= 0 && this.jam <= 0 && s.spend(1)) {
                    this.fireCd = cd;
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
                        if (opened) o.t = 16;
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
                    let wantX = dx / dd, wantY = dy / dd, sp = d.shooter ? 130 : 150 + Math.min(70, s.t * 0.4);
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
            this.s.addScore(d.shooter ? 15 : 10);
            this.particles.burst(d.x, d.y, d.shooter ? '#f97316' : '#a78bfa', 16, 260, 0.5, 5);
            if (Math.random() < 0.14) this.packs.push({ x: d.x, y: d.y });
        }

        damage(amount, by, drone) {
            if (this.overdrive > 0) amount *= 0.5;
            this.hp -= amount; this.flash = 0.2; this.shake = 0.2;
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
        hint() { return 'WASD move · mouse aim · hold click to fire (1 ammo/shot) · Space dash · press Q for a question to reload ammo'; }

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
