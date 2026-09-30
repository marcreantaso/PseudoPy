/* ============================================================
   PSEUDOPY — SERVICE WORKER
   Offline-first caching strategy
   ============================================================ */

const CACHE_NAME = 'pseudopy-shell-20261001-v12';
// Vendor cache name is versioned so the old-worker cleanup below can prune
// superseded PDF worker generations instead of accumulating them.
const VENDOR_CACHE_NAME = 'pseudopy-vendor-20261001-v12';

const LOCAL_ASSETS = [
    './',
    './index.html',
    './pwa-updates.js?v=20260921-1',
    './style.css',
    './student-workspace.css',
    './style.css?v=charts-fix-1',
    './student-workspace.css?v=charts-fix-1',
    './mapper.js',
    './app.js',
    './app.js?v=charts-fix-1',
    './ui-icons.js?v=2',
    './ui-icons.css?v=1',
    './compiler.js',
    './compiler.js?v=20260903',
    './metrics.js',
    './metrics.js?v=20260903',
    './manifest.json',
    './database.js',
    './devtools.js',
    './robots.txt',
    './icons/icon.svg',
    './icons/pseudopy-192.png?v=2',
    './icons/pseudopy-apple.png?v=2',
    './icons/pseudopy-favicon.png?v=2',
    './icons/pseudopy-maskable.png?v=2',
    // Core Python execution is an offline feature: the Skulpt runtime and its
    // stdlib are vendored under vendor/ and pre-cached at install time so an
    // installed PWA can translate AND execute Python with no network at all.
    './vendor/skulpt/skulpt.min.js',
    './vendor/skulpt/skulpt-stdlib.js'
];

// External assets are pre-cached best-effort (non-blocking): installation never
// fails if a CDN is unreachable at install time. Firebase SDK scripts are
// needed to initialize Firestore; Google Fonts load via CSS and fall back to
// the local font stack when offline; lucide and anime are the only remaining
// non-vendored lazy dependencies and are cached so icons/animations survive.
// Firestore/Auth DATA responses are never cached as static shell assets
// (handled in the fetch handler below).
const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
    'https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.js',
    'https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js'
];

// PDF.js is large, so it is NOT added to the blocking shell install. Instead
// it lives in a dedicated vendor cache that is populated right after
// activation (while the app is online). The fetch handler falls back to that
// cache, so a PWA that was opened once after install can still extract PDFs
// fully offline. Vendored files are same-origin, so the runtime cache-promotion
// path is a second safety net for the very first offline launch.
const VENDOR_ASSETS = [
    './vendor/pdfjs/pdf.min.js',
    './vendor/pdfjs/pdf.worker.min.js'
];

// Install — cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Installation is not complete until the entire local shell (and the
            // offline Skulpt runtime) is ready. A failed core request must leave
            // the previous worker in control.
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

// Activate — populate the optional vendor cache, then clean old caches
self.addEventListener('activate', (event) => {
    const activeCaches = [CACHE_NAME, VENDOR_CACHE_NAME];
    event.waitUntil(
        // Populate the optional PDF.js vendor cache after install while still
        // online. Failures here (offline install) are non-fatal: same-origin
        // vendor scripts are additionally runtime-cached by the fetch handler
        // on first successful use.
        caches.open(VENDOR_CACHE_NAME).then(cache =>
            Promise.allSettled(VENDOR_ASSETS.map(url => cache.add(url)))
        ).then(() =>
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.filter((name) => name.startsWith('pseudopy-') && !activeCaches.includes(name))
                        .map((name) => caches.delete(name))
                );
            })
        ).then(() => self.clients.claim())
    );
});

// Fetch — cache-first (shell, then vendor), fallback to network
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
            return caches.open(VENDOR_CACHE_NAME).then(vendorCache => vendorCache.match(event.request)).then((vendorResponse) => {
                if (vendorResponse) {
                    return vendorResponse;
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
