// Service Worker — Noosfeerique PWA
// Enables offline caching and home screen install
// Note: requires HTTPS to activate (won't work on plain HTTP)

const CACHE_NAME = 'noosphi-v1';
const ASSETS_TO_CACHE = [
  '/experience.html',
  '/css/experience.css',
  '/js/experience.js',
  '/js/zindex.js',
  '/js/three.module.js',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/favicon-32.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/images/eiffel-ai-logo.png',
  '/credits.html',
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network first, fallback to cache (APIs always network)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: always network, never cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // CDN resources: network first, cache fallback
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // App assets: network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
