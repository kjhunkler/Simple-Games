/* ============ Simple Games — service worker ============ */
const CACHE_NAME = "simple-games-v2";

const ASSETS = [
    "./",
    "./index.html",
    "./manifest.json",
    "./css/app.css",
    "./js/storage.js",
    "./js/sound.js",
    "./js/app.js",
    "./js/games/snake.js",
    "./js/games/astro.js",
    "./js/games/piestack.js",
    "./js/games/flappy.js",
    "./js/games/moles.js",
    "./js/games/memory.js",
    "./icons/icon.svg",
    "./icons/icon-maskable.svg"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// Cache-first with network fallback; successful network responses refresh the cache.
self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const network = fetch(event.request)
                .then((response) => {
                    if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});
