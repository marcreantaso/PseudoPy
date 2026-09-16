"use strict";
const CACHE = "pseudopy-offline-lab-v2";
const ASSETS = [
  "./offline.html",
  "./offline.js",
  "./offline-metrics.js",
  "./academic.css",
  "./mapper.js",
  "./compiler.js",
  "./execution-worker.js",
  "./vendor/skulpt.min.js",
  "./vendor/skulpt-stdlib.js",
  "./manifest.json",
  "./icons/icon.svg",
];
const urls = new Set(
  ASSETS.map((asset) => new URL(asset, self.registration.scope).href),
);
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("pseudopy-") && key !== CACHE)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.includes("/api/")
  )
    return;
  if (urls.has(url.href))
    event.respondWith(
      caches
        .open(CACHE)
        .then(async (cache) => (await cache.match(request)) || fetch(request)),
    );
  else if (request.mode === "navigate")
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(new URL("./offline.html", self.registration.scope).href),
      ),
    );
});
