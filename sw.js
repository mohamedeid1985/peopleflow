/* Service worker for the HR Performance Evaluation app.
   Purpose: let the app install as a PWA and open again once it's been
   visited, even with a flaky or missing connection. All real data now lives
   in the shared Supabase database, not here — this only caches the app's own
   files (and, opportunistically, the CDN scripts it loads) so the shell
   itself can load offline. Requests to the Supabase project are explicitly
   never cached (see SUPABASE_HOST below) — caching a GET to the data API
   would mean seeing stale employees/evaluations after someone else's edit. */
const CACHE_NAME = 'hr-eval-app-v2';
const SUPABASE_HOST = 'ksfuzzxepaebhoqjpthu.supabase.co';
const APP_SHELL = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // never block install on a shell asset that fails to fetch
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first for the app's own page (so updates are picked up promptly),
// falling back to cache when offline. Cache-first for everything else
// (CDN libraries, fonts, icons) so they only need to be fetched once.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.host === SUPABASE_HOST) return; // always go straight to the network — never cache live data

  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./')))
    );
  } else {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached);
      })
    );
  }
});
