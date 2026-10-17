const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const nodes = new Map();
const node = () => ({ value: '', textContent: '', innerHTML: '', classList: { toggle() {}, add() {}, remove() {} } });
for (const id of ['account-name', 'admin-list', 'admin-status', 'admin-search', 'admin-nav-item', 'admin-game-test-mode', 'admin-game-test-bots', 'admin-game-test-seed', 'admin-deck-deck']) nodes.set(id, node());
const calls = [];
const sandbox = {
    console, Map, Set, Date, Math, confirm: () => true, prompt: () => 'reason',
    window: { location: { hash: '' }, StudBudCloud: { user: { id: 'self', user_metadata: { username: 'student' } } } },
    document: { getElementById: id => nodes.get(id), querySelectorAll: () => [] },
    AppState: { get: () => [] }
};
vm.createContext(sandbox);
vm.runInContext(source('nameModeration.js'), sandbox);
const appSource = source('app.js');
vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp =')) +
    '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
sandbox.window.NexusApp = app;
app.multiplayerDisplayName = () => 'Student';
app.accountTagMarkup = () => '';
app.refreshUsernameCard = app.loadPublicProfileCard = () => {};
let tags = [], admin = false;
sandbox.window.StudBudCommunityGames = {
    isAdmin: async () => admin, friendCall: async () => tags,
    adminCall: async (name, args) => {
        calls.push({ name, args });
        if (name === 'studbud_admin_list_users') return [{ id: 'ordinary', username: 'student', tags: [], created_at: '2026-01-01' },
            { id: 'staff', username: 'mod', tags: ['moderator'], created_at: '2026-01-01' }];
        if (name === 'studbud_admin_get_deck') return { title: 'Deck', card_count: 1, cards: [{ front: 'Q', back: 'A' }] };
        return [];
    }
};

async function run() {
    for (const role of ['', 'teacher', 'tester', 'moderator', 'admin', 'both']) {
        admin = role === 'admin';
        tags = role === 'both' ? ['tester', 'moderator'] : role && !admin ? [role] : [];
        await app.refreshAdminAccess();
        assert.equal(app.canTestGames, ['tester', 'admin', 'both'].includes(role), `${role} testing gate`);
        assert.equal(app.canModerateFlashcards, ['moderator', 'admin', 'both'].includes(role), `${role} moderation gate`);
        if (app.canTestGames) assert.doesNotThrow(() => app.startPractice('duel', { testing: true }));
        else assert.throws(() => app.startPractice('duel', { testing: true }), /testers/);
    }
    const originalGet = sandbox.AppState.get;
    sandbox.AppState.get = key => key === 'flashcards' ? [{ id: 'qa-energy', title: 'QA', cards: [{ front: 'Q', back: 'A' }] }] : [];
    sandbox.document.body = { classList: { add() {}, remove() {} } };
    const originalBots = app.initPreviewBots, originalCosmetics = app.profileCosmetics;
    app.initPreviewBots = () => [];
    app.profileCosmetics = () => ({});
    let practiceOptions;
    sandbox.window.StudBudArcade = { Session: class {
        constructor(options) {
            practiceOptions = options;
            this.game = {};
            this.roster = new Map(); this.remotes = new Map();
            this.overlay = { isConnected: true };
        }
        emit() {}
        destroy() {}
    } };
    const checkReward = (mode, config, expected) => {
        app.startPractice(mode, { testing: true, deckId: 'qa-energy', botCount: 0, ...config });
        assert.equal(practiceOptions.questionReward, expected);
        assert.equal(practiceOptions.room.state.question_reward, expected, 'practice HUD and actual refill share one reward');
        app.closePractice();
    };
    checkReward('skyline', {}, app.questionRewardRecommendation('skyline').suggested);
    checkReward('shooter', {}, app.questionRewardRecommendation('shooter').suggested);
    checkReward('market', {}, app.questionRewardRecommendation('market').suggested);
    nodes.set('solo-game-reward', { value: '65', dataset: { custom: 'true' } });
    checkReward('skyline', {}, 65);
    checkReward('skyline', { questionReward: 75 }, 75);
    app.hostedGameRoom = { mode: 'skyline', state: { players: [], question_reward: 25 } };
    checkReward(undefined, {}, 25);
    checkReward('shooter', {}, 65);
    checkReward('chess', { questionReward: 75 }, 1);
    delete app.hostedGameRoom;
    delete sandbox.window.StudBudArcade;
    nodes.delete('solo-game-reward');
    app.initPreviewBots = originalBots; app.profileCosmetics = originalCosmetics;
    sandbox.AppState.get = originalGet;
    admin = false; tags = ['moderator']; await app.refreshAdminAccess();
    app.adminTab = 'users';
    await app.loadAdminList();
    assert.equal(calls.at(-1).name, 'studbud_admin_list_users');
    assert.match(nodes.get('admin-list').innerHTML, /cannot be moderated by your role/);
    assert.ok(!nodes.get('admin-list').innerHTML.includes('data-admin-action="coins"'));
    app.adminTab = 'games'; await app.loadAdminList();
    assert.equal(app.adminTab, 'decks', 'moderators without tester tags cannot open the test bench');
    await app.runAdminAction('inspect-deck', { id: 'deck' });
    assert.equal(calls.at(-1).name, 'studbud_admin_get_deck');
    for (const action of ['coins', 'save-user-tags', 'publish-notice', 'hide-notice', 'delete-notice']) {
        const count = calls.length;
        await app.runAdminAction(action, {});
        assert.equal(calls.length, count, `moderator cannot call ${action}`);
        assert.match(nodes.get('admin-status').textContent, /administrators/);
    }
    tags = ['tester']; await app.refreshAdminAccess();
    app.adminTab = 'users'; await app.loadAdminList();
    assert.equal(app.adminTab, 'games');
    for (const action of ['inspect-deck', 'delete-deck', 'ban', 'unban', 'remove-decks', 'force-rename']) {
        const count = calls.length;
        await app.runAdminAction(action, { id: 'ordinary' });
        assert.equal(calls.length, count, `tester cannot call ${action}`);
        assert.match(nodes.get('admin-status').textContent, /moderator/);
    }
    const sql = source('supabase-setup.sql');
    assert.match(sql, /function public\.studbud_admin_delete_site_notice[\s\S]*?perform public\.studbud_require_admin\(\)/);
    for (const fn of ['studbud_admin_set_ban', 'studbud_admin_remove_user_decks', 'studbud_admin_force_username']) {
        assert.ok(sql.slice(sql.indexOf(`function public.${fn}`)).split('$$;')[0].includes('studbud_require_account_moderation(p_user_id)'), `${fn} checks target privileges`);
    }
    assert.match(sql, /Guests can host up to 3 open games at once/);
    for (const fn of ['studbud_claim_daily_reward', 'studbud_buy_mystery_item', 'studbud_buy_multiplayer_item', 'studbud_friend_request', 'studbud_change_username', 'studbud_record_study_time']) {
        assert.ok(sql.slice(sql.indexOf(`function public.${fn}`)).split('$$;')[0].includes('public.studbud_is_guest()'), `${fn} is account-only`);
    }
    assert.match(sql, /function public\.studbud_set_guest_color[\s\S]*?not public\.studbud_is_guest\(\)/);
    assert.match(sql, /auth\.users where id = \(v_player ->> 'id'\)::uuid and is_anonymous/);

    const guestCalls = [], options = [];
    const privateClient = { private: true };
    const guestClient = { auth: { signInAnonymously: async () => {
        guestCalls.push('anonymous'); return { data: { user: { id: 'guest', is_anonymous: true } } };
    } }, rpc: async (name, args) => { guestCalls.push({ name, args }); return { data: { room_code: args.p_code } }; } };
    const guestSandbox = { console, Map, Set, window: {
        navigator: { onLine: true }, STUDBUD_SUPABASE_CONFIG: { url: 'https://example.invalid', anonKey: 'public-test-key' },
        supabase: { createClient: (_, __, config) => { options.push(config); return guestClient; } }
    } };
    vm.createContext(guestSandbox);
    vm.runInContext(source('nameModeration.js'), guestSandbox);
    vm.runInContext(source('cloudSync.js'), guestSandbox);
    vm.runInContext(source('communityGames.js'), guestSandbox);
    const cloud = guestSandbox.window.StudBudCloud;
    cloud.client = privateClient;
    await Promise.all([cloud.prepareGuestSession(), cloud.prepareGuestSession()]);
    assert.equal(guestCalls.filter(call => call === 'anonymous').length, 1, 'simultaneous joins reuse one guest identity');
    assert.equal(cloud.client, privateClient, 'guest authentication never replaces the private account client');
    assert.equal(cloud.user, null, 'guest identity never becomes a syncing account');
    assert.equal(cloud.accountReady, false);
    assert.equal(options[0].auth.persistSession, false, 'guest tokens are not saved alongside account tokens');
    cloud.offlineMode = true;
    const api = guestSandbox.window.StudBudCommunityGames;
    assert.throws(() => api.getClient(), /Create a free account/, 'guests cannot use the private/community account API');
    assert.equal(api.hasAccount(), false);
    await api.joinRoom('ABC234', 'Guest Name');
    assert.equal(guestCalls.at(-1).name, 'studbud_join_game_room');
    assert.equal(guestCalls.at(-1).args.p_nickname, 'Guest Name');
    await api.getRoom('ABC234');
    assert.equal(guestCalls.at(-1).name, 'studbud_get_game_room');
    guestSandbox.window.navigator.onLine = false;
    assert.throws(() => api.getGameClient(), /internet/);
    guestSandbox.window.navigator.onLine = true;
    const lobbyNodes = new Map();
    for (const id of ['hosted-game-room', 'guest-game-lobby', 'hosted-leave-btn', 'copy-hosted-room-code-btn', 'auth-status']) {
        const element = node();
        element.id = id;
        element.appendChild = child => { child.parentElement = element; };
        element.addEventListener = () => {};
        lobbyNodes.set(id, element);
    }
    const originalParent = { appendChild: child => { child.parentElement = originalParent; } };
    const panel = lobbyNodes.get('hosted-game-room');
    panel.parentElement = originalParent;
    guestSandbox.document = {
        getElementById: id => lobbyNodes.get(id),
        querySelector: () => node()
    };
    let privateStarts = 0, joined = 0;
    guestSandbox.window.NexusApp = { init: async () => { privateStarts++; }, joinGame: async () => { joined++; } };
    const button = { disabled: false }, form = { querySelector: () => button };
    for (const appStarted of [false, true]) {
        cloud.appStarted = appStarted;
        await cloud.handleGuestJoin({ preventDefault() {}, currentTarget: form });
        assert.equal(panel.parentElement.id, 'guest-game-lobby', 'even after offline mode, guest rooms use the isolated lobby');
        assert.equal(cloud.guestLobbyOpen, true);
        assert.equal(button.disabled, false);
        cloud.closeGuestLobby();
        assert.equal(panel.parentElement, originalParent);
        assert.equal(cloud.guestLobbyOpen, false);
    }
    assert.equal(joined, 2);
    assert.equal(privateStarts, 0, 'guest joins do not initialize private account storage');
    cloud.user = { id: 'signed-in' }; cloud.offlineMode = false;
    assert.equal(api.getGameClient(), privateClient, 'real accounts take priority over stale guest sessions');
    cloud.user = null; cloud.guestUser = null;
    guestClient.auth.signInAnonymously = async () => ({ error: { message: 'Anonymous sign-ins disabled' } });
    await assert.rejects(cloud.prepareGuestSession(), /enable Anonymous Sign-ins/);
    assert.equal(cloud.guestOpening, null, 'failed joins can be retried');
    console.log('Staff permission matrix, protected moderation targets, administrator-only announcement deletion and isolated code-only guest sessions passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
