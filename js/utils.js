/* ============================================================
   utils.js — Utilidades compartidas
   Debe cargarse antes que cualquier otro JS de página.
   ============================================================ */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('show');
  clearTimeout(t._tid);
  requestAnimationFrame(() => {
    t.classList.add('show');
    t._tid = setTimeout(() => t.classList.remove('show'), duration);
  });
}

/* ══════════════════════════════════════════
   MODAL READER — función global compartida
   Usada por home.js, admin.js y my-comics.js
   ══════════════════════════════════════════ */
function openReaderModalGlobal(url) {
  const MODAL_ID = 'globalReaderModal';
  let overlay = document.getElementById(MODAL_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'reader-modal';
    overlay.innerHTML = `
      <div class="reader-modal-inner">
        <iframe class="reader-modal-frame" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) closeReaderModalGlobal(); });

    window.addEventListener('message', e => {
      if (e.data?.type === 'reader:close') closeReaderModalGlobal();
      if (e.data?.type === 'reader:fullscreen') {
        const frame = document.querySelector('#' + MODAL_ID + ' .reader-modal-frame');
        if (!frame) return;
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (isFs) { (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document); }
        else { const req = frame.requestFullscreen || frame.webkitRequestFullscreen; if (req) req.call(frame, { navigationUI: 'hide' }).catch(() => {}); }
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const ov = document.getElementById(MODAL_ID);
        if (ov && !ov.classList.contains('hidden')) { e.stopPropagation(); closeReaderModalGlobal(); }
      }
    });
  }
  overlay._wasFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const frame = overlay.querySelector('.reader-modal-frame');
  frame.src = url;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  frame.addEventListener('load', () => frame.focus(), { once: true });
}

function closeReaderModalGlobal() {
  const overlay = document.getElementById('globalReaderModal');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.querySelector('.reader-modal-frame').src = '';
  document.body.style.overflow = '';
  const wasFs = overlay._wasFullscreen;
  overlay._wasFullscreen = false;
  const nowFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (nowFs && !wasFs) { (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document); }
  else if (!nowFs && wasFs) { if (typeof Fullscreen !== 'undefined') Fullscreen.enter(); }
  setTimeout(() => { if (typeof Fullscreen !== 'undefined') Fullscreen._updateBtn(); }, 200);
}

/* ══════════════════════════════════════════
   MODAL ENVIAR — compartir enlace al reader
   ══════════════════════════════════════════ */
function openShareModal(comic) {
  if (!comic.supabaseId) {
    alert('Esta obra no está en la nube. Súbela primero para poder compartirla.');
    return;
  }

  const base  = window.location.origin + window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
  const param = comic.published ? 'id=' + comic.supabaseId : 'draft=' + comic.supabaseId;
  const url   = base + '/reader/?' + param;
  const title = comic.title || 'Una obra en ComiXow';
  const text  = `Mira "${title}" en ComiXow`;

  if ('share' in navigator) {
    navigator.share({ title, text, url }).catch(e => {
      if (e.name !== 'AbortError') console.warn('share:', e);
    });
  } else {
    // Fallback: copiar enlace al portapapeles
    navigator.clipboard.writeText(url).then(() => {
      alert('Enlace copiado al portapapeles:\n' + url);
    }).catch(() => {
      prompt('Copia este enlace para compartirlo:', url);
    });
  }
}
