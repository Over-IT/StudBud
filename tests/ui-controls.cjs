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
        this.offsetWidth = 100;
        this.tagName = 'BUTTON';
        this.isConnected = true;
    }
    set innerHTML(value) { this.children = []; }
    appendChild(child) { child.parent = this; this.children.push(child); }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceWith(...elements) { this.replacements = elements; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); }
    setPointerCapture() {}
    focus() { sandbox.document.activeElement = this; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
    emit(name, x, y, extra = {}) {
        for (const handler of this.handlers[name] || []) {
            handler({ type: name, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, preventDefault() {}, ...extra });
        }
    }
}

const windowHandlers = new Map();
const sandbox = {
    console, performance, Date, Math, Map, Set,
    navigator: { maxTouchPoints: 1 },
    requestAnimationFrame() {},
    document: { addEventListener() {}, getElementById: () => null, createElement: () => new Element() },
    window: {
        matchMedia: () => ({ matches: true }),
        addEventListener(name, handler) { if (!windowHandlers.has(name)) windowHandlers.set(name, new Set()); windowHandlers.get(name).add(handler); },
        removeEventListener(name, handler) { windowHandlers.get(name)?.delete(handler); }
    }
};
vm.createContext(sandbox);
for (const file of ['flashcardEngine.js', 'multiplayerEngine.js', 'multiplayerGames.js', 'multiplayerGames2.js', 'multiplayerGames3.js']) {
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
assert.match(html, /id="settings-first-name"/);
assert.match(html, /id="settings-last-name"/);
assert.match(html, /id="public-show-real-name"/);
assert.match(html, /<body class="dark-theme" data-color-scheme="monochrome">/,
    'the initial page paint uses the non-green default before app startup');
assert.match(html, /<span>Hypothetical Grades<\/span>/);
assert.match(html, /<span>Practice<\/span>/);
assert.match(html, /id="practice-multiplayer-form"/);
assert.match(html, /id="practice-multiplayer-mode"/);
assert.match(html, /data-scenario-score-preset="100"/);
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
    session.game.s = session;
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
        assert.equal(session.stickJumpHeld, false, 'less than 60% deflection cannot jump');
        surface.emit('pointermove', 100, 20);
        assert.equal(session.stickJumpHeld, false, 'shallow upward diagonals cannot jump');
        surface.emit('pointermove', 70, 10);
        assert.equal(session.stickJumpHeld, true, 'a steep diagonal requests grounded jumping');
        for (const [angle, magnitude, expected] of [[54.9, 1, false], [55.1, 1, true], [70, .599, false], [70, .601, true], [45, 1, false]]) {
            const radians = angle * Math.PI / 180;
            const origin = surface === zone ? { x: 58, y: 50 } : { x: 50, y: 50 };
            surface.emit('pointermove', origin.x + Math.cos(radians) * 50 * magnitude, origin.y - Math.sin(radians) * 50 * magnitude);
            assert.equal(session.stickJumpHeld, expected, `${mode}: ${angle} degrees at ${magnitude * 100}% deflection`);
        }
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
    jump.emit('pointerdown', 0, 0, { button: 2 });
    assert.equal(session.keys.size, 0, 'right-click cannot trigger touch actions');
    session.paused = true;
    jump.emit('pointerdown');
    stick.emit('pointerdown', 50, 0);
    assert.equal(session.keys.size, 0, 'paused controls cannot trigger movement or actions');
    assert.equal(session.stickJumpHeld, false);
    session.paused = false;
    jump.setPointerCapture = () => { throw new Error('Capture unavailable'); };
    jump.emit('pointerdown', 0, 0, { pointerId: 7 });
    jump.emit('pointerup', 0, 0, { pointerId: 8 });
    assert.equal(session.keys.has('Space'), true, 'another finger cannot release the action button');
    for (const handler of windowHandlers.get('pointercancel')) handler({ type: 'pointercancel', pointerId: 7 });
    assert.equal(session.keys.has('Space'), false, 'global cancel releases actions even without pointer capture');
    assert.equal(session.justPressed.has('Space'), false, 'cancel discards unconsumed action edges');
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
    assert.equal(hint.hidden, undefined, 'Controls help is independently opened, not tied to the HUD toggle');
    assert.equal(board.hidden, collapsed, 'HUD also controls standings');
    assert.equal(toggle.attributes['aria-expanded'], String(!collapsed));
    assert.equal(toggle.attributes['aria-label'], collapsed ? 'Show match details and standings' : 'Hide match details and standings');
    assert.equal(status.children[0].hidden, undefined, 'refill button remains available');
}
const engineSource = fs.readFileSync(path.join(__dirname, '..', 'multiplayerEngine.js'), 'utf8');
assert.doesNotMatch(engineSource, /mpg-menu-toggle|mpg-menu-panel|mpg-board-toggle|board-open/);
assert.match(engineSource, /aria-controls="mpg-match-details mpg-match-standings"/);
assert.match(engineSource, /mpg-controls-help/);
assert.match(engineSource, /content\.hidden = !panel\.open/);
assert.match(engineSource, /panels\.appendChild\(content\)/, 'help and tools occupy their own HUD row');
const styleSource = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
assert.match(styleSource, /\.workspace-tabs \{[^}]*padding: 12px var\(--spacing-xl\)/, 'all workspace tab rows use the same desktop gutter as page content');
assert.match(styleSource, /\.workspace-tabs \{[^}]*padding-left: max\(var\(--spacing-sm\), env\(safe-area-inset-left\)\); padding-right: max\(var\(--spacing-sm\), env\(safe-area-inset-right\)\)/, 'mobile tabs match content gutters and device safe areas');
const duelButtons = controlsFor('duel').buttons.children;
assert.equal(duelButtons.find(button => button.textContent === 'Guard').dataset.k, 'KeyS');
assert.equal(duelButtons.find(button => button.textContent === 'Special').dataset.k, 'KeyR');
assert.equal(duelButtons.find(button => button.textContent === 'Dodge').dataset.k, 'ShiftLeft');
const soccerButtons = controlsFor('sports').buttons.children;
assert.equal(soccerButtons.find(button => button.textContent === 'Sprint').dataset.k, 'ShiftLeft');
assert.equal(soccerButtons.find(button => button.textContent === 'Power kick').dataset.k, 'Space');

{
    const session = Object.create(A.Session.prototype);
    const canvas = new Element();
    const overlay = new Element();
    const summary = new Element();
    summary.tagName = 'SUMMARY';
    const exit = new Element();
    overlay.querySelectorAll = () => [summary, exit];
    session.canvas = canvas;
    session.overlay = overlay;
    session.keys = new Set();
    session.justPressed = new Set();
    session.mouse = {};
    session.over = true;
    let refills = 0;
    session.recharge = () => refills++;
    session.bind();
    assert.equal(sandbox.document.activeElement, canvas, 'launching a game moves focus away from setup fields into the game');
    const tab = { code: 'Tab', preventDefault() {}, target: canvas };
    canvas.focus();
    session.handlers.keydown(tab);
    assert.equal(sandbox.document.activeElement, summary, 'results summary is reachable from the game with Tab');
    session.handlers.keydown(tab);
    assert.equal(sandbox.document.activeElement, exit);
    session.handlers.keydown(tab);
    assert.equal(sandbox.document.activeElement, summary, 'results focus wraps without entering hidden gameplay controls');
    session.handlers.keydown({ code: 'KeyQ', target: canvas });
    assert.equal(refills, 0, 'finished games never open refill questions');
    assert.equal(session.keys.size, 0, 'finished games ignore movement input');
}

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator {'), appSource.indexOf('    window.NexusApp =')) + '\nwindow.TestApp = AppOrchestrator;', sandbox);
async function checkPracticeGrading() {
    const app = Object.create(sandbox.window.TestApp.prototype);
    const content = new Element();
    const find = (element, id) => element.id === id ? element : element.children.map(child => find(child, id)).find(Boolean);
    sandbox.document.getElementById = id => id === 'arcade-game-content' ? content : find(content, id);
    sandbox.FormData = class { constructor(form) { this.values = form.values; } get(key) { return this.values[key] ?? null; } };
    app.practiceTestCards = [{ front: 'One minus three?', back: '-2' }];
    app.practiceTestDeckCards = [...app.practiceTestCards, { front: 'Duplicate', back: '-2' }];
    app.practiceTestQuestionTypes = ['multiple-choice'];
    app.practiceTestAnswers = [];
    app.arcadeQuestionIndex = app.arcadeScore = 0;
    app.renderPracticeTestQuestion();
    assert.equal(app.practiceTestQuestionTypes[0], 'written', 'identical answers fall back to written questions');
    const form = find(content, 'practice-test-answer-form');
    assert.ok(find(content, 'practice-test-written-answer'), 'written questions actually render a labeled answer field');
    form.values = { answer: '2' };
    await app.submitPracticeTestAnswer(form);
    assert.equal(app.arcadeScore, 0, 'a positive answer cannot match a negative one');
    app.renderPracticeTestQuestion();
    const retry = find(content, 'practice-test-answer-form');
    retry.values = { answer: ' -2 ' };
    await app.submitPracticeTestAnswer(retry);
    assert.equal(app.arcadeScore, 1);
    app.practiceTestGroups = [[{ front: 'A', back: 'one' }, { front: 'B', back: 'two' }]];
    await assert.rejects(app.submitPracticeTestAnswer({ dataset: { questionType: 'matching', defOrder: '[0,1]' }, values: { match0: '', match1: '1' } }), /every term/);
}
{
    let saved = 0, left = 0;
    sandbox.window.NexusApp = { saveGameSummary: async () => { saved++; } };
    for (const testing of [false, true]) {
        const session = Object.create(A.Session.prototype);
        session.canvas = new Element();
        session.overlay = new Element();
        session.keys = new Set(); session.justPressed = new Set(); session.mouse = {};
        session.practice = true; session.testing = testing; session.over = false;
        session.user = { id: 'me' }; session.roster = new Map();
        session.standings = () => [{ id: 'me', n: 'Me', s: 4, g: 0 }];
        session.reportScore = session.closeQuestion = session.renderResults = session.sfx = () => {};
        session.onLeave = () => left++;
        session.bind();
        session.mode = 'skyline';
        session.game = { cp: { id: 2 }, testTeleport: index => { session.destination = index; } };
        const teleport = new Element(); teleport.dataset.testAction = 'checkpoint';
        session.overlay.handlers.click[0]({ target: { closest: () => teleport } });
        assert.equal(session.destination, testing ? 2 : undefined, 'checkpoint tools are gated to staff sessions');
        const leave = new Element();
        leave.classList.add('mpg-leave');
        session.overlay.handlers.click[0]({ target: { closest: () => leave } });
        if (testing) assert.equal(session.over, false, 'Close test exits without finishing or saving');
        else {
            assert.equal(session.over, true, 'End game finishes a solo session');
            session.finish();
            assert.equal(saved, 1, 'results save exactly once');
        }
    }
    assert.equal(left, 1, 'only testing leaves directly');
    assert.equal(saved, 1, 'testing never saves a solo result');
    delete sandbox.window.NexusApp;
}
{
    const app = Object.create(sandbox.window.TestApp.prototype);
    const body = new Element();
    const overlay = new Element();
    const modal = new Element();
    const background = new Element();
    background.inert = false;
    const alreadyInert = new Element();
    alreadyInert.inert = true;
    overlay.parentElement = { children: [background, alreadyInert, overlay] };
    overlay.classList.add('hidden');
    modal.id = 'audit-modal';
    const heading = new Element();
    const input = new Element();
    input.tagName = 'INPUT';
    const close = new Element();
    const save = new Element();
    const launcher = new Element();
    modal.querySelector = selector => selector === 'h2' ? heading : input;
    modal.querySelectorAll = () => [close, input, save];
    overlay.querySelector = () => modal;
    const study = new Element();
    const elements = { 'modal-container': overlay, 'audit-modal': modal, 'active-study-area': study };
    sandbox.document.body = body;
    sandbox.document.getElementById = id => elements[id];
    sandbox.document.querySelectorAll = () => [modal];
    sandbox.Router = { activeRoute: 'flashcard' };
    launcher.focus();
    app.openModal('audit-modal');
    assert.equal(sandbox.document.activeElement, input);
    assert.equal(modal.attributes.role, 'dialog');
    assert.equal(modal.attributes['aria-labelledby'], 'audit-modal-title');
    assert.equal(background.inert, true, 'dialogs make background content unfocusable');
    save.focus();
    app.handleKeydown({ key: 'Tab', target: input, preventDefault() {} });
    assert.equal(sandbox.document.activeElement, close);
    app.handleKeydown({ key: 'Tab', shiftKey: true, target: input, preventDefault() {} });
    assert.equal(sandbox.document.activeElement, save);
    app.handleKeydown({ key: 'Escape', target: input, preventDefault() {} });
    assert.equal(sandbox.document.activeElement, launcher, 'closing a dialog restores its launcher');
    assert.equal(background.inert, false);
    assert.equal(alreadyInert.inert, true, 'closing a dialog preserves earlier inert state');
    let reveals = 0;
    app.revealCard = () => reveals++;
    const target = { tagName: 'CANVAS', closest: () => null };
    body.classList.add('mpg-active');
    app.handleKeydown({ key: ' ', code: 'Space', target, preventDefault() {} });
    body.classList.remove('mpg-active');
    sandbox.Router.activeRoute = 'gpa';
    app.handleKeydown({ key: ' ', code: 'Space', target, preventDefault() {} });
    assert.equal(reveals, 0, 'hidden study sessions cannot react to game or other-page shortcuts');
}
const history = A.util.questionHistoryMarkup([{ prompt: '<img>', answer: '<script>', chosen: 'wrong', correct: false }, { prompt: 'Q', answer: 'A', correct: null }]);
assert.ok(history.includes('&lt;img&gt;') && history.includes('&lt;script&gt;') && history.includes('Skipped'));
assert.ok(!history.includes('<script>'));
console.log('SQL constraint naming, HUD defaults, 55-degree/60% joystick thresholds, guarded multi-touch actions, Jump buttons, and HUD disclosure passed.');
console.log('Modal/game-result focus, background input isolation and escaped shared question summaries passed.');

(async () => {
    await checkPracticeGrading();
    const app = Object.create(sandbox.window.TestApp.prototype);
    const card = new Element();
    const handlers = {};
    const message = {};
    sandbox.document.getElementById = id => id === 'current-flashcard' ? card : id === 'hosted-game-message' ? message : null;
    sandbox.document.addEventListener = (type, handler) => { handlers[type] = handler; };
    app.hideCourseSuggestions = () => {};
    let flips = 0;
    app.revealCard = () => flips++;
    app.bindFlashcardInteraction();
    const event = { target: { closest: selector => selector === '#current-flashcard' ? card : null }, detail: 1 };
    card.emit('pointerdown', 20, 20, { button: 0 });
    handlers.pointermove({ pointerId: 1, clientX: 35, clientY: 20 });
    await app.handleClick(event);
    assert.equal(flips, 0, 'scroll/drag gestures cannot flip cards');
    card.emit('pointerdown', 20, 20, { button: 0 });
    handlers.pointerup({ pointerId: 1, clientX: 25, clientY: 20 });
    await app.handleClick(event);
    assert.equal(flips, 1, 'deliberate taps still flip');
    await app.handleClick({ ...event, detail: 2 });
    assert.equal(flips, 1, 'second click of a double click cannot undo the first flip');
    card.emit('pointerdown', 20, 20, { button: 0 });
    handlers.pointercancel({ pointerId: 1 });
    await app.handleClick(event);
    assert.equal(flips, 1, 'cancelled touches cannot flip');
    card.emit('pointerdown', 20, 20, { button: 0 });
    card.emit('pointerdown', 20, 20, { button: 0, pointerId: 2, isPrimary: false });
    await app.handleClick(event);
    assert.equal(flips, 1, 'multi-finger gestures cannot flip');
    await app.handleClick({ ...event, detail: 0 });
    assert.equal(flips, 2, 'keyboard activation remains available');

    for (const id of ['host-game-form', 'join-game-form']) {
        const button = { disabled: false };
        const form = { id, dataset: {}, querySelector: () => button };
        let calls = 0, finish;
        app.hostGame = app.joinGame = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
        const event = { target: form, preventDefault() {} };
        const first = app.handleSubmit(event);
        await app.handleSubmit(event);
        assert.equal(calls, 1, 'repeated taps cannot create/join multiple rooms');
        assert.equal(button.disabled, true);
        finish();
        await first;
        assert.equal(button.disabled, false);
        assert.equal(form.dataset.connecting, undefined);
        const next = app.handleSubmit(event);
        assert.equal(calls, 2, 'controls recover after the request completes');
        finish();
        await next;
    }
    console.log('Intentional flashcard taps, drag/cancel/multi-touch guards and duplicate room-submit protection passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
