/* ============================================================
   home.js — Lógica de la página de inicio
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  renderComics('all');
  setupPageNav();
});

function setupPageNav() {
  // ── Filtros (desplegable) ──
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

  // ── Novedades ──
  document.getElementById('novedadesBtn')?.addEventListener('click', () => {
    setActive('novedadesBtn');
    renderComics('recent');
  });

  // ── Crear ──
  document.getElementById('createBtn')?.addEventListener('click', () => {
    window.location.href = Auth.isLogged()
      ? 'pages/editor.html'
      : 'pages/login.html?redirect=editor';
  });
}

function setActive(btnId) {
  document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(btnId)?.classList.add('active');
}

function renderComics(filter = 'all') {
  const grid  = document.getElementById('comicsGrid');
  const empty = document.getElementById('emptyState');
  grid.querySelectorAll('.comic-row').forEach(el => el.remove());

  // Siempre ordenar de más reciente a más antiguo
  let comics = [...ComicStore.getPublished()]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  // Novedades: scroll al top además del orden (ya es el mismo)
  if (filter === 'recent') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (comics.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const currentUser = Auth.currentUser();
  comics.forEach(comic => grid.appendChild(buildRow(comic, currentUser)));
}

function buildRow(comic, currentUser) {
  const isOwner    = currentUser && (currentUser.id === comic.userId || currentUser.role === 'admin');
  const firstPanel = comic.panels?.[0];
  const thumbSrc   = firstPanel?.dataUrl || null;

  const row = document.createElement('div');
  row.className = 'comic-row';

  const thumb = document.createElement('div');
  thumb.className = 'comic-row-thumb';
  if (thumbSrc) {
    const img = document.createElement('img');
    img.src = thumbSrc; img.alt = comic.title || '';
    thumb.appendChild(img);
  } else {
    thumb.textContent = '🖼️';
  }

  const info   = document.createElement('div');
  info.className = 'comic-row-info';

  const title  = document.createElement('div');
  title.className = 'comic-row-title';
  title.textContent = comic.title || 'Sin título';

  const author = document.createElement('div');
  author.className = 'comic-row-author';
  if (comic.contactUrl) {
    author.innerHTML = `${escHtml(comic.username || '')} · <a href="${escHtml(comic.contactUrl)}" target="_blank">Contacto</a>`;
  } else {
    author.textContent = comic.username || '';
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
        renderComics();
        showToast('Cómic eliminado');
      }
    });
    actions.appendChild(delBtn);
  }

  info.appendChild(title);
  info.appendChild(author);
  info.appendChild(actions);
  row.appendChild(thumb);
  row.appendChild(info);
  return row;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
