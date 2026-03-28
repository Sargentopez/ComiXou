/* ============================================================
   admin.js — Panel de administración
   ============================================================ */

function AdminView_init() {
  if (!Auth.isAdmin()) { Router.go('home'); return; }
  // Ajustar top del sticky tabs con la altura real del header
  const hdr = document.getElementById('siteHeader');
  const tabs = document.querySelector('.admin-tabs');
  if (hdr && tabs) tabs.style.top = hdr.getBoundingClientRect().height + 'px';
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
  if (tab === 'users')     renderUsers(panel);  // async — se muestra "Cargando…" internamente
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
async function renderUsers(panel) {
  panel.innerHTML = `<p class="admin-empty">Cargando usuarios…</p>`;
  let list = [];
  try {
    const SB_URL = 'https://qqgsbyylaugsagbxsetc.supabase.co';
    const SB_KEY = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';
    const res = await fetch(
      `${SB_URL}/rest/v1/authors?select=id,username,email,role&order=role.asc,username.asc`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    if (res.ok) list = await res.json();
  } catch (_) {}

  // Fallback: usuarios fijos si Supabase no devuelve nada
  if (!list.length) {
    list = [
      { id: 'u_admin',   username: 'Admin',   email: 'admin@comixow.com', role: 'admin'  },
      { id: 'u_macario', username: 'Macario', email: 'macario@yo.com',    role: 'author' },
    ];
  }

  panel.innerHTML = '';
  if (!list.length) { panel.innerHTML = `<p class="admin-empty">${I18n.t('noUsers')}</p>`; return; }

  list.forEach(user => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-info">
        <span class="admin-row-title">${escHtml(user.username || '')}</span>
        <span class="admin-row-meta">${escHtml(user.email || '')} · ${user.role || 'user'}</span>
      </div>
      <div class="admin-row-actions">
        ${user.role !== 'admin'
          ? `<button class="admin-btn admin-btn-del" data-uid="${user.id}" data-email="${escHtml(user.email)}">Eliminar</button>`
          : '<span class="admin-badge">Admin</span>'}
      </div>`;
    row.querySelector('[data-uid]')?.addEventListener('click', function() {
      const uid   = this.dataset.uid;
      const uname = user.username;
      const btn = this;
      appConfirm(`¿Eliminar usuario ${uname}? Se eliminarán también todas sus obras.`, async ()=>{
        btn.disabled = true; btn.textContent = '…';
        try {
          // Borrar obras y perfil de Supabase
          if (typeof SupabaseClient !== 'undefined') {
            await SupabaseClient.deleteAuthorData(uid);
          }
          // Borrar obras locales
          ComicStore.getByUser(uid).forEach(c => ComicStore.remove(c.id));
          showToast(I18n.t('userDeleted') + ' — Recuerda borrar también el usuario en Supabase Auth');
        } catch(e) {
          console.warn('deleteAuthorData error:', e);
          showToast('Error al eliminar: ' + e.message);
          btn.disabled = false; btn.textContent = 'Eliminar';
          return;
        }
        renderTab('users');
      });
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
    const param = comic.published ? `id=${sid}` : `draft=${sid}`;
    window.location = 'reader/?' + param + '&from=app';
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
  row.querySelector(`#del_${comic.id}`)?.addEventListener('click', () => {
    const title = comic.title || 'Sin título';
    appConfirm(`¿Eliminar "${title}" permanentemente?\nSe eliminará de la base de datos y no podrá recuperarse.`, async ()=>{
      if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
        try {
          await SupabaseClient.deleteWork(comic.supabaseId);
        } catch(err) { console.warn('Supabase deleteWork:', err); }
      }
      ComicStore.remove(comic.id);
      showToast(I18n.t('workDeleted') || 'Obra eliminada');
      renderTab(mode); // refresco inmediato
    });
  });

  return row;
}

// ── MODAL READER EMBED ─────────────────────────────────────
function openReaderModal(url) {
  let overlay = document.getElementById('readerModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'readerModal';
    overlay.className = 'reader-modal';
    overlay.innerHTML = `
      <div class="reader-modal-inner">
        <iframe id="readerModalFrame" class="reader-modal-frame" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) closeReaderModal(); });

    window.addEventListener('message', e => {
      if (e.data?.type === 'reader:close') closeReaderModal();
      if (e.data?.type === 'reader:fullscreen') {
        const frame = document.getElementById('readerModalFrame');
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
  // Recordar estado de fullscreen previo
  overlay._wasFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);

  const frame = document.getElementById('readerModalFrame');
  frame.src = url;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  frame.addEventListener('load', () => frame.focus(), { once: true });
}

function closeReaderModal() {
  const overlay = document.getElementById('readerModal');
  if (!overlay) return;
  overlay.classList.add('hidden');
  document.getElementById('readerModalFrame').src = '';
  document.body.style.overflow = '';
  const wasFs = overlay._wasFullscreen;
  overlay._wasFullscreen = false;
  const nowFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (nowFs && !wasFs) {
    (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
  } else if (!nowFs && wasFs) {
    if (typeof Fullscreen !== 'undefined') Fullscreen.enter();
  }
  setTimeout(() => { if (typeof Fullscreen !== 'undefined') Fullscreen._updateBtn(); }, 200);
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Cerrar modal reader con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('readerModal');
    if (overlay && !overlay.classList.contains('hidden')) { e.stopPropagation(); closeReaderModal(); }
  }
});
