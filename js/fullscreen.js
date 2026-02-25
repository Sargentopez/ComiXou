/* ============================================================
   fullscreen.js  v4.6
   Sin navigationUI para evitar franja negra en Android.
   ============================================================ */

const Fullscreen = (() => {

  const GRANT_KEY = 'cx_fs_granted';

  function inPWA() {
    return window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: standalone)').matches
      || !!window.navigator.standalone;
  }

  function supported() {
    return !!(document.documentElement.requestFullscreen
           || document.documentElement.webkitRequestFullscreen);
  }

  function isActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function enter() {
    if (!supported() || isActive()) return Promise.resolve();
    const el  = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    // Sin opciones: el SO gestiona su propia barra de sistema de forma nativa.
    // Pasar { navigationUI:'hide' } provoca franja negra en Android Chrome.
    return req.call(el)
      .then(() => localStorage.setItem(GRANT_KEY, '1'))
      .catch(() => {});
  }

  function exit() {
    if (!isActive()) return;
    (document.exitFullscreen || document.webkitExitFullscreen
     || function(){}).call(document);
  }

  let _watching = false;
  function _watchVisibility() {
    if (_watching) return;
    _watching = true;
    const reenter = () => { if (!isActive()) enter(); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reenter();
    });
    window.addEventListener('focus',    reenter);
    window.addEventListener('pageshow', reenter);
  }

  function _updateBtn() {
    const btn = document.getElementById('hdrFsBtn');
    if (!btn) return;
    const active = isActive();
    btn.title       = active ? 'Salir pantalla completa' : 'Pantalla completa';
    btn.textContent = '⛶';
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  // Llamado al pulsar ⛶ en el header
  function request() {
    if (isActive()) {
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

  return { init, enter, exit, request, inPWA, supported, isActive, _updateBtn };
})();
