/* ============================================================
   editor-layers.js — Panel de capas v3
   ============================================================ */

let _lyDragIdx  = null;
let _lyDragOver = null;

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

  const imgPairs = edLayers.map((l,i) => ({l,i})).filter(({l}) => l.type==='image');
  const textObjs = edLayers.filter(l => l.type==='text' || l.type==='bubble');

  /* ── SECCIÓN TEXTOS ── */
  const tTitle = document.createElement('div');
  tTitle.className = 'ed-ly-section-title';
  tTitle.textContent = 'Textos';
  list.appendChild(tTitle);

  /* Botones modo texto: inmediatos / secuenciales */
  const page = edPages[edCurrentPage];
  const textModeRow = document.createElement('div');
  textModeRow.className = 'ed-ly-textmode-row';

  const btnImm = document.createElement('button');
  btnImm.className = 'ed-ly-mode-btn' + ((!page.textMode || page.textMode === 'immediate') ? ' active' : '');
  btnImm.textContent = 'Inmediatos';
  btnImm.title = 'Todos los textos aparecen a la vez';
  btnImm.addEventListener('pointerup', () => {
    page.textMode = 'immediate';
    btnImm.classList.add('active');
    btnSeq.classList.remove('active');
    _lyRender();
  });

  const btnSeq = document.createElement('button');
  btnSeq.className = 'ed-ly-mode-btn' + (page.textMode === 'sequential' ? ' active' : '');
  btnSeq.textContent = 'Secuenciales';
  btnSeq.title = 'Las flechas del visor revelan los textos uno a uno';
  btnSeq.addEventListener('pointerup', () => {
    page.textMode = 'sequential';
    btnSeq.classList.add('active');
    btnImm.classList.remove('active');
    _lyRender();
  });

  textModeRow.appendChild(btnImm);
  textModeRow.appendChild(btnSeq);
  list.appendChild(textModeRow);

  if (textObjs.length === 0) {
    const e = document.createElement('p');
    e.className = 'ed-layer-sub-empty';
    e.textContent = 'Sin textos ni bocadillos';
    list.appendChild(e);
  } else {
    textObjs.forEach(la => {
      const realIdx = edLayers.indexOf(la);
      list.appendChild(_lyBuildTextRow(la, realIdx, realIdx === edSelectedIdx));
    });
  }

  /* ── SEPARADOR ── */
  const sep = document.createElement('div');
  sep.className = 'ed-layer-sep';
  list.appendChild(sep);

  /* ── SECCIÓN IMÁGENES ── */
  const iTitle = document.createElement('div');
  iTitle.className = 'ed-ly-section-title';
  iTitle.textContent = 'Imágenes';
  list.appendChild(iTitle);

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
   Con botones de orden: ↑ subir / ↓ bajar dentro del grupo de textos
────────────────────────────────────────── */
function _lyBuildTextRow(la, realIdx, selected) {
  const row = document.createElement('div');
  row.className = 'ed-layer-text-row' + (selected ? ' selected' : '');

  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb-sm';
  thumb.width = 56; thumb.height = 42;
  _lyDrawThumb(thumb, la);
  thumb.title = 'Seleccionar';
  thumb.addEventListener('pointerup', () => {
    edSelectedIdx = realIdx;
    edRedraw();
    edCloseLayers();
  });

  const lbl = document.createElement('span');
  lbl.className = 'ed-layer-name';
  const page2 = edPages[edCurrentPage];
  const textIdxsAll = edLayers.map((l,i)=>({l,i})).filter(({l})=>l.type==='text'||l.type==='bubble');
  const seqPos = textIdxsAll.findIndex(({i}) => i === realIdx);
  const seqLabel = page2.textMode === 'sequential' ? ` [${seqPos + 1}]` : '';
  lbl.textContent = (la.type === 'bubble' ? '💬 ' : 'T ') + (la.text || '').substring(0, 20) + seqLabel;

  /* Botones de orden dentro del grupo texto */
  const orderWrap = document.createElement('div');
  orderWrap.className = 'ed-ly-order-btns';

  const upBtn = document.createElement('button');
  upBtn.className = 'ed-ly-order-btn';
  upBtn.title = 'Subir';
  upBtn.textContent = '↑';
  upBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    _lyMoveText(realIdx, -1);
  });

  const downBtn = document.createElement('button');
  downBtn.className = 'ed-ly-order-btn';
  downBtn.title = 'Bajar';
  downBtn.textContent = '↓';
  downBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    _lyMoveText(realIdx, +1);
  });

  orderWrap.appendChild(upBtn);
  orderWrap.appendChild(downBtn);

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

  row.appendChild(thumb);
  row.appendChild(lbl);
  row.appendChild(orderWrap);
  row.appendChild(del);
  return row;
}

/* Mover un texto/bocadillo dentro del subgrupo de textos en edLayers */
function _lyMoveText(realIdx, dir) {
  // Obtener solo los índices de texto en edLayers, en orden
  const textIdxs = edLayers.map((l,i) => ({l,i}))
    .filter(({l}) => l.type==='text' || l.type==='bubble')
    .map(({i}) => i);

  const pos = textIdxs.indexOf(realIdx);
  const targetPos = pos + dir;
  if (targetPos < 0 || targetPos >= textIdxs.length) return;

  const targetRealIdx = textIdxs[targetPos];

  // Intercambiar en edLayers
  const tmp = edLayers[realIdx];
  edLayers[realIdx] = edLayers[targetRealIdx];
  edLayers[targetRealIdx] = tmp;

  // Actualizar selección
  if (edSelectedIdx === realIdx) edSelectedIdx = targetRealIdx;
  else if (edSelectedIdx === targetRealIdx) edSelectedIdx = realIdx;

  edPushHistory(); edRedraw(); _lyRender();
}

/* ──────────────────────────────────────────
   ITEM DE IMAGEN (drag & drop)
────────────────────────────────────────── */
function _lyBuildImgItem(la, realIdx, selected) {
  const item = document.createElement('div');
  item.className = 'ed-layer-item' + (selected ? ' selected' : '');
  item.dataset.realIdx = realIdx;
  item.draggable = true;

  const handle = document.createElement('span');
  handle.className = 'ed-layer-handle';
  handle.innerHTML = '⠿';

  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb';
  thumb.width = 80; thumb.height = 60;
  _lyDrawThumb(thumb, la);
  thumb.title = 'Seleccionar';
  thumb.addEventListener('pointerup', () => {
    edSelectedIdx = realIdx;
    edRedraw();
    edCloseLayers();
  });

  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  name.textContent = 'Imagen ' + (realIdx + 1);

  /* Opacidad — solo en no táctil */
  const isTouchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  if (!isTouchDevice) {
    const opRow = _lyMakeOpRow(la.opacity ?? 1, val => { la.opacity = val; edRedraw(); });
    info.appendChild(name);
    info.appendChild(opRow);
  } else {
    info.appendChild(name);
  }

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

  item.appendChild(handle);
  item.appendChild(thumb);
  item.appendChild(info);
  item.appendChild(del);

  /* Drag desktop */
  item.addEventListener('dragstart', e => {
    _lyDragIdx = realIdx;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    document.querySelectorAll('.ed-layer-item').forEach(el => el.classList.remove('drag-over'));
    if (_lyDragIdx !== null && _lyDragOver !== null && _lyDragIdx !== _lyDragOver) {
      _lyReorderImages(_lyDragIdx, _lyDragOver);
    }
    _lyDragIdx = _lyDragOver = null;
  });
  item.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.ed-layer-item').forEach(el => el.classList.remove('drag-over'));
    item.classList.add('drag-over');
    _lyDragOver = parseInt(item.dataset.realIdx);
  });

  _lyBindTouchDragImg(item, realIdx);
  return item;
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
   REORDENAR IMÁGENES
────────────────────────────────────────── */
function _lyReorderImages(fromRealIdx, toRealIdx) {
  const moved = edLayers.splice(fromRealIdx, 1)[0];
  const to = fromRealIdx < toRealIdx ? toRealIdx - 1 : toRealIdx;
  edLayers.splice(to, 0, moved);
  if (edSelectedIdx === fromRealIdx) edSelectedIdx = to;
  edPushHistory(); edRedraw(); _lyRender();
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
   TOUCH DRAG MOBILE (imágenes)
────────────────────────────────────────── */
function _lyBindTouchDragImg(item, realIdx) {
  let startIdx;
  const handle = item.querySelector('.ed-layer-handle');
  handle.addEventListener('touchstart', e => {
    e.preventDefault();
    startIdx = realIdx;
    item.classList.add('dragging');
  }, { passive: false });
  item.addEventListener('touchmove', e => {
    if (!item.classList.contains('dragging')) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    document.querySelectorAll('.ed-layer-item').forEach(el => el.classList.remove('drag-over'));
    const target = [...document.querySelectorAll('.ed-layer-item')].find(el => {
      const r = el.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    });
    if (target) { target.classList.add('drag-over'); _lyDragOver = parseInt(target.dataset.realIdx); }
  }, { passive: false });
  item.addEventListener('touchend', () => {
    item.classList.remove('dragging');
    document.querySelectorAll('.ed-layer-item').forEach(el => el.classList.remove('drag-over'));
    if (_lyDragOver !== null && startIdx !== _lyDragOver) _lyReorderImages(startIdx, _lyDragOver);
    _lyDragOver = null;
  });
}
