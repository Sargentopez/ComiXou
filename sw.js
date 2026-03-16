/* ComiXow Service Worker — SPA */
const CACHE = 'comixow-v7-46';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/home.css',
  './css/auth.css',
  './css/editor.css',
  './css/reader.css',
  './css/admin.css',
  './js/utils.js',
  './js/i18n.js',
  './js/auth.js',
  './js/auth-pages.js',
  './js/storage.js',
  './js/genres.js',
  './js/header.js',
  './js/home.js',
  './js/editor.js',
  './js/editor-pages.js',
  './js/editor-layers.js',
  './js/reader.js',
  './js/admin.js',
  './js/seed.js',
  './js/router.js',
  './js/fullscreen.js',
  './js/my-comics.js',
  './js/views.js',
  './js/pwa.js',
  './js/supabase-client.js',
  './reader/index.html',
  './reader/reader.css',
  './reader/reader.js',
  './pages/reader.html',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
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

  // SPA: navegaciones devuelven index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // JS y CSS: network-first — siempre intenta red, actualiza caché, fallback a caché
  if (url.match(/\.(js|css)(\?|$)/)) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Resto (imágenes, fuentes, etc.): cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
