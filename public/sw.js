const CACHE_NAME = 'noblocks-pwa-v3';
const RUNTIME_CACHE = 'noblocks-runtime-v3';
const OFFLINE_URL = '/offline.html';

// Static assets to cache immediately
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/',
  '/icons/android-chrome-192x192.png',
  '/icons/android-chrome-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32x32.png',
  '/icons/favicon-16x16.png',
  '/favicon.ico',
  '/manifest.json',
  '/screenshots/desktop-wide.png',
  '/screenshots/mobile-narrow.png'
];

// Routes that should always fetch from network first
const NETWORK_FIRST_ROUTES = [
  /\/api\//,
  /\/_next\/static/,
];

// Routes that should use cache first
const CACHE_FIRST_ROUTES = [
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
  /\.(?:css|js)$/,
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests
  if (url.origin !== location.origin) return;

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful navigation requests
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Return cached page or offline page
          return caches.match(request)
            .then(response => response || caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // Network first strategy for API calls
  if (NETWORK_FIRST_ROUTES.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache first strategy for static assets
  if (CACHE_FIRST_ROUTES.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) return response;
          
          return fetch(request)
            .then(response => {
              if (response.status === 200) {
                const responseClone = response.clone();
                caches.open(RUNTIME_CACHE)
                  .then(cache => cache.put(request, responseClone));
              }
              return response;
            });
        })
    );
    return;
  }

  // Default: try cache first, then network
  event.respondWith(
    caches.match(request)
      .then(response => response || fetch(request))
  );
});

// Handle background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// Handle push notifications
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icons/android-chrome-192x192.png',
      badge: '/icons/favicon-32x32.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.primaryKey || 1
      },
      actions: [
        {
          action: 'explore',
          title: 'View Details',
          icon: '/icons/favicon-32x32.png'
        },
        {
          action: 'close',
          title: 'Close',
          icon: '/icons/favicon-32x32.png'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Noblocks', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

async function doBackgroundSync() {
  // Implement background sync logic here
  // This could be used for offline transaction queuing
  console.log('Background sync triggered');
} 