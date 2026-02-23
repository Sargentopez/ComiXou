/* ============================================================
   pwa.js — Registro del Service Worker y banner de instalación
   Incluir en todas las páginas que quieran mostrar el banner.
   ============================================================ */

(function () {
  // ── Fullscreen API: eliminar banda negra en Android PWA ──
  // El manifest pide fullscreen pero Chrome Android a veces deja una banda negra.
  // Llamar a requestFullscreen() garantiza que el contenido ocupa toda la pantalla.
  function requestNativeFullscreen() {
    var el = document.documentElement;
    var isFullscreenMode = window.matchMedia('(display-mode: fullscreen)').matches;
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone;

    if ((isFullscreenMode || isStandalone) && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' }).catch(function() {
        // El navegador puede rechazarlo si no hay gesto del usuario — silenciar
      });
    }
  }

  // Intentar al cargar y también al primer toque del usuario
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(requestNativeFullscreen, 300);
  });
  document.addEventListener('touchend', function handler() {
    requestNativeFullscreen();
    document.removeEventListener('touchend', handler);
  }, { once: true });

  // ── Registrar Service Worker ──
  if ('serviceWorker' in navigator) {
    const swPath = window.location.pathname.includes('/pages/')
      ? '../sw.js'
      : './sw.js';
    navigator.serviceWorker.register(swPath)
      .catch(err => console.warn('SW error:', err));
  }

  // ── Banner de instalación ──
  let deferredPrompt = null;
  const DISMISSED_KEY = 'cx_install_dismissed';

  // Escuchar evento nativo del navegador
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.__pwaPrompt = e; // accesible desde header.js
    // Solo mostrar si no lo han descartado antes
    if (!localStorage.getItem(DISMISSED_KEY)) {
      showBanner();
    }
  });

  function showBanner() {
    // Crear banner si no existe ya
    if (document.getElementById('installBanner')) return;

    const lang = localStorage.getItem('cs_lang') ||
      (navigator.language || 'es').slice(0, 2);
    const msg = lang === 'en'
      ? 'Install me on your device and you can use me fullscreen and offline'
      : 'Instálame en tu dispositivo y podrás utilizarme a pantalla completa y offline';
    const installText = lang === 'en' ? 'Install' : 'Instalar';
    const laterText   = lang === 'en' ? 'Not now' : 'Ahora no';

    const banner = document.createElement('div');
    banner.id = 'installBanner';
    banner.className = 'install-banner';
    banner.innerHTML = `
      <div class="install-banner-icon">📲</div>
      <div class="install-banner-text">
        <strong>ComiXow</strong>
        ${msg}
      </div>
      <div class="install-banner-actions">
        <button class="install-btn install-btn-ok" id="installBtnOk">${installText}</button>
        <button class="install-btn install-btn-dismiss" id="installBtnDismiss">${laterText}</button>
      </div>
    `;
    document.body.appendChild(banner);

    // Mostrar con animación tras un pequeño delay
    requestAnimationFrame(() => {
      requestAnimationFrame(() => banner.classList.add('visible'));
    });

    // Botón instalar
    document.getElementById('installBtnOk').addEventListener('click', () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
          hideBanner();
        }
        deferredPrompt = null;
        window.__pwaPrompt = null;
      });
    });

    // Botón descartar
    document.getElementById('installBtnDismiss').addEventListener('click', () => {
      localStorage.setItem(DISMISSED_KEY, '1');
      hideBanner();
    });
  }

  function hideBanner() {
    const banner = document.getElementById('installBanner');
    if (!banner) return;
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 400);
  }

  // En iOS Safari no hay beforeinstallprompt — detectar manualmente
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone;

  if (isIos && !isInStandaloneMode && !localStorage.getItem(DISMISSED_KEY)) {
    // En iOS mostrar el banner con instrucciones específicas tras 2s
    setTimeout(() => {
      if (document.getElementById('installBanner')) return;
      const lang = localStorage.getItem('cs_lang') ||
        (navigator.language || 'es').slice(0, 2);
      const msg = lang === 'en'
        ? 'Tap <strong>Share ↑</strong> then <strong>"Add to Home Screen"</strong> to install ComiXow and use it fullscreen and offline'
        : 'Pulsa <strong>Compartir ↑</strong> y luego <strong>"Añadir a inicio"</strong> para instalar ComiXow y usarla a pantalla completa y offline';
      const okText = lang === 'en' ? 'Got it' : 'Entendido';

      const banner = document.createElement('div');
      banner.id = 'installBanner';
      banner.className = 'install-banner';
      banner.innerHTML = `
        <div class="install-banner-icon">📲</div>
        <div class="install-banner-text">
          <strong>ComiXow</strong>
          ${msg}
        </div>
        <div class="install-banner-actions">
          <button class="install-btn install-btn-dismiss" id="installBtnDismiss">${okText}</button>
        </div>
      `;
      document.body.appendChild(banner);
      requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('visible')));
      document.getElementById('installBtnDismiss').addEventListener('click', () => {
        localStorage.setItem(DISMISSED_KEY, '1');
        banner.classList.remove('visible');
        setTimeout(() => banner.remove(), 400);
      });
    }, 2000);
  }
})();
