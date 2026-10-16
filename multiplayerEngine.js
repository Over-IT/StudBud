(function (window) {
    'use strict';

    const TAU = Math.PI * 2;
    const GAME_GOALS = {
        skyline: 'Reach the summit before the rising tide',
        duel: 'Hold the glowing hill alone to earn time',
        river: 'Catch valuable fish and avoid river hazards',
        market: 'Deliver packages to marked destinations',
        miner: 'Mine crystals and return them to base',
        sports: 'Score in the opposing team goal',
        chess: 'Checkmate the opposing king',
        defense: 'Defend your team base and send enemies until the rival base reaches 0 HP',
        crypto: 'Grow your portfolio by trading and mining',
        frenzy: 'Score by answering quickly and accurately',
        fishing: 'Catch fish to build the most valuable haul',
        hack: 'Hack terminals to earn the most payouts'
    };
    const sfx = (name, gap) => { if (window.StudBudArcade?.previewDepth > 0) return; try { window.StudBudSfx?.play(name, 'game', gap); } catch (error) { /* audio is optional */ } };
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    const normalizeChoiceText = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

    function accountTagMarkup(username, tags = []) {
        const name = String(username ?? '').trim().toLowerCase();
        const markup = [];
        if (name === 'overit') markup.push('<span class="account-tag account-tag-owner">Owner</span>');
        else if (name === 'andy') markup.push('<span class="account-tag account-tag-co-owner">Co-owner</span>');
        const labels = { teacher: ['Teacher', 'teacher'], tester: ['Tester', 'tester'], moderator: ['Moderator', 'moderator'], pchs: ['PCHS', 'school'], pnhs: ['PNHS', 'school'], pshs: ['PSHS', 'school'], pwhs: ['PWHS', 'school'] };
        for (const tag of [...new Set(Array.isArray(tags) ? tags : [])]) {
            const item = labels[tag];
            if (item) markup.push(`<span class="account-tag account-tag-${item[1]}">${item[0]}</span>`);
        }
        return markup.join(' ');
    }

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

    // Pinch / double-tap zoom breaks game layouts on phones, so block it while a game is on screen.
    const GAME_SURFACES = '.mpg-overlay, #arcade-canvas-container, #waiting-runner-canvas, #game-canvas';
    const inGame = target => document.body.classList.contains('mpg-active') || Boolean(target?.closest?.(GAME_SURFACES));
    let savedViewport = null;
    function lockViewportZoom(on) {
        const meta = document.querySelector('meta[name="viewport"]');
        if (!meta) return;
        if (on) {
            if (savedViewport === null) savedViewport = meta.getAttribute('content') || '';
            meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
        } else if (savedViewport !== null) {
            meta.setAttribute('content', savedViewport);
            savedViewport = null;
        }
    }
    if (!window.__studbudZoomGuard) {
        window.__studbudZoomGuard = true;
        const block = e => { if (inGame(e.target)) e.preventDefault(); };
        ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => document.addEventListener(type, block, { passive: false }));
        document.addEventListener('touchmove', e => { if (e.touches.length > 1 && inGame(e.target)) e.preventDefault(); }, { passive: false });
        document.addEventListener('dblclick', block, { passive: false });
        document.addEventListener('wheel', e => { if (e.ctrlKey && inGame(e.target)) e.preventDefault(); }, { passive: false });
        let lastTouchEnd = 0;
        document.addEventListener('touchend', e => {
            const now = performance.now();
            // A quick second tap on a game surface (not a button) would otherwise double-tap-zoom on iOS.
            if (now - lastTouchEnd < 320 && inGame(e.target) && !e.target.closest?.('button, input, select, textarea, a')) e.preventDefault();
            lastTouchEnd = now;
        }, { passive: false });
    }

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
        const position = clamp((cx - s.x) / s.w, 0, 1);
        const t = clamp((position - (s.curveStart || 0)) / ((s.curveEnd ?? 1) - (s.curveStart || 0)), 0, 1);
        if (s.curve === 'arch') return s.y + s.h * (1 - Math.sin(t * Math.PI));
        const u = s.curve === 'ease' ? t * t * (3 - 2 * t) : t;
        return s.slope > 0 ? s.y + s.h - u * s.h : s.y + u * s.h;
    }

    function slopeSurface(s, x, w) {
        const left = clamp(x, s.x, s.x + s.w), right = clamp(x + w, s.x, s.x + s.w);
        let top = Math.min(slopeY(s, left), slopeY(s, right));
        const peak = s.x + s.w * ((s.curveStart || 0) + (s.curveEnd ?? 1)) / 2;
        if (s.curve === 'arch' && left <= peak && right >= peak) top = s.y;
        return top;
    }

    class VerticalIndex {
        constructor(items, bounds = item => item) {
            this.items = items;
            this.count = items.length;
            this.bounds = bounds;
            this.buckets = new Map();
            this.broad = [];
            this.result = [];
            this.indices = [];
            this.matches = new Set();
            items.forEach((item, index) => {
                const rect = bounds(item), first = Math.floor(rect.y / 256), last = Math.floor((rect.y + rect.h) / 256);
                if ((item.mover && !item.lane) || last - first > 128) { this.broad.push(index); return; }
                for (let band = first; band <= last; band++) {
                    if (!this.buckets.has(band)) this.buckets.set(band, []);
                    this.buckets.get(band).push(index);
                }
            });
        }
        query(top, bottom) {
            if (this.items.length !== this.count) Object.assign(this, new VerticalIndex(this.items, this.bounds));
            this.matches.clear();
            for (const index of this.broad) this.matches.add(index);
            for (let band = Math.floor(top / 256); band <= Math.floor(bottom / 256); band++) {
                for (const index of this.buckets.get(band) || []) this.matches.add(index);
            }
            this.result.length = 0;
            this.indices.length = 0;
            for (const index of this.matches) this.indices.push(index);
            this.indices.sort((a, b) => a - b);
            for (const index of this.indices) this.result.push(this.items[index]);
            return this.result;
        }
    }

    // Axis-aligned body vs. rectangles. Solids may carry dx/dy (moving platforms) and `oneway`/`off` flags.
    const STEP_UP = 10, CORNER_NUDGE = 8;
    const clearAt = (x, y, b, solids, ignore) => {
        for (const s of solids) if (s !== ignore && !s.oneway && !s.off && x < s.x + s.w && x + b.w > s.x && y < s.y + s.h && y + b.h > s.y) return false;
        return true;
    };
    function moveBody(b, solids, dt) {
        const steps = Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) * dt / 12);
        if (steps > 1) {
            let wall = 0;
            for (let i = 0; i < steps; i++) { moveBody(b, solids, dt / steps); wall = b.wall || wall; }
            b.wall = b.wall || wall;
            return;
        }
        if (solids.spatialIndex?.items === solids) {
            solids = solids.spatialIndex.query(Math.min(b.y, b.y + b.vy * dt) - 256, Math.max(b.y + b.h, b.y + b.h + b.vy * dt) + 256);
        }
        const prevX = b.x, prevY = b.y, prevGround = b.ground;
        b.onGround = false;
        b.wall = 0;
        b.ground = null;
        b.x += b.vx * dt;
        if (prevGround?.slope && !prevGround.off && b.vy >= 0 && b.x + b.w > prevGround.x && b.x < prevGround.x + prevGround.w) {
            b.y = slopeSurface(prevGround, b.x, b.w) - b.h;
        }
        for (const s of solids) {
            if (s.oneway || s.off || s.slope || !overlap(b, s)) continue;
            // walking into a lip a few pixels tall steps onto it instead of stopping dead, and a platform that rose into
            // your feet this frame lifts you rather than shoving you sideways off its end
            const lip = b.y + b.h - s.y;
            // feet sitting a rounding error inside the deck are standing on it, not inside it
            if (lip <= .01) continue;
            const rose = (s.mover || s.dy) && lip <= Math.max(0, -(s.dy || 0)) + 2;
            if (lip > 0 && (rose || (prevGround && b.vy >= 0 && b.vx !== 0 && lip <= STEP_UP)) && clearAt(b.x, s.y - b.h, b, solids, s)) {
                b.y = s.y - b.h; if (b.vy > 0) b.vy = 0;
                if (rose && b.vy === 0) { b.onGround = true; b.ground = s; }
                continue;
            }
            // resolve by motion relative to the solid, so a cart sliding into you pushes you along its travel
            const relative = b.vx * dt - (s.dx || 0);
            if (relative > 0 || (relative === 0 && b.x + b.w / 2 < s.x + s.w / 2)) { b.x = s.x - b.w; b.wall = 1; }
            else { b.x = s.x + s.w; b.wall = -1; }
            if (!s.dx || Math.sign(b.vx) !== Math.sign(s.dx)) b.vx = 0;
        }
        for (const s of solids) {
            if (!s.slope || s.off || s.oneway || !overlap(b, s)) continue;
            const oldSurface = slopeSurface(s, prevX, b.w);
            const surface = slopeSurface(s, b.x, b.w);
            if (b.y + b.h > surface + 2 && prevGround !== s && prevY + b.h > oldSurface + 2) {
                if (b.vx > 0 || (b.vx === 0 && b.x + b.w / 2 < s.x + s.w / 2)) { b.x = s.x - b.w; b.wall = 1; }
                else { b.x = s.x + s.w; b.wall = -1; }
                b.vx = 0;
            }
        }
        const prevBottom = b.y + b.h;
        b.y += b.vy * dt;
        for (const s of solids) {
            if (s.slope && !s.off) {
                if (b.x + b.w <= s.x || b.x >= s.x + s.w) continue;
                // a jump-through slope (a fire-escape flight) only ever catches you from above
                if (b.vy < 0 && !s.oneway && b.y < s.y + s.h && prevY >= s.y + s.h - 1) {
                    b.y = s.y + s.h; b.vy = 0;
                    continue;
                }
                if (b.vy < 0) continue;
                const sy = slopeSurface(s, b.x, b.w), oldSurface = slopeSurface(s, prevX, b.w);
                if ((b.y + b.h >= sy && prevBottom <= oldSurface + 2) || prevGround === s) {
                    b.y = sy - b.h; b.vy = 0; b.onGround = true; b.ground = s;
                }
                continue;
            }
            if (s.off || !overlap(b, s)) continue;
            // compare against where a moving deck's top was last frame too, so a rising lift catches you instead of shoving you sideways
            const top = Math.max(s.y, s.y - (s.dy || 0));
            if (s.oneway) {
                if (b.vy >= 0 && prevBottom <= top + 6) { b.y = s.y - b.h; b.vy = 0; b.onGround = true; b.ground = s; }
            } else if (b.vy >= 0 && prevBottom <= top + 12 + Math.abs(b.vy) * dt) {
                b.y = s.y - b.h; b.vy = 0; b.onGround = true; b.ground = s;
            } else if (b.vy < 0) {
                // a jump that only clips a ceiling corner slides past it instead of bonking
                const fromLeft = b.x + b.w - s.x, fromRight = s.x + s.w - b.x;
                const nudge = fromLeft <= CORNER_NUDGE ? -fromLeft : fromRight <= CORNER_NUDGE ? fromRight : 0;
                if (nudge && clearAt(b.x + nudge, b.y, b, solids)) { b.x += nudge; continue; }
                b.y = s.y + s.h; b.vy = 0;
            } else {
                b.y = s.y - b.h; b.vy = 0; b.onGround = true; b.ground = s;
            }
        }
        if (!b.onGround && b.vy === 0 && prevGround && !prevGround.off && solids.includes(prevGround)
            && b.x + b.w > prevGround.x && b.x < prevGround.x + prevGround.w
            && Math.abs(b.y + b.h - (prevGround.slope ? slopeSurface(prevGround, b.x, b.w) : prevGround.y)) < .01) {
            b.onGround = true; b.ground = prevGround;
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
        r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    const nameWidths = new WeakMap();
    function nameTag(ctx, name, x, y, color) {
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        let widths = nameWidths.get(ctx);
        if (!widths) { widths = new Map(); nameWidths.set(ctx, widths); }
        let w = widths.get(name);
        if (w === undefined) {
            w = ctx.measureText(name).width + 12;
            if (widths.size >= 256) widths.clear();
            widths.set(name, w);
        }
        ctx.fillStyle = 'rgba(8,12,24,.62)';
        roundRect(ctx, x - w / 2, y - 14, w, 19, 9);
        ctx.fill();
        ctx.fillStyle = color || '#fff';
        ctx.fillText(name, x, y);
    }

    function graphicsProfile() {
        // Legacy saved quality preferences do not affect rendering fidelity.
        // fps: Infinity = draw on every display refresh (no artificial frame cap)
        return { low: false, maxDpr: 2, fps: Infinity, previewFps: 60,
            avatarFps: 60, particleScale: 1, particleLimit: 320 };
    }

    function canvasView(ctx, margin = 0) {
        const m = ctx.getTransform?.(), canvas = ctx.canvas;
        if (!m || !canvas || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height)) return null;
        const det = m.a * m.d - m.b * m.c;
        if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
        const x = (m.c * m.f - m.d * m.e) / det, y = (m.b * m.e - m.a * m.f) / det;
        const dx = m.d * canvas.width / det, dy = -m.b * canvas.width / det;
        const ex = -m.c * canvas.height / det, ey = m.a * canvas.height / det;
        return { x0: x + Math.min(0, dx) + Math.min(0, ex) - margin,
            x1: x + Math.max(0, dx) + Math.max(0, ex) + margin,
            y0: y + Math.min(0, dy) + Math.min(0, ey) - margin,
            y1: y + Math.max(0, dy) + Math.max(0, ey) + margin };
    }

    class Particles {
        constructor(session) { this.items = []; this.session = session; }
        burst(x, y, color, count = 10, speed = 160, life = 0.5, size = 4) {
            if (!this.session?.preview) {
                if (count >= 24) sfx('boom', 160);
                else if (count >= 8) sfx('pop', 70);
            }
            const profile = this.session?.graphics?.particleLimit ? this.session.graphics : graphicsProfile();
            const amount = Math.max(0, Math.min(Math.ceil(count * profile.particleScale), profile.particleLimit - this.items.length));
            for (let i = 0; i < amount; i++) {
                const a = Math.random() * TAU;
                const v = speed * (0.3 + Math.random() * 0.7);
                this.items.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size });
            }
        }
        update(dt, gravity = 0) {
            let kept = 0;
            for (const p of this.items) {
                p.life -= dt;
                if (p.life <= 0) continue;
                p.x += p.vx * dt; p.y += p.vy * dt; p.vy += gravity * dt;
                this.items[kept++] = p;
            }
            this.items.length = kept;
        }
        draw(ctx) {
            const view = canvasView(ctx, 8);
            for (const p of this.items) {
                const radius = p.size / 2;
                if (view && (p.x + radius < view.x0 || p.x - radius > view.x1 || p.y + radius < view.y0 || p.y - radius > view.y1)) continue;
                ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
            ctx.globalAlpha = 1;
        }
    }

    // Resources are spent by playing and accumulate without a cap from correct answers.
    class Resource {
        constructor(label, color, max, start, mult = 1) {
            this.label = label; this.color = color; this.max = max; this.value = start; this.mult = mult;
        }
        has(n = 1) { return this.value >= n; }
        spend(n = 1) { if (this.value < n) return false; this.value -= n; return true; }
        drain(n) { this.value = Math.max(0, this.value - n); }
        add(n) { this.value += n; }
    }

    // Resource costs shared by players and bots. Tuned so the recommended answer reward lasts roughly
    // 10 seconds of typical play in every mode (see questionRewardRecommendation in app.js).
    const ENERGY_COSTS = Object.freeze({
        skyline: Object.freeze({ run: 0.5, air: 0.3, jump: 2, wallJump: 3, airJump: 3, dash: 8 }),
        duel: Object.freeze({ swing: 3, special: 10, guard: 5 }),
        miner: Object.freeze({ jet: 9, dig: 2.8 }),
        river: Object.freeze({ cast: 6 }),
        fishing: Object.freeze({ cast: 10 }),
        market: Object.freeze({ walk: 2.5, sprint: 10 }),
        sports: Object.freeze({ walk: 2.5, sprint: 10, kickMin: 3, kickMax: 10 }),
        shooter: Object.freeze({ nova: 30 })
    });

    class BaseGame {
        constructor(session) {
            this.s = session; this.particles = new Particles(session);
            // Scope direct audio calls too, including preview instances outside the mode cards.
            if (session.preview) for (const name of ['update', 'draw', 'onEvent']) {
                const method = this[name];
                this[name] = (...args) => {
                    const arcade = window.StudBudArcade;
                    arcade.previewDepth = (arcade.previewDepth || 0) + 1;
                    try { return method.apply(this, args); }
                    finally { arcade.previewDepth--; }
                };
            }
        }
        update() { }
        draw() { }
        net() { return {}; }
        onEvent() { }
        onState() { }
        goalText() { return ''; }
        hint() { return ''; }
        touchHint() {
            return {
                skyline: 'Joystick to move · Hold steeply up to jump on landing · Jump button for an air jump · Dash across gaps',
                duel: 'Joystick to move · Hold steeply up to jump on landing · Jump button for an air jump · Tap to swing · Heavy, Guard or Dodge',
                shooter: 'Joystick to move · Hold the arena to aim and fire · Dash between cover · Recharge behind cover',
                market: 'Joystick to move · Hold Sprint for speed · Pick up and deliver packages · Building recesses are away from traffic',
                river: 'Joystick to steer · Tap the water to cast · Shallow banks are calm places to recharge',
                sports: 'Joystick to dribble · Tap toward the goal to pass · Hold and release Power kick · Hold Sprint to run faster',
                crypto: 'Tap an asset to select it · Buy low and sell high · Recharge to keep trading',
                hack: 'Joystick to move · Use nearby terminals · Recharge between hacks'
            }[this.s.mode] || 'Use the on-screen controls · Recharge opens a flashcard';
        }
    }

    class Session {
        constructor(options) {
            this.room = options.room;
            this.user = options.user;
            this.api = options.api;
            this.isHost = Boolean(options.isHost);
            this.onLeave = options.onLeave;
            this.onRestart = options.onRestart;
            this.finishRoom = options.finishRoom;
            this.practice = Boolean(options.practice);
            this.testing = Boolean(options.testing);
            this.preview = Boolean(options.preview);
            this.graphics = graphicsProfile();
            this.returnFocus = document.activeElement;
            this.correct = 0;
            this.reward = Math.min(100, Math.max(5, Math.round((Number(options.questionReward ?? this.room.state?.question_reward) || 20) / 5) * 5));
            this.mode = this.room.mode;
            if (this.mode === 'chess') this.reward = 1;
            this.code = this.room.room_code;
            this.seed = Number.isInteger(options.seed) ? options.seed >>> 0 : hashStr(`${this.code}:${this.mode}`);
            this.roster = new Map();
            this.remotes = new Map();
            this.keys = new Set();
            this.justPressed = new Set();
            this.mouse = { x: 0, y: 0, down: false, pressed: false, rdown: false, rpressed: false };
            this.score = 0;
            this.goal = 0;
            this.answered = 0;
            this.questionHistory = [];
            this.paused = false;
            this.over = false;
            this.touchHintUntil = Date.now() + 5500;
            this.ending = false;
            this.countdown = 3.4;
            this.t = 0;
            this.cards = [];
            this.questionStats = new Map();
            this.studySet = options.studySet || { title: this.room.deck_title || 'Flashcards', publicId: this.room.state?.public_deck_id };
            this.lastCard = -1;
            this.outbox = [];
            this.rewards = null;
            this.standingsCache = null;
            this.firstDone = 0;
            this.finishMs = 0;
            this.done = false;
            this.lastReport = { score: -1, answered: -1, at: 0 };
            this.startedAt = Date.parse(this.room.started_at) || Date.now();
            this.deadline = ['chess', 'defense'].includes(this.mode) ? Infinity : this.practice
                ? Number(options.timeLimitSeconds) > 0 ? this.startedAt + Number(options.timeLimitSeconds) * 1000 : Infinity
                : this.room.goal_type === 'time'
                    ? this.startedAt + Number(this.room.time_limit_seconds) * 1000
                    : this.startedAt + 12 * 60000;
            this.updateRoster(this.room);
            this.local = this.roster.get(this.user.id) || { id: this.user.id, nickname: 'Player', color: PALETTE[0] };

            const Game = (window.StudBudArcade.games[this.mode]) || window.StudBudArcade.games.skyline;
            this.buildDom();
            this.game = new Game(this);
            if (['chess', 'defense'].includes(this.mode)) this.overlay.querySelector('.mpg-timer').classList.add('hidden');
            if (!this.preview) window.StudBudSfx?.startMusic(this.mode);
            else this.overlay.querySelectorAll('.mpg-hud, .mpg-hint, .mpg-touch, .mpg-countdown').forEach(element => element.classList.add('hidden'));
            this.bind();
            if (!this.practice && !this.preview) this.connect();
            if (!this.preview) this.loadCards(options.fallbackCards);
            this.resize();
            if (this.practice) this.countdown = 1.2;
            if (this.preview) this.countdown = 0;
            this.lastFrame = performance.now();
            this.raf = requestAnimationFrame(now => this.frame(now));
            if (!this.practice && !this.preview) {
                this.sendTimer = setInterval(() => this.sendState(), 100);
                this.reportTimer = setInterval(() => this.reportScore(false), 5000);
                this.overlay.requestFullscreen?.().catch(() => { });
            }
            this.hudTimer = setInterval(() => this.updateHud(), 250);
        }

        // ---------- roster / network ----------
        updateRoster(room) {
            const players = Array.isArray(room.state?.players) ? room.state.players : [];
            const ids = new Set(), defaults = defaultPlayerColors(players);
            players.forEach(player => {
                ids.add(player.id);
                const info = this.roster.get(player.id) || {};
                const cos = playerCosmetics(player), assigned = defaults.get(player.id);
                if (assigned) cos.color = assigned;
                Object.assign(info, {
                    id: player.id, nickname: player.nickname, username: player.username, score: Number(player.score || 0), color: assigned || playerColor(player), avatar: player.avatar,
                    cos
                });
                this.roster.set(player.id, info);
                const remote = this.remotes.get(player.id);
                if (remote) { remote.cos = info.cos; remote.color = info.color; remote.name = info.nickname; }
            });
            for (const id of [...this.roster.keys()]) if (!ids.has(id)) { this.roster.delete(id); this.remotes.delete(id); }
            if (this.roster.has(this.user.id)) this.local = this.roster.get(this.user.id);
        }

        updateRoom(room) {
            if (this.over && room.status === 'finished') {
                const rewards = room.state?.coin_rewards;
                if (rewards && !this.rewards) { this.rewards = rewards; this.renderResults(); }
            }
            this.room = room;
            this.updateRoster(room);
            this.game.onRoom?.(room);
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
            if (this.practice) {
                this.cards = fallback || [];
                return;
            }
            try {
                this.cards = await this.api.getCards(this.code);
            } catch (error) {
                console.warn('[Arcade] Using local cards:', error.message);
            }
            if (!this.cards.length && fallback?.length) this.cards = fallback;
            if (fallback?.length) {
                const localStats = new Map(fallback.map(card => [JSON.stringify([card.front, card.back]), card.practiceStats]));
                this.cards = this.cards.map(card => ({ ...card, practiceStats: localStats.get(JSON.stringify([card.front, card.back])) || card.practiceStats }));
            }
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
                d: this.done ? 1 : 0, ft: this.finishMs, ...this.game.net(), sentAt: Date.now(), ev: this.outbox.splice(0, 40)
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
            r.networkAge = Number.isFinite(p.sentAt) ? clamp((Date.now() - p.sentAt) / 1000, 0, .15) : 0;
            r.networked = true;
            if (p.d && !this.firstDone) this.firstDone = Date.now();
            for (const ev of p.ev || []) this.game.onEvent(ev, r);
            this.game.onState(r.ex, r);
        }

        remoteList() { return [...this.remotes.values()]; }

        // ---------- scoring / end of match ----------
        sfx(name, gap) { if (!this.preview) sfx(name, gap); }

        addScore(n) {
            this.score = Math.max(0, this.score + n);
            if (n >= 40) this.sfx('coin', 120);
            else if (n > 0) this.sfx('pop', 90);
            else if (n < 0) this.sfx('hit');
        }
        setGoal(n) { this.goal = n; }

        standings() {
            const rows = [];
            for (const info of this.roster.values()) {
                const r = this.remotes.get(info.id);
                const isMe = info.id === this.user.id;
                rows.push({
                    id: info.id, n: info.nickname, username: info.username, color: info.color, cos: info.cos,
                    s: Math.round(Number(isMe ? this.score : r ? r.score : info.score) || 0),
                    g: Math.round(Number(isMe ? this.goal : r ? r.goal : (this.game?.scoreGoal === false ? info.score || 0 : 0)) || 0),
                    d: isMe ? this.done : Boolean(r?.done)
                });
            }
            if (this.game?.standingValues) for (const row of rows) Object.assign(row, this.game.standingValues(row.id));
            return rows.sort((a, b) => (this.metric(b) - this.metric(a)) || (b.s - a.s));
        }

        metric(row) { return this.game?.rankMetric ? this.game.rankMetric(row) : this.game?.scoreGoal === false ? row.g : row.s; }

        // What the leaderboard shows for a player: the number their game is actually won by.
        valueText(row) {
            if (this.game?.scoreGoal === false) return this.game.formatValue ? this.game.formatValue(row.g) : `${row.g.toLocaleString()} ${this.game.goalUnit || 'pts'}`;
            return `${row.s.toLocaleString()} pts`;
        }

        checkEnd() {
            if (this.practice) {
                if (!this.testing && !this.over && (this.game.finished || Date.now() >= this.deadline)) this.finish(this.standings());
                return;
            }
            if (this.over || this.ending || !this.isHost || this.countdown > 0) return;
            const now = Date.now();
            const rows = this.standings();
            const limit = Number(this.room.point_limit);
            let end = Boolean(this.game.finished) || now >= this.deadline;
            if (!['chess', 'defense'].includes(this.mode) && this.room.goal_type !== 'time' && !this.game.race && rows.some(row => this.metric(row) >= limit)) end = true;
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
                    await this.game.persistPromise;
                    const room = await this.finishRoom();
                    if (room?.state?.coin_rewards) { this.rewards = room.state.coin_rewards; this.renderResults(); }
                } catch (error) {
                    console.error('[Arcade] Could not finish room:', error);
                    this.toast('Could not finalize the match. Check your connection and end it again from the lobby.', '#f87171');
                }
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
            this.keys.clear(); this.justPressed.clear(); this.resetTouchStick?.();
            this.mouse.down = false; this.mouse.rdown = false;
            this.standingsCache = (standings || this.standings()).map(row => ({ ...row, color: row.color || this.roster.get(row.id)?.color || '#94a3b8' }));
            this.reportScore(true);
            this.closeQuestion(true);
            this.renderResults();
            const me = this.standingsCache.findIndex(row => row.id === this.user.id);
            window.NexusApp?.saveGameSummary?.(this).catch(error => {
                console.error('[Game] Could not save match summary:', error);
                this.toast('Your match summary could not be saved. Check your connection and export a backup.', '#f87171');
            });
            window.StudBudSfx?.stopMusic();
            const won = this.game?.isWinner ? this.game.isWinner(this.standingsCache, this.user.id) : me === 0;
            this.sfx(won ? 'win' : 'lose');
        }

        // ---------- questions ----------
        // Spend from the game's resource; nags the player to answer a question when empty.
        spend(n) {
            const res = this.game.res;
            if (this.preview || this.testing) return true;
            if (res.spend(n)) return true;
            const now = performance.now();
            if (now - (this.lastNeed || 0) > 1800) {
                this.lastNeed = now;
                this.sfx('wrong');
                const prompt = this.overlay?.classList.contains('has-touch') ? 'tap recharge to answer a question' : 'press Q to answer a question';
                this.toast(`Out of ${res.label.toLowerCase()} — ${prompt}`, '#f87171');
            }
            return false;
        }

        // Amount of the game's resource a correct answer is worth (host-configured).
        rewardAmount() { return Math.max(1, Math.round(this.reward)); }

        refill() {
            const res = this.game.res;
            if (!res) return 0;
            const n = this.rewardAmount();
            res.add(n);
            this.sfx('refill');
            this.toast(`+${n} ${res.label}`, res.color);
            return n;
        }

        // Player-triggered question that refills the game's resource.
        recharge() {
            if (this.game.recharge) return this.game.recharge();
            const res = this.game.res;
            if (!res || this.paused || this.question || this.over || this.countdown > 0) return;
            this.ask(correct => {
                if (this.testing) return;
                if (correct) this.refill();
                else if (correct === false) this.toast(`Wrong answer — no ${res.label.toLowerCase()}`, '#f87171');
            }, this.testing ? 'Admin test question · resources are unlimited' : `Correct answer: +${this.rewardAmount()} ${res.label}`, true);
        }

        // Automatic triggers (mystery boxes, chests, pads) are blocked briefly after any question closes.
        ask(callback, note, manual, opts) {
            if (this.preview) return false;
            if (opts?.force && this.question) this.closeQuestion(true);
            if (this.paused || this.question || this.over || this.countdown > 0) return false;
            if (!manual && performance.now() < (this.askCooldownUntil || 0)) return false;
            if (!this.cards.length) { this.toast('Questions are still loading…', '#fbbf24'); return false; }
            const adaptiveCards = this.cards.map((card, index) => ({ ...card, practiceStats: this.questionStats.get(index) || card.practiceStats, cardIndex: index }));
            let index = opts?.cardIndex !== undefined ? opts.cardIndex % this.cards.length
                : window.FlashcardTools.adaptiveOrder(adaptiveCards.filter(card => this.cards.length === 1 || card.cardIndex !== this.lastCard))[0].cardIndex;
            if (opts?.cardIndex === undefined && this.cards.length > 1 && index === this.lastCard) index = (index + 1) % this.cards.length;
            this.lastCard = index;
            this.lastCardIndex = index;
            const card = this.cards[index];
            const options = window.FlashcardTools.distractors(card, this.cards, 3, { vary: true }).map(item => item.back).concat(card.back);
            for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
            this.question = { card, options, callback, locked: false, onAnswer: opts?.onAnswer };
            return this.showQuestion(card, options, note);
        }

        showQuestion(card, options, note) {
            this.resetTouchStick?.();
            this.overlay?.querySelectorAll('.mpg-touch button.on').forEach(b => b.classList.remove('on'));
            this.keys.clear(); this.justPressed.clear();
            this.mouse.down = false; this.mouse.rdown = false; this.mouse.pressed = false; this.mouse.rpressed = false;
            const box = this.overlay.querySelector('.mpg-question');
            box.querySelector('.mpg-q-prompt').textContent = card.front;
            box.querySelector('.mpg-q-options').innerHTML = options.map((option, i) =>
                `<button type="button" data-q="${i}"><kbd>${i + 1}</kbd><span>${esc(option)}</span></button>`).join('');
            box.querySelector('.mpg-q-result').textContent = '';
            const res = this.game.res;
            box.querySelector('small').textContent = note || (res ? `Correct answer: +${this.rewardAmount()} ${res.label}` : 'Question');
            box.classList.remove('hidden');
            box.querySelector('[data-q]')?.focus({ preventScroll: true });
            this.sfx('question');
            return true;
        }

        answerQuestion(index) {
            const q = this.question;
            if (!q || q.locked) return;
            q.locked = true;
            const correct = index >= 0 && index < q.options.length && normalizeChoiceText(q.options[index]) === normalizeChoiceText(q.card.back);
            this.answered++;
            if (correct) this.correct++;
            const progress = { practiceStats: this.questionStats.get(this.lastCardIndex) || q.card.practiceStats };
            window.FlashcardTools.recordAnswer(progress, correct);
            this.questionStats.set(this.lastCardIndex, progress.practiceStats);
            this.questionHistory.push({ prompt: q.card.front, answer: q.card.back, chosen: q.options[index] ?? '', correct });
            try { q.onAnswer?.(correct); } catch (error) { console.error(error); }
            this.sfx(correct ? 'correct' : 'wrong');
            const box = this.overlay.querySelector('.mpg-question');
            box.querySelectorAll('[data-q]').forEach((button, i) => {
                button.classList.toggle('right', normalizeChoiceText(q.options[i]) === normalizeChoiceText(q.card.back));
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
            this.questionHistory.push({ prompt: q.card.front, answer: q.card.back, chosen: '', correct: null });
            this.closeQuestion(true);
            q.callback?.(null);
        }

        closeQuestion(resume) {
            this.question = null;
            this.askCooldownUntil = performance.now() + 1000;
            const box = this.overlay.querySelector('.mpg-question');
            const restoreFocus = box.contains(document.activeElement);
            box.classList.add('hidden');
            if (restoreFocus) (this.mode === 'chess' ? this.game.boardElement.querySelector('button') : this.canvas)?.focus({ preventScroll: true });
            if (resume) this.paused = false;
        }

        toast(text, color = '#e2e8f0') {
            if (this.preview) return;
            const holder = this.overlay.querySelector('.mpg-toasts');
            if ([...holder.children].some(el => el.textContent === text)) return;
            const item = document.createElement('div');
            item.textContent = text;
            item.style.borderColor = color;
            holder.appendChild(item);
            setTimeout(() => item.remove(), 2400);
            while (holder.children.length > 2) holder.firstChild.remove();
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
                    if (this.over) {
                        if (e.code === 'Tab') {
                            const targets = [...this.overlay.querySelectorAll('.mpg-results button, .mpg-results summary')].filter(el => el.offsetWidth && el.offsetHeight);
                            const index = targets.indexOf(document.activeElement);
                            const next = index < 0 ? e.shiftKey ? targets.length - 1 : 0
                                : (index + (e.shiftKey ? -1 : 1) + targets.length) % targets.length;
                            targets[next]?.focus();
                            e.preventDefault();
                        }
                        return;
                    }
                    if (typing(e) && e.code !== 'Tab') return;
                    if (this.question) {
                        if (e.code === 'Escape') { this.skipQuestion(); e.preventDefault(); return; }
                        if (e.code === 'Tab') {
                            const buttons = [...this.overlay.querySelector('.mpg-question').querySelectorAll('button')];
                            const index = buttons.indexOf(document.activeElement);
                            buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
                            e.preventDefault(); return;
                        }
                        if (e.code === 'Enter' || e.code === 'Space') return;
                        const n = Number(e.key);
                        if (n >= 1 && n <= 4) this.answerQuestion(n - 1);
                        e.preventDefault();
                        return;
                    }
                    if (e.code === 'Tab') {
                        const targets = [this.canvas, ...this.overlay.querySelectorAll('.mpg-hud button, .mpg-hud summary, .mpg-hud input, .mpg-hud select, .mpg-touch button, .chess-panel button, .chess-panel summary')].filter(el => el.offsetWidth && el.offsetHeight);
                        const index = targets.indexOf(document.activeElement);
                        targets[(index + (e.shiftKey ? -1 : 1) + targets.length) % targets.length]?.focus();
                        e.preventDefault(); return;
                    }
                    if ((e.code === 'Enter' || e.code === 'Space') && this.overlay.contains(e.target) && e.target.closest('button, summary')) return;
                    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
                    if (e.code === 'KeyQ' && !e.repeat && this.game?.res) { this.recharge(); return; }
                    if (!e.repeat) this.justPressed.add(e.code);
                    this.keys.add(e.code);
                },
                keyup: e => this.keys.delete(e.code),
                blur: () => { this.keys.clear(); this.mouse.down = false; this.mouse.rdown = false; this.aimPointer = null; this.resetTouchStick?.(); },
                resize: () => this.resize()
            };
            window.addEventListener('keydown', this.handlers.keydown);
            window.addEventListener('keyup', this.handlers.keyup);
            window.addEventListener('blur', this.handlers.blur);
            window.addEventListener('resize', this.handlers.resize);
            const canvas = this.canvas;
            canvas.tabIndex = 0;
            canvas.setAttribute('aria-label', 'Game area. Use the game controls, Q to refill, or Tab to reach game buttons.');
            if (!this.preview) canvas.focus({ preventScroll: true });
            const aimSurface = this.mode === 'shooter' ? this.overlay : canvas;
            aimSurface.addEventListener('pointermove', e => {
                if (this.aimPointer != null && e.pointerId !== this.aimPointer) return;
                const b = canvas.getBoundingClientRect();
                this.mouse.x = (e.clientX - b.left) / this.scale;
                this.mouse.y = (e.clientY - b.top) / this.scale;
                this.mouse.active = true;
                this.mouse.pointerType = e.pointerType;
            });
            aimSurface.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') this.mouse.active = false; });
            canvas.addEventListener('pointerdown', e => {
                if (this.question || this.over || this.paused) return;
                this.mouse.active = true;
                this.mouse.pointerType = e.pointerType;
                if (e.button !== 2 && this.aimPointer != null) return;
                if (e.button !== 2) this.aimPointer = e.pointerId;
                if (e.pointerType === 'touch') this.mouse.touchAt = performance.now();
                const b = canvas.getBoundingClientRect();
                this.mouse.x = (e.clientX - b.left) / this.scale;
                this.mouse.y = (e.clientY - b.top) / this.scale;
                if (e.button === 2) { this.mouse.rdown = true; this.mouse.rpressed = true; }
                else { this.mouse.down = true; this.mouse.pressed = true; }
                canvas.setPointerCapture?.(e.pointerId);
            });
            const releaseAim = e => {
                if (e.button === 2) this.mouse.rdown = false;
                if (e.pointerId === this.aimPointer) { this.aimPointer = null; this.mouse.down = false; }
            };
            for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, releaseAim);
            canvas.addEventListener('contextmenu', e => e.preventDefault());
            this.overlay.addEventListener('change', e => {
                if (e.target.dataset.testBiome !== undefined) this.teleportTestBiome(Number(e.target.value));
            });
            this.overlay.addEventListener('click', e => {
                const target = e.target.closest('button');
                if (!target) return;
                if (target.dataset.q !== undefined && !target.classList.contains('mpg-qbtn')) this.answerQuestion(Number(target.dataset.q));
                else if (target.classList.contains('mpg-q-skip')) this.skipQuestion();
                else if (target.classList.contains('mpg-recharge') || target.classList.contains('mpg-qbtn')) this.recharge();
                else if (target.classList.contains('mpg-hud-toggle')) {
                    this.setHudCollapsed(!this.overlay.classList.contains('hud-collapsed'));
                }
                else if (target.classList.contains('mpg-test-pause') && this.testing) {
                    if (this.paused) {
                        const elapsed = Date.now() - this.testPauseAt;
                        this.startedAt += elapsed;
                        if (Number.isFinite(this.deadline)) this.deadline += elapsed;
                        this.testPauseAt = null; this.paused = false; target.textContent = 'Pause';
                    } else {
                        this.testPauseAt = Date.now(); this.paused = true; target.textContent = 'Resume';
                        this.keys.clear(); this.justPressed.clear(); this.resetTouchStick?.();
                        this.mouse.down = false; this.mouse.rdown = false;
                    }
                }
                else if (target.classList.contains('mpg-test-restart') && this.testing) this.onRestart?.();
                else if (target.dataset.testAction && this.testing && this.mode === 'skyline') {
                    const index = target.dataset.testAction === 'checkpoint' ? this.game.cp.id
                        : Number(this.overlay.querySelector('[data-test-biome]').value);
                    this.teleportTestBiome(index);
                }
                else if (target.classList.contains('mpg-leave') && this.practice && !this.testing && !this.over) this.finish();
                else if (target.classList.contains('mpg-leave') || target.classList.contains('mpg-exit')) this.onLeave?.();
                else if (target.classList.contains('mpg-end')) this.hostEnd();
            });
        }

        teleportTestBiome(index) {
            if (!this.testing || this.mode !== 'skyline') return;
            if (this.game.testTeleport(index) === false) return;
            this.keys.clear(); this.justPressed.clear(); this.resetTouchStick?.();
            this.mouse.down = false; this.mouse.pressed = false; this.mouse.rdown = false;
            const select = this.overlay.querySelector('[data-test-biome]');
            if (select) select.value = String(index);
        }

        // ---------- DOM ----------
        buildDom() {
            const overlay = document.createElement('div');
            overlay.className = 'mpg-overlay';
            overlay.innerHTML = `
                <canvas class="mpg-canvas"></canvas>
                <div class="mpg-top">
                    <div class="mpg-chip"><strong class="mpg-name"></strong><span class="mpg-goal"></span>${this.testing ? '<small class="mpg-practice-indicator">Staff testing · infinite resources</small>' : this.practice ? '<small class="mpg-practice-indicator">Practice · no coins</small>' : ''}</div>
                    <div class="mpg-timer"></div>
                    <div class="mpg-actions">
                        <button type="button" class="mpg-hud-toggle" aria-expanded="true" aria-controls="mpg-match-details mpg-match-standings" aria-label="Hide match details and standings">HUD</button>
                        <details class="mpg-controls-help"><summary>Controls</summary><div class="mpg-help-panel"><div class="mpg-hint" id="mpg-controls-hint"></div></div></details>
                        <details class="mpg-audio-settings"><summary>Settings</summary><div class="mpg-audio-panel">
                            <label>Game volume <input type="range" min="0" max="100" value="${Math.round((window.StudBudSfx?.settings.volume ?? .7) * 100)}" data-audio="volume"></label>
                            <label>Music volume <input type="range" min="0" max="100" value="${Math.round((window.StudBudSfx?.settings.musicVolume ?? .5) * 100)}" data-audio="musicVolume"></label>
                            <label><input type="checkbox" data-audio="game" ${window.StudBudSfx?.settings.game !== false ? 'checked' : ''}> Game sounds</label>
                            <label><input type="checkbox" data-audio="music" ${window.StudBudSfx?.settings.music !== false ? 'checked' : ''}> Music</label>
                        </div></details>
                        ${this.testing ? `<details class="mpg-test-tools"><summary>Tools</summary><div class="mpg-test-panel"><div><button type="button" class="mpg-test-pause">Pause</button>${this.onRestart ? '<button type="button" class="mpg-test-restart">Restart</button>' : ''}</div>${this.mode === 'skyline' ? `
                            <label><input type="checkbox" data-test-cheat="flight"> Flight (W/S or Up/Down; Shift = fast)</label>
                            <label class="mpg-test-range">Fly speed <output data-test-speed-label aria-label="Selected fly speed">600 units/s</output><input type="range" min="100" max="3000" step="100" value="600" data-test-speed aria-label="Fly speed"></label>
                            <label><input type="checkbox" data-test-cheat="invincible"> Invincibility</label>
                            <label><input type="checkbox" data-test-cheat="freeze"> Freeze machinery and moving platforms</label>
                            <label><input type="checkbox" data-test-cheat="tide"> Disable rising tide</label>
                            <label>Biome <select data-test-biome aria-label="Test biome">${window.StudBudArcade.games.skyline.testDestinations.map(place => `<option value="${place.id}">${esc(place.name)}</option>`).join('')}</select></label>
                            <div class="mpg-test-teleport"><button type="button" data-test-action="teleport">Teleport</button><button type="button" data-test-action="checkpoint">Reset checkpoint</button></div>` : ''}<pre class="mpg-test-stats"></pre></div></details>` : ''}
                        <button type="button" class="mpg-end ${this.isHost && !this.practice ? '' : 'hidden'}">End match</button>
                        <button type="button" class="mpg-leave">${this.testing ? 'Close test' : this.practice ? 'End game' : 'Leave'}</button>
                    </div>
                </div>
                <ol class="mpg-board" id="mpg-match-standings" aria-label="Match standings"></ol>
                <div class="mpg-score"><span>Score</span><strong>0</strong></div>
                <div class="mpg-meter hidden">
                    <div class="mpg-meter-head"><span class="mpg-meter-label"></span><b class="mpg-meter-value"></b></div>
                </div>
                <div class="mpg-stick-zone" aria-hidden="true"></div>
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
                <div class="mpg-results hidden" role="dialog" aria-modal="true" aria-label="Match results"></div>`;
            document.body.appendChild(overlay);
            document.body.classList.add('mpg-active');
            lockViewportZoom(true);
            this.overlay = overlay;
            this.canvas = overlay.querySelector('.mpg-canvas');
            this.ctx = this.canvas.getContext('2d');
            overlay.querySelector('.mpg-name').textContent = this.game?.title || this.mode;
            const chip = overlay.querySelector('.mpg-chip');
            const details = document.createElement('div');
            details.id = 'mpg-match-details';
            details.className = 'mpg-match-details';
            for (const el of chip.querySelectorAll('.mpg-goal, .mpg-practice-indicator')) details.appendChild(el);
            chip.appendChild(details);
            const hud = document.createElement('div');
            hud.className = 'mpg-hud';
            const status = document.createElement('div');
            status.className = 'mpg-status';
            for (const selector of ['.mpg-score', '.mpg-meter']) status.appendChild(overlay.querySelector(selector));
            const panels = document.createElement('div');
            panels.className = 'mpg-panels';
            hud.append(overlay.querySelector('.mpg-top'), status, overlay.querySelector('.mpg-board'), panels, overlay.querySelector('.mpg-toasts'));
            overlay.appendChild(hud);
            this.bindTouch(overlay);
            overlay.addEventListener('input', event => {
                const cheat = event.target.dataset.testCheat;
                const cheatKeys = { flight: 'testFlight', invincible: 'testInvincible', freeze: 'testFreezeHazards', tide: 'testNoTide' };
                if (this.testing && this.mode === 'skyline' && Object.hasOwn(cheatKeys, cheat)) {
                    this[cheatKeys[cheat]] = event.target.checked;
                    if (this.testFlight || this.testInvincible) this.game.dead = 0;
                    this.game.me.vx = 0; this.game.me.vy = 0;
                    this.game.me.ground = null; this.game.me.onGround = false;
                    return;
                }
                if (this.testing && this.mode === 'skyline' && event.target.dataset.testSpeed !== undefined) {
                    const speed = Number(event.target.value);
                    if (!Number.isFinite(speed) || speed < 100 || speed > 3000) {
                        this.toast('Fly speed must be between 100 and 3000 units/s', '#fbbf24');
                        return;
                    }
                    this.testFlySpeed = speed;
                    overlay.querySelector('[data-test-speed-label]').textContent = `${speed} units/s`;
                    return;
                }
                const key = event.target.dataset.audio;
                if (!key) return;
                const value = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value) / 100;
                window.NexusApp.updateGameAudio({ [key]: value });
            });
            const menus = overlay.querySelectorAll('.mpg-audio-settings, .mpg-test-tools, .mpg-controls-help');
            for (const panel of menus) {
                const content = panel.querySelector('.mpg-audio-panel, .mpg-test-panel, .mpg-help-panel');
                content.hidden = true;
                panels.appendChild(content);
                panel.addEventListener('toggle', () => {
                    content.hidden = !panel.open;
                    if (panel.open) menus.forEach(other => {
                        if (other !== panel) {
                            other.open = false;
                        }
                    });
                    this.layoutHud();
                });
            }
            const compactHud = this.defaultHudCollapsed();
            this.setHudCollapsed(compactHud);
            overlay.addEventListener('keydown', event => {
                if (event.key !== 'Escape' || this.question) return;
                for (const menu of menus) {
                    if (menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
                }
            });
            this.hudObserver = new ResizeObserver(() => this.layoutHud());
            for (const el of [hud, overlay.querySelector('.mpg-touch'), overlay.querySelector('.mpg-hint'), overlay.querySelector('.mpg-board')]) this.hudObserver.observe(el);
        }

        defaultHudCollapsed() {
            return Boolean(window.matchMedia?.('(max-width: 680px), (pointer: coarse) and (max-height: 520px)').matches);
        }

        setHudCollapsed(collapsed) {
            this.overlay.classList.toggle('hud-collapsed', collapsed);
            this.overlay.querySelector('.mpg-match-details').hidden = collapsed;
            this.overlay.querySelector('.mpg-board').hidden = collapsed;
            const toggle = this.overlay.querySelector('.mpg-hud-toggle');
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggle.setAttribute('aria-label', collapsed ? 'Show match details and standings' : 'Hide match details and standings');
            this.layoutHud();
        }

        // On-screen buttons feed the same key state as the keyboard, so every game works on phones.
        bindTouch(overlay) {
            const pad = overlay.querySelector('.mpg-touch');
            if (!pad) return;
            const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
            const touchCapable = (navigator.maxTouchPoints || 0) > 0 || window.matchMedia?.('(hover: none)').matches;
            if (coarsePointer && touchCapable) overlay.classList.add('has-touch');
            overlay.addEventListener('pointerdown', event => {
                if (event.pointerType !== 'touch' || overlay.classList.contains('has-touch')) return;
                overlay.classList.add('has-touch');
                this.resize();
            });
            const release = btn => {
                const code = btn.dataset.k;
                if (code) this.keys.delete(code);
                if (btn.dataset.click) this.mouse.down = false;
                btn.classList.remove('on');
            };
            const stick = pad.querySelector('.mpg-stick'), knob = stick?.querySelector('.mpg-knob');
            const zone = overlay.querySelector('.mpg-stick-zone');
            const buzz = ms => { try { navigator.vibrate?.(ms); } catch (_) { /* unsupported */ } };
            if (stick) {
                const NONE = { KeyA: false, KeyD: false, KeyW: false, KeyS: false };
                const dirs = { ...NONE };
                let activeId = null, origin = null;
                const setDirs = next => {
                    for (const code in dirs) {
                        if (next[code] && !dirs[code]) this.justPressed.add(code);
                        if (next[code]) this.keys.add(code); else this.keys.delete(code);
                        dirs[code] = next[code];
                    }
                };
                // Platformers bind up/down to jump/shield/drop, so vertical input there needs a firm, mostly-vertical push.
                const resolve = (dx, dy, max) => {
                    const n = Math.hypot(dx, dy) / max;
                    this.stickJumpHeld = false;
                    if (n < 0.22) return { ...NONE };
                    if (this.stickPlatform) {
                        const vertical = this.stickGroundJump
                            ? dy < 0
                                ? Math.abs(dy) >= Math.abs(dx) * Math.tan(55 * Math.PI / 180) && n >= .60
                                : Math.abs(dy) >= Math.abs(dx) * Math.sqrt(3) && n >= .65
                            : Math.abs(dy) > Math.abs(dx) * (dirs.KeyW || dirs.KeyS ? 1 : 1.5) && n > (dirs.KeyW || dirs.KeyS ? .5 : .7);
                        this.stickJumpHeld = this.stickGroundJump && vertical && dy < 0;
                        return { KeyA: dx < -max * .22, KeyD: dx > max * .22, KeyW: !this.stickGroundJump && vertical && dy < 0, KeyS: vertical && dy > 0 };
                    }
                    // 8 equal sectors so a "mostly right" push never leaks into up or down.
                    const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
                    return {
                        KeyD: sector === 0 || sector === 1 || sector === 7,
                        KeyS: sector === 1 || sector === 2 || sector === 3,
                        KeyA: sector === 3 || sector === 4 || sector === 5,
                        KeyW: sector === 5 || sector === 6 || sector === 7
                    };
                };
                const reset = () => {
                    activeId = null;
                    origin = null;
                    this.stickJumpHeld = false;
                    setDirs({ ...NONE });
                    knob.style.transform = '';
                    stick.style.transform = '';
                    stick.classList.remove('active');
                };
                const move = e => {
                    const b = stick.getBoundingClientRect();
                    const max = b.width / 2;
                    const cx = origin ? origin.x : b.left + max, cy = origin ? origin.y : b.top + max;
                    let dx = e.clientX - cx, dy = e.clientY - cy;
                    const len = Math.hypot(dx, dy);
                    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
                    knob.style.transform = `translate(${dx}px, ${dy}px)`;
                    if (this.question || this.over || this.paused) { this.stickJumpHeld = false; setDirs({ ...NONE }); return; }
                    setDirs(resolve(dx, dy, max));
                };
                const begin = (e, floating) => {
                    if (e.button !== undefined && e.button !== 0) return;
                    if (activeId !== null || this.question || this.over || this.paused) return;
                    e.preventDefault();
                    e.stopPropagation?.();
                    activeId = e.pointerId;
                    try { (floating ? zone : stick).setPointerCapture?.(e.pointerId); } catch (_) { /* pointer already gone */ }
                    stick.classList.add('active');
                    if (floating) {
                        // Floating joystick: re-centre the stick under the thumb wherever it lands on the left side.
                        stick.style.transform = '';
                        const b = stick.getBoundingClientRect();
                        const z = zone.getBoundingClientRect(), radius = b.width / 2;
                        origin = { x: Math.max(z.left + radius + 8, Math.min(e.clientX, z.right - radius)), y: Math.max(z.top + radius, Math.min(e.clientY, z.bottom - radius - 8)) };
                        stick.style.transform = `translate(${origin.x - (b.left + radius)}px, ${origin.y - (b.top + radius)}px)`;
                    } else {
                        const b = stick.getBoundingClientRect();
                        origin = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
                    }
                    move(e);
                };
                stick.addEventListener('pointerdown', e => begin(e, false));
                this.stickHandlers = {
                    move: e => { if (e.pointerId === activeId) { e.preventDefault(); move(e); } },
                    end: e => { if (e.pointerId === activeId) reset(); }
                };
                stick.addEventListener('pointermove', this.stickHandlers.move);
                window.addEventListener('pointermove', this.stickHandlers.move, { passive: false });
                window.addEventListener('pointerup', this.stickHandlers.end);
                window.addEventListener('pointercancel', this.stickHandlers.end);
                for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, e => { if (e.pointerId === activeId) reset(); });
                stick.addEventListener('contextmenu', e => e.preventDefault());
                if (zone) {
                    zone.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') begin(e, true); });
                    zone.addEventListener('pointermove', this.stickHandlers.move);
                    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, e => { if (e.pointerId === activeId) reset(); });
                    zone.addEventListener('contextmenu', e => e.preventDefault());
                }
                this.resetTouchStick = reset;
            }
            const bindBtn = btn => {
                let activeId = null;
                btn.addEventListener('pointerdown', e => {
                    e.preventDefault();
                    if (activeId !== null || this.question || this.over || this.paused || (e.button !== undefined && e.button !== 0)) return;
                    activeId = e.pointerId;
                    try { btn.setPointerCapture?.(e.pointerId); } catch (_) { /* pointer already gone */ }
                    btn.classList.add('on');
                    buzz(btn.dataset.q ? 15 : 8);
                    if (btn.dataset.q) { if (this.game?.res) { this.resetTouchStick?.(); this.recharge(); } return; }
                    this.justPressed.add(btn.dataset.k);
                    this.keys.add(btn.dataset.k);
                    if (btn.dataset.click) { this.mouse.down = true; this.mouse.pressed = true; }
                });
                const end = e => {
                    if (e.pointerId !== activeId) return;
                    activeId = null;
                    release(btn);
                    if (e.type === 'pointercancel' || e.type === 'lostpointercapture') {
                        this.justPressed.delete(btn.dataset.k);
                        if (btn.dataset.click) this.mouse.pressed = false;
                    }
                };
                this.touchButtonHandlers ||= [];
                this.touchButtonHandlers.push(end);
                window.addEventListener('pointerup', end);
                window.addEventListener('pointercancel', end);
                for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(type, end);
                btn.addEventListener('contextmenu', e => e.preventDefault());
            };
            // Each game describes its own on-screen controls: { stick, buttons: [{ k, label, cls, click }] }. The recharge button is added automatically.
            const DEFAULT_LAYOUT = { stick: true, buttons: [{ k: 'Space', label: 'Jump', cls: 'main' }, { k: 'ShiftLeft', label: 'Dash' }] };
            this.applyTouchLayout = () => {
                const layout = this.game?.touchLayout?.() || DEFAULT_LAYOUT;
                const key = JSON.stringify(layout) + (this.game?.res ? 'q' : '');
                if (key === this.touchLayoutKey) return;
                for (const end of this.touchButtonHandlers || []) {
                    window.removeEventListener('pointerup', end);
                    window.removeEventListener('pointercancel', end);
                }
                this.touchButtonHandlers = [];
                this.touchLayoutKey = key;
                this.stickPlatform = layout.platform ?? (layout.buttons || []).some(b => b.k === 'Space' && /jump/i.test(b.label || ''));
                this.stickGroundJump = (layout.buttons || []).some(b => b.k === 'Space' && /jump/i.test(b.label || ''));
                stick?.setAttribute('aria-label', this.stickGroundJump ? 'Move left or right; push steeply up to jump on landing; use Jump for an air jump' : 'Movement joystick');
                const box = pad.querySelector('.mpg-btns');
                box.innerHTML = '';
                const list = layout.buttons || [];
                for (const def of list) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = def.label;
                    btn.dataset.k = def.k;
                    if (def.click) btn.dataset.click = '1';
                    if (def.cls) btn.className = `b-${def.cls}`;
                    if (def.small) btn.classList.add('b-small');
                    bindBtn(btn);
                    box.appendChild(btn);
                }
                // The question button sits apart from the action buttons so it isn't hit by accident mid-game.
                overlay.querySelector('.mpg-qbtn')?.remove();
                if (this.game?.res) {
                    const q = document.createElement('button');
                    q.type = 'button';
                    q.className = 'mpg-qbtn b-q';
                    q.dataset.q = '1';
                    const resourceName = this.game.res.label;
                    q.setAttribute('aria-label', this.testing ? 'Test a flashcard question' : `Answer a question to refill ${resourceName.toLowerCase()}`);
                    q.innerHTML = `<span aria-hidden="true">?</span> ${this.testing ? 'Test question' : `Refill ${esc(resourceName)}`}`;
                    bindBtn(q);
                    overlay.querySelector('.mpg-status').appendChild(q);
                }
                box.style.setProperty('--cols', String(Math.min(3, Math.max(2, layout.cols || 2))));
                pad.classList.toggle('no-stick', layout.stick === false);
                overlay.classList.toggle('touch-no-stick', layout.stick === false);
                overlay.classList.toggle('touch-local-stick', layout.stickZone === 'local');
                pad.dataset.game = this.mode || '';
                const measure = () => pad.style.setProperty('--btns-h', `${list.length ? (box.offsetHeight || 170) : 0}px`);
                measure();
                requestAnimationFrame(() => { measure(); this.layoutHud(); });
            };
        }

        resize() {
            this.graphics = graphicsProfile();
            const dpr = Math.min(window.devicePixelRatio || 1, this.graphics.maxDpr);
            const w = this.overlay.clientWidth, h = this.overlay.clientHeight;
            if (this.canvas.width !== Math.floor(w * dpr)) this.canvas.width = Math.floor(w * dpr);
            if (this.canvas.height !== Math.floor(h * dpr)) this.canvas.height = Math.floor(h * dpr);
            this.dpr = dpr;
            this.scale = clamp(h / 720, .65, 1.25);
            this.vw = w / this.scale;
            this.vh = h / this.scale;
            this.layoutHud();
        }

        layoutHud() {
            if (!this.overlay || !this.scale) return;
            const root = this.overlay.getBoundingClientRect();
            const header = this.overlay.querySelector('.mpg-hud').getBoundingClientRect();
            let top = header.bottom - root.top + 8;
            if (this.mode === 'chess') this.overlay.style.setProperty('--chess-top', `${top}px`);
            let bottom = 8;
            const touch = this.overlay.classList.contains('has-touch');
            const selectors = touch ? ['.mpg-stick', '.mpg-btns'] : [];
            for (const selector of selectors) {
                const el = this.overlay.querySelector(selector);
                const rect = el.getBoundingClientRect();
                if (el.offsetWidth && el.offsetHeight) bottom = Math.max(bottom, root.bottom - rect.top + 8);
            }
            this.hudInsets = { top: top / this.scale, left: 8 / this.scale, right: 8 / this.scale, bottom: bottom / this.scale };
        }

        hudBounds() {
            const i = this.hudInsets || { top: 90, left: 12, right: 12, bottom: 90 };
            return { x: i.left, y: i.top, w: Math.max(1, this.vw - i.left - i.right), h: Math.max(1, this.vh - i.top - i.bottom) };
        }

        // Fit a canvas HUD group without changing world-camera coordinates; caller restores the context.
        placeHud(ctx, x, y, w, h, anchor = 'top-left', offset = 0) {
            const b = this.hudBounds();
            const scale = Math.min(Math.max(1, 1 / this.scale), b.w / w, Math.max(1, b.h - offset) / h);
            const px = anchor.endsWith('right') ? b.x + b.w - w * scale : anchor.endsWith('center') || anchor === 'center' ? b.x + (b.w - w * scale) / 2 : b.x;
            const py = anchor.startsWith('bottom') ? b.y + b.h - h * scale - offset : anchor === 'center' ? b.y + (b.h - h * scale) / 2 : b.y + offset;
            const transform = { x: px - x * scale, y: py - y * scale, scale };
            ctx.save(); ctx.translate(transform.x, transform.y); ctx.scale(scale, scale);
            return transform;
        }

        updateHud() {
            if (this.preview) return;
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
            const countdownTimer = this.practice ? Number.isFinite(this.deadline) : this.room.goal_type === 'time';
            o.querySelector('.mpg-timer').textContent = countdownTimer && Number.isFinite(left)
                ? `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`
                : `${Math.floor(this.t / 60)}:${String(Math.floor(this.t) % 60).padStart(2, '0')}`;
            const touch = o.classList.contains('has-touch');
            const hint = touch ? (this.game.touchHint?.() || this.game.hint()) : this.game.hint();
            const controlsHint = touch ? '' : 'Keyboard/mouse controls';
            const goalInstructions = this.mode === 'shooter' ? `Eliminate ${this.game.multiplayer ? 'opponents' : 'drones'} to score`
                : GAME_GOALS[this.mode] || 'Earn the highest score';
            const hintText = this.question ? '' : [`Goal: ${goalInstructions}`, controlsHint, hint].filter(Boolean).join(' · ');
            const hintNode = o.querySelector('.mpg-hint');
            if (hintNode.textContent !== hintText) hintNode.textContent = hintText;
            this.applyTouchLayout?.();
            const diagnostics = o.querySelector('.mpg-test-stats');
            if (diagnostics) {
                const me = this.game.me;
                const position = me ? `${Math.round(me.x)}, ${Math.round(me.y)}` : 'Not applicable';
                diagnostics.textContent = `Mode: ${this.mode}\nSeed: ${this.seed}\nTime: ${this.t.toFixed(1)}s\nPlayers: ${this.roster.size}\nPosition: ${position}\nResources: infinite\nScore: ${Math.round(this.score)}\nObjective: ${Math.round(this.goal)}${this.mode === 'skyline' ? `\nFly speed: ${this.testFlySpeed || 600} units/s\nCheckpoint: ${this.game.cp.id + 1}/${this.game.checkpoints.length}\nSolids: ${this.game.solids.length}\nMachines: ${this.game.drills.length}` : ''}`;
            }
            const boardMarkup = this.standings().slice(0, 6).map((row, i) =>
                `<li class="${row.id === this.user.id ? 'me' : ''}">${avatarMarkup(row, 'mpg-player-avatar')}<span>${i + 1}. ${esc(row.n)} ${accountTagMarkup(row.username, row.tags)}</span><b>${this.valueText(row)}</b></li>`).join('');
            if (boardMarkup !== this.lastBoardMarkup) {
                o.querySelector('.mpg-board').innerHTML = boardMarkup;
                this.lastBoardMarkup = boardMarkup;
            }
        }

        updateMeter() {
            if (this.preview) return;
            const res = this.game.res;
            const hidden = !res || this.testing;
            const value = res ? Math.round(res.value) : 0, low = Boolean(res && res.value < 1), label = res?.label || '';
            const previous = this.meterState;
            if (previous && previous.hidden === hidden && previous.value === value && previous.low === low && previous.label === label) return;
            const elements = this.meterElements ||= (() => {
                const box = this.overlay.querySelector('.mpg-meter');
                return { box, label: box.querySelector('.mpg-meter-label'), value: box.querySelector('.mpg-meter-value') };
            })();
            if (!previous || previous.hidden !== hidden) elements.box.classList.toggle('hidden', hidden);
            if (!hidden) {
                if (!previous || previous.hidden || previous.label !== label) elements.label.textContent = label;
                if (!previous || previous.hidden || previous.value !== value) elements.value.textContent = `${value}`;
                if (!previous || previous.hidden || previous.low !== low) elements.box.classList.toggle('low', low);
            }
            this.meterState = { hidden, value, low, label };
        }

        renderResults() {
            if (this.preview) return;
            const panel = this.overlay.querySelector('.mpg-results');
            const scrollTop = panel.querySelector('.mpg-results-card')?.scrollTop || 0;
            const focusSummary = panel.contains(document.activeElement) && document.activeElement.tagName === 'SUMMARY';
            const summaryOpen = panel.querySelector('.mpg-summary')?.open;
            const rows = this.standingsCache || this.standings();
            const winner = rows[0];
            const tied = winner && rows.filter(row => this.metric(row) === this.metric(winner)).length > 1;
            const title = this.game.resultTitle ? this.game.resultTitle(rows) : this.game.teamsOn && this.game.teamTd
                ? this.game.teamTd[0] === this.game.teamTd[1] ? 'Teams tied!' : `${this.game.teamTd[0] > this.game.teamTd[1] ? 'Blue' : 'Red'} team wins!`
                : this.mode === 'chess' && this.game.state.winner === -2 ? 'Draw!'
                    : winner ? tied ? 'First-place tie!' : `${winner.n} wins!` : 'Game over';
            panel.classList.remove('hidden');
            panel.innerHTML = `<div class="mpg-results-card">
                <small>${this.testing ? 'Test finished' : this.practice ? 'Practice complete' : 'Match over'}</small>
                <h2>${esc(title)}</h2>
                <ol>${rows.map(row => `<li class="${row.id === this.user.id ? 'me' : ''}"><span class="rank">${rows.findIndex(other => this.metric(other) === this.metric(row)) + 1}</span>${avatarMarkup(row, 'mpg-player-avatar')}<strong>${esc(row.n)} ${accountTagMarkup(row.username, row.tags)}</strong><b>${this.valueText(row)}</b><em>${!this.user.is_anonymous && this.rewards ? `+${Number(this.rewards[row.id] || 0)} coins` : ''}</em></li>`).join('')}</ol>
                <p class="mpg-accuracy">${this.answered ? `${Math.round(this.correct / this.answered * 100)}% correct` : 'No answers submitted'} · ${this.correct} correct · ${Math.max(0, this.answered - this.correct)} incorrect · ${this.answered} answered</p>
                <details class="mpg-summary"><summary>Full game summary</summary>
                    <p>${Math.round(this.t)} seconds played · ${(this.questionHistory || []).filter(answer => answer.correct === null).length} skipped</p>
                    ${questionHistoryMarkup(this.questionHistory)}
                    ${window.NexusApp?.studySetMarkup?.(this.studySet) || ''}
                </details>
                <p>${this.user.is_anonymous ? 'Guest match complete. Guest sessions do not save account progress or earn coins.' : this.practice ? 'Local results only. Practice games and staff tests do not award coins.' : this.rewards ? 'Coins have been added to your multiplayer wallet.' : 'Tallying coin rewards…'}</p>
                <button type="button" class="mpg-exit">${this.practice ? 'Back to game setup' : 'Back to lobby'}</button>
            </div>`;
            panel.querySelector('.mpg-summary').open = Boolean(summaryOpen);
            panel.querySelector(focusSummary ? '.mpg-summary summary' : '.mpg-exit').focus({ preventScroll: true });
            panel.querySelector('.mpg-results-card').scrollTop = scrollTop;
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
                        this.sfx(step ? 'countdown' : 'go');
                    }
                    const text = this.countdown > 0.4 ? String(Math.ceil(this.countdown - 0.4)) : 'GO!';
                    const el = this.overlay.querySelector('.mpg-countdown');
                    el.textContent = this.countdown > -0.2 ? text : '';
                    el.classList.toggle('hidden', this.countdown <= -0.2);
                } else {
                    if (!this.countdownHidden) {
                        this.overlay.querySelector('.mpg-countdown').classList.add('hidden');
                        this.countdownHidden = true;
                    }
                    if (!this.paused) {
                        this.t += dt;
                        this.onTick?.(dt);
                        if (this.testing && this.game.res) this.game.res.value = this.game.res.max;
                        this.game.update(dt);
                        if (this.testing && this.game.res) this.game.res.value = this.game.res.max;
                    }
                    this.checkEnd();
                    if (!this.practice && !this.isHost && !this.over && Date.now() > this.deadline + 9000) this.finish(this.standings());
                }
            }
            if (!this.paused) {
                for (const r of this.remotes.values()) {
                    if (now - r.seen > 5000) { this.remotes.delete(r.id); continue; }
                    const age = this.mode === 'sports' && r.networked ? Math.min(.15, (now - r.seen) / 1000 + (r.networkAge || 0)) : 0;
                    const tx = r.tx + r.vx * age, ty = r.ty + r.vy * age;
                    const gap = dist(r.x, r.y, tx, ty);
                    const k = gap > 500 ? 1 : 1 - Math.exp(-dt * (this.mode === 'sports' ? 24 : 14));
                    r.x += (tx - r.x) * k;
                    r.y += (ty - r.y) * k;
                }
            }
            this.updateMeter();
            this.justPressed.clear();
            this.mouse.pressed = false;
            this.mouse.rpressed = false;
            if ((this.mode !== 'chess' || this.preview) && now - (this.lastDrawAt ?? -Infinity) >= 1000 / (this.graphics?.fps ?? Infinity) - .1) {
                this.lastDrawAt = now;
                const ctx = this.ctx;
                ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
                this.game.draw(ctx, this.vw, this.vh);
            }
            this.raf = requestAnimationFrame(t => this.frame(t));
        }

        destroy() {
            this.destroyed = true;
            if (!this.preview) window.StudBudSfx?.endMusic();
            cancelAnimationFrame(this.raf);
            this.hudObserver?.disconnect();
            clearInterval(this.sendTimer);
            clearInterval(this.hudTimer);
            clearInterval(this.reportTimer);
            window.removeEventListener('keydown', this.handlers.keydown);
            window.removeEventListener('keyup', this.handlers.keyup);
            window.removeEventListener('blur', this.handlers.blur);
            window.removeEventListener('resize', this.handlers.resize);
            window.removeEventListener('pointermove', this.stickHandlers?.move);
            window.removeEventListener('pointerup', this.stickHandlers?.end);
            window.removeEventListener('pointercancel', this.stickHandlers?.end);
            for (const end of this.touchButtonHandlers || []) {
                window.removeEventListener('pointerup', end);
                window.removeEventListener('pointercancel', end);
            }
            if (this.channel) {
                try { (this.api.getGameClient?.() || this.api.getClient()).removeChannel(this.channel); }
                catch (error) { console.error('[Multiplayer] Channel cleanup failed:', error); }
            }
            this.overlay.remove();
            document.body.classList.remove('mpg-active');
            if (!this.preview && this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
            lockViewportZoom(false);
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { });
        }
    }

    function playerCosmetics(player) {
        const legacyAcc = player?.equipped_accessory ?? player?.accessory ?? player?.acc ?? player?.cos?.acc ?? '';
        const explicitEffect = player?.equipped_effect ?? player?.effect ?? player?.cos?.effect ?? '';
        const effect = explicitEffect || (isAuraCosmetic(legacyAcc) ? legacyAcc : '');
        return {
            skin: player?.equipped_skin ?? player?.skin ?? player?.cos?.skin ?? '',
            hat: player?.equipped_hat ?? player?.hat ?? player?.cos?.hat ?? '',
            acc: isAuraCosmetic(legacyAcc) ? '' : legacyAcc,
            effect,
            color: player?.color || player?.cos?.color || ((player?.equipped_palette || player?.palette)
                ? playerColor({ ...player, palette: player.equipped_palette || player.palette }) : '#34d399')
        };
    }

    // Players with no skin, colour or palette get distinct colours so default characters are easy to tell apart.
    function defaultPlayerColors(players) {
        const isDefault = player => !(player?.equipped_skin ?? player?.skin ?? player?.cos?.skin)
            && !(player?.color || player?.cos?.color || player?.equipped_palette || player?.palette);
        const used = new Set(players.filter(player => !isDefault(player)).map(player => playerCosmetics(player).color));
        const assigned = new Map();
        for (const player of [...players].filter(isDefault).sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
            const start = hashStr(String(player.id || 'x')) % PALETTE.length;
            let color = PALETTE[start];
            for (let k = 0; k < PALETTE.length; k++) {
                const candidate = PALETTE[(start + k) % PALETTE.length];
                if (!used.has(candidate)) { color = candidate; break; }
            }
            used.add(color); assigned.set(player.id, color);
        }
        return assigned;
    }

    function isAuraCosmetic(id) {
        return Boolean(id && (COSMETIC_PARTICLES[id] || ['acc_flame', 'acc_lightning'].includes(id)));
    }

    const avatarCache = new Map();
    function drawAvatar(canvas, player, time = 0) {
        const cos = playerCosmetics(player);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(canvas.width / 80, canvas.height / 80);
        const stormHat = cos.effect === 'acc_storm_effect' && cos.hat;
        if (stormHat) { ctx.translate(8, 8); ctx.scale(.8, .8); }
        drawFigureSide(ctx, { color: cos.color, cos }, 29, stormHat ? 40 : 30, 22, 37, 1, time, false);
        ctx.restore();
    }

    function avatarUrl(player) {
        const cos = playerCosmetics(player);
        const key = [cos.skin, cos.hat, cos.acc, cos.effect, cos.color].join('|');
        if (!avatarCache.has(key)) {
            const canvas = document.createElement('canvas');
            canvas.width = 240; canvas.height = 240;
            drawAvatar(canvas, player);
            if (avatarCache.size >= 300) avatarCache.delete(avatarCache.keys().next().value);
            avatarCache.set(key, canvas.toDataURL('image/png'));
        }
        return avatarCache.get(key);
    }

    function animatedCosmetics(player) {
        const cos = playerCosmetics(player);
        return Boolean(SKINS[cos.skin]?.mythic || cos.hat === 'hat_cosmic' || COSMETIC_PARTICLES[cos.effect]
            || ['acc_wings', 'acc_phoenix', 'acc_fairy', 'acc_jetpack', 'acc_tail'].includes(cos.acc));
    }

    let avatarObserver = null;
    function observeAvatars() {
        if (avatarObserver) return;
        const canvases = new Set();
        const visible = new Set();
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let frame = 0, lastTime = -Infinity;
        const draw = time => {
            frame = 0;
            if (document.hidden || motion.matches || !visible.size) return;
            if (time - lastTime >= 1000 / graphicsProfile().avatarFps) {
                lastTime = time;
                for (const canvas of visible) drawAvatar(canvas, { cos: canvas.dataset }, time / 1000);
            }
            frame = requestAnimationFrame(draw);
        };
        const resume = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            lastTime = -Infinity;
            if (motion.matches) {
                for (const canvas of canvases) drawAvatar(canvas, { cos: canvas.dataset });
            } else if (!document.hidden && visible.size) frame = requestAnimationFrame(draw);
        };
        const intersection = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting && canvases.has(entry.target) && entry.target.isConnected) visible.add(entry.target);
                else visible.delete(entry.target);
            }
            resume();
        });
        const sync = () => {
            for (const canvas of canvases) {
                if (!canvas.isConnected) {
                    intersection.unobserve(canvas);
                    canvases.delete(canvas);
                    visible.delete(canvas);
                }
            }
            for (const canvas of document.querySelectorAll('canvas[data-avatar]')) {
                if (canvases.has(canvas)) continue;
                canvases.add(canvas);
                drawAvatar(canvas, { cos: canvas.dataset });
                intersection.observe(canvas);
            }
            if (!visible.size) { cancelAnimationFrame(frame); frame = 0; }
        };
        avatarObserver = new MutationObserver(sync);
        avatarObserver.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('visibilitychange', resume);
        motion.addEventListener('change', resume);
        sync();
    }

    function avatarMarkup(player, className = '') {
        const cos = playerCosmetics(player);
        const attrs = ['skin', 'hat', 'acc', 'effect', 'color'].map(key => `data-${key}="${esc(cos[key])}"`).join(' ');
        const classAttr = `class="${esc(className)}"`;
        if (!animatedCosmetics(player)) return `<img ${classAttr} src="${avatarUrl(player)}" alt="" draggable="false">`;
        observeAvatars();
        return `<canvas ${classAttr} width="240" height="240" data-avatar ${attrs} aria-hidden="true"></canvas>`;
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
        skin_bee: { body: '#facc15', head: '#fde68a', eye: '#1c1917', trim: '#1c1917' },
        skin_ocean: { body: '#0e7490', head: '#a5f3fc', eye: '#083344', trim: '#f59e0b' },
        skin_forest: { body: '#166534', head: '#bbf7d0', eye: '#14532d', trim: '#a16207' },
        skin_ice: { body: '#bae6fd', head: '#f0f9ff', eye: '#1e3a8a', trim: '#60a5fa', alpha: 0.94 },
        skin_chrome: { body: '#94a3b8', head: '#e2e8f0', eye: '#22d3ee', trim: '#475569' },
        skin_cosmic: { body: '#0f0a1f', head: '#2e1065', eye: '#f0abfc', trim: '#22d3ee' },
        skin_dragon: { body: '#15803d', head: '#4ade80', eye: '#fde047', trim: '#7f1d1d' },
        skin_candy: { body: '#fb7185', head: '#fecdd3', eye: '#4c0519', trim: '#fff1f2' },
        skin_mummy: { body: '#d6c7a1', head: '#e7dcc0', eye: '#1c1917', trim: '#a8946a' },
        skin_vampire: { body: '#7f1d1d', head: '#f1e4e4', eye: '#ef4444', trim: '#1c1917' },
        skin_samurai: { body: '#b91c1c', head: '#fde7c8', eye: '#111827', trim: '#facc15' },
        skin_neon: { body: '#22d3ee', head: '#e879f9', eye: '#0f172a', trim: '#a3e635' },
        skin_pixel: { body: '#4ade80', head: '#bbf7d0', eye: '#052e16', trim: '#166534' },
        skin_steampunk: { body: '#a16207', head: '#fcd9a8', eye: '#422006', trim: '#78350f' },
        skin_rainbow: { body: '#a855f7', head: '#fde047', eye: '#0f172a', trim: '#22c55e' },
        skin_sprout: { body: '#65a30d', head: '#d9f99d', eye: '#1a2e05', trim: '#3f6212' },
        skin_sunny: { body: '#fbbf24', head: '#fef3c7', eye: '#78350f', trim: '#d97706' },
        skin_berry: { body: '#7c3aed', head: '#ddd6fe', eye: '#2e1065', trim: '#a21caf' },
        skin_storm: { body: '#475569', head: '#cbd5e1', eye: '#0f172a', trim: '#38bdf8' },
        skin_minty: { body: '#34d399', head: '#d1fae5', eye: '#064e3b', trim: '#059669' },
        skin_celestial: { body: '#fef3c7', head: '#fffbeb', eye: '#7c3aed', trim: '#facc15', mythic: ['#fde047', '#a78bfa'] },
        skin_inferno: { body: '#991b1b', head: '#fb923c', eye: '#fef08a', trim: '#fbbf24', mythic: ['#f97316', '#ef4444'] },
        skin_bookworm: { body: '#92400e', head: '#fde7c8', eye: '#172554', trim: '#fef3c7' },
        skin_astronaut: { body: '#e2e8f0', head: '#0e7490', eye: '#67e8f9', trim: '#fb923c' },
        skin_axolotl: { body: '#6ee7b7', head: '#fbcfe8', eye: '#831843', trim: '#f472b6' }
    };

    // Shimmering aura shared by mythic skins and the Mythic Aura accessory.
    function drawMythicAura(ctx, cx, cy, radius, colors, time) {
        ctx.save();
        const pulse = 1 + Math.sin(time * 3) * 0.08;
        const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * pulse);
        glow.addColorStop(0, colors[0] + '55'); glow.addColorStop(0.6, colors[1] + '33'); glow.addColorStop(1, colors[1] + '00');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, radius * pulse, 0, TAU); ctx.fill();
        const baseAlpha = ctx.globalAlpha;
        for (let i = 0; i < 5; i++) {
            const a = time * 1.8 + i * TAU / 5, rr = radius * (0.75 + Math.sin(time * 4 + i) * 0.1);
            ctx.fillStyle = i % 2 ? colors[0] : colors[1];
            ctx.globalAlpha = baseAlpha * (0.6 + Math.sin(time * 7 + i) * 0.35);
            ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, Math.max(1.2, radius * 0.06), 0, TAU); ctx.fill();
        }
        ctx.restore();
    }

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
        if (typeof p === 'string') return { color: p, skin: null, hat: '', acc: '', effect: '' };
        const cos = playerCosmetics(p);
        return { color: cos.color, skinId: cos.skin || '', skin: SKINS[cos.skin] || null, hat: LEGACY_HATS[cos.hat] || cos.hat || '', acc: cos.acc || '', effect: cos.effect || '' };
    }

    function drawHat(ctx, hat, cx, top, r, tilt = 0, time = 0) {
        if (!hat) return;
        ctx.save();
        ctx.translate(cx, top);
        ctx.rotate(tilt);
        const fill = (color, fn) => { ctx.fillStyle = color; ctx.beginPath(); fn(); ctx.fill(); };
        if (SEASONAL_HATS[hat]) {
            drawSeasonalHat(ctx, SEASONAL_HATS[hat], r);
        } else if (hat === 'hat_cap') {
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
            ctx.fillStyle = '#111827'; ctx.fillRect(-r * 0.8, -r * 1.5, r * 1.6, r * 1.85);
            fill('#111827', () => ctx.ellipse(0, r * 0.3, r * 1.3, r * 0.28, 0, 0, TAU));
            ctx.fillStyle = '#dc2626'; ctx.fillRect(-r * 0.8, -r * 0.1, r * 1.6, r * 0.3);
        } else if (hat === 'hat_fedora' || hat === 'hat_fedora_black') {
            const black = hat === 'hat_fedora_black';
            fill(black ? '#09090b' : '#78350f', () => ctx.ellipse(0, r * .3, r * 1.5, r * .25, -.04, 0, TAU));
            fill(black ? '#18181b' : '#a16207', () => {
                ctx.moveTo(-r * .85, r * .25); ctx.lineTo(-r * .65, -r * .95);
                ctx.quadraticCurveTo(-r * .25, -r * 1.15, 0, -r * .8);
                ctx.quadraticCurveTo(r * .35, -r * 1.1, r * .65, -r * .85);
                ctx.lineTo(r * .85, r * .25);
            });
            ctx.fillStyle = black ? '#3f3f46' : '#292524'; ctx.fillRect(-r * .78, -r * .05, r * 1.56, r * .25);
            ctx.strokeStyle = black ? '#71717a' : '#fcd34d'; ctx.lineWidth = r * .08;
            ctx.beginPath(); ctx.moveTo(-r * .52, -r * .8); ctx.lineTo(-r * .2, -r * .65); ctx.stroke();
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
        } else if (hat === 'hat_beret') {
            fill('#be123c', () => ctx.ellipse(-r * 0.1, r * 0.05, r * 1.1, r * 0.45, -0.12, 0, TAU));
            ctx.fillStyle = '#881337'; ctx.fillRect(-r * 0.08, -r * 0.6, r * 0.16, r * 0.3);
        } else if (hat === 'hat_sombrero') {
            fill('#d97706', () => ctx.ellipse(0, r * 0.4, r * 2.1, r * 0.35, 0, 0, TAU));
            fill('#f59e0b', () => { ctx.moveTo(-r * 0.75, r * 0.35); ctx.quadraticCurveTo(0, -r * 1.8, r * 0.75, r * 0.35); });
            ctx.fillStyle = '#16a34a'; ctx.fillRect(-r * 0.72, r * 0.08, r * 1.44, r * 0.18);
            ctx.fillStyle = '#dc2626'; ctx.fillRect(-r * 1.9, r * 0.33, r * 3.8, r * 0.1);
        } else if (hat === 'hat_frog') {
            fill('#22c55e', () => ctx.arc(0, r * 0.45, r * 1.0, Math.PI, TAU));
            fill('#f8fafc', () => { ctx.arc(-r * 0.5, -r * 0.45, r * 0.34, 0, TAU); ctx.arc(r * 0.5, -r * 0.45, r * 0.34, 0, TAU); });
            fill('#0f172a', () => { ctx.arc(-r * 0.45, -r * 0.45, r * 0.15, 0, TAU); ctx.arc(r * 0.55, -r * 0.45, r * 0.15, 0, TAU); });
        } else if (hat === 'hat_mushroom') {
            fill('#dc2626', () => { ctx.ellipse(0, r * 0.2, r * 1.35, r * 0.95, 0, Math.PI, TAU); });
            fill('#f8fafc', () => { ctx.arc(-r * 0.6, -r * 0.2, r * 0.2, 0, TAU); ctx.arc(r * 0.15, -r * 0.5, r * 0.24, 0, TAU); ctx.arc(r * 0.8, -r * 0.05, r * 0.17, 0, TAU); });
        } else if (hat === 'hat_unicorn') {
            fill('#fde68a', () => { ctx.moveTo(-r * 0.3, r * 0.2); ctx.lineTo(0, -r * 1.7); ctx.lineTo(r * 0.3, r * 0.2); });
            ctx.strokeStyle = '#f472b6'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(-r * 0.22, -r * 0.1); ctx.lineTo(r * 0.2, -r * 0.4); ctx.moveTo(-r * 0.14, -r * 0.7); ctx.lineTo(r * 0.12, -r * 0.95); ctx.stroke();
            fill('#c084fc', () => ctx.arc(-r * 0.75, r * 0.15, r * 0.25, 0, TAU));
            fill('#f9a8d4', () => ctx.arc(r * 0.75, r * 0.15, r * 0.25, 0, TAU));
        } else if (hat === 'hat_aviator') {
            fill('#78350f', () => ctx.arc(0, r * .2, r, Math.PI, TAU));
            ctx.fillStyle = '#92400e'; ctx.fillRect(-r * 1.05, r * .05, r * .35, r * .9); ctx.fillRect(r * .7, r * .05, r * .35, r * .9);
            for (const side of [-1, 1]) {
                fill('#facc15', () => ctx.ellipse(side * r * .4, -r * .1, r * .38, r * .28, 0, 0, TAU));
                fill('#67e8f9', () => ctx.ellipse(side * r * .4, -r * .1, r * .26, r * .17, 0, 0, TAU));
            }
        } else if (hat === 'hat_prism') {
            for (let i = 0; i < 3; i++) {
                const x = (i - 1) * r * .65;
                fill(['#67e8f9', '#c084fc', '#f9a8d4'][i], () => {
                    ctx.moveTo(x, -r * (i === 1 ? 1.6 : .9)); ctx.lineTo(x + r * .4, r * .2);
                    ctx.lineTo(x, r * .5); ctx.lineTo(x - r * .4, r * .2);
                });
                ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1; ctx.stroke();
            }
        } else if (hat === 'hat_satellite') {
            ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.ellipse(0, -r * .5, r * 1.6, r * .55, -.25, 0, TAU); ctx.stroke();
            ctx.fillStyle = '#94a3b8'; ctx.fillRect(-r * .35, -r * 1.1, r * .7, r * .6);
            ctx.fillStyle = '#2563eb'; ctx.fillRect(-r * 1.1, -r * 1.15, r * .6, r * .75); ctx.fillRect(r * .5, -r * 1.15, r * .6, r * .75);
            fill('#facc15', () => ctx.arc(r * 1.25, -r * .8, r * .18, 0, TAU));
        } else if (hat === 'hat_tiara') {
            fill('#e5e7eb', () => { ctx.moveTo(-r * 0.9, r * 0.3); ctx.lineTo(-r * 0.6, -r * 0.2); ctx.lineTo(-r * 0.3, r * 0.05); ctx.lineTo(0, -r * 0.65); ctx.lineTo(r * 0.3, r * 0.05); ctx.lineTo(r * 0.6, -r * 0.2); ctx.lineTo(r * 0.9, r * 0.3); });
            fill('#ec4899', () => ctx.arc(0, -r * 0.25, r * 0.16, 0, TAU));
            fill('#38bdf8', () => { ctx.arc(-r * 0.6, r * 0.05, r * 0.1, 0, TAU); ctx.arc(r * 0.6, r * 0.05, r * 0.1, 0, TAU); });
        } else if (hat === 'hat_visor') {
            fill('#f8fafc', () => ctx.ellipse(r * 0.35, r * 0.35, r * 1.25, r * 0.22, 0, 0, TAU));
            ctx.fillStyle = '#0ea5e9'; ctx.fillRect(-r * 1.0, r * 0.05, r * 2.0, r * 0.3);
        } else if (hat === 'hat_bucket') {
            fill('#a3a380', () => ctx.ellipse(0, r * 0.38, r * 1.45, r * 0.3, 0, 0, TAU));
            fill('#bdbd94', () => { ctx.moveTo(-r * 0.95, r * 0.35); ctx.lineTo(-r * 0.75, -r * 0.55); ctx.quadraticCurveTo(0, -r * 0.8, r * 0.75, -r * 0.55); ctx.lineTo(r * 0.95, r * 0.35); });
            ctx.fillStyle = '#6b6b4e'; ctx.fillRect(-r * 0.88, r * 0.08, r * 1.76, r * 0.16);
        } else if (hat === 'hat_astronaut') {
            ctx.fillStyle = 'rgba(186,230,253,.35)'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = r * 0.18;
            ctx.beginPath(); ctx.arc(0, r * 0.95, r * 1.45, 0, TAU); ctx.fill(); ctx.stroke();
            fill('rgba(255,255,255,.6)', () => ctx.ellipse(-r * 0.55, r * 0.2, r * 0.22, r * 0.4, 0.5, 0, TAU));
            fill('#ef4444', () => ctx.arc(0, -r * 0.5, r * 0.16, 0, TAU));
        } else if (hat === 'hat_cosmic') {
            const t = time;
            const glow = ctx.createLinearGradient(-r, -r, r, r);
            glow.addColorStop(0, '#f43f5e'); glow.addColorStop(0.5, '#a855f7'); glow.addColorStop(1, '#22d3ee');
            fill(glow, () => {
                ctx.moveTo(-r * 1.0, r * 0.35); ctx.lineTo(-r * 1.1, -r * 1.05); ctx.lineTo(-r * 0.5, -r * 0.35);
                ctx.lineTo(0, -r * 1.45); ctx.lineTo(r * 0.5, -r * 0.35); ctx.lineTo(r * 1.1, -r * 1.05); ctx.lineTo(r * 1.0, r * 0.35);
            });
            fill('#fef9c3', () => { ctx.arc(-r * 1.1, -r * 1.05, r * 0.14, 0, TAU); ctx.arc(0, -r * 1.45, r * 0.18, 0, TAU); ctx.arc(r * 1.1, -r * 1.05, r * 0.14, 0, TAU); });
            ctx.fillStyle = `rgba(254,249,195,${0.5 + Math.sin(t * 6) * 0.4})`;
            for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.1; ctx.fillRect(Math.cos(a) * r * 1.5 - 1, -r * 0.6 + Math.sin(a) * r * 0.5 - 1, 2.5, 2.5); }
        }
        ctx.restore();
    }

    // Side-on character. (x, y) is the top-left of the body box.
    const COSMETIC_PARTICLES = {
        acc_aura: { shape: 'gate', colors: ['#67e8f9', '#c4b5fd', '#fef3c7'] },
        acc_storm_effect: { shape: 'storm', colors: ['#475569', '#7dd3fc', '#fef08a'] },
        acc_blackhole_effect: { shape: 'blackhole', colors: ['#fb923c', '#c084fc', '#fef3c7'] },
        acc_firefly_effect: { shape: 'firefly', colors: ['#bef264', '#fef08a', '#86efac'] },
        acc_jellyfish_effect: { shape: 'jellyfish', colors: ['#67e8f9', '#c084fc', '#f9a8d4'] },
        acc_prism_effect: { shape: 'diamond', colors: ['#22d3ee', '#c084fc'] },
        acc_frost_effect: { shape: 'snowflake', colors: ['#bae6fd', '#60a5fa'] },
        acc_ember_effect: { shape: 'flame', colors: ['#fb923c', '#ef4444'] },
        acc_heart_effect: { shape: 'heart', colors: ['#fb7185', '#f472b6'] },
        acc_dew_effect: { shape: 'bubble', colors: ['#99f6e4', '#bae6fd'] },
        acc_leaf_effect: { shape: 'leaf', colors: ['#86efac', '#55c995', '#bef264'] },
        acc_snowflake_effect: { shape: 'snowflake', colors: ['#e0f2fe', '#7dd3fc'] },
        acc_electric_effect: { shape: 'bolt', colors: ['#fde047', '#38bdf8'] },
        acc_solar_effect: { shape: 'ray', colors: ['#fde68a', '#fbbf24', '#fb923c'] },
        acc_vortex_effect: { shape: 'vortex', colors: ['#c084fc', '#22d3ee', '#f0abfc'] },
        acc_cloud_effect: { shape: 'dust', colors: ['#cbd5e1', '#f0f7f2', '#bae6fd'] },
        acc_confetti_effect: { shape: 'confetti', colors: ['#fb7185', '#fbbf24', '#55c995', '#a78bfa'] },
        acc_sakura_effect: { shape: 'petal', colors: ['#fbcfe8', '#f9a8d4', '#f472b6'] },
        acc_pixel_effect: { shape: 'pixel', colors: ['#22d3ee', '#55c995', '#b6a0ff'] },
        acc_meteor_effect: { shape: 'meteor', colors: ['#fde68a', '#fb923c', '#fbbf24'] },
        acc_aurora_effect: { shape: 'ribbon', colors: ['#70e2c0', '#a99bff', '#67e8f9'] },
        acc_rune_effect: { shape: 'rune', colors: ['#c4b5fd', '#a78bfa', '#22d3ee'] },
        acc_lunar_effect: { shape: 'crescent', colors: ['#e0e7ff', '#93c5fd', '#c4b5fd'] },
        acc_planet_effect: { shape: 'planet', colors: ['#38bdf8', '#c084fc', '#fb923c'] },
        acc_music_effect: { shape: 'note', colors: ['#a7f3d0', '#fde68a', '#93c5fd'] },
        acc_blossom_effect: { shape: 'blossom', colors: ['#fbcfe8', '#f9a8d4', '#f472b6'] },
        acc_bubble_effect: { shape: 'bubble', colors: ['#a5f3fc', '#c4b5fd', '#f9a8d4'] },
        acc_comet_effect: { shape: 'comet', colors: ['#fef08a', '#67e8f9', '#f0abfc'] },
        acc_spiral_effect: { shape: 'spiral', colors: ['#c4b5fd', '#22d3ee', '#fde68a'] },
        acc_spark_effect: { shape: 'spark', colors: ['#fde68a', '#fb7185', '#67e8f9'] },
        acc_sparkles: { shape: 'spark', colors: ['#fde68a', '#f0abfc', '#67e8f9'] },
        acc_flame: { shape: 'flame', colors: ['#fb923c', '#ef4444', '#fde047'] },
        acc_lightning: { shape: 'bolt', colors: ['#fde047', '#38bdf8'] },
        acc_hearts: { shape: 'heart', colors: ['#fb7185', '#f472b6'] },
        acc_stars: { shape: 'star', colors: ['#fde047', '#fef3c7'] },
        acc_snow: { shape: 'snowflake', colors: ['#e0f2fe', '#7dd3fc'] }
    };

    const SEASONAL_HATS = {};
    (window.StudBudCommunityGames?.catalog || []).forEach(item => {
        if (!item.season) return;
        if (item.skinColors) SKINS[item.id] = item.skinColors;
        if (item.particle) COSMETIC_PARTICLES[item.id] = item.particle;
        if (item.hatShape) SEASONAL_HATS[item.id] = { shape: item.hatShape, colors: item.hatColors };
    });

    function drawSeasonalHat(ctx, { shape, colors: [main, accent, detail] }, r) {
        const fill = (color, fn) => { ctx.fillStyle = color; ctx.beginPath(); fn(); ctx.fill(); };
        if (shape === 'tophat') {
            ctx.fillStyle = main; ctx.fillRect(-r * .78, -r * 1.45, r * 1.56, r * 1.8);
            fill(main, () => ctx.ellipse(0, r * .32, r * 1.3, r * .27, 0, 0, TAU));
            ctx.fillStyle = accent; ctx.fillRect(-r * .78, -r * .12, r * 1.56, r * .3);
            ctx.strokeStyle = detail; ctx.lineWidth = r * .1; ctx.strokeRect(-r * .22, -r * .1, r * .44, r * .26);
        } else if (shape === 'band') {
            ctx.strokeStyle = main; ctx.lineWidth = r * .24;
            ctx.beginPath(); ctx.arc(0, r * .85, r * 1.05, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
            for (const side of [-1, 1]) {
                const x = side * r * .55, y = -r * .55, h = r * .32;
                fill(side < 0 ? accent : detail, () => {
                    ctx.moveTo(x, y + h); ctx.bezierCurveTo(x - h * 1.6, y - h * .2, x - h * .5, y - h * 1.4, x, y - h * .3);
                    ctx.bezierCurveTo(x + h * .5, y - h * 1.4, x + h * 1.6, y - h * .2, x, y + h);
                });
            }
        } else if (shape === 'ears') {
            for (const side of [-1, 1]) {
                fill(main, () => ctx.ellipse(side * r * .45, -r * .75, r * .28, r * .95, side * .15, 0, TAU));
                fill(accent, () => ctx.ellipse(side * r * .45, -r * .72, r * .13, r * .7, side * .15, 0, TAU));
            }
            ctx.strokeStyle = detail; ctx.lineWidth = r * .18;
            ctx.beginPath(); ctx.arc(0, r * .8, r * 1.0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        } else if (shape === 'mortar') {
            fill(main, () => ctx.ellipse(0, r * .2, r * .85, r * .45, 0, 0, Math.PI));
            ctx.fillStyle = main; ctx.fillRect(-r * .85, -r * .15, r * 1.7, r * .38);
            fill(main, () => { ctx.moveTo(-r * 1.5, -r * .3); ctx.lineTo(0, -r * .85); ctx.lineTo(r * 1.5, -r * .3); ctx.lineTo(0, r * .2); });
            ctx.strokeStyle = accent; ctx.lineWidth = r * .09;
            ctx.beginPath(); ctx.moveTo(0, -r * .32); ctx.lineTo(r * 1.1, -r * .05); ctx.lineTo(r * 1.1, r * .55); ctx.stroke();
            fill(detail, () => ctx.arc(r * 1.1, r * .62, r * .14, 0, TAU));
        } else if (shape === 'straw') {
            fill(main, () => ctx.ellipse(0, r * .32, r * 1.85, r * .38, 0, 0, TAU));
            fill(detail, () => ctx.ellipse(0, -r * .2, r * .85, r * .62, 0, Math.PI, TAU));
            ctx.fillStyle = detail; ctx.fillRect(-r * .85, -r * .22, r * 1.7, r * .5);
            ctx.fillStyle = accent; ctx.fillRect(-r * .86, r * .02, r * 1.72, r * .22);
        } else if (shape === 'cone' || shape === 'witch' || shape === 'santa') {
            const tall = shape === 'witch' ? 2.2 : 1.8;
            if (shape === 'witch') fill(main, () => ctx.ellipse(0, r * .38, r * 1.7, r * .3, 0, 0, TAU));
            fill(main, () => {
                ctx.moveTo(-r * .9, r * .4);
                if (shape === 'santa') { ctx.quadraticCurveTo(-r * .2, -r * 1.6, r * 1.1, -r * .8); ctx.lineTo(r * .9, r * .4); }
                else { ctx.lineTo(shape === 'witch' ? r * .35 : 0, -r * tall); ctx.lineTo(r * .9, r * .4); }
            });
            if (shape === 'cone') for (let i = 0; i < 3; i++) {
                ctx.fillStyle = i % 2 ? detail : accent;
                const y = -r * (.1 + i * .45), w = r * .9 * (1 - (i * .45 + .3) / 2.2);
                ctx.fillRect(-w, y, w * 2, r * .18);
            }
            ctx.fillStyle = accent; ctx.fillRect(-r * (shape === 'witch' ? .85 : 1), r * .12, r * (shape === 'witch' ? 1.7 : 2), r * .3);
            const tip = shape === 'santa' ? [r * 1.15, -r * .75] : [0, -r * tall];
            if (shape !== 'witch') fill(shape === 'santa' ? accent : detail, () => ctx.arc(tip[0], tip[1], r * .24, 0, TAU));
        } else if (shape === 'cap') {
            fill(main, () => ctx.arc(0, r * .35, r * 1.02, Math.PI, TAU));
            fill(accent, () => ctx.rect(0, r * .2, r * 1.55, r * .26));
            ctx.strokeStyle = detail; ctx.lineWidth = r * .08;
            ctx.beginPath(); ctx.arc(0, r * .35, r * .62, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
            fill(accent, () => ctx.arc(0, -r * .66, r * .13, 0, TAU));
        } else if (shape === 'beanie') {
            fill(main, () => ctx.arc(0, r * .4, r * 1.0, Math.PI, TAU));
            ctx.strokeStyle = detail; ctx.lineWidth = r * .07;
            for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * .3, r * .15); ctx.lineTo(i * r * .25, -r * .45); ctx.stroke(); }
            ctx.fillStyle = detail; ctx.fillRect(-r * 1.02, r * .12, r * 2.04, r * .32);
            fill(accent, () => ctx.arc(0, -r * .62, r * .3, 0, TAU));
        }
    }

    function drawCosmeticParticle(ctx, shape, size) {
        ctx.lineWidth = Math.max(.8, size * .3);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.beginPath();
        if (shape === 'planet') {
            ctx.arc(0, 0, size * .65, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.ellipse(0, 0, size * 1.3, size * .4, -.4, 0, TAU); ctx.stroke();
        } else if (shape === 'note') {
            ctx.ellipse(-size * .4, size * .5, size * .45, size * .3, -.4, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0, size * .5); ctx.lineTo(0, -size); ctx.lineTo(size * .65, -size * .6); ctx.stroke();
        } else if (shape === 'snowflake') {
            for (let i = 0; i < 6; i++) {
                const a = i * TAU / 6, x = Math.cos(a), y = Math.sin(a);
                ctx.moveTo(0, 0); ctx.lineTo(x * size, y * size);
                for (const side of [-1, 1]) {
                    ctx.moveTo(x * size * .55, y * size * .55);
                    ctx.lineTo(x * size * .3 - y * size * .3 * side, y * size * .3 + x * size * .3 * side);
                }
            }
            ctx.stroke();
        } else if (shape === 'heart') {
            ctx.moveTo(0, size);
            ctx.bezierCurveTo(-size * 2, 0, -size, -size * 1.5, 0, -size * .4);
            ctx.bezierCurveTo(size, -size * 1.5, size * 2, 0, 0, size);
            ctx.fill();
        } else if (shape === 'leaf' || shape === 'petal') {
            ctx.ellipse(0, 0, size, size * .5, 0, 0, TAU);
            ctx.fill();
            if (shape === 'leaf') {
                ctx.strokeStyle = '#166534';
                ctx.moveTo(-size * .6, 0); ctx.lineTo(size * .6, 0); ctx.stroke();
            }
        } else if (shape === 'confetti' || shape === 'pixel') {
            ctx.fillRect(-size * .65, -size * .65, size * 1.3, size * (shape === 'confetti' ? .7 : 1.3));
        } else if (shape === 'bubble') {
            ctx.arc(0, 0, size, 0, TAU); ctx.stroke();
            ctx.beginPath(); ctx.arc(-size * .25, -size * .25, size * .22, 0, TAU); ctx.fill();
        } else if (shape === 'flame') {
            ctx.moveTo(0, -size * 1.5);
            ctx.bezierCurveTo(size * .2, -size * .2, size * 1.2, 0, size * .5, size);
            ctx.bezierCurveTo(-size, size * 1.5, -size, 0, 0, -size * 1.5);
            ctx.fill();
        } else if (shape === 'blossom') {
            for (let i = 0; i < 5; i++) {
                ctx.save(); ctx.rotate(i * TAU / 5);
                ctx.beginPath(); ctx.ellipse(0, -size * .62, size * .34, size * .62, 0, 0, TAU); ctx.fill();
                ctx.restore();
            }
            ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(0, 0, size * .2, 0, TAU); ctx.fill();
        } else if (shape === 'comet') {
            ctx.lineCap = 'round';
            ctx.lineWidth = size * .55;
            ctx.beginPath(); ctx.moveTo(-size * 3, size * 1.4); ctx.lineTo(0, 0); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, size * .8, 0, TAU); ctx.fill();
        } else if (shape === 'spiral') {
            ctx.beginPath();
            for (let i = 0; i <= 28; i++) {
                const a = i / 28 * TAU * 1.5, r = size * i / 28;
                if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, size * .18, 0, TAU); ctx.fill();
        } else if (shape === 'bolt') {
            ctx.moveTo(size * .3, -size * 1.5); ctx.lineTo(-size, size * .2);
            ctx.lineTo(-size * .1, size * .2); ctx.lineTo(-size * .3, size * 1.5);
            ctx.lineTo(size, -size * .2); ctx.lineTo(size * .1, -size * .2); ctx.closePath(); ctx.fill();
        } else if (shape === 'ray') {
            ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.stroke();
            drawCosmeticParticle(ctx, 'spark', size * .45);
        } else if (shape === 'dust') {
            ctx.arc(0, 0, size, 0, TAU); ctx.fill();
        } else if (shape === 'rune') {
            ctx.moveTo(0, -size); ctx.lineTo(size, 0); ctx.lineTo(0, size); ctx.lineTo(-size, 0); ctx.closePath(); ctx.stroke();
            ctx.moveTo(-size, -size); ctx.lineTo(size, size); ctx.moveTo(size, -size); ctx.lineTo(-size, size); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, size * .2, 0, TAU); ctx.fill();
        } else if (shape === 'crescent') {
            ctx.moveTo(0, -size);
            ctx.bezierCurveTo(-size * 1.8, -size, -size * 1.8, size, 0, size);
            ctx.bezierCurveTo(-size * .65, size * .5, -size * .65, -size * .5, 0, -size);
            ctx.fill();
        } else {
            const narrow = shape === 'spark' || shape === 'meteor' ? .25 : .6;
            for (let i = 0; i < 8; i++) {
                const a = i * TAU / 8, radius = size * (i % 2 ? narrow : 1);
                if (i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
                else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
            }
            ctx.closePath(); ctx.fill();
            if (shape === 'meteor') {
                ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(size * 3, 0); ctx.stroke();
            }
        }
    }

    function drawCosmeticParticles(ctx, id, cx, cy, rx, ry, time, hatClearance = 0) {
        const def = COSMETIC_PARTICLES[id];
        if (!def) return;
        ctx.save();
        const alpha = ctx.globalAlpha;
        if (def.shape === 'comet') {
            for (let i = 0; i < 4; i++) {
                const phase = (time * .32 + i / 4) % 1;
                const angle = time * .55 + i * TAU / 4;
                const x = cx + Math.cos(angle) * rx * (.3 + phase * .8);
                const y = cy + Math.sin(angle) * ry * (.3 + phase * .8);
                ctx.save(); ctx.translate(x, y); ctx.rotate(angle + Math.PI / 2);
                ctx.globalAlpha = alpha * (1 - phase * .45);
                ctx.fillStyle = def.colors[i % def.colors.length];
                drawCosmeticParticle(ctx, 'comet', Math.max(2, rx * .11)); ctx.restore();
            }
        } else if (def.shape === 'spiral') {
            for (let path = 0; path < 2; path++) {
                ctx.save(); ctx.strokeStyle = def.colors[path];
                ctx.lineWidth = Math.max(1, rx * .035); ctx.globalAlpha = alpha * .55;
                ctx.beginPath();
                for (let i = 0; i <= 48; i++) {
                    const phase = i / 48, angle = time * (path ? -1 : 1) + phase * TAU * 2.5 + path * Math.PI;
                    const radius = .2 + phase * .8;
                    const x = cx + Math.cos(angle) * rx * radius;
                    const y = cy + Math.sin(angle) * ry * radius;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke(); ctx.restore();
            }
            for (let i = 0; i < 6; i++) {
                const angle = time * (i % 2 ? -1 : 1) + i * TAU / 6;
                ctx.save(); ctx.translate(cx + Math.cos(angle) * rx * .8, cy + Math.sin(angle) * ry * .8);
                ctx.fillStyle = def.colors[i % def.colors.length]; ctx.globalAlpha = alpha * .9;
                drawCosmeticParticle(ctx, 'star', Math.max(2, rx * .09)); ctx.restore();
            }
        } else if (def.shape === 'storm') {
            const cloudY = cy - ry * 1.5 - hatClearance, sway = Math.sin(time * .8) * rx * .08;
            for (let i = 0; i < 16; i++) {
                const phase = (time * .9 + i * .618) % 1;
                const x = cx + sway + Math.sin(i * 17) * rx * .85 - phase * rx * .12;
                const groundY = cy + ry / 1.1;
                const falling = Math.min(1, phase / .86);
                const y = cloudY + ry * .25 + falling * (groundY - cloudY - ry * .25);
                ctx.globalAlpha = alpha * (1 - phase * .6);
                ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = Math.max(.7, rx * .045);
                if (phase < .86) { ctx.beginPath(); ctx.moveTo(x, Math.max(cloudY, y - ry * .16)); ctx.lineTo(x - rx * .05, y); ctx.stroke(); }
                if (phase > .86) {
                    ctx.globalAlpha = alpha * (1 - (phase - .86) / .14);
                    ctx.beginPath(); ctx.ellipse(x, groundY, rx * (phase - .86) * 1.8, ry * .035, 0, 0, TAU); ctx.stroke();
                }
            }
            ctx.globalAlpha = alpha;
            const cloud = ctx.createLinearGradient(0, cloudY - ry * .5, 0, cloudY + ry * .2);
            cloud.addColorStop(0, '#94a3b8'); cloud.addColorStop(1, '#334155');
            ctx.fillStyle = cloud;
            ctx.beginPath();
            ctx.ellipse(cx + sway, cloudY, rx, ry * .25, 0, 0, TAU);
            ctx.ellipse(cx - rx * .4 + sway, cloudY - ry * .15, rx * .45, ry * .3, 0, 0, TAU);
            ctx.ellipse(cx + rx * .2 + sway, cloudY - ry * .24, rx * .48, ry * .35, 0, 0, TAU); ctx.fill();
            if (time % 4 < .18) {
                ctx.save(); ctx.translate(cx + rx * .4, cloudY + ry * .55);
                ctx.fillStyle = '#fef08a'; drawCosmeticParticle(ctx, 'bolt', rx * .28); ctx.restore();
            }
        } else if (def.shape === 'blackhole' || def.shape === 'gate') {
            const hole = def.shape === 'blackhole';
            ctx.fillStyle = hole ? '#080b18' : 'rgba(76,29,149,.14)';
            ctx.beginPath(); ctx.ellipse(cx, cy, rx * .8, ry * .85, 0, 0, TAU); ctx.fill();
            for (let ring = 0; ring < 3; ring++) {
                ctx.strokeStyle = def.colors[ring]; ctx.lineWidth = Math.max(1, rx * (hole ? .09 : .045));
                ctx.globalAlpha = alpha * (.6 + ring * .12);
                ctx.beginPath(); ctx.ellipse(cx, cy, rx * (1 + ring * .08), ry * (hole ? .3 + ring * .08 : .9 + ring * .06), hole ? -.3 : 0, 0, TAU); ctx.stroke();
            }
            for (let i = 0; i < 12; i++) {
                const angle = time * (i % 2 ? .5 : -.7) + i * TAU / 12;
                const radius = hole ? 1.35 - (time * .3 + i / 12) % 1 * .75 : 1.12;
                ctx.save(); ctx.translate(cx + Math.cos(angle) * rx * radius, cy + Math.sin(angle) * ry * radius);
                ctx.rotate(angle); ctx.globalAlpha = alpha * .85;
                ctx.fillStyle = def.colors[i % 3];
                drawCosmeticParticle(ctx, hole ? 'meteor' : 'rune', rx * (hole ? .07 : .12)); ctx.restore();
            }
        } else if (def.shape === 'firefly' || def.shape === 'jellyfish') {
            for (let i = 0; i < (def.shape === 'firefly' ? 9 : 3); i++) {
                const jelly = def.shape === 'jellyfish', angle = i * 2.4 + time * .22;
                const x = cx + Math.cos(angle) * rx * (jelly ? .85 : .8 + Math.sin(time + i) * .3);
                const y = cy + Math.sin(angle * 1.3 + time * .4) * ry * .65 - (jelly ? ry * .6 : 0);
                const size = rx * (jelly ? .22 : .06);
                ctx.fillStyle = def.colors[i % 3]; ctx.strokeStyle = ctx.fillStyle;
                ctx.globalAlpha = alpha * (.6 + Math.sin(time * 2 + i) * .25);
                ctx.beginPath(); ctx.ellipse(x, y, size * (jelly ? 1 : 2.5), size, 0, jelly ? Math.PI : 0, TAU); ctx.fill();
                if (jelly) {
                    ctx.lineWidth = Math.max(.7, rx * .035);
                    for (let leg = -1; leg <= 1; leg++) {
                        ctx.beginPath(); ctx.moveTo(x + leg * size * .6, y);
                        ctx.bezierCurveTo(x + leg * size, y + size, x + Math.sin(time * 3 + i + leg) * size, y + size * 1.8, x + leg * size * .7, y + size * 2.6); ctx.stroke();
                    }
                } else {
                    ctx.globalAlpha *= .25;
                    ctx.beginPath(); ctx.arc(x, y, size * 3, 0, TAU); ctx.fill();
                }
            }
        } else if (def.shape === 'ribbon') {
            for (let band = 0; band < def.colors.length; band++) {
                ctx.strokeStyle = def.colors[band];
                ctx.lineWidth = Math.max(1, rx * .09);
                ctx.globalAlpha = alpha * .65;
                ctx.beginPath();
                for (let i = 0; i <= 40; i++) {
                    const a = i / 40;
                    const x = cx + (a * 2 - 1) * rx * 1.15;
                    const y = cy - ry * .8 + Math.sin(a * TAU * 1.5 + time + band * .6) * ry * .35 + band * ry * .22;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        } else if (def.shape === 'vortex') {
            for (let ring = 0; ring < 3; ring++) {
                ctx.globalAlpha = alpha * .5;
                ctx.strokeStyle = def.colors[ring];
                ctx.lineWidth = Math.max(1, rx * .07);
                ctx.beginPath();
                for (let i = 0; i <= 32; i++) {
                    const a = time * (ring % 2 ? -1 : 1) + i / 32 * Math.PI * 1.7;
                    const radius = .65 + i / 32 * .35;
                    const x = cx + Math.cos(a + ring * 2) * rx * radius;
                    const y = cy + Math.sin(a + ring * 2) * ry * radius;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
                ctx.save();
                const a = time * 1.2 + ring * TAU / 3;
                ctx.translate(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
                ctx.rotate(a);
                ctx.fillStyle = def.colors[ring];
                ctx.globalAlpha = alpha * .8;
                drawCosmeticParticle(ctx, 'diamond', Math.max(1.5, rx * .16));
                ctx.restore();
            }
        } else {
            for (let i = 0; i < 7; i++) {
                const a = time * .8 + i * TAU / 7;
                const falling = ['petal', 'blossom', 'confetti', 'snowflake'].includes(def.shape);
                const rising = def.shape === 'flame' || def.shape === 'bubble';
                const phase = (time * .25 + i / 7) % 1;
                let x = cx + Math.cos(a) * rx * (falling || rising ? .8 : 1);
                let y = cy + (falling ? phase * 2 - 1 : rising ? 1 - phase * 2 : Math.sin(a)) * ry;
                if (def.shape === 'blossom') x += Math.sin(time * 2 + i * 1.7) * rx * .16;
                if (def.shape === 'spark') {
                    x = cx + Math.sin(time * 1.8 + i * 8.3) * rx * .88;
                    y = cy + Math.cos(time * 2.2 + i * 4.1) * ry * .88;
                }
                if (def.shape === 'pixel') { x = Math.round(x / 3) * 3; y = Math.round(y / 3) * 3; }
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(def.shape === 'pixel' ? 0 : def.shape === 'ray' ? a : time * 1.5 + i);
                ctx.globalAlpha = alpha * (.55 + Math.sin(time * 3 + i) * .25);
                ctx.fillStyle = def.colors[i % def.colors.length];
                drawCosmeticParticle(ctx, def.shape, Math.max(1.5, rx * (def.shape === 'dust' ? .2 + Math.sin(time * 2 + i) * .05 : .16)));
                ctx.restore();
            }
        }
        ctx.restore();
    }

    function drawSkinSignature(ctx, c, x, y, r, time) {
        if (!c.skin) return;
        const id = c.skinId;
        ctx.save(); ctx.translate(x, y); ctx.scale(r / 12, r / 12);
        ctx.fillStyle = c.skin.trim; ctx.strokeStyle = c.skin.trim; ctx.lineWidth = 1.8;
        if (['skin_robot', 'skin_chrome', 'skin_cyber', 'skin_astronaut'].includes(id)) {
            roundRect(ctx, -8, -7, 16, 14, 2); ctx.stroke();
            ctx.fillStyle = c.skin.eye; ctx.fillRect(-5, -4, id === 'skin_cyber' ? 11 : 5, 3);
            ctx.fillStyle = '#f8fafc'; ctx.fillRect(-5, 3, 3, 2); ctx.fillRect(2, 3, 3, 2);
            if (id === 'skin_chrome') { ctx.fillStyle = '#ffffffaa'; ctx.fillRect(-8, -7, 4, 14); }
            if (id === 'skin_astronaut') { ctx.beginPath(); ctx.arc(0, -15, 12, 0, TAU); ctx.stroke(); }
        } else if (['skin_dragon', 'skin_axolotl', 'skin_inferno'].includes(id)) {
            for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
                const wave = id === 'skin_axolotl' ? Math.sin(time * 5 + i) * 2 : 0;
                ctx.beginPath(); ctx.moveTo(side * 9, -12 + i * 5);
                ctx.lineTo(side * (19 + wave), -17 + i * 6);
                ctx.lineTo(side * 11, -8 + i * 5); ctx.fill();
            }
            ctx.fillStyle = c.skin.eye;
            for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc((i - 1) * 5, 3, 1.5, 0, TAU); ctx.fill(); }
        } else if (['skin_lava', 'skin_crystal', 'skin_ice'].includes(id)) {
            ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(2, -2); ctx.lineTo(-3, 3); ctx.lineTo(7, 8); ctx.stroke();
            if (id !== 'skin_lava') {
                ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(7, 0); ctx.lineTo(0, 10); ctx.lineTo(-7, 0); ctx.closePath(); ctx.stroke();
            }
        } else if (['skin_galaxy', 'skin_cosmic', 'skin_celestial', 'skin_rainbow'].includes(id)) {
            for (let i = 0; i < 4; i++) {
                const a = time * .3 + i * 2.1, px = Math.cos(a) * 7, py = Math.sin(a) * 7;
                ctx.fillStyle = ['#fde047', '#67e8f9', '#f9a8d4', '#a78bfa'][i];
                ctx.fillRect(px - 1, py - 3, 2, 6); ctx.fillRect(px - 3, py - 1, 6, 2);
            }
        } else if (['skin_mummy', 'skin_candy', 'skin_bee', 'skin_samurai'].includes(id)) {
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(-9, -8 + i * 5, 18, id === 'skin_bee' ? 3 : 2);
                if (id === 'skin_mummy') { ctx.beginPath(); ctx.moveTo(-7, -7 + i * 5); ctx.lineTo(7, -3 + i * 5); ctx.stroke(); }
            }
        } else if (['skin_forest', 'skin_sprout', 'skin_minty', 'skin_bookworm'].includes(id)) {
            if (id === 'skin_bookworm') {
                ctx.fillStyle = '#fff7ed'; ctx.fillRect(-7, -3, 14, 10);
                ctx.strokeStyle = '#92400e'; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, 7); ctx.stroke();
            } else {
                ctx.beginPath(); ctx.ellipse(-4, -4, 7, 3, -.5, 0, TAU); ctx.ellipse(4, 3, 7, 3, -.5, 0, TAU); ctx.fill();
            }
        } else if (['skin_gold', 'skin_steampunk', 'skin_neon'].includes(id)) {
            ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.stroke();
            for (let i = 0; i < 6; i++) {
                const a = i * TAU / 6; ctx.fillRect(Math.cos(a) * 9 - 1, Math.sin(a) * 9 - 1, 3, 3);
            }
        }
        ctx.restore();
    }

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
        if (c.skin?.mythic) drawMythicAura(ctx, cx, y + h * 0.45, Math.max(w, h) * 0.75, c.skin.mythic, time);
        drawCosmeticParticles(ctx, c.effect, cx, y + h * .5, w * .8, h * .55, time, c.hat ? h * .45 : 0);
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
        ctx.fillStyle = c.skin?.trim || '#1e293b';
        ctx.fillRect(cx - 8 + run * 5, y + h - 14, 7, 14);
        ctx.fillRect(cx + 1 - run * 5, y + h - 14, 7, 14);
        if (c.acc === 'acc_guitar') {
            ctx.save(); ctx.translate(cx - face * w * 0.55, y + 26 + bob); ctx.rotate(face * 0.5);
            ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.ellipse(0, 6, 7, 9, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = '#451a03'; ctx.fillRect(-1.5, -20, 3, 22); ctx.beginPath(); ctx.arc(0, 6, 2.4, 0, TAU); ctx.fill();
            ctx.restore();
        }
        ctx.fillStyle = body;
        roundRect(ctx, x, y + 12 + bob, w, h - 24, 8);
        ctx.fill();
        drawSkinSignature(ctx, c, cx, y + 27 + bob, w * .42, time);
        if (c.acc === 'acc_scarf') { ctx.fillStyle = '#ef4444'; ctx.fillRect(x + 1, y + 12 + bob, w - 2, 5); ctx.fillRect(cx - face * 6 - 2, y + 15 + bob, 5, 12); }
        ctx.fillStyle = head;
        ctx.beginPath(); ctx.arc(cx, y + 11 + bob, 11, 0, TAU); ctx.fill();
        if (!c.hat && !c.skin) { ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, y + 8 + bob, 11.5, Math.PI, TAU); ctx.fill(); }
        if (c.skin === SKINS.skin_ninja) { ctx.fillStyle = '#111827'; ctx.fillRect(cx - 11, y + 4 + bob, 22, 5); ctx.fillStyle = '#dc2626'; ctx.fillRect(cx - 11, y + 8 + bob, 22, 2); }
        if (!c.hat && c.skin === SKINS.skin_robot) { ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, y + bob); ctx.lineTo(cx, y - 7 + bob); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(cx, y - 8 + bob, 2.5, 0, TAU); ctx.fill(); }
        if (!c.hat && c.skin === SKINS.skin_alien) { ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 5, y + 1 + bob); ctx.lineTo(cx - 8, y - 6 + bob); ctx.moveTo(cx + 5, y + 1 + bob); ctx.lineTo(cx + 8, y - 6 + bob); ctx.stroke(); }
        drawHat(ctx, c.hat, cx, y + bob, 11, face * 0.03, time);
        ctx.fillStyle = c.skin?.eye || '#0f172a';
        ctx.fillRect(cx + face * 4 - 1.5, y + 9 + bob, 3, 4);
        if (c.acc === 'acc_shades') { ctx.fillStyle = '#0f172a'; ctx.fillRect(cx + face * 4 - 6, y + 8 + bob, 12, 5); }
        if (c.acc === 'acc_monocle') { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx + face * 5, y + 11 + bob, 4.5, 0, TAU); ctx.stroke(); }
        if (c.acc === 'acc_eyepatch') { ctx.fillStyle = '#0f172a'; ctx.fillRect(cx + face * 4 - 3, y + 8 + bob, 6, 5); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - 11, y + 5 + bob); ctx.lineTo(cx + 11, y + 12 + bob); ctx.stroke(); }
        if (c.acc === 'acc_bowtie') { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(cx, y + 21 + bob); ctx.lineTo(cx - 7, y + 17 + bob); ctx.lineTo(cx - 7, y + 25 + bob); ctx.moveTo(cx, y + 21 + bob); ctx.lineTo(cx + 7, y + 17 + bob); ctx.lineTo(cx + 7, y + 25 + bob); ctx.fill(); }
        if (c.acc === 'acc_lei') { const lei = ['#f472b6', '#facc15', '#a78bfa', '#fb923c']; for (let i = 0; i < 6; i++) { ctx.fillStyle = lei[i % 4]; ctx.beginPath(); ctx.arc(x + 2 + i * (w - 4) / 5, y + 18 + bob + Math.sin(i / 5 * Math.PI) * 4, 2.6, 0, TAU); ctx.fill(); } }
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
        if (c.skin?.mythic) drawMythicAura(ctx, 0, 0, r * 1.7, c.skin.mythic, time);
        drawCosmeticParticles(ctx, c.effect, 0, 0, r * 1.45, r * 1.45, time, c.hat ? r * .7 : 0);
        ctx.save();
        ctx.rotate(aim);
        if (c.acc === 'acc_cape') { ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.9); ctx.lineTo(-r * 1.7, 0); ctx.lineTo(-r * 0.2, r * 0.9); ctx.fill(); }
        if (c.acc === 'acc_wings') { ctx.fillStyle = 'rgba(226,232,240,.9)'; const f = Math.sin(time * 10) * 0.12; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 1.15, r * 0.35, r * (1 + f), 0.4, 0, TAU); ctx.ellipse(-r * 0.3, r * 1.15, r * 0.35, r * (1 + f), -0.4, 0, TAU); ctx.fill(); }
        if (c.acc === 'acc_backpack') { ctx.fillStyle = '#b45309'; roundRect(ctx, -r * 1.25, -r * 0.5, r * 0.7, r, 3); ctx.fill(); }
        if (c.acc === 'acc_sword') { ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = Math.max(2, r * 0.16); ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.7); ctx.lineTo(-r * 1.1, -r * 1.1); ctx.stroke(); ctx.strokeStyle = '#92400e'; ctx.beginPath(); ctx.moveTo(-r * 0.9, r * 0.5); ctx.lineTo(-r * 0.4, r * 0.35); ctx.stroke(); }
        if (c.acc === 'acc_jetpack') { ctx.fillStyle = '#64748b'; roundRect(ctx, -r * 1.3, -r * 0.5, r * 0.7, r, 3); ctx.fill(); ctx.fillStyle = '#f97316'; ctx.fillRect(-r * 1.6 - Math.sin(time * 30) * 2, -r * 0.25, r * 0.4, r * 0.5); }
        if (c.acc === 'acc_tail') { ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.ellipse(-r * 1.3, Math.sin(time * 6) * r * 0.3, r * 0.6, r * 0.28, 0, 0, TAU); ctx.fill(); }
        if (c.acc === 'acc_fairy' || c.acc === 'acc_phoenix') { ctx.fillStyle = c.acc === 'acc_fairy' ? 'rgba(244,114,182,.7)' : 'rgba(249,115,22,.85)'; const f = Math.sin(time * 10) * 0.12; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 1.15, r * 0.35, r * (1 + f), 0.4, 0, TAU); ctx.ellipse(-r * 0.3, r * 1.15, r * 0.35, r * (1 + f), -0.4, 0, TAU); ctx.fill(); }
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.fillStyle = c.skin?.trim || 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.arc(0, 0, r, -0.9, 0.9); ctx.lineTo(0, 0); ctx.fill();
        drawSkinSignature(ctx, c, 0, 0, r * .75, time);
        if (c.acc === 'acc_scarf') { ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0.6, 2.6); ctx.stroke(); }
        ctx.fillStyle = c.skin?.head || '#fde7c8';
        ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.62, 0, TAU); ctx.fill();
        if (c.hat) {
            ctx.save(); ctx.rotate(-aim);
            drawHat(ctx, c.hat, Math.cos(aim) * r * 0.1, Math.sin(aim) * r * 0.1 - r * 0.62, r * 0.62, 0, time);
            ctx.restore();
        }
        ctx.fillStyle = c.skin?.eye || '#0f172a';
        ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.2, r * 0.1, 0, TAU); ctx.arc(r * 0.5, r * 0.2, r * 0.1, 0, TAU); ctx.fill();
        if (c.acc === 'acc_shades') { ctx.fillStyle = '#0f172a'; ctx.fillRect(r * 0.4, -r * 0.34, r * 0.26, r * 0.68); }
        if (c.acc === 'acc_monocle') { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(r * 0.55, r * 0.2, r * 0.18, 0, TAU); ctx.stroke(); }
        if (c.acc === 'acc_eyepatch') { ctx.strokeStyle = '#0f172a'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.45); ctx.lineTo(r * 0.5, r * 0.25); ctx.stroke(); ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(r * 0.5, r * 0.2, r * 0.18, 0, TAU); ctx.fill(); }
        if (c.acc === 'acc_mustache' || c.acc === 'acc_beard') { ctx.fillStyle = c.acc === 'acc_beard' ? '#92400e' : '#451a03'; ctx.beginPath(); ctx.ellipse(r * 0.65, 0, r * (c.acc === 'acc_beard' ? 0.17 : 0.08), r * (c.acc === 'acc_beard' ? 0.4 : 0.2), 0, 0, TAU); ctx.fill(); }
        if (c.acc === 'acc_bowtie') { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(-r * 0.25, 0); ctx.lineTo(-r * 0.48, -r * 0.25); ctx.lineTo(-r * 0.48, r * 0.25); ctx.moveTo(-r * 0.25, 0); ctx.lineTo(-r * 0.02, -r * 0.25); ctx.lineTo(-r * 0.02, r * 0.25); ctx.fill(); }
        if (c.acc === 'acc_tie') { ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.moveTo(-r * 0.15, -r * 0.12); ctx.lineTo(-r * 0.15, r * 0.12); ctx.lineTo(-r * 0.75, r * 0.1); ctx.lineTo(-r * 0.85, 0); ctx.lineTo(-r * 0.75, -r * 0.1); ctx.fill(); }
        if (c.acc === 'acc_headband' || c.acc === 'acc_bandana') { ctx.strokeStyle = c.acc === 'acc_headband' ? '#ef4444' : '#2563eb'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.62, -1.2, 1.2); ctx.stroke(); }
        if (c.acc === 'acc_glasses' || c.acc === 'acc_goggles' || c.acc === 'acc_mask') { ctx.fillStyle = c.acc === 'acc_mask' ? '#7c3aed' : '#0f172a'; ctx.fillRect(r * 0.4, -r * 0.34, r * 0.26, r * 0.68); }
        if (c.acc === 'acc_medal' || c.acc === 'acc_chain') { ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(r * 0.3, 0, r * 0.14, 0, TAU); ctx.fill(); }
        if (c.acc === 'acc_lei') { const lei = ['#f472b6', '#facc15', '#a78bfa', '#fb923c']; for (let i = 0; i < 8; i++) { ctx.fillStyle = lei[i % 4]; ctx.beginPath(); ctx.arc(Math.cos(i / 8 * TAU) * r * 0.82, Math.sin(i / 8 * TAU) * r * 0.82, r * 0.15, 0, TAU); ctx.fill(); } }
        if (c.acc === 'acc_guitar') { ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.ellipse(-r * 1.15, r * 0.3, r * 0.4, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#451a03'; ctx.fillRect(-r * 1.2, -r * 1.0, r * 0.12, r * 1.0); }
        ctx.restore();
        ctx.globalAlpha = alpha;
        ctx.restore();
    }

    function questionHistoryMarkup(history = []) {
        // One row per distinct question: repeated questions show attempts and accuracy instead of duplicates.
        const groups = new Map();
        for (const answer of history || []) {
            const key = `${answer.prompt}\u0000${answer.answer}`;
            const group = groups.get(key) || { prompt: answer.prompt, answer: answer.answer, attempts: 0, correct: 0, skipped: 0, wrong: [] };
            group.attempts++;
            if (answer.correct === null) group.skipped++;
            else if (answer.correct) group.correct++;
            else if (!group.wrong.includes(answer.chosen || 'No selection')) group.wrong.push(answer.chosen || 'No selection');
            groups.set(key, group);
        }
        const rows = [...groups.values()].map(group => {
            const answered = group.attempts - group.skipped;
            return { ...group, answered, accuracy: answered ? Math.round(group.correct / answered * 100) : null };
        }).sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1) || b.attempts - a.attempts);
        const items = rows.map(row => {
            const tone = row.accuracy === null ? 'skip' : row.accuracy === 100 ? 'right' : row.accuracy === 0 ? 'wrong' : 'mixed';
            const tally = row.accuracy === null ? 'Skipped' : row.attempts === 1 ? (row.correct ? 'Correct' : 'Incorrect')
                : `${row.correct}/${row.answered} correct ? ${row.accuracy}%${row.skipped ? ` ? ${row.skipped} skipped` : ''}`;
            return `<li class="mpg-answer-${tone}"><strong>${esc(row.prompt)}</strong><span class="answer-tally">${row.attempts > 1 ? `<b>${row.attempts}?</b> ` : ''}${tally}${row.accuracy !== null && row.attempts > 1 ? `<i class="answer-meter" style="--acc:${row.accuracy}%"></i>` : ''}</span>${row.wrong.length ? `<span>Your answer${row.wrong.length > 1 ? 's' : ''}: ${row.wrong.map(esc).join(', ')}</span>` : ''}<span>Answer: ${esc(row.answer)}</span></li>`;
        }).join('');
        return `<ul class="game-answer-list">${items || '<li>No questions answered in this game.</li>'}</ul>`;
    }

    function sceneZoom(session, w, h, base = 820) {
        if (session.preview) return clamp(h / base, .6, 1.25);
        const scale = Number.isFinite(session.scale) && session.scale > 0 ? session.scale : 1;
        const cssW = w * scale, cssH = h * scale, landscape = cssW >= cssH;
        const zoom = Math.min(cssW / (base * (landscape ? 1.2 : .7)), cssH / (base * (landscape ? .75 : 1)));
        return clamp(zoom, .75, 1.4) / scale;
    }

    window.StudBudArcade = {
        graphicsProfile,
        Session, BaseGame, Particles, Resource, ENERGY_COSTS, games: {},
        util: { TAU, clamp, lerp, dist, overlap, mulberry32, hashStr, VerticalIndex, slopeY, slopeSurface, moveBody, pushCircleOutOfRect, roundRect, nameTag, esc, accountTagMarkup, who, playerCosmetics, avatarUrl, avatarMarkup, animatedCosmetics, drawAvatar, observeAvatars, drawHat, drawFigureSide, drawFigureTop, sceneZoom, canvasView, questionHistoryMarkup, defaultPlayerColors }
    };
})(window);
