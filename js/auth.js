/* ============================================================
   auth.js  v5.0 — Autenticación híbrida
   - Login/Registro: Supabase Auth (JWT, seguro, multi-dispositivo)
   - Sesión: cacheada en localStorage para acceso síncrono
   - Fallback: usuarios fijos admin+macario siguen funcionando
     aunque Supabase no esté disponible
   ============================================================ */

const Auth = (() => {
  const KEY_SESSION = 'cs_session';
  const SB_URL      = 'https://qqgsbyylaugsagbxsetc.supabase.co';
  const SB_KEY      = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';

  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(h).toString(36);
  }

  const FIXED_USERS = {
    'admin@comixow.com': {
      id: 'u_admin', username: 'Admin',
      email: 'admin@comixow.com', passHash: simpleHash('123456'), role: 'admin'
    },
    'macario@yo.com': {
      id: 'u_macario', username: 'Macario',
      email: 'macario@yo.com', passHash: simpleHash('123456'), role: 'author'
    }
  };

  function getSession()    { return JSON.parse(localStorage.getItem(KEY_SESSION) || 'null'); }
  function _saveSession(s) { localStorage.setItem(KEY_SESSION, JSON.stringify(s)); }
  function _clearSession() { localStorage.removeItem(KEY_SESSION); }

  function _buildSession(id, username, email, role, token) {
    return { id, username, email, role: role || 'user', token: token || null };
  }

  async function _fetchProfile(userId, token) {
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/authors?id=eq.${userId}&select=id,username,email,role&limit=1`,
        { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${token || SB_KEY}` } }
      );
      if (!res.ok) return null;
      const rows = await res.json();
      return rows[0] || null;
    } catch (_) { return null; }
  }

  async function _upsertProfile(id, username, email, role, token) {
    try {
      await fetch(`${SB_URL}/rest/v1/authors`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${token || SB_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ id, username, email, role })
      });
    } catch (_) {}
  }

  async function login(email, password) {
    const key = email.toLowerCase().trim();
    try {
      const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: key, password }),
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        const profile  = await _fetchProfile(data.user.id, data.access_token);
        const role     = profile?.role || data.user.user_metadata?.role || 'user';
        const username = profile?.username || data.user.user_metadata?.username || key.split('@')[0];
        const session  = _buildSession(data.user.id, username, key, role, data.access_token);
        _saveSession(session);
        if (data.refresh_token) localStorage.setItem('cs_refresh', data.refresh_token);
        // Migrar obras locales del ID antiguo al nuevo UUID de Supabase
        _migrateLocalWorks(key, data.user.id);
        return { ok: true, user: session };
      }
      const errMsg = (data.error_description || data.msg || '').toLowerCase();
      if (errMsg.includes('invalid') || res.status === 400) {
        return { ok: false, err: 'errUserNotFound' };
      }
    } catch (_) {}

    // Fallback usuarios fijos (sin red o Supabase caído)
    const fixed = FIXED_USERS[key];
    if (fixed && fixed.passHash === simpleHash(password)) {
      const session = _buildSession(fixed.id, fixed.username, key, fixed.role, null);
      _saveSession(session);
      return { ok: true, user: session };
    }
    return { ok: false, err: 'errUserNotFound' };
  }

  async function register(username, email, password) {
    const key = email.toLowerCase().trim();
    if (FIXED_USERS[key]) return { ok: false, err: 'errUserExists' };
    try {
      const res = await fetch(`${SB_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: key, password, data: { username: username.trim(), role: 'author' } }),
      });
      const data = await res.json();
      // Supabase signup OK: res.ok y sin campo 'error' en la respuesta
      const userId = data.user?.id || data.id;
      const token  = data.session?.access_token || data.access_token;
      if (res.ok && !data.error && !data.error_description) {
        const uid = userId || 'pending'; // puede no haber id si requiere confirmación
        if (userId) await _upsertProfile(userId, username.trim(), key, 'author', token);
        return { ok: true };
      }
      const errMsg = (data.error_description || data.msg || data.message || '').toLowerCase();
      console.warn('Supabase signup error:', data);
      if (errMsg.includes('already') || errMsg.includes('exists')) return { ok: false, err: 'errUserExists' };
      if (errMsg.includes('password') || errMsg.includes('weak')) return { ok: false, err: 'errPassLen' };
      // Devolver mensaje real para diagnóstico
      return { ok: false, err: 'errRegisterFail', detail: data.error_description || data.msg || data.message || JSON.stringify(data) };
    } catch (e) {
      console.warn('register fetch error:', e);
      return { ok: false, err: 'errNoNetwork' };
    }
  }

  async function logout() {
    const session = getSession();
    if (session?.token) {
      fetch(`${SB_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${session.token}` }
      }).catch(() => {});
    }
    _clearSession();
    localStorage.removeItem('cs_refresh');
  }

  async function deleteAccount() {
    const user = currentUser();
    if (!user) return;
    _clearSession();
    localStorage.removeItem('cs_refresh');
  }

  // Migra obras locales del ID antiguo al nuevo UUID de Supabase
  // Cubre: IDs legacy conocidos (u_admin, u_macario) y IDs generados localmente (u_TIMESTAMP)
  function _migrateLocalWorks(email, newId) {
    try {
      const store = JSON.parse(localStorage.getItem('cs_comics') || '{}');
      const legacyMap = {
        'admin@comixow.com': 'u_admin',
        'macario@yo.com':    'u_macario',
      };
      const legacyId = legacyMap[email];
      // Obtener sesión previa para detectar el ID antiguo de este usuario
      const prevSession = JSON.parse(localStorage.getItem('cs_session_prev') || 'null');
      let changed = false;
      Object.values(store).forEach(comic => {
        const isLegacy = (legacyId && comic.userId === legacyId) ||
                         (prevSession && comic.userId === prevSession.id) ||
                         (comic.userId && comic.userId.startsWith('u_') && comic.userId !== newId);
        if (isLegacy) {
          comic.userId = newId;
          changed = true;
        }
      });
      if (changed) localStorage.setItem('cs_comics', JSON.stringify(store));
    } catch(_) {}
  }

  async function _tryRefresh() {
    const refresh = localStorage.getItem('cs_refresh');
    if (!refresh) return;
    try {
      const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) { _clearSession(); localStorage.removeItem('cs_refresh'); return; }
      const data = await res.json();
      if (data.access_token) {
        const profile  = await _fetchProfile(data.user.id, data.access_token);
        const role     = profile?.role || data.user.user_metadata?.role || 'user';
        const username = profile?.username || data.user.user_metadata?.username || '';
        _saveSession(_buildSession(data.user.id, username, data.user.email, role, data.access_token));
        if (data.refresh_token) localStorage.setItem('cs_refresh', data.refresh_token);
        if (typeof Header !== 'undefined') Header.refresh();
      }
    } catch (_) {}
  }

  _tryRefresh();

  function currentUser() { return getSession(); }
  function isLogged()    { return !!getSession(); }
  function isAdmin()     { const u = getSession(); return !!(u && u.role === 'admin'); }
  function canManage(comic) {
    const u = currentUser();
    if (!u) return false;
    if (u.role === 'admin') return true;
    return comic.userId === u.id;
  }

  return { login, register, logout, deleteAccount, currentUser, isLogged, isAdmin, canManage };
})();
