/* ARCHIVADO (v42.49) — NO se carga en la app. Bloque literal de js/supabase-client.js v42.48: «MOVER A R2 LAS CAPAS PESADAS QUE YA ESTÁN EN SUPABASE».
 *
 * Para reutilizarlo en otra migración (p. ej. mover a R2 otro tipo de contenido grande o repetir esta tras un restauro):
 *   1. Pegarlo dentro de la IIFE de SupabaseClient, justo después de xrSelfTest() y antes de _buildLayerRow().
 *   2. Exportarlo en el objeto `xr` del return final:
 *        migScan: xrMigScan, migRun: xrMigRun, migVerify: xrMigVerify, migInfo: _xrmInfo, migClear: _xrmClear
 *   3. Restaurar la interfaz (admin-r2.v42.48.js, apartado 4) y las claves de texto (i18n.adminR2M.js).
 *   4. Instalar las funciones SQL (sql/v42_48_r2_migracion_1_instalar.sql): admin_xr_scan y admin_xr_swap.
 * Depende de (siguen en supabase-client.js): _xrEnsure, _xrUrl, _XR_RE, _XR_MIN, _sha256HexBytes, _lySleep, _xrBackoff, _hdrsUser, BASE, KEY,
 * EgressLedger, _sbDlWatched/_sbDlChunks. La corrección de _layerDelta (huella alternativa del puntero r2:) NO está aquí: sigue en la app.
 * Ver LEEME.md de esta carpeta.
 */
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // MOVER A R2 LAS CAPAS PESADAS QUE YA ESTÁN EN SUPABASE (v42.48) — herramienta de la cuenta «admin» (pestaña «R2»)
  //
  // Hasta la v42.47 solo iban a R2 las capas que se GUARDABAN con el interruptor activado; las que ya estaban dentro de la base seguían
  // gastando egress en cada lectura (el 92 % del peso de la base son 468 capas de ≥ 32 KB). Esta herramienta las mueve una a una:
  //   1. SCAN: la función SQL admin_xr_scan (solo lee) da la lista de capas de ≥ 32 KB con su tamaño real en bytes;
  //   2. por cada capa: se baja su texto de Supabase (el único viaje de megas de toda la migración), se comprueba que pesa lo que decía
  //      la lista (si no, la capa cambió desde entonces y se salta), se calcula su SHA-256 y se sube a R2 (_xrEnsure: HEAD → PUT; el
  //      Worker y R2 verifican el hash al guardar, un contenido que no cuadre es rechazado);
  //   3. SWAP (solo en modo «Real»): admin_xr_swap(id, huella). La propia base comprueba que el texto que tiene AHORA tiene esa huella
  //      y, en una transacción, lo cambia por la referencia «r2:<huella>:<bytes>» (restaurando panels.nav, que un disparador borra).
  // Seguridad: el archivo está en R2 (verificado por hash) ANTES de que la base cambie, y la base se niega a cambiar una capa que ya no
  // es la que se subió. Se puede parar y repetir cuando se quiera: lo ya hecho se salta solo. «Simulacro» hace 1 y 2 y NO toca la base;
  // apunta lo subido en un manifiesto local (cx_xr_mig), de modo que el modo Real que le sigue no vuelve a bajar nada de Supabase:
  // comprueba que el archivo sigue en R2 y llama a admin_xr_swap (el manifiesto es solo un atajo: lo que manda es la comprobación de la base).
  // Comprobación final (xrMigVerify): cada referencia de la base tiene su archivo en R2 (y, «a fondo», con el contenido y el hash exactos).
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  const _XRM_KEY = 'cx_xr_mig';            // localStorage: lo ya subido a R2 y pendiente de sustituir en la base
  const _XRM_MIN = 32 * 1024;              // bytes: la misma frontera que el guardado (_XR_MIN)
  const _XRM_TTL = 14 * 86400000;          // una entrada del manifiesto caduca a las 2 semanas
  let _xrmMan = null;
  const _xrmErr = (code, msg) => Object.assign(new Error(msg || code), { code });
  function _xrmManifest() {
    if (_xrmMan) return _xrmMan;
    let m = null;
    try { m = JSON.parse(localStorage.getItem(_XRM_KEY) || 'null'); } catch (_) {}
    if (!m || m.v !== 1 || !m.items || typeof m.items !== 'object') m = { v: 1, items: {} };
    const now = Date.now();
    Object.keys(m.items).forEach(k => { const e = m.items[k]; if (!e || !/^[0-9a-f]{64}$/.test(e.s) || !(e.b > 0) || now - (e.t || 0) > _XRM_TTL) delete m.items[k]; });
    return (_xrmMan = m);
  }
  function _xrmSave() { try { localStorage.setItem(_XRM_KEY, JSON.stringify(_xrmManifest())); } catch (_) {} }
  function _xrmClear() { _xrmMan = { v: 1, items: {} }; try { localStorage.removeItem(_XRM_KEY); } catch (_) {} }
  function _xrmInfo() { const it = _xrmManifest().items; let kb = 0, n = 0; Object.keys(it).forEach(k => { n++; kb += Math.round(it[k].b / 1024); }); return { n, kb }; }

  // Llama a una función SQL del administrador (POST /rpc/<fn>). Errores con `.code`: quota (402) · auth (401, tras renovar el token una vez)
  // · forbidden (403: no es la cuenta «admin») · missing (404: falta ejecutar el SQL) · server / network / timeout (se reintentan con
  // espera creciente) · aborted (cancelado a mano) · bad (otro 4xx). `query` = limit/offset/order que PostgREST aplica al resultado.
  async function _xrRpc(fn, args, opts) {
    opts = opts || {};
    const sig = opts.signal, tries = opts.tries || 3;
    let refreshed = false;
    for (let n = 1; ; n++) {
      if (sig && sig.aborted) throw _xrmErr('aborted', 'cancelado');
      try {
        await _ensureFreshToken();
        const ctrl = new AbortController();
        let vencio = false;
        const timer = setTimeout(() => { vencio = true; ctrl.abort(); }, opts.timeoutMs || 60000);
        const alCancelar = () => ctrl.abort();
        if (sig) sig.addEventListener('abort', alCancelar, { once: true });
        let res, txt;
        try {
          res = await fetch(`${BASE}/rpc/${fn}${opts.query ? '?' + opts.query : ''}`, { method: 'POST', headers: _hdrsUser(), body: JSON.stringify(args || {}), signal: ctrl.signal, cache: 'no-store' });
          txt = await _sbResText(res);
        } catch (e) {
          if (sig && sig.aborted) throw _xrmErr('aborted', 'cancelado');
          throw _xrmErr(vencio ? 'timeout' : 'network', (e && e.message) || 'sin conexión');
        } finally { clearTimeout(timer); if (sig) sig.removeEventListener('abort', alCancelar); }
        if (res.ok) { try { return JSON.parse(txt); } catch (_) { throw Object.assign(_xrmErr('bad', 'respuesta no válida'), { status: res.status }); } }
        let msg = '';
        try { const j = JSON.parse(txt); msg = (j && (j.message || j.hint)) || ''; } catch (_) { msg = String(txt || '').slice(0, 200); }
        const st = res.status, mk = (c) => Object.assign(_xrmErr(c, msg || ('HTTP ' + st)), { status: st });
        if (st === 402) throw mk('quota');
        if (st === 401) throw mk('auth');
        if (st === 403) throw mk('forbidden');
        if (st === 404) throw mk('missing');
        if (st === 408 || st === 429 || st >= 500) throw mk('server');
        throw mk('bad');
      } catch (e) {
        const c = e && e.code;
        if (c === 'auth' && !refreshed && !(sig && sig.aborted)) {
          refreshed = true; n--;
          if (window._authTryRefresh) { try { await window._authTryRefresh(); } catch (_) {} }
          continue;
        }
        if ((c === 'server' || c === 'network' || c === 'timeout') && n < tries) { await _lySleep(_xrBackoff(n)); continue; }
        throw e;
      }
    }
  }

  // SCAN: lista (solo lectura) de las capas de ≥ min bytes que siguen en Supabase y, con ref = true, también las que ya son una referencia
  // a R2. Va por páginas de 500 (PostgREST corta cada respuesta en max-rows). Devuelve { rows:[{id, panel, work, po, lo, type, bytes, ref,
  // title, author, pub}], min, ref, ms }, de mayor a menor peso.
  async function xrMigScan(opts) {
    opts = opts || {};
    const min = Math.max(1024, Math.floor(opts.min || _XRM_MIN)), ref = !!opts.ref, t0 = performance.now();
    const PAGE = 500, rows = [], seen = new Set();
    for (let off = 0; off < 50000; off += PAGE) {
      const part = await _xrRpc('admin_xr_scan', { p_min: min, p_ref: ref }, { signal: opts.signal, query: `limit=${PAGE}&offset=${off}` });
      if (!Array.isArray(part)) throw _xrmErr('bad', 'respuesta no válida');
      for (const r of part) {
        if (!r || !r.r_layer || seen.has(r.r_layer)) continue;
        seen.add(r.r_layer);
        rows.push({ id: r.r_layer, panel: r.r_panel, work: r.r_work, po: r.r_panel_order, lo: r.r_layer_order, type: r.r_type, bytes: Number(r.r_bytes) || 0,
          ref: r.r_ref || null, title: r.r_title || '', author: r.r_author || '', pub: !!r.r_published });
      }
      if (part.length < PAGE) break;
    }
    return { rows, min, ref, ms: Math.round(performance.now() - t0) };
  }

  // Baja el texto de UNA capa de Supabase. Propio, no _get: _get corta a los 8 s y aquí una capa puede pesar varios MB.
  // Devuelve { text } · { gone: true } (la capa ya no existe) · { empty: true } (sin texto).
  async function _xrmGetLayer(id, bytes, sig) {
    const url = `${BASE}/panel_layers?id=eq.${encodeURIComponent(id)}&select=layer_data`;
    const ms = 30000 + Math.round(bytes / 1048576) * 8000;
    let last = null, refreshed = false;
    for (let n = 1; n <= _XR_TRIES; n++) {
      if (sig && sig.aborted) throw _xrmErr('aborted', 'cancelado');
      if (n > 1) await _lySleep(_xrBackoff(n - 1));
      await _ensureFreshToken();
      const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), ms), stop = () => ctrl.abort();
      if (sig) sig.addEventListener('abort', stop, { once: true });
      try {
        const res = await fetch(url, { headers: _hdrsUser(), signal: ctrl.signal, cache: 'no-store' });
        const txt = await _sbResText(res);
        if (res.status === 401 && !refreshed) {
          refreshed = true; n--;
          if (window._authTryRefresh) { try { await window._authTryRefresh(); } catch (_) {} }
          continue;
        }
        if (res.status === 402) throw _xrmErr('quota', 'egress superado');
        if (res.status === 401 || res.status === 403) throw _xrmErr('auth', 'HTTP ' + res.status);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const arr = JSON.parse(txt);
        if (!Array.isArray(arr)) throw new Error('respuesta no válida');
        if (!arr.length) return { gone: true };
        const t = arr[0] && arr[0].layer_data;
        return typeof t === 'string' ? { text: t } : { empty: true };
      } catch (e) {
        if (sig && sig.aborted) throw _xrmErr('aborted', 'cancelado');
        if (e && (e.code === 'quota' || e.code === 'auth')) throw e;
        last = e;
      } finally { clearTimeout(tm); if (sig) sig.removeEventListener('abort', stop); }
    }
    throw last || new Error('sin respuesta');
  }
  // ¿Está el archivo en R2? true / false (404 confirmado dos veces, o sin respuesta clara: en ese caso se vuelve a bajar y subir, más lento pero nunca inseguro).
  async function _xrmHeadOk(sha, sig) {
    if (_xrKnown.has(sha)) return true;
    for (let n = 1; n <= 3; n++) {
      if (sig && sig.aborted) throw _xrmErr('aborted', 'cancelado');
      try {
        const r = await _xrFetch('HEAD blob', _xrUrl(sha), { method: 'HEAD', cache: 'no-store' }, 0, 20000);
        if (r.status === 200) { _xrKnown.add(sha); return true; }
        if (r.status === 404 && n >= 2) return false;
      } catch (_) {}
      await _lySleep(_xrBackoff(n));
    }
    return false;
  }

  // Mueve a R2 las capas de `opts.items` (filas de xrMigScan). opts: { mode:'sim'|'real', confirm:true (obligatorio en 'real'), signal,
  // par (1-3, por defecto 2), onProgress(estado) }. Devuelve el informe: { mode, total, done, swapped, ready, putN, putKB, haveN, fromManifest,
  // readKB, skipped:{already,gone,changed,small,empty}, failed, failedIds, errs, stoppedBy, ms }. `stoppedBy`: null (terminó) · cancel ·
  // forbidden · missing · quota · auth · fails (5 errores seguidos). Una capa con error NO se toca: se puede repetir y se salta lo hecho.
  async function xrMigRun(opts) {
    opts = opts || {};
    const items = Array.isArray(opts.items) ? opts.items.slice() : [];
    const real = opts.mode === 'real';
    if (real && opts.confirm !== true) throw _xrmErr('bad', 'modo real sin confirmar');
    if (!_shaCapable()) throw _xrmErr('bad', 'este navegador no puede calcular hashes (hace falta https)');
    const sig = opts.signal, par = Math.max(1, Math.min(3, opts.par || 2));
    const prog = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
    const man = _xrmManifest();
    const st = {
      mode: real ? 'real' : 'sim', startedAt: new Date().toISOString(), endedAt: null, ms: 0, total: items.length,
      bytesTotal: items.reduce((n, it) => n + (it.bytes || 0), 0), done: 0, bytesDone: 0,
      swapped: 0, swappedKB: 0, ready: 0, fromManifest: 0, putN: 0, putKB: 0, haveN: 0, readKB: 0,
      skipped: { already: 0, gone: 0, changed: 0, small: 0, empty: 0 }, failed: 0, failedIds: [], errs: [], stoppedBy: null, cur: [],
    };
    const t0 = performance.now();
    let idx = 0, consecutive = 0, lastSave = 0;
    const stop = (code) => { if (!st.stoppedBy) st.stoppedBy = code; };
    const note = (m) => { if (st.errs.length < 12) st.errs.push(String(m).slice(0, 220)); };
    const tick = () => { st.ms = Math.round(performance.now() - t0); try { prog(st); } catch (_) {} };

    async function one(it) {
      let sha = null;
      const e = man.items[it.id];
      if (e && e.b === it.bytes) {                                   // ya subida y comprobada antes (simulacro o ejecución cortada)
        if (await _xrmHeadOk(e.s, sig)) { sha = e.s; st.fromManifest++; }
        else delete man.items[it.id];
      }
      if (!sha) {
        const g = await _xrmGetLayer(it.id, it.bytes, sig);
        if (g.gone) return 'gone';
        if (g.empty) return 'empty';
        const text = g.text;
        if (_xrIsRef(text)) return 'already';
        const u8 = new TextEncoder().encode(text);
        st.readKB += Math.round(u8.length / 1024);
        if (u8.length !== it.bytes) return 'changed';                // no es la capa que vio el scan: se salta (se vuelve a buscar y listo)
        sha = await _sha256HexBytes(u8);
        if (!sha) throw _xrmErr('bad', 'no se pudo calcular el hash');
        const how = await _xrEnsure(sha, text);                      // 'known' | 'have' | 'put'; lanza si R2 no lo acepta
        if (how === 'put') { st.putN++; st.putKB += Math.round(u8.length / 1024); } else st.haveN++;
        man.items[it.id] = { s: sha, b: it.bytes, t: Date.now() };
      }
      if (!real) return 'ready';
      const r = await _xrRpc('admin_xr_swap', { p_id: it.id, p_sha: sha }, { signal: sig });
      delete man.items[it.id];
      if (r === 'ok' || r === 'already' || r === 'gone' || r === 'changed' || r === 'small' || r === 'empty') return r;
      throw new Error('respuesta inesperada de admin_xr_swap: ' + String(r).slice(0, 40));
    }
    async function worker() {
      for (;;) {
        if (sig && sig.aborted) { stop('cancel'); return; }          // parado a mano entre dos capas: se anota (si no, el informe parecería un final normal)
        if (st.stoppedBy) return;
        const it = items[idx++];
        if (!it) return;
        st.cur.push(it); tick();
        let counted = true;
        try {
          const r = await one(it);
          consecutive = 0;
          if (r === 'ok') { st.swapped++; st.swappedKB += Math.round(it.bytes / 1024); }
          else if (r === 'ready') st.ready++;
          else st.skipped[r] = (st.skipped[r] || 0) + 1;
        } catch (e) {
          const c = e && e.code, m = String((e && e.message) || e);
          if (c === 'aborted') { stop('cancel'); counted = false; }
          else if (c === 'forbidden' || c === 'missing' || c === 'quota' || c === 'auth') { stop(c); note(m); counted = false; }
          else {
            st.failed++; st.failedIds.push(it.id);
            note((it.title || '?') + ' · ' + it.type + '@' + it.lo + ' (' + Math.round(it.bytes / 1024) + ' KB): ' + m);
            if (++consecutive >= 5) stop('fails');
          }
        } finally {
          st.cur = st.cur.filter(x => x !== it);
          if (counted) { st.done++; st.bytesDone += it.bytes || 0; }
          const now = performance.now();
          if (now - lastSave > 1500) { lastSave = now; _xrmSave(); }
          tick();
        }
      }
    }
    try { await Promise.all(Array.from({ length: Math.min(par, items.length) }, worker)); }
    finally { _xrmSave(); st.endedAt = new Date().toISOString(); tick(); }
    return st;
  }

  // COMPROBACIÓN: vuelve a leer la base (xrMigScan con ref = true) y mira que CADA referencia tenga su archivo en R2. Rápida: un HEAD por
  // archivo distinto. «A fondo» (deep): baja cada archivo y comprueba su tamaño y que su SHA-256 es su nombre (R2 no cobra la salida).
  // Devuelve { ok, aborted, deep, rows, blobs, found, missing:[], bad:[], malformed:[], checkedKB, inlineN, inlineKB, ms }.
  async function xrMigVerify(opts) {
    opts = opts || {};
    const sig = opts.signal, deep = !!opts.deep, prog = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
    const t0 = performance.now();
    const sc = await xrMigScan({ min: _XRM_MIN, ref: true, signal: sig });
    const blobs = new Map(), res = { ok: false, aborted: false, deep, rows: 0, blobs: 0, found: 0, missing: [], bad: [], malformed: [], checkedKB: 0, inlineN: 0, inlineKB: 0, ms: 0 };
    sc.rows.forEach(r => {
      const m = r.ref ? _XR_RE.exec(r.ref) : null;
      if (m) {
        res.rows++;
        const o = blobs.get(m[1]);
        if (o) o.rows++; else blobs.set(m[1], { sha: m[1], bytes: +m[2], rows: 1, title: r.title, author: r.author });
      } else if (r.ref) res.malformed.push({ id: r.id, ref: String(r.ref).slice(0, 80), title: r.title });
      else { res.inlineN++; res.inlineKB += Math.round(r.bytes / 1024); }
    });
    const list = Array.from(blobs.values());
    res.blobs = list.length;
    let i = 0, done = 0;
    async function w() {
      for (;;) {
        if (sig && sig.aborted) return;
        const b = list[i++];
        if (!b) return;
        const url = _xrUrl(b.sha);
        let status = 0, why = '';
        for (let n = 1; n <= 3; n++) {
          if (sig && sig.aborted) return;
          why = '';
          try {
            const r = await fetch(url, deep ? { cache: 'no-store' } : { method: 'HEAD', cache: 'no-store' });
            status = r.status;
            if (status === 200 && deep) {
              const u8 = new Uint8Array(await r.arrayBuffer());
              res.checkedKB += Math.round(u8.length / 1024);
              EgressLedger.note(url, u8.length, 'app');
              if (u8.length !== b.bytes) why = 'tamaño ' + u8.length + ' en lugar de ' + b.bytes;
              else if ((await _sha256HexBytes(u8)) !== b.sha) why = 'el contenido no corresponde a su hash';
            }
            if (status === 200 || (status === 404 && n >= 2)) break;
          } catch (e) { status = 0; why = String((e && e.message) || e); }
          await _lySleep(_xrBackoff(n));
        }
        const info = { sha: b.sha.slice(0, 12), bytes: b.bytes, rows: b.rows, title: b.title, author: b.author };
        if (status === 200 && !why) res.found++;
        else if (status === 404) res.missing.push(info);
        else res.bad.push(Object.assign(info, { why: why || ('HTTP ' + status) }));
        done++; try { prog({ done, total: list.length }); } catch (_) {}
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, list.length) }, w));
    res.aborted = !!(sig && sig.aborted);
    res.ok = !res.aborted && !res.missing.length && !res.bad.length && !res.malformed.length && res.found === res.blobs;
    res.ms = Math.round(performance.now() - t0);
    return res;
  }
