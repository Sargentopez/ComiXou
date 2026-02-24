/* ============================================================
   fullscreen.js — Gestión de pantalla completa en PWA
   Llamar a Fullscreen.init() DESPUÉS de que el DOM esté listo.
   ============================================================ */

const Fullscreen = (() => {

  const GRANT_KEY = 'cx_fs_granted';
  const SKIP_KEY  = 'cx_fs_skip';

  function inPWA() {
    return window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: standalone)').matches
      || !!window.navigator.standalone;
  }

  function supported() {
    return !!document.documentElement.requestFullscreen;
  }

  function enter() {
    if (!supported() || document.fullscreenElement) return Promise.resolve();
    return document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => { localStorage.setItem(GRANT_KEY, '1'); })
      .catch(() => {});
  }

  // Llamado desde views.js al renderizar home
  // El prompt #fullscreenPrompt ya existe en el DOM en este momento
  function init() {
    if (!inPWA() || !supported()) return;
    if (localStorage.getItem(SKIP_KEY)) return;

    // Si ya fue concedido antes: reactivar silenciosamente
    if (localStorage.getItem(GRANT_KEY)) {
      enter();
      // Reactivar al volver de minimizar
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') enter();
      });
      return;
    }

    // Primera vez: mostrar el prompt
    const prompt = document.getElementById('fullscreenPrompt');
    if (!prompt) return;
    prompt.classList.add('visible');

    document.getElementById('fullscreenBtn').addEventListener('click', () => {
      enter().then(() => {
        prompt.classList.remove('visible');
        // Reactivar al volver de minimizar desde ahora
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') enter();
        });
      });
    });

    document.getElementById('fullscreenSkip').addEventListener('click', () => {
      localStorage.setItem(SKIP_KEY, '1');
      prompt.classList.remove('visible');
    });
  }

  return { init, enter };
})();
