const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const nodes = new Map();
const sandbox = {
    window: {}, console, Map, Set, AppState: { get: () => ({}) },
    document: { getElementById: id => nodes.get(id) }
};
vm.createContext(sandbox);
for (const file of ['nameModeration.js', 'cloudSync.js', 'communityGames.js']) vm.runInContext(source(file), sandbox);
const moderation = sandbox.window.StudBudNameModeration;
const appSource = source('app.js');
vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp =')) +
    '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
app.multiplayerDisplayName = () => 'Student';
for (const name of ['Student', 'Class_of_2026', 'Cassidy', 'Dickinson', 'Scotty', 'Phoenix', 'Aster-7', 'Grace Hopper']) {
    assert.equal(moderation.isBlocked(name), false, `${name} is allowed`);
    assert.equal(moderation.assertAllowed(name), name);
}
for (const name of ['FuCk', 'f.u.c.k', 'f_u_c_k', 'fúck', 'ＦＵＣＫ', 'sh1t', 'b!tch', 'p0rn', 'faggot', 'n1gger', 'n.i.g.g.a', 'kill yourself', 'kys', 'dick', 'd.i.c.k', 'k_y_s']) {
    assert.equal(moderation.isBlocked(name), true, 'blocked names include case, accents, full-width text, leetspeak and separators');
    assert.throws(() => moderation.assertAllowed(name, 'Nickname'), error => error.code === 'INAPPROPRIATE_NAME' && /Nickname contains inappropriate language/.test(error.message));
    assert.throws(() => app.gameNickname(name), /inappropriate language/, 'raw nicknames are checked before sanitization');
}
assert.equal(app.gameNickname('Grace Hopper'), 'Grace Hopper');
app.multiplayerDisplayName = () => 'sh1t';
assert.throws(() => app.gameNickname(), /inappropriate language/, 'unsafe stored profile defaults cannot enter games');
const sql = source('supabase-setup.sql');
const fn = name => sql.slice(sql.indexOf(`create or replace function public.${name}`)).split('$$;')[0];
for (const name of ['studbud_create_game_room(', 'studbud_join_game_room(', 'studbud_change_username(', 'studbud_set_public_profile(']) {
    assert.match(fn(name), /studbud_name_is_blocked\(/, `${name} enforces names on the server`);
}
assert.match(fn('studbud_name_is_blocked('), /normalize\(lower\(coalesce\(p_name, ''\)\), NFKD\)/);
assert.match(sql, /before insert or update of raw_user_meta_data on auth.users/);
assert.match(fn('studbud_guard_username('), /v_name is not distinct from/, 'unchanged legacy usernames do not prevent login or unrelated metadata changes');
assert.match(fn('studbud_guard_username('), /v_name is not null/, 'anonymous guests without usernames are allowed');
assert.match(source('index.html'), /nameModeration\.js[\s\S]*cloudSync\.js/);
assert.match(source('service-worker.js'), /nameModeration\.js/);

async function run() {
    const api = sandbox.window.StudBudCommunityGames;
    let rpcCalls = 0;
    api.getGameClient = async () => { rpcCalls++; throw new Error('Unexpected network request'); };
    api.getClient = () => { rpcCalls++; throw new Error('Unexpected network request'); };
    await assert.rejects(api.createRoom('ABC234', 'sh1t', { title: 'Test', cards: [] }, 'skyline'), /inappropriate language/);
    await assert.rejects(api.joinRoom('ABC234', 'f.u.c.k'), /inappropriate language/);
    await assert.rejects(api.changeUsername('sh1t'), /inappropriate language/);
    assert.equal(rpcCalls, 0, 'blocked names never make network requests');
    const cloud = sandbox.window.StudBudCloud;
    for (const [id, value] of Object.entries({
        'signup-username': 'sh1t', 'signup-password': 'test-password', 'signup-password-confirm': 'test-password', 'signup-school': 'other'
    })) nodes.set(id, { value });
    let authStatus = '';
    cloud.setAuthStatus = text => { authStatus = text; };
    cloud.client = { auth: { signUp: async () => { throw new Error('Unsafe username reached auth'); } } };
    await cloud.handleSignup({ preventDefault() {} });
    assert.match(authStatus, /Username contains inappropriate language/);
    assert.doesNotThrow(() => cloud.usernameEmail('sh1t'), 'legacy usernames can still be entered to sign in and rename');
    console.log('Client name moderation, evasion handling, safe names, explicit errors, signup/RPC gates and server enforcement wiring passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
