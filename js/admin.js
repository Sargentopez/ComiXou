/* ============================================================
   admin.js — Panel de administración
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Solo admins
  if (!Auth.isAdmin()) {
    window.location.href = '../index.html';
    return;
  }

  renderTab('pending');
  setupTabs();
});

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
  if (tab === 'users')     renderUsers(panel);
}

// ── PENDIENTES DE APROBACIÓN ──
function renderPending(panel) {
  const comics = ComicStore.getAll().filter(c => !c.published && !c.approved && c.pendingReview);
  if (comics.length === 0) {
    panel.innerHTML = `<p class="admin-empty">${I18n.t('noPending')}</p>`;
    return;
  }
  comics.forEach(comic => panel.appendChild(buildAdminRow(comic, 'pending')));
}

// ── PUBLICADOS ──
function renderPublished(panel) {
  const comics = ComicStore.getPublished();
  if (comics.length === 0) {
    panel.innerHTML = `<p class="admin-empty">${I18n.t('noPublished')}</p>`;
    return;
  }
  comics.forEach(comic => panel.appendChild(buildAdminRow(comic, 'published')));
}

// ── USUARIOS ──
function renderUsers(panel) {
  const users = JSON.parse(localStorage.getItem('cs_users') || '{}');
  const list  = Object.values(users);
  if (list.length === 0) {
    panel.innerHTML = `<p class="admin-empty">${I18n.t('noUsers')}</p>`;
    return;
  }
  list.forEach(user => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-info">
        <span class="admin-row-title">${escHtml(user.username)}</span>
        <span class="admin-row-meta">${escHtml(user.email)} · ${user.role || 'user'}</span>
      </div>
      <div class="admin-row-actions">
        ${user.role !== 'admin' ? `<button class="admin-btn admin-btn-warn" data-uid="${user.id}" data-email="${escHtml(user.email)}" id="delUser_${user.id}">Eliminar</button>` : '<span class="admin-badge">Admin</span>'}
      </div>`;
    row.querySelector(`#delUser_${user.id}`)?.addEventListener('click', () => {
      if (confirm(I18n.t('confirmDeleteUser') ? I18n.t('confirmDeleteUser').replace('{name}', user.username) : `¿Eliminar ${user.username}?`)) {
        ComicStore.getByUser(user.id).forEach(c => ComicStore.remove(c.id));
        const users2 = JSON.parse(localStorage.getItem('cs_users') || '{}');
        delete users2[user.email];
        localStorage.setItem('cs_users', JSON.stringify(users2));
        showToast(I18n.t('userDeleted'));
        renderTab('users');
      }
    });
    panel.appendChild(row);
  });
}

// ── FILA DE CÓMIC EN ADMIN ──
function buildAdminRow(comic, mode) {
  const row = document.createElement('div');
  row.className = 'admin-row';

  const thumb = comic.panels?.[0]?.dataUrl
    ? `<img src="${comic.panels[0].dataUrl}" class="admin-thumb" alt="">`
    : `<div class="admin-thumb admin-thumb-empty">🖼️</div>`;

  row.innerHTML = `
    <div class="admin-row-thumb">${thumb}</div>
    <div class="admin-row-info">
      <span class="admin-row-title">${escHtml(comic.title || 'Sin título')}</span>
      <span class="admin-row-meta">${I18n.t('by')} ${escHtml(comic.username || '')} · ${comic.panels?.length || 0} ${(comic.panels?.length || 0) !== 1 ? I18n.t('panelsWord') : I18n.t('panelWord')}</span>
      <span class="admin-row-meta">${new Date(comic.createdAt).toLocaleDateString('es')}</span>
    </div>
    <div class="admin-row-actions">
      ${mode === 'pending' ? `<button class="admin-btn admin-btn-ok" id="approve_${comic.id}">✓ Aprobar</button>` : ''}
      ${mode === 'published' ? `<button class="admin-btn admin-btn-warn" id="unpub_${comic.id}">Retirar</button>` : ''}
      <button class="admin-btn admin-btn-del" id="del_${comic.id}">Eliminar</button>
    </div>`;

  row.querySelector(`#approve_${comic.id}`)?.addEventListener('click', () => {
    const c = ComicStore.getById(comic.id);
    c.approved = true; c.published = true; c.pendingReview = false;
    ComicStore.save(c);
    showToast(I18n.t('approveOk'));
    renderTab('pending');
  });

  row.querySelector(`#unpub_${comic.id}`)?.addEventListener('click', () => {
    const c = ComicStore.getById(comic.id);
    c.published = false;
    ComicStore.save(c);
    showToast(I18n.t('retireOk'));
    renderTab('published');
  });

  row.querySelector(`#del_${comic.id}`)?.addEventListener('click', () => {
    if (confirm(I18n.t('confirmDelete'))) {
      ComicStore.remove(comic.id);
      showToast(I18n.t('workDeleted'));
      renderTab(mode);
    }
  });

  return row;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
