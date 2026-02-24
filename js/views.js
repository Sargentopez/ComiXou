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
    <footer class="app-version">v4.3</footer>
  `,
  init: () => { HomeView_init(); requestAnimationFrame(() => Fullscreen.init()); },
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
// ══════════════════════════════════════════════
// VISTA: MIS CREACIONES (my-comics)
// ══════════════════════════════════════════════

Router.register('my-comics', {
  bodyClass: 'home-page',
  css: ['css/home.css'],
  html: () => `
    <!-- Barra de nav igual que home pero con sólo 2 opciones -->
    <nav class="page-nav" id="myComicsNav">
      <div class="page-nav-item">
        <button class="page-nav-btn" id="mcBackBtn">← Expositor</button>
      </div>
      <div class="page-nav-sep"></div>
      <div class="page-nav-item">
        <button class="page-nav-btn page-nav-btn-create" id="mcNewBtn">✚ Crear nuevo</button>
      </div>
    </nav>

    <div class="home-list" id="myComicsList">
      <div id="mcContent"></div>
    </div>

    <!-- Modal nuevo proyecto -->
    <div class="mc-modal-overlay" id="mcNewModal">
      <div class="mc-modal-box">
        <div class="mc-modal-handle"></div>
        <h3 class="mc-modal-title">Nuevo proyecto</h3>
        <div class="mc-field">
          <label>Título</label>
          <input type="text" id="mcTitle" placeholder="El nombre de tu obra" autocomplete="off">
        </div>
        <div class="mc-field">
          <label>Autor</label>
          <input type="text" id="mcAuthor" placeholder="Tu nombre o seudónimo" autocomplete="off">
        </div>
        <div class="mc-field">
          <label>Género</label>
          <input type="text" id="mcGenre" placeholder="Aventura, humor, drama…" autocomplete="off">
        </div>
        <div class="mc-field">
          <label>Modo de lectura</label>
          <select id="mcNavMode">
            <option value="fixed">Viñeta fija (botones)</option>
            <option value="horizontal">Deslizamiento horizontal</option>
            <option value="vertical">Deslizamiento vertical</option>
          </select>
        </div>
        <div class="mc-modal-actions">
          <button class="btn" id="mcNewCancel" style="flex:1">Cancelar</button>
          <button class="btn btn-primary" id="mcNewCreate" style="flex:1">Crear ✓</button>
        </div>
      </div>
    </div>
  `,
  init: () => MyComicsView_init(),
});

Router.register('editor', {
  bodyClass: 'editor-page',
  hideHeader: true,
  css: ['css/editor.css'],
  html: () => `
    <div id="editorShell">

      <!-- CANVAS (fondo, ocupa todo) -->
      <div id="editorCanvasWrap">
        <canvas id="editorCanvas"></canvas>
        <div id="edToast"></div>
      </div>

      <!-- ── BARRA SUPERIOR ── -->
      <div id="edTopbar">
        <button id="edBackBtn" title="Volver a Mis Creaciones">‹</button>
        <span id="edProjectTitle">Sin título</span>
        <button class="ed-top-action" id="edPreviewBtn">👁 Vista previa</button>
        <button class="ed-top-action" id="edSaveBtn">💾 Guardar</button>
      </div>

      <!-- ── BARRA DE MENÚ ── -->
      <div id="edMenuBar">

        <!-- INSERTAR -->
        <div class="ed-menu-item" style="position:relative">
          <button class="ed-menu-btn" data-menu="insert">＋ Insertar ▾</button>
          <div class="ed-dropdown" id="dd-insert">
            <!-- Imagen -->
            <div class="ed-dropdown-item has-sub" style="position:relative">
              <span class="dd-icon">🖼</span> Imagen
              <div class="ed-subdropdown">
                <button class="ed-dropdown-item" id="dd-gallery"><span class="dd-icon">🖼</span>Galería</button>
                <button class="ed-dropdown-item" id="dd-camera"><span class="dd-icon">📷</span>Cámara</button>
              </div>
            </div>
            <!-- Texto -->
            <div class="ed-dropdown-item has-sub" style="position:relative">
              <span class="dd-icon">✍️</span> Texto
              <div class="ed-subdropdown">
                <button class="ed-dropdown-item" id="dd-textbox"><span class="dd-icon">💬</span>Caja de texto</button>
                <button class="ed-dropdown-item" id="dd-bubble"><span class="dd-icon">🗯</span>Bocadillo</button>
              </div>
            </div>
          </div>
        </div>

        <div class="ed-menu-sep"></div>

        <!-- DIBUJAR -->
        <div class="ed-menu-item" style="position:relative">
          <button class="ed-menu-btn" data-menu="draw">✏️ Dibujar ▾</button>
          <div class="ed-dropdown" id="dd-draw">
            <button class="ed-dropdown-item" id="dd-pen"><span class="dd-icon">✏️</span>Lápiz</button>
            <button class="ed-dropdown-item" id="dd-eraser"><span class="dd-icon">⬜</span>Borrador</button>
            <div class="ed-dropdown-sep"></div>
            <button class="ed-dropdown-item" id="dd-cleardraw"><span class="dd-icon">🗑</span>Borrar dibujos</button>
          </div>
        </div>

        <div class="ed-menu-sep"></div>

        <!-- NAVEGAR -->
        <div class="ed-menu-item" style="position:relative">
          <button class="ed-menu-btn" data-menu="nav">📄 Navegar ▾</button>
          <div class="ed-dropdown" id="dd-nav">
            <div class="ed-dropdown-label">Ir a página</div>
            <div id="ddNavPages" style="padding:4px 8px 6px;display:flex;flex-wrap:wrap;gap:5px;max-width:220px"></div>
            <div class="ed-dropdown-sep"></div>
            <button class="ed-dropdown-item" id="dd-addpage"><span class="dd-icon">➕</span>Nueva página</button>
            <button class="ed-dropdown-item" id="dd-delpage"><span class="dd-icon">🗑</span>Eliminar esta página</button>
            <div class="ed-dropdown-sep"></div>
            <div class="ed-dropdown-label">Orientación</div>
            <button class="ed-dropdown-item" id="dd-orientv"><span class="dd-icon">📱</span>Vertical</button>
            <button class="ed-dropdown-item" id="dd-orienth"><span class="dd-icon">🖥</span>Horizontal</button>
          </div>
        </div>

        <div class="ed-menu-sep"></div>

        <!-- PROYECTO -->
        <div class="ed-menu-item" style="position:relative">
          <button class="ed-menu-btn" data-menu="project">⚙️ Proyecto ▾</button>
          <div class="ed-dropdown" id="dd-project">
            <button class="ed-dropdown-item" id="dd-editproject"><span class="dd-icon">✏️</span>Editar datos</button>
            <button class="ed-dropdown-item" id="dd-viewerjson"><span class="dd-icon">👁</span>Vista previa</button>
            <div class="ed-dropdown-sep"></div>
            <button class="ed-dropdown-item" id="dd-savejson"><span class="dd-icon">💾</span>Descargar .json</button>
            <button class="ed-dropdown-item" id="dd-loadjson"><span class="dd-icon">📂</span>Cargar .json</button>
          </div>
        </div>

        <!-- MINIMIZAR (a la derecha) -->
        <button id="edMinimizeBtn">▲ Minimizar</button>

      </div>

      <!-- ── PANEL DE OPCIONES CONTEXTUAL ── -->
      <div id="edOptionsPanel"></div>

      <!-- ── BOTÓN FLOTANTE (cuando está minimizado) ── -->
      <div id="edFloatBtn" title="Abrir menú">☰</div>

    </div>

    <!-- VISOR -->
    <div id="editorViewer">
      <canvas id="viewerCanvas"></canvas>
      <div class="viewer-controls">
        <button class="viewer-btn" id="viewerPrev">◀</button>
        <span id="viewerCounter">1 / 1</span>
        <button class="viewer-btn" id="viewerNext">▶</button>
        <button class="viewer-btn yellow" id="viewerClose">Cerrar ✕</button>
      </div>
    </div>

    <!-- MODAL DATOS DEL PROYECTO -->
    <div id="edProjectModal">
      <div class="ed-modal-sheet">
        <div class="ed-modal-handle"></div>
        <h3 class="ed-modal-title">Datos del proyecto</h3>
        <div class="ed-modal-field"><label>Título</label><input type="text" id="edMTitle"></div>
        <div class="ed-modal-field"><label>Autor</label><input type="text" id="edMAuthor"></div>
        <div class="ed-modal-field"><label>Género</label><input type="text" id="edMGenre"></div>
        <div class="ed-modal-field"><label>Modo de lectura</label>
          <select id="edMNavMode">
            <option value="fixed">Viñeta fija (botones)</option>
            <option value="horizontal">Deslizamiento horizontal</option>
            <option value="vertical">Deslizamiento vertical</option>
          </select></div>
        <div class="ed-modal-actions">
          <button class="ed-modal-btn cancel" id="edMCancel">Cancelar</button>
          <button class="ed-modal-btn ok" id="edMSave">Guardar ✓</button>
        </div>
      </div>
    </div>

    <!-- Inputs ocultos -->
    <input type="file" id="edFileGallery" accept="image/*,.gif" style="display:none">
    <input type="file" id="edFileCapture" accept="image/*" capture="environment" style="display:none">
    <input type="file" id="edLoadFile" accept=".json" style="display:none">
    <div id="edBrushCursor"></div>
  `,
  init: () => EditorView_init(),
});

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
