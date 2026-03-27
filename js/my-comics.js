/* ComiXow v4.2 */
/* ============================================================
   my-comics.js — Vista "Mis creaciones"
   Listado del autor con opciones Leer / Editar / Publicar.
   ============================================================ */

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
  // Sincronizar fechas con Supabase en segundo plano
  _mcSyncCloudDates();
}

/* ── SINCRONIZAR FECHAS CON SUPABASE ── */
async function _mcSyncCloudDates() {
  if (typeof SupabaseClient === 'undefined') return;
  if (typeof Auth === 'undefined' || !Auth.currentUser?.()) return;

  // Obtener todas las obras locales que tienen supabaseId
  const locals = ComicStore.getAll().filter(c => c.supabaseId);
  if (!locals.length) return;

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

      // Si la nube es más reciente: invalidar editorData local
      // para que al editar se descargue de Supabase
      if (cloudDate > localDate) {
        local.cloudOnly  = true;
        local.editorData = null;
        local.updatedAt  = w.updated_at;
        dirty = true;
      }

      if (dirty) { ComicStore.save(local); changed = true; }
    }

    if (changed) _mcRenderList();
  } catch(e) {
    // Silencioso — si no hay red, se usa la versión local
  }
}

/* ── RENDERIZAR LISTA ── */
function _mcRenderList() {
  const wrap = document.getElementById('mcContent');
  if (!wrap) return;

  const user = Auth.currentUser();
  if (!user) { Router.go('login'); return; }

  const comics = ComicStore.getAll()
    .filter(c => c.userId === user.id || c.username === user.username)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  if (!comics.length) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--gray-500)">
        <span style="font-size:3rem;display:block;margin-bottom:12px">📝</span>
        <p style="font-weight:700;font-size:1rem">Aún no has creado ninguna obra.</p>
        <p style="font-size:.88rem;margin-top:6px">Pulsa <strong>Crear nuevo</strong> para empezar.</p>
      </div>`;
    return;
  }

  wrap.innerHTML = comics.map(comic => {
    const thumb = comic.panels && comic.panels[0] ? comic.panels[0].dataUrl : '';
    const pages = comic.panelCount || (comic.pages ? comic.pages.length : (comic.panels ? comic.panels.length : 0));
    const pubLabel = comic.approved
      ? '✅ Publicada'
      : (comic.pendingReview ? '⏳ En revisión' : '📝 Borrador');

    return `
    <div class="comic-row" data-id="${comic.id}">
      <div class="comic-row-thumb">
        ${thumb
          ? `<img src="${thumb}" alt="${comic.title}" loading="lazy">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;background:var(--gray-100)">📄</div>`
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

  // Eventos de botones
  wrap.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'read') {
      const comic = ComicStore.getById(id);
      if (!comic) return;
      if (comic.supabaseId) {
        // Tiene ID en nube: usar el reproductor externo
        const param = comic.published ? `id=${comic.supabaseId}` : `draft=${comic.supabaseId}`;
        window.location = 'reader/?' + param + '&from=app';
      } else {
        // Solo local: visor interno del SPA
        Router.go('reader', { id });
      }
    } else if (action === 'edit') {
      const comicToEdit = ComicStore.getById(id);
      // Si es cloudOnly (descargada de la nube sin editorData local), descargar primero
      if (comicToEdit && comicToEdit.cloudOnly && comicToEdit.supabaseId &&
          (!comicToEdit.editorData || !comicToEdit.editorData.pages || !comicToEdit.editorData.pages.length) &&
          typeof SupabaseClient !== 'undefined') {
        _mcToast('\u23f3 Descargando obra de la nube...');
        try {
          const { work, editorData } = await SupabaseClient.downloadDraftAsEditorData(comicToEdit.supabaseId);
          ComicStore.save({
            ...comicToEdit,
            cloudOnly: false,
            editorData,
            title:   work.title    || comicToEdit.title,
            genre:   work.genre    || comicToEdit.genre,
            navMode: work.nav_mode || comicToEdit.navMode,
          });
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
        alert('No tienes permiso para publicar esta obra.');
        return;
      }
      if (!comic.panels || !comic.panels.length) {
        alert('Añade al menos una página antes de publicar.');
        return;
      }
      const supabaseId = comic.supabaseId || crypto.randomUUID();
      ComicStore.save({ ...comic, supabaseId, published: false, approved: false, pendingReview: true });
      _mcRenderList();
      // Scroll a la ficha: usar posición real menos el padding del contenedor
      requestAnimationFrame(() => {
        const row  = document.querySelector(`.comic-row[data-id="${id}"]`);
        const list = document.getElementById('myComicsList');
        if (!row || !list) return;
        const pt   = parseInt(list.style.paddingTop) || 0;
        const rowTop = row.getBoundingClientRect().top + window.scrollY - pt;
        window.scrollTo({ top: rowTop, behavior: 'smooth' });
      });
      if (typeof SupabaseClient !== 'undefined') {
        SupabaseClient.submitForReview({ ...comic, supabaseId, published: false, pendingReview: true })
          .catch(err => console.warn('Supabase submitForReview:', err));
      }
      _mcToast('Enviada a revisión ✓');
    } else if (action === 'unpublish') {
      const comic = ComicStore.getById(id);
      if (!comic) return;
      if (typeof Auth !== 'undefined' && !Auth.canManage(comic)) {
        alert('No tienes permiso para retirar esta obra.');
        return;
      }
      ComicStore.save({ ...comic, published: false, approved: false });
      if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
        SupabaseClient.unpublishWork(comic.id, comic.supabaseId)
          .catch(err => console.warn('Supabase unpublishWork:', err));
      }
      _mcRenderList();
      _mcToast('Retirada del expositor');
    } else if (action === 'delete') {
      const comic = ComicStore.getById(id);
      if (comic && typeof Auth !== 'undefined' && !Auth.canManage(comic)) {
        alert('No tienes permiso para eliminar esta obra.');
        return;
      }
      if (!confirm('¿Eliminar esta obra? Esta acción no se puede deshacer.')) return;
      if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
        SupabaseClient.deleteWork(comic.supabaseId)
          .catch(err => console.warn('Supabase deleteWork:', err));
      }
      ComicStore.remove(id);
      _mcRenderList();
      _mcToast('Obra eliminada');
    } else if (action === 'share') {
      const comic = ComicStore.getById(id);
      if (!comic) return;
      if (!comic.supabaseId) {
        alert('Esta obra no está guardada en la nube. Ábrela en el editor y guárdala en la nube para poder compartirla.');
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

  const user = Auth.currentUser();
  const comic = {
    id:       'comic_' + Date.now(),
    userId:   user.id,
    username: user.username,
    title,
    author:   user.username,
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
    // Usamos el username como identificador (el campo author_name en works)
    const BASE = 'https://qqgsbyylaugsagbxsetc.supabase.co/rest/v1';
    const KEY  = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';
    const hdrs = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };

    // Buscar por author_name = username del usuario actual
    const username = encodeURIComponent(user.username || '');
    const works = await fetch(`${BASE}/works?author_name=eq.${username}&order=updated_at.desc&select=*,panel_count`, { headers: hdrs })
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
        // Si la nube es más reciente, invalidar editorData local para forzar descarga al editar
        const cloudDate = new Date(w.updated_at || 0);
        const localDate = new Date(existing.updatedAt || 0);
        if (cloudDate <= localDate) {
          // Aunque no haya cambios, actualizar userId si era el ID antiguo
          if (existing.userId !== user.id) { existing.userId = user.id; ComicStore.save(existing); }
          skipped++; continue;
        }
        // La nube es más nueva — actualizar metadatos e invalidar editorData
        existing.title    = w.title     || existing.title;
        existing.genre    = w.genre     || existing.genre;
        existing.navMode  = w.nav_mode  || existing.navMode;
        existing.userId   = user.id;
        existing.cloudOnly  = true;
        existing.editorData = null;
        existing.updatedAt  = w.updated_at;
        ComicStore.save(existing);
        skipped++;
        continue;
      }

      // Obra nueva en nube — crear entrada local con thumbnail del primer panel
      let thumbDataUrl = '';
      try {
        const firstPanels = await fetch(
          `${BASE}/panels?work_id=eq.${w.id}&order=panel_order.asc&limit=1&select=data_url`,
          { headers: hdrs }
        ).then(r => r.json());
        thumbDataUrl = firstPanels?.[0]?.data_url || '';
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
        panels:       thumbDataUrl ? [{ dataUrl: thumbDataUrl }] : [],
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
    if (imported > 0)      _mcToast(`☁️ ${imported} obra${imported>1?'s':''} importada${imported>1?'s':''} de la nube`);
    else if (skipped > 0)  _mcToast('✓ Todo al día — no hay obras nuevas en la nube');

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
