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
  // Si no tiene supabaseId, no se puede compartir
  if (!comic.supabaseId) {
    alert('Esta obra no está en la nube. Súbela primero usando "Publicar" o guárdala en la nube para poder compartirla.');
    return;
  }

  const base = window.location.origin + window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
  const url  = base + '/reader/?id=' + comic.supabaseId;
  const title = comic.title || 'Una obra en ComiXow';
  const text  = `Mira "${title}" en ComiXow`;

  // Crear modal
  const existing = document.getElementById('shareModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'shareModal';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9500;
    background:rgba(0,0,0,.6);
    display:flex;align-items:center;justify-content:center;
    padding:16px;
  `;

  overlay.innerHTML = `
    <div style="
      background:var(--white);border-radius:16px;padding:28px 24px;
      max-width:360px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,.4);
    ">
      <div style="font-weight:700;font-size:1.05rem;margin-bottom:6px">📤 Compartir obra</div>
      <div style="font-size:.85rem;color:var(--gray-500);margin-bottom:20px;word-break:break-all">${escHtml(title)}</div>

      <div style="display:flex;flex-direction:column;gap:10px;">

        ${'share' in navigator ? `
        <button id="shareNative" style="
          display:flex;align-items:center;gap:12px;padding:12px 16px;
          border:1.5px solid var(--gray-200);border-radius:10px;background:var(--white);
          cursor:pointer;font-size:.95rem;font-weight:600;text-align:left;width:100%;
        ">
          <span style="font-size:1.4rem">📱</span>
          <span>Compartir (menú del sistema)</span>
        </button>` : ''}

        <button id="shareWhatsApp" style="
          display:flex;align-items:center;gap:12px;padding:12px 16px;
          border:1.5px solid #25D366;border-radius:10px;background:var(--white);
          cursor:pointer;font-size:.95rem;font-weight:600;text-align:left;width:100%;
          color:#128C7E;
        ">
          <span style="font-size:1.4rem">💬</span>
          <span>WhatsApp</span>
        </button>

        <button id="shareEmail" style="
          display:flex;align-items:center;gap:12px;padding:12px 16px;
          border:1.5px solid var(--gray-200);border-radius:10px;background:var(--white);
          cursor:pointer;font-size:.95rem;font-weight:600;text-align:left;width:100%;
        ">
          <span style="font-size:1.4rem">✉️</span>
          <span>Correo electrónico</span>
        </button>

        <button id="shareCopy" style="
          display:flex;align-items:center;gap:12px;padding:12px 16px;
          border:1.5px solid var(--gray-200);border-radius:10px;background:var(--white);
          cursor:pointer;font-size:.95rem;font-weight:600;text-align:left;width:100%;
        ">
          <span style="font-size:1.4rem">🔗</span>
          <span id="shareCopyLabel">Copiar enlace</span>
        </button>

      </div>

      <button id="shareClose" style="
        margin-top:18px;width:100%;padding:10px;border:none;
        background:var(--gray-100);border-radius:10px;
        cursor:pointer;font-size:.9rem;color:var(--gray-600);font-weight:600;
      ">Cancelar</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Cerrar
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#shareClose').addEventListener('click', close);

  // Web Share API (nativo)
  const nativeBtn = overlay.querySelector('#shareNative');
  if (nativeBtn) {
    nativeBtn.addEventListener('click', async () => {
      try { await navigator.share({ title, text, url }); close(); }
      catch(e) { if (e.name !== 'AbortError') console.warn('share:', e); }
    });
  }

  // WhatsApp
  overlay.querySelector('#shareWhatsApp').addEventListener('click', () => {
    window.open('https://wa.me/?text=' + encodeURIComponent(text + '\n' + url), '_blank');
    close();
  });

  // Email
  overlay.querySelector('#shareEmail').addEventListener('click', () => {
    window.location.href = 'mailto:?subject=' + encodeURIComponent(title) +
      '&body=' + encodeURIComponent(text + '\n\n' + url);
    close();
  });

  // Copiar enlace
  overlay.querySelector('#shareCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      overlay.querySelector('#shareCopyLabel').textContent = '✓ ¡Enlace copiado!';
      setTimeout(close, 1200);
    } catch(e) {
      // Fallback para navegadores sin clipboard API
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      overlay.querySelector('#shareCopyLabel').textContent = '✓ ¡Enlace copiado!';
      setTimeout(close, 1200);
    }
  });
}
