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
async function openShareModal(comic) {
  const base = window.location.origin + window.location.pathname
    .replace(/\/index\.html$/, '').replace(/\/$/, '');

  let url;

  // Decidir fuente de datos:
  // 1. Si tiene datos locales (editorData en OPFS) → construir desde local
  // 2. Si solo está en la nube (cloudOnly sin editorData) → usar enlace Supabase
  const _comicFull = ComicStore.getByIdFull
    ? await ComicStore.getByIdFull(comic.id)
    : comic;

  const _hasLocal = !!(_comicFull?.editorData?.pages?.length);

  // Iniciar registro de diagnóstico del envío
  const _shareDiag = {
    t:           new Date().toISOString(),
    comicId:     comic.id,
    title:       comic.title || '?',
    hasLocal:    _hasLocal,
    cloudOnly:   !!comic.cloudOnly,
    supabaseId:  comic.supabaseId || null,
    published:   !!comic.published,
    pagesCount:  _comicFull?.editorData?.pages?.length || 0,
    mode:        _hasLocal && comic.supabaseId ? 'LOCAL→SUPABASE' : (_hasLocal ? 'LOCAL_SIN_SUBIR' : (comic.supabaseId ? 'NUBE' : 'ERROR')),
    supabaseUpload: null,  // resultado de la subida a Supabase
    localSavedAtAfter: null, // localSavedAt tras reguardar
    layersSummary: [],
    localStorageKey: null,
    localStorageBytes: null,
    url: null,
    error: null,
  };
  // Analizar capas para diagnóstico
  if (_hasLocal && _comicFull?.editorData?.pages) {
    _comicFull.editorData.pages.forEach((p, pi) => {
      (p.layers || []).forEach((l, li) => {
        const info = { page: pi+1, layer: li+1, type: l.type };
        if (l.type === 'image') {
          info.animKey       = l.animKey       || null;
          info.pngFramesKey  = l._pngFramesKey || null;
          info.hasSrc        = !!l.src;
        }
        if (l.type === 'gif') {
          info.gifKey   = l.gifKey   || null;
          info.gifUrl   = l._gifUrl  || null;
        }
        if (l.type === 'draw' || l.type === 'stroke' || l.type === 'line') {
          info.hasSrc   = !!(l.src || l.dataUrl);
          info.hasPoints = !!(l.points && l.points.length);
        }
        _shareDiag.layersSummary.push(info);
      });
    });
  }
  // Guardar diagnóstico en window para que el panel lo muestre
  window._shareDiag = _shareDiag;

  if (_hasLocal && comic.supabaseId && typeof SupabaseClient !== 'undefined' && typeof Auth !== 'undefined' && Auth.currentUser?.()) {
    // ── MODO LOCAL → SUBIR A SUPABASE → enlace Supabase ──
    // Sube SIEMPRE los datos locales (no los que ya estén en Supabase)
    // Así el receptor ve la versión correcta y el emisor no descarga la nube al volver
    _shareDiag.mode = 'LOCAL→SUPABASE';
    try {
      // Asegurar que tiene supabaseId
      if (!_comicFull.supabaseId) _comicFull.supabaseId = comic.supabaseId;
      const _t0 = Date.now();
      const { savedAt } = await SupabaseClient.saveDraft(_comicFull);
      _shareDiag.supabaseUpload = { ok: true, ms: Date.now() - _t0, savedAt };
      // Actualizar localSavedAt con la fecha exacta de Supabase
      // → localSavedAt === updated_at → cloudIsNewer = false → no descarga al volver
      if (savedAt && ComicStore.save) {
        const _idx = ComicStore.getById(comic.id);
        if (_idx) {
          await ComicStore.save({ ..._idx, localSavedAt: savedAt });
          _shareDiag.localSavedAtAfter = savedAt;
        }
      }
    } catch(e) {
      _shareDiag.supabaseUpload = { ok: false, error: e.message };
      _shareDiag.error = 'saveDraft falló: ' + e.message;
      console.warn('openShareModal saveDraft:', e);
      // Si falla la subida, mostrar error — no compartir enlace roto
      window._shareDiag = _shareDiag;
      appAlert('Error al subir a la nube: ' + e.message + '\n\nComprueba tu conexión e inténtalo de nuevo.');
      return;
    }
    const param = comic.published ? 'id=' + comic.supabaseId : 'draft=' + comic.supabaseId;
    url = base + '/reader/index.html?' + param;
    _shareDiag.url = url;

  } else if (_hasLocal && !comic.supabaseId) {
    // ── Sin supabaseId — obra nunca subida ──
    appAlert('Esta obra no está en la nube. Ábrela en el editor, guárdala en la nube y vuelve a intentarlo.');
    return;

  } else if (comic.supabaseId) {
    // ── MODO NUBE: sin datos locales (cloudOnly) — enlace directo ──
    _shareDiag.mode = 'NUBE';
    const param = comic.published ? 'id=' + comic.supabaseId : 'draft=' + comic.supabaseId;
    url = base + '/reader/index.html?' + param;
    _shareDiag.url = url;

  } else {
    appAlert('Esta obra no tiene datos guardados. Ábrela en el editor y guárdala antes de compartir.');
    return;
  }

  const title = comic.title || 'Una obra en ComiXow';
  const text  = `Mira "${title}" en ComiXow`;

  if ('share' in navigator) {
    // Android/móvil: hoja nativa de compartir (WhatsApp, Telegram, correo...)
    navigator.share({ title, text, url }).catch(e => {
      if (e.name !== 'AbortError') console.warn('share:', e);
    });
  } else {
    // PC: copiar enlace al portapapeles
    navigator.clipboard.writeText(url).then(() => {
      appAlert('Enlace copiado al portapapeles:\n' + url);
    }).catch(() => {
      appAlert('Copia este enlace para compartirlo:\n' + url);
    });
  }
}

// ── Modal de confirmación global (evita confirm()/alert() nativos que rompen fullscreen) ──
const _APP_CONFIRM_ID = '_appConfirmModal';

function _appConfirmGetEl() {
  let el = document.getElementById(_APP_CONFIRM_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = _APP_CONFIRM_ID;
    el.style.cssText = [
      'position:fixed;inset:0;z-index:99999',
      'background:rgba(0,0,0,.55)',
      'backdrop-filter:blur(3px)',
      'display:flex;align-items:center;justify-content:center',
      'opacity:0;pointer-events:none;transition:opacity .18s'
    ].join(';');
    el.innerHTML = `
      <div style="background:#fff;border:2.5px solid #000;border-radius:16px;
                  padding:24px 20px 16px;width:calc(100% - 48px);max-width:340px;
                  box-shadow:4px 4px 0 #000">
        <p id="${_APP_CONFIRM_ID}_msg"
           style="font-family:sans-serif;font-size:1rem;font-weight:700;
                  text-align:center;margin:0 0 20px;line-height:1.4;color:#000"></p>
        <div style="display:flex;gap:8px">
          <button id="${_APP_CONFIRM_ID}_cancel"
                  style="flex:1;padding:12px;border:2px solid #000;border-radius:10px;
                         font-weight:900;font-size:.9rem;cursor:pointer;
                         background:#fff;box-shadow:2px 2px 0 #000">Cancelar</button>
          <button id="${_APP_CONFIRM_ID}_ok"
                  style="flex:1;padding:12px;border:2px solid #000;border-radius:10px;
                         font-weight:900;font-size:.9rem;cursor:pointer;
                         background:#ffe566;box-shadow:2px 2px 0 #000">Aceptar</button>
        </div>
      </div>`;
    document.body.appendChild(el);
  }
  return el;
}

function appConfirm(msg, onOk, okLabel) {
  const overlay  = _appConfirmGetEl();
  const msgEl    = document.getElementById(`${_APP_CONFIRM_ID}_msg`);
  const okBtn    = document.getElementById(`${_APP_CONFIRM_ID}_ok`);
  const cancelBtn= document.getElementById(`${_APP_CONFIRM_ID}_cancel`);
  msgEl.textContent = msg;
  if (okLabel) okBtn.textContent = okLabel;
  overlay.style.opacity = '1';
  overlay.style.pointerEvents = 'all';
  const close = (exec) => {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    okBtn.removeEventListener('click', onYes);
    cancelBtn.removeEventListener('click', onNo);
    if (exec && onOk) onOk();
  };
  const onYes = () => close(true);
  const onNo  = () => close(false);
  okBtn.addEventListener('click', onYes);
  cancelBtn.addEventListener('click', onNo);
}

function appAlert(msg) {
  const overlay  = _appConfirmGetEl();
  const msgEl    = document.getElementById(`${_APP_CONFIRM_ID}_msg`);
  const okBtn    = document.getElementById(`${_APP_CONFIRM_ID}_ok`);
  const cancelBtn= document.getElementById(`${_APP_CONFIRM_ID}_cancel`);
  msgEl.textContent = msg;
  okBtn.textContent = 'Aceptar';
  cancelBtn.style.display = 'none';
  overlay.style.opacity = '1';
  overlay.style.pointerEvents = 'all';
  const close = () => {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    cancelBtn.style.display = '';
    okBtn.removeEventListener('click', close);
  };
  okBtn.addEventListener('click', close);
}
