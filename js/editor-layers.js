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
   editor-layers.js — Panel de capas v4
   ============================================================ */

let _lyDragIdx  = null;
let _lyDragOver = null;
let _lyDragType = null; // 'text' | 'image'
let _lyUidCounter = 0;  // IDs únicos estables para animación FLIP
// UIDs de grupos de dibujo con sub-capas colapsadas (por defecto todos colapsados)
const _lyExpandedGroups = new Set(); // UIDs explícitamente expandidos; vacío = todos colapsados

/* ── Doble tap en miniatura ──
   lastTapTime/lastTapEl se comparten por closure en cada listener.
   Se detecta como dos pointerup sobre el mismo elemento en < 350 ms. */
function _lyBindThumbDoubleTap(thumb, realIdxGetter) {
  let _lastTime = 0;
  thumb.addEventListener('pointerup', e => {
    const now = Date.now();
    const isDbl = now - _lastTime < 350;
    _lastTime = now;
    if (!isDbl) return;
    // Evitar que el simple-tap handler cierre el overlay también
    e.stopImmediatePropagation();
    const idx = typeof realIdxGetter === 'function' ? realIdxGetter() : realIdxGetter;
    edSelectedIdx = idx;
    edRedraw();
    // Cerrar panel de capas (con animación) y, al terminar, abrir panel del objeto
    const ov = document.getElementById('edLayersOverlay');
    if (ov) {
      ov.classList.remove('open');
      setTimeout(() => {
        ov.remove();
        _lySetCanvasTouch(true);
        if (typeof edRedraw === 'function') edRedraw();
        if (typeof _edHandleDoubleTap === 'function') _edHandleDoubleTap(idx);
      }, 250);
    } else {
      if (typeof _edHandleDoubleTap === 'function') _edHandleDoubleTap(idx);
    }
  });
}

/* ── Escapar HTML (para nombres de capa insertados vía innerHTML) ── */
function _lyEscHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ── Doble tap en el NOMBRE de una capa → renombrar in-line ──
   Mismo patrón de detección que _lyBindThumbDoubleTap (dos pointerup < 350ms).
   NO se usa en las sub-filas de dibujo a mano (relleno/lápiz/acuarela): esas
   filas se construyen con _lyBuildGroupSubRow, que tiene una etiqueta fija y
   nunca llama a esta función — por diseño no son renombrables. */
function _lyBindNameEdit(nameEl, la) {
  let _lastTime = 0;
  nameEl.classList.add('ed-layer-name-editable');
  nameEl.title = 'Toca dos veces para renombrar';
  nameEl.addEventListener('pointerup', e => {
    const now = Date.now();
    const isDbl = now - _lastTime < 350;
    _lastTime = now;
    if (!isDbl) return;
    e.stopPropagation();
    e.stopImmediatePropagation();
    _lyStartNameEdit(nameEl, la);
  });
}

/* Sustituye el <span> de nombre por un <input> editable.
   Guarda en la.name al confirmar (Enter/blur) o cancela con Escape.
   la.name vacío/borrado → se elimina la propiedad y el panel vuelve a
   mostrar la etiqueta automática (tipo/número) de siempre. */
function _lyStartNameEdit(nameEl, la) {
  if (!nameEl.isConnected || nameEl.dataset.editing === '1') return;
  nameEl.dataset.editing = '1';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ed-layer-name-input';
  input.maxLength = 40;
  input.value = la.name || '';
  input.placeholder = nameEl.textContent.trim();
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let _done = false;
  const _commit = () => {
    if (_done) return; _done = true;
    const v = input.value.trim();
    if (v) la.name = v; else delete la.name;
    if (typeof edPushHistory === 'function') edPushHistory();
    _lyRender();
  };
  const _cancel = () => {
    if (_done) return; _done = true;
    _lyRender();
  };
  input.addEventListener('blur', _commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); _cancel(); }
  });
  input.addEventListener('pointerdown', e => e.stopPropagation());
  input.addEventListener('pointerup', e => e.stopPropagation());
  input.addEventListener('click', e => e.stopPropagation());
}

/* ──────────────────────────────────────────
   ABRIR / CERRAR
────────────────────────────────────────── */
/* Abre el panel de propiedades del objeto idx tras cerrar el overlay de capas */
function _lyOpenLayerPanel(idx) {
  const la = typeof edLayers !== 'undefined' ? edLayers[idx] : null;
  if (!la) return;
  edSelectedIdx = idx;
  edRedraw();
  if (la.type === 'draw' || la.type === 'stroke' || la.type === 'shape' || la.type === 'line') {
    // Para tipos editables: usar _edHandleDoubleTap para abrir el panel correcto
    if (typeof _edHandleDoubleTap === 'function') _edHandleDoubleTap(idx);
  } else {
    // image, text, bubble → panel de propiedades estándar
    if (typeof _edDrawLockUI === 'function') _edDrawLockUI();
    if (typeof _edPropsOverlayShow === 'function') _edPropsOverlayShow();
    if (typeof edRenderOptionsPanel === 'function') edRenderOptionsPanel('props');
  }
}

function edOpenLayers() {
  if (document.getElementById('edLayersOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'edLayersOverlay';
  overlay.className = 'ed-fulloverlay';
  overlay.innerHTML = `
    <div class="ed-fulloverlay-box">
      <div class="ed-fulloverlay-header">
        <h2 class="ed-fulloverlay-title">Capas</h2>
        <button class="ed-fulloverlay-close" id="edLayersClose">✕</button>
      </div>
      <div class="ed-layers-list" id="edLayersList"></div>
    </div>`;

  document.body.appendChild(overlay);
  _lyRender();
  overlay.querySelector('#edLayersClose').addEventListener('click', edCloseLayers);
  // Cerrar también al tocar el fondo oscuro (fuera del box)
  overlay.addEventListener('pointerdown', e => {
    if (e.target === overlay) edCloseLayers();
  });
  requestAnimationFrame(() => overlay.classList.add('open'));

  // Desactivar touch del canvas mientras el overlay está abierto
  _lySetCanvasTouch(false);
}

function edCloseLayers() {
  const ov = document.getElementById('edLayersOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  setTimeout(() => {
    ov.remove();
    _lySetCanvasTouch(true);
    // Refrescar la hoja vigente al cerrar el panel de capas
    if (typeof edRedraw === 'function') edRedraw();
    if (typeof edRenderOptionsPanel === 'function') edRenderOptionsPanel();
  }, 250);
}

// Activa/desactiva los listeners de touch del canvas
function _lySetCanvasTouch(enabled) {
  const shell = document.getElementById('editorShell');
  if (!shell) return;
  if (enabled) {
    shell.style.touchAction = '';          // restaurar
    shell.removeEventListener('touchstart', _lyBlockTouch, {passive:false});
    shell.removeEventListener('touchmove',  _lyBlockTouch, {passive:false});
  } else {
    shell.style.touchAction = 'none';      // bloquear scroll del compositor
    shell.addEventListener('touchstart', _lyBlockTouch, {passive:false});
    shell.addEventListener('touchmove',  _lyBlockTouch, {passive:false});
  }
}
function _lyBlockTouch(e) {
  // Permitir scroll dentro del overlay y toques en el modal de confirmación
  if (!e.target.closest('#edLayersOverlay') &&
      !e.target.closest('#edPagesOverlay') &&
      !e.target.closest('#edConfirmModal')) {
    e.preventDefault();
  }
}

/* ──────────────────────────────────────────
   RENDER PRINCIPAL
────────────────────────────────────────── */
function _lyRender() {
  const list = document.getElementById('edLayersList');
  if (!list) return;
  list.innerHTML = '';

  // Garantizar que cada DrawLayer tiene su FillLayer vinculado
  const _lrPage = edPages?.[edCurrentPage];
  if (_lrPage?.layers) {
    _lrPage.layers.filter(l=>l.type==='draw'||l.type==='stroke').forEach(dl => {
      if (dl._fillLayerId) return; // ya vinculado
      // Buscar FillLayer huérfano o crear uno nuevo
      let fl = _lrPage.layers.find(l => l.type==='fill' && !l._drawLayerId);
      if (!fl) {
        fl = new FillLayer();
        const dlIdx = _lrPage.layers.indexOf(dl);
        _lrPage.layers.splice(dlIdx, 0, fl);
        if (typeof edLayers !== 'undefined') edLayers = _lrPage.layers;
      }
      const uid = 'dl_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
      dl._uid = dl._uid || uid;
      dl._fillLayerId = dl._uid;
      fl._drawLayerId = dl._uid;
      fl._uid = 'fl_' + dl._uid;
    });
    // Reasignar edLayers para asegurar que refleja los cambios del splice
    if (typeof edLayers !== 'undefined') edLayers = _lrPage.layers;
  }

  const page     = edPages[edCurrentPage];
  if(!page.textMode) page.textMode = 'immediate'; // fallback para proyectos antiguos
  const isSeq    = page.textMode === 'sequential';
  const imgPairs = edLayers.map((l,i) => ({l,i})).filter(({l}) => l.type==='image'); // mantenido por compatibilidad
  const textObjs = edLayers.filter(l => (l.type==='text' || l.type==='bubble') && !l._tdExceptFlow);

  /* ══ SECCIÓN TEXTOS ══ */

  /* Título */
  const tTitle = document.createElement('div');
  tTitle.className = 'ed-ly-section-title';
  tTitle.textContent = 'Textos';
  list.appendChild(tTitle);

  /* Botones inmediatos / secuenciales — estilo barra de herramientas */
  const modeRow = document.createElement('div');
  modeRow.className = 'ed-ly-mode-row';

  const btnImm = document.createElement('button');
  btnImm.className = 'ed-menu-btn' + (!isSeq ? ' open' : '');
  btnImm.textContent = 'Inmediatos';
  btnImm.addEventListener('pointerup', () => {
    page.textMode = 'immediate';
    _lyRender();
  });

  const modeSep = document.createElement('div');
  modeSep.className = 'ed-menu-sep';

  const btnSeq = document.createElement('button');
  btnSeq.className = 'ed-menu-btn' + (isSeq ? ' open' : '');
  btnSeq.textContent = 'Secuenciales';
  btnSeq.addEventListener('pointerup', () => {
    page.textMode = 'sequential';
    _lyRender();
  });

  modeRow.appendChild(btnImm);
  modeRow.appendChild(modeSep);
  modeRow.appendChild(btnSeq);
  list.appendChild(modeRow);

  /* Hint de arrastre — gris/azul según modo */
  const dragHint = document.createElement('div');
  dragHint.className = 'ed-ly-drag-hint' + (isSeq ? ' active' : '');
  dragHint.textContent = 'Arrastra para establecer orden de aparición';
  list.appendChild(dragHint);

  /* Lista textos */
  if (textObjs.length === 0) {
    const e = document.createElement('p');
    e.className = 'ed-layer-sub-empty';
    e.textContent = 'Sin textos ni bocadillos';
    list.appendChild(e);
  } else {
    textObjs.forEach((la, vi) => {
      const realIdx = edLayers.indexOf(la);
      list.appendChild(_lyBuildTextRow(la, realIdx, vi, realIdx === edSelectedIdx, isSeq));
    });
  }

  /* ══ SEPARADOR ══ */
  const sep2 = document.createElement('div');
  sep2.className = 'ed-layer-sep';
  list.appendChild(sep2);

  /* ══ SECCIÓN IMÁGENES Y DIBUJOS (combinada) ══ */
  const iTitle = document.createElement('div');
  iTitle.className = 'ed-ly-section-title';
  iTitle.textContent = 'Imágenes y dibujos';
  list.appendChild(iTitle);

  const imgHint = document.createElement('div');
  imgHint.className = 'ed-ly-drag-hint active';
  imgHint.textContent = 'Arrastra para ordenar visualización';
  list.appendChild(imgHint);

  // Combinar imágenes y dibujos (stroke/draw) en una sola lista
  const visualPairs = edLayers
    .map((l,i)=>({l,i}))
    .filter(({l})=>l.type==='image'||l.type==='gif'||l.type==='stroke'||l.type==='draw'||l.type==='shape'||l.type==='line'||l.type==='fill');
  // pencil y watercolor se muestran como sub-filas, no como items principales

  if (visualPairs.length === 0) {
    const e = document.createElement('p');
    e.className = 'ed-layer-sub-empty';
    e.textContent = 'Sin imágenes ni dibujos';
    list.appendChild(e);
  } else {
    // El primero del array edLayers aparece el último en la lista (más abajo visualmente)
    const _seenGroupIds = new Set(); // grupos ya mostrados como ítem único
    [...visualPairs].reverse().forEach(({l, i}) => {
      if (l.type === 'fill' || l.type === 'pencil' || l.type === 'watercolor') return; // sub-filas
      // ── GRUPOS: mostrar como un solo ítem colapsado ──
      if (l.groupId) {
        if (_seenGroupIds.has(l.groupId)) return; // ya se mostró este grupo
        _seenGroupIds.add(l.groupId);
        const _gMembers = edLayers.map((ml, mi) => ({l: ml, i: mi}))
          .filter(x => x.l.groupId === l.groupId &&
                       x.l.type !== 'fill' && x.l.type !== 'pencil' && x.l.type !== 'watercolor');
        list.appendChild(_lyBuildGroupItem(l.groupId, _gMembers));
        return;
      }
      const item = _lyBuildVisualItem(l, i, i === edSelectedIdx);
      list.appendChild(item);
      // Sub-filas para capas vinculadas: fill, watercolor, pencil
      if ((l.type === 'draw' || l.type === 'stroke')) {
        const _lyUid = l._uid || l._fillLayerId;
        if (_lyUid) {
          // Solo mostrar sub-filas si está en _lyExpandedGroups (colapsado por defecto)
          if (_lyExpandedGroups.has(_lyUid)) {
            const _lyFlPair = edLayers.find(la => la.type==='fill'       && la._drawLayerId===_lyUid);
            const _lyPencil = edLayers.find(la => la.type==='pencil'     && la._drawLayerId===_lyUid);
            const _lyWc     = edLayers.find(la => la.type==='watercolor' && la._drawLayerId===_lyUid);
            // Sub-fila de la capa de tinta (solo su propio canvas, no el compuesto)
            list.appendChild(_lyBuildGroupSubRow(l, i, l.type==='stroke' ? `<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNCIgaGVpZ2h0PSIzNyIgdmlld0JveD0iMCAwIDY0IDcwIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNy4xNDMgNTQuNjY2KSI+PHBhdGggZD0iTSA1LjcyNiA1LjEyNCBMIDcuMTMzIDAuMDc5IEwgNi43MzEgLTUuMzg2IEwgMS41MDcgLTYuNTQyIEwgLTUuMTI0IC0yLjQ5NiBMIC03LjEzMyAwLjg2NyBMIC03LjEzMyA2LjU0MiBMIDUuNzI2IDUuMTI0IFoiIGZpbGw9IiNhYTZlNmUiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI1Ljg1MyA1NS4zNTIpIj48cGF0aCBkPSJNIC0yLjAzOSA1LjI5NSBMIC0xLjc2OCAtMC42NTUgTCAtNC43NDcgNy4yNzkgTCAtNi4xMDIgMy4zMTIgTCAtNS40MzUgLTEuMjQ0IEwgLTIuMTkwIC00LjQ1MCBMIDMuMjE3IC03LjI3OSBMIDYuMTAyIC02LjMzNiBMIDIuNDk2IC0wLjQ5MCBMIDEuMDU0IDYuMTEwIEwgLTIuMDM5IDUuMjk1IFoiIGZpbGw9IiNmOWNkY2QiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI2LjIwMSA2Mi44ODQpIj48cGF0aCBkPSJNIC02LjUzMCAtNC4wOTkgTCAtNS4yNzQgLTQuMzg4IFEgLTQuMDE4IC00LjY3NyAtMi43NzkgLTQuMzIzIEwgLTAuMDA2IC0zLjUzMiBRIDIuNjEyIC0yLjc4NSA1LjEyNCAtMy44MzYgTCA3LjYzNSAtNC44ODcgTCA2LjA3NyAtMS4xNjYgTCAtMC40MDIgMy4xMDAgTCAtNy45MzcgNC44MzUgTCAtNi4zMjkgMi4zMTIgTCAtNi4zMjkgLTAuODQxIEwgLTYuNTMwIC00LjA5OSBaIiBmaWxsPSIjMzIxYTFhIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0NS41NjAgMjQuNTg2KSI+PHBhdGggZD0iTSAtMTUuMjY3IDIwLjEzMSBMIC0xMC4xNzggMjEuMTMwIEwgLTIuODYzIDEwLjY0OCBMIDMuMTgxIDEuODMwIEwgMTAuNDk2IC04LjY1MiBMIDE0LjYzMSAtMTUuMTQwIEwgMTUuMjY3IC0xOS4xMzMgTCAxNC4zMTMgLTIxLjEzMCBMIDEwLjE3OCAtMTkuOTY1IEwgMy44MTcgLTE1LjMwNyBMIC0xLjI3MiAtNy4xNTQgTCAtNi45OTcgMy4zMjcgTCAtMTEuMTMyIDEyLjMxMiBMIC0xNS4yNjcgMjAuMTMxIFoiIGZpbGw9IiNmMmRlYmEiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQ0Ljc1NSAyNC4yMzkpIj48cGF0aCBkPSJNIC0xNC40MjEgMTkuOTg5IEwgLTEwLjgxNiAyMC43NDQgTCAtMC4wMDAgLTMuNTgzIEwgNS43NjggLTExLjUwMyBMIDE0LjA2MCAtMjAuNzQ0IEwgMS44MDMgLTExLjMxNSBMIC0zLjI0NSAtMS42OTcgTCAtOC4yOTIgOS40MjkgTCAtMTQuNDIxIDE5Ljk4OSBaIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0OC4wMDkgMjQuNTk4KSI+PHBhdGggZD0iTSAtMTEuNzEwIDIxLjMxMiBMIC01LjkwMCAxMC43MTQgTCAwLjY1NSAyLjc2NiBMIDYuOTEyIC02LjI3NCBMIDEzLjc5NSAtMTYuNDM3IEwgMTIuNjAxIC0yMS4zMTIgTCAxMC40NTAgLTE2Ljc0OSBRIDguMjk5IC0xMi4xODcgNS40MTIgLTguMDUxIEwgNS4xNDggLTcuNjcyIFEgMS45OTYgLTMuMTU3IC0xLjI5NSAxLjI1OCBMIC0yLjE0NSAyLjM5OSBRIC00Ljg1NyA2LjAzOSAtNy41MzkgOS43MDEgTCAtNy44OTUgMTAuMTg4IFEgLTEwLjIyMCAxMy4zNjQgLTEyLjAwOCAxNi44NzAgTCAtMTMuNzk1IDIwLjM3NyBMIC0xMS43MTAgMjEuMzEyIFoiIGZpbGw9IiM5Zjg0ODQiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDMyLjU0NiA0Ni45MjkpIj48cGF0aCBkPSJNIC0xLjgxMiAtMi4zOTcgTCAzLjczMCAtMS4wNTkgTCAxLjQyOCAyLjcwMCBMIC0zLjg0NCAxLjY2NiBMIC0xLjgxMiAtMi4zOTcgWiIgZmlsbD0iI2ZmZTEzNSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzOS42MDcgMzQuOTQ5KSI+PHBhdGggZD0iTSAtMjAuMjE0IDMwLjk1MiBMIC0xOS44MTIgMjkuOTU0IFEgLTE5LjQxMCAyOC45NTUgLTE5LjUzNCAyNy44ODYgTCAtMTkuNjExIDI3LjIyMSBRIC0xOS44MTIgMjUuNDg3IC0xOS42NzcgMjMuNzQ2IEwgLTE5LjU4NyAyMi42MDQgUSAtMTkuNDEwIDIwLjMzNyAtMTguMDA0IDE4LjU1MCBMIC0xOC4wMDQgMTguNTUwIFEgLTE2LjU5OCAxNi43NjQgLTE0LjY0MyAxNS42MDEgTCAtMTAuNTI2IDEzLjE1MiBMIC03LjAxMCA2LjE2OCBRIC0zLjQ5NSAtMC44MTUgLTAuMzU3IC03Ljk3NiBMIDAuODE5IC0xMC42NTkgUSAzLjQ5NSAtMTYuNzY2IDcuNDY2IC0yMi4xMjEgTCA4LjE2NCAtMjMuMDYzIFEgMTEuNDM3IC0yNy40NzcgMTYuMjAzIC0zMC4yMTMgTCAxNy45ODcgLTMxLjIzNyBRIDIwLjk2OSAtMzIuOTQ5IDIxLjEyNyAtMjkuNTE1IEwgMjEuMTI3IC0yOS41MTUgUSAyMS4yODYgLTI2LjA4MCAxOS41MTggLTIzLjEzMSBMIDE4LjEwOSAtMjAuNzgyIFEgMTQuOTMyIC0xNS40ODUgMTEuMTUyIC0xMC42MDAgTCA3LjcyNyAtNi4xNzQgUSAyLjg1OSAwLjExNiAtMS4wNjcgNy4wMzQgTCAtNS40MDEgMTQuNjcwIEwgLTUuMTk1IDE5Ljk2MyBRIC01LjA4MyAyMi44MjAgLTYuMzU0IDI1LjM4MSBMIC02LjM1NCAyNS4zODEgUSAtNy42MjUgMjcuOTQzIC0xMC4wOTYgMjkuMzgxIEwgLTEwLjMyNSAyOS41MTUgUSAtMTMuMDI2IDMxLjA4NiAtMTYuMDc0IDMxLjc3NCBMIC0yMC4xODEgMzIuNzAwIFEgLTIxLjI4NiAzMi45NDkgLTIwLjc1MCAzMS45NTEgTCAtMjAuMjE0IDMwLjk1MiBaIiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE1LjYxNiAxNi45MTApIHJvdGF0ZSgwLjkxODc1ODY2MzMxOTA1ODgpIj48cGF0aCBkPSJNIC0xMS41MTEgNi4wMDAgTCAtMTEuNDEzIDMuMzYxIFEgLTExLjMxNSAwLjc0MCAtOC43ODAgMC4wNjkgTCAtNi45MDkgLTAuNDI3IFEgLTQuMzc1IC0xLjA5OCAtMy45NzcgLTMuNjkwIEwgLTMuNTQ0IC02LjUxMSBMIDMuNjQxIC02LjM1OCBMIDQuMzk2IC0yLjk0MyBRIDQuOTYxIC0wLjM4MyA3LjUzMiAwLjEzMSBMIDkuMDM3IDAuNDMxIFEgMTEuNjA4IDAuOTQ1IDExLjQ0OCAzLjU2MiBMIDExLjI2NiA2LjUxMSBMIC0xMS41MTEgNi4wMDAgWiIgZmlsbD0iI2Q0ZDRkNCIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTUuNTIyIDEyLjI0MSkgcm90YXRlKDAuOTE4NzU4NjYzMzE5MDU4OCkiPjxwYXRoIGQ9Ik0gLTQuOTUwIC0xLjUyOCBMIDUuMTkzIC0xLjUyOCBMIDUuOTIyIDEuNjQ1IEwgLTUuNDM2IDAuOTQ3IEwgLTQuOTUwIC0xLjUyOCBaIiBmaWxsPSIjOWQ5NTk1IiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNS40NzIgMzMuNTc4KSByb3RhdGUoMC45MTg3NTg2NjMzMTkwNTg4KSI+PHBhdGggZD0iTSAtMTEuNDY3IC0xMi42ODcgTCAxMS40NjcgLTEyLjY4NyBMIDExLjQ2NyAxMS40MjAgUSAxMS40NjcgMTIuNjg3IDEwLjE5OSAxMi42ODcgTCAtMTAuMTk5IDEyLjY4NyBRIC0xMS40NjcgMTIuNjg3IC0xMS40NjcgMTEuNDIwIEwgLTExLjQ2NyAtMTIuNjg3IFoiIGZpbGw9IiMwMDAwMDAiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE1LjY2MyAzMi4zOTUpIHJvdGF0ZSgwLjkxODc1ODY2MzMxOTA1ODgpIj48cGF0aCBkPSJNIC0xMi4zMjcgLTQuOTEyIEwgMTIuMzI3IC00LjkxMiBMIDEyLjMyNyA0LjkxMiBMIC0xMi4zMjcgNC45MTIgTCAtMTIuMzI3IC00LjkxMiBaIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg4Ljg4MyAzMi4wNTkpIHJvdGF0ZSgwLjkxODc1ODY2MzMxOTA1ODgpIj48cGF0aCBkPSJNIC0xLjAzMCAtMy40MDAgTCAwLjkxMCAtMy40MzEgTCAxLjAzMCAzLjQzMSBMIC0xLjAwMCAzLjQwMCBMIC0xLjAzMCAtMy40MDAgWiIgZmlsbD0iIzAwMDAwMCIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTMuNzM3IDMyLjEyNikgcm90YXRlKDAuOTE4NzU4NjYzMzE5MDU4OCkiPjxwYXRoIGQ9Ik0gLTIuNzkxIDMuNDQ2IEwgLTMuMDAwIC0zLjUwOSBMIC0xLjExOSAtMy41MDkgTCAwLjgyMSAwLjEwOSBMIDAuNzYxIC0zLjU0MCBMIDIuNzk4IC0zLjUzNCBMIDMuMDAwIDMuNDgwIEwgMC45NDAgMy40NzggTCAtMS4wNjAgMC4xNDAgTCAtMC45MTEgMy41NDAgTCAtMi43OTEgMy40NDYgWiIgZmlsbD0iIzAwMDAwMCIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjYuNTU0IDMyLjU2Nykgcm90YXRlKDAuOTE4NzU4NjYzMzE5MDU4OCkiPjxwYXRoIGQ9Ik0gLTEuOTc3IC00Ljk4OSBMIDEuOTc3IC00Ljg5NyBMIDEuOTMyIDQuOTg5IEwgLTEuOTMyIDQuODUwIEwgLTEuOTc3IC00Ljk4OSBaIiBmaWxsPSIjYmRiN2I3IiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNS42MzMgNi40MzkpIHJvdGF0ZSgwLjkxODc1ODY2MzMxOTA1ODgpIj48cGF0aCBkPSJNIC0xMC40MTkgLTQuMTQ0IEwgMTAuNjA2IC00LjEzMyBMIDEwLjc0MiA0LjA3OSBMIC0xMC42MDYgNC4xMzMgTCAtMTAuNDE5IC00LjE0NCBaIiBmaWxsPSIjZDRkNGQ0IiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNS42MzkgNi40MTYpIHJvdGF0ZSgwLjkxODc1ODY2MzMxOTA1ODgpIj48cGF0aCBkPSJNIC0xMC40ODQgNC4zMjcgTCAtMTAuNDQ2IC00LjAxOSBMIDEwLjU2MCAtNC4xMzcgTCAxMC42ODQgLTQuMDU4IEwgLTcuMzMxIC0yLjc4MSBRIC04LjUxNSAtMi42OTcgLTguNTUxIC0xLjUxMCBMIC04LjcyMSA0LjA3MyBMIC0xMC40ODQgNC4zMjcgWiIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjAuODQ0IDYuNDgzKSByb3RhdGUoMC45MTg3NTg2NjMzMTkwNTg4KSI+PHBhdGggZD0iTSAtNS42MzYgNC4xOTYgTCAyLjU4MiAzLjA5NiBRIDMuNjI4IDIuOTU2IDMuNjkyIDEuOTAzIEwgNC4wMzggLTMuODE0IEwgNS40OTkgLTQuMTk2IEwgNS42MzYgNC4wNTMgTCAtNS42MzYgNC4xOTYgWiIgZmlsbD0iIzlkOTU5NSIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTUuNjY2IDI1LjIzMykgcm90YXRlKDAuOTE4NzU4NjYzMzE5MDU4OCkiPjxwYXRoIGQ9Ik0gLTEzLjA4OSAtNi4zMjMgUSAtMTMuMDcyIC04LjcyMyAtMTAuNzUzIC05LjM0MiBMIC04LjAwOSAtMTAuMDc0IFEgLTYuMDUyIC0xMC41OTYgLTUuNjA5IC0xMi41NzIgTCAtNS4xNjYgLTE0LjU0OCBMIC0xMC43ODIgLTE0LjU0OCBMIC0xMC43MDcgLTIyLjc4NiBMIDEwLjM0MiAtMjIuODY0IEwgMTAuNDE2IC0xNC43NDMgTCA1LjAyNCAtMTQuNzQzIEwgNS4zNDAgLTEyLjUzMiBRIDUuNjU3IC0xMC4zMjEgNy44NDMgLTkuODY0IEwgMTEuNDIyIC05LjExNiBRIDEzLjMwMSAtOC43MjMgMTMuMjk4IC02LjgwMyBMIDEzLjI0OCAyMC41NzggUSAxMy4yNDQgMjIuNzg2IDExLjAzNiAyMi43ODYgTCAtMTEuMjI1IDIyLjc4NiBRIC0xMy4zMDEgMjIuNzg2IC0xMy4yODYgMjAuNzEwIEwgLTEzLjA4OSAtNi4zMjMgWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMC43NzYgMzIuMjUzKSByb3RhdGUoMC45MTg3NTg2NjMzMTkwNTg4KSI+PHBhdGggZD0iTSAtMy4wMjMgLTMuNDM4IEwgLTIuOTA5IDMuNTM1IEwgLTAuODg3IDMuNDUxIEwgLTAuOTE3IDEuNTQ5IEwgMC43MjUgMy40ODMgTCAyLjg0NCAzLjQ1MSBMIDAuMTU3IC0wLjE2NyBMIDMuMDIzIC0zLjM3OSBMIDAuODE0IC0zLjQxMCBMIC0xLjAwNyAtMS41NzAgTCAtMC45MTcgLTMuNTM1IEwgLTMuMDIzIC0zLjQzOCBaIiBmaWxsPSIjMDAwMDAwIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNS41MzAgMTAuNjU2KSByb3RhdGUoMC45MTg3NTg2NjMzMTkwNTg4KSI+PHBhdGggZD0iTSAtNS4wMzEgMC4wMzkgTCA1LjMzMiAtMC4xNjkiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMDAwMCIgc3Ryb2tlLXdpZHRoPSIxIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNi42NDMgMzEuNDE5KSByb3RhdGUoMC45MTg3NTg2NjMzMTkwNTg4KSI+PHBhdGggZD0iTSAtMS4wNzIgLTE0Ljk2NiBMIDEuMDMwIC0xNS4yMTMgTCAxLjA3MiAxNS4yMTMgTCAtMS4wNzIgMTQuOTg1IEwgLTEuMDcyIC0xNC45NjYgWiIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PC9zdmc+" width="12" height="17" style="image-rendering:pixelated;vertical-align:middle"/> Tinta` : `<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNCIgaGVpZ2h0PSIzNyIgdmlld0JveD0iMCAwIDY0IDcwIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNy4xNDMgNTQuNjY2KSI+PHBhdGggZD0iTSA1LjcyNiA1LjEyNCBMIDcuMTMzIDAuMDc5IEwgNi43MzEgLTUuMzg2IEwgMS41MDcgLTYuNTQyIEwgLTUuMTI0IC0yLjQ5NiBMIC03LjEzMyAwLjg2NyBMIC03LjEzMyA2LjU0MiBMIDUuNzI2IDUuMTI0IFoiIGZpbGw9IiNhYTZlNmUiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI1Ljg1MyA1NS4zNTIpIj48cGF0aCBkPSJNIC0yLjAzOSA1LjI5NSBMIC0xLjc2OCAtMC42NTUgTCAtNC43NDcgNy4yNzkgTCAtNi4xMDIgMy4zMTIgTCAtNS40MzUgLTEuMjQ0IEwgLTIuMTkwIC00LjQ1MCBMIDMuMjE3IC03LjI3OSBMIDYuMTAyIC02LjMzNiBMIDIuNDk2IC0wLjQ5MCBMIDEuMDU0IDYuMTEwIEwgLTIuMDM5IDUuMjk1IFoiIGZpbGw9IiNmOWNkY2QiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI2LjIwMSA2Mi44ODQpIj48cGF0aCBkPSJNIC02LjUzMCAtNC4wOTkgTCAtNS4yNzQgLTQuMzg4IFEgLTQuMDE4IC00LjY3NyAtMi43NzkgLTQuMzIzIEwgLTAuMDA2IC0zLjUzMiBRIDIuNjEyIC0yLjc4NSA1LjEyNCAtMy44MzYgTCA3LjYzNSAtNC44ODcgTCA2LjA3NyAtMS4xNjYgTCAtMC40MDIgMy4xMDAgTCAtNy45MzcgNC44MzUgTCAtNi4zMjkgMi4zMTIgTCAtNi4zMjkgLTAuODQxIEwgLTYuNTMwIC00LjA5OSBaIiBmaWxsPSIjMzIxYTFhIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0NS41NjAgMjQuNTg2KSI+PHBhdGggZD0iTSAtMTUuMjY3IDIwLjEzMSBMIC0xMC4xNzggMjEuMTMwIEwgLTIuODYzIDEwLjY0OCBMIDMuMTgxIDEuODMwIEwgMTAuNDk2IC04LjY1MiBMIDE0LjYzMSAtMTUuMTQwIEwgMTUuMjY3IC0xOS4xMzMgTCAxNC4zMTMgLTIxLjEzMCBMIDEwLjE3OCAtMTkuOTY1IEwgMy44MTcgLTE1LjMwNyBMIC0xLjI3MiAtNy4xNTQgTCAtNi45OTcgMy4zMjcgTCAtMTEuMTMyIDEyLjMxMiBMIC0xNS4yNjcgMjAuMTMxIFoiIGZpbGw9IiNmMmRlYmEiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQ0Ljc1NSAyNC4yMzkpIj48cGF0aCBkPSJNIC0xNC40MjEgMTkuOTg5IEwgLTEwLjgxNiAyMC43NDQgTCAtMC4wMDAgLTMuNTgzIEwgNS43NjggLTExLjUwMyBMIDE0LjA2MCAtMjAuNzQ0IEwgMS44MDMgLTExLjMxNSBMIC0zLjI0NSAtMS42OTcgTCAtOC4yOTIgOS40MjkgTCAtMTQuNDIxIDE5Ljk4OSBaIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0OC4wMDkgMjQuNTk4KSI+PHBhdGggZD0iTSAtMTEuNzEwIDIxLjMxMiBMIC01LjkwMCAxMC43MTQgTCAwLjY1NSAyLjc2NiBMIDYuOTEyIC02LjI3NCBMIDEzLjc5NSAtMTYuNDM3IEwgMTIuNjAxIC0yMS4zMTIgTCAxMC40NTAgLTE2Ljc0OSBRIDguMjk5IC0xMi4xODcgNS40MTIgLTguMDUxIEwgNS4xNDggLTcuNjcyIFEgMS45OTYgLTMuMTU3IC0xLjI5NSAxLjI1OCBMIC0yLjE0NSAyLjM5OSBRIC00Ljg1NyA2LjAzOSAtNy41MzkgOS43MDEgTCAtNy44OTUgMTAuMTg4IFEgLTEwLjIyMCAxMy4zNjQgLTEyLjAwOCAxNi44NzAgTCAtMTMuNzk1IDIwLjM3NyBMIC0xMS43MTAgMjEuMzEyIFoiIGZpbGw9IiM5Zjg0ODQiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDMyLjU0NiA0Ni45MjkpIj48cGF0aCBkPSJNIC0xLjgxMiAtMi4zOTcgTCAzLjczMCAtMS4wNTkgTCAxLjQyOCAyLjcwMCBMIC0zLjg0NCAxLjY2NiBMIC0xLjgxMiAtMi4zOTcgWiIgZmlsbD0iI2ZmZTEzNSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzOS42MDcgMzQuOTQ5KSI+PHBhdGggZD0iTSAtMjAuMjE0IDMwLjk1MiBMIC0xOS44MTIgMjkuOTU0IFEgLTE5LjQxMCAyOC45NTUgLTE5LjUzNCAyNy44ODYgTCAtMTkuNjExIDI3LjIyMSBRIC0xOS44MTIgMjUuNDg3IC0xOS42NzcgMjMuNzQ2IEwgLTE5LjU4NyAyMi42MDQgUSAtMTkuNDEwIDIwLjMzNyAtMTguMDA0IDE4LjU1MCBMIC0xOC4wMDQgMTguNTUwIFEgLTE2LjU5OCAxNi43NjQgLTE0LjY0MyAxNS42MDEgTCAtMTAuNTI2IDEzLjE1MiBMIC03LjAxMCA2LjE2OCBRIC0zLjQ5NSAtMC44MTUgLTAuMzU3IC03Ljk3NiBMIDAuODE5IC0xMC42NTkgUSAzLjQ5NSAtMTYuNzY2IDcuNDY2IC0yMi4xMjEgTCA4LjE2NCAtMjMuMDYzIFEgMTEuNDM3IC0yNy40NzcgMTYuMjAzIC0zMC4yMTMgTCAxNy45ODcgLTMxLjIzNyBRIDIwLjk2OSAtMzIuOTQ5IDIxLjEyNyAtMjkuNTE1IEwgMjEuMTI3IC0yOS41MTUgUSAyMS4yODYgLTI2LjA4MCAxOS41MTggLTIzLjEzMSBMIDE4LjEwOSAtMjAuNzgyIFEgMTQuOTMyIC0xNS40ODUgMTEuMTUyIC0xMC42MDAgTCA3LjcyNyAtNi4xNzQgUSAyLjg1OSAwLjExNiAtMS4wNjcgNy4wMzQgTCAtNS40MDEgMTQuNjcwIEwgLTUuMTk1IDE5Ljk2MyBRIC01LjA4MyAyMi44MjAgLTYuMzU0IDI1LjM4MSBMIC02LjM1NCAyNS4zODEgUSAtNy42MjUgMjcuOTQzIC0xMC4wOTYgMjkuMzgxIEwgLTEwLjMyNSAyOS41MTUgUSAtMTMuMDI2IDMxLjA4NiAtMTYuMDc0IDMxLjc3NCBMIC0yMC4xODEgMzIuNzAwIFEgLTIxLjI4NiAzMi45NDkgLTIwLjc1MCAzMS45NTEgTCAtMjAuMjE0IDMwLjk1MiBaIiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE1LjYxNiAxNi45MTApIHJvdGF0ZSgwLjkxODc1ODY2MzMxOTA1ODgpIj48cGF0aCBkPSJNIC0xMS41MTEgNi4wMDAgTCAtMTEuNDEzIDMuMzYxIFEgLTExLjMxNSAwLjc0MCAtOC43ODAgMC4wNjkgTCAtNi45MDkgLTAuNDI3IFEgLTQuMzc1IC0xLjA5OCAtMy45NzcgLTMuNjkwIEwgLTMuNTQ0IC02LjUxMSBMIDMuNjQxIC02LjM1OCBMIDQuMzk2IC0yLjk0MyBRIDQuOTYxIC0wLjM4MyA3LjUzMiAwLjEzMSBMIDkuMDM3IDAuNDMxIFEgMTEuNjA4IDAuOTQ1IDExLjQ0OCAzLjU2MiBMIDExLjI2NiA2LjUxMSBMIC0xMS41MTEgNi4wMDAgWiIgZmlsbD0iI2Q0ZDRkNCIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTUuNTIyIDEyLjI0MSkgcm90YXRlKDAuOTE4NzU4NjYzMzE5MDU4OCkiPjxwYXRoIGQ9Ik0gLTQuOTUwIC0xLjUyOCBMIDUuMTkzIC0xLjUyOCBMIDUuOTIyIDEuNjQ1IEwgLTUuNDM2IDAuOTQ3IEwgLTQuOTUwIC0xLjUyOCBaIiBmaWxsPSIjOWQ5NTk1IiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNS40NzIgMzMuNTc4KSByb3RhdGUoMC45MTg3NTg2NjMzMTkwNTg4KSI+PHBhdGggZD0iTSAtMTEuNDY3IC0xMi42ODcgTCAxMS40NjcgLTEyLjY4NyBMIDExLjQ2NyAxMS40MjAgUSAxMS40NjcgMTIuNjg3IDEwLjE5OSAxMi42ODcgTCAtMTAuMTk5IDEyLjY4NyBRIC0xMS40NjcgMTIuNjg3IC0xMS40NjcgMTEuNDIwIEwgLTExLjQ2NyAtMTIuNjg3IFoiIGZpbGw9IiMwMDAwMDAiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE1LjY2MyAzMi4zOTUpIHJvdGF0ZSgwLjkxODc1ODY2MzMxOTA1ODgpIj48cGF0aCBkPSJNIC0xMi4zMjcgLTQuOTEyIEwgMTIuMzI3IC00LjkxMiBMIDEyLjMyNyA0LjkxMiBMIC0xMi4zMjcgNC45MTIgTCAtMTIuMzI3IC00LjkxMiBaIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg4Ljg4MyAzMi4wNTkpIHJvdGF0ZSgwLjkxODc1ODY2MzMxOTA1ODgpIj48cGF0aCBkPSJNIC0xLjAzMCAtMy40MDAgTCAwLjkxMCAtMy40MzEgTCAxLjAzMCAzLjQzMSBMIC0xLjAwMCAzLjQwMCBMIC0xLjAzMCAtMy40MDAgWiIgZmlsbD0iIzAwMDAwMCIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTMuNzM3IDMyLjEyNikgcm90YXRlKDAuOTE4NzU4NjYzMzE5MDU4OCkiPjxwYXRoIGQ9Ik0gLTIuNzkxIDMuNDQ2IEwgLTMuMDAwIC0zLjUwOSBMIC0xLjExOSAtMy41MDkgTCAwLjgyMSAwLjEwOSBMIDAuNzYxIC0zLjU0MCBMIDIuNzk4IC0zLjUzNCBMIDMuMDAwIDMuNDgwIEwgMC45NDAgMy40NzggTCAtMS4wNjAgMC4xNDAgTCAtMC45MTEgMy41NDAgTCAtMi43OTEgMy40NDYgWiIgZmlsbD0iIzAwMDAwMCIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjYuNTU0IDMyLjU2Nykgcm90YXRlKDAuOTE4NzU4NjYzMzE5MDU4OCkiPjxwYXRoIGQ9Ik0gLTEuOTc3IC00Ljk4OSBMIDEuOTc3IC00Ljg5NyBMIDEuOTMyIDQuOTg5IEwgLTEuOTMyIDQuODUwIEwgLTEuOTc3IC00Ljk4OSBaIiBmaWxsPSIjYmRiN2I3IiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNS42MzMgNi40MzkpIHJvdGF0ZSgwLjkxODc1ODY2MzMxOTA1ODgpIj48cGF0aCBkPSJNIC0xMC40MTkgLTQuMTQ0IEwgMTAuNjA2IC00LjEzMyBMIDEwLjc0MiA0LjA3OSBMIC0xMC42MDYgNC4xMzMgTCAtMTAuNDE5IC00LjE0NCBaIiBmaWxsPSIjZDRkNGQ0IiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNS42MzkgNi40MTYpIHJvdGF0ZSgwLjkxODc1ODY2MzMxOTA1ODgpIj48cGF0aCBkPSJNIC0xMC40ODQgNC4zMjcgTCAtMTAuNDQ2IC00LjAxOSBMIDEwLjU2MCAtNC4xMzcgTCAxMC42ODQgLTQuMDU4IEwgLTcuMzMxIC0yLjc4MSBRIC04LjUxNSAtMi42OTcgLTguNTUxIC0xLjUxMCBMIC04LjcyMSA0LjA3MyBMIC0xMC40ODQgNC4zMjcgWiIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjAuODQ0IDYuNDgzKSByb3RhdGUoMC45MTg3NTg2NjMzMTkwNTg4KSI+PHBhdGggZD0iTSAtNS42MzYgNC4xOTYgTCAyLjU4MiAzLjA5NiBRIDMuNjI4IDIuOTU2IDMuNjkyIDEuOTAzIEwgNC4wMzggLTMuODE0IEwgNS40OTkgLTQuMTk2IEwgNS42MzYgNC4wNTMgTCAtNS42MzYgNC4xOTYgWiIgZmlsbD0iIzlkOTU5NSIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTUuNjY2IDI1LjIzMykgcm90YXRlKDAuOTE4NzU4NjYzMzE5MDU4OCkiPjxwYXRoIGQ9Ik0gLTEzLjA4OSAtNi4zMjMgUSAtMTMuMDcyIC04LjcyMyAtMTAuNzUzIC05LjM0MiBMIC04LjAwOSAtMTAuMDc0IFEgLTYuMDUyIC0xMC41OTYgLTUuNjA5IC0xMi41NzIgTCAtNS4xNjYgLTE0LjU0OCBMIC0xMC43ODIgLTE0LjU0OCBMIC0xMC43MDcgLTIyLjc4NiBMIDEwLjM0MiAtMjIuODY0IEwgMTAuNDE2IC0xNC43NDMgTCA1LjAyNCAtMTQuNzQzIEwgNS4zNDAgLTEyLjUzMiBRIDUuNjU3IC0xMC4zMjEgNy44NDMgLTkuODY0IEwgMTEuNDIyIC05LjExNiBRIDEzLjMwMSAtOC43MjMgMTMuMjk4IC02LjgwMyBMIDEzLjI0OCAyMC41NzggUSAxMy4yNDQgMjIuNzg2IDExLjAzNiAyMi43ODYgTCAtMTEuMjI1IDIyLjc4NiBRIC0xMy4zMDEgMjIuNzg2IC0xMy4yODYgMjAuNzEwIEwgLTEzLjA4OSAtNi4zMjMgWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMC43NzYgMzIuMjUzKSByb3RhdGUoMC45MTg3NTg2NjMzMTkwNTg4KSI+PHBhdGggZD0iTSAtMy4wMjMgLTMuNDM4IEwgLTIuOTA5IDMuNTM1IEwgLTAuODg3IDMuNDUxIEwgLTAuOTE3IDEuNTQ5IEwgMC43MjUgMy40ODMgTCAyLjg0NCAzLjQ1MSBMIDAuMTU3IC0wLjE2NyBMIDMuMDIzIC0zLjM3OSBMIDAuODE0IC0zLjQxMCBMIC0xLjAwNyAtMS41NzAgTCAtMC45MTcgLTMuNTM1IEwgLTMuMDIzIC0zLjQzOCBaIiBmaWxsPSIjMDAwMDAwIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNS41MzAgMTAuNjU2KSByb3RhdGUoMC45MTg3NTg2NjMzMTkwNTg4KSI+PHBhdGggZD0iTSAtNS4wMzEgMC4wMzkgTCA1LjMzMiAtMC4xNjkiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMDAwMCIgc3Ryb2tlLXdpZHRoPSIxIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNi42NDMgMzEuNDE5KSByb3RhdGUoMC45MTg3NTg2NjMzMTkwNTg4KSI+PHBhdGggZD0iTSAtMS4wNzIgLTE0Ljk2NiBMIDEuMDMwIC0xNS4yMTMgTCAxLjA3MiAxNS4yMTMgTCAtMS4wNzIgMTQuOTg1IEwgLTEuMDcyIC0xNC45NjYgWiIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PC9zdmc+" width="12" height="17" style="image-rendering:pixelated;vertical-align:middle"/> Tinta`, '#374151'));
            // Resto de sub-capas en orden visual (de arriba a abajo)
            if (_lyPencil) list.appendChild(_lyBuildGroupSubRow(_lyPencil, edLayers.indexOf(_lyPencil), `<img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOSIgaGVpZ2h0PSIzMSIgdmlld0JveD0iMCAwIDE5IDMxIj4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMC42NjIgMTUuMzM5KSI+PHBhdGggZD0iTSAtNy4yNjMgMy4wMjAgTCAwLjc5NSAtMTQuMTA1IEwgMy44NzAgLTE1LjA1OSBMIDYuOTQ1IC0xMy4yNTcgTCA4LjE2NSAtOS44MTEgTCAwLjE1OSA3LjIwOCBMIC01Ljk3MiAxMy4wNjYgUSAtOC4xNjUgMTUuMTYxIC03Ljk0MCAxMi4xMzYgTCAtNy4yNjMgMy4wMjAgWiIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg2Ljg2MCAyMS41MjApIj48cGF0aCBkPSJNIC0zLjgyNCAzLjc1MSBMIC0xLjE3NyA1LjczNiBMIDMuODk4IDAuODA5IEwgNC4yNjYgLTIuMzUzIEwgMC4wNzQgLTUuNzM2IEwgLTMuMzA5IC0zLjA4OSBMIC0zLjgyNCAzLjc1MSBaIiBmaWxsPSIjZmZlZGM3IiBzdHJva2U9Im5vbmUiLz48L2c+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNC4xOTAgMjcuMTQxKSByb3RhdGUoLTguOTQyMDQ0NTA2MjY4NzQyKSI+PHBhdGggZD0iTSAwLjI0MyAxLjIyMCBMIC0wLjY2MyAxLjY5NSBRIC0xLjU3MCAyLjE2OSAtMS40MzcgMS4xNTUgTCAtMS4zMDEgMC4xMTkgTCAtMC44MzMgLTIuMTY5IEwgMC4xMDIgLTEuOTQxIFEgMS4wMjcgLTEuNzE2IDEuMjk5IC0wLjgwMiBMIDEuNTcwIDAuMTExIEwgMC4yNDMgMS4yMjAgWiIgZmlsbD0iIzRlMzIzMiIgc3Ryb2tlPSJub25lIi8+PC9nPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDcuODY4IDIyLjQ4MCkiPjxwYXRoIGQ9Ik0gLTIuNjM3IDMuNDIzIEwgMi45MzEgLTQuODAxIEwgMi44OTggLTAuMTgyIEwgLTIuMTA3IDQuNjk1IEwgLTIuNjM3IDMuNDIzIFoiIGZpbGw9IiNjNGI2OTciIHN0cm9rZT0ibm9uZSIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg5LjExNSA5LjUwOSkiPjxwYXRoIGQ9Ik0gLTUuNDk2IDguODM5IEwgLTQuNjgzIDguODMzIFEgLTMuODcwIDguODI4IC0zLjI1OSA4LjI5MyBMIC0yLjU5OCA3LjcxNCBMIDUuNDQ3IC05LjA3OSBMIDIuNjgyIC04LjExNiBMIC01LjQ5NiA4LjgzOSBaIiBmaWxsPSIjZjdmNWJiIiBzdHJva2U9Im5vbmUiLz48L2c+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTIuMTI5IDEwLjIzMykgcm90YXRlKDIuODYyODU5NzgyNjk0MDgzNikiPjxwYXRoIGQ9Ik0gLTUuMjM3IDcuMjg5IEwgMS44MDggLTkuOTk3IEwgNS4wMjcgLTguMjQ3IEwgLTEuNjk3IDkuMDc2IEwgLTIuMzAwIDkuNTYyIFEgLTIuODIwIDkuOTgxIC0zLjQ4NiA5LjkzNSBMIC0zLjQ4NiA5LjkzNSBRIC00LjE1MiA5Ljg4OSAtNC41NzUgOS4zNzIgTCAtNC42NTkgOS4yNzAgUSAtNS4xMTMgOC43MTYgLTUuMTc1IDguMDAyIEwgLTUuMjM3IDcuMjg5IFoiIGZpbGw9IiM1MjM4MzgiIHN0cm9rZT0ibm9uZSIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNC4zMjggMTIuMzcyKSI+PHBhdGggZD0iTSAtNC4zNjcgNi45NDQgTCAtNC4yOTUgOC4zMTkgUSAtNC4yNjEgOC45NTkgLTMuOTQzIDkuNTE2IEwgLTMuNjI1IDEwLjA3MiBMIDQuMjc0IC02Ljc4NyBMIDMuMTYxIC0xMC4wNzUgTCAtNC4zNjcgNi45NDQgWiIgZmlsbD0iI2FmYWIzYyIgc3Ryb2tlPSJub25lIi8+PC9nPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDguNjg2IDE1LjAyMikiPjxwYXRoIGQ9Ik0gLTUuNjY4IDE0LjUzMiBMIC0zLjg4OSAyLjYyOCBMIDQuMTg0IC0xNC4wMDIgTCA1LjY2OCAtMTQuNTMyIEwgLTIuMzQ5IDMuMTAyIEwgLTUuNjY4IDE0LjUzMiBaIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9Im5vbmUiLz48L2c+Cjwvc3ZnPg==" width="11" height="18" style="display:inline-block;vertical-align:middle;flex-shrink:0"> Lápiz`,    '#c4b5fd'));
            if (_lyWc)     list.appendChild(_lyBuildGroupSubRow(_lyWc,     edLayers.indexOf(_lyWc),     `<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMiIgaGVpZ2h0PSIxMyIgdmlld0JveD0iMCAwIDY2IDcwIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNy43MzggNTcuOTUzKSI+PHBhdGggZD0iTSAtNy44ODkgOS44MjkgTCAtMS4yMjMgOC43ODggTCAzLjQ2NSA2LjE4MyBMIDYuOTAyIDIuMjI1IEwgNy44ODkgLTMuMjA4IEwgNy40ODcgLTguNjczIEwgMi4yNjMgLTkuODI5IEwgLTQuMzY3IC01Ljc4MyBMIC02LjM3NiAtMi40MjAgTCAtNi4zNzYgMy4yNTYgTCAtNy44ODkgOS44MjkgWiIgZmlsbD0iI2FhNmU2ZSIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjcuMjA1IDU3LjQ2NykiPjxwYXRoIGQ9Ik0gLTYuNDcwIDkuNDk4IEwgLTQuMjgyIDcuNjIzIFEgLTIuMDk1IDUuNzQ4IC0xLjk4NCAyLjg2OSBMIC0xLjc2OCAtMi43NzAgTCAtNS42MzcgNC4zOTQgTCAtNi4xMDIgMS4xOTcgTCAtNS40MzUgLTMuMzYwIEwgLTIuMTkwIC02LjU2NiBMIDMuMjE3IC05LjM5NCBMIDYuMTAyIC04LjQ1MSBMIDIuNDk2IC0yLjYwNSBMIDEuMDMwIDguMTQ0IEwgLTYuNDcwIDkuNDk4IFoiIGZpbGw9IiNmOWNkY2QiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQ2LjkxMiAyNC41ODYpIj48cGF0aCBkPSJNIC0xNS4yNjcgMjAuMTMxIEwgLTEwLjE3OCAyMS4xMzAgTCAtMi44NjMgMTAuNjQ4IEwgMy4xODEgMS44MzAgTCAxMC40OTYgLTguNjUyIEwgMTQuNjMxIC0xNS4xNDAgTCAxNS4yNjcgLTE5LjEzMyBMIDE0LjMxMyAtMjEuMTMwIEwgMTAuMTc4IC0xOS45NjUgTCAzLjgxNyAtMTUuMzA3IEwgLTEuMjcyIC03LjE1NCBMIC02Ljk5NyAzLjMyNyBMIC0xMS4xMzIgMTIuMzEyIEwgLTE1LjI2NyAyMC4xMzEgWiIgZmlsbD0iI2YyZGViYSIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDYuMTA3IDI0LjIzOSkiPjxwYXRoIGQ9Ik0gLTE0LjQyMSAxOS45ODkgTCAtMTAuODE2IDIwLjc0NCBMIC0wLjAwMCAtMy41ODMgTCA1Ljc2OCAtMTEuNTAzIEwgMTQuMDYwIC0yMC43NDQgTCAxLjgwMyAtMTEuMzE1IEwgLTMuMjQ1IC0xLjY5NyBMIC04LjI5MiA5LjQyOSBMIC0xNC40MjEgMTkuOTg5IFoiIGZpbGw9IiNmZmZmZmYiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQ5LjM2MSAyNC41OTgpIj48cGF0aCBkPSJNIC0xMS43MTAgMjEuMzEyIEwgLTUuOTAwIDEwLjcxNCBMIDAuNjU1IDIuNzY2IEwgNi45MTIgLTYuMjc0IEwgMTMuNzk1IC0xNi40MzcgTCAxMi42MDEgLTIxLjMxMiBMIDEwLjQ1MCAtMTYuNzQ5IFEgOC4yOTkgLTEyLjE4NyA1LjQxMiAtOC4wNTEgTCA1LjE0OCAtNy42NzIgUSAxLjk5NiAtMy4xNTcgLTEuMjk1IDEuMjU4IEwgLTIuMTQ1IDIuMzk5IFEgLTQuODU3IDYuMDM5IC03LjUzOSA5LjcwMSBMIC03Ljg5NSAxMC4xODggUSAtMTAuMjIwIDEzLjM2NCAtMTIuMDA4IDE2Ljg3MCBMIC0xMy43OTUgMjAuMzc3IEwgLTExLjcxMCAyMS4zMTIgWiIgZmlsbD0iIzlmODQ4NCIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzMuODk4IDQ2LjkyOSkiPjxwYXRoIGQ9Ik0gLTEuODEyIC0yLjM5NyBMIDMuNzMwIC0xLjA1OSBMIDEuNDI4IDIuNzAwIEwgLTMuODQ0IDEuNjY2IEwgLTEuODEyIC0yLjM5NyBaIiBmaWxsPSIjZmZlMTM1IiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQwLjk1OSAzNC45NDkpIj48cGF0aCBkPSJNIC0yMC4yMTQgMzAuOTUyIEwgLTE5LjgxMiAyOS45NTQgUSAtMTkuNDEwIDI4Ljk1NSAtMTkuNTM0IDI3Ljg4NiBMIC0xOS42MTEgMjcuMjIxIFEgLTE5LjgxMiAyNS40ODcgLTE5LjY3NyAyMy43NDYgTCAtMTkuNTg3IDIyLjYwNCBRIC0xOS40MTAgMjAuMzM3IC0xOC4wMDQgMTguNTUwIEwgLTE4LjAwNCAxOC41NTAgUSAtMTYuNTk4IDE2Ljc2NCAtMTQuNjQzIDE1LjYwMSBMIC0xMC41MjYgMTMuMTUyIEwgLTcuMDEwIDYuMTY4IFEgLTMuNDk1IC0wLjgxNSAtMC4zNTcgLTcuOTc2IEwgMC44MTkgLTEwLjY1OSBRIDMuNDk1IC0xNi43NjYgNy40NjYgLTIyLjEyMSBMIDguMTY0IC0yMy4wNjMgUSAxMS40MzcgLTI3LjQ3NyAxNi4yMDMgLTMwLjIxMyBMIDE3Ljk4NyAtMzEuMjM3IFEgMjAuOTY5IC0zMi45NDkgMjEuMTI3IC0yOS41MTUgTCAyMS4xMjcgLTI5LjUxNSBRIDIxLjI4NiAtMjYuMDgwIDE5LjUxOCAtMjMuMTMxIEwgMTguMTA5IC0yMC43ODIgUSAxNC45MzIgLTE1LjQ4NSAxMS4xNTIgLTEwLjYwMCBMIDcuNzI3IC02LjE3NCBRIDIuODU5IDAuMTE2IC0xLjA2NyA3LjAzNCBMIC01LjQwMSAxNC42NzAgTCAtNS4xOTUgMTkuOTYzIFEgLTUuMDgzIDIyLjgyMCAtNi4zNTQgMjUuMzgxIEwgLTYuMzU0IDI1LjM4MSBRIC03LjYyNSAyNy45NDMgLTEwLjA5NiAyOS4zODEgTCAtMTAuMzI1IDI5LjUxNSBRIC0xMy4wMjYgMzEuMDg2IC0xNi4wNzQgMzEuNzc0IEwgLTIwLjE4MSAzMi43MDAgUSAtMjEuMjg2IDMyLjk0OSAtMjAuNzUwIDMxLjk1MSBMIC0yMC4yMTQgMzAuOTUyIFoiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMDAwMCIgc3Ryb2tlLXdpZHRoPSIxIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTkuOTk2IDE4LjMxMykiPjxwYXRoIGQ9Ik0gLTE1LjMxMyAtMS41NzEgTCAtMTUuMDAwIDEuNDQ5IEwgMTMuNTA1IDEuNjc2IEwgMTQuMDYyIC0xLjg4NCBMIC0xNS4zMTMgLTEuNTcxIFoiIGZpbGw9IiNkNGQ0ZDQiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE5LjI4MyAyOS43MzYpIj48cGF0aCBkPSJNIC0xNC41ODMgLTExLjY3NiBMIC05LjkwMyAtMTAuNjA2IFEgLTUuMjIyIC05LjUzNiAtMC41NDcgLTEwLjYzMCBMIDQuMDc5IC0xMS43MTMgUSA3LjU4MyAtMTIuNTMzIDExLjEyNSAtMTEuODkyIEwgMTQuNjY3IC0xMS4yNTEgTCAxMS41NzIgOS44ODUgUSAxMS4yMzIgMTIuMjA0IDguODg5IDEyLjI2OCBMIC04LjU5NSAxMi43NDAgUSAtMTAuOTM4IDEyLjgwNCAtMTEuMjgzIDEwLjQ4NSBMIC0xNC41ODMgLTExLjY3NiBaIiBmaWxsPSIjNWY5YmQzIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMC4wNTMgMjcuODcwKSI+PHBhdGggZD0iTSAwLjk3MyAxNC40MjQgTCAtMy4wNDAgLTE1LjQ3OCBMIDIuNTM3IC0xNS40NzggTCA0LjMzMCAxMy41NzUgUSA0LjQ0MSAxNS4zNjggMi43MDcgMTQuODk2IEwgMC45NzMgMTQuNDI0IFoiIGZpbGw9IiNmZmZmZmYiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE5Ljk5MyAyOS4wODgpIj48cGF0aCBkPSJNIC0xNi40MzggLTE0LjkyOSBRIC0xOC40MzggLTE0LjkwNSAtMTguMTEwIC0xMi45MzIgTCAtMTMuOTI2IDEyLjMwMSBRIC0xMy40MjAgMTUuMzUyIC0xMC4zMjcgMTUuMzUyIEwgOC4yODEgMTUuMzUyIFEgMTIuNTM0IDE1LjM1MiAxMy4yMjAgMTEuMTU1IEwgMTcuMjI2IC0xMy4zNjggUSAxNy41NDkgLTE1LjM0MiAxNS41NDkgLTE1LjMxNyBMIC0xNi40MzggLTE0LjkyOSBaIiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI5LjM1MCAyOS43NzIpIj48cGF0aCBkPSJNIC00LjI3MSAxMi4yODMgTCAtMS4zMDIgMTIuMjMxIFEgMS42NjcgMTIuMTc5IDIuMDE1IDkuMjMwIEwgNC40NzkgLTExLjYxNSBMIDIuMDQ3IC0xMi4xMzYgUSAwLjEwNCAtMTIuNTUyIC0xLjg3NSAtMTIuMzc0IEwgLTMuODU0IC0xMi4xOTYgTCAtNC4yNzEgMTIuMjgzIFoiIGZpbGw9IiMzNzYwODYiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIwIi8+PC9nPjwvc3ZnPg==" width="12" height="13" style="image-rendering:pixelated;vertical-align:middle"/> Acuarela`, '#6ee7b7'));
            if (_lyFlPair) list.appendChild(_lyBuildGroupSubRow(_lyFlPair, edLayers.indexOf(_lyFlPair), `<img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIgogICAgIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMiIgdmlld0JveD0iMCAwIDUwIDQ3Ij4KICA8aW1hZ2UgaHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFESUFBQUF2Q0FZQUFBQ2hkNW4wQUFBTS9FbEVRVlI0QWN4WkIxaFVWeFkrYjNxakRDQlZGRUhCUlVWRkpWald0V3hpaVlpb0cxd05saVRZZFkwcmlXV3RFWldJV1d6QmFHU2pKaG9WRUZFcGxxaG9SRVFFQlVWNkhjb012Y3dNVS9mY1FSQU1xeURNOSsxODUzL3YzWHZQUGVmODcvWTNOUGovK3ZYRmNHWWpkdmNSR0NZYnNkbHlTd05EMVNRYlc5a29zMTdGRmx4ZW5vbUJ3WDRzLzRQb2s4aGs5TFo0Y08vZVYwWVpHSi9BWjJkRVc3SEJ4RXpFVG5NTzU3NGhrMWx2eHVGa1RIVVljRzY3cDllV3cwdVhEMHNMREdLWEJKK2czd3dJNUNRRUhiRzV1bm1yM2JnQlRodUdBdjBZMW1zbnRIYXBua3RzWTlCb3NYTmRSNTZZNGpKc3h1alI3bDl3bWN6N1FwN2dtTDJ4U2FJSmg5Tmd3dVhtZitRNE1HeUxoK2UyNE9XcnhqNExEQktJZnp6Rmp0cTVtN1Y5OGhUdzRBckFwa3dDa0o0Qm9GTHBJaHZSeng3T3J2NEhOQm53LzRZWjR4R3RvZzhpZ3l6Wm5KM0ZSNDdSTDZ6M1kreWY3d05CdmUxQktCQUlQVnhITE51M2NOSElSM3UrNVZlYytJa1JzM1U3NHh2M2NlQWxWME9mMk5zQSs3NERhc1U2b05iNkFlVy8velY4MXdEMXcwbUFyQnpnc1ZndzFXV29BUU5nV2lzTGZOQUhFYnZlWEY2dFJVWTJWQWQ4QjFzLzlkRk12eGxWTWdyb01Kek9nTG5GNWVCd05neW85WnVBOGxrSzFKWmRRQjA3Q1ZSVUxGQnBMd0RxR3pDc04wU3BCTGdYRHhRU0pTMjBaTVpNSnAvQlhOVldTeDlFS3FxYTVIbktnOEd3UERNdC84NUlGOG4wRGV1dEg4aGw5VkYzN3dBVmZnWGc4Uk1BTVhhYnRwRjA1cm1wU2RkS1E3UVV1RmhhWWFPQWQwczFmUkJKeUpOSks2NkJDaFRHUm5ZVHAwNjFXTE5tRGF6ZjlpK0RGQmFqVVF6YUZ0L3ZmYWMyN3dSZmo1bGNHNzVnUzRzUmZSQWhvVjQ5RGNyaUNlV1ZjRFR3Z0NZckt3czJidHdJUHF0WFNXY3lWWlV0enJ0ejk3bHhENlFhdFRQYUdJZ0F2UkJCdzlkaVFXV3dEbGl3V2E2aHpaLytzUlR6NE1DQkE3M00vanBSdVFoa05TVGRMV1RuZ29mVG43UTRPeTRoZHZSRkpGc0RVQlFIYXRpQVpGeXk4M2tMUEdkVkU0ZFhvNklza3h3ZDFBR2dVSk4wZCtCSTBSZzhKbXN0c2FFdklpQUhDRDhMeW5MaTVDUndJQzg2VmhqZzcxOUwwcEhSVWFZQkFxWWlGTWNSU2I4ditHWW1ZRUtuaytxSDlFWUVyVis5RENxZEYzeUdFQ1VkL0hmc01MaCsvVHJZMjl2RHhZZ0k3bnk2UXAyRXJVYkt1NHFVUGxZZ1p6TEF3ZHFLWTh6bEQ5WW5rY1E2WEpOVEFUc1pSamtRaCtNcEZaTzJ3TXRMVVZSVUJKTW5UNGFqd2NIME9RSjZmVFdaSGxDbks1SmlhNmxUTitKeWdhWlVtT3VUQ0NoQkczNEpsUFU2ajNqeEFnYXNrNnBaN3NOZFpaZ0VYMTlmbUx2VWwrYkpwNnBJdXJNZ3JWRm1KTkNwQ3hwazZpcVZzbERQUkNEeVBLaDBRZXU4NG1VZE1LRzhzb0xyTVdWS0dTWWg4TUFCdnRHZng5SjlhUXJkK0NGNWI4Tk5ad2VJR2R5L1ZlV2x1QXdiSHBSNkpZTGVZck5Bd3hlMTZUcDhvT0J6SkpOeTQ1YjU5bTNiU2xFSHdpTWpqUjcyNzBzUEFzWC9YQzFmV3ByQno2T0h3bU03YTFKRmgyVGNlK1UwTmlvd2NWamZSQ2dOblU2dGVlTnRMMElpVEsyV2RuanZQclB3OFBBbUpwTUpvWkdSZ2gxOGhnb25DSXlyV1dwNUhJaDNzSVdRY2NNaHd2VlBVQ3cwMUJWb3RGcTRGdjlRL1h0T2RtRWxhSTlpNWsyOUVuRndjRWljTVdNRzc1bVJnSW5PV21VTTBNRUNXMmE5aW1KKzZ1MU5UMDFOQlNjbkovZzFOSlE1bjZWV3h4ano0WnFMSXdSUEdBVjNuZXhBYk5nOEhsUWFEYVNscENyM3hNUks3MWRYWFJkcDFMUFI2RGNJbkVySVZROFlQMzU4RG1KRVJFUUVNTTE2c1c2Q3VsMjNJYTFDWnJSQUZZTXhjOHFVS3FsVUNsT25Ub1hObXpaUkszZzBTTEl5ZXgxVmt3S2VKejFWN28yOUx2K2xwT2pYUnExbUhCWk9SeVFoZEtLWEZuRnpjMHUxdHJhMkR3a0pnWXpjRXBnMDNZc1J4R2ZxVm5hZFY3d1FJbGR3UVhRVm1zQWdvSVR6NTgyRFp5a3A0RDU2Tk0xdHpCaTRoUHN6YzBrVlpNY255bmYrZHF2cGZMbm9WNmxXOHdGV1hZaElSclNUbmlTaU0yeHVibjZheStVT1BuZnVIS1JtRkVGUmFSVk1tZTRKc2JKNllYbWJRYzlGN2NVNFZyYjNFc0M0NGNPb25PUmsyTHQzTCtZQ0xQM2lDNkFiR3FxV1BrN1FYS2lXaE1xMTJoRjRJaUVFbnVrVU9yajBOSkdObHBaVzgyN2Z2cTBqVVY3UlBLUHkrQUw0Y1Bvc0twaWhiYmRabk1VMWdLZTRPSks0aG5PNGNDazhYSk9YbjArUzRPM3R6ZUR5K1ptNENQbGd4blBFVzZVbmlTeGlzVmk3dzhKQ21YbkZFbWdoMGVMZGJjeGY0QkFMREJxd1ZjaFVldmFESWZCa29qdXdLQnBzaVk3VzNsTXFGTjd6NXRINjJkbUJTQ1NDMjNmdTFQQjRQQkYwOHRkalJJeU5qVGZnU2syenNPb05oU1dWN2R4WFYxZEN3b000a0NzVjB0VU9WcnFwdE5EVVdLZno0ZUJCd05CcWF3dUxpa0l2aG9WbHpmZnh5VnIvMVZkSjBiR3haOFJpOFNxZFVpY3VQVVVrMk5IUnFmK1JJMGVvM0NJeGZ2UjR2VU5YNFBIMDZ1VlFTSHAwUDB1bVZDNzdYU0p1L2lUeUtqaEpRd05Zc1RuRkdvMW1xVXdtY3hSTEpDTXJLeXRIWWpIWm5tZmd2VlBTSTBTTWpJd1hCZ2QvenlFdElhbXNhK2M0TXpNZG9pTkRteVRpOHMxWWNBNVV5cUlyejU5RFZIbzZITHA3VnhHWG15dlNzRm5uc2F3UlFhUzlBWkxUQ1hTYmlORFU5R3RuWjJlT3E2c3JkcW1LZGk1bHVEWmN2WHdCYURSR0RoYUVJaUJiS3AxUkl5b051NWVYdDdlMHNYRlhyVnpldTZpdWJqY3A2dzY2VFlUTlpHL2FzOGVmVmxSYUNmSW1uQ1RiUkZOWFh3ZXB5WTgxTmRXU2pXMnlYN3hRS2VaaW1yU1FQOTU3UkxwTHhNZlplYURoaEFrVFFGVFdicjBEalZZRHVkbVpJSk5KVlUxTlRWZDZKTnEzR09rc0ViSlhJcXZxZUxTMWFPaHcxOU1mZk9EK2pNdmxoZUMyZ2hManVHaVF5ckhvdFRRMk5FTGl3M3ZBNC9Gcmg0OXdYNDRsZGdpOXlkdUlrS0JqNkhUNlBUTXo4MXloMENSdWxKdmJMUjhmbjU4K25qN054M253NENFNE5oaCtmbjc0Y2JEZGtVTVhyTHhKaGkyU0FRYUdSaVl5V1dPUTBNUTBpOEZnYUN5dGJOUjk3QndhblFjTlMrN1R6OEVYbFp1M3RQalFIWG1UU0grS29zSnhpeUd4dGJXOTdPazFaK3lGaStIamZvdUw3MzAvNFJucnlQR3pqQ1VyTnNMRWFmTkFqWHZBMmJPOWRMNXI2blZmZTNUUExSZVpWQVo4Z1FFc1c3MkJmdmo0V2ZhRnlEdU1pTmlIMU01OWgyaWozTWZ5aklUR3d5aUFZTE5lRmxYT0xzUFNzTjRNeEh0TEN4RkhPenY3Vzdpb1pYaDRlTXlLanIxcEZuTXIzdmlmbTNZTERNM3RvYnhLQ2lYaWFxaHJrSUVhdDlMRTI4djBOT2pmdi9ta1ZsM2JNbk9Ta21aSXBZMUlWZ1hhVi9va2w4MW1nNzJESXl4ZjdRZTc5aDJHSDg5RTBJT0N6OUF0TFd3R21WdFlYVFFTQ3YySTN2dUFFRmxnTEJTR3pmVDBuRlFzS3FQdDJYK1VVdElNZFlFM0tkcXRYYTMyNVhJWmxKV1Z3eWVmZk5LYTE5RkRXYWtJaklRbUhSVzE1bGxZV3NHbTdmdmc2KzBCSEJPVFhtUWE5bTh0N01JRElUSnZsdGVjdmdlRHZvTUNVUVdVU3RydDZ6bzB4Y0VOM3AzN2o5cXQ0RzhxOG5HanVPL2Z4NEcwd0p0bEhhVUYyQTFkaG85a0dSZ2FUK2lvL0YxNU5MNUE0SFRvNENFRG9raTZEN2wzQmprRjVYQW5JUjErZjV6Wm9icXRiUit3dEh4OXZ1NVE2VlVtVHMrZ1VDaGdvUE5Rd081dGlkbmtCZU90ODBKcmJHZ29pWXU3cTV0MmhqalpkcjdtSzAxWkV6bjd2MHE4eDAycFZJQllYQVljRGdlU0V1NlhGeFhtSjZBWkRhSkxRcGlmMnJCaFE0My9ubjFnWVdZRUU5MmRZY1RnZmpEQXpoS3N6WVZnS09BQ25VN1V1bVMzUTJVVi9vWFcyTmdBVlZWVlVGcGFBdm41dVZCUVVBQ1pMOUlVZ2Y1YlN1L2VqaTNFaWo4anVpd2t3dis4VEgrK2RlZU83YytHdVk0czJSTVFXQytSU0RRMmxrSndIbUFEYmtNZFlPUVFlNkRUaUNwMDY0ZnJDSlNYbDBGRTZDOXc1dVQzRFJoODJhWXZmWE1DOTI1OW1wR2VkaENQSktQUlFSU2l5OUlTM1VtbFV1SDVORG5wNXJZdFgyYzREZWhYeldRd3RFd21xMVlvTkNudGI5OVh6bWFUeGIzTDl2OVF3Y1RVRkdLdWhzT1R4QWRaR1B6eW11cktsU3FWa2hBSVFHVTE0cjJraFFpcFRNNllpL0JoRklKOHdxQ2pBMGM2azNXQnplR3dKWkwyaHlYVWVUL0JiMUpmYnR3RlFGRkRzWVhJREhVZEFONGtnRmxkazdaRTNxeXB4WXhabEZhekt1TFNKUXBuTjB4MlQyUXlHZFRWMVlQUXhCVG16RnRNRXhnYWplbWV4ZGUxMzBhRWFJMVl1V3ExeGhYUEdweHVkQzBsL2l0TFpxYUNnandnS3o2Tm9rQmNKbExqRm9XOExPS24yM2dYRVcxaFVRbUxlT2xyUTNvYmVlbzg2dkU4SWhJVlEyNXV0bTZtNHJBNWtJTW54dE1uRDlmZHZuRXR1YnFxa3V5S08yL3dMWnJ2SW5JNkxPejgwNCttelpEbTVlVkNYMnZUdDVocUxpTGJGN0c0SEFvTEMvRHRTeEdONnZpNFczWG5UaDh2OTF1N3BPU0hJOThtSmp5NGQ2YTJ0b2FNeFpUbVd0Mi92b3ZJZy9yYW1zOSt1eEVUOHVIRThmR085dGFhanllTnFQS2VOU2wzMmVJNUx6NWI0Sm5qdC9ieng4c1d6Y240Nmt2ZlIrUysydmZ2YWNzV3ppNWNzWGgyMldMdmFWa3JsOHdWL1hMcWg5UUhjYmQrcXFtdVdpbVRTdDB3N05XSUhwVjNFU0hPbnFqVjZqVUtoWndNVERwdUpWeXFLaVM3YzdNenR4WVY1RjVNZWZJb0pEY25Nem81OGVFWnZFY1c1T1ZzYldpbyt3YjFSdU1DU041Nlh6UXlEckVSY1JtaEYva3ZBQUFBLy85UmhLb1BBQUFBQmtsRVFWUURBQ00xQTlDTHU4M1NBQUFBQUVsRlRrU3VRbUNDIiB4PSIwIiB5PSIwIiB3aWR0aD0iNTAiIGhlaWdodD0iNDciLz4KPC9zdmc+" width="13" height="12" style="image-rendering:pixelated;vertical-align:middle"/> Relleno`,  '#93c5fd'));
          }
        }
      }
    });
  }
}


/* ── Botón ojo: ocultar/mostrar capa en el canvas (mismo icono que matriz de frames) ── */
function _lyBuildEyeBtn(la) {
  const btn = document.createElement('button');
  btn.className = 'ed-layer-del';
  btn.title = la.hidden ? 'Mostrar capa' : 'Ocultar capa';
  btn.style.opacity = la.hidden ? '0.4' : '';
  btn.textContent = '👁';
  btn.addEventListener('pointerup', e => {
    e.stopPropagation();
    la.hidden = !la.hidden;
    edPushHistory();
    edRedraw();
    _lyRender();
  });
  return btn;
}

/* ── Botón candado: bloquear/desbloquear capa. Mismo icono siempre (una sola tinta);
     opacidad 100% = bloqueada, con transparencia = sin bloquear (igual criterio que el ojo) ── */
function _lyBuildLockBtn(la) {
  const btn = document.createElement('button');
  btn.className = 'ed-layer-del';
  btn.title = la.locked ? 'Desbloquear capa' : 'Bloquear capa';
  btn.style.opacity = la.locked ? '' : '0.4';
  btn.textContent = '🔒';
  btn.addEventListener('pointerup', e => {
    e.stopPropagation();
    la.locked = !la.locked;
    edPushHistory();
    edRedraw();
    _lyRender();
  });
  return btn;
}

/* ──────────────────────────────────────────
   FILA DE TEXTO/BOCADILLO
────────────────────────────────────────── */

/* ── Ítem del panel para un grupo de objetos (lo representa como 1 sola fila) ── */
function _lyBuildGroupItem(groupId, members) {
  // members: [{l, i}] con índices ascendentes (bottom → top en edLayers)
  const memberIdxs = members.map(m => m.i);
  const minGroupIdx = Math.min(...memberIdxs);
  const maxGroupIdx = Math.max(...memberIdxs);

  // ¿Alguno seleccionado?
  const _isSel = members.some(m => m.i === edSelectedIdx) ||
                 (typeof edMultiSel !== 'undefined' && edMultiSel.some(si => memberIdxs.includes(si)));
  const _allHidden = members.every(m => m.l.hidden);

  const item = document.createElement('div');
  item.className = 'ed-layer-item' + (_isSel ? ' selected' : '');
  item.style.cssText = 'position:relative;padding-bottom:22px;border-left:3px solid #a78bfa;';
  if (_allHidden) item.style.opacity = '0.45';
  // dataset para animación FLIP
  item.dataset.realIdx = minGroupIdx;
  const _repLa = members[0]?.l;
  if (_repLa && !_repLa._uid) _repLa._uid = ++_lyUidCounter;
  if (_repLa) item.dataset.uid = 'grp_' + groupId;

  /* Miniatura compuesta */
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb drag-handle';
  thumb.width = 80; thumb.height = 60;
  _lyDrawGroupCompositeThumb(thumb, members);
  thumb.title = 'Grupo · toca para seleccionar';
  thumb.addEventListener('pointerup', () => {
    if (!item.classList.contains('was-dragged')) {
      // Seleccionar el grupo completo: activar _edGroupSilentTool + multiselección
      const ov = document.getElementById('edLayersOverlay');
      const _doSel = () => {
        // 1. Seleccionar el miembro más alto visualmente (mayor índice)
        const _repIdx = members[members.length - 1].i;
        if (typeof edSelectedIdx !== 'undefined') edSelectedIdx = _repIdx;
        // 2. Activar multiselección interna del grupo (igual que al tocar en canvas)
        if (window._edGroupSilentTool === undefined && typeof edActiveTool !== 'undefined') {
          window._edGroupSilentTool = edActiveTool;
        }
        if (typeof _msClear === 'function') { _msClear(); }
        if (typeof edMultiSel !== 'undefined') {
          memberIdxs.forEach(idx => {
            if (!edMultiSel.includes(idx)) edMultiSel.push(idx);
          });
        }
        // 3. Abrir panel del miembro representativo (mostrará botón Desagrupar)
        if (typeof edRedraw === 'function') edRedraw();
        _lyOpenLayerPanel(_repIdx);
      };
      if (ov) {
        ov.classList.remove('open');
        setTimeout(() => { ov.remove(); _lySetCanvasTouch(true); _doSel(); }, 250);
      } else {
        _doSel();
      }
    }
    item.classList.remove('was-dragged');
  });
  const _thumbWrap = document.createElement('div');
  _thumbWrap.style.cssText = 'position:relative;flex-shrink:0;width:80px;height:60px;';
  _thumbWrap.appendChild(thumb);
  item.appendChild(_thumbWrap);

  /* Info */
  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  name.textContent = `⊞ Grupo (${members.length})`;
  info.appendChild(name);
  item.appendChild(info);

  /* Flechas — compactadas (el grupo es 1 entrada) */
  const _cpAll = _lyCompactedVisual();
  const _posInCp = _cpAll.findIndex(e => e.groupId === groupId);

  const upBtn = document.createElement('button');
  upBtn.className = 'ed-layer-arrow';
  upBtn.title = 'Subir grupo';
  upBtn.textContent = '▲';
  upBtn.disabled = _posInCp >= _cpAll.length - 1;
  upBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    _lyReorderGroup(groupId, +1);
  });

  const dnBtn = document.createElement('button');
  dnBtn.className = 'ed-layer-arrow';
  dnBtn.title = 'Bajar grupo';
  dnBtn.textContent = '▼';
  dnBtn.disabled = _posInCp <= 0;
  dnBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    _lyReorderGroup(groupId, -1);
  });

  /* Ojo — afecta a todos los miembros */
  const eyeBtn = document.createElement('button');
  eyeBtn.className = 'ed-layer-del';
  eyeBtn.title = _allHidden ? 'Mostrar grupo' : 'Ocultar grupo';
  eyeBtn.style.opacity = _allHidden ? '0.4' : '';
  eyeBtn.textContent = '👁';
  eyeBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    const _newHide = !_allHidden;
    members.forEach(m => { m.l.hidden = _newHide; });
    if (typeof edPushHistory === 'function') edPushHistory();
    if (typeof edRedraw === 'function') edRedraw();
    _lyRender();
  });

  /* Candado — afecta a todos los miembros y a las sub-capas fill/pencil/watercolor vinculadas */
  const _lockSubIdxs = [];
  memberIdxs.forEach(mi => {
    const _uid = edLayers[mi]?._uid || edLayers[mi]?._fillLayerId;
    if (_uid) {
      edLayers.forEach((sl, si) => {
        if ((sl.type==='fill'||sl.type==='pencil'||sl.type==='watercolor') && sl._drawLayerId===_uid)
          _lockSubIdxs.push(si);
      });
    }
  });
  const _allLocked = members.every(m => m.l.locked) && _lockSubIdxs.every(si => edLayers[si]?.locked);
  const lockBtn = document.createElement('button');
  lockBtn.className = 'ed-layer-del';
  lockBtn.title = _allLocked ? 'Desbloquear grupo' : 'Bloquear grupo';
  lockBtn.style.opacity = _allLocked ? '' : '0.4';
  lockBtn.textContent = '🔒';
  lockBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    const _newLock = !_allLocked;
    members.forEach(m => { m.l.locked = _newLock; });
    _lockSubIdxs.forEach(si => { if (edLayers[si]) edLayers[si].locked = _newLock; });
    if (typeof edPushHistory === 'function') edPushHistory();
    if (typeof edRedraw === 'function') edRedraw();
    _lyRender();
  });

  /* Eliminar grupo */
  const delBtn = document.createElement('button');
  delBtn.className = 'ed-layer-del';
  delBtn.title = 'Eliminar grupo';
  delBtn.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  delBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm(`¿Eliminar el grupo (${members.length} capas)?`, () => {
      // Recoger todos los índices incluyendo sub-capas
      const _toRemove = new Set(memberIdxs);
      memberIdxs.forEach(mi => {
        const _uid = edLayers[mi]?._uid || edLayers[mi]?._fillLayerId;
        if (_uid) {
          edLayers.forEach((sl, si) => {
            if ((sl.type==='fill'||sl.type==='pencil'||sl.type==='watercolor') && sl._drawLayerId===_uid)
              _toRemove.add(si);
          });
        }
      });
      const _sorted = [..._toRemove].sort((a,b) => b-a);
      _sorted.forEach(si => edLayers.splice(si, 1));
      if (typeof edSelectedIdx !== 'undefined' && _toRemove.has(edSelectedIdx)) edSelectedIdx = -1;
      if (typeof edPushHistory === 'function') edPushHistory();
      if (typeof edRedraw === 'function') edRedraw();
      _lyRender();
    });
  });

  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';
  acts.style.cssText = 'position:absolute;bottom:2px;right:4px;display:flex;gap:4px;align-items:center;';
  acts.appendChild(upBtn);
  acts.appendChild(dnBtn);
  acts.appendChild(eyeBtn);
  acts.appendChild(lockBtn);
  acts.appendChild(delBtn);
  item.appendChild(acts);

  /* Drag handle */
  const handle = thumb;
  _lyBindDragGroup(groupId, minGroupIdx, maxGroupIdx, item, handle);

  return item;
}

/** Miniatura compuesta: renderiza todos los miembros en sus posiciones relativas */
function _lyDrawGroupCompositeThumb(canvas, members) {
  const ctx = canvas.getContext('2d');
  const sw = canvas.width, sh = canvas.height;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, sw, sh);
  // Fondo cuadrícula para indicar grupo
  ctx.fillStyle = '#e8e0ff';
  for (let gx = 0; gx < sw; gx += 8)
    for (let gy = gx%16===0?0:8; gy < sh; gy += 16) ctx.fillRect(gx, gy, 8, 8);
  const _pw = typeof edPageW === 'function' ? edPageW() : 360;
  const _ph = typeof edPageH === 'function' ? edPageH() : 780;
  const _mx = typeof edMarginX === 'function' ? edMarginX() : 720;
  const _my = typeof edMarginY === 'function' ? edMarginY() : 780;
  const pad = 4;

  // 1. Bbox union de todos los miembros en coords workspace (sin depender del lienzo)
  let uX0 = Infinity, uY0 = Infinity, uX1 = -Infinity, uY1 = -Infinity;
  [...members].sort((a,b) => a.i - b.i).forEach(({l}) => {
    if ((l.type==='stroke'||l.type==='draw') && l._canvas && !l._isWorkspaceCanvas) {
      const ox = l._bboxOriginX!=null ? l._bboxOriginX : (_mx + l.x*_pw - l.width*_pw/2);
      const oy = l._bboxOriginY!=null ? l._bboxOriginY : (_my + l.y*_ph - l.height*_ph/2);
      uX0=Math.min(uX0,ox); uY0=Math.min(uY0,oy);
      uX1=Math.max(uX1,ox+l._canvas.width); uY1=Math.max(uY1,oy+l._canvas.height);
    } else {
      const cx = _mx + l.x*_pw, cy = _my + l.y*_ph;
      const hw = (l.width||0.1)*_pw/2, hh = (l.height||0.1)*_ph/2;
      uX0=Math.min(uX0,cx-hw); uY0=Math.min(uY0,cy-hh);
      uX1=Math.max(uX1,cx+hw); uY1=Math.max(uY1,cy+hh);
    }
  });
  if (!isFinite(uX0)) { ctx.strokeStyle='#a78bfa';ctx.lineWidth=2;ctx.strokeRect(1,1,sw-2,sh-2); return; }
  const uW = Math.max(1,uX1-uX0), uH = Math.max(1,uY1-uY0);

  // 2. Escala para que el bbox union quepa en el thumb
  const sc = Math.min((sw-pad*2)/uW, (sh-pad*2)/uH);
  const ofx = pad + (sw-pad*2-uW*sc)/2;
  const ofy = pad + (sh-pad*2-uH*sc)/2;
  const wx2t = wx => (wx-uX0)*sc + ofx;
  const wy2t = wy => (wy-uY0)*sc + ofy;

  // 3. Renderizar cada miembro en su posición relativa
  [...members].sort((a,b) => a.i - b.i).forEach(({l}) => {
    ctx.save();
    ctx.globalAlpha = l.opacity ?? 1;
    try {
      if ((l.type==='stroke'||l.type==='draw') && l._canvas && !l._isWorkspaceCanvas) {
        const ox = l._bboxOriginX!=null?l._bboxOriginX:(_mx+l.x*_pw-l.width*_pw/2);
        const oy = l._bboxOriginY!=null?l._bboxOriginY:(_my+l.y*_ph-l.height*_ph/2);
        const dx=wx2t(ox), dy=wy2t(oy), dw=l._canvas.width*sc, dh=l._canvas.height*sc;
        const _uid = l._uid||l._fillLayerId;
        if (typeof edLayers!=='undefined' && _uid) {
          const _fl=edLayers.find(f=>f&&f.type==='fill'       &&f._drawLayerId===_uid);
          const _wc=edLayers.find(f=>f&&f.type==='watercolor' &&f._drawLayerId===_uid);
          const _pc=edLayers.find(f=>f&&f.type==='pencil'     &&f._drawLayerId===_uid);
          if (_fl?._canvas?.width>0&&!_fl._isWorkspaceCanvas) ctx.drawImage(_fl._canvas,dx,dy,dw,dh);
          if (_wc?._canvas?.width>0&&!_wc._isWorkspaceCanvas) ctx.drawImage(_wc._canvas,dx,dy,dw,dh);
          if (_pc?._canvas?.width>0&&!_pc._isWorkspaceCanvas) ctx.drawImage(_pc._canvas,dx,dy,dw,dh);
        }
        ctx.drawImage(l._canvas, dx, dy, dw, dh);
      } else if (l.type==='shape'||l.type==='line') {
        const ED_W = typeof ED_CANVAS_W!=='undefined'?ED_CANVAS_W:1800;
        const ED_H = typeof ED_CANVAS_H!=='undefined'?ED_CANVAS_H:2340;
        const aux = document.createElement('canvas');
        aux.width=ED_W; aux.height=ED_H;
        l.draw(aux.getContext('2d'));
        const cx=_mx+l.x*_pw, cy=_my+l.y*_ph;
        const rot2=(l.rotation||0)*Math.PI/180;
        const cR=Math.abs(Math.cos(rot2)), sR=Math.abs(Math.sin(rot2));
        const bW=l.width*_pw*cR+l.height*_ph*sR+4, bH=l.width*_pw*sR+l.height*_ph*cR+4;
        ctx.drawImage(aux,cx-bW/2,cy-bH/2,bW,bH,wx2t(cx-bW/2),wy2t(cy-bH/2),bW*sc,bH*sc);
      } else {
        const _src = l.type==='gif'?(l._oc&&l._ready?l._oc:null)
                   : (l.type==='image'&&l.img?.complete&&l.img.naturalWidth>0?l.img:null);
        if (_src) {
          const cx=_mx+l.x*_pw, cy=_my+l.y*_ph;
          const hw=(l.width||0.1)*_pw/2, hh=(l.height||0.1)*_ph/2;
          const rot3=(l.rotation||0)*Math.PI/180;
          ctx.translate(wx2t(cx), wy2t(cy));
          ctx.rotate(rot3);
          ctx.drawImage(_src, -hw*sc, -hh*sc, hw*2*sc, hh*2*sc);
        }
      }
    } catch(e) { /* ignora errores de render */ }
    ctx.restore();
  });
  // Marco de grupo
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, sw-2, sh-2);
}
/** Optimización de rendimiento (arrastres para reordenar capas/textos/grupos):
 *  antes, onMove() volvía a consultar el DOM completo (dos querySelectorAll +
 *  un getBoundingClientRect POR ITEM) en CADA pointermove durante el
 *  arrastre. Con muchos objetos/capas esto es "layout thrashing" clásico —
 *  notable sobre todo en Android. Los rects no cambian durante un arrastre
 *  de reordenar (el resaltado 'drag-over' no afecta al layout), así que se
 *  capturan UNA vez al empezar a arrastrar y se reutilizan en cada movimiento. */
function _lySnapshotDragItems(selector, excludeEl) {
  return [...document.querySelectorAll(selector)]
    .filter(el => el !== excludeEl)
    .map(el => ({ el, rect: el.getBoundingClientRect() }));
}
/** Drag-and-drop para el ítem de grupo */
function _lyBindDragGroup(groupId, minIdx, maxIdx, item, handle) {
  let startY, active = false;
  let _lyDragOverGrp = null;
  let _snap = null;        // snapshot de items+rects, capturado al iniciar el arrastre
  let _highlighted = null; // elemento actualmente resaltado con 'drag-over'
  function end() {
    if (!active) return;
    active = false;
    item.classList.remove('dragging');
    if (_highlighted) { _highlighted.classList.remove('drag-over'); _highlighted = null; }
    _snap = null;
    if (_lyDragOverGrp !== null) {
      const _destGid = edLayers[_lyDragOverGrp]?.groupId;
      if (!_destGid || _destGid !== groupId) {
        const _dir = _lyDragOverGrp > maxIdx ? +1 : (_lyDragOverGrp < minIdx ? -1 : 0);
        if (_dir !== 0) {
          item.classList.add('was-dragged');
          _lyReorderGroup(groupId, _dir);
        }
      }
    }
    _lyDragOverGrp = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }
  function onMove(y) {
    if (!active || !_snap) return;
    const target = _snap.find(s => y >= s.rect.top && y <= s.rect.bottom);
    const targetEl = target ? target.el : null;
    if (targetEl !== _highlighted) {
      if (_highlighted) _highlighted.classList.remove('drag-over');
      if (targetEl) targetEl.classList.add('drag-over');
      _highlighted = targetEl;
    }
    _lyDragOverGrp = targetEl ? parseInt(targetEl.dataset.realIdx) : null;
  }
  function onPointerMove(e) { onMove(e.clientY); }
  function onPointerUp() { end(); }
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    startY = e.clientY;
    active = false;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    function checkStart(ev) {
      if (Math.abs(ev.clientY - startY) > 4) {
        active = true;
        item.classList.add('dragging');
        _snap = _lySnapshotDragItems('.ed-layer-item', item);
        window.removeEventListener('pointermove', checkStart);
      }
    }
    window.addEventListener('pointermove', checkStart);
  });
}

/* -- Sub-fila genérica para capas del grupo (fill/pencil/watercolor) en el panel de capas -- */
function _lyBuildGroupSubRow(la, realIdx, label, borderColor) {
  const row = document.createElement('div');
  row.className = 'ed-layer-item';
  row.style.cssText = 'margin-left:18px;border-style:dashed;border-color:'+borderColor+';opacity:'+(la.hidden?'0.45':'1')+';';
  row.dataset.realIdx = realIdx;

  // Miniatura
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb';
  thumb.width = 80; thumb.height = 60;
  const tctx = thumb.getContext('2d');
  tctx.fillStyle = '#f0f8ff';
  tctx.fillRect(0, 0, 80, 60);
  if (la._canvas && la._canvas.width > 0) {
    const pad = 3;
    if (!la._isWorkspaceCanvas) {
      // Canvas recortado al bbox del contenido: escalar directamente al thumb
      const cw = la._canvas.width, ch = la._canvas.height;
      const sc = Math.min((80-pad*2)/cw, (60-pad*2)/ch);
      const dx = pad + (80-pad*2-cw*sc)/2, dy = pad + (60-pad*2-ch*sc)/2;
      tctx.drawImage(la._canvas, dx, dy, cw*sc, ch*sc);
    } else {
      // Canvas workspace completo: buscar bbox real del contenido
      const _bb = (typeof StrokeLayer!=='undefined' && StrokeLayer._boundingBox)
        ? StrokeLayer._boundingBox(la._canvas) : null;
      if (_bb && _bb.w > 0 && _bb.h > 0) {
        const sc = Math.min((80-pad*2)/_bb.w, (60-pad*2)/_bb.h);
        const dx = pad+(80-pad*2-_bb.w*sc)/2, dy = pad+(60-pad*2-_bb.h*sc)/2;
        tctx.drawImage(la._canvas, _bb.x, _bb.y, _bb.w, _bb.h, dx, dy, _bb.w*sc, _bb.h*sc);
      }
    }
  }
  tctx.strokeStyle = borderColor; tctx.lineWidth = 2;
  tctx.setLineDash([4,3]); tctx.strokeRect(1,1,78,58); tctx.setLineDash([]);
  row.appendChild(thumb);

  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  name.innerHTML = label;
  info.appendChild(name); row.appendChild(info);

  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';

  const eyeBtn = document.createElement('button');
  eyeBtn.className = 'ed-layer-del';
  eyeBtn.textContent = '👁';
  eyeBtn.style.opacity = la.hidden ? '0.4' : '';
  eyeBtn.title = la.hidden ? 'Mostrar' : 'Ocultar';
  eyeBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    la.hidden = !la.hidden;
    edPushHistory();
    edRedraw(); _lyRender();
  });
  acts.appendChild(eyeBtn);

  const clrBtn = document.createElement('button');
  clrBtn.className = 'ed-layer-del';
  clrBtn.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  clrBtn.title = 'Eliminar esta sub-capa';
  clrBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm('¿Eliminar esta sub-capa?', () => {
      const _flIdx = edLayers.indexOf(la);
      if (_flIdx >= 0) edLayers.splice(_flIdx, 1);
      const _pair = edLayers.find(l => l._uid && (l._fillLayerId===la._drawLayerId ||
                                                    l._pencilLayerId===la._drawLayerId ||
                                                    l._watercolorLayerId===la._drawLayerId));
      if (_pair) {
        if (la.type==='fill')       delete _pair._fillLayerId;
        if (la.type==='pencil')     delete _pair._pencilLayerId;
        if (la.type==='watercolor') delete _pair._watercolorLayerId;
      }
      edPushHistory(); edRedraw(); _lyRender();
    });
  });
  acts.appendChild(clrBtn);
  row.appendChild(acts);
  return row;
}

/* -- Sub-fila del FillLayer en el panel de capas (alias por compatibilidad) -- */
function _lyBuildFillSubRow(la, realIdx) {
  return _lyBuildGroupSubRow(la, realIdx, `<img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIgogICAgIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMiIgdmlld0JveD0iMCAwIDUwIDQ3Ij4KICA8aW1hZ2UgaHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFESUFBQUF2Q0FZQUFBQ2hkNW4wQUFBTS9FbEVRVlI0QWN4WkIxaFVWeFkrYjNxakRDQlZGRUhCUlVWRkpWald0V3hpaVlpb0cxd05saVRZZFkwcmlXV3RFWldJV1d6QmFHU2pKaG9WRUZFcGxxaG9SRVFFQlVWNkhjb012Y3dNVS9mY1FSQU1xeURNOSsxODUzL3YzWHZQUGVmODcvWTNOUGovK3ZYRmNHWWpkdmNSR0NZYnNkbHlTd05EMVNRYlc5a29zMTdGRmx4ZW5vbUJ3WDRzLzRQb2s4aGs5TFo0Y08vZVYwWVpHSi9BWjJkRVc3SEJ4RXpFVG5NTzU3NGhrMWx2eHVGa1RIVVljRzY3cDllV3cwdVhEMHNMREdLWEJKK2czd3dJNUNRRUhiRzV1bm1yM2JnQlRodUdBdjBZMW1zbnRIYXBua3RzWTlCb3NYTmRSNTZZNGpKc3h1alI3bDl3bWN6N1FwN2dtTDJ4U2FJSmg5Tmd3dVhtZitRNE1HeUxoK2UyNE9XcnhqNExEQktJZnp6Rmp0cTVtN1Y5OGhUdzRBckFwa3dDa0o0Qm9GTHBJaHZSeng3T3J2NEhOQm53LzRZWjR4R3RvZzhpZ3l6Wm5KM0ZSNDdSTDZ6M1kreWY3d05CdmUxQktCQUlQVnhITE51M2NOSElSM3UrNVZlYytJa1JzM1U3NHh2M2NlQWxWME9mMk5zQSs3NERhc1U2b05iNkFlVy8velY4MXdEMXcwbUFyQnpnc1ZndzFXV29BUU5nV2lzTGZOQUhFYnZlWEY2dFJVWTJWQWQ4QjFzLzlkRk12eGxWTWdyb01Kek9nTG5GNWVCd05neW85WnVBOGxrSzFKWmRRQjA3Q1ZSVUxGQnBMd0RxR3pDc04wU3BCTGdYRHhRU0pTMjBaTVpNSnAvQlhOVldTeDlFS3FxYTVIbktnOEd3UERNdC84NUlGOG4wRGV1dEg4aGw5VkYzN3dBVmZnWGc4Uk1BTVhhYnRwRjA1cm1wU2RkS1E3UVV1RmhhWWFPQWQwczFmUkJKeUpOSks2NkJDaFRHUm5ZVHAwNjFXTE5tRGF6ZjlpK0RGQmFqVVF6YUZ0L3ZmYWMyN3dSZmo1bGNHNzVnUzRzUmZSQWhvVjQ5RGNyaUNlV1ZjRFR3Z0NZckt3czJidHdJUHF0WFNXY3lWWlV0enJ0ejk3bHhENlFhdFRQYUdJZ0F2UkJCdzlkaVFXV3dEbGl3V2E2aHpaLytzUlR6NE1DQkE3M00vanBSdVFoa05TVGRMV1RuZ29mVG43UTRPeTRoZHZSRkpGc0RVQlFIYXRpQVpGeXk4M2tMUEdkVkU0ZFhvNklza3h3ZDFBR2dVSk4wZCtCSTBSZzhKbXN0c2FFdklpQUhDRDhMeW5MaTVDUndJQzg2VmhqZzcxOUwwcEhSVWFZQkFxWWlGTWNSU2I4ditHWW1ZRUtuaytxSDlFWUVyVis5RENxZEYzeUdFQ1VkL0hmc01MaCsvVHJZMjl2RHhZZ0k3bnk2UXAyRXJVYkt1NHFVUGxZZ1p6TEF3ZHFLWTh6bEQ5WW5rY1E2WEpOVEFUc1pSamtRaCtNcEZaTzJ3TXRMVVZSVUJKTW5UNGFqd2NIME9RSjZmVFdaSGxDbks1SmlhNmxUTitKeWdhWlVtT3VUQ0NoQkczNEpsUFU2ajNqeEFnYXNrNnBaN3NOZFpaZ0VYMTlmbUx2VWwrYkpwNnBJdXJNZ3JWRm1KTkNwQ3hwazZpcVZzbERQUkNEeVBLaDBRZXU4NG1VZE1LRzhzb0xyTVdWS0dTWWg4TUFCdnRHZng5SjlhUXJkK0NGNWI4Tk5ad2VJR2R5L1ZlV2x1QXdiSHBSNkpZTGVZck5Bd3hlMTZUcDhvT0J6SkpOeTQ1YjU5bTNiU2xFSHdpTWpqUjcyNzBzUEFzWC9YQzFmV3ByQno2T0h3bU03YTFKRmgyVGNlK1UwTmlvd2NWamZSQ2dOblU2dGVlTnRMMElpVEsyV2RuanZQclB3OFBBbUpwTUpvWkdSZ2gxOGhnb25DSXlyV1dwNUhJaDNzSVdRY2NNaHd2VlBVQ3cwMUJWb3RGcTRGdjlRL1h0T2RtRWxhSTlpNWsyOUVuRndjRWljTVdNRzc1bVJnSW5PV21VTTBNRUNXMmE5aW1KKzZ1MU5UMDFOQlNjbkovZzFOSlE1bjZWV3h4ano0WnFMSXdSUEdBVjNuZXhBYk5nOEhsUWFEYVNscENyM3hNUks3MWRYWFJkcDFMUFI2RGNJbkVySVZROFlQMzU4RG1KRVJFUUVNTTE2c1c2Q3VsMjNJYTFDWnJSQUZZTXhjOHFVS3FsVUNsT25Ub1hObXpaUkszZzBTTEl5ZXgxVmt3S2VKejFWN28yOUx2K2xwT2pYUnExbUhCWk9SeVFoZEtLWEZuRnpjMHUxdHJhMkR3a0pnWXpjRXBnMDNZc1J4R2ZxVm5hZFY3d1FJbGR3UVhRVm1zQWdvSVR6NTgyRFp5a3A0RDU2Tk0xdHpCaTRoUHN6YzBrVlpNY255bmYrZHF2cGZMbm9WNmxXOHdGV1hZaElSclNUbmlTaU0yeHVibjZheStVT1BuZnVIS1JtRkVGUmFSVk1tZTRKc2JKNllYbWJRYzlGN2NVNFZyYjNFc0M0NGNPb25PUmsyTHQzTCtZQ0xQM2lDNkFiR3FxV1BrN1FYS2lXaE1xMTJoRjRJaUVFbnVrVU9yajBOSkdObHBaVzgyN2Z2cTBqVVY3UlBLUHkrQUw0Y1Bvc0twaWhiYmRabk1VMWdLZTRPSks0aG5PNGNDazhYSk9YbjArUzRPM3R6ZUR5K1ptNENQbGd4blBFVzZVbmlTeGlzVmk3dzhKQ21YbkZFbWdoMGVMZGJjeGY0QkFMREJxd1ZjaFVldmFESWZCa29qdXdLQnBzaVk3VzNsTXFGTjd6NXRINjJkbUJTQ1NDMjNmdTFQQjRQQkYwOHRkalJJeU5qVGZnU2syenNPb05oU1dWN2R4WFYxZEN3b000a0NzVjB0VU9WcnFwdE5EVVdLZno0ZUJCd05CcWF3dUxpa0l2aG9WbHpmZnh5VnIvMVZkSjBiR3haOFJpOFNxZFVpY3VQVVVrMk5IUnFmK1JJMGVvM0NJeGZ2UjR2VU5YNFBIMDZ1VlFTSHAwUDB1bVZDNzdYU0p1L2lUeUtqaEpRd05Zc1RuRkdvMW1xVXdtY3hSTEpDTXJLeXRIWWpIWm5tZmd2VlBTSTBTTWpJd1hCZ2QvenlFdElhbXNhK2M0TXpNZG9pTkRteVRpOHMxWWNBNVV5cUlyejU5RFZIbzZITHA3VnhHWG15dlNzRm5uc2F3UlFhUzlBWkxUQ1hTYmlORFU5R3RuWjJlT3E2c3JkcW1LZGk1bHVEWmN2WHdCYURSR0RoYUVJaUJiS3AxUkl5b051NWVYdDdlMHNYRlhyVnpldTZpdWJqY3A2dzY2VFlUTlpHL2FzOGVmVmxSYUNmSW1uQ1RiUkZOWFh3ZXB5WTgxTmRXU2pXMnlYN3hRS2VaaW1yU1FQOTU3UkxwTHhNZlplYURoaEFrVFFGVFdicjBEalZZRHVkbVpJSk5KVlUxTlRWZDZKTnEzR09rc0ViSlhJcXZxZUxTMWFPaHcxOU1mZk9EK2pNdmxoZUMyZ2hManVHaVF5ckhvdFRRMk5FTGl3M3ZBNC9Gcmg0OXdYNDRsZGdpOXlkdUlrS0JqNkhUNlBUTXo4MXloMENSdWxKdmJMUjhmbjU4K25qN054M253NENFNE5oaCtmbjc0Y2JEZGtVTVhyTHhKaGkyU0FRYUdSaVl5V1dPUTBNUTBpOEZnYUN5dGJOUjk3QndhblFjTlMrN1R6OEVYbFp1M3RQalFIWG1UU0grS29zSnhpeUd4dGJXOTdPazFaK3lGaStIamZvdUw3MzAvNFJucnlQR3pqQ1VyTnNMRWFmTkFqWHZBMmJPOWRMNXI2blZmZTNUUExSZVpWQVo4Z1FFc1c3MkJmdmo0V2ZhRnlEdU1pTmlIMU01OWgyaWozTWZ5aklUR3d5aUFZTE5lRmxYT0xzUFNzTjRNeEh0TEN4RkhPenY3Vzdpb1pYaDRlTXlLanIxcEZuTXIzdmlmbTNZTERNM3RvYnhLQ2lYaWFxaHJrSUVhdDlMRTI4djBOT2pmdi9ta1ZsM2JNbk9Ta21aSXBZMUlWZ1hhVi9va2w4MW1nNzJESXl4ZjdRZTc5aDJHSDg5RTBJT0N6OUF0TFd3R21WdFlYVFFTQ3YySTN2dUFFRmxnTEJTR3pmVDBuRlFzS3FQdDJYK1VVdElNZFlFM0tkcXRYYTMyNVhJWmxKV1Z3eWVmZk5LYTE5RkRXYWtJaklRbUhSVzE1bGxZV3NHbTdmdmc2KzBCSEJPVFhtUWE5bTh0N01JRElUSnZsdGVjdmdlRHZvTUNVUVdVU3RydDZ6bzB4Y0VOM3AzN2o5cXQ0RzhxOG5HanVPL2Z4NEcwd0p0bEhhVUYyQTFkaG85a0dSZ2FUK2lvL0YxNU5MNUE0SFRvNENFRG9raTZEN2wzQmprRjVYQW5JUjErZjV6Wm9icXRiUit3dEh4OXZ1NVE2VlVtVHMrZ1VDaGdvUE5Rd081dGlkbmtCZU90ODBKcmJHZ29pWXU3cTV0MmhqalpkcjdtSzAxWkV6bjd2MHE4eDAycFZJQllYQVljRGdlU0V1NlhGeFhtSjZBWkRhSkxRcGlmMnJCaFE0My9ubjFnWVdZRUU5MmRZY1RnZmpEQXpoS3N6WVZnS09BQ25VN1V1bVMzUTJVVi9vWFcyTmdBVlZWVlVGcGFBdm41dVZCUVVBQ1pMOUlVZ2Y1YlN1L2VqaTNFaWo4anVpd2t3dis4VEgrK2RlZU83YytHdVk0czJSTVFXQytSU0RRMmxrSndIbUFEYmtNZFlPUVFlNkRUaUNwMDY0ZnJDSlNYbDBGRTZDOXc1dVQzRFJoODJhWXZmWE1DOTI1OW1wR2VkaENQSktQUlFSU2l5OUlTM1VtbFV1SDVORG5wNXJZdFgyYzREZWhYeldRd3RFd21xMVlvTkNudGI5OVh6bWFUeGIzTDl2OVF3Y1RVRkdLdWhzT1R4QWRaR1B6eW11cktsU3FWa2hBSVFHVTE0cjJraFFpcFRNNllpL0JoRklKOHdxQ2pBMGM2azNXQnplR3dKWkwyaHlYVWVUL0JiMUpmYnR3RlFGRkRzWVhJREhVZEFONGtnRmxkazdaRTNxeXB4WXhabEZhekt1TFNKUXBuTjB4MlQyUXlHZFRWMVlQUXhCVG16RnRNRXhnYWplbWV4ZGUxMzBhRWFJMVl1V3ExeGhYUEdweHVkQzBsL2l0TFpxYUNnandnS3o2Tm9rQmNKbExqRm9XOExPS24yM2dYRVcxaFVRbUxlT2xyUTNvYmVlbzg2dkU4SWhJVlEyNXV0bTZtNHJBNWtJTW54dE1uRDlmZHZuRXR1YnFxa3V5S08yL3dMWnJ2SW5JNkxPejgwNCttelpEbTVlVkNYMnZUdDVocUxpTGJGN0c0SEFvTEMvRHRTeEdONnZpNFczWG5UaDh2OTF1N3BPU0hJOThtSmp5NGQ2YTJ0b2FNeFpUbVd0Mi92b3ZJZy9yYW1zOSt1eEVUOHVIRThmR085dGFhanllTnFQS2VOU2wzMmVJNUx6NWI0Sm5qdC9ieng4c1d6Y240Nmt2ZlIrUysydmZ2YWNzV3ppNWNzWGgyMldMdmFWa3JsOHdWL1hMcWg5UUhjYmQrcXFtdVdpbVRTdDB3N05XSUhwVjNFU0hPbnFqVjZqVUtoWndNVERwdUpWeXFLaVM3YzdNenR4WVY1RjVNZWZJb0pEY25Nem81OGVFWnZFY1c1T1ZzYldpbyt3YjFSdU1DU041Nlh6UXlEckVSY1JtaEYva3ZBQUFBLy85UmhLb1BBQUFBQmtsRVFWUURBQ00xQTlDTHU4M1NBQUFBQUVsRlRrU3VRbUNDIiB4PSIwIiB5PSIwIiB3aWR0aD0iNTAiIGhlaWdodD0iNDciLz4KPC9zdmc+" width="13" height="12" style="image-rendering:pixelated;vertical-align:middle"/> Relleno`, '#93c5fd');
}

/* -- Sub-fila real (conservada por si se usa desde algún otro lugar) -- */
function _lyBuildFillSubRowOld(la, realIdx) {
  const row = document.createElement('div');
  row.className = 'ed-layer-item';
  row.style.cssText = 'margin-left:18px;border-style:dashed;border-color:#93c5fd;opacity:'+(la.hidden?'0.45':'1')+';';
  row.dataset.realIdx = realIdx;

  // Miniatura
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb';
  thumb.width = 80; thumb.height = 60;
  const tctx = thumb.getContext('2d');
  tctx.fillStyle = '#f0f8ff';
  tctx.fillRect(0, 0, 80, 60);
  if (la._canvas && la._canvas.width > 0) {
    const pw = (typeof edPageW==='function')?edPageW():800;
    const ph = (typeof edPageH==='function')?edPageH():1100;
    const mx = (typeof edMarginX==='function')?edMarginX():0;
    const my = (typeof edMarginY==='function')?edMarginY():0;
    // Usar draw() que maneja tanto canvas workspace como canvas local (bbox)
    // Escalar para que la página entera quepa en el thumb 80×60
    const _sc = Math.min(80 / pw, 60 / ph);
    const _ox = (80 - pw * _sc) / 2, _oy = (60 - ph * _sc) / 2;
    tctx.save();
    // Escala uniforme con centrado — preserva ratio de la página
    tctx.setTransform(_sc, 0, 0, _sc, -mx * _sc + _ox, -my * _sc + _oy);
    if (typeof la.draw === 'function') la.draw(tctx);
    tctx.restore();
  }
  tctx.strokeStyle = '#93c5fd'; tctx.lineWidth = 2;
  tctx.setLineDash([4,3]); tctx.strokeRect(1,1,78,58); tctx.setLineDash([]);
  row.appendChild(thumb);

  // Nombre
  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  name.textContent = `<img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIgogICAgIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMiIgdmlld0JveD0iMCAwIDUwIDQ3Ij4KICA8aW1hZ2UgaHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFESUFBQUF2Q0FZQUFBQ2hkNW4wQUFBTS9FbEVRVlI0QWN4WkIxaFVWeFkrYjNxakRDQlZGRUhCUlVWRkpWald0V3hpaVlpb0cxd05saVRZZFkwcmlXV3RFWldJV1d6QmFHU2pKaG9WRUZFcGxxaG9SRVFFQlVWNkhjb012Y3dNVS9mY1FSQU1xeURNOSsxODUzL3YzWHZQUGVmODcvWTNOUGovK3ZYRmNHWWpkdmNSR0NZYnNkbHlTd05EMVNRYlc5a29zMTdGRmx4ZW5vbUJ3WDRzLzRQb2s4aGs5TFo0Y08vZVYwWVpHSi9BWjJkRVc3SEJ4RXpFVG5NTzU3NGhrMWx2eHVGa1RIVVljRzY3cDllV3cwdVhEMHNMREdLWEJKK2czd3dJNUNRRUhiRzV1bm1yM2JnQlRodUdBdjBZMW1zbnRIYXBua3RzWTlCb3NYTmRSNTZZNGpKc3h1alI3bDl3bWN6N1FwN2dtTDJ4U2FJSmg5Tmd3dVhtZitRNE1HeUxoK2UyNE9XcnhqNExEQktJZnp6Rmp0cTVtN1Y5OGhUdzRBckFwa3dDa0o0Qm9GTHBJaHZSeng3T3J2NEhOQm53LzRZWjR4R3RvZzhpZ3l6Wm5KM0ZSNDdSTDZ6M1kreWY3d05CdmUxQktCQUlQVnhITE51M2NOSElSM3UrNVZlYytJa1JzM1U3NHh2M2NlQWxWME9mMk5zQSs3NERhc1U2b05iNkFlVy8velY4MXdEMXcwbUFyQnpnc1ZndzFXV29BUU5nV2lzTGZOQUhFYnZlWEY2dFJVWTJWQWQ4QjFzLzlkRk12eGxWTWdyb01Kek9nTG5GNWVCd05neW85WnVBOGxrSzFKWmRRQjA3Q1ZSVUxGQnBMd0RxR3pDc04wU3BCTGdYRHhRU0pTMjBaTVpNSnAvQlhOVldTeDlFS3FxYTVIbktnOEd3UERNdC84NUlGOG4wRGV1dEg4aGw5VkYzN3dBVmZnWGc4Uk1BTVhhYnRwRjA1cm1wU2RkS1E3UVV1RmhhWWFPQWQwczFmUkJKeUpOSks2NkJDaFRHUm5ZVHAwNjFXTE5tRGF6ZjlpK0RGQmFqVVF6YUZ0L3ZmYWMyN3dSZmo1bGNHNzVnUzRzUmZSQWhvVjQ5RGNyaUNlV1ZjRFR3Z0NZckt3czJidHdJUHF0WFNXY3lWWlV0enJ0ejk3bHhENlFhdFRQYUdJZ0F2UkJCdzlkaVFXV3dEbGl3V2E2aHpaLytzUlR6NE1DQkE3M00vanBSdVFoa05TVGRMV1RuZ29mVG43UTRPeTRoZHZSRkpGc0RVQlFIYXRpQVpGeXk4M2tMUEdkVkU0ZFhvNklza3h3ZDFBR2dVSk4wZCtCSTBSZzhKbXN0c2FFdklpQUhDRDhMeW5MaTVDUndJQzg2VmhqZzcxOUwwcEhSVWFZQkFxWWlGTWNSU2I4ditHWW1ZRUtuaytxSDlFWUVyVis5RENxZEYzeUdFQ1VkL0hmc01MaCsvVHJZMjl2RHhZZ0k3bnk2UXAyRXJVYkt1NHFVUGxZZ1p6TEF3ZHFLWTh6bEQ5WW5rY1E2WEpOVEFUc1pSamtRaCtNcEZaTzJ3TXRMVVZSVUJKTW5UNGFqd2NIME9RSjZmVFdaSGxDbks1SmlhNmxUTitKeWdhWlVtT3VUQ0NoQkczNEpsUFU2ajNqeEFnYXNrNnBaN3NOZFpaZ0VYMTlmbUx2VWwrYkpwNnBJdXJNZ3JWRm1KTkNwQ3hwazZpcVZzbERQUkNEeVBLaDBRZXU4NG1VZE1LRzhzb0xyTVdWS0dTWWg4TUFCdnRHZng5SjlhUXJkK0NGNWI4Tk5ad2VJR2R5L1ZlV2x1QXdiSHBSNkpZTGVZck5Bd3hlMTZUcDhvT0J6SkpOeTQ1YjU5bTNiU2xFSHdpTWpqUjcyNzBzUEFzWC9YQzFmV3ByQno2T0h3bU03YTFKRmgyVGNlK1UwTmlvd2NWamZSQ2dOblU2dGVlTnRMMElpVEsyV2RuanZQclB3OFBBbUpwTUpvWkdSZ2gxOGhnb25DSXlyV1dwNUhJaDNzSVdRY2NNaHd2VlBVQ3cwMUJWb3RGcTRGdjlRL1h0T2RtRWxhSTlpNWsyOUVuRndjRWljTVdNRzc1bVJnSW5PV21VTTBNRUNXMmE5aW1KKzZ1MU5UMDFOQlNjbkovZzFOSlE1bjZWV3h4ano0WnFMSXdSUEdBVjNuZXhBYk5nOEhsUWFEYVNscENyM3hNUks3MWRYWFJkcDFMUFI2RGNJbkVySVZROFlQMzU4RG1KRVJFUUVNTTE2c1c2Q3VsMjNJYTFDWnJSQUZZTXhjOHFVS3FsVUNsT25Ub1hObXpaUkszZzBTTEl5ZXgxVmt3S2VKejFWN28yOUx2K2xwT2pYUnExbUhCWk9SeVFoZEtLWEZuRnpjMHUxdHJhMkR3a0pnWXpjRXBnMDNZc1J4R2ZxVm5hZFY3d1FJbGR3UVhRVm1zQWdvSVR6NTgyRFp5a3A0RDU2Tk0xdHpCaTRoUHN6YzBrVlpNY255bmYrZHF2cGZMbm9WNmxXOHdGV1hZaElSclNUbmlTaU0yeHVibjZheStVT1BuZnVIS1JtRkVGUmFSVk1tZTRKc2JKNllYbWJRYzlGN2NVNFZyYjNFc0M0NGNPb25PUmsyTHQzTCtZQ0xQM2lDNkFiR3FxV1BrN1FYS2lXaE1xMTJoRjRJaUVFbnVrVU9yajBOSkdObHBaVzgyN2Z2cTBqVVY3UlBLUHkrQUw0Y1Bvc0twaWhiYmRabk1VMWdLZTRPSks0aG5PNGNDazhYSk9YbjArUzRPM3R6ZUR5K1ptNENQbGd4blBFVzZVbmlTeGlzVmk3dzhKQ21YbkZFbWdoMGVMZGJjeGY0QkFMREJxd1ZjaFVldmFESWZCa29qdXdLQnBzaVk3VzNsTXFGTjd6NXRINjJkbUJTQ1NDMjNmdTFQQjRQQkYwOHRkalJJeU5qVGZnU2syenNPb05oU1dWN2R4WFYxZEN3b000a0NzVjB0VU9WcnFwdE5EVVdLZno0ZUJCd05CcWF3dUxpa0l2aG9WbHpmZnh5VnIvMVZkSjBiR3haOFJpOFNxZFVpY3VQVVVrMk5IUnFmK1JJMGVvM0NJeGZ2UjR2VU5YNFBIMDZ1VlFTSHAwUDB1bVZDNzdYU0p1L2lUeUtqaEpRd05Zc1RuRkdvMW1xVXdtY3hSTEpDTXJLeXRIWWpIWm5tZmd2VlBTSTBTTWpJd1hCZ2QvenlFdElhbXNhK2M0TXpNZG9pTkRteVRpOHMxWWNBNVV5cUlyejU5RFZIbzZITHA3VnhHWG15dlNzRm5uc2F3UlFhUzlBWkxUQ1hTYmlORFU5R3RuWjJlT3E2c3JkcW1LZGk1bHVEWmN2WHdCYURSR0RoYUVJaUJiS3AxUkl5b051NWVYdDdlMHNYRlhyVnpldTZpdWJqY3A2dzY2VFlUTlpHL2FzOGVmVmxSYUNmSW1uQ1RiUkZOWFh3ZXB5WTgxTmRXU2pXMnlYN3hRS2VaaW1yU1FQOTU3UkxwTHhNZlplYURoaEFrVFFGVFdicjBEalZZRHVkbVpJSk5KVlUxTlRWZDZKTnEzR09rc0ViSlhJcXZxZUxTMWFPaHcxOU1mZk9EK2pNdmxoZUMyZ2hManVHaVF5ckhvdFRRMk5FTGl3M3ZBNC9Gcmg0OXdYNDRsZGdpOXlkdUlrS0JqNkhUNlBUTXo4MXloMENSdWxKdmJMUjhmbjU4K25qN054M253NENFNE5oaCtmbjc0Y2JEZGtVTVhyTHhKaGkyU0FRYUdSaVl5V1dPUTBNUTBpOEZnYUN5dGJOUjk3QndhblFjTlMrN1R6OEVYbFp1M3RQalFIWG1UU0grS29zSnhpeUd4dGJXOTdPazFaK3lGaStIamZvdUw3MzAvNFJucnlQR3pqQ1VyTnNMRWFmTkFqWHZBMmJPOWRMNXI2blZmZTNUUExSZVpWQVo4Z1FFc1c3MkJmdmo0V2ZhRnlEdU1pTmlIMU01OWgyaWozTWZ5aklUR3d5aUFZTE5lRmxYT0xzUFNzTjRNeEh0TEN4RkhPenY3Vzdpb1pYaDRlTXlLanIxcEZuTXIzdmlmbTNZTERNM3RvYnhLQ2lYaWFxaHJrSUVhdDlMRTI4djBOT2pmdi9ta1ZsM2JNbk9Ta21aSXBZMUlWZ1hhVi9va2w4MW1nNzJESXl4ZjdRZTc5aDJHSDg5RTBJT0N6OUF0TFd3R21WdFlYVFFTQ3YySTN2dUFFRmxnTEJTR3pmVDBuRlFzS3FQdDJYK1VVdElNZFlFM0tkcXRYYTMyNVhJWmxKV1Z3eWVmZk5LYTE5RkRXYWtJaklRbUhSVzE1bGxZV3NHbTdmdmc2KzBCSEJPVFhtUWE5bTh0N01JRElUSnZsdGVjdmdlRHZvTUNVUVdVU3RydDZ6bzB4Y0VOM3AzN2o5cXQ0RzhxOG5HanVPL2Z4NEcwd0p0bEhhVUYyQTFkaG85a0dSZ2FUK2lvL0YxNU5MNUE0SFRvNENFRG9raTZEN2wzQmprRjVYQW5JUjErZjV6Wm9icXRiUit3dEh4OXZ1NVE2VlVtVHMrZ1VDaGdvUE5Rd081dGlkbmtCZU90ODBKcmJHZ29pWXU3cTV0MmhqalpkcjdtSzAxWkV6bjd2MHE4eDAycFZJQllYQVljRGdlU0V1NlhGeFhtSjZBWkRhSkxRcGlmMnJCaFE0My9ubjFnWVdZRUU5MmRZY1RnZmpEQXpoS3N6WVZnS09BQ25VN1V1bVMzUTJVVi9vWFcyTmdBVlZWVlVGcGFBdm41dVZCUVVBQ1pMOUlVZ2Y1YlN1L2VqaTNFaWo4anVpd2t3dis4VEgrK2RlZU83YytHdVk0czJSTVFXQytSU0RRMmxrSndIbUFEYmtNZFlPUVFlNkRUaUNwMDY0ZnJDSlNYbDBGRTZDOXc1dVQzRFJoODJhWXZmWE1DOTI1OW1wR2VkaENQSktQUlFSU2l5OUlTM1VtbFV1SDVORG5wNXJZdFgyYzREZWhYeldRd3RFd21xMVlvTkNudGI5OVh6bWFUeGIzTDl2OVF3Y1RVRkdLdWhzT1R4QWRaR1B6eW11cktsU3FWa2hBSVFHVTE0cjJraFFpcFRNNllpL0JoRklKOHdxQ2pBMGM2azNXQnplR3dKWkwyaHlYVWVUL0JiMUpmYnR3RlFGRkRzWVhJREhVZEFONGtnRmxkazdaRTNxeXB4WXhabEZhekt1TFNKUXBuTjB4MlQyUXlHZFRWMVlQUXhCVG16RnRNRXhnYWplbWV4ZGUxMzBhRWFJMVl1V3ExeGhYUEdweHVkQzBsL2l0TFpxYUNnandnS3o2Tm9rQmNKbExqRm9XOExPS24yM2dYRVcxaFVRbUxlT2xyUTNvYmVlbzg2dkU4SWhJVlEyNXV0bTZtNHJBNWtJTW54dE1uRDlmZHZuRXR1YnFxa3V5S08yL3dMWnJ2SW5JNkxPejgwNCttelpEbTVlVkNYMnZUdDVocUxpTGJGN0c0SEFvTEMvRHRTeEdONnZpNFczWG5UaDh2OTF1N3BPU0hJOThtSmp5NGQ2YTJ0b2FNeFpUbVd0Mi92b3ZJZy9yYW1zOSt1eEVUOHVIRThmR085dGFhanllTnFQS2VOU2wzMmVJNUx6NWI0Sm5qdC9ieng4c1d6Y240Nmt2ZlIrUysydmZ2YWNzV3ppNWNzWGgyMldMdmFWa3JsOHdWL1hMcWg5UUhjYmQrcXFtdVdpbVRTdDB3N05XSUhwVjNFU0hPbnFqVjZqVUtoWndNVERwdUpWeXFLaVM3YzdNenR4WVY1RjVNZWZJb0pEY25Nem81OGVFWnZFY1c1T1ZzYldpbyt3YjFSdU1DU041Nlh6UXlEckVSY1JtaEYva3ZBQUFBLy85UmhLb1BBQUFBQmtsRVFWUURBQ00xQTlDTHU4M1NBQUFBQUVsRlRrU3VRbUNDIiB4PSIwIiB5PSIwIiB3aWR0aD0iNTAiIGhlaWdodD0iNDciLz4KPC9zdmc+" width="13" height="12" style="image-rendering:pixelated;vertical-align:middle"/> Relleno`;
  info.appendChild(name); row.appendChild(info);

  // Acciones: ojo + limpiar
  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';

  // Ojo
  const eyeBtn = document.createElement('button');
  eyeBtn.className = 'ed-layer-del';
  eyeBtn.textContent = '👁';
  eyeBtn.style.opacity = la.hidden ? '0.4' : '';
  eyeBtn.title = la.hidden ? 'Mostrar relleno' : 'Ocultar relleno';
  eyeBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    la.hidden = !la.hidden;
    edPushHistory();
    edRedraw(); _lyRender();
  });
  acts.appendChild(eyeBtn);

  // Eliminar relleno (igual que el ✕ del resto de capas)
  const clrBtn = document.createElement('button');
  clrBtn.className = 'ed-layer-del';
  clrBtn.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  clrBtn.title = 'Eliminar relleno';
  clrBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm('¿Eliminar el relleno?', () => {
      const _flIdx = edLayers.indexOf(la);
      if (_flIdx >= 0) edLayers.splice(_flIdx, 1);
      // Desconectar el vínculo en la capa de dibujo
      const _pair = edLayers.find(l => l._fillLayerId && l._fillLayerId === la._drawLayerId);
      if (_pair) { delete _pair._fillLayerId; delete _pair._uid; }
      edPushHistory(); edRedraw(); _lyRender();
    });
  });
  acts.appendChild(clrBtn);

  row.appendChild(acts);

  // Tap en la sub-fila de relleno: si la herramienta de dibujo está activa, ofrecer dibujar en ella
  row.addEventListener('pointerup', e => {
    if (e.target.closest('.ed-layer-actions')) return; // toques en botones: ya manejados
    const _isTool = typeof edActiveTool !== 'undefined' &&
                    ['draw','eraser'].includes(edActiveTool);
    const _panelDraw = typeof _edDrawLayerTarget !== 'undefined';
    if (!_isTool || !_panelDraw) return;

    // Encontrar el DrawLayer vinculado para saber el índice a seleccionar
    const _drawLa = (typeof edLayers !== 'undefined')
      ? edLayers.find(l => l._fillLayerId && l._fillLayerId === la._drawLayerId)
      : null;

    edConfirm('¿Quieres usar las herramientas de dibujo en la capa de relleno?', () => {
      // Seleccionar el DrawLayer vinculado en el editor
      if (_drawLa && typeof edSelectedIdx !== 'undefined') {
        edSelectedIdx = edLayers.indexOf(_drawLa);
      }
      // Activar capa de relleno como destino de dibujo
      if (typeof _edDrawLayerTarget !== 'undefined') _edDrawLayerTarget = 'fill';
      // Cerrar panel de capas y abrir panel de dibujo
      edCloseLayers();
      if (typeof edRenderOptionsPanel === 'function') {
        edRenderOptionsPanel(edActiveTool === 'eraser' ? 'eraser' : 'draw');
      }
    }, 'Sí');
  });

  return row;
}

function _lyBuildTextRow(la, realIdx, seqPos, selected, draggable) {
  const row = document.createElement('div');
  row.className = 'ed-layer-text-row' + (selected ? ' selected' : '') + (draggable ? ' draggable' : '');
  if (la.hidden) row.style.opacity = '0.45'; // capa oculta: item atenuado
  row.dataset.realIdx = realIdx;
  if (!la._uid) la._uid = ++_lyUidCounter;
  row.dataset.uid = la._uid;

  /* Número de secuencia (solo en modo secuencial) */
  if (draggable) {
    const badge = document.createElement('span');
    badge.className = 'ed-ly-seq-badge';
    badge.textContent = seqPos + 1;
    row.appendChild(badge);
  }

  /* Miniatura — es el handle de arrastre en modo secuencial */
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb-sm' + (draggable ? ' drag-handle' : '');
  thumb.width = 56; thumb.height = 42;
  _lyDrawThumb(thumb, la);
  thumb.title = draggable ? 'Arrastra para reordenar · toca para seleccionar' : 'Seleccionar';
  thumb.addEventListener('pointerup', e => {
    // Solo seleccionar si no hubo drag
    if (!row.classList.contains('was-dragged')) {
      const _idx = realIdx;
      const ov = document.getElementById('edLayersOverlay');
      if (ov) {
        ov.classList.remove('open');
        setTimeout(() => { ov.remove(); _lySetCanvasTouch(true); _lyOpenLayerPanel(_idx); }, 250);
      } else {
        _lyOpenLayerPanel(_idx);
      }
    }
    row.classList.remove('was-dragged');
  });
  _lyBindThumbDoubleTap(thumb, () => realIdx);
  row.appendChild(thumb);

  /* Nombre */
  const lbl = document.createElement('span');
  lbl.className = 'ed-layer-name';
  const _tIcon = (la.type === 'bubble' ? '💬 ' : 'T ');
  lbl.textContent = _tIcon + (la.name ? la.name : (la.text || '').substring(0, 22));
  row.appendChild(lbl);
  _lyBindNameEdit(lbl, la);

  /* Flechas subir/bajar nivel */
  const textObjs = edLayers.filter(l => (l.type==='text' || l.type==='bubble') && !l._tdExceptFlow);
  const viIdx = textObjs.indexOf(la);
  const upBtn = document.createElement('button');
  upBtn.className = 'ed-layer-arrow';
  upBtn.title = 'Subir nivel';
  upBtn.textContent = '▲';
  upBtn.disabled = viIdx <= 0;
  upBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    const prevTxt = textObjs[viIdx - 1];
    const toIdx = edLayers.indexOf(prevTxt);
    if (toIdx >= 0) _lyReorderTexts(realIdx, toIdx);
  });
  const dnBtn = document.createElement('button');
  dnBtn.className = 'ed-layer-arrow';
  dnBtn.title = 'Bajar nivel';
  dnBtn.textContent = '▼';
  dnBtn.disabled = viIdx >= textObjs.length - 1;
  dnBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    const nextTxt = textObjs[viIdx + 1];
    const toIdx = edLayers.indexOf(nextTxt);
    if (toIdx >= 0) _lyReorderTexts(realIdx, toIdx);
  });
  /* Eliminar */
  const del = document.createElement('button');
  del.className = 'ed-layer-del';
  del.title = 'Eliminar';
  del.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  del.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm('¿Eliminar esta capa?', ()=>{
      // Eliminar FillLayer vinculado si existe
      if (la._fillLayerId) {
        const _flDV=edLayers.findIndex(l=>l.type==='fill'&&l._drawLayerId===la._fillLayerId);
        if(_flDV>=0){ edLayers.splice(_flDV,1); if(_flDV<realIdx) realIdx--; }
      }
      edLayers.splice(realIdx, 1);
      if (edSelectedIdx >= edLayers.length) edSelectedIdx = edLayers.length - 1;
      edPushHistory(); edRedraw(); _lyRender();
    });
  });
  // Agrupar controles en un div que nunca se comprime
  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';
  acts.appendChild(upBtn);
  acts.appendChild(dnBtn);
  acts.appendChild(_lyBuildEyeBtn(la));
  acts.appendChild(_lyBuildLockBtn(la));
  acts.appendChild(del);
  row.appendChild(acts);

  /* Drag — solo si modo secuencial, desde la miniatura */
  if (draggable) {
    _lyBindTextDrag(row, thumb, realIdx);
  }

  return row;
}

/* ──────────────────────────────────────────
   ITEM DE IMAGEN — drag desde miniatura
────────────────────────────────────────── */
/* ──────────────────────────────────────────
   ELEMENTO VISUAL (imagen O dibujo) — sección combinada
────────────────────────────────────────── */
function _lyBuildVisualItem(la, realIdx, selected) {
  const isDrawType = la.type === 'stroke' || la.type === 'draw';
  const isShapeType = la.type === 'shape' || la.type === 'line';
  const isGroup = false; // obsoleto
  const item = document.createElement('div');
  item.className = 'ed-layer-item' + (selected ? ' selected' : '');
  item.style.position = 'relative';
  item.style.paddingBottom = '22px';
  if (la.hidden) item.style.opacity = '0.45';
  item.dataset.realIdx = realIdx;
  if (!la._uid) la._uid = ++_lyUidCounter;
  item.dataset.uid = la._uid;

  /* Miniatura */
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb drag-handle';
  thumb.width = 80; thumb.height = 60;
  if (isDrawType) {
    _lyDrawStrokeThumb(thumb, la);
  } else if (isShapeType) {
    _lyDrawShapeThumb(thumb, la);
  } else if (isGroup) {
    _lyDrawGroupThumb(thumb, la);
  } else {
    _lyDrawThumb(thumb, la);
  }
  thumb.title = isDrawType ? 'Dibujo · toca para seleccionar' : isShapeType ? 'Objeto · toca para seleccionar' : 'Arrastra para reordenar · toca para seleccionar';
  thumb.addEventListener('pointerup', () => {
    if (!item.classList.contains('was-dragged')) {
      const _idx = realIdx;
      const ov = document.getElementById('edLayersOverlay');
      if (ov) {
        ov.classList.remove('open');
        setTimeout(() => { ov.remove(); _lySetCanvasTouch(true); _lyOpenLayerPanel(_idx); }, 250);
      } else {
        _lyOpenLayerPanel(_idx);
      }
    }
    item.classList.remove('was-dragged');
  });
  _lyBindThumbDoubleTap(thumb, () => realIdx);
  const _thumbWrap = document.createElement('div');
  _thumbWrap.style.cssText = 'position:relative;flex-shrink:0;width:80px;height:60px;';
  _thumbWrap.appendChild(thumb);
  item.appendChild(_thumbWrap);

  /* Info */
  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  const _grpTag = la.groupId ? ' 🔗' : '';
  if (isDrawType) {
    const _drawIconDibujando = `<img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOSIgaGVpZ2h0PSIzMSIgdmlld0JveD0iMCAwIDE5IDMxIj4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMC42NjIgMTUuMzM5KSI+PHBhdGggZD0iTSAtNy4yNjMgMy4wMjAgTCAwLjc5NSAtMTQuMTA1IEwgMy44NzAgLTE1LjA1OSBMIDYuOTQ1IC0xMy4yNTcgTCA4LjE2NSAtOS44MTEgTCAwLjE1OSA3LjIwOCBMIC01Ljk3MiAxMy4wNjYgUSAtOC4xNjUgMTUuMTYxIC03Ljk0MCAxMi4xMzYgTCAtNy4yNjMgMy4wMjAgWiIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg2Ljg2MCAyMS41MjApIj48cGF0aCBkPSJNIC0zLjgyNCAzLjc1MSBMIC0xLjE3NyA1LjczNiBMIDMuODk4IDAuODA5IEwgNC4yNjYgLTIuMzUzIEwgMC4wNzQgLTUuNzM2IEwgLTMuMzA5IC0zLjA4OSBMIC0zLjgyNCAzLjc1MSBaIiBmaWxsPSIjZmZlZGM3IiBzdHJva2U9Im5vbmUiLz48L2c+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNC4xOTAgMjcuMTQxKSByb3RhdGUoLTguOTQyMDQ0NTA2MjY4NzQyKSI+PHBhdGggZD0iTSAwLjI0MyAxLjIyMCBMIC0wLjY2MyAxLjY5NSBRIC0xLjU3MCAyLjE2OSAtMS40MzcgMS4xNTUgTCAtMS4zMDEgMC4xMTkgTCAtMC44MzMgLTIuMTY5IEwgMC4xMDIgLTEuOTQxIFEgMS4wMjcgLTEuNzE2IDEuMjk5IC0wLjgwMiBMIDEuNTcwIDAuMTExIEwgMC4yNDMgMS4yMjAgWiIgZmlsbD0iIzRlMzIzMiIgc3Ryb2tlPSJub25lIi8+PC9nPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDcuODY4IDIyLjQ4MCkiPjxwYXRoIGQ9Ik0gLTIuNjM3IDMuNDIzIEwgMi45MzEgLTQuODAxIEwgMi44OTggLTAuMTgyIEwgLTIuMTA3IDQuNjk1IEwgLTIuNjM3IDMuNDIzIFoiIGZpbGw9IiNjNGI2OTciIHN0cm9rZT0ibm9uZSIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg5LjExNSA5LjUwOSkiPjxwYXRoIGQ9Ik0gLTUuNDk2IDguODM5IEwgLTQuNjgzIDguODMzIFEgLTMuODcwIDguODI4IC0zLjI1OSA4LjI5MyBMIC0yLjU5OCA3LjcxNCBMIDUuNDQ3IC05LjA3OSBMIDIuNjgyIC04LjExNiBMIC01LjQ5NiA4LjgzOSBaIiBmaWxsPSIjZjdmNWJiIiBzdHJva2U9Im5vbmUiLz48L2c+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTIuMTI5IDEwLjIzMykgcm90YXRlKDIuODYyODU5NzgyNjk0MDgzNikiPjxwYXRoIGQ9Ik0gLTUuMjM3IDcuMjg5IEwgMS44MDggLTkuOTk3IEwgNS4wMjcgLTguMjQ3IEwgLTEuNjk3IDkuMDc2IEwgLTIuMzAwIDkuNTYyIFEgLTIuODIwIDkuOTgxIC0zLjQ4NiA5LjkzNSBMIC0zLjQ4NiA5LjkzNSBRIC00LjE1MiA5Ljg4OSAtNC41NzUgOS4zNzIgTCAtNC42NTkgOS4yNzAgUSAtNS4xMTMgOC43MTYgLTUuMTc1IDguMDAyIEwgLTUuMjM3IDcuMjg5IFoiIGZpbGw9IiM1MjM4MzgiIHN0cm9rZT0ibm9uZSIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNC4zMjggMTIuMzcyKSI+PHBhdGggZD0iTSAtNC4zNjcgNi45NDQgTCAtNC4yOTUgOC4zMTkgUSAtNC4yNjEgOC45NTkgLTMuOTQzIDkuNTE2IEwgLTMuNjI1IDEwLjA3MiBMIDQuMjc0IC02Ljc4NyBMIDMuMTYxIC0xMC4wNzUgTCAtNC4zNjcgNi45NDQgWiIgZmlsbD0iI2FmYWIzYyIgc3Ryb2tlPSJub25lIi8+PC9nPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDguNjg2IDE1LjAyMikiPjxwYXRoIGQ9Ik0gLTUuNjY4IDE0LjUzMiBMIC0zLjg4OSAyLjYyOCBMIDQuMTg0IC0xNC4wMDIgTCA1LjY2OCAtMTQuNTMyIEwgLTIuMzQ5IDMuMTAyIEwgLTUuNjY4IDE0LjUzMiBaIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9Im5vbmUiLz48L2c+Cjwvc3ZnPg==" width="11" height="18" style="display:inline-block;vertical-align:middle;flex-shrink:0">`;
    const _drawIconDibujo    = `<img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOSIgaGVpZ2h0PSIzMSIgdmlld0JveD0iMCAwIDE5IDMxIj4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMC42NjIgMTUuMzM5KSI+PHBhdGggZD0iTSAtNy4yNjMgMy4wMjAgTCAwLjc5NSAtMTQuMTA1IEwgMy44NzAgLTE1LjA1OSBMIDYuOTQ1IC0xMy4yNTcgTCA4LjE2NSAtOS44MTEgTCAwLjE1OSA3LjIwOCBMIC01Ljk3MiAxMy4wNjYgUSAtOC4xNjUgMTUuMTYxIC03Ljk0MCAxMi4xMzYgTCAtNy4yNjMgMy4wMjAgWiIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg2Ljg2MCAyMS41MjApIj48cGF0aCBkPSJNIC0zLjgyNCAzLjc1MSBMIC0xLjE3NyA1LjczNiBMIDMuODk4IDAuODA5IEwgNC4yNjYgLTIuMzUzIEwgMC4wNzQgLTUuNzM2IEwgLTMuMzA5IC0zLjA4OSBMIC0zLjgyNCAzLjc1MSBaIiBmaWxsPSIjZmZlZGM3IiBzdHJva2U9Im5vbmUiLz48L2c+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNC4xOTAgMjcuMTQxKSByb3RhdGUoLTguOTQyMDQ0NTA2MjY4NzQyKSI+PHBhdGggZD0iTSAwLjI0MyAxLjIyMCBMIC0wLjY2MyAxLjY5NSBRIC0xLjU3MCAyLjE2OSAtMS40MzcgMS4xNTUgTCAtMS4zMDEgMC4xMTkgTCAtMC44MzMgLTIuMTY5IEwgMC4xMDIgLTEuOTQxIFEgMS4wMjcgLTEuNzE2IDEuMjk5IC0wLjgwMiBMIDEuNTcwIDAuMTExIEwgMC4yNDMgMS4yMjAgWiIgZmlsbD0iIzRlMzIzMiIgc3Ryb2tlPSJub25lIi8+PC9nPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDcuODY4IDIyLjQ4MCkiPjxwYXRoIGQ9Ik0gLTIuNjM3IDMuNDIzIEwgMi45MzEgLTQuODAxIEwgMi44OTggLTAuMTgyIEwgLTIuMTA3IDQuNjk1IEwgLTIuNjM3IDMuNDIzIFoiIGZpbGw9IiNjNGI2OTciIHN0cm9rZT0ibm9uZSIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg5LjExNSA5LjUwOSkiPjxwYXRoIGQ9Ik0gLTUuNDk2IDguODM5IEwgLTQuNjgzIDguODMzIFEgLTMuODcwIDguODI4IC0zLjI1OSA4LjI5MyBMIC0yLjU5OCA3LjcxNCBMIDUuNDQ3IC05LjA3OSBMIDIuNjgyIC04LjExNiBMIC01LjQ5NiA4LjgzOSBaIiBmaWxsPSIjZjdmNWJiIiBzdHJva2U9Im5vbmUiLz48L2c+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTIuMTI5IDEwLjIzMykgcm90YXRlKDIuODYyODU5NzgyNjk0MDgzNikiPjxwYXRoIGQ9Ik0gLTUuMjM3IDcuMjg5IEwgMS44MDggLTkuOTk3IEwgNS4wMjcgLTguMjQ3IEwgLTEuNjk3IDkuMDc2IEwgLTIuMzAwIDkuNTYyIFEgLTIuODIwIDkuOTgxIC0zLjQ4NiA5LjkzNSBMIC0zLjQ4NiA5LjkzNSBRIC00LjE1MiA5Ljg4OSAtNC41NzUgOS4zNzIgTCAtNC42NTkgOS4yNzAgUSAtNS4xMTMgOC43MTYgLTUuMTc1IDguMDAyIEwgLTUuMjM3IDcuMjg5IFoiIGZpbGw9IiM1MjM4MzgiIHN0cm9rZT0ibm9uZSIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNC4zMjggMTIuMzcyKSI+PHBhdGggZD0iTSAtNC4zNjcgNi45NDQgTCAtNC4yOTUgOC4zMTkgUSAtNC4yNjEgOC45NTkgLTMuOTQzIDkuNTE2IEwgLTMuNjI1IDEwLjA3MiBMIDQuMjc0IC02Ljc4NyBMIDMuMTYxIC0xMC4wNzUgTCAtNC4zNjcgNi45NDQgWiIgZmlsbD0iI2FmYWIzYyIgc3Ryb2tlPSJub25lIi8+PC9nPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDguNjg2IDE1LjAyMikiPjxwYXRoIGQ9Ik0gLTUuNjY4IDE0LjUzMiBMIC0zLjg4OSAyLjYyOCBMIDQuMTg0IC0xNC4wMDIgTCA1LjY2OCAtMTQuNTMyIEwgLTIuMzQ5IDMuMTAyIEwgLTUuNjY4IDE0LjUzMiBaIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9Im5vbmUiLz48L2c+Cjwvc3ZnPg==" width="11" height="18" style="image-rendering:pixelated;vertical-align:middle"/>`;
    const _drawIcon = la.type === 'draw' ? _drawIconDibujando : _drawIconDibujo;
    const _drawDefaultTxt = la.type === 'draw' ? 'Dibujando…' : 'Dibujo';
    name.innerHTML = _drawIcon + ' ' + (la.name ? _lyEscHtml(la.name) : _drawDefaultTxt) + _grpTag;
  } else if (la.type === 'shape') {
    const _shIcon = la.shape === 'ellipse' ? '◯ ' : '▭ ';
    const _shDefaultTxt = la.shape === 'ellipse' ? 'Elipse' : 'Rectángulo';
    name.textContent = _shIcon + (la.name ? la.name : _shDefaultTxt) + _grpTag;
  } else if (la.type === 'line') {
    const _lnIcon = la.closed ? '⬠ ' : '╱ ';
    const _lnDefaultTxt = la.closed ? 'Polígono' : 'Recta';
    name.textContent = _lnIcon + (la.name ? la.name : _lnDefaultTxt) + _grpTag;
  } else if (la.type === 'gif') {
    name.textContent = '🎬 ' + (la.name ? la.name : ('GIF ' + (realIdx + 1))) + _grpTag;
  } else {
    const _isApng = la.animKey || la._pngFramesKey || la._apngIdbKey || la._apngSrc || (la._pngFrames && la._pngFrames.length);
    const _imgIcon = _isApng ? '📽️ ' : '';
    const _imgDefaultTxt = (_isApng ? 'APNG ' : 'Imagen ') + (realIdx + 1);
    name.textContent = _imgIcon + (la.name ? la.name : _imgDefaultTxt) + _grpTag;
  }
  info.appendChild(name);
  _lyBindNameEdit(name, la);
  item.appendChild(info);

  /* Flechas subir/bajar — dentro de los elementos visuales */
  // Lista compactada: grupos = 1 entrada (para que ▲/▼ salten el grupo entero)
  const _cpAll = _lyCompactedVisual();
  const posInList = _cpAll.findIndex(e => la.groupId ? e.groupId === la.groupId : e.i === realIdx);

  const upBtn = document.createElement('button');
  upBtn.className = 'ed-layer-arrow';
  upBtn.title = 'Subir nivel';
  upBtn.textContent = '▲';
  upBtn.disabled = posInList >= _cpAll.length - 1;
  upBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    if (la.groupId) {
      _lyReorderGroup(la.groupId, +1);
    } else {
      const next = _cpAll[posInList + 1];
      if (next) {
        let _dest;
        if (next.groupId) {
          // Saltar por encima de todo el grupo
          _dest = next.maxGroupIdx + 1;
        } else {
          const _nextFl = next.l._fillLayerId
            ? edLayers.findIndex(l=>l.type==='fill'&&l._drawLayerId===next.l._fillLayerId)
            : -1;
          _dest = _nextFl >= 0 ? Math.max(next.i, _nextFl) + 1 : next.i + 1;
        }
        _lyReorderLayers(realIdx, _dest);
      }
    }
  });

  const dnBtn = document.createElement('button');
  dnBtn.className = 'ed-layer-arrow';
  dnBtn.title = 'Bajar nivel';
  dnBtn.textContent = '▼';
  dnBtn.disabled = posInList <= 0;
  dnBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    if (la.groupId) {
      _lyReorderGroup(la.groupId, -1);
    } else {
      const prev = _cpAll[posInList - 1];
      if (prev) {
        let _dest;
        if (prev.groupId) {
          // Saltar por debajo de todo el grupo
          _dest = prev.minGroupIdx;
        } else {
          const _prevFl = prev.l._fillLayerId
            ? edLayers.findIndex(l=>l.type==='fill'&&l._drawLayerId===prev.l._fillLayerId)
            : -1;
          _dest = _prevFl >= 0 ? Math.min(prev.i, _prevFl) : prev.i;
        }
        _lyReorderLayers(realIdx, _dest);
      }
    }
  });

  /* Eliminar */
  const del = document.createElement('button');
  del.className = 'ed-layer-del';
  del.title = 'Eliminar';
  del.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  del.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm('¿Eliminar esta capa?', ()=>{
      // T3: si la capa es draw/stroke/shape/line con panel abierto, limpiar UI primero
      const _delLa = edLayers[realIdx];
      const _delType = _delLa ? _delLa.type : '';
      if (_delType === 'draw' || _delType === 'stroke' || _delType === 'shape' || _delType === 'line') {
        if (_delType === 'shape' || _delType === 'line') {
          // Sesión vectorial: eliminar el objeto y comprobar si quedan objetos de sesión
          // antes de decidir si cerrar el panel o mantenerlo abierto
          const _preSet = typeof _vsPreSessionLayers !== 'undefined' ? _vsPreSessionLayers : new Set();
          const _vsLen  = typeof _vsHistory !== 'undefined' ? _vsHistory.length : 0;
          // Pre-calculamos los objetos restantes DESPUÉS del splice (la aún existe aquí)
          const _remAfterDel = _vsLen > 0
            ? edLayers.filter(l => l !== _delLa && (l.type==='line'||l.type==='shape') && !_preSet.has(l))
            : [];
          if(_remAfterDel.length > 0){
            // Quedan objetos de sesión: no cerrar panel. Solo ajustar selección.
            if (edSelectedIdx === realIdx) edSelectedIdx = -1;
          } else {
            // Sin objetos de sesión restantes: cerrar panel y sesión
            const _panel = document.getElementById('edOptionsPanel');
            if (_panel) { _panel.classList.remove('open'); delete _panel.dataset.mode; }
            if (typeof edShapeBarHide === 'function') edShapeBarHide();
            if (typeof _edDrawUnlockUI === 'function') _edDrawUnlockUI();
            if (typeof _edShapeClearHistory === 'function') _edShapeClearHistory();
            if (window._edLineLayer) window._edLineLayer = null;
            if (window._edLineFusionId) window._edLineFusionId = null;
            edActiveTool = 'select';
            if (typeof edCanvas !== 'undefined') edCanvas.className = '';
            if (edSelectedIdx === realIdx) edSelectedIdx = -1;
          }
        } else {
          // draw/stroke: cerrar panel siempre
          const _panel = document.getElementById('edOptionsPanel');
          if (_panel) { _panel.classList.remove('open'); delete _panel.dataset.mode; }
          if (typeof edDrawBarHide === 'function') edDrawBarHide();
          if (typeof edShapeBarHide === 'function') edShapeBarHide();
          if (typeof _edDrawUnlockUI === 'function') _edDrawUnlockUI();
          if (typeof _edShapeClearHistory === 'function') _edShapeClearHistory();
          edActiveTool = 'select';
          if (typeof edCanvas !== 'undefined') edCanvas.className = '';
          const _cur = document.getElementById('edBrushCursor');
          if (_cur) _cur.style.display = 'none';
          if (edSelectedIdx === realIdx) edSelectedIdx = -1;
        }
      }
      // Para draw/stroke: eliminar también fill, pencil y watercolor vinculados
      if (isDrawType) {
        const _delUid = la._uid || la._fillLayerId;
        if (_delUid) {
          // Eliminar de mayor a menor índice para no desplazar los índices
          const _subIdxs = edLayers
            .map((l, idx) => ({ l, idx }))
            .filter(({ l }) =>
              (l.type==='fill'||l.type==='pencil'||l.type==='watercolor') && l._drawLayerId===_delUid)
            .map(({ idx }) => idx)
            .sort((a, b) => b - a); // mayor a menor
          _subIdxs.forEach(idx => { edLayers.splice(idx, 1); });
        }
      }
      // Actualizar realIdx por si los splices anteriores lo desplazaron
      const _newRealIdx = edLayers.indexOf(la);
      if (_newRealIdx >= 0) edLayers.splice(_newRealIdx, 1);
      if (edSelectedIdx >= edLayers.length) edSelectedIdx = edLayers.length - 1;
      edPushHistory(); edRedraw(); _lyRender();
    });
  });

  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';
  acts.appendChild(upBtn);
  acts.appendChild(dnBtn);
  // Ojo: para draw/stroke afecta a TODAS las sub-capas vinculadas
  if (isDrawType) {
    const _eyeGroupUid = la._uid || la._fillLayerId;
    const _eyeBtn = document.createElement('button');
    _eyeBtn.className = 'ed-layer-del';
    _eyeBtn.textContent = '👁';
    const _eyeAllHidden = () => {
      if (la.hidden) return true;
      if (!_eyeGroupUid) return false;
      const _subs = edLayers.filter(l =>
        (l.type==='fill'||l.type==='pencil'||l.type==='watercolor') && l._drawLayerId===_eyeGroupUid);
      return _subs.length > 0 && _subs.every(l => l.hidden);
    };
    _eyeBtn.title  = _eyeAllHidden() ? 'Mostrar grupo' : 'Ocultar grupo';
    _eyeBtn.style.opacity = _eyeAllHidden() ? '0.4' : '';
    _eyeBtn.addEventListener('pointerup', e => {
      e.stopPropagation();
      const _newHidden = !la.hidden;
      la.hidden = _newHidden;
      if (_eyeGroupUid) {
        edLayers.forEach(l => {
          if ((l.type==='fill'||l.type==='pencil'||l.type==='watercolor') && l._drawLayerId===_eyeGroupUid)
            l.hidden = _newHidden;
        });
      }
      edPushHistory();
      edRedraw(); _lyRender();
    });
    acts.appendChild(_eyeBtn);
  } else {
    acts.appendChild(_lyBuildEyeBtn(la));
  }
  // Candado: para draw/stroke afecta a TODAS las sub-capas vinculadas (tinta/lápiz/acuarela)
  if (isDrawType) {
    const _lockGroupUid = la._uid || la._fillLayerId;
    const _lockBtn = document.createElement('button');
    _lockBtn.className = 'ed-layer-del';
    _lockBtn.textContent = '🔒';
    const _lockAllLocked = () => {
      if (la.locked) return true;
      if (!_lockGroupUid) return false;
      const _subs = edLayers.filter(l =>
        (l.type==='fill'||l.type==='pencil'||l.type==='watercolor') && l._drawLayerId===_lockGroupUid);
      return _subs.length > 0 && _subs.every(l => l.locked);
    };
    _lockBtn.title  = _lockAllLocked() ? 'Desbloquear grupo' : 'Bloquear grupo';
    _lockBtn.style.opacity = _lockAllLocked() ? '' : '0.4';
    _lockBtn.addEventListener('pointerup', e => {
      e.stopPropagation();
      const _newLocked = !la.locked;
      la.locked = _newLocked;
      if (_lockGroupUid) {
        edLayers.forEach(l => {
          if ((l.type==='fill'||l.type==='pencil'||l.type==='watercolor') && l._drawLayerId===_lockGroupUid)
            l.locked = _newLocked;
        });
      }
      edPushHistory();
      edRedraw(); _lyRender();
    });
    acts.appendChild(_lockBtn);
  } else {
    acts.appendChild(_lyBuildLockBtn(la));
  }
  // Botón colapsar/expandir sub-capas solo para stroke/draw con capas vinculadas
  if (isDrawType) {
    const _colUid = la._uid || la._fillLayerId;
    const _hasSubs = _colUid && (typeof edLayers !== 'undefined') && edLayers.some(l =>
      (l.type==='fill'||l.type==='pencil'||l.type==='watercolor') && l._drawLayerId===_colUid);
    if (_hasSubs) {
      const _isExp = _lyExpandedGroups.has(_colUid);
      const _colBtn = document.createElement('button');
      _colBtn.title = _isExp ? 'Colapsar sub-capas' : 'Mostrar sub-capas';
      _colBtn.textContent = _isExp ? '▲' : '▼';
      _colBtn.style.cssText = 'position:absolute;bottom:3px;left:50%;transform:translateX(-50%);' +
        'border:none;border-radius:4px;padding:0 10px;font-size:0.8rem;line-height:1.6;cursor:pointer;' +
        'background:rgba(255,255,255,0.88);font-weight:900;white-space:nowrap;' +
        'color:' + (_isExp ? '#e63030' : '#22c55e') + ';';
      _colBtn.addEventListener('pointerup', e => {
        e.stopPropagation();
        if (_lyExpandedGroups.has(_colUid)) _lyExpandedGroups.delete(_colUid);
        else _lyExpandedGroups.add(_colUid);
        _lyRender();
      });
      item.appendChild(_colBtn);
    }
  }
  acts.appendChild(del);
  item.appendChild(acts);

  /* Drag solo para imágenes (stroke/draw se reordenan con flechas) */
  if (!isDrawType) _lyBindImgDrag(item, thumb, realIdx);
  return item;
}

function _lyDrawStrokeThumb(canvas, la) {
  const ctx = canvas.getContext('2d');
  const tw = canvas.width, th = canvas.height;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, tw, th);
  const pad = 4;
  if ((la.type === 'stroke' || la.type === 'draw') && la._canvas) {
    const _thumbUid = la._uid || la._fillLayerId;
    const _flS     = (typeof edLayers !== 'undefined' && _thumbUid) ? edLayers.find(f => f && f.type==='fill'       && f._drawLayerId===_thumbUid) : null;
    const _wcS     = (typeof edLayers !== 'undefined' && _thumbUid) ? edLayers.find(f => f && f.type==='watercolor' && f._drawLayerId===_thumbUid) : null;
    const _pencilS = (typeof edLayers !== 'undefined' && _thumbUid) ? edLayers.find(f => f && f.type==='pencil'     && f._drawLayerId===_thumbUid) : null;

    if (!la._isWorkspaceCanvas) {
      // Capa congelada: _canvas ya recortado al bbox del contenido.
      // Escalar directamente al thumb sin depender de coordenadas de página.
      const cw = la._canvas.width, ch = la._canvas.height;
      if (cw > 0 && ch > 0) {
        const scale = Math.min((tw - pad*2) / cw, (th - pad*2) / ch);
        const dx = pad + (tw - pad*2 - cw * scale) / 2;
        const dy = pad + (th - pad*2 - ch * scale) / 2;
        ctx.save();
        if (_flS && _flS._canvas?.width > 0 && !_flS._isWorkspaceCanvas)
          ctx.drawImage(_flS._canvas, dx, dy, cw * scale, ch * scale);
        if (_wcS && _wcS._canvas?.width > 0 && !_wcS._isWorkspaceCanvas)
          ctx.drawImage(_wcS._canvas, dx, dy, cw * scale, ch * scale);
        if (_pencilS && _pencilS._canvas?.width > 0 && !_pencilS._isWorkspaceCanvas)
          ctx.drawImage(_pencilS._canvas, dx, dy, cw * scale, ch * scale);
        ctx.drawImage(la._canvas, dx, dy, cw * scale, ch * scale);
        ctx.restore();
      }
    } else {
      // Canvas workspace completo (DrawLayer en edición activa o sub-capa expandida).
      // Buscar el bbox real del contenido con _boundingBox.
      const _bb = (typeof StrokeLayer !== 'undefined' && StrokeLayer._boundingBox)
        ? StrokeLayer._boundingBox(la._canvas) : null;
      if (_bb && _bb.w > 0 && _bb.h > 0) {
        const scale = Math.min((tw - pad*2) / _bb.w, (th - pad*2) / _bb.h);
        const dx = pad + (tw - pad*2 - _bb.w * scale) / 2;
        const dy = pad + (th - pad*2 - _bb.h * scale) / 2;
        ctx.save();
        if (_flS && _flS._canvas?.width > 0)
          ctx.drawImage(_flS._canvas, _bb.x, _bb.y, _bb.w, _bb.h, dx, dy, _bb.w*scale, _bb.h*scale);
        if (_wcS && _wcS._canvas?.width > 0)
          ctx.drawImage(_wcS._canvas, _bb.x, _bb.y, _bb.w, _bb.h, dx, dy, _bb.w*scale, _bb.h*scale);
        if (_pencilS && _pencilS._canvas?.width > 0)
          ctx.drawImage(_pencilS._canvas, _bb.x, _bb.y, _bb.w, _bb.h, dx, dy, _bb.w*scale, _bb.h*scale);
        ctx.drawImage(la._canvas, _bb.x, _bb.y, _bb.w, _bb.h, dx, dy, _bb.w*scale, _bb.h*scale);
        ctx.restore();
      }
    }
  } else {
    const _lapizImg = new Image();
    _lapizImg.src = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOSIgaGVpZ2h0PSIzMSIgdmlld0JveD0iMCAwIDE5IDMxIj4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMC42NjIgMTUuMzM5KSI+PHBhdGggZD0iTSAtNy4yNjMgMy4wMjAgTCAwLjc5NSAtMTQuMTA1IEwgMy44NzAgLTE1LjA1OSBMIDYuOTQ1IC0xMy4yNTcgTCA4LjE2NSAtOS44MTEgTCAwLjE1OSA3LjIwOCBMIC01Ljk3MiAxMy4wNjYgUSAtOC4xNjUgMTUuMTYxIC03Ljk0MCAxMi4xMzYgTCAtNy4yNjMgMy4wMjAgWiIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg2Ljg2MCAyMS41MjApIj48cGF0aCBkPSJNIC0zLjgyNCAzLjc1MSBMIC0xLjE3NyA1LjczNiBMIDMuODk4IDAuODA5IEwgNC4yNjYgLTIuMzUzIEwgMC4wNzQgLTUuNzM2IEwgLTMuMzA5IC0zLjA4OSBMIC0zLjgyNCAzLjc1MSBaIiBmaWxsPSIjZmZlZGM3IiBzdHJva2U9Im5vbmUiLz48L2c+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNC4xOTAgMjcuMTQxKSByb3RhdGUoLTguOTQyMDQ0NTA2MjY4NzQyKSI+PHBhdGggZD0iTSAwLjI0MyAxLjIyMCBMIC0wLjY2MyAxLjY5NSBRIC0xLjU3MCAyLjE2OSAtMS40MzcgMS4xNTUgTCAtMS4zMDEgMC4xMTkgTCAtMC44MzMgLTIuMTY5IEwgMC4xMDIgLTEuOTQxIFEgMS4wMjcgLTEuNzE2IDEuMjk5IC0wLjgwMiBMIDEuNTcwIDAuMTExIEwgMC4yNDMgMS4yMjAgWiIgZmlsbD0iIzRlMzIzMiIgc3Ryb2tlPSJub25lIi8+PC9nPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDcuODY4IDIyLjQ4MCkiPjxwYXRoIGQ9Ik0gLTIuNjM3IDMuNDIzIEwgMi45MzEgLTQuODAxIEwgMi44OTggLTAuMTgyIEwgLTIuMTA3IDQuNjk1IEwgLTIuNjM3IDMuNDIzIFoiIGZpbGw9IiNjNGI2OTciIHN0cm9rZT0ibm9uZSIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg5LjExNSA5LjUwOSkiPjxwYXRoIGQ9Ik0gLTUuNDk2IDguODM5IEwgLTQuNjgzIDguODMzIFEgLTMuODcwIDguODI4IC0zLjI1OSA4LjI5MyBMIC0yLjU5OCA3LjcxNCBMIDUuNDQ3IC05LjA3OSBMIDIuNjgyIC04LjExNiBMIC01LjQ5NiA4LjgzOSBaIiBmaWxsPSIjZjdmNWJiIiBzdHJva2U9Im5vbmUiLz48L2c+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTIuMTI5IDEwLjIzMykgcm90YXRlKDIuODYyODU5NzgyNjk0MDgzNikiPjxwYXRoIGQ9Ik0gLTUuMjM3IDcuMjg5IEwgMS44MDggLTkuOTk3IEwgNS4wMjcgLTguMjQ3IEwgLTEuNjk3IDkuMDc2IEwgLTIuMzAwIDkuNTYyIFEgLTIuODIwIDkuOTgxIC0zLjQ4NiA5LjkzNSBMIC0zLjQ4NiA5LjkzNSBRIC00LjE1MiA5Ljg4OSAtNC41NzUgOS4zNzIgTCAtNC42NTkgOS4yNzAgUSAtNS4xMTMgOC43MTYgLTUuMTc1IDguMDAyIEwgLTUuMjM3IDcuMjg5IFoiIGZpbGw9IiM1MjM4MzgiIHN0cm9rZT0ibm9uZSIvPjwvZz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNC4zMjggMTIuMzcyKSI+PHBhdGggZD0iTSAtNC4zNjcgNi45NDQgTCAtNC4yOTUgOC4zMTkgUSAtNC4yNjEgOC45NTkgLTMuOTQzIDkuNTE2IEwgLTMuNjI1IDEwLjA3MiBMIDQuMjc0IC02Ljc4NyBMIDMuMTYxIC0xMC4wNzUgTCAtNC4zNjcgNi45NDQgWiIgZmlsbD0iI2FmYWIzYyIgc3Ryb2tlPSJub25lIi8+PC9nPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDguNjg2IDE1LjAyMikiPjxwYXRoIGQ9Ik0gLTUuNjY4IDE0LjUzMiBMIC0zLjg4OSAyLjYyOCBMIDQuMTg0IC0xNC4wMDIgTCA1LjY2OCAtMTQuNTMyIEwgLTIuMzQ5IDMuMTAyIEwgLTUuNjY4IDE0LjUzMiBaIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9Im5vbmUiLz48L2c+Cjwvc3ZnPg==';
    ctx.drawImage(_lapizImg, Math.round(tw/2 - 8), Math.round(th/2 - 13), 16, 26);
  }
}

function _lyBuildImgItem(la, realIdx, selected) {
  const item = document.createElement('div');
  item.className = 'ed-layer-item' + (selected ? ' selected' : '');
  item.dataset.realIdx = realIdx;
  if (!la._uid) la._uid = ++_lyUidCounter;
  item.dataset.uid = la._uid;

  /* Miniatura — handle de arrastre */
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb drag-handle';
  thumb.width = 80; thumb.height = 60;
  _lyDrawThumb(thumb, la);
  thumb.title = 'Arrastra para reordenar · toca para seleccionar';
  thumb.addEventListener('pointerup', () => {
    if (!item.classList.contains('was-dragged')) {
      edSelectedIdx = realIdx;
      edRedraw();
      edCloseLayers();
    }
    item.classList.remove('was-dragged');
  });
  item.appendChild(thumb);

  /* Info + opacidad (solo desktop) */
  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  const _isApngPanel = la.animKey || la._pngFramesKey || la._apngIdbKey || la._apngSrc || (la._pngFrames && la._pngFrames.length);
  name.textContent = (_isApngPanel ? '📽️ APNG ' : 'Imagen ') + (realIdx + 1);
  info.appendChild(name);

  // Opacidad ahora en el panel de propiedades de imagen (⚙)
  item.appendChild(info);

  /* Flechas subir/bajar nivel */
  const imgPairsAll = edLayers.map((l,i)=>({l,i})).filter(({l})=>l.type==='image');
  const imgPosInList = imgPairsAll.findIndex(({i})=>i===realIdx);
  // La lista se muestra invertida (primero = encima), así ▲ = índice más alto en edLayers
  const upBtnI = document.createElement('button');
  upBtnI.className = 'ed-layer-arrow';
  upBtnI.title = 'Subir nivel';
  upBtnI.textContent = '▲';
  upBtnI.disabled = imgPosInList >= imgPairsAll.length - 1; // ya es el último (más arriba visualmente)
  upBtnI.addEventListener('pointerup', e => {
    e.stopPropagation();
    // Subir = mover hacia índice mayor en edLayers (más arriba en la pila)
    const nextImg = imgPairsAll[imgPosInList + 1];
    if (nextImg) _lyReorderImages(realIdx, nextImg.i + 1);
  });
  const dnBtnI = document.createElement('button');
  dnBtnI.className = 'ed-layer-arrow';
  dnBtnI.title = 'Bajar nivel';
  dnBtnI.textContent = '▼';
  dnBtnI.disabled = imgPosInList <= 0; // ya es el primero (más abajo visualmente)
  dnBtnI.addEventListener('pointerup', e => {
    e.stopPropagation();
    const prevImg = imgPairsAll[imgPosInList - 1];
    if (prevImg) _lyReorderImages(realIdx, prevImg.i);
  });
  /* Eliminar */
  const del = document.createElement('button');
  del.className = 'ed-layer-del';
  del.title = 'Eliminar';
  del.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  del.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm('¿Eliminar esta capa?', ()=>{
      edLayers.splice(realIdx, 1);
      if (edSelectedIdx >= edLayers.length) edSelectedIdx = edLayers.length - 1;
      edPushHistory(); edRedraw(); _lyRender();
    });
  });
  const actsI = document.createElement('div');
  actsI.className = 'ed-layer-actions';
  actsI.appendChild(upBtnI);
  actsI.appendChild(dnBtnI);
  actsI.appendChild(del);
  item.appendChild(actsI);

  /* Drag desde miniatura */
  _lyBindImgDrag(item, thumb, realIdx);
  return item;
}

/* ──────────────────────────────────────────
   DRAG TEXTOS (solo en modo secuencial)
────────────────────────────────────────── */
function _lyBindTextDrag(row, handle, realIdx) {
  let startY, startIdx, active = false;
  let _snap = null;
  let _highlighted = null;

  function onMove(y) {
    if (!active || !_snap) return;
    const target = _snap.find(s => y >= s.rect.top && y <= s.rect.bottom);
    const targetEl = target ? target.el : null;
    if (targetEl !== _highlighted) {
      if (_highlighted) _highlighted.classList.remove('drag-over');
      if (targetEl) targetEl.classList.add('drag-over');
      _highlighted = targetEl;
    }
    _lyDragOver = targetEl ? parseInt(targetEl.dataset.realIdx) : null;
  }

  function end() {
    if (!active) return;
    active = false;
    row.classList.remove('dragging');
    if (_highlighted) { _highlighted.classList.remove('drag-over'); _highlighted = null; }
    _snap = null;
    if (_lyDragOver !== null && _lyDragOver !== startIdx) {
      row.classList.add('was-dragged');
      _lyReorderTexts(startIdx, _lyDragOver);
    }
    _lyDragIdx = _lyDragOver = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) { onMove(e.clientY); }
  function onPointerUp() { end(); }

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    startIdx = realIdx;
    startY = e.clientY;
    active = false;
    _lyDragType = 'text';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Activar drag solo si hay movimiento real (>4px)
    function checkStart(ev) {
      if (Math.abs(ev.clientY - startY) > 4) {
        active = true;
        row.classList.add('dragging');
        _snap = _lySnapshotDragItems('.ed-layer-text-row.draggable', row);
        window.removeEventListener('pointermove', checkStart);
      }
    }
    window.addEventListener('pointermove', checkStart);
  });
}

/* ──────────────────────────────────────────
   DRAG IMÁGENES desde miniatura
────────────────────────────────────────── */
function _lyBindImgDrag(item, handle, realIdx) {
  let startY, startIdx, active = false;
  let _snap = null;
  let _highlighted = null;

  function onMove(y) {
    if (!active || !_snap) return;
    const target = _snap.find(s => y >= s.rect.top && y <= s.rect.bottom);
    const targetEl = target ? target.el : null;
    if (targetEl !== _highlighted) {
      if (_highlighted) _highlighted.classList.remove('drag-over');
      if (targetEl) targetEl.classList.add('drag-over');
      _highlighted = targetEl;
    }
    _lyDragOver = targetEl ? parseInt(targetEl.dataset.realIdx) : null;
  }

  function end() {
    if (!active) return;
    active = false;
    item.classList.remove('dragging');
    if (_highlighted) { _highlighted.classList.remove('drag-over'); _highlighted = null; }
    _snap = null;
    if (_lyDragOver !== null && _lyDragOver !== startIdx) {
      // Si la capa dragged tiene groupId, mover el bloque entero
      const _draggedLayer = typeof edLayers !== 'undefined' ? edLayers[startIdx] : null;
      const _dragGid = _draggedLayer ? _draggedLayer.groupId : null;
      // Si el destino es miembro del mismo grupo → cancelar
      const _destLayer = typeof edLayers !== 'undefined' ? edLayers[_lyDragOver] : null;
      const _destGid = _destLayer ? _destLayer.groupId : null;
      if (_dragGid && _destGid && _dragGid === _destGid) {
        // Mismo grupo: no hacer nada
      } else if (_dragGid) {
        // Determinar dirección: destino por encima o por debajo del bloque
        const _memberIdxs = [];
        for (let _i = 0; _i < edLayers.length; _i++) {
          if (edLayers[_i] && edLayers[_i].groupId === _dragGid) _memberIdxs.push(_i);
        }
        const _maxMember = _memberIdxs[_memberIdxs.length - 1];
        const _minMember = _memberIdxs[0];
        const _dir = _lyDragOver > _maxMember ? +1 : (_lyDragOver < _minMember ? -1 : 0);
        if (_dir !== 0) {
          item.classList.add('was-dragged');
          _lyReorderGroup(_dragGid, _dir);
        }
      } else {
        item.classList.add('was-dragged');
        // Si el destino es miembro de un grupo, ajustar para no colarse dentro
        const _adjDest = _lyAdjustDestForGroup(startIdx, _lyDragOver);
        _lyReorderImages(startIdx, _adjDest);
      }
    }
    _lyDragIdx = _lyDragOver = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) { onMove(e.clientY); }
  function onPointerUp() { end(); }

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    startIdx = realIdx;
    startY = e.clientY;
    active = false;

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    function checkStart(ev) {
      if (Math.abs(ev.clientY - startY) > 4) {
        active = true;
        item.classList.add('dragging');
        _snap = _lySnapshotDragItems('.ed-layer-item', item);
        window.removeEventListener('pointermove', checkStart);
      }
    }
    window.addEventListener('pointermove', checkStart);
  });
}

/* ──────────────────────────────────────────
   REORDENAR
────────────────────────────────────────── */
/* ──────────────────────────────────────────
   ANIMACIÓN DE REORDENACIÓN — FLIP completo
   Anima TODOS los items que cambien de posición
────────────────────────────────────────── */
function _lyAnimatedReorder(layerObj, doReorder) {
  const list = document.getElementById('edLayersList');
  if (!list) { doReorder(); _lyRender(); return; }

  // Asegurar UID en el objeto principal
  if (!layerObj._uid) layerObj._uid = ++_lyUidCounter;
  const movedUid = layerObj._uid;

  // ── FIRST: capturar posición de TODOS los items animables ──
  const snapBefore = new Map();
  list.querySelectorAll('[data-uid]').forEach(el => {
    snapBefore.set(el.dataset.uid, el.getBoundingClientRect().top);
  });

  if (snapBefore.size === 0) { doReorder(); _lyRender(); return; }

  // ── Ejecutar reorder + reconstruir lista ──
  doReorder();
  _lyRender();

  // ── LAST: capturar posiciones nuevas y calcular deltas ──
  const toAnimate = [];
  list.querySelectorAll('[data-uid]').forEach(el => {
    const uid = el.dataset.uid;
    if (!snapBefore.has(uid)) return;
    const delta = snapBefore.get(uid) - el.getBoundingClientRect().top;
    if (Math.abs(delta) < 2) return;
    toAnimate.push({ el, delta, isMoved: uid === String(movedUid) });
  });

  if (toAnimate.length === 0) return;

  // ── INVERT: colocar todos en posición anterior sin transición ──
  toAnimate.forEach(({ el, delta, isMoved }) => {
    el.style.transition = 'none';
    el.style.transform  = 'translateY(' + delta + 'px)';
    el.style.opacity    = isMoved ? '0.5' : '0.72';
  });

  // ── PLAY: doble rAF para forzar paint antes de animar ──
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toAnimate.forEach(({ el, isMoved }) => {
        const dur = isMoved ? 360 : 280;
        el.style.transition = 'transform ' + dur + 'ms cubic-bezier(.4,0,.2,1), opacity ' + dur + 'ms ease';
        el.style.transform  = 'translateY(0)';
        el.style.opacity    = '1';
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
          el.style.transform  = '';
          el.style.opacity    = '';
        }, { once: true });
      });
    });
  });
}

/* Mueve todo el bloque de un grupo una posición arriba (+1) o abajo (-1) en la lista visual.
   "Arriba" en la lista visual = índice mayor en edLayers (se dibuja encima).
   dir: +1 = subir un nivel visual, -1 = bajar un nivel visual. */
/* ──────────────────────────────────────────────────────
   HELPERS DE GRUPO
────────────────────────────────────────────────────── */

/**
 * Devuelve la lista visual de capas con grupos compactados como 1 entrada.
 * Cada entrada: { l, i, groupId?, minGroupIdx?, maxGroupIdx? }
 */
function _lyCompactedVisual() {
  const raw = edLayers.map((l, i) => ({ l, i }))
    .filter(({ l }) => l.type === 'image' || l.type === 'gif' || l.type === 'stroke' ||
                       l.type === 'draw' || l.type === 'shape' || l.type === 'line');
  const result = [];
  const seenGrp = new Set();
  for (const { l, i } of raw) {
    if (l.groupId) {
      if (seenGrp.has(l.groupId)) continue;
      seenGrp.add(l.groupId);
      const mIdxs = raw.filter(x => x.l.groupId === l.groupId).map(x => x.i);
      result.push({ l, i, groupId: l.groupId,
                    minGroupIdx: Math.min(...mIdxs),
                    maxGroupIdx: Math.max(...mIdxs) });
    } else {
      result.push({ l, i });
    }
  }
  return result;
}

/**
 * Si toRealIdx cae dentro del bloque de un grupo diferente al origen,
 * ajusta la posición para quedar justo encima o debajo de ese bloque.
 */
function _lyAdjustDestForGroup(fromIdx, toIdx) {
  const _srcGid = edLayers[fromIdx]?.groupId || null;
  const _dstLay = edLayers[toIdx];
  if (!_dstLay?.groupId || _dstLay.groupId === _srcGid) return toIdx;
  const _dstGid = _dstLay.groupId;
  const _mIdxs = edLayers
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l?.groupId === _dstGid)
    .map(({ i }) => i);
  if (!_mIdxs.length) return toIdx;
  const _minG = Math.min(..._mIdxs);
  const _maxG = Math.max(..._mIdxs);
  // Si movemos hacia arriba (toIdx > fromIdx) → encima del grupo
  if (toIdx > fromIdx) return _maxG + 1;
  // Si movemos hacia abajo → debajo del grupo
  return _minG;
}

/**
 * Garantiza que todos los miembros de groupId sean consecutivos en edLayers.
 * Preserva el orden relativo entre ellos.
 * También mueve las sub-capas vinculadas (fill/pencil/watercolor) de cada stroke/draw.
 *
 * ELIMINADA (v32.38): confirmado que no se llamaba desde ningún sitio.
 * Su cometido ya queda cubierto en todos los puntos donde realmente hace
 * falta, cada uno recalculando los índices en el momento y reinsertando
 * como bloque contiguo (por lo que "sanean" cualquier grupo ya disperso
 * como efecto colateral, sin necesitar un paso de compactación aparte):
 *  - edGroupSelected()      → compactación propia justo tras crear el grupo.
 *  - _lyReorderGroup()      → mueve el bloque completo (incluye companions).
 *  - Atajos de teclado (Ctrl+]/[, Ctrl+Alt+]/[) sobre un objeto con groupId
 *    → mueven el grupo entero como bloque (fix v32.37).
 *  - "Duplicar todo el grupo" → inserta el duplicado ya como bloque contiguo.
 */

function _lyReorderGroup(groupId, dir) {
  // Índices de miembros del grupo, ordenados ascendente

  let memberIdxs = [];
  for (let i = 0; i < edLayers.length; i++) {
    if (edLayers[i] && edLayers[i].groupId === groupId) memberIdxs.push(i);
  }
  if (memberIdxs.length < 1) return;
  // Incluir companions fill/pencil/watercolor de cada miembro: no llevan
  // groupId propio (son parte del stroke/draw, ver edGroupSelected), pero
  // deben moverse siempre junto a su capa dueña — si no, el grupo se
  // desplaza y el companion se queda atrás, separándose de su stroke y
  // rompiendo el orden fill→watercolor→pencil→stroke.
  const _memberSet = new Set(memberIdxs);
  memberIdxs.forEach(mi => {
    const _m = edLayers[mi];
    const _uid = _m?._uid || _m?._fillLayerId;
    if (_uid) {
      edLayers.forEach((l, li) => {
        if (['fill','pencil','watercolor'].includes(l.type) && l._drawLayerId === _uid) _memberSet.add(li);
      });
    }
  });
  memberIdxs = [..._memberSet].sort((a,b)=>a-b);

  // Todos los índices visuales (imagen/dibujo/shape/line)
  const visualAll = edLayers.map((l, i) => ({ l, i }))
    .filter(({ l }) => l.type === 'image' || l.type === 'gif' || l.type === 'stroke' ||
                       l.type === 'draw' || l.type === 'shape' || l.type === 'line');

  const minIdx = memberIdxs[0];
  const maxIdx = memberIdxs[memberIdxs.length - 1];

  if (dir === +1) {
    // Subir: el vecino inmediatamente por encima del bloque (índice mayor en visualAll)
    const above = visualAll.find(({ i }) => i > maxIdx && !memberIdxs.includes(i));
    if (!above) return; // ya está en la cima
    const movedLayer = edLayers[memberIdxs[0]];
    _lyAnimatedReorder(movedLayer, () => {
      // Extraer miembros (de mayor a menor para no desplazar índices)
      const extracted = [];
      for (let k = memberIdxs.length - 1; k >= 0; k--) {
        extracted.unshift(edLayers.splice(memberIdxs[k], 1)[0]);
      }
      // Posición de inserción: justo después del vecino superior (que ahora está desplazado)
      // Calcular nuevo índice del vecino superior después de los splices
      let insertAt = above.i - memberIdxs.filter(mi => mi < above.i).length;
      insertAt++; // insertar después de él
      for (let k = extracted.length - 1; k >= 0; k--) {
        edLayers.splice(insertAt, 0, extracted[k]);
      }
      if (memberIdxs.includes(edSelectedIdx)) {
        const delta = insertAt - minIdx;
        edSelectedIdx += delta;
      }
      edPushHistory(); edRedraw();
    });
  } else {
    // Bajar: el vecino inmediatamente por debajo del bloque (índice menor en visualAll)
    const belowArr = visualAll.filter(({ i }) => i < minIdx && !memberIdxs.includes(i));
    if (!belowArr.length) return; // ya está en el fondo
    const below = belowArr[belowArr.length - 1];
    const movedLayer = edLayers[memberIdxs[0]];
    _lyAnimatedReorder(movedLayer, () => {
      // Extraer miembros de mayor a menor
      const extracted = [];
      for (let k = memberIdxs.length - 1; k >= 0; k--) {
        extracted.unshift(edLayers.splice(memberIdxs[k], 1)[0]);
      }
      // El vecino inferior no se ve afectado por los splices (está debajo de todos los miembros)
      const insertAt = below.i; // insertar en su posición (empujándolo hacia abajo)
      for (let k = extracted.length - 1; k >= 0; k--) {
        edLayers.splice(insertAt, 0, extracted[k]);
      }
      if (memberIdxs.includes(edSelectedIdx)) {
        const delta = insertAt - minIdx;
        edSelectedIdx += delta;
      }
      edPushHistory(); edRedraw();
    });
  }
}

function _lyReorderTexts(fromRealIdx, toRealIdx) {
  const textIdxs = edLayers.map((l,i) => ({l,i}))
    .filter(({l}) => l.type==='text' || l.type==='bubble')
    .map(({i}) => i);
  const fromPos = textIdxs.indexOf(fromRealIdx);
  const toPos   = textIdxs.indexOf(toRealIdx);
  if (fromPos < 0 || toPos < 0) return;

  const _movedLayerTxt = edLayers[fromRealIdx];
  _lyAnimatedReorder(_movedLayerTxt, () => {
    const moved = edLayers.splice(fromRealIdx, 1)[0];
    const adjustedTo = fromRealIdx < toRealIdx ? toRealIdx : toRealIdx;
    edLayers.splice(adjustedTo, 0, moved);
    if (edSelectedIdx === fromRealIdx) edSelectedIdx = adjustedTo;
    edPushHistory(); edRedraw();
  });
}

function _lyReorderLayers(fromRealIdx, toRealIdx) {
  const _moved = edLayers[fromRealIdx];
  _lyAnimatedReorder(_moved, () => {
    // Recoger todas las capas del grupo vinculadas (fill, pencil, watercolor)
    const _uid = _moved._uid || _moved._fillLayerId;
    const _groupLayers = _uid ? edLayers.filter(l =>
      l !== _moved &&
      (l.type==='fill' || l.type==='pencil' || l.type==='watercolor') &&
      l._drawLayerId === _uid
    ) : [];
    // Quitar la capa principal + grupo (de mayor a menor índice para no desplazar)
    const _removeIdxs = [fromRealIdx, ..._groupLayers.map(l=>edLayers.indexOf(l))]
      .filter(i=>i>=0).sort((a,b)=>b-a);
    _removeIdxs.forEach(i => edLayers.splice(i, 1));
    // Calcular destino ajustado
    const _removed = _removeIdxs.length;
    const _toAdj = Math.max(0, toRealIdx - (fromRealIdx < toRealIdx ? _removed : 0));
    // Reinsertar en orden: fill → watercolor → pencil → stroke
    const _fl     = _groupLayers.find(l=>l.type==='fill');
    const _wc     = _groupLayers.find(l=>l.type==='watercolor');
    const _pencil = _groupLayers.find(l=>l.type==='pencil');
    const _toInsert = [_fl, _wc, _pencil, _moved].filter(Boolean);
    edLayers.splice(_toAdj, 0, ..._toInsert);
    if (edSelectedIdx === fromRealIdx) edSelectedIdx = _toAdj + _toInsert.length - 1;
    edPushHistory(); edRedraw();
  });
}

function _lyReorderImages(fromRealIdx, toRealIdx) {
  // Ajustar destino si cae dentro de un bloque de grupo ajeno
  const _adjTo = _lyAdjustDestForGroup(fromRealIdx, toRealIdx);
  const _movedLayerImg = edLayers[fromRealIdx];
  _lyAnimatedReorder(_movedLayerImg, () => {
    const moved = edLayers.splice(fromRealIdx, 1)[0];
    const to = fromRealIdx < _adjTo ? _adjTo - 1 : _adjTo;
    edLayers.splice(to, 0, moved);
    if (edSelectedIdx === fromRealIdx) edSelectedIdx = to;
    edPushHistory(); edRedraw();
  });
}

/* ──────────────────────────────────────────
   OPACIDAD (solo desktop)
────────────────────────────────────────── */
function _lyMakeOpRow(initVal, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'ed-layer-op-row';
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = 0; slider.max = 100;
  slider.value = Math.round(initVal * 100);
  slider.className = 'ed-layer-slider';
  const val = document.createElement('span');
  val.className = 'ed-layer-op-val';
  val.textContent = slider.value + '%';
  slider.addEventListener('input', () => {
    val.textContent = slider.value + '%';
    onChange(slider.value / 100);
  });
  wrap.appendChild(slider);
  wrap.appendChild(val);
  return wrap;
}

/* ──────────────────────────────────────────
   MINIATURA
────────────────────────────────────────── */
function _lyDrawThumb(canvas, la) {
  // Centra el objeto en el thumb independientemente de su posición en el canvas
  const ctx = canvas.getContext('2d');
  const sw = canvas.width, sh = canvas.height;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, sw, sh);
  const _pw = typeof edPageW === 'function' ? edPageW() : 360;
  const _ph = typeof edPageH === 'function' ? edPageH() : 780;
  const pad = 4;
  ctx.save();
  ctx.globalAlpha = la.opacity ?? 1;
  // Fuente de imagen: GIF usa _oc, imagen/APNG usa img
  const _src = (la.type === 'gif')
    ? (la._oc && la._ready ? la._oc : null)
    : (la.type === 'image' && la.img && la.img.complete && la.img.naturalWidth > 0 ? la.img : null);
  if (_src) {
    // Dimensiones del objeto en px
    const ow = (la.width  || 0.1) * _pw;
    const oh = (la.height || 0.1) * _ph;
    const rot = (la.rotation || 0) * Math.PI / 180;
    const cosR = Math.abs(Math.cos(rot)), sinR = Math.abs(Math.sin(rot));
    const bboxW = ow * cosR + oh * sinR;
    const bboxH = ow * sinR + oh * cosR;
    const scale = Math.min((sw - pad*2) / Math.max(1, bboxW),
                           (sh - pad*2) / Math.max(1, bboxH));
    ctx.translate(sw / 2, sh / 2);
    ctx.rotate(rot);
    ctx.drawImage(_src, -ow / 2 * scale, -oh / 2 * scale, ow * scale, oh * scale);
  } else if (la.type === 'text' || la.type === 'bubble') {
    const ow = (la.width  || 0.1) * _pw;
    const oh = (la.height || 0.1) * _ph;
    const scale = Math.min((sw - pad*2) / Math.max(1, ow),
                           (sh - pad*2) / Math.max(1, oh));
    const dw = ow * scale, dh = oh * scale;
    const dx = (sw - dw) / 2, dy = (sh - dh) / 2;
    ctx.fillStyle = la.backgroundColor || '#fff';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = la.borderColor || '#bbb';
    ctx.lineWidth = 1;
    ctx.strokeRect(dx, dy, dw, dh);
    ctx.fillStyle = la.color || '#222';
    ctx.font = Math.max(7, Math.round(Math.min(dw * 0.25, dh * 0.45))) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((la.text||'').substring(0, 14), dx + dw / 2, dy + dh / 2);
  }
  ctx.restore();
}

/* ──────────────────────────────────────────
   MINIATURA SHAPE / LINE
────────────────────────────────────────── */
function _lyDrawGroupThumb(canvas, la) {
  const ctx = canvas.getContext('2d');
  const sw = canvas.width, sh = canvas.height;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, sw, sh);
  if (la._cache && la._cache.width > 0) {
    ctx.save();
    ctx.globalAlpha = la.opacity ?? 1;
    const pad = 4;
    const scale = Math.min((sw-pad*2)/la._cache.width, (sh-pad*2)/la._cache.height);
    const dx = pad + (sw-pad*2 - la._cache.width*scale)/2;
    const dy = pad + (sh-pad*2 - la._cache.height*scale)/2;
    ctx.drawImage(la._cache, dx, dy, la._cache.width*scale, la._cache.height*scale);
    ctx.restore();
  } else {
    ctx.fillStyle = '#bbb';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⊞', sw/2, sh/2);
  }
}

function _lyDrawShapeThumb(canvas, la) {
  const ctx = canvas.getContext('2d');
  const sw = canvas.width, sh = canvas.height;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, sw, sh);
  ctx.save();
  ctx.globalAlpha = la.opacity ?? 1;
  const pad = 6;

  // Usar el render real (la.draw) en un canvas workspace auxiliar para ambos tipos,
  // igual que con LineLayer — garantiza fidelidad exacta con cornerRadii y V/C
  const ED_W = typeof ED_CANVAS_W !== 'undefined' ? ED_CANVAS_W : 1800;
  const ED_H = typeof ED_CANVAS_H !== 'undefined' ? ED_CANVAS_H : 2340;
  const pw = typeof edPageW === 'function' ? edPageW() : 360;
  const ph = typeof edPageH === 'function' ? edPageH() : 780;
  const mx = typeof edMarginX === 'function' ? edMarginX() : (ED_W-pw)/2;
  const my = typeof edMarginY === 'function' ? edMarginY() : (ED_H-ph)/2;
  const aux = document.createElement('canvas');
  aux.width = ED_W; aux.height = ED_H;
  la.draw(aux.getContext('2d'));
  // Bbox del objeto en coords workspace
  const ocx = mx + la.x*pw, ocy = my + la.y*ph;
  const ohw = la.width*pw/2+4, ohh = la.height*ph/2+4;
  const bx=Math.max(0,ocx-ohw), by=Math.max(0,ocy-ohh);
  const bw=Math.min(ED_W-bx,ohw*2), bh=Math.min(ED_H-by,ohh*2);
  if(bw>0 && bh>0){
    const scale=Math.min((sw-pad*2)/bw,(sh-pad*2)/bh);
    const dx=pad+(sw-pad*2-bw*scale)/2, dy=pad+(sh-pad*2-bh*scale)/2;
    ctx.drawImage(aux,bx,by,bw,bh,dx,dy,bw*scale,bh*scale);
  }
  ctx.restore();
}
