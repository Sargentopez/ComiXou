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
const TD_MARGIN_FRAC   = 0.09;   // margen de página, fracción independiente por eje
const TD_BODY_SIZE     = 22;     // cuerpo de texto
const TD_H1_SIZE        = 34;     // título (heading1)
const TD_LINE_MULT     = 1.42;   // interlineado
const TD_PARA_GAP_MULT = 0.55;   // espacio extra tras cada bloque (× fontSize del bloque)
const TD_LIST_INDENT   = 30;     // sangría de listas
const TD_QUOTE_INDENT  = 24;     // sangría de citas (por nivel de anidamiento)
const TD_FONT_FAMILY   = 'Lora'; // serif autoalojada — pensada para lectura en página completa

// ── Apertura / cierre del shell ──────────────────────────────────
let _tdRestored = false;
function edOpenTextDoc(){
  if(typeof edCloseMenus === 'function') edCloseMenus();
  const shell = document.getElementById('tdShell');
  if(!shell) return;
  _tdInitOnce();
  shell.style.display = 'flex';
  requestAnimationFrame(_tdUpdateTitlePill);
  const _tdPageEl = document.getElementById('tdPage');
  if(_tdPageEl) _tdPageEl.classList.toggle('horizontal', (typeof edOrientation !== 'undefined') && edOrientation === 'horizontal');
  const editorEl = document.getElementById('tdEditor');
  if(editorEl && editorEl.editor && !_tdRestored){
    _tdRestored = true;
    const saved = _tdLoadDraft();
    if(saved) editorEl.editor.loadHTML(saved);
  }
}
function edCloseTextDoc(){
  const shell = document.getElementById('tdShell');
  if(shell) shell.style.display = 'none';
}

// ── Inicialización (una sola vez): botones, bloqueo de adjuntos, borrador ──
let _tdSaveTimer = null;
function _tdInitOnce(){
  const shell = document.getElementById('tdShell');
  if(!shell || shell._tdBound) return;
  shell._tdBound = true;

  document.getElementById('tdCloseBtn')?.addEventListener('click', edCloseTextDoc);
  document.getElementById('tdApplyBtn')?.addEventListener('click', _tdApplyToCanvas);

  // Esta hoja es solo texto — las imágenes ya tienen su propio flujo en el editor,
  // así que no se permiten adjuntos arrastrados/pegados dentro de Trix.
  document.addEventListener('trix-file-accept', e => e.preventDefault());

  const hidden = document.getElementById('tdHiddenInput');
  const editorEl = document.getElementById('tdEditor');
  if(editorEl){
    editorEl.addEventListener('trix-change', () => {
      clearTimeout(_tdSaveTimer);
      _tdSaveTimer = setTimeout(() => _tdSaveDraft(hidden ? hidden.value : ''), 400);
    });
  }
}

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
}
window.addEventListener('resize', () => {
  cancelAnimationFrame(window._tdTitlePillRaf);
  window._tdTitlePillRaf = requestAnimationFrame(_tdUpdateTitlePill);
});

// ── Borrador (localStorage, namespaced por usuario+proyecto — mismo criterio
//    que _edAutosaveKey en editor.js) ──
function _tdDraftKey(){
  try{
    const _s = JSON.parse(localStorage.getItem('cs_session') || 'null');
    const _uid = (_s && _s.id) ? String(_s.id).replace(/[^a-zA-Z0-9_-]/g, '_') : '_anon_';
    return _uid + '__td_draft__' + (typeof edProjectId !== 'undefined' && edProjectId ? edProjectId : 'tmp');
  }catch(_e){ return 'td_draft__' + (typeof edProjectId !== 'undefined' && edProjectId ? edProjectId : 'tmp'); }
}
function _tdSaveDraft(html){
  try{ localStorage.setItem(_tdDraftKey(), html || ''); }catch(_e){}
}
function _tdLoadDraft(){
  try{ return localStorage.getItem(_tdDraftKey()) || ''; }catch(_e){ return ''; }
}
function _tdClearDraft(){
  try{ localStorage.removeItem(_tdDraftKey()); }catch(_e){}
}

// ── Parser: HTML de Trix → bloques {kind, indent, runs[], index?} ──────────
// kind: 'paragraph' | 'heading' | 'quote' | 'bullet' | 'number' | 'code'
// runs: [{text, bold, italic, strike, mono}] o {break:true} para <br>
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
        if(tag === 'br'){
          runs.push({break:true});
        } else if(tag === 'strong' || tag === 'b'){
          runs = runs.concat(runsFromInline(child, {...state, bold:true}));
        } else if(tag === 'em' || tag === 'i'){
          runs = runs.concat(runsFromInline(child, {...state, italic:true}));
        } else if(tag === 'del' || tag === 's' || tag === 'strike'){
          runs = runs.concat(runsFromInline(child, {...state, strike:true}));
        } else if(tag === 'code'){
          runs = runs.concat(runsFromInline(child, {...state, mono:true}));
        } else {
          runs = runs.concat(runsFromInline(child, state));
        }
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
      } else {
        blocks.push({kind: ctxKind === 'quote' ? 'quote' : 'paragraph', indent:indentLevel, runs: runsFromInline(el, {})});
      }
    });
  }

  walkBlockLevel(doc.body, 'paragraph', 0);
  return blocks;
}

// ── Maquetación + paginación ────────────────────────────────────────────
// Devuelve {pages}: array de páginas; cada página = array de líneas
// {y, indent, kind, fontSize, marker, runs:[{text,x,width,bold,italic,strike,mono}]}
// Coordenadas (y, x) son ABSOLUTAS dentro de la página lógica (0,0 = esquina
// superior izquierda), ya con el margen incluido — TextLayer._drawRichLines()
// las usa tal cual, sin más cálculo.
const _tdMeasureCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
const _tdMeasureCtx = _tdMeasureCanvas ? _tdMeasureCanvas.getContext('2d') : null;

function _tdFontStr(fontSize, bold, italic, mono){
  const fam = mono ? 'monospace' : `'${TD_FONT_FAMILY}'`;
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${fam}`;
}

function _tdLayoutPages(blocks, pw, ph){
  const mx = pw * TD_MARGIN_FRAC;
  const my = ph * TD_MARGIN_FRAC;
  const textW = pw - mx * 2;
  const textH = ph - my * 2;
  const ctx = _tdMeasureCtx;

  const pages = [];
  let curLines = [];
  let curY = 0; // relativo al margen superior (0..textH)

  function pushLine(entry){
    if(curY + entry.height > textH && curLines.length > 0){
      pages.push(curLines);
      curLines = [];
      curY = 0;
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

  blocks.forEach(block => {
    const isHeading = block.kind === 'heading';
    const fontSize = isHeading ? TD_H1_SIZE : TD_BODY_SIZE;
    const lineH = fontSize * TD_LINE_MULT;

    let indentPx = 0;
    let marker = null;
    if(block.kind === 'bullet'){ indentPx = TD_LIST_INDENT; marker = '•'; }
    else if(block.kind === 'number'){ indentPx = TD_LIST_INDENT; marker = block.index + '.'; }
    else if(block.kind === 'quote'){ indentPx = TD_QUOTE_INDENT; }
    indentPx += (block.indent || 0) * TD_QUOTE_INDENT;

    const avail = Math.max(20, textW - indentPx);

    // Tokenizar runs en "palabras" preservando estilo y saltos de línea manuales (<br>)
    let words = [];
    (block.runs || []).forEach(run => {
      if(run.break){ words.push({break:true}); return; }
      const parts = (run.text || '').split(/(\s+)/).filter(s => s.length);
      parts.forEach(p => words.push({
        text:p, bold:!!run.bold, italic:!!run.italic, strike:!!run.strike, mono:!!run.mono,
        isSpace: /^\s+$/.test(p)
      }));
    });

    if(words.length === 0){
      pushLine({height:lineH, indent:indentPx, kind:block.kind, fontSize, marker:null, runs:[]});
      curY += fontSize * TD_PARA_GAP_MULT;
      return;
    }

    let lineRuns = [];
    let lineWidth = 0;
    let firstLineOfBlock = true;

    function flushLine(){
      while(lineRuns.length && lineRuns[lineRuns.length - 1].isSpace) lineRuns.pop();
      pushLine({
        height: lineH, indent: indentPx, kind: block.kind, fontSize,
        marker: firstLineOfBlock ? marker : null, runs: lineRuns
      });
      firstLineOfBlock = false;
      lineRuns = [];
      lineWidth = 0;
    }

    words.forEach(w => {
      if(w.break){ flushLine(); return; }
      if(w.isSpace && lineRuns.length === 0) return; // no empezar línea con espacio
      ctx.font = _tdFontStr(fontSize, w.bold, w.italic, w.mono);
      const width = ctx.measureText(w.text).width;
      if(lineWidth + width > avail && lineRuns.length > 0 && !w.isSpace){
        flushLine();
      }
      lineRuns.push({text:w.text, bold:w.bold, italic:w.italic, strike:w.strike, mono:w.mono, isSpace:w.isSpace, width, x:0});
      lineWidth += width;
    });
    if(lineRuns.length) flushLine();

    curY += fontSize * TD_PARA_GAP_MULT;
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

  return {pages, mx, my};
}

// ── Aplicar al lienzo: crea N hojas nuevas al final de la obra ─────────
function _tdApplyToCanvas(){
  const hidden = document.getElementById('tdHiddenInput');
  const html = (hidden ? hidden.value : '') || '';
  const blocks = _tdParseBlocks(html);
  const hasContent = blocks.some(b => (b.runs || []).some(r => r.text && r.text.trim()));
  if(!hasContent){ edToast('Escribe algo de texto antes de aplicar'); return; }

  const pw = edPageW(), ph = edPageH();
  const {pages} = _tdLayoutPages(blocks, pw, ph);

  // Resumen en texto plano por página (fallback/legacy — _hasText, panel_texts, etc.
  // Ver NORMAS/CARTA: el reader dibuja bocadillos/textos desde panel_texts, que no
  // tiene richLines, así que _bubbleLayer sigue siendo la fuente real en lectura).
  function plainSummary(pageLines){
    const words = [];
    pageLines.forEach(l => (l.runs || []).forEach(r => { if(r.text) words.push(r.text); }));
    const joined = words.join('').trim().replace(/\s+/g, ' ');
    return joined.slice(0, 60) || 'Texto';
  }

  pages.forEach(pageLines => {
    const tl = new TextLayer(plainSummary(pageLines), 0.5, 0.5);
    tl.x = 0.5; tl.y = 0.5; tl.width = 1; tl.height = 1;
    tl.color = '#1A1A1A';
    tl.backgroundColor = '#FFF9F0'; // --paper
    tl.bgOpacity = 1;
    tl.borderWidth = 0;
    tl.richFontFamily = TD_FONT_FAMILY;
    tl.richLines = pageLines;
    tl.sourceHTML = html;
    edPages.push({layers:[tl], drawData:null, textLayerOpacity:1, textMode:'sequential', orientation: edOrientation});
  });

  edLoadPage(edPages.length - 1);
  edPushHistory();
  edToast(pages.length === 1 ? 'Añadida 1 hoja de texto al final de la obra' : `Añadidas ${pages.length} hojas de texto al final de la obra`);

  // Cada "Aplicar" añade contenido nuevo — se vacía el editor para el siguiente texto
  if(hidden) hidden.value = '';
  const editorEl = document.getElementById('tdEditor');
  if(editorEl && editorEl.editor) editorEl.editor.loadHTML('');
  _tdClearDraft();

  edCloseTextDoc();
}
