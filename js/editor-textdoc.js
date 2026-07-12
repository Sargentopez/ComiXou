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
// ── Tamaños de la obra al aplicar (los usa también la predicción de saltos
//    de página de la vista en vivo, ver _tdRecomputeViewPagination) ────────
const TD_MARGIN_FRAC   = 0.045;  // margen de página al APLICAR al lienzo (fracción del tamaño real de la hoja)
const TD_BODY_SIZE     = 22;     // cuerpo de texto al APLICAR al lienzo
const TD_H1_SIZE        = 34;     // título (heading1) al APLICAR al lienzo

// ── A4 del editor (solo el aspecto visual de la hoja mientras se escribe) ───
// El tamaño de letra y los márgenes con los que se ESCRIBE aquí son fijos
// (CSS de .td-editor/.td-page, formato A4 habitual) y no cambian. Dónde caen
// los saltos de página SÍ se predice con el tamaño real de la hoja actual
// (edPageW/edPageH) — ver _tdRecomputeViewPagination — para que las líneas
// discontinuas marquen el punto real en el que se cortará al aplicar.
const TD_A4_W = 794, TD_A4_H = 1123; // A4 a 96dpi — medida estándar en diseño web
const TD_A4_MARGIN_FRAC = 0.09;
const TD_A4_BODY_SIZE = 17, TD_A4_H1_SIZE = 27; // a juego con el CSS de .td-editor (1.05rem/1.55em)
const TD_LINE_MULT     = 1.42;   // interlineado por defecto ("Normal")
const TD_LINE_COMPACT  = 1.15;   // interlineado "Compacto" (mismo valor que ya tenía el desplegable)
const TD_LINE_AMPLIO   = 1.75;   // interlineado "Amplio" (ídem)
// Valor POR DEFECTO del documento/sesión actual — lo usan los párrafos que
// NO traen su propia etiqueta line-compact/line-amplio (ver _tdParseBlocks),
// y sirve de compatibilidad con obras guardadas antes de que el interlineado
// fuera por párrafo (editLayer.lineHeightMult, ver edOpenTextDoc). El ajuste
// por párrafo en sí vive en el propio HTML de Trix (atributo de bloque,
// igual que la alineación — ver _tdRegisterCustomTrixAttributes), no aquí.
let _tdLineHeightMult = TD_LINE_MULT;
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
  _tdCursorEverPlaced = false; // el cursor real todavía no se ha colocado en ESTE contenido
  const _tdSpacer = document.getElementById('tdSelTopSpacer');
  if(_tdSpacer) _tdSpacer.style.height = '0px'; // el hueco crecido en una sesión anterior no pinta nada aquí
  if(editLayer && editLayer.richLines && editLayer.sourceHTML){
    // Reeditar un texto ya aplicado: cargar su HTML de origen y recordar su flowId
    // para que "Aplicar" sustituya estas hojas en vez de añadir otras nuevas.
    // Capas de v32.70 (sin _tdFlowId): adoptar uno ahora, como flujo de una sola hoja.
    _tdEditingFlowId = _tdEnsureFlowId(editLayer);
    if(editorEl && editorEl.editor) editorEl.editor.loadHTML(editLayer.sourceHTML);
    if(applyBtn){ applyBtn.textContent = '💾'; applyBtn.title = 'Guardar cambios'; }
    _tdLineHeightMult = editLayer.lineHeightMult || TD_LINE_MULT;
    // El .filter(c => c > 0) es limpieza defensiva por si esta obra ya se
    // guardó con el salto inválido del bug de arriba (posición 0, sin
    // tirador dibujable) — así se corrige solo la próxima vez que se abra,
    // sin necesitar ninguna acción extra por parte de Alberto.
    _tdManualBreakChars = (editLayer.manualBreakChars || []).filter(c => c > 0).slice();
    _tdBreakHistory = [_tdManualBreakChars.slice()]; _tdBreakHistoryIdx = 0;
  } else {
    _tdEditingFlowId = null;
    if(applyBtn){ applyBtn.textContent = '💾'; applyBtn.title = 'Aplicar al lienzo'; }
    _tdLineHeightMult = TD_LINE_MULT;
    // Siempre en blanco al abrir desde el menú — no se restaura nada de
    // sesiones anteriores (el único texto editable es el que ya está
    // aplicado al lienzo, y a ese solo se llega con doble tap sobre él).
    if(editorEl && editorEl.editor) editorEl.editor.loadHTML('');
    _tdManualBreakChars = [];
    _tdBreakHistory = [[]]; _tdBreakHistoryIdx = 0;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _tdViewCurPage = 0;
    _tdCurrentOffset = 0;
    _tdAutoFollow = true;
    _tdActiveDragCancel?.();
    _tdSyncLineHeightMenuActive();
    _tdSyncFontMenuActive();
    _tdSyncAlignMenuActive();
    _tdPageBreakDragging = false;
    _tdLastPageBreakTapChars = null;
    _tdLastPageBreakTapTime = 0;
    const areaElInit = document.getElementById('tdPageArea');
    if(areaElInit) areaElInit.scrollTop = 0;
    _tdRecomputeViewPagination();
    // Reeditar: centrar la vista en el texto que había en la hoja concreta
    // desde la que se abrió el panel, no siempre al principio del documento.
    // La maquetación real de la hoja (al aplicar) y la de esta vista en vivo
    // (A4, mientras se escribe) son distintas, así que no se puede reutilizar
    // directamente la posición —
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
  // Si se está arrastrando (o corrigiendo) un salto de página en este
  // instante, abortarlo YA, antes de nada más — sus listeners viven en
  // document (no en el propio elemento) y solo se quitan al soltar
  // normalmente; cerrar el editor a media gesto nunca dispara ese soltar
  // de verdad, así que se quedarían escuchando para siempre, reaccionando
  // a cualquier toque futuro en cualquier parte de la app. Esto es lo que
  // coincidía con que el teclado se quedara sin cerrar.
  _tdActiveDragCancel?.();
  const shell = document.getElementById('tdShell');
  const wasOpen = !!shell && shell.style.display !== 'none' && shell.style.display !== '';
  const finishClose = () => {
    if(shell) shell.style.display = 'none';
    _tdEditingFlowId = null;
    const applyBtn = document.getElementById('tdApplyBtn');
    if(applyBtn){ applyBtn.textContent = '💾'; applyBtn.title = 'Aplicar al lienzo'; }
    // Si se cierra por la X o por "Aplicar" (no por el botón atrás), hay que
    // consumir la entrada de historial añadida al abrir — si no, el
    // siguiente "atrás" del usuario se quedaría "vacío" (solo cerraría un
    // shell ya cerrado).
    if(wasOpen && !fromPopstate && history.state && history.state.tdShellOpen){
      history.back();
      // Salvaguarda ante el bug reportado por Alberto (intermitente, causa
      // exacta no clara — sospecha: el cierre puede quedar diferido un
      // frame según si había que cerrar el teclado o no, y ese hueco puede
      // dejar el historial en un estado distinto al esperado): comprobar,
      // poco después de retroceder, que de verdad hemos vuelto al editor —
      // si no (p.ej. se ha ido más atrás de la cuenta, a la página del
      // autor), corregirlo forzando la vuelta al editor en vez de dejar al
      // usuario en una vista equivocada sin explicación.
      const _tdEditIdAtClose = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('cx_edit_id') : null;
      setTimeout(() => {
        if(!location.hash.startsWith('#editor') && _tdEditIdAtClose && typeof Router !== 'undefined'){
          Router.go('editor', { id: _tdEditIdAtClose });
        }
      }, 120);
    }
  };
  // El intento anterior (hide() + reenfocar) no cerraba el teclado de
  // verdad — hide() exige que el elemento CON EL FOCO en ese instante
  // preciso tenga la política manual, algo frágil de garantizar con un
  // elemento personalizado como <trix-editor>. En vez de depender de eso,
  // se revierte la política a la de siempre ("auto") y se hace un blur()
  // normal — el mecanismo de cierre de teclado más antiguo y probado que
  // existe en la web, el mismo que usa cualquier campo de texto corriente.
  // Un frame de por medio (requestAnimationFrame) entre fijar la política y
  // el blur real, para que el navegador registre el cambio como una
  // pérdida de foco genuina y no como un no-op sin efecto. Se restaura
  // "manual" enseguida para que la próxima vez que se toque el editor no
  // se abra solo (ver _tdTouchEnd).
  //
  // PERO: nada de esto debe hacerse si el teclado YA está colapsado (p.ej.
  // se cierra pulsando "Guardar cambios"/"Aplicar al lienzo", cuyo propio
  // clic nativo ya deja el foco en el botón, sin teclado — no hace falta
  // "ensure focus" para nada). Forzar aquí un focus() en ese caso reabre el
  // teclado que ya estaba cerrado (con la política recién puesta en "auto",
  // se muestra solo), y el blur() del frame siguiente no siempre conseguía
  // cerrarlo de nuevo — bug reportado: el teclado se quedaba abierto sin
  // poder cerrarse. boundingRect.height es la misma señal que ya se usa en
  // _tdShowKeyboardIfNeeded para saber si está mostrándose ahora mismo.
  let _tdKbCurrentlyShown = true; // sin la API, se asume que sí (comportamiento de siempre)
  try{
    if('virtualKeyboard' in navigator) _tdKbCurrentlyShown = (navigator.virtualKeyboard.boundingRect?.height || 0) > 0;
  }catch(_e){}
  const editorEl = (wasOpen && _tdKbCurrentlyShown) ? document.getElementById('tdEditor') : null;
  if(editorEl){
    try {
      editorEl.virtualKeyboardPolicy = 'auto';
      if(document.activeElement !== editorEl) editorEl.focus({preventScroll:true});
    } catch(_e){}
    requestAnimationFrame(() => {
      try {
        editorEl.blur();
        editorEl.virtualKeyboardPolicy = 'manual';
      } catch(_e){}
      finishClose();
    });
    return;
  }
  finishClose();
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
  document.getElementById('tdPageBreakBtn')?.addEventListener('click', _tdInsertPageBreakAtCursor);
  document.getElementById('tdDiagBtn')?.addEventListener('click', _tdRunDiag);
  const editorEl = document.getElementById('tdEditor');

  // Refuerzo del atributo HTML virtualkeyboardpolicy="manual" (ver views.js)
  // como propiedad JS también: <trix-editor> es un elemento personalizado que
  // activa su propio contenteditable en su ciclo de vida interno, así que no
  // hay garantía de que el navegador asocie el atributo estático al elemento
  // ya "editable" en el momento exacto que le corresponde — fijarlo aquí, ya
  // con Trix inicializado, es más fiable.
  if(editorEl){
    try { editorEl.virtualKeyboardPolicy = 'manual'; } catch(_e){}
  }

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

  // Estado de composición IME: Android (Gboard y similares) mantiene la
  // PALABRA que se está escribiendo como una "composición" activa hasta que
  // se confirma (espacio, puntuación, perder el foco) — esto es lo normal
  // para TODA escritura ahí, no solo para acentos con pulsación larga. Si
  // mientras tanto se desplaza o redimensiona #tdPageArea (el contenedor
  // del propio <trix-editor>) desde JS, Android puede cancelar esa
  // composición y el carácter que se estaba formando (p.ej. "á" al escribir
  // "más") se pierde por completo, dejando solo las letras ya confirmadas
  // ("ms"). _tdComposing evita que el recentrado automático y el reajuste
  // de alto por teclado toquen el scroll/tamaño mientras esto esté activo
  // (ver guards en _tdCenterActiveLine y _tdSyncViewportHeight) — patrón
  // estándar en editores enriquecidos (CKEditor, ProseMirror, Slate) para
  // convivir con el IME de Android.
  if(editorEl){
    editorEl.addEventListener('compositionstart', e => {
      _tdComposing = true;
      _tdLogIme('compositionstart', 'data=' + JSON.stringify(e.data));
    });
    editorEl.addEventListener('compositionupdate', e => {
      _tdLogIme('compositionupdate', 'data=' + JSON.stringify(e.data));
    });
    editorEl.addEventListener('compositionend', e => {
      _tdComposing = false;
      _tdLogIme('compositionend', 'data=' + JSON.stringify(e.data));
      // Al terminar, aplicar el reajuste/recentrado que se haya podido
      // saltar mientras estaba activa (mismo retardo que trix-change).
      clearTimeout(_tdRecomputeTimer);
      _tdRecomputeTimer = setTimeout(() => {
        if(typeof _tdSyncViewportHeight === 'function') _tdSyncViewportHeight();
        _tdRecomputeViewPagination();
        _tdCenterActiveLine();
      }, 220);
    });
    // 'input'/'beforeinput' no cambian ningún comportamiento (solo registran) —
    // sirven para ver si el navegador llegó a insertar el acento de verdad y
    // con qué inputType/datos, aunque compositionend no dispare o mienta (caso
    // documentado en Android Chrome: el dato de compositionend a veces no
    // refleja el texto realmente insertado).
    editorEl.addEventListener('beforeinput', e => {
      _tdLogIme('beforeinput', 'inputType=' + e.inputType + ' data=' + JSON.stringify(e.data) + ' isComposing=' + e.isComposing);
    });
    editorEl.addEventListener('input', e => {
      _tdLogIme('input', 'inputType=' + e.inputType + ' data=' + JSON.stringify(e.data) + ' isComposing=' + e.isComposing);
    });
  }

  // Listeners en fase de CAPTURA sobre document — se ejecutan ANTES que
  // cualquier otro (incluido el manejo interno del propio Trix), y en
  // capture aunque algo intermedio llame a stopPropagation() en fase de
  // burbuja no impide que estos disparen. Sirven para distinguir dos
  // posibilidades muy distintas cuando un acento se pierde sin dejar rastro
  // en los listeners normales de arriba: (a) el evento SÍ llega al DOM pero
  // algo antes de nuestro listener normal lo intercepta — solucionable desde
  // JS; o (b) no llega absolutamente nada ni siquiera aquí — entonces se
  // pierde a un nivel (SO/teclado/Chrome) que ningún JS de la página puede
  // interceptar ni arreglar. keydown con keyCode 229 o key:"Dead"/"Unidentified"
  // es la señal típica de "el IME está procesando esta tecla".
  if(editorEl && !window._tdCaptureLoggerBound){
    window._tdCaptureLoggerBound = true;
    document.addEventListener('beforeinput', e => {
      if(!editorEl.contains(e.target) && e.target !== editorEl) return;
      _tdLogIme('(CAPTURA) beforeinput', 'inputType=' + e.inputType + ' data=' + JSON.stringify(e.data));
    }, true);
    document.addEventListener('keydown', e => {
      if(!editorEl.contains(e.target) && e.target !== editorEl) return;
      _tdLogIme('(CAPTURA) keydown', 'key=' + e.key + ' keyCode=' + e.keyCode + ' isComposing=' + e.isComposing);
    }, true);
  }

  if(editorEl){
    editorEl.addEventListener('trix-change', () => {
      // Cambio real de texto: esto SÍ es "se está escribiendo" — reactiva
      // el seguimiento aunque un arrastre manual lo hubiera apagado antes.
      _tdAutoFollow = true;
      // Paginación en vivo: recalcular con retardo (evita rehacer el cálculo
      // en cada pulsación) y mantener centrada la línea que se está escribiendo.
      clearTimeout(_tdRecomputeTimer);
      _tdRecomputeTimer = setTimeout(() => {
        _tdRecomputeViewPagination();
        _tdCenterActiveLine();
      }, 220);
    });
    // Cada salto de línea (Enter) cuenta como una línea más hacia el cálculo
    // de dónde caerá el salto de página, aunque sea de una sola palabra — y
    // debe reflejarse enseguida, no solo tras la pausa general de arriba
    // (pensada para no recalcular en cada letra mientras se escribe seguido).
    editorEl.addEventListener('keydown', e => {
      if(e.key !== 'Enter') return;
      _tdAutoFollow = true;
      clearTimeout(_tdRecomputeTimer);
      _tdRecomputeTimer = setTimeout(() => {
        _tdRecomputeViewPagination();
        _tdCenterActiveLine();
      }, 30);
    });
    editorEl.addEventListener('trix-selection-change', () => {
      // loadHTML() (reeditar/abrir en blanco) NO dispara este evento por sí
      // solo — solo una interacción real (toque, clic, flechas) lo hace.
      // Por eso sirve para saber si el cursor ya está colocado de verdad en
      // ALGÚN sitio del texto actual, y no en el [0,0] interno que Trix deja
      // tras cargar el HTML sin que el usuario haya tocado nada todavía
      // (ver _tdInsertPageBreakAtCursor y el bug reportado por Alberto).
      _tdCursorEverPlaced = true;
      clearTimeout(_tdFollowTimer);
      _tdFollowTimer = setTimeout(_tdCenterActiveLine, 100);
      // rAF: el propio Android tarda un instante en decidir/mostrar su menú
      // nativo de selección (Copiar/Pegar) tras esta selección — se
      // comprueba en el frame siguiente para medir ya con la selección
      // asentada (ver _tdEnsureSelectionClearance).
      requestAnimationFrame(_tdEnsureSelectionClearance);
    });
    // Ctrl+Z/Ctrl+Y (o Cmd en Mac) para deshacer/rehacer SALTOS DE PÁGINA —
    // ver _tdBreakHistory. En fase de CAPTURA porque el propio Trix también
    // escucha Ctrl+Z en este mismo elemento (para deshacer texto) y, al
    // estar registrado antes que este listener, actuaría primero en fase de
    // burbuja — con esto se decide ANTES: si hay algo que deshacer de
    // saltos, se hace eso y se corta el paso con stopImmediatePropagation
    // (para que Trix no deshaga TAMBIÉN un cambio de texto con la misma
    // pulsación); si no hay nada de saltos pendiente, no se toca nada y
    // Trix sigue con su deshacer de texto normal, como siempre.
    editorEl.addEventListener('keydown', e => {
      const mod = e.ctrlKey || e.metaKey;
      if(!mod) return;
      const k = e.key.toLowerCase();
      const isUndo = k === 'z' && !e.shiftKey;
      const isRedo = k === 'y' || (k === 'z' && e.shiftKey);
      if(isUndo && _tdBreakHistoryIdx > 0){
        e.preventDefault(); e.stopImmediatePropagation();
        _tdUndoBreak();
        edToast('Salto de página restaurado');
      } else if(isRedo && _tdBreakHistoryIdx < _tdBreakHistory.length - 1){
        e.preventDefault(); e.stopImmediatePropagation();
        _tdRedoBreak();
        edToast('Salto de página rehecho');
      }
    }, true);
  }
  // Desplazamiento continuo: scroll nativo de #tdPageArea (rueda del ratón
  // en PC, arrastre táctil en móvil, ambos gestionados por el navegador sin
  // JS propio — ver el bloque de abajo). Los botones de flecha siguen
  // saltando a un límite de página exacto y animado (_tdScrollToViewPage);
  // mientras se escribe, en cambio, la línea activa se centra al milímetro,
  // no a saltos (ver _tdCenterActiveLine).
  const _tdArea = document.getElementById('tdPageArea');

  // Scroll NATIVO (#tdPageArea con overflow-y:auto, ver css/editor.css): el
  // navegador ya gestiona por su cuenta tanto arrastrar para desplazarse
  // como seleccionar texto (mantener pulsado, arrastrar los "handles") sin
  // que haga falta ninguna lógica propia para distinguirlos — ni rueda del
  // ratón (el scroll nativo ya responde a ella solo). Antes, #tdPageArea
  // tenía touch-action:none + un transform manejado a mano por JS, y eso
  // era justo lo que rompía la selección nativa: touch-action se hereda a
  // los descendientes, así que Trix nunca llegaba a recibir sus propios
  // gestos de selección. Lo ÚNICO que sigue haciendo falta decidir a mano
  // es si hay que ABRIR EL TECLADO: con <trix-editor virtualkeyboardpolicy=
  // "manual"> (ver views.js e inicio de esta función) el navegador ya no lo
  // abre solo al enfocar — se abre aquí, a propósito, solo si el toque NO
  // ha desplazado la hoja (comparando el scroll antes/después) NI ha
  // dejado una selección de texto (isCollapsed) — un toque para escribir,
  // y nada más.
  // Llamar navigator.virtualKeyboard.show() cuando el teclado YA está abierto
  // no debería hacer nada... pero es la única diferencia real entre este
  // editor y el resto de la app (el único sitio que usa virtualKeyboardPolicy
  // "manual" + la VirtualKeyboard API), y se estaba llamando en cada toque
  // para reposicionar el cursor dentro del texto — algo muy frecuente
  // mientras se escribe (ver _tdShowKeyboardIfNeeded, función de nivel de
  // módulo definida más abajo junto a _tdComposing/_tdLogIme, para que
  // también la use _tdWireFontControls).
  let _tdTouchStartScrollTop = 0;
  _tdArea?.addEventListener('touchstart', e => {
    if(e.touches.length !== 1) return; // 2 dedos: no interferir (zoom/pinch)
    _tdTouchStartScrollTop = _tdArea.scrollTop;
  }, {passive:true});
  const _tdTouchEnd = e => {
    // Un toque sobre el tirador/línea de un salto de página (arrastrarlo,
    // doble toque para borrarlo) no es "tocar el texto para escribir" —
    // pedido explícito de Alberto: solo colocar el cursor en el propio
    // texto debe abrir el teclado. Sin este filtro, el toque en el tirador
    // burbujea hasta aquí igual que cualquier otro, y la comprobación de
    // abajo (¿hay una selección colapsada dentro del editor?) suele seguir
    // dando "sí" por la selección "pegajosa" que ya vimos que mantiene Trix
    // de antes — aunque no se haya tocado el texto para nada.
    if(e.target && e.target.closest && e.target.closest('.td-pagebreak-line')) return;
    // Se desplazó de verdad (arrastre): a partir de aquí, hasta que se
    // vuelva a escribir, no se fuerza el recentrado — el usuario puede
    // estar leyendo otra parte de la obra. Universal, no depende de la
    // VirtualKeyboard API (eso solo hace falta para la decisión de abajo).
    const scrolled = Math.abs(_tdArea.scrollTop - _tdTouchStartScrollTop) > 2;
    if(scrolled) _tdAutoFollow = false;
    if(scrolled || e.type === 'touchcancel' || !('virtualKeyboard' in navigator)) return;
    // rAF: da tiempo a que el navegador termine de resolver dónde cae el
    // cursor (o la selección) tras el toque antes de comprobarlo.
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if(sel && sel.rangeCount > 0 && sel.isCollapsed && editorEl && editorEl.contains(sel.anchorNode)){
        _tdShowKeyboardIfNeeded('toque en el texto (tdTouchEnd)');
      }
    });
  };
  _tdArea?.addEventListener('touchend', _tdTouchEnd, {passive:true});
  _tdArea?.addEventListener('touchcancel', _tdTouchEnd, {passive:true});
  // Clic con RATÓN en el margen de la página (fuera del propio <trix-editor>,
  // p.ej. el fondo alrededor de la hoja) — con el dedo esto no hace falta:
  // el propio _tdTouchEnd de arriba decide cuándo mostrar/ocultar el teclado
  // según haya selección o no. Pero en PC, un clic fuera del elemento nunca
  // llega a Trix por ningún otro camino — y Trix guarda su selección de
  // forma expresa (para que la barra de herramientas siga actuando sobre
  // ella al perder el foco, ver _tdShowKeyboardIfNeeded/finishChoice), así
  // que sin esto seguía "recordando" indefinidamente la última selección
  // real aunque el usuario llevara rato con la vista puesta en otro sitio:
  // el siguiente cambio de fuente/tamaño/alineación/interlineado (pensado
  // para "sin selección = todo el documento", ver _tdApplyScoped) se
  // aplicaba por error solo a ese párrafo antiguo. Colapsarla aquí (al
  // final de lo que hubiera, no al principio: no hay una posición de texto
  // sensata "donde" se hizo clic, ya que el clic fue fuera del texto) es
  // la señal explícita que Trix necesita para dar la selección por
  // terminada — bug reportado por Alberto, reproducido en PC.
  _tdArea?.addEventListener('mousedown', e => {
    if(!editorEl || !editorEl.editor) return;
    if(editorEl.contains(e.target)) return; // clic dentro del propio texto — no tocar
    try{
      const editor = editorEl.editor;
      const range = editor.getSelectedRange();
      if(range && range[0] !== range[1]) editor.setSelectedRange([range[1], range[1]]);
    }catch(_e){}
  });
  // Rueda del ratón (PC): el scroll en sí ya lo hace el navegador solo (ver
  // arriba) — esto solo registra que fue un desplazamiento MANUAL, para lo
  // mismo que el arrastre táctil.
  _tdArea?.addEventListener('wheel', () => { _tdAutoFollow = false; }, {passive:true});

  // _tdCurrentOffset (y la página mostrada en la cabecera) al día cuando el
  // usuario desplaza directamente con el dedo o la rueda: eso ya no pasa
  // por _tdSetScrollOffset (que ahora solo se llama para los
  // desplazamientos programados — seguir el cursor, saltos de página).
  let _tdScrollSyncRaf = null;
  _tdArea?.addEventListener('scroll', () => {
    cancelAnimationFrame(_tdScrollSyncRaf);
    _tdScrollSyncRaf = requestAnimationFrame(() => _tdSyncPageNavFromOffset(_tdArea.scrollTop));
  }, {passive:true});

  // Botones de página: navegación explícita a una página concreta — igual
  // que arrastrar o la rueda, es el usuario pidiendo ver otra parte, así
  // que también apaga el seguimiento automático hasta que vuelva a escribir.
  document.getElementById('tdPagePrev')?.addEventListener('click', () => { _tdAutoFollow = false; _tdScrollToViewPage(_tdViewCurPage - 1); });
  document.getElementById('tdPageNext')?.addEventListener('click', () => { _tdAutoFollow = false; _tdScrollToViewPage(_tdViewCurPage + 1); });
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
    _tdAutoFollow = false;
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

  // Alto real del teclado bajo interactive-widget=overlays-content: con ese
  // modo el navegador NO encoge ningún viewport al abrirse el teclado (por
  // diseño — así el resto de la app, p.ej. los modales de login con 92dvh,
  // puede quedarse fijo en pantalla) — por eso los dos listeners de arriba
  // nunca disparan por culpa del teclado. _tdReadKeyboardH() (más abajo) es
  // quien de verdad mide el alto, combinando dos señales independientes
  // (VirtualKeyboard API y la variable de entorno CSS env(keyboard-inset-*)
  // ) por si alguna de las dos falla o se retrasa en un dispositivo
  // concreto — geometrychange aquí solo sirve de aviso para releer cuanto
  // antes, no como única fuente del número.
  if('virtualKeyboard' in navigator){
    try {
      navigator.virtualKeyboard.overlaysContent = true;
      navigator.virtualKeyboard.addEventListener('geometrychange', () => {
        clearTimeout(_tdKeyboardGeomTimer);
        _tdKeyboardGeomTimer = setTimeout(() => {
          if(typeof _tdSyncViewportHeight === 'function') _tdSyncViewportHeight();
        }, 100);
      });
    } catch(err) {
      // Contexto no seguro u otro motivo por el que la API rechace activarse
      // (no debería pasar en producción, siempre HTTPS/PWA): seguir sin ella.
    }
  }

  // Reabrir el teclado (p.ej. cerrarlo y volver a tocar el texto para seguir
  // escribiendo) también tiene que volver a centrar la línea activa. El
  // evento de foco llega ANTES de que el teclado termine de animarse (varía
  // bastante entre dispositivos), así que se reintenta varias veces con
  // distintos retardos en vez de una sola comprobación — más fiable que
  // fiarse de un único evento de la Visual Viewport en el momento justo.
  // Además, mientras el editor conserve el foco, se relee el alto del
  // teclado cada poco tiempo (red de seguridad adicional: si geometrychange
  // no llega a tiempo o con el valor definitivo en algún dispositivo, esto
  // lo corrige solo en menos de medio segundo, en vez de quedarse mal para
  // el resto de la sesión de escritura).
  document.addEventListener('focusin', e => {
    const editorEl = document.getElementById('tdEditor');
    const shell = document.getElementById('tdShell');
    if(!editorEl || !shell || shell.style.display === 'none' || shell.style.display === '') return;
    if(e.target !== editorEl && !editorEl.contains(e.target)) return;
    [50, 200, 400, 650].forEach(ms => setTimeout(() => {
      if(typeof _tdSyncViewportHeight === 'function') _tdSyncViewportHeight();
    }, ms));
    clearInterval(_tdKbPollTimer);
    _tdKbPollTimer = setInterval(() => {
      if(typeof _tdSyncViewportHeight === 'function') _tdSyncViewportHeight();
    }, 350);
  });
  document.addEventListener('focusout', e => {
    const editorEl = document.getElementById('tdEditor');
    if(!editorEl || (e.target !== editorEl && !editorEl.contains(e.target))) return;
    clearInterval(_tdKbPollTimer);
  });
}
let _tdViewportSyncTimer = null;
// Alto actual del teclado virtual en px — ver _tdReadKeyboardH(). Hace falta
// porque interactive-widget=overlays-content (meta viewport de index.html,
// deliberado para el fullscreen y los modales) hace que NI window.innerHeight
// NI window.visualViewport.height reflejen al teclado: bajo ese modo ambos se
// quedan midiendo la pantalla completa aunque el teclado esté abierto y
// tapando media hoja.
let _tdKeyboardH = 0;
// Último alto (px) realmente aplicado a #tdPageArea por _tdSyncViewportHeight —
// para poder saltar el resize/scroll en cuanto no haya cambio real (ver ahí).
let _tdLastSyncedAvailH = null;
let _tdKeyboardGeomTimer = null;
let _tdKbPollTimer = null;

// Mide el alto real del teclado combinando DOS señales independientes, por
// si una de las dos no llega a tiempo o falla en algún dispositivo concreto
// (esta API está documentada como poco fiable en la práctica — geometrías
// que tardan en asentarse, valores intermedios — así que apoyarse en una
// sola vía es arriesgado):
//   1) navigator.virtualKeyboard.boundingRect.height (VirtualKeyboard API)
//   2) env(keyboard-inset-height) leído vía un elemento de sonda invisible
//      (#tdKbProbe, ver views.js) cuyo alto CSS es exactamente esa variable
//      de entorno — el navegador la mantiene actualizada por su cuenta, sin
//      depender de que ningún evento JS dispare correctamente.
// Se toma la MAYOR de las dos: mejor pasarse un poco (línea con más aire por
// encima del teclado) que quedarse corto (línea tapada, el problema que se
// está arreglando).
function _tdReadKeyboardH(){
  let apiH = 0;
  if('virtualKeyboard' in navigator){
    try { apiH = navigator.virtualKeyboard.boundingRect.height || 0; } catch(_e){}
  }
  const probe = document.getElementById('tdKbProbe');
  const probeH = probe ? (probe.getBoundingClientRect().height || 0) : 0;
  return { apiH, probeH, used: Math.max(apiH, probeH) };
}

function _tdSyncViewportHeight(){
  // No tocar el tamaño del contenedor del editor mientras hay una
  // composición IME activa — ver _tdComposing. Se reintenta solo/a los
  // pocos ms tras compositionend (sondeo periódico o el propio handler).
  if(_tdComposing) return;
  const shell = document.getElementById('tdShell');
  const pageArea = document.getElementById('tdPageArea');
  if(!shell || shell.style.display === 'none' || shell.style.display === '' || !pageArea) return;
  const vv = window.visualViewport;
  if(!vv) return;
  // Se fija el alto de #tdPageArea DIRECTAMENTE (no el del shell completo):
  // depender de que #tdShell se encoja y eso se propague correctamente por
  // el flexbox/porcentajes hasta la hoja resultó poco fiable — fijar aquí
  // mismo el elemento que realmente tiene que encogerse es más directo y no
  // depende de que ese encadenado de tamaños funcione en todos los navegadores.
  const topbar = document.getElementById('tdTopbar');
  const menuBar = document.getElementById('tdMenuBar');
  const chromeH = (topbar?.getBoundingClientRect().height || 0)
                + (menuBar?.getBoundingClientRect().height || 0);
  // Alto real visible menos la cabecera/barras y el teclado virtual: lo que
  // queda para la hoja. vv.height por sí solo NO refleja al teclado bajo
  // interactive-widget=overlays-content — de ahí que haya que restarlo
  // aparte, releyéndolo siempre fresco (no fiarse de un valor cacheado de
  // cuando disparó tal o cual evento).
  const kb = _tdReadKeyboardH();
  _tdKeyboardH = kb.used;
  const availH = Math.max(120, Math.round(vv.height - chromeH - _tdKeyboardH));
  // Si no ha cambiado nada de verdad, no tocar #tdPageArea en absoluto — ni su
  // alto ni (en cascada) el scroll. Antes se reaplicaba SIEMPRE, cambiara algo
  // o no, cada ~350ms mientras el editor tuviera el foco (sondeo periódico) —
  // eso significa tocar el contenedor del <trix-editor> aunque el usuario no
  // esté haciendo nada más que sostener una tecla para elegir un acento; en
  // Android eso puede bastar para que el sistema deje caer ese carácter sin
  // que llegue a disparar ni un solo evento de composición (por eso _tdComposing,
  // que depende de compositionstart/end, no basta por sí solo: hay teclados/
  // configuraciones en los que Android nunca llega a usar composición y
  // confirma cada letra al instante — confirmado con el registro del botón 🩺).
  if(_tdLastSyncedAvailH !== null && Math.abs(availH - _tdLastSyncedAvailH) < 1){
    window._tdSyncSkipCount = (window._tdSyncSkipCount || 0) + 1;
    return;
  }
  window._tdSyncApplyCount = (window._tdSyncApplyCount || 0) + 1;
  _tdLastSyncedAvailH = availH;
  pageArea.style.flex = 'none';
  pageArea.style.height = availH + 'px';
  // La página cambia de tamaño — recalcular la paginación en vivo (con
  // retardo corto: el teclado tarda un poco en terminar de animarse).
  clearTimeout(_tdViewportSyncTimer);
  _tdViewportSyncTimer = setTimeout(() => { _tdRecomputeViewPagination(); _tdCenterActiveLine(); }, 120);
}
let _tdFollowTimer = null;
// Solo se sigue el cursor (recentrado automático) MIENTRAS SE ESCRIBE de
// verdad — no todo el rato solo porque el editor tenga el foco. Se
// enciende en cada cambio real de texto (trix-change: pedido explícito,
// "detectarse cuando se empieza a escribir") y se apaga en cuanto se
// detecta un desplazamiento manual (arrastre, rueda, flechas de página) —
// así, si el usuario quiere leer otra parte de la obra mientras el editor
// sigue abierto, el recentrado no se lo impide ni se lo deshace a los
// pocos cientos de ms (el sondeo periódico de _tdKbPollTimer, pensado solo
// para el alto del teclado, también pasa por _tdCenterActiveLine — sin
// este freno, recentraba de fondo aunque el usuario no estuviera tecleando).
let _tdAutoFollow = true;

// true mientras Android tiene una composición IME activa (ver listeners
// compositionstart/compositionend en _tdInitOnce). Consultada por
// _tdCenterActiveLine y _tdSyncViewportHeight para no tocar scroll/tamaño
// del contenedor del editor mientras tanto.
let _tdComposing = false;

// ── Diagnóstico temporal de acentos/IME (botón 🩺 tdDiagBtn, ver views.js) ──
// Guarda un historial reciente de eventos de composición/entrada — así se ve
// la secuencia EXACTA que dispara Android al fallar un acento, en vez de
// depender de que Alberto la describa de memoria. Petición explícita de
// Alberto: "pon un icono en el editor de textos para diagnóstico, mira cómo
// se hace en otros diagnósticos ocultos como comentarios" (mismo patrón que
// _edRunDiag en editor.js / botón 🩺 edDiagBtn).
window._tdImeLog = window._tdImeLog || [];
function _tdLogIme(kind, detail){
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0'), mm = String(t.getMinutes()).padStart(2, '0'),
        ss = String(t.getSeconds()).padStart(2, '0'), ms = String(t.getMilliseconds()).padStart(3, '0');
  window._tdImeLog.push(`${hh}:${mm}:${ss}.${ms}  ${kind}  ${detail || ''}`);
  if(window._tdImeLog.length > 300) window._tdImeLog.shift();
}

// Llamar navigator.virtualKeyboard.show() cuando el teclado YA está abierto
// no debería hacer nada... pero es la única diferencia real entre este
// editor y el resto de la app (el único sitio que usa virtualKeyboardPolicy
// "manual" + la VirtualKeyboard API), y se estaba llamando en cada toque
// para reposicionar el cursor dentro del texto — algo muy frecuente
// mientras se escribe. Igual que con _tdSyncViewportHeight, se evita
// llamarla si ya sabemos que está abierta (boundingRect con alto > 0);
// además queda registrado en el diagnóstico (🩺) para poder ver si
// coincide con el instante exacto de un acento fallido. Nivel de módulo
// (no anidada dentro de _tdInitOnce) para que también pueda llamarla
// _tdWireFontControls (finishChoice), que es una función hermana, no hija.
function _tdShowKeyboardIfNeeded(reason){
  if(!('virtualKeyboard' in navigator)) return;
  let h = 0;
  try{ h = navigator.virtualKeyboard.boundingRect?.height || 0; }catch(_e){}
  if(h > 0){
    _tdLogIme('mostrar teclado OMITIDO', reason + ' — ya estaba abierto (boundingRect.height=' + h + ')');
    return;
  }
  const editorEl = document.getElementById('tdEditor');
  if(!editorEl) return;
  // EXPERIMENTO: en vez de navigator.virtualKeyboard.show() (API más nueva,
  // con varios bugs documentados en Chromium a día de hoy — ver conversación
  // con Alberto), se usa el mecanismo más antiguo y sencillo del que ya hay
  // prueba de que funciona bien con acentos: virtualKeyboardPolicy="auto" +
  // un enfoque real muestra el teclado solo, igual que en cualquier <input>
  // normal del resto de la app (confirmado que ahí los acentos van bien).
  // Blur()+focus() (no basta reenfocar el mismo elemento ya enfocado) para
  // que se dispare de verdad el "nuevo enfoque" que activa el auto-show —
  // efecto secundario aceptado: un parpadeo brevísimo del cursor/selección.
  // Se vuelve a "manual" enseguida para que el SIGUIENTE enfoque (arrastrar,
  // seleccionar) no muestre el teclado solo otra vez.
  _tdLogIme('mostrar teclado (vía policy=auto, no show())', reason);
  editorEl.blur();
  requestAnimationFrame(() => {
    editorEl.virtualKeyboardPolicy = 'auto';
    editorEl.focus();
    setTimeout(() => { editorEl.virtualKeyboardPolicy = 'manual'; }, 80);
  });
}

// Registro de cada intento de "Aplicar al lienzo" (botón 🩺 tdDiagBtn) — qué
// HTML se leyó, cuántos bloques/con qué alineación salieron de _tdParseBlocks,
// y por qué rama terminó la función (éxito, "sin contenido", flujo no
// encontrado, excepción...). Petición explícita de Alberto tras detectar que
// "Aplicar al lienzo" no hacía nada con un párrafo alineado de más de una línea.
window._tdApplyLog = window._tdApplyLog || [];
function _tdLogApply(kind, detail){
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0'), mm = String(t.getMinutes()).padStart(2, '0'),
        ss = String(t.getSeconds()).padStart(2, '0'), ms = String(t.getMilliseconds()).padStart(3, '0');
  window._tdApplyLog.push(`${hh}:${mm}:${ss}.${ms}  ${kind}  ${detail || ''}`);
  if(window._tdApplyLog.length > 100) window._tdApplyLog.shift();
}
async function _tdRunDiag(){
  const lines = [];
  const L = s => lines.push(s);
  L('══ DIAGNÓSTICO EDITOR DE TEXTOS — acentos/IME ══');
  L(new Date().toLocaleString());

  // Versión REALMENTE en ejecución ahora mismo (footer) y estado de caché/SW —
  // primera sospecha si "sigue roto tras recargar": que no se esté ejecutando
  // de verdad el JS nuevo (SW en espera sin activar, o la app ni siquiera se
  // recargó del todo — en Android, volver a abrir el icono de una PWA a veces
  // solo reactiva el proceso en segundo plano en vez de recargar la página).
  let _tdDiagVersion = document.querySelector('.app-version')?.textContent || '?';
  if(_tdDiagVersion === '?'){
    // El footer .app-version pertenece a otra vista (biblioteca) y no está en
    // el DOM al ejecutar el diagnóstico desde dentro del Editor de textos —
    // mismo fallback que usa _edRunDiag: el nombre de caché del Service Worker.
    try{
      const _cacheNamesV = await caches.keys();
      const _vCache = _cacheNamesV.find(n => /^comixow-v\d+-\d+$/.test(n));
      if(_vCache) _tdDiagVersion = _vCache.replace('comixow-v', 'v').replace(/-(\d+)$/, '.$1') + ' (por SW cache)';
    }catch(_e){}
  }
  L('Versión: ' + _tdDiagVersion);
  try{
    const cacheNames = await caches.keys();
    L('Cachés existentes: ' + (cacheNames.length ? cacheNames.join(', ') : '(ninguna)'));
  }catch(e){ L('Error leyendo cachés: ' + e.message); }
  try{
    if('serviceWorker' in navigator){
      const reg = await navigator.serviceWorker.getRegistration();
      L('Service Worker registrado: ' + (reg ? 'sí' : 'NO'));
      if(reg){
        L('  installing: ' + (reg.installing ? reg.installing.scriptURL : '—'));
        L('  waiting: ' + (reg.waiting ? reg.waiting.scriptURL + '  ⚠️ HAY UN SW EN ESPERA SIN ACTIVAR (JS viejo aún en uso)' : '—'));
        L('  active: ' + (reg.active ? reg.active.scriptURL : '—'));
      }
      L('  controlando esta página ahora mismo: ' + (navigator.serviceWorker.controller ? 'sí' : 'NO'));
    } else {
      L('serviceWorker no soportado en este navegador');
    }
  }catch(e){ L('Error leyendo Service Worker: ' + e.message); }
  L('User agent: ' + navigator.userAgent);

  // Estado del editor de textos ahora mismo
  const editorEl = document.getElementById('tdEditor');
  L('');
  L('── Estado del editor ahora mismo ──');
  L('tdEditor existe: ' + (editorEl ? 'sí' : 'NO'));
  if(editorEl){
    L('virtualKeyboardPolicy: ' + editorEl.virtualKeyboardPolicy);
    L('contentEditable: ' + editorEl.contentEditable);
    L('tiene el foco ahora mismo: ' + (document.activeElement === editorEl));
  }
  L('_tdComposing ahora mismo: ' + _tdComposing);
  L('_tdSyncViewportHeight — aplicado: ' + (window._tdSyncApplyCount || 0) + ' | saltado por no haber cambio real: ' + (window._tdSyncSkipCount || 0));
  L('virtualKeyboard API disponible: ' + ('virtualKeyboard' in navigator));
  if('virtualKeyboard' in navigator){
    try{
      L('  overlaysContent: ' + navigator.virtualKeyboard.overlaysContent);
      const r = navigator.virtualKeyboard.boundingRect;
      L('  boundingRect: ' + (r ? `${Math.round(r.width)}×${Math.round(r.height)}` : '—'));
    }catch(e){ L('  Error leyendo virtualKeyboard: ' + e.message); }
  }

  L('');
  L('── Historial de eventos de composición/entrada/teclado (' + (window._tdImeLog || []).length + ') ──');
  L('(secuencia normal: compositionstart → compositionupdate* → input → compositionend;');
  L(' si falta compositionend tras un compositionstart, o si el "input" que va justo');
  L(' antes de compositionend no trae el acento en su "data", esa es la pista clave.');
  L(' También incluye cada llamada a virtualKeyboard.show(), y una copia en fase de');
  L(' CAPTURA de beforeinput/keydown (se ejecuta antes que cualquier otra cosa,');
  L(' incluido Trix) — si un acento falla y NO aparece ni siquiera como "(CAPTURA)",');
  L(' significa que no llega nada al DOM: se pierde en el sistema/teclado, no en');
  L(' nuestro JS. Si SÍ aparece en captura pero no en los listeners normales de');
  L(' abajo, algo intermedio lo está interceptando y sí sería arreglable)');
  if((window._tdImeLog || []).length) window._tdImeLog.forEach(l => L(l));
  else L('(vacío — no se ha escrito nada en el editor todavía en esta carga de página)');

  L('');
  L('── Historial de "Aplicar al lienzo" (' + (window._tdApplyLog || []).length + ') ──');
  L('("SALIDA: sin contenido" = _tdParseBlocks no encontró texto real en ningún');
  L(' bloque — la causa más típica es que se perdiera al recorrer el HTML, p.ej.');
  L(' un párrafo alineado con más de una línea)');
  if((window._tdApplyLog || []).length) window._tdApplyLog.forEach(l => L(l));
  else L('(vacío — no se ha pulsado "Aplicar al lienzo" todavía en esta carga de página)');

  // Mostrar panel — mismo patrón visual que _edRunDiag (editor.js, botón 🩺 edDiagBtn)
  let p = document.getElementById('_tdDiagPanel');
  if(!p){
    p = document.createElement('div');
    p.id = '_tdDiagPanel';
    p.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;color:#0f0;font:11px monospace;display:flex;flex-direction:column;padding:8px;';
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:6px;flex-shrink:0';
    hdr.innerHTML = '<b style="color:#fff">DIAGNÓSTICO ACENTOS/IME</b>';
    const btns = document.createElement('div');
    const cp = document.createElement('button');
    cp.textContent = '📋 Copiar'; cp.style.cssText = 'padding:2px 8px;cursor:pointer;margin-right:4px;';
    cp.onclick = () => { const ta = document.getElementById('_tdDiagTa'); ta.select(); document.execCommand('copy'); cp.textContent = '✓'; };
    const cl = document.createElement('button');
    cl.textContent = '✕'; cl.style.cssText = 'padding:2px 8px;cursor:pointer;';
    cl.onclick = () => p.remove();
    btns.append(cp, cl); hdr.appendChild(btns); p.appendChild(hdr);
    const ta = document.createElement('textarea');
    ta.id = '_tdDiagTa';
    ta.style.cssText = 'flex:1;width:100%;background:#111;color:#0f0;border:none;font:11px monospace;padding:4px;box-sizing:border-box;resize:none;';
    ta.readOnly = true; p.appendChild(ta);
    document.body.appendChild(p);
  }
  document.getElementById('_tdDiagTa').value = lines.join('\n');
}

// Mientras se arrastra un salto de página, ninguna llamada EXTERNA a
// _tdRecomputeViewPagination() debe reconstruir las líneas (ver esa
// función) — el mismo sondeo periódico de arriba (_tdKbPollTimer, cada
// 350ms mientras el editor tiene el foco, que sigue activo aunque ahora
// mismo se esté arrastrando un salto con el ratón/dedo, no escribiendo)
// destruía el elemento que se arrastra a medio gesto y lo sustituía por
// uno nuevo en su posición ORIGINAL — como el arrastre en sí escucha en
// document (no en el propio elemento), seguía "funcionando" de forma
// invisible sobre el elemento ya desconectado del DOM, y al soltar volvía
// a reconstruir, esta vez sí en el punto final: de ahí el salto en tres
// tiempos (sigue al ratón → vuelve a su sitio original → salta al final).
// Ver _tdWirePageBreakDrag.
let _tdPageBreakDragging = false;

// Función para ABORTAR el arrastre de salto de página actualmente en curso
// (si lo hay), sin aplicar ningún cambio — null si no hay ninguno activo.
// Necesaria porque los listeners del arrastre están en document (no en el
// propio elemento) y solo se quitan dentro de onUp: si el editor se cierra
// a media gesto (el shell se oculta, pero nunca llega un pointerup/
// pointercancel de verdad para ese puntero), esos listeners se quedarían
// escuchando en document PARA SIEMPRE, reaccionando a cualquier toque
// futuro en cualquier parte de la app — de ahí que "se bloqueara el drag"
// coincidiera con que "el teclado no se cerraba": ver edCloseTextDoc,
// donde se llama a esto antes de nada.
let _tdActiveDragCancel = null;

// Doble toque/doble clic sobre la zona de arrastre de un salto de página:
// lo elimina (ver _tdWirePageBreakDrag). Se guarda a nivel de MÓDULO,
// identificando el salto por su carácter (_tdManualBreakChars, estable) y
// no por el elemento DOM concreto — un simple toque, aunque no llegue a
// moverse nada, ya dispara onUp → _tdRecomputeViewPagination(), que
// reconstruye TODAS las líneas; el segundo toque de un doble-toque cae
// siempre sobre un elemento nuevo (recién creado por esa reconstrucción),
// así que un cronómetro guardado en el propio elemento nunca vería el
// segundo toque.
let _tdLastPageBreakTapChars = null;
let _tdLastPageBreakTapTime = 0;

// Tamaños/fuentes admitidos al pegar contenido externo — mismo rango que los
// controles del editor (ver dd-tdFontFamily/dd-tdFontSize en views.js), para
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
// Ya NO son <select> nativos — son menús desplegables con submenú y checkeo,
// mismo patrón que "Insertar ▾"/"Dibujar ▾" del editor general
// (edToggleMenu/edCloseMenus, reutilizadas tal cual — son genéricas, operan
// por [data-menu]/#dd-<id>, no conocen nada específico del editor general).
// Truco "frozen" (documentado por la propia comunidad de Trix): al tocar el
// botón se activa el atributo invisible "frozen" para que la selección de
// texto siga viéndose resaltada mientras el foco se va del editor al menú.
function _tdWireFontControls(){
  const editorEl = document.getElementById('tdEditor');
  const famBtn   = document.querySelector('[data-menu="tdFontFamily"]');
  const sizeBtn  = document.querySelector('[data-menu="tdFontSize"]');
  const lhBtn    = document.querySelector('[data-menu="tdLineHeight"]');
  const alignBtn = document.querySelector('[data-menu="tdAlign"]');
  if(!editorEl || !famBtn || !sizeBtn || !lhBtn || !alignBtn) return;

  const freeze = () => { try{ editorEl.editor?.activateAttribute('frozen'); }catch(_e){} };
  const unfreeze = () => { try{ editorEl.editor?.deactivateAttribute('frozen'); }catch(_e){} };
  famBtn.addEventListener('pointerdown', freeze);
  sizeBtn.addEventListener('pointerdown', freeze);
  alignBtn.addEventListener('pointerdown', freeze);

  const finishChoice = () => {
    unfreeze();
    if(typeof edCloseMenus === 'function') edCloseMenus();
    // NO se reabre el teclado aquí a propósito (antes llamaba a
    // _tdShowKeyboardIfNeeded) — coherente con el resto de la app: el
    // teclado solo se muestra con un toque deliberado en el propio texto
    // (ver _tdTouchEnd), nunca solo. Además, el ciclo blur()+focus() que
    // eso conllevaba parecía interferir en Android con que el cambio recién
    // elegido (p.ej. interlineado) quedara bien reflejado al aplicar al
    // lienzo justo después — bugs reportados por Alberto. Un focus() liso,
    // sin tocar virtualKeyboardPolicy, no muestra el teclado (sigue en
    // "manual"), así que basta para mantener el cursor/selección visibles.
    editorEl.focus();
  };

  // Si hay texto seleccionado, fuente/tamaño/alineación deben afectar SOLO a
  // esa selección (ya es así de por sí en Trix). Si NO hay selección
  // (cursor colapsado), pedido explícito de Alberto: en vez de que fuente/
  // tamaño se queden como "atributo para lo próximo que se escriba" y
  // alineación afecte solo al párrafo del cursor, se aplica a TODO el
  // documento. Se selecciona todo momentáneamente, se aplica el cambio (fn)
  // y se restaura la posición de cursor original — todo síncrono, así que
  // no llega a pintarse ningún parpadeo de "todo seleccionado" en pantalla.
  function _tdApplyScoped(fn){
    const editor = editorEl.editor;
    if(!editor){ fn(); return; }
    const range = editor.getSelectedRange();
    if(range && range[0] === range[1]){
      const len = editor.getDocument().toString().length;
      if(len > 0){
        editor.setSelectedRange([0, len]);
        try{ fn(); } finally { editor.setSelectedRange(range); }
        return;
      }
    }
    fn();
  }

  // CRÍTICO — por qué estos 4 desplegables van por "pointerdown" y no por
  // "click": Trix engancha su propia barra de herramientas NATIVA también a
  // "mousedown", nunca a "click" (ver ToolbarController dentro de
  // trix.umd.min.js: didClickAttributeButton/didClickActionButton están
  // registrados con "mousedown"). La razón es que un <button> normal mueve
  // el foco del navegador en cuanto se pulsa, ANTES de que llegue el evento
  // "click" — para ese momento el <trix-editor> ya ha perdido el foco/la
  // selección real. Para un atributo de TEXTO (fuente/tamaño) eso se
  // disimula porque con el cursor sin selección Trix cae al mecanismo de
  // "atributos para lo próximo que se escriba"; pero un atributo de BLOQUE
  // como la alineación depende de resolver el párrafo actual (getBlock())
  // sobre una selección todavía válida en ese instante — con el foco ya
  // perdido, se aplicaba a la posición equivocada o no se aplicaba en
  // absoluto (bug reportado: "las alineaciones no se aplican"). Usando
  // "pointerdown" + preventDefault(), igual que el propio Trix, el
  // navegador nunca llega a mover el foco fuera del editor.
  document.querySelectorAll('#dd-tdFontFamily .ed-dropdown-item').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      _tdApplyScoped(() => {
        try{ editorEl.editor?.activateAttribute('fontFamily', btn.dataset.value); }catch(_e){}
      });
      finishChoice();
      _tdSyncFontMenuActive();
    });
  });
  document.querySelectorAll('#dd-tdFontSize .ed-dropdown-item').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      _tdApplyScoped(() => {
        try{ editorEl.editor?.activateAttribute('fontSize', btn.dataset.value); }catch(_e){}
      });
      finishChoice();
      _tdSyncFontMenuActive();
    });
  });

  // Interlineado: pedido explícito de Alberto — debe comportarse igual que
  // alineación (por párrafo, y con selección vs. todo el documento vía
  // _tdApplyScoped), así que ahora es un atributo de BLOQUE de Trix
  // (lineCompact/lineAmplio, ver _tdRegisterCustomTrixAttributes) en vez de
  // la variable global única _tdLineHeightMult de antes. "Normal" es la
  // ausencia de ambas, igual que "A la izquierda" en alineación.
  document.querySelectorAll('#dd-tdLineHeight .ed-dropdown-item').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      const value = btn.dataset.value; // lineCompact | lineNormal | lineAmplio
      _tdApplyScoped(() => {
        const editor = editorEl.editor;
        if(!editor) return;
        // Reafirmar el rango antes de cada llamada — mismo motivo que en
        // alineación: deactivateAttribute no restaura la selección cuando
        // quita algo real (ver comentario detallado en el desplegable de
        // alineación, más abajo).
        const targetRange = editor.getSelectedRange();
        ['lineCompact', 'lineAmplio'].forEach(a => {
          try{
            if(targetRange) editor.setSelectedRange(targetRange);
            editor.deactivateAttribute(a);
          }catch(_e){}
        });
        if(value !== 'lineNormal'){
          try{
            if(targetRange) editor.setSelectedRange(targetRange);
            editor.activateAttribute(value);
          }catch(_e){}
        }
      });
      finishChoice();
      _tdSyncLineHeightMenuActive();
      _tdRecomputeViewPagination();
    });
  });

  // Alineación: atributo de BLOQUE (como título/cita), no de texto — actúa
  // sobre el párrafo donde esté el cursor con solo tenerlo colocado ahí, sin
  // necesitar una selección activa. La exclusividad entre las 4 opciones se
  // hace a mano (ver _tdRegisterCustomTrixAttributes: no se usa la opción
  // "exclusive" de Trix porque esa quita CUALQUIER otro atributo de bloque,
  // no solo los de alineación). "A la izquierda" es quitar las otras tres
  // sin poner nada — es como se comporta el texto sin marcar ninguna.
  document.querySelectorAll('#dd-tdAlign .ed-dropdown-item').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      const value = btn.dataset.value; // alignLeft | alignCenter | alignRight | alignJustify
      _tdApplyScoped(() => {
        const editor = editorEl.editor;
        if(!editor) return;
        // Reafirmar el rango objetivo antes de CADA llamada: deactivateAttribute,
        // a diferencia de activateAttribute, NO restaura la selección cuando
        // de verdad quita algo (la colapsa) — sin esto, en cuanto una de las
        // tres desactivaciones quitaba una alineación real, las llamadas
        // siguientes de esta misma secuencia actuaban sobre la posición
        // equivocada (reproducido y confirmado con Trix real antes de
        // aplicar este fix: solo se veía afectado el primer párrafo).
        const targetRange = editor.getSelectedRange();
        ['alignCenter', 'alignRight', 'alignJustify'].forEach(a => {
          try{
            if(targetRange) editor.setSelectedRange(targetRange);
            editor.deactivateAttribute(a);
          }catch(_e){}
        });
        if(value !== 'alignLeft'){
          try{
            if(targetRange) editor.setSelectedRange(targetRange);
            editor.activateAttribute(value);
          }catch(_e){}
        }
      });
      finishChoice();
      _tdSyncAlignMenuActive();
    });
  });

  // Reflejar en el checkeo (✓ + fondo) los valores activos en la posición
  // actual del cursor — se actualiza en cada cambio de selección, esté el
  // menú abierto o no, para que ya esté correcto la próxima vez que se
  // abra (los desplegables, cerrados, no se ven — no hace falta esperar a
  // que se abran para refrescarlo). Interlineado TAMBIÉN depende del cursor
  // ahora que es un atributo de bloque por párrafo (como alineación), no un
  // ajuste global — se sincroniza aquí igual que los otros tres.
  editorEl.addEventListener('trix-selection-change', () => {
    _tdSyncFontMenuActive();
    _tdSyncAlignMenuActive();
    _tdSyncLineHeightMenuActive();
  });
  _tdSyncFontMenuActive();
  _tdSyncAlignMenuActive();
  _tdSyncLineHeightMenuActive();
}

// Marca con ✓ (y fondo, vía .ed-dropdown-item.active) la fuente/tamaño que
// corresponden a la posición actual del cursor — 'Lora'/'22px' son los
// valores por defecto del documento si el punto del cursor no tiene
// ninguno de los dos atributos explícito.
function _tdSyncFontMenuActive(){
  const editorEl = document.getElementById('tdEditor');
  if(!editorEl || !editorEl.editor) return;
  let fs = '22px', ff = 'Lora';
  try{
    const range = editorEl.editor.getSelectedRange();
    const piece = editorEl.editor.getDocument().getPieceAtPosition(range[0]);
    const pfs = piece && piece.getAttribute && piece.getAttribute('fontSize');
    const pff = piece && piece.getAttribute && piece.getAttribute('fontFamily');
    if(pfs) fs = pfs;
    if(pff) ff = pff;
  }catch(_e){}
  document.querySelectorAll('#dd-tdFontFamily .ed-dropdown-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === ff);
  });
  document.querySelectorAll('#dd-tdFontSize .ed-dropdown-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === fs);
  });
}

// Marca con ✓ (y fondo) la alineación activa en la posición actual del
// cursor — atributo de BLOQUE, así que se consulta con attributeIsActive
// (no hace falta recorrer piezas de texto como con fuente/tamaño: eso es
// solo para atributos de texto con valor).
function _tdSyncAlignMenuActive(){
  const editorEl = document.getElementById('tdEditor');
  if(!editorEl || !editorEl.editor) return;
  let active = 'alignLeft';
  try{
    const editor = editorEl.editor;
    if(editor.attributeIsActive('alignCenter')) active = 'alignCenter';
    else if(editor.attributeIsActive('alignRight')) active = 'alignRight';
    else if(editor.attributeIsActive('alignJustify')) active = 'alignJustify';
  }catch(_e){}
  document.querySelectorAll('#dd-tdAlign .ed-dropdown-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === active);
  });
}

// Marca con ✓ (y fondo) el interlineado activo en la posición actual del
// cursor — atributo de BLOQUE (igual que alineación), se consulta con
// attributeIsActive.
function _tdSyncLineHeightMenuActive(){
  const editorEl = document.getElementById('tdEditor');
  if(!editorEl || !editorEl.editor) return;
  let active = 'lineNormal';
  try{
    const editor = editorEl.editor;
    if(editor.attributeIsActive('lineCompact')) active = 'lineCompact';
    else if(editor.attributeIsActive('lineAmplio')) active = 'lineAmplio';
  }catch(_e){}
  document.querySelectorAll('#dd-tdLineHeight .ed-dropdown-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === active);
  });
}

// ── Paginación EN VIVO mientras se escribe (hojas A4 reales; la línea activa
//    se mantiene centrada y visible, incluso por debajo de la cabecera) ─────
// El documento de Trix sigue siendo UNO solo (continuo) — no se puede partir
// en varios <trix-editor> sin romper su modelo de cursor/deshacer. En su
// lugar, #tdPageArea es un visor de altura FIJA (ajustada al hueco real
// disponible — Visual Viewport menos cabecera/barras, ver
// _tdSyncViewportHeight) que recorta lo que no quepa (overflow:hidden); la
// "hoja" (.td-page) crece con el texto y se TRASLADA (transform: translateY)
// dentro de ese visor — puede quedar parcialmente por debajo de la cabecera
// cuando haga falta para mantener centrada la línea que se está escribiendo
// (ver _tdCenterActiveLine). Los botones de flecha y el arrastre manual
// siguen tratando esto como "páginas" con saltos exactos y animados
// (_tdScrollToViewPage). Se usa el MISMO motor de maquetación que "Aplicar
// al lienzo" (_tdLayoutPages) para saber cuántas páginas hacen falta y en
// qué carácter empieza cada una; luego se localiza esa posición en el DOM
// real con la API Range (funciona con cualquier anidamiento, sin tener que
// hacer coincidir mi árbol de bloques con el árbol real de Trix nodo a nodo).
let _tdViewPageStartChars = [0];
let _tdViewPageOffsets = [0]; // px de scrollTop para ver cada página
let _tdViewCurPage = 0;
// Saltos de página fijados a mano arrastrando la línea discontinua (offset
// de carácter, siempre coincidente con el final de una línea real — ver
// _tdSnapBreakToLine). Se reinician al abrir un documento nuevo o al
// reeditar uno existente (se restauran desde la capa si los tenía guardados
// — ver edOpenTextDoc) y se guardan en la propia capa al aplicar.
let _tdManualBreakChars = [];
// true en cuanto el usuario coloca de verdad el cursor en el texto actual
// (ver el listener de trix-selection-change) — se reinicia a false cada vez
// que se abre el editor (nuevo o reeditando, ver edOpenTextDoc). Sin esto,
// _tdInsertPageBreakAtCursor no tenía forma fiable de distinguir "el cursor
// está genuinamente aquí" de "Trix aún no ha recibido ningún toque desde
// que cargó el HTML" — ambos casos dejan una selección con pinta válida
// ([0,0] interno de Trix, a veces también reflejado en window.getSelection
// según el navegador), y sin el filtro se creaba un salto de página en el
// principio absoluto del documento — imposible de arrastrar ni de borrar
// porque _tdRecomputeViewPagination nunca dibuja tirador para el inicio del
// documento (solo para cambios de página REALES, ver ese bucle: empieza en
// i=1) — bug reportado por Alberto.
let _tdCursorEverPlaced = false;

// Petición explícita de Alberto: si una selección de texto (para copiar/
// pegar, etc.) queda demasiado arriba, el menú NATIVO de selección de
// Android (Copiar/Pegar/Todo) puede tapar la propia fila de botones del
// editor (#tdMenuBar). Ese menú lo pinta el propio sistema operativo, FUERA
// del DOM de la página (igual que el teclado) — no hay CSS ni z-index que
// pueda ponerlo por debajo de nada nuestro, ni "bajarlo de capa": es UI
// nativa, siempre por encima de cualquier contenido web. Lo único que SÍ se
// puede hacer es asegurar que la selección nunca quede tan arriba como para
// que ese menú (dondequiera que decida pintarse, arriba o abajo de la
// selección) llegue a tocar esa fila — desplazando la página hacia abajo lo
// que haga falta, aunque la selección esté en la primerísima línea del
// documento. Para eso existe #tdSelTopSpacer (ver views.js/editor.css):
// vacío en el caso normal, se hace crecer aquí lo justo para tener margen
// de sobra por encima incluso en ese caso extremo (sin él no habría "más
// arriba" donde desplazarse estando ya en scrollTop 0).
const TD_SEL_MENU_CLEARANCE = 110; // alto estimado del menú nativo + margen de sobra
function _tdEnsureSelectionClearance(){
  const editorEl = document.getElementById('tdEditor');
  const areaEl = document.getElementById('tdPageArea');
  const menuBar = document.getElementById('tdMenuBar');
  const spacer = document.getElementById('tdSelTopSpacer');
  if(!editorEl || !areaEl || !menuBar || !spacer) return;
  const sel = window.getSelection();
  if(!sel || sel.rangeCount === 0 || sel.isCollapsed) return; // solo selección de texto real, no un simple cursor
  if(!editorEl.contains(sel.anchorNode)) return;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if(!rect || (rect.top === 0 && rect.bottom === 0)) return;
  const safeTop = menuBar.getBoundingClientRect().bottom + TD_SEL_MENU_CLEARANCE;
  const deficit = safeTop - rect.top;
  if(deficit <= 0) return; // ya hay sitio de sobra por encima
  // Falta "deficit" px de aire por encima de la selección. Crecer el
  // espaciador esa cantidad (nunca encogerlo — más simple y evita tener que
  // rastrear si algo más pudiera necesitar el hueco actual) empuja todo el
  // contenido hacia abajo sin más (overflow-anchor:none en #tdPageArea
  // evita que el navegador intente "compensarlo" él solo).
  const curSpacer = parseFloat(spacer.style.height) || 0;
  spacer.style.height = (curSpacer + deficit) + 'px';
}
let _tdLineStartCharsCache = []; // último cálculo — para ajustar el arrastre a la línea más cercana

// ── Historial de saltos de página (insertar/arrastrar/eliminar) — pedido
// explícito de Alberto: eliminar un salto (doble toque en su tirador) debe
// poder deshacerse. El deshacer propio de Trix (Ctrl+Z) no sirve aquí:
// solo conoce cambios de TEXTO, nada sabe de _tdManualBreakChars. Mismo
// patrón pila+índice que el resto del editor (edHistory/edHistoryIdx,
// _vsHistory, edDrawHistoryIdx…) — independiente de todos ellos, como
// exige ese mismo patrón (ver ANALISIS_CAPAS_DIBUJO). Cada entrada es una
// FOTO completa del array (más simple y robusto que registrar "qué cambió"
// con una lógica de deshacer distinta para insertar/mover/borrar).
let _tdBreakHistory = [[]];
let _tdBreakHistoryIdx = 0;
function _tdPushBreakHistory(){
  // Llamar DESPUÉS de cada cambio a _tdManualBreakChars, con el nuevo
  // estado ya aplicado. Si no estamos en la punta (por deshacer previos),
  // se descarta el "rehacer" pendiente — comportamiento estándar de
  // cualquier historial al hacer un cambio nuevo.
  _tdBreakHistory = _tdBreakHistory.slice(0, _tdBreakHistoryIdx + 1);
  _tdBreakHistory.push(_tdManualBreakChars.slice());
  _tdBreakHistoryIdx = _tdBreakHistory.length - 1;
}
function _tdUndoBreak(){
  if(_tdBreakHistoryIdx <= 0) return false;
  _tdBreakHistoryIdx--;
  _tdManualBreakChars = _tdBreakHistory[_tdBreakHistoryIdx].slice();
  _tdRecomputeViewPagination();
  return true;
}
function _tdRedoBreak(){
  if(_tdBreakHistoryIdx >= _tdBreakHistory.length - 1) return false;
  _tdBreakHistoryIdx++;
  _tdManualBreakChars = _tdBreakHistory[_tdBreakHistoryIdx].slice();
  _tdRecomputeViewPagination();
  return true;
}

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

// Predice dónde caerán los saltos de hoja al pulsar "Aplicar al lienzo" —
// usando esa MISMA maquetación (edPageW/edPageH, TD_BODY_SIZE/TD_H1_SIZE, el
// margen de la capa si se está reeditando) — para dibujar ahí las líneas
// discontinuas y numerar las páginas. El tamaño de letra y los márgenes con
// los que se ESCRIBE aquí no se tocan: siguen siendo los de siempre (CSS de
// .td-editor/.td-page) — esta predicción es solo para saber EN QUÉ PUNTO del
// texto (nº de caracteres) caerá cada salto, que luego se localiza en el DOM
// tal y como se está escribiendo ahora mismo (_tdCharOffsetToRange).
// Marcos reales (por hoja) de un flujo YA APLICADO — misma lógica exacta que
// _tdReflowFlowInPlace usa para aplicar de verdad (frames = ancho/alto real
// de cada hoja del flujo, más un marco de reserva al final), pero de SOLO
// LECTURA: no muta nada, solo sirve para que _tdRecomputeViewPagination
// prediga los saltos contra el marco que de verdad se usará, en vez de
// asumir siempre la página entera. Necesario porque si la hoja de texto se
// redimensionó a mano en el lienzo (handlers) o ya no ocupa la página
// entera, la vista previa (y cualquier salto que se arrastre sobre ella) se
// desincronizaría de lo que _tdApplyToCanvas/_tdReflowFlowInPlace aplicará.
// Devuelve null si el flujo no tiene ninguna hoja en la obra (p.ej. texto
// nuevo, todavía sin aplicar — ahí se sigue usando la página entera).
function _tdEditingFlowFrames(flowId){
  if(!flowId) return null;
  const flowIdxs = [];
  const exceptIdxs = [];
  edPages.forEach((p, i) => {
    if((p.layers || []).some(l => l && l._tdFlowId === flowId)) flowIdxs.push(i);
    else if((p.layers || []).some(l => l && l._tdExceptFlow === flowId)) exceptIdxs.push(i);
  });
  if(!flowIdxs.length) return null;
  flowIdxs.sort((a, b) => a - b);
  const frames = flowIdxs.map(i => {
    const pg = edPages[i];
    const layer = pg.layers.find(l => l && l._tdFlowId === flowId);
    const orient = pg.orientation || edOrientation;
    const sv = orient === 'vertical';
    const pgPw = sv ? ED_PAGE_W : ED_PAGE_H, pgPh = sv ? ED_PAGE_H : ED_PAGE_W;
    return { pw: layer.width * pgPw, ph: layer.height * pgPh };
  });
  const spanIdxs = [...flowIdxs, ...exceptIdxs].sort((a, b) => a - b);
  const lastIdx = spanIdxs[spanIdxs.length - 1];
  const lastOrient = edPages[lastIdx].orientation || edOrientation;
  const svLast = lastOrient === 'vertical';
  frames.push({ pw: svLast ? ED_PAGE_W : ED_PAGE_H, ph: svLast ? ED_PAGE_H : ED_PAGE_W });
  return frames;
}

let _tdRecomputeTimer = null;
function _tdRecomputeViewPagination(){
  if(_tdPageBreakDragging) return; // no reconstruir las líneas a medio arrastre — ver _tdPageBreakDragging
  const hidden = document.getElementById('tdHiddenInput');
  const editorEl = document.getElementById('tdEditor');
  const inner = document.getElementById('tdPage');
  const areaEl = document.getElementById('tdPageArea');
  if(!hidden || !editorEl || !inner || !areaEl) return;
  const html = hidden.value || '';
  const blocks = _tdParseBlocks(html);
  const lineHeightMult = _tdLineHeightMult;

  // Si se está reeditando un texto ya aplicado, usar SU margen lateral (el
  // ajuste "Estrecho/Normal/Ancho" del panel de propiedades) — si no, el
  // margen por defecto. El interlineado ya lo refleja el selector
  // (puesto al valor de la capa al reeditar — ver edOpenTextDoc).
  const editingLayer = (typeof _tdEditingFlowId !== 'undefined' && _tdEditingFlowId) ? _tdFindFlowLayer(_tdEditingFlowId) : null;
  const marginFracX = (editingLayer && editingLayer.marginXFrac) || TD_MARGIN_FRAC;

  // Marco de la predicción: si se reedita un flujo ya aplicado, el marco
  // REAL de cada una de sus hojas (por si se redimensionó con los handlers
  // en el lienzo — ver _tdEditingFlowFrames); si no (texto nuevo, o el
  // flujo ya no tiene hojas en la obra), la página entera de siempre.
  const editingFrames = _tdEditingFlowId ? _tdEditingFlowFrames(_tdEditingFlowId) : null;
  const frameSizes = editingFrames || {pw: edPageW(), ph: edPageH()};

  // _tdManualBreakChars: saltos fijados a mano arrastrando la línea — el
  // resto de páginas se recalculan solas a partir de ahí (ver comentario en
  // _tdLayoutPages).
  const { pageStartChars, lineStartChars } = _tdLayoutPages(
    blocks, frameSizes, lineHeightMult,
    { marginFracX, marginFracY: TD_MARGIN_FRAC, bodySize: TD_BODY_SIZE, h1Size: TD_H1_SIZE },
    _tdManualBreakChars
  );
  _tdViewPageStartChars = pageStartChars;
  _tdLineStartCharsCache = lineStartChars;

  // Medir en el DOM real (con el tamaño/margen de escritura de siempre, sin
  // tocarlos) dónde cae cada uno de esos saltos previstos, y también CADA
  // línea (para poder ajustar el arrastre a la más cercana). La resta
  // rect.top - innerRect.top ya es independiente de cuánto se haya
  // desplazado #tdPageArea (scroll nativo): ambos puntos se mueven juntos
  // al desplazarse, así que su diferencia se mantiene constante.
  const innerRect = inner.getBoundingClientRect();
  const charToY = charOffset => {
    if(charOffset <= 0) return 0;
    const range = _tdCharOffsetToRange(editorEl, charOffset);
    if(!range) return inner.scrollHeight;
    const rect = range.getBoundingClientRect();
    return Math.max(0, rect.top - innerRect.top);
  };
  _tdViewPageOffsets = pageStartChars.map(charToY);
  _tdLineOffsetsCache = lineStartChars.map(charToY);

  // Líneas discontinuas de cambio de página: una por cada punto donde
  // termina una página y empieza la siguiente (todas menos la primera, que
  // es el principio del documento, no un cambio de hoja). Cada una lleva su
  // zona de arrastre para poder fijarla a mano (ver _tdWirePageBreakDrag).
  const breaksEl = document.getElementById('tdPageBreaks');
  if(breaksEl){
    breaksEl.innerHTML = '';
    for(let i = 1; i < _tdViewPageOffsets.length; i++){
      const line = document.createElement('div');
      line.className = 'td-pagebreak-line';
      line.style.top = _tdViewPageOffsets[i] + 'px';
      line.dataset.chars = String(pageStartChars[i]);
      const visual = document.createElement('div');
      visual.className = 'td-pagebreak-visual';
      const handle = document.createElement('div');
      handle.className = 'td-pagebreak-handle';
      line.appendChild(visual);
      line.appendChild(handle);
      _tdWirePageBreakDrag(handle, line);
      breaksEl.appendChild(line);
    }
  }
  // Reaplicar (sin animar) la posición de desplazamiento que ya tenía — NO se
  // fuerza el salto al inicio exacto de la página: el usuario puede haberse
  // desplazado libremente con la rueda/el dedo (scroll nativo), y
  // recalcular mientras escribe no debe deshacer eso. _tdCenterActiveLine,
  // llamado justo después de esta función, decide si hay que seguir al
  // cursor (mantenerlo visible si se sale del hueco visible).
  // Se omite mientras hay composición IME activa (_tdComposing): incluso
  // reaplicar el MISMO scrollTop invoca scrollTo() sobre el contenedor del
  // <trix-editor>, y eso ya es suficiente en Android para cancelar la
  // composición en curso.
  if(!_tdComposing) _tdSetScrollOffset(areaEl.scrollTop, false);
}
let _tdLineOffsetsCache = [];

// Ejecuta _tdLayoutPages con un conjunto de saltos forzados concreto, usando
// el marco real de la hoja que se está reeditando (o la página entera si es
// texto nuevo, sin flowId todavía) — para poder consultar de antemano dónde
// cortaría el algoritmo con exactamente ese conjunto de saltos. Usado por
// _tdWirePageBreakDrag para saber hasta dónde se puede bajar un salto sin
// que la página de arriba se quede sin sitio físico.
function _tdLayoutPagesForBreaks(forcedBreakChars){
  const hidden = document.getElementById('tdHiddenInput');
  if(!hidden) return { pages: [], pageStartChars: [0], lineStartChars: [] };
  const blocks = _tdParseBlocks(hidden.value || '');
  const lineHeightMult = _tdLineHeightMult;
  const editingLayer = _tdEditingFlowId ? _tdFindFlowLayer(_tdEditingFlowId) : null;
  const marginFracX = (editingLayer && editingLayer.marginXFrac) || TD_MARGIN_FRAC;
  const editingFrames = _tdEditingFlowId ? _tdEditingFlowFrames(_tdEditingFlowId) : null;
  const frameSizes = editingFrames || {pw: edPageW(), ph: edPageH()};
  return _tdLayoutPages(
    blocks, frameSizes, lineHeightMult,
    { marginFracX, marginFracY: TD_MARGIN_FRAC, bodySize: TD_BODY_SIZE, h1Size: TD_H1_SIZE },
    forcedBreakChars
  );
}

// Conecta el arrastre de la zona de agarre de un salto de página: mientras
// se arrastra, la línea sigue al dedo/ratón libremente, sin ningún tope
// visual durante el gesto — el número total de páginas SIEMPRE puede
// crecer si hace falta, así que mientras se arrastra no hay ninguna razón
// para impedir el movimiento. Al soltar, se ajusta al límite de línea real
// más cercano (nunca a mitad de una) y se comprueba el resultado DE
// VERDAD: si la página de arriba no tiene sitio físico hasta ahí (su marco
// real, ver _tdLayoutPagesForBreaks — un desbordamiento natural ocurriría
// antes), se corrige a la posición más baja que el algoritmo SÍ respeta
// para esa página, en vez de dejar el salto donde se soltó.
function _tdWirePageBreakDrag(handle, lineEl){
  let dragging = false;
  let pendingTimeout = null;

  const removeDragListeners = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
  };

  // Aborta este arrastre concreto sin aplicar ningún cambio — llamable
  // tanto desde dentro (nunca se llama a sí misma normalmente, el flujo
  // normal es onUp→finish) como desde FUERA vía _tdActiveDragCancel (ver
  // esa variable y edCloseTextDoc) si el editor se cierra a media gesto o
  // a mitad de la animación de corrección.
  const cancelDrag = () => {
    dragging = false;
    removeDragListeners();
    if(pendingTimeout){ clearTimeout(pendingTimeout); pendingTimeout = null; }
    lineEl.classList.remove('dragging');
    _tdPageBreakDragging = false;
    if(_tdActiveDragCancel === cancelDrag) _tdActiveDragCancel = null;
  };

  const onMove = e => {
    if(!dragging) return;
    const pageEl = document.getElementById('tdPage');
    if(!pageEl) return;
    const pageRect = pageEl.getBoundingClientRect();
    const localY = e.clientY - pageRect.top;
    lineEl.style.top = Math.max(0, localY) + 'px';
  };
  const onUp = () => {
    if(!dragging) return;
    dragging = false;
    lineEl.classList.remove('dragging');
    removeDragListeners();

    const finalTop = parseFloat(lineEl.style.top) || 0;
    // Ajustar al límite de línea real más cercano — nunca a mitad de una,
    // solo donde el formato permite que exista una línea de verdad.
    let nearestIdx = 0, nearestDist = Infinity;
    for(let i = 0; i < _tdLineOffsetsCache.length; i++){
      const d = Math.abs(_tdLineOffsetsCache[i] - finalTop);
      if(d < nearestDist){ nearestDist = d; nearestIdx = i; }
    }
    const oldChars = parseFloat(lineEl.dataset.chars);
    const others = _tdManualBreakChars.filter(c => c !== oldChars);
    let newChars = _tdLineStartCharsCache[nearestIdx];
    let correctedIdx = -1;

    if(newChars > 0){
      // Comprobar contra el algoritmo REAL cuál es el primer corte que de
      // verdad ocurre justo después de la página anterior (prevBreak) — si
      // no coincide EXACTAMENTE con donde se soltó, ese punto no es válido
      // para esta página, aunque un desbordamiento natural interpuesto
      // antes haga que "newChars" aparezca honrado más adelante, para una
      // página distinta a la que se pretendía extender (eso creaba un
      // salto de más, el bug reportado). Se usa el primer corte real en su
      // lugar, sea cual sea.
      const prevBreak = others.filter(c => c < newChars).reduce((a, b) => Math.max(a, b), 0);
      const probe = _tdLayoutPagesForBreaks([...others, newChars].sort((a, b) => a - b));
      const nextBreak = probe.pageStartChars.find(c => c > prevBreak);
      if(nextBreak !== newChars){
        newChars = (nextBreak !== undefined && nextBreak > 0) ? nextBreak : 0;
        edToast('Esa página ya no tiene sitio — colocado en el límite permitido');
        // Línea real correspondiente al punto YA corregido, para animar
        // hacia ahí (no necesariamente la más cercana a donde se soltó).
        let d2 = Infinity;
        for(let i = 0; i < _tdLineStartCharsCache.length; i++){
          const diff = Math.abs(_tdLineStartCharsCache[i] - newChars);
          if(diff < d2){ d2 = diff; correctedIdx = i; }
        }
      }
    }

    // Si el punto final (ya corregido arriba si hacía falta) es justo donde
    // el algoritmo cortaría de todos modos SIN guardarlo como salto manual
    // (con el tamaño de marco actual y los DEMÁS saltos manuales, sin este),
    // no hace falta fijarlo — y no conviene hacerlo: si se guardara siempre,
    // el simple gesto de tocar un salto automático (aunque "rebote" a la
    // misma posición porque el marco no daba para más, como en el paso de
    // validación de arriba) lo convertiría en un salto FIJO para siempre,
    // que seguiría forzándose aunque el marco creciera después y ya no
    // hiciera falta — bug reportado por Alberto: imposible que el texto
    // volviera a caber en una sola hoja al agrandar la caja, tras haber
    // tocado una vez el salto entre hojas. Al no guardarlo, sigue siendo
    // "el corte natural de este tamaño de marco" — se recalcula solo si el
    // marco cambia, en vez de quedar congelado en esa posición para siempre.
    let isRedundant = false;
    if(newChars > 0){
      const naturalProbe = _tdLayoutPagesForBreaks(others);
      isRedundant = naturalProbe.pageStartChars.includes(newChars);
    }

    const finish = () => {
      const tentative = others.slice();
      if(newChars > 0 && !isRedundant && !tentative.includes(newChars)) tentative.push(newChars);
      tentative.sort((a, b) => a - b);
      _tdManualBreakChars = tentative;
      _tdPushBreakHistory();
      _tdPageBreakDragging = false; // ya se puede reconstruir de nuevo — esta es la propia reconstrucción final
      if(_tdActiveDragCancel === cancelDrag) _tdActiveDragCancel = null;
      _tdRecomputeViewPagination();
    };

    if(correctedIdx >= 0 && _tdLineOffsetsCache[correctedIdx] !== undefined){
      // Solo aquí se anima: el arrastre en sí (onMove) sigue al dedo/ratón
      // al instante, sin transición — pero cuando el punto soltado NO era
      // válido y hay que rectificar, la línea se desliza de vuelta a su
      // sitio real en vez de saltar de golpe (lo que haría el recálculo,
      // que reconstruye las líneas desde cero). _tdActiveDragCancel sigue
      // registrado durante esta espera (se anula al final, en finish o en
      // cancelDrag) por si el editor se cierra justo durante la animación.
      lineEl.style.transition = 'top .22s cubic-bezier(.4,0,.2,1)';
      lineEl.style.top = _tdLineOffsetsCache[correctedIdx] + 'px';
      let done = false;
      const onEnd = () => {
        if(done) return;
        done = true;
        lineEl.removeEventListener('transitionend', onEnd);
        finish();
      };
      lineEl.addEventListener('transitionend', onEnd);
      pendingTimeout = setTimeout(onEnd, 260); // red de seguridad si transitionend no llega
    } else {
      finish();
    }
  };
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    const chars = parseFloat(lineEl.dataset.chars);
    const now = Date.now();
    if(_tdLastPageBreakTapChars === chars && (now - _tdLastPageBreakTapTime) < 350){
      // Doble toque/clic: eliminar este salto — no empezar a arrastrar.
      // Los saltos posteriores se recalculan solos al llamar de nuevo a
      // _tdRecomputeViewPagination (el algoritmo nunca decide de antemano
      // dónde va cada salto, ver _tdLayoutPages), así que quitar uno de
      // _tdManualBreakChars ya reconfigura todo lo que haga falta después
      // — los saltos ANTERIORES a este no se tocan para nada (siguen en el
      // array tal cual estaban). Queda en _tdBreakHistory por si se quiere
      // deshacer (Ctrl+Z, ver el keydown de más abajo).
      _tdLastPageBreakTapChars = null;
      _tdLastPageBreakTapTime = 0;
      _tdManualBreakChars = _tdManualBreakChars.filter(c => c !== chars);
      _tdPushBreakHistory();
      _tdRecomputeViewPagination();
      edToast('Salto de página eliminado (Ctrl+Z para deshacer)');
      return;
    }
    _tdLastPageBreakTapChars = chars;
    _tdLastPageBreakTapTime = now;
    dragging = true;
    _tdPageBreakDragging = true; // bloquea cualquier reconstrucción externa hasta soltar (ver _tdPageBreakDragging)
    _tdActiveDragCancel = cancelDrag; // para poder abortar desde fuera si hace falta (ver edCloseTextDoc)
    lineEl.classList.add('dragging');
    lineEl.style.transition = 'none'; // arrastre al instante, sin animación, siguiendo al dedo/ratón
    handle.setPointerCapture?.(e.pointerId);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
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
// la rueda del ratón y el arrastre táctil la mueven de forma continua
// (scroll nativo de #tdPageArea, reflejado aquí vía _tdSyncPageNavFromOffset);
// los botones de flecha y el seguimiento automático del cursor SÍ saltan a
// un límite de página exacto (_tdScrollToViewPage).
let _tdCurrentOffset = 0;

// Desplaza #tdPageArea a una posición cualquiera en px (no necesariamente el
// principio de una página) — usada por el seguimiento automático del cursor
// y los saltos de página con flecha para restaurar un desplazamiento
// continuo y natural. Scroll NATIVO (antes: transform manual + recorte con
// overflow:hidden) — animate=false (seguir el cursor mientras se escribe,
// tiene que notarse al instante) frente a true (saltos de página, con
// animación).
function _tdSetScrollOffset(px, animate){
  const areaEl = document.getElementById('tdPageArea');
  if(!areaEl) return;
  const maxScroll = Math.max(0, areaEl.scrollHeight - areaEl.clientHeight);
  const clamped = Math.max(0, Math.min(maxScroll, px));
  areaEl.scrollTo({top: clamped, behavior: animate ? 'smooth' : 'instant'});
  _tdSyncPageNavFromOffset(clamped);
}
// Actualiza el estado (offset actual, página mostrada en la cabecera) a
// partir de una posición de scroll — compartido entre _tdSetScrollOffset
// (cambios programados) y el listener de scroll nativo (cambios por
// arrastre directo del usuario, que ya no pasan por _tdSetScrollOffset).
function _tdSyncPageNavFromOffset(offset){
  _tdCurrentOffset = offset;
  let page = 0;
  for(let i = 0; i < _tdViewPageOffsets.length; i++){ if(offset + 2 >= _tdViewPageOffsets[i]) page = i; }
  if(page !== _tdViewCurPage){ _tdViewCurPage = page; }
  _tdUpdateViewPageNav();
}

// Navega a la página n (0-based): desplaza #tdPageArea (scroll nativo) a la
// posición de esa página — un salto real y animado, no un scroll continuo
// (para eso están la rueda del ratón y el arrastre táctil, gestionados por
// el propio navegador). announce=true avisa
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

// Mientras se escribe (o se mueve el cursor): la línea activa se mantiene
// SIEMPRE en el mismo punto de la pantalla — la mitad del hueco visible de
// verdad (entre el final de la cabecera/barras y el principio del teclado)
// — y es la HOJA la que se desplaza para que la línea nunca se mueva de
// ahí. El límite inferior de ese hueco lo marca el propio #tdPageArea
// (areaRect.bottom): su alto ya lo calcula _tdSyncViewportHeight
// descontando cabecera/barras Y teclado virtual — usar ese mismo elemento
// como única fuente de verdad, en vez de recalcular aparte con
// visualViewport, evita que ambos cálculos puedan quedar en desacuerdo. A
// diferencia de saltar entre "páginas" (eso lo siguen haciendo las flechas
// y el arrastre manual, ver _tdScrollToViewPage), aquí se mide la posición
// REAL en pantalla del cursor (getClientRects) y se ajusta el desplazamiento
// al milímetro.
function _tdCenterActiveLine(){
  // No mover el scroll mientras hay una composición IME activa — ver
  // _tdComposing. Desplazar #tdPageArea (contenedor del <trix-editor>) en
  // ese instante es lo que hace que Android cancele la composición y se
  // pierda el carácter que se estaba formando (p.ej. el acento de "más").
  if(_tdComposing) return;
  if(!_tdAutoFollow) return; // el usuario se ha desplazado a mano para leer — no forzar hasta que vuelva a escribir
  const editorEl = document.getElementById('tdEditor');
  const areaEl = document.getElementById('tdPageArea');
  if(!editorEl || !areaEl) return;
  const sel = window.getSelection();
  if(!sel || sel.rangeCount === 0 || !sel.isCollapsed) return; // con texto seleccionado, no forzar
  const anchorNode = sel.focusNode;
  if(!anchorNode || !editorEl.contains(anchorNode)) return;

  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect = range.getClientRects()[0];
  if(!rect){
    // Punto sin rectángulo propio (línea vacía, justo tras un salto, etc.):
    // el elemento contenedor más próximo sirve de aproximación razonable.
    const el = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;
    rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  }
  if(!rect || (rect.top === 0 && rect.bottom === 0)) return;
  const cursorY = rect.top + rect.height / 2;

  const areaRect = areaEl.getBoundingClientRect();
  const safeTop = areaRect.top;
  const safeBottom = areaRect.bottom;
  if(safeBottom <= safeTop) return;
  // Punto fijo: la mitad exacta del hueco visible — no el final ni un
  // margen cerca del borde. Pedido explícito: la línea activa siempre en
  // el mismo sitio, a media pantalla, y es la hoja la que se adapta.
  const targetY = (safeTop + safeBottom) / 2;

  const delta = cursorY - targetY;
  if(Math.abs(delta) < 3) return; // ya donde debe estar — evita micro-ajustes constantes
  _tdSetScrollOffset(areaEl.scrollTop + delta, false);
}

// Botón "Salto de página" (tdPageBreakBtn): antes usaba el sistema nativo de
// atributos de bloque de Trix (Trix.config.blockAttributes.pageBreak,
// transformaba el bloque ENTERO donde estuviera el cursor en un <aside>,
// perdiendo su contenido de texto). Ahora usa el MISMO sistema que arrastrar
// una línea discontinua a mano (_tdManualBreakChars): añade un salto justo
// al final de la línea real donde esté el cursor en ese momento, sin tocar
// el contenido — y por tanto queda igual de arrastrable después. La lectura
// de contenido antiguo con <aside> incrustado (_tdParseBlocks/_tdLayoutPages)
// se mantiene intacta, solo cambia cómo se CREAN saltos nuevos a partir de
// ahora.
function _tdInsertPageBreakAtCursor(){
  const editorEl = document.getElementById('tdEditor');
  const inner = document.getElementById('tdPage');
  if(!editorEl || !inner) return;
  if(!_tdCursorEverPlaced){
    // El cursor no se ha colocado todavía de verdad en este texto (recién
    // abierto/reeditado, sin tocar aún) — sin este filtro, la selección
    // "de mentira" que deja Trix tras loadHTML ([0,0] interno, a veces
    // también reflejada en window.getSelection) colaba como si fuera una
    // posición real y creaba un salto de página en el principio absoluto
    // del documento — imposible de arrastrar o borrar después, porque no
    // se dibuja tirador para el inicio del documento (solo para cambios de
    // página reales, ver el bucle de _tdRecomputeViewPagination).
    edToast('Toca primero el texto, donde quieras insertar el salto');
    return;
  }
  const sel = window.getSelection();
  if(!sel || sel.rangeCount === 0) return;
  const anchorNode = sel.focusNode;
  if(!anchorNode || !editorEl.contains(anchorNode)) return;

  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect = range.getClientRects()[0];
  if(!rect){
    const el = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;
    rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  }
  if(!rect || (rect.top === 0 && rect.bottom === 0)) return;
  const cursorYRel = (rect.top + rect.height / 2) - inner.getBoundingClientRect().top;

  // Línea real (de las ya calculadas, ver _tdLineOffsetsCache) más cercana a
  // la posición vertical del cursor — el salto se añade al final de ESA
  // línea, sea cual sea (funciona igual en medio de un párrafo largo que al
  // final de uno corto).
  let nearestIdx = 0, nearestDist = Infinity;
  for(let i = 0; i < _tdLineOffsetsCache.length; i++){
    const d = Math.abs(_tdLineOffsetsCache[i] - cursorYRel);
    if(d < nearestDist){ nearestDist = d; nearestIdx = i; }
  }
  const newChars = _tdLineStartCharsCache[nearestIdx];
  if(!(newChars > 0)){ edToast('El cursor ya está al principio — no hay nada que separar'); return; }
  if(_tdManualBreakChars.includes(newChars)){ edToast('Ya hay un salto de página ahí'); return; }
  _tdManualBreakChars.push(newChars);
  _tdManualBreakChars.sort((a, b) => a - b);
  _tdPushBreakHistory();
  _tdAutoFollow = true; // insertar un salto es una edición como escribir — seguir mostrando la línea activa
  _tdRecomputeViewPagination();
  _tdCenterActiveLine();
  edToast('Salto de página añadido');
}

window.addEventListener('resize', () => {
  cancelAnimationFrame(window._tdRecomputeRaf);
  window._tdRecomputeRaf = requestAnimationFrame(() => {
    if(typeof _tdSyncViewportHeight === 'function') _tdSyncViewportHeight();
    else _tdRecomputeViewPagination();
  });
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

  const TD_WRAPPER_TAGS = ['align-center', 'align-right', 'align-justify', 'line-compact', 'line-amplio'];
  const TD_BLOCK_TAGS = ['div', 'h1', 'blockquote', 'ul', 'ol', 'pre', 'aside'].concat(TD_WRAPPER_TAGS);

  function walkBlockLevel(container, ctxKind, indentLevel, align, lineMult){
    Array.from(container.children).forEach(el => {
      const tag = el.tagName.toLowerCase();
      // Alineación (align-center/-right/-justify) e interlineado por párrafo
      // (line-compact/line-amplio, ver _tdRegisterCustomTrixAttributes)
      // envuelven el bloque real — se detectan aquí y se propagan a lo que
      // resulte de analizar su contenido, sea cual sea (párrafo, título,
      // cita, lista…), igual que ya se hace con indentLevel/ctxKind. Pueden
      // ir anidadas entre sí (un párrafo puede estar centrado Y compacto a
      // la vez), por eso cada una solo actualiza SU propio valor (align o
      // lineMult) y deja el otro tal cual venía.
      if(TD_WRAPPER_TAGS.includes(tag)){
        const a  = tag === 'align-center' ? 'center' : tag === 'align-right' ? 'right' : tag === 'align-justify' ? 'justify' : align;
        const lm = tag === 'line-compact' ? TD_LINE_COMPACT : tag === 'line-amplio' ? TD_LINE_AMPLIO : lineMult;
        // ¿Envuelve un bloque real (div/h1/blockquote/ul/ol/pre/aside, u otra
        // etiqueta de alineación/interlineado anidada)? Antes se usaba "¿tiene
        // ALGÚN hijo elemento?" — pero un simple salto de línea manual (<br>,
        // Shift+Intro dentro del mismo párrafo) o texto con negrita/cursiva
        // (<strong>, <em>...) TAMBIÉN son hijos elemento sin ser un bloque
        // envuelto, y hacían caer aquí por error: se recorrían como si fueran
        // bloques de nivel superior (no lo son) y el párrafo entero se perdía
        // en silencio — bug real: alinear un párrafo con más de una línea
        // dejaba "Aplicar al lienzo" sin nada que aplicar.
        const wrapsRealBlock = Array.from(el.children).some(c => TD_BLOCK_TAGS.includes(c.tagName.toLowerCase()));
        if(wrapsRealBlock){
          // Envuelve un bloque real — recorrer dentro.
          walkBlockLevel(el, ctxKind, indentLevel, a, lm);
        } else {
          // La propia etiqueta ES el párrafo (con o sin <br>/negrita/cursiva
          // sueltos dentro) — tratarla como tal en vez de recorrer sus hijos
          // como si fueran bloques.
          blocks.push({kind: ctxKind === 'quote' ? 'quote' : 'paragraph', indent:indentLevel, align:a, lineHeightMult:lm, runs: runsFromInline(el, {})});
        }
        return;
      }
      if(tag === 'ul' || tag === 'ol'){
        Array.from(el.children).forEach((li, i) => {
          if(li.tagName.toLowerCase() !== 'li') return;
          blocks.push({
            kind: tag === 'ul' ? 'bullet' : 'number',
            index: i + 1,
            indent: indentLevel,
            align, lineHeightMult:lineMult,
            runs: runsFromInline(li, {})
          });
        });
      } else if(tag === 'blockquote'){
        walkBlockLevel(el, 'quote', indentLevel + 1, align, lineMult);
      } else if(tag === 'h1'){
        blocks.push({kind:'heading', indent:indentLevel, align, lineHeightMult:lineMult, runs: runsFromInline(el, {})});
      } else if(tag === 'pre'){
        blocks.push({kind:'code', indent:indentLevel, align, lineHeightMult:lineMult, runs: runsFromInline(el, {mono:true})});
      } else if(tag === 'aside'){
        // Salto de página forzado (Trix.config.blockAttributes.pageBreak, tagName 'aside')
        // — se ignora cualquier texto que pueda tener, solo marca el corte.
        blocks.push({kind:'pagebreak', indent:indentLevel, runs:[]});
      } else {
        blocks.push({kind: ctxKind === 'quote' ? 'quote' : 'paragraph', indent:indentLevel, align, lineHeightMult:lineMult, runs: runsFromInline(el, {})});
      }
    });
  }

  // El valor por defecto para bloques SIN etiqueta explícita de interlineado
  // es _tdLineHeightMult (el ajuste de ESTA sesión/documento — ya incluye
  // editLayer.lineHeightMult al reeditar una obra guardada antes de que el
  // interlineado fuera por párrafo, ver edOpenTextDoc), no la constante fija
  // TD_LINE_MULT — si no, reeditar una obra con "Amplio" guardado como ajuste
  // global lo revertía en silencio a "Normal" en cuanto se volvía a analizar
  // el HTML, perdiendo ese ajuste.
  walkBlockLevel(doc.body, 'paragraph', 0, null, _tdLineHeightMult);
  return blocks;
}

// ── Registro de atributos personalizados de Trix (fontSize, fontFamily,
//    salto de página, alineación, interlineado por párrafo) — extensión
//    oficial vía Trix.config, no un fork ni un hack sobre internals. Ver
//    README/wiki de Trix: "textAttributes support style attributes via
//    styleProperty; blockAttributes solo tagName" (por eso alineación e
//    interlineado usan etiquetas inventadas en vez de un valor — ver
//    TD_WRAPPER_TAGS más abajo en _tdParseBlocks). ──
function _tdRegisterCustomTrixAttributes(){
  if(typeof Trix === 'undefined' || window._tdTrixAttrsRegistered) return;
  window._tdTrixAttrsRegistered = true;
  Trix.config.textAttributes.fontSize   = { styleProperty: 'font-size',   inheritable: true };
  Trix.config.textAttributes.fontFamily = { styleProperty: 'font-family', inheritable: true };
  Trix.config.blockAttributes.pageBreak = { tagName: 'aside', terminal: true, breakOnReturn: true, group: false };
  // Alineación: Trix no soporta estilos en blockAttributes (solo tagName),
  // así que — patrón documentado por la comunidad de Trix para este caso
  // exacto — se registra una etiqueta inventada por cada alineación
  // (excepto izquierda, que es la ausencia de cualquiera de las otras tres,
  // ya que es como se comporta el texto sin marcar nada) y se les da
  // aspecto por CSS (ver .td-editor align-center, etc.). La exclusividad
  // entre ellas (nunca dos a la vez) se gestiona a mano en el clic del
  // submenú (ver _tdWireFontControls), no vía la opción "exclusive" de
  // Trix — esa opción, a juzgar por el propio código fuente de Trix,
  // quita CUALQUIER otro atributo de bloque en ese punto (título, cita…),
  // no solo los de alineación, y eso no es lo que se quiere aquí.
  Trix.config.blockAttributes.alignCenter  = { tagName: 'align-center',  nestable: false };
  Trix.config.blockAttributes.alignRight   = { tagName: 'align-right',   nestable: false };
  Trix.config.blockAttributes.alignJustify = { tagName: 'align-justify', nestable: false };
  // Interlineado por párrafo (pedido explícito de Alberto: debe comportarse
  // igual que alineación — selección de texto y no todo el documento). Mismo
  // patrón que alineación: dos etiquetas inventadas (Normal es la ausencia
  // de ambas, como "A la izquierda").
  Trix.config.blockAttributes.lineCompact = { tagName: 'line-compact', nestable: false };
  Trix.config.blockAttributes.lineAmplio  = { tagName: 'line-amplio',  nestable: false };
  // Imprescindible: sin esto, Trix (usa DOMPurify internamente para sanear
  // el HTML) elimina estas etiquetas inventadas nada más volver a cargar el
  // documento guardado para reeditar — documentado en el propio README de
  // Trix ("Trix.config.dompurify.ADD_TAGS") y confirmado por un caso real
  // reportado en su repositorio (issue #864: una etiqueta personalizada
  // sin esto se guardaba bien, pero desaparecía al reabrir el editor).
  Trix.config.dompurify.ADD_TAGS = (Trix.config.dompurify.ADD_TAGS || []).concat(['align-center', 'align-right', 'align-justify', 'line-compact', 'line-amplio']);
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
// padBottom} — los del tamaño real de la hoja (Aplicar al lienzo). La
// predicción de saltos de página de la vista en vivo (_tdRecomputeViewPagination)
// también usa estas mismas fracciones/tamaños, no una aproximación aparte.
// marginFracX es el que el usuario puede cambiar desde "Márgenes" en el
// panel de propiedades (ver pp-td-margin/_tdReflowAfterMarginChange) — solo
// afecta al margen lateral, el vertical se mantiene siempre en su defecto.
// forcedBreakChars: posiciones (nº de carácter, en el mismo recuento que
// pageStartChars) donde se ha arrastrado a mano un salto de página — SIEMPRE
// coinciden con el final de una línea real (ver _tdSnapBreakToLine), nunca a
// mitad de una. El resto de páginas se recalculan solas a partir de ahí: es
// una consecuencia natural de que el algoritmo simplemente sigue avanzando
// línea a línea, no hace falta ningún ajuste especial para que "el resto se
// adapte" — lo hace porque nunca decide por adelantado dónde irá cada salto.
function _tdLayoutPages(blocks, frameSizes, lineHeightMult, opts, forcedBreakChars){
  const sizes = Array.isArray(frameSizes) ? frameSizes : [frameSizes];
  const lhMult = lineHeightMult || TD_LINE_MULT;
  const marginFracX = (opts && (opts.marginFracX ?? opts.marginFrac)) ?? TD_MARGIN_FRAC;
  const marginFracY = (opts && (opts.marginFracY ?? opts.marginFrac)) ?? TD_MARGIN_FRAC;
  const hasExplicitPad = !!(opts && (opts.padTop !== undefined || opts.padBottom !== undefined));
  const bodySizeDefault = (opts && opts.bodySize) || TD_BODY_SIZE;
  const h1SizeDefault = (opts && opts.h1Size) || TD_H1_SIZE;
  const ctx = _tdMeasureCtx;
  const forced = (forcedBreakChars || []).slice().sort((a, b) => a - b);
  let forcedIdx = 0;

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
  const lineStartChars = []; // offset al final de CADA línea (no solo de página) — para ajustar el arrastre
  let curLines = [];
  let curY = 0; // relativo al margen superior (0..textH)
  let charsSoFar = 0;

  function pushLine(entry){
    const endChars = charsSoFar; // caracteres acumulados hasta el final de ESTA línea
    let shouldBreak = curY + entry.height > textH && curLines.length > 0;
    // Salto forzado a mano (arrastre): si ya se ha alcanzado o pasado el
    // siguiente punto fijado, cortar aquí también, haya sitio o no — pero
    // solo si esta página ya tiene algo (si no, dejaría una página vacía).
    if(!shouldBreak && curLines.length > 0 && forcedIdx < forced.length && endChars >= forced[forcedIdx]){
      shouldBreak = true;
    }
    if(shouldBreak){
      pages.push(curLines);
      curLines = [];
      curY = 0;
      frameIdx++;
      loadFrame();
      pageStartChars.push(charsSoFar);
      while(forcedIdx < forced.length && forced[forcedIdx] <= endChars) forcedIdx++;
    }
    const baseline = curY + entry.height * 0.78;
    const lineObj = {
      y: my + baseline,
      indent: mx + entry.indent,
      kind: entry.kind,
      fontSize: entry.fontSize,
      marker: entry.marker,
      runs: entry.runs,
      align: entry.align,
      // Ancho real disponible para el TEXTO en esta línea concreta (marco ya
      // actualizado arriba si tocaba) — lo necesita el centrado/derecha/
      // justificado más abajo; se guarda ahora porque textW cambia de marco
      // en marco y para cuando se calculan las x ya solo queda el último.
      availW: Math.max(20, textW - entry.indent)
    };
    curLines.push(lineObj);
    curY += entry.height;
    lineStartChars.push(endChars);
    return lineObj;
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
    // Interlineado: el del propio párrafo (line-compact/line-amplio, ver
    // _tdParseBlocks) si lo tiene: pedido explícito de Alberto — debe
    // comportarse como alineación (por párrafo/selección), no como un
    // único ajuste para todo el documento. Si el bloque no trae uno
    // explícito (walkBlockLevel ya pone TD_LINE_MULT por defecto, pero por
    // si acaso), cae al parámetro de la función.
    const lhMult = block.lineHeightMult || lineHeightMult || TD_LINE_MULT;

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
      pushLine({height:baseFontSize*lhMult, indent:indentPx, kind:block.kind, fontSize:baseFontSize, marker:null, runs:[], align: block.align});
      curY += baseFontSize * TD_PARA_GAP_MULT;
      return;
    }

    let lineRuns = [];
    let lineWidth = 0;
    let lineMaxFontSize = baseFontSize;
    let firstLineOfBlock = true;
    let lastLineOfBlock = null; // la última línea empujada de este bloque — el justificado no la estira (convención tipográfica: la última línea de un párrafo se queda a su ancho natural)

    function flushLine(){
      while(lineRuns.length && lineRuns[lineRuns.length - 1].isSpace) lineRuns.pop();
      lastLineOfBlock = pushLine({
        height: lineMaxFontSize * lhMult, indent: indentPx, kind: block.kind, fontSize: lineMaxFontSize,
        marker: firstLineOfBlock ? marker : null, runs: lineRuns, align: block.align
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
    if(lastLineOfBlock) lastLineOfBlock.isBlockEnd = true;

    curY += baseFontSize * TD_PARA_GAP_MULT;
  });

  if(curLines.length) pages.push(curLines);
  if(pages.length === 0) pages.push([]);

  // Posición x de cada run según la alineación real de la línea (heredada
  // del bloque de Trix — ver _tdParseBlocks/_tdRegisterCustomTrixAttributes).
  // Se calcula aquí, una única vez; _drawRichLines (editor.js) usa esta x
  // tal cual al dibujar en el lienzo, sin saber nada de alineación por su
  // cuenta — por eso basta con tocar este único sitio.
  pages.forEach(page => {
    page.forEach(line => {
      let lineWidth = 0;
      line.runs.forEach(r => { lineWidth += r.width; });
      const availW = line.availW || 0;

      let startX = line.indent; // izquierda: como siempre
      if(line.align === 'center'){
        startX = line.indent + Math.max(0, (availW - lineWidth) / 2);
      } else if(line.align === 'right'){
        startX = line.indent + Math.max(0, availW - lineWidth);
      }

      // Justificado: reparte el sobrante entre los espacios de la línea —
      // salvo en la última línea de cada párrafo (isBlockEnd), que se deja a
      // su ancho natural, como hace cualquier procesador de texto.
      let extraPerSpace = 0;
      if(line.align === 'justify' && !line.isBlockEnd){
        const spaceCount = line.runs.filter(r => r.isSpace).length;
        const extra = availW - lineWidth;
        if(spaceCount > 0 && extra > 0) extraPerSpace = extra / spaceCount;
      }

      let x = startX;
      line.runs.forEach(r => {
        r.x = x;
        x += r.width;
        if(extraPerSpace && r.isSpace) x += extraPerSpace;
        delete r.isSpace;
      });
      delete line.availW;
      delete line.isBlockEnd;
    });
  });

  return {pages, mx, my, pageStartChars, lineStartChars};
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

function _tdMakeTextLayer(pageLines, html, flowId, lineHeightMult, marginXFrac, manualBreakChars){
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
  if(manualBreakChars && manualBreakChars.length) tl.manualBreakChars = manualBreakChars.slice();
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
  let blocks;
  try{
    blocks = _tdParseBlocks(html);
  }catch(err){
    _tdLogApply('EXCEPCIÓN en _tdParseBlocks', (err && err.message) || String(err));
    edToast('Error al leer el texto — no se ha perdido nada, sigue en el editor (' + ((err && err.message) || err) + ')');
    return;
  }
  const hasContent = blocks.some(b => (b.runs || []).some(r => r.text && r.text.trim()));
  _tdLogApply('inicio', 'html.length=' + html.length + ' bloques=' + blocks.length
    + ' align=[' + blocks.map(b => b.align || '-').join(',') + ']'
    + ' hasContent=' + hasContent);
  if(!hasContent){
    _tdLogApply('SALIDA: sin contenido', 'blocks=' + JSON.stringify(blocks).slice(0, 500));
    edToast('Escribe algo de texto antes de aplicar');
    return;
  }

  const lineHeightMult = _tdLineHeightMult;

  // Red de seguridad: si algo de aquí abajo lanza un error inesperado (el
  // texto no se pierde, sigue en el editor tal cual), se avisa con un
  // mensaje claro en vez de quedarse a medias sin completar la acción ni
  // decir por qué — antes, la única forma de salir en ese caso era "Cerrar"
  // sin guardar, perdiendo los cambios sin ninguna explicación.
  try{
    if(_tdEditingFlowId){
      const existingLayer = _tdFindFlowLayer(_tdEditingFlowId);
      if(!existingLayer){ _tdLogApply('SALIDA: flujo no encontrado', '_tdEditingFlowId=' + _tdEditingFlowId); edToast('No se encuentra el texto a actualizar'); return; }
      // Se reutiliza el mismo motor que el redimensionado con los handlers:
      // conserva el tamaño/posición/color/fondo/marco que ya tuviera cada hoja
      // del flujo — solo cambia el contenido (y el interlineado, si se tocó
      // desde el propio Editor de textos).
      existingLayer.sourceHTML = html;
      existingLayer.lineHeightMult = lineHeightMult;
      existingLayer.manualBreakChars = _tdManualBreakChars.slice();
      const _wasPanelOpenBefore = !!(document.getElementById('editorShell')?.classList.contains('draw-active'));
      // Petición explícita de Alberto: al guardar cambios en un texto ya
      // existente, NO reabrir el panel de propiedades al volver (antes se
      // restauraba tal cual estaba — siempre abierto, porque la única forma
      // de llegar aquí es desde su propio botón "Editar texto"). Se pasa
      // "false" para que _tdReflowFlowInPlace no lo reabra, y se cierra del
      // todo + resetea la cámara explícitamente aquí abajo — si no, el
      // lienzo se queda con el tamaño encogido que tiene mientras el panel
      // está abierto, aunque el panel en sí ya no se vea.
      const r = _tdReflowFlowInPlace(existingLayer, false);
      if(!r){ _tdLogApply('SALIDA: reflujo falló', '_tdEditingFlowId=' + _tdEditingFlowId); edToast('No se pudo actualizar el texto'); return; }
      if(!_wasPanelOpenBefore) edLoadPage(r.firstIdx); // mismo respaldo que había, por si no hubiera panel que cerrar
      if(typeof edCloseOptionsPanel === 'function') edCloseOptionsPanel();
      if(typeof _edResetCameraToFit === 'function') _edResetCameraToFit();
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

      const { pages } = _tdLayoutPages(blocks, frames, lineHeightMult, undefined, _tdManualBreakChars);
      const existingCount = Math.min(pages.length, edPages.length - startIdx);

      for(let i = 0; i < existingCount; i++){
        const pg = edPages[startIdx + i];
        pg.layers = pg.layers || [];
        pg.layers.push(_tdMakeTextLayer(pages[i], html, flowId, lineHeightMult, undefined, _tdManualBreakChars));
      }
      // Si el texto sigue más allá de las hojas ya existentes, las que faltan
      // se crean nuevas al final — con la orientación de la última hoja de la obra.
      const lastOrient = edPages.length ? (edPages[edPages.length - 1].orientation || edOrientation) : edOrientation;
      const newPages = pages.slice(existingCount).map(pageLines => ({
        layers: [_tdMakeTextLayer(pageLines, html, flowId, lineHeightMult, undefined, _tdManualBreakChars)],
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
  }catch(err){
    _tdLogApply('EXCEPCIÓN capturada', (err && err.message) || String(err));
    edToast('Error al aplicar el texto — no se ha perdido nada, sigue en el editor (' + (err && err.message || err) + ')');
    return;
  }
  _tdLogApply('OK', 'texto aplicado y editor cerrado');

  // Cada aplicación consume el contenido del editor — se vacía para el siguiente texto
  if(hidden) hidden.value = '';
  const editorEl = document.getElementById('tdEditor');
  if(editorEl && editorEl.editor) editorEl.editor.loadHTML('');
  _tdEditingFlowId = null;
  _tdManualBreakChars = [];
  _tdBreakHistory = [[]]; _tdBreakHistoryIdx = 0;

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
      { marginFracX: la.marginXFrac || TD_MARGIN_FRAC, marginFracY: TD_MARGIN_FRAC },
      la.manualBreakChars
    );
    const newPages0 = pages0.map(pageLines => ({
      layers: [_tdMakeTextLayer(pageLines, html, flowId, la.lineHeightMult, la.marginXFrac, la.manualBreakChars)],
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
  const { pages } = _tdLayoutPages(
    blocks, frames, la.lineHeightMult,
    { marginFracX: la.marginXFrac || TD_MARGIN_FRAC, marginFracY: TD_MARGIN_FRAC },
    la.manualBreakChars
  );

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
    layer.manualBreakChars = la.manualBreakChars;
    layer.text = _tdPlainSummary(pages[i]);
  }

  // 2) Slots sobrantes (cupo en menos hojas): la capa de texto del flujo ya
  //    no hace falta ahí. Si la hoja NO tiene nada más, se quita la hoja
  //    entera (de mayor a menor índice). Si SÍ tiene otros elementos
  //    (dibujos, otro texto, imágenes…), la hoja NO se elimina — pedido
  //    explícito de Alberto: se queda tal cual, solo sin la capa de texto
  //    del flujo, en vez de mover esos elementos a otra hoja y borrar esta.
  for(let i = flowIdxs.length - 1; i >= reused; i--){
    const idx = flowIdxs[i];
    const pg = edPages[idx];
    const extras = (pg.layers || []).filter(l => !(l && l._tdFlowId === flowId));
    if(extras.length){
      pg.layers = extras;
    } else {
      edPages.splice(idx, 1);
    }
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
      layers: [_tdMakeTextLayer(pageLines, html, flowId, la.lineHeightMult, la.marginXFrac, la.manualBreakChars)],
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
