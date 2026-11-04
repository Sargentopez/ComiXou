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
   admin-r2.js — Pestaña «R2» del panel de administración (v42.45; v42.49: escritura activada de serie + cortacircuitos)

   Solo la cuenta «admin» ve esta pestaña. Sirve para tres cosas, todas sobre las capas pesadas guardadas en R2 por contenido
   (ver «CAPAS PESADAS EN R2, POR CONTENIDO» y «CORTACIRCUITOS» en js/supabase-client.js; las rutas /blobs viven en el Worker
   comxow-storage-worker de Cloudflare):
     · PROBAR el Worker real de extremo a extremo (subir, comprobar, leer idéntico, repetir, rechazar un hash que no cuadra);
     · GOBERNAR la escritura en R2 de ESTE dispositivo: desde la v42.49 va ACTIVADA DE SERIE en todos los dispositivos (leer capas guardadas
       así funciona siempre). Aquí se puede apagar a mano en este dispositivo y se ve el estado del cortacircuitos (pausa automática de unos
       minutos cuando R2 falla varias veces seguidas), con un botón para reanudar la escritura sin esperar;
     · VER qué hizo el último guardado (cuántas capas a R2, cuántas ya estaban, cuántas volvieron a la base).
   La herramienta que movió a R2 las capas que ya estaban dentro de Supabase (v42.48) se quitó de la app en la v42.49 y está guardada en
   archivo/migracion-r2-v42-48/ para futuras migraciones.
   ============================================================ */
const AdminR2 = (() => {
  'use strict';
  const T = (k, v) => (typeof I18n !== 'undefined' ? I18n.t(k, v) : k);
  const esc = (s) => (typeof escHtml === 'function' ? escHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const lang = () => (typeof I18n !== 'undefined' && I18n.getLang ? I18n.getLang() : 'es');
  const hora = (ms) => { try { return new Date(ms).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (_) { return String(ms); } };
  const tiempo = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); };
  const S = { panel: null, busy: false, res: null, copied: false, tm: 0 };
  const xr = () => (typeof SupabaseClient !== 'undefined' && SupabaseClient.xr) ? SupabaseClient.xr : null;

  // Restos de las herramientas de la v42.45-48 en el almacenamiento de este navegador (la prueba obligatoria y el manifiesto de la migración): ya no se usan.
  function limpiarRestos() { try { localStorage.removeItem('cx_xr_ok'); localStorage.removeItem('cx_xr_mig'); } catch (_) {} }

  function pintar() {
    const p = S.panel;
    if (!p || !p.isConnected) return;
    clearTimeout(S.tm);
    const x = xr();
    if (!x) { p.innerHTML = `<div class="bk"><p class="bk-p bk-warn">R2: SupabaseClient.xr no disponible</p></div>`; return; }
    const st = x.state(), on = st.switchOn;
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
    // 2 · Escritura en R2 desde este dispositivo (interruptor) y cortacircuitos
    h += `<hr class="bk-hr"><h3 class="bk-sub">${esc(T('adminR2SwitchH'))}</h3>`;
    h += `<label class="bk-chk"><input type="checkbox" id="r2On" ${on ? 'checked' : ''}> <span>${esc(T('adminR2Switch', { kb: Math.round(x.min / 1024) }))}</span></label>`;
    h += `<p class="bk-p bk-muted bk-hint">${esc(on ? T('adminR2SwitchOn') : T('adminR2SwitchOff'))}</p>`;
    if (on) {
      if (st.open) {
        h += `<p class="bk-p bk-warn" id="r2Brk"><b>${esc(T(st.kind === 'hard' ? 'adminR2BrkOpenHard' : 'adminR2BrkOpenSoft', { time: hora(st.until), left: tiempo(st.until - Date.now()), why: st.why || '—' }))}</b></p>`;
        h += `<div class="bk-actions"><button class="btn" data-r2="reanudar">${esc(T('adminR2BrkResume'))}</button></div>`;
        S.tm = setTimeout(pintar, Math.max(1000, st.until - Date.now() + 500));   // al acabar la pausa, la pantalla se pone al día sola
      } else if (st.fails > 0) {
        h += `<p class="bk-p bk-muted" id="r2Brk">${esc(T('adminR2BrkWarn', { n: st.fails, why: st.why || '—' }))}</p>`;
      } else {
        h += `<p class="bk-p bk-muted" id="r2Brk">${esc(T('adminR2BrkClosed'))}${st.opened ? ' ' + esc(T('adminR2BrkOpened', { n: st.opened })) : ''}</p>`;
      }
    }
    // 3 · Último guardado
    h += `<hr class="bk-hr"><h3 class="bk-sub">${esc(T('adminR2LastH'))}</h3>`;
    const ls = (typeof window !== 'undefined') ? window._sbLastSave : null, lx = ls && ls.xr;
    if (lx) {
      h += `<p class="bk-p">${esc(T('adminR2Last', { on: lx.on ? T('adminR2On') : T('adminR2Off'), n: lx.n, put: lx.put, have: lx.have, mb: (lx.putKB / 1024).toFixed(1), fail: lx.fail }))}</p>`;
      if (lx.errs && lx.errs.length) h += `<ul class="bk-list bk-warn">${lx.errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
    } else h += `<p class="bk-p bk-muted">${esc(T('adminR2NoLast'))}</p>`;
    h += '</div>';
    p.innerHTML = h;
  }

  async function probar() {
    const x = xr(); if (!x || S.busy) return;
    S.busy = true; S.res = null; S.copied = false; pintar();
    try { S.res = await x.selfTest(); }          // una prueba correcta también cierra el cortacircuitos (lo hace selfTest)
    catch (e) { S.res = { ok: false, ms: 0, lines: ['✗ ' + String((e && e.message) || e)] }; }
    S.busy = false;
    pintar();
  }
  async function copiarTexto(txt) {
    let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(txt); ok = true; } } catch (_) {}
    if (!ok) { try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (_) {} }
    return !!ok;
  }
  async function copiar() { S.copied = await copiarTexto(S.res ? S.res.lines.join('\n') : ''); pintar(); }

  function alPulsar(e) {
    const b = e.target.closest && e.target.closest('[data-r2]');
    if (!b || b.disabled) return;
    const a = b.dataset.r2;
    if (a === 'probar') probar();
    else if (a === 'copiar') copiar();
    else if (a === 'reanudar') { const x = xr(); if (x) { x.breakerReset(); pintar(); } }
  }
  function alCambiar(e) {
    const t = e.target;
    if (t && t.id === 'r2On') { const x = xr(); if (x) x.setWrite(!!t.checked); pintar(); }
  }
  function render(panel) {
    S.panel = panel;
    limpiarRestos();
    panel.onclick = alPulsar;
    panel.onchange = alCambiar;
    pintar();
  }
  return { render, _state: S };
})();
if (typeof window !== 'undefined') window.AdminR2 = AdminR2;
