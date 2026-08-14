/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
/*
 * Librerías y código de terceros utilizados en este proyecto:
 *
 * - omggif (GIF encoder/decoder)
 *     Autor: Dean McNamee <dean@gmail.com>
 *     Licencia: MIT
 *     https://github.com/deanm/omggif
 *
 * - pako (compresión zlib/gzip)
 *     Autores: Andrei Tuputcyn, Vitaly Puzrin y colaboradores (Nodeca project)
 *     Licencia: MIT
 *     https://github.com/nodeca/pako
 *
 * - UPNG.js (codificador/decodificador PNG)
 *     Autor: Ivan Kutskir
 *     Licencia: MIT
 *     https://github.com/photopea/UPNG.js
 *
 * - LZW decompression (puerto JavaScript de implementación Java)
 *     Referencia original: https://gist.github.com/devunwired/4479231
 *     Licencia: dominio público / uso libre
 *
 * - Trix (editor de texto enriquecido)
 *     Autor: 37signals, LLC (Basecamp) — Javan Makhmali y Sam Stephenson
 *     Licencia: MIT
 *     https://trix-editor.org/  ·  https://github.com/basecamp/trix
 */
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
  panel.innerHTML = `<p class="admin-empty">${I18n.t('admin_loading')}</p>`;
  try {
    const comics = await SupabaseClient.fetchPendingWorks();
    panel.innerHTML = '';
    if (!comics.length) { panel.innerHTML = `<p class="admin-empty">${I18n.t('noPending')}</p>`; return; }
    comics.forEach(c => panel.appendChild(buildAdminRow(c, 'pending')));
  } catch(e) {
    panel.innerHTML = `<p class="admin-empty">${I18n.t('admin_errLoadPending')}</p>`;
    console.error(e);
  }
}

// ── PUBLICADOS ──
async function renderPublished(panel) {
  panel.innerHTML = `<p class="admin-empty">${I18n.t('admin_loading')}</p>`;
  try {
    const comics = await SupabaseClient.fetchPublishedWorks();
    panel.innerHTML = '';
    if (!comics.length) { panel.innerHTML = `<p class="admin-empty">${I18n.t('noPublished')}</p>`; return; }
    comics.forEach(c => panel.appendChild(buildAdminRow(c, 'published')));
  } catch(e) {
    panel.innerHTML = `<p class="admin-empty">${I18n.t('admin_errLoadPublished')}</p>`;
    console.error(e);
  }
}

// ── TODAS (incluye no publicadas con supabaseId — en BD pero no visibles) ──
function renderAll(panel) {
  const comics = WorkStore.getAll().filter(c => c.supabaseId);
  if (!comics.length) { panel.innerHTML = `<p class="admin-empty">${I18n.t('admin_noAll')}</p>`; return; }
  comics.forEach(c => panel.appendChild(buildAdminRow(c, 'all')));
}

// ── USUARIOS ──
async function renderUsers(panel) {
  panel.innerHTML = `<p class="admin-empty">${I18n.t('admin_loadingUsers')}</p>`;
  let list = [];
  try {
    // SupabaseClient.fetchAllUsers() usa el token real de la sesión (no la
    // clave anon sola) — necesario desde que authors_select_public se
    // restringió a "tu propia fila o admin" (auditoría RLS).
    list = await SupabaseClient.fetchAllUsers();
  } catch (_) {}

  panel.innerHTML = '';
  if (!list.length) { panel.innerHTML = `<p class="admin-empty">${I18n.t('noUsers')}</p>`; return; }

  const myId = Auth.currentUser()?.id;

  list.forEach(user => {
    const isAdminUser = user.role === 'admin';
    const isSelf = user.id === myId;
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-info">
        <span class="admin-row-title">${escHtml(user.username || '')}</span>
        <span class="admin-row-meta">${escHtml(user.email || '')} · ${user.role === 'admin' ? 'admin' : I18n.t('admin_roleUser')}</span>
      </div>
      <div class="admin-row-actions">
        ${isAdminUser
          ? (isSelf
              ? `<span class="admin-badge">${I18n.t('admin_selfBadge')}</span>`
              : `<button class="admin-btn admin-btn-warn" data-role-uid="${user.id}" data-new-role="user">${I18n.t('admin_removeAdmin')}</button>`)
          : `<button class="admin-btn admin-btn-ok" data-role-uid="${user.id}" data-new-role="admin">${I18n.t('admin_makeAdmin')}</button>
             <button class="admin-btn admin-btn-del" data-uid="${user.id}" data-email="${escHtml(user.email)}">${I18n.t('delete')}</button>`}
      </div>`;

    // Dar/quitar el rol de admin — no aparece sobre tu propia fila (evita
    // que te quites el admin a ti mismo sin querer y te quedes fuera).
    row.querySelector('[data-role-uid]')?.addEventListener('click', function() {
      const uid     = this.dataset.roleUid;
      const newRole = this.dataset.newRole;
      const uname   = user.username;
      const btn     = this;
      const msg = newRole === 'admin'
        ? I18n.t('admin_confirmGrantAdmin', { uname })
        : I18n.t('admin_confirmRevokeAdmin', { uname });
      appConfirm(msg, async () => {
        btn.disabled = true; btn.textContent = '…';
        try {
          await SupabaseClient.setUserRole(uid, newRole);
          showToast(newRole === 'admin' ? I18n.t('admin_nowAdmin', { uname }) : I18n.t('admin_noLongerAdmin', { uname }));
        } catch(e) {
          console.warn('setUserRole error:', e);
          showToast(I18n.t('admin_errChangeRole') + e.message);
          btn.disabled = false;
          btn.textContent = newRole === 'admin' ? I18n.t('admin_makeAdmin') : I18n.t('admin_removeAdmin');
          return;
        }
        renderTab('users');
      });
    });

    row.querySelector('[data-uid]')?.addEventListener('click', function() {
      const uid   = this.dataset.uid;
      const uname = user.username;
      const btn = this;
      appConfirm(I18n.t('admin_confirmDeleteUser', { uname }), async ()=>{
        btn.disabled = true; btn.textContent = '…';
        try {
          // Borrar obras y perfil de Supabase
          if (typeof SupabaseClient !== 'undefined') {
            await SupabaseClient.deleteAuthorData(uid);
          }
          // Borrar obras locales
          WorkStore.getByUser(uid).forEach(c => WorkStore.remove(c.id));
          showToast(I18n.t('userDeleted') + I18n.t('admin_deleteUserReminder'));
        } catch(e) {
          console.warn('deleteAuthorData error:', e);
          showToast(I18n.t('admin_errDeleteUser') + e.message);
          btn.disabled = false; btn.textContent = I18n.t('delete');
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
    ? `<span class="admin-badge-sb" title="${I18n.t('admin_titleSbId', { id: comic.supabaseId })}">${I18n.t('admin_badgeDb')}</span>`
    : `<span class="admin-badge-sb admin-badge-nosb" title="${I18n.t('admin_titleNoSbId')}">${I18n.t('admin_badgeNoDb')}</span>`;

  row.innerHTML = `
    <div class="admin-row-thumb">${thumb}</div>
    <div class="admin-row-info">
      <span class="admin-row-title">${escHtml(comic.title || I18n.t('noWork'))} ${sbBadge}</span>
      <span class="admin-row-meta">${I18n.t('by')} ${escHtml(comic.username || '')} · ${I18n.t('admin_pagesCount', { n: comic.panels?.length || 0 })}</span>
      <span class="admin-row-meta">${new Date(comic.createdAt || Date.now()).toLocaleDateString('es')}</span>
    </div>
    <div class="admin-row-actions">
      ${comic.supabaseId ? `<button class="admin-btn admin-btn-read" id="read_${comic.id}">👁 ${I18n.t('read')}</button>` : ''}
      <!-- Botón de diagnóstico oculto a petición de Alberto (no borrar):
           para volver a mostrarlo, descomentar la línea de abajo. -->
      <!-- ${comic.supabaseId ? `<button class="admin-btn" id="diag_${comic.id}" style="background:#ff0;color:#000;font-weight:700">🔍 Diag BD</button>` : ''} -->
      ${mode === 'pending'   ? `<button class="admin-btn admin-btn-ok"   id="approve_${comic.id}">${I18n.t('approve')}</button>`  : ''}
      ${mode === 'published' ? `<button class="admin-btn admin-btn-warn" id="unpub_${comic.id}">${I18n.t('unpublishAdmin')}</button>`      : ''}
      <button class="admin-btn admin-btn-del" id="del_${comic.id}">${I18n.t('deleteAdmin')}</button>
    </div>`;

  // Leer (embed reader en modal)
  row.querySelector(`#read_${comic.id}`)?.addEventListener('click', () => {
    const sid = comic.supabaseId;
    const param = comic.published ? `id=${sid}` : `draft=${sid}`;
    // Pestaña nueva — ver _openReaderTab en utils.js (no window.location: la
    // app no debe recargarse/abandonarse al leer una obra).
    _openReaderTab('reader/index.html?' + param);
  });

  // Diagnóstico Supabase
  row.querySelector(`#diag_${comic.id}`)?.addEventListener('click', async () => {
    const _sid = comic.supabaseId;
    if (!_sid) return;
    const _SB_URL = 'https://qqgsbyylaugsagbxsetc.supabase.co';
    const _SB_KEY = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';
    const _h = { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}` };
    const _get = async path => {
      const r = await fetch(`${_SB_URL}/rest/v1/${path}`, { headers: _h, cache: 'no-store' });
      return r.ok ? r.json() : [];
    };
    const _btn = row.querySelector(`#diag_${comic.id}`);
    _btn.textContent = '⏳';
    try {
      const lines = ['=== DIAGNÓSTICO SUPABASE ===', 'work_id: ' + _sid];
      const panels = await _get(`panels?work_id=eq.${_sid}&order=panel_order.asc&select=*`);
      lines.push('panels: ' + (panels||[]).length);
      for (const [pi, p] of (panels||[]).entries()) {
        lines.push('\nPanel ' + pi + ' id=' + p.id + ' orient=' + p.orientation + ' textMode=' + p.text_mode);
        const layers = await _get(`panel_layers?panel_id=eq.${p.id}&order=layer_order.asc&select=*`);
        const texts  = await _get(`panel_texts?panel_id=eq.${p.id}&order=text_order.asc&select=*`);
        lines.push('  panel_layers: ' + layers.length);
        layers.forEach((l, li) => {
          lines.push('  L'+li+' type='+l.layer_type
            +' layer_data='+(l.layer_data ? l.layer_data.length+'ch' : 'NULL')
            +' gif_url='+(l.gif_url?'OK':'null')
            +' anim_url='+(l.anim_url?'OK':'null'));
          // Mostrar inicio del layer_data para ver si es JSON o gz:
          if (l.layer_data) lines.push('    data_start: '+l.layer_data.slice(0,60));
        });
        lines.push('  panel_texts: ' + texts.length);
        texts.forEach((t, ti) => {
          lines.push('  T'+ti+' content='+JSON.stringify((t.content||t.text||'').slice(0,30))
            +' bg_opacity='+t.bg_opacity);
        });
      }
      // Mostrar panel copiable
      const _ov = document.createElement('div');
      _ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px';
      const _ta = document.createElement('textarea');
      _ta.value = lines.join('\n');
      _ta.style.cssText = 'width:95%;height:70vh;font-size:11px;font-family:monospace;background:#111;color:#0f0;border:2px solid #0f0;padding:8px';
      const _row = document.createElement('div');
      _row.style.cssText = 'display:flex;gap:8px;margin-top:8px';
      const _cp = document.createElement('button');
      _cp.textContent = '📋 Copiar'; _cp.style.cssText = 'padding:8px 16px;font-weight:700;cursor:pointer';
      _cp.onclick = () => { _ta.select(); document.execCommand('copy'); _cp.textContent = '✓ Copiado'; };
      const _cl = document.createElement('button');
      _cl.textContent = '✕ Cerrar'; _cl.style.cssText = 'padding:8px 16px;font-weight:700;cursor:pointer;background:#c00;color:#fff;border:none';
      _cl.onclick = () => _ov.remove();
      _row.appendChild(_cp); _row.appendChild(_cl);
      _ov.appendChild(_ta); _ov.appendChild(_row);
      document.body.appendChild(_ov);
      _ta.select();
    } catch(e) {
      alert('Error diagnóstico: ' + e.message);
    }
    _btn.textContent = '🔍 Diag BD';
  });

  // Aprobar
  row.querySelector(`#approve_${comic.id}`)?.addEventListener('click', async () => {
    // Intentar obtener de localStorage; si no existe, usar el objeto comic de Supabase
    const c = WorkStore.getById(comic.id) || comic;

    if (!c.supabaseId) {
      showToast(I18n.t('admin_noDbIdErr'));
      return;
    }

    if (typeof SupabaseClient !== 'undefined') {
      try {
        await SupabaseClient.approveWork(c);
      } catch(err) {
        console.error('Supabase approveWork:', err);
        showToast(I18n.t('admin_errApprove') + err.message);
        return;
      }
    }
    // Invalidar cache de portada para que la obra aparezca inmediatamente en el index
    if (typeof homeInvalidateCache === 'function') homeInvalidateCache();
    // Actualizar localStorage solo si existe entrada local
    const local = WorkStore.getById(comic.id);
    if (local) {
      local.approved = true; local.published = true; local.pendingReview = false;
      WorkStore.save(local);
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
    const local = WorkStore.getById(comic.id);
    if (local) { local.published = false; local.approved = false; WorkStore.save(local); }
    // Invalidar cache del home para que la obra desaparezca inmediatamente del índice
    if (typeof homeInvalidateCache === 'function') homeInvalidateCache();
    showToast(I18n.t('retireOk'));
    renderTab('published');
  });

  // Eliminar (de localStorage Y de Supabase)
  row.querySelector(`#del_${comic.id}`)?.addEventListener('click', () => {
    const title = comic.title || I18n.t('noWork');
    appConfirm(I18n.t('admin_confirmDeleteWork', { title }), async ()=>{
      if (typeof SupabaseClient !== 'undefined' && comic.supabaseId) {
        try {
          await SupabaseClient.deleteWork(comic.supabaseId);
        } catch(err) { console.warn('Supabase deleteWork:', err); }
      }
      WorkStore.remove(comic.id);
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
