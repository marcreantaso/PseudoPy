/* ============================================================
   PSEUDOPY — SERVICE WORKER
   Offline-first caching strategy
   ============================================================ */

const CACHE_NAME = 'pseudopy-shell-20260921-v4';
const LOCAL_ASSETS = [
    './',
    './index.html',
    './style.css',
    './style.css?v=pseudopy-logo-1',
    './mapper.js',
    './app.js',
    './app.js?v=icons-2',
    './devtools.js?v=20260909',
    './ui-icons.js?v=2',
    './ui-icons.css?v=1',
    './compiler.js',
    './compiler.js?v=20260903',
    './dataset.json',
    './metrics.js',
    './metrics.js?v=20260903',
    './manifest.json',
    './database.js',
    './robots.txt',
    './icons/icon.svg',
    './icons/pseudopy-logo.png?v=2',
    './icons/pseudopy-192.png?v=2',
    './icons/pseudopy-apple.png?v=2',
    './icons/pseudopy-favicon.png?v=2',
    './icons/pseudopy-maskable.png?v=2'
];

// Only always-needed external assets are pre-cached. Skulpt, PDF.js, lucide
// and anime are fetched on first use (see src/app/on-demand.js) and cached
// lazily by the fetch handler, so installation never pays for unused code.
const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

// Install — cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching core local assets');
            // Cache local assets atomically
            cache.addAll(LOCAL_ASSETS).catch(err => console.warn('[SW] Some local assets failed:', err));
            
            // Cache external assets individually (to prevent single-failure halting everything)
            EXTERNAL_ASSETS.forEach(url => {
                const req = new Request(url, { mode: 'no-cors' });
                fetch(req).then(response => cache.put(req, response)).catch(err => console.warn('[SW] External asset failed:', url, err));
            });
        })
    );
    // Controlled updates: a freshly deployed worker waits in "waiting" until
    // the UI explicitly posts the SKIP_WAITING message (the "Update Now"
    // banner action), so an update never hijacks an in-progress session or
    // reloads the page without consent.
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch — cache-first, fallback to network
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);
    const isSameOrigin = requestUrl.origin === self.location.origin;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                // Only same-origin GET successes are promoted to the runtime
                // cache. Firestore/Auth and other third-party responses are
                // never cached as static public app assets.
                if (isSameOrigin && event.request.method === 'GET' && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Offline fallback for same-origin navigations only
                if (event.request.mode === 'navigate' && isSameOrigin) {
                    return caches.match('/index.html');
                }
            });
        })
    );
});

// Listen for the skipWaiting message from the UI
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
