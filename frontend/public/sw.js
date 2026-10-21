// ==============================================================================
// CogniDesk Progressive Web App Service Worker (Module 32)
// Offline App-Shell Caching, Static Asset Acceleration, and Network Fallback
// ==============================================================================

const CACHE_NAME = 'cognidesk-pwa-v1.3';
const MODEL_CACHE_NAME = 'cognidesk-ai-models-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.svg',
  '/icons/pwa-192x192.png',
  '/icons/pwa-512x512.png',
  '/icons/pwa-maskable.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon.png'
];

// Install: Pre-cache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-caching core application shell...');
      try {
        await cache.addAll(STATIC_ASSETS);
      } catch (err) {
        console.warn('[SW] Some non-critical pre-cache assets could not be cached immediately:', err);
      }
      return self.skipWaiting();
    })
  );
});

// Activate: Purge obsolete caches and claim existing clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== MODEL_CACHE_NAME) {
            console.log('[SW] Evicting outdated cache store:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignore unsupported schemes (chrome-extension, etc.)
  if (!url.protocol.startsWith('http')) return;

  // Do not intercept non-GET requests (mutations go directly to network or IndexedDB)
  if (event.request.method !== 'GET') return;

  // 1. Navigation requests (SPA routes like /chat, /notes, /flashcards)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log('[SW] Navigation offline: serving cached app-shell /index.html for', url.pathname);
          const cachedApp = await caches.match('/index.html');
          return cachedApp || caches.match('/');
        })
    );
    return;
  }

  // 2. Static Assets (/assets/*, fonts, images, compiled JS/CSS)
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Return cached immediately, refresh in background (Stale-While-Revalidate)
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. API Requests (/api/*): Network-First with graceful offline fallback
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        console.warn('[SW] API offline:', url.pathname);
        // For status or health endpoints, return structured offline response
        if (url.pathname.includes('/health')) {
          return new Response(
            JSON.stringify({
              status: 'offline',
              offline_mode: true,
              message: 'FastAPI backend unreachable. Offline Local Storage active.',
              services: { api: 'offline', database: 'indexeddb_local', vector_store: 'client_vectors' }
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.pathname.includes('/rag/status')) {
          return new Response(
            JSON.stringify({
              success: true,
              message: 'Running in In-Browser Local AI mode (Offline)',
              data: {
                online: false,
                is_hosted: false,
                is_browser_ai: true,
                models: ['in-browser-extractive', 'webgpu-local'],
                mode_label: 'In-Browser Local Engine (Offline)'
              }
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            success: false,
            offline: true,
            message: 'Network offline. Client Local Storage fallback active.'
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 4. Default: Network with Cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Messages from UI
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
