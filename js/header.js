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
   header.js — Cabecera global SPA  v4.5
   Fila 1: logo (+ tagline centrado bajo el logo) + usuario
   Fila 2: acciones de sistema (⛶ FS  |  📱 Abrir app)
   ============================================================ */

const Header = (() => {

  function T(key) {
    return typeof I18n !== 'undefined' ? I18n.t(key) : key;
  }

  /* ── ¿Estamos dentro de la PWA instalada? ── */
  function _inApp() {
    return window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: standalone)').matches
      || !!window.navigator.standalone;
  }

  /* ── ¿La app está instalada en el dispositivo? ── */
  function _appInstalled() {
    return !!localStorage.getItem('cx_app_installed');
  }

  function _html() {
    const user = Auth.currentUser();
    const inApp = _inApp();

    /* bloque usuario */
    var userBlock;
    if (user) {
      var adminLink = user.role === 'admin'
        ? '<a href="#admin" class="dropdown-item admin-item" data-route="admin">' + T('adminPanel') + '</a>'
        : '';
      userBlock = '<div class="dropdown">'
        + '<button class="home-user-link" id="avatarBtn">'
        + (user.role === 'admin' ? '⚙️ ' : '')
        + escHtml(user.username) + ' ▾</button>'
        + '<div class="dropdown-menu" id="avatarMenu">'
        + '<a href="#editor" class="dropdown-item" data-route="my-works">' + T('myWorks') + '</a>'
        + adminLink
        + '<div class="dropdown-divider"></div>'
        + '<a href="#" class="dropdown-item" id="avatarChangePassword">' + T('changePassword') + '</a>'
        + '<a href="#" class="dropdown-item" id="logoutBtn">' + T('logout') + '</a>'
        + '</div></div>';
    } else {
      userBlock = '<div class="home-guest">'
        + '<a href="#register" class="home-user-link" data-route="register">' + T('register') + '</a>'
        + '<span class="home-user-sep">·</span>'
        + '<a href="#login" class="home-user-link" data-route="login">' + T('login') + '</a>'
        + '</div>';
    }

    var dotsItems = user
      ? '<a href="#" class="dropdown-item danger-item" id="dotsDeleteAccount">' + T('deleteAccount') + '</a>'
      : '<a href="#register" class="dropdown-item" data-route="register">' + T('register') + '</a>';

    /* ── Botón pantalla completa — se renderiza siempre, se oculta en app por CSS ── */
    var fsSupported = !!(document.documentElement.requestFullscreen
                      || document.documentElement.webkitRequestFullscreen);
    /* Botón "Abrir app" — solo si instalada y en browser */
    var openAppBtn = (!inApp && _appInstalled())
      ? '<button class="hdr-sys-btn hdr-open-app-btn" id="hdrOpenAppBtn" title="' + T('header_openAppTitle') + '">App</button>'
      : '';

    var sysBtns = openAppBtn
      ? '<div class="hdr-sys-btns">' + openAppBtn + '</div>'
      : '';

    /* Botón pantalla completa — ahora en row1, a la derecha del logo, con texto adaptativo */
    var fsBtnHtml = fsSupported
      ? '<button class="hdr-fs-row2-btn" id="hdrFsBtn" title="' + T('header_fullscreenTitle') + '" aria-pressed="false">'
        + '<span class="hdr-fs-label-long">' + T('header_fullscreenLong') + '</span>'
        + '<span class="hdr-fs-label-short">' + T('header_fullscreenShort') + '</span>'
        + ' ⛶</button>'
      : '';

    /* Ítem "Instalar app" en el menú ⋮ — oculto si ya es app */
    var installItem = inApp
      ? ''
      : '<a href="#" class="dropdown-item" id="installMenuItem">📲 ' + T('installApp') + '</a>';

    return '<header class="site-header home-header" id="siteHeader">'
      + '<div class="home-header-inner">'
        + '<div class="home-header-row1">'
          + '<div class="home-logo-area">'
            + '<a href="#home" class="logo-link logo-img-link" data-route="home">'
              + '<img src="icon.svg" alt="" class="home-icon-img">'
              + '<img src="logo.svg" alt="Comxow" class="logo-img">'
            + '</a>'
            + '<span class="home-tagline">' + T('tagline') + '</span>'
          + '</div>'
          + fsBtnHtml
        + '</div>'
        /* Fila 2: usuario (avatar + menú ⋮) a la derecha — el botón de
           pantalla completa pasó a la fila 1, petición explícita de Alberto
           de intercambiar el orden de ambas filas. */
        + '<div class="home-header-row2">'
          + '<div class="home-user-area">'
            + sysBtns
            + userBlock
            + '<div class="dropdown">'
              + '<button class="home-dots-btn" id="dotsBtn">⋮</button>'
              + '<div class="dropdown-menu dropdown-menu-right" id="dotsMenu">'
                + dotsItems
                + installItem
                + '<div class="dropdown-divider"></div>'
                + '<a href="#" class="dropdown-item" id="dotsLanguage">🌐 ' + T('menuLanguage') + '</a>'
                + '<a href="#" class="dropdown-item" id="dotsTerms">📄 ' + T('intro_termsTitle') + '</a>'
                + '<a href="#" class="dropdown-item" id="dotsInfo">ℹ️ Info</a>'
                + '<div class="dropdown-item" style="display:flex;align-items:center;gap:8px">'
                  + '<a href="mailto:contacto@comxow.com" style="flex:1;min-width:0;color:inherit;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">✉️ contacto@comxow.com</a>'
                  + '<button id="dotsContactCopy" title="' + T('home_copyEmailTitle') + '" style="flex-shrink:0;border:none;background:transparent;cursor:pointer;padding:2px 4px;font-size:1rem;color:inherit;line-height:1">📋</button>'
                + '</div>'
              + '</div>'
            + '</div>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</header>';
  }

  function _bind() {
    /* ── Routing ── */
    document.getElementById('siteHeader').addEventListener('click', function(e) {
      var el = e.target.closest('[data-route]');
      if (!el) return;
      e.preventDefault();
      Router.go(el.dataset.route);
    });

    /* ── Dropdowns ── */
    function bindDropdown(btnId, menuId) {
      var btn  = document.getElementById(btnId);
      var menu = document.getElementById(menuId);
      if (!btn || !menu) return;
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var open = menu.classList.contains('open');
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
        if (!open) menu.classList.add('open');
      });
    }
    bindDropdown('avatarBtn', 'avatarMenu');
    bindDropdown('dotsBtn', 'dotsMenu');

    /* ── Copiar correo de contacto — mismo patrón que "Copiar enlace"
       (navigator.clipboard + showToast, con appAlert como fallback si el
       navegador no lo soporta o deniega el permiso). No debe abrir también
       el cliente de correo: por eso preventDefault+stopPropagation, ya que
       este botón vive junto al enlace mailto:, no dentro de él. ── */
    var contactCopyBtn = document.getElementById('dotsContactCopy');
    if (contactCopyBtn) {
      contactCopyBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var email = 'contacto@comxow.com';
        navigator.clipboard.writeText(email).then(function() {
          showToast(T('home_contactCopied'));
        }).catch(function() {
          appAlert(email);
        });
      });
    }

    document.addEventListener('click', function() {
      document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    });

    /* ── Logout ── */
    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        await Auth.logout();
        Header.refresh();
        Router.go('home');
      });
    }

    /* ── Eliminar cuenta ── */
    var delBtn = document.getElementById('dotsDeleteAccount');
    if (delBtn) {
      delBtn.addEventListener('click', function(e) {
        e.preventDefault();
        // v38.27 — unificado con edConfirm() (editor.js): evita el confirm()
        // nativo, que rompe la pantalla completa en Android. edConfirm cae
        // sola al confirm() nativo si su modal no está en el DOM de esta
        // página (ver su propio código), así que esto no puede ir peor que
        // antes en ningún caso, solo mejor donde el modal sí esté disponible.
        edConfirm(T('confirmDeleteAccount'), async () => {
          var u = Auth.currentUser();
          if (u) WorkStore.getByUser(u.id).forEach(c => WorkStore.remove(c.id));
          await Auth.deleteAccount();
          Header.refresh();
          Router.go('home');
        }, T('accept'));
      });
    }

    /* ── Cambiar contraseña ── */
    var pwdBtn = document.getElementById('avatarChangePassword');
    if (pwdBtn) {
      pwdBtn.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
        if (typeof openChangePasswordModal === 'function') openChangePasswordModal();
      });
    }

    /* ── Idioma ── */
    var langBtn = document.getElementById('dotsLanguage');
    if (langBtn) {
      langBtn.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
        if (typeof openLanguageModal === 'function') openLanguageModal();
      });
    }

    /* ── Condiciones de uso — accedida ya dentro de la app (condiciones
       necesariamente ya aceptadas), así que "Volver" en esa vista sí debe
       llevar de vuelta a la app; ver _termsViewInit / botón Volver. ── */
    var termsBtn = document.getElementById('dotsTerms');
    if (termsBtn) {
      termsBtn.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
        Router.go('terms');
      });
    }

    /* ── Info / Créditos ── */
    var infoBtn = document.getElementById('dotsInfo');
    if (infoBtn) {
      infoBtn.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
        if (typeof openCreditsModal === 'function') openCreditsModal();
      });
    }

    /* ── Instalar app ── */
    var installBtn = document.getElementById('installMenuItem');
    if (installBtn) {
      installBtn.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
        if (window.__pwaPrompt) {
          window.__pwaPrompt.prompt();
          window.__pwaPrompt.userChoice.then(() => { window.__pwaPrompt = null; });
        } else {
          var msg = I18n.t('header_installTip');
          if (typeof appAlert === 'function') appAlert(msg); else alert(msg);
        }
      });
    }

    /* ── Botón pantalla completa ── */
    var fsBtn = document.getElementById('hdrFsBtn');
    if (fsBtn) {
      fsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          // Salir
          (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
        } else {
          if (typeof Fullscreen !== 'undefined') Fullscreen.request();
        }
      });
      // Estado inicial
      if (typeof Fullscreen !== 'undefined') Fullscreen._updateBtn();
    }

    /* ── Botón "Abrir app" ── */
    var openAppBtn = document.getElementById('hdrOpenAppBtn');
    if (openAppBtn) {
      openAppBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        /* Intentar abrir la PWA instalada via manifest start_url */
        var startUrl = '/index.html'; // ajustar si el manifest tiene otro
        window.open(startUrl, '_blank');
      });
    }
  }

  function init() {
    var existing = document.getElementById('siteHeader');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('afterbegin', _html());
    _bind();
    // Init fullscreen after header is in DOM (button exists now)
    if (typeof Fullscreen !== 'undefined') Fullscreen.init();
  }

  function refresh() {
    var existing = document.getElementById('siteHeader');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('afterbegin', _html());
    _bind();
    if (typeof Fullscreen !== 'undefined') Fullscreen._updateBtn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { refresh, init };

})();
