const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const gamesWindow = {};
vm.runInNewContext(read('communityGames.js'), { window: gamesWindow, console });
function harness() {
    const elements = new Map(), calls = [], listeners = {}, timers = [], state = { courses: [], flashcards: [] };
    const node = () => ({ innerHTML: '', textContent: '', isConnected: true,
        classList: { toggle() {} }, dataset: {}, querySelector: () => null,
        setAttribute(name, value) { this[name] = value; } });
    for (const id of ['school-community-root', 'school-community-status', 'community-live', 'admin-list', 'admin-status']) elements.set(id, node());
    const document = { hidden: false, addEventListener(type, handler) { listeners[type] = handler; },
        getElementById: id => elements.get(id) || null, querySelectorAll: () => [], querySelector: () => null };
    let account = 'student', available = true;
    const cloud = { user: { id: account } };
    const app = {
        EventBus: { on() {} }, Router: { activeRoute: 'classes', navigate(route) { this.activeRoute = route; } },
        AppState: { get: key => state[key], saveFlashcardDeck: async deck => state.flashcards.push(deck) },
        updateSavedDeck: async (id, patch) => Object.assign(state.flashcards.find(deck => deck.id === id), patch),
        classrooms: { available: () => available, contextKey: () => account, isTeacher: () => false,
            courseCodes: () => ['BIO'], call: async () => ({ classes: [{ id: 'class1', title: 'Biology' }] }),
            courseMatches: (course, code) => course.code === code,
            studentSetsMarkup: () => '<section>Teacher-published sets</section>',
            status: message => elements.get('school-community-status').textContent = message },
        friendlyErrorMessage: error => error.message, schoolShortName: () => 'Central',
        gameNickname: () => 'Student', openHostedGame(room) { this.hostedGameRoom = room; },
        importCommunityDeck: async id => calls.push(['import', id]),
        openReportDialog() {}
    };
    let response = { school_discovery: false, class_discovery: false, people: [], decks: [], posts: [], live: [] };
    const api = {
        schoolCall: async (fn, args) => { calls.push([fn, args]); return response; },
        sharedDeckRow: deck => gamesWindow.StudBudCommunityGames.sharedDeckRow.call({ getUserId: () => account }, deck),
        friendCall: async (fn, args) => { calls.push([fn, args]); return { status: 'pending' }; },
        joinRoom: async code => { calls.push(['join', code]); return { room_code: code }; }
    };
    const window = { crypto: require('node:crypto').webcrypto, StudBudCloud: cloud, StudBudCommunityGames: api, StudBudDialogs: { confirm: async () => true } };
    vm.runInNewContext(read('schoolCommunity.js'), { window, document, Date, Map, setInterval: fn => timers.push(fn), console });
    const community = window.StudBudSchoolCommunity.attach(app);
    const click = async (action, dataset = {}) => {
        const button = { dataset: { schoolAction: action, ...dataset }, disabled: false, isConnected: true,
            setAttribute(name, value) { this[name] = value; } };
        await community.onClick({ target: { closest: () => button } });
        return button;
    };
    return { community, app, api, calls, elements, document, cloud, timers, click, state,
        response(value) { response = value; },
        account(value) { account = value; cloud.user = { id: value }; },
        available(value) { available = value; } };
}

(async () => {
    const h = harness(), c = h.community;
    await c.render();
    assert.equal(h.timers.length, 1);
    assert.match(h.elements.get('school-community-root').innerHTML, /Turn on school discovery/);
    assert.doesNotMatch(h.elements.get('school-community-root').innerHTML, /data-tab="updates"/, 'school has no empty updates tab');
    h.response({ school_discovery: true, class_discovery: true, can_announce: true,
        people: [{ user_id: 'peer', username: '<script>peer</script>' }],
        decks: [{ id: 'deck', title: '<b>Biology</b>', author: 'Teacher', card_count: 10 }],
        posts: [{ id: 'post', author_id: 'student', username: '<img>', kind: 'announcement', body: '<script>alert(1)</script>\nSecond line', created_at: '2026-10-21', reply_count: 2 }],
        live: [{ room_code: 'ABC123', deck_title: '<b>Class review</b>', teacher_username: 'Teacher', status: 'waiting', mode: 'miner' }]
    });
    await c.open('class1', 'Biology');
    assert.match(h.elements.get('school-community-root').innerHTML, /Teacher announcement/);
    assert.match(h.elements.get('school-community-root').innerHTML, /&lt;script&gt;alert/);
    assert.doesNotMatch(h.elements.get('school-community-root').innerHTML, /<script>|<b>Class review/);
    assert.match(h.elements.get('school-community-root').innerHTML, /Join game/);
    c.tab = 'people'; c.paint();
    assert.match(h.elements.get('school-community-root').innerHTML, /&lt;script&gt;peer/);
    c.tab = 'sets'; c.paint();
    assert.match(h.elements.get('school-community-root').innerHTML, /&lt;b&gt;Biology/);
    await h.click('save-set', { id: 'deck' });
    assert.deepEqual(h.calls.at(-1), ['import', 'deck'], 'shared sets use the existing private-copy flow');
    await h.click('add-bud', { name: 'Peer' });
    assert.equal(h.calls.at(-1)[0], 'studbud_friend_request');
    assert.match(h.elements.get('school-community-status').textContent, /request sent/);
    await h.click('join', { code: 'ABC123' });
    assert.equal(h.app.Router.activeRoute, 'multiplayer');
    assert.equal(h.app.hostedGameRoom.room_code, 'ABC123');
    const joined = h.calls.filter(row => row[0] === 'join').length;
    await h.click('join', { code: 'OTHER1' });
    assert.equal(h.calls.filter(row => row[0] === 'join').length, joined, 'cannot silently leave an existing game');
    assert.match(h.elements.get('school-community-status').textContent, /Leave your current game/);
    h.app.Router.activeRoute = 'classes';
    await h.click('discovery', { enabled: 'false' });
    assert.ok(h.calls.some(([fn, args]) => fn === 'studbud_set_school_discovery' && args.p_enabled === false));

    const initialMarkup = h.elements.get('school-community-root').innerHTML;
    c.drafts.set(c.draftKey(''), { body: 'Unsaved question', kind: 'announcement' });
    h.response({ posts: [{ id: 'new-post' }], live: [] });
    await c.poll();
    assert.equal(h.elements.get('school-community-root').innerHTML, initialMarkup, 'polling never rebuilds a composing feed');
    assert.equal(c.drafts.get(c.draftKey('')).body, 'Unsaved question');
    assert.match(c.composeMarkup(), /value="announcement" selected/, 'repaints preserve the announcement draft type');
    assert.match(h.elements.get('school-community-status').textContent, /Refresh/);
    h.document.hidden = true;
    const count = h.calls.length;
    await c.poll();
    assert.equal(h.calls.length, count, 'hidden community pages do not poll');

    const race = harness();
    let finish, started;
    const requested = new Promise(resolve => { started = resolve; });
    race.api.schoolCall = () => new Promise(resolve => { finish = resolve; started(); });
    const loading = race.community.render();
    await requested;
    race.account('new-account');
    race.community.resetContext();
    finish({ posts: [{ body: 'Old private discussion' }] });
    await loading;
    assert.equal(race.community.data, null, 'stale account responses cannot populate the new account');
    assert.doesNotMatch(race.elements.get('school-community-root').innerHTML, /Old private discussion/);

    const enrollment = harness();
    let enroll;
    enrollment.app.classrooms.call = () => new Promise(resolve => { enroll = resolve; });
    const opening = enrollment.community.open('class1', 'Biology');
    assert.equal(enrollment.calls.length, 0, 'class board access waits for enrollment synchronization');
    enroll({ classes: [] });
    await opening;
    assert.deepEqual(enrollment.calls.map(row => row[0]), ['studbud_course_communities', 'studbud_school_community']);

    const submit = harness();
    await submit.community.open('class1', 'Biology');
    const button = { disabled: false, isConnected: true };
    const form = { matches: selector => selector === '[data-community-compose]', dataset: { parent: '' }, elements: { body: { value: '  Study question  ' }, kind: { value: 'discussion' } },
        querySelector: () => button };
    await submit.community.onSubmit({ target: form, preventDefault() {} });
    const post = submit.calls.find(row => row[0] === 'studbud_community_post');
    assert.deepEqual(JSON.parse(JSON.stringify(post[1])), { p_class_id: 'class1', p_body: 'Study question', p_kind: 'discussion', p_parent_id: null });
    submit.api.schoolCall = async () => { throw Error('Connection unavailable'); };
    form.elements.body.value = 'Keep this draft';
    submit.community.drafts.set(submit.community.draftKey(''), { body: 'Keep this draft', kind: 'discussion' });
    await submit.community.onSubmit({ target: form, preventDefault() {} });
    assert.equal(submit.community.drafts.get(submit.community.draftKey('')).body, 'Keep this draft');
    assert.match(submit.elements.get('school-community-status').textContent, /Connection unavailable/);
    assert.equal(button.disabled, false);

    const repeated = harness();
    await repeated.community.open('class1', 'Biology');
    let finishPost, postCalls = 0;
    repeated.api.schoolCall = async fn => {
        if (fn === 'studbud_community_post') {
            postCalls++;
            return new Promise(resolve => { finishPost = resolve; });
        }
        return { posts: [] };
    };
    const compose = () => ({ matches: selector => selector === '[data-community-compose]', dataset: { parent: '' },
        elements: { body: { value: 'One message' }, kind: { value: 'discussion' } },
        querySelector: () => ({ disabled: false, isConnected: true }) });
    const sending = repeated.community.onSubmit({ target: compose(), preventDefault() {} });
    repeated.community.tab = 'sets'; repeated.community.paint();
    repeated.community.tab = 'updates'; repeated.community.paint();
    assert.match(repeated.community.composeMarkup(), /disabled>Posting/);
    await repeated.community.onSubmit({ target: compose(), preventDefault() {} });
    assert.equal(postCalls, 1, 'rebuilding the form cannot bypass an in-flight post guard');
    finishPost({});
    await sending;
    assert.equal(repeated.community.posting.size, 0);
    assert.equal(repeated.community.drafts.size, 0);

    const threads = harness();
    await threads.community.open('class1', 'Biology');
    let finishReplies;
    threads.api.schoolCall = () => new Promise(resolve => { finishReplies = resolve; });
    const oldThread = { hidden: false, innerHTML: '', setAttribute() {} };
    threads.elements.set('community-thread-post1', oldThread);
    const fetching = threads.community.loadReplies('post1');
    const replacement = { hidden: true, innerHTML: 'New tab', setAttribute() {} };
    threads.elements.set('community-thread-post1', replacement);
    finishReplies({ posts: [{ id: 'reply', body: 'Stale reply' }] });
    await fetching;
    assert.equal(replacement.innerHTML, 'New tab', 'a reply response cannot overwrite a rebuilt or closed discussion');
    threads.elements.set('community-thread-post1', oldThread);
    oldThread.hidden = true;
    const showing = threads.click('replies', { id: 'post1' });
    assert.equal(oldThread.hidden, false);
    await threads.click('replies', { id: 'post1' });
    assert.equal(oldThread.hidden, true, 'discussions can close even while replies load');
    finishReplies({ posts: [{ id: 'reply', body: 'Closed reply' }] });
    await showing;
    assert.doesNotMatch(oldThread.innerHTML, /Closed reply/);
    const sameMarkup = { writes: 0, html: 'Same live game', get innerHTML() { return this.html; },
        set innerHTML(value) { this.html = value; this.writes++; } };
    threads.community.updateLive(sameMarkup, 'Same live game');
    assert.equal(sameMarkup.writes, 0, 'unchanged polling keeps live buttons and focus intact');
    threads.community.updateLive(sameMarkup, 'New live game');
    assert.equal(sameMarkup.writes, 1);
    sameMarkup.html = 'Browser-normalized live markup';
    threads.community.updateLive(sameMarkup, 'New live game');
    assert.equal(sameMarkup.writes, 1, 'browser HTML normalization cannot trigger repeated button replacement');

    const refresh = harness();
    await refresh.community.open('class1', 'Biology');
    const feed = refresh.elements.get('school-community-root').innerHTML;
    refresh.community.drafts.set(refresh.community.draftKey(''), { body: 'Keep my question' });
    refresh.api.schoolCall = async () => { throw Error('Offline'); };
    await refresh.community.render();
    assert.equal(refresh.elements.get('school-community-root').innerHTML, feed, 'a failed refresh leaves the feed and composing controls intact');
    assert.equal(refresh.community.drafts.get(refresh.community.draftKey('')).body, 'Keep my question');
    assert.match(refresh.elements.get('school-community-status').textContent, /Could not refresh.*Offline/);

    const courses = harness();
    courses.api.schoolCall = async fn => fn === 'studbud_course_communities'
        ? { classes: [{ id: 'course', title: 'Biology', course_code: 'BIO', community: true }] }
        : { can_post: true, can_announce: false, posts: [], class_sets: [], course_community: true, teacher_classes: [] };
    await courses.community.render();
    assert.match(courses.elements.get('school-community-root').innerHTML, /My classrooms/);
    assert.match(courses.elements.get('school-community-root').innerHTML, /Open classroom/);
    assert.match(courses.elements.get('school-community-root').innerHTML, /No teacher or join code needed/);
    await courses.community.open('course', 'Biology');
    assert.match(courses.elements.get('school-community-root').innerHTML, /Write a post/);
    assert.doesNotMatch(courses.elements.get('school-community-root').innerHTML, /Open teacher tools/);

    const teacher = harness();
    teacher.app.classrooms.isTeacher = () => true;
    const managed = [];
    teacher.app.classrooms.renderTeacherHome = () => managed.push('add-course');
    teacher.app.classrooms.renderTeacherDetail = () => managed.push('tools');
    teacher.app.classrooms.call = async (fn, args) => {
        if (fn === 'studbud_teacher_class_detail') {
            managed.push(args.p_class_id);
            return { id: 'own-teaching-class', course_code: 'BIO', title: 'Biology', decks: [], students: [] };
        }
        return { classes: [{ id: 'own-teaching-class', course_code: 'BIO', title: 'Biology' }] };
    };
    teacher.api.schoolCall = async fn => fn === 'studbud_course_communities'
        ? { classes: [{ id: 'course-bio', course_code: 'BIO', title: 'Biology', community: true }] }
        : { can_announce: true, course_community: true, posts: [], people: [], decks: [], live: [] };
    await teacher.community.render();
    assert.ok(managed.includes('add-course'), 'course creation stays inside the classroom overview');
    assert.equal(teacher.community.classes.length, 1, 'a teacher does not create a duplicate classroom card');
    assert.equal(teacher.community.classes[0].id, 'course-bio');
    await teacher.community.open('course-bio', 'Biology');
    assert.ok(managed.includes('own-teaching-class'), 'private tools use the owned teaching ID, not the public course ID');
    assert.match(teacher.elements.get('school-community-root').innerHTML, /data-tab="teacher"/);
    teacher.community.tab = 'teacher'; teacher.community.paint();
    assert.ok(managed.includes('tools'));
    assert.match(teacher.elements.get('school-community-root').innerHTML, /id="classes-root"/);
    teacher.community.tab = 'sets'; teacher.community.paint();
    assert.match(teacher.elements.get('school-community-root').innerHTML, /Teacher-published sets/);
    const privateCalls = managed.filter(id => id === 'own-teaching-class').length;
    teacher.app.classrooms.call = async () => ({ classes: [] });
    await teacher.community.render();
    assert.equal(managed.filter(id => id === 'own-teaching-class').length, privateCalls, 'announcement permission never grants another teacher private tools');
    assert.doesNotMatch(teacher.elements.get('school-community-root').innerHTML, /data-tab="teacher"/);
    assert.doesNotMatch(h.elements.get('school-community-root').innerHTML, /data-tab="teacher"/, 'students never see teacher tools');
    let finishPrivate, startPrivate;
    const privateStarted = new Promise(resolve => { startPrivate = resolve; });
    teacher.app.classrooms.call = async fn => {
        if (fn === 'studbud_teacher_class_detail') {
            startPrivate();
            return new Promise(resolve => { finishPrivate = resolve; });
        }
        return { classes: [{ id: 'own-teaching-class', course_code: 'BIO', title: 'Biology' }] };
    };
    const privateLoading = teacher.community.render();
    await privateStarted;
    await teacher.community.open(null);
    finishPrivate({ id: 'own-teaching-class', students: [{ username: 'private-student' }] });
    await privateLoading;
    assert.equal(teacher.community.teacherDetail, null, 'a stale private roster cannot appear after leaving its classroom');
    assert.doesNotMatch(teacher.elements.get('school-community-root').innerHTML, /private-student|data-tab="teacher"/);
    courses.state.flashcards = [{ id: 'own', title: 'My unit set', cards: [
        { front: 'Cell', back: 'Basic unit', practiceStats: { attempts: 20 }, answerImage: 'private' },
        { front: 'ATP', back: 'Energy' }] }];
    const sharing = courses.community.classSetsMarkup();
    assert.match(sharing, /value="public" selected/);
    assert.match(sharing, /value="course"/);
    assert.match(sharing, /value="school"/);
    assert.match(sharing, /name="note".*required maxlength="300"/);
    const fields = Object.assign([], { deck: { value: 'own' }, note: { value: 'Friday quiz review' }, visibility: { value: 'public' } });
    fields.push(fields.deck, fields.note, fields.visibility);
    const shareButton = { disabled: false, isConnected: true };
    const shareForm = { elements: fields, matches: selector => selector === '[data-community-share]', querySelector: () => shareButton };
    let sharedArgs;
    const normalCall = courses.api.schoolCall;
    courses.api.schoolCall = async (fn, args) => {
        if (fn === 'studbud_share_class_set') { sharedArgs = args; return { public_deck_id: 'public-id' }; }
        return normalCall(fn, args);
    };
    await courses.community.onSubmit({ target: shareForm, preventDefault() {} });
    assert.equal(sharedArgs.p_class_id, 'course');
    assert.equal(sharedArgs.p_visibility, 'public');
    assert.equal(sharedArgs.p_note, 'Friday quiz review');
    assert.equal(sharedArgs.p_cards[0].practiceStats, undefined);
    assert.equal(sharedArgs.p_cards[0].answerImage, undefined);
    assert.equal(courses.state.flashcards[0].communityPublished, true, 'public sharing updates Manage sets publishing controls');
    assert.equal(courses.state.flashcards[0].communityDeckId, 'public-id');
    courses.api.schoolCall = async () => ({ id: 'share1', title: 'Shared biology', owner_id: 'peer', can_save: true,
        course_code: 'BIO', course_title: 'Biology', author: 'Peer', cards: [{ front: 'Term', back: 'Definition' }] });
    await Promise.all([courses.community.saveSharedSet('share1'), courses.community.saveSharedSet('share1')]);
    assert.equal(courses.state.flashcards.filter(deck => deck.classShareSourceId === 'share1').length, 1, 'repeated saves create only one personal copy');
    const saved = courses.state.flashcards.find(deck => deck.classShareSourceId === 'share1');
    assert.equal(saved.classShareSourceOwnerId, 'peer');
    assert.throws(() => courses.api.sharedDeckRow(saved), /someone else/, 'private class copies cannot be reposted publicly');
    courses.community.data = { can_post: false, can_moderate: true, school: 'pnhs', posts: [{ id: 'p', body: 'Review me', author_id: 'peer' }], class_sets: [] };
    courses.community.paint();
    assert.match(courses.elements.get('school-community-root').innerHTML, /Review only/);
    assert.doesNotMatch(courses.elements.get('school-community-root').innerHTML, /Write a post/);
    assert.match(courses.community.postMarkup({ id: 'p', author_id: 'peer', body: 'Review' }), /data-school-action="delete"/);
    const mod = harness();
    mod.app.canModerateFlashcards = true;
    mod.app.adminTab = 'classes';
    mod.app.Router.activeRoute = 'admin';
    mod.api.adminCall = async (fn, args) => {
        mod.calls.push([fn, args]);
        return { classes: [{ id: 'c', title: '<Class>', school: 'pchs', community: true }],
            own_school: 'pchs', extra_schools: ['pnhs'], all_schools: false };
    };
    await mod.community.renderModeration('Biology');
    assert.match(mod.elements.get('admin-list').innerHTML, /&lt;Class&gt;/);
    assert.match(mod.elements.get('admin-list').innerHTML, /value="pnhs"/);
    assert.doesNotMatch(mod.elements.get('admin-list').innerHTML, /data-community-scope/);
    assert.equal(mod.calls.at(-1)[1].p_query, 'Biology');
    mod.app.isAdmin = true;
    await mod.community.renderModeration('');
    assert.match(mod.elements.get('admin-list').innerHTML, /data-community-scope/);
    mod.app.canModerateFlashcards = false;
    await assert.rejects(mod.community.renderModeration(), /Moderator access/);

    const host = harness(), hostApp = host.app, hostEvents = {};
    hostApp.classrooms.isTeacher = () => true;
    hostApp.classrooms.findClassDeck = () => ({ deck: { id: 'deck1', title: 'Review' } });
    hostApp.classrooms.saveClassDeck = async () => ({ id: 'local1' });
    hostApp.questionRewardRecommendation = () => ({ suggested: 20 });
    let creations = 0, listings = 0;
    hostApp.hostGame = async () => {
        creations++;
        return hostApp.hostedGameRoom = { room_code: 'ABC123', state: {} };
    };
    hostApp.renderHostedGameRoom = () => {};
    host.api.setHostMode = async () => ({ room_code: 'ABC123', state: { host_spectator: true } });
    host.api.schoolCall = async fn => {
        assert.equal(fn, 'studbud_class_live_game');
        if (++listings === 1) throw Error('Listing unavailable');
    };
    const hostStatus = { textContent: '' }, submitButton = { disabled: false };
    const hostForm = { elements: { mode: { value: 'miner', focus() {} }, minutes: { value: '5' }, spectator: { checked: true } },
        addEventListener: (name, handler) => hostEvents[name] = handler,
        querySelector: selector => selector === '[type="submit"]' ? submitButton : selector === '[data-host-status]' ? hostStatus : { addEventListener() {} } };
    host.document.createElement = () => ({ firstElementChild: hostForm, setAttribute() {}, addEventListener() {}, showModal() {}, close() {}, remove() {} });
    host.document.body = { appendChild() {} };
    await host.community.hostDialog('class1', 'deck1');
    await hostEvents.submit({ preventDefault() {} });
    assert.equal(creations, 1);
    assert.equal(listings, 1);
    assert.match(hostStatus.textContent, /Room ABC123 already exists/);
    await hostEvents.submit({ preventDefault() {} });
    assert.equal(creations, 1, 'listing retry must never create a second room');
    assert.equal(listings, 2);
    assert.equal(hostApp.hostedGameRoom.state.host_spectator, true);
    assert.equal(hostApp.Router.activeRoute, 'multiplayer');
    assert.equal(host.community.pendingLive, null);

    const mixedVersion = harness();
    delete mixedVersion.api.schoolCall;
    await mixedVersion.community.render();
    assert.match(mixedVersion.elements.get('school-community-root').innerHTML, /Reload StudBud/);
    assert.doesNotMatch(mixedVersion.elements.get('school-community-root').innerHTML, /not a function/);

    const html = read('index.html'), app = read('app.js'), classes = read('classrooms.js');
    assert.match(html, /src="schoolCommunity\.js"/);
    assert.match(read('service-worker.js'), /'\.\/schoolCommunity\.js'/);
    assert.match(app, /route === 'classes'.*schoolCommunity\?\.render/);
    assert.match(classes, /data-school-action="host-set"/);
    assert.doesNotMatch(html, /id="school-community-view"/, 'there is only one classroom view');
    assert.match(read('communityGames.js'), /async schoolCall\(fn/);
    console.log('School community: privacy opt-ins, scoped routing, safe markup, drafts/polling, stale accounts, posting failures, existing imports/Buds and live joining passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
