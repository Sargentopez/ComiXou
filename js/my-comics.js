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

function MyComicsView_init() {
  _mcInjectModal();
  _mcRenderList();
  _mcBindNav();
  // Sincronizar fechas con Supabase en segundo plano (incluye descarga de biblioteca)
  _mcSyncCloudDates();
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
    // Para obras locales: usar el dataUrl guardado por el editor.
    const thumb = (comic.supabaseId && _mcThumbCache.get(comic.supabaseId))
      || (!comic.cloudOnly && comic.panels && comic.panels[0] ? comic.panels[0].dataUrl : '');
    const needsThumb = !thumb && comic.supabaseId;
    const pages = comic.panelCount || (comic.pages ? comic.pages.length : (comic.panels ? comic.panels.length : 0));
    const pubLabel = comic.approved
      ? '✅ Publicada'
      : (comic.pendingReview ? '⏳ En revisión' : '📝 Borrador');

    return `
    <div class="comic-row" data-id="${comic.id}">
      <div class="comic-row-thumb" ${needsThumb ? `data-thumb-id="${comic.supabaseId}"` : ''}>
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

  // Cargar miniaturas lazy para obras cloudOnly (Intersection Observer)
  const _thumbObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.dataset.thumbId;
        if (id) { _mcLoadThumb(id); _thumbObs.unobserve(entry.target); }
      }
    });
  }, { rootMargin: '200px' });
  wrap.querySelectorAll('[data-thumb-id]').forEach(el => _thumbObs.observe(el));

  // Eventos de botones
  wrap.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'read') {
      const comic = ComicStore.getById(id);
      if (!comic) return;
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
      const comicToEdit = ComicStore.getById(id);
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
            const _cloudDate = new Date(_cloudMeta[0].updated_at || 0);
            const _localDate = new Date(comicToEdit.updatedAt || comicToEdit.createdAt || 0);
            _cloudNewer = _cloudDate > _localDate;
          }
        } catch(e) { console.warn('fecha nube:', e); }
      }
      const _needsDownload = comicToEdit.supabaseId && typeof SupabaseClient !== 'undefined' && (
        comicToEdit.cloudOnly ||
        !comicToEdit.editorData?.pages?.length ||
        _hasLegacyStrokes ||
        _cloudNewer  // la nube tiene versión más reciente → descargar siempre
      );
      if (comicToEdit && _needsDownload) {
        _mcToast('\u23f3 Descargando obra de la nube\u2026 (puede tardar si contiene GIFs)');
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
                  const _idbKey = l._pngFramesKey || (comicToEdit.id + '_' + pi + '_' + li);
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
                  const _idbKey = comicToEdit.id + '_' + pi + '_' + li;
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
          ComicStore.save({
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
          // Sincronizar biblioteca del proyecto desde la nube
          const _user = typeof Auth !== 'undefined' ? Auth.currentUser?.() : null;
          const _sbId = comicToEdit.supabaseId || comicToEdit.id;
          if (_user && _user.id && _sbId && typeof SupabaseClient.bibDownload === 'function') {
            try {
              const _bibKey = `cs_biblioteca_${comicToEdit.id}`;
              const cloudData = await SupabaseClient.bibDownload(_user.id, _sbId);

              if (cloudData && cloudData.folders && cloudData.folders.length) {
                let localData;
                try { localData = JSON.parse(localStorage.getItem(_bibKey) || 'null'); } catch(e) {}
                if (!localData || !localData.folders) localData = { folders: [{ id: '__root__', name: 'General', items: [] }] };
                const localAllIds = new Set(localData.folders.flatMap(f => f.items.map(i => i.id)));
                // Procesar items nuevos: guardar apngSrc en IDB, no en localStorage
                const _bibIdbWrites = [];
                cloudData.folders.forEach(cf => {
                  const lf = localData.folders.find(f => f.id === cf.id);
                  const newItems = cf.items.filter(i => !localAllIds.has(i.id)).map(item => {
                    if (item.isGifAnim && item.apngSrc) {
                      // Guardar APNG en IDB por id del item
                      const _bibIdbKey = 'bib_' + item.id;
                      if (window._sbAnimIdbSave) {
                        _bibIdbWrites.push(
                          window._sbAnimIdbSave(_bibIdbKey, item.apngSrc).catch(() => {})
                        );
                      }
                      // Sustituir apngSrc por la clave IDB en el item
                      const cleanItem = Object.assign({}, item);
                      delete cleanItem.apngSrc;
                      cleanItem._apngIdbKey = _bibIdbKey;
                      return cleanItem;
                    }
                    return item;
                  });
                  if (newItems.length) {
                    if (lf) { lf.items.push(...newItems); }
                    else { localData.folders.push({ id: cf.id, name: cf.name, items: newItems }); }
                  }
                });
                // Esperar IDB antes de guardar en localStorage
                if (_bibIdbWrites.length) await Promise.all(_bibIdbWrites);
                try { localStorage.setItem(_bibKey, JSON.stringify(localData)); } catch(e) {}
              }
            } catch(e) { console.warn('bibDownload error (no crítico):', e); }
          }
        } catch(err) {
          _mcToast('\u26a0\ufe0f Error al descargar de la nube: ' + err.message);
          return;
        }
      }
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
      if (!comic.supabaseId) {
        appAlert('La obra debe estar guardada en la nube antes de publicarse.\nÁbrela en el editor y pulsa el botón ☁️ Guardar en nube.');
        return;
      }
      if (!comic.supabaseId && !comic.panelCount && (!comic.panels || !comic.panels.length)) {
        appAlert('Añade al menos una página antes de publicar.');
        return;
      }
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
      if (typeof SupabaseClient !== 'undefined') {
        SupabaseClient.submitForReview(comic)
          .then(() => _mcToast('Enviada a revisión ✓'))
          .catch(err => {
            // Revertir estado local si falla Supabase
            ComicStore.save({ ...comic, pendingReview: false });
            _mcRenderList();
            _mcToast('⚠️ Error al enviar: ' + err.message);
          });
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
      if (!comic) return;
      if (!comic.supabaseId) {
        appAlert('Esta obra no está guardada en la nube. Ábrela en el editor y guárdala en la nube para poder compartirla.');
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

function MyComicsView_destroy() { _mcRemoveModal(); }

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
