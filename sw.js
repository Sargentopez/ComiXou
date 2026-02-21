/* ComiXow Service Worker */
const CACHE = 'comixow-v1';
const ASSETS = [
  './',
  './index.html',
  './css/main.css',
  './css/home.css',
  './css/auth.css',
  './css/editor.css',
  './css/reader.css',
  './js/i18n.js',
  './js/auth.js',
  './js/auth-pages.js',
  './js/storage.js',
  './js/home.js',
  './js/editor.js',
  './js/reader.js',
  './pages/login.html',
  './pages/register.html',
  './pages/editor.html',
  './pages/reader.html',
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
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
