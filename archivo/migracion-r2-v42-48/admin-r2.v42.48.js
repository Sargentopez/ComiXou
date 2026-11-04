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
   admin-r2.js — Pestaña «R2» del panel de administración (v42.45; apartado 4 en la v42.48)

   Solo la cuenta «admin» ve esta pestaña. Sirve para cuatro cosas, todas sobre las capas pesadas guardadas en R2 por contenido
   (ver «CAPAS PESADAS EN R2, POR CONTENIDO» en js/supabase-client.js; las rutas /blobs viven en el Worker comxow-storage-worker de Cloudflare):
     · PROBAR el Worker real de extremo a extremo (subir, comprobar, leer idéntico, repetir, rechazar un hash que no cuadra);
     · ACTIVAR / DESACTIVAR, en ESTE dispositivo, que al guardar en la nube las capas pesadas vayan a R2 (apagado de serie; no se
       puede activar sin una prueba correcta; leer capas guardadas así funciona siempre, con o sin el interruptor);
     · VER qué hizo el último guardado (cuántas capas a R2, cuántas ya estaban, cuántas volvieron a la base);
     · MOVER a R2 las capas pesadas que ya estaban dentro de Supabase (v42.48; SupabaseClient.xr.migScan / migRun / migVerify y las funciones
       SQL admin_xr_scan y admin_xr_swap de sql/v42_48_*). «Simulacro» no cambia nada en la base; «Real» exige la prueba de R2 y dos
       confirmaciones, y se puede empezar por unas pocas capas. Después, «Comprobar» verifica que cada referencia tiene su archivo en R2.
   ============================================================ */
const AdminR2 = (() => {
  'use strict';
  const OK_KEY = 'cx_xr_ok';   // ISO de la última prueba correcta en este dispositivo (comodidad por navegador)
  const T = (k, v) => (typeof I18n !== 'undefined' ? I18n.t(k, v) : k);
  const esc = (s) => (typeof escHtml === 'function' ? escHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const lang = () => (typeof I18n !== 'undefined' && I18n.getLang ? I18n.getLang() : 'es');
  const fecha = (iso) => { try { return new Date(iso).toLocaleString(lang(), { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return String(iso); } };
  const num = (n) => { try { return new Intl.NumberFormat(lang()).format(n); } catch (_) { return String(n); } };
  const mb = (b) => { try { return new Intl.NumberFormat(lang(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(b / 1048576); } catch (_) { return (b / 1048576).toFixed(1); } };
  const tiempo = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); };
  const S = {
    panel: null, busy: false, res: null, copied: false,
    // Apartado 4. fase: reposo · buscando · listo · ejecutando · hecho · error
    mig: { fase: 'reposo', scan: null, err: null, mode: 'sim', max: '', c1: false, c2: false, ctrl: null, parando: false, prog: null, rep: null, t0: 0, copied: false,
           deep: false, ver: null, verBusy: null, verCtrl: null },
  };
  const xr = () => (typeof SupabaseClient !== 'undefined' && SupabaseClient.xr) ? SupabaseClient.xr : null;

  const okAt = () => { try { return localStorage.getItem(OK_KEY) || ''; } catch (_) { return ''; } };
  const setOk = (v) => { try { if (v) localStorage.setItem(OK_KEY, v); else localStorage.removeItem(OK_KEY); } catch (_) {} };

  // ───────────── apartado 4: mover a R2 lo que ya está en Supabase ─────────────
  function explicar(e) {
    const c = e && e.code, m = (e && e.message) || String(e);
    if (c === 'quota' || c === 'auth' || c === 'forbidden' || c === 'missing') return T('adminR2MErr_' + c);
    if (c === 'network' || c === 'timeout') return T('adminR2MErr_net');
    return T('adminR2MErr_other', { msg: m });
  }
  function resumenScan(rows) {
    const aut = new Map(), works = new Set();
    let bytes = 0;
    rows.forEach(r => {
      bytes += r.bytes; works.add(r.work);
      const k = r.author || '—';
      let a = aut.get(k);
      if (!a) aut.set(k, a = { n: 0, bytes: 0, works: new Set() });
      a.n++; a.bytes += r.bytes; a.works.add(r.work);
    });
    return { n: rows.length, bytes, works: works.size,
      aut: Array.from(aut.entries()).map(([name, a]) => ({ name, n: a.n, bytes: a.bytes, works: a.works.size })).sort((p, q) => q.bytes - p.bytes) };
  }
  // Las capas que se van a mover ahora: las más pesadas primero (el scan ya las trae ordenadas), tantas como diga el campo (vacío = todas).
  function planItems() {
    const M = S.mig, rows = (M.scan && M.scan.rows) || [], n = parseInt(M.max, 10);
    return n > 0 ? rows.slice(0, n) : rows;
  }
  const suma = (rows) => rows.reduce((a, r) => a + (r.bytes || 0), 0);
  function textoInforme(r) {
    const sk = r.skipped || {};
    const head = T('adminR2MRep', {
      mode: r.mode === 'real' ? T('adminR2MModeRealShort') : T('adminR2MModeSimShort'), when: fecha(r.startedAt),
      done: num(r.done), total: num(r.total), mb: mb(r.bytesDone), swapped: num(r.swapped), smb: mb(r.swappedKB * 1024), ready: num(r.ready),
      put: num(r.putN), pmb: mb(r.putKB * 1024), have: num(r.haveN), man: num(r.fromManifest), rmb: mb(r.readKB * 1024),
      already: num(sk.already || 0), gone: num(sk.gone || 0), changed: num(sk.changed || 0), small: num(sk.small || 0), empty: num(sk.empty || 0),
      failed: num(r.failed), time: tiempo(r.ms),
    });
    return head + (r.errs && r.errs.length ? '\n' + r.errs.map(e => '  · ' + e).join('\n') : '');
  }

  function verifHtml() {
    const M = S.mig, x = xr();
    let h = `<hr class="bk-hr"><h4 class="bk-sub">${esc(T('adminR2MVerH'))}</h4><p class="bk-p bk-muted">${esc(T('adminR2MVerHelp'))}</p>`;
    h += `<label class="bk-chk"><input type="checkbox" id="r2mDeep" ${M.deep ? 'checked' : ''} ${M.verBusy ? 'disabled' : ''}> <span>${esc(T('adminR2MVerDeep'))}</span></label>`;
    h += `<div class="bk-actions"><button class="btn" data-r2="verificar" ${(M.verBusy || !x) ? 'disabled' : ''}>${esc(T('adminR2MVerGo'))}</button></div>`;
    if (M.verBusy) h += `<p class="bk-p bk-muted" id="r2mVerBusy">${esc(T('adminR2MVerBusy', { done: num(M.verBusy.done || 0), total: num(M.verBusy.total || 0) }))}</p>`;
    const v = M.ver;
    if (v && v.error) h += `<p class="bk-p bk-warn"><b>${esc(explicar(v.error))}</b></p>`;
    else if (v) {
      if (v.ok) {
        const deep = v.deep ? T('adminR2MVerDeepNote', { mb: mb(v.checkedKB * 1024) }) : '';
        h += `<p class="bk-p bk-ok"><b>${esc(T('adminR2MVerOk', { rows: num(v.rows), blobs: num(v.blobs), deep, inl: num(v.inlineN), mb: mb(v.inlineKB * 1024) }))}</b></p>`;
      } else {
        h += `<p class="bk-p bk-warn"><b>${esc(T('adminR2MVerBad', { miss: num(v.missing.length), bad: num(v.bad.length), mal: num(v.malformed.length) }))}</b></p>`;
        const li = [];
        v.missing.slice(0, 8).forEach(i => li.push('missing ' + i.sha + '… · ' + (i.title || '?') + ' · ' + i.bytes + ' B'));
        v.bad.slice(0, 8).forEach(i => li.push('bad ' + i.sha + '… · ' + (i.title || '?') + ' · ' + i.why));
        v.malformed.slice(0, 8).forEach(i => li.push('malformed ' + i.id + ' · ' + i.ref));
        if (li.length) h += `<ul class="bk-list bk-warn">${li.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
      }
    }
    return h;
  }

  function pintarMig(x) {
    const M = S.mig, ok = !!okAt(), f = M.fase;
    let h = `<hr class="bk-hr"><h3 class="bk-sub">${esc(T('adminR2MH'))}</h3>`;
    h += `<p class="bk-p bk-muted">${esc(T('adminR2MHelp', { kb: Math.round(x.min / 1024) }))}</p>`;
    h += `<p class="bk-p ${ok ? 'bk-ok' : 'bk-warn'}">${esc(ok ? T('adminR2MReqOk') : T('adminR2MReqNo'))}</p>`;
    if (f === 'reposo' || f === 'buscando' || f === 'error') {
      if (f === 'error') h += `<p class="bk-p bk-warn"><b>${esc(explicar(M.err))}</b></p>`;
      h += `<div class="bk-actions"><button class="btn btn-primary bk-go" data-r2="buscar" ${f === 'buscando' ? 'disabled' : ''}>${esc(f === 'buscando' ? T('adminR2MSearching') : T('adminR2MSearch'))}</button></div>`;
    } else if (f === 'listo') {
      const sc = M.scan, rs = resumenScan(sc.rows), pend = x.migInfo();
      if (!sc.rows.length) {
        h += `<p class="bk-p bk-ok"><b>${esc(T('adminR2MNone', { refs: num(sc.refs) }))}</b></p>`;
      } else {
        h += `<p class="bk-p"><b>${esc(T('adminR2MFound', { n: num(rs.n), mb: mb(rs.bytes), works: num(rs.works), refs: num(sc.refs) }))}</b></p>`;
        h += `<div class="bk-scroll"><table class="bk-tbl"><thead><tr><th>${esc(T('adminR2MColAuthor'))}</th><th class="bk-n">${esc(T('adminR2MColLayers'))}</th><th class="bk-n">${esc(T('adminR2MColWorks'))}</th><th class="bk-n">${esc(T('adminR2MColMb'))}</th></tr></thead><tbody>`;
        rs.aut.forEach(a => { h += `<tr><td>${esc(a.name)}</td><td class="bk-n">${num(a.n)}</td><td class="bk-n">${num(a.works)}</td><td class="bk-n">${mb(a.bytes)}</td></tr>`; });
        h += `</tbody><tfoot><tr><td>${esc(T('adminR2MColTotal'))}</td><td class="bk-n">${num(rs.n)}</td><td class="bk-n">${num(rs.works)}</td><td class="bk-n">${mb(rs.bytes)}</td></tr></tfoot></table></div>`;
        if (pend.n) h += `<p class="bk-p bk-muted">${esc(T('adminR2MPending', { n: num(pend.n), mb: mb(pend.kb * 1024) }))} <button class="btn" data-r2="olvidar">${esc(T('adminR2MForget'))}</button></p>`;
        h += `<h4 class="bk-sub">${esc(T('adminR2MModeH'))}</h4>`;
        h += `<label class="bk-chk"><input type="radio" name="r2mMode" value="sim" ${M.mode === 'sim' ? 'checked' : ''}> <span>${esc(T('adminR2MModeSim'))}</span></label>`;
        h += `<label class="bk-chk"><input type="radio" name="r2mMode" value="real" ${M.mode === 'real' ? 'checked' : ''}> <span>${esc(T('adminR2MModeReal'))}</span></label>`;
        h += `<p class="bk-p" style="margin-top:10px"><label for="r2mMax">${esc(T('adminR2MCount'))}</label> <input type="number" id="r2mMax" min="1" max="${rs.n}" inputmode="numeric" value="${esc(M.max)}" placeholder="${rs.n}" style="width:6em"></p>`;
        const pl = planItems();
        h += `<p class="bk-p bk-muted" id="r2mPlan">${esc(T('adminR2MPlan', { n: num(pl.length), mb: mb(suma(pl)) }))}</p>`;
        if (M.mode === 'real') {
          h += `<label class="bk-chk"><input type="checkbox" id="r2mC1" ${M.c1 ? 'checked' : ''}> <span>${esc(T('adminR2MC1'))}</span></label>`;
          h += `<label class="bk-chk"><input type="checkbox" id="r2mC2" ${M.c2 ? 'checked' : ''}> <span>${esc(T('adminR2MC2'))}</span></label>`;
        }
        const puede = ok && pl.length > 0 && (M.mode !== 'real' || (M.c1 && M.c2));
        h += `<div class="bk-actions"><button class="btn btn-primary bk-go" data-r2="empezar" ${puede ? '' : 'disabled'}>${esc(M.mode === 'real' ? T('adminR2MGoReal') : T('adminR2MGoSim'))}</button><button class="btn" data-r2="buscar">${esc(T('adminR2MAgain'))}</button></div>`;
      }
      if (!sc.rows.length) h += `<div class="bk-actions"><button class="btn" data-r2="buscar">${esc(T('adminR2MAgain'))}</button></div>`;
      h += verifHtml();
    } else if (f === 'ejecutando') {
      h += `<p class="bk-p"><b id="r2mTitle">${esc(M.parando ? T('adminR2MStopping') : T('adminR2MRunning'))}</b></p>`;
      h += `<div class="bk-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bk-bar-fill" id="r2mFill"></div></div>`;
      h += `<p class="bk-p bk-pct" id="r2mPct">0 %</p><p class="bk-p" id="r2mL1"></p><p class="bk-p bk-muted" id="r2mL2"></p><p class="bk-p bk-muted" id="r2mL3"></p><p class="bk-p bk-muted" id="r2mCur"></p>`;
      h += `<div class="bk-actions"><button class="btn" data-r2="parar" ${M.parando ? 'disabled' : ''}>${esc(T('adminR2MStop'))}</button></div>`;
    } else if (f === 'hecho') {
      const r = M.rep, real = r.mode === 'real';
      h += `<p class="bk-p ${r.stoppedBy ? 'bk-warn' : 'bk-ok'}"><b>${esc(r.stoppedBy ? T('adminR2MStopped') : (real ? T('adminR2MDoneReal') : T('adminR2MDoneSim')))}</b></p>`;
      if (r.stoppedBy) h += `<p class="bk-p bk-warn">${esc(T('adminR2MStop_' + r.stoppedBy))}</p>`;
      h += `<pre class="bk-p" id="r2mOut" style="white-space:pre-wrap;word-break:break-word;font-size:.78rem">${esc(textoInforme(r))}</pre>`;
      h += `<div class="bk-actions"><button class="btn" data-r2="copiarmig">${esc(M.copied ? T('adminR2Copied') : T('adminR2MCopy'))}</button><button class="btn btn-primary" data-r2="buscar">${esc(T('adminR2MAgain'))}</button></div>`;
      h += verifHtml();
    }
    return h;
  }

  let _ult = 0;
  function actualizarProgreso(fuerza) {
    const p = S.panel, M = S.mig;
    if (!p || !p.isConnected || M.fase !== 'ejecutando') return;
    const ahora = Date.now();
    if (!fuerza && ahora - _ult < 150) return;
    _ult = ahora;
    const g = M.prog;
    if (!g) return;
    const set = (id, txt) => { const el = p.querySelector('#' + id); if (el && el.textContent !== txt) el.textContent = txt; };
    const frac = g.bytesTotal > 0 ? Math.min(1, g.bytesDone / g.bytesTotal) : (g.total ? Math.min(1, g.done / g.total) : 0);
    const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    const fill = p.querySelector('#r2mFill'); if (fill) fill.style.width = pct + '%';
    const bar = p.querySelector('.bk-bar'); if (bar) bar.setAttribute('aria-valuenow', String(pct));
    set('r2mPct', pct + ' %');
    const el = Date.now() - M.t0, sk = g.skipped || {};
    const saltadas = (sk.already || 0) + (sk.gone || 0) + (sk.changed || 0) + (sk.small || 0) + (sk.empty || 0);
    set('r2mL1', T('adminR2MProg1', { done: num(g.done), total: num(g.total), mb: mb(g.bytesDone), mbt: mb(g.bytesTotal) }));
    set('r2mL2', T('adminR2MProg2', { put: num(g.putN), pmb: mb(g.putKB * 1024), have: num(g.haveN), man: num(g.fromManifest), swapped: num(g.swapped) }));
    set('r2mL3', T('adminR2MProg3', { time: tiempo(el), eta: g.bytesDone > 0 ? tiempo(el * (g.bytesTotal - g.bytesDone) / g.bytesDone) : '…', skipped: num(saltadas), failed: num(g.failed) }));
    const cur = g.cur && g.cur[0];
    set('r2mCur', cur ? T('adminR2MCur', { name: (cur.title || '?') + ' · ' + mb(cur.bytes) + ' MB' }) : '');
  }

  function pintar() {
    const p = S.panel;
    if (!p || !p.isConnected) return;
    const x = xr();
    if (!x) { p.innerHTML = `<div class="bk"><p class="bk-p bk-warn">R2: SupabaseClient.xr no disponible</p></div>`; return; }
    const on = x.writeOn(), ok = okAt();
    let h = `<div class="bk"><h2 class="bk-title">${esc(T('adminR2Title'))}</h2>`;
    h += `<p class="bk-p">${esc(T('adminR2Intro'))}</p>`;
    // 1 · Prueba
    h += `<h3 class="bk-sub">${esc(T('adminR2TestH'))}</h3><p class="bk-p bk-muted">${esc(T('adminR2TestHelp'))}</p>`;
    h += `<div class="bk-actions"><button class="btn btn-primary bk-go" data-r2="probar" ${S.busy ? 'disabled' : ''}>${esc(S.busy ? T('adminR2Testing') : T('adminR2Test'))}</button></div>`;
    if (S.res) {
      h += `<p class="bk-p ${S.res.ok ? 'bk-ok' : 'bk-warn'}"><b>${esc(S.res.ok ? T('adminR2TestOk', { ms: S.res.ms }) : T('adminR2TestBad'))}</b></p>`;
      h += `<pre class="bk-p" id="r2Out" style="white-space:pre-wrap;word-break:break-word;font-size:.78rem">${esc(S.res.lines.join('\n'))}</pre>`;
      h += `<div class="bk-actions"><button class="btn" data-r2="copiar">${esc(S.copied ? T('adminR2Copied') : T('adminR2Copy'))}</button></div>`;
    }
    h += `<p class="bk-p bk-muted">${esc(ok ? T('adminR2OkAt', { when: fecha(ok) }) : T('adminR2NeverOk'))}</p>`;
    // 2 · Interruptor (de este dispositivo)
    h += `<hr class="bk-hr"><h3 class="bk-sub">${esc(T('adminR2SwitchH'))}</h3>`;
    h += `<label class="bk-chk"><input type="checkbox" id="r2On" ${on ? 'checked' : ''} ${(!ok && !on) ? 'disabled' : ''}> <span>${esc(T('adminR2Switch', { kb: Math.round(x.min / 1024) }))}</span></label>`;
    h += `<p class="bk-p bk-muted bk-hint">${esc(on ? T('adminR2SwitchOn') : (ok ? T('adminR2SwitchOff') : T('adminR2SwitchNeedsTest')))}</p>`;
    // 3 · Último guardado
    h += `<hr class="bk-hr"><h3 class="bk-sub">${esc(T('adminR2LastH'))}</h3>`;
    const ls = (typeof window !== 'undefined') ? window._sbLastSave : null, lx = ls && ls.xr;
    if (lx) {
      h += `<p class="bk-p">${esc(T('adminR2Last', { on: lx.on ? T('adminR2On') : T('adminR2Off'), n: lx.n, put: lx.put, have: lx.have, mb: (lx.putKB / 1024).toFixed(1), fail: lx.fail }))}</p>`;
      if (lx.errs && lx.errs.length) h += `<ul class="bk-list bk-warn">${lx.errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
    } else h += `<p class="bk-p bk-muted">${esc(T('adminR2NoLast'))}</p>`;
    // 4 · Mover a R2 lo que ya está en Supabase
    h += pintarMig(x);
    h += '</div>';
    p.innerHTML = h;
    if (S.mig.fase === 'ejecutando') actualizarProgreso(true);
  }

  async function probar() {
    const x = xr(); if (!x || S.busy) return;
    S.busy = true; S.res = null; S.copied = false; pintar();
    try { S.res = await x.selfTest(); }
    catch (e) { S.res = { ok: false, ms: 0, lines: ['✗ ' + String((e && e.message) || e)] }; }
    S.busy = false;
    if (S.res.ok) setOk(new Date().toISOString());
    else { setOk(''); x.setWrite(false); }   // una prueba fallida apaga el interruptor: no se guarda en R2 con un Worker que no pasa la prueba
    pintar();
  }
  async function copiarTexto(txt) {
    let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(txt); ok = true; } } catch (_) {}
    if (!ok) { try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (_) {} }
    return !!ok;
  }
  async function copiar() { S.copied = await copiarTexto(S.res ? S.res.lines.join('\n') : ''); pintar(); }

  // Apartado 4 — acciones
  async function buscar() {
    const M = S.mig, x = xr();
    if (!x || M.fase === 'buscando' || M.fase === 'ejecutando') return;
    M.fase = 'buscando'; M.err = null; M.rep = null; M.ver = null; M.copied = false; M.max = ''; pintar();      // cada búsqueda parte de «todas»: el límite de una prueba anterior no se arrastra
    try {
      const sc = await x.migScan({ min: x.min, ref: true });
      M.scan = { rows: sc.rows.filter(r => !r.ref), refs: sc.rows.filter(r => r.ref).length, ms: sc.ms, at: new Date().toISOString() };
      M.fase = 'listo';
    } catch (e) { M.err = e; M.fase = 'error'; }
    pintar();
  }
  const _antesDeSalir = (e) => { e.preventDefault(); e.returnValue = ''; };
  async function empezar() {
    const M = S.mig, x = xr();
    if (!x || M.fase !== 'listo' || !okAt()) return;
    const items = planItems(), real = M.mode === 'real';
    if (!items.length || (real && !(M.c1 && M.c2))) return;
    M.fase = 'ejecutando'; M.parando = false; M.ctrl = new AbortController(); M.prog = null; M.rep = null; M.ver = null; M.copied = false; M.t0 = Date.now();
    pintar();
    let wake = null;
    window.addEventListener('beforeunload', _antesDeSalir);
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (_) {}
    try {
      M.rep = await x.migRun({ items, mode: real ? 'real' : 'sim', confirm: real, signal: M.ctrl.signal, onProgress: (g) => { M.prog = g; actualizarProgreso(); } });
      M.fase = 'hecho';
    } catch (e) { M.err = e; M.fase = 'error'; console.error('[R2 mover]', e); }
    finally {
      window.removeEventListener('beforeunload', _antesDeSalir);
      try { if (wake) await wake.release(); } catch (_) {}
      M.ctrl = null; M.parando = false;
    }
    if (M.fase === 'hecho' && real) M.c1 = M.c2 = false;     // cada ejecución real vuelve a pedir las dos confirmaciones
    pintar();
  }
  function parar() {
    const M = S.mig;
    if (M.ctrl) { M.parando = true; M.ctrl.abort(); }
    const p = S.panel;
    if (p) { const t = p.querySelector('#r2mTitle'); if (t) t.textContent = T('adminR2MStopping'); const b = p.querySelector('[data-r2="parar"]'); if (b) b.disabled = true; }
  }
  async function verificar() {
    const M = S.mig, x = xr();
    if (!x || M.verBusy) return;
    M.verBusy = { done: 0, total: 0 }; M.ver = null; M.verCtrl = new AbortController(); pintar();
    try {
      M.ver = await x.migVerify({ deep: M.deep, signal: M.verCtrl.signal, onProgress: (g) => {
        M.verBusy = g;
        const el = S.panel && S.panel.querySelector('#r2mVerBusy');
        if (el) el.textContent = T('adminR2MVerBusy', { done: num(g.done || 0), total: num(g.total || 0) });
      } });
    } catch (e) { M.ver = { error: e }; }
    M.verBusy = null; M.verCtrl = null;
    pintar();
  }

  function alPulsar(e) {
    const b = e.target.closest && e.target.closest('[data-r2]');
    if (!b || b.disabled) return;
    const a = b.dataset.r2;
    if (a === 'probar') probar();
    else if (a === 'copiar') copiar();
    else if (a === 'buscar') buscar();
    else if (a === 'empezar') empezar();
    else if (a === 'parar') parar();
    else if (a === 'verificar') verificar();
    else if (a === 'olvidar') { const x = xr(); if (x) { x.migClear(); pintar(); } }
    else if (a === 'copiarmig') { const M = S.mig; copiarTexto(M.rep ? textoInforme(M.rep) : '').then(ok => { M.copied = ok; pintar(); }); }
  }
  function alCambiar(e) {
    const t = e.target, M = S.mig;
    if (!t) return;
    if (t.id === 'r2On') { const x = xr(); if (x) x.setWrite(!!t.checked); pintar(); }
    else if (t.name === 'r2mMode') { M.mode = t.value === 'real' ? 'real' : 'sim'; if (M.mode !== 'real') M.c1 = M.c2 = false; pintar(); }
    else if (t.id === 'r2mC1') { M.c1 = !!t.checked; pintar(); }
    else if (t.id === 'r2mC2') { M.c2 = !!t.checked; pintar(); }
    else if (t.id === 'r2mDeep') { M.deep = !!t.checked; }
    else if (t.id === 'r2mMax') { M.max = String(t.value || '').replace(/[^0-9]/g, ''); }   // sin repintar: el «change» llega al hacer clic en «Empezar» y repintar justo entonces se llevaría el clic
  }
  function alEscribir(e) {
    const t = e.target, M = S.mig;
    if (t && t.id === 'r2mMax') {                       // sin repintar (se perdería el foco): solo el texto «Se procesarán N capas»
      M.max = String(t.value || '').replace(/[^0-9]/g, '');
      const el = S.panel && S.panel.querySelector('#r2mPlan'), pl = planItems();
      if (el) el.textContent = T('adminR2MPlan', { n: num(pl.length), mb: mb(suma(pl)) });
      const go = S.panel && S.panel.querySelector('[data-r2="empezar"]');
      if (go) go.disabled = !(okAt() && pl.length > 0 && (M.mode !== 'real' || (M.c1 && M.c2)));
    }
  }
  function render(panel) {
    S.panel = panel;
    panel.onclick = alPulsar;
    panel.onchange = alCambiar;
    panel.oninput = alEscribir;
    pintar();
  }
  return { render, _state: S };
})();
if (typeof window !== 'undefined') window.AdminR2 = AdminR2;
