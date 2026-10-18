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
let factors = [], currentLevel = 'aal1', opened = 0, sessionAvailable = true, passwordError = null, assuranceError = null;
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
cloud.openAccount = async value => { opened++; cloud.user = value; cloud.accountReady = true; };
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
    assert.equal(requests.at(-1).email, 'new_student@accounts.studbud.invalid');
    assert.equal(requests.at(-1).options.data.username, 'new_student');
    assert.equal(opened, 2, 'signup immediately opens an account with no verification step');
    node('signup-password').value = node('signup-password-confirm').value = 'password123';
    sessionAvailable = false;
    await cloud.handleSignup(submit);
    assert.match(node('auth-status').textContent, /turn off Confirm email/);
    assert.equal(opened, 2, 'misconfigured server signup does not claim to be signed in');
    factors = [{ id: 'totp', status: 'verified' }];
    cloud.accountReady = false;
    await cloud.routeAuthenticatedUser(user);
    assert.equal(opened, 2, 'existing second factors are still enforced');
    assert.equal(node('mfa-login-prompt').hidden, false);
    node('mfa-login-code').value = '123456';
    await cloud.verifyMfaLogin(submit);
    assert.equal(opened, 3);
    cloud.accountReady = false; assuranceError = Error('MFA unavailable');
    await assert.rejects(cloud.routeAuthenticatedUser(user), /MFA unavailable/);
    assert.equal(opened, 3, 'MFA errors cannot bypass protection');
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
