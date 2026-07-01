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
 */
/* ============================================================
   auth-pages.js — Login y Registro (SPA)
   AuthView_init() se llama cada vez que el router renderiza
   la vista login o register — busca elementos frescos del DOM.
   ============================================================ */

// Franja blanca tras el título de login/registro — mismo criterio que en el
// editor: desde el borde izquierdo de la ventana hasta el final del texto,
// semicírculo a la derecha.
function _authFitTitlePill(){
  document.querySelectorAll('.auth-card-header').forEach(header => {
    const title = header.querySelector('.auth-title');
    if (!title) return;
    let pill = header.querySelector(':scope > .win-title-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'win-title-pill';
      pill.setAttribute('aria-hidden', 'true');
      header.insertBefore(pill, header.firstChild);
    }
    const headerRect = header.getBoundingClientRect();
    const titleRect  = title.getBoundingClientRect();
    if (titleRect.width <= 0) { pill.style.width = '0px'; return; }
    const vPad = titleRect.height * 0.067;
    pill.style.top    = (titleRect.top - headerRect.top - vPad) + 'px';
    pill.style.height = (titleRect.height + vPad * 2) + 'px';
    pill.style.width  = Math.max(0, titleRect.right - headerRect.left + 4) + 'px';
  });
}
window.removeEventListener('resize', _authFitTitlePill); // evita duplicados si AuthView_init se llama varias veces
window.addEventListener('resize', _authFitTitlePill);

function AuthView_init() {
  _authFitTitlePill();

  // ── Cerrar al clicar fuera de la tarjeta ──
  const authMain = document.querySelector('.auth-main');
  if (authMain) {
    authMain.addEventListener('pointerdown', e => {
      // Si el click/tap es directamente en el overlay (no en la tarjeta), volver atrás
      if (e.target === authMain) Router.go('home');
    });
  }

  // ── Mostrar/ocultar contraseña ──
  const passToggle = document.getElementById('passToggle');
  if (passToggle) {
    passToggle.addEventListener('click', () => {
      const passEl = document.getElementById('loginPass') || document.getElementById('regPass');
      if (!passEl) return;
      const hide = passEl.type === 'password';
      document.querySelectorAll('input[id*="Pass"], input[id*="pass"]')
        .forEach(inp => inp.type = hide ? 'text' : 'password');
      passToggle.textContent = hide ? '🙈' : '👁';
    });
  }

  // ── LOGIN ──
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    // Usar click en el botón submit en vez de submit del form
    // (más fiable en SPA con HTML inyectado)
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    
    async function doLogin(e) {
      if (e) e.preventDefault();
      clearErrors();

      const email = document.getElementById('loginEmail').value.trim();
      const pass  = document.getElementById('loginPass').value;
      let valid = true;

      if (!email) {
        showError('emailError', I18n.t('errRequired')); valid = false;
      } else if (!isValidEmail(email)) {
        showError('emailError', I18n.t('errEmail')); valid = false;
      }
      if (!pass) {
        showError('passError', I18n.t('errRequired')); valid = false;
      }
      if (!valid) return;

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '…'; }

      const result = await Auth.login(email, pass);

      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = I18n.t('loginBtn') || 'Entrar'; }

      if (!result.ok) {
        showError('passError', I18n.t(result.err));
        return;
      }

      showToast(I18n.t('loginOk'));
      setTimeout(() => {
        // T7: ir a ruta pendiente si existe (ej: "Crear" sin sesión)
        const _pending = sessionStorage.getItem('pendingRoute');
        sessionStorage.removeItem('pendingRoute');
        Router.go(_pending || 'home');
        requestAnimationFrame(() => Header.refresh());
      }, 600);
    }

    loginForm.addEventListener('submit', doLogin);
    // Solo un listener: form submit cubre tanto teclado (Enter) como click en el botón
  }

  // ── REGISTRO ──
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    const submitBtn = registerForm.querySelector('button[type="submit"]');

    async function doRegister(e) {
      if (e) e.preventDefault();
      clearErrors();

      const username = document.getElementById('regUsername').value.trim();
      const email    = document.getElementById('regEmail').value.trim();
      const pass     = document.getElementById('regPass').value;
      const passConf = document.getElementById('regPassConf').value;
      let valid = true;

      if (!username) { showError('usernameError', I18n.t('errRequired')); valid = false; }
      if (!email)    { showError('emailError', I18n.t('errRequired')); valid = false; }
      else if (!isValidEmail(email)) { showError('emailError', I18n.t('errEmail')); valid = false; }
      if (!pass)     { showError('passError', I18n.t('errRequired')); valid = false; }
      else if (pass.length < 6) { showError('passError', I18n.t('errPassLen')); valid = false; }
      if (pass !== passConf) { showError('passConfError', I18n.t('errPassMatch')); valid = false; }
      if (!valid) return;

      const submitBtn = registerForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '…'; }

      const result = await Auth.register(username, email, pass);

      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = I18n.t('registerBtn') || 'Crear cuenta'; }

      if (!result.ok) {
        const msg = result.detail ? `${I18n.t(result.err)} (${result.detail})` : I18n.t(result.err);
        // errUsernameExists → señalar el campo username, no el email
        const errField = result.err === 'errUsernameExists' ? 'usernameError' : 'emailError';
        showError(errField, msg);
        return;
      }

      showToast(I18n.t('registerOk'));
      setTimeout(() => Router.go('login'), 1000);
    }

    registerForm.addEventListener('submit', doRegister);
    // Solo un listener: form submit cubre tanto teclado (Enter) como click en el botón
  }
}

// ── Helpers ──
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('visible'); }
}
function clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => {
    el.textContent = '';
    el.classList.remove('visible');
  });
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
