const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const nodes = new Map();
function node(id) {
    if (!nodes.has(id)) {
        const classes = new Set();
        nodes.set(id, { value: '', textContent: '', disabled: false, focus() {},
            classList: { add: name => classes.add(name), remove: name => classes.delete(name),
                contains: name => classes.has(name), toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
            get hidden() { return classes.has('hidden'); }
        });
    }
    return nodes.get(id);
}
const sandbox = {
    console: { ...console, error() {} }, Date,
    document: { getElementById: node, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { navigator: { onLine: true }, setTimeout, clearTimeout,
        NexusApp: { friendlyErrorMessage: (error, fallback) => error.message || fallback } }
};
vm.createContext(sandbox);
vm.runInContext(source('nameModeration.js'), sandbox);
vm.runInContext(source('cloudSync.js'), sandbox);
const cloud = sandbox.window.StudBudCloud;
let factors = [], currentLevel = 'aal1', opened = 0, openedPassword, sessionAvailable = true, passwordError = null, assuranceError = null;
const requests = [];
const user = { id: 'student', email: 'student@accounts.studbud.invalid', user_metadata: { username: 'student' } };
cloud.client = { auth: {
    async signInWithPassword(request) { requests.push(request); return { data: { user }, error: passwordError }; },
    async signUp(request) {
        requests.push(request);
        return { data: { user, session: sessionAvailable ? { user } : null } };
    },
    mfa: {
        async getAuthenticatorAssuranceLevel() {
            return { data: { currentLevel, nextLevel: factors.length ? 'aal2' : 'aal1' }, error: assuranceError };
        },
        async listFactors() { return { data: { totp: factors } }; },
        async challengeAndVerify({ code }) {
            if (code !== '123456') return { error: Error('Invalid code') };
            currentLevel = 'aal2'; return {};
        }
    }
} };
cloud.openAccount = async (value, password) => { opened++; openedPassword = password; cloud.user = value; cloud.accountReady = true; };
const submit = { preventDefault() {} };
async function run() {
    node('login-username').value = ' Student ';
    node('login-password').value = 'password123';
    await cloud.handleLogin(submit);
    assert.equal(opened, 1);
    assert.equal(requests[0].email, 'student@accounts.studbud.invalid');
    assert.equal(requests[0].password, 'password123');
    assert.equal(node('login-password').value, '');
    assert.equal(cloud.authBusy, false);
    node('login-username').value = 'student@example.com';
    await cloud.handleLogin(submit);
    assert.equal(requests.length, 1, 'email addresses are no longer accepted as login identifiers');
    assert.match(node('auth-status').textContent, /Username/);
    node('login-username').value = 'student';
    passwordError = Error('Invalid login credentials');
    await cloud.handleLogin(submit);
    assert.match(node('auth-status').textContent, /username or password/);
    assert.equal(cloud.authBusy, false);
    passwordError = null;
    node('signup-username').value = 'new_student';
    node('signup-password').value = node('signup-password-confirm').value = 'password123';
    node('signup-school').value = 'pchs';
    await cloud.handleSignup(submit);
    assert.match(node('auth-status').textContent, /at least 12 characters/);
    assert.equal(requests.length, 2, 'new short passwords are rejected while existing-password sign-in remains compatible');
    node('signup-password').value = node('signup-password-confirm').value = 'a unique long passphrase';
    await cloud.handleSignup(submit);
    assert.equal(requests.at(-1).email, 'new_student@accounts.studbud.invalid');
    assert.equal(requests.at(-1).options.data.username, 'new_student');
    assert.equal(opened, 2, 'signup immediately opens an account with no verification step');
    node('signup-password').value = node('signup-password-confirm').value = 'a unique long passphrase';
    sessionAvailable = false;
    await cloud.handleSignup(submit);
    assert.match(node('auth-status').textContent, /turn off Confirm email/);
    assert.equal(opened, 2, 'misconfigured server signup does not claim to be signed in');
    factors = [{ id: 'totp', status: 'verified' }];
    cloud.accountReady = false;
    await cloud.routeAuthenticatedUser(user, 'password123');
    assert.equal(opened, 2, 'existing second factors are still enforced');
    assert.equal(node('mfa-login-prompt').hidden, false);
    await cloud.routeAuthenticatedUser(user);
    assert.equal(node('mfa-login-prompt').hidden, false, 'session events do not interrupt an active MFA challenge');
    assert.equal(cloud.mfaPendingPassword, 'password123');
    node('mfa-login-code').value = '000000';
    await cloud.verifyMfaLogin(submit);
    assert.equal(cloud.mfaPendingPassword, 'password123', 'a wrong authenticator code can be retried');
    node('mfa-login-code').value = '123456';
    await cloud.verifyMfaLogin(submit);
    assert.equal(opened, 3);
    assert.equal(openedPassword, 'password123', 'MFA retains the sign-in password only until data is unlocked');
    assert.equal(cloud.mfaPendingPassword, '');
    cloud.accountReady = false; assuranceError = Error('MFA unavailable');
    await assert.rejects(cloud.routeAuthenticatedUser(user, 'password123'), /MFA unavailable/);
    assert.equal(opened, 3, 'MFA errors cannot bypass protection');
    {
        const recovery = new cloud.constructor();
        let authCalls = 0, attemptedPassword;
        recovery.client = {
            auth: { signInWithPassword: async () => { authCalls++; return { data: { user } }; } },
            from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { data: {} }, error: null }) })
        };
        recovery.appStarted = true;
        recovery.bindStateEvents = recovery.queueSync = recovery.endGuestSession = recovery.updateOfflineNotice = () => {};
        recovery.refreshLegacyMfaSettings = async () => {};
        sandbox.window.NexusApp.recoverOwnedCommunityDecks = async () => {};
        node('login-username').value = '';
        await recovery.routeAuthenticatedUser(user);
        assert.equal(node('login-username').value, 'student');
        assert.equal(node('login-form').hidden, false, 'a restored session without a key shows the normal sign-in form');
        assert.equal(recovery.accountOpening, null, 'the sign-in screen does not leave account loading suspended');
        recovery.unlockAccountData = async (_user, password) => {
            attemptedPassword = password;
            if (password !== 'previous-password') throw Object.assign(new Error('Data could not be unlocked.'), { code: 'STUDBUD_BAD_DATA_PASSWORD' });
            return null;
        };
        node('login-password').value = 'current-password';
        await recovery.handleLogin(submit);
        assert.equal(authCalls, 1);
        assert.equal(recovery.authBusy, false, 'failed data decryption leaves the sign-in form usable');
        assert.equal(recovery.accountReady, false);
        assert.match(node('auth-status').textContent, /previous password/);
        node('login-password').value = 'previous-password';
        await recovery.handleLogin(submit);
        assert.equal(authCalls, 1, 'a verified session can unlock old data with its previous password');
        assert.equal(attemptedPassword, 'previous-password');
        assert.equal(recovery.accountReady, true);
        assert.equal(recovery.dataUnlockUser, null);
        recovery.accountReady = false;
        recovery.dataUnlockUser = user;
        const other = { id: 'other', user_metadata: { username: 'other' } };
        recovery.client.auth.signInWithPassword = async request => {
            authCalls++;
            assert.equal(request.email, 'other@accounts.studbud.invalid');
            return { data: { user: other } };
        };
        node('login-username').value = 'other';
        node('login-password').value = 'previous-password';
        await recovery.handleLogin(submit);
        assert.equal(authCalls, 2, 'switching accounts performs a fresh sign-in');
        assert.equal(recovery.user.id, 'other');
    }
    cloud.offlineMode = true;
    await cloud.refreshLegacyMfaSettings();
    assert.equal(node('mfa-settings-card').hidden, true);
    const html = source('index.html'), code = source('cloudSync.js'), sql = source('supabase-setup.sql');
    assert.doesNotMatch(html, /type="email"|id="(?:email-|login-email|account-email)/);
    assert.doesNotMatch(code, /signInWithOtp|verifyOtp|pendingAccountEmail|emailSignIn|emailLinkBusy|refreshEmailSettings/);
    for (const method of ['handleEmailLogin', 'linkAccountEmail', 'verifyEmailLogin', 'verifyAccountEmail']) {
        assert.equal(cloud[method], undefined, 'email features are removed, not just hidden');
    }
    assert.match(html, /id="mfa-login-form"/);
    assert.doesNotMatch(html, /data-unlock-panel/);
    assert.match(html, /id="mfa-settings-card" class="settings-subsection/);
    assert.match(html, /id="login-username"[^>]*maxlength="24"/);
    assert.doesNotMatch(code, /mfa\.enroll/);
    assert.match(code, /MFA_CHALLENGE_VERIFIED/);
    assert.match(sql, /create table if not exists public\.studbud_username_claims[\s\S]*?username text not null unique/);
    assert.match(sql, /revoke all on table public\.studbud_username_claims from public, anon, authenticated/);
    assert.match(sql, /references auth\.users \(id\) on delete cascade deferrable initially deferred/);
    assert.doesNotMatch(sql, /create\s+(?:unique\s+)?index[\s\S]*?on\s+auth\.users\b/i);
    const guard = sql.slice(sql.indexOf('function public.studbud_guard_username(')).split('$$;')[0];
    assert.match(guard, /insert into public\.studbud_username_claims[\s\S]*?values \(new\.id, lower\(v_name\)\)/);
    assert.match(guard, /delete from public\.studbud_username_claims where user_id = new\.id/);
    const rename = sql.slice(sql.indexOf('function public.studbud_change_username(')).split('$$;')[0];
    assert.match(rename, /if v_legacy then v_email := v_name \|\| '@accounts.studbud.invalid'; end if;/);
    assert.match(rename, /where user_id = v_uid and provider = 'email' and v_legacy/);
    const admin = sql.slice(sql.indexOf('function public.studbud_is_admin()')).split('$$;')[0];
    assert.match(admin, /studbud_admin_accounts where user_id = auth.uid\(\)/);
    assert.doesNotMatch(admin, /email|username/);
    console.log('Username/password signup and login, removed email features, server configuration feedback and existing MFA protection passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
