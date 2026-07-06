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
    edConfirm('¿Eliminar esta hoja?', () => {
      edPages.splice(idx, 1);
      edLoadPage(Math.min(edCurrentPage, edPages.length - 1));
      edPushHistory();
      _pgRender();
    });
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

// Envoltorio ligero: para la página ACTIVA (la que se está editando) siempre
// se renderiza en vivo, igual que antes — es solo una página, coste asumible.
// Para el resto de páginas, si ya hay una miniatura cacheada (generada al
// salir de ellas — ver _edCachePageThumb en editor.js), se reutiliza tal
// cual en vez de recorrer capas y canvas pesados de páginas que ni siquiera
// se están viendo. Si aún no hay caché para esa página (primera vez que se
// abre "Hojas" en la sesión), se renderiza en vivo como siempre — nunca
// se muestra una miniatura vacía.
function _pgDrawThumb(canvas, page) {
  if (page && page !== edPages[edCurrentPage] && page._cachedThumbCanvas) {
    const ctx = canvas.getContext('2d');
    const tw = canvas.width, th = canvas.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(page._cachedThumbCanvas, 0, 0, tw, th);
    return;
  }
  _pgRenderThumbLive(canvas, page);
}

function _pgRenderThumbLive(canvas, page) {
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

  // Helper: dibuja sub-capa (fill/pencil/watercolor) respetando posición, tamaño y opacidad
  const _drawGroupLayer = (la) => {
    if (!la || !la._canvas || la._canvas.width === 0) return;
    const _src = (la._previewSx != null && la._srcCanvas) ? la._srcCanvas : la._canvas;
    const _lpx = edMarginX() + la.x * pw;
    const _lpy = edMarginY() + la.y * ph;
    const _lw  = la.width  * pw;
    const _lh  = la.height * ph;
    offCtx.save();
    offCtx.globalAlpha = la.opacity ?? 1;
    offCtx.translate(_lpx, _lpy);
    if (la.rotation) offCtx.rotate(la.rotation * Math.PI / 180);
    offCtx.drawImage(_src, -_lw/2, -_lh/2, _lw, _lh);
    offCtx.restore();
    offCtx.globalAlpha = 1;
  };

  page.layers.forEach(l => {
    if (!l || l.type === 'text' || l.type === 'bubble') return;
    if (l.type === 'gif')              l.draw(offCtx);
    else if (l.type === 'image')        l.draw(offCtx, off);
    else if (l.type === 'draw') {
      // Sub-capas vinculadas (fill → watercolor → pencil) + el propio draw
      const _uid = l._uid || l._fillLayerId;
      ['fill', 'watercolor', 'pencil'].forEach(_t => {
        const _lnk = _uid ? page.layers.find(f => f.type === _t && f._drawLayerId === _uid) : null;
        if (_lnk) _drawGroupLayer(_lnk);
      });
      l.draw(offCtx);
    }
    else if (l.type === 'fill' || l.type === 'pencil' || l.type === 'watercolor') return; // renderizadas desde su stroke/draw
    else if (l.type === 'stroke') {
      const _uid = l._uid || l._fillLayerId;
      ['fill', 'watercolor', 'pencil'].forEach(_t => {
        const _lnk = _uid ? page.layers.find(f => f.type === _t && f._drawLayerId === _uid) : null;
        if (_lnk) _drawGroupLayer(_lnk);
      });
      offCtx.globalAlpha = l.opacity ?? 1; l.draw(offCtx); offCtx.globalAlpha = 1;
    }
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
  // Copia profunda real: cada capa se clona vía edSerLayer/edDeserLayer (el mismo boundary
  // de serialización que usa el guardado normal y que ya usa edDuplicateSelected para un solo
  // objeto), no con Object.assign superficial. Esto reconstruye el canvas desde dataUrl y clona
  // en profundidad points/subPaths/cornerRadii/groupedStyles/_motionPath automáticamente —
  // antes solo se clonaba _canvas, dejando esos arrays/objetos compartidos por referencia.
  //
  // Además, los identificadores que vinculan capas entre sí DENTRO de la misma hoja
  // (_uid/_drawLayerId/_fillLayerId/_pencilLayerId/_watercolorLayerId del grupo de dibujo a
  // mano fill+watercolor+pencil+stroke, y groupId de los grupos de selección) se remapean a
  // valores nuevos consistentes — mismo valor antiguo → mismo valor nuevo en todas las capas
  // que lo comparten — igual que ya hace edDuplicateSelected() con su _npid, pero generalizado
  // a toda la hoja. Así el duplicado mantiene sus propias relaciones internas sin compartir
  // ningún ID con la hoja original.
  const _idMap = new Map();
  function _pgRemapId(oldId) {
    if (!oldId) return oldId;
    if (!_idMap.has(oldId)) _idMap.set(oldId, Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    return _idMap.get(oldId);
  }
  const _srcOrientation = src.orientation || edOrientation;

  const newLayers = src.layers.map(l => {
    if (!l) return null;
    const ser = edSerLayer(l);
    if (!ser) return null;
    const copy = edDeserLayer(ser, _srcOrientation);
    if (!copy) return null;

    // edDeserLayer no restaura groupId/locked para capas tipo 'gif' (gap preexistente del
    // propio edDeserLayer, no introducido aquí) — reforzar para no perder esos estados al duplicar.
    if (ser.groupId) copy.groupId = ser.groupId;
    if (ser.locked)  copy.locked  = true;

    // _gcpFramesData/_gcpLayersData/_gcpLayerNames (animación GCP embebida en capas image):
    // edSerLayer los copia por REFERENCIA (a diferencia de _motionPath, que sí clona), así que
    // sin este clonado explícito el duplicado compartiría el mismo array en memoria y editar
    // frames de la animación en una hoja corrompería la otra.
    if (copy._gcpFramesData) copy._gcpFramesData = JSON.parse(JSON.stringify(copy._gcpFramesData));
    if (copy._gcpLayersData) copy._gcpLayersData = JSON.parse(JSON.stringify(copy._gcpLayersData));
    if (copy._gcpLayerNames) copy._gcpLayerNames = JSON.parse(JSON.stringify(copy._gcpLayerNames));

    // Remapear IDs de vinculación a valores nuevos e independientes del original.
    if (copy._uid)               copy._uid               = _pgRemapId(copy._uid);
    if (copy._drawLayerId)       copy._drawLayerId       = _pgRemapId(copy._drawLayerId);
    if (copy._fillLayerId)       copy._fillLayerId       = _pgRemapId(copy._fillLayerId);
    if (copy._pencilLayerId)     copy._pencilLayerId     = _pgRemapId(copy._pencilLayerId);
    if (copy._watercolorLayerId) copy._watercolorLayerId = _pgRemapId(copy._watercolorLayerId);
    if (copy.groupId)            copy.groupId            = _pgRemapId(copy.groupId);
    // _fusionId no se remapea: es estado de sesión del panel de fusión de líneas ("Unir"),
    // edSerLayer no lo serializa — no sobrevive a esta ronda de clonado, igual que
    // edDuplicateSelected() lo borra explícitamente del objeto duplicado.
    // _bibItemId no se remapea: es una referencia legítima al ítem de biblioteca de origen.

    return copy;
  }).filter(Boolean);

  const newPage = {
    drawData: src.drawData || null,
    layers: newLayers,
    orientation:       _srcOrientation,
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

  // Delta de márgenes: constante para esta rotación, se invierte en la siguiente.
  // Es el único desplazamiento necesario para que el fill siga al stroke.
  const dxPx = (ED_CANVAS_W - pwNew) / 2 - (ED_CANVAS_W - pwOld) / 2;
  const dyPx = (ED_CANVAS_H - phNew) / 2 - (ED_CANVAS_H - phOld) / 2;

  page.layers.forEach(la => {
    if (!la) return;

    // draw: no tiene x/y/width/height significativos — skip
    if (la.type === 'draw') return;

    // SF: el FillLayer sigue al stroke vinculado.
    // Sus propiedades (x/y/w/h) se sincronizan después del loop.
    // El canvas local (SF, _isWorkspaceCanvas=false) no necesita mover píxeles
    // porque draw() usa las propiedades x/y/w/h para posicionarlo correctamente.
    if (la.type === 'fill') return;

    // Reposicionar: x*pwOld/pwNew preserva posición relativa dentro de la página.
    // Se permite x/y fuera de [0,1] para stroke (objeto parcialmente fuera de página),
    // pero se clampea para el resto (texto, shapes, etc. deben estar dentro).
    const w_px = (la.width  || 0) * pwOld;
    const h_px = (la.height || 0) * phOld;
    const _xNew = (la.x || 0.5) * pwOld / pwNew;
    const _yNew = (la.y || 0.5) * phOld / phNew;
    la.x = _xNew;
    la.y = _yNew;

    if (la.type === 'image' && la.img && la.img.naturalWidth > 0) {
      la.width  = Math.min(1, w_px / pwNew);
      la.height = la.width * (la.img.naturalHeight / la.img.naturalWidth) * (pwNew / phNew);
      if (la.height > 1) { const s = 1 / la.height; la.height = 1; la.width = Math.min(1, la.width * s); }
    } else if (la.type === 'stroke' && la._canvas) {
      // Stroke: x/y puede quedar fuera de [0,1] si el dibujo estaba en zona que no cabe
      // en la nueva orientación — es correcto, el bitmap se ve parcialmente fuera de página.
      la.width  = Math.min(1, w_px / pwNew);
      la.height = Math.min(1, h_px / phNew);
      // SF: el fill se sincroniza con el stroke en el paso posterior al loop
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
      la.x = Math.max(0, Math.min(1, _xNew));
      la.y = Math.max(0, Math.min(1, _yNew));
    } else {
      // gif, shape, text, bubble — clamp: deben estar dentro de la página
      la.width  = Math.min(1, w_px / pwNew);
      la.height = Math.min(1, h_px / phNew);
      la.x = Math.max(0, Math.min(1, _xNew));
      la.y = Math.max(0, Math.min(1, _yNew));
    }
    // Sin cambio de rotation — el objeto no se gira
  });

  // Sincronizar fills con sus strokes vinculados (mismas propiedades)
  page.layers.forEach(l => {
    if (l.type === 'fill' && l._drawLayerId) {
      const _sl = page.layers.find(s => s._fillLayerId === l._drawLayerId);
      if (_sl) {
        l.x = _sl.x; l.y = _sl.y;
        l.width = _sl.width; l.height = _sl.height;
        l.rotation = _sl.rotation || 0;
      }
    }
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
