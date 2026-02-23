/* ============================================================
   header.js — Cabecera global única
   Se carga en todas las páginas excepto reader.html
   Depende de: auth.js (debe cargarse antes)
   ============================================================ */
(function () {
  const inPages = window.location.pathname.includes('/pages/');
  const root    = inPages ? '../' : '';
  const user    = Auth.currentUser();
  const T       = function(key) { return (typeof I18n !== 'undefined') ? I18n.t(key) : key; };

  // Bloque usuario (evita backticks anidados)
  var userBlock;
  if (user) {
    var adminLink = user.role === 'admin'
      ? '<a href="' + root + 'pages/admin.html" class="dropdown-item admin-item">' + T('adminPanel') + '</a>'
      : '';
    userBlock = '<div class="dropdown">'
      + '<button class="home-user-link" id="avatarBtn">'
      + (user.role === 'admin' ? '⚙️ ' : '')
      + user.username + ' ▾</button>'
      + '<div class="dropdown-menu" id="avatarMenu">'
      + '<a href="' + root + 'pages/editor.html" class="dropdown-item">' + T('myComics') + '</a>'
      + adminLink
      + '<div class="dropdown-divider"></div>'
      + '<a href="#" class="dropdown-item" id="logoutBtn">' + T('logout') + '</a>'
      + '</div></div>';
  } else {
    userBlock = '<div class="home-guest">'
      + '<a href="' + root + 'pages/register.html" class="home-user-link">' + T('register') + '</a>'
      + '<span class="home-user-sep">·</span>'
      + '<a href="' + root + 'pages/login.html" class="home-user-link">' + T('login') + '</a>'
      + '</div>';
  }

  // Menú ⋮
  var dotsItems = user
    ? '<a href="#" class="dropdown-item danger-item" id="dotsDeleteAccount">' + T('deleteAccount') + '</a>'
    : '<a href="' + root + 'pages/register.html" class="dropdown-item">' + T('register') + '</a>';

  var html = '<header class="site-header home-header" id="siteHeader">'
    + '<div class="home-header-inner">'
      + '<div class="home-logo-area">'
        + '<a href="' + root + 'index.html" class="logo-link">'
          + '<span class="logo-main"><span class="logo-big">C</span>omi<span class="logo-accent"><span class="logo-big">X</span>ow</span></span>'
        + '</a>'
        + '<span class="home-tagline">' + T('tagline') + '</span>'
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
  + '</header>';

  // Inyectar al inicio del body
  document.body.insertAdjacentHTML('afterbegin', html);

  // Ajustar padding-top del body según altura real de la cabecera (páginas sin barra 2)
  if (!document.getElementById('pageNav')) {
    var adjustPadding = function() {
      var hdr = document.getElementById('siteHeader');
      if (hdr) document.body.style.paddingTop = hdr.offsetHeight + 'px';
    };
    // Ejecutar tras render
    requestAnimationFrame(adjustPadding);
    window.addEventListener('resize', adjustPadding);
  }

  // ── Dropdowns ──
  function bind(btnId, menuId) {
    var btn  = document.getElementById(btnId);
    var menu = document.getElementById(menuId);
    if (!btn || !menu) return;
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var wasOpen = menu.classList.contains('open');
      document.querySelectorAll('.dropdown-menu').forEach(function(m) { m.classList.remove('open'); });
      if (!wasOpen) menu.classList.add('open');
    });
  }
  bind('avatarBtn', 'avatarMenu');
  bind('dotsBtn',   'dotsMenu');

  document.addEventListener('click', function() {
    document.querySelectorAll('.dropdown-menu').forEach(function(m) { m.classList.remove('open'); });
  });

  // ── Instalar app ──
  var installMenuItem = document.getElementById('installMenuItem');
  if (installMenuItem) {
    // Escuchar el prompt guardado por pwa.js
    installMenuItem.addEventListener('click', function(e) {
      e.preventDefault();
      document.querySelectorAll('.dropdown-menu').forEach(function(m) { m.classList.remove('open'); });
      if (window.__pwaPrompt) {
        window.__pwaPrompt.prompt();
        window.__pwaPrompt.userChoice.then(function() { window.__pwaPrompt = null; });
      } else {
        // iOS o ya instalada
        var lang = localStorage.getItem('cs_lang') || (navigator.language||'es').slice(0,2);
        alert(lang === 'en'
          ? 'To install: tap Share ↑ then "Add to Home Screen"'
          : 'Para instalar: pulsa Compartir ↑ y luego "Añadir a inicio"');
      }
    });
    // Ocultar si ya está instalada en modo standalone
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      installMenuItem.style.display = 'none';
    }
  }

  // ── Cerrar sesión ──
  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      Auth.logout();
      window.location.href = root + 'index.html';
    });
  }

  // ── Eliminar cuenta ──
  var delAccBtn = document.getElementById('dotsDeleteAccount');
  if (delAccBtn) {
    delAccBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (confirm(T('confirmDeleteAccount'))) {
        var u = Auth.currentUser();
        if (window.ComicStore) ComicStore.getByUser(u.id).forEach(function(c) { ComicStore.remove(c.id); });
        Auth.deleteAccount();
        window.location.href = root + 'index.html';
      }
    });
  }
})();
