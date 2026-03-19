/* ============================================================
   auth.js  v4.7 — Autenticación
   Usuarios fijos (admin + macario) hardcodeados en código:
   no dependen de ningún dispositivo ni localStorage.
   Los usuarios registrados se guardan en localStorage como antes.
   ============================================================ */

const Auth = (() => {
  const KEY_USERS   = 'cs_users';
  const KEY_SESSION = 'cs_session';

  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(h).toString(36);
  }

  /* ══════════════════════════════════════════
     USUARIOS FIJOS (hardcoded, funciona en
     cualquier dispositivo sin registro previo)
     ══════════════════════════════════════════ */
  const FIXED_USERS = {
    'admin@comixow.com': {
      id:       'u_admin',
      username: 'Admin',
      email:    'admin@comixow.com',
      passHash: simpleHash('123456'),
      role:     'admin'
    },
    'macario@yo.com': {
      id:       'u_macario',
      username: 'Macario',
      email:    'macario@yo.com',
      passHash: simpleHash('123456'),
      role:     'author'   // puede publicar/despublicar/eliminar solo lo suyo
    }
  };

  /* ── localStorage users (usuarios registrados en el dispositivo) ── */
  function getStoredUsers() { return JSON.parse(localStorage.getItem(KEY_USERS) || '{}'); }
  function saveStoredUsers(u) { localStorage.setItem(KEY_USERS, JSON.stringify(u)); }
  function getSession()    { return JSON.parse(localStorage.getItem(KEY_SESSION) || 'null'); }

  /* Fusionar: fijos tienen prioridad sobre localStorage */
  function _allUsers() {
    const stored = getStoredUsers();
    return { ...stored, ...FIXED_USERS };
  }

  /* ── Registro (solo para usuarios normales, no fijos) ── */
  function register(username, email, password) {
    const key = email.toLowerCase().trim();
    if (FIXED_USERS[key]) return { ok: false, err: 'errUserExists' };
    const stored = getStoredUsers();
    if (stored[key]) return { ok: false, err: 'errUserExists' };
    stored[key] = {
      id:        'u_' + Date.now(),
      username:  username.trim(),
      email:     key,
      passHash:  simpleHash(password),
      role:      'user',
      createdAt: new Date().toISOString()
    };
    saveStoredUsers(stored);
    return { ok: true };
  }

  /* ── Login ── */
  function login(email, password) {
    const key  = email.toLowerCase().trim();
    const all  = _allUsers();
    const user = all[key];
    if (!user || user.passHash !== simpleHash(password)) {
      return { ok: false, err: 'errUserNotFound' };
    }
    const session = {
      id:       user.id,
      username: user.username,
      email:    user.email,
      role:     user.role || 'user'
    };
    localStorage.setItem(KEY_SESSION, JSON.stringify(session));
    return { ok: true, user: session };
  }

  function logout() { localStorage.removeItem(KEY_SESSION); }

  function deleteAccount() {
    const user = currentUser();
    if (!user) return;
    // No se puede eliminar una cuenta fija
    if (FIXED_USERS[user.email]) { logout(); return; }
    const stored = getStoredUsers();
    Object.keys(stored).forEach(k => { if (stored[k].id === user.id) delete stored[k]; });
    saveStoredUsers(stored);
    logout();
  }

  function currentUser() { return getSession(); }
  function isLogged()    { return !!getSession(); }
  function isAdmin()     { const u = getSession(); return !!(u && u.role === 'admin'); }

  /* ¿Puede el usuario actuar sobre una obra? (publicar, retirar, eliminar)
     - admin: sobre cualquier obra
     - author (Macario): solo sobre sus propias obras
     - user: solo sobre sus propias obras
  */
  function canManage(comic) {
    const u = currentUser();
    if (!u) return false;
    if (u.role === 'admin') return true;
    return comic.userId === u.id;
  }

  /* Asegurar que Macario existe también en localStorage para que
     sus obras queden asociadas a su ID fijo en todos los dispositivos */
  function _ensureFixedUsersInStorage() {
    const stored = getStoredUsers();
    let changed = false;
    Object.entries(FIXED_USERS).forEach(([email, user]) => {
      if (!stored[email]) {
        stored[email] = { ...user, createdAt: '2024-01-01T00:00:00.000Z' };
        changed = true;
      } else {
        // Asegurar rol correcto aunque haya sido sobreescrito
        if (stored[email].role !== user.role) {
          stored[email].role = user.role;
          changed = true;
        }
      }
    });
    if (changed) saveStoredUsers(stored);
  }

  // Ejecutar al cargar
  _ensureFixedUsersInStorage();

  return { register, login, logout, deleteAccount, currentUser, isLogged, isAdmin, canManage };
})();
