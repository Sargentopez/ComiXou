/* ComiXow Service Worker — SPA */
const CACHE = 'comixow-v4-11';
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
  './js/reader.js',
  './js/admin.js',
  './js/seed.js',
  './js/router.js',
  './js/fullscreen.js',
  './js/my-comics.js',
  './js/views.js',
  './js/pwa.js',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // SPA: cualquier navegación devuelve index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('./index.html'));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
