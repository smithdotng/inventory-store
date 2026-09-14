importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

workbox.setConfig({ debug: false });

const STATIC_CACHE  = 'shed-static-v2';
const DYNAMIC_CACHE = 'shed-dynamic-v2';
const API_CACHE     = 'shed-api-v2';

// Precache core static assets
workbox.precaching.precacheAndRoute([
  { url: '/admin-login',    revision: '2' },
  { url: '/admin-register', revision: '2' },
  { url: '/verify-email',   revision: '2' },
  { url: '/offline.html',   revision: '2' },
  { url: '/manifest.json',  revision: '2' },
  { url: '/android-chrome-192x192.png', revision: '2' },
  { url: '/android-chrome-512x512.png', revision: '2' },
], {
  ignoreURLParametersMatching: [/.*/],
  cleanUpCache: true
});

// Static assets (CSS, JS, images) — CacheFirst, 30 days
workbox.routing.registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|woff2?)$/,
  new workbox.strategies.CacheFirst({
    cacheName: STATIC_CACHE,
    plugins: [
      new workbox.expiration.ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
);

// HTML pages — NetworkFirst with offline fallback
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'document',
  new workbox.strategies.NetworkFirst({
    cacheName: DYNAMIC_CACHE,
    networkTimeoutSeconds: 4,
    plugins: [
      new workbox.expiration.ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 7 * 24 * 60 * 60 }),
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
);

// Key app routes — StaleWhileRevalidate for snappy loads
workbox.routing.registerRoute(
  ({ url }) => ['/inventory', '/invoices', '/pos', '/transactions', '/customers', '/profile'].some(p => url.pathname.startsWith(p)),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: API_CACHE,
    plugins: [
      new workbox.expiration.ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 }),
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
);

// Fallback handler
workbox.routing.setDefaultHandler(new workbox.strategies.NetworkOnly());

// Offline fallback for navigation
workbox.routing.setCatchHandler(({ event }) => {
  if (event.request.destination === 'document') {
    return caches.match('/offline.html');
  }
  return Response.error();
});

// Clean up old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  const keep = [STATIC_CACHE, DYNAMIC_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => !keep.includes(n)).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Allow pages to trigger SW update without waiting for tab close
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
