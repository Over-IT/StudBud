const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FlashcardTools, SM2Engine } = require('../flashcardEngine.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('app.js');
const elements = new Map();
function element(id = '') {
    const classes = new Set();
    return { id, dataset: {}, style: {}, inert: false, isConnected: true, children: [],
        classList: { add: (...items) => items.forEach(item => classes.add(item)),
            remove: (...items) => items.forEach(item => classes.delete(item)),
            contains: item => classes.has(item),
            toggle(item, force = !classes.has(item)) { if (force) classes.add(item); else classes.delete(item); } },
        setAttribute(key, value) { this[key] = value; }, removeAttribute(key) { delete this[key]; },
        toggleAttribute() {}, querySelectorAll: () => [], querySelector: () => null,
        contains: () => false, focus() { document.activeElement = this; } };
}
const body = element('body');
body.style = { setProperty() {}, removeProperty() {} };
const document = { body, documentElement: { style: {} }, activeElement: null,
    getElementById: id => elements.get(id) || null, querySelectorAll: () => [],
    querySelector: () => null, addEventListener() {} };
const media = { matches: true, listeners: [], addEventListener(event, listener) { this.listeners.push(listener); } };
const preferences = new Map();
const sandbox = { console, Date, Math, Set, Map, document, setTimeout, clearTimeout,
    localStorage: { getItem: key => preferences.get(key) || null, setItem: (key, value) => preferences.set(key, value) }, EventBus: { emit() {} },
    Soundscape: { stopAll() {} },
    window: { FlashcardTools, SM2Engine, scrollY: 120, scrollTo() {}, matchMedia: () => media, location: { hash: '' } } };
vm.createContext(sandbox);
vm.runInContext(source.slice(source.indexOf('    class AppStateEngine'), source.indexOf('    const AppState ='))
    + '\nglobalThis.AppState = Object.create(AppStateEngine.prototype);', sandbox);
const state = sandbox.AppState.state = { profile: { school: 'pchs' }, courses: [], assignments: [],
    currentView: 'flashcard', settings: {}, flashcards: [] };
sandbox.AppState.saveToLocalStorage = () => {};
sandbox.AppState.saveFlashcardDeck = async () => {};
vm.runInContext(source.slice(source.indexOf('    class AppOrchestrator'), source.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
sandbox.window.NexusApp = app;
vm.runInContext(source.slice(source.indexOf('    const WORKSPACES'), source.indexOf('    const Router ='))
    + '\nglobalThis.Router = new RouterEngine();', sandbox);
const course = { code: 'BIO1/BIO2', title: 'Honors Biology', term: 'S1', credits: 1 };
sandbox.AppState.addCourse(course);
for (const duplicate of [
    { ...course, code: 'new-id', catalogCode: 'BIO1/BIO2', title: 'Different imported label' },
    { ...course, code: 'different-id', title: '  honors   biology ', term: 'FY' },
    { ...course, code: 'BIO1', title: 'Another label' }
]) assert.throws(() => sandbox.AppState.addCourse(duplicate), /already saved/);
sandbox.AppState.addCourse({ ...course, code: 'BIO2', term: 'S2' });
sandbox.AppState.addCourse({ ...course, code: 'other-school', school: 'pnhs' });
assert.equal(state.courses.length, 3, 'distinct semesters and schools are preserved');
assert.throws(() => sandbox.AppState.addCourse({ ...course, school: 'pnhs' }), /already saved/, 'record IDs remain globally unique across schools');
assert.throws(() => sandbox.AppState.updateCourse('BIO2', { term: 'FY' }), /already saved/);
assert.equal(state.courses[1].term, 'S2', 'a failed edit cannot mutate existing classes');
sandbox.AppState.updateCourse(course.code, { targetPct: 90 });
sandbox.AppState.addCourse({ code: 'seminar-a', catalogCode: 'CAT-A', title: 'Seminar', term: 'FY' });
sandbox.AppState.addCourse({ code: 'seminar-b', catalogCode: 'CAT-B', title: 'Seminar', term: 'FY' });
assert.equal(state.courses.length, 5, 'different official catalog identities may legitimately share a title');
{
    const oldCourses = state.courses, oldSettings = state.settings;
    const save = sandbox.AppState.saveToLocalStorage;
    sandbox.AppState.saveToLocalStorage = () => { throw new Error('Storage full'); };
    assert.throws(() => sandbox.AppState.saveGradeGoals([], { gradeGoalSource: 'gpa' }), /Storage full/);
    assert.equal(state.courses, oldCourses, 'a failed goal save restores class targets');
    assert.equal(state.settings, oldSettings, 'a failed goal save also restores goal mode');
    sandbox.AppState.saveToLocalStorage = save;
    sandbox.AppState.saveGradeGoals(oldCourses, { ...oldSettings, gradeGoalSource: 'grades' });
    assert.equal(state.settings.gradeGoalSource, 'grades');
    state.settings = oldSettings;
}
app.calculateSemesterCourseGrade = item => item.grade ?? null;
for (const [grade, target, fill, reached] of [[80, 90, 80, false], [95, 90, 95, true],
    [106.25, 97, 100, true], [0, 0, 0, true], [null, 90, 0, false]]) {
    const result = app.classGradeProgress({ grade, targetPct: target });
    assert.equal(result.grade, grade);
    assert.equal(result.fill, fill);
    assert.equal(result.reached, reached);
    assert.equal(result.marker, target / Math.max(100, grade || 0, target) * 100);
}
assert.equal(app.classGradeProgress({ grade: 85, targetPct: null }).marker, null);
assert.match(app.classGradeProgress({ grade: 86.47, targetPct: 90 }).status, /3\.53 percentage points/);
const view = element('flashcard-view'), panels = ['practice', 'manage', 'discover', 'practice manage'].map(page => {
    const panel = element(); panel.dataset.studyPanel = page; return panel;
});
view.querySelectorAll = () => panels;
elements.set(view.id, view);
for (const id of ['study-page-title', 'study-page-description', 'active-view-title', 'page-guide', 'workspace-tabs',
    'active-study-area', 'study-summary', 'study-type-toggle', 'study-direction', 'planner-page-title',
    'planner-page-description', 'planner-library']) elements.set(id, element(id));
let renders = 0;
app.renderDecks = () => renders++;
document.querySelectorAll = selector => selector === '.view' ? [view] : [];
for (const [route, page] of [['flashcard', 'practice'], ['study-manage', 'manage'], ['study-discover', 'discover']]) {
    sandbox.Router.navigate(route);
    assert.equal(view.dataset.studyPage, page);
    assert.equal(view.classList.contains('hidden'), false, 'all Study pages use the shared library view');
    for (const panel of panels) assert.equal(panel.classList.contains('hidden'), !panel.dataset.studyPanel.split(' ').includes(page));
    assert.match(elements.get('workspace-tabs').innerHTML, new RegExp(`data-target="${route}-view" aria-current="page"`));
}
assert.equal(renders, 3);
const plannerView = element('planner-view'), plannerPanels = ['plan', 'tasks'].map(page => {
    const panel = element(); panel.dataset.plannerPanel = page; return panel;
});
document.querySelectorAll = selector => selector === '.view' ? [view, plannerView] : selector === '[data-planner-panel]' ? plannerPanels : [];
for (const route of ['planner', 'tasks']) {
    sandbox.Router.navigate(route);
    assert.equal(plannerView.classList.contains('hidden'), false, 'Planner and Tasks share data without sharing their layout');
    assert.equal(elements.get('planner-page-title').textContent, route === 'tasks' ? 'Tasks' : 'Planner');
    for (const panel of plannerPanels) assert.equal(panel.classList.contains('hidden'), panel.dataset.plannerPanel !== (route === 'tasks' ? 'tasks' : 'plan'));
    assert.match(elements.get('workspace-tabs').innerHTML, new RegExp(`data-target="${route}-view" aria-current="page"`));
}
assert.doesNotMatch(read('index.html'), /id="theme-toggle"/, 'the header no longer has a theme toggle');
assert.match(read('index.html'), /header-settings-button[^>]+data-target="settings-view"/, 'header settings remains reachable at every size');
const settingsView = element('settings-view'), settingsPanels = ['general', 'school', 'data'].map(page => {
    const panel = element(); panel.dataset.settingsPanel = page; return panel;
});
settingsView.querySelectorAll = () => settingsPanels;
elements.set(settingsView.id, settingsView);
for (const id of ['settings-page-title', 'settings-page-description', 'settings-start-page',
    'settings-planner-default', 'settings-study-mode', 'settings-study-direction']) elements.set(id, element(id));
document.querySelectorAll = selector => selector === '.view' ? [view, settingsView] : [];
for (const [route, panel] of [['settings', 'general'], ['settings-school', 'school'], ['settings-data', 'data']]) {
    sandbox.Router.navigate(route);
    assert.equal(settingsView.classList.contains('hidden'), false);
    assert.equal(view.classList.contains('hidden'), true);
    for (const item of settingsPanels) assert.equal(item.classList.contains('hidden'), item.dataset.settingsPanel !== panel);
}
app.renderAssignments = () => {};
app.handleChange({ target: { id: 'settings-start-page', value: 'planner' } });
sandbox.window.location.hash = '';
sandbox.Router.handleHashChange();
assert.equal(sandbox.Router.activeRoute, 'planner', 'a fresh launch honors the saved start page');
sandbox.window.location.hash = '#/gpa';
sandbox.Router.handleHashChange();
assert.equal(sandbox.Router.activeRoute, 'gpa', 'explicit links override the start-page preference');
app.handleChange({ target: { id: 'settings-study-mode', value: 'type' } });
app.handleChange({ target: { id: 'settings-study-direction', value: 'back' } });
assert.equal(preferences.get('studbud-type-answer'), '1');
assert.equal(app.studyDirection(), 'back');
assert.equal(elements.get('settings-study-mode').value, 'type');
assert.equal(elements.get('workspace-tabs').dataset.pageCount, '3');
app.ensureSchemeButtons = app.syncMixerControls = app.syncMixerDrawer = () => {};
state.settings = { theme: 'system' };
app.applyAppearance();
assert.equal(document.documentElement.style.colorScheme, 'dark');
media.matches = false;
media.listeners[0]();
assert.equal(document.documentElement.style.colorScheme, 'light');
state.settings.theme = 'dark';
app.applyAppearance();
media.listeners[0]();
assert.equal(document.documentElement.style.colorScheme, 'dark', 'OS changes never replace an explicit preference');
assert.equal(media.listeners.length, 1, 'appearance refreshes do not accumulate listeners');
const background = element('background'), alreadyInert = element('already-inert'), area = elements.get('active-study-area');
alreadyInert.inert = true;
body.children = [area, background, alreadyInert];
area.parentElement = body;
document.activeElement = background;
app.enterStudyFocus();
assert.equal(background.inert, true);
assert.equal(document.activeElement, area);
app.exitStudyFocus();
assert.equal(background.inert, false);
assert.equal(alreadyInert.inert, true, 'pre-existing inert state is restored, not cleared blindly');
state.currentView = 'flashcard';
sandbox.Router.activeRoute = 'flashcard';
state.flashcards = [{ id: 'focus', cards: [
    { id: 'new', front: 'New', back: 'Answer' },
    { id: 'known', front: 'Known', back: 'Answer', practiceStats: { attempts: 4, recentAnswers: [true, true, true, true],
        recentEvidence: Array.from({ length: 4 }, () => ({ correct: true, weight: 1 })) } },
    { id: 'paused', suspended: true, front: 'Paused', back: 'Answer' }
] }];
let selected;
sandbox.window.SM2Engine = { ...SM2Engine, createSession(cards, options) {
    selected = cards.map(card => card.id); return SM2Engine.createSession(cards, options);
} };
app.recordFlashcardTime = app.renderStudyCard = () => {};
app.studyTimeKey = () => 'focus-session';
app.startStudy('focus', 'focus');
assert.deepEqual(Array.from(selected), ['new']);
assert.ok(app.studySession, 'focus practice uses the real scheduler');
assert.equal(app.cramMode, false, 'focus practice preserves normal scheduled reviews');
app.exitStudyFocus();
const list = element('classmate-list'), button = element();
list.dataset.course = course.code;
button.dataset.id = course.code;
elements.set(list.id, list);
sandbox.window.StudBudCloud = { user: { id: 'me' }, isGuest: () => false };
app.isParkwaySchool = () => true;
app.schoolSemester = () => 'S1';
app.friendlyErrorMessage = error => error.message;
let response = { visible: false, students: [] };
sandbox.window.StudBudCommunityGames = { friendCall: async () => response };
async function run() {
    await app.loadClassmates(button);
    assert.match(list.innerHTML, /Course discovery is off/);
    response = { visible: true, students: [{ user_id: 'other', username: '<img src=x>' }] };
    await app.loadClassmates(button);
    assert.match(list.innerHTML, /&lt;img src=x&gt;/);
    assert.doesNotMatch(list.innerHTML, /<img/);
    response = { students: [] };
    await app.loadClassmates(button);
    assert.match(list.textContent, /invalid response/);
    let firstResolve, secondResolve;
    sandbox.window.StudBudCommunityGames.friendCall = () => new Promise(resolve => {
        if (!firstResolve) firstResolve = resolve; else secondResolve = resolve;
    });
    const first = app.loadClassmates(button), second = app.loadClassmates(button);
    firstResolve({ visible: true, students: [] });
    await first;
    assert.equal(button.disabled, true, 'an old response cannot re-enable controls during a new request');
    secondResolve({ visible: true, students: [] });
    await second;
    assert.equal(button.disabled, false);
    sandbox.window.StudBudCloud.offlineMode = true;
    await app.loadClassmates(button);
    assert.match(list.innerHTML, /internet connection/);
    const sql = read('supabase-setup.sql');
    const rpc = sql.slice(sql.indexOf('create or replace function public.studbud_classmates('),
        sql.indexOf('-- Reconcile only this teacher'));
    for (const pattern of [/auth\.uid\(\)/, /studbud_is_guest\(\)/, /pp\.show_classmates/,
        /not public\.studbud_is_hidden_user/, /p_semester not in \('S1', 'S2'\)/,
        /state,profile,school.*= v_school/, /limit 50/, /'user_id'.*'username'/]) assert.match(rpc, pattern);
    assert.match(sql, /show_classmates boolean not null default false/);
    console.log('Study page routing, duplicate prevention, grade meters, live system theme, study focus, scheduler filtering and classmate privacy/races passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
