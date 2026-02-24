/* ============================================================
   editor.js — ComiXow v4.2
   Motor canvas fiel al referEditor. Toolbar flotante sobre canvas.
   ============================================================ */

/* ── ESTADO GLOBAL ── */
let edCanvas, edCtx, edViewerCanvas, edViewerCtx;
let edPages = [], edCurrentPage = 0, edLayers = [];
let edSelectedIdx = -1;
let edIsDragging = false, edIsResizing = false, edIsTailDragging = false;
let edTailPointType = null, edResizeCorner = null;
let edDragOffX = 0, edDragOffY = 0;
let edInitialSize = {};
let edOrientation = 'vertical';
let edProjectId = null;
let edProjectMeta = { title: '', author: '', genre: '', navMode: 'horizontal' };
let edActiveTool = 'select';
let edPainting = false, edLastPX = 0, edLastPY = 0;
let edDrawColor = '#e63030', edDrawSize = 8, edEraserSize = 20;
let edIsMinimized = false;

const ED_BASE = 360;

/* ══════════════════════════════════════════════
   CLASES DE CAPAS (idénticas al referEditor)
   ══════════════════════════════════════════════ */

class BaseLayer {
  constructor(type, x=0.5, y=0.5, width=0.3, height=0.2) {
    this.type=type; this.x=x; this.y=y; this.width=width; this.height=height; this.rotation=0;
  }
  contains(px,py) {
    return px>=this.x-this.width/2 && px<=this.x+this.width/2 &&
           py>=this.y-this.height/2 && py<=this.y+this.height/2;
  }
  getControlPoints() {
    if(this.type!=='image') return [];
    const hw=this.width/2, hh=this.height/2;
    return [
      {x:this.x-hw, y:this.y-hh, corner:'tl'},
      {x:this.x+hw, y:this.y-hh, corner:'tr'},
      {x:this.x-hw, y:this.y+hh, corner:'bl'},
      {x:this.x+hw, y:this.y+hh, corner:'br'},
    ];
  }
  resizeToFitText() {}
}

class ImageLayer extends BaseLayer {
  constructor(imgEl, x=0.5, y=0.5, width=0.4) {
    super('image', x, y, width, 0.3);
    this.img=imgEl; this.src=imgEl.src;
    if(imgEl.naturalWidth && imgEl.naturalHeight)
      this.height = width*(imgEl.naturalHeight/imgEl.naturalWidth);
  }
  draw(ctx, can) {
    const w=this.width*can.width, h=this.height*can.height;
    const px=this.x*can.width, py=this.y*can.height;
    ctx.save(); ctx.translate(px,py); ctx.rotate(this.rotation*Math.PI/180);
    ctx.drawImage(this.img,-w/2,-h/2,w,h); ctx.restore();
  }
}

class TextLayer extends BaseLayer {
  constructor(text='Escribe aquí', x=0.5, y=0.5) {
    super('text',x,y,0.2,0.1);
    this.text=text; this.fontSize=20; this.fontFamily='Arial';
    this.color='#000000'; this.backgroundColor='#ffffff';
    this.borderColor='#000000'; this.borderWidth=0; this.padding=10;
  }
  getLines() { return this.text.split('\n'); }
  measure(ctx) {
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    let mw=0, th=0;
    this.getLines().forEach(l=>{ mw=Math.max(mw,ctx.measureText(l).width); th+=this.fontSize*1.2; });
    return {width:mw, height:th};
  }
  resizeToFitText(can) {
    const ctx=can.getContext('2d'), {width,height}=this.measure(ctx);
    this.width=Math.max(0.05,(width+this.padding*2)/can.width);
    this.height=Math.max(0.05,(height+this.padding*2)/can.height);
  }
  draw(ctx, can) {
    const w=this.width*can.width, h=this.height*can.height;
    const px=this.x*can.width, py=this.y*can.height;
    ctx.fillStyle=this.backgroundColor;
    ctx.fillRect(px-w/2,py-h/2,w,h);
    if(this.borderWidth>0){
      ctx.save(); ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth;
      ctx.strokeRect(px-w/2,py-h/2,w,h); ctx.restore();
    }
    ctx.save(); ctx.translate(px,py); ctx.rotate(this.rotation*Math.PI/180);
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    ctx.fillStyle=this.color; ctx.textAlign='center'; ctx.textBaseline='middle';
    const lines=this.getLines(), lh=this.fontSize*1.2, totalH=lines.length*lh;
    const startY=-totalH/2+lh/2;
    lines.forEach((l,i)=>ctx.fillText(l,0,startY+i*lh));
    ctx.restore();
  }
}

class BubbleLayer extends BaseLayer {
  constructor(text='Escribe aquí', x=0.5, y=0.5) {
    super('bubble',x,y,0.3,0.15);
    this.text=text; this.fontSize=18; this.fontFamily='Comic Sans MS, cursive';
    this.color='#000000'; this.backgroundColor='#ffffff';
    this.borderColor='#000000'; this.borderWidth=2;
    this.tail=true; this.tailStart={x:-0.4,y:0.4}; this.tailEnd={x:-0.4,y:0.6};
    this.style='conventional'; this.multipleCount=3; this.padding=15;
  }
  getLines() { return this.text.split('\n'); }
  measure(ctx) {
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    let mw=0, th=0;
    this.getLines().forEach(l=>{ mw=Math.max(mw,ctx.measureText(l).width); th+=this.fontSize*1.2; });
    return {width:mw, height:th};
  }
  resizeToFitText(can) {
    const ctx=can.getContext('2d'), {width,height}=this.measure(ctx);
    this.width=Math.max(0.05,(width+this.padding*2)/can.width);
    this.height=Math.max(0.05,(height+this.padding*2)/can.height);
  }
  getTailControlPoints() {
    if(!this.tail) return [];
    return [
      {x:this.x+this.tailStart.x*this.width, y:this.y+this.tailStart.y*this.height, type:'start'},
      {x:this.x+this.tailEnd.x*this.width,   y:this.y+this.tailEnd.y*this.height,   type:'end'},
    ];
  }
  drawTail(ctx, sx,sy, ex,ey, common=false) {
    ctx.save();
    ctx.fillStyle=this.backgroundColor; ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth;
    const angle=Math.atan2(ey-sy,ex-sx), bw=10;
    const perp={x:-Math.sin(angle),y:Math.cos(angle)};
    const left={x:sx+perp.x*bw/2, y:sy+perp.y*bw/2};
    const right={x:sx-perp.x*bw/2, y:sy-perp.y*bw/2};
    ctx.beginPath(); ctx.moveTo(left.x,left.y); ctx.lineTo(ex,ey); ctx.lineTo(right.x,right.y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if(common){
      ctx.beginPath(); ctx.moveTo(left.x,left.y); ctx.lineTo(right.x,right.y);
      ctx.strokeStyle=this.backgroundColor; ctx.lineWidth=this.borderWidth*2+2; ctx.stroke();
    }
    ctx.restore();
  }
  draw(ctx, can) {
    const w=this.width*can.width, h=this.height*can.height;
    const pos={x:this.x*can.width, y:this.y*can.height};
    const isSingle=this.text.trim().length===1 && /[a-zA-Z0-9]/.test(this.text.trim());
    ctx.save(); ctx.translate(pos.x,pos.y);

    // ── Cuerpo del bocadillo ──
    if(this.style==='thought') {
      // 4 círculos solapados (referEditor exacto)
      const circles=[
        {x:0,y:-h/4,r:w/3},{x:w/4,y:0,r:w/3},
        {x:-w/4,y:0,r:w/3},{x:0,y:h/4,r:w/3}
      ];
      ctx.fillStyle=this.backgroundColor; ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth;
      circles.forEach(c=>{ ctx.beginPath(); ctx.arc(c.x,c.y,c.r,0,Math.PI*2); ctx.fill(); ctx.stroke(); });
      // Calcular y tapar intersecciones con círculo blanco
      function circleIntersection(c1,c2) {
        const dx=c2.x-c1.x, dy=c2.y-c1.y, d=Math.hypot(dx,dy);
        if(d>c1.r+c2.r||d<Math.abs(c1.r-c2.r)||d===0) return [];
        const a=(c1.r*c1.r-c2.r*c2.r+d*d)/(2*d), h2=c1.r*c1.r-a*a;
        if(h2<0) return [];
        const hh=Math.sqrt(h2), x0=c1.x+a*dx/d, y0=c1.y+a*dy/d;
        const rx=-dy*(hh/d), ry=dx*(hh/d);
        return [{x:x0+rx,y:y0+ry},{x:x0-rx,y:y0-ry}];
      }
      const pairs=[[0,1],[0,2],[1,3],[2,3],[0,3],[1,2]];
      let maxDist=0;
      pairs.forEach(([a,b])=>{
        circleIntersection(circles[a],circles[b]).forEach(p=>{
          maxDist=Math.max(maxDist,Math.hypot(p.x,p.y));
        });
      });
      if(maxDist===0) maxDist=Math.min(w,h)*0.4;
      ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(0,0,maxDist,0,Math.PI*2); ctx.fill();
      // Burbujas pequeñas de cola de pensamiento
      if(this.tail) {
        const tx=this.tailEnd.x*w, ty=this.tailEnd.y*h;
        [0.09,0.055,0.03].forEach((r,i)=>{
          const f=1-i*0.3;
          ctx.beginPath(); ctx.arc(tx*f,ty*f,r*Math.min(can.width,can.height),0,Math.PI*2);
          ctx.fillStyle=this.backgroundColor; ctx.fill();
          ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth; ctx.stroke();
        });
      }
      // Texto sobre el blanco central
      ctx.font=`${this.fontSize}px ${this.fontFamily}`;
      ctx.fillStyle=this.color; ctx.textAlign='center'; ctx.textBaseline='middle';
      const lines=this.getLines(), lh=this.fontSize*1.2, totalH=lines.length*lh;
      lines.forEach((l,i)=>ctx.fillText(l,0,-totalH/2+lh/2+i*lh));
      ctx.restore(); return;
    } else if(this.style==='explosion') {
      const points=12, step=(2*Math.PI)/points;
      const radii=[];
      for(let i=0;i<points;i++) radii.push(0.8+0.3*Math.sin(i*1.5)+0.2*Math.cos(i*2.3));
      ctx.beginPath();
      for(let i=0;i<points;i++){
        const angle=i*step;
        const rr=radii[i]*(isSingle?Math.min(w,h)/2:(i%2===0?w/2:h/2));
        const xx=Math.cos(angle)*rr, yy=Math.sin(angle)*rr;
        i===0?ctx.moveTo(xx,yy):ctx.lineTo(xx,yy);
      }
      ctx.closePath();
    } else {
      if(isSingle){
        ctx.beginPath(); ctx.arc(0,0,Math.min(w,h)/2,0,Math.PI*2);
      } else {
        ctx.beginPath(); ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
      }
    }

    // Relleno y borde
    ctx.fillStyle=this.backgroundColor; ctx.fill();
    if(this.borderWidth>0){
      ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth;
      if(this.style==='lowvoice') ctx.setLineDash([5,3]);
      else ctx.setLineDash([]);
      ctx.stroke(); ctx.setLineDash([]);
    }

    // Colas
    if(this.tail){
      if(this.style==='multiple'){
        for(let i=0;i<this.multipleCount;i++){
          const off=(i-(this.multipleCount-1)/2)*0.15;
          this.drawTail(ctx,(this.tailStart.x+off)*w,this.tailStart.y*h,
                           (this.tailEnd.x+off)*w,  this.tailEnd.y*h, true);
        }
      } else if(this.style==='radio'){
        const ex=this.tailEnd.x*w, ey=this.tailEnd.y*h;
        ctx.save(); ctx.strokeStyle=this.borderColor; ctx.lineWidth=1;
        for(let r=5;r<25;r+=5){ ctx.beginPath(); ctx.arc(ex,ey,r,0,Math.PI*2); ctx.stroke(); }
        ctx.restore();
      } else {
        this.drawTail(ctx,this.tailStart.x*w,this.tailStart.y*h,
                         this.tailEnd.x*w,  this.tailEnd.y*h, true);
      }
    }

    // Texto
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    ctx.fillStyle=this.color; ctx.textAlign='center'; ctx.textBaseline='middle';
    const lines=this.getLines(), lh=this.fontSize*1.2, totalH=lines.length*lh;
    lines.forEach((l,i)=>ctx.fillText(l,0,-totalH/2+lh/2+i*lh));
    ctx.restore();
  }
}

/* ══════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════ */
const $=id=>document.getElementById(id);

function edToast(msg,ms=2000){
  const t=$('edToast'); if(!t)return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),ms);
}

function edCoords(e){
  const rect=edCanvas.getBoundingClientRect();
  const scaleX=edCanvas.width/rect.width, scaleY=edCanvas.height/rect.height;
  const src=e.touches?e.touches[0]:e;
  const px=Math.min(Math.max((src.clientX-rect.left)*scaleX,0),edCanvas.width);
  const py=Math.min(Math.max((src.clientY-rect.top)*scaleY,0),edCanvas.height);
  return {px, py, nx:px/edCanvas.width, ny:py/edCanvas.height};
}

/* ══════════════════════════════════════════════
   CANVAS
   ══════════════════════════════════════════════ */
function edSetOrientation(o){
  edOrientation=o;
  edCanvas.width  = o==='vertical' ? ED_BASE : Math.round(ED_BASE*16/9);
  edCanvas.height = o==='vertical' ? Math.round(ED_BASE*16/9) : ED_BASE;
  if(edViewerCanvas){ edViewerCanvas.width=edCanvas.width; edViewerCanvas.height=edCanvas.height; }
  edFitCanvas(); edRedraw(); edUpdateThumbnails();
}

function edFitCanvas(){
  const wrap=$('editorCanvasWrap'); if(!wrap)return;
  const strip=$('editorPageStrip');
  const toolbar=$('edToolbar');
  const stripH=strip?strip.offsetHeight:0;
  const toolbarH=toolbar?toolbar.offsetHeight:0;
  const maxW=wrap.clientWidth-16;
  const maxH=wrap.clientHeight-stripH-toolbarH-24;
  const scale=Math.min(maxW/edCanvas.width, maxH/edCanvas.height, 1);
  edCanvas.style.width=Math.round(edCanvas.width*scale)+'px';
  edCanvas.style.height=Math.round(edCanvas.height*scale)+'px';
  // Centrar verticalmente entre strip y toolbar
  const topOff=stripH+8;
  edCanvas.style.marginTop=topOff+'px';
}

/* ══════════════════════════════════════════════
   REDRAW
   ══════════════════════════════════════════════ */
function edRedraw(){
  if(!edCtx)return;
  const cw=edCanvas.width, ch=edCanvas.height;
  edCtx.clearRect(0,0,cw,ch);
  edCtx.fillStyle='#ffffff'; edCtx.fillRect(0,0,cw,ch);

  const page=edPages[edCurrentPage]; if(!page)return;

  // Dibujar capas: imágenes primero, luego texto y bocadillos encima
  const imgLayers=edLayers.filter(l=>l.type==='image');
  const topLayers=edLayers.filter(l=>l.type!=='image');
  imgLayers.forEach(l=>l.draw(edCtx,edCanvas));

  // Dibujo libre encima de imágenes pero debajo de textos/bocadillos
  if(page.drawData){
    const img=new Image();
    img.onload=()=>{
      edCtx.drawImage(img,0,0);
      topLayers.forEach(l=>l.draw(edCtx,edCanvas));
      edDrawSelection();
    };
    img.src=page.drawData; return;
  }

  topLayers.forEach(l=>l.draw(edCtx,edCanvas));
  edDrawSelection();
}

function edDrawSelection(){
  if(edSelectedIdx<0||edSelectedIdx>=edLayers.length)return;
  const l=edLayers[edSelectedIdx];
  const cw=edCanvas.width, ch=edCanvas.height;
  const x=l.x*cw, y=l.y*ch, w=l.width*cw, h=l.height*ch;

  edCtx.save();
  edCtx.strokeStyle='#ff6600'; edCtx.lineWidth=2; edCtx.setLineDash([5,3]);
  edCtx.strokeRect(x-w/2,y-h/2,w,h); edCtx.setLineDash([]);

  // Puntos de control
  if(l.type==='image'){
    edCtx.fillStyle='#ff4444';
    l.getControlPoints().forEach(p=>{
      const px=p.x*cw, py=p.y*ch;
      edCtx.beginPath(); edCtx.arc(px,py,6,0,Math.PI*2); edCtx.fill();
      edCtx.strokeStyle='#fff'; edCtx.lineWidth=1.5; edCtx.stroke();
    });
  }
  if(l.type==='bubble'){
    edCtx.fillStyle='#ff4444';
    l.getTailControlPoints().forEach(p=>{
      const px=p.x*cw, py=p.y*ch;
      edCtx.beginPath(); edCtx.arc(px,py,7,0,Math.PI*2); edCtx.fill();
      edCtx.strokeStyle='#fff'; edCtx.lineWidth=1.5; edCtx.stroke();
    });
  }
  edCtx.restore();
}

/* ══════════════════════════════════════════════
   MINIATURAS
   ══════════════════════════════════════════════ */
function edUpdateThumbnails(){
  const strip=$('editorPageStrip'); if(!strip)return;
  strip.innerHTML='';

  // Botón volver
  const backBtn=document.createElement('button');
  backBtn.id='edBackBtn'; backBtn.innerHTML='‹'; backBtn.title='Volver';
  backBtn.addEventListener('click',()=>{
    edSaveProject();
    Router.go('my-comics');
  });
  strip.appendChild(backBtn);

  // Sep
  const sep=document.createElement('div'); sep.className='ed-strip-sep';
  strip.appendChild(sep);

  // Miniaturas
  edPages.forEach((page,idx)=>{
    const div=document.createElement('div');
    div.className='ed-page-thumb'+(idx===edCurrentPage?' active':'');
    const tc=document.createElement('canvas');
    tc.width=36; tc.height=50;
    const tctx=tc.getContext('2d');
    tctx.fillStyle='#fff'; tctx.fillRect(0,0,36,50);
    // imgs primero, luego el resto
    const imgs=page.layers.filter(l=>l.type==='image');
    const rest=page.layers.filter(l=>l.type!=='image');
    imgs.forEach(l=>l.draw(tctx,tc));
    rest.forEach(l=>l.draw(tctx,tc));
    div.appendChild(tc);
    const n=document.createElement('span'); n.className='thumb-n';
    if(!page.layers.length) n.textContent=idx+1;
    div.appendChild(n);
    div.addEventListener('click',()=>edLoadPage(idx));
    strip.appendChild(div);
  });

  // Botón añadir página
  const addBtn=document.createElement('button'); addBtn.className='ed-page-add'; addBtn.textContent='+';
  addBtn.addEventListener('click',edAddPage);
  strip.appendChild(addBtn);

  const active=strip.querySelector('.ed-page-thumb.active');
  if(active) active.scrollIntoView({behavior:'smooth',inline:'nearest'});

  // Refitear el canvas ahora que el strip tiene su altura real
  requestAnimationFrame(edFitCanvas);
}

/* ══════════════════════════════════════════════
   PÁGINAS
   ══════════════════════════════════════════════ */
function edAddPage(){
  edPages.push({layers:[],drawData:null});
  edLoadPage(edPages.length-1);
}
function edDeletePage(){
  if(edPages.length<=1){edToast('Necesitas al menos una página');return;}
  edPages.splice(edCurrentPage,1);
  edLoadPage(Math.min(edCurrentPage,edPages.length-1));
}
function edLoadPage(idx){
  edCurrentPage=idx;
  edLayers=edPages[idx].layers;
  edSelectedIdx=-1;
  edRedraw(); edUpdateThumbnails();
  edRenderToolPanel();
}

/* ══════════════════════════════════════════════
   AÑADIR CAPAS
   ══════════════════════════════════════════════ */
function edAddImage(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      // Tamaño inicial: encaja en 0.7 del ancho manteniendo proporción
      const w=0.7;
      const h=w*(img.naturalHeight/img.naturalWidth)*(edCanvas.width/edCanvas.height);
      const layer=new ImageLayer(img,0.5,0.5,w);
      layer.height=h;
      // Asegurar que cabe (máx 0.85 en cualquier eje)
      if(layer.height>0.85){ layer.height=0.85; layer.width=layer.height*(edCanvas.height/edCanvas.width)*(img.naturalWidth/img.naturalHeight); }
      edLayers.push(layer);
      edSelectedIdx=edLayers.length-1;
      edRedraw(); edUpdateThumbnails();
      edSetTool('edit');
      edToast('Imagen añadida ✓');
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}

function edAddText(){
  const l=new TextLayer('Escribe aquí');
  l.resizeToFitText(edCanvas);
  edLayers.push(l);
  edSelectedIdx=edLayers.length-1;
  edRedraw(); edUpdateThumbnails();
  edSetTool('edit');
}

function edAddBubble(){
  const l=new BubbleLayer('Escribe aquí');
  l.resizeToFitText(edCanvas);
  edLayers.push(l);
  edSelectedIdx=edLayers.length-1;
  edRedraw(); edUpdateThumbnails();
  edSetTool('edit');
}

function edDeleteSelected(){
  if(edSelectedIdx<0){edToast('Selecciona un objeto primero');return;}
  edLayers.splice(edSelectedIdx,1);
  edSelectedIdx=-1;
  edRedraw(); edUpdateThumbnails(); edRenderToolPanel();
}

/* ══════════════════════════════════════════════
   EVENTOS DE CANVAS
   ══════════════════════════════════════════════ */
function edOnStart(e){
  e.preventDefault();
  if(['draw','eraser'].includes(edActiveTool)){edStartPaint(e);return;}

  const c=edCoords(e);

  // ¿Cola de bocadillo?
  if(edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='bubble'){
    const la=edLayers[edSelectedIdx];
    for(const p of la.getTailControlPoints()){
      const dist=Math.hypot(c.nx-p.x,c.ny-p.y);
      if(dist<0.04){edIsTailDragging=true;edTailPointType=p.type;return;}
    }
  }

  // ¿Esquina de imagen?
  if(edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='image'){
    const la=edLayers[edSelectedIdx];
    for(const p of la.getControlPoints()){
      const dist=Math.hypot(c.nx-p.x,c.ny-p.y);
      if(dist<0.04){
        edIsResizing=true; edResizeCorner=p.corner;
        edInitialSize={width:la.width,height:la.height,x:la.x,y:la.y};
        return;
      }
    }
  }

  // ¿Clic en capa?
  let found=-1;
  for(let i=edLayers.length-1;i>=0;i--){
    if(edLayers[i].contains(c.nx,c.ny)){found=i;break;}
  }
  if(found>=0){
    edSelectedIdx=found;
    edDragOffX=c.nx-edLayers[found].x;
    edDragOffY=c.ny-edLayers[found].y;
    edIsDragging=true;
    if(edActiveTool==='select') edSetTool('edit');
  } else {
    edSelectedIdx=-1;
  }
  edRedraw(); edRenderToolPanel();
}

function edOnMove(e){
  e.preventDefault();
  if(['draw','eraser'].includes(edActiveTool)&&edPainting){edContinuePaint(e);return;}

  const c=edCoords(e);

  if(edIsTailDragging&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const dx=c.nx-la.x, dy=c.ny-la.y;
    if(edTailPointType==='start'){la.tailStart.x=dx/la.width;la.tailStart.y=dy/la.height;}
    else{la.tailEnd.x=dx/la.width;la.tailEnd.y=dy/la.height;}
    edRedraw(); return;
  }

  if(edIsResizing&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const asp=edInitialSize.height/edInitialSize.width;
    const dx=c.nx-edInitialSize.x;
    let nw=edResizeCorner==='tl'||edResizeCorner==='bl'?edInitialSize.width-dx:edInitialSize.width+dx;
    if(nw>0.02){la.width=nw;la.height=nw*asp;}
    edRedraw(); return;
  }

  if(!edIsDragging||edSelectedIdx<0)return;
  const la=edLayers[edSelectedIdx];
  la.x=Math.min(Math.max(c.nx-edDragOffX,la.width/2),1-la.width/2);
  la.y=Math.min(Math.max(c.ny-edDragOffY,la.height/2),1-la.height/2);
  edRedraw();
}

function edOnEnd(e){
  if(edPainting){edPainting=false;edSaveDrawData();}
  edIsDragging=false; edIsResizing=false; edIsTailDragging=false;
}

/* ══════════════════════════════════════════════
   DIBUJO LIBRE
   ══════════════════════════════════════════════ */
function edStartPaint(e){
  edPainting=true;
  const c=edCoords(e);
  const isEraser=edActiveTool==='eraser';
  edCtx.save();
  if(isEraser) edCtx.globalCompositeOperation='destination-out';
  else {edCtx.globalCompositeOperation='source-over'; edCtx.fillStyle=edDrawColor;}
  edCtx.beginPath();
  edCtx.arc(c.px,c.py,(isEraser?edEraserSize:edDrawSize)/2,0,Math.PI*2);
  edCtx.fill(); edCtx.restore();
  edCtx.globalCompositeOperation='source-over';
  edLastPX=c.px; edLastPY=c.py;
  edMoveBrushCursor(e);
}
function edContinuePaint(e){
  const c=edCoords(e), isEraser=edActiveTool==='eraser';
  edCtx.save();
  edCtx.beginPath(); edCtx.moveTo(edLastPX,edLastPY); edCtx.lineTo(c.px,c.py);
  if(isEraser){edCtx.globalCompositeOperation='destination-out';edCtx.strokeStyle='rgba(0,0,0,1)';}
  else{edCtx.globalCompositeOperation='source-over';edCtx.strokeStyle=edDrawColor;}
  edCtx.lineWidth=isEraser?edEraserSize:edDrawSize;
  edCtx.lineCap='round'; edCtx.lineJoin='round'; edCtx.stroke();
  edCtx.restore(); edCtx.globalCompositeOperation='source-over';
  edLastPX=c.px; edLastPY=c.py;
  edMoveBrushCursor(e);
}
function edSaveDrawData(){
  const page=edPages[edCurrentPage]; if(!page)return;
  page.drawData=edCanvas.toDataURL();
}
function edMoveBrushCursor(e){
  const src=e.touches?e.touches[0]:e, cur=$('edBrushCursor'); if(!cur)return;
  const sz=(edActiveTool==='eraser'?edEraserSize:edDrawSize)*2;
  cur.style.left=src.clientX+'px'; cur.style.top=src.clientY+'px';
  cur.style.width=sz+'px'; cur.style.height=sz+'px';
}

/* ══════════════════════════════════════════════
   TOOLBAR: HERRAMIENTAS Y PANEL
   ══════════════════════════════════════════════ */
function edSetTool(tool){
  edActiveTool=tool;
  // Actualizar botones
  document.querySelectorAll('.ed-tool-btn').forEach(b=>b.classList.remove('active'));
  const btn=document.querySelector(`[data-tool="${tool}"]`);
  if(btn) btn.classList.add('active');

  // Nombre en la pestaña
  const names={select:'Seleccionar',image:'Foto/Imagen',text:'Texto',bubble:'Bocadillo',
                draw:'Dibujo libre',eraser:'Borrador',edit:'Propiedades',view:'Visualizar'};
  const tn=$('edToolName'); if(tn) tn.textContent=names[tool]||'';

  // Cursor canvas
  edCanvas.className='';
  if(tool==='draw') edCanvas.classList.add('tool-draw');
  else if(tool==='eraser') edCanvas.classList.add('tool-eraser');

  // Cursor dibujo
  const cur=$('edBrushCursor');
  if(cur) cur.style.display=['draw','eraser'].includes(tool)?'block':'none';

  edRenderToolPanel();

  // Si no está minimizado, expandir
  const toolbar=$('edToolbar');
  if(toolbar) toolbar.classList.remove('minimized');
  edIsMinimized=false;
}

function edRenderToolPanel(){
  const panel=$('edToolPanel'); if(!panel)return;

  if(edActiveTool==='image'){
    panel.innerHTML=`
      <div class="tp-row">
        <button class="tp-btn" id="tp-gallery">🖼 Galería</button>
        <button class="tp-btn" id="tp-camera">📷 Cámara</button>
      </div>`;
    $('tp-gallery')?.addEventListener('click',()=>$('edFileGallery').click());
    $('tp-camera')?.addEventListener('click',()=>$('edFileCapture').click());
    return;
  }

  if(edActiveTool==='text'){
    panel.innerHTML=`
      <div class="tp-row">
        <button class="tp-btn" id="tp-addtext">＋ Añadir texto</button>
      </div>`;
    $('tp-addtext')?.addEventListener('click',edAddText);
    return;
  }

  if(edActiveTool==='bubble'){
    panel.innerHTML=`
      <div class="tp-row">
        <button class="tp-btn" id="tp-addbubble">＋ Añadir bocadillo</button>
      </div>`;
    $('tp-addbubble')?.addEventListener('click',edAddBubble);
    return;
  }

  if(edActiveTool==='draw'){
    panel.innerHTML=`
      <div class="tp-row">
        <div class="tp-label">Color</div>
        <input type="color" class="tp-color" id="tp-dcolor" value="${edDrawColor}">
      </div>
      <div class="tp-row">
        <div class="tp-label">Grosor</div>
        <div class="tp-prop-row" style="margin:0">
          <input type="range" id="tp-dsize" min="1" max="48" value="${edDrawSize}" style="flex:1;accent-color:var(--black)">
          <span id="tp-dsizeval" style="font-size:.75rem;font-weight:900;color:var(--gray-600);width:32px;text-align:right">${edDrawSize}px</span>
        </div>
      </div>`;
    $('tp-dcolor')?.addEventListener('input',e=>edDrawColor=e.target.value);
    $('tp-dsize')?.addEventListener('input',e=>{
      edDrawSize=+e.target.value;
      const v=$('tp-dsizeval'); if(v) v.textContent=e.target.value+'px';
    });
    return;
  }

  if(edActiveTool==='eraser'){
    panel.innerHTML=`
      <div class="tp-row">
        <div class="tp-label">Tamaño borrador</div>
        <div class="tp-prop-row" style="margin:0">
          <input type="range" id="tp-esize" min="4" max="80" value="${edEraserSize}" style="flex:1;accent-color:var(--black)">
          <span id="tp-esizeval" style="font-size:.75rem;font-weight:900;color:var(--gray-600);width:32px;text-align:right">${edEraserSize}px</span>
        </div>
      </div>`;
    $('tp-esize')?.addEventListener('input',e=>{
      edEraserSize=+e.target.value;
      const v=$('tp-esizeval'); if(v) v.textContent=e.target.value+'px';
    });
    return;
  }

  if(edActiveTool==='view'){
    panel.innerHTML=`
      <div class="tp-row">
        <button class="tp-btn" id="tp-viewer">👁️ Vista previa</button>
        <button class="tp-btn" id="tp-savejson">💾 Guardar</button>
        <button class="tp-btn" id="tp-loadjson">📂 Cargar .json</button>
      </div>
      <div class="tp-row">
        <div class="tp-label">Orientación de página</div>
        <select class="tp-select" id="tp-orient">
          <option value="vertical" ${edOrientation==='vertical'?'selected':''}>📱 Vertical</option>
          <option value="horizontal" ${edOrientation==='horizontal'?'selected':''}>🖥 Horizontal</option>
        </select>
        <button class="tp-btn danger" id="tp-delpage">🗑 Eliminar pág.</button>
      </div>`;
    $('tp-viewer')?.addEventListener('click',edOpenViewer);
    $('tp-savejson')?.addEventListener('click',edSaveProject);
    $('tp-loadjson')?.addEventListener('click',()=>$('edLoadFile')?.click());
    $('tp-orient')?.addEventListener('change',e=>edSetOrientation(e.target.value));
    $('tp-delpage')?.addEventListener('click',edDeletePage);
    return;
  }

  if(edActiveTool==='edit'||edActiveTool==='select'){
    edRenderPropsPanel(panel);
    return;
  }

  panel.innerHTML='';
}

function edRenderPropsPanel(panel){
  if(edSelectedIdx<0||edSelectedIdx>=edLayers.length){
    panel.innerHTML=`<div style="padding:6px 0;color:var(--gray-400);font-size:.8rem;font-weight:700;text-align:center">
      Toca un objeto en el canvas para seleccionarlo</div>`;
    return;
  }
  const la=edLayers[edSelectedIdx];

  let html=`<div style="font-size:.7rem;font-weight:900;color:var(--gray-500);margin-bottom:6px;text-transform:uppercase">
    ${la.type==='image'?'🖼 Imagen':la.type==='text'?'💬 Texto':'🗯 Bocadillo'}
    — ${(la.x*100).toFixed(0)}%, ${(la.y*100).toFixed(0)}%</div>`;

  if(la.type==='text'||la.type==='bubble'){
    html+=`
    <div class="tp-prop-row"><span class="tp-prop-label">Texto</span>
      <textarea id="pp-text" class="tp-prop-row" style="border-radius:8px;resize:vertical;min-height:48px;flex:1;border:2px solid var(--gray-300);padding:5px 8px;font-family:var(--font-body);font-size:.85rem;">${la.text.replace(/</g,'&lt;')}</textarea></div>
    <div class="tp-prop-row"><span class="tp-prop-label">Fuente</span>
      <select id="pp-font">
        <option value="Arial" ${la.fontFamily==='Arial'?'selected':''}>Arial</option>
        <option value="Bangers" ${la.fontFamily==='Bangers'?'selected':''}>Bangers</option>
        <option value="Comic Sans MS, cursive" ${la.fontFamily==='Comic Sans MS, cursive'?'selected':''}>Comic Sans</option>
        <option value="Verdana" ${la.fontFamily==='Verdana'?'selected':''}>Verdana</option>
      </select></div>
    <div class="tp-prop-row"><span class="tp-prop-label">Tamaño</span>
      <input type="number" id="pp-fs" value="${la.fontSize}" min="8" max="120"></div>
    <div class="tp-prop-row"><span class="tp-prop-label">Color texto</span>
      <input type="color" id="pp-color" value="${la.color}"></div>
    <div class="tp-prop-row"><span class="tp-prop-label">Fondo</span>
      <input type="color" id="pp-bg" value="${la.backgroundColor&&la.backgroundColor.startsWith('#')?la.backgroundColor:'#ffffff'}"></div>
    <div class="tp-prop-row"><span class="tp-prop-label">Marco</span>
      <select id="pp-bw">
        ${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${la.borderWidth===n?'selected':''}>${n===0?'Ninguno':n+'px'}</option>`).join('')}
      </select>
      <input type="color" id="pp-bc" value="${la.borderColor}"></div>`;

    if(la.type==='bubble'){
      html+=`
      <div class="tp-prop-row"><span class="tp-prop-label">Estilo</span>
        <select id="pp-style">
          <option value="conventional" ${la.style==='conventional'?'selected':''}>Convencional</option>
          <option value="lowvoice" ${la.style==='lowvoice'?'selected':''}>Voz baja</option>
          <option value="multiple" ${la.style==='multiple'?'selected':''}>Varias voces</option>
          <option value="thought" ${la.style==='thought'?'selected':''}>Pensamiento</option>
          <option value="radio" ${la.style==='radio'?'selected':''}>Radio/Tele</option>
          <option value="explosion" ${la.style==='explosion'?'selected':''}>Explosión</option>
        </select></div>
      <div class="tp-prop-row" id="pp-mcrow" ${la.style!=='multiple'?'style="display:none"':''}>
        <span class="tp-prop-label">Nº voces</span>
        <input type="number" id="pp-mc" value="${la.multipleCount||3}" min="1" max="5"></div>
      <div class="tp-prop-row"><span class="tp-prop-label">Cola</span>
        <input type="checkbox" id="pp-tail" ${la.tail?'checked':''}></div>`;
    }
  } else if(la.type==='image'){
    html+=`
    <div class="tp-prop-row"><span class="tp-prop-label">Rotación</span>
      <input type="number" id="pp-rot" value="${la.rotation}" min="-180" max="180"> °</div>`;
  }

  if(la.type!=='image'){
    html+=`
    <div class="tp-prop-row"><span class="tp-prop-label">Rotación</span>
      <input type="number" id="pp-rot" value="${la.rotation}" min="-180" max="180"> °</div>`;
  }

  html+=`<div class="tp-row" style="margin-top:4px">
    <button class="tp-btn danger" id="pp-del">🗑️ Eliminar</button>
  </div>`;

  panel.innerHTML=html;

  // Mostrar/ocultar fila múltiple
  $('pp-style')?.addEventListener('change',e=>{
    const row=$('pp-mcrow');
    if(row) row.style.display=e.target.value==='multiple'?'flex':'none';
  });

  // Live update en todos los campos
  panel.querySelectorAll('input,select,textarea').forEach(inp=>{
    inp.addEventListener('input',e=>{
      if(edSelectedIdx<0) return;
      const la=edLayers[edSelectedIdx], id=e.target.id;
      if(id==='pp-text'){la.text=e.target.value;la.resizeToFitText(edCanvas);}
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
}

/* ══════════════════════════════════════════════
   GUARDAR / CARGAR PROYECTO
   ══════════════════════════════════════════════ */
function edSaveProject(){
  if(!edProjectId)return;
  const existing=ComicStore.getById(edProjectId)||{};
  const panels=edPages.map((p,i)=>({
    id:'panel_'+i,
    dataUrl: p.drawData || edRenderPageToDataUrl(p),
    orientation: edOrientation,
  }));
  const comic={
    ...existing,
    id: edProjectId,
    title: edProjectMeta.title,
    author: edProjectMeta.author,
    genre: edProjectMeta.genre,
    navMode: edProjectMeta.navMode,
    panels,
    editorData: {
      orientation: edOrientation,
      pages: edPages.map(p=>({
        drawData: p.drawData,
        layers: p.layers.map(l=>edSerializeLayer(l)),
      })),
    },
    updatedAt: new Date().toISOString(),
  };
  ComicStore.save(comic);
  edToast('Guardado ✓');
}

function edRenderPageToDataUrl(page){
  const tmp=document.createElement('canvas');
  tmp.width=edCanvas.width; tmp.height=edCanvas.height;
  const ctx=tmp.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,tmp.width,tmp.height);
  const imgs=page.layers.filter(l=>l.type==='image');
  const rest=page.layers.filter(l=>l.type!=='image');
  imgs.forEach(l=>l.draw(ctx,tmp));
  rest.forEach(l=>l.draw(ctx,tmp));
  return tmp.toDataURL('image/jpeg',0.85);
}

function edSerializeLayer(l){
  if(l.type==='image')  return {type:'image',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,src:l.src};
  if(l.type==='text')   return {type:'text',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth};
  if(l.type==='bubble') return {type:'bubble',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,
    tail:l.tail,style:l.style,tailStart:l.tailStart,tailEnd:l.tailEnd,multipleCount:l.multipleCount};
}

function edDeserializeLayer(d){
  if(d.type==='text'){
    const l=new TextLayer(d.text,d.x,d.y); Object.assign(l,d); return l;
  }
  if(d.type==='bubble'){
    const l=new BubbleLayer(d.text,d.x,d.y); Object.assign(l,d);
    if(d.tailStart) l.tailStart={...d.tailStart};
    if(d.tailEnd)   l.tailEnd={...d.tailEnd};
    return l;
  }
  if(d.type==='image'){
    const img=new Image(); img.src=d.src;
    const l=new ImageLayer(img,d.x,d.y,d.width);
    l.height=d.height; l.rotation=d.rotation||0;
    img.onload=()=>{edRedraw();edUpdateThumbnails();};
    return l;
  }
  return null;
}

function edLoadProject(id){
  const comic=ComicStore.getById(id); if(!comic)return;
  edProjectId=id;
  edProjectMeta={
    title:comic.title||'',
    author:comic.author||comic.username||'',
    genre:comic.genre||'',
    navMode:comic.navMode||'horizontal',
  };

  // Actualizar título en el strip (no hay topbar de título)
  document.title=edProjectMeta.title||'Editor — ComiXow';

  if(comic.editorData){
    edOrientation=comic.editorData.orientation||'vertical';
    edPages=(comic.editorData.pages||[]).map(pd=>({
      drawData:pd.drawData||null,
      layers:(pd.layers||[]).map(edDeserializeLayer).filter(Boolean),
    }));
  } else {
    edOrientation='vertical';
    edPages=[{layers:[],drawData:null}];
  }

  if(!edPages.length) edPages.push({layers:[],drawData:null});
  edCurrentPage=0;
  edLayers=edPages[0].layers;
}

/* ══════════════════════════════════════════════
   VISOR
   ══════════════════════════════════════════════ */
let edViewerIdx=0;
function edOpenViewer(){
  edViewerIdx=edCurrentPage;
  edUpdateViewer();
  $('editorViewer')?.classList.add('open');
}
function edCloseViewer(){ $('editorViewer')?.classList.remove('open'); }
function edUpdateViewer(){
  const page=edPages[edViewerIdx]; if(!page||!edViewerCanvas)return;
  edViewerCtx.fillStyle='#fff'; edViewerCtx.fillRect(0,0,edViewerCanvas.width,edViewerCanvas.height);
  const imgs=page.layers.filter(l=>l.type==='image');
  const rest=page.layers.filter(l=>l.type!=='image');
  imgs.forEach(l=>l.draw(edViewerCtx,edViewerCanvas));
  rest.forEach(l=>l.draw(edViewerCtx,edViewerCanvas));
  if(page.drawData){const img=new Image();img.onload=()=>edViewerCtx.drawImage(img,0,0);img.src=page.drawData;}
  const cnt=$('viewerCounter'); if(cnt) cnt.textContent=`${edViewerIdx+1} / ${edPages.length}`;
}

/* ══════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════ */
function EditorView_init(){
  edCanvas=$('editorCanvas');
  edViewerCanvas=$('viewerCanvas');
  if(!edCanvas)return;
  edCtx=edCanvas.getContext('2d');
  if(edViewerCanvas) edViewerCtx=edViewerCanvas.getContext('2d');

  // Cargar proyecto indicado por my-comics.js
  const editId=sessionStorage.getItem('cx_edit_id');
  if(editId){
    edLoadProject(editId);
    sessionStorage.removeItem('cx_edit_id');
  } else {
    // Sin proyecto: ir a mis creaciones
    Router.go('my-comics'); return;
  }

  edSetOrientation(edOrientation);
  edSetTool('select');
  edRenderToolPanel();

  // ── EVENTOS CANVAS ──
  edCanvas.addEventListener('pointerdown',edOnStart,{passive:false});
  edCanvas.addEventListener('pointermove',edOnMove, {passive:false});
  edCanvas.addEventListener('pointerup',  edOnEnd);
  edCanvas.addEventListener('pointerleave',edOnEnd);
  edCanvas.addEventListener('touchstart', edOnStart,{passive:false});
  edCanvas.addEventListener('touchmove',  edOnMove, {passive:false});
  edCanvas.addEventListener('touchend',   edOnEnd);

  // ── TOOLBAR: herramienta ──
  document.querySelectorAll('[data-tool]').forEach(btn=>{
    btn.addEventListener('click',()=>edSetTool(btn.dataset.tool));
  });

  // ── TOOLBAR: minimizar ──
  const tab=$('edToolbarTab');
  const minBtn=$('edToolbarMinBtn');
  const toolbar=$('edToolbar');
  if(tab) tab.addEventListener('click',()=>{
    edIsMinimized=!edIsMinimized;
    toolbar?.classList.toggle('minimized',edIsMinimized);
    requestAnimationFrame(edFitCanvas);
  });

  // ── FICHEROS ──
  $('edFileGallery')?.addEventListener('change',e=>{edAddImage(e.target.files[0]);e.target.value='';});
  $('edFileCapture')?.addEventListener('change',e=>{edAddImage(e.target.files[0]);e.target.value='';});

  // ── VISOR ──
  $('viewerClose')?.addEventListener('click',edCloseViewer);
  $('viewerPrev')?.addEventListener('click',()=>{if(edViewerIdx>0){edViewerIdx--;edUpdateViewer();}});
  $('viewerNext')?.addEventListener('click',()=>{if(edViewerIdx<edPages.length-1){edViewerIdx++;edUpdateViewer();}});

  // ── RESIZE VENTANA ──
  window.addEventListener('resize',edFitCanvas);
}
