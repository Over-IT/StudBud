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
        localStorage: { getItem: () => null, removeItem() {} },
        document: { getElementById: node, querySelectorAll: () => buttons,
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
    ready.configure();
    await ready.cloud.bootstrap();
    assert.equal(ready.scripts.length, 0, 'working configuration needs no extra request');
    assert.equal(ready.created(), 1);

    const recovered = fixture();
    const startup = recovered.cloud.bootstrap();
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
    console.log('Account configuration startup recovery, explicit failure, retry UI, invalid downloads and timeout cleanup passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
