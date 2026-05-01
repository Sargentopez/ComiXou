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
    mode:        _hasLocal ? 'LOCAL' : (comic.supabaseId ? 'NUBE' : 'ERROR'),
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
          info.hasSrc   = !!l.src;
          info.hasPoints = !!(l.points && l.points.length);
        }
        _shareDiag.layersSummary.push(info);
      });
    });
  }
  // Guardar diagnóstico en window para que el panel lo muestre
  window._shareDiag = _shareDiag;

  if (_hasLocal) {
    // ── MODO LOCAL: serializar editorData en localStorage temporal ──
    // El reader lo leerá desde ?local=<key> sin tocar Supabase
    const _key = 'cx_preview_' + Date.now();
    // Construir payload con todos los datos necesarios para reconstruir la obra
    // Mismo orden y estructura que usa edOpenViewer internamente
    const _pages = _comicFull.editorData.pages;
    const _payload = {
      title:       _comicFull.title     || '',
      author:      _comicFull.author    || '',
      social:      _comicFull.social    || '',
      navMode:     _comicFull.navMode   || 'fixed',
      orientation: _comicFull.editorData.orientation || 'v',
      pages: _pages.map(p => ({
        // Incluir todos los campos de la hoja — igual que edSerLayer usa
        orientation:        p.orientation || _comicFull.editorData.orientation || 'v',
        textMode:           p.textMode || 'sequential',
        textLayerOpacity:   p.textLayerOpacity !== undefined ? p.textLayerOpacity : 1,
        layers: (p.layers || []).map(l => {
          // Copia completa del layer serializado
          // Incluye: type, x, y, width, height, rotation, src, opacity,
          //          animKey, _pngFramesKey, gifKey, _gifUrl,
          //          points, groupId, locked, text, bubbleType...
          const _l = { ...l };
          // NO incluir _pngFrames (pesado, está en IDB por _pngFramesKey)
          // NO incluir _apngSrc, _animFrames, _animOc (datos en memoria)
          delete _l._pngFrames;
          delete _l._apngSrc;
          delete _l._animFrames;
          delete _l._animOc;
          delete _l._animReady;
          delete _l._playing;
          delete _l._fIdx;
          delete _l.img;
          delete _l._oc;
          return _l;
        }),
      })),
    };
    try {
      const _payloadStr = JSON.stringify(_payload);
      localStorage.setItem(_key, _payloadStr);
      _shareDiag.localStorageKey   = _key;
      _shareDiag.localStorageBytes = _payloadStr.length;
    } catch(e) {
      _shareDiag.error = 'localStorage.setItem falló: ' + e.message;
      window._shareDiag = _shareDiag;
      appAlert('No hay espacio suficiente para compartir. Libera espacio e inténtalo de nuevo.');
      return;
    }
    url = base + '/reader/index.html?local=' + _key + '&from=app';
    _shareDiag.url = url;

  } else if (comic.supabaseId) {
    // ── MODO NUBE: enlace directo a Supabase (obra cloudOnly) ──
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
