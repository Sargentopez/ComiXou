/* ============================================================
   auth.js — Autenticación (localStorage)
   La cabecera y sus dropdowns los gestiona header.js
   showToast y escHtml están en utils.js
   ============================================================ */

const Auth = (() => {
  const KEY_USERS   = 'cs_users';
  const KEY_SESSION = 'cs_session';

  function getUsers()   { return JSON.parse(localStorage.getItem(KEY_USERS)   || '{}'); }
  function saveUsers(u) { localStorage.setItem(KEY_USERS, JSON.stringify(u)); }
  function getSession() { return JSON.parse(localStorage.getItem(KEY_SESSION) || 'null'); }

  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(h).toString(36);
  }

  function register(username, email, password) {
    const users = getUsers();
    const key   = email.toLowerCase().trim();
    if (users[key]) return { ok: false, err: 'errUserExists' };
    users[key] = {
      id: 'u_' + Date.now(), username: username.trim(),
      email: key, passHash: simpleHash(password),
      role: 'user', createdAt: new Date().toISOString()
    };
    saveUsers(users);
    return { ok: true };
  }

  function login(email, password) {
    const users = getUsers();
    const key   = email.toLowerCase().trim();
    const user  = users[key];
    if (!user || user.passHash !== simpleHash(password)) return { ok: false, err: 'errUserNotFound' };
    const session = { id: user.id, username: user.username, email: user.email, role: user.role || 'user' };
    localStorage.setItem(KEY_SESSION, JSON.stringify(session));
    return { ok: true, user: session };
  }

  function logout() { localStorage.removeItem(KEY_SESSION); }

  function deleteAccount() {
    const user = currentUser();
    if (!user) return;
    const users = getUsers();
    Object.keys(users).forEach(k => { if (users[k].id === user.id) delete users[k]; });
    saveUsers(users);
    logout();
  }

  function currentUser() { return getSession(); }
  function isLogged()    { return !!getSession(); }
  function isAdmin()     { const u = getSession(); return !!(u && u.role === 'admin'); }

  return { register, login, logout, deleteAccount, currentUser, isLogged, isAdmin };
})();
