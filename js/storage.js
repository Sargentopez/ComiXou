/* ============================================================
   storage.js  v5.0
   Persistencia híbrida: OPFS (editorData pesado) + localStorage (índice ligero)
   API pública idéntica a v4.x — el resto del código no cambia.

   ARQUITECTURA:
   - localStorage['cs_comics']  → índice ligero: metadatos sin editorData ni panels pesados
   - OPFS /comics/<id>.json     → datos completos de cada obra (editorData, panels)
   - En PC con File System Access API: backup opcional en directorio visible del usuario

   NUBE: supabase-client.js opera sobre el objeto comic completo pasado por parámetro,
   nunca sobre localStorage directamente → no se ve afectado por este cambio.
   ============================================================ */

const ComicStore = (() => {
  const KEY  = 'cs_comics';
  const CH   = 'cx_comics_change';
  const OPFS_DIR = 'comics';
  const FS_HANDLE_KEY = 'cx_fs_dir_handle'; // IDB key para el handle del directorio PC

  /* ── Canal de difusión entre pestañas ── */
  let _bc = null;
  try { _bc = new BroadcastChannel(CH); } catch(e) {}
  function _emit(type, id) {
    window.dispatchEvent(new CustomEvent('cx:store', { detail: { type, id } }));
    try { _bc && _bc.postMessage({ type, id }); } catch(e) {}
  }
  if (_bc) { _bc.onmessage = e => window.dispatchEvent(new CustomEvent('cx:store', { detail: e.data })); }

  /* ══════════════════════════════════════════════════════════
     OPFS — datos completos de obra
     ══════════════════════════════════════════════════════════ */
  let _opfsRoot = null;
  async function _opfsDir() {
    if (_opfsRoot) return _opfsRoot;
    try {
      const root = await navigator.storage.getDirectory();
      _opfsRoot = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    } catch(e) { _opfsRoot = null; }
    return _opfsRoot;
  }

  async function _opfsWrite(id, data) {
    const dir = await _opfsDir();
    if (!dir) return false;
    try {
      const fh = await dir.getFileHandle(id + '.json', { create: true });
      const w  = await fh.createWritable();
      await w.write(JSON.stringify(data));
      await w.close();
      return true;
    } catch(e) { console.warn('[ComicStore] OPFS write error:', e); return false; }
  }

  async function _opfsRead(id) {
    const dir = await _opfsDir();
    if (!dir) return null;
    try {
      const fh   = await dir.getFileHandle(id + '.json');
      const file = await fh.getFile();
      return JSON.parse(await file.text());
    } catch(e) { return null; }
  }

  async function _opfsDelete(id) {
    const dir = await _opfsDir();
    if (!dir) return;
    try { await dir.removeEntry(id + '.json'); } catch(e) {}
  }

  /* ══════════════════════════════════════════════════════════
     PC FILE SYSTEM — backup en directorio visible (solo PC)
     ══════════════════════════════════════════════════════════ */
  const _FS_SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  let   _fsDirHandle  = null; // handle al directorio ComiXou elegido por el usuario
  let   _fsAsked      = false;

  // Persistir/recuperar el handle del directorio en IDB
  async function _fsSaveHandle(handle) {
    try {
      const db = await _idbOpen('cx_fs_handles', 1, db => db.createObjectStore('handles'));
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, FS_HANDLE_KEY);
      await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
    } catch(e) {}
  }

  async function _fsLoadHandle() {
    try {
      const db = await _idbOpen('cx_fs_handles', 1, db => db.createObjectStore('handles'));
      return await new Promise((res, rej) => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get(FS_HANDLE_KEY);
        req.onsuccess = () => res(req.result || null);
        req.onerror   = () => res(null);
      });
    } catch(e) { return null; }
  }

  function _idbOpen(name, version, onupgrade) {
    return new Promise((res, rej) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = e => onupgrade(e.target.result);
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  // Verificar permiso del handle guardado
  async function _fsVerifyHandle(handle) {
    if (!handle) return false;
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return true;
      const req = await handle.requestPermission({ mode: 'readwrite' });
      return req === 'granted';
    } catch(e) { return false; }
  }

  // Inicializar: recuperar handle guardado si existe
  async function _fsInit() {
    if (!_FS_SUPPORTED) return;
    const saved = await _fsLoadHandle();
    if (saved && await _fsVerifyHandle(saved)) {
      _fsDirHandle = saved;
    }
  }
  _fsInit();

  // Preguntar al usuario si quiere guardar en directorio visible (solo la primera vez en PC)
  async function _fsAskDir() {
    if (!_FS_SUPPORTED || _fsDirHandle || _fsAsked) return;
    _fsAsked = true;
    // Pequeño delay para no interrumpir el flujo de guardado
    await new Promise(r => setTimeout(r, 800));
    const ok = confirm(
      'ComiXou puede guardar tus obras en una carpeta de tu equipo (además del almacenamiento interno).\n\n' +
      '¿Quieres elegir o crear una carpeta "ComiXou" en tu equipo para hacer copias de seguridad automáticas?'
    );
    if (!ok) { _fsAsked = true; return; }
    try {
      const handle = await window.showDirectoryPicker({
        id: 'comixou-works',
        mode: 'readwrite',
        startIn: 'documents',
      });
      // Intentar crear/usar subcarpeta ComiXou
      let comixouDir;
      try { comixouDir = await handle.getDirectoryHandle('ComiXou', { create: true }); }
      catch(e) { comixouDir = handle; }
      _fsDirHandle = comixouDir;
      await _fsSaveHandle(comixouDir);
    } catch(e) { /* usuario canceló */ }
  }

  // Escribir backup en directorio visible del PC
  async function _fsWrite(id, title, data) {
    if (!_fsDirHandle) return;
    try {
      const perm = await _fsDirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const req = await _fsDirHandle.requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') return;
      }
      // Nombre de archivo: título sanitizado + id corto
      const safeName = (title || 'sin_titulo').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\-_]/g, '').trim().slice(0, 40);
      const shortId  = id.replace('comic_', '').slice(-6);
      const fname    = `${safeName}_${shortId}.json`;
      const fh = await _fsDirHandle.getFileHandle(fname, { create: true });
      const w  = await fh.createWritable();
      await w.write(JSON.stringify(data, null, 2));
      await w.close();
    } catch(e) { console.warn('[ComicStore] FS backup error:', e); }
  }

  /* ══════════════════════════════════════════════════════════
     ÍNDICE LIGERO — localStorage (solo metadatos, sin datos pesados)
     ══════════════════════════════════════════════════════════ */
  // Campos que van al índice ligero (no incluyen editorData ni panels con dataUrl)
  const INDEX_FIELDS = [
    'id','userId','username','anonymous','title','author','genre','social','navMode',
    'published','approved','pendingReview','supabaseId','cloudOnly','cloudNewer',
    'createdAt','updatedAt','localSavedAt','cameraState',
  ];

  function _toIndex(comic) {
    const idx = {};
    INDEX_FIELDS.forEach(k => { if (comic[k] !== undefined) idx[k] = comic[k]; });
    // Guardar solo panel 0 dataUrl (miniatura) — sin editorData ni panels pesados
    if (comic.panels && comic.panels[0]) {
      idx._thumb = comic.panels[0].dataUrl || null;
    }
    return idx;
  }

  function _indexGetAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch(e) { return []; }
  }

  function _indexSave(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch(e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        window.dispatchEvent(new CustomEvent('cx:storage:quota', { detail: { size: JSON.stringify(list).length } }));
        console.error('[ComicStore] localStorage lleno — índice no guardado:', e);
      } else { throw e; }
    }
  }

  /* ══════════════════════════════════════════════════════════
     API PÚBLICA — misma interfaz que v4.x
     ══════════════════════════════════════════════════════════ */

  // getAll: devuelve el índice ligero (sin editorData)
  // Nota: editorData NO está aquí — usar getById() para obtenerlo
  function getAll() { return _indexGetAll(); }

  // getById: lee OPFS primero, luego índice (para obtener editorData)
  // Es async internamente pero devuelve una Promise transparente
  // COMPATIBILIDAD: el código existente usa getById() de forma síncrona para metadatos.
  // Usamos un cache en memoria para servir síncronamente tras la primera carga.
  const _cache = new Map(); // id → comic completo

  function getById(id) {
    if (!id) return null;
    // Servir desde cache si disponible (cargado previamente)
    if (_cache.has(id)) return _cache.get(id);
    // Construir desde índice (sin editorData) — editorData se carga async
    const idx = _indexGetAll().find(c => c.id === id);
    if (!idx) return null;
    // Reconstruir panels[0] desde _thumb
    const comic = { ...idx, panels: idx._thumb ? [{ dataUrl: idx._thumb }] : [], editorData: null };
    delete comic._thumb;
    return comic;
  }

  // Versión async que garantiza editorData completo
  async function getByIdFull(id) {
    if (!id) return null;
    if (_cache.has(id)) return _cache.get(id);
    const idx = _indexGetAll().find(c => c.id === id);
    if (!idx) return null;
    const opfs = await _opfsRead(id);
    const comic = opfs ? { ...idx, ...opfs } : { ...idx, panels: idx._thumb ? [{ dataUrl: idx._thumb }] : [], editorData: null };
    delete comic._thumb;
    _cache.set(id, comic);
    return comic;
  }

  function save(comic) {
    if (!comic || !comic.id) return Promise.resolve(comic);

    // 1. Actualizar timestamps
    const now = new Date().toISOString();
    const list = _indexGetAll();
    const idx  = list.findIndex(c => c.id === comic.id);
    const full = { ...comic, updatedAt: now };
    if (idx < 0) full.createdAt = full.createdAt || now;

    // 2. Limpiar dataUrl de panels[1..n] (solo panel 0 como miniatura)
    if (full.panels && full.panels.length > 1) {
      full.panels = full.panels.map((p, i) => i === 0 ? p : { ...p, dataUrl: null });
    }

    // 3. Actualizar cache en memoria
    // Preservar editorData del cache si el nuevo objeto no lo trae (viene del índice)
    // para que getByIdFull no pierda los datos que ya cargó de OPFS
    const _existing_cache = _cache.get(comic.id);
    if (_existing_cache && _existing_cache.editorData && !full.editorData) {
      full.editorData = _existing_cache.editorData;
    }
    _cache.set(comic.id, full);

    // 4. Guardar índice ligero en localStorage
    const entry = _toIndex(full);
    if (idx >= 0) { list[idx] = { ...list[idx], ...entry }; }
    else          { list.push(entry); }
    _indexSave(list);

    // 5. Guardar datos completos en OPFS — retornar promesa para que el llamador pueda await
    const _opfsPromise = _opfsWrite(comic.id, full).then(ok => {
      if (!ok) console.warn('[ComicStore] OPFS no disponible, obra guardada solo en índice');
      return comic;
    });

    // 6. Backup en directorio visible PC (async, no bloquea, primer uso pregunta)
    if (_FS_SUPPORTED) {
      Promise.resolve().then(async () => {
        await _fsAskDir();
        if (_fsDirHandle) await _fsWrite(comic.id, comic.title, full);
      });
    }

    _emit('save', comic.id);
    return _opfsPromise; // Promise que resuelve cuando OPFS termina
  }

  function remove(id) {
    const list = _indexGetAll().filter(c => c.id !== id);
    _indexSave(list);
    _cache.delete(id);
    _opfsDelete(id); // async, no bloquea

    // Borrar biblioteca del proyecto de localStorage
    try { localStorage.removeItem('cs_biblioteca_' + id); } catch(e) {}

    // Borrar entradas de animaciones en IDB cxAnims con prefijo del proyecto
    _idbDeleteProjectAnims(id);

    _emit('remove', id);
  }

  // Borrar todas las entradas IDB de animaciones del proyecto
  function _idbDeleteProjectAnims(id) {
    try {
      const req = indexedDB.open('cxAnims', 1);
      req.onsuccess = e => {
        try {
          const db = e.target.result;
          const tx = db.transaction('anims', 'readwrite');
          const store = tx.objectStore('anims');
          const rk = store.getAllKeys();
          rk.onsuccess = () => {
            const keys = rk.result || [];
            keys.forEach(k => {
              // Borrar claves con prefijo del proyecto: <id>_pi_li
              if (typeof k === 'string' && k.startsWith(id + '_')) {
                store.delete(k);
              }
            });
          };
        } catch(e) {}
      };
    } catch(e) {}
  }

  function createNew(userId, username) {
    return {
      id:        'comic_' + Date.now(),
      userId, username,
      title: '', desc: '', panels: [],
      published: false,
    };
  }

  function getByUser(userId)  { return getAll().filter(c => c.userId === userId); }
  function getPublished()     { return getAll().filter(c => c.published); }

  // Migración: mover obras de localStorage a OPFS en segundo plano
  async function _migrate() {
    const list = _indexGetAll();
    let migrated = 0;
    for (const entry of list) {
      if (!entry.id) continue;
      // Si ya está en OPFS, saltar
      const existing = await _opfsRead(entry.id);
      if (existing && existing.editorData) continue;
      // Intentar leer datos completos del localStorage antiguo
      try {
        const oldKey = 'cs_comic_' + entry.id;
        const oldData = localStorage.getItem(oldKey);
        if (oldData) {
          const parsed = JSON.parse(oldData);
          await _opfsWrite(entry.id, parsed);
          localStorage.removeItem(oldKey);
          migrated++;
        }
      } catch(e) {}
    }
    if (migrated > 0) console.log('[ComicStore] Migradas', migrated, 'obras a OPFS');
  }

  // Iniciar migración en segundo plano sin bloquear
  setTimeout(() => _migrate().catch(() => {}), 3000);

  // Precargar editorData de obras recientes en cache (acelera apertura del editor)
  async function _warmCache() {
    const list = _indexGetAll();
    // Solo precargar las 3 obras más recientes
    const recent = list
      .filter(c => !c.cloudOnly)
      .sort((a, b) => new Date(b.updatedAt||0) - new Date(a.updatedAt||0))
      .slice(0, 3);
    for (const entry of recent) {
      if (!_cache.has(entry.id)) {
        const opfs = await _opfsRead(entry.id);
        if (opfs) _cache.set(entry.id, { ...entry, ...opfs });
      }
    }
  }
  setTimeout(() => _warmCache().catch(() => {}), 1500);

  return { getAll, getById, getByIdFull, save, remove, createNew, getByUser, getPublished };
})();
