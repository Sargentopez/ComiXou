/* ============================================================
   fullscreen.js — Gestión robusta de pantalla completa
   ============================================================ */

const Fullscreen = (() => {

  const GRANT_KEY = 'cx_fs_granted';

  function inPWA() {
    return window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: standalone)').matches
      || !!window.navigator.standalone;
  }

  function supported() {
    return !!(
      document.documentElement.requestFullscreen ||
      document.documentElement.webkitRequestFullscreen
    );
  }

  function enter() {
    if (!supported()) return Promise.resolve();
    if (document.fullscreenElement || document.webkitFullscreenElement) return Promise.resolve();
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    return req.call(el, { navigationUI: 'hide' })
      .then(() => { localStorage.setItem(GRANT_KEY, '1'); })
      .catch(() => {});
  }

  // Reactivar al recuperar visibilidad / foco
  function _watchVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') enter();
    });
    window.addEventListener('focus', () => enter());
    window.addEventListener('pageshow', () => enter());
    // Re-enter on first user tap (needed after some browser prompts)
    document.addEventListener('click', function _once() {
      enter();
      document.removeEventListener('click', _once);
    }, { once: true });
  }

  // Llamado desde header.js al pulsar el botón ⛶
  function request() {
    enter().then(() => {
      localStorage.setItem(GRANT_KEY, '1');
      _watchVisibility();
      // Update button state
      _updateBtn();
    });
  }

  function _updateBtn() {
    const btn = document.getElementById('hdrFsBtn');
    if (!btn) return;
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btn.title = active ? 'Salir de pantalla completa' : 'Pantalla completa';
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  // Init: en PWA, intentar entrar automáticamente
  function init() {
    if (!inPWA() || !supported()) return;

    if (localStorage.getItem(GRANT_KEY)) {
      enter();
      _watchVisibility();
    }
    // Escuchar cambios de fullscreen para actualizar botón
    document.addEventListener('fullscreenchange', _updateBtn);
    document.addEventListener('webkitfullscreenchange', _updateBtn);
  }

  return { init, enter, request, inPWA, supported, _updateBtn };
})();
