/**
 * Service Worker — app shell + asset caching for offline support.
 *
 * ## Architecture
 *
 * This SW handles caching for the Rex-bundled frontend (port 3000). It does
 * NOT intercept GraphQL requests (port 4001) because those are cross-origin
 * from the SW's perspective. Data caching for offline is handled at the
 * application level via localStorage (see lib/cache.ts and lib/gql.ts).
 *
 * ## Caching strategies
 *
 * | Request type          | Strategy               | Rationale                           |
 * |-----------------------|------------------------|-------------------------------------|
 * | Shell pages (install) | Pre-cache individually | Ensures offline navigation works    |
 * | /_rex/ bundles        | Network-first          | Always serve fresh JS; cache for    |
 * |                       |                        | offline fallback                    |
 * | HTML navigation       | Network-first          | SSR content stays fresh; cached     |
 * |                       |                        | shell available offline             |
 * | Other same-origin     | Stale-while-revalidate | Images, fonts, manifest served      |
 * |                       |                        | from cache instantly, updated in bg |
 * | Cross-origin          | Ignored (passthrough)  | GraphQL, Google Fonts, etc.         |
 *
 * ## Build-hash aware cache cleanup
 *
 * Rex production builds embed an 8-character hash in every bundle filename
 * (e.g. chunk-esm-557eb197.js). Each build produces a new hash. Without
 * cleanup, the cache accumulates hundreds of dead entries across deploys —
 * old cached HTML references old JS bundles, causing blank pages offline.
 *
 * When a new /_rex/static/ bundle is fetched successfully, the SW extracts
 * the hash and purges all cached /_rex/static/ entries with a different
 * hash. This is self-cleaning — no manual CACHE_NAME bumping needed.
 *
 * ## Pre-caching
 *
 * On install, SHELL_PAGES are cached individually (not via addAll) so that
 * a single page failure (e.g. a 500 on /cookware) doesn't abort the entire
 * install. Without this, the SW would never activate and no offline caching
 * would happen at all.
 *
 * ## Install / activate lifecycle
 *
 * - install: pre-cache shell pages, then skipWaiting() to activate immediately
 * - activate: delete any caches with different names (future-proofing),
 *   then clients.claim() so the SW controls all open tabs without a reload
 *
 * ## Known limitations
 *
 * - GraphQL data is NOT cached by the SW. Pages that depend on GraphQL
 *   (menus, recipes, grocery list) show cached HTML shells offline but
 *   need localStorage data (populated by prior visits) to display content.
 *   Without cached data, these pages show skeleton/loading UI.
 *
 * - Safari on iOS kills service workers aggressively (~30s of inactivity).
 *   The SW will re-activate on next navigation, but won't persist in the
 *   background the way Chrome does.
 *
 * - Dev mode (rex dev) uses different asset paths and HMR. The SW is
 *   designed for production builds (rex build + rex start). Test offline
 *   behavior in prod mode only.
 *
 * ## Debugging
 *
 * On iOS Safari, connect via remote debugger:
 *   - Settings → Safari → Advanced → Web Inspector → on
 *   - Mac Safari → Develop → [device name] → [tab]
 *
 * Useful console commands:
 *   navigator.serviceWorker.controller          // null = SW not controlling page
 *   navigator.serviceWorker.getRegistration()   // check registration state
 *   caches.open('pantry-host-shell').then(c =>   // list cached URLs
 *     c.keys().then(k => console.log(k.map(r => r.url))))
 *   caches.delete('pantry-host-shell').then(() => location.reload())  // reset
 */

const CACHE_NAME = 'pantry-host-shell';

// Pages to pre-cache on install — these are available offline immediately
// after the SW activates, even if the user hasn't visited them yet.
const SHELL_PAGES = ['/', '/list', '/recipes', '/ingredients', '/cookware', '/kitchens', '/menus', '/recipes/export'];

/**
 * Extract the 8-char build hash from a Rex bundle filename.
 * e.g. "chunk-esm-557eb197.js" → "557eb197"
 * Returns null for non-hashed files like "router.js".
 */
function extractHash(pathname) {
  const match = pathname.match(/-([a-f0-9]{8})\.js/);
  return match ? match[1] : null;
}

/**
 * Remove cached /_rex/static/ entries whose hash doesn't match the
 * current build. Called after successfully fetching a new bundle.
 */
function purgeStaleAssets(cache, currentHash) {
  return cache.keys().then((requests) =>
    Promise.all(
      requests
        .filter((req) => {
          const url = new URL(req.url);
          if (!url.pathname.startsWith('/_rex/static/')) return false;
          const hash = extractHash(url.pathname);
          return hash && hash !== currentHash;
        })
        .map((req) => cache.delete(req))
    )
  );
}

// --- Lifecycle events ---

self.addEventListener('install', (event) => {
  // Cache shell pages individually so one failure doesn't abort the install.
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
  // Delete caches from previous SW versions (different CACHE_NAME).
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// --- Fetch handler ---

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests — GraphQL (port 4001) is cross-origin
  if (url.origin !== self.location.origin) return;

  // Network-first for Rex bundles. On success, cache the response and
  // purge stale bundles from previous builds.
  if (url.pathname.startsWith('/_rex/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
            const hash = extractHash(url.pathname);
            if (hash) purgeStaleAssets(cache, hash);
          });
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(request)))
    );
    return;
  }

  // Network-first for HTML navigation. Falls back to cached version offline,
  // or to the cached homepage as a last resort.
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

  // Stale-while-revalidate for other same-origin requests (images, fonts, manifest, etc.)
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
