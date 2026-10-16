const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cloudSource = fs.readFileSync(path.join(__dirname, '..', 'cloudSync.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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
let factors = [{ id: 'verified-existing', status: 'verified', factorType: 'totp' }];
let opened = 0;
const mfa = {
    async getAuthenticatorAssuranceLevel() { return { data: { currentLevel, nextLevel: 'aal2' } }; },
    async listFactors() { return { data: { totp: factors } }; },
    async challengeAndVerify({ factorId, code }) {
        if (code !== '123456' || !factors.some(factor => factor.id === factorId)) return { error: new Error('Invalid code') };
        const factor = factors.find(item => item.id === factorId);
        factor.status = 'verified';
        currentLevel = 'aal2';
        return { data: {} };
    },
    async enroll() {
        const factor = { id: 'new-factor', status: 'unverified', factorType: 'totp' };
        factors.push(factor);
        return { data: { id: factor.id, totp: { qr_code: 'data:image/svg+xml,test', secret: 'manual-secret' } } };
    },
    async unenroll({ factorId }) {
        factors = factors.filter(factor => factor.id !== factorId);
        return { data: {} };
    }
};
const sandbox = {
    console,
    document: { getElementById: node, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { navigator: { onLine: true }, setTimeout, clearTimeout, NexusApp: { friendlyErrorMessage: (_error, fallback) => fallback } }
};
vm.createContext(sandbox);
vm.runInContext(cloudSource, sandbox);
const cloud = new sandbox.window.StudBudCloud.constructor();
cloud.client = { auth: { mfa, signOut: async () => ({}) } };
cloud.openAccount = async user => { opened++; cloud.user = user; cloud.accountReady = true; };
async function run() {
    const user = { id: 'student-1' };
    await cloud.routeAuthenticatedUser(user);
    assert.equal(opened, 0, 'an aal1 session must wait for its authenticator code');
    assert.equal(node('mfa-login-prompt').hidden, false, 'the code prompt is displayed');
    node('mfa-login-code').value = '123456';
    await cloud.verifyMfaLogin({ preventDefault() {} });
    assert.equal(opened, 1, 'the app opens after TOTP verification reaches aal2');
    assert.equal(node('mfa-login-prompt').hidden, true, 'the login gate closes after verification');

    cloud.user = user;
    cloud.accountReady = true;
    cloud.offlineMode = false;
    factors.push({ id: 'stale-pending', status: 'unverified', factorType: 'totp' });
    await cloud.refreshMfaSettings();
    assert.equal(node('mfa-settings-card').hidden, false, 'MFA settings appear for a signed-in cloud account');
    assert.equal(node('mfa-settings-status').textContent, 'Authenticator app is enabled.');
    await cloud.beginMfaSetup();
    assert.equal(factors.some(factor => factor.id === 'stale-pending'), false, 'stale unverified factors are removed before enrollment');
    assert.equal(node('mfa-qr-code').src, 'data:image/svg+xml,test');
    assert.equal(node('mfa-secret').textContent, 'manual-secret');
    node('mfa-setup-code').value = '123456';
    await cloud.verifyMfaSetup();
    assert.equal(node('mfa-settings-status').textContent, 'Authenticator app is enabled.');

    cloud.showMfaDisablePanel();
    node('mfa-disable-code').value = '123456';
    await cloud.disableMfa();
    assert.equal(node('mfa-disable-panel').hidden, true, 'successful code verification hides the disable panel');
    assert.equal(factors.filter(factor => factor.status === 'verified').length, 0, 'disabling removes every verified TOTP factor');
    assert.equal(node('mfa-settings-status').textContent, 'Authenticator app is not enabled.');
    assert.match(cloudSource, /MFA_CHALLENGE_VERIFIED/);
    assert.match(cloudSource, /this.routeAuthenticatedUser\(session\.user\)/, 'auth events must use the assurance gate');
    assert.match(cloudSource, /if \(data\.session\) await this.routeAuthenticatedUser\(data\.session\.user\)/, 'restored sessions must use the assurance gate');
    assert.match(cloudSource, /nextLevel === 'aal2' && data\?\.currentLevel !== 'aal2'/);
    assert.match(cloudSource, /challengeAndVerify\(\{ factorId: factor\.id, code \}\)/);
    assert.match(html, /id="mfa-login-form"/);
    assert.match(html, /id="mfa-settings-card"/);
    console.log('Two-factor authentication checks passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
