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

  const _pi = edPages.indexOf(page);

  const _savedOrient = edOrientation;
  const _savedPage   = edCurrentPage;
  const _po = page.orientation || edOrientation;
  edOrientation = _po;
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
    if (l.type === 'gif')              l.draw(offCtx);
    else if (l.type === 'image')        l.draw(offCtx, off);
    else if (l.type === 'draw')    l.draw(offCtx);
    else if (l.type === 'stroke') { offCtx.globalAlpha = l.opacity ?? 1; l.draw(offCtx); offCtx.globalAlpha = 1; }
    else if (l.type === 'shape' || l.type === 'line') { offCtx.globalAlpha = l.opacity ?? 1; l.draw(offCtx); offCtx.globalAlpha = 1; }
    else if (l.type === 'group') { offCtx.globalAlpha = l.opacity ?? 1; l.draw(offCtx); offCtx.globalAlpha = 1; }
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

// Cambia la orientación de una hoja preservando el aspecto visual de todos los objetos.
// Estrategia: rotar cada objeto 90° en el espacio de página para compensar el giro del lienzo.
// vertical→horizontal: lienzo gira -90°, objetos compensan +90°.
// horizontal→vertical: lienzo gira +90°, objetos compensan -90°.
function _pgRotatePage(idx) {
  const page = edPages[idx];
  if (!page) return;

  const currentOrient = page.orientation || edOrientation;
  const newOrient = currentOrient === 'vertical' ? 'horizontal' : 'vertical';

  const sv = currentOrient === 'vertical';
  const pwOld = sv ? ED_PAGE_W : ED_PAGE_H;
  const phOld = sv ? ED_PAGE_H : ED_PAGE_W;
  const pwNew = sv ? ED_PAGE_H : ED_PAGE_W;
  const phNew = sv ? ED_PAGE_W : ED_PAGE_H;

  // Márgenes en el workspace antes y después del cambio
  const mxOld = (ED_CANVAS_W - pwOld) / 2;
  const myOld = (ED_CANVAS_H - phOld) / 2;
  const mxNew = (ED_CANVAS_W - pwNew) / 2;
  const myNew = (ED_CANVAS_H - phNew) / 2;

  // Reencuadrar el canvas de un FillLayer sin escalar ni acumular:
  // copia la zona de página antigua (mxOld,myOld,pwOld,phOld) a la zona nueva (mxNew,myNew).
  // El offset interno de cada píxel dentro de la página se preserva exactamente,
  // lo que garantiza alineación perfecta con el StrokeLayer (que también preserva
  // su tamaño físico en px). Sin acumulado: la segunda rotación deshace la primera.
  function _reframeFill(fl) {
    if (!fl._canvas) return;
    const tmp = document.createElement('canvas');
    tmp.width = ED_CANVAS_W; tmp.height = ED_CANVAS_H;
    tmp.getContext('2d').drawImage(fl._canvas,
      mxOld, myOld, pwOld, phOld,  // fuente: zona de página en orientación vieja
      mxNew, myNew, pwOld, phOld); // destino: zona nueva, mismo tamaño sin escalar
    fl._ctx.clearRect(0, 0, ED_CANVAS_W, ED_CANVAS_H);
    fl._ctx.drawImage(tmp, 0, 0);
  }

  page.layers.forEach(la => {
    if (!la) return;

    // draw: no tiene x/y/width/height significativos — skip
    if (la.type === 'draw') return;

    // FillLayer: reencuadrar sin escalar ni acumular
    if (la.type === 'fill') {
      _reframeFill(la);
      return;
    }

    // Reposicionar el centro: x*pwOld/pwNew preserva la posición relativa dentro de la página.
    // El StrokeLayer preserva su tamaño físico en px, igual que _reframeFill para el fill,
    // garantizando alineación exacta entre ambos.
    const w_px = (la.width  || 0) * pwOld;
    const h_px = (la.height || 0) * phOld;
    la.x = Math.max(0, Math.min(1, (la.x || 0.5) * pwOld / pwNew));
    la.y = Math.max(0, Math.min(1, (la.y || 0.5) * phOld / phNew));

    if (la.type === 'image' && la.img && la.img.naturalWidth > 0) {
      // Imagen: mantener ratio de aspecto natural
      la.width  = Math.min(1, w_px / pwNew);
      la.height = la.width * (la.img.naturalHeight / la.img.naturalWidth) * (pwNew / phNew);
      if (la.height > 1) { const s = 1 / la.height; la.height = 1; la.width = Math.min(1, la.width * s); }
    } else if (la.type === 'stroke' && la._canvas) {
      // StrokeLayer bitmap: preservar tamaño físico en px
      la.width  = Math.min(1, w_px / pwNew);
      la.height = Math.min(1, h_px / phNew);
      // Sincronizar _baseX/_baseY del fill con la nueva x/y del stroke.
      // Los píxeles ya fueron reencuadrados por _reframeFill → offset en draw() = 0.
      if (la._fillLayerId) {
        const _flSync = page.layers.find(l => l.type === 'fill' && l._drawLayerId === la._fillLayerId);
        if (_flSync) { _flSync._baseX = la.x; _flSync._baseY = la.y; }
      }
    } else if (la.type === 'line' && Array.isArray(la.points)) {
      // LineLayer: reescalar puntos al nuevo sistema sin rotar
      const scW = pwOld / pwNew, scH = phOld / phNew;
      const scalePt = p => p ? { ...p, x: p.x * scW, y: p.y * scH,
        cp1: p.cp1 ? { x: p.cp1.x * scW, y: p.cp1.y * scH } : p.cp1,
        cp2: p.cp2 ? { x: p.cp2.x * scW, y: p.cp2.y * scH } : p.cp2 } : null;
      la.points = la.points.map(scalePt);
      if (Array.isArray(la.subPaths))
        la.subPaths = la.subPaths.map(sp => sp.map(scalePt));
      la.width  = Math.min(1, w_px / pwNew);
      la.height = Math.min(1, h_px / phNew);
    } else {
      // gif, shape, text, bubble
      la.width  = Math.min(1, w_px / pwNew);
      la.height = Math.min(1, h_px / phNew);
    }
    // Sin cambio de rotation — el objeto no se gira
  });

  page.orientation = newOrient;

  if (idx === edCurrentPage) {
    if (typeof edSetOrientation === 'function') edSetOrientation(newOrient, false);
    if (typeof edPushHistory === 'function') edPushHistory(true);
    if (typeof edFitCanvas === 'function') edFitCanvas(true);
    if (typeof edRedraw === 'function') edRedraw();
  }

  edToast('Orientación cambiada');
  _pgRender();
}
