const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const storage = new Map(), nodes = new Map(), events = new Map();
let initializations = 0, timers = 0;
let snapshot = { state: { profile: { graduationYear: 2026 }, courses: [{ code: 'local', title: 'Offline class' }], settings: { theme: 'dark' } },
    flashcards: [{ id: 'local-deck', title: 'Local set', cards: [] }], studyHistory: [] };
const sandbox = {
    console, Date, Map, Set, JSON,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    document: {
        querySelectorAll: () => [], addEventListener() {},
        getElementById: id => {
            if (!nodes.has(id)) nodes.set(id, { textContent: '', classList: { toggle() {}, add() {}, remove() {} }, addEventListener() {}, removeAttribute() {} });
            return nodes.get(id);
        }
    },
    window: {
        navigator: { onLine: false }, clearTimeout() {}, setTimeout() { timers++; return 1; }, setInterval() {},
        addEventListener: (name, callback) => events.set(name, callback),
        NexusApp: {
            init: async () => initializations++,
            friendlyErrorMessage: (error, fallback) => error?.message || fallback,
            AppState: {
                exportAppState: async () => JSON.stringify(snapshot),
                emptyCloudSnapshot: () => ({ state: { profile: { graduationYear: 2026 }, courses: [], settings: { theme: 'dark' } }, flashcards: [], studyHistory: [] }),
                setSaveStatus(message) { this.status = message; }
            },
            EventBus: { on() {} }, recoverOwnedCommunityDecks: async () => {}, refreshAdminAccess() {},
            restoreCloudSnapshot: async data => { snapshot = JSON.parse(JSON.stringify(data)); }
        }
    }
};
vm.createContext(sandbox);
vm.runInContext(source('cloudSync.js'), sandbox);
vm.runInContext(source('communityGames.js'), sandbox);
const cloud = sandbox.window.StudBudCloud;
async function run() {
    await cloud.bootstrap();
    assert.equal(cloud.offlineMode, true);
    assert.equal(storage.get('STUDBUD_LOCAL_MODE'), 'true', 'local mode is remembered across cached reloads');
    assert.equal(initializations, 1);
    assert.equal(cloud.user, null, 'offline access cannot impersonate an authenticated user');
    cloud.queueSync();
    await cloud.syncNow();
    assert.equal(timers, 0, 'offline saves do not schedule network writes');
    assert.equal(storage.get('STUDBUD_LOCAL_ONLY_DATA'), 'true');
    assert.match(sandbox.window.NexusApp.AppState.status, /saved on this device/i);
    assert.throws(() => sandbox.window.StudBudCommunityGames.getClient(), /internet connection/);
    await cloud.startOffline();
    assert.equal(initializations, 1, 'resuming local mode does not duplicate app initialization');
    sandbox.window.navigator.onLine = true;
    await cloud.bootstrap();
    assert.equal(cloud.offlineMode, true, 'reloads preserve local access even when connectivity is reported online');
    sandbox.window.navigator.onLine = false;
    await cloud.connectOnline();
    assert.equal(cloud.offlineMode, true, 'offline reconnect requests do not pretend to sync');

    const remote = { state: { profile: { graduationYear: 2027 }, courses: [{ code: 'remote', title: 'Cloud class' }], settings: { theme: 'dark' } },
        flashcards: [{ id: 'remote-deck', title: 'Cloud set', cards: [] }], studyHistory: [] };
    sandbox.window.navigator.onLine = true;
    cloud.client = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { data: remote } }) }) };
    await cloud.openAccount({ id: 'account', user_metadata: { username: 'student' } });
    assert.equal(snapshot.flashcards.length, 2, 'first account connection retains offline and cloud decks');
    assert.equal(snapshot.state.courses.length, 2);
    assert.equal(snapshot.state.profile.graduationYear, 2027, 'untouched guest profile defaults do not conflict with an existing account');
    assert.equal(storage.get('STUDBUD_LOCAL_ONLY_DATA'), undefined);
    assert.equal(cloud.offlineMode, false);
    assert.equal(cloud.accountReady, true);
    assert.equal(storage.get('STUDBUD_LOCAL_MODE'), undefined);
    const base = JSON.parse(JSON.stringify(snapshot));
    storage.set('STUDBUD_CLOUD_SYNC_BASE', JSON.stringify(base));
    snapshot.state.profile.graduationYear = 2028;
    remote.state.profile.graduationYear = 2029;
    cloud.accountReady = false;
    cloud.client.auth = { signInWithPassword: async () => ({ data: { user: { id: 'account' } } }) };
    sandbox.document.getElementById('login-username').value = 'student';
    sandbox.document.getElementById('login-password').value = 'not-a-real-password';
    let resolutions = 0;
    const renderConflict = cloud.renderConflictResolution;
    cloud.renderConflictResolution = (conflict, message) => {
        resolutions++;
        assert.match(message, /both devices/i);
        assert.equal(conflict.local.state.profile.graduationYear, 2028);
        assert.equal(conflict.remoteSnapshot.state.profile.graduationYear, 2029);
    };
    await cloud.handleLogin({ preventDefault() {} });
    assert.equal(resolutions, 1, 'password sign-in preserves recovery choices for genuine concurrent edits');
    assert.equal(snapshot.state.profile.graduationYear, 2028, 'conflicts never overwrite device data');
    cloud.renderConflictResolution = renderConflict;
    snapshot = base;
    remote.state.profile.graduationYear = 2027;
    await cloud.openAccount({ id: 'account' });
    assert.equal(cloud.pendingConflict, null, 'successful retries clear stale conflict state');
    events.get('offline')();
    assert.equal(cloud.offlineMode, true);
    const before = JSON.stringify(snapshot);
    await cloud.syncNow();
    assert.equal(JSON.stringify(snapshot), before, 'connection loss cannot restore an older account snapshot');

    let loadedConfig = false, removedConfigScript = false;
    sandbox.document.createElement = () => ({ remove() { removedConfigScript = true; } });
    sandbox.document.head = { appendChild(script) {
        assert.equal(script.src, 'supabase-config.js');
        loadedConfig = true;
        sandbox.window.STUDBUD_SUPABASE_CONFIG = { url: 'https://project.supabase.co', anonKey: 'public-test-key' };
        script.onload();
    } };
    sandbox.window.supabase = { createClient: () => ({
        auth: {
            onAuthStateChange: () => ({ data: { subscription: {} } }),
            getSession: async () => ({ data: { session: null } })
        }
    }) };
    const reconnect = new cloud.constructor();
    reconnect.appStarted = true;
    reconnect.offlineMode = true;
    await reconnect.connectOnline();
    assert.equal(loadedConfig, true, 'reconnecting after a cached load retrieves network-only account settings');
    assert.equal(removedConfigScript, true);
    assert.ok(reconnect.client);

    const handlers = new Map();
    const cached = new Response('cached library');
    let response, fetches = 0, installation, installing = true, cacheLookups = 0;
    const installed = [];
    const worker = {
        console, URL, Response, AbortController, setTimeout, clearTimeout,
        self: { location: { origin: 'https://studbud.test' }, registration: { scope: 'https://studbud.test/' }, addEventListener: (name, handler) => handlers.set(name, handler), skipWaiting() {} },
        caches: {
            match: async request => { cacheLookups++; return String(request.url || request).includes('missing') ? undefined : cached; },
            open: async () => ({ addAll: async files => installed.push(...files), put: async url => installed.push(url) })
        },
        fetch: async () => { fetches++; if (installing) return new Response('public dependency'); throw new Error('offline'); }
    };
    vm.createContext(worker);
    vm.runInContext(source('service-worker.js'), worker);
    handlers.get('install')({ waitUntil: promise => { installation = promise; } });
    await installation;
    installing = false;
    fetches = 0;
    assert.equal(installed.filter(url => url.endsWith('.woff2') && !url.includes('nunito')).length, 3, 'icon fonts are precached before the first offline reload');
    assert.ok(installed.includes('./assets/fonts/nunito-latin.woff2'), 'the app font is precached');
    assert.ok(installed.includes('./chessGame.js'));
    handlers.get('fetch')({ request: { method: 'GET', url: 'https://cdn.jsdelivr.net/npm/chart.js' }, respondWith: promise => { response = promise; } });
    assert.equal(await response, cached, 'public libraries are available from the offline cache');
    response = undefined;
    handlers.get('fetch')({ request: { method: 'GET', url: 'https://project.supabase.co/rest/v1/private_data' }, respondWith: promise => { response = promise; } });
    assert.equal(response, undefined, 'private account responses are never cached by the worker');
    handlers.get('fetch')({ request: { method: 'GET', url: 'https://studbud.test/missing.js' }, respondWith: promise => { response = promise; } });
    assert.equal((await response).status, 503, 'uncached offline assets report an explicit failure');
    assert.equal(fetches, 2);
    handlers.get('fetch')({ request: { method: 'GET', url: 'https://studbud.test/supabase-config.js' }, respondWith: promise => { response = promise; } });
    assert.equal((await response).status, 503);
    assert.equal(cacheLookups, 2, 'account settings remain network-only even during offline fallback');
    assert.ok(installed.includes('./join/index.html') && installed.includes('./join.js'), 'the public joining page is precached separately');
    let abortSlowRequest;
    worker.setTimeout = (callback, delay) => { assert.equal(delay, 6000); abortSlowRequest = callback; return 1; };
    worker.clearTimeout = () => {};
    worker.fetch = (request, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Timed out'))));
    handlers.get('fetch')({ request: { method: 'GET', url: 'https://studbud.test/app.js' }, respondWith: promise => { response = promise; } });
    abortSlowRequest();
    assert.equal(await response, cached, 'stalled networks fall back to cached scripts instead of blocking app startup indefinitely');
    handlers.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: 'https://studbud.test/' }, respondWith: promise => { response = promise; }, waitUntil() {} });
    abortSlowRequest();
    assert.equal(await response, cached);
    worker.fetch = () => { throw new Error('Cached reload must not retry a failed network for every script'); };
    handlers.get('fetch')({ request: { method: 'GET', url: 'https://studbud.test/app.js' }, respondWith: promise => { response = promise; } });
    assert.equal(await response, cached, 'a failed navigation uses cached assets immediately rather than stacking per-script timeouts');
    worker.fetch = async () => new Response('fresh network response');
    handlers.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: 'https://studbud.test/' }, respondWith: promise => { response = promise; }, waitUntil() {} });
    assert.equal(await (await response).text(), 'fresh network response');
    let navigationWrite;
    handlers.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: 'https://studbud.test/join/' }, respondWith: promise => { response = promise; }, waitUntil(promise) { navigationWrite = promise; } });
    await response;
    await navigationWrite;
    assert.equal(installed.at(-1), './join/index.html', 'a join navigation cannot overwrite the main offline shell');
    handlers.get('fetch')({ request: { method: 'GET', url: 'https://studbud.test/app.js' }, respondWith: promise => { response = promise; } });
    assert.equal(await (await response).text(), 'fresh network response', 'successful navigation resumes network revalidation');
    let clearedBodyDeadline = 0;
    worker.clearTimeout = () => { clearedBodyDeadline++; };
    worker.fetch = async (request, options) => new Response(new ReadableStream({
        start(controller) { options.signal.addEventListener('abort', () => controller.error(new Error('Body stalled'))); }
    }));
    handlers.get('fetch')({ request: { method: 'GET', url: 'https://studbud.test/app.js' }, respondWith: promise => { response = promise; } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(clearedBodyDeadline, 0, 'receiving headers cannot disable the offline fallback deadline');
    abortSlowRequest();
    assert.equal(await response, cached, 'stalled response bodies also fall back to cached assets');
    const html = source('index.html');
    const sidebar = html.slice(html.indexOf('<nav id="main-nav">'), html.indexOf('<!-- MAIN CONTENT AREA -->'));
    assert.equal((sidebar.match(/class="nav-item desktop-nav-extra(?: hidden)?"/g) || []).length, 2,
        'desktop extras contain only Settings and permission-gated Staff tools');
    assert.doesNotMatch(sidebar, /data-target="(?:appearance|sound|about)-view"/,
        'appearance, audio and help stay inside Settings, not in the sidebar');
    assert.match(sidebar, /data-target="settings-view" data-also="appearance-view sound-view about-view"/);
    assert.equal((html.match(/<li class="nav-item(?: active)?" data-target=/g) || []).length, 6, 'six primary workspaces replace the long sidebar; Settings stays in the header');
    assert.match(html, /id="workspace-tabs"/);
    assert.match(html, /id="offline-start-btn"/);
    assert.match(source('app.js'), /both devices|WORKSPACES/i);
    console.log('Offline startup, no-network saves, cold account merges, reconnection safety, private-cache exclusions, explicit asset failures and six-workspace navigation passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
