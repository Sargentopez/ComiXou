/* ============================================================
   views.js — Registro de todas las vistas de la SPA
   Cada vista define: bodyClass, css[], html(), init(), destroy()
   ============================================================ */

// ══════════════════════════════════════════════
// VISTA: HOME
// ══════════════════════════════════════════════
Router.register('home', {
  bodyClass: 'home-page',
  css: ['css/home.css'],
  html: () => `
    <div class="fullscreen-prompt" id="fullscreenPrompt">
      <div class="fp-logo">Comi<span>Xow</span></div>
      <button class="fp-btn" id="fullscreenBtn">⛶ Pantalla completa</button>
      <button class="fp-skip" id="fullscreenSkip">Continuar sin pantalla completa</button>
    </div>
    <nav class="page-nav" id="pageNav">
      <div class="dropdown page-nav-item">
        <button class="page-nav-btn" id="filtrosBtn" data-i18n="filterBtn">Filtros ▾</button>
        <div class="dropdown-menu page-nav-dropdown" id="filtrosMenu"></div>
      </div>
      <span class="page-nav-sep"></span>
      <button class="page-nav-btn" id="novedadesBtn" data-i18n="novedades">Novedades</button>
      <span class="page-nav-sep"></span>
      <button class="page-nav-btn page-nav-btn-create" id="createBtn" data-i18n="create">Crear</button>
    </nav>
    <main class="home-list" id="comicsGrid">
      <div class="home-empty hidden" id="emptyState">
        <span>📚</span>
        <p data-i18n="noComics">Aún no hay obras publicadas.</p>
        <p data-i18n="beFirst">¡Sé el primero en crear una!</p>
      </div>
    </main>
    <footer class="app-version">v2.8</footer>
  `,
  init: () => HomeView_init(),
  destroy: () => {}
});

// ══════════════════════════════════════════════
// VISTA: LOGIN
// ══════════════════════════════════════════════
Router.register('login', {
  bodyClass: 'auth-page',
  css: ['css/auth.css'],
  html: () => `
    <main class="auth-main">
      <div class="auth-card">
        <div class="auth-card-header">
          <h1 class="auth-title" data-i18n="pageLogin">Iniciar sesión</h1>
        </div>
        <form id="loginForm" class="auth-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="loginEmail" data-i18n="email">Email</label>
            <input type="email" id="loginEmail" class="form-input" autocomplete="email" required>
            <span class="form-error" id="emailError"></span>
          </div>
          <div class="form-group">
            <label class="form-label" for="loginPass" data-i18n="password">Contraseña</label>
            <div class="pass-wrap">
              <input type="password" id="loginPass" class="form-input" autocomplete="current-password" required>
              <button type="button" class="pass-toggle" id="passToggle">👁</button>
            </div>
            <span class="form-error" id="passError"></span>
          </div>
          <div class="form-group forgot-row">
            <a href="#" class="forgot-link" data-i18n="forgotPass">¿Olvidaste tu contraseña?</a>
          </div>
          <button type="submit" class="btn btn-primary btn-full" data-i18n="submitLogin">Entrar</button>
        </form>
        <p class="auth-switch">
          <span data-i18n="noAccount">¿No tienes cuenta?</span>
          <a href="#register" onclick="Router.go('register');return false;" data-i18n="register">Regístrate</a>
        </p>
      </div>
    </main>
  `,
  init: () => AuthView_init(),
  destroy: () => {}
});

// ══════════════════════════════════════════════
// VISTA: REGISTER
// ══════════════════════════════════════════════
Router.register('register', {
  bodyClass: 'auth-page',
  css: ['css/auth.css'],
  html: () => `
    <main class="auth-main">
      <div class="auth-card">
        <div class="auth-card-header">
          <h1 class="auth-title" data-i18n="pageRegister">Crear cuenta</h1>
        </div>
        <form id="registerForm" class="auth-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="regUsername" data-i18n="username">Nombre de usuario</label>
            <input type="text" id="regUsername" class="form-input" autocomplete="username" required>
            <span class="form-error" id="usernameError"></span>
          </div>
          <div class="form-group">
            <label class="form-label" for="regEmail" data-i18n="email">Email</label>
            <input type="email" id="regEmail" class="form-input" autocomplete="email" required>
            <span class="form-error" id="emailError"></span>
          </div>
          <div class="form-group">
            <label class="form-label" for="regPass" data-i18n="password">Contraseña</label>
            <div class="pass-wrap">
              <input type="password" id="regPass" class="form-input" autocomplete="new-password" required>
              <button type="button" class="pass-toggle" id="passToggle">👁</button>
            </div>
            <span class="form-error" id="passError"></span>
          </div>
          <div class="form-group">
            <label class="form-label" for="regPassConf" data-i18n="passwordConf">Confirmar contraseña</label>
            <input type="password" id="regPassConf" class="form-input" autocomplete="new-password" required>
            <span class="form-error" id="passConfError"></span>
          </div>
          <button type="submit" class="btn btn-primary btn-full" data-i18n="submitRegister">Crear cuenta</button>
        </form>
        <p class="auth-switch">
          <span data-i18n="hasAccount">¿Ya tienes cuenta?</span>
          <a href="#login" onclick="Router.go('login');return false;" data-i18n="login">Entrar</a>
        </p>
      </div>
    </main>
  `,
  init: () => AuthView_init(),
  destroy: () => {}
});

// ══════════════════════════════════════════════
// VISTA: EDITOR
// ══════════════════════════════════════════════
Router.register('editor', {
  bodyClass: 'editor-page',
  css: ['css/editor.css'],
  html: () => `
    <main id="screenProjects" class="projects-screen">
      <div class="projects-header">
        <h2 class="projects-title" data-i18n="myComics">Mis creaciones</h2>
        <button class="btn btn-primary" id="newProjectBtn" data-i18n="newProject">✨ Nuevo proyecto</button>
      </div>
      <div class="projects-grid" id="projectsGrid"></div>
    </main>

    <main id="screenEditor" class="editor-canvas-area" style="display:none">
      <div class="canvas-placeholder" id="canvasPlaceholder">
        <span>🖼</span>
        <p>Abre <strong>Viñetas ▾</strong> y sube tu primera imagen</p>
      </div>
      <div class="panel-viewer hidden" id="panelViewer">
        <div class="panel-stage" id="panelStage">
          <img id="panelImage" src="" alt="">
          <div class="text-layer" id="textLayer"></div>
        </div>
        <div class="panel-num-bar" id="panelNumBar">Viñeta 1</div>
      </div>
    </main>

    <div class="modal-overlay" id="projectModal">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title" data-i18n="newProject">Nuevo proyecto</span>
          <button class="modal-close" id="projectModalClose">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" data-i18n="comicTitle">Título</label>
            <input type="text" id="comicTitleInput" class="form-input" maxlength="80" placeholder="Escribe el título...">
          </div>
          <div class="form-group">
            <label class="form-label">Descripción (opcional)</label>
            <textarea id="comicDescInput" class="form-input" rows="2" maxlength="200" placeholder="Breve descripción..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Género</label>
            <div class="genre-field">
              <select id="comicGenreSelect" class="form-input form-select">
                <option value="">— Elige un género —</option>
              </select>
              <span class="genre-or">o</span>
              <input type="text" id="comicGenreNew" class="form-input" maxlength="40" placeholder="Escribe uno nuevo...">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="projectModalSave">Crear proyecto</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="tailModal">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">Cola del bocadillo</span>
          <button class="modal-close" id="tailModalClose">✕</button>
        </div>
        <div class="modal-body tail-selector">
          <p style="margin-bottom:12px;font-size:.9rem;color:var(--gray-700)">¿Desde qué lado sale la cola?</p>
          <div class="tail-options">
            <button class="tail-opt" data-tail="top">↑ Arriba</button>
            <button class="tail-opt" data-tail="right">→ Derecha</button>
            <button class="tail-opt" data-tail="bottom">↓ Abajo</button>
            <button class="tail-opt" data-tail="left">← Izquierda</button>
          </div>
        </div>
      </div>
    </div>
    <input type="file" id="fileInput" accept="image/*,.gif" style="display:none" multiple>
  `,
  init: (params) => EditorView_init(params),
  destroy: () => {
    // Limpiar estado del editor al salir
    if (typeof EditorState !== 'undefined') EditorState.comic = null;
  }
});

// ══════════════════════════════════════════════
// VISTA: READER
// ══════════════════════════════════════════════
Router.register('reader', {
  bodyClass: 'reader-page',
  css: ['css/reader.css'],
  html: () => `
    <div class="reader-topbar" id="readerTopbar">
      <div class="home-logo-area" style="flex-direction:row;align-items:center;gap:6px">
        <a href="#home" onclick="Router.go('home');return false;" class="logo-link">
          <span class="logo-main" style="font-size:1.4rem">Comi<span class="logo-accent">Xow</span></span>
        </a>
      </div>
      <div class="reader-info">
        <span class="reader-comic-title" id="readerComicTitle"></span>
        <span class="reader-panel-num" id="readerPanelNum">1 / 1</span>
      </div>
    </div>
    <div class="reader-stage" id="readerStage"></div>
    <button class="reader-arrow reader-arrow-left"  id="prevBtn" title="Anterior">‹</button>
    <button class="reader-arrow reader-arrow-right" id="nextBtn" title="Siguiente">›</button>
    <div class="reader-end-overlay hidden" id="endOverlay">
      <div class="end-card">
        <div class="end-icon">🎉</div>
        <h2>¡Fin del cómic!</h2>
        <div class="end-actions">
          <button class="btn btn-outline" id="restartBtn">↩ Volver al inicio</button>
          <button class="btn btn-primary" onclick="Router.go('home')">🏠 Salir</button>
        </div>
      </div>
    </div>
    <div class="swipe-hint" id="swipeHint">👉 Desliza para avanzar</div>
  `,
  init: (params) => ReaderView_init(params),
  destroy: () => {
    if (typeof ReaderState !== 'undefined') ReaderState.comic = null;
  }
});

// ══════════════════════════════════════════════
// VISTA: ADMIN
// ══════════════════════════════════════════════
Router.register('admin', {
  bodyClass: 'admin-page',
  css: ['css/admin.css'],
  html: () => `
    <main class="admin-main">
      <div class="admin-tabs">
        <button class="admin-tab active" data-tab="pending" data-i18n="pendingTab">Pendientes de aprobación</button>
        <button class="admin-tab" data-tab="published" data-i18n="publishedTab">Publicados</button>
        <button class="admin-tab" data-tab="users" data-i18n="usersTab">Usuarios</button>
      </div>
      <div class="admin-panel" id="tabPending"></div>
      <div class="admin-panel hidden" id="tabPublished"></div>
      <div class="admin-panel hidden" id="tabUsers"></div>
    </main>
  `,
  init: () => AdminView_init(),
  destroy: () => {}
});
