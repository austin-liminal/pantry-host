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
 * | /_rex/ bundles        | Cache-first (immutable)| Hashed filenames never change;      |
 * |                       |                        | serve from cache, fetch on miss     |
 * | /uploads/ images      | Cache-first (immutable)| UUID filenames never change; if an  |
 * |                       |                        | image is edited, a new UUID is used |
 * | HTML navigation       | Network-first          | SSR content stays fresh; cached     |
 * |                       |                        | shell available offline             |
 * | Other same-origin     | Stale-while-revalidate | Fonts, manifest served from cache   |
 * |                       |                        | instantly, updated in bg            |
 * | Cross-origin          | Ignored (passthrough)  | GraphQL, Google Fonts, etc.         |
 *
 * ## Time-based cache cleanup
 *
 * Rex production builds embed an 8-character hash in every bundle filename
 * (e.g. chunk-esm-557eb197.js). Each build produces a new hash. Without
 * cleanup, the cache accumulates dead entries across deploys.
 *
 * Instead of purging by hash (which races with cached HTML that still
 * references old bundles), the SW stamps each cached response with a
 * `sw-cached-at` timestamp and only purges /_rex/static/ entries older
 * than BUNDLE_MAX_AGE (7 days). This gives cached HTML from previous
 * builds plenty of time to find their JS bundles offline, while still
 * preventing unbounded cache growth. Self-cleaning — no manual CACHE_NAME
 * bumping needed.
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

/** Timeout in ms for network fetches before falling back to cache.
 * The server is on localhost/LAN so it responds in <100ms when reachable.
 * 1.5s is generous for cold SSR but fast enough to avoid hanging on 5G
 * when the home server is unreachable. */
const NETWORK_TIMEOUT = 1500;

/** Race a fetch against a timeout. Rejects if the server doesn't respond in time. */
function fetchWithTimeout(request) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error('SW timeout')), NETWORK_TIMEOUT)),
  ]);
}

/** Max age for cached /_rex/static/ bundles before they're eligible for
 * cleanup. 7 days is generous — it covers users who go offline for a
 * long weekend while keeping the cache from growing forever. */
const BUNDLE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Clone a response and stamp it with the current time so we can
 * determine age later. We copy headers into a new Response because
 * the Cache API stores whatever headers we give it.
 */
function stampResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cached-at', String(Date.now()));
  return response.arrayBuffer().then((body) =>
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  );
}

/**
 * Remove cached /_rex/static/ entries that were cached more than
 * BUNDLE_MAX_AGE ago. Entries without a timestamp are treated as
 * stale and removed (they predate this logic).
 */
function purgeStaleAssets(cache) {
  const cutoff = Date.now() - BUNDLE_MAX_AGE;
  return cache.keys().then((requests) =>
    Promise.all(
      requests
        .filter((req) => new URL(req.url).pathname.startsWith('/_rex/static/'))
        .map((req) =>
          cache.match(req).then((res) => {
            const cachedAt = Number(res?.headers.get('sw-cached-at'));
            if (!cachedAt || cachedAt < cutoff) return cache.delete(req);
          })
        )
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

  // Immutable assets: Rex bundles (hashed filenames) and uploaded images
  // (UUID filenames). These URLs never change — serve from cache first,
  // fall back to network + cache forever.
  //
  // NOTE: If a recipe image is ever re-processed or edited, the upload
  // endpoint MUST generate a new UUID filename. Never overwrite an
  // existing upload path — the browser and SW will serve the cached
  // version indefinitely.
  const isImmutable = url.pathname.startsWith('/_rex/') || url.pathname.startsWith('/uploads/');

  if (isImmutable) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          // Not in cache — fetch, stamp, store, return.
          return fetch(request).then((response) => {
            // Only cache successful responses — a 404 or 5xx for an
            // immutable URL would be stuck in cache forever since we
            // serve cache-first and never revalidate.
            if (response.ok) {
              const clone = response.clone();
              stampResponse(clone).then((stamped) => {
                cache.put(request, stamped);
                // Only purge stale bundles, not uploads
                if (url.pathname.startsWith('/_rex/')) purgeStaleAssets(cache);
              });
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Network-first for HTML navigation. Falls back to cached version offline,
  // or to the cached homepage as a last resort.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(request)
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
        const networkFetch = fetchWithTimeout(request).then((response) => {
          cache.put(request, response.clone());
          return response;
        });
        return cached ?? networkFetch;
      })
    )
  );
});
