// Datos de prueba de «Restaurar» (v42.50): una base con 5 obras parecidas a las reales + archivos de R2 + capas pesadas (en línea y como referencia).
import { W, ADMIN, MARIA, sha, rbytes, KB } from './rs_lib.mjs';

const U = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const WID = n => U('1', n);
export const PID = n => U('2', n);
export const BIG = (n) => String(9007199254740992n + BigInt(n));      // ids de 64 bits por encima de 2^53 (JavaScript los redondearía)

const heavy = (bytes, seed) => 'data:image/png;base64,' + rbytes(bytes, seed).toString('base64');
export const HEAVY_A = heavy(40 * KB, 11);       // ≈ 53 KB de texto, en línea en la obra 1 (intacta)
export const HEAVY_B = heavy(50 * KB, 12);       // ≈ 67 KB, en línea en la obra 3 (borrada)
export const HEAVY_C = heavy(30 * KB, 13);       // ≈ 40 KB, en la obra 3 pero guardada como referencia r2:… (con su texto en R2)
export const REF_C = 'r2:' + sha(Buffer.from(HEAVY_C, 'utf8')) + ':' + Buffer.byteLength(HEAVY_C);
export const SHA_B = sha(Buffer.from(HEAVY_B, 'utf8')), SHA_C = sha(Buffer.from(HEAVY_C, 'utf8'));
export const RARO = 'tinta "con comillas" \\ barra / ñandú ✓   salto';     // texto con caracteres delicados

export const FILES = {
  'anims/u1/a.png': { t: 'image/png', b: rbytes(20 * KB, 21) },       // la cita una capa de la obra 1 (intacta)
  'gifs/u1/g.gif': { t: 'image/gif', b: rbytes(9 * KB, 22) },         // la cita una capa de la obra 1
  'covers/u1/c.jpg': { t: 'image/jpeg', b: rbytes(7 * KB, 23) },      // portada de la obra 3 (borrada) · se borrará de R2
  'anims/u1/b.png': { t: 'image/png', b: rbytes(15 * KB, 24) },       // la cita una capa de la obra 3 · se borrará de R2
  'gifs/u1/h.gif': { t: 'image/gif', b: rbytes(5 * KB, 25) },         // la cita una capa de la hoja 10 (obra 4)
};

export async function sembrarR2(mf) {
  const bucket = await mf.getR2Bucket('COMXOW_BUCKET');
  for (const [k, v] of Object.entries(FILES)) await bucket.put(k, v.b, { httpMetadata: { contentType: v.t } });
  await bucket.put('blobs/' + SHA_C, HEAVY_C, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
  return bucket;
}

export async function sembrarBase(pg) {
  const ins = async (t, o) => {
    const ks = Object.keys(o);
    await pg.q(`insert into public.${t} (${ks.map(k => '"' + k + '"').join(',')}) overriding system value values (${ks.map((_, i) => '$' + (i + 1)).join(',')})`,
      ks.map(k => { const v = o[k]; return (v !== null && typeof v === 'object') ? JSON.stringify(v) : v; }));
  };
  const work = (n, t, x) => ins('works', Object.assign({ id: WID(n), author_id: MARIA, author_name: 'María', title: t, genre: 'comic', nav_mode: 'linear', social: { likes: n }, panel_count: 1, rules: { a: n }, palette: ['#000000', '#ffffff'], published: true, pending_review: false, cover_url: null, updated_at: '2026-10-01T10:00:00.123456+00:00' }, x || {}));
  const pan = (n, w, ord) => ins('panels', { id: PID(n), work_id: WID(w), panel_order: ord, orientation: 'portrait', text_mode: 'bubbles', data_url: null });
  const lay = (id, p, ord, type, data, x) => ins('panel_layers', Object.assign({ id, panel_id: PID(p), layer_order: ord, layer_type: type, layer_data: data, gif_url: null, anim_url: null }, x || {}));
  const txt = (id, p, ord, t) => ins('panel_texts', { id, panel_id: PID(p), text_order: ord, type: 'bubble', style: 'conventional', has_tail: true, tail_starts: '[{"x":-0.4,"y":0.4}]', x: 0.3, y: 0.25, w: 0.3, h: 0.15, text: t });
  await work(1, 'Obra completa', { panel_count: 3 });
  await work(2, 'Obra editada', { panel_count: 2 });
  await work(3, 'Obra borrada', { panel_count: 2, cover_url: `${W}/covers/u1/c.jpg?t=1699999999` });
  await work(4, 'Obra con hojas borradas', { panel_count: 4, author_name: 'Ana' });
  await work(5, '', { author_name: null, published: false });
  for (const [n, w, o] of [[1, 1, 0], [2, 1, 1], [3, 1, 2], [4, 2, 0], [5, 2, 1], [6, 3, 0], [7, 3, 1], [8, 4, 0], [9, 4, 1], [10, 4, 2], [11, 4, 3], [12, 5, 0]]) await pan(n, w, o);
  await lay('1', 1, 0, 'ink', 'ink-1');
  await lay('2', 1, 1, 'anim', '{}', { anim_url: `${W}/anims/u1/a.png` });
  await lay('3', 1, 2, 'img', HEAVY_A);
  await lay('4', 2, 0, 'ink', 'ink-4');
  await lay('5', 3, 0, 'gif', '{}', { gif_url: `${W}/gifs/u1/g.gif` });
  await lay('6', 4, 0, 'ink', 'ink-6');
  await lay('7', 5, 0, 'ink', 'ink-7');
  await lay('8', 5, 1, 'ink', 'ink-8');
  await lay(BIG(1), 6, 0, 'img', HEAVY_B);
  await lay(BIG(2), 6, 1, 'img', REF_C);
  await lay(BIG(3), 6, 2, 'ink', RARO);
  await lay(BIG(4), 7, 0, 'anim', `{"src":"${W}/anims/u1/b.png","x":1}`, { anim_url: `${W}/anims/u1/b.png` });
  await lay('13', 8, 0, 'ink', 'ink-13');
  await lay('14', 9, 0, 'ink', 'ink-14');
  await lay('15', 10, 0, 'ink', 'ink-15');
  await lay('16', 10, 1, 'gif', '{}', { gif_url: `${W}/gifs/u1/h.gif` });
  await lay('17', 11, 0, 'ink', 'ink-17');
  await lay('18', 12, 0, 'ink', 'ink-18');
  await txt('1', 1, 0, '¡Hola, mundo! "citado"'); await txt('2', 1, 1, 'segundo');
  await txt('3', 5, 0, 'obra 2');
  await txt(BIG(5), 6, 0, 'texto de la obra borrada'); await txt(BIG(6), 7, 0, 'otro');
  await txt('6', 8, 0, 'h8'); await txt('7', 10, 0, 'h10'); await txt('8', 11, 0, 'h11');
  // el resumen de navegación (panels.nav) se escribe DESPUÉS de las capas: insertar una capa lo anula (disparador)
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) await pg.q('update public.panels set nav = $2::jsonb where id = $1', [PID(n), JSON.stringify({ v: 1, to: [n + 1, n + 2], n })]);
  await pg.q("select setval(pg_get_serial_sequence('public.panel_layers','id'), 1000), setval(pg_get_serial_sequence('public.panel_texts','id'), 1000)");   // como en la base real: la secuencia va por delante de todos los ids que existen
  await pg.q("insert into public.biblioteca (id, owner_id, name, kind, data) values ('50000000-0000-4000-8000-000000000001', $1, 'Pincel A', 'brush', 'datos A'), ('50000000-0000-4000-8000-000000000002', $1, 'Pincel B', 'brush', 'datos B')", [MARIA]);
}

// Foto de la base: por tabla, una entrada por fila { id, j: texto exacto de la fila (sin layer_data ni layer_sha), ld: layer_data }
export async function snap(pg) {
  const out = {};
  const T = { works: 'works', panels: 'panels', layers: 'panel_layers', texts: 'panel_texts', bib: 'biblioteca', authors: 'authors' };
  for (const [k, t] of Object.entries(T)) {
    const rows = await pg.q(`select t.id::text as id, (to_jsonb(t) ${t === 'panel_layers' ? "- 'layer_data' - 'layer_sha'" : ''})::text as j, ${t === 'panel_layers' ? 't.layer_data' : 'null::text'} as ld, ${t === 'panels' ? 't.work_id::text' : (t === 'panel_layers' || t === 'panel_texts') ? 't.panel_id::text' : 'null::text'} as parent from public.${t} t order by t.id`);
    out[k] = new Map(rows.map(r => [r.id, r]));
  }
  return out;
}
export const ids = (m) => Array.from(m.keys());
export const mismos = (a, b, pick) => { // a, b: Map; pick: ids → ¿filas idénticas (j y ld)?
  for (const id of pick) { const x = a.get(id), y = b.get(id); if (!x || !y || x.j !== y.j || x.ld !== y.ld) return false; }
  return true;
};
