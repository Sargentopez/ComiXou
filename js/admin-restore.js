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
 *
 * - gifuct-js (decodificador de GIF animados; incluido dentro de editor.js y de reader/reader.js)
 *     Autor: Matt Way
 *     Licencia: MIT
 *     https://github.com/matt-way/gifuct-js
 *
 * - js-binary-schema-parser (analizador de esquemas binarios; parte de gifuct-js)
 *     Autor: Matt Way
 *     Licencia: MIT
 *     https://github.com/matt-way/jsBinarySchemaParser
 *
 * - jsgif (función de desentrelazado de GIF; parte de gifuct-js)
 *     Autor: Shachaf Ben-Kiki
 *     Licencia: MIT
 *     https://github.com/shachaf/jsgif
 */
/* ============================================================
   admin-restore.js — Restaurar una copia desde el panel de administración (v42.50)

   Solo la cuenta «admin» ve la pestaña «Restaurar»; la barrera real está en la función SQL public.admin_restore
   (sql/v42_50_restaurar_admin_1_funcion.sql), que rechaza a cualquier otra cuenta.

   Qué hace: lee un archivo de copia (el que descarga la pestaña «Copia»: NDJSON en gzip) SIN guardarlo entero en memoria, lo compara con lo
   que hay en la base y restaura POR OBRAS, no fila a fila. Motivo: al editar una obra cambian los identificadores de sus capas; mezclar filas
   de la copia con filas de hoy duplicaría capas. Por eso cada obra se restaura como un conjunto (obra → hojas → capas y textos):
     · «Añadir lo que falta»: si la obra no existe, se crea entera; si existe, solo se añaden las hojas que ya no están (con sus capas y
       textos). Lo que existe NO se toca.
     · «Reemplazar por la copia»: solo en las obras que se marquen. Se borran las hojas actuales de esa obra (con sus capas y textos) y se deja
       la versión de la copia. Lo hecho después de la copia en esa obra se pierde (el ensayo lo cuenta antes).
   Las demás tablas (autoras, biblioteca…) solo se completan si se pide: se añaden las filas que faltan, nunca se sobrescribe.
   Las CUENTAS (auth.users) no se restauran desde aquí: para una base nueva o vacía sigue valiendo backup/restaurar-copia.mjs.

   Orden de trabajo (por seguridad, lo que más puede fallar va antes de tocar la base):
     0. Leer la copia (1.ª pasada: índice, comprobación de que está entera) y preguntar a la base qué obras y hojas existen ya (probe).
     1. ENSAYO obligatorio: recuento exacto de lo que se añadiría, se reemplazaría y se borraría, y de lo que hay que subir a R2. No escribe nada.
     2. R2 (antes de cambiar la base): las capas pesadas (≥ 32 KB) se suben a R2 por contenido y en la base entran como referencia
        «r2:<huella>:<bytes>» (así la base no engorda); los archivos de R2 de la copia que falten (animaciones, GIF, portadas) se vuelven a subir.
        Si R2 no responde para alguna capa pesada se PARA aquí, sin haber tocado la base, y se pregunta (reintentar o guardarlas en la base).
     3. Base de datos: borrado de las hojas de las obras a reemplazar y escritura por lotes (≤ 200 filas / ≈ 600 KB), todo repetible: volver a
        lanzar no duplica nada. Un lote que falla se reintenta, se parte en dos si la base tarda demasiado, y fila a fila al final.
     4. Resumen de navegación de las hojas restauradas (panels.nav): el disparador de capas lo anula al insertar; se devuelve el de la copia.
   Las filas nunca se pasan por JSON.parse y JSON.stringify de vuelta: se envía el texto tal cual salió de la copia (los enteros de 64 bits no se
   redondean). Solo se toca el texto de layer_data de una capa pesada, sustituyéndolo por su referencia en el propio texto.

   Estándares usados (no se ha inventado nada): DecompressionStream (gzip), NDJSON, SHA-256 (Web Crypto), almacenamiento por contenido (como
   Git LFS / Docker), patrón «reintentar y partir el lote» de los cargadores de datos por lotes.
   ============================================================ */
const AdminRestore = (typeof AdminBackup === 'undefined') ? undefined : (() => {
  'use strict';
  const { BkError } = AdminBackup.engine;
  const { deBase64, sha256Hex, RE_F, reEsc, FMT } = AdminBackup.engine.util;
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const T = (k, v) => (typeof I18n !== 'undefined' ? I18n.t(k, v) : k);
  const pad = n => (n < 10 ? '0' : '') + n;

  const LOTE_FILAS = 200;                         // filas por llamada a la base
  const LOTE_BYTES = 600000;                      // …y tope de bytes por llamada (una fila sola puede pasarlo: entonces va sola)
  const ESPERAS = [700, 2500, 7000];              // esperas entre reintentos
  const HEAD_N = 1024;                            // bytes del principio de una línea con los que se decide si interesa
  const HEAD_KEEP = 4096;                         // bytes que se guardan de una línea de la que solo interesa el principio
  const HOJAS_LOTE = 25;                          // hojas por llamada al borrar
  const IDS_LOTE = 800;                           // ids por llamada al preguntar qué existe
  const ARBOL = ['public.works', 'public.panels', 'public.panel_layers', 'public.panel_texts'];
  const RE_PID = /"panel_id"\s*:\s*"([0-9a-fA-F-]{36})"/;
  const RE_LD = /"layer_data"\s*:\s*"/;
  const RUTA_R2 = /^(?:anims|gifs|covers)\/[^\s"\\<>]+$/;

  class RsError extends Error {
    constructor(code, msg, extra) { super(msg || code); this.name = 'RsError'; this.code = code; if (extra) Object.assign(this, extra); }
  }
  const parado = (signal) => { if (signal && signal.aborted) throw new BkError('aborted', 'Cancelado'); };
  const dormir = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(() => { if (signal) signal.removeEventListener('abort', ab); res(); }, ms);
    const ab = () => { clearTimeout(t); rej(new BkError('aborted', 'Cancelado')); };
    if (signal) { if (signal.aborted) ab(); else signal.addEventListener('abort', ab, { once: true }); }
  });
  // «canceling statement due to statement timeout» (57014): la base tiene un tope de 8 s por sentencia. Repetir lo mismo no sirve: se parte el trabajo.
  const esTiempo = (e) => !!e && e.code === 'server' && /57014|statement timeout|timeout/i.test(e.message || '');
  const trozos = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const aJson = (txt, que) => { try { return JSON.parse(txt); } catch (e) { throw new BkError('format', `${que}: respuesta no válida`); } };
  const pesadaMin = () => SupabaseClient.xr.min;

  // Cola con límite de tareas a la vez: `lanzar` espera si ya hay `n` en curso (así leer el archivo no se adelanta a lo que se sube).
  function crearCola(n) {
    let activas = 0, error = null;
    const esperando = [], fin = [];
    const libera = () => { activas--; const w = esperando.shift(); if (w) w(); if (!activas) fin.splice(0).forEach(f => f()); };
    return {
      async lanzar(fn) {
        if (error) throw error;
        if (activas >= n) await new Promise(r => esperando.push(r));
        if (error) throw error;
        activas++;
        Promise.resolve().then(fn).catch(e => { if (!error) error = e; }).finally(libera);
      },
      async esperar() { if (activas) await new Promise(r => fin.push(r)); if (error) throw error; },
    };
  }

  // ═════════════════════════════════════════ LECTURA DE LA COPIA ═════════════════════════════════════════
  // Trozos descomprimidos del archivo; `onBytes(n)` = bytes COMPRIMIDOS leídos hasta ahora (para la barra de progreso).
  async function* trozosGunzip(archivo, onBytes) {
    const rd = archivo.stream().getReader();
    let leidos = 0;
    const cuenta = (n) => { leidos += n; if (onBytes) onBytes(leidos); };
    if (typeof DecompressionStream === 'function') {
      const src = new ReadableStream({
        async pull(c) { const x = await rd.read(); if (x.done) c.close(); else { cuenta(x.value.length); c.enqueue(x.value); } },
        cancel(r) { return rd.cancel(r); },
      });
      const out = src.pipeThrough(new DecompressionStream('gzip')).getReader();
      try { for (;;) { const x = await out.read(); if (x.done) break; yield x.value; } }
      finally { try { await out.cancel(); } catch (_) {} }
    } else {
      if (typeof pako === 'undefined') throw new BkError('format', 'Este navegador no puede descomprimir gzip.');
      const inf = new pako.Inflate();
      const cola = [];
      inf.onData = c => cola.push(c);
      try {
        for (;;) {
          const x = await rd.read();
          if (!x.done) cuenta(x.value.length);
          inf.push(x.done ? new Uint8Array(0) : x.value, x.done);
          if (inf.err) throw new BkError('format', inf.msg || 'gzip dañado');
          while (cola.length) yield cola.shift();
          if (x.done) break;
        }
        if (!inf.ended) throw new BkError('format', 'El archivo está cortado');
      } finally { try { await rd.cancel(); } catch (_) {} }
    }
  }

  /* Líneas de la copia, una a una. `quiere(tipo, principio)` decide, con el principio de la línea (≈ 1 KB), si la línea interesa:
       0 = se descarta sin guardarla · 1 = se guarda solo el principio (4 KB) · 2 = se guarda entera.
     Cada línea devuelta: { t: tipo ('M','S','T','R','F','Z' o '?'), u8, len (bytes de la línea entera), n (número de línea) }. */
  async function* leerLineas(archivo, opts) {
    const quiere = opts.quiere;
    let partes = [], len = 0, kept = 0, tipo = '?', modo = 2, decidido = false, nlin = 0;
    const reset = () => { partes = []; len = 0; kept = 0; tipo = '?'; modo = 2; decidido = false; };
    const juntar = () => {
      if (partes.length === 1) return partes[0];
      const u8 = new Uint8Array(kept); let o = 0;
      for (const p of partes) { u8.set(p, o); o += p.length; }
      return u8;
    };
    const decidir = () => {
      decidido = true;
      const h = juntar();
      tipo = (h.length >= 5 && h[0] === 0x5b && h[1] === 0x22 && h[3] === 0x22 && h[4] === 0x2c) ? String.fromCharCode(h[2]) : '?';
      modo = quiere(tipo, h.subarray(0, Math.min(h.length, HEAD_N)));
      if (modo === 0) { partes = []; kept = 0; } else { partes = [h]; kept = h.length; }
    };
    const anadir = (u8) => {
      if (!u8.length) return;
      len += u8.length;
      if (decidido && (modo === 0 || (modo === 1 && kept >= HEAD_KEEP))) return;
      partes.push(u8.slice()); kept += u8.length;
      if (!decidido && kept >= HEAD_N) decidir();
    };
    const fin = () => {
      nlin++;
      if (len === 0) { reset(); return null; }
      if (!decidido) decidir();
      const r = modo === 0 ? null : { t: tipo, u8: juntar(), len, n: nlin };
      reset();
      return r;
    };
    for await (const trozo of trozosGunzip(archivo, opts.onBytes)) {
      let ini = 0;
      for (;;) {
        const i = trozo.indexOf(10, ini);
        anadir(trozo.subarray(ini, i < 0 ? trozo.length : i));
        if (i < 0) break;
        const r = fin(); if (r) yield r;
        ini = i + 1;
      }
    }
    if (len) { const r = fin(); if (r) { r.sinSalto = true; yield r; } }
  }

  const filaDe = (u8) => { const t = dec.decode(u8); return t.slice(5, t.length - 1); };    // ["R",<fila>]  →  <fila>

  /* 1.ª pasada: índice de la copia y comprobación de que está entera. Devuelve
     { ok, problemas:[{k,v}], manifiesto, final, tablas:[{clave,s,n,prev,hay}], obras:Map(id → {id,titulo,autor,publicada,pendiente,actualizada,hojas:[ids],capas,textos,bytes,pesadas}),
       hojas:Map(id → {obra,orden}), archivos:Map(clave → {b,t,h}), filas, lineas, hojasHuerfanas, capasSinHoja } */
  async function indexar(archivo, { onProgress, signal } = {}) {
    const r = { ok: false, problemas: [], manifiesto: null, final: null, tablas: [], obras: new Map(), hojas: new Map(), archivos: new Map(), filas: 0, lineas: 0, esquema: 0, hojasHuerfanas: 0, capasSinHoja: 0, bytes: archivo.size || 0 };
    const capas = new Map(), textos = new Map();
    const mal = (k, v) => { if (r.problemas.length < 20) r.problemas.push({ k, v: v || {} }); };
    let cur = null, ultimo = 0;
    const quiere = (t) => {
      if (t === 'R') { const c = cur && cur.clave; return (c === 'public.works' || c === 'public.panels') ? 2 : 1; }
      return t === 'F' ? 1 : 2;
    };
    const minPesada = pesadaMin();
    try {
      for await (const L of leerLineas(archivo, { quiere, onBytes: (b) => { const ahora = Date.now(); if (onProgress && ahora - ultimo > 120) { ultimo = ahora; try { onProgress({ bytes: b, total: archivo.size || 0, filas: r.filas }); } catch (_) {} } } })) {
        parado(signal);
        r.lineas++;
        if (L.t === 'R') {
          r.filas++;
          if (!cur) { mal('adminRsPRowOutside', { n: L.n }); continue; }
          cur.hay++;
          if (cur.clave === 'public.works' || cur.clave === 'public.panels') {
            let o; try { o = JSON.parse(filaDe(L.u8)); } catch (_) { mal('adminRsPBadLine', { n: L.n }); continue; }
            if (cur.clave === 'public.works') {
              if (o && o.id) r.obras.set(o.id, { id: o.id, titulo: String(o.title || ''), autor: String(o.author_name || ''), publicada: !!o.published, pendiente: !!o.pending_review, actualizada: o.updated_at || '', hojas: [], capas: 0, textos: 0, bytes: L.len, pesadas: 0 });
              else mal('adminRsPBadLine', { n: L.n });
            } else if (o && o.id) r.hojas.set(o.id, { obra: o.work_id, orden: Number(o.panel_order) || 0, bytes: L.len });
            else mal('adminRsPBadLine', { n: L.n });
          } else if (cur.clave === 'public.panel_layers' || cur.clave === 'public.panel_texts') {
            const m = RE_PID.exec(dec.decode(L.u8.subarray(0, Math.min(L.u8.length, HEAD_KEEP))));
            if (!m) { r.capasSinHoja++; continue; }
            const mapa = cur.clave === 'public.panel_layers' ? capas : textos;
            const c = mapa.get(m[1]) || { n: 0, bytes: 0, pesadas: 0 };
            c.n++; c.bytes += L.len; if (L.len >= minPesada) c.pesadas++;
            mapa.set(m[1], c);
          }
        } else if (L.t === 'T') {
          let v; try { v = JSON.parse(dec.decode(L.u8)); } catch (_) { v = null; }
          if (!Array.isArray(v)) { mal('adminRsPBadLine', { n: L.n }); continue; }
          cur = { s: v[1], n: v[2], clave: v[1] + '.' + v[2], prev: v[3], hay: 0 };
          r.tablas.push(cur);
        } else if (L.t === 'F') {
          const m = RE_F.exec(dec.decode(L.u8.subarray(0, Math.min(L.u8.length, 2048))));
          if (!m) { mal('adminRsPBadFile', { n: L.n }); continue; }
          try { r.archivos.set(JSON.parse(m[1]), { b: +m[3], t: JSON.parse(m[2]), h: JSON.parse(m[4]) }); } catch (_) { mal('adminRsPBadFile', { n: L.n }); }
        } else if (L.t === 'M' || L.t === 'S' || L.t === 'Z') {
          let v; try { v = JSON.parse(dec.decode(L.u8)); } catch (_) { v = null; }
          if (!Array.isArray(v)) { mal('adminRsPBadLine', { n: L.n }); continue; }
          if (L.t === 'M') r.manifiesto = v[1]; else if (L.t === 'S') r.esquema++; else { r.final = v[1]; cur = null; }
        } else mal('adminRsPBadLine', { n: L.n });
      }
    } catch (e) {
      if (e && e.code === 'aborted') throw e;
      mal('adminRsPBroken', { msg: (e && e.message) || String(e) });
    }
    if (!r.manifiesto) mal('adminRsPNoManifest');
    else if (r.manifiesto.fmt !== FMT) mal('adminRsPFmt', { v: r.manifiesto.fmt });
    else if (!r.manifiesto.plan || !Array.isArray(r.manifiesto.plan.tables)) mal('adminRsPNoPlan');
    if (!r.final) mal('adminRsPNoEnd');
    else {
      for (const t of r.tablas) {
        const dice = r.final.counts ? r.final.counts[t.clave] : undefined;
        if (dice === undefined) mal('adminRsPTableNoEnd', { t: t.clave });
        else if (dice !== t.hay) mal('adminRsPTable', { t: t.clave, hay: t.hay, dice });
      }
      const fz = r.final.files;
      if (fz && typeof fz.n === 'number') { if (fz.n !== r.archivos.size) mal('adminRsPFiles', { hay: r.archivos.size, dice: fz.n }); }
      else if (r.archivos.size) mal('adminRsPFilesNoEnd');
    }
    // obras ← hojas ← capas y textos
    const porObra = new Map();
    for (const [pid, h] of r.hojas) {
      const o = r.obras.get(h.obra);
      if (!o) { r.hojasHuerfanas++; continue; }
      if (!porObra.has(o.id)) porObra.set(o.id, []);
      porObra.get(o.id).push({ id: pid, orden: h.orden });
      o.bytes += h.bytes;
      const c = capas.get(pid); if (c) { o.capas += c.n; o.bytes += c.bytes; o.pesadas += c.pesadas; }
      const x = textos.get(pid); if (x) { o.textos += x.n; o.bytes += x.bytes; }
    }
    for (const [wid, lista] of porObra) {
      lista.sort((a, b) => (a.orden - b.orden) || (a.id < b.id ? -1 : 1));
      r.obras.get(wid).hojas = lista.map(x => x.id);
    }
    for (const pid of capas.keys()) if (!r.hojas.has(pid)) r.capasSinHoja += capas.get(pid).n;
    r.ok = r.problemas.length === 0;
    return r;
  }

  // ═════════════════════════════════════════ LLAMADAS A LA BASE ═════════════════════════════════════════
  function crearRpc(ctx) {
    const base = ctx.rpc || ((op, arg, o) => SupabaseClient.adminRestoreRpc(op, arg, o));
    const rpc = (op, arg, o) => base(op, arg, Object.assign({ signal: ctx.signal }, o));
    // con reintentos para los fallos de red y de servidor (el resto sube tal cual)
    async function llamar(op, arg, o) {
      for (let intento = 0; ; intento++) {
        parado(ctx.signal);
        try { return await rpc(op, arg, o); }
        catch (e) {
          parado(ctx.signal);
          const c = e && e.code;
          if (!(c === 'server' || c === 'network' || c === 'timeout') || esTiempo(e) || intento >= ESPERAS.length) throw e;
          if (ctx.res) ctx.res.reint++;
          if (ctx.onProgress) ctx.onProgress({ reintento: { i: intento + 1, de: ESPERAS.length } });
          await dormir(ESPERAS[intento], ctx.signal);
          if (ctx.onProgress) ctx.onProgress({ reintento: null });
        }
      }
    }
    return { rpc, llamar };
  }

  // Qué obras y hojas de la copia existen ya en la base.
  async function sondear(ind, ctx) {
    const { llamar } = crearRpc(ctx);
    const ex = { works: new Set(), panels: new Set() };
    for (const ch of trozos(Array.from(ind.obras.keys()), IDS_LOTE)) {
      const v = aJson(await llamar('probe', { works: ch }), 'probe');
      (v.works || []).forEach(x => ex.works.add(x));
    }
    for (const ch of trozos(Array.from(ind.hojas.keys()), IDS_LOTE)) {
      const v = aJson(await llamar('probe', { panels: ch }), 'probe');
      (v.panels || []).forEach(x => ex.panels.add(x));
    }
    return ex;
  }
  const estadoObra = (o, ex) => {
    if (!ex.works.has(o.id)) return { e: 'borrada', faltan: o.hojas.length };
    const f = o.hojas.filter(h => !ex.panels.has(h)).length;
    return { e: f ? 'faltan' : 'ok', faltan: f };
  };

  /* Lo que se va a restaurar. sel = { obras: Map(id → 'add'|'replace'), otras: bool, r2: bool (archivos citados), r2todos: bool }. */
  function armarPlan(ind, ex, sel) {
    const plan = { obras: new Map(), hojasInc: new Map(), otras: [], pk: {}, r2: { citados: !!sel.r2, todos: !!sel.r2todos }, dbHojas: new Map() };
    for (const [wid, modo] of sel.obras) {
      const o = ind.obras.get(wid);
      if (!o || (modo !== 'add' && modo !== 'replace')) continue;
      const existe = ex.works.has(wid);
      const hojas = modo === 'replace' ? o.hojas : o.hojas.filter(h => !ex.panels.has(h));
      hojas.forEach(h => plan.hojasInc.set(h, { w: wid, modo }));
      plan.obras.set(wid, { id: wid, modo, existe, hojas: hojas.length });
    }
    if (sel.otras) {
      for (const t of (ind.manifiesto && ind.manifiesto.plan ? ind.manifiesto.plan.tables : [])) {
        const clave = t.s + '.' + t.n;
        if (t.s !== 'public' || ARBOL.indexOf(clave) >= 0 || !Array.isArray(t.pk) || !t.pk.length) continue;
        plan.otras.push(clave); plan.pk[clave] = t.pk;
      }
    }
    return plan;
  }

  /* Filas de la copia que entran en el plan, en el orden del archivo. Eventos:
       { ev:'T', clave }  empieza una tabla · { ev:'R', clave, tipo:'obra'|'hoja'|'capa'|'texto'|'otra', modo:'add'|'upsert', txt (fila tal cual), o (objeto, solo obra y hoja),
         wid, pid, len } · { ev:'F', u8, len } un archivo de R2 que interesa · { ev:'Z' } fin. */
  async function* filasElegidas(archivo, plan, opts) {
    const otras = new Set(plan.otras);
    let cur = null;
    const quiere = (t, h) => {
      if (t === 'R') {
        const c = cur ? cur.clave : '';
        if (c === 'public.panel_layers' || c === 'public.panel_texts') {
          const m = RE_PID.exec(dec.decode(h));
          return m ? (plan.hojasInc.has(m[1]) ? 2 : 0) : 2;
        }
        if (c === 'public.works' || c === 'public.panels') return 2;
        return otras.has(c) ? 2 : 0;
      }
      if (t === 'F') {
        if (!opts.conArchivos) return 1;
        const m = RE_F.exec(dec.decode(h.subarray(0, Math.min(h.length, 2048))));
        if (!m) return 2;
        let k; try { k = JSON.parse(m[1]); } catch (_) { return 2; }
        return opts.conArchivos(k) ? 2 : 0;
      }
      return (t === 'T' || t === 'Z') ? 2 : 0;
    };
    for await (const L of leerLineas(archivo, { quiere, onBytes: opts.onBytes })) {
      parado(opts.signal);
      if (L.t === 'T') { const v = aJson(dec.decode(L.u8), 'T'); cur = { clave: v[1] + '.' + v[2] }; yield { ev: 'T', clave: cur.clave }; continue; }
      if (L.t === 'F') { yield { ev: 'F', u8: L.u8, len: L.len }; continue; }
      if (L.t === 'Z') { yield { ev: 'Z' }; continue; }
      if (L.t !== 'R' || !cur) continue;
      const fila = filaDe(L.u8), clave = cur.clave;
      if (clave === 'public.works') {
        let o; try { o = JSON.parse(fila); } catch (_) { continue; }
        const p = o && plan.obras.get(o.id);
        if (!p || (p.modo === 'add' && p.existe)) continue;
        yield { ev: 'R', clave, tipo: 'obra', modo: p.modo === 'replace' ? 'upsert' : 'add', txt: fila, o, wid: o.id, len: L.len };
      } else if (clave === 'public.panels') {
        let o; try { o = JSON.parse(fila); } catch (_) { continue; }
        const h = o && plan.hojasInc.get(o.id);
        if (!h) continue;
        yield { ev: 'R', clave, tipo: 'hoja', modo: h.modo === 'replace' ? 'upsert' : 'add', txt: fila, o, wid: h.w, pid: o.id, len: L.len };
      } else if (clave === 'public.panel_layers' || clave === 'public.panel_texts') {
        const m = RE_PID.exec(fila.length > HEAD_KEEP ? fila.slice(0, HEAD_KEEP) : fila);
        let pid = m && m[1];
        if (!pid) { try { pid = JSON.parse(fila).panel_id; } catch (_) { pid = null; } }
        const h = pid && plan.hojasInc.get(pid);
        if (!h) continue;
        yield { ev: 'R', clave, tipo: clave === 'public.panel_layers' ? 'capa' : 'texto', modo: 'add', txt: fila, wid: h.w, pid, len: L.len };
      } else if (otras.has(clave)) {
        yield { ev: 'R', clave, tipo: 'otra', modo: 'add', txt: fila, len: L.len };
      }
    }
  }

  // ───────────── capas pesadas ─────────────
  // Si la fila es una capa con layer_data ≥ 32 KB que todavía no es una referencia: { o, ld }.
  function capaPesada(txt, len) {
    if (len < pesadaMin()) return null;
    let o; try { o = JSON.parse(txt); } catch (_) { return null; }
    const ld = o && o.layer_data;
    if (typeof ld !== 'string' || ld.length < pesadaMin() || SupabaseClient.xr.isRef(ld)) return null;
    return { o, ld };
  }
  // Cambia SOLO el texto de layer_data dentro del texto de la fila (el resto queda byte a byte igual). `orig` = la fila ya interpretada: sirve para
  // comprobar que el resultado es la misma fila con otro layer_data. null si no se puede hacer con seguridad (la capa entonces entra con su texto).
  function cambiarLayerData(txt, nuevo, orig) {
    const m = RE_LD.exec(txt);
    if (!m) return null;
    const ini = m.index + m[0].length;
    let j = ini;
    for (;;) {
      const q = txt.indexOf('"', j);
      if (q < 0) return null;
      let b = 0; for (let k = q - 1; k >= ini && txt.charCodeAt(k) === 92; k--) b++;
      if (b % 2 === 0) { j = q; break; }
      j = q + 1;
    }
    const out = txt.slice(0, ini) + nuevo + txt.slice(j);
    let n; try { n = JSON.parse(out); } catch (_) { return null; }
    if (!n || n.layer_data !== nuevo) return null;
    if (orig) {
      const a = Object.keys(orig);
      if (a.length !== Object.keys(n).length) return null;
      for (const k of a) if (k !== 'layer_data' && JSON.stringify(orig[k]) !== JSON.stringify(n[k])) return null;
    }
    return out;
  }

  // Claves de R2 citadas por un texto (anims/…, gifs/…, covers/…); sin «?…».
  function crearRastro(citadas) {
    const base = String(SupabaseClient.xr.worker).replace(/\/+$/, '');
    const re = new RegExp(reEsc(base) + '/((?:anims|gifs|covers)/[^"\\\\\\s<>]+)', 'g');
    return (txt) => {
      if (txt.indexOf(base) < 0) return;
      re.lastIndex = 0; let m;
      while ((m = re.exec(txt))) citadas.add(m[1].replace(/[?#].*$/, ''));
    };
  }
  const rutaSegura = (k) => RUTA_R2.test(k) && k.indexOf('..') < 0 && !/%2e%2e/i.test(k) && !/%2f/i.test(k.replace(/^[^/]+\//, ''));

  // HEAD / PUT de un archivo de R2 con reintentos. HEAD → código HTTP; PUT → {status, why}
  async function conReintentos(ctx, fn) {
    let ult = null;
    for (let i = 0; i <= ESPERAS.length; i++) {
      parado(ctx.signal);
      try {
        const r = await fn();
        const st = typeof r === 'number' ? r : r.status;
        if (!(st === 408 || st === 429 || st >= 500) || i === ESPERAS.length) return r;
        ult = r;
      } catch (e) {
        parado(ctx.signal);
        if (i === ESPERAS.length) throw e;
      }
      if (ctx.res) ctx.res.reint++;
      await dormir(ESPERAS[i], ctx.signal);
    }
    return ult;
  }

  // ═════════════════════════════════════════ ENSAYO ═════════════════════════════════════════
  /* Cuenta lo que pasaría; no escribe nada (ni en la base ni en R2). Devuelve
     { obras:[{id,titulo,modo,existe,hojas,capas,textos,borra:{hojas,capas,textos}|null}], tablas:[{clave,filas,existen}], borra:{hojas,capas,textos},
       pesadas:{n,bytes,yaEnR2,subir,sinHash}, archivos:{citados,enCopia,yaEnR2,subir,bytes,sinCopia,sinCopiaEj}, filas:{obras,hojas,capas,textos} } */
  async function ensayar(archivo, plan, ind, ctx) {
    const { llamar } = crearRpc(ctx);
    const prog = (o) => { if (ctx.onProgress) { try { ctx.onProgress(o); } catch (_) {} } };
    const E = { obras: [], tablas: [], borra: { hojas: 0, capas: 0, textos: 0 }, pesadas: { n: 0, bytes: 0, yaEnR2: 0, subir: 0, sinHash: 0 },
      archivos: { citados: 0, enCopia: 0, yaEnR2: 0, subir: 0, bytes: 0, sinCopia: 0, sinCopiaEj: [] }, filas: { obras: 0, hojas: 0, capas: 0, textos: 0 } };
    const xr = SupabaseClient.xr;
    // 1) lo que hay ahora en la base en las obras a reemplazar (y por tanto lo que se borraría)
    plan.dbHojas = new Map();
    const reemplazar = [...plan.obras.values()].filter(p => p.modo === 'replace' && p.existe).map(p => p.id);
    prog({ fase: 'sondeo' });
    const borraDe = new Map();
    for (const ch of trozos(reemplazar, 100)) {
      const v = aJson(await llamar('probe', { detail: ch }), 'probe');
      for (const w of ch) plan.dbHojas.set(w, (v.detail && v.detail[w]) || []);
    }
    for (const w of reemplazar) {
      const ids = plan.dbHojas.get(w);
      let b = { hojas: 0, capas: 0, textos: 0 };
      for (const ch of trozos(ids, 100)) {
        const v = aJson(await llamar('wipe', { panels: ch, dry: true }), 'wipe');
        b.hojas += +v.panels || 0; b.capas += +v.layers || 0; b.textos += +v.texts || 0;
      }
      borraDe.set(w, b);
      E.borra.hojas += b.hojas; E.borra.capas += b.capas; E.borra.textos += b.textos;
    }
    // 2) una pasada por el archivo: recuentos, capas pesadas (hash + ¿ya están en R2?), archivos citados y claves de las demás tablas
    const citadas = new Set(), rastro = crearRastro(citadas);
    const porObra = new Map();
    const cuentaObra = (wid) => { let c = porObra.get(wid); if (!c) { c = { hojas: 0, capas: 0, textos: 0 }; porObra.set(wid, c); } return c; };
    const pkObjs = new Map();                       // tabla → [fila con solo su clave]
    const cola = crearCola(4);
    const hashes = new Set();
    let ultimo = 0;
    const alBytes = (b) => { const ahora = Date.now(); if (ahora - ultimo > 120) { ultimo = ahora; prog({ fase: 'leyendo', bytes: b, total: archivo.size || 0 }); } };
    for await (const ev of filasElegidas(archivo, plan, { signal: ctx.signal, onBytes: alBytes })) {
      if (ev.ev === 'F' || ev.ev === 'Z') break;
      if (ev.ev !== 'R') continue;
      rastro(ev.txt);
      if (ev.tipo === 'obra') E.filas.obras++;
      else if (ev.tipo === 'hoja') { E.filas.hojas++; cuentaObra(ev.wid).hojas++; }
      else if (ev.tipo === 'texto') { E.filas.textos++; cuentaObra(ev.wid).textos++; }
      else if (ev.tipo === 'capa') {
        E.filas.capas++; cuentaObra(ev.wid).capas++;
        const pz = capaPesada(ev.txt, ev.len);
        if (pz) {
          await cola.lanzar(async () => {
            const u8 = enc.encode(pz.ld), sha = await sha256Hex(u8);
            if (!sha) { E.pesadas.sinHash++; return; }
            if (hashes.has(sha)) return;           // dos capas con el mismo contenido son un solo archivo en R2
            hashes.add(sha);
            E.pesadas.n++; E.pesadas.bytes += u8.length;
            let st = 0; try { st = await conReintentos(ctx, () => xr.headFile('blobs/' + sha, ctx.signal)); } catch (e) { if (e && e.code === 'aborted') throw e; }
            if (st === 200) E.pesadas.yaEnR2++; else E.pesadas.subir++;
          });
        }
      } else if (ev.tipo === 'otra') {
        let o; try { o = JSON.parse(ev.txt); } catch (_) { continue; }
        const pk = plan.pk[ev.clave], k = {};
        pk.forEach(c => { k[c] = o[c]; });
        if (!pkObjs.has(ev.clave)) pkObjs.set(ev.clave, []);
        pkObjs.get(ev.clave).push(JSON.stringify(k));
      }
    }
    await cola.esperar();
    // 3) las demás tablas: cuántas filas ya existen
    for (const clave of plan.otras) {
      const filas = pkObjs.get(clave) || [];
      let ex = 0;
      for (const ch of trozos(filas, 500)) {
        const v = aJson(await llamar('rows', null, { rawArg: '{"t":' + JSON.stringify(clave.replace(/^public\./, '')) + ',"mode":"add","dry":true,"rows":[' + ch.join(',') + ']}' }), 'rows');
        ex += +v.ex || 0;
      }
      E.tablas.push({ clave, filas: filas.length, existen: ex });
    }
    // 4) archivos de R2 de la copia que interesan: ¿ya están en R2?
    if (plan.r2.citados || plan.r2.todos) {
      const claves = plan.r2.todos ? Array.from(ind.archivos.keys()) : Array.from(citadas).filter(k => ind.archivos.has(k));
      E.archivos.citados = citadas.size;
      E.archivos.enCopia = claves.length;
      for (const k of citadas) if (!ind.archivos.has(k)) { E.archivos.sinCopia++; if (E.archivos.sinCopiaEj.length < 5) E.archivos.sinCopiaEj.push(k); }
      const cola2 = crearCola(4);
      for (const k of claves) {
        if (!rutaSegura(k)) continue;
        await cola2.lanzar(async () => {
          let st = 0; try { st = await conReintentos(ctx, () => xr.headFile(k, ctx.signal)); } catch (e) { if (e && e.code === 'aborted') throw e; }
          if (st === 200) E.archivos.yaEnR2++; else { E.archivos.subir++; E.archivos.bytes += ind.archivos.get(k).b; }
        });
        prog({ fase: 'archivos' });
      }
      await cola2.esperar();
    }
    // 5) resumen por obra
    for (const p of plan.obras.values()) {
      const o = ind.obras.get(p.id), c = porObra.get(p.id) || { hojas: 0, capas: 0, textos: 0 };
      E.obras.push({ id: p.id, titulo: o.titulo, autor: o.autor, modo: p.modo, existe: p.existe, hojas: c.hojas, capas: c.capas, textos: c.textos, borra: borraDe.get(p.id) || null });
    }
    return E;
  }

  // ═════════════════════════════════════════ RESTAURAR ═════════════════════════════════════════
  const nuevoRes = () => ({ tablas: {}, errores: [], obrasFallidas: [], omitidas: 0, borrado: { hojas: 0, capas: 0, textos: 0 }, nav: 0, cancelado: false, reint: 0, divis: 0, ms: 0,   // reint/divis/ms: solo para el informe
    pesadas: { n: 0, bytes: 0, subidas: 0, yaEstaban: 0, fallidas: 0, sinHash: 0, enBase: 0, errs: [] },
    archivos: { n: 0, bytes: 0, subidos: 0, yaEstaban: 0, fallidos: 0, rechazados: 0, errs: [] } });

  /* FASE R2 — antes de tocar la base. Sube las capas pesadas (ctx.ptr: id de capa → referencia) y, si se pide, los archivos de R2.
     No escribe nada en la base. Devuelve cuántas capas pesadas no se pudieron subir (res.pesadas.fallidas). */
  async function faseR2(archivo, plan, ind, ctx) {
    const xr = SupabaseClient.xr;
    const res = ctx.res;
    const prog = (o) => { if (ctx.onProgress) { try { ctx.onProgress(o); } catch (_) {} } };
    xr.breakerReset();                                              // una pausa antigua del cortacircuitos no debe hacer que todo falle sin probar
    res.pesadas.fallidas = 0; res.pesadas.errs = [];
    res.archivos.fallidos = 0; res.archivos.errs = []; res.archivos.rechazados = 0;      // al reintentar, solo cuentan los fallos de este intento (lo ya subido no se repite: ctx.hechos)
    const citadas = new Set(), rastro = crearRastro(citadas);
    const quiereArchivos = plan.r2.citados || plan.r2.todos;
    const cola = crearCola(3);
    let ultimo = 0, hechas = 0;
    const alBytes = (b) => { const ahora = Date.now(); if (ahora - ultimo > 120) { ultimo = ahora; prog({ fase: 'r2', bytes: b, total: archivo.size || 0, capas: hechas }); } };
    for await (const ev of filasElegidas(archivo, plan, {
      signal: ctx.signal, onBytes: alBytes,
      conArchivos: quiereArchivos ? (k) => plan.r2.todos || citadas.has(k) : null,
    })) {
      if (ev.ev === 'Z') break;
      if (ev.ev === 'F') {
        if (!quiereArchivos) break;
        await cola.lanzar(() => subirArchivo(ev.u8, ctx));
        continue;
      }
      if (ev.ev !== 'R') continue;
      if (quiereArchivos) rastro(ev.txt);
      if (ev.tipo !== 'capa') continue;
      const pz = capaPesada(ev.txt, ev.len);
      if (!pz) continue;
      const id = pz.o.id;
      if (ctx.ptr.has(id)) { hechas++; continue; }                  // ya subida en un intento anterior
      await cola.lanzar(async () => {
        const u8 = enc.encode(pz.ld), sha = await sha256Hex(u8);
        if (!sha) { res.pesadas.sinHash++; return; }
        try {
          const how = await xr.ensure(sha, pz.ld);
          ctx.ptr.set(id, 'r2:' + sha + ':' + u8.length);
          res.pesadas.n++; res.pesadas.bytes += u8.length;
          if (how === 'put') res.pesadas.subidas++; else res.pesadas.yaEstaban++;
        } catch (e) {
          if (e && e.code === 'aborted') throw e;
          res.pesadas.fallidas++;
          const m = String((e && e.message) || e).slice(0, 140);
          if (res.pesadas.errs.length < 3 && res.pesadas.errs.indexOf(m) < 0) res.pesadas.errs.push(m);
        }
        hechas++;
      });
    }
    await cola.esperar();
    return res.pesadas.fallidas;
  }

  // Un registro F de la copia → R2 (si falta). Las rutas se comprueban: solo anims/, gifs/ y covers/, sin «..».
  async function subirArchivo(u8, ctx) {
    const xr = SupabaseClient.xr, a = ctx.res.archivos;
    const m = RE_F.exec(dec.decode(u8.subarray(0, Math.min(u8.length, 2048))));
    const fallo = (k, why) => { a.fallidos++; if (a.errs.length < 5) a.errs.push((k || '?') + ': ' + why); };
    if (!m) { fallo('', 'registro mal formado'); return; }
    let k, tipo, h;
    try { k = JSON.parse(m[1]); tipo = JSON.parse(m[2]); h = JSON.parse(m[4]); } catch (_) { fallo('', 'registro mal formado'); return; }
    const b = +m[3];
    if (!rutaSegura(k)) { a.rechazados++; return; }
    if (ctx.hechos && ctx.hechos.has(k)) return;                  // ya restaurado en un intento anterior
    const ini = enc.encode(m[0]).length, fin = u8.length - 3;
    if (fin < ini || u8[fin] !== 0x22 || u8[fin + 1] !== 0x7d || u8[fin + 2] !== 0x5d) { fallo(k, 'registro cortado'); return; }
    const bytes = deBase64(u8, ini, fin);
    if (!bytes || bytes.length !== b) { fallo(k, 'contenido dañado'); return; }
    if (h) { const hh = await sha256Hex(bytes); if (hh && hh !== h) { fallo(k, 'no coincide con su huella'); return; } }
    try {
      const st = await conReintentos(ctx, () => xr.headFile(k, ctx.signal));
      if (st === 200) { a.yaEstaban++; if (ctx.hechos) ctx.hechos.add(k); return; }
      if (st !== 404) { fallo(k, 'R2 respondió ' + st); return; }
      const r = await conReintentos(ctx, () => xr.putFile(k, bytes, tipo, ctx.signal));
      if (r.status === 200 || r.status === 201) { a.subidos++; a.n++; a.bytes += bytes.length; if (ctx.hechos) ctx.hechos.add(k); } else fallo(k, 'R2 ' + r.status + (r.why ? ' ' + r.why : ''));
    } catch (e) {
      if (e && e.code === 'aborted') throw e;
      fallo(k, (e && e.message) || String(e));
    }
  }

  /* FASE BASE DE DATOS: borra las hojas de las obras a reemplazar y escribe todo por lotes. */
  async function faseBase(archivo, plan, ind, ctx) {
    const res = ctx.res;
    const { rpc, llamar } = crearRpc(ctx);
    const prog = (o) => { if (ctx.onProgress) { try { ctx.onProgress(o); } catch (_) {} } };
    const minPesada = pesadaMin();
    // 1) borrar lo de hoy en las obras a reemplazar (las hojas se piden otra vez: pueden haber cambiado desde el ensayo)
    const reemplazar = [...plan.obras.values()].filter(p => p.modo === 'replace' && p.existe).map(p => p.id);
    if (reemplazar.length) {
      prog({ fase: 'borrando' });
      const ids = [];
      for (const ch of trozos(reemplazar, 100)) {
        const v = aJson(await llamar('probe', { detail: ch }), 'probe');
        for (const w of ch) (v.detail && v.detail[w] || []).forEach(x => ids.push(x));
      }
      const borrar = async (ch) => {
        parado(ctx.signal);
        try {
          const v = aJson(await llamar('wipe', { panels: ch }), 'wipe');
          res.borrado.hojas += +v.panels || 0; res.borrado.capas += +v.layers || 0; res.borrado.textos += +v.texts || 0;
        } catch (e) {
          if (esTiempo(e) && ch.length > 1) { const mid = ch.length >> 1; res.divis++; await borrar(ch.slice(0, mid)); await borrar(ch.slice(mid)); return; }   // capas muy gordas: de menos en menos hojas
          throw e;
        }
      };
      for (const ch of trozos(ids, HOJAS_LOTE)) await borrar(ch);
    }
    // 2) escribir
    const tabla = (clave) => res.tablas[clave] || (res.tablas[clave] = { enviadas: 0, nuevas: 0, actualizadas: 0, fallidas: 0 });
    const lotes = new Map();
    const navs = [];
    const excluidas = new Set();
    const erroresObra = new Map();
    let verificadas = false, vistoObras = false, ultimo = 0, filasHechas = 0;
    const nota = (clave, e) => { if (res.errores.length < 20) res.errores.push({ t: clave.replace(/^public\./, ''), id: e.id || '', msg: String(e.e || e.msg || '').slice(0, 200) }); };

    // un lote; si falla por tiempo se parte en dos, si la red/servidor fallan se reintenta; las filas que la base rechaza se cuentan y se describen
    async function enviar(clave, modo, filas) {
      const nombre = clave.replace(/^public\./, '');
      const cuerpo = () => '{"t":' + JSON.stringify(nombre) + ',"mode":"' + modo + '","rows":[' + filas.join(',') + ']}';
      for (let intento = 0; ; intento++) {
        parado(ctx.signal);
        try {
          const v = aJson(await rpc('rows', null, { rawArg: cuerpo() }), 'rows');
          const t = tabla(clave);
          t.enviadas += +v.n || 0; t.nuevas += +v.ins || 0; t.actualizadas += +v.upd || 0; t.fallidas += +v.fail || 0;
          (v.err || []).forEach(e => { nota(clave, e); if (clave === 'public.works' && e.id) erroresObra.set(e.id, String(e.e || '')); });
          filasHechas += +v.n || 0;
          return;
        } catch (e) {
          parado(ctx.signal);
          const c = e && e.code;
          if (esTiempo(e) && filas.length > 1) {                              // la base tarda demasiado con este lote: dos más pequeños
            const mid = filas.length >> 1;
            res.divis++;
            await enviar(clave, modo, filas.slice(0, mid));
            await enviar(clave, modo, filas.slice(mid));
            return;
          }
          const transitorio = c === 'server' || c === 'network' || c === 'timeout';
          if (transitorio && intento < ESPERAS.length) {
            res.reint++;
            prog({ reintento: { i: intento + 1, de: ESPERAS.length } });
            await dormir(ESPERAS[intento], ctx.signal);
            prog({ reintento: null });
            continue;
          }
          if (c === 'server' && filas.length === 1) {                   // una fila que la base no consigue escribir: se anota y se sigue
            const t = tabla(clave); t.enviadas++; t.fallidas++;
            nota(clave, { id: '', msg: e.message });
            return;
          }
          if (c === 'bad' && /no admitida/i.test(e.message || '')) {    // la tabla ya no existe en la base
            const t = tabla(clave); t.enviadas += filas.length; t.fallidas += filas.length;
            nota(clave, { id: '', msg: e.message });
            return;
          }
          throw e;
        }
      }
    }
    async function volcar(l) { if (!l.filas.length) return; const f = l.filas; l.filas = []; l.bytes = 0; await enviar(l.clave, l.modo, f); }
    async function volcarTodo() { for (const l of lotes.values()) await volcar(l); }
    async function comprobarObras() {                               // ¿entraron las obras? Las que no, arrastrarían a sus hojas a fallar una a una
      const ids = [...plan.obras.values()].filter(p => !(p.modo === 'add' && p.existe)).map(p => p.id);
      for (const ch of trozos(ids, IDS_LOTE)) {
        const v = aJson(await llamar('probe', { works: ch }), 'probe');
        const hay = new Set(v.works || []);
        for (const w of ch) if (!hay.has(w)) { excluidas.add(w); const o = ind.obras.get(w); res.obrasFallidas.push({ id: w, titulo: o ? o.titulo : w, why: erroresObra.get(w) || '' }); }
      }
    }
    const alBytes = (b) => { const ahora = Date.now(); if (ahora - ultimo > 120) { ultimo = ahora; prog({ fase: 'base', bytes: b, total: archivo.size || 0, filas: filasHechas }); } };

    prog({ fase: 'base', bytes: 0, total: archivo.size || 0, filas: 0 });
    for await (const ev of filasElegidas(archivo, plan, { signal: ctx.signal, onBytes: alBytes })) {
      if (ev.ev === 'F' || ev.ev === 'Z') break;
      if (ev.ev === 'T') {
        await volcarTodo();
        if (ev.clave === 'public.works') vistoObras = true;
        if (vistoObras && !verificadas && (ev.clave === 'public.panels' || ev.clave === 'public.panel_layers' || ev.clave === 'public.panel_texts')) { verificadas = true; await comprobarObras(); }
        prog({ fase: 'base', tabla: ev.clave });
        continue;
      }
      if (ev.ev !== 'R') continue;
      if (ev.wid && excluidas.has(ev.wid)) { res.omitidas++; continue; }
      let txt = ev.txt;
      if (ev.tipo === 'capa' && ev.len >= minPesada) {
        const pz = capaPesada(txt, ev.len);
        if (pz) {
          const ptr = ctx.ptr.get(pz.o.id);
          const nuevo = ptr ? cambiarLayerData(txt, ptr, pz.o) : null;
          if (nuevo) txt = nuevo; else res.pesadas.enBase++;           // sin referencia (R2 no respondió o no se pudo) → entra con su texto, como antes de R2
        }
      }
      if (ev.tipo === 'hoja' && ev.o && ev.o.nav != null) navs.push({ id: ev.o.id, nav: JSON.stringify(ev.o.nav) });
      const k = ev.clave + '|' + ev.modo;
      let l = lotes.get(k);
      if (!l) { l = { clave: ev.clave, modo: ev.modo, filas: [], bytes: 0 }; lotes.set(k, l); }
      if (l.filas.length && (l.filas.length >= LOTE_FILAS || l.bytes + txt.length > LOTE_BYTES)) await volcar(l);
      l.filas.push(txt); l.bytes += txt.length;
      if (l.bytes >= LOTE_BYTES) await volcar(l);
    }
    await volcarTodo();
    if (vistoObras && !verificadas) { verificadas = true; await comprobarObras(); }
    // 3) el resumen de navegación de las hojas restauradas
    if (navs.length) {
      prog({ fase: 'nav' });
      for (const ch of trozos(navs, 200)) {
        const v = aJson(await llamar('nav', null, { rawArg: '{"rows":[' + ch.map(n => '{"id":' + JSON.stringify(n.id) + ',"nav":' + n.nav + '}').join(',') + ']}' }), 'nav');
        res.nav += +v.n || 0;
      }
    }
  }

  // ═════════════════════════════════════════ INTERFAZ (pestaña «Restaurar») ═════════════════════════════════════════
  const S = {
    fase: 'reposo',        // reposo · leyendo · elegir · ensayando · ensayo · ejecutando · r2fallo · hecho · error
    panel: null, file: null, ctrl: null, ind: null, ex: null, estados: null, orden: [], cuentas: null,
    sel: { obras: new Map(), otras: false, r2: true, r2todos: false },
    filtro: '', plan: null, ens: null, run: null, res: null, err: null, prog: {}, t0: 0, entiendo: false, lanzando: false,
  };
  const esc = (s) => (typeof escHtml === 'function' ? escHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const lang = () => (typeof I18n !== 'undefined' && I18n.getLang ? I18n.getLang() : 'es');
  const num = (n) => { try { return new Intl.NumberFormat(lang()).format(n); } catch (_) { return String(n); } };
  const mb = (b) => { try { return new Intl.NumberFormat(lang(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(b / 1048576); } catch (_) { return (b / 1048576).toFixed(1); } };
  const tiempo = (ms) => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + pad(s % 60); };
  const fechaLarga = (iso) => { try { return new Date(iso).toLocaleString(lang(), { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return String(iso); } };
  const ocupada = () => S.fase === 'leyendo' || S.fase === 'ensayando' || S.fase === 'ejecutando';

  function explicar(e) {
    const c = e && e.code, m = (e && e.message) || String(e);
    if (c === 'quota') return T('adminRsErrQuota');
    if (c === 'auth') return T('adminBkErrAuth');
    if (c === 'forbidden') return T('adminRsErrForbidden');
    if (c === 'missing') return T('adminRsErrMissing');
    if (c === 'network' || c === 'timeout') return T('adminRsErrNet');
    if (c === 'server') return T('adminBkErrServer', { msg: m });
    if (c === 'aborted') return T('adminRsAborted');
    if (c === 'bad') return T('adminRsErrBad', { msg: m });
    return T('adminRsErrFormat', { msg: m });
  }

  function render(panel) {
    S.panel = panel;
    panel.onclick = alPulsar;
    panel.onchange = alCambiar;
    panel.oninput = alEscribir;
    pintar();
  }

  function pintar() {
    const p = S.panel;
    if (!p || !p.isConnected) return;
    const f = S.fase;
    let h = `<div class="bk rs"><h2 class="bk-title">${esc(T('adminRsTitle'))}</h2>`;
    if (f === 'reposo') h += htmlReposo();
    else if (f === 'leyendo' || f === 'ensayando' || f === 'ejecutando') h += htmlProgreso(f);
    else if (f === 'elegir') h += htmlElegir();
    else if (f === 'ensayo') h += htmlEnsayo();
    else if (f === 'r2fallo') h += htmlR2Fallo();
    else if (f === 'hecho') h += htmlHecho();
    else if (f === 'error') h += `<p class="bk-p bk-warn"><b>${esc(explicar(S.err))}</b></p><div class="bk-actions"><button class="btn btn-primary" data-rs="volver-inicio">${esc(T('adminBkClose'))}</button>${btnInforme()}</div>${taInforme()}`;
    h += '</div>';
    p.innerHTML = h;
    if (ocupada()) actualizarProgreso(true);
  }

  function htmlReposo() {
    return `<p class="bk-p">${esc(T('adminRsIntro'))}</p>`
      + `<p class="bk-p bk-muted">${esc(T('adminRsLimits'))}</p>`
      + `<p class="bk-p bk-muted">${esc(T('adminRsSqlNote'))}</p>`
      + `<label class="bk-sub" for="rsFile">${esc(T('adminRsPick'))}</label>`
      + `<input type="file" id="rsFile" accept=".gz,.ndjson,application/gzip,application/x-gzip">`;
  }

  function htmlProgreso(f) {
    const titulo = f === 'leyendo' ? T('adminRsReading') : (f === 'ensayando' ? T('adminRsChecking') : T('adminRsRunning'));
    return `<p class="bk-p"><b>${esc(titulo)}</b></p>`
      + `<div class="bk-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bk-bar-fill" id="rsFill"></div></div>`
      + `<p class="bk-p bk-pct" id="rsPct">0 %</p><p class="bk-p" id="rsL1"></p><p class="bk-p bk-muted" id="rsL2"></p><p class="bk-p bk-muted" id="rsL3"></p>`
      + `<div class="bk-actions"><button class="btn" data-rs="cancelar">${esc(T('cancel'))}</button></div>`;
  }

  // ───────────── elegir qué restaurar ─────────────
  function calcularEstados() {
    S.estados = new Map();
    const c = { borradas: 0, faltan: 0, ok: 0 };
    for (const o of S.ind.obras.values()) {
      const e = estadoObra(o, S.ex);
      S.estados.set(o.id, e);
      if (e.e === 'borrada') c.borradas++; else if (e.e === 'faltan') c.faltan++; else c.ok++;
    }
    S.cuentas = c;
    const rango = { borrada: 0, faltan: 1, ok: 2 };
    S.orden = Array.from(S.ind.obras.values()).sort((a, b) => (rango[S.estados.get(a.id).e] - rango[S.estados.get(b.id).e]) || String(a.titulo).localeCompare(String(b.titulo), lang()));
  }

  function htmlElegir() {
    const ind = S.ind, m = ind.manifiesto || {};
    let h = '';
    if (!ind.ok) {
      h += `<p class="bk-p bk-warn"><b>${esc(T('adminRsBad'))}</b> <span class="bk-muted">${esc(S.file ? S.file.name : '')}</span></p>`;
      h += `<ul class="bk-list bk-warn">${ind.problemas.slice(0, 8).map(x => `<li>${esc(T(x.k, x.v))}</li>`).join('')}</ul>`;
      h += `<p class="bk-p">${esc(T('adminRsBadHelp'))}</p>`;
      h += `<div class="bk-actions"><button class="btn" data-rs="otro">${esc(T('adminRsPickOther'))}</button>${btnInforme()}</div>${taInforme()}`;
      return h;
    }
    const c = S.cuentas;
    h += `<p class="bk-p bk-ok"><b>${esc(T('adminRsOk'))}</b> <span class="bk-muted">${esc(S.file ? S.file.name : '')}</span></p>`;
    h += `<p class="bk-p bk-muted">${esc(T('adminBkVMade', { when: fechaLarga(m.created), ver: m.appVersion || '?' }))} · ${esc(T('adminRsSummary', { tables: num(ind.tablas.length), rows: num(ind.filas), files: num(ind.archivos.size) }))}</p>`;
    h += `<p class="bk-p">${esc(T('adminRsCounts', { n: num(ind.obras.size), b: num(c.borradas), f: num(c.faltan), k: num(c.ok) }))}</p>`;
    h += `<p class="bk-p bk-muted">${esc(T('adminRsHowTo'))}</p>`;
    h += `<div class="bk-actions rs-mini"><button class="btn" data-rs="marcar-faltan">${esc(T('adminRsMarkMissing'))}</button><button class="btn" data-rs="quitar">${esc(T('adminRsClearMarks'))}</button></div>`;
    h += `<input type="search" id="rsFiltro" class="rs-filtro" placeholder="${esc(T('adminRsFilter'))}" value="${esc(S.filtro)}" autocomplete="off">`;
    h += `<div class="bk-scroll rs-lista" id="rsLista">${htmlLista()}</div>`;
    h += `<p class="bk-p bk-muted" id="rsMarcadas">${htmlMarcadas()}</p>`;
    h += `<label class="bk-chk"><input type="checkbox" id="rsOtras" ${S.sel.otras ? 'checked' : ''}> <span>${esc(T('adminRsOthers'))}</span></label>`;
    h += `<p class="bk-p bk-muted bk-hint">${esc(T('adminRsOthersHint'))}</p>`;
    if (m.files === false || !ind.archivos.size) h += `<p class="bk-p bk-muted">${esc(T('adminRsNoFiles'))}</p>`;
    else {
      h += `<label class="bk-chk"><input type="checkbox" id="rsR2" ${S.sel.r2 ? 'checked' : ''}> <span>${esc(T('adminRsFilesCited'))}</span></label>`;
      h += `<label class="bk-chk"><input type="checkbox" id="rsR2todos" ${S.sel.r2todos ? 'checked' : ''}> <span>${esc(T('adminRsFilesAll'))}</span></label>`;
      h += `<p class="bk-p bk-muted bk-hint">${esc(T('adminRsFilesHint'))}</p>`;
    }
    h += `<div class="bk-actions"><button class="btn btn-primary bk-go" id="rsRevisar" data-rs="revisar" ${haySeleccion() ? '' : 'disabled'}>${esc(T('adminRsReview'))}</button><button class="btn" data-rs="otro">${esc(T('adminRsPickOther'))}</button>${btnInforme()}</div>${taInforme()}`;
    return h;
  }
  const haySeleccion = () => S.sel.obras.size > 0 || S.sel.otras;

  function htmlLista() {
    const q = S.filtro.trim().toLowerCase();
    const lista = S.orden.filter(o => !q || (o.titulo + ' ' + o.autor).toLowerCase().indexOf(q) >= 0);
    if (!lista.length) return `<p class="bk-p bk-muted rs-vacio">${esc(T('adminRsNoMatch'))}</p>`;
    const TOPE = 300;
    let h = lista.slice(0, TOPE).map(filaObra).join('');
    if (lista.length > TOPE) h += `<p class="bk-p bk-muted rs-vacio">${esc(T('adminRsMore', { n: num(lista.length - TOPE) }))}</p>`;
    return h;
  }
  function filaObra(o) {
    const e = S.estados.get(o.id), cur = S.sel.obras.get(o.id) || '';
    const chip = e.e === 'borrada' ? T('adminRsStDeleted') : (e.e === 'faltan' ? T('adminRsStMissing', { n: num(e.faltan) }) : T('adminRsStOk'));
    const info = T('adminRsWorkInfo', { author: o.autor || '—', sheets: num(o.hojas.length), layers: num(o.capas), mb: mb(o.bytes) });
    return `<div class="rs-obra"><div class="rs-obra-t"><b>${esc(o.titulo || T('adminRsNoTitle'))}</b> <span class="rs-chip rs-${e.e}">${esc(chip)}</span></div>`
      + `<div class="bk-muted rs-obra-i">${esc(info)}</div>`
      + `<select class="rs-sel" data-rs-obra="${esc(o.id)}" aria-label="${esc(o.titulo || '')}">`
      + `<option value="" ${cur === '' ? 'selected' : ''}>${esc(T('adminRsOptNone'))}</option>`
      + `<option value="add" ${cur === 'add' ? 'selected' : ''} ${e.e === 'ok' ? 'disabled' : ''}>${esc(e.e === 'ok' ? T('adminRsOptAddNone') : T('adminRsOptAdd'))}</option>`
      + `<option value="replace" ${cur === 'replace' ? 'selected' : ''}>${esc(T('adminRsOptReplace'))}</option></select></div>`;
  }
  function htmlMarcadas() {
    let a = 0, r = 0;
    for (const v of S.sel.obras.values()) { if (v === 'add') a++; else r++; }
    return esc(T('adminRsMarked', { a: num(a), r: num(r) }));
  }

  // ───────────── ensayo ─────────────
  function htmlEnsayo() {
    const E = S.ens, rep = E.obras.some(o => o.modo === 'replace');
    const nadaOtras = E.tablas.every(t => t.filas - t.existen <= 0);
    const nada = E.obras.length === 0 && nadaOtras;
    let h = `<p class="bk-p"><b>${esc(T('adminRsEnsTitle'))}</b></p><p class="bk-p bk-muted">${esc(T('adminRsEnsNothing'))}</p>`;
    if (E.obras.length) {
      h += `<div class="bk-scroll"><table class="bk-tbl"><thead><tr><th>${esc(T('adminRsColWork'))}</th><th class="bk-n">${esc(T('adminRsColSheets'))}</th><th class="bk-n">${esc(T('adminRsColLayers'))}</th><th class="bk-n">${esc(T('adminRsColTexts'))}</th></tr></thead><tbody>`;
      for (const o of E.obras) {
        const que = o.modo === 'replace' ? (o.existe ? T('adminRsEnsReplace') : T('adminRsEnsCreate')) : (o.existe ? T('adminRsEnsAddSheets') : T('adminRsEnsCreate'));
        h += `<tr><td><b>${esc(o.titulo || T('adminRsNoTitle'))}</b><br><span class="bk-muted">${esc(que)}</span>`
          + (o.borra ? `<br><span class="bk-warn">${esc(T('adminRsEnsDeletes', { h: num(o.borra.hojas), c: num(o.borra.capas), t: num(o.borra.textos) }))}</span>` : '')
          + `</td><td class="bk-n">${num(o.hojas)}</td><td class="bk-n">${num(o.capas)}</td><td class="bk-n">${num(o.textos)}</td></tr>`;
      }
      h += `</tbody></table></div>`;
    }
    if (E.tablas.length) {
      h += `<div class="bk-scroll"><table class="bk-tbl"><thead><tr><th>${esc(T('adminBkColTable'))}</th><th class="bk-n">${esc(T('adminBkColRows'))}</th><th class="bk-n">${esc(T('adminRsColExist'))}</th><th class="bk-n">${esc(T('adminRsColAdd'))}</th></tr></thead><tbody>`;
      for (const t of E.tablas) h += `<tr><td>${esc(t.clave.replace(/^public\./, ''))}</td><td class="bk-n">${num(t.filas)}</td><td class="bk-n">${num(t.existen)}</td><td class="bk-n">${num(Math.max(0, t.filas - t.existen))}</td></tr>`;
      h += `</tbody></table></div>`;
    }
    if (E.pesadas.n) h += `<p class="bk-p bk-muted">${esc(T('adminRsEnsHeavy', { n: num(E.pesadas.n), mb: mb(E.pesadas.bytes), have: num(E.pesadas.yaEnR2), up: num(E.pesadas.subir) }))}</p>`;
    if (E.archivos.enCopia) h += `<p class="bk-p bk-muted">${esc(T('adminRsEnsFiles', { n: num(E.archivos.enCopia), have: num(E.archivos.yaEnR2), up: num(E.archivos.subir), mb: mb(E.archivos.bytes) }))}</p>`;
    if (E.archivos.sinCopia) h += `<p class="bk-p bk-warn">${esc(T('adminRsEnsFilesMissing', { n: num(E.archivos.sinCopia) }))}</p>`;
    h += `<p class="bk-p bk-muted">${esc(T('adminRsEnsAccounts'))}</p>`;
    if (nada) h += `<p class="bk-p bk-warn"><b>${esc(T('adminRsEnsEmpty'))}</b></p>`;
    if (rep) {
      h += `<p class="bk-p bk-warn"><b>${esc(T('adminRsEnsReplaceWarn'))}</b></p>`;
      h += `<label class="bk-chk"><input type="checkbox" id="rsEntiendo" ${S.entiendo ? 'checked' : ''}> <span>${esc(T('adminRsEnsUnderstand'))}</span></label>`;
    }
    h += `<div class="bk-actions"><button class="btn btn-primary bk-go" id="rsGo" data-rs="restaurar" ${(nada || (rep && !S.entiendo)) ? 'disabled' : ''}>${esc(T('adminRsGo'))}</button><button class="btn" data-rs="volver-elegir">${esc(T('adminRsBack'))}</button>${btnInforme()}</div>${taInforme()}`;
    return h;
  }

  function htmlR2Fallo() {
    const r = S.res;
    return `<p class="bk-p bk-warn"><b>${esc(T('adminRsR2FailTitle'))}</b></p>`
      + `<p class="bk-p">${esc(T('adminRsR2FailBody', { n: num(r.pesadas.fallidas) }))}</p>`
      + (r.pesadas.errs.length ? `<p class="bk-p bk-muted">${esc(r.pesadas.errs.join(' · '))}</p>` : '')
      + `<div class="bk-actions"><button class="btn btn-primary" data-rs="r2-reintentar">${esc(T('adminRsR2Retry'))}</button><button class="btn" data-rs="r2-seguir">${esc(T('adminRsR2Continue'))}</button><button class="btn" data-rs="r2-cancelar">${esc(T('cancel'))}</button>${btnInforme()}</div>${taInforme()}`;
  }

  function htmlHecho() {
    const r = S.res;
    const filasMal = Object.values(r.tablas).reduce((a, x) => a + x.fallidas, 0);
    const bien = !r.cancelado && !filasMal && !r.obrasFallidas.length && !r.archivos.fallidos;
    let h = `<p class="bk-p ${bien ? 'bk-ok' : 'bk-warn'}"><b>${esc(r.cancelado ? T('adminRsCancelled') : (bien ? T('adminRsDone') : T('adminRsDonePartial')))}</b></p>`;
    if (r.cancelado) h += `<p class="bk-p">${esc(T('adminRsCancelledHelp'))}</p>`;
    const claves = Object.keys(r.tablas).filter(k => r.tablas[k].enviadas > 0);
    if (claves.length) {
      h += `<div class="bk-scroll"><table class="bk-tbl"><thead><tr><th>${esc(T('adminBkColTable'))}</th><th class="bk-n">${esc(T('adminRsColNew'))}</th><th class="bk-n">${esc(T('adminRsColUpd'))}</th><th class="bk-n">${esc(T('adminRsColSkip'))}</th><th class="bk-n">${esc(T('adminRsColBad'))}</th></tr></thead><tbody>`;
      for (const k of claves) {
        const t = r.tablas[k];
        h += `<tr><td>${esc(k.replace(/^public\./, ''))}</td><td class="bk-n">${num(t.nuevas)}</td><td class="bk-n">${num(t.actualizadas)}</td><td class="bk-n">${num(Math.max(0, t.enviadas - t.nuevas - t.actualizadas - t.fallidas))}</td><td class="bk-n ${t.fallidas ? 'bk-warn' : ''}">${num(t.fallidas)}</td></tr>`;
      }
      h += `</tbody></table></div>`;
    }
    if (r.borrado.hojas || r.borrado.capas || r.borrado.textos) h += `<p class="bk-p bk-muted">${esc(T('adminRsDoneDeleted', { h: num(r.borrado.hojas), c: num(r.borrado.capas), t: num(r.borrado.textos) }))}</p>`;
    const nPes = r.pesadas.subidas + r.pesadas.yaEstaban;
    if (nPes) h += `<p class="bk-p bk-muted">${esc(T('adminRsDoneHeavy', { n: num(nPes), mb: mb(r.pesadas.bytes) }))}</p>`;
    if (r.pesadas.enBase) h += `<p class="bk-p bk-warn">${esc(T('adminRsDoneHeavyBase', { n: num(r.pesadas.enBase) }))}</p>`;
    if (r.archivos.subidos || r.archivos.yaEstaban) h += `<p class="bk-p bk-muted">${esc(T('adminRsDoneFiles', { up: num(r.archivos.subidos), have: num(r.archivos.yaEstaban), mb: mb(r.archivos.bytes) }))}</p>`;
    if (r.archivos.fallidos) h += `<p class="bk-p bk-warn">${esc(T('adminRsDoneFilesBad', { n: num(r.archivos.fallidos) }))} ${esc(r.archivos.errs.slice(0, 3).join(' · '))}</p>`;
    if (r.nav) h += `<p class="bk-p bk-muted">${esc(T('adminRsDoneNav', { n: num(r.nav) }))}</p>`;
    if (r.obrasFallidas.length) {
      h += `<p class="bk-p bk-warn"><b>${esc(T('adminRsDoneWorksBad', { n: num(r.obrasFallidas.length) }))}</b></p><ul class="bk-list bk-warn">${r.obrasFallidas.slice(0, 8).map(o => `<li>${esc(o.titulo)}${o.why ? ' — ' + esc(o.why) : ''}</li>`).join('')}</ul>`;
      if (r.omitidas) h += `<p class="bk-p bk-muted">${esc(T('adminRsDoneSkipped', { n: num(r.omitidas) }))}</p>`;
      if (r.obrasFallidas.some(o => /foreign key|23503/i.test(o.why || ''))) h += `<p class="bk-p bk-warn">${esc(T('adminRsDoneAuthorHint'))}</p>`;
    }
    if (r.errores.length) h += `<p class="bk-p bk-warn"><b>${esc(T('adminRsDoneErrors'))}</b></p><ul class="bk-list bk-warn">${r.errores.slice(0, 10).map(e => `<li>${esc(e.t)}${e.id ? ' · ' + esc(e.id) : ''} — ${esc(e.msg)}</li>`).join('')}</ul>`;
    h += `<p class="bk-p bk-muted">${esc(T('adminRsAdvice'))}</p>`;
    h += `<div class="bk-actions"><button class="btn btn-primary" data-rs="volver-inicio">${esc(T('adminBkClose'))}</button>${btnInforme()}</div>${taInforme()}`;
    return h;
  }

  // ───────────── progreso ─────────────
  let _ult = 0;
  function actualizarProgreso(fuerza) {
    const p = S.panel;
    if (!p || !ocupada()) return;
    const ahora = Date.now();
    if (!fuerza && ahora - _ult < 120) return;
    _ult = ahora;
    const g = S.prog || {};
    const frac = (g.total ? Math.min(1, (g.bytes || 0) / g.total) : 0);
    let f = 0;
    if (S.fase === 'leyendo') f = g.fase === 'sondeo' ? 0.97 : 0.95 * frac;
    else if (S.fase === 'ensayando') f = g.fase === 'sondeo' ? 0.04 : (g.fase === 'archivos' ? 0.92 : 0.05 + 0.85 * frac);
    else {
      const conR2 = S.run && S.run.conR2;
      if (g.fase === 'r2') f = 0.40 * frac;
      else if (g.fase === 'borrando') f = conR2 ? 0.40 : 0.02;
      else if (g.fase === 'nav') f = 0.97;
      else if (g.fase === 'base') f = (conR2 ? 0.41 : 0.04) + (conR2 ? 0.55 : 0.92) * frac;
    }
    const pct = Math.max(0, Math.min(100, Math.round(f * 100)));
    const set = (id, txt) => { const el = p.querySelector('#' + id); if (el && el.textContent !== txt) el.textContent = txt; };
    const fill = p.querySelector('#rsFill'); if (fill) fill.style.width = pct + '%';
    const bar = p.querySelector('.bk-bar'); if (bar) bar.setAttribute('aria-valuenow', String(pct));
    set('rsPct', pct + ' %');
    const r = S.res;
    let l1 = '', l2 = '';
    if (g.fase === 'sondeo') l1 = T('adminRsProbing');
    else if (S.fase === 'leyendo') { l1 = T('adminRsReadingMb', { mb: mb(g.bytes || 0), total: mb(g.total || 0) }); l2 = T('adminRsReadingRows', { n: num(g.filas || 0) }); }
    else if (S.fase === 'ensayando') l1 = g.fase === 'archivos' ? T('adminRsCheckingFiles') : T('adminRsChecking');
    else if (g.fase === 'r2' && r) {
      l1 = T('adminRsStepR2', { done: num(r.pesadas.subidas + r.pesadas.yaEstaban + r.pesadas.fallidas), total: num(S.ens.pesadas.n) });
      if (S.ens.archivos.enCopia) l2 = T('adminRsStepR2Files', { done: num(r.archivos.subidos + r.archivos.yaEstaban + r.archivos.fallidos + r.archivos.rechazados), total: num(S.ens.archivos.enCopia) });
    } else if (g.fase === 'borrando') l1 = T('adminRsStepDelete');
    else if (g.fase === 'nav') l1 = T('adminRsStepNav');
    else if (g.fase === 'base') {
      l1 = T('adminRsStepBase', { name: String(g.tabla || '').replace(/^public\./, '') || '…' });
      l2 = T('adminRsStepRows', { n: num(g.filas || 0) });
    }
    set('rsL1', l1); set('rsL2', l2);
    set('rsL3', g.reintento ? T('adminBkRetrying', { i: g.reintento.i, n: g.reintento.de }) : T('adminRsElapsed', { time: tiempo(Date.now() - S.t0) }));
  }
  const alProgreso = (o) => { S.prog = Object.assign({}, S.prog, o); actualizarProgreso(); };

  // ───────────── informe para pegar (diagnóstico) ─────────────
  // Texto plano con las cifras, los errores y los tiempos de lo que hay en pantalla, para pegarlo en el chat sin tener que describirlo.
  // Nunca lleva el contenido de las capas: solo recuentos, títulos, ids cortos y mensajes de error.
  async function versionApp() {
    let v = ((document.querySelector('.app-version') || {}).textContent || '').trim();
    if (!v) { try { const n = (await caches.keys()).find(x => /^comxow-v\d+-\d+$/.test(x)); if (n) v = n.replace('comxow-v', 'v').replace(/-(\d+)$/, '.$1'); } catch (_) {} }
    return v || '?';
  }
  function informeTexto(ver) {
    const L = [], n = (x) => String(x == null ? 0 : x), corto = (id) => String(id || '').slice(0, 8);
    const ind = S.ind, m = (ind && ind.manifiesto) || {};
    L.push('INFORME DE RESTAURACIÓN · Comxow ' + ver + ' · ' + new Date().toISOString());
    L.push('Pantalla: ' + S.fase + (S.err ? ' · error ' + (S.err.code || '?') + ': ' + String(S.err.message || S.err).slice(0, 300) : ''));
    if (S.file) L.push('Archivo: ' + S.file.name + ' · ' + n(S.file.size) + ' bytes');
    if (ind) {
      L.push('Copia: hecha ' + (m.created || '?') + ' con la app ' + (m.appVersion || '?') + ' · formato ' + (m.fmt != null ? m.fmt : '?') + ' · integridad: '
        + (ind.ok ? 'correcta' : 'CON PROBLEMAS (' + ind.problemas.map(x => x.k + ' ' + JSON.stringify(x.v)).join(' | ') + ')'));
      L.push('Contenido: tablas ' + n(ind.tablas.length) + ' · filas ' + n(ind.filas) + ' · obras ' + n(ind.obras.size) + ' · hojas ' + n(ind.hojas.size) + ' · archivos de R2 ' + n(ind.archivos.size)
        + (ind.hojasHuerfanas ? ' · hojas sin obra ' + n(ind.hojasHuerfanas) : '') + (ind.capasSinHoja ? ' · capas sin hoja ' + n(ind.capasSinHoja) : ''));
    }
    if (S.cuentas) L.push('Obras de la copia ahora: borradas ' + n(S.cuentas.borradas) + ' · con hojas que faltan ' + n(S.cuentas.faltan) + ' · completas ' + n(S.cuentas.ok));
    let a = 0, r = 0;
    for (const v of S.sel.obras.values()) { if (v === 'add') a++; else r++; }
    if (a || r || S.sel.otras) L.push('Selección: añadir ' + n(a) + ' · reemplazar ' + n(r) + ' · otras tablas: ' + (S.sel.otras ? 'sí' : 'no') + ' · archivos de R2 citados: ' + (S.sel.r2 ? 'sí' : 'no') + ' · todos: ' + (S.sel.r2todos ? 'sí' : 'no'));
    const E = S.ens;
    if (E) {
      L.push('ENSAYO');
      for (const o of E.obras) L.push('  ' + (o.titulo || '(sin título)') + ' [' + corto(o.id) + '] ' + o.modo + (o.existe ? ' (existe)' : ' (no existe)') + ' · hojas ' + n(o.hojas) + ' · capas ' + n(o.capas) + ' · textos ' + n(o.textos)
        + (o.borra ? ' · borra ' + n(o.borra.hojas) + '/' + n(o.borra.capas) + '/' + n(o.borra.textos) + ' (hojas/capas/textos)' : ''));
      for (const t of E.tablas) L.push('  tabla ' + t.clave + ': filas ' + n(t.filas) + ' · ya existen ' + n(t.existen));
      L.push('  borra en total: hojas ' + n(E.borra.hojas) + ' · capas ' + n(E.borra.capas) + ' · textos ' + n(E.borra.textos));
      L.push('  capas pesadas: ' + n(E.pesadas.n) + ' (' + n(E.pesadas.bytes) + ' bytes) · ya en R2 ' + n(E.pesadas.yaEnR2) + ' · por subir ' + n(E.pesadas.subir) + ' · sin huella ' + n(E.pesadas.sinHash));
      L.push('  archivos de R2: citados ' + n(E.archivos.citados) + ' · en la copia ' + n(E.archivos.enCopia) + ' · ya están ' + n(E.archivos.yaEnR2) + ' · por subir ' + n(E.archivos.subir) + ' (' + n(E.archivos.bytes) + ' bytes) · citados y sin copia ' + n(E.archivos.sinCopia)
        + (E.archivos.sinCopiaEj.length ? ' (' + E.archivos.sinCopiaEj.join(', ') + ')' : ''));
    }
    const R = S.res;
    if (R) {
      L.push('EJECUCIÓN' + (R.cancelado ? ' (CANCELADA)' : '') + (R.ms ? ' · ' + Math.round(R.ms / 1000) + ' s' : '') + ' · reintentos ' + n(R.reint) + ' · lotes partidos por tiempo ' + n(R.divis));
      for (const k of Object.keys(R.tablas)) { const t = R.tablas[k]; L.push('  ' + k + ': enviadas ' + n(t.enviadas) + ' · nuevas ' + n(t.nuevas) + ' · actualizadas ' + n(t.actualizadas) + ' · con problema ' + n(t.fallidas)); }
      L.push('  borrado: hojas ' + n(R.borrado.hojas) + ' · capas ' + n(R.borrado.capas) + ' · textos ' + n(R.borrado.textos));
      L.push('  capas pesadas: subidas ' + n(R.pesadas.subidas) + ' · ya estaban ' + n(R.pesadas.yaEstaban) + ' · fallidas ' + n(R.pesadas.fallidas) + ' · dentro de la base ' + n(R.pesadas.enBase) + ' · ' + n(R.pesadas.bytes) + ' bytes'
        + (R.pesadas.errs.length ? ' · ' + R.pesadas.errs.join(' | ') : ''));
      L.push('  archivos de R2: subidos ' + n(R.archivos.subidos) + ' · ya estaban ' + n(R.archivos.yaEstaban) + ' · fallidos ' + n(R.archivos.fallidos) + ' · rechazados ' + n(R.archivos.rechazados) + ' · ' + n(R.archivos.bytes) + ' bytes'
        + (R.archivos.errs.length ? ' · ' + R.archivos.errs.join(' | ') : ''));
      L.push('  resumen de navegación: ' + n(R.nav) + ' hojas' + (R.omitidas ? ' · filas omitidas por obras que no entraron: ' + n(R.omitidas) : ''));
      R.obrasFallidas.forEach(o => L.push('  OBRA QUE NO ENTRÓ: ' + (o.titulo || '?') + ' [' + corto(o.id) + ']' + (o.why ? ' — ' + o.why : '')));
      R.errores.forEach(e => L.push('  FILA RECHAZADA: ' + e.t + (e.id ? ' ' + e.id : '') + ' — ' + e.msg));
    }
    return L.join('\n');
  }
  async function copiarInforme() {
    const txt = informeTexto(await versionApp());
    let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(txt); ok = true; } } catch (_) {}
    if (!ok) { try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (_) {} }
    const b = S.panel && S.panel.querySelector('[data-rs="copiar"]');
    if (ok && b) { b.textContent = T('adminRsCopied'); setTimeout(() => { if (b.isConnected) b.textContent = T('adminRsCopy'); }, 2500); }
    else if (!ok) { S.informe = txt; S.informeEn = S.fase; pintar(); }      // sin portapapeles: se enseña el texto para copiarlo a mano
  }
  const btnInforme = () => `<button class="btn" data-rs="copiar">${esc(T('adminRsCopy'))}</button>`;
  const taInforme = () => (S.informe && S.informeEn === S.fase)
    ? `<p class="bk-p bk-muted">${esc(T('adminRsCopyManual'))}</p><textarea class="rs-informe" id="rsInforme" readonly>${esc(S.informe)}</textarea>` : '';

  // ───────────── eventos ─────────────
  function alCambiar(e) {
    const t = e.target;
    if (!t) return;
    if (t.id === 'rsFile' && t.files && t.files[0]) leerArchivo(t.files[0]);
    else if (t.dataset && t.dataset.rsObra !== undefined) {
      if (t.value) S.sel.obras.set(t.dataset.rsObra, t.value); else S.sel.obras.delete(t.dataset.rsObra);
      refrescarSeleccion();
    } else if (t.id === 'rsOtras') { S.sel.otras = !!t.checked; refrescarSeleccion(); }
    else if (t.id === 'rsR2') S.sel.r2 = !!t.checked;
    else if (t.id === 'rsR2todos') S.sel.r2todos = !!t.checked;
    else if (t.id === 'rsEntiendo') { S.entiendo = !!t.checked; const b = S.panel && S.panel.querySelector('#rsGo'); if (b) b.disabled = !S.entiendo; }
  }
  function alEscribir(e) {
    const t = e.target;
    if (t && t.id === 'rsFiltro') { S.filtro = t.value || ''; const l = S.panel && S.panel.querySelector('#rsLista'); if (l) l.innerHTML = htmlLista(); }
  }
  function refrescarSeleccion() {
    const p = S.panel; if (!p) return;
    const m = p.querySelector('#rsMarcadas'); if (m) m.innerHTML = htmlMarcadas();
    const b = p.querySelector('#rsRevisar'); if (b) b.disabled = !haySeleccion();
  }
  function alPulsar(e) {
    const b = e.target.closest && e.target.closest('[data-rs]');
    if (!b || b.disabled) return;
    const a = b.dataset.rs;
    if (a === 'marcar-faltan') {
      for (const o of S.ind.obras.values()) { const est = S.estados.get(o.id); if (est.e !== 'ok' && !S.sel.obras.has(o.id)) S.sel.obras.set(o.id, 'add'); }
      pintar();
    } else if (a === 'quitar') { S.sel.obras.clear(); pintar(); }
    else if (a === 'revisar') revisar();
    else if (a === 'restaurar') restaurar('r2');
    else if (a === 'cancelar') { if (S.ctrl) S.ctrl.abort(); }
    else if (a === 'volver-elegir') { S.fase = 'elegir'; pintar(); }
    else if (a === 'otro' || a === 'volver-inicio') reiniciar();
    else if (a === 'r2-reintentar') restaurar('r2');
    else if (a === 'r2-seguir') restaurar('base');
    else if (a === 'r2-cancelar') { S.res.cancelado = true; S.fase = 'hecho'; pintar(); }
    else if (a === 'copiar') copiarInforme();
  }
  function reiniciar() {
    Object.assign(S, { fase: 'reposo', file: null, ind: null, ex: null, estados: null, orden: [], cuentas: null, plan: null, ens: null, run: null, res: null, err: null, prog: {}, entiendo: false, filtro: '', informe: null });
    S.sel = { obras: new Map(), otras: false, r2: true, r2todos: false };
    pintar();
  }

  // ───────────── flujo ─────────────
  const ctxBase = () => ({ signal: S.ctrl.signal, onProgress: alProgreso });
  function falla(e) {
    if (e && e.code === 'aborted') { if (typeof showToast === 'function') showToast(T('adminRsAborted'), 3500); return false; }
    S.err = e; S.fase = 'error'; console.error('[restaurar]', e);
    return true;
  }

  async function leerArchivo(file) {
    if (S.lanzando || ocupada()) return;
    S.lanzando = true;
    S.file = file; S.fase = 'leyendo'; S.ctrl = new AbortController(); S.prog = {}; S.t0 = Date.now(); S.ind = null; S.ex = null;
    pintar();
    try {
      S.ind = await indexar(file, ctxBase());
      if (S.ind.ok) {
        alProgreso({ fase: 'sondeo' }); actualizarProgreso(true);
        S.ex = await sondear(S.ind, ctxBase());
        calcularEstados();
        S.sel = { obras: new Map(), otras: false, r2: true, r2todos: false }; S.filtro = '';
      }
      S.fase = 'elegir';
    } catch (e) { if (!falla(e)) reiniciar_silencioso(); }
    finally { S.ctrl = null; S.lanzando = false; }
    pintar();
  }
  function reiniciar_silencioso() { S.fase = 'reposo'; S.file = null; S.ind = null; S.ex = null; }

  async function revisar() {
    if (ocupada() || !haySeleccion()) return;
    S.plan = armarPlan(S.ind, S.ex, S.sel);
    S.fase = 'ensayando'; S.ctrl = new AbortController(); S.prog = { fase: 'sondeo' }; S.t0 = Date.now(); S.ens = null; S.entiendo = false;
    pintar();
    try { S.ens = await ensayar(S.file, S.plan, S.ind, ctxBase()); S.fase = 'ensayo'; }
    catch (e) { if (falla(e)) { /* error */ } else S.fase = 'elegir'; }
    finally { S.ctrl = null; }
    pintar();
  }

  const _antesDeSalir = (e) => { e.preventDefault(); e.returnValue = ''; };

  // desde: 'r2' = (re)hacer la fase de R2 y seguir con la base · 'base' = saltarse R2 (las capas que no se subieron entran con su texto)
  async function restaurar(desde) {
    if (S.fase === 'ejecutando') return;
    const primera = desde === 'r2' && S.fase === 'ensayo';
    if (primera) { S.res = nuevoRes(); S.run = { ptr: new Map(), hechos: new Set(), conR2: (S.ens.pesadas.n + S.ens.archivos.enCopia) > 0 }; }
    S.fase = 'ejecutando'; S.ctrl = new AbortController(); S.prog = {}; if (primera) S.t0 = Date.now();
    pintar();
    let wake = null;
    window.addEventListener('beforeunload', _antesDeSalir);
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (_) {}
    const ctx = { signal: S.ctrl.signal, onProgress: alProgreso, res: S.res, ptr: S.run.ptr, hechos: S.run.hechos };
    try {
      if (desde === 'r2' && S.run.conR2) {
        const fallos = await faseR2(S.file, S.plan, S.ind, ctx);
        if (fallos > 0) { S.fase = 'r2fallo'; return; }
      }
      await faseBase(S.file, S.plan, S.ind, ctx);
      S.fase = 'hecho';
    } catch (e) {
      if (e && e.code === 'aborted') { S.res.cancelado = true; S.fase = 'hecho'; }
      else { S.err = e; S.fase = 'error'; console.error('[restaurar]', e); }
    } finally {
      if (S.res) S.res.ms = Date.now() - S.t0;
      window.removeEventListener('beforeunload', _antesDeSalir);
      try { if (wake) await wake.release(); } catch (_) {}
      S.ctrl = null;
      pintar();
    }
  }

  return {
    render, busy: ocupada,
    engine: { leerLineas, indexar, sondear, estadoObra, armarPlan, ensayar, faseR2, faseBase, cambiarLayerData, capaPesada, crearRastro, nuevoRes, RsError },
    _state: S,
  };
})();
if (typeof window !== 'undefined') window.AdminRestore = AdminRestore;
