/**
 * Service Worker for 教培备考工作台 PWA
 * - Cache core assets for offline use
 * - Network-first strategy for data? No data cached here (localStorage stays local)
 * - Cache-first for static assets
 */
const CACHE_NAME = 'teaching-workbench-v16';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/data.js',
  '/js/sync.js',
  '/js/login.js',
  '/js/app.js',
  '/js/prep.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Cache install failed:', err))
  );
});

// Activate: claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for HTML/JS/CSS (always get latest), cache fallback for offline
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Network-first for dynamic assets (HTML, JS, CSS) — always get latest version
  const isDynamicAsset = /\.(html|js|css)(\?|$)/.test(request.url) || request.destination === 'document';

  if (isDynamicAsset) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
  } else {
    // Cache-first for static assets (icons, manifest)
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
  }
});
