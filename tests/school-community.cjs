const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function harness() {
    const elements = new Map(), calls = [], listeners = {}, timers = [];
    const node = () => ({ innerHTML: '', textContent: '', isConnected: true,
        classList: { toggle() {} }, dataset: {}, querySelector: () => null });
    for (const id of ['school-community-root', 'school-community-status', 'community-live']) elements.set(id, node());
    const document = { hidden: false, addEventListener(type, handler) { listeners[type] = handler; },
        getElementById: id => elements.get(id) || null, querySelectorAll: () => [] };
    let account = 'student', available = true;
    const cloud = { user: { id: account } };
    const app = {
        EventBus: { on() {} }, Router: { activeRoute: 'school-community', navigate(route) { this.activeRoute = route; } },
        classrooms: { available: () => available, contextKey: () => account, isTeacher: () => false,
            courseCodes: () => ['BIO'], call: async () => ({ classes: [{ id: 'class1', title: 'Biology' }] }),
            status: message => elements.get('school-community-status').textContent = message },
        friendlyErrorMessage: error => error.message, schoolShortName: () => 'Central',
        gameNickname: () => 'Student', openHostedGame(room) { this.hostedGameRoom = room; },
        importCommunityDeck: async id => calls.push(['import', id]),
        openReportDialog() {}
    };
    let response = { school_discovery: false, class_discovery: false, people: [], decks: [], posts: [], live: [] };
    const api = {
        schoolCall: async (fn, args) => { calls.push([fn, args]); return response; },
        friendCall: async (fn, args) => { calls.push([fn, args]); return { status: 'pending' }; },
        joinRoom: async code => { calls.push(['join', code]); return { room_code: code }; }
    };
    const window = { StudBudCloud: cloud, StudBudCommunityGames: api, StudBudDialogs: { confirm: async () => true } };
    vm.runInNewContext(read('schoolCommunity.js'), { window, document, Date, Map, setInterval: fn => timers.push(fn), console });
    const community = window.StudBudSchoolCommunity.attach(app);
    const click = async (action, dataset = {}) => {
        const button = { dataset: { schoolAction: action, ...dataset }, disabled: false, isConnected: true };
        await community.onClick({ target: { closest: () => button } });
        return button;
    };
    return { community, app, api, calls, elements, document, cloud, timers, click,
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
    h.app.Router.activeRoute = 'school-community';
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
    let finish;
    race.api.schoolCall = () => new Promise(resolve => { finish = resolve; });
    const loading = race.community.render();
    race.account('new-account');
    race.community.resetContext();
    finish({ posts: [{ body: 'Old private discussion' }] });
    await loading;
    assert.equal(race.community.data, null, 'stale account responses cannot populate the new account');
    assert.doesNotMatch(race.elements.get('school-community-root').innerHTML, /Old private discussion/);

    const submit = harness();
    await submit.community.open('class1', 'Biology');
    const button = { disabled: false, isConnected: true };
    const form = { matches: () => true, dataset: { parent: '' }, elements: { body: { value: '  Study question  ' }, kind: { value: 'discussion' } },
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
    assert.match(app, /route === 'school-community'.*schoolCommunity\?\.render/);
    assert.match(classes, /data-school-action="host-set"/);
    assert.match(classes, /data-school-live=/);
    assert.match(read('communityGames.js'), /async schoolCall\(fn/);
    console.log('School community: privacy opt-ins, scoped routing, safe markup, drafts/polling, stale accounts, posting failures, existing imports/Buds and live joining passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
