const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture() {
    const nodes = new Map(), scripts = [], timers = new Map(), errors = [];
    const node = id => {
        if (!nodes.has(id)) {
            const classes = new Set(['hidden']), listeners = new Map();
            nodes.set(id, { disabled: false, textContent: '', classes, listeners,
                classList: { add: name => classes.add(name), remove: name => classes.delete(name),
                    toggle: (name, force) => force ? classes.add(name) : classes.delete(name) },
                addEventListener: (name, handler) => listeners.set(name, handler),
                setAttribute(name) { this[name] = true; }, removeAttribute(name) { this[name] = false; } });
        }
        return nodes.get(id);
    };
    const buttons = [node('login-submit'), node('signup-submit')];
    let created = 0;
    const sandbox = {
        console: { error: (...args) => errors.push(args) },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        sessionStorage: { setItem() {}, removeItem() {} },
        document: { getElementById: node, querySelectorAll: selector => selector.includes('#auth-switch-btn') ? [...buttons, node('auth-switch-btn')] : buttons,
            createElement: () => ({ remove() { this.removed = true; } }),
            head: { appendChild: script => scripts.push(script) } },
        window: { navigator: { onLine: true }, addEventListener() {},
            setTimeout: callback => { const id = timers.size + 1; timers.set(id, callback); return id; },
            clearTimeout: id => timers.delete(id),
            supabase: { createClient: () => {
                created++;
                return { auth: { onAuthStateChange: () => ({ data: { subscription: {} } }),
                    getSession: async () => ({ data: { session: null } }) } };
            } } }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'cloudSync.js'), 'utf8'), sandbox);
    return { cloud: sandbox.window.StudBudCloud, sandbox, scripts, timers, errors, node, buttons,
        created: () => created,
        configure() { sandbox.window.STUDBUD_SUPABASE_CONFIG = { url: 'https://project.supabase.co', anonKey: 'public-test-key' }; } };
}

(async () => {
    const ready = fixture();
    await assert.rejects(ready.cloud.unlockAccountData({ id: 'user' }, 'password', null), /Web Crypto/,
        'cloud sync must not unlock without browser encryption');
    ready.configure();
    await ready.cloud.bootstrap();
    assert.equal(ready.scripts.length, 0, 'working configuration needs no extra request');
    assert.equal(ready.created(), 1);

    const recovered = fixture();
    const startup = recovered.cloud.bootstrap();
    assert.ok(recovered.buttons.every(button => button.disabled), 'sign-in remains disabled while the connection loads');
    await recovered.cloud.handleLogin({ preventDefault() {} });
    assert.match(recovered.node('auth-status').textContent, /connection is not ready/i);
    await recovered.cloud.handleSignup({ preventDefault() {} });
    assert.match(recovered.node('auth-status').textContent, /connection is not ready/i);
    assert.equal(recovered.scripts[0].src, 'supabase-config.js');
    recovered.configure(); recovered.scripts[0].onload();
    await startup;
    assert.equal(recovered.created(), 1, 'a failed initial script load is recovered at startup');
    assert.ok(recovered.scripts[0].removed);
    assert.equal(recovered.timers.size, 0);

    const failed = fixture();
    const attempt = failed.cloud.bootstrap();
    failed.scripts[0].onerror();
    await attempt;
    assert.equal(failed.created(), 0);
    assert.ok(failed.buttons.every(button => button.disabled));
    assert.equal(failed.node('auth-config-retry').classes.has('hidden'), false);
    assert.match(failed.node('auth-config-message').textContent, /continue as a guest/i);
    assert.equal(failed.errors.length, 1, 'failed settings requests are logged');
    failed.cloud.setAuthStatus = () => {};
    const retry = failed.node('auth-config-retry');
    const retrying = retry.listeners.get('click')({ currentTarget: retry });
    assert.equal(retry.disabled, true);
    failed.configure(); failed.scripts[1].onload();
    await retrying;
    assert.equal(failed.created(), 1);
    assert.ok(failed.buttons.every(button => !button.disabled));
    assert.equal(failed.node('auth-switch-btn').disabled, false);
    assert.equal(retry.disabled, false);
    assert.ok(retry.classes.has('hidden'));
    assert.ok(failed.node('auth-config-message').classes.has('hidden'));

    const invalid = fixture();
    const missing = invalid.cloud.bootstrap();
    invalid.scripts[0].onload();
    await missing;
    assert.equal(invalid.created(), 0, 'a successful download without settings is not treated as success');
    assert.equal(invalid.errors.length, 1);

    const timed = fixture();
    const waiting = timed.cloud.bootstrap();
    [...timed.timers.values()][0]();
    await waiting;
    assert.equal(timed.created(), 0);
    assert.ok(timed.scripts[0].removed);
    assert.equal(timed.timers.size, 0);
    assert.equal(timed.node('auth-config-retry').classes.has('hidden'), false);

    const library = fixture();
    library.configure();
    delete library.sandbox.window.supabase;
    const libraryStartup = library.cloud.bootstrap();
    await Promise.resolve();
    assert.match(library.scripts[0].src, /supabase-js/);
    library.scripts[0].onerror();
    await libraryStartup;
    assert.equal(library.created(), 0);
    assert.ok(library.buttons.every(button => button.disabled));
    assert.equal(library.node('auth-config-retry').classes.has('hidden'), false);
    assert.match(library.node('auth-config-message').textContent, /retry/i);
    assert.ok(library.scripts[0].removed);
    const libraryRetry = library.cloud.connectOnline();
    await Promise.resolve();
    library.sandbox.window.supabase = { createClient: () => ({
        auth: { onAuthStateChange: () => ({ data: { subscription: {} } }),
            getSession: async () => ({ data: { session: null } }),
            signInWithPassword: async credentials => ({ data: { user: { id: credentials.email } } }) }
    }) };
    library.scripts[1].onload();
    await libraryRetry;
    assert.ok(library.cloud.client, 'retry initializes the client after the library loads');
    assert.ok(library.buttons.every(button => !button.disabled));
    assert.ok(library.node('auth-config-retry').classes.has('hidden'));
    library.node('login-username').value = 'student';
    library.node('login-password').value = 'password123';
    let signedInUser;
    library.cloud.routeAuthenticatedUser = async user => { signedInUser = user; };
    await library.cloud.handleLogin({ preventDefault() {} });
    assert.equal(signedInUser.id, 'student@accounts.studbud.invalid', 'sign-in works after retry');

    const guest = fixture();
    guest.configure();
    let finishSession;
    guest.sandbox.window.supabase.createClient = () => ({
        auth: { onAuthStateChange: () => ({ data: { subscription: {} } }),
            getSession: () => new Promise(resolve => { finishSession = resolve; }) }
    });
    const guestStartup = guest.cloud.bootstrap();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(guest.buttons.every(button => button.disabled), 'sign-in waits for the restored session check');
    let routed = false;
    guest.cloud.routeAuthenticatedUser = async () => { routed = true; };
    guest.cloud.offlineMode = true;
    finishSession({ data: { session: { user: { id: 'student' } } } });
    await guestStartup;
    assert.equal(routed, false, 'a pending startup cannot open an account after choosing guest mode');
    console.log('Account connection startup, unavailable library, retry UI and timeout cleanup passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
