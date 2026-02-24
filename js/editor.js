/* ============================================================
   editor.js — ComiXow Editor v4.2
   Motor canvas basado en referEditor con estética ComiXow.
   ============================================================ */

const ED_BASE = 360;
let edCanvas, edCtx, edViewerCanvas, edViewerCtx;
let edPages = [], edCurrentPage = 0, edLayers = [];
let edSelectedIdx = -1;
let edIsDragging = false, edIsResizing = false, edIsTailDragging = false;
let edTailPointType = null, edResizeCorner = null;
let edDragOffX = 0, edDragOffY = 0;
let edInitialSize = {};
let edOrientation = 'vertical';
let edProjectMeta = { title: 'Mi proyecto', navMode: 'horizontal' };
let edActivePanel = 'pages';
let edTouchStartX = 0, edTouchStartY = 0;
let edPainting = false, edLastPX = 0, edLastPY = 0;
let edDrawColor = '#FF3030', edDrawSize = 6;
let edDrawMode = false; // true cuando herramienta es draw o eraser
let edEraserMode = false;

/* ── CLASES ── */
class BaseLayer {
  constructor(type, x=0.5, y=0.5, w=0.3, h=0.2) {
    this.type=type; this.x=x; this.y=y; this.width=w; this.height=h; this.rotation=0;
  }
  contains(px,py) {
    return px>=this.x-this.width/2 && px<=this.x+this.width/2 &&
           py>=this.y-this.height/2 && py<=this.y+this.height/2;
  }
  getControlPoints() {
    const hw=this.width/2, hh=this.height/2;
    return [
      {x:this.x-hw, y:this.y-hh, corner:'tl'},
      {x:this.x+hw, y:this.y-hh, corner:'tr'},
      {x:this.x-hw, y:this.y+hh, corner:'bl'},
      {x:this.x+hw, y:this.y+hh, corner:'br'},
    ];
  }
  resizeToFitText(canvas) {}
}

class ImageLayer extends BaseLayer {
  constructor(img, x=0.5, y=0.5, w=0.4) {
    const ratio = img.naturalHeight/img.naturalWidth || 1;
    super('image', x, y, w, w*ratio);
    this.img=img; this.src=img.src;
  }
  draw(ctx, canvas) {
    const w=this.width*canvas.width, h=this.height*canvas.height;
    const px=this.x*canvas.width, py=this.y*canvas.height;
    ctx.save(); ctx.translate(px,py); ctx.rotate(this.rotation*Math.PI/180);
    ctx.drawImage(this.img, -w/2, -h/2, w, h);
    ctx.restore();
  }
  resizeToFitText() {}
}

class TextLayer extends BaseLayer {
  constructor(text='Texto', x=0.5, y=0.5) {
    super('text', x, y, 0.25, 0.1);
    this.text=text; this.fontSize=20; this.fontFamily='Bangers';
    this.color='#000000'; this.backgroundColor='rgba(0,0,0,0)';
    this.borderColor='#000000'; this.borderWidth=0; this.align='center'; this.padding=8;
  }
  getLines() { return this.text.split('\n'); }
  measure(ctx) {
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    let maxW=0, totalH=0;
    this.getLines().forEach(l => { maxW=Math.max(maxW, ctx.measureText(l).width); totalH+=this.fontSize*1.2; });
    return {width:maxW, height:totalH};
  }
  resizeToFitText(canvas) {
    const ctx=canvas.getContext('2d');
    const {width,height}=this.measure(ctx);
    this.width=Math.max(0.05, (width+this.padding*2)/canvas.width);
    this.height=Math.max(0.04, (height+this.padding*2)/canvas.height);
  }
  draw(ctx, canvas) {
    const w=this.width*canvas.width, h=this.height*canvas.height;
    const px=this.x*canvas.width, py=this.y*canvas.height;
    ctx.save(); ctx.translate(px,py); ctx.rotate(this.rotation*Math.PI/180);
    if (this.backgroundColor && this.backgroundColor!=='rgba(0,0,0,0)') {
      ctx.fillStyle=this.backgroundColor;
      ctx.fillRect(-w/2,-h/2,w,h);
    }
    if (this.borderWidth>0) {
      ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth;
      ctx.strokeRect(-w/2,-h/2,w,h);
    }
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    ctx.fillStyle=this.color; ctx.textAlign=this.align; ctx.textBaseline='middle';
    const lines=this.getLines(), lh=this.fontSize*1.2;
    const totalH=lines.length*lh, startY=-totalH/2+lh/2;
    lines.forEach((line,i) => ctx.fillText(line, 0, startY+i*lh));
    ctx.restore();
  }
}

class BubbleLayer extends BaseLayer {
  constructor(text='¡Hola!', x=0.5, y=0.5) {
    super('bubble', x, y, 0.3, 0.15);
    this.text=text; this.fontSize=18; this.fontFamily='Comic Sans MS, cursive';
    this.color='#000000'; this.backgroundColor='#ffffff';
    this.borderColor='#000000'; this.borderWidth=2;
    this.tail=true; this.style='conventional'; this.multipleCount=3;
    this.tailStart={x:-0.4, y:0.4}; this.tailEnd={x:-0.5, y:0.75};
    this.padding=14;
  }
  getLines() { return this.text.split('\n'); }
  measure(ctx) {
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    let maxW=0, totalH=0;
    this.getLines().forEach(l => { maxW=Math.max(maxW, ctx.measureText(l).width); totalH+=this.fontSize*1.2; });
    return {width:maxW, height:totalH};
  }
  resizeToFitText(canvas) {
    const ctx=canvas.getContext('2d');
    const {width,height}=this.measure(ctx);
    this.width=Math.max(0.05, (width+this.padding*2)/canvas.width);
    this.height=Math.max(0.04, (height+this.padding*2)/canvas.height);
  }
  getTailControlPoints(canvas) {
    if (!this.tail) return [];
    const cx=this.x, cy=this.y;
    return [
      {x: cx+this.tailStart.x*this.width, y: cy+this.tailStart.y*this.height, type:'start'},
      {x: cx+this.tailEnd.x*this.width,   y: cy+this.tailEnd.y*this.height,   type:'end'},
    ];
  }
  drawTail(ctx, sx,sy, ex,ey) {
    const angle=Math.atan2(ey-sy, ex-sx), bw=10;
    const perp={x:-Math.sin(angle), y:Math.cos(angle)};
    ctx.save();
    ctx.fillStyle=this.backgroundColor; ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth;
    ctx.beginPath();
    ctx.moveTo(sx+perp.x*bw/2, sy+perp.y*bw/2);
    ctx.lineTo(ex,ey);
    ctx.lineTo(sx-perp.x*bw/2, sy-perp.y*bw/2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx+perp.x*bw/2, sy+perp.y*bw/2);
    ctx.lineTo(sx-perp.x*bw/2, sy-perp.y*bw/2);
    ctx.strokeStyle=this.backgroundColor; ctx.lineWidth=this.borderWidth*2+2; ctx.stroke();
    ctx.restore();
  }
  draw(ctx, canvas) {
    const w=this.width*canvas.width, h=this.height*canvas.height;
    const px=this.x*canvas.width, py=this.y*canvas.height;
    const isSingle=this.text.trim().length===1;
    ctx.save(); ctx.translate(px,py);

    // Cuerpo
    if (this.style==='explosion') {
      const pts=12;
      ctx.beginPath();
      for(let i=0;i<pts;i++){
        const angle=(i/pts)*Math.PI*2;
        const r=(i%2===0?1:0.72);
        ctx.lineTo(Math.cos(angle)*r*w/2, Math.sin(angle)*r*h/2);
      }
      ctx.closePath();
    } else if (this.style==='thought') {
      // Forma de pensamiento: círculos solapados
      [[0,-h*0.18,w*0.3],[w*0.2,0,w*0.28],[-w*0.2,0,w*0.28],[0,h*0.18,w*0.26]].forEach(([cx,cy,r]) => {
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
        ctx.fillStyle=this.backgroundColor; ctx.fill();
        ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth; ctx.stroke();
      });
      ctx.fillStyle=this.backgroundColor;
      ctx.beginPath(); ctx.arc(0,0,Math.min(w,h)*0.22,0,Math.PI*2); ctx.fill();
      // Burbujitas de cola
      const tx=(this.tailEnd.x*w)*0.5, ty=(this.tailEnd.y*h)*0.7;
      [0.1,0.065,0.04].forEach((r,i) => {
        const f=1-i*0.3;
        ctx.beginPath(); ctx.arc(tx*f,ty*f,r*w,0,Math.PI*2);
        ctx.fillStyle=this.backgroundColor; ctx.fill();
        ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth; ctx.stroke();
      });
      ctx.restore(); return;
    } else {
      if (isSingle) {
        ctx.beginPath(); ctx.arc(0,0,Math.min(w,h)/2,0,Math.PI*2);
      } else {
        ctx.beginPath(); ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
      }
    }

    ctx.fillStyle=this.backgroundColor; ctx.fill();
    if (this.borderWidth>0) {
      ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth;
      if (this.style==='lowvoice') ctx.setLineDash([5,3]);
      ctx.stroke(); ctx.setLineDash([]);
    }

    // Cola
    if (this.tail && this.style!=='thought') {
      if (this.style==='multiple') {
        for(let i=0;i<this.multipleCount;i++) {
          const off=(i-(this.multipleCount-1)/2)*0.15;
          this.drawTail(ctx,(this.tailStart.x+off)*w,this.tailStart.y*h,(this.tailEnd.x+off)*w,this.tailEnd.y*h);
        }
      } else if (this.style==='radio') {
        ctx.save(); ctx.strokeStyle=this.borderColor; ctx.lineWidth=1;
        for(let r=6;r<=24;r+=6){ ctx.beginPath(); ctx.arc(this.tailEnd.x*w,this.tailEnd.y*h,r,0,Math.PI*2); ctx.stroke(); }
        ctx.restore();
      } else {
        this.drawTail(ctx,this.tailStart.x*w,this.tailStart.y*h,this.tailEnd.x*w,this.tailEnd.y*h);
      }
    }

    // Texto
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    ctx.fillStyle=this.color; ctx.textAlign='center'; ctx.textBaseline='middle';
    const lines=this.getLines(), lh=this.fontSize*1.2, totalH=lines.length*lh;
    lines.forEach((line,i) => ctx.fillText(line,0,-totalH/2+lh/2+i*lh));
    ctx.restore();
  }
}

/* ── HELPERS ── */
function edEl(id){ return document.getElementById(id); }

function edToast(msg,ms=2000){
  const t=edEl('edToast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),ms);
}

function edCoords(e){
  const rect=edCanvas.getBoundingClientRect();
  const sx=edCanvas.width/rect.width, sy=edCanvas.height/rect.height;
  const src=e.touches?e.touches[0]:e;
  return {
    px: Math.min(Math.max((src.clientX-rect.left)*sx,0),edCanvas.width),
    py: Math.min(Math.max((src.clientY-rect.top)*sy,0),edCanvas.height),
    nx: Math.min(Math.max((src.clientX-rect.left)/rect.width,0),1),
    ny: Math.min(Math.max((src.clientY-rect.top)/rect.height,0),1),
  };
}

/* ── CANVAS SIZE ── */
function edSetOrientation(o){
  edOrientation=o;
  edCanvas.width  = o==='vertical' ? ED_BASE : Math.round(ED_BASE*16/9);
  edCanvas.height = o==='vertical' ? Math.round(ED_BASE*16/9) : ED_BASE;
  edViewerCanvas.width=edCanvas.width; edViewerCanvas.height=edCanvas.height;
  edFitCanvas(); edRedraw(); edUpdateThumbnails();
}

function edFitCanvas(){
  const wrap=edEl('editorCanvasWrap'); if(!wrap) return;
  const maxW=wrap.clientWidth-16, maxH=wrap.clientHeight-16;
  const scale=Math.min(maxW/edCanvas.width, maxH/edCanvas.height, 1);
  edCanvas.style.width=Math.round(edCanvas.width*scale)+'px';
  edCanvas.style.height=Math.round(edCanvas.height*scale)+'px';
}

/* ── REDRAW ── */
function edRedraw(){
  if(!edCtx) return;
  const cw=edCanvas.width, ch=edCanvas.height;
  edCtx.clearRect(0,0,cw,ch);
  edCtx.fillStyle='#ffffff'; edCtx.fillRect(0,0,cw,ch);

  const page=edPages[edCurrentPage];
  if(!page) return;

  edLayers.forEach(l=>l.draw(edCtx,edCanvas));

  // Restaurar dibujo libre si existe
  if(page.drawData){
    const img=new Image();
    img.onload=()=>{ edCtx.drawImage(img,0,0); edDrawSel(); };
    img.src=page.drawData; return;
  }
  edDrawSel();
}

function edDrawSel(){
  if(edSelectedIdx<0||edSelectedIdx>=edLayers.length) return;
  const layer=edLayers[edSelectedIdx];
  const cw=edCanvas.width,ch=edCanvas.height;
  const x=layer.x*cw,y=layer.y*ch,w=layer.width*cw,h=layer.height*ch;

  edCtx.save();
  edCtx.strokeStyle='#ffaa55'; edCtx.lineWidth=2; edCtx.setLineDash([6,4]);
  edCtx.strokeRect(x-w/2,y-h/2,w,h); edCtx.setLineDash([]);

  // Handles de redimensionado (solo imagen)
  if(layer.type==='image'){
    edCtx.fillStyle='#ff4444';
    layer.getControlPoints().forEach(p=>{
      const px=p.x*cw,py=p.y*ch;
      edCtx.beginPath(); edCtx.arc(px,py,6,0,Math.PI*2); edCtx.fill();
      edCtx.strokeStyle='#fff'; edCtx.lineWidth=1; edCtx.stroke();
    });
  }
  // Cola de bocadillo
  if(layer.type==='bubble'){
    edCtx.fillStyle='#ff4444';
    layer.getTailControlPoints(edCanvas).forEach(p=>{
      const px=p.x*cw,py=p.y*ch;
      edCtx.beginPath(); edCtx.arc(px,py,7,0,Math.PI*2); edCtx.fill();
      edCtx.strokeStyle='#fff'; edCtx.lineWidth=1.5; edCtx.stroke();
    });
  }
  edCtx.restore();
}

/* ── THUMBNAILS ── */
function edUpdateThumbnails(){
  const strip=edEl('editorPageStrip'); if(!strip) return;
  strip.innerHTML='';
  edPages.forEach((page,idx)=>{
    const div=document.createElement('div');
    div.className='ed-page-thumb'+(idx===edCurrentPage?' active':'');
    const tc=document.createElement('canvas');
    tc.width=40; tc.height=54;
    const tctx=tc.getContext('2d');
    tctx.fillStyle='#fff'; tctx.fillRect(0,0,40,54);
    page.layers.forEach(l=>l.draw(tctx,tc));
    div.appendChild(tc);
    const n=document.createElement('span'); n.className='thumb-n';
    if(!page.layers.length) n.textContent=idx+1;
    div.appendChild(n);
    div.addEventListener('click',()=>edLoadPage(idx));
    strip.appendChild(div);
  });
  const addBtn=document.createElement('button');
  addBtn.className='ed-page-add'; addBtn.textContent='+';
  addBtn.addEventListener('click',edAddPage);
  strip.appendChild(addBtn);
  const active=strip.querySelector('.ed-page-thumb.active');
  if(active) active.scrollIntoView({behavior:'smooth',inline:'nearest'});
}

/* ── GESTIÓN PÁGINAS ── */
function edInitProject(meta){
  edPages=[{layers:[],drawData:null}]; edCurrentPage=0;
  edProjectMeta=meta||{title:'Mi proyecto',navMode:'horizontal'};
  edLoadPage(0); edUpdateThumbnails();
}
function edAddPage(){ edPages.push({layers:[],drawData:null}); edLoadPage(edPages.length-1); }
function edDeletePage(){
  if(edPages.length<=1){edToast('Crea otra página primero');return;}
  edPages.splice(edCurrentPage,1);
  edLoadPage(Math.min(edCurrentPage,edPages.length-1));
}
function edLoadPage(idx){
  edCurrentPage=idx;
  edLayers=edPages[idx].layers;
  edSelectedIdx=-1;
  edUpdatePropsPanel();
  edRedraw(); edUpdateThumbnails();
}

/* ── AÑADIR CAPAS ── */
function edAddImage(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const l=new ImageLayer(img);
      edLayers.push(l); edSelectedIdx=edLayers.length-1;
      edRedraw(); edUpdatePropsPanel(); edUpdateThumbnails();
      edShowPanel('edit'); edToast('Imagen añadida ✓');
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}
function edAddText(){
  const l=new TextLayer('Escribe aquí');
  l.resizeToFitText(edCanvas);
  edLayers.push(l); edSelectedIdx=edLayers.length-1;
  edRedraw(); edUpdatePropsPanel(); edUpdateThumbnails();
  edShowPanel('edit');
}
function edAddBubble(){
  const l=new BubbleLayer('Escribe aquí');
  l.resizeToFitText(edCanvas);
  edLayers.push(l); edSelectedIdx=edLayers.length-1;
  edRedraw(); edUpdatePropsPanel(); edUpdateThumbnails();
  edShowPanel('edit');
}
function edDeleteSelected(){
  if(edSelectedIdx<0){edToast('Selecciona un objeto');return;}
  edLayers.splice(edSelectedIdx,1); edSelectedIdx=-1;
  edRedraw(); edUpdatePropsPanel(); edUpdateThumbnails();
}

/* ── PANEL DE PROPIEDADES ── */
function edUpdatePropsPanel(){
  const info=edEl('edSelectedInfo'), fields=edEl('edPropFields');
  if(!info||!fields) return;
  if(edSelectedIdx<0||edSelectedIdx>=edLayers.length){
    info.textContent='Ningún objeto seleccionado'; fields.innerHTML=''; return;
  }
  const l=edLayers[edSelectedIdx];
  info.textContent=`${l.type} (${(l.x*100).toFixed(0)}%, ${(l.y*100).toFixed(0)}%)`;

  let html='';
  if(l.type==='text'||l.type==='bubble'){
    html+=`
    <div class="ed-prop-row"><label>Texto</label>
      <textarea id="pp-text">${l.text.replace(/</g,'&lt;')}</textarea></div>
    <div class="ed-prop-row"><label>Fuente</label>
      <select id="pp-font">
        <option value="Bangers" ${l.fontFamily==='Bangers'?'selected':''}>Bangers</option>
        <option value="Comic Sans MS, cursive" ${l.fontFamily==='Comic Sans MS, cursive'?'selected':''}>Comic Sans</option>
        <option value="Arial" ${l.fontFamily==='Arial'?'selected':''}>Arial</option>
        <option value="Verdana" ${l.fontFamily==='Verdana'?'selected':''}>Verdana</option>
      </select></div>
    <div class="ed-prop-row"><label>Tamaño</label>
      <input type="number" id="pp-fontsize" value="${l.fontSize}" min="8" max="120"></div>
    <div class="ed-prop-row"><label>Color texto</label>
      <input type="color" id="pp-color" value="${l.color}"></div>
    <div class="ed-prop-row"><label>Fondo</label>
      <input type="color" id="pp-bgcolor" value="${l.backgroundColor==='rgba(0,0,0,0)'?'#ffffff':l.backgroundColor}"></div>
    <div class="ed-prop-row"><label>Marco</label>
      <select id="pp-borderwidth">
        ${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${l.borderWidth===n?'selected':''}>${n===0?'Invisible':n+'px'}</option>`).join('')}
      </select></div>
    <div class="ed-prop-row"><label>Color marco</label>
      <input type="color" id="pp-bordercolor" value="${l.borderColor}"></div>`;
    if(l.type==='bubble'){
      html+=`
      <div class="ed-prop-row"><label>Estilo</label>
        <select id="pp-style">
          <option value="conventional" ${l.style==='conventional'?'selected':''}>Convencional</option>
          <option value="lowvoice" ${l.style==='lowvoice'?'selected':''}>Voz baja</option>
          <option value="multiple" ${l.style==='multiple'?'selected':''}>Varias voces</option>
          <option value="thought" ${l.style==='thought'?'selected':''}>Pensamiento</option>
          <option value="radio" ${l.style==='radio'?'selected':''}>Radio/Tele</option>
          <option value="explosion" ${l.style==='explosion'?'selected':''}>Explosión</option>
        </select></div>
      <div class="ed-prop-row" id="pp-multirow" ${l.style!=='multiple'?'style="display:none"':''}>
        <label>Nº voces</label>
        <input type="number" id="pp-multicount" value="${l.multipleCount||3}" min="1" max="5"></div>
      <div class="ed-prop-row"><label>Cola visible</label>
        <input type="checkbox" id="pp-tail" ${l.tail?'checked':''}></div>`;
    }
  } else if(l.type==='image'){
    html+=`<div class="ed-prop-row"><label>Rotación °</label>
      <input type="number" id="pp-rotation" value="${l.rotation}" min="-180" max="180"></div>`;
  }
  if(l.type!=='image'){
    html+=`<div class="ed-prop-row"><label>Rotación °</label>
      <input type="number" id="pp-rotation" value="${l.rotation}" min="-180" max="180"></div>`;
  }
  fields.innerHTML=html;

  // Mostrar/ocultar fila múltiple al cambiar estilo
  const styleSelect=edEl('pp-style');
  if(styleSelect) styleSelect.addEventListener('change',e=>{
    const row=edEl('pp-multirow');
    if(row) row.style.display=e.target.value==='multiple'?'flex':'none';
  });

  // Live update en todos los inputs
  fields.querySelectorAll('input,select,textarea').forEach(inp=>{
    inp.addEventListener('input',e=>{
      if(edSelectedIdx<0) return;
      const la=edLayers[edSelectedIdx], id=e.target.id;
      if(id==='pp-text')        { la.text=e.target.value; la.resizeToFitText(edCanvas); }
      else if(id==='pp-font')        la.fontFamily=e.target.value;
      else if(id==='pp-fontsize')    { la.fontSize=parseInt(e.target.value)||12; la.resizeToFitText(edCanvas); }
      else if(id==='pp-color')       la.color=e.target.value;
      else if(id==='pp-bgcolor')     la.backgroundColor=e.target.value;
      else if(id==='pp-bordercolor') la.borderColor=e.target.value;
      else if(id==='pp-borderwidth') la.borderWidth=parseInt(e.target.value);
      else if(id==='pp-style')       { la.style=e.target.value; la.resizeToFitText(edCanvas); }
      else if(id==='pp-multicount')  la.multipleCount=parseInt(e.target.value)||3;
      else if(id==='pp-tail')        la.tail=e.target.checked;
      else if(id==='pp-rotation')    la.rotation=parseInt(e.target.value)||0;
      edRedraw();
    });
  });
}

/* ── EVENTOS CANVAS ── */
function edOnStart(e){
  e.preventDefault();
  const c=edCoords(e);
  if(edDrawMode){ edStartPaint(e,c); return; }

  // Cola bocadillo seleccionado
  if(edSelectedIdx>=0&&edLayers[edSelectedIdx]?.type==='bubble'){
    const la=edLayers[edSelectedIdx];
    for(const p of la.getTailControlPoints(edCanvas)){
      const dist=Math.hypot(c.px-p.x*edCanvas.width, c.py-p.y*edCanvas.height);
      if(dist<15){ edIsTailDragging=true; edTailPointType=p.type; return; }
    }
  }
  // Resize
  if(edSelectedIdx>=0&&edLayers[edSelectedIdx]?.type==='image'){
    const la=edLayers[edSelectedIdx];
    for(const p of la.getControlPoints()){
      const dist=Math.hypot(c.nx-p.x, c.ny-p.y);
      if(dist<0.04){ edIsResizing=true; edResizeCorner=p.corner;
        edInitialSize={width:la.width,height:la.height,x:la.x,y:la.y}; return; }
    }
  }
  // Select
  let found=-1;
  for(let i=edLayers.length-1;i>=0;i--){ if(edLayers[i].contains(c.nx,c.ny)){found=i;break;} }
  if(found>=0){
    edSelectedIdx=found; edUpdatePropsPanel();
    edDragOffX=c.nx-edLayers[found].x; edDragOffY=c.ny-edLayers[found].y;
    edIsDragging=true;
  } else { edSelectedIdx=-1; edUpdatePropsPanel(); }
  edRedraw();
}

function edOnMove(e){
  e.preventDefault();
  const c=edCoords(e);
  if(edDrawMode&&edPainting){ edContinuePaint(e,c); return; }
  if(edIsTailDragging&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const dx=c.nx-la.x, dy=c.ny-la.y;
    if(edTailPointType==='start'){ la.tailStart.x=dx/la.width; la.tailStart.y=dy/la.height; }
    else { la.tailEnd.x=dx/la.width; la.tailEnd.y=dy/la.height; }
    edRedraw(); return;
  }
  if(edIsResizing&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx], asp=edInitialSize.height/edInitialSize.width;
    const dx=c.nx-edInitialSize.x;
    let nw = edResizeCorner==='tl'||edResizeCorner==='bl' ? edInitialSize.width-dx : edInitialSize.width+dx;
    if(nw>0.02){ la.width=nw; la.height=nw*asp; }
    edRedraw(); return;
  }
  if(!edIsDragging||edSelectedIdx<0) return;
  const la=edLayers[edSelectedIdx];
  la.x=Math.min(Math.max(c.nx-edDragOffX, la.width/2), 1-la.width/2);
  la.y=Math.min(Math.max(c.ny-edDragOffY, la.height/2), 1-la.height/2);
  edRedraw(); edUpdatePropsPanel();
}

function edOnEnd(e){
  if(edPainting){ edPainting=false; edSaveDrawData(); }
  edIsDragging=false; edIsResizing=false; edIsTailDragging=false;
}

/* ── DIBUJO LIBRE ── */
function edStartPaint(e,c){
  edPainting=true;
  edCtx.beginPath();
  if(edEraserMode) edCtx.globalCompositeOperation='destination-out';
  else { edCtx.globalCompositeOperation='source-over'; edCtx.fillStyle=edDrawColor; }
  edCtx.arc(c.px,c.py,edDrawSize/2,0,Math.PI*2); edCtx.fill();
  edCtx.globalCompositeOperation='source-over';
  edLastPX=c.px; edLastPY=c.py;
  edMoveBrushCursor(e);
}
function edContinuePaint(e,c){
  edCtx.beginPath();
  edCtx.moveTo(edLastPX,edLastPY); edCtx.lineTo(c.px,c.py);
  if(edEraserMode){ edCtx.globalCompositeOperation='destination-out'; edCtx.strokeStyle='rgba(0,0,0,1)'; }
  else { edCtx.globalCompositeOperation='source-over'; edCtx.strokeStyle=edDrawColor; }
  edCtx.lineWidth=edDrawSize; edCtx.lineCap='round'; edCtx.lineJoin='round'; edCtx.stroke();
  edCtx.globalCompositeOperation='source-over';
  edLastPX=c.px; edLastPY=c.py;
  edMoveBrushCursor(e);
}
function edSaveDrawData(){
  const page=edPages[edCurrentPage]; if(!page) return;
  page.drawData=edCanvas.toDataURL();
}
function edMoveBrushCursor(e){
  const src=e.touches?e.touches[0]:e, cur=edEl('edBrushCursor'); if(!cur) return;
  const sz=edDrawSize*2;
  cur.style.left=src.clientX+'px'; cur.style.top=src.clientY+'px';
  cur.style.width=sz+'px'; cur.style.height=sz+'px';
  cur.style.borderColor=edEraserMode?'rgba(255,255,255,.5)':edDrawColor;
}

/* ── NAVEGACIÓN PANELES ── */
function edShowPanel(id){
  edActivePanel=id;
  document.querySelectorAll('.ed-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.ed-nav-item').forEach(n=>n.classList.remove('active'));
  const panel=edEl('panel-'+id), nav=edEl('nav-'+id);
  if(panel) panel.classList.add('active');
  if(nav) nav.classList.add('active');

  // Modo dibujo
  edDrawMode=id==='draw'||id==='eraser';
  edEraserMode=id==='eraser';
  const cur=edEl('edBrushCursor');
  if(cur) cur.style.display=edDrawMode?'block':'none';
  if(edCanvas){
    edCanvas.className='';
    if(id==='draw') edCanvas.classList.add('tool-draw');
    else if(id==='eraser') edCanvas.classList.add('tool-eraser');
  }

  if(id==='edit') edUpdatePropsPanel();
}

/* ── GUARDAR / CARGAR ── */
function edSaveDraft(){
  edProjectMeta.title=edEl('edTitleInput')?.value.trim()||'Sin título';
  const data={
    meta: edProjectMeta,
    orientation: edOrientation,
    pages: edPages.map(p=>({
      drawData: p.drawData,
      layers: p.layers.map(l=>{
        if(l.type==='image') return {type:'image',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,src:l.src};
        if(l.type==='text')  return {type:'text',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth};
        if(l.type==='bubble') return {type:'bubble',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,tail:l.tail,style:l.style,tailStart:l.tailStart,tailEnd:l.tailEnd,multipleCount:l.multipleCount};
      })
    }))
  };
  localStorage.setItem('cx_editor_draft',JSON.stringify(data));
  edToast('Borrador guardado ✓');
}

function edDownloadJSON(){
  edSaveDraft();
  const title=edProjectMeta.title||'proyecto';
  const data=localStorage.getItem('cx_editor_draft');
  const blob=new Blob([data],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=title.replace(/\s+/g,'_')+'.json'; a.click();
}

function edLoadFromJSON(file){
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      edProjectMeta=data.meta||{title:'Proyecto',navMode:'horizontal'};
      if(edEl('edTitleInput')) edEl('edTitleInput').value=edProjectMeta.title;
      edPages=(data.pages||[]).map(pd=>({
        drawData:pd.drawData||null,
        layers:(pd.layers||[]).map(d=>{
          if(d.type==='image'){
            const img=new Image(); img.src=d.src;
            const l=new ImageLayer(img,d.x,d.y,d.width);
            l.height=d.height; l.rotation=d.rotation||0; return l;
          }
          if(d.type==='text'){
            const l=new TextLayer(d.text,d.x,d.y);
            Object.assign(l,d); return l;
          }
          if(d.type==='bubble'){
            const l=new BubbleLayer(d.text,d.x,d.y);
            Object.assign(l,d); return l;
          }
        }).filter(Boolean)
      }));
      if(!edPages.length) edPages.push({layers:[],drawData:null});
      edSetOrientation(data.orientation||'vertical');
      edLoadPage(0); edToast('Proyecto cargado ✓');
    }catch(err){ edToast('Error al cargar el archivo'); }
  };
  reader.readAsText(file);
}

/* ── VISOR ── */
let edViewerIdx=0;
function edOpenViewer(){
  if(!edPages.length) return;
  edViewerIdx=edCurrentPage;
  edUpdateViewer();
  edEl('editorViewer').classList.add('open');
  edEl('viewerCanvas').addEventListener('touchstart',edViewerSwipeStart,{passive:false});
  edEl('viewerCanvas').addEventListener('touchend',edViewerSwipeEnd,{passive:false});
}
function edCloseViewer(){
  edEl('editorViewer').classList.remove('open');
  edEl('viewerCanvas').removeEventListener('touchstart',edViewerSwipeStart);
  edEl('viewerCanvas').removeEventListener('touchend',edViewerSwipeEnd);
}
function edUpdateViewer(){
  const page=edPages[edViewerIdx]; if(!page) return;
  edViewerCanvas.width=edCanvas.width; edViewerCanvas.height=edCanvas.height;
  edViewerCtx.fillStyle='#fff'; edViewerCtx.fillRect(0,0,edViewerCanvas.width,edViewerCanvas.height);
  page.layers.forEach(l=>l.draw(edViewerCtx,edViewerCanvas));
  if(page.drawData){ const img=new Image(); img.onload=()=>edViewerCtx.drawImage(img,0,0); img.src=page.drawData; }
  edEl('viewerCounter').textContent=`${edViewerIdx+1} / ${edPages.length}`;
}
function edViewerSwipeStart(e){ edTouchStartX=e.touches[0].clientX; }
function edViewerSwipeEnd(e){
  const dx=e.changedTouches[0].clientX-edTouchStartX;
  if(Math.abs(dx)>50){
    if(dx>0&&edViewerIdx>0) edViewerIdx--;
    else if(dx<0&&edViewerIdx<edPages.length-1) edViewerIdx++;
    edUpdateViewer();
  }
}

/* ── PUBLICAR ── */
function edPublish(){
  if(!Auth||!Auth.isLogged()){edToast('Inicia sesión para publicar');return;}
  const title=edEl('edTitleInput')?.value.trim();
  if(!title){edToast('Ponle un título a la obra');return;}
  edProjectMeta.title=title;
  const orig=edCurrentPage, pngs=[];
  function exportNext(i){
    if(i>=edPages.length){doPublish(pngs);return;}
    edLoadPage(i);
    requestAnimationFrame(()=>{pngs.push(edCanvas.toDataURL('image/jpeg',0.85)); exportNext(i+1);});
  }
  exportNext(0);
  function doPublish(pngs){
    edLoadPage(orig);
    const user=Auth.currentUser();
    const comic={
      id:'comic_'+Date.now(), userId:user.id, username:user.username,
      title:edProjectMeta.title, desc:'', genre:'',
      navMode:edProjectMeta.navMode||'horizontal',
      panels:pngs.map((dataUrl,i)=>({id:'panel_'+i,dataUrl,orientation:edPages[i].orientation||'v'})),
      published:true, approved:false, createdAt:new Date().toISOString(),
    };
    if(typeof ComicStore!=='undefined') ComicStore.save(comic);
    edToast('¡Enviada a revisión! ✓',3000);
    setTimeout(()=>Router.go('home'),1500);
  }
}

/* ── MODAL NUEVO PROYECTO ── */
function edOpenNewModal(){
  const m=edEl('edNewModal'); if(m) m.classList.add('open');
}
function edCloseNewModal(){ edEl('edNewModal')?.classList.remove('open'); }

/* ── INIT SPA ── */
function EditorView_init(){
  edCanvas     = edEl('editorCanvas');
  edViewerCanvas= edEl('viewerCanvas');
  if(!edCanvas||!edViewerCanvas) return;
  edCtx        = edCanvas.getContext('2d');
  edViewerCtx  = edViewerCanvas.getContext('2d');

  // Restaurar borrador
  const saved=localStorage.getItem('cx_editor_draft');
  if(saved){
    try{
      const data=JSON.parse(saved);
      edProjectMeta=data.meta||{title:'Mi proyecto',navMode:'horizontal'};
      if(edEl('edTitleInput')) edEl('edTitleInput').value=edProjectMeta.title;
      edOrientation=data.orientation||'vertical';
      edPages=(data.pages||[]).map(pd=>({
        drawData:pd.drawData||null,
        layers:(pd.layers||[]).map(d=>{
          if(d.type==='text'){const l=new TextLayer(d.text,d.x,d.y); Object.assign(l,d); return l;}
          if(d.type==='bubble'){const l=new BubbleLayer(d.text,d.x,d.y); Object.assign(l,d); return l;}
          if(d.type==='image'){
            const img=new Image(); img.src=d.src;
            const l=new ImageLayer(img,d.x,d.y,d.width); l.height=d.height; l.rotation=d.rotation||0; return l;
          }
        }).filter(Boolean)
      }));
    }catch(e){}
  }
  if(!edPages.length) edPages.push({layers:[],drawData:null});
  edLayers=edPages[0].layers; edCurrentPage=0;

  edSetOrientation(edOrientation);
  edShowPanel('pages');

  // ── CANVAS EVENTOS ──
  edCanvas.addEventListener('pointerdown', edOnStart, {passive:false});
  edCanvas.addEventListener('pointermove', edOnMove,  {passive:false});
  edCanvas.addEventListener('pointerup',   edOnEnd);
  edCanvas.addEventListener('pointerleave',edOnEnd);
  edCanvas.addEventListener('touchstart',  edOnStart, {passive:false});
  edCanvas.addEventListener('touchmove',   edOnMove,  {passive:false});
  edCanvas.addEventListener('touchend',    edOnEnd);

  // ── NAV ──
  ['pages','add','edit','draw','eraser','view'].forEach(id=>{
    edEl('nav-'+id)?.addEventListener('click',()=>edShowPanel(id));
  });

  // ── PÁGINAS ──
  edEl('edAddPageBtn')?.addEventListener('click',edAddPage);
  edEl('edDeletePageBtn')?.addEventListener('click',edDeletePage);
  edEl('edOrientSelect')?.addEventListener('change',e=>edSetOrientation(e.target.value));

  // ── AÑADIR OBJETOS ──
  edEl('edAddImgBtn')?.addEventListener('click',()=>edEl('edFileGallery').click());
  edEl('edAddCamBtn')?.addEventListener('click',()=>edEl('edFileCapture').click());
  edEl('edAddTextBtn')?.addEventListener('click',edAddText);
  edEl('edAddBubbleBtn')?.addEventListener('click',edAddBubble);
  edEl('edFileGallery')?.addEventListener('change',e=>{edAddImage(e.target.files[0]);e.target.value='';});
  edEl('edFileCapture')?.addEventListener('change',e=>{edAddImage(e.target.files[0]);e.target.value='';});

  // ── EDITAR ──
  edEl('edDeleteSelBtn')?.addEventListener('click',edDeleteSelected);

  // ── DIBUJO ──
  edEl('edDrawColorInput')?.addEventListener('input',e=>{edDrawColor=e.target.value;});
  edEl('edDrawSizeInput')?.addEventListener('input',e=>{
    edDrawSize=+e.target.value;
    const lbl=edEl('edDrawSizeVal'); if(lbl) lbl.textContent=e.target.value+'px';
  });
  edEl('edEraserSizeInput')?.addEventListener('input',e=>{
    edDrawSize=+e.target.value;
    const lbl=edEl('edEraserSizeVal'); if(lbl) lbl.textContent=e.target.value+'px';
  });

  // ── VER ──
  edEl('edViewerBtn')?.addEventListener('click',edOpenViewer);
  edEl('edNewProjectBtn')?.addEventListener('click',edOpenNewModal);
  edEl('edSaveJsonBtn')?.addEventListener('click',edDownloadJSON);
  edEl('edLoadJsonBtn')?.addEventListener('click',()=>edEl('edLoadFile').click());
  edEl('edLoadFile')?.addEventListener('change',e=>{edLoadFromJSON(e.target.files[0]);e.target.value='';});

  // ── TOPBAR ──
  edEl('edBackBtn')?.addEventListener('click',()=>Router.go('home'));
  edEl('edSaveBtn')?.addEventListener('click',edSaveDraft);
  edEl('edPublishBtn')?.addEventListener('click',edPublish);

  // ── VISOR ──
  edEl('viewerClose')?.addEventListener('click',edCloseViewer);
  edEl('viewerPrev')?.addEventListener('click',()=>{if(edViewerIdx>0){edViewerIdx--;edUpdateViewer();}});
  edEl('viewerNext')?.addEventListener('click',()=>{if(edViewerIdx<edPages.length-1){edViewerIdx++;edUpdateViewer();}});

  // ── MODAL NUEVO PROYECTO ──
  edEl('edNewCancel')?.addEventListener('click',()=>{
    edCloseNewModal();
    if(!edPages.length) edInitProject({title:'Mi proyecto',navMode:'horizontal'});
  });
  edEl('edNewCreate')?.addEventListener('click',()=>{
    const title=edEl('edNewTitle')?.value||'Mi proyecto';
    const navMode=edEl('edNewNavMode')?.value||'horizontal';
    edInitProject({title,navMode});
    if(edEl('edTitleInput')) edEl('edTitleInput').value=title;
    edCloseNewModal(); localStorage.removeItem('cx_editor_draft');
  });

  window.addEventListener('resize',()=>{edFitCanvas();});
}
