/* ============================================================
   editor.js — ComiXow v5.4
   Motor canvas fiel al referEditor.
   Menú tipo page-nav, botón flotante al minimizar.
   ============================================================ */

/* ── ESTADO ── */
let edCanvas, edCtx, edViewerCanvas, edViewerCtx;
let edPages = [], edCurrentPage = 0, edLayers = [];
// ── Sistema de Reglas (T29) ──
let edRules = [];          // array de reglas de la hoja actual
let _edRuleId = 0;         // contador para IDs únicos
let _edRuleDrag = null;    // { ruleId, part:'a'|'b'|'line', offX, offY } — drag activo
let _edRulePanelId = null; // id de la regla con panel abierto
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
let _edLineType   = 'draw';   // 'draw' | 'select'
let edLastPointerIsTouch = false; // se actualiza en edOnStart con e.pointerType real
let edPainting = false;
let edDrawHistory = [], edDrawHistoryIdx = -1;  // historial local de dibujo
const ED_MAX_DRAW_HISTORY = 20;
// Icono simetría (T14): triángulo izq (cateto horiz + cateto vertical derecho) | gap | línea discontinua | gap | triángulo der (espejo)
const _ED_MIRROR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16" width="20" height="14" style="display:block;pointer-events:none"><polygon points="1,1 9,1 9,15" fill="currentColor"/><line x1="12" y1="0" x2="12" y2="16" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.5 2"/><polygon points="15,1 23,1 15,15" fill="currentColor"/></svg>`;
let edDrawColor = '#000000', edDrawSize = 4, edEraserSize = 20, edDrawOpacity = 100;
// Cursor desplazado (T18): el trazado se aplica 1cm más arriba del toque real
let _edCursorOffset = false;           // estado del botón (activo/inactivo)
let _edCursorOffsetAngle = 0;          // ángulo respecto a vertical: -40, 0, +40 grados
let _edOffsetFirstMove = false;        // true: el primer move debe incluir el punto inicial
let _edOffsetLastTouch = null;         // última posición táctil conocida {x, y, sz} para refrescar el cursor
const _ED_CURSOR_OFFSET_PX = 76;       // 2 cm en px CSS (2 × 96/2.54 ≈ 76)
let edColorPalette = ['#000000','#ffffff','#e63030','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#e91e8c','#795548'];
let edSelectedPaletteIdx = 0; // índice del dot de paleta actualmente seleccionado
let edMenuOpen = null;     // id del dropdown abierto
let edMinimized = false;
let edFloatX = 12, edFloatY = 12; // posición del botón flotante (esquina superior izquierda)
// Pinch-to-zoom
let edPinching = false, edPinchDist0 = 0, edPinchAngle0 = 0, edPinchScale0 = null;
let _edPinchHappened = false; // true desde que empieza el pinch hasta que se levantan TODOS los dedos
let edPinchCenter0 = null, edPinchCamera0 = null;
// Transformación de DrawLayer durante pinch
let _edDrawPinch = null; // { snapshotImg, tx, ty, scale } — activo durante pinch en modo draw
let edPanelUserClosed = false;  // true = usuario cerró panel con ✓, no reabrir al seleccionar
// edZoom eliminado — reemplazado por edCamera.z
// ── Cámara del editor (patrón Figma/tldraw) ──
// x,y = traslación del canvas (donde aparece el origen del workspace en pantalla)
// z   = escala (1 = lienzo ocupa el viewport)
const edCamera = { x: 0, y: 0, z: 1 };
let _edLastTapTime = 0, _edLastTapIdx = -1; // para detectar doble tap
let _edLastNodeTapTime = 0, _edLastNodeTapIdx = -1; // doble tap sobre nodo/segmento de línea
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
  // Actualizar dots de grosor en barras flotantes para reflejar el nuevo zoom
  _edSyncSizeDots();
}
function _edSyncSizeDots(){
  const z = edCamera.z;
  // Actualizar preview del panel si está abierto
  _edbSyncSizePreview();
  // Dot barra flotante de objetos
  const dotS = $('esb-size-dot');
  if(dotS){
    const la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
    const lw = la ? (la.lineWidth||0) : 0;
    const d2 = Math.max(3, Math.min(22, Math.round(lw * z)));
    dotS.style.width=d2+'px'; dotS.style.height=d2+'px';
  }
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
    this.color='#000000';this.backgroundColor='#ffffff';this.bgOpacity=1;
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
    const _bgo=this.bgOpacity??1;
    const _ctxAlpha=ctx.globalAlpha;
    if(_bgo>0){ctx.globalAlpha=_ctxAlpha*_bgo;ctx.fillStyle=this.backgroundColor;ctx.fillRect(-w/2,-h/2,w,h);ctx.globalAlpha=_ctxAlpha;}
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
      // El texto cabe en el círculo interior de radio maxDist-padding
      // maxDist ≈ 0.45 * w (constante para proporciones razonables, ver análisis geométrico)
      // → w = (textW/2 + padding) / 0.45 * 1.05 (margen 5%)
      // → h = (textH/2 + padding) / 0.45 * 1.05
      // El bbox se adapta al texto en ambos ejes sin espacio desperdiciado
      const _C=0.45, _mg=1.05;
      const w2=(maxW/2+this.padding)/_C*_mg;
      const h2=(totalH/2+this.padding)/_C*_mg;
      this.width=Math.max(0.10,w2/pw);
      this.height=Math.max(0.07,h2/ph);
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
    // Línea blanca: tapa el stroke negro en la base sin cubrir los vértices del triángulo
    // lineCap='butt' para no crear semicírculos que tapan los ángulos
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
        // Radios proporcionales al bocadillo — tamaño doble manteniendo proporciones relativas
        const rBig  = Math.min(w,h)*0.156;
        const rSmall= Math.min(w,h)*0.070;
        // Elipse mediana: a mitad de distancia entre contorno grande y contorno pequeña
        // Contorno grande más cercano a pequeña: punto en bx,by en dirección a sx,sy a distancia rBig
        const dx=sx-bx,dy=sy-by,dist=Math.hypot(dx,dy)||1;
        const ux=dx/dist,uy=dy/dist;
        // Contornos de grande y pequeña (punto más cercano entre ellas)
        const edgeBig  ={x:bx+ux*rBig,   y:by+uy*rBig};
        const edgeSmall={x:sx-ux*rSmall, y:sy-uy*rSmall};
        const freeD=Math.hypot(edgeSmall.x-edgeBig.x,edgeSmall.y-edgeBig.y);
        // Radios interpolados linealmente: rSmall < r2 < r3 < rBig
        // Elipses 1(rojo/pequeña) < 2 < 3 < 4(azul/grande)
        const r2=rSmall+(rBig-rSmall)*1/3; // elipse 2: 1/3 del camino entre pequeña y grande
        const r3=rSmall+(rBig-rSmall)*2/3; // elipse 3: 2/3 del camino entre pequeña y grande
        // gap igual entre todos los contornos adyacentes
        const gap=Math.max(0,(freeD-2*r3-2*r2)/3);
        // Desde edgeSmall hacia edgeBig (orden 2→3)
        const e2x=edgeSmall.x-ux*(gap+r2), e2y=edgeSmall.y-uy*(gap+r2);
        const e3x=edgeSmall.x-ux*(gap+2*r2+gap+r3), e3y=edgeSmall.y-uy*(gap+2*r2+gap+r3);
        [[sx,sy,rSmall],[e2x,e2y,r2],[e3x,e3y,r3],[bx,by,rBig]].forEach(([cx2,cy2,r])=>{
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
  static fromDataUrlFull(dataUrl){
    // dataUrl es workspace completo (ED_CANVAS_W × ED_CANVAS_H) — colocar 1:1
    const dl = new DrawLayer();
    const img = new Image();
    img.onload = () => {
      dl._ctx.drawImage(img, 0, 0, ED_CANVAS_W, ED_CANVAS_H);
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
  // Como beginStroke pero sin dibujar el punto inicial — para cursor offset
  beginStrokeNoDot(nx, ny){
    const {x,y} = this._wsCoords(nx, ny);
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
    // DrawLayer: pixel-hit con zona expandida para facilitar selección
    try {
      const wx = Math.round(edMarginX() + px * edPageW());
      const wy = Math.round(edMarginY() + py * edPageH());
      const R = 10; // radio de expansión en px del workspace
      const x0=Math.max(0,wx-R), y0=Math.max(0,wy-R);
      const x1=Math.min(this._canvas.width-1,wx+R);
      const y1=Math.min(this._canvas.height-1,wy+R);
      if(x1<x0||y1<y0) return false;
      const data=this._ctx.getImageData(x0,y0,x1-x0+1,y1-y0+1).data;
      for(let i=3;i<data.length;i+=4){ if(data[i]>10) return true; }
      return false;
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
      const bx = Math.round((lx / w + 0.5) * this._canvas.width);
      const by = Math.round((ly / h + 0.5) * this._canvas.height);
      // Radio de expansión: 10px en coords de workspace, escalado al canvas recortado
      const scaleX = this._canvas.width / w;
      const scaleY = this._canvas.height / h;
      const Rx = Math.ceil(10 * scaleX), Ry = Math.ceil(10 * scaleY);
      const x0=Math.max(0,bx-Rx), y0=Math.max(0,by-Ry);
      const x1=Math.min(this._canvas.width-1,bx+Rx);
      const y1=Math.min(this._canvas.height-1,by+Ry);
      if(x1<x0||y1<y0) return false;
      const _sctx=this._canvas.getContext('2d');
      const data=_sctx.getImageData(x0,y0,x1-x0+1,y1-y0+1).data;
      for(let i=3;i<data.length;i+=4){ if(data[i]>10) return true; }
      return false;
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
      // Sin relleno: ampliar zona de hit al contorno (mínimo 12px) para facilitar selección
      if (this.lineWidth > 0) {
        octx.strokeStyle = '#000';
        const noFill = !this.fillColor || this.fillColor === 'none';
        octx.lineWidth = noFill ? Math.max(this.lineWidth, 12) : this.lineWidth;
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
    const cr = this.cornerRadii || {};
    const n = this.points.length;
    const hasRadii = n>0 && Object.keys(cr).some(k=>(cr[k]||0)>0);

    if(hasRadii){
      // Con radios: el bbox para selección y resize usa los puntos ORIGINALES,
      // igual que Figma — los radios son metadatos, no modifican la geometría.
      // _updateBbox solo recentra los puntos si están descentrados.
      const xs2=this.points.map(p=>p.x), ys2=this.points.map(p=>p.y);
      const minX2=Math.min(...xs2),maxX2=Math.max(...xs2);
      const minY2=Math.min(...ys2),maxY2=Math.max(...ys2);
      const newCx2=(minX2+maxX2)/2, newCy2=(minY2+maxY2)/2;
      if(Math.abs(newCx2)>0.001||Math.abs(newCy2)>0.001){
        const rot=(this.rotation||0)*Math.PI/180;
        const cos=Math.cos(rot),sin=Math.sin(rot);
        const dxPx=newCx2*pw, dyPx=newCy2*ph;
        this.x+=(dxPx*cos-dyPx*sin)/pw;
        this.y+=(dxPx*sin+dyPx*cos)/ph;
        this.points=this.points.map(p=>({x:p.x-newCx2,y:p.y-newCy2}));
      }
      this.width  = Math.max(maxX2-minX2, 0.01);
      this.height = Math.max(maxY2-minY2, 0.01);
    } else {
      // Sin radios: comportamiento original
      const xs=this.points.map(p=>p.x), ys=this.points.map(p=>p.y);
      const minX=Math.min(...xs),maxX=Math.max(...xs);
      const minY=Math.min(...ys),maxY=Math.max(...ys);
      const newCx=(minX+maxX)/2, newCy=(minY+maxY)/2;
      if(Math.abs(newCx)>0.001||Math.abs(newCy)>0.001){
        const rot=(this.rotation||0)*Math.PI/180;
        const cos=Math.cos(rot),sin=Math.sin(rot);
        const dxPx=newCx*pw, dyPx=newCy*ph;
        this.x+=(dxPx*cos-dyPx*sin)/pw;
        this.y+=(dxPx*sin+dyPx*cos)/ph;
        this.points=this.points.map(p=>({x:p.x-newCx,y:p.y-newCy}));
      }
      this.width  = Math.max(maxX-minX, 0.01);
      this.height = Math.max(maxY-minY, 0.01);
    }
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
    const pts = this.points;
    const cr  = this.cornerRadii || {};
    const n   = pts.length;
    // scaleX/scaleY: factores de escala acumulados por resize no proporcional
    // Se actualizan en edOnEnd al finalizar un resize
    const px2 = p => ({x: p.x*pw, y: p.y*ph});

    // Normalize vector to unit length
    const norm = (vx,vy) => { const l=Math.hypot(vx,vy); return l>0?{x:vx/l,y:vy/l}:{x:0,y:0}; };

    // Effective radius at vertex i: limited to half of shortest adjacent segment
    const effR = i => {
      const r=cr[i]||0; if(!r) return 0;
      const prev=px2(pts[(i-1+n)%n]), cur=px2(pts[i]), next=px2(pts[(i+1)%n]);
      const d1=Math.hypot(cur.x-prev.x,cur.y-prev.y);
      const d2=Math.hypot(next.x-cur.x,next.y-cur.y);
      return Math.max(0,Math.min(r,Math.min(d1/2,d2/2)));
    };

    // For each vertex: compute p1 (entry tangent) and p2 (exit tangent)
    // using the algorithm from getRoundedPath — quadratic bezier Q curr p2
    // This is symmetric: works identically for every vertex including the closing segment
    const tangents = Array.from({length:n}, (_,i) => {
      const prev=px2(pts[(i-1+n)%n]), cur=px2(pts[i]), next=px2(pts[(i+1)%n]);
      const v1=norm(cur.x-prev.x, cur.y-prev.y);
      const v2=norm(next.x-cur.x, next.y-cur.y);
      const r=effR(i);
      return {
        p1: {x:cur.x-v1.x*r, y:cur.y-v1.y*r},  // entry point
        p2: {x:cur.x+v2.x*r, y:cur.y+v2.y*r},  // exit point
        cur, r
      };
    });

    ctx.beginPath();
    if(!this.closed){
      ctx.moveTo(tangents[0].cur.x, tangents[0].cur.y);
      for(let i=1;i<n;i++){
        const {p1,p2,cur,r}=tangents[i];
        if(r>0 && i>0 && i<n-1){
          ctx.lineTo(p1.x,p1.y);
          ctx.quadraticCurveTo(cur.x,cur.y,p2.x,p2.y);
        } else {
          ctx.lineTo(cur.x,cur.y);
        }
      }
    } else {
      // Closed polygon — symmetric algorithm, no special case for closing segment
      const t0=tangents[0];
      ctx.moveTo(t0.p1.x, t0.p1.y);
      for(let i=0;i<n;i++){
        const {p1,p2,cur,r}=tangents[i];
        if(r>0){
          ctx.quadraticCurveTo(cur.x,cur.y,p2.x,p2.y);
        }
        // Line to entry point of next vertex
        const next=tangents[(i+1)%n];
        if(next.r>0){
          ctx.lineTo(next.p1.x,next.p1.y);
        } else {
          ctx.lineTo(next.cur.x,next.cur.y);
        }
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
      // Sin relleno: ampliar zona de hit al contorno (mínimo 12px)
      const _noFillL = !this.fillColor || this.fillColor === 'none';
      octx.lineWidth = Math.max(this.lineWidth > 0 ? Math.max(this.lineWidth, _noFillL ? 12 : 8) : 0, 0);
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
    if(l.type === 'stroke') return { type: 'stroke', dataUrl: l.toDataUrl(), frozenLine: l._frozenLine||null,
      x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0, opacity:l.opacity,
      color:l.color||'#000000', lineWidth:l.lineWidth??3 };
    if(l.type === 'shape')  return { type:'shape', shape:l.shape, x:l.x, y:l.y,
      width:l.width, height:l.height, rotation:l.rotation||0,
      color:l.color, fillColor:l.fillColor||'none', lineWidth:l.lineWidth, opacity:l.opacity??1,
      cornerRadius: l.cornerRadius||0,
      cornerRadii: l.cornerRadii ? (Array.isArray(l.cornerRadii) ? [...l.cornerRadii] : {...l.cornerRadii}) : null };
    if(l.type === 'line')   return { type:'line', points:l.points.slice(),
      x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0,
      closed:l.closed, color:l.color, fillColor:l.fillColor||'#ffffff', lineWidth:l.lineWidth, opacity:l.opacity??1,
      cornerRadii: l.cornerRadii ? (Array.isArray(l.cornerRadii) ? [...l.cornerRadii] : {...l.cornerRadii}) : null };
    const o = {};
    for(const k of ['type','x','y','width','height','rotation',
                    'text','fontSize','fontFamily','fontBold','fontItalic','color','backgroundColor','bgOpacity',
                    'borderColor','borderWidth','padding','explosionRadii','thoughtBig','thoughtSmall',
                    'tail','tailStart','tailEnd','tailStarts','tailEnds','style','voiceCount']){
      if(l[k] !== undefined) o[k] = l[k];
    }
    if(l.type === 'group') return null; // obsoleto — ignorar grupos viejos
    if(l.groupId) o.groupId = l.groupId;
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
      if(o.frozenLine) l._frozenLine = o.frozenLine;
      if(o.rotation) l.rotation=o.rotation;
      if(o.opacity !== undefined) l.opacity=o.opacity;
      if(o.groupId) l.groupId=o.groupId;
      return l;
    }
    else if(o.type === 'shape') {
      l = new ShapeLayer(o.shape||'rect', o.x||0.5, o.y||0.5, o.width||0.3, o.height||0.2);
      l.color=o.color||'#000'; l.fillColor=o.fillColor||'none'; l.lineWidth=o.lineWidth??3; l.rotation=o.rotation||0; l.opacity=o.opacity??1;
      if(o.cornerRadius) l.cornerRadius=o.cornerRadius;
      if(o.cornerRadii) l.cornerRadii = Array.isArray(o.cornerRadii) ? [...o.cornerRadii] : {...o.cornerRadii};
      if(o.groupId) l.groupId=o.groupId;
      return l;
    }
    else if(o.type === 'line') {
      l = new LineLayer();
      l.points=o.points||[]; l.closed=o.closed||false;
      l.color=o.color||'#000'; l.fillColor=o.fillColor||'#ffffff'; l.lineWidth=o.lineWidth??3; l.opacity=o.opacity??1;
      l.rotation=o.rotation||0;
      if(o.cornerRadii) l.cornerRadii = Array.isArray(o.cornerRadii) ? [...o.cornerRadii] : {...o.cornerRadii};
      if(o.x!=null){l.x=o.x;l.y=o.y;l.width=o.width||0.01;l.height=o.height||0.01;}
      else l._updateBbox();
      if(o.groupId) l.groupId=o.groupId;
      return l;
    }
    else if(o.type === 'group') return null; // obsoleto
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

  // Redimensionar canvas si es necesario
  const _prevW = edCanvas.width, _prevH = edCanvas.height;
  const _sizeChanged = _prevW !== newW || _prevH !== newH;
  if(_sizeChanged){
    edCanvas.width  = newW;
    edCanvas.height = newH;
    // Cuando el canvas ENCOGE por la apertura de un panel inferior,
    // compensar camera.y para que el workspace suba con el canvas
    // y el contenido que estaba visible siga visible.
    // Cuando crece (panel cerrándose), no compensar — el espacio extra aparece abajo.
    if(!_doReset && newH < _prevH){
      _savedCam.y -= (_prevH - newH);
    }
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
  const _mdd=$('_edMultiSelDd'); if(_mdd) _mdd.classList.remove('open');
  if(prev>=0&&prev<edLayers.length) edSelectedIdx=prev;
  edRedraw();
}

// Muestra/actualiza el dropdown de multiselección (Agrupar/Desagrupar)
function _edUpdateMultiSelPanel(){
  const panel=$('edOptionsPanel');
  if(panel && panel.dataset.mode==='multiselect'){ panel.classList.remove('open'); panel.innerHTML=''; delete panel.dataset.mode; }
  let dd = $('_edMultiSelDd');
  if(!dd){
    dd = document.createElement('div');
    dd.id = '_edMultiSelDd';
    dd.className = 'ed-dropdown';
    document.addEventListener('pointerdown', e=>{
      if(!dd.contains(e.target) && e.target.id!=='edMultiSelBtn') dd.classList.remove('open');
    }, {passive:true});
    document.body.appendChild(dd);
  }
  if(edActiveTool!=='multiselect' || edMultiSel.length < 2){
    dd.classList.remove('open'); return;
  }
  const _hasGroup = edMultiSel.some(i => edLayers[i]?.groupId);
  dd.innerHTML = `
    <button class="ed-dropdown-item" id="_ms-group">⊞ Agrupar</button>
    ${_hasGroup ? `<button class="ed-dropdown-item" id="_ms-ungroup">⊟ Desagrupar</button>` : ''}`;
  $('_ms-group')?.addEventListener('click', ()=>{ dd.classList.remove('open'); edGroupSelected(); });
  $('_ms-ungroup')?.addEventListener('click', ()=>{
    dd.classList.remove('open');
    edUngroupSelected();
  });
  const btn = $('edMultiSelBtn');
  if(btn){
    const r = btn.getBoundingClientRect();
    dd.style.top  = r.bottom + 'px';
    dd.style.right = (window.innerWidth - r.right) + 'px';
    dd.style.left  = 'auto';
  }
  dd.classList.add('open');
}

// Recalcula edMultiBbox en espacio LOCAL del grupo (desrotado por edMultiGroupRot).
// Es el ÚNICO sitio que escribe en edMultiBbox.
// Llamar: al confirmar rubber band, al soltar rotate, al soltar resize, al soltar drag.
function _msRecalcBbox(){
  if(!edMultiSel.length){ edMultiBbox=null; return; }
  const pw=edPageW(), ph=edPageH();
  const gr = edMultiGroupRot * Math.PI / 180;
  const cg = Math.cos(-gr), sg = Math.sin(-gr);
  // Centroide de los centros de los objetos (excluir DrawLayer — siempre x=0.5,y=0.5)
  let pivX=0, pivY=0, n=0;
  for(const i of edMultiSel){
    const la=edLayers[i]; if(!la || la.type==='draw') continue;
    pivX+=la.x; pivY+=la.y; n++;
  }
  if(!n){ edMultiBbox=null; return; }
  pivX/=n; pivY/=n;
  // AABB de todos los vértices desrotados al espacio local del grupo
  // DrawLayer ocupa siempre toda la página (width=1, height=1) — excluirlo del bbox
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const i of edMultiSel){
    const la=edLayers[i]; if(!la || la.type==='draw') continue;
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

  // ── DIMMING GENERAL ──────────────────────────────────────────────────────────
  // Regla única: si hay cualquier modo de edición activo, todo se dimea al 50%
  // excepto el objeto que se está editando activamente.
  const _panel = $('edOptionsPanel');
  const _panelOpen = _panel?.classList.contains('open');
  const _panelMode = _panel?.dataset.mode || '';

  const _editingDraw  = ['draw','eraser','fill'].includes(edActiveTool) &&
    (_panelOpen || $('edDrawBar')?.classList.contains('visible'));
  const _editingShape = (_panelOpen && (_panelMode==='shape' || _panelMode==='line'))
    || !!_edShapePreview || !!_edLineLayer
    || $('edShapeBar')?.classList.contains('visible');
  const _editingProps = _panelOpen && _panelMode === 'props' && edSelectedIdx >= 0;
  // También hay edición activa cuando se está manipulando un objeto (drag/resize/rotate/tail)
  // aunque el panel no esté abierto — garantiza el dimming durante el desplazamiento
  const _manipulating = edSelectedIdx >= 0 &&
    (edIsDragging || edIsResizing || edIsRotating || edIsTailDragging);
  // Cuentagotas activo: todo al 100% para ver bien los colores
  const _anyEditing = !window._edEyedropActive &&
    (_editingDraw || _editingShape || _editingProps || _manipulating);

  // Función que decide si una capa concreta debe dimearse
  const _isDimmed = (l, i) => {
    if (!_anyEditing) return false;
    if (_editingDraw) {
      // En modo dibujo libre: solo el DrawLayer activo queda al 100%
      return l.type !== 'draw';
    }
    // En cualquier otro modo: dimear todo excepto el objeto seleccionado/en edición
    if (i === edSelectedIdx) return false;
    if (l === _edShapePreview || l === _edLineLayer) return false;
    return true;
  };

  // Renderizar en orden del array: imagen, stroke y draw en su posición relativa.
  // Textos/bocadillos siempre al final (encima de todo).
  edLayers.forEach((l,i)=>{
    if(l.type==='text'||l.type==='bubble') return; // los textos se dibujan después
    if(_editingDraw && l.type==='draw') return; // en modo draw, el draw va al final
    const dimFactor = _isDimmed(l, i) ? 0.5 : 1;
    if(l.type==='image'){
      const _orig = l.opacity; l.opacity = (l.opacity ?? 1) * dimFactor;
      l.draw(edCtx, edCanvas);
      l.opacity = _orig;
    } else if(l.type==='draw'){
      edCtx.globalAlpha = (l.opacity ?? 1) * dimFactor;
      l.draw(edCtx);
      edCtx.globalAlpha = 1;
    } else if(l.type==='stroke'){
      edCtx.globalAlpha = (l.opacity ?? 1) * dimFactor;
      l.draw(edCtx);
      edCtx.globalAlpha = 1;
    } else if(l.type==='shape' || l.type==='line'){
      edCtx.globalAlpha = (l.opacity ?? 1) * dimFactor;
      l.draw(edCtx);
      edCtx.globalAlpha = 1;
    }
  });
  // Textos/bocadillos: aplicar dimming individual por capa
  _textLayers.forEach(l=>{
    const i = edLayers.indexOf(l);
    const dimFactor = _isDimmed(l, i) ? 0.5 : 1;
    edCtx.globalAlpha = _textGroupAlpha * dimFactor;
    l.draw(edCtx, edCanvas);
  });
  edCtx.globalAlpha = 1;
  // En modo draw: DrawLayer al final, encima de shapes/textos dimeados
  if(_editingDraw){
    const _dl = edLayers.find(l => l.type==='draw');
    if(_dl) _dl.draw(edCtx);
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
  // ── Reglas (T29): solo visibles en el editor, encima de todo ──
  _edRulesDraw(edCtx);
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

  // StrokeLayer congelado: mostrar pequeño marcador en esquina superior derecha
  if(la.type==='stroke' && la._frozenLine){
    const _scx=edMarginX()+la.x*pw, _scy=edMarginY()+la.y*ph;
    const _sw=la.width*pw, _sh=la.height*ph;
    const _srot=(la.rotation||0)*Math.PI/180;
    edCtx.save();
    edCtx.translate(_scx,_scy); edCtx.rotate(_srot);
    // Icono ✦ en esquina superior derecha
    edCtx.font=`bold ${Math.round(14/z)}px sans-serif`;
    edCtx.fillStyle='rgba(255,200,0,0.9)';
    edCtx.textAlign='center'; edCtx.textBaseline='middle';
    edCtx.fillText('✦', _sw/2-8/z, -_sh/2+8/z);
    edCtx.restore();
  }

  // LineLayer: guía de selección discontinua azul (solo si no hay radios aplicados)
  if(la.type==='line'){
    const _cr=la.cornerRadii||{};
    const _hasR=Object.keys(_cr).some(k=>(_cr[k]||0)>0);
    if(!_hasR){
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
        edCtx.globalAlpha=1;
        edCtx.beginPath();edCtx.arc(cpx,cpy,hr,0,Math.PI*2);
        edCtx.fillStyle='#e63030';edCtx.fill();
        edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
      });
    }
  }
  }
  // Handles vértices explosión: solo visibles editando (panel abierto)
  if(la.type==='bubble' && la.style==='explosion' &&
     ($('edOptionsPanel')?.dataset.mode==='bubble' || $('edOptionsPanel')?.dataset.mode==='props')){
    const _HR=6/z;
    la._initExplosionRadii();
    const _pw=edPageW(),_ph=edPageH();
    const _w=la.width*_pw, _h=la.height*_ph;
    la.explosionRadii.forEach((v,i)=>{
      const cpx=edMarginX()+(la.x+v.ox*_w/2/_pw)*_pw;
      const cpy=edMarginY()+(la.y+v.oy*_h/2/_ph)*_ph;
      const isPeak = i%2===0;
      edCtx.beginPath();edCtx.arc(cpx,cpy,_HR,0,Math.PI*2);
      edCtx.fillStyle=isPeak?'#ff6600':'#1a8cff';edCtx.fill();
      edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
    });
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
        const _blink2=isAct?(Math.sin(Date.now()/200)*0.25+0.25):1; // parpadeo 0..0.5
        edCtx.globalAlpha=_blink2;
        edCtx.beginPath();edCtx.arc(cpx2,cpy2,hr,0,Math.PI*2);
        edCtx.fillStyle=isAct?'#e67e22':'#2ecc71';edCtx.fill();
        edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
        edCtx.globalAlpha=1;
      });
      // Animar parpadeo del nodo activo
      if(window._edCurveVertIdx >= 0) requestAnimationFrame(()=>{ if(window._edCurveVertIdx>=0) edRedraw(); });
    }
  }
  // Handles vértices de LineLayer seleccionado (panel abierto)
  if(la.type==='line' && la.points.length>=2 && ($('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible'))){
    const rot=(la.rotation||0)*Math.PI/180;
    const cos=Math.cos(rot),sin=Math.sin(rot);
    const cx=edMarginX()+la.x*pw, cy=edMarginY()+la.y*ph;
    const n2=la.points.length;
    const cr2=la.cornerRadii||{};
    const _cvm=_edCurveModeActive();
    // Helper: radio efectivo en espacio local (px), con escala aplicada
    const _er2 = i => {
      const r=cr2[i]||0; if(!r) return 0;
      const prev=la.points[(i-1+n2)%n2], cur=la.points[i], next=la.points[(i+1)%n2];
      const d1=Math.hypot((cur.x-prev.x)*pw,(cur.y-prev.y)*ph);
      const d2=Math.hypot((next.x-cur.x)*pw,(next.y-cur.y)*ph);
      return Math.max(0,Math.min(r,Math.min(d1,d2)-2));
    };
    la.points.forEach((p,i)=>{
      const r=_er2(i);
      let lpx=p.x*pw, lpy=p.y*ph;
      if(r>0){
        // Q(t=0.5) = (p1 + 2*cur + p2) / 4
        const prev=la.points[(i-1+n2)%n2], cur=la.points[i], next=la.points[(i+1)%n2];
        const d1=Math.hypot((cur.x-prev.x)*pw,(cur.y-prev.y)*ph);
        const d2=Math.hypot((next.x-cur.x)*pw,(next.y-cur.y)*ph);
        const rr=Math.max(0,Math.min(r,Math.min(d1/2,d2/2)));
        const v1x=d1>0?(cur.x-prev.x)*pw/d1:0, v1y=d1>0?(cur.y-prev.y)*ph/d1:0;
        const v2x=d2>0?(next.x-cur.x)*pw/d2:0, v2y=d2>0?(next.y-cur.y)*ph/d2:0;
        const p1x=cur.x*pw-v1x*rr, p1y=cur.y*ph-v1y*rr;
        const p2x=cur.x*pw+v2x*rr, p2y=cur.y*ph+v2y*rr;
        lpx=(p1x+2*cur.x*pw+p2x)/4;
        lpy=(p1y+2*cur.y*ph+p2y)/4;
      }
      const cpx=cx + lpx*cos - lpy*sin;
      const cpy=cy + lpx*sin + lpy*cos;
      const isActive=window._edCurveVertIdx===i;
      const _blink3=isActive?(Math.sin(Date.now()/200)*0.25+0.25):1; // parpadeo 0..0.5
      edCtx.globalAlpha=_blink3;
      edCtx.beginPath();edCtx.arc(cpx,cpy,hr,0,Math.PI*2);
      edCtx.fillStyle=isActive?'#e67e22':(_cvm?'#2ecc71':'#e63030');edCtx.fill();
      edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
      edCtx.globalAlpha=1;
    });
    // Si hay un nodo activo, continuar animando el parpadeo
    if(window._edCurveVertIdx >= 0) requestAnimationFrame(()=>{ if(window._edCurveVertIdx>=0) edRedraw(); });
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
  edConfirm('¿Eliminar esta hoja?', ()=>{
    edPages.splice(edCurrentPage,1);
    edLoadPage(Math.min(edCurrentPage,edPages.length-1));
  });
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

// Regenera solo el thumb de la hoja actual en el nav (sin reconstruir todo el nav)
function _edRefreshCurrentPageThumb(){
  const wrap=$('ddNavPages'); if(!wrap) return;
  const btns=wrap.querySelectorAll('.ed-nav-page-btn');
  const btn=btns[edCurrentPage]; if(!btn) return;
  const thumb=btn.querySelector('canvas'); if(!thumb) return;
  const page=edPages[edCurrentPage]; if(!page) return;
  _edRenderPageThumb(thumb, page, edCurrentPage);
}

function _edRenderPageThumb(canvas, page, pageIdx){
  const ctx=canvas.getContext('2d');
  const tw=canvas.width, th=canvas.height;
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,tw,th);
  if(!page||!page.layers) return;
  // Mismo sistema que edExportPagePNG: canvas del tamano exacto de la pagina
  // con setTransform para que draw() de cada capa coloque en coords correctas
  const _savedOrient=edOrientation;
  const _savedPage=edCurrentPage;
  const _po=page.orientation||edOrientation;
  edOrientation=_po;
  const _pi=edPages.indexOf(page); if(_pi>=0) edCurrentPage=_pi;
  const pw=edPageW(), ph=edPageH();
  const mx=edMarginX(), my=edMarginY();
  const off=document.createElement('canvas');
  off.width=pw; off.height=ph;
  const offCtx=off.getContext('2d');
  offCtx.fillStyle='#ffffff'; offCtx.fillRect(0,0,pw,ph);
  // Mismo transform que edExportPagePNG: traslada origen al borde de la pagina
  offCtx.setTransform(1,0,0,1,-mx,-my);
  const _textLayers=page.layers.filter(l=>l.type==='text'||l.type==='bubble');
  const _textAlpha=page.textLayerOpacity??1;
  page.layers.forEach(l=>{
    if(!l||l.type==='text'||l.type==='bubble') return;
    if(l.type==='image')       l.draw(offCtx,off);
    else if(l.type==='draw')   l.draw(offCtx);
    else if(l.type==='stroke'){ offCtx.globalAlpha=l.opacity??1; l.draw(offCtx); offCtx.globalAlpha=1; }
    else if(l.type==='shape'||l.type==='line'){ offCtx.globalAlpha=l.opacity??1; l.draw(offCtx); offCtx.globalAlpha=1; }
  });
  offCtx.globalAlpha=_textAlpha;
  _textLayers.forEach(l=>l.draw(offCtx,off));
  offCtx.globalAlpha=1;
  edOrientation=_savedOrient;
  edCurrentPage=_savedPage;
  // Escalar la pagina completa al tamano de la miniatura
  ctx.drawImage(off,0,0,pw,ph,0,0,tw,th);
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
  } else if(la.type === 'shape'){
    copy = new ShapeLayer(la.shape, la.x + 0.02, la.y + 0.02, la.width, la.height);
    copy.color = la.color; copy.fillColor = la.fillColor;
    copy.lineWidth = la.lineWidth; copy.opacity = la.opacity ?? 1;
    copy.rotation = la.rotation || 0;
    if(la.cornerRadius)  copy.cornerRadius  = la.cornerRadius;
    if(la.cornerRadii)   copy.cornerRadii   = Array.isArray(la.cornerRadii) ? [...la.cornerRadii] : {...la.cornerRadii};
  } else if(la.type === 'line'){
    copy = new LineLayer();
    copy.points   = la.points.map(p => ({...p, x: p.x + 0.02, y: p.y + 0.02}));
    copy.color    = la.color; copy.fillColor = la.fillColor || 'none';
    copy.lineWidth = la.lineWidth; copy.closed = la.closed;
    copy.opacity  = la.opacity ?? 1; copy.rotation = la.rotation || 0;
    if(la.cornerRadii) copy.cornerRadii = Array.isArray(la.cornerRadii) ? [...la.cornerRadii] : {...la.cornerRadii};
    copy._updateBbox();
  } else return;
  // Insertar justo encima del original
  edLayers.splice(edSelectedIdx + 1, 0, copy);
  edSelectedIdx = edSelectedIdx + 1;
  edPushHistory(); edRedraw();
  edToast('Objeto duplicado');
}
/* ── T14: Simetría horizontal (flip respecto al eje vertical del objeto) ── */
function edMirrorSelected(){
  // En modo draw sin selección: reflejar el DrawLayer activo de la hoja
  if(edSelectedIdx < 0){
    if(['draw','eraser','fill'].includes(edActiveTool)){
      const page = edPages[edCurrentPage]; if(!page) return;
      const la = page.layers.find(l => l.type==='draw'); if(!la) return;
      _edDrawPushHistory(); // para que ↩ del panel draw funcione
      edPushHistory();      // para que ↩ global también funcione
      // Calcular eje X en el centro del bbox del contenido pintado
      const bb = StrokeLayer._boundingBox(la._canvas);
      const axisPx = bb ? (bb.x + bb.w / 2) : (edMarginX() + edPageW() / 2);
      const tmp = document.createElement('canvas');
      tmp.width  = ED_CANVAS_W;
      tmp.height = ED_CANVAS_H;
      const tctx = tmp.getContext('2d');
      tctx.translate(axisPx * 2, 0);
      tctx.scale(-1, 1);
      tctx.drawImage(la._canvas, 0, 0);
      la._ctx.clearRect(0, 0, ED_CANVAS_W, ED_CANVAS_H);
      la._ctx.drawImage(tmp, 0, 0);
      edRedraw();
      edToast('Dibujo reflejado');
    }
    return;
  }
  if(edSelectedIdx >= edLayers.length) return;
  const la = edLayers[edSelectedIdx];
  edPushHistory();

  if(la.type === 'image'){
    // Crear canvas offscreen con el bitmap reflejado
    const img = la.img;
    const tmp = document.createElement('canvas');
    tmp.width  = img.naturalWidth  || img.width;
    tmp.height = img.naturalHeight || img.height;
    const tctx = tmp.getContext('2d');
    tctx.translate(tmp.width, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(img, 0, 0);
    const mirroredImg = new Image();
    mirroredImg.onload = () => {
      la.img = mirroredImg;
      // Invertir rotación respecto a eje vertical: rotation → -rotation
      la.rotation = -(la.rotation || 0);
      edRedraw();
    };
    mirroredImg.src = tmp.toDataURL();
    return; // el resto se hace en onload
  }

  if(la.type === 'stroke'){
    // El _canvas del stroke cubre solo el bbox del trazo
    const c = document.createElement('canvas');
    c.width  = la._canvas.width;
    c.height = la._canvas.height;
    const cctx = c.getContext('2d');
    cctx.translate(c.width, 0);
    cctx.scale(-1, 1);
    cctx.drawImage(la._canvas, 0, 0);
    la._canvas = c;
    la._ctx    = c.getContext('2d');
    la.rotation = -(la.rotation || 0);
  }

  else if(la.type === 'draw'){
    // Reflejar respecto al eje vertical del centro del contenido pintado
    const bb2 = StrokeLayer._boundingBox(la._canvas);
    const axisPx = bb2 ? (bb2.x + bb2.w / 2) : (edMarginX() + edPageW() / 2);
    const tmp = document.createElement('canvas');
    tmp.width  = ED_CANVAS_W;
    tmp.height = ED_CANVAS_H;
    const tctx = tmp.getContext('2d');
    tctx.translate(axisPx * 2, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(la._canvas, 0, 0);
    la._ctx.clearRect(0, 0, ED_CANVAS_W, ED_CANVAS_H);
    la._ctx.drawImage(tmp, 0, 0);
  }

  else if(la.type === 'shape'){
    // Invertir rotación; si tiene cornerRadii por vértice, intercambiar TL↔TR y BL↔BR
    la.rotation = -(la.rotation || 0);
    if(la.cornerRadii && la.cornerRadii.length === 4){
      // [TL, TR, BR, BL] → [TR, TL, BL, BR]
      const [tl,tr,br,bl] = la.cornerRadii;
      la.cornerRadii = [tr, tl, bl, br];
    }
  }

  else if(la.type === 'line'){
    // Puntos en espacio local centrado en (0,0) — invertir x
    la.points = la.points.map(p => ({ ...p, x: -p.x,
      cx1: p.cx1 !== undefined ? -p.cx1 : undefined,
      cy1: p.cy1,
      cx2: p.cx2 !== undefined ? -p.cx2 : undefined,
      cy2: p.cy2
    }));
    la.rotation = -(la.rotation || 0);
    if(typeof la._updateBbox === 'function') la._updateBbox();
  }

  else if(la.type === 'text' || la.type === 'bubble'){
    // Invertir rotación; para bocadillos también espejar la cola
    la.rotation = -(la.rotation || 0);
    if(la.type === 'bubble'){
      if(la.tailStart) la.tailStart = { x: 1 - la.tailStart.x, y: la.tailStart.y };
      if(la.tailEnd)   la.tailEnd   = { x: 1 - la.tailEnd.x,   y: la.tailEnd.y   };
      if(la.tailStarts) la.tailStarts = la.tailStarts.map(s=>({ x: 1-s.x, y: s.y }));
      if(la.tailEnds)   la.tailEnds   = la.tailEnds.map(e=>({ x: 1-e.x, y: e.y }));
    }
  }

  edRedraw();
  edToast('Objeto reflejado');
}

function edDeleteSelected(){
  if(edSelectedIdx<0){edToast('Selecciona un objeto');return;}
  const _delType=edLayers[edSelectedIdx]?.type;
  edLayers.splice(edSelectedIdx,1);edSelectedIdx=-1;
  // Si era shape/line con barra flotante activa, limpiar y desbloquear
  if(_delType==='shape'||_delType==='line'){
    edShapeBarHide();
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
  // En modo draw, el pinch mueve la cámara (no el dibujo)
  _edDrawPinch = null;
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
    // ── Modo cámara: pan + zoom ──
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
  // _edDrawPinch ya no se usa (pinch en modo draw mueve la cámara)
  _edDrawPinch = null;
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

function _edDrawApplyPinchTransform(dl, dp){
  // Aplica la transformación (translate + scale desde el centro del pinch) al _canvas del DrawLayer.
  // Patrón estándar: copiar snapshot transformado sobre un canvas limpio.
  const tmp = document.createElement('canvas');
  tmp.width  = ED_CANVAS_W;
  tmp.height = ED_CANVAS_H;
  const ctx = tmp.getContext('2d');
  // Punto de pivote = centro del pinch en workspace
  const px = dp.wsCenterX, py = dp.wsCenterY;
  ctx.save();
  ctx.translate(px + dp.tx, py + dp.ty);
  ctx.scale(dp.scale, dp.scale);
  ctx.translate(-px, -py);
  ctx.drawImage(dp.snap, 0, 0);
  ctx.restore();
  // Reemplazar el contenido del DrawLayer
  dl.clear();
  dl._ctx.drawImage(tmp, 0, 0);
  // Guardar en historial de dibujo
  edSaveDrawData();
  edRedraw();
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

function edHideGearIcon(){ const b=document.getElementById('edGearIcon');if(b)b.remove(); }
function edHideContextMenu(){}


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

// ── Hit test para doble tap en líneas vectoriales ──
// Devuelve {type:'node', idx} si el punto (nx,ny) cae sobre el nodo idx
// Devuelve {type:'seg',  idx} si cae sobre el segmento idx→idx+1
// Devuelve null si no hay hit
// nx, ny: coordenadas normalizadas de página (fracción 0..1)
function _edLineHitTest(la, nx, ny, isTouch){
  if(!la || la.type!=='line' || la.points.length < 2) return null;
  const pw=edPageW(), ph=edPageH(), z=edCamera.z;
  const rot=(la.rotation||0)*Math.PI/180;
  const cos=Math.cos(rot), sin=Math.sin(rot);
  const n=la.points.length;
  const cr=la.cornerRadii||{};
  const hitNode = isTouch ? 28 : 18;   // radio hit nodo en píxeles de pantalla
  const hitSeg  = isTouch ? 18 : 10;   // distancia hit segmento en píxeles de pantalla

  // ── Posición visual de cada nodo (igual que _handlePos en edOnStart) ──
  const nodePos=(i)=>{
    const p=la.points[i];
    const r=cr[i]||0;
    let lpx=p.x*pw, lpy=p.y*ph;
    if(r>0){
      const prev=la.points[(i-1+n)%n], cur=la.points[i], next=la.points[(i+1)%n];
      const d1=Math.hypot((cur.x-prev.x)*pw,(cur.y-prev.y)*ph);
      const d2=Math.hypot((next.x-cur.x)*pw,(next.y-cur.y)*ph);
      const rr=Math.max(0,Math.min(r,Math.min(d1/2,d2/2)));
      const v1x=d1>0?(cur.x-prev.x)*pw/d1:0, v1y=d1>0?(cur.y-prev.y)*ph/d1:0;
      const v2x=d2>0?(next.x-cur.x)*pw/d2:0, v2y=d2>0?(next.y-cur.y)*ph/d2:0;
      const p1x=cur.x*pw-v1x*rr, p1y=cur.y*ph-v1y*rr;
      const p2x=cur.x*pw+v2x*rr, p2y=cur.y*ph+v2y*rr;
      lpx=(p1x+2*cur.x*pw+p2x)/4;
      lpy=(p1y+2*cur.y*ph+p2y)/4;
    }
    return {
      ax: la.x+(lpx*cos-lpy*sin)/pw,
      ay: la.y+(lpx*sin+lpy*cos)/ph
    };
  };

  // 1. Comprobar nodos primero (prioridad sobre segmentos)
  for(let i=0;i<n;i++){
    const {ax,ay}=nodePos(i);
    if(Math.hypot((nx-ax)*pw,(ny-ay)*ph)*z < hitNode){
      return {type:'node', idx:i};
    }
  }

  // 2. Comprobar segmentos: distancia perpendicular punto→segmento
  const absP=la.absPoints(); // coords absolutas reales de cada punto
  const segCount = la.closed ? n : n-1;
  for(let i=0;i<segCount;i++){
    const j=(i+1)%n;
    const ax=absP[i].x, ay=absP[i].y;
    const bx=absP[j].x, by=absP[j].y;
    // Vectores en píxeles de página (sin cámara, para la distancia)
    const abxPx=(bx-ax)*pw, abyPx=(by-ay)*ph;
    const apxPx=(nx-ax)*pw, apyPx=(ny-ay)*ph;
    const abLen2=abxPx*abxPx+abyPx*abyPx;
    if(abLen2 < 0.001) continue; // segmento degenerado
    // Parámetro t de la proyección del punto sobre el segmento [0,1]
    const t=Math.max(0,Math.min(1,(apxPx*abxPx+apyPx*abyPx)/abLen2));
    // Punto más cercano del segmento al toque
    const closestX=apxPx-t*abxPx;
    const closestY=apyPx-t*abyPx;
    const dist=Math.hypot(closestX,closestY)*z;
    if(dist < hitSeg){
      return {type:'seg', idx:i};
    }
  }

  return null;
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

  // ── REGLAS: si hay modo mover activo desde el panel, absorber el primer toque ──
  if(_edRuleDrag && _edRuleDrag.part === 'line' && _edRuleDrag.offX === undefined) {
    // El movimiento real empieza en edOnMove; aquí solo bloqueamos selección de objetos
    return;
  }

  // ── REGLAS: hit-test sobre arrastradores y líneas ──
  if(edRules.length || window._edRuleMoveReady) {
    const _rc = edCoords(e);
    // Modo "mover regla" activo tras pulsar "Mover" en el panel
    if(window._edRuleMoveReady) {
      const rid = window._edRuleMoveReady;
      const _rmv = edRules.find(r => r.id === rid);
      if(_rmv) {
        window._edRuleMoveReady = null;
        _edRuleDrag = {
          ruleId: rid, part: 'line',
          offX: _rc.px - _rmv.x1, offY: _rc.py - _rmv.y1,
          dx: _rmv.x2 - _rmv.x1,  dy:  _rmv.y2 - _rmv.y1
        };
        edRedraw(); return;
      }
      window._edRuleMoveReady = null;
    }
    const _rHit = _edRulesHit(_rc.px, _rc.py, e.pointerType === 'touch');
    if(_rHit) {
      e.stopPropagation();
      const _r = edRules.find(r => r.id === _rHit.ruleId);
      if(!_r) return;

      const _isHandleHit = _rHit.part === 'a' || _rHit.part === 'b';

      if(_isHandleHit) {
        const _now = Date.now();
        const _isDouble = (e.detail >= 2) ||
          (window._edRuleLastTap && (_now - window._edRuleLastTap < 350) &&
           window._edRuleLastTapId === _rHit.ruleId);

        if(_isDouble) {
          // Doble tap/clic confirmado → cancelar drag pendiente y abrir popover
          window._edRuleLastTap = 0;
          clearTimeout(window._edRuleTapTimer);
          window._edRuleTapTimer = null;
          _edRuleDrag = null;
          const _hitWx = _rHit.part === 'a' ? _r.x1 : _r.x2;
          const _hitWy = _rHit.part === 'a' ? _r.y1 : _r.y2;
          _edRulesOpenPanel(_rHit.ruleId, _rHit.part, _hitWx, _hitWy);
          return;
        }

        // Primer tap/clic: guardar timestamp y esperar 300ms antes de iniciar drag
        window._edRuleLastTap = _now;
        window._edRuleLastTapId = _rHit.ruleId;
        const _snapId = _rHit.ruleId, _snapPart = _rHit.part;
        const _snapOffX = _rc.px - _r.x1, _snapOffY = _rc.py - _r.y1;
        const _snapDx = _r.x2 - _r.x1, _snapDy = _r.y2 - _r.y1;
        clearTimeout(window._edRuleTapTimer);
        window._edRuleTapTimer = setTimeout(() => {
          window._edRuleLastTap = 0;
          window._edRuleTapTimer = null;
          _edRuleDrag = { ruleId: _snapId, part: _snapPart,
            offX: _snapOffX, offY: _snapOffY, dx: _snapDx, dy: _snapDy };
          edRedraw();
        }, 300);
        return;
      }

      // Línea: iniciar drag inmediatamente (no necesita doble tap)
      _edRuleDrag = {
        ruleId: _rHit.ruleId, part: _rHit.part,
        offX: _rc.px - _r.x1, offY: _rc.py - _r.y1,
        dx: _r.x2 - _r.x1, dy: _r.y2 - _r.y1
      };
      edRedraw();
      return;
    }
  }

  // ── MODO V⟺C: selección de vértice individual (barra flotante O submenú) ──
  if(_edCurveModeActive&&_edCurveModeActive()){
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    if(la&&(la.type==='line'||la.type==='shape')){
      const c2=edCoords(e);
      const pw2=edPageW(),ph2=edPageH();
      const _vcTouch = e.pointerType==='touch';
      const _vcHitR = _vcTouch ? 28 : 18;
      // Intentar seleccionar vértice de línea
      if(la.type==='line'&&la.points.length>=2){
        const rot2=(la.rotation||0)*Math.PI/180;
        const cos2=Math.cos(rot2),sin2=Math.sin(rot2);
        for(let i=0;i<la.points.length;i++){
          const p=la.points[i];
          const lpx=p.x*pw2,lpy=p.y*ph2;
          const ax2=la.x+(lpx*cos2-lpy*sin2)/pw2;
          const ay2=la.y+(lpx*sin2+lpy*cos2)/ph2;
          if(Math.hypot((c2.nx-ax2)*pw2,(c2.ny-ay2)*ph2)*edCamera.z<_vcHitR){
            window._edCurveVertIdx=i;
            if(!la.cornerRadii)la.cornerRadii={};
            const existing=la.cornerRadii[i]||0;
            window._edCurveRadius=existing;
            // Actualizar sliders (barra flotante Y submenú)
            const _sl=$('esb-slider-input');
            if(_sl) _sl.value=existing;
            const _slP=$('op-line-curve-r'); if(_slP){_slP.value=existing;}
            const _slPn=$('op-line-curve-rnum'); if(_slPn){_slPn.value=existing;}
            edRedraw();
            // Tap: selecciona vértice. Tap+arrastrar: selecciona y mueve.
            // El drag se activa inmediatamente — edOnMove lo ejecutará si hay movimiento.
            edIsTailDragging=true; edTailPointType='linevertex'; edTailVoiceIdx=i;
            return;
          }
        }
      }
      // Intentar seleccionar vértice de rect (individual, igual que barra flotante)
      if(la.type==='shape'&&la.shape==='rect'){
        const rot2=(la.rotation||0)*Math.PI/180;
        const cos2=Math.cos(rot2),sin2=Math.sin(rot2);
        const hw=la.width*pw2/2,hh=la.height*ph2/2;
        const corners=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
        for(let ci2=0;ci2<4;ci2++){
          const[lx,ly]=corners[ci2];
          const ax2=(la.x*pw2+lx*cos2-ly*sin2)/pw2;
          const ay2=(la.y*ph2+lx*sin2+ly*cos2)/ph2;
          if(Math.hypot((c2.nx-ax2)*pw2,(c2.ny-ay2)*ph2)*edCamera.z<_vcHitR){
            window._edCurveVertIdx=ci2;
            if(!la.cornerRadii)la.cornerRadii=[0,0,0,0];
            const existing=la.cornerRadii[ci2]||0;
            window._edCurveRadius=existing;
            // Actualizar sliders (barra flotante Y submenú)
            const _sl2=$('esb-slider-input');
            if(_sl2) _sl2.value=existing;
            const _slP2=$('op-shape-curve-r'); if(_slP2){_slP2.value=existing;}
            const _slP2n=$('op-shape-curve-rnum'); if(_slP2n){_slP2n.value=existing;}
            edRedraw();return;
          }
        }
      }
    }
    // En modo curva: si no se tocó ningún vértice curvable, permitir drag normal
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
    // Cancelar timer de draw/eraser pendiente — era un pinch
    if(window._edDrawTouchTimer){ clearTimeout(window._edDrawTouchTimer); window._edDrawTouchTimer = null; }
    // Con multiselección activa: cancelar drag en curso y activar pinch de grupo
    if(edActiveTool==='multiselect' && edMultiSel.length){
      edMultiDragging=false; edMultiDragOffs=[];
      edMultiResizing=false; edMultiRotating=false;
    }
    // Si estaba pintando, cancelar el trazo parcial sin guardarlo
    // IMPORTANTE: edPinchStart necesita capturar el estado actual (trazo en curso incluido)
    // antes de que _edDrawApplyHistory lo revierta. edPinchStart se llama justo después.
    if(edPainting){
      edPainting = false;
      // Resetear _lastX/_lastY del DrawLayer para que el siguiente trazo
      // arranque limpio (evita el bug del "solo un punto" post-pinch).
      const _dlReset = edPages[edCurrentPage]?.layers.find(l => l.type==='draw');
      if(_dlReset){ _dlReset._lastX = 0; _dlReset._lastY = 0; }
    }
    // Si se estaba añadiendo un punto de línea vectorial (táctil), cancelar el último punto
    // — el segundo dedo es un pinch, no un nodo nuevo (igual que el dibujo a mano)
    if(edActiveTool==='line' && _edLineLayer && _edLineLayer.points.length > 1){
      _edLineLayer.points.pop();
      _edLineLayer._updateBbox();
      edRedraw();
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
      // Clic fuera del canvas (UI, panel…)
      if(window._edGroupSilentTool !== undefined){
        // Modo grupo silencioso: restaurar sin tocar botón
        edActiveTool = window._edGroupSilentTool;
        delete window._edGroupSilentTool;
        edMultiSel=[]; edMultiBbox=null; edMultiGroupRot=0;
        edRedraw();
      } else if(edMultiSel.length){
        _edDeactivateMultiSel();
      }
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
              items: edMultiSel.map(i=>{
                const _l=edLayers[i];
                const _cr = _l.cornerRadii
                  ? (Array.isArray(_l.cornerRadii) ? [..._l.cornerRadii] : {..._l.cornerRadii})
                  : null;
                return {i, x:_l.x, y:_l.y, w:_l.width, h:_l.height,
                  _linePoints: _l.type==='line' ? _l.points.map(p=>({...p})) : null,
                  _cornerRadii: _cr};
              }),
              bb: {cx:bb.cx, cy:bb.cy, w:bb.w, h:bb.h},
              corner: p.c,
              sx: lxCur, sy: lyCur,
              groupRot: edMultiGroupRot,
              _curSx: 1, _curSy: 1,
            };
            return;
          }
        }
        // ── Hit dentro del bbox → drag o doble tap ──
        const lxD=(dcxPx*cg - dcyPx*sg)/pw;
        const lyD=(dcxPx*sg + dcyPx*cg)/ph;
        if(Math.abs(lxD)<=bb.w/2 && Math.abs(lyD)<=bb.h/2){
          // Doble tap dentro del bbox en modo grupo silencioso → panel del grupo
          if(window._edGroupSilentTool !== undefined){
            const _now2 = Date.now();
            const _isDbl = _now2 - _edLastTapTime < 350;
            _edLastTapTime = _now2; _edLastTapIdx = -999; // centinela grupo
            if(_isDbl){
              // Encontrar el miembro más cercano al toque
              const _hit = edMultiSel.find(i => edLayers[i]?.contains(c.nx, c.ny)) ?? edMultiSel[0];
              edSelectedIdx = _hit ?? -1;
              edMultiSel = []; edMultiBbox = null;
              edActiveTool = window._edGroupSilentTool;
              delete window._edGroupSilentTool;
              _edDrawLockUI(); _edPropsOverlayShow();
              edRenderOptionsPanel('props');
              edRedraw();
              return;
            }
          }
          edMultiDragging=true;
          edMultiDragOffs=edMultiSel.map(i=>({dx:c.nx-edLayers[i].x, dy:c.ny-edLayers[i].y}));
          return;
        }
      }
    }
    // Nada tocado fuera del bbox
    if(window._edGroupSilentTool !== undefined){
      // Modo grupo silencioso: tocar fuera → deseleccionar y restaurar herramienta
      edActiveTool = window._edGroupSilentTool;
      delete window._edGroupSilentTool;
      edMultiSel=[]; edMultiBbox=null; edMultiGroupRot=0;
      edSelectedIdx = -1;
      edRedraw();
    } else {
      // Herramienta multiselect normal: limpiar e iniciar nueva rubber band
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
    // En táctil: retardo para detectar si viene segundo dedo (pinch/zoom)
    if(e.pointerType === 'touch'){
      const _eSaved = e;
      clearTimeout(window._edDrawTouchTimer);
      window._edDrawTouchTimer = setTimeout(() => {
        if(!window._edActivePointers || window._edActivePointers.size > 1) return;
        if(!['draw','eraser'].includes(edActiveTool)) return;
        edStartPaint(_eSaved);
      }, 120);
      return;
    }
    // PC/ratón: inmediato
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
    // En táctil: retardo breve para detectar si viene un segundo dedo (pinch/zoom)
    // antes de registrar el toque como nodo nuevo — igual que el dibujo a mano
    if(e.pointerType === 'touch'){
      const _pid = e.pointerId;
      const _cx = c.nx, _cy = c.ny;
      clearTimeout(window._edLineTouchTimer);
      window._edLineTouchTimer = setTimeout(()=>{
        // Si ya hay 2+ dedos activos, era un pinch — no añadir nodo
        if(!window._edActivePointers || window._edActivePointers.size > 1) return;
        // Si la herramienta ya no está activa (cerrada durante el delay), salir
        if(edActiveTool !== 'line') return;
        _edLineAddPoint(_cx, _cy);
      }, 120);
      return;
    }
    // PC/ratón: inmediato
    _edLineAddPoint(c.nx, c.ny);
    return;
  }
  const c=edCoords(e);
  // Cola bocadillo — solo cuando el panel de propiedades del bocadillo está abierto
  const _bubblePanelOpen = $('edOptionsPanel')?.classList.contains('open') &&
                           $('edOptionsPanel')?.dataset.mode === 'props';
  if(edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='bubble' && _bubblePanelOpen){
    const la=edLayers[edSelectedIdx];
    // Helper: distancia en píxeles de pantalla entre punto normalizado y toque
    // Usa el mismo sistema que los handles de control (hitScreen táctil=28, PC=18)
    const _isTouch = e.pointerType === 'touch';
    const _hitR = _isTouch ? 28 : 18;
    const _pw0=edPageW(), _ph0=edPageH(), _z0=edCamera.z;
    const _nodeDist = (nx, ny, px, py) =>
      Math.hypot((nx-px)*_pw0, (ny-py)*_ph0) * _z0;

    // Handles cola pensamiento
    if(la.style==='thought' && la.tail){
      const bx=la.x+la.thoughtBig.x*la.width,   by=la.y+la.thoughtBig.y*la.height;
      const sx=la.x+la.thoughtSmall.x*la.width,  sy=la.y+la.thoughtSmall.y*la.height;
      if(_nodeDist(c.nx,c.ny,bx,by)<_hitR){edIsTailDragging=true;edTailPointType='thoughtBig';  return;}
      if(_nodeDist(c.nx,c.ny,sx,sy)<_hitR){edIsTailDragging=true;edTailPointType='thoughtSmall';return;}
    }
    for(const p of la.getTailControlPoints()){
      if(_nodeDist(c.nx,c.ny,p.x,p.y)<_hitR){edIsTailDragging=true;edTailPointType=p.type;edTailVoiceIdx=p.voice||0;return;}
    }
    // Vértices de explosión
    if(la.style==='explosion'){
      for(const p of la.getExplosionControlPoints()){
        if(_nodeDist(c.nx,c.ny,p.nx,p.ny)<_hitR){
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
      const _n=la.points.length;
      const _cr=la.cornerRadii||{};
      // Función que calcula la posición visual del handle (igual que en edDrawSel)
      const _handlePos=(i)=>{
        const p=la.points[i];
        const r=_cr[i]||0;
        let lpx=p.x*pw,lpy=p.y*ph;
        if(r>0){
          const prev=la.points[(i-1+_n)%_n],cur=la.points[i],next=la.points[(i+1)%_n];
          const d1=Math.hypot((cur.x-prev.x)*pw,(cur.y-prev.y)*ph);
          const d2=Math.hypot((next.x-cur.x)*pw,(next.y-cur.y)*ph);
          const rr=Math.max(0,Math.min(r,Math.min(d1/2,d2/2)));
          const v1x=d1>0?(cur.x-prev.x)*pw/d1:0,v1y=d1>0?(cur.y-prev.y)*ph/d1:0;
          const v2x=d2>0?(next.x-cur.x)*pw/d2:0,v2y=d2>0?(next.y-cur.y)*ph/d2:0;
          const p1x=cur.x*pw-v1x*rr,p1y=cur.y*ph-v1y*rr;
          const p2x=cur.x*pw+v2x*rr,p2y=cur.y*ph+v2y*rr;
          lpx=(p1x+2*cur.x*pw+p2x)/4;
          lpy=(p1y+2*cur.y*ph+p2y)/4;
        }
        return {lpx,lpy};
      };
      // ── Doble tap sobre nodo/segmento ──
      // Arquitectura: _edLineHitTest detecta qué se tocó.
      // Primer tap: guardar candidato. Segundo tap (<400ms, mismo hit): ejecutar acción.
      const _isTouch2 = e.pointerType==='touch' || edLastPointerIsTouch;
      const _lineHit = _edLineHitTest(la, c.nx, c.ny, _isTouch2);
      const _now2 = Date.now();
      if(_lineHit){
        const _sameHit = _edLastNodeTapIdx !== -1
          && _edLastNodeTapIdx === (_lineHit.type==='node' ? _lineHit.idx : 1000+_lineHit.idx)
          && (_now2 - _edLastNodeTapTime) < 400;
        if(_sameHit){
          // ── Doble tap confirmado ──
          _edLastNodeTapTime=0; _edLastNodeTapIdx=-1;
          if(_lineHit.type==='node'){
            // Eliminar nodo (mínimo 2 puntos)
            if(_n > 2){
              la.points.splice(_lineHit.idx,1);
              // Reindexar cornerRadii: los índices > eliminado bajan uno
              if(la.cornerRadii && Object.keys(la.cornerRadii).length){
                const newCR = {};
                for(const k in la.cornerRadii){
                  const ki = parseInt(k);
                  if(ki < _lineHit.idx) newCR[ki] = la.cornerRadii[k];
                  else if(ki > _lineHit.idx) newCR[ki-1] = la.cornerRadii[k];
                  // ki === idx: ese nodo desaparece, no se copia
                }
                la.cornerRadii = newCR;
              }
              la._updateBbox(); _edShapePushHistory(); edRedraw();
            }
            return;
          } else {
            // Añadir nodo en el centro del segmento
            const _absP2=la.absPoints();
            const _j2=(_lineHit.idx+1)%_n;
            const _a2=_absP2[_lineHit.idx], _b2=_absP2[_j2];
            const mx=(_a2.x+_b2.x)/2, my=(_a2.y+_b2.y)/2;
            // Convertir punto absoluto a local (igual que addAbsPoint pero sin push al final)
            const rotInv=-(la.rotation||0)*Math.PI/180;
            const dx=mx-la.x, dy=my-la.y;
            const lx=dx*Math.cos(rotInv)-dy*Math.sin(rotInv);
            const ly=dx*Math.sin(rotInv)+dy*Math.cos(rotInv);
            la.points.splice(_j2,0,{x:lx,y:ly});
            // Reindexar cornerRadii: los índices >= _j2 suben uno
            if(la.cornerRadii && Object.keys(la.cornerRadii).length){
              const newCR = {};
              for(const k in la.cornerRadii){
                const ki = parseInt(k);
                if(ki < _j2) newCR[ki] = la.cornerRadii[k];
                else newCR[ki+1] = la.cornerRadii[k];
              }
              la.cornerRadii = newCR;
            }
            la._updateBbox(); _edShapePushHistory(); edRedraw();
            return;
          }
        } else {
          // Primer tap: registrar candidato, continuar con drag normal si es nodo
          _edLastNodeTapTime=_now2;
          _edLastNodeTapIdx = _lineHit.type==='node' ? _lineHit.idx : 1000+_lineHit.idx;
          if(_lineHit.type==='node'){
            edIsTailDragging=true; edTailPointType='linevertex'; edTailVoiceIdx=_lineHit.idx;
          }
          // Para segmento: solo registrar, no iniciar drag
          return;
        }
      }
      // Sin hit en nodo ni segmento: limpiar candidato
      _edLastNodeTapTime=0; _edLastNodeTapIdx=-1;
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
          if(_la.type==='line'){
            edInitialSize._linePoints=_la.points.map(p=>({...p}));
            // Si tiene radios, sincronizar la.width/height con el bbox de puntos puros
            // para que el resize y edInitialSize partan de la misma base.
            const _cr2=_la.cornerRadii||{};
            if(Object.keys(_cr2).some(k=>(_cr2[k]||0)>0)){
              const _xs=_la.points.map(p=>p.x), _ys=_la.points.map(p=>p.y);
              const _ptW=Math.max(Math.max(..._xs)-Math.min(..._xs), 0.01);
              const _ptH=Math.max(Math.max(..._ys)-Math.min(..._ys), 0.01);
              // Forzar la.width/height al bbox de puntos para que el resize
              // calcule sw/sh correctamente desde el primer movimiento
              _la.width=_ptW; _la.height=_ptH;
              edInitialSize.width=_ptW; edInitialSize.height=_ptH;
              // Recalcular ancla con el nuevo tamaño
              edInitialSize.asp=_ptH/_ptW;
            }
          }
          // Guardar radios de curva para escalarlos con el resize
          if(_la.cornerRadii){
            if(Array.isArray(_la.cornerRadii)) edInitialSize._cornerRadii=[..._la.cornerRadii];
            else edInitialSize._cornerRadii={..._la.cornerRadii};
          } else { edInitialSize._cornerRadii=null; }
          return;
        }
      }
    }
  }
  // Si se está editando un shape/line (panel O barra flotante), bloquear selección de otros objetos
  // pero permitir drag del objeto actualmente seleccionado
  const _activePanel = $('edOptionsPanel');
  const _activeMode  = _activePanel?.dataset.mode;
  const _shapeBarOpen = $('edShapeBar')?.classList.contains('visible');
  const _editingVectorial = (_activeMode === 'shape' || _activeMode === 'line') || _shapeBarOpen || !!_edLineLayer;
  if(_editingVectorial && edSelectedIdx >= 0){
    // Comprobar si el click es sobre el objeto seleccionado → permitir drag
    const _la = edLayers[edSelectedIdx];
    if(_la && _la.contains(c.nx, c.ny)){
      edIsDragging=true;
      edDragOffX=c.nx-_la.x; edDragOffY=c.ny-_la.y;
      return;
    }
    // Click fuera del objeto seleccionado → ignorar (igual que imagen/texto/dibujo)
    edRedraw(); return;
  }
  // Si se está creando una línea nueva (_edLineLayer sin objeto seleccionado aún), bloquear selección
  if(_edLineLayer){ edRedraw(); return; }

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
    const _fla = edLayers[found];
    // Si el objeto pertenece a un grupo y la herramienta activa NO es multiselect,
    // activar multiselección completa internamente (con handles de escala/rotación)
    // pero sin cambiar el botón ni el cursor visible.
    if(_fla && _fla.groupId && edActiveTool !== 'multiselect'){
      const _gidxs = _edGroupMemberIdxs(_fla.groupId);
      if(_gidxs.length > 1){
        // Detectar doble tap/clic → abrir panel de propiedades del grupo
        const _now = Date.now();
        const _isDoubleTap = (found === _edLastTapIdx || _gidxs.includes(_edLastTapIdx)) &&
                             _now - _edLastTapTime < 350;
        if(_isDoubleTap){
          _edLastTapTime = 0; _edLastTapIdx = -1;
          // Abrir panel con el objeto tocado seleccionado
          // (el panel mostrará ⊟ Desagrupar porque tiene groupId)
          edSelectedIdx = found;
          edMultiSel = []; edMultiBbox = null;
          if(window._edGroupSilentTool !== undefined) delete window._edGroupSilentTool;
          edActiveTool = 'select';
          _edDrawLockUI(); _edPropsOverlayShow();
          edRenderOptionsPanel('props');
          edRedraw();
          return;
        }
        _edLastTapTime = _now; _edLastTapIdx = found;

        edMultiSel = _gidxs;
        edMultiGroupRot = 0;
        _msRecalcBbox();
        edSelectedIdx = -1;
        const _prevTool = edActiveTool;
        edActiveTool = 'multiselect';
        window._edGroupSilentTool = _prevTool;
        // Iniciar drag inmediatamente — igual que objetos normales, sin retardo
        edMultiDragging = true;
        edMultiDragOffs = _gidxs.map(i=>({dx:c.nx-edLayers[i].x, dy:c.ny-edLayers[i].y}));
        window._edMoved = false;
        edRedraw();
        return;
      }
    }
    edSelectedIdx = found;
    // Si es LineLayer con radios, actualizar bbox antes de interactuar
    const _fl=edLayers[found];
    if(_fl&&_fl.type==='line'){
      const _fcr=_fl.cornerRadii||{};
      if(Object.keys(_fcr).some(k=>(_fcr[k]||0)>0)) _fl._updateBbox();
    }
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
  // ── DRAG DE REGLA ──────────────────────────────────────────
  if(_edRuleDrag && _edRuleDrag.part !== 'move-pending') {
    e.preventDefault();
    const c = edCoords(e);
    const r = edRules.find(r => r.id === _edRuleDrag.ruleId);
    if(r) {
      // Si el offset aún no está inicializado (modo mover activado desde panel), inicializar ahora
      if(_edRuleDrag.offX === undefined) {
        _edRuleDrag.offX = c.px - r.x1;
        _edRuleDrag.offY = c.py - r.y1;
        _edRuleDrag.dx   = r.x2 - r.x1;
        _edRuleDrag.dy   = r.y2 - r.y1;
      }
      if(_edRuleDrag.part === 'a') {
        r.x1 = c.px; r.y1 = c.py;
      } else if(_edRuleDrag.part === 'b') {
        r.x2 = c.px; r.y2 = c.py;
      } else { // 'line' — mover todo
        r.x1 = c.px - _edRuleDrag.offX;
        r.y1 = c.py - _edRuleDrag.offY;
        r.x2 = r.x1 + _edRuleDrag.dx;
        r.y2 = r.y1 + _edRuleDrag.dy;
      }
      edRedraw();
    }
    return;
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
        // DrawLayer: transformar el bitmap con la escala, no width/height (siempre 1.0)
        if(la.type==='draw'){
          const _nw=Math.round(ED_CANVAS_W*Math.abs(_swL)), _nh=Math.round(ED_CANVAS_H*Math.abs(_shL));
          if(_nw>0&&_nh>0&&(_nw!==ED_CANVAS_W||_nh!==ED_CANVAS_H)){
            const tmp=document.createElement('canvas');
            tmp.width=ED_CANVAS_W; tmp.height=ED_CANVAS_H;
            const tctx=tmp.getContext('2d');
            tctx.drawImage(la._canvas, 0,0,ED_CANVAS_W,ED_CANVAS_H, 0,0,_nw,_nh);
            la._ctx.clearRect(0,0,ED_CANVAS_W,ED_CANVAS_H);
            la._ctx.drawImage(tmp,0,0);
          }
          return; // no tocar width/height
        }
        // Proyectar sx2/sy2 (espacio del AABB) al espacio local del objeto.
        // Un objeto rotado θ relativo al grupo tiene sus ejes locales a θ del AABB.
        // Fabric.js/Konva usan esta misma proyección para resize no proporcional.
        const _objRelRad = ((la.rotation||0) - (groupRot||0)) * Math.PI / 180;
        const _cos2 = Math.cos(_objRelRad)*Math.cos(_objRelRad);
        const _sin2 = Math.sin(_objRelRad)*Math.sin(_objRelRad);
        const _swL = Math.abs(_cos2*sx2 + _sin2*sy2);
        const _shL = Math.abs(_sin2*sx2 + _cos2*sy2);
        la.width  = Math.max(s.w * _swL, 0.02);
        la.height = Math.max(s.h * _shL, 0.02);
        // LineLayer: escalar también los puntos locales para que la forma se estire
        if(la.type==='line' && s._linePoints){
          la.points = s._linePoints.map(p=>({...p, x:p.x*_swL, y:p.y*_shL}));
          if(typeof la._updateBbox==='function') la._updateBbox();
        }
        // ShapeLayer/LineLayer: escalar cornerRadii
        if(s._cornerRadii && la.cornerRadii){
          const _scR = Math.min(_swL, _shL);
          const _maxR = Math.min(la.width*pw, la.height*ph) / 2;
          if(Array.isArray(la.cornerRadii)){
            la.cornerRadii = s._cornerRadii.map(r => r ? Math.min(r*_scR, _maxR) : 0);
          } else {
            const _ncr = {};
            for(const k in s._cornerRadii){ const r=s._cornerRadii[k]||0; _ncr[k]=r?Math.min(r*_scR,_maxR):0; }
            la.cornerRadii = _ncr;
          }
        }
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
        // DrawLayer: no rotar (su bitmap no se puede rotar en tiempo real)
        if(la.type==='draw') return;
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
  // Si estamos pintando activamente, el pinch ya terminó — limpiar flag y continuar trazo
  if(_edPinchHappened && edPainting) _edPinchHappened = false;
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
    // Escalar cornerRadii según resize no proporcional (estándar Figma/Illustrator)
    if(edInitialSize._cornerRadii && la.cornerRadii){
      const sw = la.width  / (edInitialSize.width  || 0.01);
      const sh = la.height / (edInitialSize.height || 0.01);
      const pw2=edPageW(), ph2=edPageH();
      // Factor de escala para radios: cada radio afecta a ambos ejes por igual
      // (es un arco circular, no elíptico). El radio máximo posible es
      // min(w,h)/2 del nuevo tamaño. Escalamos con min(sw,sh) y luego
      // recortamos al máximo — esto reproduce el comportamiento de Figma/Affinity.
      const _scR = Math.min(sw, sh);
      const _maxR = Math.min(la.width*pw2, la.height*ph2) / 2;
      if(Array.isArray(la.cornerRadii)){
        la.cornerRadii = edInitialSize._cornerRadii.map(r =>
          r ? Math.min((r||0)*_scR, _maxR) : 0
        );
      } else {
        const newCR = {};
        for(const k in edInitialSize._cornerRadii){
          const r = edInitialSize._cornerRadii[k]||0;
          newCR[k] = r ? Math.min(r*_scR, _maxR) : 0;
        }
        la.cornerRadii = newCR;
      }
    }
    // LineLayer: escalar los puntos locales según el nuevo width/height
    if(la.type==='line' && edInitialSize._linePoints){
      const sw = la.width  / (edInitialSize.width  || 0.01);
      const sh = la.height / (edInitialSize.height || 0.01);
      la.points = edInitialSize._linePoints.map(p=>({x: p.x*sw, y: p.y*sh}));
      // Recalcular width/height desde puntos reales (base para el próximo resize)
      const xs=la.points.map(p=>p.x), ys=la.points.map(p=>p.y);
      const _ptW=Math.max(Math.max(...xs)-Math.min(...xs), 0.01);
      const _ptH=Math.max(Math.max(...ys)-Math.min(...ys), 0.01);
      // Si tiene radios: actualizar bbox curvado; si no, usar bbox de puntos
      const _cr3=la.cornerRadii||{};
      if(Object.keys(_cr3).some(k=>(_cr3[k]||0)>0)){
        la.width=_ptW; la.height=_ptH; // base para próximo edInitialSize
        la._updateBbox(); // actualiza width/height al bbox curvado para el cuadro visual
      } else {
        la.width=_ptW; la.height=_ptH;
      }
    }
    edRedraw();
    edHideGearIcon();
    // No cerrar el panel mientras se arrastra — el dimming debe mantenerse activo
    return;
  }
  if(!edIsDragging||edSelectedIdx<0)return;
  const la=edLayers[edSelectedIdx];
  la.x = c.nx - edDragOffX;
  la.y = c.ny - edDragOffY;
  // ── Snap a reglas (T29) ──────────────────────────────────────────────────
  if(edRules.length) _edSnapToRules(la);
  window._edMoved = true;
  edRedraw();
  edHideGearIcon();
  // No cerrar el panel mientras se arrastra — el dimming debe mantenerse activo
}
function edOnEnd(e){
  // Limpiar drag de regla si estaba activo
  if(_edRuleDrag) {
    _edRuleDrag = null;
    edRedraw();
  }
  // Cancelar timer de doble tap de regla si el dedo se levantó sin segundo tap
  // (el timer mismo iniciará el drag diferido si procede)
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
        _edUpdateMultiSelPanel();
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
      if(edMultiSel.length >= 2) _edUpdateMultiSelPanel();
      edRedraw();
    }
    if(edMultiDragging||edMultiResizing||edMultiRotating){
      if(!_edPinchHappened && edMultiSel.length && window._edMoved) edPushHistory();
      if(edMultiSel.length) _msRecalcBbox();
    }
    edMultiDragging=false; edMultiResizing=false; edMultiRotating=false;
    edMultiDragOffs=[];
    const _wasMoved = window._edMoved;
    window._edMoved=false;
    // Modo grupo silencioso: nunca limpiar aquí — solo se limpia al tocar fuera (edOnStart)
    if(window._edGroupSilentTool !== undefined){
      if(_wasMoved) _msRecalcBbox();
      clearTimeout(window._edLongPress); window._edLongPressReady=false;
      if(!window._edActivePointers || window._edActivePointers.size === 0) _edPinchHappened = false;
      return;
    }
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
  if(edPainting && edActiveTool !== 'fill'){ edSaveDrawData(); _edOffsetFirstMove = false; }
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
    _edShapeHistIdxBase = 1;
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
let _edShapeHistory = [], _edShapeHistIdx = -1, _edShapeHistIdxBase = 0;

function _edShapePushHistory(){
  let la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
  if(!la){
    const _mode = $("edOptionsPanel")?.dataset.mode;
    if(_mode==="shape"||_mode==="line"||$("edShapeBar")?.classList.contains("visible")){
      la = edLayers.find(l => l.type==="shape"||l.type==="line")||null;
    }
  }
  if(!la) return;
  _edShapeHistory = _edShapeHistory.slice(0, _edShapeHistIdx + 1);
  _edShapeHistory.push(JSON.stringify(edSerLayer(la)));
  _edShapeHistIdx = _edShapeHistory.length - 1;
  _edShapeUpdateUndoRedoBtns();
  // Actualizar miniaturas con debounce (evitar regenerar en cada evento de slider)
  clearTimeout(window._edThumbRefreshTimer);
  window._edThumbRefreshTimer = setTimeout(()=>{
    // Regenerar todos los thumbs del nav (garantiza fidelidad con curvas V/C)
    edUpdateNavPages();
    // El overlay de capas se destruye al cerrar — si existe, está abierto
    if(typeof _lyRender==='function' && document.getElementById('edLayersOverlay')){
      _lyRender();
    }
  }, 300);
}

function _edShapeInitHistory(isNew){
  let la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
  if(!la){ la = edLayers.find(l => l.type==="shape"||l.type==="line")||null; }
  if(isNew && la){
    // Nuevo objeto: primer estado = null (sin objeto), segundo = objeto creado
    _edShapeHistory = [null, JSON.stringify(edSerLayer(la))];
    _edShapeHistIdx = 1;
  } else {
    _edShapeHistory = [la ? JSON.stringify(edSerLayer(la)) : null];
    _edShapeHistIdx = 0;
  }
  _edShapeHistIdxBase = _edShapeHistIdx;
  _edShapeUpdateUndoRedoBtns();
}

function _edShapeClearHistory(){
  _edShapeHistory = []; _edShapeHistIdx = -1; _edShapeHistIdxBase = 0;
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
  if(d.color        !== undefined) la.color       = d.color;
  if(d.fillColor    !== undefined) la.fillColor   = d.fillColor;
  if(d.lineWidth    !== undefined) la.lineWidth   = d.lineWidth;
  if(d.opacity      !== undefined) la.opacity     = d.opacity;
  if(d.rotation     !== undefined) la.rotation    = d.rotation;
  if(d.x            !== undefined){ la.x=d.x; la.y=d.y; la.width=d.width; la.height=d.height; }
  if(d.shape        !== undefined) la.shape       = d.shape;
  if(d.points       !== undefined) la.points      = d.points.slice();
  if(d.closed       !== undefined) la.closed      = d.closed;
  if(d.cornerRadius !== undefined) la.cornerRadius= d.cornerRadius;
  la.cornerRadii = d.cornerRadii
    ? (Array.isArray(d.cornerRadii) ? [...d.cornerRadii] : {...d.cornerRadii})
    : undefined;
  _esbSync();
  edRedraw();
}

function edShapeUndo(){
  if(_edShapeHistIdx <= _edShapeHistIdxBase){ edToast('Nada que deshacer'); return; }
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
  if(su) su.disabled = _edShapeHistIdx <= _edShapeHistIdxBase;
  if(sr) sr.disabled = _edShapeHistIdx >= _edShapeHistory.length - 1;
  // Botones panel line
  const lu=$('op-line-undo'), lr=$('op-line-redo');
  if(lu) lu.disabled = _edShapeHistIdx <= _edShapeHistIdxBase;
  if(lr) lr.disabled = _edShapeHistIdx >= _edShapeHistory.length - 1;
  // Barra flotante
  const bu=$('esb-undo'), br=$('esb-redo');
  if(bu) bu.style.opacity = _edShapeHistIdx <= _edShapeHistIdxBase ? '0.3' : '1';
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

  const wx = Math.round(edMarginX() + nx * edPageW());
  const wy = Math.round(edMarginY() + ny * edPageH());
  if(wx < 0 || wx >= W || wy < 0 || wy >= H) return;

  const mx = Math.round(edMarginX()), my = Math.round(edMarginY());
  const pw = Math.round(edPageW()),   ph = Math.round(edPageH());
  const insidePage = wx >= mx && wx < mx+pw && wy >= my && wy < my+ph;
  const x0 = insidePage ? mx : 0,      y0 = insidePage ? my : 0;
  const x1 = insidePage ? mx+pw-1 : W-1, y1 = insidePage ? my+ph-1 : H-1;
  const fw = x1-x0+1, fh = y1-y0+1;

  // Leer datos originales del DrawLayer
  const origImageData = ctx.getImageData(x0, y0, fw, fh);
  const orig = origImageData.data;

  // Color de relleno
  const fc = edDrawColor;
  const fR = parseInt(fc.slice(1,3),16),
        fG = parseInt(fc.slice(3,5),16),
        fB = parseInt(fc.slice(5,7),16),
        fA = Math.round((edDrawOpacity/100) * 255);

  // ── TÉCNICA DOS CAPAS (como Krita/Photoshop) ─────────────────────────────
  // 1. Canvas de RELLENO: binarizar semitransparentes, hacer flood fill.
  // 2. Canvas de LINE ART: el original sin modificar.
  // 3. Composicionar: fill debajo, line art original encima (source-over).
  //    El antialiasing del trazo composiciona sobre el nuevo fill naturalmente.

  // Canvas de relleno con datos binarizados
  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = fw; fillCanvas.height = fh;
  const fillCtx = fillCanvas.getContext('2d');
  const fillImageData = fillCtx.createImageData(fw, fh);
  const fd = fillImageData.data;

  for(let i=0; i<fw*fh; i++){
    const pi=i*4, a=orig[pi+3];
    if(a===255){ fd[pi]=orig[pi]; fd[pi+1]=orig[pi+1]; fd[pi+2]=orig[pi+2]; fd[pi+3]=255; }
    else if(a>=128){ fd[pi]=orig[pi]; fd[pi+1]=orig[pi+1]; fd[pi+2]=orig[pi+2]; fd[pi+3]=255; }
    else { fd[pi]=0; fd[pi+1]=0; fd[pi+2]=0; fd[pi+3]=0; }
  }

  // Semilla desde canvas binarizado
  const lx = wx-x0, ly = wy-y0;
  const si0 = (ly*fw+lx)*4;
  const tR=fd[si0], tG=fd[si0+1], tB=fd[si0+2], tA=fd[si0+3];
  if(tR===fR && tG===fG && tB===fB && tA===fA) return;

  // Flood fill sobre canvas binarizado
  const TOL = 15;
  function match(i){
    return Math.abs(fd[i  ]-tR)<=TOL && Math.abs(fd[i+1]-tG)<=TOL &&
           Math.abs(fd[i+2]-tB)<=TOL && Math.abs(fd[i+3]-tA)<=TOL;
  }
  const filled = new Uint8Array(fw*fh);
  const stack = [];
  stack.push({y:ly, left:lx, right:lx, dy:1});
  stack.push({y:ly, left:lx, right:lx, dy:-1});
  filled[ly*fw+lx]=1;
  fd[si0]=fR; fd[si0+1]=fG; fd[si0+2]=fB; fd[si0+3]=fA;

  while(stack.length){
    const {y, left, right, dy} = stack.pop();
    const ny2 = y+dy;
    if(ny2<0||ny2>=fh) continue;
    let x=left;
    while(x>0 && !filled[ny2*fw+(x-1)] && match((ny2*fw+(x-1))*4)) x--;
    let rx=right;
    while(rx<fw-1 && !filled[ny2*fw+(rx+1)] && match((ny2*fw+(rx+1))*4)) rx++;
    let segStart=-1;
    for(let sx=x;sx<=rx;sx++){
      const idx=ny2*fw+sx;
      if(!filled[idx] && match(idx*4)){
        if(segStart===-1) segStart=sx;
        filled[idx]=1;
        const pi=idx*4;
        fd[pi]=fR; fd[pi+1]=fG; fd[pi+2]=fB; fd[pi+3]=fA;
      } else if(segStart!==-1){
        stack.push({y:ny2,left:segStart,right:sx-1,dy:dy});
        stack.push({y:ny2,left:segStart,right:sx-1,dy:-dy});
        segStart=-1;
      }
    }
    if(segStart!==-1){
      stack.push({y:ny2,left:segStart,right:rx,dy:dy});
      stack.push({y:ny2,left:segStart,right:rx,dy:-dy});
    }
  }

  // Escribir resultado al DrawLayer combinando a nivel de píxel
  // Para preservar la editabilidad futura, el DrawLayer queda con:
  //   · Píxeles rellenados (filled=1): color fill opaco
  //   · Resto: valor EXACTO de origData (semitransparentes del trazo intactos)
  // NO usar ctx.drawImage() para composicionar — mezcla semitransparentes
  // con el fill convirtiéndolos en opacos y rompiendo futuros rellenos.
  const resultImageData = ctx.createImageData(fw, fh);
  const rd = resultImageData.data;
  for(let i=0; i<fw*fh; i++){
    const pi=i*4;
    if(filled[i]){
      rd[pi]=fR; rd[pi+1]=fG; rd[pi+2]=fB; rd[pi+3]=fA;
    } else {
      rd[pi]=orig[pi]; rd[pi+1]=orig[pi+1]; rd[pi+2]=orig[pi+2]; rd[pi+3]=orig[pi+3];
    }
  }

  _edDrawPushHistory();
  ctx.putImageData(resultImageData, x0, y0);
  edRedraw();
}

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
function _edLineAddPoint(nx, ny){
  if(!_edLineLayer){
    // Primera vez: crear capa con el primer punto como centro
    _edLineLayer = new LineLayer();
    _edLineLayer.color    = edDrawColor || '#000000';
    _edLineLayer.fillColor = edDrawFillColor || '#ffffff';
    _edLineLayer.lineWidth = edDrawSize || 3;
    _edLineLayer.x = nx; _edLineLayer.y = ny;
    _edLineLayer.points.push({x:0, y:0}); // primer punto en local = (0,0)
    _edInsertLayerAbove(_edLineLayer);
  } else {
    // Comprobar si toca el primer vértice (cerrar polígono)
    const absFirst = _edLineLayer.absPoints()[0];
    const pw=edPageW(), ph=edPageH();
    const dx=(nx-absFirst.x)*pw, dy=(ny-absFirst.y)*ph;
    if(_edLineLayer.points.length>=3 && Math.sqrt(dx*dx+dy*dy)<15){
      _edLineLayer.closed=true;
      _edFinishLine();
      // Solo abrir panel si los menús están visibles
      if(!edMinimized) _edActivateLineTool(true);
      return;
    }
    _edLineLayer.addAbsPoint(nx, ny);
  }
  edRedraw();
  const info=$('op-line-info');
  if(info) info.textContent=`${_edLineLayer.points.length} vértice(s). Toca el primero para cerrar.`;
}

function edStartPaint(e){
  edPainting = true;
  const _pp=$('edOptionsPanel');
  if(_pp&&_pp.classList.contains('open')&&_pp.dataset.mode!=='draw'){
    _pp.classList.remove('open'); _pp.innerHTML='';
  }
  if(e.pointerId !== undefined && edCanvas){
    try { edCanvas.setPointerCapture(e.pointerId); } catch(_){}
  }
  // Guardar estado global ANTES del primer trazo para que el undo global
  // pueda retroceder al estado sin dibujo. La deduplicación evita duplicados
  // si el DrawLayer no ha cambiado desde el último push.
  edPushHistory();
  const dl = _edGetOrCreateDrawLayer(); if(!dl) return;
  const _eTmp = _edApplyCursorOffset(e);
  const isTouch = e.pointerType === 'touch' || (e.touches && e.touches.length > 0);
  const er = edActiveTool==='eraser';
  if(_edCursorOffset && isTouch){
    // Solo fijar posición inicial sin dibujar — el primer move dibujará el punto + el trazo
    const c = edCoords(_eTmp);
    dl.beginStrokeNoDot(c.nx, c.ny);
    _edOffsetFirstMove = true;
  } else {
    const c = edCoords(_eTmp);
    dl.beginStroke(c.nx, c.ny, edDrawColor, er?edEraserSize:edDrawSize, er, edDrawOpacity);
    edRedraw();
    _edOffsetFirstMove = false;
  }
  edMoveBrush(e);
}
function edContinuePaint(e){
  if(!edPainting) return;
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = page.layers.find(l => l.type === 'draw'); if(!dl) return;
  const _eTmp = _edApplyCursorOffset(e);
  const c = edCoords(_eTmp), er = edActiveTool==='eraser';
  if(_edOffsetFirstMove){
    // Primer move con offset: dibujar el punto inicial que se omitió en pointerdown
    _edOffsetFirstMove = false;
    dl.beginStroke(c.nx, c.ny, edDrawColor, er?edEraserSize:edDrawSize, er, edDrawOpacity);
  } else {
    dl.continueStroke(c.nx, c.ny, edDrawColor, er?edEraserSize:edDrawSize, er, edDrawOpacity);
  }
  edRedraw();
  edMoveBrush(e);
}
/* ── Helpers visuales del cursor offset ── */
// Devuelve un evento sintético con clientX/Y desplazados si offset activo y táctil
function _edApplyCursorOffset(e){
  const isTouch = e.pointerType === 'touch' || (e.touches && e.touches.length > 0);
  if(!_edCursorOffset || !isTouch) return e;
  const src = e.touches ? e.touches[0] : e;
  const rad = _edCursorOffsetAngle * Math.PI / 180;
  // CSS rotate(ang) sobre punto (0,-offset): X_resultado = +offset*sin(ang), Y_resultado = -offset*cos(ang)
  // Así que el cursor está en (touchX + offset*sin(ang), touchY - offset*cos(ang))
  const dx = _ED_CURSOR_OFFSET_PX * Math.sin(rad);
  const dy = _ED_CURSOR_OFFSET_PX * Math.cos(rad);
  return {
    clientX: src.clientX + dx,
    clientY: src.clientY - dy,
    pointerType: e.pointerType,
    pointerId: e.pointerId,
    touches: null
  };
}
function _edOffsetShow(cursorX, cursorY, touchX, touchY, cursorSz){
  // Estrategia: un único contenedor posicionado en el punto de toque,
  // rotado ang grados alrededor de su centro (= centro del cuadrado).
  // Dentro del contenedor, los elementos se posicionan en coordenadas locales
  // (eje vertical: hacia arriba = negativo Y).
  // Así ang=0 es idéntico al caso vertical que ya funcionaba.

  const ang = _edCursorOffsetAngle;
  const dotSize = 16;
  const cursorR = cursorSz / 2;
  const lineLen = Math.max(0, _ED_CURSOR_OFFSET_PX - cursorR - dotSize / 2);

  // Eliminar bloques anteriores y usar un único contenedor SVG
  let wrap = $('edOffsetWrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'edOffsetWrap';
    wrap.style.cssText = 'position:fixed;pointer-events:none;z-index:998;';
    document.getElementById('editorShell')?.appendChild(wrap);
  }

  // El contenedor se centra en el punto de toque y rota ang grados
  // transform-origin por defecto es 50% 50% = centro del div
  // El div tiene tamaño 0×0 — los hijos usan posición absoluta relativa al centro
  wrap.style.left = touchX + 'px';
  wrap.style.top  = touchY + 'px';
  wrap.style.transform = `rotate(${ang}deg)`;

  const isEr = edActiveTool === 'eraser';
  const dotColor = isEr ? '#888' : edDrawColor;

  wrap.innerHTML = `
    <!-- Cuadrado: centrado en el origen (punto de toque) -->
    <div style="position:absolute;
      left:${-dotSize/2}px; top:${-dotSize/2}px;
      width:${dotSize}px; height:${dotSize}px;
      background:${dotColor};border-radius:2px;
      box-shadow:0 0 0 1.5px rgba(255,255,255,0.7);"></div>
    <!-- Línea: arranca del borde superior del cuadrado, sube lineLen px -->
    <div style="position:absolute;
      left:-1px; top:${-dotSize/2 - lineLen}px;
      width:2px; height:${lineLen}px;
      background:rgba(60,140,255,0.75);"></div>
    <!-- Cursor (círculo): centrado lineLen+dotSize/2 px arriba del toque -->
    <div style="position:absolute;
      left:${-cursorR}px; top:${-dotSize/2 - lineLen - cursorR*2}px;
      width:${cursorSz}px; height:${cursorSz}px;
      border-radius:50%;
      border:1.5px solid ${isEr ? 'rgba(150,150,150,0.6)' : dotColor};
      background:${isEr ? 'rgba(255,255,255,0.5)' : dotColor + '33'};"></div>`;

  // Ocultar el cursor original y los elementos separados — ya no se usan
  const cur = $('edBrushCursor'); if(cur) cur.style.display='none';
  const line = $('edOffsetLine'); if(line) line.style.display='none';
  const dot  = $('edTouchDot');  if(dot)  dot.style.display='none';
}
function _edOffsetHide(){
  const wrap = $('edOffsetWrap'); if(wrap) wrap.style.display='none';
  const line = $('edOffsetLine'); if(line) line.style.display='none';
  const dot  = $('edTouchDot');  if(dot)  dot.style.display='none';
}
// Refresca el cursor offset en su última posición conocida (cuando cambia grosor o color desde la UI)
function _edRefreshOffsetCursor(){
  if(!_edCursorOffset || !_edOffsetLastTouch) return;
  const wrap = $('edOffsetWrap');
  if(!wrap || wrap.style.display === 'none') return;
  const sz = (edActiveTool==='eraser' ? edEraserSize : edDrawSize) * 2;
  _edOffsetShow(0, 0, _edOffsetLastTouch.x, _edOffsetLastTouch.y, sz);
}
function _edOffsetShowReset(){
  const wrap = $('edOffsetWrap'); if(wrap) wrap.style.display='';
  const line = $('edOffsetLine'); if(line) line.style.display='';
  const dot  = $('edTouchDot');  if(dot)  dot.style.display='';
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
  const src = e.touches ? e.touches[0] : e;
  const cur = $('edBrushCursor');
  if(!cur) return;
  if(edActiveTool==='fill'){
    cur.style.display='none';
    _edOffsetHide();
    return;
  }
  const sz = (edActiveTool==='eraser' ? edEraserSize : edDrawSize) * 2;
  const isTouch = e.pointerType === 'touch' || (e.touches && e.touches.length > 0);
  if(_edCursorOffset && isTouch){
    // Si el toque está sobre el panel o la barra flotante, refrescar el cursor en su posición actual
    const elUnder = document.elementFromPoint(src.clientX, src.clientY);
    const overUI = !!(elUnder && (elUnder.closest('#edOptionsPanel') || elUnder.closest('#edDrawBar')));
    if(overUI){
      // Redibujar con los valores actuales (grosor/color pueden haber cambiado) pero sin mover
      if(_edOffsetLastTouch){
        _edOffsetShow(0, 0, _edOffsetLastTouch.x, _edOffsetLastTouch.y, sz);
      }
      return;
    }
    // Guardar posición para cuando el dedo pase a la UI
    _edOffsetLastTouch = { x: src.clientX, y: src.clientY };
    // El wrap dibuja cursor+línea+cuadrado como bloque rotado desde el punto de toque
    // Ocultar el cursor original — el wrap lo reemplaza
    cur.style.display = 'none';
    const wrap = $('edOffsetWrap');
    if(wrap) wrap.style.display = '';
    _edOffsetShow(0, 0, src.clientX, src.clientY, sz);
  } else {
    cur.style.display = 'block';
    cur.style.left = src.clientX + 'px'; cur.style.top = src.clientY + 'px';
    cur.style.width = sz + 'px'; cur.style.height = sz + 'px';
    cur.style.background = ''; cur.style.borderColor = '';
    _edOffsetHide();
  }
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
      edShapeBarHide();
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
  if(id === 'project' || id === 'rules' || id === 'biblioteca'){
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
    <button id="op-shape-mirror" title="Reflejar" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 6px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">${_ED_MIRROR_ICON}</button>
    <button id="op-shape-undo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↩</button>
    <button id="op-shape-redo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↪</button>

    <span id="op-shape-info" style="flex:1;text-align:right;font-size:clamp(.65rem,1.8vw,.75rem);font-weight:700;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">${_sel?_edShapeType+' · '+lw+'px · '+opacity+'%':'Sin objeto'}</span>
    <button id="op-draw-ok" style="flex-shrink:0;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:5px 12px;font-family:inherit;font-size:clamp(.75rem,2.2vw,.85rem);font-weight:900;cursor:pointer">✓</button>
  </div>
</div>`;
  panel.classList.add('open');
  panel.style.visibility='';
  panel.dataset.mode = 'shape';
  // Guardar estado previo en historial global (objeto existente)
  if(_sel) edPushHistory();
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
  $('op-shape-rect')?.addEventListener('click',()=>{ _edShapeType='rect'; const s=_curShape(); if(s){_edShapePushHistory(); s.shape='rect';edRedraw();} _edActivateShapeTool(); });
  $('op-shape-ellipse')?.addEventListener('click',()=>{ _edShapeType='ellipse'; const s=_curShape(); if(s){_edShapePushHistory(); s.shape='ellipse';edRedraw();} _edActivateShapeTool(); });
  $('op-shape-select')?.addEventListener('click',()=>{
    _edShapeType='select'; edActiveTool='select'; edCanvas.className='';
    _edActivateShapeTool();
  });

  // ── Color borde ──
  $('op-shape-color-btn')?.addEventListener('click', e=>{
    const s=_curShape(); if(!s) return;
    _edPickColor(e, s.color||'#000000',
      hex=>{ s.color=hex; $('op-shape-color-btn').style.background=hex; edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
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
    _edPickColor(e, cur,
      hex=>{ s.fillColor=hex; $('op-shape-fill-btn').style.background=hex; $('op-shape-fill-on').checked=true; edDrawFillColor=hex; edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
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
      edRedraw();
    }
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
      edRedraw(); _edShapePushHistory();
    }
  });

  // ── OK ──
  $('op-draw-ok')?.addEventListener('click',()=>{
    edPushHistory(); _edShapeClearHistory();
    edCloseOptionsPanel();
    edSelectedIdx=-1; edActiveTool='select'; edCanvas.className='';
    _edShapeStart=null; _edShapePreview=null; _edPendingShape=null;
    edShapeBarHide();
    _edDrawUnlockUI();
    if(edMinimized){ window._edMinimizedDrawMode=null; edMaximize(); }
    edRedraw();
  });

  // ── Eliminar ──
  $('op-shape-del')?.addEventListener('click',()=>{
    const s=_curShape(); if(!s) return;
    edConfirm('¿Eliminar objeto?', ()=>{
      const idx=edLayers.indexOf(s);
      if(idx>=0){edLayers.splice(idx,1);}
      edSelectedIdx=-1; edPushHistory(); edRedraw(); _edActivateShapeTool();
    });
  });

  // ── Duplicar ──

  $('op-shape-dup')?.addEventListener('click',()=>{
    const s=_curShape(); if(!s) return;
    const origSnapshot = JSON.stringify(edSerLayer(s));
    const copy=new ShapeLayer(s.shape, s.x+0.03, s.y+0.03, s.width, s.height);
    copy.color=s.color; copy.fillColor=s.fillColor; copy.lineWidth=s.lineWidth;
    copy.opacity=s.opacity??1; copy.rotation=s.rotation||0;
    if(s.cornerRadius) copy.cornerRadius=s.cornerRadius;
    if(s.cornerRadii)  copy.cornerRadii=Array.isArray(s.cornerRadii)?[...s.cornerRadii]:{...s.cornerRadii};
    _edInsertLayerAbove(copy);
    edPushHistory(); edRedraw(); _edActivateShapeTool();
    _edShapeHistory = [origSnapshot];
    _edShapeHistIdx = 0;
    _edShapeHistIdxBase = 0;
    _edShapeUpdateUndoRedoBtns();
  });
  $('op-shape-mirror')?.addEventListener('click',()=>{ _edShapePushHistory(); edMirrorSelected(); });

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
  <!-- FILA CERRAR + V/C + INFO VÉRTICES -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0">
    ${!isClosed?`<button id="op-line-close-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Cerrar objeto</button><div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>`:''}
    <button id="op-line-curve-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.78rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)" title="Convertir vértice a curva"><b>V⟺C</b></button>
    <div id="op-line-curve-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="range" id="op-line-curve-r" min="0" max="80" value="0" style="flex:1;min-width:40px;accent-color:var(--black)">
      <input type="number" id="op-line-curve-rnum" min="0" max="80" value="0" style="width:38px;text-align:center;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
    </div>
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
    <button id="op-line-del" style="flex-shrink:0;border:1px solid #fcc;border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:#c00">✕</button>
    <button id="op-line-dup" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">⧉</button>
    <button id="op-line-mirror" title="Reflejar" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 6px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">${_ED_MIRROR_ICON}</button>
    <button id="op-line-undo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↩</button>
    <button id="op-line-redo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↪</button>

    <span id="op-line-status" style="flex:1;text-align:right;font-size:clamp(.65rem,1.8vw,.75rem);font-weight:700;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">${lw}px · ${opacity}%</span>
    <button id="op-draw-ok" style="flex-shrink:0;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:5px 12px;font-family:inherit;font-size:clamp(.75rem,2.2vw,.85rem);font-weight:900;cursor:pointer">✓</button>
  </div>
</div>`;
  panel.classList.add('open');
  panel.style.visibility='';
  panel.dataset.mode = 'line';
  // Guardar estado previo en historial global (objeto existente, no nuevo)
  if(!isNew) edPushHistory();
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
    _edPickColor(e, l.color||'#000000',
      hex=>{ l.color=hex; $('op-line-color-btn').style.background=hex; edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
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

  // ── Cerrar objeto ──
  $('op-line-close-btn')?.addEventListener('click',()=>{
    const l=_curLine(); if(!l||l.points.length<3) return;
    l.closed=true; _edShapePushHistory(); edRedraw(); _edActivateLineTool();
  });

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
    _edPickColor(e, cur,
      hex=>{ l.fillColor=hex; $('op-line-fill-btn').style.background=hex; $('op-line-fill-on').checked=true; edDrawFillColor=hex; edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
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
    edPushHistory(); _edShapeClearHistory();
    _edFinishLine();
    edCloseOptionsPanel();
    edSelectedIdx=-1; edActiveTool='select'; edCanvas.className='';
    edShapeBarHide();
    _edDrawUnlockUI();
    if(edMinimized){ window._edMinimizedDrawMode=null; edMaximize(); }
    edRedraw();
  });

  // ── Eliminar ──
  $('op-line-del')?.addEventListener('click',()=>{
    const l=_curLine(); if(!l) return;
    edConfirm('¿Eliminar?', ()=>{
      _edLineLayer=null;
      const idx=edLayers.indexOf(l);
      if(idx>=0){edLayers.splice(idx,1);}
      edSelectedIdx=-1; edPushHistory(); edRedraw(); _edActivateLineTool();
    });
  });

  // ── Duplicar ──

  $('op-line-dup')?.addEventListener('click',()=>{
    const l=_curLine(); if(!l||l.points.length<2) return;
    // Capturar snapshot del original ANTES de insertar el duplicado
    const origSnapshot = JSON.stringify(edSerLayer(l));
    const copy=new LineLayer();
    copy.points=l.points.map(p=>({...p, x:p.x+0.03, y:p.y+0.03}));
    copy.color=l.color; copy.fillColor=l.fillColor||'none'; copy.lineWidth=l.lineWidth;
    copy.closed=l.closed; copy.opacity=l.opacity??1; copy.rotation=l.rotation||0;
    if(l.cornerRadii){
      copy.cornerRadii = Array.isArray(l.cornerRadii) ? [...l.cornerRadii] : {...l.cornerRadii};
    }
    copy._updateBbox();
    _edInsertLayerAbove(copy);
    edPushHistory(); edRedraw();
    // Abrir panel para el duplicado con historial local ya inicializado con el snapshot correcto
    // (evita que _edShapeInitHistory re-serialice desde edLayers y pueda perder datos)
    _edActivateLineTool();
    // Sobreescribir el historial local con el snapshot del original (que tiene cornerRadii correctos)
    // El duplicado es idéntico al original salvo la posición — mismo snapshot es válido
    _edShapeHistory = [origSnapshot];
    _edShapeHistIdx = 0;
    _edShapeHistIdxBase = 0;
    _edShapeUpdateUndoRedoBtns();
  });
  $('op-line-mirror')?.addEventListener('click',()=>{ _edShapePushHistory(); edMirrorSelected(); });

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
      // Inicializar historial local como objeto nuevo (igual que _edShapeInitHistory(true))
      _edShapeHistory = [null, JSON.stringify(edSerLayer(finished))];
      _edShapeHistIdx = 1;
      _edShapeHistIdxBase = 1;
      _edShapeUpdateUndoRedoBtns();
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
// Helper unificado para picker de color
// En táctil (Android) abre el picker HSL propio; en PC abre el selector nativo.
// Detecta táctil via window._edIsTouch, que se actualiza con cualquier pointerdown real.
function _edPickColor(e, initialHex, onInput, onCommit){
  const _isTouch = e.pointerType==='touch' || window._edIsTouch===true;
  if(_isTouch){
    const _savedSel=edSelectedIdx, _savedCol=edDrawColor;
    edDrawColor = initialHex;
    _edShowColorPicker((hex, commit)=>{
      edSelectedIdx=_savedSel; edDrawColor=_savedCol;
      onInput(hex);
      if(commit) onCommit(hex);
    });
  } else {
    const inp=document.createElement('input');
    inp.type='color'; inp.value=initialHex;
    inp.style.cssText='position:fixed;opacity:0;width:0;height:0;';
    document.body.appendChild(inp);
    // Activar inmediatamente (antes del click) — el focus no siempre se dispara en Chrome
    window._edEyedropActive = true; edRedraw();
    inp.addEventListener('input', ev=>onInput(ev.target.value));
    inp.addEventListener('change', ()=>{
      window._edEyedropActive = false; edRedraw();
      onCommit(inp.value); inp.remove();
    });
    // Fallback: si se cierra sin cambiar color (Escape), restaurar tras breve espera
    inp.addEventListener('blur', ()=>{ setTimeout(()=>{ window._edEyedropActive=false; edRedraw(); }, 200); });
    inp.click();
  }
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
  <!-- SEP H -->\n  <div style="height:1px;background:var(--gray-300);width:100%"></div>\n  <!-- FILA PALETA -->\n  ${!isEr ? `<div id="op-color-palette" style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0;flex-wrap:wrap">\n    ${edColorPalette.map((c,i) => `<button class="op-pal-dot" data-colidx="${i}" style="width:22px;height:22px;border-radius:50%;background:${c};border:${i===edSelectedPaletteIdx?'3px solid var(--black)':'2px solid var(--gray-300)'};cursor:pointer;flex-shrink:0;padding:0" title="${c}"></button>`).join('')}\n    ${!isFill && window._edIsTouch ? `<div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0;margin:0 2px"></div><button id="op-offset-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;cursor:pointer;white-space:nowrap;background:${_edCursorOffset?'var(--black)':'transparent'};color:${_edCursorOffset?'var(--white)':'var(--gray-700)'}">↑ Cursor</button><div id="op-offset-pop" style="display:none;position:absolute;z-index:1200;background:var(--white);border:1px solid var(--gray-300);border-radius:10px;padding:6px;box-shadow:0 4px 16px rgba(0,0,0,.15);flex-direction:row;align-items:center;gap:6px;"><button id="op-offset-pop-l" style="border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;background:transparent;cursor:pointer;" title="Inclinado izquierda"><svg width="22" height="28" viewBox="0 0 22 28"><line x1="15" y1="4" x2="7" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><button id="op-offset-pop-r" style="border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;background:transparent;cursor:pointer;" title="Inclinado derecha"><svg width="22" height="28" viewBox="0 0 22 28"><line x1="7" y1="4" x2="15" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>` : ''}\n  </div>` : ''}\n  <!-- SEP H -->\n  <div style="height:1px;background:var(--gray-300);width:100%"></div>\n  <!-- FILA 3: Acciones -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0 2px 0;min-height:32px;width:100%">
    <button id="op-draw-del"
      style="flex-shrink:0;border:1px solid #fcc;border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:#c00">✕</button>
    <button id="op-draw-dup"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">⧉</button>
    <button id="op-draw-mirror"
      title="Reflejar" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 6px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">${_ED_MIRROR_ICON}</button>
    <button id="op-draw-undo"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↩</button>
    <button id="op-draw-redo"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↪</button>
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
      if(window._edIsTouch){
        _edShowColorPicker((hex, final)=>{
          edDrawColor = hex;
          if(final){ edColorPalette[edSelectedPaletteIdx] = hex; }
          _edUpdatePaletteDots();
        });
      } else {
        window._edEyedropActive = true; edRedraw();
        $('op-dcolor')?.click();
      }
    });
    $('op-dcolor')?.addEventListener('input',e=>{
      if(edSelectedPaletteIdx <= 1) return;
      edDrawColor = e.target.value;
      edColorPalette[edSelectedPaletteIdx] = edDrawColor;
      _edUpdatePaletteDots();
    });
    $('op-dcolor')?.addEventListener('change', ()=>{ window._edEyedropActive=false; edRedraw(); });
    $('op-dcolor')?.addEventListener('blur',   ()=>{ setTimeout(()=>{ window._edEyedropActive=false; edRedraw(); }, 200); });
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

    // ── Cursor offset — botón único con popover de orientación ──
    const _opOffsetBtn = $('op-offset-btn');
    const _opOffsetPop = $('op-offset-pop');
    // Abrir/cerrar popover al pulsar el botón principal
    _opOffsetBtn?.addEventListener('click', e => {
      e.stopPropagation();
      if(!_opOffsetPop) return;
      const isOpen = _opOffsetPop.style.display === 'flex';
      if(isOpen){ _opOffsetPop.style.display = 'none'; return; }
      if(_edCursorOffset){
        // Offset activo y popover cerrado → desactivar
        _edCursorOffset = false;
        _opOffsetBtn.style.background = 'transparent';
        _opOffsetBtn.style.color = 'var(--gray-700)';
        _edbSyncOffsetBtn();
        _edOffsetHide();
        return;
      }
      // Offset inactivo → abrir popover
      const br = _opOffsetBtn.getBoundingClientRect();
      const panel = $('edOptionsPanel');
      const pr = panel ? panel.getBoundingClientRect() : {left:0,top:0};
      _opOffsetPop.style.display = 'flex';
      _opOffsetPop.style.left = (br.left - pr.left) + 'px';
      _opOffsetPop.style.top  = (br.bottom - pr.top + 4) + 'px';
    });
    // El popover bloquea pointerdown/touchstart para que no lleguen al cierre exterior
    ['pointerdown','touchstart'].forEach(ev =>
      $('op-offset-pop')?.addEventListener(ev, e => e.stopPropagation(), { passive: true })
    );
    // Botones del popover
    [{id:'op-offset-pop-l', angle:40}, {id:'op-offset-pop-r', angle:-40}]
      .forEach(({id, angle}) => {
        $(id)?.addEventListener('click', e => {
          e.stopPropagation();
          if(_edCursorOffset && _edCursorOffsetAngle === angle){
            _edCursorOffset = false;
          } else {
            _edCursorOffset = true;
            _edCursorOffsetAngle = angle;
          }
          _opOffsetPop.style.display = 'none';
          if(_opOffsetBtn){
            _opOffsetBtn.style.background = _edCursorOffset ? 'var(--black)' : 'transparent';
            _opOffsetBtn.style.color = _edCursorOffset ? 'var(--white)' : 'var(--gray-700)';
          }
          ['op-offset-pop-l','op-offset-pop-r'].forEach(bid => {
            const b = $(bid); if(!b) return;
            const a = bid==='op-offset-pop-l' ? 40 : -40;
            b.style.background = (_edCursorOffset && _edCursorOffsetAngle === a) ? 'var(--gray-200)' : 'transparent';
          });
          _edbSyncOffsetBtn();
          if(!_edCursorOffset) _edOffsetHide();
        });
      });
    // Cerrar al tocar fuera — passive sin capture, igual que edb-size-pop
    document.addEventListener('pointerdown', e => {
      if(!_opOffsetPop || _opOffsetPop.style.display !== 'flex') return;
      if(!_opOffsetPop.contains(e.target) && e.target !== _opOffsetBtn)
        _opOffsetPop.style.display = 'none';
    }, { passive: true });

    // ── Deshacer / Rehacer ──
    $('op-draw-undo')?.addEventListener('click', edDrawUndo);
    $('op-draw-redo')?.addEventListener('click', edDrawRedo);
    _edDrawUpdateUndoRedoBtns();

    // ── Minimizar (desde el panel draw) ──


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
    $('op-draw-mirror')?.addEventListener('click',()=>{ _edDrawPushHistory(); edMirrorSelected(); });

    // ── Eliminar ──
    $('op-draw-del')?.addEventListener('click',()=>{
      edConfirm('¿Eliminar el dibujo?', ()=>{
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

    // ── PANEL DE GRUPO ──────────────────────────────────────────
    // Objeto agrupado: panel simplificado sin controles de edición individual.
    // Solo muestra operaciones sobre el grupo completo.
    if(la.groupId){
      const gid = la.groupId;
      panel.innerHTML=`
        <div class="op-row" style="margin-top:4px;justify-content:space-between;gap:4px">
          <button class="op-btn danger" id="pp-grp-del" style="flex:1">✕ Eliminar</button>
          <button class="op-btn" id="pp-grp-dup" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.78rem;cursor:pointer">⧉ Duplicar</button>
          <button class="op-btn" id="pp-grp-mirror" title="Simetría" style="flex-shrink:0;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;font-weight:900;font-size:.78rem;cursor:pointer">${_ED_MIRROR_ICON}</button>
          <button class="op-btn" id="pp-grp-ungroup" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.78rem;cursor:pointer">⊟ Desagrupar</button>
          <button id="pp-grp-ok" style="background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 10px;font-weight:900;font-size:.82rem;cursor:pointer;flex-shrink:0">✓ OK</button>
        </div>`;
      panel.classList.add('open');
      // Eliminar todo el grupo
      $('pp-grp-del')?.addEventListener('click',()=>{
        edConfirm('¿Eliminar el grupo completo?', ()=>{
          const idxs = _edGroupMemberIdxs(gid).sort((a,b)=>b-a);
          edPushHistory();
          idxs.forEach(i => edLayers.splice(i,1));
          edSelectedIdx=-1; edMultiSel=[]; edMultiBbox=null;
          if(window._edGroupSilentTool!==undefined){ edActiveTool=window._edGroupSilentTool; delete window._edGroupSilentTool; }
          else if(edActiveTool==='multiselect'){ edActiveTool='select'; edCanvas.className=''; $('edMultiSelBtn')?.classList.remove('active'); }
          edCloseOptionsPanel(); edPushHistory(); edRedraw();
        });
      });
      // Duplicar todo el grupo con un nuevo groupId
      $('pp-grp-dup')?.addEventListener('click',()=>{
        const idxs = _edGroupMemberIdxs(gid);
        const newGid = _edNewGroupId();
        edPushHistory();
        const copies = idxs.map(i=>{
          const copy = edDeserLayer(edSerLayer(edLayers[i]));
          if(copy){ copy.groupId=newGid; copy.x+=0.03; copy.y+=0.03; }
          return copy;
        }).filter(Boolean);
        copies.forEach(c=>edLayers.push(c));
        edPushHistory(); edRedraw();
        edToast('Grupo duplicado ✓');
      });
      // Simetría — refleja el grupo entero respecto al eje vertical central
      $('pp-grp-mirror')?.addEventListener('click',()=>{
        const idxs = _edGroupMemberIdxs(gid);
        if(!idxs.length) return;
        edPushHistory();
        // Centro horizontal del grupo = promedio de los centros de los miembros
        const gcx = idxs.reduce((s,i)=>s+(edLayers[i].x||0), 0) / idxs.length;
        // Aplicar simetría a cada miembro
        idxs.forEach(i=>{
          const m = edLayers[i]; if(!m) return;
          // Reflejar posición respecto al eje central del grupo
          m.x = 2*gcx - m.x;
          // Aplicar simetría interna del objeto (misma lógica que edMirrorSelected)
          if(m.type==='image'){
            const img=m.img; if(!img) return;
            const tmp=document.createElement('canvas');
            tmp.width=img.naturalWidth||img.width; tmp.height=img.naturalHeight||img.height;
            const tctx=tmp.getContext('2d');
            tctx.translate(tmp.width,0); tctx.scale(-1,1); tctx.drawImage(img,0,0);
            const mi=new Image();
            mi.onload=()=>{ m.img=mi; m.rotation=-(m.rotation||0); edRedraw(); };
            mi.src=tmp.toDataURL();
          } else if(m.type==='stroke'){
            const c=document.createElement('canvas');
            c.width=m._canvas.width; c.height=m._canvas.height;
            const cctx=c.getContext('2d');
            cctx.translate(c.width,0); cctx.scale(-1,1); cctx.drawImage(m._canvas,0,0);
            m._canvas=c; m._ctx=c.getContext('2d');
            m.rotation=-(m.rotation||0);
          } else if(m.type==='draw'){
            const pw=edPageW(), ph=edPageH();
            const axisPx=edMarginX()+gcx*pw;
            const tmp=document.createElement('canvas');
            tmp.width=ED_CANVAS_W; tmp.height=ED_CANVAS_H;
            const tctx=tmp.getContext('2d');
            tctx.translate(axisPx*2,0); tctx.scale(-1,1); tctx.drawImage(m._canvas,0,0);
            m._ctx.clearRect(0,0,ED_CANVAS_W,ED_CANVAS_H);
            m._ctx.drawImage(tmp,0,0);
          } else if(m.type==='shape'){
            m.rotation=-(m.rotation||0);
            if(m.cornerRadii&&m.cornerRadii.length===4){
              const [tl,tr,br,bl]=m.cornerRadii; m.cornerRadii=[tr,tl,bl,br];
            }
          } else if(m.type==='line'){
            m.points=m.points.map(p=>({...p,x:-p.x,
              cx1:p.cx1!==undefined?-p.cx1:undefined,
              cx2:p.cx2!==undefined?-p.cx2:undefined}));
            m.rotation=-(m.rotation||0);
            if(typeof m._updateBbox==='function') m._updateBbox();
          } else if(m.type==='text'||m.type==='bubble'){
            m.rotation=-(m.rotation||0);
            if(m.type==='bubble'){
              if(m.tailStart) m.tailStart={x:1-m.tailStart.x,y:m.tailStart.y};
              if(m.tailEnd)   m.tailEnd  ={x:1-m.tailEnd.x,  y:m.tailEnd.y};
              if(m.tailStarts) m.tailStarts=m.tailStarts.map(s=>({x:1-s.x,y:s.y}));
              if(m.tailEnds)   m.tailEnds  =m.tailEnds.map(e=>({x:1-e.x,y:e.y}));
            }
          }
        });
        edPushHistory(); edRedraw();
      });
      // Desagrupar
      $('pp-grp-ungroup')?.addEventListener('click',()=>{ edCloseOptionsPanel(); edUngroupSelected(); });
      // OK — cerrar panel y volver al grupo seleccionado
      $('pp-grp-ok')?.addEventListener('click',()=>{
        edCloseOptionsPanel();
        // Restaurar selección del grupo
        const idxs = _edGroupMemberIdxs(gid);
        if(idxs.length>1){
          edSelectedIdx=-1; edMultiSel=idxs; edMultiGroupRot=0; _msRecalcBbox();
          const _prev = edActiveTool;
          edActiveTool='multiselect';
          window._edGroupSilentTool=_prev;
          edRedraw();
        }
      });
      requestAnimationFrame(edFitCanvas); return;
    }
    // ── FIN PANEL DE GRUPO ──────────────────────────────────────

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
        <span class="op-prop-label" style="min-width:auto;margin-left:8px">Fondo</span>
        <input type="range" id="pp-bgop" min="0" max="100" value="${Math.round((la.bgOpacity??1)*100)}" style="flex:1;min-width:40px;accent-color:var(--black)">
        <span id="pp-bgop-val" style="font-size:.75rem;font-weight:900;min-width:28px;text-align:right">${Math.round((la.bgOpacity??1)*100)}%</span>
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
      ${la.groupId
        ? `<button class="op-btn" id="pp-ungroup" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.78rem;cursor:pointer">⊟ Desagrupar</button>`
        : `<button class="op-btn" id="pp-dup" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.78rem;cursor:pointer">⧉ Duplicar</button>`}
      ${(la.type!=='text'&&la.type!=='bubble')?`<button class="op-btn" id="pp-mirror" title="Reflejar" style="flex-shrink:0;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;font-weight:900;font-size:.78rem;cursor:pointer">${_ED_MIRROR_ICON}</button>`:''}
      <button id="pp-ok" style="background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 10px;font-weight:900;font-size:.82rem;cursor:pointer;flex-shrink:0">✓ OK</button>
    </div>`;

    panel.innerHTML=html;
    panel.classList.add('open');

    // (voiceCount es independiente del estilo)
    // Live update
    panel.querySelectorAll('input,select,textarea').forEach(inp=>{
      // input[type=color] en PC: restaurar opacidad del canvas al abrirlo
      if(inp.type === 'color'){
        inp.addEventListener('click',  ()=>{ window._edEyedropActive=true;  edRedraw(); });
        inp.addEventListener('change', ()=>{ window._edEyedropActive=false; edRedraw(); });
        inp.addEventListener('blur',   ()=>{ setTimeout(()=>{ window._edEyedropActive=false; edRedraw(); }, 200); });
      }
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
        else if(id==='pp-bgop'){const v=parseInt(e.target.value)||0;la.bgOpacity=v/100;const lbl=$('pp-bgop-val');if(lbl)lbl.textContent=v+'%';}
        else if(id==='pp-bc')     la.borderColor=e.target.value;
        else if(id==='pp-bw')     la.borderWidth=parseInt(e.target.value);
        else if(id==='pp-style')  {la.style=e.target.value;la.resizeToFitText(edCanvas);}
        else if(id==='pp-vc')     la.voiceCount=Math.max(1,parseInt(e.target.value)||1);
        else if(id==='pp-tail')   la.tail=e.target.checked;
        edRedraw();
      });
    });
    $('pp-del')?.addEventListener('click',()=>{
      edConfirm('¿Eliminar este objeto?', ()=>{ edDeleteSelected(); edCloseOptionsPanel(); });
    });
    $('pp-dup')?.addEventListener('click',()=>{ edDuplicateSelected(); edCloseOptionsPanel(); });
    $('pp-ungroup')?.addEventListener('click',()=>{ edCloseOptionsPanel(); edUngroupSelected(); });
    $('pp-mirror')?.addEventListener('click',()=>{ edMirrorSelected(); });
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
  // Ocultar siempre el panel de opciones, sea cual sea su modo
  const _panel=$('edOptionsPanel');
  if(_panel?.classList.contains('open')){
    const mode = _panel.dataset.mode || '';
    // Guardar modo para restaurar al maximizar
    if(mode) window._edMinimizedDrawMode = mode;
    _panel.style.visibility='hidden';
    // Mostrar barra flotante si corresponde al modo
    if(['draw','eraser','fill'].includes(edActiveTool)){
      edDrawBarShow();
    } else if(mode==='shape' || mode==='line'){
      edShapeBarShow();
    }
    // Para props (imagen, texto, bocadillo, stroke): panel oculto sin barra flotante
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
   REGLAS (T29) — guías orientables en el workspace
   ══════════════════════════════════════════ */

const _ED_RULE_R = 10;        // radio arrastrador en coords workspace
const _ED_RULE_LINE_HIT = 6;  // tolerancia línea en PC (px workspace)
const _ED_RULE_LINE_HIT_TOUCH = 22; // tolerancia línea en táctil (px workspace)

function _edRuleAdd() {
  const mx = edMarginX(), my = edMarginY();
  const pw = edPageW(),   ph = edPageH();
  const cy = my + ph / 2;
  const id = ++_edRuleId;
  edRules.push({ id, x1: mx - _ED_RULE_R*2, y1: cy, x2: mx + pw + _ED_RULE_R*2, y2: cy });
  edRedraw();
}

function _edRuleClear() {
  if(!edRules.length) return;
  edConfirm('¿Borrar todas las reglas de esta hoja?', ()=>{
    edRules = [];
    _edRulesPanelClose();
    edRedraw();
  }, 'Borrar');
}

function _edRuleDelete(id) {
  edRules = edRules.filter(r => r.id !== id);
  _edRulesPanelClose();
  edRedraw();
}

function _edRuleDuplicate(id) {
  const r = edRules.find(r => r.id === id); if(!r) return;
  const newId = ++_edRuleId;
  edRules.push({ id: newId, x1: r.x1+20, y1: r.y1+20, x2: r.x2+20, y2: r.y2+20 });
  _edRulesPanelClose();
  edRedraw();
}

function _edRulesOpenPanel(id, part, wx, wy) {
  _edRulesClosePop();
  const r = edRules.find(r => r.id === id); if(!r) return;
  const sc = edWorldToScreen(wx, wy);
  const pop = document.createElement('div');
  pop.id = 'ed-rule-pop';
  pop.style.cssText = 'position:fixed;z-index:10000;background:rgba(28,28,28,0.96);border-radius:10px;padding:6px 8px;display:flex;flex-direction:row;align-items:center;gap:6px;box-shadow:0 4px 18px rgba(0,0,0,0.55);';
  const _svgH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><line x1="2" y1="12" x2="22" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  const _svgV = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><line x1="12" y1="2" x2="12" y2="22" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  const _bs = 'background:rgba(255,255,255,0.12);border:none;border-radius:7px;padding:7px 9px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
  pop.innerHTML = `<button id="erp-horiz" title="Hacer horizontal" style="${_bs}">${_svgH}</button><button id="erp-vert" title="Hacer vertical" style="${_bs}">${_svgV}</button><div style="width:1px;height:26px;background:rgba(255,255,255,0.18);flex-shrink:0"></div><button id="erp-del" title="Borrar regla" style="${_bs}font-size:.9rem;font-weight:900;color:#ff6b6b;">✕</button>`;
  document.body.appendChild(pop);
  const PW = pop.offsetWidth || 150, PH = pop.offsetHeight || 44;
  let px = sc.x + 22, py = sc.y - PH / 2;
  if(px + PW > window.innerWidth - 8) px = sc.x - PW - 22;
  if(py < 8) py = 8;
  if(py + PH > window.innerHeight - 8) py = window.innerHeight - PH - 8;
  pop.style.left = px + 'px'; pop.style.top = py + 'px';

  document.getElementById('erp-horiz')?.addEventListener('click', e => {
    e.stopPropagation();
    const dist = Math.hypot(r.x2-r.x1, r.y2-r.y1);
    if(part==='a'){ r.x2=r.x1+dist; r.y2=r.y1; } else { r.x1=r.x2-dist; r.y1=r.y2; }
    _edRulesClosePop(); edRedraw();
  });
  document.getElementById('erp-vert')?.addEventListener('click', e => {
    e.stopPropagation();
    const dist = Math.hypot(r.x2-r.x1, r.y2-r.y1);
    if(part==='a'){ r.x2=r.x1; r.y2=r.y1+dist; } else { r.x1=r.x2; r.y1=r.y2-dist; }
    _edRulesClosePop(); edRedraw();
  });
  document.getElementById('erp-del')?.addEventListener('click', e => {
    e.stopPropagation(); _edRuleDelete(id);
  });
  ['pointerdown','touchstart'].forEach(ev => pop.addEventListener(ev, e => e.stopPropagation(), {passive:true}));
  setTimeout(() => { document.addEventListener('pointerdown', _edRulesPopOutside, {passive:true}); }, 50);
}

function _edRulesPopOutside(e) {
  // No cerrar si se pulsa dentro del menú o sus dropdowns
  if(e.target.closest('#edMenuBar') || e.target.closest('.ed-dropdown') ||
     e.target.closest('.ed-submenu') || e.target.closest('#ed-rule-pop')) return;
  _edRulesClosePop();
}

function _edRulesClosePop() {
  const pop = document.getElementById('ed-rule-pop');
  if(pop) pop.remove();
  document.removeEventListener('pointerdown', _edRulesPopOutside, {passive:true});
}

function _edRulesPanelClose() { _edRulesClosePop(); }

function _edRulesDraw(ctx) {
  if(!edRules.length) return;
  const z = edCamera.z;
  ctx.save();
  for(const r of edRules) {
    const isActive = (_edRulePanelId === r.id) || (_edRuleDrag?.ruleId === r.id);
    ctx.beginPath();
    ctx.moveTo(r.x1, r.y1);
    ctx.lineTo(r.x2, r.y2);
    ctx.strokeStyle = isActive ? '#1a8cff' : 'rgba(30,140,255,0.7)';
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([8/z, 5/z]);
    ctx.stroke();
    ctx.setLineDash([]);
    for(const [ex, ey] of [[r.x1,r.y1],[r.x2,r.y2]]) {
      ctx.beginPath();
      ctx.arc(ex, ey, _ED_RULE_R / z, 0, Math.PI*2);
      ctx.fillStyle = isActive ? '#1a8cff' : 'rgba(30,140,255,0.75)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / z;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function _edRulesHit(wx, wy, isTouch) {
  const z = edCamera.z;
  const rPx  = (isTouch ? 22 : _ED_RULE_R) / z;
  const lPx  = (isTouch ? _ED_RULE_LINE_HIT_TOUCH : _ED_RULE_LINE_HIT) / z;
  for(let i = edRules.length-1; i >= 0; i--) {
    const r = edRules[i];
    if(Math.hypot(wx-r.x1, wy-r.y1) <= rPx) return { ruleId: r.id, part: 'a' };
    if(Math.hypot(wx-r.x2, wy-r.y2) <= rPx) return { ruleId: r.id, part: 'b' };
    const dx = r.x2-r.x1, dy = r.y2-r.y1, len2 = dx*dx+dy*dy;
    if(len2 > 0) {
      const t  = Math.max(0, Math.min(1, ((wx-r.x1)*dx+(wy-r.y1)*dy)/len2));
      if(Math.hypot(wx-(r.x1+t*dx), wy-(r.y1+t*dy)) <= lPx) return { ruleId: r.id, part: 'line' };
    }
  }
  return null;
}

function edInitRules() {
  $('dd-rule-add')?.addEventListener('click', () => {
    _edRuleAdd();
    document.querySelectorAll('.ed-dropdown').forEach(d => d.classList.remove('open'));
  });
  $('dd-rule-clear')?.addEventListener('click', () => {
    document.querySelectorAll('.ed-dropdown').forEach(d => d.classList.remove('open'));
    _edRuleClear();
  });
}

// ── Snap a reglas durante el drag ────────────────────────────────────────────
// Algoritmo estándar (Figma / Konva / Krita):
// Para cada punto candidato del objeto (bordes + centro), calcular distancia
// perpendicular a cada regla. Recoger el mejor snap en componente X y en
// componente Y por separado para permitir snap simultáneo a dos reglas perpendiculares.
const _ED_SNAP_THRESHOLD_PX = 8; // px de pantalla — umbral estándar de la industria

function _edSnapToRules(la) {
  if(!edRules.length) return;
  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();
  const z  = edCamera.z;
  const threshold = _ED_SNAP_THRESHOLD_PX / z; // convertir a coords workspace

  // Puntos candidatos del objeto en coords workspace (bordes y centro del bbox)
  const objCx = mx + la.x * pw;
  const objCy = my + la.y * ph;
  const hw = (la.width  || 0) * pw / 2;
  const hh = (la.height || 0) * ph / 2;

  const candidates = [
    { ox: 0,   oy: 0   },  // centro
    { ox: -hw, oy: 0   },  // borde izquierdo
    { ox:  hw, oy: 0   },  // borde derecho
    { ox: 0,   oy: -hh },  // borde superior
    { ox: 0,   oy:  hh },  // borde inferior
  ];

  // Recoger mejor snap en componente X e Y por separado
  // Esto permite snap simultáneo a dos reglas perpendiculares
  let bestDistX = threshold, bestDistY = threshold;
  let snapDx = 0, snapDy = 0;

  for(const r of edRules) {
    const rdx = r.x2 - r.x1, rdy = r.y2 - r.y1;
    const rlen = Math.hypot(rdx, rdy);
    if(rlen < 1) continue;
    // Normal a la línea (perpendicular)
    const rnx = -rdy / rlen, rny = rdx / rlen;

    for(const cand of candidates) {
      const px = objCx + cand.ox;
      const py = objCy + cand.oy;
      const vx = px - r.x1, vy = py - r.y1;
      // Distancia perpendicular (con signo)
      const proj = vx * rnx + vy * rny;
      const dist = Math.abs(proj);

      if(dist < threshold) {
        // Desplazamiento para poner el punto sobre la recta
        const dx = -proj * rnx;
        const dy = -proj * rny;

        // Separar en componentes X e Y — coger el mejor para cada eje
        // Una regla predominantemente vertical aporta snap en X
        // Una regla predominantemente horizontal aporta snap en Y
        const isMoreVertical = Math.abs(rdy) > Math.abs(rdx);
        if(isMoreVertical) {
          // Esta regla da snap horizontal (mueve en X)
          if(dist < bestDistX) { bestDistX = dist; snapDx = dx; }
        } else {
          // Esta regla da snap vertical (mueve en Y)
          if(dist < bestDistY) { bestDistY = dist; snapDy = dy; }
        }
        // Para reglas diagonales (45°), aplicar en ambos ejes si es el mejor
        if(Math.abs(Math.abs(rdx) - Math.abs(rdy)) < rlen * 0.2) {
          if(dist < bestDistX) { bestDistX = dist; snapDx = dx; }
          if(dist < bestDistY) { bestDistY = dist; snapDy = dy; }
        }
      }
    }
  }

  if(snapDx !== 0) la.x += snapDx / pw;
  if(snapDy !== 0) la.y += snapDy / ph;
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

  // ── Grosor: abre panel anclado SIEMPRE AL LADO de la barra flotante ──
  function _edbOpenSizePop(btn) {
    const pop = $('edb-size-pop');
    if (!pop) return;
    const isOpen = pop.style.display === 'flex';
    if (isOpen) { pop.style.display = 'none'; return; }
    _edbSyncSize();
    pop.style.display = 'flex';
    pop.style.left = '-9999px'; pop.style.top = '-9999px';
    _edbSyncSizePreview();
    // Posicionar al lado de la barra flotante, adaptando según bordes de pantalla
    const bar = $('edDrawBar');
    const br  = bar ? bar.getBoundingClientRect() : btn.getBoundingClientRect();
    const pw  = pop.offsetWidth  || 170;
    const ph  = pop.offsetHeight || 120;
    const W   = window.innerWidth;
    const H   = window.innerHeight;
    const GAP = 8;
    // Posicionar siempre AL LADO de la barra (nunca encima/debajo)
    // Preferir el lado con más espacio: izquierda o derecha
    const spaceRight = W - br.right - GAP;
    const spaceLeft  = br.left - GAP;
    let left, top;
    if (spaceRight >= pw || spaceRight >= spaceLeft) {
      // A la derecha de la barra
      left = br.right + GAP;
    } else {
      // A la izquierda de la barra
      left = br.left - pw - GAP;
    }
    // Centrado verticalmente respecto a la barra, ajustado para no salir de pantalla
    top = Math.max(GAP, Math.min(H - ph - GAP, br.top + br.height/2 - ph/2));
    // Asegurar que no sale por la derecha (por si la barra está muy a la derecha)
    left = Math.max(GAP, Math.min(W - pw - GAP, left));
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
  }
  $('edb-pen-size')?.addEventListener('click', e => { e.stopPropagation(); _edbOpenSizePop($('edb-pen-size')); });
  $('edb-eraser-size')?.addEventListener('click', e => { e.stopPropagation(); _edbOpenSizePop($('edb-eraser-size')); });
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
    // Actualizar preview en tiempo real
    _edbSyncSizePreview();
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
    if (pop && pop.style.display === 'flex' && !pop.contains(e.target) && e.target.id !== 'edb-pen-size' && e.target.id !== 'edb-eraser-size' && e.target.id !== 'esb-size' && e.target.id !== 'esb-opacity'){
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

  // ── Cursor offset (T18) — botón único con popover ──
  function _edbOpenOffsetPop() {
    const pop = $('edb-offset-pop');
    if(!pop) return;
    const isOpen = pop.style.display === 'flex';
    if(isOpen){ pop.style.display = 'none'; return; }
    // Si offset activo → desactivar directamente sin abrir el popover
    if(_edCursorOffset){
      _edCursorOffset = false;
      _edbSyncOffsetBtn();
      _edOffsetHide();
      return;
    }
    // Posicionar igual que edb-size-pop: al lado de la barra con más espacio
    pop.style.display = 'flex';
    pop.style.left = '-9999px'; pop.style.top = '-9999px';
    const bar = $('edDrawBar');
    const br  = bar ? bar.getBoundingClientRect() : {left:0, right:0, top:0, bottom:0, width:0, height:0};
    const pw  = pop.offsetWidth  || 130;
    const ph  = pop.offsetHeight || 52;
    const W   = window.innerWidth;
    const H   = window.innerHeight;
    const GAP = 8;
    const spaceRight = W - br.right - GAP;
    const spaceLeft  = br.left - GAP;
    let left;
    if(spaceRight >= pw || spaceRight >= spaceLeft){
      left = br.right + GAP;
    } else {
      left = br.left - pw - GAP;
    }
    let top = Math.max(GAP, Math.min(H - ph - GAP, br.top + br.height/2 - ph/2));
    left = Math.max(GAP, Math.min(W - pw - GAP, left));
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
  }
  $('edb-offset')?.addEventListener('click', e => { e.stopPropagation(); _edbOpenOffsetPop(); });
  // Los botones del popover bloquean pointerdown/touchstart igual que edb-size-pop
  ['pointerdown','touchstart'].forEach(ev =>
    $('edb-offset-pop')?.addEventListener(ev, e => e.stopPropagation(), { passive: true })
  );
  [{id:'edb-offset-pop-l', angle:40}, {id:'edb-offset-pop-r', angle:-40}]
    .forEach(({id, angle}) => {
      $(id)?.addEventListener('click', e => {
        e.stopPropagation();
        if(_edCursorOffset && _edCursorOffsetAngle === angle){
          _edCursorOffset = false;
        } else {
          _edCursorOffset = true;
          _edCursorOffsetAngle = angle;
        }
        $('edb-offset-pop').style.display = 'none';
        _edbSyncOffsetBtn();
        if(!_edCursorOffset) _edOffsetHide();
      });
    });
  // Cerrar al tocar fuera — passive:true sin capture, igual que edb-size-pop
  document.addEventListener('pointerdown', e => {
    const pop = $('edb-offset-pop');
    if(pop && pop.style.display === 'flex' &&
       !pop.contains(e.target) && e.target.id !== 'edb-offset'){
      pop.style.display = 'none';
    }
  }, { passive: true });

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
        if(window._edIsTouch){
          // Android: picker HSL propio (sin cuentagotas)
          _edShowColorPicker((hex, commit) => {
            edDrawColor = hex;
            if(commit){ edColorPalette[edSelectedPaletteIdx]=hex; _edUpdatePaletteDots(); }
            _edbSyncColor();
          });
        } else {
          // PC: selector nativo del navegador (con cuentagotas)
          const _inp=document.createElement('input'); _inp.type='color'; _inp.value=edDrawColor;
          _inp.style.cssText='position:fixed;opacity:0;width:0;height:0;';
          document.body.appendChild(_inp);
          _inp.addEventListener('input', ev=>{ edDrawColor=ev.target.value; _edbSyncColor(); });
          _inp.addEventListener('change', ()=>{
            edColorPalette[edSelectedPaletteIdx]=edDrawColor;
            _edUpdatePaletteDots(); _edbSyncColor(); _inp.remove();
          });
          _inp.click();
        }
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
  // Ocultar botón offset cuando se usa fill o en PC (solo táctil)
  const isFill = t === 'fill';
  const offsetBtn = $('edb-offset');
  if(offsetBtn) offsetBtn.style.display = (isFill || !window._edIsTouch) ? 'none' : '';
  if(isFill || !window._edIsTouch) { const pop=$('edb-offset-pop'); if(pop) pop.style.display='none'; }
  _edbSyncOffsetBtn();
  _edbSyncSize();
  _edbSyncColor();
}
function _edbSyncOffsetBtn(){
  // Botón único de la barra flotante
  const edbBtn = $('edb-offset');
  if(edbBtn){
    edbBtn.classList.toggle('active', _edCursorOffset);
    edbBtn.style.opacity = _edCursorOffset ? '1' : '0.5';
  }
  // Marcar el botón activo dentro del popover de la barra
  [{id:'edb-offset-pop-l', a:40},{id:'edb-offset-pop-r', a:-40}].forEach(({id,a}) => {
    const b = $(id); if(!b) return;
    const on = _edCursorOffset && _edCursorOffsetAngle === a;
    b.style.background = on ? 'rgba(255,255,255,0.2)' : 'transparent';
  });
  // Botón único del panel
  const opBtn = $('op-offset-btn');
  if(opBtn){
    opBtn.style.background = _edCursorOffset ? 'var(--black)' : 'transparent';
    opBtn.style.color = _edCursorOffset ? 'var(--white)' : 'var(--gray-700)';
  }
}

function _edbSyncColor() {
  const sw = $('edb-color'); if (!sw) return;
  sw.style.background = edDrawColor;
  sw.style.display = edActiveTool === 'eraser' ? 'none' : '';
  // También actualizar el swatch de la barra de polígonos
  const sw2 = $('esb-color'); if(sw2) sw2.style.background = edDrawColor;
  // Actualizar preview del panel de grosor si está abierto
  _edbSyncSizePreview();
  // Refrescar cursor offset si está visible y hay posición guardada
  _edRefreshOffsetCursor();
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
  const isEr = edActiveTool === 'eraser';
  const sz   = isEr ? edEraserSize : edDrawSize;
  // Mostrar/ocultar botones según herramienta activa
  const btnPen = $('edb-pen-size');
  const btnEr  = $('edb-eraser-size');
  if(btnPen) btnPen.style.display = isEr ? 'none' : '';
  if(btnEr)  btnEr.style.display  = isEr ? '' : 'none';
  // Sincronizar slider y número
  const num = $('edb-size-num');
  if(num){ num.value=sz; num.max=isEr?80:48; }
  const sl = $('edb-size-slider');
  if(sl){ sl.value=sz; sl.max=isEr?80:48; }
  _edbSyncSizePreview();
  // Refrescar cursor offset si está visible y hay posición guardada
  _edRefreshOffsetCursor();
}

// Actualiza el círculo de preview en el panel de grosor
function _edbSyncSizePreview() {
  const pop = $('edb-size-pop');
  if(!pop || pop.style.display==='none') return;
  const isEr = edActiveTool === 'eraser';
  const sz   = isEr ? edEraserSize : edDrawSize;
  const prev = $('edb-size-preview');
  if(!prev) return;
  // Lápiz: círculo del color seleccionado, tamaño escala con zoom
  // Goma: círculo blanco con borde, tamaño fijo
  const _dz = typeof edCamera!=='undefined' ? edCamera.z : 1;
  let d, color, border;
  // Lápiz y goma: mismo comportamiento — preview = sz * z (tamaño visible en pantalla)
  d = Math.max(3, Math.min(44, Math.round(sz * _dz)));
  if(isEr){
    color = '#ffffff';
    border = '2px solid rgba(180,180,180,0.6)';
  } else {
    color = edDrawColor || '#000000';
    border = 'none';
  }
  prev.style.width  = d+'px';
  prev.style.height = d+'px';
  prev.style.background = color;
  prev.style.border = border;
  prev.style.boxShadow = isEr ? 'none' : '0 0 0 1.5px rgba(255,255,255,0.25)';
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
  // Default cursor offset: activado en táctil, desactivado en PC — solo si aún no se ha usado
  if(typeof _edCursorOffsetInitialized === 'undefined'){
    window._edCursorOffsetInitialized = true;
    _edCursorOffset = !!(window._edIsTouch);
  }
  _edbSyncTool();
}

function edDrawBarHide() {
  $('edDrawBar')?.classList.remove('visible');
  _edbClosePalette();
  _edOffsetHide();
}

/* ══════════════════════════════════════════
   BARRA FLOTANTE SHAPE / LINE
   ══════════════════════════════════════════ */
let _esbX = 12, _esbY = 120;

function edShapeBarShow() {
  const bar = $('edShapeBar'); if(!bar) return;
  bar.classList.add('visible');
  _edShapeInitHistory();
  if (_esbX === 12 && _esbY === 120) {
    const pos = _edBarDefaultPos(bar);
    _esbX = pos.x; _esbY = pos.y;
  }
  bar.style.left = _esbX + 'px';
  bar.style.top  = _esbY + 'px';
  _esbSync();
}
function edShapeBarHide() {
  // Ocultar slider directamente por DOM (no depender del closure de edInitShapeBar)
  const _sp=$('esb-slider-panel');
  if(_sp){ _sp.style.display='none'; _sp._mode=null; }
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
    const _dz2 = typeof edCamera !== 'undefined' ? edCamera.z : 1;
    const d = Math.max(3, Math.min(22, Math.round((la.lineWidth||0) * _dz2)));
    dot.style.cssText = `width:${d}px;height:${d}px;border-radius:50%;background:#fff;display:inline-block;`;
  }
}

// Congela un LineLayer con radios en un StrokeLayer, guardando los datos geométricos
function _edFreezeLineLayer(la, idx) {
  if(la.type !== 'line') return;
  const cr = la.cornerRadii || {};
  const hasR = Object.keys(cr).some(k => (cr[k]||0) > 0);
  if(!hasR) return; // sin radios, no congelar

  // Renderizar el LineLayer en un canvas del tamaño del workspace
  const offW = ED_CANVAS_W, offH = ED_CANVAS_H;
  const off = document.createElement('canvas');
  off.width = offW; off.height = offH;
  const octx = off.getContext('2d');
  // Aplicar transformación idéntica a edRedraw
  octx.setTransform(1,0,0,1,0,0);
  la.draw(octx);

  // Crear StrokeLayer con el bitmap
  const sl = new StrokeLayer(off);
  // Copiar propiedades comunes
  sl.opacity = la.opacity ?? 1;
  sl.rotation = la.rotation || 0;
  // Guardar datos geométricos originales para descongelar
  sl._frozenLine = {
    points: la.points.map(p=>({...p})),
    cornerRadii: {...cr},
    color: la.color,
    fillColor: la.fillColor,
    lineWidth: la.lineWidth,
    closed: la.closed,
    opacity: la.opacity ?? 1,
    rotation: la.rotation || 0,
    // Guardar dimensiones originales para calcular transformaciones al descongelar
    origX: la.x, origY: la.y,
    origW: la.width, origH: la.height,
  };
  // Reemplazar la capa en el array
  edLayers[idx] = sl;
  edPages[edCurrentPage].layers[idx] = sl;
  edSelectedIdx = idx;
  edPushHistory();
  edRedraw();
}

// Descongela un StrokeLayer congelado de vuelta a LineLayer editable
function _edUnfreezeLineLayer(la, idx) {
  if(la.type !== 'stroke' || !la._frozenLine) return;
  const d = la._frozenLine;
  const pw = edPageW(), ph = edPageH();

  // Factores de transformación: ratio entre dimensiones actuales y originales
  const origW = d.origW || la.width;
  const origH = d.origH || la.height;
  const scaleX = origW > 0.001 ? la.width  / origW : 1;
  const scaleY = origH > 0.001 ? la.height / origH : 1;
  // Diferencia de rotación entre el estado actual y el original
  const rotDelta = ((la.rotation||0) - (d.rotation||0)) * Math.PI / 180;
  const cosD = Math.cos(rotDelta), sinD = Math.sin(rotDelta);

  const ll = new LineLayer();
  // Aplicar escala asimétrica a los puntos (en espacio local, en px)
  ll.points = d.points.map(p => {
    // Escalar en espacio local
    const lpx = p.x * pw * scaleX;
    const lpy = p.y * ph * scaleY;
    // Rotar por el delta de rotación
    const rx = (lpx * cosD - lpy * sinD) / pw;
    const ry = (lpx * sinD + lpy * cosD) / ph;
    return {x: rx, y: ry};
  });
  // Escalar también los radios de curva
  const cr = d.cornerRadii || {};
  ll.cornerRadii = {};
  for(const k in cr){
    if(cr[k]) ll.cornerRadii[k] = cr[k] * Math.min(scaleX, scaleY);
  }
  ll.color = la.color || d.color;       // respetar cambios de color
  ll.fillColor = la.fillColor || d.fillColor;
  ll.lineWidth = la.lineWidth || d.lineWidth;
  ll.closed = d.closed;
  ll.opacity = la.opacity ?? d.opacity;
  ll.rotation = la.rotation || 0;       // usar rotación actual
  // Posición: usar la posición actual del StrokeLayer
  ll.x = la.x; ll.y = la.y;
  ll._updateBbox();
  edLayers[idx] = ll;
  edPages[edCurrentPage].layers[idx] = ll;
  edSelectedIdx = idx;
  edPushHistory();
  edRedraw();
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
    // Reposicionar slider adjunto si está visible
    const _sp2=$('esb-slider-panel');
    if(_sp2&&_sp2.style.display!=='none'){
      const _br2=bar.getBoundingClientRect();
      const _pr2=_sp2.getBoundingClientRect();
      const _isH=bar.classList.contains('horiz');
      const _vw=window.innerWidth,_vh=window.innerHeight,_G=6;
      let _l,_t;
      if(_isH){_t=_br2.top-_pr2.height-_G>=0?_br2.top-_pr2.height-_G:_br2.bottom+_G;_l=Math.max(_G,Math.min(_vw-_pr2.width-_G,_br2.left+_br2.width/2-_pr2.width/2));}
      else{_l=_br2.right+_G+_pr2.width<=_vw?_br2.right+_G:_br2.left-_pr2.width-_G;_t=Math.max(_G,Math.min(_vh-_pr2.height-_G,_br2.top+_br2.height/2-_pr2.height/2));}
      _sp2.style.left=_l+'px'; _sp2.style.top=_t+'px';
    }
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
    _edPickColor(e, la.color||'#000000',
      hex=>{ la.color=hex; _esbSync(); edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
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
    _edPickColor(e, cur,
      hex=>{ la.fillColor=hex; la._lastFillColor=hex; _esbSync(); edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
  });


  // ── Helper: posicionar y mostrar slider adjunto a edShapeBar ──
  function _esbShowSlider(mode, minVal, maxVal, curVal, onInput, onChange){
    const bar=$('edShapeBar'); const panel=$('esb-slider-panel'); const sl=$('esb-slider-input');
    if(!bar||!panel||!sl) return;
    // Si ya está el mismo modo activo, cerrar
    if(panel.style.display!=='none' && panel._mode===mode){ panel.style.display='none'; panel._mode=null; return; }
    panel._mode=mode;
    sl.min=minVal; sl.max=maxVal; sl.value=curVal;
    const isHoriz=bar.classList.contains('horiz');
    // Slider con MISMA orientación que la barra
    // Barra horizontal → slider horizontal pegado arriba o abajo
    // Barra vertical   → slider vertical pegado a derecha o izquierda
    sl.style.writingMode=isHoriz?'horizontal-tb':'vertical-lr';
    sl.style.width=isHoriz?'120px':'20px';
    sl.style.height=isHoriz?'20px':'120px';
    panel.style.flexDirection=isHoriz?'column':'row';
    panel.style.display='flex';
    panel.style.left='-9999px'; panel.style.top='-9999px';
    requestAnimationFrame(()=>{
      const br=bar.getBoundingClientRect();
      const pr=panel.getBoundingClientRect();
      const vw=window.innerWidth, vh=window.innerHeight, GAP=6;
      let left, top;
      if(isHoriz){
        // Barra horizontal: slider horizontal arriba o abajo
        top = br.top-pr.height-GAP>=0 ? br.top-pr.height-GAP : br.bottom+GAP;
        left = Math.max(GAP, Math.min(vw-pr.width-GAP, br.left+br.width/2-pr.width/2));
      } else {
        // Barra vertical: slider vertical a derecha o izquierda
        left = br.right+GAP+pr.width<=vw ? br.right+GAP : br.left-pr.width-GAP;
        top  = Math.max(GAP, Math.min(vh-pr.height-GAP, br.top+br.height/2-pr.height/2));
      }
      panel.style.left=left+'px'; panel.style.top=top+'px';
    });
    sl._onInput=onInput; sl._onChange=onChange;
  }
  function _esbHideSlider(){ const p=$('esb-slider-panel'); if(p){p.style.display='none';p._mode=null;} }
  // Listener único del slider
  $('esb-slider-input')?.addEventListener('input',e=>{ e.target._onInput&&e.target._onInput(+e.target.value); });
  $('esb-slider-input')?.addEventListener('change',e=>{ e.target._onChange&&e.target._onChange(+e.target.value); });
  $('esb-slider-input')?.addEventListener('pointerdown',e=>e.stopPropagation());

  // Grosor — slider adjunto a la barra
  $('esb-size')?.addEventListener('click', e => {
    if(_locked) return; e.stopPropagation();
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    const sz=la?.lineWidth??3;
    _esbShowSlider('size', 0, 20, sz,
      v=>{ const l=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(l){l.lineWidth=v; edRedraw(); _edShapeBarSync&&_edShapeBarSync();} },
      v=>{
        _edShapePushHistory();
      }
    );
  });

  // Opacidad — slider adjunto a la barra
  $('esb-opacity')?.addEventListener('click', e => {
    if(_locked) return; e.stopPropagation();
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    const op=la?Math.round((la.opacity??1)*100):100;
    _esbShowSlider('opacity', 0, 100, op,
      v=>{ const l=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(l){l.opacity=v/100; edRedraw();} },
      v=>{ _edShapePushHistory(); }
    );
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
      _esbHideSlider();
      edRedraw(); return;
    }
    edRedraw(); // actualizar vértices a verde inmediatamente al activar V⟺C
    const _savedSelCurve=edSelectedIdx;
    const curR=window._edCurveRadius||0;
    _esbShowSlider('curve', 0, 200, curR,
      v=>{
        // onInput: previsualizar la curva en tiempo real (solo visual, no hornear)
        window._edCurveRadius=v;
        const la2=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
        const vi=window._edCurveVertIdx;
        if(la2&&vi>=0){
          if(la2.type==='line'){ if(!la2.cornerRadii)la2.cornerRadii={}; la2.cornerRadii[vi]=v; la2._updateBbox(); }
          else if(la2.type==='shape'&&la2.shape==='rect'){ if(!la2.cornerRadii)la2.cornerRadii=[0,0,0,0]; la2.cornerRadii[vi]=v; }
          edRedraw();
        }
      },
      v=>{ _edShapePushHistory(); }
    );
    // El slider permanece abierto hasta que se desactive V⟺C pulsando el botón de nuevo
  });

  // Deshacer/Rehacer
  $('esb-undo')?.addEventListener('click', ()=>{ if(_locked) return; edShapeUndo(); });
  $('esb-redo')?.addEventListener('click', ()=>{ if(_locked) return; edShapeRedo(); });

  // OK
  $('esb-ok')?.addEventListener('click', ()=>{
    if(_locked) return;
    edPushHistory(); _edShapeClearHistory();
    // Desactivar V⟺C si estaba activo
    const _curveBtn=$('esb-curve');
    if(_curveBtn){ _curveBtn.dataset.curveActive='0'; _curveBtn.style.background=''; _curveBtn.style.color=''; _curveBtn.style.outline=''; }
    window._edCurveVertIdx=-1;
    edShapeBarHide();
    window._edMinimizedDrawMode=null;
    // Limpiar estado antes de maximizar
    edSelectedIdx=-1;
    edActiveTool='select'; edCanvas.className='';
    const _panel=$('edOptionsPanel');
    if(_panel){ _panel.style.visibility=''; _panel.classList.remove('open'); _panel.innerHTML=''; delete _panel.dataset.mode; }
    _edDrawUnlockUI();
    edMaximize();
    edRedraw();
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
    // Sincronizar biblioteca con la nube
    const user = Auth?.currentUser?.();
    if (user && user.id) {
      try {
        await SupabaseClient.bibSync(user.id, _bibLoad());
      } catch(e) { console.warn('bibSync error (no crítico):', e); }
    }
  } catch(err) {
    edToast('⚠️ ' + (err.message || 'Error al guardar en nube'));
    console.error('edCloudSave:', err);
  } finally {
    if (btn) { btn.textContent = '☁️'; btn.disabled = false; }
  }
}

function edSaveProject(){
  if(!edProjectId){edToast('Sin proyecto activo');return;}
  // Asegurar que las reglas de la hoja actual están guardadas en edPages antes de serializar
  const existing=ComicStore.getById(edProjectId)||{};
  // Guardar estado de cámara para restaurarlo al volver a editar
  const _camState = { x: edCamera.x, y: edCamera.y, z: edCamera.z, page: edCurrentPage };
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
      pages:(()=>{
        const _savedOrient=edOrientation, _savedPage=edCurrentPage;
        const result=edPages.map((p,_pi)=>{
          edCurrentPage=_pi;
          edOrientation=p.orientation||_savedOrient;
          const layers=p.layers.map(edSerLayer).filter(Boolean);
          return {layers,textLayerOpacity:p.textLayerOpacity??1,textMode:p.textMode||'sequential',orientation:p.orientation||_savedOrient};
        });
        edOrientation=_savedOrient; edCurrentPage=_savedPage;
        return result;
      })(),
      _rules: edRules,
    },
    updatedAt:new Date().toISOString(),
    cameraState: _camState,
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

/* ══════════════════════════════════════════
   GROUP LAYER — contenedor de capas agrupadas
   ══════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   SISTEMA DE GRUPOS — basado en groupId
   ══════════════════════════════════════════════════════════════
   Cada objeto agrupado lleva groupId (string único).
   Al tocar cualquier miembro → autoselección múltiple del grupo.
   Al desagrupar → se elimina groupId de todos los miembros.
   Sin GroupLayer. Sin transformaciones. Siempre funciona.
   ══════════════════════════════════════════════════════════════ */

function _edNewGroupId(){
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

/* Índices de todos los miembros del grupo en edLayers */
function _edGroupMemberIdxs(groupId){
  const idxs = [];
  for(let i=0; i<edLayers.length; i++){
    if(edLayers[i] && edLayers[i].groupId === groupId) idxs.push(i);
  }
  return idxs;
}

/* ── Agrupar los layers de edMultiSel ── */
function edGroupSelected(){
  if(!edMultiSel.length || edMultiSel.length < 2) return;
  edPushHistory();
  const gid = _edNewGroupId();
  edMultiSel.forEach(i => { if(edLayers[i]) edLayers[i].groupId = gid; });
  // Volver a herramienta select tras agrupar
  _edDeactivateMultiSel();
  edPushHistory(); edRedraw();
  edToast('Agrupados ✓');
}

/* ── Desagrupar: elimina groupId de todos los miembros del grupo activo ── */
function edUngroupSelected(){
  // Puede llamarse con un objeto seleccionado (edSelectedIdx) o con multiselección
  let gid = null;
  if(edSelectedIdx >= 0 && edLayers[edSelectedIdx]?.groupId){
    gid = edLayers[edSelectedIdx].groupId;
  } else if(edMultiSel.length){
    gid = edLayers[edMultiSel[0]]?.groupId;
  }
  if(!gid) return;
  edPushHistory();
  edLayers.forEach(l => { if(l && l.groupId === gid) delete l.groupId; });
  edSelectedIdx = -1; _msClear();
  // Restaurar herramienta previa si estaba en modo grupo silencioso
  if(window._edGroupSilentTool !== undefined){
    edActiveTool = window._edGroupSilentTool;
    delete window._edGroupSilentTool;
  } else if(edActiveTool === 'multiselect'){
    // Por si acaso quedó en multiselect sin flag
    edActiveTool = 'select';
    edCanvas.className = '';
    $('edMultiSelBtn')?.classList.remove('active');
  }
  // Cerrar panel de opciones si estaba abierto
  edCloseOptionsPanel();
  edPushHistory(); edRedraw();
  edToast('Desagrupados ✓');
}



function edSerLayer(l){
  const op = l.opacity !== undefined ? {opacity:l.opacity} : {};
  if(l.type==='image'){
    const compressedSrc = _edCompressImageSrc(l.src || (l.img ? l.img.src : ''));
    const _r={type:'image',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,src:compressedSrc,...op};
    if(l.groupId) _r.groupId=l.groupId;
    return _r;
  }
  if(l.type==='text'){const _o={type:'text',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    _hasText:!!(l.text&&l.text!=='Escribe aquí'),
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,fontBold:l.fontBold||false,fontItalic:l.fontItalic||false,color:l.color,
    backgroundColor:l.backgroundColor,bgOpacity:l.bgOpacity??1,borderColor:l.borderColor,borderWidth:l.borderWidth,
    padding:l.padding||10,...op};
    if(l.groupId)_o.groupId=l.groupId; return _o;}
  if(l.type==='bubble'){
    const _bobj={type:'bubble',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
      _hasText:!!(l.text&&l.text!=='Escribe aquí'),
      text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,fontBold:l.fontBold||false,fontItalic:l.fontItalic||false,color:l.color,
      backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,
      tail:l.tail,style:l.style,tailStart:{...l.tailStart},tailEnd:{...l.tailEnd},voiceCount:l.voiceCount||1,
      tailStarts:l.tailStarts?l.tailStarts.map(s=>({...s})):undefined,tailEnds:l.tailEnds?l.tailEnds.map(e=>({...e})):undefined,
      padding:l.padding||15,
      explosionRadii:l.explosionRadii?l.explosionRadii.map(v=>({...v})):undefined,
      thoughtBig:l.thoughtBig?{...l.thoughtBig}:undefined,
      thoughtSmall:l.thoughtSmall?{...l.thoughtSmall}:undefined,
      ...op};
    if(l.groupId)_bobj.groupId=l.groupId;
    // Para estilos complejos: guardar bitmap completo (forma+cola+texto) para reproducción fiel
    if(l.style==='thought'||l.style==='explosion'){
      try{
        const _pw=edPageW(),_ph=edPageH();
        // Para thought: bitmap sin texto (el reader lo superpone centrado)
        // Para explosion: bitmap CON texto (el centroide de los valles es complejo)
        const _savedText=l.text;
        if(l.style==='thought') l.text='';

        // Calcular bbox que incluye bocadillo + cola completa
        const _bpad=Math.ceil((l.borderWidth||2)/2)+6;
        // Para thought: el bbox real de los círculos es w/4+w/3=7w/12 en X, h/4+h/3=7h/12 en Y
        const _thoughtOverX = l.style==='thought' ? l.width*7/12  : l.width/2;
        const _thoughtOverY = l.style==='thought' ? l.height*7/12 : l.height/2;
        let _maxOX=_thoughtOverX, _maxOY=_thoughtOverY;
        // Cola convencional (tailStarts/tailEnds)
        const _tails=[...(l.tailStarts||[l.tailStart||{x:-0.4,y:0.4}]),
                       ...(l.tailEnds  ||[l.tailEnd  ||{x:-0.4,y:0.6}])];
        _tails.forEach(t=>{
          _maxOX=Math.max(_maxOX,Math.abs((t.x||0)*l.width));
          _maxOY=Math.max(_maxOY,Math.abs((t.y||0)*l.height));
        });
        // Cola thought (thoughtBig/thoughtSmall son relativos al tamaño del bocadillo)
        if(l.style==='thought'&&l.tail){
          const _tB=l.thoughtBig  ||{x:0.35,y:0.55};
          const _tS=l.thoughtSmall||{x:0.55,y:0.80};
          _maxOX=Math.max(_maxOX,Math.abs(_tB.x)*l.width+0.25*l.width);
          _maxOY=Math.max(_maxOY,Math.abs(_tB.y)*l.height+0.25*l.height);
          _maxOX=Math.max(_maxOX,Math.abs(_tS.x)*l.width+0.15*l.width);
          _maxOY=Math.max(_maxOY,Math.abs(_tS.y)*l.height+0.15*l.height);
        }

        // Renderizar en workspace completo (como LineLayer) — draw() usa coordenadas absolutas
        const _full=document.createElement('canvas');
        _full.width=ED_CANVAS_W; _full.height=ED_CANVAS_H;
        const _fctx=_full.getContext('2d');
        l.draw(_fctx,_full);
        l.text=_savedText;

        // Recortar zona del bocadillo + cola con bbox calculado
        const _cx=edMarginX()+l.x*_pw, _cy=edMarginY()+l.y*_ph;
        const _ox=Math.max(0,Math.round(_cx-_maxOX*_pw-_bpad));
        const _oy=Math.max(0,Math.round(_cy-_maxOY*_ph-_bpad));
        const _ow=Math.min(_full.width-_ox, Math.round(_maxOX*2*_pw+_bpad*2));
        const _oh=Math.min(_full.height-_oy, Math.round(_maxOY*2*_ph+_bpad*2));
        const _crop=document.createElement('canvas');
        _crop.width=_ow; _crop.height=_oh;
        _crop.getContext('2d').drawImage(_full,_ox,_oy,_ow,_oh,0,0,_ow,_oh);
        _bobj.renderDataUrl=_crop.toDataURL('image/png');
        _bobj._renderPad=_bpad;
        _bobj._renderW=_maxOX*2;
        _bobj._renderH=_maxOY*2;
      }catch(e){}
    }
    return _bobj;
  }
  if(l.type==='group') return null; // obsoleto
  if(l.type==='draw'){const _o={type:'draw', dataUrl:l.toDataUrl()}; if(l.groupId)_o.groupId=l.groupId; return _o;}
  if(l.type==='stroke'){const _o={type:'stroke', dataUrl:l.toDataUrl(),
    x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0, opacity:l.opacity,
    color:l.color||'#000000', lineWidth:l.lineWidth??3}; if(l.groupId)_o.groupId=l.groupId; return _o;}
  if(l.type==='shape'){
    const _sobj={type:'shape', shape:l.shape, x:l.x, y:l.y,
      width:l.width, height:l.height, rotation:l.rotation||0,
      color:l.color, fillColor:l.fillColor||'none', lineWidth:l.lineWidth, opacity:l.opacity??1,
      cornerRadii:l.cornerRadii?[...l.cornerRadii]:undefined,
      cornerRadius:l.cornerRadius||0};
    if(l.groupId)_sobj.groupId=l.groupId;
    // Si tiene cornerRadii con valores, generar bitmap fiel
    const _hasCR=l.cornerRadii&&l.cornerRadii.some&&l.cornerRadii.some(r=>r>0);
    const _hasCRg=l.cornerRadius&&l.cornerRadius>0;
    if(_hasCR||_hasCRg){
      try{
        const _pw=edPageW(),_ph=edPageH();
        const _savedRot=l.rotation||0; l.rotation=0;
        const _pad=Math.ceil((l.lineWidth||3)/2)+2;
        const _bw=Math.round(l.width*_pw+_pad*2);
        const _bh=Math.round(l.height*_ph+_pad*2);
        const _crop=document.createElement('canvas');
        _crop.width=_bw; _crop.height=_bh;
        const _cctx=_crop.getContext('2d');
        const _dx=_bw/2-(edMarginX()+l.x*_pw);
        const _dy=_bh/2-(edMarginY()+l.y*_ph);
        _cctx.translate(_dx,_dy);
        l.draw(_cctx);
        l.rotation=_savedRot;
        _sobj.renderDataUrl=_crop.toDataURL('image/png');
        _sobj._renderPad=_pad;
      }catch(e){}
    }
    return _sobj;
  }
  if(l.type==='line'){
    const _cr=l.cornerRadii||{};
    const _hasR=Object.keys(_cr).some(k=>(_cr[k]||0)>0);
    const _lobj={type:'line', points:l.points.slice(),
      x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0,
      closed:l.closed, color:l.color, fillColor:l.fillColor||'#ffffff', lineWidth:l.lineWidth, opacity:l.opacity??1,
      cornerRadii:_hasR?{..._cr}:undefined};
    if(l.groupId)_lobj.groupId=l.groupId;
    if(_hasR){
      try{
        const _pw=edPageW(),_ph=edPageH();
        // Renderizar SIN rotación para que el reader la aplique una sola vez
        const _savedRot=l.rotation||0; l.rotation=0;
        const _full=document.createElement('canvas');
        _full.width=ED_CANVAS_W; _full.height=ED_CANVAS_H;
        const _fctx=_full.getContext('2d');
        l.draw(_fctx);
        l.rotation=_savedRot;
        // Recortar zona del objeto con margen para el trazo
        const _pad=Math.ceil((l.lineWidth||3)/2)+2;
        const _cx=edMarginX()+l.x*_pw, _cy=edMarginY()+l.y*_ph;
        const _hw=l.width*_pw/2, _hh=l.height*_ph/2;
        const _ox=Math.max(0,Math.round(_cx-_hw-_pad));
        const _oy=Math.max(0,Math.round(_cy-_hh-_pad));
        const _ow=Math.min(_full.width-_ox, Math.round(_hw*2+_pad*2));
        const _oh=Math.min(_full.height-_oy, Math.round(_hh*2+_pad*2));
        const _crop=document.createElement('canvas');
        _crop.width=_ow; _crop.height=_oh;
        _crop.getContext('2d').drawImage(_full,_ox,_oy,_ow,_oh,0,0,_ow,_oh);
        _lobj.renderDataUrl=_crop.toDataURL('image/png');
        _lobj._renderPad=_pad;
      }catch(e){}
    }
    return _lobj;
  }
}
function edDeserLayer(d, pageOrientation){
  if(!d) return null;
  if(d.type==='group') return null; // obsoleto
  if(d.type==='draw'){
    const _isV = (pageOrientation||'vertical')==='vertical';
    const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
    const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
    const dl = d.dataUrl ? DrawLayer.fromDataUrl(d.dataUrl, _pw, _ph) : new DrawLayer();
    if(d.groupId) dl.groupId=d.groupId;
    return dl;
  }
  if(d.type==='stroke'){
    const _isV = (pageOrientation||'vertical')==='vertical';
    const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
    const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
    const sl = StrokeLayer.fromDataUrl(d.dataUrl||'', d.x||0.5, d.y||0.5, d.width||0.1, d.height||0.1, _pw, _ph);
    if(d.rotation) sl.rotation = d.rotation;
    if(d.opacity !== undefined) sl.opacity = d.opacity;
    if(d.color) sl.color = d.color;
    if(d.lineWidth !== undefined) sl.lineWidth = d.lineWidth;
    if(d.groupId) sl.groupId = d.groupId;
    return sl;
  }
  if(d.type==='shape'){
    const l=new ShapeLayer(d.shape||'rect',d.x||0.5,d.y||0.5,d.width||0.3,d.height||0.2);
    l.color=d.color||'#000'; l.fillColor=d.fillColor||'none'; l.lineWidth=d.lineWidth??3; l.rotation=d.rotation||0; l.opacity=d.opacity??1;
    if(d.cornerRadius) l.cornerRadius=d.cornerRadius;
    if(d.cornerRadii) l.cornerRadii=Array.isArray(d.cornerRadii)?[...d.cornerRadii]:{...d.cornerRadii};
    if(d.groupId) l.groupId=d.groupId;
    return l;
  }
  if(d.type==='line'){
    const l=new LineLayer();
    l.points=d.points||[]; l.closed=d.closed||false;
    l.color=d.color||'#000'; l.fillColor=d.fillColor||'#ffffff'; l.lineWidth=d.lineWidth??3; l.opacity=d.opacity??1;
    l.rotation=d.rotation||0;
    if(d.cornerRadii) l.cornerRadii=Array.isArray(d.cornerRadii)?[...d.cornerRadii]:{...d.cornerRadii};
    if(d.x!=null){l.x=d.x;l.y=d.y;l.width=d.width||0.01;l.height=d.height||0.01;}
    else l._updateBbox();
    if(d.groupId) l.groupId=d.groupId;
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
    if(d.locked) l.locked=true;
    if(d._keepSize) l._keepSize=true;
    if(d.height) l.height = d.height;
    if(d.groupId) l.groupId=d.groupId;
    if(d.src){
      const img=new Image();
      img.onload=()=>{
        l.img=img; l.src=img.src;
        if(l._keepSize){ edRedraw(); return; }
        const _isV = (pageOrientation||'vertical') === 'vertical';
        const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
        const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
        const _natH = l.width * (img.naturalHeight / img.naturalWidth) * (_pw / _ph);
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
    edRules = comic.editorData._rules || [];
    edPages=(comic.editorData.pages||[]).map(pd=>{
      const orient = pd.orientation||comic.editorData.orientation||'vertical';
      const layers = (pd.layers||[]).map(d=>edDeserLayer(d, orient)).filter(Boolean);
      // Migrar drawData legado (versiones <5.20) a DrawLayer si no hay DrawLayer ya
      if(pd.drawData && !layers.find(l=>l.type==='draw')){
        const _isV = orient==='vertical';
        layers.unshift(DrawLayer.fromDataUrl(pd.drawData, _isV?ED_PAGE_W:ED_PAGE_H, _isV?ED_PAGE_H:ED_PAGE_W)); // legacy
      }
      return {
        drawData: null,
        layers,
        textLayerOpacity: pd.textLayerOpacity??1,
        textMode: pd.textMode||'sequential',
        orientation: orient,
      };
    });
  }else{
    edOrientation='vertical';edPages=[{layers:[],drawData:null,textLayerOpacity:1,textMode:'sequential',orientation:'vertical'}];
    edRules=[];
  }
  if(!edPages.length)edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'sequential'});
  edCurrentPage=0;edLayers=edPages[0].layers;
  // Reconstruir _cache de grupos en todas las páginas (buildCache usa edOrientation/edCurrentPage)
  edPages.forEach((pg, _pgi) => {
    const _savedP=edCurrentPage, _savedO=edOrientation;
    edCurrentPage=_pgi; edOrientation=pg.orientation||edOrientation;
    edCurrentPage=_savedP; edOrientation=_savedO;
  });
  // Centrar cámara al cargar — flag dedicado para no interferir con otros resets
  window._edLoadReset=true;
  if(edCanvas){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      window._edUserRequestedReset=true; edFitCanvas(true);
      setTimeout(()=>{
        if(window._edLoadReset){
          window._edLoadReset=false;
          window._edUserRequestedReset=true; edFitCanvas(true);
        }
      }, 150);
      edRedraw();
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
  // Esperar fuentes antes del primer render para evitar fallback en bocadillos/texto
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    edUpdateViewer();
    edInitViewerTap();
  });
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
    if(l.type==='image'){
      fctx.globalAlpha = l.opacity ?? 1; l.draw(fctx, full); fctx.globalAlpha = 1;
    } else if(l.type==='draw'){
      fctx.globalAlpha = l.opacity ?? 1; l.draw(fctx); fctx.globalAlpha = 1;
    } else if(l.type==='stroke'){
      fctx.globalAlpha = l.opacity ?? 1; l.draw(fctx); fctx.globalAlpha = 1;
    } else if(l.type==='shape' || l.type==='line'){
      fctx.globalAlpha = l.opacity ?? 1; l.draw(fctx); fctx.globalAlpha = 1;
    }
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

  // Opacidad al 100% mientras el cuentagotas está activo
  window._edEyedropActive = true;
  edRedraw();

  // Indicador visual: cambiar cursor y mostrar toast
  canvas.style.cursor = 'crosshair';
  edToast('Toca el color a copiar…');

  // Usar AbortController para limpiar tras el primer sample
  const ac = new AbortController();
  const sig = { signal: ac.signal };

  function sampleAt(clientX, clientY) {
    ac.abort(); // un solo disparo
    canvas.style.cursor = '';

    // Leer pixel ANTES de restaurar el dimming — el canvas aún está al 100%
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = Math.round((clientX - rect.left) * scaleX);
    const cy = Math.round((clientY - rect.top)  * scaleY);
    const ctx = canvas.getContext('2d');
    const px  = ctx.getImageData(cx, cy, 1, 1).data;

    // Ahora sí restaurar el dimming
    window._edEyedropActive = false;
    edRedraw();

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
    if (e.key === 'Escape') {
      ac.abort(); canvas.style.cursor = '';
      window._edEyedropActive = false; edRedraw();
      edToast('Cuentagotas cancelado');
    }
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
  if(window._edPointerTypeFn){
    document.removeEventListener('pointerdown', window._edPointerTypeFn, true);
    window._edPointerTypeFn = null;
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

// Modal de confirmación propio — evita confirm() nativo que rompe fullscreen en Android
let _edConfirmCb = null;
function edConfirm(msg, onOk, okLabel='Eliminar'){
  const overlay = $('edConfirmModal');
  const msgEl   = $('edConfirmMsg');
  const okBtn   = $('edConfirmOk');
  const cancelBtn = $('edConfirmCancel');
  if(!overlay) { if(window.confirm(msg)) onOk(); return; } // fallback por si el DOM no está listo
  msgEl.textContent = msg;
  okBtn.textContent = okLabel;
  _edConfirmCb = onOk;
  overlay.classList.add('open');
  // Listeners de un solo uso
  const close = (exec) => {
    overlay.classList.remove('open');
    okBtn.removeEventListener('click', onYes);
    cancelBtn.removeEventListener('click', onNo);
    if(exec && _edConfirmCb) _edConfirmCb();
    _edConfirmCb = null;
  };
  const onYes = () => close(true);
  const onNo  = () => close(false);
  okBtn.addEventListener('click', onYes);
  cancelBtn.addEventListener('click', onNo);
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
    // Restaurar fullscreen usando Fullscreen.enter() — gestiona todos los casos correctamente
    // Pequeño delay para que el navegador procese el cierre del selector antes de pedir FS
    if(window._edWasFullscreen && !(document.fullscreenElement || document.webkitFullscreenElement)){
      setTimeout(()=>{
        if(typeof Fullscreen !== 'undefined') Fullscreen.enter();
        // Forzar actualización visual del botón FS por si el estado quedó desincronizado
        if(typeof Fullscreen !== 'undefined') Fullscreen._updateBtn();
      }, 300);
    }
    window._edWasFullscreen = false;
  });

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
    if(dot){ const sz=edDrawSize; const _dz3=typeof edCamera!=='undefined'?edCamera.z:1; const d=Math.max(3,Math.min(22,Math.round(sz*_dz3))); dot.style.width=d+'px'; dot.style.height=d+'px'; }
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
    edPushHistory(); _edShapeClearHistory();
    edShapeBarHide();
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
    edConfirm('¿Eliminar esta obra? Esta acción no se puede deshacer.', ()=>{
      ComicStore.remove(edProjectId);
      edToast('Obra eliminada');
      setTimeout(()=>Router.go('my-comics'),600);
    });
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
    else if(($('edOptionsPanel')?.dataset.mode==='shape' || $('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible')) && _edShapeHistIdx > _edShapeHistIdxBase) edShapeUndo();
    else edUndo();
  });
  $('edRedoBtn')?.addEventListener('click', () => {
    if(['draw','eraser','fill'].includes(edActiveTool)) edDrawRedo();
    else if(($('edOptionsPanel')?.dataset.mode==='shape' || $('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible')) && _edShapeHistIdx < _edShapeHistory.length - 1) edShapeRedo();
    else edRedo();
  });
  $('edMinimizeBtn')?.addEventListener('click',edMinimize);
  // edMenuMinBtn eliminado — el único botón ocultar es edMinimizeBtn (fuera del scroll)
  _edShapePushHistory();
  edInitFloatDrag();
  edInitDrawBar();
  edInitShapeBar();
  edInitRules();
  edInitBiblioteca();
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
    const overScrollable = e.target.closest('.ed-layers-list, .ed-pages-grid, .ed-fulloverlay-box, #edOptionsPanel');
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
      _esbHideSlider();
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
    // Ctrl+] subir | Ctrl+[ bajar | Ctrl+Alt+] al frente | Ctrl+Alt+[ al fondo
    // (estándar Figma / Illustrator / Photoshop)
    if(ctrl && (e.key === ']' || e.key === '[')){
      if(edSelectedIdx >= 0){
        e.preventDefault();
        const page = edPages[edCurrentPage]; if(!page) return;
        const layers = page.layers;
        const idx = edSelectedIdx;
        if(e.altKey){
          if(e.key === ']' && idx < layers.length - 1){
            const [moved] = layers.splice(idx, 1);
            layers.push(moved);
            edSelectedIdx = layers.length - 1;
            edPushHistory(); edRedraw(); edToast('Al frente ⬆');
          } else if(e.key === '[' && idx > 0){
            const [moved] = layers.splice(idx, 1);
            layers.unshift(moved);
            edSelectedIdx = 0;
            edPushHistory(); edRedraw(); edToast('Al fondo ⬇');
          }
        } else {
          if(e.key === ']' && idx < layers.length - 1){
            [layers[idx], layers[idx+1]] = [layers[idx+1], layers[idx]];
            edSelectedIdx = idx + 1;
            edPushHistory(); edRedraw(); edToast('Capa subida ▲');
          } else if(e.key === '[' && idx > 0){
            [layers[idx], layers[idx-1]] = [layers[idx-1], layers[idx]];
            edSelectedIdx = idx - 1;
            edPushHistory(); edRedraw(); edToast('Capa bajada ▼');
          }
        }
      }
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
    const _vecActive = $('edOptionsPanel')?.dataset.mode==='shape' || $('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible');
    if(!e.shiftKey && e.key.toLowerCase() === 'z'){
      e.preventDefault();
      if(['draw','eraser','fill'].includes(edActiveTool)) edDrawUndo();
      else if(_vecActive && _edShapeHistIdx > _edShapeHistIdxBase) edShapeUndo();
      else edUndo();
    }
    else if(e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')){
      e.preventDefault();
      if(['draw','eraser','fill'].includes(edActiveTool)) edDrawRedo();
      else if(_vecActive && _edShapeHistIdx < _edShapeHistory.length - 1) edShapeRedo();
      else edRedo();
    }
  };
  document.addEventListener('keydown', window._edKeyFn);

  // Detectar si el dispositivo está usando táctil — se actualiza con cualquier pointerdown
  // Se usa en _edPickColor para elegir el picker correcto (HSL vs nativo)
  window._edIsTouch = navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer:fine)').matches;
  window._edPointerTypeFn = ev => {
    if(ev.pointerType==='touch') window._edIsTouch=true;
    else if(ev.pointerType==='mouse') window._edIsTouch=false;
  };
  document.addEventListener('pointerdown', window._edPointerTypeFn, true);

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
        const inHSLPop   = e.target.closest('#ed-hsl-picker');
        const curveOn=$('esb-curve')?.dataset.curveActive==='1';
        if(!inCanvas && !inDrawBar && !inShapeBar && !inPanel && !inMenuBar && !inTopbar && !inCurvePop && !inHSLPop && !curveOn){
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
      if(e.target.closest('#edOptionsPanel')) return; // no interferir con scroll del panel
      if(e.touches.length === 2){
        // No hacer zoom de cámara si hay objeto seleccionado, multiselección activa o modo dibujo
        if(edSelectedIdx >= 0 || (edActiveTool==='multiselect' && edMultiSel.length) || ['draw','eraser'].includes(edActiveTool)){ _pinchPrev = 0; return; }
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
      if(e.target.closest('#edOptionsPanel')) return; // no interferir con scroll del panel
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
  const offCtx = off.getContext('2d', { alpha: true });

  // Fondo: blanco para JPG (no soporta transparencia), transparente para PNG
  if(format === 'jpg'){
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, pw, ph);
  }
  // PNG: sin fillRect → fondo transparente

  // Transform: z=1, origen en esquina superior izquierda de la página
  // (equivale a setTransform(1,0,0,1, -mx, -my) en coords workspace)
  offCtx.setTransform(1, 0, 0, 1, -mx, -my);

  // Renderizar capas en el mismo orden que edRedraw (sin UI, sin handles, sin borde azul)
  const _textLayers   = edLayers.filter(l => l.type==='text' || l.type==='bubble');
  const _textGroupAlpha = page.textLayerOpacity ?? 1;

  // Mismo orden que edRedraw: imagen → stroke → draw → shape/line → textos al final
  edLayers.forEach(l => {
    if(!l) return;
    if(l.type==='text' || l.type==='bubble') return; // textos al final
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
    } else if(l.type === 'shape' || l.type === 'line'){
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

// ═══════════════════════════════════════════════════════════════
// ── BIBLIOTECA (T8) ─────────────────────────────────────────────
// Estructura localStorage cs_biblioteca:
// { folders: [{id, name, items:[{id,timestamp,layerData,thumb}]}] }
// items sin carpeta → folder id='__root__'
// Límite global: 30 objetos entre todas las carpetas.
// ═══════════════════════════════════════════════════════════════

const _BIB_KEY        = 'cs_biblioteca';
const _BIB_MAX_BYTES  = 3 * 1024 * 1024; // 3 MB — tope de memoria para la biblioteca
const _BIB_THUMB_SIZE = 80;

// ── Storage ──────────────────────────────────────────────────────
function _bibLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(_BIB_KEY) || 'null');
    if (d && Array.isArray(d.folders)) return d;
  } catch(e) {}
  // Migración: formato antiguo era array plano
  let oldItems = [];
  try { oldItems = JSON.parse(localStorage.getItem(_BIB_KEY) || '[]'); if (!Array.isArray(oldItems)) oldItems = []; } catch(e) {}
  return { folders: [{ id: '__root__', name: 'General', items: oldItems }] };
}
function _bibSave(data) {
  try { localStorage.setItem(_BIB_KEY, JSON.stringify(data)); }
  catch(e) { edToast('⚠️ Sin espacio en biblioteca'); }
}
// Bytes estimados de la biblioteca (suma del JSON de cada item)
function _bibUsedBytes(data) {
  return data.folders.reduce((s, f) =>
    s + f.items.reduce((s2, it) => s2 + (it.thumb ? it.thumb.length : 0)
      + (it.layerData ? JSON.stringify(it.layerData).length : 0)
      + (it.layers   ? JSON.stringify(it.layers).length   : 0), 0), 0);
}
function _bibTotalItems(data) {
  return data.folders.reduce((s, f) => s + f.items.length, 0);
}
function _bibFormatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(2) + ' MB';
}
function _bibNextFolderName(data) {
  const nums = data.folders.map(f => { const m = f.name.match(/^Carpeta\s+(\d+)$/i); return m ? parseInt(m[1]) : 0; });
  return 'Carpeta ' + (Math.max(0, ...nums) + 1);
}

// ── Miniatura ─────────────────────────────────────────────────────
function _bibThumb(la) {
  const S = _BIB_THUMB_SIZE, pad = 6;
  const thumb = document.createElement('canvas');
  thumb.width = S; thumb.height = S;
  const tc = thumb.getContext('2d');
  tc.fillStyle = '#f5f5f5';
  tc.fillRect(0, 0, S, S);
  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();

  if (la.type === 'stroke' && la._canvas && la._canvas.width > 0) {
    const lw = la.width * pw, lh = la.height * ph;
    const scale = Math.min((S-pad*2)/Math.max(lw,1), (S-pad*2)/Math.max(lh,1));
    const dw=lw*scale, dh=lh*scale, dx=(S-dw)/2, dy=(S-dh)/2;
    tc.drawImage(la._canvas, 0, 0, la._canvas.width, la._canvas.height, dx, dy, dw, dh);
  } else if (la.type === 'draw' && la._canvas) {
    const scale = Math.min((S-pad*2)/Math.max(pw,1), (S-pad*2)/Math.max(ph,1));
    const dw=pw*scale, dh=ph*scale, dx=(S-dw)/2, dy=(S-dh)/2;
    tc.drawImage(la._canvas, mx, my, pw, ph, dx, dy, dw, dh);
  } else if (la.type === 'shape' || la.type === 'line') {
    _lyDrawShapeThumb(thumb, la);
  } else if (la.type === 'image' && la.img && la.img.complete && la.img.naturalWidth > 0) {
    const iw=la.img.naturalWidth, ih=la.img.naturalHeight;
    const scale=Math.min((S-pad*2)/iw, (S-pad*2)/ih);
    const dw=iw*scale, dh=ih*scale, dx=(S-dw)/2, dy=(S-dh)/2;
    tc.save(); tc.globalAlpha=la.opacity??1;
    tc.drawImage(la.img, dx, dy, dw, dh);
    tc.restore();
  } else if (la.type === 'text' || la.type === 'bubble') {
    // Mismo sistema que el panel de capas: _lyDrawThumb
    _lyDrawThumb(thumb, la);
  }
  return thumb.toDataURL('image/png');
}

// ── Guardar objeto o grupo ────────────────────────────────────────
function edBibGuardar() {
  const data = _bibLoad();
  if (_bibUsedBytes(data) >= _BIB_MAX_BYTES) {
    edToast(`Biblioteca llena (${_bibFormatSize(_bibUsedBytes(data))} / ${_bibFormatSize(_BIB_MAX_BYTES)}). Elimina algún objeto para añadir más.`, 3500);
    return;
  }

  let entry;

  // ¿Hay grupo activo (multisel silencioso o multisel normal con groupId compartido)?
  const isGroupActive = window._edGroupSilentTool !== undefined && edMultiSel.length > 1;
  const isMultiGroup  = edActiveTool === 'multiselect' && edMultiSel.length > 1 &&
                        edMultiSel.every(i => edLayers[i]?.groupId && edLayers[i].groupId === edLayers[edMultiSel[0]]?.groupId);

  if (isGroupActive || isMultiGroup) {
    // Guardar grupo completo
    const idxs = edMultiSel.slice();
    if (!idxs.length) { edToast('Selecciona un objeto primero'); return; }
    const layers = idxs.map(i => edSerLayer(edLayers[i])).filter(Boolean);
    if (!layers.length) { edToast('Error al serializar el grupo'); return; }
    // Miniatura: renderizar todas las capas del grupo juntas
    const thumb = _bibThumbGroup(idxs);
    entry = {
      id:        Date.now() + '_' + Math.random().toString(36).slice(2,7),
      timestamp: Date.now(),
      isGroup:   true,
      layers,
      thumb,
    };
  } else {
    // Objeto individual
    const la = edLayers[edSelectedIdx];
    if (!la) { edToast('Selecciona un objeto primero'); return; }
    entry = {
      id:        Date.now() + '_' + Math.random().toString(36).slice(2,7),
      timestamp: Date.now(),
      isGroup:   false,
      layerData: edSerLayer(la),
      thumb:     _bibThumb(la),
    };
  }

  const realFolders = data.folders;
  if (realFolders.length > 1) {
    _bibShowFolderPicker(entry, data);
  } else {
    realFolders[0].items.push(entry);
    _bibSave(data);
    edToast('Guardado en la biblioteca ✓');
  }
}

// Miniatura de un grupo: renderiza todas sus capas en un canvas offscreen
function _bibThumbGroup(idxs) {
  const S = _BIB_THUMB_SIZE, pad = 6;
  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();

  // Canvas workspace para renderizar todas las capas
  const off = document.createElement('canvas');
  off.width = pw; off.height = ph;
  const ctx = off.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pw, ph);
  ctx.setTransform(1, 0, 0, 1, -mx, -my);

  // Calcular bbox del grupo en coordenadas de página
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  idxs.forEach(i => {
    const la = edLayers[i];
    if (!la) return;
    ctx.globalAlpha = la.opacity ?? 1;
    la.draw(ctx, off);
    ctx.globalAlpha = 1;
    if (la.type !== 'draw') {
      minX = Math.min(minX, la.x - la.width/2);
      minY = Math.min(minY, la.y - la.height/2);
      maxX = Math.max(maxX, la.x + la.width/2);
      maxY = Math.max(maxY, la.y + la.height/2);
    }
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Si no hay bbox válido (ej. solo DrawLayers), usar página entera
  if (maxX <= minX || maxY <= minY) { minX=0; minY=0; maxX=1; maxY=1; }

  // Recortar bbox al thumb
  const bx = minX * pw, by = minY * ph;
  const bw = (maxX - minX) * pw, bh = (maxY - minY) * ph;
  const scale = Math.min((S - pad*2) / Math.max(bw, 1), (S - pad*2) / Math.max(bh, 1));
  const dw = bw * scale, dh = bh * scale;
  const dx = (S - dw) / 2, dy = (S - dh) / 2;

  const thumb = document.createElement('canvas');
  thumb.width = S; thumb.height = S;
  const tc = thumb.getContext('2d');
  tc.fillStyle = '#f5f5f5';
  tc.fillRect(0, 0, S, S);
  tc.drawImage(off, bx, by, bw, bh, dx, dy, dw, dh);

  // Icono de grupo
  tc.fillStyle = 'rgba(0,0,0,.35)';
  tc.font = 'bold 11px sans-serif';
  tc.textAlign = 'right'; tc.textBaseline = 'bottom';
  tc.fillText('⊞', S - 4, S - 2);

  return thumb.toDataURL('image/png');
}

// Popup para elegir carpeta al guardar
function _bibShowFolderPicker(entry, data) {
  // Cerrar picker anterior si existe
  document.getElementById('_bib-picker')?.remove();

  const pop = document.createElement('div');
  pop.id = '_bib-picker';
  pop.style.cssText = 'position:fixed;z-index:1300;background:var(--surface,#fff);border:1px solid var(--gray-300,#ccc);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.18);padding:8px 0;min-width:180px;max-width:260px';

  const title = document.createElement('div');
  title.style.cssText = 'padding:6px 14px 8px;font-size:.8rem;font-weight:700;color:var(--gray-600,#555);border-bottom:1px solid var(--gray-200,#eee);margin-bottom:4px';
  title.textContent = '¿En qué carpeta?';
  pop.appendChild(title);

  data.folders.forEach(folder => {
    const btn = document.createElement('button');
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:transparent;font-size:.85rem;cursor:pointer;color:var(--gray-800,#222)';
    btn.textContent = '📁 ' + folder.name;
    btn.addEventListener('pointerup', e => {
      e.stopPropagation();
      pop.remove();
      folder.items.push(entry);
      _bibSave(data);
      edToast('Guardado en "' + folder.name + '" ✓');
    });
    pop.appendChild(btn);
  });

  // Posicionar centrado en pantalla
  document.body.appendChild(pop);
  const pw2 = pop.offsetWidth || 200, ph2 = pop.offsetHeight || 160;
  pop.style.left = Math.max(8, (window.innerWidth - pw2) / 2) + 'px';
  pop.style.top  = Math.max(8, (window.innerHeight - ph2) / 2) + 'px';

  // Cerrar al tocar fuera
  const close = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', close); } };
  setTimeout(() => document.addEventListener('pointerdown', close), 50);
}

// ── Panel biblioteca ──────────────────────────────────────────────
function edBibAbrir() {
  const panel = $('edOptionsPanel');
  if (!panel) return;
  _bibRenderPanel(panel);
}

function _bibClose(panel) {
  panel.classList.remove('open');
  panel.innerHTML = '';
  delete panel.dataset.mode;
  requestAnimationFrame(edFitCanvas);
}

function _bibRenderPanel(panel) {
  const data = _bibLoad();
  const total = _bibUsedBytes(data);

  // ── HTML estático ────────────────────────────────────────────
  let html = `<div style="display:flex;flex-direction:column;width:100%;gap:0;touch-action:pan-y">`;

  html += `
  <div style="display:flex;flex-direction:row;align-items:center;padding:4px 6px 4px 8px;min-height:30px;gap:4px">
    <button id="_bib-btn-folder" style="flex-shrink:0;border:none;background:transparent;font-size:.75rem;font-weight:700;cursor:pointer;color:var(--gray-600);padding:3px 6px;border-radius:5px;white-space:nowrap">+ Carpeta</button>
    <span style="flex:1"></span>
    <span style="font-size:.72rem;color:var(--gray-500)">${_bibFormatSize(total)} / ${_bibFormatSize(_BIB_MAX_BYTES)}</span>
    <button id="_bib-close-btn" style="border:none;background:transparent;font-size:1rem;cursor:pointer;color:var(--gray-500);padding:2px 4px;line-height:1">✕</button>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>`;

  data.folders.forEach((folder, fi) => {
    const count = folder.items.length;
    // La cabecera de cada carpeta es zona de drop — data-drop-fi lo marca
    html += `
  <div class="_bib-folder" data-fi="${fi}" style="display:flex;flex-direction:column;width:100%">
    <div class="_bib-drop-zone" data-drop-fi="${fi}"
         style="display:flex;flex-direction:row;align-items:center;padding:3px 6px 3px 8px;gap:4px;background:var(--gray-50,#fafafa);transition:background .15s">
      <span style="font-size:.85rem">📁</span>
      <span class="_bib-fold-name" data-fi="${fi}"
            style="flex:1;font-size:.78rem;font-weight:700;color:var(--gray-700);cursor:text;padding:1px 2px;border-radius:3px"
            title="Toca para renombrar">${folder.name}</span>
      <span style="font-size:.68rem;color:var(--gray-400)">${count}</span>
      ${fi > 0 ? `<button class="_bib-del-folder" data-fi="${fi}" style="border:none;background:transparent;color:#c00;font-size:.75rem;cursor:pointer;padding:2px 4px;flex-shrink:0" title="Eliminar carpeta">✕</button>` : ''}
    </div>`;

    if (count === 0) {
      html += `<div class="_bib-drop-zone _bib-empty-drop" data-drop-fi="${fi}"
                    style="padding:10px 10px;font-size:.75rem;color:var(--gray-400);font-style:italic;min-height:32px;transition:background .15s">Vacía — arrastra aquí</div>`;
    } else {
      html += `<div style="padding:6px 6px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;touch-action:pan-x">
      <div class="_bib-items-row" style="display:flex;flex-direction:row;gap:7px;flex-wrap:nowrap;min-width:min-content">`;
      folder.items.forEach((it, ii) => {
        html += `
        <div class="_bib-item" data-fi="${fi}" data-ii="${ii}"
             style="position:relative;flex-shrink:0;cursor:grab;border-radius:7px;overflow:hidden;background:#f0f0f0;width:${_BIB_THUMB_SIZE}px;height:${_BIB_THUMB_SIZE}px;border:2px solid var(--gray-200);touch-action:none;user-select:none">
          <img src="${it.thumb}" width="${_BIB_THUMB_SIZE}" height="${_BIB_THUMB_SIZE}" style="display:block;pointer-events:none;user-select:none"/>
          <button class="_bib-del-item" data-fi="${fi}" data-ii="${ii}"
            style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;border:none;font-size:.75rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0"
            title="Eliminar">✕</button>
        </div>`;
      });
      html += `</div></div>`;
    }
    html += `</div>`;
    if (fi < data.folders.length - 1) html += `<div style="height:1px;background:var(--gray-200);width:100%"></div>`;
  });

  html += `<div style="height:1px;background:var(--gray-300);width:100%"></div>
  <div style="padding:4px 8px;font-size:.7rem;color:var(--gray-400)">Toca para insertar · mantén pulsado para mover a otra carpeta</div>
  </div>`;

  panel.innerHTML = html;
  panel.dataset.mode = 'biblioteca';
  panel.classList.add('open');
  requestAnimationFrame(edFitCanvas);

  // ── Cerrar ───────────────────────────────────────────────────
  panel.querySelector('#_bib-close-btn')?.addEventListener('pointerup', e => {
    e.stopPropagation(); _bibClose(panel);
  });

  // ── Crear carpeta ─────────────────────────────────────────────
  panel.querySelector('#_bib-btn-folder')?.addEventListener('pointerup', e => {
    e.stopPropagation();
    const d = _bibLoad();
    d.folders.push({ id: Date.now() + '_f', name: _bibNextFolderName(d), items: [] });
    _bibSave(d);
    _bibRenderPanel(panel);
  });

  // ── Renombrar carpeta ─────────────────────────────────────────
  panel.querySelectorAll('._bib-fold-name').forEach(el => {
    el.addEventListener('pointerup', e => {
      if (el._wasDrag) { el._wasDrag = false; return; }
      e.stopPropagation();
      const fi = parseInt(el.dataset.fi);
      const d = _bibLoad();
      const nombre = prompt('Nombre de la carpeta:', d.folders[fi].name);
      if (nombre !== null && nombre.trim()) {
        d.folders[fi].name = nombre.trim();
        _bibSave(d);
        _bibRenderPanel(panel);
      }
    });
  });

  // ── Eliminar carpeta ──────────────────────────────────────────
  panel.querySelectorAll('._bib-del-folder').forEach(btn => {
    btn.addEventListener('pointerup', e => {
      e.stopPropagation();
      const fi = parseInt(btn.dataset.fi);
      const d = _bibLoad();
      const folder = d.folders[fi];
      if (folder.items.length > 0) {
        edConfirm(`¿Eliminar la carpeta "${folder.name}" y sus ${folder.items.length} objetos?`, ()=>{
          const d2 = _bibLoad();
          d2.folders.splice(fi, 1);
          _bibSave(d2);
          edToast('Carpeta eliminada');
          _bibRenderPanel(panel);
        });
        return;
      }
      d.folders.splice(fi, 1);
      _bibSave(d);
      edToast('Carpeta eliminada');
      _bibRenderPanel(panel);
    });
  });

  // ── Eliminar item ─────────────────────────────────────────────
  panel.querySelectorAll('._bib-del-item').forEach(btn => {
    btn.addEventListener('pointerup', e => {
      e.stopPropagation();
      const fi = parseInt(btn.dataset.fi), ii = parseInt(btn.dataset.ii);
      const d = _bibLoad();
      d.folders[fi].items.splice(ii, 1);
      _bibSave(d);
      edToast('Eliminado de la biblioteca');
      _bibRenderPanel(panel);
    });
  });

  // ── Insertar item (tap rápido sin drag) ───────────────────────
  panel.querySelectorAll('._bib-item').forEach(el => {
    el.addEventListener('pointerup', e => {
      if (e.target.classList.contains('_bib-del-item')) return;
      if (el._wasDrag) { el._wasDrag = false; return; }
      e.stopPropagation();
      const fi = parseInt(el.dataset.fi), ii = parseInt(el.dataset.ii);
      const d = _bibLoad();
      const entry = d.folders[fi]?.items[ii];
      if (!entry) return;

      if (entry.isGroup && Array.isArray(entry.layers)) {
        // Insertar grupo: deserializar cada capa con nuevo groupId común
        const newGroupId = _edNewGroupId();
        let inserted = 0;
        entry.layers.forEach(ld => {
          const la = edDeserLayer(ld, edOrientation);
          if (!la) return;
          la.groupId = newGroupId;
          edLayers.push(la);
          inserted++;
        });
        if (!inserted) { edToast('Error al insertar el grupo'); return; }
      } else {
        // Objeto individual
        const newLayer = edDeserLayer(entry.layerData, edOrientation);
        if (!newLayer) { edToast('Error al insertar el objeto'); return; }
        edLayers.push(newLayer);
      }

      edSelectedIdx = -1;
      edPushHistory(); edRedraw();
      _bibClose(panel);
      edToast('Objeto insertado ✓');
    });
  });

  // ── Drag entre carpetas (Pointer Events — funciona en táctil y PC) ───────
  _bibBindDrag(panel);
}

// Estado de drag
let _bibDrag = null; // { fi, ii, ghost, lastZone }

function _bibBindDrag(panel) {
  // Solo arrastrable si hay más de una carpeta
  const data = _bibLoad();
  if (data.folders.length < 2) return;

  const DRAG_THRESHOLD = 6; // px de movimiento para confirmar drag (PC y táctil)
  const LONG_MS = 350;      // ms adicional de long-press solo para táctil

  panel.querySelectorAll('._bib-item').forEach(el => {
    let _startX = 0, _startY = 0;
    let _longPressTimer = null;
    let _dragActive = false;
    let _downEvent = null;

    el.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('_bib-del-item')) return;
      _startX = e.clientX; _startY = e.clientY;
      _dragActive = false;
      _downEvent = e;

      if (e.pointerType === 'touch') {
        // Táctil: activar con long-press
        _longPressTimer = setTimeout(() => {
          _dragActive = true;
          _bibDragStart(_downEvent, el, panel);
        }, LONG_MS);
      }
      // PC: esperar movimiento suficiente (ver pointermove)
    }, { passive: true });

    el.addEventListener('pointermove', e => {
      const dist = Math.hypot(e.clientX - _startX, e.clientY - _startY);
      if (e.pointerType === 'touch') {
        // En táctil, cancelar long-press si hay movimiento antes de que expire
        if (dist > DRAG_THRESHOLD && _longPressTimer) {
          clearTimeout(_longPressTimer); _longPressTimer = null;
        }
      } else {
        // PC: activar drag al superar el umbral de movimiento
        if (!_dragActive && dist > DRAG_THRESHOLD && _downEvent) {
          _dragActive = true;
          _bibDragStart(_downEvent, el, panel);
        }
      }
    }, { passive: true });

    el.addEventListener('pointerup', () => {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
      _dragActive = false; _downEvent = null;
    });

    el.addEventListener('pointercancel', () => {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
      _dragActive = false; _downEvent = null;
      _bibDragCancel();
    });
  });
}

function _bibDragStart(e, el, panel) {
  const fi = parseInt(el.dataset.fi), ii = parseInt(el.dataset.ii);
  el.setPointerCapture(e.pointerId);
  el._wasDrag = true;

  // Ghost visual
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;z-index:2000;pointer-events:none;opacity:.85;border-radius:8px;overflow:hidden;width:${_BIB_THUMB_SIZE}px;height:${_BIB_THUMB_SIZE}px;box-shadow:0 6px 20px rgba(0,0,0,.35);border:2px solid var(--accent,#0077ff)`;
  const img = el.querySelector('img');
  if (img) {
    const gi = document.createElement('img');
    gi.src = img.src;
    gi.style.cssText = `width:${_BIB_THUMB_SIZE}px;height:${_BIB_THUMB_SIZE}px;display:block;pointer-events:none`;
    ghost.appendChild(gi);
  }
  document.body.appendChild(ghost);

  _bibDrag = { fi, ii, ghost, panel, lastZone: null };
  _bibMoveGhost(e.clientX, e.clientY);

  // Listeners globales en el elemento capturado
  el.addEventListener('pointermove', _bibOnMove);
  el.addEventListener('pointerup',   _bibOnUp);
}

function _bibMoveGhost(cx, cy) {
  if (!_bibDrag) return;
  const S = _BIB_THUMB_SIZE;
  _bibDrag.ghost.style.left = (cx - S/2) + 'px';
  _bibDrag.ghost.style.top  = (cy - S/2) + 'px';

  // Detectar zona de drop bajo el cursor
  const panel = _bibDrag.panel;
  const zones = panel.querySelectorAll('._bib-drop-zone');
  let hit = null;
  zones.forEach(z => {
    const r = z.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) hit = z;
  });

  // Resaltar zona destino
  if (_bibDrag.lastZone && _bibDrag.lastZone !== hit) {
    _bibDrag.lastZone.style.background = '';
  }
  if (hit && hit !== _bibDrag.lastZone) {
    const destFi = parseInt(hit.dataset.dropFi);
    if (destFi !== _bibDrag.fi) {
      hit.style.background = 'rgba(0,119,255,.15)';
    }
  }
  _bibDrag.lastZone = hit;
}

function _bibOnMove(e) {
  if (!_bibDrag) return;
  _bibMoveGhost(e.clientX, e.clientY);
}

function _bibOnUp(e) {
  if (!_bibDrag) return;
  const { fi, ii, ghost, panel, lastZone } = _bibDrag;

  ghost.remove();
  if (lastZone) lastZone.style.background = '';

  const destFi = lastZone ? parseInt(lastZone.dataset.dropFi) : -1;

  // Limpiar listeners
  e.target.removeEventListener('pointermove', _bibOnMove);
  e.target.removeEventListener('pointerup',   _bibOnUp);
  _bibDrag = null;

  if (destFi < 0 || destFi === fi) return; // sin destino válido o misma carpeta

  // Mover item
  const d = _bibLoad();
  if (!d.folders[fi] || !d.folders[destFi]) return;
  const [entry] = d.folders[fi].items.splice(ii, 1);
  d.folders[destFi].items.push(entry);
  _bibSave(d);
  edToast(`Movido a "${d.folders[destFi].name}" ✓`);
  _bibRenderPanel(panel);
}

function _bibDragCancel() {
  if (!_bibDrag) return;
  _bibDrag.ghost.remove();
  if (_bibDrag.lastZone) _bibDrag.lastZone.style.background = '';
  _bibDrag = null;
}

function edInitBiblioteca() {
  $('dd-bib-save')?.addEventListener('pointerup', e => {
    e.stopPropagation(); edCloseMenus(); edBibGuardar();
  });
  $('dd-bib-open')?.addEventListener('pointerup', e => {
    e.stopPropagation(); edCloseMenus(); edBibAbrir();
  });
}
