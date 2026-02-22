/* ============================================================
   home.js — Lógica de la página de inicio
   ============================================================ */

let activeGenre = null; // null = todos

document.addEventListener('DOMContentLoaded', () => {
  renderComics();
  setupPageNav();
});

// ── MENÚ DE PÁGINA ──
function setupPageNav() {

  // Filtros: poblar con géneros disponibles
  buildFiltrosMenu();

  const filtrosBtn  = document.getElementById('filtrosBtn');
  const filtrosMenu = document.getElementById('filtrosMenu');
  filtrosBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = filtrosMenu.classList.contains('open');
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    if (!isOpen) filtrosMenu.classList.add('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    }
  });

  // Novedades: scroll al top, quitar filtro de género
  document.getElementById('novedadesBtn')?.addEventListener('click', () => {
    activeGenre = null;
    setActiveBtn('novedadesBtn');
    updateFiltrosLabel();
    renderComics();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Crear
  document.getElementById('createBtn')?.addEventListener('click', () => {
    window.location.href = Auth.isLogged()
      ? 'pages/editor.html'
      : 'pages/login.html?redirect=editor';
  });
}

function buildFiltrosMenu() {
  const menu = document.getElementById('filtrosMenu');
  if (!menu) return;

  // Géneros que realmente tienen cómics publicados
  const published = ComicStore.getPublished();
  const usedIds   = [...new Set(published.map(c => c.genre).filter(Boolean))];

  menu.innerHTML = '';

  // Opción "Todos"
  const allItem = document.createElement('a');
  allItem.className = 'dropdown-item' + (activeGenre === null ? ' active' : '');
  allItem.href = '#';
  allItem.textContent = 'Todos';
  allItem.addEventListener('click', (e) => {
    e.preventDefault();
    activeGenre = null;
    updateFiltrosLabel();
    setActiveBtn(null);
    renderComics();
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
  });
  menu.appendChild(allItem);

  if (usedIds.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'dropdown-item disabled-item';
    empty.textContent = 'Sin géneros disponibles';
    menu.appendChild(empty);
    return;
  }

  const divider = document.createElement('div');
  divider.className = 'dropdown-divider';
  menu.appendChild(divider);

  // Un item por género usado
  usedIds.forEach(id => {
    const label = genreLabel(id);
    const item  = document.createElement('a');
    item.className = 'dropdown-item' + (activeGenre === id ? ' active' : '');
    item.href = '#';
    item.textContent = label;
    item.addEventListener('click', (e) => {
      e.preventDefault();
      activeGenre = id;
      updateFiltrosLabel();
      setActiveBtn('filtrosBtn');
      renderComics();
      document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    });
    menu.appendChild(item);
  });
}

function updateFiltrosLabel() {
  const btn = document.getElementById('filtrosBtn');
  if (!btn) return;
  btn.textContent = activeGenre ? `${genreLabel(activeGenre)} ▾` : 'Filtros ▾';
}

function setActiveBtn(id) {
  document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.remove('active'));
  if (id) document.getElementById(id)?.classList.add('active');
}

// ── RENDER ──
function renderComics() {
  const grid  = document.getElementById('comicsGrid');
  const empty = document.getElementById('emptyState');
  grid.querySelectorAll('.comic-row').forEach(el => el.remove());

  let comics = [...ComicStore.getPublished()]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  if (activeGenre) {
    comics = comics.filter(c => c.genre === activeGenre);
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
  const isOwner = currentUser && (currentUser.id === comic.userId || currentUser.role === 'admin');
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
  title.textContent = comic.title || 'Sin título';

  const meta = document.createElement('div');
  meta.className = 'comic-row-author';
  const genreBadge = comic.genre ? ` · <span class="genre-badge">${escHtml(genreLabel(comic.genre))}</span>` : '';
  if (comic.contactUrl) {
    meta.innerHTML = `${escHtml(comic.username || '')}${genreBadge} · <a href="${escHtml(comic.contactUrl)}" target="_blank">Contacto</a>`;
  } else {
    meta.innerHTML = escHtml(comic.username || '') + genreBadge;
  }

  const actions = document.createElement('div');
  actions.className = 'comic-row-actions';

  const readBtn = document.createElement('a');
  readBtn.className = 'comic-row-btn';
  readBtn.href = `pages/reader.html?id=${comic.id}`;
  readBtn.textContent = 'Leer';
  actions.appendChild(readBtn);

  if (isOwner) {
    const editBtn = document.createElement('a');
    editBtn.className = 'comic-row-btn edit';
    editBtn.href = `pages/editor.html?id=${comic.id}`;
    editBtn.textContent = 'Editar';
    actions.appendChild(editBtn);

    const unpubBtn = document.createElement('button');
    unpubBtn.className = 'comic-row-btn unpub';
    unpubBtn.textContent = 'Dejar de publicar';
    unpubBtn.addEventListener('click', () => {
      if (confirm('¿Retirar este cómic del índice?\n\nPodrás seguir editándolo desde "Crear" → "Mis cómics".')) {
        comic.published = false;
        ComicStore.save(comic);
        buildFiltrosMenu();
        renderComics();
        showToast('Cómic retirado del índice');
      }
    });
    actions.appendChild(unpubBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'comic-row-btn del';
    delBtn.textContent = 'Eliminar';
    delBtn.addEventListener('click', () => {
      if (confirm('Si eliminas este proyecto, ya no podrás acceder a él.\n\nSi solo quieres que no esté publicado pero quieres seguir editándolo, elige "Dejar de publicar".')) {
        ComicStore.remove(comic.id);
        buildFiltrosMenu();
        renderComics();
        showToast('Cómic eliminado');
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

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
