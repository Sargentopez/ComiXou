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
      <button class="page-nav-btn page-nav-btn-create" id="createBtn" data-i18n="create">Mis Creaciones</button>
    </nav>
    <div class="home-empty hidden" id="emptyState">
        <span>📚</span>
        <p data-i18n="noComics">Aún no hay obras publicadas.</p>
        <p data-i18n="beFirst">¡Sé el primero en crear una!</p>
      </div>
    <main class="home-list" id="comicsGrid">
    </main>
    <footer class="app-version">v26.39</footer>
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

      <!-- Banner de tamaño máximo superado -->
      <div id="edSizeBanner" style="display:none;position:absolute;top:52px;left:0;right:0;z-index:9500;
        background:#d00;color:#fff;font-family:var(--font-body);font-size:.82rem;font-weight:700;
        padding:8px 14px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none;">
        ⚠️ Has superado el tamaño máximo permitido para subir tu obra a la nube
      </div>

      <!-- CANVAS (fondo, ocupa todo) -->
      <div id="editorCanvasWrap">
        <canvas id="editorCanvas"></canvas>
        <!-- Canvas GIF: superpuesto, al 100% de opacidad, solo visible en modo animación -->
        <canvas id="gcpCanvas" style="display:none;position:absolute;touch-action:none;z-index:10;opacity:1;pointer-events:none"></canvas>
        <!-- Barras de navegación PC (solo visibles en no-touch cuando el lienzo no cabe) -->
        <div id="ed-hscroll" style="display:none;position:absolute;bottom:0;left:0;right:12px;height:12px;background:rgba(0,0,0,0.08);cursor:pointer">
          <div id="ed-hscroll-thumb" style="position:absolute;top:2px;height:8px;background:rgba(0,0,0,0.35);border-radius:4px;cursor:grab"></div>
        </div>
        <div id="ed-vscroll" style="display:none;position:absolute;top:0;right:0;bottom:12px;width:12px;background:rgba(0,0,0,0.08);cursor:pointer">
          <div id="ed-vscroll-thumb" style="position:absolute;left:2px;width:8px;background:rgba(0,0,0,0.35);border-radius:4px;cursor:grab"></div>
        </div>

        <div id="edToast"></div>
        <div id="edCofHint" style="display:none;position:fixed;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.78);color:#fff;padding:8px 18px;border-radius:14px;font-size:0.78rem;font-weight:700;line-height:1.6;text-align:center;pointer-events:none;z-index:61;white-space:nowrap;box-shadow:0 2px 12px rgba(0,0,0,.4)"></div>

      <!-- Modal de interpolación de frames GCP -->
      <div id="gcpInterpModal" class="ed-confirm-overlay">
        <div class="ed-confirm-box" style="max-width:320px;">
          <p class="ed-confirm-msg" style="margin-bottom:12px;">Interpolación de frames</p>
          <p style="font-size:0.8rem;color:var(--gray-500);text-align:center;margin:0 0 16px;line-height:1.5;">
            Frames intermedios a insertar entre el fotograma <strong id="gcpInterpF1"></strong> y el <strong id="gcpInterpF2"></strong> de esta fila:
          </p>
          <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:20px;">
            <button id="gcpInterpMinus" class="ed-modal-btn cancel" style="flex:0 0 40px;padding:10px 0;font-size:1.2rem;">−</button>
            <span id="gcpInterpCount" style="font-size:2rem;font-weight:900;min-width:40px;text-align:center;">1</span>
            <button id="gcpInterpPlus"  class="ed-modal-btn ok"     style="flex:0 0 40px;padding:10px 0;font-size:1.2rem;">+</button>
          </div>
          <div class="ed-modal-actions">
            <button id="gcpInterpCancel" class="ed-modal-btn cancel">Cancelar</button>
            <button id="gcpInterpOk"     class="ed-modal-btn ok">Interpolar</button>
          </div>
        </div>
      </div>

      <!-- Modal de confirmación (evita confirm() nativo que sale de fullscreen) -->
      <div id="edConfirmModal" class="ed-confirm-overlay">
        <div class="ed-confirm-box">
          <p id="edConfirmMsg" class="ed-confirm-msg"></p>
          <div class="ed-modal-actions">
            <button id="edConfirmCancel" class="ed-modal-btn cancel">Cancelar</button>
            <button id="edConfirmOk" class="ed-modal-btn ok">Eliminar</button>
          </div>
        </div>
      </div>
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
        <button class="ed-top-action" id="edDiagBtn" title="Diagnóstico guardado">🩺</button>
        <button class="ed-top-action" id="edSaveBtn" title="Guardar local">💾</button>
        <button class="ed-top-action" id="edCloudSaveBtn" title="Guardar en nube">☁️</button>
      </div>

      <!-- ── BARRA DE MENÚ ── -->
      <div id="edMenuBar">

        <!-- BOTÓN OCULTAR — fijo, no scrollable, siempre al 100% de opacidad -->
        <button id="edMinimizeBtn" class="ed-menu-pin ed-hide-btn"><span style="font-size:1.05rem">▼</span><b style="font-size:.68rem;letter-spacing:.02em">OCULTAR</b></button>
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
                <button class="ed-dropdown-item" id="dd-animation">Animación</button>
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
                  <button class="ed-dropdown-item" id="dd-shape-line">╱ Polígonos</button>
                  <button class="ed-dropdown-item" id="dd-shape-segment"><svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'><line x1='13' y1='3' x2='3' y2='13' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/><line x1='10' y1='3' x2='13' y2='3' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/><line x1='3' y1='10' x2='3' y2='13' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/></svg> Segmentos</button>
                </div>
              </div>
            </div>
          </div>

          <div class="ed-menu-sep"></div>
          <!-- ESCRIBIR -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="escribir">Escribir ▾</button>
            <div class="ed-dropdown" id="dd-escribir">
              <button class="ed-dropdown-item" id="dd-textbox">Caja de texto</button>
              <button class="ed-dropdown-item" id="dd-bubble">Bocadillo</button>
            </div>
          </div>
          <div class="ed-menu-sep"></div>
          <button class="ed-menu-btn" id="edAnimacionesBtn">Animar</button>
          <div class="ed-menu-sep"></div>

          <!-- DESHACER / REHACER -->
          <button class="ed-undo-redo-btn" id="edUndoBtn" title="Deshacer" disabled>↩</button>
          <button class="ed-undo-redo-btn" id="edRedoBtn" title="Rehacer" disabled>↪</button>
          <button class="ed-undo-redo-btn" id="edZoomResetBtn" title="Ver lienzo completo / workspace">🔍</button>
          <div class="ed-menu-sep"></div>
          <button class="ed-menu-btn" id="edMultiSelBtn" title="Selección múltiple (M)">Selección</button>
          <div class="ed-menu-sep"></div>

          <!-- REGLAS -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="rules">Guías ▾</button>
            <div class="ed-dropdown" id="dd-rules">
              <button class="ed-dropdown-item" id="dd-rule-add">＋ Añadir guía</button>
              <button class="ed-dropdown-item" id="dd-rule-toggle"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" style="vertical-align:middle;margin-right:5px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/></svg><span id="dd-rule-toggle-txt">Ocultar guías</span></button>
              <button class="ed-dropdown-item" id="dd-rule-lock-all">🔒 Bloquear guías</button>
              <button class="ed-dropdown-item" id="dd-rule-clear" style="color:#c00">✕ Borrar guías</button>
            </div>
          </div>

          <div class="ed-menu-sep"></div>

          <!-- BIBLIOTECA -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="biblioteca">Biblioteca ▾</button>
            <div class="ed-dropdown" id="dd-biblioteca">
              <button class="ed-dropdown-item" id="dd-bib-save">📥 Guardar en biblioteca</button>
              <button class="ed-dropdown-item" id="dd-bib-open">📂 Abrir biblioteca</button>
            </div>
          </div>

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
              <button class="ed-dropdown-item" id="dd-editproject">Editar datos de la obra</button>
              <div class="ed-dropdown-submenu" id="dd-export-wrap">
                <button class="ed-dropdown-item ed-has-submenu" id="dd-exportbtn">⬇ Descargar… ▸</button>
                <div class="ed-submenu" id="dd-export-sub">
                  <div class="ed-dropdown-submenu" id="dd-export-page-wrap">
                    <button class="ed-dropdown-item ed-has-submenu" id="dd-exportpagebtn">Hoja actual ▸</button>
                    <div class="ed-submenu" id="dd-export-page-sub">
                      <button class="ed-dropdown-item" id="dd-exportpng">PNG (transparencias)</button>
                      <button class="ed-dropdown-item" id="dd-exportjpg">JPG (fondo blanco)</button>
                    </div>
                  </div>
                  <div class="ed-dropdown-submenu" id="dd-export-sel-wrap">
                    <button class="ed-dropdown-item ed-has-submenu" id="dd-exportselbtn">Selección ▸</button>
                    <div class="ed-submenu" id="dd-export-sel-sub">
                      <button class="ed-dropdown-item" id="dd-exportselpng">PNG (transparencias)</button>
                      <button class="ed-dropdown-item" id="dd-exportseljpg">JPG (fondo blanco)</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="ed-dropdown-sep"></div>
              <button class="ed-dropdown-item" id="dd-recoverlocal" style="display:none">↩ Recuperar versión del dispositivo</button>
              <div class="ed-dropdown-sep"></div>
              <div id="dd-project-size" style="padding:7px 14px 8px;font-family:var(--font-body);font-size:.75rem;color:var(--gray-500);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                  <span style="font-weight:700;">Tamaño de la obra</span>
                  <span id="dd-project-size-pct" style="font-weight:900;color:var(--black);">—</span>
                </div>
                <div style="height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;">
                  <div id="dd-project-size-bar" style="height:100%;width:0%;background:var(--black);border-radius:3px;transition:width .3s ease;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:.68rem;">
                  <span id="dd-project-size-used">— MB</span>
                  <span>máx. 60 MB</span>
                </div>
              </div>
            </div>
          </div>

          <div class="ed-menu-sep"></div>

          <!-- AYUDA -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="help">Ayuda ▾</button>
            <div class="ed-dropdown" id="dd-help">
              <button class="ed-dropdown-item" id="dd-shortcuts">⌨ Atajos de teclado</button>
              <button class="ed-dropdown-item" id="dd-anim-tutorial">🎬 Crear animaciones</button>
            </div>
          </div>

        </div><!-- /edMenuScroll -->

      </div>

      <!-- ── PANEL DE OPCIONES CONTEXTUAL ── -->
      <div id="edOptionsPanel"></div>
      <div id="edPanelTab">▼</div>

      <!-- ── BOTÓN FLOTANTE (cuando está minimizado) ── -->
      <div id="edFloatBtn" title="Menú">☰</div>

      <!-- ── BARRA HERRAMIENTAS DIBUJO (minimizado + draw activo) ── -->
      <div id="edDrawBar">
        <div class="edb-handle" title="Mover barra">⠿</div>
        <div class="edb-content">
          <button id="edb-pen"    class="edb-tool" title="Dibujar">✏️</button>
          <button id="edb-eraser" class="edb-tool" title="Borrar">◻</button>
          <button id="edb-fill"   class="edb-tool" title="Rellenar">🪣</button>
          <div class="edb-sep"></div>
          <button id="edb-color"  class="edb-swatch" title="Color"></button>
          <button id="edb-eyedrop" class="edb-tool" title="Cuentagotas">💧</button>
          <button id="edb-pen-size"    class="edb-tool edb-sizebtn-fix" title="Grosor lápiz" style="font-size:.7rem;font-weight:900">Ø</button>
          <button id="edb-eraser-size" class="edb-tool edb-sizebtn-fix" title="Grosor goma"   style="font-size:.7rem;font-weight:900;display:none">Ø</button>
          <div class="edb-sep"></div>
          <button id="edb-offset" class="edb-tool" title="Cursor desplazado" style="font-size:.6rem;font-weight:900;line-height:1;padding:2px 4px">↑<br><span style="font-size:.5rem">CURSOR</span></button>
          <div class="edb-sep"></div>
          <button id="edb-undo"   class="edb-tool" title="Deshacer">↩</button>
          <button id="edb-redo"   class="edb-tool" title="Rehacer">↪</button>
          <div class="edb-sep"></div>
          <button id="edb-ok"     class="edb-ok" title="Finalizar">✓</button>
        </div>
      </div>
      <!-- Popover orientación cursor offset (position:fixed igual que edb-size-pop) -->
      <div id="edb-offset-pop" style="display:none;position:fixed;z-index:1200;
        background:rgba(20,20,20,0.93);border:1px solid rgba(255,255,255,.15);
        border-radius:12px;padding:8px 10px;box-shadow:0 4px 18px rgba(0,0,0,.6);
        flex-direction:row;align-items:center;gap:6px;">
        <button id="edb-offset-pop-l" style="border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:5px 7px;background:transparent;cursor:pointer;" title="Inclinado izquierda">
          <svg width="22" height="28" viewBox="0 0 22 28"><line x1="15" y1="4" x2="7" y2="24" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <button id="edb-offset-pop-r" style="border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:5px 7px;background:transparent;cursor:pointer;" title="Inclinado derecha">
          <svg width="22" height="28" viewBox="0 0 22 28"><line x1="7" y1="4" x2="15" y2="24" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <!-- Popover paleta (hijo de editorShell para z-index correcto) -->
      <div id="edb-palette-pop"></div>
      <!-- Panel grosor anclado a la barra flotante de dibujo -->
      <div id="edb-size-pop" style="display:none;position:fixed;z-index:1200;background:rgba(20,20,20,0.93);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:12px 14px;box-shadow:0 4px 18px rgba(0,0,0,.6);flex-direction:column;align-items:center;gap:10px;min-width:170px">
        <!-- Preview: número a la izquierda + círculo a la derecha -->
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:48px">
          <input type="number" id="edb-size-num" min="1" max="80" value="8"
            style="width:46px;text-align:center;font-size:1rem;font-weight:700;
                   border:1px solid rgba(255,255,255,0.4);border-radius:8px;
                   background:rgba(0,0,0,.4);color:#fff;padding:4px 6px;
                   -moz-appearance:textfield;">
          <span style="color:#ccc;font-size:.75rem">px</span>
          <span id="edb-size-preview" style="display:inline-block;border-radius:50%;background:#fff;transition:width .12s,height .12s,background .12s"></span>
        </div>
        <!-- Slider -->
        <input type="range" id="edb-size-slider" min="1" max="48" value="8"
          style="width:100%;accent-color:#FFE135;cursor:pointer">
      </div>

      <!-- Panel slider adjunto a edShapeBar (grosor, opacidad, curva) -->
      <div id="esb-slider-panel" style="display:none;position:fixed;z-index:1199;background:rgba(20,20,20,.40);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;box-shadow:0 2px 10px rgba(0,0,0,.25);align-items:center;justify-content:center;">
        <input type="range" id="esb-slider-input" min="0" max="100" value="0"
          style="accent-color:#FFE135;cursor:pointer;touch-action:none;">
      </div>

      <!-- Barra flotante Shape/Line -->
      <div id="edShapeBar">
        <div class="edb-handle" title="Mover barra">⠿</div>
        <div class="edb-content">
          <button id="esb-shapes"   class="edb-tool" title="Tipo de objeto" style="min-width:28px;font-size:1rem;font-weight:900">▭</button>
          <div class="edb-sep"></div>
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

    </div>

    <!-- VISOR: canvas fullscreen + controles flotantes -->
    <div id="editorViewer">
      <canvas id="viewerCanvas"></canvas>
      <!-- Contenedor scroll para modos horizontal/vertical -->
      <div id="viewerScroll"></div>
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
    <input type="file" id="edFileGallery" accept="image/jpeg,image/png,image/webp,image/svg+xml,image/bmp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.svg,.bmp,.avif,.heic,.heif,.tif,.tiff,.psd,.xcf" style="display:none">
    <!-- Modal de atajos de teclado -->
    <div id="edShortcutsModal">
      <div class="sc-box">
        <div class="sc-header">
          <span class="sc-title">⌨ Atajos de teclado</span>
          <button class="sc-close" id="edShortcutsClose">✕</button>
        </div>
        <div class="sc-body">

          <div class="sc-section">Historial</div>
          <div class="sc-row"><span class="sc-desc">Deshacer</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Z</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Rehacer</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Y</kbd></span></div>

          <div class="sc-section">Selección y objetos</div>
          <div class="sc-row"><span class="sc-desc">Mover objeto 1 px</span><span class="sc-keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Mover objeto 10 px</span><span class="sc-keys"><kbd>Shift</kbd><kbd>↑↓←→</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Añadir a multiselección</span><span class="sc-keys"><kbd>Shift</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Duplicar objeto seleccionado</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>D</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Eliminar objeto seleccionado</span><span class="sc-keys"><kbd>Supr</kbd><kbd>/</kbd><kbd>Retroceso</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Cancelar selección / cerrar panel</span><span class="sc-keys"><kbd>Esc</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Confirmar / cerrar panel (OK)</span><span class="sc-keys"><kbd>Enter</kbd></span></div>

          <div class="sc-section">Orden de capas</div>
          <div class="sc-row"><span class="sc-desc">Subir capa un nivel</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>]</kbd> <small style="opacity:.6">o</small> <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>↑</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Bajar capa un nivel</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>[</kbd> <small style="opacity:.6">o</small> <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>↓</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Traer al frente</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>]</kbd> <small style="opacity:.6">o</small> <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Alt</kbd><kbd>↑</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Enviar al fondo</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>[</kbd> <small style="opacity:.6">o</small> <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Alt</kbd><kbd>↓</kbd></span></div>

          <div class="sc-section">Zoom y navegación</div>
          <div class="sc-row"><span class="sc-desc">Zoom acercar</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Rueda ↑</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Zoom alejar</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Rueda ↓</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Desplazar canvas</span><span class="sc-keys"><kbd>Rueda</kbd></span></div>

          <div class="sc-section">Editor de animaciones (GCP)</div>
          <div class="sc-row"><span class="sc-desc">Mover objeto seleccionado 1 px</span><span class="sc-keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Mover objeto seleccionado 10 px</span><span class="sc-keys"><kbd>Shift</kbd><kbd>↑↓←→</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Navegar entre frames (sin selección)</span><span class="sc-keys"><kbd>←</kbd><kbd>→</kbd></span></div>

        </div>
      </div>
    </div>

    <!-- Modal de tutorial Crear animaciones -->
    <div id="edAnimTutorialModal">
      <div class="sc-box">
        <div class="sc-header">
          <span class="sc-title">🎬 Crear animaciones</span>
          <button class="sc-close" id="edAnimTutorialClose">✕</button>
        </div>
        <div class="sc-body">
          <p style="text-align:center;color:var(--gray-500);font-style:italic;padding:24px 0;">Próximamente...</p>
        </div>
      </div>
    </div>

    <input type="file" id="edFileGif" accept=".gif,image/gif" style="display:none">
    <input type="file" id="edFileAnim" accept=".gif,image/gif,.apng,image/apng,image/vnd.mozilla.apng" style="display:none">
    <!-- Overlay cámara in-app -->
    <div id="edCameraOverlay" class="hidden">
      <video id="edCameraVideo" autoplay playsinline muted></video>
      <div id="edCameraControls">
        <button id="edCameraClose" title="Cerrar">✕</button>
        <button id="edCameraCapture" title="Capturar"></button>
        <button id="edCameraFlip" title="Cambiar cámara">🔄</button>
      </div>
    </div>
    <!-- Bloqueante GIF: cubre toda la pantalla bajo gcpShell para absorber eventos -->
    <div id="gcpBlocker" style="display:none;position:fixed;inset:0;z-index:498;touch-action:none;-webkit-user-select:none;user-select:none;pointer-events:none"></div>

    <!-- Editor GIF: mismo diseño que el editor (mismas clases CSS) -->
    <div id="gcpShell">
      <div id="gcpTopbar">
        <span id="gcpProjectTitle">Gif 1</span>
        <span class="ed-top-spacer"></span>
        <div class="ed-top-pagnav" id="gcpFrameNav" style="display:none">
          <button class="ed-top-pagebn" id="gcpFramePrev" title="Frame anterior">&#9664;</button>
          <span id="gcpFrameNum">1</span>
          <button class="ed-top-pagebn" id="gcpFrameNext" title="Frame siguiente">&#9654;</button>
        </div>
        <span class="ed-top-spacer"></span>
        <button class="ed-top-action" id="gcpPreviewBtn" title="Previsualizar">▶</button>
        <button id="gcpCloseBtn" title="Volver al editor">✕</button>
      </div>
      <div id="gcpMenuBar">
        <button class="ed-menu-pin ed-hide-btn" style="display:none"><span style="font-size:1.05rem">▼</span><b style="font-size:.68rem">OCULTAR</b></button>
        <div class="ed-menu-sep"></div>
        <div id="gcpMenuScroll">
          <!-- Biblioteca -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" id="gcpBibBtn">Biblioteca ▾</button>
          </div>
          <div class="ed-menu-sep"></div>
          <!-- Guardar Frame + Añadir Frame -->
          <button class="ed-menu-btn" id="gcpSaveFrameBtn" title="Guardar frame actual" style="font-weight:700">💾 Frame</button>
          <button class="ed-menu-btn" id="gcpAddFrameBtn" style="font-weight:900;font-size:1.5rem;line-height:1;padding:0 14px;min-height:36px">＋</button>
          <div class="ed-menu-sep"></div>
          <!-- Deshacer / Rehacer -->
          <button class="ed-undo-redo-btn" id="gcpUndoBtn" title="Deshacer" disabled>↩</button>
          <button class="ed-undo-redo-btn" id="gcpRedoBtn" title="Rehacer" disabled>↪</button>
          <button class="ed-undo-redo-btn" id="gcpZoomResetBtn" title="Ver lienzo completo / workspace">🔍</button>
          <button class="ed-undo-redo-btn" id="gcpSbDiagBtn" title="Diagnóstico scrollbars">🩺</button>
          <div class="ed-menu-sep"></div>
          <!-- Frames -->
          <button class="ed-menu-btn" id="gcpFramesToggleBtn">Frames ▾</button>
          <div class="ed-menu-sep"></div>
          <!-- Comportamiento -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-gcpmenu="comportamiento">Comportamiento ▾</button>
            <div class="ed-dropdown" id="gdd-comportamiento" style="min-width:210px;padding:6px 0">
              <div class="ed-dropdown-label">Velocidad</div>
              <div style="padding:4px 14px 10px">
                <input type="range" id="gcpFpsSlider" min="1" max="24" value="10" step="1"
                  style="width:100%;accent-color:var(--black);cursor:pointer">
              </div>
              <div class="ed-dropdown-label">Repeticiones</div>
              <div style="padding:4px 14px 6px">
                <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:.82rem;font-weight:700;font-family:var(--font-body)">
                  <input type="checkbox" id="gcpRepInfinite" checked style="width:15px;height:15px;accent-color:var(--black);flex:none">
                  ∞ Infinito
                </label>
              </div>
              <div id="gcpRepSliderRow" style="display:none;padding:4px 14px 10px">
                <input type="range" id="gcpRepSlider" min="1" max="10" value="1" step="1"
                  style="width:100%;accent-color:var(--black);cursor:pointer">
              </div>
              <div class="ed-dropdown-sep"></div>
              <div id="gcpBehaviourSummary" style="padding:6px 14px 8px;font-family:var(--font-body);font-size:.78rem;font-weight:700;color:var(--gray-500);text-align:center">10 fps · ∞</div>
            </div>
            <!-- Burbuja flotante de valor para sliders de comportamiento -->
            <div id="gcpSliderBubble" style="display:none;position:fixed;z-index:10000;background:var(--black);border-radius:8px;padding:5px 10px;color:var(--white);font-size:.85rem;font-weight:900;pointer-events:none;text-align:center;transform:translateX(-50%) translateY(-100%);margin-top:-8px;font-family:var(--font-body)"></div>
          </div>
          <div class="ed-menu-sep"></div>
          <!-- Guardar -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-gcpmenu="guardar" style="font-weight:700">Guardar ▾</button>
            <div class="ed-dropdown" id="gdd-guardar" style="min-width:220px">
              <button class="ed-dropdown-item" id="gcpSaveAppBtn"><span class="dd-icon">📥</span>Guardar en la aplicación</button>
              <button class="ed-dropdown-item" id="gcpDownloadApngBtn"><span class="dd-icon">⬇️</span>Descargar APNG <small style="opacity:.6">(web)</small></button>
              <button class="ed-dropdown-item" id="gcpDownloadGifBtn"><span class="dd-icon">⬇️</span>Descargar GIF <small style="opacity:.6">(Windows)</small></button>
              <button class="ed-dropdown-item" id="gcpDownloadMp4Btn"><span class="dd-icon">⬇️</span>Descargar MP4 <small style="opacity:.6">(WhatsApp y redes)</small></button>
            </div>
          </div>
          <div class="ed-menu-sep"></div>
          <!-- Guías -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-gcpmenu="gcpRules">Guías ▾</button>
            <div class="ed-dropdown" id="gdd-gcpRules">
              <button class="ed-dropdown-item" id="gcp-rule-add">＋ Añadir guía</button>
              <button class="ed-dropdown-item" id="gcp-rule-toggle"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" style="vertical-align:middle;margin-right:5px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/></svg><span id="gcp-rule-toggle-txt">Ocultar guías</span></button>
              <button class="ed-dropdown-item" id="gcp-rule-lock-all">🔒 Bloquear guías</button>
              <button class="ed-dropdown-item" id="gcp-rule-clear" style="color:#c00">✕ Borrar guías</button>
            </div>
          </div>
          <div class="ed-menu-sep"></div>
          <!-- Ayuda — sistema nativo GCP (data-gcpmenu + gdd- prefix) -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-gcpmenu="gcp-help">Ayuda ▾</button>
            <div class="ed-dropdown" id="gdd-gcp-help">
              <button class="ed-dropdown-item" id="gcp-dd-shortcuts">⌨ Atajos de teclado</button>
              <button class="ed-dropdown-item" id="gcp-dd-anim-tutorial">🎬 Crear animaciones</button>
            </div>
          </div>
        </div>
      </div>
      <!-- Panel de frames: toggle, deslizante horizontal, miniaturas 88×88 -->
      <div id="gcpFramesBar">
      </div>
      <!-- Panel de propiedades del objeto seleccionado (doble tap) -->
      <div id="gcpPropsPanel"></div>
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
        <a href="#home" onclick="Router.go('home');return false;" class="logo-link logo-img-link">
          <img src="logo_long.png" alt="ComiXow" class="logo-img" style="height:22px;width:auto;">
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
