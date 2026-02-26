/* ============================================================
   editor-canvas.js — Fit, redraw, selección, coords, páginas, capas
   ============================================================ */

/* ══════════════════════════════════════════
   CANVAS: TAMAÑO Y FIT
   ══════════════════════════════════════════ */
function edSetOrientation(o){
  edOrientation=o;
  edCanvas.width  =o==='vertical'?ED_BASE:Math.round(ED_BASE*16/9);
  edCanvas.height =o==='vertical'?Math.round(ED_BASE*16/9):ED_BASE;
  if(edViewerCanvas){edViewerCanvas.width=edCanvas.width;edViewerCanvas.height=edCanvas.height;}
  // Doble rAF: esperar dos ciclos de layout para medidas reales del DOM
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ edFitCanvas(); edRedraw(); }));
}



function edFitCanvas(){
  const wrap=$('editorCanvasWrap');if(!wrap||!edCanvas)return;
  const topbar=$('edTopbar'),menu=$('edMenuBar'),opts=$('edOptionsPanel');

  // Medir alturas reales de las barras
  // getBoundingClientRect devuelve 0 si display:none, que es lo que queremos
  const topH  = (!edMinimized && topbar)  ? topbar.getBoundingClientRect().height  : 0;
  const menuH = (!edMinimized && menu)    ? menu.getBoundingClientRect().height    : 0;
  const optsH = (opts && opts.classList.contains('open')) ? opts.getBoundingClientRect().height : 0;

  // Posicionar barras una debajo de la otra
  if(menu && !edMinimized) menu.style.top = topH + 'px';
  if(opts) opts.style.top = (topH + menuH) + 'px';

  const totalBarsH = topH + menuH + optsH;

  // ¿Orientación coincide? → canvas fullscreen
  const isPortrait  = window.innerHeight >= window.innerWidth;
  const canvasIsV   = edOrientation === 'vertical';
  const orientMatch = (isPortrait && canvasIsV) || (!isPortrait && !canvasIsV);

  const availW = wrap.clientWidth;
  const availH = wrap.clientHeight - totalBarsH;

  let scale;
  if(orientMatch){
    // Rellenar todo el espacio disponible (sin dejar márgenes)
    scale = Math.min(availW / edCanvas.width, availH / edCanvas.height);
  } else {
    // Cabe entero con pequeño margen
    scale = Math.min((availW-8) / edCanvas.width, (availH-12) / edCanvas.height, 1);
  }
  scale = Math.max(scale, 0.1); // mínimo sensato

  edCanvas.style.width  = Math.round(edCanvas.width  * scale) + 'px';
  edCanvas.style.height = Math.round(edCanvas.height * scale) + 'px';
  edCanvas.style.marginTop = totalBarsH + 'px';
}

/* ══════════════════════════════════════════
   REDRAW
   ══════════════════════════════════════════ */
function edRedraw(){
  if(!edCtx)return;
  const cw=edCanvas.width,ch=edCanvas.height;
  edCtx.clearRect(0,0,cw,ch);
  edCtx.fillStyle='#ffffff';edCtx.fillRect(0,0,cw,ch);
  const page=edPages[edCurrentPage];if(!page)return;
  // Imágenes primero, luego texto/bocadillos encima
  // Render: imágenes en su orden, luego la capa agrupada de textos/bocadillos siempre encima
  const _imgLayers  = edLayers.filter(l=>l.type==='image');
  const _textLayers = edLayers.filter(l=>l.type==='text'||l.type==='bubble');
  // Opacidad global de la capa de textos (máximo de todos sus objetos individuales,
  // o bien edPage.textLayerOpacity si se definió desde el panel de capas)
  const _textGroupAlpha = page.textLayerOpacity ?? 1;

  _imgLayers.forEach(l=>{
    edCtx.globalAlpha = l.opacity ?? 1;
    l.draw(edCtx,edCanvas);
    edCtx.globalAlpha = 1;
  });
  if(page.drawData){
    const img=new Image();
    img.onload=()=>{
      edCtx.drawImage(img,0,0);
      edCtx.globalAlpha = _textGroupAlpha;
      _textLayers.forEach(l=>{ l.draw(edCtx,edCanvas); });
      edCtx.globalAlpha = 1;
      edDrawSel();
    };
    img.src=page.drawData;return;
  }
  edCtx.globalAlpha = _textGroupAlpha;
  _textLayers.forEach(l=>{ l.draw(edCtx,edCanvas); });
  edCtx.globalAlpha = 1;
  edDrawSel();
}


/* ══════════════════════════════════════════
   ICONOS FLOTANTES SOBRE OBJETO SELECCIONADO
   ══════════════════════════════════════════ */

function edIsTouchDevice(){
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}
function edDrawSel(){
  if(edSelectedIdx<0||edSelectedIdx>=edLayers.length)return;
  const la=edLayers[edSelectedIdx];
  const cw=edCanvas.width,ch=edCanvas.height;
  const x=la.x*cw,y=la.y*ch,w=la.width*cw,h=la.height*ch;
  edCtx.save();
  edCtx.strokeStyle='#ff6600';edCtx.lineWidth=2;edCtx.setLineDash([5,3]);
  edCtx.strokeRect(x-w/2,y-h/2,w,h);edCtx.setLineDash([]);
  if(la.type==='image' && !edIsTouchDevice()){
    edCtx.fillStyle='#ff4444';
    la.getControlPoints().forEach(p=>{
      const px=p.x*cw,py=p.y*ch;
      edCtx.beginPath();edCtx.arc(px,py,6,0,Math.PI*2);edCtx.fill();
      edCtx.strokeStyle='#fff';edCtx.lineWidth=1.5;edCtx.stroke();
    });
  }
  if(la.type==='bubble'){
    edCtx.fillStyle='#ff4444';
    la.getTailControlPoints().forEach(p=>{
      const px=p.x*cw,py=p.y*ch;
      edCtx.beginPath();edCtx.arc(px,py,7,0,Math.PI*2);edCtx.fill();
      edCtx.strokeStyle='#fff';edCtx.lineWidth=1.5;edCtx.stroke();
    });
  }
  edCtx.restore();
}

/* ══════════════════════════════════════════
   PÁGINAS
   ══════════════════════════════════════════ */
function edAddPage(){
  edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'immediate'});
  edLoadPage(edPages.length-1);
  edToast('Página añadida');
}
function edDeletePage(){
  if(edPages.length<=1){edToast('Necesitas al menos una página');return;}
  edPages.splice(edCurrentPage,1);
  edLoadPage(Math.min(edCurrentPage,edPages.length-1));
}
function edLoadPage(idx){
  edCurrentPage=idx;edLayers=edPages[idx].layers;edSelectedIdx=-1;
  edRedraw();edUpdateNavPages();edRenderOptionsPanel();
}
function edUpdateNavPages(){
  const wrap=$('ddNavPages');if(!wrap)return;
  wrap.innerHTML='';
  edPages.forEach((p,i)=>{
    const btn=document.createElement('button');
    btn.className='op-btn'+(i===edCurrentPage?' active':'');
    btn.textContent=i+1;
    btn.style.cssText='padding:5px 10px;min-width:32px;justify-content:center';
    btn.addEventListener('click',()=>{edLoadPage(i);edCloseMenus();});
    wrap.appendChild(btn);
  });
  // Marcar orientación activa
  $('dd-orientv')?.classList.toggle('active',edOrientation==='vertical');
  $('dd-orienth')?.classList.toggle('active',edOrientation==='horizontal');
}

/* ══════════════════════════════════════════
   CAPAS
   ══════════════════════════════════════════ */
function edAddImage(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const w=0.7,h=w*(img.naturalHeight/img.naturalWidth)*(edCanvas.width/edCanvas.height);
      const layer=new ImageLayer(img,0.5,0.5,w);
      layer.height=Math.min(h,0.85);
      if(layer.height===0.85)layer.width=0.85*(edCanvas.height/edCanvas.width)*(img.naturalWidth/img.naturalHeight);
      // Insertar imagen antes del primer texto/bocadillo (textos siempre encima)
      const firstTextIdx = edLayers.findIndex(l => l.type==='text'||l.type==='bubble');
      if(firstTextIdx >= 0){
        edLayers.splice(firstTextIdx, 0, layer);
        edSelectedIdx = firstTextIdx;
      } else {
        edLayers.push(layer);
        edSelectedIdx = edLayers.length - 1;
      }
      edPushHistory();edRedraw();edRenderOptionsPanel('props');edToast('Imagen añadida ✓');
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}
function edAddText(){
  const l=new TextLayer('Escribe aquí');l.resizeToFitText(edCanvas);
  edLayers.push(l);edSelectedIdx=edLayers.length-1;
  edPushHistory();edRedraw();edRenderOptionsPanel('props');
}
function edAddBubble(){
  const l=new BubbleLayer('Escribe aquí');l.resizeToFitText(edCanvas);
  edLayers.push(l);edSelectedIdx=edLayers.length-1;
  edPushHistory();edRedraw();edRenderOptionsPanel('props');
}
function edDeleteSelected(){
  if(edSelectedIdx<0){edToast('Selecciona un objeto');return;}
  edLayers.splice(edSelectedIdx,1);edSelectedIdx=-1;
  edPushHistory();edRedraw();edRenderOptionsPanel();
}

/* ══════════════════════════════════════════
   EVENTOS CANVAS
   ══════════════════════════════════════════ */
function edCoords(e){
  const rect=edCanvas.getBoundingClientRect();
  const sx=edCanvas.width/rect.width,sy=edCanvas.height/rect.height;
  const src=e.touches?e.touches[0]:e;
  const px=(src.clientX-rect.left)*sx;   // sin clamp: permite salir del canvas
  const py=(src.clientY-rect.top)*sy;
  return{px,py,nx:px/edCanvas.width,ny:py/edCanvas.height};
}


