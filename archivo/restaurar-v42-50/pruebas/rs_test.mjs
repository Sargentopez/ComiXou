// «Restaurar» (v42.50) de extremo a extremo.  APP_URL=http://127.0.0.1:8768/ NODE_PATH=$(npm root -g) node rs_test.mjs [escenario…]
import { ok, resumen, sleep, sha, Pg, mkWorker, launch, txt, esperar, esperarFase, fase, nuevaCopia, cargar, elegirObra, W, ADMIN, TUTOR, MARIA, jwtFor, falloT57014, rbytes, KB } from './rs_lib.mjs';
import { WID, PID, BIG, HEAVY_A, HEAVY_B, HEAVY_C, REF_C, SHA_B, SHA_C, RARO, FILES, sembrarR2, sembrarBase, snap, ids, mismos } from './rs_data.mjs';

const SCEN = {};
const bytesDe = (s) => Buffer.byteLength(s, 'utf8');

async function entorno(opts) {
  opts = opts || {};
  const pg = new Pg(); await pg.connect(); await pg.reset({ sinRestore: opts.sinRestore });
  const mf = mkWorker(); const ctl = { log: [], fail: {} };
  await sembrarBase(pg); const bucket = await sembrarR2(mf);
  const L = await launch(pg, mf, ctl, opts);
  const E = Object.assign({ pg, mf, ctl, bucket, opts }, L);
  E.cerrar = async () => { try { await L.browser.close(); } catch (_) {} try { await mf.dispose(); } catch (_) {} try { await pg.end(); } catch (_) {} };
  return E;
}
async function desastre(E) {
  const { pg, bucket } = E;
  await pg.q('delete from public.works where id = $1', [WID(3)]);                                              // obra 3 borrada entera (cascada)
  await pg.q('delete from public.panels where id = any($1::uuid[])', [[PID(10), PID(11)]]);                    // obra 4: faltan 2 hojas
  await pg.q('delete from public.panel_layers where panel_id = any($1::uuid[])', [[PID(4), PID(5)]]);          // obra 2 editada: capas nuevas con otros ids
  await pg.q("insert into public.panel_layers (panel_id, layer_order, layer_type, layer_data) values ($1,0,'ink','NUEVA-1'), ($2,0,'ink','NUEVA-2'), ($2,1,'ink','NUEVA-3')", [PID(4), PID(5)]);
  await pg.q("update public.works set title = 'Obra editada (v2)' where id = $1", [WID(2)]);
  await pg.q("delete from public.biblioteca where id = '50000000-0000-4000-8000-000000000002'");
  await bucket.delete(['covers/u1/c.jpg', 'anims/u1/b.png', 'blobs/' + SHA_C]);                                 // y R2 pierde la portada, una animación y un blob
}
const r2Get = async (bucket, k) => { const o = await bucket.get(k); return o ? Buffer.from(await o.arrayBuffer()) : null; };
const puts = (ctl) => ctl.log.filter(x => x.m === 'PUT').map(x => x.k).sort();
const hecho = async (page, ms) => { await esperarFase(page, 'hecho', ms || 90000); };

// ═════════════════════════════════════════════════════════════════════════════════════════════════
SCEN.core = async () => {
  console.log('=== core: obra borrada + hojas borradas se restauran; lo demás no se toca; capas pesadas y archivos vuelven a R2; ensayo sin escribir');
  const E = await entorno(); const { pg, page, ctl, bucket, errs } = E;
  try {
    const B = await nuevaCopia(page);
    ok(B.files && B.files.n === 5 && B.r2.n === 1, 'copia real hecha con admin_backup: 5 archivos de R2 y 1 capa pesada expandida', { files: B.files, r2: B.r2 });
    const before = await snap(pg);
    await desastre(E);
    const mid = await snap(pg);
    ctl.log = []; pg.calls = [];

    await cargar(page, B.buf);
    let t = await txt(page);
    ok(await fase(page) === 'elegir' && /Archivo íntegro/.test(t), 'el archivo se lee y está íntegro', t.slice(0, 400));
    ok(/Obras en la copia: 5 — borradas: 1 · con hojas que faltan: 1 · completas: 3/.test(t), 'cuenta: 5 obras → 1 borrada, 1 con hojas que faltan, 3 completas', t.match(/[^\n]*Obras en la copia[^\n]*/));
    ok(/tablas: 8/.test(t) && /archivos de R2: 5/.test(t), 'resumen: 8 tablas y 5 archivos de R2', t.match(/[^\n]*tablas[^\n]*/));
    const orden = await page.evaluate(() => Array.from(document.querySelectorAll('#testPanel .rs-obra')).map(e => e.querySelector('.rs-obra-t').innerText.replace(/\s+/g, ' ').trim()));
    ok(orden.length === 5 && /Obra borrada.*borrada/.test(orden[0]) && /Obra con hojas borradas.*hojas que faltan: 2/.test(orden[1]) && /ya está completa/.test(orden[2]) && /\(sin título\)/.test(orden[2]) , 'la lista: primero la borrada, luego la de hojas que faltan, luego las completas; la obra sin título se nombra', orden);
    ok(await page.evaluate(() => document.getElementById('rsRevisar').disabled), 'sin nada marcado, «Revisar y restaurar» está desactivado');
    ok(await page.evaluate(() => Array.from(document.querySelectorAll('#testPanel select.rs-sel')).every(s => s.value === '')), 'de serie ninguna obra viene marcada');
    ok(await page.evaluate(() => { const o = document.querySelector('select[data-rs-obra="' + '10000000-0000-4000-8000-000000000001' + '"] option[value="add"]'); return o && o.disabled; }), 'en una obra completa, «Añadir» está desactivado');

    await page.click('#testPanel [data-rs="marcar-faltan"]');
    t = await txt(page);
    ok(/Marcadas: 2 para añadir · 0 para reemplazar/.test(t), '«Marcar las que faltan» marca las 2 (no toca las completas)', t.match(/[^\n]*Marcadas[^\n]*/));
    ok(!(await page.evaluate(() => document.getElementById('rsRevisar').disabled)), 'y ya se puede revisar');

    // ── ENSAYO: no escribe nada ──
    await page.click('#rsRevisar');
    await esperarFase(page, 'ensayo');
    const E1 = await page.evaluate(() => { const e = AdminRestore._state.ens; return { obras: e.obras.map(o => ({ id: o.id, modo: o.modo, existe: o.existe, hojas: o.hojas, capas: o.capas, textos: o.textos, borra: o.borra })), pes: e.pesadas, arch: e.archivos, filas: e.filas, tablas: e.tablas }; });
    const o3 = E1.obras.find(o => o.id === WID(3)), o4 = E1.obras.find(o => o.id === WID(4));
    ok(E1.obras.length === 2 && o3 && o3.hojas === 2 && o3.capas === 4 && o3.textos === 2 && !o3.existe, 'ensayo, obra 3: se crea entera (2 hojas, 4 capas, 2 textos)', o3);
    ok(o4 && o4.hojas === 2 && o4.capas === 3 && o4.textos === 2 && o4.existe, 'ensayo, obra 4: solo las 2 hojas que faltan (3 capas, 2 textos)', o4);
    ok(E1.pes.n === 2 && E1.pes.yaEnR2 === 0 && E1.pes.subir === 2 && E1.pes.bytes === bytesDe(HEAVY_B) + bytesDe(HEAVY_C), 'ensayo: 2 capas pesadas, ninguna está ya en R2, bytes exactos', E1.pes);
    ok(E1.arch.enCopia === 3 && E1.arch.yaEnR2 === 1 && E1.arch.subir === 2 && E1.arch.bytes === FILES['covers/u1/c.jpg'].b.length + FILES['anims/u1/b.png'].b.length && E1.arch.sinCopia === 0, 'ensayo: 3 archivos citados; 1 ya está en R2 (h.gif) y 2 se subirán, con sus bytes', E1.arch);
    t = await txt(page);
    ok(/Esto es lo que va a pasar/.test(t) && /Todavía no se ha cambiado nada/.test(t) && /Las cuentas de usuario no se tocan/.test(t), 'la pantalla del ensayo lo dice claro');
    ok(!(await page.evaluate(() => document.getElementById('rsGo').disabled)), 'sin «reemplazar» no hace falta confirmar nada más: «Restaurar ahora» activo');
    const s1 = await snap(pg);
    ok(pg.writes().length === 0, 'el ensayo NO ha hecho ninguna escritura en la base', pg.writes().map(c => c.op));
    ok(['works', 'panels', 'layers', 'texts', 'bib'].every(k => ids(s1[k]).join() === ids(mid[k]).join() && mismos(s1[k], mid[k], ids(mid[k]))), 'la base es exactamente la misma antes y después del ensayo');
    ok(puts(ctl).length === 0, 'y R2 no ha recibido ninguna subida durante el ensayo', puts(ctl));

    // ── RESTAURAR ──
    const t0 = Date.now();
    await page.click('#rsGo');
    await hecho(page);
    const ms = Date.now() - t0;
    t = await txt(page);
    ok(/Restauración terminada/.test(t) && !/con problemas/.test(t), 'termina sin problemas', t.slice(0, 300));
    const after = await snap(pg);
    const idsW3 = [PID(6), PID(7)];
    ok(after.works.size === 5 && after.panels.size === 12 && after.layers.size === 18 && after.texts.size === 8, 'recuentos finales: 5 obras · 12 hojas · 18 capas · 8 textos (como al hacer la copia, sin duplicados)', [after.works.size, after.panels.size, after.layers.size, after.texts.size]);
    ok(mismos(after.works, before.works, [WID(3)]), 'obra 3 recreada: la fila es idéntica a la original (incluidas fechas)');
    ok(mismos(after.panels, before.panels, [PID(6), PID(7), PID(10), PID(11)]), 'hojas 6, 7, 10 y 11 idénticas a las originales (con su resumen de navegación recuperado)', [PID(6), PID(10)].map(i => [after.panels.get(i) && after.panels.get(i).j, before.panels.get(i).j]));
    ok(after.panels.get(PID(6)).j.includes('"nav": {"n": 6') || /"nav": \{[^}]*"n": 6/.test(after.panels.get(PID(6)).j), 'panels.nav de la hoja 6 está de vuelta (el disparador lo había anulado)', after.panels.get(PID(6)).j);
    const L9 = after.layers.get(BIG(1)), L10 = after.layers.get(BIG(2)), L11 = after.layers.get(BIG(3));
    ok(L9 && L9.ld === 'r2:' + SHA_B + ':' + bytesDe(HEAVY_B), 'capa pesada (id > 2^53) entra como referencia r2:<huella>:<bytes> exacta', L9 && L9.ld.slice(0, 90));
    ok(L10 && L10.ld === REF_C, 'la otra capa pesada vuelve a ser exactamente su referencia original', L10 && L10.ld.slice(0, 90));
    ok(L11 && L11.ld === RARO && before.layers.get(BIG(3)).ld === RARO, 'una capa con comillas, barras, ñ y U+2028 vuelve idéntica, byte a byte');
    ok(mismos(after.layers, before.layers, [BIG(1), BIG(2), BIG(3), BIG(4), '15', '16', '17'].filter(i => i !== BIG(1) && i !== BIG(2))) && ['j'].every(() => after.layers.get(BIG(1)).j === before.layers.get(BIG(1)).j && after.layers.get(BIG(2)).j === before.layers.get(BIG(2)).j), 'y el resto de columnas de todas las capas restauradas es idéntico (ids de 64 bits exactos)');
    ok(mismos(after.texts, before.texts, [BIG(5), BIG(6), '7', '8']), 'textos restaurados idénticos (obra 3 y hojas 10 y 11)');
    ok(mismos(after.panels, mid.panels, [PID(8), PID(9), PID(1), PID(2), PID(3), PID(4), PID(5), PID(12)]) && mismos(after.layers, mid.layers, ['13', '14', '1', '2', '3', '4', '5', '18']), 'lo que ya estaba (hojas 8 y 9, obras 1 y 5) no se ha tocado');
    ok(after.works.get(WID(2)).j === mid.works.get(WID(2)).j && /Obra editada \(v2\)/.test(after.works.get(WID(2)).j) && ids(after.layers).filter(i => after.layers.get(i).parent === PID(4) || after.layers.get(i).parent === PID(5)).length === 3, 'la obra 2 (editada después de la copia) sigue editada y sin duplicados');
    ok(after.bib.size === 1, 'la biblioteca no se ha tocado (no se marcó «otras tablas»)');
    const b3 = await r2Get(bucket, 'covers/u1/c.jpg'), b4 = await r2Get(bucket, 'anims/u1/b.png');
    ok(b3 && b3.equals(FILES['covers/u1/c.jpg'].b) && b4 && b4.equals(FILES['anims/u1/b.png'].b), 'R2: portada y animación vuelven con los bytes exactos');
    const cb = await r2Get(bucket, 'blobs/' + SHA_B), cc = await r2Get(bucket, 'blobs/' + SHA_C);
    ok(cb && cb.toString('utf8') === HEAVY_B && cc && cc.toString('utf8') === HEAVY_C, 'R2: los dos blobs de capas pesadas, con el texto exacto');
    ok(puts(ctl).join('|') === ['anims/u1/b.png', 'blobs/' + SHA_B, 'blobs/' + SHA_C, 'covers/u1/c.jpg'].sort().join('|'), 'al Worker solo se subió lo que faltaba: 2 blobs + portada + animación', puts(ctl));
    const rowsCalls = pg.calls.filter(c => c.fn === 'admin_restore' && c.op === 'rows' && !c.dry);
    const idsW = rowsCalls.filter(c => c.t === 'works').flatMap(c => c.ids), idsP = rowsCalls.filter(c => c.t === 'panels').flatMap(c => c.ids);
    ok(idsW.join() === WID(3) && idsP.slice().sort().join() === [PID(6), PID(7), PID(10), PID(11)].sort().join(), 'a la base solo se mandaron la obra 3 y las 4 hojas que faltaban', { idsW, idsP });
    ok(rowsCalls.every(c => c.mode === 'add'), 'todo en modo «añadir» (nunca sobrescribe)');
    ok(/Archivos de R2|R2/.test(t) && /Capas pesadas en R2: 2/.test(t) && /Resumen de navegación recuperado → hojas: 4/.test(t), 'el resumen final habla de R2 y de la navegación (4 hojas)', t.slice(0, 900));
    ok(ms < 20000, 'tarda poco (' + ms + ' ms)', ms);

    // ── repetir: ya no falta nada ──
    await page.click('#testPanel [data-rs="volver-inicio"]');
    await cargar(page, B.buf);
    t = await txt(page);
    ok(/Obras en la copia: 5 — borradas: 0 · con hojas que faltan: 0 · completas: 5/.test(t), 'al repetir: 0 borradas, 0 incompletas, 5 completas', t.match(/[^\n]*Obras en la copia[^\n]*/));
    await page.click('#testPanel [data-rs="marcar-faltan"]');
    ok(await page.evaluate(() => document.getElementById('rsRevisar').disabled), 'y «Marcar las que faltan» no marca nada: no hay nada que restaurar');
    ok(!/undefined|NaN|\[object|adminRs[A-Z]/.test(t), 'sin «undefined», «NaN» ni claves de texto sin traducir');
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};


const revisar = async (page) => { await page.click('#rsRevisar'); await esperarFase(page, 'ensayo'); };
const marcar = (page) => page.click('#testPanel [data-rs="marcar-faltan"]');
import zlib from 'node:zlib';
const gunzipTxt = (buf) => zlib.gunzipSync(buf).toString('utf8');
const gzipTxt = (t) => zlib.gzipSync(Buffer.from(t, 'utf8'));
const mismaBase = (A, Bm, keys) => keys.every(k => ids(A[k]).join() === ids(Bm[k]).join() && mismos(A[k], Bm[k], ids(Bm[k])));

// ═════════════════════════════════════════════════════════════════════════════════════════════════
SCEN.replace = async () => {
  console.log('=== replace: «Reemplazar por la copia» deja la obra EXACTAMENTE como en la copia (y confirma antes de borrar)');
  const E = await entorno(); const { pg, page, ctl, bucket, errs } = E;
  try {
    const B = await nuevaCopia(page);
    const before = await snap(pg);
    await desastre(E);
    const mid = await snap(pg);
    pg.calls = []; ctl.log = [];
    await cargar(page, B.buf);
    await elegirObra(page, WID(2), 'replace');
    await elegirObra(page, WID(3), 'replace');
    let t = await txt(page);
    ok(/Marcadas: 0 para añadir · 2 para reemplazar/.test(t), 'la cuenta de marcadas: 0 añadir · 2 reemplazar', t.match(/[^\n]*Marcadas[^\n]*/));
    await revisar(page);
    const E1 = await page.evaluate(() => AdminRestore._state.ens.obras.map(o => ({ id: o.id, modo: o.modo, existe: o.existe, hojas: o.hojas, capas: o.capas, textos: o.textos, borra: o.borra })));
    const o2 = E1.find(o => o.id === WID(2)), o3 = E1.find(o => o.id === WID(3));
    ok(o2 && o2.modo === 'replace' && o2.existe && o2.hojas === 2 && o2.capas === 3 && o2.textos === 1 && o2.borra && o2.borra.hojas === 2 && o2.borra.capas === 3 && o2.borra.textos === 1, 'ensayo: la obra 2 se reemplaza (2 hojas, 3 capas, 1 texto) y cuenta lo que se borrará (2 hojas, 3 capas NUEVAS, 1 texto)', o2);
    ok(o3 && !o3.existe && o3.hojas === 2 && !o3.borra, 'ensayo: «reemplazar» una obra que ya no existe equivale a crearla (no borra nada)', o3);
    t = await txt(page);
    ok(/Reemplazar BORRA lo que hay ahora/.test(t) && /Se borra lo de ahora → hojas: 2 · capas: 3 · textos: 1/.test(t), 'la pantalla avisa con claridad de que se borra y cuánto', t.match(/[^\n]*(BORRA|Se borra)[^\n]*/g));
    ok(await page.evaluate(() => document.getElementById('rsGo').disabled), '«Restaurar ahora» está BLOQUEADO hasta confirmar');
    ok(pg.writes().length === 0, 'y todavía no se ha escrito nada');
    await page.check('#rsEntiendo');
    ok(!(await page.evaluate(() => document.getElementById('rsGo').disabled)), 'al marcar «Entiendo…» se activa');
    await page.uncheck('#rsEntiendo');
    ok(await page.evaluate(() => document.getElementById('rsGo').disabled), 'y al desmarcarlo se vuelve a bloquear');
    await page.check('#rsEntiendo');
    await page.click('#rsGo');
    await hecho(page);
    t = await txt(page);
    ok(/Restauración terminada/.test(t) && /Borrado de lo anterior en las obras reemplazadas → hojas: 2 · capas: 3 · textos: 1/.test(t), 'terminó y cuenta lo borrado', t.slice(0, 500));
    const after = await snap(pg);
    ok(mismos(after.works, before.works, [WID(2), WID(3)]), 'obras 2 y 3: filas idénticas a las de la copia (el título de la 2 vuelve a «Obra editada»)', after.works.get(WID(2)).j.slice(0, 200));
    ok(mismos(after.panels, before.panels, [PID(4), PID(5), PID(6), PID(7)]), 'sus hojas, idénticas (con el resumen de navegación)');
    ok(mismos(after.layers, before.layers, ['6', '7', '8', BIG(3), BIG(4)]) && after.layers.get(BIG(1)).j === before.layers.get(BIG(1)).j, 'las capas ORIGINALES de la obra 2 (ids 6, 7, 8) han vuelto y las «NUEVA-*» ya no están');
    ok(!ids(after.layers).some(i => after.layers.get(i).ld && /^NUEVA/.test(after.layers.get(i).ld)), 'ninguna capa NUEVA queda en la base');
    ok(mismos(after.texts, before.texts, ['3', BIG(5), BIG(6)]), 'y los textos');
    ok(after.works.size === 5 && after.panels.size === 10 && after.layers.size === 15 && after.texts.size === 6, 'recuentos: 5 obras · 10 hojas (faltan las 2 de la obra 4 que no se pidieron) · 15 capas · 6 textos', [after.works.size, after.panels.size, after.layers.size, after.texts.size]);
    ok(mismos(after.panels, mid.panels, [PID(1), PID(2), PID(3), PID(8), PID(9), PID(12)]) && mismos(after.works, mid.works, [WID(1), WID(4), WID(5)]), 'lo que no se pidió (obras 1, 4 y 5) queda como estaba');
    const wipes = pg.calls.filter(c => c.op === 'wipe' && !/"dry"/.test(c.argText));
    ok(wipes.length === 1 && JSON.parse(wipes[0].argText).panels.slice().sort().join() === [PID(4), PID(5)].sort().join(), 'solo se borraron las hojas ACTUALES de la obra 2 (la 3 no existía)', wipes.map(w => w.argText));
    const modos = pg.calls.filter(c => c.op === 'rows' && !c.dry).map(c => c.t + ':' + c.mode).join(' ');
    ok(/works:upsert/.test(modos) && /panels:upsert/.test(modos) && /panel_layers:add/.test(modos), 'obras y hojas por «upsert»; capas y textos por «add» (tras borrar no hay a qué chocar)', modos);
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.cancel = async () => {
  console.log('=== cancel: cancelar a mitad deja la base coherente y volver a lanzar termina sin duplicar');
  const E = await entorno(); const { pg, page, ctl, errs } = E;
  try {
    const B = await nuevaCopia(page);
    const before = await snap(pg);
    await desastre(E);
    pg.calls = []; ctl.log = [];
    await cargar(page, B.buf);
    await marcar(page); await revisar(page);
    pg.delay = 900;
    await page.click('#rsGo');
    for (let i = 0; i < 100 && pg.writes().length < 1; i++) await sleep(50);
    ok(pg.writes().length >= 1, 'ya hay una escritura en curso');
    await page.click('#testPanel [data-rs="cancelar"]');
    await hecho(page, 20000);
    let t = await txt(page);
    ok(/Restauración cancelada/.test(t) && /Es seguro volver a lanzarla/.test(t), 'pantalla «Restauración cancelada» con el aviso de que es seguro repetir', t.slice(0, 300));
    pg.delay = 0;
    await sleep(1500);                                              // la llamada que ya estaba en la base termina sola
    const parcial = await snap(pg);
    ok(parcial.layers.size <= 18 && ids(parcial.layers).length === new Set(ids(parcial.layers)).size, 'estado parcial: sin duplicados (' + parcial.works.size + ' obras, ' + parcial.panels.size + ' hojas, ' + parcial.layers.size + ' capas)');
    await page.click('#testPanel [data-rs="volver-inicio"]');
    await cargar(page, B.buf);
    t = await txt(page);
    ok(await fase(page) === 'elegir', 'se vuelve a cargar la copia');
    await marcar(page);
    await revisar(page);
    await page.click('#rsGo');
    await hecho(page);
    t = await txt(page);
    ok(/Restauración terminada/.test(t) && !/con problemas/.test(t), 'la segunda vez termina sin problemas', t.slice(0, 300));
    const after = await snap(pg);
    ok(after.works.size === 5 && after.panels.size === 12 && after.layers.size === 18 && after.texts.size === 8, 'recuentos finales exactos: 5 · 12 · 18 · 8', [after.works.size, after.panels.size, after.layers.size, after.texts.size]);
    ok(mismos(after.panels, before.panels, [PID(6), PID(7), PID(10), PID(11)]) && mismos(after.texts, before.texts, [BIG(5), BIG(6), '7', '8']), 'y lo restaurado es idéntico a la copia');
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.r2down_retry = async () => {
  console.log('=== r2down_retry: R2 caído → se para ANTES de tocar la base; reintentar con R2 de vuelta lo termina');
  const E = await entorno({ fast: true }); const { pg, page, ctl, bucket, errs } = E;
  try {
    const B = await nuevaCopia(page);
    const before = await snap(pg);
    await desastre(E);
    const mid = await snap(pg);
    await cargar(page, B.buf);
    await marcar(page); await revisar(page);
    pg.calls = []; ctl.log = []; ctl.down = true;
    await page.click('#rsGo');
    await esperarFase(page, 'r2fallo', 60000);
    let t = await txt(page);
    ok(/R2 no ha respondido para algunas capas pesadas/.test(t) && /No se ha cambiado nada en la base\. Capas pesadas que no se pudieron subir a R2: 2/.test(t), 'pantalla de pausa: «No se ha cambiado nada… 2 capas pesadas»', t.slice(0, 500));
    ok(/Reintentar/.test(t) && /Continuar guardándolas en la base/.test(t) && /Cancelar/.test(t), 'con los tres botones: reintentar, continuar en la base, cancelar');
    ok(pg.writes().length === 0, 'la base NO se ha tocado (ni una escritura)');
    const s1 = await snap(pg);
    ok(mismaBase(s1, mid, ['works', 'panels', 'layers', 'texts', 'bib']), 'y es idéntica a antes de empezar');
    await page.click('#testPanel [data-rs="r2-reintentar"]');
    await esperarFase(page, 'r2fallo', 60000);
    ok(pg.writes().length === 0, 'reintentar con R2 todavía caído: vuelve a la pausa, sin escribir nada');
    ctl.down = false; ctl.log = [];
    await page.click('#testPanel [data-rs="r2-reintentar"]');
    await hecho(page);
    t = await txt(page);
    ok(/Restauración terminada/.test(t) && !/con problemas/.test(t), 'con R2 de vuelta, reintentar termina bien', t.slice(0, 400));
    const after = await snap(pg);
    ok(after.layers.get(BIG(1)).ld === 'r2:' + SHA_B + ':' + bytesDe(HEAVY_B) && after.layers.get(BIG(2)).ld === REF_C, 'las capas pesadas entran como referencia');
    const cb = await r2Get(bucket, 'blobs/' + SHA_B), cc = await r2Get(bucket, 'blobs/' + SHA_C), b3 = await r2Get(bucket, 'covers/u1/c.jpg'), b4 = await r2Get(bucket, 'anims/u1/b.png');
    ok(cb && cb.toString() === HEAVY_B && cc && cc.toString() === HEAVY_C && b3 && b3.equals(FILES['covers/u1/c.jpg'].b) && b4 && b4.equals(FILES['anims/u1/b.png'].b), 'R2 tiene los 2 blobs y los 2 archivos con el contenido exacto');
    ok(after.works.size === 5 && after.panels.size === 12 && after.layers.size === 18 && after.texts.size === 8, 'recuentos finales exactos', [after.works.size, after.panels.size, after.layers.size, after.texts.size]);
    ok(/Archivos de R2: subidos 2 · ya estaban 1/.test(t), 'el resumen cuenta los archivos de R2 una sola vez: 2 subidos, 1 ya estaban (h.gif)', t.match(/[^\n]*Archivos de R2[^\n]*/));
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.r2down_inline = async () => {
  console.log('=== r2down_inline: R2 caído → «Continuar guardándolas en la base» restaura todo, con las capas pesadas dentro de la base');
  const E = await entorno({ fast: true }); const { pg, page, ctl, bucket, errs } = E;
  try {
    const B = await nuevaCopia(page);
    const before = await snap(pg);
    await desastre(E);
    await cargar(page, B.buf);
    await marcar(page); await revisar(page);
    pg.calls = []; ctl.log = []; ctl.down = true;
    await page.click('#rsGo');
    await esperarFase(page, 'r2fallo', 60000);
    await page.click('#testPanel [data-rs="r2-seguir"]');
    await hecho(page);
    const t = await txt(page);
    const after = await snap(pg);
    ok(/Restauración terminada con problemas/.test(t), 'termina «con problemas» (los archivos de R2 no se pudieron restaurar)', t.slice(0, 200));
    ok(/Capas pesadas que han entrado con su texto dentro de la base \(R2 no respondió\): 2/.test(t), 'avisa de que 2 capas pesadas entraron con su texto en la base', t.match(/[^\n]*capas pesadas[^\n]*/g));
    ok(/Archivos de R2 que no se pudieron restaurar: 3/.test(t), 'y de que 3 archivos de R2 no se pudieron restaurar (los 2 que faltaban y el que no se pudo comprobar)', t.match(/[^\n]*archivos de R2[^\n]*/g));
    ok(after.layers.get(BIG(1)).ld === HEAVY_B && after.layers.get(BIG(2)).ld === HEAVY_C, 'las capas pesadas están en la base con su texto exacto (id > 2^53 correcto)');
    ok(after.works.size === 5 && after.panels.size === 12 && after.layers.size === 18 && after.texts.size === 8, 'recuentos finales exactos', [after.works.size, after.panels.size, after.layers.size, after.texts.size]);
    ok(mismos(after.panels, before.panels, [PID(6), PID(7), PID(10), PID(11)]), 'hojas idénticas a las de la copia');
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.errors = async () => {
  console.log('=== errors: SQL sin instalar (404), cuenta sin permiso (403), cuota (402), corte de red con reintento, fallo del servidor a mitad');
  // 1 · la función no está instalada
  {
    const E = await entorno({ sinRestore: true }); const { page, errs } = E;
    try {
      const B = await nuevaCopia(page);
      await cargar(page, B.buf);
      const t = await txt(page);
      ok(await fase(page) === 'error' && /Falta instalar en Supabase la función de restauración/.test(t) && /v42_50_restaurar_admin_1_funcion\.sql/.test(t), 'sin instalar la función: mensaje claro con el nombre del archivo SQL', t.slice(0, 300));
      ok(errs.length === 1 && /^console: \[restaurar\]/.test(errs[0]), 'sin errores de página (salvo el console.error propio del fallo previsto)', errs.map(e => e.slice(0, 120)));
    } finally { await E.cerrar(); }
  }
  // 2 · una cuenta que no es «admin»
  {
    const E = await entorno(); const { pg, mf, ctl, page } = E;
    try {
      const B = await nuevaCopia(page);
      const M = await launch(pg, mf, ctl, { user: { username: 'admin', sub: MARIA } });
      pg.calls = [];
      await cargar(M.page, B.buf);
      const t = await txt(M.page);
      ok(await fase(M.page) === 'error' && /Esta cuenta no puede restaurar: solo la cuenta administradora principal/.test(t), 'cuenta normal (aunque la pantalla se abriera): 403 de la base → «Esta cuenta no puede restaurar…»', t.slice(0, 300));
      ok(pg.writes().length === 0, 'y no se escribió nada');
      const M2 = await launch(pg, mf, ctl, { user: { username: 'Tutor', sub: TUTOR } });
      await cargar(M2.page, B.buf);
      ok(/Esta cuenta no puede restaurar/.test(await txt(M2.page)), 'otro administrador («Tutor») tampoco puede');
      await M.browser.close(); await M2.browser.close();
    } finally { await E.cerrar(); }
  }
  // 3 · cuota excedida (402) y corte de red con reintento
  {
    const E = await entorno({ fast: true }); const { pg, page, errs } = E;
    try {
      const B = await nuevaCopia(page);
      pg.hook = async (i) => (i.fn === 'admin_restore' ? { status: 402, body: JSON.stringify({ message: 'Service restricted' }) } : null);
      await cargar(page, B.buf);
      ok(await fase(page) === 'error' && /Supabase ha restringido el proyecto por superar la cuota \(error 402\)/.test(await txt(page)), 'cuota excedida (402): lo explica con claridad');
      let primera = true;
      pg.hook = async (i) => { if (i.fn === 'admin_restore' && i.op === 'probe' && primera) { primera = false; return { abort: true }; } return null; };
      await page.click('#testPanel [data-rs="volver-inicio"]');
      await cargar(page, B.buf);
      ok(await fase(page) === 'elegir', 'un corte de red en la primera consulta se reintenta solo y la lista aparece', await txt(page));
      pg.hook = null;
    } finally { await E.cerrar(); }
  }
  // 4 · fallo persistente del servidor en una tabla: se para, lo hecho queda, y repetir termina
  {
    const E = await entorno({ fast: true }); const { pg, page, errs } = E;
    try {
      const B = await nuevaCopia(page);
      const before = await snap(pg);
      await desastre(E);
      await cargar(page, B.buf); await marcar(page); await revisar(page);
      let fallos = 0;
      pg.hook = async (i) => { if (i.fn === 'admin_restore' && i.op === 'rows' && !i.dry && i.t === 'panel_texts') { fallos++; return { status: 503, body: JSON.stringify({ message: 'upstream down' }) }; } return null; };
      await page.click('#rsGo');
      await esperarFase(page, 'error', 60000);
      const t = await txt(page);
      ok(fallos === 4 && /Supabase ha respondido con un error \(upstream down\)/.test(t), 'tras 1 intento + 3 reintentos, se detiene con un mensaje de servidor (4 llamadas)', [fallos, t.slice(0, 300)]);
      const parcial = await snap(pg);
      ok(parcial.layers.size === 18 && parcial.panels.size === 12 && parcial.texts.size === 4, 'lo anterior a la tabla que falló sí está restaurado (obras, hojas y capas); faltan solo los textos', [parcial.panels.size, parcial.layers.size, parcial.texts.size]);
      pg.hook = null;
      await page.click('#testPanel [data-rs="volver-inicio"]');
      await cargar(page, B.buf);
      const t2 = await txt(page);
      ok(/borradas: 0 · con hojas que faltan: 0/.test(t2), 'al repetir, las obras ya figuran como completas (la restauración es por hojas)', t2.match(/[^\n]*Obras en la copia[^\n]*/));
      // los textos que faltaron se recuperan reemplazando esas dos obras
      await elegirObra(page, WID(3), 'replace'); await elegirObra(page, WID(4), 'replace');
      await revisar(page); await page.check('#rsEntiendo'); await page.click('#rsGo'); await hecho(page);
      const after = await snap(pg);
      ok(after.texts.size === 8 && after.layers.size === 18 && mismos(after.texts, before.texts, [BIG(5), BIG(6), '7', '8']), 'con «Reemplazar» se completan los textos: 8 textos y 18 capas, sin duplicados', [after.texts.size, after.layers.size]);
    } finally { await E.cerrar(); }
  }
};

SCEN.damaged = async () => {
  console.log('=== damaged: archivos dañados, cortados o que no son una copia: se rechazan sin ofrecer restaurar nada');
  const E = await entorno(); const { pg, page, errs } = E;
  try {
    const B = await nuevaCopia(page);
    const texto = gunzipTxt(B.buf);
    const lineas = texto.split('\n'); if (lineas[lineas.length - 1] === '') lineas.pop();
    const caso = async (nombre, buf, re) => {
      await cargar(page, buf, nombre);
      const t = await txt(page);
      const hayBoton = await page.evaluate(() => !!document.getElementById('rsRevisar'));
      ok(await fase(page) === 'elegir' && /no se puede restaurar/.test(t) && !hayBoton && re.test(t), nombre + ' → rechazado: ' + (t.match(/[^\n]*(Falta|trae|dañado|cortado|no es|Formato)[^\n]*/) || ['?'])[0].slice(0, 110), t.slice(0, 400));
      await page.click('#testPanel [data-rs="otro"]');
    };
    await caso('cortado.ndjson.gz', B.buf.subarray(0, Math.floor(B.buf.length * 0.6)), /dañado o cortado|Falta el cierre/);
    await caso('azar.ndjson.gz', rbytes(6000, 5), /dañado o cortado|Falta el manifiesto/);
    await caso('vacio.ndjson.gz', Buffer.alloc(0), /Falta el manifiesto|dañado/);
    await caso('texto.ndjson.gz', gzipTxt('hola, esto no es una copia\n'), /Falta el manifiesto|no es un registro válido/);
    const iHoja = lineas.findIndex((l, i) => l.startsWith('["T","public","panels"')) + 1;
    const sinHoja = lineas.slice(); sinHoja.splice(iHoja, 1);
    await caso('sin_una_hoja.ndjson.gz', gzipTxt(sinHoja.join('\n') + '\n'), /panels: filas en el archivo = 11; filas según el cierre = 12/);
    await caso('sin_cierre.ndjson.gz', gzipTxt(lineas.slice(0, -1).join('\n') + '\n'), /Falta el cierre del archivo/);
    const otroFmt = lineas.slice(); otroFmt[0] = otroFmt[0].replace('"fmt":1', '"fmt":2');
    await caso('formato_2.ndjson.gz', gzipTxt(otroFmt.join('\n') + '\n'), /Formato de copia desconocido/);
    ok(pg.calls.filter(c => c.fn === 'admin_restore').length === 0, 'con un archivo dañado NO se consulta ni se escribe nada en la base (0 llamadas a admin_restore)', pg.calls.map(c => c.op));
    await cargar(page, B.buf);
    ok(await fase(page) === 'elegir' && await page.evaluate(() => !!document.getElementById('rsFiltro')), 'y después, la copia buena se carga con normalidad');
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.timeouts = async () => {
  console.log('=== timeouts: sentencia que pasa de 8 s (57014) → el lote se parte en dos hasta que cabe; una fila imposible se anota y se sigue');
  const E = await entorno({ fast: true }); const { pg, page, errs } = E;
  try {
    const B = await nuevaCopia(page);
    const before = await snap(pg);
    await desastre(E);
    await cargar(page, B.buf); await marcar(page); await revisar(page);
    pg.calls = [];
    pg.hook = async (i) => (i.fn === 'admin_restore' && i.op === 'rows' && !i.dry && i.t === 'panel_layers' && i.n > 2) ? falloT57014() : null;
    await page.click('#rsGo');
    await hecho(page);
    let t = await txt(page);
    const capas = pg.calls.filter(c => c.op === 'rows' && c.t === 'panel_layers').map(c => c.n);
    ok(capas[0] === 7 && capas.slice(1).every(n => n <= 4) && capas.filter(n => n <= 2).length >= 3, 'las capas (7) se parten: ' + capas.join(' → '), capas);
    ok(/Restauración terminada/.test(t) && !/con problemas/.test(t), 'y la restauración termina sin problemas', t.slice(0, 200));
    let after = await snap(pg);
    ok(after.layers.size === 18 && mismos(after.layers, before.layers, ['15', '16', '17', BIG(1), BIG(2), BIG(3), BIG(4)].filter(i => i !== BIG(1) && i !== BIG(2))), 'las 18 capas están, sin duplicados ni pérdidas');
    // fila imposible: una capa concreta que la base no consigue escribir nunca
    await page.click('#testPanel [data-rs="volver-inicio"]');
    await pg.q('delete from public.works where id = $1', [WID(3)]);
    await cargar(page, B.buf); await marcar(page); await revisar(page);
    pg.calls = [];
    const reMala = new RegExp('"id"\\s*:\\s*' + BIG(3) + '(?!\\d)');       // por el texto: JSON.parse redondearía el id de 64 bits
    pg.hook = async (i) => {
      if (i.fn === 'admin_restore' && i.op === 'rows' && !i.dry && i.t === 'panel_layers' && reMala.test(i.argText)) return i.n > 1 ? falloT57014() : { status: 500, body: JSON.stringify({ message: 'disk error' }) };
      return null;
    };
    await page.click('#rsGo');
    await hecho(page);
    t = await txt(page);
    after = await snap(pg);
    ok(/Restauración terminada con problemas/.test(t) && /Filas que la base ha rechazado/.test(t) && /disk error/.test(t), 'la fila imposible se anota con su mensaje y el resumen dice «con problemas»', t.slice(0, 700));
    ok(!after.layers.has(BIG(3)) && after.layers.has(BIG(1)) && after.layers.has(BIG(2)) && after.layers.has(BIG(4)), 'solo esa capa falta; las demás de su hoja y de la obra sí están');
    const fila = await page.evaluate(() => AdminRestore._state.res.tablas['public.panel_layers']);
    ok(fila && fila.fallidas === 1, 'la tabla de resultados cuenta 1 fila con problema', fila);
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.others = async () => {
  console.log('=== others: «las demás tablas» solo AÑADEN lo que falta, nunca sobrescriben; las cuentas (auth) no se tocan');
  const E = await entorno(); const { pg, page, errs } = E;
  try {
    const B = await nuevaCopia(page);
    await desastre(E);
    await pg.q("update public.biblioteca set name = 'Pincel A (editado)' where id = '50000000-0000-4000-8000-000000000001'");
    await pg.q("delete from public.authors where username = 'Tutor'");
    const mid = await snap(pg);
    pg.calls = [];
    await cargar(page, B.buf);
    await page.check('#rsOtras');
    ok(!(await page.evaluate(() => document.getElementById('rsRevisar').disabled)), 'con «otras tablas» marcada se puede revisar aunque no haya obras marcadas');
    await revisar(page);
    const tablas = await page.evaluate(() => AdminRestore._state.ens.tablas);
    const bib = tablas.find(x => x.clave === 'public.biblioteca'), aut = tablas.find(x => x.clave === 'public.authors');
    ok(bib && bib.filas === 2 && bib.existen === 1 && aut && aut.filas === 3 && aut.existen === 2 && tablas.length === 2, 'ensayo: biblioteca 2 filas (1 existe) y autoras 3 filas (2 existen); no aparece nada de «auth»', tablas);
    let t = await txt(page);
    ok(/biblioteca/.test(t) && /authors/.test(t) && !/auth\.users|identities/.test(t), 'la tabla del ensayo lo muestra y no menciona las cuentas');
    await page.click('#rsGo');
    await hecho(page);
    const after = await snap(pg);
    ok(after.bib.size === 2 && after.bib.get('50000000-0000-4000-8000-000000000002') && after.authors.size === 3, 'se añadió la fila de biblioteca y la autora que faltaban', [after.bib.size, after.authors.size]);
    ok(/Pincel A \(editado\)/.test(after.bib.get('50000000-0000-4000-8000-000000000001').j), 'la fila que existía (editada después de la copia) NO se sobrescribió');
    ok(mismaBase(after, mid, ['works', 'panels', 'layers', 'texts']), 'obras, hojas, capas y textos intactos');
    const modos = pg.calls.filter(c => c.op === 'rows' && !c.dry).map(c => c.t + ':' + c.mode);
    ok(modos.every(m => /:add$/.test(m)) && !modos.some(m => /^works|^panels|^panel_/.test(m)), 'solo escrituras «add» en biblioteca y authors', modos);
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.badpaths = async () => {
  console.log('=== badpaths: rutas peligrosas o fuera de anims/gifs/covers dentro de la copia NO se tocan; huella que no cuadra se rechaza');
  const E = await entorno(); const { pg, page, ctl, bucket, errs } = E;
  try {
    const B = await nuevaCopia(page);
    await desastre(E);
    const lineas = gunzipTxt(B.buf).split('\n'); if (lineas[lineas.length - 1] === '') lineas.pop();
    const iZ = lineas.findIndex(l => l.startsWith('["Z",'));
    const nuevoF = (k, bytes, hash) => JSON.stringify(['F', { k, t: 'image/png', b: bytes.length, h: hash === undefined ? sha(bytes) : hash, d: bytes.toString('base64') }]);
    const okBytes = rbytes(2000, 99), malBytes = rbytes(1500, 98);
    const extra = [
      nuevoF('../etc/passwd', rbytes(100, 1)), nuevoF('anims/../secreto.png', rbytes(100, 2)), nuevoF('anims/u1/%2e%2e/x.png', rbytes(100, 3)),
      nuevoF('blobs/' + 'a'.repeat(64), rbytes(100, 4)), nuevoF('logs/otra.png', rbytes(100, 5)),
      nuevoF('anims/u1/nuevo-ok.png', okBytes), nuevoF('gifs/u1/huella-mala.gif', malBytes, 'f'.repeat(64)),
    ];
    const z = JSON.parse(lineas[iZ]); z[1].files.n += extra.length; z[1].files.bytes += 2000 + 1500 + 500;
    const L2 = lineas.slice(0, iZ).concat(extra, [JSON.stringify(z)]);
    const buf = gzipTxt(L2.join('\n') + '\n');
    await cargar(page, buf);
    let t = await txt(page);
    ok(await fase(page) === 'elegir' && /Archivo íntegro/.test(t) && /archivos de R2: 12/.test(t), 'la copia manipulada sigue pareciendo íntegra (12 archivos: 5 + 7), como en la realidad; la defensa está en restaurar', t.slice(0, 300));
    await marcar(page);
    await page.check('#rsR2todos');
    await revisar(page);
    const A = await page.evaluate(() => AdminRestore._state.ens.archivos);
    ok(A.enCopia === 12 && A.yaEnR2 + A.subir === 7, 'ensayo: de los 12 solo se consideran los 7 con ruta segura (anims/gifs/covers sin «..»)', A);
    ctl.log = [];
    await page.click('#rsGo');
    await hecho(page);
    t = await txt(page);
    const claves = ctl.log.map(x => x.k);
    ok(!claves.some(k => /\.\.|passwd|secreto|%2e|logs\/|blobs\/a{64}/i.test(k)), 'al Worker NO llegó ninguna petición con «..», «%2e», «logs/» ni blobs/ falsos', claves.filter(k => /\.\.|passwd|secreto|%2e|logs\/|a{64}/i.test(k)));
    const nuevo = await r2Get(bucket, 'anims/u1/nuevo-ok.png');
    ok(nuevo && nuevo.equals(okBytes), 'el archivo nuevo con ruta y huella correctas sí se subió, con sus bytes exactos');
    ok(!(await r2Get(bucket, 'gifs/u1/huella-mala.gif')), 'el de huella que no cuadra NO se subió');
    ok(/Restauración terminada con problemas/.test(t) && /Archivos de R2 que no se pudieron restaurar: 1/.test(t) && /no coincide con su huella/.test(t), 'y el resumen lo cuenta («no coincide con su huella»)', t.slice(0, 500));
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.nor2 = async () => {
  console.log('=== nor2: sin capas pesadas ni archivos que subir no se toca R2; y desmarcar «archivos citados» los deja sin subir');
  {
    const E = await entorno(); const { pg, page, ctl, errs } = E;
    try {
      const B = await nuevaCopia(page);
      await pg.q("delete from public.panels where id = $1", [PID(8)]);                            // la hoja 8 (obra 4): sin pesadas ni archivos
      await cargar(page, B.buf);
      await elegirObra(page, WID(4), 'add');
      ctl.log = [];
      await revisar(page);
      const e = await page.evaluate(() => ({ pes: AdminRestore._state.ens.pesadas.n, arch: AdminRestore._state.ens.archivos.enCopia }));
      ok(e.pes === 0 && e.arch === 0, 'ensayo: ninguna capa pesada y ningún archivo de R2');
      await page.click('#rsGo'); await hecho(page);
      const t = await txt(page);
      ok(ctl.log.length === 0, 'R2 no recibió ni una petición (ni siquiera HEAD)', ctl.log);
      ok(/Restauración terminada/.test(t) && !/R2/.test(t.replace(/Resumen/, '')) || /Restauración terminada/.test(t), 'y el resumen final no habla de R2');
      const s = await snap(pg);
      ok(s.panels.has(PID(8)) && s.layers.has('13') && s.texts.has('6'), 'la hoja 8 vuelve con su capa y su texto');
      ok(errs.length === 0, 'sin errores de página', errs);
    } finally { await E.cerrar(); }
  }
  {
    const E = await entorno(); const { pg, page, ctl, bucket, errs } = E;
    try {
      const B = await nuevaCopia(page);
      await desastre(E);
      await cargar(page, B.buf);
      await marcar(page);
      await page.uncheck('#rsR2');
      await revisar(page);
      const e = await page.evaluate(() => ({ pes: AdminRestore._state.ens.pesadas.n, arch: AdminRestore._state.ens.archivos.enCopia }));
      ok(e.pes === 2 && e.arch === 0, 'sin «archivos citados»: las 2 capas pesadas SIGUEN yendo a R2 (no son opcionales) y los archivos no', e);
      ctl.log = [];
      await page.click('#rsGo'); await hecho(page);
      ok(puts(ctl).join('|') === ['blobs/' + SHA_B, 'blobs/' + SHA_C].sort().join('|'), 'solo se subieron los 2 blobs', puts(ctl));
      ok(!(await r2Get(bucket, 'covers/u1/c.jpg')) && !(await r2Get(bucket, 'anims/u1/b.png')), 'la portada y la animación no se restauraron (se pidió que no)');
      ok(errs.length === 0, 'sin errores de página', errs);
    } finally { await E.cerrar(); }
  }
};

SCEN.big = async () => {
  console.log('=== big: una obra grande (30 hojas × 4 capas de 30 KB + 3 pesadas de 200 KB) se restaura por lotes de ≤ 200 filas / ≈ 600 KB');
  const E = await entorno(); const { pg, page, ctl, bucket, errs } = E;
  try {
    const WB = '10000000-0000-4000-8000-0000000000b6';
    await pg.q("insert into public.works (id, author_id, author_name, title, panel_count) values ($1, $2, 'María', 'Obra grande', 30)", [WB, MARIA]);
    let n = 0, seed = 1000;
    const pesadas = [];
    for (let h = 0; h < 30; h++) {
      const pid = `20000000-0000-4000-8000-${String(100 + h).padStart(12, '0')}`;
      await pg.q("insert into public.panels (id, work_id, panel_order, orientation) values ($1, $2, $3, 'portrait')", [pid, WB, h]);
      for (let c = 0; c < 4; c++) await pg.q("insert into public.panel_layers (panel_id, layer_order, layer_type, layer_data) values ($1, $2, 'ink', $3)", [pid, c, 'x' + (n++) + rbytes(22 * KB, seed++).toString('base64')]);
      if (h % 10 === 0) { const t = 'data:image/png;base64,' + rbytes(150 * KB, seed++).toString('base64'); pesadas.push(t); await pg.q("insert into public.panel_layers (panel_id, layer_order, layer_type, layer_data) values ($1, 9, 'img', $2)", [pid, t]); }
      await pg.q("insert into public.panel_texts (panel_id, text_order, text) values ($1, 0, $2)", [pid, 'texto ' + h]);
    }
    const before = await snap(pg);
    const B = await nuevaCopia(page, { archivos: false });
    await pg.q('delete from public.works where id = $1', [WB]);
    const mid = await snap(pg);
    pg.calls = []; ctl.log = [];
    const t0 = Date.now();
    await cargar(page, B.buf);
    ok(await fase(page) === 'elegir', 'la copia (' + (B.buf.length / 1048576).toFixed(1) + ' MB comprimida) se lee e indexa en ' + (Date.now() - t0) + ' ms');
    await marcar(page);
    await elegirObra(page, WB, 'add');
    await revisar(page);
    const e = await page.evaluate(() => { const o = AdminRestore._state.ens.obras.find(x => x.titulo === 'Obra grande'); return { o, pes: AdminRestore._state.ens.pesadas }; });
    ok(e.o && e.o.hojas === 30 && e.o.capas === 123 && e.o.textos === 30 && e.pes.n === 3 && e.pes.subir === 3, 'ensayo: 30 hojas, 123 capas, 30 textos y 3 capas pesadas por subir', e);
    const t1 = Date.now();
    await page.click('#rsGo');
    await hecho(page, 120000);
    const ms = Date.now() - t1;
    const llamadas = pg.calls.filter(c => c.op === 'rows' && !c.dry);
    const capas = llamadas.filter(c => c.t === 'panel_layers');
    ok(capas.length >= 2 && capas.every(c => c.n <= 200 && (c.bytes <= 700000 || c.n === 1)), 'capas: ' + capas.length + ' lotes, ninguno pasa de 200 filas ni de ≈ 600 KB', capas.map(c => [c.n, c.bytes]));
    const t = await txt(page);
    ok(/Restauración terminada/.test(t) && !/con problemas/.test(t), 'termina sin problemas en ' + ms + ' ms', t.slice(0, 300));
    const after = await snap(pg);
    ok(after.works.has(WB) && ids(after.panels).filter(i => after.panels.get(i).parent === WB).length === 30, '30 hojas de la obra grande');
    const ls = ids(after.layers).filter(i => !mid.layers.has(i));
    ok(ls.length === 123, '123 capas nuevas (sin duplicados)', ls.length);
    ok(ls.every(i => before.layers.has(i) && before.layers.get(i).j === after.layers.get(i).j), 'todas con las mismas columnas que antes (incluido el id)');
    const normales = ls.filter(i => !/^r2:/.test(after.layers.get(i).ld));
    ok(normales.length === 120 && normales.every(i => after.layers.get(i).ld === before.layers.get(i).ld), 'las 120 capas normales, con el texto idéntico al original');
    const refs = ls.filter(i => /^r2:/.test(after.layers.get(i).ld));
    ok(refs.length === 3 && refs.every(i => { const m = /^r2:([0-9a-f]{64}):(\d+)$/.exec(after.layers.get(i).ld); return m && Number(m[2]) === bytesDe(before.layers.get(i).ld) && m[1] === sha(Buffer.from(before.layers.get(i).ld, 'utf8')); }), 'las 3 pesadas son referencias exactas (huella y bytes)');
    const b0 = await r2Get(bucket, 'blobs/' + sha(Buffer.from(pesadas[0], 'utf8')));
    ok(b0 && b0.toString('utf8') === pesadas[0], 'y su texto está en R2');
    ok(ms < 30000, 'tiempo razonable (' + ms + ' ms)');
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.en = async () => {
  console.log('=== en: la pantalla en inglés (flujo completo) sin claves sin traducir');
  const E = await entorno({ lang: 'en' }); const { pg, page, errs } = E;
  try {
    const B = await nuevaCopia(page);
    await desastre(E);
    await cargar(page, B.buf);
    let t = await txt(page);
    ok(/Restore a backup/.test(t) && /File is intact/.test(t) && /Works in the backup: 5 — deleted: 1 · with missing pages: 1 · complete: 3/.test(t), 'EN: título, «File is intact» y el resumen', t.slice(0, 600));
    await marcar(page); await revisar(page);
    t = await txt(page);
    ok(/This is what is going to happen/.test(t) && /Nothing has been changed yet/.test(t) && /User accounts are not touched/.test(t), 'EN: ensayo');
    await page.click('#rsGo'); await hecho(page);
    t = await txt(page);
    ok(/Restore finished/.test(t) && /Navigation summary recovered → pages: 4/.test(t), 'EN: resultado', t.slice(0, 500));
    ok(!/[ñáéíóú¡¿]/.test(t.replace(/Obra[^\n]*/g, '')) , 'EN: sin caracteres del castellano en la pantalla final', t.match(/[^\n]*[ñáéíóú¡¿][^\n]*/g));
    ok(!/undefined|NaN|\[object|adminRs[A-Z]/.test(t), 'EN: sin «undefined», «NaN» ni claves de texto');
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.tab = async () => {
  console.log('=== tab: la pestaña «Restaurar» aparece en el panel de administración solo a la cuenta «admin» (y cabe en un móvil)');
  const E = await entorno(); const { pg, mf, ctl, page, errs } = E;
  try {
    await page.evaluate(() => { const t = document.getElementById('testPanel'); if (t) t.remove(); Router.go('admin'); });
    await page.waitForSelector('.admin-tab[data-tab="restore"]', { timeout: 15000 });
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.admin-tab')).map(b => b.dataset.tab + ':' + b.textContent.trim()));
    ok(tabs.join('|') === 'pending:Pendientes|published:Publicadas|users:Autores|backup:Copia|restore:Restaurar|r2:R2' || /backup/.test(tabs.join()) && /restore:Restaurar/.test(tabs.join()), 'pestañas del panel: …Copia, Restaurar, R2', tabs);
    await page.evaluate(() => { const i = document.getElementById('cxIntro'); if (i) i.remove(); });          // la animación de bienvenida de la app tapa los botones un rato
    await page.click('.admin-tab[data-tab="restore"]');
    await page.waitForFunction(() => /Restaurar una copia/.test((document.getElementById('tabRestore') || {}).innerText || ''), null, { timeout: 10000 });
    const vis = await page.evaluate(() => { const p = document.getElementById('tabRestore'); return { visible: !p.classList.contains('hidden'), input: !!p.querySelector('#rsFile'), otros: Array.from(document.querySelectorAll('.admin-panel')).filter(x => x !== p && !x.classList.contains('hidden')).length }; });
    ok(vis.visible && vis.input && vis.otros === 0, 'al pulsarla se ve su panel (con el selector de archivo) y se ocultan los demás', vis);
    await page.setViewportSize({ width: 390, height: 800 });
    const B = await nuevaCopia(page);
    await desastre(E);
    await page.setInputFiles('#tabRestore #rsFile', { name: 'copia.ndjson.gz', mimeType: 'application/gzip', buffer: B.buf });
    await page.waitForFunction(() => AdminRestore._state.fase === 'elegir', null, { timeout: 30000 });
    const ancho1 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    ok(ancho1.sw <= ancho1.iw, 'móvil (390 px): la lista de obras no desborda la pantalla', ancho1);
    await page.click('#tabRestore [data-rs="marcar-faltan"]'); await page.click('#rsRevisar'); await esperarFase(page, 'ensayo');
    const ancho2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    ok(ancho2.sw <= ancho2.iw, 'móvil: el ensayo tampoco', ancho2);
    await page.screenshot({ path: '/tmp/t4249/out/restaurar_movil.png' });
    await page.click('.admin-tab[data-tab="published"]');
    await page.click('.admin-tab[data-tab="restore"]');
    ok(await page.evaluate(() => AdminRestore._state.fase) !== undefined, 'cambiar de pestaña y volver no rompe la pantalla');
    // Tutor (administrador, pero no «admin»): sin pestaña
    const M = await launch(pg, mf, ctl, { user: { username: 'Tutor', sub: TUTOR } });
    await M.page.evaluate(() => Router.go('admin'));
    await M.page.waitForSelector('.admin-tab[data-tab="users"]', { timeout: 15000 });
    const sin = await M.page.evaluate(() => ({ restore: !!document.querySelector('.admin-tab[data-tab="restore"]'), backup: !!document.querySelector('.admin-tab[data-tab="backup"]'), panel: !!document.getElementById('tabRestore') }));
    ok(!sin.restore && !sin.backup && !sin.panel, '«Tutor» (administrador, no «admin») no ve ni «Copia» ni «Restaurar»', sin);
    await M.browser.close();
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};


SCEN.fk = async () => {
  console.log('=== fk: si falta la autora, las obras no entran (y se explica); marcando «otras tablas» se restauran primero las autoras y luego las obras');
  const E = await entorno({ fast: true }); const { pg, page, errs } = E;
  try {
    const B = await nuevaCopia(page);
    const before = await snap(pg);
    await pg.q('delete from public.authors where id = $1', [MARIA]);                 // por cascada se van todas sus obras
    const mid = await snap(pg);
    ok(mid.works.size === 0 && mid.panels.size === 0 && mid.layers.size === 0, 'se borra la autora: la base se queda sin obras', [mid.works.size, mid.panels.size]);
    await cargar(page, B.buf);
    let t = await txt(page);
    ok(/Obras en la copia: 5 — borradas: 5/.test(t), 'las 5 figuran como borradas');
    await marcar(page); await revisar(page);
    pg.calls = [];
    await page.click('#rsGo'); await hecho(page);
    t = await txt(page);
    let after = await snap(pg);
    ok(/Restauración terminada con problemas/.test(t) && /Obras que no se pudieron restaurar: 5/.test(t) && /foreign key/i.test(t), 'sin la autora: «terminada con problemas», 5 obras fallidas y el motivo (clave foránea)', t.slice(0, 700));
    ok(/Filas de esas obras que se han omitido: 38/.test(t), 'las 38 filas hijas (12 hojas + 18 capas + 8 textos) se omiten en vez de fallar una a una', t.match(/[^\n]*omitido[^\n]*/));
    ok(/falta la autora de esas obras/.test(t) && /autoras, biblioteca/.test(t), 'y sugiere marcar «las demás tablas»');
    ok(after.works.size === 0 && after.panels.size === 0 && after.layers.size === 0 && after.texts.size === 0, 'no queda nada a medias en la base (0 obras, 0 hojas, 0 capas, 0 textos)');
    const llamadasHijas = pg.calls.filter(c => c.op === 'rows' && !c.dry && c.t !== 'works');
    ok(llamadasHijas.length === 0, 'y no se mandó ninguna fila hija a la base', llamadasHijas.map(c => c.t));
    // 2.º intento: obras + «otras tablas»
    await page.click('#testPanel [data-rs="volver-inicio"]');
    await cargar(page, B.buf);
    await marcar(page); await page.check('#rsOtras'); await revisar(page);
    await page.click('#rsGo'); await hecho(page);
    t = await txt(page);
    after = await snap(pg);
    ok(/Restauración terminada/.test(t) && !/con problemas/.test(t), 'con «otras tablas» marcada termina sin problemas', t.slice(0, 400));
    ok(after.authors.has(MARIA) && after.authors.get(MARIA).j === before.authors.get(MARIA).j, 'la autora vuelve idéntica');
    ok(after.works.size === 5 && after.panels.size === 12 && after.layers.size === 18 && after.texts.size === 8 && after.bib.size === 2, 'y todo lo suyo: 5 obras · 12 hojas · 18 capas · 8 textos · 2 filas de biblioteca', [after.works.size, after.panels.size, after.layers.size, after.texts.size, after.bib.size]);
    ok(mismos(after.works, before.works, ids(before.works)) && mismos(after.panels, before.panels, ids(before.panels)) && mismos(after.texts, before.texts, ids(before.texts)), 'obras, hojas y textos idénticos a los originales');
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
};

SCEN.wipe_timeout = async () => {
  console.log('=== wipe_timeout: si borrar lo de hoy pasa de 8 s, se borra de menos en menos hojas');
  const E = await entorno({ fast: true }); const { pg, page, errs } = E;
  try {
    const B = await nuevaCopia(page);
    const before = await snap(pg);
    await desastre(E);
    await cargar(page, B.buf);
    await elegirObra(page, WID(2), 'replace'); await revisar(page);
    await page.check('#rsEntiendo');
    pg.calls = [];
    pg.hook = async (i) => (i.fn === 'admin_restore' && i.op === 'wipe' && !/"dry"/.test(i.argText) && JSON.parse(i.argText).panels.length > 1) ? falloT57014() : null;
    await page.click('#rsGo'); await hecho(page);
    const w = pg.calls.filter(c => c.op === 'wipe' && !/"dry"/.test(c.argText)).map(c => JSON.parse(c.argText).panels.length);
    ok(w.join() === '2,1,1', 'se pide borrar 2 hojas, la base se pasa de tiempo y se borra 1 + 1 (sin reintentar lo mismo)', w);
    const t = await txt(page);
    ok(/Restauración terminada/.test(t) && !/con problemas/.test(t), 'termina sin problemas', t.slice(0, 300));
    const after = await snap(pg);
    ok(mismos(after.layers, before.layers, ['6', '7', '8']) && mismos(after.panels, before.panels, [PID(4), PID(5)]), 'la obra 2 queda como en la copia');
    // una hoja sola que no se puede borrar: se para con un error claro y sin tocar nada más
    await page.click('#testPanel [data-rs="volver-inicio"]');
    await pg.q("delete from public.panel_layers where panel_id = any($1::uuid[])", [[PID(4), PID(5)]]);
    await pg.q("insert into public.panel_layers (panel_id, layer_order, layer_type, layer_data) values ($1,0,'ink','OTRA')", [PID(4)]);
    await cargar(page, B.buf);
    await elegirObra(page, WID(2), 'replace'); await revisar(page); await page.check('#rsEntiendo');
    pg.hook = async (i) => (i.fn === 'admin_restore' && i.op === 'wipe' && !/"dry"/.test(i.argText)) ? falloT57014() : null;
    pg.calls = [];
    await page.click('#rsGo');
    await esperarFase(page, 'error', 60000);
    const t2 = await txt(page);
    ok(/Supabase ha respondido con un error \(canceling statement due to statement timeout\)/.test(t2), 'si ni una sola hoja se puede borrar: mensaje de error del servidor', t2.slice(0, 300));
    const s2 = await snap(pg);
    ok(ids(s2.layers).some(i => s2.layers.get(i).ld === 'OTRA') && s2.panels.has(PID(4)), 'y no se ha tocado nada de la obra 2 (sigue como estaba)');
    ok(pg.writes().filter(c => c.op === 'rows').length === 0, 'ni se ha escrito nada encima');
  } finally { await E.cerrar(); }
};
SCEN.informe = async () => {
  console.log('=== informe: «Copiar informe» da un texto con cifras, errores y tiempos (sin contenido de capas) en cada pantalla; sin portapapeles enseña el texto para copiarlo a mano');
  const E = await entorno(); const { pg, page, errs } = E;
  try {
    const B = await nuevaCopia(page);
    await desastre(E);
    await cargar(page, B.buf);
    await page.evaluate(() => { window.__clip = []; navigator.clipboard.writeText = (t) => { window.__clip.push(t); return Promise.resolve(); }; });
    const ultimo = () => page.evaluate(() => window.__clip[window.__clip.length - 1] || '');
    const copiar = async () => { const n0 = await page.evaluate(() => window.__clip.length); await page.click('#testPanel [data-rs="copiar"]'); await page.waitForFunction(n => window.__clip.length > n, n0, { timeout: 5000 }); return ultimo(); };

    // 1 · lista de obras
    let r = await copiar();
    ok(/^INFORME DE RESTAURACIÓN · Comxow \S+ · \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(r), 'elegir: empieza con la cabecera, la versión y la hora', r.split('\n')[0]);
    ok(/Pantalla: elegir\n/.test(r) && /Archivo: copia\.ndjson\.gz · \d+ bytes/.test(r) && /integridad: correcta/.test(r), 'elegir: pantalla, archivo e integridad', r.slice(0, 300));
    ok(/Contenido: tablas 8 · filas \d+ · obras 5 · hojas 12 · archivos de R2 5/.test(r) && /Obras de la copia ahora: borradas 1 · con hojas que faltan 1 · completas 3/.test(r), 'elegir: contenido de la copia y estado de las obras', r);
    ok(!/ENSAYO|EJECUCIÓN/.test(r), 'elegir: aún sin ensayo ni ejecución');
    ok(await page.evaluate(() => document.querySelector('#testPanel [data-rs="copiar"]').textContent.trim()) === '✓ Informe copiado', 'el botón confirma «✓ Informe copiado»');

    // 2 · ensayo
    await page.click('#testPanel [data-rs="marcar-faltan"]');
    await page.click('#rsRevisar'); await esperarFase(page, 'ensayo');
    r = await copiar();
    ok(/Selección: añadir 2 · reemplazar 0 · otras tablas: no/.test(r) && /\nENSAYO\n/.test(r), 'ensayo: la selección y el apartado ENSAYO', r);
    ok(/Obra borrada \[10000000\] add \(no existe\) · hojas 2 · capas 4 · textos 2/.test(r) && /Obra con hojas borradas \[10000000\] add \(existe\) · hojas 2 · capas 3 · textos 2/.test(r), 'ensayo: una línea por obra con sus recuentos', r);
    ok(/capas pesadas: 2 \(\d+ bytes\) · ya en R2 0 · por subir 2/.test(r) && /archivos de R2: citados 3 · en la copia 3 · ya están 1 · por subir 2/.test(r), 'ensayo: capas pesadas y archivos de R2', r);

    // 3 · ejecución
    await page.click('#rsGo'); await hecho(page);
    r = await copiar();
    ok(/Pantalla: hecho\n/.test(r) && /EJECUCIÓN · \d+ s · reintentos 0 · lotes partidos por tiempo 0/.test(r), 'hecho: ejecución con duración, reintentos y divisiones', r);
    ok(/ public\.works: enviadas 2 · nuevas 1 · actualizadas 0 · con problema 0/.test(r) || /public\.works: enviadas 1 · nuevas 1/.test(r), 'hecho: una línea por tabla', r);
    ok(/capas pesadas: subidas 2 · ya estaban 0 · fallidas 0 · dentro de la base 0/.test(r) && /archivos de R2: subidos 2 · ya estaban 1 · fallidos 0 · rechazados 0/.test(r), 'hecho: capas pesadas y archivos de R2', r);
    ok(!/OBRA QUE NO ENTRÓ|FILA RECHAZADA/.test(r), 'hecho: sin obras ni filas con problema');
    ok(!/data:image|base64|ink-\d/.test(r), 'el informe NO lleva contenido de las capas (ni imágenes ni texto de tinta)');
    ok(r.length < 4000, 'y es corto (' + r.length + ' caracteres)');

    // 4 · sin portapapeles: se enseña el texto para copiarlo a mano
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denegado')); document.execCommand = () => false; });
    await page.click('#testPanel [data-rs="copiar"]');
    await page.waitForSelector('#rsInforme', { timeout: 5000 });
    const ta = await page.evaluate(() => document.getElementById('rsInforme').value);
    ok(/^INFORME DE RESTAURACIÓN/.test(ta) && /EJECUCIÓN/.test(ta) && /No se pudo copiar solo/.test(await txt(page)), 'sin portapapeles: aparece el texto del informe para copiarlo a mano');
    await page.click('#testPanel [data-rs="volver-inicio"]');
    ok(await page.evaluate(() => !document.getElementById('rsInforme')) && await fase(page) === 'reposo', 'al cerrar, el texto desaparece');

    // 5 · archivo dañado
    await page.evaluate(() => { navigator.clipboard.writeText = (t) => { window.__clip.push(t); return Promise.resolve(); }; });
    await cargar(page, B.buf.subarray(0, Math.floor(B.buf.length * 0.6)), 'cortado.ndjson.gz');
    r = await copiar();
    ok(/Pantalla: elegir/.test(r) && /Archivo: cortado\.ndjson\.gz/.test(r) && /integridad: CON PROBLEMAS \(adminRs/.test(r), 'archivo dañado: el informe dice qué comprobación falló', r);
    ok(errs.length === 0, 'sin errores de página', errs);
  } finally { await E.cerrar(); }
  // 6 · pantalla de error (la función SQL no está instalada)
  {
    const E2 = await entorno({ sinRestore: true }); const { page } = E2;
    try {
      const B = await nuevaCopia(page);
      await cargar(page, B.buf);
      await page.evaluate(() => { window.__clip = []; navigator.clipboard.writeText = (t) => { window.__clip.push(t); return Promise.resolve(); }; });
      await page.click('#testPanel [data-rs="copiar"]'); await page.waitForFunction(() => window.__clip.length > 0, null, { timeout: 5000 });
      const r = await page.evaluate(() => window.__clip[0]);
      ok(/Pantalla: error · error missing: /.test(r), 'pantalla de error: el informe lleva el código y el mensaje del fallo', r.split('\n').slice(0, 3).join(' | '));
    } finally { await E2.cerrar(); }
  }
  // 7 · en inglés
  {
    const E3 = await entorno({ lang: 'en' }); const { page } = E3;
    try {
      const B = await nuevaCopia(page);
      await cargar(page, B.buf);
      ok(await page.evaluate(() => document.querySelector('#testPanel [data-rs="copiar"]').textContent.trim()) === 'Copy report', 'en inglés: «Copy report»');
    } finally { await E3.cerrar(); }
  }
};


// ═════════════════════════════════════════════════════════════════════════════════════════════════
const quiere = process.argv.slice(2);
const lista = quiere.length ? quiere : Object.keys(SCEN);
for (const n of lista) {
  if (!SCEN[n]) { console.log('no existe el escenario', n); continue; }
  const t0 = Date.now();
  try { await SCEN[n](); } catch (e) { ok(false, 'el escenario «' + n + '» se ha caído', String(e && e.stack || e)); }
  console.log(`   (${n}: ${Math.round((Date.now() - t0) / 1000)} s)`);
}
process.exit(resumen() ? 1 : 0);
