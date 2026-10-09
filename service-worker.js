const CACHE_NAME = 'studbud-shell-v26';
const APP_FILES = [
    './',
    './index.html',
    './styles.css',
    './manifest.webmanifest',
    './icons/studbud.svg',
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
        caches.match(request)
            .then(cached => cached || fetch(request).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            }))
    );
});
