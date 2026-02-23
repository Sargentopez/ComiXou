/* ============================================================
   header.js — Cabecera global única
   Se carga en todas las páginas excepto reader.html
   Depende de: auth.js (debe cargarse antes)
   ============================================================ */
const Header = (() => {
  function _buildHeader() {
  const inPages = false;
  const root    = '';
  const user    = Auth.currentUser();
  const T       = function(key) { return (typeof I18n !== 'undefined') ? I18n.t(key) : key; };

  // Bloque usuario (evita backticks anidados)
  var userBlock;
  if (user) {
    var adminLink = user.role === 'admin'
      ? '<a href="#admin" onclick="Router.go(\'admin\');return false;" class="dropdown-item admin-item">' + T('adminPanel') + '</a>'
      : '';
    userBlock = '<div class="dropdown">'
      + '<button class="home-user-link" id="avatarBtn">'
      + (user.role === 'admin' ? '⚙️ ' : '')
      + user.username + ' ▾</button>'
      + '<div class="dropdown-menu" id="avatarMenu">'
      + '<a href="#editor" onclick="Router.go(\'editor\');return false;" class="dropdown-item">' + T('myComics') + '</a>'
      + adminLink
      + '<div class="dropdown-divider"></div>'
      + '<a href="#" class="dropdown-item" id="logoutBtn">' + T('logout') + '</a>'
      + '</div></div>';
  } else {
    userBlock = '<div class="home-guest">'
      + '<a href="#register" onclick="Router.go(\'register\');return false;" class="home-user-link">' + T('register') + '</a>'
      + '<span class="home-user-sep">·</span>'
      + '<a href="#login" onclick="Router.go(\'login\');return false;" class="home-user-link">' + T('login') + '</a>'
      + '</div>';
  }

  // Menú ⋮
  var dotsItems = user
    ? '<a href="#" class="dropdown-item danger-item" id="dotsDeleteAccount">' + T('deleteAccount') + '</a>'
    : '<a href="#register" onclick="Router.go(\'register\');return false;" class="dropdown-item">' + T('register') + '</a>';

  var html = '<header class="site-header home-header" id="siteHeader">'
    + '<div class="home-header-inner">'
      + '<div class="home-header-row1">'
        + '<div class="home-logo-area">'
          + '<a href="#home" onclick="Router.go(\'home\');return false;" class="logo-link">'
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

  // Inyectar al inicio del body
  document.body.insertAdjacentHTML('afterbegin', html);



  // Ajustar padding-top del body según altura real de la cabecera (páginas sin barra 2)
  if (!document.getElementById('pageNav')) {
    var adjustPadding = function() {
      var hdr = document.getElementById('siteHeader');
      if (hdr) document.body.style.paddingTop = hdr.offsetHeight + 'px';
    };
    requestAnimationFrame(function() {
      adjustPadding();
      setTimeout(adjustPadding, 100); // segunda pasada tras render completo
    });
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
      Router.go('home'); Header.refresh();
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
        Router.go('home'); Header.refresh();
      }
    });
  }
  // ── Pantalla completa en PWA ──
  (function goFullscreen() {
    var inPWA = window.matchMedia('(display-mode: fullscreen)').matches ||
                window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone;
    if (!inPWA) return;
    if (!document.documentElement.requestFullscreen) return;

    var SKIP_KEY  = 'cx_fs_skip';
    var GRANT_KEY = 'cx_fs_granted'; // el usuario ya concedió fullscreen antes

    function enterFullscreen() {
      if (document.fullscreenElement) return;
      document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        .then(function() { localStorage.setItem(GRANT_KEY, '1'); })
        .catch(function() {});
    }

    // Si el usuario ya concedió fullscreen antes, intentar reactivarlo
    // pageshow se dispara tanto en carga normal como en bfcache (back/forward)
    // y en ese contexto el navegador SÍ permite requestFullscreen sin gesto
    if (localStorage.getItem(GRANT_KEY) && !localStorage.getItem(SKIP_KEY)) {
      window.addEventListener('pageshow', function() {
        setTimeout(enterFullscreen, 50);
      });
      // También al volver de minimizar la app
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
          setTimeout(enterFullscreen, 100);
        }
      });
      // Intento inmediato (funciona si viene de bfcache)
      setTimeout(enterFullscreen, 50);
    }

    // Mostrar prompt solo en index y solo la primera vez
    var prompt = document.getElementById('fullscreenPrompt');
    if (prompt && !localStorage.getItem(SKIP_KEY) && !localStorage.getItem(GRANT_KEY)) {
      prompt.classList.add('visible');

      document.getElementById('fullscreenBtn').addEventListener('click', function() {
        document.documentElement.requestFullscreen({ navigationUI: 'hide' })
          .then(function() {
            localStorage.setItem(GRANT_KEY, '1');
            prompt.classList.remove('visible');
          })
          .catch(function() { prompt.classList.remove('visible'); });
      });

      document.getElementById('fullscreenSkip').addEventListener('click', function() {
        localStorage.setItem(SKIP_KEY, '1');
        prompt.classList.remove('visible');
      });
    }
  })();


  } // end _buildHeader

  function refresh() {
    // Re-inyectar header con datos de sesión actualizados
    var existing = document.getElementById('siteHeader');
    if (existing) existing.remove();
    _buildHeader();
  }

  // Llamada inicial
  _buildHeader();

  return { refresh };

})();
