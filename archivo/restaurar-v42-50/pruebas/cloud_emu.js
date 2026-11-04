// Supabase (PostgREST) simulada para probar la subida a la nube — v42.44
// Modela lo mínimo que usa SupabaseClient.saveDraft: works / panels / panel_layers / panel_texts, filtros eq. e in.(),
// cascada panels → panel_layers/panel_texts, columna calculada layer_sha, Prefer: return=minimal|representation.
// Y los fallos reales: sentencia que pasa del tope → 500 {"code":"57014",…} (se deshace), pasarela 502 sin cuerpo de PostgREST,
// conexión que se corta (con o sin haber escrito ya), 403 de RLS.
const crypto = require('crypto');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T57014 = '{"code":"57014","details":null,"hint":null,"message":"canceling statement due to statement timeout"}';

function mkCloud(cfg0) {
  const cfg = Object.assign({
    stmtLimit: Infinity,       // bytes: una sentencia de INSERT de capas por encima → 57014
    inflightLimit: Infinity,   // bytes en vuelo a la vez (todas las sentencias de capas) por encima → 57014 (la IO compartida)
    delLimit: Infinity,        // bytes de TOAST borrados por UNA sentencia DELETE por encima → 57014
    faults: [],                // fallos a inyectar en las próximas peticiones POST de capas (uno por petición, en orden)
    msPerMB: 30,               // lo que tarda «la base» por MB (ms reales)
  }, cfg0 || {});
  const db = { works: new Map(), panels: [], layers: [], texts: [] };
  let idL = 1, idP = 1;
  const st = { layerPosts: [], deletes: [], inflight: 0, inflightBytes: 0, maxInflight: 0, maxInflightBytes: 0, gets: [], others: [] };
  const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  const json = (route, status, obj, extra) => route.fulfill({ status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: typeof obj === 'string' ? obj : JSON.stringify(obj) });
  const empty = (route, status) => route.fulfill({ status, headers: cors, body: '' });
  const bytes = r => (typeof r.layer_data === 'string' ? r.layer_data.length : 0);
  function match(row, q) {
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const m = /^(eq|in)\.(.*)$/.exec(v); if (!m) continue;
      if (m[1] === 'eq') { if (String(row[k]) !== m[2]) return false; }
      else { const set = m[2].replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')); if (!set.includes(String(row[k]))) return false; }
    }
    return true;
  }
  const project = (rows, sel) => { if (!sel) return rows; const cols = sel.split(','); return rows.map(r => { const o = {}; cols.forEach(c => { o[c] = r[c]; }); return o; }); };

  async function handler(route) {
    const req = route.request(), url = new URL(req.url()), m = req.method();
    if (m === 'OPTIONS') return empty(route, 204);
    if (!/\/rest\/v1\//.test(url.pathname)) { st.others.push(m + ' ' + url.pathname); return json(route, 200, []); }
    const table = url.pathname.split('/rest/v1/')[1], q = url.searchParams, prefer = req.headers()['prefer'] || '';
    const wantRep = /return=representation/.test(prefer), body = req.postData();

    if (m === 'GET') {
      st.gets.push(table + '?' + url.searchParams.toString());
      if (table === 'panels') return json(route, 200, project(db.panels.filter(r => match(r, q)).map(r => Object.assign({}, r)), q.get('select')));
      if (table === 'panel_layers') return json(route, 200, project(db.layers.filter(r => match(r, q)).sort((x, y) => x.layer_order - y.layer_order).map(r => Object.assign({}, r)), q.get('select')));
      if (table === 'works') return json(route, 200, [...db.works.values()].filter(r => match(r, q)));
      return json(route, 200, []);
    }

    if (m === 'DELETE') {
      let victims, layersGone = [];
      if (table === 'panels') {
        victims = db.panels.filter(r => match(r, q));
        const ids = new Set(victims.map(v => v.id));
        layersGone = db.layers.filter(l => ids.has(l.panel_id));
        const b = layersGone.reduce((n, l) => n + bytes(l), 0);
        st.deletes.push({ table, filter: url.search, bytes: b, panels: victims.length });
        if (b > cfg.delLimit) return json(route, 500, T57014);
        db.panels = db.panels.filter(r => !ids.has(r.id));
        db.layers = db.layers.filter(l => !ids.has(l.panel_id));
        db.texts = db.texts.filter(t => !ids.has(t.panel_id));
        return empty(route, 204);
      }
      if (table === 'panel_layers') {
        victims = db.layers.filter(r => match(r, q));
        const b = victims.reduce((n, l) => n + bytes(l), 0);
        st.deletes.push({ table, filter: url.search, bytes: b, rows: victims.length });
        if (b > cfg.delLimit) return json(route, 500, T57014);
        const ids = new Set(victims.map(v => v.id));
        db.layers = db.layers.filter(l => !ids.has(l.id));
        if (wantRep) return json(route, 200, project(victims.map(r => Object.assign({}, r)), q.get('select')));
        return empty(route, 204);
      }
      if (table === 'panel_texts') { db.texts = db.texts.filter(r => !match(r, q)); return empty(route, 204); }
      return empty(route, 204);
    }

    if (m === 'PATCH') { st.others.push('PATCH ' + table); return empty(route, 204); }

    // POST
    let rows; try { rows = JSON.parse(body); } catch (_) { return json(route, 400, { code: 'PGRST102', message: 'bad json' }); }
    if (!Array.isArray(rows)) rows = [rows];
    if (table === 'works') {
      rows.forEach(r => { const old = db.works.get(r.id) || {}; db.works.set(r.id, Object.assign(old, r)); });
      return wantRep ? json(route, 201, rows.map(r => ({ updated_at: r.updated_at }))) : empty(route, 201);
    }
    if (table === 'panels') {
      const out = rows.map(r => {
        if (r.id) { const i = db.panels.findIndex(p => p.id === r.id); if (i >= 0) { Object.assign(db.panels[i], r); return { id: r.id }; } }
        const id = r.id || ('P' + (idP++)); db.panels.push(Object.assign({}, r, { id })); return { id };
      });
      return wantRep ? json(route, 201, out) : empty(route, 201);
    }
    if (table === 'panel_texts') { rows.forEach(r => db.texts.push(r)); return empty(route, 201); }
    if (table === 'panel_layers') {
      const total = rows.reduce((n, r) => n + bytes(r), 0), rec = { n: st.layerPosts.length + 1, rows: rows.length, bytes: total, panel: rows[0] && rows[0].panel_id, orders: rows.map(r => r.layer_order), result: '' };
      st.layerPosts.push(rec);
      st.inflight++; st.inflightBytes += total;
      st.maxInflight = Math.max(st.maxInflight, st.inflight); st.maxInflightBytes = Math.max(st.maxInflightBytes, st.inflightBytes);
      const overInflight = st.inflightBytes > cfg.inflightLimit;
      await sleep(10 + (total / 1e6) * cfg.msPerMB);
      const fault = cfg.faults.length ? cfg.faults.shift() : null;
      const done = () => { st.inflight--; st.inflightBytes -= total; };
      const commit = () => rows.forEach(r => db.layers.push(Object.assign({}, r, { id: idL++, layer_sha: typeof r.layer_data === 'string' ? sha(r.layer_data) : null })));
      try {
        if (fault === 'gw502commit') { commit(); rec.result = 'gw502 (escrito)'; return route.fulfill({ status: 502, headers: cors, contentType: 'text/html', body: '<html>Bad gateway</html>' }); }
        if (fault === 'abortcommit') { commit(); rec.result = 'corte (escrito)'; return route.abort('connectionreset'); }
        if (fault === 'gw502') { rec.result = 'gw502'; return route.fulfill({ status: 502, headers: cors, contentType: 'text/html', body: '<html>Bad gateway</html>' }); }
        if (fault === 'abort') { rec.result = 'corte'; return route.abort('connectionreset'); }
        if (fault === 'forbid') { rec.result = '403'; return json(route, 403, { code: '42501', details: null, hint: null, message: 'new row violates row-level security policy for table "panel_layers"' }); }
        if (fault === 'timeout' || total > cfg.stmtLimit || overInflight) { rec.result = '57014'; return json(route, 500, T57014); }
        commit(); rec.result = 'ok';
        return empty(route, 201);
      } finally { done(); }
    }
    return empty(route, 201);
  }
  // Foto del estado: por hoja (orden) → lista de «orden:sha corto» de sus capas, ordenada; y duplicados.
  function snapshot() {
    const byPanel = {};
    db.panels.slice().sort((a, b) => a.panel_order - b.panel_order).forEach(p => { byPanel[p.panel_order] = db.layers.filter(l => l.panel_id === p.id).map(l => l.layer_order + ':' + (l.layer_sha || '').slice(0, 8)).sort(); });
    const dups = []; db.panels.forEach(p => { const seen = new Set(); db.layers.filter(l => l.panel_id === p.id).forEach(l => { if (seen.has(l.layer_order)) dups.push(p.panel_order + '/' + l.layer_order); seen.add(l.layer_order); }); });
    return { byPanel, dups, panels: db.panels.length, layers: db.layers.length, bytes: db.layers.reduce((n, l) => n + bytes(l), 0) };
  }
  return { cfg, db, st, handler, snapshot, sha };
}
module.exports = { mkCloud, sleep };
