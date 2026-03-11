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
  if (grid) grid.innerHTML = '<p style="padding:1rem;color:#888">Paso 1: iniciando...</p>';

  if (typeof SupabaseClient === 'undefined' || typeof SupabaseClient.fetchPublishedWorks !== 'function') {
    if (grid) grid.innerHTML = '<p style="padding:1rem;color:#c00">Error: SupabaseClient no disponible</p>';
    _homeWorks = [];
    renderComics();
    return;
  }

  if (grid) grid.innerHTML = '<p style="padding:1rem;color:#888">Paso 2: llamando a Supabase...</p>';

  let result;
  try {
    result = await SupabaseClient.fetchPublishedWorks();
  } catch(e) {
    if (grid) grid.innerHTML = `<p style="padding:1rem;color:#c00">Error fetch: ${e.message}</p>`;
    _homeWorks = [];
    renderComics();
    return;
  }

  if (grid) grid.innerHTML = `<p style="padding:1rem;color:#080">Paso 3: recibidas ${result.length} obras</p>`;
  _homeWorks = result;

  setTimeout(() => renderComics(), 800); // pequeña pausa para ver el mensaje
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



  if (type === 'genre') {
    const items = [...new Set(published.map(c => c.genre).filter(Boolean))].sort((a,b) => genreLabel(a).localeCompare(genreLabel(b), 'es'));
    if (items.length === 0) {
      menu.appendChild(emptyItem(I18n.t('noGenres')));
    } else {
      items.forEach(id => {
        const isActive = activeFilter.type === 'genre' && activeFilter.value === id;
        menu.appendChild(buildFilterItem(genreLabel(id), () => applyFilter('genre', id), isActive));
      });
    }
  } else {
    const items = [...new Set(published.map(c => c.username).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'es'));
    if (items.length === 0) {
      menu.appendChild(emptyItem(I18n.t('noAuthors')));
    } else {
      items.forEach(username => {
        const isActive = activeFilter.type === 'author' && activeFilter.value === username;
        menu.appendChild(buildFilterItem(username, () => applyFilter('author', username), isActive));
      });
    }
  }
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
  grid.innerHTML = ''; // limpiar todo, incluido "Cargando..."

  // Usar obras de Supabase si están disponibles; fallback a localStorage
  const source = _homeWorks !== null ? _homeWorks : ComicStore.getPublished();
  let comics = [...source].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

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
  comics.forEach(comic => grid.appendChild(buildRow(comic, currentUser)));
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
      _openReaderModal(`reader/?id=${comic.supabaseId}&embed=1`);
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
        <button class="reader-modal-close" aria-label="Cerrar">✕</button>
        <iframe class="reader-modal-frame" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.reader-modal-close').addEventListener('click', _closeReaderModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeReaderModal(); });
    window.addEventListener('message', e => {
      if (e.data?.type === 'reader:close') _closeReaderModal();
    });
  }
  overlay.querySelector('.reader-modal-frame').src = url;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function _closeReaderModal() {
  const overlay = document.getElementById('homeReaderModal');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.querySelector('.reader-modal-frame').src = '';
  document.body.style.overflow = '';
}
