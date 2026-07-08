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
  if(typeof _tdSyncViewportHeight === 'function') _tdSyncViewportHeight();
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
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _tdViewCurPage = 0;
    _tdCurrentOffset = 0;
    const inner = document.getElementById('tdPageInner');
    if(inner) inner.style.transform = 'none';
    _tdRecomputeViewPagination();
    // Reeditar: centrar la vista en el texto que había en la hoja concreta
    // desde la que se abrió el panel, no siempre al principio del documento.
    // La maquetación del lienzo (comic) y la de esta vista en vivo (A4) son
    // distintas, así que no se puede reutilizar directamente la posición —
    // se usa el nº de caracteres que hay ANTES de esa hoja dentro del mismo
    // flujo, y se busca a qué página de ESTA vista corresponde ese mismo punto.
    if(editLayer && editLayer.richLines && editLayer._tdFlowId){
      const targetChars = _tdCharsBeforeLayer(editLayer);
      if(targetChars > 0){
        let page = 0;
        for(let i = 0; i < _tdViewPageStartChars.length; i++){ if(targetChars >= _tdViewPageStartChars[i]) page = i; }
        _tdScrollToViewPage(page, false);
      }
    }
  }));
}
// Caracteres de texto plano que hay ANTES de la hoja `la` dentro de su mismo
// flujo (sumando las hojas anteriores, en el orden en que aparecen en la
// obra) — usado para saber, al reeditar, en qué página de la vista en vivo
// (maquetación A4, independiente de la del lienzo) cae ese mismo punto.
function _tdCharsBeforeLayer(la){
  if(!la || !la._tdFlowId) return 0;
  const flowId = la._tdFlowId;
  let chars = 0;
  for(let i = 0; i < edPages.length; i++){
    const layer = (edPages[i].layers || []).find(l => l && l._tdFlowId === flowId);
    if(!layer) continue;
    if(layer === la) break;
    (layer.richLines || []).forEach(line => (line.runs || []).forEach(r => { if(r.text) chars += r.text.length; }));
  }
  return chars;
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
      }, 220);
    });
    editorEl.addEventListener('trix-selection-change', () => {
      clearTimeout(_tdFollowTimer);
      _tdFollowTimer = setTimeout(_tdFollowCursorPage, 100);
    });
  }
  // Desplazamiento continuo: rueda del ratón (PC) y arrastre táctil (móvil),
  // igual que cualquier área de texto normal — la hoja sigue teniendo tamaño
  // A4 fijo y recorta su contenido (.td-page overflow:hidden); lo que se
  // restaura es que #tdPageInner se pueda mover libremente dentro de eso,
  // no solo saltar de página en página. Los botones de flecha y el
  // seguimiento automático del cursor siguen saltando a un límite de página
  // exacto y animado (_tdScrollToViewPage).
  const _tdArea = document.getElementById('tdPageArea');
  _tdArea?.addEventListener('wheel', e => {
    e.preventDefault();
    _tdSetScrollOffset(_tdCurrentOffset + e.deltaY, false);
  }, {passive:false});

  let _tdDragActive = false, _tdDragStartY = null, _tdDragStartOffset = 0, _tdDragMoved = false;
  _tdArea?.addEventListener('pointerdown', e => {
    // Solo táctil/lápiz: con ratón, arrastrar debe seguir seleccionando texto
    // como en cualquier editor — el desplazamiento en PC es con la rueda.
    if(e.pointerType === 'mouse') return;
    _tdDragActive = true; _tdDragMoved = false;
    _tdDragStartY = e.clientY; _tdDragStartOffset = _tdCurrentOffset;
    _tdArea.setPointerCapture?.(e.pointerId);
  });
  _tdArea?.addEventListener('pointermove', e => {
    if(!_tdDragActive || _tdDragStartY === null) return;
    const dy = e.clientY - _tdDragStartY;
    if(Math.abs(dy) > 4 && !_tdDragMoved){
      _tdDragMoved = true;
      // Arrastre real detectado: si el propio gesto ya había empezado a
      // seleccionar texto (habitual al arrastrar sobre un contenteditable),
      // se cancela esa selección y se desactiva mientras dure el arrastre —
      // si no, arrastrar para desplazar la hoja "engancharía" texto en vez
      // de moverla.
      window.getSelection()?.removeAllRanges();
      const editorEl2 = document.getElementById('tdEditor');
      if(editorEl2) editorEl2.style.userSelect = 'none';
    }
    if(_tdDragMoved){ e.preventDefault(); _tdSetScrollOffset(_tdDragStartOffset - dy, false); }
  });
  const _tdEndDrag = () => {
    _tdDragActive = false; _tdDragStartY = null;
    const editorEl2 = document.getElementById('tdEditor');
    if(editorEl2) editorEl2.style.userSelect = '';
  };
  _tdArea?.addEventListener('pointerup', _tdEndDrag);
  _tdArea?.addEventListener('pointercancel', _tdEndDrag);
  document.getElementById('tdPagePrev')?.addEventListener('click', () => _tdScrollToViewPage(_tdViewCurPage - 1));
  document.getElementById('tdPageNext')?.addEventListener('click', () => _tdScrollToViewPage(_tdViewCurPage + 1));
  _tdWireFontControls();

  // Flechas del teclado (PC): pasan de página — SOLO cuando el cursor no está
  // escribiendo en el propio texto (si el trix-editor tiene el foco, las
  // flechas deben seguir moviendo el cursor con su comportamiento normal;
  // "nada seleccionado" aquí equivale a no tener el foco en el editor). Mismo
  // criterio que el resto de la app: derecha/abajo=siguiente, izquierda/
  // arriba=anterior. Ver también Ayuda ▾ Atajos de teclado.
  document.addEventListener('keydown', e => {
    const shell = document.getElementById('tdShell');
    if(!shell || shell.style.display === 'none' || shell.style.display === '') return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
    const active = document.activeElement;
    if(active && (active.isContentEditable || active === document.getElementById('tdEditor'))) return;
    e.preventDefault();
    if(e.key === 'ArrowRight' || e.key === 'ArrowDown') _tdScrollToViewPage(_tdViewCurPage + 1);
    else _tdScrollToViewPage(_tdViewCurPage - 1);
  });

  // Teclado virtual (móvil): el shell se ajusta al alto REAL visible (Visual
  // Viewport), no al de la ventana completa — si no, el teclado tapa la
  // parte de abajo de la hoja (y con ella, la línea que se está escribiendo)
  // sin que #tdShell (position:fixed;inset:0, que se calcula sobre el
  // viewport de diseño, no el visual) se entere. Al encogerse el shell, la
  // hoja se encoge con él en el mismo flujo (flex) que ya usa para pantallas
  // pequeñas — no es un formato nuevo, es el mismo adaptándose a menos alto.
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', _tdSyncViewportHeight);
    window.visualViewport.addEventListener('scroll', _tdSyncViewportHeight);
  }
}
let _tdViewportSyncTimer = null;
function _tdSyncViewportHeight(){
  const shell = document.getElementById('tdShell');
  if(!shell || shell.style.display === 'none' || shell.style.display === '') return;
  const vv = window.visualViewport;
  if(!vv) return;
  shell.style.height = vv.height + 'px';
  shell.style.top = (vv.offsetTop || 0) + 'px';
  // La página cambia de tamaño con el shell — recalcular la paginación en
  // vivo (con retardo corto: el teclado tarda un poco en terminar de animarse).
  clearTimeout(_tdViewportSyncTimer);
  _tdViewportSyncTimer = setTimeout(_tdRecomputeViewPagination, 120);
}
let _tdFollowTimer = null;

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

// ── Paginación EN VIVO mientras se escribe (hojas A4 reales, recorte real,
//    no una tira que crece con scroll continuo) ─────────────────────────────
// El documento de Trix sigue siendo UNO solo (continuo) — no se puede partir
// en varios <trix-editor> sin romper su modelo de cursor/deshacer. En su
// lugar, la "hoja" (.td-page) tiene tamaño A4 FIJO y recorta su contenido
// (overflow:hidden); el contenido real (#tdPageInner) es más alto y se
// TRASLADA (transform: translateY) para mostrar solo la página actual — un
// salto visual real de una página a otra, no un scroll suave indistinguible.
// Se usa el MISMO motor de maquetación que "Aplicar al lienzo" (_tdLayoutPages)
// para saber cuántas páginas hacen falta y en qué carácter empieza cada una;
// luego se localiza esa posición en el DOM real con la API Range (funciona
// con cualquier anidamiento, sin tener que hacer coincidir mi árbol de
// bloques con el árbol real de Trix nodo a nodo).
let _tdViewPageStartChars = [0];
let _tdViewPageOffsets = [0]; // px a trasladar (translateY) para ver cada página
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
//
// IMPORTANTE: se usan dimensiones REALES medidas del DOM (ancho del editor,
// alto de página, tamaño de letra ya calculado), no la constante TD_A4_W/H —
// la página en pantalla casi nunca mide 794px de verdad (un móvil en vertical
// mide bastante menos), y si el motor de maquetación (basado en canvas)
// midiera el ajuste de línea contra un ancho distinto al que realmente usa el
// navegador, los saltos de página calculados no coincidirían con los reales.
let _tdRecomputeTimer = null;
function _tdRecomputeViewPagination(){
  const hidden = document.getElementById('tdHiddenInput');
  const editorEl = document.getElementById('tdEditor');
  const inner = document.getElementById('tdPageInner');
  const pageEl = document.getElementById('tdPage');
  if(!hidden || !editorEl || !inner || !pageEl) return;
  const html = hidden.value || '';
  const blocks = _tdParseBlocks(html);
  const lhSel = document.getElementById('tdLineHeightSel');
  const lineHeightMult = lhSel ? (parseFloat(lhSel.value) || TD_LINE_MULT) : TD_LINE_MULT;

  // Ancho real disponible para el texto: el propio trix-editor ya está DENTRO
  // del padding de #tdPageInner, así que su ancho renderizado ES el ancho neto.
  const pw = editorEl.clientWidth || TD_A4_W;
  // Alto real de una página: el de .td-page (lo que recorta overflow:hidden),
  // menos el padding vertical real de #tdPageInner (percentual, ya resuelto a
  // píxeles por el navegador — puede no ser igual al horizontal: el padding en
  // % se calcula siempre sobre el ANCHO del contenedor en ambos ejes).
  const innerCs = getComputedStyle(inner);
  const padTop = parseFloat(innerCs.paddingTop) || 0;
  const padBottom = parseFloat(innerCs.paddingBottom) || 0;
  const ph = (pageEl.clientHeight || TD_A4_H);
  // Tamaño de letra real ya calculado por el navegador (rem/clamp ya resueltos)
  const bodySize = parseFloat(getComputedStyle(editorEl).fontSize) || TD_A4_BODY_SIZE;
  const h1Size = bodySize * 1.55; // igual proporción que .td-editor h1{font-size:1.55em}

  const { pageStartChars } = _tdLayoutPages(
    blocks, {pw, ph}, lineHeightMult,
    { marginFracX: 0, marginFracY: 0, bodySize, h1Size, padTop, padBottom }
  );
  _tdViewPageStartChars = pageStartChars;

  // Medir en el DOM real dónde cae cada carácter de inicio de página. Hay que
  // medir con #tdPageInner en su posición NATURAL (sin trasladar) — si no, la
  // traslación ya aplicada de la página actual falsearía la medida.
  inner.style.transition = 'none';
  inner.style.transform = 'none';
  const innerRect = inner.getBoundingClientRect();
  _tdViewPageOffsets = pageStartChars.map(charOffset => {
    if(charOffset <= 0) return 0;
    const range = _tdCharOffsetToRange(editorEl, charOffset);
    if(!range) return inner.scrollHeight;
    const rect = range.getBoundingClientRect();
    return Math.max(0, rect.top - innerRect.top);
  });
  // Reaplicar (sin animar) la posición de scroll que ya tenía — NO se fuerza
  // el salto al inicio exacto de la página: el usuario puede haberse
  // desplazado libremente con la rueda/el dedo (ver _tdSetScrollOffset), y
  // recalcular mientras escribe no debe deshacer eso. _tdFollowCursorPage,
  // llamado justo después de esta función, sí decide si hay que saltar de
  // página (cuando el cursor avanza más allá de lo que se ve).
  _tdSetScrollOffset(_tdCurrentOffset, false);
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

// Posición de desplazamiento actual, en px — no atada a una página exacta:
// la rueda del ratón y el arrastre táctil la mueven de forma continua (ver
// _tdSetScrollOffset); los botones de flecha y el seguimiento automático del
// cursor SÍ saltan a un límite de página exacto (_tdScrollToViewPage).
let _tdCurrentOffset = 0;

// Desplaza #tdPageInner a una posición cualquiera en px (no necesariamente el
// principio de una página) — usada por la rueda del ratón y el arrastre
// táctil para restaurar un desplazamiento continuo y natural, sin perder el
// recorte de página fija (.td-page sigue con overflow:hidden; lo que cambia
// es solo hasta dónde se traslada #tdPageInner). animate=false (rueda/
// arrastre, tiene que notarse al instante) frente a true (saltos de página,
// con la transición animada ya definida en CSS).
function _tdSetScrollOffset(px, animate){
  const inner = document.getElementById('tdPageInner');
  const pageEl = document.getElementById('tdPage');
  if(!inner || !pageEl) return;
  const maxScroll = Math.max(0, (inner.scrollHeight || 0) - (pageEl.clientHeight || 0));
  const clamped = Math.max(0, Math.min(maxScroll, px));
  inner.style.transition = animate ? '' : 'none';
  inner.style.transform = 'translateY(-' + clamped + 'px)';
  _tdCurrentOffset = clamped;
  // Reflejar en la cabecera la página más cercana a donde se ha desplazado,
  // sin forzar un salto — es solo para que el número siga lo que se ve.
  let page = 0;
  for(let i = 0; i < _tdViewPageOffsets.length; i++){ if(clamped + 2 >= _tdViewPageOffsets[i]) page = i; }
  if(page !== _tdViewCurPage){ _tdViewCurPage = page; }
  _tdUpdateViewPageNav();
}

// Navega a la página n (0-based): traslada #tdPageInner para que .td-page
// (tamaño A4 fijo, overflow:hidden) recorte y muestre solo esa página — un
// salto real y animado, no un scroll continuo (para eso están la rueda del
// ratón y el arrastre táctil, ver _tdSetScrollOffset). announce=true avisa
// con un toast (se usa al seguir el cursor automáticamente mientras se
// escribe, para que el cambio de hoja sea inequívoco; los botones de flecha
// no lo necesitan, ya es obvio que el usuario lo pidió él mismo).
function _tdScrollToViewPage(n, announce){
  const total = _tdViewPageStartChars.length;
  const target = Math.max(0, Math.min(total - 1, n));
  const changed = target !== _tdViewCurPage;
  _tdSetScrollOffset(_tdViewPageOffsets[target] || 0, true);
  _tdViewCurPage = target; // _tdSetScrollOffset ya lo habría puesto bien, pero por si acaso
  _tdUpdateViewPageNav();
  if(changed && announce) edToast('→ Página ' + (_tdViewCurPage + 1));
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
  if(page !== _tdViewCurPage) _tdScrollToViewPage(page, true);
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
// opts: {marginFrac o marginFracX/marginFracY, bodySize, h1Size, padTop,
// padBottom} — por defecto, los del cómic (Aplicar al lienzo); la vista en
// vivo del editor pasa dimensiones y padding REALES medidos del DOM (ver
// _tdRecomputeViewPagination) en vez de fracciones, para que el ajuste de
// línea coincida exactamente con lo que el navegador va a renderizar.
// marginFracX es el que el usuario puede cambiar desde "Márgenes" en el
// panel de propiedades (ver pp-td-margin/_tdReflowAfterMarginChange) — solo
// afecta al margen lateral, el vertical se mantiene siempre en su defecto.
function _tdLayoutPages(blocks, frameSizes, lineHeightMult, opts){
  const sizes = Array.isArray(frameSizes) ? frameSizes : [frameSizes];
  const lhMult = lineHeightMult || TD_LINE_MULT;
  const marginFracX = (opts && (opts.marginFracX ?? opts.marginFrac)) ?? TD_MARGIN_FRAC;
  const marginFracY = (opts && (opts.marginFracY ?? opts.marginFrac)) ?? TD_MARGIN_FRAC;
  const hasExplicitPad = !!(opts && (opts.padTop !== undefined || opts.padBottom !== undefined));
  const bodySizeDefault = (opts && opts.bodySize) || TD_BODY_SIZE;
  const h1SizeDefault = (opts && opts.h1Size) || TD_H1_SIZE;
  const ctx = _tdMeasureCtx;

  let frameIdx = 0, mx, my, textW, textH;
  function loadFrame(){
    const f = sizes[Math.min(frameIdx, sizes.length - 1)];
    mx = f.pw * marginFracX;
    textW = f.pw - mx * 2;
    if(hasExplicitPad){
      my = opts.padTop || 0;
      textH = f.ph - (opts.padTop || 0) - (opts.padBottom || 0);
    } else {
      my = f.ph * marginFracY;
      textH = f.ph - my * 2;
    }
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

// Marcador de "hoja exceptuada" (ver pp-td-except/_tdExceptCurrentPage): una
// capa oculta y sin texto visible, solo para recordar que esta hoja debe
// quedarse sin texto de ese flujo — ni al reeditar ni al reajustar por
// redimensionado/márgenes se le debe volver a poner contenido. Es una capa
// (no una propiedad de la página) para que viaje tal cual por el pipeline de
// panel_layers ya existente, sin necesitar cambios de esquema en Supabase.
function _tdMakeExceptMarker(flowId){
  const tl = new TextLayer('', 0.5, 0.5);
  tl.x = 0.5; tl.y = 0.5; tl.width = 0.02; tl.height = 0.02;
  tl.hidden = true;
  tl.bgOpacity = 0; tl.borderWidth = 0;
  tl._tdExceptFlow = flowId;
  return tl;
}

// Botón "Exceptuar en esta hoja" (panel de propiedades): quita el texto de la
// hoja actual y dispara el reflujo — el contenido que le correspondía pasa a
// la hoja siguiente del flujo (o crea una nueva si hiciera falta).
function _tdExceptCurrentPage(){
  const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
  if(!la || !la.richLines || !la.richLines.length) return;
  const flowId = _tdEnsureFlowId(la);
  const page = edPages[edCurrentPage];
  if(!page) return;

  page.layers = (page.layers || []).filter(l => l !== la);
  page.layers.push(_tdMakeExceptMarker(flowId));

  _tdReflowFlowInPlace(la, false);
  if(typeof edCloseOptionsPanel === 'function') edCloseOptionsPanel();
  // _tdReflowFlowInPlace() ya llamó a edFitCanvas(), pero con el panel de
  // propiedades todavía abierto (se cierra justo después, arriba) — mide el
  // hueco disponible leyendo el DOM en el momento en que se llama, así que
  // ajustaba la cámara al área más pequeña (con panel) y luego cerrar el
  // panel ya no la restauraba. Hace falta este segundo ajuste, ya con el
  // panel cerrado, para recuperar el tamaño completo de la cámara.
  if(typeof edFitCanvas === 'function') edFitCanvas();
  edToast('Hoja exceptuada — el texto ha pasado a la hoja siguiente');
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

  // Hojas del flujo: "slots" (tienen la capa de texto) y "huecos" (excluidos
  // a propósito con "Exceptuar en esta hoja" — capa marcadora _tdExceptFlow,
  // ver _tdMakeExceptMarker). Los huecos cuentan para saber dónde empieza y
  // termina el flujo en la obra, pero el reflujo nunca les pone contenido.
  const flowIdxs = [];
  const exceptIdxs = [];
  edPages.forEach((p, i) => {
    if((p.layers || []).some(l => l && l._tdFlowId === flowId)) flowIdxs.push(i);
    else if((p.layers || []).some(l => l && l._tdExceptFlow === flowId)) exceptIdxs.push(i);
  });
  flowIdxs.sort((a, b) => a - b);
  if(!flowIdxs.length){
    if(!exceptIdxs.length) return; // no queda nada de este flujo en la obra
    // Se acaba de exceptuar la única hoja que quedaba: crear una hoja nueva
    // justo después, con el contenido completo, usando su orientación como
    // referencia — si no, el texto desaparecería sin ir a ninguna parte.
    const afterIdx = Math.max(...exceptIdxs) + 1;
    const orient = edPages[Math.max(...exceptIdxs)].orientation || edOrientation;
    const sv = orient === 'vertical';
    const blocks0 = _tdParseBlocks(html);
    const { pages: pages0 } = _tdLayoutPages(
      blocks0, {pw: sv ? ED_PAGE_W : ED_PAGE_H, ph: sv ? ED_PAGE_H : ED_PAGE_W}, la.lineHeightMult,
      { marginFracX: la.marginXFrac || TD_MARGIN_FRAC, marginFracY: TD_MARGIN_FRAC }
    );
    const newPages0 = pages0.map(pageLines => ({
      layers: [_tdMakeTextLayer(pageLines, html, flowId, la.lineHeightMult, la.marginXFrac)],
      drawData: null, textLayerOpacity: 1, textMode: 'sequential', orientation: orient
    }));
    edPages.splice(afterIdx, 0, ...newPages0);
    if(typeof edFitCanvas === 'function') edFitCanvas(true);
    if(typeof edRedraw === 'function') edRedraw();
    if(typeof edPushHistory === 'function') edPushHistory(true);
    if(typeof _pgRender === 'function') _pgRender();
    return { firstIdx: afterIdx, count: newPages0.length, oldCount: 0 };
  }
  const spanIdxs = [...flowIdxs, ...exceptIdxs].sort((a, b) => a - b);
  const lastIdx = spanIdxs[spanIdxs.length - 1];
  const firstIdx = spanIdxs[0];

  const frames = flowIdxs.map(i => {
    const pg = edPages[i];
    const layer = pg.layers.find(l => l && l._tdFlowId === flowId);
    const orient = pg.orientation || edOrientation;
    const sv = orient === 'vertical';
    const pgPw = sv ? ED_PAGE_W : ED_PAGE_H, pgPh = sv ? ED_PAGE_H : ED_PAGE_W;
    return { pw: layer.width * pgPw, ph: layer.height * pgPh };
  });
  // Marco de reserva para páginas nuevas: página completa en la orientación
  // de la última hoja del tramo del flujo (slot o hueco) — mismo criterio
  // que "Aplicar al lienzo".
  const lastOrient = edPages[lastIdx].orientation || edOrientation;
  const svLast = lastOrient === 'vertical';
  frames.push({ pw: svLast ? ED_PAGE_W : ED_PAGE_H, ph: svLast ? ED_PAGE_H : ED_PAGE_W });

  const blocks = _tdParseBlocks(html);
  const { pages } = _tdLayoutPages(blocks, frames, la.lineHeightMult, { marginFracX: la.marginXFrac || TD_MARGIN_FRAC, marginFracY: TD_MARGIN_FRAC });

  const oldCount = flowIdxs.length;
  const reused = Math.min(pages.length, flowIdxs.length);
  const currentPageObj = edPages[edCurrentPage]; // referencia — para recolocar tras las mutaciones
  const wasCurrentInFlow = flowIdxs.includes(edCurrentPage) || exceptIdxs.includes(edCurrentPage);

  // 1) Slots reutilizados: mutar la MISMA capa in situ — conserva posición/
  //    tamaño/color/fondo/marco sin copiar nada y sin mover ninguna página
  //    (los huecos de en medio quedan exactamente donde estaban).
  for(let i = 0; i < reused; i++){
    const layer = edPages[flowIdxs[i]].layers.find(l => l && l._tdFlowId === flowId);
    layer.richLines = pages[i];
    layer.sourceHTML = html;
    layer.lineHeightMult = la.lineHeightMult;
    layer.marginXFrac = la.marginXFrac;
    layer.text = _tdPlainSummary(pages[i]);
  }

  // 2) Slots sobrantes (cupo en menos hojas): quitar, de mayor a menor índice.
  //    Objetos añadidos a mano en esas hojas se reubican en el último slot
  //    reutilizado (si lo hay) para no perderlos.
  for(let i = flowIdxs.length - 1; i >= reused; i--){
    const idx = flowIdxs[i];
    const pg = edPages[idx];
    const extras = (pg.layers || []).filter(l => !(l && l._tdFlowId === flowId));
    if(extras.length && reused > 0) edPages[flowIdxs[reused - 1]].layers.push(...extras);
    edPages.splice(idx, 1);
  }

  // 3) Si hacen falta más páginas, se añaden justo tras el final ACTUAL del
  //    tramo (slots + huecos) — recalculado ahora, no con el índice de antes
  //    de los cambios del paso 2.
  if(pages.length > reused){
    let insertAt = -1;
    edPages.forEach((p, i) => {
      if((p.layers || []).some(l => l && (l._tdFlowId === flowId || l._tdExceptFlow === flowId))) insertAt = i;
    });
    insertAt = insertAt + 1;
    const extraPages = pages.slice(reused).map(pageLines => ({
      layers: [_tdMakeTextLayer(pageLines, html, flowId, la.lineHeightMult, la.marginXFrac)],
      drawData: null, textLayerOpacity: 1, textMode: 'sequential', orientation: lastOrient
    }));
    edPages.splice(insertAt, 0, ...extraPages);
  }

  if(wasCurrentInFlow){
    const foundIdx = edPages.indexOf(currentPageObj);
    if(foundIdx >= 0){
      edCurrentPage = foundIdx;
    } else {
      // La hoja que se veía era un slot sobrante ya eliminado: ir a la
      // última hoja del flujo que quede.
      let fallback = -1;
      edPages.forEach((p, i) => { if((p.layers || []).some(l => l && l._tdFlowId === flowId)) fallback = i; });
      edCurrentPage = fallback >= 0 ? fallback : Math.max(0, Math.min(edPages.length - 1, firstIdx));
    }
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
  return { firstIdx, count: pages.length, oldCount };
}
