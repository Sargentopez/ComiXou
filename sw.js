/* ComiXow Service Worker — SPA */
const CACHE = 'comixow-v16-61';

// Solo cacheamos assets estáticos que no cambian con cada versión (imágenes)
// JS, CSS y HTML son siempre network-first para garantizar actualizaciones inmediatas
const STATIC_ASSETS = [
  './icon-192.png',
  './icon-512.png',
  './logo_long.png',
];

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // No interceptar el reproductor externo — tiene su propia lógica
  if (url.includes('/reader/')) return;

  // HTML, JS y CSS: network-first siempre — nunca servir versión antigua
  if (url.match(/\.(html|js|css)(\?|$)/) || e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return r;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Imágenes y otros assets estáticos: cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
