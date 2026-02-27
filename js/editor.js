/* ============================================================
   editor.js — ComiXow v4.6
   Motor canvas fiel al referEditor.
   Menú tipo page-nav, botón flotante al minimizar.
   ============================================================ */

/* ── ESTADO ── */
let edCanvas, edCtx, edViewerCanvas, edViewerCtx;
let edPages = [], edCurrentPage = 0, edLayers = [];
let edSelectedIdx = -1;
let edIsDragging = false, edIsResizing = false, edIsTailDragging = false;
let edTailPointType = null, edResizeCorner = null;
let edDragOffX = 0, edDragOffY = 0, edInitialSize = {};
let edOrientation = 'vertical';
let edProjectId = null;
let edProjectMeta = { title:'', author:'', genre:'', navMode:'horizontal' };
let edActiveTool = 'select';  // select | draw | eraser
let edPainting = false, edLastPX = 0, edLastPY = 0;
let edDrawColor = '#e63030', edDrawSize = 8, edEraserSize = 20;
let edMenuOpen = null;     // id del dropdown abierto
let edMinimized = false;
let edFloatX = 16, edFloatY = 200; // posición del botón flotante
// Pinch-to-zoom
let edPinching = false, edPinchDist0 = 0, edPinchScale0 = {w:0,h:0,x:0,y:0};
let edPanelUserClosed = false;  // true = usuario cerró panel con ✓, no reabrir al seleccionar
let edZoom = 1.0;               // factor de zoom extra (Ctrl+wheel / pinch fuera de canvas)
let _edLastTapTime = 0, _edLastTapIdx = -1; // para detectar doble tap
let edHistory = [], edHistoryIdx = -1;
const ED_MAX_HISTORY = 10;
let edViewerTextStep = 0;  // nº de textos revelados en modo secuencial

const ED_BASE = 360;
const $ = id => document.getElementById(id);

/* ══════════════════════════════════════════
   CLASES (motor referEditor)
   ══════════════════════════════════════════ */

class BaseLayer {
  constructor(type,x=0.5,y=0.5,width=0.3,height=0.2){
    this.type=type;this.x=x;this.y=y;this.width=width;this.height=height;this.rotation=0;
  }
  contains(px,py){
    return px>=this.x-this.width/2&&px<=this.x+this.width/2&&
           py>=this.y-this.height/2&&py<=this.y+this.height/2;
  }
  getControlPoints(){
    if(this.type!=='image')return[];
    const hw=this.width/2,hh=this.height/2;
    return[{x:this.x-hw,y:this.y-hh,corner:'tl'},{x:this.x+hw,y:this.y-hh,corner:'tr'},
           {x:this.x-hw,y:this.y+hh,corner:'bl'},{x:this.x+hw,y:this.y+hh,corner:'br'}];
  }
  resizeToFitText(){}
}

class ImageLayer extends BaseLayer {
  constructor(imgEl,x=0.5,y=0.5,width=0.4){
    super('image',x,y,width,0.3);
    if(imgEl){
      this.img=imgEl; this.src=imgEl.src||'';
      if(imgEl.naturalWidth&&imgEl.naturalHeight)
        this.height=width*(imgEl.naturalHeight/imgEl.naturalWidth);
    } else {
      this.img=null; this.src='';
    }
  }
  draw(ctx,can){
    if(!this.img || !this.img.complete || this.img.naturalWidth===0) return;
    const w=this.width*can.width,h=this.height*can.height;
    const px=this.x*can.width,py=this.y*can.height;
    ctx.save();ctx.translate(px,py);ctx.rotate(this.rotation*Math.PI/180);
    ctx.drawImage(this.img,-w/2,-h/2,w,h);ctx.restore();
  }
}

class TextLayer extends BaseLayer {
  constructor(text='Escribe aquí',x=0.5,y=0.5){
    super('text',x,y,0.2,0.1);
    this.text=text;this.fontSize=20;this.fontFamily='Arial';
    this.color='#000000';this.backgroundColor='#ffffff';
    this.borderColor='#000000';this.borderWidth=0;this.padding=10;
  }
  getLines(){return this.text.split('\n');}
  measure(ctx){
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    let mw=0,th=0;
    this.getLines().forEach(l=>{mw=Math.max(mw,ctx.measureText(l).width);th+=this.fontSize*1.2;});
    return{width:mw,height:th};
  }
  resizeToFitText(can){
    const ctx=can.getContext('2d'),{width,height}=this.measure(ctx);
    this.width=Math.max(0.05,(width+this.padding*2)/can.width);
    this.height=Math.max(0.05,(height+this.padding*2)/can.height);
  }
  draw(ctx,can){
    const w=this.width*can.width,h=this.height*can.height;
    const px=this.x*can.width,py=this.y*can.height;
    ctx.save();
    ctx.fillStyle=this.backgroundColor; ctx.fillRect(px-w/2,py-h/2,w,h);
    if(this.borderWidth>0){
      ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth;
      ctx.strokeRect(px-w/2,py-h/2,w,h);
    }
    ctx.translate(px,py); ctx.rotate(this.rotation*Math.PI/180);
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    const isPlaceholder = this.text==='Escribe aquí';
    ctx.fillStyle=isPlaceholder?'#aaaaaa':this.color;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const lines=this.getLines(),lh=this.fontSize*1.2,totalH=lines.length*lh;
    lines.forEach((l,i)=>ctx.fillText(l,0,-totalH/2+lh/2+i*lh));
    ctx.restore();
  }
}

class BubbleLayer extends BaseLayer {
  constructor(text='Escribe aquí',x=0.5,y=0.5){
    super('bubble',x,y,0.3,0.15);
    this.text=text;this.fontSize=18;this.fontFamily='Comic Sans MS, cursive';
    this.color='#000000';this.backgroundColor='#ffffff';
    this.borderColor='#000000';this.borderWidth=2;
    this.tail=true;this.tailStart={x:-0.4,y:0.4};this.tailEnd={x:-0.4,y:0.6};
    this.style='conventional';this.multipleCount=3;this.padding=15;
  }
  getLines(){return this.text.split('\n');}
  measure(ctx){
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    let mw=0,th=0;
    this.getLines().forEach(l=>{mw=Math.max(mw,ctx.measureText(l).width);th+=this.fontSize*1.2;});
    return{width:mw,height:th};
  }
  resizeToFitText(can){
    const ctx=can.getContext('2d'),{width,height}=this.measure(ctx);
    this.width=Math.max(0.05,(width+this.padding*2)/can.width);
    this.height=Math.max(0.05,(height+this.padding*2)/can.height);
  }
  getTailControlPoints(){
    if(!this.tail)return[];
    return[
      {x:this.x+this.tailStart.x*this.width,y:this.y+this.tailStart.y*this.height,type:'start'},
      {x:this.x+this.tailEnd.x*this.width,  y:this.y+this.tailEnd.y*this.height,  type:'end'},
    ];
  }
  drawTail(ctx,sx,sy,ex,ey,common=false){
    ctx.save();
    ctx.fillStyle=this.backgroundColor;ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;
    const angle=Math.atan2(ey-sy,ex-sx),bw=10;
    const perp={x:-Math.sin(angle),y:Math.cos(angle)};
    const left={x:sx+perp.x*bw/2,y:sy+perp.y*bw/2};
    const right={x:sx-perp.x*bw/2,y:sy-perp.y*bw/2};
    ctx.beginPath();ctx.moveTo(left.x,left.y);ctx.lineTo(ex,ey);ctx.lineTo(right.x,right.y);
    ctx.closePath();ctx.fill();ctx.stroke();
    if(common){
      ctx.beginPath();ctx.moveTo(left.x,left.y);ctx.lineTo(right.x,right.y);
      ctx.strokeStyle=this.backgroundColor;ctx.lineWidth=this.borderWidth*2+2;ctx.stroke();
    }
    ctx.restore();
  }
  draw(ctx,can){
    const w=this.width*can.width,h=this.height*can.height;
    const pos={x:this.x*can.width,y:this.y*can.height};
    const isSingle=this.text.trim().length===1&&/[a-zA-Z0-9]/.test(this.text.trim());
    ctx.save();ctx.translate(pos.x,pos.y);

    if(this.style==='thought'){
      const circles=[{x:0,y:-h/4,r:w/3},{x:w/4,y:0,r:w/3},{x:-w/4,y:0,r:w/3},{x:0,y:h/4,r:w/3}];
      ctx.fillStyle=this.backgroundColor;ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;
      circles.forEach(c=>{ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);ctx.fill();ctx.stroke();});
      function ci(c1,c2){
        const dx=c2.x-c1.x,dy=c2.y-c1.y,d=Math.hypot(dx,dy);
        if(d>c1.r+c2.r||d<Math.abs(c1.r-c2.r)||d===0)return[];
        const a=(c1.r*c1.r-c2.r*c2.r+d*d)/(2*d),h2=c1.r*c1.r-a*a;
        if(h2<0)return[];const hh=Math.sqrt(h2),x0=c1.x+a*dx/d,y0=c1.y+a*dy/d;
        const rx=-dy*(hh/d),ry=dx*(hh/d);
        return[{x:x0+rx,y:y0+ry},{x:x0-rx,y:y0-ry}];
      }
      let maxDist=0;
      [[0,1],[0,2],[1,3],[2,3],[0,3],[1,2]].forEach(([a,b])=>{
        ci(circles[a],circles[b]).forEach(p=>{maxDist=Math.max(maxDist,Math.hypot(p.x,p.y));});
      });
      if(maxDist===0)maxDist=Math.min(w,h)*0.4;
      ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(0,0,maxDist,0,Math.PI*2);ctx.fill();
      // Burbujas cola pensamiento
      if(this.tail){
        const tx=this.tailEnd.x*w,ty=this.tailEnd.y*h;
        [0.09,0.055,0.03].forEach((r,i)=>{
          const f=1-i*0.3;
          ctx.beginPath();ctx.arc(tx*f,ty*f,r*Math.min(can.width,can.height),0,Math.PI*2);
          ctx.fillStyle=this.backgroundColor;ctx.fill();
          ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;ctx.stroke();
        });
      }
      // Texto centrado
      ctx.font=`${this.fontSize}px ${this.fontFamily}`;
      ctx.fillStyle=this.color;ctx.textAlign='center';ctx.textBaseline='middle';
      const lines=this.getLines(),lh=this.fontSize*1.2,totalH=lines.length*lh;
      lines.forEach((l,i)=>ctx.fillText(l,0,-totalH/2+lh/2+i*lh));
      ctx.restore();return;
    }

    if(this.style==='explosion'){
      const pts=12,step=(2*Math.PI)/pts,radii=[];
      for(let i=0;i<pts;i++)radii.push(0.8+0.3*Math.sin(i*1.5)+0.2*Math.cos(i*2.3));
      ctx.beginPath();
      for(let i=0;i<pts;i++){
        const angle=i*step,rr=radii[i]*(isSingle?Math.min(w,h)/2:(i%2===0?w/2:h/2));
        i===0?ctx.moveTo(Math.cos(angle)*rr,Math.sin(angle)*rr):ctx.lineTo(Math.cos(angle)*rr,Math.sin(angle)*rr);
      }
      ctx.closePath();
    }else if(isSingle){
      ctx.beginPath();ctx.arc(0,0,Math.min(w,h)/2,0,Math.PI*2);
    }else{
      ctx.beginPath();ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
    }

    ctx.fillStyle=this.backgroundColor;ctx.fill();
    if(this.borderWidth>0){
      ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;
      if(this.style==='lowvoice')ctx.setLineDash([5,3]);else ctx.setLineDash([]);
      ctx.stroke();ctx.setLineDash([]);
    }

    if(this.tail){
      if(this.style==='multiple'){
        for(let i=0;i<this.multipleCount;i++){
          const off=(i-(this.multipleCount-1)/2)*0.15;
          this.drawTail(ctx,(this.tailStart.x+off)*w,this.tailStart.y*h,(this.tailEnd.x+off)*w,this.tailEnd.y*h,true);
        }
      }else if(this.style==='radio'){
        const ex=this.tailEnd.x*w,ey=this.tailEnd.y*h;
        ctx.save();ctx.strokeStyle=this.borderColor;ctx.lineWidth=1;
        for(let r=5;r<25;r+=5){ctx.beginPath();ctx.arc(ex,ey,r,0,Math.PI*2);ctx.stroke();}
        ctx.restore();
      }else{
        this.drawTail(ctx,this.tailStart.x*w,this.tailStart.y*h,this.tailEnd.x*w,this.tailEnd.y*h,true);
      }
    }

    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    const isPlaceholder = this.text==='Escribe aquí';
    ctx.fillStyle=isPlaceholder?'#999999':this.color;
    ctx.textAlign='center';ctx.textBaseline='middle';
    const lines=this.getLines(),lh=this.fontSize*1.2,totalH=lines.length*lh;
    lines.forEach((l,i)=>ctx.fillText(l,0,-totalH/2+lh/2+i*lh));
    ctx.restore();
  }
}

/* ══════════════════════════════════════════
   CANVAS: TAMAÑO Y FIT
   ══════════════════════════════════════════ */
function edSetOrientation(o){
  edOrientation=o;
  edZoom = 1.0; // reset zoom al cambiar orientación
  edCanvas.width  =o==='vertical'?ED_BASE:Math.round(ED_BASE*16/9);
  edCanvas.height =o==='vertical'?Math.round(ED_BASE*16/9):ED_BASE;
  if(edViewerCanvas){edViewerCanvas.width=edCanvas.width;edViewerCanvas.height=edCanvas.height;}
  // Doble rAF: esperar dos ciclos de layout para medidas reales del DOM
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ edFitCanvas(); edRedraw(); }));
}


/* ══════════════════════════════════════════
   HISTORIAL UNDO / REDO
   ══════════════════════════════════════════ */
function _edLayersSnapshot(){
  return JSON.stringify(edLayers.map(l => {
    const o = {};
    for(const k of ['type','x','y','width','height','rotation',
                    'text','fontSize','fontFamily','color','backgroundColor',
                    'borderColor','borderWidth','padding',
                    'tail','tailStart','tailEnd','style','multipleCount']){
      if(l[k] !== undefined) o[k] = l[k];
    }
    if(l.img && l.img.complete && l.img.naturalWidth > 0) o._imgSrc = l.img.src || '';
    return o;
  }));
}

function edPushHistory(){
  const layersJSON = _edLayersSnapshot();
  const drawData   = edPages[edCurrentPage]?.drawData || null;
  if(edHistory.length > 0 && edHistoryIdx >= 0){
    const last = edHistory[edHistoryIdx];
    if(last.layersJSON === layersJSON && last.drawData === drawData) return;
  }
  edHistory = edHistory.slice(0, edHistoryIdx + 1);
  edHistory.push({ pageIdx: edCurrentPage, layersJSON, drawData });
  if(edHistory.length > ED_MAX_HISTORY) edHistory.shift();
  edHistoryIdx = edHistory.length - 1;
  edUpdateUndoRedoBtns();
}

function edUndo(){
  if(edHistoryIdx <= 0){ edToast('Nada que deshacer'); return; }
  edHistoryIdx--;
  edApplyHistory(edHistory[edHistoryIdx]);
}

function edRedo(){
  if(edHistoryIdx >= edHistory.length - 1){ edToast('Nada que rehacer'); return; }
  edHistoryIdx++;
  edApplyHistory(edHistory[edHistoryIdx]);
}

function edApplyHistory(snapshot){
  if(!snapshot) return;
  const raw = JSON.parse(snapshot.layersJSON);
  const imgPromises = [];
  edLayers = raw.map(o => {
    let l;
    if     (o.type === 'text')   l = new TextLayer(o.text, o.x, o.y);
    else if(o.type === 'bubble') l = new BubbleLayer(o.text, o.x, o.y);
    else if(o.type === 'image')  l = new ImageLayer(null, o.x, o.y);
    else return o;
    for(const k of Object.keys(o)){
      if(k !== '_imgSrc') l[k] = o[k];
    }
    if(o._imgSrc){
      const p = new Promise(resolve => {
        const img = new Image();
        img.onload  = () => { l.img = img; resolve(); };
        img.onerror = () => resolve();
        img.src = o._imgSrc;
      });
      imgPromises.push(p);
    }
    return l;
  });
  if(edPages[snapshot.pageIdx]){
    edPages[snapshot.pageIdx].layers = edLayers;
    edPages[snapshot.pageIdx].drawData = snapshot.drawData;
  }
  edSelectedIdx = -1;
  edPanelUserClosed = false;
  edUpdateUndoRedoBtns();
  Promise.all(imgPromises).then(() => edRedraw());
}

function edUpdateUndoRedoBtns(){
  const u = $('edUndoBtn'), r = $('edRedoBtn');
  if(u) u.disabled = edHistoryIdx <= 0;
  if(r) r.disabled = edHistoryIdx >= edHistory.length - 1;
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
  scale *= edZoom;               // zoom extra del usuario

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
  // Actualizar número de página en topbar
  const pnum=$('edPageNum');
  if(pnum) pnum.textContent = edCurrentPage+1;
  // Habilitar/deshabilitar flechas en topbar
  const pprev=$('edPagePrev'), pnext=$('edPageNext');
  if(pprev) pprev.disabled = edCurrentPage <= 0;
  if(pnext) pnext.disabled = edCurrentPage >= edPages.length-1;

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
  // Ignorar clicks en elementos de UI (botones, menús, overlays, paneles)
  // Solo procesar si viene del canvas o de la zona de trabajo (editorShell)
  const tgt = e.target;
  const isUI = tgt.closest('#edMenuBar')    ||
               tgt.closest('#edTopbar')     ||
               tgt.closest('#edOptionsPanel') ||
               tgt.closest('.ed-fulloverlay') ||
               tgt.closest('.ed-dropdown')  ||
               tgt.closest('#edGearIcon')   ||
               tgt.closest('#edBrushCursor')||
               tgt.closest('.ed-float-btn') ||
               tgt.closest('#editorViewer') ||
               tgt.closest('#edProjectModal');
  if(isUI) return;

  e.preventDefault();
  // 2 dedos → iniciar pinch-to-zoom
  if(e.touches && e.touches.length === 2){
    edPinchStart(e);
    return;
  }
  // Cerrar menús si están abiertos (clic en canvas o zona de trabajo)
  if(edMenuOpen){ edCloseMenus(); }
  edHideContextMenu();
  if(['draw','eraser'].includes(edActiveTool)){
    // Solo dibujar dentro del canvas
    if(tgt !== edCanvas) return;
    edStartPaint(e);return;
  }
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
  // Sin gesto activo → ignorar (solo procesar durante drags)
  const gestureActive = edIsDragging||edIsResizing||edIsTailDragging||edPainting||edPinching;
  if(!gestureActive) return;
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
    let halfW;
    if(edResizeCorner==='tr'||edResizeCorner==='br'){
      halfW = c.nx - edInitialSize.cx;
    } else {
      halfW = edInitialSize.cx - c.nx;
    }
    const nw = halfW * 2;
    if(nw > 0.02){ la.width = nw; la.height = nw * asp; }
    edRedraw();
    edHideGearIcon();
    // Cerrar panel de propiedades durante resize
    const _opPanel=$('edOptionsPanel');
    if(_opPanel&&_opPanel.classList.contains('open')){
      _opPanel.classList.remove('open'); _opPanel.innerHTML='';
    }
    return;
  }
  if(!edIsDragging||edSelectedIdx<0)return;
  const la=edLayers[edSelectedIdx];
  la.x = c.nx - edDragOffX;
  la.y = c.ny - edDragOffY;
  edRedraw();
  edHideGearIcon();
  // Cerrar panel de propiedades durante drag
  const _opP=$('edOptionsPanel');
  if(_opP&&_opP.classList.contains('open')){
    _opP.classList.remove('open'); _opP.innerHTML='';
  }
}
function edOnEnd(e){
  // Sin gesto activo → ignorar
  const gestureActive2 = edIsDragging||edIsResizing||edIsTailDragging||edPainting||edPinching;
  if(!gestureActive2) return;
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
  // Cerrar panel de propiedades al empezar a dibujar
  const _pp=$('edOptionsPanel');
  if(_pp&&_pp.classList.contains('open')){ _pp.classList.remove('open'); _pp.innerHTML=''; }
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
function edCloseMenus(){
  document.querySelectorAll('.ed-dropdown').forEach(d=>{
    d.classList.remove('open');
    // Devolver al padre original si fue movido a body
    if(d._origParent && d.parentNode === document.body){
      d._origParent.appendChild(d);
    }
    d.style.removeProperty('position');
    d.style.removeProperty('top');
    d.style.removeProperty('left');
    d.style.removeProperty('right');
    d.style.removeProperty('z-index');
  });
  document.querySelectorAll('.ed-menu-btn').forEach(b=>b.classList.remove('open'));
  edMenuOpen=null;
}

function edToggleMenu(id){
  if(edMenuOpen===id){edCloseMenus();return;}
  edCloseMenus();
  if(['draw','eraser'].includes(edActiveTool)) edDeactivateDrawTool();
  const dd=$('dd-'+id);if(!dd)return;
  const btn=document.querySelector(`[data-menu="${id}"]`);
  if(!btn)return;

  // Mover el dropdown a body para escapar de cualquier overflow/stacking context
  dd._origParent = dd._origParent || dd.parentNode;
  document.body.appendChild(dd);

  // Posicionar con fixed relativo al botón
  const r = btn.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top  = r.bottom + 'px';
  dd.style.left = r.left   + 'px';
  dd.style.right = 'auto';
  dd.style.zIndex = '9999';

  dd.classList.add('open');
  btn.classList.add('open');
  edMenuOpen = id;
  if(id === 'nav') edUpdateNavPages();

  // Corrección de desbordamiento lateral (tras render)
  requestAnimationFrame(() => {
    const ddR = dd.getBoundingClientRect();
    if(ddR.right > window.innerWidth - 4){
      dd.style.left = Math.max(4, r.right - ddR.width) + 'px';
    }
  });
}

function edDeactivateDrawTool(){
  edActiveTool='select';
  edCanvas.className='';
  const cur=$('edBrushCursor');if(cur)cur.style.display='none';
  // Close the options panel if it was showing draw options
  const panel=$('edOptionsPanel');
  if(panel)panel.classList.remove('open');
  requestAnimationFrame(edFitCanvas);
}

/* ══════════════════════════════════════════
   PANEL DE OPCIONES
   ══════════════════════════════════════════ */
function edCloseOptionsPanel(){
  const panel=$('edOptionsPanel');
  if(panel){ panel.classList.remove('open'); panel.innerHTML=''; }
  edPanelUserClosed = true;   // usuario cerró → no reabrir al seleccionar
  requestAnimationFrame(edFitCanvas);
}
function edRenderOptionsPanel(mode){
  const panel=$('edOptionsPanel');if(!panel)return;

  // Sin objeto: cerrar panel
  if(!mode||(mode==='props'&&edSelectedIdx<0)){
    panel.classList.remove('open');panel.innerHTML='';
    requestAnimationFrame(edFitCanvas);return;
  }

  if(mode==='draw'){
    panel.innerHTML=`
      <div class="op-row" style="align-items:center">
        <span style="font-size:.7rem;font-weight:900;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em">Color</span>
        <input type="color" class="op-color" id="op-dcolor" value="${edDrawColor}">
        <span class="op-sep"></span>
        <span style="font-size:.7rem;font-weight:900;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em">Grosor</span>
        <input type="range" id="op-dsize" min="1" max="48" value="${edDrawSize}" style="width:90px;accent-color:var(--black)">
        <span id="op-dsizeval" style="font-size:.75rem;font-weight:900;color:var(--gray-600);min-width:26px">${edDrawSize}px</span>
        <button id="op-draw-ok" style="margin-left:auto;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 10px;font-weight:900;font-size:.8rem;cursor:pointer;flex-shrink:0">✓</button>
      </div>`;
    panel.classList.add('open');
    $('op-dcolor')?.addEventListener('input',e=>edDrawColor=e.target.value);
    $('op-dsize')?.addEventListener('input',e=>{edDrawSize=+e.target.value;const v=$('op-dsizeval');if(v)v.textContent=e.target.value+'px';});
    $('op-draw-ok')?.addEventListener('click',()=>{ edCloseOptionsPanel(); });
    requestAnimationFrame(edFitCanvas);return;
  }

  if(mode==='eraser'){
    panel.innerHTML=`
      <div class="op-row" style="align-items:center">
        <span style="font-size:.7rem;font-weight:900;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em">Tamaño</span>
        <input type="range" id="op-esize" min="4" max="80" value="${edEraserSize}" style="width:110px;accent-color:var(--black)">
        <span id="op-esizeval" style="font-size:.75rem;font-weight:900;color:var(--gray-600);min-width:26px">${edEraserSize}px</span>
        <button id="op-eraser-ok" style="margin-left:auto;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 10px;font-weight:900;font-size:.8rem;cursor:pointer;flex-shrink:0">✓</button>
      </div>`;
    panel.classList.add('open');
    $('op-esize')?.addEventListener('input',e=>{edEraserSize=+e.target.value;const v=$('op-esizeval');if(v)v.textContent=e.target.value+'px';});
    $('op-eraser-ok')?.addEventListener('click',()=>{ edCloseOptionsPanel(); });
    requestAnimationFrame(edFitCanvas);return;
  }

  if(mode==='props'){
    if(edSelectedIdx<0||edSelectedIdx>=edLayers.length){
      panel.classList.remove('open');panel.innerHTML='';requestAnimationFrame(edFitCanvas);return;
    }
    const la=edLayers[edSelectedIdx];
    let html='';

    if(la.type==='text'||la.type==='bubble'){
      html+=`
      <div class="op-prop-row"><span class="op-prop-label">Texto</span>
        <textarea id="pp-text" style="border-radius:8px;resize:vertical;min-height:40px;flex:1;border:2px solid var(--gray-300);padding:4px 8px;font-family:var(--font-body);font-size:.84rem;">${la.text.replace(/</g,'&lt;')}</textarea></div>
      <div class="op-prop-row"><span class="op-prop-label">Fuente</span>
        <select id="pp-font">
          <option value="Arial" ${la.fontFamily==='Arial'?'selected':''}>Arial</option>
          <option value="Bangers" ${la.fontFamily==='Bangers'?'selected':''}>Bangers</option>
          <option value="Comic Sans MS, cursive" ${la.fontFamily==='Comic Sans MS, cursive'?'selected':''}>Comic Sans</option>
          <option value="Verdana" ${la.fontFamily==='Verdana'?'selected':''}>Verdana</option>
        </select>
        <span class="op-prop-label" style="min-width:auto;margin-left:8px">Tamaño</span>
        <input type="number" id="pp-fs" value="${la.fontSize}" min="8" max="120">
        <input type="color" id="pp-color" value="${la.color}">
        <input type="color" id="pp-bg" value="${la.backgroundColor.startsWith('#')?la.backgroundColor:'#ffffff'}">
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Marco</span>
        <select id="pp-bw">
          ${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${la.borderWidth===n?'selected':''}>${n===0?'Sin borde':n+'px'}</option>`).join('')}
        </select>
        <input type="color" id="pp-bc" value="${la.borderColor}">
        <span class="op-prop-label" style="min-width:auto;margin-left:8px">Rot.</span>
        <input type="number" id="pp-rot" value="${la.rotation}" min="-180" max="180">°
      </div>`;
      if(la.type==='bubble'){
        html+=`
        <div class="op-prop-row"><span class="op-prop-label">Estilo</span>
          <select id="pp-style">
            <option value="conventional" ${la.style==='conventional'?'selected':''}>Convencional</option>
            <option value="lowvoice" ${la.style==='lowvoice'?'selected':''}>Voz baja</option>
            <option value="multiple" ${la.style==='multiple'?'selected':''}>Varias voces</option>
            <option value="thought" ${la.style==='thought'?'selected':''}>Pensamiento</option>
            <option value="radio" ${la.style==='radio'?'selected':''}>Radio/Tele</option>
            <option value="explosion" ${la.style==='explosion'?'selected':''}>Explosión</option>
          </select>
          <span id="pp-mcwrap" ${la.style!=='multiple'?'style="display:none"':''}>
            <span class="op-prop-label" style="min-width:auto">Voces</span>
            <input type="number" id="pp-mc" value="${la.multipleCount||3}" min="1" max="5">
          </span>
          <label style="display:flex;align-items:center;gap:4px;font-size:.75rem;font-weight:700">
            <input type="checkbox" id="pp-tail" ${la.tail?'checked':''}> Cola
          </label>
        </div>`;
      }
    } else if(la.type==='image'){
      html+=`
      <div class="op-prop-row"><span class="op-prop-label">Rotación</span>
        <input type="number" id="pp-rot" value="${la.rotation}" min="-180" max="180"> °
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Opacidad</span>
        <input type="range" id="pp-opacity" min="0" max="100" value="${Math.round((la.opacity??1)*100)}" style="flex:1;accent-color:var(--black)">
        <span id="pp-opacity-val" style="font-size:.75rem;font-weight:900;min-width:32px;text-align:right">${Math.round((la.opacity??1)*100)}%</span>
      </div>`;
    }
    html+=`<div class="op-row" style="margin-top:2px;justify-content:space-between">
      <button class="op-btn danger" id="pp-del"><span style="color:#e63030;font-weight:900">✕</span> Eliminar objeto</button>
      <button id="pp-ok" style="background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 12px;font-weight:900;font-size:.82rem;cursor:pointer">✓ OK</button>
    </div>`;

    panel.innerHTML=html;
    panel.classList.add('open');

    // Estilo → mostrar/ocultar voces
    $('pp-style')?.addEventListener('change',e=>{
      const w=$('pp-mcwrap');if(w)w.style.display=e.target.value==='multiple'?'':'none';
    });
    // Live update
    panel.querySelectorAll('input,select,textarea').forEach(inp=>{
      inp.addEventListener('input',e=>{
        if(edSelectedIdx<0)return;
        const la=edLayers[edSelectedIdx],id=e.target.id;
        if(id==='pp-text'){
          // Borrar placeholder al empezar a escribir
          if(la.text==='Escribe aquí' && e.target.value.length > 'Escribe aquí'.length){
            la.text = e.target.value.replace('Escribe aquí','');
            e.target.value = la.text;
          } else {
            la.text=e.target.value;
          }
          la.resizeToFitText(edCanvas);
        }
        else if(id==='pp-font'){la.fontFamily=e.target.value;la.resizeToFitText(edCanvas);}
        else if(id==='pp-fs'){la.fontSize=parseInt(e.target.value)||12;la.resizeToFitText(edCanvas);}
        else if(id==='pp-color')  la.color=e.target.value;
        else if(id==='pp-bg')     la.backgroundColor=e.target.value;
        else if(id==='pp-bc')     la.borderColor=e.target.value;
        else if(id==='pp-bw')     la.borderWidth=parseInt(e.target.value);
        else if(id==='pp-style')  {la.style=e.target.value;la.resizeToFitText(edCanvas);}
        else if(id==='pp-mc')     la.multipleCount=parseInt(e.target.value)||3;
        else if(id==='pp-tail')   la.tail=e.target.checked;
        else if(id==='pp-rot')    la.rotation=parseInt(e.target.value)||0;
        edRedraw();
      });
    });
    $('pp-del')?.addEventListener('click',edDeleteSelected);
    $('pp-ok')?.addEventListener('click',()=>{ edCloseOptionsPanel(); });
    $('pp-opacity')?.addEventListener('input',e=>{
      la.opacity = e.target.value/100;
      const v=$('pp-opacity-val'); if(v) v.textContent=e.target.value+'%';
      edRedraw();
    });
    // Si el texto es placeholder, seleccionar todo para sobreescribir directamente
    const ppText = $('pp-text');
    if(ppText && (edLayers[edSelectedIdx]?.text === 'Escribe aquí')){
      requestAnimationFrame(()=>{ ppText.select(); });
    }
    requestAnimationFrame(edFitCanvas);return;
  }

  panel.classList.remove('open');panel.innerHTML='';requestAnimationFrame(edFitCanvas);
}

/* ══════════════════════════════════════════
   MINIMIZAR / BOTÓN FLOTANTE
   ══════════════════════════════════════════ */
function edMinimize(){
  edMinimized=true;
  const menu=$('edMenuBar'),top=$('edTopbar');
  if(menu)menu.style.display='none';
  if(top)top.style.display='none';
  const btn=$('edFloatBtn');
  if(btn){
    btn.classList.add('visible');
    btn.style.left=edFloatX+'px';
    btn.style.top=edFloatY+'px';
  }
  edFitCanvas();
}
function edMaximize(){
  edMinimized=false;
  const menu=$('edMenuBar'),top=$('edTopbar');
  if(menu)menu.style.display='';
  if(top)top.style.display='';
  $('edFloatBtn')?.classList.remove('visible');
  edFitCanvas();
}
function edInitFloatDrag(){
  const btn=$('edFloatBtn');if(!btn)return;
  let dragging=false,startX=0,startY=0,startLeft=0,startTop=0;
  function onDown(e){
    dragging=true;
    const src=e.touches?e.touches[0]:e;
    startX=src.clientX;startY=src.clientY;
    startLeft=parseInt(btn.style.left)||edFloatX;
    startTop=parseInt(btn.style.top)||edFloatY;
    e.preventDefault();
  }
  function onMove(e){
    if(!dragging)return;
    const src=e.touches?e.touches[0]:e;
    const dx=src.clientX-startX,dy=src.clientY-startY;
    edFloatX=Math.max(0,Math.min(window.innerWidth-48,startLeft+dx));
    edFloatY=Math.max(0,Math.min(window.innerHeight-48,startTop+dy));
    btn.style.left=edFloatX+'px';btn.style.top=edFloatY+'px';
    e.preventDefault();
  }
  function onUp(e){
    if(!dragging)return;
    dragging=false;
    // Si apenas se movió, es un click
    const src=e.changedTouches?e.changedTouches[0]:e;
    if(Math.hypot(src.clientX-startX,src.clientY-startY)<8)edMaximize();
  }
  btn.addEventListener('pointerdown',onDown,{passive:false});
  window.addEventListener('pointermove',onMove,{passive:false});
  window.addEventListener('pointerup',onUp);
  btn.addEventListener('touchstart',onDown,{passive:false});
  window.addEventListener('touchmove',onMove,{passive:false});
  window.addEventListener('touchend',onUp);
}

/* ══════════════════════════════════════════
   GUARDAR / CARGAR
   ══════════════════════════════════════════ */
function edSaveProject(){
  if(!edProjectId){edToast('Sin proyecto activo');return;}
  const existing=ComicStore.getById(edProjectId)||{};
  const panels=edPages.map((p,i)=>({
    id:'panel_'+i,
    dataUrl:p.drawData||edRenderPage(p),
    orientation:edOrientation,
  }));
  ComicStore.save({
    ...existing,
    id:edProjectId,
    ...edProjectMeta,
    panels,
    editorData:{
      orientation:edOrientation,
      pages:edPages.map(p=>({drawData:p.drawData,layers:p.layers.map(edSerLayer),textLayerOpacity:p.textLayerOpacity??1,textMode:p.textMode||'immediate'})),
    },
    updatedAt:new Date().toISOString(),
  });
  edToast('Guardado ✓');
}
function edRenderPage(page){
  const tmp=document.createElement('canvas');tmp.width=edCanvas.width;tmp.height=edCanvas.height;
  const ctx=tmp.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,tmp.width,tmp.height);
  page.layers.filter(l=>l.type==='image').forEach(l=>l.draw(ctx,tmp));
  page.layers.filter(l=>l.type!=='image').forEach(l=>l.draw(ctx,tmp));
  return tmp.toDataURL('image/jpeg',0.85);
}
function _edCompressImageSrc(src, maxPx=1080, quality=0.82){
  // Redimensiona y comprime una imagen a JPEG para ahorrar espacio en localStorage
  if(!src || src.startsWith('data:image/jpeg') && src.length < 200000) return src; // ya pequeña
  try {
    const img = new Image();
    img.src = src;
    if(!img.complete || img.naturalWidth === 0) return src; // no cargada aún
    const ratio = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth  * ratio);
    const h = Math.round(img.naturalHeight * ratio);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', quality);
  } catch(e) { return src; }
}

function edSerLayer(l){
  const op = l.opacity !== undefined ? {opacity:l.opacity} : {};
  if(l.type==='image'){
    const compressedSrc = _edCompressImageSrc(l.src || (l.img ? l.img.src : ''));
    return{type:'image',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,src:compressedSrc,...op};
  }
  if(l.type==='text')return{type:'text',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,...op};
  if(l.type==='bubble')return{type:'bubble',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,
    tail:l.tail,style:l.style,tailStart:{...l.tailStart},tailEnd:{...l.tailEnd},multipleCount:l.multipleCount,...op};
}
function edDeserLayer(d){
  if(d.type==='text'){const l=new TextLayer(d.text,d.x,d.y);Object.assign(l,d);return l;}
  if(d.type==='bubble'){const l=new BubbleLayer(d.text,d.x,d.y);Object.assign(l,d);
    if(d.tailStart)l.tailStart={...d.tailStart};if(d.tailEnd)l.tailEnd={...d.tailEnd};return l;}
  if(d.type==='image'){
    const l=new ImageLayer(null,d.x,d.y,d.width);
    l.height=d.height; l.rotation=d.rotation||0; l.src=d.src||'';
    if(d.opacity!==undefined) l.opacity=d.opacity;
    if(d.src){
      const img=new Image();
      img.onload=()=>{ l.img=img; l.src=img.src; edRedraw(); };
      img.onerror=()=>{ console.warn('edDeserLayer: failed to load image'); };
      img.src=d.src;
    }
    return l;
  }
  return null;
}
function edLoadProject(id){
  const comic=ComicStore.getById(id);if(!comic)return;
  edProjectId=id;
  edProjectMeta={title:comic.title||'',author:comic.author||comic.username||'',genre:comic.genre||'',navMode:comic.navMode||'horizontal'};
  const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title||'Sin título';
  if(comic.editorData){
    edOrientation=comic.editorData.orientation||'vertical';
    edPages=(comic.editorData.pages||[]).map(pd=>({
      drawData:pd.drawData||null,
      layers:(pd.layers||[]).map(edDeserLayer).filter(Boolean),
      textLayerOpacity:pd.textLayerOpacity??1,
      textMode:pd.textMode||'immediate',
    }));
  }else{
    edOrientation='vertical';edPages=[{layers:[],drawData:null,textLayerOpacity:1,textMode:'immediate'}];
  }
  if(!edPages.length)edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'immediate'});
  edCurrentPage=0;edLayers=edPages[0].layers;
  // Actualizar nav de páginas en topbar (si ya existe el DOM)
  requestAnimationFrame(()=>edUpdateNavPages());
}

/* ══════════════════════════════════════════
   VISOR
   ══════════════════════════════════════════ */
let edViewerIdx=0;
function edUpdateCanvasFullscreen(){ edFitCanvas(); }

function edOpenViewer(){
  edHideGearIcon();  // ocultar gear al abrir visor
  edViewerIdx=edCurrentPage;
  edViewerTextStep=0;
  $('editorViewer')?.classList.add('open');
  edUpdateViewerSize();
  edUpdateViewer();
  edInitViewerTap();
  // Teclado PC
  if(_viewerKeyHandler) document.removeEventListener('keydown', _viewerKeyHandler);
  _viewerKeyHandler = _edViewerKey;
  document.addEventListener('keydown', _viewerKeyHandler);
}
function edUpdateViewerSize(){
  if(!edViewerCanvas) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  // Dimensiones internas del canvas (resolución de dibujo)
  edViewerCanvas.width  = edCanvas.width;
  edViewerCanvas.height = edCanvas.height;
  // Escala: llenar el viewport manteniendo proporción (contain, no cover)
  const scale = Math.min(vw / edCanvas.width, vh / edCanvas.height);
  const displayW = Math.round(edCanvas.width  * scale);
  const displayH = Math.round(edCanvas.height * scale);
  edViewerCanvas.style.width  = displayW + 'px';
  edViewerCanvas.style.height = displayH + 'px';
  // Centrar en el viewer
  edViewerCanvas.style.position = 'absolute';
  edViewerCanvas.style.left = Math.round((vw - displayW) / 2) + 'px';
  edViewerCanvas.style.top  = Math.round((vh - displayH) / 2) + 'px';
}

// Teclado en visor (PC)
let _viewerKeyHandler = null;
function _edViewerKey(e){
  const v = $('editorViewer');
  if(!v || !v.classList.contains('open')) return;
  if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){
    e.preventDefault();
    const page=edPages[edViewerIdx];
    const tl=page?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
    if(page?.textMode==='sequential' && edViewerTextStep < tl.length){
      edViewerTextStep++; edUpdateViewer();
    } else if(edViewerIdx < edPages.length-1){
      edViewerIdx++; edViewerTextStep=0; edUpdateViewer();
    }
  } else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
    e.preventDefault();
    const page=edPages[edViewerIdx];
    if(page?.textMode==='sequential' && edViewerTextStep > 0){
      edViewerTextStep--; edUpdateViewer();
    } else if(edViewerIdx > 0){
      edViewerIdx--;
      const pp=edPages[edViewerIdx];
      const ptl=pp?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
      edViewerTextStep = pp?.textMode==='sequential' ? ptl.length : 0;
      edUpdateViewer();
    }
  } else if(e.key === 'Escape'){
    e.preventDefault();
    edCloseViewer();
  }
}

// Tap en el visor → mostrar/ocultar controles
let _viewerTapBound = false, _viewerHideTimer;
function edShowViewerCtrls(){
  const ctrls = $('viewerControls');
  if(!ctrls) return;
  ctrls.classList.remove('hidden');
  clearTimeout(_viewerHideTimer);
  _viewerHideTimer = setTimeout(()=>ctrls.classList.add('hidden'), 3500);
}
function edInitViewerTap(){
  const viewer = $('editorViewer');
  if(!viewer) return;
  edShowViewerCtrls();
  if(!_viewerTapBound){
    _viewerTapBound = true;
    viewer.addEventListener('pointerup', e=>{
      if(!e.target.closest('.viewer-controls')) edShowViewerCtrls();
    });
  }
}
function edCloseViewer(){
  $('editorViewer')?.classList.remove('open');
  // Restaurar gear si hay objeto seleccionado
  if(edSelectedIdx >= 0){
    clearTimeout(window._edGearDelay);
    window._edGearDelay = setTimeout(() => {
      if(edSelectedIdx >= 0) edShowGearIcon(edSelectedIdx);
    }, 200);
  }
  if(_viewerKeyHandler){
    document.removeEventListener('keydown', _viewerKeyHandler);
    _viewerKeyHandler = null;
  }
}
function edUpdateViewer(){
  const page=edPages[edViewerIdx];if(!page||!edViewerCanvas)return;
  const ctx=edViewerCtx;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,edViewerCanvas.width,edViewerCanvas.height);

  // Imágenes siempre
  page.layers.filter(l=>l.type==='image').forEach(l=>l.draw(ctx,edViewerCanvas));

  // Dibujo libre
  if(page.drawData){
    const img=new Image();
    img.onload=()=>{
      ctx.drawImage(img,0,0);
      _edViewerDrawTexts(page, ctx);
    };
    img.src=page.drawData;
  } else {
    _edViewerDrawTexts(page, ctx);
  }

  // Contador
  const textLayers = page.layers.filter(l=>l.type==='text'||l.type==='bubble');
  const isSeq = page.textMode === 'sequential';
  const cnt=$('viewerCounter');
  if(cnt){
    if(isSeq && textLayers.length > 0){
      cnt.textContent=`${edViewerIdx+1}/${edPages.length} · 💬${edViewerTextStep}/${textLayers.length}`;
    } else {
      cnt.textContent=`${edViewerIdx+1} / ${edPages.length}`;
    }
  }
}

function _edViewerDrawTexts(page, ctx){
  const textLayers = page.layers.filter(l=>l.type==='text'||l.type==='bubble');
  const isSeq = page.textMode === 'sequential';
  const toShow = isSeq ? textLayers.slice(0, edViewerTextStep) : textLayers;
  toShow.forEach(l=>l.draw(ctx, edViewerCanvas));
}

/* ══════════════════════════════════════════
   MODAL DATOS PROYECTO
   ══════════════════════════════════════════ */
function edOpenProjectModal(){
  $('edMTitle').value=edProjectMeta.title;
  $('edMAuthor').value=edProjectMeta.author;
  $('edMGenre').value=edProjectMeta.genre;
  $('edMNavMode').value=edProjectMeta.navMode;
  $('edProjectModal')?.classList.add('open');
}
function edCloseProjectModal(){$('edProjectModal')?.classList.remove('open');}
function edSaveProjectModal(){
  edProjectMeta.title  =$('edMTitle').value.trim()||edProjectMeta.title;
  edProjectMeta.author =$('edMAuthor').value.trim();
  edProjectMeta.genre  =$('edMGenre').value.trim();
  edProjectMeta.navMode=$('edMNavMode').value;
  const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title||'Sin título';
  edCloseProjectModal();edSaveProject();
}

/* ══════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════ */
function edToast(msg,ms=2000){
  const t=$('edToast');if(!t)return;
  t.classList.remove('show');          // forzar reset antes de reanimar
  t.textContent=msg;
  // Pequeño frame para que el remove surta efecto antes del add
  requestAnimationFrame(()=>{
    t.classList.add('show');
    clearTimeout(t._t);
    t._t=setTimeout(()=>t.classList.remove('show'),ms);
  });
}

/* ══════════════════════════════════════════
   INIT
   ══════════════════════════════════════════ */
function EditorView_init(){
  // Limpiar estado de sesión anterior
  edHideGearIcon();
  const staleToast = $('edToast');
  if(staleToast){ staleToast.classList.remove('show'); clearTimeout(staleToast._t); }
  // Ocultar también el toast global (ej: "Bienvenido/a" del login)
  const globalToast = document.getElementById('toast');
  if(globalToast){ globalToast.classList.remove('show'); clearTimeout(globalToast._tid); }
  edCanvas=$('editorCanvas');
  // Habilitar botón Capas
  document.querySelector('[data-menu="layers"]')?.removeAttribute('disabled');
  document.querySelector('[data-menu="layers"]')?.style.removeProperty('opacity');
  document.querySelector('[data-menu="layers"]')?.style.removeProperty('cursor');
  edViewerCanvas=$('viewerCanvas');
  if(!edCanvas)return;
  edCtx=edCanvas.getContext('2d');
  if(edViewerCanvas)edViewerCtx=edViewerCanvas.getContext('2d');

  const editId=sessionStorage.getItem('cx_edit_id');
  if(!editId){Router.go('my-comics');return;}
  edLoadProject(editId);
  sessionStorage.removeItem('cx_edit_id');

  edSetOrientation(edOrientation);
  edActiveTool='select';
  const cur=$('edBrushCursor');if(cur)cur.style.display='none';

  // ── CANVAS ──
  // Todos los eventos en document para capturar objetos fuera del canvas
  document.addEventListener('pointerdown', edOnStart, {passive:false});
  document.addEventListener('pointermove', edOnMove,  {passive:false});
  document.addEventListener('pointerup',   edOnEnd);
  document.addEventListener('touchstart',  edOnStart, {passive:false});
  document.addEventListener('touchmove',   edOnMove,  {passive:false});
  document.addEventListener('touchend',    edOnEnd);

  // ── TOPBAR ──
  $('edBackBtn')?.addEventListener('click',()=>{edSaveProject();Router.go('my-comics');});
  $('edPagePrev')?.addEventListener('click',()=>{ if(edCurrentPage>0) edLoadPage(edCurrentPage-1); });
  $('edPageNext')?.addEventListener('click',()=>{ if(edCurrentPage<edPages.length-1) edLoadPage(edCurrentPage+1); });
  $('edSaveBtn')?.addEventListener('click',edSaveProject);
  $('edPreviewBtn')?.addEventListener('click',edOpenViewer);

  // ── MENÚ: botones dropdown (excluir layers y nav que tienen overlays propios) ──
  document.querySelectorAll('[data-menu]').forEach(btn=>{
    const id = btn.dataset.menu;
    if(id === 'layers' || id === 'nav') return; // tienen su propio handler
    btn.addEventListener('pointerup',e=>{e.stopPropagation();edToggleMenu(id);});
  });

  // ── INSERTAR ──
  $('dd-gallery')?.addEventListener('click',()=>{$('edFileGallery').click();edCloseMenus();});
  $('dd-camera')?.addEventListener('click', ()=>{$('edFileCapture').click();edCloseMenus();});
  $('dd-textbox')?.addEventListener('click',()=>{edAddText();edCloseMenus();});
  $('dd-bubble')?.addEventListener('click', ()=>{edAddBubble();edCloseMenus();});
  $('edFileGallery')?.addEventListener('change',e=>{edAddImage(e.target.files[0]);e.target.value='';});
  $('edFileCapture')?.addEventListener('change',e=>{edAddImage(e.target.files[0]);e.target.value='';});

  // ── DIBUJAR ──
  $('dd-pen')?.addEventListener('click',()=>{
    edActiveTool='draw';
    edCanvas.className='tool-draw';
    if($('edBrushCursor'))$('edBrushCursor').style.display='block';
    edRenderOptionsPanel('draw');edCloseMenus();
  });
  $('dd-eraser')?.addEventListener('click',()=>{
    edActiveTool='eraser';
    edCanvas.className='tool-eraser';
    if($('edBrushCursor'))$('edBrushCursor').style.display='block';
    edRenderOptionsPanel('eraser');edCloseMenus();
  });
  $('dd-savedraw')?.addEventListener('click',()=>{
    edDeactivateDrawTool();
    edSaveDrawData();
    edToast('Dibujo guardado ✓');
    edCloseMenus();
  });
  $('dd-cleardraw')?.addEventListener('click',()=>{edClearDraw();edCloseMenus();});

  // ── NAVEGAR (Hoja → abre overlay) ──
  // El botón Hoja ▾ del menú abre el overlay de hojas
  const _navBtn = document.querySelector('[data-menu="nav"]');
  if(_navBtn){
    _navBtn.addEventListener('pointerup', e => {
      e.stopPropagation();
      edCloseMenus();
      edOpenPages();
    });
  }
  // Bindings del dropdown pequeño (ya no se usa, pero por si acaso)
  $('dd-addpage')?.addEventListener('click',()=>{edAddPage();edCloseMenus();});
  $('dd-delpage')?.addEventListener('click',()=>{edDeletePage();edCloseMenus();});
  $('dd-orientv')?.addEventListener('click',()=>{edSetOrientation('vertical');edCloseMenus();});
  $('dd-orienth')?.addEventListener('click',()=>{edSetOrientation('horizontal');edCloseMenus();});

  // ── PROYECTO ──
  $('dd-editproject')?.addEventListener('click',()=>{edOpenProjectModal();edCloseMenus();});
  $('dd-viewerjson')?.addEventListener('click',()=>{edOpenViewer();edCloseMenus();});
  $('dd-savejson')?.addEventListener('click',()=>{edDownloadJSON();edCloseMenus();});
  $('dd-loadjson')?.addEventListener('click',()=>{$('edLoadFile').click();edCloseMenus();});
  $('edLoadFile')?.addEventListener('change',e=>{edLoadFromJSON(e.target.files[0]);e.target.value='';});

  // ── CAPAS ──
  const _layersBtn = document.querySelector('[data-menu="layers"]');
  if(_layersBtn){
    _layersBtn.addEventListener('pointerup', e => {
      e.stopPropagation();
      edCloseMenus();
      edOpenLayers();
    });
  }

  // ── MINIMIZAR ──
  $('edUndoBtn')?.addEventListener('click', edUndo);
  $('edRedoBtn')?.addEventListener('click', edRedo);
  $('edMinimizeBtn')?.addEventListener('click',edMinimize);
  edPushHistory();
  edInitFloatDrag();

  // ── VISOR ──
  $('viewerClose')?.addEventListener('pointerup', e=>{ e.stopPropagation(); edCloseViewer(); });
  $('viewerPrev')?.addEventListener('pointerup', e=>{
    e.stopPropagation();
    edShowViewerCtrls();
    const page=edPages[edViewerIdx];
    if(page?.textMode==='sequential' && edViewerTextStep > 0){
      edViewerTextStep--; edUpdateViewer(); return;
    }
    if(edViewerIdx>0){
      edViewerIdx--;
      const prevPage=edPages[edViewerIdx];
      const prevTexts=prevPage?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
      edViewerTextStep = prevPage?.textMode==='sequential' ? prevTexts.length : 0;
      edUpdateViewer();
    }
  });
  $('viewerNext')?.addEventListener('pointerup', e=>{
    e.stopPropagation();
    edShowViewerCtrls();
    const page=edPages[edViewerIdx];
    const textLayers=page?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
    if(page?.textMode==='sequential' && edViewerTextStep < textLayers.length){
      edViewerTextStep++; edUpdateViewer(); return;
    }
    if(edViewerIdx<edPages.length-1){
      edViewerIdx++; edViewerTextStep=0; edUpdateViewer();
    }
  });

  // ── MODAL PROYECTO ──
  $('edMCancel')?.addEventListener('click',edCloseProjectModal);
  $('edMSave')?.addEventListener('click',edSaveProjectModal);

  // ── Ctrl+Wheel: zoom del canvas ──
  window.addEventListener('wheel', e => {
    if(!document.getElementById('editorShell')) return;
    if(!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    edZoom = Math.min(Math.max(edZoom + delta, 0.25), 3.0);
    edFitCanvas();
  }, {passive: false});

  // ── Teclado: Ctrl+Z / Ctrl+Y / Delete ──
  document.addEventListener('keydown', function _edKeyUndo(e){
    if(!document.getElementById('editorShell')) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const ctrl = e.ctrlKey || e.metaKey;
    // Delete / Backspace → eliminar objeto seleccionado
    if((e.key === 'Delete' || e.key === 'Backspace') && !ctrl){
      if(edSelectedIdx >= 0){ e.preventDefault(); edDeleteSelected(); }
      return;
    }
    if(!ctrl) return;
    if(!e.shiftKey && e.key.toLowerCase() === 'z'){ e.preventDefault(); edUndo(); }
    else if(e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')){ e.preventDefault(); edRedo(); }
  });

  // ── RESIZE ──
  window.addEventListener('resize',()=>{edFitCanvas();edUpdateCanvasFullscreen();});

  // Fit canvas con reintentos hasta que las medidas sean reales
  // (el CSS se carga dinámicamente y las fuentes tardan en aplicar)
  function _edInitFit(attemptsLeft) {
    const topbar = $('edTopbar');
    const menu   = $('edMenuBar');
    const topH   = topbar ? topbar.getBoundingClientRect().height : 0;
    const menuH  = menu   ? menu.getBoundingClientRect().height   : 0;
    // Si ambas barras tienen altura real, ya está listo
    if (topH > 10 && menuH > 10) {
      edFitCanvas(); edRedraw(); return;
    }
    if (attemptsLeft <= 0) {
      edFitCanvas(); edRedraw(); return; // último recurso
    }
    requestAnimationFrame(() => _edInitFit(attemptsLeft - 1));
  }
  // Primer intento tras doble rAF; si falla reintenta hasta 30 frames (~500ms)
  requestAnimationFrame(() => requestAnimationFrame(() => _edInitFit(30)));

  // Cerrar herramienta de dibujo al tocar fuera del canvas
  // (el cierre de menús lo gestiona edOnStart)
  document.addEventListener('pointerdown', e => {
    if(['draw','eraser'].includes(edActiveTool)){
      if(!e.target.closest('#editorCanvas') && !e.target.closest('#edOptionsPanel')){
        edDeactivateDrawTool();
      }
    }
  });


  // ── FULLSCREEN CANVAS ON ORIENTATION MATCH ──
  edUpdateCanvasFullscreen();
  window.addEventListener('orientationchange', ()=>{
    setTimeout(()=>{edFitCanvas();edUpdateCanvasFullscreen();}, 200);
  });

  // ── Pinch en cualquier zona (fuera del canvas) = zoom ──
  let _shellPinch0 = 0, _shellZoom0 = 1;
  const editorShell = document.getElementById('editorShell');
  if(editorShell){
    editorShell.addEventListener('touchstart', e => {
      if(e.touches.length === 2 && e.target !== edCanvas){
        _shellPinch0 = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        _shellZoom0 = edZoom;
      }
    }, {passive:true});
    editorShell.addEventListener('touchmove', e => {
      if(e.touches.length === 2 && e.target !== edCanvas && _shellPinch0 > 0){
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        edZoom = Math.min(Math.max(_shellZoom0 * (dist / _shellPinch0), 0.25), 3.0);
        edFitCanvas();
      }
    }, {passive:true});
    editorShell.addEventListener('touchend', ()=>{ _shellPinch0 = 0; }, {passive:true});
  }

  // Seguro extra: si después de 600ms el canvas sigue muy pequeño, refitear
  setTimeout(() => {
    if (edCanvas && parseInt(edCanvas.style.height || '0') < 50) {
      edFitCanvas(); edRedraw();
    }
  }, 600);
}

/* ── DESCARGAR / CARGAR JSON ── */
function edDownloadJSON(){
  edSaveProject();
  const data=localStorage.getItem('cs_comics');
  const comic=ComicStore.getById(edProjectId);if(!comic)return;
  const blob=new Blob([JSON.stringify(comic,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(edProjectMeta.title||'proyecto').replace(/\s+/g,'_')+'.json';
  a.click();
}
function edLoadFromJSON(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.editorData){
        edProjectMeta={title:data.title||'',author:data.author||'',genre:data.genre||'',navMode:data.navMode||'horizontal'};
        edOrientation=data.editorData.orientation||'vertical';
        edPages=(data.editorData.pages||[]).map(pd=>({
          drawData:pd.drawData||null,
          layers:(pd.layers||[]).map(edDeserLayer).filter(Boolean),
        }));
        if(!edPages.length)edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'immediate'});
        edCurrentPage=0;edLayers=edPages[0].layers;
        edSetOrientation(edOrientation);
        const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title;
        edToast('Proyecto cargado ✓');
      }
    }catch(err){edToast('Error al cargar el archivo');}
  };
  reader.readAsText(file);
}
