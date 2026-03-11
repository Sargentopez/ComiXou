/* ============================================================
   admin.js — Panel de administración
   ============================================================ */

function AdminView_init() {
  if (!Auth.isAdmin()) { Router.go('home'); return; }
  renderTab('pending');
  setupTabs();
}

function setupTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTab(tab.dataset.tab);
    });
  });
}

function renderTab(tab) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById(`tab${capitalize(tab)}`);
  panel.classList.remove('hidden');
  panel.innerHTML = '';
  if (tab === 'pending')   renderPending(panel);
  if (tab === 'published') renderPublished(panel);
  if (tab === 'all')       renderAll(panel);
  if (tab === 'users')     renderUsers(panel);
}

// ── PENDIENTES ──
async function renderPending(panel) {
  panel.innerHTML = `<p class="admin-empty">Cargando...</p>`;
  try {
    const comics = await SupabaseClient.fetchPendingWorks();
    panel.innerHTML = '';
    if (!comics.length) { panel.innerHTML = `<p class="admin-empty">${I18n.t('noPending')}</p>`; return; }
    comics.forEach(c => panel.appendChild(buildAdminRow(c, 'pending')));
  } catch(e) {
    panel.innerHTML = `<p class="admin-empty">Error al cargar obras pendientes.</p>`;
    console.error(e);
  }
}

// ── PUBLICADOS ──
async function renderPublished(panel) {
  panel.innerHTML = `<p class="admin-empty">Cargando...</p>`;
  try {
    const comics = await SupabaseClient.fetchPublishedWorks();
    panel.innerHTML = '';
    if (!comics.length) { panel.innerHTML = `<p class="admin-empty">${I18n.t('noPublished')}</p>`; return; }
    comics.forEach(c => panel.appendChild(buildAdminRow(c, 'published')));
  } catch(e) {
    panel.innerHTML = `<p class="admin-empty">Error al cargar obras publicadas.</p>`;
    console.error(e);
  }
}

// ── TODAS (incluye no publicadas con supabaseId — en BD pero no visibles) ──
function renderAll(panel) {
  const comics = ComicStore.getAll().filter(c => c.supabaseId);
  if (!comics.length) { panel.innerHTML = `<p class="admin-empty">No hay obras en la base de datos.</p>`; return; }
  comics.forEach(c => panel.appendChild(buildAdminRow(c, 'all')));
}

// ── USUARIOS ──
function renderUsers(panel) {
  const users = JSON.parse(localStorage.getItem('cs_users') || '{}');
  const list  = Object.values(users);
  if (!list.length) { panel.innerHTML = `<p class="admin-empty">${I18n.t('noUsers')}</p>`; return; }
  list.forEach(user => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-info">
        <span class="admin-row-title">${escHtml(user.username)}</span>
        <span class="admin-row-meta">${escHtml(user.email)} · ${user.role || 'user'}</span>
      </div>
      <div class="admin-row-actions">
        ${user.role !== 'admin'
          ? `<button class="admin-btn admin-btn-del" id="delUser_${user.id}">Eliminar</button>`
          : '<span class="admin-badge">Admin</span>'}
      </div>`;
    row.querySelector(`#delUser_${user.id}`)?.addEventListener('click', () => {
      const name = user.username;
      if (!confirm(`¿Eliminar usuario ${name}? Se eliminarán también todas sus obras.`)) return;
      ComicStore.getByUser(user.id).forEach(c => {
        if (c.supabaseId && typeof SupabaseClient !== 'undefined')
          SupabaseClient.deleteWork(c.supabaseId).catch(e => console.warn(e));
        ComicStore.remove(c.id);
      });
      const users2 = JSON.parse(localStorage.getItem('cs_users') || '{}');
      delete users2[user.email];
      localStorage.setItem('cs_users', JSON.stringify(users2));
      showToast(I18n.t('userDeleted'));
      renderTab('users');
    });
    panel.appendChild(row);
  });
}

// ── FILA DE OBRA EN ADMIN ──
function buildAdminRow(comic, mode) {
  const row = document.createElement('div');
  row.className = 'admin-row';

  const thumb = comic.panels?.[0]?.dataUrl
    ? `<img src="${comic.panels[0].dataUrl}" class="admin-thumb" alt="">`
    : `<div class="admin-thumb admin-thumb-empty">🖼️</div>`;

  const sbBadge = comic.supabaseId
    ? `<span class="admin-badge-sb" title="ID Supabase: ${comic.supabaseId}">☁️ BD</span>`
    : `<span class="admin-badge-sb admin-badge-nosb" title="Sin ID Supabase">⚠️ Sin BD</span>`;

  row.innerHTML = `
    <div class="admin-row-thumb">${thumb}</div>
    <div class="admin-row-info">
      <span class="admin-row-title">${escHtml(comic.title || 'Sin título')} ${sbBadge}</span>
      <span class="admin-row-meta">${I18n.t('by')} ${escHtml(comic.username || '')} · ${comic.panels?.length || 0} págs.</span>
      <span class="admin-row-meta">${new Date(comic.createdAt || Date.now()).toLocaleDateString('es')}</span>
    </div>
    <div class="admin-row-actions">
      ${comic.supabaseId ? `<button class="admin-btn admin-btn-read" id="read_${comic.id}">👁 Leer</button>` : ''}
      ${mode === 'pending'   ? `<button class="admin-btn admin-btn-ok"   id="approve_${comic.id}">✓ Aprobar</button>`  : ''}
      ${mode === 'published' ? `<button class="admin-btn admin-btn-warn" id="unpub_${comic.id}">Retirar</button>`      : ''}
      <button class="admin-btn admin-btn-del" id="del_${comic.id}">Eliminar</button>
    </div>`;

  // Leer (embed reader en modal)
  row.querySelector(`#read_${comic.id}`)?.addEventListener('click', () => {
    const sid = comic.supabaseId;
    // Borradores (no publicados): usar ?draft=. Publicados: usar ?id=
    const param = comic.published ? `id=${sid}` : `draft=${sid}`;
    // Construir URL del reader de forma robusta usando origin+pathname (sin hash).
    // pathname en GitHub Pages = /ComiXou/index.html o /ComiXou/
    const base = (window.location.origin + window.location.pathname)
      .replace(/\/index\.html$/, '')
      .replace(/\/$/, '');
    openReaderModal(`${base}/reader/?${param}&embed=1`);
  });

  // Aprobar
  row.querySelector(`#approve_${comic.id}`)?.addEventListener('click', async () => {
    // Intentar obtener de localStorage; si no existe, usar el objeto comic de Supabase
    const c = ComicStore.getById(comic.id) || comic;

    if (!c.supabaseId) {
      showToast('⚠️ Esta obra no tiene ID en la base de datos. Pide al autor que la vuelva a publicar.');
      return;
    }

    if (typeof SupabaseClient !== 'undefined') {
      try {
        await SupabaseClient.approveWork(c);
      } catch(err) {
        console.error('Supabase approveWork:', err);
        showToast('⚠️ Error al aprobar en la base de datos: ' + err.message);
        return;
      }
    }
    // Actualizar localStorage solo si existe entrada local
    const local = ComicStore.getById(comic.id);
    if (local) {
      local.approved = true; local.published = true; local.pendingReview = false;
      ComicStore.save(local);
    }
    showToast(I18n.t('approveOk'));
    renderTab('pending');
  });

  // Retirar
  row.querySelector(`#unpub_${comic.id}`)?.addEventListener('click', async () => {
    if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
      try {
        await SupabaseClient.unpublishWork(comic.id, comic.supabaseId);
      } catch(err) { console.warn('Supabase unpublishWork:', err); }
    }
    const local = ComicStore.getById(comic.id);
    if (local) { local.published = false; local.approved = false; ComicStore.save(local); }
    showToast(I18n.t('retireOk'));
    renderTab('published');
  });

  // Eliminar (de localStorage Y de Supabase)
  row.querySelector(`#del_${comic.id}`)?.addEventListener('click', async () => {
    const title = comic.title || 'Sin título';
    if (!confirm(`¿Eliminar "${title}" permanentemente?\nSe eliminará de la base de datos y no podrá recuperarse.`)) return;
    if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
      try {
        await SupabaseClient.deleteWork(comic.supabaseId);
      } catch(err) { console.warn('Supabase deleteWork:', err); }
    }
    ComicStore.remove(comic.id);
    showToast(I18n.t('workDeleted') || 'Obra eliminada');
    renderTab(mode); // refresco inmediato
  });

  return row;
}

// ── MODAL READER EMBED ─────────────────────────────────────
function openReaderModal(url) {
  // Crear overlay si no existe
  let overlay = document.getElementById('readerModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'readerModal';
    overlay.className = 'reader-modal';
    overlay.innerHTML = `
      <div class="reader-modal-inner">
        <button class="reader-modal-close" id="readerModalClose" aria-label="Cerrar">✕</button>
        <iframe id="readerModalFrame" class="reader-modal-frame" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#readerModalClose').addEventListener('click', closeReaderModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeReaderModal(); });

    // Escuchar mensaje del reader cuando pulsa cerrar dentro del iframe
    window.addEventListener('message', e => {
      if (e.data?.type === 'reader:close') closeReaderModal();
    });
  }

  overlay.querySelector('#readerModalFrame').src = url;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeReaderModal() {
  const overlay = document.getElementById('readerModal');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.querySelector('#readerModalFrame').src = '';
  document.body.style.overflow = '';
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
