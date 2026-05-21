/* ============================================================
   storage.js  v5.0
   Índice ligero en localStorage + editorData en OPFS.
   Sin cambios en la API síncrona existente — solo se añade
   getByIdFull() async para leer editorData completo.
   PC: primera vez pide carpeta visible (File System Access API).
   Android: OPFS silencioso, sin petición de permisos.
   ============================================================ */

const ComicStore = (() => {
  const KEY  = 'cs_comics';
  const CH   = 'cx_comics_change';

  /* ── Canal de difusión entre pestañas / vistas ── */
  let _bc = null;
  try { _bc = new BroadcastChannel(CH); } catch(e) {}

  function _emit(type, id) {
    window.dispatchEvent(new CustomEvent('cx:store', { detail: { type, id } }));
    try { _bc && _bc.postMessage({ type, id }); } catch(e) {}
  }

  if (_bc) {
    _bc.onmessage = (e) => {
      window.dispatchEvent(new CustomEvent('cx:store', { detail: e.data }));
    };
  }

  /* ── Índice en localStorage (solo metadatos, sin editorData) ── */
  function _stripHeavy(comic) {
    // Eliminar campos grandes antes de guardar en localStorage
    const c = { ...comic };
    delete c.editorData;
    // panels: conservar solo metadatos, eliminar dataUrl grande
    if (c.panels && c.panels.length) {
      c.panels = c.panels.map((p, i) => {
        if (i === 0 && p.dataUrl) {
          // Primer panel: guardar aparte en OPFS, aquí solo flag
          return { ...p, _hasDataUrl: true, dataUrl: null };
        }
        return { ...p, dataUrl: null };
      });
    }
    return c;
  }

  function getAll() {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  }

  function saveAll(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch(e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        window.dispatchEvent(new CustomEvent('cx:storage:quota', { detail: { size: JSON.stringify(list).length } }));
        console.error('[ComicStore] localStorage lleno:', e);
      } else { throw e; }
    }
  }

  function getById(id) {
    return getAll().find(c => c.id === id) || null;
  }

  // save() devuelve Promise — permite await cuando se necesita garantizar OPFS escrito
  function save(comic) {
    const list = getAll();
    const idx  = list.findIndex(c => c.id === comic.id);
    const light = _stripHeavy(comic);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...light, updatedAt: new Date().toISOString() };
    } else {
      list.push({ ...light, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    saveAll(list);
    _emit('save', comic.id);

    // Guardar editorData en OPFS — devolver Promise para que el llamador pueda hacer await
    const _opfsPromise = (comic.editorData || (comic.panels && comic.panels[0] && comic.panels[0].dataUrl))
      ? _opfsWrite(comic.id, comic).catch(e => console.warn('[ComicStore] OPFS write:', e))
      : Promise.resolve();

    // Backup en carpeta visible PC (async, no bloquea)
    _fsWrite(comic.id, comic).catch(() => {});

    return _opfsPromise.then(() => comic);
  }

  function remove(id) {
    saveAll(getAll().filter(c => c.id !== id));
    _opfsDelete(id).catch(() => {});
    _purgeLocalData(id);
    _emit('remove', id);
  }

  // Borra todos los datos locales asociados a una obra:
  // biblioteca IDB, autosave IDB, frames de animación IDB y localStorage.
  function _purgeLocalData(id) {
    if (!id) return;
    // Obtener userId para construir las claves con prefijo correcto
    const _uid = (() => {
      try {
        const s = JSON.parse(localStorage.getItem('cs_session') || 'null');
        return (s && s.id) ? String(s.id).replace(/[^a-zA-Z0-9_-]/g, '_') : '_anon_';
      } catch(_) { return '_anon_'; }
    })();

    // 1. localStorage: biblioteca y cualquier clave con el id
    const _bibKey = 'cs_biblioteca_' + id;
    localStorage.removeItem(_bibKey);

    // 2. IDB biblioteca (cxBiblioteca): clave = cs_biblioteca_{comicId}
    try {
      const _r = indexedDB.open('cxBiblioteca', 1);
      _r.onsuccess = e => {
        try {
          const db = e.target.result;
          if (db.objectStoreNames.contains('bib')) {
            db.transaction('bib', 'readwrite').objectStore('bib').delete(_bibKey);
          }
        } catch(_) {}
      };
    } catch(_) {}

    // 3. IDB autosave (cxAutosave): clave = {userId}_{comicId}
    const _autosaveKey = _uid + '_' + id;
    try {
      const _r2 = indexedDB.open('cxAutosave', 1);
      _r2.onsuccess = e => {
        try {
          const db = e.target.result;
          if (db.objectStoreNames.contains('saves')) {
            const tx = db.transaction('saves', 'readwrite');
            tx.objectStore('saves').delete(_autosaveKey);
            // Compatibilidad: borrar también clave sin prefijo (versiones anteriores)
            tx.objectStore('saves').delete(id);
          }
        } catch(_) {}
      };
    } catch(_) {}

    // 4. IDB frames de animación (cxAnims): clave = {userId}__{comicId}_{pi}_{li}
    // Borrar todas las entradas que contengan el comicId en la clave
    const _animPrefix1 = _uid + '__' + id + '_'; // nuevo formato
    const _animPrefix2 = id + '_';                // formato antiguo (compatibilidad)
    try {
      const _r3 = indexedDB.open('cxAnims', 1);
      _r3.onsuccess = e => {
        try {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('anims')) return;
          const tx  = db.transaction('anims', 'readwrite');
          const st  = tx.objectStore('anims');
          const req = st.openCursor();
          req.onsuccess = ev => {
            const cursor = ev.target.result;
            if (!cursor) return;
            const k = String(cursor.key);
            if (k.startsWith(_animPrefix1) || k.startsWith(_animPrefix2)) cursor.delete();
            cursor.continue();
          };
        } catch(_) {}
      };
    } catch(_) {}
  }

  /* ── getByIdFull: async — devuelve comic completo con editorData ── */
  async function getByIdFull(id) {
    const meta = getById(id);
    if (!meta) return null;
    // Seguridad: verificar que la obra pertenece al usuario actual
    const _sess = (() => { try { return JSON.parse(localStorage.getItem('cs_session') || 'null'); } catch(_) { return null; } })();
    if (_sess && _sess.id && meta.userId && meta.userId !== '_anon_' && meta.userId !== _sess.id && meta.username !== _sess.username) {
      console.warn('[ComicStore] Acceso denegado: obra pertenece a otro autor.');
      return null;
    }
    try {
      const full = await _opfsRead(id);
      if (full) return { ...meta, ...full };
    } catch(e) {}
    return meta;
  }

  function createNew(userId, username) {
    return {
      id:        'comic_' + Date.now(),
      userId,
      username,
      title:     '',
      desc:      '',
      panels:    [],
      published: false
    };
  }

  function getByUser(userId)  { return getAll().filter(c => c.userId === userId); }
  function getPublished()     { return getAll().filter(c => c.published); }

  /* ══════════════════════════════════════════════════════════════
     OPFS — Origin Private File System
     Soportado: Chrome 86+, Android Chrome 109+, Firefox 111+
     Sin permisos de usuario, privado, persistente
  ══════════════════════════════════════════════════════════════ */
  async function _opfsRoot() {
    if (!navigator.storage || !navigator.storage.getDirectory) return null;
    try {
      const root  = await navigator.storage.getDirectory();
      const base  = await root.getDirectoryHandle('comixou', { create: true });
      // Aislar por userId — cada autor tiene su propia subcarpeta en OPFS
      const _uid  = (() => {
        try {
          const s = JSON.parse(localStorage.getItem('cs_session') || 'null');
          return (s && s.id) ? String(s.id).replace(/[^a-zA-Z0-9_-]/g, '_') : '_anon_';
        } catch(_) { return '_anon_'; }
      })();
      return await base.getDirectoryHandle(_uid, { create: true });
    } catch(e) { return null; }
  }

  async function _opfsWrite(id, comic) {
    const dir = await _opfsRoot();
    if (!dir) return false;
    try {
      // Guardar solo los datos pesados
      const payload = {
        editorData: comic.editorData || null,
        panels:     comic.panels     || [],
      };
      const fh = await dir.getFileHandle(id + '.json', { create: true });
      const ws = await fh.createWritable();
      await ws.write(JSON.stringify(payload));
      await ws.close();
      return true;
    } catch(e) { console.warn('[OPFS] write error:', e); return false; }
  }

  async function _opfsRead(id) {
    const dir = await _opfsRoot();
    if (!dir) return null;
    try {
      const fh   = await dir.getFileHandle(id + '.json');
      const file = await fh.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch(e) { return null; }
  }

  async function _opfsDelete(id) {
    const dir = await _opfsRoot();
    if (!dir) return;
    try { await dir.removeEntry(id + '.json'); } catch(e) {}
  }

  /* ══════════════════════════════════════════════════════════════
     File System Access API — carpeta visible en PC
     Solo Chrome/Edge con esta API. Android: OPFS ya cubre.
     Primera vez: pide al usuario dónde guardar la carpeta ComiXou.
     Luego: guarda silenciosamente.
  ══════════════════════════════════════════════════════════════ */
  const _FS_SUPPORTED = 'showDirectoryPicker' in window;
  let _fsDirHandle = null;

  async function _fsAskDir() {
    if (!_FS_SUPPORTED) return;
    // Restaurar handle guardado
    if (!_fsDirHandle) {
      try {
        const stored = localStorage.getItem('cx_fs_dir');
        if (stored) {
          // No podemos restaurar FileSystemDirectoryHandle desde JSON — pedir de nuevo si es necesario
        }
      } catch(e) {}
    }
    // Solo pedir la primera vez en sesión
    if (_fsDirHandle) return;
    const asked = localStorage.getItem('cx_fs_asked');
    if (asked === 'no') return; // usuario rechazó
    // Solo preguntar en PC (no mobile)
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) return;
    if (asked === 'yes') {
      // Ya preguntamos antes — no preguntar de nuevo (handle no persiste entre sesiones)
      return;
    }
    // Primera vez: preguntar
    try {
      _fsDirHandle = await window.showDirectoryPicker({
        id: 'comixou',
        mode: 'readwrite',
        startIn: 'documents',
      });
      localStorage.setItem('cx_fs_asked', 'yes');
      // Crear subcarpeta ComiXou
      _fsDirHandle = await _fsDirHandle.getDirectoryHandle('ComiXou', { create: true });
    } catch(e) {
      // Usuario canceló
      localStorage.setItem('cx_fs_asked', 'no');
      _fsDirHandle = null;
    }
  }

  async function _fsWrite(id, comic) {
    if (!_FS_SUPPORTED) return;
    await _fsAskDir();
    if (!_fsDirHandle) return;
    try {
      const payload = {
        editorData: comic.editorData || null,
        panels:     comic.panels     || [],
        meta:       _stripHeavy(comic),
      };
      const fh = await _fsDirHandle.getFileHandle(id + '.json', { create: true });
      const ws = await fh.createWritable();
      await ws.write(JSON.stringify(payload));
      await ws.close();
    } catch(e) { console.warn('[FS] write error:', e); }
  }

  return {
    getAll,
    getById,
    getByIdFull,
    save,
    remove,
    createNew,
    getByUser,
    getPublished,
  };
})();
