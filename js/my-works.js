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
 *
 * - gifuct-js (decodificador de GIF animados; incluido dentro de editor.js y de reader/reader.js)
 *     Autor: Matt Way
 *     Licencia: MIT
 *     https://github.com/matt-way/gifuct-js
 *
 * - js-binary-schema-parser (analizador de esquemas binarios; parte de gifuct-js)
 *     Autor: Matt Way
 *     Licencia: MIT
 *     https://github.com/matt-way/jsBinarySchemaParser
 *
 * - jsgif (función de desentrelazado de GIF; parte de gifuct-js)
 *     Autor: Shachaf Ben-Kiki
 *     Licencia: MIT
 *     https://github.com/shachaf/jsgif
 */
/* ComXow v4.2 */
/* ============================================================
   my-works.js — Vista "Mis creaciones"
   Listado del autor con opciones Leer / Editar / Publicar.
   ============================================================ */

// ── Cache de miniaturas en memoria (evita guardar base64 en localStorage) ──
// Solo vive en sesión. v42.11: las claves llevan prefijo para que la portada LOCAL y la de la NUBE de una misma obra no
// se pisen (el id local puede ser igual al supabaseId, p. ej. en obras importadas por la sincronización antigua):
//   'L:' + id local    → portada guardada en este dispositivo (data URL; viene de OPFS, ver WorkStore.getCover)
//   'C:' + supabaseId  → portada que hay en la nube (URL del Worker; en obras muy antiguas, data URL de la hoja 1)
const _mcThumbCache = new Map();

const _MC_BASE = 'https://qqgsbyylaugsagbxsetc.supabase.co/rest/v1';
const _MC_KEY  = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';
const _MC_HDRS = { 'apikey': _MC_KEY, 'Authorization': 'Bearer ' + _MC_KEY };

// Verificar que una obra pertenece al usuario autenticado actual
function _mcOwns(comic) {
  if (!comic) return false;
  const _user = Auth.currentUser?.() || null;
  if (!_user) {
    // Sin sesión: solo obras anónimas
    return comic.userId === '_anon_' || comic.anonymous === true;
  }
  return comic.userId === _user.id || comic.username === _user.username;
}

/* ── MINIATURAS DE «MIS OBRAS» (v42.11) ───────────────────────────────────────────────────────────────────────────
   Petición de Alberto: las miniaturas deben verse en TODOS los casos —también si la obra no está subida a la nube— y
   «Mis obras» debe ponerse al día en CADA acceso (antes solo lo hacía al volver a entrar / pulsar «☁️ Mis obras» otra vez).
   Causas encontradas (cada una reproducida con un test de gestos reales, ver bench t_mcthumbs4211):
   · Con el token caducado (PWA abierta más de una hora) la portada de la nube se pedía con el JWT viejo → 401 tragado en
     silencio → ⏳ para siempre. La sincronización sí renovaba el token, de ahí que en el SEGUNDO acceso ya funcionara.
   · Cada fila usaba UNA sola fuente (nube o dispositivo, según la fecha) sin respaldo en la otra: con la nube caída, una
     obra «fantasma» (id de nube que ya no existe) o la portada local vacía no había imagen. Ahora se prueba la fuente
     «preferida» (la de la versión más reciente) y, si no da imagen, la otra.
   · Un intento fallido dejaba la fila «en progreso» para siempre (sin reintento) y, sin imagen, el reloj de arena.
     Ahora: sin imagen en ninguna fuente → 📄 (jamás ⏳ eterno); se reintenta al volver a entrar y en cuanto la nube responde.
   · Una imagen que el navegador no puede cargar (portada borrada de la nube…) se sustituye por la otra fuente o por 📄.
   Patrones estándar: stale-while-revalidate (se pinta lo que hay y se actualiza), renovar el token ANTES de una lectura
   autenticada, tiempo máximo por petición, local primero con respaldo en la nube, reintento en el siguiente acceso. */
const _mcThumbBusy   = new Set();   // ids locales con una carga de miniatura en curso (una por fila a la vez)
const _mcThumbDone   = new Set();   // ids cuya carga ya se intentó EN ESTE ACCESO (con o sin imagen): repintar no la repite
const _mcThumbMiss   = new Set();   // ids sin imagen en NINGUNA fuente en este acceso → se pinta 📄
const _mcThumbFailed = new Set();   // ids cuya consulta a la nube FALLÓ (red, token…) → se reintentan en cuanto la nube responde
const _mcThumbBad    = new Set();   // imágenes que el navegador no ha podido cargar: no se vuelven a usar
const _mcCoverUrls   = new Map();   // supabaseId → cover_url que ya trajo una consulta (sincronización / botón de la nube)
const _mcLK = id  => 'L:' + id;
const _mcCK = sid => 'C:' + sid;
// >0 mientras esta vista guarda metadatos por su cuenta (sincronización con la nube): ese guardado no cambia ninguna
// portada, así que no debe invalidar las miniaturas (se vería un ⏳ entre medias). Los guardados del editor sí las invalidan.
let _mcSelfSave = 0;
function _mcSaveQuiet(rec) { _mcSelfSave++; try { return WorkStore.save(rec); } finally { _mcSelfSave--; } }
// Acciones de este usuario que la nube aún no ha terminado de procesar. Una sincronización que ya iba en camino trae el estado
// ANTERIOR de la nube: sin esto, una obra recién «despublicada» o «enviada a revisión» volvía a su estado de antes, y una
// recién borrada reaparecía en la lista (la nube tarda unos segundos en borrarla entera) hasta el siguiente acceso.
const _mcPubBusy  = new Set();   // ids locales con publicar / despublicar en curso
const _mcDeleting = new Set();   // supabaseId de las obras cuyo borrado en la nube está en curso

// ¿Está caducado este JWT? (con un minuto de margen; si no se puede leer se da por válido)
function _mcJwtExpired(tok) {
  try {
    const exp = JSON.parse(atob(String(tok).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0;
    return exp > 0 && (exp - 60) < Date.now() / 1000;
  } catch (_e) { return false; }
}

// Cabeceras de lectura con el JWT del autor, RENOVADO antes si ha caducado (la misma renovación compartida que usa
// SupabaseClient). Si aun así no hay un token válido se usa la clave anónima: PostgREST rechaza (401) cualquier JWT caducado,
// pero con la anónima sigue sirviendo lo público (las portadas de obras publicadas).
async function _mcAuthHdrs(extra) {
  try { if (window._authTryRefresh) await window._authTryRefresh(); } catch (_e) {}
  let tok = '';
  try { const s = JSON.parse(localStorage.getItem('cs_session') || 'null'); tok = (s && s.token) || ''; } catch (_e) {}
  if (!tok || _mcJwtExpired(tok)) tok = _MC_KEY;
  return Object.assign({ 'apikey': _MC_KEY, 'Authorization': 'Bearer ' + tok }, extra || {});
}

// GET a PostgREST con tiempo máximo. Devuelve el array JSON, o null si falla (sin red, 401, tiempo agotado…).
async function _mcRest(path, hdrs, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const r = await fetch(`${_MC_BASE}/${path}`, { headers: hdrs, cache: 'no-store', signal: ctl.signal });
    if (!r.ok) { console.warn('[Mis obras] la nube respondió ' + r.status + ' a ' + path.split('?')[0]); return null; }
    const j = await r.json();
    return Array.isArray(j) ? j : null;
  } catch (_e) { return null; }
  finally { clearTimeout(timer); }
}

// URL de una imagen → data URL (null/'' si no se puede). Para guardar en el dispositivo la portada de la nube.
async function _mcUrlToDataUrl(url) {
  if (!url) return '';
  if (String(url).startsWith('data:')) return url;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return '';
    const blob = await r.blob();
    if (!blob || !blob.size || blob.size > 3 * 1024 * 1024 || !/^image\//.test(blob.type || '')) return '';
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || ''));
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch (_e) { return ''; }
  finally { clearTimeout(timer); }
}

// ¿Hay portada de esta obra guardada en este dispositivo? (flags del índice ligero: la imagen vive en OPFS)
function _mcHasLocalCover(c) {
  if (!c) return false;
  const p0 = c.panels && c.panels[0];
  return !!((p0 && (p0._hasDataUrl || p0.dataUrl)) || c._hasCoverDataUrl || c.coverDataUrl);
}

// Fuentes posibles de la miniatura, por orden: ['local'|'cloud', …]. La PRIMERA es la «preferida» = la de la versión más
// reciente (v38.29): la local si se guardó aquí después de la última subida a la nube —o la obra no está en la nube—; la de
// la nube si no, o si la sincronización vio allí una versión más nueva (cloudNewer). La otra queda de respaldo.
function _mcThumbOrder(comic) {
  const hasCloud = !!comic.supabaseId;
  const hasLocal = _mcHasLocalCover(comic);
  const localNewer = !!comic.localSavedAt &&
    (!comic.cloudSavedAt || new Date(comic.localSavedAt) > new Date(comic.cloudSavedAt));
  const preferLocal = !hasCloud || (localNewer && !comic.cloudNewer);
  const out = [];
  if (preferLocal) { if (hasLocal) out.push('local'); if (hasCloud) out.push('cloud'); }
  else             { if (hasCloud) out.push('cloud'); if (hasLocal) out.push('local'); }
  return out;
}

const _mcSrcKey = (comic, s) => (s === 'cloud' ? _mcCK(comic.supabaseId) : _mcLK(comic.id));
const _mcCached = k => { const v = _mcThumbCache.get(k); return (v && !_mcThumbBad.has(v)) ? v : ''; };

// ¿Falta cargar la miniatura preferida de esta fila? (no si ya se intentó en este acceso, ni si ya está en la caché)
function _mcNeedsFill(comic, order) {
  order = order || _mcThumbOrder(comic);
  if (!order.length || _mcThumbDone.has(comic.id)) return false;
  return !_mcCached(_mcSrcKey(comic, order[0]));
}

// Qué pintar ahora en la fila: src (imagen que ya se tiene, de la fuente preferida o del respaldo), fill (hay que ir a
// buscar la preferida) y loading (no hay imagen y se está esperando → ⏳; si no se espera nada → 📄).
function _mcThumbView(comic) {
  const order = _mcThumbOrder(comic);
  let src = '';
  for (const s of order) { src = _mcCached(_mcSrcKey(comic, s)); if (src) break; }
  if (!src && !comic.cloudOnly) {   // formato antiguo: la imagen de la hoja 1 dentro del propio índice
    const p0 = comic.panels && comic.panels[0];
    if (p0 && p0.dataUrl && !_mcThumbBad.has(p0.dataUrl)) src = p0.dataUrl;
  }
  const fill = _mcNeedsFill(comic, order);
  return { src, fill, loading: !src && fill };
}

function _mcThumbHtml(v, comic) {
  if (v.src) return `<img src="${v.src.startsWith('data:') ? v.src : escHtml(v.src)}" alt="${escHtml(comic.title || '')}" loading="lazy">`;
  return v.loading
    ? `<span style="font-size:1.4rem;color:var(--gray-300)">⏳</span>`
    : `<span style="font-size:1.8rem">📄</span>`;
}

// Pone al día la miniatura de UNA fila ya pintada, sin repintar la lista entera.
function _mcPaintThumb(id) {
  const row = document.querySelector(`.work-row[data-id="${CSS.escape(id)}"]`);
  const th = row && row.querySelector('.work-row-thumb');
  if (!th) return;
  const comic = WorkStore.getById(id);
  if (!comic) return;
  const v = _mcThumbView(comic);
  const cur = th.querySelector('img');
  if (v.src) {
    if (cur && cur.getAttribute('src') === v.src) return;
    th.innerHTML = _mcThumbHtml(v, comic);
  } else if (!cur) {
    th.innerHTML = _mcThumbHtml(v, comic);   // ⏳ → 📄 (o sigue ⏳ si aún se espera algo)
  }
}

// Portada guardada en este dispositivo (OPFS). '' si no hay.
async function _mcFetchLocalCover(comic) {
  try {
    // v41.43: WorkStore.getCover lee un archivito aparte con SOLO la portada (coverDataUrl con el texto horneado si existe,
    // si no la imagen de la hoja 1) en vez de leer y parsear el archivo pesado ENTERO de la obra (decenas de MB).
    const url = WorkStore.getCover ? await WorkStore.getCover(comic.id) : '';
    return (url && !_mcThumbBad.has(url)) ? url : '';
  } catch (_e) { return ''; }
}

// Portada de la nube. '' = la nube respondió y no hay portada · null = no se pudo preguntar (red, token, tiempo agotado).
async function _mcFetchCloudCover(comic) {
  const sid = comic.supabaseId;
  if (!sid) return '';
  let url = _mcCoverUrls.get(sid) || '';
  if (!url) {
    const hdrs = await _mcAuthHdrs();
    const q = encodeURIComponent(sid);
    // cover_url (con el texto horneado, ver edRenderPage(page,withText) en editor.js) si existe; si la obra es de antes de
    // este cambio y no lo tiene, respaldo al panel_order=0 (sin texto) de siempre.
    const rows = await _mcRest(`works?id=eq.${q}&select=cover_url`, hdrs);
    if (!rows) return null;
    url = (rows[0] && rows[0].cover_url) || '';
    if (url) _mcCoverUrls.set(sid, url);
    else if (rows.length) {
      const p = await _mcRest(`panels?work_id=eq.${q}&order=panel_order.asc&limit=1&select=data_url`, hdrs);
      if (!p) return null;
      url = (p[0] && p[0].data_url) || '';
    }
  }
  return (url && !_mcThumbBad.has(url)) ? url : '';
}

// Carga la miniatura de UNA fila: primero la fuente preferida y, si no da imagen, la otra. Pinta el resultado en el DOM.
async function _mcFillThumb(id) {
  if (!id || _mcThumbBusy.has(id)) return;
  const comic = WorkStore.getById(id);
  if (!comic) return;
  const order = _mcThumbOrder(comic);
  if (!_mcNeedsFill(comic, order)) { _mcPaintThumb(id); return; }
  _mcThumbBusy.add(id);
  let failed = false;
  try {
    for (const s of order) {
      const url = s === 'cloud' ? await _mcFetchCloudCover(comic) : await _mcFetchLocalCover(comic);
      if (url === null) { failed = true; continue; }
      if (url) { _mcThumbCache.set(_mcSrcKey(comic, s), url); break; }
    }
  } catch (_e) { failed = true; }
  _mcThumbBusy.delete(id);
  _mcThumbDone.add(id);
  const cur = WorkStore.getById(id);
  if (!cur) return;
  if (failed) _mcThumbFailed.add(id); else _mcThumbFailed.delete(id);
  if (!_mcThumbView(cur).src) _mcThumbMiss.add(id);
  _mcPaintThumb(id);
}

// Nuevo ACCESO a «Mis obras» (entrada desde el menú, atrás del navegador, restauración desde la bfcache…): lo que se «intentó»
// en el acceso anterior se olvida, así que las miniaturas que no se pudieron cargar entonces (nube caída, token caducado…)
// se vuelven a pedir. Lo que sí se cargó se conserva en _mcThumbCache y se pinta al instante.
function _mcNewAccess() {
  _mcThumbDone.clear(); _mcThumbMiss.clear(); _mcThumbFailed.clear();
  // Una imagen REMOTA (portada de la nube) que no cargó pudo ser un simple corte de red: se vuelve a intentar en cada acceso en
  // vez de darla por mala hasta recargar la app (la PWA puede llevar días abierta). Una imagen local (data:) que no se
  // decodifica no se arregla sola: esa sí se queda descartada. Dentro de un mismo acceso la descartada sigue descartada (sin bucles).
  Array.from(_mcThumbBad).forEach(u => { if (!/^data:/i.test(u)) _mcThumbBad.delete(u); });
}

// La nube acaba de responder: las miniaturas que fallaron por falta de red / token se vuelven a intentar.
function _mcResetFailedThumbs() {
  const ids = Array.from(_mcThumbFailed);
  ids.forEach(id => { _mcThumbFailed.delete(id); _mcThumbMiss.delete(id); _mcThumbDone.delete(id); });
  return ids;
}

// Observador ÚNICO de la lista: pide la miniatura de cada fila cuando está cerca de la pantalla (carga perezosa).
let _mcThumbObs = null;
function _mcObserveThumbs(wrap) {
  if (_mcThumbObs) { _mcThumbObs.disconnect(); _mcThumbObs = null; }
  const els = wrap.querySelectorAll('[data-thumb-fill]');
  if (!els.length) return;
  if (typeof IntersectionObserver === 'undefined') { els.forEach(el => _mcFillThumb(el.dataset.thumbFill)); return; }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      obs.unobserve(entry.target);
      _mcFillThumb(entry.target.dataset.thumbFill);
    });
  }, { rootMargin: '200px' });
  _mcThumbObs = obs;
  els.forEach(el => obs.observe(el));
}

// Una <img> de la lista que el navegador no ha podido cargar (el evento error no burbujea: se captura en #mcContent):
// se descarta esa imagen y se busca la otra fuente; si no hay, 📄.
function _mcOnThumbError(e) {
  const img = e.target;
  if (!img || img.tagName !== 'IMG' || !img.closest) return;
  const th = img.closest('.work-row-thumb');
  const row = th && th.closest('.work-row');
  if (!row) return;
  const id = row.dataset.id;
  const bad = img.getAttribute('src') || '';
  if (bad) _mcThumbBad.add(bad);
  Array.from(_mcThumbCache).forEach(([k, val]) => { if (val === bad) _mcThumbCache.delete(k); });
  _mcThumbDone.delete(id); _mcThumbMiss.delete(id);
  const comic = WorkStore.getById(id);
  th.innerHTML = '';
  if (!comic) return;
  th.innerHTML = _mcThumbHtml(_mcThumbView(comic), comic);
  _mcFillThumb(id);
}

// Reactivo a WorkStore.save() (evento 'cx:store', ver storage.js) — sin esto la miniatura se quedaba con lo primero que
// se cacheó en esta sesión: guardar de nuevo (local o nube) no la refrescaba hasta recargar la app entera. Invalida las dos
// claves posibles (id local y supabaseId) y las vuelve a pedir.
// El evento se dispara ANTES de que termine la escritura async en OPFS (donde vive coverDataUrl) — pequeño margen para no
// leer justo antes de que se complete.
// IMPORTANTE: el guardado ocurre con el EDITOR abierto (vista distinta), no con "Mis Creaciones" visible — por eso este
// listener se registra una sola vez, de forma global, al cargar el script (ver más abajo), y NO depende de si #myWorksList
// existe en el momento del guardado. Antes estaba atado a MyWorksView_init()/_destroy(), así que en la práctica nunca
// llegaba a reaccionar a un guardado real (solo a acciones hechas ya estando dentro de Mis Creaciones).
function _mcOnStoreChange(e) {
  if (e?.detail?.type !== 'save') return;
  const id = e?.detail?.id;
  if (!id || _mcSelfSave) return;
  _mcThumbCache.delete(_mcLK(id));
  const local0 = WorkStore.getById(id);
  if (local0 && local0.supabaseId) _mcThumbCache.delete(_mcCK(local0.supabaseId));
  _mcThumbDone.delete(id); _mcThumbMiss.delete(id); _mcThumbFailed.delete(id);
  // v41.43: con el editor abierto (donde ocurre casi todo guardado) la lista de "Mis obras" ni existe en pantalla —
  // recargar aquí la miniatura era trabajo tirado. Invalidada la caché (arriba), la lista la vuelve a pedir sola,
  // perezosamente, cuando se muestre (ver _mcRenderList / _mcObserveThumbs). Solo se recarga ahora si la fila está visible.
  setTimeout(() => {
    if (!document.querySelector(`.work-row[data-id="${CSS.escape(id)}"]`)) return;
    _mcFillThumb(id);
  }, 400);
}
window.addEventListener('cx:store', _mcOnStoreChange);

// Franja blanca tras el título de los modales de "Mis Creaciones" (Nuevo
// proyecto, Título duplicado) — mismo criterio que en el editor: desde el
// borde izquierdo de la ventana hasta el final del texto, semicírculo a la
// derecha. Se recalcula solo/a cuando el modal es visible.
function _mcFitTitlePill(titleEl){
  if (!titleEl || titleEl.offsetParent === null) return;
  const text = titleEl.querySelector('.mc-modal-title-text');
  if (!text) return;
  let pill = titleEl.querySelector(':scope > .win-title-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.className = 'win-title-pill';
    pill.setAttribute('aria-hidden', 'true');
    titleEl.insertBefore(pill, titleEl.firstChild);
  }
  const boxRect  = titleEl.getBoundingClientRect();
  const textRect = text.getBoundingClientRect();
  if (textRect.width <= 0) { pill.style.width = '0px'; return; }
  const vPad = textRect.height * 0.067;
  pill.style.top    = (textRect.top - boxRect.top - vPad) + 'px';
  pill.style.height = (textRect.height + vPad * 2) + 'px';
  pill.style.width  = Math.max(0, textRect.right - boxRect.left + 4) + 'px';
}
function _mcFitAllTitlePills(){
  document.querySelectorAll('.mc-modal-title').forEach(_mcFitTitlePill);
}
function _mcInitTitlePillObserver(){
  if (window._mcTitleObs) return; // ya inicializado
  const _cb = () => {
    cancelAnimationFrame(window._mcTitlePillRaf);
    window._mcTitlePillRaf = requestAnimationFrame(_mcFitAllTitlePills);
  };
  const _obs = new MutationObserver(_cb);
  // Los modales de Mis obras se crean/destruyen según se necesitan — subtree los cubre todos.
  _obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', _cb);
  window._mcTitleObs = _obs;
}

/* v41.86 — «Nueva obra» ya NO abre un modal de datos (título, género, modo de lectura, hoja final): entra directo
   al editor (ver _mcCreateBlankWork). Esos datos se piden al GUARDAR, con el modal «Datos del proyecto» del editor
   (editor.js, _edEnsureProjectData). El antiguo modal #mcNewModal y sus funciones (_mcInjectModal, _mcOpenModal,
   _mcCreateProject, _mcConfirmDuplicate…) se han retirado porque ya nada los llamaba. */


/* ── ACCESO A cxAutosave DESDE LA LIMPIEZA DE HUÉRFANOS (v40.55) ─────────
   La base 'cxAutosave' la crea y mantiene el editor (_asDb, editor.js) y la abre en VERSIÓN 2
   (la 2 crea el store 'saves' en dispositivos que la tenían en la 1). Desde v39.65 esta limpieza
   la pedía en versión 1: en un dispositivo con la base ya en v2 daba VersionError, que el
   onerror tragaba en silencio, y la limpieza NUNCA veía ni borraba los autoguardados de obras
   que ya no existen. Y en un dispositivo con la base aún en v1, o sin base, abría/creaba una
   conexión que no cerraba jamás: cuando el editor pedía después la v2 quedaba BLOQUEADO
   (onblocked → «apertura bloqueada por otra pestaña») y el autoguardado fallaba toda esa sesión.
   Reglas de esta apertura (patrón estándar de IndexedDB, evento «versionchange»):
   · SIN número de versión: se abre la que haya. Nunca se pide una concreta.
   · Si la base NO existe no se crea (esto es solo lectura/limpieza): se aborta la creación en
     onupgradeneeded (oldVersion === 0) y se devuelve null.
   · Conexión de vida corta: quien la abre la CIERRA siempre al terminar, y ante «versionchange»
     se cierra sola, para no bloquear la actualización de esquema del editor. */
function _mcOpenAutosaveDb() {
  return new Promise(res => {
    let req;
    try { req = indexedDB.open('cxAutosave'); } catch (_) { res(null); return; }
    req.onupgradeneeded = e => {
      if (e.oldVersion === 0) { try { e.target.transaction.abort(); } catch (_) {} }
    };
    req.onsuccess = e => {
      const db = e.target.result;
      db.onversionchange = () => { try { db.close(); } catch (_) {} };
      res(db);
    };
    req.onerror = () => res(null);
  });
}

// Borra claves del store 'saves', espera a que termine la transacción y cierra la conexión.
async function _mcDeleteAutosaveKeys(keys) {
  if (!keys || !keys.length) return;
  const db = await _mcOpenAutosaveDb();
  if (!db) return;
  try {
    if (db.objectStoreNames.contains('saves')) {
      await new Promise(res => {
        const tx = db.transaction('saves', 'readwrite');
        const st = tx.objectStore('saves');
        keys.forEach(k => st.delete(k));
        tx.oncomplete = tx.onerror = tx.onabort = () => res();
      });
    }
  } catch (_) { /* no crítico: se reintentará en la próxima entrada a Mis obras */ }
  try { db.close(); } catch (_) {}
}

/* ── LIMPIEZA DE DATOS HUÉRFANOS ──────────────────────────────────────────
   Busca en OPFS, IDB cxAnims, cxAutosave, cxBiblioteca y localStorage
   datos que no corresponden a ninguna obra del usuario actual.
   Se ejecuta en segundo plano al entrar en la vista del autor.
   Solo muestra el aviso si hay algo que limpiar.
──────────────────────────────────────────────────────────────────────── */
async function _mcCheckOrphanData() {
  // Si el usuario ya salió de la vista, no hacer nada
  if (!document.getElementById('mcContent')) return;
  const _user = (typeof Auth !== 'undefined') ? Auth.currentUser?.() : null;
  if (!_user) return;

  const _uid = String(_user.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  // IDs de obras válidas del usuario actual
  const _validComics = WorkStore.getAll()
    .filter(c => c.userId === _user.id || c.username === _user.username);
  const _validIds = new Set(_validComics.map(c => c.id));
  // Añadir también supabaseId al set — las claves IDB de obras descargadas de la nube
  // usan el supabaseId como comicId (formato {uid}__{supabaseId}_{pi}_{li})
  _validComics.forEach(c => { if (c.supabaseId) _validIds.add(c.supabaseId); });

  const _orphans = { opfs: [], anims: [], autosave: [], bib: [], ls: [] };

  // ── 1. OPFS: comixou/{uid}/{comicId}.json ────────────────────────────
  try {
    if (navigator.storage && navigator.storage.getDirectory) {
      const _root = await navigator.storage.getDirectory();
      const _base = await _root.getDirectoryHandle('comixou', { create: false }).catch(() => null);
      if (_base) {
        const _userDir = await _base.getDirectoryHandle(_uid, { create: false }).catch(() => null);
        if (_userDir) {
          for await (const [name] of _userDir.entries()) {
            if (!name.endsWith('.json')) continue;
            const _id = name.slice(0, -5);
            if (!_validIds.has(_id)) _orphans.opfs.push({ dir: _userDir, name });
          }
        }
      }
    }
  } catch(_e) {}

  // ── 2. IDB cxBiblioteca: claves cs_biblioteca_{comicId} ─────────────
  // Cada obra tiene su propia biblioteca — clave vinculada por comicId.
  // También recopilar los item.id de animaciones (_apngIdbKey) de las bibliotecas
  // VÁLIDAS, para usarlos en el paso 3.
  const _validBibAnimIds = new Set(); // item.id de animaciones en bibliotecas válidas
  try {
    await new Promise(res => {
      const req = indexedDB.open('cxBiblioteca', 1);
      req.onsuccess = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('bib')) { res(); return; }
        const tx  = db.transaction('bib', 'readonly');
        const cur = tx.objectStore('bib').openCursor();
        cur.onsuccess = ev => {
          const c = ev.target.result;
          if (!c) { res(); return; }
          const k = String(c.key);
          if (k.startsWith('cs_biblioteca_')) {
            const _comicId = k.slice('cs_biblioteca_'.length);
            if (!_comicId) { c.continue(); return; }
            if (!_validIds.has(_comicId)) {
              // Biblioteca huérfana — también recopilar sus animKeys para borrarlas de cxAnims
              try {
                const _bib = c.value;
                if (_bib && Array.isArray(_bib.folders)) {
                  // Biblioteca huérfana: NO añadir sus _apngIdbKey a _validBibAnimIds
                  // → sus animaciones en cxAnims quedarán también como huérfanas
                }
              } catch(_) {}
              _orphans.bib.push(k);
            } else {
              // Biblioteca válida — recopilar sus item.id de animaciones para NO borrarlos
              try {
                const _bib = c.value;
                if (_bib && Array.isArray(_bib.folders)) {
                  _bib.folders.forEach(f => (f.items || []).forEach(item => {
                    if (item._apngIdbKey) _validBibAnimIds.add(item._apngIdbKey);
                  }));
                }
              } catch(_) {}
            }
          }
          c.continue();
        };
        cur.onerror = () => res();
        tx.onerror  = () => res();
      };
      req.onerror = () => res();
    });
  } catch(_e) {}

  // ── 3. IDB cxAnims: claves {uid}__{comicId}_{pi}_{li} y {uid}__bib_{item.id} ──
  // Una clave de obra es huérfana si su comicId no está en _validIds.
  // Una clave de biblioteca es huérfana si su item.id no está en _validBibAnimIds
  // (ninguna biblioteca válida la referencia).
  const _animOrphanKeys = []; // para borrar también las animaciones de bibliotecas huérfanas
  try {
    const _animOrphans = await new Promise(res => {
      const req = indexedDB.open('cxAnims', 1);
      req.onsuccess = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('anims')) { res([]); return; }
        const keys = [];
        const tx  = db.transaction('anims', 'readonly');
        const cur = tx.objectStore('anims').openCursor();
        const _pfx = _uid + '__';
        cur.onsuccess = ev => {
          const c = ev.target.result;
          if (!c) { res(keys); return; }
          const k = String(c.key);
          if (k.startsWith(_pfx)) {
            const _rest = k.slice(_pfx.length); // quitar '{uid}__'
            if (_rest.startsWith('bib_')) {
              // Clave de animación de biblioteca: {uid}__bib_{item.id}
              // Huérfana si nadie en ninguna biblioteca válida la referencia
              if (!_validBibAnimIds.has(k)) keys.push(k);
            } else if (_rest.startsWith('as_')) {
              // Clave temporal de autosave: {uid}__as_{comicId}_{timestamp}
              // Formato: as_comic_{timestamp}_{ts36} → comicId = comic_{timestamp}
              // Válida si su comicId sigue en _validIds. Si no, es huérfana.
              const _asRest = _rest.slice(3); // quitar "as_"
              // comicId = todo menos el último segmento (el timestamp base36)
              const _asParts = _asRest.split('_');
              const _asComicId = _asParts.slice(0, -1).join('_');
              if (_asComicId && !_validIds.has(_asComicId)) keys.push(k);
            } else {
              // Clave de animación de obra: {uid}__{comicId}_{pi}_{li}
              // comicId = todo antes de los dos últimos segmentos (pi y li, numéricos)
              const _parts = _rest.split('_');
              const _comicId = _parts.slice(0, -2).join('_');
              if (_comicId && !_validIds.has(_comicId)) keys.push(k);
            }
          }
          c.continue();
        };
        cur.onerror = () => res(keys);
        tx.onerror  = () => res(keys);
      };
      req.onerror = () => res([]);
    });
    _orphans.anims = _animOrphans;
  } catch(_e) {}

  // ── 4. IDB cxAutosave: claves {uid}_{comicId} ────────────────────────
  // v40.55: apertura sin versión y con cierre garantizado (ver _mcOpenAutosaveDb).
  try {
    const _asConn = await _mcOpenAutosaveDb();
    if (_asConn) {
      try {
        if (_asConn.objectStoreNames.contains('saves')) {
          _orphans.autosave = await new Promise(res => {
            const keys = [];
            const tx  = _asConn.transaction('saves', 'readonly');
            const cur = tx.objectStore('saves').openCursor();
            const _prefix = _uid + '_';
            cur.onsuccess = ev => {
              const c = ev.target.result;
              if (!c) { res(keys); return; }
              const k = String(c.key);
              if (k.startsWith(_prefix)) {
                const _comicId = k.slice(_prefix.length);
                if (_comicId && !_validIds.has(_comicId)) keys.push(k);
              }
              c.continue();
            };
            cur.onerror = () => res(keys);
            tx.onerror  = () => res(keys);
          });
        }
      } finally { try { _asConn.close(); } catch(_) {} }
    }
  } catch(_e) {}

  // ── 5. localStorage: cs_biblioteca_{comicId} y cs_biblioteca_local_{comicId} ──
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('cs_biblioteca_')) {
        // cs_biblioteca_local_* son backups temporales gestionados por su propio ciclo de vida
        // (creados en my-works, borrados en edSaveProject o al salir) — nunca son huérfanos
        if (k.startsWith('cs_biblioteca_local_')) continue;
        const _rest = k.slice('cs_biblioteca_'.length);
        if (_rest && !_validIds.has(_rest)) _orphans.ls.push(k);
      }
    }
  } catch(_e) {}

  // ── ¿Hay algo que limpiar? ────────────────────────────────────────────
  const _total = _orphans.opfs.length + _orphans.anims.length +
                 _orphans.autosave.length + _orphans.bib.length + _orphans.ls.length;
  if (_total === 0) return;

  // Umbral mínimo: si solo hay claves IDB menores (anims+autosave ≤ 5) y nada en OPFS/bib/ls,
  // limpiar silenciosamente sin molestar al usuario.
  // El diálogo solo aparece cuando hay datos significativos que el usuario debería conocer.
  const _silentOnly = _orphans.opfs.length === 0 && _orphans.bib.length === 0 && _orphans.ls.length === 0
                   && (_orphans.anims.length + _orphans.autosave.length) <= 5;
  if (_silentOnly) {
    // Limpiar silenciosamente
    if (_orphans.anims.length) {
      try {
        const _sDb = await new Promise(res => {
          const r = indexedDB.open('cxAnims', 1);
          r.onsuccess = e => res(e.target.result);
          r.onerror = () => res(null);
        });
        if (_sDb && _sDb.objectStoreNames.contains('anims')) {
          const _stx = _sDb.transaction('anims', 'readwrite');
          _orphans.anims.forEach(k => _stx.objectStore('anims').delete(k));
        }
      } catch(_) {}
    }
    if (_orphans.autosave.length) {
      try { await _mcDeleteAutosaveKeys(_orphans.autosave); } catch(_) {}   // v40.55
    }
    return; // sin diálogo
  }

  // ── Aviso al usuario — solo si el usuario sigue en my-works ───────
  if (!document.getElementById('mcContent')) return;
  appConfirm(
    I18n.t('mc_orphanConfirm'),
    async () => {
      // OPFS
      for (const { dir, name } of _orphans.opfs) {
        try { await dir.removeEntry(name); } catch(_e) {}
      }
      // IDB cxAnims (animaciones de obra huérfanas + animaciones de biblioteca huérfana)
      if (_orphans.anims.length) {
        try {
          await new Promise(res => {
            const req = indexedDB.open('cxAnims', 1);
            req.onsuccess = e => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains('anims')) { res(); return; }
              const tx = db.transaction('anims', 'readwrite');
              const st = tx.objectStore('anims');
              _orphans.anims.forEach(k => st.delete(k));
              tx.oncomplete = res; tx.onerror = res;
            };
            req.onerror = res;
          });
        } catch(_e) {}
      }
      // IDB cxAutosave (v40.55: conexión sin versión, cerrada al terminar)
      if (_orphans.autosave.length) {
        try { await _mcDeleteAutosaveKeys(_orphans.autosave); } catch(_e) {}
      }
      // IDB cxBiblioteca
      if (_orphans.bib.length) {
        try {
          await new Promise(res => {
            const req = indexedDB.open('cxBiblioteca', 1);
            req.onsuccess = e => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains('bib')) { res(); return; }
              const tx = db.transaction('bib', 'readwrite');
              const st = tx.objectStore('bib');
              _orphans.bib.forEach(k => st.delete(k));
              tx.oncomplete = res; tx.onerror = res;
            };
            req.onerror = res;
          });
        } catch(_e) {}
      }
      // localStorage
      _orphans.ls.forEach(k => { try { localStorage.removeItem(k); } catch(_e) {} });

      _mcToast(I18n.t('mc_orphanDone'));
    },
    I18n.t('mc_orphanConfirmBtn')
  );
}

function _mcCheckStorage() {
  setTimeout(function() {
    try {
      if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return;
      try { if (sessionStorage.getItem('cx_storage_warned')) return; } catch(_) {}
      navigator.storage.estimate().then(function(est) {
        try {
          var usage = est.usage || 0, quota = est.quota || 0;
          if (quota < 1024 * 1024) return;
          var pct = usage / quota;
          if (pct < 0.85) return;
          try { sessionStorage.setItem('cx_storage_warned', '1'); } catch(_) {}
          var usedMB  = Math.round(usage  / (1024 * 1024));
          var quotaMB = Math.round(quota  / (1024 * 1024));
          var pctStr  = Math.round(pct * 100) + '%';
          try { document.getElementById('cx-storage-warning')?.remove(); } catch(_) {}
          var ov = document.createElement('div');
          ov.id = 'cx-storage-warning';
          ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box';
          ov.innerHTML = '<div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:380px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.28);text-align:center;font-family:sans-serif">'
            + '<div style="font-size:2.4rem;margin-bottom:12px">⚠️</div>'
            + '<div style="font-weight:700;font-size:1.1rem;margin-bottom:10px;color:#c0392b">' + I18n.t('mc_storageFullTitle') + '</div>'
            + '<div style="font-size:.95rem;color:#444;margin-bottom:18px;line-height:1.5">'
            + I18n.t('mc_storageFullBody', { usedMB: usedMB, quotaMB: quotaMB, pctStr: pctStr })
            + '</div>'
            + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">'
            + '<button id="_cxSwDismiss" style="padding:10px 22px;border-radius:8px;border:1.5px solid #ccc;background:#f5f5f5;font-size:.95rem;cursor:pointer;font-weight:500">' + I18n.t('mc_storageFullOk') + '</button>'
            + '<button id="_cxSwPurge" style="padding:10px 22px;border-radius:8px;border:none;background:#e74c3c;color:#fff;font-size:.95rem;cursor:pointer;font-weight:600">' + I18n.t('mc_storageFullPurge') + '</button>'
            + '</div></div>';
          document.body.appendChild(ov);
          document.getElementById('_cxSwDismiss').onclick = function() { ov.remove(); };
          document.getElementById('_cxSwPurge').onclick = function() {
            ov.remove();
            var btn = document.getElementById('mcOrphanBtn');
            if (btn) btn.click();
          };
        } catch(_ie) {}
      }).catch(function() {});
    } catch(_e) {}
  }, 1500);
}

function MyWorksView_init() {
  _mcNewAccess();   // v42.11: cada acceso empieza de cero en lo que se «intentó» (ver _mcNewAccess)
  _mcInitTitlePillObserver();
  // Comprobación de fiabilidad del almacenamiento local (localStorage/OPFS/
  // biblioteca) — definida en editor.js. Se dispara aquí, no al arrancar la
  // app entera: una persona puede entrar solo para LEER obras, sin crear ni
  // editar nada, y en ese caso el guardado local no le afecta — mostrarle
  // el aviso sería confuso e irrelevante. "Mis creaciones" es la vista
  // donde de verdad importa. Una sola vez por sesión (poco después de
  // entrar, sin bloquear el resto de la inicialización de la vista).
  if (!window._cxStorageCheckedThisSession && typeof window._cxCheckStorageReliability === 'function') {
    window._cxStorageCheckedThisSession = true;
    setTimeout(() => { window._cxCheckStorageReliability().catch(() => {}); }, 500);
  }
  // Detectar disponibilidad real de IDB probando una escritura en cxAnims.
  // Más fiable que detectar incógnito por APIs — en Chrome incógnito IDB existe
  // pero puede fallar silenciosamente o tener cuota insuficiente.
  window._mcIdbAvail = true; // asumir disponible hasta que la prueba falle
  window._mcIsIncognito = false; // legacy, se mantiene por compatibilidad
  (async () => {
    try {
      await new Promise((res, rej) => {
        const r = indexedDB.open('cxAnims', 1);
        r.onupgradeneeded = e => e.target.result.createObjectStore('anims');
        r.onsuccess = e => {
          const db = e.target.result;
          const tx = db.transaction('anims', 'readwrite');
          tx.objectStore('anims').put('__test__', '__idb_probe__');
          tx.oncomplete = () => {
            // Leer de vuelta para confirmar
            const tx2 = db.transaction('anims', 'readonly');
            const req = tx2.objectStore('anims').get('__idb_probe__');
            req.onsuccess = ev => {
              if (ev.target.result === '__test__') {
                // IDB funciona — limpiar la clave de prueba
                const tx3 = db.transaction('anims', 'readwrite');
                tx3.objectStore('anims').delete('__idb_probe__');
                window._mcIdbAvail = true;
              } else {
                window._mcIdbAvail = false;
              }
              res();
            };
            req.onerror = () => { window._mcIdbAvail = false; res(); };
          };
          tx.onerror = () => { window._mcIdbAvail = false; res(); };
        };
        r.onerror = () => { window._mcIdbAvail = false; res(); };
        setTimeout(res, 2000); // timeout de seguridad
      });
    } catch(_) { window._mcIdbAvail = false; }
  })();
  _mcCheckStorage(); // aviso modal si el almacenamiento supera el 85%
  _mcRenderList();
  _mcBindNav();
  // Sincronizar fechas con Supabase en segundo plano (incluye descarga de biblioteca)
  _mcSyncCloudDates();
  // Buscar y ofrecer limpieza de datos huérfanos — diferido 10s para que:
  // 1. Los guardados asíncronos (OPFS, IDB) terminen antes de escanear
  // 2. _mcSyncCloudDates haya terminado de actualizar el índice
  // 3. No interfiera con la navegación inmediata del usuario
  window._mcOrphanTimer = setTimeout(_mcCheckOrphanData, 10000);
}

/* ── SINCRONIZAR CON LA NUBE — en CADA acceso a «Mis obras» ──
   v42.11 — Petición de Alberto: «Mis obras» debe ponerse al día siempre que se acceda. Antes solo traía las obras nuevas de la
   nube (y el estado «publicada/aprobada») al pulsar el botón «☁️ Mis obras». Ahora, en cada acceso y en segundo plano:
   1) obras que este dispositivo ya tiene: título, género, modo de lectura y estado de publicación como en la nube, y marca
      de «nube más reciente» (lo de siempre, más el estado «aprobada», que solo actualizaba el botón);
   2) obras de la nube que este dispositivo aún NO tiene: se importan (antes solo si no tenía ninguna);
   3) las miniaturas que no pudieron cargarse por falta de red se reintentan (la nube acaba de responder).
   Una sola sincronización a la vez: dos entradas seguidas comparten la misma (no duplican lo importado). */
let _mcSyncRun = null;
function _mcSyncCloudDates() {
  if (_mcSyncRun) return _mcSyncRun;
  _mcSyncRun = _mcSyncCloudDatesInner().catch(() => {}).finally(() => { _mcSyncRun = null; });
  return _mcSyncRun;
}

// Todas las obras del autor en la nube (consulta ligera: metadatos y portada, sin imágenes). null si falla.
async function _mcFetchAuthorIndex(user) {
  const hdrs = await _mcAuthHdrs({ 'Range': '0-999' });   // Range: hasta 1000 resultados (límite PostgREST por defecto)
  return _mcRest(`works?author_id=eq.${encodeURIComponent(user.id)}&order=updated_at.desc` +
    `&select=id,title,author_name,genre,nav_mode,social,published,pending_review,updated_at,cover_url,panel_count`, hdrs, 10000);
}

// Registro local de una obra que solo está en la nube (cloudOnly). Sin imágenes: la portada se pide perezosamente.
let _mcImportSeq = 0;
function _mcCloudWorkRecord(w, user) {
  const pub = !!w.published;
  return {
    id:           'comic_' + Date.now() + '_' + (_mcImportSeq++).toString(36) + Math.random().toString(36).slice(2, 5),
    userId:       user.id,
    username:     user.username,
    supabaseId:   w.id,
    title:        w.title       || I18n.t('noWork'),
    author:       w.author_name || user.username,
    genre:        w.genre       || '',
    navMode:      w.nav_mode    || 'fixed',
    social:       w.social      || '',
    panels:       [],        // NO persistir base64 en localStorage — la portada se pide perezosamente (_mcFillThumb)
    panelCount:   w.panel_count || 0,
    pages:        [],
    published:    pub,
    approved:     pub,
    pendingReview: pub ? false : !!w.pending_review,
    cloudOnly:    true,
    createdAt:    w.created_at  || w.updated_at || new Date().toISOString(),   // (la consulta ligera no pide created_at: columnas solo de las ya usadas por la app)
    updatedAt:    w.updated_at  || new Date().toISOString(),
  };
}

async function _mcSyncCloudDatesInner() {
  if (typeof SupabaseClient === 'undefined') return;
  const _mcUser = Auth.currentUser?.();
  if (typeof Auth === 'undefined' || !_mcUser) return;
  const mine = c => c.userId === _mcUser.id || c.username === _mcUser.username;

  let changed = false;     // ¿hay que repintar la lista?
  let cloudOk = false;     // ¿ha respondido la nube?
  const cloudDates = {};   // supabaseId → updated_at real (aviso de «Sin título» repetido, ver _mcAfterCloudMerge)

  // 1) Obras que este dispositivo ya conoce
  const locals = WorkStore.getAll().filter(c => c.supabaseId && mine(c));
  if (locals.length) {
    try {
      const works = await SupabaseClient.fetchWorksByIds(locals.map(c => c.supabaseId));
      if (works) cloudOk = true;
      for (const w of (works || [])) {
        if (!w || !w.id) continue;
        cloudDates[w.id] = w.updated_at;
        if (w.cover_url) _mcCoverUrls.set(w.id, w.cover_url);
        // La obra se lee AHORA, no la copia de antes de la espera: si entretanto se ha borrado o guardado, ni se resucita
        // ni se pisa lo nuevo.
        const local = WorkStore.getAll().find(c => c.supabaseId === w.id && mine(c));
        if (!local) continue;

        const cloudDate = new Date(w.updated_at || 0);
        const localDate = new Date(local.updatedAt || 0);

        // Actualizar metadatos siempre (título, género, estado publicación)
        let dirty = false;
        // v42.06: si los datos de la obra se cambiaron AQUÍ y aún no se han subido (metaCloudPending, ver
        // _edApplyProjectMeta en editor.js), lo que hay en la nube es justo lo anterior: no puede pisar lo guardado en este
        // dispositivo (al volver a «Mis obras» se perdían, en local, el género y el modo de lectura recién cambiados).
        if (!local.metaCloudPending) {
          if (w.title    && w.title    !== local.title)    { local.title    = w.title;    dirty = true; }
          if (w.genre    && w.genre    !== local.genre)    { local.genre    = w.genre;    dirty = true; }
          if (w.nav_mode && w.nav_mode !== local.navMode)  { local.navMode  = w.nav_mode; dirty = true; }
        }
        if (!_mcPubBusy.has(local.id)) {   // con publicar/despublicar en curso, la nube aún trae el estado anterior
          if (w.published !== undefined && w.published !== local.published) {
            local.published = w.published; dirty = true;
          }
          // v42.11: «aprobada» = publicada en la nube (como ya hacía el botón «☁️ Mis obras»). Sin esto, una obra que se
          // publicaba/despublicaba desde otro dispositivo (o la aprobaba el administrador) seguía saliendo como «Borrador»
          // hasta pulsar el botón de la nube.
          if (w.published !== undefined && !!w.published !== !!local.approved) { local.approved = !!w.published; dirty = true; }
          // Sincronizar pendingReview desde la nube (ahora hay columna pending_review en Supabase)
          const _cloudPending = w.published ? false : (w.pending_review || false);
          if (_cloudPending !== local.pendingReview) { local.pendingReview = _cloudPending; dirty = true; }
        }

        // Si la nube es más reciente: marcar cloudNewer pero preservar editorData local
        // El usuario puede recuperar la versión local desde Proyecto → Recuperar versión del dispositivo
        if (cloudDate > localDate) {
          // la miniatura «preferida» pasa a ser la de la nube (ver _mcThumbOrder): se vuelve a pedir en este acceso
          if (!local.cloudNewer) _mcThumbDone.delete(local.id);
          local.cloudNewer = true;
          // Preservar editorData local bajo localEditorData (no sobreescribir nunca)
          if (local.editorData && !local.localEditorData) {
            local.localEditorData = local.editorData;
          }
          local.editorData = null; // forzar descarga de la versión de nube al editar
          local.updatedAt  = w.updated_at;
          dirty = true;
        }

        if (dirty) { _mcSaveQuiet(local); changed = true; }
      }
    } catch (e) {
      // Silencioso — si no hay red, se usa la versión local
    }
  }

  // 2) Obras de la nube que este dispositivo aún NO tiene (creadas o guardadas en otro dispositivo): se importan como
  //    «solo en la nube». Antes solo se traían si este dispositivo no tenía NINGUNA obra de la nube, o con el botón.
  try {
    const rows = await _mcFetchAuthorIndex(_mcUser);
    if (rows) {
      cloudOk = true;
      for (const w of rows) {
        if (!w || !w.id) continue;
        cloudDates[w.id] = w.updated_at;
        if (w.cover_url) _mcCoverUrls.set(w.id, w.cover_url);
        if (_mcDeleting.has(w.id)) continue;   // se está borrando en la nube: aún sale en el listado, pero no debe volver
        // Comprobar y guardar SIN ningún await entre medias: atómico frente a otra sincronización o al botón de la nube.
        if (WorkStore.getAll().some(c => c.supabaseId === w.id)) continue;
        const rec = _mcCloudWorkRecord(w, _mcUser);
        rec.id = w.id;   // como la importación al entrar de siempre: el id local de una obra traída de la nube ES su id de la nube
        _mcSaveQuiet(rec);
        changed = true;
      }
    }
  } catch (e) {}

  // v41.86: «Sin título» repetido entre obras de la nube y locales (los títulos acaban de sincronizarse)
  if (cloudOk && _mcAfterCloudMerge(_mcUser, cloudDates)) changed = true;

  if (!cloudOk && !changed) return;
  // La nube ha respondido: las miniaturas que fallaron por falta de red / token se piden otra vez.
  const retry = cloudOk ? _mcResetFailedThumbs() : [];
  if (changed) _mcRenderList();                       // el repintado pide por sí solo lo que falte
  else retry.forEach(id => _mcFillThumb(id));

  // La biblioteca es por proyecto — se sincroniza al abrir/guardar cada proyecto en el editor
}

/* ── RENDERIZAR LISTA ── */
// Extrae el userId de sesión de forma segura (namespacing en IDB de animaciones cxAnims)
function _mcSessionUid() {
  try {
    const _s = JSON.parse(localStorage.getItem('cs_session') || 'null');
    return (_s && _s.id) ? String(_s.id).replace(/[^a-zA-Z0-9_-]/g, '_') : '_anon_';
  } catch(_e) { return '_anon_'; }
}

// _mcResolveBiblioteca(comicToEdit): decide qué versión de la biblioteca de ESTA
// obra debe quedar en IndexedDB local justo antes de abrir el editor.
//
// REGLA (pedida explícitamente por Alberto): gana quien sea más reciente, igual
// que ya se hace con las páginas de la obra (localSavedAt vs. updated_at de la
// nube) — la decisión NO depende de si la obra en sí necesitó redescargarse ni
// de heurísticas de "¿parece vacía?". Se compara:
//   - _localModifiedAt: sello que _bibSave() (editor.js) pone en CADA edición
//     real del usuario (añadir/borrar/renombrar) — nunca en escrituras que
//     vienen de la nube.
//   - cloudModifiedAt: el created_at más reciente entre los items ya existentes
//     en Supabase para esta obra (llega como item.timestamp en bibDownload()).
// Si lo local es más reciente Y tiene contenido, se conserva tal cual — nunca
// se sobreescribe a ciegas. En cualquier otro caso, gana la nube (incluye el
// caso de poblar por primera vez un dispositivo nuevo).
//
// Devuelve un objeto de diagnóstico — el mismo que se expone en
// window._mcLastEditDecision.bib para el botón 🩺 del editor.
async function _mcResolveBiblioteca(comicToEdit) {
  const _bibKey  = `cs_biblioteca_${comicToEdit.id}`;
  const _bibUser = typeof Auth !== 'undefined' ? Auth.currentUser?.() : null;
  const _bibSbId = comicToEdit.supabaseId || comicToEdit.id;
  const result = { bibKey: _bibKey, action: 'skipped_no_user_or_id' };
  if (!_bibUser || !_bibUser.id || !_bibSbId || typeof SupabaseClient.bibDownload !== 'function') {
    return result;
  }
  try {
    const localBib = window._bibLoadWithKey ? await window._bibLoadWithKey(_bibKey) : null;
    const localModifiedAt = (localBib && localBib._localModifiedAt) || 0;
    const localItems = (localBib?.folders || []).reduce((n, f) => n + (f.items?.length || 0), 0);
    result.localModifiedAt = localModifiedAt;
    result.localItems = localItems;

    const cloudBib = await SupabaseClient.bibDownload(_bibUser.id, _bibSbId);
    const allCloudItems = (cloudBib?.folders || []).flatMap(f => f.items || []);
    const cloudModifiedAt = allCloudItems.reduce((m, it) => Math.max(m, it.timestamp || 0), 0);
    const cloudItems = allCloudItems.length;
    result.cloudModifiedAt = cloudModifiedAt;
    result.cloudItems = cloudItems;

    if (localItems > 0 && localModifiedAt > cloudModifiedAt) {
      // Lo local es más reciente que lo último subido a la nube — conservar,
      // NO sobreescribir con la nube (esto es lo que fallaba antes).
      result.action = 'kept_local_newer';
      return result;
    }

    if (cloudItems > 0) {
      const _bibIdbW = [];
      // v41.72 — orientación de origen de las animaciones: las filas que subieron versiones anteriores no la traen. Si la copia
      // LOCAL (la que este espejo va a sustituir) sí la tiene para ese mismo objeto, se conserva en vez de perderla para siempre.
      const _localOri = new Map();
      (localBib?.folders || []).forEach(f => (f.items || []).forEach(it => { if (it && it.isGifAnim && it.orientation) _localOri.set(it.id, it.orientation); }));
      let _oriMerged = 0;
      const cleanFolders = cloudBib.folders.map(cf => ({
        ...cf,
        items: cf.items.map(item => {
          if (item.isGifAnim && !item.orientation && _localOri.has(item.id)) { item.orientation = _localOri.get(item.id); _oriMerged++; }
          if (item.isGifAnim && item.apngSrc) {
            const _uid = _mcSessionUid();
            const _k = _uid + '__bib_' + item.id;
            if (window._sbAnimIdbSave) _bibIdbW.push(window._sbAnimIdbSave(_k, item.apngSrc).catch(() => {}));
            const c = Object.assign({}, item);
            delete c.apngSrc;
            c._apngIdbKey = _k;
            return c;
          }
          return item;
        })
      }));
      if (_bibIdbW.length) await Promise.all(_bibIdbW);
      // _localModifiedAt se sella con la fecha de la NUBE, no con "ahora": esto
      // es un espejo de la nube, no una edición local nueva.
      const _toSave = { folders: cleanFolders, _localModifiedAt: cloudModifiedAt };
      if (window._bibSaveWithKey) await window._bibSaveWithKey(_toSave, _bibKey);
      else if (window._bibSave) await window._bibSave(_toSave);
      else { try { localStorage.setItem(_bibKey, JSON.stringify(_toSave)); } catch(e) {} }
      result.action = 'overwritten_from_cloud';
      if (_oriMerged) result.orientMerged = _oriMerged; // lo local ya NO es idéntico a la nube (ver _edBibNoteMirroredSync)
    } else if (localItems === 0) {
      // Ambos vacíos — dejar un scaffold vacío limpio
      const _emptyBib = { folders: [{ id: '__root__', name: 'General', items: [] }, { id: '__anim__', name: 'Animaciones', items: [] }], _localModifiedAt: 0 };
      if (window._bibSaveWithKey) await window._bibSaveWithKey(_emptyBib, _bibKey);
      else if (window._bibSave) await window._bibSave(_emptyBib);
      result.action = 'both_empty';
    } else {
      // Local tiene items pero sin _localModifiedAt (dato guardado antes de
      // este sello) y la nube está vacía — conservar lo local en vez de borrarlo.
      result.action = 'kept_local_legacy_no_timestamp';
    }
  } catch (e) {
    result.action = 'error: ' + e.message;
  }
  return result;
}

function _mcRenderList() {
  const wrap = document.getElementById('mcContent');
  if (!wrap) return;

  const user = Auth.currentUser?.() || null;

  // Sin login: mostrar proyectos anónimos locales + banner de login
  const _anonId = '_anon_';
  const comics = WorkStore.getAll()
    .filter(c => user
      ? (c.userId === user.id || c.username === user.username)
      : (c.userId === _anonId || c.anonymous === true))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  // Banner de login para usuarios no autenticados
  const _loginBanner = user ? '' : `
    <div id="mcAnonBanner" style="background:var(--blue);color:#fff;padding:10px 14px;border-radius:10px;margin-bottom:12px;font-size:.85rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="flex:1">${I18n.t('mc_guestBanner')}</span>
      <button onclick="Router.go('login')" style="background:#fff;color:var(--blue);border:none;border-radius:8px;padding:5px 12px;font-weight:700;cursor:pointer;font-size:.82rem">${I18n.t('pageLogin')}</button>
    </div>`;

  if (!comics.length) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--gray-500)">
        <span style="font-size:3rem;display:block;margin-bottom:12px">📝</span>
        <p style="font-weight:700;font-size:1rem">${I18n.t('mc_emptyTitle')}</p>
        <p style="font-size:.88rem;margin-top:6px">${I18n.t('mc_emptyHint', { btn: I18n.t('mc_createNewBtn') })}</p>
      </div>`;
    return;
  }

  if (!comics.length && !user) {
    wrap.innerHTML = _loginBanner + `
      <div style="text-align:center;padding:40px 20px;color:var(--gray-500)">
        <span style="font-size:3rem;display:block;margin-bottom:12px">📝</span>
        <p style="font-weight:700;font-size:1rem">${I18n.t('mc_emptyTitle')}</p>
        <p style="font-size:.88rem;margin-top:6px">${I18n.t('mc_emptyHint', { btn: I18n.t('mc_createNewBtn') })}</p>
      </div>`;
    return;
  }
  wrap.innerHTML = _loginBanner + comics.map(comic => {
    // BUG CORREGIDO (v38.29 — Alberto: "la miniatura de my-works solo
    // aparece cuando la obra está en la nube... debe comprobarse cuál es la
    // versión más reciente"). Antes, en cuanto una obra tenía supabaseId
    // (se había subido alguna vez), la miniatura SIEMPRE se tomaba de la
    // nube — aunque hubiera una edición local posterior con una miniatura
    // distinta (p.ej. la primera página cambió), la caché de nube tenía
    // prioridad absoluta sobre la local en la cadena de "||" de más abajo.
    // Esto se recalcula aquí, dentro de _mcRenderList(), así que se
    // actualiza solo cada vez que se entra en Mis Obras — no hace falta
    // ningún paso adicional para cumplir "debe actualizarse cada vez que
    // se acceda a my-works".
    // v42.11: la elección «versión más reciente» (local o nube) y el respaldo en la otra fuente viven ahora en
    // _mcThumbView / _mcThumbOrder / _mcFillThumb (ver «MINIATURAS DE MIS OBRAS»): aquí solo se pinta lo que ya se tiene
    // (imagen, ⏳ si se va a pedir, 📄 si no hay nada) y se marca la fila para pedirla cuando esté cerca de la pantalla.
    const _tv = _mcThumbView(comic);
    const pages = comic.panelCount || (comic.pages ? comic.pages.length : (comic.panels ? comic.panels.length : 0));
    const pubLabel = comic.approved
      ? I18n.t('mc_pubApproved')
      : (comic.pendingReview ? I18n.t('mc_pubPending') : I18n.t('mc_pubDraft'));

    return `
    <div class="work-row" data-id="${comic.id}">
      <div class="work-row-thumb" ${_tv.fill ? `data-thumb-fill="${comic.id}"` : ''}>
        ${_mcThumbHtml(_tv, comic)}
      </div>
      <div class="work-row-info">
        <div class="work-row-title">${comic.title || I18n.t('noWork')}</div>
        <div class="work-row-author" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>${comic.author || comic.username || ''}</span>
          ${comic.genre ? `<span style="color:var(--gray-400)">·</span><span style="color:var(--blue);font-size:.75rem;font-weight:700">${comic.genre}</span>` : ''}
          <span style="color:var(--gray-400)">·</span>
          <span style="font-size:.75rem;font-weight:700">${I18n.t('mc_pagesCount', { n: Math.max(1, pages) })}</span>

        </div>
        <div class="work-row-actions">
          <!-- "Leer" únicamente en función de supabaseId (subida a la nube,
               aunque sea como borrador) — petición explícita de Alberto:
               CUALQUIER obra con supabaseId debe ofrecer "Leer", sin
               condición adicional sobre "pages" (que puede salir 0/falso en
               el índice local aunque la obra tenga contenido real en la
               nube). Una obra guardada SOLO en local (p.ej. recién
               renombrada, que se bifurca a un id nuevo sin supabaseId hasta
               el siguiente guardado en la nube — ver _edForkToId en
               editor.js) sigue sin mostrarlo, porque no tiene supabaseId. -->
          ${comic.supabaseId ? `<button class="work-row-btn" data-action="read" data-id="${comic.id}">${I18n.t('read')}</button>` : ''}
          <button class="work-row-btn edit" data-action="edit" data-id="${comic.id}">${I18n.t('edit')}</button>
          ${comic.approved
            ? `<button class="work-row-btn unpub" data-action="unpublish" data-id="${comic.id}">${I18n.t('mc_unpubPublished')}</button>`
            : (comic.pendingReview
                ? `<button class="work-row-btn unpub" data-action="unpublish" data-id="${comic.id}">${I18n.t('mc_unpubPending')}</button>`
                : `<button class="work-row-btn" style="color:var(--blue)" data-action="publish" data-id="${comic.id}">${I18n.t('mc_publishBtn')}</button>`)
          }
          <button class="work-row-btn" data-action="share" data-id="${comic.id}">${shareIconSvg()} ${I18n.t('home_share')}</button>
          <button class="work-row-btn del" data-action="delete" data-id="${comic.id}" style="color:#e63030;font-weight:900">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Botón de diagnóstico oculto a petición de Alberto (no borrar):
  // para volver a mostrarlo, descomentar el bloque de abajo.
  /*
  {
    let _diagDiv = document.getElementById('_mcDiagBtn');
    if (!_diagDiv) {
      _diagDiv = document.createElement('div');
      _diagDiv.id = '_mcDiagBtn';
      _diagDiv.style.cssText = 'text-align:center;padding:8px;margin-top:4px';
      _diagDiv.innerHTML = '<button style="font-size:.7rem;padding:3px 10px;background:transparent;border:1px solid var(--gray-400);border-radius:8px;color:var(--gray-500);cursor:pointer">🔍 Diagnóstico</button>';
      _diagDiv.querySelector('button').onclick = _mcRunDiag;
      wrap.appendChild(_diagDiv);
    }
  }
  */

  // Cargar miniaturas lazy (local y/o nube, con respaldo entre ellas) — ver «MINIATURAS DE MIS OBRAS»
  _mcObserveThumbs(wrap);

  // Eventos de botones — UN solo manejador por lista (v42.11). _mcRenderList se llama varias veces en cada acceso (al
  // entrar, tras la sincronización, tras publicar/borrar…) y antes añadía un manejador NUEVO sobre el mismo contenedor en
  // cada llamada: un toque en ✕, «Enviar a revisión» o «Compartir» ejecutaba la acción tantas veces como repintados
  // hubiera habido (varios avisos de «¿borrar?» a la vez). Ahora se enlaza una sola vez (el contenedor se crea de nuevo
  // en cada acceso, ver Router) y el cuerpo es _mcOnListClick.
  if (!wrap._mcBound) {
    wrap._mcBound = true;
    wrap.addEventListener('click', _mcOnListClick);
    wrap.addEventListener('error', _mcOnThumbError, true);   // el error de una <img> no burbujea: se captura
  }
}

async function _mcOnListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'read') {
      const comic = WorkStore.getById(id);
      if (!comic || !_mcOwns(comic)) return;
      if (comic.supabaseId && comic.published) {
        // Obra publicada: usar el reproductor externo (anon key puede leer)
        const _isFs2 = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (_isFs2) sessionStorage.setItem('cx_was_fs', '1');
        else sessionStorage.removeItem('cx_was_fs');
        // Pestaña nueva — ver _openReaderTab en utils.js (no window.location:
        // la app no debe recargarse/abandonarse al leer una obra, y así
        // pueden tenerse varias lecturas abiertas a la vez).
        _openReaderTab('reader/index.html?id=' + comic.supabaseId + (_isFs2 ? '&fs=1' : ''));
      } else if (comic.supabaseId) {
        // Borrador o en revisión en nube: reader externo con JWT del autor
        const _isFs2 = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (_isFs2) sessionStorage.setItem('cx_was_fs', '1');
        else sessionStorage.removeItem('cx_was_fs');
        // Pestaña nueva — ver _openReaderTab en utils.js (no window.location:
        // la app no debe recargarse/abandonarse al leer una obra, y así
        // pueden tenerse varias lecturas abiertas a la vez).
        _openReaderTab('reader/index.html?draft=' + comic.supabaseId + (_isFs2 ? '&fs=1' : ''));
      } else {
        // Borrador local sin supabaseId: visor interno del SPA
        Router.go('reader', { id });
      }
    } else if (action === 'edit') {
      _mcOpenWorkForEdit(id);
    } else if (action === 'publish') {
      const comic = WorkStore.getById(id);
      if (!comic) return;
      if (typeof Auth !== 'undefined' && !Auth.canManage(comic)) {
        appAlert(I18n.t('mc_noPermPublish'));
        return;
      }
      // 1. Nunca subida a la nube → bloquear
      if (!comic.supabaseId) {
        appAlert(I18n.t('mc_needCloudFirst'));
        return;
      }
      // 2. Comparar fechas: localSavedAt vs la fecha REAL en la nube AHORA MISMO.
      //    BUG CORREGIDO (v38.23 — Alberto: en un dispositivo que no había
      //    editado la obra recientemente, "Enviar a revisión" avisó de que
      //    lo local era más nuevo que la nube, siendo falso — la obra se
      //    había guardado DESPUÉS desde otro dispositivo). Causa: a
      //    diferencia del flujo "Editar" (línea ~982 más arriba, que sí
      //    consulta Supabase en vivo con SupabaseClient.fetchWorksByIds
      //    antes de comparar), este comparaba localSavedAt contra
      //    cloudSavedAt — las dos LOCALES, leídas de WorkStore/IndexedDB de
      //    ESTE dispositivo. cloudSavedAt solo se actualiza cuando ESTE
      //    dispositivo sube con éxito — si otro dispositivo subió una
      //    versión más reciente después, este seguía con su propio
      //    cloudSavedAt desfasado, así que la comparación (local vs. una
      //    caché local desactualizada, no vs. la nube real) podía salir
      //    "local más nuevo" sin serlo. Arreglo: consultar la nube en vivo
      //    aquí también, mismo patrón que "Editar"; si la consulta falla
      //    (sin red, etc.) cae al criterio anterior en vez de bloquear el
      //    envío.
      const _comicFull = WorkStore.getByIdFull
        ? (await WorkStore.getByIdFull(comic.id)) || comic
        : comic;
      const _localAtRaw = _comicFull.localSavedAt || '';
      let _cloudAtRaw = _comicFull.cloudSavedAt || '';
      if (typeof SupabaseClient !== 'undefined') {
        try {
          const _cloudMetaP = await SupabaseClient.fetchWorksByIds([comic.supabaseId]);
          if (_cloudMetaP && _cloudMetaP[0] && _cloudMetaP[0].updated_at) {
            _cloudAtRaw = _cloudMetaP[0].updated_at; // fecha real de la nube ahora mismo, no la cacheada localmente
          }
        } catch(e) { console.warn('fecha nube (publish):', e); }
      }
      const _hasLocalData = !!(_comicFull.editorData?.pages?.length);
      // Local más nueva: tiene datos locales Y (nunca subida a la nube O guardado local posterior a la subida)
      const _localNewer = _hasLocalData && (!_cloudAtRaw || new Date(_localAtRaw || 0) > new Date(_cloudAtRaw));
      // ── Función de envío real ──────────────────────────────────────────────
      const _doSubmit = async () => {
        if (typeof SupabaseClient !== 'undefined') {
          _mcSubmitOverlayShow();
          _mcPubBusy.add(id);
          try {
            WorkStore.save({ ...comic, published: false, approved: false, pendingReview: true });
            _mcRenderList();
            requestAnimationFrame(() => {
              const row  = document.querySelector(`.work-row[data-id="${id}"]`);
              const list = document.getElementById('myWorksList');
              if (!row || !list) return;
              const pt   = parseInt(list.style.paddingTop) || 0;
              const rowTop = row.getBoundingClientRect().top + window.scrollY - pt;
              window.scrollTo({ top: rowTop, behavior: 'smooth' });
            });
            await SupabaseClient.submitForReviewOnly(comic.supabaseId);
            _mcSubmitOverlayHide();
            _mcToast(I18n.t('mc_sentForReview'));
          } catch(err) {
            _mcSubmitOverlayHide();
            WorkStore.save({ ...comic, pendingReview: false });
            _mcRenderList();
            _mcToast(I18n.t('mc_errSubmit') + err.message);
          } finally {
            _mcPubBusy.delete(id);
          }
        } else {
          _mcToast(I18n.t('mc_sentForReview'));
        }
      };

      // 3. Versión local más nueva que la nube → advertir pero permitir continuar
      if (_localNewer) {
        appConfirm(
          I18n.t('mc_localNewerPublish'),
          _doSubmit,
          I18n.t('mc_continueAnyway')
        );
        return;
      }

      // 4. La nube es la versión más reciente (o no hay datos locales) → enviar directamente
      await _doSubmit();
    } else if (action === 'unpublish') {
      const comic = WorkStore.getById(id);
      if (!comic) return;
      if (typeof Auth !== 'undefined' && !Auth.canManage(comic)) {
        appAlert(I18n.t('mc_noPermUnpublish'));
        return;
      }
      WorkStore.save({ ...comic, published: false, approved: false, pendingReview: false });
      if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
        _mcPubBusy.add(id);
        SupabaseClient.unpublishWork(comic.id, comic.supabaseId)
          .catch(err => { _mcToast(I18n.t('mc_errUnpublishCloud') + err.message); })
          .finally(() => { _mcPubBusy.delete(id); });
      }
      // Invalidar cache de portada para que desaparezca del índice
      if (typeof homeInvalidateCache === 'function') homeInvalidateCache();
      _mcRenderList();
      _mcToast(I18n.t('mc_unpublishedFromHome'));
    } else if (action === 'delete') {
      const comic = WorkStore.getById(id);
      if (!comic || !_mcOwns(comic)) return;
      // Obras solo locales (sin supabaseId) pueden eliminarse sin sesión
      const _canDel = !comic.supabaseId ||
        (typeof Auth !== 'undefined' && Auth.canManage(comic));
      if (!_canDel) {
        appAlert(I18n.t('mc_noPermDelete'));
        return;
      }
      appConfirm(I18n.t('mc_confirmDeleteWork'), ()=>{
        WorkStore.remove(id);
        _mcRenderList();
        // Invalidar cache de portada
        if (typeof homeInvalidateCache === 'function') homeInvalidateCache();
        if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
          _mcDeleting.add(comic.supabaseId);
          SupabaseClient.deleteWork(comic.supabaseId)
            .then(() => _mcToast(I18n.t('mc_deletedOkCheck')))
            .catch(err => _mcToast(I18n.t('mc_errDeleteCloudPartial') + err.message))
            .finally(() => { _mcDeleting.delete(comic.supabaseId); });
        } else {
          _mcToast(I18n.t('deleteOk'));
        }
      });
    } else if (action === 'share') {
      const comic = WorkStore.getById(id);
      if (!comic || !_mcOwns(comic)) return;
      // 1. Verificar que la obra ha sido subida a la nube al menos una vez
      if (!comic.supabaseId) {
        appAlert(I18n.t('mc_notInCloudShare'));
        return;
      }
      // 2. Comparar localSavedAt vs la fecha REAL en la nube AHORA MISMO.
      //    NOTA: updatedAt no es fiable aquí — WorkStore.save() lo sobreescribe siempre
      //    con new Date(), por lo que no refleja la fecha real de la última subida a la nube.
      //    v38.23 — mismo arreglo que "Enviar a revisión" (ver ahí el porqué
      //    completo): cloudSavedAt cacheado localmente solo se actualiza
      //    cuando ESTE dispositivo sube con éxito, así que si otro
      //    dispositivo subió una versión más reciente, este avisaba de
      //    "local más nuevo" sin serlo de verdad. Consultar la nube en vivo
      //    aquí también; si falla (sin red, etc.), cae al criterio anterior.
      const _localAt = comic.localSavedAt || '';
      let _cloudAt = comic.cloudSavedAt || '';
      if (typeof SupabaseClient !== 'undefined') {
        try {
          const _cloudMetaS = await SupabaseClient.fetchWorksByIds([comic.supabaseId]);
          if (_cloudMetaS && _cloudMetaS[0] && _cloudMetaS[0].updated_at) {
            _cloudAt = _cloudMetaS[0].updated_at;
          }
        } catch(e) { console.warn('fecha nube (share):', e); }
      }
      // 2. Versión local más nueva que la nube → advertir pero dar opción de continuar
      if (_localAt && _cloudAt && new Date(_localAt) > new Date(_cloudAt)) {
        appConfirm(
          I18n.t('mc_localNewerShare'),
          () => { if (typeof openShareModal !== 'undefined') openShareModal(comic); },
          I18n.t('mc_continueAnyway')
        );
        return;
      }
      if (typeof openShareModal !== 'undefined') openShareModal(comic);
    }
}

/* ── ABRIR UNA OBRA PARA EDITAR (v40.49) ──
   Un único camino para «Editar» y para «sobrescribir» una obra con el mismo
   título, de modo que NINGUNA vía abra el editor sin haber consultado la nube.
   Reglas (petición de Alberto):
   · La nube se consulta siempre; nunca se abre una versión cacheada sin contrastarla.
   · Nube más nueva que la temporal/local → se abre la de la nube y se borra la temporal.
   · Nube inaccesible → sin versión local, error; con ella, aviso y pregunta.
   · Después, con cambios sin guardar, edLoadProject pregunta si recuperarlos. */

// Milisegundos de una fecha de la nube (0 si falta o no se puede leer). Tolera los
// formatos de PostgREST: «+00:00» / «Z» / «+00», microsegundos (se recortan a
// milisegundos, lo que entienden todos los navegadores) y fecha sin zona horaria
// (columna «timestamp» sin tz → se toma como UTC).
function _mcIsoMs(v) { return cxIsoMs(v); }   // implementación compartida en utils.js (v40.50)

// ¿La versión de la nube es más nueva que la de este dispositivo? — función pura.
// Patrón estándar de concurrencia optimista (como ETag / If-Match): se compara la
// revisión ACTUAL de la nube (works.updated_at) con la revisión en la que se basa
// lo de este dispositivo, por IGUALDAD. Distinta = alguien (otro dispositivo) ha
// guardado después. No depende de que los relojes de los dispositivos coincidan
// ni de que «guardar local y luego subir» deje la nube unos instantes por delante.
//   · Hay versión temporal con base (baseCloudRev): esa es la revisión de partida.
//     Se descarta el temporal si la revisión cambió Y la nube es posterior a él.
//   · Temporal antigua sin base (autoguardada antes de v40.49): solo se pueden
//     comparar fechas → nube posterior al temporal.
//   · Sin temporal: se compara con cloudRev (la de la última descarga/subida de
//     este dispositivo). Obras anteriores a v40.49 aún sin cloudRev: criterio de
//     siempre (nube posterior al último guardado local) hasta la primera
//     descarga o subida, que ya la registra.
function _mcCloudNewerDecision(p) {
  const cloudMs = _mcIsoMs(p.cloudUpdatedAt);
  if (!cloudMs) return { newer: false, reason: 'la nube no devuelve fecha' };
  if (p.hasTemp) {
    const baseMs = _mcIsoMs(p.tempBaseRev);
    if (baseMs) {
      if (cloudMs === baseMs) return { newer: false, reason: 'temporal: la nube no ha cambiado desde que partió' };
      // La nube cambió desde que partió el temporal. Solo se descarta el temporal si
      // además la nube es POSTERIOR a él (regla de Alberto: «nube más nueva que la
      // versión temporal»). Si el temporal es posterior (edición simultánea en dos
      // dispositivos) no se destruye trabajo más reciente sin preguntar: se ofrece
      // recuperarlo como siempre. La igualdad de revisión de arriba, en cambio, evita
      // el falso «nube más nueva» por desfase de relojes o por guardar local y luego subir.
      return cloudMs > (p.tempTs || 0)
        ? { newer: true,  reason: 'temporal: la nube ha cambiado desde que partió y es posterior al temporal' }
        : { newer: false, reason: 'temporal: la nube cambió pero el temporal es posterior (edición simultánea): se ofrece recuperarlo' };
    }
    return cloudMs > (p.tempTs || 0)
      ? { newer: true,  reason: 'temporal sin base: la nube es posterior al temporal (fechas)' }
      : { newer: false, reason: 'temporal sin base: el temporal es posterior a la nube (fechas)' };
  }
  const revMs = _mcIsoMs(p.cloudRev);
  if (revMs) {
    return cloudMs !== revMs
      ? { newer: true,  reason: 'sin temporal: la nube tiene otra revisión distinta de la local' }
      : { newer: false, reason: 'sin temporal: la nube tiene la misma revisión que lo local' };
  }
  const localMs = _mcIsoMs(p.localSavedAt || p.updatedAt);
  return cloudMs > localMs
    ? { newer: true,  reason: 'sin revisión guardada: la nube es posterior al último guardado local (fechas)' }
    : { newer: false, reason: 'sin revisión guardada: lo local es igual o posterior a la nube (fechas)' };
}

async function _mcOpenWorkForEdit(id) {
  // Protección anti-doble-tap: en Android touch el evento puede dispararse dos veces
  if (window._mcEditLock) return;
  window._mcEditLock = true;
  setTimeout(() => { window._mcEditLock = false; }, 3000);
  // Contador bloqueante: se inicia AQUÍ, en el primer tick posible tras el toque,
  // y bloquea la app hasta que el editor general confirme la carga completa
  // (ver _cxLoadOverlayHide en EditorView_init, editor.js). Sustituye al toast
  // que antes solo avisaba de la descarga de la nube — ahora cubre TODA la
  // apertura, incluidas las obras que no necesitan descargarse.
  if (typeof _cxLoadOverlayShow === 'function') _cxLoadOverlayShow(I18n.t('mc_openingWork'));
  // v41.69: cada etapa que termina (lectura de la obra, descarga, escrituras, biblioteca…) anota «progreso real» al
  // contador: su red de seguridad (utils.js, _cxLoadOverlayArmSafety) solo da la carga por colgada tras 25 s SIN
  // progreso; antes se agotaba durante aperturas lentas pero sanas (móvil con obra pesada y descarga lenta).
  const _pk = () => { if (typeof _cxLoadOverlayPoke === 'function') _cxLoadOverlayPoke(); };
  const _comicMeta = WorkStore.getById(id);
  if (!_comicMeta || !_mcOwns(_comicMeta)) {
    window._mcEditLock = false;
    if (typeof _cxLoadOverlayHide === 'function') _cxLoadOverlayHide();
    return;
  }
  const comicToEdit = WorkStore.getByIdFull
    ? (await WorkStore.getByIdFull(id))
    : WorkStore.getById(id);
  _pk();
  // Si es cloudOnly (descargada de la nube sin editorData local), descargar primero.
  // También re-descargar si hay strokes en formato antiguo (sin x/y/width/height) —
  // esos strokes se renderizan incorrectamente con las versiones nuevas del editor.
  const _hasLegacyStrokes = (comicToEdit.editorData?.pages||[]).some(pg =>
    (pg.layers||[]).some(l => l.type === 'stroke' && l.x == null)
  );
  // ── v40.49 — QUÉ VERSIÓN SE ABRE ───────────────────────────────────
  // Petición de Alberto: la obra puede haberse continuado en OTRO
  // dispositivo. Por tanto:
  //  1) La nube se consulta SIEMPRE antes de abrir (token refrescado y sin
  //     caché). Nunca se sirve una versión local a ciegas.
  //  2) Si la nube tiene una versión más nueva que la temporal (autoguardado)
  //     o que la local, se abre la de la nube y la temporal de este
  //     dispositivo se BORRA.
  //  3) Si no, todo sigue igual que antes: con cambios sin guardar,
  //     edLoadProject pregunta si recuperarlos.
  //
  // Hasta v40.48, con un autoguardado más nuevo que el último guardado local
  // ni siquiera se consultaba la nube (arreglo de v39.65 §3.7a, pensado para
  // que «la nube parezca siempre unos instantes más nueva» tras guardar en
  // ella no descartase trabajo): se abría la copia local y se preguntaba por
  // recuperar aunque otro dispositivo hubiera guardado después.
  //
  // «¿La nube es más nueva?» ya no se decide comparando relojes de
  // dispositivos distintos sino con la revisión de la nube en la que se basa
  // lo de este dispositivo (WorkStore.getCloudRev) y en la que partió el
  // autoguardado (baseCloudRev) — ver _mcCloudNewerDecision.
  let _asPending = null; // autoguardado (versión temporal) válido de esta obra, si lo hay
  try {
    const _asRead = (typeof _edAutosaveRead === 'function') ? await _edAutosaveRead(id) : null;
    if (_asRead && _asRead.pages && _asRead.pages.length && _asRead.ts) _asPending = _asRead;
  } catch(_e) { /* sin acceso al autoguardado: se sigue como si no hubiera temporal */ }
  _pk();

  const _hasLocalVersion = !!(comicToEdit.editorData?.pages?.length);
  let _cloudRow = null;         // fila `works` de la nube (null si la obra no existe allí)
  let _cloudCheckFailed = null; // Error si NO se ha podido consultar la nube
  if (comicToEdit.supabaseId && typeof SupabaseClient !== 'undefined') {
    if (typeof _cxLoadOverlayUpdate === 'function') _cxLoadOverlayUpdate(I18n.t('mc_checkingCloud'));
    try {
      // fetchWorksByIds refresca el token y lee con cache:'no-store'. El tope
      // de 12 s cubre también el refresco, que no tiene tiempo límite propio.
      const _cm = await Promise.race([
        SupabaseClient.fetchWorksByIds([comicToEdit.supabaseId]),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout comprobando la nube')), 12000)),
      ]);
      _cloudRow = (_cm && _cm[0]) || null;
    } catch(e) {
      _cloudCheckFailed = e || new Error('No se pudo consultar la nube');
      console.warn('fecha nube:', e);
    }
    if (typeof _cxLoadOverlayUpdate === 'function') _cxLoadOverlayUpdate(I18n.t('mc_openingWork'));
  }
  const _cloudRev = (WorkStore.getCloudRev && WorkStore.getCloudRev(comicToEdit.id)) || null;
  const _decision = _cloudRow
    ? _mcCloudNewerDecision({
        cloudUpdatedAt: _cloudRow.updated_at,
        cloudRev:       _cloudRev,
        hasTemp:        !!_asPending,
        tempTs:         _asPending ? _asPending.ts : 0,
        tempBaseRev:    _asPending ? _asPending.baseCloudRev : null,
        localSavedAt:   comicToEdit.localSavedAt,
        updatedAt:      comicToEdit.updatedAt,
      })
    : { newer: false, reason: _cloudCheckFailed ? 'nube-inaccesible'
                            : (comicToEdit.supabaseId ? 'la-obra-no-existe-en-la-nube' : 'obra-solo-local') };
  const _cloudNewer = _decision.newer;
  // Si localSavedAt es reciente y la nube no es más nueva, confiar en OPFS local
  // aunque editorData no esté en el índice ligero (puede estar en OPFS)
  const _hasLocalSaved = !!(comicToEdit.localSavedAt);
  const _needsDownload = comicToEdit.supabaseId && typeof SupabaseClient !== 'undefined' && !_cloudCheckFailed && (
    comicToEdit.cloudOnly ||
    (!comicToEdit.editorData?.pages?.length && !_hasLocalSaved) ||
    _hasLegacyStrokes ||
    _cloudNewer  // la nube tiene versión más reciente → descargar siempre
  );
  // DIAGNÓSTICO v34.60: registrar la decisión al abrir la obra — visible
  // desde el botón 🩺 del editor (window._mcLastEditDecision). Estos valores
  // (cloudNewer, timestamps comparados, qué rama de biblioteca se ejecutó)
  // no son observables directamente por Alberto, de ahí la instrumentación.
  window._mcLastEditDecision = {
    ts: new Date().toISOString(),
    comicId: id,
    title: comicToEdit.title || '',
    supabaseId: comicToEdit.supabaseId || null,
    cloudOnly: comicToEdit.cloudOnly === true,
    localSavedAt: comicToEdit.localSavedAt || null,
    updatedAt: comicToEdit.updatedAt || null,
    hasLegacyStrokes: _hasLegacyStrokes,
    hasLocalSaved: _hasLocalSaved,
    // v40.49 (botón 🩺: «Última decisión al pulsar Editar»)
    hasTemp: !!_asPending,
    tempTs: _asPending ? _asPending.ts : null,
    tempBaseRev: _asPending ? (_asPending.baseCloudRev || null) : null,
    tempDiscarded: false,          // true si se borra al abrir la de la nube (más abajo)
    cloudChecked: !!(comicToEdit.supabaseId && typeof SupabaseClient !== 'undefined' && !_cloudCheckFailed),
    cloudCheckError: _cloudCheckFailed ? String(_cloudCheckFailed.message || _cloudCheckFailed) : null,
    cloudUpdatedAt: _cloudRow ? (_cloudRow.updated_at || null) : null,
    cloudRev: _cloudRev,
    decisionReason: _decision.reason,
    openedLocalUnverified: false,  // true si se abrió la local sin poder consultar la nube (confirmado)
    cloudNewer: _cloudNewer,
    needsDownload: _needsDownload,
    bib: null, // se completa más abajo, en la rama de biblioteca que corresponda
  };
  // v40.50 — Obra anterior a v40.49 (sin revisión anotada) y la nube NO es más nueva por
  // fechas: se anota ahora la revisión actual de la nube como base de esta copia. Así el
  // PRIMER guardado en la nube de cada obra antigua ya queda protegido (ver
  // _edCloudConflictCheck en editor.js); sin esto la protección solo empezaría tras su
  // primera descarga o subida. Es la misma conclusión que ya se acaba de tomar por fechas
  // («lo local es igual o posterior a la nube»): no la empeora.
  if (_cloudRow && !_cloudRev && !_cloudNewer && _cloudRow.updated_at) {
    try { WorkStore.setCloudRev(comicToEdit.id, _cloudRow.updated_at); } catch(_) {}
    window._mcLastEditDecision.revAdopted = true;
  }

  // ── v40.49 — La nube NO se ha podido consultar ─────────────────────
  // Petición de Alberto: sin nube y sin versión local no hay nada que abrir
  // (nunca se sirve una versión cacheada a ciegas). Con versión local se
  // avisa de que puede estar desactualizada y se pregunta; si acepta, sigue
  // como siempre (con cambios sin guardar, edLoadProject pregunta si
  // recuperarlos). Con trazos en formato antiguo la copia local se ve mal y
  // hace falta la de la nube, así que tampoco se ofrece.
  if (_cloudCheckFailed) {
    if (!_hasLocalVersion || _hasLegacyStrokes) {
      window._mcEditLock = false;
      if (typeof _cxLoadOverlayHide === 'function') _cxLoadOverlayHide();
      if (_hasLocalVersion) _mcToast(I18n.t('mc_errDownloadCloud') + (_cloudCheckFailed.message || ''));
      else appAlert(I18n.t('mc_cloudUnreachableNoLocal'));
      return;
    }
    // El contador bloqueante (z-index mayor) taparía el diálogo: ocultarlo.
    if (typeof _cxLoadOverlayHide === 'function') _cxLoadOverlayHide();
    const _openAnyway = await new Promise(res => {
      appConfirm(I18n.t('mc_cloudUnreachableLocal'), () => res(true),
                 I18n.t('mc_cloudUnreachableYes'), () => res(false));
    });
    if (!_openAnyway) { window._mcEditLock = false; return; }
    window._mcLastEditDecision.openedLocalUnverified = true;
    if (typeof _cxLoadOverlayShow === 'function') _cxLoadOverlayShow(I18n.t('mc_openingWork'));
  }

  if (comicToEdit && _needsDownload) {
    if (typeof _cxLoadOverlayUpdate === 'function') _cxLoadOverlayUpdate(I18n.t('mc_downloadingCloud'));
    try {
      // v42.11: la portada de la nube (con el texto horneado) se baja EN PARALELO a la descarga de la obra y pasa a ser la
      // portada LOCAL de lo recién descargado (más abajo, en el WorkStore.save). Así «Mis obras» sigue mostrándola aunque
      // se salga del editor sin guardar o no haya red (antes este guardado dejaba una portada vacía).
      const _coverP = (_cloudRow && _cloudRow.cover_url) ? _mcUrlToDataUrl(_cloudRow.cover_url) : Promise.resolve('');
      const { work, editorData } = await SupabaseClient.downloadDraftAsEditorData(comicToEdit.supabaseId);
      // Usar window._sbAnimIdbSave (conexión cacheada) para evitar
      // conflictos con otras conexiones abiertas a cxAnims
      const _animIdbSave = (key, data) =>
        (window._sbAnimIdbSave ? window._sbAnimIdbSave(key, data).catch(() => {}) : Promise.resolve())
          .then(_pk); // v41.69: cada animación escrita en IndexedDB = progreso para el contador de carga
      const _idbWrites = [];
      const _edataClean = {
        ...editorData,
        pages: (editorData.pages || []).map((pg, pi) => ({
          ...pg,
          layers: (pg.layers || []).map((l, li) => {
            // _apngSrc: dataUrl APNG descargado de la nube
            if (l._apngSrc) {
              const lClean = Object.assign({}, l);
              delete lClean._animFrames;
              delete lClean._animReady;
              delete lClean._oc;
              if (window._mcIdbAvail !== false) {
                // Modo normal: externalizar a IDB y eliminar _apngSrc del editorData
                const _uid = (() => { try { const _s = JSON.parse(localStorage.getItem('cs_session')||'null'); return (_s&&_s.id)?String(_s.id).replace(/[^a-zA-Z0-9_-]/g,'_'):'_anon_'; } catch(_e){return '_anon_';} })();
                const _idbKey = l._pngFramesKey || (_uid + '__' + comicToEdit.id + '_' + pi + '_' + li);
                _idbWrites.push(_animIdbSave(_idbKey, l._apngSrc));
                delete lClean._apngSrc;
                lClean._pngFramesKey = _idbKey;
              } else {
                // Modo incógnito: OPFS/IDB tienen cuota insuficiente o no persisten.
                // Guardar _apngSrc en store de memoria por comicId+pi+li.
                // edLoadProject lo inyectará en el layer antes de deserializar.
                if (!window._mcIncognitoFrames) window._mcIncognitoFrames = {};
                if (!window._mcIncognitoFrames[comicToEdit.id]) window._mcIncognitoFrames[comicToEdit.id] = {};
                const _frameKey = pi + '_' + li;
                window._mcIncognitoFrames[comicToEdit.id][_frameKey] = l._apngSrc;
                // El layer solo lleva una referencia ligera — el _apngSrc real está en memoria
                delete lClean._apngSrc;
                lClean._mcIncognitoKey = _frameKey; // marca para reconstrucción
              }
              return lClean;
            }
            // _pngFrames (sistema antiguo): externalizar a IDB
            if (l._pngFrames) {
              if (window._mcIdbAvail === false) {
                // Incógnito: guardar en store de memoria
                if (!window._mcIncognitoFrames) window._mcIncognitoFrames = {};
                if (!window._mcIncognitoFrames[comicToEdit.id]) window._mcIncognitoFrames[comicToEdit.id] = {};
                const _fk2 = pi + '_' + li;
                window._mcIncognitoFrames[comicToEdit.id][_fk2] = l._pngFrames;
                const { _pngFrames, ...lClean } = l;
                lClean._mcIncognitoKey = _fk2;
                return lClean;
              }
              const _uid2 = (() => { try { const _s = JSON.parse(localStorage.getItem('cs_session')||'null'); return (_s&&_s.id)?String(_s.id).replace(/[^a-zA-Z0-9_-]/g,'_'):'_anon_'; } catch(_e){return '_anon_';} })();
              const _idbKey = _uid2 + '__' + comicToEdit.id + '_' + pi + '_' + li;
              _idbWrites.push(_animIdbSave(_idbKey, l._pngFrames));
              const { _pngFrames, ...lClean } = l;
              return { ...lClean, _pngFramesKey: _idbKey };
            }
            return l;
          }),
        })),
      };
      // Esperar a que todos los writes de IDB terminen ANTES de abrir el editor
      if (_idbWrites.length) await Promise.all(_idbWrites);
      _pk();
      // v40.45: las muestras de color de la obra (editorData._palette) solo se
      // guardan en local — la nube aún no las lleva. Al sustituir editorData por
      // lo descargado hay que conservarlas, o las muestras volverían a las de
      // por defecto sin que nadie las haya cambiado. Los datos locales previos
      // están en comicToEdit.editorData o, si la nube era más nueva, en
      // comicToEdit.localEditorData (ver la sincronización de más arriba).
      const _keepPalette = comicToEdit.editorData?._palette || comicToEdit.localEditorData?._palette;
      if (_keepPalette && !_edataClean._palette) _edataClean._palette = _keepPalette;
      const _cloudCoverData = await _coverP;   // data URL de la portada de la nube ('' si no hay o no se pudo bajar)
      await WorkStore.save({
        ...comicToEdit,
        ...(_cloudCoverData ? { coverDataUrl: _cloudCoverData } : {}),
        cloudOnly: false,
        cloudNewer: false,
        // Preservar editorData local existente en localEditorData ANTES de sobreescribir
        localEditorData: (comicToEdit.editorData?.pages?.length)
          ? comicToEdit.editorData
          : (comicToEdit.localEditorData || null),
        editorData: _edataClean,
        title:   work.title    || comicToEdit.title,
        genre:   work.genre    || comicToEdit.genre,
        navMode: work.nav_mode || comicToEdit.navMode,
        // Alinear localSavedAt con el instante REAL de guardado del
        // contenido recién descargado (work.updated_at) — NO con el
        // instante de la propia descarga.
        //
        // BUG REAL CORREGIDO (reportado por Alberto: la app se bloqueó,
        // cerró la pestaña confiando en el autoguardado, y al reabrir la
        // obra se cargó sin preguntar y sin ninguno de los cambios
        // recientes). Antes se usaba new Date().toISOString() aquí — un
        // timestamp que no describe el CONTENIDO, solo la ACCIÓN de
        // descargar. edLoadProject descarta el autoguardado sin
        // preguntar cuando localSavedAt >= autosave.ts (ver su
        // comentario) — con el timestamp de descarga, CUALQUIER
        // autoguardado real (de la sesión que se acaba de perder, con
        // cambios genuinos nunca subidos a la nube) queda marcado como
        // "más viejo que el disco" solo porque la descarga en sí
        // ocurrió después, aunque su contenido sea mucho más reciente
        // que lo que se acaba de descargar. work.updated_at es el
        // timestamp real del contenido — con eso, un autoguardado
        // genuinamente más nuevo SIGUE detectándose y preguntándose,
        // exactamente como pide Alberto: solo se descarta sin preguntar
        // cuando de verdad no hay nada más reciente que recuperar.
        localSavedAt: work.updated_at || new Date().toISOString(),
      });
      _pk();
      // v40.49: revisión de la nube en la que se basa lo recién descargado
      // (ver WorkStore.getCloudRev): la próxima vez, si sigue igual, no ha
      // guardado nadie más y se puede abrir lo local con seguridad.
      try { WorkStore.setCloudRev(comicToEdit.id, work.updated_at || null); } catch(_) {}
      // Justo aquí, lo que se va a cargar en el editor ES exactamente lo
      // que hay en la nube ahora mismo (se acaba de descargar y escribir
      // en OPFS) — señal para que edLoadProject pueda tratar también el
      // guardado en nube como "ya sincronizado" en esta carga, en vez de
      // forzar siempre una subida completa en el primer guardado en nube
      // de la sesión. Se consume (se borra) la primera vez que se lee.
      sessionStorage.setItem('cx_just_synced_cloud', '1');
      // Decidir la biblioteca: gana quien sea más reciente (ver _mcResolveBiblioteca),
      // no una heurística ligada a por qué la obra necesitó redescargarse.
      try {
        // Backup de seguridad de la biblioteca local actual, por si _edSaveProject
        // necesita restaurarla (ver su lógica de "_bibCurrentItems===0"). Se
        // mantiene igual que en versiones anteriores como red de seguridad,
        // aunque con la comparación de frescura ya no debería hacer falta.
        const _bibKeyBackup = `cs_biblioteca_${comicToEdit.id}`;
        const _bibLocalBackupKey = `cs_biblioteca_local_${comicToEdit.id}`;
        if (!localStorage.getItem(_bibLocalBackupKey)) {
          const _bibCurrentData = window._bibLoadWithKey ? await window._bibLoadWithKey(_bibKeyBackup) : null;
          if (_bibCurrentData) { try { localStorage.setItem(_bibLocalBackupKey, JSON.stringify(_bibCurrentData)); } catch(e) {} }
        }
      } catch(e) {}
      window._mcLastEditDecision.bib = await _mcResolveBiblioteca(comicToEdit);
      _pk();
      window._mcLastEditDecision.bib.branch = 'needsDownload';
    } catch(err) {
      window._mcEditLock = false;
      if (typeof _cxLoadOverlayHide === 'function') _cxLoadOverlayHide();
      _mcToast(I18n.t('mc_errDownloadCloud') + err.message);
      return;
    }
  }

  // Cuando local es más nueva: no tocar la biblioteca. Ver _mcResolveBiblioteca
  // — la decisión ya no depende de si esta obra necesitó redescargarse.
  if (!_needsDownload) {
    if (_cloudCheckFailed) {
      // Ya se sabe que no hay nube: no gastar otra espera intentando bajar la biblioteca.
      window._mcLastEditDecision.bib = { action: 'skipped_cloud_unreachable', branch: 'cloudUnreachable' };
    } else {
      window._mcLastEditDecision.bib = await _mcResolveBiblioteca(comicToEdit);
      _pk();
      window._mcLastEditDecision.bib.branch = 'notNeedsDownload';
    }
  }

  // El aviso de modo incógnito lo gestiona _edShowIncognitoWarning en editor.js

  // v40.49 — Se abre la versión de la nube PORQUE ES MÁS NUEVA que la
  // temporal: la temporal de este dispositivo se BORRA (petición de Alberto),
  // para no volver a ofrecer recuperarla. Se borra con _edAutosaveClear (la
  // misma conexión —versión 2— y limpieza de frames «as_» que usa el editor):
  // el borrado anterior abría 'cxAutosave' en versión 1, daba VersionError y
  // no hacía nada. Solo se llega aquí si la descarga tuvo éxito (un fallo ya
  // habría salido con return), y solo cuando el motivo es que la nube es más
  // nueva: una descarga por otras razones (trazos antiguos…) no descarta
  // trabajo sin guardar.
  if (_needsDownload && _cloudNewer && _asPending) {
    try {
      if (typeof _edAutosaveClear === 'function') await _edAutosaveClear(id);
      const _still = (typeof _edAutosaveRead === 'function') ? await _edAutosaveRead(id) : null;
      window._mcLastEditDecision.tempDiscarded = !_still;
    } catch(_) { /* no crítico: edLoadProject lo descartará por fecha */ }
  }

  // v41.43: la obra ya está leída y parseada aquí — se la entrega al editor para
  // que no la lea otra vez entera (solo si NO se acaba de descargar de la nube:
  // en ese caso el contenido cambió y el editor la lee de OPFS como siempre).
  if (!_needsDownload && comicToEdit && comicToEdit.editorData && WorkStore.stashFull) {
    WorkStore.stashFull(comicToEdit);
  }
  // Guardar qué proyecto editar y navegar al editor
  sessionStorage.setItem('cx_edit_id', id);
  Router.go('editor');
}

/* ── NAV Y NUEVA OBRA ── */
function _mcBindNav() {
  document.getElementById('mcBackBtn')?.addEventListener('click', () => Router.go('home'));
  document.getElementById('mcCloudLoadBtn')?.addEventListener('click', _mcCloudLoad);
  document.getElementById('mcNewBtn')?.addEventListener('click', _mcCreateBlankWork);
}

/* ── NUEVA OBRA DIRECTA AL EDITOR (v41.86) ───────────────────────────────────────────────────────────
   Antes, «Nueva obra» abría un modal (título, género, modo de lectura, hoja final) que había que rellenar para
   poder empezar. Ahora entra directo al editor: la obra nace llamada «Sin título» («Untitled» en inglés) —o
   «Sin título(2)», «Sin título(3)»… si el usuario ya tiene otra con ese nombre— y con lectura por deslizamiento
   horizontal. Los datos de verdad se piden al GUARDAR, con el modal «Datos del proyecto» del editor
   (editor.js, _edEnsureProjectData), y solo hasta que el usuario los confirma una vez.
   `metaPending: true` es esa marca (local: no tiene columna en la nube ni hace falta). Se pone SOLO en las
   obras nacidas aquí, de modo que las que ya existían o llegan de la nube —que no la llevan— jamás ven el modal.
   Se borra al confirmar el modal de datos, ya sea desde el guardado o desde «Editar datos de la obra». */

// ¿Es esta obra del usuario actual? (mismo criterio que el aviso de título repetido del editor)
function _mcSameOwner(c, user) {
  if (!c) return false;
  if (user) return c.userId === user.id || c.username === user.username;
  return c.userId === '_anon_' || c.anonymous === true;
}

// Primer título libre de la familia: «Sin título», «Sin título(2)», «Sin título(3)»… (o «Untitled»…) que no use ya
// otra obra del usuario. skipBase: parte de «base(2)» (renombrado de una repetida). reserved: títulos ya normalizados que
// se acaban de repartir en esta misma pasada y aún no están en el almacén.
function _mcNextUntitledTitle(user, base, skipBase, reserved) {
  base = base || I18n.t('noWork');
  const norm = s => String(s == null ? '' : s).trim().toLowerCase();
  const used = new Set(reserved || []);
  WorkStore.getAll().forEach(c => { if (_mcSameOwner(c, user)) used.add(norm(c.title)); });
  if (!skipBase && !used.has(norm(base))) return base;
  for (let n = 2; n < 10000; n++) {
    const t = base + '(' + n + ')';
    if (!used.has(norm(t))) return t;
  }
  return base + '(' + Date.now() + ')';
}

function _mcCreateBlankWork() {
  // Doble toque: una sola obra (el cambio de vista no es instantáneo del todo).
  if (window._mcCreatingWork) return;
  window._mcCreatingWork = true;
  setTimeout(() => { window._mcCreatingWork = false; }, 1500);

  const user = Auth.currentUser?.() || null;
  const now  = new Date().toISOString();
  const comic = {
    id:       'comic_' + Date.now(),
    userId:   user ? user.id : '_anon_',
    username: user ? user.username : I18n.t('mc_anonymous'),
    anonymous: !user,
    title:    _mcNextUntitledTitle(user),
    author:   user ? user.username : I18n.t('mc_anonymous'),
    genre:    '',
    social:   '',
    navMode:  'horizontal',   // reproducción por defecto: deslizamiento horizontal
    metaPending: true,        // los datos de la obra aún no los ha confirmado el usuario (ver arriba)
    pages:    [],
    panels:   [],
    published: false,
    approved:  false,
    createdAt: now,
    updatedAt: now,
    // localSavedAt en la creación garantiza que cualquier autosave anterior
    // (de otra obra) no sea más nuevo que esta obra y no aparezca al abrirla.
    localSavedAt: now,
  };
  WorkStore.save(comic);

  // Abrir el editor con este proyecto
  sessionStorage.setItem('cx_edit_id', comic.id);
  Router.go('editor');
}

/* ── «SIN TÍTULO» REPETIDO ENTRE LA NUBE Y ESTE DISPOSITIVO (v41.86) ─────────────────────────────────────
   El usuario puede guardar en la nube una obra «Sin título» desde un dispositivo y, en otro donde ya tenía guardada en
   local otra «Sin título», acabar con DOS obras con el mismo nombre. Cada vez que las obras de la nube se mezclan con
   las locales (sincronización de Mis obras, «Cargar desde la nube») se buscan los títulos repetidos de la familia
   «Sin título» / «Sin título(2)»… / «Untitled»… del usuario, y la obra guardada MÁS RECIENTEMENTE pasa a llamarse
   «Sin título(n)», con n el primer número libre (desde el 2): aquí y, si está en la nube, también allí (solo el título,
   para que todos los dispositivos vean el mismo nombre; si no hay red, la próxima sincronización lo repite).
   · Los títulos escritos a mano por el usuario no se tocan: ya tienen su aviso «sobrescribir o cambiar el nombre».
   · Una obra publicada o en revisión no se renombra sola (se renombra la otra).
   · «Más reciente» = fecha del último guardado (local o en la nube). Las obras recién llegadas de la nube traen su
     fecha real en cloudDates {supabaseId: updated_at}: en el almacén local su updatedAt es la de la importación. */
const _MC_UNTITLED_BASES = ['Sin título', 'Untitled'];
// Base de la familia «Sin título» a la que pertenece un título («Sin título(3)» → «Sin título»), o null si no es de ella.
function _mcUntitledBase(title) {
  const t = String(title == null ? '' : title).trim().replace(/\s*\(\d+\)$/, '').trim().toLowerCase();
  const bases = _MC_UNTITLED_BASES.concat([I18n.t('noWork')]);
  for (const b of bases) if (t === String(b).toLowerCase()) return b;
  return null;
}
// Fecha (ms) del último guardado de una obra: el mayor de lo guardado aquí y lo que la nube dice de ella.
function _mcSavedMs(c, cloudDates) {
  const t = v => { const n = Date.parse(v || ''); return isNaN(n) ? 0 : n; };
  let m = Math.max(t(c.localSavedAt), t(c.cloudSavedAt));
  if (c.supabaseId && cloudDates && cloudDates[c.supabaseId]) m = Math.max(m, t(cloudDates[c.supabaseId]));
  return m || t(c.updatedAt) || t(c.createdAt);
}
// Busca y arregla los «Sin título» repetidos del usuario. Devuelve [{id, from, to}] con lo renombrado.
function _mcResolveUntitledConflicts(user, cloudDates) {
  const out = [];
  if (!user) return out;
  const norm = s => String(s == null ? '' : s).trim().toLowerCase();
  const groups = new Map();
  WorkStore.getAll().forEach(c => {
    if (!_mcSameOwner(c, user) || !_mcUntitledBase(c.title)) return;
    const k = norm(c.title);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  });
  const reserved = new Set();
  groups.forEach(list => {
    // dos registros locales de la MISMA obra de la nube no son un conflicto
    const seen = new Set();
    const uniq = list.filter(c => { const key = c.supabaseId || c.id; if (seen.has(key)) return false; seen.add(key); return true; });
    if (uniq.length < 2) return;
    const movable = uniq.filter(c => !c.published && !c.pendingReview).sort((a, b) =>
      (_mcSavedMs(a, cloudDates) - _mcSavedMs(b, cloudDates)) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
    // si alguna no se puede renombrar (publicada) conserva el nombre y se renombran todas las demás;
    // si no, se queda con él la más antigua y se renombran las más recientes (la más antigua, con el número más bajo)
    const toRename = movable.length < uniq.length ? movable : movable.slice(1);
    const base = _mcUntitledBase(list[0].title);
    toRename.forEach(c => {
      const nt = _mcNextUntitledTitle(user, base, true, reserved);
      reserved.add(norm(nt));
      out.push({ id: c.id, supabaseId: c.supabaseId || null, from: c.title, to: nt });
    });
  });
  out.forEach(r => {
    // keepUpdatedAt: renombrar no es editar — no cambia el orden de la lista ni la fecha con que se compara con la nube
    WorkStore.updateMeta(r.id, { title: r.to }, { keepUpdatedAt: true });
    if (r.supabaseId && typeof SupabaseClient !== 'undefined' && SupabaseClient.renameWork) {
      SupabaseClient.renameWork(r.supabaseId, r.to).catch(() => {});
    }
  });
  return out;
}
// Tras mezclar obras de la nube: arregla los repetidos y avisa (si Mis obras sigue en pantalla). Devuelve cuántas renombró;
// quien llama vuelve a pintar la lista.
function _mcAfterCloudMerge(user, cloudDates, toastDelay) {
  let renamed = [];
  try { renamed = _mcResolveUntitledConflicts(user, cloudDates); } catch (e) { console.error('_mcResolveUntitledConflicts:', e); }
  if (renamed.length) {
    if (document.getElementById('mcContent')) {
      const msg = renamed.length === 1
        ? I18n.t('mc_autoRenamedOne', { from: renamed[0].from, to: renamed[0].to })
        : I18n.t('mc_autoRenamedMany', { n: renamed.length });
      if (toastDelay) setTimeout(() => _mcToast(msg), toastDelay); else _mcToast(msg);
    }
  }
  return renamed.length;
}

/* ── TOAST ── */
function _mcToast(msg) {
  let t = document.getElementById('mcToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'mcToast';
    t.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(8px);
      background:var(--black);color:var(--yellow);padding:8px 20px;border-radius:16px;
      font-size:.82rem;font-weight:700;font-family:'Nunito',sans-serif;
      opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;z-index:9999;
      white-space:nowrap;
    `;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(t._t);
  t._t = setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(8px)';
  }, 2200);
}

function MyWorksView_destroy() {
  // Cancelar el check de huérfanos si aún no se ha ejecutado
  if (window._mcOrphanTimer) { clearTimeout(window._mcOrphanTimer); window._mcOrphanTimer = null; }
}

/* ── CARGAR BORRADORES DESDE NUBE ── */
async function _mcCloudLoad() {
  if (typeof SupabaseClient === 'undefined') { _mcToast(I18n.t('mc_noServerConn')); return; }
  const user = Auth.currentUser();
  if (!user) { _mcToast(I18n.t('mc_loginToLoadCloud')); return; }

  const btn = document.getElementById('mcCloudLoadBtn');
  if (btn) { btn.textContent = '⏳ ' + I18n.t('admin_loading'); btn.disabled = true; }

  try {
    // Buscar en Supabase todas las obras donde author_name coincide con este usuario
    const username = encodeURIComponent(user.username || '');
    // Usar JWT del usuario para que RLS permita leer sus borradores (published=false)
    // v42.11: el token se RENUEVA antes si ha caducado (con el JWT viejo la nube respondía 401, que aquí se leía como «no
    // hay obras en la nube»), y una respuesta que no es correcta se trata como error de conexión.
    const _authHdrs = await _mcAuthHdrs({ 'Range': '0-999' });
    // Range: 0-999 garantiza hasta 1000 resultados (límite PostgREST por defecto)
    const _wr = await fetch(`${_MC_BASE}/works?author_name=eq.${username}&order=updated_at.desc&select=*,panel_count`,
      { headers: _authHdrs, cache: 'no-store' });
    if (!_wr.ok) throw new Error('works: ' + _wr.status);
    const works = await _wr.json();

    if (!Array.isArray(works) || !works.length) {
      _mcToast(I18n.t('mc_noCloudWorks'));
      return;
    }

    let imported = 0, skipped = 0;

    for (const w of works) {
      if (w && w.cover_url) _mcCoverUrls.set(w.id, w.cover_url);   // v42.11: la portada ya viene en la consulta
      // ¿Ya existe localmente con este supabaseId?
      const existing = WorkStore.getAll().find(c => c.supabaseId === w.id);
      if (existing) {
        const cloudDate = new Date(w.updated_at || 0);
        // Comparar contra localSavedAt (cuándo se guardó en este dispositivo)
        // updatedAt se sobreescribe con la fecha de la nube, así que no sirve para comparar
        const localSaved = new Date(existing.localSavedAt || existing.updatedAt || 0);
        const cloudIsNewer = cloudDate > localSaved;

        // Siempre actualizar metadatos básicos
        let dirty = false;
        if (existing.userId !== user.id) { existing.userId = user.id; dirty = true; }
        // v42.06: datos de la obra cambiados aquí y aún sin subir (metaCloudPending) → no los pisa lo que hay en la nube
        // (ver el mismo criterio en _mcSyncCloudDates).
        if (!existing.metaCloudPending) {
          if (w.title    && w.title    !== existing.title)   { existing.title   = w.title;    dirty = true; }
          if (w.genre    && w.genre    !== existing.genre)   { existing.genre   = w.genre;    dirty = true; }
          if (w.nav_mode && w.nav_mode !== existing.navMode) { existing.navMode = w.nav_mode; dirty = true; }
        }
        existing.published     = w.published ?? existing.published;
        existing.approved      = w.published ?? existing.approved;
        // Sincronizar pendingReview desde columna pending_review de Supabase
        existing.pendingReview = w.published ? false : (w.pending_review || false);

        if (cloudIsNewer) {
          // La nube tiene una versión más reciente
          // Preservar editorData local bajo localEditorData para poder restaurar
          if (existing.editorData && !existing.localEditorData) {
            existing.localEditorData = existing.editorData;
          }
          existing.editorData = null; // forzar descarga al editar
          existing.cloudOnly  = true;
          existing.cloudNewer = true;
          existing.updatedAt  = w.updated_at;
          dirty = true;
          imported++; // contar como actualización
        } else {
          skipped++;
        }

        // Migrar thumbnail base64 de localStorage a cache en memoria (libera espacio)
        if (existing.panels && existing.panels[0] && existing.panels[0].dataUrl) {
          if (!_mcThumbCache.has(_mcLK(existing.id))) _mcThumbCache.set(_mcLK(existing.id), existing.panels[0].dataUrl);
          existing.panels = [];
          dirty = true;
        }

        if (dirty) WorkStore.save(existing);
        continue;
      }

      if (_mcDeleting.has(w.id)) continue;   // se está borrando en la nube: aún sale en el listado, pero no debe volver
      // Obra nueva en nube — SIN imágenes en localStorage: la portada (cover_url, ya cacheado arriba; si la obra es antigua
      // y no la tiene, la hoja 1) se pide perezosamente al pintar la fila (ver _mcFillThumb). v42.11: ya no se descarga la
      // hoja 1 entera de cada obra nueva, una a una, antes de poder pintar nada.
      // Un único registro por obra de la nube: se comprueba y se guarda sin ninguna espera entre medias (ver también
      // _mcSyncCloudDates, que importa lo mismo en cada acceso).
      WorkStore.save(_mcCloudWorkRecord(w, user));
      imported++;
    }

    // v41.86: «Sin título» repetido entre las obras de la nube y las locales de este dispositivo
    const _cd3 = {}; works.forEach(w => { if (w && w.id) _cd3[w.id] = w.updated_at; });
    _mcAfterCloudMerge(user, _cd3, (imported > 0 || skipped > 0) ? 2400 : 0);
    _mcResetFailedThumbs();   // la nube responde: lo que no pudo cargarse antes se vuelve a pedir
    _mcRenderList();
    if (imported > 0)      _mcToast(I18n.t(imported > 1 ? 'mc_cloudUpdatedMany' : 'mc_cloudUpdatedOne', { n: imported }));
    else if (skipped > 0)  _mcToast(I18n.t('mc_allUpToDate'));

  } catch(err) {
    console.error('_mcCloudLoad:', err);
    _mcToast(I18n.t('mc_errCloudConnect'));
  } finally {
    if (btn) { btn.textContent = I18n.t('mc_cloudLoadBtnLabel'); btn.disabled = false; }
  }
}

/* ── MODAL READER EMBED (my-works) ── */
function _mcOpenReaderModal(url) {
  let overlay = document.getElementById('mcReaderModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mcReaderModal';
    overlay.className = 'reader-modal';
    overlay.innerHTML = `
      <div class="reader-modal-inner">
        <button class="reader-modal-close" aria-label="${I18n.t('mc_closeAria')}">✕</button>
        <iframe class="reader-modal-frame" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.reader-modal-close').addEventListener('click', _mcCloseReaderModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) _mcCloseReaderModal(); });
    window.addEventListener('message', e => {
      if (e.data?.type === 'reader:close') _mcCloseReaderModal();
    });
  }
  overlay.querySelector('.reader-modal-frame').src = url;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function _mcCloseReaderModal() {
  const overlay = document.getElementById('mcReaderModal');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.querySelector('.reader-modal-frame').src = '';
  document.body.style.overflow = '';
}

// ── DIAGNÓSTICO ──────────────────────────────────────────────────────────────
async function _mcRunDiag() {
  const lines = [];
  const L = s => lines.push(s);
  const ok = s => '✅ ' + s;
  const err = s => '❌ ' + s;
  const warn = s => '⚠️ ' + s;

  L('══ DIAGNÓSTICO BIBLIOTECA ══');
  L(new Date().toLocaleString());

  // 1. localStorage disponible y tamaño
  try {
    const _testKey = '__diag_test__';
    localStorage.setItem(_testKey, '1');
    localStorage.removeItem(_testKey);
    let _lsSize = 0;
    for (let k in localStorage) { if (localStorage.hasOwnProperty(k)) _lsSize += (localStorage[k]||'').length + k.length; }
    L(ok('localStorage: OK (' + Math.round(_lsSize/1024) + ' KB usados)'));
  } catch(e) { L(err('localStorage: ' + e.message)); }

  // 2. IDB cxAnims disponible
  try {
    await new Promise((res, rej) => {
      const r = indexedDB.open('cxAnims', 1);
      r.onupgradeneeded = e => e.target.result.createObjectStore('anims');
      r.onsuccess = e => {
        const db = e.target.result;
        const keys = [];
        const tx = db.transaction('anims', 'readonly');
        const req = tx.objectStore('anims').getAllKeys();
        req.onsuccess = ev => {
          const ks = ev.target.result || [];
          L(ok('IDB cxAnims: OK (' + ks.length + ' entradas) keys=' + ks.slice(0,5).join(',') + (ks.length>5?'...':'')));
          res();
        };
        req.onerror = () => { L(warn('IDB cxAnims: getAllKeys falló')); res(); };
      };
      r.onerror = () => { L(err('IDB cxAnims: no disponible')); rej(); };
    });
  } catch(e) { L(err('IDB: ' + e.message)); }

  // 3. Usuario y supabaseId de obras locales
  const user = (typeof Auth !== 'undefined') ? Auth.currentUser?.() : null;
  L(user ? ok('Usuario: ' + user.username + ' (' + user.id.slice(0,8) + '...)') : err('Sin usuario'));

  // 4. Biblioteca local por obra
  const comics = WorkStore.getAll().filter(c => c.supabaseId);
  L('Obras con supabaseId: ' + comics.length);
  for (const c of comics.slice(0,5)) {
    const _bibKey = 'cs_biblioteca_' + c.id;
    const _bib = (() => { try { return JSON.parse(localStorage.getItem(_bibKey)||'null'); } catch(e) { return null; } })();
    const _animFolder = _bib && _bib.folders && _bib.folders.find(f => f.id === '__anim__');
    const _animCount = _animFolder ? _animFolder.items.length : 0;
    L('  ' + c.title + ' (' + c.id.slice(0,8) + '): bib=' + (_bib?'sí':'NO') + ' animItems=' + _animCount);
    if (_animFolder && _animFolder.items.length) {
      for (const item of _animFolder.items) {
        const hasApngIdbKey = !!item._apngIdbKey;
        const hasApngSrc = !!item.apngSrc;
        L('    item ' + item.id + ': _apngIdbKey=' + (item._apngIdbKey||'NO') + ' apngSrc=' + (hasApngSrc?'sí':'NO'));
        if (item._apngIdbKey && window._sbAnimIdbLoad) {
          try {
            const d = await window._sbAnimIdbLoad(item._apngIdbKey);
            L('    IDB[' + item._apngIdbKey + ']: ' + (d ? (typeof d === 'string' ? 'string('+d.length+')' : 'array('+d.length+')') : 'NULL'));
          } catch(e) { L('    IDB error: ' + e.message); }
        }
      }
    }
  }

  // 5. bibDownload raw para cada obra con supabaseId — ver descompresión
  if (user && comics.length) {
    for (const c of comics.slice(0,5)) {
      const _sbId = c.supabaseId || c.id;
      L('\n── bibDownload: ' + c.title + ' (sbId=' + _sbId.slice(0,8) + '...) ──');
      try {
        // Test directo de bibFetch sin procesar
        const _rows = await SupabaseClient.bibFetchRaw ? await SupabaseClient.bibFetchRaw(user.id, _sbId) : null;
        if (_rows !== null) {
          L('  bibFetchRaw: ' + (_rows ? _rows.length + ' filas' : 'null'));
          if (_rows) _rows.forEach(r => L('  row: id=' + r.id + ' folder=' + (r.folder_id||'?') + ' type=' + r.layer_type + ' anim=' + (r.anim_url?'sí':'NO') + ' bytes=' + (r.layer_data||'').length));
        }
        const cloudData = await SupabaseClient.bibDownload(user.id, _sbId);
        L(ok('bibDownload OK: folders=' + (cloudData?.folders?.length||0)));
        (cloudData?.folders||[]).forEach(f => {
          L('  folder ' + f.id + ': ' + f.items.length + ' items');
          (f.items||[]).forEach(item => {
            L('    ' + item.id.slice(0,16) + ' isGifAnim=' + item.isGifAnim + ' apng=' + (item.apngSrc?'sí('+item.apngSrc.length+')':'NO') + ' gif=' + (item.gifDataUrl?'sí':'NO'));
          });
        });
      } catch(e) { L(err('bibDownload: ' + e.message)); }
    }

    // Test directo de _czDecompress con un dato real de biblioteca
    L('\n── Test _czDecompress ──');
    try {
      if (typeof pako !== 'undefined') { L(ok('pako disponible')); }
      else { L(err('pako NO disponible')); }
      if (typeof DecompressionStream !== 'undefined') { L(ok('DecompressionStream disponible')); }
      else { L(warn('DecompressionStream NO disponible')); }
    } catch(e) { L('APIs check error: ' + e.message); }

  }

  // ── Preview de lo que detectaría el borrador de huérfanos ──────────────
  L('\n══ PREVIEW BORRADOR DE HUÉRFANOS ══');
  try {
    const _user2 = (typeof Auth !== 'undefined') ? Auth.currentUser?.() : null;
    if (!_user2) { L('Sin sesión — no se puede analizar'); }
    else {
      const _validIds2 = new Set(
        WorkStore.getAll()
          .filter(c => c.userId === _user2.id || c.username === _user2.username)
          .map(c => c.id)
      );
      L('IDs válidos en WorkStore: ' + _validIds2.size);
      [..._validIds2].forEach(id => L('  ' + id));

      // localStorage: cs_biblioteca_ y cs_biblioteca_local_
      L('\n── localStorage (cs_biblioteca_*) ──');
      let _lsOrphans = [], _lsValid = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('cs_biblioteca_')) continue;
        const _rest = k.startsWith('cs_biblioteca_local_')
          ? k.slice('cs_biblioteca_local_'.length)
          : k.slice('cs_biblioteca_'.length);
        if (_rest && !_validIds2.has(_rest)) _lsOrphans.push(k + ' (id=' + _rest + ')');
        else _lsValid.push(k + ' (id=' + _rest + ')');
      }
      if (_lsValid.length) _lsValid.forEach(k => L('  ✅ válida: ' + k));
      if (_lsOrphans.length) _lsOrphans.forEach(k => L('  ❌ HUÉRFANA: ' + k));
      if (!_lsValid.length && !_lsOrphans.length) L('  (vacío)');

      // IDB cxBiblioteca
      L('\n── IDB cxBiblioteca ──');
      await new Promise(res => {
        try {
          const _req = indexedDB.open('cxBiblioteca', 1);
          _req.onsuccess = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('bib')) { L('  (sin store bib)'); db.close(); res(); return; }
            const tx = db.transaction('bib', 'readonly');
            const cur = tx.objectStore('bib').openCursor();
            cur.onsuccess = ev => {
              const c = ev.target.result;
              if (!c) { db.close(); res(); return; }
              const k = String(c.key);
              if (k.startsWith('cs_biblioteca_')) {
                const _rest = k.startsWith('cs_biblioteca_local_')
                  ? k.slice('cs_biblioteca_local_'.length)
                  : k.slice('cs_biblioteca_'.length);
                const items = (c.value?.folders||[]).reduce((n,f)=>n+(f.items?.length||0),0);
                if (_rest && !_validIds2.has(_rest))
                  L('  ❌ HUÉRFANA: ' + k + ' (id=' + _rest + ', items=' + items + ')');
                else
                  L('  ✅ válida: ' + k + ' (id=' + _rest + ', items=' + items + ')');
              }
              c.continue();
            };
            cur.onerror = () => { db.close(); res(); };
          };
          _req.onerror = () => { L('  IDB error: ' + _req.error); res(); };
          setTimeout(res, 3000);
        } catch(e) { L('  IDB excepción: ' + e.message); res(); }
      });
    }
  } catch(e) { L('Error preview huérfanos: ' + e.message); }

  // Mostrar panel
  let p = document.getElementById('_mcDiagPanel');
  if (!p) {
    p = document.createElement('div');
    p.id = '_mcDiagPanel';
    p.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#111;color:#0f0;font:11px monospace;display:flex;flex-direction:column;padding:8px;';
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:6px;flex-shrink:0';
    hdr.innerHTML = '<b style="color:#fff">DIAGNÓSTICO BIBLIOTECA</b>';
    const btns = document.createElement('div');
    const cp = document.createElement('button');
    cp.textContent='📋 Copiar'; cp.style.cssText='padding:2px 8px;cursor:pointer;margin-right:4px;';
    cp.onclick=()=>{const ta=document.getElementById('_mcDiagTa');ta.select();document.execCommand('copy');cp.textContent='✓';};
    const cl = document.createElement('button');
    cl.textContent='✕'; cl.style.cssText='padding:2px 8px;cursor:pointer;';
    cl.onclick=()=>p.remove();
    btns.append(cp,cl); hdr.appendChild(btns); p.appendChild(hdr);
    const ta = document.createElement('textarea');
    ta.id='_mcDiagTa';
    ta.style.cssText='flex:1;width:100%;background:#111;color:#0f0;border:none;font:11px monospace;padding:4px;box-sizing:border-box;resize:none;';
    ta.readOnly=true; p.appendChild(ta);
    document.body.appendChild(p);
  }
  document.getElementById('_mcDiagTa').value = lines.join('\n');
}

// ── Overlay de guardado para envío a revisión ──────────────────────────────
function _mcSubmitOverlayShow() {
  let ov = document.getElementById('_mcSubmitOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '_mcSubmitOverlay';
    ov.style.cssText = [
      'position:fixed;inset:0;z-index:99999',
      'background:rgba(0,0,0,0.82)',
      'display:flex;flex-direction:column;align-items:center;justify-content:center',
      'color:#fff;font-family:sans-serif;text-align:center;padding:24px'
    ].join(';');
    ov.innerHTML = `
      <img src="loading-icon.png?v=36.42" alt="${I18n.t('mc_savingAlt')}" style="width:48px;height:auto;margin-bottom:16px">
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:10px">${I18n.t('mc_savingCloudTitle')}</div>
      <div style="font-size:.82rem;opacity:.85;max-width:280px;line-height:1.5;margin-bottom:16px">
        ${I18n.t('mc_savingCloudWarn')}
      </div>
      <span id="_mcSubmitOvSecs" style="font-size:.9rem;opacity:.8">0s</span>
    `;
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
  let _secs = 0;
  document.getElementById('_mcSubmitOvSecs').textContent = '0s';
  ov._timer = setInterval(() => {
    _secs++;
    const el = document.getElementById('_mcSubmitOvSecs');
    if (el) el.textContent = _secs + 's';
    if (_secs >= 120) _mcSubmitOverlayHide(); // seguridad: cierra tras 2 min
  }, 1000);
}

function _mcSubmitOverlayHide() {
  const ov = document.getElementById('_mcSubmitOverlay');
  if (!ov) return;
  if (ov._timer) { clearInterval(ov._timer); ov._timer = null; }
  ov.style.display = 'none';
}
