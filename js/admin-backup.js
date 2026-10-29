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
   admin-backup.js — Copia de seguridad completa de la base de datos (v42.29; páginas adaptativas y avisos de la plataforma ocultos en la v42.30)

   Solo la cuenta administradora principal («admin») ve la pestaña «Copia» del panel de administración, y aunque alguien
   forzara la pantalla, la barrera real está en la base de datos: la función SQL public.admin_backup (ver
   sql/v42_29_backup_admin_1_funcion.sql) rechaza a cualquier otra cuenta.

   Qué descarga: UN archivo `comxow-copia-AAAA-MM-DD_HHMM.ndjson.gz` (texto JSON, una línea por registro, comprimido en gzip) con
     · la estructura de la base (tablas, funciones, políticas RLS, permisos, disparadores…)  ["S", fase, sql]
     · TODAS las filas de TODAS las tablas de «public» (las conozca o no este código) y, si se pide, las cuentas (auth.users y
       auth.identities)                                                                    ["T", esquema, tabla, n] + ["R", fila]…
     · el manifiesto del principio ["M", …] y el cierre ["Z", …] con el recuento de cada tabla (si falta, la descarga se cortó)
   Se restaura con backup/restaurar-copia.mjs (guía: backup/LEEME_COPIA_ADMIN.md).

   Cómo se descarga: página a página (≈2 MB por petición, cursor por clave primaria), con reintentos, sin guardar nada en memoria
   (se comprime y se escribe al vuelo en el archivo elegido; sin selector de archivos, se junta en un Blob). Las filas nunca se
   pasan por JSON.parse: así los enteros de 64 bits no se redondean. Al terminar se vuelve a leer el archivo y se comprueba.

   Estándares usados (no se ha inventado nada): CompressionStream/DecompressionStream (gzip), File System Access API
   (showSaveFilePicker), Screen Wake Lock API, NDJSON (https://github.com/ndjson/ndjson-spec); pako (ya incluido en la app)
   como respaldo del gzip en navegadores sin CompressionStream.
   ============================================================ */
const AdminBackup = (() => {
  'use strict';
  const FMT = 1;
  const LAST_KEY = 'cx_admin_backup_last';        // comodidad por navegador (no es un dato que importe): cuándo se hizo la última copia desde aquí
  const PAGE_BYTES = 2000000;                      // tope de bytes por página (la función SQL deja pasar una fila más, si hace falta, para avanzar siempre)
  const REINTENTOS = [700, 2500, 7000];            // esperas entre reintentos de una petición
  // Filas por página (v42.30). La función SQL convierte en texto TODAS las filas que se le piden (`limit`) antes de aplicar el tope de
  // bytes, así que el coste de una llamada depende de las filas PEDIDAS, no de las devueltas (en el Supabase de Alberto, ≈ 3 MB/s, con
  // un tope de 8 s por consulta). El tamaño guardado de una tabla (comprimido) puede ser muy inferior al del texto JSON de sus filas;
  // por eso la primera página es prudente y desde la segunda se usa el peso real de las filas ya leídas.
  const L_MAX = 250;                               // tope de filas por página (acota el coste si de pronto vienen filas muy pesadas)
  const L_PRIMERA = 100;                           // tope de filas de la primera página de cada tabla
  const PRUDENCIA = 8;                             // la primera página supone filas hasta 8 veces más pesadas de lo que dice el tamaño guardado
  const SEGURIDAD = 1.5;                           // margen sobre el peso medio de fila (las filas de una página no pesan todas igual)
  const CRECE = 4;                                 // la página crece como mucho ×4 cada vez (arranque lento, como en TCP)
  const T_OBJ = 3000;                              // ms: si una llamada tarda más, la siguiente página se reduce en proporción
  const enc = new TextEncoder();
  const T = (k, v) => (typeof I18n !== 'undefined' ? I18n.t(k, v) : k);
  const pad = n => (n < 10 ? '0' : '') + n;

  class BkError extends Error {
    constructor(code, msg, extra) { super(msg || code); this.name = 'BkError'; this.code = code; if (extra) Object.assign(this, extra); }
  }

  function nombreArchivo(d) {
    d = d || new Date();
    return `comxow-copia-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.ndjson.gz`;
  }

  // ═════════════════════════════════════════ MOTOR (sin DOM) ═════════════════════════════════════════

  // Tablas en orden de claves ajenas (primero las que no dependen de otras). Con un ciclo se rompe por donde toca: el restaurador
  // carga con las claves ajenas desactivadas, así que el orden es una comodidad, no una condición.
  function ordenar(tablas) {
    const clave = t => t.s + '.' + t.n;
    const por = new Map(tablas.map(t => [clave(t), t]));
    const hechas = new Set(), enCurso = new Set(), out = [];
    const visitar = (t) => {
      const k = clave(t);
      if (hechas.has(k) || enCurso.has(k)) return;
      enCurso.add(k);
      for (const f of (t.fk || [])) { const p = por.get(f); if (p) visitar(p); }
      enCurso.delete(k); hechas.add(k); out.push(t);
    };
    tablas.slice().sort((a, b) => (clave(a) < clave(b) ? -1 : 1)).forEach(visitar);
    return out;
  }

  // Compresor gzip en flujo. `destino` = flujo de escritura de un archivo (showSaveFilePicker) o null (→ Blob en memoria).
  async function crearSink(destino) {
    let bytesGz = 0;
    const trozos = destino ? null : [];
    const dar = async (u8) => { bytesGz += u8.length; if (destino) await destino.write(u8); else trozos.push(u8); };
    let cuerpo;
    if (typeof CompressionStream === 'function') {
      const cs = new CompressionStream('gzip');
      const w = cs.writable.getWriter();
      const r = cs.readable.getReader();
      let fallo = null;
      const bomba = (async () => { try { for (;;) { const x = await r.read(); if (x.done) break; await dar(x.value); } } catch (e) { fallo = e; throw e; } })();
      bomba.catch(() => {});
      cuerpo = {
        async write(texto) { const u8 = enc.encode(texto); if (fallo) throw fallo; await w.write(u8); return u8.length; },
        async close() { await w.close(); await bomba; },
        async abort(e) { try { await w.abort(e); } catch (_) {} try { await bomba; } catch (_) {} },
      };
    } else {
      if (typeof pako === 'undefined') throw new BkError('format', 'Este navegador no puede comprimir en gzip.');
      const d = new pako.Deflate({ gzip: true });
      const cola = [];
      d.onData = c => cola.push(c);
      const vaciar = async () => { while (cola.length) await dar(cola.shift()); };
      cuerpo = {
        async write(texto) { const u8 = enc.encode(texto); d.push(u8, false); if (d.err) throw new BkError('format', d.msg || 'gzip'); await vaciar(); return u8.length; },
        async close() { d.push(new Uint8Array(0), true); if (d.err) throw new BkError('format', d.msg || 'gzip'); await vaciar(); },
        async abort() {},
      };
    }
    return {
      write: (t) => cuerpo.write(t),
      async close() {
        await cuerpo.close();
        if (destino) await destino.close();
        return { bytes: bytesGz, blob: trozos ? new Blob(trozos, { type: 'application/gzip' }) : null };
      },
      async abort(e) { await cuerpo.abort(e); if (destino) { try { await destino.abort(); } catch (_) {} } },
    };
  }

  const aJson = (txt, que) => {
    try { return JSON.parse(txt); } catch (e) { throw new BkError('format', `${que}: respuesta no válida`); }
  };

  // Pide el plan (qué hay que copiar: tablas, columnas, claves, filas, secuencias). Sirve para enseñar el resumen antes de empezar.
  async function obtenerPlan(rpc, { auth = true, signal } = {}) {
    const plan = aJson(await rpc('plan', { auth }, { signal }), 'plan');
    if (!plan || plan.fmt !== FMT || !Array.isArray(plan.tables)) throw new BkError('format', 'plan: formato desconocido');
    // Disparadores de evento que crea la propia plataforma de Supabase (issue_*, pgrst_*): los recrea ella en cualquier proyecto nuevo,
    // así que no son un aviso. Se apartan en `platform` (informativo); cualquier otro elemento sin cubrir se sigue avisando.
    if (Array.isArray(plan.unsupported)) {
      const prop = plan.unsupported.filter(x => /^disparador de evento (issue_|pgrst_)/.test(String(x)));
      if (prop.length) { plan.platform = prop; plan.unsupported = plan.unsupported.filter(x => prop.indexOf(x) < 0); }
    }
    return plan;
  }

  const contarLineas = (s) => { let n = 1, i = -1; while ((i = s.indexOf('\n', i + 1)) >= 0) n++; return n; };

  /* Exporta todo al `sink` (objeto con write(texto)→bytes, close(), abort()).
     opts: { rpc, sink, plan?, auth, signal, onProgress(estado), pageBytes, reintentos, appVersion } */
  async function exportar(opts) {
    const { rpc, sink, signal, onProgress } = opts;
    const auth = opts.auth !== false;
    const esperas = opts.reintentos || REINTENTOS;
    const pageBytes0 = opts.pageBytes || PAGE_BYTES;
    const prog = (o) => { if (onProgress) { try { onProgress(o); } catch (_) {} } };
    const parado = () => { if (signal && signal.aborted) throw new BkError('aborted', 'Cancelado'); };
    const dormir = (ms) => new Promise((res, rej) => {
      const t = setTimeout(() => { if (signal) signal.removeEventListener('abort', ab); res(); }, ms);
      const ab = () => { clearTimeout(t); rej(new BkError('aborted', 'Cancelado')); };
      if (signal) { if (signal.aborted) ab(); else signal.addEventListener('abort', ab, { once: true }); }
    });

    let reintento = null, ultimaMs = 0, minMs = Infinity;
    // Una petición con reintentos (red, 5xx, tiempo agotado). Los demás errores (402, 403…) suben tal cual.
    // `ultimaMs` = lo que tardó la última petición que salió bien (sin contar esperas ni intentos fallidos); `minMs` = la más rápida de
    // todas (≈ la latencia de la red), para separar lo que tarda la red de lo que tarda la base de datos.
    async function llamar(op, arg, alReintentar) {
      for (let intento = 0; ; intento++) {
        parado();
        const t0 = Date.now();
        try { const r = await rpc(op, arg, { signal }); ultimaMs = Date.now() - t0; if (ultimaMs < minMs) minMs = ultimaMs; return r; }
        catch (e) {
          parado();
          const c = e && e.code;
          if (!(c === 'server' || c === 'network' || c === 'timeout') || intento >= esperas.length) throw e;
          reintento = { i: intento + 1, de: esperas.length, causa: c };
          if (alReintentar) arg = alReintentar(arg, c);
          prog({ fase: 'reintento', reintento });
          await dormir(esperas[intento]);
          reintento = null;
        }
      }
    }

    prog({ fase: 'plan' });
    const plan = opts.plan || await obtenerPlan((op, a, o) => llamar(op, a), { auth, signal });
    parado();
    prog({ fase: 'estructura' });
    const esq = aJson(await llamar('schema', {}), 'schema');
    if (!esq || esq.fmt !== FMT || !Array.isArray(esq.stmts)) throw new BkError('format', 'schema: formato desconocido');
    parado();

    const orden = ordenar(plan.tables);
    const filasPrev = orden.reduce((a, t) => a + (t.rows || 0), 0);
    const pesoTotal = orden.reduce((a, t) => a + (t.bytes || 0), 0);
    const inicio = Date.now();
    let bytesCrudos = 0;
    const w = async (linea) => { bytesCrudos += await sink.write(linea + '\n'); };

    await w(JSON.stringify(['M', { fmt: FMT, app: 'comxow', appVersion: opts.appVersion || '', created: new Date().toISOString(), plan }]));
    for (const s of esq.stmts) await w(JSON.stringify(['S', s.k, s.sql]));

    const counts = {};
    let filas = 0, paginas = 0, pesoHecho = 0;
    for (let ti = 0; ti < orden.length; ti++) {
      const t = orden[ti];
      const key = t.s + '.' + t.n;
      await w(JSON.stringify(['T', t.s, t.n, t.rows || 0]));
      // Filas por página. Primera página, prudente: el tamaño medio GUARDADO de una fila (comprimido) puede ser muy inferior al de su
      // texto JSON. Desde la segunda, el peso REAL de las filas ya leídas (ver más abajo). La función SQL aplica además el tope de bytes.
      const media = Math.max(1, (t.bytes || 0) / Math.max(1, t.rows || 0));
      const pbytes = pageBytes0;
      let escala = 1;                                  // tras un fallo de red o de tiempo baja a ¼ (y no menos de 1/64); se recupera ×2 con cada página buena
      const tope = () => Math.max(250000, Math.floor(pbytes * escala));
      let limite = Math.max(1, Math.min(L_MAX, L_PRIMERA, Math.floor(tope() / (media * PRUDENCIA))));
      let despues = null, hechasT = 0, acumF = 0, acumB = 0;
      for (;;) {
        const arg = { s: t.s, n: t.n, limit: limite, bytes: tope() };
        if (despues !== null) arg.after = despues;
        const txt = await llamar('page', arg, (a, causa) => {
          // tras un fallo de red o de tiempo, páginas bastante más pequeñas (conexión lenta o inestable, o filas más pesadas de lo previsto)
          escala = Math.max(1 / 64, escala / 4); limite = Math.max(1, Math.floor(limite / 4));
          return Object.assign({}, a, { bytes: tope(), limit: limite });
        });
        paginas++;
        const nl = txt.indexOf('\n');
        const cab = aJson(nl < 0 ? txt : txt.slice(0, nl), `${key}: cabecera de página`);
        const cuerpo = nl < 0 ? '' : txt.slice(nl + 1);
        const n = cab && cab.n;
        if (!Number.isInteger(n) || n < 0) throw new BkError('format', `${key}: cabecera de página no válida`);
        if (n > 0) {
          if (cuerpo.length === 0 || contarLineas(cuerpo) !== n) throw new BkError('format', `${key}: la página dice ${n} filas y trae otro número`);
          bytesCrudos += await sink.write(cuerpo + '\n');
        } else if (cuerpo.length) throw new BkError('format', `${key}: página vacía con contenido`);
        hechasT += n; filas += n;
        // Tamaño de la página siguiente (cab.b = bytes de texto devueltos): las filas que caben en el tope de bytes según el peso medio de
        // fila, tomando el MAYOR entre la media de la tabla hasta ahora y la de esta página (más margen); si la llamada tardó más de T_OBJ
        // (sin contar la latencia de la red), en proporción menos; y sin crecer más de ×CRECE de golpe.
        if (n > 0 && cab.b > 0) {
          acumF += n; acumB += cab.b;
          const medio = Math.max(acumB / acumF, cab.b / n);
          let ideal = Math.floor(tope() / (medio * SEGURIDAD));
          const propio = ultimaMs - (minMs < Infinity ? minMs : 0);        // tiempo de esta llamada descontada la latencia de la red
          if (propio > T_OBJ) ideal = Math.floor(ideal * T_OBJ / propio);
          escala = Math.min(1, escala * 2);
          limite = Math.max(1, Math.min(L_MAX, ideal, limite * CRECE));
        }
        const parcial = (t.rows ? Math.min(1, hechasT / t.rows) : 1) * (t.bytes || 0);
        prog({
          fase: 'datos', tabla: key, tablaIdx: ti + 1, tablas: orden.length, filasTabla: hechasT, filasTablaTotal: t.rows || 0,
          filas, filasPrev, bytes: bytesCrudos, paginas, ms: Date.now() - inicio,
          fraccion: pesoTotal > 0 ? Math.min(0.999, (pesoHecho + parcial) / pesoTotal) : Math.min(0.999, filas / Math.max(1, filasPrev)),
        });
        const sig = cab.next;
        if (sig === null || sig === undefined) break;
        if (n === 0) throw new BkError('format', `${key}: el cursor avanza sin traer filas`);
        if (sig === despues) throw new BkError('format', `${key}: el cursor no avanza`);
        despues = sig;
        parado();
      }
      pesoHecho += (t.bytes || 0);
      counts[key] = hechasT;
    }

    // Tablas cuyo número de filas cambió mientras se copiaba (alguien usaba la web): copia «difusa», se avisa pero es válida.
    const cambios = orden.filter(t => counts[t.s + '.' + t.n] !== (t.rows || 0)).map(t => ({ tabla: t.s + '.' + t.n, antes: t.rows || 0, despues: counts[t.s + '.' + t.n] }));
    prog({ fase: 'cierre' });
    await w(JSON.stringify(['Z', { finished: new Date().toISOString(), counts, rows: filas, bytes: bytesCrudos, drift: cambios }]));
    const info = await sink.close();
    return { counts, filas, tablas: orden.length, bytesCrudos, bytesGz: info.bytes, blob: info.blob, cambios, plan, ms: Date.now() - inicio, paginas };
  }

  // ───────────── comprobar un archivo ya hecho (el que se acaba de guardar o uno que se elige) ─────────────
  async function* gunzipTrozos(archivo) {
    if (typeof DecompressionStream === 'function') {
      const r = archivo.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
      for (;;) { const x = await r.read(); if (x.done) break; yield x.value; }
    } else {
      if (typeof pako === 'undefined') throw new BkError('format', 'Este navegador no puede descomprimir gzip.');
      const inf = new pako.Inflate();
      const cola = [];
      inf.onData = c => cola.push(c);
      const r = archivo.stream().getReader();
      for (;;) {
        const x = await r.read();
        inf.push(x.done ? new Uint8Array(0) : x.value, x.done);
        if (inf.err) throw new BkError('format', inf.msg || 'gzip dañado');
        while (cola.length) yield cola.shift();
        if (x.done) break;
      }
      if (!inf.ended) throw new BkError('format', 'El archivo está cortado');
    }
  }

  /* Lee el archivo entero (sin guardar nada en memoria) y devuelve
     { ok, manifiesto, tablas:[{clave,previstas,hay}], final, filas, lineas, bytes, problemas:[] }.
     Solo se decodifican las líneas M, S, T y Z; las de datos (R) se cuentan por su forma. */
  async function verificar(archivo, onProgress) {
    const r = { ok: false, manifiesto: null, esquema: 0, tablas: [], final: null, filas: 0, lineas: 0, bytes: 0, problemas: [] };
    const dec = new TextDecoder();
    let cur = null;
    // línea en construcción
    let partes = [], len = 0, cab = [], ult = 0, descartar = false;
    const finLinea = () => {
      r.lineas++;
      if (len === 0) { partes = []; cab = []; ult = 0; descartar = false; return; }
      const esR = len > 5 && cab[0] === 0x5b && cab[1] === 0x22 && cab[2] === 0x52 && cab[3] === 0x22 && cab[4] === 0x2c;
      if (esR) {
        if (!cur) r.problemas.push(`Línea ${r.lineas}: una fila fuera de cualquier tabla`);
        else { cur.hay++; r.filas++; }
        if (cab[5] !== 0x7b || ult !== 0x5d) { if (r.problemas.length < 20) r.problemas.push(`Línea ${r.lineas}: fila mal formada`); }
      } else {
        let u8;
        if (partes.length === 1) u8 = partes[0]; else { u8 = new Uint8Array(len); let o = 0; for (const p of partes) { u8.set(p, o); o += p.length; } }
        let v;
        try { v = JSON.parse(dec.decode(u8)); } catch (e) { v = null; }
        if (!Array.isArray(v)) { if (r.problemas.length < 20) r.problemas.push(`Línea ${r.lineas}: no es un registro válido`); }
        else if (v[0] === 'M') r.manifiesto = v[1];
        else if (v[0] === 'S') r.esquema++;
        else if (v[0] === 'T') { cur = { s: v[1], n: v[2], clave: v[1] + '.' + v[2], previstas: v[3], hay: 0 }; r.tablas.push(cur); }
        else if (v[0] === 'Z') { r.final = v[1]; cur = null; }
        else if (r.problemas.length < 20) r.problemas.push(`Línea ${r.lineas}: tipo de registro desconocido`);
      }
      partes = []; len = 0; cab = []; ult = 0; descartar = false;
    };
    const anadir = (u8) => {
      if (!u8.length) return;
      for (let i = 0; cab.length < 6 && i < u8.length; i++) cab.push(u8[i]);
      ult = u8[u8.length - 1];
      len += u8.length;
      if (!descartar) {
        if (cab.length >= 5 && cab[0] === 0x5b && cab[1] === 0x22 && cab[2] === 0x52 && cab[3] === 0x22 && cab[4] === 0x2c) { descartar = true; partes = []; }
        else partes.push(u8.slice());
      }
    };
    let leidos = 0;
    try {
      for await (const trozo of gunzipTrozos(archivo)) {
        r.bytes += trozo.length;
        let ini = 0;
        for (;;) {
          const i = trozo.indexOf(10, ini);
          if (i < 0) break;
          anadir(trozo.subarray(ini, i)); finLinea();
          ini = i + 1;
        }
        if (ini < trozo.length) anadir(trozo.subarray(ini));
        if (onProgress && ++leidos % 20 === 0) onProgress({ filas: r.filas, bytes: r.bytes });
      }
      if (len) { finLinea(); r.problemas.push('Falta el salto de línea final'); }
    } catch (e) {
      r.problemas.push('El archivo está dañado o cortado (' + ((e && e.message) || e) + ')');
    }
    if (!r.manifiesto) r.problemas.push('Falta el manifiesto: no parece una copia de Comxow');
    else if (r.manifiesto.fmt !== FMT) r.problemas.push('Formato de copia desconocido (' + r.manifiesto.fmt + ')');
    if (!r.final) r.problemas.push('Falta el cierre del archivo: la descarga se cortó antes de terminar');
    else for (const t of r.tablas) {
      const dice = r.final.counts ? r.final.counts[t.clave] : undefined;
      if (dice === undefined) r.problemas.push(`${t.clave}: no consta en el cierre`);
      else if (dice !== t.hay) r.problemas.push(`${t.clave}: trae ${t.hay} filas y el cierre dice ${dice}`);
    }
    r.ok = r.problemas.length === 0;
    return r;
  }

  // ═════════════════════════════════════════ INTERFAZ (pestaña «Copia») ═════════════════════════════════════════
  const S = {
    fase: 'reposo',        // reposo · preparando · confirmar · ejecutando · hecho · error
    auth: true, plan: null, planAt: 0, prog: null, res: null, err: null, ctrl: null, panel: null, t0: 0, verif: null, verifBusy: false, verifName: '',
  };
  const esc = (s) => (typeof escHtml === 'function' ? escHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const lang = () => (typeof I18n !== 'undefined' && I18n.getLang ? I18n.getLang() : 'es');
  const num = (n) => { try { return new Intl.NumberFormat(lang()).format(n); } catch (_) { return String(n); } };
  const mb = (b) => { try { return new Intl.NumberFormat(lang(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(b / 1048576); } catch (_) { return (b / 1048576).toFixed(1); } };
  const tam = (b) => (b >= 1073741824 ? mb(b / 1024) + ' GB' : mb(b) + ' MB');
  const tiempo = (ms) => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + pad(s % 60); };
  const fechaLarga = (iso) => { try { return new Date(iso).toLocaleString(lang(), { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return String(iso); } };

  function ultima() { try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (_) { return null; } }
  function guardarUltima(o) { try { localStorage.setItem(LAST_KEY, JSON.stringify(o)); } catch (_) {} }

  function explicar(e) {
    const c = e && e.code;
    const m = (e && e.message) || String(e);
    if (c === 'quota') return T('adminBkErrQuota');
    if (c === 'auth') return T('adminBkErrAuth');
    if (c === 'forbidden') return T('adminBkErrForbidden');
    if (c === 'missing') return T('adminBkErrMissing');
    if (c === 'network' || c === 'timeout') return T('adminBkErrNet');
    if (c === 'server') return T('adminBkErrServer', { msg: m });
    if (c === 'aborted') return T('adminBkAborted');
    if (c === 'save') return T('adminBkErrSave', { msg: m });
    return T('adminBkErrFormat', { msg: m });
  }

  // el trabajo sigue aunque se cambie de pestaña del panel: la pantalla se repinta desde S cada vez que se vuelve
  function render(panel) {
    S.panel = panel;
    panel.onclick = alPulsar;
    panel.onchange = alCambiar;
    pintar();
  }

  function pintar() {
    const p = S.panel;
    if (!p || !p.isConnected) return;
    const f = S.fase;
    let h = `<div class="bk"><h2 class="bk-title">${esc(T('adminBkTitle'))}</h2>`;
    if (f === 'reposo' || f === 'preparando') {
      const ul = ultima();
      h += `<p class="bk-p">${esc(T('adminBkIntro'))}</p>`;
      h += `<p class="bk-p bk-muted">${esc(T('adminBkNotIncl'))}</p>`;
      h += `<label class="bk-chk"><input type="checkbox" id="bkAuth" ${S.auth ? 'checked' : ''} ${f === 'preparando' ? 'disabled' : ''}> <span>${esc(T('adminBkAuthChk'))}</span></label>`;
      h += `<p class="bk-p bk-muted bk-hint">${esc(T('adminBkAuthHint'))}</p>`;
      h += `<div class="bk-actions"><button class="btn btn-primary bk-go" data-bk="preparar" ${f === 'preparando' ? 'disabled' : ''}>${esc(f === 'preparando' ? T('adminBkPreparing') : T('adminBkGo'))}</button></div>`;
      if (ul && ul.at) {
        const dias = Math.floor((Date.now() - new Date(ul.at).getTime()) / 86400000);
        h += `<p class="bk-p bk-muted bk-last">${esc(T('adminBkLast', { when: fechaLarga(ul.at), size: tam(ul.bytes || 0), rows: num(ul.rows || 0) }))}${dias >= 30 ? ' <b>' + esc(T('adminBkOld', { n: dias })) + '</b>' : ''}</p>`;
      } else h += `<p class="bk-p bk-muted bk-last">${esc(T('adminBkNever'))}</p>`;
      h += `<p class="bk-p bk-muted">${esc(T('adminBkHow'))}</p>`;
      h += `<hr class="bk-hr"><h3 class="bk-sub">${esc(T('adminBkVTitle'))}</h3><p class="bk-p bk-muted">${esc(T('adminBkVHelp'))}</p>`;
      h += `<input type="file" id="bkFile" accept=".gz,.ndjson,application/gzip,application/x-gzip">`;
      h += `<div id="bkVerif" class="bk-verif">${verifHtml()}</div>`;
    } else if (f === 'confirmar') {
      const pl = S.plan, tb = pl.tables.slice().sort((a, b) => (a.s + a.n < b.s + b.n ? -1 : 1));
      const filas = tb.reduce((a, t) => a + (t.rows || 0), 0), bytes = tb.reduce((a, t) => a + (t.bytes || 0), 0);
      h += `<h3 class="bk-sub">${esc(T('adminBkConfirmTitle'))}</h3>`;
      h += `<div class="bk-scroll"><table class="bk-tbl"><thead><tr><th>${esc(T('adminBkColTable'))}</th><th class="bk-n">${esc(T('adminBkColRows'))}</th></tr></thead><tbody>`;
      for (const t of tb) h += `<tr><td>${esc(t.s === 'public' ? t.n : t.s + '.' + t.n)}</td><td class="bk-n">${num(t.rows || 0)}</td></tr>`;
      h += `</tbody><tfoot><tr><td>${esc(T('adminBkColTotal'))}</td><td class="bk-n">${num(filas)}</td></tr></tfoot></table></div>`;
      h += `<p class="bk-p">${esc(T('adminBkConfirmSum', { tables: tb.length, rows: num(filas), size: tam(bytes) }))}</p>`;
      h += `<p class="bk-p bk-muted">${esc(T('adminBkConfirmEgress'))}</p>`;
      if (S.auth) h += `<p class="bk-p bk-warn">${esc(T('adminBkPrivacy'))}</p>`;
      if (pl.unsupported && pl.unsupported.length) h += `<p class="bk-p bk-warn">${esc(T('adminBkUnsupported', { list: pl.unsupported.join(', ') }))}</p>`;
      h += `<div class="bk-actions"><button class="btn btn-primary bk-go" data-bk="empezar">${esc(T('adminBkStart'))}</button><button class="btn" data-bk="volver">${esc(T('cancel'))}</button></div>`;
    } else if (f === 'ejecutando') {
      h += `<p class="bk-p"><b>${esc(T('adminBkRunning'))}</b></p>`;
      h += `<div class="bk-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bk-bar-fill" id="bkFill"></div></div>`;
      h += `<p class="bk-p bk-pct" id="bkPct">0 %</p><p class="bk-p" id="bkL1"></p><p class="bk-p bk-muted" id="bkL2"></p><p class="bk-p bk-muted" id="bkL3"></p>`;
      h += `<div class="bk-actions"><button class="btn" data-bk="cancelar">${esc(T('cancel'))}</button></div>`;
    } else if (f === 'hecho') {
      const r = S.res;
      h += `<p class="bk-p bk-ok"><b>${esc(r.verif && r.verif.ok ? T('adminBkDone') : T('adminBkDoneUnchecked'))}</b></p>`;
      h += `<p class="bk-p">${esc(T('adminBkDoneInfo', { file: r.nombre, size: tam(r.bytesGz), tables: r.tablas, rows: num(r.filas) }))}</p>`;
      h += `<p class="bk-p bk-muted">${esc(r.guardadoEn === 'archivo' ? T('adminBkSavedFile') : T('adminBkSavedDownloads'))}</p>`;
      if (r.verif && !r.verif.ok) h += `<p class="bk-p bk-warn">${esc(T('adminBkVerifyBad', { why: r.verif.problemas.slice(0, 3).join('; ') }))}</p>`;
      if (r.cambios && r.cambios.length) h += `<p class="bk-p bk-muted">${esc(T('adminBkDrift', { list: r.cambios.map(c => c.tabla).join(', ') }))}</p>`;
      h += `<p class="bk-p bk-muted">${esc(T('adminBkHow'))}</p>`;
      h += `<div class="bk-actions"><button class="btn btn-primary" data-bk="volver">${esc(T('adminBkClose'))}</button></div>`;
    } else if (f === 'error') {
      h += `<p class="bk-p bk-warn"><b>${esc(explicar(S.err))}</b></p>`;
      h += `<div class="bk-actions"><button class="btn btn-primary" data-bk="preparar">${esc(T('adminBkRetry'))}</button><button class="btn" data-bk="volver">${esc(T('adminBkClose'))}</button></div>`;
    }
    h += '</div>';
    p.innerHTML = h;
    if (f === 'ejecutando') actualizarProgreso(true);
  }

  function verifHtml() {
    const v = S.verif;
    if (S.verifBusy) return `<p class="bk-p bk-muted">${esc(T('adminBkVerifying'))} ${esc(S.verifName)}</p>`;
    if (!v) return '';
    let h = `<p class="bk-p ${v.ok ? 'bk-ok' : 'bk-warn'}"><b>${esc(v.ok ? T('adminBkVOk') : T('adminBkVBad'))}</b> <span class="bk-muted">${esc(S.verifName)}</span></p>`;
    if (v.manifiesto) h += `<p class="bk-p bk-muted">${esc(T('adminBkVMade', { when: fechaLarga(v.manifiesto.created), ver: v.manifiesto.appVersion || '?' }))}${v.manifiesto.plan && v.manifiesto.plan.auth === false ? ' · ' + esc(T('adminBkVNoAccounts')) : ''}</p>`;
    if (v.problemas.length) h += `<ul class="bk-list bk-warn">${v.problemas.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (v.tablas.length) {
      h += `<div class="bk-scroll"><table class="bk-tbl"><thead><tr><th>${esc(T('adminBkColTable'))}</th><th class="bk-n">${esc(T('adminBkColRows'))}</th></tr></thead><tbody>`;
      for (const t of v.tablas) h += `<tr><td>${esc(t.s === 'public' ? t.n : t.clave)}</td><td class="bk-n">${num(t.hay)}</td></tr>`;
      h += `</tbody><tfoot><tr><td>${esc(T('adminBkColTotal'))}</td><td class="bk-n">${num(v.filas)}</td></tr></tfoot></table></div>`;
    }
    return h;
  }

  let _ult = 0;
  function actualizarProgreso(fuerza) {
    const p = S.panel;
    if (!p || S.fase !== 'ejecutando') return;
    const ahora = Date.now();
    if (!fuerza && ahora - _ult < 120) return;
    _ult = ahora;
    const g = S.prog || {};
    const set = (id, txt) => { const el = p.querySelector('#' + id); if (el && el.textContent !== txt) el.textContent = txt; };
    const pct = Math.max(0, Math.min(100, Math.round((g.fraccion || 0) * 100)));
    const fill = p.querySelector('#bkFill'); if (fill) fill.style.width = pct + '%';
    const bar = p.querySelector('.bk-bar'); if (bar) bar.setAttribute('aria-valuenow', String(pct));
    set('bkPct', pct + ' %');
    if (g.fase === 'plan' || g.fase === 'estructura') { set('bkL1', T('adminBkStep_schema')); set('bkL2', ''); set('bkL3', ''); return; }
    if (g.fase === 'cierre') { set('bkL1', T('adminBkFinishing')); return; }
    if (g.fase === 'reintento' && g.reintento) { set('bkL3', T('adminBkRetrying', { i: g.reintento.i, n: g.reintento.de })); return; }
    if (g.tabla) {
      set('bkL1', T('adminBkProgTable', { i: g.tablaIdx, n: g.tablas, name: g.tabla.replace(/^public\./, '') }));
      set('bkL2', T('adminBkProgRows', { done: num(g.filasTabla), total: num(g.filasTablaTotal) }));
      set('bkL3', T('adminBkProgTotal', { mb: mb(g.bytes), time: tiempo(Date.now() - S.t0) }));
    }
  }

  function alCambiar(e) {
    const t = e.target;
    if (t && t.id === 'bkAuth') S.auth = !!t.checked;
    if (t && t.id === 'bkFile' && t.files && t.files[0]) comprobarArchivo(t.files[0]);
  }
  function alPulsar(e) {
    const b = e.target.closest && e.target.closest('[data-bk]');
    if (!b || b.disabled) return;
    const a = b.dataset.bk;
    if (a === 'preparar') preparar();
    else if (a === 'empezar') empezar();      // ¡sin await antes de showSaveFilePicker! (necesita el gesto del usuario)
    else if (a === 'cancelar') { if (S.ctrl) S.ctrl.abort(); }
    else if (a === 'volver') { S.fase = 'reposo'; S.err = null; pintar(); }
  }

  const rpcApp = (op, arg, o) => SupabaseClient.adminBackupRpc(op, arg, o);

  async function preparar() {
    const chk = S.panel && S.panel.querySelector('#bkAuth');
    if (chk) S.auth = !!chk.checked;
    S.fase = 'preparando'; S.err = null; pintar();
    try {
      S.plan = await obtenerPlan(rpcApp, { auth: S.auth });
      S.planAt = Date.now();
      S.fase = 'confirmar';
    } catch (e) { S.err = e; S.fase = 'error'; }
    pintar();
  }

  async function pedirArchivo(nombre) {
    if (typeof window.showSaveFilePicker !== 'function') return null;
    try {
      return await window.showSaveFilePicker({ suggestedName: nombre, types: [{ description: T('adminBkPickerDesc'), accept: { 'application/gzip': ['.gz'] } }] });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new BkError('aborted', 'Cancelado');   // el usuario cerró el selector: vuelve a la pantalla anterior
      return null;                                                                      // otro motivo: descarga normal por el navegador
    }
  }

  function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 600000);
  }

  const _antesDeSalir = (e) => { e.preventDefault(); e.returnValue = ''; };

  async function empezar() {
    if (S.fase !== 'confirmar' || S.lanzando) return;
    S.lanzando = true;                                 // un segundo clic mientras está abierto el selector no abre otro
    const nombre = nombreArchivo();
    let handle = null;
    try { handle = await pedirArchivo(nombre); }       // primera y única espera antes de seguir: el selector exige el gesto del usuario
    catch (e) { S.lanzando = false; return; }          // canceló el selector: se queda en la pantalla de confirmación
    S.lanzando = false;
    S.fase = 'ejecutando'; S.prog = { fraccion: 0, fase: 'plan' }; S.t0 = Date.now(); S.ctrl = new AbortController();
    pintar();
    let wake = null, sink = null;
    window.addEventListener('beforeunload', _antesDeSalir);
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (_) {}
    try {
      let destino = null;
      if (handle) {
        try { destino = await handle.createWritable(); } catch (e) { throw new BkError('save', e.message || String(e)); }
      }
      sink = await crearSink(destino);
      // el plan que se enseñó en la confirmación se reutiliza solo si es reciente (< 10 min); si la pantalla se quedó abierta mucho rato, se vuelve a pedir
      const r = await exportar({
        rpc: rpcApp, sink, plan: (Date.now() - (S.planAt || 0) < 600000 ? S.plan : null), auth: S.auth, signal: S.ctrl.signal, appVersion: (document.querySelector('.app-version') || {}).textContent || '',
        onProgress: (g) => { S.prog = Object.assign({}, S.prog, g); actualizarProgreso(); },
      });
      S.prog = Object.assign({}, S.prog, { fase: 'verificando', fraccion: 1 });
      let archivo = r.blob;
      if (handle) { try { archivo = await handle.getFile(); } catch (_) { archivo = null; } }
      else descargarBlob(r.blob, nombre);
      let verif = null;
      if (archivo) { try { verif = await verificar(archivo); } catch (e) { verif = { ok: false, problemas: [String((e && e.message) || e)], tablas: [] }; } }
      S.res = { nombre, bytesGz: r.bytesGz, filas: r.filas, tablas: r.tablas, cambios: r.cambios, verif, guardadoEn: handle ? 'archivo' : 'descargas' };
      guardarUltima({ at: new Date().toISOString(), bytes: r.bytesGz, rows: r.filas, tables: r.tablas, name: nombre });
      S.fase = 'hecho';
    } catch (e) {
      try { if (sink) await sink.abort(e); } catch (_) {}
      if (e && e.code === 'aborted') { S.fase = 'confirmar'; S.err = null; if (typeof showToast === 'function') showToast(T('adminBkAborted'), 3500); }
      else { S.err = e; S.fase = 'error'; console.error('[copia]', e); }
    } finally {
      window.removeEventListener('beforeunload', _antesDeSalir);
      try { if (wake) await wake.release(); } catch (_) {}
      S.ctrl = null;
    }
    pintar();
  }

  async function comprobarArchivo(file) {
    S.verifBusy = true; S.verif = null; S.verifName = file.name;
    const out = S.panel && S.panel.querySelector('#bkVerif'); if (out) out.innerHTML = verifHtml();
    try { S.verif = await verificar(file); }
    catch (e) { S.verif = { ok: false, problemas: [String((e && e.message) || e)], tablas: [], filas: 0 }; }
    S.verifBusy = false;
    const out2 = S.panel && S.panel.querySelector('#bkVerif'); if (out2) out2.innerHTML = verifHtml();
  }

  return { render, engine: { exportar, verificar, obtenerPlan, crearSink, ordenar, nombreArchivo, BkError }, _state: S };
})();
if (typeof window !== 'undefined') window.AdminBackup = AdminBackup;
