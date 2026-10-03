const STATIC_CACHE = 'aralytics-static-v2';
const MATERIALS_CACHE = 'aralytics-materials-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.svg'
];

// STRICT ONLINE ROUTES - Never served from cache, network only, fails when offline
const STRICTLY_ONLINE_PATTERNS = [
  /\/api\/quizzes/,
  /\/api\/proctoring/,
  /\/api\/submissions/,
  /\/api\/export/,
  /\/api\/teacher/,
  /\/api\/student\/quizzes/
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[ServiceWorker] Pre-caching core app shell');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== MATERIALS_CACHE) {
            console.log('[ServiceWorker] Removing stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 0. VITE DEV SERVER & EXTENSIONS BYPASS: Never intercept dev server files or hot reloads
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.searchParams.has('t') ||
    url.pathname.includes('hot-update') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return;
  }

  // 1. BOUNDARY CHECK: STRICTLY ONLINE ROUTES
  const isStrictlyOnline = STRICTLY_ONLINE_PATTERNS.some((pattern) => pattern.test(url.pathname));

  if (isStrictlyOnline) {
    // Strictly Online: Always bypass cache directly to network.
    // If offline, return explicit 503 error header to preserve assessment integrity.
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            success: false,
            offline_blocked: true,
            message: 'STRICT ONLINE POLICY: Assessment, live proctoring, and gradebook operations require active internet connection.'
          }),
          {
            status: 503,
            statusText: 'Service Unavailable (Offline Boundary)',
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // 2. OFFLINE-CAPABLE INSTRUCTIONAL MATERIALS (CacheFirst / StaleWhileRevalidate)
  if (request.method === 'GET' && (url.pathname.startsWith('/api/materials/download/') || url.pathname.startsWith('/api/materials'))) {
    event.respondWith(
      caches.open(MATERIALS_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          // Trigger background update if online
          fetch(request).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              cache.put(request, networkRes.clone());
            }
          }).catch(() => {});
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Material not yet cached for offline access. Connect to internet once to download.'
            }),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        });
      })
    );
    return;
  }

  // 3. SPA CLIENT NAVIGATION FALLBACK (FR-49, NFR-02)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cachedIndex = await cache.match('/index.html');
        return cachedIndex || new Response(
          '<!DOCTYPE html><html><body><h2>Offline Mode - Aralytics</h2><p>Paki-konekta sa internet upang ma-load ang paunang pahina.</p></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      })
    );
    return;
  }

  // 4. APP SHELL & STATIC ASSETS (StaleWhileRevalidate)
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const resClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, resClone));
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      }).catch(async () => {
        return new Response('', { status: 404 });
      })
    );
  }
});
