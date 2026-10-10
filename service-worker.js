const CACHE_NAME = 'studbud-shell-v34';
const APP_FILES = [
    './',
    './index.html',
    './styles.css',
    './manifest.webmanifest',
    './icons/studbud.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './widgets/streak-template.json',
    './widgets/streak-data.json',
    './pchsData.js',
    './gpaCalculator.js',
    './plannerEngine.js',
    './flashcardEngine.js',
    './analyticsEngine.js',
    './practiceExamEngine.js',
    './cloudSync.js',
    './sfx.js',
    './communityGames.js',
    './multiplayerEngine.js',
    './multiplayerGames.js',
    './multiplayerGames2.js',
    './multiplayerGames3.js',
    './app.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith('studbud-shell-') && key !== CACHE_NAME)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
    if (new URL(request.url).pathname.endsWith('/widgets/streak-data.json')) {
        event.respondWith(readWidgetData().then(data => new Response(data, { headers: { 'Content-Type': 'application/json' } })));
        return;
    }
    if (new URL(request.url).pathname.endsWith('/supabase-config.js')) {
        event.respondWith(fetch(request));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
                    }
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});

// Home-screen widget (Windows 11 Widgets board). The app posts its latest streak/assignment
// snapshot here so the widget can render without the app being open.
const WIDGET_CACHE = 'studbud-widget';
const WIDGET_TAG = 'studbud-streak';
const WIDGET_DATA_KEY = './widgets/streak-data.json';

async function readWidgetData() {
    const cache = await caches.open(WIDGET_CACHE);
    const stored = await cache.match(WIDGET_DATA_KEY);
    if (stored) return stored.text();
    const fallback = await caches.match(WIDGET_DATA_KEY) || await fetch(WIDGET_DATA_KEY).catch(() => null);
    return fallback ? fallback.text() : '{}';
}

async function readWidgetTemplate() {
    const response = await caches.match('./widgets/streak-template.json') || await fetch('./widgets/streak-template.json');
    return response.text();
}

async function refreshWidget(widget) {
    if (!self.widgets) return;
    const payload = { template: await readWidgetTemplate(), data: await readWidgetData() };
    if (widget?.instances?.length) {
        await Promise.all(widget.instances.map(instance => self.widgets.updateByInstanceId(instance.id, payload)));
    } else {
        await self.widgets.updateByTag(WIDGET_TAG, payload);
    }
}

self.addEventListener('message', event => {
    if (event.data?.type !== 'studbud-widget-data') return;
    event.waitUntil(caches.open(WIDGET_CACHE)
        .then(cache => cache.put(WIDGET_DATA_KEY, new Response(JSON.stringify(event.data.data || {}), { headers: { 'Content-Type': 'application/json' } })))
        .then(() => refreshWidget())
        .catch(() => { }));
});

self.addEventListener('widgetinstall', event => event.waitUntil(refreshWidget(event.widget)));
self.addEventListener('widgetresume', event => event.waitUntil(refreshWidget(event.widget)));

self.addEventListener('widgetclick', event => {
    const route = event.action === 'study' ? './#/flashcard' : './#/dashboard';
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
        const existing = windows[0];
        if (existing) return existing.navigate(route).then(client => (client || existing).focus()).catch(() => existing.focus());
        return self.clients.openWindow(route);
    }));
});