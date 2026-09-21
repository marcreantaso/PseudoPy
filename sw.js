/* ============================================================
   PSEUDOPY — SERVICE WORKER
   Offline-first caching strategy
   ============================================================ */

const CACHE_NAME = 'pseudopy-shell-20260921-v5';
const LOCAL_ASSETS = [
    './',
    './index.html',
    './pwa-updates.js?v=20260921-1',
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
        caches.open(CACHE_NAME).then(async (cache) => {
            // Installation is not complete until the entire local shell is ready.
            // A failed core request must leave the previous worker in control.
            await cache.addAll(LOCAL_ASSETS);
            await Promise.allSettled(EXTERNAL_ASSETS.map(async url => {
                const req = new Request(url, { mode: 'no-cors' });
                const response = await fetch(req);
                await cache.put(req, response);
            }));
        })
    );
    // Controlled updates: a freshly deployed worker waits in "waiting" until
    // the UI explicitly posts the SKIP_WAITING message (the "Update Now"
    // banner action), so an update never hijacks an in-progress session or
    // reloads the page without consent.
    //
    // Platform caveats:
    // - iOS Safari before 16.4 cannot keep a Home-Screen web app updated or
    //   reliably show the banner; such users should launch the app from
    //   Safari once after a new release.
    // - Firefox may not advertise updates to inactive tabs; the Update Now
    //   banner is re-surfaced on pageshow/focus in the UI registration.
    // - Native authentication never relies on the cache: Firestore/Auth
    //   responses are excluded from this cache by the fetch handler.
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name.startsWith('pseudopy-') && name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch — cache-first, fallback to network
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);
    const isSameOrigin = requestUrl.origin === self.location.origin;

    // Collection API responses and writes are never static app-shell assets.
    if (event.request.method !== 'GET' || (isSameOrigin && requestUrl.pathname.startsWith('/api/'))) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then((cachedResponse) => {
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
                    return caches.open(CACHE_NAME).then(cache => cache.match('./index.html'));
                }
            });
        })
    );
});

// Listen for the skipWaiting message from the UI
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        event.waitUntil(self.skipWaiting());
    }
});
