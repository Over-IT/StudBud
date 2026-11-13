const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const storage = new Map([
    ['PCHS_NEXUS_STATE_V1', 'private study data'],
    ['STUDBUD_CLOUD_SYNC_BASE', 'private sync baseline'],
    ['STUDBUD_CLOUD_ACCOUNT_ID', 'owner']
]);
const nodes = new Map(['account-delete-status', 'delete-account-btn', 'login-password'].map(id => [id, { value: 'secret', classList: { add() {} } }]));
const messages = [], steps = [];
const sandbox = {
    console: { ...console, error() {}, warn() {} }, setTimeout, clearTimeout,
    document: { getElementById: id => nodes.get(id) || null },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    navigator: { onLine: true }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'cloudSync.js'), 'utf8'), sandbox);
const cloud = sandbox.StudBudCloud;
const user = { id: 'owner', user_metadata: { username: 'student', school: 'other' } };
let answer = 'student', secret = 'a unique long password', confirmed = true;
let verificationError, deletionError, assurance = { currentLevel: 'aal1', nextLevel: 'aal1' }, cleanupFails = false;
let switchAccount = false, verificationUser = user;
sandbox.StudBudDialogs = {
    confirm: async () => confirmed,
    prompt: async () => answer,
    promptSecret: async () => secret
};
const verifier = {
    auth: {
        signInWithPassword: async credentials => {
            steps.push('verify');
            assert.equal(credentials.password, secret);
            assert.equal(credentials.email, 'student@accounts.studbud.invalid');
            if (switchAccount) cloud.user = { id: 'another-account' };
            return { data: { user: verificationUser }, error: verificationError };
        },
        mfa: {
            getAuthenticatorAssuranceLevel: async () => ({ data: assurance }),
            listFactors: async () => ({ data: { totp: [{ id: 'factor', status: 'verified' }] } }),
            challengeAndVerify: async ({ factorId, code }) => {
                assert.equal(factorId, 'factor'); assert.equal(code, secret);
                steps.push('mfa'); return {};
            }
        },
        signOut: async () => { steps.push('verification-cleanup'); return {}; }
    },
    rpc: async (name, args) => {
        assert.equal(name, 'studbud_delete_my_account');
        assert.equal(args.p_username, 'student');
        assert.ok(!JSON.stringify(args).includes(secret), 'the deletion RPC never receives the password');
        steps.push('delete');
        return { data: { deleted: true }, error: deletionError };
    }
};
sandbox.supabase = { createClient(url, key, options) {
    assert.equal(options.auth.persistSession, false);
    assert.equal(options.auth.autoRefreshToken, false);
    return verifier;
} };
sandbox.location = { reload() { steps.push('reload'); } };
sandbox.StudBudCommunityGames = { boardCache: new Map([['private', 42]]) };
sandbox.NexusApp = {
    flushAutomaticStudy: async () => steps.push('flush'),
    resetForCloudAccount: async () => {
        if (cleanupFails) throw new Error('device storage unavailable');
        steps.push('reset-memory-and-stores');
    }
};
cloud.loadAccountConfig = async () => ({ url: 'https://example.invalid', anonKey: 'public' });
cloud.loadSupabaseLibrary = async () => {};
cloud.syncNow = async () => { throw new Error('Existing study data cannot sync'); };
cloud.setAuthStatus = (message, error) => messages.push({ message, error });
cloud.friendlyAuthError = error => error.message;
cloud.showAuth = () => steps.push('auth-view');
cloud.clearMfaLoginPrompt = () => {};
cloud.client = { auth: { signOut: async () => { steps.push('local-signout'); return {}; } } };
function reset() {
    cloud.user = user; cloud.accountReady = true; cloud.offlineMode = false;
    steps.length = 0; messages.length = 0; nodes.get('account-delete-status').textContent = '';
    answer = 'student'; secret = 'a unique long password'; confirmed = true;
    verificationError = deletionError = null; switchAccount = false; verificationUser = user; cleanupFails = false;
    assurance = { currentLevel: 'aal1', nextLevel: 'aal1' };
}
(async () => {
    reset(); confirmed = false;
    await cloud.deleteAccount();
    assert.deepEqual(steps, [], 'cancellation never authenticates, syncs or deletes');
    reset(); answer = 'another-student';
    await cloud.deleteAccount();
    assert.match(nodes.get('account-delete-status').textContent, /username did not match/);
    assert.deepEqual(steps, []);
    reset(); verificationError = { message: 'Incorrect password' };
    await cloud.deleteAccount();
    assert.deepEqual(steps, ['verify', 'verification-cleanup']);
    assert.equal(cloud.user, user);
    reset(); verificationUser = { id: 'different-account' };
    await cloud.deleteAccount();
    assert.deepEqual(steps, ['verify', 'verification-cleanup']);
    reset(); switchAccount = true;
    await cloud.deleteAccount();
    assert.ok(!steps.includes('delete'), 'account switching during verification aborts deletion');
    reset(); deletionError = { code: 'PGRST202', message: 'missing function' };
    await cloud.deleteAccount();
    assert.match(nodes.get('account-delete-status').textContent, /updated supabase-setup.sql/);
    assert.ok(!steps.includes('local-signout'));
    assert.equal(cloud.user, user, 'old servers keep the user signed in and their device data intact');
    reset(); assurance.nextLevel = 'aal2'; secret = '123456';
    await cloud.deleteAccount();
    assert.deepEqual(steps, ['verify', 'mfa', 'delete', 'local-signout', 'auth-view', 'reset-memory-and-stores', 'reload', 'verification-cleanup'],
        'confirmed deletion still works when an existing snapshot cannot sync');
    assert.equal(cloud.user, null);
    assert.equal(cloud.encryptionKey, null);
    assert.equal(cloud.lastSnapshot, null);
    assert.equal(cloud.pendingConflict, null);
    assert.equal(storage.size, 0, 'local study data, account marker and sync baseline are removed');
    assert.equal(sandbox.StudBudCommunityGames.boardCache.size, 0);
    assert.equal(nodes.get('login-password').value, '');
    assert.equal(nodes.get('delete-account-btn').disabled, false);
    reset(); cleanupFails = true;
    await cloud.deleteAccount();
    assert.equal(steps.includes('delete'), true);
    assert.equal(steps.includes('reload'), false);
    assert.equal(messages.at(-1).error, true, 'cleanup failures cannot be overwritten with a success message');
    assert.match(messages.at(-1).message, /Clear this site/);
    assert.equal(cloud.deletingAccount, false);
    console.log('Reauthenticated account deletion, MFA, cancellation/failure isolation, account switching and complete device cleanup passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
