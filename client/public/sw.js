const STATIC_CACHE = 'aralytics-static-v3';
const MATERIALS_CACHE = 'aralytics-materials-v3';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(['/', '/index.html', '/manifest.json', '/logo.svg'])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('aralytics-') && ![STATIC_CACHE, MATERIALS_CACHE].includes(key)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/@') || url.pathname.startsWith('/src/') || url.pathname.startsWith('/node_modules/') || url.searchParams.has('t')) return;
  // Only explicit lesson downloads can be served offline. Never cache account or assessment APIs.
  if (url.pathname.startsWith('/api/materials/download/')) {
    event.respondWith(caches.open(MATERIALS_CACHE).then(async cache => (await cache.match(request)) || fetch(request)));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async response => {
      if (response.ok) { const cache = await caches.open(STATIC_CACHE); await cache.put('/index.html', response.clone()); }
      return response;
    }).catch(() => caches.match('/index.html')));
    return;
  }
  if (/^\/(assets|images)\//.test(url.pathname) || ['/logo.svg','/manifest.json'].includes(url.pathname)) {
    event.respondWith(caches.open(STATIC_CACHE).then(async cache => {
      const saved = await cache.match(request);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }));
  }
});
