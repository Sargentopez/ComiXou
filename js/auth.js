/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
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
   auth.js  v6.0 — Autenticación híbrida
   - Login/Registro: Supabase Auth (JWT, seguro, multi-dispositivo)
   - Sesión: cacheada en localStorage para acceso síncrono
   - Sin usuarios de repuesto: admin y macario son cuentas reales de
     Supabase (v6.0 — el mecanismo FIXED_USERS se retiró tras confirmar
     que ambas funcionan con email/contraseña propios). Sin conexión,
     la app sigue siendo usable en modo invitado.
   ============================================================ */

const Auth = (() => {
  const KEY_SESSION = 'cs_session';
  const SB_URL      = 'https://qqgsbyylaugsagbxsetc.supabase.co';
  const SB_KEY      = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';

  // ── Detección del enlace de recuperación de contraseña ──────────────────
  // Supabase redirige aquí con el token en el #hash tras el email de
  // recuperación. Se comprueba y se limpia el hash ya, de forma síncrona,
  // ANTES de que Router.start() (línea posterior en index.html) intente
  // interpretarlo como nombre de ruta.
  let _recoveryToken = null;
  let _recoveryError = false;
  (function _detectPasswordRecovery() {
    const hash = window.location.hash;
    if (!hash) return;
    // Caso de error: Supabase devuelve #error=...&error_code=otp_expired&...
    // (enlace caducado o ya usado — típico de probar "olvidé contraseña" varias
    // veces seguidas: el servicio de correo por defecto de Supabase solo manda
    // 2 emails/hora por proyecto, así que los intentos de más reutilizan el
    // mismo enlace ya consumido).
    if (hash.includes('error=') && hash.includes('error_code=')) {
      _recoveryError = true;
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return;
    }
    if (!hash.includes('type=recovery') || !hash.includes('access_token=')) return;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('access_token');
    if (!token) return;
    _recoveryToken = token;
    history.replaceState(null, '', window.location.pathname + window.location.search);
  })();

  async function _completeRecoveryLogin(token) {
    try {
      const res = await fetch(`${SB_URL}/auth/v1/user`, {
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const userData = await res.json();
      const profile  = await _fetchProfile(userData.id, token);
      const role     = profile?.role || userData.user_metadata?.role || 'user';
      const username = profile?.username || userData.user_metadata?.username || (userData.email || '').split('@')[0];
      _saveSession(_buildSession(userData.id, username, userData.email, role, token));
      _openPasswordModalWhenReady();
    } catch (_) { /* enlace caducado o inválido — el usuario tendrá que pedir otro */ }
  }

  function _openPasswordModalWhenReady(beforeOpen) {
    const _open = () => {
      if (typeof beforeOpen === 'function') beforeOpen();
      if (typeof openChangePasswordModal === 'function') openChangePasswordModal();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _open, { once: true });
    } else {
      _open();
    }
  }

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

  // Versión que detecta conflicto de username único (constraint DB)
  async function _upsertProfileSafe(id, username, email, role, token) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/authors`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${token || SB_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ id, username, email, role })
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        // Código 23505 = unique_violation en PostgreSQL
        if (r.status === 409 || (d.code === '23505') ||
            (d.message || '').toLowerCase().includes('unique') ||
            (d.message || '').toLowerCase().includes('username')) {
          return 'duplicate_username';
        }
      }
    } catch (_) {}
    return 'ok';
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
        _migrateLocalWorks(data.user.id);
        return { ok: true, user: session };
      }
      const errMsg = (data.error_description || data.msg || '').toLowerCase();
      if (errMsg.includes('invalid') || res.status === 400) {
        return { ok: false, err: 'errUserNotFound' };
      }
    } catch (_) {}

    return { ok: false, err: 'errUserNotFound' };
  }

  async function register(username, email, password) {
    const key = email.toLowerCase().trim();
    const uname = username.trim();
    // Verificar username único ANTES de crear la cuenta: llama a la función RPC
    // username_exists() (ver auditoría RLS) en vez de consultar la tabla authors
    // directamente. La tabla dejará de ser de lectura pública para proteger el
    // email de los usuarios — esta comprobación necesita su propia vía dedicada
    // que solo devuelve true/false, sin exponer ninguna otra columna de la fila.
    try {
      const uCheck = await fetch(
        `${SB_URL}/rest/v1/rpc/username_exists`,
        {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uname }),
        }
      );
      const exists = await uCheck.json();
      if (exists === true) return { ok: false, err: 'errUsernameExists' };
    } catch (_) { /* sin red: dejar que el signup falle después */ }
    try {
      const res = await fetch(`${SB_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: key, password, data: { username: uname, role: 'author' } }),
      });
      const data = await res.json();
      // Supabase signup OK: res.ok y sin campo 'error' en la respuesta
      const userId = data.user?.id || data.id;
      const token  = data.session?.access_token || data.access_token;
      if (res.ok && !data.error && !data.error_description) {
        if (userId) {
          const upRes = await _upsertProfileSafe(userId, uname, key, 'author', token);
          if (upRes === 'duplicate_username') return { ok: false, err: 'errUsernameExists' };
        }
        return { ok: true };
      }
      const errMsg = (data.error_description || data.msg || data.message || '').toLowerCase();
      console.warn('Supabase signup error:', data);
      if (errMsg.includes('already') || errMsg.includes('exists')) return { ok: false, err: 'errUserExists' };
      if (errMsg.includes('password') || errMsg.includes('weak')) return { ok: false, err: 'errPassLen' };
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

  async function changePassword(newPassword) {
    const session = getSession();
    if (!session || !session.token) return { ok: false, err: 'errNoAuth' };
    try {
      const res = await fetch(`${SB_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${session.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: newPassword })
      });
      if (res.ok) return { ok: true };
      const data = await res.json().catch(() => ({}));
      return { ok: false, err: data.error_description || data.msg || 'errUnknown' };
    } catch (_) {
      return { ok: false, err: 'errNetwork' };
    }
  }

  // Solicita el email de recuperación de contraseña. Supabase redirige al
  // enlace del correo de vuelta a esta misma URL, con el token en el #hash
  // (ver _detectPasswordRecovery más abajo). Siempre responde {ok:true} si
  // la petición se envía correctamente, exista o no esa cuenta — es el
  // comportamiento de Supabase, para no revelar qué emails están registrados.
  async function requestPasswordReset(email) {
    const key = email.toLowerCase().trim();
    const redirectTo = window.location.origin
      + window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '') + '/index.html';
    try {
      const res = await fetch(`${SB_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: key }),
      });
      if (res.ok) return { ok: true };
      return { ok: false, err: 'errNetwork' };
    } catch (_) {
      return { ok: false, err: 'errNetwork' };
    }
  }

  // Migra obras locales del ID antiguo al nuevo UUID de Supabase.
  // Cubre IDs generados localmente (u_TIMESTAMP, incluidos los legacy
  // u_admin/u_macario del extinto sistema FIXED_USERS — no hace falta un
  // mapa de correos hardcodeado aparte: al empezar por 'u_' ya caen dentro
  // del catch-all genérico de abajo). El mapa de correos que había aquí
  // antes se quitó a propósito (v36.84): exponía en texto plano, en un
  // archivo JS público, la dirección real de la cuenta admin — información
  // innecesaria para cualquiera que mirase el código fuente. La migración
  // ya se completó en todos los dispositivos de Alberto, así que no hacía
  // falta ni conservarlo ofuscado.
  function _migrateLocalWorks(newId) {
    try {
      const store = JSON.parse(localStorage.getItem('cs_comics') || '{}');
      // Obtener sesión previa para detectar el ID antiguo de este usuario
      const prevSession = JSON.parse(localStorage.getItem('cs_session_prev') || 'null');
      let changed = false;
      Object.values(store).forEach(comic => {
        const isLegacy = (prevSession && comic.userId === prevSession.id) ||
                         (comic.userId && comic.userId.startsWith('u_') && comic.userId !== newId);
        if (isLegacy) {
          comic.userId = newId;
          changed = true;
        }
      });
      if (changed) localStorage.setItem('cs_comics', JSON.stringify(store));
    } catch(_) {}
  }

  // Decodifica el payload de un JWT y devuelve el campo 'exp' (Unix timestamp)
  function _jwtExp(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      return payload.exp || 0;
    } catch(_) { return 0; }
  }

  // Devuelve true si el token JWT ha caducado (o caduca en menos de 60s)
  function _tokenExpired(token) {
    if(!token) return true;
    const exp = _jwtExp(token);
    return exp > 0 && (exp - 60) < (Date.now() / 1000);
  }

  async function _tryRefresh() {
    const session = getSession();
    const refresh = localStorage.getItem('cs_refresh');

    // Si no hay sesión, nada que hacer
    if(!session) return;

    // Si el token no ha caducado, no hace falta refrescar
    if(session.token && !_tokenExpired(session.token)) return;

    // Token caducado — intentar refresh
    if(!refresh) {
      // Sin refresh token y token caducado → sesión inválida, limpiar
      _clearSession();
      if(typeof Header !== 'undefined') Header.refresh();
      return;
    }
    try {
      const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) { _clearSession(); localStorage.removeItem('cs_refresh'); if(typeof Header!=='undefined') Header.refresh(); return; }
      const data = await res.json();
      if (data.access_token) {
        const profile  = await _fetchProfile(data.user.id, data.access_token);
        const role     = profile?.role || data.user.user_metadata?.role || 'user';
        const username = profile?.username || data.user.user_metadata?.username || '';
        _saveSession(_buildSession(data.user.id, username, data.user.email, role, data.access_token));
        if (data.refresh_token) localStorage.setItem('cs_refresh', data.refresh_token);
        if (typeof Header !== 'undefined') Header.refresh();
      } else {
        // Respuesta sin access_token → refresh inválido
        _clearSession(); localStorage.removeItem('cs_refresh');
        if(typeof Header !== 'undefined') Header.refresh();
      }
    } catch (_) {}
  }

  _tryRefresh();

  // ── Validación server-side de la sesión cacheada ───────────────────────────
  // Llama a /auth/v1/user para confirmar que el token sigue siendo válido en Supabase.
  // Si el servidor responde 401/403 el token fue revocado remotamente → limpiar sesión.
  // Se lanza en background sin bloquear la render inicial; si hay error de red se mantiene
  // la sesión (degradación elegante en modo offline).
  async function _validateServerSession() {
    const session = getSession();
    if (!session?.token) return;              // sin sesión → nada que validar
    if (_tokenExpired(session.token)) return; // caducado localmente → _tryRefresh ya lo maneja
    try {
      const res = await fetch(`${SB_URL}/auth/v1/user`, {
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${session.token}` }
      });
      if (res.status === 401 || res.status === 403) {
        _clearSession();
        localStorage.removeItem('cs_refresh');
        if (typeof Header !== 'undefined') Header.refresh();
        return;
      }
      // 200 OK → sesión válida.
      //
      // NUEVO — Petición explícita de Alberto (bug: un usuario recién hecho
      // admin no podía entrar al panel hasta cerrar y volver a iniciar
      // sesión): _tryRefresh() de arriba SOLO vuelve a consultar el perfil
      // (rol incluido) cuando el token JWT ha caducado — con un token
      // todavía válido (puede durar bastante), un cambio de rol hecho por
      // otro admin no se reflejaba en la sesión YA ABIERTA de esa persona
      // hasta que su token expirase por su cuenta o volviera a iniciar
      // sesión a mano. Aquí, con la sesión ya confirmada válida en el
      // servidor, se aprovecha para refrescar también el perfil (rol y
      // nombre) por si ha cambiado desde el login — así el cambio se nota
      // en la siguiente carga de la app (recargar/reabrir), sin esperar a
      // que el token expire.
      if (res.ok) {
        const profile = await _fetchProfile(session.id, session.token);
        if (profile && (profile.role !== session.role || profile.username !== session.username)) {
          _saveSession(_buildSession(session.id, profile.username || session.username, session.email, profile.role, session.token));
          if (typeof Header !== 'undefined') Header.refresh();
        }
      }
    } catch (_) {
      // Error de red (offline) → mantener sesión cacheada
    }
  }

  // Ejecutar validación tras el intento de refresh para no solapar peticiones
  _tryRefresh().then(() => _validateServerSession());

  // Si veníamos de un enlace de recuperación de contraseña, completar el login
  // temporal y abrir el modal de "elegir contraseña nueva" en cuanto cargue la página.
  if (_recoveryToken) _completeRecoveryLogin(_recoveryToken);
  if (_recoveryError) _openPasswordModalWhenReady(() => {
    if (typeof showToast === 'function') showToast(I18n.t('resetLinkExpired'), 4500);
  });

  function currentUser() {
    const s = getSession();
    if(!s) return null;
    // Si el token está caducado y no hay refresh, sesión inválida
    if(_tokenExpired(s.token) && !localStorage.getItem('cs_refresh')) {
      _clearSession();
      return null;
    }
    return s;
  }
  function isLogged()    { return !!currentUser(); }
  function isAdmin()     { const u = getSession(); return !!(u && u.role === 'admin'); }

  // Vuelve a comprobar el ROLE real en el servidor y actualiza la sesión en
  // caché si ha cambiado — NUEVO (pedido explícito de Alberto): getSession()
  // guarda el role tal cual estaba AL INICIAR SESIÓN; si el admin asciende a
  // alguien a administrador mientras esa persona sigue con la sesión ya
  // iniciada, su caché local seguía diciendo 'user' hasta que volvía a
  // iniciar sesión desde cero — no podía ni ver el enlace "Panel de
  // administrador" en el menú, ni entrar al panel aunque escribiera #admin a
  // mano. Se llama una vez al arrancar la app (Router.start(), vía
  // router.js) y, como red de seguridad adicional para quien navegue
  // directamente a #admin sin haber recargado, justo antes de decidir si se
  // deja entrar al panel (ver AdminView_init en admin.js). Devuelve true si
  // el role ha cambiado de verdad (para que quien llame sepa si merece la
  // pena refrescar algo más, p.ej. el enlace del menú).
  async function refreshRole() {
    const s = getSession();
    if (!s || !s.token) return false;
    const profile = await _fetchProfile(s.id, s.token);
    if (profile && profile.role && profile.role !== s.role) {
      s.role = profile.role;
      _saveSession(s);
      return true;
    }
    return false;
  }

  function canManage(comic) {
    const u = currentUser();
    if (!u) return false;
    if (u.role === 'admin') return true;
    // Compatibilidad: obras antiguas tienen userId='u_macario', nuevas tienen UUID
    return comic.userId === u.id || comic.username === u.username;
  }

  return { login, register, logout, deleteAccount, changePassword, requestPasswordReset, currentUser, isLogged, isAdmin, canManage, refreshRole };
})();

// Exponer _tryRefresh globalmente para que supabase-client pueda refrescar el token antes de escribir
window._authTryRefresh = (function() {
  // Reimplementación mínima: lee cs_session y cs_refresh, refresca si el token está caducado
  const SB_URL = 'https://qqgsbyylaugsagbxsetc.supabase.co';
  const SB_KEY = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';
  function _jwtExp(t) { try { return JSON.parse(atob(t.split('.')[1])).exp || 0; } catch(e) { return 0; } }
  function _expired(t) { if(!t) return true; const e=_jwtExp(t); return e>0 && (e-60)<(Date.now()/1000); }
  return async function() {
    try {
      const s = JSON.parse(localStorage.getItem('cs_session')||'null');
      if (!s || !_expired(s.token)) return; // no expirado, nada que hacer
      const refresh = localStorage.getItem('cs_refresh');
      if (!refresh) return;
      const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.access_token) {
        s.token = data.access_token;
        localStorage.setItem('cs_session', JSON.stringify(s));
        if (data.refresh_token) localStorage.setItem('cs_refresh', data.refresh_token);
      }
    } catch(e) {}
  };
})();
