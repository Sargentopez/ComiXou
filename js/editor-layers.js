/* ============================================================
   editor-layers.js — Panel de capas v2 (arquitectura B)

   Estructura visual del panel:
   ┌─────────────────────────────────┐
   │  CAPA TEXTOS  [opacidad] [ojo]  │  ← siempre arriba, no se mueve
   │    · Bocadillo 1                │
   │    · Texto 2                    │
   ├─────────────────────────────────┤
   │  Imagen 1   [op] [⠿] [🗑]      │  ← reordenables entre sí
   │  Imagen 2   [op] [⠿] [🗑]      │
   └─────────────────────────────────┘
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
      <p class="ed-fulloverlay-hint">La capa de textos siempre está encima · arrastra las imágenes para reordenar</p>
      <div class="ed-layers-list" id="edLayersList"></div>
      <div class="ed-fulloverlay-actions">
        <button class="ed-btn-sec" id="edLayersAddText">+ Texto</button>
        <button class="ed-btn-sec" id="edLayersAddBubble">+ Bocadillo</button>
        <button class="ed-btn-sec" id="edLayersAddImg">+ Imagen</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _lyRender();

  overlay.querySelector('#edLayersClose').addEventListener('click', edCloseLayers);
  overlay.querySelector('#edLayersAddText').addEventListener('click', () => { edCloseLayers(); edAddText(); });
  overlay.querySelector('#edLayersAddBubble').addEventListener('click', () => { edCloseLayers(); edAddBubble(); });
  overlay.querySelector('#edLayersAddImg').addEventListener('click', () => { edCloseLayers(); document.getElementById('edImgInput')?.click(); });

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

  const page      = edPages[edCurrentPage];
  const imgPairs  = edLayers.map((l,i)=>({l,i})).filter(({l})=>l.type==='image');
  const textObjs  = edLayers.filter(l=>l.type==='text'||l.type==='bubble');

  /* ── SECCIÓN TEXTOS (fija arriba) ── */
  const textSection = _lyMakeSection(
    '<span class="ed-ly-icon">✏️</span> <strong>Capa de Textos</strong> <span class="ed-layer-fixed-badge">siempre encima</span>',
    true
  );

  /* Control de opacidad global del grupo */
  const tOpRow = _lyMakeOpRow(page.textLayerOpacity ?? 1, val => {
    page.textLayerOpacity = val;
    edRedraw();
  });
  textSection.querySelector('.ed-layer-section-header').appendChild(tOpRow);

  if (textObjs.length === 0) {
    const e = document.createElement('p');
    e.className = 'ed-layer-sub-empty';
    e.textContent = 'Sin textos ni bocadillos';
    textSection.appendChild(e);
  } else {
    textObjs.forEach(la => {
      const realIdx = edLayers.indexOf(la);
      textSection.appendChild(_lyBuildTextRow(la, realIdx, realIdx === edSelectedIdx));
    });
  }
  list.appendChild(textSection);

  /* ── SEPARADOR ── */
  const sep = document.createElement('div');
  sep.className = 'ed-layer-sep';
  list.appendChild(sep);

  /* ── SECCIÓN IMÁGENES (reordenables) ── */
  const imgSection = _lyMakeSection(
    '<span class="ed-ly-icon">🖼️</span> <strong>Imágenes</strong> <span class="ed-layer-hint-small">arrastra para reordenar</span>',
    false
  );

  if (imgPairs.length === 0) {
    const e = document.createElement('p');
    e.className = 'ed-layer-sub-empty';
    e.textContent = 'Sin imágenes';
    imgSection.appendChild(e);
  } else {
    /* Invertir: la última en edLayers = encima = primero en la lista */
    [...imgPairs].reverse().forEach(({l, i}) => {
      imgSection.appendChild(_lyBuildImgItem(l, i, i === edSelectedIdx));
    });
  }
  list.appendChild(imgSection);
}

function _lyMakeSection(titleHTML, isText) {
  const sec = document.createElement('div');
  sec.className = 'ed-layer-section';
  const hdr = document.createElement('div');
  hdr.className = 'ed-layer-section-header' + (isText ? ' ed-layer-text-header' : '');
  hdr.innerHTML = titleHTML;
  sec.appendChild(hdr);
  return sec;
}

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
   FILA DE TEXTO/BOCADILLO
────────────────────────────────────────── */
function _lyBuildTextRow(la, realIdx, selected) {
  const row = document.createElement('div');
  row.className = 'ed-layer-text-row' + (selected ? ' selected' : '');

  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb-sm';
  thumb.width = 56; thumb.height = 42;
  _lyDrawThumb(thumb, la);
  thumb.title = 'Seleccionar';
  thumb.addEventListener('click', () => { edSelectedIdx = realIdx; edRedraw(); edCloseLayers(); });

  const icon = la.type === 'bubble' ? '💬' : 'T';
  const lbl = document.createElement('span');
  lbl.className = 'ed-layer-name';
  lbl.textContent = icon + ' ' + (la.text || '').substring(0, 22);

  const del = document.createElement('button');
  del.className = 'ed-layer-del'; del.title = 'Eliminar'; del.innerHTML = '🗑';
  del.addEventListener('click', e => {
    e.stopPropagation();
    edLayers.splice(realIdx, 1);
    if (edSelectedIdx >= edLayers.length) edSelectedIdx = edLayers.length - 1;
    edPushHistory(); edRedraw(); _lyRender();
  });

  row.appendChild(thumb);
  row.appendChild(lbl);
  row.appendChild(del);
  return row;
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
  thumb.addEventListener('click', () => { edSelectedIdx = realIdx; edRedraw(); edCloseLayers(); });

  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  name.textContent = 'Imagen ' + (realIdx + 1);
  const opRow = _lyMakeOpRow(la.opacity ?? 1, val => { la.opacity = val; edRedraw(); });
  info.appendChild(name);
  info.appendChild(opRow);

  const del = document.createElement('button');
  del.className = 'ed-layer-del'; del.title = 'Eliminar'; del.innerHTML = '🗑';
  del.addEventListener('click', e => {
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
   TOUCH DRAG MOBILE
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
