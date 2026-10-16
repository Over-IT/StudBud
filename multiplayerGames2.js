(function (window) {
    'use strict';

    const A = window.StudBudArcade;
    const { TAU, clamp, lerp, dist, overlap, mulberry32, pushCircleOutOfRect, roundRect, nameTag, drawFigureTop } = A.util;

    const clock = s => ((typeof s.testPauseAt === 'number' ? s.testPauseAt : Date.now()) - s.startedAt) / 1000;
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

        carHitRect(c, now) {
            const rect = this.carRect(c, now);
            return { x: rect.x - 5, y: rect.y - 5, w: rect.w + 10, h: rect.h + 10 };
        }

        step(dt, accel = 2400, drift = { x: 0, y: 0 }) {
            const s = this.s, me = this.me;
            this.anim += dt;
            this.stun = Math.max(0, this.stun - dt);
            const a = this.stun > 0 ? { x: 0, y: 0 } : s.axis();
            const len = Math.hypot(a.x, a.y) || 1;
            const sp = this.baseSpeed * this.speedMul;
            const tx = (a.x || a.y ? (a.x / len) * sp : 0) + drift.x;
            const ty = (a.x || a.y ? (a.y / len) * sp : 0) + drift.y;
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
            const touch = s.overlay?.classList?.contains('has-touch');
            const look = this.pointerLook !== false && !s.preview && s.mouse.active && (!touch || s.mouse.down) ? .2 : 0;
            const lookX = clamp((s.mouse.x - s.vw / 2) / (this.zoom || 1) * look, -140, 140);
            const lookY = clamp((s.mouse.y - s.vh / 2) / (this.zoom || 1) * look, -100, 100);
            this.cam.x += (me.x + lookX - this.cam.x) * k;
            this.cam.y += (me.y + lookY - this.cam.y) * k;
            this.particles.update(dt);
        }

        mouseWorld() {
            const s = this.s;
            return { x: this.camX + (s.mouse.x - s.vw / 2) / this.zoom, y: this.camY + (s.mouse.y - s.vh / 2) / this.zoom };
        }

        begin(ctx, w, h, zoomBase = 820, zoomScale = 1) {
            this.zoom = A.util.sceneZoom(this.s, w, h, zoomBase) * (this.s.preview ? 1 : zoomScale);
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

        seenRect(x, y, w, h, pad = 80) {
            return x + w >= this.x0 - pad && x <= this.x1 + pad && y + h >= this.y0 - pad && y <= this.y1 + pad;
        }

        drawPlayers(ctx, extra) {
            const s = this.s, me = this.me;
            for (const r of s.remoteList()) {
                if (!this.seen(r.x, r.y)) continue;
                drawFigureTop(ctx, r, r.x, r.y, 15, r.f || 0, this.anim + r.x * 0.01, 0.95);
                if (extra) extra(ctx, r.x, r.y, r);
                if (!this.s.preview) nameTag(ctx, r.name || '', r.x, r.y - 30, r.color);
            }
            const alpha = this.stun > 0 ? 0.5 + Math.sin(this.anim * 30) * 0.3 : 1;
            drawFigureTop(ctx, s.local, me.x, me.y, 15, me.aim, this.anim, alpha);
            if (extra) extra(ctx, me.x, me.y, null);
            if (!this.s.preview) nameTag(ctx, 'You', me.x, me.y - 30, '#fff');
        }

        net() {
            const me = this.me;
            return { x: Math.round(me.x), y: Math.round(me.y), vx: Math.round(me.vx), vy: Math.round(me.vy), f: +me.aim.toFixed(2), a: this.moving ? 1 : 0, ex: this.ex ? this.ex() : {} };
        }

        ring(ctx, x, y, r, color, width = 3) {
            ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        }

        qMark(ctx, x, y, color, pulse) {
            if (this.s.preview || !this.seen(x, y, 50)) return;
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
    const TS = 48, COLS = 110, ROWS = 80, MID = Math.floor(COLS / 2);
    const DIG_TIME = [0, 0.28, 0.62, 0.4, 0.55, 0.7, 0, 0.5, 9999];
    const CRYSTALS = {
        3: { name: 'Quartz', value: 5, color: '#dbeafe' },
        4: { name: 'Amethyst', value: 12, color: '#c084fc' },
        5: { name: 'Emerald', value: 25, color: '#34d399' },
        7: { name: 'Sapphire', value: 50, color: '#38bdf8' },
        8: { name: 'Ruby', value: 90, color: '#fb7185' },
        9: { name: 'Diamond', value: 160, color: '#fef08a' }
    };
    const LAVA_DOWN_INTERVAL = 0.6, LAVA_SIDE_INTERVAL = 2, LAVA_SIDE_REACH = 4;

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
                    if (depth > 15 && random() < 0.005) type = 6;
                    tiles[y * COLS + x] = type;
                }
            }
            this.naturalCaves = new Uint8Array(tiles.length);
            this.carveCaves(random);
            this.tileHashes = new Uint32Array(tiles.length);
            for (let i = 0; i < tiles.length; i++) this.tileHashes[i] = A.util.hashStr(`${this.seed}:${i}`);
            for (let y = 4; y < 6; y++) for (let x = MID - 1; x <= MID + 1; x++) tiles[y * COLS + x] = 0;
            tiles[6 * COLS + MID] = 0;
            for (let y = 0; y < ROWS; y++) { tiles[y * COLS] = 10; tiles[y * COLS + COLS - 1] = 10; }
            for (let x = 0; x < COLS; x++) tiles[(ROWS - 1) * COLS + x] = 10;

            this.cols = COLS; this.rows = ROWS; this.spawnCol = MID;
            this.base = { x: (MID - 6) * TS, y: 2.2 * TS, w: 12 * TS, h: 1.75 * TS };
            this.me = { x: MID * TS - 13, y: 4 * TS - 40, w: 26, h: 40, vx: 0, vy: 0, face: 1, onGround: false };
            this.cam.x = this.me.x + this.me.w / 2; this.cam.y = this.me.y + this.me.h / 2;
            this.carry = 0; this.items = 0; this.cap = 20; this.banked = 0; this.depthMax = 0;
            this.dig = { tx: -1, ty: -1, p: 0 }; this.digClock = 0;
            this.baseSpeed = 280; this.stun = 0; this.lavaCd = 0; this.jetting = false;
            this.res = new A.Resource('Fuel', '#facc15', 100, 40, 2);
            this.F = new Uint8Array(COLS * ROWS);
            this.D = new Uint8Array(COLS * ROWS);
            this.lavaVisibility = new Float32Array(COLS * ROWS);
            this.flowing = new Set(); this.flowClock = 0; this.flowSideClock = 0;
            for (let i = 0; i < tiles.length; i++) if (tiles[i] === 6) this.flowing.add(i);
        }

        tile(tx, ty) { return tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? 10 : this.T[ty * COLS + tx]; }
        carveCaves(random) {
            // Winding worm caves: open pockets to explore, with crystals studding the walls.
            const tiles = this.T, count = 15 + Math.floor(random() * 5);
            const open = (x, y) => x > 1 && x < COLS - 2 && y > 9 && y < ROWS - 2 && Math.abs(x - MID) > 3;
            for (let c = 0; c < count; c++) {
                let x = 4 + random() * (COLS - 8), y = 12 + random() * (ROWS - 16), angle = random() * TAU;
                const volcanic = c % 5 === 0;
                const length = 22 + Math.floor(random() * 34);
                for (let step = 0; step < length; step++) {
                    const radius = 0.9 + random() * 1.25 + Math.sin(step * 0.45) * 0.35;
                    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                        const tx = Math.round(x + dx), ty = Math.round(y + dy);
                        if (dx * dx + dy * dy * 1.6 <= radius * radius && open(tx, ty)) {
                            const index = ty * COLS + tx;
                            tiles[index] = volcanic && dy === 1 && step % 8 === 0 ? 6 : 0;
                            this.naturalCaves[index] = volcanic ? 2 : 1;
                        }
                    }
                    // Keep random lava pockets away from dry caves; mining can still expose isolated sources.
                    for (let y = 10; y < ROWS - 2; y++) for (let x = 2; x < COLS - 2; x++) {
                        const index = y * COLS + x;
                        if (tiles[index] !== 6 || this.naturalCaves[index] === 2) continue;
                        let dry = false;
                        for (let dy = -2; dy <= 2 && !dry; dy++) for (let dx = -2; dx <= 2; dx++) {
                            if (this.naturalCaves[(y + dy) * COLS + x + dx] === 1) { dry = true; break; }
                        }
                        if (dry) tiles[index] = 1;
                    }
                    angle += (random() - 0.5) * 0.9;
                    x += Math.cos(angle) * 0.95; y += Math.sin(angle) * 0.55;
                    if (x < 3 || x > COLS - 4) angle = Math.PI - angle;
                    if (y < 11 || y > ROWS - 4) angle = -angle;
                }
            }
            for (let y = 11; y < ROWS - 2; y++) for (let x = 2; x < COLS - 2; x++) {
                const index = y * COLS + x, type = tiles[index];
                if (type !== 1 && type !== 2) continue;
                const air = (tiles[index - 1] === 0) + (tiles[index + 1] === 0) + (tiles[index - COLS] === 0) + (tiles[index + COLS] === 0);
                if (!air || random() > 0.075) continue;
                const depth = y - 4;
                tiles[index] = depth < 15 ? 4 : depth < 30 ? (random() < 0.6 ? 5 : 7) : depth < 50 ? (random() < 0.55 ? 7 : 8) : (random() < 0.55 ? 8 : 9);
            }
        }
        revealLava(dt) {
            const cx = this.me.x + this.me.w / 2, cy = this.me.y + this.me.h / 2;
            const col = Math.floor(cx / TS), row = Math.floor(cy / TS), radius = TS * 5;
            for (let y = Math.max(4, row - 5); y <= Math.min(ROWS - 1, row + 5); y++) {
                for (let x = Math.max(1, col - 5); x <= Math.min(COLS - 2, col + 5); x++) {
                    const index = y * COLS + x, distance = Math.hypot(x * TS + TS / 2 - cx, y * TS + TS / 2 - cy);
                    if (this.T[index] !== 6 || distance > radius) continue;
                    this.lavaVisibility[index] = Math.min(1, this.lavaVisibility[index] + dt * (1.6 - distance / radius));
                }
            }
        }
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
            this.flowSideClock += dt;
            const changed = [];
            const spread = sideways => {
                const active = [...this.flowing].sort((a, b) => a - b);
                for (const idx of active) {
                    if (this.T[idx] !== 6) { this.flowing.delete(idx); continue; }
                    const x = idx % COLS, y = Math.floor(idx / COLS), reach = this.F[idx];
                    const below = (y + 1) * COLS + x;
                    if (!sideways) {
                        if (y + 1 < ROWS - 1 && (this.T[below] === 0 || (this.T[below] === 6 && this.F[below] > 0))) this.addLavaFlow(below, 0, true, changed);
                        continue;
                    }
                    const canImprove = (next, allowance) => this.T[next] === 0 || (this.T[next] === 6 && this.F[next] > allowance);
                    const canFall = y + 1 < ROWS - 1 && canImprove(below, 0);
                    const canSpread = this.solid(this.tile(x, y + 1)) && reach < LAVA_SIDE_REACH
                        && [x - 1, x + 1].some(nx => nx > 0 && nx < COLS - 1 && canImprove(y * COLS + nx, reach + 1));
                    if (!canFall && !canSpread) this.flowing.delete(idx);
                    if (!canSpread) continue;
                    for (const nx of [x - 1, x + 1]) {
                        if (nx <= 0 || nx >= COLS - 1) continue;
                        const next = y * COLS + nx;
                        if (this.T[next] === 0 || (this.T[next] === 6 && this.F[next] > reach + 1)) this.addLavaFlow(next, reach + 1, false, changed);
                    }
                }
            };
            while (this.flowClock >= LAVA_DOWN_INTERVAL) {
                this.flowClock -= LAVA_DOWN_INTERVAL;
                spread(false);
            }
            while (this.flowSideClock >= LAVA_SIDE_INTERVAL) {
                this.flowSideClock -= LAVA_SIDE_INTERVAL;
                spread(true);
            }
            if (changed.length) this.s.emit({ k: 'lv', cells: changed });
        }

        addLavaFlow(index, distance, falling, changed) {
            this.T[index] = 6;
            this.F[index] = distance;
            this.D[index] = falling ? 1 : 0;
            this.flowing.add(index);
            const x = index % COLS, y = Math.floor(index / COLS);
            changed.push({ x, y, d: distance, f: falling ? 1 : 0 });
            if (this.seen(x * TS, y * TS)) this.particles.burst(x * TS + TS / 2, y * TS + TS / 2, '#fb642f', 3, 75, 0.35, 3);
        }

        collisionSolids(body = this.me) {
            const solids = [];
            const x0 = Math.max(0, Math.floor(body.x / TS) - 1), x1 = Math.min(COLS - 1, Math.floor((body.x + body.w) / TS) + 1);
            const y0 = Math.max(0, Math.floor(body.y / TS) - 1), y1 = Math.min(ROWS - 1, Math.floor((body.y + body.h) / TS) + 1);
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.solid(this.tile(x, y))) solids.push({ x: x * TS, y: y * TS, w: TS, h: TS });
            return solids;
        }

        drawMineProgress(ctx, x, y, progress) {
            const amount = clamp(progress, 0, 1);
            if (amount <= 0) return;
            ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x + 5, y + TS - 8, TS - 10, 5);
            ctx.fillStyle = '#fde047'; ctx.fillRect(x + 5, y + TS - 8, (TS - 10) * amount, 5);
            const cracks = Math.min(5, 1 + Math.floor(amount * 6));
            const paths = [
                [[18, 7], [21, 15], [16, 21], [19, 28]],
                [[21, 15], [29, 12], [34, 16]], [[16, 21], [10, 18], [7, 23]],
                [[19, 28], [25, 32], [23, 38]], [[29, 12], [27, 7], [32, 4]]
            ];
            ctx.strokeStyle = `rgba(15,10,8,${0.45 + amount * 0.4})`; ctx.lineWidth = 2;
            for (const path of paths.slice(0, cracks)) {
                ctx.beginPath(); ctx.moveTo(x + path[0][0], y + path[0][1]);
                for (const [px, py] of path.slice(1)) ctx.lineTo(x + px, y + py);
                ctx.stroke();
            }
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
            if (jetKey && this.stun <= 0 && s.spend(A.ENERGY_COSTS.miner.jet * dt)) {
                me.vy = Math.max(-620, me.vy - 3000 * dt);
                this.jetting = true;
                if (Math.random() < dt * 20) this.particles.burst(me.x + me.w / 2, me.y + me.h - 1, '#fb923c', 2, 95, 0.28, 3);
            }
            if (me.vy < -90 && axis.x) me.face = Math.sign(axis.x);
            A.util.moveBody(me, this.collisionSolids(), dt);
            me.x = clamp(me.x, TS + 1, this.W - TS - me.w - 1);
            me.y = clamp(me.y, 0, this.H - TS - me.h);
            const touch = s.overlay?.classList?.contains('has-touch');
            const look = !s.preview && s.mouse.active && (!touch || s.mouse.down) ? 0.34 : 0;
            const lookX = clamp((s.mouse.x - s.vw / 2) / (this.zoom || 1) * look, -230, 230);
            const lookY = clamp((s.mouse.y - s.vh / 2) / (this.zoom || 1) * look, -170, 170);
            this.cam.x += (me.x + me.w / 2 + lookX - this.cam.x) * Math.min(1, dt * 5.5);
            this.cam.y += (me.y + me.h / 2 + lookY - this.cam.y) * Math.min(1, dt * 5.5);
            this.moving = Math.abs(me.vx) > 20 || Math.abs(me.vy) > 25;
            this.particles.update(dt, 500);

            this.hitLava(); this.flowLava(dt); this.revealLava(dt);
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
                if (close && this.solid(type) && type !== 10 && this.stun <= 0 && s.spend(A.ENERGY_COSTS.miner.dig * dt)) {
                    if (this.dig.tx !== tx || this.dig.ty !== ty) this.dig = { tx, ty, p: 0 };
                    this.dig.p += dt;
                    this.digClock += dt;
                    if (this.digClock > 0.16) {
                        this.digClock = 0;
                        s.sfx('mine', 140);
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
                s.sfx('coin');
                this.particles.burst(centerX, me.y + me.h, '#fbbf24', 22, 245, 0.65, 4);
            }
            s.setGoal(this.banked);
        }

        breakTile(tx, ty, type, mined) {
            this.T[ty * COLS + tx] = 0;
            this.wakeLava(tx, ty);
            const cx = tx * TS + TS / 2, cy = ty * TS + TS / 2;
            const colors = { 1: '#a16207', 2: '#94a3b8', ...Object.fromEntries(Object.entries(CRYSTALS).map(([type, crystal]) => [type, crystal.color])) };
            this.particles.burst(cx, cy, colors[type] || '#a16207', type >= 3 ? 12 : 7, 150, 0.48, 4);
            if (!mined) return;
            this.s.emit({ k: 'dg', x: tx, y: ty, t: type });
            this.dig = { tx: -1, ty: -1, p: 0 };
            const crystal = CRYSTALS[type];
            this.s.sfx(crystal ? 'crystal' : 'rockBreak', 80);
            if (crystal) {
                if (this.items >= this.cap) this.s.toast('Satchel full - return to the surface depot!', '#fbbf24');
                else { this.carry += crystal.value; this.items++; this.s.toast(`+${crystal.value} carried - ${crystal.name}`, crystal.color); }

            }
        }

        onEvent(ev) {
            if (ev.k === 'dg' && this.tile(ev.x, ev.y) !== 0) this.breakTile(ev.x, ev.y, ev.t, false);
            if (ev.k === 'lv' && Array.isArray(ev.cells)) for (const cell of ev.cells) {
                if (cell && Number.isInteger(cell.x) && Number.isInteger(cell.y) && cell.x > 0 && cell.x < COLS - 1 && cell.y >= 4 && cell.y < ROWS - 1
                    && Number.isInteger(cell.d) && cell.d >= 0 && cell.d <= LAVA_SIDE_REACH
                    && (this.tile(cell.x, cell.y) === 0 || (this.tile(cell.x, cell.y) === 6 && this.F[cell.y * COLS + cell.x] > cell.d))) {
                    const idx = cell.y * COLS + cell.x;
                    this.T[idx] = 6; this.F[idx] = cell.d || 0; this.D[idx] = cell.f ? 1 : 0; this.flowing.add(idx);
                }
            }
        }

        net() {
            const me = this.me;
            return { x: Math.round(me.x), y: Math.round(me.y), vx: Math.round(me.vx), vy: Math.round(me.vy), f: me.face, a: me.onGround ? 1 : 0, ex: { c: this.carry, n: this.items, digging: this.dig.p > 0, aim: this.aimAngle || 0 } };
        }

        drawPickaxe(ctx, x, y, angle, swinging, phase) {
            const side = Math.cos(angle) < 0 ? -1 : 1;
            ctx.save(); ctx.translate(x + side * 9, y + 4); ctx.scale(side, 1);
            ctx.rotate((side < 0 ? Math.PI - angle : angle) + (swinging ? Math.sin(phase * 18) * .7 - .25 : -.65));
            ctx.fillStyle = '#805538'; roundRect(ctx, -3, -1.5, 25, 3, 1.5); ctx.fill();
            ctx.fillStyle = '#b98a56'; ctx.fillRect(5, -1.5, 13, 1);
            ctx.fillStyle = '#334155'; roundRect(ctx, -3, -2, 9, 4, 1); ctx.fill();
            ctx.fillStyle = '#94a3b8'; ctx.beginPath();
            ctx.moveTo(15, -9); ctx.lineTo(21, -11); ctx.quadraticCurveTo(29, -2, 25, 11);
            ctx.lineTo(22, 4); ctx.lineTo(21, -3); ctx.lineTo(16, -5); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5; ctx.beginPath();
            ctx.moveTo(21, -10); ctx.quadraticCurveTo(27, -2, 25, 9); ctx.stroke();
            ctx.fillStyle = '#475569'; ctx.fillRect(18, -3, 5, 6);
            ctx.fillStyle = '#f4c7a1'; ctx.beginPath(); ctx.ellipse(1, 0, 3, 2.5, 0, 0, TAU); ctx.fill();
            if (swinging) {
                ctx.strokeStyle = 'rgba(226,232,240,.25)'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(0, 0, 25, -.6, .6); ctx.stroke();
            }
            ctx.restore();
        }
        goalText() { return `Banked ${this.banked} · Carried ${this.items}/${this.cap} (${this.carry} pts)`; }
        touchLayout() { return { stick: true, stickZone: 'local', platform: true, buttons: [{ k: 'Space', label: 'Jetpack', cls: 'main' }] }; }
        hint() { return 'A/D move · W/Space jetpack · S/↓ dig down · hold mouse button to mine in that direction · depot banks crystals · Q recharges fuel'; }
        touchHint() { return 'Hold outside the controls to mine in that direction · deposit crystals at the surface depot'; }

        draw(ctx, w, h) {
            const s = this.s, me = this.me;
            ctx.fillStyle = '#080b12'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h, 820, 1.4);
            if (this.y0 < 4 * TS) A.util.bandGradient(ctx, this.x0, 0, this.x1 - this.x0, 4 * TS, [[0, '#38bdf8'], [0.72, '#bae6fd'], [1, '#e0f2fe']]);
            ctx.fillStyle = 'rgba(255,255,255,.72)';
            if (this.y0 < 150 && this.y1 > 20) for (let i = Math.floor(this.x0 / 260) - 1; i < this.x1 / 260 + 1; i++) {
                const hx = A.util.hashStr(`cloud:${i}`), cx = i * 260 + (hx % 130), cy = 42 + ((hx >>> 8) % 74);
                ctx.beginPath(); ctx.ellipse(cx, cy, 38, 12, 0, 0, TAU); ctx.ellipse(cx + 22, cy - 7, 25, 15, 0, 0, TAU); ctx.ellipse(cx - 21, cy - 5, 19, 11, 0, 0, TAU); ctx.fill();
            }

            const c0 = Math.max(0, Math.floor(this.x0 / TS)), c1 = Math.min(COLS - 1, Math.ceil(this.x1 / TS));
            const r0 = Math.max(0, Math.floor(this.y0 / TS)), r1 = Math.min(ROWS - 1, Math.ceil(this.y1 / TS));
            const strata = ['#30221c', '#33231a', '#35231b', '#38241d', '#38231d', '#39231d'];
            for (let ty = Math.max(4, r0); ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
                const idx = ty * COLS + tx, type = this.T[idx], x = tx * TS, y = ty * TS;
                const color = strata[Math.min(strata.length - 1, Math.floor((ty - 4) / 8))];
                if (type === 0) {
                    const caveHash = this.tileHashes[idx], natural = this.naturalCaves[idx];
                    ctx.fillStyle = natural ? '#10252b' : '#211a1b'; ctx.fillRect(x, y, TS, TS);
                    ctx.fillStyle = natural ? '#112d32' : '#100e12'; ctx.fillRect(x + 2, y + 2, TS - 4, TS - 4);
                    ctx.fillStyle = 'rgba(173,145,126,.12)';
                    for (let k = 0; k < 3; k++) {
                        const px = x + 7 + ((caveHash >>> (k * 7)) & 31), py = y + 7 + ((caveHash >>> (k * 5 + 11)) & 29);
                        ctx.fillRect(px, py, 2 + (k & 1), 1);
                    }
                    const seam = [];
                    if (this.solid(this.tile(tx - 1, ty))) seam.push([x + 1, y + 1, x + 1, y + TS - 1]);
                    if (this.solid(this.tile(tx + 1, ty))) seam.push([x + TS - 1, y + 1, x + TS - 1, y + TS - 1]);
                    if (this.solid(this.tile(tx, ty - 1))) seam.push([x + 1, y + 1, x + TS - 1, y + 1]);
                    if (this.solid(this.tile(tx, ty + 1))) seam.push([x + 1, y + TS - 1, x + TS - 1, y + TS - 1]);
                    if (seam.length) {
                        ctx.save();
                        ctx.lineCap = 'square'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,5,7,.82)';
                        ctx.beginPath(); for (const [x1, y1, x2, y2] of seam) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); } ctx.stroke();
                        ctx.lineWidth = natural ? 3 : 1.5; ctx.strokeStyle = natural ? '#67b5ba' : 'rgba(197,145,93,.7)';
                        ctx.beginPath(); for (const [x1, y1, x2, y2] of seam) { ctx.moveTo(x1 + (x1 === x + 1 ? 2 : -2), y1 + (y1 === y + 1 ? 2 : -2)); ctx.lineTo(x2 + (x2 === x + 1 ? 2 : -2), y2 + (y2 === y + 1 ? 2 : -2)); } ctx.stroke();
                        ctx.restore();
                    }
                    if (natural && this.solid(this.tile(tx, ty - 1))) {
                        ctx.fillStyle = '#67b5ba'; ctx.beginPath(); ctx.moveTo(x + 12, y + 3);
                        ctx.lineTo(x + 17, y + 14); ctx.lineTo(x + 21, y + 3); ctx.fill();
                    }
                    continue;
                }
                if (type === 6) {
                    ctx.fillStyle = '#30251e'; ctx.fillRect(x, y, TS, TS);
                    const visibility = s.preview ? 1 : this.lavaVisibility[idx];
                    if (visibility <= 0) continue;
                    ctx.save(); ctx.globalAlpha = visibility;
                    ctx.fillStyle = '#21140f'; ctx.fillRect(x, y, TS, TS);
                    const pulse = 0.76 + Math.sin(this.anim * 4 + idx) * 0.12;
                    const glow = ctx.createRadialGradient(x + 24, y + 24, 3, x + 24, y + 24, 38);
                    glow.addColorStop(0, `rgba(255,196,55,${pulse})`); glow.addColorStop(0.55, 'rgba(249,115,22,.86)'); glow.addColorStop(1, 'rgba(220,38,38,0)');
                    ctx.fillStyle = glow; ctx.fillRect(x - 8, y - 8, TS + 16, TS + 16);
                    const level = Math.min(LAVA_SIDE_REACH, this.F[idx]);
                    const surfaceHeight = this.D[idx] || level === 0 ? TS : TS * (1 - level / (LAVA_SIDE_REACH + 1));
                    const surfaceY = y + TS - surfaceHeight;
                    ctx.fillStyle = '#d9481b'; ctx.fillRect(x + 2, surfaceY, TS - 4, surfaceHeight - 2);
                    ctx.fillStyle = '#ff7a18'; ctx.beginPath();
                    ctx.moveTo(x + 3, y + TS - 3);
                    ctx.lineTo(x + 12, surfaceY + 9 + Math.sin(this.anim * 4 + tx) * 2);
                    ctx.lineTo(x + 21, y + TS - 3); ctx.lineTo(x + 32, surfaceY + 5);
                    ctx.lineTo(x + 44, y + TS - 3); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(255,218,95,.56)';
                    ctx.fillRect(x + 4, surfaceY + 3, TS - 8, 2);
                    ctx.restore();
                    continue;
                }
                const rockColor = type === 10 ? '#111827' : type === 2 ? '#475569' : color;
                ctx.fillStyle = rockColor; ctx.fillRect(x, y, TS, TS);
                const hash = this.tileHashes[idx];
                ctx.fillStyle = type === 2 ? 'rgba(226,232,240,.13)' : 'rgba(255,211,153,.09)';
                for (let k = 0; k < 4; k++) {
                    const px = x + 5 + ((hash >>> (k * 5)) & 31), py = y + 5 + ((hash >>> (k * 4 + 9)) & 31);
                    ctx.fillRect(px, py, 2 + (k & 1), 2);
                }
                ctx.strokeStyle = 'rgba(0,0,0,.34)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1);
                ctx.strokeStyle = 'rgba(255,240,220,.15)'; ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + TS - 2, y + 2); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 2, y + TS - 2); ctx.stroke();
                if (CRYSTALS[type]) {
                    const cc = CRYSTALS[type].color, cx = x + 24, cy = y + 24, shimmer = 0.85 + Math.sin(this.anim * 3 + idx) * 0.12;
                    const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, 27);
                    halo.addColorStop(0, cc); halo.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.globalAlpha = 0.32 * shimmer; ctx.fillStyle = halo; ctx.fillRect(x - 3, y - 3, TS + 6, TS + 6); ctx.globalAlpha = 1;
                    ctx.fillStyle = cc; ctx.beginPath(); ctx.moveTo(cx, y + 7); ctx.lineTo(x + 39, cy); ctx.lineTo(cx, y + 41); ctx.lineTo(x + 9, cy); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.beginPath(); ctx.moveTo(cx, y + 8); ctx.lineTo(x + 22, cy); ctx.lineTo(x + 11, cy); ctx.closePath(); ctx.fill();
                    if ((hash & 3) === 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + Math.sin(this.anim * 4 + idx) * 7, y + 4); ctx.lineTo(cx, y + 11); ctx.lineTo(cx + 4, y + 7); ctx.stroke(); }
                    ctx.fillStyle = '#071018'; ctx.fillRect(x + 2, y + 33, TS - 4, 14);
                    ctx.fillStyle = '#f8fafc'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center';
                    ctx.fillText(`${CRYSTALS[type].value} pts`, cx, y + 44);
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
            if (this.seenRect(depot.x, depot.y - 140, depot.w, depot.h + 200)) {
                const bob = Math.sin(this.anim * 2.2) * 1.5;
                const cartX = depot.x + 62, cartY = depot.y + 25 + bob, cartW = depot.w - 124, cartH = 48;
                ctx.fillStyle = 'rgba(15,23,42,.3)'; ctx.beginPath(); ctx.ellipse(depot.x + depot.w / 2, groundY - 3, depot.w * 0.43, 9, 0, 0, TAU); ctx.fill();
                ctx.strokeStyle = '#64748b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cartX + 15, groundY - 5); ctx.lineTo(cartX + cartW - 15, groundY - 5); ctx.stroke();
                ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cartX + 12, groundY - 11); ctx.lineTo(cartX + cartW - 12, groundY - 11); ctx.stroke();
                ctx.fillStyle = '#334155'; A.util.roundRect(ctx, cartX, cartY, cartW, cartH, 9); ctx.fill();
                ctx.fillStyle = '#64748b'; A.util.roundRect(ctx, cartX + 5, cartY + 5, cartW - 10, cartH - 10, 6); ctx.fill();
                ctx.fillStyle = '#1e293b'; A.util.roundRect(ctx, cartX + 12, cartY + 9, cartW - 24, cartH - 13, 4); ctx.fill();
                ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cartX + 4, cartY + 8); ctx.lineTo(cartX + 4, cartY + cartH + 4); ctx.lineTo(cartX + cartW - 4, cartY + cartH + 4); ctx.lineTo(cartX + cartW - 4, cartY + 8); ctx.stroke();
                const displayCrystals = Object.values(CRYSTALS);
                for (let i = 0; i < 5; i++) {
                    const crystal = displayCrystals[i % displayCrystals.length], cx = cartX + 38 + i * ((cartW - 76) / 4), cy = cartY + 23 + Math.sin(this.anim * 2.5 + i) * 2;
                    ctx.save(); ctx.shadowColor = crystal.color; ctx.shadowBlur = 12; ctx.fillStyle = crystal.color;
                    ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx, cy + 11); ctx.lineTo(cx - 8, cy); ctx.closePath(); ctx.fill(); ctx.restore();
                }
                for (const wx of [cartX + 34, cartX + cartW - 34]) {
                    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(wx, groundY - 8, 11, 0, TAU); ctx.fill();
                    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(wx, groundY - 8, 7, 0, TAU); ctx.stroke();
                    ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(wx, groundY - 8, 2, 0, TAU); ctx.fill();
                }
                ctx.fillStyle = '#0f172a'; A.util.roundRect(ctx, cartX + cartW / 2 - 85, cartY + 31, 170, 24, 5); ctx.fill();
                ctx.fillStyle = '#fef3c7'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('CRYSTAL DEPOT', cartX + cartW / 2, cartY + 48);
                ctx.fillStyle = '#cbd5e1'; ctx.font = '700 10px system-ui'; if (!s.preview) ctx.fillText('BANK HAUL  /  REFUEL', cartX + cartW / 2, groundY + 20);

                if (!s.preview) {
                    const sign = { x: depot.x + depot.w / 2 - 112, y: depot.y - 126, w: 224, h: 112 };
                    ctx.strokeStyle = '#713f12'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(sign.x + 19, sign.y + sign.h); ctx.lineTo(sign.x + 19, groundY - 8); ctx.moveTo(sign.x + sign.w - 19, sign.y + sign.h); ctx.lineTo(sign.x + sign.w - 19, groundY - 8); ctx.stroke();
                    ctx.fillStyle = '#422f24'; A.util.roundRect(ctx, sign.x, sign.y, sign.w, sign.h, 8); ctx.fill();
                    ctx.fillStyle = '#f5d99e'; A.util.roundRect(ctx, sign.x + 5, sign.y + 5, sign.w - 10, sign.h - 10, 5); ctx.fill();
                    ctx.fillStyle = '#422f24'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('CRYSTAL VALUES / COINS', sign.x + sign.w / 2, sign.y + 19);
                    displayCrystals.forEach((crystal, i) => {
                        const col = i % 2, row = Math.floor(i / 2), x = sign.x + 12 + col * 107, y = sign.y + 30 + row * 23;
                        ctx.fillStyle = crystal.color; ctx.beginPath(); ctx.arc(x + 5, y + 4, 4, 0, TAU); ctx.fill();
                        ctx.fillStyle = '#2d2118'; ctx.textAlign = 'left'; ctx.font = '800 9px system-ui'; ctx.fillText(crystal.name, x + 13, y + 7);
                        ctx.textAlign = 'right'; ctx.font = '900 10px system-ui'; ctx.fillText(`${crystal.value}c`, x + 101, y + 7);
                    });

                }

            }
            for (const r of s.remoteList()) {
                if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || !this.seen(r.x, r.y)) continue;
                A.util.drawFigureSide(ctx, r, r.x, r.y, 26, 40, Number.isFinite(r.f) ? r.f : 1, this.anim + r.x * 0.01, r.a === 1, 0.82);
                const dig = r.ai?.dig;
                if (dig && dig.progress > 0) {
                    const tx = dig.x * TS, ty = dig.y * TS, type = this.tile(dig.x, dig.y);
                    if (this.solid(type) && type !== 10) this.drawMineProgress(ctx, tx, ty, dig.progress / this.digDuration(type, dig.y));
                }
                const digging = Boolean(r.ex?.digging || dig?.progress > 0);
                const angle = digging && Number.isFinite(r.ex?.aim) ? r.ex.aim : digging && dig ? Math.atan2(dig.y * TS + TS / 2 - r.y - 20, dig.x * TS + TS / 2 - r.x - 13) : r.f < 0 ? Math.PI : 0;
                this.drawPickaxe(ctx, r.x + 13, r.y + 22, angle, digging, this.anim);
                const carried = r.ex && Number.isFinite(r.ex.c) ? r.ex.c : 0;
                if (carried && !s.preview) { ctx.fillStyle = '#fbbf24'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`◆ ${carried}`, r.x + 13, r.y + 53); }
                if (!this.s.preview) A.util.nameTag(ctx, r.name || '', r.x + 13, r.y - 12, r.color);
            }
            if (this.dig.tx >= 0 && this.dig.ty >= 0) this.drawMineProgress(ctx, this.dig.tx * TS, this.dig.ty * TS, this.dig.p / this.digDuration(this.tile(this.dig.tx, this.dig.ty), this.dig.ty));
            A.util.drawFigureSide(ctx, s.local, me.x, me.y, me.w, me.h, me.face, this.anim, me.onGround, this.stun > 0 ? 0.72 : 1);
            this.drawPickaxe(ctx, me.x + me.w / 2, me.y + 22, this.dig.p > 0 ? this.aimAngle || 0 : me.face < 0 ? Math.PI : 0, this.dig.p > 0, this.anim);
            if (this.carry > 0) {
                ctx.fillStyle = '#fef3c7'; ctx.font = '900 11px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(`◆ ${this.carry}`, me.x + me.w / 2, me.y - 4);
            }
            if (this.jetting) {
                ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(me.x + 6, me.y + me.h - 4); ctx.lineTo(me.x + 11, me.y + me.h + 17 + Math.sin(this.anim * 28) * 3); ctx.lineTo(me.x + 17, me.y + me.h - 4); ctx.fill();
                ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.moveTo(me.x + 8, me.y + me.h - 1); ctx.lineTo(me.x + 12, me.y + me.h + 10); ctx.lineTo(me.x + 15, me.y + me.h - 1); ctx.fill();
            }
            if (!this.s.preview) A.util.nameTag(ctx, 'You', me.x + me.w / 2, me.y - 12, '#fff');
            this.particles.draw(ctx);
            this.end(ctx);

            const depth = this.depthAt(me.y + me.h);
            const px = w / 2 + (me.x + me.w / 2 - this.camX) * this.zoom;
            const py = h / 2 + (me.y + me.h / 2 - this.camY) * this.zoom;
            // Lantern fog: the deeper you go, the smaller the circle you can see.
            const fog = s.preview ? clamp(depth / 66, 0.03, 0.5) : clamp(0.25 + depth / 14, 0.25, 0.95);
            const inner = (s.preview ? 260 : clamp(230 - depth * 1.4, 150, 230)) * this.zoom;
            const fogA = Math.round(fog * 100) / 100, r = Math.round(inner);
            A.util.radialOverlay(this, 'fogLayer', ctx, px, py, r * 0.45, r * 1.75,
                [[0, 'rgba(255,224,160,.05)'], [0.35, `rgba(2,5,14,${(fogA * 0.35).toFixed(3)})`], [1, `rgba(2,5,14,${fogA})`]], w, h);
            if (s.preview) return;
            s.placeHud(ctx, 0, 0, 230, 34, 'top-center');
            ctx.fillStyle = this.lowFuel ? 'rgba(127,29,29,.9)' : 'rgba(8,12,24,.76)'; A.util.roundRect(ctx, 0, 0, 230, 34, 10); ctx.fill();
            ctx.strokeStyle = this.lowFuel ? 'rgba(248,113,113,.75)' : 'rgba(148,163,184,.35)'; ctx.lineWidth = 1; A.util.roundRect(ctx, .5, .5, 229, 33, 10); ctx.stroke();
            ctx.fillStyle = this.lowFuel ? '#fecaca' : '#cbd5e1'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center';
            ctx.fillText(`DEPTH ${depth * 5}m${this.lowFuel ? ' · LOW FUEL · HEAD UP' : ''}`, 115, 22, 220);
            ctx.restore();
            s.placeHud(ctx, 0, 0, 175, 32, 'top-right');
            ctx.fillStyle = 'rgba(8,12,24,.78)'; A.util.roundRect(ctx, 0, 0, 175, 32, 9); ctx.fill();
            ctx.fillStyle = '#fef3c7'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center';
            ctx.fillText(`HAUL ${this.carry}c  ·  ${this.items}/${this.cap}`, 87, 21, 166);
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
            this.me.x = 400; this.me.y = this.H / 2; this.me.r = 38; this.baseSpeed = 235;
            this.cam.x = this.me.x; this.cam.y = this.me.y;
            this.fish = [];
            for (let i = 0; i < 48; i++) {
                const kind = r();
                const type = kind < 0.55 ? 0 : kind < 0.82 ? 1 : kind < 0.96 ? 2 : 3;
                this.fish.push({ i, type, y0: 300 + r() * (this.H - 600), amp: 20 + r() * 80, fq: 0.4 + r() * 0.8, ph: r() * TAU, x0: r() * this.W, spd: (type === 3 ? 140 : 40 + r() * 80) * (r() < 0.5 ? 1 : -1) });
            }
            this.logs = [];
            for (let i = 0; i < 19; i++) this.logs.push({ y: 360 + r() * (this.H - 720), x0: r() * this.W, spd: 105 + r() * 115, phase: r() * TAU, fq: 0.35 + r() * 0.55, brokenLap: -1 });
            this.rocks = [];
            for (let i = 0; i < 18; i++) this.rocks.push({ x: 600 + r() * (this.W - 900), y: 380 + r() * (this.H - 760), r: 32 + r() * 25 });
            this.pools = [];
            for (let i = 0; i < 3; i++) this.pools.push({ x: 900 + i * 1050 + r() * 300, y: 450 + r() * (this.H - 900), r: 130, phase: r() * TAU, ampX: 60 + r() * 45, ampY: 40 + r() * 35 });
            this.poolHitCd = 0; this.whirlpool = null; this.ejectT = 0;
            this.chests = [];
            for (let i = 0; i < 10; i++) this.chests.push({ i, x: 700 + r() * (this.W - 1000), y: 330 + r() * (this.H - 660), until: 0 });
            this.away = new Map();
            this.duelCd = new Map(); this.duel = null;
            this.cast = null; this.castCd = 0; this.hurt = 0; this.haul = 0; this.catches = 0; this.combo = 0; this.comboT = 0;
            this.surgePush = 0; this.lastSurge = -1;
            this.wake = [];
            this.res = new A.Resource('Energy', '#7dd3fc', 100, 30, 2);
        }

        fishPos(f, now) {
            return { x: mod(f.x0 + f.spd * now, this.W), y: f.y0 + Math.sin(now * f.fq + f.ph) * f.amp };
        }
        fishSpec(type) { return FISH[type]; }

        logPos(log, now) {
            return { x: mod(log.x0 + log.spd * rampDistance(now, 82.5, 0.55), this.W), y: log.y + Math.sin(now * log.fq + log.phase) * 28 };
        }

        logLap(log, now) { return Math.floor((log.x0 + log.spd * rampDistance(now, 82.5, 0.55)) / this.W); }

        logBreakX(log, lap) {
            if (log.breakLap === lap) return log.breakX;
            log.breakLap = lap; log.breakX = Infinity;
            for (let x = lap === 0 ? log.x0 : 0; x < this.W; x += 12) {
                const travel = Math.max(0, (lap * this.W + x - log.x0) / log.spd), cap = 82.5, gain = .55;
                const time = travel <= cap * (1 + gain / 2)
                    ? cap / gain * (Math.sqrt(1 + 2 * gain * travel / cap) - 1)
                    : cap + (travel - cap * (1 + gain / 2)) / (1 + gain);
                const y = log.y + Math.sin(time * log.fq + log.phase) * 28;
                if (this.rocks.some(rock => dist(clamp(rock.x, x - 70, x + 70), clamp(rock.y, y - 18, y + 18), rock.x, rock.y) < rock.r)) {
                    log.breakX = x; break;
                }
            }
            return log.breakX;
        }

        updateLogs(now) {
            for (const log of this.logs) {
                const lap = this.logLap(log, now), pos = this.logPos(log, now);
                if (log.brokenLap === lap) continue;
                if (pos.x >= this.logBreakX(log, lap)) {
                    log.brokenLap = lap;
                    if (this.seen(pos.x, pos.y, 180)) this.particles.burst(pos.x, pos.y, '#d6a56a', 18, 240, .7, 5);
                }
            }
        }

        poolPos(pool, now) {
            return { x: pool.x + Math.sin(now * 0.24 + pool.phase) * pool.ampX, y: pool.y + Math.sin(now * 0.31 + pool.phase * 1.7) * pool.ampY };
        }

        update(dt) {
            const s = this.s, me = this.me, now = clock(s);
            this.ejectT = Math.max(0, this.ejectT - dt);
            this.aimLocked = Boolean(this.whirlpool) || this.ejectT > 0;
            const axis = s.axis(), steering = this.stun <= 0 && !this.whirlpool && Math.hypot(axis.x, axis.y) > 0;
            const canMove = !steering || s.spend(A.ENERGY_COSTS.river.walk * dt);
            this.speedMul = this.whirlpool ? .22 : canMove ? 1 : .08;
            const surge = this.surgeAt(now), shelter = this.bankShelter(me.y);
            if (surge.warning && this.lastSurge !== surge.cycle) {
                this.lastSurge = surge.cycle; s.toast('Wave incoming! Shelter in the pale shallows', '#7dd3fc'); s.sfx('wave', 1000);
            }
            // The same curved crest and footprint drive both the visible wave and its current.
            const separation = (me.x - (this.waveCrest(me.y, now, surge) - 30)) / 110;
            const push = surge.active && !this.whirlpool && Math.abs(separation) < 1
                ? Math.pow(1 - separation * separation, 2) * 280 * shelter : 0;
            this.surgePush = lerp(this.surgePush, push, 1 - Math.exp(-dt * 8));
            if (!shelter || this.whirlpool) this.surgePush = 0;
            const drift = { x: 24 * shelter + this.surgePush, y: 0 };
            this.step(dt, this.ejectT > 0 ? 240 : 1800, drift);
            this.updateLogs(now);
            this.castCd -= dt; this.hurt = Math.max(0, this.hurt - dt); this.comboT -= dt; this.poolHitCd = Math.max(0, this.poolHitCd - dt);
            if (this.comboT <= 0) this.combo = 0;
            const nearBank = me.y < this.bank + 80 || me.y > this.H - this.bank - 80;
            // banks
            if (me.y < this.bank + me.r) { me.y = this.bank + me.r; me.vy = Math.max(0, me.vy); }
            if (me.y > this.H - this.bank - me.r) { me.y = this.H - this.bank - me.r; me.vy = Math.min(0, me.vy); }
            for (const rock of this.rocks) {
                const d = dist(me.x, me.y, rock.x, rock.y) || 1;
                if (d < rock.r + me.r) {
                    me.x = rock.x + (me.x - rock.x) / d * (rock.r + me.r); me.y = rock.y + (me.y - rock.y) / d * (rock.r + me.r); me.vx *= 0.5; me.vy *= 0.5;
                    if (this.hurt <= 0) { this.hurt = 1; this.loseFish(); this.particles.burst(me.x, me.y, '#94a3b8', 10, 160, 0.4, 3); }
                }
            }
            for (const lg of this.logs) {
                if (lg.brokenLap === this.logLap(lg, now)) continue;
                const pos = this.logPos(lg, now);
                const rect = { x: pos.x - 70, y: pos.y - 18, w: 140, h: 36 };
                if (pushCircleOutOfRect(me, rect) && this.hurt <= 0) { this.hurt = 1; me.vx = 160; this.loseFish(); this.particles.burst(me.x, me.y, '#a16207', 10, 160, 0.4, 3); }
            }
            this.duelCheck(now);
            if (this.whirlpool) {
                const spin = this.whirlpool, pos = this.poolPos(spin.pool, now);
                spin.t += dt; spin.angle += dt * (5 + spin.t * 3);
                const radius = Math.max(24, spin.radius * (1 - spin.t / 1.4));
                const axis = s.axis();
                me.x = pos.x + Math.cos(spin.angle) * radius + axis.x * 7;
                me.y = pos.y + Math.sin(spin.angle) * radius + axis.y * 7;
                me.aim = spin.angle + Math.PI / 2;
                me.vx = me.vy = 0;
                if (spin.t >= 1.4) {
                    me.x = pos.x + Math.cos(spin.angle) * (spin.pool.r * 1.8 + me.r);
                    me.y = clamp(pos.y + Math.sin(spin.angle) * (spin.pool.r * 1.8 + me.r), this.bank + me.r, this.H - this.bank - me.r);
                    me.vx = Math.cos(spin.angle) * 760; me.vy = Math.sin(spin.angle) * 760;
                    this.whirlpool = null; this.ejectT = .65; this.poolHitCd = 2.5;
                    s.sfx('splash');
                    this.particles.burst(me.x, me.y, '#e0f2fe', 24, 300, .6, 4);
                }
            }
            for (const pool of this.pools) {
                if (nearBank || this.whirlpool || this.poolHitCd > 0) continue;
                const pos = this.poolPos(pool, now), dx = pos.x - me.x, dy = pos.y - me.y;
                const d = Math.hypot(dx, dy) || 1, pullRadius = pool.r * 1.7;
                if (d < pullRadius) {
                    const strength = (1 - d / pullRadius) * (420 + Math.min(now, 120) * 2.5) * dt;
                    me.vx += (dx / d - dy / d * 0.85) * strength;
                    me.vy += (dy / d + dx / d * 0.85) * strength;
                }
                if (d < pool.r * .85) {
                    this.whirlpool = { pool, t: 0, radius: d, angle: Math.atan2(me.y - pos.y, me.x - pos.x) };
                    s.sfx('whirlpool', 1200);
                    const lost = Math.min(this.haul, Math.ceil(this.haul * 0.12));
                    if (lost) { this.haul -= lost; s.addScore(-lost); this.catches = Math.max(0, this.catches - 1); }
                    s.toast(lost ? `Whirlpool! Hold on — lost ${lost} fish pts` : 'Whirlpool! Hold on for the launch', '#a5f3fc');
                    this.particles.burst(me.x, me.y, '#67e8f9', 16, 220, 0.55, 4);
                }
            }
            // Whirlpool launches and collision corrections must also keep the entire hull in water.
            for (let pass = 0; pass < 3; pass++) {
                for (const rock of this.rocks) {
                    const dx = me.x - rock.x, dy = me.y - rock.y, d = Math.hypot(dx, dy);
                    if (d < rock.r + me.r) {
                        const radius = rock.r + me.r;
                        me.x = rock.x + (d ? dx / d : 1) * radius;
                        me.y = rock.y + (d ? dy / d : 0) * radius;
                    }
                }
                for (const log of this.logs) {
                    if (log.brokenLap === this.logLap(log, now)) continue;
                    const pos = this.logPos(log, now);
                    pushCircleOutOfRect(me, { x: pos.x - 70, y: pos.y - 18, w: 140, h: 36 });
                }
                me.x = clamp(me.x, me.r, this.W - me.r);
                me.y = clamp(me.y, this.bank + me.r, this.H - this.bank - me.r);
            }
            if (this.moving && Math.random() < dt * 14) this.wake.push({ x: me.x - Math.cos(me.aim) * 16, y: me.y - Math.sin(me.aim) * 16, t: 0 });
            for (const w of this.wake) w.t += dt;
            this.wake = this.wake.filter(w => w.t < 1);

            // net casting
            const m = this.mouseWorld();
            if (s.mouse.pressed && this.castCd <= 0 && !this.cast && s.spend(A.ENERGY_COSTS.river.cast)) {
                const ang = Math.atan2(m.y - me.y, m.x - me.x);
                const d = Math.min(320, dist(m.x, m.y, me.x, me.y));
                this.cast = { x: me.x + Math.cos(ang) * d, y: me.y + Math.sin(ang) * d, fromX: me.x, fromY: me.y, t: 0 };
                this.castCd = 1.1; s.sfx('cast');
            }
            if (this.cast) {
                this.cast.t += dt;
                if (this.cast.t >= .24 && !this.cast.landed) { this.cast.landed = true; s.sfx('splash'); this.particles.burst(this.cast.x, this.cast.y, '#e0f2fe', 10, 90, .4, 3); }
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
                        s.sfx('catch');
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
                    if (opened) { c.until = now + 1; s.emit({ k: 'ch', i: c.i, u: +(now + 1).toFixed(1) }); }
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
        bankShelter(y) {
            const k = clamp((Math.min(y - this.bank, this.H - this.bank - y) - 80) / 100, 0, 1);
            return k * k * (3 - 2 * k);
        }
        waveCrest(y, time, surge = this.surgeAt(time)) { return surge.x + Math.sin(y * .025 + time * 5) * 20; }
        surgeAt(time) {
            const phase = ((time % 38) + 38) % 38;
            return { cycle: Math.floor(time / 38), warning: phase >= 25 && phase < 28, active: phase >= 28 && phase < 36,
                x: (phase - 28) / 8 * (this.W + 500) - 250 };
        }
        touchLayout() { return { stick: true, buttons: [] }; }
        hint() { return 'WASD steer (2 Energy/s) \u00b7 click to cast (4 Energy) \u00b7 pale shallows shelter from waves \u00b7 Q recharge'; }
        ex() { return { n: this.cast ? 1 : 0 }; }

        draw(ctx, w, h) {
            const s = this.s, me = this.me, now = clock(s), t = this.anim;
            ctx.fillStyle = '#0c4a6e'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h);
            A.util.bandGradient(ctx, this.x0, this.bank, this.x1 - this.x0, this.H - this.bank * 2, [[0, '#0e7490'], [0.5, '#0891b2'], [1, '#0e7490']]);
            ctx.fillStyle = '#49b4b9';
            ctx.fillRect(this.x0, this.bank, this.x1 - this.x0, 80);
            ctx.fillRect(this.x0, this.H - this.bank - 80, this.x1 - this.x0, 80);
            for (let x = Math.floor(this.x0 / 520) * 520; x < this.x1; x += 520) {
                for (const y of [this.bank + 18, this.H - this.bank - 56]) {
                    ctx.fillStyle = '#946947'; ctx.fillRect(x + 40, y, 90, 38);
                    ctx.fillStyle = '#c59a70';
                    for (let i = 0; i < 5; i++) ctx.fillRect(x + 42 + i * 18, y + 2, 14, 34);
                }
            }
            ctx.strokeStyle = 'rgba(224,242,254,.22)'; ctx.lineWidth = 2;
            for (let y = Math.ceil((this.y0 - 0) / 70) * 70; y < this.y1; y += 70) {
                if (y < this.bank || y > this.H - this.bank) continue;
                ctx.beginPath();
                for (let x = this.x0; x <= this.x1; x += 40) { const yy = y + Math.sin((x - now * 24) / 60 + y) * 6; if (x === this.x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
                ctx.stroke();
            }
            for (const [top, y0] of [[true, 0], [false, this.H - this.bank]]) {
                if (!this.seenRect(this.x0, y0 - 20, this.x1 - this.x0, this.bank + 40, 0)) continue;
                ctx.fillStyle = '#365314'; ctx.fillRect(this.x0, y0, this.x1 - this.x0, this.bank);
                ctx.fillStyle = '#4d7c0f'; ctx.fillRect(this.x0, top ? this.bank - 36 : y0, this.x1 - this.x0, 36);
                for (let x = Math.floor(this.x0 / 28) * 28; x < this.x1; x += 28) {
                    const seed = A.util.hashStr(`bank:${x}:${top}`), gy = top ? this.bank - 18 - seed % 110 : y0 + 18 + seed % 110;
                    ctx.strokeStyle = ['#65a30d', '#84cc16', '#3f6212'][seed % 3]; ctx.lineWidth = 2; ctx.beginPath();
                    for (let i = -1; i <= 1; i++) {
                        ctx.moveTo(x + i * 4, gy + 8); ctx.quadraticCurveTo(x + i * 5 + Math.sin(t * 1.5 + x) * 3, gy - 4, x + i * 8, gy - 9 - (seed % 9));
                    }
                    ctx.stroke();
                    if (seed % 11 === 0) { ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(x, gy - 8, 3, 0, TAU); ctx.fill(); }
                }
            }
            const surge = this.surgeAt(now);
            if (surge.active && this.seen(surge.x, this.H / 2, this.H)) {
                const gradient = ctx.createLinearGradient(surge.x - 160, 0, surge.x + 100, 0);
                gradient.addColorStop(0, 'rgba(14,116,144,0)'); gradient.addColorStop(.6, 'rgba(125,211,252,.5)'); gradient.addColorStop(1, 'rgba(224,242,254,.15)');
                const top = this.bank + 80, bottom = this.H - this.bank - 80;
                ctx.fillStyle = gradient; ctx.beginPath();
                for (let y = top; y <= bottom; y += 10) {
                    const x = this.waveCrest(y, now, surge) - 140 * this.bankShelter(y);
                    if (y === top) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                for (let y = bottom; y >= top; y -= 10) ctx.lineTo(this.waveCrest(y, now, surge) + 80 * this.bankShelter(y), y);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 5; ctx.beginPath();
                for (let y = top; y <= bottom; y += 10) {
                    const x = this.waveCrest(y, now, surge);
                    if (y === top) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
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
            for (const wk of this.wake) { if (!this.seen(wk.x, wk.y, 24)) continue; ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - wk.t)})`; ctx.beginPath(); ctx.arc(wk.x, wk.y, 6 + wk.t * 12, 0, TAU); ctx.fill(); }
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
                ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(2, -kind.r * .28, kind.r * .8, kind.r * .22, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = kind.color; ctx.beginPath(); ctx.moveTo(-4, -kind.r * .5); ctx.lineTo(-10, -kind.r * 1.3); ctx.lineTo(7, -kind.r * .5); ctx.fill();
                ctx.strokeStyle = 'rgba(15,23,42,.45)'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(kind.r * .45, 0, kind.r * .4, Math.PI * .55, Math.PI * 1.45); ctx.stroke();
                for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-kind.r * .6 + i * kind.r * .4, 1, kind.r * .2, -.9, .9); ctx.stroke(); }
                ctx.restore();
            }
            for (const rock of this.rocks) {
                if (!this.seen(rock.x, rock.y)) continue;
                ctx.strokeStyle = 'rgba(224,242,254,.45)'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.ellipse(rock.x - 3, rock.y + 8, rock.r + 10, rock.r * .8, 0, 0, TAU); ctx.stroke();
                ctx.fillStyle = '#475569'; ctx.beginPath();
                for (let i = 0; i < 7; i++) {
                    const a = i * TAU / 7, radius = rock.r * (i % 2 ? .91 : 1);
                    const x = rock.x + Math.cos(a) * radius, y = rock.y + Math.sin(a) * radius;
                    if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.ellipse(rock.x - rock.r * .18, rock.y - rock.r * .25, rock.r * .6, rock.r * .35, -.3, 0, TAU); ctx.fill();
            }
            for (const lg of this.logs) {
                if (lg.brokenLap === this.logLap(lg, now)) continue;
                const pos = this.logPos(lg, now), x = pos.x, y = pos.y;
                if (!this.seen(x, y, 120)) continue;
                ctx.fillStyle = '#78350f'; roundRect(ctx, x - 70, y - 18, 140, 36, 16); ctx.fill();
                ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.ellipse(x + 66, y, 7, 14, 0, 0, TAU); ctx.fill();
                ctx.strokeStyle = '#d6a56a'; ctx.lineWidth = 2;
                for (const offset of [-8, 6]) { ctx.beginPath(); ctx.moveTo(x - 56, y + offset); ctx.quadraticCurveTo(x, y + offset - 4, x + 50, y + offset); ctx.stroke(); }
                ctx.strokeStyle = '#713f12'; ctx.beginPath(); ctx.ellipse(x + 66, y, 3, 8, 0, 0, TAU); ctx.stroke();
            }
            for (const c of this.chests) {
                if (c.until > now || !this.seen(c.x, c.y)) continue;
                this.qMark(ctx, c.x, c.y + Math.sin(t * 2 + c.i) * 4, '#7c3aed', t);
            }
            if (this.cast) {
                const k = clamp((this.cast.t - .24) / .36, 0, 1), flight = clamp(this.cast.t / .24, 0, 1);
                const bx = this.cast.fromX + (this.cast.x - this.cast.fromX) * flight;
                const by = this.cast.fromY + (this.cast.y - this.cast.fromY) * flight - Math.sin(flight * Math.PI) * 65;
                ctx.strokeStyle = '#e8bd82'; ctx.lineWidth = 2; ctx.beginPath();
                ctx.moveTo(me.x, me.y); ctx.quadraticCurveTo((me.x + bx) / 2, Math.min(me.y, by) - 20, bx, by); ctx.stroke();
                ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill();
                if (flight === 1) {
                ctx.strokeStyle = 'rgba(254,243,199,.9)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
                ctx.beginPath(); ctx.arc(this.cast.x, this.cast.y, 78 * Math.min(1, k * 1.2), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
                for (let i = 0; i < 8; i++) {
                    const angle = i * TAU / 8; ctx.beginPath(); ctx.moveTo(this.cast.x, this.cast.y);
                    ctx.lineTo(this.cast.x + Math.cos(angle) * 78 * k, this.cast.y + Math.sin(angle) * 78 * k); ctx.stroke();
                }
                }
            }
            const boat = (x, y, aim) => {
                ctx.save(); ctx.translate(x, y); ctx.rotate(aim);
                ctx.fillStyle = '#713f12'; ctx.beginPath(); ctx.moveTo(36, 0);
                ctx.quadraticCurveTo(12, -23, -29, -15); ctx.quadraticCurveTo(-39, 0, -29, 15);
                ctx.quadraticCurveTo(12, 23, 36, 0); ctx.fill();
                ctx.strokeStyle = '#e8bd82'; ctx.lineWidth = 3; ctx.stroke();
                ctx.fillStyle = '#b77942'; ctx.beginPath(); ctx.ellipse(-2, 0, 24, 11, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#e8bd82'; ctx.fillRect(-16, -12, 5, 24); ctx.fillRect(14, -10, 5, 20);
                ctx.restore();
            };
            for (const r of s.remoteList()) { if (this.seen(r.x, r.y)) boat(r.x, r.y, r.f || 0); }
            boat(me.x, me.y, me.aim);
            this.drawPlayers(ctx);
            const mw = this.mouseWorld();
            if (!s.preview && !s.question) {
                const ang = Math.atan2(mw.y - me.y, mw.x - me.x), d = Math.min(320, dist(mw.x, mw.y, me.x, me.y));
                this.ring(ctx, me.x + Math.cos(ang) * d, me.y + Math.sin(ang) * d, 78, this.castCd > 0 ? 'rgba(255,255,255,.18)' : 'rgba(254,243,199,.65)', 2);
            }
            this.particles.draw(ctx);
            this.end(ctx);
            if (!s.preview && this.hurt > 0) { ctx.fillStyle = `rgba(248,113,113,${this.hurt * 0.25})`; ctx.fillRect(0, 0, w, h); }
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
                b.door = { x: x + 50, y: y + BH - 50 };
                this.blocks.push(b);
                this.walls.push({ x: x + 80, y, w: BW - 160, h: BH },
                    { x, y: y + 80, w: 80, h: BH - 160 }, { x: x + BW - 80, y: y + 80, w: 80, h: BH - 160 });
            }
            this.shops = this.blocks.filter(b => b.shop);
            this.houses = this.blocks.filter(b => !b.shop);
            this.cars = [];
            for (let k = 0; k < BR + 1; k++) for (let j = 0; j < 2 + k % 2; j++) this.cars.push({ horiz: true, c: ROAD / 2 + k * (BH + ROAD), p0: r() * this.W, spd: (165 + r() * 95) * (j % 2 ? -1 : 1), lane: (j % 2 ? -1 : 1) * (36 + Math.floor(j / 2) * 20), phase: r() * TAU, color: ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316'][Math.floor(r() * 5)] });
            for (let k = 0; k < BC + 1; k++) for (let j = 0; j < 2 + k % 2; j++) this.cars.push({ horiz: false, c: ROAD / 2 + k * (BW + ROAD), p0: r() * this.H, spd: (165 + r() * 95) * (j % 2 ? -1 : 1), lane: (j % 2 ? -1 : 1) * (36 + Math.floor(j / 2) * 20), phase: r() * TAU, color: ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316'][Math.floor(r() * 5)] });
            this.vending = this.blocks.map((b, i) => ({ i, x: b.x + 50, y: b.y + 50, until: 0 }));
            this.roadsX = Array.from({ length: BC + 1 }, (_, i) => ROAD / 2 + i * (BW + ROAD));
            this.roadsY = Array.from({ length: BR + 1 }, (_, i) => ROAD / 2 + i * (BH + ROAD));
            this.trees = [];
            for (const b of this.blocks) for (let k = 0; k < 4; k++) this.trees.push({ x: b.x + (k % 2 ? b.w + 30 : -30), y: b.y + (k < 2 ? 20 : b.h - 20) + r() * 40, r: 12 + r() * 6 });
            this.scoreGoal = false; this.goalUnit = 'deliveries'; this.goalLabel = 'Deliveries';
            this.me.x = this.W / 2; this.me.y = ROAD / 2 + BH + ROAD; this.cam.x = this.me.x; this.cam.y = this.me.y;
            this.baseSpeed = 245; this.boost = 0;
            this.res = new A.Resource('Energy', '#38bdf8', 100, 40, 2);
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
                c.fillStyle = '#737d85'; c.fillRect(b.x - 12, b.y - 12, b.w + 24, b.h + 24);
                c.fillStyle = '#b4bbc1'; c.fillRect(b.x - 9, b.y - 9, b.w + 18, b.h + 18);
                c.strokeStyle = '#939da6'; c.lineWidth = 1;
                for (let x = b.x - 8; x < b.x + b.w + 8; x += 22) { c.beginPath(); c.moveTo(x, b.y - 8); c.lineTo(x, b.y + b.h + 8); c.stroke(); }
                for (let y = b.y - 8; y < b.y + b.h + 8; y += 22) { c.beginPath(); c.moveTo(b.x - 8, y); c.lineTo(b.x + b.w + 8, y); c.stroke(); }
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
                c.fillStyle = '#172a3a'; c.fillRect((b.x + b.w / 2) - 15, b.y + b.h - 26, 30, 26);
                c.fillStyle = '#e4c38b'; c.fillRect((b.x + b.w / 2) + 8, b.y + b.h - 12, 3, 3);
                c.fillStyle = b.shop ? '#78350f' : '#334155';
                roundRect(c, (b.x + b.w / 2) - 66, b.y + b.h - 65, 132, 23, 4); c.fill();
                c.font = '900 13px system-ui'; c.textAlign = 'center'; c.fillStyle = '#fff4cd';
                c.fillText(b.shop ? 'PARCEL & PANTRY' : `No. ${index + 12}`, (b.x + b.w / 2), b.y + b.h - 49);
                if (b.shop) for (let j = 0; j < 8; j++) {
                    c.fillStyle = j % 2 ? '#fff4df' : '#e05252'; c.fillRect((b.x + b.w / 2) - 64 + j * 16, b.y + b.h - 35, 16, 17);
                    c.fillStyle = j % 2 ? '#ddd1be' : '#b53636'; c.fillRect((b.x + b.w / 2) - 64 + j * 16, b.y + b.h - 18, 16, 6);
                }
                const benchX = b.x + 42, benchY = b.y - 16;
                c.fillStyle = '#384552'; c.fillRect(benchX - 4, benchY - 6, 5, 19); c.fillRect(benchX + 42, benchY - 6, 5, 19);
                c.fillStyle = '#987452'; for (let j = 0; j < 3; j++) c.fillRect(benchX, benchY - 5 + j * 5, 42, 3);
                c.fillStyle = '#283645'; c.fillRect(b.x + b.w - 22, b.y - 22, 4, 25);
                c.fillStyle = '#fff3bb'; c.beginPath(); c.arc(b.x + b.w - 20, b.y - 22, 5, 0, TAU); c.fill();
                c.fillStyle = '#36634b'; c.fillRect(b.x + b.w - 15, b.y + b.h + 4, 28, 12);
                c.fillStyle = '#e596a6'; for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(b.x + b.w - 12 + j * 7, b.y + b.h + 8, 3, 0, TAU); c.fill(); }
            });
            for (const b of this.blocks) for (const [ox, oy] of [[0, 0], [b.w - 80, 0], [0, b.h - 80], [b.w - 80, b.h - 80]]) {
                c.save(); c.translate(ox, oy);
                c.fillStyle = '#aeb9b3'; c.fillRect(b.x, b.y, 80, 80);
                c.strokeStyle = '#87958e'; c.lineWidth = 1;
                for (let i = 20; i < 80; i += 20) {
                    c.beginPath(); c.moveTo(b.x + i, b.y); c.lineTo(b.x + i, b.y + 80); c.stroke();
                    c.beginPath(); c.moveTo(b.x, b.y + i); c.lineTo(b.x + 80, b.y + i); c.stroke();
                }
                c.fillStyle = '#20382e'; c.fillRect(b.x + 60, b.y + 8, 12, 62);
                c.fillStyle = '#4b9566'; c.fillRect(b.x + 62, b.y + 10, 8, 58);
                c.fillStyle = '#79593f'; c.fillRect(b.x + 8, b.y + 63, 44, 8);
                c.fillStyle = '#d7b187'; c.fillRect(b.x + 8, b.y + 61, 44, 3);
                c.restore();
            }
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
            const lane = c.lane;
            return c.horiz ? { x: along - 38, y: c.c + lane - 17, w: 76, h: 34 } : { x: c.c + lane - 17, y: along - 38, w: 34, h: 76 };
        }

        update(dt) {
            const s = this.s, me = this.me, now = clock(s);
            const axis = s.axis(), active = this.stun <= 0 && Math.hypot(axis.x, axis.y) > 0;
            const wantsSprint = s.down('ShiftLeft', 'ShiftRight') && active;
            const cost = (wantsSprint ? A.ENERGY_COSTS.market.sprint : A.ENERGY_COSTS.market.walk) * dt;
            const unlimited = s.preview || s.testing;
            const winded = active && !unlimited && !this.res.has(cost);
            const sprint = wantsSprint && !winded;
            if (active && !unlimited) {
                this.res.drain(cost);
                if (winded) s.spend(1);
            }
            this.boost = Math.max(0, this.boost - dt);
            this.hitCd = Math.max(0, this.hitCd - dt);
            this.speedMul = (winded ? 0.5 : sprint ? 1.5 : 1) * (this.boost > 0 ? 1.35 : 1);
            this.step(dt);
            const hit = { x: me.x - 12, y: me.y - 12, w: 24, h: 24 };
            if (this.hitCd <= 0 && this.stun <= 0) {
                for (const c of this.cars) {
                    const rect = this.carHitRect(c, now);
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
                    if (dist(me.x, me.y, shop.door.x, shop.door.y) < 24) {
                        const to = this.houses[Math.floor(Math.random() * this.houses.length)];
                        this.pkg = { to, from: shop, t: 0 };
                        s.toast('Package picked up — deliver it to the marked house!', '#fbbf24');
                        break;
                    }
                }
            } else {
                this.pkg.t += dt;
                const d = this.pkg.to.door;
                if (dist(me.x, me.y, d.x, d.y) < 24) {
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
                if (v.until > now || dist(me.x, me.y, v.x, v.y) > 24) continue;
                const opened = s.ask(correct => {
                    if (correct) { s.addScore(40); this.cash += 40; this.earned += 40; this.boost = 8; s.refill(); s.toast('Snack break: +$40 and a speed boost!', '#38bdf8'); }
                    else if (correct === false) s.toast('Machine ate your coin.', '#f87171');
                });
                if (opened) v.until = now + 1;
            }
            s.setGoal(this.deliveries);
        }

        ex() { return { p: this.pkg ? 1 : 0 }; }
        goalText() { return `${this.deliveries} deliveries · $${this.cash} cash · streak ${this.streak}`; }
        touchLayout() { return { stick: true, buttons: [{ k: 'ShiftLeft', label: 'Sprint', cls: 'main' }] }; }
        hint() { return 'WASD move · Shift sprint · deliver to marked houses · building recesses shelter you from traffic · Q recharge anywhere'; }

        draw(ctx, w, h) {
            const s = this.s, me = this.me, now = clock(s), t = this.anim;
            ctx.fillStyle = '#334155'; ctx.fillRect(0, 0, w, h);
            this.begin(ctx, w, h, w < 600 ? 640 : 820);
            if (!this.cityLayer) this.buildCityLayer();
            const cx = Math.max(0, Math.floor(this.x0)), cy = Math.max(0, Math.floor(this.y0));
            const cw = Math.min(this.W, Math.ceil(this.x1)) - cx, ch = Math.min(this.H, Math.ceil(this.y1)) - cy;
            if (cw > 0 && ch > 0) ctx.drawImage(this.cityLayer, cx, cy, cw, ch, cx, cy, cw, ch);
            for (const shop of this.shops) {
                if (this.pkg || !this.seen(shop.door.x, shop.door.y)) continue;
                this.ring(ctx, shop.door.x, shop.door.y, 24 + Math.sin(t * 5) * 2, '#fde047', 4);
                ctx.fillStyle = '#fde047'; ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; if (!s.preview) ctx.fillText('PICK UP', shop.door.x, shop.door.y + 5);
            }
            if (this.pkg) {
                const d = this.pkg.to.door;
                this.ring(ctx, d.x, d.y, 24 + Math.sin(t * 6) * 2, '#4ade80', 5);
                ctx.fillStyle = '#4ade80'; ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; if (!s.preview) ctx.fillText('DELIVER', d.x, d.y + 5);
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
                if (!s.preview && dist(me.x, me.y, rect.x + rect.w / 2, rect.y + rect.h / 2) < 155) {
                    const pulse = 0.62 + Math.sin(t * 10) * 0.28;
                    ctx.fillStyle = `rgba(127,29,29,${pulse})`; ctx.beginPath(); ctx.arc(rect.x + rect.w / 2, rect.y - 11, 10, 0, TAU); ctx.fill();
                    ctx.fillStyle = '#fff7ed'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', rect.x + rect.w / 2, rect.y - 6);
                }
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

    Object.assign(A.games, { miner: Miner, river: River, market: Market });
    A.Arena = Arena;
})(window);
