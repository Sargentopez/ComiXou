/* ============================================================
   editor-layers.js — Panel de capas v4
   ============================================================ */

let _lyDragIdx  = null;
let _lyDragOver = null;
let _lyDragType = null; // 'text' | 'image'
let _lyUidCounter = 0;  // IDs únicos estables para animación FLIP

/* ──────────────────────────────────────────
   ABRIR / CERRAR
────────────────────────────────────────── */
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
  // Permitir scroll dentro del overlay; bloquear todo lo demás
  if (!e.target.closest('#edLayersOverlay') && !e.target.closest('#edPagesOverlay')) {
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

  const page     = edPages[edCurrentPage];
  if(!page.textMode) page.textMode = 'immediate'; // fallback para proyectos antiguos
  const isSeq    = page.textMode === 'sequential';
  const imgPairs = edLayers.map((l,i) => ({l,i})).filter(({l}) => l.type==='image'); // mantenido por compatibilidad
  const textObjs = edLayers.filter(l => l.type==='text' || l.type==='bubble');

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
    .filter(({l})=>l.type==='image'||l.type==='stroke'||l.type==='draw'||l.type==='shape'||l.type==='line');

  if (visualPairs.length === 0) {
    const e = document.createElement('p');
    e.className = 'ed-layer-sub-empty';
    e.textContent = 'Sin imágenes ni dibujos';
    list.appendChild(e);
  } else {
    // El primero del array edLayers aparece el último en la lista (más abajo visualmente)
    [...visualPairs].reverse().forEach(({l, i}) => {
      list.appendChild(_lyBuildVisualItem(l, i, i === edSelectedIdx));
    });
  }
}

/* ──────────────────────────────────────────
   FILA DE TEXTO/BOCADILLO
────────────────────────────────────────── */
function _lyBuildTextRow(la, realIdx, seqPos, selected, draggable) {
  const row = document.createElement('div');
  row.className = 'ed-layer-text-row' + (selected ? ' selected' : '') + (draggable ? ' draggable' : '');
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
      edSelectedIdx = realIdx;
      edRedraw();
      edCloseLayers();
    }
    row.classList.remove('was-dragged');
  });
  row.appendChild(thumb);

  /* Nombre */
  const lbl = document.createElement('span');
  lbl.className = 'ed-layer-name';
  lbl.textContent = (la.type === 'bubble' ? '💬 ' : 'T ') + (la.text || '').substring(0, 22);
  row.appendChild(lbl);

  /* Flechas subir/bajar nivel */
  const textObjs = edLayers.filter(l => l.type==='text' || l.type==='bubble');
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
    if(!confirm('¿Eliminar esta capa?')) return;
    edLayers.splice(realIdx, 1);
    if (edSelectedIdx >= edLayers.length) edSelectedIdx = edLayers.length - 1;
    edPushHistory(); edRedraw(); _lyRender();
  });
  // Agrupar controles en un div que nunca se comprime
  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';
  acts.appendChild(upBtn);
  acts.appendChild(dnBtn);
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
      edSelectedIdx = realIdx;
      edRedraw();
      edCloseLayers();
    }
    item.classList.remove('was-dragged');
  });
  item.appendChild(thumb);

  /* Info */
  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  const _grpTag = la.groupId ? ' 🔗' : '';
  if (isDrawType) {
    name.textContent = (la.type === 'draw' ? '✏️ Dibujando…' : '✏️ Dibujo') + _grpTag;
  } else if (la.type === 'shape') {
    name.textContent = (la.shape === 'ellipse' ? '◯ Elipse' : '▭ Rectángulo') + _grpTag;
  } else if (la.type === 'line') {
    name.textContent = (la.closed ? '⬠ Polígono' : '╱ Recta') + _grpTag;
  } else {
    name.textContent = 'Imagen ' + (realIdx + 1) + _grpTag;
  }
  info.appendChild(name);
  item.appendChild(info);

  /* Flechas subir/bajar — dentro de los elementos visuales */
  const visualAll = edLayers.map((l,i)=>({l,i}))
    .filter(({l})=>l.type==='image'||l.type==='stroke'||l.type==='draw'||l.type==='shape'||l.type==='line');
  const posInList = visualAll.findIndex(({i})=>i===realIdx);

  const upBtn = document.createElement('button');
  upBtn.className = 'ed-layer-arrow';
  upBtn.title = 'Subir nivel';
  upBtn.textContent = '▲';
  upBtn.disabled = posInList >= visualAll.length - 1;
  upBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    const next = visualAll[posInList + 1];
    if (next) _lyReorderLayers(realIdx, next.i + 1);
  });

  const dnBtn = document.createElement('button');
  dnBtn.className = 'ed-layer-arrow';
  dnBtn.title = 'Bajar nivel';
  dnBtn.textContent = '▼';
  dnBtn.disabled = posInList <= 0;
  dnBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    const prev = visualAll[posInList - 1];
    if (prev) _lyReorderLayers(realIdx, prev.i);
  });

  /* Eliminar */
  const del = document.createElement('button');
  del.className = 'ed-layer-del';
  del.title = 'Eliminar';
  del.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  del.addEventListener('pointerup', e => {
    e.stopPropagation();
    if(!confirm('¿Eliminar esta capa?')) return;
    edLayers.splice(realIdx, 1);
    if (edSelectedIdx >= edLayers.length) edSelectedIdx = edLayers.length - 1;
    edPushHistory(); edRedraw(); _lyRender();
  });

  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';
  acts.appendChild(upBtn);
  acts.appendChild(dnBtn);
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
  if (la.type === 'stroke' && la._canvas && la._canvas.width > 0) {
    // Dibujar el canvas del stroke escalado al thumb, con posición relativa
    const pw = edPageW() || ED_PAGE_W, ph = edPageH() || ED_PAGE_H;
    const lw = la.width * pw, lh = la.height * ph;
    const cx = la.x * pw, cy = la.y * ph;
    // Escalar todo al thumb
    const sx = tw / pw, sy = th / ph;
    ctx.save();
    ctx.drawImage(la._canvas,
      0, 0, la._canvas.width, la._canvas.height,
      (cx - lw/2) * sx, (cy - lh/2) * sy,
      lw * sx, lh * sy);
    ctx.restore();
  } else if (la.type === 'draw' && la._canvas) {
    // DrawLayer ocupa todo el workspace
    const pw = edPageW() || ED_PAGE_W, ph = edPageH() || ED_PAGE_H;
    ctx.drawImage(la._canvas,
      edMarginX ? edMarginX() : 0, edMarginY ? edMarginY() : 0,
      pw, ph,
      0, 0, tw, th);
  } else {
    ctx.fillStyle = '#ddd';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✏️', tw/2, th/2);
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
  name.textContent = 'Imagen ' + (realIdx + 1);
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
    if(!confirm('¿Eliminar esta capa?')) return;
    edLayers.splice(realIdx, 1);
    if (edSelectedIdx >= edLayers.length) edSelectedIdx = edLayers.length - 1;
    edPushHistory(); edRedraw(); _lyRender();
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

  function onMove(y) {
    if (!active) return;
    const rows = [...document.querySelectorAll('.ed-layer-text-row.draggable')];
    document.querySelectorAll('.ed-layer-text-row').forEach(r => r.classList.remove('drag-over'));
    const target = rows.find(r => {
      if (r === row) return false;
      const rect = r.getBoundingClientRect();
      return y >= rect.top && y <= rect.bottom;
    });
    if (target) {
      target.classList.add('drag-over');
      _lyDragOver = parseInt(target.dataset.realIdx);
    } else {
      _lyDragOver = null;
    }
  }

  function end() {
    if (!active) return;
    active = false;
    row.classList.remove('dragging');
    document.querySelectorAll('.ed-layer-text-row').forEach(r => r.classList.remove('drag-over'));
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

  function onMove(y) {
    if (!active) return;
    const items = [...document.querySelectorAll('.ed-layer-item')];
    document.querySelectorAll('.ed-layer-item').forEach(i => i.classList.remove('drag-over'));
    const target = items.find(i => {
      if (i === item) return false;
      const rect = i.getBoundingClientRect();
      return y >= rect.top && y <= rect.bottom;
    });
    if (target) {
      target.classList.add('drag-over');
      _lyDragOver = parseInt(target.dataset.realIdx);
    } else {
      _lyDragOver = null;
    }
  }

  function end() {
    if (!active) return;
    active = false;
    item.classList.remove('dragging');
    document.querySelectorAll('.ed-layer-item').forEach(i => i.classList.remove('drag-over'));
    if (_lyDragOver !== null && _lyDragOver !== startIdx) {
      item.classList.add('was-dragged');
      _lyReorderImages(startIdx, _lyDragOver);
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
    const moved = edLayers.splice(fromRealIdx, 1)[0];
    const to = fromRealIdx < toRealIdx ? toRealIdx - 1 : toRealIdx;
    edLayers.splice(to, 0, moved);
    if (edSelectedIdx === fromRealIdx) edSelectedIdx = to;
    edPushHistory(); edRedraw();
  });
}

function _lyReorderImages(fromRealIdx, toRealIdx) {
  const _movedLayerImg = edLayers[fromRealIdx];
  _lyAnimatedReorder(_movedLayerImg, () => {
    const moved = edLayers.splice(fromRealIdx, 1)[0];
    const to = fromRealIdx < toRealIdx ? toRealIdx - 1 : toRealIdx;
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
  const ctx = canvas.getContext('2d');
  const sw = canvas.width, sh = canvas.height;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, sw, sh);
  ctx.save();
  ctx.globalAlpha = la.opacity ?? 1;
  if (la.type === 'image' && la.img && la.img.complete && la.img.naturalWidth > 0) {
    ctx.drawImage(la.img, (la.x-la.width/2)*sw, (la.y-la.height/2)*sh, la.width*sw, la.height*sh);
  } else if (la.type === 'text' || la.type === 'bubble') {
    const x=(la.x-la.width/2)*sw, y=(la.y-la.height/2)*sh, w=la.width*sw, h=la.height*sh;
    ctx.fillStyle = la.backgroundColor || '#fff';
    ctx.fillRect(x,y,w,h);
    ctx.strokeStyle = la.borderColor || '#bbb';
    ctx.lineWidth = 1;
    ctx.strokeRect(x,y,w,h);
    ctx.fillStyle = la.color || '#222';
    ctx.font = Math.max(7, Math.round(sw*0.13)) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((la.text||'').substring(0,14), sw/2, sh/2);
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
