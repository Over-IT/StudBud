const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const nodes = new Map();
const timers = new Map();
let timerId = 0;
function element() {
    const classes = new Set();
    return { value: '', textContent: '', innerHTML: '', dataset: {}, style: {},
        classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
            toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
        setAttribute() {}, appendChild() {}, remove() {}, querySelector: () => element(), querySelectorAll: () => [] };
}
const node = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
const routes = [];
const cloud = { user: { id: 'host', user_metadata: { username: 'Tester' } }, offlineMode: false };
const sandbox = { console, Map, Set, Date, Math, performance,
    setInterval: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearInterval: id => timers.delete(id), setTimeout: () => 0, requestAnimationFrame: () => 0,
    document: { addEventListener() {}, hidden: false, body: element(), getElementById: node, querySelector: () => element(), querySelectorAll: () => [], createElement: element },
    window: { addEventListener() {}, removeEventListener() {}, StudBudCloud: cloud, location: {}, matchMedia: () => ({ matches: false }) },
    Router: { navigate: route => routes.push(route) }, AppState: { get: () => [] }
};
vm.createContext(sandbox);
const appSource = source('app.js');
vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp =')) + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
app.multiplayerDisplayName = () => 'Tester';
app.profileCosmetics = row => row || {};
app.multiplayerAvatarMarkup = app.accountTagMarkup = () => '';
app.canTestGames = app.canAccessStaff = true;
app.adminTab = 'games';
app.waitingRunner = { started: true };
app.stopWaitingRunner = () => {};
const games = sandbox.window.StudBudCommunityGames = {};
const room = players => ({ room_code: 'ABCDEF', host_id: 'host', mode: 'skyline', deck_title: 'Test', status: 'waiting',
    goal_type: 'time', time_limit_seconds: 300, state: { players } });
const host = { id: 'host', nickname: 'Host' }, bud = { id: 'bud', nickname: 'Joining bud' };
async function run() {
    await app.loadAdminList();
    assert.match(node('admin-list').innerHTML, /Single player \(with bots\)/);
    assert.match(node('admin-list').innerHTML, /Multiplayer \(other testers can join\)/);
    node('admin-game-test-session').value = 'multiplayer';
    node('admin-game-test-mode').value = 'skyline';
    node('admin-game-test-bots').value = '3';
    node('admin-game-test-seed').value = '42';
    sandbox.window.StudBudArcade = { games: { skyline: class {} } };
    let created, opened;
    games.createRoom = async (...args) => { created = args; return { ...room([host]), state: { players: [host], staff_test: true, seed: 42 } }; };
    const realOpen = app.openHostedGame;
    app.openHostedGame = result => { opened = result; };
    app.startPractice = () => { throw Error('Multiplayer must not create local bots'); };
    await app.runAdminAction('test-game', {});
    assert.equal(created[4].staff_test, true);
    assert.equal(created[4].seed, 42);
    assert.equal(created[4].botCount, undefined);
    assert.equal(opened.state.players.length, 1, 'real room contains only its human host');
    assert.equal(routes.at(-1), 'multiplayer');
    for (const state of [{ offlineMode: true }, { user: null }, { user: { id: 'guest', is_anonymous: true } }]) {
        const saved = { ...cloud }; Object.assign(cloud, state);
        await assert.rejects(app.hostStaffTest('skyline'), /connected tester/);
        Object.assign(cloud, saved);
    }
    app.canTestGames = false;
    await assert.rejects(app.hostStaffTest('skyline'), /connected tester/);
    app.canTestGames = true;

    games.friendCall = async () => ({ friends: [{ user_id: 'bud', username: 'My bud' }], incoming: [], outgoing: [] });
    cloud.getFriendRooms = async () => [{ host_id: 'bud', room_code: 'ABCDEF', mode: 'skyline', staff_test: true }];
    await app.loadFriends();
    assert.match(node('friend-list').innerHTML, /Hosting skyline · staff test/);
    assert.match(node('friend-list').innerHTML, /data-action="friend-join-game" data-code="ABCDEF">Join/);
    cloud.getFriendRooms = async () => { throw Error('RPC not deployed'); };
    await app.loadFriends();
    assert.match(node('friend-list').innerHTML, /My bud/);
    assert.doesNotMatch(node('friend-list').innerHTML, /friend-join-game/);
    let joined;
    games.joinRoom = async (code, name) => { joined = { code, name }; return room([host, bud]); };
    await app.joinFriendGame('ABCDEF');
    assert.deepEqual(joined, { code: 'ABCDEF', name: 'Tester' });
    let toast;
    app.showLobbyToast = message => { toast = message; };
    games.joinRoom = async () => { throw Error('This room is full.'); };
    await app.joinFriendGame('ABCDEF');
    assert.match(toast, /full/);
    app.setFriendPolling(true);
    assert.equal(timers.get(app.friendPollTimer).ms, 20000);
    app.setFriendPolling(false);
    assert.equal(app.friendPollTimer, null);
    cloud.offlineMode = true;
    app.setFriendPolling(true);
    assert.equal(app.friendPollTimer, null);
    cloud.offlineMode = false;

    app.openHostedGame = realOpen;
    let changed, closed = 0;
    games.watchRoom = (code, callback) => { changed = callback; return () => closed++; };
    games.getRoom = async () => room([host, bud]);
    app.openHostedGame(room([host]));
    assert.doesNotMatch(node('hosted-room-players').innerHTML, /Joining bud/);
    assert.equal(node('hosted-start-btn').disabled, true);
    await changed();
    assert.match(node('hosted-room-players').innerHTML, /Joining bud/, 'presence update fetches and renders roster before start');
    assert.equal(node('hosted-start-btn').disabled, false);
    cloud.user = { id: 'bud' };
    app.openHostedGame(room([host]));
    await changed();
    assert.match(node('hosted-room-players').innerHTML, /Joining bud/, 'joiners also receive live lobby updates');
    assert.equal(closed, 1, 'opening another room removes the previous watcher');
    let resolveRoom;
    games.getRoom = () => new Promise(resolve => { resolveRoom = resolve; });
    const refreshing = app.refreshHostedGame();
    app.hostedGameRoom = { ...room([host]), room_code: 'NEWWWW' };
    resolveRoom(room([host, bud])); await refreshing;
    assert.equal(app.hostedGameRoom.room_code, 'NEWWWW', 'stale fetch cannot replace another room');

    vm.runInContext(source('communityGames.js'), sandbox);
    const api = sandbox.window.StudBudCommunityGames;
    const handlers = {};
    let removed = 0, tracked = 0, updates = 0, status;
    const channel = { on(event, filter, fn) { handlers[event] = fn; return this; },
        subscribe(fn) { status = fn; return this; }, track: async () => { tracked++; } };
    api.getGameClient = () => ({ channel: () => channel, removeChannel: () => { removed++; } });
    const unsubscribe = api.watchRoom('ABCDEF', () => { updates++; });
    status('SUBSCRIBED'); handlers.presence();
    assert.equal(tracked, 1); assert.equal(updates, 2);
    unsubscribe(); handlers.presence();
    assert.equal(removed, 1); assert.equal(updates, 2, 'removed watcher ignores further notifications');

    vm.runInContext(source('cloudSync.js'), sandbox);
    const sync = sandbox.window.StudBudCloud;
    let queries = 0;
    sync.user = { id: 'host' }; sync.client = { rpc: async fn => { queries++; assert.equal(fn, 'studbud_friend_open_rooms'); return { data: [] }; } };
    await sync.getFriendRooms(); assert.equal(queries, 1);
    sync.offlineMode = true; await sync.getFriendRooms(); assert.equal(queries, 1);
    sync.offlineMode = false; sync.user.is_anonymous = true;
    await sync.getFriendRooms(); assert.equal(queries, 1);

    vm.runInContext(source('multiplayerEngine.js'), sandbox);
    const Session = sandbox.window.StudBudArcade.Session;
    const session = Object.create(Session.prototype);
    Object.assign(session, { room: room([host]), user: host, roster: new Map(), remotes: new Map(), game: {} });
    session.updateRoom(room([host, bud]));
    assert.ok(session.roster.has('bud'), 'active sessions reconcile newly added roster members');
    session.updateRoom(room([host]));
    assert.ok(!session.roster.has('bud'), 'active sessions remove departed members');
    for (const method of ['bind', 'loadCards', 'resize']) Session.prototype[method] = () => {};
    let connections = 0;
    Session.prototype.connect = () => { connections++; };
    Session.prototype.buildDom = function () { this.overlay = element(); };
    sandbox.window.StudBudArcade.games.skyline = class { constructor() { this.res = { value: 0, max: 100 }; } };
    const testingRoom = { ...room([host, bud]), status: 'playing', state: { players: [host, bud], staff_test: true, seed: 42 } };
    const liveTest = new Session({ room: testingRoom, user: host, api: games, isHost: true });
    assert.equal(liveTest.testing, true);
    assert.equal(liveTest.practice, false, 'multiplayer staff test retains real networking');
    assert.equal(liveTest.seed, 42);
    assert.equal(liveTest.roster.size, 2);
    assert.equal(liveTest.spend(100000), true, 'test resources stay unlimited');
    assert.equal(connections, 1);
    const engine = source('multiplayerEngine.js');
    assert.match(engine, /this.testing = Boolean\(options.testing \|\| this.room.state\?\.staff_test\)/);
    let saved = false;
    sandbox.AppState.recordStudySession = async () => { saved = true; };
    await app.saveGameSummary({ testing: true });
    assert.equal(saved, false, 'staff tests never save study progress');

    const sql = source('supabase-setup.sql');
    const fn = name => sql.slice(sql.indexOf('create or replace function public.' + name)).split('$$;')[0];
    assert.match(fn('studbud_create_game_room('), /v_staff_test and \(public.studbud_is_guest\(\) or not/);
    assert.match(fn('studbud_create_game_room('), /studbud_has_user_tag\(v_user_id, 'tester'\)/);
    assert.match(fn('studbud_join_game_room('), /Only testers and administrators can join staff test rooms/);
    assert.match(fn('studbud_start_game_room('), /'staff_test', coalesce\(\(v_room.state ->> 'staff_test'\)/);
    assert.match(fn('studbud_advance_game_room('), /set state = state \|\| jsonb_build_object/);
    const rewards = fn('studbud_pay_game_rewards(');
    assert.ok(rewards.indexOf("state ->> 'staff_test'") < rewards.indexOf('for v_player in'), 'reward refusal precedes wallet/win updates');
    const discovery = fn('studbud_friend_open_rooms(');
    assert.match(discovery, /f.status = 'accepted'/);
    assert.match(discovery, /r.status = 'waiting' and r.expires_at > now\(\)/);
    assert.match(discovery, /when r.mode = 'chess' then 2 when r.mode = 'duel' then 8 else 16/);
    assert.match(discovery, /studbud_is_guest\(\)/);
    assert.match(sql, /revoke all on function public.studbud_friend_open_rooms\(\) from public, anon/);
    console.log('Multiplayer social tests passed (staff modes, no bots/rewards/progress, buds discovery/join, live lobby/session roster, guests/offline).');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
