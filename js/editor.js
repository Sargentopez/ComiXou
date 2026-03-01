/* ============================================================
   editor.js — ComiXow v5.4
   Motor canvas fiel al referEditor.
   Menú tipo page-nav, botón flotante al minimizar.
   ============================================================ */

/* ── ESTADO ── */
let edCanvas, edCtx, edViewerCanvas, edViewerCtx;
let edPages = [], edCurrentPage = 0, edLayers = [];
let edSelectedIdx = -1;
let edIsDragging = false, edIsResizing = false, edIsTailDragging = false, edIsRotating = false;
let edTailPointType = null, edResizeCorner = null, edTailVoiceIdx = 0;
let edDragOffX = 0, edDragOffY = 0, edInitialSize = {};
let edRotateStartAngle = 0;  // ángulo inicial al empezar rotación
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
let edPinching = false, edPinchDist0 = 0, edPinchAngle0 = 0, edPinchScale0 = {w:0,h:0,x:0,y:0};
let edPanelUserClosed = false;  // true = usuario cerró panel con ✓, no reabrir al seleccionar
let edZoom = 1.0;               // LEGACY — no usado, ver edCamera
// ── Cámara del editor (patrón Figma/tldraw) ──
// x,y = traslación del canvas (donde aparece el origen del workspace en pantalla)
// z   = escala (1 = lienzo ocupa el viewport)
const edCamera = { x: 0, y: 0, z: 1 };
let _edLastTapTime = 0, _edLastTapIdx = -1; // para detectar doble tap
let _edTouchMoved = false; // true si el dedo se movió durante el toque actual
let edHistory = [], edHistoryIdx = -1;
const ED_MAX_HISTORY = 10;
let edViewerTextStep = 0;  // nº de textos revelados en modo secuencial

// ── Dimensiones del lienzo (la página reproducible) ──
// Ratio 6:13 (≈2.167) cabe sin corte en OPPO A38 (720×1612, útil ~720×1588)
const ED_PAGE_W  = 360;   // ancho del lienzo en orientación vertical
const ED_PAGE_H  = 780;   // alto  del lienzo en orientación vertical (ratio 6:13)
// ── Canvas de trabajo: 5× ancho y 3× alto del lienzo vertical ──
const ED_CANVAS_W = ED_PAGE_W * 5;  // 1800
const ED_CANVAS_H = ED_PAGE_H * 3;  // 2340

const $ = id => document.getElementById(id);

// Dimensiones del lienzo según orientación de la hoja actual (o global si no definida)
function _edCurrentOrientation(){
  // Si estamos renderizando para el visor (edOrientation ya seteado temporalmente),
  // usar edOrientation directamente — NO leer de la página del editor
  return edOrientation;
}
function edPageW(){ return _edCurrentOrientation() === 'vertical' ? ED_PAGE_W : ED_PAGE_H; }
function edPageH(){ return _edCurrentOrientation() === 'vertical' ? ED_PAGE_H : ED_PAGE_W; }
// Offset del lienzo dentro del workspace (centrado)
function edMarginX(){ return (ED_CANVAS_W - edPageW()) / 2; }
function edMarginY(){ return (ED_CANVAS_H - edPageH()) / 2; }

// ── Conversiones de coordenadas ──
// Pantalla → workspace interno
function edScreenToWorld(sx, sy){
  return { x: (sx - edCamera.x) / edCamera.z,
           y: (sy - edCamera.y) / edCamera.z };
}
// Workspace → pantalla
function edWorldToScreen(wx, wy){
  return { x: wx * edCamera.z + edCamera.x,
           y: wy * edCamera.z + edCamera.y };
}
// Zoom hacia un punto de pantalla (sx,sy), con factor multiplicativo
function edZoomAt(sx, sy, factor){
  // Límites
  const newZ = Math.min(Math.max(edCamera.z * factor, 0.05), 8);
  const fReal = newZ / edCamera.z;
  edCamera.x = sx - (sx - edCamera.x) * fReal;
  edCamera.y = sy - (sy - edCamera.y) * fReal;
  edCamera.z = newZ;
}
// ¿Necesita scrollbars? (el lienzo no cabe entero en el viewport)
function edNeedsScroll(){
  if(!edCanvas) return { h: false, v: false };
  const availW = edCanvas.width, availH = edCanvas.height;
  const pw = edPageW(), ph = edPageH();
  const lienzoPxW = pw * edCamera.z;
  const lienzoPxH = ph * edCamera.z;
  return { h: lienzoPxW > availW + 1, v: lienzoPxH > availH + 1 };
}

/* ══════════════════════════════════════════
   CLASES (motor referEditor)
   ══════════════════════════════════════════ */

class BaseLayer {
  constructor(type,x=0.5,y=0.5,width=0.3,height=0.2){
    this.type=type;this.x=x;this.y=y;this.width=width;this.height=height;this.rotation=0;
  }
  contains(px,py){
    const rot = (this.rotation||0)*Math.PI/180;
    if(rot === 0){
      return px>=this.x-this.width/2&&px<=this.x+this.width/2&&
             py>=this.y-this.height/2&&py<=this.y+this.height/2;
    }
    // Transformar punto al espacio local (sin rotación) del objeto
    const pw=edPageW(), ph=edPageH();
    const dx=(px-this.x)*pw, dy=(py-this.y)*ph;
    const lx=( dx*Math.cos(-rot)-dy*Math.sin(-rot))/pw;
    const ly=( dx*Math.sin(-rot)+dy*Math.cos(-rot))/ph;
    return Math.abs(lx)<=this.width/2 && Math.abs(ly)<=this.height/2;
  }
  getControlPoints(){
    // Todos los tipos soportan resize y rotate
    const hw=this.width/2, hh=this.height/2;
    const rot = (this.rotation||0)*Math.PI/180;
    const pw=edPageW(), ph=edPageH();
    // Función para rotar un punto normalizado alrededor del centro
    const rp = (dx,dy) => {
      const rx=dx*pw, ry=dy*ph;
      return { x: this.x+(rx*Math.cos(rot)-ry*Math.sin(rot))/pw,
               y: this.y+(rx*Math.sin(rot)+ry*Math.cos(rot))/ph };
    };
    const tl=rp(-hw,-hh), tr=rp(hw,-hh), bl=rp(-hw,hh), br=rp(hw,hh);
    const ml=rp(-hw,0),  mr=rp(hw,0),  mt=rp(0,-hh), mb=rp(0,hh);
    // Handle de rotación: 28px por encima del centro-top (en px físicos → normalizado)
    const rotOffset = 28/ph;
    const rotHandle = rp(0,-hh-rotOffset);
    return[
      {...tl,corner:'tl'}, {...tr,corner:'tr'},
      {...bl,corner:'bl'}, {...br,corner:'br'},
      {...ml,corner:'ml'}, {...mr,corner:'mr'},
      {...mt,corner:'mt'}, {...mb,corner:'mb'},
      {...rotHandle,corner:'rotate'},
    ];
  }
  resizeToFitText(){}
}

class ImageLayer extends BaseLayer {
  constructor(imgEl,x=0.5,y=0.5,width=0.4){
    super('image',x,y,width,0.3);
    // natRatio = naturalWidth/naturalHeight. height se deriva SIEMPRE en tiempo real.
    this.natRatio = 1;
    if(imgEl){
      this.img=imgEl; this.src=imgEl.src||'';
      if(imgEl.naturalWidth&&imgEl.naturalHeight){
        this.natRatio = imgEl.naturalWidth / imgEl.naturalHeight;
      }
    } else {
      this.img=null; this.src='';
    }
    this._syncHeight();
  }
  _syncHeight(){
    const pw=edPageW()||ED_PAGE_W, ph=edPageH()||ED_PAGE_H;
    this.height = (this.width / this.natRatio) * (pw / ph);
  }
  draw(ctx,can){
    if(!this.img || !this.img.complete || this.img.naturalWidth===0) return;
    const pw=edPageW(), ph=edPageH();
    const w=this.width*pw;
    // Altura siempre desde ratio natural — inmune a cambios de orientacion
    const h=w/this.natRatio;
    // Mantener this.height sincronizado para getControlPoints y edDrawSel
    this.height=h/ph;
    const px=edMarginX()+this.x*pw, py=edMarginY()+this.y*ph;
    ctx.save();
    ctx.globalAlpha = this.opacity ?? 1;
    ctx.translate(px,py);ctx.rotate(this.rotation*Math.PI/180);
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
    const pw=edPageW(), ph=edPageH();
    const ctx=can.getContext('2d'),{width,height}=this.measure(ctx);
    this.width=Math.max(0.05,(width+this.padding*2)/pw);
    this.height=Math.max(0.05,(height+this.padding*2)/ph);
  }
  draw(ctx,can){
    const pw=edPageW(), ph=edPageH();
    const w=this.width*pw, h=this.height*ph;
    const px=edMarginX()+this.x*pw, py=edMarginY()+this.y*ph;
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
    this.tail=true;
    this.tailStart={x:-0.4,y:0.4};this.tailEnd={x:-0.4,y:0.6}; // voz 0 (legacy)
    this.tailStarts=[{x:-0.4,y:0.4}];this.tailEnds=[{x:-0.4,y:0.6}]; // arrays por voz
    this.style='conventional';this.voiceCount=1;this.padding=15;
  }
  getLines(){return this.text.split('\n');}
  measure(ctx){
    ctx.font=`${this.fontSize}px ${this.fontFamily}`;
    let mw=0,th=0;
    this.getLines().forEach(l=>{mw=Math.max(mw,ctx.measureText(l).width);th+=this.fontSize*1.2;});
    return{width:mw,height:th};
  }
  resizeToFitText(can){
    const pw=edPageW(), ph=edPageH();
    const ctx=can.getContext('2d'),{width,height}=this.measure(ctx);
    this.width=Math.max(0.05,(width+this.padding*2)/pw);
    this.height=Math.max(0.05,(height+this.padding*2)/ph);
  }
  getTailControlPoints(){
    if(!this.tail)return[];
    const vc=this.voiceCount||1;
    // Asegurar que los arrays tienen suficientes entradas
    if(!this.tailStarts)this.tailStarts=[{...this.tailStart}];
    if(!this.tailEnds)  this.tailEnds  =[{...this.tailEnd}];
    while(this.tailStarts.length<vc){
      const off=(this.tailStarts.length-(vc-1)/2)*0.25;
      this.tailStarts.push({x:this.tailStart.x+off,y:this.tailStart.y});
      this.tailEnds.push(  {x:this.tailEnd.x+off,  y:this.tailEnd.y});
    }
    const pts=[];
    for(let v=0;v<vc;v++){
      const s=this.tailStarts[v],e=this.tailEnds[v];
      pts.push({x:this.x+s.x*this.width,y:this.y+s.y*this.height,type:'start',voice:v});
      pts.push({x:this.x+e.x*this.width,y:this.y+e.y*this.height,type:'end',  voice:v});
    }
    return pts;
  }
  drawTail(ctx,sx,sy,ex,ey){
    ctx.save();
    ctx.fillStyle=this.backgroundColor;ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;
    const angle=Math.atan2(ey-sy,ex-sx),bw=10;
    const perp={x:-Math.sin(angle),y:Math.cos(angle)};
    const dir={x:Math.cos(angle),y:Math.sin(angle)};
    const left={x:sx+perp.x*bw/2,y:sy+perp.y*bw/2};
    const right={x:sx-perp.x*bw/2,y:sy-perp.y*bw/2};
    ctx.beginPath();ctx.moveTo(left.x,left.y);ctx.lineTo(ex,ey);ctx.lineTo(right.x,right.y);
    ctx.closePath();ctx.fill();ctx.stroke();
    // Línea blanca: misma posición que left→right, extendida a lo largo de perp
    // para tapar completamente los vértices donde el stroke negro sobresale
    const extra=1;
    const extL={x:left.x +perp.x*extra, y:left.y +perp.y*extra};
    const extR={x:right.x-perp.x*extra, y:right.y-perp.y*extra};
    ctx.beginPath();ctx.moveTo(extL.x,extL.y);ctx.lineTo(extR.x,extR.y);
    ctx.strokeStyle=this.backgroundColor;ctx.lineWidth=this.borderWidth*2+2;
    ctx.lineCap='round';ctx.stroke();ctx.lineCap='butt';
    ctx.restore();
  }
  draw(ctx,can){
    const pw=edPageW(), ph=edPageH();
    const w=this.width*pw, h=this.height*ph;
    const pos={x:edMarginX()+this.x*pw, y:edMarginY()+this.y*ph};
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
      if(this.style==='radio'){
        const ex=this.tailEnd.x*w,ey=this.tailEnd.y*h;
        ctx.save();ctx.strokeStyle=this.borderColor;ctx.lineWidth=1;
        for(let r=5;r<25;r+=5){ctx.beginPath();ctx.arc(ex,ey,r,0,Math.PI*2);ctx.stroke();}
        ctx.restore();
      }else{
        const vc=this.voiceCount||1;
        if(!this.tailStarts)this.tailStarts=[{...this.tailStart}];
        if(!this.tailEnds)  this.tailEnds  =[{...this.tailEnd}];
        for(let v=0;v<vc;v++){
          const s=this.tailStarts[v]||this.tailStarts[0];
          const e=this.tailEnds[v]  ||this.tailEnds[0];
          this.drawTail(ctx,s.x*w,s.y*h,e.x*w,e.y*h);
        }
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
function edSetOrientation(o, persist=true){
  const prevOrientation = edOrientation;
  edOrientation=o;
  // Persistir en la hoja actual (no al inicializar el editor)
  if(persist && edPages[edCurrentPage]) edPages[edCurrentPage].orientation=o;
  // height de ImageLayer se recalcula automaticamente en draw() via natRatio — no hace falta nada aqui
  // El visor usa solo el lienzo
  if(edViewerCanvas){ edViewerCanvas.width=edPageW(); edViewerCanvas.height=edPageH(); }
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    edFitCanvas(true); // true = resetear camara al lienzo
    edRedraw();
  }));
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
                    'tail','tailStart','tailEnd','tailStarts','tailEnds','style','voiceCount']){
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
        img.onload  = () => {
          l.img = img;
          // Migración height si es necesario
          const pw=edPageW()||ED_PAGE_W, ph=edPageH()||ED_PAGE_H;
          const expectedH=l.width*(img.naturalHeight/img.naturalWidth)*(pw/ph);
          if(Math.abs((l.height/l.width)/(expectedH/l.width)-1)>0.15){
            l.height=Math.min(expectedH,0.9);
          }
          resolve();
        };
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

/* ── edFitCanvas ──────────────────────────────────────────────────
   Ajusta las barras de UI y el tamaño del canvas DOM al viewport.
   El canvas ocupa SIEMPRE todo el área disponible (sin scroll CSS).
   La cámara (edCamera) controla qué parte del workspace se ve.
   ──────────────────────────────────────────────────────────────── */
function edFitCanvas(resetCamera){
  if(!edCanvas) return;
  const topbar=$('edTopbar'), menu=$('edMenuBar'), opts=$('edOptionsPanel');

  const topH  = (!edMinimized && topbar)  ? topbar.getBoundingClientRect().height  : 0;
  const menuH = (!edMinimized && menu)    ? menu.getBoundingClientRect().height    : 0;
  const optsH = (opts && opts.classList.contains('open')) ? opts.getBoundingClientRect().height : 0;
  if(menu && !edMinimized) menu.style.top = topH + 'px';
  if(opts) opts.style.top = (topH + menuH) + 'px';
  const totalBarsH = topH + menuH + optsH;

  const availW = window.innerWidth;
  const availH = window.innerHeight - totalBarsH;

  const newW = Math.round(availW);
  const newH = Math.round(availH);

  // Solo redimensionar si cambió el tamaño — asignar canvas.width SIEMPRE
  // resetea el contexto 2D aunque sea el mismo valor, borrando el contenido
  const _sizeChanged = edCanvas.width !== newW || edCanvas.height !== newH;
  if(_sizeChanged){
    edCanvas.width  = newW;
    edCanvas.height = newH;
    // Si el tamaño cambió notablemente, forzar reset de cámara para evitar deformaciones
    if(Math.abs(edCanvas.width - newW) > 5 || Math.abs(edCanvas.height - newH) > 5)
      resetCamera = true;
  }
  edCanvas.style.width  = newW + 'px';
  edCanvas.style.height = newH + 'px';
  edCanvas.style.position = 'absolute';
  edCanvas.style.left = '0';
  edCanvas.style.top  = totalBarsH + 'px';
  edCanvas.style.margin = '0';

  if(resetCamera){
    _edCameraReset();
  }
  _edScrollbarsUpdate();
  // Siempre redibujar tras ajustar el canvas
  edRedraw();
}

/* ── Resetea la cámara para que el LIENZO ocupe el viewport centrado ── */
function _edCameraReset(){
  const pw = edPageW(), ph = edPageH();
  const availW = edCanvas.width, availH = edCanvas.height;
  const scaleW = availW / pw;
  const scaleH = availH / ph;
  const z = Math.min(scaleW, scaleH);
  // Posición: el centro del lienzo (en workspace) queda en el centro de pantalla
  // centro_workspace_x = edMarginX + pw/2
  // pantalla_x = centro_workspace_x * z + camera.x = availW/2
  // => camera.x = availW/2 - (edMarginX + pw/2) * z
  edCamera.z = z;
  edCamera.x = availW/2  - (edMarginX() + pw/2) * z;
  edCamera.y = availH/2  - (edMarginY() + ph/2) * z;
}

/* ══════════════════════════════════════════
   REDRAW
   ══════════════════════════════════════════ */
function edRedraw(){
  if(!edCtx || !edCanvas)return;
  const cw=edCanvas.width, ch=edCanvas.height;

  // Reset transform → limpiar todo el viewport
  edCtx.setTransform(1,0,0,1,0,0);
  edCtx.clearRect(0,0,cw,ch);
  // Fondo workspace (toda la pantalla)
  edCtx.fillStyle='#b0b0b0';
  edCtx.fillRect(0,0,cw,ch);

  // Aplicar cámara: escala + traslación
  edCtx.setTransform(edCamera.z, 0, 0, edCamera.z, edCamera.x, edCamera.y);

  const page=edPages[edCurrentPage];if(!page)return;

  // Lienzo blanco con sombra y esquinas redondeadas (solo fondo, sin clip)
  // Radio fijo en coordenadas workspace → proporcional al zoom automáticamente
  const _lr = 20; // ~20px en workspace = radio de esquina físicamente constante
  edCtx.shadowColor='rgba(0,0,0,0.35)';edCtx.shadowBlur=20/edCamera.z;
  edCtx.fillStyle='#ffffff';
  edCtx.beginPath();
  if(edCtx.roundRect){
    edCtx.roundRect(edMarginX(),edMarginY(),edPageW(),edPageH(),_lr);
  } else {
    const _x=edMarginX(),_y=edMarginY(),_w=edPageW(),_h=edPageH(),_r=_lr;
    edCtx.moveTo(_x+_r,_y);edCtx.lineTo(_x+_w-_r,_y);edCtx.arcTo(_x+_w,_y,_x+_w,_y+_r,_r);
    edCtx.lineTo(_x+_w,_y+_h-_r);edCtx.arcTo(_x+_w,_y+_h,_x+_w-_r,_y+_h,_r);
    edCtx.lineTo(_x+_r,_y+_h);edCtx.arcTo(_x,_y+_h,_x,_y+_h-_r,_r);
    edCtx.lineTo(_x,_y+_r);edCtx.arcTo(_x,_y,_x+_r,_y,_r);edCtx.closePath();
  }
  edCtx.fill();
  edCtx.shadowColor='transparent';edCtx.shadowBlur=0;
  // Sin clip: los objetos pueden sobresalir del lienzo (workspace visible)
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
    // Capturar el transform de cámara actual para usarlo en el onload asíncrono
    const _camZ=edCamera.z, _camX=edCamera.x, _camY=edCamera.y;
    const img=new Image();
    img.onload=()=>{
      // Restaurar transform de cámara (puede haberse reseteado por otro edRedraw)
      edCtx.setTransform(_camZ,0,0,_camZ,_camX,_camY);
      edCtx.drawImage(img,edMarginX(),edMarginY(),edPageW(),edPageH());
      edCtx.globalAlpha = _textGroupAlpha;
      _textLayers.forEach(l=>{ l.draw(edCtx,edCanvas); });
      edCtx.globalAlpha = 1;
      edDrawSel();
      // ── Borde azul del lienzo ──
      edCtx.save();
      edCtx.strokeStyle='#1a8cff';edCtx.lineWidth=1/edCamera.z;
      edCtx.strokeRect(edMarginX(),edMarginY(),edPageW(),edPageH());
      edCtx.restore();
      edCtx.setTransform(1,0,0,1,0,0);
      _edScrollbarsDraw();
    };
    img.src=page.drawData;return;
  }
  edCtx.globalAlpha = _textGroupAlpha;
  _textLayers.forEach(l=>{ l.draw(edCtx,edCanvas); });
  edCtx.globalAlpha = 1;
  edDrawSel();
  // ── Borde azul del lienzo: siempre encima, 1px en coords workspace ──
  edCtx.save();
  edCtx.strokeStyle = '#1a8cff';
  edCtx.lineWidth   = 1 / edCamera.z;   // 1px físico independiente del zoom
  edCtx.strokeRect(edMarginX(), edMarginY(), edPageW(), edPageH());
  edCtx.restore();
  // Restaurar transform para UI sobre el canvas (scrollbars)
  edCtx.setTransform(1,0,0,1,0,0);
  _edScrollbarsDraw();
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
  const pw=edPageW(), ph=edPageH();
  const cx=edMarginX()+la.x*pw, cy=edMarginY()+la.y*ph;
  const w=la.width*pw;
  const h=la.height*ph;
  const rot=(la.rotation||0)*Math.PI/180;
  const z=edCamera.z;
  // 1px físico independiente del zoom
  const lw=1/z;
  const hr=6/z;   // radio handles escala
  const hrRot=8/z; // radio handle rotación
  edCtx.save();
  // Transformar al espacio del objeto (centro + rotación)
  edCtx.translate(cx,cy);
  edCtx.rotate(rot);
  // Marco de selección — 1px físico
  edCtx.strokeStyle='#1a8cff';
  edCtx.lineWidth=lw;
  edCtx.setLineDash([5/z,3/z]);
  edCtx.strokeRect(-w/2,-h/2,w,h);
  edCtx.setLineDash([]);
  // Handles de escala y rotación — solo en PC (no táctil)
  if(la.type!=='bubble' && !edIsTouchDevice()){
    const corners=[
      [-w/2,-h/2],[ w/2,-h/2],[-w/2, h/2],[ w/2, h/2],
      [   0,-h/2],[   0, h/2],[-w/2,   0],[ w/2,   0],
    ];
    corners.forEach(([hx,hy])=>{
      edCtx.beginPath();edCtx.arc(hx,hy,hr,0,Math.PI*2);
      edCtx.fillStyle='#fff';edCtx.fill();
      edCtx.strokeStyle='#1a8cff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
    });
    // Handle de rotación: círculo con flecha encima del centro-top
    const rotY=-h/2-28/z;
    edCtx.beginPath();edCtx.moveTo(0,-h/2);edCtx.lineTo(0,rotY+hrRot);
    edCtx.strokeStyle='#1a8cff';edCtx.lineWidth=lw;edCtx.stroke();
    edCtx.beginPath();edCtx.arc(0,rotY,hrRot,0,Math.PI*2);
    edCtx.fillStyle='#1a8cff';edCtx.fill();
    edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
    edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;
    const ar=hrRot*0.55;
    edCtx.beginPath();edCtx.arc(0,rotY,ar,-Math.PI*0.9,Math.PI*0.5);
    edCtx.stroke();
    const ax=ar*Math.cos(Math.PI*0.5), ay=rotY+ar*Math.sin(Math.PI*0.5);
    edCtx.beginPath();
    edCtx.moveTo(ax,ay);edCtx.lineTo(ax-3/z,ay-5/z);
    edCtx.moveTo(ax,ay);edCtx.lineTo(ax+4/z,ay-3/z);
    edCtx.stroke();
  }
  // Cerrar el bloque rotado antes de dibujar los handles de cola
  edCtx.restore();
  // Handles cola bocadillo — en coordenadas de workspace absolutas (sin rotación)
  if(la.type==='bubble'){
    const tcp=la.getTailControlPoints();
    const byVoice={};
    tcp.forEach(p=>{ if(!byVoice[p.voice])byVoice[p.voice]={}; byVoice[p.voice][p.type]=p; });
    // Líneas guía entre start y end de cada voz
    Object.values(byVoice).forEach(v=>{
      if(!v.start||!v.end)return;
      const sx=edMarginX()+v.start.x*pw, sy=edMarginY()+v.start.y*ph;
      const ex=edMarginX()+v.end.x*pw,   ey=edMarginY()+v.end.y*ph;
      edCtx.beginPath();edCtx.moveTo(sx,sy);edCtx.lineTo(ex,ey);
      edCtx.strokeStyle='rgba(26,140,255,0.5)';edCtx.lineWidth=1.5/z;
      edCtx.setLineDash([5/z,3/z]);edCtx.stroke();edCtx.setLineDash([]);
    });
    // Handles
    const HR=6/z;
    tcp.forEach(p=>{
      const cpx=edMarginX()+p.x*pw, cpy=edMarginY()+p.y*ph;
      const isEnd=p.type==='end';
      edCtx.beginPath();edCtx.arc(cpx,cpy,HR,0,Math.PI*2);
      edCtx.fillStyle=isEnd?'#ff6600':'#1a8cff';edCtx.fill();
      edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
    });
  }
}

/* ══════════════════════════════════════════
   PÁGINAS
   ══════════════════════════════════════════ */
function edAddPage(){
  edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'immediate',orientation:edOrientation});
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
  // Aplicar orientación de esta hoja
  const _po = edPages[idx]?.orientation || 'vertical';
  if(_po !== edOrientation){
    edOrientation = _po;
    if(edViewerCanvas){ edViewerCanvas.width=edPageW(); edViewerCanvas.height=edPageH(); }
  }
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
      const pw=edPageW()||ED_PAGE_W, ph=edPageH()||ED_PAGE_H;
      const natW=img.naturalWidth||1, natH=img.naturalHeight||1;
      const w=0.7;
      // layer.height lo calcula el constructor como fracción de ph
      const layer=new ImageLayer(img,0.5,0.5,w);
      // Limitar: no superar 0.85 de la altura de página (fracción de ph)
      const maxH = 0.85;
      if(layer.height > maxH){
        layer.width  = layer.width  * (maxH/layer.height);
        layer.height = maxH;
      }
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
  const src = e.touches ? e.touches[0] : e;
  // Coordenadas de pantalla (el canvas cubre todo el viewport)
  const sx = src.clientX;
  const sy = src.clientY - parseFloat(edCanvas.style.top || 0);
  // Convertir pantalla → workspace
  const w = edScreenToWorld(sx, sy);
  // Convertir workspace → coordenadas de página (0-1)
  const pw = edPageW(), ph = edPageH();
  const nx = (w.x - edMarginX()) / pw;
  const ny = (w.y - edMarginY()) / ph;
  return { px: w.x, py: w.y, nx, ny };
}


/* ══════════════════════════════════════════
   PINCH-TO-ZOOM (2 dedos)
   ══════════════════════════════════════════ */
// Distancia entre 2 pointers del mapa _edActivePointers
function _pinchDist(pMap) {
  const pts = [...pMap.values()];
  const dx = pts[0].x - pts[1].x;
  const dy = pts[0].y - pts[1].y;
  return Math.hypot(dx, dy);
}
function _pinchAngle(pMap){
  const pts=[...pMap.values()];
  return Math.atan2(pts[1].y-pts[0].y, pts[1].x-pts[0].x);
}
function edPinchStart(e) {
  if (!window._edActivePointers || window._edActivePointers.size !== 2) return false;
  edPinching   = true;
  edPinchDist0  = _pinchDist(window._edActivePointers);
  edPinchAngle0 = _pinchAngle(window._edActivePointers);
  const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
  edPinchScale0 = la ? { w: la.width, h: la.height, rot: la.rotation||0 } : null;
  return true;
}
function edPinchMove(e) {
  if (!edPinching || !window._edActivePointers || window._edActivePointers.size < 2) return;
  const dist   = _pinchDist(window._edActivePointers);
  const angle  = _pinchAngle(window._edActivePointers);
  const ratio  = dist / Math.max(edPinchDist0, 1);
  const dAngle = (angle - edPinchAngle0) * 180 / Math.PI;
  const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
  if (la && edPinchScale0) {
    // Escala proporcional
    const newW = Math.min(Math.max(edPinchScale0.w * ratio, 0.04), 2.0);
    la.width  = newW;
    // Imagen: height se recalcula en draw() via natRatio — no sobreescribir
    if(la.type !== 'image'){
      const asp = edPinchScale0.h / edPinchScale0.w;
      la.height = newW * asp;
    }
    // Rotación por giro de dedos
    la.rotation = edPinchScale0.rot + dAngle;
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
  // Workspace coords del centro-superior del objeto
  const pw=edPageW(), ph=edPageH();
  const wx = edMarginX() + la.x * pw;
  const wy = edMarginY() + (la.y - la.height/2) * ph;
  // Convertir workspace → screen con la cámara
  const s = edWorldToScreen(wx, wy);
  const canvasTop = parseFloat(edCanvas.style.top || 0);
  return { cx: s.x, ty: s.y + canvasTop };
}

// Gear icon eliminado — se usa doble toque / long press
function edShowGearIcon(layerIdx){ /* eliminado */ }
function edUpdateGearPos(){ /* eliminado */ }
function edHideGearIcon(){ const b=document.getElementById('edGearIcon');if(b)b.remove(); }
function edHideContextMenu(){}
function edShowContextMenu(idx){}


/* ══════════════════════════════════════════
   SCROLLBARS VIRTUALES
   Dibujadas sobre el canvas en coordenadas de pantalla.
   Solo aparecen cuando el lienzo no cabe entero en el viewport.
   ══════════════════════════════════════════ */
const _edSB = { needH: false, needV: false };

function _edScrollbarsUpdate(){
  if(!edCanvas) return;
  const { h, v } = edNeedsScroll();
  _edSB.needH = h;
  _edSB.needV = v;
}

function _edScrollbarsDraw(){
  if(!edCtx || !edCanvas) return;
  const W = edCanvas.width, H = edCanvas.height;
  const pw = edPageW(), ph = edPageH();
  const thick = 6, margin = 2, radius = 3;

  // Rango del workspace en pantalla
  const wsLeft  = edCamera.x;
  const wsTop   = edCamera.y;
  const wsRight = wsLeft + ED_CANVAS_W * edCamera.z;
  const wsBot   = wsTop  + ED_CANVAS_H * edCamera.z;

  // Qué parte del workspace está visible
  const visLeft = -wsLeft;
  const visTop  = -wsTop;
  const visW    = W;
  const visH    = H;
  const wsW     = ED_CANVAS_W * edCamera.z;
  const wsH     = ED_CANVAS_H * edCamera.z;

  edCtx.save();
  edCtx.globalAlpha = 0.55;

  if(_edSB.needH && wsW > 0){
    const trackW = W - margin*2 - (thick+margin);
    const thumbW = Math.max(30, trackW * (visW / wsW));
    const thumbX = margin + trackW * (Math.max(0, visLeft) / wsW);
    edCtx.fillStyle = '#555';
    _edRoundRect(edCtx, Math.min(thumbX, W - thumbW - margin - thick - margin), H - thick - margin, thumbW, thick, radius);
    edCtx.fill();
  }

  if(_edSB.needV && wsH > 0){
    const trackH = H - margin*2 - (thick+margin);
    const thumbH = Math.max(30, trackH * (visH / wsH));
    const thumbY = margin + trackH * (Math.max(0, visTop) / wsH);
    edCtx.fillStyle = '#555';
    _edRoundRect(edCtx, W - thick - margin, Math.min(thumbY, H - thumbH - margin - thick - margin), thick, thumbH, radius);
    edCtx.fill();
  }

  edCtx.restore();
}

function _edRoundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

function edOnStart(e){
  // Ignorar clicks en elementos de UI (botones, menús, overlays, paneles)
  // Solo procesar si viene del canvas o de la zona de trabajo (editorShell)
  const tgt = e.target;
  // Ignorar si el click NO está dentro de editorShell (modales, header, etc.)
  if(!tgt.closest('#editorShell')) return;
  // Ignorar elementos de UI dentro del editor
  const isUI = tgt.closest('#edMenuBar')      ||
               tgt.closest('#edTopbar')       ||
               tgt.closest('#edOptionsPanel') ||
               tgt.closest('.ed-fulloverlay') ||
               tgt.closest('.ed-dropdown')    ||
               tgt.closest('#edGearIcon')     ||
               tgt.closest('#edBrushCursor')  ||
               tgt.closest('.ed-float-btn')   ||
               tgt.closest('#editorViewer')   ||
               tgt.closest('#edProjectModal');
  if(isUI) return;

  // No bloquear scroll en overlays (capas, hojas, etc.)
  if(e.cancelable && !e.target.closest('.ed-fulloverlay')){
    e.preventDefault();
  }
  _edTouchMoved = false; // resetear flag de movimiento
  // Rastrear pointers activos (para pinch con pointer events)
  if(!window._edActivePointers) window._edActivePointers = new Map();
  window._edActivePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  // 2 dedos → iniciar pinch-to-zoom
  if(window._edActivePointers.size === 2){
    edPinchStart(e);
    return;
  }
  if(window._edActivePointers.size > 1) return;
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
      if(Math.hypot(c.nx-p.x,c.ny-p.y)<0.05){edIsTailDragging=true;edTailPointType=p.type;edTailVoiceIdx=p.voice||0;return;}
    }
  }
  // Handles de control (resize + rotate): todos los tipos en PC; táctil usa pinch para resize
  const _la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
  if(_la && _la.type!=='bubble'){
    const _isT = e.pointerType==='touch';
    // Medir distancia en pixeles para hit uniform en ambos ejes
    const _pw=edPageW(), _ph=edPageH();
    const hitPx = _isT ? 22 : 14;
    for(const p of _la.getControlPoints()){
      const _dpx=(c.nx-p.x)*_pw, _dpy=(c.ny-p.y)*_ph;
      if(Math.hypot(_dpx,_dpy)<hitPx){
        if(p.corner==='rotate'){
          edIsRotating = true;
          edRotateStartAngle = Math.atan2(c.ny-_la.y, c.nx-_la.x)-(_la.rotation||0)*Math.PI/180;
          return;
        }
        if(!_isT){
          edIsResizing=true; edResizeCorner=p.corner;
          edInitialSize={width:_la.width,height:_la.height,
                         cx:_la.x, cy:_la.y, asp:_la.height/_la.width,
                         rot:(_la.rotation||0), ox:_la.x, oy:_la.y};
          return;
        }
      }
    }
  }
  // Seleccionar
  const _isTouch = e.pointerType === 'touch' || (e.touches && e.touches.length > 0);
  let found=-1;
  for(let i=edLayers.length-1;i>=0;i--){if(edLayers[i].contains(c.nx,c.ny)){found=i;break;}}
  if(found>=0){
    edSelectedIdx = found;
    edDragOffX = c.nx - edLayers[found].x;
    edDragOffY = c.ny - edLayers[found].y;
    edIsDragging = true;
    edHideGearIcon();
    clearTimeout(window._edLongPress);
    if(_isTouch){
      // TÁCTIL: toque simple = solo seleccionar
      // Doble toque rápido (≤350ms) → abrir panel de propiedades
      const now = Date.now();
      if(found === _edLastTapIdx && now - _edLastTapTime < 350){
        edIsDragging = false;
        clearTimeout(window._edLongPress);
        edRenderOptionsPanel('props');
        _edLastTapTime = 0; _edLastTapIdx = -1;
      } else {
        _edLastTapTime = now; _edLastTapIdx = found;
        // Sin long-press en táctil — solo doble toque abre el panel
      }
    } else {
      // PC/RATÓN: doble clic en el mismo objeto → abrir propiedades
      const now = Date.now();
      if(found === _edLastTapIdx && now - _edLastTapTime < 350){
        edIsDragging = false;
        clearTimeout(window._edLongPress);
        edRenderOptionsPanel('props');
        _edLastTapTime = 0; _edLastTapIdx = -1;
      } else {
        _edLastTapTime = now; _edLastTapIdx = found;
        // Long-press 600ms en PC (ratón) → abrir propiedades
        window._edLongPress = setTimeout(() => {
          if(edSelectedIdx === found && !edIsResizing){
            edIsDragging = false;
            edRenderOptionsPanel('props');
          }
        }, 600);
      }
    }
  } else {
    edSelectedIdx = -1;
    edHideContextMenu();
    edRenderOptionsPanel();
  }
  edRedraw();
}
function edOnMove(e){
  // Actualizar _edTouchMoved siempre (para cancelar long-press aunque gestureActive sea false)
  if(e.pointerType === 'touch' || e.pointerType === 'pen'){
    _edTouchMoved = true;
    clearTimeout(window._edLongPress);
    window._edLongPressReady = false;
  }
  // Sin gesto activo → ignorar el resto
  const gestureActive = edIsDragging||edIsResizing||edIsTailDragging||edPainting||edPinching||edIsRotating;
  if(!gestureActive) return;
  e.preventDefault();
  // Pinch activo
  if(window._edActivePointers && window._edActivePointers.size >= 2){
    if(e.pointerId !== undefined) window._edActivePointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
    edPinchMove(e);
    return;
  }
  if(edPinching) return; // segundo dedo levantado, esperar edOnEnd
  if(['draw','eraser'].includes(edActiveTool)&&edPainting){edContinuePaint(e);return;}
  const c=edCoords(e);
  _edTouchMoved = true;
  clearTimeout(window._edLongPress); // cancelar longpress si el dedo se movió
  if(edIsTailDragging&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const dx=c.nx-la.x,dy=c.ny-la.y;
    const v=edTailVoiceIdx||0;
    if(!la.tailStarts)la.tailStarts=[{...la.tailStart}];
    if(!la.tailEnds)  la.tailEnds  =[{...la.tailEnd}];
    if(edTailPointType==='start'){
      if(!la.tailStarts[v])la.tailStarts[v]={...la.tailStarts[0]};
      la.tailStarts[v]={x:dx/la.width,y:dy/la.height};
    } else {
      if(!la.tailEnds[v])la.tailEnds[v]={...la.tailEnds[0]};
      la.tailEnds[v]={x:dx/la.width,y:dy/la.height};
    }
    edRedraw();return;
  }
  if(edIsRotating&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const angle = Math.atan2(c.ny-la.y, c.nx-la.x) - edRotateStartAngle;
    la.rotation = angle*180/Math.PI;
    edRedraw();
    return;
  }
  if(edIsResizing&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const pw=edPageW(), ph=edPageH();
    const rot=(edInitialSize.rot||0)*Math.PI/180;
    // Trabajar SIEMPRE en pixeles para evitar distorsion por pw!=ph
    // Vector raton->centro en pixeles de pagina
    const dx_px=(c.nx-edInitialSize.cx)*pw;
    const dy_px=(c.ny-edInitialSize.cy)*ph;
    // Rotar al espacio local del objeto (en pixeles)
    const lx_px= dx_px*Math.cos(-rot)-dy_px*Math.sin(-rot);
    const ly_px= dx_px*Math.sin(-rot)+dy_px*Math.cos(-rot);
    const corner=edResizeCorner;
    const isImg = la.type==='image';
    // asp en pixeles: (height_px / width_px) — para no-imagen
    const iw_px = edInitialSize.width * pw;
    const ih_px = edInitialSize.height * ph;
    const asp_px = iw_px > 0 ? ih_px / iw_px : 1;
    if(corner==='ml'||corner==='mr'){
      // Redimensionar horizontalmente
      const nw_px = Math.abs(lx_px)*2;
      if(nw_px > pw*0.02){
        la.width = nw_px/pw;
        if(!isImg) la.height = (nw_px * asp_px)/ph;
      }
    } else if(corner==='mt'||corner==='mb'){
      // Redimensionar verticalmente
      const nh_px = Math.abs(ly_px)*2;
      if(nh_px > ph*0.02){
        if(isImg){
          // Para imagen: escalar width segun el nuevo alto deseado y el natRatio
          la.width = (nh_px * la.natRatio)/pw;
        } else {
          la.height = nh_px/ph;
        }
      }
    } else {
      // Esquina — usar el eje dominante para escala proporcional
      const nw_px = Math.abs(lx_px)*2;
      const nh_px = Math.abs(ly_px)*2;
      // Usar el mayor desplazamiento como referencia
      const ref_px = Math.max(nw_px, nh_px * (iw_px/Math.max(ih_px,1)));
      if(ref_px > pw*0.02){
        la.width = ref_px/pw;
        if(!isImg) la.height = (ref_px * asp_px)/ph;
      }
    }
    edRedraw();
    edHideGearIcon();
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
  // Limpiar pointer del mapa SIEMPRE (antes de la guarda)
  if(e && e.pointerId !== undefined && window._edActivePointers){
    window._edActivePointers.delete(e.pointerId);
  }
  // Sin gesto activo → ignorar el resto
  const gestureActive2 = edIsDragging||edIsResizing||edIsTailDragging||edPainting||edPinching||edIsRotating;
  if(!gestureActive2){ clearTimeout(window._edLongPress); window._edLongPressReady=false; return; }
  if(edPinching && (!window._edActivePointers || window._edActivePointers.size < 2)){
    edPinchEnd();
    return;
  }
  if(edPainting){edPainting=false;edSaveDrawData();}
  clearTimeout(window._edLongPress);
  const wasDragging = edIsDragging||edIsResizing||edIsTailDragging;
  window._edLongPressReady = false;
  if(wasDragging) edPushHistory();
  edIsDragging=false;edIsResizing=false;edIsTailDragging=false;edIsRotating=false;
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
  const page=edPages[edCurrentPage];if(!page)return;
  // Guardar solo la zona de la página (sin margen de workspace)
  const tmp=document.createElement('canvas');
  tmp.width=edPageW();tmp.height=edPageH();
  tmp.getContext('2d').drawImage(edCanvas,edMarginX(),edMarginY(),edPageW(),edPageH(),0,0,edPageW(),edPageH());
  page.drawData=tmp.toDataURL();
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
            <option value="thought" ${la.style==='thought'?'selected':''}>Pensamiento</option>
            <option value="radio" ${la.style==='radio'?'selected':''}>Radio/Tele</option>
            <option value="explosion" ${la.style==='explosion'?'selected':''}>Explosión</option>
          </select>
        </div>
        <div class="op-prop-row">
          <span class="op-prop-label">Nº voces</span>
          <input type="number" id="pp-vc" value="${la.voiceCount||1}" min="1" max="5" style="width:48px">
          <label style="display:flex;align-items:center;gap:4px;font-size:.75rem;font-weight:700;margin-left:12px">
            <input type="checkbox" id="pp-tail" ${la.tail?'checked':''}>  Cola
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

    // (voiceCount es independiente del estilo)
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
        else if(id==='pp-vc')     la.voiceCount=Math.max(1,parseInt(e.target.value)||1);
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
    orientation:(p.orientation||edOrientation)==='vertical' ? 'v' : 'h',
  }));
  ComicStore.save({
    ...existing,
    id:edProjectId,
    ...edProjectMeta,
    panels,
    editorData:{
      orientation:edOrientation,
      pages:edPages.map(p=>({drawData:p.drawData,layers:p.layers.map(edSerLayer),textLayerOpacity:p.textLayerOpacity??1,textMode:p.textMode||'immediate',orientation:p.orientation||edOrientation})),
    },
    updatedAt:new Date().toISOString(),
  });
  edToast('Guardado ✓');
}
function edRenderPage(page){
  // Renderizar solo la zona de la página (sin margen de workspace)
  // Temporalmente usar la orientación de esta hoja específica
  const _savedOrient = edOrientation;
  const _savedPage   = edCurrentPage;
  const _pageIdx     = edPages.indexOf(page);
  if(_pageIdx >= 0){ edCurrentPage = _pageIdx; }
  if(page.orientation) edOrientation = page.orientation;
  const pw=edPageW(), ph=edPageH();
  const tmp=document.createElement('canvas');tmp.width=pw;tmp.height=ph;
  // Proxy: simula ser el canvas completo pero con margen 0
  // Las draw() usarán ED_MARGIN (constante global) = 120, que suma fuera de tmp
  // Para evitarlo, usamos un canvas del tamaño del workspace pero solo exportamos la zona central
  const full=document.createElement('canvas');full.width=edCanvas.width;full.height=edCanvas.height;
  const ctx=full.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(edMarginX(),edMarginY(),pw,ph);
  page.layers.filter(l=>l.type==='image').forEach(l=>l.draw(ctx,full));
  page.layers.filter(l=>l.type!=='image').forEach(l=>l.draw(ctx,full));
  if(page.drawData){
    const di=new Image();di.src=page.drawData;
    if(di.complete)ctx.drawImage(di,edMarginX(),edMarginY(),pw,ph);
  }
  // Recortar solo la zona de la página
  const outCtx=tmp.getContext('2d');
  outCtx.drawImage(full,edMarginX(),edMarginY(),pw,ph,0,0,pw,ph);
  // Restaurar estado
  edOrientation  = _savedOrient;
  edCurrentPage  = _savedPage;
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
    return{type:'image',x:l.x,y:l.y,width:l.width,natRatio:l.natRatio||1,rotation:l.rotation,src:compressedSrc,...op};
  }
  if(l.type==='text')return{type:'text',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,...op};
  if(l.type==='bubble')return{type:'bubble',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,
    tail:l.tail,style:l.style,tailStart:{...l.tailStart},tailEnd:{...l.tailEnd},voiceCount:l.voiceCount||1,tailStarts:l.tailStarts?l.tailStarts.map(s=>({...s})):undefined,tailEnds:l.tailEnds?l.tailEnds.map(e=>({...e})):undefined,...op};
}
function edDeserLayer(d, pageOrientation){
  if(d.type==='text'){const l=new TextLayer(d.text,d.x,d.y);Object.assign(l,d);return l;}
  if(d.type==='bubble'){const l=new BubbleLayer(d.text,d.x,d.y);Object.assign(l,d);
    if(d.tailStart)l.tailStart={...d.tailStart};if(d.tailEnd)l.tailEnd={...d.tailEnd};
    if(d.tailStarts)l.tailStarts=d.tailStarts.map(s=>({...s}));
    if(d.tailEnds)  l.tailEnds  =d.tailEnds.map(e=>({...e}));
    if(d.multipleCount&&!d.voiceCount)l.voiceCount=d.multipleCount;
    return l;}
  if(d.type==='image'){
    const l=new ImageLayer(null,d.x,d.y,d.width);
    // Restaurar natRatio guardado; si no existe (datos viejos) se recalcula al cargar la img
    if(d.natRatio) l.natRatio=d.natRatio;
    l.rotation=d.rotation||0; l.src=d.src||'';
    if(d.opacity!==undefined) l.opacity=d.opacity;
    l._syncHeight(); // usar natRatio ya restaurado
    if(d.src){
      const img=new Image();
      img.onload=()=>{
        l.img=img; l.src=img.src;
        // natRatio definitivo desde la imagen real (cubre migracion de datos viejos)
        l.natRatio = img.naturalWidth / img.naturalHeight;
        l._syncHeight();
        edRedraw();
      };
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
      layers:(pd.layers||[]).map(d=>edDeserLayer(d, pd.orientation||comic.editorData.orientation||'vertical')).filter(Boolean),
      textLayerOpacity:pd.textLayerOpacity??1,
      textMode:pd.textMode||'immediate',
      orientation:pd.orientation||comic.editorData.orientation||'vertical',
    }));
  }else{
    edOrientation='vertical';edPages=[{layers:[],drawData:null,textLayerOpacity:1,textMode:'immediate',orientation:'vertical'}];
  }
  if(!edPages.length)edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'immediate'});
  edCurrentPage=0;edLayers=edPages[0].layers;
  // Centrar cámara al cargar proyecto
  // Doble rAF + timeout: esperar que el DOM tenga alturas correctas
  if(edCanvas){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      edFitCanvas(true);
      // Segundo intento por si el layout tardó más (ej: fuentes, imágenes)
      setTimeout(()=>edFitCanvas(true), 120);
    }));
  }
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
  edViewerIdx=0;  // siempre empieza por la primera hoja
  edViewerTextStep=0;
  // Garantizar que TODAS las hojas tienen orientation antes de abrir
  edPages.forEach(p=>{ if(!p.orientation) p.orientation=edOrientation; });
  $('editorViewer')?.classList.add('open');
  edUpdateViewer();
  edInitViewerTap();
  // Teclado PC
  if(_viewerKeyHandler) document.removeEventListener('keydown', _viewerKeyHandler);
  _viewerKeyHandler = _edViewerKey;
  document.addEventListener('keydown', _viewerKeyHandler);
}
function edUpdateViewerSize(pw, ph){
  if(!edViewerCanvas) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  // Si no se pasan dimensiones, calcularlas desde la hoja actual del visor
  if(!pw||!ph){
    const _po = edPages[edViewerIdx]?.orientation || edOrientation;
    pw = _po==='vertical' ? ED_PAGE_W : ED_PAGE_H;
    ph = _po==='vertical' ? ED_PAGE_H : ED_PAGE_W;
  }
  edViewerCanvas.width  = pw;
  edViewerCanvas.height = ph;
  edViewerCtx = edViewerCanvas.getContext('2d');
  // Escala: llenar el viewport manteniendo proporción (contain)
  const scale = Math.min(vw / pw, vh / ph);
  const displayW = Math.round(pw * scale);
  const displayH = Math.round(ph * scale);
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
    // pointerdown + touchstart cubren PC y Android
    // Usar capture:true para recibir el evento aunque haya elementos encima
    viewer.addEventListener('pointerdown', () => edShowViewerCtrls(), {capture:true, passive:true});
    viewer.addEventListener('touchstart',  () => edShowViewerCtrls(), {capture:true, passive:true});
    viewer.addEventListener('mousemove',   () => edShowViewerCtrls(), {passive:true});
  }
}
function edCloseViewer(){
  $('editorViewer')?.classList.remove('open');
  clearTimeout(_viewerHideTimer);
  _viewerTapBound = false; // permitir re-bind en próxima apertura
  if(_viewerKeyHandler){
    document.removeEventListener('keydown', _viewerKeyHandler);
    _viewerKeyHandler = null;
  }
}
function edUpdateViewer(){
  const page=edPages[edViewerIdx];if(!page||!edViewerCanvas)return;
  // Calcular dimensiones de ESTA hoja directamente, sin tocar edOrientation global
  const _po = page.orientation || edOrientation;
  const pw = _po==='vertical' ? ED_PAGE_W : ED_PAGE_H;
  const ph = _po==='vertical' ? ED_PAGE_H : ED_PAGE_W;
  const mx = (ED_CANVAS_W - pw) / 2;  // margen X para esta orientación
  const my = (ED_CANVAS_H - ph) / 2;  // margen Y para esta orientación
  // Ajustar canvas del visor para esta hoja
  edUpdateViewerSize(pw, ph);
  // Canvas de trabajo con margen (igual que el editor)
  const full=document.createElement('canvas');
  full.width=ED_CANVAS_W; full.height=ED_CANVAS_H;
  const fctx=full.getContext('2d');
  fctx.fillStyle='#fff'; fctx.fillRect(mx,my,pw,ph);
  // Renderizar capas: temporalmente setear edOrientation para que draw() funcione
  // (draw() usa edMarginX/edPageW internamente)
  const _savedOrient=edOrientation;
  edOrientation=_po;
  page.layers.filter(l=>l.type==='image').forEach(l=>l.draw(fctx,full));
  const _finishViewer = () => {
    _edViewerDrawTextsOnCtx(page, fctx, full);
    // Restaurar antes de manipular el DOM
    edOrientation=_savedOrient;
    // Copiar zona del lienzo al viewerCanvas
    edViewerCtx.clearRect(0,0,pw,ph);
    edViewerCtx.drawImage(full,mx,my,pw,ph,0,0,pw,ph);
    // Contador
    const textLayers=page.layers.filter(l=>l.type==='text'||l.type==='bubble');
    const isSeq=page.textMode==='sequential';
    const cnt=$('viewerCounter');
    if(cnt){
      if(isSeq&&textLayers.length>0){
        cnt.textContent=`${edViewerIdx+1}/${edPages.length} · 💬${edViewerTextStep}/${textLayers.length}`;
      } else {
        cnt.textContent=`${edViewerIdx+1} / ${edPages.length}`;
      }
    }
  };
  if(page.drawData){
    const img=new Image();
    img.onload=()=>{
      fctx.drawImage(img,mx,my,pw,ph);
      _finishViewer();
    };
    img.src=page.drawData;
  } else {
    _finishViewer();
  }
}

function _edViewerDrawTextsOnCtx(page, ctx, can){
  const textLayers = page.layers.filter(l=>l.type==='text'||l.type==='bubble');
  const isSeq = page.textMode === 'sequential';
  const toShow = isSeq ? textLayers.slice(0, edViewerTextStep) : textLayers;
  toShow.forEach(l=>l.draw(ctx, can));
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

/* ── Destruir vista: eliminar todos los listeners de document/window ── */
function EditorView_destroy(){
  if(window._edListeners){
    window._edListeners.forEach(([el,evt,fn,opts])=>el.removeEventListener(evt,fn,opts));
    window._edListeners = null;
  }
  if(window._edWheelFn){
    window.removeEventListener('wheel', window._edWheelFn);
    window._edWheelFn = null;
  }
  if(window._edKeyFn){
    document.removeEventListener('keydown', window._edKeyFn);
    window._edKeyFn = null;
  }
  if(window._edDocDownFn){
    document.removeEventListener('pointerdown', window._edDocDownFn);
    window._edDocDownFn = null;
  }
  // Limpiar timers
  clearTimeout(window._edLongPress);
  edHideGearIcon();
}
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
  // Aplicar orientación de la hoja 0 sin sobreescribir las demás hojas
  edSetOrientation(edPages[0]?.orientation || edOrientation, false);
  edActiveTool='select';
  const cur=$('edBrushCursor');if(cur)cur.style.display='none';

  // ── CANVAS ──
  // Usamos SOLO pointer events (unifican mouse + touch sin duplicados).
  // En Android un toque genera pointerdown+touchstart — usando solo pointer
  // evitamos que edOnStart se llame dos veces.
  // touch-action:none en editorShell permite que pointer events funcionen
  // en táctil sin interferencia del browser, pero sin bloquear overlays
  // (los overlays están en body, fuera del shell).
  const _shell = document.getElementById('editorShell');
  if(_shell) _shell.style.touchAction = 'none';
  window._edListeners = [
    [document, 'pointerdown',  edOnStart, {passive:false}],
    [document, 'pointermove',  edOnMove,  {passive:false}],
    [document, 'pointerup',    edOnEnd,   {}],
    [document, 'pointercancel',edOnEnd,   {}],
  ];
  window._edListeners.forEach(([el, evt, fn, opts]) => el.addEventListener(evt, fn, opts));

  // ── TOPBAR ──
  $('edBackBtn')?.addEventListener('click',()=>{edSaveProject();Router.go('my-comics');});
  $('edPagePrev')?.addEventListener('click',()=>{ if(edCurrentPage>0) edLoadPage(edCurrentPage-1); });
  $('edPageNext')?.addEventListener('click',()=>{ if(edCurrentPage<edPages.length-1) edLoadPage(edCurrentPage+1); });
  $('edZoomResetBtn')?.addEventListener('click',()=>{
    const pw=edPageW(), ph=edPageH();
    const fullZoom = Math.min(edCanvas.width/pw, edCanvas.height/ph);
    const workZoom = Math.min(edCanvas.width/ED_CANVAS_W, edCanvas.height/ED_CANVAS_H);
    // Alterna entre "lienzo llena viewport" y "workspace completo visible"
    const isAtFull = Math.abs(edCamera.z - fullZoom) < 0.01;
    if(isAtFull){
      edCamera.z = workZoom;
      edCamera.x = edCanvas.width/2  - ED_CANVAS_W/2 * workZoom;
      edCamera.y = edCanvas.height/2 - ED_CANVAS_H/2 * workZoom;
    } else {
      _edCameraReset();
    }
    edRedraw();
    _edScrollbarsUpdate();
  });
  $('edSaveBtn')?.addEventListener('click',edSaveProject);
  $('edPreviewBtn')?.addEventListener('click',edOpenViewer);
  // Botón pantalla completa en topbar
  $('edFsBtn')?.addEventListener('click', () => {
    if(typeof Fullscreen !== 'undefined') Fullscreen.request();
  });
  const _edFsUpdate = () => {
    const btn = $('edFsBtn'); if(!btn) return;
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btn.textContent = active ? '⛶✕' : '⛶';
    btn.title = active ? 'Salir pantalla completa' : 'Pantalla completa';
  };
  document.addEventListener('fullscreenchange', _edFsUpdate);
  document.addEventListener('webkitfullscreenchange', _edFsUpdate);

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
  $('dd-deleteproject')?.addEventListener('click',()=>{
    edCloseMenus();
    if(!edProjectId){edToast('Sin proyecto activo');return;}
    if(!confirm('¿Eliminar esta obra? Esta acción no se puede deshacer.'))return;
    ComicStore.remove(edProjectId);
    edToast('Obra eliminada');
    setTimeout(()=>Router.go('my-comics'),600);
  });
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
  window._edWheelFn = e => {
    if(!document.getElementById('editorShell')) return;
    // Si la rueda está sobre un elemento scrollable (overlay de capas, hojas, etc.)
    // dejarlo hacer scroll nativo — no intervenir
    const overScrollable = e.target.closest('.ed-layers-list, .ed-pages-grid, .ed-fulloverlay-box');
    if(overScrollable) return;
    e.preventDefault();
    if(e.ctrlKey || e.metaKey){
      // Zoom hacia el cursor
      const canvasTop = parseFloat(edCanvas ? edCanvas.style.top : 0) || 0;
      const sx = e.clientX;
      const sy = e.clientY - canvasTop;
      const factor = e.deltaY > 0 ? 1/1.1 : 1.1;
      edZoomAt(sx, sy, factor);
    } else {
      // Pan (sin Ctrl: trackpad two-finger scroll o rueda normal)
      edCamera.x -= e.deltaX;
      edCamera.y -= e.deltaY;
    }
    edRedraw();
    _edScrollbarsUpdate();
  };
  window.addEventListener('wheel', window._edWheelFn, {passive: false});

  // ── Teclado: Ctrl+Z / Ctrl+Y / Delete ──
  window._edKeyFn = function(e){
    if(!document.getElementById('editorShell')) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const ctrl = e.ctrlKey || e.metaKey;
    // Enter: cerrar panel de opciones abierto (OK)
    if(e.key === 'Enter' && !ctrl){
      const panel = $('edOptionsPanel');
      if(panel && panel.classList.contains('open')){
        e.preventDefault();
        edCloseOptionsPanel();
        return;
      }
    }
    if((e.key === 'Delete' || e.key === 'Backspace') && !ctrl){
      if(edSelectedIdx >= 0){ e.preventDefault(); edDeleteSelected(); }
      return;
    }
    if(!ctrl) return;
    if(!e.shiftKey && e.key.toLowerCase() === 'z'){ e.preventDefault(); edUndo(); }
    else if(e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')){ e.preventDefault(); edRedo(); }
  };
  document.addEventListener('keydown', window._edKeyFn);

  // ── RESIZE ──
  window.addEventListener('resize',()=>{edFitCanvas();edUpdateCanvasFullscreen();});

  // Fit canvas con reintentos hasta que las medidas sean reales
  // (el CSS se carga dinámicamente y las fuentes tardan en aplicar)
  function _edInitFit(attemptsLeft) {
    const topbar = $('edTopbar');
    const menu   = $('edMenuBar');
    const topH   = topbar ? topbar.getBoundingClientRect().height : 0;
    const menuH  = menu   ? menu.getBoundingClientRect().height   : 0;
    if (topH > 10 && menuH > 10) {
      edFitCanvas(true); edRedraw(); return;
    }
    if (attemptsLeft <= 0) {
      edFitCanvas(true); edRedraw(); return;
    }
    requestAnimationFrame(() => _edInitFit(attemptsLeft - 1));
  }
  // Primer intento tras doble rAF; si falla reintenta hasta 30 frames (~500ms)
  requestAnimationFrame(() => requestAnimationFrame(() => _edInitFit(30)));

  // Cerrar herramienta de dibujo al tocar fuera del canvas
  window._edDocDownFn = e => {
    if(['draw','eraser'].includes(edActiveTool)){
      if(!e.target.closest('#editorCanvas') && !e.target.closest('#edOptionsPanel')){
        edDeactivateDrawTool();
      }
    }
  };
  document.addEventListener('pointerdown', window._edDocDownFn);


  // ── FULLSCREEN CANVAS ON ORIENTATION MATCH ──
  edUpdateCanvasFullscreen();
  window.addEventListener('orientationchange', ()=>{
    setTimeout(()=>{edFitCanvas();edUpdateCanvasFullscreen();}, 200);
  });

  // ── Pinch en cualquier zona (fuera del canvas) = zoom ──
  let _shellPinch0 = 0, _shellZoom0 = 1;
  const editorShell = document.getElementById('editorShell');
  if(editorShell){
    let _pinchPrev = 0, _pinchMidX = 0, _pinchMidY = 0;
    editorShell.addEventListener('touchstart', e => {
      if(e.touches.length === 2){
        // Si hay objeto seleccionado, el canvas manejará el pinch (resize)
        // No inicializar zoom de cámara para este gesto
        if(edSelectedIdx >= 0){ _pinchPrev = 0; return; }
        _pinchPrev = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const canvasTop = parseFloat(edCanvas ? edCanvas.style.top : 0) || 0;
        _pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        _pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - canvasTop;
      }
    }, {passive:true});
    editorShell.addEventListener('touchmove', e => {
      if(e.touches.length === 2 && _pinchPrev > 0){
        e.preventDefault();
        // Si hay objeto seleccionado, el pinch lo gestiona edPinchMove (resize)
        // El zoom de cámara solo actúa cuando NO hay objeto seleccionado
        if(edSelectedIdx >= 0) return;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / _pinchPrev;
        edZoomAt(_pinchMidX, _pinchMidY, factor);
        _pinchPrev = dist;
        edRedraw();
        _edScrollbarsUpdate();
      }
    }, {passive:false});
    editorShell.addEventListener('touchend', ()=>{ _pinchPrev = 0; }, {passive:true});
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
          layers:(pd.layers||[]).map(d=>edDeserLayer(d, pd.orientation||data.editorData.orientation||'vertical')).filter(Boolean),
          textLayerOpacity:pd.textLayerOpacity??1,
          textMode:pd.textMode||'immediate',
          orientation:pd.orientation||data.editorData.orientation||'vertical',
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
