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
let edHistory = [], edHistoryIdx = -1;
const ED_MAX_HISTORY = 10;

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
  edLayers.filter(l=>l.type==='image').forEach(l=>l.draw(edCtx,edCanvas));
  if(page.drawData){
    const img=new Image();
    img.onload=()=>{
      edCtx.drawImage(img,0,0);
      edLayers.filter(l=>l.type!=='image').forEach(l=>l.draw(edCtx,edCanvas));
      edDrawSel();
    };
    img.src=page.drawData;return;
  }
  edLayers.filter(l=>l.type!=='image').forEach(l=>l.draw(edCtx,edCanvas));
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
  edPages.push({layers:[],drawData:null});
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
      edLayers.push(layer);edSelectedIdx=edLayers.length-1;
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
  const px=Math.min(Math.max((src.clientX-rect.left)*sx,0),edCanvas.width);
  const py=Math.min(Math.max((src.clientY-rect.top)*sy,0),edCanvas.height);
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
   MENÚ CONTEXTUAL (mini, 3 segundos)
   ══════════════════════════════════════════ */
let _edCtxTimer = null;

function edShowContextMenu(layerIdx){
  edHideContextMenu(); // limpiar el anterior si existe

  if(layerIdx < 0 || layerIdx >= edLayers.length) return;
  const la = edLayers[layerIdx];

  // Calcular posición en pantalla a partir del canvas
  const canvasRect = edCanvas.getBoundingClientRect();
  const scaleX = canvasRect.width  / edCanvas.width;
  const scaleY = canvasRect.height / edCanvas.height;

  // Esquina superior derecha del objeto en viewport
  const objRight  = canvasRect.left + (la.x + la.width/2)  * edCanvas.width  * scaleX;
  const objTop    = canvasRect.top  + (la.y - la.height/2) * edCanvas.height * scaleY;

  const menu = document.createElement('div');
  menu.id = 'edCtxMenu';
  menu.innerHTML = '⚙';
  menu.title = 'Opciones del objeto';

  // Posicionar justo a la derecha-arriba del objeto
  // Usamos position:fixed para no depender del layout del canvas
  const SIZE = 36;
  const GAP  = 6;
  let left = objRight + GAP;
  let top  = objTop - GAP;

  // Si se sale por la derecha, ponerlo a la izquierda
  if(left + SIZE > window.innerWidth - 4) left = objRight - la.width * edCanvas.width * scaleX - SIZE - GAP;
  // No salir por arriba
  if(top < 4) top = 4;

  menu.style.cssText = [
    'position:fixed',
    'z-index:500',
    `left:${Math.round(left)}px`,
    `top:${Math.round(top)}px`,
    `width:${SIZE}px`,
    `height:${SIZE}px`,
    'border-radius:50%',
    'background:#fff',
    'border:2px solid #ff6600',
    'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-size:17px',
    'cursor:pointer',
    'opacity:0',
    'transition:opacity 0.15s',
    'pointer-events:all',
    'user-select:none',
    '-webkit-user-select:none',
  ].join(';');

  menu.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
  menu.addEventListener('click', e => {
    e.stopPropagation();
    edHideContextMenu();
    edPanelUserClosed = false;
    edRenderOptionsPanel('props');
  });

  document.body.appendChild(menu);

  // Fade in
  requestAnimationFrame(() => { menu.style.opacity = '1'; });

  // Auto-ocultar tras 3 segundos
  _edCtxTimer = setTimeout(edHideContextMenu, 3000);
}

function edHideContextMenu(){
  if(_edCtxTimer){ clearTimeout(_edCtxTimer); _edCtxTimer = null; }
  const m = document.getElementById('edCtxMenu');
  if(m) m.remove();
}

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
        edInitialSize={width:la.width,height:la.height,x:la.x,y:la.y};return;
      }
    }
  }
  // Seleccionar
  let found=-1;
  for(let i=edLayers.length-1;i>=0;i--){if(edLayers[i].contains(c.nx,c.ny)){found=i;break;}}
  if(found>=0){
    const prevIdx = edSelectedIdx;
    edSelectedIdx = found;
    edDragOffX = c.nx - edLayers[found].x;
    edDragOffY = c.ny - edLayers[found].y;
    edIsDragging = true;
    // Mostrar mini menú contextual con ⚙ durante 3 segundos
    edShowContextMenu(found);
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
  if(edIsTailDragging&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const dx=c.nx-la.x,dy=c.ny-la.y;
    if(edTailPointType==='start'){la.tailStart.x=dx/la.width;la.tailStart.y=dy/la.height;}
    else{la.tailEnd.x=dx/la.width;la.tailEnd.y=dy/la.height;}
    edRedraw();return;
  }
  if(edIsResizing&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx],asp=edInitialSize.height/edInitialSize.width;
    const dx=c.nx-edInitialSize.x;
    let nw=edResizeCorner==='tl'||edResizeCorner==='bl'?edInitialSize.width-dx:edInitialSize.width+dx;
    if(nw>0.02){la.width=nw;la.height=nw*asp;}edRedraw();return;
  }
  if(!edIsDragging||edSelectedIdx<0)return;
  const la=edLayers[edSelectedIdx];
  la.x=Math.min(Math.max(c.nx-edDragOffX,la.width/2),1-la.width/2);
  la.y=Math.min(Math.max(c.ny-edDragOffY,la.height/2),1-la.height/2);
  edRedraw();
}
function edOnEnd(e){
  // Si quedan menos de 2 dedos, terminar pinch
  if(edPinching && (!e || !e.touches || e.touches.length < 2)){
    edPinchEnd();
    return;
  }
  if(edPainting){edPainting=false;edSaveDrawData();}
  if(edIsDragging||edIsResizing||edIsTailDragging) edPushHistory();
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
function edCloseMenus(){
  document.querySelectorAll('.ed-dropdown').forEach(d=>d.classList.remove('open'));
  document.querySelectorAll('.ed-menu-btn').forEach(b=>b.classList.remove('open'));
  edMenuOpen=null;
}

function edToggleMenu(id){
  if(edMenuOpen===id){edCloseMenus();return;}
  edCloseMenus();
  // Deactivate draw/eraser when opening any menu
  if(['draw','eraser'].includes(edActiveTool)) edDeactivateDrawTool();
  const dd=$('dd-'+id);if(!dd)return;
  dd.classList.add('open');
  const btn=document.querySelector(`[data-menu="${id}"]`);
  if(btn)btn.classList.add('open');
  edMenuOpen=id;
  if(id==='nav')edUpdateNavPages();
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
      </div>`;
    }
    html+=`<div class="op-row" style="margin-top:2px;justify-content:space-between">
      <button class="op-btn danger" id="pp-del">🗑️ Eliminar objeto</button>
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
      pages:edPages.map(p=>({drawData:p.drawData,layers:p.layers.map(edSerLayer)})),
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
function edSerLayer(l){
  if(l.type==='image')return{type:'image',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,src:l.src};
  if(l.type==='text')return{type:'text',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth};
  if(l.type==='bubble')return{type:'bubble',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,
    tail:l.tail,style:l.style,tailStart:{...l.tailStart},tailEnd:{...l.tailEnd},multipleCount:l.multipleCount};
}
function edDeserLayer(d){
  if(d.type==='text'){const l=new TextLayer(d.text,d.x,d.y);Object.assign(l,d);return l;}
  if(d.type==='bubble'){const l=new BubbleLayer(d.text,d.x,d.y);Object.assign(l,d);
    if(d.tailStart)l.tailStart={...d.tailStart};if(d.tailEnd)l.tailEnd={...d.tailEnd};return l;}
  if(d.type==='image'){
    const img=new Image();img.src=d.src;
    const l=new ImageLayer(img,d.x,d.y,d.width);l.height=d.height;l.rotation=d.rotation||0;
    img.onload=()=>{edRedraw();};return l;
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
    }));
  }else{
    edOrientation='vertical';edPages=[{layers:[],drawData:null}];
  }
  if(!edPages.length)edPages.push({layers:[],drawData:null});
  edCurrentPage=0;edLayers=edPages[0].layers;
}

/* ══════════════════════════════════════════
   VISOR
   ══════════════════════════════════════════ */
let edViewerIdx=0;
function edUpdateCanvasFullscreen(){ edFitCanvas(); }

function edOpenViewer(){
  edViewerIdx=edCurrentPage;
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
    if(edViewerIdx < edPages.length-1){ edViewerIdx++; edUpdateViewer(); }
  } else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
    e.preventDefault();
    if(edViewerIdx > 0){ edViewerIdx--; edUpdateViewer(); }
  } else if(e.key === 'Escape'){
    e.preventDefault();
    edCloseViewer();
  }
}

// Tap en el visor → mostrar/ocultar controles
let _viewerTapBound = false, _viewerHideTimer;
function edInitViewerTap(){
  const ctrls = $('viewerControls');
  const viewer = $('editorViewer');
  if(!ctrls || !viewer) return;
  function showCtrls(){
    ctrls.classList.remove('hidden');
    clearTimeout(_viewerHideTimer);
    _viewerHideTimer = setTimeout(()=>ctrls.classList.add('hidden'), 3500);
  }
  if(!_viewerTapBound){
    _viewerTapBound = true;
    viewer.addEventListener('click', e=>{
      if(!e.target.closest('.viewer-controls')) showCtrls();
    });
  }
  showCtrls();
}
function edCloseViewer(){
  $('editorViewer')?.classList.remove('open');
  if(_viewerKeyHandler){
    document.removeEventListener('keydown', _viewerKeyHandler);
    _viewerKeyHandler = null;
  }
}
function edUpdateViewer(){
  const page=edPages[edViewerIdx];if(!page||!edViewerCanvas)return;
  edViewerCtx.fillStyle='#fff';edViewerCtx.fillRect(0,0,edViewerCanvas.width,edViewerCanvas.height);
  page.layers.filter(l=>l.type==='image').forEach(l=>l.draw(edViewerCtx,edViewerCanvas));
  page.layers.filter(l=>l.type!=='image').forEach(l=>l.draw(edViewerCtx,edViewerCanvas));
  if(page.drawData){const img=new Image();img.onload=()=>edViewerCtx.drawImage(img,0,0);img.src=page.drawData;}
  const cnt=$('viewerCounter');if(cnt)cnt.textContent=`${edViewerIdx+1} / ${edPages.length}`;
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
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),ms);
}

/* ══════════════════════════════════════════
   INIT
   ══════════════════════════════════════════ */
function EditorView_init(){
  edCanvas=$('editorCanvas');
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
  edCanvas.addEventListener('pointerdown',edOnStart,{passive:false});
  edCanvas.addEventListener('pointermove',edOnMove, {passive:false});
  edCanvas.addEventListener('pointerup',  edOnEnd);
  edCanvas.addEventListener('pointerleave',edOnEnd);
  edCanvas.addEventListener('touchstart', edOnStart,{passive:false});
  edCanvas.addEventListener('touchmove',  edOnMove, {passive:false});
  edCanvas.addEventListener('touchend',   edOnEnd);

  // ── TOPBAR ──
  $('edBackBtn')?.addEventListener('click',()=>{edSaveProject();Router.go('my-comics');});
  $('edSaveBtn')?.addEventListener('click',edSaveProject);
  $('edPreviewBtn')?.addEventListener('click',edOpenViewer);

  // ── MENÚ: botones dropdown ──
  document.querySelectorAll('[data-menu]').forEach(btn=>{
    btn.addEventListener('click',e=>{e.stopPropagation();edToggleMenu(btn.dataset.menu);});
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

  // ── NAVEGAR ──
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

  // ── MINIMIZAR ──
  $('edUndoBtn')?.addEventListener('click', edUndo);
  $('edRedoBtn')?.addEventListener('click', edRedo);
  $('edMinimizeBtn')?.addEventListener('click',edMinimize);
  edPushHistory();
  edInitFloatDrag();

  // ── VISOR ──
  $('viewerClose')?.addEventListener('click',edCloseViewer);
  $('viewerPrev')?.addEventListener('click',()=>{if(edViewerIdx>0){edViewerIdx--;edUpdateViewer();}});
  $('viewerNext')?.addEventListener('click',()=>{if(edViewerIdx<edPages.length-1){edViewerIdx++;edUpdateViewer();}});

  // ── MODAL PROYECTO ──
  $('edMCancel')?.addEventListener('click',edCloseProjectModal);
  $('edMSave')?.addEventListener('click',edSaveProjectModal);

  // ── RESIZE ──
  window.addEventListener('resize',()=>{edFitCanvas();edUpdateCanvasFullscreen();});

  // Doble rAF en init: asegurar que el DOM tiene medidas reales antes del primer fit
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ edFitCanvas(); edRedraw(); }));

  // ── DEACTIVATE DRAW WHEN CLICKING OUTSIDE CANVAS ──
  document.addEventListener('pointerdown', e => {
    if(['draw','eraser'].includes(edActiveTool)){
      if(!e.target.closest('#editorCanvas') && !e.target.closest('#edOptionsPanel')){
        edDeactivateDrawTool();
      }
    }
    // Close menus when clicking outside menubar
    if(!e.target.closest('#edMenuBar') && !e.target.closest('.ed-dropdown')){
      edCloseMenus();
    }
  });


  // ── FULLSCREEN CANVAS ON ORIENTATION MATCH ──
  edUpdateCanvasFullscreen();
  window.addEventListener('orientationchange', ()=>{
    setTimeout(()=>{edFitCanvas();edUpdateCanvasFullscreen();}, 200);
  });
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
        if(!edPages.length)edPages.push({layers:[],drawData:null});
        edCurrentPage=0;edLayers=edPages[0].layers;
        edSetOrientation(edOrientation);
        const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title;
        edToast('Proyecto cargado ✓');
      }
    }catch(err){edToast('Error al cargar el archivo');}
  };
  reader.readAsText(file);
}
