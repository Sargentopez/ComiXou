/* ComiXow v4.2 */
/* ============================================================
   my-comics.js — Vista "Mis creaciones"
   Listado del autor con opciones Leer / Editar / Publicar.
   ============================================================ */

function MyComicsView_init() {
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
          <button class="comic-row-btn del" data-action="delete" data-id="${comic.id}">🗑</button>
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
      ComicStore.save({ ...comic, published: true, approved: false });
      _mcRenderList();
      _mcToast('Enviada a revisión ✓');
    } else if (action === 'unpublish') {
      const comic = ComicStore.getById(id);
      if (!comic) return;
      if (typeof Auth !== 'undefined' && !Auth.canManage(comic)) {
        alert('No tienes permiso para retirar esta obra.');
        return;
      }
      ComicStore.save({ ...comic, published: false, approved: false });
      _mcRenderList();
      _mcToast('Retirada del expositor');
    } else if (action === 'delete') {
      const comic = ComicStore.getById(id);
      if (comic && typeof Auth !== 'undefined' && !Auth.canManage(comic)) {
        alert('No tienes permiso para eliminar esta obra.');
        return;
      }
      if (!confirm('¿Eliminar esta obra? Esta acción no se puede deshacer.')) return;
      ComicStore.remove(id);
      _mcRenderList();
      _mcToast('Obra eliminada');
    }
  });
}

/* ── NAV Y MODALES ── */
function _mcBindNav() {
  document.getElementById('mcBackBtn')?.addEventListener('click', () => Router.go('home'));
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
