/* ============================================================
   PSEUDOPY — SERVICE WORKER
   Offline-first caching strategy
   ============================================================ */

const CACHE_NAME = 'pseudopy-learning-20260917';
const LOCAL_ASSETS = [
    './',
    './index.html',
    './style.css',
    './mapper.js',
    './app.js',
    './runtime.js',
    './runtime-worker.js',
    './learning.js',
    './devtools.js',
    './vendor/skulpt.min.js',
    './vendor/skulpt-stdlib.js',
    './compiler.js',
    './metrics.js',
    './manifest.json',
    './database.js',
    './icons/icon.svg'
];

const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

// Install — cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[SW] Caching core local assets');
            await cache.addAll(LOCAL_ASSETS);

            // External assets are optional; one CDN failure must not abort install.
            await Promise.allSettled(EXTERNAL_ASSETS.map(url => {
                const req = new Request(url, { mode: 'no-cors' });
                return fetch(req).then(response => cache.put(req, response));
            }));
        })
    );
    self.skipWaiting();
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

const NETWORK_ONLY_HOSTS = new Set([
    'firestore.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com'
]);

function isBackendRequest(request) {
    const url = new URL(request.url);
    return NETWORK_ONLY_HOSTS.has(url.hostname)
        || url.hostname.endsWith('.firebaseio.com')
        || url.pathname.startsWith('/api/');
}

async function handleStaticRequest(request) {
    const cachedResponse = await caches.match(request, { ignoreSearch: new URL(request.url).origin === self.location.origin });
    if (cachedResponse) return cachedResponse;

    try {
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        if (request.mode === 'navigate') {
            const fallback = await caches.match('./index.html') || await caches.match('/index.html');
            if (fallback) return fallback;
        }

        return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

// Fetch — cache static GET assets only. Firestore and API traffic must bypass
// the service worker so their transports and error handling remain intact.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || isBackendRequest(event.request)) return;
    event.respondWith(handleStaticRequest(event.request));
});

// Listen for the skipWaiting message from the UI
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
