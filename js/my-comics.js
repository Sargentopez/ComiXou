/* ComiXow v4.2 */
/* ============================================================
   my-comics.js — Vista "Mis creaciones"
   Listado del autor con opciones Leer / Editar / Publicar.
   ============================================================ */

// ── Cache de miniaturas en memoria (evita guardar base64 en localStorage) ──
// Clave: supabaseId de la obra. Valor: dataUrl del thumbnail (solo vive en sesión).
const _mcThumbCache = new Map();

const _MC_BASE = 'https://qqgsbyylaugsagbxsetc.supabase.co/rest/v1';
const _MC_KEY  = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';
const _MC_HDRS = { 'apikey': _MC_KEY, 'Authorization': 'Bearer ' + _MC_KEY };

// Carga el thumbnail de una obra desde Supabase y lo cachea en memoria.
// Cuando llega, actualiza el div contenedor del DOM si está visible.
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

function _mcLoadThumb(supabaseId) {
  if (_mcThumbCache.has(supabaseId) && _mcThumbCache.get(supabaseId)) return;
  _mcThumbCache.set(supabaseId, ''); // marca como en progreso
  const _sess = JSON.parse(localStorage.getItem('cs_session') || 'null');
  const _tok = _sess?.token || _MC_KEY;
  const _hdrs = { 'apikey': _MC_KEY, 'Authorization': `Bearer ${_tok}` };
  fetch(`${_MC_BASE}/panels?work_id=eq.${supabaseId}&order=panel_order.asc&limit=1&select=data_url`,
    { headers: _hdrs })
    .then(r => r.json())
    .then(rows => {
      const url = rows?.[0]?.data_url || '';
      if (!url) return;
      _mcThumbCache.set(supabaseId, url);
      // Actualizar contenedor en DOM si existe
      const div = document.querySelector(`[data-thumb-id="${supabaseId}"]`);
      if (div) { div.innerHTML = `<img src="${url}" alt="" style="width:72px;height:72px;object-fit:cover;display:block">`; }
    })
    .catch(() => {});
}

// Carga el thumbnail de una obra LOCAL desde OPFS y lo cachea en memoria.
async function _mcLoadLocalThumb(comicId) {
  if (_mcThumbCache.has(comicId)) return;
  _mcThumbCache.set(comicId, ''); // marca como en progreso
  try {
    const full = ComicStore.getByIdFull ? await ComicStore.getByIdFull(comicId) : null;
    const url = full && full.panels && full.panels[0] ? full.panels[0].dataUrl : '';
    if (!url) return;
    _mcThumbCache.set(comicId, url);
    const div = document.querySelector(`[data-local-thumb-id="${comicId}"]`);
    if (div) { div.innerHTML = `<img src="${url}" alt="" style="width:72px;height:72px;object-fit:cover;display:block">`; }
  } catch(_e) {}
}

function _mcInjectModal() {
  // Inyectar el modal directamente en body (fuera de appView)
  // para que position:fixed funcione sin restricciones
  if (document.getElementById('mcNewModal')) return; // ya existe
  const modal = document.createElement('div');
  modal.className = 'mc-modal-overlay';
  modal.id = 'mcNewModal';
  modal.innerHTML = `
    <div class="mc-modal-box">
      <h3 class="mc-modal-title">Nuevo proyecto</h3>
      <div class="mc-field">
        <label>Título</label>
        <input type="text" id="mcTitle" placeholder="El nombre de tu obra" autocomplete="off" inputmode="text" enterkeyhint="next">
      </div>
      <div class="mc-field">
        <label>Género</label>
        <input type="text" id="mcGenre" placeholder="Aventura, humor, drama…" autocomplete="off" inputmode="text" enterkeyhint="next">
      </div>
      <div class="mc-field">
        <label>Modo de lectura</label>
        <select id="mcNavMode">
          <option value="fixed">Viñeta fija (botones)</option>
          <option value="horizontal">Deslizamiento horizontal</option>
          <option value="vertical">Deslizamiento vertical</option>
        </select>
      </div>
      <div class="mc-field">
        <label>Redes y comentarios <span style="font-weight:400;color:var(--gray-400);font-size:.78rem">(aparecen en la hoja final)</span></label>
        <textarea id="mcSocial" placeholder="Instagram: @miperfil · Web: misite.com · ¡Gracias por leer!" maxlength="300" rows="3" style="resize:none;overflow-y:auto;font-family:var(--font-body);font-size:.88rem;padding:8px 10px;border:1.5px solid var(--gray-200);border-radius:8px;width:100%;box-sizing:border-box;line-height:1.5"></textarea>
      </div>
      <div class="mc-modal-actions">
        <button class="btn" id="mcNewCancel" style="flex:1">Cancelar</button>
        <button class="btn btn-primary" id="mcNewCreate" style="flex:1">Crear ✓</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function _mcRemoveModal() {
  const m = document.getElementById('mcNewModal');
  if (m) m.remove();
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
  const _validIds = new Set(
    ComicStore.getAll()
      .filter(c => c.userId === _user.id || c.username === _user.username)
      .map(c => c.id)
  );

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
            } else {
              // Clave de animación de obra: {uid}__{comicId}_{pi}_{li}
              // comicId = todo antes de los dos últimos segmentos numéricos
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
  try {
    const _asOrphans = await new Promise(res => {
      const req = indexedDB.open('cxAutosave', 1);
      req.onsuccess = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('saves')) { res([]); return; }
        const keys = [];
        const tx  = db.transaction('saves', 'readonly');
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
      };
      req.onerror = () => res([]);
    });
    _orphans.autosave = _asOrphans;
  } catch(_e) {}

  // ── 5. localStorage: cs_biblioteca_{comicId} y cs_biblioteca_local_{comicId} ──
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('cs_biblioteca_')) {
        // cs_biblioteca_local_* son backups temporales gestionados por su propio ciclo de vida
        // (creados en my-comics, borrados en edSaveProject o al salir) — nunca son huérfanos
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

  // ── Aviso al usuario — solo si el usuario sigue en my-comics ───────
  if (!document.getElementById('mcContent')) return;
  appConfirm(
    'Se han encontrado datos en el almacenamiento local de ComiXow que no pertenecen a ninguna de tus obras. ¿Borrarlos?',
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
      // IDB cxAutosave
      if (_orphans.autosave.length) {
        try {
          await new Promise(res => {
            const req = indexedDB.open('cxAutosave', 1);
            req.onsuccess = e => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains('saves')) { res(); return; }
              const tx = db.transaction('saves', 'readwrite');
              const st = tx.objectStore('saves');
              _orphans.autosave.forEach(k => st.delete(k));
              tx.oncomplete = res; tx.onerror = res;
            };
            req.onerror = res;
          });
        } catch(_e) {}
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

      _mcToast('Datos no utilizados eliminados ✓');
    },
    'Sí, borrar'
  );
}

function MyComicsView_init() {
  _mcInjectModal();
  _mcRenderList();
  _mcBindNav();
  // Sincronizar fechas con Supabase en segundo plano (incluye descarga de biblioteca)
  _mcSyncCloudDates();
  // Buscar y ofrecer limpieza de datos huérfanos (en segundo plano, sin bloquear la UI)
  window._mcOrphanTimer = setTimeout(_mcCheckOrphanData, 2000);
}

/* ── SINCRONIZAR FECHAS CON SUPABASE ── */
async function _mcSyncCloudDates() {
  if (typeof SupabaseClient === 'undefined') return;
  const _mcUser = Auth.currentUser?.();
  if (typeof Auth === 'undefined' || !_mcUser) return;

  // Si no hay obras locales del usuario, intentar traer las de la nube
  const locals = ComicStore.getAll().filter(c => c.supabaseId &&
    (c.userId === _mcUser.id || c.username === _mcUser.username));
  if (!locals.length) {
    try {
      const cloudWorks = await SupabaseClient.fetchWorksByAuthor(_mcUser.id);
      if(cloudWorks && cloudWorks.length) {
        for(const w of cloudWorks) {
          // Guardar como obra cloudOnly (sin editorData local)
          const existing = ComicStore.getAll().find(c => c.supabaseId === w.id);
      if(!existing) {
            // No guardar thumbnail base64 en localStorage — cachearlo en memoria
            const _wClean = { ...w, userId: _mcUser.id, cloudOnly: true, editorData: null, supabaseId: w.id };
            if (_wClean.panels && _wClean.panels[0] && _wClean.panels[0].dataUrl) {
              if (!_mcThumbCache.has(w.id)) _mcThumbCache.set(w.id, _wClean.panels[0].dataUrl);
              _wClean.panels = [];
            }
            ComicStore.save(_wClean);
          }
        }
        _mcRenderList();
      }
    } catch(_) {}
    return;
  }

  try {
    const works = await SupabaseClient.fetchWorksByIds(locals.map(c => c.supabaseId));
    if (!works || !works.length) return;

    let changed = false;
    for (const w of works) {
      const local = locals.find(c => c.supabaseId === w.id);
      if (!local) continue;

      const cloudDate = new Date(w.updated_at || 0);
      const localDate = new Date(local.updatedAt || 0);

      // Actualizar metadatos siempre (título, género, estado publicación)
      let dirty = false;
      if (w.title    && w.title    !== local.title)    { local.title    = w.title;    dirty = true; }
      if (w.genre    && w.genre    !== local.genre)    { local.genre    = w.genre;    dirty = true; }
      if (w.nav_mode && w.nav_mode !== local.navMode)  { local.navMode  = w.nav_mode; dirty = true; }
      if (w.published !== undefined && w.published !== local.published) {
        local.published = w.published; dirty = true;
      }
      // Sincronizar pendingReview desde la nube (ahora hay columna pending_review en Supabase)
      const _cloudPending = w.published ? false : (w.pending_review || false);
      if (_cloudPending !== local.pendingReview) { local.pendingReview = _cloudPending; dirty = true; }

      // Si la nube es más reciente: marcar cloudNewer pero preservar editorData local
      // El usuario puede recuperar la versión local desde Proyecto → Recuperar versión del dispositivo
      if (cloudDate > localDate) {
        local.cloudNewer = true;
        // Preservar editorData local bajo localEditorData (no sobreescribir nunca)
        if(local.editorData && !local.localEditorData) {
          local.localEditorData = local.editorData;
        }
        local.editorData = null; // forzar descarga de la versión de nube al editar
        local.updatedAt  = w.updated_at;
        dirty = true;
        // Actualizar miniatura con la de la nube (más reciente)
        if (w.id) {
          _mcThumbCache.delete(w.id); // invalidar caché para forzar recarga
          _mcLoadThumb(w.id);
        }
      }

      if (dirty) { ComicStore.save(local); changed = true; }
    }

    if (changed) _mcRenderList();
  } catch(e) {
    // Silencioso — si no hay red, se usa la versión local
  }

  // La biblioteca es por proyecto — se sincroniza al abrir/guardar cada proyecto en el editor
}

/* ── RENDERIZAR LISTA ── */
function _mcRenderList() {
  const wrap = document.getElementById('mcContent');
  if (!wrap) return;

  const user = Auth.currentUser?.() || null;

  // Sin login: mostrar proyectos anónimos locales + banner de login
  const _anonId = '_anon_';
  const comics = ComicStore.getAll()
    .filter(c => user
      ? (c.userId === user.id || c.username === user.username)
      : (c.userId === _anonId || c.anonymous === true))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  // Banner de login para usuarios no autenticados
  const _loginBanner = user ? '' : `
    <div id="mcAnonBanner" style="background:var(--blue);color:#fff;padding:10px 14px;border-radius:10px;margin-bottom:12px;font-size:.85rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="flex:1">Modo invitado — las obras se guardan solo en este dispositivo.</span>
      <button onclick="Router.go('login')" style="background:#fff;color:var(--blue);border:none;border-radius:8px;padding:5px 12px;font-weight:700;cursor:pointer;font-size:.82rem">Iniciar sesión</button>
    </div>`;

  if (!comics.length) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--gray-500)">
        <span style="font-size:3rem;display:block;margin-bottom:12px">📝</span>
        <p style="font-weight:700;font-size:1rem">Aún no has creado ninguna obra.</p>
        <p style="font-size:.88rem;margin-top:6px">Pulsa <strong>Crear nuevo</strong> para empezar.</p>
      </div>`;
    return;
  }

  if (!comics.length && !user) {
    wrap.innerHTML = _loginBanner + `
      <div style="text-align:center;padding:40px 20px;color:var(--gray-500)">
        <span style="font-size:3rem;display:block;margin-bottom:12px">📝</span>
        <p style="font-weight:700;font-size:1rem">Aún no has creado ninguna obra.</p>
        <p style="font-size:.88rem;margin-top:6px">Pulsa <strong>Crear nuevo</strong> para empezar.</p>
      </div>`;
    return;
  }
  wrap.innerHTML = _loginBanner + comics.map(comic => {
    // Para obras cloudOnly: usar cache en memoria (no se persiste en localStorage).
    // Para obras locales: el dataUrl está en OPFS (_hasDataUrl flag), cargarlo lazy.
    const thumb = (comic.supabaseId && _mcThumbCache.get(comic.supabaseId))
      || _mcThumbCache.get(comic.id)
      || (!comic.cloudOnly && comic.panels && comic.panels[0] ? comic.panels[0].dataUrl : '');
    const needsCloudThumb = !thumb && !!comic.supabaseId;
    const needsLocalThumb = !thumb && !comic.supabaseId
      && comic.panels && comic.panels[0] && comic.panels[0]._hasDataUrl;
    const needsThumb = needsCloudThumb || needsLocalThumb;
    const pages = comic.panelCount || (comic.pages ? comic.pages.length : (comic.panels ? comic.panels.length : 0));
    const pubLabel = comic.approved
      ? '✅ Publicada'
      : (comic.pendingReview ? '⏳ En revisión' : '📝 Borrador');

    return `
    <div class="comic-row" data-id="${comic.id}">
      <div class="comic-row-thumb" ${needsCloudThumb ? `data-thumb-id="${comic.supabaseId}"` : ''} ${needsLocalThumb ? `data-local-thumb-id="${comic.id}"` : ''}>
        ${thumb
          ? `<img src="${thumb}" alt="${comic.title}" loading="lazy">`
          : needsThumb
            ? `<span style="font-size:1.4rem;color:var(--gray-300)">⏳</span>`
            : `<span style="font-size:1.8rem">📄</span>`
        }
      </div>
      <div class="comic-row-info">
        <div class="comic-row-title">${comic.title || 'Sin título'}</div>
        <div class="comic-row-author" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>${comic.author || comic.username || ''}</span>
          ${comic.genre ? `<span style="color:var(--gray-400)">·</span><span style="color:var(--blue);font-size:.75rem;font-weight:700">${comic.genre}</span>` : ''}
          <span style="color:var(--gray-400)">·</span>
          <span style="font-size:.75rem;font-weight:700">${Math.max(1, pages)} hojas</span>

        </div>
        <div class="comic-row-actions">
          ${pages > 0 ? `<button class="comic-row-btn" data-action="read" data-id="${comic.id}">📖 Leer</button>` : ''}
          <button class="comic-row-btn edit" data-action="edit" data-id="${comic.id}">✏️ Editar</button>
          ${comic.approved
            ? `<button class="comic-row-btn unpub" data-action="unpublish" data-id="${comic.id}">📢 Publicada · Retirar</button>`
            : (comic.pendingReview
                ? `<button class="comic-row-btn unpub" data-action="unpublish" data-id="${comic.id}">⏳ En revisión · Retirar</button>`
                : `<button class="comic-row-btn" style="color:var(--blue)" data-action="publish" data-id="${comic.id}">🚀 Publicar</button>`)
          }
          <button class="comic-row-btn" data-action="share" data-id="${comic.id}">📤 Enviar</button>
          <button class="comic-row-btn del" data-action="delete" data-id="${comic.id}" style="color:#e63030;font-weight:900">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Botón de diagnóstico
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

  // Cargar miniaturas lazy — tanto obras cloud (data-thumb-id) como locales (data-local-thumb-id)
  const _thumbObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const cloudId = entry.target.dataset.thumbId;
        const localId = entry.target.dataset.localThumbId;
        if (cloudId) { _mcLoadThumb(cloudId); _thumbObs.unobserve(entry.target); }
        if (localId) { _mcLoadLocalThumb(localId); _thumbObs.unobserve(entry.target); }
      }
    });
  }, { rootMargin: '200px' });
  wrap.querySelectorAll('[data-thumb-id],[data-local-thumb-id]').forEach(el => _thumbObs.observe(el));

  // Eventos de botones
  wrap.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'read') {
      const comic = ComicStore.getById(id);
      if (!comic || !_mcOwns(comic)) return;
      if (comic.supabaseId && comic.published) {
        // Obra publicada: usar el reproductor externo (anon key puede leer)
        const _isFs2 = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (_isFs2) sessionStorage.setItem('cx_was_fs', '1');
        else sessionStorage.removeItem('cx_was_fs');
        window.location = 'reader/index.html?id=' + comic.supabaseId + '&from=app' + (_isFs2 ? '&fs=1' : '');
      } else if (comic.supabaseId) {
        // Borrador o en revisión en nube: reader externo con JWT del autor
        const _isFs2 = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (_isFs2) sessionStorage.setItem('cx_was_fs', '1');
        else sessionStorage.removeItem('cx_was_fs');
        window.location = 'reader/index.html?draft=' + comic.supabaseId + '&from=app' + (_isFs2 ? '&fs=1' : '');
      } else {
        // Borrador local sin supabaseId: visor interno del SPA
        Router.go('reader', { id });
      }
    } else if (action === 'edit') {
      const _comicMeta = ComicStore.getById(id);
      if (!_comicMeta || !_mcOwns(_comicMeta)) return;
      const comicToEdit = ComicStore.getByIdFull
        ? (await ComicStore.getByIdFull(id))
        : ComicStore.getById(id);
      // Si es cloudOnly (descargada de la nube sin editorData local), descargar primero.
      // También re-descargar si hay strokes en formato antiguo (sin x/y/width/height) —
      // esos strokes se renderizan incorrectamente con las versiones nuevas del editor.
      const _hasLegacyStrokes = (comicToEdit.editorData?.pages||[]).some(pg =>
        (pg.layers||[]).some(l => l.type === 'stroke' && l.x == null)
      );
      // Comprobar si la nube tiene una versión más reciente que la local
      let _cloudNewer = false;
      if (comicToEdit.supabaseId && typeof SupabaseClient !== 'undefined') {
        try {
          const _cloudMeta = await SupabaseClient.fetchWorksByIds([comicToEdit.supabaseId]);
          if (_cloudMeta && _cloudMeta[0]) {
            const _cloudDate  = new Date(_cloudMeta[0].updated_at || 0);
            // Comparar con localSavedAt — cuándo guardó localmente este dispositivo.
            // Si la nube es más nueva que el último guardado local → descargar.
            const _localSaved = new Date(comicToEdit.localSavedAt || comicToEdit.updatedAt || 0);
            _cloudNewer = _cloudDate > _localSaved;
          }
        } catch(e) { console.warn('fecha nube:', e); }
      }
      // Si localSavedAt es reciente y la nube no es más nueva, confiar en OPFS local
      // aunque editorData no esté en el índice ligero (puede estar en OPFS)
      const _hasLocalSaved = !!(comicToEdit.localSavedAt);
      const _needsDownload = comicToEdit.supabaseId && typeof SupabaseClient !== 'undefined' && (
        comicToEdit.cloudOnly ||
        (!comicToEdit.editorData?.pages?.length && !_hasLocalSaved) ||
        _hasLegacyStrokes ||
        _cloudNewer  // la nube tiene versión más reciente → descargar siempre
      );
      if (comicToEdit && _needsDownload) {
        _mcToast('\u23f3 Descargando obra de la nube\u2026 ');
        try {
          const { work, editorData } = await SupabaseClient.downloadDraftAsEditorData(comicToEdit.supabaseId);
          // Usar window._sbAnimIdbSave (conexión cacheada) para evitar
          // conflictos con otras conexiones abiertas a cxAnims
          const _animIdbSave = (key, data) =>
            window._sbAnimIdbSave ? window._sbAnimIdbSave(key, data).catch(() => {}) : Promise.resolve();
          const _idbWrites = [];
          const _edataClean = {
            ...editorData,
            pages: (editorData.pages || []).map((pg, pi) => ({
              ...pg,
              layers: (pg.layers || []).map((l, li) => {
                // _apngSrc: dataUrl enorme descargado de la nube — guardar en IDB y eliminar
                if (l._apngSrc) {
                  const _uid = (() => { try { const _s = JSON.parse(localStorage.getItem('cs_session')||'null'); return (_s&&_s.id)?String(_s.id).replace(/[^a-zA-Z0-9_-]/g,'_'):'_anon_'; } catch(_e){return '_anon_';} })();
              const _idbKey = l._pngFramesKey || (_uid + '__' + comicToEdit.id + '_' + pi + '_' + li);
                  _idbWrites.push(_animIdbSave(_idbKey, l._apngSrc));
                  const lClean = Object.assign({}, l);
                  delete lClean._apngSrc;
                  delete lClean._animFrames;
                  delete lClean._animReady;
                  delete lClean._oc;
                  lClean._pngFramesKey = _idbKey;
                  return lClean;
                }
                // _pngFrames (sistema antiguo): externalizar a IDB
                if (l._pngFrames) {
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
          await ComicStore.save({
            ...comicToEdit,
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
          });
          // Sincronizar biblioteca: usar la de la nube si la nube es más nueva o la obra es cloudOnly.
          // Si la local es más reciente (solo _hasLegacyStrokes forzó la descarga), preservar la local.
          const _user = typeof Auth !== 'undefined' ? Auth.currentUser?.() : null;
          const _sbId = comicToEdit.supabaseId || comicToEdit.id;
          const _useCloudBib = comicToEdit.cloudOnly === true || _cloudNewer;
          if (_useCloudBib && _user && _user.id && _sbId && typeof SupabaseClient.bibDownload === 'function') {
            try {
              const _bibKey = `cs_biblioteca_${comicToEdit.id}`;
              const _bibLocalKey = `cs_biblioteca_local_${comicToEdit.id}`;
              // Guardar la biblioteca local actual como backup (solo si no existe ya un backup)
              const _bibLocalExists = localStorage.getItem(_bibLocalKey);
              if (!_bibLocalExists) {
                const _bibCurrentData = window._bibLoad ? window._bibLoad() : null;
                const _bibCurrentRaw = _bibCurrentData ? JSON.stringify(_bibCurrentData) : localStorage.getItem(_bibKey);
                if (_bibCurrentRaw) {
                  try { localStorage.setItem(_bibLocalKey, _bibCurrentRaw); } catch(e) {}
                }
              }
              // Solo para obras cloud: descargar biblioteca de la nube y reemplazar la local
              const cloudData = await SupabaseClient.bibDownload(_user.id, _sbId);
              const _bibIdbWrites = [];
              if (cloudData && cloudData.folders) {
                // Procesar animaciones: guardar en IDB y limpiar apngSrc del JSON
                const cleanFolders = cloudData.folders.map(cf => ({
                  ...cf,
                  items: cf.items.map(item => {
                    if (item.isGifAnim && item.apngSrc) {
                      const _bibUid1 = (() => { try { const _s = JSON.parse(localStorage.getItem('cs_session')||'null'); return (_s&&_s.id)?String(_s.id).replace(/[^a-zA-Z0-9_-]/g,'_'):'_anon_'; } catch(_e){return '_anon_';} })();
                      const _bibIdbKey = _bibUid1 + '__bib_' + item.id;
                      if (window._sbAnimIdbSave) {
                        _bibIdbWrites.push(window._sbAnimIdbSave(_bibIdbKey, item.apngSrc).catch(() => {}));
                      }
                      const cleanItem = Object.assign({}, item);
                      delete cleanItem.apngSrc;
                      cleanItem._apngIdbKey = _bibIdbKey;
                      return cleanItem;
                    }
                    return item;
                  })
                }));
                if (_bibIdbWrites.length) await Promise.all(_bibIdbWrites);
                // Reemplazar la biblioteca local con la de la nube (no merge)
                if (window._bibSave) { window._bibSave({ folders: cleanFolders }); }
                else { try { localStorage.setItem(_bibKey, JSON.stringify({ folders: cleanFolders })); } catch(e) {} }
              } else {
                // La nube no tiene biblioteca — limpiar la local para no mezclar datos
                if (window._bibSave) { window._bibSave({ folders: [{ id: '__root__', name: 'General', items: [] }, { id: '__anim__', name: 'Animaciones', items: [] }] }); }
                else { try { localStorage.removeItem(_bibKey); } catch(e) {} }
              }
            } catch(e) { console.warn('bibDownload error (no crítico):', e); }
          }
        } catch(err) {
          if (_dlBtn) _dlBtn.style.pointerEvents = '';
          _mcToast('\u26a0\ufe0f Error al descargar de la nube: ' + err.message);
          return;
        }
      }

      // Cuando local es más nueva: no tocar la biblioteca.
      // La biblioteca local (cs_biblioteca_{id}) ya tiene los datos correctos del dispositivo.
      // Solo si NO hay datos locales de biblioteca descargamos la de la nube como punto de partida.
      if (!_needsDownload) {
        const _bibUser = typeof Auth !== 'undefined' ? Auth.currentUser?.() : null;
        const _bibSbId = comicToEdit.supabaseId || comicToEdit.id;
        if (_bibUser && _bibUser.id && _bibSbId && typeof SupabaseClient.bibDownload === 'function') {
          try {
            const _bibKey = `cs_biblioteca_${comicToEdit.id}`;
            const _bibLocal = window._bibLoad ? window._bibLoad() : (() => {
              try { return JSON.parse(localStorage.getItem(_bibKey) || 'null'); } catch(e) { return null; }
            })();
            const _bibEmpty = !_bibLocal || !_bibLocal.folders || _bibLocal.folders.every(f => !f.items || f.items.length === 0);
            if (_bibEmpty) {
              // No hay biblioteca local — descargar la de la nube como punto de partida
              const _cloudBib = await SupabaseClient.bibDownload(_bibUser.id, _bibSbId);
              if (_cloudBib && _cloudBib.folders) {
                const _bibIdbW = [];
                const cleanFolders = _cloudBib.folders.map(cf => ({
                  ...cf,
                  items: cf.items.map(item => {
                    if (item.isGifAnim && item.apngSrc) {
                      const _bibUid2 = (() => { try { const _s = JSON.parse(localStorage.getItem('cs_session')||'null'); return (_s&&_s.id)?String(_s.id).replace(/[^a-zA-Z0-9_-]/g,'_'):'_anon_'; } catch(_e){return '_anon_';} })();
                      const _k = _bibUid2 + '__bib_' + item.id;
                      if (window._sbAnimIdbSave) _bibIdbW.push(window._sbAnimIdbSave(_k, item.apngSrc).catch(() => {}));
                      const c = Object.assign({}, item);
                      delete c.apngSrc; c._apngIdbKey = _k; return c;
                    }
                    return item;
                  })
                }));
                if (_bibIdbW.length) await Promise.all(_bibIdbW);
                if (window._bibSave) { window._bibSave({ folders: cleanFolders }); }
                else { try { localStorage.setItem(_bibKey, JSON.stringify({ folders: cleanFolders })); } catch(e) {} }
              }
            }
            // Si hay biblioteca local → no tocar nada (la versión local es la canónica)
          } catch(e) { console.warn('bibDownload:', e); }
        }
      }

      // El aviso de modo incógnito lo gestiona _edShowIncognitoWarning en editor.js
      // Guardar qué proyecto editar y navegar al editor
      sessionStorage.setItem('cx_edit_id', id);
      Router.go('editor');
    } else if (action === 'publish') {
      const comic = ComicStore.getById(id);
      if (!comic) return;
      if (typeof Auth !== 'undefined' && !Auth.canManage(comic)) {
        appAlert('No tienes permiso para publicar esta obra.');
        return;
      }
      // 1. Nunca subida a la nube → bloquear
      if (!comic.supabaseId) {
        appAlert('La obra debe estar guardada en la nube antes de publicarse.\nÁbrela en el editor y pulsa el botón ☁️ Guardar en nube.');
        return;
      }
      // 2. Comparar fechas: localSavedAt vs cloudSavedAt
      //    - localSavedAt: se actualiza cada vez que se guarda en local (editor)
      //    - cloudSavedAt: se actualiza SOLO cuando se sube a la nube con éxito
      //    Si localSavedAt > cloudSavedAt (o cloudSavedAt no existe) → hay cambios sin subir
      const _comicFull = ComicStore.getByIdFull
        ? (await ComicStore.getByIdFull(comic.id)) || comic
        : comic;
      const _localAt  = _comicFull.localSavedAt || '';
      const _cloudAt  = _comicFull.cloudSavedAt || '';
      const _hasLocalData = !!(_comicFull.editorData?.pages?.length);
      // Local más nueva: tiene datos locales Y (nunca subida a la nube O guardado local posterior a la subida)
      const _localNewer = _hasLocalData && (_localAt > _cloudAt || !_cloudAt);
      // 3. Si la versión local es más nueva que la nube → pedir que guarde primero
      if (_localNewer) {
        appAlert('Tienes cambios sin subir a la nube.\nÁbrela en el editor y pulsa ☁️ Guardar en nube antes de publicar.');
        return;
      }
      // 4. La nube es la versión más reciente (o no hay datos locales) →
      //    solo cambiar el estado en Supabase, SIN re-subir contenido
      if (typeof SupabaseClient !== 'undefined') {
        _mcSubmitOverlayShow();
        try {
          ComicStore.save({ ...comic, published: false, approved: false, pendingReview: true });
          _mcRenderList();
          requestAnimationFrame(() => {
            const row  = document.querySelector(`.comic-row[data-id="${id}"]`);
            const list = document.getElementById('myComicsList');
            if (!row || !list) return;
            const pt   = parseInt(list.style.paddingTop) || 0;
            const rowTop = row.getBoundingClientRect().top + window.scrollY - pt;
            window.scrollTo({ top: rowTop, behavior: 'smooth' });
          });
          await SupabaseClient.submitForReviewOnly(comic.supabaseId);
          _mcSubmitOverlayHide();
          _mcToast('Enviada a revisión ✓');
        } catch(err) {
          _mcSubmitOverlayHide();
          ComicStore.save({ ...comic, pendingReview: false });
          _mcRenderList();
          _mcToast('⚠️ Error al enviar: ' + err.message);
        }
      } else {
        _mcToast('Enviada a revisión ✓');
      }
    } else if (action === 'unpublish') {
      const comic = ComicStore.getById(id);
      if (!comic) return;
      if (typeof Auth !== 'undefined' && !Auth.canManage(comic)) {
        appAlert('No tienes permiso para retirar esta obra.');
        return;
      }
      ComicStore.save({ ...comic, published: false, approved: false, pendingReview: false });
      if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
        SupabaseClient.unpublishWork(comic.id, comic.supabaseId)
          .catch(err => { _mcToast('⚠️ Error al retirar en la nube: ' + err.message); });
      }
      // Invalidar cache de portada para que desaparezca del índice
      if (typeof homeInvalidateCache === 'function') homeInvalidateCache();
      _mcRenderList();
      _mcToast('Obra retirada de la portada');
    } else if (action === 'delete') {
      const comic = ComicStore.getById(id);
      if (!comic || !_mcOwns(comic)) return;
      if (comic && typeof Auth !== 'undefined' && !Auth.canManage(comic)) {
        appAlert('No tienes permiso para eliminar esta obra.');
        return;
      }
      appConfirm('¿Eliminar esta obra? Esta acción no se puede deshacer.', ()=>{
        ComicStore.remove(id);
        _mcRenderList();
        // Invalidar cache de portada
        if (typeof homeInvalidateCache === 'function') homeInvalidateCache();
        if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
          SupabaseClient.deleteWork(comic.supabaseId)
            .then(() => _mcToast('Obra eliminada ✓'))
            .catch(err => _mcToast('⚠️ Eliminada localmente, error en nube: ' + err.message));
        } else {
          _mcToast('Obra eliminada');
        }
      });
    } else if (action === 'share') {
      const comic = ComicStore.getById(id);
      if (!comic || !_mcOwns(comic)) return;
      if (!comic.supabaseId) {
        appAlert('Esta obra no está guardada en la nube. Ábrela en el editor y guárdala en la nube para poder compartirla.');
        return;
      }
      // Si la versión local es más nueva que la nube, el enlace apuntaría a datos
      // desactualizados — avisar al usuario para que guarde primero
      const _localAt = comic.localSavedAt || '';
      const _cloudAt = comic.updatedAt    || '';
      if (_localAt && _cloudAt && _localAt > _cloudAt) {
        appAlert('La versión local es más reciente que la guardada en la nube.\nÁbrela en el editor y pulsa ☁️ Guardar en nube antes de compartirla.');
        return;
      }
      if (typeof openShareModal !== 'undefined') openShareModal(comic);
    }
  });
}

/* ── NAV Y MODALES ── */
function _mcBindNav() {
  document.getElementById('mcBackBtn')?.addEventListener('click', () => Router.go('home'));
  document.getElementById('mcCloudLoadBtn')?.addEventListener('click', _mcCloudLoad);
  document.getElementById('mcNewBtn')?.addEventListener('click', _mcOpenModal);
  document.getElementById('mcNewCancel')?.addEventListener('click', _mcCloseModal);
  document.getElementById('mcNewCreate')?.addEventListener('click', _mcCreateProject);
}

function _mcOpenModal() {
  const m = document.getElementById('mcNewModal');
  if (m) m.classList.add('open');
}

function _mcCloseModal() {
  document.getElementById('mcNewModal')?.classList.remove('open');
}

function _mcCreateProject() {
  const title   = document.getElementById('mcTitle')?.value.trim();
  const genre   = document.getElementById('mcGenre')?.value.trim();
  const social  = document.getElementById('mcSocial')?.value.trim().slice(0, 300);
  const navMode = document.getElementById('mcNavMode')?.value || 'horizontal';

  if (!title) { document.getElementById('mcTitle')?.focus(); return; }

  const user = Auth.currentUser?.() || null;

  // ── Comprobar si ya existe una obra con ese título para este usuario ──────
  const _mcDuplicateWork = ComicStore.getAll().find(c =>
    c.title === title &&
    (c.userId === (user?.id) || c.username === (user?.username))
  );

  if (_mcDuplicateWork) {
    _mcConfirmDuplicate(title, _mcDuplicateWork, function(overwrite) {
      if (overwrite) {
        // Sobrescribir: abrir el editor con la obra existente
        _mcCloseModal();
        sessionStorage.setItem('cx_edit_id', _mcDuplicateWork.id);
        Router.go('editor');
      }
      // Si no sobrescribe: el modal de nueva obra sigue abierto para que edite el nombre
    });
    return;
  }

  _mcDoCreateProject(title, genre, social, navMode, user);
}

function _mcDoCreateProject(title, genre, social, navMode, user) {
  const comic = {
    id:       'comic_' + Date.now(),
    userId:   user ? user.id : '_anon_',
    username: user ? user.username : 'Anónimo',
    anonymous: !user,
    title,
    author:   user ? user.username : 'Anónimo',
    genre,
    social:   social || '',
    navMode,
    pages:    [],
    panels:   [],
    published: false,
    approved:  false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  ComicStore.save(comic);

  _mcCloseModal();

  // Limpiar campos
  ['mcTitle','mcGenre','mcSocial'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Abrir el editor con este proyecto
  sessionStorage.setItem('cx_edit_id', comic.id);
  Router.go('editor');
}

// Modal de confirmación de título duplicado desde "Nuevo proyecto"
function _mcConfirmDuplicate(title, existingComic, callback) {
  // Eliminar modal anterior si existe
  document.getElementById('mcDupModal')?.remove();
  const ov = document.createElement('div');
  ov.className = 'mc-modal-overlay open';
  ov.id = 'mcDupModal';
  ov.innerHTML = `
    <div class="mc-modal-box" style="gap:14px">
      <h3 class="mc-modal-title" style="font-size:1.05rem">Título duplicado</h3>
      <p style="margin:0;color:var(--gray-600);font-size:.9rem;line-height:1.5">
        Ya tienes una obra llamada <strong style="color:var(--primary)">${title.replace(/</g,'&lt;')}</strong>.<br>
        ¿Qué deseas hacer?
      </p>
      <div class="mc-modal-actions" style="flex-direction:column;gap:8px">
        <button class="btn btn-primary" id="mcDupOverwrite" style="width:100%">Abrir la obra existente</button>
        <button class="btn" id="mcDupBack" style="width:100%">Cambiar el nombre</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  document.getElementById('mcDupOverwrite').addEventListener('click', function() {
    ov.remove();
    callback(true);
  });
  document.getElementById('mcDupBack').addEventListener('click', function() {
    ov.remove();
    callback(false);
  });
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

function MyComicsView_destroy() {
  _mcRemoveModal();
  // Cancelar el check de huérfanos si aún no se ha ejecutado
  if (window._mcOrphanTimer) { clearTimeout(window._mcOrphanTimer); window._mcOrphanTimer = null; }
}

/* ── CARGAR BORRADORES DESDE NUBE ── */
async function _mcCloudLoad() {
  if (typeof SupabaseClient === 'undefined') { _mcToast('Sin conexión al servidor'); return; }
  const user = Auth.currentUser();
  if (!user) { _mcToast('Inicia sesión para cargar desde la nube'); return; }

  const btn = document.getElementById('mcCloudLoadBtn');
  if (btn) { btn.textContent = '⏳ Cargando...'; btn.disabled = true; }

  try {
    // Buscar en Supabase todas las obras donde author_name coincide con este usuario
    const username = encodeURIComponent(user.username || '');
    // Usar JWT del usuario para que RLS permita leer sus borradores (published=false)
    const _session = JSON.parse(localStorage.getItem('cs_session') || 'null');
    const _token = _session?.token || _MC_KEY;
    const _authHdrs = { 'apikey': _MC_KEY, 'Authorization': `Bearer ${_token}`, 'Range': '0-999' };
    // Range: 0-999 garantiza hasta 1000 resultados (límite PostgREST por defecto)
    const works = await fetch(`${_MC_BASE}/works?author_name=eq.${username}&order=updated_at.desc&select=*,panel_count`,
      { headers: _authHdrs })
      .then(r => r.json());

    if (!works || !works.length) {
      _mcToast('No hay obras en la nube para este usuario');
      return;
    }

    let imported = 0, skipped = 0;

    for (const w of works) {
      // ¿Ya existe localmente con este supabaseId?
      const existing = ComicStore.getAll().find(c => c.supabaseId === w.id);
      if (existing) {
        const cloudDate = new Date(w.updated_at || 0);
        // Comparar contra localSavedAt (cuándo se guardó en este dispositivo)
        // updatedAt se sobreescribe con la fecha de la nube, así que no sirve para comparar
        const localSaved = new Date(existing.localSavedAt || existing.updatedAt || 0);
        const cloudIsNewer = cloudDate > localSaved;

        // Siempre actualizar metadatos básicos
        let dirty = false;
        if (existing.userId !== user.id) { existing.userId = user.id; dirty = true; }
        if (w.title    && w.title    !== existing.title)   { existing.title   = w.title;    dirty = true; }
        if (w.genre    && w.genre    !== existing.genre)   { existing.genre   = w.genre;    dirty = true; }
        if (w.nav_mode && w.nav_mode !== existing.navMode) { existing.navMode = w.nav_mode; dirty = true; }
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
          if (!_mcThumbCache.has(w.id)) _mcThumbCache.set(w.id, existing.panels[0].dataUrl);
          existing.panels = [];
          dirty = true;
        }

        if (dirty) ComicStore.save(existing);
        continue;
      }

      // Obra nueva en nube — cachear thumbnail en memoria, NO en localStorage
      try {
        const firstPanels = await fetch(
          `${_MC_BASE}/panels?work_id=eq.${w.id}&order=panel_order.asc&limit=1&select=data_url`,
          { headers: _authHdrs }
        ).then(r => r.json());
        const thumbDataUrl = firstPanels?.[0]?.data_url || '';
        if (thumbDataUrl) _mcThumbCache.set(w.id, thumbDataUrl);
      } catch(e) { /* sin thumbnail */ }

      const localComic = {
        id:           'comic_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        userId:       user.id,
        username:     user.username,
        supabaseId:   w.id,
        title:        w.title       || 'Sin título',
        author:       w.author_name || user.username,
        genre:        w.genre       || '',
        navMode:      w.nav_mode    || 'fixed',
        panels:       [],        // NO persisitir base64 en localStorage — se carga lazy
        panelCount:   w.panel_count || 0,
        pages:        [],
        published:    w.published   ?? false,
        approved:     w.published   ?? false,
        pendingReview: false,
        cloudOnly:    true,
        createdAt:    w.created_at  || new Date().toISOString(),
        updatedAt:    w.updated_at  || new Date().toISOString(),
      };
      ComicStore.save(localComic);
      imported++;
    }

    _mcRenderList();
    if (imported > 0)      _mcToast(`☁️ ${imported} obra${imported>1?'s':''} actualizada${imported>1?'s':''} desde la nube`);
    else if (skipped > 0)  _mcToast('✓ Todo al día — no hay versiones más recientes en la nube');

  } catch(err) {
    console.error('_mcCloudLoad:', err);
    _mcToast('⚠️ Error al conectar con la nube');
  } finally {
    if (btn) { btn.textContent = '☁️ Cargar de nube'; btn.disabled = false; }
  }
}

/* ── MODAL READER EMBED (my-comics) ── */
function _mcOpenReaderModal(url) {
  let overlay = document.getElementById('mcReaderModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mcReaderModal';
    overlay.className = 'reader-modal';
    overlay.innerHTML = `
      <div class="reader-modal-inner">
        <button class="reader-modal-close" aria-label="Cerrar">✕</button>
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
  const comics = ComicStore.getAll().filter(c => c.supabaseId);
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
        ComicStore.getAll()
          .filter(c => c.userId === _user2.id || c.username === _user2.username)
          .map(c => c.id)
      );
      L('IDs válidos en ComicStore: ' + _validIds2.size);
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
      <div style="font-size:2.2rem;margin-bottom:16px">☁️</div>
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:10px">Guardando en la nube…</div>
      <div style="font-size:.82rem;opacity:.85;max-width:280px;line-height:1.5;margin-bottom:16px">
        No salgas de la aplicación hasta finalizado el guardado.<br>
        Interrumpir el proceso creará una obra defectuosa.
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:20px;height:20px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:_mcSpin .8s linear infinite"></div>
        <span id="_mcSubmitOvSecs" style="font-size:.9rem;opacity:.8">0s</span>
      </div>
      <style>@keyframes _mcSpin{to{transform:rotate(360deg)}}</style>
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
