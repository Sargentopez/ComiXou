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
   Usada por home.js, admin.js y my-works.js
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
/* ══════════════════════════════════════════
   MODAL CAMBIAR CONTRASEÑA
   Estilos propios (no depende de auth.css, que
   solo se carga en las rutas login/register).
   ══════════════════════════════════════════ */
function openChangePasswordModal() {
  const MODAL_ID = 'pwdModalOverlay';
  let overlay = document.getElementById(MODAL_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'pwd-modal-overlay hidden';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) _closeChangePasswordModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const ov = document.getElementById(MODAL_ID);
        if (ov && !ov.classList.contains('hidden')) _closeChangePasswordModal();
      }
    });
  }

  // El mismo modal, dos formularios distintos según haya sesión o no:
  // con sesión -> elegir contraseña nueva directamente.
  // sin sesión (llegó aquí desde "¿Olvidaste tu contraseña?") -> pedir email
  // para recibir el enlace de recuperación.
  const loggedIn = typeof Auth !== 'undefined' && Auth.isLogged();
  overlay.innerHTML = loggedIn ? _pwdSetFormHtml() : _pwdRequestFormHtml();
  _bindPwdModalContent(overlay, loggedIn);

  // Quitar 'hidden' ANTES de medir la franja blanca del título: con el
  // overlay todavía en display:none el título mide 0×0 y _winFitTitlePill
  // deja la franja a width:0 sin ninguna otra llamada posterior que la
  // corrija — por eso no se veía. Se llama dos veces (síncrona + rAF) por
  // si el navegador tarda un frame en aplicar el cambio de display.
  overlay.classList.remove('hidden');
  if (typeof _winFitTitlePill === 'function') {
    _winFitTitlePill();
    requestAnimationFrame(_winFitTitlePill);
  }
}

function _pwdSetFormHtml() {
  return `
    <div class="pwd-modal-card">
      <div class="pwd-modal-header">
        <h2 class="pwd-modal-title">${I18n.t('changePasswordTitle')}</h2>
      </div>
      <div class="pwd-modal-body">
        <form id="pwdChangeForm" novalidate>
          <div class="pwd-form-group">
            <label class="pwd-form-label" for="pwdNewInput">${I18n.t('newPassword')}</label>
            <div class="pwd-pass-wrap">
              <input type="password" id="pwdNewInput" class="pwd-form-input" autocomplete="new-password" minlength="6" required>
              <button type="button" class="pwd-pass-toggle" data-target="pwdNewInput">👁</button>
            </div>
          </div>
          <div class="pwd-form-group">
            <label class="pwd-form-label" for="pwdConfirmInput">${I18n.t('confirmPassword')}</label>
            <div class="pwd-pass-wrap">
              <input type="password" id="pwdConfirmInput" class="pwd-form-input" autocomplete="new-password" minlength="6" required>
              <button type="button" class="pwd-pass-toggle" data-target="pwdConfirmInput">👁</button>
            </div>
          </div>
          <span class="pwd-form-error" id="pwdFormError"></span>
          <button type="submit" class="btn btn-primary pwd-btn-full" id="pwdSubmitBtn">${I18n.t('savePassword')}</button>
          <button type="button" class="btn pwd-btn-full" id="pwdCancelBtn">${I18n.t('cancel')}</button>
        </form>
      </div>
    </div>`;
}

function _pwdRequestFormHtml() {
  return `
    <div class="pwd-modal-card">
      <div class="pwd-modal-header">
        <h2 class="pwd-modal-title">${I18n.t('resetTitle')}</h2>
      </div>
      <div class="pwd-modal-body">
        <p class="pwd-modal-desc">${I18n.t('resetInstructions')}</p>
        <form id="pwdResetForm" novalidate>
          <div class="pwd-form-group">
            <label class="pwd-form-label" for="pwdResetEmail">${I18n.t('email')}</label>
            <input type="email" id="pwdResetEmail" class="pwd-form-input" autocomplete="email" required>
          </div>
          <span class="pwd-form-error" id="pwdFormError"></span>
          <button type="submit" class="btn btn-primary pwd-btn-full" id="pwdResetSubmitBtn">${I18n.t('sendResetLink')}</button>
          <button type="button" class="btn pwd-btn-full" id="pwdCancelBtn">${I18n.t('cancel')}</button>
        </form>
      </div>
    </div>`;
}

function _bindPwdModalContent(overlay, loggedIn) {
  overlay.querySelector('#pwdCancelBtn').addEventListener('click', _closeChangePasswordModal);

  if (loggedIn) {
    overlay.querySelectorAll('.pwd-pass-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.target);
        inp.type = inp.type === 'password' ? 'text' : 'password';
      });
    });

    overlay.querySelector('#pwdChangeForm').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = document.getElementById('pwdFormError');
      const pass1 = document.getElementById('pwdNewInput').value;
      const pass2 = document.getElementById('pwdConfirmInput').value;
      errEl.textContent = '';

      if (pass1.length < 6) { errEl.textContent = I18n.t('passwordTooShort'); return; }
      if (pass1 !== pass2)  { errEl.textContent = I18n.t('passwordMismatch'); return; }

      const submitBtn = document.getElementById('pwdSubmitBtn');
      submitBtn.disabled = true;
      const result = await Auth.changePassword(pass1);
      submitBtn.disabled = false;

      if (result.ok) {
        showToast(I18n.t('passwordChanged'));
        _closeChangePasswordModal();
      } else if (result.err === 'errNoAuth') {
        errEl.textContent = I18n.t('passwordChangeNoAuth');
      } else {
        errEl.textContent = I18n.t('passwordChangeError');
      }
    });
  } else {
    overlay.querySelector('#pwdResetForm').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = document.getElementById('pwdFormError');
      const email = document.getElementById('pwdResetEmail').value.trim();
      errEl.textContent = '';
      if (!email) { errEl.textContent = I18n.t('errRequired'); return; }

      const submitBtn = document.getElementById('pwdResetSubmitBtn');
      submitBtn.disabled = true;
      const result = await Auth.requestPasswordReset(email);
      submitBtn.disabled = false;

      if (result.ok) {
        showToast(I18n.t('resetLinkSent'));
        _closeChangePasswordModal();
      } else {
        errEl.textContent = I18n.t('resetLinkError');
      }
    });
  }
}

function _closeChangePasswordModal() {
  const overlay = document.getElementById('pwdModalOverlay');
  if (overlay) overlay.classList.add('hidden');
}

/* ══════════════════════════════════════════
   MODAL DE CRÉDITOS — menú ⋮ → ℹ️ Info
   Mismo diseño de ventana que las de ayuda del editor (Atajos de teclado,
   Crear animaciones, Herramientas de dibujo — clase .sc-box, ver
   editor.css), duplicado aquí con reglas propias en main.css porque
   editor.css solo se carga en la vista del editor y este modal tiene que
   poder abrirse desde cualquier vista (el menú ⋮ vive en la cabecera
   global). Mismo cierre por botón ✕, clic fuera y Escape que el resto de
   modales globales de este archivo (openReaderModalGlobal,
   openChangePasswordModal). Contenido: el mismo bloque de créditos que ya
   encabeza cada archivo del proyecto (autoría + librerías de terceros), no
   texto nuevo.
   ══════════════════════════════════════════ */
const _CREDITS_LIBS = [
  { name: 'omggif',            descKey: 'credits_omggifDesc', metaKey: 'credits_omggifMeta', url: 'https://github.com/deanm/omggif' },
  { name: 'pako',               descKey: 'credits_pakoDesc',   metaKey: 'credits_pakoMeta',   url: 'https://github.com/nodeca/pako' },
  { name: 'UPNG.js',            descKey: 'credits_upngDesc',   metaKey: 'credits_upngMeta',   url: 'https://github.com/photopea/UPNG.js' },
  { name: 'LZW decompression',  descKey: 'credits_lzwDesc',    metaKey: 'credits_lzwMeta',    url: 'https://gist.github.com/devunwired/4479231' },
  { name: 'Trix',                descKey: 'credits_trixDesc',  metaKey: 'credits_trixMeta',   url: 'https://trix-editor.org/' }
];

function _creditsModalHtml() {
  const rows = _CREDITS_LIBS.map(lib => `
    <div class="cr-row">
      <div class="cr-name">${lib.name} <span class="cr-desc">— ${I18n.t(lib.descKey)}</span></div>
      <div class="cr-meta">${I18n.t(lib.metaKey)}</div>
      <div class="cr-meta"><a href="${lib.url}" target="_blank" rel="noopener">${lib.url}</a></div>
    </div>`).join('');

  // Mismo texto que el fichero LICENSE de la raíz del proyecto (sin repetir
  // aquí la lista de bibliotecas de terceros, que el propio LICENSE también
  // incluye — ya se muestra arriba con sus enlaces).
  const licenseParagraphs = ['credits_license1', 'credits_license2', 'credits_license3', 'credits_license4', 'credits_license5']
    .map(k => `<p class="cr-license">${I18n.t(k)}</p>`).join('');

  return `
    <div class="sc-box">
      <div class="sc-header">
        <span class="sc-title">${I18n.t('credits_title')}</span>
        <button class="sc-close" id="creditsClose">✕</button>
      </div>
      <div class="sc-body">
        <p class="cr-app">${I18n.t('credits_appInfo')} <a href="mailto:contacto@comxow.com">contacto@comxow.com</a></p>
        <div class="sc-section">${I18n.t('credits_thirdPartyLibs')}</div>
        ${rows}
        <div class="sc-section">${I18n.t('credits_license')}</div>
        ${licenseParagraphs}
        <p class="cr-license">${I18n.t('credits_contactAuth', { email: '<a href="mailto:contacto@comxow.com">contacto@comxow.com</a>' })}</p>
      </div>
    </div>`;
}

function openCreditsModal() {
  const MODAL_ID = 'creditsModal';
  let overlay = document.getElementById(MODAL_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = _creditsModalHtml();
    document.body.appendChild(overlay);

    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) _closeCreditsModal(); });
    document.getElementById('creditsClose').addEventListener('click', _closeCreditsModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const ov = document.getElementById(MODAL_ID);
        if (ov && ov.classList.contains('open')) _closeCreditsModal();
      }
    });
  }
  // Igual que en openChangePasswordModal: la franja blanca hay que medirla
  // con el modal ya visible (con display:none mide 0 y se queda así), y hay
  // que repetirlo en CADA apertura (no solo la primera, que es cuando se
  // crea el overlay) — un resize con el modal cerrado deja la franja a 0
  // por estar oculta, y solo un nuevo cálculo al reabrir la corrige.
  overlay.classList.add('open');
  if (typeof _winFitTitlePill === 'function') {
    _winFitTitlePill();
    requestAnimationFrame(_winFitTitlePill);
  }
}

function _closeCreditsModal() {
  document.getElementById('creditsModal')?.classList.remove('open');
}

/* ══════════════════════════════════════════
   MODAL IDIOMA (menú ⋮ → Idioma)
   Mismo patrón/estilo que el modal de Créditos (.sc-box).
   Decisión de diseño: cambiar de idioma recarga la app — el editor y el
   resto de vistas reconstruyen su interfaz dinámicamente con JS y no hay
   (todavía) un sistema de "redibujado" que vuelva a ejecutar esas funciones
   de render al vuelo. Recargar es el patrón estándar más simple y sin
   riesgo de dejar texto a medio traducir en medio de una sesión de edición.
   ══════════════════════════════════════════ */
function _langModalHtml() {
  const current = I18n.getLang();
  const opt = (code, label) => {
    const active = current === code;
    return '<button type="button" class="btn ' + (active ? 'btn-primary' : 'btn-outline')
      + ' lang-opt-btn" data-lang="' + code + '" style="width:100%;margin-bottom:8px;">'
      + label + (active ? ' ✓' : '') + '</button>';
  };
  return `
    <div class="sc-box">
      <div class="sc-header">
        <span class="sc-title">${I18n.t('menuLanguage')}</span>
        <button class="sc-close" id="langModalClose">✕</button>
      </div>
      <div class="sc-body">
        ${opt('es', 'Español')}
        ${opt('en', 'English')}
      </div>
    </div>`;
}

function openLanguageModal() {
  const MODAL_ID = 'langModal';
  let overlay = document.getElementById(MODAL_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    document.body.appendChild(overlay);
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) _closeLanguageModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const ov = document.getElementById(MODAL_ID);
        if (ov && ov.classList.contains('open')) _closeLanguageModal();
      }
    });
  }
  overlay.innerHTML = _langModalHtml();
  overlay.querySelector('#langModalClose').addEventListener('click', _closeLanguageModal);
  overlay.querySelectorAll('.lang-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const chosen = btn.dataset.lang;
      if (chosen === I18n.getLang()) { _closeLanguageModal(); return; }
      I18n.setLang(chosen);
      window.location.reload();
    });
  });
  overlay.classList.add('open');
  if (typeof _winFitTitlePill === 'function') {
    _winFitTitlePill();
    requestAnimationFrame(_winFitTitlePill);
  }
}

function _closeLanguageModal() {
  document.getElementById('langModal')?.classList.remove('open');
}

// ── Modal propio de "Compartir" — con dos acciones DISTINTAS a propósito ──
// Petición explícita de Alberto: "Copiar enlace" debe copiar SOLO la URL
// (nada de "Mira *la obra* en Comxow..."), pero al enviar por WhatsApp o
// cualquier otra red sí debe ir ese mensaje.
//
// POR QUÉ HACE FALTA UN MODAL PROPIO (no se puede arreglar solo con
// navigator.share): el botón "Copiar" que Android añade dentro de SU PROPIA
// ventana de compartir nativa no es controlable desde esta app — Chromium
// traduce navigator.share({title, text, url}) a un Intent Android donde
// `text` y `url` se concatenan en el MISMO campo (EXTRA_TEXT: text+"\n"+url
// si se pasan los dos, según su propia implementación), y tanto el botón
// "Copiar" nativo como cualquier app de la lista (WhatsApp incluida) leen
// ESE MISMO campo — no hay forma de darle al botón "Copiar" un contenido
// distinto del que reciben las apps, son la misma pieza de información. Por
// eso el enlace "se copiaba con el texto pegado" incluso queriendo copiar
// solo eso. La única forma real de separar ambos comportamientos es no
// depender de ese botón nativo: dar un botón PROPIO de "Copiar enlace" (que
// sí puede copiar solo la URL) y dejar "Enviar" para lo que sí debe llevar
// mensaje — patrón habitual en apps web por esta misma limitación de la Web
// Share API, no una solución inventada para esto.
const _SHARE_MODAL_ID = '_shareModal';

function _shareModalGetEl() {
  let el = document.getElementById(_SHARE_MODAL_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = _SHARE_MODAL_ID;
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
        <p id="${_SHARE_MODAL_ID}_title"
           style="font-family:sans-serif;font-size:1rem;font-weight:700;
                  text-align:center;margin:0 0 20px;line-height:1.4;color:#000;
                  overflow-wrap:break-word"></p>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button id="${_SHARE_MODAL_ID}_copy"
                  style="padding:12px;border:2px solid #000;border-radius:10px;
                         font-weight:900;font-size:.9rem;cursor:pointer;
                         background:#fff;box-shadow:2px 2px 0 #000"></button>
          <button id="${_SHARE_MODAL_ID}_send"
                  style="padding:12px;border:2px solid #000;border-radius:10px;
                         font-weight:900;font-size:.9rem;cursor:pointer;
                         background:#ffe566;box-shadow:2px 2px 0 #000"></button>
          <button id="${_SHARE_MODAL_ID}_cancel"
                  style="padding:8px;border:none;border-radius:10px;
                         font-weight:700;font-size:.85rem;cursor:pointer;
                         background:transparent;color:#666"></button>
        </div>
      </div>`;
    document.body.appendChild(el);
    // Cerrar tocando fuera de la tarjeta (mismo hábito que el resto de modales)
    el.addEventListener('click', e => { if (e.target === el) _shareModalClose(); });
  }
  return el;
}

function _shareModalClose() {
  const overlay = document.getElementById(_SHARE_MODAL_ID);
  if (!overlay) return;
  overlay.style.opacity = '0';
  overlay.style.pointerEvents = 'none';
}

// Abre el lector externo (reader/index.html) en una pestaña nueva — NUEVO,
// pedido explícito de Alberto: así la app nunca se abandona al leer una
// obra (no hace falta recargarla al volver) y pueden tenerse varias
// lecturas abiertas a la vez. Si el navegador bloquea window.open (raro
// estando dentro de un manejador de clic real, pero posible en algún
// WebView/PWA), recurre a navegar en la MISMA pestaña como última opción —
// ver el comentario de _doClose en reader/reader.js sobre por qué cerrar
// el lector sigue volviendo bien a la vista de origen incluso en ese caso.
function _openReaderTab(url) {
  const w = window.open(url, '_blank');
  if (!w) window.location = url;
}

function openShareModal(comic) {

  if (!comic.supabaseId) {
    appAlert(I18n.t('share_notInCloud'));
    return;
  }

  const base  = window.location.origin + window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
  const isDraft = !comic.published;
  const param = isDraft ? 'draft=' + comic.supabaseId : 'id=' + comic.supabaseId;
  const url   = base + '/reader/index.html?' + param;
  const title = comic.title || I18n.t('share_defaultTitle');
  // Texto del mensaje: el título va entre asteriscos porque WhatsApp lo
  // interpreta como negrita al enviarlo (convención propia de WhatsApp,
  // no HTML). En apps sin ese formato (SMS, email) se verán los asteriscos
  // literalmente, pero el texto sigue siendo perfectamente legible.
  const shareText = I18n.t('share_text', { title });
  const draftNote = isDraft ? I18n.t('share_draftNote') : '';

  const overlay   = _shareModalGetEl();
  const titleEl   = document.getElementById(`${_SHARE_MODAL_ID}_title`);
  const copyBtn   = document.getElementById(`${_SHARE_MODAL_ID}_copy`);
  const sendBtn   = document.getElementById(`${_SHARE_MODAL_ID}_send`);
  const cancelBtn = document.getElementById(`${_SHARE_MODAL_ID}_cancel`);

  titleEl.textContent = I18n.t('share_modalTitle', { title });
  copyBtn.textContent = '🔗 ' + I18n.t('share_copyLinkBtn');
  sendBtn.textContent = '📤 ' + I18n.t('share_sendBtn');
  cancelBtn.textContent = I18n.t('cancel');

  const cleanup = () => {
    copyBtn.removeEventListener('click', onCopy);
    sendBtn.removeEventListener('click', onSend);
    cancelBtn.removeEventListener('click', onCancel);
  };

  const onCopy = () => {
    cleanup(); _shareModalClose();
    // SOLO la URL — sin título ni mensaje, tal cual pedido.
    navigator.clipboard.writeText(url).then(() => {
      showToast(I18n.t('share_linkCopied'));
    }).catch(() => {
      appAlert(I18n.t('share_copyManualPrefix') + url + draftNote);
    });
  };

  const onSend = () => {
    cleanup(); _shareModalClose();
    if ('share' in navigator) {
      navigator.share({ title, text: shareText, url }).catch(e => {
        if (e.name !== 'AbortError') console.warn('share:', e);
      });
    } else {
      // Sin Web Share API (p.ej. PC sin soporte): no hay "enviar a una app"
      // posible, así que aquí sí se copia el mensaje completo (título +
      // enlace) para pegarlo donde haga falta — comportamiento de siempre.
      navigator.clipboard.writeText(shareText + '\n' + url).then(() => {
        appAlert(I18n.t('share_copiedPrefix') + shareText + '\n' + url + draftNote);
      }).catch(() => {
        appAlert(I18n.t('share_copyManualPrefix') + url + draftNote);
      });
    }
  };

  const onCancel = () => { cleanup(); _shareModalClose(); };

  copyBtn.addEventListener('click', onCopy);
  sendBtn.addEventListener('click', onSend);
  cancelBtn.addEventListener('click', onCancel);

  overlay.style.opacity = '1';
  overlay.style.pointerEvents = 'all';
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
                         background:#fff;box-shadow:2px 2px 0 #000">${I18n.t('cancel')}</button>
          <button id="${_APP_CONFIRM_ID}_ok"
                  style="flex:1;padding:12px;border:2px solid #000;border-radius:10px;
                         font-weight:900;font-size:.9rem;cursor:pointer;
                         background:#ffe566;box-shadow:2px 2px 0 #000">${I18n.t('accept')}</button>
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
  okBtn.textContent = okLabel || I18n.t('accept');
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

/* ══════════════════════════════════════════
   CONTADOR DE CARGA BLOQUEANTE — my-works → editor
   Se inicia al tocar "editar" sobre cualquier obra (ver my-works.js) y
   bloquea toda interacción con la app hasta que el editor general confirma
   que la obra está COMPLETAMENTE cargada (ver EditorView_init / edLoadProject
   en editor.js, a través de window._edFullyLoadedPromise).
   Vive en document.body (fuera de #appView) a propósito: el router SPA
   reemplaza el innerHTML de #appView al navegar de my-works a editor, así
   que un overlay dentro de #appView desaparecería a mitad de la transición.
   ══════════════════════════════════════════ */
let _cxLoadOverlayTimer  = null;
let _cxLoadOverlaySecs   = 0;
let _cxLoadOverlaySafety = null;

function _cxLoadOverlayShow(title) {
  let ov = document.getElementById('_cxLoadOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '_cxLoadOverlay';
    ov.style.cssText = [
      'position:fixed;inset:0;z-index:999999',
      'background:rgba(0,0,0,0.82)',
      'display:flex;flex-direction:column;align-items:center;justify-content:center',
      'color:#fff;font-family:sans-serif;text-align:center;padding:24px',
      'touch-action:none'
    ].join(';');
    ov.innerHTML = `
      <img src="loading-icon.png?v=36.42" alt="${I18n.t('loadingAlt')}" style="width:48px;height:auto;margin-bottom:16px">
      <div id="_cxLoadOvTitle" style="font-size:1.1rem;font-weight:700;margin-bottom:16px"></div>
      <span id="_cxLoadOvSecs" style="font-size:.9rem;opacity:.8">0s</span>
    `;
    // Bloquear scroll/gestos por debajo aunque algo intente moverse mientras carga
    ov.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.body.appendChild(ov);
  }
  const titleEl = document.getElementById('_cxLoadOvTitle');
  if (titleEl) titleEl.textContent = title || I18n.t('mc_openingWork');
  _cxLoadOverlaySecs = 0;
  const secsEl = document.getElementById('_cxLoadOvSecs');
  if (secsEl) secsEl.textContent = '0s';
  clearInterval(_cxLoadOverlayTimer);
  _cxLoadOverlayTimer = setInterval(() => {
    _cxLoadOverlaySecs++;
    const el = document.getElementById('_cxLoadOvSecs');
    if (el) el.textContent = _cxLoadOverlaySecs + 's';
  }, 1000);
  // Seguridad: nunca bloquear la app de forma permanente si algo falla y ningún
  // camino de código llega a llamar a _cxLoadOverlayHide().
  clearTimeout(_cxLoadOverlaySafety);
  _cxLoadOverlaySafety = setTimeout(() => {
    _cxLoadOverlayHide();
    if (typeof showToast === 'function') showToast(I18n.t('loadingSlowWarn'));
  }, 25000);
  ov.style.display = 'flex';
}

function _cxLoadOverlayUpdate(title) {
  const el = document.getElementById('_cxLoadOvTitle');
  if (el) el.textContent = title;
}

function _cxLoadOverlayHide() {
  clearInterval(_cxLoadOverlayTimer);
  clearTimeout(_cxLoadOverlaySafety);
  const ov = document.getElementById('_cxLoadOverlay');
  if (ov) ov.style.display = 'none';
}

function appAlert(msg) {
  const overlay  = _appConfirmGetEl();
  const msgEl    = document.getElementById(`${_APP_CONFIRM_ID}_msg`);
  const okBtn    = document.getElementById(`${_APP_CONFIRM_ID}_ok`);
  const cancelBtn= document.getElementById(`${_APP_CONFIRM_ID}_cancel`);
  msgEl.textContent = msg;
  okBtn.textContent = I18n.t('accept');
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

/* ══════════════════════════════════════════
   TECLADO VIRTUAL EN MODALES CON CAMPOS
   Afecta a: login/registro (.auth-card), cambiar/recuperar contraseña
   (.pwd-modal-card), nuevo proyecto en Mis Creaciones (.mc-modal-box),
   datos del proyecto del editor (.ed-modal-sheet) y el genérico .modal-box
   — los mismos 5 selectores que main.css ya agrupa bajo el comentario
   "Teclado virtual" (max-height:92dvh + overflow-y:auto). Esa regla por sí
   sola no basta: la app usa <meta viewport interactive-widget=
   overlays-content> (necesario para el editor, ver _tdSyncViewportHeight
   en editor-textdoc.js) y bajo ese modo NI window.innerHeight NI
   window.visualViewport.height reflejan el teclado — se quedan midiendo la
   pantalla completa aunque el teclado esté abierto tapando media pantalla
   (confirmado ya una vez al resolver este mismo problema para el editor de
   textos). Por eso dvh tampoco sirve aquí: no es un tamaño de viewport el
   que cambia, es un elemento flotante tapando por encima sin que el
   navegador considere que haya ningún "desbordamiento" que scrollear.

   Se reutiliza la MISMA técnica ya probada en editor-textdoc.js (no la
   Visual Viewport API sola, que ahí se demostró que no sirve en esta app):
   combinar navigator.virtualKeyboard.boundingRect.height con una sonda CSS
   invisible ligada a env(keyboard-inset-height), quedándose con el mayor
   de los dos. Sonda propia (_kbModalProbe), independiente de #tdKbProbe,
   para no tocar el sistema del editor de textos — ya afinado y delicado —
   por algo que cuesta nada duplicar (un div de 1px invisible).
   ══════════════════════════════════════════ */
const _KB_MODAL_SEL = '.auth-card, .pwd-modal-card, .mc-modal-box, .ed-modal-sheet, .modal-box';
const _KB_MODAL_MIN_H = 80; // px — por debajo de esto se considera "teclado cerrado" (filtra ruido)
let _kbModalAdjustedCard = null;
let _kbModalPollTimer = null;

function _kbModalProbeEl() {
  let probe = document.getElementById('_kbModalProbe');
  if (!probe) {
    probe = document.createElement('div');
    probe.id = '_kbModalProbe';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;height:env(keyboard-inset-height, 0px);';
    document.body.appendChild(probe);
  }
  return probe;
}

function _kbModalReadHeight() {
  let apiH = 0;
  if ('virtualKeyboard' in navigator) {
    try { apiH = navigator.virtualKeyboard.boundingRect.height || 0; } catch (_e) { /* API presente pero rechaza leerse: seguir con la sonda CSS */ }
  }
  const probeH = _kbModalProbeEl().getBoundingClientRect().height || 0;
  return Math.max(apiH, probeH);
}

function _kbModalResetCard(card) {
  if (!card) return;
  card.style.maxHeight = '';
  if (card.parentElement) card.parentElement.style.alignItems = '';
}

function _kbModalAdjust() {
  const active = document.activeElement;
  const card = (active && active.closest) ? active.closest(_KB_MODAL_SEL) : null;
  const kbH  = _kbModalReadHeight();

  if (card && kbH > _KB_MODAL_MIN_H) {
    if (_kbModalAdjustedCard && _kbModalAdjustedCard !== card) _kbModalResetCard(_kbModalAdjustedCard);
    // Base "pantalla completa" — bajo overlays-content ninguna de las dos
    // refleja el teclado, así que sirven igual; se prefiere visualViewport
    // por si acaso algún día refleja además la barra de URL del navegador.
    const baseH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const safeHeight = Math.max(120, Math.round(baseH - kbH - 24));
    card.style.maxHeight = safeHeight + 'px';
    // Alinear arriba mientras el teclado está abierto: si el modal se queda
    // centrado en el alto COMPLETO (que no se encoge), el centrado se calcula
    // sobre una caja más alta de lo que en realidad se ve y la tarjeta puede
    // quedar recolocada fuera de la zona visible real, aunque ya quepa entera.
    if (card.parentElement) card.parentElement.style.alignItems = 'flex-start';
    _kbModalAdjustedCard = card;
  } else if (_kbModalAdjustedCard) {
    _kbModalResetCard(_kbModalAdjustedCard);
    _kbModalAdjustedCard = null;
  }
}

if ('virtualKeyboard' in navigator) {
  try {
    navigator.virtualKeyboard.overlaysContent = true;
    navigator.virtualKeyboard.addEventListener('geometrychange', () => _kbModalAdjust());
  } catch (_e) { /* contexto no seguro u otro motivo por el que la API rechace activarse */ }
}

document.addEventListener('focusin', e => {
  const t = e.target;
  if (!t || !t.closest || !t.closest(_KB_MODAL_SEL)) return;
  // El evento de foco llega antes de que el teclado termine de animarse (el
  // retardo varía bastante entre dispositivos) — se reintenta varias veces
  // en vez de fiarse de una sola lectura, mismo patrón que en
  // editor-textdoc.js para este mismo problema.
  [50, 200, 400, 650].forEach(ms => setTimeout(() => {
    _kbModalAdjust();
    t.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, ms));
  clearInterval(_kbModalPollTimer);
  _kbModalPollTimer = setInterval(_kbModalAdjust, 350);
});

document.addEventListener('focusout', e => {
  const t = e.target;
  if (!t || !t.closest || !t.closest(_KB_MODAL_SEL)) return;
  clearInterval(_kbModalPollTimer);
  setTimeout(_kbModalAdjust, 50);
});
