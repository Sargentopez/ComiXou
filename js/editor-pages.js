/* ============================================================
   editor-pages.js — Panel de hojas del editor
   Scroll horizontal con flechas ◀ ▶ para reordenar.
   ============================================================ */

let _pgUidCounter = 0;  // IDs únicos estables para animación FLIP

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
      <p class="ed-fulloverlay-hint">Usa ◀ ▶ para cambiar el orden · toca la miniatura para ir a esa hoja</p>
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
    // Recargar la hoja activa: sincroniza edOrientation, recalcula imágenes y redibuja.
    // Necesario cuando el usuario cambia la orientación y cierra con X o clic fuera
    // en lugar de hacer clic en la miniatura (que ya llamaba edLoadPage).
    if (typeof edLoadPage === 'function') edLoadPage(edCurrentPage);
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
  // UID estable para animación FLIP
  if (!page._uid) page._uid = ++_pgUidCounter;

  const card = document.createElement('div');
  card.className = 'ed-page-card' + (idx === edCurrentPage ? ' current' : '');
  card.dataset.idx = idx;
  card.dataset.uid = page._uid;

  // Número (esquina superior izquierda)
  const num = document.createElement('div');
  num.className = 'ed-page-num';
  num.textContent = idx + 1;

  // Flechas ◀ ▶ en esquina superior derecha (posición absoluta)
  const arrows = document.createElement('div');
  arrows.className = 'ed-page-arrows';

  const leftBtn = document.createElement('button');
  leftBtn.className = 'ed-layer-arrow';
  leftBtn.title = 'Mover izquierda';
  leftBtn.textContent = '◀';
  leftBtn.disabled = idx === 0;
  leftBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    _pgReorder(idx, idx - 1);
  });

  const rightBtn = document.createElement('button');
  rightBtn.className = 'ed-layer-arrow';
  rightBtn.title = 'Mover derecha';
  rightBtn.textContent = '▶';
  rightBtn.disabled = idx === edPages.length - 1;
  rightBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    _pgReorder(idx, idx + 1);
  });

  arrows.appendChild(leftBtn);
  arrows.appendChild(rightBtn);

  // Miniatura
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-page-thumb';
  thumb.width  = 90;
  const _thumbOrient = page.orientation || edOrientation;
  thumb.height = _thumbOrient === 'vertical' ? 127 : 64;
  _pgDrawThumb(thumb, page);

  // Acciones: ⧉ duplicar + rotar + ✕ eliminar
  const actions = document.createElement('div');
  actions.className = 'ed-page-actions';

  const dupBtn = document.createElement('button');
  dupBtn.className = 'ed-page-action-btn';
  dupBtn.title = 'Duplicar hoja';
  dupBtn.innerHTML = '⧉';
  dupBtn.addEventListener('click', e => {
    e.stopPropagation();
    _pgDuplicate(idx);
  });

  const rotBtn = document.createElement('button');
  rotBtn.className = 'ed-page-action-btn ed-page-rot';
  const pageOrient = page.orientation || edOrientation;
  rotBtn.title = 'Cambiar orientación';
  rotBtn.innerHTML = _pgOrientIcon(pageOrient);
  rotBtn.addEventListener('click', e => {
    e.stopPropagation();
    _pgRotatePage(idx);
  });

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

  // Cabecera: número (izq) + flechas (der) en misma fila
  const header = document.createElement('div');
  header.className = 'ed-page-header';
  header.appendChild(num);
  header.appendChild(arrows);

  card.appendChild(header);
  card.appendChild(thumb);
  card.appendChild(actions);

  // Ir a la hoja al tocar la miniatura
  thumb.addEventListener('click', () => {
    edLoadPage(idx);
    edClosePages();
  });

  return card;
}

function _pgDrawThumb(canvas, page) {
  const ctx = canvas.getContext('2d');
  const tw = canvas.width, th = canvas.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tw, th);
  if (!page || !page.layers) return;

  // Usar el mismo sistema que edExportPagePNG:
  // canvas del tamanyo exacto de la pagina + setTransform(-mx,-my)
  // para que draw() de cada capa funcione en coords workspace correctas
  const _savedOrient = edOrientation;
  const _savedPage   = edCurrentPage;
  const _po = page.orientation || edOrientation;
  edOrientation = _po;
  const _pi = edPages.indexOf(page);
  if (_pi >= 0) edCurrentPage = _pi;

  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();

  const off = document.createElement('canvas');
  off.width = pw; off.height = ph;
  const offCtx = off.getContext('2d');
  offCtx.fillStyle = '#ffffff';
  offCtx.fillRect(0, 0, pw, ph);
  offCtx.setTransform(1, 0, 0, 1, -mx, -my);

  const _textLayers = page.layers.filter(l => l.type === 'text' || l.type === 'bubble');
  const _textAlpha  = page.textLayerOpacity ?? 1;

  page.layers.forEach(l => {
    if (!l || l.type === 'text' || l.type === 'bubble') return;
    if (l.type === 'image')        l.draw(offCtx, off);
    else if (l.type === 'draw')    l.draw(offCtx);
    else if (l.type === 'stroke') { offCtx.globalAlpha = l.opacity ?? 1; l.draw(offCtx); offCtx.globalAlpha = 1; }
    else if (l.type === 'shape' || l.type === 'line') { offCtx.globalAlpha = l.opacity ?? 1; l.draw(offCtx); offCtx.globalAlpha = 1; }
  });
  offCtx.globalAlpha = _textAlpha;
  _textLayers.forEach(l => l.draw(offCtx, off));
  offCtx.globalAlpha = 1;

  edOrientation  = _savedOrient;
  edCurrentPage  = _savedPage;

  ctx.drawImage(off, 0, 0, pw, ph, 0, 0, tw, th);
}

function _pgDrawLayers(ctx, layers, scaleX, scaleY) {
  if (!layers) return;
  layers.forEach(la => {
    if (!la) return;
    ctx.save();
    ctx.globalAlpha = la.opacity ?? 1;
    const cx = la.x * scaleX, cy = la.y * scaleY;
    const w  = la.width  * scaleX, h = la.height * scaleY;
    const rot = (la.rotation || 0) * Math.PI / 180;
    if (la.type === 'image' && la.img && la.img.complete && la.img.naturalWidth > 0) {
      ctx.translate(cx, cy); if(rot) ctx.rotate(rot);
      ctx.drawImage(la.img, -w/2, -h/2, w, h);
    } else if (la.type === 'stroke' && la._canvas) {
      ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.drawImage(la._canvas, -w/2, -h/2, w, h);
    } else if (la.type === 'shape') {
      ctx.translate(cx, cy); if(rot) ctx.rotate(rot);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (la.shape === 'ellipse') ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI*2);
      else ctx.rect(-w/2, -h/2, w, h);
      if (la.fillColor && la.fillColor !== 'none') { ctx.fillStyle = la.fillColor; ctx.fill(); }
      if ((la.lineWidth||0) > 0) { ctx.strokeStyle = la.color||'#000'; ctx.lineWidth = Math.max(1.5, la.lineWidth * scaleX/360); ctx.stroke(); }
    } else if (la.type === 'line' && la.points && la.points.length >= 2) {
      ctx.translate(cx, cy); if(rot) ctx.rotate(rot);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(la.points[0].x * scaleX, la.points[0].y * scaleY);
      for (let i = 1; i < la.points.length; i++)
        ctx.lineTo(la.points[i].x * scaleX, la.points[i].y * scaleY);
      if (la.closed) ctx.closePath();
      if (la.closed && la.fillColor && la.fillColor !== 'none') { ctx.fillStyle = la.fillColor; ctx.fill(); }
      if ((la.lineWidth||0) > 0) { ctx.strokeStyle = la.color||'#000'; ctx.lineWidth = Math.max(1.5, la.lineWidth * scaleX/360); ctx.stroke(); }
    } else if (la.type === 'text' || la.type === 'bubble') {
      ctx.fillStyle = la.backgroundColor || '#fff';
      ctx.fillRect(cx - w/2, cy - h/2, w, h);
      ctx.strokeStyle = la.borderColor || '#ccc';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - w/2, cy - h/2, w, h);
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
  const pageObj = edPages[fromIdx];
  _pgAnimatedReorder(pageObj, () => {
    const moved = edPages.splice(fromIdx, 1)[0];
    edPages.splice(toIdx, 0, moved);
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
  });
}
/* ──────────────────────────────────────────
   ANIMACIÓN FLIP HORIZONTAL — reordenación
────────────────────────────────────────── */
function _pgAnimatedReorder(pageObj, doReorder) {
  const grid = document.getElementById('edPagesGrid');
  if (!grid) { doReorder(); _pgRender(); return; }

  if (!pageObj._uid) pageObj._uid = ++_pgUidCounter;
  const movedUid = pageObj._uid;

  // FIRST: capturar posición X de todas las cards
  const snapBefore = new Map();
  grid.querySelectorAll('[data-uid]').forEach(el => {
    snapBefore.set(el.dataset.uid, el.getBoundingClientRect().left);
  });

  if (snapBefore.size === 0) { doReorder(); _pgRender(); return; }

  // Ejecutar reorder + reconstruir
  doReorder();
  _pgRender();

  // LAST: calcular deltas X
  const toAnimate = [];
  grid.querySelectorAll('[data-uid]').forEach(el => {
    const uid = el.dataset.uid;
    if (!snapBefore.has(uid)) return;
    const delta = snapBefore.get(uid) - el.getBoundingClientRect().left;
    if (Math.abs(delta) < 2) return;
    toAnimate.push({ el, delta, isMoved: uid === String(movedUid) });
  });

  if (toAnimate.length === 0) return;

  // INVERT: colocar en posición anterior sin transición
  toAnimate.forEach(({ el, delta, isMoved }) => {
    el.style.transition = 'none';
    el.style.transform  = 'translateX(' + delta + 'px)';
    el.style.opacity    = isMoved ? '0.5' : '0.72';
  });

  // PLAY: doble rAF para forzar paint antes de animar
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toAnimate.forEach(({ el, isMoved }) => {
        const dur = isMoved ? 360 : 280;
        el.style.transition = 'transform ' + dur + 'ms cubic-bezier(.4,0,.2,1), opacity ' + dur + 'ms ease';
        el.style.transform  = 'translateX(0)';
        el.style.opacity    = '1';
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
          el.style.transform  = '';
          el.style.opacity    = '';
        }, { once: true });
      });
      // Scroll suave para mantener la hoja movida visible
      const movedEl = grid.querySelector(`[data-uid="${movedUid}"]`);
      if (movedEl) movedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
  });
}



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

  // Si es la hoja activa: edLoadPage sincroniza edOrientation, recalcula
  // el height de las imágenes para la nueva orientación y redibuja —
  // todo ocurre inmediatamente al clicar el icono, sin esperar a cerrar el panel.
  if (idx === edCurrentPage) {
    if (typeof edLoadPage === 'function') edLoadPage(idx);
    else if (typeof edFitCanvas === 'function') edFitCanvas(true);
  }

  if (hadDraw) edToast('Orientación cambiada · el dibujo libre no se puede rotar y fue borrado');
  else         edToast('Orientación cambiada');
  _pgRender();
}
