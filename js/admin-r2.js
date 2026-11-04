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
   admin-r2.js — Pestaña «R2» del panel de administración (v42.45)

   Solo la cuenta «admin» ve esta pestaña. Sirve para tres cosas, todas sobre las capas pesadas guardadas en R2 por contenido
   (ver «CAPAS PESADAS EN R2, POR CONTENIDO» en js/supabase-client.js y worker/blobs-worker.js):
     · PROBAR el Worker real de extremo a extremo (subir, comprobar, leer idéntico, repetir, rechazar un hash que no cuadra);
     · ACTIVAR / DESACTIVAR, en ESTE dispositivo, que al guardar en la nube las capas pesadas vayan a R2 (apagado de serie; no se
       puede activar sin una prueba correcta; leer capas guardadas así funciona siempre, con o sin el interruptor);
     · VER qué hizo el último guardado (cuántas capas a R2, cuántas ya estaban, cuántas volvieron a la base).
   ============================================================ */
const AdminR2 = (() => {
  'use strict';
  const OK_KEY = 'cx_xr_ok';   // ISO de la última prueba correcta en este dispositivo (comodidad por navegador)
  const T = (k, v) => (typeof I18n !== 'undefined' ? I18n.t(k, v) : k);
  const esc = (s) => (typeof escHtml === 'function' ? escHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const lang = () => (typeof I18n !== 'undefined' && I18n.getLang ? I18n.getLang() : 'es');
  const fecha = (iso) => { try { return new Date(iso).toLocaleString(lang(), { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return String(iso); } };
  const S = { panel: null, busy: false, res: null, copied: false };
  const xr = () => (typeof SupabaseClient !== 'undefined' && SupabaseClient.xr) ? SupabaseClient.xr : null;

  const okAt = () => { try { return localStorage.getItem(OK_KEY) || ''; } catch (_) { return ''; } };
  const setOk = (v) => { try { if (v) localStorage.setItem(OK_KEY, v); else localStorage.removeItem(OK_KEY); } catch (_) {} };

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
    h += '</div>';
    p.innerHTML = h;
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
  async function copiar() {
    const txt = S.res ? S.res.lines.join('\n') : '';
    let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(txt); ok = true; } } catch (_) {}
    if (!ok) { try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (_) {} }
    S.copied = !!ok; pintar();
  }
  function alPulsar(e) {
    const b = e.target.closest && e.target.closest('[data-r2]');
    if (!b || b.disabled) return;
    if (b.dataset.r2 === 'probar') probar();
    else if (b.dataset.r2 === 'copiar') copiar();
  }
  function alCambiar(e) {
    const t = e.target;
    if (t && t.id === 'r2On') { const x = xr(); if (x) x.setWrite(!!t.checked); pintar(); }
  }
  function render(panel) {
    S.panel = panel;
    panel.onclick = alPulsar;
    panel.onchange = alCambiar;
    pintar();
  }
  return { render };
})();
if (typeof window !== 'undefined') window.AdminR2 = AdminR2;
