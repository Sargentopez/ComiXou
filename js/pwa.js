/* ============================================================
   pwa.js — Service Worker, banner de instalación, toast post-install
   ============================================================ */

(function () {

  /* ── Registrar Service Worker ── */
  if ('serviceWorker' in navigator) {
    const swPath = window.location.pathname.includes('/pages/')
      ? '../sw.js' : './sw.js';
    navigator.serviceWorker.register(swPath)
      .catch(err => console.warn('SW error:', err));
  }

  const DISMISSED_KEY  = 'cx_install_dismissed';
  const INSTALLED_KEY  = 'cx_app_installed';
  let deferredPrompt   = null;

  /* ── Detectar si ya estamos como PWA ── */
  function inApp() {
    return window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: standalone)').matches
      || !!window.navigator.standalone;
  }

  /* ── Capturar evento de instalación ── */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.__pwaPrompt = e;
    if (!inApp() && !localStorage.getItem(DISMISSED_KEY)) {
      showInstallBanner();
    }
  });

  /* ── Evento: app instalada con éxito ── */
  window.addEventListener('appinstalled', () => {
    localStorage.setItem(INSTALLED_KEY, '1');
    deferredPrompt = null;
    window.__pwaPrompt = null;
    hideInstallBanner();
    showInstalledToast();
    // Recargar para que el header muestre el botón "Abrir app"
    setTimeout(() => { window.location.reload(); }, 2200);
  });

  /* ══════════════════════════════════════
     BANNER DE INSTALACIÓN
     ══════════════════════════════════════ */
  function showInstallBanner() {
    if (document.getElementById('installBanner')) return;
    const lang = (localStorage.getItem('cs_lang') || navigator.language || 'es').slice(0, 2);
    const msg  = lang === 'en'
      ? 'Install ComiXow on your device — works offline and fullscreen'
      : 'Instala ComiXow en tu dispositivo — funciona sin conexión y a pantalla completa';
    const installLabel = lang === 'en' ? 'Install' : 'Instalar';
    const laterLabel   = lang === 'en' ? 'Not now' : 'Ahora no';

    const banner = document.createElement('div');
    banner.id = 'installBanner';
    banner.className = 'install-banner';
    banner.innerHTML = `
      <div class="install-banner-icon">📲</div>
      <div class="install-banner-text">
        <strong>ComiXow</strong>${msg}
      </div>
      <div class="install-banner-actions">
        <button class="install-btn install-btn-ok"      id="installBtnOk">${installLabel}</button>
        <button class="install-btn install-btn-dismiss" id="installBtnDismiss">${laterLabel}</button>
      </div>`;
    document.body.appendChild(banner);
    requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('visible')));

    document.getElementById('installBtnOk').addEventListener('click', () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(choice => {
        // appinstalled event will fire on acceptance and handle the rest
        deferredPrompt = null; window.__pwaPrompt = null;
      });
    });

    document.getElementById('installBtnDismiss').addEventListener('click', () => {
      localStorage.setItem(DISMISSED_KEY, '1');
      hideInstallBanner();
    });
  }

  function hideInstallBanner() {
    const b = document.getElementById('installBanner');
    if (!b) return;
    b.classList.remove('visible');
    setTimeout(() => b.remove(), 400);
  }

  /* ══════════════════════════════════════
     TOAST "APP INSTALADA"
     ══════════════════════════════════════ */
  function showInstalledToast() {
    const lang = (localStorage.getItem('cs_lang') || navigator.language || 'es').slice(0, 2);
    const msg  = lang === 'en'
      ? '✓ ComiXow installed! You can now open it from your home screen.'
      : '✓ ¡ComiXow instalada! Ya puedes abrirla desde tu pantalla de inicio.';

    const toast = document.createElement('div');
    toast.id = 'installedToast';
    toast.className = 'installed-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  /* ══════════════════════════════════════
     iOS Safari: sin beforeinstallprompt
     ══════════════════════════════════════ */
  const isIos    = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isIos && isSafari && !inApp() && !localStorage.getItem(DISMISSED_KEY)) {
    setTimeout(() => {
      if (document.getElementById('installBanner')) return;
      const lang = (localStorage.getItem('cs_lang') || navigator.language || 'es').slice(0, 2);
      const msg  = lang === 'en'
        ? 'Tap <strong>Share ↑</strong> → <strong>"Add to Home Screen"</strong> to install ComiXow'
        : 'Pulsa <strong>Compartir ↑</strong> → <strong>"Añadir a inicio"</strong> para instalar ComiXow';

      const banner = document.createElement('div');
      banner.id = 'installBanner';
      banner.className = 'install-banner';
      banner.innerHTML = `
        <div class="install-banner-icon">📲</div>
        <div class="install-banner-text"><strong>ComiXow</strong>${msg}</div>
        <div class="install-banner-actions">
          <button class="install-btn install-btn-dismiss" id="installBtnDismiss">
            ${lang === 'en' ? 'Got it' : 'Entendido'}
          </button>
        </div>`;
      document.body.appendChild(banner);
      requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('visible')));
      document.getElementById('installBtnDismiss').addEventListener('click', () => {
        localStorage.setItem(DISMISSED_KEY, '1');
        banner.classList.remove('visible');
        setTimeout(() => banner.remove(), 400);
      });
    }, 2500);
  }

})();
