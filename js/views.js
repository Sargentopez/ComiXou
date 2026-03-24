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
    <div class="home-empty hidden" id="emptyState">
        <span>📚</span>
        <p data-i18n="noComics">Aún no hay obras publicadas.</p>
        <p data-i18n="beFirst">¡Sé el primero en crear una!</p>
      </div>
    <main class="home-list" id="comicsGrid">
    </main>
    <footer class="app-version">v11.03</footer>
  `,
  init: () => { HomeView_init(); },
  destroy: () => { if (window._homeStoreCleanup) { window._homeStoreCleanup(); window._homeStoreCleanup = null; } }
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
            <input type="email" id="loginEmail" class="form-input" autocomplete="email" inputmode="email" enterkeyhint="next" required>
            <span class="form-error" id="emailError"></span>
          </div>
          <div class="form-group">
            <label class="form-label" for="loginPass" data-i18n="password">Contraseña</label>
            <div class="pass-wrap">
              <input type="password" id="loginPass" class="form-input" autocomplete="current-password" inputmode="text" enterkeyhint="done" required>
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
            <input type="text" id="regUsername" class="form-input" autocomplete="username" inputmode="text" enterkeyhint="next" required>
            <span class="form-error" id="usernameError"></span>
          </div>
          <div class="form-group">
            <label class="form-label" for="regEmail" data-i18n="email">Email</label>
            <input type="email" id="regEmail" class="form-input" autocomplete="email" inputmode="email" enterkeyhint="next" required>
            <span class="form-error" id="emailError"></span>
          </div>
          <div class="form-group">
            <label class="form-label" for="regPass" data-i18n="password">Contraseña</label>
            <div class="pass-wrap">
              <input type="password" id="regPass" class="form-input" autocomplete="new-password" inputmode="text" enterkeyhint="next" required>
              <button type="button" class="pass-toggle" id="passToggle">👁</button>
            </div>
            <span class="form-error" id="passError"></span>
          </div>
          <div class="form-group">
            <label class="form-label" for="regPassConf" data-i18n="passwordConf">Confirmar contraseña</label>
            <input type="password" id="regPassConf" class="form-input" autocomplete="new-password" inputmode="text" enterkeyhint="done" required>
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
        <button class="page-nav-btn" id="mcCloudLoadBtn" title="Cargar borradores guardados en la nube">☁️ Cargar de nube</button>
      </div>
      <div class="page-nav-sep"></div>
      <div class="page-nav-item">
        <button class="page-nav-btn page-nav-btn-create" id="mcNewBtn">✚ Crear nuevo</button>
      </div>
    </nav>

    <div class="home-list" id="myComicsList">
      <div id="mcContent"></div>
    </div>

  `,
  init: () => MyComicsView_init(),
  destroy: () => { if(typeof MyComicsView_destroy==='function') MyComicsView_destroy(); }
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
        <span class="ed-top-spacer"></span>
        <div class="ed-top-pagnav">
          <button class="ed-top-pagebn" id="edPagePrev" title="Página anterior">&#9664;</button>
          <span id="edPageNum">1</span>
          <button class="ed-top-pagebn" id="edPageNext" title="Página siguiente">&#9654;</button>
        </div>
        <button class="ed-top-action" id="edFsBtn" title="Pantalla completa">⛶</button>
        <button class="ed-top-action" id="edPreviewBtn" title="Vista previa">▶</button>
        <button class="ed-top-action" id="edSaveBtn" title="Guardar local">💾</button>
        <button class="ed-top-action" id="edCloudSaveBtn" title="Guardar en nube">☁️</button>
      </div>

      <!-- ── BARRA DE MENÚ ── -->
      <div id="edMenuBar">

        <!-- BOTÓN OCULTAR — fijo, no scrollable, siempre al 100% de opacidad -->
        <button id="edMinimizeBtn" class="ed-menu-pin ed-hide-btn"><span style="font-size:1.05rem">▼</span><b style="font-size:.68rem;letter-spacing:.02em">ocultar</b></button>
        <div class="ed-menu-sep"></div>

        <!-- ZONA DESLIZABLE -->
        <div id="edMenuScroll">


          <!-- INSERTAR -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="insert">Insertar ▾</button>
            <div class="ed-dropdown" id="dd-insert">
              <div class="ed-dropdown-submenu">
                <button class="ed-dropdown-item ed-has-submenu" id="dd-imagen-btn">Imagen ▸</button>
                <div class="ed-submenu" id="dd-imagen-sub">
                  <button class="ed-dropdown-item" id="dd-gallery">Galería</button>
                  <button class="ed-dropdown-item" id="dd-camera">Cámara</button>
                </div>
              </div>
              <div class="ed-dropdown-submenu">
                <button class="ed-dropdown-item ed-has-submenu" id="dd-texto-btn">Texto ▸</button>
                <div class="ed-submenu" id="dd-texto-sub">
                  <button class="ed-dropdown-item" id="dd-textbox">Caja de texto</button>
                  <button class="ed-dropdown-item" id="dd-bubble">Bocadillo</button>
                </div>
              </div>

            </div>
          </div>

          <div class="ed-menu-sep"></div>

          <!-- DIBUJAR -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="draw">Dibujar ▾</button>
            <div class="ed-dropdown" id="dd-draw">
              <button class="ed-dropdown-item" id="dd-pen">✏️ Dibujo a mano</button>
              <div class="ed-dropdown-submenu">
                <button class="ed-dropdown-item ed-has-submenu" id="dd-vectorial-btn">Dibujo vectorial ▸</button>
                <div class="ed-submenu" id="dd-vectorial-sub">
                  <button class="ed-dropdown-item" id="dd-shape-rect">▭ Rectángulo</button>
                  <button class="ed-dropdown-item" id="dd-shape-ellipse">◯ Elipse</button>
                  <button class="ed-dropdown-item" id="dd-shape-line">╱ Líneas</button>
                </div>
              </div>
            </div>
          </div>

          <div class="ed-menu-sep"></div>

          <!-- DESHACER / REHACER -->
          <button class="ed-undo-redo-btn" id="edUndoBtn" title="Deshacer" disabled>↩</button>
          <button class="ed-undo-redo-btn" id="edRedoBtn" title="Rehacer" disabled>↪</button>
          <button class="ed-undo-redo-btn" id="edZoomResetBtn" title="Ver lienzo completo / workspace">🔍</button>
          <button class="ed-undo-redo-btn" id="edMultiSelBtn" title="Selección múltiple (M)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 1.5"/>
              <rect x="7" y="7" width="8" height="8" rx="1" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>

          <div class="ed-menu-sep"></div>

          <!-- CAPAS (placeholder — se desarrollará) -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="layers">Capas ▾</button>
          </div>

          <div class="ed-menu-sep"></div>

          <!-- HOJA -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="nav">Hoja ▾</button>
            <div class="ed-dropdown" id="dd-nav">
              <div class="ed-dropdown-label">Ir a página</div>
              <div id="ddNavPages" style="padding:4px 8px 6px;display:flex;flex-wrap:wrap;gap:5px;max-width:220px"></div>
              <div class="ed-dropdown-sep"></div>
              <button class="ed-dropdown-item" id="dd-addpage">Nueva página</button>
              <button class="ed-dropdown-item" id="dd-delpage">Eliminar esta página</button>
              <div class="ed-dropdown-sep"></div>
              <div class="ed-dropdown-label">Orientación</div>
              <button class="ed-dropdown-item" id="dd-orientv">Vertical</button>
              <button class="ed-dropdown-item" id="dd-orienth">Horizontal</button>
            </div>
          </div>

          <div class="ed-menu-sep"></div>

          <!-- PROYECTO -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="project">Proyecto ▾</button>
            <div class="ed-dropdown" id="dd-project">
              <button class="ed-dropdown-item" id="dd-editproject">Editar datos</button>
              <button class="ed-dropdown-item" id="dd-viewerjson">Previsualizar</button>
              <div class="ed-dropdown-sep"></div>
              <button class="ed-dropdown-item" id="dd-savejson">Descargar .json</button>
              <button class="ed-dropdown-item" id="dd-loadjson">Cargar .json</button>
              <div class="ed-dropdown-sep"></div>
              <div class="ed-dropdown-submenu" id="dd-export-wrap">
                <button class="ed-dropdown-item ed-has-submenu" id="dd-exportbtn">⬇ Guardar hoja como… ▸</button>
                <div class="ed-submenu" id="dd-export-sub">
                  <button class="ed-dropdown-item" id="dd-exportpng">PNG (transparencias)</button>
                  <button class="ed-dropdown-item" id="dd-exportjpg">JPG (fondo blanco)</button>
                </div>
              </div>
              <div class="ed-dropdown-sep"></div>
              <button class="ed-dropdown-item" id="dd-deleteproject" style="color:#e63030;font-weight:700">✕ Eliminar obra</button>
            </div>
          </div>

        </div><!-- /edMenuScroll -->

      </div>

      <!-- ── PANEL DE OPCIONES CONTEXTUAL ── -->
      <div id="edOptionsPanel"></div>

      <!-- ── BOTÓN FLOTANTE (cuando está minimizado) ── -->
      <div id="edFloatBtn" title="Menú">☰</div>

      <!-- ── BARRA HERRAMIENTAS DIBUJO (minimizado + draw activo) ── -->
      <div id="edDrawBar">
        <button id="edb-pen"    class="edb-tool" title="Dibujar">✏️</button>
        <button id="edb-eraser" class="edb-tool" title="Borrar">◻</button>
        <button id="edb-fill"   class="edb-tool" title="Rellenar">🪣</button>
        <div class="edb-sep"></div>
        <button id="edb-color"  class="edb-swatch" title="Color"></button>
        <button id="edb-eyedrop" class="edb-tool" title="Cuentagotas">💧</button>
        <button id="edb-pen-size"    class="edb-tool edb-sizebtn-fix" title="Grosor lápiz" style="font-size:.7rem;font-weight:900">Ø</button>
        <button id="edb-eraser-size" class="edb-tool edb-sizebtn-fix" title="Grosor goma"   style="font-size:.7rem;font-weight:900;display:none">Ø</button>
        <div class="edb-sep"></div>
        <button id="edb-undo"   class="edb-tool" title="Deshacer">↩</button>
        <button id="edb-redo"   class="edb-tool" title="Rehacer">↪</button>
        <div class="edb-sep"></div>
        <button id="edb-ok"     class="edb-ok" title="Finalizar">✓</button>
      </div>
      <!-- Popover paleta (hijo de editorShell para z-index correcto) -->
      <div id="edb-palette-pop"></div>
      <!-- Panel grosor anclado a la barra flotante de dibujo -->
      <div id="edb-size-pop" style="display:none;position:fixed;z-index:1200;background:rgba(20,20,20,0.93);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:12px 14px;box-shadow:0 4px 18px rgba(0,0,0,.6);flex-direction:column;align-items:center;gap:10px;min-width:170px">
        <!-- Preview grande: círculo del color actual, tamaño proporcional al grosor -->
        <div style="display:flex;align-items:center;justify-content:center;width:100%;height:48px">
          <span id="edb-size-preview" style="display:inline-block;border-radius:50%;background:#fff;transition:width .12s,height .12s,background .12s"></span>
        </div>
        <!-- Slider -->
        <input type="range" id="edb-size-slider" min="1" max="48" value="8"
          style="width:100%;accent-color:#FFE135;cursor:pointer">
        <!-- Número editable -->
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" id="edb-size-num" min="1" max="80" value="8"
            style="width:52px;text-align:center;font-size:1rem;font-weight:700;
                   border:1px solid rgba(255,255,255,0.4);border-radius:8px;
                   background:rgba(0,0,0,.4);color:#fff;padding:4px 6px;
                   -moz-appearance:textfield;">
          <span style="color:#ccc;font-size:.75rem">px</span>
        </div>
      </div>

      <!-- Panel slider adjunto a edShapeBar (grosor, opacidad, curva) -->
      <div id="esb-slider-panel" style="display:none;position:fixed;z-index:1199;background:rgba(20,20,20,.40);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;box-shadow:0 2px 10px rgba(0,0,0,.25);align-items:center;justify-content:center;">
        <input type="range" id="esb-slider-input" min="0" max="100" value="0"
          style="accent-color:#FFE135;cursor:pointer;touch-action:none;">
      </div>

      <!-- Barra flotante Shape/Line -->
      <div id="edShapeBar">
        <button id="esb-color"    class="edb-swatch" title="Color borde"></button>
        <button id="esb-fill-on"  class="edb-tool"   title="Relleno">▣</button>
        <button id="esb-fill"     class="edb-swatch" title="Color relleno"></button>
        <div class="edb-sep"></div>
        <button id="esb-eyedrop"  class="edb-tool"   title="Cuentagotas">💧</button>
        <div class="edb-sep"></div>
        <button id="esb-size"     class="edb-sizebtn" title="Grosor"><span id="esb-size-dot"></span></button>
        <button id="esb-opacity"  class="edb-tool"    title="Opacidad" style="font-size:.65rem;font-weight:900">Op</button>
        <div class="edb-sep"></div>
        <button id="esb-curve"    class="edb-tool" title="Convertir vértice a curva" style="font-size:.65rem;font-weight:900"><b>V⟺C</b></button>
        <div class="edb-sep"></div>
        <button id="esb-undo"     class="edb-tool" title="Deshacer">↩</button>
        <button id="esb-redo"     class="edb-tool" title="Rehacer">↪</button>
        <div class="edb-sep"></div>
        <button id="esb-ok"       class="edb-ok"   title="Finalizar">✓</button>
      </div>

    </div>

    <!-- VISOR: canvas fullscreen + controles flotantes -->
    <div id="editorViewer">
      <canvas id="viewerCanvas"></canvas>
      <!-- Pastilla desktop: ◀ contador ▶ ✕ — oculta en táctil via CSS -->
      <div class="viewer-controls" id="viewerControls">
        <button class="viewer-btn" id="viewerPrev">◀</button>
        <span id="viewerCounter">1 / 1</span>
        <button class="viewer-btn" id="viewerNext">▶</button>
        <button class="viewer-btn viewer-close-inline" id="viewerClose">✕</button>
      </div>
      <!-- Botón ✕ solo táctil: centrado abajo, siempre visible en Android/iOS -->
      <button class="viewer-btn viewer-close-touch" id="viewerCloseMobile">✕</button>
    </div>

    <!-- MODAL DATOS DEL PROYECTO -->
    <div id="edProjectModal">
      <div class="ed-modal-sheet">
        <div class="ed-modal-handle"></div>
        <h3 class="ed-modal-title">Datos del proyecto</h3>
        <div class="ed-modal-field"><label>Título</label><input type="text" id="edMTitle" inputmode="text" enterkeyhint="next" autocomplete="off"></div>
        <div class="ed-modal-field"><label>Autor</label><input type="text" id="edMAuthor" inputmode="text" enterkeyhint="next" autocomplete="off"></div>
        <div class="ed-modal-field"><label>Género</label><input type="text" id="edMGenre" inputmode="text" enterkeyhint="done" autocomplete="off"></div>
        <div class="ed-modal-field"><label>Modo de lectura</label>
          <select id="edMNavMode">
            <option value="fixed">Hoja fija (botones)</option>
            <option value="horizontal">Deslizamiento horizontal</option>
            <option value="vertical">Deslizamiento vertical</option>
          </select></div>
        <div class="ed-modal-field"><label>Redes y comentarios <span style="font-weight:400;font-size:.75rem;opacity:.6">(hoja final)</span></label>
          <textarea id="edMSocial" maxlength="300" rows="3" style="resize:none;overflow-y:auto;font-family:var(--font-body);font-size:.88rem;padding:8px 10px;border:1.5px solid var(--gray-200);border-radius:8px;width:100%;box-sizing:border-box;line-height:1.5" placeholder="Instagram: @miperfil · Web: misite.com"></textarea></div>
        <div class="ed-modal-actions">
          <button class="ed-modal-btn cancel" id="edMCancel">Cancelar</button>
          <button class="ed-modal-btn ok" id="edMSave">Guardar ✓</button>
        </div>
      </div>
    </div>

    <!-- Inputs ocultos -->
    <input type="file" id="edFileGallery" accept="image/*,.gif,.tif,.tiff,.bmp,.avif,.heic,.heif,.webp,.svg" style="display:none">
    <input type="file" id="edLoadFile" accept=".json" style="display:none">
    <!-- Overlay cámara in-app -->
    <div id="edCameraOverlay" class="hidden">
      <video id="edCameraVideo" autoplay playsinline muted></video>
      <div id="edCameraControls">
        <button id="edCameraClose" title="Cerrar">✕</button>
        <button id="edCameraCapture" title="Capturar"></button>
        <button id="edCameraFlip" title="Cambiar cámara">🔄</button>
      </div>
    </div>
    <div id="edBrushCursor"></div>
  `,
  init: () => EditorView_init(),
  destroy: () => { if(typeof EditorView_destroy==='function') EditorView_destroy(); },
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
        <h2>¡Fin de la obra!</h2>
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
    if (typeof ReaderView_destroy === 'function') ReaderView_destroy();
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
        <button class="admin-tab active" data-tab="pending" data-i18n="pendingTab">Pendientes</button>
        <div class="admin-tab-sep"></div>
        <button class="admin-tab" data-tab="published" data-i18n="publishedTab">Publicadas</button>
        <div class="admin-tab-sep"></div>
        <button class="admin-tab" data-tab="users" data-i18n="usersTab">Autores</button>
      </div>
      <div class="admin-panel" id="tabPending"></div>
      <div class="admin-panel hidden" id="tabPublished"></div>
      <div class="admin-panel hidden" id="tabUsers"></div>
    </main>
  `,
  init: () => AdminView_init(),
  destroy: () => {}
});
