/* Basic PWA cache with daily-updating image support */
const CACHE_NAME = 'inspo-clock-v1';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: pre-cache core
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE)));
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k)))))
  );
  self.clients.claim();
});

// Fetch: 
// - HTML → network-first (so your 0/6/12/18 updates appear)
// - Images/CSS/JS → cache-first with network fallback
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // HTML pages: network-first
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Images (incl. Catbox, opaque allowed) & static assets: cache-first
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Cache opaque images too; ignore if invalid
        const okToCache = res && (res.status === 200 || res.type === 'opaque');
        if (okToCache) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit || Response.error());
    })
  );
});
