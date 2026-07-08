/* Comxow/COMXOW, creada por A. Gavina Costero  2026, albertobicho@gmail.com */
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
 */
/* ============================================================
   editor-textdoc.js — "Editor de textos" (menú Escribir ▾)

   Editor de texto enriquecido (negrita, cursiva, tachado, títulos,
   citas, listas) implementado sobre Trix, embebido en un shell a
   pantalla completa con el mismo diseño que edShell/gcpShell pero
   con cabecera violeta.

   Al pulsar "Aplicar al lienzo": el HTML de Trix se convierte en
   bloques (_tdParseBlocks), se maqueta con ajuste de línea y se
   pagina respetando márgenes (_tdLayoutPages) contra el tamaño real
   de la hoja actual (edPageW/edPageH), y cada página resultante se
   inserta como una nueva hoja de la obra con una única TextLayer a
   toda página (richLines) — al final de la obra.

   El resultado (richLines) lo dibuja TextLayer._drawRichLines() en
   editor.js, y su equivalente _drawRichTextLines() en reader/reader.js
   (implementación paralela, ver NORMAS del proyecto).
   ============================================================ */

// ── Constantes de maquetación (unidades lógicas del lienzo, iguales a
//    las que ya usa TextLayer.fontSize en el resto del editor) ──
const TD_MARGIN_FRAC   = 0.045;  // margen de página al APLICAR al lienzo (fracción del tamaño real de la hoja)
const TD_BODY_SIZE     = 22;     // cuerpo de texto al APLICAR al lienzo
const TD_H1_SIZE        = 34;     // título (heading1) al APLICAR al lienzo

// ── A4 del editor (solo para escribir/navegar) ──────────────────────────────
// La paginación que se ve mientras se escribe es independiente de la hoja del
// cómic: sirve solo para moverse por el editor con un formato de página
// habitual (A4). Al "Aplicar al lienzo" se vuelve a maquetar desde cero
// contra el tamaño real de la hoja actual (edPageW/edPageH) — ver
// _tdApplyToCanvas, que NO usa estas constantes.
const TD_A4_W = 794, TD_A4_H = 1123; // A4 a 96dpi — medida estándar en diseño web
const TD_A4_MARGIN_FRAC = 0.09;
const TD_A4_BODY_SIZE = 17, TD_A4_H1_SIZE = 27; // a juego con el CSS de .td-editor (1.05rem/1.55em)
const TD_LINE_MULT     = 1.42;   // interlineado
const TD_PARA_GAP_MULT = 0.55;   // espacio extra tras cada bloque (× fontSize del bloque)
const TD_LIST_INDENT   = 30;     // sangría de listas
const TD_QUOTE_INDENT  = 24;     // sangría de citas (por nivel de anidamiento)
const TD_FONT_FAMILY   = 'Lora'; // serif autoalojada — pensada para lectura en página completa

// ── Apertura / cierre del shell ──────────────────────────────────
let _tdFlowSeq = 0;
function _tdNewFlowId(){ return 'tdflow_' + Date.now().toString(36) + '_' + (_tdFlowSeq++); }
// Flujo que se está reeditando (null = "Aplicar" crea un texto nuevo al final;
// con valor = "Aplicar" sustituye in situ las hojas de ese flujo — ver _tdApplyToCanvas)
let _tdEditingFlowId = null;

function edOpenTextDoc(editLayer){
  if(typeof edCloseMenus === 'function') edCloseMenus();
  const shell = document.getElementById('tdShell');
  if(!shell) return;
  _tdInitOnce();
  const wasOpen = shell.style.display !== 'none' && shell.style.display !== '';
  shell.style.display = 'flex';
  // Botón/gesto atrás (PC y Android): cerrar el shell en vez de salir del editor.
  // Empuja una entrada de historial solo si no estaba ya abierto (evita duplicar
  // entradas si se reabre en modo edición sobre el mismo shell ya visible).
  if(!wasOpen) history.pushState({ tdShellOpen: true }, '', location.href);
  _tdRegisterBackInterceptor();
  requestAnimationFrame(_tdUpdateTitlePill);
  const editorEl = document.getElementById('tdEditor');
  const applyBtn = document.getElementById('tdApplyBtn');
  const lhSel = document.getElementById('tdLineHeightSel');
  if(editLayer && editLayer.richLines && editLayer.sourceHTML){
    // Reeditar un texto ya aplicado: cargar su HTML de origen y recordar su flowId
    // para que "Aplicar" sustituya estas hojas en vez de añadir otras nuevas.
    // Capas de v32.70 (sin _tdFlowId): adoptar uno ahora, como flujo de una sola hoja.
    _tdEditingFlowId = _tdEnsureFlowId(editLayer);
    if(editorEl && editorEl.editor) editorEl.editor.loadHTML(editLayer.sourceHTML);
    if(applyBtn) applyBtn.textContent = 'Guardar cambios';
    if(lhSel) lhSel.value = String(editLayer.lineHeightMult || TD_LINE_MULT);
  } else {
    _tdEditingFlowId = null;
    if(applyBtn) applyBtn.textContent = 'Aplicar al lienzo';
    if(lhSel) lhSel.value = String(TD_LINE_MULT);
    // Siempre en blanco al abrir desde el menú — no se restaura nada de
    // sesiones anteriores (el único texto editable es el que ya está
    // aplicado al lienzo, y a ese solo se llega con doble tap sobre él).
    if(editorEl && editorEl.editor) editorEl.editor.loadHTML('');
  }
  requestAnimationFrame(() => requestAnimationFrame(_tdRecomputeViewPagination));
}
function _tdEnsureFlowId(layer){
  if(!layer._tdFlowId) layer._tdFlowId = _tdNewFlowId();
  return layer._tdFlowId;
}
// Localiza cualquier capa de un flujo dado (todas comparten sourceHTML/
// lineHeightMult/marginXFrac) — usada para recuperar sus ajustes actuales
// sin depender de qué hoja concreta se esté editando/reajustando.
function _tdFindFlowLayer(flowId){
  for(let i = 0; i < edPages.length; i++){
    const l = (edPages[i].layers || []).find(l => l && l._tdFlowId === flowId);
    if(l) return l;
  }
  return null;
}
function edCloseTextDoc(fromPopstate){
  const shell = document.getElementById('tdShell');
  const wasOpen = !!shell && shell.style.display !== 'none' && shell.style.display !== '';
  if(shell) shell.style.display = 'none';
  _tdEditingFlowId = null;
  const applyBtn = document.getElementById('tdApplyBtn');
  if(applyBtn) applyBtn.textContent = 'Aplicar al lienzo';
  // Si se cierra por la X o por "Aplicar" (no por el botón atrás), hay que
  // consumir la entrada de historial añadida al abrir — si no, el siguiente
  // "atrás" del usuario se quedaría "vacío" (solo cerraría un shell ya cerrado).
  if(wasOpen && !fromPopstate && history.state && history.state.tdShellOpen){
    history.back();
  }
}
// Registra (una sola vez) el interceptor del botón/gesto atrás para este shell.
// Ver window._edBackInterceptors en router.js.
let _tdBackInterceptorRegistered = false;
function _tdRegisterBackInterceptor(){
  if(_tdBackInterceptorRegistered) return;
  _tdBackInterceptorRegistered = true;
  window._edBackInterceptors = window._edBackInterceptors || [];
  window._edBackInterceptors.push(() => {
    const shell = document.getElementById('tdShell');
    if(shell && shell.style.display !== 'none' && shell.style.display !== ''){
      edCloseTextDoc(true); // true: ya se consumió la entrada de historial vía popstate
      return true;
    }
    return false;
  });
}

// ── Inicialización (una sola vez): botones, bloqueo de adjuntos ──
function _tdInitOnce(){
  const shell = document.getElementById('tdShell');
  if(!shell || shell._tdBound) return;
  shell._tdBound = true;

  document.getElementById('tdCloseBtn')?.addEventListener('click', edCloseTextDoc);
  document.getElementById('tdApplyBtn')?.addEventListener('click', _tdApplyToCanvas);
  const editorEl = document.getElementById('tdEditor');

  // Esta hoja es solo texto — las imágenes ya tienen su propio flujo en el editor,
  // así que no se permiten adjuntos arrastrados/pegados dentro de Trix.
  document.addEventListener('trix-file-accept', e => e.preventDefault());

  // Pegar texto de fuera (Word, una web, otra app) puede traer tamaños de letra
  // enormes o tipos de letra que no están autoalojados aquí — sin esto, ese
  // texto no se ajustaría a la página igual que el escrito a mano en el editor.
  if(editorEl){
    editorEl.addEventListener('trix-before-paste', e => {
      if(e.paste && typeof e.paste.html === 'string'){
        e.paste.html = _tdSanitizePastedHTML(e.paste.html);
      }
    });
  }

  if(editorEl){
    editorEl.addEventListener('trix-change', () => {
      // Paginación en vivo: recalcular con retardo (evita rehacer el cálculo
      // en cada pulsación) y seguir la página donde está escribiendo el cursor.
      clearTimeout(_tdRecomputeTimer);
      _tdRecomputeTimer = setTimeout(() => {
        _tdRecomputeViewPagination();
        _tdFollowCursorPage();
      }, 250);
    });
    editorEl.addEventListener('trix-selection-change', () => {
      clearTimeout(_tdFollowTimer);
      _tdFollowTimer = setTimeout(_tdFollowCursorPage, 120);
    });
    // Si el usuario desliza a mano por la hoja, mantener el número de
    // página de la cabecera sincronizado con lo que se ve.
    document.getElementById('tdPageArea')?.addEventListener('scroll', () => {
      clearTimeout(_tdScrollSyncTimer);
      _tdScrollSyncTimer = setTimeout(() => {
        const area = document.getElementById('tdPageArea');
        if(!area) return;
        const top = area.scrollTop;
        let page = 0;
        for(let i = 0; i < _tdViewPageScrollTops.length; i++){ if(top + 2 >= _tdViewPageScrollTops[i]) page = i; }
        if(page !== _tdViewCurPage){ _tdViewCurPage = page; _tdUpdateViewPageNav(); }
      }, 100);
    }, {passive:true});
  }
  document.getElementById('tdPagePrev')?.addEventListener('click', () => _tdScrollToViewPage(_tdViewCurPage - 1));
  document.getElementById('tdPageNext')?.addEventListener('click', () => _tdScrollToViewPage(_tdViewCurPage + 1));
  _tdWireFontControls();
}
let _tdFollowTimer = null, _tdScrollSyncTimer = null;

// Tamaños/fuentes admitidos al pegar contenido externo — mismo rango que los
// controles del editor (ver tdFontSizeSel/tdFontFamilySel en views.js), para
// que el texto pegado quepa en la página igual que el escrito a mano.
const TD_PASTE_FONT_MIN = 12, TD_PASTE_FONT_MAX = 40;
const TD_ALLOWED_FONTS = ['Lora','Patrick Hand','Bangers','Permanent Marker','Bebas Neue','Oswald','Comic Neue','Press Start 2P','Arial','Verdana'];
function _tdSanitizePastedHTML(html){
  try{
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    doc.body.querySelectorAll('[style]').forEach(el => {
      if(el.style.fontSize){
        const n = parseFloat(el.style.fontSize);
        if(!isNaN(n)) el.style.fontSize = Math.max(TD_PASTE_FONT_MIN, Math.min(TD_PASTE_FONT_MAX, n)) + 'px';
        else el.style.removeProperty('font-size');
      }
      if(el.style.fontFamily){
        const clean = el.style.fontFamily.replace(/^['"]|['"]$/g, '').split(',')[0].trim();
        if(TD_ALLOWED_FONTS.includes(clean)) el.style.fontFamily = clean;
        else el.style.removeProperty('font-family');
      }
    });
    return doc.body.innerHTML;
  }catch(_e){ return html; }
}

// Tamaño y tipo de letra de la selección: atributos de texto personalizados de
// Trix (con valor, no solo on/off — ver _tdRegisterCustomTrixAttributes), con
// controles propios fuera de <trix-toolbar> porque Trix no genera selects.
// Truco "frozen" (documentado por la propia comunidad de Trix): al enfocar el
// select se activa el atributo invisible "frozen" para que la selección de
// texto siga viéndose resaltada mientras el foco está en el <select>.
function _tdWireFontControls(){
  const editorEl = document.getElementById('tdEditor');
  const sizeSel = document.getElementById('tdFontSizeSel');
  const famSel  = document.getElementById('tdFontFamilySel');
  if(!editorEl || !sizeSel || !famSel) return;

  const freeze = () => { try{ editorEl.editor?.activateAttribute('frozen'); }catch(_e){} };
  const unfreeze = () => { try{ editorEl.editor?.deactivateAttribute('frozen'); }catch(_e){} };

  sizeSel.addEventListener('mousedown', freeze);
  sizeSel.addEventListener('focus', freeze);
  sizeSel.addEventListener('change', () => {
    try{ editorEl.editor?.activateAttribute('fontSize', sizeSel.value); }catch(_e){}
    unfreeze();
    editorEl.focus();
  });

  famSel.addEventListener('mousedown', freeze);
  famSel.addEventListener('focus', freeze);
  famSel.addEventListener('change', () => {
    try{ editorEl.editor?.activateAttribute('fontFamily', famSel.value); }catch(_e){}
    unfreeze();
    editorEl.focus();
  });

  // Reflejar en los selects el tamaño/fuente activos en la posición actual del cursor
  editorEl.addEventListener('trix-selection-change', () => {
    const editor = editorEl.editor; if(!editor) return;
    try{
      const range = editor.getSelectedRange();
      const piece = editor.getDocument().getPieceAtPosition(range[0]);
      const fs = piece && piece.getAttribute && piece.getAttribute('fontSize');
      const ff = piece && piece.getAttribute && piece.getAttribute('fontFamily');
      if(fs && [...sizeSel.options].some(o => o.value === fs)) sizeSel.value = fs;
      if(ff && [...famSel.options].some(o => o.value === ff)) famSel.value = ff;
    }catch(_e){}
  });
}

// ── Paginación EN VIVO mientras se escribe (hojas A4 reales, no una tira
//    infinita) ──────────────────────────────────────────────────────────────
// El documento de Trix sigue siendo UNO solo (continuo) — no se puede partir
// en varios <trix-editor> sin romper su modelo de cursor/deshacer. En su
// lugar, la "hoja" (.td-page) tiene alto fijo con scroll interno, y se usa el
// MISMO motor de maquetación que "Aplicar al lienzo" (_tdLayoutPages) para
// saber cuántas páginas hacen falta y en qué carácter empieza cada una; luego
// se localiza esa posición en el DOM real con la API Range (funciona con
// cualquier anidamiento, sin tener que hacer coincidir mi árbol de bloques
// con el árbol real de Trix nodo a nodo).
let _tdViewPageStartChars = [0];
let _tdViewPageScrollTops = [0];
let _tdViewCurPage = 0;

// Busca la posición (nodo de texto + offset) en `container` que corresponde
// al carácter nº targetOffset contando solo nodos de texto, en orden documento
// — el mismo criterio de recuento que usa _tdLayoutPages sobre el HTML ya
// serializado (ver charsSoFar).
function _tdCharOffsetToRange(container, targetOffset){
  if(targetOffset <= 0) return null;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let consumed = 0, node;
  while((node = walker.nextNode())){
    const len = node.textContent.length;
    if(consumed + len >= targetOffset){
      const range = document.createRange();
      const off = Math.max(0, Math.min(len, targetOffset - consumed));
      range.setStart(node, off);
      range.collapse(true);
      return range;
    }
    consumed += len;
  }
  return null;
}

// Recalcula cuántas "hojas A4" hace falta para el contenido actual — SOLO
// para moverse por el editor mientras se escribe. Es independiente del
// tamaño real de la hoja del cómic: al "Aplicar al lienzo" se vuelve a
// calcular desde cero contra edPageW/edPageH (ver _tdApplyToCanvas), pueden
// salir más o menos hojas que las que se vieron aquí — es lo esperado.
let _tdRecomputeTimer = null;
function _tdRecomputeViewPagination(){
  const hidden = document.getElementById('tdHiddenInput');
  const editorEl = document.getElementById('tdEditor');
  const scrollArea = document.getElementById('tdPageArea');
  if(!hidden || !editorEl || !scrollArea) return;
  const html = hidden.value || '';
  const blocks = _tdParseBlocks(html);
  const lhSel = document.getElementById('tdLineHeightSel');
  const lineHeightMult = lhSel ? (parseFloat(lhSel.value) || TD_LINE_MULT) : TD_LINE_MULT;
  const { pageStartChars } = _tdLayoutPages(
    blocks, {pw: TD_A4_W, ph: TD_A4_H}, lineHeightMult,
    { marginFrac: TD_A4_MARGIN_FRAC, bodySize: TD_A4_BODY_SIZE, h1Size: TD_A4_H1_SIZE }
  );
  _tdViewPageStartChars = pageStartChars;

  // Medir en el DOM real dónde cae cada carácter de inicio de página, para
  // poder desplazar el scroll ahí con precisión (no una estimación por ratio).
  // El que se desplaza es el área contenedora (tdPageArea) — la hoja crece
  // con el texto, no tiene scroll propio.
  const areaRect = scrollArea.getBoundingClientRect();
  _tdViewPageScrollTops = pageStartChars.map(charOffset => {
    if(charOffset <= 0) return 0;
    const range = _tdCharOffsetToRange(editorEl, charOffset);
    if(!range) return scrollArea.scrollHeight;
    const rect = range.getBoundingClientRect();
    return Math.max(0, scrollArea.scrollTop + (rect.top - areaRect.top));
  });

  _tdViewCurPage = Math.min(_tdViewCurPage, _tdViewPageStartChars.length - 1);
  _tdUpdateViewPageNav();
}

function _tdUpdateViewPageNav(){
  const num = document.getElementById('tdPageNum');
  const prev = document.getElementById('tdPagePrev');
  const next = document.getElementById('tdPageNext');
  const total = _tdViewPageStartChars.length;
  if(num) num.textContent = (_tdViewCurPage + 1) + ' / ' + total;
  if(prev) prev.disabled = _tdViewCurPage <= 0;
  if(next) next.disabled = _tdViewCurPage >= total - 1;
}

// Navega a la página n (0-based) desplazando el área contenedora (no la hoja,
// que no tiene scroll propio — crece con el texto como cualquier editor normal).
function _tdScrollToViewPage(n){
  const scrollArea = document.getElementById('tdPageArea');
  if(!scrollArea) return;
  const total = _tdViewPageStartChars.length;
  _tdViewCurPage = Math.max(0, Math.min(total - 1, n));
  scrollArea.scrollTo({ top: _tdViewPageScrollTops[_tdViewCurPage] || 0, behavior: 'smooth' });
  _tdUpdateViewPageNav();
}

// Mientras se escribe: si el cursor queda por delante de la página que se
// está viendo (avanzó el texto más allá de lo que cabía), sigue el avance
// automáticamente — igual que un procesador de texto normal. Se usa
// window.getSelection() (no editor.getSelectedRange(), cuyo recuento interno
// de posiciones de Trix podría no coincidir exactamente con charsSoFar) y se
// cuenta con el MISMO criterio (TreeWalker de nodos de texto) que
// _tdCharOffsetToRange, para garantizar que ambos lados miden igual.
function _tdFollowCursorPage(){
  const editorEl = document.getElementById('tdEditor');
  if(!editorEl) return;
  const total = _tdViewPageStartChars.length;
  if(total <= 1){ _tdViewCurPage = 0; _tdUpdateViewPageNav(); return; }
  const sel = window.getSelection();
  if(!sel || sel.rangeCount === 0) return;
  const anchorNode = sel.focusNode;
  if(!anchorNode || !editorEl.contains(anchorNode)) return;
  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
  let consumed = 0, node, found = false;
  while((node = walker.nextNode())){
    if(node === anchorNode){
      consumed += Math.min(sel.focusOffset, node.textContent.length);
      found = true;
      break;
    }
    consumed += node.textContent.length;
  }
  if(!found) return; // cursor no está sobre un nodo de texto (p.ej. justo tras un salto)
  let page = 0;
  for(let i = 0; i < total; i++){ if(consumed >= _tdViewPageStartChars[i]) page = i; }
  if(page !== _tdViewCurPage) _tdScrollToViewPage(page);
}

window.addEventListener('resize', () => {
  cancelAnimationFrame(window._tdRecomputeRaf);
  window._tdRecomputeRaf = requestAnimationFrame(_tdRecomputeViewPagination);
});

// ── Franja blanca tras el título (mismo criterio que edTitlePill/gcpTitlePill) ──
function _tdUpdateTitlePill(){
  const bar = document.getElementById('tdTopbar');
  const pill = document.getElementById('tdTitlePill');
  const title = document.getElementById('tdProjectTitle');
  if(!bar || !pill || !title) return;
  const barRect = bar.getBoundingClientRect();
  const titleRect = title.getBoundingClientRect();
  if(titleRect.width <= 0){ pill.style.width = '0px'; return; }
  const vPad = titleRect.height * 0.067;
  pill.style.top    = (titleRect.top - barRect.top - vPad) + 'px';
  pill.style.height = (titleRect.height + vPad * 2) + 'px';
  pill.style.width  = Math.max(0, titleRect.right - barRect.left + 4) + 'px';
  // Píldora de flechas+número de página: misma altura exacta que la del título.
  const pageNavPill = document.getElementById('tdPageNavPill');
  if(pageNavPill) pageNavPill.style.height = (titleRect.height + vPad * 2) + 'px';
}
window.addEventListener('resize', () => {
  cancelAnimationFrame(window._tdTitlePillRaf);
  window._tdTitlePillRaf = requestAnimationFrame(_tdUpdateTitlePill);
});

// ── Parser: HTML de Trix → bloques {kind, indent, runs[], index?} ──────────
// kind: 'paragraph' | 'heading' | 'quote' | 'bullet' | 'number' | 'code' | 'pagebreak'
// runs: [{text, bold, italic, strike, mono, fontSize, fontFamily}] o {break:true} para <br>
function _tdParseBlocks(html){
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const blocks = [];

  function runsFromInline(node, state){
    let runs = [];
    node.childNodes.forEach(child => {
      if(child.nodeType === Node.TEXT_NODE){
        if(child.textContent) runs.push({text: child.textContent, ...state});
      } else if(child.nodeType === Node.ELEMENT_NODE){
        const tag = child.tagName.toLowerCase();
        if(tag === 'br'){ runs.push({break:true}); return; }
        let newState = {...state};
        if(tag === 'strong' || tag === 'b') newState.bold = true;
        if(tag === 'em' || tag === 'i') newState.italic = true;
        if(tag === 'del' || tag === 's' || tag === 'strike') newState.strike = true;
        if(tag === 'code') newState.mono = true;
        // fontSize/fontFamily: atributos de texto personalizados registrados en
        // Trix.config.textAttributes (ver _tdRegisterCustomTrixAttributes) — Trix
        // los serializa como <span style="font-size:...;font-family:...">.
        if(child.style){
          if(child.style.fontSize){ const _fs = parseFloat(child.style.fontSize); if(_fs) newState.fontSize = _fs; }
          if(child.style.fontFamily){ newState.fontFamily = child.style.fontFamily.replace(/^['"]|['"]$/g, ''); }
        }
        runs = runs.concat(runsFromInline(child, newState));
      }
    });
    return runs;
  }

  function walkBlockLevel(container, ctxKind, indentLevel){
    Array.from(container.children).forEach(el => {
      const tag = el.tagName.toLowerCase();
      if(tag === 'ul' || tag === 'ol'){
        Array.from(el.children).forEach((li, i) => {
          if(li.tagName.toLowerCase() !== 'li') return;
          blocks.push({
            kind: tag === 'ul' ? 'bullet' : 'number',
            index: i + 1,
            indent: indentLevel,
            runs: runsFromInline(li, {})
          });
        });
      } else if(tag === 'blockquote'){
        walkBlockLevel(el, 'quote', indentLevel + 1);
      } else if(tag === 'h1'){
        blocks.push({kind:'heading', indent:indentLevel, runs: runsFromInline(el, {})});
      } else if(tag === 'pre'){
        blocks.push({kind:'code', indent:indentLevel, runs: runsFromInline(el, {mono:true})});
      } else if(tag === 'aside'){
        // Salto de página forzado (Trix.config.blockAttributes.pageBreak, tagName 'aside')
        // — se ignora cualquier texto que pueda tener, solo marca el corte.
        blocks.push({kind:'pagebreak', indent:indentLevel, runs:[]});
      } else {
        blocks.push({kind: ctxKind === 'quote' ? 'quote' : 'paragraph', indent:indentLevel, runs: runsFromInline(el, {})});
      }
    });
  }

  walkBlockLevel(doc.body, 'paragraph', 0);
  return blocks;
}

// ── Registro de atributos personalizados de Trix (fontSize, fontFamily,
//    salto de página) — extensión oficial vía Trix.config, no un fork ni
//    un hack sobre internals. Ver README/wiki de Trix: "textAttributes
//    support style attributes via styleProperty; blockAttributes solo
//    tagName" (por eso el interlineado es un ajuste global del documento,
//    no un atributo de Trix — ver TD_LINE_MULT / tdLineHeightSel). ──
function _tdRegisterCustomTrixAttributes(){
  if(typeof Trix === 'undefined' || window._tdTrixAttrsRegistered) return;
  window._tdTrixAttrsRegistered = true;
  Trix.config.textAttributes.fontSize   = { styleProperty: 'font-size',   inheritable: true };
  Trix.config.textAttributes.fontFamily = { styleProperty: 'font-family', inheritable: true };
  Trix.config.blockAttributes.pageBreak = { tagName: 'aside', terminal: true, breakOnReturn: true, group: false };
}
_tdRegisterCustomTrixAttributes();

// ── Maquetación + paginación ────────────────────────────────────────────
// Devuelve {pages}: array de páginas; cada página = array de líneas
// {y, indent, kind, fontSize, marker, runs:[{text,x,width,bold,italic,strike,mono}]}
// Coordenadas (y, x) son ABSOLUTAS dentro de la página lógica (0,0 = esquina
// superior izquierda), ya con el margen incluido — TextLayer._drawRichLines()
// las usa tal cual, sin más cálculo.
const _tdMeasureCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
const _tdMeasureCtx = _tdMeasureCanvas ? _tdMeasureCanvas.getContext('2d') : null;

function _tdFontStr(fontSize, bold, italic, mono, fontFamily){
  const fam = mono ? 'monospace' : `'${fontFamily || TD_FONT_FAMILY}'`;
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${fam}`;
}

// frameSizes: {pw,ph} único (todas las páginas iguales, uso normal) o array
// de {pw,ph} — tamaño de marco por página ya existente en el flujo (tras
// redimensionar alguna con los handlers); la última talla de la lista se
// repite para páginas adicionales si el contenido no cupiera en las dadas.
// opts: {marginFrac o marginFracX/marginFracY, bodySize, h1Size} — por
// defecto, los del cómic (Aplicar al lienzo); la vista en vivo del editor
// (A4) pasa los suyos propios, ver _tdRecomputeViewPagination. marginFracX
// es el que el usuario puede cambiar desde "Márgenes" en el panel de
// propiedades (ver pp-td-margin/_tdReflowAfterMarginChange) — solo afecta al
// margen lateral, el vertical se mantiene siempre en su valor por defecto.
function _tdLayoutPages(blocks, frameSizes, lineHeightMult, opts){
  const sizes = Array.isArray(frameSizes) ? frameSizes : [frameSizes];
  const lhMult = lineHeightMult || TD_LINE_MULT;
  const marginFracX = (opts && (opts.marginFracX ?? opts.marginFrac)) ?? TD_MARGIN_FRAC;
  const marginFracY = (opts && (opts.marginFracY ?? opts.marginFrac)) ?? TD_MARGIN_FRAC;
  const bodySizeDefault = (opts && opts.bodySize) || TD_BODY_SIZE;
  const h1SizeDefault = (opts && opts.h1Size) || TD_H1_SIZE;
  const ctx = _tdMeasureCtx;

  let frameIdx = 0, mx, my, textW, textH;
  function loadFrame(){
    const f = sizes[Math.min(frameIdx, sizes.length - 1)];
    mx = f.pw * marginFracX; my = f.ph * marginFracY;
    textW = f.pw - mx * 2; textH = f.ph - my * 2;
  }
  loadFrame();

  const pages = [];
  const pageStartChars = [0]; // offset de texto plano (orden documento) donde empieza cada página
  let curLines = [];
  let curY = 0; // relativo al margen superior (0..textH)
  let charsSoFar = 0;

  function pushLine(entry){
    if(curY + entry.height > textH && curLines.length > 0){
      pages.push(curLines);
      curLines = [];
      curY = 0;
      frameIdx++;
      loadFrame();
      pageStartChars.push(charsSoFar);
    }
    const baseline = curY + entry.height * 0.78;
    curLines.push({
      y: my + baseline,
      indent: mx + entry.indent,
      kind: entry.kind,
      fontSize: entry.fontSize,
      marker: entry.marker,
      runs: entry.runs
    });
    curY += entry.height;
  }

  function forcePageBreak(){
    if(curLines.length > 0){
      pages.push(curLines);
      curLines = [];
      curY = 0;
      frameIdx++;
      loadFrame();
      pageStartChars.push(charsSoFar);
    }
  }

  blocks.forEach(block => {
    if(block.kind === 'pagebreak'){ forcePageBreak(); return; }

    const isHeading = block.kind === 'heading';
    const baseFontSize = isHeading ? h1SizeDefault : bodySizeDefault;

    let indentPx = 0;
    let marker = null;
    if(block.kind === 'bullet'){ indentPx = TD_LIST_INDENT; marker = '•'; }
    else if(block.kind === 'number'){ indentPx = TD_LIST_INDENT; marker = block.index + '.'; }
    else if(block.kind === 'quote'){ indentPx = TD_QUOTE_INDENT; }
    indentPx += (block.indent || 0) * TD_QUOTE_INDENT;

    // Tokenizar runs en "palabras" preservando estilo y saltos de línea manuales
    // (<br>). fontSize/fontFamily por palabra: los que vengan del propio run
    // (selección con tamaño/fuente aplicados) o, si no, el tamaño base del bloque.
    let words = [];
    (block.runs || []).forEach(run => {
      if(run.break){ words.push({break:true}); return; }
      const parts = (run.text || '').split(/(\s+)/).filter(s => s.length);
      parts.forEach(p => words.push({
        text:p, bold: isHeading ? true : !!run.bold, italic:!!run.italic, strike:!!run.strike, mono:!!run.mono,
        fontSize: run.fontSize || baseFontSize,
        fontFamily: run.fontFamily || null, // null = usar richFontFamily del documento
        isSpace: /^\s+$/.test(p)
      }));
    });

    if(words.length === 0){
      pushLine({height:baseFontSize*lhMult, indent:indentPx, kind:block.kind, fontSize:baseFontSize, marker:null, runs:[]});
      curY += baseFontSize * TD_PARA_GAP_MULT;
      return;
    }

    let lineRuns = [];
    let lineWidth = 0;
    let lineMaxFontSize = baseFontSize;
    let firstLineOfBlock = true;

    function flushLine(){
      while(lineRuns.length && lineRuns[lineRuns.length - 1].isSpace) lineRuns.pop();
      pushLine({
        height: lineMaxFontSize * lhMult, indent: indentPx, kind: block.kind, fontSize: lineMaxFontSize,
        marker: firstLineOfBlock ? marker : null, runs: lineRuns
      });
      firstLineOfBlock = false;
      lineRuns = [];
      lineWidth = 0;
      lineMaxFontSize = baseFontSize;
    }

    words.forEach(w => {
      if(w.break){ flushLine(); return; }
      if(w.isSpace && lineRuns.length === 0) return; // no empezar línea con espacio
      ctx.font = _tdFontStr(w.fontSize, w.bold, w.italic, w.mono, w.fontFamily);
      const width = ctx.measureText(w.text).width;
      const avail = Math.max(20, textW - indentPx); // textW: marco actual, puede cambiar entre líneas
      if(lineWidth + width > avail && lineRuns.length > 0 && !w.isSpace){
        flushLine();
      }
      lineRuns.push({
        text:w.text, bold:w.bold, italic:w.italic, strike:w.strike, mono:w.mono,
        fontSize:w.fontSize, fontFamily:w.fontFamily, isSpace:w.isSpace, width, x:0
      });
      lineWidth += width;
      charsSoFar += w.text.length;
      if(w.fontSize > lineMaxFontSize) lineMaxFontSize = w.fontSize;
    });
    if(lineRuns.length) flushLine();

    curY += baseFontSize * TD_PARA_GAP_MULT;
  });

  if(curLines.length) pages.push(curLines);
  if(pages.length === 0) pages.push([]);

  // Posición x acumulada por línea (alineación izquierda) + limpieza de campos internos
  pages.forEach(page => {
    page.forEach(line => {
      let x = line.indent;
      line.runs.forEach(r => {
        r.x = x;
        x += r.width;
        delete r.isSpace;
      });
    });
  });

  return {pages, mx, my, pageStartChars};
}

// Resumen en texto plano por página (fallback/legacy — _hasText, panel_texts, etc.
// Ver NORMAS/CARTA: el reader dibuja bocadillos/textos desde panel_texts, que no
// tiene richLines, así que _bubbleLayer sigue siendo la fuente real en lectura).
function _tdPlainSummary(pageLines){
  const words = [];
  (pageLines || []).forEach(l => (l.runs || []).forEach(r => { if(r.text) words.push(r.text); }));
  const joined = words.join('').trim().replace(/\s+/g, ' ');
  return joined.slice(0, 60) || 'Texto';
}

function _tdMakeTextLayer(pageLines, html, flowId, lineHeightMult, marginXFrac){
  const tl = new TextLayer(_tdPlainSummary(pageLines), 0.5, 0.5);
  tl.x = 0.5; tl.y = 0.5; tl.width = 1; tl.height = 1;
  tl.color = '#1A1A1A';
  tl.backgroundColor = '#FFF9F0'; // --paper (color que se usaría si se sube la opacidad)
  tl.bgOpacity = 0; // transparente por defecto — ajustable en el panel de propiedades
  tl.borderWidth = 0;
  tl.richFontFamily = TD_FONT_FAMILY;
  tl.richLines = pageLines;
  tl.sourceHTML = html;
  tl._tdFlowId = flowId;
  tl.lineHeightMult = lineHeightMult || TD_LINE_MULT;
  tl.marginXFrac = marginXFrac || TD_MARGIN_FRAC;
  return tl;
}

// ── Aplicar al lienzo ────────────────────────────────────────────────────
// Sin edición en curso: crea un flujo nuevo empezando en la hoja vigente (la
// que estaba activa al abrir el Editor de textos). El texto se reparte
// primero por las hojas YA EXISTENTES a partir de esa, respetando la
// orientación propia de cada una — solo se crean hojas nuevas (al final de
// la obra) si el texto continúa más allá de las que ya había.
// Editando (_tdEditingFlowId, ver edOpenTextDoc): sustituye in situ las hojas
// de ese flujo, conservando su posición — reeditar desde cualquiera de sus
// hojas sigue empezando por la misma.
function _tdApplyToCanvas(){
  const hidden = document.getElementById('tdHiddenInput');
  const html = (hidden ? hidden.value : '') || '';
  const blocks = _tdParseBlocks(html);
  const hasContent = blocks.some(b => (b.runs || []).some(r => r.text && r.text.trim()));
  if(!hasContent){ edToast('Escribe algo de texto antes de aplicar'); return; }

  const lhSel = document.getElementById('tdLineHeightSel');
  const lineHeightMult = lhSel ? parseFloat(lhSel.value) || TD_LINE_MULT : TD_LINE_MULT;

  if(_tdEditingFlowId){
    const existingLayer = _tdFindFlowLayer(_tdEditingFlowId);
    if(!existingLayer){ edToast('No se encuentra el texto a actualizar'); return; }
    // Se reutiliza el mismo motor que el redimensionado con los handlers:
    // conserva el tamaño/posición/color/fondo/marco que ya tuviera cada hoja
    // del flujo — solo cambia el contenido (y el interlineado, si se tocó
    // desde el propio Editor de textos).
    existingLayer.sourceHTML = html;
    existingLayer.lineHeightMult = lineHeightMult;
    const _panelWasOpen = !!(document.getElementById('editorShell')?.classList.contains('draw-active'));
    const r = _tdReflowFlowInPlace(existingLayer, _panelWasOpen);
    if(!r){ edToast('No se pudo actualizar el texto'); return; }
    if(!_panelWasOpen) edLoadPage(r.firstIdx); // si no había panel que restaurar, al menos ir a la hoja
    edToast(r.count === 1 ? 'Texto actualizado (1 hoja)' : `Texto actualizado (${r.count} hojas)`);
  } else {
    const flowId = _tdNewFlowId();
    const startIdx = Math.max(0, Math.min(edCurrentPage, edPages.length - 1));

    // El texto se reparte primero por las hojas YA EXISTENTES a partir de la
    // actual, respetando la orientación propia de cada una — solo se crean
    // hojas nuevas si el texto continúa más allá de las que ya había.
    const frames = [];
    for(let i = startIdx; i < edPages.length; i++){
      const sv = (edPages[i].orientation || edOrientation) === 'vertical';
      frames.push({ pw: sv ? ED_PAGE_W : ED_PAGE_H, ph: sv ? ED_PAGE_H : ED_PAGE_W });
    }
    if(!frames.length){
      const sv = edOrientation === 'vertical';
      frames.push({ pw: sv ? ED_PAGE_W : ED_PAGE_H, ph: sv ? ED_PAGE_H : ED_PAGE_W });
    }

    const { pages } = _tdLayoutPages(blocks, frames, lineHeightMult);
    const existingCount = Math.min(pages.length, edPages.length - startIdx);

    for(let i = 0; i < existingCount; i++){
      const pg = edPages[startIdx + i];
      pg.layers = pg.layers || [];
      pg.layers.push(_tdMakeTextLayer(pages[i], html, flowId, lineHeightMult));
    }
    // Si el texto sigue más allá de las hojas ya existentes, las que faltan
    // se crean nuevas al final — con la orientación de la última hoja de la obra.
    const lastOrient = edPages.length ? (edPages[edPages.length - 1].orientation || edOrientation) : edOrientation;
    const newPages = pages.slice(existingCount).map(pageLines => ({
      layers: [_tdMakeTextLayer(pageLines, html, flowId, lineHeightMult)],
      drawData: null, textLayerOpacity: 1, textMode: 'sequential', orientation: lastOrient
    }));
    if(newPages.length) edPages.push(...newPages);

    edLoadPage(startIdx);
    edPushHistory();
    edToast(
      pages.length === 1 ? 'Texto añadido a la hoja actual' :
      !newPages.length ? `Texto añadido en ${pages.length} hojas ya existentes` :
      `Texto añadido: ${pages.length} hojas (${newPages.length} nueva${newPages.length===1?'':'s'})`
    );
  }

  // Cada aplicación consume el contenido del editor — se vacía para el siguiente texto
  if(hidden) hidden.value = '';
  const editorEl = document.getElementById('tdEditor');
  if(editorEl && editorEl.editor) editorEl.editor.loadHTML('');
  _tdEditingFlowId = null;

  edCloseTextDoc();
}

// ── Reflujo al redimensionar una hoja de texto con los handlers, o al
//    cambiar los márgenes desde el panel de propiedades ──────────────────
// Si se encoge, el contenido que ya no cabe pasa a la hoja siguiente (o crea
// una nueva al final del flujo); si se agranda, tira de texto de la hoja
// siguiente para rellenar el hueco (pudiendo vaciar y eliminar alguna hoja).
// Cada hoja del flujo conserva su propio marco (posición/tamaño/color/fondo/
// marco que ya tuviera) — solo se añaden o quitan hojas al final si hacen
// falta más o menos de las que ya había.
function _tdReflowAfterResize(layerIdx, panelWasOpen){
  const la = edLayers[layerIdx];
  if(!la || !la.richLines || !la.richLines.length) return;
  const r = _tdReflowFlowInPlace(la, panelWasOpen);
  if(r && r.count !== r.oldCount){
    edToast(r.count > r.oldCount ? 'El texto ya no cabía: se ha creado una hoja nueva' : 'Sobraba hueco: se ha quitado una hoja');
  }
}

// Cambiar el margen lateral desde "Márgenes" en el panel de propiedades:
// misma operación que redimensionar (recalcula el flujo conservando el
// marco de cada hoja), solo que lo que cambia es el margen, no el tamaño.
// El panel está abierto por definición (es el control que dispara esto).
function _tdReflowAfterMarginChange(la){
  if(!la || !la.richLines || !la.richLines.length) return;
  const r = _tdReflowFlowInPlace(la, true);
  if(r && r.count !== r.oldCount){
    edToast(r.count > r.oldCount ? 'El texto ya no cabía: se ha creado una hoja nueva' : 'Sobraba hueco: se ha quitado una hoja');
  }
}

function _tdReflowFlowInPlace(la, panelWasOpen){
  const flowId = _tdEnsureFlowId(la); // migra capas de v32.70 sin _tdFlowId
  const html = la.sourceHTML || '';
  if(!html) return;

  // Todas las hojas del flujo, en orden, con el marco (tamaño real) que cada
  // una tenga en este momento — no necesariamente uniforme si ya se había
  // redimensionado alguna antes.
  const flowIdxs = [];
  edPages.forEach((p, i) => { if((p.layers || []).some(l => l && l._tdFlowId === flowId)) flowIdxs.push(i); });
  flowIdxs.sort((a, b) => a - b);
  if(!flowIdxs.length) return;

  const frames = flowIdxs.map(i => {
    const pg = edPages[i];
    const layer = pg.layers.find(l => l && l._tdFlowId === flowId);
    const orient = pg.orientation || edOrientation;
    const sv = orient === 'vertical';
    const pgPw = sv ? ED_PAGE_W : ED_PAGE_H, pgPh = sv ? ED_PAGE_H : ED_PAGE_W;
    return { pw: layer.width * pgPw, ph: layer.height * pgPh };
  });
  // Marco de reserva si hiciera falta más sitio del que dan las hojas ya
  // existentes: página completa en la orientación de la última hoja del
  // flujo — mismo criterio que "Aplicar al lienzo".
  const lastOrient = edPages[flowIdxs[flowIdxs.length - 1]].orientation || edOrientation;
  const svLast = lastOrient === 'vertical';
  frames.push({ pw: svLast ? ED_PAGE_W : ED_PAGE_H, ph: svLast ? ED_PAGE_H : ED_PAGE_W });

  const blocks = _tdParseBlocks(html);
  const { pages } = _tdLayoutPages(blocks, frames, la.lineHeightMult, { marginFracX: la.marginXFrac || TD_MARGIN_FRAC, marginFracY: TD_MARGIN_FRAC });

  const extrasByOldIdx = flowIdxs.map(i => (edPages[i].layers || []).filter(l => !(l && l._tdFlowId === flowId)));
  const firstIdx = flowIdxs[0];

  const newPageObjs = pages.map((pageLines, i) => {
    const oldIdx = flowIdxs[i];
    const oldPage = oldIdx !== undefined ? edPages[oldIdx] : null;
    const oldLayer = oldPage ? oldPage.layers.find(l => l && l._tdFlowId === flowId) : null;
    const tl = _tdMakeTextLayer(pageLines, html, flowId, la.lineHeightMult, la.marginXFrac);
    if(oldLayer){
      // Conservar el marco (posición/tamaño/color/fondo/marco) que ya tenía
      // esta hoja — incluido el que el usuario acaba de fijar con los handlers.
      tl.x = oldLayer.x; tl.y = oldLayer.y; tl.width = oldLayer.width; tl.height = oldLayer.height;
      tl.rotation = oldLayer.rotation || 0;
      tl.color = oldLayer.color; tl.backgroundColor = oldLayer.backgroundColor;
      tl.bgOpacity = oldLayer.bgOpacity; tl.borderColor = oldLayer.borderColor; tl.borderWidth = oldLayer.borderWidth;
    }
    const extras = oldPage ? (extrasByOldIdx[i] || []) : [];
    const orientation = oldPage ? (oldPage.orientation || edOrientation) : lastOrient;
    return { layers: [tl, ...extras], drawData: null, textLayerOpacity: 1, textMode: 'sequential', orientation };
  });
  for(let i = pages.length; i < extrasByOldIdx.length; i++){
    const leftovers = extrasByOldIdx[i] || [];
    if(leftovers.length && newPageObjs.length) newPageObjs[newPageObjs.length - 1].layers.push(...leftovers);
  }

  const wasCurrentInFlow = flowIdxs.includes(edCurrentPage);
  const offsetWithinFlow = edCurrentPage - firstIdx;

  for(let k = flowIdxs.length - 1; k >= 0; k--) edPages.splice(flowIdxs[k], 1);
  edPages.splice(firstIdx, 0, ...newPageObjs);

  if(wasCurrentInFlow){
    edCurrentPage = Math.max(firstIdx, Math.min(firstIdx + newPageObjs.length - 1, firstIdx + offsetWithinFlow));
    // edLoadPage() deselecciona y resetea el panel de propiedades — está
    // pensado para cuando el usuario cambia de página desde el panel de
    // Hojas, no para refrescar la hoja actual tras un reflujo. Si el panel
    // estaba abierto (panelWasOpen, capturado por quien nos llamó ANTES de
    // que nada más pudiera tocar el estado), hay que reabrirlo después con
    // los datos ya actualizados; si no, el menú se queda bloqueado
    // (_edMenuLock queda en true sin que nada lo desbloquee) y el panel colapsado.
    if(typeof edLoadPage === 'function') edLoadPage(edCurrentPage);
    // Reseleccionar la capa de texto en su nuevo índice (solo hay una por hoja)
    edSelectedIdx = edLayers.findIndex(l => l && l._tdFlowId === flowId);
    if(panelWasOpen && edSelectedIdx >= 0){
      if(typeof _edDrawLockUI === 'function') _edDrawLockUI();
      if(typeof _edPropsOverlayShow === 'function') _edPropsOverlayShow();
      if(typeof edRenderOptionsPanel === 'function') edRenderOptionsPanel('props');
    } else if(panelWasOpen && typeof _edPropsOverlayHide === 'function'){
      // Red de seguridad: si estaba abierto pero no hay nada que reseleccionar,
      // desbloquear el menú explícitamente en vez de dejarlo bloqueado.
      _edPropsOverlayHide();
    }
  }
  if(typeof edFitCanvas === 'function') edFitCanvas(true);
  if(typeof edRedraw === 'function') edRedraw();
  if(typeof edPushHistory === 'function') edPushHistory(true);
  if(typeof _pgRender === 'function') _pgRender();
  return { firstIdx, count: newPageObjs.length, oldCount: flowIdxs.length };
}
