/**
 * Service Worker — app shell caching only.
 *
 * NOTE: GraphQL requests go to port 4001. This SW runs on port 3000 and
 * cannot intercept cross-origin fetches. Data caching is handled at the
 * application level via localStorage (see lib/cache.ts).
 */

const CACHE_NAME = 'pantry-host-shell';

// Pages to pre-cache on install
const SHELL_PAGES = ['/', '/list', '/recipes', '/ingredients', '/cookware', '/kitchens', '/menus'];

self.addEventListener('install', (event) => {
  // Cache each page individually so one failure doesn't abort the entire
  // install. addAll() is all-or-nothing — if any page 500s or times out,
  // the SW never activates and no offline caching happens at all.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        SHELL_PAGES.map((page) =>
          cache.add(page).catch((err) => console.warn('[SW] Failed to pre-cache', page, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Delete caches from previous app versions (e.g. old renamed caches)
  // but keep the current CACHE_NAME intact — it may hold /_rex/ bundles
  // that cached HTML still references.
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-first for all Rex assets (bundles, router, HMR client). Stale
  // cached versions of /_rex/router.js or hash-named bundles cause blank pages.
  if (url.pathname.startsWith('/_rex/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(request)))
    );
    return;
  }

  // Network-first for HTML navigation requests (fall back to cache for offline)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.open(CACHE_NAME).then((cache) =>
            cache.match(request).then((cached) => cached ?? cache.match('/'))
          )
        )
    );
    return;
  }

  // Stale-while-revalidate for other same-origin requests (images, fonts, etc.)
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          cache.put(request, response.clone());
          return response;
        });
        return cached ?? networkFetch;
      })
    )
  );
});
