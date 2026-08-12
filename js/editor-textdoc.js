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
// Tope de alto para imágenes insertadas en el flujo de texto, como fracción
// del alto de texto disponible de la página — ver el comentario largo en
// _tdLayoutPages (búsqueda: TD_IMG_MAX_HEIGHT_FRAC) para el porqué completo.
const TD_IMG_MAX_HEIGHT_FRAC = 0.40;

// ── Apertura / cierre del shell ──────────────────────────────────
let _tdFlowSeq = 0;
function _tdNewFlowId(){ return 'tdflow_' + Date.now().toString(36) + '_' + (_tdFlowSeq++); }
// Flujo que se está reeditando (null = "Aplicar" crea un texto nuevo al final;
// con valor = "Aplicar" sustituye in situ las hojas de ese flujo — ver _tdApplyToCanvas)
let _tdEditingFlowId = null;
// true si hay cambios sin guardar desde la última apertura o aplicación —
// a petición de Alberto: al tocar la X, si hay cambios, preguntar si
// guardar o no, igual que ya hace el editor de animaciones (gcpClose).
let _tdDirty = false;
// Tamaño/tipo de letra "de todo el documento" actualmente cargado — pedido
// explícito de Alberto: si se fijó un tamaño/tipo sin selección (afecta a
// todo el flujo, ver _tdApplyScoped), escribir texto nuevo debe seguir
// heredando ese mismo tamaño/tipo, también al reeditar más tarde, no solo
// mientras dura la sesión de edición en curso. null = documento nuevo/vacío
// o con tamaños/tipos mezclados — en ese caso no se fuerza nada (ver
// _tdDetectUniformFont y el refuerzo por trix-selection-change en _tdInitOnce).
let _tdDocFontSize = null;
let _tdDocFontFamily = null;
// Analiza un HTML de Trix ya guardado (como STRING, sin tocar el editor en
// vivo — evita el problema de que setSelectedRange no surte efecto de
// inmediato tras loadHTML, comprobado con pruebas reales) y determina si
// TODO el texto comparte el mismo tamaño/tipo de letra. Con tamaños/tipos
// mezclados, o documento vacío, devuelve null para esa propiedad — nunca se
// fuerza nada en esos casos, se respeta el comportamiento nativo de Trix.
function _tdDetectUniformFont(html){
  if(!html) return { fontSize: null, fontFamily: null };
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  let fs, ff, mixedFs = false, mixedFf = false, any = false;
  const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT);
  let node;
  while((node = walker.nextNode())){
    if(!node.textContent || !node.textContent.trim()) continue;
    any = true;
    let el = node.parentElement, curFs = null, curFf = null;
    while(el && el !== tmp){
      if(curFs === null && el.style && el.style.fontSize) curFs = el.style.fontSize;
      if(curFf === null && el.style && el.style.fontFamily) curFf = el.style.fontFamily.replace(/^['"]|['"]$/g, '');
      el = el.parentElement;
    }
    if(fs === undefined) fs = curFs; else if(fs !== curFs) mixedFs = true;
    if(ff === undefined) ff = curFf; else if(ff !== curFf) mixedFf = true;
  }
  return { fontSize: (any && !mixedFs) ? (fs || null) : null, fontFamily: (any && !mixedFf) ? (ff || null) : null };
}

function edOpenTextDoc(editLayer){
  if(typeof edCloseMenus === 'function') edCloseMenus();
  const shell = document.getElementById('tdShell');
  if(!shell) return;
  _tdInitOnce();
  const wasOpen = shell.style.display !== 'none' && shell.style.display !== '';
  // BUG CORREGIDO (reportado por Alberto): el botón "Editar texto" del panel
  // de propiedades (pp-td-edit) nunca cerraba ese panel antes de abrir el
  // editor de textos — antes no se notaba porque edOptionsPanel quedaba
  // oculto detrás del overlay del editor de textos (z-index más bajo), pero
  // la nueva regla #editorShell.td-open #edOptionsPanel (necesaria para
  // reutilizar la biblioteca, ver más abajo) lo eleva por encima de TODO,
  // así que ese panel abandonado se quedaba visible encima del editor de
  // textos. Cerrarlo aquí cubre TODAS las vías que abren el editor de
  // textos (no solo ese botón), no únicamente la que lo provocó.
  const _panelWasOpen = document.getElementById('edOptionsPanel')?.classList.contains('open');
  if(_panelWasOpen && typeof edCloseOptionsPanel === 'function') edCloseOptionsPanel();
  shell.style.display = 'flex';
  // Mismo mecanismo que 'gcp-open' (ver #editorShell.gcp-open #edOptionsPanel
  // en editor.css): permite reutilizar edOptionsPanel/_bibRenderPanel tal
  // cual para la biblioteca, con el panel por encima del overlay del editor
  // de textos — pedido explícito de Alberto: "reutiliza la biblioteca tal
  // como está en el editor de animaciones", en vez de un panel propio.
  document.getElementById('editorShell')?.classList.add('td-open');
  if(typeof _tdSyncViewportHeight === 'function') _tdSyncViewportHeight();
  // Título: "Editor de textos" en creación nueva; el nombre asignado a este
  // texto (ver _tdComputeFlowName/_tdApplyToCanvas) si se está reeditando uno
  // ya aplicado — antes de las pasadas de recálculo de la franja blanca de
  // más abajo, para que midan el título definitivo y no el que hubiera
  // quedado puesto de una reedición anterior en esta misma sesión.
  const _tdTitleEl = document.getElementById('tdProjectTitle');
  if(_tdTitleEl) _tdTitleEl.textContent = (editLayer && editLayer.name) || I18n.t('td_docTitle');
  // Botón/gesto atrás (PC y Android): cerrar el shell en vez de salir del editor.
  // Empuja una entrada de historial solo si no estaba ya abierto (evita duplicar
  // entradas si se reabre en modo edición sobre el mismo shell ya visible).
  if(!wasOpen) history.pushState({ tdShellOpen: true }, '', location.href);
  _tdRegisterBackInterceptor();
  requestAnimationFrame(_tdUpdateTitlePill);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(_tdUpdateTitlePill);
  setTimeout(_tdUpdateTitlePill, 200);
  setTimeout(_tdUpdateTitlePill, 600);
  const editorEl = document.getElementById('tdEditor');
  const applyBtn = document.getElementById('tdApplyBtn');
  const _tdSpacer = document.getElementById('tdSelTopSpacer');
  if(_tdSpacer) _tdSpacer.style.height = '0px'; // el hueco crecido en una sesión anterior no pinta nada aquí
  // sourceHTML puede no estar en ESTA hoja concreta — desde la optimización
  // que evita duplicarlo en cada hoja del flujo (ver _tdFindFlowSourceHTML),
  // solo UNA hoja del flujo lo guarda. Se busca aquí por si la hoja desde la
  // que se abrió (doble tap) no es esa.
  const _tdOwnerHTML = editLayer && editLayer._tdFlowId ? _tdFindFlowSourceHTML(editLayer._tdFlowId) : '';
  if(editLayer && editLayer.richLines && (editLayer.sourceHTML || _tdOwnerHTML)){
    // Reeditar un texto ya aplicado: cargar su HTML de origen y recordar su flowId
    // para que "Aplicar" sustituya estas hojas en vez de añadir otras nuevas.
    // Capas de v32.70 (sin _tdFlowId): adoptar uno ahora, como flujo de una sola hoja.
    _tdEditingFlowId = _tdEnsureFlowId(editLayer);
    const _tdHtmlToLoad = editLayer.sourceHTML || _tdOwnerHTML;
    if(editorEl && editorEl.editor) editorEl.editor.loadHTML(_tdHtmlToLoad);
    const _tdDetected = _tdDetectUniformFont(_tdHtmlToLoad);
    _tdDocFontSize = _tdDetected.fontSize;
    _tdDocFontFamily = _tdDetected.fontFamily;
    if(applyBtn){ applyBtn.textContent = '💾'; applyBtn.title = I18n.t('td_saveChanges'); }
    _tdLineHeightMult = editLayer.lineHeightMult || TD_LINE_MULT;
  } else {
    _tdEditingFlowId = null;
    if(applyBtn){ applyBtn.textContent = '💾'; applyBtn.title = I18n.t('td_applyToCanvas'); }
    _tdLineHeightMult = TD_LINE_MULT;
    // Siempre en blanco al abrir desde el menú — no se restaura nada de
    // sesiones anteriores (el único texto editable es el que ya está
    // aplicado al lienzo, y a ese solo se llega con doble tap sobre él).
    if(editorEl && editorEl.editor) editorEl.editor.loadHTML('');
    _tdDocFontSize = null;
    _tdDocFontFamily = null;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _tdDirty = false; // recién abierto — sin cambios todavía (ver edCloseTextDoc)
    _tdViewCurPage = 0;
    _tdCurrentOffset = 0;
    _tdAutoFollow = true;
    _tdSyncLineHeightMenuActive();
    _tdSyncFontMenuActive();
    _tdSyncAlignMenuActive();
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
// OPTIMIZACIÓN DE MEMORIA/TRÁFICO: un flujo de N hojas guardaba el HTML de
// origen COMPLETO (sourceHTML) N veces — una copia idéntica por cada hoja,
// ver _tdMakeTextLayer — incluidas todas las imágenes insertadas en
// cualquier punto del flujo, no solo las de esa hoja. Con imágenes de por
// medio (ver _tdProcessNewImageAttachment) esto multiplicaba por N tanto el
// tamaño guardado (local y nube) como lo descargado — y sourceHTML no lo lee
// NUNCA reader/reader.js ni js/reader.js (comprobado por grep: cero
// referencias), solo lo usa este propio editor para reabrir Trix al
// reeditar — así que cualquier lector de la obra publicada se lo descargaba
// sin usarlo jamás. Desde ahora solo UNA hoja del flujo guarda sourceHTML —
// las demás lo dejan sin definir (ver el borrado explícito en el punto 1 de
// _tdReflowFlowInPlace) — y esta función lo busca por CONTENIDO (qué hoja lo
// tiene de verdad), no por posición en el array, para que sobreviva a
// reordenar páginas (mover una página no cambia qué objeto de capa es, solo
// su índice — buscar "la primera por posición" se habría desincronizado; ver
// la nota de _tdFindFlowLayer arriba, que si se reutilizara tal cual para
// esto sería justo ese mismo fallo).
function _tdFindFlowSourceHTML(flowId){
  if(!flowId) return '';
  for(let i = 0; i < edPages.length; i++){
    const l = (edPages[i].layers || []).find(l => l && l._tdFlowId === flowId && l.sourceHTML);
    if(l) return l.sourceHTML;
  }
  return '';
}
// Llamada ANTES de borrar una hoja (desde cualquier botón "eliminar hoja" de
// la app — editor.js/edDeletePage y editor-pages.js/delBtn) — si esa hoja es
// la que guarda el sourceHTML del flujo (ver optimización de arriba) y
// quedan más hojas del mismo flujo, lo traslada a otra ANTES de perderlo. Si
// no, el flujo entero se quedaría sin HTML de origen y no se podría volver a
// reabrir para reeditar — aunque las demás hojas siguieran viéndose bien
// (richLines no depende de esto). Si no queda ninguna otra hoja del flujo,
// no hay nada que migrar: el flujo entero desaparece con esta hoja, como ya
// pasaba antes de esta optimización.
function _tdMigrateFlowSourceHTMLIfNeeded(pageIdx){
  const pg = edPages[pageIdx];
  if(!pg || !pg.layers) return;
  const owner = pg.layers.find(l => l && l._tdFlowId && l.sourceHTML);
  if(!owner) return;
  for(let i = 0; i < edPages.length; i++){
    if(i === pageIdx) continue;
    const target = (edPages[i].layers || []).find(l => l && l._tdFlowId === owner._tdFlowId);
    if(target){ target.sourceHTML = owner.sourceHTML; return; }
  }
}
// true justo antes de un history.back() AUTOPROVOCADO por nosotros mismos
// (al cerrar el editor de textos normalmente, para consumir la entrada de
// historial añadida al abrirlo) — y hasta que su propio popstate resultante
// llega. Necesaria porque, para ese momento, shell.style.display YA está en
// 'none' (se pone ANTES de llamar a history.back(), ver finishClose) — el
// interceptor de abajo NO puede usar shell.style.display para reconocer
// "el editor de textos seguía abierto" en ese preciso instante, aunque el
// popstate que está atrapando sea el suyo propio. Sin esto, ese popstate
// autoprovocado se le escapaba al router, que navegaba a lo que hubiera en
// el historial justo detrás — normalmente la vista de antes de abrir el
// editor general (bug reportado por Alberto: acababa en "Mis creaciones").
let _tdAwaitingSelfPopstate = false;

// Aviso de "cambios sin guardar" al cerrar el editor de textos — mismo
// patrón visual e interacción que _gcpSavePop del editor de animaciones,
// a petición de Alberto.
function _tdShowSavePrompt(){
  document.getElementById('_tdSavePop')?.remove();
  const pop = document.createElement('div');
  pop.id = '_tdSavePop';
  pop.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;touch-action:none';
  const _actionLabel = _tdEditingFlowId ? I18n.t('td_saveChanges') : I18n.t('td_applyToCanvas');
  pop.innerHTML = `<div id="_tdSaveBox" style="background:#fff;border-radius:12px;padding:24px 20px;max-width:300px;width:90%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.3)">
    <p style="margin:0 0 20px;font-size:1rem;font-weight:600;color:#222">${I18n.t('td_unsavedChanges')}</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button id="_tdPopSi" style="padding:12px;border:none;border-radius:8px;background:#ffe066;font-size:.95rem;font-weight:700;cursor:pointer">${_actionLabel}</button>
      <button id="_tdPopDiscard" style="padding:10px;border:1.5px solid #e88;border-radius:8px;background:#fff0f0;font-size:.9rem;color:#c00;cursor:pointer">${I18n.t('td_exitWithoutSaving')}</button>
    </div>
  </div>`;
  document.body.appendChild(pop);
  // Tocar fuera del cuadro → volver al editor de textos sin hacer nada
  pop.addEventListener('pointerdown', e => {
    if(!e.target.closest('#_tdSaveBox')) pop.remove();
    e.stopPropagation();
  }, true);
  pop.addEventListener('touchstart', e => e.stopPropagation(), { passive: true, capture: true });
  // Salir sin guardar → descartar y cerrar de verdad
  pop.querySelector('#_tdPopDiscard').addEventListener('pointerup', e => {
    e.stopPropagation();
    pop.remove();
    _tdDirty = false; // descartado — el siguiente cierre no debe volver a preguntar
    edCloseTextDoc();
  });
  // Guardar / Aplicar → aplica (que ya marca _tdDirty=false y cierra al final)
  pop.querySelector('#_tdPopSi').addEventListener('pointerup', e => {
    e.stopPropagation();
    pop.remove();
    _tdApplyToCanvas();
  });
}
function edCloseTextDoc(fromPopstate){
  const shell = document.getElementById('tdShell');
  const wasOpen = !!shell && shell.style.display !== 'none' && shell.style.display !== '';
  // Si hay cambios sin guardar, preguntar antes de cerrar — mismo patrón que
  // el editor de animaciones (gcpClose), a petición de Alberto. Se excluye
  // el cierre por atrás/popstate (fromPopstate=true): esa entrada de
  // historial ya se consumió sola, y complicar su reversión con un cuadro
  // de confirmación es más frágil de lo que vale la pena — ver los
  // comentarios de _tdAwaitingSelfPopstate más abajo sobre lo delicada que
  // es esa ruta.
  if(wasOpen && !fromPopstate && _tdDirty){
    _tdShowSavePrompt();
    return;
  }
  const finishClose = () => {
    if(shell) shell.style.display = 'none';
    document.getElementById('editorShell')?.classList.remove('td-open');
    _tdEditingFlowId = null;
    const applyBtn = document.getElementById('tdApplyBtn');
    if(applyBtn){ applyBtn.textContent = '💾'; applyBtn.title = I18n.t('td_applyToCanvas'); }
    // Si se cierra por la X o por "Aplicar" (no por el botón atrás), hay que
    // consumir la entrada de historial añadida al abrir — si no, el
    // siguiente "atrás" del usuario se quedaría "vacío" (solo cerraría un
    // shell ya cerrado).
    if(wasOpen && !fromPopstate && history.state && history.state.tdShellOpen){
      _tdAwaitingSelfPopstate = true;
      history.back();
      // Salvaguarda extra por si, aun así, el popstate esperado no llegara
      // nunca (p.ej. algún navegador que no lo dispare de forma fiable) —
      // se limpia la bandera sola para no dejarla puesta para siempre.
      setTimeout(() => { _tdAwaitingSelfPopstate = false; }, 500);
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
    // Nuestro propio history.back() (al cerrar normalmente, para consumir la
    // entrada de historial añadida al abrir) YA dejó shell.style.display en
    // 'none' antes de disparar este popstate — comprobar solo
    // shell.style.display haría pensar que el editor de textos "ya no
    // estaba abierto" en ese instante, y dejaría escapar el evento hacia el
    // router (bug reportado por Alberto: acababa en "Mis creaciones"). Se
    // comprueba esta bandera PRIMERO: si es nuestro propio popstate
    // autoprovocado, atraparlo siempre — ya se cerró todo, aquí solo hace
    // falta "tragarse" el evento para que el router no navegue con él.
    if(_tdAwaitingSelfPopstate){
      _tdAwaitingSelfPopstate = false;
      return true;
    }
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

  // Envuelto en una función anónima — si se pasara edCloseTextDoc directamente,
  // el clic lo invocaría con el propio Event como primer argumento (fromPopstate),
  // que al ser "truthy" hacía que el aviso de cambios sin guardar nunca se
  // disparase (bug reportado por Alberto: cerraba sin preguntar nada).
  document.getElementById('tdCloseBtn')?.addEventListener('click', () => edCloseTextDoc());
  document.getElementById('tdApplyBtn')?.addEventListener('click', _tdApplyToCanvas);
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

  // CAUSA RAÍZ del bug "no se ven las imágenes" (encontrada con el
  // diagnóstico 🩺: insertFile() no lanzaba excepción, pero el documento se
  // quedaba con 0 adjuntos). Esta regla bloqueaba TODOS los archivos sin
  // excepción — tenía sentido cuando las imágenes solo vivían en el canvas
  // ("las imágenes ya tienen su propio flujo en el editor"), pero ahora que
  // SÍ tienen su propio flujo DENTRO del editor de textos (botón
  // "Insertar", ver _tdInsertImage), esa misma regla bloqueaba también la
  // función nueva sin dar ningún error visible — compositionShouldAcceptFile
  // devuelve false y insertFile() simplemente no inserta nada, en silencio.
  // Se mantiene el rechazo para cualquier adjunto que NO sea imagen (vídeo,
  // PDF, documentos...), que siguen sin tener sentido en el flujo de texto.
  document.addEventListener('trix-file-accept', e => {
    const isImg = !!(e.file && e.file.type && e.file.type.startsWith('image/'));
    if(typeof _tdLogImg === 'function') _tdLogImg('evento trix-file-accept', (e.file ? (e.file.name + ' ' + e.file.type) : '(sin file)') + ' → ' + (isImg ? 'ACEPTADO' : 'RECHAZADO (no es imagen)'));
    if(!isImg) e.preventDefault();
  });

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
      _tdDirty = true; // hay cambios sin guardar — ver edCloseTextDoc
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
      clearTimeout(_tdFollowTimer);
      _tdFollowTimer = setTimeout(_tdCenterActiveLine, 100);
      // rAF: el propio Android tarda un instante en decidir/mostrar su menú
      // nativo de selección (Copiar/Pegar) tras esta selección — se
      // comprueba en el frame siguiente para medir ya con la selección
      // asentada (ver _tdEnsureSelectionClearance).
      requestAnimationFrame(_tdEnsureSelectionClearance);
    });
    // Refuerzo de tamaño/tipo de letra "de todo el documento" (ver
    // _tdDocFontSize/_tdDocFontFamily y _tdDetectUniformFont). Sin esto,
    // escribir justo al principio del texto — o en cualquier punto donde
    // Trix no tenga un carácter previo del que heredar el atributo, p.ej.
    // recién reeditado — volvía al tamaño/tipo por defecto en vez de
    // mantener el elegido (comprobado con Trix real: es un límite genuino
    // de su herencia de atributos, no un fallo de guardado). Solo actúa con
    // el cursor colapsado (sin selección real) Y sin que YA haya un
    // tamaño/tipo activo en ese punto — así nunca pisa una selección local
    // con un tamaño distinto a propósito (p.ej. una palabra puesta más
    // grande a mano).
    editorEl.addEventListener('trix-selection-change', () => {
      const editor = editorEl.editor;
      if(!editor) return;
      const range = editor.getSelectedRange();
      if(!range || range[0] !== range[1]) return;
      let cur = {};
      try{ cur = editor.composition.getCurrentTextAttributes() || {}; }catch(_e){}
      if(_tdDocFontSize && !cur.fontSize){
        try{ editor.activateAttribute('fontSize', _tdDocFontSize); }catch(_e){}
      }
      if(_tdDocFontFamily && !cur.fontFamily){
        try{ editor.activateAttribute('fontFamily', _tdDocFontFamily); }catch(_e){}
      }
    });
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
  _tdWireParrafoControls();
  _tdWireInsertImage();

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
  // Hueco reservado bajo el texto para que CUALQUIER línea, incluida la
  // última del documento, pueda subir hasta el centro de la pantalla — ver
  // #tdBottomSpacer en editor.css. La mitad del alto visible es lo mínimo
  // que hace falta: en el peor caso (escribiendo justo en la última línea,
  // con el scroll ya en su tope), su borde inferior queda exactamente a
  // media pantalla, ni un píxel más abajo.
  const bottomSpacer = document.getElementById('tdBottomSpacer');
  if(bottomSpacer) bottomSpacer.style.height = Math.round(availH / 2) + 'px';
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
  // Forzar un recálculo fresco de la paginación/vista previa ANTES de leer
  // nada del DOM — sin esto, si se pulsa 🩺 justo después de escribir (antes
  // de que el recálculo normal, con una pequeña demora, llegue a disparar),
  // las líneas .td-pagebreak-line que se leen más abajo pueden ser de ANTES
  // del último cambio, dando la falsa impresión de que el salto de página
  // "va con retraso" cuando en realidad solo hacía falta esperar un
  // instante. _tdRecomputeViewPagination no necesita argumentos (lee todo
  // del DOM vivo por su cuenta) y es seguro llamarla aunque el editor de
  // textos esté vacío o cerrado (comprueba sus propios elementos antes de
  // hacer nada).
  try{ if(typeof _tdRecomputeViewPagination === 'function') _tdRecomputeViewPagination(); }catch(_e){}
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  L('══ DIAGNÓSTICO EDITOR DE TEXTOS — acentos/IME/imágenes ══');
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
      const _vCache = _cacheNamesV.find(n => /^comxow-v\d+-\d+$/.test(n));
      if(_vCache) _tdDiagVersion = _vCache.replace('comxow-v', 'v').replace(/-(\d+)$/, '.$1') + ' (por SW cache)';
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

  // Diagnóstico de inserción de imágenes — pedido explícito por Alberto tras
  // comprobar que ninguna imagen se ve en el editor de textos. Combina el
  // historial paso a paso (_tdLogImg, ver _tdInsertImage/_tdWireImageResize)
  // con una foto EN VIVO del estado actual: adjuntos que Trix cree tener,
  // elementos <img> que de verdad hay en el DOM ahora mismo, y un vistazo al
  // HTML crudo — para poder comparar los tres y ver en cuál de ellos se
  // pierde la imagen.
  L('');
  L('── Inserción de imágenes: historial paso a paso (' + (window._tdImgLog || []).length + ') ──');
  if((window._tdImgLog || []).length) window._tdImgLog.forEach(l => L(l));
  else L('(vacío — no se ha intentado insertar ninguna imagen todavía en esta carga de página)');

  L('');
  L('── Inserción de imágenes: estado EN VIVO ahora mismo ──');
  try{
    const editorImg = document.getElementById('tdEditor');
    L('tdGalleryBtn existe: ' + !!document.getElementById('tdGalleryBtn'));
    L('tdCameraBtn existe: ' + !!document.getElementById('tdCameraBtn'));
    L('tdFileGallery (input file) existe: ' + !!document.getElementById('tdFileGallery'));
    L('tdImgResizeBox existe: ' + !!document.getElementById('tdImgResizeBox'));
    L('editorEl.editor existe: ' + !!(editorImg && editorImg.editor));
    if(editorImg && editorImg.editor){
      const ed = editorImg.editor;
      L('typeof editor.insertFile: ' + typeof ed.insertFile);
      L('typeof editor.getDocument: ' + typeof ed.getDocument);
      let atts = [];
      try{ atts = ed.getDocument().getAttachments(); }catch(e){ L('  Error en editor.getDocument().getAttachments(): ' + e.message); }
      L('Adjuntos que Trix dice tener ahora mismo: ' + atts.length);
      atts.forEach((a, i) => {
        let w, h, url, contentType;
        try{ w = a.getWidth(); }catch(e){ w = 'ERROR:' + e.message; }
        try{ h = a.getHeight(); }catch(e){ h = 'ERROR:' + e.message; }
        try{ url = a.getURL(); }catch(e){ url = 'ERROR:' + e.message; }
        try{ contentType = a.getContentType ? a.getContentType() : a.attributes?.get?.('contentType'); }catch(e){ contentType = 'ERROR:' + e.message; }
        L(`  adjunto ${i}: id=${a.id} width=${w} height=${h} contentType=${contentType} url=${url ? (url.slice(0,40) + '…(' + url.length + ' car.)') : '(sin url)'}`);
      });
    }
    const imgsInDom = editorImg ? editorImg.querySelectorAll('img') : [];
    L('Elementos <img> en el DOM del editor ahora mismo: ' + imgsInDom.length);
    imgsInDom.forEach((im, i) => {
      const cs = getComputedStyle(im);
      L(`  img ${i}: width(attr)=${im.getAttribute('width')} height(attr)=${im.getAttribute('height')} naturalWidth=${im.naturalWidth} naturalHeight=${im.naturalHeight} complete=${im.complete} src.length=${im.src.length} src.slice(0,30)=${JSON.stringify(im.src.slice(0,30))}`);
      L(`    CSS computado: display=${cs.display} visibility=${cs.visibility} width=${cs.width} height=${cs.height} opacity=${cs.opacity}`);
      const figParent = im.closest('figure');
      L(`    <figure> ancestro: ${figParent ? ('class="' + figParent.className + '" data-trix-id=' + figParent.dataset.trixId) : '(ninguno — el <img> no está dentro de un <figure>)'}`);
    });
    const hiddenImg = document.getElementById('tdHiddenInput');
    const htmlImg = hiddenImg ? hiddenImg.value : '';
    const figCount = (htmlImg.match(/<figure/g) || []).length;
    L('Nº de "<figure" en el HTML serializado (tdHiddenInput.value): ' + figCount);
    if(figCount){
      let searchFrom = 0;
      for(let i = 0; i < figCount; i++){
        const p = htmlImg.indexOf('<figure', searchFrom);
        if(p < 0) break;
        L(`  fragmento ${i}: ` + JSON.stringify(htmlImg.slice(p, p + 260)));
        searchFrom = p + 1;
      }
    }
  }catch(e){ L('Error en diagnóstico de imágenes: ' + e.message + '\n' + e.stack); }

  // Diagnóstico específico del quiebro de página — pedido para localizar
  // EXACTAMENTE dónde diverge el cálculo real en el dispositivo de Alberto,
  // tras varios intentos fallidos basados solo en razonamiento/pruebas sin
  // motor de layout real. Recalcula TODO el mismo camino que
  // _tdRecomputeViewPagination, mostrando cada paso por separado.
  L('');
  L('── Geometría del quiebro de página (estado real ahora mismo) ──');
  try{
    const hiddenDiag = document.getElementById('tdHiddenInput');
    const innerDiag = document.getElementById('tdPage');
    if(!hiddenDiag || !editorEl || !innerDiag){
      L('(faltan elementos — editor no abierto o incompleto)');
    } else {
      const htmlDiag = editorEl.innerHTML || hiddenDiag.value || '';
      L('editorEl.innerHTML === hiddenInput.value: ' + (editorEl.innerHTML === hiddenDiag.value));
      const blocksDiag = _tdParseBlocks(htmlDiag);
      L('Nº de bloques: ' + blocksDiag.length);
      const flatTextDiag = _tdBlocksFlatText(blocksDiag);
      L('Longitud texto plano: ' + flatTextDiag.length);
      const lineHeightMultDiag = _tdLineHeightMult;
      const editingLayerDiag = _tdEditingFlowId ? _tdFindFlowLayer(_tdEditingFlowId) : null;
      const marginFracXDiag = (editingLayerDiag && editingLayerDiag.marginXFrac) || TD_MARGIN_FRAC;
      const editingFramesDiag = _tdEditingFlowId ? _tdEditingFlowFrames(_tdEditingFlowId) : null;
      const frameSizesDiag = editingFramesDiag || {pw: edPageW(), ph: edPageH()};
      L('_tdEditingFlowId: ' + _tdEditingFlowId);
      L('Marco usado (frameSizes): ' + JSON.stringify(frameSizesDiag) + (editingFramesDiag ? ' (por página: alto real solo si _tdBoxManualH, si no página completa)' : ' (página completa — sin flujo real)'));
      // Nº de hojas REALES que ya tiene este flujo en edPages (lo que hay
      // aplicado de verdad en el lienzo) frente a las que predice esta
      // recarga de la vista previa — si no coinciden, la vista previa está
      // calculando un reparto distinto al que existe de verdad ahora mismo.
      const _tdRealPageCount = _tdEditingFlowId
        ? edPages.filter(p => (p.layers || []).some(l => l && l._tdFlowId === _tdEditingFlowId)).length
        : null;
      L('Nº de hojas REALES ya existentes en edPages para este flujo: ' + _tdRealPageCount);
      const { pageStartChars: pscDiag, pages: pagesDiag } = _tdLayoutPages(
        blocksDiag, frameSizesDiag, lineHeightMultDiag,
        { marginFracX: marginFracXDiag, marginFracY: TD_MARGIN_FRAC, bodySize: TD_BODY_SIZE, h1Size: TD_H1_SIZE },
        []
      );
      L('Nº de hojas que PREDICE la vista previa ahora mismo (pageStartChars.length): ' + pscDiag.length);
      L('pageStartChars: ' + JSON.stringify(pscDiag));
      // NUEVO — pageStartChars[i] DEBE avanzar siempre respecto al anterior.
      // Confirmado con ejecución real (Playwright + funciones reales del
      // proyecto): cuando varias imágenes seguidas no caben TODAS juntas en
      // la misma hoja (alguna se va a la siguiente), como no consumen
      // caracteres de texto, dos saltos de hoja DISTINTOS pueden terminar
      // apuntando al mismo carácter — normalmente inofensivo si ambos lados
      // de esos saltos concretos son imágenes (_tdImagesAtPageEdges usa la
      // imagen real del DOM, no este número), pero si CUALQUIER cosa aguas
      // abajo (arrastrar un salto a mano, u otra lógica) busca por posición
      // en este array esperando valores únicos, un duplicado la confundiría.
      for(let i = 1; i < pscDiag.length; i++){
        if(pscDiag[i] === pscDiag[i - 1]){
          L(`  ⚠️⚠️⚠️ pageStartChars[${i}] === pageStartChars[${i - 1}] (ambos ${pscDiag[i]}) — dos saltos de hoja distintos apuntan al mismo carácter, probablemente por varias imágenes/líneas en blanco seguidas sin texto real entre ellas.`);
        }
      }

      // NUEVO — Verificación cruzada pageStartChars vs pages: pageStartChars[i]
      // es el offset (sobre flatText) que se usa para dibujar la línea de
      // salto visual (ver _tdComputeSplitGeometry); pages[i] es el contenido
      // REAL que de verdad se reparte en cada hoja (lo que se dibuja en el
      // lienzo). Si el carácter de flatText en pscDiag[i] no corresponde de
      // verdad al principio de pagesDiag[i], la línea punteada se dibuja en
      // un sitio que no es el salto real.
      //
      // ANTES esta comprobación usaba una ventana de tolerancia ancha
      // (±80 caracteres) para decidir "coincide" — bug propio detectado
      // gracias a Alberto: dentro de esa ventana tan ancha, las 3 primeras
      // palabras de la hoja real casi siempre APARECEN en algún punto
      // cercano aunque pageStartChars esté desviado varias decenas de
      // caracteres — dando "✓ coincide" en casos que en realidad NO
      // coincidían, ocultando el desvío real. Ahora se busca la posición
      // EXACTA donde aparecen esas primeras palabras (sin límite de
      // ventana) y se informa la desviación real en caracteres — sin
      // margen oculto de ningún tipo.
      L('');
      L('── Verificación cruzada: pageStartChars vs primera línea REAL de cada hoja (búsqueda EXACTA, sin margen de tolerancia) ──');
      for(let i = 1; i < pagesDiag.length; i++){
        const c = pscDiag[i];
        const primeraLineaReal = pagesDiag[i][0];
        if(primeraLineaReal && primeraLineaReal.kind === 'image'){
          L(`  pageStartChars[${i}]=${c} (hoja ${i + 1}) → primera línea es una imagen, se posiciona por el elemento DOM real, no por este número — se omite.`);
          continue;
        }
        const primeraLineaTexto = primeraLineaReal
          ? (primeraLineaReal.runs || []).map(r => r.text || '').join('').trim()
          : '';
        const primerasPalabras = primeraLineaTexto.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
        if(!primerasPalabras){
          L(`  pageStartChars[${i}]=${c} (hoja ${i + 1}) → primera línea real vacía, no hay frase que buscar — se omite.`);
          continue;
        }
        const posicionReal = flatTextDiag.indexOf(primerasPalabras);
        const desvio = posicionReal === -1 ? null : (posicionReal - c);
        L(`  pageStartChars[${i}]=${c} (hoja ${i + 1}) — buscando "${primerasPalabras}"`);
        if(posicionReal === -1){
          L(`    ⚠️⚠️⚠️ NO SE ENCUENTRA en todo el texto — algo más raro está pasando aquí.`);
        } else if(desvio === 0){
          L(`    ✓ Coincide EXACTO (aparece justo en c=${c}).`);
        } else {
          L(`    ⚠️⚠️⚠️ Aparece de verdad en el carácter ${posicionReal}, DESVIADO ${desvio > 0 ? '+' : ''}${desvio} caracteres respecto a pageStartChars[${i}]=${c}.`);
        }
      }

      // NUEVO — Estado de persistencia de tamaño/tipo de letra "de todo el
      // documento" (_tdDocFontSize/_tdDocFontFamily, ver _tdDetectUniformFont
      // y _tdApplyScoped). Si el valor detectado AHORA no coincide con lo que
      // Alberto eligió, o si el desglose de abajo muestra más de un valor
      // real cuando debería haber uno solo, aquí se ve por qué.
      L('');
      L('── Tamaño/tipo de letra "de todo el documento" ──');
      L('_tdDocFontSize (variable en memoria ahora mismo): ' + _tdDocFontSize);
      L('_tdDocFontFamily (variable en memoria ahora mismo): ' + _tdDocFontFamily);
      const _detectedNowDiag = _tdDetectUniformFont(htmlDiag);
      L('_tdDetectUniformFont(htmlDiag) → fontSize: ' + _detectedNowDiag.fontSize + '  fontFamily: ' + _detectedNowDiag.fontFamily);
      const _tmpDiagFs = document.createElement('div');
      _tmpDiagFs.innerHTML = htmlDiag;
      const _sizesFoundDiag = {}, _familiesFoundDiag = {};
      const _walkerDiagFs = document.createTreeWalker(_tmpDiagFs, NodeFilter.SHOW_TEXT);
      let _nodeDiagFs;
      while((_nodeDiagFs = _walkerDiagFs.nextNode())){
        if(!_nodeDiagFs.textContent || !_nodeDiagFs.textContent.trim()) continue;
        let el = _nodeDiagFs.parentElement, curFs = '(sin fontSize propio → tamaño por defecto)', curFf = '(sin fontFamily propio → tipo por defecto)';
        while(el && el !== _tmpDiagFs){
          if(curFs.startsWith('(') && el.style && el.style.fontSize) curFs = el.style.fontSize;
          if(curFf.startsWith('(') && el.style && el.style.fontFamily) curFf = el.style.fontFamily;
          el = el.parentElement;
        }
        _sizesFoundDiag[curFs] = (_sizesFoundDiag[curFs] || 0) + _nodeDiagFs.textContent.length;
        _familiesFoundDiag[curFf] = (_familiesFoundDiag[curFf] || 0) + _nodeDiagFs.textContent.length;
      }
      L('Desglose real de fontSize (nº de caracteres por valor encontrado): ' + JSON.stringify(_sizesFoundDiag));
      L('Desglose real de fontFamily (nº de caracteres por valor encontrado): ' + JSON.stringify(_familiesFoundDiag));

      // Tamaño de letra base usado para las imágenes (heightEm × este valor
      // = alto real en el lienzo, ver _tdLayoutPages) y el de la vista en
      // vivo usado para MEDIR esas imágenes al insertarlas (ver
      // _tdParseBlocks) — si uno cambia y el otro no, el alto calculado deja
      // de corresponder a la proporción real vista en el editor.
      let _editorFontPxDiag = 16;
      try{ _editorFontPxDiag = parseFloat(getComputedStyle(editorEl).fontSize) || 16; }catch(_e){}
      L('editorFontPx (usado para medir heightEm de imágenes): ' + _editorFontPxDiag);
      L('TD_BODY_SIZE (usado como baseFontSize por defecto en el lienzo): ' + TD_BODY_SIZE);

      // Todas las imágenes encontradas en los bloques, con su heightEm ya
      // calculado (ver _tdParseBlocks) y el imgW/imgH que resultaría de
      // aplicar EXACTAMENTE la misma fórmula que _tdLayoutPages (heightEm
      // con tope TD_IMG_MAX_HEIGHT_FRAC — ver ese comentario), para el
      // marco de CADA página del flujo (el ancho de columna varía si alguna
      // hoja se redimensionó a mano). widthFrac se sigue mostrando como
      // referencia aunque ya no participa en el tamaño final (ver historial
      // en el comentario de _tdLayoutPages).
      L('');
      L('── Imágenes encontradas en los bloques (heightEm ya calculado) ──');
      let _imgCountDiag = 0;
      blocksDiag.forEach((block, bi) => {
        (block.runs || []).forEach(run => {
          if(!run.isImage) return;
          _imgCountDiag++;
          L(`  imagen ${_imgCountDiag} (bloque ${bi}): heightEm=${run.heightEm} aspect=${run.aspect} widthFrac=${run.widthFrac} (ya no se usa para el tamaño, solo referencia)`);
          frameSizesDiag && (Array.isArray(frameSizesDiag) ? frameSizesDiag : [frameSizesDiag]).forEach((f, fi) => {
            const mxF = f.pw * marginFracXDiag;
            const textWF = f.pw - mxF * 2;
            const availImgF = Math.max(20, textWF);
            const textHF = f.ph - (f.ph * TD_MARGIN_FRAC * 2);
            let imgHF = Math.max(1, Math.round((run.heightEm || 5) * TD_BODY_SIZE));
            let imgWF = Math.max(1, Math.round(imgHF * (run.aspect || 1)));
            if(imgWF > availImgF){ imgWF = availImgF; imgHF = Math.max(1, Math.round(imgWF / (run.aspect || 1))); }
            const maxImgHF = Math.max(1, Math.round(textHF * TD_IMG_MAX_HEIGHT_FRAC));
            const cappedF = imgHF > maxImgHF;
            if(cappedF){
              imgHF = maxImgHF;
              imgWF = Math.max(1, Math.round(imgHF * (run.aspect || 1)));
              if(imgWF > availImgF){ imgWF = availImgF; imgHF = Math.max(1, Math.round(imgWF / (run.aspect || 1))); }
            }
            L(`    FINAL -> imgW=${imgWF} imgH=${imgHF} (${Math.round(100*imgHF/f.ph)}% del alto de página)${cappedF ? '  [tope ' + Math.round(TD_IMG_MAX_HEIGHT_FRAC*100) + '% aplicado]' : ''}`);
          });
        });
      });
      if(!_imgCountDiag) L('  (ninguna imagen encontrada en los bloques)');

      // ══ NUEVO — Comparación DIRECTA: lo que YA está aplicado de verdad en
      // cada hoja de este flujo (edPages, lo que se ve en el editor
      // general) frente a lo que esta MISMA recarga de la vista previa
      // predice para esas mismas hojas. Pedido para localizar el bug "el
      // salto de hoja del editor de textos no coincide con el del editor
      // general, desde que se insertan imágenes" — varias reproducciones
      // sintéticas (documento nuevo con imágenes, redimensionado a mano,
      // ciclo completo aplicar→cerrar→reabrir) NO han conseguido reproducir
      // el fallo con ejecución real de las funciones tal cual están en el
      // código, así que hace falta ver dónde diverge en un documento real.
      // src se excluye a propósito de la comparación (puede ser blob: en
      // vivo vs data: ya persistido sin que eso afecte al tamaño/salto).
      L('');
      L('── Comparación: hoja(s) YA APLICADAS de este flujo vs predicción de la vista previa AHORA MISMO ──');
      if(!_tdEditingFlowId){
        L('(no se está reeditando ningún flujo ahora mismo — para esta comparación, reabre con doble toque un texto YA aplicado que tenga imágenes y pulsa 🩺 sin escribir nada más)');
      } else {
        const _tdRealPages = [];
        edPages.forEach((pg, pgIdx) => {
          const layer = (pg.layers || []).find(l => l && l._tdFlowId === _tdEditingFlowId);
          if(layer) _tdRealPages.push({ pgIdx, layer });
        });
        const _tdSummarizeLines = lns => (lns || []).map(l => l.kind === 'image'
          ? `[IMG ${l.imgW}x${l.imgH}]`
          : JSON.stringify((l.runs || []).map(r => r.text || '').join('').slice(0, 150)));
        L('Nº de hojas YA aplicadas: ' + _tdRealPages.length + '   Nº de hojas que predice la vista previa: ' + (pagesDiag ? pagesDiag.length : 0));
        // NUEVO — texto COMPLETO reconstruido de todas las hojas YA aplicadas
        // (concatenando el texto real de richLines, sin el límite de 60
        // caracteres de _tdPlainSummary) frente a la longitud del HTML que
        // hay cargado AHORA MISMO en el editor (flatTextDiag) — una
        // diferencia grande de longitud aquí, sin haber escrito nada en esta
        // sesión, apunta a que sourceHTML (lo que se cargó al reabrir) y
        // richLines (lo que de verdad hay dibujado en el lienzo) vienen de
        // dos versiones distintas del texto, no a un problema de fórmula.
        const _tdRealFullText = _tdRealPages.map(rp => (rp.layer.richLines || [])
          .map(l => l.kind === 'image' ? '' : (l.runs || []).map(r => r.text || '').join(''))
          .join('')).join('');
        L('Longitud del texto reconstruido de TODAS las hojas ya aplicadas: ' + _tdRealFullText.length + ' caracteres');
        L('Longitud del texto plano cargado ahora mismo (flatTextDiag): ' + flatTextDiag.length + ' caracteres' + (flatTextDiag.length !== _tdRealFullText.length ? '  ⚠️⚠️⚠️ DISTINTA — sourceHTML y lo realmente aplicado no son el mismo texto' : '  ✓ misma longitud'));
        const _tdMaxCompare = Math.max(_tdRealPages.length, pagesDiag ? pagesDiag.length : 0);
        for(let i = 0; i < _tdMaxCompare; i++){
          const real = _tdRealPages[i];
          const fresh = pagesDiag ? pagesDiag[i] : null;
          L('');
          L(`— Hoja ${i + 1} de ${_tdMaxCompare} (índice en edPages: ${real ? real.pgIdx : '—'}) —`);
          if(!real) L('  (no existe ya aplicada — la vista previa predice MÁS hojas de las que hay ahora)');
          if(!fresh) L('  (la vista previa no predice esta hoja — hay MÁS hojas ya aplicadas de las que calcula ahora)');
          if(real && fresh){
            const realLines = _tdSummarizeLines(real.layer.richLines);
            const freshLines = _tdSummarizeLines(fresh);
            let firstDiff = -1;
            for(let li = 0; li < Math.max(realLines.length, freshLines.length); li++){
              if(realLines[li] !== freshLines[li]){ firstDiff = li; break; }
            }
            L('  Nº de líneas — YA aplicada: ' + realLines.length + '  |  vista previa: ' + freshLines.length + (realLines.length === freshLines.length ? '  ✓' : '  ⚠️ DISTINTO'));
            if(firstDiff === -1){
              L('  ✓ Contenido IDÉNTICO línea a línea.');
            } else {
              L('  ⚠️⚠️⚠️ DIVERGEN a partir de la línea ' + (firstDiff + 1) + ':');
              L('    YA aplicada:  ' + (realLines[firstDiff] !== undefined ? realLines[firstDiff] : '(no hay más líneas)'));
              L('    vista previa: ' + (freshLines[firstDiff] !== undefined ? freshLines[firstDiff] : '(no hay más líneas)'));
            }
            L('  Última línea — YA aplicada:  ' + (realLines[realLines.length - 1] || '(vacía)'));
            L('  Última línea — vista previa: ' + (freshLines[freshLines.length - 1] || '(vacía)'));
          }
        }
      }

      // NUEVO — comparación DIRECTA del recuento de caracteres: el que da
      // _tdBlocksFlatText (usado por _tdLayoutPages para pageStartChars) vs.
      // el que da recorrer el DOM vivo directamente con el MISMO filtro que
      // usa _tdCharOffsetToPoint (_tdIsInternalTrixTextNode) para
      // encontrarle sitio en pantalla a cada offset — si estos dos NUNCA
      // deberían diferir (son, en teoría, el mismo criterio de recuento
      // aplicado dos veces), pero si alguna imagen antigua (insertada con
      // una versión anterior de la app) dejó una estructura HTML que uno de
      // los dos criterios cuenta distinto del otro, aquí debe verse
      // exactamente en qué imagen empieza el desajuste — recorriendo el DOM
      // nodo a nodo y comparando, tras CADA nodo, contra dónde debería
      // estar según flatTextDiag en ese mismo punto.
      L('');
      L('── Recuento DOM directo vs flatText (deben coincidir SIEMPRE) ──');
      try{
        const walkerCmp = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, {
          acceptNode: n => _tdIsInternalTrixTextNode(n, editorEl) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        });
        let domCount = 0, nodeCmp, firstDivergence = null, nodeIdx = 0;
        while(nodeCmp = walkerCmp.nextNode()){
          const len = nodeCmp.textContent.length;
          // Comparar el FRAGMENTO que este nodo aporta contra lo que
          // flatTextDiag tiene en esa misma franja [domCount, domCount+len).
          const expected = flatTextDiag.slice(domCount, domCount + len);
          const got = nodeCmp.textContent;
          if(expected !== got && firstDivergence === null){
            firstDivergence = {
              nodeIdx, domCount, len,
              got: JSON.stringify(got.slice(0, 40)),
              expected: JSON.stringify(expected.slice(0, 40)),
              parentTag: nodeCmp.parentElement ? nodeCmp.parentElement.tagName : '?',
              parentClass: nodeCmp.parentElement ? nodeCmp.parentElement.className : '',
              grandParentTag: nodeCmp.parentElement && nodeCmp.parentElement.parentElement ? nodeCmp.parentElement.parentElement.tagName : '?',
              grandParentClass: nodeCmp.parentElement && nodeCmp.parentElement.parentElement ? nodeCmp.parentElement.parentElement.className : ''
            };
          }
          domCount += len;
          nodeIdx++;
        }
        L('  longitud según flatText (_tdBlocksFlatText): ' + flatTextDiag.length);
        L('  longitud recorriendo el DOM directamente (mismo filtro que _tdCharOffsetToPoint): ' + domCount);
        if(domCount === flatTextDiag.length && !firstDivergence){
          L('  ✓ Coinciden exactamente — el problema no está en un desajuste de recuento global.');
        } else {
          L('  ⚠️⚠️⚠️ NO COINCIDEN (diferencia: ' + (domCount - flatTextDiag.length) + ' caracteres)');
          if(firstDivergence){
            L('  Primer nodo del DOM donde diverge (nº ' + firstDivergence.nodeIdx + ', empieza en offset ' + firstDivergence.domCount + ' según el recuento del DOM):');
            L('    contenido real del nodo: ' + firstDivergence.got);
            L('    lo que flatText tiene ahí: ' + firstDivergence.expected);
            L('    elemento padre: <' + firstDivergence.parentTag + ' class="' + firstDivergence.parentClass + '">');
            L('    elemento abuelo: <' + firstDivergence.grandParentTag + ' class="' + firstDivergence.grandParentClass + '">');
          }
        }
      }catch(e){ L('  Error en la comparación: ' + e.message + '\n' + e.stack); }

      const innerRectDiag = innerDiag.getBoundingClientRect();
      L('innerRect (tdPage): ' + JSON.stringify({left: innerRectDiag.left, top: innerRectDiag.top, width: innerRectDiag.width}));

      for(let i = 1; i < pscDiag.length; i++){
        const c = pscDiag[i];
        L('');
        L(`— Salto ${i}: c=${c} —`);
        const lastReal = _tdLastNonSpaceOffset(flatTextDiag, c - 1);
        L('  lastReal (c-1 retrocedido ante espacio): ' + lastReal);
        L('  contexto en flatText (20 antes, carácter, 20 después): ' + JSON.stringify(flatTextDiag.slice(Math.max(0, lastReal - 20), lastReal) + '[' + flatTextDiag[lastReal] + ']' + flatTextDiag.slice(lastReal + 1, lastReal + 21)));
        const p1 = _tdCharOffsetToPoint(editorEl, lastReal);
        const p2 = _tdCharOffsetToPoint(editorEl, lastReal + 1);
        L('  p1 nodo: longitud=' + (p1 ? p1.node.textContent.length : 'null') + ' offset=' + (p1 ? p1.offset : 'null'));
        L('  p2 nodo: longitud=' + (p2 ? p2.node.textContent.length : 'null') + ' offset=' + (p2 ? p2.offset : 'null'));
        L('  ¿p1 y p2 son el MISMO nodo?: ' + (p1 && p2 ? (p1.node === p2.node) : 'n/a'));
        if(p1 && p2){
          try{
            const spanDiag = document.createRange();
            spanDiag.setStart(p1.node, p1.offset);
            spanDiag.setEnd(p2.node, p2.offset);
            L('  range.toString() del tramo (debería ser 1 carácter, el de arriba): ' + JSON.stringify(spanDiag.toString()));
            const rectsDiag = spanDiag.getClientRects();
            L('  span.getClientRects().length: ' + rectsDiag.length);
            if(rectsDiag.length){
              const r0 = rectsDiag[0];
              L('  rects[0]: ' + JSON.stringify({left: r0.left, right: r0.right, top: r0.top, bottom: r0.bottom}));
              L('  x calculado (rects[0].right, relativo al viewport — ver .td-pagebreak-line full-bleed): ' + r0.right);
            }
            // Rectángulo de la ÚLTIMA PALABRA completa ("confín."), no solo el
            // último carácter — por si el problema es específico de medir un
            // tramo de 1 solo carácter en el límite exacto de un nodo largo.
            const wordStart = Math.max(0, lastReal - 6); // "confin." son 7 caracteres, empieza 6 antes del punto
            const pw1 = _tdCharOffsetToPoint(editorEl, wordStart);
            const pw2 = _tdCharOffsetToPoint(editorEl, lastReal + 1);
            if(pw1 && pw2){
              const wordSpan = document.createRange();
              wordSpan.setStart(pw1.node, pw1.offset);
              wordSpan.setEnd(pw2.node, pw2.offset);
              L('  Palabra completa medida (offset ' + wordStart + ' a ' + (lastReal+1) + '): ' + JSON.stringify(wordSpan.toString()));
              const wordRects = wordSpan.getClientRects();
              L('  palabra.getClientRects().length: ' + wordRects.length);
              Array.from(wordRects).forEach((wr, wi) => L(`    rects[${wi}]: ` + JSON.stringify({left: wr.left, right: wr.right, top: wr.top, bottom: wr.bottom})));
            }
          }catch(e){ L('  Error construyendo el tramo: ' + e.message); }
        }
        // NUEVO — comprobación directa de nodos de texto del DOM real
        // alrededor de este punto: si la MISMA palabra visual está partida
        // en dos (o más) nodos de texto DISTINTOS sin ningún espacio entre
        // ellos (p. ej. restos de una corrección/autocorrección), el
        // tokenizador (_tdParseBlocks, que separa "palabras" run por run —
        // ver el bucle de palabras en _tdLayoutPages) las trataría como dos
        // palabras independientes, permitiendo un salto de línea justo
        // ENTRE ellas — la palabra se vería partida en la vista previa
        // aunque el cálculo del offset en sí sea correcto. Aquí se listan
        // todos los nodos de texto del editor cuyo contenido cae dentro de
        // una ventana de 40 caracteres alrededor de c, con su longitud y un
        // fragmento — si aparecen dos nodos consecutivos que juntos forman
        // una palabra sin espacio entre ellos, esa es la causa.
        try{
          const walkerDiag = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
          let nodeDiag, idxDiag = 0, foundAny = false;
          const winStart = Math.max(0, c - 20), winEnd = c + 20;
          while(nodeDiag = walkerDiag.nextNode()){
            const len = nodeDiag.textContent.length;
            if(idxDiag + len > winStart && idxDiag < winEnd){
              foundAny = true;
              const parentTag = nodeDiag.parentElement ? nodeDiag.parentElement.tagName : '?';
              const parentClass = nodeDiag.parentElement ? nodeDiag.parentElement.className : '';
              L(`  nodo DOM en [${idxDiag},${idxDiag+len}): ${JSON.stringify(nodeDiag.textContent)} (padre=<${parentTag} class="${parentClass}">)`);
            }
            idxDiag += len;
            if(idxDiag >= winEnd) break;
          }
          if(!foundAny) L('  (ningún nodo de texto encontrado en esa ventana — raro, revisar)');
        }catch(e){ L('  Error listando nodos DOM: ' + e.message); }
        // Punto de referencia CONOCIDO: el primer carácter del documento
        // (offset 0) — para comparar si SU rectángulo tiene sentido (cerca
        // del margen superior izquierdo de innerRect), y así saber si el
        // problema es general (también falla la referencia) o específico
        // de esta posición en concreto.
        try{
          const pRef1 = _tdCharOffsetToPoint(editorEl, 0);
          const pRef2 = _tdCharOffsetToPoint(editorEl, 1);
          if(pRef1 && pRef2){
            const refSpan = document.createRange();
            refSpan.setStart(pRef1.node, pRef1.offset);
            refSpan.setEnd(pRef2.node, pRef2.offset);
            const refRects = refSpan.getClientRects();
            L('  [referencia] primer carácter del documento (offset 0): ' + JSON.stringify(refSpan.toString()) + ' rect=' + (refRects.length ? JSON.stringify({left: refRects[0].left, top: refRects[0].top}) : 'null'));
          }
        }catch(e){ L('  Error en referencia: ' + e.message); }
      }

      // Estado REAL ya renderizado en el DOM ahora mismo (por si difiere del
      // recién recalculado arriba — p.ej. si algo no disparó un recompute)
      L('');
      L('── Elementos .td-pagebreak-line YA en el DOM ahora mismo ──');
      const linesInDom = document.querySelectorAll('.td-pagebreak-line');
      L('Cantidad: ' + linesInDom.length);
      linesInDom.forEach((el, i) => {
        L(`  línea ${i}: --split-x=${el.style.getPropertyValue('--split-x')} --gap=${el.style.getPropertyValue('--gap')} top=${el.style.top}`);
        const conn = el.querySelector('.td-pagebreak-connector');
        if(conn){
          const cr = conn.getBoundingClientRect();
          L(`    .td-pagebreak-connector renderizado en: left=${cr.left} top=${cr.top} width=${cr.width} height=${cr.height}`);
        }
      });
    }
  }catch(e){ L('Error en diagnóstico de geometría: ' + e.message + '\n' + e.stack); }

  // Mostrar panel — mismo patrón visual que _edRunDiag (editor.js, botón 🩺 edDiagBtn)
  let p = document.getElementById('_tdDiagPanel');
  if(!p){
    p = document.createElement('div');
    p.id = '_tdDiagPanel';
    p.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;color:#0f0;font:11px monospace;display:flex;flex-direction:column;padding:8px;';
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:6px;flex-shrink:0';
    hdr.innerHTML = '<b style="color:#fff">DIAGNÓSTICO ACENTOS/IME/IMÁGENES</b>';
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

// Tamaños/fuentes admitidos al pegar contenido externo — mismo rango que los
// controles del editor (ver dd-tdFontFamily/dd-tdFontSize en views.js), para
// que el texto pegado quepa en la página igual que el escrito a mano.
const TD_PASTE_FONT_MIN = 12, TD_PASTE_FONT_MAX = 40;
const TD_ALLOWED_FONTS = ['Lora','Patrick Hand','Bangers','Permanent Marker','Bebas Neue','Oswald','Comic Neue','Press Start 2P','Arial','Verdana'];
function _tdSanitizePastedHTML(html){
  try{
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    // El propio navegador, al copiar texto DE DENTRO del editor (Ctrl+C
    // sobre texto ya escrito aquí, sin pasar por fuera de la app), suele
    // incrustar el tamaño de letra CSS COMPUTADO en ese instante como un
    // estilo explícito en el fragmento copiado — no porque el usuario lo
    // eligiera a propósito, sino como parte de cómo el navegador serializa
    // la selección. El CSS de EDICIÓN en pantalla (.td-editor, 1.05rem ≈
    // 16.8px) es un tamaño DISTINTO del que de verdad se aplica al lienzo
    // (TD_BODY_SIZE = 22px) — texto que NUNCA tuvo un tamaño explícito
    // (usaba el del bloque por defecto) volvía a pegarse con ese ~16.8px
    // "fantasma" incrustado, tratado luego como si fuera un tamaño distinto
    // a propósito. Bug reportado por Alberto: párrafos copiados y pegados
    // dentro del mismo documento salían con un tamaño distinto al original.
    // Se detecta y se quita (no se clampa: aquí no hace falta respetar
    // nada, es ruido) cualquier valor a menos de 1px de ese tamaño de
    // edición — el resto de tamaños (los elegidos de verdad, o los que
    // vienen de fuera de la app) se procesan igual que siempre.
    let editorCssFontSizePx = null;
    try{
      const liveEditor = document.getElementById('tdEditor');
      if(liveEditor) editorCssFontSizePx = parseFloat(getComputedStyle(liveEditor).fontSize);
    }catch(_e){}
    doc.body.querySelectorAll('[style]').forEach(el => {
      if(el.style.fontSize){
        const n = parseFloat(el.style.fontSize);
        if(isNaN(n)){
          el.style.removeProperty('font-size');
        } else if(editorCssFontSizePx !== null && !isNaN(editorCssFontSizePx) && Math.abs(n - editorCssFontSizePx) < 1){
          el.style.removeProperty('font-size');
        } else {
          el.style.fontSize = Math.max(TD_PASTE_FONT_MIN, Math.min(TD_PASTE_FONT_MAX, n)) + 'px';
        }
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
    if(!editor){ fn(); return false; }
    const range = editor.getSelectedRange();
    if(range && range[0] === range[1]){
      const len = editor.getDocument().toString().length;
      if(len > 0){
        editor.setSelectedRange([0, len]);
        try{ fn(); } finally { editor.setSelectedRange(range); }
        return true; // se aplicó a TODO el documento (sin selección)
      }
    }
    fn();
    return false;
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
      const _appliedToWhole = _tdApplyScoped(() => {
        try{ editorEl.editor?.activateAttribute('fontFamily', btn.dataset.value); }catch(_e){}
      });
      // Petición explícita de Alberto: si se aplicó a todo el documento (sin
      // selección), este tipo de letra debe seguir usándose para lo próximo
      // que se escriba — también al reeditar más tarde, no solo en esta
      // sesión (ver _tdDocFontFamily y su refuerzo por trix-selection-change
      // más abajo en _tdInitOnce).
      if(_appliedToWhole) _tdDocFontFamily = btn.dataset.value;
      finishChoice();
      _tdSyncFontMenuActive();
    });
  });
  document.querySelectorAll('#dd-tdFontSize .ed-dropdown-item').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      const _appliedToWhole = _tdApplyScoped(() => {
        try{ editorEl.editor?.activateAttribute('fontSize', btn.dataset.value); }catch(_e){}
      });
      if(_appliedToWhole) _tdDocFontSize = btn.dataset.value;
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

// Párrafo: agrupa en un desplegable "Cita" y las dos listas (bullet/number),
// antes sueltos como botones planos dentro de <trix-toolbar>. Siguen siendo
// los MISMOS atributos de bloque NATIVOS de Trix (quote/bullet/number) — no
// se ha inventado nada nuevo — pero se controlan a mano desde FUERA de
// <trix-toolbar>, igual que alineación/interlineado/fuente/tamaño, porque
// edToggleMenu/edCloseMenus reubican el desplegable a <body> al abrirse (ver
// más arriba) y el manejador nativo de clics de Trix está enganchado por
// delegación de eventos SOLO dentro de <trix-toolbar> (this.element, ver
// trix.umd.min.js: b("mousedown",{onElement:this.element,...})) — un botón
// reubicado fuera de ese árbol dejaría de recibir el evento mientras el
// menú estuviera abierto.
// Se llama directamente a editor.activateAttribute()/deactivateAttribute(),
// el mismo API público que usa el propio botón nativo de Trix por debajo
// (toolbarDidToggleAttribute -> composition.toggleCurrentAttribute ->
// setCurrentAttribute/removeCurrentAttribute — idéntico camino), así que el
// resultado es exactamente el mismo que antes, exclusividad entre atributos
// de bloque incluida (la gestiona Trix igual, sea cual sea la vía de
// entrada). Verificado con un test real de Trix (Playwright) antes de
// aplicar este cambio.
function _tdWireParrafoControls(){
  const editorEl = document.getElementById('tdEditor');
  const btn = document.querySelector('[data-menu="tdParrafo"]');
  if(!editorEl || !btn) return;

  // Mismo truco "frozen" que fuente/tamaño/alineación: mantener la selección
  // visualmente resaltada mientras el foco pasa del editor al menú.
  const freeze   = () => { try{ editorEl.editor?.activateAttribute('frozen'); }catch(_e){} };
  const unfreeze = () => { try{ editorEl.editor?.deactivateAttribute('frozen'); }catch(_e){} };
  btn.addEventListener('pointerdown', freeze);

  const finishChoice = () => {
    unfreeze();
    if(typeof edCloseMenus === 'function') edCloseMenus();
    editorEl.focus();
  };

  // pointerdown (no click): mismo motivo documentado en fuente/tamaño/
  // alineación — con "click" el editor ya habría perdido el foco/la
  // selección real para cuando llega el evento.
  document.querySelectorAll('#dd-tdParrafo .ed-dropdown-item').forEach(item => {
    item.addEventListener('pointerdown', e => {
      e.preventDefault();
      const attr = item.dataset.value; // quote | bullet | number
      try{
        const editor = editorEl.editor;
        if(editor){
          // Toggle simple: exactamente lo que hacía el botón nativo de Trix
          // (ver toolbarDidToggleAttribute/toggleCurrentAttribute) — no se
          // desactivan a mano los otros dos, Trix ya gestiona la
          // exclusividad entre atributos de bloque igual que antes.
          if(editor.attributeIsActive(attr)) editor.deactivateAttribute(attr);
          else editor.activateAttribute(attr);
        }
      }catch(_e){}
      finishChoice();
      _tdSyncParrafoMenuActive();
    });
  });

  editorEl.addEventListener('trix-selection-change', _tdSyncParrafoMenuActive);
  _tdSyncParrafoMenuActive();
}

// Marca con ✓ (y fondo) cuál de las tres opciones de párrafo (cita/viñetas/
// numerada) está activa en la posición actual del cursor — atributos de
// BLOQUE nativos de Trix, se consultan con attributeIsActive (igual que
// alineación/interlineado).
function _tdSyncParrafoMenuActive(){
  const editorEl = document.getElementById('tdEditor');
  if(!editorEl || !editorEl.editor) return;
  const editor = editorEl.editor;
  document.querySelectorAll('#dd-tdParrafo .ed-dropdown-item').forEach(item => {
    let isActive = false;
    try{ isActive = editor.attributeIsActive(item.dataset.value); }catch(_e){}
    item.classList.toggle('active', isActive);
  });
}

// Marca con ✓ (y fondo, vía .ed-dropdown-item.active) la fuente/tamaño que
// corresponden a la posición actual del cursor — 'Lora'/'22px' son los
// valores por defecto del documento si el punto del cursor no tiene
// ninguno de los dos atributos explícito.
//
// editor.composition.getCurrentTextAttributes(), NO
// getDocument().getPieceAtPosition(range[0]): son cosas distintas.
// getPieceAtPosition(offset) devuelve la pieza que CONTIENE ese índice — en
// el límite EXACTO entre dos piezas (p.ej. justo tras el último carácter de
// un párrafo en 28px, con el siguiente párrafo en tamaño normal) devuelve
// la pieza de DESPUÉS del cursor, no la de ANTES — así que ahí marcaba
// "Normal" aunque lo próximo que se escribiera siguiera en 28px. Ese límite
// se cruza constantemente al escribir seguido (fin de cada palabra/línea/
// párrafo) — bug reportado por Alberto: "el tamaño de letra no se
// conserva... aunque haya cambio de párrafo". getCurrentTextAttributes()
// es el mecanismo INTERNO real de Trix para esto exacto — el mismo que usa
// su propia barra de herramientas nativa para resaltar Negrita/Cursiva —
// resuelve correctamente ese límite según la convención estándar de
// cualquier editor de texto enriquecido: con el cursor colapsado, lo que
// hay INMEDIATAMENTE ANTES. Comprobado con Playwright + el propio
// trix.umd.min.js: en el límite exacto entre dos tamaños,
// getPieceAtPosition daba null (visualmente "Normal") mientras
// getCurrentTextAttributes daba el tamaño real que se seguiría escribiendo.
function _tdSyncFontMenuActive(){
  const editorEl = document.getElementById('tdEditor');
  if(!editorEl || !editorEl.editor || !editorEl.editor.composition) return;
  let fs = '22px', ff = 'Lora';
  try{
    const attrs = editorEl.editor.composition.getCurrentTextAttributes() || {};
    if(attrs.fontSize) fs = attrs.fontSize;
    // El navegador normaliza font-family con espacio (Patrick Hand, Bebas
    // Neue…) a comillas DOBLES al releerlo del DOM/CSSOM — solo pasa con
    // documentos ya CARGADOS (reeditar una obra guardada), no al elegir la
    // fuente desde este mismo menú en la sesión actual. Mismo patrón de
    // limpieza que _tdSanitizePastedHTML/runsFromInline, ya usado en este
    // archivo para el mismo motivo.
    if(attrs.fontFamily) ff = attrs.fontFamily.replace(/^['"]|['"]$/g, '');
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

// ── Insertar imágenes en el flujo de texto (pedido explícito por Alberto) ──
// Se apoya en el mecanismo NATIVO de adjuntos de Trix (editor.insertFile) —
// el mismo que usa cualquier editor basado en Trix (Basecamp, HEY...) para
// insertar imágenes; no se reinventa nada de la inserción/paginación en sí.
// Como esta versión vendorizada de Trix no trae redimensionado con
// tiradores (versiones más recientes de Trix sí lo tienen), se construye una
// caja de redimensionado propia (_tdWireImageResize) con el mismo estilo
// visual que los objetos del canvas del editor general.
// Registro de cada paso de la inserción de imágenes en el flujo de texto
// (botón 🩺 tdDiagBtn) — pedido explícito de Alberto tras comprobar que
// ninguna imagen insertada se veía en el editor. Mismo patrón que
// _tdLogApply para "Aplicar al lienzo": cada paso queda con su hora exacta,
// así que al reproducir el fallo y abrir el diagnóstico se ve EXACTAMENTE
// en qué paso se detiene el proceso.
window._tdImgLog = window._tdImgLog || [];
function _tdLogImg(kind, detail){
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0'), mm = String(t.getMinutes()).padStart(2, '0'),
        ss = String(t.getSeconds()).padStart(2, '0'), ms = String(t.getMilliseconds()).padStart(3, '0');
  window._tdImgLog.push(`${hh}:${mm}:${ss}.${ms}  ${kind}  ${detail || ''}`);
  if(window._tdImgLog.length > 100) window._tdImgLog.shift();
}

function _tdWireInsertImage(){
  const editorEl = document.getElementById('tdEditor');
  const fileInput = document.getElementById('tdFileGallery');
  if(!editorEl || !fileInput){ _tdLogImg('_tdWireInsertImage ABORTA', 'editorEl=' + !!editorEl + ' fileInput=' + !!fileInput); return; }

  document.getElementById('tdGalleryBtn')?.addEventListener('click', () => {
    _tdLogImg('clic en Galería', '');
    // El diálogo de archivo cancela el fullscreen en algunos navegadores —
    // mismo respaldo que ya usa el editor general (dd-gallery).
    window._edWasFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    fileInput.click();
    if(typeof edCloseMenus === 'function') edCloseMenus();
  });
  document.getElementById('tdCameraBtn')?.addEventListener('click', () => {
    _tdLogImg('clic en Cámara', '');
    if(typeof edCloseMenus === 'function') edCloseMenus();
    if(typeof edOpenCamera === 'function') edOpenCamera(_tdInsertImage);
  });
  // Pegar imagen del portapapeles — mismo mecanismo que dd-paste del editor
  // general (Clipboard API), como respaldo explícito para táctil por si el
  // gesto nativo de pegar del sistema no trae imágenes de forma fiable en
  // todos los dispositivos; en PC, Ctrl+V ya funciona de forma nativa en
  // Trix (ver _tdWatchForPastedImages) y este botón hace exactamente lo
  // mismo por otra vía.
  document.getElementById('tdPasteBtn')?.addEventListener('click', async () => {
    _tdLogImg('clic en Pegar', '');
    if(typeof edCloseMenus === 'function') edCloseMenus();
    if(!navigator.clipboard || !navigator.clipboard.read){
      edToast(I18n.t('ed_clipboardNotSupported'));
      return;
    }
    try{
      const items = await navigator.clipboard.read();
      let imgBlob = null;
      for(const it of items){
        const imgType = it.types.find(t => t.startsWith('image/'));
        if(imgType){ imgBlob = await it.getType(imgType); break; }
      }
      if(!imgBlob){ edToast(I18n.t('ed_noImageInClipboard')); return; }
      _tdInsertImage(imgBlob);
    }catch(_err){
      _tdLogImg('EXCEPCIÓN pegando desde portapapeles', (_err && _err.message) || String(_err));
      edToast(I18n.t('ed_clipboardReadFailed'));
    }
  });
  fileInput.addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = '';
    _tdLogImg('input[file] change', f ? (f.name + ' ' + f.type + ' ' + f.size + 'B') : '(sin archivo)');
    if(!f) return;
    _tdInsertImage(f);
    if(window._edWasFullscreen && !(document.fullscreenElement || document.webkitFullscreenElement)){
      setTimeout(()=>{ if(typeof Fullscreen!=='undefined') Fullscreen.enter(); }, 300);
    }
    window._edWasFullscreen = false;
  });

  _tdWireImageResize();
  _tdWatchForPastedImages();
  _tdWireLibrary();
  _tdLogImg('_tdWireInsertImage completado', 'tdGalleryBtn=' + !!document.getElementById('tdGalleryBtn') + ' tdCameraBtn=' + !!document.getElementById('tdCameraBtn') + ' tdPasteBtn=' + !!document.getElementById('tdPasteBtn'));
}

// Inserta un archivo de imagen en la posición actual del cursor, vía el
// adjunto nativo de Trix. Trix genera de entrada una URL temporal (blob:)
// válida solo en esta sesión del navegador — no sirve para guardar la obra.
// En cuanto el archivo termina de leerse se sustituye por una URL de datos
// (base64) persistente: Trix ya distingue internamente "URL de vista previa"
// (la que se ve mientras se edita) de "URL real" (la que serializa/guarda,
// ver data-trix-serialized-attributes en su propio código), así que la
// vista previa instantánea (blob) no se pierde mientras se sustituye en
// segundo plano la URL de guardado.
//
// BUG CORREGIDO: la primera versión de esta función esperaba el evento
// "trix-attachment-add" para enganchar el adjunto recién insertado — ese
// evento existe en versiones más recientes de Trix, pero SE COMPROBÓ
// DIRECTAMENTE EN EL CÓDIGO que esta versión vendorizada (trix.umd.min.js)
// no lo dispara en ningún sitio. Al no dispararse nunca, ni el tamaño ni la
// URL persistente ni la selección para redimensionar llegaban a aplicarse
// — la imagen se insertaba "en el limbo" (bug reportado por Alberto: "no se
// ven las imágenes"). insertFile/insertAttachments/insertText son síncronos
// (sin promesas de por medio, comprobado en el propio código), así que
// basta con leer editor.getDocument().getAttachments() justo después de
// llamar a insertFile: el adjunto recién creado ya está ahí, identificable
// por su propio File (siempre una instancia nueva en cada selección).
function _tdInsertImage(file, opts){
  _tdLogImg('_tdInsertImage llamada', file ? (file.name + ' ' + file.type) : '(sin archivo)');
  if(!file || !file.type || !file.type.startsWith('image/')){ _tdLogImg('_tdInsertImage ABORTA', 'archivo no es imagen'); return; }
  const editorEl = document.getElementById('tdEditor');
  const editor = editorEl && editorEl.editor;
  _tdLogImg('estado editor', 'editorEl=' + !!editorEl + ' editorEl.editor=' + !!editor + ' typeof insertFile=' + (editor && typeof editor.insertFile));
  if(!editor){ _tdLogImg('_tdInsertImage ABORTA', 'editorEl.editor no existe todavía'); return; }
  editorEl.focus();

  let att;
  try{
    editor.insertFile(file);
    _tdLogImg('editor.insertFile() ejecutado sin lanzar excepción', '');
    const atts = editor.getDocument().getAttachments();
    _tdLogImg('adjuntos en el documento tras insertar', 'total=' + atts.length + ' ids=[' + atts.map(a=>a.id).join(',') + ']');
    att = atts.find(a => a.file === file);
    _tdLogImg('búsqueda del adjunto recién insertado (por a.file===file)', att ? ('ENCONTRADO id=' + att.id) : 'NO ENCONTRADO');
  }catch(err){
    _tdLogImg('EXCEPCIÓN en editor.insertFile/getAttachments', (err && err.message) || String(err));
    edToast(I18n.t('td_errApplyText', { msg: (err && err.message) || err }));
    return;
  }
  if(!att){ _tdLogImg('_tdInsertImage ABORTA', 'no se localizó el adjunto — nada más que hacer'); return; }
  _tdProcessNewImageAttachment(att, file, opts);
}

// Conjunto de ids de adjuntos ya tratados (URL persistente + tamaño inicial
// fijados) — evita volver a procesar el mismo adjunto en cada trix-change,
// que se dispara con CUALQUIER edición del documento, no solo al insertar
// una imagen (ver _tdWatchForPastedImages).
window._tdProcessedAttIds = window._tdProcessedAttIds || new Set();

// Separa una imagen recién insertada en su PROPIA línea, cortando el texto
// que hubiera antes y/o después en la misma línea — petición explícita de
// Alberto: "un título no suele incorporar una imagen en él", así que una
// imagen debe comportarse como un cambio de párrafo, igual que si se
// hubiera pulsado Intro a cada lado, en vez de quedarse mezclada como una
// pieza más dentro del párrafo de texto normal.
//
// BUG QUE ESTO CORRIGE (reportado por Alberto: "cuando selecciono un texto
// y elijo Título, todo el texto se queda con el estilo título, no solo el
// seleccionado"): "Título" es un atributo de BLOQUE nativo de Trix (como en
// Word/Google Docs: afecta a toda la línea/párrafo del cursor, no solo a la
// selección exacta — comprobado con una reproducción real, Playwright +
// este mismo trix.umd.min.js vendorizado; el propio motor de Trix se
// comporta así siempre, no es un fallo de esta app). Antes de insertar
// imágenes, los párrafos terminaban en un Intro relativamente cerca del
// texto a destacar, así que no se notaba. Al insertar una imagen SIN pulsar
// Intro a los lados, "texto antes + imagen + texto después" pasaba a ser
// UNA ÚNICA línea para Trix — potencialmente mucho más larga de lo que
// parece a simple vista — y aplicar Título en cualquier punto de esa línea
// lo convertía TODO en título. Con esta función, la imagen separa el texto
// en líneas reales de forma automática, así que "Título" (y cualquier otro
// atributo de bloque: cita, alineación...) vuelve a quedar acotado a la
// línea que de verdad se está editando.
//
// Método: editor.insertLineBreak() — API PÚBLICA de Trix. Solo inserta un
// "\n" (equivalente a <br>) DENTRO del mismo bloque de Trix, no crea un
// <div> separado — pero se comprobó con una reproducción real (Playwright:
// separar así el texto alrededor de una imagen y luego aplicar heading1 a
// una selección parcial) que Trix ACOTA los atributos de bloque a los
// límites de "\n" más cercanos, vía su propio
// expandRangeToLineBreaksAndSplitBlocks interno — no hace falta un <div>
// separado de verdad para que el bug de arriba quede corregido, y así se
// evita depender de ninguna API interna/no documentada de Trix.
//
// editor.getDocument().getRangeOfAttachment(att) da el rango exacto (1
// carácter) que ocupa la imagen. DETRÁS: se inserta SIEMPRE un salto justo
// tras la imagen (la posición donde ya queda el cursor tras insertarla) —
// sin comprobar antes "¿hay ya algo después?", porque en el caso normal
// (Alberto sigue escribiendo justo tras insertar) todavía no lo hay: el
// salto tiene que quedar puesto de antemano para que ESE texto futuro caiga
// ya en su propia línea. Si en cambio la imagen se pega/suelta en mitad de
// una frase ya escrita, este mismo salto único ya separa la imagen de lo
// que la sigue, sin dejar una línea en blanco de más. DELANTE: solo si de
// verdad hay contenido pegado a la imagen en la misma línea (si ya se había
// pulsado Intro justo antes de insertar, no añadir una línea en blanco de
// más) — y aquí hace falta guardar y restaurar la posición del cursor
// después, porque este segundo salto se inserta ANTES de la imagen y
// desplaza +1 todo lo que va desde ahí en adelante, incluida la posición
// donde había quedado el cursor tras el salto de detrás (sin restaurarla,
// lo próximo que se escriba acabaría colándose delante de la imagen en vez
// de detrás — comprobado con la misma reproducción antes de dar esto por
// bueno).
function _tdSplitParagraphAroundAttachment(editor, att){
  try{
    const range = editor.getDocument().getRangeOfAttachment(att);
    if(!range) return;
    const [start] = range;

    editor.insertLineBreak();

    const fullText = editor.getDocument().toString();
    const prevChar = start > 0 ? fullText[start - 1] : '\n';
    if(prevChar !== '\n'){
      const cursorPos = editor.getSelectedRange()[0];
      editor.setSelectedRange([start, start]);
      editor.insertLineBreak();
      editor.setSelectedRange([cursorPos + 1, cursorPos + 1]);
    }
  }catch(_e){
    _tdLogImg('EXCEPCIÓN en _tdSplitParagraphAroundAttachment', (_e && _e.message) || String(_e));
  }
}

// Aplica a un adjunto de imagen recién creado el mismo tratamiento, venga
// del botón "Insertar" (galería/cámara, ver _tdInsertImage) o de pegar con
// Ctrl+V/gesto táctil (ver _tdWatchForPastedImages): sustituir su URL
// temporal (blob:, solo válida en esta sesión) por una persistente (data:),
// fijarle un tamaño inicial por defecto, y seleccionarla para poder
// redimensionarla de inmediato. Trix ya distingue internamente "URL de
// vista previa" (la que se ve mientras se edita) de "URL real" (la que
// serializa/guarda, ver data-trix-serialized-attributes en su propio
// código), así que la vista previa instantánea (blob) no se pierde
// mientras se sustituye en segundo plano la URL de guardado.
function _tdProcessNewImageAttachment(att, file, opts){
  if(!att || !file || window._tdProcessedAttIds.has(att.id)) return;
  window._tdProcessedAttIds.add(att.id);
  const editorEl = document.getElementById('tdEditor');
  // Separar la imagen en su propia línea ANTES de cualquier otra cosa — ver
  // _tdSplitParagraphAroundAttachment. Se hace aquí (punto compartido por
  // los 3 caminos de inserción: botón galería/cámara y objeto de biblioteca
  // vía _tdInsertImage, y pegar/soltar nativo vía _tdWatchForPastedImages)
  // para cubrir los tres con un único cambio, y de forma SÍNCRONA (antes
  // del FileReader asíncrono de más abajo) para que, si Alberto sigue
  // escribiendo de inmediato tras insertar la imagen, el texto nuevo caiga
  // ya en la línea correcta.
  if(editorEl && editorEl.editor) _tdSplitParagraphAroundAttachment(editorEl.editor, att);

  const reader = new FileReader();
  reader.onerror = () => { _tdLogImg('FileReader onerror', String(reader.error)); edToast(I18n.t('td_errReadText', { msg: 'FileReader' })); };
  reader.onload = e => {
    const dataUrl = e.target.result;
    _tdLogImg('FileReader onload', 'dataUrl.length=' + (dataUrl ? dataUrl.length : 0));
    const img = new Image();
    img.onerror = () => { _tdLogImg('Image onerror (dataUrl no decodifica como imagen)', ''); edToast(I18n.t('td_errReadText', { msg: 'Image' })); };
    img.onload = () => {
      const natW = img.naturalWidth || 1, natH = img.naturalHeight || 1;
      _tdLogImg('Image onload (dataUrl decodificada)', 'natural=' + natW + '×' + natH);
      const colW = (editorEl && editorEl.clientWidth) || 600;
      let w, h;
      if(opts && opts.pageWidthFrac){
        // Objeto de biblioteca: ya tenía un tamaño concreto en la página
        // (ver _tdInsertFromBib) — se respeta ESE tamaño en vez de un
        // porcentaje genérico. BUG CORREGIDO (reportado por Alberto:
        // "debería insertarse en la cuarta parte del tamaño"): antes se
        // usaba SIEMPRE el 70% de columna (pensado para fotos sueltas de
        // tamaño arbitrario), sin importar lo pequeño o grande que fuera
        // el objeto real en la página.
        w = Math.max(20, Math.round(colW * opts.pageWidthFrac));
        h = Math.round(w * (natH / natW));
        _tdLogImg('tamaño desde biblioteca (pageWidthFrac)', 'pageWidthFrac=' + opts.pageWidthFrac + ' → w=' + w + ' h=' + h);
      } else {
        // Ancho por defecto: 70% de la columna de escritura visible (mismo
        // criterio que edAddImage usa para el canvas: 0.7 del ancho de
        // página), medido sobre el ancho REAL de #tdEditor en este instante.
        w = Math.round(colW * 0.7);
        h = Math.round(w * (natH / natW));
        // Tope: no más alta que 1.2x el ancho de columna — una imagen muy
        // vertical no debe dominar la página entera de entrada.
        const maxH = Math.round(colW * 1.2);
        if(h > maxH){ h = maxH; w = Math.round(h * (natW / natH)); }
        _tdLogImg('calculado tamaño destino', 'colW=' + colW + ' → w=' + w + ' h=' + h);
      }
      // Comprimir/redimensionar ANTES de guardar la URL persistente — mismo
      // criterio que cualquier ImageLayer del lienzo (_edCompressImageSrc:
      // máx. 1080px, JPEG calidad 0.82), pero con _edCompressLoadedImage
      // porque aquí el dataUrl es recién leído del FileReader y aún no ha
      // decodificado en ningún <img> previo (ver comentario junto a esa
      // función en editor.js — comprobado con Playwright que la versión
      // síncrona normal no lo detecta a tiempo y se queda sin comprimir).
      // Usa el `img` que YA tenemos cargado aquí mismo (este handler solo se
      // ejecuta tras su propio evento onload). El flujo de texto tiene fondo
      // transparente por defecto, así que se conserva PNG cuando la imagen
      // tiene transparencia real — la propia función ya distingue esto igual
      // que en el resto de la app, no es un caso especial nuevo.
      const compressedDataUrl = (typeof _edCompressLoadedImage === 'function')
        ? _edCompressLoadedImage(img, dataUrl)
        : dataUrl;
      _tdLogImg('compresión de imagen para el flujo de texto', 'original=' + dataUrl.length + ' comprimido=' + compressedDataUrl.length + ' formato=' + (compressedDataUrl.slice(11, compressedDataUrl.indexOf(';'))));
      try{
        att.setAttributes({ width: w, height: h, url: compressedDataUrl, href: compressedDataUrl });
        _tdLogImg('att.setAttributes() ejecutado sin lanzar excepción', 'att.getWidth()=' + att.getWidth() + ' att.getHeight()=' + att.getHeight() + ' att.getURL().length=' + (att.getURL()||'').length);
      }catch(_e){
        _tdLogImg('EXCEPCIÓN en att.setAttributes', (_e && _e.message) || String(_e));
      }
      // Seleccionar la imagen recién insertada para poder redimensionarla
      // de inmediato — a petición de Alberto (mismo hábito que el canvas:
      // un objeto recién insertado queda seleccionado).
      requestAnimationFrame(() => {
        const fig = editorEl && editorEl.querySelector(`[data-trix-id="${att.id}"]`);
        const imgEl = fig && fig.tagName === 'IMG' ? fig : fig?.querySelector('img');
        _tdLogImg('búsqueda del <img> renderizado (rAF tras setAttributes)', 'fig=' + !!fig + ' imgEl=' + !!imgEl + (imgEl ? (' imgEl.src.length=' + imgEl.src.length + ' imgEl.width=' + imgEl.width + ' imgEl.complete=' + imgEl.complete + ' imgEl.naturalWidth=' + imgEl.naturalWidth) : ''));
        if(imgEl && typeof _tdSelectImageForResize === 'function') _tdSelectImageForResize(imgEl);
      });
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

// Detecta imágenes insertadas por vías NATIVAS de Trix (Ctrl+V, gesto de
// pegar táctil, arrastrar y soltar) que aún no hayan pasado por
// _tdProcessNewImageAttachment, y les aplica el mismo tratamiento — pedido
// explícito de Alberto: "habilitar el Ctrl+V para pegar imágenes". Sin
// esto, Trix ya insertaba la imagen pegada (mismo filtro trix-file-accept
// corregido en su momento), pero se quedaba con la URL temporal (blob:) de
// Trix y un tamaño sin controlar — se vería bien en la sesión actual, pero
// desaparecería al guardar y volver a abrir la obra (la URL blob: no
// sobrevive a recargar la página).
function _tdWatchForPastedImages(){
  const editorEl = document.getElementById('tdEditor');
  if(!editorEl) return;
  editorEl.addEventListener('trix-change', () => {
    const editor = editorEl.editor;
    if(!editor) return;
    let atts;
    try{ atts = editor.getDocument().getAttachments(); }catch(_e){ return; }
    atts.forEach(att => {
      if(att.file && !window._tdProcessedAttIds.has(att.id)){
        _tdLogImg('imagen detectada por vía nativa (pegar/soltar)', 'att.id=' + att.id + ' file=' + (att.file.name || '?'));
        _tdProcessNewImageAttachment(att, att.file);
      }
    });
  });
}

// ── Biblioteca en el editor de textos (pedido explícito de Alberto: "colocar
// objetos de la biblioteca en el flujo de texto", y tras comprobar que un
// panel propio "no ha funcionado en absoluto": "reutiliza la biblioteca tal
// como está en el editor de animaciones") ──
// Se reutiliza edOptionsPanel + _bibRenderPanel TAL CUAL — el mismo panel y
// la misma función que usa el editor general, exactamente igual que hace
// gcpBibBtn en el editor de animaciones (ver su addEventListener('click')
// más abajo en este mismo archivo, línea ~35778): un solo botón que llama a
// _bibRenderPanel($('edOptionsPanel')). La clase 'td-open' en #editorShell
// (añadida/quitada en edOpenTextDoc/edCloseTextDoc) reutiliza el mismo
// mecanismo CSS que 'gcp-open' para que el panel se vea POR ENCIMA del
// overlay del editor de textos (ver #editorShell.td-open #edOptionsPanel en
// editor.css). El destino de la inserción (canvas / GCP / editor de textos)
// se decide en el propio manejador de toque de _bib-item en editor.js,
// comprobando esa misma clase 'td-open'.
function _tdWireLibrary(){
  document.getElementById('tdLibraryOpenBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('edOptionsPanel');
    if(panel && typeof _bibRenderPanel === 'function') _bibRenderPanel(panel);
  });
}

// Calcula las esquinas rotadas de un objeto en fracciones de página — misma
// fórmula que ya usan edExportSelectionPNG (objeto individual) y _msBBox
// (varios): geometría real (x/y/width/height/rotación), no detección de
// píxeles por transparencia.
function _tdLayerCorners(la, pw, ph){
  const rot = (la.rotation||0) * Math.PI / 180;
  const hw = (la.width||0)/2, hh = (la.height||0)/2;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const [cx,cy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]]){
    const wx=cx*pw, wy=cy*ph;
    const rx=(wx*Math.cos(rot)-wy*Math.sin(rot))/pw;
    const ry=(wx*Math.sin(rot)+wy*Math.cos(rot))/ph;
    x0=Math.min(x0,la.x+rx); y0=Math.min(y0,la.y+ry);
    x1=Math.max(x1,la.x+rx); y1=Math.max(y1,la.y+ry);
  }
  return {x0,y0,x1,y1};
}

// Renderiza uno o varios objetos reconstruidos de la biblioteca a un PNG
// recortado EXACTAMENTE a su caja — mismo criterio que edExportSelectionPNG
// (pedido explícito de Alberto: "observa cómo se insertan en el canvas GCP,
// se calcula el tamaño de su box, ese es el tamaño que debe tener el objeto
// insertado"). BUG CORREGIDO: _gcpVectorToImage/_gcpMergeLayersToImage
// recortaban DETECTANDO píxeles con alfa>10 sobre un lienzo enorme con
// margen de sobra — cualquier imprecisión ahí (antialiasing, sombras,
// bordes suaves) dejaba un recorte suelto con el objeto pequeño en una
// esquina de un marco vacío enorme, y peor calidad al no coincidir el
// tamaño real. Aquí la caja se calcula de forma matemática, exacta, sin
// escanear un solo píxel.
//
// items: [{la, ld}] — la = capa deserializada (x/y/width/height/rotation
// para la geometría); ld = su versión serializada (con .dataUrl si es una
// capa basada en canvas — stroke/draw/fill/watercolor/pencil), para no
// depender de que su _canvas interno esté listo de forma síncrona justo
// tras deserializar (mismo criterio que ya usa _gcpMergeLayersToImage con
// los miembros de un grupo).
function _tdRenderLayersToImage(items, cb){
  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  items.forEach(({la}) => {
    if(la.width == null || la.height == null) return; // sin caja propia — no aporta al recorte
    const c = _tdLayerCorners(la, pw, ph);
    x0=Math.min(x0,c.x0); y0=Math.min(y0,c.y0);
    x1=Math.max(x1,c.x1); y1=Math.max(y1,c.y1);
  });
  if(!(x1>x0) || !(y1>y0)){ cb(null); return; }
  const bxPx = Math.max(1, Math.ceil((x1-x0) * pw));
  const byPx = Math.max(1, Math.ceil((y1-y0) * ph));
  const baseX = -(mx + x0*pw), baseY = -(my + y0*ph);

  // BUG CORREGIDO (reportado por Alberto: "a menudo faltan objetos del
  // grupo"): edDeserLayer crea las capas de tipo imagen SIN cargar la
  // imagen — new ImageLayer(null, ...), solo guarda su src como texto; la
  // carga real de img ocurre en otro sitio, más tarde y de forma
  // asíncrona. Llamar a la.draw() justo después de deserializar no
  // dibujaba nada (ImageLayer.draw: "const src=this._oc||this.img; if
  // (!src) return;"), así que los miembros de tipo imagen de un grupo se
  // quedaban invisibles en el resultado. Se carga aquí explícitamente
  // desde la.src, con el mismo mecanismo que ya usa ld.dataUrl para las
  // capas basadas en canvas — así queda lista ANTES de dibujar, no después.
  const promises = items.map(({la, ld}) => {
    const srcToLoad = (ld && ld.dataUrl) || (la.type === 'image' && la.src) || null;
    if(!srcToLoad) return Promise.resolve({la, img:null});
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => resolve({la, img});
      img.onerror = () => resolve({la, img:null});
      img.src = srcToLoad;
    });
  });
  Promise.all(promises).then(results => {
    const off = document.createElement('canvas');
    off.width = bxPx; off.height = byPx;
    const offCtx = off.getContext('2d', { alpha: true });
    results.forEach(({la, img}) => {
      offCtx.save();
      offCtx.setTransform(1, 0, 0, 1, baseX, baseY);
      offCtx.globalAlpha = la.opacity ?? 1;
      if(img){
        // Capa basada en canvas (stroke/draw/fill/watercolor/pencil): usar
        // el dataUrl ya serializado, posicionado con su propia geometría.
        const cx = mx + (la.x ?? 0.5) * pw, cy = my + (la.y ?? 0.5) * ph;
        const w  = (la.width  ?? 1) * pw,   h  = (la.height ?? 1) * ph;
        offCtx.translate(cx, cy);
        if(la.rotation) offCtx.rotate(la.rotation * Math.PI / 180);
        offCtx.drawImage(img, -w/2, -h/2, w, h);
      } else if(la.type === 'image' || la.type === 'gif' || la.type === 'text' || la.type === 'bubble'){
        la.draw(offCtx, off);
      } else {
        la.draw(offCtx);
      }
      offCtx.restore();
    });
    // Segundo argumento: ancho REAL del recorte, como fracción de la página
    // (x1-x0) — el tamaño que de verdad tenía el objeto, para que quien
    // inserte esta imagen pueda respetarlo en vez de aplicar un tamaño por
    // defecto genérico (ver _tdInsertFromBib/_tdInsertImage).
    cb(off.toDataURL('image/png'), x1 - x0);
  });
}

// Inserta un elemento de la biblioteca en el flujo de texto como imagen
// estática, con la caja de recorte calculada igual que edExportSelectionPNG
// (ver _tdRenderLayersToImage arriba), respetando el tamaño real que el
// objeto ya tenía en la página (ver _tdInsertImage/pageWidthFrac).
function _tdInsertFromBib(entry){
  if(!entry) return;
  _tdLogImg('insertar desde biblioteca', 'id=' + entry.id + ' isGroup=' + !!entry.isGroup + ' isGifAnim=' + !!entry.isGifAnim + ' orientation=' + entry.orientation);

  // El objeto guardó su x/y/width/height como fracción de la página que
  // tenía en ese momento (entry.orientation) — mismo truco que ya usa
  // edRenderPage para volcar una página de otra orientación: cambiar
  // edOrientation TEMPORALMENTE mientras se renderiza (así edPageW/edPageH
  // devuelven las dimensiones con las que se calibraron sus fracciones), y
  // restaurarla al terminar — incluida la parte asíncrona, por eso se
  // restaura dentro de _finish (el único punto de salida) y no antes.
  const _savedOrientBib = edOrientation;
  if(entry.orientation) edOrientation = entry.orientation;

  // BUG CORREGIDO (reportado por Alberto: "debería insertarse en la cuarta
  // parte del tamaño"): antes se dejaba _tdInsertImage con su tamaño por
  // defecto genérico (70% de columna, pensado para fotos sueltas de
  // tamaño arbitrario) — ahora se le pasa el ancho REAL que tenía el
  // objeto en la página (widthFrac, segundo argumento de
  // _tdRenderLayersToImage), para que un objeto pequeño se inserte pequeño.
  const _finish = (dataUrl, widthFrac) => {
    edOrientation = _savedOrientBib;
    if(!dataUrl){ _tdLogImg('insertar desde biblioteca ABORTA', 'sin dataUrl resultante'); return; }
    try{
      const blob = _dataUrlToBlob(dataUrl);
      const file = new File([blob], 'biblioteca.png', { type: blob.type || 'image/png' });
      _tdInsertImage(file, widthFrac ? { pageWidthFrac: widthFrac } : undefined);
    }catch(err){
      _tdLogImg('EXCEPCIÓN insertando desde biblioteca', (err && err.message) || String(err));
      edToast(I18n.t('td_errApplyText', { msg: (err && err.message) || err }));
    }
  };

  // Animaciones (GIF/GCP): el flujo de texto no reproduce animaciones — se
  // usa su miniatura ya generada como fotograma fijo, mismo criterio que
  // gcpInsertFromBib aplica a objetos no animables directamente.
  if(entry.isGifAnim){ _finish(entry.thumb); return; }

  // Grupos multi-capa: componer TODAS las capas en una sola imagen,
  // recortada a la caja UNIÓN de todas ellas.
  if(entry.isGroup && Array.isArray(entry.layers)){
    const items = entry.layers.map(ld => {
      const la = edDeserLayer(ld, edOrientation);
      if(!la) return null;
      delete la._fusionId;
      return { la, ld };
    }).filter(Boolean);
    if(!items.length){ _finish(entry.thumb); return; }
    _tdRenderLayersToImage(items, (dataUrl, widthFrac) => _finish(dataUrl || entry.thumb, widthFrac));
    return;
  }

  // Objeto individual
  const la = entry.layerData ? edDeserLayer(entry.layerData, edOrientation) : null;
  if(!la){ _finish(entry.thumb); return; }
  delete la._fusionId;
  if(la.type === 'image' || la.type === 'gif'){
    // Ya es una imagen — usar su propio src (más nítido que la miniatura).
    // Ancho real = el propio width/height del objeto (fracción de página).
    _finish(la.src || entry.thumb, la.width);
  } else if(la.width != null && la.height != null){
    // Cualquier otro tipo con caja propia (shape/line/text/bocadillo/
    // trazo/dibujo a mano). BUG CORREGIDO (reportado por Alberto: "el
    // objeto insertado ha sido un dibujo a mano y solo se ha insertado su
    // capa de tinta, el resto no"): un trazo puede llevar capas VINCULADAS
    // (relleno/acuarela/lápiz — ver _bibSerGroupLayer) que antes se
    // ignoraban por completo, incluyendo solo la capa principal. Se
    // incluyen aquí todas, en el mismo orden que ya usa
    // gcpInsertFromBib/_doMergeGcp: relleno → acuarela → lápiz → trazo
    // encima (mismo invariante de apilado que en el canvas).
    const items = [];
    ['fillLayerData', 'watercolorLayerData', 'pencilLayerData'].forEach(key => {
      const cld = entry[key];
      if(!cld || !cld.dataUrl) return;
      items.push({
        la: { x: cld.fillX, y: cld.fillY, width: cld.fillWidth, height: cld.fillHeight, rotation: cld.fillRotation || 0, opacity: 1, type: cld.type },
        ld: cld
      });
    });
    items.push({ la, ld: entry.layerData });
    _tdRenderLayersToImage(items, (dataUrl, widthFrac) => _finish(dataUrl || entry.thumb, widthFrac));
  } else {
    _finish(entry.thumb);
  }
}

// Expuesta para que _tdInsertImage pueda seleccionar la imagen recién
// insertada (ver más abajo, _tdWireImageResize la define de verdad).
let _tdSelectImageForResize = null;

// Caja de redimensionado de imágenes del flujo de texto — mismo estilo
// visual (marco discontinuo azul + tiradores circulares) que los objetos
// del canvas del editor general (ver edDrawSel en editor.js). Arrastrar
// cualquier tirador redimensiona manteniendo la proporción original de la
// imagen, igual que la mayoría de editores de texto comunes.
function _tdWireImageResize(){
  const editorEl = document.getElementById('tdEditor');
  const box = document.getElementById('tdImgResizeBox');
  if(!editorEl || !box) return;
  let _rzImg = null;         // <img> DOM seleccionado actualmente
  let _rzAttachment = null;  // objeto Attachment de Trix correspondiente
  let _rzAspect = 1;         // ancho/alto original — mantener proporción
  let _rzRaf = 0;

  function hideBox(){
    box.classList.remove('visible');
    _rzImg = null; _rzAttachment = null;
    cancelAnimationFrame(_rzRaf); _rzRaf = 0;
  }

  function syncBoxPosition(){
    if(!_rzImg || !_rzImg.isConnected){ hideBox(); return; }
    const r = _rzImg.getBoundingClientRect();
    box.style.left   = r.left   + 'px';
    box.style.top    = r.top    + 'px';
    box.style.width  = r.width  + 'px';
    box.style.height = r.height + 'px';
    _rzRaf = requestAnimationFrame(syncBoxPosition);
  }

  function selectImage(img){
    const editor = editorEl.editor;
    const fig = img.closest('[data-trix-id]');
    if(!fig || !editor){ _tdLogImg('selectImage ABORTA', 'fig=' + !!fig + ' editor=' + !!editor); hideBox(); return; }
    // BUG CORREGIDO: editor.getAttachments() no existe en la clase Editor de
    // Trix (comprobado directamente en trix.umd.min.js) — solo existe en
    // editor.getDocument().getAttachments(). Llamarlo lanzaba una excepción
    // sin capturar cada vez que se tocaba una imagen ya insertada.
    let att;
    try{
      att = editor.getDocument().getAttachments().find(a => String(a.id) === fig.dataset.trixId);
    }catch(_e){
      _tdLogImg('EXCEPCIÓN en selectImage/getAttachments', (_e && _e.message) || String(_e));
      hideBox(); return;
    }
    if(!att){ _tdLogImg('selectImage', 'adjunto no encontrado para data-trix-id=' + fig.dataset.trixId); hideBox(); return; }
    _tdLogImg('selectImage OK', 'att.id=' + att.id + ' w=' + att.getWidth() + ' h=' + att.getHeight());
    _rzImg = img; _rzAttachment = att;
    const w = att.getWidth()  || img.naturalWidth  || img.clientWidth  || 1;
    const h = att.getHeight() || img.naturalHeight || img.clientHeight || 1;
    _rzAspect = h > 0 ? (w / h) : 1;
    box.classList.add('visible');
    cancelAnimationFrame(_rzRaf);
    syncBoxPosition();
  }
  _tdSelectImageForResize = selectImage;

  editorEl.addEventListener('click', e => {
    const img = e.target.closest('.attachment--preview img');
    if(img) selectImage(img); else hideBox();
  });
  // Si el texto alrededor cambia (p.ej. se borra la imagen), la caja debe
  // desaparecer en vez de quedar flotando sobre nada.
  editorEl.addEventListener('trix-change', () => {
    if(_rzImg && !_rzImg.isConnected) hideBox();
  });

  box.querySelectorAll('.td-rz-handle').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if(!_rzImg || !_rzAttachment) return;
      const corner = handle.dataset.corner;
      const startX = e.clientX;
      const startRect = _rzImg.getBoundingClientRect();
      const startW = startRect.width;
      const colEl = editorEl;
      const maxW = colEl ? colEl.clientWidth : startW * 3;
      const minW = 40; // por debajo deja de ser una imagen útil
      cancelAnimationFrame(_rzRaf); _rzRaf = 0;
      try{ handle.setPointerCapture(e.pointerId); }catch(_e){}

      function applySize(w){
        const h = Math.round(w / _rzAspect);
        _rzImg.style.width  = w + 'px';
        _rzImg.style.height = h + 'px';
        const r = _rzImg.getBoundingClientRect();
        box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
        box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
      }
      function onMove(ev){
        const dx = ev.clientX - startX;
        // Las esquinas derechas (ne/se) crecen con dx positivo; las
        // izquierdas (nw/sw) crecen con dx negativo (arrastrar hacia fuera).
        const sign = (corner === 'ne' || corner === 'se') ? 1 : -1;
        const newW = Math.max(minW, Math.min(maxW, Math.round(startW + sign * dx)));
        applySize(newW);
      }
      function onUp(){
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const finalW = Math.round(parseFloat(_rzImg.style.width) || startW);
        const finalH = Math.round(finalW / _rzAspect);
        _rzImg.style.width = ''; _rzImg.style.height = ''; // Trix reaplica vía atributos width/height reales
        _rzAttachment.setAttributes({ width: finalW, height: finalH });
        requestAnimationFrame(syncBoxPosition);
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });

  // Tocar fuera de la imagen/caja la oculta — para poder seguir escribiendo
  // en otro punto del texto con normalidad.
  document.addEventListener('pointerdown', e => {
    if(!box.classList.contains('visible')) return;
    if(e.target.closest('#tdImgResizeBox')) return;
    if(e.target.closest('.attachment--preview img')) return;
    hideBox();
  }, {passive:true});
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

// Nodo de texto interno de Trix sin equivalente en el recuento de
// _tdParseBlocks (p.ej. los "cursor-target" \uFEFF a los lados de un
// adjunto — ver el guard gemelo en runsFromInline, dentro de
// _tdParseBlocks): cualquier texto cuyo ancestro más cercano (hasta
// `container`) tenga data-trix-serialize="false" es invisible para el
// recuento de caracteres y debe saltarse aquí también, o este TreeWalker
// (que SÍ recorre el DOM entero sin filtrar) desalinearía la posición de la
// línea de salto de página respecto a los offsets que calcula
// _tdLayoutPages, para cualquier punto posterior a una imagen en el
// documento — reintroduciría el mismo bug de otra forma.
function _tdIsInternalTrixTextNode(node, container){
  const el = node.parentElement;
  if(!el) return false;
  const marked = el.closest('[data-trix-serialize="false"]');
  return !!(marked && container.contains(marked));
}

// Busca la posición (nodo de texto + offset) en `container` que corresponde
// al carácter nº targetOffset contando solo nodos de texto, en orden documento
// — el mismo criterio de recuento que usa _tdLayoutPages sobre el HTML ya
// serializado (ver charsSoFar y el guard de _tdIsInternalTrixTextNode).
function _tdCharOffsetToRange(container, targetOffset){
  if(targetOffset <= 0) return null;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: n => _tdIsInternalTrixTextNode(n, container) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
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

// Punto (nodo+offset) en targetOffset, SIN colapsar a un Range — a
// diferencia de _tdCharOffsetToRange, admite targetOffset=0 (principio del
// documento). Sirve de base a _tdCharRect para construir un tramo que
// abarque un carácter real, en vez de un punto en su límite.
function _tdCharOffsetToPoint(container, targetOffset){
  if(targetOffset < 0) return null;
  if(targetOffset === 0){
    const walker0 = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: n => _tdIsInternalTrixTextNode(n, container) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const first = walker0.nextNode();
    return first ? {node: first, offset: 0} : null;
  }
  const range = _tdCharOffsetToRange(container, targetOffset);
  return range ? {node: range.startContainer, offset: range.startOffset} : null;
}

// Texto plano completo (mismo esquema sin separador que usa
// _tdParseBlocks/_tdLayoutPages) — para poder inspeccionar qué carácter hay
// en una posición dada sin tener que recorrer los bloques cada vez.
function _tdBlocksFlatText(blocks){
  return blocks.map(b => (b.runs || []).map(r => r.text || '').join('')).join('');
}

// _tdLayoutPages cuenta el ESPACIO que provoca el salto de línea como parte
// de ESA línea (antes de recortarlo de su representación visual, ver
// flushLine en _tdLayoutPages) — así que el "último carácter" de una línea,
// tal cual lo da lineStartChars/pageStartChars, a veces es ese espacio, no
// la última letra visible. Un espacio así NO es fiable de medir en
// pantalla (los navegadores lo colapsan visualmente al ajustar la línea:
// puede aparecer pegado al final de la línea anterior, al principio de la
// siguiente, o con un ancho impredecible) — de ahí que los puntos/el
// segmento aparecieran desplazados, a veces bastante lejos del final real
// de la palabra. Se retrocede hasta el último carácter que NO sea espacio
// antes de medir.
function _tdLastNonSpaceOffset(flatText, offset){
  let i = Math.max(0, Math.min(offset, flatText.length - 1));
  while(i > 0 && /\s/.test(flatText[i])) i--;
  return i;
}

// Rectángulo que ocupa DE VERDAD el carácter en charOffset (esquema
// "plano", sin separador de párrafo, el mismo que usa _tdParseBlocks/
// _tdLayoutPages — ver _tdCharOffsetToRange) — recorre el DOM real
// directamente con TreeWalker, SIN pasar por el mecanismo de selección de
// Trix (editor.setSelectedRange/getSelectedRange). Se abandonó ese camino
// tras comprobar que, en un dispositivo real, medía de forma poco fiable
// (window.getSelection() depende del foco del elemento en ese instante, y
// forzar el foco en cada medición no lo resolvió) — un recorrido directo
// del propio DOM no depende de nada de eso.
//
// Se toma el tramo real (charOffset a charOffset+1), no un punto de
// intercalación colapsado EN charOffset — un punto colapsado ahí
// representa el límite ANTES de ese carácter (entre charOffset-1 y
// charOffset), no el propio carácter. Un tramo real tampoco tiene la
// ambigüedad de "¿a qué lado de un salto de línea pertenece este punto?"
// que sí tendría un punto colapsado justo en ese límite.
function _tdCharRect(container, charOffset){
  if(charOffset < 0) return null;
  const p1 = _tdCharOffsetToPoint(container, charOffset);
  const p2 = _tdCharOffsetToPoint(container, charOffset + 1);
  if(!p1 || !p2) return null;
  try{
    const span = document.createRange();
    span.setStart(p1.node, p1.offset);
    span.setEnd(p2.node, p2.offset);
    // getClientRects()[0], NO getBoundingClientRect(): si charOffset es el
    // último carácter de un párrafo, el tramo hasta charOffset+1 cruza la
    // frontera al bloque (<div>) siguiente — getBoundingClientRect() daría
    // el rectángulo que ENGLOBA los dos fragmentos (el final de este
    // párrafo Y el principio del siguiente), más ancho/alto de lo que
    // ocupa de verdad este carácter. getClientRects()[0] da solo el PRIMER
    // fragmento — el que corresponde de verdad al carácter pedido, esté o
    // no a final de párrafo.
    const rects = span.getClientRects();
    return (rects && rects.length) ? rects[0] : null;
  }catch(_e){ return null; }
}

// Geometría del quiebro en "Z" para un punto de corte concreto (carácter nº
// c, el primero de la página siguiente) — ver _tdRecomputeViewPagination
// para la explicación completa de por qué hace falta el quiebro en vez de
// una recta simple (Trix y el lienzo miden el texto con motores distintos).
// imgBeforeEl/imgAfterEl (ver _tdImagesAtPageEdges): si la última línea de
// la página anterior y/o la primera de esta son una imagen, el elemento
// <img> real correspondiente — una imagen no consume ningún carácter en el
// esquema de offsets (ver _tdParseBlocks), así que basarse en `c`/`c-1`
// para su lado encontraría el último/primer carácter de TEXTO real, que
// puede estar varias imágenes/párrafos antes o después de donde cae el
// salto de verdad — bug reportado por Alberto ("no sabe dónde colocarse
// cuando coincide con imágenes"). Con el elemento real no hace falta
// adivinar nada: se mide directamente.
function _tdComputeSplitGeometry(editorEl, innerRect, blocks, c, imgBeforeEl, imgAfterEl){
  if(c <= 0 && !imgAfterEl) return { x: 0, yBefore: 0, yAfter: 0 };

  const rBefore = imgBeforeEl ? imgBeforeEl.getBoundingClientRect() : (() => {
    // c-1 (el "último carácter" tal cual lo da pageStartChars) a veces es el
    // ESPACIO que provocó el propio salto de línea — _tdLayoutPages lo cuenta
    // como parte de esta línea antes de recortarlo de su representación
    // visual (ver flushLine). Un espacio así no es fiable de medir en
    // pantalla (se colapsa visualmente al ajustar la línea) — se retrocede
    // al último carácter real (no-espacio) antes de medir.
    const flatText = _tdBlocksFlatText(blocks);
    const lastReal = _tdLastNonSpaceOffset(flatText, c - 1);
    return _tdCharRect(editorEl, lastReal);
  })();
  const rAfter = imgAfterEl ? imgAfterEl.getBoundingClientRect() : _tdCharRect(editorEl, c);

  // Si cualquiera de los dos lados es una imagen, no hay ninguna ambigüedad
  // de ajuste de línea que resolver con un quiebro en Z (a diferencia del
  // texto, el borde de una imagen es exacto e igual en Trix y en el
  // lienzo) — pedido explícito de Alberto: la línea debe poder apoyarse
  // directamente en el borde real de la imagen, a toda su anchura, "por
  // debajo de ella" si termina una página o "por encima" si empieza la
  // siguiente, igual que ya ocurre con la última/primera palabra de texto.
  // x=0 hace que la mitad DERECHA del quiebro (.td-pagebreak-visual-top,
  // ver css/editor.css) ocupe todo el ancho; si el otro lado no es TAMBIÉN
  // una imagen distinta, se iguala yBefore/yAfter para que las dos mitades
  // se fundan en una única recta continua en vez de fragmentarse sin
  // sentido (con hueco 0, visual-top + visual-bottom cubren juntas todo el
  // ancho a la misma altura, sea cual sea x — ver comentario del CSS).
  if(imgBeforeEl || imgAfterEl){
    let yBefore = rBefore ? Math.max(0, rBefore.bottom - innerRect.top) : 0;
    let yAfter = rAfter ? Math.max(0, rAfter.top - innerRect.top) : yBefore;
    if(!(imgBeforeEl && imgAfterEl)){
      if(imgBeforeEl) yAfter = yBefore; else yBefore = yAfter;
    }
    return { x: 0, yBefore, yAfter };
  }

  // x: posición HORIZONTAL relativa al VIEWPORT (rBefore.right tal cual la
  // da getClientRects, SIN restar innerRect.left) — no relativa a .td-page.
  // Motivo: .td-pagebreak-line (ver css/editor.css) se posiciona con el
  // truco "full-bleed" left:50%;width:100vw;margin-left:-50vw para cruzar
  // toda la pantalla, no solo el ancho de .td-page — ese truco coloca el
  // origen (left:0) de SUS hijos (.td-pagebreak-visual-top/bottom,
  // .td-pagebreak-connector, todos con left:var(--split-x)) exactamente en
  // x=0 del viewport, no en el borde de .td-page. Restar innerRect.left
  // aquí desplazaba la línea hacia la izquierda esa misma distancia — se
  // veía cortando el texto varias palabras ANTES del carácter real donde
  // de verdad termina la página (bug reportado por Alberto: la línea caía
  // en "por si" cuando el corte real era en "todo el").
  const x = rBefore ? Math.max(0, rBefore.right) : 0;
  let yBefore = rBefore ? Math.max(0, rBefore.bottom - innerRect.top) : 0;
  let yAfter = rAfter ? Math.max(0, rAfter.top - innerRect.top) : yBefore;
  if(rBefore && rAfter && yAfter < yBefore){
    // Caso más habitual en la práctica: la última palabra de esta página y
    // la primera de la siguiente caen en la MISMA línea de Trix (Trix cabe
    // más texto por línea de lo que asumió el lienzo) — el borde INFERIOR
    // de la palabra de antes y el SUPERIOR de la de después quedan
    // invertidos (los dos pertenecen a la misma línea compartida), no en
    // el orden "arriba, luego abajo" que da un salto de línea normal. Se
    // usan entonces los bordes de esa línea COMPARTIDA en su lugar: el
    // superior para la recta de la derecha, el inferior para la de la
    // izquierda — así el hueco nunca colapsa a 0 en este caso, que es
    // precisamente el que hace falta marcar con el quiebro en "Z".
    yBefore = Math.max(0, rBefore.top - innerRect.top);
    yAfter = Math.max(0, rAfter.bottom - innerRect.top);
  }
  return { x, yBefore, yAfter };
}

// Predice dónde caerán los saltos de hoja al pulsar "Aplicar al lienzo" —
// usando esa MISMA maquetación (edPageW/edPageH, TD_BODY_SIZE/TD_H1_SIZE, el
// margen de la capa si se está reeditando) — para dibujar ahí las líneas
// discontinuas y numerar las páginas. El tamaño de letra y los márgenes con
// los que se ESCRIBE aquí no se tocan: siguen siendo los de siempre (CSS de
// .td-editor/.td-page) — esta predicción es solo para saber EN QUÉ PUNTO del
// texto (nº de caracteres) caerá cada salto, que luego se localiza en el DOM
// tal y como se está escribiendo ahora mismo (_tdCharOffsetToRange).
// Marco por página: el alto REAL de la caja SOLO si esa página se
// redimensionó a mano con los tiradores en el editor general (marca
// _tdBoxManualH, ver el resize-end en editor.js) — ahí el tamaño es una
// decisión deliberada de Alberto y debe limitar dónde cae el salto. Para el
// resto (páginas cuyo alto es simplemente el resultado automático de
// ajustar la caja al contenido en una edición anterior), página completa —
// si no, una caja que se quedó pequeña como residuo de un texto más corto
// seguiría limitando para siempre a un texto que ha crecido (bug "2 saltos
// en vez de 1"). Debe coincidir EXACTAMENTE con el mismo criterio en
// _tdReflowFlowInPlace (frames), para que la vista previa nunca se
// desincronice de lo que "Guardar cambios" aplica de verdad.
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
    if(layer && layer._tdBoxManualH) return { pw: layer.width * pgPw, ph: layer.height * pgPh };
    return { pw: pgPw, ph: pgPh };
  });
  const spanIdxs = [...flowIdxs, ...exceptIdxs].sort((a, b) => a - b);
  const lastIdx = spanIdxs[spanIdxs.length - 1];
  // Marcos de reserva para el desbordamiento: igual criterio que
  // _tdReflowFlowInPlace (ver ese comentario para el porqué completo) — un
  // marco por cada hoja YA existente tras el tramo, con su orientación
  // real, antes de caer al genérico de "página nueva en la última
  // orientación del tramo". Deben coincidir EXACTAMENTE para que la vista
  // previa en vivo del editor de textos no se desincronice de lo que pasa
  // de verdad al guardar.
  for (let j = lastIdx + 1; j < edPages.length; j++) {
    const pg = edPages[j];
    const orient = pg.orientation || edOrientation;
    const sv = orient === 'vertical';
    frames.push({ pw: sv ? ED_PAGE_W : ED_PAGE_H, ph: sv ? ED_PAGE_H : ED_PAGE_W });
  }
  const lastOrient = edPages[lastIdx].orientation || edOrientation;
  const svLast = lastOrient === 'vertical';
  frames.push({ pw: svLast ? ED_PAGE_W : ED_PAGE_H, ph: svLast ? ED_PAGE_H : ED_PAGE_W });
  return frames;
}

// Para cada página (índice i, alineado con `pages`/`pageStartChars`),
// averigua si su ÚLTIMA línea y/o su PRIMERA línea es una imagen y, si lo
// es, a qué elemento <img> real del editor en vivo corresponde —
// {imgLastEl, imgFirstEl} por página, o null si esa página no tiene líneas.
// _tdParseBlocks y _tdLayoutPages procesan las imágenes en el mismo orden
// en que aparecen en el DOM (nunca las reordenan ni las saltan), así que la
// N-ésima línea de tipo imagen del documento (contando página a página, en
// orden) corresponde exactamente a la N-ésima
// ".attachment--preview img" del editor — no hace falta comparar por src
// (que podría repetirse si la misma imagen de la biblioteca se inserta más
// de una vez).
function _tdImagesAtPageEdges(editorEl, pages){
  const imageEls = editorEl.querySelectorAll('.attachment--preview img');
  let imgIdx = 0;
  return pages.map(page => {
    if(!page.length) return { imgLastEl: null, imgFirstEl: null };
    let imgFirstEl = null, imgLastEl = null;
    page.forEach((line, li) => {
      if(line.kind !== 'image') return;
      const el = imageEls[imgIdx] || null;
      if(li === 0) imgFirstEl = el;
      if(li === page.length - 1) imgLastEl = el;
      imgIdx++;
    });
    return { imgLastEl, imgFirstEl };
  });
}

let _tdRecomputeTimer = null;
function _tdRecomputeViewPagination(){
  const hidden = document.getElementById('tdHiddenInput');
  const editorEl = document.getElementById('tdEditor');
  const inner = document.getElementById('tdPage');
  const areaEl = document.getElementById('tdPageArea');
  if(!hidden || !editorEl || !inner || !areaEl) return;
  // editorEl.innerHTML (el DOM VIVO del editor), no hidden.value: Trix
  // sincroniza el input oculto automáticamente, pero leer el HTML
  // directamente del propio editor garantiza que _tdParseBlocks (que decide
  // dónde caen los saltos) y el recorrido con TreeWalker más abajo (que
  // mide su posición en pantalla) analizan EXACTAMENTE el mismo contenido
  // en el mismo instante, sin depender de ningún temporizado de
  // sincronización entre los dos.
  const html = editorEl.innerHTML || hidden.value || '';
  const blocks = _tdParseBlocks(html);
  const lineHeightMult = _tdLineHeightMult;

  // Si se está reeditando un texto ya aplicado, usar SU margen lateral (el
  // ajuste "Estrecho/Normal/Ancho" del panel de propiedades) — si no, el
  // margen por defecto. El interlineado ya lo refleja el selector
  // (puesto al valor de la capa al reeditar — ver edOpenTextDoc).
  const editingLayer = (typeof _tdEditingFlowId !== 'undefined' && _tdEditingFlowId) ? _tdFindFlowLayer(_tdEditingFlowId) : null;
  const marginFracX = (editingLayer && editingLayer.marginXFrac) || TD_MARGIN_FRAC;

  // Marco de la predicción, POR PÁGINA: el alto real de la caja solo para
  // las páginas que Alberto redimensionó a mano con los tiradores en el
  // editor general (_tdBoxManualH, ver _tdEditingFlowFrames) — ahí un
  // cambio en el lienzo debe reflejarse aquí de inmediato, con el resto de
  // saltos sucesivos recalculándose en cascada a partir de ese nuevo
  // reparto. Para el resto (páginas cuyo alto es solo el residuo automático
  // de un ajuste-al-contenido anterior), página completa — si no, una caja
  // que se quedó pequeña de un texto más corto seguiría limitando para
  // siempre a un texto que ha crecido (bug "2 saltos en vez de 1"). Debe
  // coincidir EXACTAMENTE con el mismo criterio en _tdReflowFlowInPlace,
  // para que esta vista previa nunca se desincronice de lo que "Guardar
  // cambios" aplica de verdad.
  const editingFrames = _tdEditingFlowId ? _tdEditingFlowFrames(_tdEditingFlowId) : null;
  const frameSizes = editingFrames || {pw: edPageW(), ph: edPageH()};

  const { pages, pageStartChars, lineStartChars } = _tdLayoutPages(
    blocks, frameSizes, lineHeightMult,
    { marginFracX, marginFracY: TD_MARGIN_FRAC, bodySize: TD_BODY_SIZE, h1Size: TD_H1_SIZE },
    []
  );
  _tdViewPageStartChars = pageStartChars;
  _tdLineStartCharsCache = lineStartChars;

  // Imágenes que quedan justo en el BORDE de una página (última línea de la
  // página anterior, o primera línea de la siguiente) — ver
  // _tdImagesAtPageEdges. Una imagen no consume ningún carácter en el
  // esquema de offsets (ver _tdParseBlocks/_tdLayoutPages), así que
  // _tdComputeSplitGeometry no puede fiarse de un offset de carácter para
  // saber dónde cae su borde real: necesita el elemento <img> del DOM en
  // vivo directamente. Pedido explícito de Alberto: "debe comportarse como
  // con el texto" — la línea de salto debe poder apoyarse en el borde
  // inferior de la imagen (si termina una página) o en el superior (si
  // empieza la siguiente), igual que ya hace con la última/primera palabra.
  const pageEdgeImages = _tdImagesAtPageEdges(editorEl, pages);

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
  // Igual que en _tdComputeSplitGeometry: si la página empieza con una
  // imagen, su offset de carácter no apunta a ella (una imagen no consume
  // ningún carácter) sino al texto anterior — se usa el borde superior real
  // de la imagen en su lugar para que "ir a esta página" salte al sitio
  // correcto.
  _tdViewPageOffsets = pageStartChars.map((c, i) => {
    const imgFirstEl = pageEdgeImages[i] ? pageEdgeImages[i].imgFirstEl : null;
    if(imgFirstEl) return Math.max(0, imgFirstEl.getBoundingClientRect().top - innerRect.top);
    return charToY(c);
  });
  _tdLineOffsetsCache = lineStartChars.map(charToY);

  // Posición de cada línea de cambio de página — a partir del rectángulo
  // REAL del último carácter de la página anterior (no un punto de
  // intercalación colapsado en su límite con el siguiente, que puede
  // resolverse de forma ambigua según el navegador — a veces como "final de
  // esta línea", a veces como "principio de la siguiente"; ver _tdCharRect).
  // Motivo de por qué hace falta esto (señalado por Alberto): el editor de
  // textos (Trix, motor de fuentes del navegador) y el lienzo (Canvas 2D,
  // measureText) miden el ancho del texto con motores distintos, así que el
  // punto exacto de corte casi nunca cae en el mismo salto de línea visible
  // en los dos sitios — no se puede pretender una única recta precisa.
  //   · xSplit/yBefore: borde derecho/inferior del ÚLTIMO carácter de la
  //     página anterior tal y como se ve escrito aquí mismo — justo tras su
  //     última palabra.
  //   · yAfter: borde superior del PRIMER carácter de la página siguiente.
  // Geometría exacta pedida por Alberto: la vertical va exactamente en
  // xSplit, de yBefore a yAfter; la recta hacia la DERECHA cuelga de su
  // extremo SUPERIOR (yBefore, físicamente más arriba); la recta hacia la
  // IZQUIERDA cuelga de su extremo INFERIOR (yAfter). Si Trix envolvió el
  // texto exactamente en el mismo punto que predijo el lienzo, yBefore y
  // yAfter coinciden (hueco 0) y las dos rectas quedan a la misma altura,
  // unidas por xSplit — visualmente una única línea con un pequeño quiebro
  // en xSplit, sin caso aparte.
  const splits = pageStartChars.map((c, i) => {
    const imgBeforeEl = (i > 0 && pageEdgeImages[i - 1]) ? pageEdgeImages[i - 1].imgLastEl : null;
    const imgAfterEl = pageEdgeImages[i] ? pageEdgeImages[i].imgFirstEl : null;
    return _tdComputeSplitGeometry(editorEl, innerRect, blocks, c, imgBeforeEl, imgAfterEl);
  });

  // Líneas de cambio de página: una por cada punto donde termina una página
  // y empieza la siguiente (todas menos la primera, que es el principio del
  // documento, no un cambio de hoja) — puramente visual, sin ningún tirador
  // ni interacción (quitado por completo, pedido explícito de Alberto: los
  // saltos se generan solos según el tamaño de caja en el lienzo).
  const breaksEl = document.getElementById('tdPageBreaks');
  if(breaksEl){
    breaksEl.innerHTML = '';
    for(let i = 1; i < _tdViewPageOffsets.length; i++){
      const { x: xSplit, yBefore, yAfter } = splits[i];
      const gap = yAfter - yBefore;
      const line = document.createElement('div');
      line.className = 'td-pagebreak-line';
      line.style.top = yBefore + 'px';
      line.style.setProperty('--gap', gap + 'px');
      line.style.setProperty('--split-x', xSplit + 'px');
      const visualTop = document.createElement('div');
      visualTop.className = 'td-pagebreak-visual-top';
      const connector = document.createElement('div');
      connector.className = 'td-pagebreak-connector';
      const visualBottom = document.createElement('div');
      visualBottom.className = 'td-pagebreak-visual-bottom';
      line.appendChild(visualTop);
      line.appendChild(connector);
      line.appendChild(visualBottom);
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

// Petición explícita de Alberto: se ha quitado TODA la interacción manual
// con los saltos de página desde el editor de textos (menú Eliminar/Mover,
// puntos azules candidatos, botón "Salto de página") — daba demasiados
// problemas y no hace falta: los saltos se crean/ajustan solos según el
// tamaño de caja del texto en el propio lienzo (ver _tdReflowAfterResize
// en editor.js), y el editor de textos se limita a MOSTRAR dónde caen
// (ver _tdRecomputeViewPagination más abajo), sin ningún tirador ni
// interacción sobre ellos.

function _tdUpdateViewPageNav(){
  const num = document.getElementById('tdPageNum');
  const prev = document.getElementById('tdPagePrev');
  const next = document.getElementById('tdPageNext');
  const total = _tdViewPageStartChars.length;
  const _newText = (_tdViewCurPage + 1) + ' / ' + total;
  const _changed = num && num.textContent !== _newText;
  if(num) num.textContent = _newText;
  if(prev) prev.disabled = _tdViewCurPage <= 0;
  if(next) next.disabled = _tdViewCurPage >= total - 1;
  // Recalcular el tope de ancho del título SOLO cuando el texto "X / Y"
  // cambia de verdad — esta función se llama en cada evento de scroll
  // continuo (arrastre táctil/rueda, vía _tdSyncPageNavFromOffset), no solo
  // al cambiar de página, así que forzar el reflow de _tdUpdateTitlePill en
  // cada tick sería caro y no aporta nada si el texto sigue siendo el mismo.
  if (_changed && typeof _tdUpdateTitlePill === 'function') _tdUpdateTitlePill();
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
  if(changed && announce) edToast(I18n.t('td_pageToast', { n: _tdViewCurPage + 1 }));
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
  // Tope de ancho: .ed-top-pagnav (clase compartida con el editor general) se
  // centra con position:absolute, fuera del flujo flex — el título podría
  // crecer hasta tapar el grupo de páginas si no se limita aquí. Mismo
  // criterio que _edUpdateTitlePill: como máximo hasta tocar la franja
  // blanca de ese grupo, con un margen mínimo.
  const pagnavPill = document.getElementById('tdPageNavPill');
  if (pagnavPill) {
    const _titleLeft = title.getBoundingClientRect().left;
    const _pagnavPillLeft = pagnavPill.getBoundingClientRect().left;
    title.style.maxWidth = Math.max(0, _pagnavPillLeft - _titleLeft - 6) + 'px';
  } else {
    title.style.maxWidth = '';
  }
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
        // Nodos internos de Trix marcados con data-trix-serialize="false"
        // (p.ej. los "cursor-target" \uFEFF que Trix coloca a los lados de
        // CUALQUIER adjunto no editable, como una imagen, para darle al
        // cursor un sitio donde colocarse junto a él): el propio serializador
        // de Trix los elimina antes de escribir el HTML "limpio" (ver
        // trix.umd.min.js, selector literal "[data-trix-serialize=false]").
        // _tdParseBlocks debe ignorarlos exactamente igual — si no, al leer
        // el DOM VIVO del editor (editorEl.innerHTML, usado por la vista
        // previa en vivo — ver _tdRecomputeViewPagination) aparecen como
        // "palabras" fantasma pegadas a cada imagen que NO existen al leer
        // el HTML limpio (hidden.value/la.sourceHTML, usado por "Guardar
        // cambios"/_tdApplyToCanvas). Si una imagen queda sola al principio
        // de su línea (caso habitual desde _tdSplitParagraphAroundAttachment,
        // que la deja en su propia línea), esa palabra fantasma es la ÚNICA
        // palabra de esa línea y provoca un flushLine() de más — una línea
        // en blanco de un alto de línea entero que sí ocupa espacio en la
        // vista previa pero nunca existió en el resultado real — bug
        // reportado por Alberto: "los saltos de hoja no coinciden con los
        // saltos reales del editor general... desde que se implementó la
        // inserción de imágenes". Comprobado con Playwright + el propio
        // trix.umd.min.js: _tdParseBlocks(editorEl.innerHTML) y
        // _tdParseBlocks(hidden.value) daban bloques distintos para el mismo
        // documento; con este guard dan EXACTAMENTE los mismos runs.
        if(child.getAttribute('data-trix-serialize') === 'false') return;
        const tag = child.tagName.toLowerCase();
        if(tag === 'br'){ runs.push({break:true}); return; }
        // Imagen insertada en el flujo de texto (ver _tdInsertImage): Trix la
        // coloca como una PIEZA más dentro del párrafo donde estaba el
        // cursor (un <figure> hijo directo de ESE párrafo, mezclado con el
        // texto) — NO como un bloque propio independiente. Se detecta aquí
        // (donde de verdad aparece) y se emite como run especial "isImage";
        // _tdLayoutPages corta la línea de texto en este punto al procesar
        // los runs del bloque. Antes se buscaba (sin éxito nunca) a nivel de
        // bloque completo, así que esta rama recorría el <figure> como si
        // fuera un contenedor de texto más y se perdía en silencio — bug
        // reportado por Alberto: "solo aparece el texto, sin cambio de
        // línea siquiera" entre el texto de antes y el de después.
        if(tag === 'figure' && child.classList.contains('attachment--preview')){
          const imgEl = child.querySelector('img');
          if(imgEl && imgEl.getAttribute('src')){
            const natW = parseInt(imgEl.getAttribute('width'), 10)  || imgEl.naturalWidth  || 1;
            const natH = parseInt(imgEl.getAttribute('height'), 10) || imgEl.naturalHeight || 1;
            // heightEm: alto de la imagen expresado en "veces el tamaño de
            // letra" del editor de textos EN VIVO (medido con
            // getComputedStyle sobre el propio #tdEditor en este instante),
            // NO una fracción del ancho de columna. BUG CORREGIDO (pedido
            // explícito de Alberto: "la relación del tamaño de la imagen con
            // el tamaño del texto... se respete al insertarse en el
            // canvas"): el tamaño de letra en pantalla del editor de textos
            // (.td-editor, ≈16.8px) NO es el mismo que el real del lienzo
            // (TD_BODY_SIZE=22px) — ver comentario de editorCssFontSizePx
            // más arriba en este archivo. Guardar solo una fracción del
            // ANCHO de columna ignoraba esa diferencia: una imagen que en el
            // editor se veía, p.ej., "tan alta como 3 líneas de texto",
            // podía acabar viéndose más pequeña o más grande que eso en el
            // lienzo, porque las columnas y los tamaños de letra escalan en
            // proporciones distintas entre los dos sitios. Expresando el
            // alto como múltiplo del tamaño de letra (aquí) y aplicando ESE
            // mismo múltiplo al tamaño de letra real del lienzo (ver
            // _tdLayoutPages), la imagen conserva su tamaño relativo al
            // texto en ambos sitios, con independencia del ancho de columna.
            const liveEditorImg = document.getElementById('tdEditor');
            let editorFontPx = 16;
            try{ if(liveEditorImg) editorFontPx = parseFloat(getComputedStyle(liveEditorImg).fontSize) || editorFontPx; }catch(_e){}
            const heightEm = Math.max(0.5, natH / editorFontPx);
            const aspect = natH > 0 ? (natW / natH) : 1;
            // widthFrac: ancho de la imagen como fracción del ancho de
            // columna disponible AQUÍ MISMO (columna ancha del editor de
            // texto, .td-page menos su relleno lateral) — segunda señal,
            // independiente de heightEm, para el tope en _tdLayoutPages.
            // POR QUÉ HACE FALTA (bug real, confirmado con el panel de
            // diagnóstico 🩺 sobre un caso con dos imágenes reales): heightEm
            // por sí solo puede disparar el alto real del lienzo muy por
            // encima de lo razonable para cualquier imagen que NO sea muy
            // panorámica — el tope de ANCHO ya existente en _tdLayoutPages
            // apenas actúa sobre una imagen más cuadrada/vertical (su ancho
            // ya "cabía"), así que su alto se queda anclado al valor inflado
            // que heightEm calculó a partir de cómo de grande decidió Trix
            // mostrarla en su columna ancha — nada que ver con cuánto debería
            // ocupar en la hoja estrecha real. Ejemplo real medido: una
            // imagen de proporción ~0.84 (poco más alta que ancha) se
            // calculaba con heightEm=35 → 389px de alto real, la MITAD de
            // toda la página, para una sola imagen. _tdLayoutPages usa la
            // MÁS PEQUEÑA de las dos estimas (heightEm y esta), nunca la
            // mayor — ninguna imagen puede acabar más grande de lo que
            // sugiere CUALQUIERA de las dos señales.
            //
            // BUG REAL SEPARADO (localizado tras varias rondas de
            // diagnóstico con Alberto): _tdParseBlocks también se llama con
            // el editor de textos CERRADO — p. ej. "Exceptuar en esta hoja"
            // se dispara desde el editor GENERAL, sin que #tdPage esté
            // montado/visible en ese momento. Con #tdPage oculto,
            // clientWidth da 0, colW se queda en el mínimo (1), y
            // widthFrac sale SIEMPRE exactamente 1 — la señal queda
            // completamente anulada justo en ese caso, sin avisar, y todo
            // vuelve a depender solo de heightEm (el problema que este
            // mismo bloque existe para evitar). Umbral 50px: cualquier
            // valor por debajo es claramente "no renderizado", no un
            // ancho real de columna estrecha.
            const pageColEl = document.getElementById('tdPage');
            let widthFrac = 1;
            try{
              const measurable = pageColEl && pageColEl.clientWidth > 50;
              if(measurable){
                const cs = getComputedStyle(pageColEl);
                const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
                const colW = Math.max(1, pageColEl.clientWidth - padX);
                widthFrac = Math.min(1, natW / colW);
              } else {
                // #tdPage no medible ahora mismo: usar el ancho máximo real
                // de esa columna tal como la fija editor.css (.td-page,
                // width: min(100%, 760px); padding: 28px 24px) — 760-48=712
                // — en vez de dejar que widthFrac se rompa en silencio.
                widthFrac = Math.min(1, natW / 712);
              }
            }catch(_e){}
            runs.push({ isImage: true, src: imgEl.getAttribute('src'), heightEm, aspect, widthFrac });
          }
          return;
        }
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
  // NOTA: 'figure' NO va aquí. Un <figure> (imagen insertada, ver
  // _tdInsertImage) es siempre una PIEZA dentro de un párrafo — igual que
  // <strong>/<em>/<br> — nunca un bloque real independiente (ver el
  // comentario grande de wrapsRealBlock más abajo, que explica exactamente
  // este mismo tipo de fallo para negrita/cursiva/saltos de línea). Llegué
  // a añadirlo aquí al construir la inserción de imágenes, y eso reprodujo
  // el MISMO bug ya documentado: un párrafo alineado que mezclaba texto e
  // imagen (Trix envuelve el párrafo ENTERO en una sola etiqueta de
  // alineación) se recorría como si la envoltura contuviera bloques
  // separados — y el texto suelto alrededor de la imagen, al ser nodos de
  // texto (no elementos), es invisible para outer.children y se perdía por
  // completo. Bug reportado por Alberto: cambiar la alineación de un texto
  // con imágenes dejaba "Aplicar al lienzo" sin nada que aplicar.
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
  // Imágenes insertadas en el flujo de texto (ver _tdInsertImage): por
  // defecto Trix añade una leyenda automática con el nombre de archivo y el
  // tamaño en bytes bajo cada imagen — sobra aquí (pedido explícito de
  // Alberto: "incluyen información de la imagen que sobra"). Se desactiva
  // vía la config oficial (Trix.config.attachments.preview.caption), no
  // ocultando por CSS: así ni siquiera se genera el texto.
  if(Trix.config.attachments && Trix.config.attachments.preview){
    Trix.config.attachments.preview.caption = { name: false, size: false };
  }
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
  // Solo lo usa _tdRecomputeViewPagination (vista previa en el editor de
  // textos) — el ancho de escritura ahí (.td-page, "cómodo de lectura",
  // hasta 760px en PC) no tiene ninguna relación con el ancho real de la
  // hoja en el lienzo (frame.pw, p.ej. 360px): sin este factor, el
  // algoritmo predice muchos MENOS caracteres por línea de los que Trix
  // cabe de verdad (con su propio tamaño de letra CSS, fijo, dentro de ese
  // ancho mucho mayor) — la predicción entera queda desincronizada de
  // dónde caen las líneas de verdad en Trix, no solo "un poco distinta"
  // como el quiebro en Z está pensado para tolerar. _tdApplyToCanvas (el
  // único sitio que de verdad decide el contenido de cada hoja) nunca pasa
  // esto — sigue usando bodySize/h1Size tal cual, sin escalar.
  const fontSizeScale = (opts && opts.fontSizeScale) || 1;
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
  // Alto de caja que haría falta para contener EXACTAMENTE el contenido de
  // cada página (margen incluido) — no el alto del marco que se usó para
  // calcularla. Pedido explícito de Alberto: los saltos de página fijados a
  // mano en el editor de textos deben poder crear/redimensionar cajas al
  // aplicar, no depender de que ya exista una caja de cierto tamaño — ver
  // _tdReflowFlowInPlace/_tdApplyToCanvas, que usan esto para dimensionar
  // cada hoja según dónde haya quedado el corte, en vez de usar el tamaño
  // de caja que ya hubiera antes.
  const pageBoxHeights = [];
  const pageBoxHeightFor = () => hasExplicitPad
    ? (curY + (opts.padTop || 0) + (opts.padBottom || 0))
    : (curY / Math.max(0.01, 1 - 2 * marginFracY));
  let curLines = [];
  let curY = 0; // relativo al margen superior (0..textH)
  let charsSoFar = 0;
  // Offset donde empieza la línea que se está formando AHORA MISMO en
  // lineRuns — se actualiza en el momento exacto en que lineRuns pasa de
  // vacía a tener su primera palabra (ver el bucle de palabras, más abajo).
  // Es la fuente correcta para "dónde empieza la hoja nueva" en un salto
  // reactivo: a diferencia de restarle a endChars la longitud de las runs
  // ya formadas de "entry" (que falla cuando flushLine ha recortado algún
  // espacio final de esas runs — ese espacio sí se contó en charsSoFar en
  // su momento, pero ya no está en el texto de la línea, así que la resta
  // se quedaba corta en esa misma cantidad — comprobado con un caso real:
  // aparecía a mitad de la primera palabra de la hoja nueva), este valor
  // no necesita reconstruirse a partir de nada: es literalmente el offset
  // real en el instante en que la línea arrancó.
  //
  // INTENTO ABANDONADO (sumar el texto de pages/curLines ya construidas en
  // vez de llevar este contador): parecía más robusto al no depender de
  // ningún contador aparte, pero falla por la razón opuesta — pages/
  // curLines contienen las líneas YA RECORTADAS para mostrarse (sin los
  // espacios finales que flushLine quita), mientras que pageStartChars
  // tiene que dar offsets sobre flatText, el texto ORIGINAL SIN recortar
  // (ver _tdBlocksFlatText) — cada línea ajustada que perdió su espacio
  // final desincroniza la suma en 1 carácter más, acumulándose según
  // avanza el documento. Comprobado con pruebas reales: bastantes más
  // saltos a mitad de palabra que antes, no menos. charsSoFar SÍ sigue
  // fielmente los offsets de flatText en todo momento (se incrementa por
  // cada palabra/espacio tokenizado, recortado después o no) — el único
  // problema real era capturar su valor en el momento exacto correcto,
  // que es justo lo que hace esta variable.
  let curLineStartOffset = 0;


  // Efectos de cortar página: extraído para poder dispararse tanto de forma
  // REACTIVA (dentro de pushLine, cuando una línea YA decidida no cabe
  // verticalmente — comportamiento de siempre) como de forma ANTICIPADA
  // (antes de decidir las palabras de la línea siguiente — ver más abajo en
  // el bucle de palabras, arreglo del bug "primera línea de la hoja
  // vertical se sale de la hoja").
  function _tdDoBreak(reason, nextPreview, newPageStartOffset){
    // Traza de cada salto real (window._tdBreakLog) — pedido para localizar
    // el bug "párrafo duplicado entre hojas" con el contenido real de
    // Alberto, tras varios intentos fallidos de reproducirlo con casos
    // sintéticos. Vuelca en qué línea de curLines termina la hoja que se
    // cierra, y con qué línea/palabra sigue el bucle justo después — si hay
    // duplicación, debe verse aquí como el mismo texto apareciendo tanto en
    // "últimaLineaHojaCerrada" de un salto como en "primeraLineaHojaNueva"
    // del siguiente.
    if(window._tdBreakLog){
      const lastLine = curLines.length ? curLines[curLines.length-1] : null;
      window._tdBreakLog.push({
        pageIdx: pages.length, reason,
        charsSoFar, curY: Math.round(curY), textH: Math.round(textH), frameIdx,
        nLineasHojaCerrada: curLines.length,
        ultimaLineaHojaCerrada: lastLine ? (lastLine.runs||[]).map(r=>r.text||'').join('') : (lastLine && lastLine.kind==='image' ? '(imagen)' : null),
        siguienteContenido: nextPreview || null,
        newPageStartOffset
      });
    }
    pages.push(curLines);
    pageBoxHeights.push(pageBoxHeightFor());
    curLines = [];
    curY = 0;
    frameIdx++;
    loadFrame();
    const endChars = charsSoFar;
    // Ver el comentario largo de curLineStartOffset más arriba (razón
    // completa). newPageStartOffset, cuando se pasa, viene ya calculado
    // así por el punto de llamada — nunca reconstruido aquí.
    pageStartChars.push(newPageStartOffset != null ? newPageStartOffset : (lineStartChars.length ? lineStartChars[lineStartChars.length - 1] : 0));
    while(forcedIdx < forced.length && forced[forcedIdx] <= endChars) forcedIdx++;
  }

  function pushLine(entry){
    const endChars = charsSoFar; // caracteres acumulados hasta el final de ESTA línea
    let shouldBreak = curY + entry.height > textH && curLines.length > 0;
    let breakReason = shouldBreak ? 'reactivo:overflow' : null;
    // Salto forzado a mano (arrastre): si ya se ha PASADO el punto fijado
    // (estrictamente más allá, no con "="), cortar aquí también, haya sitio
    // o no — pero solo si esta página ya tiene algo (si no, dejaría una
    // página vacía). El "estrictamente" es importante: el punto fijado
    // (ver _tdLineStartCharsCache) es siempre el FINAL de una línea real —
    // esa línea debe quedarse en ESTA página (es justo donde el usuario
    // soltó el arrastre), no empujarse a la siguiente. Con ">=" en vez de
    // ">", esa línea concreta se empujaba una página de más — bug
    // reportado por Alberto ("al mover saltos hacia arriba, crea saltos
    // nuevos"): el contenido real no coincidía con el punto donde se soltó
    // el arrastre, y la validación posterior (que sí compara contra el
    // contenido real) lo detectaba como un punto distinto y no conseguía
    // asentarse en uno solo.
    if(!shouldBreak && curLines.length > 0 && forcedIdx < forced.length && endChars > forced[forcedIdx]){
      shouldBreak = true;
      breakReason = 'reactivo:forzado';
    }
    if(shouldBreak){
      // newPageStartOffset: curLineStartOffset, capturado en el instante
      // exacto en que "entry" arrancó como línea nueva (ver el bucle de
      // palabras y su comentario largo, y el de curLineStartOffset arriba)
      // — sigue fielmente los offsets de flatText en todo momento, a
      // diferencia de intentar reconstruirlo a partir del texto YA
      // recortado de las líneas.
      _tdDoBreak(breakReason, (entry.runs||[]).map(r=>r.text||'').join('') || (entry.kind==='image' ? '(imagen)' : null), curLineStartOffset);
    }
    const baseline = curY + (entry.kind === 'image' ? 0 : entry.height * 0.78);
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
    // Imagen insertada en el flujo (ver _tdParseBlocks/_tdInsertImage): a
    // diferencia del texto, "y" aquí es la esquina SUPERIOR (drawImage la
    // necesita así), no la línea base — de ahí el offset 0 más arriba.
    if(entry.kind === 'image'){ lineObj.src = entry.src; lineObj.imgW = entry.imgW; lineObj.imgH = entry.imgH; }
    curLines.push(lineObj);
    curY += entry.height;
    lineStartChars.push(endChars);
    return lineObj;
  }

  function forcePageBreak(){
    if(curLines.length > 0){
      pages.push(curLines);
      pageBoxHeights.push(pageBoxHeightFor());
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
    const baseFontSize = (isHeading ? h1SizeDefault : bodySizeDefault) * fontSizeScale;
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
      // Imagen intercalada en mitad del párrafo (ver runsFromInline) — pasa
      // como una "palabra" especial más; el bucle de más abajo la reconoce
      // por w.isImage y corta la línea de texto en ese punto.
      if(run.isImage){ words.push({isImage:true, src:run.src, heightEm:run.heightEm, aspect:run.aspect, widthFrac:run.widthFrac}); return; }
      const parts = (run.text || '').split(/(\s+)/).filter(s => s.length);
      parts.forEach(p => words.push({
        text:p, bold: isHeading ? true : !!run.bold, italic:!!run.italic, strike:!!run.strike, mono:!!run.mono,
        fontSize: run.fontSize ? run.fontSize * fontSizeScale : baseFontSize,
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
    // null hasta que se coloca la primera palabra real de la línea — NO
    // baseFontSize desde el principio: si se inicializara así, una línea
    // compuesta ENTERAMENTE por texto más pequeño que el tamaño por defecto
    // del bloque (p.ej. contenido pegado a 16px en un párrafo de 22px, ver
    // bug de pegado señalado por Alberto) nunca lo reflejaría — el chequeo
    // de abajo solo dejaba CRECER el valor (font.size > lineMaxFontSize),
    // nunca DECRECER, así que esa línea se quedaba registrada con la altura
    // del tamaño por defecto aunque su texto real fuera más pequeño.
    let lineMaxFontSize = null;
    let firstLineOfBlock = true;
    let lastLineOfBlock = null; // la última línea empujada de este bloque — el justificado no la estira (convención tipográfica: la última línea de un párrafo se queda a su ancho natural)

    function flushLine(){
      while(lineRuns.length && lineRuns[lineRuns.length - 1].isSpace) lineRuns.pop();
      // Línea vacía (p.ej. dos <br> seguidos, sin ninguna palabra real entre
      // ellos) — nunca se fijó lineMaxFontSize, se usa el tamaño por
      // defecto del bloque como única opción razonable para su altura.
      const effectiveFontSize = lineMaxFontSize !== null ? lineMaxFontSize : baseFontSize;
      lastLineOfBlock = pushLine({
        height: effectiveFontSize * lhMult, indent: indentPx, kind: block.kind, fontSize: effectiveFontSize,
        marker: firstLineOfBlock ? marker : null, runs: lineRuns, align: block.align
      });
      firstLineOfBlock = false;
      lineRuns = [];
      lineWidth = 0;
      lineMaxFontSize = null;
    }

    words.forEach(w => {
      if(w.break){
        flushLine();
        // BUG CORREGIDO (reportado por Alberto: el salto de página del
        // editor de textos aparece cada vez más lejos del contenido real
        // a medida que el documento crece — confirmado con ejecución real
        // que el desvío es AUMULATIVO, nunca se corrige solo). Una línea
        // en BLANCO (dos <br> seguidos sin ninguna palabra real entre
        // ellos — el final habitual de cada párrafo, ver
        // _tdSplitParagraphAroundAttachment) se maquetaba igual que
        // cualquier otra línea (ver flushLine), pero curLineStartOffset —
        // el carácter que _tdDoBreak usa como inicio de la hoja nueva SI
        // esa línea concreta es la que no cabe — solo se actualizaba al
        // procesar una palabra de texto real o una imagen, nunca al
        // procesar un <br>. Si la línea en blanco resultaba ser la que
        // desbordaba, el salto quedaba registrado en el carácter donde
        // empezó la ÚLTIMA LÍNEA CON TEXTO anterior, no en el suyo propio
        // — y como esa desviación nunca se corregía sola en los saltos
        // siguientes, se iba arrastrando y creciendo página tras página.
        curLineStartOffset = charsSoFar;
        return;
      }
      if(w.isImage){
        // Corta la línea de texto pendiente (si la había), inserta la
        // imagen como línea atómica propia (mismo pushLine que usan las
        // líneas de texto, con su mismo criterio de salto de página si no
        // cupiera), y sigue el resto del párrafo después en una línea
        // nueva — pedido explícito de Alberto: "tener en cuenta las
        // imágenes insertadas para el cálculo de inserción en el canvas".
        //
        // Tamaño: heightEm × tamaño de letra real del lienzo — conserva
        // "esta imagen mide tantas veces el tamaño de letra" tal como se
        // veía en el editor de textos (pedido explícito de Alberto: "la
        // relación del tamaño de la imagen con el tamaño del texto... se
        // respete"). Tope: nunca más de TD_IMG_MAX_HEIGHT_FRAC del alto de
        // texto disponible — bug real que motivó tener un tope, confirmado
        // con el panel de diagnóstico: una imagen de proporción ~0.84 se
        // calculaba en 389px, la MITAD de toda la página, sin ningún límite.
        //
        // HISTORIAL — hasta v37.23 el tope no era directo: se calculaba una
        // SEGUNDA estimación independiente (widthFrac × ancho disponible) y
        // se usaba la más pequeña de las dos. Eso sí evitaba el caso del
        // 50%, pero esa segunda estimación usa una escala completamente
        // distinta (ancho editor→lienzo, ~0.46×, frente al tamaño de letra
        // editor→lienzo de heightEm, ~1.3×), así que en la práctica encogía
        // TAMBIÉN imágenes que nunca fueron el problema — confirmado con el
        // diagnóstico de Alberto sobre su propia obra: una captura de
        // pantalla perfectamente razonable (182px, 23% de la página) se
        // quedaba en 59px (8%) en cuanto se recalculaba. Y como esta función
        // es la ÚNICA fuente de la verdad tanto para la vista previa como
        // para "Aplicar al lienzo" (ver cabecera del fichero), cualquier
        // cambio de fórmula aquí hace que las hojas YA aplicadas con la
        // fórmula anterior dejen de coincidir con lo que la vista previa
        // recalcula con la fórmula nueva la próxima vez que se reeditan —
        // que es exactamente el bug de "el salto de página no coincide"
        // reportado por Alberto. Un tope directo sobre el propio heightEm
        // ataja el caso real (imagen desproporcionada) sin encoger de más
        // el caso normal, y dado que ninguna imagen "normal" se acerca al
        // límite, es mucho más estable frente a futuros cambios de fórmula.
        const availImg = Math.max(20, textW - indentPx);
        let imgH = Math.max(1, Math.round((w.heightEm || 5) * baseFontSize));
        let imgW = Math.max(1, Math.round(imgH * (w.aspect || 1)));
        if(imgW > availImg){ imgW = availImg; imgH = Math.max(1, Math.round(imgW / (w.aspect || 1))); }
        const maxImgH = Math.max(1, Math.round(textH * TD_IMG_MAX_HEIGHT_FRAC));
        if(imgH > maxImgH){
          imgH = maxImgH;
          imgW = Math.max(1, Math.round(imgH * (w.aspect || 1)));
          if(imgW > availImg){ imgW = availImg; imgH = Math.max(1, Math.round(imgW / (w.aspect || 1))); }
        }
        if(lineRuns.length) flushLine();
        // La imagen no consume caracteres (no tiene texto propio) — su
        // punto de partida real es charsSoFar tal cual está ahora mismo,
        // sin cambios. Necesario para que un salto reactivo que la afecte
        // directamente a ELLA (no al texto que la precede) registre el
        // offset correcto — ver curLineStartOffset arriba.
        curLineStartOffset = charsSoFar;
        // Las imágenes siempre centradas, sea cual sea la alineación del
        // párrafo (izquierda/derecha/justificado/centrado) — pedido
        // explícito de Alberto: "que las imágenes siempre estén centradas
        // con el texto, sea cual sea la alineación del texto". A diferencia
        // de las líneas de texto (que sí heredan block.align), la imagen
        // ignora ese valor a propósito.
        pushLine({height: imgH, indent: indentPx, kind:'image', fontSize: imgH, marker:null, runs:[], align: 'center', src: w.src, imgW, imgH});
        firstLineOfBlock = false;
        return;
      }
      if(w.isSpace && lineRuns.length === 0) return; // no empezar línea con espacio
      // Salto de página ANTICIPADO: si esta es la primera palabra de una
      // línea nueva y, por la altura estimada de esa línea (tamaño base de
      // este bloque — el real de la línea aún no se conoce, depende de qué
      // palabras entren), no cabe verticalmente en lo que queda de esta
      // página, cambiar de marco AHORA, antes de decidir cuántas palabras
      // entran. Si no, el ajuste se decide con el ancho de la hoja VIEJA y,
      // al saltar a una hoja con otra orientación (p.ej. horizontal→
      // vertical, más estrecha), la línea se queda demasiado larga para la
      // hoja nueva y se sale por el borde — bug reportado por Alberto. Es
      // una estimación (no el tamaño exacto de esta palabra en concreto)
      // porque cubre el caso normal (tamaño uniforme en el párrafo); el
      // salto reactivo de pushLine sigue ahí como red de seguridad para
      // líneas con tamaños de letra dispares que la estimación no acierte.
      if(lineRuns.length === 0 && curLines.length > 0){
        const estHeight = baseFontSize * lhMult;
        // Aquí charsSoFar SÍ es directamente correcto como inicio de la
        // hoja nueva: todavía no se ha sumado la palabra w (eso pasa más
        // abajo, tras esta comprobación) — no hace falta restar nada, a
        // diferencia del salto reactivo de pushLine.
        if(curY + estHeight > textH) _tdDoBreak('anticipado', w.text || null, charsSoFar);
      }
      ctx.font = _tdFontStr(w.fontSize, w.bold, w.italic, w.mono, w.fontFamily);
      const width = ctx.measureText(w.text).width;
      const avail = Math.max(20, textW - indentPx); // textW: marco actual, puede cambiar entre líneas
      if(lineWidth + width > avail && lineRuns.length > 0 && !w.isSpace){
        flushLine();
      }
      // Aquí, justo antes de añadir la palabra — tanto si lineRuns ya
      // estaba vacía al entrar en esta iteración como si acaba de vaciarla
      // flushLine() dos líneas más arriba — es el momento exacto en que
      // arranca una línea nueva. Ver curLineStartOffset arriba: es la
      // fuente correcta para el salto reactivo de pushLine, sin tener que
      // reconstruirlo después.
      if(lineRuns.length === 0) curLineStartOffset = charsSoFar;
      lineRuns.push({
        text:w.text, bold:w.bold, italic:w.italic, strike:w.strike, mono:w.mono,
        fontSize:w.fontSize, fontFamily:w.fontFamily, isSpace:w.isSpace, width, x:0
      });
      lineWidth += width;
      charsSoFar += w.text.length;
      // Refleja el tamaño REAL de las palabras de ESTA línea — tanto si es
      // mayor como si es menor que lo que ya llevaba registrado (antes solo
      // se permitía crecer, ver comentario en la declaración de arriba).
      if(lineMaxFontSize === null || w.fontSize > lineMaxFontSize) lineMaxFontSize = w.fontSize;
    });
    if(lineRuns.length) flushLine();
    if(lastLineOfBlock) lastLineOfBlock.isBlockEnd = true;

    curY += baseFontSize * TD_PARA_GAP_MULT;
  });

  if(curLines.length){ pages.push(curLines); pageBoxHeights.push(pageBoxHeightFor()); }
  if(pages.length === 0){ pages.push([]); pageBoxHeights.push(0); }

  // Posición x de cada run según la alineación real de la línea (heredada
  // del bloque de Trix — ver _tdParseBlocks/_tdRegisterCustomTrixAttributes).
  // Se calcula aquí, una única vez; _drawRichLines (editor.js) usa esta x
  // tal cual al dibujar en el lienzo, sin saber nada de alineación por su
  // cuenta — por eso basta con tocar este único sitio.
  pages.forEach(page => {
    page.forEach(line => {
      const availW = line.availW || 0;

      if(line.kind === 'image'){
        // Igual que con el texto: la posición X final se calcula aquí, una
        // única vez, ANTES de borrar line.availW más abajo — _drawRichLines
        // (editor.js) usa line.imgX tal cual, sin recalcular nada. BUG
        // CORREGIDO (reportado por Alberto: "en el canvas se inserta
        // alineada a la izquierda"): antes _drawRichLines leía
        // line.availW directamente para centrarla, pero para cuando se
        // dibuja esa propiedad ya se había borrado aquí mismo (unas líneas
        // más abajo), así que cualquier alineación caía siempre al valor
        // por defecto (el propio ancho de la imagen) y el resultado era
        // "pegada a la izquierda" con independencia de line.align.
        let imgX = line.indent;
        if(line.align === 'center') imgX = line.indent + Math.max(0, (availW - line.imgW) / 2);
        else if(line.align === 'right') imgX = line.indent + Math.max(0, availW - line.imgW);
        line.imgX = imgX;
        delete line.availW;
        delete line.isBlockEnd;
        return;
      }

      let lineWidth = 0;
      line.runs.forEach(r => { lineWidth += r.width; });

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

  return {pages, mx, my, pageStartChars, lineStartChars, pageBoxHeights};
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

// Nombre de un flujo de texto, para la ventana de capas (editor-layers.js,
// propiedad la.name — ya editable a mano ahí con doble toque, ver
// _lyStartNameEdit) y para el título del Editor de textos al reeditar (ver
// edOpenTextDoc). Si hay algún bloque marcado como título (kind:'heading',
// ver _tdParseBlocks) con texto real, se usa ese; si no, la primera línea
// con contenido, sea del tipo que sea (párrafo, cita, lista...). Se
// recalcula tanto al insertarse por primera vez como en cada reedición
// posterior (ver _tdApplyToCanvas) — petición explícita de Alberto: si se
// añade un título o cambia el inicio del texto, el nombre debe actualizarse
// con él, aunque eso sobrescriba un renombrado manual hecho antes desde la
// ventana de capas.
function _tdComputeFlowName(blocks){
  const blockText = b => (b.runs || []).filter(r => r.text).map(r => r.text).join('').trim().replace(/\s+/g, ' ');
  const heading = (blocks || []).find(b => b.kind === 'heading' && blockText(b));
  if (heading) return blockText(heading).slice(0, 60);
  const first = (blocks || []).find(b => blockText(b));
  return first ? blockText(first).slice(0, 60) : 'Editor de textos';
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
// deriveBoxFromContent=true (mismo criterio que "Guardar cambios", no el de
// redimensionar con tiradores): la hoja siguiente al hueco debe poder
// absorber TODO el texto redistribuido hasta llenar la página entera, no
// quedar acotada a su alto real si ese alto era solo el residuo automático
// de una edición anterior más corta — bug reportado por Alberto (solo se
// vertía una parte del texto en la hoja siguiente). Las páginas que Alberto
// sí redimensionó a mano con los tiradores (_tdBoxManualH) siguen
// respetándose igual, aquí y en cualquier otro reflujo del mismo flujo.
function _tdExceptCurrentPage(){
  const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
  if(!la || !la.richLines || !la.richLines.length) return;
  const flowId = _tdEnsureFlowId(la);
  const page = edPages[edCurrentPage];
  if(!page) return;

  page.layers = (page.layers || []).filter(l => l !== la);
  page.layers.push(_tdMakeExceptMarker(flowId));

  _tdReflowFlowInPlace(la, false, true);
  if(typeof edCloseOptionsPanel === 'function') edCloseOptionsPanel();
  // _tdReflowFlowInPlace() ya llamó a edFitCanvas(), pero con el panel de
  // propiedades todavía abierto (se cierra justo después, arriba) — mide el
  // hueco disponible leyendo el DOM en el momento en que se llama, así que
  // ajustaba la cámara al área más pequeña (con panel) y luego cerrar el
  // panel ya no la restauraba. Hace falta este segundo ajuste, ya con el
  // panel cerrado, para recuperar el tamaño completo de la cámara.
  if(typeof edFitCanvas === 'function') edFitCanvas();
  edToast(I18n.t('td_exceptedToast'));
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
    edToast(I18n.t('td_errReadText', { msg: (err && err.message) || err }));
    return;
  }
  const hasContent = blocks.some(b => (b.runs || []).some(r => r.text && r.text.trim()));
  _tdLogApply('inicio', 'html.length=' + html.length + ' bloques=' + blocks.length
    + ' align=[' + blocks.map(b => b.align || '-').join(',') + ']'
    + ' hasContent=' + hasContent);
  if(!hasContent){
    _tdLogApply('SALIDA: sin contenido', 'blocks=' + JSON.stringify(blocks).slice(0, 500));
    edToast(I18n.t('td_writeSomethingFirst'));
    return;
  }

  // Nombre del flujo — ver _tdComputeFlowName. Se calcula aquí (antes de
  // crear/reeditar hojas) porque necesita los "blocks" originales (con su
  // kind: 'heading'/'paragraph'/...), no las líneas ya paginadas por hoja.
  // Se usa tanto en creación nueva como en reedición: si se añade un título
  // o cambia el inicio del texto, el nombre debe reflejarlo.
  const flowName = _tdComputeFlowName(blocks);

  const lineHeightMult = _tdLineHeightMult;

  // Red de seguridad: si algo de aquí abajo lanza un error inesperado (el
  // texto no se pierde, sigue en el editor tal cual), se avisa con un
  // mensaje claro en vez de quedarse a medias sin completar la acción ni
  // decir por qué — antes, la única forma de salir en ese caso era "Cerrar"
  // sin guardar, perdiendo los cambios sin ninguna explicación.
  try{
    if(_tdEditingFlowId){
      const existingLayer = _tdFindFlowLayer(_tdEditingFlowId);
      if(!existingLayer){ _tdLogApply('SALIDA: flujo no encontrado', '_tdEditingFlowId=' + _tdEditingFlowId); edToast(I18n.t('td_flowNotFound')); return; }
      // Se reutiliza el mismo motor que el redimensionado con los handlers:
      // conserva color/fondo/marco que ya tuviera cada hoja del flujo — el
      // contenido y el interlineado siempre se actualizan. El TAMAÑO de
      // cada caja, en cambio, se recalcula desde el contenido (página
      // completa como marco, caja redimensionada después para encajar con
      // el corte) SALVO en las hojas que Alberto redimensionó a mano con
      // los tiradores (_tdBoxManualH) — ver el comentario de deriveBoxFromContent
      // dentro de _tdReflowFlowInPlace para el porqué completo. Los saltos
      // de página ya NO se colocan a mano (quitado por completo, pedido
      // explícito de Alberto): el contenido decide dónde caen, no al revés.
      existingLayer.sourceHTML = html;
      existingLayer.lineHeightMult = lineHeightMult;
      const _wasPanelOpenBefore = !!(document.getElementById('editorShell')?.classList.contains('draw-active'));
      // Petición explícita de Alberto: al guardar cambios en un texto ya
      // existente, NO reabrir el panel de propiedades al volver (antes se
      // restauraba tal cual estaba — siempre abierto, porque la única forma
      // de llegar aquí es desde su propio botón "Editar texto"). Se pasa
      // "false" para que _tdReflowFlowInPlace no lo reabra, y se cierra del
      // todo + resetea la cámara explícitamente aquí abajo — si no, el
      // lienzo se queda con el tamaño encogido que tiene mientras el panel
      // está abierto, aunque el panel en sí ya no se vea.
      const r = _tdReflowFlowInPlace(existingLayer, false, true);
      if(!r){ _tdLogApply('SALIDA: reflujo falló', '_tdEditingFlowId=' + _tdEditingFlowId); edToast(I18n.t('td_reflowFailed')); return; }
      // El nombre SÍ se actualiza también al reeditar (petición explícita):
      // si se añade un título o cambia el inicio del texto, el nombre debe
      // reflejarlo. Puede abarcar varias páginas tras el reflujo, así que no
      // basta con existingLayer.
      edPages.forEach(pg => (pg.layers || []).forEach(l => { if (l && l._tdFlowId === _tdEditingFlowId) l.name = flowName; }));
      if(!_wasPanelOpenBefore) edLoadPage(r.firstIdx); // mismo respaldo que había, por si no hubiera panel que cerrar
      if(typeof edCloseOptionsPanel === 'function') edCloseOptionsPanel();
      if(typeof _edResetCameraToFit === 'function') _edResetCameraToFit();
      edToast(r.count === 1 ? I18n.t('td_textUpdatedOne') : I18n.t('td_textUpdatedMany', { n: r.count }));
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

      const { pages } = _tdLayoutPages(blocks, frames, lineHeightMult, undefined, []);
      const existingCount = Math.min(pages.length, edPages.length - startIdx);

      // Solo la primera hoja del flujo guarda sourceHTML íntegro — las
      // demás lo dejan sin definir (ver _tdFindFlowSourceHTML): un flujo
      // largo no necesita N copias idénticas del mismo HTML de origen.
      let _tdNewFlowOwnerAssigned = false;
      for(let i = 0; i < existingCount; i++){
        const pg = edPages[startIdx + i];
        pg.layers = pg.layers || [];
        pg.layers.push(_tdMakeTextLayer(pages[i], _tdNewFlowOwnerAssigned ? '' : html, flowId, lineHeightMult, undefined, []));
        _tdNewFlowOwnerAssigned = true;
      }
      // Si el texto sigue más allá de las hojas ya existentes, las que faltan
      // se crean nuevas al final — con la orientación de la última hoja de la obra.
      const lastOrient = edPages.length ? (edPages[edPages.length - 1].orientation || edOrientation) : edOrientation;
      const newPages = pages.slice(existingCount).map(pageLines => {
        const tlNew = _tdMakeTextLayer(pageLines, _tdNewFlowOwnerAssigned ? '' : html, flowId, lineHeightMult, undefined, []);
        _tdNewFlowOwnerAssigned = true;
        return {
          layers: [tlNew],
          drawData: null, textLayerOpacity: 1, textMode: 'sequential', orientation: lastOrient,
          _dirtyCountLocal: 1,
          _dirtyCountCloud: 1,
        };
      });
      if(newPages.length) { edPages.push(...newPages); if (typeof _edMarkPagesStructureDirty === 'function') _edMarkPagesStructureDirty(); }
      // Nombre del flujo (ver _tdComputeFlowName) en todas sus hojas, tanto
      // las ya existentes reutilizadas como las nuevas recién creadas.
      edPages.forEach(pg => (pg.layers || []).forEach(l => { if (l && l._tdFlowId === flowId) l.name = flowName; }));

      edLoadPage(startIdx);
      edPushHistory();
      edToast(
        pages.length === 1 ? I18n.t('td_textAddedCurrent') :
        !newPages.length ? I18n.t('td_textAddedExisting', { n: pages.length }) :
        (newPages.length === 1
          ? I18n.t('td_textAddedNewSingle', { n: pages.length })
          : I18n.t('td_textAddedNewPlural', { n: pages.length, m: newPages.length }))
      );
    }
  }catch(err){
    _tdLogApply('EXCEPCIÓN capturada', (err && err.message) || String(err));
    edToast(I18n.t('td_errApplyText', { msg: (err && err.message) || err }));
    return;
  }
  _tdLogApply('OK', 'texto aplicado y editor cerrado');

  // Cada aplicación consume el contenido del editor — se vacía para el siguiente texto
  if(hidden) hidden.value = '';
  const editorEl = document.getElementById('tdEditor');
  if(editorEl && editorEl.editor) editorEl.editor.loadHTML('');
  _tdEditingFlowId = null;
  _tdDirty = false; // ya aplicado — el cierre de aquí abajo no debe volver a preguntar

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
    edToast(r.count > r.oldCount ? I18n.t('td_grewNewPage') : I18n.t('td_shrunkRemovedPage'));
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
    edToast(r.count > r.oldCount ? I18n.t('td_grewNewPage') : I18n.t('td_shrunkRemovedPage'));
  }
}

function _tdReflowFlowInPlace(la, panelWasOpen, deriveBoxFromContent){
  const flowId = _tdEnsureFlowId(la); // migra capas de v32.70 sin _tdFlowId
  // `la` (la hoja concreta que disparó el redimensionado/margen/exceptuar)
  // puede no ser la que guarda el sourceHTML del flujo — ver
  // _tdFindFlowSourceHTML. Solo UNA hoja lo guarda desde la optimización que
  // evita duplicarlo en cada hoja.
  const html = la.sourceHTML || _tdFindFlowSourceHTML(flowId) || '';
  if(!html) return;
  // Solo la PRIMERA hoja reconstruida en esta pasada guarda sourceHTML
  // íntegro — ver _tdFindFlowSourceHTML. Se recalcula de cero en cada
  // llamada (no es una caché que pueda quedarse desincronizada si se
  // reordenan páginas entre una reedición y otra: cada reflujo reasigna la
  // propiedad a la hoja que le toque HOY).
  let _tdOwnerAssigned = false;
  // Los saltos fijados a mano en el editor de textos solo deben seguir
  // forzando un corte cuando ESTA llamada viene con deriveBoxFromContent
  // (Guardar cambios / Exceptuar en esta hoja — ver más abajo). Si viene de
  // redimensionar con los tiradores en el editor general, se ignoran: si no,
  // un salto colocado hace tiempo en el editor de textos se quedaba
  // "congelado" para siempre en la capa, y seguía forzando un corte incluso
  // después de agrandar la caja lo bastante como para que ya no hiciera
  // falta — bug reportado por Alberto (el texto de la hoja siguiente no se
  // reabsorbía al ampliar la caja).
  const effectiveManualBreaks = deriveBoxFromContent ? (la.manualBreakChars || []) : [];

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
      effectiveManualBreaks
    );
    const newPages0 = pages0.map(pageLines => {
      // Solo la primera hoja nueva guarda sourceHTML íntegro — ver
      // _tdFindFlowSourceHTML.
      const tl0 = _tdMakeTextLayer(pageLines, _tdOwnerAssigned ? '' : html, flowId, la.lineHeightMult, la.marginXFrac, effectiveManualBreaks);
      _tdOwnerAssigned = true;
      return {
        layers: [tl0],
        drawData: null, textLayerOpacity: 1, textMode: 'sequential', orientation: orient,
        _dirtyCountLocal: 1,
        _dirtyCountCloud: 1,
      };
    });
    edPages.splice(afterIdx, 0, ...newPages0);
    if (typeof _edMarkPagesStructureDirty === 'function') _edMarkPagesStructureDirty();
    if(typeof edFitCanvas === 'function') edFitCanvas(true);
    if(typeof edRedraw === 'function') edRedraw();
    if(typeof edPushHistory === 'function') edPushHistory(true);
    if(typeof _pgRender === 'function') _pgRender();
    return { firstIdx: afterIdx, count: newPages0.length, oldCount: 0 };
  }
  const spanIdxs = [...flowIdxs, ...exceptIdxs].sort((a, b) => a - b);
  const lastIdx = spanIdxs[spanIdxs.length - 1];
  const firstIdx = spanIdxs[0];

  // Marco para calcular la paginación — por página, dos criterios distintos
  // a propósito:
  //
  // · Si la llamada viene de redimensionar con los tiradores en el editor
  //   general (deriveBoxFromContent falsy, _tdReflowAfterResize /
  //   _tdReflowAfterMarginChange): el tamaño de caja REAL de cada hoja del
  //   flujo, tal cual esté en ese momento — si no, perdería precisamente el
  //   cambio que Alberto acaba de hacer con los tiradores, y además movería
  //   el tamaño de TODAS las demás hojas del flujo sin que él lo pidiera.
  //
  // · Si viene de "Guardar cambios" en el editor de textos O de "Exceptuar
  //   en esta hoja" (deriveBoxFromContent=true en ambos casos): por
  //   página — el alto REAL solo si esa página en concreto se redimensionó
  //   a mano alguna vez con los tiradores (marca _tdBoxManualH, puesta en
  //   el resize-end de editor.js) — ahí el tamaño es una decisión
  //   deliberada de Alberto (p.ej. dejar sitio a una imagen debajo) y debe
  //   limitar dónde cae el salto aunque se reedite el texto o se exceptúe
  //   otra hoja del mismo flujo. Para el resto (sin la marca — el alto es
  //   solo el residuo automático de haber ajustado la caja al contenido en
  //   una edición anterior), página entera: si no, una caja que se quedó
  //   pequeña de un texto más corto (o de una redistribución anterior)
  //   seguiría limitando para siempre al texto que le toque ahora — dos
  //   bugs reportados por Alberto con la misma causa: "2 saltos en vez de
  //   1" al reeditar, y "solo se vierte una parte del texto en la hoja
  //   siguiente" al exceptuar una hoja de en medio del flujo. Debe
  //   coincidir EXACTAMENTE con el mismo criterio en _tdEditingFlowFrames,
  //   para que la vista previa del editor de textos nunca se desincronice
  //   de esto.
  const frames = flowIdxs.map(i => {
    const pg = edPages[i];
    const orient = pg.orientation || edOrientation;
    const sv = orient === 'vertical';
    const pgPw = sv ? ED_PAGE_W : ED_PAGE_H, pgPh = sv ? ED_PAGE_H : ED_PAGE_W;
    const layer = pg.layers.find(l => l && l._tdFlowId === flowId);
    if(!deriveBoxFromContent || (layer && layer._tdBoxManualH)) return { pw: layer.width * pgPw, ph: layer.height * pgPh };
    return { pw: pgPw, ph: pgPh };
  });
  // Marcos de reserva para el desbordamiento: si YA existen hojas justo
  // después del tramo actual del flujo, el texto debe fluir EN ELLAS (con
  // su orientación real, sea cual sea) en vez de crear hojas nuevas de en
  // medio — pedido explícito de Alberto: "no debe pasar salvo que la hoja
  // esté específicamente excluida del flujo". Un marco por cada hoja
  // existente, en orden, con SU orientación real (página completa; no tiene
  // sentido mirar _tdBoxManualH aquí porque esa hoja aún no pertenece a este
  // flujo, no tiene su propia capa que medir). Para cualquier desbordamiento
  // que ya no quepa en hojas existentes (fin de la obra), página completa en
  // la orientación de la última hoja del tramo — mismo criterio que
  // "Aplicar al lienzo" de siempre. Debe coincidir con el mismo recorrido de
  // hojas que el paso 3 más abajo usa para reutilizarlas de verdad.
  for (let j = lastIdx + 1; j < edPages.length; j++) {
    const pg = edPages[j];
    const orient = pg.orientation || edOrientation;
    const sv = orient === 'vertical';
    frames.push({ pw: sv ? ED_PAGE_W : ED_PAGE_H, ph: sv ? ED_PAGE_H : ED_PAGE_W });
  }
  const lastOrient = edPages[lastIdx].orientation || edOrientation;
  const svLast = lastOrient === 'vertical';
  frames.push({ pw: svLast ? ED_PAGE_W : ED_PAGE_H, ph: svLast ? ED_PAGE_H : ED_PAGE_W });

  const blocks = _tdParseBlocks(html);
  // Traza de saltos de página real (window._tdBreakLog) — investigación del
  // bug "párrafo duplicado entre hojas". Se reinicia en CADA reflujo real
  // (el único sitio que de verdad decide el contenido final de cada hoja),
  // así el diagnóstico (🩺, en el editor de textos o en el general) siempre
  // refleja el ÚLTIMO "Guardar cambios"/"Exceptuar"/redimensionado, no una
  // mezcla de varios.
  window._tdBreakLog = [];
  const { pages, pageBoxHeights } = _tdLayoutPages(
    blocks, frames, la.lineHeightMult,
    { marginFracX: la.marginXFrac || TD_MARGIN_FRAC, marginFracY: TD_MARGIN_FRAC },
    effectiveManualBreaks
  );
  // Alto MÍNIMO de caja (fracción de la página) para evitar una caja
  // degenerada, casi invisible, si una página quedara con muy poco
  // contenido (p.ej. un salto justo tras una sola palabra).
  const TD_MIN_BOX_HEIGHT_FRAC = 0.08;
  const boxHeightFracFor = (i, pgPh) => Math.min(1, Math.max(TD_MIN_BOX_HEIGHT_FRAC, (pageBoxHeights[i] || 0) / pgPh));

  const oldCount = flowIdxs.length;
  const reused = Math.min(pages.length, flowIdxs.length);
  const currentPageObj = edPages[edCurrentPage]; // referencia — para recolocar tras las mutaciones
  const wasCurrentInFlow = flowIdxs.includes(edCurrentPage) || exceptIdxs.includes(edCurrentPage);

  // 1) Slots reutilizados: mutar la MISMA capa in situ — conserva
  //    color/fondo/marco sin copiar nada y sin mover ninguna página (los
  //    huecos de en medio quedan exactamente donde estaban). El TAMAÑO/
  //    POSICIÓN de la caja solo se toca si deriveBoxFromContent (Guardar
  //    cambios en el editor de textos, o Exceptuar en esta hoja) Y la
  //    página NO tiene la marca _tdBoxManualH: ancho completo (coherente
  //    con que la vista previa ya usa ese ancho — ver
  //    _tdRecomputeViewPagination) y alto según cuánto ocupe de verdad el
  //    contenido de esa página (pageBoxHeights) — pedido explícito de
  //    Alberto para ESE caso: es el salto de página el que decide el
  //    tamaño de la caja, no al revés. Se conserva el borde SUPERIOR que
  //    ya tuviera la caja (por si no empezaba en el borde de la página) —
  //    solo se mueve el borde inferior. Si la página SÍ tiene
  //    _tdBoxManualH, o si esto viene de redimensionar con los tiradores
  //    en el editor general, tamaño/posición se dejan tal cual estuvieran
  //    — comportamiento de siempre, para no deshacer precisamente el
  //    cambio que Alberto acaba de hacer a mano ahí.
  for(let i = 0; i < reused; i++){
    const layer = edPages[flowIdxs[i]].layers.find(l => l && l._tdFlowId === flowId);
    if(deriveBoxFromContent && !layer._tdBoxManualH){
      const orient = edPages[flowIdxs[i]].orientation || edOrientation;
      const sv = orient === 'vertical';
      const pgPh = sv ? ED_PAGE_H : ED_PAGE_W;
      const oldTopEdge = layer.y - layer.height / 2;
      const newHeightFrac = boxHeightFracFor(i, pgPh);
      layer.width = 1;
      layer.height = newHeightFrac;
      layer.x = 0.5;
      layer.y = oldTopEdge + newHeightFrac / 2;
    }
    layer.richLines = pages[i];
    // Solo la primera hoja del flujo (en esta reconstrucción) guarda
    // sourceHTML íntegro — ahorra guardarlo/subirlo/descargarlo N veces (ver
    // _tdFindFlowSourceHTML). Se borra explícitamente en las demás por si
    // esta capa concreta lo llevaba de una reconstrucción anterior en la que
    // sí le tocó ser la primera (p.ej. si se han reordenado páginas).
    if(!_tdOwnerAssigned){ layer.sourceHTML = html; _tdOwnerAssigned = true; }
    else { delete layer.sourceHTML; }
    layer.lineHeightMult = la.lineHeightMult;
    layer.marginXFrac = la.marginXFrac;
    layer.manualBreakChars = effectiveManualBreaks;
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
      if (typeof _edMarkPagesStructureDirty === 'function') _edMarkPagesStructureDirty();
    }
  }

  // 3) Si hacen falta más páginas: reutilizar primero las hojas que YA
  //    existan justo después del tramo (con su orientación real, sea cual
  //    sea, y conservando lo demás que ya tuvieran — mismo criterio que los
  //    "extras" del paso 2). Solo si se agotan las hojas existentes de la
  //    obra se crean hojas nuevas, al final — pedido explícito de Alberto:
  //    no debe crearse una hoja intermedia mientras ya exista una hoja ahí
  //    para recibir el desbordamiento. El recorrido de hojas coincide con
  //    los marcos de reserva para el desbordamiento de más arriba.
  if(pages.length > reused){
    let insertAt = -1;
    edPages.forEach((p, i) => {
      if((p.layers || []).some(l => l && (l._tdFlowId === flowId || l._tdExceptFlow === flowId))) insertAt = i;
    });
    insertAt = insertAt + 1;
    const overflow = pages.slice(reused);
    let cursor = insertAt, oi = 0;
    // Fase A: reutilizar hojas ya existentes, con SU orientación real
    while(oi < overflow.length && cursor < edPages.length){
      const pg = edPages[cursor];
      const orient = pg.orientation || edOrientation;
      const sv = orient === 'vertical';
      const pgPh = sv ? ED_PAGE_H : ED_PAGE_W;
      // Solo la primera hoja de todo el reflujo guarda sourceHTML íntegro —
      // ver _tdFindFlowSourceHTML. Si ya se asignó en el paso 1 (slots
      // reutilizados), aquí siempre toca cadena vacía.
      const tl = _tdMakeTextLayer(overflow[oi], _tdOwnerAssigned ? '' : html, flowId, la.lineHeightMult, la.marginXFrac, effectiveManualBreaks);
      _tdOwnerAssigned = true;
      if(deriveBoxFromContent){
        const newHeightFrac = boxHeightFracFor(reused + oi, pgPh);
        tl.height = newHeightFrac;
        tl.y = newHeightFrac / 2;
      }
      pg.layers = pg.layers || [];
      pg.layers.push(tl);
      pg._dirtyCountLocal = (pg._dirtyCountLocal || 0) + 1;
      pg._dirtyCountCloud = (pg._dirtyCountCloud || 0) + 1;
      cursor++; oi++;
    }
    // Fase B: si aún sobra texto tras agotar las hojas existentes de la
    // obra, crear hojas nuevas al final — mismo criterio de siempre.
    if(oi < overflow.length){
      const pgPhNew = svLast ? ED_PAGE_H : ED_PAGE_W;
      const extraPages = overflow.slice(oi).map((pageLines, j) => {
        // Solo la primera hoja de todo el reflujo guarda sourceHTML íntegro
        // — ver _tdFindFlowSourceHTML.
        const tl = _tdMakeTextLayer(pageLines, _tdOwnerAssigned ? '' : html, flowId, la.lineHeightMult, la.marginXFrac, effectiveManualBreaks);
        _tdOwnerAssigned = true;
        // Página nueva, sin posición previa que conservar. Con
        // deriveBoxFromContent (Guardar cambios o Exceptuar en esta hoja), se
        // ancla al borde superior con el alto justo para su contenido; si no
        // (desbordamiento normal al redimensionar con los tiradores en el
        // editor general), se deja la página completa por defecto — mismo
        // criterio que "Aplicar al lienzo" de siempre.
        if(deriveBoxFromContent){
          const newHeightFrac = boxHeightFracFor(reused + oi + j, pgPhNew);
          tl.height = newHeightFrac;
          tl.y = newHeightFrac / 2;
        }
        return {
          layers: [tl],
          drawData: null, textLayerOpacity: 1, textMode: 'sequential', orientation: lastOrient,
          _dirtyCountLocal: 1,
          _dirtyCountCloud: 1,
        };
      });
      edPages.splice(cursor, 0, ...extraPages);
    }
    if (typeof _edMarkPagesStructureDirty === 'function') _edMarkPagesStructureDirty();
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
