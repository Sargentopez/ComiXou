/* ============================================================
   header.js — Cabecera global SPA
   Se inyecta una sola vez. Se refresca con Header.refresh()
   cuando cambia la sesión (login / logout).
   ============================================================ */

const Header = (() => {

  function T(key) {
    return typeof I18n !== 'undefined' ? I18n.t(key) : key;
  }

  function _html() {
    const user = Auth.currentUser();

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
        + '<a href="#editor" class="dropdown-item" data-route="editor">' + T('myComics') + '</a>'
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

    return '<header class="site-header home-header" id="siteHeader">'
      + '<div class="home-header-inner">'
        + '<div class="home-header-row1">'
          + '<div class="home-logo-area">'
            + '<a href="#home" class="logo-link" data-route="home">'
              + '<span class="logo-main"><span class="logo-big">C</span>omi<span class="logo-accent"><span class="logo-big">X</span>ow</span></span>'
            + '</a>'
          + '</div>'
          + '<div class="home-user-area">'
            + userBlock
            + '<div class="dropdown">'
              + '<button class="home-dots-btn" id="dotsBtn">⋮</button>'
              + '<div class="dropdown-menu dropdown-menu-right" id="dotsMenu">'
                + dotsItems
                + '<a href="#" class="dropdown-item" id="installMenuItem">📲 ' + T('installApp') + '</a>'
                + '<div class="dropdown-divider"></div>'
                + '<span class="dropdown-item disabled-item">ℹ️ Info</span>'
                + '<span class="dropdown-item disabled-item">✉️ Contacto</span>'
                + '<span class="dropdown-item disabled-item">☕ Invítame a un café</span>'
              + '</div>'
            + '</div>'
          + '</div>'
        + '</div>'
        + '<div class="home-tagline">' + T('tagline') + '</div>'
      + '</div>'
    + '</header>';
  }

  function _bind() {
    // ── Routing por data-route ──
    document.getElementById('siteHeader').addEventListener('click', function(e) {
      var el = e.target.closest('[data-route]');
      if (!el) return;
      e.preventDefault();
      Router.go(el.dataset.route);
    });

    // ── Dropdowns ──
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

    // ── Logout ──
    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        Auth.logout();
        Header.refresh();
        Router.go('home');
      });
    }

    // ── Eliminar cuenta ──
    var delBtn = document.getElementById('dotsDeleteAccount');
    if (delBtn) {
      delBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (!confirm(T('confirmDeleteAccount'))) return;
        var u = Auth.currentUser();
        if (u) ComicStore.getByUser(u.id).forEach(c => ComicStore.remove(c.id));
        Auth.deleteAccount();
        Header.refresh();
        Router.go('home');
      });
    }

    // ── Instalar app ──
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
          alert(lang === 'en'
            ? 'Tap Share ↑ then "Add to Home Screen"'
            : 'Pulsa Compartir ↑ y luego "Añadir a inicio"');
        }
      });
      var isInstalled = window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: fullscreen)').matches
        || window.navigator.standalone;
      if (isInstalled) installBtn.style.display = 'none';
    }

    // ── Fullscreen ──
    _initFullscreen();
  }

  function _initFullscreen() {
    var inPWA = window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone;
    if (!inPWA || !document.documentElement.requestFullscreen) return;

    var GRANT_KEY = 'cx_fs_granted';
    var SKIP_KEY  = 'cx_fs_skip';

    function enter() {
      if (document.fullscreenElement) return;
      document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        .then(() => localStorage.setItem(GRANT_KEY, '1'))
        .catch(() => {});
    }

    // Ya concedido antes → reactivar automáticamente
    if (localStorage.getItem(GRANT_KEY) && !localStorage.getItem(SKIP_KEY)) {
      setTimeout(enter, 100);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') setTimeout(enter, 100);
      });
    }

    // Prompt primera vez (solo existe en home)
    var prompt = document.getElementById('fullscreenPrompt');
    if (prompt && !localStorage.getItem(SKIP_KEY) && !localStorage.getItem(GRANT_KEY)) {
      prompt.classList.add('visible');
      document.getElementById('fullscreenBtn').addEventListener('click', () => {
        document.documentElement.requestFullscreen({ navigationUI: 'hide' })
          .then(() => { localStorage.setItem(GRANT_KEY, '1'); prompt.classList.remove('visible'); })
          .catch(() => prompt.classList.remove('visible'));
      });
      document.getElementById('fullscreenSkip').addEventListener('click', () => {
        localStorage.setItem(SKIP_KEY, '1');
        prompt.classList.remove('visible');
      });
    }
  }

  function init() {
    var existing = document.getElementById('siteHeader');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('afterbegin', _html());
    _bind();
  }

  function refresh() {
    var existing = document.getElementById('siteHeader');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('afterbegin', _html());
    _bind();
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { refresh, init };

})();
