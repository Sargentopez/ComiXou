/* ComiXow Service Worker — SPA */
const CACHE = 'comixow-v20-20';

// Solo cacheamos assets verdaderamente estáticos (iconos que nunca cambian)
// JS, CSS y HTML NO se cachean — el navegador gestiona su caché HTTP normal
// Esto garantiza que el usuario siempre reciba la versión más reciente sin vaciar caché
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
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => {
        // Notificar a todas las pestañas abiertas → recargar para usar nueva versión
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
      })
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Ignorar requests con esquemas no cacheables (chrome-extension, moz-extension, etc.)
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  // No interceptar el reproductor externo — tiene su propia lógica
  if (url.includes('/reader/')) return;

  // JS, CSS y HTML: pasar directo a la red — no cachear en el SW
  // El navegador gestiona su propia caché HTTP con los headers del servidor (GitHub Pages)
  // Esto garantiza actualizaciones automáticas sin vaciar caché manualmente
  if (url.match(/\.(html|js|css)(\?|$)/) || e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Imágenes y otros assets estáticos: cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
