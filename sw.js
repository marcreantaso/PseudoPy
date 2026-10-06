/* ============================================================
   PSEUDOPY — SERVICE WORKER
   Offline-first caching strategy
   ============================================================ */

const CACHE_NAME = 'pseudopy-shell-20261006-v23';
// Vendor cache name is versioned so the old-worker cleanup below can prune
// superseded PDF worker generations instead of accumulating them.
const VENDOR_CACHE_NAME = 'pseudopy-vendor-20261006-v23';

const LOCAL_ASSETS = [
    './',
    './index.html',
    './pwa-updates.js?v=20260921-1',
    './style.css',
    './student-workspace.css',
    './style.css?v=ux-20261004-4',
    './student-workspace.css?v=ux-20261004-4',
    './mapper.js',
    './app.js',
    './app.js?v=ux-20261004-4',
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
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check-compat.js',
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
        )
        // Recover caches poisoned by an earlier build that stored the SPA HTML
        // shell in response to a missing script request. Those entries surface
        // in the browser as "Uncaught SyntaxError: Unexpected token '<'" and
        // survive every reload because the fetch handler is cache-first.
        //
        // Only the CACHE API is touched here. IndexedDB (the durable app store),
        // localStorage (sessions and editor drafts) and the mutation queue are
        // untouched, so unsaved work and queued writes are never lost.
        .then(() => purgeHtmlAssetEntries(activeCaches))
        .then(() => self.clients.claim())
    );
});

/**
 * Delete cache entries for script/style requests whose stored body is HTML.
 *
 * The previous catch-all rewrite answered every unmatched path with
 * index.html, and this worker then cached that 200 response for whatever URL
 * had been requested. Removing only those mislabelled entries restores correct
 * network behaviour for them; correctly cached assets are kept.
 */
async function purgeHtmlAssetEntries(activeCaches) {
    for (const name of activeCaches) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const request of keys) {
            const url = new URL(request.url);
            const isNavigation = request.mode === 'navigate';
            const isAsset = /\.(?:js|mjs|css|json|wasm)$/i.test(url.pathname);
            if (!isAsset || isNavigation) continue;
            const response = await cache.match(request);
            if (!response) continue;
            const type = response.headers.get('content-type') || '';
            if (!/^text\/html\b/i.test(type)) continue;
            console.warn('[SW] Discarding HTML cached for asset request:', url.pathname);
            await cache.delete(request);
        }
    }
}

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
                    //
                    // A script or stylesheet answered with the SPA HTML shell is
                    // a routing failure, not an asset. Caching it would make the
                    // browser execute HTML as JavaScript ("Unexpected token '<'")
                    // on every subsequent load, so it is passed through
                    // uncached and left for the server to report as missing.
                    const wantsAsset = isScriptOrStyleRequest(event.request);
                    const isHtml = /^text\/html\b/i.test(networkResponse.headers.get('content-type') || '');
                    if (isSameOrigin && event.request.method === 'GET'
                        && networkResponse.status === 200
                        && !(wantsAsset && isHtml)) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Offline fallback applies ONLY to real page navigations.
                    // A failed script/stylesheet fetch must surface as a load
                    // error rather than being answered with index.html.
                    if (event.request.mode === 'navigate' && isSameOrigin) {
                        return caches.open(CACHE_NAME).then(cache => cache.match('./index.html'));
                    }
                });
            });
        })
    );
});

/** True when the request expects a script or stylesheet body. */
function isScriptOrStyleRequest(request) {
    if (request.destination === 'script' || request.destination === 'style') return true;
    return /\.(?:js|mjs|css)$/i.test(new URL(request.url).pathname);
}

// Listen for the skipWaiting message from the UI
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        event.waitUntil(self.skipWaiting());
    }
});
