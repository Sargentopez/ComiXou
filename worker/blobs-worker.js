// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//  Rutas /blobs/<sha256> del Worker de Comxow — capas pesadas guardadas POR CONTENIDO en R2 (v42.45)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
//  Idea (almacenamiento direccionado por contenido, como Git LFS, Docker o Figma): el texto de una capa pesada
//  (lo que antes iba en panel_layers.layer_data) se guarda en R2 con el nombre = SU SHA-256. En la base queda
//  solo la referencia «r2:<sha>». Un archivo así NUNCA cambia: se puede cachear un año, subir dos veces es
//  inocuo y para saber si ya está subido basta preguntar por el hash.
//
//    GET     /blobs/<sha>   público  → 200 texto (Cache-Control inmutable) · 404
//    HEAD    /blobs/<sha>   público  → 200 / 404 (sin cuerpo; para saber si ya existe antes de subir)
//    PUT     /blobs/<sha>   con sesión (JWT de Supabase, validado contra /auth/v1/user, como /anims y /gifs)
//                            → 201 creado · 200 ya existía · 400 el contenido no coincide con el hash
//                              · 401 sin sesión · 411 falta Content-Length · 413 demasiado grande
//    OPTIONS /blobs/*       pre-vuelo CORS
//
//  Integridad: R2 comprueba el SHA-256 del cuerpo recibido (opción sha256 de put) y rechaza el objeto si no
//  coincide con el nombre — nadie puede «envenenar» un hash con contenido distinto. La comprobación la hace R2,
//  no el Worker (el plan gratuito da solo 10 ms de CPU por petición).
//  No hay DELETE: un hash puede estar referenciado por varias obras; la limpieza de huérfanos se hará aparte
//  (con permiso de administrador) y nunca por un usuario normal.
//
//  Este archivo es un Worker completo para PROBAR en local (Miniflare). En producción las funciones de
//  abajo se integran en el Worker existente `comxow-storage-worker` (ver worker/LEEME_WORKER_CAPAS.md).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const BLOB_MAX_BYTES = 32 * 1024 * 1024;                       // tope por archivo (la capa más grande hoy: 7,4 MB)
const BLOB_CACHE     = 'public, max-age=31536000, immutable'; // el contenido de un hash nunca cambia
const SHA_RE         = /^[0-9a-f]{64}$/;
const ALLOWED_ORIGINS = ['https://comxow.com', 'https://www.comxow.com'];

function _json(status, obj, extra) {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  if (extra) for (const [k, v] of extra) h.set(k, v);
  return new Response(JSON.stringify(obj), { status, headers: h });
}

// CORS de ESCRITURA y pre-vuelo: solo los orígenes de la web. La LECTURA (GET/HEAD) es pública y de un
// contenido que ya es público por su URL, así que lleva «*» (una sola copia cacheable, sin Vary).
function _corsWrite(request) {
  const o = request.headers.get('Origin');
  const h = new Headers();
  if (o && ALLOWED_ORIGINS.includes(o)) { h.set('Access-Control-Allow-Origin', o); h.set('Vary', 'Origin'); }
  return h;
}

// Validación de sesión: la misma que usa el Worker para /anims y /gifs (se le pregunta a Supabase quién es).
async function _authUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+/.test(auth)) return null;
  let r;
  try { r = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: { Authorization: auth, apikey: env.SUPABASE_ANON } }); }
  catch (_) { return null; }
  if (!r.ok) return null;
  try { const u = await r.json(); return (u && u.id) ? u : null; } catch (_) { return null; }
}

async function handleBlobs(request, env) {
  const url = new URL(request.url);
  const m = /^\/blobs\/([^/]*)$/.exec(url.pathname);
  if (!m) return _json(404, { ok: false, error: 'not_found' });
  const sha = m[1].toLowerCase();
  const method = request.method;

  if (method === 'OPTIONS') {
    const h = _corsWrite(request);
    h.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    h.set('Access-Control-Max-Age', '86400');
    return new Response(null, { status: 204, headers: h });
  }
  if (env.MODO_MANTENIMIENTO === 'VERDADERO')
    return _json(503, { ok: false, error: 'maintenance' }, [['Retry-After', '120'], ['Access-Control-Allow-Origin', '*']]);
  if (!SHA_RE.test(sha))
    return _json(400, { ok: false, error: 'bad_hash' }, [['Access-Control-Allow-Origin', '*']]);
  const key = 'blobs/' + sha;

  // ── Lectura pública ─────────────────────────────────────────────────────────────────────────────
  if (method === 'GET' || method === 'HEAD') {
    const etag = '"' + sha + '"';
    const base = {
      'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': BLOB_CACHE, 'ETag': etag,
      'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff',
    };
    // Revalidación (p. ej. recarga forzada): si el navegador ya tiene ese hash, es ese contenido. Sin tocar R2.
    if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: base });
    const obj = method === 'HEAD' ? await env.BUCKET.head(key) : await env.BUCKET.get(key);
    if (!obj) return _json(404, { ok: false, error: 'not_found' }, [['Access-Control-Allow-Origin', '*']]);
    const h = new Headers(base);
    h.set('Content-Length', String(obj.size));
    return new Response(method === 'HEAD' ? null : obj.body, { status: 200, headers: h });
  }

  // ── Escritura (con sesión) ──────────────────────────────────────────────────────────────────────
  if (method === 'PUT') {
    const cors = _corsWrite(request);
    const withCors = (status, obj) => _json(status, obj, [...cors.entries()]);
    const user = await _authUser(request, env);
    if (!user) return withCors(401, { ok: false, error: 'unauthorized' });
    const len = Number(request.headers.get('Content-Length'));
    if (!Number.isFinite(len) || len <= 0) return withCors(411, { ok: false, error: 'content_length_required' });
    if (len > BLOB_MAX_BYTES) return withCors(413, { ok: false, error: 'too_large', max: BLOB_MAX_BYTES });
    const have = await env.BUCKET.head(key);
    if (have) return withCors(200, { ok: true, exists: true, size: have.size });
    try {
      await env.BUCKET.put(key, request.body, {
        sha256: sha,
        httpMetadata: { contentType: 'text/plain; charset=utf-8', cacheControl: BLOB_CACHE },
        customMetadata: { uid: String(user.id), at: new Date().toISOString() },
      });
    } catch (e) {
      const msg = String(e && e.message || e);
      // R2 rechaza el objeto cuyo SHA-256 no coincide con el declarado («…checksum…did not match…»).
      if (/checksum|digest|sha-?256|did not match/i.test(msg)) return withCors(400, { ok: false, error: 'hash_mismatch' });
      return withCors(502, { ok: false, error: 'r2_error', message: msg.slice(0, 200) });
    }
    return withCors(201, { ok: true, exists: false, size: len });
  }

  return _json(405, { ok: false, error: 'method_not_allowed' }, [['Allow', 'GET, HEAD, PUT, OPTIONS']]);
}

export default {
  async fetch(request, env) {
    const p = new URL(request.url).pathname;
    if (p.startsWith('/blobs/')) return handleBlobs(request, env);
    return _json(404, { ok: false, error: 'not_found' });
  },
};
