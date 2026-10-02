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
   supabase-client.js — Comunicación con Supabase
   Thin wrapper sobre fetch. Sin SDK externo.
   ============================================================ */

// ── Compresión gzip de layer_data (CompressionStream W3C nativo) ──────────────
// Comprime JSON strings grandes antes de subir a Supabase.
// Prefijo 'gz:' + base64 identifica datos comprimidos. Sin prefijo = sin comprimir (legado).
// Solo se comprimen strings mayores de 512 bytes — por debajo no merece la pena.
const _CZ_MIN = 512;
const _CZ_PFX = 'gz:';

// v41.46 — ¿es casi todo el texto un dataUrl base64 (PNG/JPEG/WebP ya comprimidos)? Entonces gzip no
// puede reducirlo (ver el comentario de abajo, junto al «solo si pesa menos»): base64 ya es el
// 75 % de la entropía de unos bytes ya comprimidos, y volver a codificar el resultado en base64
// lo vuelve a inflar un 33 % — siempre se acababa DESCARTANDO el resultado, pero solo después de
// comprimir MB enteros y recorrerlos byte a byte en JS para pasarlos a base64 (en un móvil, unas
// décimas de segundo por capa, en cada guardado en nube). Con este atajo se devuelve el original
// directamente: exactamente lo mismo que devolvía la función en ese caso, sin el trabajo.
// Solo cuenta bloques base64 largos (≥ 4000 caracteres seguidos tras «;base64,») para no confundir
// un texto normal con uno de datos.
function _czMostlyBase64(s) {
  if (s.length < 20000) return false;
  const re = /;base64,[A-Za-z0-9+\/=]{4000,}/g;
  let n = 0, m;
  while ((m = re.exec(s))) n += m[0].length;
  return n >= s.length * 0.6;
}

async function _czCompress(jsonStr) {
  // No comprimir si las APIs no están disponibles en este navegador
  if (!jsonStr || jsonStr.length < _CZ_MIN ||
      typeof CompressionStream === 'undefined' ||
      typeof DecompressionStream === 'undefined') return jsonStr;
  if (_czMostlyBase64(jsonStr)) return jsonStr;
  try {
    const bytes = new TextEncoder().encode(jsonStr);
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const reader = cs.readable.getReader();
    let done, value;
    while (!({ done, value } = await reader.read(), done)) chunks.push(value);
    const merged = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    // btoa sin spread operator — evita stack overflow en Android
    // String.fromCharCode con bucle explícito, chunks de 1024 bytes
    let b64 = '';
    const CHUNK = 1024;
    for (let i = 0; i < merged.length; i += CHUNK) {
      const end = Math.min(i + CHUNK, merged.length);
      let bin = '';
      for (let j = i; j < end; j++) bin += String.fromCharCode(merged[j]);
      b64 += btoa(bin);
    }
    const _compressed = _CZ_PFX + b64;
    // BUG CORREGIDO (reportado por Alberto: "un objeto o grupo muy grande"
    // no se sube a la nube; confirmado con datos reales — ver comentario de
    // bibSync/_uploadPanels). gzip apenas reduce datos de ALTA ENTROPÍA
    // (una imagen o dibujo YA comprimido, embebido como dataUrl base64 —
    // justo lo más probable en un objeto/grupo grande) porque ya no tienen
    // la redundancia que gzip explota — y luego hace falta volver a
    // codificar el resultado en base64 para poder guardarlo como texto, lo
    // que añade ~33% MÁS por sí solo. Con contenido así, "comprimir" podía
    // acabar dando un resultado IGUAL o MAYOR que el original — justo en
    // los objetos con más probabilidad de rozar el límite de tamaño de
    // subida, la "compresión" los empujaba por encima en vez de ayudar.
    // Con datos vectoriales/repetitivos (trazos, puntos) sigue reduciendo
    // muchísimo (comprobado: a una quinta parte) — el problema es solo con
    // datos ya comprimidos. Arreglo estándar: quedarse con la versión
    // comprimida SOLO si de verdad pesa menos que el original.
    return (_compressed.length < jsonStr.length) ? _compressed : jsonStr;
  } catch(e) { return jsonStr; } // fallback: sin comprimir
}

async function _czDecompress(str) {
  if (!str || !str.startsWith(_CZ_PFX)) return str;
  // Decodificar base64 → Uint8Array (chunks de 32768 chars, múltiplos de 4)
  const b64 = str.slice(_CZ_PFX.length);
  // Intentar decodificar base64 completo de una vez primero
  // Si falla (base64 corrupto por chunks), intentar chunk a chunk
  let bytes = null;
  try {
    // Intentar atob completo con padding
    const rem0 = b64.length % 4;
    const padded0 = rem0 ? b64 + '===='.slice(rem0) : b64;
    const bin0 = atob(padded0);
    bytes = new Uint8Array(bin0.length);
    for (let j = 0; j < bin0.length; j++) bytes[j] = bin0.charCodeAt(j);
  } catch(e) {
    // Fallback: chunk a chunk ignorando chunks inválidos
    const CHUNK = 4;  // múltiplo de 4 mínimo
    const parts = [];
    let byteLen = 0;
    for (let i = 0; i < b64.length; i += CHUNK) {
      const slice = b64.slice(i, Math.min(i + CHUNK, b64.length));
      if (slice.length < 4) continue;
      try {
        const bin = atob(slice);
        const part = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) part[j] = bin.charCodeAt(j);
        parts.push(part); byteLen += part.length;
      } catch(e2) { continue; }
    }
    if (!byteLen) return str;
    bytes = new Uint8Array(byteLen);
    let off2 = 0;
    for (const p of parts) { bytes.set(p, off2); off2 += p.length; }
  }
  // Usar pako si está disponible (más fiable en Android WebView)
  if (typeof pako !== 'undefined') {
    try {
      const result = new TextDecoder().decode(pako.inflate(bytes));
      if (result && result.length > 0) return result;
    } catch(e) {}
  }
  // Fallback: DecompressionStream nativo
  if (typeof DecompressionStream === 'undefined') return str;
  try {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    let done, value;
    while (!({ done, value } = await reader.read(), done)) chunks.push(value);
    const total = chunks.reduce((a,c)=>a+c.length,0);
    const merged = new Uint8Array(total);
    let off=0; for(const c of chunks){merged.set(c,off);off+=c.length;}
    return new TextDecoder().decode(merged);
  } catch(e) { return str; }
}

// ── Pool de concurrencia limitada ("promise pool") ─────────────────────────
// Patrón estándar para paralelizar tareas async sin fan-out ilimitado:
// ejecuta como mucho `limit` tareas a la vez, encadenando la siguiente en
// cuanto una termina. Se usa para descargas/subidas de red donde secuencial
// (una a una) es demasiado lento pero lanzar todo a la vez arriesga saturar
// memoria/ancho de banda en Android con obras pesadas (muchas imágenes/GIFs/
// APNG grandes a la vez).
async function _sbPoolMap(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runNext() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = [];
  const n = Math.max(1, Math.min(limit, items.length));
  for (let k = 0; k < n; k++) runners.push(runNext());
  await Promise.all(runners);
  return results;
}

const SupabaseClient = (() => {
  const BASE    = 'https://qqgsbyylaugsagbxsetc.supabase.co/rest/v1';
  const STORAGE = 'https://qqgsbyylaugsagbxsetc.supabase.co/storage/v1';
  const KEY     = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';
  // Worker de Cloudflare que media el acceso al bucket R2 "comxow-storage"
  // (jurisdicción EU). Migración Storage → R2, Etapa 3. Las subidas nuevas
  // van siempre aquí; STORAGE se mantiene solo para poder borrar/leer
  // contenido antiguo que aún no se ha migrado (ver Etapa 4 del plan).
  const WORKER = 'https://comxow-storage-worker.albertobicho.workers.dev';

  const hdrs = {
    'apikey':        KEY,
    'Authorization': `Bearer ${KEY}`,
    'Content-Type':  'application/json',
  };

  // Cabeceras con JWT del usuario autenticado (necesario para tablas con RLS estricto)
  function _hdrsUser() {
    try {
      const session = JSON.parse(localStorage.getItem('cs_session') || 'null');
      if (session && session.token) {
        return { 'apikey': KEY, 'Authorization': `Bearer ${session.token}`, 'Content-Type': 'application/json' };
      }
    } catch(e) {}
    return hdrs; // fallback a anon key
  }

  // Cabeceras para el Worker de Storage (Etapa 3 migración R2): solo necesita
  // Authorization con el JWT del usuario, que el propio Worker valida contra
  // /auth/v1/user de Supabase. Si no hay sesión, cae a la anon key, que el
  // Worker rechazará correctamente con 401 (comportamiento seguro por defecto).
  function _hdrsWorker() {
    return { 'Authorization': _hdrsUser().Authorization };
  }

  // Ejecuta un borrado de storage con refresco de token y un reintento.
  // Motivo: se detectó que _animDelete/_gifDelete no refrescaban el token de
  // sesión antes de borrar (a diferencia de las subidas, que sí lo hacen), y
  // el 401 resultante quedaba tragado en silencio por el catch(()=>{}) — la
  // causa confirmada de los huérfanos acumulados en Storage. Si tras el
  // reintento sigue fallando, se deja constancia en consola en vez de
  // desaparecer sin rastro.
  async function _deleteWithRetry(label, doDelete) {
    if (window._authTryRefresh) await window._authTryRefresh();
    try {
      let r = await doDelete();
      if (r && r.ok) return;
      if (window._authTryRefresh) await window._authTryRefresh();
      r = await doDelete();
      if (!r || !r.ok) {
        console.warn(`[storage] no se pudo borrar: ${label} (HTTP ${r && r.status})`);
      }
    } catch (e) {
      console.warn(`[storage] no se pudo borrar: ${label} (excepción)`, e);
    }
  }

  // v40.52 — Renovar el token ANTES de leer, como ya hacen _upsert/_patch/_delete. Con el token
  // caducado PostgREST responde 401 «JWT expired» AUNQUE los datos sean públicos: la portada
  // fallaba en su primera carga al abrir la app con la sesión caducada. Si el token es válido (o no
  // hay sesión) no cuesta nada: _authTryRefresh vuelve al instante. Tope de 6 s: si la renovación
  // se colgara, se lee igual con lo que haya (el 401 de siempre) en vez de colgar también la lectura.
  async function _ensureFreshToken() {
    if (!window._authTryRefresh) return;
    let t;
    try {
      await Promise.race([window._authTryRefresh(), new Promise(r => { t = setTimeout(r, 6000); })]);
    } catch(_) {}
    clearTimeout(t);
  }

  // ── REGISTRO DE LA ÚLTIMA SUBIDA A LA NUBE (v41.46) ─────────────────────────────────────
  // Solo MIDE (no cambia nada de lo que se envía): saveDraft() lo activa mientras dura y deja
  // el resumen en window._sbLastSave, que enseña el botón 🩺 del editor. Alberto reportó un
  // guardado en nube de 12 s con una sola hoja modificada: el tiempo se reparte entre CPU del
  // móvil, viajes de red y megas subidos, y cada uno se arregla de forma distinta — de ahí que
  // se registre cada petición (qué, cuánto tardó, cuántos bytes subió/bajó).
  let _rec = null;
  function _recBegin(kind) {
    _rec = { kind, t0: performance.now(), startedAt: new Date().toISOString(), reqs: [], marks: [], pages: [] };
    return _rec;
  }
  function _recMark(name) { if (_rec) _rec.marks.push([name, Math.round(performance.now() - _rec.t0)]); }
  function _recEnd(rec) {
    if (!rec) return;
    rec.total = Math.round(performance.now() - rec.t0);
    let up = 0, down = 0;
    rec.reqs.forEach(r => { up += r.up || 0; down += r.down || 0; });
    // «Solo red»: suma del tiempo en que había al menos una petición en vuelo (unión de intervalos).
    const iv = rec.reqs.map(r => [r.t0, r.t0 + r.ms]).sort((a, b) => a[0] - b[0]);
    let busy = 0, cs = -1, ce = -1;
    iv.forEach(([s, e]) => { if (s > ce) { if (ce > cs) busy += ce - cs; cs = s; ce = e; } else if (e > ce) ce = e; });
    if (ce > cs) busy += ce - cs;
    window._sbLastSave = {
      kind: rec.kind, startedAt: rec.startedAt, totalMs: rec.total, netBusyMs: Math.round(busy),
      requests: rec.reqs.length, upKB: Math.round(up / 1024), downKB: Math.round(down / 1024),
      layerSha: _layerShaOk === true ? 'activa' : (_layerShaOk === false ? 'no disponible (falta la función SQL layer_sha)' : 'sin probar'),
      marks: rec.marks, pages: rec.pages,
      reqs: rec.reqs.slice().sort((a, b) => b.ms - a.ms).slice(0, 14).map(r => ({ tag: r.tag, t0: r.t0, ms: r.ms, up: r.up, down: r.down, status: r.status })),
    };
    if (_rec === rec) _rec = null;
  }
  // fetch con cronómetro: registra método+tabla, ms hasta recibir la cabecera, bytes subidos y (si
  // quien llama los lee) bajados. Si no hay registro activo se comporta exactamente como fetch.
  async function _rqFetch(tag, url, init, upBytes) {
    const rec = _rec; const t0 = performance.now();
    let res;
    try { res = await fetch(url, init); }
    catch (e) {
      if (rec) rec.reqs.push({ tag, t0: Math.round(t0 - rec.t0), ms: Math.round(performance.now() - t0), up: upBytes || 0, down: 0, status: 'ERR' });
      throw e;
    }
    if (rec) {
      const r1 = { tag, t0: Math.round(t0 - rec.t0), a: t0, ms: Math.round(performance.now() - t0), up: upBytes || 0, down: 0, status: res.status };
      rec.reqs.push(r1);
      try { res.__rec = r1; } catch(_) {}
    }
    return res;
  }
  // Lee el cuerpo de la respuesta y, si hay registro, anota los bytes bajados y el tiempo total
  // (hasta tener el cuerpo entero, no solo la cabecera).
  async function _rqText(res) {
    const txt = await res.text();
    if (res.__rec) { res.__rec.down = txt.length; res.__rec.ms = Math.round(performance.now() - res.__rec.a); }
    return txt;
  }

  async function _get(path) {
    await _ensureFreshToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // 8s timeout
    try {
      // cache:'no-store' — nunca servir una respuesta guardada por el navegador.
      // Esta es la función genérica de lectura (works/panels/panel_layers/
      // biblioteca): si el navegador cacheara una fila desactualizada, el
      // editor (y su visor interno) podría cargar una obra con capas u
      // opciones "anim_url"/"gif_url" antiguas aunque ya se hubiera guardado
      // una versión más reciente en Supabase.
      const r = await _rqFetch('GET ' + path.split('?')[0], `${BASE}/${path}`, { headers: _hdrsUser(), signal: controller.signal, cache: 'no-store' }, 0);
      clearTimeout(timer);
      if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
      return JSON.parse(await _rqText(r));
    } catch(e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error(`Timeout en GET ${path}`);
      throw e;
    }
  }

  // opts (opcional, v41.46):
  //   ret:'min'      → Prefer: return=minimal. PostgREST NO devuelve las filas escritas. Hasta ahora
  //                    todo se pedía con return=representation: Supabase devolvía de vuelta, byte a
  //                    byte, lo mismo que se acababa de subir (1,4 MB de ida y 1,4 MB de vuelta para
  //                    una hoja con tres imágenes) y luego se parseaba ese JSON para nada, porque
  //                    quien llama a _upsert('panel_layers'/'panel_texts') nunca usaba el resultado.
  //   select:'id'    → return=representation pero solo con esa(s) columna(s).
  // Sin opts se comporta exactamente como antes.
  async function _upsert(table, data, opts) {
    opts = opts || {};
    if (window._authTryRefresh) await window._authTryRefresh();
    const _min = opts.ret === 'min';
    const _body = JSON.stringify(data);
    const r = await _rqFetch('POST ' + table, `${BASE}/${table}${opts.select ? '?select=' + opts.select : ''}`, {
      method:  'POST',
      headers: { ..._hdrsUser(), 'Prefer': 'resolution=merge-duplicates,return=' + (_min ? 'minimal' : 'representation') },
      body:    _body,
    }, _body.length);
    if (!r.ok) throw new Error(`UPSERT ${table}: ${r.status} ${await r.text()}`);
    if (_min) return null;
    return JSON.parse(await _rqText(r));
  }

  // opts.returning:'col1,col2' (v41.46) → pide que PostgREST devuelva las filas borradas (solo esas
  // columnas) en la MISMA petición: así se sabe qué archivos del bucket dejan de estar referenciados
  // sin un GET previo (un viaje de red menos por hoja). Sin opts devuelve undefined, como siempre.
  async function _delete(table, filter, opts) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const _ret = opts && opts.returning;
    const r = await _rqFetch('DELETE ' + table, `${BASE}/${table}?${filter}${_ret ? '&select=' + _ret : ''}`, {
      method: 'DELETE',
      headers: _ret ? { ..._hdrsUser(), 'Prefer': 'return=representation' } : _hdrsUser(),
    }, 0);
    if (!r.ok) throw new Error(`DELETE ${table}: ${r.status} ${await r.text()}`);
    if (!_ret) return;
    const _txt = await _rqText(r);
    return _txt ? JSON.parse(_txt) : [];
  }

  async function _patch(table, filter, data) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const _body = JSON.stringify(data);
    const r = await _rqFetch('PATCH ' + table, `${BASE}/${table}?${filter}`, {
      method:  'PATCH',
      headers: { ..._hdrsUser(), 'Prefer': 'return=minimal' },
      body:    _body,
    }, _body.length);
    if (!r.ok) throw new Error(`PATCH ${table}: ${r.status}`);
  }

  // ── STORAGE: GIFs en bucket 'gifs' ────────────────────────────────────────
  // Mini IDB propio para leer GIFs — mismo DB que editor.js (cxGifs)
  function _sbGifIdbLoad(key) {
    // Usar la función cacheada del editor si está disponible (evita doble conexión a cxGifs)
    if (window._gifIdbLoad) return window._gifIdbLoad(key).catch(() => null);
    return new Promise((res) => {
      const req = indexedDB.open('cxGifs', 1);
      req.onsuccess = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('gifs')) { res(null); return; }
        const r = db.transaction('gifs').objectStore('gifs').get(key);
        r.onsuccess = e2 => res(e2.target.result || null);
        r.onerror   = () => res(null);
      };
      req.onerror = () => res(null);
    });
  }

  // ── STORAGE: APNGs animados en bucket 'anims' — patrón idéntico al de GIFs ──
  // IDB cacheado (misma conexión para toda la sesión — evita conflictos de apertura múltiple)
  let _animDb = null;
  function _animIdbOpen() {
    if (_animDb) {
      if (_animDb.objectStoreNames.contains('anims')) return Promise.resolve(_animDb);
      try { _animDb.close(); } catch(_) {}
      _animDb = null;
    }
    return new Promise((res, rej) => {
      const req = indexedDB.open('cxAnims', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('anims');
      req.onsuccess = e => {
        _animDb = e.target.result;
        _animDb.onversionchange = () => { _animDb.close(); _animDb = null; };
        _animDb.onclose        = () => { _animDb = null; };
        res(_animDb);
      };
      req.onerror = e => rej(e.target.error);
    });
  }
  // Guarda dataUrl PNG (APNG completo) en IDB por animKey
  function _sbAnimIdbSave(key, dataUrl) {
    return _animIdbOpen().then(db => new Promise((res, rej) => {
      const tx = db.transaction('anims', 'readwrite');
      tx.objectStore('anims').put(dataUrl, key);
      tx.oncomplete = () => res();
      tx.onerror    = e => rej(e.target.error);
    }));
  }
  // Lee dataUrl PNG (APNG completo) de IDB por animKey
  function _sbAnimIdbLoad(key) {
    return _animIdbOpen().then(db => new Promise((res, rej) => {
      const r = db.transaction('anims').objectStore('anims').get(key);
      r.onsuccess = e => res(e.target.result || null);
      r.onerror   = e => rej(e.target.error);
    }));
  }
  // Exponer para que editor.js pueda guardar el APNG completo en IDB al importar
  window._sbAnimIdbSave = _sbAnimIdbSave;
  window._sbAnimIdbLoad = _sbAnimIdbLoad;

  // Reconstruye un APNG desde array de PNG dataUrls individuales usando UPNG.
  // holds (opcional): array de pausas por frame en ms (window._gcpFrameHolds /
  // la._gcpFrameHolds) — si existe un valor para un índice, se usa en vez del
  // delay uniforme. Mismo criterio que _gcpDownloadApng en editor.js.
  async function _buildApngFromFrames(frameUrls, delayMs, holds) {
    if (typeof UPNG === 'undefined' || !window.ApngDecoder || !frameUrls || !frameUrls.length) return null;
    try {
      const result = await window.ApngDecoder.decodeFrameArray(frameUrls, delayMs || 100);
      const dels = (holds && holds.length)
        ? Array.from({length: result.frames.length}, (_, fi) => holds[fi] || delayMs || 100)
        : new Array(result.frames.length).fill(delayMs || 100);
      const bufs = result.frames.map(f => f.imageData.data.buffer);
      const apngBuf = UPNG.encode(bufs, result.width, result.height, 0, dels, true);
      const blob = new Blob([apngBuf], {type: 'image/png'});
      return new Promise(res => {
        const fr = new FileReader();
        fr.onload = e => res(e.target.result);
        fr.onerror = () => res(null);
        fr.readAsDataURL(blob);
      });
    } catch(e) { return null; }
  }

  // Sube un dataUrl APNG al Worker de Storage (bucket R2 'comxow-storage', prefijo 'anims/')
  async function _animUpload(animKey, dataUrl) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const b64 = dataUrl.split(',')[1];
    const bin = atob(b64);
    const u8  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const blob = new Blob([u8], { type: 'image/png' });
    const path = animKey + '.png';
    const r = await _rqFetch('PUT anim', `${WORKER}/anims/${path}`, {
      method:  'PUT',
      headers: { ..._hdrsWorker(), 'Content-Type': 'image/png' },
      body:    blob,
    }, blob.size);
    if (!r.ok) throw new Error(`animUpload: ${r.status} ${await r.text()}`);
    return `${WORKER}/anims/${path}`;
  }
  // _animDownload definida más abajo
  // Borra un APNG por su URL pública. Soporta tanto URLs nuevas (Worker/R2)
  // como antiguas (Supabase Storage) mientras quede contenido sin migrar
  // — ver Etapa 4 del plan de migración a R2.
  async function _animDelete(animUrl) {
    if (!animUrl) return;
    if (animUrl.startsWith(STORAGE)) {
      const path = animUrl.replace(`${STORAGE}/object/public/anims/`, '');
      await _deleteWithRetry(animUrl, () => _rqFetch('DEL anim', `${STORAGE}/object/anims/${path}`, {
        method: 'DELETE', headers: _hdrsUser(),
      }, 0));
      return;
    }
    const path = animUrl.replace(`${WORKER}/anims/`, '');
    await _deleteWithRetry(animUrl, () => _rqFetch('DEL anim', `${WORKER}/anims/${path}`, {
      method: 'DELETE', headers: _hdrsWorker(),
    }, 0));
  }

  // Sube un dataUrl GIF al Worker de Storage (bucket R2, prefijo 'gifs/') y devuelve la URL pública
  async function _gifUpload(gifKey, dataUrl) {
    if (window._authTryRefresh) await window._authTryRefresh();
    // dataUrl → Blob binario (sin fetch, compatible con todos los navegadores)
    const b64  = dataUrl.split(',')[1];
    const bin  = atob(b64);
    const u8   = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const blob = new Blob([u8], { type: 'image/gif' });
    const path = gifKey + '.gif';
    const r = await _rqFetch('PUT gif', `${WORKER}/gifs/${path}`, {
      method:  'PUT',
      headers: { ..._hdrsWorker(), 'Content-Type': 'image/gif' },
      body:    blob,
    }, blob.size);
    if (!r.ok) throw new Error(`GIF upload: ${r.status} ${await r.text()}`);
    return `${WORKER}/gifs/${path}`;
  }

  // Sube el thumbnail de la primera hoja al Worker de Storage (bucket R2, prefijo 'covers/') como JPEG
  // Devuelve la URL pública o null si falla
  async function _thumbUpload(supabaseId, dataUrl) {
    if (!dataUrl || !supabaseId) return null;
    try {
      if (window._authTryRefresh) await window._authTryRefresh();
      // Convertir dataUrl a JPEG si no lo es ya
      let jpegUrl = dataUrl;
      if (!dataUrl.startsWith('data:image/jpeg')) {
        const _cvs = document.createElement('canvas');
        const _img = await new Promise((res, rej) => {
          const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
        });
        _cvs.width = _img.naturalWidth; _cvs.height = _img.naturalHeight;
        _cvs.getContext('2d').drawImage(_img, 0, 0);
        jpegUrl = _cvs.toDataURL('image/jpeg', 0.82);
      }
      const b64  = jpegUrl.split(',')[1];
      const bin  = atob(b64);
      const u8   = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], { type: 'image/jpeg' });
      const path = 'thumb_' + supabaseId + '.jpg';
      const r = await _rqFetch('PUT cover', `${WORKER}/covers/${path}`, {
        method:  'PUT',
        headers: { ..._hdrsWorker(), 'Content-Type': 'image/jpeg' },
        body:    blob,
      }, blob.size);
      if (!r.ok) return null;
      return `${WORKER}/covers/${path}`;
    } catch(_e) { return null; }
  }

  // Borra la miniatura de portada de una obra por su URL pública. No hay ruta
  // antigua de Supabase que soportar aquí: works.cover_url nunca llegó a
  // apuntar a Supabase (se comprobó explícitamente antes de borrar sus
  // buckets). Sirve tanto para portadas nuevas (prefijo 'covers/') como para
  // las creadas antes de separar el prefijo (aún bajo 'gifs/thumb_*').
  async function _coverDelete(coverUrl) {
    if (!coverUrl || !coverUrl.startsWith(`${WORKER}/`)) return;
    const key = coverUrl.replace(`${WORKER}/`, '');
    await _deleteWithRetry(coverUrl, () => fetch(`${WORKER}/${key}`, {
      method: 'DELETE', headers: _hdrsWorker(),
    }));
  }

  // Borra un GIF por su URL pública. Soporta tanto URLs nuevas (Worker/R2)
  // como antiguas (Supabase Storage) mientras quede contenido sin migrar.
  async function _gifDelete(gifUrl) {
    if (!gifUrl) return;
    if (gifUrl.startsWith(STORAGE)) {
      const path = gifUrl.replace(`${STORAGE}/object/public/gifs/`, '');
      await _deleteWithRetry(gifUrl, () => _rqFetch('DEL gif', `${STORAGE}/object/gifs/${path}`, {
        method:  'DELETE',
        headers: _hdrsUser(),
      }, 0));
      return;
    }
    const path = gifUrl.replace(`${WORKER}/gifs/`, '');
    await _deleteWithRetry(gifUrl, () => _rqFetch('DEL gif', `${WORKER}/gifs/${path}`, {
      method:  'DELETE',
      headers: _hdrsWorker(),
    }, 0));
  }

  // _animUpload antigua eliminada — usar la nueva (blob PNG con .png)

  // Descarga APNG del bucket 'anims' y devuelve dataUrl PNG — patrón idéntico al GIF
  async function _animDownload(animUrl) {
    if (!animUrl) return null;
    // cache:'no-store' — el binario de una animación editada puede subirse
    // con una URL previamente vista por el navegador (p.ej. reintentos o
    // biblioteca); no arriesgarse a servir una copia antigua desde caché.
    const r = await fetch(animUrl, { cache: 'no-store' });
    if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise(res => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.onerror = () => res(null);
      reader.readAsDataURL(blob);
    });
  }


  // v41.46 — Semáforo global para las operaciones PESADAS con binarios (cargar el GIF/APNG de IndexedDB,
  // construir un APNG con UPNG y subirlo): como mucho 3 a la vez en TODA la subida, sumando todas las
  // hojas en curso. La subida de hojas ya va de 3 en 3 (_sbPoolMap) y ahora además las capas de cada
  // hoja se preparan en paralelo; sin este tope, 3 hojas × varias animaciones cada una podían acabar
  // con decenas de APNG en memoria a la vez en un móvil (el mismo motivo por el que el pool de
  // hojas se limitó a 3). Antes las animaciones de una hoja se subían de una en una.
  let _binActive = 0;
  const _binWait = [];
  function _binRun(fn) {
    return new Promise((resolve, reject) => {
      const go = () => {
        _binActive++;
        Promise.resolve().then(fn).then(resolve, reject).finally(() => {
          _binActive--;
          const next = _binWait.shift();
          if (next) next();
        });
      };
      if (_binActive < 3) go(); else _binWait.push(go);
    });
  }

  // Prepara la fila panel_layers de UNA capa (y sube sus binarios al bucket si los tiene). Es el cuerpo
  // del bucle que antes vivía dentro de _uploadOnePanel, sin cambios de lógica: solo se ha sacado a una
  // función para poder preparar varias capas a la vez (ver _uploadOnePanel).
  async function _buildLayerRow(l, j, panelId) {
    let gifUrl = null;
    // GIF: subir binario a Storage; layer_data solo guarda metadatos (sin dataUrl)
    if (l.type === 'gif' && l.gifKey) {
      try {
        gifUrl = await _binRun(async () => {
          const dataUrl = await _sbGifIdbLoad(l.gifKey);
          return dataUrl ? await _gifUpload(l.gifKey, dataUrl) : null;
        });
      } catch(e) { console.warn('GIF upload error:', e.message); }
    }
    // FillLayer, PencilLayer, WatercolorLayer: instancias de clase con canvas
    // Serializar mediante toDataUrl() para obtener el dataUrl correcto
    if (l.type === 'fill' || l.type === 'pencil' || l.type === 'watercolor') {
      const _groupData = {
        type: l.type,
        dataUrl: (typeof l.toDataUrl === 'function') ? l.toDataUrl() : (l.dataUrl || null),
        _drawLayerId: l._drawLayerId || null,
        _uid: l._uid || null,
        hidden: l.hidden || false,
        opacity: l.opacity,
        // Propiedades de posición/tamaño/rotación
        x:        l.x        != null ? l.x        : 0.5,
        y:        l.y        != null ? l.y        : 0.5,
        width:    l.width    != null ? l.width    : 1.0,
        height:   l.height   != null ? l.height   : 1.0,
        rotation: l.rotation != null ? l.rotation : 0,
        // _isFull:true para que edDeserLayer lo reconozca como nuevo formato
        _isFull: true,
      };
      // BUG CORREGIDO — Alberto: un botón "ir a hoja..." puesto sobre un
      // dibujo (fill/pencil/watercolor) nunca llegaba a funcionar en el
      // lector, por mucho que se recreara. Esta lista de campos es
      // CERRADA (a diferencia de _lClean más abajo, que parte de una
      // copia de toda la capa) — cualquier campo no listado aquí
      // explícitamente se pierde al guardar en la nube. _buttonAction
      // no estaba en la lista, así que un botón sobre un dibujo se
      // guardaba bien en local (edSerLayer sí lo incluye, ver su
      // envoltorio) pero desaparecía en cuanto se subía a Supabase —
      // el lector externo nunca podía verlo, porque el dato ni
      // siquiera llegaba a la base de datos.
      if (l._buttonAction) _groupData._buttonAction = Object.assign({}, l._buttonAction);
      // No comprimir: el dataUrl PNG ya es binario comprimido internamente
      const _ld = JSON.stringify(_groupData);
      return { panel_id: panelId, layer_order: j, layer_type: l.type, layer_data: _ld, gif_url: null, anim_url: null };
    }

    // Serializar la capa — excluir campos de re-edición que el reader no necesita
    const _lClean = {...l};
    // _gcpLayersData/_gcpFramesData/_gcpLayerNames son datos vectoriales (no imágenes)
    // Se mantienen en layer_data para que el editor GCP funcione en dispositivo B
    delete _lClean._pngFrames;     // nunca en layer_data — van al bucket
    delete _lClean._pngFramesKey;  // clave IDB local — no tiene sentido en Supabase
    delete _lClean._animFrames;    // datos en memoria — no serializar
    delete _lClean._animReady;
    delete _lClean._oc;
    delete _lClean._apngSrc;     // dataUrl enorme — ya está en bucket por animKey

    // APNG animado → bucket 'anims'
    // Fuentes de datos en orden de prioridad:
    // 1. IDB (caso normal), 2. _apngSrc en memoria (modo incógnito), 3. _pngFrames en memoria
    let animUrl = null;
    if (l.type === 'image' && (l._pngFramesKey || l.animKey || l._apngSrc || (l._pngFrames && l._pngFrames.length))) {
      const _bucketKey = 'anim_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
      try {
        animUrl = await _binRun(async () => {
          let _apngDataUrl = null;
          // 1. Intentar IDB si hay clave
          if (l._pngFramesKey || l.animKey) {
            const _idbKey = l._pngFramesKey || l.animKey;
            const _animData = await _sbAnimIdbLoad(_idbKey).catch(() => null);
            if (_animData) {
              if (typeof _animData === 'string') _apngDataUrl = _animData;
              else if (Array.isArray(_animData) && _animData.length)
                _apngDataUrl = await _buildApngFromFrames(_animData, l._gcpFrameDelay || 100, l._gcpFrameHolds);
            }
          }
          // 2. Fallback: _apngSrc en memoria (modo incógnito o descarga reciente)
          if (!_apngDataUrl && l._apngSrc) _apngDataUrl = l._apngSrc;
          // 3. Fallback: _pngFrames en memoria
          if (!_apngDataUrl && l._pngFrames && l._pngFrames.length)
            _apngDataUrl = await _buildApngFromFrames(l._pngFrames, l._gcpFrameDelay || 100, l._gcpFrameHolds);
          return _apngDataUrl ? await _animUpload(_bucketKey, _apngDataUrl) : null;
        });
      } catch(e) { console.warn('APNG upload error:', e.message); }
    }

    // Animaciones insertadas DENTRO de un flujo de texto (ver
    // _tdInsertGif/_tdInsertFromBib en editor-textdoc.js) — viven en la
    // IDB local (cxGifs para GIF, cxAnims para APNG/GCP) bajo su propia
    // clave, igual que una capa suelta de ese mismo tipo, pero anidadas
    // dentro de richLines en vez de ser una capa de nivel superior. Sin
    // subir también su binario aquí, la clave queda colgando en cuanto
    // se abre la obra en OTRO dispositivo (su IDB local no tiene esa
    // clave) y la animación se pierde en silencio — exactamente el
    // mismo problema que ya se resuelve arriba para el caso normal
    // (capas 'gif'/'image' de nivel superior), aplicado ahora a cada
    // línea que lo necesite. No se muta l.richLines (el array en
    // memoria que sigue usando el editor) — solo la copia que se
    // serializa a Supabase.
    if (l.type === 'text' && Array.isArray(l.richLines) && l.richLines.some(rl => rl && (rl.gifKey || rl.animKey))) {
      const _newRichLines = [];
      for (const rl of l.richLines) {
        if (rl && rl.gifKey) {
          try {
            const _rlGifUrl = await _binRun(async () => {
              const _rlGifData = await _sbGifIdbLoad(rl.gifKey);
              return _rlGifData ? await _gifUpload(rl.gifKey, _rlGifData) : null;
            });
            if (_rlGifUrl) {
              _newRichLines.push({ ...rl, gifUrl: _rlGifUrl });
              continue;
            }
          } catch(e) { console.warn('GIF (flujo de texto) upload error:', e.message); }
        } else if (rl && rl.animKey) {
          try {
            const _rlAnimUrl = await _binRun(async () => {
              const _rlAnimData = await _sbAnimIdbLoad(rl.animKey);
              if (!_rlAnimData) return null;
              // Igual que la subida de una capa 'image' APNG de nivel
              // superior (ver arriba): si lo guardado es un array de
              // frames sueltos (animación GCP aún no empaquetada como
              // APNG real), construir primero el APNG único.
              const _rlApngDataUrl = (typeof _rlAnimData === 'string')
                ? _rlAnimData
                : await _buildApngFromFrames(_rlAnimData, rl._gcpFrameDelay || 100, rl._gcpFrameHolds);
              return _rlApngDataUrl ? await _animUpload(rl.animKey, _rlApngDataUrl) : null;
            });
            if (_rlAnimUrl) {
              _newRichLines.push({ ...rl, animUrl: _rlAnimUrl });
              continue;
            }
          } catch(e) { console.warn('APNG (flujo de texto) upload error:', e.message); }
        }
        _newRichLines.push(rl);
      }
      _lClean.richLines = _newRichLines;
    }

    // Solo comprimir layers APNG animados (tienen gcpLayersData grandes)
    // El resto: JSON directo como v16.42 — sin riesgo de fallo de descompresión
    // Comprimir cualquier layer cuyo JSON supere el umbral (fill ya comprimido arriba)
    const _lRaw = JSON.stringify(_lClean);
    const _ld = _lRaw.length >= _CZ_MIN ? await _czCompress(_lRaw) : _lRaw;
    return {
      panel_id:    panelId,
      layer_order: j,
      layer_type:  l.type,
      layer_data:  _ld,
      gif_url:     gifUrl,
      anim_url:    animUrl,
    };
  }

  // ── SUBIDA POR CAPAS (v41.46) ─────────────────────────────────────────────────────────────────
  // Una hoja con UNA capa modificada volvía a subir TODAS sus capas (las imágenes pegadas, los dibujos…
  // son megas de base64 en layer_data) y solo la modificada era distinta. Técnica estándar de
  // sincronización (rsync, Git, Dropbox): comparar contenido por HASH y enviar solo lo que difiere.
  //   · La base de datos calcula el SHA-256 de cada layer_data con la columna calculada «layer_sha»
  //     (función SQL de una línea, ver la carta de entrega); PostgREST la sirve como una columna más.
  //   · Aquí se calcula el SHA-256 de lo que se iba a subir. Una capa con el mismo orden, el mismo tipo y
  //     el mismo hash YA ESTÁ en la nube tal cual: no se borra ni se vuelve a subir.
  //   · Todo lo demás (capas cambiadas, nuevas, sobrantes, duplicadas, con binarios GIF/APNG en el
  //     bucket) se borra por id y se vuelve a insertar, como siempre. Al terminar, las filas de la hoja en
  //     la nube son EXACTAMENTE las que se habrían subido en el modo de siempre.
  // No se guarda ninguna «huella» local que pudiera quedar obsoleta: se compara con lo que HAY en la nube
  // en ese momento, así que es a prueba de otro dispositivo, de ediciones a mano en Supabase o de una
  // subida anterior interrumpida. Ante cualquier duda (función SQL ausente, error, sin crypto.subtle)
  // se usa el modo de siempre: borrar todas las capas de la hoja y subirlas.
  let _layerShaOk = null; // null = aún sin probar en esta sesión · true = la nube sirve layer_sha · false = no la sirve
  // crypto.subtle solo existe en contextos seguros (https / localhost): sin él no se puede hashear → modo de siempre.
  function _shaCapable() { return !!(window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined'); }
  async function _sha256Hex(str) {
    try {
      if (!_shaCapable()) return null;
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      const b = new Uint8Array(buf);
      let h = '';
      for (let i = 0; i < b.length; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
      return h;
    } catch (_) { return null; }
  }
  // cloudRows: [{id, layer_order, layer_type, layer_sha, gif_url, anim_url}] de la hoja en la nube.
  // Devuelve qué capas nuevas (por layer_order) ya están en la nube idénticas y qué ids hay que borrar.
  async function _layerDelta(layerRows, cloudRows) {
    const newSha = new Map();
    await Promise.all(layerRows.map(async r => {
      // Las capas con archivo en el bucket (GIF/APNG) llevan URL nueva en cada subida: siempre se reemplazan.
      if (r.gif_url || r.anim_url || typeof r.layer_data !== 'string') return;
      const h = await _sha256Hex(r.layer_data);
      if (h) newSha.set(r.layer_order, h);
    }));
    const byOrder = new Map();
    cloudRows.forEach(c => { const a = byOrder.get(c.layer_order); if (a) a.push(c); else byOrder.set(c.layer_order, [c]); });
    const keepOrders = new Set(), keepIds = new Set();
    layerRows.forEach(r => {
      const h = newSha.get(r.layer_order);
      if (!h) return;
      const cands = byOrder.get(r.layer_order);
      if (!cands || cands.length !== 1) return; // ausente o DUPLICADA en la nube: se rehace
      const c = cands[0];
      if (c.layer_sha === h && c.layer_type === r.layer_type && !c.gif_url && !c.anim_url) {
        keepOrders.add(r.layer_order); keepIds.add(c.id);
      }
    });
    return { keepOrders, delIds: cloudRows.filter(c => !keepIds.has(c.id)).map(c => c.id) };
  }

  // Sube/actualiza UNA página: fila panels + sus panel_layers/panel_texts.
  // Compartida entre la ruta completa (existingPanelId=null, siempre inserta
  // fila nueva) y la ruta incremental (existingPanelId= la fila que ya existía
  // en esa posición, para actualizarla en el sitio en vez de duplicarla).
  //
  // v41.46 — LOS PASOS DE RED DE UNA HOJA YA NO VAN EN FILA. Antes, para una sola hoja sucia:
  //   GET capas antiguas → (borrar sus archivos) → POST panels → DELETE capas ‖ DELETE textos
  //   → [preparar capas] → POST panel_layers → POST panel_texts          (≈ 6 viajes seguidos)
  // y cada POST pedía a Supabase que devolviera lo escrito (los MB de las capas, otra vez).
  // Ahora, en la ruta incremental (el id de la hoja ya se conoce):
  //   POST panels ‖ DELETE capas (devuelve de paso los archivos que dejan de usarse) ‖ DELETE textos
  //   ‖ [preparar capas]  →  POST panel_layers ‖ POST panel_texts ‖ borrar archivos huérfanos
  //   (≈ 2 viajes seguidos, y el primero queda tapado por la CPU de preparar las capas)
  // Orden de seguridad respetado: las filas antiguas se borran SIEMPRE antes de insertar las nuevas
  // (igual que antes), y los archivos del bucket solo se borran DESPUÉS de saber qué URL usan las
  // filas nuevas — una URL que vuelve a usarse (el GIF conserva su clave) no se borra. Antes se
  // borraban todos los archivos antiguos primero y luego se volvían a subir.
  async function _uploadOnePanel(comic, edPages, p, i, existingPanelId) {
    const _rc = _rec;
    const _pg = _rc ? { i, t0: Math.round(performance.now() - _rc.t0) } : null;
    const _pm = k => { if (_pg) _pg[k] = Math.round(performance.now() - _rc.t0) - _pg.t0; };
    if (_pg) _rc.pages.push(_pg);

    const _panelRow = {
      ...(existingPanelId ? { id: existingPanelId } : {}),
      work_id:     comic.supabaseId,
      panel_order: i,
      orientation: p.orientation || 'v',
      text_mode:   p.textMode    || 'sequential',
      data_url:    p.dataUrl     || null,
    };
    let panelId = existingPanelId || null;
    let _panelWriteP = null, _delLayersP = null, _delTextsP = null, _rowsP = null;
    if (existingPanelId) {
      // Ruta incremental: el id ya se conoce → la fila de la hoja y los dos borrados se lanzan a la vez,
      // sin esperar unos a otros ni a la preparación de las capas (que no depende de ellos).
      _panelWriteP = _upsert('panels', _panelRow, { ret: 'min' }).then(v => { _pm('panelMs'); return v; });
      // Borrar capas y textos anteriores por si el CASCADE no actuó. Cada uno se espera justo antes de
      // su INSERT. El de capas devuelve de paso gif_url/anim_url de las filas borradas: es lo que antes
      // se pedía con un GET aparte (_cleanupPanelFiles) y una ronda de red propia.
      // Con la subida por capas disponible (ver _layerDelta) no se borra todo de entrada: se pide la
      // lista de capas de la nube con su hash (pequeña: ids y hashes) para decidir qué hace falta tocar.
      if (_layerShaOk !== false && _shaCapable()) {
        _rowsP = _get(`panel_layers?panel_id=eq.${panelId}&select=id,layer_order,layer_type,layer_sha,gif_url,anim_url`)
          .then(v => ({ ok: true, v }), e => ({ ok: false, e }));
      } else {
        _delLayersP = _delete('panel_layers', `panel_id=eq.${panelId}`, { returning: 'gif_url,anim_url' });
      }
      _delTextsP  = _delete('panel_texts',  `panel_id=eq.${panelId}`);
      // Si otro paso falla antes de llegar a esperarlos, que no queden como «unhandled rejection»;
      // el error real se relanza más abajo al esperarlos.
      _panelWriteP.catch(() => {}); if (_delLayersP) _delLayersP.catch(() => {}); _delTextsP.catch(() => {});
    } else {
      // Ruta completa: la fila es nueva y su id lo genera la base de datos; hace falta ya para las
      // capas. Solo se pide de vuelta el id (antes volvía la fila entera, incluido data_url).
      // No hay nada que borrar: una hoja nueva no puede tener capas ni textos propios todavía (los de
      // las hojas antiguas se fueron con el DELETE general de panels, con CASCADE).
      const ins = await _upsert('panels', _panelRow, { select: 'id' });
      panelId = ins[0]?.id;
      _pm('panelMs');
      if (!panelId) return;
    }

    // Capas del editor: image, draw, stroke, bubble, text, gif — formato edSerLayer.
    // Se preparan hasta 3 a la vez: las que llevan binarios (GIF/APNG) esperan a su subida, y esa
    // espera se solapa con la preparación de las demás; el orden de las filas es el de layer_order.
    const edPage = edPages[i];
    let layerRows = [];
    if (edPage && edPage.layers && edPage.layers.length > 0) {
      layerRows = await _sbPoolMap(edPage.layers.map((_, j) => j), 3, j => _buildLayerRow(edPage.layers[j], j, panelId));
    }
    _pm('layersBuiltMs');

    // Filas antiguas fuera (siempre antes de insertar las nuevas) y, con la respuesta del borrado, qué
    // archivos del bucket ya no los usa nadie.
    let _oldRows = [];
    let _toInsert = layerRows;  // filas que de verdad hay que enviar
    let _kept = 0, _keptKB = 0; // capas que ya estaban en la nube idénticas (no se tocan)
    if (_rowsP) {
      const _rr = await _rowsP;
      _pm('listLayersMs');
      let _delta = null;
      if (_rr.ok && Array.isArray(_rr.v) && _rr.v.every(c => c && c.id != null && typeof c.layer_sha === 'string')) {
        _layerShaOk = true;
        _delta = await _layerDelta(layerRows, _rr.v);
        _pm('deltaMs');
      } else if (!_rr.ok && /:\s*4\d\d\b/.test(String((_rr.e && _rr.e.message) || ''))) {
        // La nube responde 4xx a layer_sha: la función SQL no está creada (o no se puede usar). Modo de
        // siempre durante el resto de la sesión. Un error de red/5xx no marca nada: se reintentará.
        _layerShaOk = false;
      }
      if (_delta && _delta.delIds.length <= 60) { // 60 ids caben de sobra en la URL del DELETE
        _toInsert = layerRows.filter(r => !_delta.keepOrders.has(r.layer_order));
        _kept = _delta.keepOrders.size;
        _keptKB = Math.round(layerRows.reduce((n, r) => n + (_delta.keepOrders.has(r.layer_order) ? r.layer_data.length : 0), 0) / 1024);
        if (_delta.delIds.length) {
          _oldRows = (await _delete('panel_layers', `id=in.(${_delta.delIds.join(',')})`, { returning: 'gif_url,anim_url' })) || [];
        }
      } else {
        // Modo de siempre: fuera TODAS las capas de la hoja y se suben todas.
        _oldRows = (await _delete('panel_layers', `panel_id=eq.${panelId}`, { returning: 'gif_url,anim_url' })) || [];
      }
    } else if (_delLayersP) {
      _oldRows = (await _delLayersP) || [];
    }
    _pm('delLayersMs');
    if (_delTextsP) await _delTextsP;

    const _tasks = [];
    if (_toInsert.length > 0) _tasks.push(_upsert('panel_layers', _toInsert, { ret: 'min' }).then(v => { _pm('layersPostMs'); return v; }));
    if (p.texts && p.texts.length > 0) {
      // Textos para el reader (panel_texts sin cambios)
      _tasks.push(_upsert('panel_texts', p.texts.map((t, j) => ({
        panel_id:     panelId,
        text_order:   t.order              ?? j,
        type:         t.type              || 'bubble',
        style:        t.style             || 'conventional',
        has_tail:     t.hasTail           ?? true,
        tail_starts:  JSON.stringify(t.tailStarts || [{x:-0.4,y:0.4}]),
        tail_ends:    JSON.stringify(t.tailEnds   || [{x:-0.4,y:0.6}]),
        voice_count:  t.voiceCount        ?? 1,
        x:            t.x                 ?? 0,
        y:            t.y                 ?? 0,
        w:            t.w                 ?? t.width  ?? 0.3,
        h:            t.h                 ?? t.height ?? 0.15,
        text:         t.text              || '',
        font_family:  t.fontFamily        || 'Patrick Hand',
        font_size:    t.fontSize          ?? 30,
        font_bold:    t.fontBold          ?? false,
        font_italic:  t.fontItalic        ?? false,
        color:        t.color             || '#000000',
        bg:           t.bg || t.backgroundColor || '#ffffff',
        bg_opacity:   t.bgOpacity         ?? 1,
        border:       t.border            ?? t.borderWidth ?? 2,
        border_color: t.borderColor       || '#000000',
        rotation:     t.rotation          ?? 0,
        padding:      t.padding           ?? 15,
      })), { ret: 'min' }));
    }
    // Archivos del bucket que usaban las filas antiguas y las nuevas ya no referencian (un GIF que
    // conserva su clave vuelve a tener la misma URL: esa NO se borra). Mejor esfuerzo, como siempre.
    if (_oldRows.length) {
      const _keep = new Set();
      layerRows.forEach(r => { if (r.gif_url) _keep.add(r.gif_url); if (r.anim_url) _keep.add(r.anim_url); });
      _tasks.push(Promise.all(_oldRows.flatMap(o => [
        (o && o.gif_url  && !_keep.has(o.gif_url))  ? _gifDelete(o.gif_url).catch(() => {})   : null,
        (o && o.anim_url && !_keep.has(o.anim_url)) ? _animDelete(o.anim_url).catch(() => {}) : null,
      ]).filter(Boolean)));
    }
    if (_panelWriteP) _tasks.push(_panelWriteP);
    await Promise.all(_tasks);
    _pm('doneMs');
    if (_pg) {
      _pg.layers = layerRows.length;
      _pg.sent = _toInsert.length; _pg.kept = _kept; _pg.keptKB = _keptKB; _pg.mode = _rowsP ? (_kept || _layerShaOk ? 'capas' : 'completo') : 'completo';
      _pg.kb = Math.round(_toInsert.reduce((n, r) => n + (r.layer_data ? r.layer_data.length : 0), 0) / 1024);
    }
  }

  // Limpia del bucket los gif/anim de las filas panel_layers antiguas de un
  // panelId concreto — usada por la ruta incremental antes de sustituir sus
  // filas (la ruta completa hace el equivalente en bloque, para toda la obra,
  // justo antes del borrado general de panels).
  async function _cleanupPanelFiles(panelId) {
    if (!panelId) return;
    try {
      const _oldLayers = await _get(`panel_layers?panel_id=eq.${panelId}&select=gif_url,anim_url`);
      const _jobs = [];
      (_oldLayers || []).forEach(_ol => {
        if (_ol.gif_url)  _jobs.push(_gifDelete(_ol.gif_url).catch(()=>{}));
        if (_ol.anim_url) _jobs.push(_animDelete(_ol.anim_url).catch(()=>{}));
      });
      await Promise.all(_jobs);
    } catch(_e) { /* no bloquear el guardado si falla la limpieza */ }
  }

  // prefetched (opcional, v41.46): promesa con el resultado ya pedido de la lista de hojas existentes en
  // la nube — {ok:true, v:[{id,panel_order}…]} o {ok:false, e:error} — que saveDraft lanza EN PARALELO
  // con la escritura de la fila works (antes iba detrás, un viaje de red más en fila).
  async function _uploadPanels(comic, dirtyPageIndices, onProgress, prefetched) {
    // comic.panels[] son renders planos (pueden estar vacíos para obras cloudOnly)
    // Usar editorData.pages como fuente de verdad para las capas
    const edPages = (comic.editorData && comic.editorData.pages) ? comic.editorData.pages : [];
    const panels  = comic.panels && comic.panels.length ? comic.panels : edPages.map((p, i) => ({
      dataUrl:     null,
      orientation: p.orientation === 'horizontal' ? 'h' : 'v',
      textMode:    p.textMode || 'sequential',
      texts:       p.texts || [],
    }));

    if (!panels.length) return;

    // ── ¿Podemos subir SOLO las páginas marcadas sucias? ──────────────────
    // dirtyPageIndices lo calcula edCloudSave a partir de _dirtyCloud por
    // página — viene como array cuando NO ha habido cambios estructurales
    // (añadir/eliminar/reordenar hojas) desde el último guardado en la nube.
    // Aun así, antes de fiarnos, comprobamos que el número de panels ya
    // existentes en Supabase coincide EXACTAMENTE con panels.length — si no
    // coincide (obra nunca subida, o cualquier inconsistencia), caemos a la
    // ruta completa de siempre en vez de arriesgar índices que no signifiquen
    // lo mismo que la última vez.
    //
    // Se calcula ANTES de la portada (justo abajo) porque la portada necesita
    // saber si esto va a acabar siendo una subida incremental de verdad, y
    // cuáles páginas están sucias exactamente — ver el porqué en su comentario.
    let _incrementalOk = Array.isArray(dirtyPageIndices);
    let _panelIdByOrder = null;
    if (_incrementalOk) {
      let _existingPanels;
      if (prefetched) {
        const _pf = await prefetched;
        if (!_pf.ok) throw _pf.e; // mismo fallo que si se hubiera pedido aquí
        _existingPanels = _pf.v || [];
      } else {
        _existingPanels = await _get(`panels?work_id=eq.${comic.supabaseId}&select=id,panel_order`) || [];
      }
      if (_existingPanels.length !== panels.length) {
        _incrementalOk = false; // no coincide el recuento — mejor subir todo
      } else {
        _panelIdByOrder = {};
        _existingPanels.forEach(row => { _panelIdByOrder[row.panel_order] = row.id; });
        // Verificar que TODOS los índices sucios tienen panel existente —
        // si falta alguno, algo no cuadra: caer a la ruta completa.
        for (const i of dirtyPageIndices) {
          if (_panelIdByOrder[i] == null) { _incrementalOk = false; break; }
        }
      }
    }

    // Subir thumbnail de la primera hoja (best-effort, no bloquea el guardado)
    // coverDataUrl (con el texto horneado, ver edRenderPage(page,withText) y
    // edSaveProject en editor.js) si existe — obras guardadas antes de este
    // cambio no lo tienen, panels[0].dataUrl sigue de respaldo.
    //
    // BUG CORREGIDO — Alberto: medición propia (navegar a la hoja 23 con la
    // barra "ir a hoja", mover solo una imagen ahí, guardar en nube: 20s para
    // una única hoja realmente sucia). Antes de este cambio, la portada se
    // resubía SIEMPRE en toda subida a la nube — reescalarla a JPEG y
    // volver a subirla — aunque la hoja 1 (de la que sale) no hubiera
    // cambiado desde el último guardado. Ahora se salta cuando ya sabemos
    // con certeza (_incrementalOk, arriba) que esto es una subida
    // incremental de verdad y la hoja 1 no está entre las sucias. Si
    // _incrementalOk es false (subida completa, o la obra nunca se subió a
    // la nube) se sigue subiendo siempre, exactamente igual que antes.
    const _skipCoverUpload = _incrementalOk && !dirtyPageIndices.includes(0);
    const _firstDataUrl = comic.coverDataUrl || panels[0]?.dataUrl || null;
    // v41.46: la portada (subida del JPEG + PATCH de works.cover_url) ya no va ANTES de las hojas: se
    // lanza a la vez que ellas y se espera al final. Es independiente (mejor esfuerzo, sus errores se
    // tragan igual que antes) y antes sumaba dos viajes de red en fila a cada guardado con la hoja 1
    // sucia o en cualquier subida completa.
    let _coverP = null;
    if (_firstDataUrl && !_skipCoverUpload) {
      _coverP = (async () => {
        try {
          const _coverUrlResult = await _thumbUpload(comic.supabaseId, _firstDataUrl).catch(() => null);
          if (_coverUrlResult) {
            await _patch('works', `id=eq.${comic.supabaseId}`, { cover_url: _coverUrlResult }).catch(() => {});
          }
        } catch(_) { /* la portada es mejor esfuerzo */ }
      })();
    }

    if (_incrementalOk) {
      // ── RUTA INCREMENTAL: solo tocar páginas realmente sucias ──────────
      if (dirtyPageIndices.length === 0) return; // nada cambió desde el último guardado en la nube
      // v40.78 — petición de Alberto: mostrar en la pantalla de bloqueo
      // cuántas hojas se están subiendo. _done se incrementa DESPUÉS de cada
      // hoja (no antes): con concurrencia 3, varias pueden estar en vuelo a
      // la vez, así que "iniciada" no es lo mismo que "terminada" — contar
      // solo lo ya terminado evita que el número salte hacia atrás o se
      // adelante a lo que de verdad ha llegado a Supabase.
      const _totalPages = dirtyPageIndices.length;
      let _donePages = 0;
      await _sbPoolMap(dirtyPageIndices, 3, async (i) => {
        const existingId = _panelIdByOrder[i];
        // v41.46: ya no hay un GET previo de las capas antiguas (_cleanupPanelFiles): _uploadOnePanel
        // las recibe en la respuesta del DELETE y borra del bucket solo lo que las filas nuevas no usan.
        await _uploadOnePanel(comic, edPages, panels[i], i, existingId);
        _donePages++;
        if (typeof onProgress === 'function') { try { onProgress(_donePages, _totalPages); } catch(_) {} }
      });
      if (_coverP) await _coverP;
      return;
    }

    // ── RUTA COMPLETA (comportamiento de siempre): borra todo y resube todo ──
    // Antes de borrar los panels, recoger las URLs de bucket para limpiar
    // archivos huérfanos. Paralelizado: antes se hacía un GET por panel
    // antiguo y un DELETE por gif/anim, todo secuencial.
    try {
      const _oldPanels = await _get(`panels?work_id=eq.${comic.supabaseId}&select=id`);
      if (_oldPanels && _oldPanels.length) {
        const _oldLayersByPanel = await Promise.all(
          _oldPanels.map(_op => _get(`panel_layers?panel_id=eq.${_op.id}&select=gif_url,anim_url`).catch(() => []))
        );
        const _cleanupJobs = [];
        for (const _oldLayers of _oldLayersByPanel) {
          for (const _ol of (_oldLayers || [])) {
            if (_ol.gif_url)  _cleanupJobs.push(_gifDelete(_ol.gif_url).catch(()=>{}));
            if (_ol.anim_url) _cleanupJobs.push(_animDelete(_ol.anim_url).catch(()=>{}));
          }
        }
        await Promise.all(_cleanupJobs);
      }
    } catch(_e) { /* no bloquear el guardado si falla la limpieza */ }
    await _delete('panels', `work_id=eq.${comic.supabaseId}`);

    // Subir cada página en paralelo, con concurrencia acotada a 3.
    // Las páginas son independientes entre sí: panel_order se guarda como
    // valor explícito en la fila (la reconstrucción en otro dispositivo
    // ordena por esa columna, no por el orden de inserción — ver
    // downloadDraftAsEditorData, order=panel_order.asc), cada panelId es un
    // UUID nuevo sin relación con los demás, y las claves de bucket
    // (gifKey, _bucketKey con sufijo aleatorio) son únicas por capa. limit=3:
    // mismo criterio que en la descarga — suficiente para no ir página a
    // página en serie, pero sin lanzar todas las imágenes/GIFs/APNG de una
    // obra pesada a la vez (riesgo de pico de memoria en Android).
    // v40.78 — mismo progreso que la ruta incremental, ver el comentario
    // junto a _donePages más arriba.
    const _totalPagesFull = panels.length;
    let _donePagesFull = 0;
    await _sbPoolMap(panels, 3, async (p, i) => {
      await _uploadOnePanel(comic, edPages, p, i, null);
      _donePagesFull++;
      if (typeof onProgress === 'function') { try { onProgress(_donePagesFull, _totalPagesFull); } catch(_) {} }
    });
    if (_coverP) await _coverP;
  }

  // ── BORRADOR EN NUBE ──────────────────────────────────────
  // Límite razonable: 50MB por obra (data_url de paneles son base64 JPEGs)
  // El campo published=false impide que aparezca en el reader público
  // onRevision (opcional, v40.49): se llama con el `updated_at` que ha quedado en la
  // fila `works` EN CUANTO se escribe, antes de subir las hojas. Así, aunque la
  // subida de hojas falle a medias o se cierre la app, este dispositivo sabe que
  // esa revisión de la nube es SUYA (ver WorkStore.setCloudRev) y no la toma por
  // un cambio hecho desde otro dispositivo.
  async function saveDraft(comic, dirtyPageIndices, onRevision, onProgress) {
    const sid = comic.supabaseId;
    if (!sid) throw new Error('Sin supabaseId para guardar borrador');

    const _recObj = _recBegin('saveDraft');
    try {
    // v41.46: con subida incremental hace falta la lista de hojas que ya hay en la nube (id + orden).
    // Se pide AHORA, a la vez que se escribe la fila works, en vez de esperar a que esta termine
    // (eran dos viajes de red en fila; ninguno depende del otro). El resultado se recoge como
    // {ok}|{ok:false,e} para que, si la escritura de works falla antes de llegar a usarlo, no quede
    // una promesa rechazada sin atender.
    const _panelsP = Array.isArray(dirtyPageIndices)
      ? _get(`panels?work_id=eq.${sid}&select=id,panel_order`).then(v => ({ ok: true, v }), e => ({ ok: false, e }))
      : null;

    const _sentUpdatedAt = new Date().toISOString();
    const _rows = await _upsert('works', {
      id:             sid,
      title:          comic.title      || '',
      author_name:    comic.author     || comic.username || '',
      author_id:      comic.userId     || null,
      genre:          comic.genre      || '',
      nav_mode:       comic.navMode    || 'fixed',
      social:         comic.social     || '',
      panel_count:    comic.panels?.length || 0,
      rules:          JSON.stringify(comic.editorData?._rules || []),
      // v40.46: muestras de color de la obra (columna palette: text con JSON, igual
      // que rules). Solo se envía si la obra tiene paleta: _upsert usa
      // resolution=merge-duplicates, que NO toca las columnas ausentes del envío,
      // así que una obra sin paleta — p.ej. guardada desde una versión anterior de
      // la app — no pisa con NULL la que ya hubiera en la nube.
      ...(Array.isArray(comic.editorData?._palette) ? { palette: JSON.stringify(comic.editorData._palette) } : {}),
      // Guardar en nube siempre vuelve la obra a borrador.
      // El admin deberá aprobarla de nuevo si se vuelve a publicar.
      published:      false,
      pending_review: false,
      updated_at:     _sentUpdatedAt,
    }, { select: 'updated_at' }); // v41.46: solo se necesita de vuelta esa columna (antes, la fila entera)
    // _upsert devuelve la fila tal como quedó en la base (return=representation):
    // se usa ese valor (el que verán los demás dispositivos), no el enviado.
    const _rev = (Array.isArray(_rows) && _rows[0] && _rows[0].updated_at) || _sentUpdatedAt;
    _recMark('works');
    if (typeof onRevision === 'function') { try { onRevision(_rev); } catch(_) {} }
    await _uploadPanels(comic, dirtyPageIndices, onProgress, _panelsP);
    _recMark('panels');
    return { sizeKB: 0, updatedAt: _rev }; // tamaño calculado por Supabase al rechazar si excede límite
    } catch (_e) {
      _recMark('ERROR ' + String((_e && _e.message) || _e).slice(0, 100));
      throw _e;
    } finally { _recEnd(_recObj); }
  }

  async function submitForReview(comic) {
    await _upsert('works', {
      id:             comic.supabaseId,
      title:          comic.title   || '',
      author_name:    comic.author  || comic.username || '',
      author_id:      comic.userId  || null,
      genre:          comic.genre   || '',
      nav_mode:       comic.navMode || 'fixed',
      social:         comic.social  || '',
      panel_count:    comic.panels?.length || 0,
      published:      false,
      pending_review: true,
    });
    // Si los panels llegan sin dataUrl (p.ej. publicando desde datos de la nube),
    // recuperar los data_url existentes en Supabase para no perder los thumbnails.
    const _panelsNeedThumb = comic.panels && comic.panels.every(p => !p.dataUrl);
    if (_panelsNeedThumb && comic.supabaseId) {
      try {
        const _existing = await _get(
          `panels?work_id=eq.${comic.supabaseId}&order=panel_order.asc&select=panel_order,data_url`
        );
        if (_existing && _existing.length) {
          const _thumbByOrder = {};
          _existing.forEach(p => { _thumbByOrder[p.panel_order] = p.data_url; });
          comic = {
            ...comic,
            panels: comic.panels.map((p, i) => ({
              ...p,
              dataUrl: _thumbByOrder[i] || null,
            })),
          };
        }
      } catch(_e) { /* preservar thumbnails es best-effort */ }
    }
    await _uploadPanels(comic);
  }

  // Marca la obra como "en revisión" SIN re-subir paneles ni editorData.
  // Usar cuando el contenido ya está en Supabase y solo hay que cambiar el estado.
  async function submitForReviewOnly(supabaseId) {
    await _patch('works', `id=eq.${supabaseId}`, { published: false, pending_review: true });
  }

  async function approveWork(comic) {
    const sid = comic.supabaseId;
    if (!sid) throw new Error('Sin supabaseId');
    await _patch('works', `id=eq.${sid}`, { published: true, pending_review: false });
  }

  async function unpublishWork(workId, supabaseId) {
    const sid = supabaseId || workId;
    await _patch('works', `id=eq.${sid}`, { published: false, pending_review: false });
  }

  async function deleteWork(supabaseId) {
    // Borrar la portada del bucket antes que nada — huérfano detectado y
    // corregido: hasta ahora nunca se limpiaba este archivo al borrar la obra.
    try {
      const _workRow = await _get(`works?id=eq.${supabaseId}&select=cover_url`);
      const _coverUrl = _workRow && _workRow[0] && _workRow[0].cover_url;
      if (_coverUrl) await _coverDelete(_coverUrl);
    } catch(_e) {}
    // Borrar en orden FK: panel_layers → panel_texts → panels → works
    const panels = await _get(`panels?work_id=eq.${supabaseId}&select=id`);
    for (const p of (panels || [])) {
      // Borrar GIFs y APNGs del bucket antes de borrar las capas
      try {
        const gifLayers = await _get(`panel_layers?panel_id=eq.${p.id}&layer_type=eq.gif&select=gif_url`);
        for (const gl of (gifLayers || [])) { await _gifDelete(gl.gif_url); }
        const animLayers = await _get(`panel_layers?panel_id=eq.${p.id}&select=anim_url`);
        for (const al of (animLayers || [])) { await _animDelete(al.anim_url); }
      } catch(e) {}
      await _delete('panel_layers', `panel_id=eq.${p.id}`);
      await _delete('panel_texts',  `panel_id=eq.${p.id}`);
    }
    await _delete('panels', `work_id=eq.${supabaseId}`);
    await _delete('works',  `id=eq.${supabaseId}`);
    // Borrar biblioteca de esta obra: archivos del bucket y filas en tabla biblioteca
    try {
      const _bibRows = await _get(`biblioteca?folder_id=like.${supabaseId}::*&select=anim_url`);
      for (const _br of (_bibRows || [])) { await _animDelete(_br.anim_url).catch(() => {}); }
      await _delete('biblioteca', `folder_id=like.${supabaseId}::*`);
    } catch(_e) {}
  }

  // Borrar todas las obras de un autor y su perfil de authors
  // ── GESTIÓN DE USUARIOS (panel de admin) ────────────────────────────────
  // Usa _get/_patch (token real de sesión vía _hdrsUser) — NO la clave anon
  // sola: desde que authors_select_public se restringió a "tu propia fila o
  // admin" (auditoría RLS), una petición sin el token de quien de verdad es
  // admin no vería ninguna fila.
  async function fetchAllUsers() {
    return _get('authors?select=id,username,email,role&order=role.asc,username.asc');
  }

  // Da o quita el rol de admin a un usuario. El trigger prevent_role_self_change
  // (ver auditoría RLS) exige que quien haga la petición YA sea admin — si no,
  // la revierte en silencio. No hace falta comprobarlo aquí: si quien llama a
  // esta función no es admin, la fila no cambia y ya está.
  async function setUserRole(userId, role) {
    return _patch('authors', `id=eq.${userId}`, { role });
  }

  async function deleteAuthorData(authorId) {
    const works = await _get(`works?author_id=eq.${authorId}&select=id`).catch(() => []);
    for (const w of (works || [])) {
      await deleteWork(w.id).catch(() => {});
    }
    // Borrar archivos de biblioteca del bucket anims
    try {
      const _bibRows = await _get(`biblioteca?author_id=eq.${authorId}&select=anim_url`);
      for (const _br of (_bibRows || [])) { await _animDelete(_br.anim_url).catch(()=>{}); }
    } catch(_e) {}
    await _delete('biblioteca', `author_id=eq.${authorId}`).catch(()=>{});
    await _delete('authors', `id=eq.${authorId}`);
  }

  // ── DESCARGAR BORRADOR PARA EDITAR ──────────────────────────────────────────────────────────────────
  // Descarga panel_layers (capas del editor, formato edSerLayer) y las devuelve
  // como editorData listo para edLoadProject(). El editor las pasa por edDeserLayer
  // sin ninguna conversion — es el mismo formato que guardo edSaveProject.
  async function downloadDraftAsEditorData(supabaseId) {
    // v40.49: mismo motivo que en fetchWorksByIds — token fresco antes de leer.
    if (window._authTryRefresh) await window._authTryRefresh();
    const works = await _get(`works?id=eq.${supabaseId}&limit=1&select=*`);
    if (!works || !works.length) throw new Error('Obra no encontrada en la nube');
    const work = works[0];
    let _projectRules = [];
    try { _projectRules = work.rules ? JSON.parse(work.rules) : []; } catch(e) { _projectRules = []; }
    // v40.46: muestras de color de la obra (columna palette, text con JSON). NULL o
    // ilegible = la obra no tiene paleta en la nube: no se devuelve _palette y el
    // editor conserva la local o usa la de por defecto (ver my-works.js y
    // edLoadProject, que además la valida con _edPaletteNormalize).
    let _projectPalette = null;
    try { const _pp = work.palette ? JSON.parse(work.palette) : null; if (Array.isArray(_pp)) _projectPalette = _pp; } catch(e) { _projectPalette = null; }

    const _panelsRaw = await _get(
      `panels?work_id=eq.${supabaseId}&order=panel_order.asc&select=id,panel_order,orientation,text_mode,data_url`
    ) || [];

    // Defensa contra páginas duplicadas: si por cualquier motivo hay más de
    // una fila con el mismo panel_order (p.ej. datos ya corruptos de antes
    // de un guardado en nube sin protección de reentrada, ya corregido),
    // quedarse con una sola en vez de mostrar la página repetida. No arregla
    // el dato en Supabase (ver diagnóstico), pero evita que el síntoma se
    // repita en cada descarga mientras tanto.
    const _seenOrders = new Set();
    const panels = [];
    for (const _p of _panelsRaw) {
      if (_seenOrders.has(_p.panel_order)) {
        console.warn('downloadDraftAsEditorData: panel_order duplicado detectado y descartado', _p.panel_order, 'obra', supabaseId);
        continue;
      }
      _seenOrders.add(_p.panel_order);
      panels.push(_p);
    }

    // Metadatos de capas (JSON ligero) de TODAS las páginas en paralelo.
    // Antes era una petición secuencial por página — en obras con muchas hojas
    // eso multiplicaba directamente la latencia de red por el número de hojas.
    // limit=6: margen prudente para no disparar peticiones simultáneas de más.
    // v40.49: antes cada fallo de esta lectura se tragaba con .catch(() => []) y la
    // hoja acababa con solo su miniatura (ver el «Fallback» de más abajo) sin avisar:
    // una descarga degradada que además se daba por buena y sustituía a la copia
    // local. Ahora se reintenta UNA vez y, si sigue fallando, la descarga entera
    // FALLA (quien llama muestra el error y no abre nada).
    const _layerRowsByPanel = await _sbPoolMap(panels, 6, async panel => {
      const _q = `panel_layers?panel_id=eq.${panel.id}&order=layer_order.asc`;
      try { return await _get(_q); }
      catch (_e1) {
        await new Promise(r => setTimeout(r, 400));
        return await _get(_q);
      }
    });

    // Procesar (descomprimir + descargar GIF/APNG) cada capa de cada página.
    // Concurrencia acotada a 3: son binarios potencialmente pesados — lanzar
    // TODAS las capas animadas de una obra a la vez arriesgaría picos de
    // memoria en Android. Aun así, 3 en paralelo ya evita la cascada
    // estrictamente secuencial que había antes (capa a capa, página a página).
    const _flatLayers = [];
    panels.forEach((panel, pi) => {
      (_layerRowsByPanel[pi] || []).forEach((row, li) => _flatLayers.push({ pi, li, row }));
    });
    const _flatResults = await _sbPoolMap(_flatLayers, 3, async ({ pi, li, row }) => {
      let layerObj = null;
      try {
        const _raw = await _czDecompress(row.layer_data);
        layerObj = JSON.parse(_raw);
      } catch(e) {
        console.warn('downloadDraftAsEditorData: capa descartada (no se pudo decodificar)', 'panel', pi, 'layer_order', li, e);
      }
      if (!layerObj) return null;
      // APNG animado — patrón idéntico al GIF:
      // APNG: descargar si hay anim_url — sin depender de animKey
      if (layerObj.type === 'image' && row.anim_url) {
        try {
          const _apngDataUrl = await _animDownload(row.anim_url);
          if (_apngDataUrl) {
            layerObj._apngSrc = _apngDataUrl;
            // Guardar en IDB con clave prefijada por userId para que el visor la encuentre
            try {
              const _s = JSON.parse(localStorage.getItem('cs_session') || 'null');
              const _uid2 = (_s && _s.id) ? String(_s.id).replace(/[^a-zA-Z0-9_-]/g, '_') : '_anon_';
              // Usar clave con supabaseId embebido para que el detector de huérfanos
              // la reconozca correctamente. Formato: {uid}__{supabaseId}_{pi}_{li}
              // idéntico al que usa edSaveProject, así son intercambiables.
              const _idbKey2 = _uid2 + '__' + supabaseId + '_' + pi + '_' + li;
              await _sbAnimIdbSave(_idbKey2, _apngDataUrl);
              layerObj._pngFramesKey = _idbKey2;
            } catch(_idbErr) {
              // IDB no disponible (modo incógnito) — datos en _apngSrc solamente
              // El visor usará _apngSrc directamente si _pngFramesKey no existe
              window._edIdbUnavailable = true;
            }
          }
        } catch(e) { console.warn('APNG cloud download:', e); }
      }
      // GIF: descargar de Storage y meter en IndexedDB local
      if (layerObj.type === 'gif' && row.gif_url) {
        try {
          // cache:'no-store' — mismo motivo que _animDownload: garantizar
          // que el visor interno del editor siempre reciba el GIF más
          // reciente, no una copia obsoleta servida desde caché.
          const gifResp = await fetch(row.gif_url, { cache: 'no-store' });
          if (gifResp.ok) {
            const blob   = await gifResp.blob();
            const reader = new FileReader();
            const dataUrl = await new Promise(res => {
              reader.onload = e => res(e.target.result);
              reader.readAsDataURL(blob);
            });
            if (window._gifIdbSave && layerObj.gifKey) {
              await window._gifIdbSave(layerObj.gifKey, dataUrl).catch(() => {});
            }
          }
        } catch(e) { console.warn('GIF cloud download:', e); }
      }
      // Animaciones insertadas DENTRO de un flujo de texto (ver
      // _tdInsertGif/_tdInsertFromBib en editor-textdoc.js) — mismo
      // re-materializado que el caso de arriba (capas 'gif'/'image' de
      // nivel superior), pero recorriendo cada línea de richLines que se
      // subió con gifUrl o animUrl (ver la subida, unas líneas más arriba
      // en este archivo). Se reutiliza la MISMA clave (no una nueva) —
      // igual que el caso de arriba, ya es un id único por sí mismo
      // (timestamp+random del dispositivo de origen).
      if (layerObj.type === 'text' && Array.isArray(layerObj.richLines)) {
        for (const rl of layerObj.richLines) {
          if (rl && rl.gifUrl && rl.gifKey) {
            try {
              const _rlResp = await fetch(rl.gifUrl, { cache: 'no-store' });
              if (_rlResp.ok) {
                const _rlBlob = await _rlResp.blob();
                const _rlReader = new FileReader();
                const _rlDataUrl = await new Promise(res => {
                  _rlReader.onload = e => res(e.target.result);
                  _rlReader.readAsDataURL(_rlBlob);
                });
                if (window._gifIdbSave) await window._gifIdbSave(rl.gifKey, _rlDataUrl).catch(() => {});
              }
            } catch(e) { console.warn('GIF (flujo de texto) cloud download:', e); }
          } else if (rl && rl.animUrl && rl.animKey) {
            try {
              const _rlApngDl = await _animDownload(rl.animUrl);
              if (_rlApngDl && window._sbAnimIdbSave) await window._sbAnimIdbSave(rl.animKey, _rlApngDl).catch(() => {});
            } catch(e) { console.warn('APNG (flujo de texto) cloud download:', e); }
          }
        }
      }
      return layerObj;
    });

    // Reagrupar los resultados aplanados de vuelta en páginas, preservando el
    // orden original de panel_order/layer_order.
    let _cursor = 0;
    const pages = panels.map((panel, pi) => {
      const _rowCount = (_layerRowsByPanel[pi] || []).length;
      const layers = _flatResults.slice(_cursor, _cursor + _rowCount).filter(Boolean);
      _cursor += _rowCount;

      // Fallback: si no hay panel_layers (obra antigua), usar data_url como ImageLayer
      if (layers.length === 0 && panel.data_url) {
        layers.push({ type: 'image', src: panel.data_url, x: 0.5, y: 0.5, width: 1.0, height: 1.0, _keepSize: true });
      }

      const orient = panel.orientation === 'h' ? 'horizontal' : 'vertical';
      return {
        orientation:      orient,
        textMode:         panel.text_mode || 'sequential',
        textLayerOpacity: 1,
        layers,
      };
    });

    return {
      work,
      editorData: {
        orientation: pages[0]?.orientation || 'vertical',
        _rules: _projectRules,
        ...(_projectPalette ? { _palette: _projectPalette } : {}),
        pages,
      },
    };
  }

  // ── ADMIN: LISTAR OBRAS DESDE SUPABASE ──────────────────────
  // Devuelven obras en formato compatible con buildAdminRow del admin.
  // Fetch genérico de obras + thumbnail del primer panel (dos queries, sin join).
  async function _fetchWorks(filter) {
    const works = await _get(
      `works?${filter}&order=updated_at.desc` +
      `&select=id,title,author_name,genre,nav_mode,social,published,pending_review,updated_at,cover_url`
    );
    if (!works || !works.length) return [];

    // cover_url (con el texto horneado, ver edRenderPage(page,withText) en
    // editor.js) si existe — obras guardadas antes de este cambio no lo
    // tienen, el panel_order=0 (sin texto) sigue de respaldo para esas.
    const _needFallback = works.filter(w => !w.cover_url).map(w => w.id);
    let thumbMap = {};
    if (_needFallback.length) {
      try {
        const panels = await _get(
          `panels?work_id=in.(${_needFallback.join(',')})&panel_order=eq.0&select=work_id,data_url`
        );
        (panels || []).forEach(p => { thumbMap[p.work_id] = p.data_url; });
      } catch(e) { /* sin thumbnails */ }
    }

    return works.map(w => _workToComic(w, w.published, w.cover_url || thumbMap[w.id] || ''));
  }

  async function fetchPendingWorks() {
    return _fetchWorks('pending_review=eq.true&published=eq.false');
  }

  async function fetchPublishedWorks() {
    return _fetchWorks('published=eq.true');
  }

  // ── EXPOSITOR (home.js): LISTADO PAGINADO POR CURSOR ────────
  // A diferencia de fetchPublishedWorks (arriba, usada por el admin para
  // ver TODAS las obras de golpe), esta es la versión que usa el expositor
  // público — pensada para poder llegar a tener miles de obras publicadas
  // sin tener que cargarlas ni tenerlas todas en memoria de golpe.
  //
  // Paginación por CURSOR ("keyset"/"seek"), no por OFFSET: con OFFSET,
  // Postgres tiene que recorrer y descartar TODAS las filas anteriores en
  // cada página (página 1 con una tabla de miles de filas es instantánea,
  // pero la página 50 ya tiene que descartar cientos de filas antes de
  // devolver las 20 que tocan, y esto empeora linealmente cuantas más
  // obras haya) — con cursor, Postgres usa directamente el índice de
  // (published, updated_at, id) para saltar al punto exacto donde se
  // quedó la página anterior, con coste prácticamente constante sin
  // importar cuántas páginas lleve ya cargadas la persona. Es el mismo
  // patrón que usan Stripe, GitHub y Slack en sus APIs — el cursor es,
  // literalmente, el updated_at + id del último elemento de la página
  // anterior; "id" como desempate porque updated_at por sí solo podría
  // repetirse entre varias obras.
  //
  // Requiere un índice en Supabase para que el salto sea realmente O(1) —
  // ver el SQL que se le ha pasado a Alberto para crearlo.
  const WORKS_PAGE_SIZE = 20;

  function _worksCursorFilter(cursor) {
    if (!cursor) return '';
    const ts = encodeURIComponent(cursor.updatedAt);
    // or=(A,and(B,C)) en sintaxis PostgREST: "o bien es estrictamente más
    // antigua, o tiene la MISMA fecha pero un id menor" — el filtro
    // estándar de "seek method" para paginar por dos columnas a la vez.
    return `&or=(updated_at.lt.${ts},and(updated_at.eq.${ts},id.lt.${cursor.id}))`;
  }

  async function _fetchWorksPage(baseFilter, cursor, limit) {
    const pageSize = limit || WORKS_PAGE_SIZE;
    const works = await _get(
      `works?${baseFilter}${_worksCursorFilter(cursor)}` +
      `&order=updated_at.desc,id.desc&limit=${pageSize}` +
      `&select=id,title,author_name,genre,nav_mode,social,published,pending_review,updated_at,cover_url`
    );
    if (!works || !works.length) return { items: [], nextCursor: cursor, hasMore: false };

    const _needFallback = works.filter(w => !w.cover_url).map(w => w.id);
    let thumbMap = {};
    if (_needFallback.length) {
      try {
        const panels = await _get(
          `panels?work_id=in.(${_needFallback.join(',')})&panel_order=eq.0&select=work_id,data_url`
        );
        (panels || []).forEach(p => { thumbMap[p.work_id] = p.data_url; });
      } catch(e) { /* sin thumbnails */ }
    }

    const items = works.map(w => _workToComic(w, w.published, w.cover_url || thumbMap[w.id] || ''));
    const last  = works[works.length - 1];
    return {
      items,
      nextCursor: { updatedAt: last.updated_at, id: last.id },
      // Heurística estándar de paginación por cursor: si ha vuelto una
      // página LLENA, es probable que haya más — si ha vuelto más corta,
      // es que ya no queda nada más. No hace falta (ni conviene, por coste)
      // una consulta de COUNT(*) aparte solo para saberlo con certeza.
      hasMore: works.length === pageSize,
    };
  }

  // Escapa los caracteres especiales de SQL LIKE (%, _, \) y del comodín
  // propio de PostgREST (*) para que un prefijo escrito por la persona que
  // por casualidad contenga alguno de ellos (p.ej. un título con un "%"
  // real) se compare como texto literal, no como comodín — ver
  // authorPrefix/titlePrefix más abajo.
  function _likeEscape(s) {
    return String(s).replace(/[\\%_*]/g, ch => '\\' + ch);
  }

  // opts: { genre, author, title } — valor EXACTO ya existente, filtra
  // igual que hacía antes el filtro en memoria de home.js, pero ahora en el
  // propio servidor (necesario para que, con miles de obras, un filtro siga
  // encontrando resultados que no estuvieran en las primeras páginas ya
  // cargadas). opts: { genreIn, authorPrefix, titlePrefix } — búsqueda por
  // PREFIJO (Intro/lupa en el buscador de Filtros, ver applyPrefixFilter en
  // home.js): puede coincidir con VARIAS obras a la vez.
  // authorPrefix/titlePrefix necesitan las columnas generadas
  // author_search/title_search (minúsculas + sin acentos vía unaccent) —
  // ver el SQL que se le ha pasado a Alberto para crearlas; sin ellas esta
  // llamada devuelve un error 400 de Supabase (columna inexistente), que
  // home.js ya trata igual que cualquier otro fallo de carga de página.
  // genreIn no necesita nada de eso: el universo de géneros es fijo y
  // pequeño (GENRES en genres.js), así que ya llega aquí resuelto a una
  // lista de ids exactos.
  async function fetchPublishedWorksPage(cursor, opts) {
    let filter = 'published=eq.true';
    if (opts && opts.genre)  filter += `&genre=eq.${encodeURIComponent(opts.genre)}`;
    if (opts && opts.author) filter += `&author_name=eq.${encodeURIComponent(opts.author)}`;
    if (opts && opts.title)  filter += `&title=eq.${encodeURIComponent(opts.title)}`;
    if (opts && opts.genreIn) {
      // Prefijo que no coincidió con ninguna etiqueta de género (ver
      // applyPrefixFilter): debe devolver CERO obras, no todas — "eq" a un
      // id imposible es el truco estándar para eso sin liar el resto de la
      // consulta con un "in.()" vacío (sintaxis inválida en PostgREST).
      filter += opts.genreIn.length
        ? `&genre=in.(${opts.genreIn.map(encodeURIComponent).join(',')})`
        : `&genre=eq.__sin_coincidencias__`;
    }
    if (opts && opts.authorPrefix) filter += `&author_search=like.${encodeURIComponent(_likeEscape(opts.authorPrefix) + '*')}`;
    if (opts && opts.titlePrefix)  filter += `&title_search=like.${encodeURIComponent(_likeEscape(opts.titlePrefix) + '*')}`;
    return _fetchWorksPage(filter, cursor, opts && opts.limit);
  }

  // Universo COMPLETO de géneros/autores/títulos publicados, para el menú de
  // Filtros — deliberadamente separada de fetchPublishedWorksPage: el menú
  // de filtros tiene que poder ofrecer un género/autor/título aunque sus
  // obras aún no se hayan cargado en pantalla (solo las primeras páginas
  // están cargadas en un momento dado). Trae solo genre/author_name/title
  // (sin miniaturas ni el resto de columnas) para que sea ligera incluso con
  // miles de filas — es la misma idea que las apps grandes llaman
  // "facets"/"filtros disponibles", resuelta aparte del listado principal.
  async function fetchPublishedFacets() {
    const rows = await _get(`works?published=eq.true&select=genre,author_name,title`);
    return (rows || []).map(r => ({ genre: r.genre || '', username: r.author_name || '', title: r.title || '' }));
  }

  // Convierte una fila de Supabase al formato compatible con home/admin/my-works
  function _workToComic(w, published, thumb) {
    return {
      id:            w.id,
      supabaseId:    w.id,
      title:         w.title        || '(sin título)',
      author:        w.author_name  || '',
      username:      w.author_name  || '',
      genre:         w.genre        || '',
      navMode:       w.nav_mode     || 'fixed',
      social:        w.social       || '',
      published:     published,
      approved:      published,
      // pending_review viene de Supabase — fuente de verdad definitiva
      pendingReview: published ? false : (w.pending_review || false),
      updatedAt:     w.updated_at,
      panels:        thumb ? [{ dataUrl: thumb }] : [],
    };
  }

  // Devuelve metadatos básicos de obras por array de supabaseIds (para sync multi-dispositivo)
  async function fetchWorksByIds(ids) {
    if (!ids || !ids.length) return [];
    // v40.49: refrescar el token ANTES de leer, como ya hacen _upsert/_patch/_delete.
    // Con el token caducado (PWA abierta más de una hora) la lectura daba 401 y quien
    // llamaba —el botón «Editar»— lo tragaba en silencio y abría la copia local sin
    // haber podido comprobar la nube.
    if (window._authTryRefresh) await window._authTryRefresh();
    const list = ids.join(',');
    const r = await _get(`works?id=in.(${list})&select=id,updated_at,title,genre,nav_mode,published,pending_review,cover_url`);
    return r || [];
  }

  // ── BIBLIOTECA ────────────────────────────────────────────────
  async function bibFetch(authorId, workId) {
    // Filtrar por author_id — el filtrado por folder_id se hace en JS
    // para evitar problemas de encoding del wildcard % en la URL
    const filter = `author_id=eq.${authorId}&order=created_at.asc`;
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${BASE}/biblioteca?${filter}`, {
      headers: _hdrsUser(),
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`bibFetch: ${r.status} ${await r.text()}`);
    const rows = await r.json();
    // Filtrar en JS por workId si se especificó
    if (!workId) return rows;
    // Incluir items con prefijo workId:: Y items legacy sin prefijo UUID
    // (solo __root__ y __anim__ exactos — no folder_ids de otras obras)
    const _legacyFolders = new Set(['__root__', '__anim__']);
    return rows.filter(row => {
      if (!row.folder_id) return false;
      if (row.folder_id.startsWith(workId + '::')) return true;
      if (_legacyFolders.has(row.folder_id)) return true;
      return false;
    });
  }

  // Sincronización completa: sube todos los items locales a Supabase.
  // folder_id se prefixa con workId:: para aislar por proyecto.
  async function bibSync(authorId, bibData, workId) {
    const prefix = workId ? workId + '::' : '';
    const folders = (bibData && bibData.folders) ? bibData.folders : [];
    const rows = [];
    for (const folder of folders) {
      for (const entry of (folder.items || [])) {
        let _animUrl = null;
        // APNG animado de biblioteca: subir al bucket 'anims'
        if (entry.isGifAnim) {
          try {
            let _apngDataUrl = null;
            if (entry.apngSrc) {
              // Ya es un dataUrl APNG completo — subir directamente
              _apngDataUrl = entry.apngSrc;
            } else if (entry.pngFrames && entry.pngFrames.length > 1) {
              // Array de frames individuales — reconstruir APNG
              _apngDataUrl = await _buildApngFromFrames(entry.pngFrames, entry.gcpFrameDelay || 100, entry.gcpFrameHolds);
            }
            if (_apngDataUrl) {
              const _bucketKey = 'bib_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
              _animUrl = await _animUpload(_bucketKey, _apngDataUrl);
            }
          } catch(e) { console.warn('bibSync APNG upload:', e); }
        }
        // Payload: para GIF/APNG incluir todo lo necesario para re-edición
        // pngFrames van al bucket (anim_url), gifDataUrl/thumb son pequeños
        // gcpLayersData/gcpFramesData son vectoriales — se comprimen bien
        // Para items con fill: embeber fillLayerData en el payload
        const _payloadBase = entry.isGifAnim
          ? { isGifAnim:      true,
              gifDataUrl:     entry.gifDataUrl,
              gcpFrameDelay:  entry.gcpFrameDelay,
              gcpRepeatCount: entry.gcpRepeatCount,
              gcpStopAtEnd:   entry.gcpStopAtEnd,
              gcpLayersData:  entry.gcpLayersData  || null,
              gcpFramesData:  entry.gcpFramesData  || null,
              gcpLayerNames:  entry.gcpLayerNames  || null,
              normW:          entry.normW           || null,
              normH:          entry.normH           || null }
          : entry.layerData;
        // Embeber fillLayerData, orientation e isGroup en el payload (sin columnas extra)
        const _payload = entry.isGifAnim ? _payloadBase : {
          ..._payloadBase,
          ...(entry.fillLayerData ? { _fillLayerData: entry.fillLayerData } : {}),
          ...(entry.orientation   ? { _orientation:   entry.orientation   } : {}),
          ...(entry.isGroup       ? { _isGroup: true, _layers: entry.layers } : {}),
        };
        // Comprimir cualquier payload >=512 bytes antes de subir — mismo criterio
        // que _uploadPanels() para panel_layers (ver supabase-client.js ~línea 590).
        // Antes solo se comprimían las animaciones (isGifAnim); los grupos (que
        // pueden incluir varias capas con dataUrl de trazo/relleno/acuarela) se
        // subían siempre sin comprimir, con riesgo real de exceder el límite
        // práctico de tamaño de petición y fallar la sincronización sin avisar.
        const _ldRaw = JSON.stringify(_payload);
        const _ld = _ldRaw.length >= _CZ_MIN ? await _czCompress(_ldRaw) : _ldRaw;
        // BUG CORREGIDO — el cuello de botella real de "la biblioteca no
        // sincroniza" (reportado por Alberto tras varios intentos previos
        // que no llegaban a la causa). biblioteca.id es PRIMARY KEY GLOBAL
        // en Supabase (ver CARTA_SIGUIENTE_INSTANCIA_v12_58, SQL original de
        // la tabla) — a diferencia de folder_id, que sí lleva el prefijo
        // workId:: desde v12.73 para aislar por obra. La biblioteca está
        // pensada a propósito para reutilizarse ENTRE obras (mismo objeto,
        // mismo id local, usado en varias) — así que en cuanto ese id ya
        // está insertado en la nube desde OTRA obra (p.ej. "otra obra
        // distinta se guardó bien" que compartía recursos con esta), el
        // INSERT de ESTA obra choca con la clave ya existente. bibSync
        // manda todas las filas en una única petición POST — un solo choque
        // de clave hace fallar la subida ENTERA, sin relación con el
        // tamaño de nada (de ahí que ningún objeto pareciera "muy grande").
        // Se prefija también el id de fila con workId:: — igual que ya se
        // hace con folder_id — para que cada obra tenga su propia copia con
        // clave única en la nube. bibDownload deshace este mismo prefijo al
        // reconstruir el id local, con el mismo criterio que ya usa para
        // folder_id.
        rows.push({
          id:          prefix + entry.id,
          author_id:   authorId,
          layer_type:  entry.isGifAnim ? 'gif' : ((entry.layerData && entry.layerData.type) || 'unknown'),
          layer_data:  _ld,
          anim_url:    _animUrl,
          thumb:       entry.thumb,
          folder_id:   prefix + folder.id,
          folder_name: folder.name,
        });
      }
    }
    // Recuperar rows existentes para borrar archivos huérfanos del bucket
    try {
      const _existingRows = await bibFetch(authorId, workId);
      // Construir set de anim_urls que van a seguir existiendo
      const _keepUrls = new Set(rows.filter(r => r.anim_url).map(r => r.anim_url));
      for (const _er of (_existingRows || [])) {
        if (_er.anim_url && !_keepUrls.has(_er.anim_url)) {
          await _animDelete(_er.anim_url).catch(()=>{});
        }
      }
    } catch(_e) { /* no bloquear si falla la limpieza */ }

    // Borrar todos los rows existentes del autor/workId y luego insertar limpio
    // (merge-duplicates no borra los items que ya no existen en local).
    //
    // BUG CORREGIDO (biblioteca de una obra seguía sin sincronizar pese a que
    // ningún objeto se acerca al tamaño que sugería el aviso — confirmado con
    // el diagnóstico 🩺: 716 KB en total, el mayor 164 KB). Estos DELETE
    // usaban ".catch(()=>{})", el mismo patrón "tragar en silencio" que YA
    // se identificó y corrigió para _animDelete/_gifDelete (ver
    // _deleteWithRetry más arriba: token de sesión caducado → 401 en el
    // borrado → huérfanos, silenciado sin dejar rastro). Si ESTOS DELETE
    // fallan igual, las filas antiguas con el mismo id nunca se borran antes
    // del INSERT de más abajo — que sí lanza de verdad el error de bibSync —
    // y ese INSERT choca con la clave ya existente. Se reutiliza
    // _deleteWithRetry (refresca el token, reintenta una vez, deja
    // constancia en consola si sigue fallando) en vez de silenciarlo sin más.
    if (workId) {
      // Borrar con prefijo
      await _deleteWithRetry('biblioteca:' + workId, () => fetch(`${BASE}/biblioteca?author_id=eq.${authorId}&folder_id=like.${workId}::*`, {
        method: 'DELETE', headers: _hdrsUser(),
      }));
      // Borrar sin prefijo (legacy — no contienen '::')
      // PostgREST no soporta NOT LIKE directamente en todos los contextos,
      // así que borramos los que tienen folder_id exactamente '__root__' o '__anim__'
      // que son los únicos folder_id posibles sin prefijo
      await _deleteWithRetry('biblioteca:legacy:' + authorId, () => fetch(`${BASE}/biblioteca?author_id=eq.${authorId}&folder_id=in.(__root__,__anim__)`, {
        method: 'DELETE', headers: _hdrsUser(),
      }));
    } else {
      await _deleteWithRetry('biblioteca:todo:' + authorId, () => fetch(`${BASE}/biblioteca?author_id=eq.${authorId}`, {
        method: 'DELETE', headers: _hdrsUser(),
      }));
    }

    if (!rows.length) return;
    // Refrescar el token justo antes del INSERT final — es la única petición
    // de bibSync que de verdad puede lanzar (ver más abajo), así que es la
    // que más falta le hace llegar con un token fresco.
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${BASE}/biblioteca`, {
      method:  'POST',
      headers: { ..._hdrsUser(), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(rows),
    });
    if (!r.ok) {
      const _errBody = await r.text();
      // Detalle completo del fallo real (no una suposición) — ver
      // window._edLastBibSyncError en editor.js/edCloudSave, mostrado en el
      // diagnóstico 🩺 ("Último error de bibSync").
      if (typeof window !== 'undefined') {
        window._edLastBibSyncError = { status: r.status, body: _errBody.slice(0, 2000), rows: rows.length, ts: new Date().toISOString() };
      }
      throw new Error(`bibSync: ${r.status} ${_errBody}`);
    }
  }

  // Descarga biblioteca desde Supabase y reconstruye la estructura de carpetas.
  async function bibDownload(authorId, workId) {
    const rows = await bibFetch(authorId, workId);
    const prefix = workId ? workId + '::' : '';
    const folderMap = new Map();
    for (const r of rows) {
      const rawFid = r.folder_id || '__root__';
      const fid  = prefix && rawFid.startsWith(prefix) ? rawFid.slice(prefix.length) : rawFid;
      const fname = r.folder_name || 'General';
      if (!folderMap.has(fid)) folderMap.set(fid, { id: fid, name: fname, items: [] });
      let ld = null;
      try {
        const _rld = await _czDecompress(r.layer_data);
        if (_rld && _rld.startsWith('gz:')) {
          // _czDecompress devolvió sin descomprimir — registrar
continue;
        }
        ld = JSON.parse(_rld);
      } catch(e) {
      }
      if (!ld) continue;
      // Reconstruir item: GIF/APNG animado o layer normal
      // Usar layer_type='gif' como fallback si ld.isGifAnim no está en JSON antiguo
      if (ld.isGifAnim || r.layer_type === 'gif') {
        // Descargar APNG desde bucket si tiene anim_url
        let _pngFrames = ld.pngFrames || null;
        let _apngSrc = null;
        if (r.anim_url) {
          try {
            _apngSrc = await _animDownload(r.anim_url);
          } catch(e) { console.warn('bibDownload APNG:', e); }
        }
        // Deshacer el prefijo workId:: del id de fila (ver bibSync) —
        // mismo criterio que ya se usa arriba para folder_id/fid, para que
        // el id local reconstruido sea idéntico al que tenía antes de subir.
        const _rid = prefix && r.id.startsWith(prefix) ? r.id.slice(prefix.length) : r.id;
        folderMap.get(fid).items.push({
          id:             _rid,
          timestamp:      new Date(r.created_at).getTime(),
          isGroup:        false,
          isGifAnim:      true,
          gifDataUrl:     ld.gifDataUrl,
          pngFrames:      _pngFrames,
          apngSrc:        _apngSrc,
          gcpFrameDelay:  ld.gcpFrameDelay  || 100,
          gcpRepeatCount: ld.gcpRepeatCount || 0,
          gcpStopAtEnd:   ld.gcpStopAtEnd   || false,
          gcpLayersData:  ld.gcpLayersData  || null,
          gcpFramesData:  ld.gcpFramesData  || null,
          gcpLayerNames:  ld.gcpLayerNames  || null,
          normW:          ld.normW           || null,
          normH:          ld.normH           || null,
          layerData:      null,
          thumb:          r.thumb,
        });
      } else {
        // Extraer campos embebidos en el payload
        const _fillData    = ld._fillLayerData || null;
        const _orientation = ld._orientation   || null;
        const _isGroup     = ld._isGroup       || false;
        const _groupLayers = ld._layers        || null;
        const _layerDataClean = { ...ld };
        delete _layerDataClean._fillLayerData;
        delete _layerDataClean._orientation;
        delete _layerDataClean._isGroup;
        delete _layerDataClean._layers;
        // Deshacer el prefijo workId:: del id de fila (ver bibSync y la
        // misma corrección en la rama gif de arriba).
        const _rid = prefix && r.id.startsWith(prefix) ? r.id.slice(prefix.length) : r.id;
        const _item = {
          id:            _rid,
          timestamp:     new Date(r.created_at).getTime(),
          isGroup:       _isGroup,
          layerData:     _isGroup ? null : _layerDataClean,
          layers:        _isGroup ? _groupLayers : null,
          fillLayerData: _fillData,
          thumb:         r.thumb,
        };
        if (_orientation) _item.orientation = _orientation;
        folderMap.get(fid).items.push(_item);
      }
    }
    return { folders: [...folderMap.values()] };
  }

  // Lista todas las obras de un autor en Supabase (para sync multi-dispositivo)
  async function fetchWorksByAuthor(authorId) {
    if(!authorId) return [];
    const works = await _get(
      `works?author_id=eq.${authorId}&order=updated_at.desc` +
      `&select=id,title,author_name,genre,nav_mode,social,published,pending_review,updated_at,cover_url`
    ).catch(() => []);
    if(!works || !works.length) return [];
    // cover_url (con el texto horneado) si existe; respaldo al panel_order=0
    // (sin texto) solo para las obras que aún no lo tengan.
    const _needFallback = works.filter(w => !w.cover_url).map(w => w.id);
    let thumbMap = {};
    if (_needFallback.length) {
      try {
        const panels = await _get(`panels?work_id=in.(${_needFallback.join(',')})&panel_order=eq.0&select=work_id,data_url`);
        (panels || []).forEach(p => { thumbMap[p.work_id] = p.data_url; });
      } catch(_) {}
    }
    return works.map(w => _workToComic(w, w.published, w.cover_url || thumbMap[w.id] || ''));
  }

  // Dispara la descarga+caché en R2 de una familia de Google Fonts a través
  // del worker (POST /fonts/fetch, requiere sesión — ver _hdrsWorker). Solo
  // se llama desde el buscador de fuentes del editor, nunca automáticamente.
  // Una vez cacheada queda servida en público para siempre (igual que gifs/
  // anims/covers) — _cxLoadExternalFont (editor.js/reader.js) es quien la
  // carga después, sin autenticación.
  async function fetchGoogleFont(family) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${WORKER}/fonts/fetch`, {
      method:  'POST',
      headers: { ..._hdrsWorker(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ family }),
    });
    if (!r.ok) throw new Error(`fetchGoogleFont ${family}: ${r.status} ${await r.text()}`);
    return r.json();
  }

  // Catálogo de Google Fonts (nombre + categoría), cacheado por el propio
  // worker — ver GET /fonts/catalog, público, sin autenticación.
  async function fetchFontCatalog() {
    const r = await fetch(`${WORKER}/fonts/catalog`);
    if (!r.ok) throw new Error(`fetchFontCatalog: ${r.status} ${await r.text()}`);
    return r.json();
  }

    return { saveDraft, submitForReview, submitForReviewOnly, approveWork, unpublishWork, deleteWork, deleteAuthorData, downloadDraftAsEditorData, fetchPendingWorks, fetchPublishedWorks, fetchPublishedWorksPage, fetchPublishedFacets, fetchWorksByIds, fetchWorksByAuthor, bibSync, bibDownload, fetchAllUsers, setUserRole, fetchGoogleFont, fetchFontCatalog };
})();
