const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class Element {
    constructor() {
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.handlers = {};
        this.classes = new Set();
        this.classList = {
            add: name => this.classes.add(name),
            remove: name => this.classes.delete(name),
            contains: name => this.classes.has(name),
            toggle: (name, force = !this.classes.has(name)) => {
                if (force) this.classes.add(name); else this.classes.delete(name);
                return force;
            }
        };
        this.style = { setProperty() {} };
        this.offsetHeight = 100;
    }
    set innerHTML(value) { this.children = []; }
    appendChild(child) { child.parent = this; this.children.push(child); }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); }
    setPointerCapture() {}
    getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
    emit(name, x, y) {
        for (const handler of this.handlers[name] || []) {
            handler({ pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, preventDefault() {} });
        }
    }
}

const windowHandlers = new Map();
const sandbox = {
    console, performance, Date, Math, Map, Set,
    navigator: { maxTouchPoints: 1 },
    requestAnimationFrame() {},
    document: { addEventListener() {}, createElement: () => new Element() },
    window: {
        matchMedia: () => ({ matches: true }),
        addEventListener(name, handler) { if (!windowHandlers.has(name)) windowHandlers.set(name, new Set()); windowHandlers.get(name).add(handler); },
        removeEventListener(name, handler) { windowHandlers.get(name)?.delete(handler); }
    }
};
vm.createContext(sandbox);
for (const file of ['multiplayerEngine.js', 'multiplayerGames.js', 'multiplayerGames2.js', 'multiplayerGames3.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}

const A = sandbox.window.StudBudArcade;
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase-setup.sql'), 'utf8');
const noticeDefinition = sql.match(/create table if not exists public\.studbud_site_notice \(([\s\S]*?)\n\);/)[1];
assert.match(noticeDefinition, /message text not null check/);
assert.doesNotMatch(noticeDefinition, /constraint studbud_site_notice_message_check\b/,
    'explicit active-message constraint must not collide with the auto-named length check');
assert.match(noticeDefinition, /constraint studbud_site_notice_active_message_check\b/);
assert.match(sql, /notify pgrst, 'reload schema';\s*$/);
for (const table of ['studbud_site_notice_history', 'studbud_site_notice_dismissals']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated;`));
}
assert.match(sql, /primary key \(user_id, publication_id\)/, 'dismissals belong to an account and publication, not a volatile timestamp');
assert.match(sql, /where publication_id is null and char_length\(btrim\(message\)\) > 0/,
    'upgrade archives only an existing announcement without an archive ID');
assert.match(sql, /values \(auth.uid\(\), p_publication_id\) on conflict do nothing/,
    'repeat dismissal is idempotent and cannot impersonate another account');
assert.match(sql, /where d.user_id = auth.uid\(\) and d.publication_id = n.publication_id/);
assert.match(sql, /order by h.published_at desc, h.id desc/, 'archive is chronologically newest first with a stable tie-breaker');
assert.match(sql, /n.message, n.updated_at, n.updated_by, nullif\(account.raw_user_meta_data ->> 'username', ''\)/,
    'upgrade preserves the original announcement timestamp and publisher');
assert.match(sql, /'author_name', coalesce\(h.published_username, 'Site administrator'\)/);
const publishNoticeFunction = sql.match(/create or replace function public\.studbud_admin_set_site_notice[\s\S]*?\$\$;/)[0];
assert.match(publishNoticeFunction, /perform public.studbud_require_admin\(\)/);
assert.match(publishNoticeFunction, /if p_active then\s+select[\s\S]*?insert into public.studbud_site_notice_history[\s\S]*?returning id into v_publication_id;\s+end if;/);
assert.match(publishNoticeFunction, /else studbud_site_notice.publication_id end/,
    'unpublishing preserves the publication identity and dismissal records');
assert.match(publishNoticeFunction, /insert into public.studbud_site_notice_history\(message, published_by, published_username\)/,
    'future publications snapshot the publisher username');
assert.match(publishNoticeFunction, /if v_author_username is null then raise exception/,
    'new announcements cannot publish without a recorded author username');
assert.match(publishNoticeFunction, /values \(btrim\(p_message\), auth.uid\(\), v_author_username\)/,
    'author is taken from the authenticated administrator, not browser input');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const about = html.match(/<section id="about-view"[\s\S]*?<\/section>/)[0];
assert.ok(about.indexOf('id="announcement-history-card"') > about.indexOf('Questions or suggestions?'),
    'announcement history belongs at the bottom of About');
for (const signature of ['studbud_get_site_notice_history\\(\\)', 'studbud_dismiss_site_notice\\(bigint\\)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to authenticated;`));
}

const originalMatchMedia = sandbox.window.matchMedia;
for (const { width, height, coarse, expected } of [
    { width: 1440, height: 900, coarse: false, expected: false },
    { width: 1024, height: 480, coarse: false, expected: false },
    { width: 390, height: 844, coarse: true, expected: true },
    { width: 844, height: 390, coarse: true, expected: true },
    { width: 768, height: 1024, coarse: true, expected: false }
]) {
    sandbox.window.matchMedia = query => {
        assert.equal(query, '(max-width: 680px), (pointer: coarse) and (max-height: 520px)');
        return { matches: width <= 680 || (coarse && height <= 520) };
    };
    assert.equal(A.Session.prototype.defaultHudCollapsed(), expected, `HUD default at ${width}x${height}`);
}
sandbox.window.matchMedia = originalMatchMedia;
function controlsFor(mode) {
    const session = Object.create(A.Session.prototype);
    session.keys = new Set();
    session.justPressed = new Set();
    session.mouse = {};
    session.mode = mode;
    session.layoutHud = () => {};
    session.resize = () => {};
    session.game = Object.create(A.games[mode].prototype);
    session.game.res = { label: 'Energy' };
    const overlay = new Element();
    const pad = new Element();
    const stick = new Element();
    const knob = new Element();
    const zone = new Element();
    const buttons = new Element();
    const status = new Element();
    const details = new Element();
    const hint = new Element();
    const board = new Element();
    const toggle = new Element();
    const elements = { '.mpg-touch': pad, '.mpg-stick-zone': zone, '.mpg-status': status,
        '.mpg-match-details': details, '.mpg-hint': hint, '.mpg-board': board, '.mpg-hud-toggle': toggle };
    overlay.querySelector = selector => selector === '.mpg-qbtn'
        ? status.children.find(el => el.className?.includes('mpg-qbtn'))
        : elements[selector];
    pad.querySelector = selector => selector === '.mpg-stick' ? stick : buttons;
    stick.querySelector = () => knob;
    session.overlay = overlay;
    session.bindTouch(overlay);
    session.applyTouchLayout();
    return { session, stick, knob, zone, buttons, status, details, hint, board, toggle };
}

{
    const { session, stick } = controlsFor('sports');
    stick.setPointerCapture = () => { throw new Error('Pointer capture unavailable'); };
    stick.emit('pointerdown', 50, 50);
    assert.ok(windowHandlers.get('pointermove').has(session.stickHandlers.move));
    session.stickHandlers.move({ pointerId: 1, clientX: 150, clientY: 50, preventDefault() {} });
    assert.ok(session.keys.has('KeyD'), 'window movement survives unavailable capture and leaving the joystick');
    session.stickHandlers.end({ pointerId: 2 });
    assert.ok(session.keys.has('KeyD'), 'another finger cannot release the movement pointer');
    session.stickHandlers.end({ pointerId: 1 });
    assert.equal(session.keys.size, 0, 'global release cannot leave movement stuck');
}

for (const mode of ['skyline', 'duel']) {
    const { session, stick, knob, zone, buttons } = controlsFor(mode);
    assert.equal(session.stickPlatform, true, `${mode} has guarded platformer input`);
    assert.match(stick.attributes['aria-label'], /steeply up/);
    for (const surface of [stick, zone]) {
        surface.emit('pointerdown', 50, 50);
        surface.emit('pointermove', 50, -100);
        assert.equal(session.keys.size, 0, 'joystick jumping must not generate keyboard jump edges');
        assert.equal(session.stickJumpHeld, true, 'a firm upward push requests grounded jumping');
        assert.ok(Number(knob.style.transform.match(/, (-?[\d.]+)px/)[1]) < -40, 'normal joystick retains vertical motion');
        surface.emit('pointermove', 50, 25);
        assert.equal(session.stickJumpHeld, false, 'less than 65% deflection cannot jump');
        surface.emit('pointermove', 100, 20);
        assert.equal(session.stickJumpHeld, false, 'shallow upward diagonals cannot jump');
        surface.emit('pointermove', 70, 10);
        assert.equal(session.stickJumpHeld, true, 'a push above 60 degrees requests grounded jumping');
        surface.emit('pointermove', 100, -100);
        assert.equal(session.keys.has('KeyD'), true);
        assert.equal(session.keys.has('KeyW'), false);
        assert.equal(session.keys.has('KeyS'), false);
        assert.equal(session.keys.has('Space'), false);
        surface.emit('pointermove', -100, 100);
        assert.equal(session.keys.has('KeyA'), true);
        assert.equal(session.keys.has('KeyD'), false);
        surface.emit('pointercancel');
        assert.equal(session.keys.size, 0, 'cancel releases joystick movement');
        assert.equal(session.stickJumpHeld, false, 'cancel releases automatic grounded jumping');
        session.justPressed.clear();
    }
    const jump = buttons.children.find(button => button.dataset.k === 'Space');
    jump.emit('pointerdown');
    assert.equal(session.keys.has('Space'), true, 'Jump button holds jump');
    assert.equal(session.justPressed.has('Space'), true, 'Jump button triggers jump');
    stick.emit('pointerdown', 100, 50);
    assert.equal(session.keys.has('Space'), true, 'joystick must not release the Jump button');
    stick.emit('pointerup');
    jump.emit('pointerup');
    assert.equal(session.keys.size, 0);
}

for (const mode of ['miner', 'shooter', 'sports', 'market', 'river']) {
    const { session, stick } = controlsFor(mode);
    assert.equal(session.stickGroundJump, false, `${mode} retains vertical movement`);
    stick.emit('pointerdown', 50, 0);
    assert.equal(session.keys.has('KeyW'), true, `${mode} retains up input`);
    stick.emit('pointermove', 50, 100);
    assert.equal(session.keys.has('KeyS'), true, `${mode} retains down input`);
    stick.emit('lostpointercapture');
    assert.equal(session.keys.size, 0);
}

const { session, details, hint, board, toggle, status } = controlsFor('skyline');
for (const collapsed of [true, false, true]) {
    session.setHudCollapsed(collapsed);
    assert.equal(session.overlay.classList.contains('hud-collapsed'), collapsed);
    assert.equal(details.hidden, collapsed);
    assert.equal(hint.hidden, collapsed);
    assert.equal(board.hidden, collapsed, 'HUD also controls standings');
    assert.equal(toggle.attributes['aria-expanded'], String(!collapsed));
    assert.equal(toggle.attributes['aria-label'], collapsed ? 'Show match details and standings' : 'Hide match details and standings');
    assert.equal(status.children[0].hidden, undefined, 'refill button remains available');
}
const engineSource = fs.readFileSync(path.join(__dirname, '..', 'multiplayerEngine.js'), 'utf8');
assert.doesNotMatch(engineSource, /mpg-menu-toggle|mpg-menu-panel|mpg-board-toggle|board-open/);
assert.match(engineSource, /aria-controls="mpg-match-details mpg-controls-hint mpg-match-standings"/);
const duelButtons = controlsFor('duel').buttons.children;
assert.equal(duelButtons.find(button => button.textContent === 'Guard').dataset.k, 'KeyS');
assert.equal(duelButtons.find(button => button.textContent === 'Heavy').dataset.k, 'KeyR');
assert.equal(duelButtons.find(button => button.textContent === 'Dodge').dataset.k, 'ShiftLeft');
const soccerButtons = controlsFor('sports').buttons.children;
assert.equal(soccerButtons.find(button => button.textContent === 'Sprint').dataset.k, 'ShiftLeft');
assert.equal(soccerButtons.find(button => button.textContent === 'Power kick').dataset.k, 'Space');
console.log('SQL constraint naming, desktop/mobile HUD defaults, steep-angle joysticks, Jump buttons, nearby action bindings, and unified HUD disclosure passed.');
