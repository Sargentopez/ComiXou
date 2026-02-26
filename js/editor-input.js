/* ============================================================
   editor-input.js — Eventos canvas: drag, resize, pinch, dibujo
   ============================================================ */

/* ══════════════════════════════════════════
   PINCH-TO-ZOOM (2 dedos)
   ══════════════════════════════════════════ */
function _pinchDist(t) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.hypot(dx, dy);
}
function _pinchMidCanvas(t) {
  // Punto medio en coordenadas normalizadas del canvas
  const rect = edCanvas.getBoundingClientRect();
  const sx = edCanvas.width / rect.width, sy = edCanvas.height / rect.height;
  const mx = ((t[0].clientX + t[1].clientX) / 2 - rect.left) * sx;
  const my = ((t[0].clientY + t[1].clientY) / 2 - rect.top)  * sy;
  return { nx: mx / edCanvas.width, ny: my / edCanvas.height };
}
function edPinchStart(e) {
  if (e.touches.length !== 2) return false;
  edPinching  = true;
  edPinchDist0 = _pinchDist(e.touches);
  const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
  edPinchScale0 = la ? { w: la.width, h: la.height, x: la.x, y: la.y }
                     : null;
  return true;
}
function edPinchMove(e) {
  if (!edPinching || e.touches.length !== 2) return;
  const dist = _pinchDist(e.touches);
  const ratio = dist / Math.max(edPinchDist0, 1);
  const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
  if (la && edPinchScale0) {
    // Escalar la capa seleccionada desde su tamaño inicial
    const newW = Math.min(Math.max(edPinchScale0.w * ratio, 0.04), 2.0);
    const asp  = edPinchScale0.h / edPinchScale0.w;
    la.width  = newW;
    la.height = newW * asp;
    edRedraw();
  }
}
function edPinchEnd() {
  edPinching   = false;
  edPinchDist0 = 0;
  edPinchScale0 = null;
}


/* ══════════════════════════════════════════
   ICONO ⚙ SOBRE OBJETO SELECCIONADO
   Permanente mientras el objeto está seleccionado.
   Centro del círculo = centro de la línea superior del marco.
   Se mueve con el objeto en tiempo real.
   ══════════════════════════════════════════ */

function _edGearPos(la){
  // Devuelve {left, top} en px fixed para el centro del icono
  const canvasRect = edCanvas.getBoundingClientRect();
  const scaleX = canvasRect.width  / edCanvas.width;
  const scaleY = canvasRect.height / edCanvas.height;
  // Centro X del objeto, línea superior del marco
  const cx = canvasRect.left + la.x * edCanvas.width  * scaleX;
  const ty = canvasRect.top  + (la.y - la.height / 2) * edCanvas.height * scaleY;
  return { cx, ty };
}

function edShowGearIcon(layerIdx){
  edHideGearIcon();
  if(layerIdx < 0 || layerIdx >= edLayers.length) return;

  const SIZE = 32;
  const R    = SIZE / 2;

  const btn = document.createElement('button');
  btn.id = 'edGearIcon';
  btn.innerHTML = '⚙';
  btn.title = 'Opciones del objeto';
  btn.style.cssText = [
    'position:fixed',
    'z-index:500',
    `width:${SIZE}px`,
    `height:${SIZE}px`,
    'border-radius:50%',
    'background:#fff',
    'border:2.5px solid #ff6600',
    'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-size:15px',
    'cursor:pointer',
    'opacity:0',
    'transition:opacity 0.12s',
    'pointer-events:all',
    'user-select:none',
    '-webkit-user-select:none',
    'padding:0',
    'line-height:1',
  ].join(';');

  btn.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
  btn.addEventListener('click', e => {
    e.stopPropagation();
    edPanelUserClosed = false;
    edRenderOptionsPanel('props');
  });

  document.body.appendChild(btn);
  edUpdateGearPos();                         // posicionar antes del fade-in
  requestAnimationFrame(() => { btn.style.opacity = '1'; });
}

function edUpdateGearPos(){
  // Llamado en cada redraw y en cada frame de drag para seguir al objeto
  const btn = document.getElementById('edGearIcon');
  if(!btn) return;
  if(edSelectedIdx < 0 || edSelectedIdx >= edLayers.length){ edHideGearIcon(); return; }
  const la = edLayers[edSelectedIdx];
  const { cx, ty } = _edGearPos(la);
  const R = 16;
  btn.style.left = Math.round(cx - R) + 'px';
  btn.style.top  = Math.round(ty - R) + 'px';
}

function edHideGearIcon(){
  const btn = document.getElementById('edGearIcon');
  if(btn) btn.remove();
}

// Alias para compatibilidad con llamadas anteriores
function edHideContextMenu(){ edHideGearIcon(); }
function edShowContextMenu(idx){ edShowGearIcon(idx); }

function edOnStart(e){
  e.preventDefault();
  // 2 dedos → iniciar pinch-to-zoom
  if(e.touches && e.touches.length === 2){
    edPinchStart(e);
    return;
  }
  if(edMenuOpen){edCloseMenus();return;}
  edHideContextMenu();
  if(['draw','eraser'].includes(edActiveTool)){edStartPaint(e);return;}
  const c=edCoords(e);
  // Cola bocadillo
  if(edSelectedIdx>=0&&edLayers[edSelectedIdx]?.type==='bubble'){
    const la=edLayers[edSelectedIdx];
    for(const p of la.getTailControlPoints()){
      if(Math.hypot(c.nx-p.x,c.ny-p.y)<0.04){edIsTailDragging=true;edTailPointType=p.type;return;}
    }
  }
  // Resize imagen por puntos: solo en PC (táctil usa pinch)
  if(!edIsTouchDevice() && edSelectedIdx>=0&&edLayers[edSelectedIdx]?.type==='image'){
    const la=edLayers[edSelectedIdx];
    for(const p of la.getControlPoints()){
      if(Math.hypot(c.nx-p.x,c.ny-p.y)<0.04){
        edIsResizing=true;edResizeCorner=p.corner;
        // Guardamos el centro del objeto y el aspect ratio
        // La fórmula: nw = distancia(ratón, centro) * 2
        edInitialSize={width:la.width,height:la.height,
                       cx:la.x, cy:la.y,   // centro del objeto
                       asp:la.height/la.width};
        return;
      }
    }
  }
  // Seleccionar
  let found=-1;
  for(let i=edLayers.length-1;i>=0;i--){if(edLayers[i].contains(c.nx,c.ny)){found=i;break;}}
  if(found>=0){
    edSelectedIdx = found;
    edDragOffX = c.nx - edLayers[found].x;
    edDragOffY = c.ny - edLayers[found].y;
    edIsDragging = true;
    edHideGearIcon();
    // Doble tap en el mismo objeto → abrir propiedades
    const now = Date.now();
    if(found === _edLastTapIdx && now - _edLastTapTime < 350){
      edIsDragging = false;
      clearTimeout(window._edLongPress);
      edRenderOptionsPanel('props');
      _edLastTapTime = 0; _edLastTapIdx = -1;
    } else {
      _edLastTapTime = now; _edLastTapIdx = found;
      // Long-press 600ms sin mover → mostrar gear / abrir propiedades
      clearTimeout(window._edLongPress);
      window._edLongPress = setTimeout(() => {
        if(edSelectedIdx === found && !edIsResizing){
          edIsDragging = false;
          edRenderOptionsPanel('props');
        }
      }, 600);
    }
  } else {
    edSelectedIdx = -1;
    edHideContextMenu();
    edRenderOptionsPanel();
  }
  edRedraw();
}
function edOnMove(e){
  e.preventDefault();
  // Pinch activo
  if(e.touches && e.touches.length === 2){
    edPinchMove(e);
    return;
  }
  if(edPinching) return; // segundo dedo levantado, esperar edOnEnd
  if(['draw','eraser'].includes(edActiveTool)&&edPainting){edContinuePaint(e);return;}
  const c=edCoords(e);
  clearTimeout(window._edLongPress); // cancelar longpress si el dedo se movió
  if(edIsTailDragging&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const dx=c.nx-la.x,dy=c.ny-la.y;
    if(edTailPointType==='start'){la.tailStart.x=dx/la.width;la.tailStart.y=dy/la.height;}
    else{la.tailEnd.x=dx/la.width;la.tailEnd.y=dy/la.height;}
    edRedraw();return;
  }
  if(edIsResizing&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const asp=edInitialSize.asp;
    // nw = distancia del ratón al centro del objeto * 2
    // Esquinas izq: el borde izq se mueve → la distancia es cx - mouseX
    // Esquinas der: el borde der se mueve → la distancia es mouseX - cx
    let halfW;
    if(edResizeCorner==='tr'||edResizeCorner==='br'){
      halfW = c.nx - edInitialSize.cx;           // borde derecho
    } else {
      halfW = edInitialSize.cx - c.nx;           // borde izquierdo
    }
    const nw = halfW * 2;
    if(nw > 0.02){ la.width = nw; la.height = nw * asp; }
    edRedraw();
    edHideGearIcon();
    return;
  }
  if(!edIsDragging||edSelectedIdx<0)return;
  const la=edLayers[edSelectedIdx];
  la.x = c.nx - edDragOffX;  // sin clamp: las imágenes pueden salir del canvas
  la.y = c.ny - edDragOffY;
  edRedraw();
  edHideGearIcon(); // ocultar durante drag
}
function edOnEnd(e){
  // Si quedan menos de 2 dedos, terminar pinch
  if(edPinching && (!e || !e.touches || e.touches.length < 2)){
    edPinchEnd();
    return;
  }
  if(edPainting){edPainting=false;edSaveDrawData();}
  clearTimeout(window._edLongPress); // cancelar longpress si soltó antes
  const wasDragging = edIsDragging||edIsResizing||edIsTailDragging;
  if(wasDragging) edPushHistory();
  edIsDragging=false;edIsResizing=false;edIsTailDragging=false;
}

/* ══════════════════════════════════════════
   DIBUJO LIBRE
   ══════════════════════════════════════════ */
function edStartPaint(e){
  edPainting=true;
  const c=edCoords(e),er=edActiveTool==='eraser';
  edCtx.save();
  if(er)edCtx.globalCompositeOperation='destination-out';
  else{edCtx.globalCompositeOperation='source-over';edCtx.fillStyle=edDrawColor;}
  edCtx.beginPath();edCtx.arc(c.px,c.py,(er?edEraserSize:edDrawSize)/2,0,Math.PI*2);edCtx.fill();
  edCtx.restore();edCtx.globalCompositeOperation='source-over';
  edLastPX=c.px;edLastPY=c.py;edMoveBrush(e);
}
function edContinuePaint(e){
  const c=edCoords(e),er=edActiveTool==='eraser';
  edCtx.save();edCtx.beginPath();edCtx.moveTo(edLastPX,edLastPY);edCtx.lineTo(c.px,c.py);
  if(er){edCtx.globalCompositeOperation='destination-out';edCtx.strokeStyle='rgba(0,0,0,1)';}
  else{edCtx.globalCompositeOperation='source-over';edCtx.strokeStyle=edDrawColor;}
  edCtx.lineWidth=er?edEraserSize:edDrawSize;edCtx.lineCap='round';edCtx.lineJoin='round';edCtx.stroke();
  edCtx.restore();edCtx.globalCompositeOperation='source-over';
  edLastPX=c.px;edLastPY=c.py;edMoveBrush(e);
}
function edSaveDrawData(){
  const page=edPages[edCurrentPage];if(!page)return;page.drawData=edCanvas.toDataURL();
}
function edClearDraw(){
  const page=edPages[edCurrentPage];if(!page)return;page.drawData=null;edRedraw();edToast('Dibujos borrados');
}
function edMoveBrush(e){
  const src=e.touches?e.touches[0]:e,cur=$('edBrushCursor');if(!cur)return;
  const sz=(edActiveTool==='eraser'?edEraserSize:edDrawSize)*2;
  cur.style.left=src.clientX+'px';cur.style.top=src.clientY+'px';
  cur.style.width=sz+'px';cur.style.height=sz+'px';
}

/* ══════════════════════════════════════════
   MENÚ
   ══════════════════════════════════════════ */
