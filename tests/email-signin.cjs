const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cloudSource = fs.readFileSync(path.join(__dirname, '..', 'cloudSync.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase-setup.sql'), 'utf8');
const nodes = new Map();
function node(id) {
    if (!nodes.has(id)) {
        const classes = new Set();
        nodes.set(id, {
            value: '', textContent: '', src: '', disabled: false,
            classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name),
                contains: name => classes.has(name),
                toggle(name, force) { if (force === undefined ? !classes.has(name) : force) classes.add(name); else classes.delete(name); }
            },
            addEventListener() {}, focus() {}, removeAttribute(name) { if (name === 'src') this.src = ''; },
            get hidden() { return classes.has('hidden'); }
        });
    }
    return nodes.get(id);
}
let currentLevel = 'aal1';
let factors = [];
let opened = 0;
const sent = [], verified = [], linked = [];
const signups = [];
const user = { id: 'student-1', email: 'student@example.com', user_metadata: { username: 'student' } };
let sendError = null, verifyError = null, linkError = null, incompleteLink = false, mfaError = null;
let signupSession = true, signupError = null;
let passwordEmail = 'student@accounts.studbud.invalid';
const mfa = {
    async getAuthenticatorAssuranceLevel() {
        if (mfaError) return { error: mfaError };
        return { data: { currentLevel, nextLevel: factors.some(factor => factor.status === 'verified') ? 'aal2' : 'aal1' } };
    },
    async listFactors() { return { data: { totp: factors } }; },
    async challengeAndVerify({ factorId, code }) {
        if (code !== '123456' || !factors.some(factor => factor.id === factorId)) return { error: new Error('Invalid code') };
        const factor = factors.find(item => item.id === factorId);
        factor.status = 'verified';
        currentLevel = 'aal2';
        return { data: {} };
    },
    async unenroll({ factorId }) {
        factors = factors.filter(factor => factor.id !== factorId);
        return { data: {} };
    }
};
const sandbox = {
    console: { ...console, error() {} }, Date,
    document: { getElementById: node, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { navigator: { onLine: true }, setTimeout, clearTimeout, NexusApp: { friendlyErrorMessage: (error, fallback) => error.message || fallback } }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'nameModeration.js'), 'utf8'), sandbox);
vm.runInContext(cloudSource, sandbox);
const cloud = new sandbox.window.StudBudCloud.constructor();
cloud.client = { auth: {
    mfa, signOut: async () => ({}),
    async signInWithOtp(request) { sent.push(request); return { error: sendError }; },
    async signUp(request) {
        signups.push(request);
        const created = { id: 'new-account', email: request.email, user_metadata: request.options.data };
        return { data: { user: created, session: signupSession ? { user: created } : null }, error: signupError };
    },
    async verifyOtp(request) {
        verified.push(request);
        if (verifyError) return { error: verifyError };
        const authenticated = request.type === 'email_change' && !incompleteLink
            ? { ...user, email: request.email } : user;
        return { data: { user: authenticated, session: { user: authenticated } } };
    },
    async updateUser(request) { linked.push(request); return { data: { user }, error: linkError }; },
    async signInWithPassword(request) {
        assert.equal(request.email, passwordEmail);
        assert.equal(request.password, 'old-password');
        return { data: { user: { ...user, email: request.email } } };
    }
} };
cloud.openAccount = async user => { opened++; cloud.user = user; cloud.accountReady = true; };
const submit = { preventDefault() {} };
async function run() {
    node('login-email').value = ' Student@Example.com ';
    await cloud.handleEmailLogin(submit);
    assert.equal(sent.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), { email: 'student@example.com', options: { shouldCreateUser: false } });
    assert.equal(opened, 0, 'requesting a code never opens an account');
    assert.equal(node('email-login-prompt').hidden, false);
    assert.equal(node('login-form').hidden, true);
    assert.equal(node('email-signin-options').hidden, true);
    assert.match(node('email-login-description').textContent, /student@example\.com/);
    await cloud.resendEmailLogin();
    assert.equal(sent.length, 1, 'the 60-second resend limit is enforced');
    cloud.emailSignIn.sentAt -= 60001;
    await cloud.resendEmailLogin();
    assert.equal(sent.length, 2);
    node('email-login-code').value = 'wrong';
    await cloud.verifyEmailLogin(submit);
    assert.equal(verified.length, 0, 'malformed codes never reach the server');
    verifyError = new Error('Token has expired or is invalid');
    node('email-login-code').value = '000000';
    await cloud.verifyEmailLogin(submit);
    assert.equal(opened, 0);
    assert.match(node('auth-status').textContent, /invalid or has expired/);
    assert.ok(cloud.emailSignIn, 'invalid codes keep the email challenge for retry');
    assert.equal(cloud.emailAuthBusy, false);
    verifyError = null;
    node('email-login-code').value = '123456';
    await cloud.verifyEmailLogin(submit);
    assert.equal(opened, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(verified.at(-1))), { email: 'student@example.com', token: '123456', type: 'email' });
    assert.equal(cloud.emailSignIn, null);
    assert.equal(node('email-login-code').value, '');
    assert.equal(node('email-login-prompt').hidden, true);

    cloud.setAuthMode('signup');
    node('signup-username').value = 'New_Student';
    node('signup-password').value = 'new-password';
    node('signup-password-confirm').value = 'different-password';
    node('signup-school').value = 'pnhs';
    await cloud.handleSignup(submit);
    assert.match(node('auth-status').textContent, /passwords do not match/);
    assert.equal(signups.length, 0);
    node('signup-password-confirm').value = 'new-password';
    signupError = new Error('Failed to fetch');
    await cloud.handleSignup(submit);
    assert.equal(opened, 1, 'failed signup must not open an account or fall back to a guest session');
    assert.match(node('auth-status').textContent, /internet connection/);
    assert.equal(cloud.emailAuthBusy, false);
    signupError = null;
    signupSession = false;
    await cloud.handleSignup(submit);
    assert.equal(opened, 1, 'a misconfigured server cannot pretend the account is ready');
    assert.match(node('auth-status').textContent, /turn off Confirm email/);
    assert.equal(cloud.emailSignIn, null, 'signup must not launch an email verification challenge');
    signupSession = true;
    await cloud.handleSignup(submit);
    assert.deepEqual(JSON.parse(JSON.stringify(signups.at(-1))), {
        email: 'new_student@accounts.studbud.invalid', password: 'new-password',
        options: { data: { username: 'new_student', school: 'pnhs' } }
    });
    assert.equal(opened, 2, 'username/password signup opens the account immediately without an email or code');
    assert.equal(node('signup-password').value, '');
    assert.equal(node('signup-password-confirm').value, '');
    assert.equal(sent.length, 2, 'signup never requests an email code');
    assert.equal(cloud.emailSignIn, null);
    assert.equal(node('signup-form').hidden, false);
    assert.equal(node('email-login-code').value, '');
    const beforeInvalid = sent.length, beforeBlockedSignup = signups.length;
    node('signup-username').value = 'sh1t';
    await cloud.handleSignup(submit);
    assert.equal(sent.length, beforeInvalid);
    assert.equal(signups.length, beforeBlockedSignup, 'moderated names do not reach signup');
    assert.match(node('auth-status').textContent, /inappropriate/);
    cloud.setAuthMode('login');
    node('login-email').value = 'student@accounts.studbud.invalid';
    await cloud.handleEmailLogin(submit);
    assert.equal(sent.length, beforeInvalid, 'non-deliverable legacy addresses cannot request codes');
    node('login-email').value = 'bad-address';
    await cloud.handleEmailLogin(submit);
    assert.equal(sent.length, beforeInvalid);
    sendError = new Error('Email rate limit exceeded');
    node('login-email').value = 'student@example.com';
    await cloud.handleEmailLogin(submit);
    assert.equal(cloud.emailSignIn, null, 'send errors never show a success-shaped challenge');
    assert.match(node('auth-status').textContent, /Too many code requests/);
    assert.equal(cloud.emailAuthBusy, false);
    sendError = null;

    let finishSend;
    const originalSend = cloud.client.auth.signInWithOtp;
    cloud.client.auth.signInWithOtp = () => new Promise(resolve => { finishSend = resolve; });
    const pendingSend = cloud.handleEmailLogin(submit);
    await cloud.handleEmailLogin(submit);
    cloud.cancelEmailLogin();
    cloud.setAuthMode('signup');
    assert.equal(cloud.authMode, 'login', 'switching mode is blocked while an auth request is in flight');
    assert.equal(cloud.emailAuthBusy, true);
    finishSend({});
    await pendingSend;
    assert.ok(cloud.emailSignIn);
    cloud.cancelEmailLogin();
    cloud.client.auth.signInWithOtp = originalSend;

    cloud.accountReady = false;
    node('login-username').value = 'student';
    node('login-password').value = 'old-password';
    await cloud.handleLogin(submit);
    assert.equal(opened, 3, 'username/password accounts open without an email challenge');
    assert.equal(node('login-password').value, '', 'the password is cleared after success');

    factors = [{ id: 'verified-existing', status: 'verified', factorType: 'totp' }];
    cloud.accountReady = false;
    await cloud.routeAuthenticatedUser(user);
    assert.equal(opened, 3, 'an existing aal1 session must still wait for its authenticator code');
    assert.equal(node('mfa-login-prompt').hidden, false);
    assert.equal(node('email-signin-options').hidden, true);
    node('mfa-login-code').value = '123456';
    await cloud.verifyMfaLogin(submit);
    assert.equal(opened, 4, 'legacy accounts open after TOTP verification reaches aal2');
    assert.equal(node('mfa-login-prompt').hidden, true);

    cloud.user = user;
    cloud.accountReady = true;
    cloud.offlineMode = false;
    await cloud.refreshEmailSettings();
    assert.equal(node('email-settings-card').hidden, false);
    assert.equal(node('account-email').value, 'student@example.com');
    assert.equal(node('mfa-settings-card').hidden, false, 'only existing enrolled authenticators show management controls');
    cloud.showMfaDisablePanel();
    node('mfa-disable-code').value = '123456';
    await cloud.disableMfa();
    assert.equal(node('mfa-disable-panel').hidden, true);
    assert.equal(factors.filter(factor => factor.status === 'verified').length, 0);
    assert.equal(node('mfa-settings-card').hidden, true, 'authenticator settings disappear once the legacy factor is removed');

    cloud.user = { ...user, email: 'student@accounts.studbud.invalid' };
    await cloud.refreshEmailSettings();
    assert.match(node('email-settings-status').textContent, /No email is linked/);
    assert.equal(node('account-email').value, '');
    node('account-email').value = 'new@example.com';
    linkError = new Error('Email already registered');
    await cloud.linkAccountEmail(submit);
    assert.equal(cloud.pendingAccountEmail, null);
    assert.equal(cloud.emailLinkBusy, false);
    assert.match(node('email-settings-message').textContent, /already exists/);
    linkError = null;
    await cloud.linkAccountEmail(submit);
    assert.equal(cloud.pendingAccountEmail, 'new@example.com');
    assert.equal(node('email-link-verify-form').hidden, false);
    assert.equal(linked.at(-1).email, 'new@example.com');
    node('email-link-code').value = '123456';
    incompleteLink = true;
    await cloud.verifyAccountEmail(submit);
    assert.match(node('email-settings-message').textContent, /not finished/);
    assert.equal(cloud.pendingAccountEmail, 'new@example.com', 'confirmation of both addresses must not be bypassed');
    assert.equal(cloud.user.email, 'student@accounts.studbud.invalid');
    incompleteLink = false;
    const verify = cloud.client.auth.verifyOtp;
    cloud.client.auth.verifyOtp = async request => {
        const result = await verify(request);
        if (request.type === 'email_change') await cloud.routeAuthenticatedUser(result.data.user);
        return result;
    };
    await cloud.verifyAccountEmail(submit);
    cloud.client.auth.verifyOtp = verify;
    assert.deepEqual(JSON.parse(JSON.stringify(verified.at(-1))), { email: 'new@example.com', token: '123456', type: 'email_change' });
    assert.equal(cloud.user.id, user.id, 'linking keeps the same account UUID and saved data');
    assert.equal(cloud.user.email, 'new@example.com');
    assert.equal(cloud.pendingAccountEmail, null);
    assert.equal(node('email-link-verify-form').hidden, true);
    assert.match(node('email-settings-message').textContent, /Email verified/);
    passwordEmail = 'new@example.com';
    node('login-username').value = 'new@example.com';
    node('login-password').value = 'old-password';
    cloud.accountReady = false;
    await cloud.handleLogin(submit);
    assert.equal(opened, 5, 'linking an email preserves optional password sign-in using the linked address');
    assert.equal(cloud.emailSignIn, null, 'password sign-in must never require an email-code challenge');
    assert.equal(cloud.user.email, 'new@example.com');

    let finishLink;
    const update = cloud.client.auth.updateUser;
    cloud.client.auth.updateUser = () => new Promise(resolve => { finishLink = resolve; });
    node('account-email').value = 'another@example.com';
    const pendingLink = cloud.linkAccountEmail(submit);
    cloud.user = null;
    cloud.accountVersion++;
    finishLink({});
    await pendingLink;
    assert.equal(cloud.pendingAccountEmail, null, 'an old email-link request cannot modify a signed-out or switched account');
    cloud.client.auth.updateUser = update;
    cloud.user = user;
    cloud.offlineMode = true;
    await cloud.refreshEmailSettings();
    assert.equal(node('email-settings-card').hidden, true);
    cloud.offlineMode = false;

    cloud.accountReady = false;
    mfaError = new Error('MFA status unavailable');
    await assert.rejects(cloud.routeAuthenticatedUser(user), /MFA status unavailable/);
    assert.equal(opened, 5, 'assurance-check errors must not open a protected account');
    mfaError = null;
    assert.match(cloudSource, /MFA_CHALLENGE_VERIFIED/);
    assert.match(cloudSource, /this.routeAuthenticatedUser\(session\.user\)/, 'auth events must use the assurance gate');
    assert.match(cloudSource, /if \(data\.session\) await this.routeAuthenticatedUser\(data\.session\.user\)/, 'restored sessions must use the assurance gate');
    assert.match(cloudSource, /nextLevel === 'aal2' && data\?\.currentLevel !== 'aal2'/);
    assert.match(cloudSource, /challengeAndVerify\(\{ factorId: factor\.id, code \}\)/);
    assert.match(html, /id="mfa-login-form"/);
    assert.match(html, /id="email-login-form"/);
    assert.match(html, /id="email-settings-card"/);
    const signupMarkup = html.slice(html.indexOf('<form id="signup-form"'), html.indexOf('</form>', html.indexOf('<form id="signup-form"')));
    assert.doesNotMatch(signupMarkup, /type="email"|signup-email/, 'signup has no email field, required or optional verification step');
    assert.match(signupMarkup, /No email or verification is needed/);
    assert.match(signupMarkup, /id="signup-password"/);
    assert.doesNotMatch(html, /id="(?:mfa-enable-btn|mfa-qr-code|mfa-setup-panel|open-backup-modal-btn|backup-modal|export-json-btn|import-json-btn)"/);
    assert.doesNotMatch(cloudSource, /mfa\.enroll|auth-conflict-backup-btn|createObjectURL/);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), /async (?:exportBackup|importBackup)\(/);
    assert.doesNotMatch(sql, /create\s+(?:unique\s+)?index[\s\S]*?on\s+auth\.users\b/i, 'setup must not create indexes on Supabase-owned auth tables');
    assert.match(sql, /create table if not exists public\.studbud_username_claims[\s\S]*?username text not null unique/);
    assert.match(sql, /references auth\.users \(id\) on delete cascade deferrable initially deferred/, 'signup can reserve a username before the new auth row exists');
    assert.match(sql, /revoke all on table public\.studbud_username_claims from public, anon, authenticated/, 'clients cannot reserve or steal usernames directly');
    const guard = sql.slice(sql.indexOf('function public.studbud_guard_username(')).split('$$;')[0];
    assert.match(guard, /insert into public\.studbud_username_claims[\s\S]*?values \(new\.id, lower\(v_name\)\)/, 'signup and renames enforce case-insensitive uniqueness transactionally');
    assert.match(guard, /delete from public\.studbud_username_claims where user_id = new\.id/, 'removing a username releases its claim');
    const rename = sql.slice(sql.indexOf('function public.studbud_change_username(')).split('$$;')[0];
    assert.match(rename, /if v_legacy then v_email := v_name \|\| '@accounts.studbud.invalid'; end if;/);
    assert.match(rename, /where user_id = v_uid and provider = 'email' and v_legacy/);
    assert.match(sql, /if to_regclass\('public.studbud_admin_accounts'\) is null then/);
    const admin = sql.slice(sql.indexOf('function public.studbud_is_admin()')).split('$$;')[0];
    assert.match(admin, /studbud_admin_accounts where user_id = auth.uid\(\)/);
    assert.doesNotMatch(admin, /email|username/, 'changing email must not change administrator identity');
    console.log('Immediate username/password signup, optional verified-email sign-in, validation, retries, cancellation, legacy MFA, email linking, SQL migration and backup removal checks passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
