// Supabase simulada para probar la MIGRACIÓN de capas pesadas a R2 (v42.48).
// Envuelve ./cloud_emu.js (works/panels/panel_layers/panel_texts, layer_sha, cascada…) y le añade:
//   · las dos funciones SQL del administrador (rpc/admin_xr_scan y rpc/admin_xr_swap) con la MISMA semántica que el SQL de verdad
//     (probado aparte en un PostgreSQL 16: /tmp/t4247/pgtest): puerta «admin», 'gone' · 'empty' · 'already' · 'small' · 'changed' · 'ok',
//     huella calculada sobre los bytes UTF-8, disparador que anula panels.nav y restauración del nav;
//   · limit/offset de PostgREST sobre el resultado de la función;
//   · ganchos para provocar carreras y fallos: onLayerServed (después de entregar el texto de una capa), faults.swap / faults.scan.
const crypto = require('crypto');
const { mkCloud, sleep } = require('./cloud_emu.js');

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const RE_PTR = /^r2:[0-9a-f]{64}:[0-9]+$/;

function mkMigCloud(cfg0, adminId) {
  const emu = mkCloud(cfg0);
  const mig = {
    adminId, noSql: false,
    authors: new Map(),                 // id → { username, role }
    rpc: [],                            // { fn, args, status }
    getLayer: [],                       // ids pedidos con GET panel_layers?id=eq.X&select=layer_data
    onLayerServed: null,                // (id, db) → se ejecuta justo después de entregar el texto de la capa
    faults: { swap: [], scan: [] },     // 'gw502' | 'abort' | '401'
    getFaults: [],                      // fallos para GET panel_layers?id=eq.X&select=layer_data: '402' | 'abort' | 'gw502'
    navLog: [],                         // { panel, antes, trasTrigger, despues }
  };
  const json = (route, status, obj) => route.fulfill({ status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: typeof obj === 'string' ? obj : JSON.stringify(obj) });
  const subOf = req => {
    try { const t = (req.headers()['authorization'] || '').replace(/^Bearer\s+/, ''); return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).sub; } catch (_) { return null; }
  };
  const isAdmin = req => { const a = mig.authors.get(subOf(req)); return !!(a && a.username === 'admin' && a.role === 'admin'); };
  const forbidden = route => json(route, 403, { code: '42501', details: null, hint: null, message: 'Solo la cuenta administradora principal puede usar esta función' });

  async function rpc(route, fn, url) {
    const req = route.request();
    let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch (_) {}
    const rec = { fn, args, status: 0 }; mig.rpc.push(rec);
    if (mig.noSql) { rec.status = 404; return json(route, 404, { code: 'PGRST202', message: 'Could not find the function public.' + fn + ' in the schema cache', hint: null, details: null }); }
    const f = (mig.faults[fn === 'admin_xr_swap' ? 'swap' : 'scan']).shift() || null;
    if (f === 'gw502') { rec.status = 502; return route.fulfill({ status: 502, headers: cors, contentType: 'text/html', body: '<html>Bad gateway</html>' }); }
    if (f === 'abort') { rec.status = 0; return route.abort('connectionreset'); }
    if (f === '401') { rec.status = 401; return json(route, 401, { code: 'PGRST301', message: 'JWT expired', details: null, hint: null }); }
    if (!isAdmin(req)) { rec.status = 403; return forbidden(route); }
    const db = emu.db;
    if (fn === 'admin_xr_scan') {
      const min = Math.max(1024, args.p_min == null ? 32768 : args.p_min), withRef = !!args.p_ref;
      let rows = db.layers.filter(l => {
        const n = typeof l.layer_data === 'string' ? Buffer.byteLength(l.layer_data) : 0;
        return n >= min || (withRef && n < 128 && /^r2:/.test(l.layer_data || ''));
      }).map(l => {
        const p = db.panels.find(x => x.id === l.panel_id) || {}, w = db.works.get(p.work_id) || {}, a = mig.authors.get(w.author_id) || {};
        const n = Buffer.byteLength(l.layer_data);
        return { r_layer: String(l.id), r_panel: l.panel_id, r_work: p.work_id, r_panel_order: p.panel_order, r_layer_order: l.layer_order, r_type: l.layer_type,
          r_bytes: n, r_ref: (n < 128 && /^r2:/.test(l.layer_data)) ? l.layer_data : null, r_title: w.title || null, r_author: a.username || null, r_published: !!w.published };
      });
      rows.sort((x, y) => (y.r_bytes - x.r_bytes) || (x.r_layer < y.r_layer ? -1 : 1));
      const lim = url.searchParams.get('limit'), off = +(url.searchParams.get('offset') || 0);
      if (lim != null) rows = rows.slice(off, off + +lim);
      rec.status = 200; rec.n = rows.length;
      return json(route, 200, rows);
    }
    // admin_xr_swap
    const sha = args.p_sha;
    if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) { rec.status = 400; return json(route, 400, { code: '22023', message: 'huella no válida', details: null, hint: null }); }
    const l = db.layers.find(x => String(x.id) === String(args.p_id));
    const ans = r => { rec.status = 200; rec.result = r; return json(route, 200, JSON.stringify(r)); };
    if (!l) return ans('gone');
    if (l.layer_data == null) return ans('empty');
    const len = Buffer.byteLength(l.layer_data);
    if (len < 128 && RE_PTR.test(l.layer_data)) return ans('already');
    if (len < 4096) return ans('small');
    const real = sha256(l.layer_data);
    if (real !== sha) return ans('changed');
    const p = db.panels.find(x => x.id === l.panel_id) || {}, nav = p.nav;
    l.layer_data = 'r2:' + real + ':' + len; l.layer_sha = sha256(l.layer_data);
    const tras = (p.nav = null);                              // el disparador panels_nav_invalidate
    if (nav != null) p.nav = nav;                             // …y la restauración de la función
    mig.navLog.push({ panel: p.id, antes: nav, trasTrigger: tras, despues: p.nav });
    mig.swaps = (mig.swaps || 0) + 1;
    return ans('ok');
  }

  async function handler(route) {
    const req = route.request(), url = new URL(req.url());
    const m = /\/rest\/v1\/rpc\/(admin_xr_scan|admin_xr_swap)$/.exec(url.pathname);
    if (m && req.method() === 'POST') return rpc(route, m[1], url);
    if (m && req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const isLayerText = req.method() === 'GET' && /\/rest\/v1\/panel_layers$/.test(url.pathname) && url.searchParams.get('select') === 'layer_data' && /^eq\./.test(url.searchParams.get('id') || '');
    const id = isLayerText ? url.searchParams.get('id').slice(3) : null;
    if (isLayerText) mig.getLayer.push(id);
    if (isLayerText && mig.getFaults.length) {
      const f = mig.getFaults.shift();
      if (f === '402') return json(route, 402, { message: 'Exceeded egress quota' });
      if (f === 'abort') return route.abort('connectionreset');
      if (f === 'gw502') return route.fulfill({ status: 502, headers: cors, contentType: 'text/html', body: '<html>Bad gateway</html>' });
    }
    await emu.handler(route);
    if (isLayerText && mig.onLayerServed) { try { await mig.onLayerServed(id, emu.db); } catch (e) { console.log('onLayerServed', e); } }
  }
  return Object.assign({}, emu, { handler, mig, sha: sha256, RE_PTR });
}
module.exports = { mkMigCloud, sha256, sleep, RE_PTR };
