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
vm.runInContext(source('nameModeration.js'), sandbox);
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
const notices = [];
sandbox.window.StudBudDialogs = { notify: message => notices.push(message) };
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
    assert.equal(created[4].limited_test_energy, false, 'multiplayer tests default to unlimited energy');
    assert.equal(created[4].seed, 42);
    assert.equal(created[4].botCount, undefined);
    assert.equal(opened.state.players.length, 1, 'real room contains only its human host');
    assert.equal(routes.at(-1), 'multiplayer');
    node('admin-game-test-energy').value = 'limited';
    app.handleChange({ target: { id: 'admin-game-test-energy', value: 'limited' } });
    assert.equal(node('admin-game-test-reward').disabled, false);
    node('admin-game-test-reward').value = '21';
    await app.runAdminAction('test-game', {});
    assert.equal(created[4].limited_test_energy, true);
    assert.equal(created[4].question_reward, 21, 'multiplayer limited tests preserve one-unit reward increments');
    const lastCreated = created;
    node('admin-game-test-reward').value = '21.5';
    await app.runAdminAction('test-game', {});
    assert.equal(created, lastCreated, 'fractional energy rewards are rejected before hosting');
    assert.match(node('admin-status').textContent, /whole number/);
    node('admin-game-test-energy').value = 'unlimited';
    app.handleChange({ target: { id: 'admin-game-test-energy', value: 'unlimited' } });
    assert.equal(node('admin-game-test-reward').disabled, true);
    for (const state of [{ offlineMode: true }, { user: null }, { user: { id: 'guest', is_anonymous: true } }]) {
        const saved = { ...cloud }; Object.assign(cloud, state);
        await assert.rejects(app.hostStaffTest('skyline'), /connected tester/);
        Object.assign(cloud, saved);
    }
    app.canTestGames = false;
    await assert.rejects(app.hostStaffTest('skyline'), /connected tester/);
    app.canTestGames = true;

    const originalGet = sandbox.AppState.get;
    sandbox.AppState.get = key => key === 'flashcards' ? [{ id: 'set', title: 'Test', cards: [{ front: 'Q', back: 'A' }] }] : {};
    const form = { elements: {
        nickname: { value: 'Tester' }, deckId: { value: 'set' }, mode: { value: 'skyline' },
        timeLimit: { value: '5' }, questionReward: { value: '21' }, allowLateJoin: { checked: false }
    } };
    await app.hostGame(form);
    assert.equal(created[4].allow_late_join, false, 'late joining defaults to disabled');
    assert.equal(created[4].question_reward, 21, 'hosts can choose rewards between the old five-unit steps');
    form.elements.allowLateJoin.checked = true;
    await app.hostGame(form);
    assert.equal(created[4].allow_late_join, true);
    assert.match(notices.at(-1), /server did not save Allow late joining/, 'old databases cannot silently ignore the checkbox');
    form.elements.mode.value = 'chess';
    await app.hostGame(form);
    assert.equal(created[4].allow_late_join, false, 'chess always locks its two seats after starting');
    sandbox.AppState.get = originalGet;

    games.friendCall = async () => ({ friends: [{ user_id: 'bud', username: 'My bud' }], incoming: [], outgoing: [] });
    cloud.getFriendRooms = async () => [{ host_id: 'bud', room_code: 'ABCDEF', mode: 'skyline', staff_test: true }];
    cloud.getFriendPresence = async () => { throw Error('Presence RPC not deployed'); };
    await app.loadFriends();
    assert.match(node('friend-list').innerHTML, /Hosting Escape to Space · staff test/, 'older databases fall back to hosted rooms');
    assert.match(node('friend-list').innerHTML, /data-action="friend-join-game" data-code="ABCDEF">Join/);
    cloud.getFriendRooms = async () => { throw Error('RPC not deployed'); };
    await app.loadFriends();
    assert.match(node('friend-list').innerHTML, /My bud/);
    assert.doesNotMatch(node('friend-list').innerHTML, /friend-join-game/);

    games.friendCall = async () => ({ friends: ['off', 'on', 'solo', 'match', 'host', 'busy'].map(id => ({ user_id: id, username: `Bud ${id}` })), incoming: [], outgoing: [] });
    let roomLookups = 0;
    cloud.getFriendRooms = async () => { roomLookups++; return []; };
    cloud.getFriendPresence = async () => [
        { user_id: 'off', status: 'offline', online: false, last_seen_at: new Date(Date.now() - 3 * 3600000).toISOString() },
        { user_id: 'on', status: 'online', online: true },
        { user_id: 'solo', status: 'solo', online: true, mode: 'miner' },
        { user_id: 'match', status: 'in_game', online: true, mode: 'duel', room_status: 'playing' },
        { user_id: 'host', status: 'hosting', online: true, mode: 'river', room_status: 'waiting', room_code: 'RIVERS' },
        { user_id: 'busy', status: 'hosting', online: true, mode: 'shooter', room_status: 'playing', room_code: null }
    ];
    await app.loadFriends();
    const budList = node('friend-list').innerHTML;
    assert.equal(roomLookups, 0, 'presence replaces the separate hosted-room lookup');
    assert.match(budList, /is-playing[^>]*><i aria-hidden="true"><\/i>Hosting River Fishing</);
    assert.match(budList, /Hosting Arena Shooter · in progress/);
    assert.match(budList, /In a King of the Hill match/);
    assert.match(budList, /Playing Crystal Mining solo/);
    assert.match(budList, /is-online[^>]*><i aria-hidden="true"><\/i>Online</);
    assert.match(budList, /Offline · seen 3h ago/);
    assert.equal((budList.match(/friend-join-game/g) || []).length, 1, 'only joinable hosted lobbies get a Join button');
    assert.match(budList, /data-code="RIVERS">Join/);
    const order = ['host', 'busy', 'match', 'solo', 'on', 'off'].map(id => budList.indexOf(`Bud ${id}`));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'active buds are listed first');
    delete cloud.getFriendPresence;

    const pings = [];
    cloud.pingPresence = async activity => { pings.push(activity); };
    app.lastPresencePing = 0;
    app.practiceSession = { mode: 'miner', testing: false, destroyed: false };
    app.pingPresence(true);
    app.practiceSession = { mode: 'miner', testing: true, destroyed: false };
    app.pingPresence(true);
    app.practiceSession = null;
    app.pingPresence();
    app.pingPresence(true);
    assert.deepEqual(pings, ['solo:miner', '', ''], 'solo games are shared; staff tests are not; unchanged pings are throttled');
    cloud.user.is_anonymous = true; app.pingPresence(true); delete cloud.user.is_anonymous;
    assert.equal(pings.length, 3, 'guests never send presence');
    delete cloud.pingPresence;
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
    const presenceCalls = [];
    sync.user = { id: 'host' }; sync.client = { rpc: async (fn, args) => { presenceCalls.push([fn, args]); return { data: [] }; } };
    assert.deepEqual([...await sync.getFriendPresence()], []);
    await sync.pingPresence('solo:miner');
    assert.deepEqual(JSON.parse(JSON.stringify(presenceCalls)), [['studbud_friend_presence', null], ['studbud_presence_ping', { p_activity: 'solo:miner' }]]);
    sync.user.is_anonymous = true;
    assert.equal(await sync.getFriendPresence(), null); await sync.pingPresence('');
    assert.equal(presenceCalls.length, 2, 'guests never query or publish presence');

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
    const limited = new Session({ room: { ...testingRoom, state: { ...testingRoom.state, limited_test_energy: true, question_reward: 21 } }, user: host, api: games, isHost: true });
    assert.equal(limited.testing, true, 'limiting energy does not remove staff status or enable rewards');
    assert.equal(limited.limitedTestEnergy, true);
    limited.game.res = new sandbox.window.StudBudArcade.Resource('Energy', '#fff', 100, 10);
    assert.equal(limited.spend(4), true);
    assert.equal(limited.game.res.value, 6);
    limited.countdown = 0;
    limited.ask = callback => { callback(true); };
    limited.sfx = limited.toast = () => {};
    limited.recharge();
    assert.equal(limited.game.res.value, 27, 'correct staff-test answers refill by the configured amount');
    const sqlText = source('supabase-setup.sql');
    assert.match(sqlText, /'limited_test_energy', v_staff_test and coalesce/);
    assert.match(sqlText, /'limited_test_energy', coalesce\(\(v_room.state ->> 'limited_test_energy'\)/);
    const startedAt = new Date(Date.now() - 120000).toISOString();
    for (const reward of [6, 7, 21, 99]) {
        const lateRoom = { ...room([host, bud]), status: 'playing', started_at: startedAt,
            state: { players: [host, bud], seed: 42, question_reward: reward, allow_late_join: true } };
        const late = new Session({ room: lateRoom, user: bud, api: games, isHost: false });
        assert.equal(late.rewardAmount(), reward, 'sessions preserve single-unit rewards');
        assert.equal(late.startedAt, Date.parse(startedAt));
        assert.equal(late.deadline, Date.parse(startedAt) + 300000, 'joining late preserves the original match deadline');
        assert.equal(late.score, 0);
        assert.equal(late.answered, 0);
        assert.equal(late.seed, 42, 'late arrivals use the existing course seed');
    }
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
    assert.match(fn('studbud_create_game_room('), /'allow_late_join', p_mode <> 'chess' and coalesce\(\(p_options ->> 'allow_late_join'\)::boolean, false\)/);
    assert.match(fn('studbud_start_game_room('), /'allow_late_join', coalesce\(\(v_room.state ->> 'allow_late_join'\)::boolean, false\)/);
    const joining = fn('studbud_join_game_room(');
    assert.match(joining, /v_room.status = 'finished'/);
    assert.match(joining, /v_room.started_at \+ make_interval\(secs => v_room.time_limit_seconds\) <= now\(\)/);
    assert.match(joining, /v_room.mode = 'chess' or not coalesce\(\(v_room.state ->> 'allow_late_join'\)::boolean, false\)/);
    assert.ok(joining.indexOf("where player ->> 'id' = v_user_id::text") < joining.indexOf('late joining is disabled'), 'existing members can reconnect to a locked active room');
    assert.match(joining, /if v_room.mode = 'defense' and v_room.status = 'playing'/);
    assert.match(joining, /count\(\*\) filter \(where value = '0'\) <= count\(\*\) filter \(where value = '1'\)/);
    assert.match(fn('studbud_advance_game_room('), /set state = state \|\| jsonb_build_object/);
    const rewards = fn('studbud_pay_game_rewards(');
    assert.ok(rewards.indexOf("state ->> 'staff_test'") < rewards.indexOf('for v_player in'), 'reward refusal precedes wallet/win updates');
    const discovery = fn('studbud_friend_open_rooms(');
    assert.match(discovery, /f.status = 'accepted'/);
    assert.match(discovery, /r.status = 'waiting' or \(r.status = 'playing' and r.mode <> 'chess'/);
    assert.match(discovery, /allow_late_join/);
    assert.match(discovery, /and r.expires_at > now\(\)/);
    assert.match(discovery, /when r.mode = 'chess' then 2 when r.mode = 'duel' then 8 else 16/);
    assert.match(discovery, /studbud_is_guest\(\)/);
    assert.match(sql, /revoke all on function public.studbud_friend_open_rooms\(\) from public, anon/);
    const presenceSql = fn('studbud_friend_presence(');
    assert.match(presenceSql, /f.status = 'accepted'/, 'presence is limited to accepted buds');
    assert.match(presenceSql, /studbud_is_hidden_user\(a.id\)/);
    assert.match(presenceSql, /interval '2 minutes'/);
    assert.match(presenceSql, /when hosted.joinable then hosted.room_code/, 'only joinable lobbies expose a code');
    assert.match(presenceSql, /@> jsonb_build_array\(jsonb_build_object\('id', bud.id::text\)\)/);
    assert.match(fn('studbud_presence_ping('), /studbud_is_guest\(\) then return/);
    assert.match(fn('studbud_presence_ping('), /\^solo:\[a-z\]\{2,16\}\$/);
    assert.match(sql, /revoke all on function public.studbud_friend_presence\(\) from public, anon/);
    assert.match(sql, /revoke all on function public.studbud_presence_ping\(text\) from public, anon/);

    // Solo practice pays coins for correct answers via the server-capped solo reward; tests and guests never do.
    const coinCalls = [];
    const practiceSession = extra => {
        const session = Object.create(Session.prototype);
        Object.assign(session, { practice: true, testing: false, preview: false, user: { id: 'me' }, correct: 7, answered: 9,
            api: { awardSoloCoins: async (correct, total) => { coinCalls.push([correct, total]); return { coins: 250, coins_awarded: 14 }; } },
            renderResults() { this.rendered = (this.rendered || 0) + 1; } }, extra);
        return session;
    };
    const priorApp = sandbox.window.NexusApp;
    const profileApp = sandbox.window.NexusApp = { renderMultiplayerProfile() {} };
    const paid = practiceSession();
    await paid.awardPracticeCoins(); await paid.awardPracticeCoins();
    assert.deepEqual(coinCalls, [[7, 9]], 'practice coins are requested once per game');
    assert.equal(paid.rewards.me, 14);
    assert.match(paid.practiceResultText(), /earned 14 coins/);
    assert.equal(profileApp.multiplayerProfile.coins, 250, 'wallet updates immediately');
    const capped = practiceSession({ correct: 400, answered: 500 });
    await capped.awardPracticeCoins();
    assert.deepEqual(coinCalls.at(-1), [100, 100], 'results stay within the RPC limits');
    for (const extra of [{ testing: true }, { user: { id: 'guest', is_anonymous: true } }, { user: { id: 'local-practice' } }, { preview: true }]) {
        const session = practiceSession(extra);
        await session.awardPracticeCoins();
        assert.equal(session.rewards, undefined);
    }
    const none = practiceSession({ correct: 0 });
    await none.awardPracticeCoins();
    assert.equal(coinCalls.length, 2, 'no request without correct answers');
    assert.match(none.practiceResultText(), /Answer questions correctly/);
    sandbox.window.NexusApp = priorApp;
    assert.match(fn('studbud_award_solo_coins('), /least\(p_correct \* 2, 30\), 150 - v_used/, 'server caps solo coins per game and per day');
    console.log('Multiplayer social tests passed (staff modes, no bots/rewards/progress, buds discovery/join, live lobby/session roster, guests/offline).');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
