/* ============================================================
   editor-layers.js — Panel de capas v4
   ============================================================ */

let _lyDragIdx  = null;
let _lyDragOver = null;
let _lyDragType = null; // 'text' | 'image'

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
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function edCloseLayers() {
  const ov = document.getElementById('edLayersOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  setTimeout(() => ov.remove(), 250);
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
  const imgPairs = edLayers.map((l,i) => ({l,i})).filter(({l}) => l.type==='image');
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
  const sep = document.createElement('div');
  sep.className = 'ed-layer-sep';
  list.appendChild(sep);

  /* ══ SECCIÓN IMÁGENES ══ */
  const iTitle = document.createElement('div');
  iTitle.className = 'ed-ly-section-title';
  iTitle.textContent = 'Imágenes';
  list.appendChild(iTitle);

  const imgHint = document.createElement('div');
  imgHint.className = 'ed-ly-drag-hint active';
  imgHint.textContent = 'Arrastra para ordenar visualización';
  list.appendChild(imgHint);

  if (imgPairs.length === 0) {
    const e = document.createElement('p');
    e.className = 'ed-layer-sub-empty';
    e.textContent = 'Sin imágenes';
    list.appendChild(e);
  } else {
    [...imgPairs].reverse().forEach(({l, i}) => {
      list.appendChild(_lyBuildImgItem(l, i, i === edSelectedIdx));
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
function _lyBuildImgItem(la, realIdx, selected) {
  const item = document.createElement('div');
  item.className = 'ed-layer-item' + (selected ? ' selected' : '');
  item.dataset.realIdx = realIdx;

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
function _lyReorderTexts(fromRealIdx, toRealIdx) {
  const textIdxs = edLayers.map((l,i) => ({l,i}))
    .filter(({l}) => l.type==='text' || l.type==='bubble')
    .map(({i}) => i);

  const fromPos = textIdxs.indexOf(fromRealIdx);
  const toPos   = textIdxs.indexOf(toRealIdx);
  if (fromPos < 0 || toPos < 0) return;

  // Mover fromRealIdx antes/después de toRealIdx en edLayers
  const moved = edLayers.splice(fromRealIdx, 1)[0];
  const adjustedTo = fromRealIdx < toRealIdx ? toRealIdx - 1 : toRealIdx;
  edLayers.splice(adjustedTo, 0, moved);
  if (edSelectedIdx === fromRealIdx) edSelectedIdx = adjustedTo;
  edPushHistory(); edRedraw(); _lyRender();
}

function _lyReorderImages(fromRealIdx, toRealIdx) {
  const moved = edLayers.splice(fromRealIdx, 1)[0];
  const to = fromRealIdx < toRealIdx ? toRealIdx - 1 : toRealIdx;
  edLayers.splice(to, 0, moved);
  if (edSelectedIdx === fromRealIdx) edSelectedIdx = to;
  edPushHistory(); edRedraw(); _lyRender();
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
