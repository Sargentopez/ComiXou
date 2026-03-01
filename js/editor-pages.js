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
  overlay.addEventListener('pointerdown', e => {
    if (e.target === overlay) edClosePages();
  });

  requestAnimationFrame(() => overlay.classList.add('open'));

  // Desactivar touch del canvas mientras el overlay está abierto
  _pgSetCanvasTouch(false);
}

function edClosePages() {
  const ov = document.getElementById('edPagesOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  setTimeout(() => {
    if (ov.parentNode) ov.parentNode.removeChild(ov);
    _pgSetCanvasTouch(true);
    // Sincronizar orientación de la hoja activa con el estado global del editor.
    // Cuando el usuario cambia la orientación de una hoja y cierra con X o clic fuera
    // (en lugar de hacer clic en la miniatura), edOrientation no se actualiza.
    // Esto causa que las imágenes queden deformadas hasta que el usuario cambia de hoja.
    const activePage = typeof edPages !== 'undefined' && edPages[edCurrentPage];
    if (activePage && activePage.orientation) {
      const needsUpdate = activePage.orientation !== edOrientation;
      if (needsUpdate) {
        edOrientation = activePage.orientation;
        // Recalcular height de imágenes para la nueva orientación
        const _isV = edOrientation === 'vertical';
        const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
        const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
        (activePage.layers || []).forEach(l => {
          if (l.type === 'image' && l.img && l.img.naturalWidth > 0) {
            l.height = l.width * (l.img.naturalHeight / l.img.naturalWidth) * (_pw / _ph);
          }
        });
        if (typeof edFitCanvas === 'function') edFitCanvas(true);
      } else if (typeof edRedraw === 'function') {
        edRedraw();
      }
    } else if (typeof edRedraw === 'function') {
      edRedraw();
    }
  }, 250);
}

function _pgSetCanvasTouch(enabled) {
  const shell = document.getElementById('editorShell');
  if (!shell) return;
  if (enabled) {
    shell.style.touchAction = '';
    shell.removeEventListener('touchstart', _pgBlockTouch, {passive:false});
    shell.removeEventListener('touchmove',  _pgBlockTouch, {passive:false});
  } else {
    shell.style.touchAction = 'none';
    shell.addEventListener('touchstart', _pgBlockTouch, {passive:false});
    shell.addEventListener('touchmove',  _pgBlockTouch, {passive:false});
  }
}
function _pgBlockTouch(e) {
  if (!e.target.closest('#edLayersOverlay') && !e.target.closest('#edPagesOverlay')) {
    e.preventDefault();
  }
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
  const _thumbOrient = page.orientation || edOrientation;
  thumb.height = _thumbOrient === 'vertical' ? 127 : 64;
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

  // Rotar orientación
  const rotBtn = document.createElement('button');
  rotBtn.className = 'ed-page-action-btn ed-page-rot';
  const pageOrient = page.orientation || edOrientation;
  rotBtn.title = 'Cambiar orientación';
  rotBtn.innerHTML = _pgOrientIcon(pageOrient);
  rotBtn.addEventListener('click', e => {
    e.stopPropagation();
    _pgRotatePage(idx);
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
  actions.appendChild(rotBtn);
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
    orientation:       src.orientation       || edOrientation,
    textLayerOpacity:  src.textLayerOpacity  ?? 1,
    textMode:          src.textMode          || 'sequential',
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

/* ──────────────────────────────────────────
   ICONO DE ORIENTACIÓN Y ROTACIÓN POR HOJA
────────────────────────────────────────── */

// Devuelve un SVG inline que muestra la orientación CONTRARIA (destino del botón)
function _pgOrientIcon(currentOrient) {
  // Si la hoja es vertical → el botón muestra un rectángulo horizontal (y viceversa)
  if (currentOrient === 'vertical') {
    // Mostrar rectángulo apaisado (horizontal)
    return '<svg width="18" height="14" viewBox="0 0 18 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
           '<rect x="1" y="3" width="16" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>' +
           '</svg>';
  } else {
    // Mostrar rectángulo vertical
    return '<svg width="12" height="18" viewBox="0 0 12 18" fill="none" xmlns="http://www.w3.org/2000/svg">' +
           '<rect x="1.5" y="1" width="9" height="16" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>' +
           '</svg>';
  }
}

// Cambia la orientación de una hoja sin alterar las proporciones de sus imágenes
function _pgRotatePage(idx) {
  const page = edPages[idx];
  if (!page) return;

  const currentOrient = page.orientation || edOrientation;
  const newOrient = currentOrient === 'vertical' ? 'horizontal' : 'vertical';

  // Ratio de escala entre el lienzo anterior y el nuevo
  // Antes: pw × ph (ej. 360×780 vertical)
  // Después: ph × pw (ej. 780×360 horizontal)
  // Las coordenadas normalizadas (0-1) de cada capa son relativas al lienzo.
  // Al cambiar de orientación el lienzo rota, pero los objetos deben
  // mantener su tamaño físico (en mm/px reales), no su tamaño normalizado.
  //
  // Tamaño físico de un objeto: w_px = la.width * pw, h_px = la.height * ph
  // En el nuevo lienzo (pw',ph') = (ph,pw):
  //   la.width_new  = w_px / pw' = la.width * pw / ph
  //   la.height_new = h_px / ph' = la.height * ph / pw
  // La posición también se reescala igual.
  const pwOld = currentOrient === 'vertical' ? ED_PAGE_W : ED_PAGE_H;
  const phOld = currentOrient === 'vertical' ? ED_PAGE_H : ED_PAGE_W;
  const pwNew = phOld;  // el nuevo ancho es la altura anterior
  const phNew = pwOld;  // la nueva altura es el ancho anterior

  const scaleW = pwOld / pwNew;  // = pwOld / phOld
  const scaleH = phOld / phNew;  // = phOld / pwOld

  page.layers.forEach(la => {
    if (!la) return;
    // Reescalar posición y dimensiones para preservar tamaño físico
    la.x      = la.x      * scaleW;
    la.y      = la.y      * scaleH;
    la.width  = la.width  * scaleW;
    la.height = la.height * scaleH;
  });

  // El drawData (dibujo libre) se descarta — no tiene forma trivial de rotar
  // y el texto/imágenes ya se recolocan. Avisar al usuario.
  const hadDraw = !!page.drawData;

  // Guardar el historial ANTES de borrar drawData — así el undo puede recuperarlo
  if (idx === edCurrentPage) {
    if (typeof edPushHistory === 'function') edPushHistory();
  }

  page.drawData = null;
  page.orientation = newOrient;

  // Si es la hoja activa, actualizar la cámara y redibujar
  if (idx === edCurrentPage) {
    if (typeof edFitCanvas === 'function') edFitCanvas(true);
    if (typeof edRedraw    === 'function') edRedraw();
  }

  if (hadDraw) edToast('Orientación cambiada · el dibujo libre no se puede rotar y fue borrado');
  else         edToast('Orientación cambiada');
  _pgRender();
}
