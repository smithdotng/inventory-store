/* Shed service worker (v4).
 *
 * Strategy
 *  - Pages (navigations): network first. Public marketplace pages are kept so they
 *    still open offline; private pages (dashboard, account, checkout, outlet
 *    portal…) are never stored. Offline with nothing cached → /offline.html.
 *  - Next.js build files (/_next/static, content-hashed): cache first.
 *  - Images (product photos, logos, icons): stale-while-revalidate, capped.
 *  - API calls, form posts, payments, PDFs and uploads of new files: never touched.
 *  - Signing out clears stored pages so nobody's name lingers offline.
 *
 * Updates: a new worker waits until the page asks it to take over (the
 * "Update available" banner), so a running sale is never interrupted.
 */
const VERSION = 'shed-v4';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const IMAGES = `${VERSION}-images`;
const OFFLINE = '/offline.html';
const PRECACHE = [OFFLINE, '/brand/shed-logo.png', '/brand/shed-mark.png', '/android-chrome-192x192.png', '/favicon-32x32.png'];
const MAX_PAGES = 40;
const MAX_IMAGES = 200;

// Never cache these (private, personalised or one-off).
const PRIVATE = /^\/(api|dashboard|outlet-portal|shopper|cart|checkout|billing|webhooks|launch|admin-|forgot-password|reset-password|setup-account|verify-email|account-locked|referrals|outlet-login|outlet-logout|handle-link|public-invoice|uploads\/.*\.pdf)|\/(checkout|order)(\/|$)|\.pdf$/;
const LOGOUT = /^\/(admin-logout|shopper\/logout|outlet-logout|referrals\/logout)/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)));
  // No skipWaiting() here — the page decides when to switch (see message handler).
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Also removes the old Express/Workbox caches (shed-*-v2, workbox-*).
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_PAGES') event.waitUntil(caches.delete(PAGES));
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function handleNavigation(event, url) {
  const req = event.request;
  if (LOGOUT.test(url.pathname)) {
    await caches.delete(PAGES);
    return fetch(req);
  }
  const cacheable = !PRIVATE.test(url.pathname);
  try {
    const res = (await event.preloadResponse) || (await fetch(req));
    // Only store complete, public HTML pages (not redirects to login etc.).
    if (cacheable && res.ok && res.type === 'basic' && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) {
      const copy = res.clone();
      event.waitUntil(caches.open(PAGES).then((c) => c.put(url.pathname + url.search, copy)).then(() => trim(PAGES, MAX_PAGES)));
    }
    return res;
  } catch {
    const cached = cacheable && ((await caches.match(url.pathname + url.search, { cacheName: PAGES })) || (await caches.match(url.pathname, { cacheName: PAGES })));
    return cached || (await caches.match(OFFLINE)) || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(event, url));
    return;
  }

  // Next.js data requests for client-side navigation (RSC) — always live.
  if (req.headers.get('RSC') || url.searchParams.has('_rsc')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (/\.(png|jpe?g|webp|gif|svg|ico|avif)$/i.test(url.pathname) && !url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(IMAGES).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone()).then(() => trim(IMAGES, MAX_IMAGES));
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});
