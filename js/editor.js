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
let edProjectMeta = { title:'', author:'', genre:'', navMode:'horizontal', social:'' };
let edActiveTool = 'select';  // select | draw | eraser | fill | shape | line
// Estado herramienta shape
let _edShapeType  = 'rect';   // 'rect' | 'ellipse'
let _edShapeStart = null;     // {x,y} inicio drag normalizado
let _edShapePreview = null;   // ShapeLayer temporal en preview
let _edPendingShape = null;   // ShapeLayer/LineLayer creada pero no confirmada (no seleccionable)
let edDrawFillColor = '#ffffff'; // relleno blanco por defecto // color de relleno para nuevas shapes
let _edLineLayer  = null;     // LineLayer en construcción
let _edLineColor  = '#000000';
let _edLineWidth  = 3;
let _edLineType   = 'draw';   // 'draw' | 'select'
let edLastPointerIsTouch = false; // se actualiza en edOnStart con e.pointerType real
let edPainting = false;
let edDrawHistory = [], edDrawHistoryIdx = -1;  // historial local de dibujo
const ED_MAX_DRAW_HISTORY = 20;
let edDrawColor = '#000000', edDrawSize = 4, edEraserSize = 20, edDrawOpacity = 100;
let edColorPalette = ['#000000','#ffffff','#e63030','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#e91e8c','#795548'];
let edSelectedPaletteIdx = 0; // índice del dot de paleta actualmente seleccionado
let edMenuOpen = null;     // id del dropdown abierto
let edMinimized = false;
let edFloatX = 12, edFloatY = 12; // posición del botón flotante (esquina superior izquierda)
// Pinch-to-zoom
let edPinching = false, edPinchDist0 = 0, edPinchAngle0 = 0, edPinchScale0 = null;
let _edPinchHappened = false; // true desde que empieza el pinch hasta que se levantan TODOS los dedos
let edPinchCenter0 = null, edPinchCamera0 = null;
let edPanelUserClosed = false;  // true = usuario cerró panel con ✓, no reabrir al seleccionar
// edZoom eliminado — reemplazado por edCamera.z
// ── Cámara del editor (patrón Figma/tldraw) ──
// x,y = traslación del canvas (donde aparece el origen del workspace en pantalla)
// z   = escala (1 = lienzo ocupa el viewport)
const edCamera = { x: 0, y: 0, z: 1 };
let _edLastTapTime = 0, _edLastTapIdx = -1; // para detectar doble tap
let _edTouchMoved = false; // true si el dedo se movió durante el toque actual
let edHistory = [], edHistoryIdx = -1;
let _edSavedHistoryIdx = -1; // historyIdx en el último guardado explícito con 💾
const ED_MAX_HISTORY = 10;
let edViewerTextStep = 0;  // nº de textos revelados en modo secuencial
// ── Multi-selección ──
let edMultiSel = [];        // índices seleccionados
let edMultiDragging = false;
let edMultiResizing = false;
let edMultiRotating = false;
let edRubberBand = null;    // {x0,y0,x1,y1} norm coords mientras se arrastra
let edMultiDragOffs = [];   // [{dx,dy}] offset de arrastre por objeto
let edMultiTransform = null;// snapshot del gesto activo (solo durante el gesto)
let edMultiGroupRot = 0;    // rotación acumulada del bbox del grupo (grados)
// bbox persistente del grupo — solo lo actualiza _msRecalcBbox()
// {w, h, cx, cy, offX, offY}  (offX/Y = offset centro respecto al centroide)
let edMultiBbox = null;

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
    const hw = this.width/2;
    const rot = (this.rotation||0)*Math.PI/180;
    const pw=edPageW(), ph=edPageH();
    // height de todos los tipos es fraccion de ph — uniforme
    const hhPh = this.height/2;
    const rp = (dx,dy) => {
      const rx=dx*pw, ry=dy*ph;
      return { x: this.x+(rx*Math.cos(rot)-ry*Math.sin(rot))/pw,
               y: this.y+(rx*Math.sin(rot)+ry*Math.cos(rot))/ph };
    };
    const tl=rp(-hw,-hhPh), tr=rp(hw,-hhPh), bl=rp(-hw,hhPh), br=rp(hw,hhPh);
    const ml=rp(-hw,0),     mr=rp(hw,0),      mt=rp(0,-hhPh), mb=rp(0,hhPh);
    const rotOffset = 28/(ph * edCamera.z);
    const rotHandle = rp(0,-hhPh-rotOffset);
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
    if(imgEl){
      this.img=imgEl; this.src=imgEl.src||'';
      if(imgEl.naturalWidth&&imgEl.naturalHeight){
        const pw=edPageW()||ED_PAGE_W, ph=edPageH()||ED_PAGE_H;
        this.height = width * (imgEl.naturalHeight / imgEl.naturalWidth) * (pw / ph);
      }
    } else {
      this.img=null; this.src='';
    }
  }
  draw(ctx,can){
    if(!this.img || !this.img.complete || this.img.naturalWidth===0) return;
    const pw=edPageW(), ph=edPageH();
    const w = this.width  * pw;
    const h = this.height * ph;
    const px = edMarginX() + this.x*pw;
    const py = edMarginY() + this.y*ph;
    ctx.save();
    ctx.globalAlpha = this.opacity ?? 1;
    ctx.translate(px,py);
    ctx.rotate(this.rotation*Math.PI/180);
    ctx.drawImage(this.img, -w/2, -h/2, w, h);
    ctx.restore();
  }
  contains(px, py) {
    // 1. Comprobar bbox primero (rápido)
    if (!super.contains(px, py)) return false;
    // 2. Hit-test por alpha de píxel real — ignora zonas transparentes
    if (!this.img || !this.img.complete || this.img.naturalWidth === 0) return true;
    try {
      const pw = edPageW(), ph = edPageH();
      // Transformar punto al espacio local de la imagen (con rotación)
      const rot = (this.rotation || 0) * Math.PI / 180;
      const dx = (px - this.x) * pw, dy = (py - this.y) * ph;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      const iw = this.width * pw, ih = this.height * ph;
      // Convertir a coordenadas de píxel en la imagen original
      const imgX = (lx / iw + 0.5) * this.img.naturalWidth;
      const imgY = (ly / ih + 0.5) * this.img.naturalHeight;
      if (imgX < 0 || imgY < 0 || imgX >= this.img.naturalWidth || imgY >= this.img.naturalHeight) return false;
      // Leer alpha con canvas 1×1
      const _oc = ImageLayer._alphaCanvas || (ImageLayer._alphaCanvas = document.createElement('canvas'));
      _oc.width = 1; _oc.height = 1;
      const _octx = _oc.getContext('2d');
      _octx.clearRect(0, 0, 1, 1);
      _octx.drawImage(this.img, -imgX, -imgY);
      return _octx.getImageData(0, 0, 1, 1).data[3] > 10;
    } catch(e) {
      return true; // fallback: si falla (CORS), usar bbox
    }
  }
}

class TextLayer extends BaseLayer {
  constructor(text='Escribe aquí',x=0.5,y=0.5){
    super('text',x,y,0.2,0.1);
    this.text=text;this.fontSize=30;this.fontFamily='Patrick Hand';
    this.fontBold=false;this.fontItalic=false;
    this.color='#000000';this.backgroundColor='#ffffff';
    this.borderColor='#000000';this.borderWidth=0;this.padding=10;
  }
  getLines(){return this.text.split('\n');}
  _fontStr(){ return `${this.fontItalic?'italic ':''}${this.fontBold?'bold ':''}${this.fontSize}px ${this.fontFamily}`; }
  measure(ctx){
    ctx.font=this._fontStr();
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
    ctx.translate(px,py); ctx.rotate(this.rotation*Math.PI/180);
    // Fondo y borde se dibujan en espacio local (tras la rotación)
    ctx.fillStyle=this.backgroundColor; ctx.fillRect(-w/2,-h/2,w,h);
    if(this.borderWidth>0){
      ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth;
      ctx.strokeRect(-w/2,-h/2,w,h);
    }
    ctx.font=this._fontStr();
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
    this.text=text;this.fontSize=30;this.fontFamily='Patrick Hand';
    this.fontBold=false;this.fontItalic=false;
    this.color='#000000';this.backgroundColor='#ffffff';
    this.borderColor='#000000';this.borderWidth=2;
    this.tail=true;
    this.tailStart={x:-0.4,y:0.4};this.tailEnd={x:-0.4,y:0.6}; // voz 0 (legacy)
    this.tailStarts=[{x:-0.4,y:0.4}];this.tailEnds=[{x:-0.4,y:0.6}]; // arrays por voz
    this.style='conventional';this.voiceCount=1;this.padding=15;
    // Cola pensamiento: posiciones normalizadas de elipse grande y pequeña
    // tBig = centro elipse grande (más cercana al bocadillo), tSmall = elipse pequeña (más lejana)
    this.thoughtBig  = {x:0.35, y:0.55};  // relativo al centro, en fracción del tamaño
    this.thoughtSmall= {x:0.55, y:0.80};
    // Radios editables para estilo explosión (12 vértices, normalizados 0..1)
    this.explosionRadii=null; // null = usar valores por defecto
  }
  getLines(){return this.text.split('\n');}
  _fontStr(){ return `${this.fontItalic?'italic ':''}${this.fontBold?'bold ':''}${this.fontSize}px ${this.fontFamily}`; }
  measure(ctx){
    ctx.font=this._fontStr();
    let mw=0,th=0;
    this.getLines().forEach(l=>{mw=Math.max(mw,ctx.measureText(l).width);th+=this.fontSize*1.2;});
    return{width:mw,height:th};
  }
  resizeToFitText(can){
    const pw=edPageW(), ph=edPageH();
    const ctx=can.getContext('2d');
    ctx.font=this._fontStr();
    const lines=this.getLines();
    const lh=this.fontSize*1.2;
    const maxW=lines.reduce((m,l)=>Math.max(m,ctx.measureText(l).width),0);
    const totalH=lines.length*lh;
    if(this.style==='thought'){
      const factor = lines.length === 1 ? 1.15 : 1.05;
      const w2 = maxW * factor + this.padding * 2;
      const h2 = totalH * factor + this.padding * 2;
      this.width=Math.max(0.05,w2/pw);
      this.height=Math.max(0.05,h2/ph);
      return;
    }
    if(this.style==='explosion'){
      // Para explosión: el texto debe caber dentro del área interior (delimitada por los valles)
      // Los valles (índices impares) tienen radio ~0.55-0.65 del borde de la caja
      // El radio interior mínimo de los valles es ~0.55 en cada eje
      // Área interior disponible: (w/2)*minValleOx x (h/2)*minValleOy
      // Necesitamos: caja tal que los valles dejen espacio para maxW x totalH + padding
      this._initExplosionRadii();
      // Calcular el radio mínimo de los valles en cada dirección
      const valleys = this.explosionRadii.filter((_,i)=>i%2!==0);
      const minValleR = valleys.reduce((m,v)=>Math.min(m,Math.hypot(v.ox,v.oy)),1);
      // El texto + padding debe caber en el rectángulo inscrito dentro del círculo de radio minValleR
      // Para un cuadrado inscrito en un círculo de radio r: lado = r * sqrt(2)
      // Pero usamos el rectángulo real del texto: necesitamos que
      // sqrt((maxW/2/ax)² + (totalH/2/ay)²) <= minValleR
      // Simplificación: escalar la caja para que el texto quepa con margen
      const textDiag = Math.hypot(maxW/2 + this.padding, totalH/2 + this.padding);
      const scale = 1 / minValleR; // cuánto más grande debe ser la caja respecto al texto
      const w = (maxW + this.padding*2) * scale * 1.1;
      const h = (totalH + this.padding*2) * scale * 1.1;
      this.width=Math.max(0.05,w/pw);
      this.height=Math.max(0.05,h/ph);
    } else {
      const factor = lines.length === 1 ? 1.15 : 1.05;
      const w = maxW * factor + this.padding * 2;
      const h = totalH * factor + this.padding * 2;
      this.width=Math.max(0.05,w/pw);
      this.height=Math.max(0.05,h/ph);
    }
  }
  _initExplosionRadii(){
    if(this.explosionRadii&&this.explosionRadii.length===14&&typeof this.explosionRadii[0]==='object') return;
    // 14 vértices: 7 picos + 7 valles alternos, detectados desde imagen de referencia real
    // Coordenadas normalizadas: ox=1 = borde derecho de la caja (semieje X)
    this.explosionRadii=[
      {ox:+0.9776,oy:+0.3105},
      {ox:+0.5129,oy:+0.4912},
      {ox:+0.4159,oy:+0.8929},
      {ox:+0.0346,oy:+0.5928},
      {ox:-0.3742,oy:+0.9992},
      {ox:-0.4809,oy:+0.6768},
      {ox:-0.9476,oy:+0.6897},
      {ox:-0.7042,oy:+0.0887},
      {ox:-0.9825,oy:-0.5075},
      {ox:-0.3880,oy:-0.6292},
      {ox:-0.2012,oy:-0.9957},
      {ox:-0.0315,oy:-0.5401},
      {ox:+0.3289,oy:-0.8785},
      {ox:+0.4461,oy:-0.5839}
    ];
  }
  getExplosionControlPoints(){
    if(this.style!=='explosion')return[];
    this._initExplosionRadii();
    const pw=edPageW(),ph=edPageH();
    const w=this.width*pw, h=this.height*ph;
    // Todos los vértices son arrastrables (picos en índices pares, valles en impares)
    return this.explosionRadii
      .map((v,i)=>({nx:this.x+v.ox*w/2/pw, ny:this.y+v.oy*h/2/ph, idx:i, type:'explosion'}));
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
      // Burbujas cola pensamiento: 3 elipses editables
      if(this.tail){
        const bx=this.thoughtBig.x*w,   by=this.thoughtBig.y*h;
        const sx=this.thoughtSmall.x*w, sy=this.thoughtSmall.y*h;
        const rBig  = 0.04*Math.min(can.width,can.height);
        const rSmall= 0.0178*Math.min(can.width,can.height);
        // Elipse mediana: a mitad de distancia entre contorno grande y contorno pequeña
        // Contorno grande más cercano a pequeña: punto en bx,by en dirección a sx,sy a distancia rBig
        const dx=sx-bx,dy=sy-by,dist=Math.hypot(dx,dy)||1;
        const ux=dx/dist,uy=dy/dist;
        const edgeBig  ={x:bx+ux*rBig,   y:by+uy*rBig};
        const edgeSmall={x:sx-ux*rSmall,  y:sy-uy*rSmall};
        const mx=(edgeBig.x+edgeSmall.x)/2, my=(edgeBig.y+edgeSmall.y)/2;
        const rMid=(rBig+rSmall)/2*0.7;
        [[bx,by,rBig],[mx,my,rMid],[sx,sy,rSmall]].forEach(([cx2,cy2,r])=>{
          ctx.beginPath();ctx.ellipse(cx2,cy2,r,r*2/3,0,0,Math.PI*2);
          ctx.fillStyle=this.backgroundColor;ctx.fill();
          ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;ctx.stroke();
        });
      }
      // Texto centrado
      ctx.font=this._fontStr();
      const isPlaceholderT=this.text==='Escribe aquí';
      ctx.fillStyle=isPlaceholderT?'#999999':this.color;ctx.textAlign='center';ctx.textBaseline='middle';
      const linesT=this.getLines(),lhT=this.fontSize*1.2,totalHT=linesT.length*lhT;
      linesT.forEach((l,i)=>ctx.fillText(l,0,-totalHT/2+lhT/2+i*lhT));
      ctx.restore();return;
    }

    if(this.style==='explosion'){
      this._initExplosionRadii();
      ctx.beginPath();
      this.explosionRadii.forEach((v,i)=>{
        const vx=v.ox*w/2, vy=v.oy*h/2;
        i===0?ctx.moveTo(vx,vy):ctx.lineTo(vx,vy);
      });
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
      {
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

    ctx.font=this._fontStr();
    const isPlaceholder = this.text==='Escribe aquí';
    ctx.fillStyle=isPlaceholder?'#999999':this.color;
    ctx.textAlign='center';ctx.textBaseline='middle';
    const lines=this.getLines(),lh=this.fontSize*1.2,totalH=lines.length*lh;
    // Para explosión: centrar el texto en el centroide de los valles (índices impares)
    let textCx=0, textCy=0;
    if(this.style==='explosion' && this.explosionRadii && this.explosionRadii.length>1){
      const valleys=this.explosionRadii.filter((_,i)=>i%2!==0);
      textCx=valleys.reduce((s,v)=>s+v.ox*w/2,0)/valleys.length;
      textCy=valleys.reduce((s,v)=>s+v.oy*h/2,0)/valleys.length;
    }
    lines.forEach((l,i)=>ctx.fillText(l,textCx,textCy-totalH/2+lh/2+i*lh));
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
  // Recalcular height de ImageLayers si la orientacion realmente cambio
  if(persist && prevOrientation !== o){
    const _isV = o === 'vertical';
    const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
    const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
    (edPages[edCurrentPage]?.layers || []).forEach(l => {
      if(l.type === 'image' && l.img && l.img.naturalWidth > 0){
        l.height = l.width * (l.img.naturalHeight / l.img.naturalWidth) * (_pw / _ph);
      }
    });
  }
  if(edViewerCanvas){ edViewerCanvas.width=edPageW(); edViewerCanvas.height=edPageH(); }
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    window._edUserRequestedReset=true; edFitCanvas(true);
    edRedraw();
  }));
}



class DrawLayer extends BaseLayer {
  constructor(){
    super('draw', 0.5, 0.5, 1.0, 1.0);
    // El canvas interno cubre todo el workspace (no solo la página)
    // para permitir dibujar en la zona de trabajo fuera del lienzo.
    this._canvas = document.createElement('canvas');
    this._canvas.width  = ED_CANVAS_W;
    this._canvas.height = ED_CANVAS_H;
    this._ctx = this._canvas.getContext('2d');
    this._lastX = 0;
    this._lastY = 0;
  }
  static fromDataUrl(dataUrl, pw, ph){
    // Compatibilidad: dataUrl guardado es en coords de página → colocar en posición correcta
    const dl = new DrawLayer();
    const img = new Image();
    img.onload = () => {
      const mx = (ED_CANVAS_W - pw) / 2;
      const my = (ED_CANVAS_H - ph) / 2;
      dl._ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, mx, my, pw, ph);
      if(typeof edRedraw === 'function') edRedraw();
    };
    img.src = dataUrl;
    return dl;
  }
  toDataUrl(){
    // Exportar solo la zona de la página para compatibilidad con guardado
    const pw = edPageW(), ph = edPageH();
    const tmp = document.createElement('canvas');
    tmp.width = pw; tmp.height = ph;
    tmp.getContext('2d').drawImage(this._canvas,
      edMarginX(), edMarginY(), pw, ph, 0, 0, pw, ph);
    return tmp.toDataURL();
  }
  toDataUrlFull(){
    // Exportar el workspace completo (incluye dibujo fuera del lienzo)
    return this._canvas.toDataURL();
  }
  clear(){
    this._ctx.clearRect(0, 0, ED_CANVAS_W, ED_CANVAS_H);
  }
  // Coordenadas en workspace (px absoluto dentro del canvas de trabajo)
  _wsCoords(nx, ny){
    return {
      x: edMarginX() + nx * edPageW(),
      y: edMarginY() + ny * edPageH()
    };
  }
  beginStroke(nx, ny, color, size, isEraser, opacity){
    const {x,y} = this._wsCoords(nx, ny);
    const alpha = (opacity ?? 100) / 100;
    this._ctx.save();
    this._ctx.globalAlpha = alpha;
    if(isEraser){ this._ctx.globalCompositeOperation='destination-out'; this._ctx.fillStyle='rgba(0,0,0,1)'; }
    else { this._ctx.globalCompositeOperation='source-over'; this._ctx.fillStyle=color; }
    this._ctx.beginPath(); this._ctx.arc(x,y,size/2,0,Math.PI*2); this._ctx.fill();
    this._ctx.restore(); this._ctx.globalCompositeOperation='source-over';
    this._lastX=x; this._lastY=y;
  }
  continueStroke(nx, ny, color, size, isEraser, opacity){
    const {x,y} = this._wsCoords(nx, ny);
    const alpha = (opacity ?? 100) / 100;
    this._ctx.save();
    this._ctx.globalAlpha = alpha;
    this._ctx.beginPath(); this._ctx.moveTo(this._lastX,this._lastY); this._ctx.lineTo(x,y);
    if(isEraser){ this._ctx.globalCompositeOperation='destination-out'; this._ctx.strokeStyle='rgba(0,0,0,1)'; }
    else { this._ctx.globalCompositeOperation='source-over'; this._ctx.strokeStyle=color; }
    this._ctx.lineWidth=size; this._ctx.lineCap='round'; this._ctx.lineJoin='round'; this._ctx.stroke();
    this._ctx.restore(); this._ctx.globalCompositeOperation='source-over';
    this._lastX=x; this._lastY=y;
  }
  draw(ctx){
    // Pintar el workspace entero con el mismo transform de cámara ya activo en ctx
    ctx.save();
    ctx.drawImage(this._canvas, 0, 0);
    ctx.restore();
  }
  contains(px, py){
    // DrawLayer cubre todo el workspace — necesita pixel-hit directo
    try {
      // px,py están en coordenadas normalizadas de página → convertir a workspace px
      const wx = Math.floor(edMarginX() + px * edPageW());
      const wy = Math.floor(edMarginY() + py * edPageH());
      if(wx < 0 || wy < 0 || wx >= this._canvas.width || wy >= this._canvas.height) return false;
      return this._ctx.getImageData(wx, wy, 1, 1).data[3] > 10;
    } catch(e) {
      return true;
    }
  }
}


class StrokeLayer extends BaseLayer {
  constructor(srcCanvas){
    // srcCanvas es el workspace completo (ED_CANVAS_W × ED_CANVAS_H)
    // Calcular bounding box del contenido pintado
    const bb = StrokeLayer._boundingBox(srcCanvas);
    const pw = edPageW(), ph = edPageH();
    if(!bb){
      super('stroke', 0.5, 0.5, 0.1, 0.1);
      this._canvas = document.createElement('canvas');
      this._canvas.width = Math.round(pw * 0.1);
      this._canvas.height = Math.round(ph * 0.1);
      return;
    }
    // Coordenadas fraccionarias relativas a la PÁGINA
    // bb está en coordenadas de workspace → convertir
    const cx = (bb.x + bb.w/2 - edMarginX()) / pw;
    const cy = (bb.y + bb.h/2 - edMarginY()) / ph;
    const fw = bb.w / pw;
    const fh = bb.h / ph;
    super('stroke', cx, cy, fw, fh);
    // Recortar bitmap a la zona del bounding box
    this._canvas = document.createElement('canvas');
    this._canvas.width  = Math.max(1, bb.w);
    this._canvas.height = Math.max(1, bb.h);
    this._canvas.getContext('2d').drawImage(srcCanvas, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
  }
  // Calcular bounding box del contenido no-transparente del canvas
  static _boundingBox(canvas){
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const W = canvas.width, H = canvas.height;
    let minX=W, minY=H, maxX=0, maxY=0, found=false;
    // Iterar buscando solo píxeles CON contenido real (alpha > 10)
    // No contar píxeles borrados (alpha = 0) aunque estén dentro del bb
    for(let y=0; y<H; y++){
      const row = y * W;
      for(let x=0; x<W; x++){
        if(d[(row+x)*4+3] > 10){
          if(x<minX)minX=x; if(x>maxX)maxX=x;
          if(y<minY)minY=y; if(y>maxY)maxY=y;
          found=true;
        }
      }
    }
    if(!found) return null;
    // Margen mínimo (1px) para no cortar antialiasing en el borde exacto
    const pad = 1;
    return {
      x: Math.max(0, minX-pad), y: Math.max(0, minY-pad),
      w: Math.min(W, maxX-minX+1+pad*2),
      h: Math.min(H, maxY-minY+1+pad*2)
    };
  }
  // Restaurar desde dataUrl (carga de proyecto)
  static fromDataUrl(dataUrl, x, y, width, height, pw, ph){
    const sl = new StrokeLayer(document.createElement('canvas'), pw||ED_PAGE_W, ph||ED_PAGE_H);
    sl.x = x; sl.y = y; sl.width = width; sl.height = height;
    const bw = Math.max(1, Math.round(width  * (pw||ED_PAGE_W)));
    const bh = Math.max(1, Math.round(height * (ph||ED_PAGE_H)));
    sl._canvas = document.createElement('canvas');
    sl._canvas.width  = bw;
    sl._canvas.height = bh;
    const img = new Image();
    img.onload = () => {
      sl._canvas.getContext('2d').drawImage(img, 0, 0, bw, bh);
      if(typeof edRedraw === 'function') edRedraw();
    };
    img.src = dataUrl;
    return sl;
  }
  // Exportar bitmap recortado
  toDataUrl(){ return this._canvas.toDataURL(); }
  // Expandir a DrawLayer para edición — devuelve un DrawLayer con el contenido restaurado
  toDrawLayer(){
    // Hacer bake del StrokeLayer con TODAS sus transformaciones aplicadas
    // (rotation, resize, opacity) en un DrawLayer del tamaño del workspace.
    // El resultado visual es idéntico a como se ve en el canvas del editor.
    const dl = new DrawLayer();
    const pw = edPageW(), ph = edPageH();
    const cx = edMarginX() + this.x * pw;
    const cy = edMarginY() + this.y * ph;
    const w  = this.width  * pw;
    const h  = this.height * ph;
    dl._ctx.save();
    dl._ctx.globalAlpha = this.opacity ?? 1;
    dl._ctx.translate(cx, cy);
    dl._ctx.rotate((this.rotation || 0) * Math.PI / 180);
    dl._ctx.drawImage(this._canvas, -w/2, -h/2, w, h);
    dl._ctx.restore();
    return dl;
  }
  draw(ctx){
    if(!this._canvas || this._canvas.width === 0) return;
    const pw = edPageW(), ph = edPageH();
    const w = this.width  * pw;
    const h = this.height * ph;
    const px = edMarginX() + this.x * pw;
    const py = edMarginY() + this.y * ph;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((this.rotation||0) * Math.PI/180);
    ctx.drawImage(this._canvas, -w/2, -h/2, w, h);
    ctx.restore();
  }
  contains(px, py){
    // 1. Bbox rápido primero
    if(!super.contains(px, py)) return false;
    // 2. Pixel-hit real sobre el bitmap recortado
    if(!this._canvas || this._canvas.width === 0) return true;
    try {
      const pw = edPageW(), ph = edPageH();
      // Transformar punto al espacio local del stroke (con rotación)
      const rot = (this.rotation || 0) * Math.PI / 180;
      const dx = (px - this.x) * pw, dy = (py - this.y) * ph;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      const w = this.width * pw, h = this.height * ph;
      // Convertir a coordenadas de píxel en el canvas recortado
      const bx = Math.floor((lx / w + 0.5) * this._canvas.width);
      const by = Math.floor((ly / h + 0.5) * this._canvas.height);
      if(bx < 0 || by < 0 || bx >= this._canvas.width || by >= this._canvas.height) return false;
      return this._canvas.getContext('2d').getImageData(bx, by, 1, 1).data[3] > 10;
    } catch(e) {
      return true; // fallback si falla
    }
  }
}

/* ══════════════════════════════════════════
   SHAPE LAYER — rectángulo y elipse editables
   ══════════════════════════════════════════ */
class ShapeLayer extends BaseLayer {
  constructor(shape='rect', x=0.5, y=0.5, w=0.3, h=0.2) {
    super('shape', x, y, w, h);
    this.shape     = shape;       // 'rect' | 'ellipse'
    this.color     = '#000000';   // color del borde
    this.fillColor = 'none';       // sin relleno por defecto
    this.lineWidth = 3;
    this.opacity   = 1;
  }
  draw(ctx) {
    const pw = edPageW(), ph = edPageH();
    const mx = edMarginX(), my = edMarginY();
    const cx = mx + this.x * pw;
    const cy = my + this.y * ph;
    const w  = this.width  * pw;
    const h  = this.height * ph;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * (this.opacity ?? 1);
    ctx.translate(cx, cy);
    ctx.rotate((this.rotation || 0) * Math.PI / 180);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (this.shape === 'ellipse') {
      ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2);
    } else {
      // Radios por vértice (TL, TR, BR, BL) o radio global
      const crs=this.cornerRadii;
      if(crs&&crs.length===4&&crs.some(r=>r>0)){
        const maxR=Math.min(w,h)/2;
        ctx.roundRect(-w/2,-h/2,w,h,crs.map(r=>Math.min(r||0,maxR)));
      } else {
        const cr=this.cornerRadius||0;
        if(cr>0){ ctx.roundRect(-w/2,-h/2,w,h,Math.min(cr,Math.min(w,h)/2)); }
        else { ctx.rect(-w/2,-h/2,w,h); }
      }
    }
    if (this.fillColor && this.fillColor !== 'none') {
      ctx.fillStyle = this.fillColor;
      ctx.fill();
    }
    if (this.lineWidth > 0) {
      ctx.strokeStyle = this.color;
      ctx.lineWidth   = this.lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }
  contains(px, py) {
    // 1. Bbox rápido primero
    if (!super.contains(px, py)) return false;
    // 2. Pixel-hit real — renderizar en offscreen y leer alpha
    try {
      const pw = edPageW(), ph = edPageH();
      const w  = this.width  * pw;
      const h  = this.height * ph;
      // Transformar punto al espacio local (con rotación)
      const rot = (this.rotation || 0) * Math.PI / 180;
      const dx = (px - this.x) * pw, dy = (py - this.y) * ph;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      // Crear canvas offscreen del tamaño de la shape
      const cw = Math.max(1, Math.ceil(w)), ch = Math.max(1, Math.ceil(h));
      const oc = document.createElement('canvas');
      oc.width = cw; oc.height = ch;
      const octx = oc.getContext('2d');
      octx.translate(cw/2, ch/2);
      octx.beginPath();
      if (this.shape === 'ellipse') {
        octx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2);
      } else {
        octx.rect(-w/2, -h/2, w, h);
      }
      if (this.fillColor && this.fillColor !== 'none') {
        octx.fillStyle = this.fillColor;
        octx.fill();
      }
      // Usar el lineWidth real para el hit-test
      if (this.lineWidth > 0) {
        octx.strokeStyle = '#000';
        octx.lineWidth = this.lineWidth;
        octx.stroke();
      }
      const bx = Math.floor(lx + cw/2);
      const by = Math.floor(ly + ch/2);
      if (bx < 0 || by < 0 || bx >= cw || by >= ch) return false;
      return octx.getImageData(bx, by, 1, 1).data[3] > 10;
    } catch(e) {
      return true;
    }
  }
}

/* ══════════════════════════════════════════
   LINE LAYER — rectas y polígonos editables
   Vértices en coordenadas normalizadas (0-1) de la página
   ══════════════════════════════════════════ */
class LineLayer extends BaseLayer {
  constructor() {
    super('line', 0.5, 0.5, 0, 0);
    this.points    = [];   // coords normalizadas en espacio LOCAL (relativas al centro, sin rotación)
    this.closed    = false;
    this.color     = '#000000';
    this.fillColor = 'none';       // sin relleno por defecto
    this.lineWidth = 3;
    this.opacity   = 1;
    // rotation heredado de BaseLayer
  }
  // Recalcular bbox desde puntos locales; centra los puntos en (0,0)
  _updateBbox() {
    if (!this.points.length) return;
    const pw = edPageW(), ph = edPageH();
    const xs = this.points.map(p => p.x);
    const ys = this.points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const newCx = (minX + maxX) / 2;  // en unidades normalizadas
    const newCy = (minY + maxY) / 2;
    if (Math.abs(newCx) > 0.0001 || Math.abs(newCy) > 0.0001) {
      // El desplazamiento del centro debe aplicarse en espacio rotado con escala pw/ph
      // igual que hace draw(): translate(cx,cy) + rotate(rot) + point(p.x*pw, p.y*ph)
      const rot = (this.rotation || 0) * Math.PI / 180;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const dxPx = newCx * pw, dyPx = newCy * ph; // en píxeles
      this.x += (dxPx * cos - dyPx * sin) / pw;
      this.y += (dxPx * sin + dyPx * cos) / ph;
      this.points = this.points.map(p => ({x: p.x - newCx, y: p.y - newCy}));
    }
    const xs2 = this.points.map(p => p.x);
    const ys2 = this.points.map(p => p.y);
    this.width  = Math.max(Math.max(...xs2) - Math.min(...xs2), 0.01);
    this.height = Math.max(Math.max(...ys2) - Math.min(...ys2), 0.01);
  }
  // Puntos en coords absolutas (para primera inserción y cerrar polígono)
  absPoints() {
    const rot = (this.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    return this.points.map(p => ({
      x: this.x + p.x * cos - p.y * sin,
      y: this.y + p.x * sin + p.y * cos
    }));
  }
  // Añadir punto en coords absolutas (convierte a local)
  addAbsPoint(ax, ay) {
    const rot = -(this.rotation || 0) * Math.PI / 180;
    const dx = ax - this.x, dy = ay - this.y;
    this.points.push({
      x: dx * Math.cos(rot) - dy * Math.sin(rot),
      y: dx * Math.sin(rot) + dy * Math.cos(rot)
    });
    this._updateBbox();
  }
  draw(ctx) {
    if (this.points.length < 2) return;
    const pw = edPageW(), ph = edPageH();
    const cx = edMarginX() + this.x * pw;
    const cy = edMarginY() + this.y * ph;
    const rot = (this.rotation || 0) * Math.PI / 180;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * (this.opacity ?? 1);
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';
    // Construir el path con curvas en los vértices marcados (arcTo)
    const pts = this.points;
    const cr = this.cornerRadii || {};
    const n = pts.length;
    // Función que convierte punto normalizado a px
    const px2 = p => ({x: p.x*pw, y: p.y*ph});
    ctx.beginPath();
    // Encontrar el primer punto de inicio (puede ser curvado)
    const startIdx = this.closed ? 0 : 0;
    const totalPts = this.closed ? n : n;
    // Dibujar: para cada punto intermedio con radio, usar arcTo
    const drawPts = this.closed ? [...pts, pts[0], pts[1]] : pts;
    if(!this.closed){
      const p0=px2(pts[0]);
      ctx.moveTo(p0.x,p0.y);
      for(let i=1;i<n;i++){
        const r=cr[i]||0;
        if(r>0 && i<n-1){
          const prev=px2(pts[i-1]), cur=px2(pts[i]), next=px2(pts[i+1]);
          // Longitud de los segmentos adyacentes
          const d1=Math.hypot(cur.x-prev.x,cur.y-prev.y);
          const d2=Math.hypot(next.x-cur.x,next.y-cur.y);
          // Limitar radio a la longitud del segmento más corto - 2px
          const maxR=Math.min(d1,d2)-2;
          const rr=Math.max(0,Math.min(r,maxR));
          ctx.arcTo(cur.x,cur.y,next.x,next.y,rr);
        } else {
          const p=px2(pts[i]); ctx.lineTo(p.x,p.y);
        }
      }
    } else {
      // Polígono cerrado: todos los vértices pueden tener radio
      for(let i=0;i<n;i++){
        const r=cr[i]||0;
        const prev=px2(pts[(i-1+n)%n]), cur=px2(pts[i]), next=px2(pts[(i+1)%n]);
        const d1=Math.hypot(cur.x-prev.x,cur.y-prev.y);
        const d2=Math.hypot(next.x-cur.x,next.y-cur.y);
        const maxR=Math.min(d1,d2)-2;
        const rr=r>0?Math.max(0,Math.min(r,maxR)):0;
        if(i===0){
          if(rr>0){
            // Empezar en el punto medio del segmento previo→cur
            const t=rr/d1;
            ctx.moveTo(cur.x-(cur.x-prev.x)*t, cur.y-(cur.y-prev.y)*t);
          } else {
            ctx.moveTo(cur.x,cur.y);
          }
        }
        if(rr>0){ ctx.arcTo(cur.x,cur.y,next.x,next.y,rr); }
        else     { ctx.lineTo(cur.x,cur.y); }
      }
      ctx.closePath();
    }
    if (this.closed && this.fillColor && this.fillColor !== 'none') {
      ctx.fillStyle = this.fillColor;
      ctx.fill();
    }
    if (this.lineWidth > 0) {
      ctx.strokeStyle = this.color;
      ctx.lineWidth   = this.lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }
  contains(px, py) {
    if (this.points.length < 2) return false;
    // 1. Bbox rápido primero
    if (!super.contains(px, py)) return false;
    // 2. Pixel-hit real — renderizar en offscreen y leer alpha
    try {
      const pw = edPageW(), ph = edPageH();
      const w  = this.width  * pw;
      const h  = this.height * ph;
      // Transformar punto al espacio local (con rotación)
      const rot = (this.rotation || 0) * Math.PI / 180;
      const dx = (px - this.x) * pw, dy = (py - this.y) * ph;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      // Canvas offscreen del tamaño del bbox de la línea
      const pad = Math.max(this.lineWidth || 3, 8); // margen para el trazo
      const cw = Math.max(1, Math.ceil(w) + pad*2);
      const ch = Math.max(1, Math.ceil(h) + pad*2);
      const oc = document.createElement('canvas');
      oc.width = cw; oc.height = ch;
      const octx = oc.getContext('2d');
      // Origen en centro del bbox + pad
      octx.translate(cw/2, ch/2);
      octx.beginPath();
      const pts = this.points;
      octx.moveTo(pts[0].x * pw, pts[0].y * ph);
      for (let i = 1; i < pts.length; i++) {
        octx.lineTo(pts[i].x * pw, pts[i].y * ph);
      }
      if (this.closed) octx.closePath();
      if (this.closed && this.fillColor && this.fillColor !== 'none') {
        octx.fillStyle = this.fillColor;
        octx.fill();
      }
      octx.strokeStyle = '#000';
      octx.lineWidth = Math.max(this.lineWidth > 0 ? Math.max(this.lineWidth, 8) : 0, 0);
      if (this.lineWidth > 0) octx.stroke();
      const bx = Math.floor(lx + cw/2);
      const by = Math.floor(ly + ch/2);
      if (bx < 0 || by < 0 || bx >= cw || by >= ch) return false;
      return octx.getImageData(bx, by, 1, 1).data[3] > 10;
    } catch(e) {
      return true;
    }
  }
  nearestVertex(px, py, threshold=0.03) {
    const pw = edPageW(), ph = edPageH();
    const abs = this.absPoints();
    let best = -1, bestD = Infinity;
    abs.forEach((p, i) => {
      const dx = (px - p.x) * pw, dy = (py - p.y) * ph;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < bestD) { bestD = d; best = i; }
    });
    return (bestD < threshold * Math.min(pw, ph)) ? best : -1;
  }
  // getControlPoints() heredado de BaseLayer — usa this.rotation correctamente
}

/* ══════════════════════════════════════════
   HISTORIAL UNDO / REDO
   ══════════════════════════════════════════ */
function _edLayersSnapshot(){
  return JSON.stringify(edLayers.map(l => {
    if(l.type === 'draw')   return { type: 'draw',   dataUrl: l.toDataUrl() };
    if(l.type === 'stroke') return { type: 'stroke', dataUrl: l.toDataUrl(),
      x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0, opacity:l.opacity };
    if(l.type === 'shape')  return { type:'shape', shape:l.shape, x:l.x, y:l.y,
      width:l.width, height:l.height, rotation:l.rotation||0,
      color:l.color, fillColor:l.fillColor||'none', lineWidth:l.lineWidth, opacity:l.opacity??1 };
    if(l.type === 'line')   return { type:'line', points:l.points.slice(),
      x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0,
      closed:l.closed, color:l.color, fillColor:l.fillColor||'#ffffff', lineWidth:l.lineWidth, opacity:l.opacity??1 };
    const o = {};
    for(const k of ['type','x','y','width','height','rotation',
                    'text','fontSize','fontFamily','fontBold','fontItalic','color','backgroundColor',
                    'borderColor','borderWidth','padding','explosionRadii','thoughtBig','thoughtSmall',
                    'tail','tailStart','tailEnd','tailStarts','tailEnds','style','voiceCount']){
      if(l[k] !== undefined) o[k] = l[k];
    }
    if(l.img && l.img.complete && l.img.naturalWidth > 0) o._imgSrc = l.img.src || '';
    return o;
  }));
}

function edPushHistory(){
  const layersJSON = _edLayersSnapshot();
  if(edHistory.length > 0 && edHistoryIdx >= 0){
    const last = edHistory[edHistoryIdx];
    if(last.layersJSON === layersJSON) return;
  }
  edHistory = edHistory.slice(0, edHistoryIdx + 1);
  edHistory.push({ pageIdx: edCurrentPage, layersJSON });
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
    else if(o.type === 'draw') {
      const _isV = (edPages[snapshot.pageIdx]?.orientation||edOrientation)==='vertical';
      l = o.dataUrl ? DrawLayer.fromDataUrl(o.dataUrl, _isV?ED_PAGE_W:ED_PAGE_H, _isV?ED_PAGE_H:ED_PAGE_W)
                    : new DrawLayer();
      return l;
    }
    else if(o.type === 'stroke') {
      const _isV = (edPages[snapshot.pageIdx]?.orientation||edOrientation)==='vertical';
      const _pw = _isV?ED_PAGE_W:ED_PAGE_H, _ph = _isV?ED_PAGE_H:ED_PAGE_W;
      l = StrokeLayer.fromDataUrl(o.dataUrl||'', o.x||0.5, o.y||0.5, o.width||0.1, o.height||0.1, _pw, _ph);
      if(o.rotation) l.rotation=o.rotation;
      if(o.opacity !== undefined) l.opacity=o.opacity;
      return l;
    }
    else if(o.type === 'shape') {
      l = new ShapeLayer(o.shape||'rect', o.x||0.5, o.y||0.5, o.width||0.3, o.height||0.2);
      l.color=o.color||'#000'; l.fillColor=o.fillColor||'none'; l.lineWidth=o.lineWidth||3; l.rotation=o.rotation||0; l.opacity=o.opacity??1;
      return l;
    }
    else if(o.type === 'line') {
      l = new LineLayer();
      l.points=o.points||[]; l.closed=o.closed||false;
      l.color=o.color||'#000'; l.fillColor=o.fillColor||'#ffffff'; l.lineWidth=o.lineWidth||3; l.opacity=o.opacity??1;
      l.rotation=o.rotation||0;
      if(o.x!=null){l.x=o.x;l.y=o.y;l.width=o.width||0.01;l.height=o.height||0.01;}
      else l._updateBbox();
      return l;
    }
    else return o;
    for(const k of Object.keys(o)){
      if(k !== '_imgSrc') l[k] = o[k];
    }
    if(o._imgSrc){
      const p = new Promise(resolve => {
        const img = new Image();
        img.onload  = () => {
          l.img = img;
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
  }
  edSelectedIdx = -1;
  edPanelUserClosed = false;
  edUpdateUndoRedoBtns();
  // Navegar a la página del snapshot si es distinta a la actual
  if(snapshot.pageIdx !== edCurrentPage && edPages[snapshot.pageIdx]){
    edCurrentPage = snapshot.pageIdx;
    edLayers = edPages[edCurrentPage].layers;
    const _po = edPages[edCurrentPage].orientation || 'vertical';
    if(_po !== edOrientation) edOrientation = _po;
    edUpdateNavPages();
  }
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
  // Preservar cámara salvo reset explícito autorizado por el usuario
  const _savedCam = {x:edCamera.x, y:edCamera.y, z:edCamera.z};
  const _doReset = resetCamera && window._edUserRequestedReset;

  const topbar=$('edTopbar'), menu=$('edMenuBar'), opts=$('edOptionsPanel');

  const topH  = (!edMinimized && topbar)  ? topbar.getBoundingClientRect().height  : 0;
  const menuH = (!edMinimized && menu)    ? menu.getBoundingClientRect().height    : 0;
  const optsH = (opts && opts.classList.contains('open') && opts.style.visibility !== 'hidden') ? opts.getBoundingClientRect().height : 0;
  if(menu && !edMinimized) menu.style.top = topH + 'px';
  if(opts) opts.style.top = (topH + menuH) + 'px';
  const totalBarsH = topH + menuH + optsH;

  const availW = window.innerWidth;
  const availH = window.innerHeight - totalBarsH;

  const newW = Math.round(availW);
  const newH = Math.round(availH);

  // Detectar cambio de VENTANA (no de panel de opciones)
  // _edWinW/_edWinH solo cambian con resize de ventana real
  // Actualizar dimensiones conocidas — sin resetear cámara automáticamente
  // La cámara solo se resetea cuando se pide explícitamente (primera carga, lupa, orientación)
  window._edWinW = window.innerWidth;
  window._edWinH = window.innerHeight;

  // Redimensionar canvas si es necesario (sin resetear cámara por cambio de panel)
  const _prevW = edCanvas.width, _prevH = edCanvas.height;
  const _sizeChanged = _prevW !== newW || _prevH !== newH;
  if(_sizeChanged){
    edCanvas.width  = newW;
    edCanvas.height = newH;
    // No mover la cámara al cambiar de tamaño por el panel de opciones.
    // El canvas crece/encoge hacia abajo; el viewport queda anclado.
  }
  edCanvas.style.width  = newW + 'px';
  edCanvas.style.height = newH + 'px';
  edCanvas.style.position = 'absolute';
  edCanvas.style.left = '0';
  edCanvas.style.top  = totalBarsH + 'px';
  edCanvas.style.margin = '0';
  // Mantener el canvas de dibujo libre sincronizado en posición y tamaño
  if(edDrawCanvas){
    const _sizeChangedDraw = edDrawCanvas.width !== newW || edDrawCanvas.height !== newH;
    if(_sizeChangedDraw){ edDrawCanvas.width = newW; edDrawCanvas.height = newH; }
    edDrawCanvas.style.width  = newW + 'px';
    edDrawCanvas.style.height = newH + 'px';
    edDrawCanvas.style.position = 'absolute';
    edDrawCanvas.style.left = '0';
    edDrawCanvas.style.top  = totalBarsH + 'px';
    edDrawCanvas.style.margin = '0';
  }

  if(_doReset){
    window._edUserRequestedReset = false;
    _edCameraReset();
  } else {
    // Restaurar cámara — el resize del canvas no debe moverla
    edCamera.x = _savedCam.x;
    edCamera.y = _savedCam.y;
    edCamera.z = _savedCam.z;
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
/* ══════════════════════════════════════════
   MULTI-SELECCIÓN — helpers
   ══════════════════════════════════════════ */

// AABB axis-aligned que engloba todos los objetos de edMultiSel
function _msBBox(){
  if(!edMultiSel.length) return null;
  const pw=edPageW(), ph=edPageH();
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const i of edMultiSel){
    const la=edLayers[i]; if(!la) continue;
    const rot=(la.rotation||0)*Math.PI/180;
    const hw=la.width/2, hh=la.height/2;
    for(const [cx,cy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]]){
      const wx=cx*pw, wy=cy*ph;
      const rx=(wx*Math.cos(rot)-wy*Math.sin(rot))/pw;
      const ry=(wx*Math.sin(rot)+wy*Math.cos(rot))/ph;
      x0=Math.min(x0,la.x+rx); y0=Math.min(y0,la.y+ry);
      x1=Math.max(x1,la.x+rx); y1=Math.max(y1,la.y+ry);
    }
  }
  return {cx:(x0+x1)/2, cy:(y0+y1)/2, w:x1-x0, h:y1-y0, x0,y0,x1,y1};
}

// 8 handles de escala del bbox colectivo (coords norm)
function _msHandles(bb){
  const {cx,cy,w,h}=bb;
  return[
    {x:cx-w/2,y:cy-h/2,c:'tl'},{x:cx+w/2,y:cy-h/2,c:'tr'},
    {x:cx-w/2,y:cy+h/2,c:'bl'},{x:cx+w/2,y:cy+h/2,c:'br'},
    {x:cx,    y:cy-h/2,c:'mt'},{x:cx,    y:cy+h/2,c:'mb'},
    {x:cx-w/2,y:cy,    c:'ml'},{x:cx+w/2,y:cy,    c:'mr'},
  ];
}

// Dibuja bbox + handles de escala + handle de rotación idéntico al individual
function edDrawMultiSel(){
  if(!edMultiSel.length || !edMultiBbox) return;
  const pw=edPageW(),ph=edPageH(),z=edCamera.z;
  const lw=1/z, hr=6/z, hrRot=8/z;
  // Siempre usar edMultiBbox (estado persistente mantenido por _msRecalcBbox).
  // Durante resize activo: escalar dimensiones por los factores del gesto.
  const bb = {
    cx: edMultiBbox.cx,
    cy: edMultiBbox.cy,
    w: edMultiResizing && edMultiTransform
      ? edMultiBbox.w * (edMultiTransform._curSx ?? 1)
      : edMultiBbox.w,
    h: edMultiResizing && edMultiTransform
      ? edMultiBbox.h * (edMultiTransform._curSy ?? 1)
      : edMultiBbox.h,
  };

  edCtx.save();
  // Contornos individuales suaves
  for(const i of edMultiSel){
    const la=edLayers[i]; if(!la) continue;
    const rot=(la.rotation||0)*Math.PI/180;
    const cx=edMarginX()+la.x*pw, cy=edMarginY()+la.y*ph;
    const w=la.width*pw, h=la.height*ph;
    edCtx.save();
    edCtx.translate(cx,cy); edCtx.rotate(rot);
    edCtx.strokeStyle='rgba(26,140,255,0.4)';
    edCtx.lineWidth=lw; edCtx.setLineDash([4/z,3/z]);
    edCtx.strokeRect(-w/2,-h/2,w,h);
    edCtx.setLineDash([]);
    edCtx.restore();
  }
  // Bbox colectivo — dibujado en espacio local (translate+rotate) igual que el individual
  const grRad = edMultiGroupRot * Math.PI / 180;
  const gcx = edMarginX()+bb.cx*pw, gcy = edMarginY()+bb.cy*ph;
  const bw=bb.w*pw, bh=bb.h*ph;

  edCtx.save();
  edCtx.translate(gcx, gcy);
  edCtx.rotate(grRad);

  // Marco del bbox
  edCtx.strokeStyle='#1a8cff'; edCtx.lineWidth=1.5/z;
  edCtx.setLineDash([6/z,3/z]);
  edCtx.strokeRect(-bw/2, -bh/2, bw, bh);
  edCtx.setLineDash([]);

  // En táctil: handles invisibles — la interacción es solo por gestos (pinch)
  const _drawHandles = !edLastPointerIsTouch;
  if(!edLastPointerIsTouch){
    // Handles de escala (en espacio local)
    const corners=[
      [-bw/2,-bh/2],[bw/2,-bh/2],[-bw/2,bh/2],[bw/2,bh/2],
      [0,-bh/2],[0,bh/2],[-bw/2,0],[bw/2,0],
    ];
    for(const [hx,hy] of corners){
      edCtx.beginPath(); edCtx.arc(hx,hy,hr,0,Math.PI*2);
      edCtx.fillStyle='#fff'; edCtx.fill();
      edCtx.strokeStyle='#1a8cff'; edCtx.lineWidth=lw*1.5; edCtx.stroke();
    }
    // Handle de rotación — línea + círculo + flecha
    const rotY = -bh/2 - 28/z;
    edCtx.beginPath(); edCtx.moveTo(0,-bh/2); edCtx.lineTo(0,rotY+hrRot);
    edCtx.strokeStyle='#1a8cff'; edCtx.lineWidth=lw; edCtx.stroke();
    edCtx.beginPath(); edCtx.arc(0,rotY,hrRot,0,Math.PI*2);
    edCtx.fillStyle='#1a8cff'; edCtx.fill();
    edCtx.strokeStyle='#fff'; edCtx.lineWidth=lw*1.5; edCtx.stroke();
    edCtx.strokeStyle='#fff'; edCtx.lineWidth=lw*1.5;
    const ar=hrRot*0.55;
    edCtx.beginPath(); edCtx.arc(0,rotY,ar,-Math.PI*0.9,Math.PI*0.5); edCtx.stroke();
    const ax=ar*Math.cos(Math.PI*0.5), ay=rotY+ar*Math.sin(Math.PI*0.5);
    edCtx.beginPath();
    edCtx.moveTo(ax,ay); edCtx.lineTo(ax-3/z,ay-5/z);
    edCtx.moveTo(ax,ay); edCtx.lineTo(ax+4/z,ay-3/z);
    edCtx.stroke();
  }

  edCtx.restore();

  // Marquesina de selección activa
  if(edRubberBand){
    const rx=edMarginX()+edRubberBand.x0*pw, ry=edMarginY()+edRubberBand.y0*ph;
    const rw=(edRubberBand.x1-edRubberBand.x0)*pw, rh=(edRubberBand.y1-edRubberBand.y0)*ph;
    edCtx.strokeStyle='#1a8cff'; edCtx.lineWidth=1.5/z;
    edCtx.setLineDash([5/z,3/z]);
    edCtx.fillStyle='rgba(26,140,255,0.06)';
    edCtx.fillRect(rx,ry,rw,rh); edCtx.strokeRect(rx,ry,rw,rh);
    edCtx.setLineDash([]);
  }
  edCtx.restore();
}

// Dibuja solo la marquesina (cuando aún no hay selección)
function edDrawRubberBand(){
  if(!edRubberBand) return;
  const pw=edPageW(),ph=edPageH(),z=edCamera.z;
  const rx=edMarginX()+edRubberBand.x0*pw, ry=edMarginY()+edRubberBand.y0*ph;
  const rw=(edRubberBand.x1-edRubberBand.x0)*pw, rh=(edRubberBand.y1-edRubberBand.y0)*ph;
  edCtx.save();
  edCtx.strokeStyle='#1a8cff'; edCtx.lineWidth=1.5/z;
  edCtx.setLineDash([5/z,3/z]);
  edCtx.fillStyle='rgba(26,140,255,0.06)';
  edCtx.fillRect(rx,ry,rw,rh); edCtx.strokeRect(rx,ry,rw,rh);
  edCtx.setLineDash([]);
  edCtx.restore();
}

function _msClear(){
  edMultiSel=[]; edMultiDragging=false; edMultiResizing=false; edMultiRotating=false;
  edRubberBand=null; edMultiDragOffs=[]; edMultiTransform=null; edMultiGroupRot=0;
  edMultiBbox=null;
}

function _edDeactivateMultiSel(){
  const prev=edMultiSel.length===1?edMultiSel[0]:-1;
  _msClear();
  edActiveTool='select';
  if(edCanvas) edCanvas.className='';
  const btn = document.getElementById('edMultiSelBtn');
  if(btn) btn.classList.remove('active');
  if(prev>=0&&prev<edLayers.length) edSelectedIdx=prev;
  edRedraw();
}

// Recalcula edMultiBbox en espacio LOCAL del grupo (desrotado por edMultiGroupRot).
// Es el ÚNICO sitio que escribe en edMultiBbox.
// Llamar: al confirmar rubber band, al soltar rotate, al soltar resize, al soltar drag.
function _msRecalcBbox(){
  if(!edMultiSel.length){ edMultiBbox=null; return; }
  const pw=edPageW(), ph=edPageH();
  const gr = edMultiGroupRot * Math.PI / 180;
  const cg = Math.cos(-gr), sg = Math.sin(-gr);
  // Centroide de los centros de los objetos
  let pivX=0, pivY=0, n=0;
  for(const i of edMultiSel){
    const la=edLayers[i]; if(!la) continue;
    pivX+=la.x; pivY+=la.y; n++;
  }
  if(!n){ edMultiBbox=null; return; }
  pivX/=n; pivY/=n;
  // AABB de todos los vértices desrotados al espacio local del grupo
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const i of edMultiSel){
    const la=edLayers[i]; if(!la) continue;
    const rot=(la.rotation||0)*Math.PI/180;
    const hw=la.width/2, hh=la.height/2;
    for(const [lcx,lcy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]]){
      const wx=lcx*pw, wy=lcy*ph;
      const vx = la.x + (wx*Math.cos(rot)-wy*Math.sin(rot))/pw;
      const vy = la.y + (wx*Math.sin(rot)+wy*Math.cos(rot))/ph;
      const dx=(vx-pivX)*pw, dy=(vy-pivY)*ph;
      const lx = pivX + (dx*cg - dy*sg)/pw;
      const ly = pivY + (dx*sg + dy*cg)/ph;
      x0=Math.min(x0,lx); y0=Math.min(y0,ly);
      x1=Math.max(x1,lx); y1=Math.max(y1,ly);
    }
  }
  // Centro del bbox local → rotar al espacio global
  const lcxC=(x0+x1)/2, lcyC=(y0+y1)/2;
  const dcx=(lcxC-pivX)*pw, dcy=(lcyC-pivY)*ph;
  const cr=Math.cos(gr), sr=Math.sin(gr);
  const gcx = pivX + (dcx*cr - dcy*sr)/pw;
  const gcy = pivY + (dcx*sr + dcy*cr)/ph;
  edMultiBbox = {
    w:  x1-x0,
    h:  y1-y0,
    cx: gcx,
    cy: gcy,
    // offset centro→centroide en espacio LOCAL rotado (fracción de página)
    // se aplica durante drag para mover el marco sin recalcular todo
    offX: (lcxC - pivX),
    offY: (lcyC - pivY),
  };
}

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
  const _imgLayers    = edLayers.filter(l=>l.type==='image');
  const _strokeLayers = edLayers.filter(l=>l.type==='stroke');
  const _textLayers   = edLayers.filter(l=>l.type==='text'||l.type==='bubble');
  // Opacidad global de la capa de textos (máximo de todos sus objetos individuales,
  // o bien edPage.textLayerOpacity si se definió desde el panel de capas)
  const _textGroupAlpha = page.textLayerOpacity ?? 1;

  // T11: Dimming del resto de capas al editar un objeto o al dibujar
  const _panel = $('edOptionsPanel');
  const _panelOpen = _panel?.classList.contains('open');
  // En modo props: dimear todo excepto el objeto seleccionado
  // En modo draw/eraser/fill: dimear todo excepto el DrawLayer activo
  const _editingProps = _panelOpen && _panel.dataset.mode === 'props' && edSelectedIdx >= 0;
  const _editingDraw  = ['draw','eraser','fill'].includes(edActiveTool) &&
    (_panelOpen || $('edDrawBar')?.classList.contains('visible'));
  const _editingShape = (_panelOpen && (_panel.dataset.mode==='shape' || _panel.dataset.mode==='line'))
    || !!_edShapePreview || !!_edLineLayer

  const _dimming = _editingProps || _editingDraw || _editingShape;

  // Renderizar en orden del array: imagen, stroke y draw en su posición relativa.
  // Textos/bocadillos siempre al final (encima de todo).
  edLayers.forEach((l,i)=>{
    if(l.type==='text'||l.type==='bubble') return; // los textos se dibujan después
    if(_editingDraw && l.type==='draw') return;    // en modo draw, el draw va al final
    let dimmed = false;
    if(_editingProps) dimmed = (i !== edSelectedIdx);
    else if(_editingDraw) dimmed = true;           // en modo draw, todo lo demás dimeado
    else if(_editingShape) dimmed = (l === _edShapePreview || l === _edLineLayer || i === edSelectedIdx) ? false : true;
    const dimFactor = dimmed ? 0.5 : 1;
    if(l.type==='image'){
      const _orig = l.opacity; l.opacity = (l.opacity ?? 1) * dimFactor;
      l.draw(edCtx, edCanvas);
      l.opacity = _orig;
    } else if(l.type==='draw'){
      edCtx.globalAlpha = dimFactor;
      l.draw(edCtx);
      edCtx.globalAlpha = 1;
    } else if(l.type==='stroke'){
      edCtx.globalAlpha = (l.opacity ?? 1) * dimFactor;
      l.draw(edCtx);
      edCtx.globalAlpha = 1;
    } else if(l.type==='shape' || l.type==='line'){
      edCtx.globalAlpha = dimFactor;
      l.draw(edCtx);
      edCtx.globalAlpha = 1;
    }
  });
  // Textos: dimear en modo draw, shape/line, o si hay objeto no-texto seleccionado
  const _dimTexts = _editingDraw
    || _editingShape
    || (_editingProps && edLayers[edSelectedIdx]?.type !== 'text' && edLayers[edSelectedIdx]?.type !== 'bubble');
  edCtx.globalAlpha = _textGroupAlpha * (_dimTexts ? 0.5 : 1);
  _textLayers.forEach(l=>{ l.draw(edCtx,edCanvas); });
  edCtx.globalAlpha = 1;
  // En modo draw: DrawLayer al final, encima de shapes/textos dimeados
  if(_editingDraw){
    const _dl = edLayers.find(l => l.type==='draw');
    if(_dl){ _dl.draw(edCtx); }
  }
  edDrawSel();
  // ── Indicador parpadeante del primer punto de una línea en construcción ──
  if(_edLineLayer && _edLineLayer.points.length === 1){
    const pw=edPageW(), ph=edPageH();
    const absP=_edLineLayer.absPoints()[0];
    const px=edMarginX()+absP.x*pw, py=edMarginY()+absP.y*ph;
    const blink = Math.sin(Date.now()/200)*0.5+0.5; // 0..1 parpadeante
    edCtx.save();
    edCtx.globalAlpha = 0.4+blink*0.6;
    edCtx.beginPath();
    edCtx.arc(px, py, 8/edCamera.z, 0, Math.PI*2);
    edCtx.fillStyle='#1a8cff';
    edCtx.fill();
    edCtx.globalAlpha = 1;
    edCtx.beginPath();
    edCtx.arc(px, py, 4/edCamera.z, 0, Math.PI*2);
    edCtx.fillStyle='#ffffff';
    edCtx.fill();
    edCtx.restore();
    // Solicitar siguiente frame para animar el parpadeo
    requestAnimationFrame(()=>{ if(_edLineLayer?.points.length===1) edRedraw(); });
  }
  // Multi-selección: bbox colectivo encima de todo, o marquesina si está arrastrando
  if(edActiveTool==='multiselect'){
    if(edMultiSel.length) edDrawMultiSel();
    else edDrawRubberBand();
  }
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
  const z=edCamera.z;
  const lw=1/z;
  const hr=6/z;
  const hrRot=8/z;

  // LineLayer: dibujar también la silueta del polígono rotado
  if(la.type==='line'){
    const mx=edMarginX(), my=edMarginY();
    const cx=mx+la.x*pw, cy=my+la.y*ph;
    const rot=(la.rotation||0)*Math.PI/180;
    if(la.points.length>=2){
      edCtx.save();
      edCtx.translate(cx,cy); edCtx.rotate(rot);
      edCtx.strokeStyle='rgba(26,140,255,0.5)'; edCtx.lineWidth=lw;
      edCtx.setLineDash([4/z,3/z]);
      edCtx.beginPath();
      edCtx.moveTo(la.points[0].x*pw, la.points[0].y*ph);
      for(let i=1;i<la.points.length;i++) edCtx.lineTo(la.points[i].x*pw, la.points[i].y*ph);
      if(la.closed) edCtx.closePath();
      edCtx.stroke();
      edCtx.setLineDash([]);
      edCtx.restore();
    }
  }

  const cx=edMarginX()+la.x*pw, cy=edMarginY()+la.y*ph;
  const w=la.width*pw;
  const h=la.height*ph;
  const rot=(la.rotation||0)*Math.PI/180;
  edCtx.save();
  edCtx.translate(cx,cy);
  edCtx.rotate(rot);
  // En modo V⟺C: solo mostrar marco tenue, ocultar handles de resize/rotate
  const _curveMode=_edCurveModeActive&&_edCurveModeActive();
  edCtx.strokeStyle='#1a8cff';
  edCtx.lineWidth=lw;
  edCtx.setLineDash([5/z,3/z]);
  edCtx.strokeRect(-w/2,-h/2,w,h);
  edCtx.setLineDash([]);
  // Handles de escala y rotación — solo en PC (no táctil)
  if(la.type!=='bubble' && !edLastPointerIsTouch){
    if(!_curveMode){
    const corners=[
      [-w/2,-h/2],[ w/2,-h/2],[-w/2, h/2],[ w/2, h/2],
      [   0,-h/2],[   0, h/2],[-w/2,   0],[ w/2,   0],
    ];
    corners.forEach(([hx,hy])=>{
      edCtx.beginPath();edCtx.arc(hx,hy,hr,0,Math.PI*2);
      edCtx.fillStyle='#fff';edCtx.fill();
      edCtx.strokeStyle='#1a8cff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
    });
    // Handle de rotación: solo en PC (en táctil se usa gesto pinch)
    if(!edLastPointerIsTouch){
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
  } // cierra if(!_curveMode)
  } // cierra if(la.type!=='bubble' && !edLastPointerIsTouch)
  // Cerrar el bloque rotado antes de dibujar los handles de cola
  edCtx.restore();
  // Handles cola bocadillo — en coordenadas de workspace absolutas (sin rotación)
  if(la.type==='bubble'){
    const tcp=la.getTailControlPoints();
    const byVoice={};
    tcp.forEach(p=>{ if(!byVoice[p.voice])byVoice[p.voice]={}; byVoice[p.voice][p.type]=p; });
    // Handles cola (no para thought — usa sus propios handles)
    if(la.style!=='thought'){
      Object.values(byVoice).forEach(v=>{
        if(!v.start||!v.end)return;
        const sx=edMarginX()+v.start.x*pw, sy=edMarginY()+v.start.y*ph;
        const ex=edMarginX()+v.end.x*pw,   ey=edMarginY()+v.end.y*ph;
        edCtx.beginPath();edCtx.moveTo(sx,sy);edCtx.lineTo(ex,ey);
        edCtx.strokeStyle='rgba(26,140,255,0.5)';edCtx.lineWidth=1.5/z;
        edCtx.setLineDash([5/z,3/z]);edCtx.stroke();edCtx.setLineDash([]);
      });
      const HR=6/z;
      tcp.forEach(p=>{
        const cpx=edMarginX()+p.x*pw, cpy=edMarginY()+p.y*ph;
        const isEnd=p.type==='end';
        edCtx.beginPath();edCtx.arc(cpx,cpy,HR,0,Math.PI*2);
        edCtx.fillStyle=isEnd?'#ff6600':'#1a8cff';edCtx.fill();
        edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
      });
    }
    // Handles cola pensamiento (punto rojo=pequeña, azul=grande)
  if(la.type==='bubble' && la.style==='thought' && la.tail){
    const HR2=6/z;
    const bx=edMarginX()+(la.x+la.thoughtBig.x*la.width)*pw;
    const by=edMarginY()+(la.y+la.thoughtBig.y*la.height)*ph;
    const sx=edMarginX()+(la.x+la.thoughtSmall.x*la.width)*pw;
    const sy=edMarginY()+(la.y+la.thoughtSmall.y*la.height)*ph;
    // Azul = elipse grande
    edCtx.beginPath();edCtx.arc(bx,by,HR2,0,Math.PI*2);
    edCtx.fillStyle='#1a8cff';edCtx.fill();
    edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
    // Rojo = elipse pequeña
    edCtx.beginPath();edCtx.arc(sx,sy,HR2,0,Math.PI*2);
    edCtx.fillStyle='#e63030';edCtx.fill();
    edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
  }
  // Handles 4 vértices del rect cuando modo curva activo
  if(la.type==='shape' && la.shape==='rect' && $('edOptionsPanel')?.dataset.mode==='shape'){
    if(_edCurveModeActive()){
      const corners=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
      const rot2=(la.rotation||0)*Math.PI/180;
      const cos2=Math.cos(rot2),sin2=Math.sin(rot2);
      const cxs=edMarginX()+la.x*pw, cys=edMarginY()+la.y*ph;
      corners.forEach(([cx3,cy3])=>{
        const rx=cx3*cos2-cy3*sin2, ry=cx3*sin2+cy3*cos2;
        const cpx=cxs+rx, cpy=cys+ry;
        const hasCurve=(la.cornerRadius||0)>0;
        edCtx.beginPath();edCtx.arc(cpx,cpy,hr,0,Math.PI*2);
        edCtx.fillStyle=hasCurve?'#2ecc71':'#e63030';edCtx.fill();
        edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
      });
    }
  }
  // Handles vértices explosión
  if(la.style==='explosion'){
      const ecp=la.getExplosionControlPoints();
      ecp.forEach(p=>{
        const cpx=edMarginX()+p.nx*pw, cpy=edMarginY()+p.ny*ph;
        edCtx.beginPath();edCtx.arc(cpx,cpy,HR,0,Math.PI*2);
        edCtx.fillStyle='#e63030';edCtx.fill();
        edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
      });
    }
  }
  // Handles 4 vértices del rect en modo curva
  if(la.type==='shape' && la.shape==='rect'){
    if(_edCurveModeActive()){
      const rot2=(la.rotation||0)*Math.PI/180;
      const cos2=Math.cos(rot2),sin2=Math.sin(rot2);
      const hw=la.width*pw/2, hh=la.height*ph/2;
      // TL=0, TR=1, BR=2, BL=3 en coordenadas locales
      const corners=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
      const crs2=la.cornerRadii||[0,0,0,0];
      corners.forEach(([lx,ly],ci2)=>{
        const ax2=(la.x*pw+lx*cos2-ly*sin2)/pw;
        const ay2=(la.y*ph+lx*sin2+ly*cos2)/ph;
        const cpx2=edMarginX()+ax2*pw, cpy2=edMarginY()+ay2*ph;
        const isAct=window._edCurveVertIdx===ci2;
        if(isAct) return; // vértice activo: invisible para ver la curvatura
        const hasCrv=(crs2[ci2]||0)>0;
        const hcol=hasCrv?'#2ecc71':'#e63030';
        edCtx.beginPath();edCtx.arc(cpx2,cpy2,hr,0,Math.PI*2);
        edCtx.fillStyle=hcol;edCtx.fill();
        edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
      });
    }
  }
  // Handles vértices de LineLayer seleccionado (panel abierto)
  if(la.type==='line' && la.points.length>=2 && ($('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible'))){
    const rot=(la.rotation||0)*Math.PI/180;
    const cos=Math.cos(rot),sin=Math.sin(rot);
    const cx=edMarginX()+la.x*pw, cy=edMarginY()+la.y*ph;
    la.points.forEach((p,i)=>{
      // Igual que draw(): translate(cx,cy) + rotate(rot) + point(p.x*pw, p.y*ph)
      const lpx=p.x*pw, lpy=p.y*ph;
      const cpx=cx + lpx*cos - lpy*sin;
      const cpy=cy + lpx*sin + lpy*cos;
      const isActive=window._edCurveVertIdx===i;
      if(isActive) return; // vértice activo: invisible para ver la curvatura
      const hasCurve=la.cornerRadii&&la.cornerRadii[i]>0;
      edCtx.beginPath();edCtx.arc(cpx,cpy,hr,0,Math.PI*2);
      edCtx.fillStyle=hasCurve?'#2ecc71':'#e63030';edCtx.fill();
      edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
    });
  }
}

/* ══════════════════════════════════════════
   PÁGINAS
   ══════════════════════════════════════════ */
function edAddPage(){
  edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'sequential',orientation:edOrientation});
  edLoadPage(edPages.length-1);
  edToast('Página añadida');
}
function edDeletePage(){
  if(edPages.length<=1){edToast('Necesitas al menos una página');return;}
  if(!confirm('¿Eliminar esta hoja?')) return;
  edPages.splice(edCurrentPage,1);
  edLoadPage(Math.min(edCurrentPage,edPages.length-1));
}
function edLoadPage(idx){
  edCurrentPage=idx;edLayers=edPages[idx].layers;edSelectedIdx=-1;
  const _po = edPages[idx]?.orientation || 'vertical';
  if(_po !== edOrientation){
    edOrientation = _po;
    if(edViewerCanvas){ edViewerCanvas.width=edPageW(); edViewerCanvas.height=edPageH(); }
    // Recalcular height de imagenes para la nueva orientacion
    const _isV = _po === 'vertical';
    const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
    const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
    edLayers.forEach(l => {
      if(l.type === 'image' && l.img && l.img.naturalWidth > 0){
        l.height = l.width * (l.img.naturalHeight / l.img.naturalWidth) * (_pw / _ph);
      }
    });
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
    btn.className='op-btn ed-nav-page-btn'+(i===edCurrentPage?' active':'');
    btn.title='Hoja '+(i+1);
    btn.style.cssText='padding:3px;min-width:48px;flex-direction:column;align-items:center;gap:2px;justify-content:center';

    // Canvas miniatura
    const thumb=document.createElement('canvas');
    const isV=(p.orientation||edOrientation)==='vertical';
    thumb.width=44; thumb.height=isV?60:44;
    thumb.style.cssText='display:block;border:1px solid #ccc;border-radius:3px;background:#fff;max-width:44px';
    _edRenderPageThumb(thumb, p, i);
    btn.appendChild(thumb);

    // Número de página
    const lbl=document.createElement('span');
    lbl.textContent=i+1;
    lbl.style.cssText='font-size:10px;font-weight:700;line-height:1';
    btn.appendChild(lbl);

    btn.addEventListener('click',()=>{edLoadPage(i);edCloseMenus();});
    wrap.appendChild(btn);
  });
  // Marcar orientación activa
  $('dd-orientv')?.classList.toggle('active',edOrientation==='vertical');
  $('dd-orienth')?.classList.toggle('active',edOrientation==='horizontal');
}

function _edRenderPageThumb(canvas, page, pageIdx){
  const ctx=canvas.getContext('2d');
  const tw=canvas.width, th=canvas.height;
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,tw,th);
  if(!page||!page.layers) return;
  const isV=(page.orientation||edOrientation)==='vertical';
  const pw=isV?ED_PAGE_W:ED_PAGE_H, ph=isV?ED_PAGE_H:ED_PAGE_W;
  const sx=tw/pw, sy=th/ph;

  // DEBUG: marcar si hay shapes
  const _nonText = page.layers.filter(l=>l.type!=='text'&&l.type!=='bubble');
  const _textL   = page.layers.filter(l=>l.type==='text'||l.type==='bubble');
  [..._nonText, ..._textL].forEach(la=>{
    const type = la.type;
    ctx.save();
    ctx.globalAlpha=la.opacity??1;
    const cx=la.x*tw, cy=la.y*th;
    const lw=la.width*tw, lh=la.height*th;
    const rot=(la.rotation||0)*Math.PI/180;

    if(type==='image' && la.img && la.img.complete && la.img.naturalWidth>0){
      ctx.translate(cx,cy); if(rot) ctx.rotate(rot);
      ctx.drawImage(la.img,-lw/2,-lh/2,lw,lh);
    } else if(type==='stroke' && la._canvas){
      ctx.translate(cx,cy); if(rot) ctx.rotate(rot);
      ctx.drawImage(la._canvas,-lw/2,-lh/2,lw,lh);
    } else if(type==='draw' && la._canvas){
      const _mx=(ED_CANVAS_W-pw)/2, _my=(ED_CANVAS_H-ph)/2;
      ctx.drawImage(la._canvas, _mx, _my, pw, ph, 0, 0, tw, th);
    } else if(type==='shape'){
      ctx.translate(cx,cy); if(rot) ctx.rotate(rot);
      ctx.lineJoin='round';
      ctx.beginPath();
      if(la.shape==='ellipse') ctx.ellipse(0,0,lw/2,lh/2,0,0,Math.PI*2);
      else ctx.rect(-lw/2,-lh/2,lw,lh);
      if(la.fillColor&&la.fillColor!=='none'){ctx.fillStyle=la.fillColor;ctx.fill();}
      if((la.lineWidth||0)>0){ctx.strokeStyle=la.color||'#000000';ctx.lineWidth=Math.max(1.5,la.lineWidth*sx);ctx.stroke();}
    } else if(type==='line' && la.points&&la.points.length>=2){
      ctx.translate(cx,cy); if(rot) ctx.rotate(rot);
      ctx.lineJoin='round'; ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(la.points[0].x*tw, la.points[0].y*th);
      for(let i=1;i<la.points.length;i++) ctx.lineTo(la.points[i].x*tw, la.points[i].y*th);
      if(la.closed) ctx.closePath();
      if(la.closed&&la.fillColor&&la.fillColor!=='none'){ctx.fillStyle=la.fillColor;ctx.fill();}
      if((la.lineWidth||0)>0){ctx.strokeStyle=la.color||'#000000';ctx.lineWidth=Math.max(1.5,la.lineWidth*sx);ctx.stroke();}
    } else if(type==='text'||type==='bubble'){
      ctx.translate(cx,cy); if(rot) ctx.rotate(rot);
      ctx.fillStyle=la.backgroundColor||'rgba(255,255,255,0.85)';
      ctx.fillRect(-lw/2,-lh/2,lw,lh);
    }
    ctx.restore();
  });
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
      // height calculado por el constructor como fraccion de pw (h = w*(natH/natW))
      const layer=new ImageLayer(img,0.5,0.5,w);
      // Limitar: no superar 0.85*ph en pixeles → 0.85*(ph/pw) como fraccion de pw
      const maxH = 0.85;  // fraccion de ph
      if(layer.height > maxH){
        const scale = maxH/layer.height;
        layer.height = maxH;
        layer.width  = layer.width * scale;
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
/* Insertar capa en la posición más alta, justo debajo de textos/bocadillos */
function _edInsertLayerAbove(layer) {
  // Insertar justo antes del DrawLayer activo (si existe) o antes del primer texto
  // Así el draw siempre queda en la capa más alta entre los no-textos
  const drawIdx = edLayers.findIndex(l => l.type==='draw');
  const firstTextIdx = edLayers.findIndex(l => l.type==='text' || l.type==='bubble');
  let insertAt;
  if(drawIdx >= 0) insertAt = drawIdx;           // justo debajo del draw
  else if(firstTextIdx >= 0) insertAt = firstTextIdx; // justo debajo de los textos
  else insertAt = -1;                             // al final
  if(insertAt >= 0){
    edLayers.splice(insertAt, 0, layer);
    edSelectedIdx = insertAt;
  } else {
    edLayers.push(layer);
    edSelectedIdx = edLayers.length - 1;
  }
}

function edAddText(){
  const l=new TextLayer('Escribe aquí');l.resizeToFitText(edCanvas);
  edLayers.push(l); edSelectedIdx=edLayers.length-1;
  _edDrawLockUI(); _edPropsOverlayShow();
  edPushHistory();edRedraw();edRenderOptionsPanel('props');
}
function edAddBubble(){
  const l=new BubbleLayer('Escribe aquí');l.resizeToFitText(edCanvas);
  edLayers.push(l);edSelectedIdx=edLayers.length-1;
  _edDrawLockUI(); _edPropsOverlayShow();
  edPushHistory();edRedraw();edRenderOptionsPanel('props');
}
function edDuplicateSelected(){
  if(edSelectedIdx < 0 || edSelectedIdx >= edLayers.length) return;
  const la = edLayers[edSelectedIdx];
  let copy;
  if(la.type === 'stroke'){
    // Clonar el canvas del stroke
    const c = document.createElement('canvas');
    c.width = la._canvas.width; c.height = la._canvas.height;
    c.getContext('2d').drawImage(la._canvas, 0, 0);
    copy = new StrokeLayer(document.createElement('canvas'));
    copy._canvas = c;
    copy.x = la.x + 0.02; copy.y = la.y + 0.02;
    copy.width = la.width; copy.height = la.height;
    copy.rotation = la.rotation || 0;
    copy.opacity = la.opacity;
  } else if(la.type === 'image'){
    copy = new ImageLayer(la.img, la.x + 0.02, la.y + 0.02, la.width);
    copy.height = la.height; copy.rotation = la.rotation || 0;
    copy.src = la.src; copy.opacity = la.opacity;
  } else if(la.type === 'text'){
    copy = new TextLayer(la.text, la.x + 0.02, la.y + 0.02);
    Object.assign(copy, la); copy.x = la.x + 0.02; copy.y = la.y + 0.02;
  } else if(la.type === 'bubble'){
    copy = new BubbleLayer(la.text, la.x + 0.02, la.y + 0.02);
    Object.assign(copy, la); copy.x = la.x + 0.02; copy.y = la.y + 0.02;
    if(la.tailStart) copy.tailStart = {...la.tailStart};
    if(la.tailEnd)   copy.tailEnd   = {...la.tailEnd};
    if(la.tailStarts) copy.tailStarts = la.tailStarts.map(s=>({...s}));
    if(la.tailEnds)   copy.tailEnds   = la.tailEnds.map(e=>({...e}));
  } else return;
  // Insertar justo encima del original
  edLayers.splice(edSelectedIdx + 1, 0, copy);
  edSelectedIdx = edSelectedIdx + 1;
  edPushHistory(); edRedraw();
  edToast('Objeto duplicado');
}
function edDeleteSelected(){
  if(edSelectedIdx<0){edToast('Selecciona un objeto');return;}
  const _delType=edLayers[edSelectedIdx]?.type;
  edLayers.splice(edSelectedIdx,1);edSelectedIdx=-1;
  // Si era shape/line con barra flotante activa, limpiar y desbloquear
  if(_delType==='shape'||_delType==='line'){
    $('edShapeBar')?.classList.remove('visible');
    if(typeof _edShapeClearHistory==='function') _edShapeClearHistory();
    _edDrawUnlockUI();
    edActiveTool='select'; edCanvas.className='';
  }
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
function _pinchCenter(pMap){
  const pts = [...pMap.values()];
  return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
}
function edPinchStart(e) {
  if (!window._edActivePointers || window._edActivePointers.size !== 2) return false;
  edPinching = true;
  _edPinchHappened = true; // marcar que hubo pinch — cancelar drag al soltar
  edPinchDist0  = _pinchDist(window._edActivePointers);
  edPinchAngle0 = _pinchAngle(window._edActivePointers);
  // Centro del pinch en coordenadas de pantalla
  const ctr = _pinchCenter(window._edActivePointers);
  edPinchCenter0 = { x: ctr.x, y: ctr.y };
  // Snapshot de cámara para pan/zoom de canvas
  edPinchCamera0 = { x: edCamera.x, y: edCamera.y, z: edCamera.z };
  // Snapshot de objeto para resize (solo si hay objeto y NO estamos pintando)
  const isDrawTool = ['draw','eraser'].includes(edActiveTool);
  const la = (!isDrawTool && edSelectedIdx >= 0) ? edLayers[edSelectedIdx] : null;
  edPinchScale0 = la ? { w: la.width, h: la.height, rot: la.rotation||0,
    _linePoints: la.type==='line' ? la.points.map(p=>({...p})) : null } : null;
  // Snapshot multiselección (tiene prioridad sobre objeto individual)
  if(edActiveTool === 'multiselect' && edMultiSel.length && edMultiBbox){
    edPinchScale0 = null; // no usar modo objeto individual
    window._edPinchMulti = {
      items: edMultiSel.map(i=>({
        i,
        rot:  edLayers[i].rotation||0,
        x:    edLayers[i].x,
        y:    edLayers[i].y,
        w:    edLayers[i].width,
        h:    edLayers[i].height,
        _linePoints: edLayers[i].type==='line' ? edLayers[i].points.map(p=>({...p})) : null,
      })),
      groupRot: edMultiGroupRot,
      bbox: { ...edMultiBbox },
    };
  } else {
    window._edPinchMulti = null;
  }
  return true;
}
function edPinchMove(e) {
  if (!edPinching || !window._edActivePointers || window._edActivePointers.size < 2) return;
  const dist   = _pinchDist(window._edActivePointers);
  const angle  = _pinchAngle(window._edActivePointers);
  const ctr    = _pinchCenter(window._edActivePointers);
  const ratio  = dist / Math.max(edPinchDist0, 1);
  const dAngle = (angle - edPinchAngle0) * 180 / Math.PI;

  if (window._edPinchMulti) {
    // ── Modo multi-selección: escalar y rotar el grupo ──
    const pm = window._edPinchMulti;
    const pw = edPageW(), ph = edPageH();
    // Centro del bbox como pivote (en fracciones de página)
    const pivX = pm.bbox.cx, pivY = pm.bbox.cy;
    const dRad = dAngle * Math.PI / 180;
    for(const snap of pm.items){
      const la = edLayers[snap.i]; if(!la) continue;
      // Escalar tamaño
      la.width  = Math.min(Math.max(snap.w * ratio, 0.04), 2.0);
      la.height = Math.min(Math.max(snap.h * ratio, 0.04), 2.0);
      // LineLayer: escalar también los puntos internos
      if(la.type === 'line' && snap._linePoints){
        const sw = la.width  / snap.w;
        const sh = la.height / snap.h;
        la.points = snap._linePoints.map(p => ({x: p.x * sw, y: p.y * sh}));
      }
      // Escalar Y rotar posición alrededor del pivote (en px para no distorsionar)
      const dxPx = (snap.x - pivX) * pw;
      const dyPx = (snap.y - pivY) * ph;
      const cos = Math.cos(dRad), sin = Math.sin(dRad);
      // Primero escalar, luego rotar
      la.x = pivX + (dxPx * ratio * cos - dyPx * ratio * sin) / pw;
      la.y = pivY + (dxPx * ratio * sin + dyPx * ratio * cos) / ph;
      // Rotar orientación del objeto
      la.rotation = snap.rot + dAngle;
    }
    // Actualizar rotación del grupo y bbox
    edMultiGroupRot = pm.groupRot + dAngle;
    // Actualizar edMultiBbox dimensiones escaladas
    edMultiBbox.w  = pm.bbox.w * ratio;
    edMultiBbox.h  = pm.bbox.h * ratio;
    edRedraw();
  } else if (edPinchScale0) {
    // ── Modo objeto individual: escalar y rotar el layer seleccionado ──
    const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
    if (la) {
      const newW = Math.min(Math.max(edPinchScale0.w * ratio, 0.04), 2.0);
      const newH = newW * (edPinchScale0.h / edPinchScale0.w);
      la.width  = newW;
      la.height = newH;
      la.rotation = edPinchScale0.rot + dAngle;
      // LineLayer: escalar también los puntos internos
      if (la.type === 'line' && edPinchScale0._linePoints) {
        const sw = newW / edPinchScale0.w;
        const sh = newH / edPinchScale0.h;
        la.points = edPinchScale0._linePoints.map(p => ({x: p.x * sw, y: p.y * sh}));
      }
      edRedraw();
    }
  } else {
    // ── Modo cámara: pan + zoom — solo si no hay ninguna selección activa ──
    const _haySeleccion = (edActiveTool==='multiselect' && edMultiSel.length) || edSelectedIdx >= 0;
    if(_haySeleccion) return; // con selección activa, el pinch no mueve la cámara
    const newZ = Math.min(Math.max(edPinchCamera0.z * ratio, 0.05), 8);
    edCamera.x = ctr.x - (edPinchCenter0.x - edPinchCamera0.x) / edPinchCamera0.z * newZ;
    edCamera.y = ctr.y - (edPinchCenter0.y - edPinchCamera0.y) / edPinchCamera0.z * newZ;
    edCamera.z = newZ;
    edRedraw();
  }
}
function edPinchEnd() {
  if(window._edPinchMulti && edMultiSel.length){
    // Recalcular bbox tras el gesto de grupo
    _msRecalcBbox();
    if(window._edMoved) edPushHistory();
    window._edPinchMulti = null;
  }
  edPinching    = false;
  edPinchDist0  = 0;
  edPinchScale0 = null;
  edPinchCenter0 = null;
  edPinchCamera0 = null;
  // Al soltar los dedos en modo draw, reactivar la herramienta de dibujo
  if(['draw','eraser'].includes(edActiveTool)){
    edPainting = false;
  }
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

function _edHandleDoubleTap(idx){
  const la = edLayers[idx];
  if(la && la.type === 'stroke'){
    const page=edPages[edCurrentPage]; if(!page) return;
    const dl=la.toDrawLayer();
    // Quitar stroke e insertar DrawLayer en posición más alta (bajo textos)
    page.layers.splice(idx, 1);
    const firstTextIdx2 = page.layers.findIndex(l => l.type==='text' || l.type==='bubble');
    if(firstTextIdx2 >= 0) page.layers.splice(firstTextIdx2, 0, dl);
    else page.layers.push(dl);
    edLayers=page.layers;
    edSelectedIdx=-1;
    edActiveTool='draw';
    edCanvas.className='tool-draw';
    const cur=$('edBrushCursor');if(cur)cur.style.display='block';
    _edDrawInitHistory();
    _edDrawLockUI();
    edRenderOptionsPanel('draw');
    edRedraw();
  } else if(la && la.type === 'shape') {
    edActiveTool='select'; edCanvas.className='';
    _edShapeType = 'select';
    edDrawColor  = la.color || '#000000';
    edDrawSize   = la.lineWidth || 3;
    _edActivateShapeTool();
  } else if(la && la.type === 'line') {
    edActiveTool='select'; edCanvas.className='';
    _edLineType = 'select';
    edDrawColor = la.color || '#000000';
    edDrawSize  = la.lineWidth || 3;
    _edActivateLineTool();
  } else {
    _edDrawLockUI(); _edPropsOverlayShow();
    edRenderOptionsPanel('props');
  }
}

/* Comprobar que los 4 vértices del objeto están dentro del rectángulo de rubber band */
function _edAllCornersInside(la, rx0, ry0, rx1, ry1){
  const hw = la.width/2, hh = la.height/2;
  const rot = (la.rotation||0)*Math.PI/180;
  const pw = edPageW(), ph = edPageH();
  const corners = [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]];
  return corners.every(([dx,dy])=>{
    const rx=dx*pw, ry=dy*ph;
    const wx = la.x + (rx*Math.cos(rot)-ry*Math.sin(rot))/pw;
    const wy = la.y + (rx*Math.sin(rot)+ry*Math.cos(rot))/ph;
    return wx>=rx0 && wx<=rx1 && wy>=ry0 && wy<=ry1;
  });
}

function edOnStart(e){
  // Ignorar clicks en elementos de UI (botones, menús, overlays, paneles)
  // Solo procesar si viene del canvas o de la zona de trabajo (editorShell)
  const tgt = e.target;
  // Ignorar si el click NO está dentro de editorShell (modales, header, etc.)
  if(!tgt.closest('#editorShell')) return;
  // Si la barra de menús está bloqueada (draw-active), ignorar clicks en su zona
  // aunque pointer-events:none haga que el target sea el elemento de debajo
  const _menuBar=$('edMenuBar');
  if(_menuBar && $('editorShell')?.classList.contains('draw-active')){
    const _mbr=_menuBar.getBoundingClientRect();
    if(e.clientX>=_mbr.left&&e.clientX<=_mbr.right&&e.clientY>=_mbr.top&&e.clientY<=_mbr.bottom) return;
  }
  // Ignorar elementos de UI dentro del editor
  const isUI = tgt.closest('#edMenuBar')      ||
               tgt.closest('#edTopbar')       ||
               tgt.closest('#edOptionsPanel') ||
               tgt.closest('.ed-fulloverlay') ||
               tgt.closest('.ed-dropdown')    ||
               tgt.closest('#edGearIcon')     ||
               tgt.closest('#edBrushCursor')  ||
               tgt.closest('.ed-float-btn')   ||
               tgt.closest('#edDrawBar')      ||
               tgt.closest('#edb-palette-pop') ||
               tgt.closest('#ed-hsl-picker')   ||
               tgt.closest('#editorViewer')   ||
               tgt.closest('#edProjectModal');
  if(isUI) return;

  // ── MODO V⟺C: solo permitir selección de vértices ──
  if($('esb-curve')?.dataset.curveActive==='1'){
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    if(la&&(la.type==='line'||la.type==='shape')){
      const c2=edCoords(e);
      const pw2=edPageW(),ph2=edPageH();
      // Intentar seleccionar vértice de línea
      if(la.type==='line'&&la.points.length>=2){
        const rot2=(la.rotation||0)*Math.PI/180;
        const cos2=Math.cos(rot2),sin2=Math.sin(rot2);
        for(let i=0;i<la.points.length;i++){
          const p=la.points[i];
          const lpx=p.x*pw2,lpy=p.y*ph2;
          const ax2=la.x+(lpx*cos2-lpy*sin2)/pw2;
          const ay2=la.y+(lpx*sin2+lpy*cos2)/ph2;
          if(Math.hypot(c2.nx-ax2,c2.ny-ay2)<0.05){
            window._edCurveVertIdx=i;
            if(!la.cornerRadii)la.cornerRadii={};
            const existing=la.cornerRadii[i]||0;
            window._edCurveRadius=existing;
            const sl=$('op-line-curve-r')||$('esb-curve-sl');
            const sn=$('op-line-curve-rnum')||$('esb-curve-num');
            if(sl)sl.value=existing;if(sn)sn.value=existing;
            // Actualizar popup si está abierto
            const csl=document.getElementById('esb-curve-sl');
            const cnum=document.getElementById('esb-curve-num');
            if(csl)csl.value=existing;if(cnum)cnum.value=existing;
            edRedraw();return;
          }
        }
      }
      // Intentar seleccionar vértice de rect
      if(la.type==='shape'&&la.shape==='rect'){
        const rot2=(la.rotation||0)*Math.PI/180;
        const cos2=Math.cos(rot2),sin2=Math.sin(rot2);
        const hw=la.width*pw2/2,hh=la.height*ph2/2;
        const corners=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
        for(let ci2=0;ci2<4;ci2++){
          const[lx,ly]=corners[ci2];
          const ax2=(la.x*pw2+lx*cos2-ly*sin2)/pw2;
          const ay2=(la.y*ph2+lx*sin2+ly*cos2)/ph2;
          if(Math.hypot(c2.nx-ax2,c2.ny-ay2)<0.05){
            window._edCurveVertIdx=ci2;
            if(!la.cornerRadii)la.cornerRadii=[0,0,0,0];
            const existing=la.cornerRadii[ci2]||0;
            window._edCurveRadius=existing;
            const csl=document.getElementById('esb-curve-sl');
            const cnum=document.getElementById('esb-curve-num');
            if(csl)csl.value=existing;if(cnum)cnum.value=existing;
            edRedraw();return;
          }
        }
      }
    }
    return; // en modo curva, ignorar todo lo demás
  }

  // No bloquear scroll en overlays (capas, hojas, etc.)
  if(e.cancelable && !e.target.closest('.ed-fulloverlay')){
    e.preventDefault();
  }
  _edTouchMoved = false; // resetear flag de movimiento
  edLastPointerIsTouch = (e.pointerType === 'touch'); // actualizar detección real de táctil
  // Rastrear pointers activos (para pinch con pointer events)
  if(!window._edActivePointers) window._edActivePointers = new Map();
  window._edActivePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  // 2 dedos → iniciar pinch
  if(window._edActivePointers.size === 2){
    // Cancelar fill pendiente — era un pinch, no un toque simple
    if(window._edFillPending) window._edFillPending = null;
    // Con multiselección activa: cancelar drag en curso y activar pinch de grupo
    if(edActiveTool==='multiselect' && edMultiSel.length){
      edMultiDragging=false; edMultiDragOffs=[];
      edMultiResizing=false; edMultiRotating=false;
    }
    // Si estaba pintando, cancelar el trazo parcial sin guardarlo
    if(edPainting){
      edPainting = false;
      if(edDrawHistory.length > 0){
        _edDrawApplyHistory(edDrawHistory[edDrawHistoryIdx] || null);
      }
    }
    edPinchStart(e);
    return;
  }
  if(window._edActivePointers.size > 1) return;
  // Cerrar menús si están abiertos (clic en canvas o zona de trabajo)
  if(edMenuOpen){ edCloseMenus(); }
  edHideContextMenu();

  // ── MULTI-SELECCIÓN ──────────────────────────────────────
  if(edActiveTool==='multiselect'){
    if(tgt!==edCanvas){
      // Clic fuera del canvas (UI, panel…) → desactivar si había selección
      if(edMultiSel.length) _edDeactivateMultiSel();
      return;
    }
    const c=edCoords(e);
    const pw=edPageW(), ph=edPageH();

    if(edMultiSel.length){
      const bb = edMultiBbox;
      if(bb){
        const grRad = edMultiGroupRot * Math.PI / 180;
        // ── Hit handle rotación ──
        const _offWs = bb.h*ph/2 + 28/edCamera.z;
        const rotHx = bb.cx + Math.sin(grRad)*_offWs/pw;
        const rotHy = bb.cy - Math.cos(grRad)*_offWs/ph;
        if(Math.hypot((c.nx-rotHx)*pw, (c.ny-rotHy)*ph) < 14){
          edMultiRotating=true;
          edMultiTransform={
            items: edMultiSel.map(i=>({i, rot:edLayers[i].rotation||0, x:edLayers[i].x, y:edLayers[i].y})),
            cx: bb.cx, cy: bb.cy,
            startAngle: Math.atan2(c.ny-bb.cy, c.nx-bb.cx),
            startGroupRot: edMultiGroupRot,
          };
          return;
        }
        // ── Hit handle escala ──
        const cg=Math.cos(-grRad), sg=Math.sin(-grRad);
        const dcxPx=(c.nx-bb.cx)*pw, dcyPx=(c.ny-bb.cy)*ph;
        const lxCur = bb.cx + (dcxPx*cg - dcyPx*sg)/pw;
        const lyCur = bb.cy + (dcxPx*sg + dcyPx*cg)/ph;
        for(const p of _msHandles(bb)){
          if(Math.hypot((lxCur-p.x)*pw, (lyCur-p.y)*ph) < 12){
            edMultiResizing=true;
            edMultiTransform={
              items: edMultiSel.map(i=>({i, x:edLayers[i].x, y:edLayers[i].y, w:edLayers[i].width, h:edLayers[i].height})),
              bb: {cx:bb.cx, cy:bb.cy, w:bb.w, h:bb.h},
              corner: p.c,
              sx: lxCur, sy: lyCur,
              groupRot: edMultiGroupRot,
              _curSx: 1, _curSy: 1,
            };
            return;
          }
        }
        // ── Hit dentro del bbox → drag ──
        const lxD=(dcxPx*cg - dcyPx*sg)/pw;
        const lyD=(dcxPx*sg + dcyPx*cg)/ph;
        if(Math.abs(lxD)<=bb.w/2 && Math.abs(lyD)<=bb.h/2){
          edMultiDragging=true;
          edMultiDragOffs=edMultiSel.map(i=>({dx:c.nx-edLayers[i].x, dy:c.ny-edLayers[i].y}));
          return;
        }
      }
    }
    // Nada tocado → desactivar si había selección, o iniciar rubber band
    if(edMultiSel.length){
      // En táctil: NO desactivar al tocar fuera — el usuario puede estar iniciando un pinch
      // Solo el botón de multiselección puede desactivar la selección en táctil
      if(!edLastPointerIsTouch) _edDeactivateMultiSel();
      // En táctil: simplemente ignorar — esperar al posible segundo dedo
    } else {
      _msClear();
      edRubberBand={x0:c.nx,y0:c.ny,x1:c.nx,y1:c.ny};
      edRedraw();
    }
    return;
  }
  // ─────────────────────────────────────────────────────────

  if(edActiveTool === 'fill'){
    if(tgt !== edCanvas) return;
    // Si hay una shape o line seleccionada (modo barra flotante), aplicar fillColor directo
    if($('edDrawBar')?.classList.contains('visible') && edSelectedIdx >= 0){
      const _la = edLayers[edSelectedIdx];
      if(_la && (_la.type==='shape' || _la.type==='line')){
        _la.fillColor = edDrawColor;
        edPushHistory(); edRedraw();
        return;
      }
    }
    // En touch/pen: guardar coordenadas y esperar a pointerup para confirmar
    // que fue toque simple y no inicio de pinch
    if(e.pointerType === 'touch'){
      window._edFillPending = { nx: edCoords(e).nx, ny: edCoords(e).ny, pid: e.pointerId };
      if(e.pointerId !== undefined){ try{ edCanvas.setPointerCapture(e.pointerId); }catch(_){} }
      return;
    }
    // Mouse/pen: ejecutar inmediatamente
    const c = edCoords(e);
    edFloodFill(c.nx, c.ny);
    return;
  }
  // Color Erase: un toque = borrar zona del color tocado
  if(window._edColorEraseReady && edActiveTool === 'eraser'){
    if(tgt !== edCanvas) return;
    window._edColorEraseReady = false;
    edCanvas.style.cursor = '';
    const btn=$('op-color-erase-btn');
    if(btn) btn.style.background='transparent';
    const c = edCoords(e);
    edColorErase(c.nx, c.ny);
    return;
  }
  if(['draw','eraser'].includes(edActiveTool)){
    if(tgt !== edCanvas) return;
    edStartPaint(e);return;
  }
  if(edActiveTool==='shape'){
    if(tgt !== edCanvas) return;
    // Deseleccionar cualquier shape existente antes de crear una nueva
    edSelectedIdx = -1;
    const c=edCoords(e);
    _edShapeStart = {x:c.nx, y:c.ny};
    _edShapePreview = new ShapeLayer(_edShapeType, c.nx, c.ny, 0.01, 0.01);
    _edShapePreview.color     = edDrawColor || '#000000';
    _edShapePreview.fillColor = edDrawFillColor || 'none';
    _edShapePreview.lineWidth = edDrawSize || 3;
    _edInsertLayerAbove(_edShapePreview);
    edRedraw();
    return;
  }
  if(edActiveTool==='line'){
    if(tgt !== edCanvas) return;
    const c=edCoords(e);
    if(!_edLineLayer){
      // Primera vez: crear capa con el primer punto como centro
      _edLineLayer = new LineLayer();
      _edLineLayer.color    = edDrawColor || '#000000';
      _edLineLayer.fillColor = edDrawFillColor || '#ffffff';
      _edLineLayer.lineWidth = edDrawSize || 3;
      _edLineLayer.x = c.nx; _edLineLayer.y = c.ny;
      _edLineLayer.points.push({x:0, y:0}); // primer punto en local = (0,0)
      _edInsertLayerAbove(_edLineLayer);
    } else {
      // Comprobar si toca el primer vértice (cerrar polígono)
      const absFirst = _edLineLayer.absPoints()[0];
      const pw=edPageW(), ph=edPageH();
      const dx=(c.nx-absFirst.x)*pw, dy=(c.ny-absFirst.y)*ph;
      if(_edLineLayer.points.length>=3 && Math.sqrt(dx*dx+dy*dy)<15){
        _edLineLayer.closed=true;
        _edFinishLine();
        // Solo abrir panel si los menús están visibles
        if(!edMinimized) _edActivateLineTool(true);
        return;
      }
      _edLineLayer.addAbsPoint(c.nx, c.ny);
    }
    edRedraw();
    // Actualizar info
    const info=$('op-line-info');
    if(info) info.textContent=`${_edLineLayer.points.length} vértice(s). Toca el primero para cerrar.`;
    return;
  }
  const c=edCoords(e);
  // Cola bocadillo
  if(edSelectedIdx>=0&&edLayers[edSelectedIdx]?.type==='bubble'){
    const la=edLayers[edSelectedIdx];
    // Handles cola pensamiento
    if(la.style==='thought' && la.tail){
      const bx=la.x+la.thoughtBig.x*la.width,   by=la.y+la.thoughtBig.y*la.height;
      const sx=la.x+la.thoughtSmall.x*la.width,  sy=la.y+la.thoughtSmall.y*la.height;
      if(Math.hypot(c.nx-bx,c.ny-by)<0.04){edIsTailDragging=true;edTailPointType='thoughtBig';  return;}
      if(Math.hypot(c.nx-sx,c.ny-sy)<0.04){edIsTailDragging=true;edTailPointType='thoughtSmall';return;}
    }
    for(const p of la.getTailControlPoints()){
      if(Math.hypot(c.nx-p.x,c.ny-p.y)<0.05){edIsTailDragging=true;edTailPointType=p.type;edTailVoiceIdx=p.voice||0;return;}
    }
    // Vértices de explosión
    if(la.style==='explosion'){
      for(const p of la.getExplosionControlPoints()){
        if(Math.hypot(c.nx-p.nx,c.ny-p.ny)<0.05){
          edIsTailDragging=true;edTailPointType='explosion';edTailVoiceIdx=p.idx;return;
        }
      }
    }
  }

  // Vértices de línea seleccionada — detección independiente del bubble
  if(edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='line'){
    const la=edLayers[edSelectedIdx];
    if(la.points.length>=2 && ($('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible'))){
      const rot=(la.rotation||0)*Math.PI/180;
      const cos=Math.cos(rot),sin=Math.sin(rot);
      const pw=edPageW(),ph=edPageH();
      for(let i=0;i<la.points.length;i++){
        const p=la.points[i];
        const lpx=p.x*pw, lpy=p.y*ph;
        const ax=la.x+(lpx*cos-lpy*sin)/pw;
        const ay=la.y+(lpx*sin+lpy*cos)/ph;
        if(Math.hypot(c.nx-ax,c.ny-ay)<0.05){
          edIsTailDragging=true;edTailPointType='linevertex';edTailVoiceIdx=i;return;
        }
      }
    }
  }

  // Handles de control (resize + rotate): todos los tipos en PC; táctil usa pinch para resize
  const _la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
  if(_la && _la.type!=='bubble'){
    const _isT = e.pointerType==='touch';
    const _pw=edPageW(), _ph=edPageH();
    const _z=edCamera.z;
    // Si es el segundo clic de un doble clic sobre este objeto, saltarse handles
    const _now = Date.now();
    const _isPotentialDbl = (_la === edLayers[_edLastTapIdx] || edSelectedIdx === _edLastTapIdx)
                            && (_now - _edLastTapTime < 350);
    const hitScreen = _isT ? 28 : 18;
    for(const p of _la.getControlPoints()){
      // dist en píxeles de página → multiplicar por z para obtener pantalla
      const _dpx=(c.nx-p.x)*_pw, _dpy=(c.ny-p.y)*_ph;
      const distScreen = Math.hypot(_dpx,_dpy) * _z;
      if(distScreen < hitScreen){
        // Si es el segundo clic de un doble clic, ignorar handles y dejar pasar al doble clic
        if(_isPotentialDbl) break;
        if(p.corner==='rotate'){
          if(_isT) continue;  // en táctil la rotación es por gesto pinch
          edIsRotating = true;
          edRotateStartAngle = Math.atan2(c.ny-_la.y, c.nx-_la.x)-(_la.rotation||0)*Math.PI/180;
          return;
        }
        if(!_isT){
          edIsResizing=true; edResizeCorner=p.corner;
          // Calcular ancla (punto opuesto en espacio local) para resize profesional
          const _rot0=(_la.rotation||0)*Math.PI/180;
          const _hw0=_la.width/2, _hh0=_la.height/2;
          const _pw0=edPageW(), _ph0=edPageH();
          // Posición del ancla en fracción de página (opuesto al corner arrastrado)
          const _anchorLocal = (corner) => {
            // ancla en espacio local (fracción de tamaño objeto)
            const ax = corner==='ml'?_hw0 : corner==='mr'?-_hw0 :
                        corner==='tl'||corner==='bl'?_hw0 :
                        corner==='tr'||corner==='br'?-_hw0 : 0;
            const ay = corner==='mt'?_hh0 : corner==='mb'?-_hh0 :
                        corner==='tl'||corner==='tr'?_hh0 :
                        corner==='bl'||corner==='br'?-_hh0 : 0;
            // Rotar al espacio mundo
            const rx=ax*_pw0, ry=ay*_ph0;
            return {
              x: _la.x+(rx*Math.cos(_rot0)-ry*Math.sin(_rot0))/_pw0,
              y: _la.y+(rx*Math.sin(_rot0)+ry*Math.cos(_rot0))/_ph0
            };
          };
          const _anch = _anchorLocal(p.corner);
          edInitialSize={width:_la.width,height:_la.height,
                         cx:_la.x, cy:_la.y, asp:_la.height/_la.width,
                         rot:(_la.rotation||0), ox:_la.x, oy:_la.y,
                         anchorX:_anch.x, anchorY:_anch.y};
          if(_la.type==='line') edInitialSize._linePoints=_la.points.map(p=>({...p}));
          return;
        }
      }
    }
  }
  // Si el panel de shape/line está abierto, bloquear selección de otros objetos
  // pero permitir drag del objeto actualmente seleccionado
  const _activePanel = $('edOptionsPanel');
  const _activeMode  = _activePanel?.dataset.mode;
  if((_activeMode === 'shape' || _activeMode === 'line') && edSelectedIdx >= 0){
    // Comprobar si el click es sobre el objeto seleccionado → permitir drag
    const _la = edLayers[edSelectedIdx];
    if(_la && _la.contains(c.nx, c.ny)){
      edIsDragging=true;
      edDragOffX=c.nx-_la.x; edDragOffY=c.ny-_la.y;
      return;
    }
    // Click fuera del objeto seleccionado → ignorar
    edRedraw(); return;
  }

  // Seleccionar: de mayor a menor índice (mayor = encima visualmente).
  // contains() de cada clase hace el hit-test correcto:
  //   - ImageLayer: bbox + alpha real del píxel (ignora zonas transparentes)
  //   - TextLayer/BubbleLayer: bbox rotado
  //   - StrokeLayer/DrawLayer: bbox rotado
  // Textos/bocadillos se evalúan primero (siempre encima visualmente).
  const _isTouch = e.pointerType === 'touch';

  let found = -1;
  // Primero textos/bocadillos (siempre encima)
  for(let i = edLayers.length - 1; i >= 0; i--){
    const l = edLayers[i];
    if((l.type==='text'||l.type==='bubble') && l.contains(c.nx,c.ny)){
      found = i; break;
    }
  }
  // Luego el resto, de mayor a menor índice
  if(found < 0){
    for(let i = edLayers.length - 1; i >= 0; i--){
      const l = edLayers[i];
      if(l.type==='text'||l.type==='bubble') continue;
      if(l.contains(c.nx,c.ny)){ found = i; break; }
    }
  }
  if(found>=0){
    edSelectedIdx = found;
    edDragOffX = c.nx - edLayers[found].x;
    edDragOffY = c.ny - edLayers[found].y;
    edIsDragging = true;
    window._edMoved = false;
    edHideGearIcon();
    clearTimeout(window._edLongPress);
    if(_isTouch){
      // TÁCTIL: toque simple = solo seleccionar
      // Doble toque rápido (≤350ms) → abrir panel de propiedades
      const now = Date.now();
      if(found === _edLastTapIdx && now - _edLastTapTime < 350){
        edIsDragging = false;
        clearTimeout(window._edLongPress);
        _edHandleDoubleTap(found);
        _edLastTapTime = 0; _edLastTapIdx = -1;
        return; // no continuar procesando este evento
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
        _edHandleDoubleTap(found);
        _edLastTapTime = 0; _edLastTapIdx = -1;
        return; // no continuar procesando este evento
      } else {
        _edLastTapTime = now; _edLastTapIdx = found;
        // Long-press 600ms en PC (ratón) → abrir propiedades (no para shape/line)
        window._edLongPress = setTimeout(() => {
          if(edSelectedIdx === found && !edIsResizing){
            const _la = edLayers[found];
            if(_la && (_la.type === 'shape' || _la.type === 'line')) return;
            edIsDragging = false;
            edRenderOptionsPanel('props');
          }
        }, 600);
      }
    }
  } else {
    const _wasType = edSelectedIdx >= 0 ? edLayers[edSelectedIdx]?.type : null;
    const _wasLayer = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
    const _panel = $('edOptionsPanel');
    const _panelWasProps = _panel?.dataset.mode === 'props';
    edHideContextMenu();
    // Con barra flotante activa: solo deseleccionar, sin abrir submenús
    if($('edDrawBar')?.classList.contains('visible')){
      edSelectedIdx = -1; edRedraw(); return;
    }
    // Si el panel de texto/bocadillo está abierto: no cerrar al tocar fuera
    const _panelMode=$('edOptionsPanel')?.dataset.mode;
    if(_panelMode==='props'){
      const _la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
      if(_la&&(_la.type==='text'||_la.type==='bubble')){
        edRedraw(); return; // mantener panel abierto, no deseleccionar
      }
    }
    edSelectedIdx = -1;
    // Clic en vacío: cerrar panel si no es draw
    edRenderOptionsPanel();
  }
  // PC/ratón clic en vacío → marcar para posible rubber band en edOnMove
  if(e.pointerType !== 'touch' && tgt === edCanvas && edSelectedIdx < 0 && edActiveTool === 'select'){
    const c = edCoords(e);
    edRubberBand = {x0:c.nx, y0:c.ny, x1:c.nx, y1:c.ny};
  }
  edRedraw();
}
function edOnMove(e){
  // Actualizar _edTouchMoved siempre (para cancelar long-press aunque gestureActive sea false)
  if(e.pointerType === 'touch'){
    _edTouchMoved = true;
    clearTimeout(window._edLongPress);
    window._edLongPressReady = false;
  }
  // ── RUBBER BAND en modo select (PC) ────────────────────────
  if(edActiveTool==='select' && edRubberBand){
    e.preventDefault();
    const c=edCoords(e);
    edRubberBand.x1=c.nx; edRubberBand.y1=c.ny;
    edRedraw(); return;
  }
  // ── MULTI-SELECCIÓN ────────────────────────────────────────
  if(edActiveTool==='multiselect'){
    // Con 2+ dedos: saltar directamente al pinch de grupo — no procesar drag ni resize
    if(window._edActivePointers && window._edActivePointers.size >= 2){
      if(e.pointerId !== undefined) window._edActivePointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
      e.preventDefault();
      if(window._edPinchMulti) edPinchMove(e);
      return;
    }
    const c=edCoords(e);
    if(edRubberBand){
      e.preventDefault();
      edRubberBand.x1=c.nx; edRubberBand.y1=c.ny;
      edRedraw(); return;
    }
    if(edMultiDragging && edMultiDragOffs.length){
      e.preventDefault();
      edMultiSel.forEach((idx,i)=>{
        const o=edMultiDragOffs[i]; if(!o) return;
        edLayers[idx].x=c.nx-o.dx; edLayers[idx].y=c.ny-o.dy;
      });
      // Actualizar edMultiBbox.cx/cy siguiendo al centroide
      // Las dimensiones w/h no cambian al trasladar
      if(edMultiBbox){
        const _n=edMultiSel.length; let _px=0,_py=0;
        edMultiSel.forEach(i=>{_px+=edLayers[i].x;_py+=edLayers[i].y;});
        const pivX=_px/_n, pivY=_py/_n;
        const gr=edMultiGroupRot*Math.PI/180;
        const cr=Math.cos(gr), sr=Math.sin(gr);
        const pw=edPageW(), ph=edPageH();
        const ox=edMultiBbox.offX*pw, oy=edMultiBbox.offY*ph;
        edMultiBbox.cx = pivX + (ox*cr - oy*sr)/pw;
        edMultiBbox.cy = pivY + (ox*sr + oy*cr)/ph;
      }
      window._edMoved=true; edRedraw(); return;
    }
    if(edMultiResizing && edMultiTransform){
      e.preventDefault();
      const {items,bb,corner,sx,sy,groupRot}=edMultiTransform;
      const pw=edPageW(),ph=edPageH();
      // Desrotar el cursor actual al espacio local del bbox (igual que en el hit-test)
      const _gr2 = (groupRot||0) * Math.PI / 180;
      const _c2 = Math.cos(-_gr2), _s2 = Math.sin(-_gr2);
      const _dcx2 = (c.nx - bb.cx)*pw, _dcy2 = (c.ny - bb.cy)*ph;
      const _lx2 = bb.cx + (_dcx2*_c2 - _dcy2*_s2)/pw;
      const _ly2 = bb.cy + (_dcx2*_s2 + _dcy2*_c2)/ph;
      const dx=_lx2-sx, dy=_ly2-sy;
      let sx2=1,sy2=1;
      if(corner==='tl'){sx2=1-dx/bb.w; sy2=1-dy/bb.h;}
      else if(corner==='tr'){sx2=1+dx/bb.w; sy2=1-dy/bb.h;}
      else if(corner==='bl'){sx2=1-dx/bb.w; sy2=1+dy/bb.h;}
      else if(corner==='br'){sx2=1+dx/bb.w; sy2=1+dy/bb.h;}
      else if(corner==='ml'){sx2=1-dx/bb.w;}
      else if(corner==='mr'){sx2=1+dx/bb.w;}
      else if(corner==='mt'){sy2=1-dy/bb.h;}
      else if(corner==='mb'){sy2=1+dy/bb.h;}
      // Esquinas: escala proporcional
      if(['tl','tr','bl','br'].includes(corner)){
        const s=(Math.abs(sx2)+Math.abs(sy2))/2;
        sx2=sy2=s;
      }
      sx2=Math.max(sx2,0.05); sy2=Math.max(sy2,0.05);
      // Guardar factores para que edDrawMultiSel escale el marco visualmente durante el gesto
      edMultiTransform._curSx = sx2;
      edMultiTransform._curSy = sy2;
      // Escalar posiciones relativas al centro del bbox en el espacio ROTADO del grupo
      const _cr = Math.cos(_gr2), _sr = Math.sin(_gr2);
      items.forEach(s=>{
        const la=edLayers[s.i]; if(!la) return;
        // Vector objeto→centro en px workspace
        const _ox=(s.x-bb.cx)*pw, _oy=(s.y-bb.cy)*ph;
        // Desrotar al espacio local del bbox
        const _lox=( _ox*_c2 - _oy*_s2);
        const _loy=( _ox*_s2 + _oy*_c2);
        // Escalar en espacio local
        const _slx = _lox * sx2;
        const _sly = _loy * sy2;
        // Volver a rotar al espacio global
        la.x = bb.cx + (_slx*_cr - _sly*_sr)/pw;
        la.y = bb.cy + (_slx*_sr + _sly*_cr)/ph;
        la.width=Math.max(s.w*Math.abs(sx2),0.02);
        la.height=Math.max(s.h*Math.abs(sy2),0.02);
      });
      window._edMoved=true; edRedraw(); return;
    }
    if(edMultiRotating && edMultiTransform){
      e.preventDefault();
      const {items,cx,cy,startAngle,startGroupRot}=edMultiTransform;
      const pw=edPageW(),ph=edPageH();
      const curAngle=Math.atan2(c.ny-cy, c.nx-cx);
      const delta=curAngle-startAngle;
      // Acumular rotación del bbox del grupo desde el inicio del gesto
      edMultiGroupRot = startGroupRot + delta*180/Math.PI;
      items.forEach(s=>{
        const la=edLayers[s.i]; if(!la) return;
        // Posición rotada alrededor del centro del bbox (en px para evitar distorsión)
        const dx_px=(s.x-cx)*pw, dy_px=(s.y-cy)*ph;
        const cos=Math.cos(delta), sin=Math.sin(delta);
        la.x=cx+(dx_px*cos-dy_px*sin)/pw;
        la.y=cy+(dx_px*sin+dy_px*cos)/ph;
        la.rotation=(s.rot+delta*180/Math.PI)%360;
      });
      window._edMoved=true; edRedraw(); return;
    }
    return;
  }
  // ─────────────────────────────────────────────────────────

  // Pinch activo — debe comprobarse ANTES del guard gestureActive
  // (el primer dedo puede no tener gesto activo aún cuando llega el segundo)
  if(window._edActivePointers && window._edActivePointers.size >= 2){
    if(e.pointerId !== undefined) window._edActivePointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
    e.preventDefault();
    // Con multiselección activa: pinch afecta SOLO al grupo — nunca a la cámara
    if(edActiveTool==='multiselect' && edMultiSel.length && window._edPinchMulti){
      edPinchMove(e);
      return;
    }
    // Sin multiselección activa: comportamiento normal (cámara u objeto individual)
    if(edActiveTool!=='multiselect'){
      edPinchMove(e);
    }
    return;
  }

  // Sin gesto activo → ignorar el resto
  const gestureActive = edIsDragging||edIsResizing||edIsTailDragging||edPainting||edPinching||edIsRotating||!!edRubberBand||!!_edShapeStart;
  if(!gestureActive) return;
  e.preventDefault();
  if(edPinching) return; // segundo dedo levantado, esperar edOnEnd
  if(_edPinchHappened) return; // hubo pinch — ignorar movimiento del dedo que queda
  if(['draw','eraser'].includes(edActiveTool)&&edPainting){edContinuePaint(e);return;}
  if(edActiveTool==='fill'){edMoveBrush(e);return;}
  // ── SHAPE: preview en tiempo real durante el drag ──
  if(edActiveTool==='shape' && _edShapeStart && _edShapePreview){
    const c=edCoords(e);
    const x0=_edShapeStart.x, y0=_edShapeStart.y;
    _edShapePreview.x = (x0+c.nx)/2;
    _edShapePreview.y = (y0+c.ny)/2;
    _edShapePreview.width  = Math.max(Math.abs(c.nx-x0), 0.01);
    _edShapePreview.height = Math.max(Math.abs(c.ny-y0), 0.01);
    edRedraw(); return;
  }
  const c=edCoords(e);
  _edTouchMoved = true;
  clearTimeout(window._edLongPress); // cancelar longpress si el dedo se movió
  if(edIsTailDragging&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    if(edTailPointType==='thoughtBig'){
      la.thoughtBig={x:(c.nx-la.x)/la.width, y:(c.ny-la.y)/la.height};
      edRedraw();return;
    }
    if(edTailPointType==='thoughtSmall'){
      la.thoughtSmall={x:(c.nx-la.x)/la.width, y:(c.ny-la.y)/la.height};
      edRedraw();return;
    }
    if(edTailPointType==='explosion'){
      const pw=edPageW(),ph=edPageH();
      const w=la.width*pw, h=la.height*ph;
      if(w>0&&h>0){
        la._initExplosionRadii();
        // Calcular posiciones absolutas de todos los vértices ANTES de cambiar nada
        const absPts = la.explosionRadii.map(v=>({
          ax: la.x + v.ox*w/2/pw,
          ay: la.y + v.oy*h/2/ph
        }));
        // Actualizar el vértice arrastrado
        absPts[edTailVoiceIdx] = {ax: c.nx, ay: c.ny};
        // Recalcular centro y tamaño del bbox desde las posiciones absolutas
        const minAx=Math.min(...absPts.map(p=>p.ax)), maxAx=Math.max(...absPts.map(p=>p.ax));
        const minAy=Math.min(...absPts.map(p=>p.ay)), maxAy=Math.max(...absPts.map(p=>p.ay));
        const newCx=(minAx+maxAx)/2, newCy=(minAy+maxAy)/2;
        const newW=Math.max(0.05,(maxAx-minAx)), newH=Math.max(0.05,(maxAy-minAy));
        // Recalcular ox/oy de todos los vértices con el nuevo centro y tamaño
        la.x=newCx; la.y=newCy;
        la.width=newW; la.height=newH;
        const nw=newW*pw, nh=newH*ph;
        la.explosionRadii = absPts.map(p=>({
          ox: (p.ax-newCx)*pw/(nw/2),
          oy: (p.ay-newCy)*ph/(nh/2)
        }));
      }
      edRedraw();return;
    }
    if(edTailPointType==='linevertex'){
      // Convertir posición absoluta al espacio local de la línea
      // El draw hace: translate(cx,cy) + rotate(rot) + draw(p.x*pw, p.y*ph)
      // Inverso: (abs - center) → rotate(-rot) → divide por (pw,ph)
      const pw2=edPageW(), ph2=edPageH();
      const rot=-(la.rotation||0)*Math.PI/180;
      const cos=Math.cos(rot), sin=Math.sin(rot);
      const dx=(c.nx-la.x)*pw2, dy=(c.ny-la.y)*ph2; // en px
      la.points[edTailVoiceIdx]={
        x: (dx*cos - dy*sin) / pw2,
        y: (dx*sin + dy*cos) / ph2
      };
      la._updateBbox();
      edRedraw();return;
    }
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
    const corner=edResizeCorner;
    const asp = edInitialSize.width*pw > 0 ? (edInitialSize.height*ph)/(edInitialSize.width*pw) : 1;
    const isImg = la.type==='image';

    // ── Resize profesional: el vértice opuesto (ancla) permanece fijo ──
    // Vector ancla→cursor en píxeles de página
    const adx_px = (c.nx - edInitialSize.anchorX) * pw;
    const ady_px = (c.ny - edInitialSize.anchorY) * ph;
    // Rotar al espacio local del objeto
    const alx_px =  adx_px*Math.cos(-rot) - ady_px*Math.sin(-rot);
    const aly_px =  adx_px*Math.sin(-rot) + ady_px*Math.cos(-rot);
    // Signo según el corner: tl/bl/ml → cursor a la izquierda del ancla (signo negativo en local)
    // El tamaño es el valor absoluto; el centro es el punto medio entre ancla y cursor
    const propKey = e.shiftKey; // Shift = proporcional en vértices

    // El nuevo centro = ancla + semitamaño en dirección rotada del objeto
    // Esto garantiza que el ancla permanece absolutamente fija
    const _setCenterFromAnchor = (newW, newH, anchorLocalX, anchorLocalY) => {
      // El centro está desplazado desde el ancla por el semitamaño en espacio local
      // anchorLocal es el desplazamiento del ancla respecto al centro en espacio local (px)
      // El nuevo centro en mundo = ancla - anchorLocal_rotado
      const cx_px = anchorLocalX * Math.cos(rot) - anchorLocalY * Math.sin(rot);
      const cy_px = anchorLocalX * Math.sin(rot) + anchorLocalY * Math.cos(rot);
      la.x = edInitialSize.anchorX - cx_px / pw;
      la.y = edInitialSize.anchorY - cy_px / ph;
    };

    if(corner==='ml'||corner==='mr'){
      const nw_px = Math.abs(alx_px);
      if(nw_px > pw*0.02){
        la.width = nw_px/pw;
        // Ancla local: para ml ancla es el borde derecho (+hw), para mr es el izquierdo (-hw)
        const aLocalX = corner==='ml' ?  nw_px/2 : -nw_px/2;
        _setCenterFromAnchor(la.width, la.height, aLocalX, 0);
      }
    } else if(corner==='mt'||corner==='mb'){
      const nh_px = Math.abs(aly_px);
      if(nh_px > ph*0.02){
        la.height = nh_px/ph;
        // Ancla local: para mt ancla es el borde inferior (+hh), para mb es el superior (-hh)
        const aLocalY = corner==='mt' ?  nh_px/2 : -nh_px/2;
        _setCenterFromAnchor(la.width, la.height, 0, aLocalY);
      }
    } else {
      // Esquinas — proporcional
      const nw_px = Math.abs(alx_px);
      const nh_px = Math.abs(aly_px);
      if(nw_px > pw*0.02 && nh_px > ph*0.02){
        const sc = Math.max(nw_px/(edInitialSize.width*pw), nh_px/(edInitialSize.height*ph));
        la.width  = edInitialSize.width  * sc;
        la.height = edInitialSize.height * sc;
        // Ancla local: semitamaño nuevo en la dirección opuesta al corner arrastrado
        const aLocalX = (corner==='tl'||corner==='bl') ?  la.width/2*pw : -la.width/2*pw;
        const aLocalY = (corner==='tl'||corner==='tr') ?  la.height/2*ph : -la.height/2*ph;
        _setCenterFromAnchor(la.width, la.height, aLocalX, aLocalY);
      }
    }
    window._edMoved = true;
    // LineLayer: escalar los puntos locales según el nuevo width/height
    if(la.type==='line' && edInitialSize._linePoints){
      const sw = la.width  / (edInitialSize.width  || 0.01);
      const sh = la.height / (edInitialSize.height || 0.01);
      la.points = edInitialSize._linePoints.map(p=>({x: p.x*sw, y: p.y*sh}));
      // Recalcular width/height sin recentrar (los puntos ya están centrados)
      const xs=la.points.map(p=>p.x), ys=la.points.map(p=>p.y);
      la.width  = Math.max(Math.max(...xs)-Math.min(...xs), 0.01);
      la.height = Math.max(Math.max(...ys)-Math.min(...ys), 0.01);
    }
    edRedraw();
    edHideGearIcon();
    const _opPanel=$('edOptionsPanel');
    const _la2 = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
    const _keepOpen2 = _la2?.type==='shape' || _la2?.type==='line';
    if(_opPanel&&_opPanel.classList.contains('open')&&_opPanel.dataset.mode!=='draw'&&!_keepOpen2){
      _opPanel.classList.remove('open'); _opPanel.innerHTML='';
    }
    return;
  }
  if(!edIsDragging||edSelectedIdx<0)return;
  const la=edLayers[edSelectedIdx];
  la.x = c.nx - edDragOffX;
  la.y = c.ny - edDragOffY;
  window._edMoved = true;
  edRedraw();
  edHideGearIcon();
  const _opP=$('edOptionsPanel');
  const _keepOpen = la.type==='shape' || la.type==='line';
  if(_opP&&_opP.classList.contains('open')&&_opP.dataset.mode!=='draw'&&!_keepOpen){
    _opP.classList.remove('open'); _opP.innerHTML='';
  }
}
function edOnEnd(e){
  // Limpiar pointer del mapa SIEMPRE (antes de la guarda)
  if(e && e.pointerId !== undefined && window._edActivePointers){
    window._edActivePointers.delete(e.pointerId);
  }
  // Fill touch: confirmar siempre que no haya pinch activo — fuera de la guarda gestureActive
  if(edActiveTool === 'fill' && window._edFillPending){
    const fp = window._edFillPending; window._edFillPending = null;
    if(!window._edActivePointers || window._edActivePointers.size === 0){
      // Si hay shape/line seleccionada en modo barra flotante, aplicar fillColor
      if($('edDrawBar')?.classList.contains('visible') && edSelectedIdx >= 0){
        const _la = edLayers[edSelectedIdx];
        if(_la && (_la.type==='shape' || _la.type==='line')){
          _la.fillColor = edDrawColor;
          edPushHistory(); edRedraw();
        } else { edFloodFill(fp.nx, fp.ny); }
      } else { edFloodFill(fp.nx, fp.ny); }
    }
  }
  // ── RUBBER BAND en modo select (PC) → activar multiselect ──
  if(edActiveTool==='select' && edRubberBand){
    const rx0=Math.min(edRubberBand.x0,edRubberBand.x1);
    const ry0=Math.min(edRubberBand.y0,edRubberBand.y1);
    const rx1=Math.max(edRubberBand.x0,edRubberBand.x1);
    const ry1=Math.max(edRubberBand.y0,edRubberBand.y1);
    edRubberBand=null;
    if((rx1-rx0)>0.01 || (ry1-ry0)>0.01){
      edMultiSel=[];
      edLayers.forEach((la,i)=>{
        if(_edAllCornersInside(la,rx0,ry0,rx1,ry1)) edMultiSel.push(i);
      });
      if(edMultiSel.length>=2){
        edActiveTool='multiselect';
        _msRecalcBbox();
        const btn=$('edMultiSelBtn');
        if(btn) btn.classList.add('active');
      } else {
        edMultiSel=[];
      }
    }
    edRedraw(); return;
  }
  // ── MULTI-SELECCIÓN ────────────────────────────────────────
  if(edActiveTool==='multiselect'){
    if(edRubberBand){
      // Confirmar rubber band → poblar edMultiSel
      const rx0=Math.min(edRubberBand.x0,edRubberBand.x1);
      const ry0=Math.min(edRubberBand.y0,edRubberBand.y1);
      const rx1=Math.max(edRubberBand.x0,edRubberBand.x1);
      const ry1=Math.max(edRubberBand.y0,edRubberBand.y1);
      edRubberBand=null;
      if((rx1-rx0)>0.005 || (ry1-ry0)>0.005){
        edMultiSel=[];
        edLayers.forEach((la,i)=>{
          // Seleccionar solo si los 4 vértices del objeto están dentro del rectángulo
          if(_edAllCornersInside(la,rx0,ry0,rx1,ry1)) edMultiSel.push(i);
        });
      }
      if(edMultiSel.length) _msRecalcBbox();  // bbox inicial al seleccionar
      edRedraw();
    }
    if(edMultiDragging||edMultiResizing||edMultiRotating){
      if(!_edPinchHappened && edMultiSel.length && window._edMoved) edPushHistory();
      if(edMultiSel.length) _msRecalcBbox();
    }
    edMultiDragging=false; edMultiResizing=false; edMultiRotating=false;
    edMultiDragOffs=[]; window._edMoved=false;
    // Resetear flag de pinch cuando no quedan dedos
    if(!window._edActivePointers || window._edActivePointers.size === 0) _edPinchHappened = false;
    clearTimeout(window._edLongPress); window._edLongPressReady=false;
    return;
  }
  // ─────────────────────────────────────────────────────────

  // Sin gesto activo → ignorar el resto
  const gestureActive2 = edIsDragging||edIsResizing||edIsTailDragging||edPainting||edPinching||edIsRotating||!!edRubberBand||!!_edShapeStart;
  if(!gestureActive2){ clearTimeout(window._edLongPress); window._edLongPressReady=false; return; }
  if(edPinching && (!window._edActivePointers || window._edActivePointers.size < 2)){
    edPinchEnd();
    return;
  }
  if(edPainting && edActiveTool !== 'fill'){ edSaveDrawData(); }
  // ── SHAPE: confirmar forma al soltar ──
  if(edActiveTool==='shape' && _edShapeStart && _edShapePreview){
    const minSize = 0.02;
    if(_edShapePreview.width < minSize || _edShapePreview.height < minSize){
      _edShapePreview.width  = Math.max(_edShapePreview.width,  minSize);
      _edShapePreview.height = Math.max(_edShapePreview.height, minSize);
    }
    _edShapePreview.color     = edDrawColor || '#000000';
    _edShapePreview.lineWidth = edDrawSize  || 3;
    const createdShape = _edShapePreview;
    _edPendingShape = null;
    _edShapeStart   = null;
    _edShapePreview = null;
    edSelectedIdx = edLayers.indexOf(createdShape);
    edActiveTool = 'select';
    edCanvas.className = '';
    _edShapeType = 'select';
    // Historial local: estado 0 = null (sin objeto), estado 1 = objeto creado
    _edShapeHistory = [null, JSON.stringify(edSerLayer(createdShape))];
    _edShapeHistIdx = 1;
    _edShapeUpdateUndoRedoBtns();
    edPushHistory();
    edRedraw();
    return;
  }
  clearTimeout(window._edLongPress);
  const wasDragging = edIsDragging||edIsResizing||edIsTailDragging||edIsRotating;
  window._edLongPressReady = false;
  // BUG-E09: solo guardar historial si algo cambió de verdad
  // Si hubo pinch, cancelar cualquier drag — el último dedo al levantarse no debe mover nada
  if(_edPinchHappened){
    // Resetear flag solo cuando no quedan dedos activos
    if(!window._edActivePointers || window._edActivePointers.size === 0) _edPinchHappened = false;
    edIsDragging=false; edIsResizing=false; edIsTailDragging=false; edIsRotating=false;
    return;
  }
  if(wasDragging && (window._edMoved || edIsTailDragging)){
    // Si el objeto activo es shape/line con panel abierto → historial local
    const _panel=$('edOptionsPanel');
    const _mode=_panel?.dataset.mode;
    const _la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    if((_mode==='shape'||_mode==='line'||$('edShapeBar')?.classList.contains('visible'))
       && _la && (_la.type==='shape'||_la.type==='line')){
      _edShapePushHistory();
    } else {
      edPushHistory();
    }
  }
  window._edMoved = false;
  edIsDragging=false;edIsResizing=false;edIsTailDragging=false;edIsRotating=false;
  // Limpiar snapshots de LineLayer
  if(edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='line'){
    const _ll=edLayers[edSelectedIdx];
    delete _ll._rotPointsSnap; delete _ll._rotCx; delete _ll._rotCy; delete _ll._rotStartAngle;
    delete _ll._dragPointsSnap; delete _ll._dragStartX; delete _ll._dragStartY;
  }
  if(edInitialSize._linePointsSnap) delete edInitialSize._linePointsSnap;
}



/* ══════════════════════════════════════════
   HISTORIAL LOCAL — SHAPE / LINE
   Independiente del historial global. Se inicia al abrir el panel
   y se destruye al cerrarlo. Los botones undo/redo del panel y de
   la barra flotante usan ESTE historial, no el global.
   ══════════════════════════════════════════ */
let _edShapeHistory = [], _edShapeHistIdx = -1;

function _edShapePushHistory(){
  const la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null; if(!la) return;
  _edShapeHistory = _edShapeHistory.slice(0, _edShapeHistIdx + 1);
  _edShapeHistory.push(JSON.stringify(edSerLayer(la)));
  _edShapeHistIdx = _edShapeHistory.length - 1;
  _edShapeUpdateUndoRedoBtns();
}

function _edShapeInitHistory(isNew){
  const la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
  if(isNew && la){
    // Nuevo objeto: primer estado = null (sin objeto), segundo = objeto creado
    _edShapeHistory = [null, JSON.stringify(edSerLayer(la))];
    _edShapeHistIdx = 1;
  } else {
    _edShapeHistory = [la ? JSON.stringify(edSerLayer(la)) : null];
    _edShapeHistIdx = 0;
  }
  _edShapeUpdateUndoRedoBtns();
}

function _edShapeClearHistory(){
  _edShapeHistory = []; _edShapeHistIdx = -1;
  _edShapeUpdateUndoRedoBtns();
}

function _edShapeApplyHistory(snapshot){
  if(!snapshot){
    // Estado inicial: el objeto no existía → eliminarlo del canvas y cerrar panel
    const la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
    if(la){
      const idx = edLayers.indexOf(la);
      if(idx>=0) edLayers.splice(idx, 1);
      const page=edPages[edCurrentPage]; if(page) page.layers=edLayers;
    }
    edSelectedIdx=-1;
    edCloseOptionsPanel();
    edShapeBarHide();
    _edDrawUnlockUI();
    edActiveTool='select'; edCanvas.className='';
    _edShapeStart=null; _edShapePreview=null; _edPendingShape=null;
    edRedraw();
    return;
  }
  const la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null; if(!la) return;
  const d = JSON.parse(snapshot);
  // Restaurar propiedades del layer sin cambiar su posición en el array
  if(d.color     !== undefined) la.color      = d.color;
  if(d.fillColor !== undefined) la.fillColor  = d.fillColor;
  if(d.lineWidth !== undefined) la.lineWidth  = d.lineWidth;
  if(d.opacity   !== undefined) la.opacity    = d.opacity;
  if(d.rotation  !== undefined) la.rotation   = d.rotation;
  if(d.x         !== undefined){ la.x=d.x; la.y=d.y; la.width=d.width; la.height=d.height; }
  if(d.shape     !== undefined) la.shape      = d.shape;
  if(d.points    !== undefined) la.points     = d.points.slice();
  if(d.closed    !== undefined) la.closed     = d.closed;
  _esbSync();
  edRedraw();
}

function edShapeUndo(){
  if(_edShapeHistIdx <= 0){ edToast('Nada que deshacer'); return; }
  _edShapeHistIdx--;
  _edShapeApplyHistory(_edShapeHistory[_edShapeHistIdx]);
  _edShapeUpdateUndoRedoBtns();
}

function edShapeRedo(){
  if(_edShapeHistIdx >= _edShapeHistory.length - 1){ edToast('Nada que rehacer'); return; }
  _edShapeHistIdx++;
  _edShapeApplyHistory(_edShapeHistory[_edShapeHistIdx]);
  _edShapeUpdateUndoRedoBtns();
}

function _edShapeUpdateUndoRedoBtns(){
  // Botones panel shape
  const su=$('op-shape-undo'), sr=$('op-shape-redo');
  if(su) su.disabled = _edShapeHistIdx <= 0;
  if(sr) sr.disabled = _edShapeHistIdx >= _edShapeHistory.length - 1;
  // Botones panel line
  const lu=$('op-line-undo'), lr=$('op-line-redo');
  if(lu) lu.disabled = _edShapeHistIdx <= 0;
  if(lr) lr.disabled = _edShapeHistIdx >= _edShapeHistory.length - 1;
  // Barra flotante
  const bu=$('esb-undo'), br=$('esb-redo');
  if(bu) bu.style.opacity = _edShapeHistIdx <= 0 ? '0.3' : '1';
  if(br) br.style.opacity = _edShapeHistIdx >= _edShapeHistory.length - 1 ? '0.3' : '1';
}

function _edDrawPushHistory(){
  // Guardar snapshot del DrawLayer actual
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = page.layers.find(l => l.type === 'draw'); if(!dl) return;
  // Cortar el futuro si hay
  edDrawHistory = edDrawHistory.slice(0, edDrawHistoryIdx + 1);
  edDrawHistory.push(dl.toDataUrlFull());
  if(edDrawHistory.length > ED_MAX_DRAW_HISTORY) edDrawHistory.shift();
  edDrawHistoryIdx = edDrawHistory.length - 1;
  _edDrawUpdateUndoRedoBtns();
}
function _edDrawApplyHistory(dataUrl){
  // El historial ahora guarda el workspace completo (toDataUrlFull)
  // → restaurar 1:1 sin recortar ni reposicionar
  const page = edPages[edCurrentPage]; if(!page) return;
  let dl = page.layers.find(l => l.type === 'draw');
  if(!dl){
    dl = new DrawLayer();
    const firstTextIdx = page.layers.findIndex(l => l.type==='text' || l.type==='bubble');
    if(firstTextIdx >= 0) page.layers.splice(firstTextIdx, 0, dl);
    else page.layers.push(dl);
    edLayers = page.layers;
  }
  dl.clear();
  if(dataUrl){
    const img = new Image();
    img.onload = () => {
      dl._ctx.drawImage(img, 0, 0, ED_CANVAS_W, ED_CANVAS_H);
      edRedraw();
    };
    img.src = dataUrl;
  } else {
    edRedraw();
  }
}
function edDrawUndo(){
  if(edDrawHistoryIdx <= 0){ edToast('Nada que deshacer'); return; }
  edDrawHistoryIdx--;
  _edDrawApplyHistory(edDrawHistory[edDrawHistoryIdx]);
  _edDrawUpdateUndoRedoBtns();
}
function edDrawRedo(){
  if(edDrawHistoryIdx >= edDrawHistory.length - 1){ edToast('Nada que rehacer'); return; }
  edDrawHistoryIdx++;
  _edDrawApplyHistory(edDrawHistory[edDrawHistoryIdx]);
  _edDrawUpdateUndoRedoBtns();
}
function _edDrawUpdateUndoRedoBtns(){
  const u=$('op-draw-undo'), r=$('op-draw-redo');
  if(u) u.disabled = edDrawHistoryIdx <= 0;
  if(r) r.disabled = edDrawHistoryIdx >= edDrawHistory.length - 1;
  // Barra flotante
  const bu=$('edb-undo'), br=$('edb-redo');
  if(bu) bu.style.opacity = edDrawHistoryIdx <= 0 ? '0.3' : '1';
  if(br) br.style.opacity = edDrawHistoryIdx >= edDrawHistory.length - 1 ? '0.3' : '1';
}
function _edDrawClearHistory(){
  edDrawHistory = []; edDrawHistoryIdx = -1;
  _edDrawUpdateUndoRedoBtns();
}
function _edDrawInitHistory(){
  // Captura el estado actual del DrawLayer como punto de partida.
  // El primer trazo nuevo quedará en idx=1 y podrá deshacerse hasta idx=0.
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = page.layers.find(l => l.type === 'draw');
  edDrawHistory = [dl ? dl.toDataUrlFull() : null];
  edDrawHistoryIdx = 0;
  _edDrawUpdateUndoRedoBtns();
}
/* ══════════════════════════════════════════
   DIBUJO LIBRE  (DrawLayer)
   ══════════════════════════════════════════ */
function _edGetOrCreateDrawLayer(){
  const page = edPages[edCurrentPage]; if(!page) return null;
  let dl = page.layers.find(l => l.type === 'draw');
  if(dl){
    // Mover el DrawLayer existente: quitarlo de donde está
    const dlIdx = page.layers.indexOf(dl);
    page.layers.splice(dlIdx, 1);
  } else {
    dl = new DrawLayer();
  }
  // Insertar en la posición más alta posible: justo antes del primer texto,
  // pero si no hay textos, al final. Los textos siempre van al tope.
  // Nota: shapes/lines pueden estar después de textos — el draw va al final del todo
  // excepto textos/bocadillos que siempre deben estar encima
  const firstTextIdx = page.layers.findIndex(l => l.type==='text' || l.type==='bubble');
  if(firstTextIdx >= 0) page.layers.splice(firstTextIdx, 0, dl);
  else page.layers.push(dl);
  edLayers = page.layers;
  return dl;
}

/* ══════════════════════════════════════════
   FLOOD FILL (Scanline algorithm)
   ══════════════════════════════════════════ */
function edFloodFill(nx, ny){
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = _edGetOrCreateDrawLayer();
  const canvas = dl._canvas, ctx = dl._ctx;
  const W = canvas.width, H = canvas.height;

  // Coordenadas absolutas en workspace
  const wx = Math.round(edMarginX() + nx * edPageW());
  const wy = Math.round(edMarginY() + ny * edPageH());
  if(wx < 0 || wx >= W || wy < 0 || wy >= H) return;

  // Límites: dentro de página → área de página; fuera → workspace
  const mx = Math.round(edMarginX()), my = Math.round(edMarginY());
  const pw = Math.round(edPageW()),   ph = Math.round(edPageH());
  const insidePage = wx >= mx && wx < mx+pw && wy >= my && wy < my+ph;
  const x0 = insidePage ? mx : 0,      y0 = insidePage ? my : 0;
  const x1 = insidePage ? mx+pw-1 : W-1, y1 = insidePage ? my+ph-1 : H-1;

  const fw = x1-x0+1, fh = y1-y0+1;
  const imageData = ctx.getImageData(x0, y0, fw, fh);
  const data = imageData.data;

  // Coordenadas locales del punto de inicio
  const lx = wx-x0, ly = wy-y0;
  const si0 = (ly*fw+lx)*4;
  const tR=data[si0], tG=data[si0+1], tB=data[si0+2], tA=data[si0+3];

  // Color de relleno con transparencia
  const fc = edDrawColor;
  const fR = parseInt(fc.slice(1,3),16),
        fG = parseInt(fc.slice(3,5),16),
        fB = parseInt(fc.slice(5,7),16),
        fA = Math.round((edDrawOpacity/100) * 255);

  // No rellenar si el color de inicio ya es idéntico al de relleno
  if(tR===fR && tG===fG && tB===fB && tA===fA) return;

  // Tolerancia para antialiasing de bordes (valor bajo = bordes nítidos)
  const TOL = 15;
  function match(i){
    return Math.abs(data[i  ]-tR) <= TOL &&
           Math.abs(data[i+1]-tG) <= TOL &&
           Math.abs(data[i+2]-tB) <= TOL &&
           Math.abs(data[i+3]-tA) <= TOL;
  }

  // Algoritmo Span Fill correcto (Wikipedia "Flood fill" — span filling variant)
  // La cola almacena [x, y, dirección] donde dirección es 1=abajo, -1=arriba
  // Esto garantiza exploración completa sin huecos
  const filled = new Uint8Array(fw * fh);

  function fillRow(y, lft, rgt){
    for(let x=lft; x<=rgt; x++){
      const i = y*fw+x;
      filled[i] = 1;
      const pi = i*4;
      data[pi]=fR; data[pi+1]=fG; data[pi+2]=fB; data[pi+3]=fA;
    }
  }

  // Cola de spans: {y, left, right, dy}
  // dy = dirección desde la que vino el span (para evitar re-escanear)
  const stack = [];
  stack.push({y:ly, left:lx, right:lx, dy:1});
  stack.push({y:ly, left:lx, right:lx, dy:-1});

  // Marcar píxel inicial
  filled[ly*fw+lx] = 1;

  while(stack.length){
    let {y, left, right, dy} = stack.pop();
    const ny = y + dy;
    if(ny < 0 || ny >= fh) continue;

    // Expandir horizontalmente en la fila ny buscando píxeles conectados
    let x = left;
    // Ir a la izquierda desde left
    while(x > 0 && !filled[ny*fw+(x-1)] && match((ny*fw+(x-1))*4)) x--;
    // Ir a la derecha desde right
    let rx = right;
    while(rx < fw-1 && !filled[ny*fw+(rx+1)] && match((ny*fw+(rx+1))*4)) rx++;

    // Rellenar el segmento encontrado en ny
    let segStart = -1;
    for(let sx=x; sx<=rx; sx++){
      const idx = ny*fw+sx;
      if(!filled[idx] && match(idx*4)){
        if(segStart === -1) segStart = sx;
        filled[idx] = 1;
        const pi = idx*4;
        data[pi]=fR; data[pi+1]=fG; data[pi+2]=fB; data[pi+3]=fA;
      } else if(segStart !== -1){
        // Propagar en la misma dirección dy y en la opuesta
        stack.push({y:ny, left:segStart, right:sx-1, dy:dy});
        stack.push({y:ny, left:segStart, right:sx-1, dy:-dy});
        segStart = -1;
      }
    }
    if(segStart !== -1){
      stack.push({y:ny, left:segStart, right:rx, dy:dy});
      stack.push({y:ny, left:segStart, right:rx, dy:-dy});
    }
  }

  // Dilatación 1px solo en píxeles TRANSPARENTES o casi transparentes:
  // Expande el relleno para cubrir el antialiasing del borde del trazo.
  // NO invade píxeles con color (alpha >= 30) para no corromper bordes adyacentes.
  // Técnica "expand into transparent" de Krita/Photoshop.
  const dilated = new Uint8Array(fw * fh);
  for(let y=0; y<fh; y++){
    for(let x=0; x<fw; x++){
      const i = y*fw+x;
      if(!filled[i]) continue;
      const neighbors = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
      for(const [nx2,ny2] of neighbors){
        if(nx2>=0 && nx2<fw && ny2>=0 && ny2<fh){
          const ni = ny2*fw+nx2;
          if(!filled[ni] && !dilated[ni]){
            // Solo dilatat en píxeles transparentes o semitransparentes (antialiasing)
            // NUNCA en píxeles con color sólido (bordes de trazos adyacentes)
            const alpha = data[ni*4+3];
            if(alpha < 30) dilated[ni] = 1;
          }
        }
      }
    }
  }
  for(let i=0; i<fw*fh; i++){
    if(dilated[i]){
      const pi = i*4;
      data[pi]=fR; data[pi+1]=fG; data[pi+2]=fB; data[pi+3]=fA;
    }
  }

  // Guardar snapshot ANTES de aplicar (para que Ctrl+Z restaure el estado previo)
  _edDrawPushHistory();
  ctx.putImageData(imageData, x0, y0);
  edRedraw();
}

/* ══════════════════════════════════════════
   BORRAR COLOR (Color Erase — como Procreate)
   ══════════════════════════════════════════ */
function edColorErase(nx, ny){
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = page.layers.find(l => l.type === 'draw'); if(!dl) return;
  const canvas = dl._canvas, ctx = dl._ctx;
  const W = canvas.width, H = canvas.height;

  const wx = Math.round(edMarginX() + nx * edPageW());
  const wy = Math.round(edMarginY() + ny * edPageH());
  if(wx < 0 || wx >= W || wy < 0 || wy >= H) return;

  const mx = Math.round(edMarginX()), my = Math.round(edMarginY());
  const pw = Math.round(edPageW()),   ph = Math.round(edPageH());
  const insidePage = wx >= mx && wx < mx+pw && wy >= my && wy < my+ph;
  const x0 = insidePage ? mx : 0,    y0 = insidePage ? my : 0;
  const x1 = insidePage ? mx+pw-1 : W-1, y1 = insidePage ? my+ph-1 : H-1;
  const fw = x1-x0+1, fh = y1-y0+1;

  const imageData = ctx.getImageData(x0, y0, fw, fh);
  const data = imageData.data;

  const lx = wx-x0, ly = wy-y0;
  const si0 = (ly*fw+lx)*4;
  const tR=data[si0], tG=data[si0+1], tB=data[si0+2], tA=data[si0+3];
  if(tA < 5) return;

  const strength = 1.0;  // siempre al 100%

  // Tolerancia amplia para capturar píxeles de antialiasing del borde
  // (los píxeles de borde son mezcla del color del trazo + fondo)
  const TOL = 80;
  function match(i){
    return Math.abs(data[i  ]-tR) <= TOL &&
           Math.abs(data[i+1]-tG) <= TOL &&
           Math.abs(data[i+2]-tB) <= TOL &&
           data[i+3] > 3;  // solo píxeles con algo de contenido
  }

  // Span Fill para zona contigua (igual que flood fill)
  const inZone = new Uint8Array(fw * fh);
  const stack2 = [];
  stack2.push({y:ly, left:lx, right:lx, dy:1});
  stack2.push({y:ly, left:lx, right:lx, dy:-1});
  inZone[ly*fw+lx] = 1;
  while(stack2.length){
    const {y, left, right, dy} = stack2.pop();
    const ny2 = y + dy;
    if(ny2 < 0 || ny2 >= fh) continue;
    let x = left;
    while(x > 0 && !inZone[ny2*fw+(x-1)] && match((ny2*fw+(x-1))*4)) x--;
    let rx = right;
    while(rx < fw-1 && !inZone[ny2*fw+(rx+1)] && match((ny2*fw+(rx+1))*4)) rx++;
    let segStart = -1;
    for(let sx=x; sx<=rx; sx++){
      const idx = ny2*fw+sx;
      if(!inZone[idx] && match(idx*4)){
        if(segStart === -1) segStart = sx;
        inZone[idx] = 1;
      } else if(segStart !== -1){
        stack2.push({y:ny2, left:segStart, right:sx-1, dy:dy});
        stack2.push({y:ny2, left:segStart, right:sx-1, dy:-dy});
        segStart = -1;
      }
    }
    if(segStart !== -1){
      stack2.push({y:ny2, left:segStart, right:rx, dy:dy});
      stack2.push({y:ny2, left:segStart, right:rx, dy:-dy});
    }
  }

  // Algoritmo "Color to Alpha" de Krita/GIMP (Kevin Cozens):
  // Calcula exactamente cuánto del color objetivo contribuye a cada píxel
  // y lo elimina sin dejar contorno residual.
  // 
  // Para cada canal C: si pix.C > target.C → alphaC = (pix.C - target.C) / (255 - target.C)
  //                    si pix.C < target.C → alphaC = (target.C - pix.C) / target.C
  //                    si pix.C = target.C → alphaC = 0
  // new_alpha = max(alphaR, alphaG, alphaB)  ← contribución total del color objetivo
  // Luego descomponer: pix = target*(1-new_alpha) + result*new_alpha → despejar result
  // new_A = original_alpha * new_alpha * strength  (strength = opacidad del usuario)

  for(let i=0; i<fw*fh; i++){
    if(!inZone[i]) continue;
    const pi = i*4;
    const r=data[pi], g=data[pi+1], b=data[pi+2], a=data[pi+3];
    if(a < 1) continue;

    // Calcular alpha por canal (cuánto del target hay en este pixel)
    let aR=0, aG=0, aB=0;
    if(r > tR && tR < 255) aR = (r - tR) / (255 - tR);
    else if(r < tR && tR > 0)   aR = (tR - r) / tR;
    if(g > tG && tG < 255) aG = (g - tG) / (255 - tG);
    else if(g < tG && tG > 0)   aG = (tG - g) / tG;
    if(b > tB && tB < 255) aB = (b - tB) / (255 - tB);
    else if(b < tB && tB > 0)   aB = (tB - b) / tB;

    // El nuevo alpha es la máxima contribución del color objetivo (extracción completa)
    const newAlpha = Math.max(aR, aG, aB);
    if(newAlpha < 0.001){ data[pi+3]=0; continue; }  // prácticamente idéntico → borrar

    // Calcular resultado de Color to Alpha al 100% (extracción completa del color objetivo)
    const inv = 1 - newAlpha;
    const outR = Math.max(0, Math.min(255, (r - tR*inv) / newAlpha));
    const outG = Math.max(0, Math.min(255, (g - tG*inv) / newAlpha));
    const outB = Math.max(0, Math.min(255, (b - tB*inv) / newAlpha));
    const outA = a * newAlpha;

    // Interpolar entre pixel original y resultado según la opacidad del usuario:
    // strength=1.0 → resultado completo (borrado total del color)
    // strength=0.5 → mezcla 50/50 (semi-borrado limpio sin artefactos)
    // strength=0.0 → sin cambio
    data[pi  ] = Math.round(r   + (outR - r)   * strength);
    data[pi+1] = Math.round(g   + (outG - g)   * strength);
    data[pi+2] = Math.round(b   + (outB - b)   * strength);
    data[pi+3] = Math.round(a   + (outA - a)   * strength);
  }

  // Guardar snapshot ANTES de aplicar
  _edDrawPushHistory();
  ctx.putImageData(imageData, x0, y0);
  edRedraw();
}
function edStartPaint(e){
  edPainting = true;
  const _pp=$('edOptionsPanel');
  if(_pp&&_pp.classList.contains('open')&&_pp.dataset.mode!=='draw'){
    _pp.classList.remove('open'); _pp.innerHTML='';
  }
  // Pointer capture: el canvas recibe todos los eventos del puntero aunque salga de él.
  // En Android elimina el retraso del sistema antes del primer evento de dibujo.
  if(e.pointerId !== undefined && edCanvas){
    try { edCanvas.setPointerCapture(e.pointerId); } catch(_){}
  }
  const dl = _edGetOrCreateDrawLayer(); if(!dl) return;
  const c = edCoords(e), er = edActiveTool==='eraser';
  dl.beginStroke(c.nx, c.ny, edDrawColor, er?edEraserSize:edDrawSize, er, edDrawOpacity);
  edRedraw();
  edMoveBrush(e);
}
function edContinuePaint(e){
  if(!edPainting) return;
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = page.layers.find(l => l.type === 'draw'); if(!dl) return;
  const c = edCoords(e), er = edActiveTool==='eraser';
  dl.continueStroke(c.nx, c.ny, edDrawColor, er?edEraserSize:edDrawSize, er, edDrawOpacity);
  edRedraw();
  edMoveBrush(e);
}
function edSaveDrawData(){
  edPainting = false;
  _edDrawPushHistory();  // historial local de dibujo (deshacer trazo)
  // NO llamar edPushHistory aquí — el historial global se guarda al congelar
}
function edClearDraw(){
  const page=edPages[edCurrentPage];if(!page)return;
  const dl = page.layers.find(l => l.type === 'draw');
  if(dl) dl.clear();
  // También eliminar page.drawData legado si existiera
  page.drawData = null;
  edPainting = false;
  edRedraw(); edToast('Dibujos borrados');
}
function edMoveBrush(e){
  const src=e.touches?e.touches[0]:e,cur=$('edBrushCursor');if(!cur)return;
  if(edActiveTool==='fill'){
    cur.style.display='none'; return;  // fill no muestra cursor circular
  }
  const sz=(edActiveTool==='eraser'?edEraserSize:edDrawSize)*2;
  cur.style.display='block';
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
  // Cerrar submenús inline
  document.querySelectorAll('.ed-submenu').forEach(s=>s.classList.remove('open'));
  document.querySelectorAll('.ed-menu-btn').forEach(b=>b.classList.remove('open'));
  edMenuOpen=null;
}

function edToggleMenu(id){
  if(edMenuOpen===id){edCloseMenus();return;}
  edCloseMenus();
  // Si hay panel de herramienta abierto, cerrarlo antes de abrir el menú
  const _panel=$('edOptionsPanel');
  if(_panel&&_panel.classList.contains('open')){
    const _mode=_panel.dataset.mode;
    edCloseOptionsPanel();
    if(_mode==='draw'||_mode==='shape'||_mode==='line'){
      _edShapeClearHistory&&_edShapeClearHistory();
      _edShapeStart=null;_edShapePreview=null;_edPendingShape=null;
      edActiveTool='select';edCanvas.className='';
      $('edShapeBar')?.classList.remove('visible');
      _edDrawUnlockUI();
    }
  }
  if(['draw','eraser','fill'].includes(edActiveTool)) edDeactivateDrawTool();
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
  dd.style.zIndex = '9999';
  // Proyecto: siempre alineado por la derecha con el botón
  if(id === 'project'){
    dd.style.left = 'auto';
    dd.style.right = (window.innerWidth - r.right) + 'px';
  } else {
    dd.style.left = r.left + 'px';
    dd.style.right = 'auto';
  }

  dd.classList.add('open');
  btn.classList.add('open');
  edMenuOpen = id;
  if(id === 'nav') edUpdateNavPages();
}

function edDeactivateDrawTool(){
  // Cancelar herramientas shape/line en curso
  _edShapeStart = null; _edShapePreview = null; _edPendingShape = null;
  if (_edLineLayer) {
    if (_edLineLayer.points.length < 2) {
      const idx = edLayers.indexOf(_edLineLayer);
      if (idx >= 0) edLayers.splice(idx, 1);
    }
    _edLineLayer = null;
  }
  edActiveTool='select';
  edCanvas.className='';
  const cur=$('edBrushCursor');if(cur)cur.style.display='none';
  const panel=$('edOptionsPanel');
  if(panel){ panel.classList.remove('open'); delete panel.dataset.mode; }
  edDrawBarHide();
  _edDrawUnlockUI();
  _edFreezeDrawLayer();
  requestAnimationFrame(edFitCanvas);
}

/* ── HERRAMIENTA SHAPE (rectángulo / elipse) ── */
/* ══════════════════════════════════════════
   HERRAMIENTA SHAPE (rectángulo / elipse)
   Patrón idéntico a edRenderOptionsPanel('draw')
   ══════════════════════════════════════════ */
function _edActivateShapeTool() {
  const panel=$('edOptionsPanel');
  if(!panel) return;

  _edDrawLockUI(); // deshabilitar menús igual que en draw

  const _sel = (edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='shape') ? edLayers[edSelectedIdx] : null;
  const col     = _sel?.color     || edDrawColor  || '#000000';
  const fillCol = _sel ? (_sel.fillColor||'#ffffff') : (edDrawFillColor||'#ffffff');
  const lw      = _sel?.lineWidth ?? edDrawSize ?? 3;
  const opacity = _sel ? Math.round((_sel.opacity??1)*100) : 100;
  const hasFill = fillCol !== 'none';
  const fillVal = hasFill ? fillCol : '#ffffff';

  panel.innerHTML = `
<div style="display:flex;flex-direction:column;width:100%;gap:0">
  <!-- FILA 1: Tipo + cambiar a Rectas -->
  <div style="display:flex;flex-direction:row;align-items:center;width:100%;min-height:32px;padding:3px 0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch">
    <button id="op-tool-shape" style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;white-space:nowrap;background:rgba(0,0,0,.08);color:var(--black)">Objeto</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-tool-line" style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;white-space:nowrap;background:transparent;color:var(--gray-600)">Rectas</button>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA 2: Tipo de forma + color + grosor + opacidad -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0;min-height:32px;width:100%">
    <button id="op-shape-rect" style="flex-shrink:0;border:2px solid ${_edShapeType==='rect'?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${_edShapeType==='rect'?'rgba(0,0,0,.08)':'transparent'}">▭</button>
    <button id="op-shape-ellipse" style="flex-shrink:0;border:2px solid ${_edShapeType==='ellipse'?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${_edShapeType==='ellipse'?'rgba(0,0,0,.08)':'transparent'}">◯</button>
    <button id="op-shape-select" style="flex-shrink:0;border:2px solid ${_edShapeType==='select'?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${_edShapeType==='select'?'rgba(0,0,0,.08)':'transparent'}"><svg width='16' height='16' viewBox='0 0 18 18' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M3 3 L3 14 L6.5 10.5 L9 15.5 L11 14.5 L8.5 9.5 L13 9.5 Z' stroke='currentColor' stroke-width='1.8' stroke-linejoin='round' stroke-linecap='round' fill='none'/></svg></button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-shape-color-btn" style="width:26px;height:26px;border-radius:50%;background:${col};border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0" title="Color borde"></button>
    <button id="op-shape-eyedrop" style="flex-shrink:0;border:none;background:transparent;cursor:pointer;font-size:.9rem;padding:2px 4px" title="Cuentagotas">💧</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-size-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Grosor</button>
    <div id="op-size-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="range" id="op-dsize" min="0" max="20" value="${lw}" style="flex:1;min-width:40px;accent-color:var(--black)">
      <input type="number" id="op-dsize-num" min="0" max="20" value="${lw}" style="width:38px;text-align:center;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
    </div>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-opacity-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Op%</button>
    <div id="op-opacity-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="range" id="op-shape-opacity" min="0" max="100" value="${opacity}" style="flex:1;min-width:40px;accent-color:var(--black)">
      <input type="number" id="op-shape-opacity-num" min="0" max="100" value="${opacity}" style="width:38px;text-align:center;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
    </div>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA RELLENO -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:6px;padding:4px 0">
    <span style="font-size:.72rem;font-weight:700;color:var(--gray-600)">Relleno</span>
    <input type="checkbox" id="op-shape-fill-on" ${hasFill?'checked':''} style="cursor:pointer;flex-shrink:0">
    <div style="position:relative;display:flex;align-items:center;flex-shrink:0">
      <button id="op-shape-fill-btn" style="width:26px;height:26px;border-radius:50%;background:${fillVal};border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0;opacity:${hasFill?1:0.4}"></button>
    </div>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA ACCIONES -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0 2px 0;min-height:32px;width:100%">
    <button id="op-shape-curve-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.78rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)" title="Convertir vértice a curva"><b>V⟺C</b></button>
    <div id="op-shape-curve-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="range" id="op-shape-curve-r" min="0" max="80" value="${_sel?(_sel.cornerRadius||0):0}" style="flex:1;min-width:40px;accent-color:var(--black)">
      <input type="number" id="op-shape-curve-rnum" min="0" max="80" value="${_sel?(_sel.cornerRadius||0):0}" style="width:38px;text-align:center;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
    </div>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-shape-del" style="flex-shrink:0;border:1px solid #fcc;border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:#c00">✕</button>
    <button id="op-shape-dup" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">⧉</button>
    <button id="op-shape-undo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↩</button>
    <button id="op-shape-redo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↪</button>
    <button id="op-shape-minimize" style="flex-shrink:0;border:none;border-radius:6px;padding:3px 10px;font-family:inherit;font-size:1.15rem;font-weight:900;background:transparent;cursor:pointer;color:#e63030" title="Minimizar">▼</button>
    <span id="op-shape-info" style="flex:1;text-align:right;font-size:clamp(.65rem,1.8vw,.75rem);font-weight:700;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">${_sel?_edShapeType+' · '+lw+'px · '+opacity+'%':'Sin objeto'}</span>
    <button id="op-draw-ok" style="flex-shrink:0;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:5px 12px;font-family:inherit;font-size:clamp(.75rem,2.2vw,.85rem);font-weight:900;cursor:pointer">✓</button>
  </div>
</div>`;
  panel.classList.add('open');
  panel.style.visibility='';
  panel.dataset.mode = 'shape';
  _edShapeInitHistory();

  // ── Helpers ──
  const _curShape = () => {
    const l = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
    return l?.type==='shape' ? l : null;
  };
  const _updateInfo = () => {
    const s=_curShape();
    const info=$('op-shape-info');
    if(info) info.textContent = s ? _edShapeType+'·'+s.lineWidth+'px·'+Math.round((s.opacity??1)*100)+'%' : 'Sin objeto';
  };

  // ── Herramientas ──
  $('op-tool-shape')?.addEventListener('click',()=>{ _edActivateShapeTool(); });
  $('op-tool-line')?.addEventListener('click',()=>{ edActiveTool='line'; edCanvas.className='tool-line'; _edActivateLineTool(); });

  // ── Tipo ──
  $('op-shape-rect')?.addEventListener('click',()=>{ _edShapeType='rect'; const s=_curShape(); if(s){s.shape='rect';edRedraw();} _edActivateShapeTool(); });
  $('op-shape-ellipse')?.addEventListener('click',()=>{ _edShapeType='ellipse'; const s=_curShape(); if(s){s.shape='ellipse';edRedraw();} _edActivateShapeTool(); });
  $('op-shape-select')?.addEventListener('click',()=>{
    _edShapeType='select'; edActiveTool='select'; edCanvas.className='';
    _edActivateShapeTool();
  });

  // ── Color borde ──
  $('op-shape-color-btn')?.addEventListener('click', e=>{
    const s=_curShape(); if(!s) return;
    if(e.pointerType==='touch'){
      // Android: picker HSL propio
      const _savedSel=edSelectedIdx;
      const _savedCol=edDrawColor; edDrawColor=s.color||'#000000';
      _edShowColorPicker((hex, commit)=>{
        edSelectedIdx=_savedSel; edDrawColor=_savedCol;
        s.color=hex; $('op-shape-color-btn').style.background=hex;
        edRedraw(); if(commit) _edShapePushHistory();
      });
    } else {
      // PC: selector nativo (Chrome tiene cuentagotas integrado)
      const inp=document.createElement('input'); inp.type='color'; inp.value=s.color||'#000000';
      inp.style.cssText='position:fixed;opacity:0;width:0;height:0;'; document.body.appendChild(inp);
      inp.addEventListener('input', ev=>{ s.color=ev.target.value; $('op-shape-color-btn').style.background=ev.target.value; edRedraw(); });
      inp.addEventListener('change', ()=>{ _edShapePushHistory(); inp.remove(); });
      inp.click();
    }
  });

  // ── Grosor ──
  $('op-size-btn')?.addEventListener('click',()=>{
    const sl=$('op-size-slider'),ob=$('op-opacity-slider');
    const open=sl.style.display==='none'||sl.style.display==='';
    sl.style.display=open?'flex':'none';
    if(open&&ob){ob.style.display='none';$('op-opacity-btn').style.background='transparent';}
    $('op-size-btn').style.background=open?'var(--gray-200)':'transparent';
  });
  $('op-dsize')?.addEventListener('input',e=>{
    const v=+e.target.value; edDrawSize=v;
    const n=$('op-dsize-num'); if(n) n.value=v;
    const s=_curShape(); if(s){s.lineWidth=v;edRedraw();} _updateInfo();
  });
  $('op-dsize')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-dsize-num')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(20,parseInt(e.target.value)||0));
    e.target.value=v; edDrawSize=v;
    const sl=$('op-dsize'); if(sl) sl.value=v;
    const s=_curShape(); if(s){s.lineWidth=v;edRedraw();} _updateInfo();
    _edShapePushHistory();
  });

  // ── Opacidad ──
  $('op-opacity-btn')?.addEventListener('click',()=>{
    const slO=$('op-opacity-slider'),sl=$('op-size-slider');
    if(!slO) return;
    const open=slO.style.display==='none'||slO.style.display==='';
    slO.style.display=open?'flex':'none';
    if(open&&sl){sl.style.display='none';$('op-size-btn').style.background='transparent';}
    $('op-opacity-btn').style.background=open?'var(--gray-200)':'transparent';
  });
  $('op-shape-opacity')?.addEventListener('input',e=>{
    const v=+e.target.value;
    const n=$('op-shape-opacity-num'); if(n) n.value=v;
    const s=_curShape(); if(s){s.opacity=v/100;edRedraw();} _updateInfo();
  });
  $('op-shape-opacity')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-shape-opacity-num')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(100,parseInt(e.target.value)||100));
    e.target.value=v;
    const sl=$('op-shape-opacity'); if(sl) sl.value=v;
    const s=_curShape(); if(s){s.opacity=v/100;edRedraw();} _updateInfo();
    _edShapePushHistory();
  });

  // ── Relleno ──
  $('op-shape-fill-on')?.addEventListener('change',e=>{
    const on=e.target.checked;
    const fb=$('op-shape-fill-btn'); if(fb) fb.style.opacity=on?1:0.4;
    const s=_curShape(); if(!s) return;
    if(on){
      const hex=s._lastFillColor||edDrawFillColor||'#ffffff';
      s.fillColor=hex; edDrawFillColor=hex;
      if(fb) fb.style.background=hex;
    } else {
      s._lastFillColor=s.fillColor;
      s.fillColor='none'; edDrawFillColor='none';
    }
    edRedraw(); _edShapePushHistory();
  });
  $('op-shape-eyedrop')?.addEventListener('click', ()=>{ _edStartEyedrop(); });
  $('op-shape-fill-btn')?.addEventListener('click', e=>{
    const s=_curShape(); if(!s) return;
    const cur=(s.fillColor&&s.fillColor!=='none')?s.fillColor:'#ffffff';
    if(e.pointerType==='touch'){
      // Android: picker HSL propio
      const _savedSel=edSelectedIdx;
      const _savedCol=edDrawColor; edDrawColor=cur;
      _edShowColorPicker((hex, commit)=>{
        edSelectedIdx=_savedSel; edDrawColor=_savedCol;
        s.fillColor=hex; $('op-shape-fill-btn').style.background=hex;
        $('op-shape-fill-on').checked=true; edDrawFillColor=hex;
        edRedraw(); if(commit) _edShapePushHistory();
      });
    } else {
      // PC: selector nativo (Chrome tiene cuentagotas integrado)
      const inp=document.createElement('input'); inp.type='color'; inp.value=cur;
      inp.style.cssText='position:fixed;opacity:0;width:0;height:0;'; document.body.appendChild(inp);
      inp.addEventListener('input', ev=>{
        s.fillColor=ev.target.value; $('op-shape-fill-btn').style.background=ev.target.value;
        $('op-shape-fill-on').checked=true; edDrawFillColor=ev.target.value; edRedraw();
      });
      inp.addEventListener('change', ()=>{ _edShapePushHistory(); inp.remove(); });
      inp.click();
    }
  });

  // ── Minimizar (idéntico a draw) ──

  // ── Curva de vértice ──
  $('op-shape-curve-btn')?.addEventListener('click',()=>{
    const sl=$('op-shape-curve-slider');
    const open=sl?.style.display==='none'||sl?.style.display==='';
    if(sl) sl.style.display=open?'flex':'none';
    const btn=$('op-shape-curve-btn');
    btn.style.background=open?'var(--black)':'transparent';
    btn.style.color=open?'var(--white)':'var(--gray-700)';
    btn.style.borderColor=open?'var(--black)':'var(--gray-300)';
    if(!open){ window._edCurveVertIdx=-1; edRedraw(); }
  });
  $('op-shape-curve-r')?.addEventListener('input',e=>{
    const v=+e.target.value;
    const n=$('op-shape-curve-rnum'); if(n) n.value=v;
    window._edCurveRadius=v;
    const s=_curShape(); if(!s) return;
    const vi=window._edCurveVertIdx;
    if(vi>=0&&vi<4&&s.shape==='rect'){
      if(!s.cornerRadii)s.cornerRadii=[0,0,0,0];
      s.cornerRadii[vi]=v;
    } else { s.cornerRadius=v; }
    edRedraw();
  });
  $('op-shape-curve-r')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-shape-curve-rnum')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(80,parseInt(e.target.value)||0));
    e.target.value=v; const sl=$('op-shape-curve-r'); if(sl) sl.value=v;
    window._edCurveRadius=v;
    const s=_curShape(); if(!s) return;
    const vi=window._edCurveVertIdx;
    if(vi>=0&&vi<4&&s.shape==='rect'){
      if(!s.cornerRadii)s.cornerRadii=[0,0,0,0];
      s.cornerRadii[vi]=v;
    } else { s.cornerRadius=v; }
    edRedraw(); _edShapePushHistory();
  });

  // ── OK ──
  $('op-draw-ok')?.addEventListener('click',()=>{
    _edShapeClearHistory();
    edCloseOptionsPanel();
    edSelectedIdx=-1; edActiveTool='select'; edCanvas.className='';
    _edShapeStart=null; _edShapePreview=null; _edPendingShape=null;
    $('edShapeBar')?.classList.remove('visible');
    _edDrawUnlockUI();
    if(edMinimized){ window._edMinimizedDrawMode=null; edMaximize(); }
    edRedraw();
  });

  // ── Eliminar ──
  $('op-shape-del')?.addEventListener('click',()=>{
    const s=_curShape(); if(!s) return;
    if(!confirm('¿Eliminar objeto?')) return;
    const idx=edLayers.indexOf(s);
    if(idx>=0){edLayers.splice(idx,1);}
    edSelectedIdx=-1; edPushHistory(); edRedraw(); _edActivateShapeTool();
  });

  // ── Duplicar ──
  $('op-shape-minimize')?.addEventListener('click', ()=>{ $('edMinimizeBtn')?.click(); });
  $('op-shape-dup')?.addEventListener('click',()=>{
    const s=_curShape(); if(!s) return;
    const copy=new ShapeLayer(s.shape, s.x+0.03, s.y+0.03, s.width, s.height);
    copy.color=s.color; copy.fillColor=s.fillColor; copy.lineWidth=s.lineWidth;
    copy.opacity=s.opacity??1; copy.rotation=s.rotation||0;
    _edInsertLayerAbove(copy);
    edPushHistory(); edRedraw(); _edActivateShapeTool();
  });

  // ── Deshacer / Rehacer ──
  const _updURShape = ()=>{
    const u=$('op-shape-undo'),r=$('op-shape-redo');
    if(u) u.disabled=edHistoryIdx<=0;
    if(r) r.disabled=edHistoryIdx>=edHistory.length-1;
  };
  _updURShape();
  $('op-shape-undo')?.addEventListener('click',()=>{ edShapeUndo(); });
  $('op-shape-redo')?.addEventListener('click',()=>{ edShapeRedo(); });

  requestAnimationFrame(edFitCanvas);
}

/* ══════════════════════════════════════════
   HERRAMIENTA LINE — rectas y polígonos
   Patrón idéntico a edRenderOptionsPanel('draw')
   ══════════════════════════════════════════ */
function _edActivateLineTool(isNew) {
  const panel=$('edOptionsPanel');
  if(!panel) return;

  _edDrawLockUI(); // deshabilitar menús igual que en draw

  const _active = _edLineLayer;
  const _sel    = (edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='line') ? edLayers[edSelectedIdx] : null;
  const _cur    = _active || _sel;
  const col     = _cur?.color    || edDrawColor  || '#000000';
  const lw      = _cur?.lineWidth ?? edDrawSize ?? 3;
  const opacity = _cur ? Math.round((_cur.opacity??1)*100) : 100;
  const isSelectMode = _edLineType === 'select';
  const nPoints = _edLineLayer?.points?.length || 0;
  const isClosed = _cur?.closed || false;
  const fillCol = _cur ? (_cur.fillColor||'none') : 'none';
  const hasFill = fillCol !== 'none' && isClosed;
  const fillVal = hasFill ? fillCol : '#ffffff';

  panel.innerHTML = `
<div style="display:flex;flex-direction:column;width:100%;gap:0">
  <!-- FILA 1: Tipo + cambiar a Objeto -->
  <div style="display:flex;flex-direction:row;align-items:center;width:100%;min-height:32px;padding:3px 0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch">
    <button id="op-tool-shape" style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;white-space:nowrap;background:transparent;color:var(--gray-600)">Objeto</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-tool-line" style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;white-space:nowrap;background:rgba(0,0,0,.08);color:var(--black)">Rectas</button>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA 2: modo recta/seleccionar + color + grosor + opacidad -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0;min-height:32px;width:100%">
    <button id="op-line-draw-btn" style="flex-shrink:0;border:2px solid ${!isSelectMode?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${!isSelectMode?'rgba(0,0,0,.08)':'transparent'}">╱</button>
    <button id="op-line-select-btn" style="flex-shrink:0;border:2px solid ${isSelectMode?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${isSelectMode?'rgba(0,0,0,.08)':'transparent'}"><svg width='16' height='16' viewBox='0 0 18 18' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M3 3 L3 14 L6.5 10.5 L9 15.5 L11 14.5 L8.5 9.5 L13 9.5 Z' stroke='currentColor' stroke-width='1.8' stroke-linejoin='round' stroke-linecap='round' fill='none'/></svg></button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-line-color-btn" style="width:26px;height:26px;border-radius:50%;background:${col};border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0" title="Color línea"></button>
    <button id="op-line-eyedrop" style="flex-shrink:0;border:none;background:transparent;cursor:pointer;font-size:.9rem;padding:2px 4px" title="Cuentagotas">💧</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-size-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Grosor</button>
    <div id="op-size-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="range" id="op-dsize" min="0" max="20" value="${lw}" style="flex:1;min-width:40px;accent-color:var(--black)">
      <input type="number" id="op-dsize-num" min="0" max="20" value="${lw}" style="width:38px;text-align:center;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
    </div>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-opacity-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Op%</button>
    <div id="op-opacity-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="range" id="op-line-opacity" min="0" max="100" value="${opacity}" style="flex:1;min-width:40px;accent-color:var(--black)">
      <input type="number" id="op-line-opacity-num" min="0" max="100" value="${opacity}" style="width:38px;text-align:center;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
    </div>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA CERRAR + INFO VÉRTICES -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0">
    <button id="op-line-close-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:${isClosed?'var(--gray-200)':'transparent'};cursor:pointer;color:var(--gray-700)">${isClosed?'Abrir':'Cerrar'}</button>
    <button id="op-line-finish" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-size:.8rem;font-weight:700;cursor:pointer;background:transparent">Terminar</button>
    <span id="op-line-info" style="flex:1;text-align:right;font-size:.72rem;color:var(--gray-500);padding:0 4px">${nPoints>0?nPoints+' vért.':'Toca para añadir vértices'}</span>
  </div>
  ${isClosed?`
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <div style="display:flex;flex-direction:row;align-items:center;gap:6px;padding:4px 0">
    <span style="font-size:.72rem;font-weight:700;color:var(--gray-600)">Relleno</span>
    <input type="checkbox" id="op-line-fill-on" ${hasFill?'checked':''} style="cursor:pointer;flex-shrink:0">
    <div style="position:relative;display:flex;align-items:center;flex-shrink:0">
      <button id="op-line-fill-btn" style="width:26px;height:26px;border-radius:50%;background:${fillVal};border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0;opacity:${hasFill?1:0.4}"></button>
    </div>
  </div>` : ''}
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA ACCIONES -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0 2px 0;min-height:32px;width:100%">
    <button id="op-line-curve-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.78rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)" title="Convertir vértice a curva"><b>V⟺C</b></button>
    <div id="op-line-curve-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="range" id="op-line-curve-r" min="0" max="80" value="0" style="flex:1;min-width:40px;accent-color:var(--black)">
      <input type="number" id="op-line-curve-rnum" min="0" max="80" value="0" style="width:38px;text-align:center;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
    </div>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-line-del" style="flex-shrink:0;border:1px solid #fcc;border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:#c00">✕</button>
    <button id="op-line-dup" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">⧉</button>
    <button id="op-line-undo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↩</button>
    <button id="op-line-redo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↪</button>
    <button id="op-line-minimize" style="flex-shrink:0;border:none;border-radius:6px;padding:3px 10px;font-family:inherit;font-size:1.15rem;font-weight:900;background:transparent;cursor:pointer;color:#e63030" title="Minimizar">▼</button>
    <span id="op-line-status" style="flex:1;text-align:right;font-size:clamp(.65rem,1.8vw,.75rem);font-weight:700;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">${lw}px · ${opacity}%</span>
    <button id="op-draw-ok" style="flex-shrink:0;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:5px 12px;font-family:inherit;font-size:clamp(.75rem,2.2vw,.85rem);font-weight:900;cursor:pointer">✓</button>
  </div>
</div>`;
  panel.classList.add('open');
  panel.style.visibility='';
  panel.dataset.mode = 'line';
  _edShapeInitHistory(isNew);

  // ── Helpers ──
  const _curLine = () => {
    if(_edLineLayer) return _edLineLayer;
    const l = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
    return l?.type==='line' ? l : null;
  };
  const _updateInfo = () => {
    const info=$('op-line-info');
    const l=_curLine();
    if(info) info.textContent = l ? (l.points.length+' vért.') : 'Toca para añadir vértices';
    const status=$('op-line-status');
    if(status){ const ll=_curLine(); if(ll) status.textContent=ll.lineWidth+'px·'+Math.round((ll.opacity??1)*100)+'%'; }
  };
  const _updUR = () => {
    const u=$('op-line-undo'),r=$('op-line-redo');
    if(u) u.disabled=edHistoryIdx<=0;
    if(r) r.disabled=edHistoryIdx>=edHistory.length-1;
  };
  _updUR();

  // ── Herramientas ──
  $('op-tool-shape')?.addEventListener('click',()=>{ _edFinishLine(); edActiveTool='shape'; edCanvas.className='tool-shape'; _edActivateShapeTool(); });
  $('op-tool-line')?.addEventListener('click',()=>{ edActiveTool='line'; edCanvas.className='tool-line'; _edActivateLineTool(); });

  // ── Modo dibujar / seleccionar ──
  $('op-line-draw-btn')?.addEventListener('click',()=>{ _edLineType='draw'; edActiveTool='line'; edCanvas.className='tool-line'; _edActivateLineTool(); });
  $('op-line-select-btn')?.addEventListener('click',()=>{
    _edLineType='select'; edActiveTool='select'; edCanvas.className='';
    _edActivateLineTool();
  });

  // ── Color ──
  $('op-line-color-btn')?.addEventListener('click', e=>{
    const l=_curLine(); if(!l) return;
    if(e.pointerType==='touch'){
      const _savedSel=edSelectedIdx;
      const _savedCol=edDrawColor; edDrawColor=l.color||'#000000';
      _edShowColorPicker((hex, commit)=>{
        edSelectedIdx=_savedSel; edDrawColor=_savedCol;
        l.color=hex; $('op-line-color-btn').style.background=hex;
        edRedraw(); if(commit) _edShapePushHistory();
      });
    } else {
      const inp=document.createElement('input'); inp.type='color'; inp.value=l.color||'#000000';
      inp.style.cssText='position:fixed;opacity:0;width:0;height:0;'; document.body.appendChild(inp);
      inp.addEventListener('input', ev=>{ l.color=ev.target.value; $('op-line-color-btn').style.background=ev.target.value; edRedraw(); });
      inp.addEventListener('change', ()=>{ _edShapePushHistory(); inp.remove(); });
      inp.click();
    }
  });
  $('op-line-eyedrop')?.addEventListener('click', ()=>{ _edStartEyedrop(); });

  // ── Grosor ──
  $('op-size-btn')?.addEventListener('click',()=>{
    const sl=$('op-size-slider'),ob=$('op-opacity-slider');
    const open=sl.style.display==='none'||sl.style.display==='';
    sl.style.display=open?'flex':'none';
    if(open&&ob){ob.style.display='none';$('op-opacity-btn').style.background='transparent';}
    $('op-size-btn').style.background=open?'var(--gray-200)':'transparent';
  });
  $('op-dsize')?.addEventListener('input',e=>{
    const v=+e.target.value; edDrawSize=v;
    const n=$('op-dsize-num'); if(n) n.value=v;
    const l=_curLine(); if(l){l.lineWidth=v;edRedraw();} _updateInfo();
  });
  $('op-dsize')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-dsize-num')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(20,parseInt(e.target.value)||0));
    e.target.value=v; edDrawSize=v;
    const sl=$('op-dsize'); if(sl) sl.value=v;
    const l=_curLine(); if(l){l.lineWidth=v;edRedraw();} _updateInfo();
    _edShapePushHistory();
  });

  // ── Opacidad ──
  $('op-opacity-btn')?.addEventListener('click',()=>{
    const slO=$('op-opacity-slider'),sl=$('op-size-slider');
    if(!slO) return;
    const open=slO.style.display==='none'||slO.style.display==='';
    slO.style.display=open?'flex':'none';
    if(open&&sl){sl.style.display='none';$('op-size-btn').style.background='transparent';}
    $('op-opacity-btn').style.background=open?'var(--gray-200)':'transparent';
  });
  $('op-line-opacity')?.addEventListener('input',e=>{
    const v=+e.target.value;
    const n=$('op-line-opacity-num'); if(n) n.value=v;
    const l=_curLine(); if(l){l.opacity=v/100;edRedraw();} _updateInfo();
  });
  $('op-line-opacity')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-line-opacity-num')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(100,parseInt(e.target.value)||100));
    e.target.value=v;
    const sl=$('op-line-opacity'); if(sl) sl.value=v;
    const l=_curLine(); if(l){l.opacity=v/100;edRedraw();} _updateInfo();
    _edShapePushHistory();
  });

  // ── Cerrar polígono ──
  $('op-line-close-btn')?.addEventListener('click',()=>{
    const l=_curLine(); if(!l||l.points.length<3) return;
    l.closed=!l.closed; _edShapePushHistory(); edRedraw(); _edActivateLineTool();
  });

  // ── Terminar ──
  $('op-line-finish')?.addEventListener('click',()=>{ _edFinishLine(); _edActivateLineTool(true); });

  // ── Relleno ──
  $('op-line-fill-on')?.addEventListener('change',e=>{
    const on=e.target.checked;
    const fb=$('op-line-fill-btn'); if(fb) fb.style.opacity=on?1:0.4;
    const l=_curLine(); if(!l) return;
    if(on){
      const hex=l._lastFillColor||edDrawFillColor||'#ffffff';
      l.fillColor=hex; edDrawFillColor=hex;
      if(fb) fb.style.background=hex;
    } else {
      l._lastFillColor=l.fillColor;
      l.fillColor='none'; edDrawFillColor='none';
    }
    edRedraw(); _edShapePushHistory();
  });
  $('op-line-fill-btn')?.addEventListener('click', e=>{
    const l=_curLine(); if(!l) return;
    const cur=(l.fillColor&&l.fillColor!=='none')?l.fillColor:'#ffffff';
    if(e.pointerType==='touch'){
      const _savedSel=edSelectedIdx;
      const _savedCol=edDrawColor; edDrawColor=cur;
      _edShowColorPicker((hex, commit)=>{
        edSelectedIdx=_savedSel; edDrawColor=_savedCol;
        l.fillColor=hex; $('op-line-fill-btn').style.background=hex;
        $('op-line-fill-on').checked=true; edDrawFillColor=hex;
        edRedraw(); if(commit) _edShapePushHistory();
      });
    } else {
      const inp=document.createElement('input'); inp.type='color'; inp.value=cur;
      inp.style.cssText='position:fixed;opacity:0;width:0;height:0;'; document.body.appendChild(inp);
      inp.addEventListener('input', ev=>{
        l.fillColor=ev.target.value; $('op-line-fill-btn').style.background=ev.target.value;
        $('op-line-fill-on').checked=true; edDrawFillColor=ev.target.value; edRedraw();
      });
      inp.addEventListener('change', ()=>{ _edShapePushHistory(); inp.remove(); });
      inp.click();
    }
  });

  // ── Curva de vértice ──
  window._edCurveVertIdx=-1; // resetear al abrir el panel
  $('op-line-curve-btn')?.addEventListener('click',()=>{
    const sl=$('op-line-curve-slider');
    const open=sl?.style.display==='none'||sl?.style.display==='';
    if(sl) sl.style.display=open?'flex':'none';
    const btn=$('op-line-curve-btn');
    btn.style.background=open?'var(--black)':'transparent';
    btn.style.color=open?'var(--white)':'var(--gray-700)';
    btn.style.borderColor=open?'var(--black)':'var(--gray-300)';
    if(!open){ window._edCurveVertIdx=-1; edRedraw(); }
  });
  $('op-line-curve-r')?.addEventListener('input',e=>{
    const v=+e.target.value;
    const n=$('op-line-curve-rnum'); if(n) n.value=v;
    window._edCurveRadius=v;
    // Actualizar en tiempo real el vértice activo
    const la2=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    const vi=window._edCurveVertIdx;
    if(la2&&vi>=0){ if(!la2.cornerRadii)la2.cornerRadii={}; la2.cornerRadii[vi]=v; }
    edRedraw();
  });
  $('op-line-curve-r')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-line-curve-rnum')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(80,parseInt(e.target.value)||0));
    e.target.value=v; const sl=$('op-line-curve-r'); if(sl) sl.value=v;
    window._edCurveRadius=v;
    const la2=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    const vi=window._edCurveVertIdx;
    if(la2&&vi>=0){ if(!la2.cornerRadii)la2.cornerRadii={}; la2.cornerRadii[vi]=v; }
    edRedraw(); _edShapePushHistory();
  });

  // ── Minimizar (idéntico a draw) ──

  // ── OK ──
  $('op-draw-ok')?.addEventListener('click',()=>{
    window._edCurveVertIdx=-1;
    _edShapeClearHistory();
    _edFinishLine();
    edCloseOptionsPanel();
    edSelectedIdx=-1; edActiveTool='select'; edCanvas.className='';
    $('edShapeBar')?.classList.remove('visible');
    _edDrawUnlockUI();
    if(edMinimized){ window._edMinimizedDrawMode=null; edMaximize(); }
    edRedraw();
  });

  // ── Eliminar ──
  $('op-line-del')?.addEventListener('click',()=>{
    const l=_curLine(); if(!l) return;
    if(!confirm('¿Eliminar?')) return;
    _edLineLayer=null;
    const idx=edLayers.indexOf(l);
    if(idx>=0){edLayers.splice(idx,1);}
    edSelectedIdx=-1; edPushHistory(); edRedraw(); _edActivateLineTool();
  });

  // ── Duplicar ──
  $('op-line-minimize')?.addEventListener('click', ()=>{ $('edMinimizeBtn')?.click(); });
  $('op-line-dup')?.addEventListener('click',()=>{
    const l=_curLine(); if(!l||l.points.length<2) return;
    const copy=new LineLayer();
    copy.points=l.points.map(p=>({x:p.x+0.03,y:p.y+0.03}));
    copy.color=l.color; copy.fillColor=l.fillColor||'none'; copy.lineWidth=l.lineWidth;
    copy.closed=l.closed; copy.opacity=l.opacity??1; copy._updateBbox();
    _edInsertLayerAbove(copy);
    edPushHistory(); edRedraw(); _edActivateLineTool();
  });

  // ── Deshacer / Rehacer ──
  _updUR();
  $('op-line-undo')?.addEventListener('click',()=>{ edShapeUndo(); });
  $('op-line-redo')?.addEventListener('click',()=>{ edShapeRedo(); });

  requestAnimationFrame(edFitCanvas);
}



function _edFinishLine() {
  if (_edLineLayer && _edLineLayer.points.length >= 2) {
    _edLineLayer._updateBbox();
    const finished = _edLineLayer;
    _edLineLayer = null;
    _edPendingShape = null;
    edSelectedIdx = edLayers.indexOf(finished);
    edActiveTool = 'select';
    edCanvas.className = '';
    _edLineType = 'select';
    _edShapePushHistory();
    edRedraw();
    // Si los menús están ocultos (minimizados), no abrir panel — solo mantener barra flotante
    if(edMinimized){
      edShapeBarShow();
    } else {
      const _barWasVisible2 = $('edShapeBar')?.classList.contains('visible');
      _edActivateLineTool(_barWasVisible2);
    }
  } else {
    if (_edLineLayer) {
      const idx = edLayers.indexOf(_edLineLayer);
      if (idx >= 0) edLayers.splice(idx, 1);
    }
    _edLineLayer = null;
    edRedraw();
  }
}
function _edFreezeDrawLayer(){
  const page = edPages[edCurrentPage]; if(!page) return;
  const dlIdx = page.layers.findIndex(l => l.type === 'draw');

  if(dlIdx < 0) return;
  const dl = page.layers[dlIdx];
  const bb = StrokeLayer._boundingBox(dl._canvas);
  _edDrawClearHistory();  // limpiar historial local al convertir en objeto
  if(!bb){ page.layers.splice(dlIdx, 1); edLayers=page.layers; return; }
  const sl = new StrokeLayer(dl._canvas);
  // Quitar el DrawLayer y reinsertar el StrokeLayer en la posición más alta (bajo textos)
  page.layers.splice(dlIdx, 1);
  const firstTextIdx = page.layers.findIndex(l => l.type==='text' || l.type==='bubble');
  if(firstTextIdx >= 0) page.layers.splice(firstTextIdx, 0, sl);
  else page.layers.push(sl);
  edLayers = page.layers;
  edSelectedIdx = page.layers.indexOf(sl);
  _edShapePushHistory();
  edRedraw();
}

/* ══════════════════════════════════════════
   PANEL DE OPCIONES
   ══════════════════════════════════════════ */
function edCloseOptionsPanel(){
  const panel=$('edOptionsPanel');
  if(panel){
    const _mode=panel.dataset.mode;
    panel.classList.remove('open'); panel.innerHTML=''; delete panel.dataset.mode;
    if(_mode==='props'){ _edDrawUnlockUI(); _edPropsOverlayHide(); }
  }
  edPanelUserClosed = true;
  requestAnimationFrame(edFitCanvas);
}
/* ══════════════════════════════════════════
   COLOR PICKER PROPIO (táctil/Android)
   Muestra overlay HSL con sliders al 100% por defecto
   ══════════════════════════════════════════ */
function _edUpdatePaletteDots(){
  document.querySelectorAll('.op-pal-dot').forEach(d=>{
    const idx=parseInt(d.dataset.colidx);
    d.style.background=edColorPalette[idx];
    d.style.borderColor = idx === edSelectedPaletteIdx ? 'var(--black)' : 'var(--gray-300)';
    d.style.borderWidth = idx === edSelectedPaletteIdx ? '3px' : '2px';
    // Slots 0 y 1 son fijos (negro/blanco) — cursor indicativo
    if(idx <= 1){
      d.style.cursor='default';
      d.title = idx===0 ? 'Negro (fijo)' : 'Blanco (fijo)';
    }
  });
}
function _hexToHsl(hex){
  let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){ h=s=0; }
  else{
    const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){ case r:h=((g-b)/d+(g<b?6:0))/6;break; case g:h=((b-r)/d+2)/6;break; default:h=((r-g)/d+4)/6; }
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}
function _hslToHex(h,s,l){
  s/=100; l/=100;
  const a=s*Math.min(l,1-l);
  const f=n=>{ const k=(n+h/30)%12; const c=l-a*Math.max(-1,Math.min(k-3,9-k,1)); return Math.round(255*c).toString(16).padStart(2,'0'); };
  return '#'+f(0)+f(8)+f(4);
}
function _edShowColorPicker(onColorChange){
  document.getElementById('ed-hsl-picker')?.remove();
  let [h,s,l] = _hexToHsl(edDrawColor);
  if(s < 10){ s=100; l=50; } // color neutro → arrancar con S y L al 100%/50%
  const overlay = document.createElement('div');
  overlay.id = 'ed-hsl-picker';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;';
  const preview = _hslToHex(h,s,l);
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:20px 18px;width:min(320px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.3)">
      <div id="ecp-preview" style="width:100%;height:44px;border-radius:8px;margin-bottom:14px;background:${preview};border:1px solid #ddd"></div>
      <label style="font-size:.7rem;font-weight:900;color:#666;text-transform:uppercase;letter-spacing:.05em">Tono</label>
      <input type="range" id="ecp-h" min="0" max="360" value="${h}" style="width:100%;margin-bottom:10px;accent-color:hsl(${h},100%,50%)">
      <label style="font-size:.7rem;font-weight:900;color:#666;text-transform:uppercase;letter-spacing:.05em">Saturación <span id="ecp-sv">${s}%</span></label>
      <input type="range" id="ecp-s" min="0" max="100" value="${s}" style="width:100%;margin-bottom:10px;accent-color:hsl(${h},${s}%,50%)">
      <label style="font-size:.7rem;font-weight:900;color:#666;text-transform:uppercase;letter-spacing:.05em">Luminosidad <span id="ecp-lv">${l}%</span></label>
      <input type="range" id="ecp-l" min="0" max="100" value="${l}" style="width:100%;margin-bottom:16px;accent-color:hsl(${h},100%,${l}%)">
      <div style="display:flex;gap:10px">
        <button id="ecp-cancel" style="flex:1;padding:10px;border:2px solid #ddd;border-radius:8px;background:#fff;font-weight:900;font-size:.9rem;cursor:pointer">Cancelar</button>
        <button id="ecp-ok" style="flex:1;padding:10px;border:none;border-radius:8px;background:#111;color:#fff;font-weight:900;font-size:.9rem;cursor:pointer">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const elH=document.getElementById('ecp-h'), elS=document.getElementById('ecp-s'), elL=document.getElementById('ecp-l'), elPrev=document.getElementById('ecp-preview');
  function update(){
    h=+elH.value; s=+elS.value; l=+elL.value;
    const hex=_hslToHex(h,s,l);
    elPrev.style.background=hex;
    elH.style.accentColor=`hsl(${h},100%,50%)`;
    elS.style.accentColor=`hsl(${h},${s}%,50%)`;
    elL.style.accentColor=`hsl(${h},100%,${l}%)`;
    document.getElementById('ecp-sv').textContent=s+'%';
    document.getElementById('ecp-lv').textContent=l+'%';
    onColorChange(hex, false);
  }
  elH.addEventListener('input', update);
  elS.addEventListener('input', update);
  elL.addEventListener('input', update);
  document.getElementById('ecp-ok').addEventListener('click',()=>{
    const hex=_hslToHex(+elH.value,+elS.value,+elL.value);
    onColorChange(hex, true);
    overlay.remove();
  });
  document.getElementById('ecp-cancel').addEventListener('click',()=>{
    onColorChange(edDrawColor, true);
    overlay.remove();
  });
  overlay.addEventListener('click', e=>{ if(e.target===overlay){ onColorChange(edDrawColor,true); overlay.remove(); } });
  // Detener propagación de todos los eventos para no interferir con el canvas
  overlay.addEventListener('pointerdown', e=>e.stopPropagation(), true);
  overlay.addEventListener('touchstart',  e=>e.stopPropagation(), {passive:true, capture:true});
}

function edRenderOptionsPanel(mode){
  const panel=$('edOptionsPanel');if(!panel)return;
  // Siempre restaurar visibility (puede quedar hidden por edMinimize)
  if(mode) panel.style.visibility='';

  // Sin objeto: cerrar panel — pero respetar modos shape/line activos
  if(!mode||(mode==='props'&&edSelectedIdx<0)){
    // Si hay un submenú shape/line activo, no cerrar
    if(panel.dataset.mode==='shape' || panel.dataset.mode==='line'){
      return;
    }
    panel.classList.remove('open');panel.innerHTML='';
    requestAnimationFrame(edFitCanvas);return;
  }

  if(mode==='draw' || mode==='eraser' || mode==='fill'){
    // Si está minimizado, mostrar barra flotante en vez del panel
    if(edMinimized){
      window._edMinimizedDrawMode = mode;
      const panel=$('edOptionsPanel');
      if(panel){ panel.style.visibility='hidden'; }
      edDrawBarShow();
      return;
    }
    edDrawBarHide();
    const isFill = edActiveTool === 'fill';
    const isEr   = edActiveTool === 'eraser';
    const isPen  = !isFill && !isEr;
    const curSize = isEr ? edEraserSize : edDrawSize;
    const curOpacity = 100; // future: per-tool opacity
    // Función helper para generar info de estado
    const _infoText = () => {
      if(isFill) return `Color ${edDrawColor}`;
      return `${isEr ? edEraserSize : edDrawSize}px`;
    };
    panel.innerHTML=`
<div style="display:flex;flex-direction:column;width:100%;gap:0">
  <!-- FILA 1: Herramientas con scroll horizontal -->
  <div style="display:flex;flex-direction:row;align-items:center;width:100%;min-height:32px;padding:3px 0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch">
    <button id="op-tool-pen"
      style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;text-align:center;white-space:nowrap;background:${isPen?'rgba(0,0,0,.08)':'transparent'};color:${isPen?'var(--black)':'var(--gray-600)'}">Dibujar</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-tool-eraser"
      style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;text-align:center;white-space:nowrap;background:${isEr?'rgba(0,0,0,.08)':'transparent'};color:${isEr?'var(--black)':'var(--gray-600)'}">Borrar</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-tool-fill"
      style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;text-align:center;white-space:nowrap;background:${isFill?'rgba(0,0,0,.08)':'transparent'};color:${isFill?'var(--black)':'var(--gray-600)'}">Rellenar</button>

  </div>
  <!-- SEP H -->
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA 2: Controles -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:6px;padding:4px 0;min-height:32px;width:100%">
    ${!isEr ? `
    <div style="position:relative;display:flex;align-items:center;flex-shrink:0">
      <button id="op-custom-color-btn" style="width:26px;height:26px;border-radius:50%;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0;position:relative" title="Color personalizado">🎨
        <input type="color" id="op-dcolor" value="${edDrawColor}"
          style="width:0;height:0;opacity:0;position:absolute;pointer-events:none">
      </button>
    </div>
    <button id="op-eyedrop-btn" style="width:26px;height:26px;border-radius:50%;background:var(--gray-100);border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0;font-size:0.85rem" title="Cuentagotas">💧</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>` : ''}
    ${!isFill ? `
    <button id="op-size-btn"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Grosor</button>
    <div id="op-size-slider"
      style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="range" id="op-dsize" min="1" max="${isEr?80:48}" value="${isEr?edEraserSize:edDrawSize}"
        style="flex:1;min-width:40px;accent-color:var(--black)">
      <input type="number" id="op-dsize-num" min="1" max="${isEr?80:48}" value="${isEr?edEraserSize:edDrawSize}"
        style="width:38px;text-align:center;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
    </div>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>` : ''}
    <button id="op-opacity-btn"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Op%</button>
    <div id="op-opacity-slider"
      style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="range" id="op-dopacity" min="1" max="100" value="${edDrawOpacity}"
        style="flex:1;min-width:40px;accent-color:var(--black)">
      <input type="number" id="op-draw-opacity-num" min="1" max="100" value="${edDrawOpacity}"
        style="width:38px;text-align:center;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
    </div>
    ${isEr ? `
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-color-erase-btn"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700);white-space:nowrap">Borrar color</button>` : ''}

  </div>
  <!-- SEP H -->\n  <div style="height:1px;background:var(--gray-300);width:100%"></div>\n  <!-- FILA PALETA -->\n  ${!isEr ? `<div id="op-color-palette" style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0;flex-wrap:wrap">\n    ${edColorPalette.map((c,i) => `<button class="op-pal-dot" data-colidx="${i}" style="width:22px;height:22px;border-radius:50%;background:${c};border:${i===edSelectedPaletteIdx?'3px solid var(--black)':'2px solid var(--gray-300)'};cursor:pointer;flex-shrink:0;padding:0" title="${c}"></button>`).join('')}\n  </div>` : ''}\n  <!-- SEP H -->\n  <div style="height:1px;background:var(--gray-300);width:100%"></div>\n  <!-- FILA 3: Acciones -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0 2px 0;min-height:32px;width:100%">
    <button id="op-draw-del"
      style="flex-shrink:0;border:1px solid #fcc;border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:#c00">✕</button>
    <button id="op-draw-dup"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">⧉</button>
    <button id="op-draw-undo"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↩</button>
    <button id="op-draw-redo"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↪</button>
    <button id="op-draw-minimize"
      style="flex-shrink:0;border:none;border-radius:6px;padding:3px 10px;font-family:inherit;font-size:1.15rem;font-weight:900;background:transparent;cursor:pointer;color:#e63030" title="Minimizar">▼</button>
    <span id="op-draw-info"
      style="flex:1;text-align:right;font-size:clamp(.65rem,1.8vw,.75rem);font-weight:700;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">${isFill?'Color '+edDrawColor:(isEr?edEraserSize:edDrawSize)+'px · '+edDrawOpacity+'%'}</span>
    <button id="op-draw-ok"
      style="flex-shrink:0;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:5px 12px;font-family:inherit;font-size:clamp(.75rem,2.2vw,.85rem);font-weight:900;cursor:pointer">✓</button>
  </div>
</div>`;
    panel.classList.add('open');
    panel.dataset.mode = 'draw';

    // ── Herramientas ──
    $('op-tool-pen')?.addEventListener('click',()=>{
      edActiveTool='draw'; edCanvas.className='tool-draw';
      edRenderOptionsPanel('draw');
    });
    $('op-tool-eraser')?.addEventListener('click',()=>{
      edActiveTool='eraser'; edCanvas.className='tool-eraser';
      edRenderOptionsPanel('eraser');
    });
    $('op-tool-fill')?.addEventListener('click',()=>{
      edActiveTool='fill'; edCanvas.className='tool-fill';
      edRenderOptionsPanel('fill');
    });
    $('op-tool-shape')?.addEventListener('click',()=>{
      edActiveTool='shape'; edCanvas.className='tool-shape';
      _edActivateShapeTool();
    });
    $('op-tool-line')?.addEventListener('click',()=>{
      edActiveTool='line'; edCanvas.className='tool-line';
      _edActivateLineTool();
    });

    $('op-eyedrop-btn')?.addEventListener('click', ()=>{ _edStartEyedrop(); });
    // ── Color: botón arcoíris abre picker propio en táctil, nativo en PC ──
    $('op-custom-color-btn')?.addEventListener('click',()=>{
      if(edSelectedPaletteIdx <= 1){ edToast('Este color no es editable'); return; }
      if(edLastPointerIsTouch){
        _edShowColorPicker((hex, final)=>{
          edDrawColor = hex;
          if(final){ edColorPalette[edSelectedPaletteIdx] = hex; }
          _edUpdatePaletteDots();
        });
      } else {
        $('op-dcolor')?.click();
      }
    });
    $('op-dcolor')?.addEventListener('input',e=>{
      if(edSelectedPaletteIdx <= 1) return;
      edDrawColor = e.target.value;
      edColorPalette[edSelectedPaletteIdx] = edDrawColor;
      _edUpdatePaletteDots();
    });
    // Dots de la paleta
    document.querySelectorAll('.op-pal-dot').forEach(dot=>{
      dot.addEventListener('click',()=>{
        const idx = parseInt(dot.dataset.colidx);
        edSelectedPaletteIdx = idx;
        edDrawColor = edColorPalette[idx];
        _edUpdatePaletteDots();
      });
    });

    // ── Grosor: botón toggle (mutuamente exclusivo con opacidad) ──
    $('op-size-btn')?.addEventListener('click',()=>{
      const sl=$('op-size-slider'), slO=$('op-opacity-slider');
      if(!sl) return;
      const open = sl.style.display==='none' || sl.style.display==='';
      sl.style.display = open ? 'flex' : 'none';
      if(open && slO){ slO.style.display='none'; $('op-opacity-btn').style.background='transparent'; }
      $('op-size-btn').style.background = open ? 'var(--gray-200)' : 'transparent';
    });
    $('op-dsize')?.addEventListener('input',e=>{
      const v=+e.target.value;
      if(edActiveTool==='eraser') edEraserSize=v; else edDrawSize=v;
      const num=$('op-dsize-num'); if(num) num.value=v;
      _edbSyncSize(); _edUpdateDrawInfo();
    });
    $('op-dsize-num')?.addEventListener('change',e=>{
      const max=edActiveTool==='eraser'?80:48;
      const v=Math.max(1,Math.min(max,parseInt(e.target.value)||1));
      e.target.value=v;
      if(edActiveTool==='eraser') edEraserSize=v; else edDrawSize=v;
      const sl=$('op-dsize'); if(sl) sl.value=v;
      _edbSyncSize(); _edUpdateDrawInfo();
    });
    $('op-color-erase-btn')?.addEventListener('click',()=>{
      edCanvas.style.cursor = 'crosshair';
      window._edColorEraseReady = true;
      const btn=$('op-color-erase-btn');
      if(btn) btn.style.background='var(--gray-200)';
      edToast('Toca el color a borrar');
    });
    // ── Opacidad: botón toggle (mutuamente exclusivo con grosor) ──
    $('op-opacity-btn')?.addEventListener('click',()=>{
      const slO=$('op-opacity-slider'), sl=$('op-size-slider');
      if(!slO) return;
      const open = slO.style.display==='none' || slO.style.display==='';
      slO.style.display = open ? 'flex' : 'none';
      if(open && sl){ sl.style.display='none'; $('op-size-btn').style.background='transparent'; }
      $('op-opacity-btn').style.background = open ? 'var(--gray-200)' : 'transparent';
    });
    $('op-dopacity')?.addEventListener('input',e=>{
      edDrawOpacity=+e.target.value;
      const num=$('op-draw-opacity-num'); if(num) num.value=edDrawOpacity;
      _edUpdateDrawInfo();
    });
    $('op-draw-opacity-num')?.addEventListener('change',e=>{
      const v=Math.max(1,Math.min(100,parseInt(e.target.value)||1));
      e.target.value=v; edDrawOpacity=v;
      const sl=$('op-dopacity'); if(sl) sl.value=v;
      _edUpdateDrawInfo();
    });

    // ── Deshacer / Rehacer ──
    $('op-draw-undo')?.addEventListener('click', edDrawUndo);
    $('op-draw-redo')?.addEventListener('click', edDrawRedo);
    _edDrawUpdateUndoRedoBtns();

    // ── Minimizar (desde el panel draw) ──
    $('op-draw-minimize')?.addEventListener('click', ()=>{ $('edMinimizeBtn')?.click(); });

    // ── OK: congelar ──
    $('op-draw-ok')?.addEventListener('click',()=>{
      edCloseOptionsPanel();
      if(['draw','eraser','fill'].includes(edActiveTool)) edDeactivateDrawTool();
      if(edMinimized){ window._edMinimizedDrawMode = null; edMaximize(); }
    });

    // ── Duplicar ──
    $('op-draw-dup')?.addEventListener('click',()=>{
      if(['draw','eraser','fill'].includes(edActiveTool)) edDeactivateDrawTool();
      edDuplicateSelected();
      edCloseOptionsPanel();
    });

    // ── Eliminar ──
    $('op-draw-del')?.addEventListener('click',()=>{
      const ok = confirm('¿Eliminar el dibujo?');
      if(!ok) return;
      const page=edPages[edCurrentPage];if(!page)return;
      const dlIdx=page.layers.findIndex(l=>l.type==='draw');
      if(dlIdx>=0){page.layers.splice(dlIdx,1);edLayers=page.layers;}
      edActiveTool='select'; edCanvas.className='';
      const cur=$('edBrushCursor');if(cur)cur.style.display='none';
      delete panel.dataset.mode;
      _edDrawClearHistory();
      _edDrawUnlockUI();
      edCloseOptionsPanel(); _edShapePushHistory(); edRedraw();
      edToast('Dibujo eliminado');
    });

    // Solo redibujar el canvas para actualizar el cursor; NO redimensionar
    edRedraw();return;
  }

  if(mode==='props'){
    if(edSelectedIdx<0||edSelectedIdx>=edLayers.length){
      panel.classList.remove('open');panel.innerHTML='';requestAnimationFrame(edFitCanvas);return;
    }
    panel.dataset.mode = 'props';
    const la=edLayers[edSelectedIdx];
    let html='';

    if(la.type==='text'||la.type==='bubble'){
      html+=`
      <div class="op-prop-row"><span class="op-prop-label">Texto</span>
        <textarea id="pp-text" style="border-radius:8px;resize:vertical;min-height:40px;flex:1;border:2px solid var(--gray-300);padding:4px 8px;font-family:var(--font-body);font-size:.84rem;">${la.text.replace(/</g,'&lt;')}</textarea></div>
      <div class="op-prop-row"><span class="op-prop-label">Fuente</span>
        <select id="pp-font">
          <option value="Patrick Hand" ${la.fontFamily==='Patrick Hand'?'selected':''}>Patrick Hand</option>
          <option value="Bangers" ${la.fontFamily==='Bangers'?'selected':''}>Bangers</option>
          <option value="Permanent Marker" ${la.fontFamily==='Permanent Marker'?'selected':''}>Permanent Marker</option>
          <option value="Bebas Neue" ${la.fontFamily==='Bebas Neue'?'selected':''}>Bebas Neue</option>
          <option value="Oswald" ${la.fontFamily==='Oswald'?'selected':''}>Oswald</option>
          <option value="Comic Neue" ${la.fontFamily==='Comic Neue'?'selected':''}>Comic Neue</option>
          <option value="Arial" ${la.fontFamily==='Arial'?'selected':''}>Arial</option>
          <option value="Verdana" ${la.fontFamily==='Verdana'?'selected':''}>Verdana</option>
        </select>
        <label style="display:flex;align-items:center;gap:3px;font-size:.82rem;font-weight:900;margin-left:6px;cursor:pointer" title="Negrita">
          <input type="checkbox" id="pp-bold" ${la.fontBold?'checked':''}><b>B</b>
        </label>
        <label style="display:flex;align-items:center;gap:3px;font-size:.82rem;font-style:italic;margin-left:4px;cursor:pointer" title="Cursiva">
          <input type="checkbox" id="pp-italic" ${la.fontItalic?'checked':''}><i>I</i>
        </label>
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
            <option value="explosion" ${la.style==='explosion'?'selected':''}>Explosión/Grito</option>
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
    } else if(la.type==='stroke'){
      html+=`
      <div class="op-prop-row"><span class="op-prop-label">Opacidad</span>
        <input type="range" id="pp-opacity" min="0" max="100" value="${Math.round((la.opacity??1)*100)}" style="flex:1;accent-color:var(--black)">
        <span id="pp-opacity-val" style="font-size:.75rem;font-weight:900;min-width:32px;text-align:right">${Math.round((la.opacity??1)*100)}%</span>
      </div>
      <div class="op-prop-row">
        <button id="pp-edit-stroke" style="flex:1;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:6px 10px;font-weight:900;font-size:.82rem;cursor:pointer">✏️ Editar dibujo</button>
      </div>`;
    } else if(la.type==='image'){
      html+=`
      <div class="op-prop-row"><span class="op-prop-label">Rotación</span>
        <input type="number" id="pp-rot" value="${la.rotation}" min="-180" max="180"> °
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Opacidad</span>
        <input type="range" id="pp-opacity" min="0" max="100" value="${Math.round((la.opacity??1)*100)}" style="flex:1;accent-color:var(--black)">
        <span id="pp-opacity-val" style="font-size:.75rem;font-weight:900;min-width:32px;text-align:right">${Math.round((la.opacity??1)*100)}%</span>
      </div>`;
    } else if(la.type==='shape'){
      html+=`
      <div class="op-prop-row">
        <button id="pp-edit-shape" style="flex:1;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:6px 10px;font-weight:900;font-size:.82rem;cursor:pointer">✏️ Editar objeto</button>
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Opacidad</span>
        <input type="range" id="pp-opacity" min="0" max="100" value="${Math.round((la.opacity??1)*100)}" style="flex:1;accent-color:var(--black)">
        <span id="pp-opacity-val" style="font-size:.75rem;font-weight:900;min-width:32px;text-align:right">${Math.round((la.opacity??1)*100)}%</span>
      </div>`;
    } else if(la.type==='line'){
      html+=`
      <div class="op-prop-row">
        <button id="pp-edit-line" style="flex:1;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:6px 10px;font-weight:900;font-size:.82rem;cursor:pointer">✏️ Editar recta</button>
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Polígono</span>
        <button id="pp-line-toggle-close" style="flex:1;border:1px solid var(--gray-300);border-radius:6px;padding:4px;font-weight:700;cursor:pointer">${la.closed?'Abrir':'Cerrar'}</button>
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Opacidad</span>
        <input type="range" id="pp-opacity" min="0" max="100" value="${Math.round((la.opacity??1)*100)}" style="flex:1;accent-color:var(--black)">
        <span id="pp-opacity-val" style="font-size:.75rem;font-weight:900;min-width:32px;text-align:right">${Math.round((la.opacity??1)*100)}%</span>
      </div>`;
    }
    html+=`<div class="op-row" style="margin-top:2px;justify-content:space-between;gap:4px">
      <button class="op-btn danger" id="pp-del" style="flex:1">✕ Eliminar</button>
      <button class="op-btn" id="pp-dup" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.78rem;cursor:pointer">⧉ Duplicar</button>
      <button id="pp-ok" style="background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 10px;font-weight:900;font-size:.82rem;cursor:pointer;flex-shrink:0">✓ OK</button>
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
        else if(id==='pp-bold')  {la.fontBold=e.target.checked;la.resizeToFitText(edCanvas);}
        else if(id==='pp-italic'){la.fontItalic=e.target.checked;la.resizeToFitText(edCanvas);}
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
    $('pp-del')?.addEventListener('click',()=>{
      const ok = confirm('¿Eliminar este objeto?');
      if(ok){ edDeleteSelected(); edCloseOptionsPanel(); }
    });
    $('pp-dup')?.addEventListener('click',()=>{ edDuplicateSelected(); edCloseOptionsPanel(); });
    $('pp-ok')?.addEventListener('click',()=>{ edCloseOptionsPanel(); });
    $('pp-edit-stroke')?.addEventListener('click',()=>{
      const page=edPages[edCurrentPage]; if(!page) return;
      const sl=edLayers[edSelectedIdx]; if(!sl||sl.type!=='stroke') return;
      const dl=sl.toDrawLayer();
      page.layers.splice(edSelectedIdx, 1, dl);
      edLayers=page.layers;
      edSelectedIdx=-1;
      edActiveTool='draw';
      edCanvas.className='tool-draw';
      const cur=$('edBrushCursor');if(cur)cur.style.display='block';
      _edDrawInitHistory();
      _edDrawLockUI();
      edRenderOptionsPanel('draw');
      edRedraw();
    });
    // Shape props — editar objeto abre submenú Objeto con este shape seleccionado
    $('pp-edit-shape')?.addEventListener('click',()=>{
      edActiveTool='shape';
      edCanvas.className='tool-shape';
      _edShapeType = la.shape || 'rect';
      edDrawColor  = la.color || '#000000';
      edDrawSize   = la.lineWidth || 3;
      _edActivateShapeTool();
    });
    $('pp-shape-rect')?.addEventListener('click',()=>{ la.shape='rect'; edRedraw(); edRenderOptionsPanel('props'); });
    $('pp-shape-ellipse')?.addEventListener('click',()=>{ la.shape='ellipse'; edRedraw(); edRenderOptionsPanel('props'); });
    $('pp-shape-color')?.addEventListener('input',e=>{ la.color=e.target.value; edRedraw(); });
    $('pp-shape-lw')?.addEventListener('change',e=>{ la.lineWidth=Math.max(0,Math.min(20,+e.target.value)); edRedraw(); });
    // Line props — editar recta abre submenú Rectas
    $('pp-edit-line')?.addEventListener('click',()=>{
      edActiveTool='line';
      edCanvas.className='tool-line';
      edDrawColor = la.color || '#000000';
      edDrawSize  = la.lineWidth || 3;
      _edActivateLineTool();
    });
    $('pp-line-toggle-close')?.addEventListener('click',()=>{ la.closed=!la.closed; edRedraw(); edRenderOptionsPanel('props'); });
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
  } // fin if(mode==='props')

  panel.classList.remove('open');panel.innerHTML='';requestAnimationFrame(edFitCanvas);
} // fin edRenderOptionsPanel

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
  // Herramientas de dibujo: mostrar barra de dibujo
  if(['draw','eraser','fill'].includes(edActiveTool)){
    window._edMinimizedDrawMode = edActiveTool;
    const panel=$('edOptionsPanel');
    if(panel) panel.style.visibility='hidden';
    edDrawBarShow();
  }
  // Herramientas shape/line: ocultar panel, guardar modo y mostrar barra flotante
  const _panel=$('edOptionsPanel');
  if(_panel?.dataset.mode==='shape' || _panel?.dataset.mode==='line'){
    window._edMinimizedDrawMode = _panel.dataset.mode;
    _panel.style.visibility='hidden';
    edShapeBarShow();
  }
  edFitCanvas();
}
function edMaximize(keepBar=false){
  edMinimized=false;
  const menu=$('edMenuBar'),top=$('edTopbar');
  if(menu)menu.style.display='';
  if(top)top.style.display='';
  $('edFloatBtn')?.classList.remove('visible');
  if(!keepBar){ edDrawBarHide(); }
  edShapeBarHide();
  // Restaurar panel si estaba activo al minimizar
  if(window._edMinimizedDrawMode){
    const mode = window._edMinimizedDrawMode;
    window._edMinimizedDrawMode = null;
    const panel=$('edOptionsPanel');
    if(panel) panel.style.visibility='';
    edFitCanvas();
    if(mode === 'shape'){
      edShapeBarHide();
      _edActivateShapeTool();
    } else if(mode === 'line'){
      edShapeBarHide();
      _edActivateLineTool();
    } else {
      edRenderOptionsPanel(mode);
    }
  } else {
    edFitCanvas();
  }
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
   BARRA HERRAMIENTAS DIBUJO FLOTANTE (T5)
   ══════════════════════════════════════════ */
let _edbX = 64, _edbY = 12;  // posición persistente de la barra

function edInitDrawBar() {
  const bar = $('edDrawBar'); if (!bar) return;

  // ── Drag con long-press (300ms) en touch, inmediato en pointer no-touch ──
  let _drag = false, _sx = 0, _sy = 0, _sl = 0, _st = 0, _longTimer = null;
  let _edbDragLocked = false;   // true durante drag: bloquea clicks de botones
  let _edbPid = null;           // pointerId capturado

  function _edbStartDrag(e) {
    _drag = true;
    _edbDragLocked = true;
    // Coordenadas relativas al shell para que los límites sean correctos
    // tanto en pantalla completa como en ventana normal del navegador
    const shell = document.getElementById('editorShell');
    const shellRect = shell ? shell.getBoundingClientRect() : { left: 0, top: 0 };
    _sx = e.clientX - shellRect.left;
    _sy = e.clientY - shellRect.top;
    _sl = parseInt(bar.style.left) || _edbX;
    _st = parseInt(bar.style.top)  || _edbY;
    // Feedback visual: fondo más claro indica modo arrastre
    bar.style.background = 'rgba(80,80,80,0.92)';
    bar.style.willChange = 'transform';
    const cur = $('edBrushCursor'); if (cur) cur.style.display = 'none';
    if (_edbPid !== null) { try { bar.setPointerCapture(_edbPid); } catch(_){} }
    if (navigator.vibrate) navigator.vibrate(30);
  }

  // Bloquear clicks en botones mientras está en modo drag
  bar.addEventListener('click', e => {
    if (_edbDragLocked) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  bar.addEventListener('pointerdown', e => {
    _edbPid = e.pointerId;
    _edbDragLocked = false;
    e.preventDefault();
    if (e.pointerType === 'touch') {
      // Touch: long-press de 300ms activa el drag desde cualquier punto de la barra
      // Guardar posición inicial relativa al shell (igual que _edbStartDrag)
      const _shell0 = document.getElementById('editorShell');
      const _rect0  = _shell0 ? _shell0.getBoundingClientRect() : { left: 0, top: 0 };
      _sx = e.clientX - _rect0.left; _sy = e.clientY - _rect0.top;
      _longTimer = setTimeout(() => {
        _longTimer = null;
        _edbStartDrag(e);
      }, 300);
    } else {
      // Mouse/stylus: drag inmediato solo desde fondo (no botones)
      if (!e.target.closest('button')) _edbStartDrag(e);
    }
  }, { passive: false });

  bar.addEventListener('pointermove', e => {
    const shell = document.getElementById('editorShell');
    const shellRect = shell ? shell.getBoundingClientRect() : { left: 0, top: 0 };
    const ex = e.clientX - shellRect.left;
    const ey = e.clientY - shellRect.top;
    if (_longTimer && (Math.abs(ex - _sx) > 6 || Math.abs(ey - _sy) > 6)) {
      clearTimeout(_longTimer); _longTimer = null;
    }
    if (!_drag) return;
    e.preventDefault();
    const dx = ex - _sx, dy = ey - _sy;
    const W = shell ? shell.offsetWidth  : window.innerWidth;
    const H = shell ? shell.offsetHeight : window.innerHeight;
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    _edbX = Math.max(0, Math.min(W - bw, _sl + dx));
    _edbY = Math.max(0, Math.min(H - bh, _st + dy));
    bar.style.left = _edbX + 'px';
    bar.style.top  = _edbY + 'px';
    // Snap de orientación: solo cambia al ENTRAR en zona de borde, nunca al salir
    const SNAP = 48;
    const wasHoriz = bar.classList.contains('horiz');
    const distPtrTB = Math.min(ey, H - ey);
    const distPtrLR = Math.min(ex, W - ex);
    // Solo actuar si el puntero está dentro del rango de algún borde
    if (distPtrTB < SNAP || distPtrLR < SNAP) {
      const shouldHoriz = distPtrTB <= distPtrLR;
      if (shouldHoriz !== wasHoriz) {
        bar.classList.toggle('horiz', shouldHoriz);
        // Reajustar origen del drag para compensar el nuevo tamaño
        const newBw = bar.offsetWidth, newBh = bar.offsetHeight;
        const adjX = (bw - newBw) / 2, adjY = (bh - newBh) / 2;
        _sl += adjX; _st += adjY;
        _edbX = Math.max(0, Math.min(W - newBw, _edbX + adjX));
        _edbY = Math.max(0, Math.min(H - newBh, _edbY + adjY));
        bar.style.left = _edbX + 'px';
        bar.style.top  = _edbY + 'px';
      }
    }
    // Fuera de rango: mantener orientación sin tocarla
  }, { passive: false });

  function _edbApplySnap() {
    // La orientación ya se gestiona en tiempo real durante el drag.
    // Esta función se mantiene por si se necesita en el futuro (p.ej. resize de ventana).
  }

  function _edbEndDrag() {
    if (_longTimer) { clearTimeout(_longTimer); _longTimer = null; }
    _drag = false;
    bar.style.background = '';
    bar.style.willChange = '';
    // Pequeño delay para que el click bloqueado no se propague tras soltar
    setTimeout(() => { _edbDragLocked = false; }, 50);
    if (['draw','eraser'].includes(edActiveTool)) {
      const cur = $('edBrushCursor'); if (cur) cur.style.display = 'block';
    }
  }

  bar.addEventListener('pointerup',     _edbEndDrag);
  bar.addEventListener('pointercancel', _edbEndDrag);

  // ── Botones herramienta ──
  $('edb-pen')?.addEventListener('click', () => {
    edActiveTool = 'draw'; edCanvas.className = 'tool-draw';
    _edbSyncTool();
    $('op-tool-pen')?.click();
  });
  $('edb-eraser')?.addEventListener('click', () => {
    edActiveTool = 'eraser'; edCanvas.className = 'tool-eraser';
    _edbSyncTool();
    $('op-tool-eraser')?.click();
  });
  $('edb-fill')?.addEventListener('click', () => {
    edActiveTool = 'fill'; edCanvas.className = 'tool-fill';
    _edbSyncTool();
    $('op-tool-fill')?.click();
  });

  // ── Color: abre popover de paleta ──
  $('edb-color')?.addEventListener('click', e => {
    e.stopPropagation();
    _edbTogglePalette();
  });

  // ── Cuentagotas en barra flotante ──
  $('edb-eyedrop')?.addEventListener('pointerup', e => {
    e.stopPropagation();
    _edStartEyedrop();
  });

  // ── Grosor: abre popover con slider + input numérico ──
  $('edb-size')?.addEventListener('click', e => {
    e.stopPropagation();
    const pop = $('edb-size-pop');
    if (!pop) return;
    const isOpen = pop.style.display === 'flex';
    if (isOpen) { pop.style.display = 'none'; return; }
    // Sincronizar valor actual antes de medir
    const isEr = edActiveTool === 'eraser';
    const sz   = isEr ? edEraserSize : edDrawSize;
    const num  = $('edb-size-num');
    if (num) { num.max = isEr ? 80 : 48; num.value = sz; }
    const sl = $('edb-size-slider');
    if (sl) { sl.max = isEr ? 80 : 48; sl.value = sz; }
    const prev = $('edb-size-preview');
    if (prev) { const pd=Math.max(4,Math.min(32,Math.round(sz*0.7))); prev.style.width=pd+'px'; prev.style.height=pd+'px'; }
    // Mostrar para poder medir dimensiones reales
    pop.style.display = 'flex';
    pop.style.left = '-9999px'; pop.style.top = '-9999px';
    const btn = $('edb-size');
    const br  = btn.getBoundingClientRect();
    const pw  = pop.offsetWidth  || 90;
    const ph  = pop.offsetHeight || 44;
    const W   = window.innerWidth;
    const H   = window.innerHeight;
    const GAP = 8;
    // Decidir posición: preferir arriba, si no cabe abajo, si no lateral
    let left, top;
    if (br.top - ph - GAP >= 0) {
      // Cabe arriba
      top  = br.top - ph - GAP;
      left = Math.max(GAP, Math.min(W - pw - GAP, br.left + br.width/2 - pw/2));
    } else if (br.bottom + ph + GAP <= H) {
      // Cabe abajo
      top  = br.bottom + GAP;
      left = Math.max(GAP, Math.min(W - pw - GAP, br.left + br.width/2 - pw/2));
    } else if (br.left - pw - GAP >= 0) {
      // Cabe a la izquierda
      left = br.left - pw - GAP;
      top  = Math.max(GAP, Math.min(H - ph - GAP, br.top + br.height/2 - ph/2));
    } else {
      // A la derecha
      left = br.right + GAP;
      top  = Math.max(GAP, Math.min(H - ph - GAP, br.top + br.height/2 - ph/2));
    }
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
  });
  $('edb-size-num')?.addEventListener('change', e => {
    const pop=$('edb-size-pop');
    if(pop?._esbOpMode){
      const v=Math.max(0,Math.min(100,parseInt(e.target.value)||0));
      e.target.value=v;
      const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
      if(la){ la.opacity=v/100; _edShapePushHistory(); edRedraw(); _esbSync(); }
      const sl=$('edb-size-slider'); if(sl) sl.value=v;
      return;
    }
    const isEr = edActiveTool === 'eraser';
    const max = isEr ? 80 : 48;
    const v = Math.max(0, Math.min(max, parseInt(e.target.value) || 0));
    e.target.value = v;
    if(pop?._esbMode){
      const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
      if(la && (la.type==='shape'||la.type==='line')){ la.lineWidth = v; _edShapePushHistory(); edRedraw(); }
      edDrawSize = v;
    } else {
      if (isEr) edEraserSize = v; else edDrawSize = v;
    }
    _edbSyncSize();
    const sl = $('op-dsize'); if (sl) { sl.value = v; const n=$('op-dsize-num'); if(n) n.value=v; }
  });
  // Slider de grosor en tiempo real
  $('edb-size-slider')?.addEventListener('input', e => {
    const pop=$('edb-size-pop');
    const v = parseInt(e.target.value) || 0;
    if(pop?._esbOpMode){
      // Modo opacidad: solo actualizar número y aplicar
      const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
      if(la){ la.opacity=v/100; edRedraw(); _esbSync(); }
      const num=$('edb-size-num'); if(num) num.value=v;
      return;
    }
    const isEr = edActiveTool === 'eraser';
    if(pop?._esbMode){
      const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
      if(la && (la.type==='shape'||la.type==='line')){ la.lineWidth = v; edRedraw(); }
      edDrawSize = v;
    } else {
      if (isEr) edEraserSize = v; else edDrawSize = v;
    }
    // Actualizar número y preview inmediatamente
    const num = $('edb-size-num'); if(num) num.value = v;
    const prev = $('edb-size-preview');
    if(prev){ const pd=Math.max(4,Math.min(32,Math.round(v*0.7))); prev.style.width=pd+'px'; prev.style.height=pd+'px'; }
    const dot = $('edb-size-dot');
    if(dot){ const d=Math.max(6,Math.min(24,Math.round(v*0.6))); dot.style.width=d+'px'; dot.style.height=d+'px'; }
    const sl = $('op-dsize'); if(sl){ sl.value=v; const n=$('op-dsize-num'); if(n) n.value=v; }
  });
  $('edb-size-slider')?.addEventListener('pointerup', e => {
    const pop=$('edb-size-pop');
    if(pop?._esbOpMode || pop?._esbMode) _edShapePushHistory();
  });
  $('edb-size-slider')?.addEventListener('pointerdown', e => e.stopPropagation());
  $('edb-size-slider')?.addEventListener('touchstart', e => e.stopPropagation(), {passive:true});
  ['pointerdown','touchstart'].forEach(ev =>
    $('edb-size-pop')?.addEventListener(ev, e => e.stopPropagation(), { passive: true })
  );
  // Cerrar popover de grosor al tocar fuera
  document.addEventListener('pointerdown', e => {
    const pop = $('edb-size-pop');
    if (pop && pop.style.display === 'flex' && !pop.contains(e.target) && e.target.id !== 'edb-size' && e.target.id !== 'esb-size' && e.target.id !== 'esb-opacity'){
      pop.style.display = 'none';
      pop._esbMode = false; pop._esbOpMode = false;
      // Restaurar preview dot y etiqueta para el modo grosor
      const prev=$('edb-size-preview'); if(prev) prev.style.display='';
      const lbl=pop.querySelector('span[style*="color:#ccc"]'); if(lbl) lbl.textContent='px';
    }
  }, { passive: true });

  // ── Deshacer / Rehacer ──
  $('edb-undo')?.addEventListener('click', () => edDrawUndo());
  $('edb-redo')?.addEventListener('click', () => edDrawRedo());

  // ── OK: finaliza el modo dibujo ──
  $('edb-ok')?.addEventListener('click', () => {
    const panel = $('edOptionsPanel');
    if(panel) panel.style.visibility = '';
    $('op-draw-ok')?.click();
  });
}

function _edbTogglePalette() {
  const pop = $('edb-palette-pop');
  if (!pop) return;
  if (pop.classList.contains('open')) { _edbClosePalette(); return; }
  _edbBuildPalette();
  _edbPositionPalette();
  pop.classList.add('open');
  // Cerrar al tocar fuera
  setTimeout(() => {
    window._edbPaletteClose = e => {
      if (!e.target.closest('#edb-palette-pop') && !e.target.closest('#edb-color')) {
        _edbClosePalette();
      }
    };
    document.addEventListener('pointerdown', window._edbPaletteClose, { once: true });
  }, 0);
}

function _edbClosePalette() {
  $('edb-palette-pop')?.classList.remove('open');
}

function _edbBuildPalette() {
  const pop = $('edb-palette-pop'); if (!pop) return;
  const bar = $('edDrawBar');
  const isHoriz = bar?.classList.contains('horiz');
  pop.className = 'edb-palette-pop' + (isHoriz ? ' horiz-pop' : '');
  pop.id = 'edb-palette-pop';
  pop.classList.toggle('open', true); // mantener open al reconstruir

  pop.innerHTML = edColorPalette.map((c, i) =>
    `<button class="edb-pal-dot${c === edDrawColor ? ' current' : ''}"
      data-colidx="${i}" style="background:${c}" title="${c}"></button>`
  ).join('') +
  `<button class="edb-pal-dot edb-pal-custom" data-custom="1" title="Color personalizado">+</button>`;

  pop.querySelectorAll('.edb-pal-dot').forEach(btn => {
    btn.addEventListener('pointerup', e => {
      e.stopPropagation();
      if (btn.dataset.custom) {
        // Slots 0 y 1 son negro/blanco fijos — no editables
        if(edSelectedPaletteIdx <= 1){ edToast('Este color no es editable'); _edbClosePalette(); return; }
        _edbClosePalette();
        _edShowColorPicker((hex, commit) => {
          edDrawColor = hex;
          if (commit) _edUpdatePaletteDots();
          _edbSyncColor();
        });
        return;
      }
      const idx = +btn.dataset.colidx;
      edDrawColor = edColorPalette[idx];
      _edbSyncColor();
      // Sincronizar panel principal si está abierto
      const mainDot = document.querySelector(`.op-pal-dot[data-colidx="${idx}"]`);
      if (mainDot) mainDot.dispatchEvent(new Event('click'));
      _edbClosePalette();
    });
  });
}

function _edbPositionPalette() {
  const pop = $('edb-palette-pop');
  const bar = $('edDrawBar');
  const sw  = $('edb-color');
  if (!pop || !bar || !sw) return;

  const isHoriz = bar.classList.contains('horiz');
  const br = bar.getBoundingClientRect();
  const shell = document.getElementById('editorShell');
  const sr = shell ? shell.getBoundingClientRect() : { left: 0, top: 0 };

  // Mostrar sin visibilidad para medir tamaño
  pop.style.visibility = 'hidden';
  pop.style.display = 'flex';
  const pw = pop.offsetWidth || 44;
  const ph = pop.offsetHeight || 200;
  pop.style.display = '';
  pop.style.visibility = '';

  let left, top;
  if (isHoriz) {
    // Barra horizontal → paleta debajo
    left = br.left - sr.left + (br.width / 2) - pw / 2;
    top  = br.bottom - sr.top + 6;
  } else {
    // Barra vertical → paleta a la derecha
    left = br.right - sr.left + 6;
    top  = br.top - sr.top + (br.height / 2) - ph / 2;
  }
  // Ajustar para no salir del shell
  const sw2 = shell ? shell.offsetWidth  : window.innerWidth;
  const sh2 = shell ? shell.offsetHeight : window.innerHeight;
  left = Math.max(4, Math.min(sw2 - pw - 4, left));
  top  = Math.max(4, Math.min(sh2 - ph - 4, top));

  pop.style.left = left + 'px';
  pop.style.top  = top  + 'px';
}


function _edbSyncTool() {
  const bar = $('edDrawBar'); if (!bar) return;
  const t = edActiveTool;
  $('edb-pen')?.classList.toggle('active', t === 'draw');
  $('edb-eraser')?.classList.toggle('active', t === 'eraser');
  $('edb-fill')?.classList.toggle('active', t === 'fill');
  _edbSyncSize();
  _edbSyncColor();
}

function _edbSyncColor() {
  const sw = $('edb-color'); if (!sw) return;
  sw.style.background = edDrawColor;
  sw.style.display = edActiveTool === 'eraser' ? 'none' : '';
  // También actualizar el swatch de la barra de polígonos
  const sw2 = $('esb-color'); if(sw2) sw2.style.background = edDrawColor;
}

function _edUpdateDrawInfo() {
  const info = $('op-draw-info'); if (!info) return;
  const isEr = edActiveTool === 'eraser';
  const isFill = edActiveTool === 'fill';
  info.textContent = isFill
    ? 'Color ' + edDrawColor
    : (isEr ? edEraserSize : edDrawSize) + 'px · ' + edDrawOpacity + '%';
}

function _edbSyncSize() {
  const dot = $('edb-size-dot'); if (!dot) return;
  const isEr = edActiveTool === 'eraser';
  const sz = isEr ? edEraserSize : edDrawSize;
  // Dot visual entre 6px y 24px según tamaño
  const d = Math.max(6, Math.min(24, Math.round(sz * 0.6)));
  dot.style.width  = d + 'px';
  dot.style.height = d + 'px';
  const sizebtn = $('edb-size');
  if (sizebtn) sizebtn.title = sz + 'px';
  // Sincronizar input numérico
  const num = $('edb-size-num');
  if (num) { num.value = sz; num.max = isEr ? 80 : 48; }
  // Sincronizar slider y preview del popup
  const sl = $('edb-size-slider');
  if (sl) { sl.value = sz; sl.max = isEr ? 80 : 48; }
  const prev = $('edb-size-preview');
  if (prev) {
    const pd = Math.max(4, Math.min(32, Math.round(sz * 0.7)));
    prev.style.width  = pd + 'px';
    prev.style.height = pd + 'px';
  }
}


/* Calcular posición por defecto de una barra flotante:
   pegada al borde izquierdo del lienzo, centrada verticalmente */

function _edCurveModeActive(){
  const panelS=$('op-shape-curve-slider');
  const panelL=$('op-line-curve-slider');
  const barBtn=$('esb-curve');
  return (panelS&&panelS.style.display==='flex')||
         (panelL&&panelL.style.display==='flex')||
         (barBtn&&barBtn.dataset.curveActive==='1');
}

function _edBarDefaultPos(barEl) {
  const shell = document.getElementById('editorShell');
  if (!shell) return { x: 8, y: 120 };
  const bw = barEl.offsetWidth  || 36;
  const bh = barEl.offsetHeight || 200;
  const shellR = shell.getBoundingClientRect();
  const canv   = document.getElementById('editorCanvas');
  const canvR  = canv ? canv.getBoundingClientRect() : shellR;
  // X: justo a la izquierda del borde del canvas; si no cabe, solapar ligeramente
  const leftSpace = canvR.left - shellR.left;
  const x = leftSpace >= bw + 6
    ? Math.round(leftSpace - bw - 6)   // cabe a la izquierda
    : Math.max(4, Math.round(leftSpace + 6)); // solapar el borde izquierdo
  // Y: centrado verticalmente respecto al shell
  const shellH = shellR.height || shell.offsetHeight || window.innerHeight;
  const y = Math.max(4, Math.round((shellH - bh) / 2));
  return { x, y };
}

function edDrawBarShow() {
  const bar = $('edDrawBar'); if (!bar) return;
  bar.classList.add('visible'); // visible primero para medir offsetHeight
  // Si sigue en la posición inicial, centrar en el borde izquierdo del lienzo
  if (_edbX === 64 && _edbY === 12) {
    const pos = _edBarDefaultPos(bar);
    _edbX = pos.x; _edbY = pos.y;
  }
  bar.style.left = _edbX + 'px';
  bar.style.top  = _edbY + 'px';
  _edbSyncTool();
}

function edDrawBarHide() {
  $('edDrawBar')?.classList.remove('visible');
  _edbClosePalette();
}

/* ══════════════════════════════════════════
   BARRA FLOTANTE SHAPE / LINE
   ══════════════════════════════════════════ */
let _esbX = 12, _esbY = 120;

function edShapeBarShow() {
  const bar = $('edShapeBar'); if(!bar) return;
  bar.classList.add('visible'); // visible primero para medir offsetHeight
  // Si sigue en la posición inicial, centrar en el borde izquierdo del lienzo
  if (_esbX === 12 && _esbY === 120) {
    const pos = _edBarDefaultPos(bar);
    _esbX = pos.x; _esbY = pos.y;
  }
  bar.style.left = _esbX + 'px';
  bar.style.top  = _esbY + 'px';
  _esbSync();
}
function edShapeBarHide() {
  $('edShapeBar')?.classList.remove('visible');
}

function _esbSync() {
  const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
  if(!la || (la.type !== 'shape' && la.type !== 'line')) return;
  // Swatch color borde
  const colorBtn = $('esb-color');
  if(colorBtn) colorBtn.style.background = la.color || '#000000';
  // Estado relleno
  const hasFill = la.fillColor && la.fillColor !== 'none';
  // Botón toggle relleno: activo (iluminado) si tiene relleno
  const fillOnBtn = $('esb-fill-on');
  if(fillOnBtn) fillOnBtn.classList.toggle('active', !!hasFill);
  // Swatch color relleno
  const fillBtn = $('esb-fill');
  if(fillBtn){
    fillBtn.style.background = hasFill ? la.fillColor : (la._lastFillColor || '#ffffff');
    fillBtn.style.opacity = hasFill ? '1' : '0.4';
  }
  // Dot de grosor
  const dot = $('esb-size-dot');
  if(dot){
    const d = Math.max(3, Math.min(20, Math.round((la.lineWidth||0)*0.8)));
    dot.style.cssText = `width:${d}px;height:${d}px;border-radius:50%;background:#fff;display:inline-block;`;
  }
}

function edInitShapeBar() {
  const bar = $('edShapeBar'); if(!bar) return;

  // ── Drag + snap de orientación (idéntico a edInitDrawBar) ──
  let _drag=false, _sx=0, _sy=0, _sl=0, _st=0, _longTimer=null;
  let _locked=false, _pid=null;

  bar.addEventListener('pointerdown', e => {
    if(e.target !== bar && !e.target.classList.contains('edb-sep')) return;
    _pid=e.pointerId; bar.setPointerCapture(_pid);
    const shell=document.getElementById('editorShell');
    const sr=shell?shell.getBoundingClientRect():{left:0,top:0};
    _sx=e.clientX-sr.left; _sy=e.clientY-sr.top;
    _sl=parseInt(bar.style.left)||_esbX; _st=parseInt(bar.style.top)||_esbY;
    _longTimer=setTimeout(()=>{ _drag=true; _locked=true; bar.style.cursor='grabbing'; }, 300);
    e.preventDefault();
  }, {passive:false});

  bar.addEventListener('pointermove', e => {
    const shell=document.getElementById('editorShell');
    const sr=shell?shell.getBoundingClientRect():{left:0,top:0};
    const ex=e.clientX-sr.left, ey=e.clientY-sr.top;
    if(_longTimer && (Math.abs(ex-_sx)>6 || Math.abs(ey-_sy)>6)){ clearTimeout(_longTimer); _longTimer=null; }
    if(!_drag) return;
    e.preventDefault();
    const W=shell?shell.offsetWidth:window.innerWidth;
    const H=shell?shell.offsetHeight:window.innerHeight;
    const bw=bar.offsetWidth, bh=bar.offsetHeight;
    _esbX=Math.max(0,Math.min(W-bw,_sl+(ex-_sx)));
    _esbY=Math.max(0,Math.min(H-bh,_st+(ey-_sy)));
    bar.style.left=_esbX+'px'; bar.style.top=_esbY+'px';
    // Snap orientación — mismo umbral que edDrawBar
    const SNAP=48;
    const wasHoriz=bar.classList.contains('horiz');
    const distTB=Math.min(ey,H-ey), distLR=Math.min(ex,W-ex);
    if(distTB<SNAP||distLR<SNAP){
      const shouldHoriz=distTB<=distLR;
      if(shouldHoriz!==wasHoriz){
        bar.classList.toggle('horiz',shouldHoriz);
        const nBw=bar.offsetWidth, nBh=bar.offsetHeight;
        const adjX=(bw-nBw)/2, adjY=(bh-nBh)/2;
        _sl+=adjX; _st+=adjY;
        _esbX=Math.max(0,Math.min(W-nBw,_esbX+adjX));
        _esbY=Math.max(0,Math.min(H-nBh,_esbY+adjY));
        bar.style.left=_esbX+'px'; bar.style.top=_esbY+'px';
      }
    }
  }, {passive:false});

  const _endDrag=()=>{
    if(_longTimer){clearTimeout(_longTimer);_longTimer=null;}
    _drag=false; bar.style.cursor='grab';
    setTimeout(()=>{ _locked=false; }, 50);
  };
  bar.addEventListener('pointerup',     _endDrag);
  bar.addEventListener('pointercancel', _endDrag);

  // ── Botones ──
  // Color borde
  // Color borde: nativo en PC (con cuentagotas), HSL en Android
  $('esb-color')?.addEventListener('click', e => {
    if(_locked) return;
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(!la) return;
    if(e.pointerType==='touch'){
      const _savedSel=edSelectedIdx;
      const _savedCol=edDrawColor; edDrawColor=la.color||'#000000';
      _edShowColorPicker((hex, commit)=>{
        edSelectedIdx=_savedSel; edDrawColor=_savedCol;
        la.color=hex; _esbSync(); edRedraw();
        if(commit) _edShapePushHistory();
      });
    } else {
      const inp=document.createElement('input'); inp.type='color'; inp.value=la.color||'#000000';
      inp.style.cssText='position:fixed;opacity:0;width:0;height:0;'; document.body.appendChild(inp);
      inp.addEventListener('input', ev=>{ la.color=ev.target.value; _esbSync(); edRedraw(); });
      inp.addEventListener('change', ()=>{ _edShapePushHistory(); inp.remove(); });
      inp.click();
    }
  });

  // Cuentagotas
  $('esb-eyedrop')?.addEventListener('click', ()=>{ if(_locked) return; _edStartEyedrop(); });

  // Toggle relleno
  $('esb-fill-on')?.addEventListener('click', () => {
    if(_locked) return;
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(!la) return;
    if(la.fillColor && la.fillColor!=='none'){
      la._lastFillColor=la.fillColor;
      la.fillColor='none';
    } else {
      la.fillColor=la._lastFillColor||'#ffffff';
    }
    _esbSync(); _edShapePushHistory(); edRedraw();
  });

  // Color relleno: nativo en PC, HSL en Android; activa relleno automáticamente
  $('esb-fill')?.addEventListener('click', e => {
    if(_locked) return;
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(!la) return;
    const cur=(la.fillColor&&la.fillColor!=='none')?la.fillColor:'#ffffff';
    if(e.pointerType==='touch'){
      const _savedSel=edSelectedIdx;
      const _savedCol=edDrawColor; edDrawColor=cur;
      _edShowColorPicker((hex, commit)=>{
        edSelectedIdx=_savedSel; edDrawColor=_savedCol;
        la.fillColor=hex; la._lastFillColor=hex;
        _esbSync(); edRedraw();
        if(commit) _edShapePushHistory();
      });
    } else {
      const inp=document.createElement('input'); inp.type='color'; inp.value=cur;
      inp.style.cssText='position:fixed;opacity:0;width:0;height:0;'; document.body.appendChild(inp);
      inp.addEventListener('input', ev=>{
        la.fillColor=ev.target.value; la._lastFillColor=ev.target.value;
        _esbSync(); edRedraw();
      });
      inp.addEventListener('change', ()=>{ _edShapePushHistory(); inp.remove(); });
      inp.click();
    }
  });

  // Grosor — popup edb-size-pop reutilizado con modo esb
  $('esb-size')?.addEventListener('click', e => {
    e.stopPropagation();
    const pop=$('edb-size-pop'); if(!pop) return;
    pop._esbMode=true;
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    const sz=la?.lineWidth??3;
    const num=$('edb-size-num'); if(num){ num.min=0; num.max=20; num.value=sz; }
    const sl=$('edb-size-slider'); if(sl){ sl.min=0; sl.max=20; sl.value=sz; }
    const prev=$('edb-size-preview');
    if(prev){ const pd=Math.max(2,Math.min(20,Math.round(sz*0.8))); prev.style.width=pd+'px'; prev.style.height=pd+'px'; }
    pop.style.display='flex'; pop.style.left='-9999px'; pop.style.top='-9999px';
    const br=$('esb-size').getBoundingClientRect();
    const pw2=pop.offsetWidth||90, ph2=pop.offsetHeight||44, GAP=8;
    const W=window.innerWidth, H=window.innerHeight;
    let left, top;
    if(br.top-ph2-GAP>=0){ top=br.top-ph2-GAP; left=Math.max(GAP,Math.min(W-pw2-GAP,br.left+br.width/2-pw2/2)); }
    else{ top=br.bottom+GAP; left=Math.max(GAP,Math.min(W-pw2-GAP,br.left+br.width/2-pw2/2)); }
    pop.style.left=left+'px'; pop.style.top=top+'px';
  });

  // Opacidad — popup con slider idéntico al de grosor
  $('esb-opacity')?.addEventListener('click', e => {
    if(_locked) return; e.stopPropagation();
    // Reutilizar el popup edb-size-pop en modo opacidad
    const pop=$('edb-size-pop'); if(!pop) return;
    if(pop.style.display==='flex' && pop._esbOpMode){ pop.style.display='none'; pop._esbOpMode=false; return; }
    pop._esbMode=false; pop._esbOpMode=true;
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    const op=la?Math.round((la.opacity??1)*100):100;
    const num=$('edb-size-num'); if(num){ num.min=0; num.max=100; num.value=op; }
    const sl=$('edb-size-slider'); if(sl){ sl.min=0; sl.max=100; sl.value=op; }
    // Ocultar el preview dot y cambiar etiqueta a %
    const prev=$('edb-size-preview'); if(prev) prev.style.display='none';
    const lbl=pop.querySelector('span[style*="color:#ccc"]'); if(lbl) lbl.textContent='%';
    pop.style.display='flex'; pop.style.left='-9999px'; pop.style.top='-9999px';
    const br=$('esb-opacity').getBoundingClientRect();
    const pw2=pop.offsetWidth||90, ph2=pop.offsetHeight||44, GAP=8;
    const W=window.innerWidth, H=window.innerHeight;
    const top2=br.top-ph2-GAP>=0?br.top-ph2-GAP:br.bottom+GAP;
    const left2=Math.max(GAP,Math.min(W-pw2-GAP,br.left+br.width/2-pw2/2));
    pop.style.left=left2+'px'; pop.style.top=top2+'px';
  });

  // ── V⟺C curva de vértice ──
  $('esb-curve')?.addEventListener('click', e => {
    if(_locked) return; e.stopPropagation();
    const btn=$('esb-curve');
    const active=btn.dataset.curveActive==='1';
    btn.dataset.curveActive=active?'0':'1';
    btn.style.background=active?'':'rgba(0,0,0,.7)';
    btn.style.color=active?'rgba(255,255,255,1)':'#FFE135';
    btn.style.outline=active?'':'1px solid rgba(255,255,0,.5)';
    if(active){
      window._edCurveVertIdx=-1;
      document.getElementById('esb-curve-pop')?.remove();
      edRedraw(); return;
    }
    const _savedSelCurve=edSelectedIdx;
    let pop=document.getElementById('esb-curve-pop');
    if(pop){ pop.remove(); return; }
    pop=document.createElement('div');
    pop.id='esb-curve-pop';
    pop.style.cssText='position:fixed;background:rgba(30,30,30,.95);border-radius:10px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,.5);z-index:1200;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:160px;';
    const curR=window._edCurveRadius||0;
    pop.innerHTML=`<div style="display:flex;align-items:center;gap:6px;width:100%">
      <span style="color:#FFE135;font-size:.75rem;font-weight:700">Radio px</span>
      <input type="number" id="esb-curve-num" min="0" max="200" value="${curR}"
        style="width:52px;text-align:center;font-size:1rem;font-weight:700;border:1px solid rgba(255,255,255,.4);border-radius:8px;background:rgba(0,0,0,.4);color:#fff;padding:4px 6px;-moz-appearance:textfield;">
    </div>
    <input type="range" id="esb-curve-sl" min="0" max="200" value="${curR}" style="width:100%;accent-color:#FFE135;cursor:pointer">
    <span style="color:#ccc;font-size:.7rem">Toca un vértice para aplicar</span>`;
    document.body.appendChild(pop);
    const br=btn.getBoundingClientRect();
    const pw2=pop.offsetWidth||160,ph2=pop.offsetHeight||90,GAP=8;
    const top2=br.top-ph2-GAP>=0?br.top-ph2-GAP:br.bottom+GAP;
    const left2=Math.max(GAP,Math.min(window.innerWidth-pw2-GAP,br.left+br.width/2-pw2/2));
    pop.style.left=left2+'px';pop.style.top=top2+'px';
    const sl2=document.getElementById('esb-curve-sl');
    const nm2=document.getElementById('esb-curve-num');
    sl2.addEventListener('input',()=>{ nm2.value=sl2.value; window._edCurveRadius=+sl2.value;
      // Actualizar en tiempo real el vértice activo
      const la2=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
      const vi=window._edCurveVertIdx;
      if(la2&&vi>=0){
        if(la2.type==='line'){ if(!la2.cornerRadii)la2.cornerRadii={}; la2.cornerRadii[vi]=+sl2.value; }
        else if(la2.type==='shape'&&la2.shape==='rect'){ if(!la2.cornerRadii)la2.cornerRadii=[0,0,0,0]; la2.cornerRadii[vi]=+sl2.value; }
        edRedraw();
      }
    });
    nm2.addEventListener('change',()=>{ const v=Math.max(0,Math.min(200,+nm2.value)); nm2.value=v; sl2.value=v; window._edCurveRadius=v;
      const la2=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
      const vi=window._edCurveVertIdx;
      if(la2&&vi>=0){
        if(la2.type==='line'){ if(!la2.cornerRadii)la2.cornerRadii={}; la2.cornerRadii[vi]=v; }
        else if(la2.type==='shape'&&la2.shape==='rect'){ if(!la2.cornerRadii)la2.cornerRadii=[0,0,0,0]; la2.cornerRadii[vi]=v; }
        _edShapePushHistory(); edRedraw();
      }
    });
    // El popup permanece abierto hasta que se desactive V⟺C pulsando el botón de nuevo
  });

  // Deshacer/Rehacer
  $('esb-undo')?.addEventListener('click', ()=>{ if(_locked) return; edShapeUndo(); });
  $('esb-redo')?.addEventListener('click', ()=>{ if(_locked) return; edShapeRedo(); });

  // OK
  $('esb-ok')?.addEventListener('click', ()=>{
    if(_locked) return;
    _edShapeClearHistory();
    edShapeBarHide();
    window._edMinimizedDrawMode=null;
    edMaximize();
  });
}
function _edDrawLockUI()   { $('editorShell')?.classList.add('draw-active'); }
function _edDrawUnlockUI() { $('editorShell')?.classList.remove('draw-active'); }

// Overlay transparente sobre el canvas para bloquear clicks cuando panel props abierto
// No usa pointer-events en la barra — así los clicks en barra no llegan al canvas
function _edPropsOverlayShow(){
  let ov=document.getElementById('_edPropsOverlay');
  if(!ov){
    ov=document.createElement('div');
    ov.id='_edPropsOverlay';
    // Overlay encima de la barra de menús — absorbe clicks sin hacer nada
    ov.style.cssText='position:absolute;inset:0;z-index:500;background:transparent;cursor:default;';
    $('edMenuBar')?.appendChild(ov);
  }
  ov.style.display='block';
}
function _edPropsOverlayHide(){
  const ov=document.getElementById('_edPropsOverlay');
  if(ov) ov.style.display='none';
}

function edDrawBarUpdate() {
  if (!$('edDrawBar')?.classList.contains('visible')) return;
  _edbSyncTool();
}



function _edBubbleTailDir(l){
  // Determinar la dirección de la cola del bocadillo para el reader.
  // tailEnd es la punta de la cola en coordenadas relativas al centro del bocadillo.
  // Devuelve: 'bottom', 'bottom-left', 'bottom-right', 'top', 'top-left', 'top-right', 'left', 'right'
  const e = (l.tailEnds && l.tailEnds[0]) || l.tailEnd || {x:0, y:0.6};
  const ex = e.x, ey = e.y;  // fracción relativa al bbox del bocadillo
  // ey > 0.3 → cola hacia abajo; ey < -0.3 → cola hacia arriba
  // ex > 0.3 → cola hacia derecha; ex < -0.3 → cola hacia izquierda
  if(Math.abs(ey) >= Math.abs(ex)){
    if(ey > 0){
      if(ex < -0.15) return 'bottom-left';
      if(ex >  0.15) return 'bottom-right';
      return 'bottom';
    } else {
      if(ex < -0.15) return 'top-left';
      if(ex >  0.15) return 'top-right';
      return 'top';
    }
  } else {
    return ex > 0 ? 'right' : 'left';
  }
}
async function edCloudSave() {
  if (!edProjectId) { edToast('Sin proyecto activo'); return; }
  if (typeof SupabaseClient === 'undefined') { edToast('Sin conexión al servidor'); return; }
  if (!Auth?.currentUser?.()) { edToast('Inicia sesión para guardar en la nube'); return; }

  // Guardar localmente primero
  edSaveProject();

  const comic = ComicStore.getById(edProjectId);
  if (!comic) { edToast('Error: obra no encontrada'); return; }

  // Asignar supabaseId si aún no tiene
  if (!comic.supabaseId) {
    comic.supabaseId = crypto.randomUUID();
    ComicStore.save(comic);
  }

  const btn = $('edCloudSaveBtn');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  try {
    const { sizeKB } = await SupabaseClient.saveDraft(comic);
    edToast(`☁️ Guardado en nube (${sizeKB < 1024 ? sizeKB + ' KB' : Math.round(sizeKB/1024) + ' MB'})`);
  } catch(err) {
    edToast('⚠️ ' + (err.message || 'Error al guardar en nube'));
    console.error('edCloudSave:', err);
  } finally {
    if (btn) { btn.textContent = '☁️'; btn.disabled = false; }
  }
}

function edSaveProject(){
  if(!edProjectId){edToast('Sin proyecto activo');return;}
  const existing=ComicStore.getById(edProjectId)||{};
  const panels=edPages.map((p,i)=>{
    // Exportar capas de texto/bocadillo para el reader.
    // El orden del array layers[] es el orden secuencial de aparición.
    // Tanto BubbleLayer como TextLayer aparecen uno a uno al tocar.
    const texts = [];
    let seqOrder = 0;
    p.layers.forEach(l => {
      const rawText = (l.type === 'text' || l.type === 'bubble') ? l.text : null;
      if(!rawText || rawText === 'Escribe aquí') return;

      const xPct = Math.round((l.x - l.width/2)  * 100 * 10) / 10;
      const yPct = Math.round((l.y - l.height/2) * 100 * 10) / 10;
      const wPct = Math.round(l.width  * 100 * 10) / 10;
      const hPct = Math.round(l.height * 100 * 10) / 10;

      if(l.type === 'bubble'){
        texts.push({
          type:        'bubble',
          text:        rawText,
          x: xPct, y: yPct, w: wPct, h: hPct,
          style:       l.style      || 'conventional',
          order:       seqOrder++,
          fontSize:    l.fontSize   || 30,
          fontFamily:  l.fontFamily || 'Patrick Hand',
          fontBold:    l.fontBold   || false,
          fontItalic:  l.fontItalic || false,
          color:       l.color      || '#000000',
          bg:          l.backgroundColor || '#ffffff',
          border:      l.borderWidth ?? 2,
          borderColor: l.borderColor || '#000000',
          rotation:    l.rotation   || 0,
          padding:     l.padding    || 15,
          hasTail:     true,
          voiceCount:  l.voiceCount || 1,
          tailStarts:  l.tailStarts || [l.tailStart || {x:-0.4, y:0.4}],
          tailEnds:    l.tailEnds   || [l.tailEnd   || {x:-0.4, y:0.6}],
        });
      } else if(l.type === 'text'){
        texts.push({
          type:        'text',
          text:        rawText,
          x: xPct, y: yPct, w: wPct, h: hPct,
          order:       seqOrder++,
          fontSize:    l.fontSize   || 30,
          fontFamily:  l.fontFamily || 'Patrick Hand',
          fontBold:    l.fontBold   || false,
          fontItalic:  l.fontItalic || false,
          color:       l.color      || '#000000',
          bg:          l.backgroundColor || '#ffffff',
          border:      l.borderWidth ?? 0,
          borderColor: l.borderColor || '#000000',
          rotation:    l.rotation   || 0,
          padding:     l.padding    || 10,
          hasTail:     false,
        });
      }
    });
    return {
      id:'panel_'+i,
      dataUrl:edRenderPage(p),
      orientation:(p.orientation||edOrientation)==='vertical' ? 'v' : 'h',
      textMode: p.textMode || 'sequential',
      texts,
    };
  });
  ComicStore.save({
    ...existing,
    id:edProjectId,
    ...edProjectMeta,
    panels,
    editorData:{
      orientation:edOrientation,
      pages:edPages.map(p=>({layers:p.layers.map(edSerLayer).filter(Boolean),textLayerOpacity:p.textLayerOpacity??1,textMode:p.textMode||'sequential',orientation:p.orientation||edOrientation})),
    },
    updatedAt:new Date().toISOString(),
  });
  edToast('Guardado ✓');
  // Marcar punto de guardado y limpiar historial (los estados anteriores ya no son relevantes)
  _edSavedHistoryIdx = edHistoryIdx;
  edHistory = edHistory.length > 0 ? [edHistory[edHistoryIdx]] : [];
  edHistoryIdx = edHistory.length - 1;
  _edSavedHistoryIdx = edHistoryIdx;
}
function edRenderPage(page){
  const _savedOrient = edOrientation;
  const _savedPage   = edCurrentPage;
  const _pageIdx     = edPages.indexOf(page);
  if(_pageIdx >= 0){ edCurrentPage = _pageIdx; }
  if(page.orientation) edOrientation = page.orientation;
  const pw=edPageW(), ph=edPageH();
  const tmp=document.createElement('canvas');tmp.width=pw;tmp.height=ph;
  const full=document.createElement('canvas');full.width=ED_CANVAS_W;full.height=ED_CANVAS_H;
  const ctx=full.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(edMarginX(),edMarginY(),pw,ph);
  // Imágenes, DrawLayer y Strokes — SIN textos/bocadillos.
  // Los textos se superponen en el reader por encima del data_url, igual que el visor del editor.
  page.layers.filter(l=>l.type==='image').forEach(l=>l.draw(ctx,full));
  const _rdl=page.layers.find(l=>l.type==='draw');
  if(_rdl) _rdl.draw(ctx);
  page.layers.filter(l=>l.type==='stroke').forEach(l=>l.draw(ctx));
  page.layers.filter(l=>l.type==='shape'||l.type==='line').forEach(l=>l.draw(ctx));
  // Recortar zona de la página del canvas de trabajo
  const outCtx=tmp.getContext('2d');
  outCtx.drawImage(full, edMarginX(), edMarginY(), pw, ph, 0, 0, pw, ph);
  edOrientation = _savedOrient;
  edCurrentPage = _savedPage;
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
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,fontBold:l.fontBold||false,fontItalic:l.fontItalic||false,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,
    padding:l.padding||10,...op};
  if(l.type==='bubble')return{type:'bubble',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,fontBold:l.fontBold||false,fontItalic:l.fontItalic||false,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,
    tail:l.tail,style:l.style,tailStart:{...l.tailStart},tailEnd:{...l.tailEnd},voiceCount:l.voiceCount||1,
    tailStarts:l.tailStarts?l.tailStarts.map(s=>({...s})):undefined,tailEnds:l.tailEnds?l.tailEnds.map(e=>({...e})):undefined,
    padding:l.padding||15,...op};
  if(l.type==='draw')   return{type:'draw',   dataUrl: l.toDataUrl()};
  if(l.type==='stroke') return{type:'stroke', dataUrl: l.toDataUrl(),
    x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0, opacity:l.opacity};
  if(l.type==='shape')  return{type:'shape', shape:l.shape, x:l.x, y:l.y,
    width:l.width, height:l.height, rotation:l.rotation||0,
    color:l.color, fillColor:l.fillColor||'none', lineWidth:l.lineWidth, opacity:l.opacity??1};
  if(l.type==='line')   return{type:'line', points:l.points.slice(),
    x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0,
    closed:l.closed, color:l.color, fillColor:l.fillColor||'#ffffff', lineWidth:l.lineWidth, opacity:l.opacity??1};
}
function edDeserLayer(d, pageOrientation){
  if(d.type==='draw'){
    const _isV = (pageOrientation||'vertical')==='vertical';
    const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
    const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
    return d.dataUrl ? DrawLayer.fromDataUrl(d.dataUrl, _pw, _ph) : new DrawLayer();
  }
  if(d.type==='stroke'){
    const _isV = (pageOrientation||'vertical')==='vertical';
    const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
    const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
    const sl = StrokeLayer.fromDataUrl(d.dataUrl||'', d.x||0.5, d.y||0.5, d.width||0.1, d.height||0.1, _pw, _ph);
    if(d.rotation) sl.rotation = d.rotation;
    if(d.opacity !== undefined) sl.opacity = d.opacity;
    return sl;
  }
  if(d.type==='shape'){
    const l=new ShapeLayer(d.shape||'rect',d.x||0.5,d.y||0.5,d.width||0.3,d.height||0.2);
    l.color=d.color||'#000'; l.fillColor=d.fillColor||'none'; l.lineWidth=d.lineWidth||3; l.rotation=d.rotation||0; l.opacity=d.opacity??1;
    return l;
  }
  if(d.type==='line'){
    const l=new LineLayer();
    l.points=d.points||[]; l.closed=d.closed||false;
    l.color=d.color||'#000'; l.fillColor=d.fillColor||'#ffffff'; l.lineWidth=d.lineWidth||3; l.opacity=d.opacity??1;
    l.rotation=d.rotation||0;
    if(d.x!=null){l.x=d.x;l.y=d.y;l.width=d.width||0.01;l.height=d.height||0.01;}
    else l._updateBbox();
    return l;
  }
  if(d.type==='text'){const l=new TextLayer(d.text,d.x,d.y);Object.assign(l,d);return l;}
  if(d.type==='bubble'){const l=new BubbleLayer(d.text,d.x,d.y);Object.assign(l,d);
    if(d.tailStart)l.tailStart={...d.tailStart};if(d.tailEnd)l.tailEnd={...d.tailEnd};
    if(d.tailStarts)l.tailStarts=d.tailStarts.map(s=>({...s}));
    if(d.tailEnds)  l.tailEnds  =d.tailEnds.map(e=>({...e}));
    if(d.multipleCount&&!d.voiceCount)l.voiceCount=d.multipleCount;
    return l;}
  if(d.type==='image'){
    const l=new ImageLayer(null,d.x,d.y,d.width);
    l.rotation=d.rotation||0; l.src=d.src||'';
    if(d.opacity!==undefined) l.opacity=d.opacity;
    // BUG-E07: asignar height guardado ANTES del onload para que el primer
    // render muestre el tamaño correcto aunque la imagen tarde en cargar
    if(d.height) l.height = d.height;
    if(d.src){
      const img=new Image();
      img.onload=()=>{
        l.img=img; l.src=img.src;
        const _isV = (pageOrientation||'vertical') === 'vertical';
        const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
        const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
        const _natH = l.width * (img.naturalHeight / img.naturalWidth) * (_pw / _ph);
        // Respetar height guardado si es razonable (el usuario pudo haberlo ajustado).
        // Solo recalcular si no hay height guardado o si viene de un formato antiguo
        // (diferencia >50% respecto al natural → dato corrupto → recalcular).
        if(!d.height || Math.abs(l.height / _natH - 1) > 0.5){
          l.height = _natH;
        }
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
  // Resetear marcador de guardado — al cargar, el estado es "guardado"
  edHistory=[]; edHistoryIdx=-1; _edSavedHistoryIdx=-1;
  edProjectMeta={title:comic.title||'',author:comic.author||comic.username||'',genre:comic.genre||'',navMode:comic.navMode||'horizontal',social:comic.social||''};
  const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title||'Sin título';
  if(comic.editorData){
    edOrientation=comic.editorData.orientation||'vertical';
    edPages=(comic.editorData.pages||[]).map(pd=>{
      const orient = pd.orientation||comic.editorData.orientation||'vertical';
      const layers = (pd.layers||[]).map(d=>edDeserLayer(d, orient)).filter(Boolean);
      // Migrar drawData legado (versiones <5.20) a DrawLayer si no hay DrawLayer ya
      if(pd.drawData && !layers.find(l=>l.type==='draw')){
        const _isV = orient==='vertical';
        layers.unshift(DrawLayer.fromDataUrl(pd.drawData, _isV?ED_PAGE_W:ED_PAGE_H, _isV?ED_PAGE_H:ED_PAGE_W)); // legacy
      }
      return {
        drawData: null,  // ya no se usa, migrado a DrawLayer
        layers,
        textLayerOpacity: pd.textLayerOpacity??1,
        textMode: pd.textMode||'sequential',
        orientation: orient,
      };
    });
  }else{
    edOrientation='vertical';edPages=[{layers:[],drawData:null,textLayerOpacity:1,textMode:'sequential',orientation:'vertical'}];
  }
  if(!edPages.length)edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'sequential'});
  edCurrentPage=0;edLayers=edPages[0].layers;
  // Centrar cámara al cargar proyecto
  // Doble rAF + timeout: esperar que el DOM tenga alturas correctas
  if(edCanvas){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      window._edUserRequestedReset=true; edFitCanvas(true);
      // Segundo intento por si el layout tardó más (ej: fuentes, imágenes)
      setTimeout(()=>{ window._edUserRequestedReset=true; edFitCanvas(true); }, 120);
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
  { const _fp=edPages[0]; const _ftl=_fp?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
    edViewerTextStep=(_fp?.textMode==='sequential'&&_ftl.length>0)?1:0; }
  // Garantizar que TODAS las hojas tienen orientation antes de abrir
  edPages.forEach(p=>{ if(!p.orientation) p.orientation=edOrientation; });
  $('editorViewer')?.classList.add('open');
  edUpdateViewer();
  edInitViewerTap();
  // Orientación: resize recalcula canvas al girar dispositivo
  if(_viewerResizeFn) window.removeEventListener('resize', _viewerResizeFn);
  let _viewerResizeTimer;
  _viewerResizeFn = () => {
    clearTimeout(_viewerResizeTimer);
    _viewerResizeTimer = setTimeout(() => { edUpdateViewer(); }, 150);
  };
  window.addEventListener('resize', _viewerResizeFn);
  // Fullscreen: reentrar si el navegador lo cierra al girar
  if(_viewerFsFn){
    document.removeEventListener('fullscreenchange', _viewerFsFn);
    document.removeEventListener('webkitfullscreenchange', _viewerFsFn);
  }
  _viewerFsFn = () => {
    if(!$('editorViewer')?.classList.contains('open')) return;
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if(!active && typeof Fullscreen !== 'undefined') Fullscreen.enter();
  };
  document.addEventListener('fullscreenchange', _viewerFsFn);
  document.addEventListener('webkitfullscreenchange', _viewerFsFn);
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
    e.preventDefault(); _viewerAdvance();
  } else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
    e.preventDefault(); _viewerBack();
  } else if(e.key === 'Escape'){
    e.preventDefault();
    edCloseViewer();
  }
}

// Tap en el visor → mostrar/ocultar controles
let _viewerTapBound = false, _viewerHideTimer;
let _vPrevBubbleFade = 0;  // opacidad del bocadillo anterior en fade
let _vFadeRaf = null;       // requestAnimationFrame del fade
let _viewerResizeFn = null; // listener resize para orientación
let _viewerFsFn = null;     // listener fullscreenchange para orientación
function edShowViewerCtrls(){
  const ctrls = $('viewerControls');
  if(!ctrls) return;
  ctrls.classList.remove('hidden');
  clearTimeout(_viewerHideTimer);
  _viewerHideTimer = setTimeout(()=>ctrls.classList.add('hidden'), 3500);
}
function _vStartBubbleFade(){
  // Solo hacer fade si el bocadillo que va a quedar atrás es tipo 'bubble'
  // (las cajas de texto permanecen visibles, no se desvanecen)
  const page = edPages[edViewerIdx];
  const tl = page?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
  // El bocadillo "anterior" será el que está en textStep (el actual antes del incremento)
  const curLayer = tl[edViewerTextStep - 1];
  if(!curLayer || curLayer.type !== 'bubble'){
    _vPrevBubbleFade = 0; return;  // no es bubble, no fade
  }
  if(_vFadeRaf){ cancelAnimationFrame(_vFadeRaf); _vFadeRaf=null; }
  _vPrevBubbleFade = 1.0;
  const duration = 400;
  const start = performance.now();
  function step(now){
    const t = Math.min(1, (now - start) / duration);
    _vPrevBubbleFade = 1 - t;
    edUpdateViewer();
    if(t < 1) _vFadeRaf = requestAnimationFrame(step);
    else { _vFadeRaf=null; _vPrevBubbleFade=0; edUpdateViewer(); }
  }
  _vFadeRaf = requestAnimationFrame(step);
}

// AbortController del visor: elimina TODOS los listeners de una vez al cerrar
let _viewerAC = null;

// ── Navegación del visor: funciones únicas usadas por swipe, botones y teclado ──
function _viewerAdvance(){
  if(_vFadeRaf){ cancelAnimationFrame(_vFadeRaf); _vFadeRaf=null; _vPrevBubbleFade=0; }
  const page = edPages[edViewerIdx];
  const tl = (page?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
  const isSeq = page?.textMode === 'sequential';
  if(isSeq && edViewerTextStep < tl.length){
    _vStartBubbleFade();
    edViewerTextStep++;
    edUpdateViewer();
  } else if(edViewerIdx < edPages.length - 1){
    edViewerIdx++;
    const np = edPages[edViewerIdx];
    const ntl = (np?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
    edViewerTextStep = (np?.textMode==='sequential' && ntl.length > 0) ? 1 : 0;
    edUpdateViewer();
  }
}
function _viewerBack(){
  if(_vFadeRaf){ cancelAnimationFrame(_vFadeRaf); _vFadeRaf=null; _vPrevBubbleFade=0; }
  const page = edPages[edViewerIdx];
  const isSeq = page?.textMode === 'sequential';
  if(isSeq && edViewerTextStep > 1){
    edViewerTextStep--;
    edUpdateViewer();
  } else if(edViewerIdx > 0){
    edViewerIdx--;
    const pp = edPages[edViewerIdx];
    const ptl = (pp?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
    edViewerTextStep = pp?.textMode==='sequential' ? ptl.length : 0;
    edUpdateViewer();
  }
}

function edInitViewerTap(){
  const viewer = $('editorViewer');
  if(!viewer) return;

  edShowViewerCtrls();

  if(_viewerTapBound) return;
  _viewerTapBound = true;

  // AbortController nuevo en cada apertura: al cerrar, abort() elimina TODOS los listeners
  // Esto evita la acumulación de handlers en aperturas sucesivas (causa del bug de navegación)
  _viewerAC = new AbortController();
  const sig = { signal: _viewerAC.signal };

  // ── SWIPE TÁCTIL ──
  let _sx = null, _sy = null, _scrollCancelled = false;

  viewer.addEventListener('touchstart', e => {
    _sx = null; _sy = null; _scrollCancelled = false;
    if(e.touches.length !== 1) return;
    _sx = e.touches[0].clientX;
    _sy = e.touches[0].clientY;
  }, {passive:true, ...sig});

  viewer.addEventListener('touchmove', e => {
    if(_sx === null) return;
    const dy = e.touches[0].clientY - _sy;
    if(Math.abs(dy) > 20) _scrollCancelled = true;
  }, {passive:true, ...sig});

  viewer.addEventListener('touchend', e => {
    if(_sx === null || _scrollCancelled){ _sx = null; return; }
    if(e.changedTouches.length !== 1){ _sx = null; return; }
    // Ignorar si el toque termina sobre un botón de control
    if(e.target.closest('button, a, input')) { _sx = null; return; }
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - _sx, dy = endY - _sy;
    _sx = null;
    if(Math.abs(dy) > 40) return;
    if (_isBackSide(endX, endY)) _viewerBack(); else _viewerAdvance();
  }, {passive:true, ...sig});

  // ── CONTROLES DESKTOP (mouse) ──
  viewer.addEventListener('pointerdown', e => {
    if(e.pointerType === 'mouse') edShowViewerCtrls();
  }, {capture:true, passive:true, ...sig});
  viewer.addEventListener('mousemove', () => edShowViewerCtrls(), {passive:true, ...sig});
}
function edCloseViewer(){
  if(_vFadeRaf){ cancelAnimationFrame(_vFadeRaf); _vFadeRaf=null; }
  _vPrevBubbleFade=0;
  $('editorViewer')?.classList.remove('open');
  clearTimeout(_viewerHideTimer);
  // Eliminar TODOS los listeners del visor (touch + mouse) de una sola vez
  if(_viewerAC){ _viewerAC.abort(); _viewerAC=null; }
  _viewerTapBound = false; // permitir re-bind en próxima apertura
  if(_viewerKeyHandler){
    document.removeEventListener('keydown', _viewerKeyHandler);
    _viewerKeyHandler = null;
  }
  // Limpiar listeners de orientación
  if(_viewerResizeFn){
    window.removeEventListener('resize', _viewerResizeFn);
    _viewerResizeFn = null;
  }
  if(_viewerFsFn){
    document.removeEventListener('fullscreenchange', _viewerFsFn);
    document.removeEventListener('webkitfullscreenchange', _viewerFsFn);
    _viewerFsFn = null;
  }
}
function edUpdateViewer(){
  if(!$('editorViewer')?.classList.contains('open')) return;
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
  // Mismo orden que el editor: seguir el array, textos al final
  page.layers.forEach(l=>{
    if(l.type==='text'||l.type==='bubble') return;
    if(l.type==='image')       l.draw(fctx, full);
    else if(l.type==='draw')   l.draw(fctx);
    else if(l.type==='stroke') l.draw(fctx);
    else if(l.type==='shape' || l.type==='line') l.draw(fctx);
  });
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
        cnt.textContent=`${edViewerIdx+1}/${edPages.length} · 💬${edViewerTextStep-1}/${textLayers.length}`;
      } else {
        cnt.textContent=`${edViewerIdx+1} / ${edPages.length}`;
      }
    }
  };
  _finishViewer();
}

function _edViewerDrawTextsOnCtx(page, ctx, can){
  const textLayers = page.layers.filter(l=>l.type==='text'||l.type==='bubble');
  const isSeq = page.textMode === 'sequential';
  if(!isSeq){ textLayers.forEach(l=>l.draw(ctx, can)); return; }

  // Modo secuencial:
  // - Cajas de texto (type='text'): visibles al 100% cuando reveladas, permanecen
  // - Bocadillos (type='bubble'): el actual al 100%, el anterior con fade-out 1→0
  const toShow = textLayers.slice(0, edViewerTextStep);
  toShow.forEach((l, vi) => {
    if(l.type === 'text'){
      l.draw(ctx, can);  // cajas siempre al 100%
    } else {
      // Bocadillo: solo el actual y el penúltimo (en fade)
      const isCurrent  = vi === toShow.length - 1;
      const isPrevious = vi === toShow.length - 2;
      if(isCurrent){
        l.draw(ctx, can);
      } else if(isPrevious && _vPrevBubbleFade > 0){
        ctx.save();
        ctx.globalAlpha = _vPrevBubbleFade;
        l.draw(ctx, can);
        ctx.restore();
      }
      // Bocadillos más antiguos: ya desaparecieron
    }
  });
}

/* ══════════════════════════════════════════
   MODAL DATOS PROYECTO
   ══════════════════════════════════════════ */
function edOpenProjectModal(){
  $('edMTitle').value=edProjectMeta.title;
  $('edMAuthor').value=edProjectMeta.author;
  $('edMGenre').value=edProjectMeta.genre;
  $('edMNavMode').value=edProjectMeta.navMode;
  const edMSocial=$('edMSocial'); if(edMSocial) edMSocial.value=edProjectMeta.social||'';
  $('edProjectModal')?.classList.add('open');
}
function edCloseProjectModal(){$('edProjectModal')?.classList.remove('open');}

/* ── Destruir vista: eliminar todos los listeners de document/window ── */
// Detecta si el toque está en el lado "retroceder" según orientación física del dispositivo.
// El navegador ya transforma las coordenadas táctiles al sistema del usuario.
// "Izquierda del usuario" es siempre endX < W/2, independientemente del ángulo del dispositivo.
function _isBackSide(endX, endY) {
  return endX < window.innerWidth / 2;
}


function _edStartEyedrop() {
  const canvas = edCanvas;
  if (!canvas) return;

  // Indicador visual: cambiar cursor y mostrar toast
  canvas.style.cursor = 'crosshair';
  edToast('Toca el color a copiar…');

  // Usar AbortController para limpiar tras el primer sample
  const ac = new AbortController();
  const sig = { signal: ac.signal };

  function sampleAt(clientX, clientY) {
    ac.abort(); // un solo disparo
    canvas.style.cursor = '';

    // Convertir coordenadas de pantalla a coordenadas del canvas lógico
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = Math.round((clientX - rect.left) * scaleX);
    const cy = Math.round((clientY - rect.top)  * scaleY);

    // Leer pixel del canvas de trabajo
    const ctx = canvas.getContext('2d');
    const px  = ctx.getImageData(cx, cy, 1, 1).data;
    // Si el pixel es transparente, ignorar
    if (px[3] < 10) { edToast('Sin color en ese punto'); return; }

    const hex = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    edDrawColor = hex;
    if(edSelectedPaletteIdx > 1) edColorPalette[edSelectedPaletteIdx] = hex;
    _edUpdatePaletteDots();
    _edbSyncColor();
    edToast('Color copiado ✓');
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    sampleAt(e.clientX, e.clientY);
  }, { ...sig, once: true });

  // Cancelar con Escape o tocando fuera del canvas
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { ac.abort(); canvas.style.cursor = ''; edToast('Cuentagotas cancelado'); }
  }, { ...sig, once: true });
}

/* ── CÁMARA IN-APP (getUserMedia) ── */
let _edCameraStream = null;
let _edCameraFacing = 'environment'; // 'environment' = trasera, 'user' = frontal

function edOpenCamera() {
  const overlay = $('edCameraOverlay');
  const video   = $('edCameraVideo');
  if (!overlay || !video) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    edToast('Cámara no disponible en este dispositivo');
    return;
  }

  function startStream(facing) {
    if (_edCameraStream) {
      _edCameraStream.getTracks().forEach(t => t.stop());
      _edCameraStream = null;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    }).then(stream => {
      _edCameraStream = stream;
      video.srcObject = stream;
      overlay.classList.remove('hidden');
    }).catch(() => {
      edToast('No se pudo acceder a la cámara');
    });
  }

  startStream(_edCameraFacing);

  // Capturar foto
  const capBtn = $('edCameraCapture');
  const closeBtn = $('edCameraClose');
  const flipBtn = $('edCameraFlip');

  // Usar AbortController para limpiar listeners al cerrar
  const ac = new AbortController();
  const sig = { signal: ac.signal };

  function closeCamera() {
    if (_edCameraStream) {
      _edCameraStream.getTracks().forEach(t => t.stop());
      _edCameraStream = null;
    }
    video.srcObject = null;
    overlay.classList.add('hidden');
    ac.abort();
  }

  capBtn?.addEventListener('click', () => {
    if (!_edCameraStream) return;
    const canvas = document.createElement('canvas');
    const track  = _edCameraStream.getVideoTracks()[0];
    const settings = track.getSettings();
    canvas.width  = settings.width  || video.videoWidth;
    canvas.height = settings.height || video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
        closeCamera();
        edAddImage(file);
      }
    }, 'image/jpeg', 0.92);
  }, sig);

  closeBtn?.addEventListener('click', closeCamera, sig);

  flipBtn?.addEventListener('click', () => {
    _edCameraFacing = _edCameraFacing === 'environment' ? 'user' : 'environment';
    startStream(_edCameraFacing);
  }, sig);
}

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
  if(window._edResizeFn){
    window.removeEventListener('resize', window._edResizeFn);
    window._edResizeFn = null;
  }
  if(window._edOrientFn){
    window.removeEventListener('orientationchange', window._edOrientFn);
    window._edOrientFn = null;
  }
  if(window._edQuotaFn){
    window.removeEventListener('cx:storage:quota', window._edQuotaFn);
    window._edQuotaFn = null;
  }
  // Limpiar timers
  clearTimeout(window._edLongPress);
  // Parar cámara si estaba abierta
  if (_edCameraStream) {
    _edCameraStream.getTracks().forEach(t => t.stop());
    _edCameraStream = null;
  }
  edHideGearIcon();
}
function edSaveProjectModal(){
  edProjectMeta.title  =$('edMTitle').value.trim()||edProjectMeta.title;
  edProjectMeta.author =$('edMAuthor').value.trim();
  edProjectMeta.genre  =$('edMGenre').value.trim();
  edProjectMeta.navMode=$('edMNavMode').value;
  edProjectMeta.social =($('edMSocial')?.value||'').trim().slice(0,300);
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
  edDrawCanvas=$('edDrawCanvas');
  // Habilitar botón Capas
  document.querySelector('[data-menu="layers"]')?.removeAttribute('disabled');
  document.querySelector('[data-menu="layers"]')?.style.removeProperty('opacity');
  document.querySelector('[data-menu="layers"]')?.style.removeProperty('cursor');
  edViewerCanvas=$('viewerCanvas');
  if(!edCanvas)return;
  edCtx=edCanvas.getContext('2d');
  if(edDrawCanvas) edDrawCtx=edDrawCanvas.getContext('2d');
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
  // Bloquear menú contextual dentro del editor — impide "Guardar imagen como..."
  // que disparan los botones laterales del lápiz/stylus en PC (estándar en Krita, Figma, etc.)
  if(_shell) _shell.addEventListener('contextmenu', e => { e.preventDefault(); }, { passive: false });
  window._edListeners = [
    [document, 'pointerdown',  edOnStart, {passive:false}],
    [document, 'pointermove',  edOnMove,  {passive:false}],
    [document, 'pointerup',    edOnEnd,   {}],
    [document, 'pointercancel',edOnEnd,   {}],
  ];
  window._edListeners.forEach(([el, evt, fn, opts]) => el.addEventListener(evt, fn, opts));

  // ── TOPBAR ──
  $('edBackBtn')?.addEventListener('click', () => {
    const hasUnsaved = edHistoryIdx !== _edSavedHistoryIdx;
    if (!hasUnsaved) { Router.go('my-comics'); return; }

    // Hay cambios sin guardar — preguntar
    const isNew = !ComicStore.getById(edProjectId)?.updatedAt ||
                  ComicStore.getById(edProjectId)?.updatedAt === ComicStore.getById(edProjectId)?.createdAt;

    const dlg = document.createElement('div');
    dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
    dlg.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:320px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)">
        <div style="font-size:1.5rem;margin-bottom:12px">💾</div>
        <p style="font-weight:700;font-size:1rem;margin-bottom:8px">¿Guardar cambios?</p>
        <p style="font-size:.88rem;color:#666;margin-bottom:24px">Tienes cambios sin guardar en esta obra.</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button id="_edExitNo"  style="flex:1;padding:10px;border:1.5px solid #ddd;border-radius:10px;background:#fff;font-weight:700;cursor:pointer;font-size:.9rem">No guardar</button>
          <button id="_edExitYes" style="flex:1;padding:10px;border:none;border-radius:10px;background:#f5c400;font-weight:700;cursor:pointer;font-size:.9rem">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    // Click fuera del cuadro → cerrar y volver al editor
    dlg.addEventListener('click', e => { if(e.target===dlg){ dlg.remove(); } });

    document.getElementById('_edExitYes').onclick = () => {
      dlg.remove();
      edSaveProject();
      Router.go('my-comics');
    };
    document.getElementById('_edExitNo').onclick = () => {
      dlg.remove();
      // Si era obra nueva sin guardado previo, eliminarla
      if (isNew && edProjectId) {
        ComicStore.remove(edProjectId);
      } else {
        // Restaurar último estado guardado
        const saved = ComicStore.getById(edProjectId);
        if (saved) edLoadProject(edProjectId);
      }
      Router.go('my-comics');
    };
  });
  $('edPagePrev')?.addEventListener('click',()=>{ if(edCurrentPage>0) edLoadPage(edCurrentPage-1); });
  $('edPageNext')?.addEventListener('click',()=>{ if(edCurrentPage<edPages.length-1) edLoadPage(edCurrentPage+1); });
  function _edToggleMultiSel(){
    if(edActiveTool==='multiselect'){
      _edDeactivateMultiSel();
    } else {
      _msClear();
      edSelectedIdx=-1;
      edActiveTool='multiselect';
      edCanvas.className='tool-multiselect';
      $('edMultiSelBtn')?.classList.add('active');
      const panel=$('edOptionsPanel');
      if(panel){panel.classList.remove('open');panel.innerHTML='';}
      edRedraw();
    }
  }
  // _edDeactivateMultiSel definida en scope global

  // Botón multi-selección
  $('edMultiSelBtn')?.addEventListener('click', _edToggleMultiSel);
  // Tecla M para activar/desactivar
  // (el listener de teclado principal ya existe; lo añadimos aquí una sola vez)
  if(!window._edMultiSelKeyFn){
    window._edMultiSelKeyFn = e => {
      if(e.key==='m'||e.key==='M'){
        const active=document.activeElement;
        if(active && (active.tagName==='INPUT'||active.tagName==='TEXTAREA'||active.isContentEditable)) return;
        _edToggleMultiSel();
      }
      if(e.key==='Escape' && edActiveTool==='multiselect'){
        _edDeactivateMultiSel();
      }
    };
    document.addEventListener('keydown', window._edMultiSelKeyFn);
  }

  $('edZoomResetBtn')?.addEventListener('click',()=>{
    const pw=edPageW(), ph=edPageH();
    const fullZoom = Math.min(edCanvas.width/pw, edCanvas.height/ph);
    const workZoom = Math.min(edCanvas.width/ED_CANVAS_W, edCanvas.height/ED_CANVAS_H);
    const isAtFull = Math.abs(edCamera.z - fullZoom) < 0.01;
    window._edUserRequestedReset = true;
    if(isAtFull){
      edCamera.z = workZoom;
      edCamera.x = edCanvas.width/2  - ED_CANVAS_W/2 * workZoom;
      edCamera.y = edCanvas.height/2 - ED_CANVAS_H/2 * workZoom;
      window._edUserRequestedReset = false;
    } else {
      _edCameraReset();
    }
    edRedraw();
    _edScrollbarsUpdate();
  });
  $('edSaveBtn')?.addEventListener('click', edSaveProject);
  $('edCloudSaveBtn')?.addEventListener('click', edCloudSave);
  $('edPreviewBtn')?.addEventListener('click', edOpenViewer);
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
  $('dd-gallery')?.addEventListener('click',()=>{
    // Guardar estado fullscreen — el diálogo de archivo lo cancela en algunos navegadores
    window._edWasFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    $('edFileGallery').click();
    edCloseMenus();
  });
  $('dd-camera')?.addEventListener('click', ()=>{ edCloseMenus(); edOpenCamera(); });
  $('dd-textbox')?.addEventListener('click', ()=>{ edAddText(); edCloseMenus(); });
  $('dd-bubble')?.addEventListener('click',  ()=>{ edAddBubble(); edCloseMenus(); });
  $('edFileGallery')?.addEventListener('change',e=>{
    edAddImage(e.target.files[0]);
    e.target.value='';
    // Restaurar fullscreen si estaba activo antes de abrir el diálogo
    if(window._edWasFullscreen && !(document.fullscreenElement || document.webkitFullscreenElement)){
      const el = document.documentElement;
      try{ (el.requestFullscreen||el.webkitRequestFullscreen).call(el); }catch(_){}
    }
    window._edWasFullscreen = false;
  });;

  // ── DIBUJAR ──
  $('dd-pen')?.addEventListener('click',()=>{
    edActiveTool='draw';
    edCanvas.className='tool-draw';
    if($('edBrushCursor'))$('edBrushCursor').style.display='block';
    _edDrawInitHistory();
    _edDrawLockUI();
    edRenderOptionsPanel('draw');edCloseMenus();
  });

  // ── POLÍGONOS (desde menú Insertar) ──
  function _esbActivate(shapeType, lineType) {
    edCloseMenus();
    edSelectedIdx = -1;
    edDrawFillColor = '#ffffff';
    if(shapeType) {
      _edShapeType = shapeType;
      edActiveTool = 'shape';
      edCanvas.className = 'tool-shape';
      setTimeout(() => _edActivateShapeTool(), 0);
    } else {
      _edLineType = lineType || 'draw';
      edActiveTool = 'line';
      edCanvas.className = 'tool-line';
      setTimeout(() => _edActivateLineTool(), 0);
    }
  }
  $('dd-shape-rect')?.addEventListener('click', () => _esbActivate('rect'));
  $('dd-shape-ellipse')?.addEventListener('click', () => _esbActivate('ellipse'));
  $('dd-shape-line')?.addEventListener('click', () => _esbActivate(null, 'draw'));

  function _esbSyncTool() {
    const t = edActiveTool;
    $('esb-shapes')?.classList.toggle('active', t === 'shape' || t === 'line');
    $('esb-select')?.classList.toggle('active', t === 'select');
    $('esb-fill')?.classList.toggle('active', t === 'fill');
    const dot = $('esb-size-dot');
    if(dot){ const sz=edDrawSize; const d=Math.max(6,Math.min(24,Math.round(sz*0.6))); dot.style.width=d+'px'; dot.style.height=d+'px'; }
    const sw = $('esb-color'); if(sw) sw.style.background = edDrawColor;
  }

  // ── Submenú de tipo de objeto ──
  const _esbPop = $('esb-shapes-pop');
  if(_esbPop){
    _esbPop.innerHTML = `
      <button class="edb-shape-btn" id="esb-shape-rect"    title="Rectángulo">▭</button>
      <button class="edb-shape-btn" id="esb-shape-ellipse" title="Elipse">◯</button>
      <button class="edb-shape-btn" id="esb-shape-line"    title="Rectas">╱</button>`;
    $('esb-shape-rect')?.addEventListener('pointerup', e => {
      e.stopPropagation(); _esbClosePop();
      _edShapeType='rect'; edActiveTool='shape'; edCanvas.className='tool-shape';
      edDrawFillColor='none'; _esbSyncTool();
    });
    $('esb-shape-ellipse')?.addEventListener('pointerup', e => {
      e.stopPropagation(); _esbClosePop();
      _edShapeType='ellipse'; edActiveTool='shape'; edCanvas.className='tool-shape';
      edDrawFillColor='none'; _esbSyncTool();
    });
    $('esb-shape-line')?.addEventListener('pointerup', e => {
      e.stopPropagation(); _esbClosePop();
      _edLineType='draw'; edActiveTool='line'; edCanvas.className='tool-line';
      edDrawFillColor='none'; _esbSyncTool();
    });
  }
  function _esbClosePop(){ $('esb-shapes-pop')?.classList.remove('open'); }
  function _esbTogglePop(){
    const pop=$('esb-shapes-pop'); if(!pop) return;
    if(pop.classList.contains('open')){ _esbClosePop(); return; }
    // Posicionar el popup
    const bar=$('edShapeBar'), btn=$('esb-shapes');
    if(!bar||!btn) return;
    const isH=bar.classList.contains('horiz');
    const br=bar.getBoundingClientRect();
    pop.style.visibility='hidden'; pop.style.display='flex';
    const pw=pop.offsetWidth||130, ph=pop.offsetHeight||52;
    pop.style.display=''; pop.style.visibility='';
    let l,t;
    if(isH){ l=br.left+(br.width/2)-pw/2; t=br.top-ph-8; if(t<4)t=br.bottom+8; }
    else { l=br.right+8; t=br.top+(br.height/2)-ph/2; if(l+pw>window.innerWidth-4)l=br.left-pw-8; }
    pop.style.left=Math.max(4,Math.min(window.innerWidth-pw-4,l))+'px';
    pop.style.top=Math.max(4,Math.min(window.innerHeight-ph-4,t))+'px';
    pop.classList.add('open');
    setTimeout(()=>{
      window._esbPopClose=e=>{
        if(!e.target.closest('#esb-shapes-pop')&&!e.target.closest('#esb-shapes')){
          _esbClosePop(); document.removeEventListener('pointerdown',window._esbPopClose);
        }
      };
      document.addEventListener('pointerdown',window._esbPopClose);
    },0);
  }
  $('esb-shapes')?.addEventListener('pointerup', e => { e.stopPropagation(); _esbTogglePop(); });
  // ── Seleccionar ──
  $('esb-select')?.addEventListener('pointerup', e => {
    e.stopPropagation();
    edSelectedIdx = -1; edActiveTool = 'select'; edCanvas.className = '';
    edRedraw(); _esbSyncTool();
  });
  // ── OK: igual que op-draw-ok pero cierra edShapeBar ──
  $('esb-ok')?.addEventListener('click', () => {
    if(edActiveTool === 'line' && _edLineLayer) _edFinishLine();
    _edShapeClearHistory();
    $('edShapeBar')?.classList.remove('visible');
    edCloseOptionsPanel();
    edSelectedIdx=-1; edActiveTool='select'; edCanvas.className='';
    _edShapeStart=null; _edShapePreview=null; _edPendingShape=null;
    _edDrawUnlockUI();
    if(edMinimized){ window._edMinimizedDrawMode=null; edMaximize(); }
    edRedraw();
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
  // Submenú exportar: toggle inline al clicar
  // Submenús inline — mismo patrón que exportar
  $('dd-imagen-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('dd-imagen-sub')?.classList.toggle('open');
  });
  $('dd-texto-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('dd-texto-sub')?.classList.toggle('open');
  });
  $('dd-vectorial-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('dd-vectorial-sub')?.classList.toggle('open');
  });
  $('dd-exportbtn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('dd-export-sub')?.classList.toggle('open');
  });
  $('dd-exportpng')?.addEventListener('click',()=>{edExportPagePNG('png');edCloseMenus();});
  $('dd-exportjpg')?.addEventListener('click',()=>{edExportPagePNG('jpg');edCloseMenus();});
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
  $('edUndoBtn')?.addEventListener('click', () => {
    if(['draw','eraser','fill'].includes(edActiveTool)) edDrawUndo();
    else edUndo();
  });
  $('edRedoBtn')?.addEventListener('click', () => {
    if(['draw','eraser','fill'].includes(edActiveTool)) edDrawRedo();
    else edRedo();
  });
  $('edMinimizeBtn')?.addEventListener('click',edMinimize);
  $('edMenuMinBtn')?.addEventListener('click',edMinimize);
  _edShapePushHistory();
  edInitFloatDrag();
  edInitDrawBar();
  edInitShapeBar();
  // Avisar al usuario si localStorage se llena al guardar
  window._edQuotaFn = () => edToast('⚠️ Sin espacio: reduce el tamaño de las imágenes o elimina páginas', 5000);
  window.addEventListener('cx:storage:quota', window._edQuotaFn);

  // ── VISOR ──
  // Botón cerrar desktop (dentro de pastilla)
  ['click','pointerup'].forEach(ev=>{
    $('viewerClose')?.addEventListener(ev, e=>{
      e.stopPropagation(); edCloseViewer();
    });
  });
  // Botón cerrar móvil (táctil, centrado abajo)
  ['click','pointerup'].forEach(ev=>{
    $('viewerCloseMobile')?.addEventListener(ev, e=>{
      e.stopPropagation(); edCloseViewer();
    });
  });
  // Botón anterior (desktop)
  $('viewerPrev')?.addEventListener('pointerup', e=>{
    e.stopPropagation(); edShowViewerCtrls(); _viewerBack();
  });
  // Botón siguiente (desktop)
  $('viewerNext')?.addEventListener('pointerup', e=>{
    e.stopPropagation(); edShowViewerCtrls(); _viewerAdvance();
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
    const ctrl = e.ctrlKey || e.metaKey;
    // Bloquear shortcuts si hay un input con foco, EXCEPTO Ctrl+Z/Y
    // cuando hay herramienta de dibujo activa (los sliders del panel roban el foco)
    if(tag === 'input' || tag === 'textarea' || tag === 'select'){
      const isDrawTool = ['draw','eraser','fill'].includes(edActiveTool);
      const isUndoRedo = ctrl && (e.key.toLowerCase()==='z' || e.key.toLowerCase()==='y');
      if(!(isDrawTool && isUndoRedo)) return;
    }
    // Enter: cerrar panel de opciones abierto (OK)
    if(e.key === 'Enter' && !ctrl){
      const panel = $('edOptionsPanel');
      if(panel && panel.classList.contains('open')){
        e.preventDefault();
        edCloseOptionsPanel();
        if(['draw','eraser','fill'].includes(edActiveTool)) edDeactivateDrawTool();
        return;
      }
    }
    // ESC: cerrar menús desplegables y panel de opciones sin guardar
    if(e.key === 'Escape' && !ctrl){
      // Cerrar modal de guardado si está abierto
      const saveModal=document.querySelector('div[style*="z-index:99999"]');
      if(saveModal){ e.preventDefault(); saveModal.remove(); return; }
      // Cerrar popup de curva si está abierto
      document.getElementById('esb-curve-pop')?.remove();
      // Cerrar menú desplegable si está abierto
      if(edMenuOpen){ e.preventDefault(); edCloseMenus(); return; }
      // Cerrar panel de opciones si está abierto (sin guardar)
      const panel = $('edOptionsPanel');
      if(panel && panel.classList.contains('open')){
        e.preventDefault();
        const mode = panel.dataset.mode;
        if(mode === 'shape' || mode === 'line'){
          _edShapeStart=null; _edShapePreview=null; _edPendingShape=null;
          if(_edLineLayer && _edLineLayer.points.length < 2){
            const idx=edLayers.indexOf(_edLineLayer);
            if(idx>=0) edLayers.splice(idx,1);
          }
          _edLineLayer=null;
          edActiveTool='select'; edCanvas.className='';
          _edDrawUnlockUI();
        } else if(mode === 'draw' || ['draw','eraser','fill'].includes(edActiveTool)){
          edDeactivateDrawTool();
        } else {
          _edDrawUnlockUI();
        }
        edCloseOptionsPanel();
        edSelectedIdx=-1; edRedraw();
        return;
      }
    }
    // Ctrl+D → duplicar objeto seleccionado
    if(ctrl && e.key.toLowerCase() === 'd'){
      if(edSelectedIdx >= 0){ e.preventDefault(); edDuplicateSelected(); }
      return;
    }
    if((e.key === 'Delete' || e.key === 'Backspace') && !ctrl){
      if(edActiveTool==='multiselect' && edMultiSel.length){
        e.preventDefault();
        const page=edPages[edCurrentPage]; if(!page) return;
        // Guardar estado actual (con objetos) antes de borrar
        // Usamos el mismo patrón que edDeleteSelected
        const toDelete=[...edMultiSel].sort((a,b)=>b-a);
        toDelete.forEach(i=>{ page.layers.splice(i,1); });
        edLayers=page.layers;
        _edDeactivateMultiSel();
        edSelectedIdx=-1;
        _edShapePushHistory(); // igual que edDeleteSelected: push DESPUÉS del borrado
        edRedraw();
      } else if(edSelectedIdx >= 0){
        e.preventDefault(); edDeleteSelected();
      }
      return;
    }
    if(!ctrl) return;
    if(!e.shiftKey && e.key.toLowerCase() === 'z'){
      e.preventDefault();
      if(['draw','eraser','fill'].includes(edActiveTool)) edDrawUndo();
      else edUndo();
    }
    else if(e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')){
      e.preventDefault();
      if(['draw','eraser','fill'].includes(edActiveTool)) edDrawRedo();
      else edRedo();
    }
  };
  document.addEventListener('keydown', window._edKeyFn);

  // ── RESIZE ──
  // Guardar referencia para cleanup en EditorView_destroy
  window._edResizeFn = () => { edFitCanvas(false); }; // solo reajustar tamaño, nunca resetear cámara
  window.addEventListener('resize', window._edResizeFn);

  // Fit canvas con reintentos hasta que las medidas sean reales
  // (el CSS se carga dinámicamente y las fuentes tardan en aplicar)
  function _edInitFit(attemptsLeft) {
    const topbar = $('edTopbar');
    const menu   = $('edMenuBar');
    const topH   = topbar ? topbar.getBoundingClientRect().height : 0;
    const menuH  = menu   ? menu.getBoundingClientRect().height   : 0;
    if (topH > 10 && menuH > 10) {
      window._edUserRequestedReset=true; edFitCanvas(true); edRedraw(); return;
    }
    if (attemptsLeft <= 0) {
      window._edUserRequestedReset=true; edFitCanvas(true); edRedraw(); return;
    }
    requestAnimationFrame(() => _edInitFit(attemptsLeft - 1));
  }
  // Primer intento tras doble rAF; si falla reintenta hasta 30 frames (~500ms)
  requestAnimationFrame(() => requestAnimationFrame(() => _edInitFit(30)));

  // Cerrar herramienta de dibujo al tocar fuera del canvas
  window._edDocDownFn = e => {
    // Ignorar clicks en zona de barra bloqueada (pointer-events:none deja pasar coords)
    const _menuBar2=$('edMenuBar');
    if(_menuBar2 && $('editorShell')?.classList.contains('draw-active')){
      const _mbr2=_menuBar2.getBoundingClientRect();
      if(e.clientX>=_mbr2.left&&e.clientX<=_mbr2.right&&e.clientY>=_mbr2.top&&e.clientY<=_mbr2.bottom) return;
    }
    // Cerrar menús y submenús al tocar fuera — solo si NO hay bloqueo activo
    const _drawActive=$('editorShell')?.classList.contains('draw-active');
    if(!_drawActive && edMenuOpen){
      const _inDropdown=e.target.closest('.ed-dropdown')||e.target.closest('.ed-subdropdown')||e.target.closest('.ed-submenu')||e.target.closest('[data-menu]');
      if(!_inDropdown){ edCloseMenus(); }
    }

    if(['draw','eraser','fill','shape','line'].includes(edActiveTool)){
      const inCanvas   = e.target.closest('#editorCanvas');
      const inPanel    = e.target.closest('#edOptionsPanel');
      const inMenu     = e.target.closest('#edMenuBar');
      const inTopbar   = e.target.closest('#edTopbar');
      const inFloat    = e.target.closest('#edFloatBtn');
      const inDrawBar  = e.target.closest('#edDrawBar');
      const inShapeBar = e.target.closest('#edShapeBar');
      const inPalPop   = e.target.closest('#edb-palette-pop');
      const inShapePop = e.target.closest('#edb-palette-pop');
      const inHSL      = e.target.closest('#ed-hsl-picker');
      if(!inCanvas && !inPanel && !inMenu && !inTopbar && !inFloat && !inDrawBar && !inShapeBar && !inPalPop && !inShapePop && !inHSL){
        if(['draw','eraser','fill'].includes(edActiveTool)) edDeactivateDrawTool();
      }
    }
    // Deseleccionar shape/line al tocar fuera del canvas con barra flotante activa
    if(($('edDrawBar')?.classList.contains('visible') || $('edShapeBar')?.classList.contains('visible')) && edSelectedIdx >= 0){
      const _la = edLayers[edSelectedIdx];
      if(_la && (_la.type==='shape' || _la.type==='line')){
        const inCanvas   = e.target.closest('#editorCanvas');
        const inDrawBar  = e.target.closest('#edDrawBar');
        const inShapeBar = e.target.closest('#edShapeBar');
        const inPanel    = e.target.closest('#edOptionsPanel');
        const inMenuBar  = e.target.closest('#edMenuBar');
        const inTopbar   = e.target.closest('#edTopbar');
        const inCurvePop = e.target.closest('#esb-curve-pop') || e.target.id==='esb-curve';
        const curveOn=$('esb-curve')?.dataset.curveActive==='1';
        if(!inCanvas && !inDrawBar && !inShapeBar && !inPanel && !inMenuBar && !inTopbar && !inCurvePop && !curveOn){
          edSelectedIdx = -1;
          edActiveTool = 'select';
          edCanvas.className = '';
          edRedraw();
        }
      }
    }

  };
  document.addEventListener('pointerdown', window._edDocDownFn);


  // ── FULLSCREEN CANVAS ON ORIENTATION MATCH ──
  edUpdateCanvasFullscreen();
  // Guardar referencia para cleanup en EditorView_destroy
  window._edOrientFn = () => { setTimeout(()=>{ window._edUserRequestedReset=true; edFitCanvas(true); }, 200); };
  window.addEventListener('orientationchange', window._edOrientFn);

  // ── Pinch en cualquier zona (fuera del canvas) = zoom ──
  let _shellPinch0 = 0, _shellZoom0 = 1;
  const editorShell = document.getElementById('editorShell');
  if(editorShell){
    let _pinchPrev = 0, _pinchMidX = 0, _pinchMidY = 0;
    editorShell.addEventListener('touchstart', e => {
      if(e.touches.length === 2){
        // No hacer zoom de cámara si hay objeto seleccionado o multiselección activa
        if(edSelectedIdx >= 0 || (edActiveTool==='multiselect' && edMultiSel.length)){ _pinchPrev = 0; return; }
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
        // No hacer zoom de cámara si hay objeto seleccionado o multiselección activa
        if(edSelectedIdx >= 0 || (edActiveTool==='multiselect' && edMultiSel.length)) return;
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
// Exportar la hoja actual como PNG o JPG
// Renderiza en canvas offscreen con transform z=1, desplazado al origen de la página
function edExportPagePNG(format){
  format = format || 'png';
  edSaveProject();
  const pw = Math.round(edPageW()), ph = Math.round(edPageH());
  const mx = edMarginX(), my = edMarginY();
  const page = edPages[edCurrentPage]; if(!page) return;

  const off    = document.createElement('canvas');
  off.width    = pw;
  off.height   = ph;
  const offCtx = off.getContext('2d');

  // Fondo blanco
  offCtx.fillStyle = '#ffffff';
  offCtx.fillRect(0, 0, pw, ph);

  // Transform: z=1, origen en esquina superior izquierda de la página
  // (equivale a setTransform(1,0,0,1, -mx, -my) en coords workspace)
  offCtx.setTransform(1, 0, 0, 1, -mx, -my);

  // Renderizar capas en el mismo orden que edRedraw (sin UI, sin handles, sin borde azul)
  const _textLayers   = edLayers.filter(l => l.type==='text' || l.type==='bubble');
  const _textGroupAlpha = page.textLayerOpacity ?? 1;

  edLayers.forEach(l => {
    if(!l) return;
    if(l.type === 'image'){
      l.draw(offCtx, off);
    } else if(l.type === 'draw'){
      offCtx.globalAlpha = 1;
      l.draw(offCtx);
      offCtx.globalAlpha = 1;
    } else if(l.type === 'stroke'){
      offCtx.globalAlpha = l.opacity ?? 1;
      l.draw(offCtx);
      offCtx.globalAlpha = 1;
    }
  });
  offCtx.globalAlpha = _textGroupAlpha;
  _textLayers.forEach(l => l.draw(offCtx, off));
  offCtx.globalAlpha = 1;

  // Descargar
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const quality  = format === 'jpg' ? 0.92 : undefined;
  off.toBlob(blob => {
    if(!blob){ edToast('Error al exportar'); return; }
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    const title = (edProjectMeta.title || 'hoja').replace(/\s+/g, '_');
    const pg    = edCurrentPage + 1;
    a.href      = url;
    a.download  = `${title}_hoja${pg}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    edToast(`Hoja ${pg} exportada ✓`);
  }, mimeType, quality);
}

function edLoadFromJSON(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.editorData){
        edProjectMeta={title:data.title||'',author:data.author||'',genre:data.genre||'',navMode:data.navMode||'horizontal',social:data.social||''};
        edOrientation=data.editorData.orientation||'vertical';
        edPages=(data.editorData.pages||[]).map(pd=>({
          drawData:pd.drawData||null,
          layers:(pd.layers||[]).map(d=>edDeserLayer(d, pd.orientation||data.editorData.orientation||'vertical')).filter(Boolean),
          textLayerOpacity:pd.textLayerOpacity??1,
          textMode:pd.textMode||'sequential',
          orientation:pd.orientation||data.editorData.orientation||'vertical',
        }));
        if(!edPages.length)edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'sequential'});
        edCurrentPage=0;edLayers=edPages[0].layers;
        edSetOrientation(edOrientation);
        const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title;
        edToast('Proyecto cargado ✓');
      }
    }catch(err){edToast('Error al cargar el archivo');}
  };
  reader.readAsText(file);
}
