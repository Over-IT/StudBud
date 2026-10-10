(function (window) {
    'use strict';

    const A = window.StudBudArcade;
    const { TAU, clamp, lerp, dist, overlap, mulberry32, pushCircleOutOfRect, roundRect, nameTag, drawFigureTop } = A.util;

    const clock = s => (Date.now() - s.startedAt) / 1000;
    const mod = (n, m) => ((n % m) + m) % m;
    const rampDistance = (time, capTime, gain) => {
        const t = Math.max(0, time), ramped = Math.min(t, capTime);
        return ramped + gain * ramped * ramped / (2 * capTime) + Math.max(0, t - capTime) * (1 + gain);
    };

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
            this.scoreGoal = false; this.goalUnit = 'crystals'; this.goalLabel = 'Banked crystals';
            this.seed = typeof s.seed === 'number' ? s.seed >>> 0 : A.util.hashStr(String(s.seed || 'studbud-mine'));
            const random = mulberry32(this.seed);
            const tiles = this.T = new Uint8Array(COLS * ROWS);
            for (let y = 4; y < ROWS - 1; y++) {
                const depth = y - 4;
                for (let x = 1; x < COLS - 1; x++) {
                    const rock = random();
                    let type = rock < Math.min(0.12 + Math.floor(depth / 14) * 0.035, 0.34) ? 2 : 1;
                    const ore = random();
                    if (depth < 7) {
                        if (ore < 0.075) type = 3;
                    } else if (depth < 15) {
                        if (ore < 0.055) type = 3;
                        else if (ore < 0.095) type = 4;
                    } else if (depth < 25) {
                        if (ore < 0.035) type = 3;
                        else if (ore < 0.075) type = 4;
                        else if (ore < 0.105) type = 5;
                        else if (ore < 0.122) type = 7;
                    } else {
                        if (ore < 0.025) type = 4;
                        else if (ore < 0.060) type = 5;
                        else if (ore < 0.087) type = 7;
                        else if (ore < 0.108) type = 8;
                        else if (ore < 0.123) type = 9;
                    }
                    if (depth > 15 && random() < 0.014 + Math.min(0.012, (depth - 15) * 0.00035)) type = 6;
                    tiles[y * COLS + x] = type;
                }
            }
            for (let y = 4; y < 6; y++) for (let x = 34; x <= 36; x++) tiles[y * COLS + x] = 0;
            tiles[6 * COLS + 35] = 0;
            for (let y = 0; y < ROWS; y++) { tiles[y * COLS] = 10; tiles[y * COLS + COLS - 1] = 10; }
            for (let x = 0; x < COLS; x++) tiles[(ROWS - 1) * COLS + x] = 10;

            this.base = { x: 29 * TS, y: 2.2 * TS, w: 12 * TS, h: 1.75 * TS };
            this.me = { x: 35 * TS - 13, y: 4 * TS - 40, w: 26, h: 40, vx: 0, vy: 0, face: 1, onGround: false };
            this.cam.x = this.me.x + this.me.w / 2; this.cam.y = this.me.y + this.me.h / 2;
            this.carry = 0; this.items = 0; this.cap = 20; this.banked = 0; this.depthMax = 0;
            this.dig = { tx: -1, ty: -1, p: 0 }; this.digClock = 0;
            this.baseSpeed = 280; this.stun = 0; this.lavaCd = 0; this.jetting = false;
            this.res = new A.Resource('Fuel', '#facc15', 100, 78, 2);
            this.F = new Uint8Array(COLS * ROWS);
            this.flowing = new Set(); this.flowClock = 0;
        }

        tile(tx, ty) { return tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? 10 : this.T[ty * COLS + tx]; }
        solid(type) { return type !== 0 && type !== 6; }
        depthAt(y) { return Math.max(0, Math.floor(y / TS) - 4); }
        digDuration(type, ty) {
            const depth = Math.max(0, ty - 4), strata = 1 + Math.max(0, depth - 10) * 0.018;
            const base = type === 2 ? 0.72 : type >= 3 && type !== 6 ? 0.48 : 0.29;
            return base * strata;
        }

        wakeLava(tx, ty) {
            for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const x = tx + dx, y = ty + dy;
                if (x > 0 && x < COLS - 1 && y >= 4 && y < ROWS - 1 && this.T[y * COLS + x] === 6) this.flowing.add(y * COLS + x);
            }
        }

        flowLava(dt) {
            this.flowClock += dt;
            if (this.flowClock < 0.34 || !this.flowing.size) return;
            this.flowClock = 0;
            const active = [...this.flowing]; this.flowing.clear();
            const changed = [];
            for (const idx of active) {
                if (this.T[idx] !== 6) continue;
                const x = idx % COLS, y = Math.floor(idx / COLS), spread = this.F[idx];
                const down = (y + 1) * COLS + x;
                let targets = [];
                if (y + 1 < ROWS - 1 && this.T[down] === 0) targets = [down];
                else if (spread < 3) {
                    const left = y * COLS + x - 1, right = y * COLS + x + 1;
                    if (x > 1 && this.T[left] === 0) targets.push(left);
                    if (x < COLS - 2 && this.T[right] === 0) targets.push(right);
                }
                for (const n of targets) {
                    this.T[n] = 6; this.F[n] = spread + (n === down ? 0 : 1); this.flowing.add(n);
                    const nx = n % COLS, ny = Math.floor(n / COLS);
                    changed.push({ x: nx, y: ny, d: this.F[n] });
                    this.particles.burst(nx * TS + TS / 2, ny * TS + TS / 2, '#fb642f', 3, 75, 0.35, 3);
                }
            }
            if (changed.length) this.s.emit({ k: 'lv', cells: changed });
        }

        collisionSolids() {
            const me = this.me, solids = [];
            const x0 = Math.max(0, Math.floor(me.x / TS) - 1), x1 = Math.min(COLS - 1, Math.floor((me.x + me.w) / TS) + 1);
            const y0 = Math.max(0, Math.floor(me.y / TS) - 1), y1 = Math.min(ROWS - 1, Math.floor((me.y + me.h) / TS) + 1);
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.solid(this.tile(x, y))) solids.push({ x: x * TS, y: y * TS, w: TS, h: TS });
            return solids;
        }

        hitLava() {
            const me = this.me;
            if (this.lavaCd > 0) return;
            const x0 = Math.floor((me.x + 3) / TS), x1 = Math.floor((me.x + me.w - 3) / TS);
            const y0 = Math.floor((me.y + 3) / TS), y1 = Math.floor((me.y + me.h - 3) / TS);
            let hit = null;
            for (let y = y0; y <= y1 && !hit; y++) for (let x = x0; x <= x1; x++) if (this.tile(x, y) === 6) { hit = { x, y }; break; }
            if (!hit) return;
            this.lavaCd = 1.15; this.stun = Math.max(this.stun, 0.16);
            const lost = Math.min(this.carry, Math.max(1, Math.ceil(this.carry * 0.22)));
            if (lost) { this.carry -= lost; this.items = Math.max(0, this.items - 1); }
            const dx = me.x + me.w / 2 - (hit.x * TS + TS / 2), dy = me.y + me.h / 2 - (hit.y * TS + TS / 2), d = Math.hypot(dx, dy) || 1;
            me.vx += dx / d * 360; me.vy = Math.min(me.vy, -340);
            this.particles.burst(me.x + me.w / 2, me.y + me.h / 2, '#fb642f', 15, 210, 0.55, 4);
            this.s.toast(lost ? `Lava! Lost ${lost} carried crystal points` : 'Lava! Knocked back', '#fb642f');
        }

        update(dt) {
            const s = this.s, me = this.me;
            dt = Math.min(dt, 0.05);
            this.anim += dt; this.stun = Math.max(0, this.stun - dt); this.lavaCd = Math.max(0, this.lavaCd - dt);
            const axis = this.stun > 0 ? { x: 0, y: 0 } : s.axis();
            const targetVx = axis.x * this.baseSpeed;
            me.vx += clamp(targetVx - me.vx, -1900 * dt, 1900 * dt);
            if (!axis.x) me.vx *= Math.max(0, 1 - 7 * dt);
            if (axis.x) me.face = Math.sign(axis.x);
            me.vy = Math.min(1050, me.vy + 1750 * dt);
            const jetKey = s.down('ArrowUp', 'KeyW', 'Space');
            this.jetting = false;
            if (jetKey && this.stun <= 0 && s.spend(11 * dt)) {
                me.vy = Math.max(-620, me.vy - 3000 * dt);
                this.jetting = true;
                if (Math.random() < dt * 20) this.particles.burst(me.x + me.w / 2, me.y + me.h - 1, '#fb923c', 2, 95, 0.28, 3);
            }
            if (me.vy < -90 && axis.x) me.face = Math.sign(axis.x);
            A.util.moveBody(me, this.collisionSolids(), dt);
            me.x = clamp(me.x, TS + 1, this.W - TS - me.w - 1);
            me.y = clamp(me.y, 0, this.H - TS - me.h);
            this.cam.x += (me.x + me.w / 2 - this.cam.x) * Math.min(1, dt * 5.5);
            this.cam.y += (me.y + me.h / 2 - this.cam.y) * Math.min(1, dt * 5.5);
            this.moving = Math.abs(me.vx) > 20 || Math.abs(me.vy) > 25;
            this.particles.update(dt, 500);

            this.hitLava(); this.flowLava(dt);
            this.depthMax = Math.max(this.depthMax, this.depthAt(me.y + me.h));
            const depth = this.depthAt(me.y + me.h);
            this.lowFuel = depth > 7 && this.res.value < Math.min(88, 24 + depth * 1.35);

            const mouse = this.mouseWorld(), centerX = me.x + me.w / 2, centerY = me.y + me.h / 2;
            let target = null, aimX = 0, aimY = 1;
            if (!s.mouse.down) this.minePointerAim = null;
            if (s.mouse.down) {
                if (!this.minePointerAim || s.mouse.pressed || this.minePointerAim.px !== s.mouse.x || this.minePointerAim.py !== s.mouse.y) {
                    const dx = mouse.x - centerX, dy = mouse.y - centerY;
                    const angle = Math.hypot(dx, dy) < 1 ? Math.PI / 2 : Math.atan2(dy, dx);
                    const sector = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
                    this.minePointerAim = { x: Math.round(Math.cos(sector)), y: Math.round(Math.sin(sector)), px: s.mouse.x, py: s.mouse.y };
                }
                aimX = this.minePointerAim.x; aimY = this.minePointerAim.y;
                target = { x: Math.floor(centerX / TS) + aimX, y: Math.floor(centerY / TS) + aimY };
            } else if (s.down('ArrowDown', 'KeyS') || Math.abs(axis.y) > 0.48 || Math.abs(axis.x) > 0.48) {
                aimX = Math.abs(axis.x) > 0.48 ? axis.x : 0;
                aimY = s.down('ArrowDown', 'KeyS') ? 1 : Math.abs(axis.x) > 0.48 ? 0 : axis.y;
                const d = Math.hypot(aimX, aimY) || 1; aimX /= d; aimY /= d;
            } else if (!jetKey) this.dig.p = 0;
            me.face = aimX ? Math.sign(aimX) : me.face;
            if (!target && (s.mouse.down || s.down('ArrowDown', 'KeyS') || Math.abs(axis.y) > 0.48 || Math.abs(axis.x) > 0.48)) {
                const tx = Math.floor((centerX + aimX * (TS * 0.9)) / TS), ty = Math.floor((centerY + aimY * (TS * 0.9)) / TS);
                target = { x: tx, y: ty };
            }
            this.aimTile = s.mouse.down ? target : null;
            this.aimAngle = Math.atan2(aimY, aimX);
            if (target) {
                const { x: tx, y: ty } = target, type = this.tile(tx, ty);
                const close = Math.hypot(tx * TS + TS / 2 - centerX, ty * TS + TS / 2 - centerY) < TS * 2.25;
                if (close && this.solid(type) && type !== 10 && this.stun <= 0 && s.spend(2.8 * dt)) {
                    if (this.dig.tx !== tx || this.dig.ty !== ty) this.dig = { tx, ty, p: 0 };
                    this.dig.p += dt;
                    this.digClock += dt;
                    if (this.digClock > 0.16) {
                        this.digClock = 0;
                        const color = type === 2 ? '#94a3b8' : '#a16207';
                        this.particles.burst(tx * TS + TS / 2, ty * TS + TS / 2, color, 2, 75, 0.3, 3);
                    }
                    if (this.dig.p >= this.digDuration(type, ty)) this.breakTile(tx, ty, type, true);
                } else this.dig.p = 0;
            } else this.dig.p = 0;

            if (overlap(me, this.base) && this.carry > 0) {
                const banked = this.carry;
                s.addScore(banked); this.banked += banked; this.carry = 0; this.items = 0;
                s.toast(`Deposited ${banked} crystal points!`, '#fbbf24');
                this.particles.burst(centerX, me.y + me.h, '#fbbf24', 22, 245, 0.65, 4);
            }
            s.setGoal(this.banked);
        }

        breakTile(tx, ty, type, mined) {
            this.T[ty * COLS + tx] = 0;
            this.wakeLava(tx, ty);
            const cx = tx * TS + TS / 2, cy = ty * TS + TS / 2;
            const colors = { 1: '#a16207', 2: '#94a3b8', 3: '#dbeafe', 4: '#c084fc', 5: '#34d399', 7: '#38bdf8', 8: '#fb7185', 9: '#fef08a' };
            this.particles.burst(cx, cy, colors[type] || '#a16207', type >= 3 ? 12 : 7, 150, 0.48, 4);
            if (!mined) return;
            this.s.emit({ k: 'dg', x: tx, y: ty, t: type });
            this.dig = { tx: -1, ty: -1, p: 0 };
            const values = { 3: 5, 4: 12, 5: 25, 7: 50, 8: 90, 9: 160 };
            if (values[type]) {
                if (this.items >= this.cap) this.s.toast('Satchel full — return to the surface depot!', '#fbbf24');
                else { this.carry += values[type]; this.items++; this.s.toast(`+${values[type]} carried · ${['', '', '', 'Quartz', 'Amethyst', 'Emerald', '', 'Sapphire', 'Ruby', 'Diamond'][type]}`, colors[type]); }
            }
        }

        onEvent(ev) {
            if (ev.k === 'dg' && this.tile(ev.x, ev.y) !== 0) this.breakTile(ev.x, ev.y, ev.t, false);
            if (ev.k === 'lv' && Array.isArray(ev.cells)) for (const cell of ev.cells) {
                if (cell && this.tile(cell.x, cell.y) === 0) { const idx = cell.y * COLS + cell.x; this.T[idx] = 6; this.F[idx] = cell.d || 0; this.flowing.add(idx); }
            }
        }

        net() {
            const me = this.me;
            return { x: Math.round(me.x), y: Math.round(me.y), vx: Math.round(me.vx), vy: Math.round(me.vy), f: me.face, a: me.onGround ? 1 : 0, ex: { c: this.carry, n: this.items } };
        }

        goalText() { return `Banked ${this.banked} · Carried ${this.items}/${this.cap} (${this.carry} pts)`; }
        touchLayout() { return { stick: true, stickZone: 'local', platform: true, buttons: [{ k: 'Space', label: 'Jetpack', cls: 'main' }] }; }
        hint() { return 'A/D or joystick move · W/Space jetpack · S/↓ digs down · hold anywhere outside controls to mine that direction · depot banks crystals · Q recharges fuel'; }

        draw(ctx, w, h) {
            const s = this.s, me = this.me;
            ctx.fillStyle = '#080b12'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h, 820);
            const sky = ctx.createLinearGradient(0, 0, 0, 4 * TS);
            sky.addColorStop(0, '#38bdf8'); sky.addColorStop(0.72, '#bae6fd'); sky.addColorStop(1, '#e0f2fe');
            ctx.fillStyle = sky; ctx.fillRect(this.x0, 0, this.x1 - this.x0, 4 * TS);
            ctx.fillStyle = 'rgba(255,255,255,.72)';
            for (let i = Math.floor(this.x0 / 260) - 1; i < this.x1 / 260 + 1; i++) {
                const hx = A.util.hashStr(`cloud:${i}`), cx = i * 260 + (hx % 130), cy = 42 + ((hx >>> 8) % 74);
                ctx.beginPath(); ctx.ellipse(cx, cy, 38, 12, 0, 0, TAU); ctx.ellipse(cx + 22, cy - 7, 25, 15, 0, 0, TAU); ctx.ellipse(cx - 21, cy - 5, 19, 11, 0, 0, TAU); ctx.fill();
            }

            const c0 = Math.max(0, Math.floor(this.x0 / TS)), c1 = Math.min(COLS - 1, Math.ceil(this.x1 / TS));
            const r0 = Math.max(0, Math.floor(this.y0 / TS)), r1 = Math.min(ROWS - 1, Math.ceil(this.y1 / TS));
            const strata = ['#30221c', '#33231a', '#35231b', '#38241d', '#38231d', '#39231d'];
            const oreColor = { 3: '#dbeafe', 4: '#c084fc', 5: '#34d399', 7: '#38bdf8', 8: '#fb7185', 9: '#fef08a' };
            const oreName = { 3: 'QUARTZ', 4: 'AMETHYST', 5: 'EMERALD', 7: 'SAPPHIRE', 8: 'RUBY', 9: 'DIAMOND' };
            for (let ty = Math.max(4, r0); ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
                const idx = ty * COLS + tx, type = this.T[idx], x = tx * TS, y = ty * TS;
                const color = strata[Math.min(strata.length - 1, Math.floor((ty - 4) / 8))];
                if (type === 0) { ctx.fillStyle = color; ctx.fillRect(x, y, TS, TS); continue; }
                if (type === 6) {
                    ctx.fillStyle = '#21140f'; ctx.fillRect(x, y, TS, TS);
                    const pulse = 0.76 + Math.sin(this.anim * 4 + idx) * 0.12;
                    const glow = ctx.createRadialGradient(x + 24, y + 24, 3, x + 24, y + 24, 38);
                    glow.addColorStop(0, `rgba(255,196,55,${pulse})`); glow.addColorStop(0.55, 'rgba(249,115,22,.86)'); glow.addColorStop(1, 'rgba(220,38,38,0)');
                    ctx.fillStyle = glow; ctx.fillRect(x - 8, y - 8, TS + 16, TS + 16);
                    ctx.fillStyle = '#ff7a18'; ctx.beginPath(); ctx.moveTo(x + 3, y + 34); ctx.lineTo(x + 12, y + 13 + Math.sin(this.anim * 4 + tx) * 4); ctx.lineTo(x + 21, y + 34); ctx.lineTo(x + 32, y + 9); ctx.lineTo(x + 44, y + 34); ctx.closePath(); ctx.fill();
                    continue;
                }
                const rockColor = type === 10 ? '#111827' : type === 2 ? '#475569' : color;
                ctx.fillStyle = rockColor; ctx.fillRect(x, y, TS, TS);
                const hash = A.util.hashStr(`${this.seed}:${idx}`);
                ctx.fillStyle = type === 2 ? 'rgba(226,232,240,.13)' : 'rgba(255,211,153,.09)';
                for (let k = 0; k < 4; k++) {
                    const px = x + 5 + ((hash >>> (k * 5)) & 31), py = y + 5 + ((hash >>> (k * 4 + 9)) & 31);
                    ctx.fillRect(px, py, 2 + (k & 1), 2);
                }
                ctx.strokeStyle = 'rgba(0,0,0,.34)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1);
                ctx.strokeStyle = 'rgba(255,240,220,.15)'; ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + TS - 2, y + 2); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 2, y + TS - 2); ctx.stroke();
                if (oreColor[type]) {
                    const cc = oreColor[type], cx = x + 24, cy = y + 24, shimmer = 0.85 + Math.sin(this.anim * 3 + idx) * 0.12;
                    const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, 27);
                    halo.addColorStop(0, cc); halo.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.globalAlpha = 0.32 * shimmer; ctx.fillStyle = halo; ctx.fillRect(x - 3, y - 3, TS + 6, TS + 6); ctx.globalAlpha = 1;
                    ctx.fillStyle = cc; ctx.beginPath(); ctx.moveTo(cx, y + 7); ctx.lineTo(x + 39, cy); ctx.lineTo(cx, y + 41); ctx.lineTo(x + 9, cy); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.beginPath(); ctx.moveTo(cx, y + 8); ctx.lineTo(x + 22, cy); ctx.lineTo(x + 11, cy); ctx.closePath(); ctx.fill();
                    if ((hash & 3) === 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + Math.sin(this.anim * 4 + idx) * 7, y + 4); ctx.lineTo(cx, y + 11); ctx.lineTo(cx + 4, y + 7); ctx.stroke(); }
                    if ((hash & 15) === 2) { ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = '700 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText(oreName[type], cx, y + 46); }
                }
                if (this.dig.tx === tx && this.dig.ty === ty) {
                    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x, y + TS - 6, TS, 6);
                    ctx.fillStyle = '#fde047'; ctx.fillRect(x, y + TS - 6, TS * clamp(this.dig.p / this.digDuration(type, ty), 0, 1), 6);
                    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(x + 8, y + 10); ctx.lineTo(x + 18, y + 16); ctx.lineTo(x + 14, y + 25); ctx.stroke();
                }
            }

            if (this.aimTile && s.mouse.down) {
                const x = this.aimTile.x * TS, y = this.aimTile.y * TS;
                ctx.save(); ctx.strokeStyle = 'rgba(254,240,138,.72)'; ctx.lineWidth = 2;
                ctx.strokeRect(x + 4, y + 4, TS - 8, TS - 8);
                ctx.translate(x + TS / 2, y + TS / 2); ctx.rotate(this.aimAngle);
                ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.moveTo(3, -6); ctx.lineTo(9, 0); ctx.lineTo(3, 6); ctx.stroke(); ctx.restore();
            }
            const groundY = 4 * TS;
            ctx.fillStyle = '#4ade80'; ctx.fillRect(this.x0, groundY - 5, this.x1 - this.x0, 6);
            const depot = this.base;
            ctx.fillStyle = 'rgba(15,23,42,.36)'; ctx.fillRect(depot.x + 18, depot.y + 10, depot.w - 36, depot.h - 10);
            ctx.fillStyle = '#475569'; A.util.roundRect(ctx, depot.x + 20, depot.y + 12, depot.w - 40, depot.h - 12, 12); ctx.fill();
            ctx.fillStyle = '#64748b'; ctx.fillRect(depot.x + 28, depot.y + 6, depot.w - 56, 22);
            ctx.fillStyle = '#fbbf24'; ctx.fillRect(depot.x + 34, depot.y + 38, depot.w - 68, 12);
            ctx.fillStyle = '#0f172a'; ctx.font = '900 19px system-ui'; ctx.textAlign = 'center'; ctx.fillText('CRYSTAL DEPOT', depot.x + depot.w / 2, depot.y + 83);
            ctx.fillStyle = '#f8fafc'; ctx.font = '700 12px system-ui'; ctx.fillText('SELL HAUL  •  REFUEL', depot.x + depot.w / 2, depot.y + 105);

            for (const r of s.remoteList()) {
                if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || !this.seen(r.x, r.y)) continue;
                A.util.drawFigureSide(ctx, r, r.x, r.y, 26, 40, Number.isFinite(r.f) ? r.f : 1, this.anim + r.x * 0.01, r.a === 1, 0.82);
                const carried = r.ex && Number.isFinite(r.ex.c) ? r.ex.c : 0;
                if (carried) { ctx.fillStyle = '#fbbf24'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`◆ ${carried}`, r.x + 13, r.y + 53); }
                A.util.nameTag(ctx, r.name || '', r.x + 13, r.y - 12, r.color);
            }
            A.util.drawFigureSide(ctx, s.local, me.x, me.y, me.w, me.h, me.face, this.anim, me.onGround, this.stun > 0 ? 0.72 : 1);
            if (this.jetting) {
                ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(me.x + 6, me.y + me.h - 4); ctx.lineTo(me.x + 11, me.y + me.h + 17 + Math.sin(this.anim * 28) * 3); ctx.lineTo(me.x + 17, me.y + me.h - 4); ctx.fill();
                ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.moveTo(me.x + 8, me.y + me.h - 1); ctx.lineTo(me.x + 12, me.y + me.h + 10); ctx.lineTo(me.x + 15, me.y + me.h - 1); ctx.fill();
            }
            A.util.nameTag(ctx, 'You', me.x + me.w / 2, me.y - 12, '#fff');
            this.particles.draw(ctx);
            this.end(ctx);

            const depth = this.depthAt(me.y + me.h);
            const px = w / 2 + (me.x + me.w / 2 - this.camX) * this.zoom;
            const py = h / 2 + (me.y + me.h / 2 - this.camY) * this.zoom;
            const darkness = clamp(depth / 66, 0.03, 0.72);
            ctx.fillStyle = `rgba(2,5,14,${darkness})`; ctx.fillRect(0, 0, w, h);
            const light = ctx.createRadialGradient(px, py, 36, px, py, Math.min(w, h) * 0.56);
            light.addColorStop(0, 'rgba(255,239,190,.08)'); light.addColorStop(0.62, 'rgba(255,205,120,.035)'); light.addColorStop(1, 'rgba(0,0,0,.2)');
            ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
            s.placeHud(ctx, 0, 0, 212, this.lowFuel ? 70 : 30, 'top-center');
            ctx.fillStyle = 'rgba(8,12,24,.72)'; A.util.roundRect(ctx, 0, 0, 212, 30, 10); ctx.fill();
            ctx.fillStyle = '#cbd5e1'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`DEPTH  ${depth * 5}m`, 106, 20);
            if (this.lowFuel) {
                ctx.fillStyle = 'rgba(127,29,29,.88)'; A.util.roundRect(ctx, 0, 36, 212, 34, 10); ctx.fill();
                ctx.fillStyle = '#fecaca'; ctx.font = '900 14px system-ui'; ctx.fillText('LOW FUEL — HEAD UP!', 106, 58);
            }
            ctx.restore();
            if (depth === 0 && this.carry > 0 && me.y < 4 * TS) {
                s.placeHud(ctx, 0, 0, 270, 24, 'bottom-center');
                ctx.fillStyle = '#fef3c7'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Return to the depot to bank your haul', 135, 16); ctx.restore();
            }
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
            for (let i = 0; i < 15; i++) this.logs.push({ y: 300 + r() * (this.H - 600), x0: r() * this.W, spd: 90 + r() * 100, phase: r() * TAU, fq: 0.35 + r() * 0.55 });
            this.rocks = [];
            for (let i = 0; i < 30; i++) this.rocks.push({ x: 600 + r() * (this.W - 900), y: 330 + r() * (this.H - 660), r: 30 + r() * 24 });
            this.pools = [];
            for (let i = 0; i < 3; i++) this.pools.push({ x: 900 + i * 1050 + r() * 300, y: 450 + r() * (this.H - 900), r: 130, phase: r() * TAU, ampX: 60 + r() * 45, ampY: 40 + r() * 35 });
            this.poolHitCd = 0;
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

        logPos(log, now) {
            return { x: mod(log.x0 + log.spd * rampDistance(now, 82.5, 0.55), this.W), y: log.y + Math.sin(now * log.fq + log.phase) * 28 };
        }

        poolPos(pool, now) {
            return { x: pool.x + Math.sin(now * 0.24 + pool.phase) * pool.ampX, y: pool.y + Math.sin(now * 0.31 + pool.phase * 1.7) * pool.ampY };
        }

        update(dt) {
            const s = this.s, me = this.me, now = clock(s);
            this.step(dt, 1800);
            this.castCd -= dt; this.hurt = Math.max(0, this.hurt - dt); this.comboT -= dt; this.poolHitCd = Math.max(0, this.poolHitCd - dt);
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
                const pos = this.logPos(lg, now);
                const rect = { x: pos.x - 70, y: pos.y - 18, w: 140, h: 36 };
                if (pushCircleOutOfRect(me, rect) && this.hurt <= 0) { this.hurt = 1; me.vx = 160; this.loseFish(); this.particles.burst(me.x, me.y, '#a16207', 10, 160, 0.4, 3); }
            }
            this.duelCheck(now);
            for (const pool of this.pools) {
                const pos = this.poolPos(pool, now), dx = pos.x - me.x, dy = pos.y - me.y;
                const d = Math.hypot(dx, dy) || 1, pullRadius = pool.r * 1.7;
                if (d < pullRadius) {
                    const strength = (1 - d / pullRadius) * (420 + Math.min(now, 120) * 2.5) * dt;
                    me.vx += (dx / d - dy / d * 0.85) * strength;
                    me.vy += (dy / d + dx / d * 0.85) * strength;
                }
                if (d < 38 + me.r && this.poolHitCd <= 0) {
                    this.poolHitCd = 1.6;
                    this.stun = Math.max(this.stun, 0.75);
                    me.vx += -dy / d * 260 + dx / d * 110;
                    me.vy += dx / d * 260 + dy / d * 110;
                    const lost = Math.min(this.haul, Math.ceil(this.haul * 0.12));
                    if (lost) { this.haul -= lost; s.addScore(-lost); this.catches = Math.max(0, this.catches - 1); }
                    s.toast(lost ? `Whirlpool! Spun out — lost ${lost} fish pts` : 'Whirlpool! Spun around and stunned', '#a5f3fc');
                    this.particles.burst(me.x, me.y, '#67e8f9', 16, 220, 0.55, 4);
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
        touchLayout() { return { stick: true, buttons: [] }; }
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
                const pos = this.poolPos(p, now);
                if (!this.seen(pos.x, pos.y, p.r * 1.7)) continue;
                ctx.strokeStyle = 'rgba(103,232,249,.22)'; ctx.lineWidth = 2; ctx.setLineDash([10, 9]);
                ctx.beginPath(); ctx.arc(pos.x, pos.y, p.r * 1.7, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
                ctx.strokeStyle = 'rgba(224,242,254,.75)'; ctx.lineWidth = 4;
                for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(pos.x, pos.y, p.r * (0.3 + i * 0.22), t * 2 + i, t * 2 + i + 4.2); ctx.stroke(); }
                ctx.fillStyle = 'rgba(8,145,178,.45)'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 18, 0, TAU); ctx.fill();
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
                const pos = this.logPos(lg, now), x = pos.x, y = pos.y;
                if (!this.seen(x, y, 120)) continue;
                ctx.fillStyle = '#78350f'; roundRect(ctx, x - 70, y - 18, 140, 36, 16); ctx.fill();
                ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.ellipse(x + 66, y, 7, 14, 0, 0, TAU); ctx.fill();
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
            for (let k = 0; k < BR + 1; k++) for (let j = 0; j < 4; j++) this.cars.push({ horiz: true, c: ROAD / 2 + k * (BH + ROAD), p0: r() * this.W, spd: (155 + r() * 100) * (j % 2 ? -1 : 1), lane: (j % 2 ? -1 : 1) * (j < 2 ? 30 : 55), phase: r() * TAU, color: ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316'][Math.floor(r() * 5)] });
            for (let k = 0; k < BC + 1; k++) for (let j = 0; j < 4; j++) this.cars.push({ horiz: false, c: ROAD / 2 + k * (BW + ROAD), p0: r() * this.H, spd: (155 + r() * 100) * (j % 2 ? -1 : 1), lane: (j % 2 ? -1 : 1) * (j < 2 ? 30 : 55), phase: r() * TAU, color: ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316'][Math.floor(r() * 5)] });
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
            this.pkg = null; this.deliveries = 0; this.streak = 0; this.earned = 0; this.cash = 0; this.hitCd = 0;
        }

        buildCityLayer() {
            const canvas = document.createElement('canvas');
            canvas.width = this.W; canvas.height = this.H;
            const c = canvas.getContext('2d'), random = mulberry32(this.s.seed ^ 4821);
            c.fillStyle = '#343d49'; c.fillRect(0, 0, this.W, this.H);
            for (let i = 0; i < 24000; i++) {
                c.fillStyle = i % 2 ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.10)';
                c.fillRect(random() * this.W, random() * this.H, 2, 2);
            }
            c.strokeStyle = '#e3c887'; c.lineWidth = 2; c.setLineDash([28, 26]);
            for (let k = 0; k <= BR; k++) {
                const y = ROAD / 2 + k * (BH + ROAD);
                for (const offset of [-3, 3]) { c.beginPath(); c.moveTo(0, y + offset); c.lineTo(this.W, y + offset); c.stroke(); }
            }
            for (let k = 0; k <= BC; k++) {
                const x = ROAD / 2 + k * (BW + ROAD);
                for (const offset of [-3, 3]) { c.beginPath(); c.moveTo(x + offset, 0); c.lineTo(x + offset, this.H); c.stroke(); }
            }
            c.setLineDash([]);
            for (let row = 0; row <= BR; row++) for (let col = 0; col <= BC; col++) {
                const x = ROAD / 2 + col * (BW + ROAD), y = ROAD / 2 + row * (BH + ROAD);
                c.fillStyle = '#343d49'; c.fillRect(x - 64, y - 64, 128, 128);
                c.fillStyle = '#d5d9dd';
                for (let j = -3; j <= 3; j++) {
                    c.fillRect(x + j * 17 - 5, y - ROAD / 2 + 5, 10, 20); c.fillRect(x + j * 17 - 5, y + ROAD / 2 - 25, 10, 20);
                    c.fillRect(x - ROAD / 2 + 5, y + j * 17 - 5, 20, 10); c.fillRect(x + ROAD / 2 - 25, y + j * 17 - 5, 20, 10);
                }
            }
            this.blocks.forEach((b, index) => {
                c.fillStyle = '#737d85'; c.fillRect(b.x - 26, b.y - 26, b.w + 52, b.h + 52);
                c.fillStyle = '#b4bbc1'; c.fillRect(b.x - 23, b.y - 23, b.w + 46, b.h + 46);
                c.strokeStyle = '#939da6'; c.lineWidth = 1;
                for (let x = b.x - 22; x < b.x + b.w + 22; x += 22) { c.beginPath(); c.moveTo(x, b.y - 22); c.lineTo(x, b.y + b.h + 22); c.stroke(); }
                for (let y = b.y - 22; y < b.y + b.h + 22; y += 22) { c.beginPath(); c.moveTo(b.x - 22, y); c.lineTo(b.x + b.w + 22, y); c.stroke(); }
                c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(b.x + 12, b.y + 16, b.w, b.h);
                c.fillStyle = b.color; c.fillRect(b.x, b.y, b.w, b.h);
                c.fillStyle = b.roof; c.fillRect(b.x + 12, b.y + 12, b.w - 24, b.h - 48);
                c.strokeStyle = 'rgba(255,255,255,.18)';
                for (let y = b.y + 18; y < b.y + b.h - 40; y += 16) { c.beginPath(); c.moveTo(b.x + 15, y); c.lineTo(b.x + b.w - 15, y); c.stroke(); }
                c.fillStyle = 'rgba(255,255,255,.20)'; c.fillRect(b.x + 12, b.y + 12, b.w - 24, 6);
                for (let unit = 0; unit < 2 + index % 3; unit++) {
                    const x = b.x + 36 + unit * 61, y = b.y + 40 + (unit % 2) * 39;
                    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + 5, y + 6, 38, 28);
                    c.fillStyle = '#9ba8b6'; c.fillRect(x, y, 38, 28);
                    c.fillStyle = '#475569'; c.beginPath(); c.arc(x + 14, y + 14, 9, 0, TAU); c.fill();
                    c.strokeStyle = '#d1d9df'; c.beginPath(); c.moveTo(x + 14, y + 6); c.lineTo(x + 14, y + 22); c.moveTo(x + 6, y + 14); c.lineTo(x + 22, y + 14); c.stroke();
                }
                if (index % 3 === 0) {
                    c.fillStyle = '#263f65'; c.fillRect(b.x + b.w - 100, b.y + 34, 68, 46);
                    c.strokeStyle = '#8aa9cb';
                    for (let j = 1; j < 4; j++) { c.beginPath(); c.moveTo(b.x + b.w - 100 + j * 17, b.y + 34); c.lineTo(b.x + b.w - 100 + j * 17, b.y + 80); c.stroke(); }
                }
                for (let j = 0; j < 5; j++) {
                    const x = b.x + 35 + j * (b.w - 70) / 5;
                    c.fillStyle = '#26384c'; c.fillRect(x, b.y + b.h - 30, 34, 23);
                    c.fillStyle = index % 2 ? '#c2dbe4' : '#e6cf91'; c.fillRect(x + 3, b.y + b.h - 27, 28, 17);
                    c.fillStyle = '#6d7c87'; c.fillRect(x + 16, b.y + b.h - 27, 2, 17);
                }
                c.fillStyle = '#172a3a'; c.fillRect(b.door.x - 15, b.y + b.h - 26, 30, 26);
                c.fillStyle = '#e4c38b'; c.fillRect(b.door.x + 8, b.y + b.h - 12, 3, 3);
                c.fillStyle = b.shop ? '#78350f' : '#334155';
                roundRect(c, b.door.x - 66, b.y + b.h - 65, 132, 23, 4); c.fill();
                c.font = '900 13px system-ui'; c.textAlign = 'center'; c.fillStyle = '#fff4cd';
                c.fillText(b.shop ? 'PARCEL & PANTRY' : `No. ${index + 12}`, b.door.x, b.y + b.h - 49);
                if (b.shop) for (let j = 0; j < 8; j++) {
                    c.fillStyle = j % 2 ? '#fff4df' : '#e05252'; c.fillRect(b.door.x - 64 + j * 16, b.y + b.h - 35, 16, 17);
                    c.fillStyle = j % 2 ? '#ddd1be' : '#b53636'; c.fillRect(b.door.x - 64 + j * 16, b.y + b.h - 18, 16, 6);
                }
                const benchX = b.x + 42, benchY = b.y - 16;
                c.fillStyle = '#384552'; c.fillRect(benchX - 4, benchY - 6, 5, 19); c.fillRect(benchX + 42, benchY - 6, 5, 19);
                c.fillStyle = '#987452'; for (let j = 0; j < 3; j++) c.fillRect(benchX, benchY - 5 + j * 5, 42, 3);
                c.fillStyle = '#283645'; c.fillRect(b.x + b.w - 22, b.y - 22, 4, 25);
                c.fillStyle = '#fff3bb'; c.beginPath(); c.arc(b.x + b.w - 20, b.y - 22, 5, 0, TAU); c.fill();
                c.fillStyle = '#36634b'; c.fillRect(b.x + b.w - 15, b.y + b.h + 4, 28, 12);
                c.fillStyle = '#e596a6'; for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(b.x + b.w - 12 + j * 7, b.y + b.h + 8, 3, 0, TAU); c.fill(); }
            });
            for (const tree of this.trees) {
                c.fillStyle = '#757e79'; c.fillRect(tree.x - 12, tree.y - 10, 24, 24);
                c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(tree.x + 6, tree.y + 7, tree.r + 4, tree.r, 0, 0, TAU); c.fill();
                for (let j = 0; j < 5; j++) {
                    const angle = j * TAU / 5;
                    c.fillStyle = ['#205c3d', '#287647', '#348653', '#46945d', '#3a8150'][j];
                    c.beginPath(); c.arc(tree.x + Math.cos(angle) * 5, tree.y - 4 + Math.sin(angle) * 5, tree.r * .75, 0, TAU); c.fill();
                }
            }
            this.cityLayer = canvas;
        }
        carRect(c, now) {
            const along = mod(c.p0 + c.spd * rampDistance(now, 72, 0.45), c.horiz ? this.W : this.H);
            const lane = c.lane + Math.sin(now * 0.7 + c.phase) * 10;
            return c.horiz ? { x: along - 38, y: c.c + lane - 17, w: 76, h: 34 } : { x: c.c + lane - 17, y: along - 38, w: 34, h: 76 };
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
            this.hitCd = Math.max(0, this.hitCd - dt);
            this.speedMul = (winded ? 0.5 : sprint ? 1.5 : 1) * (this.boost > 0 ? 1.35 : 1);
            this.step(dt);
            const hit = { x: me.x - 12, y: me.y - 12, w: 24, h: 24 };
            if (this.hitCd <= 0 && this.stun <= 0) {
                for (const c of this.cars) {
                    const rect = this.carRect(c, now);
                    if (!overlap(hit, rect)) continue;
                    const sign = Math.sign(c.spd) || 1;
                    me.vx = c.horiz ? sign * 500 : (me.x < rect.x + rect.w / 2 ? -460 : 460);
                    me.vy = c.horiz ? (me.y < rect.y + rect.h / 2 ? -460 : 460) : sign * 500;
                    this.stun = 1.1; this.hitCd = 1.35;
                    const loss = Math.min(this.cash, Math.max(12, Math.round(this.cash * 0.12)));
                    this.cash -= loss; this.earned = Math.max(0, this.earned - loss); s.addScore(-loss);
                    this.particles.burst(me.x, me.y, '#fbbf24', 18, 260, 0.5, 4);
                    if (this.pkg) { this.pkg = null; this.streak = 0; s.toast(`Hit by a car! -$${loss} · package lost`, '#f87171'); }
                    else s.toast(loss ? `Hit by a car! -$${loss}` : 'Hit by a car! No cash to lose', '#f87171');
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
                    s.addScore(pay); this.cash += pay; this.earned += pay; this.deliveries++;
                    s.toast(`Delivered! +$${pay}${this.streak > 1 ? ` · streak ${this.streak}` : ''}`, '#4ade80');
                    this.particles.burst(d.x, d.y - 10, '#4ade80', 24, 280, 0.7, 5);
                    this.pkg = null;
                }
            }
            for (const v of this.vending) {
                if (v.until > now || dist(me.x, me.y, v.x, v.y) > 44) continue;
                const opened = s.ask(correct => {
                    if (correct) { s.addScore(40); this.cash += 40; this.earned += 40; this.boost = 8; s.refill(); s.toast('Snack break: +$40 and a speed boost!', '#38bdf8'); }
                    else if (correct === false) s.toast('Machine ate your coin.', '#f87171');
                });
                if (opened) v.until = now + 1e6;
            }
            s.setGoal(this.deliveries);
        }

        ex() { return { p: this.pkg ? 1 : 0 }; }
        goalText() { return `${this.deliveries} deliveries · $${this.cash} cash · streak ${this.streak}`; }
        touchLayout() { return { stick: true, buttons: [{ k: 'ShiftLeft', label: 'Sprint', cls: 'main' }] }; }
        hint() { return 'WASD move (uses a little energy) · Shift sprint (more energy) · deliver to marked houses · dodge cars · Q = recharge'; }

        draw(ctx, w, h) {
            const s = this.s, me = this.me, now = clock(s), t = this.anim;
            ctx.fillStyle = '#334155'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h, w < 600 ? 640 : 820);
            if (!this.cityLayer) this.buildCityLayer();
            ctx.drawImage(this.cityLayer, 0, 0);
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
                ctx.save(); ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
                ctx.rotate(c.horiz ? (c.spd > 0 ? 0 : Math.PI) : (c.spd > 0 ? Math.PI / 2 : -Math.PI / 2));
                ctx.fillStyle = '#17212d';
                for (const y of [-19, 15]) { ctx.fillRect(-22, y, 13, 4); ctx.fillRect(17, y, 13, 4); }
                ctx.fillStyle = '#b4d7e6'; ctx.fillRect(-19, -11, 10, 22); ctx.fillRect(5, -12, 13, 24);
                ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(7, -9, 3, 18);
                ctx.fillStyle = c.color; ctx.fillRect(-7, -12, 10, 24);
                ctx.fillStyle = '#f87171'; ctx.fillRect(-37, -12, 4, 7); ctx.fillRect(-37, 5, 4, 7);
                ctx.fillStyle = '#e6e8eb'; ctx.fillRect(32, -9, 3, 18);
                ctx.restore();                ctx.fillStyle = 'rgba(15,23,42,.75)';
                if (c.horiz) { const sg = Math.sign(c.spd); ctx.fillRect(rect.x + rect.w / 2 + (sg > 0 ? 6 : -22), rect.y + 5, 16, rect.h - 10); ctx.fillStyle = '#fef08a'; ctx.fillRect(sg > 0 ? rect.x + rect.w - 6 : rect.x, rect.y + 4, 6, 8); ctx.fillRect(sg > 0 ? rect.x + rect.w - 6 : rect.x, rect.y + rect.h - 12, 6, 8); }
                else { const sg = Math.sign(c.spd); ctx.fillRect(rect.x + 5, rect.y + rect.h / 2 + (sg > 0 ? 6 : -22), rect.w - 10, 16); ctx.fillStyle = '#fef08a'; ctx.fillRect(rect.x + 4, sg > 0 ? rect.y + rect.h - 6 : rect.y, 8, 6); ctx.fillRect(rect.x + rect.w - 12, sg > 0 ? rect.y + rect.h - 6 : rect.y, 8, 6); }
            }
            this.drawPlayers(ctx, (c, x, y, r) => {
                const has = r ? r.ex?.p : this.pkg;
                if (has) {
                    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x - 7, y - 45, 21, 18);
                    c.fillStyle = '#d49a53'; c.fillRect(x - 10, y - 49, 20, 17);
                    c.fillStyle = '#f5d097'; c.fillRect(x - 10, y - 49, 20, 5);
                    c.fillStyle = '#fff1c7'; c.fillRect(x - 2, y - 49, 4, 17);
                    c.fillStyle = '#74502e'; c.fillRect(x + 4, y - 40, 4, 3);
                }
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
            this.touchMain = 'Sprint';
            this.kickCharge = 0; this.kickHeld = false; this.kickAim = null; this.ballSpin = 0;
            this.keeper = { x: this.W - 64, y: this.H / 2, r: 20, cd: 0 };
            this.scoreGoal = false; this.goalUnit = 'goals'; this.goalLabel = 'Team goals';
            this.dir = 1; this.td = 0; this.yards = 0;
            this.me.y = this.H / 2; this.baseSpeed = 250;
            this.res = new A.Resource('Energy', '#38bdf8', 100, 60, 2);
            this.kickCd = 0; this.contactCd = 0; this.pinchCd = 0; this.turbo = 0; this.freeze = 0; this.ballCorrection = null; this.msg = '';
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
            this.ballCorrection = null;
            this.kickCharge = 0; this.kickHeld = false;
            this.keeper.y = this.H / 2; this.keeper.cd = .8;
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
            this.ballSpin += Math.hypot(b.vx, b.vy) * dt / b.r * (b.vx < 0 ? -1 : 1);
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
                const b = this.ball;
                const ix = Number.isFinite(ev.ix) ? ev.ix : ev.vx - b.vx;
                const iy = Number.isFinite(ev.iy) ? ev.iy : ev.vy - b.vy;
                b.vx += ix; b.vy += iy;
                const speed = Math.hypot(b.vx, b.vy);
                if (speed > 1250) { b.vx *= 1250 / speed; b.vy *= 1250 / speed; }
                const now = performance.now(), correction = this.ballCorrection;
                if (correction && now < correction.until) {
                    correction.count = Math.min(4, correction.count + 1);
                    correction.x += (ev.x - correction.x) / correction.count;
                    correction.y += (ev.y - correction.y) / correction.count;
                } else this.ballCorrection = { x: ev.x, y: ev.y, count: 1 };
                this.ballCorrection.until = now + 240;
                this.lastTouch = from ? from.id : this.lastTouch;
            } else if (ev.k === 'gl' && this.teamsOn) {
                if (this.unclaimed === ev.team || this.freeze <= 0) {
                    this.teamTd[ev.team]++;
                    this.freeze = 1.8;
                    const b = this.ball;
                    this.particles.burst(b.x, b.y, ev.team === 0 ? '#60a5fa' : '#f87171', 40, 380, 0.9, 5);
                    this.kickoff();
                    if (from) this.s.toast(`${from.name} scored for ${ev.team === 0 ? 'Blue' : 'Red'}!`, ev.team === 0 ? '#60a5fa' : '#f87171');
                }
                this.unclaimed = null;
            }
        }

        stepKeeper(dt) {
            const keeper = this.keeper, ball = this.ball;
            keeper.cd = Math.max(0, keeper.cd - dt);
            const target = ball.x > this.W * .65 ? ball.y : this.H / 2;
            keeper.y += clamp(target - keeper.y, -210 * dt, 210 * dt);
            keeper.y = clamp(keeper.y, this.H / 2 - this.goalH / 2 + 26, this.H / 2 + this.goalH / 2 - 26);
            const dx = ball.x - keeper.x, dy = ball.y - keeper.y, distance = Math.hypot(dx, dy);
            if (keeper.cd <= 0 && distance < keeper.r + ball.r + 6) {
                const pre = { vx: ball.vx, vy: ball.vy };
                ball.x = keeper.x - keeper.r - ball.r - 2;
                ball.vx = -Math.max(380, Math.abs(ball.vx) * .8);
                ball.vy = clamp(dy * 14, -320, 320);
                keeper.cd = .55; this.lastTouch = null;
                this.sendKick(pre);
                this.particles.burst(keeper.x, keeper.y, '#fbbf24', 10, 150, .4, 3);
            }
        }

        sendKick(pre) {
            const b = this.ball, p = pre || b;
            const msg = { x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), pvx: Math.round(p.vx), pvy: Math.round(p.vy), ix: Math.round(b.vx - p.vx), iy: Math.round(b.vy - p.vy) };
            this.s.emit({ k: 'kick', ...msg });
        }

        update(dt) {
            const s = this.s, me = this.me, b = this.ball;
            this.kickCd -= dt; this.contactCd = Math.max(0, this.contactCd - dt); this.pinchCd = Math.max(0, this.pinchCd - dt); this.turbo = Math.max(0, this.turbo - dt);
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
                if (wasFrozen) { this.lastTouch = null; this.kickHeld = false; }
                const dx = b.x - me.x, dy = b.y - me.y, d = Math.hypot(dx, dy), min = me.r + b.r;
                if (this.stun <= 0) {
                    const pre = { vx: b.vx, vy: b.vy };
                    // Separate circles first, then reflect only the inward normal velocity in the player's frame.
                    if (d < min) {
                        const nx = d > 0.001 ? dx / d : Math.cos(me.aim), ny = d > 0.001 ? dy / d : Math.sin(me.aim);
                        b.x = me.x + nx * (min + 0.5); b.y = me.y + ny * (min + 0.5);
                        const relN = (b.vx - me.vx) * nx + (b.vy - me.vy) * ny;
                        if (relN < -8) {
                            const impulse = -(1 + 0.58) * relN;
                            b.vx += nx * impulse; b.vy += ny * impulse;
                            this.lastTouch = s.user.id;
                        }
                        const remote = s.remoteList().find(p => dist(b.x, b.y, p.x, p.y) < min + 5);
                        if (remote && this.pinchCd <= 0) {
                            const ax = remote.x - me.x, ay = remote.y - me.y, ad = Math.hypot(ax, ay) || 1;
                            let nxp = -ay / ad, nyp = ax / ad;
                            if (b.vx * nxp + b.vy * nyp < 0) { nxp = -nxp; nyp = -nyp; }
                            const midX = (me.x + remote.x) / 2, midY = (me.y + remote.y) / 2;
                            b.x = midX + nxp * (min + 2); b.y = midY + nyp * (min + 2);
                            b.vx += nxp * 220; b.vy += nyp * 220;
                            this.pinchCd = 0.35; this.lastTouch = s.user.id;
                        }
                        const speed = Math.hypot(b.vx, b.vy);
                        if (speed > 1250) { b.vx *= 1250 / speed; b.vy *= 1250 / speed; }
                        if (this.contactCd <= 0) {
                            this.contactCd = 0.16; this.sendKick(pre);
                            if (Math.abs(b.vx - pre.vx) + Math.abs(b.vy - pre.vy) > 12) s.sfx('act', 90);
                        }
                    }
                    const held = s.down('Space'), tapped = s.mouse.pressed;
                    if (tapped) this.kickAim = this.mouseWorld();
                    if (held && !this.kickHeld) this.kickCharge = 0;
                    if (held) this.kickCharge = Math.min(1, this.kickCharge + dt / .8);
                    const released = this.kickHeld && !held;
                    this.kickHeld = held;
                    if ((tapped || released) && this.kickCd <= 0 && d < 78) {
                        const charge = tapped ? .12 : this.kickCharge;
                        const cost = Math.round(4 + charge * 11);
                        if (s.spend(cost)) {
                            const aim = tapped || (!this.moving && this.kickAim) ? this.kickAim : null;
                            const angle = aim ? Math.atan2(aim.y - me.y, aim.x - me.x) : me.aim;
                            const kickPre = { vx: b.vx, vy: b.vy }, power = 480 + charge * 650;
                            b.vx = Math.cos(angle) * power; b.vy = Math.sin(angle) * power;
                            this.kickCd = .25 + charge * .2; this.contactCd = Math.max(this.contactCd, .2); this.lastTouch = s.user.id;
                            this.sendKick(kickPre); s.sfx('shoot');
                            this.particles.burst(b.x, b.y, '#fde68a', 12, 220, .35, 3);
                        }
                    }
                    if (!held) this.kickCharge = 0;
                }
                if (!this.teamsOn) this.stepKeeper(dt);
                const scored = this.stepBall(dt);
                if (scored >= 0) this.goalScored(scored);
                else if (this.ballCorrection) {
                    const correction = this.ballCorrection;
                    const blend = Math.min(1, dt * 5);
                    b.x += (correction.x - b.x) * blend; b.y += (correction.y - b.y) * blend;
                    if (performance.now() >= correction.until || Math.hypot(correction.x - b.x, correction.y - b.y) < 1) this.ballCorrection = null;
                }
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
        touchLayout() { return { stick: true, buttons: [{ k: 'ShiftLeft', label: 'Sprint' }] }; }
        hint() { return `${this.teamsOn ? `${this.myTeam === 0 ? 'Blue' : 'Red'} team · ` : ''}Move to dribble · Shift sprint / steal · tap toward a pass · hold Space, release to shoot (4–15 energy) · Q recharge`; }

        draw(ctx, w, h) {
            const me = this.me, t = this.anim, b = this.ball, W = this.W, H = this.H, gy0 = H / 2 - this.goalH / 2;
            ctx.fillStyle = '#14532d'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h, w < 600 ? 650 : 800);
            ctx.fillStyle = '#273744'; ctx.fillRect(-90, -80, W + 180, H + 160);
            for (let row = 0; row < 3; row++) for (let x = -40; x < W + 40; x += 24) {
                ctx.fillStyle = ['#df6b68', '#79abd4', '#edcc79', '#b4c5ce'][mod(Math.floor(x / 24) + row * 7, 4)];
                ctx.beginPath(); ctx.arc(x, -20 - row * 20, 5, 0, TAU); ctx.arc(x, H + 20 + row * 20, 5, 0, TAU); ctx.fill();
            }
            for (let i = 0; i < 24; i++) { ctx.fillStyle = i % 2 ? '#15803d' : '#16a34a'; ctx.fillRect(i * 100, 0, 100, H); }
            ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 5;
            ctx.strokeStyle = 'rgba(224,255,208,.09)'; ctx.lineWidth = 1; ctx.beginPath();
            for (let y = 12; y < H; y += 21) for (let x = mod(y, 33); x < W; x += 31) {
                if (!this.seen(x, y, 20)) continue;
                ctx.moveTo(x, y); ctx.lineTo(x + 2, y - 4); ctx.moveTo(x + 4, y); ctx.lineTo(x + 5, y - 3);
            }
            ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 5;
            ctx.strokeRect(3, 3, W - 6, H - 6);
            ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
            ctx.beginPath(); ctx.arc(W / 2, H / 2, 130, 0, TAU); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 6, 0, TAU); ctx.fill();
            for (const side of [0, 1]) {
                const bx = side ? W - 260 : 0;
                ctx.strokeRect(bx, H / 2 - 260, 260, 520);
                ctx.beginPath(); ctx.arc(side ? W - 190 : 190, H / 2, 7, 0, TAU); ctx.fillStyle = '#ecf7e9'; ctx.fill();
                ctx.beginPath(); ctx.arc(side ? W - 190 : 190, H / 2, 112, side ? Math.PI * .64 : -Math.PI * .36, side ? Math.PI * 1.36 : Math.PI * .36); ctx.stroke();
                ctx.strokeRect(side ? W - 110 : 0, H / 2 - 150, 110, 300);
                const nx = side ? W - this.netD : 0;
                ctx.fillStyle = side ? 'rgba(248,113,113,.22)' : (this.teamsOn ? 'rgba(96,165,250,.22)' : 'rgba(255,255,255,.1)');
                ctx.fillRect(nx, gy0, this.netD, this.goalH);
                ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath();
                for (let k = 0; k <= this.goalH; k += 20) { ctx.moveTo(nx, gy0 + k); ctx.lineTo(nx + this.netD, gy0 + k); }
                for (let k = 0; k <= this.netD; k += 20) { ctx.moveTo(nx + k, gy0); ctx.lineTo(nx + k, gy0 + this.goalH); }
                ctx.stroke();
                ctx.strokeStyle = 'rgba(15,23,42,.4)'; ctx.lineWidth = 7;
                ctx.strokeRect(nx + (side ? -4 : 4), gy0 + 6, this.netD, this.goalH);
                ctx.strokeStyle = '#dce9ee'; ctx.lineWidth = 4; ctx.strokeRect(nx, gy0, this.netD, this.goalH);
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
            const spin = this.ballSpin;
            for (let k = 0; k < 5; k++) { const a = spin + k * TAU / 5; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * b.r * 0.58, b.y + Math.sin(a) * b.r * 0.58, 3, 0, TAU); ctx.fill(); }
            ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, TAU); ctx.fill();
            if (!this.teamsOn) {
                const keeper = this.keeper;
                drawFigureTop(ctx, { color: '#fbbf24' }, keeper.x, keeper.y, keeper.r, Math.PI, t, 1);
                nameTag(ctx, 'Keeper', keeper.x, keeper.y - 34, '#fbbf24');
            }
            this.drawPlayers(ctx, (c, x, y, r) => {
                const owner = r ? r.id : this.s.user.id;
                if (this.lastTouch === owner && dist(x, y, b.x, b.y) < 100) {
                    this.ring(c, x, y, 25, '#fff2a0', 2);
                    c.fillStyle = '#fff2a0'; c.beginPath(); c.moveTo(x, y - 42); c.lineTo(x - 5, y - 50); c.lineTo(x + 5, y - 50); c.fill();
                }
                if (this.teamsOn) this.ring(c, x, y, 21, this.teamOf(r ? r.id : this.s.user.id) === 0 ? '#60a5fa' : '#f87171', 3);
                if (r ? r.ex?.t : this.turbo > 0) { this.ring(c, x, y, 26, 'rgba(253,224,71,.8)', 3); }
            });
            this.particles.draw(ctx);
            if (this.kickHeld && this.freeze <= 0) {
                this.ring(ctx, me.x, me.y, 33, 'rgba(15,23,42,.65)', 6);
                ctx.strokeStyle = '#fde047'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(me.x, me.y, 33, -Math.PI / 2, -Math.PI / 2 + TAU * this.kickCharge); ctx.stroke();
                const angle = this.moving || !this.kickAim ? me.aim : Math.atan2(this.kickAim.y - me.y, this.kickAim.x - me.x);
                ctx.strokeStyle = 'rgba(253,224,71,.65)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(me.x + Math.cos(angle) * 42, me.y + Math.sin(angle) * 42); ctx.lineTo(me.x + Math.cos(angle) * 110, me.y + Math.sin(angle) * 110); ctx.stroke();
            }
            if (!this.seen(b.x, b.y, -25)) {
                const angle = Math.atan2(b.y - me.y, b.x - me.x);
                ctx.save(); ctx.translate(me.x + Math.cos(angle) * 80, me.y + Math.sin(angle) * 80); ctx.rotate(angle);
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-7, -8); ctx.lineTo(-7, 8); ctx.fill(); ctx.restore();
            }
            this.end(ctx);
            if (this.kickHeld && !this.freeze) {
                this.s.placeHud(ctx, 0, 0, 172, 31, 'top-center');
                ctx.fillStyle = 'rgba(15,23,42,.8)'; roundRect(ctx, 0, 0, 172, 31, 9); ctx.fill();
                ctx.fillStyle = '#253d51'; ctx.fillRect(11, 19, 150, 4);
                ctx.fillStyle = '#38bdf8'; ctx.fillRect(11, 19, 150 * this.kickCharge, 4);
                ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#e5eff9'; ctx.fillText(`SHOT ${Math.round(this.kickCharge * 100)}%`, 86, 13); ctx.restore();
            }
            if (this.freeze > 0) {
                ctx.fillStyle = `rgba(255,244,179,${Math.min(.3, this.freeze * .12)})`; ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 65; i++) {
                    const elapsed = 1.8 - this.freeze;
                    ctx.fillStyle = ['#60a5fa', '#f87171', '#fde047', '#fff'][i % 4];
                    ctx.save(); ctx.translate(mod(i * 83 + Math.sin(i) * elapsed * 90, w), mod(i * 47 + elapsed * (90 + i * 3), h)); ctx.rotate(i + elapsed * 4); ctx.fillRect(-3, -4, 6, 9); ctx.restore();
                }
                this.s.placeHud(ctx, w / 2 - 145, h / 2 - 117, 290, 95, 'center');
                ctx.fillStyle = 'rgba(15,23,42,.78)'; roundRect(ctx, w / 2 - 145, h / 2 - 117, 290, 95, 18); ctx.fill();
                ctx.fillStyle = '#fde047'; ctx.font = `900 ${Math.min(54, w * .12)}px system-ui`; ctx.textAlign = 'center';
                ctx.fillText('GOAL!', w / 2, h / 2 - 60);
                ctx.font = '700 14px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText('Kickoff at the centre spot', w / 2, h / 2 - 36); ctx.textAlign = 'left'; ctx.restore();
            }
        }
    }

    Object.assign(A.games, { miner: Miner, river: River, market: Market, sports: Sports });
    A.Arena = Arena;
})(window);
