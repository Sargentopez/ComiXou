// Banco de pruebas de «Restaurar» (v42.50): app REAL en Chromium + Worker REAL (Miniflare, R2 simulado) + PostgreSQL 16 REAL con las funciones
// REALES del proyecto (admin_backup, admin_restore). Lo único simulado es la capa HTTP de PostgREST (un manejador de Playwright que llama a Postgres
// con rol «authenticated», las notas «request.jwt.claims» y el tope de 8 s por sentencia, y traduce los errores a los códigos HTTP de PostgREST).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { mkCloud } = require('./cloud_emu.js');
const { Client } = require('/tmp/t4250/node_modules/pg');

export const APP = process.env.APP_URL || 'http://127.0.0.1:8768/';
export const WORKER_SRC = process.env.WORKER_SRC || '/tmp/t4246/comxow-storage-worker.js';
export const SQL_FILES = ['/tmp/t4250/mock_e2e.sql', '/home/claude/w/sql/v42_29_backup_admin_1_funcion.sql', '/home/claude/w/sql/v42_29_backup_admin_2_permisos.sql', '/home/claude/w/sql/v42_50_restaurar_admin_1_funcion.sql'];
export const W = 'https://comxow-storage-worker.albertobicho.workers.dev';
export const ADMIN = '00000000-0000-4000-8000-000000000001';
export const TUTOR = '00000000-0000-4000-8000-000000000002';
export const MARIA = '00000000-0000-4000-8000-000000000003';
export const sha = (b) => createHash('sha256').update(b).digest('hex');
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const _jwts = new Map();
export const jwtFor = (sub) => { if (!_jwts.has(sub)) _jwts.set(sub, b64u({ alg: 'HS256' }) + '.' + b64u({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 }) + '.f'); return _jwts.get(sub); };   // siempre el mismo token por usuario
export const JWT = jwtFor(ADMIN);
export const KB = 1024;

let fails = 0, passes = 0;
export const ok = (c, m, extra) => { if (c) passes++; else fails++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && extra !== undefined ? '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); };
export const resumen = () => { console.log(`\n${passes} ✓  ${fails} ✗`); return fails; };

export function rbytes(n, seed) { let a = seed >>> 0; const u = Buffer.alloc(n); for (let i = 0; i < n; i++) { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); u[i] = ((t ^ (t >>> 14)) >>> 0) & 255; } return u; }

// ── El Worker real ─────────────────────────────────────────────────────────────────────────────────
export function mkWorker() {
  return new Miniflare({
    modules: true, script: readFileSync(WORKER_SRC, 'utf8'), compatibilityDate: '2024-09-23', r2Buckets: ['COMXOW_BUCKET'],
    bindings: { MODO_MANTENIMIENTO: 'FALSO' },
    outboundService: async (req) => {
      if (req.url.startsWith('https://qqgsbyylaugsagbxsetc.supabase.co/auth/v1/user')) {
        return (req.headers.get('authorization') === 'Bearer ' + JWT) ? Response.json({ id: ADMIN }) : new Response('{"msg":"invalid"}', { status: 401 });
      }
      return new Response('unexpected ' + req.url, { status: 500 });
    },
  });
}
// Ruta de Playwright → Worker. ctl: { down, log:[{m,k}], delay, fail:{'METODO clave': [estados…]} }
export function routeWorker(mf, ctl) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  return async r => {
    const req = r.request(), url = new URL(req.url()), m = req.method();
    if (!/^\/(blobs|anims|gifs|covers)\//.test(url.pathname)) return r.abort();
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: cors, body: '' });
    const k = url.pathname.slice(1);
    ctl.log.push({ m, k });
    if (ctl.down) return r.abort('connectionrefused');
    const fk = m + ' ' + k;
    if (ctl.fail && ctl.fail[fk] && ctl.fail[fk].length) { const s = ctl.fail[fk].shift(); if (s === 'abort') return r.abort('connectionreset'); return r.fulfill({ status: +s, headers: cors, contentType: 'application/json', body: '{"ok":false,"error":"x"}' }); }
    if (ctl.delay) await sleep(ctl.delay);
    const body = req.postDataBuffer();
    const hd = Object.assign({}, req.headers(), { origin: 'https://comxow.com' }); delete hd['host']; delete hd['content-length'];
    if (body) hd['content-length'] = String(body.length);
    const rr = await mf.dispatchFetch('http://worker.test' + url.pathname, { method: m, headers: hd, body: body && body.length ? body : undefined });
    const buf = Buffer.from(await rr.arrayBuffer());
    const out = {}; rr.headers.forEach((v, kk) => { out[kk] = v; });
    Object.assign(out, { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' });
    return r.fulfill({ status: rr.status, headers: out, body: buf });
  };
}

// ── PostgreSQL real ───────────────────────────────────────────────────────────────────────────────
const T57014 = { code: '57014', details: null, hint: null, message: 'canceling statement due to statement timeout' };
function httpDe(e) {
  const code = e.code || '';
  let status = 400;
  if (code === '42501') status = 403;
  else if (code === '42883') status = 404;
  else if (/^23/.test(code)) status = 409;
  else if (/^(53|54|55|57|58|XX)/.test(code)) status = 500;
  return { status, body: JSON.stringify({ code, details: null, hint: null, message: e.message }) };
}
export class Pg {
  constructor() { this.c = new Client({ host: '/var/run/postgresql', user: 'root', database: 't4250' }); this.chain = Promise.resolve(); this.calls = []; this.hook = null; this.delay = 0; }
  async connect() { await this.c.connect(); }
  async end() { await this.c.end(); }
  lock(fn) { const p = this.chain.then(fn, fn); this.chain = p.catch(() => {}); return p; }
  q(sql, params) { return this.lock(() => this.c.query(sql, params)).then(r => r.rows); }
  async reset(opts) {
    opts = opts || {};
    await this.lock(async () => { for (const f of SQL_FILES) { if (opts.sinRestore && /v42_50/.test(f)) continue; await this.c.query(readFileSync(f, 'utf8')); } });
    this.calls = []; this.hook = null; this.delay = 0;
  }
  // Una llamada a /rest/v1/rpc/<fn> con el cuerpo tal cual lo manda el navegador: {"op":…,"arg":…}
  async rpc(fn, body, sub) {
    const mm = /^\{"op":("(?:[^"\\]|\\.)*"),"arg":/.exec(body);
    let op, argText;
    if (mm) { op = JSON.parse(mm[1]); argText = body.slice(mm[0].length, body.length - 1); }
    else { const j = JSON.parse(body); op = j.op; argText = JSON.stringify(j.arg == null ? {} : j.arg); }
    const info = { fn, op, argText, sub, bytes: argText.length, n: null, t: null, dry: /"dry"\s*:\s*true/.test(argText.slice(0, 200)) || /"dry"\s*:\s*true\s*[,}]/.test(argText.slice(-80)) };
    if (op === 'rows') { try { const a = JSON.parse(argText); info.n = a.rows.length; info.t = a.t; info.mode = a.mode; info.ids = a.rows.map(r => r.id); } catch (_) {} }
    this.calls.push(info);
    if (this.hook) { const h = await this.hook(info); if (h) return h; }
    if (this.delay) await sleep(this.delay);
    return this.lock(async () => {
      await this.c.query('begin');
      try {
        await this.c.query('set local role authenticated');
        await this.c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: 'authenticated' })]);
        await this.c.query("set local statement_timeout = '8s'");
        const r = await this.c.query(`select public.${fn}($1, $2::jsonb) as r`, [op, argText]);
        await this.c.query('commit');
        return { status: 200, body: JSON.stringify(r.rows[0].r) };
      } catch (e) { try { await this.c.query('rollback'); } catch (_) {} return httpDe(e); }
    });
  }
  writes() { return this.calls.filter(c => c.fn === 'admin_restore' && ((c.op === 'rows' && !c.dry) || (c.op === 'wipe' && !/"dry"\s*:\s*true/.test(c.argText)) || c.op === 'nav')); }
}
export const falloT57014 = () => ({ status: 500, body: JSON.stringify(T57014) });

const subDe = (auth) => { try { return JSON.parse(Buffer.from((auth.replace(/^Bearer /, '').split('.')[1] || ''), 'base64url').toString()).sub; } catch (_) { return null; } };

// ── El navegador ──────────────────────────────────────────────────────────────────────────────────
export async function launch(pg, mf, ctl, opts) {
  opts = opts || {};
  const emu = mkCloud();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  await ctx.route(/supabase\.co/, async r => {
    const req = r.request(), url = new URL(req.url());
    const m = /\/rest\/v1\/rpc\/(admin_backup|admin_restore)$/.exec(url.pathname);
    if (!m) return emu.handler(r);
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors, body: '' });
    const res = await pg.rpc(m[1], req.postData(), subDe(req.headers()['authorization'] || ''));
    try {
      if (res.abort) return await r.abort('connectionreset');
      return await r.fulfill({ status: res.status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: res.body });
    } catch (_) { /* el navegador ya canceló la petición */ }
  });
  await ctx.route(/comxow-storage-worker\.albertobicho\.workers\.dev/, routeWorker(mf, ctl));
  await ctx.route(/googleapis|gstatic|jsdelivr/, r => r.abort());
  const user = opts.user || { username: 'admin', sub: ADMIN };
  await ctx.addInitScript(([sub, token, lang, username, fast]) => {
    try {
      if (!localStorage.getItem('__init')) {
        localStorage.setItem('__init', '1');
        localStorage.setItem('cs_session', JSON.stringify({ id: sub, username, email: 'a@example.com', role: 'admin', token }));
        localStorage.setItem('cx_visited', '1'); localStorage.setItem('cx_terms_accepted_v1', '1'); localStorage.setItem('cs_lang', lang);
      }
      window.showSaveFilePicker = undefined;
      if (fast) { const st = window.setTimeout.bind(window); window.setTimeout = (f, ms, ...a) => st(f, (ms >= 500 && ms < 100000) ? Math.max(15, ms / 40) : ms, ...a); }
    } catch (e) {}
  }, [user.sub, jwtFor(user.sub), opts.lang || 'es', user.username, !!opts.fast]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(APP);
  await page.waitForFunction(() => typeof SupabaseClient !== 'undefined' && typeof AdminBackup !== 'undefined' && typeof AdminRestore !== 'undefined' && !!SupabaseClient.xr, null, { timeout: 20000 });
  await page.evaluate(() => {
    // copia real (con los archivos de R2 y las capas pesadas expandidas) → Blob gzip → base64
    window.__mkBackup = async (cfg) => {
      cfg = cfg || {};
      const sink = await AdminBackup.engine.crearSink(null);
      const r = await AdminBackup.engine.exportar({
        rpc: (op, arg, o) => SupabaseClient.adminBackupRpc(op, arg, o), sink, auth: true, signal: new AbortController().signal, appVersion: 'test',
        resolver: (ref) => SupabaseClient.xr.fetchText(ref),
        archivos: cfg.archivos === false ? null : { base: SupabaseClient.xr.worker, legacyBase: SupabaseClient.xr.storage },
        onProgress: () => {},
      });
      const u = new Uint8Array(await r.blob.arrayBuffer()); let s = '';
      for (let i = 0; i < u.length; i += 24576) s += String.fromCharCode.apply(null, u.subarray(i, i + 24576));
      return { b64: btoa(s), filas: r.filas, files: r.files, r2: r.r2 };
    };
    window.__gz = async (txt) => { const b = await new Response(new Blob([txt]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 24576) s += String.fromCharCode.apply(null, u.subarray(i, i + 24576)); return btoa(s); };
    const p = document.createElement('div'); p.id = 'testPanel'; p.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#fff;color:#000;z-index:99999;padding:12px'; document.body.appendChild(p);
  });
  return { browser, ctx, page, errs, emu };
}
export const txt = (page) => page.evaluate(() => document.getElementById('testPanel').innerText);
export const esperar = (page, re, ms) => page.waitForFunction(s => new RegExp(s).test(document.getElementById('testPanel').innerText), re.source, { timeout: ms || 30000 });
export const fase = (page) => page.evaluate(() => AdminRestore._state.fase);
export const esperarFase = (page, f, ms) => page.waitForFunction(x => AdminRestore._state.fase === x, f, { timeout: ms || 30000 });
export async function nuevaCopia(page, cfg) {
  const r = await page.evaluate(c => window.__mkBackup(c), cfg || {});
  return { buf: Buffer.from(r.b64, 'base64'), filas: r.filas, files: r.files, r2: r.r2 };
}
// Carga un archivo de copia en la pestaña y espera a la lista (o al error)
export async function cargar(page, buf, name) {
  await page.evaluate(() => { AdminRestore.render(document.getElementById('testPanel')); });
  await page.setInputFiles('#testPanel #rsFile', { name: name || 'copia.ndjson.gz', mimeType: 'application/gzip', buffer: buf });
  await page.waitForFunction(() => ['elegir', 'error'].indexOf(AdminRestore._state.fase) >= 0, null, { timeout: 60000 });
}
export const elegirObra = (page, id, modo) => page.selectOption(`#testPanel select[data-rs-obra="${id}"]`, modo);
