const CACHE_NAME = 'shed-app-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/admin-login',
  '/admin-register',
  '/home',
  '/admin-sales-form',
  '/admin-sales-confirmation',
  '/confirm-transaction',
  '/create-outlet',
  '/customer-details',
  '/customers',
  '/dispense-to-outlet',
  '/edit-customer',
  '/home',
  '/invoices',
  '/outlet-customers',
  '/outlet-details',
  '/outlet-login',
  '/outlet-sales-form',
  '/outlet-stock-view',
  '/outlet-transactions',
  '/profile',
  '/referrals-dashboard',
  '/referrals-login',
  '/referrals-signup',
  '/reset-password',
  '/sale-success',
  '/store-view',
  '/superadmin-dashboard',
  '/update-stock',
  '/store-view',
  '/transactions',
  '/invoices',
  '/customers',
  '/profile',
  '/style.css',
  '/images/logo.png',
  '/site.webmanifest',
  '/manifest.json',
  '/scripts/main.js',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached response if found
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise fetch from network
        return fetch(event.request).then((response) => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache the new response
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // If both cache and network fail, show a fallback
          return caches.match('/offline.html');
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});