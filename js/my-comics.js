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
        <label>Autor</label>
        <input type="text" id="mcAuthor" placeholder="Tu nombre o seudónimo" autocomplete="off" inputmode="text" enterkeyhint="next">
      </div>
      <div class="mc-field">
        <label>Género</label>
        <input type="text" id="mcGenre" placeholder="Aventura, humor, drama…" autocomplete="off" inputmode="text" enterkeyhint="done">
      </div>
      <div class="mc-field">
        <label>Modo de lectura</label>
        <select id="mcNavMode">
          <option value="fixed">Viñeta fija (botones)</option>
          <option value="horizontal">Deslizamiento horizontal</option>
          <option value="vertical">Deslizamiento vertical</option>
        </select>
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
}

/* ── RENDERIZAR LISTA ── */
function _mcRenderList() {
  const wrap = document.getElementById('mcContent');
  if (!wrap) return;

  const user = Auth.currentUser();
  if (!user) { Router.go('login'); return; }

  const comics = ComicStore.getByUser(user.id)
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
    const pages = comic.pages ? comic.pages.length : (comic.panels ? comic.panels.length : 0);
    const pubLabel = comic.published
      ? (comic.approved ? '✅ Publicada' : '⏳ En revisión')
      : '📝 Borrador';
    const canUnpub = comic.published;

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
          <span style="font-size:.75rem;font-weight:700">${pages} pág.</span>
          <span style="color:var(--gray-400)">·</span>
          <span style="font-size:.75rem;font-weight:700;color:${comic.published ? 'var(--blue)' : 'var(--gray-500)'}">${pubLabel}</span>
        </div>
        <div class="comic-row-actions">
          ${pages > 0 ? `<button class="comic-row-btn" data-action="read" data-id="${comic.id}">📖 Leer</button>` : ''}
          <button class="comic-row-btn edit" data-action="edit" data-id="${comic.id}">✏️ Editar</button>
          ${!comic.published
            ? `<button class="comic-row-btn" style="color:var(--blue)" data-action="publish" data-id="${comic.id}">🚀 Publicar</button>`
            : `<button class="comic-row-btn unpub" data-action="unpublish" data-id="${comic.id}">🔒 Retirar</button>`
          }
          <button class="comic-row-btn del" data-action="delete" data-id="${comic.id}" style="color:#e63030;font-weight:900">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Ajustar padding top por la barra de nav
  const list = document.getElementById('myComicsList');
  const nav  = document.getElementById('myComicsNav');
  if (list && nav) {
    requestAnimationFrame(() => {
      list.style.paddingTop = nav.offsetHeight + 'px';
    });
  }

  // Eventos de botones
  wrap.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'read') {
      Router.go('reader', { id });
    } else if (action === 'edit') {
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
  // Pre-rellenar autor con el usuario actual
  const user = Auth.currentUser();
  const authorInput = document.getElementById('mcAuthor');
  if (authorInput && user) authorInput.value = user.username || '';
}

function _mcCloseModal() {
  document.getElementById('mcNewModal')?.classList.remove('open');
}

function _mcCreateProject() {
  const title   = document.getElementById('mcTitle')?.value.trim();
  const author  = document.getElementById('mcAuthor')?.value.trim();
  const genre   = document.getElementById('mcGenre')?.value.trim();
  const navMode = document.getElementById('mcNavMode')?.value || 'horizontal';

  if (!title) { document.getElementById('mcTitle')?.focus(); return; }

  const user = Auth.currentUser();
  const comic = {
    id:       'comic_' + Date.now(),
    userId:   user.id,
    username: user.username,
    title,
    author:   author || user.username,
    genre,
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
  ['mcTitle','mcAuthor','mcGenre'].forEach(id => {
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
    const works = await fetch(`${BASE}/works?author_name=eq.${username}&order=updated_at.desc`, { headers: hdrs })
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
        // Si la nube es más reciente, preguntar
        const cloudDate = new Date(w.updated_at || 0);
        const localDate = new Date(existing.updatedAt || 0);
        if (cloudDate <= localDate) { skipped++; continue; }
        // La nube es más nueva — actualizar metadatos (no reemplazar editorData local)
        // Solo actualizar campos de metadatos, no tocar el contenido del editor local
        existing.title    = w.title     || existing.title;
        existing.genre    = w.genre     || existing.genre;
        existing.navMode  = w.nav_mode  || existing.navMode;
        ComicStore.save(existing);
        skipped++;
        continue;
      }

      // Obra nueva en nube — crear entrada local mínima
      // (sin editorData: el autor deberá usar el editor para trabajar localmente)
      const localComic = {
        id:           'comic_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        userId:       user.id,
        username:     user.username,
        supabaseId:   w.id,
        title:        w.title      || 'Sin título',
        author:       w.author_name || user.username,
        genre:        w.genre      || '',
        navMode:      w.nav_mode   || 'fixed',
        panels:       [],   // sin contenido local aún
        pages:        [],
        published:    w.published  ?? false,
        approved:     w.published  ?? false,
        pendingReview: false,
        cloudOnly:    true,  // flag: contenido está en nube, no en local
        createdAt:    w.created_at || new Date().toISOString(),
        updatedAt:    w.updated_at || new Date().toISOString(),
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
