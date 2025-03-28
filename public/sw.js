importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Enable Workbox debugging in development
workbox.setConfig({ debug: false });

// Cache names
const STATIC_CACHE = 'shed-static-v1';
const DYNAMIC_CACHE = 'shed-dynamic-v1';
const API_CACHE = 'shed-api-v1';

// Precache static assets (updated based on your server file)
workbox.precaching.precacheAndRoute([
  { url: '/', revision: '1' },
  { url: '/admin-login', revision: '1' },
  { url: '/admin-register', revision: '1' },
  { url: '/home', revision: '1' },
  { url: '/admin/sales-form', revision: '1' },
  { url: '/invoices', revision: '1' },
  { url: '/update-stock', revision: '1' },
  { url: '/store-view', revision: '1' },
  { url: '/transactions', revision: '1' },
  { url: '/customers', revision: '1' },
  { url: '/profile', revision: '1' },
  { url: '/create-outlet', revision: '1' },
  { url: '/superadmin/dashboard', revision: '1' },
  { url: '/referrals/login', revision: '1' },
  { url: '/referrals/signup', revision: '1' },
  { url: '/referrals/dashboard', revision: '1' },
  { url: '/outlet-login', revision: '1' },
  { url: '/style.css', revision: '1' },
  { url: '/images/logo.png', revision: '1' },
  { url: '/manifest.json', revision: '1' },
  { url: '/scripts/main.js', revision: '1' },
  { url: '/offline.html', revision: '1' }
], {
  ignoreURLParametersMatching: [/.*/], // Ignore query params for precaching
  cleanUpCache: true
});

// Static assets (CSS, JS, images) - CacheFirst
workbox.routing.registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|css|js)$/,
  new workbox.strategies.CacheFirst({
    cacheName: STATIC_CACHE,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50, // Limit cache size
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// HTML pages - NetworkFirst with offline fallback
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'document',
  new workbox.strategies.NetworkFirst({
    cacheName: DYNAMIC_CACHE,
    networkTimeoutSeconds: 3, // Fallback to cache if network takes >3s
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// API routes (e.g., POST requests, dynamic data) - StaleWhileRevalidate
workbox.routing.registerRoute(
  ({ url }) => url.pathname.startsWith('/invoices/create') ||
               url.pathname.startsWith('/update-stock') ||
               url.pathname.startsWith('/admin/sales-form') ||
               url.pathname.startsWith('/confirm-sale'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: API_CACHE,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 24 * 60 * 60, // 1 day
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// Handle authentication redirects (e.g., 302 to /admin-login)
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'document',
  async ({ event, request }) => {
    try {
      const response = await fetch(request);
      if (response.status === 302 && response.headers.get('Location') === '/admin-login') {
        return caches.match('/admin-login') || fetch('/admin-login');
      }
      return response;
    } catch (error) {
      return caches.match('/offline.html');
    }
  },
  'GET'
);

// Default fallback for unmatched routes
workbox.routing.setDefaultHandler(
  new workbox.strategies.NetworkOnly()
);

// Offline fallback
workbox.routing.setCatchHandler(({ event }) => {
  if (event.request.destination === 'document') {
    return caches.match('/offline.html');
  }
  return Response.error();
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [STATIC_CACHE, DYNAMIC_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of clients immediately
  );
});