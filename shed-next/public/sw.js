/* Shed service worker (v3, Next.js app).
 * - Removes the caches left by the old Express/Workbox worker (shed-*-v2).
 * - Network-first for pages with an offline fallback; cache-first for static assets.
 * No third-party scripts. */
const VERSION = 'shed-v3';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE, '/android-chrome-192x192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API, auth, payments or PDFs.
  if (/^\/(api|admin-|shopper|billing|cart|webhooks|dashboard\/sales\/.+\/pdf)/.test(url.pathname) || url.pathname.endsWith('.pdf')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !url.pathname.startsWith('/dashboard')) caches.open(PAGES).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE))),
    );
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
  }
});
