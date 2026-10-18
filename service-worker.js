const CACHE_NAME = 'studbud-shell-v143';
let offlineNavigation = false;
const PUBLIC_DEPENDENCIES = [
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2'
];
const APP_FILES = [
    './',
    './index.html',
    './styles.css',
    './assets/fonts/nunito-latin.woff2',
    './manifest.webmanifest',
    './icons/studbud.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './parkwayData.js',
    './data/schools/central.js',
    './data/schools/north.js',
    './data/schools/south.js',
    './data/schools/west.js',
    './gpaCalculator.js',
    './plannerEngine.js',
    './appDialogs.js',
    './flashcardEngine.js',
    './analyticsEngine.js',
    './practiceExamEngine.js',
    './nameModeration.js',
    './cloudSync.js',
    './sfx.js',
    './communityGames.js',
    './multiplayerEngine.js',
    './multiplayerGames.js',
    './multiplayerGames2.js',
    './multiplayerGames3.js',
    './chessGame.js',
    './infiniteCampusImport.js',
    './classrooms.js',
    './app.js',
    './ads.js'
];

function fetchWithTimeout(request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    return fetch(request, { cache: 'no-cache', signal: controller.signal })
        .then(async response => {
            // Keep the deadline active through the body, not only the headers.
            await response.clone().arrayBuffer();
            return response;
        })
        .finally(() => clearTimeout(timeout));
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async cache => {
                await cache.addAll(APP_FILES);
                await Promise.all(PUBLIC_DEPENDENCIES.map(url => fetchWithTimeout(url)
                    .then(response => {
                        if (!response.ok) throw new Error(`Offline dependency returned ${response.status}.`);
                        return cache.put(url, response);
                    })
                    .catch(error => console.warn('[StudBud] Optional offline dependency could not be cached:', url, error))));
            })
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
    const url = new URL(request.url);
    const publicAsset = PUBLIC_DEPENDENCIES.includes(request.url)
        || (url.origin === 'https://cdnjs.cloudflare.com' && url.pathname.startsWith('/ajax/libs/font-awesome/6.4.0/webfonts/'));
    if (request.method !== 'GET' || (url.origin !== self.location.origin && !publicAsset)) return;
    if (new URL(request.url).pathname.includes('/assets/previews/')) return;
    if (new URL(request.url).pathname.endsWith('/supabase-config.js')) {
        event.respondWith(fetchWithTimeout(request)
            .catch(() => new Response('Account connection settings are unavailable offline. Your saved local app remains available.', { status: 503 })));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetchWithTimeout(request)
                .then(response => {
                    offlineNavigation = false;
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
                    }
                    return response;
                })
                .catch(async () => {
                    offlineNavigation = true;
                    return (await caches.match('./index.html')) || new Response('The offline app is not cached. Reconnect and open StudBud once.', { status: 503 });
                })
        );
        return;
    }

    // Revalidate with the server so a fresh index.html never runs alongside stale scripts.
    if (offlineNavigation) {
        event.respondWith(caches.match(request)
            .then(response => response || new Response('This asset is unavailable offline. Reconnect to download it.', { status: 503 })));
        return;
    }
    event.respondWith(
        fetchWithTimeout(request)
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            })
            .catch(async () => (await caches.match(request)) || new Response('This asset is unavailable offline. Reconnect to download it.', { status: 503 }))
    );
});
