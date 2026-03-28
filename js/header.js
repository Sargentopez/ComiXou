/* ============================================================
   header.js — Cabecera global SPA  v4.4
   Fila 1: logo + usuario
   Fila 2: tagline  +  acciones de sistema (⛶ FS  |  📱 Abrir app)
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
        + '<a href="#editor" class="dropdown-item" data-route="my-comics">' + T('myComics') + '</a>'
        + adminLink
        + '<div class="dropdown-divider"></div>'
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
      ? '<button class="hdr-sys-btn hdr-open-app-btn" id="hdrOpenAppBtn" title="Abrir app">App</button>'
      : '';

    var sysBtns = openAppBtn
      ? '<div class="hdr-sys-btns">' + openAppBtn + '</div>'
      : '';

    /* Botón pantalla completa — en row2, ajustado a la derecha, con texto adaptativo */
    var fsBtnHtml = fsSupported
      ? '<button class="hdr-fs-row2-btn" id="hdrFsBtn" title="Pantalla completa" aria-pressed="false">'
        + '<span class="hdr-fs-label-long">mejor en pantalla completa</span>'
        + '<span class="hdr-fs-label-short">pantalla completa</span>'
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
            + '<a href="#home" class="logo-link" data-route="home">'
              + '<span class="logo-main"><span class="logo-big">C</span>omi<span class="logo-accent"><span class="logo-big">X</span>ow</span></span>'
            + '</a>'
          + '</div>'
          + '<div class="home-user-area">'
            + sysBtns
            + userBlock
            + '<div class="dropdown">'
              + '<button class="home-dots-btn" id="dotsBtn">⋮</button>'
              + '<div class="dropdown-menu dropdown-menu-right" id="dotsMenu">'
                + dotsItems
                + installItem
                + '<div class="dropdown-divider"></div>'
                + '<span class="dropdown-item disabled-item">ℹ️ Info</span>'
                + '<span class="dropdown-item disabled-item">✉️ Contacto</span>'
                + '<span class="dropdown-item disabled-item">☕ Invítame a un café</span>'
              + '</div>'
            + '</div>'
          + '</div>'
        + '</div>'
        /* Fila 2: tagline izq + botón FS derecha */
        + '<div class="home-header-row2">'
          + '<span class="home-tagline">' + T('tagline') + '</span>'
          + fsBtnHtml
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
      delBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        if (!confirm(T('confirmDeleteAccount'))) return;
        var u = Auth.currentUser();
        if (u) ComicStore.getByUser(u.id).forEach(c => ComicStore.remove(c.id));
        await Auth.deleteAccount();
        Header.refresh();
        Router.go('home');
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
          var lang = localStorage.getItem('cs_lang') || (navigator.language || 'es').slice(0, 2);
          var msg = lang === 'en'
            ? 'Tap Share ↑ then "Add to Home Screen"'
            : 'Pulsa Compartir ↑ y luego "Añadir a inicio"';
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
