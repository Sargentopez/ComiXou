/* ============================================================
   fullscreen.js — Gestión robusta de pantalla completa  v4.5
   REVERTIDO a v4.5: navigationUI:'hide' funciona correctamente.
   El cambio a "sin navigationUI" introducido en v4.6 no resolvía
   ningún problema real y fue revertido.
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
    const el  = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    return req.call(el, { navigationUI: 'hide' })
      .then(() => { localStorage.setItem(GRANT_KEY, '1'); })
      .catch(() => {});
  }

  function exit() {
    (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
  }

  let _watching = false;
  function _watchVisibility() {
    if (_watching) return;
    _watching = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') enter();
    });
    window.addEventListener('focus',    () => enter());
    window.addEventListener('pageshow', () => enter());
    document.addEventListener('click', function _once() {
      enter();
      document.removeEventListener('click', _once);
    }, { once: true });
  }

  function _updateBtn() {
    const btn = document.getElementById('hdrFsBtn');
    if (!btn) return;
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btn.title = active ? 'Salir de pantalla completa' : 'Pantalla completa';
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function request() {
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (active) {
      exit();
    } else {
      enter().then(() => { _watchVisibility(); _updateBtn(); });
    }
  }

  function init() {
    document.addEventListener('fullscreenchange',       _updateBtn);
    document.addEventListener('webkitfullscreenchange', _updateBtn);
    if (!inPWA() || !supported()) return;
    if (localStorage.getItem(GRANT_KEY)) {
      enter().then(() => { _watchVisibility(); _updateBtn(); });
    }
  }

  return { init, enter, exit, request, inPWA, supported, _updateBtn };
})();
