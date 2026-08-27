/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
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

// Bloqueo breve y compartido para acciones de página que crean/mueven/
// eliminan hojas (duplicar, añadir, eliminar, rotar, reordenar). Estas
// funciones son síncronas e inmediatas — no hay ningún "trabajo en curso"
// que esperar — así que el riesgo no es una llamada solapándose con un
// guardado lento, sino un SEGUNDO evento 'click' llegando casi a la vez que
// el primero (doble-tap real, o el clásico duplicado de eventos en Android
// que ya motivó usar pointerdown/pointerup en vez de click en otras partes
// del editor). Confirmado: el botón "Duplicar hoja" usaba 'click' sin
// ninguna protección — un doble disparo inserta DOS hojas nuevas en vez de
// una, cada una con su propia posición válida (no una colisión, por eso no
// aparece como panel_order duplicado en Supabase).
let _pgActionLock = false;
function _pgActionLocked() {
  if (_pgActionLock) return true;
  _pgActionLock = true;
  setTimeout(() => { _pgActionLock = false; }, 600);
  return false;
}

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
        <h2 class="ed-fulloverlay-title">${I18n.t('ed_pagesTitle')}</h2>
        <button class="ed-fulloverlay-close" id="edPagesClose">✕</button>
      </div>
      <p class="ed-fulloverlay-hint">${I18n.t('ed_pagesHint')}</p>
      <div class="ed-pages-grid" id="edPagesGrid"></div>
      <div class="ed-fulloverlay-actions">
        <button class="ed-btn-pri" id="edPagesAdd">${I18n.t('ed_pagesAddBtn')}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _pgRender();

  overlay.querySelector('#edPagesClose').addEventListener('click', edClosePages);
  overlay.querySelector('#edPagesAdd').addEventListener('click', () => {
    // Petición de Alberto: NO cerrar la ventana ni saltar a la nueva hoja —
    // solo debe verse su miniatura en blanco aquí, por si antes hace falta
    // cambiarle la orientación (botón ⟲ de su propia tarjeta, _pgRotatePage,
    // que ya rota cualquier página por índice sin necesidad de saltar a
    // ella). Mismo guard anti-doble-disparo que duplicar/rotar/eliminar/
    // reordenar (ver cabecera del archivo) — más necesario aún ahora que la
    // ventana se queda abierta tras añadir.
    if (_pgActionLocked()) return;
    edAddPage(false);
    _pgRender();
    // Desplazar la rejilla para que la tarjeta nueva (siempre la última) sea visible
    const _newCard = document.getElementById('edPagesGrid')?.lastElementChild;
    if (_newCard) _newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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
  leftBtn.title = I18n.t('ed_pageMoveLeft');
  leftBtn.textContent = '◀';
  leftBtn.disabled = idx === 0;
  leftBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    if (_pgActionLocked()) return;
    _pgReorder(idx, idx - 1);
  });

  const rightBtn = document.createElement('button');
  rightBtn.className = 'ed-layer-arrow';
  rightBtn.title = I18n.t('ed_pageMoveRight');
  rightBtn.textContent = '▶';
  rightBtn.disabled = idx === edPages.length - 1;
  rightBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    if (_pgActionLocked()) return;
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
  dupBtn.title = I18n.t('ed_pageDuplicate');
  dupBtn.innerHTML = '⧉';
  dupBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (_pgActionLocked()) return;
    _pgDuplicate(idx);
  });

  const rotBtn = document.createElement('button');
  rotBtn.className = 'ed-page-action-btn ed-page-rot';
  const pageOrient = page.orientation || edOrientation;
  rotBtn.title = I18n.t('ed_pageRotate');
  rotBtn.innerHTML = _pgOrientIcon(pageOrient);
  rotBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (_pgActionLocked()) return;
    _pgRotatePage(idx);
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'ed-page-action-btn ed-page-del';
  delBtn.title = I18n.t('ed_pageDelete');
  delBtn.innerHTML = '<span style="color:#e63030;font-weight:900">✕</span>';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (_pgActionLocked()) return;
    if (edPages.length <= 1) { edToast(I18n.t('ed_pageDeleteLastErr')); return; }
    edConfirm(I18n.t('ed_pageDeleteConfirm'), () => {
      // Ver _tdMigrateFlowSourceHTMLIfNeeded (editor-textdoc.js) — si esta
      // hoja es la que guarda el sourceHTML del flujo de texto, lo traslada
      // antes de borrarla.
      if (typeof _tdMigrateFlowSourceHTMLIfNeeded === 'function') _tdMigrateFlowSourceHTMLIfNeeded(idx);
      edPages.splice(idx, 1);
      if (typeof _edMarkPagesStructureDirty === 'function') _edMarkPagesStructureDirty();
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
    if (!_idMap.has(oldId)) _idMap.set(oldId, _edGenUid());
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

    // _gcpFramesData/_gcpLayersData/_gcpLayerNames/_gcpFrameHolds (composición y
    // comportamiento de animación GCP) Y animKey/_pngFramesKey/_apngIdbKey (la
    // clave de IndexedDB donde viven los fotogramas reales): edSerLayer copia
    // TODO esto por REFERENCIA/tal cual — ver el comentario extenso junto a
    // _edCloneLayerAnimStorage/_edCloneLayerAnimData (edDeserLayer, editor.js).
    // Sin este clonado, duplicar una hoja con una animación dejaba la copia
    // apuntando a la MISMA entrada de IndexedDB que el original — reeditar esa
    // animación en cualquiera de las dos hojas corrompía la otra al guardar
    // (bug reportado por Alberto).
    _edCloneLayerAnimData(copy);
    _edCloneLayerAnimStorage(copy);

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
    _dirtyCountLocal: 1,
    _dirtyCountCloud: 1,
  };

  // Insertar a continuación
  edPages.splice(idx + 1, 0, newPage);
  if (typeof _edMarkPagesStructureDirty === 'function') _edMarkPagesStructureDirty();
  edPushHistory();
  edToast(I18n.t('ed_pageDuplicatedToast', { n: idx + 1 }));
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
    if (typeof _edMarkPagesStructureDirty === 'function') _edMarkPagesStructureDirty();
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

// Recoloca TODAS las capas de una página (y sus fotogramas de animación GCP,
// si los tiene) al cambiar la orientación, preservando el aspecto visual y el
// tamaño en píxeles absolutos de cada objeto — no importa si el objeto queda
// parcialmente fuera de la página tras el cambio, su relación altura/anchura
// nunca debe alterarse.
// Compartida por _pgRotatePage() (icono ⟲ de la miniatura, panel Hojas) y por
// edSetOrientation() (menú "Hoja ▾ → Orientación → Vertical/Horizontal") — antes
// cada ruta tenía su propia lógica y solo esta primera cubría todos los tipos
// de capa; la segunda dejaba trazos a mano, gifs, formas, texto, bocadillos y
// líneas sin recalcular, deformándolos (bug reportado por Alberto — regresión
// de un fix anterior que solo llegó a cubrir una de las dos rutas).
// Estrategia: cada objeto conserva su tamaño y posición en PÍXELES ABSOLUTOS;
// solo cambia su fracción respecto a la nueva página (que tiene w/h intercambiados).
function _edRelayoutLayersForOrientation(layers, fromOrient, toOrient) {
  if (!layers || !layers.length || fromOrient === toOrient) return;

  const sv    = fromOrient === 'vertical';
  const pwOld = sv ? ED_PAGE_W : ED_PAGE_H;
  const phOld = sv ? ED_PAGE_H : ED_PAGE_W;
  const pwNew = sv ? ED_PAGE_H : ED_PAGE_W;
  const phNew = sv ? ED_PAGE_W : ED_PAGE_H;

  // Recoloca un "box" (objeto o fotograma con x/y/width/height) preservando
  // su tamaño en píxeles absolutos.
  // isImage: recalcula height a partir del ratio real de la imagen (más preciso
  //   que solo preservar píxeles — evita deriva por redondeos acumulados).
  // x/y NUNCA se clampean a [0,1]: todos los tipos pueden quedar parcialmente
  // fuera de la página tras el cambio de orientación (decisión de Alberto —
  // antes solo 'stroke' e 'image' lo permitían y el resto se forzaba dentro,
  // lo que podía separar visualmente a miembros de un mismo grupo).
  function relayoutBox(box, isImage, imgAspect) {
    const w_px = (box.width  || 0) * pwOld;
    const h_px = (box.height || 0) * phOld;

    if (isImage && imgAspect > 0) {
      box.width  = Math.min(1, w_px / pwNew);
      box.height = box.width * imgAspect * (pwNew / phNew);
      if (box.height > 1) { const s = 1 / box.height; box.height = 1; box.width = Math.min(1, box.width * s); }
    } else {
      const rawW = w_px / pwNew, rawH = h_px / phNew;
      // Si alguna dimensión no cabe en la nueva página, escalar AMBAS por
      // igual (no cada una por separado) para no deformar el objeto.
      const clampScale = (rawW > 1 || rawH > 1)
        ? Math.min(1 / Math.max(rawW, 1e-9), 1 / Math.max(rawH, 1e-9))
        : 1;
      box.width  = rawW * clampScale;
      box.height = rawH * clampScale;
    }
    box.x = (box.x != null ? box.x : 0.5) * pwOld / pwNew;
    box.y = (box.y != null ? box.y : 0.5) * phOld / phNew;
  }

  layers.forEach(la => {
    if (!la) return;

    // draw: cubre todo el workspace fijo — no tiene x/y/width/height significativos
    if (la.type === 'draw') return;

    // SF: el FillLayer sigue al objeto vinculado (stroke/shape/línea).
    // Sus propiedades (x/y/w/h) se sincronizan después del loop.
    // El canvas local (SF, _isWorkspaceCanvas=false) no necesita mover píxeles
    // porque draw() usa las propiedades x/y/w/h para posicionarlo correctamente.
    if (la.type === 'fill') return;

    const isImg     = la.type === 'image' && la.img && la.img.naturalWidth > 0;
    const imgAspect = isImg ? (la.img.naturalHeight / la.img.naturalWidth) : 0;

    relayoutBox(la, isImg, imgAspect);

    if (la.type === 'line' && Array.isArray(la.points)) {
      // LineLayer: reescalar puntos al nuevo sistema sin rotar
      const scW = pwOld / pwNew, scH = phOld / phNew;
      const scalePt = p => p ? { ...p, x: p.x * scW, y: p.y * scH,
        cp1: p.cp1 ? { x: p.cp1.x * scW, y: p.cp1.y * scH } : p.cp1,
        cp2: p.cp2 ? { x: p.cp2.x * scW, y: p.cp2.y * scH } : p.cp2 } : null;
      la.points = la.points.map(scalePt);
      if (Array.isArray(la.subPaths))
        la.subPaths = la.subPaths.map(sp => sp.map(scalePt));
    }

    // Fotogramas de animación (editor GCP, ▶): cada uno guarda su propio
    // x/y/width/height (ver _gcpApplyFrame) y hay que recolocarlos igual que
    // la propiedad base, o la animación se ve deformada/desplazada en los
    // fotogramas ya grabados aunque el objeto "en reposo" se vea bien.
    if (Array.isArray(la._frames) && la._frames.length) {
      la._frames.forEach(fr => { if (fr) relayoutBox(fr, isImg, imgAspect); });
    }
    // Sin cambio de rotation — el objeto no se gira
  });

  // Sincronizar fills con su objeto vinculado (mismas propiedades)
  layers.forEach(l => {
    if (l.type === 'fill' && l._drawLayerId) {
      const src = layers.find(s => s._fillLayerId === l._drawLayerId);
      if (src) {
        l.x = src.x; l.y = src.y;
        l.width = src.width; l.height = src.height;
        l.rotation = src.rotation || 0;
      }
    }
  });
}

// Cambia la orientación de una hoja preservando el aspecto visual de todos los objetos.
function _pgRotatePage(idx) {
  const page = edPages[idx];
  if (!page) return;

  const currentOrient = page.orientation || edOrientation;
  const newOrient = currentOrient === 'vertical' ? 'horizontal' : 'vertical';

  _edRelayoutLayersForOrientation(page.layers, currentOrient, newOrient);

  page.orientation = newOrient;
  // Rotar SIEMPRE cambia el contenido guardable de esta página (orientación +
  // x/y/width/height de cada capa, recalculados arriba) — marcar sucia aquí
  // de forma incondicional, sea o no la página activa. edSetOrientation/
  // edPushHistory de abajo solo cubren el caso idx===edCurrentPage.
  if (typeof _edMarkPageDirty === 'function') _edMarkPageDirty(page);

  if (idx === edCurrentPage) {
    if (typeof edSetOrientation === 'function') edSetOrientation(newOrient, false);
    if (typeof edPushHistory === 'function') edPushHistory(true);
    if (typeof edFitCanvas === 'function') edFitCanvas(true);
    if (typeof edRedraw === 'function') edRedraw();
  }

  edToast(I18n.t('ed_pageOrientChanged'));
  _pgRender();
}
