// Migración de capas pesadas a R2 (v42.48): la app REAL (Chromium) contra una Supabase simulada con las funciones admin_xr_scan /
// admin_xr_swap + el Worker REAL (Miniflare, R2 simulado).
//   APP_URL=http://127.0.0.1:8768/ NODE_PATH=$(npm root -g) node mig_test.mjs [escenario…]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { mkMigCloud, sleep } = require('./mig_emu.js');
const APP = process.env.APP_URL || 'http://127.0.0.1:8768/';
const WORKER_SRC = process.env.WORKER_SRC || '/tmp/t4246/comxow-storage-worker.js';
let fails = 0, passes = 0;
const ok = (c, m, extra) => { if (c) passes++; else fails++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const SUB = '00000000-0000-4000-8000-000000000001';     // «admin»
const A2 = '00000000-0000-4000-8000-000000000002';      // «Macario»
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64u({ alg: 'HS256' }) + '.' + b64u({ sub: SUB, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 }) + '.f';
const KB = 1024, REF = /^r2:([0-9a-f]{64}):(\d+)$/;

function mkWorker() {
  return new Miniflare({
    modules: true, script: readFileSync(WORKER_SRC, 'utf8'), compatibilityDate: '2024-09-23', r2Buckets: ['COMXOW_BUCKET'],
    bindings: { MODO_MANTENIMIENTO: 'FALSO' },
    outboundService: async (req) => {
      if (req.url.startsWith('https://qqgsbyylaugsagbxsetc.supabase.co/auth/v1/user')) {
        return (req.headers.get('authorization') === 'Bearer ' + JWT) ? Response.json({ id: SUB }) : new Response('{"msg":"invalid"}', { status: 401 });
      }
      return new Response('unexpected ' + req.url, { status: 500 });
    },
  });
}
function blobRoute(mf, ctl) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  return async route => {
    const req = route.request(), url = new URL(req.url()), m = req.method();
    if (!url.pathname.startsWith('/blobs/')) return route.abort();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const h = url.pathname.slice(7);
    ctl.counts[m] = (ctl.counts[m] || 0) + 1;
    (ctl[m.toLowerCase()] || (ctl[m.toLowerCase()] = [])).push(h);
    if (ctl.down) return route.abort('connectionrefused');
    const f = (m === 'PUT' && ctl.faults.length) ? ctl.faults.shift() : null;
    if (f === 'abort') return route.abort('connectionreset');
    if (f === '503') return route.fulfill({ status: 503, headers: cors, contentType: 'application/json', body: '{"ok":false,"error":"busy"}' });
    const body = req.postDataBuffer();
    const hd = Object.assign({}, req.headers(), { origin: 'https://comxow.com' }); delete hd['host']; delete hd['content-length'];
    if (body) hd['content-length'] = String(body.length);
    const r = await mf.dispatchFetch('http://worker.test' + url.pathname, { method: m, headers: hd, body: body && body.length ? body : undefined });
    const buf = Buffer.from(await r.arrayBuffer());
    const out = {}; r.headers.forEach((v, k) => { out[k] = v; });
    Object.assign(out, { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' });
    return route.fulfill({ status: r.status, headers: out, body: buf });
  };
}

async function helpers(page) {
  await page.evaluate(() => {
    window.__refreshes = 0;
    window._authTryRefresh = async () => { window.__refreshes++; };
    window.__origs = {};
    window.__rnd = (kb, seed) => {
      let a = seed >>> 0; const nx = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const n = Math.ceil(kb * 1024 * 3 / 4); const u = new Uint8Array(n);
      for (let i = 0; i < n; i++) u[i] = (nx() * 256) | 0;
      let s = ''; for (let i = 0; i < n; i += 3072) { let b = ''; const e = Math.min(n, i + 3072); for (let j = i; j < e; j++) b += String.fromCharCode(u[j]); s += btoa(b); }
      return s.slice(0, Math.floor(kb * 1024));
    };
    window.__mkLayer = (d, seed) => d.small
      ? { type: 'shape', x: 0.1, y: 0.2, width: 0.1, height: 0.1, kind: 'rect', fill: '#ffffff', _t: d.tag || seed }
      : { type: 'stroke', x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1, src: 'data:image/png;base64,' + window.__rnd(d.kb, d.seed || seed), _t: d.tag || seed };
    // Crea una obra en la nube (modo de siempre: capas EN LÍNEA, como las que hay hoy en Supabase)
    window.__seed = async (id, title, spec, seedBase) => {
      window.__comic = { id: 'c-' + id, supabaseId: id, title, author: 'A', userId: null, genre: '', navMode: 'fixed', social: '', panels: [], coverDataUrl: null,
        editorData: { _rules: [], _palette: [], pages: spec.map((ls, pi) => ({ orientation: 'vertical', textMode: 'sequential', texts: [], layers: ls.map((d, li) => window.__mkLayer(d, (seedBase || 0) + 1000 * pi + li + 1)) })) } };
      window.__origs[id] = JSON.parse(JSON.stringify(window.__comic.editorData.pages.map(p => p.layers)));
      try { await SupabaseClient.saveDraft(window.__comic, null, () => {}, () => {}, () => {}); return { ok: true, last: window._sbLastSave }; }
      catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
    };
    window.__upload = async dirty => {
      try { await SupabaseClient.saveDraft(window.__comic, dirty === undefined ? null : dirty, () => {}, () => {}, () => {}); return { ok: true, last: window._sbLastSave }; }
      catch (e) { return { ok: false, error: String((e && e.message) || e), last: window._sbLastSave }; }
    };
    // «Editar desde la nube»: descarga la obra y compara con lo que se subió
    window.__rt = async id => {
      try {
        const r = await SupabaseClient.downloadDraftAsEditorData(id);
        const got = r.editorData.pages.map(p => p.layers);
        return { ok: true, same: JSON.stringify(got) === JSON.stringify(window.__origs[id]), trace: window._sbLastDownloadTrace, editorData: r.editorData };
      } catch (e) { return { ok: false, error: String((e && e.message) || e), trace: window._sbLastDownloadTrace }; }
    };
    // Lanza la migración con un progreso mínimo y devuelve el informe
    window.__mig = async (mode, opts) => {
      opts = opts || {};
      const sc = await SupabaseClient.xr.migScan({ min: 32768, ref: true });
      let items = sc.rows.filter(r => !r.ref);
      if (opts.limit) items = items.slice(0, opts.limit);
      const ctl = new AbortController(); window.__ctl = ctl;
      const log = [];
      try {
        const rep = await SupabaseClient.xr.migRun({ items, mode, confirm: mode === 'real', signal: ctl.signal, par: opts.par || 2,
          onProgress: st => { log.push(st.done); if (opts.abortAt && st.done >= opts.abortAt) ctl.abort(); } });
        return { ok: true, rep: JSON.parse(JSON.stringify(rep)), items: items.length, info: SupabaseClient.xr.migInfo() };
      } catch (e) { return { ok: false, error: String((e && e.message) || e), code: e && e.code, info: SupabaseClient.xr.migInfo() }; }
    };
  });
}

async function launch(emu, mf, ctl, opts) {
  opts = opts || {};
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
  await ctx.route(/supabase\.co/, emu.handler);
  await ctx.route(/comxow-storage-worker\.albertobicho\.workers\.dev/, blobRoute(mf, ctl));
  await ctx.route(/googleapis|gstatic|jsdelivr/, r => r.abort());
  await ctx.addInitScript(([sub, token, scale, lang]) => {
    try {
      if (!localStorage.getItem('__init')) {
        localStorage.setItem('__init', '1');
        localStorage.setItem('cs_session', JSON.stringify({ id: sub, username: 'admin', email: 'a@example.com', role: 'admin', token }));
        localStorage.setItem('cx_visited', '1'); localStorage.setItem('cx_terms_accepted_v1', '1'); localStorage.setItem('cs_lang', lang);
      }
      window._sbLySleepScale = scale;     // solo pruebas: acorta las esperas de reintento
    } catch (e) {}
  }, [SUB, JWT, opts.sleepScale == null ? 0.02 : opts.sleepScale, opts.lang || 'es']);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(APP);
  await page.waitForFunction(() => typeof SupabaseClient !== 'undefined' && typeof SupabaseClient.saveDraft === 'function', null, { timeout: 20000 });
  await helpers(page);
  return { browser, ctx, page, errs };
}

async function reloadPage(page) {
  const origs = await page.evaluate(() => window.__origs);
  await page.reload();
  await page.waitForFunction(() => typeof SupabaseClient !== 'undefined' && typeof SupabaseClient.saveDraft === 'function', null, { timeout: 20000 });
  await helpers(page);
  await page.evaluate(o => { window.__origs = o; }, origs);
}

const specW1 = () => [
  [{ kb: 1000 }, { kb: 1000 }, { small: true }, { small: true }, { kb: 20 }],        // 2 pesadas, 1 de 20 KB (bajo el umbral), 2 pequeñas
  [{ kb: 2200 }, { small: true }, { kb: 40 }],                                          // 1 muy pesada y 1 de 40 KB
  Array.from({ length: 6 }, () => ({ small: true })),                                   // solo pequeñas
];
const specW2 = () => [[{ kb: 300 }, { kb: 64 }, { small: true }, { kb: 35 }, { kb: 31 }]];   // 300, 64, 35 pesadas; 31 KB bajo el umbral
const HEAVY = 7;   // 1000, 1000, 2200, 40 (W1) + 300, 64, 35 (W2)

// Siembra W1 (admin) y W2 (Macario) en modo de siempre y devuelve la foto inicial de las capas pesadas
async function seed(page, emu) {
  emu.mig.authors.set(SUB, { username: 'admin', role: 'admin' });
  emu.mig.authors.set(A2, { username: 'Macario', role: 'user' });
  let r = await page.evaluate(spec => window.__seed('W1', 'Obra uno', spec, 0), specW1());
  if (!r.ok) throw new Error('siembra W1: ' + r.error);
  r = await page.evaluate(spec => window.__seed('W2', 'Obra dos', spec, 50000), specW2());
  if (!r.ok) throw new Error('siembra W2: ' + r.error);
  emu.db.works.get('W1').author_id = SUB; emu.db.works.get('W2').author_id = A2; emu.db.works.get('W2').published = true;     // (author_id lo pone la base de verdad con auth.uid(); la simulación no)
  for (const p of emu.db.panels) { if (p.work_id === 'W1' && p.panel_order === 1) p.nav = { to: [3] }; if (p.work_id === 'W2') p.nav = { to: [1] }; }
  const heavy = emu.db.layers.filter(l => Buffer.byteLength(l.layer_data) >= 32768);
  return { heavy: new Map(heavy.map(l => [String(l.id), l.layer_data])), n: heavy.length };
}
const dbHeavyInline = emu => emu.db.layers.filter(l => Buffer.byteLength(l.layer_data) >= 32768).length;
const dbRefs = emu => emu.db.layers.filter(l => REF.test(l.layer_data));
async function blobsOk(mf, refs, original) {
  const bucket = await mf.getR2Bucket('COMXOW_BUCKET');
  let present = 0, exact = 0;
  for (const l of refs) {
    const m = REF.exec(l.layer_data), o = await bucket.get('blobs/' + m[1]);
    if (!o) continue; present++;
    const txt = await o.text();
    if (sha(txt) === m[1] && Buffer.byteLength(txt) === +m[2] && (!original || original.get(String(l.id)) === txt)) exact++;
  }
  return { present, exact };
}

const SCEN = {};

// ── 1 · SCAN: lista, orden, autores, puerta de administrador, función ausente y paginación ───────────────────────────────────
SCEN.scan = async () => {
  console.log('=== scan: lista, puerta «admin», función ausente, paginación');
  const emu = mkMigCloud({}, SUB), mf = mkWorker(), ctl = { counts: {}, faults: [] };
  const { browser, page, errs } = await launch(emu, mf, ctl);
  try {
    const s = await seed(page, emu);
    ok(s.n === HEAVY, `la siembra deja ${HEAVY} capas pesadas dentro de la base (modo de siempre)`, s.n);
    let sc = await page.evaluate(() => SupabaseClient.xr.migScan({ min: 32768, ref: true }).then(r => ({ ok: true, r }), e => ({ ok: false, code: e.code, msg: e.message })));
    ok(sc.ok && sc.r.rows.length === HEAVY, `migScan devuelve las ${HEAVY} capas pesadas`, sc.ok ? sc.r.rows.length : sc);
    const rows = sc.r.rows;
    ok(rows.every((x, i) => i === 0 || rows[i - 1].bytes >= x.bytes), 'de mayor a menor peso', rows.map(x => x.bytes));
    ok(rows[0].bytes > 2200 * KB && rows[0].title === 'Obra uno' && rows[0].author === 'admin' && rows[0].pub === false, 'trae título, autor y estado de la capa más pesada', rows[0]);
    const w2 = rows.filter(x => x.work === 'W2');
    ok(w2.length === 3 && w2.every(x => x.author === 'Macario' && x.pub === true), 'las de la obra de otra cuenta salen con SU autor y publicada', w2.map(x => x.author));
    ok(rows.every(x => !x.ref), 'ninguna es referencia todavía');
    const sc2 = await page.evaluate(() => SupabaseClient.xr.migScan({ min: 1, ref: false }).then(r => r.rows.length));
    ok(sc2 >= HEAVY && sc2 <= HEAVY + 4 + 1, 'p_min tiene un suelo de 1 KB (con min = 1 salen también las de 20 y 31 KB, nunca las minúsculas)', sc2);
    // paginación: 1.200 capas falsas de 1,1 KB → tres páginas de 500
    for (let i = 0; i < 1200; i++) emu.db.layers.push({ id: 'F' + String(i).padStart(5, '0'), panel_id: emu.db.panels[0].id, layer_order: 100 + i, layer_type: 'stroke', layer_data: 'x'.repeat(1100) + i, layer_sha: 'x' });
    emu.mig.rpc.length = 0;
    const big = await page.evaluate(() => SupabaseClient.xr.migScan({ min: 1024, ref: false }).then(r => ({ n: r.rows.length, ids: new Set(r.rows.map(x => x.id)).size })));
    ok(big.n >= 1200 + HEAVY && big.ids === big.n, 'con más de 1.000 filas se pagina sin perder ni repetir ninguna', big);
    ok(emu.mig.rpc.filter(x => x.fn === 'admin_xr_scan').length === 3, 'en tres peticiones de 500', emu.mig.rpc.map(x => x.fn + ':' + x.n));
    emu.db.layers = emu.db.layers.filter(l => !String(l.id).startsWith('F'));
    // puerta de administrador
    emu.mig.rpc.length = 0; emu.mig.authors.get(SUB).role = 'user';
    sc = await page.evaluate(() => SupabaseClient.xr.migScan({ min: 32768 }).then(r => ({ ok: true }), e => ({ ok: false, code: e.code, msg: e.message })));
    ok(!sc.ok && sc.code === 'forbidden', 'una cuenta que no es «admin» recibe forbidden', sc);
    ok(emu.mig.rpc.length === 1, 'y no se reintenta', emu.mig.rpc.length);
    emu.mig.authors.get(SUB).role = 'admin';
    // función no instalada
    emu.mig.noSql = true;
    sc = await page.evaluate(() => SupabaseClient.xr.migScan({ min: 32768 }).then(r => ({ ok: true }), e => ({ ok: false, code: e.code, msg: e.message })));
    ok(!sc.ok && sc.code === 'missing', 'sin las funciones SQL: missing (404)', sc);
    emu.mig.noSql = false;
    // token caducado una vez: se renueva y sigue
    emu.mig.faults.scan.push('401');
    const refs0 = await page.evaluate(() => window.__refreshes);
    sc = await page.evaluate(() => SupabaseClient.xr.migScan({ min: 32768 }).then(r => ({ ok: true, n: r.rows.length }), e => ({ ok: false, code: e.code })));
    ok(sc.ok && sc.n === HEAVY, 'un 401 puntual renueva la sesión una vez y la consulta sigue', sc);
    ok((await page.evaluate(() => window.__refreshes)) > refs0, 'y se pidió renovar el token');
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await browser.close(); await mf.dispose(); }
};

// ── 2 · SIMULACRO y después REAL: nada se pierde, lo del simulacro se reutiliza, las referencias son exactas ───────────────────
SCEN.simreal = async () => {
  console.log('=== simreal: simulacro (no toca la base) → real (sin volver a bajar) → Editar idéntico');
  const emu = mkMigCloud({}, SUB), mf = mkWorker(), ctl = { counts: {}, faults: [] };
  const { browser, page, errs } = await launch(emu, mf, ctl);
  try {
    const s = await seed(page, emu);
    const before = JSON.stringify(emu.db.layers.map(l => [l.id, l.layer_data]));
    // — simulacro
    let r = await page.evaluate(() => window.__mig('sim'));
    ok(r.ok && r.rep.ready === HEAVY && r.rep.swapped === 0 && r.rep.failed === 0 && !r.rep.stoppedBy, `simulacro: ${HEAVY} capas preparadas en R2, 0 cambiadas, 0 errores`, r.rep || r);
    ok(JSON.stringify(emu.db.layers.map(l => [l.id, l.layer_data])) === before, 'la base queda BYTE A BYTE igual');
    ok(!emu.mig.rpc.some(x => x.fn === 'admin_xr_swap'), 'ni se llamó a admin_xr_swap');
    ok(emu.mig.getLayer.length === HEAVY, `se bajó el texto de las ${HEAVY} capas, una vez cada una`, emu.mig.getLayer.length);
    const bk = await blobsOk(mf, [...s.heavy.entries()].map(([id, txt]) => ({ id, layer_data: 'r2:' + sha(txt) + ':' + Buffer.byteLength(txt) })), s.heavy);
    ok(bk.present === HEAVY && bk.exact === HEAVY, 'R2 tiene los 7 archivos, con su SHA-256, su tamaño y el MISMO texto que la base', bk);
    ok(r.info.n === HEAVY, 'el manifiesto apunta las 7 como subidas', r.info);
    ok((await page.evaluate(() => SupabaseClient.xr.migInfo())).n === HEAVY, '(tras recargar la página el manifiesto sigue ahí)');
    // real sin confirmar
    await reloadPage(page);       // otra sesión del navegador: la memoria de «archivos ya vistos» se pierde, el manifiesto (localStorage) no
    const rc = await page.evaluate(async () => { try { await SupabaseClient.xr.migRun({ items: [], mode: 'real' }); return 'sin error'; } catch (e) { return e.code + ' ' + e.message; } });
    ok(/^bad /.test(rc), 'el modo real sin confirm:true se rechaza', rc);
    // — real
    emu.mig.getLayer.length = 0; ctl.counts = {}; emu.mig.navLog.length = 0;
    r = await page.evaluate(() => window.__mig('real'));
    ok(r.ok && r.rep.swapped === HEAVY && r.rep.fromManifest === HEAVY && r.rep.putN === 0 && r.rep.failed === 0 && !r.rep.stoppedBy, 'real: 7 cambiadas, todas desde el manifiesto, 0 subidas nuevas, 0 errores', r.rep || r);
    ok(emu.mig.getLayer.length === 0, 'NO se bajó nada más de Supabase (el simulacro ya lo había hecho)', emu.mig.getLayer.length);
    ok((ctl.counts.PUT || 0) === 0 && (ctl.counts.HEAD || 0) >= HEAVY, 'a R2 solo se le pregunta (HEAD) por cada archivo antes de cambiar la base', ctl.counts);
    const refs = dbRefs(emu);
    ok(refs.length === HEAVY && dbHeavyInline(emu) === 0, 'en la base: 7 referencias y ninguna capa pesada en línea', refs.length);
    ok(refs.every(l => l.layer_sha === sha(l.layer_data)), 'layer_sha de cada fila es la huella de la referencia');
    ok(refs.every(l => l.layer_data.length === 3 + 64 + 1 + String(Buffer.byteLength(s.heavy.get(String(l.id)))).length), 'y las referencias miden lo que debe');
    const bk2 = await blobsOk(mf, refs, s.heavy);
    ok(bk2.present === HEAVY && bk2.exact === HEAVY, 'cada referencia apunta a un archivo que contiene EXACTAMENTE el texto original', bk2);
    ok(emu.mig.navLog.length === HEAVY && emu.mig.navLog.every(n => (n.antes == null && n.despues == null) || JSON.stringify(n.antes) === JSON.stringify(n.despues)), 'el resumen de navegación (nav) de cada hoja se conserva', emu.mig.navLog.slice(0, 2));
    ok(r.info.n === 0, 'el manifiesto queda vacío', r.info);
    // — Editar desde la nube: idéntico
    const rt1 = await page.evaluate(() => window.__rt('W1')), rt2 = await page.evaluate(() => window.__rt('W2'));
    ok(rt1.ok && rt1.same, 'Editar W1: todas las capas vuelven idénticas', rt1.error);
    ok(rt2.ok && rt2.same, 'Editar W2: todas las capas vuelven idénticas', rt2.error);
    ok(rt1.trace && rt1.trace.r2 && rt1.trace.r2.capas === 4 && rt2.trace.r2.capas === 3, 'y se bajaron de R2: 4 + 3 capas', [rt1.trace && rt1.trace.r2, rt2.trace && rt2.trace.r2]);
    // — repetir: nada que hacer y sin daño
    const sc = await page.evaluate(() => SupabaseClient.xr.migScan({ min: 32768, ref: true }).then(x => ({ inline: x.rows.filter(y => !y.ref).length, refs: x.rows.filter(y => y.ref).length })));
    ok(sc.inline === 0 && sc.refs === HEAVY, 'un nuevo scan: 0 pesadas en línea, 7 referencias', sc);
    const stale = [...s.heavy.keys()];
    const r2 = await page.evaluate(async ids => {
      const items = ids.map(id => ({ id, bytes: 100000, title: 't', type: 'stroke', lo: 0 }));
      return JSON.parse(JSON.stringify(await SupabaseClient.xr.migRun({ items, mode: 'real', confirm: true })));
    }, stale);
    ok(r2.swapped === 0 && r2.skipped.already === HEAVY && r2.failed === 0, 'repetir con la lista vieja: las 7 salen «ya eran referencia», sin errores ni subidas', r2);
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await browser.close(); await mf.dispose(); }
};

// ── 3 · CARRERAS: la capa cambia, desaparece o ya no mide lo que decía el scan ─────────────────────────────────────────────
SCEN.race = async () => {
  console.log('=== race: capa cambiada a mitad, desaparecida, con otro tamaño');
  const emu = mkMigCloud({}, SUB), mf = mkWorker(), ctl = { counts: {}, faults: [] };
  const { browser, page, errs } = await launch(emu, mf, ctl);
  try {
    const s = await seed(page, emu);
    const sc = await page.evaluate(() => SupabaseClient.xr.migScan({ min: 32768 }).then(x => x.rows));
    const [a, b, c] = [sc[0], sc[2], sc[4]];         // tres capas distintas
    // a) cambia JUSTO después de bajarla (mismo tamaño, otro contenido) → el swap la rechaza ('changed')
    const orig = new Map(emu.db.layers.map(l => [String(l.id), l.layer_data]));
    emu.mig.onLayerServed = (id, db) => {
      if (id === String(a.id)) { const l = db.layers.find(x => String(x.id) === id); l.layer_data = l.layer_data.slice(0, -4) + 'ZZZZ'; l.layer_sha = sha(l.layer_data); }
    };
    // b) desaparece antes de bajarla (el autor guardó la obra)
    emu.db.layers = emu.db.layers.filter(l => String(l.id) !== String(b.id));
    // c) cambia de tamaño entre el scan y la descarga
    const lc = emu.db.layers.find(x => String(x.id) === String(c.id)); lc.layer_data = lc.layer_data + 'MAS'; lc.layer_sha = sha(lc.layer_data);
    const r = await page.evaluate(items => SupabaseClient.xr.migRun({ items, mode: 'real', confirm: true }).then(x => JSON.parse(JSON.stringify(x))), sc);
    ok(r.swapped === HEAVY - 3 && r.skipped.changed === 2 && r.skipped.gone === 1 && r.failed === 0 && !r.stoppedBy, 'real: 4 cambiadas · 2 «habían cambiado» · 1 «ya no existía» · 0 errores', r);
    const la = emu.db.layers.find(x => String(x.id) === String(a.id)), lcc = emu.db.layers.find(x => String(x.id) === String(c.id));
    ok(la && !REF.test(la.layer_data) && la.layer_data.endsWith('ZZZZ'), 'a) la capa cambiada a mitad CONSERVA su texto nuevo (la base se negó a sustituirla)');
    ok(lcc && !REF.test(lcc.layer_data) && lcc.layer_data.endsWith('MAS'), 'c) la que cambió de tamaño tampoco se toca (y ni siquiera se subió a R2)');
    ok(ctl.counts.PUT === HEAVY - 2 + 0 || ctl.counts.PUT === HEAVY - 2, 'solo se subieron a R2 las que llegaron a hash: 4 + la «cambiada a mitad» (5 en total)', ctl.counts);
    const okRefs = dbRefs(emu);
    ok(okRefs.length === HEAVY - 3, 'el resto (4) son referencias', okRefs.length);
    const bk = await blobsOk(mf, okRefs, orig);
    ok(bk.present === okRefs.length && bk.exact === okRefs.length, 'y sus archivos son exactos', bk);
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await browser.close(); await mf.dispose(); }
};

// ── 4 · RESISTENCIA: R2 caído, parar y seguir, fallos de red/pasarela en el swap, cuenta sin permiso, cuota ─────────────────────
SCEN.resilience = async () => {
  console.log('=== resilience: R2 caído y reanudar · cancelar · swap con 502/corte · sin permiso · cuota');
  const emu = mkMigCloud({}, SUB), mf = mkWorker(), ctl = { counts: {}, faults: [] };
  const { browser, page, errs } = await launch(emu, mf, ctl);
  try {
    const s = await seed(page, emu);
    // a) R2 caído: tras 5 errores seguidos se para; la base no se toca
    ctl.down = true;
    let r = await page.evaluate(() => window.__mig('real'));
    ok(r.ok && r.rep.stoppedBy === 'fails' && r.rep.swapped === 0 && r.rep.failed >= 5 && r.rep.failed <= 6, 'R2 caído: se para tras 5 errores seguidos y no se cambia NADA', r.rep || r);
    ok(dbRefs(emu).length === 0 && dbHeavyInline(emu) === HEAVY, 'la base conserva las 7 capas en línea', dbHeavyInline(emu));
    ok(r.rep.errs.length > 0 && /R2|Failed|fetch|network|load/i.test(r.rep.errs[0]), 'y el informe da el motivo', r.rep.errs.slice(0, 2));
    // b) R2 vuelve: se reanuda y termina todo
    ctl.down = false;
    r = await page.evaluate(() => window.__mig('real'));
    ok(r.ok && r.rep.swapped === HEAVY && r.rep.failed === 0 && !r.rep.stoppedBy, 'R2 vuelve: la repetición termina las 7', r.rep || r);
    // c) cancelar a mitad y reanudar
    emu.db.layers.forEach(l => { const o = s.heavy.get(String(l.id)); if (o) { l.layer_data = o; l.layer_sha = sha(o); } });   // deshace la migración para repetir
    ok(dbHeavyInline(emu) === HEAVY, '(se restauran las 7 capas en línea para la siguiente prueba)');
    r = await page.evaluate(() => window.__mig('real', { abortAt: 3, par: 1 }));
    ok(r.ok && r.rep.stoppedBy === 'cancel' && r.rep.swapped >= 2 && r.rep.swapped < HEAVY, 'cancelar: para sin terminar (' + (r.rep && r.rep.swapped) + ' cambiadas)', r.rep || r);
    const mid = dbRefs(emu).length;
    ok(mid === r.rep.swapped, 'las cambiadas son exactamente las que dice el informe', [mid, r.rep.swapped]);
    ok(dbRefs(emu).every(l => REF.test(l.layer_data)) && dbHeavyInline(emu) === HEAVY - mid, 'las demás siguen en línea, intactas', dbHeavyInline(emu));
    r = await page.evaluate(() => window.__mig('real'));
    ok(r.ok && r.rep.swapped === HEAVY - mid && r.rep.skipped.already === 0 && !r.rep.stoppedBy, 'reanudar: solo quedaban ' + (HEAVY - mid) + ' y las hace (el scan ya no lista las hechas)', r.rep || r);
    ok(dbRefs(emu).length === HEAVY, 'total: 7 referencias');
    // d) 502 de la pasarela en el swap: se reintenta y no falla
    emu.db.layers.forEach(l => { const o = s.heavy.get(String(l.id)); if (o) { l.layer_data = o; l.layer_sha = sha(o); } });
    emu.mig.faults.swap.push('gw502', 'abort'); emu.mig.rpc.length = 0;
    r = await page.evaluate(() => window.__mig('real', { par: 1 }));
    const swapCalls = emu.mig.rpc.filter(x => x.fn === 'admin_xr_swap');
    ok(r.ok && r.rep.swapped === HEAVY && r.rep.failed === 0, 'swap con un 502 y un corte de red: se reintenta y las 7 salen bien', r.rep || r);
    ok(swapCalls.length === HEAVY + 2, 'exactamente 2 llamadas de más', swapCalls.length);
    // e) cuenta sin permiso: se para a la primera y no cambia nada
    emu.db.layers.forEach(l => { const o = s.heavy.get(String(l.id)); if (o) { l.layer_data = o; l.layer_sha = sha(o); } });
    emu.mig.authors.get(SUB).role = 'user';
    r = await page.evaluate(async () => {
      const items = (await SupabaseClient.xr.migScan({ min: 32768 }).catch(() => ({ rows: [] }))).rows;
      return items.length;
    });
    ok(r === 0, 'sin permiso el scan ya no lista nada');
    const manual = [...s.heavy.keys()].map(id => ({ id, bytes: Buffer.byteLength(s.heavy.get(id)), title: 't', type: 'stroke', lo: 0 }));
    const rf = await page.evaluate(items => SupabaseClient.xr.migRun({ items, mode: 'real', confirm: true, par: 1 }).then(x => JSON.parse(JSON.stringify(x))), manual);
    ok(rf.stoppedBy === 'forbidden' && rf.swapped === 0 && rf.done <= 1, 'sin permiso: se para a la primera (forbidden) y no cambia nada', rf);
    ok(dbHeavyInline(emu) === HEAVY, 'la base sigue con las 7 en línea');
    emu.mig.authors.get(SUB).role = 'admin';
    // f) cuota de Supabase (402) al bajar una capa
    await page.evaluate(() => SupabaseClient.xr.migClear());      // (el fallo anterior dejó apuntada una capa subida: aquí se parte de cero)
    emu.mig.getFaults = ['402'];
    const rq = await page.evaluate(items => SupabaseClient.xr.migRun({ items, mode: 'real', confirm: true, par: 1 }).then(x => JSON.parse(JSON.stringify(x))), manual);
    ok(rq.stoppedBy === 'quota' && rq.swapped === 0, 'cuota superada (402): se para con «quota»', rq);
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await browser.close(); await mf.dispose(); }
};

// ── 5 · COMPROBACIÓN FINAL: rápida y a fondo, archivo que falta, archivo dañado, referencia mal formada ─────────────────────────
SCEN.verify = async () => {
  console.log('=== verify: todo en R2 · falta un archivo · archivo dañado · referencia mal formada');
  const emu = mkMigCloud({}, SUB), mf = mkWorker(), ctl = { counts: {}, faults: [] };
  const { browser, page, errs } = await launch(emu, mf, ctl);
  try {
    const s = await seed(page, emu);
    let r = await page.evaluate(() => window.__mig('real'));
    ok(r.ok && r.rep.swapped === HEAVY, 'migración completa previa', r.rep || r);
    let v = await page.evaluate(() => SupabaseClient.xr.migVerify({ deep: false }));
    ok(v.ok && v.rows === HEAVY && v.blobs === HEAVY && v.found === HEAVY && v.inlineN === 0, 'rápida: 7 referencias → 7 archivos, todos presentes, 0 pesadas en línea', v);
    ctl.counts = {};
    v = await page.evaluate(() => SupabaseClient.xr.migVerify({ deep: true }));
    ok(v.ok && v.found === HEAVY, 'a fondo: ok', v);
    const total = [...s.heavy.values()].reduce((n, t) => n + Buffer.byteLength(t), 0);
    ok(Math.abs(v.checkedKB - Math.round(total / 1024)) <= HEAVY, 'a fondo: se leyeron todos los bytes (' + v.checkedKB + ' KB)', [v.checkedKB, Math.round(total / 1024)]);
    ok(ctl.counts.GET === HEAVY, 'a fondo: un GET por archivo distinto', ctl.counts);
    // falta un archivo
    const bucket = await mf.getR2Bucket('COMXOW_BUCKET');
    const refs = dbRefs(emu), m0 = REF.exec(refs[0].layer_data), m1 = REF.exec(refs[1].layer_data);
    await bucket.delete('blobs/' + m0[1]);
    v = await page.evaluate(() => SupabaseClient.xr.migVerify({ deep: false }));
    ok(!v.ok && v.missing.length === 1 && v.missing[0].sha === m0[1].slice(0, 12) && v.found === HEAVY - 1, 'falta un archivo: lo detecta (missing) con su huella y obra', v.missing);
    // archivo dañado (mismo nombre, otro contenido)
    await bucket.put('blobs/' + m1[1], 'CONTENIDO QUE NO ES');
    v = await page.evaluate(() => SupabaseClient.xr.migVerify({ deep: false }));
    ok(!v.ok && v.bad.length === 0, 'rápida no ve el daño (solo comprueba que existe)', v.bad);
    v = await page.evaluate(() => SupabaseClient.xr.migVerify({ deep: true }));
    ok(!v.ok && v.bad.length === 1 && /tamaño|hash/.test(v.bad[0].why) && v.missing.length === 1, 'a fondo sí detecta el archivo dañado (tamaño u hash)', v.bad);
    // referencia mal formada
    const l0 = emu.db.layers.find(l => String(l.id) === String(refs[2].id)); l0.layer_data = 'r2:zzzz:10';
    v = await page.evaluate(() => SupabaseClient.xr.migVerify({ deep: false }));
    ok(v.malformed.length === 1 && v.malformed[0].ref === 'r2:zzzz:10', 'una referencia mal formada se señala', v.malformed);
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await browser.close(); await mf.dispose(); }
};

// ── 6 · GUARDAR DESPUÉS DE MIGRAR: un dispositivo con el interruptor APAGADO no deshace la migración ─────────────────────────
SCEN.delta = async () => {
  console.log('=== delta: guardar tras migrar con el interruptor apagado / encendido');
  const emu = mkMigCloud({}, SUB), mf = mkWorker(), ctl = { counts: {}, faults: [] };
  let b = await launch(emu, mf, ctl);
  try {
    const s = await seed(b.page, emu);
    const r = await b.page.evaluate(() => window.__mig('real'));
    ok(r.ok && r.rep.swapped === HEAVY, 'migración completa previa', r.rep || r);
    const origs = await b.page.evaluate(() => window.__origs);
    await b.browser.close();
    // Sesión nueva, interruptor APAGADO: se abre la obra desde la nube (las capas llegan EN LÍNEA) y se guarda sin tocar nada
    b = await launch(emu, mf, ctl);
    await b.page.evaluate(o => { window.__origs = o; }, origs);
    let rt = await b.page.evaluate(() => window.__rt('W1').then(x => { window.__comic = { id: 'c', supabaseId: 'W1', title: 'Obra uno', author: 'A', userId: null, genre: '', navMode: 'fixed', social: '', panels: [], coverDataUrl: null, editorData: x.editorData }; return { ok: x.ok, same: x.same }; }));
    ok(rt.ok && rt.same, 'Editar desde la nube con las capas en R2: idéntico a lo sembrado');
    const idsBefore = emu.db.layers.map(l => String(l.id)).sort().join(','), posts0 = emu.st.layerPosts.length, dels0 = emu.st.deletes.length;
    ctl.counts = {};
    let u = await b.page.evaluate(() => window.__upload([0, 1, 2]));
    ok(u.ok, 'guardar (interruptor apagado) termina bien', u.error);
    ok(emu.st.layerPosts.length === posts0, 'NO se envía ninguna capa a la base (antes de esta versión habría re-metido las pesadas en línea)', emu.st.layerPosts.slice(posts0));
    ok(emu.db.layers.map(l => String(l.id)).sort().join(',') === idsBefore, 'las filas son las mismas (mismos ids): no se borró ni se reinsertó nada', emu.st.deletes.slice(dels0));
    ok(dbRefs(emu).length === HEAVY && dbHeavyInline(emu) === 0, 'las 7 referencias siguen siendo referencias');
    ok(!ctl.counts.PUT, 'y no se subió nada a R2', ctl.counts);
    // Se cambia UNA capa pesada (hoja 1) y se guarda con el interruptor apagado: solo esa vuelve en línea
    await b.page.evaluate(() => { const l = window.__comic.editorData.pages[1].layers[0]; l.src = 'data:image/png;base64,' + window.__rnd(2200, 424242); window.__origs.W1 = JSON.parse(JSON.stringify(window.__comic.editorData.pages.map(p => p.layers))); });
    const posts1 = emu.st.layerPosts.length;
    u = await b.page.evaluate(() => window.__upload([1]));
    ok(u.ok, 'guardar con 1 capa pesada cambiada (interruptor apagado) bien', u.error);
    const newPosts = emu.st.layerPosts.slice(posts1);
    ok(newPosts.length === 1 && newPosts[0].rows === 1, 'a la base llega solo 1 fila', newPosts.map(p => p.rows));
    ok(dbRefs(emu).length === HEAVY - 1 && dbHeavyInline(emu) === 1, 'las otras 6 siguen siendo referencias; la cambiada va en línea (interruptor apagado)', [dbRefs(emu).length, dbHeavyInline(emu)]);
    rt = await b.page.evaluate(() => window.__rt('W1'));
    ok(rt.ok && rt.same, 'Editar otra vez: todo idéntico (lo cambiado y lo migrado)', rt.error);
    // Interruptor ENCENDIDO: la cambiada vuelve a R2 y el resto no se toca
    await b.page.evaluate(() => { window._sbXrForce = true; const l = window.__comic.editorData.pages[1].layers[0]; l.src = 'data:image/png;base64,' + window.__rnd(2200, 515151); window.__origs.W1 = JSON.parse(JSON.stringify(window.__comic.editorData.pages.map(p => p.layers))); });
    ctl.counts = {}; const posts2 = emu.st.layerPosts.length;
    u = await b.page.evaluate(() => window.__upload([1]));
    ok(u.ok && emu.st.layerPosts.length - posts2 === 1 && ctl.counts.PUT === 1, 'interruptor encendido: 1 fila y 1 archivo nuevo en R2', { posts: emu.st.layerPosts.length - posts2, counts: ctl.counts });
    ok(dbRefs(emu).length === HEAVY && dbHeavyInline(emu) === 0, 'y vuelve a haber 7 referencias, 0 en línea');
    rt = await b.page.evaluate(() => window.__rt('W1'));
    ok(rt.ok && rt.same, 'Editar: idéntico', rt.error);
    ok(b.errs.length === 0, 'sin errores de página', b.errs);
  } finally { await b.browser.close(); await mf.dispose(); }
};

// ── 7 · COPIA DE SEGURIDAD: las referencias entran en la copia con su contenido ──────────────────────────────────────────────
SCEN.backup = async () => {
  console.log('=== backup: la copia del panel trae el contenido de R2');
  const emu = mkMigCloud({}, SUB), mf = mkWorker(), ctl = { counts: {}, faults: [] };
  const { browser, page, errs } = await launch(emu, mf, ctl);
  try {
    const s = await seed(page, emu);
    const r = await page.evaluate(() => window.__mig('real'));
    ok(r.ok && r.rep.swapped === HEAVY, 'migración completa previa', r.rep || r);
    // Filas tal como las serviría admin_backup('page'): una línea ["R",{…}] por fila, con layer_data = referencia o texto
    const rowsTxt = emu.db.layers.map(l => JSON.stringify(['R', { id: String(l.id), panel_id: l.panel_id, layer_order: l.layer_order, layer_type: l.layer_type, layer_data: l.layer_data }]));
    const run = (failR2) => page.evaluate(async ([lines, nTotal]) => {
      const out = [];
      const sink = { write: async t => { out.push(t); return t.length; }, close: async () => ({ bytes: 0, blob: null }), abort: async () => {} };
      const rpc = async (op, arg) => {
        if (op === 'plan') return JSON.stringify({ fmt: 1, tables: [{ s: 'public', n: 'panel_layers', rows: nTotal, bytes: 1000, fk: [] }], unsupported: [] });
        if (op === 'schema') return JSON.stringify({ fmt: 1, stmts: [] });
        if (op === 'page') { const body = lines.join('\n'); return JSON.stringify({ n: lines.length, b: body.length, next: null }) + '\n' + body; }
        throw new Error('op ' + op);
      };
      try {
        const res = await AdminBackup.engine.exportar({ rpc, sink, auth: false, resolver: ref => SupabaseClient.xr.fetchText(ref) });
        return { ok: true, r2: res.r2, text: out.join(''), filas: res.filas };
      } catch (e) { return { ok: false, code: e.code, msg: e.message, text: out.join('') }; }
    }, [rowsTxt, rowsTxt.length]);
    let b = await run();
    ok(b.ok && b.r2.n === HEAVY, 'la copia termina y dice que trajo 7 capas de R2', b.r2 || b);
    const rows = b.text.split('\n').filter(l => l.startsWith('["R",')).map(l => JSON.parse(l)[1]);
    ok(rows.length === emu.db.layers.length, 'trae todas las filas', rows.length);
    ok(rows.every(x => !REF.test(x.layer_data)), 'ninguna referencia queda sin sustituir');
    ok(rows.filter(x => s.heavy.has(x.id)).every(x => x.layer_data === s.heavy.get(x.id)), 'las 7 pesadas llevan EXACTAMENTE su texto original (el que tenían en la base antes de migrar)');
    ok(rows.filter(x => !s.heavy.has(x.id)).every(x => x.layer_data === emu.db.layers.find(l => String(l.id) === x.id).layer_data), 'las demás filas, sin cambios');
    ok(/"M"|^\["M"/m.test(b.text) && /\["Z",/.test(b.text), 'el archivo lleva manifiesto y cierre');
    // La copia generada se puede comprobar con el verificador del propio panel
    const vf = await page.evaluate(async (txt) => {
      const gz = new Blob([txt]).stream().pipeThrough(new CompressionStream('gzip'));
      const blob = await new Response(gz).blob();
      const v = await AdminBackup.engine.verificar(blob);
      return { ok: v.ok, problemas: v.problemas, filas: v.filas };
    }, b.text);
    ok(vf.ok && vf.filas === emu.db.layers.length, 'y pasa el verificador de copias del panel (' + vf.filas + ' filas)', vf.problemas);
    // R2 caído → la copia NO se da por buena
    ctl.down = true;
    b = await run();
    ok(!b.ok && b.code === 'r2', 'con R2 caído la copia FALLA (código r2) en vez de salir sin contenido', b);
    ok(!/\["Z",/.test(b.text), 'y no se escribe el cierre del archivo (queda sin terminar)');
    ctl.down = false;
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await browser.close(); await mf.dispose(); }
};

// ── 8 · INTERFAZ: apartado 4 de la pestaña R2 ───────────────────────────────────────────────────────────────────────────────
SCEN.ui = async () => {
  console.log('=== ui: apartado 4 de la pestaña R2 (ES)');
  const emu = mkMigCloud({}, SUB), mf = mkWorker(), ctl = { counts: {}, faults: [] };
  const { browser, page, errs } = await launch(emu, mf, ctl);
  try {
    const s = await seed(page, emu);
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'testPanel'; d.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#fff;z-index:99999;padding:12px'; document.body.appendChild(d); AdminR2.render(d); });
    const txt = () => page.evaluate(() => document.getElementById('testPanel').innerText);
    const click = sel => page.click('#testPanel ' + sel);
    let t = await txt();
    ok(/4 · Mover a R2 las capas pesadas/.test(t), 'aparece el apartado 4');
    ok(/Antes hay que pasar la prueba de R2/.test(t), 'sin prueba de R2 correcta avisa de que falta');
    await click('[data-r2="buscar"]');
    await page.waitForFunction(() => /capas pesadas \(/.test(document.getElementById('testPanel').innerText), null, { timeout: 15000 });
    t = await txt();
    ok(/7 capas pesadas \(/.test(t) && /en 2 obras/.test(t) && /Ya en R2: 0/.test(t), 'busca y resume: 7 capas pesadas en 2 obras, 0 ya en R2', t.match(/\d+ capas pesadas[^\n]*/));
    ok(/admin/.test(t) && /Macario/.test(t), 'la tabla separa por cuenta (admin · Macario)');
    ok(await page.evaluate(() => document.querySelector('#testPanel [data-r2="empezar"]').disabled), 'sin la prueba de R2 «Empezar» está desactivado');
    // pasar la prueba de R2
    await click('[data-r2="probar"]');
    await page.waitForFunction(() => /Prueba correcta/.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    ok(!(await page.evaluate(() => document.querySelector('#testPanel [data-r2="empezar"]').disabled)), 'tras pasar la prueba de R2 «Empezar» se activa');
    // limitar a las 2 más pesadas
    await page.fill('#testPanel #r2mMax', '2');
    t = await txt();
    ok(/Se procesarán 2 capas \(/.test(t), 'el campo «cuántas capas» actualiza el plan al escribir (2 capas)', t.match(/Se procesarán[^\n]*/));
    // simulacro con 2
    await click('[data-r2="empezar"]');
    await page.waitForFunction(() => /Simulacro terminado/.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    t = await txt();
    ok(/Preparadas en R2 sin tocar la base: 2/.test(t) && /Cambiadas en la base: 0/.test(t), 'simulacro de 2: «preparadas 2», «cambiadas 0»', t.match(/Modo:[\s\S]*Duración[^\n]*/));
    ok(dbRefs(emu).length === 0, 'la base sigue sin cambios');
    // pasar a real: hace falta marcar las dos confirmaciones
    await click('[data-r2="buscar"]');
    await page.waitForFunction(() => /capas pesadas \(/.test(document.getElementById('testPanel').innerText), null, { timeout: 15000 });
    t = await txt();
    ok(/2 capas \([\d,.]+ MB\) ya están subidas a R2 y esperan/.test(t), 'avisa de las 2 ya subidas que esperan el cambio', t.match(/\d+ capas \([^)]*\) ya están[^\n]*/));
    await page.check('#testPanel input[name="r2mMode"][value="real"]');
    ok(await page.evaluate(() => document.querySelector('#testPanel [data-r2="empezar"]').disabled), 'en modo real «Mover de verdad» sigue desactivado sin las confirmaciones');
    await page.check('#testPanel #r2mC1');
    ok(await page.evaluate(() => document.querySelector('#testPanel [data-r2="empezar"]').disabled), '…con una sola tampoco');
    await page.check('#testPanel #r2mC2');
    ok(!(await page.evaluate(() => document.querySelector('#testPanel [data-r2="empezar"]').disabled)), '…con las dos se activa');
    await page.fill('#testPanel #r2mMax', '2');
    emu.mig.getLayer.length = 0;
    await click('[data-r2="empezar"]');
    await page.waitForFunction(() => /^Terminado/m.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    t = await txt();
    ok(/Cambiadas en la base: 2/.test(t) && /del manifiesto: 2/.test(t), 'real de 2: «cambiadas 2», «del manifiesto 2»', t.match(/Modo:[\s\S]*Duración[^\n]*/));
    ok(emu.mig.getLayer.length === 0 && dbRefs(emu).length === 2, 'sin volver a bajar nada de Supabase; 2 referencias en la base');
    ok(await page.evaluate(() => !document.querySelector('#testPanel #r2mC1')), 'las confirmaciones se piden de nuevo en cada ejecución real');
    // comprobar
    await click('[data-r2="verificar"]');
    await page.waitForFunction(() => /Todo correcto|Hay problemas/.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    t = await txt();
    ok(/Todo correcto: 2 referencias → 2 archivos distintos/.test(t) && /aún están dentro de la base: 5/.test(t), 'comprobar: 2 referencias → 2 archivos; quedan 5 pesadas en la base', t.match(/(✓|✗)[^\n]*/));
    await page.check('#testPanel #r2mDeep');
    await click('[data-r2="verificar"]');
    await page.waitForFunction(() => /MB leídos/.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    ok(true, 'comprobar «a fondo» también termina');
    // mover el resto, sin límite
    await click('[data-r2="buscar"]');
    await page.waitForFunction(() => /capas pesadas \(/.test(document.getElementById('testPanel').innerText), null, { timeout: 15000 });
    await page.check('#testPanel input[name="r2mMode"][value="real"]'); await page.check('#testPanel #r2mC1'); await page.check('#testPanel #r2mC2');
    t = await txt();
    ok(/Se procesarán 5 capas/.test(t), 'sin límite: las 5 que quedan', t.match(/Se procesarán[^\n]*/));
    await click('[data-r2="empezar"]');
    await page.waitForFunction(() => /^Terminado/m.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    t = await txt();
    ok(/Cambiadas en la base: 5/.test(t) && dbRefs(emu).length === HEAVY && dbHeavyInline(emu) === 0, 'las 5 restantes: ya no queda ninguna pesada en línea');
    await click('[data-r2="buscar"]');
    await page.waitForFunction(() => /No queda ninguna capa pesada/.test(document.getElementById('testPanel').innerText), null, { timeout: 15000 });
    ok(true, 'al volver a buscar: «No queda ninguna capa pesada dentro de la base»');
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await browser.close(); await mf.dispose(); }
};

// ── apartado 4 en INGLÉS: ni claves sin traducir ni castellano colado ───────────────────────────────────────────────────
SCEN.ui_en = async () => {
  console.log('=== ui_en: apartado 4 de la pestaña R2 (EN)');
  const emu = mkMigCloud({}, SUB), mf = mkWorker(), ctl = { counts: {}, faults: [] };
  const { browser, page, errs } = await launch(emu, mf, ctl, { lang: 'en' });
  try {
    const s = await seed(page, emu);
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'testPanel'; d.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#fff;z-index:99999;padding:12px'; document.body.appendChild(d); AdminR2.render(d); });
    const txt = () => page.evaluate(() => document.getElementById('testPanel').innerText);
    const click = sel => page.click('#testPanel ' + sel);
    const ES_WORDS = /\b(capas?|pesadas?|obras?|Empezar|Simulacro|Terminado|Cambiadas|Comprobar|Prueba correcta|Antes hay que|Buscar|Parar|Olvidar|Duración|Todo correcto)\b/;
    const KEY_LEAK = /adminR2M|adminBk[A-Z]/;
    const clean = async (where) => { const t0 = await txt(); const i4 = t0.indexOf('4 · '); const t = i4 >= 0 ? t0.slice(i4) : t0; ok(!KEY_LEAK.test(t), 'sin claves sin traducir (' + where + ')', (t.match(KEY_LEAK) || [])[0]); const m = t.match(ES_WORDS); ok(!m, 'sin castellano colado (' + where + ')', m && t.slice(Math.max(0, m.index - 40), m.index + 40)); return t; };
    let t = await clean('inicio');
    ok(/4 · Move to R2 the heavy layers already in Supabase/.test(t), 'título del apartado 4 en inglés');
    ok(/First pass the R2 test/.test(t), 'sin prueba de R2 avisa en inglés');
    await click('[data-r2="buscar"]');
    await page.waitForFunction(() => /heavy layers \(/.test(document.getElementById('testPanel').innerText), null, { timeout: 15000 });
    t = await clean('tras buscar');
    ok(/7 heavy layers \(/.test(t) && /in 2 works/.test(t) && /Already in R2: 0/.test(t), 'resumen en inglés: 7 heavy layers, 2 works, 0 already in R2', t.match(/\d+ heavy layers[^\n]*/));
    await click('[data-r2="probar"]');
    await page.waitForFunction(() => /R2 test|✓/.test(document.getElementById('testPanel').innerText) && !document.querySelector('#testPanel [data-r2="empezar"]').disabled, null, { timeout: 30000 });
    await page.fill('#testPanel #r2mMax', '2');
    t = await txt();
    ok(/2 layers will be processed \(/.test(t), 'plan en inglés', t.match(/\d+ layers will[^\n]*/));
    await click('[data-r2="empezar"]');
    await page.waitForFunction(() => /Rehearsal finished/.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    t = await clean('tras el simulacro');
    ok(/Ready in R2 without touching the database: 2/.test(t) && /Changed in the database: 0/.test(t), 'informe del simulacro en inglés', t.match(/Mode:[\s\S]*?Duration[^\n]*|Mode:[^\n]*/));
    await click('[data-r2="buscar"]');
    await page.waitForFunction(() => /heavy layers \(/.test(document.getElementById('testPanel').innerText), null, { timeout: 15000 });
    await page.check('#testPanel input[name="r2mMode"][value="real"]');
    t = await txt();
    ok(/I have made a recent backup/.test(t) && /lives only in R2/.test(t), 'las dos confirmaciones en inglés');
    ok(/Move for real/.test(t), 'botón «Move for real»');
    await page.check('#testPanel #r2mC1'); await page.check('#testPanel #r2mC2');
    await page.fill('#testPanel #r2mMax', '2');
    await click('[data-r2="empezar"]');
    await page.waitForFunction(() => /^Finished/m.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    t = await clean('tras el real');
    ok(/Changed in the database: 2/.test(t), 'informe real en inglés', t.match(/Changed in the database[^\n]*/));
    await click('[data-r2="verificar"]');
    await page.waitForFunction(() => /All correct|There are problems/.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    t = await clean('tras comprobar');
    ok(/All correct: 2 references → 2 distinct files, all in R2/.test(t), 'comprobación en inglés', t.match(/(All correct|There are problems)[^\n]*/));
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await browser.close(); await mf.dispose(); }
};

// ── (solo para mirar) capturas de la interfaz en escritorio y móvil ─────────────────────────────────────────────────────────
SCEN.shots = async () => {
  console.log('=== shots: capturas en /tmp/t4248/shots');
  const emu = mkMigCloud({}, SUB), mf = mkWorker(), ctl = { counts: {}, faults: [] };
  const { browser, page, errs } = await launch(emu, mf, ctl);
  try {
    const s = await seed(page, emu);
    await page.addStyleTag({ url: APP + 'css/admin.css' });
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'testPanel'; d.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#fff;z-index:99999'; document.body.appendChild(d); AdminR2.render(d); });
    const click = sel => page.click('#testPanel ' + sel);
    const shot = async (name, vw) => { await page.setViewportSize(vw); await sleep(150); await page.evaluate(() => { const d = document.getElementById('testPanel'); const h = d.querySelector('hr.bk-hr:last-of-type'); }); await page.screenshot({ path: '/tmp/t4248/shots/' + name + '.png', fullPage: false }); };
    await click('[data-r2="probar"]');
    await page.waitForFunction(() => /Prueba correcta/.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    await click('[data-r2="buscar"]');
    await page.waitForFunction(() => /capas pesadas \(/.test(document.getElementById('testPanel').innerText), null, { timeout: 15000 });
    const scrollToMig = async () => page.evaluate(() => { const d = document.getElementById('testPanel'); const h = [...d.querySelectorAll('h3')].find(x => /^4 ·/.test(x.textContent)); if (h) h.scrollIntoView(); });
    await scrollToMig();
    await shot('1_listo_desktop', { width: 1000, height: 900 });
    await page.check('#testPanel input[name="r2mMode"][value="real"]');
    await scrollToMig();
    await shot('2_real_desktop', { width: 1000, height: 900 });
    await shot('2_real_mobile', { width: 390, height: 844 });
    await page.check('#testPanel #r2mC1'); await page.check('#testPanel #r2mC2');
    await page.fill('#testPanel #r2mMax', '3');
    await click('[data-r2="empezar"]');
    await page.waitForFunction(() => /^Terminado/m.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    await scrollToMig();
    await shot('3_hecho_desktop', { width: 1000, height: 900 });
    await shot('3_hecho_mobile', { width: 390, height: 844 });
    await click('[data-r2="verificar"]');
    await page.waitForFunction(() => /Todo correcto|Hay problemas/.test(document.getElementById('testPanel').innerText), null, { timeout: 30000 });
    await page.evaluate(() => { const d = document.getElementById('testPanel'); d.scrollTop = d.scrollHeight; });
    await shot('4_verificado_desktop', { width: 1000, height: 900 });
  } finally { await browser.close(); await mf.dispose(); }
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(SCEN).filter(n => n !== 'shots');
for (const n of names) {
  if (!SCEN[n]) { console.log('escenario desconocido: ' + n); fails++; continue; }
  try { await SCEN[n](); } catch (e) { fails++; console.log('  ✗ EXCEPCIÓN en ' + n + ': ' + (e && e.stack || e)); }
}
console.log(`\n${fails ? '✗ ' + fails + ' FALLO(S)' : '✓ TODO CORRECTO'}  (${passes} comprobaciones correctas)`);
process.exit(fails ? 1 : 0);
