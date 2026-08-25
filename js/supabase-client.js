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

async function _czCompress(jsonStr) {
  // No comprimir si las APIs no están disponibles en este navegador
  if (!jsonStr || jsonStr.length < _CZ_MIN ||
      typeof CompressionStream === 'undefined' ||
      typeof DecompressionStream === 'undefined') return jsonStr;
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
    return _CZ_PFX + b64;
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

  async function _get(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // 8s timeout
    try {
      // cache:'no-store' — nunca servir una respuesta guardada por el navegador.
      // Esta es la función genérica de lectura (works/panels/panel_layers/
      // biblioteca): si el navegador cacheara una fila desactualizada, el
      // editor (y su visor interno) podría cargar una obra con capas u
      // opciones "anim_url"/"gif_url" antiguas aunque ya se hubiera guardado
      // una versión más reciente en Supabase.
      const r = await fetch(`${BASE}/${path}`, { headers: _hdrsUser(), signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
      return r.json();
    } catch(e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error(`Timeout en GET ${path}`);
      throw e;
    }
  }

  async function _upsert(table, data) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${BASE}/${table}`, {
      method:  'POST',
      headers: { ..._hdrsUser(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body:    JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`UPSERT ${table}: ${r.status} ${await r.text()}`);
    return r.json();
  }

  async function _delete(table, filter) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${BASE}/${table}?${filter}`, { method: 'DELETE', headers: _hdrsUser() });
    if (!r.ok) throw new Error(`DELETE ${table}: ${r.status} ${await r.text()}`);
  }

  async function _patch(table, filter, data) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${BASE}/${table}?${filter}`, {
      method:  'PATCH',
      headers: { ..._hdrsUser(), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(data),
    });
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
    const r = await fetch(`${WORKER}/anims/${path}`, {
      method:  'PUT',
      headers: { ..._hdrsWorker(), 'Content-Type': 'image/png' },
      body:    blob,
    });
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
      await _deleteWithRetry(animUrl, () => fetch(`${STORAGE}/object/anims/${path}`, {
        method: 'DELETE', headers: _hdrsUser(),
      }));
      return;
    }
    const path = animUrl.replace(`${WORKER}/anims/`, '');
    await _deleteWithRetry(animUrl, () => fetch(`${WORKER}/anims/${path}`, {
      method: 'DELETE', headers: _hdrsWorker(),
    }));
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
    const r = await fetch(`${WORKER}/gifs/${path}`, {
      method:  'PUT',
      headers: { ..._hdrsWorker(), 'Content-Type': 'image/gif' },
      body:    blob,
    });
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
      const r = await fetch(`${WORKER}/covers/${path}`, {
        method:  'PUT',
        headers: { ..._hdrsWorker(), 'Content-Type': 'image/jpeg' },
        body:    blob,
      });
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
      await _deleteWithRetry(gifUrl, () => fetch(`${STORAGE}/object/gifs/${path}`, {
        method:  'DELETE',
        headers: _hdrsUser(),
      }));
      return;
    }
    const path = gifUrl.replace(`${WORKER}/gifs/`, '');
    await _deleteWithRetry(gifUrl, () => fetch(`${WORKER}/gifs/${path}`, {
      method:  'DELETE',
      headers: _hdrsWorker(),
    }));
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


  // Sube/actualiza UNA página: fila panels + sus panel_layers/panel_texts.
  // Compartida entre la ruta completa (existingPanelId=null, siempre inserta
  // fila nueva) y la ruta incremental (existingPanelId= la fila que ya existía
  // en esa posición, para actualizarla en el sitio en vez de duplicarla).
  async function _uploadOnePanel(comic, edPages, p, i, existingPanelId) {
    const ins = await _upsert('panels', {
      ...(existingPanelId ? { id: existingPanelId } : {}),
      work_id:     comic.supabaseId,
      panel_order: i,
      orientation: p.orientation || 'v',
      text_mode:   p.textMode    || 'sequential',
      data_url:    p.dataUrl     || null,
    });
    const panelId = ins[0]?.id || existingPanelId;
    if (!panelId) return;

    // Borrar capas y textos anteriores por si el CASCADE no actuó. NO se
    // esperan aquí: se lanzan en paralelo con el procesamiento de las capas
    // (que no depende de ellos — solo lee edPage.layers) y cada uno se espera
    // justo antes de su INSERT correspondiente. Antes eran dos rondas de red
    // secuenciales que bloqueaban el inicio del procesamiento sin necesidad;
    // en una página con capas GIF/APNG (que ya tardan lo suyo en subir su
    // binario), esta espera quedaba completamente escondida detrás de eso.
    const _delLayersP = _delete('panel_layers', `panel_id=eq.${panelId}`);
    const _delTextsP  = _delete('panel_texts',  `panel_id=eq.${panelId}`);

    // Capas del editor: image, draw, stroke, bubble, text, gif — formato edSerLayer
    const edPage = edPages[i];
    if (edPage && edPage.layers && edPage.layers.length > 0) {
      const layerRows = [];
      for (let j = 0; j < edPage.layers.length; j++) {
        const l = edPage.layers[j];
        let gifUrl = null;
        // GIF: subir binario a Storage; layer_data solo guarda metadatos (sin dataUrl)
        if (l.type === 'gif' && l.gifKey) {
          try {
            const dataUrl = await _sbGifIdbLoad(l.gifKey);
            if (dataUrl) gifUrl = await _gifUpload(l.gifKey, dataUrl);
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
          layerRows.push({ panel_id: panelId, layer_order: j, layer_type: l.type, layer_data: _ld, gif_url: null, anim_url: null });
          continue; // siguiente capa
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
            if (_apngDataUrl) animUrl = await _animUpload(_bucketKey, _apngDataUrl);
          } catch(e) { console.warn('APNG upload error:', e.message); }
        }

        // Solo comprimir layers APNG animados (tienen gcpLayersData grandes)
        // El resto: JSON directo como v16.42 — sin riesgo de fallo de descompresión
        // Comprimir cualquier layer cuyo JSON supere el umbral (fill ya comprimido arriba)
        const _lRaw = JSON.stringify(_lClean);
        const _ld = _lRaw.length >= _CZ_MIN ? await _czCompress(_lRaw) : _lRaw;
        layerRows.push({
          panel_id:    panelId,
          layer_order: j,
          layer_type:  l.type,
          layer_data:  _ld,
          gif_url:     gifUrl,
          anim_url:    animUrl,
        });
      } // end for j
      await _delLayersP; // esperar el borrado (lanzado en paralelo arriba) antes de insertar
      if(layerRows.length > 0) await _upsert('panel_layers', layerRows);
    } else {
      await _delLayersP;
    }

    // Textos para el reader (panel_texts sin cambios)
    await _delTextsP; // esperar el borrado (lanzado en paralelo arriba) antes de insertar
    if (!p.texts || p.texts.length === 0) return;
    await _upsert('panel_texts', p.texts.map((t, j) => ({
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
    })));
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

  async function _uploadPanels(comic, dirtyPageIndices) {
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

    // Subir thumbnail de la primera hoja (best-effort, no bloquea el guardado)
    // coverDataUrl (con el texto horneado, ver edRenderPage(page,withText) y
    // edSaveProject en editor.js) si existe — obras guardadas antes de este
    // cambio no lo tienen, panels[0].dataUrl sigue de respaldo.
    const _firstDataUrl = comic.coverDataUrl || panels[0]?.dataUrl || null;
    if (_firstDataUrl) {
      const _coverUrlResult = await _thumbUpload(comic.supabaseId, _firstDataUrl).catch(() => null);
      if (_coverUrlResult) {
        await _patch('works', `id=eq.${comic.supabaseId}`, { cover_url: _coverUrlResult }).catch(() => {});
      }
    }

    // ── ¿Podemos subir SOLO las páginas marcadas sucias? ──────────────────
    // dirtyPageIndices lo calcula edCloudSave a partir de _dirtyCloud por
    // página — viene como array cuando NO ha habido cambios estructurales
    // (añadir/eliminar/reordenar hojas) desde el último guardado en la nube.
    // Aun así, antes de fiarnos, comprobamos que el número de panels ya
    // existentes en Supabase coincide EXACTAMENTE con panels.length — si no
    // coincide (obra nunca subida, o cualquier inconsistencia), caemos a la
    // ruta completa de siempre en vez de arriesgar índices que no signifiquen
    // lo mismo que la última vez.
    let _incrementalOk = Array.isArray(dirtyPageIndices);
    let _panelIdByOrder = null;
    if (_incrementalOk) {
      const _existingPanels = await _get(`panels?work_id=eq.${comic.supabaseId}&select=id,panel_order`) || [];
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

    if (_incrementalOk) {
      // ── RUTA INCREMENTAL: solo tocar páginas realmente sucias ──────────
      if (dirtyPageIndices.length === 0) return; // nada cambió desde el último guardado en la nube
      await _sbPoolMap(dirtyPageIndices, 3, async (i) => {
        const existingId = _panelIdByOrder[i];
        await _cleanupPanelFiles(existingId);
        await _uploadOnePanel(comic, edPages, panels[i], i, existingId);
      });
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
    await _sbPoolMap(panels, 3, (p, i) => _uploadOnePanel(comic, edPages, p, i, null));
  }

  // ── BORRADOR EN NUBE ──────────────────────────────────────
  // Límite razonable: 50MB por obra (data_url de paneles son base64 JPEGs)
  // El campo published=false impide que aparezca en el reader público
  async function saveDraft(comic, dirtyPageIndices) {
    const sid = comic.supabaseId;
    if (!sid) throw new Error('Sin supabaseId para guardar borrador');

    await _upsert('works', {
      id:             sid,
      title:          comic.title      || '',
      author_name:    comic.author     || comic.username || '',
      author_id:      comic.userId     || null,
      genre:          comic.genre      || '',
      nav_mode:       comic.navMode    || 'fixed',
      social:         comic.social     || '',
      panel_count:    comic.panels?.length || 0,
      rules:          JSON.stringify(comic.editorData?._rules || []),
      // Guardar en nube siempre vuelve la obra a borrador.
      // El admin deberá aprobarla de nuevo si se vuelve a publicar.
      published:      false,
      pending_review: false,
      updated_at:     new Date().toISOString(),
    });
    await _uploadPanels(comic, dirtyPageIndices);
    return { sizeKB: 0 }; // tamaño calculado por Supabase al rechazar si excede límite
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
    const works = await _get(`works?id=eq.${supabaseId}&limit=1&select=*`);
    if (!works || !works.length) throw new Error('Obra no encontrada en la nube');
    const work = works[0];
    let _projectRules = [];
    try { _projectRules = work.rules ? JSON.parse(work.rules) : []; } catch(e) { _projectRules = []; }

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
    const _layerRowsByPanel = await _sbPoolMap(panels, 6, panel =>
      _get(`panel_layers?panel_id=eq.${panel.id}&order=layer_order.asc`).catch(() => [])
    );

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

  // opts: { genre, author, limit } — genre/author filtran igual que hacía
  // antes el filtro en memoria de home.js, pero ahora en el propio servidor
  // (necesario para que, con miles de obras, un filtro siga encontrando
  // resultados que no estuvieran en las primeras páginas ya cargadas).
  async function fetchPublishedWorksPage(cursor, opts) {
    let filter = 'published=eq.true';
    if (opts && opts.genre)  filter += `&genre=eq.${encodeURIComponent(opts.genre)}`;
    if (opts && opts.author) filter += `&author_name=eq.${encodeURIComponent(opts.author)}`;
    return _fetchWorksPage(filter, cursor, opts && opts.limit);
  }

  // Universo COMPLETO de géneros/autores publicados, para el menú de
  // Filtros — deliberadamente separada de fetchPublishedWorksPage: el menú
  // de filtros tiene que poder ofrecer un género/autor aunque sus obras
  // aún no se hayan cargado en pantalla (solo las primeras páginas están
  // cargadas en un momento dado). Trae solo genre/author_name (sin
  // miniaturas ni el resto de columnas) para que sea ligera incluso con
  // miles de filas — es la misma idea que las apps grandes llaman
  // "facets"/"filtros disponibles", resuelta aparte del listado principal.
  async function fetchPublishedFacets() {
    const rows = await _get(`works?published=eq.true&select=genre,author_name`);
    return (rows || []).map(r => ({ genre: r.genre || '', username: r.author_name || '' }));
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
        rows.push({
          id:          entry.id,
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
    // (merge-duplicates no borra los items que ya no existen en local)
    if (window._authTryRefresh) await window._authTryRefresh();
    // Borrar items de esta obra (con prefijo workId::) Y items sin prefijo del autor
    // (items legacy sin workId que serán reinsertados con el prefijo correcto)
    if (workId) {
      // Borrar con prefijo
      await fetch(`${BASE}/biblioteca?author_id=eq.${authorId}&folder_id=like.${workId}::*`, {
        method: 'DELETE', headers: _hdrsUser(),
      }).catch(()=>{});
      // Borrar sin prefijo (legacy — no contienen '::')
      // PostgREST no soporta NOT LIKE directamente en todos los contextos,
      // así que borramos los que tienen folder_id exactamente '__root__' o '__anim__'
      // que son los únicos folder_id posibles sin prefijo
      await fetch(`${BASE}/biblioteca?author_id=eq.${authorId}&folder_id=in.(__root__,__anim__)`, {
        method: 'DELETE', headers: _hdrsUser(),
      }).catch(()=>{});
    } else {
      await fetch(`${BASE}/biblioteca?author_id=eq.${authorId}`, {
        method: 'DELETE', headers: _hdrsUser(),
      }).catch(()=>{});
    }

    if (!rows.length) return;
    const r = await fetch(`${BASE}/biblioteca`, {
      method:  'POST',
      headers: { ..._hdrsUser(), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(`bibSync: ${r.status} ${await r.text()}`);
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
        folderMap.get(fid).items.push({
          id:             r.id,
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
        const _item = {
          id:            r.id,
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

    return { saveDraft, submitForReview, submitForReviewOnly, approveWork, unpublishWork, deleteWork, deleteAuthorData, downloadDraftAsEditorData, fetchPendingWorks, fetchPublishedWorks, fetchPublishedWorksPage, fetchPublishedFacets, fetchWorksByIds, fetchWorksByAuthor, bibSync, bibDownload, fetchAllUsers, setUserRole };
})();
