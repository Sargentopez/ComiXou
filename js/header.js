/* ============================================================
   header.js — Cabecera global única
   Se carga en todas las páginas excepto reader.html
   Depende de: auth.js (debe cargarse antes)
   ============================================================ */
(function () {
  const inPages = window.location.pathname.includes('/pages/');
  const root    = inPages ? '../' : '';
  const user    = Auth.currentUser();

  const html = `
  <header class="site-header home-header" id="siteHeader">
    <div class="home-header-inner">
      <div class="home-logo-area">
        <a href="${root}index.html" class="logo-link">
          <span class="logo-main">Comic<span class="logo-accent">Show</span></span>
        </a>
        <span class="home-tagline">Crea y comparte tus cómics</span>
      </div>
      <div class="home-user-area">
        ${user ? `
          <div class="dropdown">
            <button class="home-user-link" id="avatarBtn">${user.username} ▾</button>
            <div class="dropdown-menu" id="avatarMenu">
              <a href="${root}pages/editor.html" class="dropdown-item">Mis cómics</a>
              <div class="dropdown-divider"></div>
              <a href="#" class="dropdown-item" id="logoutBtn">Cerrar sesión</a>
            </div>
          </div>
        ` : `
          <div class="home-guest">
            <a href="${root}pages/register.html" class="home-user-link">Regístrate</a>
            <span class="home-user-sep">·</span>
            <a href="${root}pages/login.html" class="home-user-link">Entrar</a>
          </div>
        `}
        <div class="dropdown">
          <button class="home-dots-btn" id="dotsBtn">⋮</button>
          <div class="dropdown-menu dropdown-menu-right" id="dotsMenu">
            ${!user ? `<a href="${root}pages/register.html" class="dropdown-item">Registrarse</a>` : ''}
            ${user  ? `<a href="#" class="dropdown-item danger-item" id="dotsDeleteAccount">Eliminar mi cuenta</a>` : ''}
            <div class="dropdown-divider"></div>
            <span class="dropdown-item disabled-item">ℹ️ Info</span>
            <span class="dropdown-item disabled-item">✉️ Contacto</span>
            <span class="dropdown-item disabled-item">☕ Invítame a un café</span>
          </div>
        </div>
      </div>
    </div>
  </header>`;

  // Inyectar al inicio del body
  document.body.insertAdjacentHTML('afterbegin', html);

  // ── Dropdowns ──
  function bind(btnId, menuId) {
    const btn  = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    if (!btn || !menu) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = menu.classList.contains('open');
      document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
      if (!wasOpen) menu.classList.add('open');
    });
  }
  bind('avatarBtn', 'avatarMenu');
  bind('dotsBtn',   'dotsMenu');

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
  });

  // ── Cerrar sesión ──
  document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    Auth.logout();
    window.location.href = root + 'index.html';
  });

  // ── Eliminar cuenta ──
  document.getElementById('dotsDeleteAccount')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Si eliminas tu cuenta se borrarán todos tus datos y cómics.\n\nEsta acción no se puede deshacer.')) {
      const u = Auth.currentUser();
      if (window.ComicStore) ComicStore.getByUser(u.id).forEach(c => ComicStore.remove(c.id));
      Auth.deleteAccount();
      window.location.href = root + 'index.html';
    }
  });
})();
