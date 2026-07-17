/* Comxow/COMXOW, creada por A. Gavina Costero  2026, albertobicho@gmail.com */
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
    <footer class="app-version">v34.10</footer>
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
  css: ['css/editor.css', 'css/trix.css'],
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

      <!-- Modal de acción de botón (navegación a hoja o URL externa) -->
      <div id="edBtnModal" class="ed-confirm-overlay">
        <div class="ed-confirm-box" style="max-width:340px;width:92vw;gap:0">
          <p class="ed-confirm-msg" style="font-size:1rem;margin-bottom:14px">🔗 Acción al tocar</p>
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:700;font-size:.9rem">
              <input type="radio" name="bamType" id="bam-none" value="none" style="accent-color:var(--black);width:18px;height:18px">
              Sin acción
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:700;font-size:.9rem">
              <input type="radio" name="bamType" id="bam-page" value="page" style="accent-color:var(--black);width:18px;height:18px">
              Navegar a hoja…
            </label>
            <div id="bam-page-list" style="display:none;max-height:160px;overflow-y:auto;border:1.5px solid var(--gray-300);border-radius:8px;padding:4px;background:var(--white)"></div>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:700;font-size:.9rem">
              <input type="radio" name="bamType" id="bam-url" value="url" style="accent-color:var(--black);width:18px;height:18px">
              Abrir URL externa
            </label>
            <div id="bam-url-row" style="display:none">
              <input id="bam-url-input" type="url" placeholder="https://…"
                style="width:100%;box-sizing:border-box;padding:9px 10px;border:1.5px solid var(--gray-300);border-radius:8px;font-size:.9rem;font-family:var(--font-body)">
            </div>
          </div>
          <div class="ed-modal-actions" style="gap:8px">
            <button id="bam-cancel" class="ed-modal-btn cancel">Cancelar</button>
            <button id="bam-ok" class="ed-modal-btn ok">✓ OK</button>
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
      <!-- Modal selección de capa (barra flotante) -->
      <div id="edLayerPickModal" class="ed-confirm-overlay">
        <div class="ed-confirm-box">
          <p id="edLayerPickMsg" class="ed-confirm-msg"></p>
          <div class="ed-modal-actions">
            <button id="edLayerPickDraw" class="ed-modal-btn cancel">Capa de dibujo</button>
            <button id="edLayerPickFill" class="ed-modal-btn ok">Capa de relleno</button>
          </div>
        </div>
      </div>
      </div>

      <!-- ── BARRA SUPERIOR ── -->
      <div id="edTopbar">
        <div id="edTitlePill" aria-hidden="true"></div>
        <button id="edBackBtn" title="Volver a Mis Creaciones">◀</button>
        <span id="edProjectTitle">Sin título</span>
        <span class="ed-top-spacer"></span>
        <div class="ed-top-pagnav">
          <div id="edPageNavPill" aria-hidden="true"></div>
          <button class="ed-top-pagebn" id="edPagePrev" title="Página anterior">&#9664;</button>
          <span id="edPageNum">1</span>
          <button class="ed-top-pagebn" id="edPageNext" title="Página siguiente">&#9654;</button>
        </div>
        <button class="ed-top-action" id="edFsBtn" title="Pantalla completa">⛶</button>
        <button class="ed-top-action" id="edPreviewBtn" title="Vista previa">▶</button>
        <!-- Botón de diagnóstico oculto a petición de Alberto (no borrar):
             para volver a mostrarlo, descomentar la línea siguiente. La función
             de reparación (_edRepairDuplicateIds, botón 🔧 Reparar IDs dentro de
             este panel) sigue activa en el código aunque el botón esté oculto —
             ver CARTA_SIGUIENTE_INSTANCIA para el motivo.
        <button class="ed-top-action" id="edDiagBtn" title="Diagnóstico guardado">🩺</button>
        -->
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
                <button class="ed-dropdown-item" id="dd-paste">Pegar</button>
              </div>

            </div>
          </div>

          <div class="ed-menu-sep"></div>

          <!-- DIBUJAR -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="draw">Dibujar ▾</button>
            <div class="ed-dropdown" id="dd-draw">
              <button class="ed-dropdown-item" id="dd-pen">Herramientas de dibujo</button>
              <div class="ed-dropdown-submenu">
                <button class="ed-dropdown-item ed-has-submenu" id="dd-vectorial-btn">Dibujo vectorial ▸</button>
                <div class="ed-submenu" id="dd-vectorial-sub">
                  <button class="ed-dropdown-item" id="dd-shape-rect">▭ Rectángulo</button>
                  <button class="ed-dropdown-item" id="dd-shape-ellipse">◯ Elipse</button>
                  <button class="ed-dropdown-item" id="dd-shape-line"><svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 22'><g transform='translate(11.796 10.646)'><path d='M -5.009 8.486 L -9.796 0.801 L -1.447 -8.486 L 9.796 -2.082 L 5.566 8.806 L -5.009 8.486 Z' fill='none' stroke='currentColor' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'/></g></svg> Polígonos</button>
                  <button class="ed-dropdown-item" id="dd-shape-segment"><svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 22 20'><g transform='translate(10.698 9.656)'><path d='M -8.698 7.656 L -2.588 -1.867 L 2.308 3.613 L 8.698 -7.656' fill='none' stroke='currentColor' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'/></g><g transform='translate(8.123 7.544)'><path d='M 1.383 0.000 L 1.357 0.248 L 1.278 0.487 L 1.150 0.707 L 0.978 0.900 L 0.768 1.059 L 0.529 1.176 L 0.270 1.249 L 0.000 1.273 L -0.270 1.249 L -0.529 1.176 L -0.768 1.059 L -0.978 0.900 L -1.150 0.707 L -1.278 0.487 L -1.357 0.248 L -1.383 0.000 L -1.357 -0.248 L -1.278 -0.487 L -1.150 -0.707 L -0.978 -0.900 L -0.768 -1.059 L -0.529 -1.176 L -0.270 -1.249 L -0.000 -1.273 L 0.270 -1.249 L 0.529 -1.176 L 0.768 -1.059 L 0.978 -0.900 L 1.150 -0.707 L 1.278 -0.487 L 1.357 -0.248 L 1.383 0.000 Z' fill='currentColor' stroke='none'/></g><g transform='translate(13.073 13.298)'><path d='M 1.383 0.000 L 1.357 0.248 L 1.278 0.487 L 1.150 0.707 L 0.978 0.900 L 0.768 1.059 L 0.529 1.176 L 0.270 1.249 L 0.000 1.273 L -0.270 1.249 L -0.529 1.176 L -0.768 1.059 L -0.978 0.900 L -1.150 0.707 L -1.278 0.487 L -1.357 0.248 L -1.383 0.000 L -1.357 -0.248 L -1.278 -0.487 L -1.150 -0.707 L -0.978 -0.900 L -0.768 -1.059 L -0.529 -1.176 L -0.270 -1.249 L 0.000 -1.273 L 0.270 -1.249 L 0.529 -1.176 L 0.768 -1.059 L 0.978 -0.900 L 1.150 -0.707 L 1.278 -0.487 L 1.357 -0.248 L 1.383 0.000 Z' fill='currentColor' stroke='none'/></g></svg> Segmentos</button>
                </div>
              </div>
            </div>
          </div>

          <div class="ed-menu-sep"></div>
          <!-- ESCRIBIR -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="escribir">Escribir ▾</button>
            <div class="ed-dropdown" id="dd-escribir">
              <button class="ed-dropdown-item" id="dd-textdoc">Editor de textos</button>
              <div class="ed-dropdown-sep"></div>
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
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" id="edMultiSelBtn" data-menu="select">Selección ▾</button>
            <div class="ed-dropdown" id="dd-select">
              <button class="ed-dropdown-item" id="_sel-all">Seleccionar todo</button>
              <button class="ed-dropdown-item" id="_sel-none">Deseleccionar todo</button>
              <div class="ed-dropdown-sep"></div>
              <div class="ed-dropdown-submenu" id="dd-export-sel-wrap">
                <button class="ed-dropdown-item ed-has-submenu" id="dd-exportselbtn">⬇ Descargar selección ▸</button>
                <div class="ed-submenu" id="dd-export-sel-sub">
                  <button class="ed-dropdown-item" id="dd-exportselpng">PNG (transparencias)</button>
                  <button class="ed-dropdown-item" id="dd-exportseljpg">JPG (fondo blanco)</button>
                  <button class="ed-dropdown-item" id="dd-exportselsvg">SVG</button>
                </div>
              </div>
              <div class="ed-dropdown-sep"></div>
              <button class="ed-dropdown-item" id="_sel-group">⊞ Agrupar</button>
              <button class="ed-dropdown-item" id="_sel-ungroup">⊟ Desagrupar</button>
              <button class="ed-dropdown-item" id="_sel-merge">⊕ Unir</button>
              <button class="ed-dropdown-item" id="_sel-bib-save">📥 Guardar en biblioteca</button>
              <div class="ed-dropdown-sep"></div>
              <button class="ed-dropdown-item" id="_sel-delete" style="color:#c00">✕ Eliminar selección</button>
            </div>
          </div>
          <div class="ed-menu-sep"></div>

          <!-- REGLAS -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-menu="rules">Guías ▾</button>
            <div class="ed-dropdown" id="dd-rules">
              <label class="ed-dropdown-item" id="dd-grid-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
                <input type="checkbox" id="dd-grid-check" style="width:16px;height:16px;accent-color:#1a8cff;cursor:pointer;flex-shrink:0">
                <span>Cuadrícula</span>
              </label>
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
              <div class="ed-dropdown-submenu" id="dd-export-page-wrap">
                <button class="ed-dropdown-item ed-has-submenu" id="dd-exportpagebtn">⬇ Descargar hoja actual ▸</button>
                <div class="ed-submenu" id="dd-export-page-sub">
                  <button class="ed-dropdown-item" id="dd-exportpng">PNG (transparencias)</button>
                  <button class="ed-dropdown-item" id="dd-exportjpg">JPG (fondo blanco)</button>
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
              <button class="ed-dropdown-item" id="dd-shortcuts">Atajos de teclado</button>
              <button class="ed-dropdown-item" id="dd-anim-tutorial">Crear animaciones</button>
              <button class="ed-dropdown-item" id="dd-help-draw-tools">Herramientas de dibujo</button>
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
          <button id="edb-pen"    class="edb-tool" title="Dibujar"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="26" viewBox="0 0 48 70"><g transform="translate(10.823 54.666)"><path d="M 5.726 5.124 L 7.133 0.079 L 6.731 -5.386 L 1.507 -6.542 L -5.124 -2.496 L -7.133 0.867 L -7.133 6.542 L 5.726 5.124 Z" fill="#aa6e6e" stroke="none" stroke-width="0"/></g><g transform="translate(9.532 55.352)"><path d="M -2.039 5.295 L -1.768 -0.655 L -4.747 7.279 L -6.102 3.312 L -5.435 -1.244 L -2.190 -4.450 L 3.217 -7.279 L 6.102 -6.336 L 2.496 -0.490 L 1.054 6.110 L -2.039 5.295 Z" fill="#f9cdcd" stroke="none" stroke-width="0"/></g><g transform="translate(9.881 62.884)"><path d="M -6.530 -4.099 L -5.274 -4.388 Q -4.018 -4.677 -2.779 -4.323 L -0.006 -3.532 Q 2.612 -2.785 5.124 -3.836 L 7.635 -4.887 L 6.077 -1.166 L -0.402 3.100 L -7.937 4.835 L -6.329 2.312 L -6.329 -0.841 L -6.530 -4.099 Z" fill="#321a1a" stroke="none" stroke-width="0"/></g><g transform="translate(29.239 24.586)"><path d="M -15.267 20.131 L -10.178 21.130 L -2.863 10.648 L 3.181 1.830 L 10.496 -8.652 L 14.631 -15.140 L 15.267 -19.133 L 14.313 -21.130 L 10.178 -19.965 L 3.817 -15.307 L -1.272 -7.154 L -6.997 3.327 L -11.132 12.312 L -15.267 20.131 Z" fill="#f2deba" stroke="none" stroke-width="0"/></g><g transform="translate(28.434 24.239)"><path d="M -14.421 19.989 L -10.816 20.744 L -0.000 -3.583 L 5.768 -11.503 L 14.060 -20.744 L 1.803 -11.315 L -3.245 -1.697 L -8.292 9.429 L -14.421 19.989 Z" fill="#ffffff" stroke="none" stroke-width="0"/></g><g transform="translate(31.689 24.598)"><path d="M -11.710 21.312 L -5.900 10.714 L 0.655 2.766 L 6.912 -6.274 L 13.795 -16.437 L 12.601 -21.312 L 10.450 -16.749 Q 8.299 -12.187 5.412 -8.051 L 5.148 -7.672 Q 1.996 -3.157 -1.295 1.258 L -2.145 2.399 Q -4.857 6.039 -7.539 9.701 L -7.895 10.188 Q -10.220 13.364 -12.008 16.870 L -13.795 20.377 L -11.710 21.312 Z" fill="#9f8484" stroke="none" stroke-width="0"/></g><g transform="translate(16.226 46.929)"><path d="M -1.812 -2.397 L 3.730 -1.059 L 1.428 2.700 L -3.844 1.666 L -1.812 -2.397 Z" fill="#ffe135" stroke="#000000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></g><g transform="translate(23.286 34.949)"><path d="M -20.214 30.952 L -19.812 29.954 Q -19.410 28.955 -19.534 27.886 L -19.611 27.221 Q -19.812 25.487 -19.677 23.746 L -19.587 22.604 Q -19.410 20.337 -18.004 18.550 L -18.004 18.550 Q -16.598 16.764 -14.643 15.601 L -10.526 13.152 L -7.010 6.168 Q -3.495 -0.815 -0.357 -7.976 L 0.819 -10.659 Q 3.495 -16.766 7.466 -22.121 L 8.164 -23.063 Q 11.437 -27.477 16.203 -30.213 L 17.987 -31.237 Q 20.969 -32.949 21.127 -29.515 L 21.127 -29.515 Q 21.286 -26.080 19.518 -23.131 L 18.109 -20.782 Q 14.932 -15.485 11.152 -10.600 L 7.727 -6.174 Q 2.859 0.116 -1.067 7.034 L -5.401 14.670 L -5.195 19.963 Q -5.083 22.820 -6.354 25.381 L -6.354 25.381 Q -7.625 27.943 -10.096 29.381 L -10.325 29.515 Q -13.026 31.086 -16.074 31.774 L -20.181 32.700 Q -21.286 32.949 -20.750 31.951 L -20.214 30.952 Z" fill="none" stroke="#000000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></g></svg></button>
          <button id="edb-eraser" class="edb-tool" title="Borrar"><img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIgogICAgIHdpZHRoPSIyMSIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDIxIDIwIj4KICA8aW1hZ2UgaHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFCVUFBQUFVQ0FZQUFBQmlTM1l6QUFBRUZVbEVRVlI0QWJTU2YweVVkUnpIUDkvbkYyZUFRQndKaG9hRnpybXhydkZqSWJVd0NZMVowOHdMYTVXTmlVNjNhblBKeWorNldFd2JZTG1BbEJoSktjZWdXb1dMTUptaXN3NEZzZFdKRUwrRy9EZzhQZTdoemp1T2U1N24yK2Q1NEc0bVRQL1I3ejd2NzgvUDkvVjlQOS92dzhBREtQY0xxbkxDQXY3VVFhQi8xN2ErSGxpckZRUktZYjQ5Q202V1VGck1sNkF0ekZiazlEZmJkTC9YRjBTOGtMb3gzT3ZOangwZmYxUC9WM04ycU1rMEJ6NDF1MmZPUW1BZU1nMlJrWjJkMnlJKy85NlNVMXgxcWlObDdZWFJyS3phZjFOVG12czM1RjA4VmwwZHR0dHFYU1VFTjl6V21jOHBhVy9QNSt0KzJ5ZHMzblNpNGcvTDJBOFpxdzJQSC8vdUU2R3o0eWd4bXd2NXJWdGZYQ2ZMUWtGYVd1L1BPZzR5NFk1eUo1UlFDdXoyN1QrK3VtTEZ4NTBaejZUa1hteXJwZ1VmdkVVTWhrUW1SaC9KR1o1Y3poY1Y3aEI2dWhvV3ZQM0crZ1NmVEtxUTJZcGFpTkxpZGlpVG1RbHNlQ2o3NVVDL3A3S2liRTljVmVWSHNIaXhucWlaRklCZ0FZWVF3SU1aUVFpTEtDa3RXbXF4RkI0QmdDZFFjU2d0Z3REdzhKQU41ODZScnVUVXBKeXVLM1U2NDVZc29LQVFoQUVnbGlVTTVUZ09XSTRIeW9TRFFxTVl4MFRQQXAxQTlnTkFMNjQ5aXEwV0twVG5lYWJNNTVNT0YzMjZ3LzlyWTBsb2RGUUVTeFdLbHJTY21Rb2RFcUpENkRKMEdnWDJHMVlReFI1MEx1T1JNQ3BKVXV4TUlvQUtyWStMMVNkZEd6eXRmLy9kM0NVY3h6K003b2pxTHBDazlVa0lBaDhEV2RhQi9mb2xFSjFYaWFKTWc5MCtPWUo1eWFpbEtDMVVxS0htNkh0SlFFUUVSZkU0UzdCUXdoQVU2eUhNd2dGQzlFRFlKZUNibG1IYzFncWkySTJmTDlIMjltRzZOcnZVaVh0T29BNmd0RkNoTGxHOEh1RndkTE1UNGhDbmdCNFlMZ0ZZUGhFNElaSGgrV1VQRWVZUmNMdWN4R1pySmE3SmJnQkZocnE2RHVtZHZLK244ZEhLa2JRSEZRd1Y2bTVwK2VlTUludXA0K2Jmek9CQU16aWRJMERJSWxSTWlDUXhNUTY4dnh2MlA0SHQ3c09OTWhRZlBLa2MrT3lYY1J6a3hNZkhmNHV0eXNGbUp0VEI1YktLbHFpZVhwdGRsdjNFTDdueG5pNFF1OTFDRkVVaEhxK05jVGc2WWNvM1JtWEpUL04zMWpqckd5em5FeEpDVmlQaS9QRHdzQmRiQlJVTUZib2JQK0hZcGxmSzlXWnptNkkrdVNTSklEcXQ0UEdNd0sxYi9mZzRMdHJkUFVvem55L3U2N295L0ZOTnpjYjFmWDNlYTBpWlJzMEpGWXFQRFFkNUh0S0tTNXJhc3RlVjJxOTJqZUhKVTVUUVVhcElOK254MmpZd3Z2YVZIMys5eXNPVkwrMDBHaHRVZDNOZ2dRa1Zxdlg5ZnJoVVcwdWZGU2M5aDNKZlB6THhkUG8rMTFQSlJ2dktWWG4waTBNbnorcjF3c3ZwNlN2TEVUaXZPdzB5V3dXaDZ0aG9CSG52WG1tLzJieDVrY3ZsZm01d2NHUkxkSFRJOHFhbWpLeGR1ejQ4MWRqWTRWSHo3cVgvUWRWa2t3a1VkQ09qODh1U0JHZUhoc1QrTld2T1NDYVRDYTlFemJpMy9nTUFBUC8vREM3b1R3QUFBQVpKUkVGVUF3QlRnYWc0d2ZFMDZnQUFBQUJKUlU1RXJrSmdnZz09IiB4PSIwIiB5PSIwIiB3aWR0aD0iMjEiIGhlaWdodD0iMjAiLz4KPC9zdmc+" width="21" height="20" style="image-rendering:pixelated;vertical-align:middle"/></button>
          <div class="edb-sep"></div>
          <button id="edb-color"  class="edb-swatch" title="Color"></button>
          <button id="edb-eyedrop" class="edb-tool" title="Cuentagotas">💧</button>
          <button id="edb-pen-size"    class="edb-tool edb-sizebtn-fix" title="Grosor lápiz" style="font-size:.7rem;font-weight:900">Ø</button>
          <button id="edb-eraser-size" class="edb-tool edb-sizebtn-fix" title="Grosor goma"   style="font-size:.7rem;font-weight:900;display:none">Ø</button>
          <div class="edb-sep"></div>
          <button id="edb-offset" class="edb-tool" title="Cursor desplazado"><img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIgogICAgIHdpZHRoPSI5MCIgaGVpZ2h0PSIzNCIgdmlld0JveD0iMCAwIDkwIDM0Ij4KICA8aW1hZ2UgaHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFGb0FBQUFpQ0FZQUFBRGYyYzZ1QUFBUDBVbEVRVlI0QWV5YUNYaE8xN3JIMzcyL1JDWkR6U2ROcFpXMjVxS1VLcHFXVzl4YlhPWDB0Tm9ldDZhVGxCcVBLY1FVQkEyQ2tsSVVOVk96b0VKRmhncmF0SlRUUXgyVUkyaU1TU1F5ZmQrK3YvY3ozRVM1RWlYNm5PZmtlZi9mR3ZZYS8rdGQ2MzMzMmpIbDMzK0ZZc0FTc1lIUzRDWFFCdnducUFMY2dlMXVqVDFNb2wzbzFBT1VBbVZCT1ZDMlZLbFNwZm5UdkJLa3ZZQ1djU04wQlRyUWh6a211cmcvZ1VSWFVJWGFFZUJINHJ2dElwdkFWdUtIeWRzUFJoS3ZCblF1SlA5UEh1U2tsTmpIeXBZdDYxT3NXTEZxSGg0ZWJSOS8vUEdSMWF0WGovVHo4enZtNit1YlZMVnExWjhxVmFyMHpSTlBQTEc5WnMyYXl5dFhyaHp1NCtNVFhMRml4UjdVNjFpeVpNbFdycTZ1RFJpZW43dTdlMlhnUzc1UDhlTEZ5NU5YRXJpREJ6bG1tcnUzUUZ3eFNuVUFVYmtpZ1JkRi92QVBFcnRCTFBoUnhQaEZwR3FXeUVnUldRcmVvSTZPbCtoMSthMkRWbkxMbFNoUm9wck5abXNKZ1NHUSttWHQyclcvZitXVlY1WjM3ZHExLy9qeDQ1c3VYNzY4MUpvMWE0b3RXYktrelB6NTg1K2VQbjE2Z3pGanhyUU9EZzRPNk4yNzkrQk9uVHFGdG0zYk5vSTZLeHMxYXJTcmJ0MjYvNmhWcTlhaE9uWHE3SG4yMldlM1ZLbFNaVGFMTklqRmVxdDgrZkpOMlJIUGVYdDdWK2VaWDQwYU5mN0Fnbm95SFFNOExHbEl3ek96Ulo3OGxzaGZEVVA4YmFhOENsNERUVUVYOGpid0xGbWtIbG8raGVnZklWdDNMRkdSK3lGYXlhM2c1ZVZWQjNKYlAvbmtrME1oWkV2ejVzMDNCQVlHZHA4MGFWS3R6WnMzdTIvZHV0VnQ3Tml4Ym0rODhZWTBiTmhRWG5qaEJTY2FOR2dnelpvMWt3NGRPa2kzYnQxa3lKQWhydFR4WExCZ1FZbU5HemNXajQyTmRVOU1URFMyYmR2bXljSjRUNTA2dGZidzRjUGI5K3paTStqTk45Lzg1TFhYWHR2aTcrLy9kZVBHamJmVnIxOS9FWXM2Z1lWNEJ6UjQ1cGxuOUFoeVR1eEIvVUNXYW5NSW1sd3VrVVo3bUlZc0FSQks2cnFrRW13anJ5ZUVUekJFVG9oVWNvZ01KcnN1OWZVNExCVFJwYW40UEdpSE52V3ZWNi9lNHRkZmYzMWw5KzdkZTB5Y09QR3BxS2dvRndqeFJDdWxRb1VLRkx0L01VMVR5cFFwSXhBbmFMaTBiOS9lNk5Pbmo4dVVLVk84bGkxYjVyVjY5ZW9TczJmUHJqUnMyTEFtN0pyTzdkcTErNWlGWE13eDAwWkVsQmlDL01LRURlQUMzSUFIS0E1S0FUVnM1UWdyQUcvd0JQQUZsY0hUdFBJS2FINlZuekRJL0FITkpYcEh1VXp1SE1hK0VyS3ZpRlFqK1JkUUN0eVRhTlg0aWhSc2hoRUxSQnNubzZFTG1Gd2Z0bjBOTk02TjBLTkpreVkwVGFraUVoY1hGeWxYcnB3ODk5eHowcUpGQytuWHI1OG5xT0ppbXBQMnVycDJoYUIzYjBDMzc5c2FaMmlkUUdmUURRU0FIcUFYNkF2K0NnYUJJQkFNOUt3TklSd0hRcWd2U3ZUTy80ZGt5amtsazkrbGxOTXpISzMrTDVMbHdGMkp0cm03dS90aTFOcFhxRkJoQU50MUd1UUdCd1VGdmZqcHA1OTZjcjU2dG1yVnlvYnhFc01vVW81MXpIY0VTaUM1MmRtVnkrVG16b0lZTlVpS3p5bXNXSHdqbkV1b1hzTTB3akNnUkk0aUhBb0dnajdnQTZDTG9RdlRrZmhMUUpSQUpWdmo5OElST0RsT29Sd1IzZHFWaVA2S2FGZklyWVZ4Nnd6Qkl6QlFFM3YxNnRWNzFLaFIxVUpDUW9wenJucVJiOU90clpWL1R6aDY5S2k0V0ZaYW1zZ1d4clVHZkFFaXdWcXdITndrZXo3eGVXQU9tQTArQVRQQngwQVhJSnh3TXRDRm1FZzRBNGdYUHo0V1MwaFlFRWxGL3pDS1dyUzQvcGo2QTlUQU5lVjRHTXgySE5tbFM1ZXhHS25PUTRjT3JUeGd3QUQzcGsyYkZvTjhpajFZc1JqNGdmMzdKUzR1VHZidDJ5Y0hEaHlRdzRjUHkrWExsMFdmWldkbnk3VnIxK1RxMWF1U2twSWlGeTllbE9Ua1pEbDc5cXljUG4xYVRwNDhLVXB3VEV5TXpKdzVNKzFhV3RxbktaWVZ6QnhWUTM4cmdtNjJRM2hRMldwWFFKNjFyQTlsTVJiWVVEbXJyQ25SM2hpUlVMUVZXelo4eU9qUm8vKzdmLy8rM25nUUxsaDFtNmVuZWs1YTlNRWpKeWRIRXIvN1RyWnMyaVNyVjYyU0pZc1d5Ynk1YzYySW1UUHRJMGVNc0JpSGZlREFnVGtzZWhhTGZtM0VpQkZYMlYwcElTRWhsL0Jvem84Yk4rNWNXRmpZaVlpSWlLOGlJeU5ERHljbGhUY1RPUUF4UjhFeGNBS2NCUDhFU2VBc1NBWVh3Q1Z3QmFqeVhTWE1BSmtnRytRQ3FCSWhUQmVSQ0Zod2RFSXgvQjNPYkxMdUx2NlVxOHBqdEhjL3dUK0JtQmlXR3MvWHJkc2RvL1pxUUVCQWlUWnQycmc5OWRSVGd1dW16eDhxOUFqQ2tBcDlpditMTDByamV2V2tVWjA2OHJTUGo1RjE5V3JLd3Zueko4eWJONjh6cmwrWGhRc1hkbG04ZUhHM0pVdVdkRis1Y3VWZlZxMWFGWUQzRVloLy9tRjBkUFNRNDhlUHo4ckl5RkR0dVRjVGhaL1ZPcHZJaWpyVUd3bUpmd1FsaWQ4dUVDdk5lUFloaStFandpa21uMUhtQ2hEbWFwYXZXYU9HQys2YW14bzN6U3dxc01oU3RXcFZlYWxKRTJtRXIvMWkvZnJTdUdGRHc3OXhZK1B0OXUzZFB1amE5WEdPajJVY0g4dkJTbzZRVldEMWxTdFgxb0wxWUNQSHpOWUxGeTZvaTZ2dTdNTWErbmthSG9lVC9sa1RrWXh4RUJuaGNFZ0FZUXVJVlhJN0V2K0l2SThJL1VWU3VWZFlRSjNOSUJNNGlmYXFXTDY4cVlsSEJkTm1jNTdKTi90bnV4cGxIbnZNdlU3dDJpK1M1N1RhaEk5TUdJL3VraU1NWUN6bmJtOHVQR0xmdENSbk9DUlBnOWdaSUpTNCtwWFBpM3pQTWFQdTRWVEtuN2xSVjB5TWptZVowcVZOaC8yR2plUnBVUXR1bWRnNXIvUDI2MkRnYUN3N1Z2UitJKytqUnhLSE1BYzRTZWZMUVRjSWI4ZnhNSXkza2xrUXUyNjdJYWVHRzNKb3ZBZ2k2dG1vYmJoRnFoTHQ1ZUhwYVRwUWV4b29jbEdDMHk5ZGt0djd6OHJNZEVUdDJzWDlqZndzdjZNL3lMNEc5SDFrTzhPYUNZWWZGT2tkWXBpUjh3ekRaN1RJWXp6UEFib0w1T2FmbnRGZW5oNGVwaU5YUFpHYjJVVVRabVZreU9Velp5UWpKVVU0TzI1MW1wdWJhKzNldCs5OGZFSkNDSm40L2Z6K3pnUWkxVE5KSTd6VVZpUXB5WEJFY1JpZnRreFRYOW05YngrdWFyUW5iNEdtVmNRYXJVZlZ3czgra3hadDIwcmJqaDJsNTRBQk1qNDhYRWFNSDIvdk8zVG8yYUNSSTkvRGQvN3E5Z0gvYnROMitSNWY4S2dsMXN1TThWZDJSWTJndTd1Ym0wMG5Ub0VpRTlObWsvYmM3SDArZTdhTURRNlcxcTFhU2RuU3BXWDNuajNHK3NqSUpoZFRVbll5R0s0TCtDMjhvR2pPdDk0cWJObkJoczNZbFJmazZSbUt5KzA4LzQzQ04zL0hHcWNzdTZWamRxWDk1cFFvQTI2SjZXS3plZUl6RzQ1SFlBeExsQ29sRmJucHExT3JsclJ1MlZJQ3UzU1JoWFBtR0x4QVRibzF3c0pIUEtqU3hUQ01OWVpwN0VmRHhvZ2w5Y0h6TjFDUHZMZDVGZ241VVdLVExwVDNBYXAwQkw5SmpsRTcyVEtzaG9SbHdTMHhiUzR1N3E3Y2hqMEtvZzIwV296OEN1WHI0eVBwNmVtNi9aU3dXd010UUVTSktvY2VoMEZpaEJpaWJaeUExSTh0aC9WbjBQSUcrTTVuQlVINlBsRERzSXpKYU9CWTJxOEYxTXNodUcvNUcvM3k5bW5Vb3dXOVZpYTRMdlJodXJ1NHVzb2pJZm8ya25WSXVkZHRoUnJBYTVvdUJHb3l5Ym1HR084UkhvVFVYcUNaT0VRdjREZlF6dDRiaUNWdkJtN3RuOUM4dnM2eVlyMXJHSVlhM2hjbzg2dnZmZVFWVk02eGNGaDIwUmZIZk8yWWhtRzRjWHlJbzRpOURpWXEyWGdkZVJkWWZlZk5PM1k0T0RwMkZYUm1OOHFWUlpNSE14Y3V4bzBObHQxNm4vd1ZJTytIRUpKNVJPU0MyR1VwWlVNaE94NjBwTDVxZGcxSzZlNGdLTFNVWWw0ZTdCUjkvYzdueHBrMDdpUTZKeXRMN0VWSXRpNXNOamR6MW5VTmxvek1USW5iczhjeExqUTBNU2twYVZRaHB1aEcyWGZSNVA5Z2dydnh4d2VRL2pzb3FFUkI5bWlJamdVdnMyQjZGMTJtb0pWdksxZVcrbnFqcWtUcnJyejFXRmZPRFdQb0pEbWQ2OG1pSUR1ZGE4KzlDUWtTdld1WDRDdEx3amZmV0R0aVlwTDdEeG15TmVuczJmNk1UdS9OQ1Fva05URnFmNkprRHRxazl3czZTWktGa25qSURvZm9BNmFZUFNDckE3WGRRV0dsT292OU9PUFFOMGk5OWJ0Vlh6WGFYWWxXelZLaUZicWxIeVRoZEN3T3ZKb2N0RGFUcS9tTDU4N0oxOXhCNzlpNVUzYkd4a3JjN3QyTzhJaUluYitjUC84aEk5T3YrQVFGRWh1a3ZNN2txcUhSbTZueE5jaW5TYVFMS3RzdHV6WE5FaXNKc2tkUTZXMVFHTExMWS9CYU1JN1NuUDM2d1VGdkVtbml1cGlRNEdiYWJNNlVrMnhlaDFQUG41ZXJoRnlrU3pia09DREpXYUNBUDdUcHZMdlFvMEhiU0w5eVJkSXVYSkJVa01MRnZZMGpxb1cvdjd6L3pqdE92UGZXVzZhZnI2OEhIMlBQRmJDTG04V2U0T2hyeE9RWXV1TkxNdFVRRWR5M3JJRG95Y0JobU1ab1d0SFBXUlVKN3lVVldmQk9sbGl0bVBzUmNZajYwL2x1RTAxRHBOZzFqSkxkc29SQjh5WnNpUktVempHU0NpbHBrSzdFSzFHYXA2L0xtV3o5elBSMHlRc2xORU1KNVN2SXpUck9ldFRYdE5ibGp0bTVBUFFwRmNxWGx5ZDlmWjN3OGZZMm52SHplL1VsUHorWGU4M290dWROME9hcVRPNTc4ZytCKzlWbXF0NFFoM3dDWWFHa3NpQTcyTFNaWTRpM0FPcEpFT1FUZFVGclFuSlhRd3pkalZtTVpSRWxUb0I4WW1McGR5NVl0T2hZMkxScDZST21UblZzMmJFajY2Zmp4KzJwYlBGc0RHUVdoTjRpRUkxVXd2TVNxQ1RlaEdyc1ZjbzRkME5xcXVnUnBEZHpxRnUrVHUrVXdNWE05SERUL3dTNDA5TTc1cFZrcXpabGd0NXMxUmhLNkFVVXdXOFdoemprYzh0aGZVUkxGeUN1R3paZ1BHU09GSnY4bVR3bHZUNWhhL0tHOGl5TU1lZ1g5VFRxVENGL1BjaW56YVRGdE52dDRTdldyT205WU9uU0FOQnZ5YXBWMCtjdFhyeGgycXhaUDNMdmtCWTZaWXA5MDdadE9VZVBIWE9rUUw1Nko3a3NnSjYzZWFHRXFpZkJ3TFRkUW1IUHQ5L2FqLy84ODRMRU0yY0tvNUZWSWJnbTJwY0VNUWwwV05DUDFCUzlwMlJSNGd1SUd3Q0pIN05yWEFrL3dFY2VoWlpQZ054d3dsRHlBbmpteDBrUVIxbTlIdFdQd3ZydkhWVFBMMlpxYXVyUjgrZlBiK1Z0YkJsZkwrYkV4TVdGZjdGMjdmQlY2OVlGcmxpOSt0MjFrWkhkVnF4ZEcvckovUGtyeDRhRi9lM0RRWU15cDgyZW5aMlFtR2puUHNLeURDTi9pL2RJNVhBK1grSzI3dGlKRTQ3NHZYdnRpMWFzeUdDaDF4ODRkR2h1WW1KaVlZaE90dXpXRGlhb1g3Ri9wRnM3ZUpDaUN4ZmpjRGpDNktPWElVWTRpQlpEenRDSkNjSDYxam1lWjRFT3UyTWtlWkhncmpiQzVHRmUwWlg4SlRzNysrOThJb3JQeXNxS1BIZnUzTEpkc2JFek4yN2VIQno1NVpmdmI0bUthcmQreTVhK00rZk1tVHMwSk9UQS93UUdadllOQ2tyZkdCV1ZkZlRrU2JuQ1VaT09BYjNHRit3TU5QOEM1L2FSNDhjZEc5a1Y3SkNzQWNPSG53NmRQSG43akxselo2emR0S2tmMnR6aHU0TUhnMDZkT25VeTcwQUtFRDlObVRsZ0NiZ0lIcGFvZ1k2SDhPbGdESXM3RVBSazV3NFNoK2psVkN3ZDZ4MUhCdUZkNVhhaTcxUlF0ZXhpWm1ibUNhNHRFM056YzdmemlYOHg1SWZFeHNlL0U3ZDc5OHRSMGRFQnN5QnVXRWhJWk05Ky9mWUg5dXQzR0J3SjZOUG5oNzZEQis4SW1UQmgzdWZMbGdYRnhjZTNqVXRJYUwxMSsvWVB2bGkzYnZ6S05Xc1diTmk4T2VyWXNXTjZrVjVZamRUeXZ6QmdKVm5qUkIrcWFEKzZ1RC9SQzNmOW9tTldyU2Q1YnlrSTBiZTNZcEdoenZpNXRMUzB3ems1T2Q5eS9Dejc0ZENoUWJzVEV0ckd4TWMvSHgwVFUvMnI2T2hxMGJHeGRYYkZ4YlVnTDNEUHZuM2hSMCtjMko2Y25Qd0RDNll2Sk1rMzJ0SDJpUDVyeS84Q0FBRC8vL0Y4NUo4QUFBQUdTVVJCVkFNQWkwVVBya3lkaDE4QUFBQUFTVVZPUks1Q1lJST0iIHg9IjAiIHk9IjAiIHdpZHRoPSI5MCIgaGVpZ2h0PSIzNCIvPgo8L3N2Zz4=" width="40" height="15" style="image-rendering:pixelated;vertical-align:middle"/></button>
          <div class="edb-sep"></div>
          <button id="edb-undo"   class="edb-tool" title="Deshacer">↩</button>
          <button id="edb-redo"   class="edb-tool" title="Rehacer">↪</button>
          <button id="edb-zoom"   class="edb-tool" title="Zoom">🔍</button>
          <div class="edb-sep"></div>
          <button id="edb-ok"     class="edb-ok" title="Finalizar">✓</button>
        </div>
      </div>
      <!-- Popover orientación cursor offset (position:fixed igual que edb-size-pop) -->
      <div id="edb-offset-pop" style="display:none;position:fixed;z-index:1200;
        background:rgba(20,20,20,0.93);border:1px solid rgba(255,255,255,.15);
        border-radius:12px;padding:8px 10px;box-shadow:0 4px 18px rgba(0,0,0,.6);
        flex-direction:row;align-items:flex-start;gap:6px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          <span style="font-size:0.55rem;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:.03em">Zurda</span>
          <button id="edb-offset-pop-l" style="border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:5px 7px;background:transparent;cursor:pointer;" title="Inclinado izquierda">
            <svg width="22" height="28" viewBox="0 0 22 28"><line x1="15" y1="4" x2="7" y2="24" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          <span style="font-size:0.55rem;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:.03em">Diestra</span>
          <button id="edb-offset-pop-r" style="border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:5px 7px;background:transparent;cursor:pointer;" title="Inclinado derecha">
            <svg width="22" height="28" viewBox="0 0 22 28"><line x1="7" y1="4" x2="15" y2="24" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <!-- Popover paleta (hijo de editorShell para z-index correcto) -->
      <div id="edb-palette-pop"></div>
      <!-- Popup sub-herramienta: selección lápiz/tinta y capas borrador -->
      <div id="edb-brush-pop"></div>
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
          <button id="esb-curve"    class="edb-tool" title="Convertir vértice a curva" style="font-size:.65rem;font-weight:900">NODOS</button>
          <div class="edb-sep"></div>
          <button id="esb-undo"     class="edb-tool" title="Deshacer">↩</button>
          <button id="esb-redo"     class="edb-tool" title="Rehacer">↪</button>
          <div id="esb-fuse-sep" class="edb-sep" style="display:none"></div>
          <button id="esb-fuse" class="edb-tool" title="Fusionar objetos cerrados en uno solo con huecos" style="display:none;padding:0;border:none;background:white;border-radius:50%;overflow:hidden;line-height:0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" width="20" height="20"><circle cx="13" cy="13" r="13" fill="white"/><path d="M13,1 A12,12,0,0,0,13,25 Z" fill="black"/><circle cx="13" cy="7" r="6" fill="black"/><circle cx="13" cy="19" r="6" fill="white"/><circle cx="13" cy="13" r="12" fill="none" stroke="#444" stroke-width="1"/><circle cx="13" cy="7" r="3" fill="white"/><circle cx="13" cy="19" r="3" fill="black"/></svg></button>
          <div class="edb-sep"></div>
          <button id="esb-ok"       class="edb-ok"   title="Finalizar">✓</button>
        </div>
      </div>

      <!-- ── BARRA RECORRIDO DE ANIMACIÓN ── -->
      <div id="edMotionBar" style="display:none;position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:200;align-items:center;gap:8px;background:rgba(20,20,20,0.92);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:8px 14px;box-shadow:0 4px 20px rgba(0,0,0,.55);color:#fff;font-size:.82rem;font-weight:700;white-space:nowrap;-webkit-tap-highlight-color:transparent;flex-wrap:wrap;max-width:calc(100vw - 24px);user-select:none">
        <span id="mpb-drag" title="Mover barra" style="cursor:grab;opacity:0.55;font-size:.95rem;padding:0 2px;touch-action:none;line-height:1">⠿⠿</span>
        <span style="font-size:1rem">🛤️</span>
        <span style="color:rgba(255,255,255,0.3)">│</span>
        <span style="font-size:.78rem;opacity:.8">⏱</span>
        <!-- Velocidad (px/s) — solo capas no animadas -->
        <span id="mpb-speed-wrap" style="display:inline-flex;align-items:center;gap:4px">
          <input type="range" id="mpb-speed" min="10" max="1000" step="10" value="100" style="width:80px;accent-color:#FFE135;cursor:pointer;vertical-align:middle">
          <span id="mpb-speed-val" style="min-width:64px;font-size:.78rem">100px/s</span>
        </span>
        <!-- Ciclos — capas animadas (GIF/APNG): slider con burbuja flotante -->
        <span id="mpb-cycles-wrap" style="display:none;align-items:center;gap:6px;min-width:130px">
          <span style="font-size:.78rem;opacity:.8;white-space:nowrap">ciclos</span>
          <div class="ed-slider-wrap inv" style="flex:1;min-width:80px">
            <input type="range" id="mpb-cycles" min="1"   max="20" step="1"   value="1"
              data-suffix="×"
              style="flex:1;accent-color:#FFE135;cursor:pointer;width:100%">
            <span class="ed-slider-bubble"></span>
          </div>
          <span id="mpb-cycles-dur" style="font-size:.75rem;color:#FFE135;min-width:36px;white-space:nowrap"></span>
        </span>
        <span style="color:rgba(255,255,255,0.3)">│</span>
        <button id="mpb-play" style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);border-radius:7px;padding:5px 13px;color:#fff;cursor:pointer;font-size:1rem;font-weight:900" title="Preview">▶</button>
        <span style="color:rgba(255,255,255,0.3)">│</span>
        <button id="mpb-undo" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:7px;padding:5px 11px;color:#fff;cursor:pointer;font-size:.9rem;font-weight:900" title="Borrar recorrido y redibujar">🗑</button>
        <span style="color:rgba(255,255,255,0.3)">│</span>
        <button id="mpb-behaviour" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:7px;padding:5px 8px;color:#fff;cursor:pointer;font-size:1.35rem;line-height:1" title="Comportamiento del recorrido">⚙️</button>
        <span style="color:rgba(255,255,255,0.3)">│</span>
        <button id="mpb-ok" style="background:#16a34a;border:none;border-radius:7px;padding:5px 13px;color:#fff;cursor:pointer;font-weight:900;font-size:.88rem">✓ OK</button>
        <button id="mpb-cancel" style="background:rgba(220,38,38,0.25);border:1px solid rgba(220,38,38,0.4);border-radius:7px;padding:5px 11px;color:#ff9999;cursor:pointer;font-size:.88rem;font-weight:900" title="Cancelar">✕</button>
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

    <!-- MODAL COMPORTAMIENTO DEL RECORRIDO -->
    <div id="edMpBehaviourModal" class="ed-fulloverlay" style="z-index:2200">
      <div class="ed-fulloverlay-box" style="max-width:480px">
        <div class="ed-fulloverlay-header">
          <h2 class="ed-fulloverlay-title">⚙ Comportamiento</h2>
          <button class="ed-fulloverlay-close" id="mpbeh-close">✕</button>
        </div>
        <div style="padding:14px 16px 6px;overflow-y:auto;flex:1">

          <!-- Sección: Al final del recorrido -->
          <div class="mpbeh-section">
            <button class="mpbeh-header" id="mpbeh-end-toggle">
              <span class="mpbeh-header-label">Al final del recorrido…</span>
              <span class="mpbeh-arrow">▾</span>
            </button>
            <div class="mpbeh-options" id="mpbeh-end-options">
              <button class="mpbeh-opt" data-mpbeh-end="restart" id="mpbeh-end-restart">🔄 Reiniciar</button>
              <button class="mpbeh-opt" data-mpbeh-end="stop"    id="mpbeh-end-stop">⏹ Detener</button>
              <button class="mpbeh-opt" data-mpbeh-end="rewind"  id="mpbeh-end-rewind">⏮ Rebobinar</button>
            </div>
          </div>

          <!-- Sección: Aceleraciones -->
          <div class="mpbeh-section" style="margin-top:10px">
            <button class="mpbeh-header" id="mpbeh-accel-toggle">
              <span class="mpbeh-header-label">Aceleraciones</span>
              <span class="mpbeh-arrow">▾</span>
            </button>
            <div class="mpbeh-options" id="mpbeh-accel-options">
              <button class="mpbeh-opt" data-mpbeh-accel="none"   id="mpbeh-accel-none">▷ Sin aceleración</button>
              <button class="mpbeh-opt" data-mpbeh-accel="start"  id="mpbeh-accel-start">⏩ Al inicio</button>
              <button class="mpbeh-opt" data-mpbeh-accel="middle" id="mpbeh-accel-middle">↔ Al medio</button>
              <button class="mpbeh-opt" data-mpbeh-accel="end"    id="mpbeh-accel-end">⏪ Al final</button>
            </div>
          </div>

          <!-- Sección: Orientación del objeto -->
          <div class="mpbeh-section" style="margin-top:10px">
            <button class="mpbeh-header" id="mpbeh-orient-toggle">
              <span class="mpbeh-header-label">Orientación del objeto</span>
              <span class="mpbeh-arrow">▾</span>
            </button>
            <div class="mpbeh-options" id="mpbeh-orient-options">
              <button class="mpbeh-opt" data-mpbeh-orient="fixed" id="mpbeh-orient-fixed">🧭 Fija</button>
              <button class="mpbeh-opt" data-mpbeh-orient="path"  id="mpbeh-orient-path">🔄 Girar según trayectoria</button>
            </div>
          </div>

        </div>
        <div class="ed-fulloverlay-actions">
          <button class="ed-btn-sec" id="mpbeh-cancel">Cancelar</button>
          <button class="ed-btn-pri" id="mpbeh-ok">Guardar ✓</button>
        </div>
      </div>
    </div>

    <!-- MODAL DATOS DEL PROYECTO -->
    <div id="edProjectModal">
      <div class="ed-modal-sheet">
        <div class="ed-modal-handle"></div>
        <div class="ed-modal-header">
          <h3 class="ed-modal-title">Datos del proyecto</h3>
        </div>
        <div class="ed-modal-body">
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
    </div>

    <!-- Inputs ocultos -->
    <input type="file" id="edFileGallery" accept="image/*" style="display:none">
    <!-- Modal de atajos de teclado -->
    <div id="edShortcutsModal">
      <div class="sc-box">
        <div class="sc-header">
          <span class="sc-title">Atajos de teclado</span>
          <button class="sc-close" id="edShortcutsClose">✕</button>
        </div>
        <div class="sc-body">

          <div class="sc-section">Historial</div>
          <div class="sc-row"><span class="sc-desc">Deshacer</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Z</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Rehacer</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Y</kbd> <small style="opacity:.6">o</small> <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Z</kbd></span></div>

          <div class="sc-section">Selección y objetos</div>
          <div class="sc-row"><span class="sc-desc">Mover objeto 1 px</span><span class="sc-keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Mover objeto 10 px</span><span class="sc-keys"><kbd>Shift</kbd><kbd>↑↓←→</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Duplicar objeto seleccionado</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>D</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Eliminar objeto seleccionado</span><span class="sc-keys"><kbd>Supr</kbd><kbd>/</kbd><kbd>Retroceso</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Cancelar selección / cerrar panel</span><span class="sc-keys"><kbd>Esc</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Confirmar / cerrar panel (OK)</span><span class="sc-keys"><kbd>Enter</kbd></span></div>

          <div class="sc-section">Formas (rectángulo / elipse)</div>
          <div class="sc-row"><span class="sc-desc">Forzar cuadrado / círculo al arrastrar</span><span class="sc-keys"><kbd>Ctrl</kbd> + arrastrar</span></div>

          <div class="sc-section">Orden de capas</div>
          <div class="sc-row"><span class="sc-desc">Subir capa un nivel</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>]</kbd> <small style="opacity:.6">o</small> <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>↑</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Bajar capa un nivel</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>[</kbd> <small style="opacity:.6">o</small> <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>↓</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Traer al frente</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>]</kbd> <small style="opacity:.6">o</small> <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Alt</kbd><kbd>↑</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Enviar al fondo</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>[</kbd> <small style="opacity:.6">o</small> <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Alt</kbd><kbd>↓</kbd></span></div>

          <div class="sc-section">Zoom y navegación</div>
          <div class="sc-row"><span class="sc-desc">Zoom acercar</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Rueda ↑</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Zoom alejar</span><span class="sc-keys"><kbd>Ctrl</kbd><kbd>Rueda ↓</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Desplazar canvas</span><span class="sc-keys"><kbd>Rueda</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Pasar de hoja (sin nada seleccionado)</span><span class="sc-keys"><kbd>←</kbd><kbd>→</kbd></span></div>

          <div class="sc-section">Editor de animaciones (GCP)</div>
          <div class="sc-row"><span class="sc-desc">Mover objeto seleccionado 1 px</span><span class="sc-keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Mover objeto seleccionado 10 px</span><span class="sc-keys"><kbd>Shift</kbd><kbd>↑↓←→</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Navegar entre frames (sin selección)</span><span class="sc-keys"><kbd>←</kbd><kbd>→</kbd></span></div>

          <div class="sc-section">Editor de textos</div>
          <div class="sc-row"><span class="sc-desc">Pasar de página (cursor fuera del texto)</span><span class="sc-keys"><kbd>←</kbd><kbd>→</kbd></span></div>
          <div class="sc-row"><span class="sc-desc">Desplazar el texto</span><span class="sc-keys"><kbd>Rueda</kbd> <small style="opacity:.6">o arrastrar con el dedo</small></span></div>

        </div>
      </div>
    </div>

    <!-- Modal de tutorial Crear animaciones -->
    <div id="edAnimTutorialModal">
      <div class="sc-box">
        <div class="sc-header">
          <span class="sc-title">Crear animaciones</span>
          <button class="sc-close" id="edAnimTutorialClose">✕</button>
        </div>
        <div class="sc-body">
          <p style="text-align:center;color:var(--gray-500);font-style:italic;padding:24px 0;">Próximamente...</p>
        </div>
      </div>
    </div>

    <!-- Modal de ayuda de referencia (menú Ayuda): mismo contenido que las
         ventanas de ayuda emergentes, con el estilo común de "Atajos de
         teclado" — accesible siempre, aunque el usuario haya marcado
         "No volver a mostrar" en la ventana emergente correspondiente. -->
    <div id="edHelpRefModal">
      <div class="sc-box">
        <div class="sc-header">
          <span class="sc-title" id="edHelpRefTitle">Ayuda</span>
          <button class="sc-close" id="edHelpRefClose">✕</button>
        </div>
        <div class="sc-body" id="edHelpRefBody"></div>
      </div>
    </div>

    <input type="file" id="edFileGif" accept=".gif,image/gif" style="display:none">
    <input type="file" id="edFileAnim" accept="image/*" style="display:none">
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
        <div id="gcpTitlePill" aria-hidden="true"></div>
        <span id="gcpProjectTitle">Gif 1</span>
        <span class="ed-top-spacer"></span>
        <div class="ed-top-pagnav" id="gcpFrameNav" style="display:none">
          <div id="gcpFramePill" aria-hidden="true"></div>
          <button class="ed-top-pagebn" id="gcpFramePrev" title="Fotograma clave anterior">&#9664;</button>
          <span id="gcpFrameNum">1</span>
          <button class="ed-top-pagebn" id="gcpFrameNext" title="Fotograma clave siguiente">&#9654;</button>
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
          <!-- Botón de diagnóstico oculto a petición de Alberto (no borrar):
               para volver a mostrarlo, descomentar la línea siguiente.
          <button class="ed-undo-redo-btn" id="gcpSbDiagBtn" title="Diagnóstico scrollbars">🩺</button>
          -->
          <div class="ed-menu-sep"></div>
          <!-- Matriz (antes "Frames") -->
          <button class="ed-menu-btn" id="gcpFramesToggleBtn">Matriz ▾</button>
          <div class="ed-menu-sep"></div>
          <!-- Comportamiento -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-gcpmenu="comportamiento">Comportamiento</button>
            <div class="ed-dropdown" id="gdd-comportamiento" style="min-width:210px;padding:6px 0">
              <!-- 3 botones de modo -->
              <div style="display:flex;gap:3px;padding:8px 10px 4px">
                <button id="gcpBtnVel"   class="gcp-behav-btn active" style="flex:1">Vel.</button>
                <button id="gcpBtnRep"   class="gcp-behav-btn" style="flex:1">Rep.</button>
                <button id="gcpBtnRei"   class="gcp-behav-btn" style="flex:1">Reinicio</button>
                <button id="gcpBtnTimer" class="gcp-behav-btn" style="flex:1">&#x23F1;</button>
              </div>
              <!-- Texto explicativo timer (visible solo en modo timer) -->
              <div id="gcpTimerLabel" style="display:none;padding:0 14px 2px;font-family:var(--font-body);font-size:.73rem;color:var(--gray-500);text-align:center;line-height:1.3">Tiempo espera para inicio animación</div>
              <!-- Slider único adaptable -->
              <div style="padding:6px 14px 4px">
                <input type="range" id="gcpBehavSlider" min="1" max="24" value="10" step="1"
                  style="width:100%;accent-color:var(--black);cursor:pointer">
              </div>
              <!-- Sección invisibilidad (visible solo en modo timer) -->
              <div id="gcpInvisSection" style="display:none;padding:5px 14px 7px;border-top:1px solid var(--gray-200)">
                <div style="font-family:var(--font-body);font-size:.73rem;font-weight:700;color:var(--gray-500);margin-bottom:5px;text-align:center;letter-spacing:.03em">Invisibilidad</div>
                <label style="display:flex;align-items:center;gap:7px;font-size:.8rem;font-family:var(--font-body);cursor:pointer;padding:2px 0">
                  <input type="checkbox" id="gcpInvisBeforeStart" style="cursor:pointer;accent-color:var(--black)"> Antes inicio
                </label>
                <label style="display:flex;align-items:center;gap:7px;font-size:.8rem;font-family:var(--font-body);cursor:pointer;padding:2px 0;margin-top:2px">
                  <input type="checkbox" id="gcpInvisAtEnd" style="cursor:pointer;accent-color:var(--black)"> Al final
                </label>
              </div>
              <!-- Resumen editable (teclado PC/Android además del slider) -->
              <div id="gcpBehaviourSummary" style="padding:2px 14px 8px;font-family:var(--font-body);font-size:.78rem;font-weight:700;color:var(--gray-500);text-align:center;display:flex;align-items:baseline;justify-content:center;flex-wrap:wrap;gap:2px 5px;line-height:1.7">
                <span><input id="gcpSumVel" type="text" inputmode="numeric" maxlength="2" value="10" autocomplete="off" title="Velocidad (fps)" style="width:20px;text-align:right;border:none;border-bottom:1px dashed var(--gray-300);background:transparent;color:inherit;font:inherit;font-weight:inherit;padding:0 1px"> fps</span>
                <span>·</span>
                <span><input id="gcpSumRep" type="text" inputmode="numeric" maxlength="3" value="∞" autocomplete="off" title="Repeticiones (0 = ∞)" style="width:24px;text-align:center;border:none;border-bottom:1px dashed var(--gray-300);background:transparent;color:inherit;font:inherit;font-weight:inherit;padding:0 1px"></span>
                <span id="gcpSumReiWrap" style="display:none">· R:<input id="gcpSumRei" type="text" inputmode="numeric" maxlength="2" value="0" autocomplete="off" title="Reinicio (segundos)" style="width:18px;text-align:right;border:none;border-bottom:1px dashed var(--gray-300);background:transparent;color:inherit;font:inherit;font-weight:inherit;padding:0 1px">s</span>
                <span id="gcpSumTimerWrap" style="display:none">· T:<input id="gcpSumTimer" type="text" inputmode="decimal" maxlength="4" value="0" autocomplete="off" title="Tiempo espera inicio (segundos)" style="width:24px;text-align:right;border:none;border-bottom:1px dashed var(--gray-300);background:transparent;color:inherit;font:inherit;font-weight:inherit;padding:0 1px">s</span>
              </div>
            </div>
            <!-- Burbuja flotante de valor para sliders de comportamiento -->
            <div id="gcpSliderBubble" style="display:none;position:fixed;z-index:10000;background:var(--black);border-radius:8px;padding:5px 10px;color:var(--white);font-size:.85rem;font-weight:900;pointer-events:none;text-align:center;transform:translateX(-50%) translateY(-100%);margin-top:-8px;font-family:var(--font-body)"></div>
          </div>
          <div class="ed-menu-sep"></div>
          <!-- Guardar -->
          <div class="ed-menu-item" style="position:relative">
            <button class="ed-menu-btn" data-gcpmenu="guardar" style="font-weight:700">Guardar ▾</button>
            <div class="ed-dropdown" id="gdd-guardar" style="min-width:220px">
              <button class="ed-dropdown-item" id="gcpSaveAppBtn"><span class="dd-icon">📥</span>Insertar en el canvas</button>
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
              <label class="ed-dropdown-item" id="gcp-grid-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
                <input type="checkbox" id="gcp-grid-check" style="width:16px;height:16px;accent-color:#1a8cff;cursor:pointer;flex-shrink:0">
                <span>Cuadrícula</span>
              </label>
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
              <button class="ed-dropdown-item" id="gcp-dd-shortcuts">Atajos de teclado</button>
              <button class="ed-dropdown-item" id="gcp-dd-anim-tutorial">Crear animaciones</button>
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

    <!-- Editor de textos: mismo diseño que edShell/gcpShell, cabecera violeta.
         Editor de texto enriquecido (Trix, MIT, https://trix-editor.org/) — ver
         créditos al inicio de este archivo. Al "Aplicar al lienzo" el contenido
         se pagina y se añade como hojas nuevas al final de la obra. -->
    <div id="tdShell">
      <!-- Sonda invisible: su alto CSS ES env(keyboard-inset-height), que el
           navegador mantiene actualizado sin depender de ningún evento JS —
           segunda señal independiente para _tdReadKeyboardH(), ver
           editor-textdoc.js. No ocupa espacio (visibility:hidden). -->
      <div id="tdKbProbe" aria-hidden="true" style="position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;height:env(keyboard-inset-height, 0px);"></div>
      <div id="tdTopbar">
        <div id="tdTitlePill" aria-hidden="true"></div>
        <span id="tdProjectTitle">Editor de textos</span>
        <span class="ed-top-spacer"></span>
        <div class="ed-top-pagnav">
          <div id="tdPageNavPill" aria-hidden="true"></div>
          <button class="ed-top-pagebn" id="tdPagePrev" title="Página anterior">&#9664;</button>
          <span id="tdPageNum">1</span>
          <button class="ed-top-pagebn" id="tdPageNext" title="Página siguiente">&#9654;</button>
        </div>
        <button class="ed-top-action" id="tdApplyBtn" title="Aplicar al lienzo">💾</button>
        <!-- Botón de diagnóstico oculto a petición de Alberto (no borrar):
             para volver a mostrarlo, descomentar la línea siguiente.
        <button class="ed-top-action" id="tdDiagBtn" title="Diagnóstico acentos/IME">🩺</button>
        -->
        <button id="tdCloseBtn" title="Volver al editor">✕</button>
      </div>
      <div id="tdMenuBar">
        <div id="tdMenuScroll">
          <trix-toolbar id="tdToolbar">
            <button type="button" class="ed-menu-btn td-fmt-btn" data-trix-action="undo" title="Deshacer">↩</button>
            <button type="button" class="ed-menu-btn td-fmt-btn" data-trix-action="redo" title="Rehacer">↪</button>
            <div class="ed-menu-sep"></div>
            <button type="button" class="ed-menu-btn td-fmt-btn" data-trix-attribute="bold" title="Negrita"><b>N</b></button>
            <button type="button" class="ed-menu-btn td-fmt-btn" data-trix-attribute="italic" title="Cursiva"><i>K</i></button>
            <button type="button" class="ed-menu-btn td-fmt-btn" data-trix-attribute="strike" title="Tachado"><s>S</s></button>
            <div class="ed-menu-sep"></div>
            <button type="button" class="ed-menu-btn td-fmt-btn" data-trix-attribute="heading1" title="Título">Título</button>
            <button type="button" class="ed-menu-btn td-fmt-btn" data-trix-attribute="quote" title="Cita">&quot; Cita</button>
            <div class="ed-menu-sep"></div>
            <button type="button" class="ed-menu-btn td-fmt-btn" data-trix-attribute="bullet" title="Lista de viñetas">• Lista</button>
            <button type="button" class="ed-menu-btn td-fmt-btn" data-trix-attribute="number" title="Lista numerada">1. Lista</button>
          </trix-toolbar>
          <div class="ed-menu-sep"></div>
          <div class="ed-menu-item" style="position:relative">
            <button type="button" class="ed-menu-btn td-fmt-btn" data-menu="tdFontFamily" title="Tipo de letra de la selección">Fuente ▾</button>
            <div class="ed-dropdown" id="dd-tdFontFamily">
              <button class="ed-dropdown-item" data-value="Lora">Lora (serif)</button>
              <button class="ed-dropdown-item" data-value="Patrick Hand">Patrick Hand</button>
              <button class="ed-dropdown-item" data-value="Bangers">Bangers</button>
              <button class="ed-dropdown-item" data-value="Permanent Marker">Permanent Marker</button>
              <button class="ed-dropdown-item" data-value="Bebas Neue">Bebas Neue</button>
              <button class="ed-dropdown-item" data-value="Oswald">Oswald</button>
              <button class="ed-dropdown-item" data-value="Comic Neue">Comic Neue</button>
              <button class="ed-dropdown-item" data-value="Press Start 2P">Press Start 2P (8-bit)</button>
              <button class="ed-dropdown-item" data-value="Arial">Arial</button>
              <button class="ed-dropdown-item" data-value="Verdana">Verdana</button>
            </div>
          </div>
          <div class="ed-menu-sep"></div>
          <div class="ed-menu-item" style="position:relative">
            <button type="button" class="ed-menu-btn td-fmt-btn" data-menu="tdFontSize" title="Tamaño de letra de la selección">Tamaño ▾</button>
            <div class="ed-dropdown" id="dd-tdFontSize">
              <button class="ed-dropdown-item" data-value="16px">Pequeño</button>
              <button class="ed-dropdown-item" data-value="22px">Normal</button>
              <button class="ed-dropdown-item" data-value="28px">Grande</button>
              <button class="ed-dropdown-item" data-value="36px">Muy grande</button>
            </div>
          </div>
          <div class="ed-menu-sep"></div>
          <div class="ed-menu-item" style="position:relative">
            <button type="button" class="ed-menu-btn td-fmt-btn" data-menu="tdLineHeight" title="Interlineado de todo el texto">Interlineado ▾</button>
            <div class="ed-dropdown" id="dd-tdLineHeight">
              <button class="ed-dropdown-item" data-value="lineCompact">Compacto</button>
              <button class="ed-dropdown-item" data-value="lineNormal">Normal</button>
              <button class="ed-dropdown-item" data-value="lineAmplio">Amplio</button>
            </div>
          </div>
          <div class="ed-menu-sep"></div>
          <div class="ed-menu-item" style="position:relative">
            <button type="button" class="ed-menu-btn td-fmt-btn" data-menu="tdAlign" title="Alineación del párrafo">Alineación ▾</button>
            <div class="ed-dropdown" id="dd-tdAlign">
              <button class="ed-dropdown-item" data-value="alignLeft">A la izquierda</button>
              <button class="ed-dropdown-item" data-value="alignCenter">Centrado</button>
              <button class="ed-dropdown-item" data-value="alignRight">A la derecha</button>
              <button class="ed-dropdown-item" data-value="alignJustify">Justificado</button>
            </div>
          </div>
        </div>
      </div>
      <div id="tdPageArea">
        <div id="tdPage" class="td-page">
          <div id="tdSelTopSpacer" aria-hidden="true"></div>
          <input type="hidden" id="tdHiddenInput">
          <trix-editor id="tdEditor" toolbar="tdToolbar" input="tdHiddenInput" class="td-editor" placeholder="Escribe aquí el texto de tu obra…" virtualkeyboardpolicy="manual"></trix-editor>
          <div id="tdPageBreaks" aria-hidden="true"></div>
        </div>
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
      <div id="readerTitlePill" aria-hidden="true"></div>
      <div class="home-logo-area" style="flex-direction:row;align-items:center;gap:6px">
        <a href="#home" onclick="Router.go('home');return false;" class="logo-link logo-img-link">
          <img src="logo.svg" alt="ComiXou" class="logo-img" style="height:22px;width:auto;">
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
