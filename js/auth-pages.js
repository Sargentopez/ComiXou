/* ============================================================
   auth-pages.js — Login y Registro (SPA)
   AuthView_init() se llama cada vez que el router renderiza
   la vista login o register — busca elementos frescos del DOM.
   ============================================================ */

function AuthView_init() {

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
        Router.go('home');
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
        showError('emailError', msg);
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
