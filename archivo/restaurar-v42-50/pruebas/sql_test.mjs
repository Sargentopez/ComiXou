// Pruebas de public.admin_restore contra un PostgreSQL 16 real con un esquema que imita el de Supabase.
//   cd /tmp/t4250 && node sql_test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('/tmp/t4250/node_modules/pg');

const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const TUTOR = '00000000-0000-4000-8000-0000000000a2';
const MARIA = '00000000-0000-4000-8000-0000000000a3';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const canon = (v) => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v);
const eq = (a, b, m) => { const s = JSON.stringify(canon(a)), t = JSON.stringify(canon(b)); if (s === t) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + '\n      esperado ' + t + '\n      obtenido ' + s); } };

const c = new Client({ host: '/var/run/postgresql', user: 'root', database: 't4250' });
await c.connect();
const q = async (sql, p) => (await c.query(sql, p)).rows;
const one = async (sql, p) => (await q(sql, p))[0];
const num = async (sql, p) => Number((await one(sql, p)).n);

// Llama a la función como lo haría PostgREST: rol + claims; devuelve {ok, v} o {ok:false, code, msg}
async function rpc(uid, op, arg, o = {}) {
  await c.query('begin');
  try {
    await c.query(`set local role ${o.role || 'authenticated'}`);
    if (uid) await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    if (o.timeout) await c.query(`set local statement_timeout = '${o.timeout}'`);
    const raw = typeof arg === 'string' ? arg : JSON.stringify(arg ?? {});
    const r = await c.query('select public.admin_restore($1, $2::jsonb) as r', [op, raw]);
    await c.query('commit');
    return { ok: true, v: JSON.parse(r.rows[0].r) };
  } catch (e) { await c.query('rollback'); return { ok: false, code: e.code, msg: e.message }; }
}
const A = (op, arg, o) => rpc(ADMIN, op, arg, o);
const S = async (t, rows, mode = 'add') => { const r = await A('rows', { t, mode, rows }); if (!r.ok || r.v.fail) { console.log('  ✗✗ SEMILLA FALLÓ', t, JSON.stringify(r)); process.exit(2); } return r; };
const reset = async () => { await c.query('truncate public.works, public.panels, public.panel_layers, public.panel_texts, public.biblioteca cascade'); };
const u = (n) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');   // ids de obra
const pid = (n) => '20000000-0000-4000-8000-' + String(n).padStart(12, '0');  // ids de hoja
const lid = (n) => '30000000-0000-4000-8000-' + String(n).padStart(12, '0');  // ids de capa
const tid = (n) => '40000000-0000-4000-8000-' + String(n).padStart(12, '0');  // ids de texto
const work = (n, x = {}) => ({ id: u(n), author_id: MARIA, title: 'Obra ' + n, description: null, published: false, cover_url: null, tags: ['a', 'b'], settings: { k: n }, created_at: '2025-10-01T10:00:00.123456+00:00', updated_at: '2025-10-02T10:00:00+00:00', ...x });
const panel = (n, w, x = {}) => ({ id: pid(n), work_id: u(w), panel_order: n, name: 'H' + n, data_url: null, nav: null, created_at: '2025-10-01T10:00:00+00:00', updated_at: '2025-10-01T10:00:00+00:00', ...x });
const layer = (n, p, x = {}) => ({ id: lid(n), panel_id: pid(p), layer_order: n, layer_type: 'ink', layer_data: 'datos-' + n, gif_url: null, anim_url: null, meta: { z: n }, big: null, created_at: '2025-10-01T10:00:00+00:00', layer_sha: 'falso', ...x });
const text = (n, p) => ({ id: tid(n), panel_id: pid(p), text_order: n, content: 'texto ' + n, style: { b: true }, created_at: '2025-10-01T10:00:00+00:00' });

console.log('Pruebas de admin_restore (PostgreSQL 16)');
await reset();
await c.query("delete from public.authors where id not in ($1,$2,$3)", [ADMIN, TUTOR, MARIA]);

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== puerta: solo la cuenta «admin»');
{
  const r1 = await rpc(null, 'probe', {}, { role: 'anon' });
  ok(!r1.ok && r1.code === '42501', 'anónimo: permiso denegado (42501) — ni siquiera puede ejecutarla');
  const r2 = await rpc(null, 'probe', {});
  ok(!r2.ok && r2.code === '42501' && /administradora principal/.test(r2.msg), 'con sesión pero sin usuario: 42501 de la propia función');
  const r3 = await rpc(MARIA, 'probe', {});
  ok(!r3.ok && r3.code === '42501', 'usuaria normal: 42501');
  const r4 = await rpc(TUTOR, 'probe', {});
  ok(!r4.ok && r4.code === '42501', 'otro administrador («Tutor»): 42501');
  const r5 = await rpc(TUTOR, 'rows', { t: 'works', mode: 'add', rows: [work(1)] });
  ok(!r5.ok && r5.code === '42501' && (await num('select count(*) n from public.works')) === 0, '«Tutor» no puede escribir y no se escribe nada');
  const r6 = await rpc(MARIA, 'wipe', { panels: [] });
  ok(!r6.ok && r6.code === '42501', 'usuaria normal no puede borrar (wipe)');
  const r7 = await A('probe', {});
  ok(r7.ok && r7.v.works.length === 0, 'admin: puede');
  const r8 = await rpc('00000000-0000-4000-8000-0000000000ff', 'probe', {});
  ok(!r8.ok && r8.code === '42501', 'uuid inexistente en el token: 42501');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== argumentos: tablas y operaciones no admitidas');
{
  const bad = async (arg, m, code = '22023') => { const r = await A('rows', arg); ok(!r.ok && r.code === code, m + (r.ok ? '' : '  → ' + r.msg.slice(0, 70))); };
  const r0 = await A('borrar_todo', {}); ok(!r0.ok && r0.code === '22023' && /desconocida/.test(r0.msg), 'operación desconocida → 22023');
  const rn = await A(null, {}); ok(!rn.ok && r0.code === '22023', 'operación nula → 22023');
  await bad({ t: 'users', rows: [] }, 'tabla de auth («users») no admitida');
  await bad({ t: 'pg_class', rows: [] }, 'catálogo no admitido');
  await bad({ t: 'works; drop table public.works', rows: [] }, 'inyección en el nombre → no admitida');
  await bad({ t: 'public.works', rows: [] }, '«public.works» (con esquema) no es un nombre válido');
  await bad({ t: '"works"', rows: [] }, 'nombre entre comillas no admitido');
  await bad({ rows: [] }, 'sin tabla');
  await bad({ t: null, rows: [] }, 'tabla nula');
  await c.query('create view public.v_works as select * from public.works');
  await bad({ t: 'v_works', rows: [] }, 'una vista no se admite');
  await c.query('drop view public.v_works');
  await c.query('create table public.t_nopk (a int)');
  await bad({ t: 't_nopk', rows: [{ a: 1 }] }, 'tabla sin clave primaria no admitida');
  await c.query('drop table public.t_nopk');
  await bad({ t: 'works', mode: 'add', rows: [{ title: 'sin id' }] }, 'filas sin la clave primaria → se rechaza (no se inventan ids)');
  eq(await num('select count(*) n from public.works'), 0, 'y no se creó ninguna obra con id inventado');
  const rd = await A('wipe', { panels: ['no-es-uuid'] }); ok(!rd.ok && rd.code === '22P02', 'wipe con un id que no es uuid → error de sintaxis (22P02), no borra');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== probe: qué existe ya');
{
  await reset();
  await S('works', [work(1), work(2), work(3)], 'add');
  await S('panels', [panel(1, 1), panel(2, 1), panel(3, 2)], 'add');
  const r = await A('probe', { works: [u(1), u(3), u(9)], panels: [pid(1), pid(3), pid(9)], detail: [u(1), u(9)] });
  ok(r.ok, 'probe responde');
  eq([...r.v.works].sort(), [u(1), u(3)].sort(), 'obras que existen: 1 y 3 (la 9 no)');
  eq([...r.v.panels].sort(), [pid(1), pid(3)].sort(), 'hojas que existen: 1 y 3 (la 9 no)');
  eq(Object.keys(r.v.detail), [u(1)], 'detalle solo de la obra 1 (la 9 no existe)');
  eq([...r.v.detail[u(1)]].sort(), [pid(1), pid(2)].sort(), 'con todas sus hojas en la base');
  const e = await A('probe', {}); eq(e.v, { works: [], panels: [], detail: {} }, 'probe sin argumentos → vacío');
  const e2 = await A('probe', { works: [], panels: [], detail: [] }); eq(e2.v, { works: [], panels: [], detail: {} }, 'probe con listas vacías → vacío');
  const e3 = await A('probe', { works: [u(1), u(1), u(1)] }); eq(e3.v.works, [u(1)], 'ids repetidos no repiten el resultado');
  const big = Array.from({ length: 3000 }, (_, i) => u(1000 + i));
  const e4 = await A('probe', { works: big.concat([u(2)]) }); eq(e4.v.works, [u(2)], '3000 ids de golpe: encuentra la única que existe');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== rows · modo add: inserta lo que falta, no toca lo que existe');
{
  await reset();
  const a = await A('rows', { t: 'works', mode: 'add', rows: [work(1), work(2), work(3)] });
  eq(a.v, { n: 3, ins: 3, upd: 0, fail: 0, err: [] }, '3 obras nuevas → ins=3');
  const w1 = await one('select * from public.works where id = $1', [u(1)]);
  eq(w1.tags, ['a', 'b'], 'array de texto (tags) intacto');
  eq(w1.settings, { k: 1 }, 'jsonb (settings) intacto');
  eq(new Date(w1.created_at).toISOString(), '2025-10-01T10:00:00.123Z', 'fecha con microsegundos y zona intacta (created_at)');
  await c.query("update public.works set title = 'EDITADA' where id = $1", [u(1)]);
  const b = await A('rows', { t: 'works', mode: 'add', rows: [work(1), work(2), work(3), work(4)] });
  eq(b.v, { n: 4, ins: 1, upd: 0, fail: 0, err: [] }, 'repetir con una nueva más → ins=1 (las 3 existentes no se tocan)');
  eq((await one('select title from public.works where id = $1', [u(1)])).title, 'EDITADA', 'la obra que existía conserva SU contenido actual (no la de la copia)');
  eq(await num('select count(*) n from public.works'), 4, '4 obras en total, sin duplicados');
  const c2 = await A('rows', { t: 'works', mode: 'add', rows: [] });
  eq(c2.v, { n: 0, ins: 0, upd: 0, fail: 0, err: [] }, 'lote vacío → todo a cero');
  // otra restricción única (authors.username): en modo add la fila nueva que choca se omite sin error
  const d = await A('rows', { t: 'authors', mode: 'add', rows: [{ id: u(500), username: 'admin', role: 'user', display_name: null, bio: null, created_at: null, updated_at: null }] });
  ok(d.ok && d.v.ins === 0 && d.v.fail === 0, 'autora nueva cuyo username ya existe → omitida (ins=0), sin error');
  eq(await num('select count(*) n from public.authors'), 3, 'y las autoras siguen siendo 3');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== rows · modo upsert: sobrescribe');
{
  await reset();
  await S('works', [work(1), work(2)], 'add');
  await c.query("update public.works set title = 'CAMBIADA', published = true where id in ($1,$2)", [u(1), u(2)]);
  const r = await A('rows', { t: 'works', mode: 'upsert', rows: [work(1), work(2), work(3)] });
  eq(r.v, { n: 3, ins: 1, upd: 2, fail: 0, err: [] }, 'upsert: 1 nueva + 2 sobrescritas');
  eq((await one('select title, published from public.works where id = $1', [u(1)])), { title: 'Obra 1', published: false }, 'la sobrescrita vuelve al contenido de la copia');
  eq(await num('select count(*) n from public.works'), 3, 'sin duplicados');
  // fila que choca con otra restricción única → falla ESA fila, el resto entra
  await c.query("insert into auth.users(id,email) values ($1,'b600@x.test'), ($2,'b601@x.test') on conflict do nothing", [u(600), u(601)]);
  const bad = { id: u(600), username: 'admin', role: 'user' };
  const good = { id: u(601), username: 'nueva', role: 'user' };
  const f = await A('rows', { t: 'authors', mode: 'upsert', rows: [bad, good] });
  ok(f.ok && f.v.fail === 1 && f.v.ins === 1, 'upsert con una autora que choca (username): 1 falla, 1 entra');
  ok(f.v.err.length === 1 && f.v.err[0].id === u(600) && /unique|duplicate|duplicada/i.test(f.v.err[0].e), 'y dice cuál (id) y por qué');
  ok((await num('select count(*) n from public.authors where id = $1', [u(601)])) === 1, 'la buena está en la base');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== rows · ensayo (dry): cuenta y no escribe');
{
  await reset();
  await S('works', [work(1), work(2)], 'add');
  const antes = await q('select id, xmin::text, title from public.works order by id');
  const d = await A('rows', { t: 'works', mode: 'add', dry: true, rows: [work(1), work(2), work(3), work(4)] });
  eq(d.v, { n: 4, ex: 2 }, 'ensayo: 4 filas, 2 ya existen');
  const d2 = await A('rows', { t: 'works', mode: 'upsert', dry: true, rows: [work(1), work(9)] });
  eq(d2.v, { n: 2, ex: 1 }, 'ensayo en modo upsert: igual (cuenta existentes)');
  const despues = await q('select id, xmin::text, title from public.works order by id');
  eq(despues, antes, 'no cambió ninguna fila (ni su xmin) y no se añadió ninguna');
  const d3 = await A('rows', { t: 'works', dry: true, rows: [] }); eq(d3.v, { n: 0, ex: 0 }, 'ensayo con lote vacío');
  const d4 = await A('wipe', { panels: [], dry: true }); eq(d4.v, { layers: 0, texts: 0, panels: 0 }, 'wipe en ensayo con lista vacía');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== columnas: generadas, ausentes, extra, bigint exacto, pesadas');
{
  await reset();
  await S('works', [work(1)], 'add');
  await S('panels', [panel(1, 1)], 'add');
  // generada: la copia trae layer_sha falso; la base lo calcula ella
  const g = await A('rows', { t: 'panel_layers', mode: 'add', rows: [layer(1, 1)] });
  ok(g.ok && g.v.ins === 1 && g.v.fail === 0, 'capa con layer_sha (columna generada) en el JSON → entra sin error');
  eq((await one('select layer_sha s, md5(layer_data) m from public.panel_layers where id = $1', [lid(1)])).s, (await one('select md5(layer_data) m from public.panel_layers where id = $1', [lid(1)])).m, 'y layer_sha lo calcula la base (el valor de la copia se ignora)');
  // ausentes: sin «published» → valor por defecto; sin «title» (NOT NULL) → falla esa fila
  const w2 = work(2); delete w2.published; delete w2.tags;
  const w3 = work(3); delete w3.published; delete w3.tags;
  const m = await A('rows', { t: 'works', mode: 'add', rows: [w2, w3] });
  ok(m.ok && m.v.ins === 2, 'filas sin las columnas «published» y «tags» → entran');
  eq((await one('select published, tags from public.works where id = $1', [u(2)])), { published: false, tags: [] }, 'con los valores por defecto de la base (no NULL)');
  const w4 = work(4); delete w4.title;
  const m2 = await A('rows', { t: 'works', mode: 'add', rows: [w4, work(5)] });
  ok(m2.ok && m2.v.fail === 2 && m2.v.ins === 0, 'si falta una columna NOT NULL sin defecto (title) en una fila, el lote usa solo las columnas comunes → ambas fallan y se cuentan');
  ok(/title|null/i.test(m2.v.err[0]?.e || ''), 'y el motivo menciona la columna');
  // extra: una columna que ya no existe se ignora
  const w6 = work(6); w6.columna_antigua = 'x';
  const m3 = await A('rows', { t: 'works', mode: 'add', rows: [w6] });
  ok(m3.ok && m3.v.ins === 1 && m3.v.fail === 0, 'una columna de la copia que ya no existe en la tabla se ignora');
  // bigint exacto (> 2^53): se manda el JSON a mano para no perder dígitos
  const raw = '{"t":"panel_layers","mode":"add","rows":[' + JSON.stringify(layer(2, 1)).replace('"big":null', '"big":9007199254740993') + ']}';
  const bg = await A('rows', raw);
  ok(bg.ok && bg.v.ins === 1, 'capa con bigint = 2^53+1 entra');
  eq((await one('select big::text b from public.panel_layers where id = $1', [lid(2)])).b, '9007199254740993', 'el bigint queda EXACTO (sin redondeo a doble)');
  // pesada: 3 MB de texto
  const pesado = 'x'.repeat(3 * 1024 * 1024) + 'ñ€😀';
  const ph = await A('rows', { t: 'panel_layers', mode: 'add', rows: [layer(3, 1, { layer_data: pesado })] });
  ok(ph.ok && ph.v.ins === 1, 'capa de 3 MB entra');
  eq((await one('select octet_length(layer_data) l, md5(layer_data) m from public.panel_layers where id = $1', [lid(3)])), { l: Buffer.byteLength(pesado), m: (await one('select md5($1::text) m', [pesado])).m }, 'con el mismo contenido (Unicode incluido)');
  // texto con caracteres delicados
  const raro = 'comillas "dobles" \'simples\' \\ barra \n salto \t tab \u0001 control $1 $$ ñ 日本 😀';
  const rr = await A('rows', { t: 'panel_texts', mode: 'add', rows: [{ ...text(1, 1), content: raro.replace('\u0001', '') }] });
  ok(rr.ok && rr.v.ins === 1, 'texto con comillas, barras, saltos, $$ y emojis entra');
  eq((await one('select content c from public.panel_texts where id = $1', [tid(1)])).c, raro.replace('\u0001', ''), 'y sale idéntico');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== fallo fila a fila: el resto del lote sí entra');
{
  await reset();
  await S('works', [work(1)], 'add');
  const rows = [panel(1, 1), panel(2, 99 /* obra inexistente */), panel(3, 1), panel(4, 1)];
  const r = await A('rows', { t: 'panels', mode: 'add', rows });
  ok(r.ok && r.v.n === 4 && r.v.ins === 3 && r.v.fail === 1, 'lote de 4 con una hoja huérfana (FK): entran 3, falla 1');
  ok(r.v.err[0].id === pid(2) && /foreign key|clave for/i.test(r.v.err[0].e), 'dice cuál (id) y que es la clave foránea');
  eq(await num('select count(*) n from public.panels'), 3, 'en la base hay 3 hojas');
  const all = await A('rows', { t: 'panels', mode: 'add', rows: Array.from({ length: 8 }, (_, i) => panel(50 + i, 98)) });
  ok(all.ok && all.v.fail === 8 && all.v.ins === 0 && all.v.err.length === 5, 'lote entero malo: fail=8 y solo se describen 5 errores');
  eq(await num('select count(*) n from public.panels'), 3, 'y no entró nada');
  const rep = await A('rows', { t: 'panels', mode: 'add', rows });
  ok(rep.ok && rep.v.ins === 0 && rep.v.fail === 1, 'repetir el mismo lote: ins=0 (ya estaban) y sigue fallando la huérfana');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== wipe: borra hojas con sus capas y textos');
{
  await reset();
  await S('works', [work(1), work(2)], 'add');
  await S('panels', [panel(1, 1), panel(2, 1), panel(3, 2)], 'add');
  await S('panel_layers', [layer(1, 1), layer(2, 1), layer(3, 2), layer(4, 3)], 'add');
  await S('panel_texts', [text(1, 1), text(2, 3)], 'add');
  const d = await A('wipe', { panels: [pid(1), pid(2), pid(77)], dry: true });
  eq(d.v, { layers: 3, texts: 1, panels: 2 }, 'ensayo: 3 capas, 1 texto, 2 hojas (la 77 no existe)');
  eq(await num('select count(*) n from public.panel_layers'), 4, 'el ensayo no borra nada');
  const w = await A('wipe', { panels: [pid(1), pid(2), pid(77)] });
  eq(w.v, { layers: 3, texts: 1, panels: 2 }, 'borrado real: mismas cifras');
  eq([await num('select count(*) n from public.panels'), await num('select count(*) n from public.panel_layers'), await num('select count(*) n from public.panel_texts'), await num('select count(*) n from public.works')], [1, 1, 1, 2], 'queda lo de la otra obra (1 hoja, 1 capa, 1 texto) y las 2 obras intactas');
  const w2 = await A('wipe', { panels: [pid(1)] }); eq(w2.v, { layers: 0, texts: 0, panels: 0 }, 'repetir es inofensivo');
  const w3 = await A('wipe', {}); eq(w3.v, { layers: 0, texts: 0, panels: 0 }, 'sin lista no borra nada');
  // atómico: si algo impide borrar la hoja, no se queda a medias (las capas siguen)
  await c.query('create table public.t_ref (id uuid primary key, p uuid references public.panels(id) on delete restrict)');
  await c.query('insert into public.t_ref values ($1, $2)', [u(900), pid(3)]);
  const w4 = await A('wipe', { panels: [pid(3)] });
  ok(!w4.ok && w4.code === '23503', 'si otra tabla impide borrar la hoja → error 23503');
  eq(await num('select count(*) n from public.panel_layers where panel_id = $1', [pid(3)]), 1, 'y NO se borraron sus capas (todo o nada)');
  await c.query('drop table public.t_ref');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== nav: el disparador de capas lo anula; «nav» lo devuelve donde falta');
{
  await reset();
  const NAV = { to: [pid(2)], v: 1 };
  await S('works', [work(1)], 'add');
  await S('panels', [panel(1, 1, { nav: NAV }), panel(2, 1, { nav: { to: [], v: 1 } })], 'add');
  eq((await one('select nav from public.panels where id = $1', [pid(1)])).nav, NAV, 'la hoja entra con su nav');
  await S('panel_layers', [layer(1, 1)], 'add');
  eq((await one('select nav from public.panels where id = $1', [pid(1)])).nav, null, 'al insertar una capa el disparador anula su nav (como en la base real)');
  eq((await one('select nav from public.panels where id = $1', [pid(2)])).nav, { to: [], v: 1 }, 'la hoja sin capas nuevas conserva el suyo');
  const r = await A('nav', { rows: [{ id: pid(1), nav: NAV }, { id: pid(2), nav: { otro: true } }, { id: pid(9), nav: { x: 1 } }, { id: pid(1), nav: null }] });
  eq(r.v, { n: 1 }, 'nav: se devuelve solo a la hoja 1 (la 2 ya tenía; la 9 no existe; el null no cuenta)');
  eq((await one('select nav from public.panels where id = $1', [pid(1)])).nav, NAV, 'la hoja 1 vuelve a tener su nav');
  eq((await one('select nav from public.panels where id = $1', [pid(2)])).nav, { to: [], v: 1 }, 'la 2 NO se sobrescribe');
  const r2 = await A('nav', { rows: [] }); eq(r2.v, { n: 0 }, 'sin filas: 0');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== columnas de identidad y tiempo máximo');
{
  await c.query('create table public.t_ident (id bigint generated always as identity primary key, v text)');
  await c.query('create table public.t_slow (id int primary key, v text)');
  await c.query("create function public.t_slow_f() returns trigger language plpgsql as $$ begin perform pg_sleep(0.2); return new; end $$");
  await c.query('create trigger t_slow_t before insert on public.t_slow for each row execute function public.t_slow_f()');
  const r = await A('rows', { t: 't_ident', mode: 'add', rows: [{ id: 7, v: 'a' }, { id: 12, v: 'b' }] });
  ok(r.ok && r.v.ins === 2 && r.v.fail === 0, 'identidad «always»: entra con los ids de la copia (overriding system value)');
  eq((await q('select id::int from public.t_ident order by id')).map(x => x.id), [7, 12], 'con los ids 7 y 12');
  const s = await A('rows', { t: 't_slow', mode: 'add', rows: [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 3, v: 'c' }, { id: 4, v: 'd' }] }, { timeout: '300ms' });
  ok(!s.ok && s.code === '57014', 'tiempo máximo (statement_timeout) → llega al cliente como 57014 (no se traga en el reintento fila a fila)');
  eq(await num('select count(*) n from public.t_slow'), 0, 'y no entró ninguna fila (todo o nada)');
  const s2 = await A('rows', { t: 't_slow', mode: 'add', rows: [{ id: 1, v: 'a' }] }, { timeout: '5s' });
  ok(s2.ok && s2.v.ins === 1, 'con tiempo suficiente, entra');
  await c.query('drop table public.t_ident, public.t_slow cascade; drop function public.t_slow_f()');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== recorrido completo: borrada → añadir; editada → sin duplicar; reemplazar');
{
  await reset();
  // «copia»: obra 1 con 2 hojas (3 capas, 1 texto)
  const copia = { works: [work(1)], panels: [panel(1, 1), panel(2, 1)], panel_layers: [layer(1, 1), layer(2, 1), layer(3, 2)], panel_texts: [text(1, 1)] };
  const put = async (mode, cp = copia) => { for (const t of ['works', 'panels', 'panel_layers', 'panel_texts']) if (cp[t].length) { const r = await A('rows', { t, mode, rows: cp[t] }); if (!r.ok || r.v.fail) return r; } return { ok: true }; };
  const cuenta = async () => [await num('select count(*) n from public.works'), await num('select count(*) n from public.panels'), await num('select count(*) n from public.panel_layers'), await num('select count(*) n from public.panel_texts')];
  eq(await cuenta(), [0, 0, 0, 0], 'base vacía (obra borrada)');
  ok((await put('add')).ok, 'añadir lo que falta');
  eq(await cuenta(), [1, 2, 3, 1], 'vuelve la obra: 1 obra, 2 hojas, 3 capas, 1 texto');
  ok((await put('add')).ok, 'repetir «añadir»');
  eq(await cuenta(), [1, 2, 3, 1], 'sin duplicar nada');
  // el usuario edita la obra después de la copia: capa 1 borrada y capa nueva con otro id
  await c.query('delete from public.panel_layers where id = $1', [lid(1)]);
  await c.query("insert into public.panel_layers(id,panel_id,layer_order,layer_type,layer_data) values ($1,$2,9,'ink','nueva capa')", [lid(100), pid(1)]);
  ok((await put('add')).ok, '«añadir» tras editar la obra');
  eq(await cuenta(), [1, 2, 4, 1], 'solo se añadió la capa que faltaba (la 1); la nueva (100) se queda: 4 capas, no se duplica la hoja');
  // reemplazar: wipe de las hojas de la base + insertar la versión de la copia
  const det = (await A('probe', { detail: [u(1)] })).v.detail[u(1)];
  eq([...det].sort(), [pid(1), pid(2)].sort(), 'probe da las hojas actuales de la obra');
  const wp = await A('wipe', { panels: det }); ok(wp.ok && wp.v.panels === 2 && wp.v.layers === 4, 'wipe de las 2 hojas (4 capas)');
  ok((await put('upsert')).ok, 'insertar la versión de la copia');
  eq(await cuenta(), [1, 2, 3, 1], 'queda EXACTAMENTE la versión de la copia (3 capas; la nueva 100 ya no está)');
  eq((await q('select id from public.panel_layers order by id')).map(x => x.id), [lid(1), lid(2), lid(3)], 'con los ids de la copia');
  // un fallo a mitad no deja un estado raro: repetir completa
  await A('wipe', { panels: [pid(1), pid(2)] });
  await S('panels', copia.panels, 'upsert');
  eq(await cuenta(), [1, 2, 0, 0], 'interrumpido tras las hojas (sin capas)');
  ok((await put('upsert')).ok, 'repetir el reemplazo');
  eq(await cuenta(), [1, 2, 3, 1], 'queda completo');
}

// ───────────────────────────────────────────────────────────────────────────────────────
console.log('=== permisos de la función');
{
  const p = await one("select has_function_privilege('anon','public.admin_restore(text,jsonb)','execute') a, has_function_privilege('authenticated','public.admin_restore(text,jsonb)','execute') u, has_function_privilege('public','public.admin_restore(text,jsonb)','execute') p");
  eq(p, { a: false, u: true, p: false }, 'anon: no; authenticated: sí; public: no');
  const f = await one("select prosecdef d, proconfig cfg from pg_proc where proname='admin_restore'");
  ok(f.d === true && JSON.stringify(f.cfg) === JSON.stringify(['search_path=""']), 'SECURITY DEFINER con search_path vacío');
}

console.log('\n' + pass + ' ✓  ' + fail + ' ✗');
await c.end();
process.exit(fail ? 1 : 0);
