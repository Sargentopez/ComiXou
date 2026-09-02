/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
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
 *
 * - Trix (editor de texto enriquecido)
 *     Autor: 37signals, LLC (Basecamp) — Javan Makhmali y Sam Stephenson
 *     Licencia: MIT
 *     https://trix-editor.org/  ·  https://github.com/basecamp/trix
 */
/* ============================================================
   home.js — Lógica de la página de inicio
   ============================================================ */

let activeFilter       = { type: null, value: null }; // tipo: 'genre' | 'author' | null

// ── ESTADO DE PAGINACIÓN DEL EXPOSITOR ──────────────────────────────────
// Rediseño completo (antes: _loadPublishedWorks traía TODAS las obras
// publicadas de golpe con una única llamada, y las guardaba enteras en
// memoria). Petición explícita de Alberto: en el futuro puede haber miles
// de obras publicadas, así que ni tiene sentido esperar a tenerlas todas
// para considerar la página "cargada", ni mantenerlas todas en memoria a
// la vez. Ver la carta de esta versión para la investigación completa
// (paginación por cursor, scroll infinito con Intersection Observer,
// virtualización de listas) — el patrón es el mismo que usan Stripe,
// GitHub o Twitter para listados que pueden crecer sin límite.
let _homeWorks          = [];     // obras ya traídas (crecen con el scroll) — NO son todas las que existen
let _homeCursor         = null;   // cursor keyset del último item traído: {updatedAt, id} — ver fetchPublishedWorksPage
let _homeHasMore        = true;   // si el filtro actual puede tener más páginas
let _homeLoadingMore    = false;  // evita disparos duplicados del observer de scroll infinito
let _homeMoreError      = false;  // fallo cargando una página SIGUIENTE (aviso puntual, sin borrar lo ya visible)
let _homeConfirmedRemote = false; // true tras la primera página remota resuelta con éxito — a partir de aquí se ignoran los cambios locales (ver _onStoreChange)
let _homeFacets         = null;   // {genre, username} de TODAS las obras publicadas (sin miniaturas) — para el menú de Filtros, ver _homeLoadFacets
let _homeBatches        = [];     // lotes renderizados/virtualizados: [{el, items, loaded, height}] — ver _homeAppendBatch
let _homeVisObserver    = null;   // virtualización: descarga/recarga lotes según se alejan/acercan de la pantalla
let _homeBottomObserver = null;   // scroll infinito: dispara _homeLoadNextPage al acercarse al final
let _homeRefreshTimer   = null;   // intervalo de actualización periódica
let _homeLastFetch      = 0;      // timestamp de la última carga
const _HOME_REFRESH_MS       = 5 * 60 * 1000; // 5 minutos
const _HOME_PAGE_SIZE         = 20;   // obras por página — de sobra para llenar cualquier pantalla razonable de una vez
const _HOME_MAX_INITIAL_PAGES = 8;    // tope de seguridad al "rellenar pantalla" al entrar (pantallas MUY altas/con zoom alejado)
// true si la carga INICIAL (la que tapa la animación de bienvenida) ha
// FALLADO del todo (sin conexión, timeout, Supabase no disponible...) — para
// que, si al final no hay ninguna obra que mostrar, el aviso pueda decir que
// la carga falló en vez de "todavía no hay obras publicadas" (que es una
// afirmación sobre el contenido, no sobre si se ha podido comprobar).
// A propósito NO se recuerda ninguna caché local para mostrarla en su lugar
// si la carga real falla — el expositor debe reflejar siempre el estado
// real del servidor al accederse, nunca una lista que podría estar
// desactualizada (obra editada/despublicada desde entonces).
let _homeLoadError      = false;

// Tiempo máximo que se espera CADA página individual antes de darla por
// fallida (ver _homeLoadNextPage). Generoso a propósito: una página puede
// suponer DOS peticiones _get seguidas en supabase-client.js (obras +
// miniaturas de resguardo), cada una con su propio límite de 8s — en el
// peor caso legítimo (sin fallo real, solo lento) podría rondar los 16s.
const _HOME_PAGE_TIMEOUT_MS = 15000;

// Tiempo máximo TOTAL que se hace esperar a la ANIMACIÓN DE BIENVENIDA
// (#cxIntro en index.html) mientras se intenta rellenar la pantalla al
// entrar — pasado este tiempo, se deja de esperar y se entra con lo que
// haya (aunque no sea toda la pantalla), tal como pidió Alberto: la
// animación no debe bloquear la app si no hay conexión o va muy lenta. La
// propia ventana de bienvenida tiene su red de seguridad de último recurso
// puesta ALGO por encima de este mismo número (ver HOME_LOAD_TIMEOUT_MS en
// index.html) para el caso, ya extremo, de que ni siquiera esto llegara a
// dispararse.
const _HOME_LOAD_TIMEOUT_MS = 10000;

// BUG CORREGIDO (reportado por Alberto: la animación de bienvenida
// terminaba y aparecía index sin obras, con el aviso de "no se han podido
// cargar las obras" pese a tener internet perfectamente — bastaba con
// tocar "Publicados" para que cargaran bien). Causa: _homeStartLoading
// hacía un ÚNICO intento acotado a _HOME_LOAD_TIMEOUT_MS (10s) y, si no
// terminaba a tiempo, se daba por vencida sin más — un intento algo lento
// (Supabase recién despertando, red puntualmente cargada) se confundía con
// "no hay conexión". Ahora la carga INICIAL (ver _homeStartInitialLoad)
// reintenta automáticamente, como si se tocara "Publicados" una y otra
// vez, con espera creciente entre intentos (mismo patrón de backoff
// exponencial que usan los SDK de AWS/Stripe/Google Cloud para no
// machacar un servidor que ya está teniendo problemas) — y solo se rinde
// del todo cuando pasa este presupuesto total de tiempo O se confirma con
// navigator.onLine que de verdad no hay red (lo que ocurra antes).
const _HOME_INITIAL_RETRY_BUDGET_MS = 45000;
const _HOME_RETRY_BACKOFF_MS = [1500, 3000, 6000, 6000, 6000]; // se repite el último tramo si hacen falta más intentos

// Aplica un límite de tiempo a cualquier promesa: si no se resuelve antes,
// rechaza con un error claro en vez de dejar la espera abierta para
// siempre.
function _withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${ms}ms)`)), ms)),
  ]);
}

// Invalida el estado del expositor para forzar una recarga completa desde
// cero la próxima vez que se entre a "home". Llamada desde my-works.js
// tras unpublish/delete.
function homeInvalidateCache() {
  _homeWorks = [];
  _homeCursor = null;
  _homeHasMore = true;
  _homeConfirmedRemote = false;
}

// ── Punto de entrada SPA ──

/* Refresco reactivo cuando WorkStore emite cx:store — SOLO mientras no
   haya datos remotos confirmados (ver _homeConfirmedRemote): en cuanto la
   primera página de Supabase llega bien, Supabase pasa a ser la única
   fuente de verdad y los cambios en localStorage se ignoran aquí. */
function _onStoreChange(e) {
  if (!document.getElementById('worksGrid')) return;
  if (_homeConfirmedRemote) return;
  _homeRenderLocalFallback();
}

// Render simple, SIN paginar ni virtualizar, directamente desde el
// almacén local — solo para el caso en que Supabase no esté disponible en
// absoluto (ver _homeStartLoading). Al ser un caso degradado/excepcional
// (no la vía normal con miles de obras), no necesita nada de lo anterior.
function _homeRenderLocalFallback() {
  const grid  = document.getElementById('worksGrid');
  const empty = document.getElementById('emptyState');
  if (!grid || !empty) return;
  const source = typeof WorkStore !== 'undefined' ? WorkStore.getPublished() : [];
  let comics = [...source].sort((a, b) => new Date(b.updatedAt||0) - new Date(a.updatedAt||0));
  if (activeFilter.type === 'genre')  comics = comics.filter(c => c.genre === activeFilter.value);
  if (activeFilter.type === 'author') comics = comics.filter(c => c.username === activeFilter.value);
  if (activeFilter.type === 'title')  comics = comics.filter(c => c.title === activeFilter.value);

  grid.innerHTML = '';
  if (comics.length === 0) {
    empty.classList.remove('hidden');
    _homeRenderEmptyState(empty);
    return;
  }
  empty.classList.add('hidden');
  const currentUser = Auth.currentUser();
  comics.forEach(comic => {
    try { grid.appendChild(buildRow(comic, currentUser)); }
    catch(e) { console.error('buildRow error:', e, comic); }
  });
  if (typeof window._adjustSpacingNow === 'function') window._adjustSpacingNow();
}

function HomeView_init() {
  window.addEventListener('cx:store', _onStoreChange);

  setupPageNav();
  _homeLoadFacets();          // universo de géneros/autores para el menú de Filtros (en paralelo, no bloquea)
  _homeStartInitialLoad();    // primera página(s) + scroll infinito + virtualización — con reintento automático, ver más abajo

  // Actualización periódica cada 5 minutos — solo si la persona sigue
  // prácticamente al principio del listado (una sola página cargada): con
  // más ya recorridas, recargar desde cero le resetearía el scroll de
  // golpe, así que se deja para cuando vuelva a "Novedades" o reabra la app.
  _homeRefreshTimer = setInterval(() => {
    if (!document.getElementById('worksGrid')) { _homeStopRefresh(); return; }
    if (_homeWorks.length <= _HOME_PAGE_SIZE) _homeStartLoading();
  }, _HOME_REFRESH_MS);

  // Al volver al foco: igual, solo si sigue en la primera página.
  window._homeVisibilityFn = () => {
    if (document.visibilityState !== 'visible') return;
    if (!document.getElementById('worksGrid')) return;
    if (Date.now() - _homeLastFetch > _HOME_REFRESH_MS && _homeWorks.length <= _HOME_PAGE_SIZE) {
      _homeStartLoading();
    }
  };
  document.addEventListener('visibilitychange', window._homeVisibilityFn);

  // Limpiar al salir de la vista
  window._homeStoreCleanup = () => {
    window.removeEventListener('cx:store', _onStoreChange);
    _homeStopRefresh();
    if (_homeVisObserver) { _homeVisObserver.disconnect(); _homeVisObserver = null; }
    if (_homeBottomObserver) { _homeBottomObserver.disconnect(); _homeBottomObserver = null; }
  };
}

function _homeStopRefresh() {
  if (_homeRefreshTimer) { clearInterval(_homeRefreshTimer); _homeRefreshTimer = null; }
  if (window._homeVisibilityFn) {
    document.removeEventListener('visibilitychange', window._homeVisibilityFn);
    window._homeVisibilityFn = null;
  }
}

// Universo completo de géneros/autores publicados (ligera: sin miniaturas,
// sin paginar) para el menú de Filtros — ver fetchPublishedFacets en
// supabase-client.js. Deliberadamente aparte de las obras paginadas: el
// menú de Filtros tiene que poder ofrecer un género/autor aunque sus obras
// aún no se hayan cargado en pantalla.
async function _homeLoadFacets() {
  if (typeof SupabaseClient === 'undefined' || typeof SupabaseClient.fetchPublishedFacets !== 'function') return;
  try {
    _homeFacets = await _withTimeout(SupabaseClient.fetchPublishedFacets(), _HOME_PAGE_TIMEOUT_MS);
  } catch(e) {
    console.error('Error cargando géneros/autores para Filtros:', e);
  }
}

// ── CARGA INICIAL: rellena la pantalla, no espera a "todas" ─────────────
// Petición explícita de Alberto: la pantalla debe considerarse "cargada"
// en cuanto tenga obras suficientes para llenarla, no cuando se hayan
// traído absolutamente todas (que, con miles, ni tendría sentido). Se
// van pidiendo páginas de _HOME_PAGE_SIZE mientras el centinela de scroll
// infinito (ver _ensureSentinel) siga a la vista — en cuanto deja de estarlo
// (ya hay de sobra para llenar el hueco visible) o se acaban las obras, se
// para y se avisa a la ventana de bienvenida de que ya puede ocultarse.
//
// signalSplash=false (usado solo por _homeStartInitialLoad, ver más abajo):
// hace exactamente el mismo intento pero SIN avisar a la ventana de
// bienvenida al final — necesario para poder reintentar varias veces
// seguidas sin que el primer intento fallido la cierre ya. El resto de
// llamantes (botón "Publicados", refresco periódico, cambio de pestaña)
// siguen igual que siempre, con el valor por defecto.
async function _homeStartLoading(signalSplash = true) {
  if (_homeVisObserver) _homeVisObserver.disconnect();
  if (_homeBottomObserver) _homeBottomObserver.disconnect();
  _homeWorks = [];
  _homeCursor = null;
  _homeHasMore = true;
  _homeLoadError = false;
  _homeMoreError = false;
  _homeBatches = [];
  const grid = document.getElementById('worksGrid');
  if (grid) grid.innerHTML = '';
  _ensureSentinel();
  _ensureObservers();

  try {
    await _withTimeout(_homeFillScreen(), _HOME_LOAD_TIMEOUT_MS);
  } catch(e) {
    console.error('Error en la carga inicial de obras:', e);
    // Si el tiempo se agota a mitad de una página, esa petición sigue su
    // curso en segundo plano (no se cancela, ver _withTimeout) pero se deja
    // de esperarla aquí — entrar con lo que ya hubiera es mejor que dejar
    // la animación de bienvenida bloqueada indefinidamente.
  }
  _homeUpdateEmptyState();
  // Ventana de bienvenida (#cxIntro en index.html): la pantalla ya tiene
  // obras suficientes para considerarse cargada (o se ha desistido tras el
  // tiempo máximo) — ya se puede ocultar la ventana si la persona ya había
  // aceptado las condiciones antes (ver router.js, que hace lo mismo para
  // el resto de vistas justo tras su init síncrono).
  if (signalSplash && typeof window._cxSplashReady === 'function') window._cxSplashReady();
}

// Envoltorio SOLO para la carga inicial (ver HomeView_init) — reintenta
// _homeStartLoading tal cual como si se tocara el botón "Publicados" una y
// otra vez, con espera creciente entre intentos, hasta que:
//   a) haya obras (o se confirme, sin error, que de verdad no hay ninguna
//      publicada — eso no es un fallo, no hay nada que reintentar), o
//   b) se agote _HOME_INITIAL_RETRY_BUDGET_MS (tiempo racional total), o
//   c) navigator.onLine confirme que no hay red — false es una señal
//      fiable del propio navegador; true NO garantiza conexión real (puede
//      haber wifi sin internet), por eso no basta por sí sola y se combina
//      con el tiempo total ya invertido.
// Solo entonces se avisa a la ventana de bienvenida — mientras tanto sigue
// tapada (y su animación, en bucle propio, se sigue viendo reproducirse).
async function _homeStartInitialLoad() {
  const _startedAt = Date.now();
  let _attempt = 0;
  while (true) {
    await _homeStartLoading(false);
    if (_homeWorks.length > 0 || !_homeLoadError) break; // éxito, o de verdad no hay obras — no es un fallo que reintentar
    const _elapsed = Date.now() - _startedAt;
    const _confirmedOffline = navigator.onLine === false;
    if (_elapsed >= _HOME_INITIAL_RETRY_BUDGET_MS || _confirmedOffline) break;
    const _wait = _HOME_RETRY_BACKOFF_MS[Math.min(_attempt, _HOME_RETRY_BACKOFF_MS.length - 1)];
    await new Promise(r => setTimeout(r, _wait));
    _attempt++;
  }
  if (typeof window._cxSplashReady === 'function') window._cxSplashReady();
}

async function _homeFillScreen() {
  let pages = 0;
  while (_homeHasMore && pages < _HOME_MAX_INITIAL_PAGES) {
    const ok = await _homeLoadNextPage();
    pages++;
    if (!ok || !_homeScreenNeedsMore()) break;
  }
}

// ¿Sigue habiendo hueco visible por debajo de la última obra cargada? Si
// el centinela de scroll infinito ya está dentro de la ventana visible (o
// muy cerca), la pantalla NO está aún llena — hace falta otra página más
// antes de considerar la carga inicial terminada.
function _homeScreenNeedsMore() {
  const sentinel = document.getElementById('homeSentinel');
  if (!sentinel) return false;
  const rect = sentinel.getBoundingClientRect();
  return rect.top < window.innerHeight * 1.5;
}

// ── SCROLL INFINITO ──────────────────────────────────────────────────
// Un único centinela (elemento vacío) al final del listado, observado con
// Intersection Observer — patrón estándar (Twitter, GitHub, Stripe...): en
// vez de escuchar el evento "scroll" (se dispara constantemente, cuesta
// caro recalcular en cada frame), el navegador avisa solo cuando el
// centinela entra en la zona observada. rootMargin lo adelanta unos
// cuantos px por debajo de la pantalla real, para pedir la página
// siguiente ANTES de que la persona llegue a ver el hueco vacío.
function _ensureSentinel() {
  const grid = document.getElementById('worksGrid');
  if (!grid) return;
  let sentinel = document.getElementById('homeSentinel');
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'homeSentinel';
    sentinel.style.cssText = 'height:1px;';
  }
  grid.appendChild(sentinel); // si ya existía, esto lo MUEVE al final (no lo duplica)

  let indicator = document.getElementById('homeLoadMoreIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'homeLoadMoreIndicator';
    indicator.className = 'home-loadmore hidden';
  }
  grid.appendChild(indicator);
}

function _homeSetLoadingMoreUI(state) {
  const indicator = document.getElementById('homeLoadMoreIndicator');
  if (!indicator) return;
  if (state === 'loading') {
    indicator.classList.remove('hidden');
    indicator.textContent = I18n.t('loadingMoreWorks');
  } else if (state === 'error') {
    indicator.classList.remove('hidden');
    indicator.textContent = '';
    indicator.append(I18n.t('loadMoreError') + ' ');
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'home-loadmore-retry';
    retryBtn.textContent = I18n.t('retryLoadMore');
    retryBtn.addEventListener('click', () => {
      _homeHasMore = true;
      _homeMoreError = false;
      _homeLoadNextPage();
    });
    indicator.appendChild(retryBtn);
  } else {
    indicator.classList.add('hidden');
  }
}

function _ensureObservers() {
  if (!_homeBottomObserver) {
    _homeBottomObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && _homeHasMore && !_homeLoadingMore) _homeLoadNextPage();
      });
    }, { root: null, rootMargin: '400px 0px', threshold: 0 });
  }
  const sentinel = document.getElementById('homeSentinel');
  if (sentinel) _homeBottomObserver.observe(sentinel);

  if (!_homeVisObserver) {
    // Margen de varias alturas de pantalla: los lotes se descargan solo
    // cuando quedan BIEN lejos de la vista, no nada más salir del
    // viewport exacto — así no se penaliza un scroll normal de ida y
    // vuelta con recargas constantes (ver _homeUnloadBatch/_homeLoadBatch).
    const margin = Math.max(600, Math.round(window.innerHeight * 2));
    _homeVisObserver = new IntersectionObserver(_homeVisibilityCallback, {
      root: null, rootMargin: `${margin}px 0px`, threshold: 0,
    });
  }
}

async function _homeLoadNextPage() {
  if (_homeLoadingMore || !_homeHasMore) return true;
  _homeLoadingMore = true;
  _homeSetLoadingMoreUI(_homeWorks.length ? 'loading' : null);
  try {
    if (typeof SupabaseClient === 'undefined' || typeof SupabaseClient.fetchPublishedWorksPage !== 'function') {
      throw new Error('SupabaseClient.fetchPublishedWorksPage no disponible');
    }
    const filterOpts = {};
    if (activeFilter.type === 'genre')  filterOpts.genre  = activeFilter.value;
    if (activeFilter.type === 'author') filterOpts.author = activeFilter.value;
    if (activeFilter.type === 'title')  filterOpts.title  = activeFilter.value;
    const page = await _withTimeout(
      SupabaseClient.fetchPublishedWorksPage(_homeCursor, filterOpts),
      _HOME_PAGE_TIMEOUT_MS
    );
    _homeWorks = _homeWorks.concat(page.items);
    _homeCursor = page.nextCursor;
    _homeHasMore = page.hasMore;
    _homeMoreError = false;
    _homeConfirmedRemote = true;
    _homeLastFetch = Date.now();
    if (page.items.length) _homeAppendBatch(page.items);
    _homeSetLoadingMoreUI(null);
    return true;
  } catch(e) {
    console.error('Error cargando obras (página):', e);
    if (_homeWorks.length === 0) {
      _homeLoadError = true; // era la primera página: fallo total, ver _homeUpdateEmptyState
    } else {
      _homeMoreError = true; // ya había obras buenas en pantalla: solo avisar, no borrar nada
      _homeSetLoadingMoreUI('error');
    }
    _homeHasMore = false; // no seguir reintentando solo — ver el botón "Reintentar" de _homeSetLoadingMoreUI
    return false;
  } finally {
    _homeLoadingMore = false;
  }
}

// ── VIRTUALIZACIÓN: descarga/recarga de lotes fuera de pantalla ────────
// Petición explícita de Alberto: las fichas que ya no se estén viendo
// deben descargarse de memoria para no acumular miles de imágenes
// decodificadas conforme crece el scroll — mismo principio que las listas
// virtualizadas (react-window y similares): mantener en el DOM solo una
// ventana alrededor de lo visible, con el resto sustituido por un simple
// espaciador del mismo alto (para que la barra de scroll no dé ningún
// salto). Aquí se hace por LOTES de _HOME_PAGE_SIZE en vez de fila a fila:
// las filas no tienen una altura fija de verdad (título/autor pueden
// ocupar más o menos, y las propias de la persona muestran botones extra
// de editar/despublicar) — agrupando por lote y midiendo su alto real ya
// renderizado se evita tener que asumir ninguna altura de fila fija.
function _homeVisibilityCallback(entries) {
  entries.forEach(entry => {
    const batch = entry.target._homeBatchRef;
    if (!batch) return;
    if (entry.isIntersecting) {
      if (!batch.loaded) _homeLoadBatch(batch);
    } else {
      if (batch.loaded) _homeUnloadBatch(batch);
    }
  });
}

function _homeAppendBatch(items) {
  const grid = document.getElementById('worksGrid');
  if (!grid) return;
  const el = document.createElement('div');
  el.className = 'work-batch';
  const batch = { el, items, loaded: true, height: null };
  el._homeBatchRef = batch;
  _homeBatches.push(batch);

  const currentUser = Auth.currentUser();
  items.forEach(comic => {
    try { el.appendChild(buildRow(comic, currentUser)); }
    catch(e) { console.error('buildRow error:', e, comic); }
  });

  const sentinel = document.getElementById('homeSentinel');
  if (sentinel) grid.insertBefore(el, sentinel); else grid.appendChild(el);
  _ensureSentinel(); // el indicador de "cargando más" debe seguir siendo el último hijo

  if (_homeVisObserver) _homeVisObserver.observe(el);
  if (typeof window._adjustSpacingNow === 'function') window._adjustSpacingNow();
}

function _homeUnloadBatch(batch) {
  const h = batch.el.getBoundingClientRect().height;
  if (h > 0) batch.height = h;
  batch.el.innerHTML = '';
  if (batch.height) batch.el.style.height = batch.height + 'px';
  batch.loaded = false;
}

function _homeLoadBatch(batch) {
  batch.el.style.height = '';
  batch.el.innerHTML = '';
  const currentUser = Auth.currentUser();
  batch.items.forEach(comic => {
    try { batch.el.appendChild(buildRow(comic, currentUser)); }
    catch(e) { console.error('buildRow error:', e, comic); }
  });
  batch.loaded = true;
}

// Re-renderiza TODO lo ya cargado en _homeWorks desde cero (sin volver a
// pedir nada a Supabase) — usada tras quitar una obra localmente (retirar
// del índice / eliminar, ver buildRow) para que desaparezca de inmediato
// sin perder la paginación ya conseguida ni disparar una recarga completa.
function _homeRerenderAll() {
  if (_homeVisObserver) _homeVisObserver.disconnect();
  const grid = document.getElementById('worksGrid');
  if (!grid) return;
  grid.innerHTML = '';
  _homeBatches = [];
  _ensureSentinel();
  for (let i = 0; i < _homeWorks.length; i += _HOME_PAGE_SIZE) {
    _homeAppendBatch(_homeWorks.slice(i, i + _HOME_PAGE_SIZE));
  }
  _homeUpdateEmptyState();
}

function _homeUpdateEmptyState() {
  const empty = document.getElementById('emptyState');
  if (!empty) return;
  if (_homeWorks.length > 0) { empty.classList.add('hidden'); return; }
  empty.classList.remove('hidden');
  _homeRenderEmptyState(empty);
}

// Ajusta la posición de la barra de página según la altura real de la cabecera

// ── MENÚ DE PÁGINA ──
function setupPageNav() {
  showFiltrosLevel1();

  const filtrosBtn  = document.getElementById('filtrosBtn');
  const filtrosMenu = document.getElementById('filtrosMenu');

  filtrosBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = filtrosMenu.classList.contains('open');
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    if (!isOpen) filtrosMenu.classList.add('open');
    // Por si el fetch inicial (disparado al entrar en la vista) aún no ha
    // terminado, o falló, intentarlo aquí también — es barato si ya está listo.
    if (!_homeFacets) _homeLoadFacets();
  });

  // Cierre solo al ejecutar la búsqueda (applyFilter ya cierra el menú) o al
  // tocar/clicar fuera (listener de document más abajo) — ya NO se cierra al
  // salir con el ratón: eso cerraba el buscador mientras aún se estaba
  // escribiendo si el cursor quedaba fuera del área del menú.

  // Móvil + PC: cerrar al tocar/clicar fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
      showFiltrosLevel1(); // resetear nivel
    }
  });

  // Novedades: quita filtros, recarga datos frescos y scroll al top
  document.getElementById('novedadesBtn')?.addEventListener('click', () => {
    activeFilter = { type: null, value: null };
    setActiveBtn('novedadesBtn');
    updateFiltrosLabel();
    showFiltrosLevel1();
    _homeStartLoading();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Crear
  document.getElementById('createBtn')?.addEventListener('click', () => {
    // Sin login: ir a my-works de todas formas (modo anónimo)
    Router.go('my-works');
  });
}

// ── MENÚ DE FILTROS: dos niveles ──
// Nivel 1: Género | Autor
// Nivel 2: listado del tipo seleccionado

function showFiltrosLevel1() {
  const menu = document.getElementById('filtrosMenu');
  if (!menu) return;
  menu.innerHTML = '';

  menu.appendChild(buildFilterItem(I18n.t('byGenre'), () => showFiltrosLevel2('genre'), false));
  menu.appendChild(buildFilterItem(I18n.t('byAuthor'),  () => showFiltrosLevel2('author'), false));
  menu.appendChild(buildFilterItem(I18n.t('byTitle'),  () => showFiltrosLevel2('title'), false));
}

function showFiltrosLevel2(type) {
  const menu = document.getElementById('filtrosMenu');
  if (!menu) return;
  menu.innerHTML = '';

  // Universo COMPLETO de géneros/autores (ver _homeLoadFacets) — a
  // propósito NO se usa _homeWorks aquí: con paginación, en un momento
  // dado solo hay cargada la parte más reciente, y el menú de Filtros
  // tiene que poder ofrecer también géneros/autores de obras más antiguas
  // aún sin cargar en pantalla.
  const published = _homeFacets || [];

  // Normalizar texto: minúsculas sin acentos para comparación
  function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  const allItems = type === 'genre'
    ? [...new Set(published.map(c => c.genre).filter(Boolean))].sort((a,b) => genreLabel(a).localeCompare(genreLabel(b), 'es'))
    : type === 'title'
    ? [...new Set(published.map(c => c.title).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'es'))
    : [...new Set(published.map(c => c.username).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'es'));

  // Campo de búsqueda con icono lupa
  const searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'display:flex;align-items:center;padding:6px 10px;gap:6px;border-bottom:1px solid var(--gray-100)';
  const lupa = document.createElement('span');
  lupa.textContent = '🔍';
  lupa.style.cssText = 'font-size:.85rem;flex-shrink:0';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = type === 'genre' ? I18n.t('home_searchGenre') : type === 'title' ? I18n.t('home_searchTitle') : I18n.t('home_searchAuthor');
  input.style.cssText = 'border:none;outline:none;font-family:var(--font-body);font-size:.85rem;font-weight:700;width:100%;background:transparent;color:var(--ink)';
  searchWrap.appendChild(lupa);
  searchWrap.appendChild(input);
  menu.appendChild(searchWrap);

  // Contenedor de items filtrados
  const itemsWrap = document.createElement('div');
  menu.appendChild(itemsWrap);

  function renderItems(filter) {
    const norm = normalize(filter);
    itemsWrap.innerHTML = '';
    const visible = norm
      ? allItems.filter(i => normalize(type === 'genre' ? genreLabel(i) : i).startsWith(norm))
      : allItems;
    if (!visible.length) {
      itemsWrap.appendChild(emptyItem(I18n.t(type === 'genre' ? 'noGenres' : type === 'title' ? 'noTitles' : 'noAuthors')));
      return;
    }
    visible.forEach(id => {
      const label    = type === 'genre' ? genreLabel(id) : id;
      const isActive = activeFilter.type === type && activeFilter.value === id;
      itemsWrap.appendChild(buildFilterItem(label, () => applyFilter(type, id), isActive));
    });
  }

  renderItems('');

  // Filtrar en tiempo real
  input.addEventListener('input', () => renderItems(input.value));
  // Foco automático al abrir
  requestAnimationFrame(() => input.focus());
}

// Aplicar un filtro (género/autor) recarga la paginación DESDE CERO, ya
// filtrada en el propio servidor (genre=eq.X / author_name=eq.Y añadido a
// la consulta de Supabase, ver fetchPublishedWorksPage) — filtrar en el
// cliente, como se hacía antes, solo habría podido ver lo ya cargado hasta
// ese momento, incompleto en cuanto hubiera miles de obras.
function applyFilter(type, value) {
  activeFilter = { type, value };
  updateFiltrosLabel();
  setActiveBtn('filtrosBtn');
  document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
  // Bug reportado por Alberto: al no resetear aquí, la siguiente vez que se
  // abría "Filtros" seguía mostrando el nivel 2 (con el cuadro de búsqueda y
  // el texto) de la búsqueda anterior, en vez de volver a Género/Autor/
  // Nombre de la obra para poder buscar algo distinto.
  showFiltrosLevel1();
  _homeStartLoading();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function buildFilterItem(label, onClick, isActive) {
  const item = document.createElement('a');
  item.className = 'dropdown-item' + (isActive ? ' active' : '');
  item.href = '#';
  item.textContent = label;
  item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
  return item;
}

function emptyItem(text) {
  const s = document.createElement('span');
  s.className = 'dropdown-item disabled-item';
  s.textContent = text;
  return s;
}

function updateFiltrosLabel() {
  const btn = document.getElementById('filtrosBtn');
  if (!btn) return;
  if (!activeFilter.type) {
    btn.textContent = I18n.t('filterBtn');
  } else if (activeFilter.type === 'genre') {
    btn.textContent = `${genreLabel(activeFilter.value)} ▾`;
  } else {
    btn.textContent = `${activeFilter.value} ▾`;
  }
}

function setActiveBtn(id) {
  document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.remove('active'));
  if (id) document.getElementById(id)?.classList.add('active');
}

// ── RENDER ──
// Alterna el mensaje del estado vacío entre "no hay obras publicadas" (de
// verdad no hay ninguna que mostrar) y "no se han podido cargar las obras"
// (la carga real ha fallado — sin conexión, timeout, Supabase no
// disponible... — ver _homeLoadError). Cambia la propia clave data-i18n en
// vez de solo el texto: así, si la persona cambia de idioma mientras este
// aviso está en pantalla, I18n.applyAll() lo sigue traduciendo bien sin
// que este código tenga que volver a ejecutarse.
function _homeRenderEmptyState(empty) {
  const icon  = document.getElementById('emptyStateIcon');
  const title = document.getElementById('emptyStateTitle');
  const sub   = document.getElementById('emptyStateSub');
  if (!title || !sub) return;
  const titleKey = _homeLoadError ? 'loadWorksErrorTitle' : 'noComics';
  const subKey   = _homeLoadError ? 'loadWorksErrorSub'   : 'beFirst';
  if (icon) icon.textContent = _homeLoadError ? '⚠️' : '📚';
  title.dataset.i18n = titleKey;
  sub.dataset.i18n = subKey;
  if (typeof I18n !== 'undefined' && typeof I18n.t === 'function') {
    title.textContent = I18n.t(titleKey);
    sub.textContent = I18n.t(subKey);
  }
}

// ── FILA ──
function buildRow(comic, currentUser) {
  const isOwner = typeof Auth !== 'undefined' ? Auth.canManage(comic) : (currentUser && (currentUser.id === comic.userId || currentUser.role === 'admin'));
  const thumb   = comic.panels?.[0]?.dataUrl || null;

  const row = document.createElement('div');
  row.className = 'work-row';

  const thumbEl = document.createElement('div');
  thumbEl.className = 'work-row-thumb';
  if (thumb) {
    const img = document.createElement('img');
    img.src = thumb; img.alt = comic.title || '';
    thumbEl.appendChild(img);
  } else {
    thumbEl.textContent = '🖼️';
  }

  const info = document.createElement('div');
  info.className = 'work-row-info';

  const title = document.createElement('div');
  title.className = 'work-row-title';
  title.textContent = comic.title || I18n.t('noWork');

  const meta = document.createElement('div');
  meta.className = 'work-row-author';
  const genreBadge = comic.genre
    ? ` · <span class="genre-badge">${escHtml(genreLabel(comic.genre))}</span>` : '';
  if (comic.contactUrl) {
    meta.innerHTML = `${escHtml(comic.username || '')}${genreBadge} · <a href="${escHtml(comic.contactUrl)}" target="_blank">${I18n.t('home_contact')}</a>`;
  } else {
    meta.innerHTML = escHtml(comic.username || '') + genreBadge;
  }

  const actions = document.createElement('div');
  actions.className = 'work-row-actions';

  const readBtn = document.createElement('a');
  readBtn.className = 'work-row-btn';
  readBtn.href = '#';
  readBtn.onclick = (e) => {
    e.preventDefault();
    // Obras publicadas: usar el reproductor externo
    if (comic.supabaseId && comic.published) {
      const _isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (_isFs) sessionStorage.setItem('cx_was_fs', '1');
      else sessionStorage.removeItem('cx_was_fs');
      // Pestaña nueva — ver _openReaderTab en utils.js (no window.location:
      // la app no debe recargarse/abandonarse al leer una obra, y así
      // pueden tenerse varias lecturas abiertas a la vez).
      _openReaderTab('reader/index.html?id=' + comic.supabaseId + (_isFs ? '&fs=1' : ''));
    } else {
      // Sin supabaseId: visor interno del SPA (obra local)
      Router.go('reader', { id: comic.id });
    }
  };
  readBtn.textContent = I18n.t('read');
  actions.appendChild(readBtn);

  // Botón Enviar — solo para obras publicadas con supabaseId
  if (comic.supabaseId) {
    const shareBtn = document.createElement('a');
    shareBtn.className = 'work-row-btn';
    shareBtn.href = '#';
    shareBtn.innerHTML = shareIconSvg() + ' ' + I18n.t('home_share');
    shareBtn.onclick = (e) => { e.preventDefault(); openShareModal(comic); };
    actions.appendChild(shareBtn);
  }

  if (isOwner) {
    // Petición de Alberto: la ficha de obra en la página de inicio (home)
    // ya NO debe tener la opción "Editar" — esa acción queda exclusivamente
    // en Mis obras (my-works.js, botón independiente con data-action="edit",
    // no se toca ni se comparte código con este fichero).
    const unpubBtn = document.createElement('button');
    unpubBtn.className = 'work-row-btn unpub';
    unpubBtn.textContent = I18n.t('unpublish');
    unpubBtn.addEventListener('click', () => {
      appConfirm(I18n.t('confirmUnpublish'), async () => {
        // Quitar inmediatamente del cache en memoria para que desaparezca del render
        if (_homeWorks) {
          _homeWorks = _homeWorks.filter(w => w.supabaseId !== comic.supabaseId && w.id !== comic.id);
        }
        showFiltrosLevel1();
        _homeRerenderAll();
        showToast(I18n.t('unpublishOk'));
        // Retirar en Supabase (async, no bloquea la UI)
        if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
          try {
            await SupabaseClient.unpublishWork(comic.supabaseId, comic.supabaseId);
          } catch(err) { console.warn('unpublishWork:', err); }
        }
        // Actualizar entrada local si existe
        const _local = WorkStore.getById(comic.id) || WorkStore.getById(comic.supabaseId);
        if (_local) { _local.published = false; _local.approved = false; WorkStore.save(_local); }
        // Invalidar cache para que la próxima carga traiga datos frescos de Supabase
        if (typeof homeInvalidateCache === 'function') homeInvalidateCache();
      }, I18n.t('unpublish') || 'Retirar');
    });
    actions.appendChild(unpubBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'work-row-btn del';
    delBtn.style.color = '#e63030';
    delBtn.style.fontWeight = '900';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      appConfirm(I18n.t('confirmDelete'), ()=>{
        if (comic.supabaseId && typeof SupabaseClient !== 'undefined') {
          SupabaseClient.deleteWork(comic.supabaseId).catch(() => {});
        }
        WorkStore.remove(comic.id);
        _homeWorks = _homeWorks.filter(w => w.supabaseId !== comic.supabaseId && w.id !== comic.id);
        showFiltrosLevel1();
        _homeRerenderAll();
        showToast(I18n.t('deleteOk'));
      });
    });
    actions.appendChild(delBtn);
  }

  info.appendChild(title);
  info.appendChild(meta);
  info.appendChild(actions);
  row.appendChild(thumbEl);
  row.appendChild(info);
  return row;
}

// ── MODAL READER EMBED (expositor) ──────────────────────────
function _openReaderModal(url) {
  let overlay = document.getElementById('homeReaderModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'homeReaderModal';
    overlay.className = 'reader-modal';
    overlay.innerHTML = `
      <div class="reader-modal-inner">
        <iframe class="reader-modal-frame" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(overlay);

    // Cerrar al clicar fuera del iframe
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeReaderModal(); });

    // Escuchar mensajes del iframe
    window.addEventListener('message', e => {
      if (e.data?.type === 'reader:close')      _closeReaderModal();
      if (e.data?.type === 'reader:fullscreen') {
        const frame = overlay.querySelector('.reader-modal-frame');
        if (!frame) return;
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (isFs) {
          (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
        } else {
          const req = frame.requestFullscreen || frame.webkitRequestFullscreen;
          if (req) req.call(frame, { navigationUI: 'hide' }).catch(() => {});
        }
      }
    });
  }
  const frame = overlay.querySelector('.reader-modal-frame');
  frame.src = url;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Recordar si la app estaba en fullscreen antes de abrir el reader
  overlay._wasFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
  // Dar foco al iframe para que las teclas funcionen sin clic previo
  frame.addEventListener('load', () => frame.focus(), { once: true });
}

function _closeReaderModal() {
  const overlay = document.getElementById('homeReaderModal');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.querySelector('.reader-modal-frame').src = '';
  document.body.style.overflow = '';
  const wasFs = overlay._wasFullscreen;
  overlay._wasFullscreen = false;
  const nowFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (nowFs && !wasFs) {
    // El reader activó fullscreen — salir
    (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
  } else if (!nowFs && wasFs) {
    // La app estaba en fullscreen antes — restaurar
    if (typeof Fullscreen !== 'undefined') Fullscreen.enter();
  }
  // Resincronizar botón (con pequeño delay para que el estado FS se actualice)
  setTimeout(() => { if (typeof Fullscreen !== 'undefined') Fullscreen._updateBtn(); }, 200);
}

// Cerrar modal con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('homeReaderModal');
    if (overlay && !overlay.classList.contains('hidden')) { e.stopPropagation(); _closeReaderModal(); }
  }
});
