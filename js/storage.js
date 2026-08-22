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
   storage.js  v5.0
   Índice ligero en localStorage + editorData en OPFS.
   Sin cambios en la API síncrona existente — solo se añade
   getByIdFull() async para leer editorData completo.
   PC: primera vez pide carpeta visible (File System Access API).
   Android: OPFS silencioso, sin petición de permisos.
   ============================================================ */

const WorkStore = (() => {
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
    // coverDataUrl: misma imagen pesada (JPEG en base64) que panels[0].dataUrl,
    // solo que con el texto horneado — se guarda aparte en OPFS (ver
    // _opfsWrite), no aquí. Sin este recorte, el índice de localStorage
    // (un único JSON con TODAS las obras) puede superar la cuota y el
    // guardado del índice entero falla en silencio (saveAll solo hace
    // console.error, no lanza) — la miniatura se ve en blanco porque los
    // metadatos nunca llegaron a escribirse de verdad.
    if (c.coverDataUrl) c._hasCoverDataUrl = true;
    delete c.coverDataUrl;
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
        console.error('[WorkStore] localStorage lleno:', e);
      } else { throw e; }
    }
  }

  function getById(id) {
    return getAll().find(c => c.id === id) || null;
  }

  // Pide al navegador que el almacenamiento de este sitio sea "persistente"
  // (no elegible para borrado automático bajo presión de espacio) — reduce
  // el riesgo de que el navegador borre IndexedDB/OPFS/localStorage sin que
  // el autor haya hecho nada. Se pide UNA sola vez por navegador (no en
  // cada guardado) y en el momento de guardar datos reales — nunca al
  // arrancar la app — porque en Firefox esta llamada puede mostrar un
  // permiso emergente al autor, y pedirlo sin contexto (nada más abrir la
  // app) resultaría confuso y con más probabilidad de ser rechazado.
  // En Chrome/Edge nunca muestra ningún emergente (lo decide solo, según
  // uso de la app) — pedirlo aquí no tiene coste en esos navegadores.
  let _persistAsked = false;
  function _requestPersistentStorageOnce() {
    if (_persistAsked) return;
    if (localStorage.getItem('cx_persist_asked') === '1') { _persistAsked = true; return; }
    _persistAsked = true;
    try {
      if (navigator.storage && navigator.storage.persist && navigator.storage.persisted) {
        navigator.storage.persisted().then(already => {
          if (already) { localStorage.setItem('cx_persist_asked', '1'); return; }
          navigator.storage.persist().finally(() => {
            try { localStorage.setItem('cx_persist_asked', '1'); } catch(_e) {}
          });
        }).catch(() => {});
      }
    } catch(_e) {}
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
    _requestPersistentStorageOnce();

    // Guardar editorData en OPFS — devolver Promise para que el llamador pueda hacer await
    const _opfsPromise = (comic.editorData || (comic.panels && comic.panels[0] && comic.panels[0].dataUrl))
      ? _opfsWrite(comic.id, comic).catch(e => console.warn('[WorkStore] OPFS write:', e))
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
    // Usar el singleton _bibDb del editor si está disponible para evitar conflictos
    try {
      const _delFromBibDb = db => {
        if (db && db.objectStoreNames.contains('bib')) {
          try { db.transaction('bib', 'readwrite').objectStore('bib').delete(_bibKey); } catch(_) {}
        }
      };
      if (window._bibDb) {
        _delFromBibDb(window._bibDb);
      } else {
        const _r = indexedDB.open('cxBiblioteca', 1);
        _r.onsuccess = e => _delFromBibDb(e.target.result);
      }
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
      console.warn('[WorkStore] Acceso denegado: obra pertenece a otro autor.');
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
  // _forcedUid: opcional — permite pedir la subcarpeta de un usuario concreto
  // en vez de la del usuario de la sesión actual. Lo usa migrateAnonToUser
  // (ver más abajo) para leer explícitamente la carpeta '_anon_' y escribir
  // en la del usuario recién autenticado dentro de la MISMA operación, sin
  // depender de qué sesión esté activa en ese instante.
  async function _opfsRoot(_forcedUid) {
    if (!navigator.storage || !navigator.storage.getDirectory) return null;
    try {
      const root  = await navigator.storage.getDirectory();
      const base  = await root.getDirectoryHandle('comixou', { create: true });
      // Aislar por userId — cada autor tiene su propia subcarpeta en OPFS
      const _uid  = _forcedUid || (() => {
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
        editorData:   comic.editorData   || null,
        panels:       comic.panels       || [],
        coverDataUrl: comic.coverDataUrl || null,
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

  // Mueve a la carpeta OPFS del usuario ya autenticado el archivo pesado
  // (editorData/panels/coverDataUrl) de una obra creada como invitado.
  //
  // BUG CORREGIDO (v38.30 — Alberto: "creo un objeto siendo anónimo, guardo
  // en la nube, me pide iniciar sesión, inicio sesión, la obra aparece en
  // Mis obras pero SIN el objeto"). _claimGuestWorks (auth.js) reasignaba
  // userId/username/anonymous en cs_comics (el índice ligero) pero nunca
  // tocaba el archivo pesado real, que _opfsWrite había guardado en
  // comixou/_anon_/{id}.json mientras no había sesión. Al reabrir la obra
  // ya autenticado, _opfsRead miraba en comixou/{nuevoId}/ (la carpeta del
  // usuario real) y no encontraba nada — la obra cargaba solo con los
  // metadatos, sin ninguna capa. Este método copia ese archivo a la carpeta
  // del nuevo usuario y borra la copia de invitado ya migrada.
  //
  // No hace falta migrar aparte las claves de IndexedDB (cxAnims, frames de
  // animación): _pngFramesKey/animKey se guardan como string LITERAL dentro
  // de cada capa serializada (fijado en el momento de crear el objeto) y se
  // leen tal cual al recargar — no se reconstruyen a partir del uid de la
  // sesión activa — así que siguen resolviendo bien aunque el prefijo de esa
  // clave concreta sea '_anon_'. cxAutosave tampoco necesita migrarse: un
  // guardado local completo con éxito ya borra su propio autosave (ver
  // _edAutosaveClear en editor.js), así que no queda nada pendiente ahí.
  async function migrateAnonToUser(id, newUid) {
    if (!id || !newUid || newUid === '_anon_') return false;
    try {
      const anonDir = await _opfsRoot('_anon_');
      if (!anonDir) return false;
      let text;
      try {
        const fh   = await anonDir.getFileHandle(id + '.json');
        const file = await fh.getFile();
        text = await file.text();
      } catch(_) {
        return false; // no había datos locales de esta obra en modo invitado
      }
      const destDir = await _opfsRoot(newUid);
      if (!destDir) return false;
      const destFh = await destDir.getFileHandle(id + '.json', { create: true });
      const ws = await destFh.createWritable();
      await ws.write(text);
      await ws.close();
      // Limpieza: quitar la copia de invitado ya migrada (evita dejar datos
      // huérfanos en '_anon_' que no se borrarían nunca — _purgeLocalData
      // ya no encontraría esta obra ahí una vez reclamada por el usuario).
      try { await anonDir.removeEntry(id + '.json'); } catch(_) {}
      return true;
    } catch(e) {
      console.warn('[WorkStore] migrateAnonToUser:', e);
      return false;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     File System Access API — carpeta visible en PC
     Solo Chrome/Edge con esta API. Android: OPFS ya cubre.
     Primera vez: pide al usuario dónde guardar la carpeta ComiXou.
     Luego: el handle se persiste en IndexedDB (cxFsHandle) y se
     reutiliza siempre, sin volver a preguntar — ver _fsAskDir.
  ══════════════════════════════════════════════════════════════ */
  const _FS_SUPPORTED = 'showDirectoryPicker' in window;
  let _fsDirHandle = null;
  let _fsIdbDb = null;

  // FileSystemDirectoryHandle es clonable por structured clone → se puede
  // guardar en IndexedDB tal cual (no en localStorage, que solo admite JSON).
  // Mismo patrón que _edAnimIdbOpen/_edAnimIdbLoad/_edAnimIdbSave (editor.js).
  function _fsIdbOpen() {
    if (_fsIdbDb) {
      if (_fsIdbDb.objectStoreNames.contains('handles')) return Promise.resolve(_fsIdbDb);
      try { _fsIdbDb.close(); } catch(_) {}
      _fsIdbDb = null;
    }
    return new Promise((res, rej) => {
      const req = indexedDB.open('cxFsHandle', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
      req.onsuccess = e => {
        _fsIdbDb = e.target.result;
        _fsIdbDb.onversionchange = () => { _fsIdbDb.close(); _fsIdbDb = null; };
        _fsIdbDb.onclose        = () => { _fsIdbDb = null; };
        res(_fsIdbDb);
      };
      req.onerror = () => rej(req.error);
    });
  }
  function _fsIdbLoadHandle() {
    return _fsIdbOpen().then(db => new Promise(res => {
      const r = db.transaction('handles').objectStore('handles').get('comixou');
      r.onsuccess = e => res(e.target.result || null);
      r.onerror   = () => res(null);
    })).catch(() => null);
  }
  function _fsIdbSaveHandle(handle) {
    return _fsIdbOpen().then(db => new Promise(res => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'comixou');
      tx.oncomplete = () => res();
      tx.onerror    = () => res();
    })).catch(() => {});
  }

  async function _fsAskDir() {
    if (!_FS_SUPPORTED) return;
    if (_fsDirHandle) return;
    // Solo preguntar/usar en PC (no mobile)
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) return;

    // BUG CORREGIDO (v38.14 — Alberto: "arregla el punto uno para que
    // siempre se use esa carpeta"). Antes, tras el primer permiso concedido,
    // solo se guardaba en localStorage que "ya se había preguntado" — el
    // propio FileSystemDirectoryHandle (el que de verdad apunta a la
    // carpeta) nunca se guardaba en ningún sitio, así que en cada sesión
    // nueva _fsDirHandle volvía a null y, como ya constaba "preguntado",
    // jamás se volvía a pedir ni a escribir nada: la copia de seguridad
    // visible funcionaba exactamente una vez, para siempre. Arreglo: el
    // handle SÍ es serializable en IndexedDB (structured clone) — se
    // guarda ahí la primera vez y se restaura siempre, reconfirmando el
    // permiso con query/requestPermission (sin volver a abrir el selector
    // de carpeta) salvo que el handle guardado deje de ser válido del
    // todo (carpeta borrada/movida, o rechazo explícito anterior).
    const _stored = await _fsIdbLoadHandle();
    if (_stored) {
      try {
        let _perm = await _stored.queryPermission({ mode: 'readwrite' });
        if (_perm !== 'granted') _perm = await _stored.requestPermission({ mode: 'readwrite' });
        if (_perm === 'granted') { _fsDirHandle = _stored; return; }
      } catch(e) { /* handle inválido — seguir abajo y pedir uno nuevo */ }
    }

    const asked = localStorage.getItem('cx_fs_asked');
    if (asked === 'no') return; // usuario rechazó explícitamente antes — no insistir
    // Primera vez (o handle guardado ya no válido): preguntar
    try {
      const _picked = await window.showDirectoryPicker({
        id: 'comixou',
        mode: 'readwrite',
        startIn: 'documents',
      });
      localStorage.setItem('cx_fs_asked', 'yes');
      // BUG CORREGIDO (v38.13 — Alberto: "el directorio de obras de comxow es
      // un puro delirio", carpetas "ComiXou" anidadas hasta 11 niveles de
      // profundidad). Causa: showDirectoryPicker({id:'comixou'}) hace que el
      // NAVEGADOR recuerde, para ese id, la última carpeta elegida — recuerdo
      // que vive en el propio navegador, no en el localStorage de este sitio,
      // así que sobrevive a que Alberto borre datos del sitio durante pruebas.
      // Si la próxima vez que se pide (tras un borrado de localStorage) el
      // selector reabre ya DENTRO de la "ComiXou" creada la vez anterior y el
      // usuario simplemente acepta la carpeta ya abierta, este código creaba
      // OTRA "ComiXou" dentro de ella sin comprobar nada — repetido a lo largo
      // de muchas sesiones de pruebas, cada vez un nivel más profundo. Arreglo:
      // si la carpeta elegida YA se llama "ComiXou", reutilizarla tal cual; si
      // no, crear/entrar en la subcarpeta como antes.
      _fsDirHandle = (_picked.name === 'ComiXou')
        ? _picked
        : await _picked.getDirectoryHandle('ComiXou', { create: true });
      await _fsIdbSaveHandle(_fsDirHandle); // persistir para no volver a preguntar
    } catch(e) {
      // Usuario canceló
      localStorage.setItem('cx_fs_asked', 'no');
      _fsDirHandle = null;
    }
  }

  async function _fsWrite(id, comic) {
    if (!_FS_SUPPORTED) return;
    // No pedir directorio si localStorage está vacío y no hay cx_fs_asked previo
    // (señal de sesión incógnito o contexto restringido donde el popup no tiene sentido).
    // En modo normal: cx_fs_asked='yes'/'no' persiste entre sesiones → _fsAskDir lo corta.
    // En incógnito: localStorage vacío cada sesión → cx_fs_asked=null siempre.
    // Solución: usar sessionStorage para recordar la decisión dentro de la sesión incógnito.
    if (!localStorage.getItem('cx_fs_asked') && !sessionStorage.getItem('cx_fs_session')) {
      // Sin historial previo de respuesta. Usar editorData como señal definitiva:
      // - Modo normal: la obra tiene editorData con páginas (guardado local real).
      // - Incógnito/nube: obra sin editorData o sin páginas (solo metadatos).
      // Esto cubre: usuario nuevo, usuario anónimo, e incógnito correctamente.
      const _hasLocalData = !!(comic.editorData && comic.editorData.pages &&
                                comic.editorData.pages.length > 0);
      if (!_hasLocalData) {
        sessionStorage.setItem('cx_fs_session', 'no');
        return;
      }
    }
    if (sessionStorage.getItem('cx_fs_session') === 'no') return;
    await _fsAskDir();
    if (!_fsDirHandle) return;
    try {
      const payload = {
        editorData:   comic.editorData   || null,
        panels:       comic.panels       || [],
        coverDataUrl: comic.coverDataUrl || null,
        meta:         _stripHeavy(comic),
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
    migrateAnonToUser,
  };
})();

// Aviso de "sin espacio" fuera del editor (Alberto: QuotaExceededError visto en
// consola al guardar cs_comics, sin ningún aviso en pantalla). editor.js ya
// escucha 'cx:storage:quota' con edToast() mientras el editor está abierto
// (ver edInitEditor) — pero ese listener solo existe DURANTE esa sesión del
// editor, así que si el fallo ocurre en cualquier otra vista (Mis obras, home,
// sincronización en segundo plano...) no había ningún aviso visible, solo el
// console.error de WorkStore.saveAll(). Este listener es global (vive mientras
// dure la página, no una vista concreta) y se omite a sí mismo cuando el
// editor está abierto (sessionStorage 'cx_editing', mismo flag que ya usa
// pwa.js para lo mismo) para no duplicar el aviso de edToast().
window.addEventListener('cx:storage:quota', () => {
  if (sessionStorage.getItem('cx_editing')) return; // el editor ya avisa por su cuenta
  if (typeof showToast === 'function' && typeof I18n !== 'undefined') {
    showToast(I18n.t('ed_noSpaceWarn'), 5000);
  }
});
