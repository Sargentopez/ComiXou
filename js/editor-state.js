/* ============================================================
   editor-state.js — Estado global y clases de capas
   Debe cargarse PRIMERO antes que cualquier otro módulo editor-*.js
   ============================================================ */

/* ── Refs DOM ── */
let edCanvas, edCtx, edViewerCanvas, edViewerCtx;

/* ── Datos del proyecto ── */
let edPages        = [];
let edCurrentPage  = 0;
let edLayers       = [];   // alias a edPages[edCurrentPage].layers
let edSelectedIdx  = -1;
let edOrientation  = 'vertical';
let edProjectId    = null;
let edProjectMeta  = { title:'', author:'', genre:'', navMode:'horizontal' };

/* ── Interacción canvas ── */
let edIsDragging    = false;
let edIsResizing    = false;
let edIsTailDragging= false;
let edTailPointType = null;
let edResizeCorner  = null;
let edDragOffX      = 0;
let edDragOffY      = 0;
let edInitialSize   = {};

/* ── Herramientas ── */
let edActiveTool  = 'select';  // select | draw | eraser
let edPainting    = false;
let edLastPX      = 0;
let edLastPY      = 0;
let edDrawColor   = '#e63030';
let edDrawSize    = 8;
let edEraserSize  = 20;

/* ── UI estado ── */
let edMenuOpen        = null;   // id del dropdown abierto
let edMinimized       = false;
let edFloatX          = 16;
let edFloatY          = 200;
let edPanelUserClosed = false;  // usuario cerró panel → no reabrir al seleccionar

/* ── Tap tracking ── */
let _edLastTapTime = 0;
let _edLastTapIdx  = -1;

/* ── Pinch-to-zoom ── */
let edPinching    = false;
let edPinchDist0  = 0;
let edPinchScale0 = { w:0, h:0, x:0, y:0 };

/* ── Historial ── */
let edHistory    = [];
let edHistoryIdx = -1;
const ED_MAX_HISTORY = 10;

/* ── Visor ── */
let edViewerIdx      = 0;
let edViewerTextStep = 0;   // textos revelados en modo secuencial
let _viewerTapBound  = false;
let _viewerHideTimer;
let _viewerKeyHandler = null;

/* ── Canvas base ── */
const ED_BASE = 360;   // resolución interna mínima
const $       = id => document.getElementById(id);

/* ──────────────────────────────────────────
   CLASES DE CAPAS
────────────────────────────────────────── */
class BaseLayer {
  constructor(type, x=0.5, y=0.5, width=0.2, height=0.1){
    this.type=type; this.x=x; this.y=y;
    this.width=width; this.height=height; this.rotation=0;
  }
  contains(px,py){
    return px>=this.x-this.width/2  && px<=this.x+this.width/2 &&
           py>=this.y-this.height/2 && py<=this.y+this.height/2;
  }
  getControlPoints(){
    if(this.type!=='image') return [];
    const hw=this.width/2, hh=this.height/2;
    return[{x:this.x-hw,y:this.y-hh,corner:'tl'},{x:this.x+hw,y:this.y-hh,corner:'tr'},
           {x:this.x-hw,y:this.y+hh,corner:'bl'},{x:this.x+hw,y:this.y+hh,corner:'br'}];
  }
  resizeToFitText(){}
}

class ImageLayer extends BaseLayer {
  constructor(imgEl, x=0.5, y=0.5, width=0.4){
    super('image', x, y, width, 0.3);
    if(imgEl){
      this.img = imgEl; this.src = imgEl.src || '';
      if(imgEl.naturalWidth && imgEl.naturalHeight)
        this.height = width * (imgEl.naturalHeight / imgEl.naturalWidth);
    } else {
      this.img = null; this.src = '';
    }
  }
  draw(ctx, can){
    if(!this.img || !this.img.complete || this.img.naturalWidth===0) return;
    const w=this.width*can.width, h=this.height*can.height;
    const px=this.x*can.width,   py=this.y*can.height;
    ctx.save();
    ctx.globalAlpha = this.opacity ?? 1;
    ctx.translate(px,py); ctx.rotate(this.rotation*Math.PI/180);
    ctx.drawImage(this.img,-w/2,-h/2,w,h);
    ctx.restore();
  }
}

class TextLayer extends BaseLayer {
  constructor(text='Escribe aquí', x=0.5, y=0.5){
    super('text', x, y, 0.2, 0.1);
    this.text=text; this.fontSize=20; this.fontFamily='Arial';
    this.color='#000000'; this.backgroundColor='#ffffff';
    this.borderColor='#000000'; this.borderWidth=0; this.padding=10;
  }
  draw(ctx, can){
    const x=(this.x-this.width/2)*can.width;
    const y=(this.y-this.height/2)*can.height;
    const w=this.width*can.width, h=this.height*can.height;
    const fs=this.fontSize*(can.width/ED_BASE);
    ctx.save();
    ctx.translate(x+w/2, y+h/2); ctx.rotate(this.rotation*Math.PI/180);
    if(this.backgroundColor!=='transparent'){
      ctx.fillStyle=this.backgroundColor; ctx.fillRect(-w/2,-h/2,w,h);
    }
    if(this.borderWidth>0){
      ctx.strokeStyle=this.borderColor;
      ctx.lineWidth=this.borderWidth*(can.width/ED_BASE);
      ctx.strokeRect(-w/2,-h/2,w,h);
    }
    ctx.fillStyle=this.color; ctx.font=`${fs}px ${this.fontFamily}`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const pad=this.padding*(can.width/ED_BASE);
    const maxW=w-pad*2;
    const words=this.text.split(' '); let line=''; const lh=fs*1.25;
    let lines=[];
    for(const word of words){
      const test=line?line+' '+word:word;
      if(ctx.measureText(test).width>maxW&&line){lines.push(line);line=word;}
      else line=test;
    }
    lines.push(line);
    const totalH=lines.length*lh;
    lines.forEach((l,i)=>ctx.fillText(l,0,-totalH/2+lh*i+lh/2,maxW));
    ctx.restore();
  }
  resizeToFitText(can){
    if(!can) return;
    const tmpCtx=can.getContext('2d');
    const fs=this.fontSize*(can.width/ED_BASE);
    tmpCtx.font=`${fs}px ${this.fontFamily}`;
    const words=this.text.split(' ');
    const maxW=0.8; let line=''; let lines=[]; const pad=this.padding*(can.width/ED_BASE);
    for(const word of words){
      const test=line?line+' '+word:word;
      if(tmpCtx.measureText(test).width>(maxW*can.width-pad*2)&&line){lines.push(line);line=word;}
      else line=test;
    }
    lines.push(line);
    const lh=fs*1.25;
    this.width=Math.min(0.9, Math.max(...lines.map(l=>tmpCtx.measureText(l).width+pad*2))/can.width+0.04);
    this.height=Math.min(0.9,(lines.length*lh+pad*2)/can.height+0.02);
  }
}

class BubbleLayer extends BaseLayer {
  constructor(text='Escribe aquí', x=0.5, y=0.5){
    super('bubble', x, y, 0.3, 0.15);
    this.text=text; this.fontSize=20; this.fontFamily='Bangers';
    this.color='#000000'; this.backgroundColor='#ffffff';
    this.borderColor='#000000'; this.borderWidth=2; this.padding=10;
    this.style='conventional'; this.tail=true; this.multipleCount=3;
    this.tailStart={x:0, y:0.5}; this.tailEnd={x:-0.3, y:0.8};
  }
  getTailControlPoints(){
    const hw=this.width/2, hh=this.height/2;
    return[
      {x:this.x+this.tailStart.x*hw, y:this.y+this.tailStart.y*hh, type:'start'},
      {x:this.x+this.tailEnd.x*hw,   y:this.y+this.tailEnd.y*hh,   type:'end'},
    ];
  }
  drawTail(ctx,sx,sy,ex,ey,common=false){
    const dx=ex-sx,dy=ey-sy,len=Math.hypot(dx,dy);
    if(len<1)return;
    const nx=dy/len,ny=-dx/len,tw=common?4:6;
    ctx.beginPath();
    ctx.moveTo(sx+nx*tw,sy+ny*tw);
    ctx.lineTo(ex,ey);
    ctx.lineTo(sx-nx*tw,sy-ny*tw);
    ctx.closePath();
  }
  draw(ctx, can){
    const x=(this.x-this.width/2)*can.width;
    const y=(this.y-this.height/2)*can.height;
    const w=this.width*can.width, h=this.height*can.height;
    const fs=this.fontSize*(can.width/ED_BASE);
    const bw=this.borderWidth*(can.width/ED_BASE);
    const pos={x:x+w/2, y:y+h/2};
    ctx.save(); ctx.translate(pos.x,pos.y);
    const sx=this.tailStart.x*w/2, sy=this.tailStart.y*h/2;
    const ex=(this.tailEnd.x+0)*w/2, ey=this.tailEnd.y*h/2; // ajustado abajo
    const tailEx=this.tailEnd.x*w, tailEy=this.tailEnd.y*h;
    // Relleno y borde por estilo
    ctx.fillStyle=this.backgroundColor;
    ctx.strokeStyle=this.borderColor; ctx.lineWidth=bw||1;
    const st=this.style;
    if(st==='conventional'||st==='lowvoice'||st==='radio'){
      const rx=w/2, ry=h/2;
      ctx.beginPath();
      if(st==='lowvoice'){ctx.setLineDash([4*(can.width/ED_BASE),3*(can.width/ED_BASE)]);}
      if(st==='radio'){
        ctx.rect(-rx,-ry,w,h);
      } else {
        ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);
      }
      ctx.fill(); if(bw>0)ctx.stroke(); ctx.setLineDash([]);
      if(this.tail){
        this.drawTail(ctx,sx,sy,tailEx,tailEy);
        ctx.fillStyle=this.backgroundColor; ctx.fill();
        if(bw>0){ctx.strokeStyle=this.borderColor;ctx.stroke();}
      }
    } else if(st==='thought'){
      ctx.beginPath(); ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
      ctx.fill(); if(bw>0)ctx.stroke();
      if(this.tail){
        const steps=3;
        for(let i=0;i<steps;i++){
          const t=(i+1)/(steps+1);
          const bx=sx+(tailEx-sx)*t, by=sy+(tailEy-sy)*t;
          const r=(3-i*0.7)*(can.width/ED_BASE);
          ctx.beginPath(); ctx.arc(bx,by,Math.max(r,1),0,Math.PI*2);
          ctx.fill(); if(bw>0)ctx.stroke();
        }
      }
    } else if(st==='explosion'){
      const pts=12; ctx.beginPath();
      for(let i=0;i<pts;i++){
        const a=(i/pts)*Math.PI*2;
        const r=(i%2===0?1:0.65);
        const px2=Math.cos(a)*w/2*r, py2=Math.sin(a)*h/2*r;
        i===0?ctx.moveTo(px2,py2):ctx.lineTo(px2,py2);
      }
      ctx.closePath(); ctx.fill(); if(bw>0)ctx.stroke();
    } else if(st==='multiple'){
      const count=this.multipleCount||3;
      const off=w*0.06;
      for(let i=count-1;i>=0;i--){
        ctx.beginPath();
        ctx.ellipse(i*off,i*off*0.4,w/2,h/2,0,0,Math.PI*2);
        ctx.fillStyle=this.backgroundColor; ctx.fill();
        if(bw>0){ctx.strokeStyle=this.borderColor;ctx.stroke();}
      }
      if(this.tail){
        this.drawTail(ctx,(count-1)*off+sx,(count-1)*off*0.4+sy,tailEx,tailEy,true);
        ctx.fillStyle=this.backgroundColor; ctx.fill();
        if(bw>0){ctx.strokeStyle=this.borderColor;ctx.stroke();}
      }
    }
    // Texto
    ctx.fillStyle=this.color; ctx.font=`${fs}px ${this.fontFamily}`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const pad=this.padding*(can.width/ED_BASE);
    const maxW2=w*0.82-pad;
    const words=this.text.split(' '); let line=''; const lh=fs*1.2; let lines2=[];
    for(const word of words){
      const test=line?line+' '+word:word;
      if(ctx.measureText(test).width>maxW2&&line){lines2.push(line);line=word;}
      else line=test;
    }
    lines2.push(line);
    const totalH2=lines2.length*lh;
    lines2.forEach((l,i)=>ctx.fillText(l,0,-totalH2/2+lh*i+lh/2,maxW2));
    ctx.restore();
  }
  resizeToFitText(can){
    if(!can)return;
    const tmpCtx=can.getContext('2d');
    const fs=this.fontSize*(can.width/ED_BASE);
    tmpCtx.font=`${fs}px ${this.fontFamily}`;
    const words=this.text.split(' ');
    const maxW=0.75; let line=''; let lines=[]; const pad=this.padding*(can.width/ED_BASE);
    for(const word of words){
      const test=line?line+' '+word:word;
      if(tmpCtx.measureText(test).width>(maxW*can.width*0.82-pad)&&line){lines.push(line);line=word;}
      else line=test;
    }
    lines.push(line);
    const lh=fs*1.2;
    this.width=Math.min(0.9,Math.max(...lines.map(l=>tmpCtx.measureText(l).width+pad*2))/can.width/0.82+0.06);
    this.height=Math.min(0.9,(lines.length*lh+pad*2)/can.height+0.04);
  }
}
