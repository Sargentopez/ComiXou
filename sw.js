/* Comxow/COMXOW, creada por A. Gavina Costero  2026, albertobicho@gmail.com */
/*
 * Librerías y código de terceros utilizados en este proyecto:
 *
 * - omggif (GIF encoder/decoder)
 *     Autor: Dean McNamee <dean@gmail.com>
 *     Licencia: MIT
 *     https://github.com/deanm/omggif
 *
 * - pako (compresión zlib/gzip)
 *     Autores: Andrei Tuputcyn, Vitaly Puzrin y colaboradores (Nodeca project)
 *     Licencia: MIT
 *     https://github.com/nodeca/pako
 *
 * - UPNG.js (codificador/decodificador PNG)
 *     Autor: Ivan Kutskir
 *     Licencia: MIT
 *     https://github.com/photopea/UPNG.js
 *
 * - LZW decompression (puerto JavaScript de implementación Java)
 *     Referencia original: https://gist.github.com/devunwired/4479231
 *     Licencia: dominio público / uso libre
 */
/* ComXow Service Worker — SPA */
const CACHE = 'comixow-v31-55';

// Solo cacheamos assets estáticos que no cambian con cada versión (imágenes)
// JS, CSS y HTML son siempre network-first para garantizar actualizaciones inmediatas
const STATIC_ASSETS = [
  './icon-192.png',
  './icon-512.png',
  './icon.svg',
  './logo.svg',
  // Fuentes WOFF2 autoalojadas — precacheadas para funcionar offline/sin conexión
  './fonts/Bangers-Regular.woff2',
  './fonts/BebasNeue-Regular.woff2',
  './fonts/ComicNeue-Bold.woff2',
  './fonts/ComicNeue-Regular.woff2',
  './fonts/Lora-Italic-Variable.woff2',
  './fonts/Lora-Variable.woff2',
  './fonts/Nunito-Italic-Variable.woff2',
  './fonts/Nunito-Variable.woff2',
  './fonts/Oswald-Variable.woff2',
  './fonts/PatrickHand-Regular.woff2',
  './fonts/PermanentMarker-Regular.woff2',
  './fonts/PressStart2P-Regular.woff2',
  './fonts/fonts.css',
];

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', e => {
  // skipWaiting inmediato: JS/CSS son network-first, no hay riesgo de assets inconsistentes.
  // Sin esto, en Android como PWA instalada el SW nuevo queda en "waiting" indefinidamente
  // si el tab anterior sigue abierto (cx_editing bloqueaba pwa.js).
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // clients.claim(): el SW nuevo toma control de todos los tabs abiertos inmediatamente.
  // Sin esto, el tab Android con el SW viejo nunca recibe el nuevo SW hasta que recarga.
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
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
