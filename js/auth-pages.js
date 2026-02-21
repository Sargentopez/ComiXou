/* ============================================================
   auth-pages.js — Lógica de formularios login/registro
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // ── Mostrar/ocultar contraseña ──
  const passToggle = document.getElementById('passToggle');
  if (passToggle) {
    passToggle.addEventListener('click', () => {
      const inputs = document.querySelectorAll('input[type="password"], input[type="text"].pass-field');
      const passEl = document.getElementById('loginPass') || document.getElementById('regPass');
      if (!passEl) return;
      const isHidden = passEl.type === 'password';
      document.querySelectorAll('input[id*="Pass"], input[id*="pass"]').forEach(inp => {
        inp.type = isHidden ? 'text' : 'password';
      });
      passToggle.textContent = isHidden ? '🙈' : '👁';
    });
  }

  // ── LOGIN ──
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const pass  = document.getElementById('loginPass').value;
      let valid = true;

      // Validaciones
      clearErrors();
      if (!email.trim()) {
        showError('emailError', I18n.t('errRequired')); valid = false;
      } else if (!isValidEmail(email)) {
        showError('emailError', I18n.t('errEmail')); valid = false;
      }
      if (!pass.trim()) {
        showError('passError', I18n.t('errRequired')); valid = false;
      }
      if (!valid) return;

      const result = Auth.login(email, pass);
      if (!result.ok) {
        showError('passError', I18n.t(result.err));
        return;
      }

      showToast(I18n.t('loginOk'));
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect');
      setTimeout(() => {
        window.location.href = redirect === 'editor' ? 'editor.html' : '../index.html';
      }, 800);
    });
  }

  // ── REGISTRO ──
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('regUsername').value;
      const email    = document.getElementById('regEmail').value;
      const pass     = document.getElementById('regPass').value;
      const passConf = document.getElementById('regPassConf').value;
      let valid = true;

      clearErrors();
      if (!username.trim()) {
        showError('usernameError', I18n.t('errRequired')); valid = false;
      }
      if (!email.trim()) {
        showError('emailError', I18n.t('errRequired')); valid = false;
      } else if (!isValidEmail(email)) {
        showError('emailError', I18n.t('errEmail')); valid = false;
      }
      if (!pass.trim()) {
        showError('passError', I18n.t('errRequired')); valid = false;
      } else if (pass.length < 6) {
        showError('passError', I18n.t('errPassLen')); valid = false;
      }
      if (pass !== passConf) {
        showError('passConfError', I18n.t('errPassMatch')); valid = false;
      }
      if (!valid) return;

      const result = Auth.register(username, email, pass);
      if (!result.ok) {
        showError('emailError', I18n.t(result.err));
        return;
      }

      showToast(I18n.t('registerOk'));
      setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    });
  }
});

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
