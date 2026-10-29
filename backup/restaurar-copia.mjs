#!/usr/bin/env node
/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
/*
 * restaurar-copia.mjs — restaura (o inspecciona) la copia de seguridad que descarga el panel de administrador (pestaña «Copia de seguridad»).
 *
 * Qué es el archivo: `comxow-copia-AAAA-MM-DD_HHMM.ndjson.gz`, un texto comprimido con una línea JSON por registro:
 *   ["M", {...}]            manifiesto: fecha, versión de la app, y el plan (tablas, columnas, claves, secuencias)
 *   ["S", "fase", "sql"]    estructura de la base (tablas, funciones, políticas RLS, permisos, disparadores…)
 *   ["T","esquema","tabla",n]   empieza una tabla (n = filas que había al empezar)
 *   ["R", {...fila...}]     una fila (las columnas tal cual, con los números enormes sin redondear)
 *   ["Z", {...}]            cierre: si falta, el archivo está cortado
 *
 * Sin dependencias: solo Node 18 o superior y, para escribir en una base, el programa `psql` (cliente de PostgreSQL).
 * Todo se hace en UNA transacción: o se restaura todo o no cambia nada.
 *
 *   node restaurar-copia.mjs copia.ndjson.gz --info                    comprueba que el archivo está íntegro y lista su contenido
 *   node restaurar-copia.mjs copia.ndjson.gz --db "<conexión>" --esquema    proyecto NUEVO y vacío: crea la estructura y carga los datos
 *   node restaurar-copia.mjs copia.ndjson.gz --db "<conexión>"         base que ya tiene la estructura: añade las filas que falten
 *   node restaurar-copia.mjs copia.ndjson.gz --sql salida.sql          no toca ninguna base: escribe el guion para ejecutarlo tú con psql -f
 *   (ver todas las opciones con --ayuda y la guía completa en backup/LEEME_COPIA_ADMIN.md)
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const VERSION = '42.29';
const NL = 10;

// ───────────────────────────────────────────────── opciones ─────────────────────────────────────────────────
const AYUDA = `
Restaurador de la copia de seguridad de Comxow (v${VERSION})

Uso:  node restaurar-copia.mjs <archivo.ndjson.gz> [opciones]

  --info                  Solo inspecciona: comprueba que el archivo está íntegro y muestra qué contiene. No toca ninguna base.
  --db "<conexión>"       Restaura en esa base. La conexión es la de Supabase (Connect → Session pooler), p. ej.
                          "postgresql://postgres.xxxx:CLAVE@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
                          Hace falta tener 'psql' instalado. Se hace todo en una transacción (o todo o nada).
  --sql <salida.sql>      En vez de conectar, escribe el guion SQL (se ejecuta después con: psql "<conexión>" -f salida.sql).
  --esquema               Antes de los datos, crea la estructura (tablas, funciones, políticas, permisos…).
                          SOLO para un proyecto nuevo y vacío: en uno que ya funciona reescribiría políticas y funciones.
  --modo insertar         (por defecto) añade las filas que faltan y NO toca las que ya existen.
  --modo actualizar       además sobrescribe las filas que ya existen (misma clave) con las de la copia.
  --solo t1,t2            Restaura solo esas tablas (p. ej. works,panels,panel_layers o public.works).
  --sin-cuentas           No restaura las cuentas (auth.users y auth.identities).
  --probar                Ensayo: hace todo y lo DESHACE al final (comprueba que la copia entra sin errores).
  --lote-mb N             Tamaño aproximado de cada INSERT (por defecto 4).
  --psql <ruta>           Ruta del programa psql si no está en el PATH.
  --si                    No pedir confirmación.
  --ayuda                 Esta ayuda.
`;

function leerOpciones(argv) {
  const o = { archivo: null, info: false, db: null, sql: null, esquema: false, modo: 'insertar', solo: null, sinCuentas: false, probar: false, loteMb: 4, psql: 'psql', si: false, ayuda: false };
  const valor = (i, nombre) => { if (i + 1 >= argv.length) fallar(`Falta el valor de ${nombre}.`, 2); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--info') o.info = true;
    else if (a === '--db') { o.db = valor(i, a); i++; }
    else if (a === '--sql') { o.sql = valor(i, a); i++; }
    else if (a === '--esquema') o.esquema = true;
    else if (a === '--modo') { o.modo = valor(i, a); i++; }
    else if (a === '--solo') { o.solo = valor(i, a).split(',').map(s => s.trim()).filter(Boolean); i++; }
    else if (a === '--sin-cuentas') o.sinCuentas = true;
    else if (a === '--probar') o.probar = true;
    else if (a === '--lote-mb') { o.loteMb = Number(valor(i, a)); i++; }
    else if (a === '--psql') { o.psql = valor(i, a); i++; }
    else if (a === '--si') o.si = true;
    else if (a === '--ayuda' || a === '-h' || a === '--help') o.ayuda = true;
    else if (a.startsWith('--')) fallar(`Opción desconocida: ${a}\n${AYUDA}`, 2);
    else if (!o.archivo) o.archivo = a;
    else fallar(`Sobra el argumento «${a}».`, 2);
  }
  return o;
}

function fallar(msg, codigo = 1) { console.error('\n✗ ' + msg + '\n'); process.exit(codigo); }
const limpio = s => String(s).replace(/[^A-Za-z0-9_.$ -]/g, '?');   // para lo que se imprime con \\echo de psql
const ident = s => '"' + String(s).replace(/"/g, '""') + '"';
const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
const mb = b => (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ───────────────────────────────────────── lectura del archivo (por líneas) ─────────────────────────────────────────
// Se lee en flujo (el archivo puede pesar cientos de MB) y SIN decodificar cada fila: solo se mira el tipo de línea.
async function* lineas(archivo) {
  const rs = fs.createReadStream(archivo, { highWaterMark: 1 << 20 });
  const gz = zlib.createGunzip();
  rs.on('error', e => gz.destroy(e));
  rs.pipe(gz);
  let resto = [];
  for await (const trozo of gz) {
    let ini = 0;
    for (;;) {
      const i = trozo.indexOf(NL, ini);
      if (i < 0) break;
      let l;
      if (resto.length) { resto.push(trozo.subarray(ini, i)); l = Buffer.concat(resto); resto = []; } else l = trozo.subarray(ini, i);
      yield l;
      ini = i + 1;
    }
    if (ini < trozo.length) resto.push(Buffer.from(trozo.subarray(ini)));
  }
  if (resto.length) yield Buffer.concat(resto);
}
// tipo de línea: ["X",...  → X en la posición 2
const tipo = l => (l.length > 4 && l[0] === 0x5b && l[1] === 0x22 && l[3] === 0x22 && l[4] === 0x2c) ? String.fromCharCode(l[2]) : '?';

// ───────────────────────────────────────── 1.ª pasada: comprobar la integridad ─────────────────────────────────────────
async function examinar(archivo) {
  const r = { manifiesto: null, esquema: [], tablas: [], final: null, lineas: 0, bytes: 0, problemas: [] };
  let cur = null;
  try {
    for await (const l of lineas(archivo)) {
      r.lineas++; r.bytes += l.length + 1;
      if (!l.length) continue;
      const t = tipo(l);
      if (t === 'R') {
        if (!cur) r.problemas.push(`Línea ${r.lineas}: una fila fuera de cualquier tabla.`);
        else cur.hay++;
        if (l[5] !== 0x7b || l[l.length - 1] !== 0x5d) r.problemas.push(`Línea ${r.lineas}: fila mal formada.`);
        continue;
      }
      let v;
      try { v = JSON.parse(l.toString('utf8')); } catch (e) { r.problemas.push(`Línea ${r.lineas}: no es JSON válido.`); continue; }
      if (t === 'M') r.manifiesto = v[1];
      else if (t === 'S') {
        r.esquema.push({ k: v[1], sql: v[2] });
        // el guion se ejecuta con psql: una línea que empiece por «\» sería una orden de psql (podría ejecutar programas). Una copia legítima no la tiene.
        if (typeof v[2] !== 'string' || /(^|\n)[ \t]*\\/.test(v[2])) r.problemas.push(`Línea ${r.lineas}: la estructura contiene una orden de psql (\\…). Solo se restauran copias descargadas por ti.`);
      }
      else if (t === 'T') { cur = { s: v[1], n: v[2], clave: v[1] + '.' + v[2], previstas: v[3], hay: 0 }; r.tablas.push(cur); }
      else if (t === 'Z') { r.final = v[1]; cur = null; }
      else r.problemas.push(`Línea ${r.lineas}: tipo de registro desconocido.`);
    }
  } catch (e) {
    r.problemas.push('El archivo está dañado o cortado (' + (e && e.message ? e.message : e) + ').');
    return r;
  }
  if (!r.manifiesto) r.problemas.push('Falta el manifiesto: no parece una copia de Comxow.');
  else if (r.manifiesto.fmt !== 1) r.problemas.push(`Formato de copia desconocido (${r.manifiesto.fmt}).`);
  if (!r.final) r.problemas.push('Falta el cierre del archivo: la descarga se cortó antes de terminar.');
  else {
    for (const t of r.tablas) {
      const dice = r.final.counts ? r.final.counts[t.clave] : undefined;
      if (dice === undefined) r.problemas.push(`${t.clave}: no consta en el cierre.`);
      else if (dice !== t.hay) r.problemas.push(`${t.clave}: el archivo trae ${t.hay} filas pero el cierre dice ${dice}.`);
    }
  }
  return r;
}

function informe(r) {
  const m = r.manifiesto;
  const out = [];
  if (m) {
    out.push(`  Creada el:        ${m.created || '?'}   (Comxow v${m.appVersion || '?'})`);
    if (m.plan && m.plan.pg) out.push(`  Base de origen:   ${String(m.plan.pg).split(' on ')[0]}`);
    out.push(`  Cuentas incluidas: ${m.plan && m.plan.auth ? 'sí (auth.users y auth.identities)' : 'no'}`);
  }
  out.push(`  Estructura:       ${r.esquema.length} sentencias`);
  const ancho = Math.max(10, ...r.tablas.map(t => t.clave.length));
  out.push('');
  out.push('  ' + 'Tabla'.padEnd(ancho) + '   ' + 'Filas'.padStart(9) + '   Estado');
  let total = 0;
  for (const t of r.tablas) {
    total += t.hay;
    const cambio = t.previstas !== t.hay ? `  (al empezar eran ${t.previstas}: cambió mientras se copiaba)` : '';
    out.push('  ' + t.clave.padEnd(ancho) + '   ' + miles(t.hay).padStart(9) + '   ✓' + cambio);
  }
  out.push('  ' + '─'.repeat(ancho + 14));
  out.push('  ' + 'TOTAL'.padEnd(ancho) + '   ' + miles(total).padStart(9));
  out.push(`  Tamaño descomprimido: ${mb(r.bytes)}`);
  if (m && m.plan && m.plan.unsupported && m.plan.unsupported.length) out.push('\n  ⚠ Objetos de la base que la estructura de la copia no cubre (los datos sí): ' + m.plan.unsupported.join(', '));
  return out.join('\n');
}

// ───────────────────────────────────────── 2.ª pasada: generar el guion SQL ─────────────────────────────────────────
const sinFinal = s => { s = s.replace(/\s+$/, ''); return /;$/.test(s) ? s : s + ';'; };
function elegirTabla(sel, t) {
  if (!sel) return true;
  return sel.some(x => x === t.clave || x === t.n || x.toLowerCase() === t.clave.toLowerCase() || x.toLowerCase() === t.n.toLowerCase());
}

async function* guion(archivo, o, ex) {
  const plan = ex.manifiesto.plan;
  const info = new Map(plan.tables.map(t => [t.s + '.' + t.n, t]));
  const limite = Math.max(0.25, o.loteMb || 4) * 1048576;
  const hechas = [];

  yield '\\set ON_ERROR_STOP on\n\\pset pager off\n\\set QUIET on\n';
  yield 'begin;\n';
  yield 'set local session_replication_role = replica;\n';           // sin disparadores ni claves ajenas durante la carga (si el rol no puede: error claro)
  yield 'set local statement_timeout = 0;\nset local check_function_bodies = off;\n';
  if (o.esquema) {
    yield '\\echo CXFASE|Creando la estructura\n';
    for (const s of ex.esquema) if (s.k !== 'post') yield sinFinal(s.sql) + '\n';
  }

  const elegidas = ex.tablas.filter(t => elegirTabla(o.solo, t) && !(o.sinCuentas && t.s === 'auth'));
  const claveElegida = new Set(elegidas.map(t => t.clave));

  // Se recorre el archivo entero (las filas de las tablas no elegidas se saltan).
  let cur = null, lote = [], loteBytes = 0;
  const cerrarLote = () => {
    if (!lote.length) return '';
    const texto = '[' + lote.join(',\n') + ']';
    lote = []; loteBytes = 0;
    let k = 0, tag;
    do { tag = 'cxbk' + (k++ || ''); } while (texto.includes('$' + tag + '$'));   // delimitador que no aparece en los datos
    const q = ident(cur.def.s) + '.' + ident(cur.def.n);
    let cola;
    if (cur.sinClave) cola = " where :'cx_vacia'::boolean";                        // tabla sin clave: solo si el destino estaba vacío
    else if (o.modo === 'actualizar') cola = ' on conflict (' + cur.def.pk.map(ident).join(', ') + ') :cx_k';
    else cola = ' on conflict do nothing';
    return 'insert into ' + q + ' (:cx_c) overriding system value select :cx_c from jsonb_populate_recordset(null::' + q + ', $' + tag + '$' + texto + '$' + tag + '$::jsonb)' + cola + ';\n';
  };
  const abrirTabla = (t) => {
    const def = info.get(t.clave);
    if (!def) fallar(`La tabla ${t.clave} no consta en el plan de la copia.`, 2);
    const q = ident(t.s) + '.' + ident(t.n);
    const columnas = def.cols.filter(c => !c.g).map(c => lit(c.n)).join(', ');
    const sinClave = !def.pk.length;
    let s = `\\echo CXT|${limpio(t.clave)}|${t.hay}\n`;
    s += `do $$ begin if to_regclass(${lit(q)}) is null then raise exception 'La tabla ${t.clave.replace(/'/g, "''")} no existe en la base de destino. Si es un proyecto nuevo y vacío, usa --esquema.'; end if; end $$;\n`;
    // columnas que existen de verdad en el destino (así una columna que sobre o falte en una versión nueva de Supabase no rompe la carga)
    s += `select coalesce(string_agg(quote_ident(a.attname), ', ' order by a.attnum), '') as cx_c from pg_attribute a where a.attrelid = to_regclass(${lit(q)}) and a.attnum > 0 and not a.attisdropped and a.attgenerated::text = '' and a.attname = any (array[${columnas}]::name[]) \\gset\n`;
    if (!sinClave && o.modo === 'actualizar') {
      s += `select case when count(*) = 0 then 'do nothing' else 'do update set ' || string_agg(format('%1$s = excluded.%1$s', quote_ident(a.attname)), ', ' order by a.attnum) end as cx_k from pg_attribute a where a.attrelid = to_regclass(${lit(q)}) and a.attnum > 0 and not a.attisdropped and a.attgenerated::text = '' and a.attname = any (array[${columnas}]::name[]) and a.attname <> all (array[${def.pk.map(lit).join(', ')}]::name[]) \\gset\n`;
    }
    if (sinClave) {
      // Tabla sin clave única: no hay forma de saber qué filas ya están. Solo se carga si el destino está vacío (si no, se duplicarían).
      s += `select not exists (select 1 from ${q}) as cx_vacia \\gset\n`;
      s += `\\if :cx_vacia\n\\else\n\\echo CXAVISO|${limpio(t.clave)}|la tabla no tiene clave y el destino NO está vacío: se deja como está\n\\endif\n`;
    }
    return { s, def, sinClave };
  };
  const cerrarTabla = () => {
    if (!cur) return '';
    const q = ident(cur.def.s) + '.' + ident(cur.def.n);
    hechas.push(cur.t.clave);
    return `select 'CXC|${limpio(cur.t.clave)}|' || count(*) from ${q};\n`;
  };

  for await (const l of lineas(archivo)) {
    if (!l.length) continue;
    const t = tipo(l);
    if (t === 'T') {
      const v = JSON.parse(l.toString('utf8'));
      const sal = cerrarLote() + cerrarTabla();
      if (sal) yield sal;
      const clave = v[1] + '.' + v[2];
      if (claveElegida.has(clave)) {
        const t0 = ex.tablas.find(x => x.clave === clave);
        const ab = abrirTabla(t0);
        cur = { t: t0, def: ab.def, sinClave: ab.sinClave };
        yield ab.s;
      } else cur = null;
    } else if (t === 'R') {
      if (!cur) continue;
      // `["R",` + objeto + `]` → el objeto tal cual (sin pasar por JSON.parse de JavaScript: los enteros de 64 bits no se redondean)
      const txt = l.toString('utf8', 5, l.length - 1);
      lote.push(txt); loteBytes += l.length;
      if (loteBytes >= limite) yield cerrarLote();
    } else if (t === 'Z') {
      const sal = cerrarLote() + cerrarTabla();
      if (sal) yield sal;
      cur = null;
    }
  }

  // secuencias: que el siguiente número no repita uno ya usado
  const seqs = (plan.seqs || []).filter(s => s.last !== null && s.last !== undefined);
  if (seqs.length && elegidas.some(t => t.s === 'public')) {
    yield '\\echo CXFASE|Ajustando contadores\n';
    for (const s of seqs) {
      if (!/^-?\d{1,19}$/.test(String(s.last))) continue;                  // solo enteros: nada raro dentro del SQL
      const q = ident(s.s) + '.' + ident(s.n), v = String(s.last);
      yield `do $$ begin if to_regclass(${lit(q)}) is not null then perform setval(${lit(q)}::regclass, ${v}) where ${v} > coalesce((select last_value from pg_sequences where schemaname = ${lit(s.s)} and sequencename = ${lit(s.n)}), ${v} - 1); end if; end $$;\n`;
    }
  }
  if (o.esquema) {
    const post = ex.esquema.filter(s => s.k === 'post');
    if (post.length) { yield '\\echo CXFASE|Rellenando vistas\n'; for (const s of post) yield sinFinal(s.sql) + '\n'; }
  }
  yield o.probar ? '\\echo CXFASE|Deshaciendo (ensayo)\nrollback;\n' : 'commit;\n';
  yield '\\echo CXOK\n';
  return hechas;
}

// ───────────────────────────────────────── ejecución ─────────────────────────────────────────
function ocultarClave(c) { return String(c).replace(/(:\/\/[^:\/@\s]+:)[^@\s]+@/, '$1***@').replace(/(password=)\S+/i, '$1***'); }

async function preguntar(texto) {
  if (!process.stdin.isTTY) fallar('Hace falta confirmar y no hay terminal interactivo: añade --si para continuar sin preguntar.', 2);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const r = await new Promise(res => rl.question(texto, res));
  rl.close();
  return /^(s|si|sí|y|yes)$/i.test(String(r).trim());
}

// Escribe con contrapresión; si el destino se cierra o falla (psql terminó), no se queda esperando para siempre.
async function escribir(flujo, texto) {
  if (flujo.destroyed || flujo.writableEnded) return;
  if (!flujo.write(texto)) {
    await new Promise(res => {
      const listo = () => { flujo.off('drain', listo); flujo.off('close', listo); flujo.off('error', listo); res(); };
      flujo.once('drain', listo); flujo.once('close', listo); flujo.once('error', listo);
    });
  }
}

async function main() {
  const o = leerOpciones(process.argv.slice(2));
  if (o.ayuda || !o.archivo) { console.log(AYUDA); process.exit(o.ayuda ? 0 : 2); }
  if (!['insertar', 'actualizar'].includes(o.modo)) fallar('--modo debe ser «insertar» o «actualizar».', 2);
  if (!fs.existsSync(o.archivo)) fallar(`No existe el archivo: ${o.archivo}`, 2);
  if (!o.info && !o.db && !o.sql) fallar('Indica qué hacer: --info (solo mirar), --db "<conexión>" (restaurar) o --sql <archivo> (escribir el guion).\n' + AYUDA, 2);
  if (o.db && o.sql) fallar('Usa --db o --sql, no los dos a la vez.', 2);

  console.log(`\nRestaurador de copias de Comxow v${VERSION}\nLeyendo ${o.archivo} …`);
  const t0 = Date.now();
  const ex = await examinar(o.archivo);
  console.log('\n' + (ex.manifiesto ? informe(ex) : '  (no se pudo leer el contenido)'));
  if (ex.problemas.length) {
    console.log('\n✗ PROBLEMAS EN EL ARCHIVO:\n  - ' + ex.problemas.join('\n  - '));
    console.log('\nUn archivo con problemas no se restaura (podría dejar la base a medias). Vuelve a descargar la copia.');
    process.exit(2);
  }
  console.log(`\n✓ Archivo íntegro (${((Date.now() - t0) / 1000).toFixed(1)} s).`);
  if (o.info) process.exit(0);

  if (o.solo) {
    const ok = ex.tablas.filter(t => elegirTabla(o.solo, t)).map(t => t.clave);
    const sobran = o.solo.filter(x => !ex.tablas.some(t => elegirTabla([x], t)));
    if (sobran.length) fallar('Con --solo no se encuentra: ' + sobran.join(', ') + '\nTablas de la copia: ' + ex.tablas.map(t => t.clave).join(', '), 2);
    console.log('Solo se restaurarán: ' + ok.join(', '));
  }
  if (o.sinCuentas) console.log('Sin las cuentas (auth.users, auth.identities).');

  const destino = o.sql ? `el archivo ${o.sql}` : ocultarClave(o.db);
  const resumen = ex.tablas.filter(t => elegirTabla(o.solo, t) && !(o.sinCuentas && t.s === 'auth'));
  const filas = resumen.reduce((a, t) => a + t.hay, 0);
  console.log(`\nSe va a ${o.probar ? 'ENSAYAR (y deshacer)' : 'ESCRIBIR'}: ${miles(filas)} filas de ${resumen.length} tablas${o.esquema ? ', más la estructura' : ''} en ${destino}\nModo: ${o.modo}${o.modo === 'insertar' ? ' (no toca las filas que ya existen)' : ' (sobrescribe las filas con la misma clave)'}`);
  if (o.esquema && o.db) console.log('⚠ --esquema reescribe funciones, políticas y permisos: úsalo solo en un proyecto NUEVO y vacío.');
  if (o.db && !o.si && !(await preguntar('\n¿Continuar? (escribe sí): '))) fallar('Cancelado. No se ha tocado nada.', 1);

  // ── a un archivo ──
  if (o.sql) {
    const ws = fs.createWriteStream(o.sql);
    ws.on('error', e => fallar('No se pudo escribir ' + o.sql + ': ' + e.message));
    for await (const s of guion(o.archivo, o, ex)) await escribir(ws, s);
    await new Promise(r => ws.end(r));
    console.log(`\n✓ Guion escrito en ${o.sql} (${mb(fs.statSync(o.sql).size)}).\n  Ejecútalo con:  psql "<conexión>" -f ${o.sql}`);
    process.exit(0);
  }

  // ── a una base, con psql ──
  const ps = spawn(o.psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', o.db], { stdio: ['pipe', 'pipe', 'pipe'] });
  let spawnErr = null, psTerminado = false;
  ps.stdin.on('error', () => {});
  const stderr = [];
  ps.stderr.on('data', d => { for (const x of d.toString().split(/\r?\n/)) if (x.trim() && stderr.length < 60) stderr.push(x); });
  const contados = new Map(); let terminado = false, nTabla = 0;
  let bufOut = '';
  ps.stdout.on('data', d => {
    bufOut += d.toString();
    let i;
    while ((i = bufOut.indexOf('\n')) >= 0) {
      const ln = bufOut.slice(0, i).replace(/\r$/, ''); bufOut = bufOut.slice(i + 1);
      if (ln.startsWith('CXT|')) { const [, nombre, filasT] = ln.split('|'); nTabla++; process.stdout.write(`  [${nTabla}/${resumen.length}] ${nombre} (${miles(filasT)} filas) … `); }
      else if (ln.startsWith('CXC|')) { const [, nombre, c] = ln.split('|'); contados.set(nombre, Number(c)); console.log(`${miles(c)} en la base`); }
      else if (ln.startsWith('CXFASE|')) console.log('  · ' + ln.slice(7));
      else if (ln.startsWith('CXAVISO|')) console.log('\n  ⚠ ' + ln.slice(8).replace('|', ': '));
      else if (ln === 'CXOK') terminado = true;
      else if (ln.trim()) console.log('  ' + ln);
    }
  });
  const fin = new Promise(res => {
    ps.on('error', e => { spawnErr = e; psTerminado = true; res(-1); });          // p. ej. ENOENT: psql no está instalado
    ps.on('close', code => { psTerminado = true; res(code); });
  });

  console.log('\nRestaurando…');
  try {
    for await (const s of guion(o.archivo, o, ex)) {
      if (spawnErr || psTerminado || ps.exitCode !== null) break;
      await escribir(ps.stdin, s);
    }
  } catch (e) {
    // si psql ya terminó (error de la base), escribirle da EPIPE: el motivo real lo explica psql más abajo
    if (!spawnErr && !psTerminado && !(e && e.code === 'EPIPE')) console.error('\n✗ Error preparando los datos: ' + (e && e.message ? e.message : e));
  }
  ps.stdin.end();
  const code = await fin;

  if (spawnErr) {
    if (spawnErr.code === 'ENOENT') fallar(`No se encuentra el programa «${o.psql}» (cliente de PostgreSQL).\n  · Instálalo (Windows: «PostgreSQL» del instalador oficial, marcando solo «Command Line Tools»; Mac: brew install libpq; Linux: apt install postgresql-client)\n  · o indica su ruta con --psql, o usa --sql archivo.sql y ejecútalo donde tengas psql.`);
    fallar('No se pudo ejecutar psql: ' + spawnErr.message);
  }
  if (code !== 0 || !terminado) {
    console.error('\n✗ LA RESTAURACIÓN HA FALLADO. No se ha cambiado nada en la base (todo se deshizo).');
    if (stderr.length) console.error('\nMensaje de la base de datos:\n  ' + stderr.slice(0, 12).join('\n  '));
    if (stderr.some(x => /session_replication_role/.test(x))) console.error('\nPista: el usuario de la conexión no puede desactivar los disparadores durante la carga. En Supabase usa el usuario «postgres» (Connect → Session pooler).');
    if (stderr.some(x => /does not exist|no existe/.test(x))) console.error('\nPista: si es un proyecto nuevo y vacío, añade --esquema.');
    process.exit(1);
  }
  // Avisos (no errores) de la base: p. ej. una extensión o un permiso que el destino no admite. La estructura los tolera y sigue; aquí se muestran para que no pasen desapercibidos.
  const avisos = stderr.filter(x => /^(WARNING|AVISO|ADVERTENCIA)\b/i.test(x.trim()));
  if (avisos.length) console.log(`\n⚠ La base de datos ha dado ${avisos.length} aviso(s); la restauración sigue su curso:\n  ` + avisos.slice(0, 10).join('\n  ') + (avisos.length > 10 ? '\n  …' : ''));
  if (o.probar) console.log('\n✓ ENSAYO TERMINADO: la copia entra sin errores. No se ha cambiado nada (todo se deshizo).');
  else {
    let dif = 0;
    for (const t of resumen) { const c = contados.get(t.clave); if (c !== undefined && o.modo === 'insertar' && c < t.hay) dif++; }
    console.log(`\n✓ RESTAURACIÓN COMPLETADA (${((Date.now() - t0) / 1000).toFixed(0)} s).${dif ? `\n⚠ ${dif} tabla(s) tienen menos filas de las de la copia (filas que ya existían con la misma clave o tablas sin clave que no estaban vacías).` : ''}`);
  }
  process.exit(0);
}

main().catch(e => { console.error('\n✗ ' + (e && e.stack ? e.stack : e)); process.exit(1); });
