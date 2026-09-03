/* ============================================================
   PSEUDOPY — SERVICE WORKER
   Offline-first caching strategy
   ============================================================ */

const CACHE_NAME = 'pseudopy-v37';
const LOCAL_ASSETS = [
    './',
    './index.html',
    './style.css',
    './mapper.js',
    './app.js',
    './compiler.js',
    './dataset.json',
    './metrics.js',
    './manifest.json',
    './database.js',
    './icons/icon.svg'
];

const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
    'https://skulpt.org/js/skulpt.min.js',
    'https://skulpt.org/js/skulpt-stdlib.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
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

// Fetch — cache-first, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                // Cache successful GET responses (allow opaque status 0 for CDNs)
                if (event.request.method === 'GET' && (networkResponse.status === 200 || networkResponse.status === 0)) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Offline fallback for navigation
                if (event.request.mode === 'navigate') {
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
