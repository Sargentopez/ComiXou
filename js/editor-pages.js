/* ============================================================
   editor-pages.js — Panel de hojas del editor
   Pantalla completa. Miniaturas de cada hoja, drag reorder,
   duplicar hoja (se inserta a continuación), eliminar, nueva.
   ============================================================ */

let _pgDragIdx  = null;
let _pgDragOver = null;

/* ──────────────────────────────────────────
   ABRIR / CERRAR
────────────────────────────────────────── */
function edOpenPages() {
  if (document.getElementById('edPagesOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'edPagesOverlay';
  overlay.className = 'ed-fulloverlay';
  overlay.innerHTML = `
    <div class="ed-fulloverlay-box">
      <div class="ed-fulloverlay-header">
        <h2 class="ed-fulloverlay-title">Hojas</h2>
        <button class="ed-fulloverlay-close" id="edPagesClose">✕</button>
      </div>
      <p class="ed-fulloverlay-hint">Arrastra para cambiar el orden de lectura · toca para ir a esa hoja</p>
      <div class="ed-pages-grid" id="edPagesGrid"></div>
      <div class="ed-fulloverlay-actions">
        <button class="ed-btn-pri" id="edPagesAdd">+ Nueva hoja</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _pgRender();

  overlay.querySelector('#edPagesClose').addEventListener('click', edClosePages);
  overlay.querySelector('#edPagesAdd').addEventListener('click', () => {
    edClosePages();
    edAddPage();
  });

  requestAnimationFrame(() => overlay.classList.add('open'));
}

function edClosePages() {
  const ov = document.getElementById('edPagesOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  setTimeout(() => { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 250);
}

/* ──────────────────────────────────────────
   RENDER GRID DE MINIATURAS
────────────────────────────────────────── */
function _pgRender() {
  const grid = document.getElementById('edPagesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  edPages.forEach((page, i) => {
    const card = _pgBuildCard(page, i);
    grid.appendChild(card);
  });
}

function _pgBuildCard(page, idx) {
  const card = document.createElement('div');
  card.className = 'ed-page-card' + (idx === edCurrentPage ? ' current' : '');
  card.dataset.idx = idx;
  card.draggable = true;

  // Número
  const num = document.createElement('div');
  num.className = 'ed-page-num';
  num.textContent = idx + 1;

  // Miniatura
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-page-thumb';
  thumb.width  = 90;
  thumb.height = edOrientation === 'vertical' ? 127 : 64;
  _pgDrawThumb(thumb, page);

  // Acciones
  const actions = document.createElement('div');
  actions.className = 'ed-page-actions';

  // Duplicar
  const dupBtn = document.createElement('button');
  dupBtn.className = 'ed-page-action-btn';
  dupBtn.title = 'Duplicar hoja';
  dupBtn.innerHTML = '⧉';
  dupBtn.addEventListener('click', e => {
    e.stopPropagation();
    _pgDuplicate(idx);
  });

  // Eliminar
  const delBtn = document.createElement('button');
  delBtn.className = 'ed-page-action-btn ed-page-del';
  delBtn.title = 'Eliminar hoja';
  delBtn.innerHTML = '<span style="color:#e63030;font-weight:900">✕</span>';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (edPages.length <= 1) { edToast('No puedes eliminar la última hoja'); return; }
    edPages.splice(idx, 1);
    edLoadPage(Math.min(edCurrentPage, edPages.length - 1));
    edPushHistory();
    _pgRender();
  });

  actions.appendChild(dupBtn);
  actions.appendChild(delBtn);

  card.appendChild(num);
  card.appendChild(thumb);
  card.appendChild(actions);

  // Ir a la hoja al tocar
  thumb.addEventListener('click', () => {
    edLoadPage(idx);
    edClosePages();
  });

  // Drag desktop
  card.addEventListener('dragstart', e => {
    _pgDragIdx = idx;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.ed-page-card').forEach(el => el.classList.remove('drag-over'));
    if (_pgDragIdx !== null && _pgDragOver !== null && _pgDragIdx !== _pgDragOver) {
      _pgReorder(_pgDragIdx, _pgDragOver);
    }
    _pgDragIdx = _pgDragOver = null;
  });
  card.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.ed-page-card').forEach(el => el.classList.remove('drag-over'));
    card.classList.add('drag-over');
    _pgDragOver = idx;
  });

  // Touch drag mobile
  _pgBindTouchDrag(card, idx);

  return card;
}

function _pgDrawThumb(canvas, page) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Dibujar capas escaladas
  const scaleX = canvas.width;
  const scaleY = canvas.height;

  // Fondo de dibujo libre
  if (page.drawData) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Dibujar capas encima
      _pgDrawLayers(ctx, page.layers, scaleX, scaleY);
    };
    img.src = page.drawData;
    return;
  }
  _pgDrawLayers(ctx, page.layers, scaleX, scaleY);
}

function _pgDrawLayers(ctx, layers, scaleX, scaleY) {
  if (!layers) return;
  layers.forEach(la => {
    if (!la) return;
    ctx.save();
    ctx.globalAlpha = la.opacity ?? 1;
    if (la.type === 'image' && la.img && la.img.complete && la.img.naturalWidth > 0) {
      const w = la.width * scaleX, h = la.height * scaleY;
      const px = la.x * scaleX,   py = la.y * scaleY;
      ctx.drawImage(la.img, px - w/2, py - h/2, w, h);
    } else if (la.type === 'text' || la.type === 'bubble') {
      const w = la.width * scaleX, h = la.height * scaleY;
      const px = la.x * scaleX,   py = la.y * scaleY;
      ctx.fillStyle = la.backgroundColor || '#fff';
      ctx.fillRect(px - w/2, py - h/2, w, h);
      ctx.strokeStyle = la.borderColor || '#ccc';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - w/2, py - h/2, w, h);
    }
    ctx.restore();
  });
}

/* ──────────────────────────────────────────
   DUPLICAR
────────────────────────────────────────── */
function _pgDuplicate(idx) {
  const src = edPages[idx];
  // Copia profunda de layers (sin img — se reconstruye)
  const newLayers = src.layers.map(l => {
    if (!l) return null;
    const copy = Object.assign(Object.create(Object.getPrototypeOf(l)), l);
    // La imagen se reutiliza por referencia (mismo HTMLImageElement)
    return copy;
  }).filter(Boolean);

  const newPage = {
    drawData: src.drawData || null,
    layers: newLayers,
  };

  // Insertar a continuación
  edPages.splice(idx + 1, 0, newPage);
  edPushHistory();
  edToast(`Hoja ${idx + 1} duplicada`);
  _pgRender();
}

/* ──────────────────────────────────────────
   REORDENAR
────────────────────────────────────────── */
function _pgReorder(fromIdx, toIdx) {
  const moved = edPages.splice(fromIdx, 1)[0];
  edPages.splice(toIdx, 0, moved);
  // Actualizar página actual
  if (edCurrentPage === fromIdx) {
    edCurrentPage = toIdx;
  } else if (fromIdx < edCurrentPage && edCurrentPage <= toIdx) {
    edCurrentPage--;
  } else if (toIdx <= edCurrentPage && edCurrentPage < fromIdx) {
    edCurrentPage++;
  }
  edLayers = edPages[edCurrentPage].layers;
  edPushHistory();
  edUpdateNavPages();
  _pgRender();
}

/* ──────────────────────────────────────────
   TOUCH DRAG MOBILE
────────────────────────────────────────── */
function _pgBindTouchDrag(card, idx) {
  let startY, startIdx;

  card.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    startIdx = idx;
    // Solo activar drag si toca y mantiene 300ms
    card._touchTimer = setTimeout(() => {
      card.classList.add('dragging');
    }, 300);
  }, { passive: true });

  card.addEventListener('touchmove', e => {
    clearTimeout(card._touchTimer);
    if (!card.classList.contains('dragging')) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    const cards = [...document.querySelectorAll('.ed-page-card')];
    cards.forEach(el => el.classList.remove('drag-over'));
    const target = cards.find(el => {
      const r = el.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    });
    if (target) { target.classList.add('drag-over'); _pgDragOver = parseInt(target.dataset.idx); }
  }, { passive: false });

  card.addEventListener('touchend', () => {
    clearTimeout(card._touchTimer);
    card.classList.remove('dragging');
    document.querySelectorAll('.ed-page-card').forEach(el => el.classList.remove('drag-over'));
    if (_pgDragOver !== null && startIdx !== _pgDragOver) {
      _pgReorder(startIdx, _pgDragOver);
    }
    _pgDragOver = null;
  });
}
