/* ============================================================
   home.js — Lógica de la página de inicio
   ============================================================ */

let activeFilter  = { type: null, value: null }; // tipo: 'genre' | 'author' | null
let _homeWorks    = null;   // caché de obras publicadas desde Supabase

// ── Punto de entrada SPA ──

/* Refresco reactivo cuando ComicStore emite cx:store */
function _onStoreChange(e) {
  if (!document.getElementById('comicsGrid')) return;
  // Si ya cargamos desde Supabase, ignorar eventos de localStorage
  if (_homeWorks !== null) return;
  showFiltrosLevel1();
  renderComics();
}

function HomeView_init() {
  window.addEventListener('cx:store', _onStoreChange);
  window._homeStoreCleanup = () => window.removeEventListener('cx:store', _onStoreChange);

  setupPageNav();
  _loadPublishedWorks();  // carga desde Supabase y luego renderiza
}

async function _loadPublishedWorks() {
  const grid = document.getElementById('comicsGrid');
  if (grid) grid.innerHTML = '';

  if (typeof SupabaseClient === 'undefined' || typeof SupabaseClient.fetchPublishedWorks !== 'function') {
    _homeWorks = [];
    renderComics();
    return;
  }

  try {
    _homeWorks = await SupabaseClient.fetchPublishedWorks();
  } catch(e) {
    console.error('Error cargando obras:', e);
    _homeWorks = [];
  }
  renderComics();
}

// Ajusta la posición de la barra de página según la altura real de la cabecera

// ── MENÚ DE PÁGINA ──
function setupPageNav() {
  showFiltrosLevel1();

  const filtrosBtn  = document.getElementById('filtrosBtn');
  const filtrosMenu = document.getElementById('filtrosMenu');

  filtrosBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = filtrosMenu.classList.contains('open');
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    if (!isOpen) filtrosMenu.classList.add('open');
  });

  // PC: cerrar y resetear al salir con el ratón
  filtrosMenu?.addEventListener('mouseleave', () => {
    filtrosMenu.classList.remove('open');
    showFiltrosLevel1();
  });

  // Móvil + PC: cerrar al tocar/clicar fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
      showFiltrosLevel1(); // resetear nivel
    }
  });

  // Novedades: quita filtros, recarga datos frescos y scroll al top
  document.getElementById('novedadesBtn')?.addEventListener('click', () => {
    activeFilter = { type: null, value: null };
    setActiveBtn('novedadesBtn');
    updateFiltrosLabel();
    showFiltrosLevel1();
    _homeWorks = null;        // forzar recarga fresca desde Supabase
    _loadPublishedWorks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Crear
  document.getElementById('createBtn')?.addEventListener('click', () => {
    Router.go(Auth.isLogged() ? 'my-comics' : 'login');
  });
}

// ── MENÚ DE FILTROS: dos niveles ──
// Nivel 1: Género | Autor
// Nivel 2: listado del tipo seleccionado

function showFiltrosLevel1() {
  const menu = document.getElementById('filtrosMenu');
  if (!menu) return;
  menu.innerHTML = '';

  menu.appendChild(buildFilterItem(I18n.t('byGenre'), () => showFiltrosLevel2('genre'), false));
  menu.appendChild(buildFilterItem(I18n.t('byAuthor'),  () => showFiltrosLevel2('author'), false));
}

function showFiltrosLevel2(type) {
  const menu = document.getElementById('filtrosMenu');
  if (!menu) return;
  menu.innerHTML = '';

  const published = _homeWorks !== null ? _homeWorks : ComicStore.getPublished();

  // Normalizar texto: minúsculas sin acentos para comparación
  function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  const allItems = type === 'genre'
    ? [...new Set(published.map(c => c.genre).filter(Boolean))].sort((a,b) => genreLabel(a).localeCompare(genreLabel(b), 'es'))
    : [...new Set(published.map(c => c.username).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'es'));

  // Campo de búsqueda con icono lupa
  const searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'display:flex;align-items:center;padding:6px 10px;gap:6px;border-bottom:1px solid var(--gray-100)';
  const lupa = document.createElement('span');
  lupa.textContent = '🔍';
  lupa.style.cssText = 'font-size:.85rem;flex-shrink:0';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = type === 'genre' ? 'Género…' : 'Autor…';
  input.style.cssText = 'border:none;outline:none;font-family:var(--font-body);font-size:.85rem;font-weight:700;width:100%;background:transparent;color:var(--ink)';
  searchWrap.appendChild(lupa);
  searchWrap.appendChild(input);
  menu.appendChild(searchWrap);

  // Contenedor de items filtrados
  const itemsWrap = document.createElement('div');
  menu.appendChild(itemsWrap);

  function renderItems(filter) {
    const norm = normalize(filter);
    itemsWrap.innerHTML = '';
    const visible = norm
      ? allItems.filter(i => normalize(type === 'genre' ? genreLabel(i) : i).startsWith(norm))
      : allItems;
    if (!visible.length) {
      itemsWrap.appendChild(emptyItem(I18n.t(type === 'genre' ? 'noGenres' : 'noAuthors')));
      return;
    }
    visible.forEach(id => {
      const label    = type === 'genre' ? genreLabel(id) : id;
      const isActive = activeFilter.type === type && activeFilter.value === id;
      itemsWrap.appendChild(buildFilterItem(label, () => applyFilter(type, id), isActive));
    });
  }

  renderItems('');

  // Filtrar en tiempo real
  input.addEventListener('input', () => renderItems(input.value));
  // Foco automático al abrir
  requestAnimationFrame(() => input.focus());
}

function applyFilter(type, value) {
  activeFilter = { type, value };
  updateFiltrosLabel();
  setActiveBtn('filtrosBtn');
  renderComics();
  document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));

}

function buildFilterItem(label, onClick, isActive) {
  const item = document.createElement('a');
  item.className = 'dropdown-item' + (isActive ? ' active' : '');
  item.href = '#';
  item.textContent = label;
  item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
  return item;
}

function emptyItem(text) {
  const s = document.createElement('span');
  s.className = 'dropdown-item disabled-item';
  s.textContent = text;
  return s;
}

function updateFiltrosLabel() {
  const btn = document.getElementById('filtrosBtn');
  if (!btn) return;
  if (!activeFilter.type) {
    btn.textContent = I18n.t('filterBtn');
  } else if (activeFilter.type === 'genre') {
    btn.textContent = `${genreLabel(activeFilter.value)} ▾`;
  } else {
    btn.textContent = `${activeFilter.value} ▾`;
  }
}

function setActiveBtn(id) {
  document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.remove('active'));
  if (id) document.getElementById(id)?.classList.add('active');
}

// ── RENDER ──
function renderComics() {
  const grid  = document.getElementById('comicsGrid');
  const empty = document.getElementById('emptyState');
  if (!grid || !empty) return;
  grid.innerHTML = '';

  const source = _homeWorks !== null ? _homeWorks : ComicStore.getPublished();
  let comics = [...source].sort((a, b) => new Date(b.updatedAt||0) - new Date(a.updatedAt||0));

  if (activeFilter.type === 'genre') {
    comics = comics.filter(c => c.genre === activeFilter.value);
  } else if (activeFilter.type === 'author') {
    comics = comics.filter(c => c.username === activeFilter.value);
  }

  if (comics.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const currentUser = Auth.currentUser();
  comics.forEach(comic => {
    try { grid.appendChild(buildRow(comic, currentUser)); }
    catch(e) { console.error('buildRow error:', e, comic); }
  });
  // Recalcular padding tras render (especialmente con 1 sola ficha o tras publicar)
  if (typeof window._adjustSpacingNow === 'function') window._adjustSpacingNow();
}

// ── FILA ──
function buildRow(comic, currentUser) {
  const isOwner = typeof Auth !== 'undefined' ? Auth.canManage(comic) : (currentUser && (currentUser.id === comic.userId || currentUser.role === 'admin'));
  const thumb   = comic.panels?.[0]?.dataUrl || null;

  const row = document.createElement('div');
  row.className = 'comic-row';

  const thumbEl = document.createElement('div');
  thumbEl.className = 'comic-row-thumb';
  if (thumb) {
    const img = document.createElement('img');
    img.src = thumb; img.alt = comic.title || '';
    thumbEl.appendChild(img);
  } else {
    thumbEl.textContent = '🖼️';
  }

  const info = document.createElement('div');
  info.className = 'comic-row-info';

  const title = document.createElement('div');
  title.className = 'comic-row-title';
  title.textContent = comic.title || I18n.t('noWork');

  const meta = document.createElement('div');
  meta.className = 'comic-row-author';
  const genreBadge = comic.genre
    ? ` · <span class="genre-badge">${escHtml(genreLabel(comic.genre))}</span>` : '';
  if (comic.contactUrl) {
    meta.innerHTML = `${escHtml(comic.username || '')}${genreBadge} · <a href="${escHtml(comic.contactUrl)}" target="_blank">Contacto</a>`;
  } else {
    meta.innerHTML = escHtml(comic.username || '') + genreBadge;
  }

  const actions = document.createElement('div');
  actions.className = 'comic-row-actions';

  const readBtn = document.createElement('a');
  readBtn.className = 'comic-row-btn';
  readBtn.href = '#';
  readBtn.onclick = (e) => {
    e.preventDefault();
    // Obras publicadas: usar el reproductor externo embebido en modal
    if (comic.supabaseId && comic.published) {
      window.location = 'reader/?id=' + comic.supabaseId;
    } else {
      // Sin supabaseId: visor interno del SPA (obra local)
      Router.go('reader', { id: comic.id });
    }
  };
  readBtn.textContent = I18n.t('read');
  actions.appendChild(readBtn);

  if (isOwner) {
    const editBtn = document.createElement('a');
    editBtn.className = 'comic-row-btn edit';
    editBtn.href = '#'; editBtn.onclick = (e) => { e.preventDefault(); Router.go('editor', { id: comic.id }); };
    editBtn.textContent = I18n.t('edit');
    actions.appendChild(editBtn);

    const unpubBtn = document.createElement('button');
    unpubBtn.className = 'comic-row-btn unpub';
    unpubBtn.textContent = I18n.t('unpublish');
    unpubBtn.addEventListener('click', () => {
      if (confirm(I18n.t('confirmUnpublish'))) {
        comic.published = false;
        ComicStore.save(comic);
        showFiltrosLevel1();
        renderComics();
        showToast(I18n.t('unpublishOk'));
      }
    });
    actions.appendChild(unpubBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'comic-row-btn del';
    delBtn.style.color = '#e63030';
    delBtn.style.fontWeight = '900';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      if (confirm(I18n.t('confirmDelete'))) {
        ComicStore.remove(comic.id);
        showFiltrosLevel1();
        renderComics();
        showToast(I18n.t('deleteOk'));
      }
    });
    actions.appendChild(delBtn);
  }

  info.appendChild(title);
  info.appendChild(meta);
  info.appendChild(actions);
  row.appendChild(thumbEl);
  row.appendChild(info);
  return row;
}

// ── MODAL READER EMBED (expositor) ──────────────────────────
function _openReaderModal(url) {
  let overlay = document.getElementById('homeReaderModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'homeReaderModal';
    overlay.className = 'reader-modal';
    overlay.innerHTML = `
      <div class="reader-modal-inner">
        <iframe class="reader-modal-frame" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(overlay);

    // Cerrar al clicar fuera del iframe
    overlay.addEventListener('click', e => { if (e.target === overlay) closeReaderModalGlobal(); });

    // Escuchar mensajes del iframe
    window.addEventListener('message', e => {
      if (e.data?.type === 'reader:close')      closeReaderModalGlobal();
      if (e.data?.type === 'reader:fullscreen') {
        const frame = overlay.querySelector('.reader-modal-frame');
        if (!frame) return;
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (isFs) {
          (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
        } else {
          const req = frame.requestFullscreen || frame.webkitRequestFullscreen;
          if (req) req.call(frame, { navigationUI: 'hide' }).catch(() => {});
        }
      }
    });
  }
  const frame = overlay.querySelector('.reader-modal-frame');
  frame.src = url;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Recordar si la app estaba en fullscreen antes de abrir el reader
  overlay._wasFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
  // Dar foco al iframe para que las teclas funcionen sin clic previo
  frame.addEventListener('load', () => frame.focus(), { once: true });
}

function closeReaderModalGlobal() {
  const overlay = document.getElementById('homeReaderModal');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.querySelector('.reader-modal-frame').src = '';
  document.body.style.overflow = '';
  const wasFs = overlay._wasFullscreen;
  overlay._wasFullscreen = false;
  const nowFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (nowFs && !wasFs) {
    // El reader activó fullscreen — salir
    (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
  } else if (!nowFs && wasFs) {
    // La app estaba en fullscreen antes — restaurar
    if (typeof Fullscreen !== 'undefined') Fullscreen.enter();
  }
  // Resincronizar botón (con pequeño delay para que el estado FS se actualice)
  setTimeout(() => { if (typeof Fullscreen !== 'undefined') Fullscreen._updateBtn(); }, 200);
}

// Cerrar modal con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('homeReaderModal');
    if (overlay && !overlay.classList.contains('hidden')) { e.stopPropagation(); closeReaderModalGlobal(); }
  }
});
