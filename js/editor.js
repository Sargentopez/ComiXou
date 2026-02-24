/* ============================================================
   editor.js — ComiXow Editor v4.0
   Motor canvas con capas (imagen, texto, bocadillo, dibujo).
   Se integra en la SPA via EditorView_init().
   ============================================================ */

/* ── CONSTANTES ── */
const ED = {
  BASE_W: 600,
  BASE_H_V: Math.round(600 * 16 / 9),   // vertical  (portrait)
  BASE_H_H: Math.round(600 * 9 / 16),   // horizontal (landscape)
};

/* ── ESTADO ── */
let edState = null;

function edReset() {
  edState = {
    pages: [],           // [{layers:[], orientation:'v', drawData:null}]
    current: 0,          // índice de página activa
    layers: [],          // referencia rápida a pages[current].layers
    selected: -1,        // índice de capa seleccionada
    tool: 'select',      // select | draw | eraser
    drawColor: '#FF3030',
    drawSize: 6,
    history: [],
    maxHistory: 15,
    project: { title: '', navMode: 'horizontal' },
    // drag
    _drag: null,
    _resize: null,
    _tailDrag: null,
    _painting: false,
    _lastX: 0, _lastY: 0,
  };
}

/* ── HELPERS ── */
function edEl(id) { return document.getElementById(id); }

function edToast(msg, ms = 2000) {
  const t = edEl('edToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), ms);
}

function edSaveHistory() {
  const page = edState.pages[edState.current];
  if (!page) return;
  const snap = JSON.stringify({ layers: page.layers.map(l => l.serialize()), drawData: page.drawData });
  edState.history.push(snap);
  if (edState.history.length > edState.maxHistory) edState.history.shift();
}

/* ── CLASES DE CAPAS ── */
class BaseLayer {
  constructor(type, x = 0.5, y = 0.5, w = 0.35, h = 0.2) {
    this.id = 'l_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    this.type = type;
    this.x = x; this.y = y;
    this.w = w; this.h = h;
    this.rotation = 0;
  }
  contains(px, py) {
    return px >= this.x - this.w/2 && px <= this.x + this.w/2 &&
           py >= this.y - this.h/2 && py <= this.y + this.h/2;
  }
  cornerAt(px, py, thresh = 0.03) {
    const corners = [
      { cx: this.x - this.w/2, cy: this.y - this.h/2, c: 'tl' },
      { cx: this.x + this.w/2, cy: this.y - this.h/2, c: 'tr' },
      { cx: this.x - this.w/2, cy: this.y + this.h/2, c: 'bl' },
      { cx: this.x + this.w/2, cy: this.y + this.h/2, c: 'br' },
    ];
    return corners.find(c => Math.hypot(px - c.cx, py - c.cy) < thresh) || null;
  }
  drawSelection(ctx, cw, ch) {
    const x = this.x * cw, y = this.y * ch;
    const w = this.w * cw, h = this.h * ch;
    ctx.save();
    ctx.strokeStyle = '#FFE135';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x - w/2, y - h/2, w, h);
    ctx.setLineDash([]);
    // esquinas
    ctx.fillStyle = '#FFE135';
    [[x-w/2,y-h/2],[x+w/2,y-h/2],[x-w/2,y+h/2],[x+w/2,y+h/2]].forEach(([cx,cy]) => {
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
    });
    ctx.restore();
  }
}

class ImageLayer extends BaseLayer {
  constructor(img, x = 0.5, y = 0.5, w = 0.6) {
    const ratio = img.naturalHeight / img.naturalWidth;
    super('image', x, y, w, w * ratio);
    this.img = img;
    this.src = img.src;
  }
  draw(ctx, cw, ch) {
    const x = this.x * cw, y = this.y * ch;
    const w = this.w * cw, h = this.h * ch;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.rotation * Math.PI / 180);
    ctx.drawImage(this.img, -w/2, -h/2, w, h);
    ctx.restore();
  }
  serialize() {
    return { type: 'image', x: this.x, y: this.y, w: this.w, h: this.h, rotation: this.rotation, src: this.src };
  }
  static deserialize(d) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const l = new ImageLayer(img, d.x, d.y, d.w);
        l.h = d.h; l.rotation = d.rotation || 0;
        res(l);
      };
      img.src = d.src;
    });
  }
}

class TextLayer extends BaseLayer {
  constructor(text = 'Texto', x = 0.5, y = 0.3) {
    super('text', x, y, 0.3, 0.1);
    this.text = text;
    this.fontSize = 22;
    this.fontFamily = 'Bangers';
    this.color = '#ffffff';
    this.outlineColor = '#000000';
    this.outlineWidth = 3;
    this.align = 'center';
    this.padding = 10;
  }
  _lines() { return this.text.split('\n'); }
  draw(ctx, cw, ch) {
    const x = this.x * cw, y = this.y * ch;
    const w = this.w * cw, h = this.h * ch;
    const lines = this._lines();
    const lh = this.fontSize * 1.25;
    const totalH = lines.length * lh;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.rotation * Math.PI / 180);
    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    ctx.textAlign = this.align;
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const ly = -totalH/2 + lh/2 + i * lh;
      if (this.outlineWidth > 0) {
        ctx.strokeStyle = this.outlineColor;
        ctx.lineWidth = this.outlineWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, 0, ly);
      }
      ctx.fillStyle = this.color;
      ctx.fillText(line, 0, ly);
    });
    ctx.restore();
  }
  autoSize(cw, ch) {
    const tmpCanvas = document.createElement('canvas');
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.font = `${this.fontSize}px ${this.fontFamily}`;
    const lines = this._lines();
    let maxW = 0;
    lines.forEach(l => { maxW = Math.max(maxW, tmpCtx.measureText(l).width); });
    const totalH = lines.length * this.fontSize * 1.25;
    this.w = (maxW + this.padding * 2) / cw;
    this.h = (totalH + this.padding * 2) / ch;
  }
  serialize() {
    return { type: 'text', x: this.x, y: this.y, w: this.w, h: this.h,
      rotation: this.rotation, text: this.text, fontSize: this.fontSize,
      fontFamily: this.fontFamily, color: this.color,
      outlineColor: this.outlineColor, outlineWidth: this.outlineWidth };
  }
  static deserialize(d) {
    const l = new TextLayer(d.text, d.x, d.y);
    Object.assign(l, d); return l;
  }
}

class BubbleLayer extends BaseLayer {
  constructor(text = '¡Hola!', x = 0.5, y = 0.3) {
    super('bubble', x, y, 0.35, 0.18);
    this.text = text;
    this.fontSize = 18;
    this.fontFamily = 'Bangers';
    this.color = '#000000';
    this.bgColor = '#ffffff';
    this.borderColor = '#000000';
    this.borderWidth = 2.5;
    this.style = 'conventional'; // conventional|lowvoice|thought|explosion|radio|multiple
    this.tail = true;
    this.tailSX = -0.4; this.tailSY = 0.5;   // relativo al centro del bocadillo
    this.tailEX = -0.5; this.tailEY = 0.75;
    this.padding = 14;
  }
  _lines() { return this.text.split('\n'); }
  draw(ctx, cw, ch) {
    const x = this.x * cw, y = this.y * ch;
    const w = this.w * cw, h = this.h * ch;
    ctx.save();
    ctx.translate(x, y);

    // Cuerpo del bocadillo
    if (this.style === 'explosion') {
      this._drawExplosion(ctx, w, h);
    } else if (this.style === 'thought') {
      this._drawThought(ctx, w, h);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2);
    }

    if (this.style !== 'thought') {
      ctx.fillStyle = this.bgColor;
      ctx.fill();
      if (this.borderWidth > 0) {
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = this.borderWidth;
        if (this.style === 'lowvoice') ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Cola
    if (this.tail && !['thought','radio'].includes(this.style)) {
      const count = this.style === 'multiple' ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const off = (i - (count-1)/2) * 0.12;
        const sx = (this.tailSX + off) * w;
        const sy = this.tailSY * h;
        const ex = (this.tailEX + off) * w;
        const ey = this.tailEY * h;
        this._drawTail(ctx, sx, sy, ex, ey);
      }
    }
    if (this.style === 'radio') {
      this._drawRadio(ctx, w, h);
    }

    // Texto
    const lines = this._lines();
    const lh = this.fontSize * 1.2;
    const totalH = lines.length * lh;
    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, -totalH/2 + lh/2 + i * lh);
    });

    ctx.restore();
  }
  _drawExplosion(ctx, w, h) {
    const pts = 14;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const angle = (i / pts) * Math.PI * 2 - Math.PI / 2;
      const r = (i % 2 === 0 ? 1 : 0.72) * (w/2);
      const rh = (i % 2 === 0 ? 1 : 0.72) * (h/2);
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * rh;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = this.bgColor; ctx.fill();
    if (this.borderWidth > 0) { ctx.strokeStyle = this.borderColor; ctx.lineWidth = this.borderWidth; ctx.stroke(); }
  }
  _drawThought(ctx, w, h) {
    const circles = [
      {x:0, y:-h*0.2, r:w*0.32},
      {x:w*0.22, y:0, r:w*0.30},
      {x:-w*0.22, y:0, r:w*0.30},
      {x:0, y:h*0.2, r:w*0.28},
    ];
    ctx.fillStyle = this.bgColor;
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = this.borderWidth;
    circles.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
    });
    // Círculo interior blanco para tapar intersecciones
    ctx.fillStyle = this.bgColor;
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w,h) * 0.28, 0, Math.PI*2);
    ctx.fill();
    // Burbujas de cola del pensamiento
    const tx = this.tailEX * w * 0.5;
    const ty = this.tailEY * h * 0.8;
    [0.12, 0.07, 0.04].forEach((r, i) => {
      const f = 1 - i * 0.3;
      ctx.beginPath();
      ctx.arc(tx * f, ty * f, r * w, 0, Math.PI*2);
      ctx.fillStyle = this.bgColor;
      ctx.fill();
      ctx.strokeStyle = this.borderColor;
      ctx.lineWidth = this.borderWidth;
      ctx.stroke();
    });
  }
  _drawTail(ctx, sx, sy, ex, ey) {
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    ctx.save();
    ctx.fillStyle = this.bgColor;
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = this.borderWidth;
    ctx.beginPath();
    ctx.moveTo(sx - 6, sy);
    ctx.lineTo(ex, ey);
    ctx.lineTo(sx + 6, sy);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  _drawRadio(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = 1;
    for (let r = 8; r <= 28; r += 7) {
      ctx.beginPath();
      ctx.arc(this.tailEX * w, this.tailEY * h, r, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
  }
  getTailPoints(cw, ch) {
    return [
      { x: (this.x + this.tailSX * this.w) * cw, y: (this.y + this.tailSY * this.h) * ch, type: 'start' },
      { x: (this.x + this.tailEX * this.w) * cw, y: (this.y + this.tailEY * this.h) * ch, type: 'end' },
    ];
  }
  serialize() {
    return { type: 'bubble', x: this.x, y: this.y, w: this.w, h: this.h,
      text: this.text, fontSize: this.fontSize, fontFamily: this.fontFamily,
      color: this.color, bgColor: this.bgColor, borderColor: this.borderColor,
      borderWidth: this.borderWidth, style: this.style,
      tail: this.tail, tailSX: this.tailSX, tailSY: this.tailSY,
      tailEX: this.tailEX, tailEY: this.tailEY, rotation: this.rotation };
  }
  static deserialize(d) {
    const l = new BubbleLayer(d.text, d.x, d.y);
    Object.assign(l, d); return l;
  }
}

/* ── GESTIÓN DE PÁGINAS ── */
function edNewPage(orientation = 'v') {
  const page = { layers: [], orientation, drawData: null };
  edState.pages.push(page);
  edGoToPage(edState.pages.length - 1);
}

function edGoToPage(idx) {
  edState.current = idx;
  edState.layers = edState.pages[idx].layers;
  edState.selected = -1;
  edResizeCanvas();
  edRedraw();
  edRenderStrip();
  edClosePanel();
}

function edResizeCanvas() {
  const page = edState.pages[edState.current];
  const canvas = edEl('editorCanvas');
  const wrap = edEl('editorCanvasWrap');
  if (!canvas || !wrap || !page) return;

  const isV = page.orientation === 'v';
  const baseW = ED.BASE_W;
  const baseH = isV ? ED.BASE_H_V : ED.BASE_H_H;

  canvas.width  = baseW;
  canvas.height = baseH;

  // Escalar visualmente para ajustarse al área disponible
  const maxW = wrap.clientWidth  - 16;
  const maxH = wrap.clientHeight - 16;
  const scale = Math.min(maxW / baseW, maxH / baseH, 1);
  canvas.style.width  = Math.round(baseW * scale) + 'px';
  canvas.style.height = Math.round(baseH * scale) + 'px';
}

/* ── DIBUJADO ── */
function edRedraw() {
  const canvas = edEl('editorCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cw = canvas.width, ch = canvas.height;

  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);

  const page = edState.pages[edState.current];
  if (!page) return;

  // Capas
  edState.layers.forEach(l => l.draw(ctx, cw, ch));

  // Dibujo libre encima
  if (page.drawData) {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0); edDrawSelection(ctx, cw, ch); };
    img.src = page.drawData;
    return;
  }

  edDrawSelection(ctx, cw, ch);
}

function edDrawSelection(ctx, cw, ch) {
  const sel = edState.selected;
  if (sel < 0 || sel >= edState.layers.length) return;
  const l = edState.layers[sel];
  l.drawSelection(ctx, cw, ch);

  // Puntos de cola para bocadillos
  if (l.type === 'bubble' && l.tail && !['thought','radio'].includes(l.style)) {
    const pts = l.getTailPoints(cw, ch);
    pts.forEach(pt => {
      ctx.save();
      ctx.fillStyle = pt.type === 'start' ? '#FFE135' : '#ff3b30';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    });
  }
}

/* ── STRIP DE MINIATURAS ── */
function edRenderStrip() {
  const strip = edEl('editorPageStrip');
  if (!strip) return;
  strip.innerHTML = '';

  edState.pages.forEach((page, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'ed-page-thumb' + (i === edState.current ? ' active' : '');

    // Canvas miniatura
    const tc = document.createElement('canvas');
    tc.width = 42; tc.height = 56;
    const tctx = tc.getContext('2d');
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, 42, 56);
    page.layers.forEach(l => l.draw(tctx, 42, 56));
    thumb.appendChild(tc);

    const n = document.createElement('span');
    n.className = 'thumb-n';
    if (page.layers.length === 0) n.textContent = i + 1;
    thumb.appendChild(n);

    thumb.addEventListener('click', () => edGoToPage(i));
    strip.appendChild(thumb);
  });

  // Botón añadir
  const add = document.createElement('button');
  add.className = 'ed-page-add';
  add.textContent = '+';
  add.addEventListener('click', () => {
    const page = edState.pages[edState.current];
    edNewPage(page ? page.orientation : 'v');
  });
  strip.appendChild(add);

  const active = strip.querySelector('.ed-page-thumb.active');
  if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
}

/* ── COORDENADAS NORMALIZADAS ── */
function edCanvasCoords(e) {
  const canvas = edEl('editorCanvas');
  const rect = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) / rect.width,
    y: (src.clientY - rect.top) / rect.height,
  };
}

/* ── EVENTOS DE CANVAS ── */
function edOnPointerDown(e) {
  e.preventDefault();
  const p = edCanvasCoords(e);

  if (['draw', 'eraser'].includes(edState.tool)) {
    edStartPaint(e, p); return;
  }

  // Herramienta select: buscar capa
  const layers = edState.layers;

  // Comprobar cola de bocadillo seleccionado primero
  if (edState.selected >= 0) {
    const sel = layers[edState.selected];
    if (sel && sel.type === 'bubble' && sel.tail) {
      const canvas = edEl('editorCanvas');
      const pts = sel.getTailPoints(canvas.width, canvas.height);
      for (let pt of pts) {
        const nx = pt.x / canvas.width;
        const ny = pt.y / canvas.height;
        if (Math.hypot(p.x - nx, p.y - ny) < 0.04) {
          edState._tailDrag = { layer: sel, type: pt.type };
          return;
        }
      }
    }
  }

  // Comprobar esquinas de redimensionado
  if (edState.selected >= 0) {
    const sel = layers[edState.selected];
    if (sel) {
      const corner = sel.cornerAt(p.x, p.y, 0.04);
      if (corner) {
        edState._resize = { layer: sel, corner: corner.c, startX: p.x, startY: p.y, origW: sel.w, origH: sel.h, origX: sel.x, origY: sel.y };
        return;
      }
    }
  }

  // Buscar capa (de arriba hacia abajo)
  let found = -1;
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i].contains(p.x, p.y)) { found = i; break; }
  }

  if (found >= 0) {
    edState.selected = found;
    edState._drag = { layer: layers[found], startX: p.x, startY: p.y, origX: layers[found].x, origY: layers[found].y };
    edRedraw();
  } else {
    edState.selected = -1;
    edRedraw();
  }
}

function edOnPointerMove(e) {
  e.preventDefault();
  const p = edCanvasCoords(e);

  if (['draw', 'eraser'].includes(edState.tool) && edState._painting) {
    edContinuePaint(e, p); return;
  }

  if (edState._tailDrag) {
    const td = edState._tailDrag;
    if (td.type === 'start') {
      td.layer.tailSX = (p.x - td.layer.x) / td.layer.w;
      td.layer.tailSY = (p.y - td.layer.y) / td.layer.h;
    } else {
      td.layer.tailEX = (p.x - td.layer.x) / td.layer.w;
      td.layer.tailEY = (p.y - td.layer.y) / td.layer.h;
    }
    edRedraw(); return;
  }

  if (edState._resize) {
    const r = edState._resize;
    const dx = p.x - r.startX;
    const dy = p.y - r.startY;
    if (r.corner === 'br' || r.corner === 'tr') {
      r.layer.w = Math.max(0.05, r.origW + dx * 2);
    } else {
      r.layer.w = Math.max(0.05, r.origW - dx * 2);
    }
    if (r.corner === 'br' || r.corner === 'bl') {
      r.layer.h = Math.max(0.03, r.origH + dy * 2);
    } else {
      r.layer.h = Math.max(0.03, r.origH - dy * 2);
    }
    edRedraw(); return;
  }

  if (edState._drag) {
    const d = edState._drag;
    d.layer.x = d.origX + (p.x - d.startX);
    d.layer.y = d.origY + (p.y - d.startY);
    edRedraw(); return;
  }
}

function edOnPointerUp(e) {
  if (edState._painting) { edState._painting = false; edSaveDrawing(); }
  edState._drag = null;
  edState._resize = null;
  edState._tailDrag = null;
}

/* ── DIBUJO LIBRE ── */
function edStartPaint(e, p) {
  edState._painting = true;
  const canvas = edEl('editorCanvas');
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(p.x * canvas.width, p.y * canvas.height, edState.drawSize / 2, 0, Math.PI*2);
  if (edState.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = edState.drawColor;
  }
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  edState._lastX = p.x; edState._lastY = p.y;
  edMoveBrushCursor(e);
}

function edContinuePaint(e, p) {
  const canvas = edEl('editorCanvas');
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(edState._lastX * canvas.width, edState._lastY * canvas.height);
  ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
  ctx.strokeStyle = edState.tool === 'eraser' ? 'rgba(0,0,0,1)' : edState.drawColor;
  ctx.lineWidth = edState.drawSize;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (edState.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
  else ctx.globalCompositeOperation = 'source-over';
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  edState._lastX = p.x; edState._lastY = p.y;
  edMoveBrushCursor(e);
}

function edSaveDrawing() {
  const page = edState.pages[edState.current];
  if (!page) return;
  page.drawData = edEl('editorCanvas').toDataURL();
}

function edMoveBrushCursor(e) {
  const src = e.touches ? e.touches[0] : e;
  const cursor = edEl('edBrushCursor');
  if (!cursor) return;
  const sz = edState.drawSize * 2;
  cursor.style.left = src.clientX + 'px';
  cursor.style.top  = src.clientY + 'px';
  cursor.style.width  = sz + 'px';
  cursor.style.height = sz + 'px';
  cursor.style.borderColor = edState.tool === 'eraser' ? 'rgba(255,255,255,.5)' : edState.drawColor;
}

/* ── AÑADIR CAPAS ── */
function edAddImage(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      edSaveHistory();
      edState.layers.push(new ImageLayer(img));
      edRedraw();
      edRenderStrip();
      edToast('Imagen añadida ✓');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function edAddText(text) {
  if (!text.trim()) return;
  edSaveHistory();
  const l = new TextLayer(text);
  const canvas = edEl('editorCanvas');
  l.autoSize(canvas.width, canvas.height);
  edState.layers.push(l);
  edState.selected = edState.layers.length - 1;
  edRedraw();
  edRenderStrip();
  edToast('Texto añadido');
}

function edAddBubble(text, style = 'conventional') {
  if (!text.trim()) return;
  edSaveHistory();
  const l = new BubbleLayer(text);
  l.style = style;
  edState.layers.push(l);
  edState.selected = edState.layers.length - 1;
  edRedraw();
  edRenderStrip();
  edToast('Bocadillo añadido');
}

function edDeleteSelected() {
  if (edState.selected < 0) { edToast('Selecciona una capa primero'); return; }
  edSaveHistory();
  edState.layers.splice(edState.selected, 1);
  edState.selected = -1;
  edRedraw();
  edRenderStrip();
  edClosePanel();
  edToast('Capa eliminada');
}

/* ── UNDO ── */
function edUndo() {
  if (!edState.history.length) { edToast('Nada que deshacer'); return; }
  const snap = JSON.parse(edState.history.pop());
  const page = edState.pages[edState.current];
  // Restaurar drawData
  page.drawData = snap.drawData;
  // Restaurar capas — solo texto y bocadillo son sincrónicos
  const syncLayers = snap.layers.filter(d => d.type !== 'image').map(d => {
    if (d.type === 'text')   return TextLayer.deserialize(d);
    if (d.type === 'bubble') return BubbleLayer.deserialize(d);
  });
  // Imágenes: async pero raro hacer undo de imagen
  edState.layers = syncLayers;
  page.layers = syncLayers;
  edState.selected = -1;
  edRedraw();
  edRenderStrip();
  edToast('Deshecho ↩');
}

/* ── PANEL FLOTANTE ── */
let _panelTool = null;

function edOpenPanel(tool) {
  _panelTool = tool;
  const panel = edEl('editorFloatPanel');
  if (!panel) return;
  panel.innerHTML = _buildPanel(tool);
  panel.classList.add('open');
  _bindPanel(tool);
}

function edClosePanel() {
  const panel = edEl('editorFloatPanel');
  if (panel) panel.classList.remove('open');
  _panelTool = null;
}

function edTogglePanel(tool) {
  if (_panelTool === tool) { edClosePanel(); return; }
  edOpenPanel(tool);
}

function _buildPanel(tool) {
  const DRAW_COLORS = ['#FF3030','#FF9500','#FFE135','#30D158','#0A84FF','#BF5AF2','#ffffff','#111111'];

  if (tool === 'image') {
    return `<div class="fp-handle"></div>
    <div class="fp-title">📷 Añadir imagen</div>
    <div class="fp-section">
      <div class="fp-btn-row">
        <button class="fp-btn" id="fpCamera">📷 Cámara</button>
        <button class="fp-btn" id="fpGallery">🖼 Galería</button>
        <button class="fp-btn" id="fpGif">GIF</button>
      </div>
    </div>`;
  }

  if (tool === 'text') {
    return `<div class="fp-handle"></div>
    <div class="fp-title">T Texto libre</div>
    <div class="fp-section">
      <textarea class="fp-textarea" id="fpTextInput" placeholder="Escribe aquí..."></textarea>
      <div class="fp-label">Color</div>
      <div class="fp-colors" id="fpTextColors">
        ${['#ffffff','#FFE135','#FF3030','#30D158','#0A84FF','#111111'].map(c =>
          `<div class="fp-color-dot${edState.tool==='text'&&c===edState.drawColor?' active':''}"
            style="background:${c};${c==='#ffffff'?'border:1.5px solid #444':''}"
            data-color="${c}"></div>`).join('')}
      </div>
    </div>
    <div class="fp-section">
      <div class="fp-label">Tamaño</div>
      <div class="fp-btn-row">
        ${[16,22,30,42].map(s => `<button class="fp-btn${s===22?' active':''}" data-textsize="${s}">${s}px</button>`).join('')}
      </div>
    </div>
    <div class="fp-section">
      <div class="fp-btn-row">
        <button class="fp-btn active" id="fpAddText">Añadir texto</button>
      </div>
    </div>`;
  }

  if (tool === 'bubble') {
    return `<div class="fp-handle"></div>
    <div class="fp-title">💬 Bocadillo</div>
    <div class="fp-section">
      <textarea class="fp-textarea" id="fpBubbleInput" placeholder="Escribe el texto..."></textarea>
    </div>
    <div class="fp-section">
      <div class="fp-label">Estilo</div>
      <div class="bubble-styles">
        ${[
          ['conventional','🗨','Normal'],
          ['lowvoice','🔇','Susurro'],
          ['thought','💭','Pensamiento'],
          ['explosion','💥','Explosión'],
          ['radio','📻','Radio'],
          ['multiple','💬','Múltiple'],
        ].map(([s,ic,label]) =>
          `<button class="bubble-style-btn${s==='conventional'?' active':''}" data-style="${s}">
            <span>${ic}</span>${label}
          </button>`).join('')}
      </div>
    </div>
    <div class="fp-section">
      <div class="fp-btn-row">
        <button class="fp-btn active" id="fpAddBubble">Añadir bocadillo</button>
      </div>
    </div>`;
  }

  if (tool === 'draw' || tool === 'eraser') {
    return `<div class="fp-handle"></div>
    <div class="fp-title">${tool === 'draw' ? '✏️ Dibujo libre' : '⬜ Borrador'}</div>
    <div class="fp-section">
      <div class="fp-label">Color</div>
      <div class="fp-colors" id="fpDrawColors">
        ${DRAW_COLORS.map(c =>
          `<div class="fp-color-dot${c===edState.drawColor?' active':''}"
            style="background:${c};${c==='#ffffff'?'border:1.5px solid #444':''}"
            data-color="${c}"></div>`).join('')}
      </div>
    </div>
    <div class="fp-section">
      <div class="fp-label">Grosor</div>
      <div class="fp-slider-row">
        <input type="range" id="fpSizeSlider" min="1" max="48" value="${edState.drawSize}">
        <span class="fp-slider-val" id="fpSizeVal">${edState.drawSize}px</span>
      </div>
    </div>`;
  }

  if (tool === 'edit') {
    const sel = edState.selected >= 0 ? edState.layers[edState.selected] : null;
    if (!sel) return `<div class="fp-handle"></div>
      <div class="fp-title">Editar capa</div>
      <div class="fp-section"><p style="color:#636366;font-size:.82rem;text-align:center">
        Toca una capa en el canvas para seleccionarla</p></div>`;

    let extra = '';
    if (sel.type === 'text') {
      extra = `<div class="fp-section">
        <div class="fp-label">Texto</div>
        <textarea class="fp-textarea" id="fpEditText">${sel.text}</textarea>
        <div class="fp-btn-row">
          <button class="fp-btn active" id="fpApplyText">Aplicar</button>
        </div>
      </div>
      <div class="fp-section">
        <div class="fp-label">Color</div>
        <div class="fp-colors" id="fpEditColors">
          ${['#ffffff','#FFE135','#FF3030','#30D158','#0A84FF','#111111'].map(c =>
            `<div class="fp-color-dot${c===sel.color?' active':''}" style="background:${c};${c==='#ffffff'?'border:1.5px solid #444':''}" data-editcolor="${c}"></div>`).join('')}
        </div>
      </div>`;
    }
    if (sel.type === 'bubble') {
      extra = `<div class="fp-section">
        <div class="fp-label">Texto</div>
        <textarea class="fp-textarea" id="fpEditText">${sel.text}</textarea>
        <div class="fp-btn-row">
          <button class="fp-btn active" id="fpApplyText">Aplicar</button>
        </div>
      </div>
      <div class="fp-section">
        <div class="fp-label">Estilo</div>
        <div class="bubble-styles">
          ${[['conventional','🗨','Normal'],['lowvoice','🔇','Susurro'],['thought','💭','Pensamiento'],
             ['explosion','💥','Explosión'],['radio','📻','Radio'],['multiple','💬','Múltiple']]
            .map(([s,ic,label]) =>
              `<button class="bubble-style-btn${s===sel.style?' active':''}" data-editstyle="${s}">
                <span>${ic}</span>${label}
              </button>`).join('')}
        </div>
      </div>`;
    }

    return `<div class="fp-handle"></div>
    <div class="fp-title">✏️ Editar — ${sel.type === 'image' ? 'Imagen' : sel.type === 'text' ? 'Texto' : 'Bocadillo'}</div>
    ${extra}
    <div class="fp-section">
      <div class="fp-btn-row">
        <button class="fp-btn danger" id="fpDeleteLayer">🗑 Eliminar capa</button>
      </div>
    </div>`;
  }

  if (tool === 'pages') {
    const pages = edState.pages;
    return `<div class="fp-handle"></div>
    <div class="fp-title">📄 Páginas (${pages.length})</div>
    <div class="fp-section">
      <div class="fp-label">Orientación de esta página</div>
      <div class="fp-btn-row">
        <button class="fp-btn${pages[edState.current]?.orientation==='v'?' active':''}" data-orient="v">📱 Vertical</button>
        <button class="fp-btn${pages[edState.current]?.orientation==='h'?' active':''}" data-orient="h">🖥 Horizontal</button>
      </div>
    </div>
    <div class="fp-section">
      <div class="fp-btn-row">
        <button class="fp-btn" id="fpAddPage">➕ Nueva página</button>
        <button class="fp-btn danger" id="fpDelPage">🗑 Eliminar esta</button>
      </div>
    </div>`;
  }

  return '';
}

function _bindPanel(tool) {
  // ── IMAGEN ──
  if (tool === 'image') {
    const fpCamera = edEl('fpCamera');
    const fpGallery = edEl('fpGallery');
    if (fpCamera)  fpCamera.addEventListener('click',  () => { edEl('edFileCapture').click(); edClosePanel(); });
    if (fpGallery) fpGallery.addEventListener('click', () => { edEl('edFileGallery').click(); edClosePanel(); });
    const fpGif = edEl('fpGif');
    if (fpGif) fpGif.addEventListener('click', () => { edEl('edFileGallery').click(); edClosePanel(); });
  }

  // ── TEXTO ──
  if (tool === 'text') {
    let textColor = '#ffffff', textSize = 22;
    edEl('editorFloatPanel').querySelectorAll('[data-color]').forEach(dot => {
      dot.addEventListener('click', () => {
        edEl('editorFloatPanel').querySelectorAll('[data-color]').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        textColor = dot.dataset.color;
      });
    });
    edEl('editorFloatPanel').querySelectorAll('[data-textsize]').forEach(btn => {
      btn.addEventListener('click', () => {
        edEl('editorFloatPanel').querySelectorAll('[data-textsize]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        textSize = +btn.dataset.textsize;
      });
    });
    const addBtn = edEl('fpAddText');
    if (addBtn) addBtn.addEventListener('click', () => {
      const text = edEl('fpTextInput').value.trim();
      if (!text) { edToast('Escribe algo primero'); return; }
      const l = new TextLayer(text);
      l.color = textColor; l.fontSize = textSize;
      const canvas = edEl('editorCanvas');
      l.autoSize(canvas.width, canvas.height);
      edSaveHistory();
      edState.layers.push(l);
      edState.selected = edState.layers.length - 1;
      edRedraw(); edRenderStrip();
      edClosePanel();
      edToast('Texto añadido');
    });
  }

  // ── BOCADILLO ──
  if (tool === 'bubble') {
    let bubbleStyle = 'conventional';
    edEl('editorFloatPanel').querySelectorAll('[data-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        edEl('editorFloatPanel').querySelectorAll('[data-style]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        bubbleStyle = btn.dataset.style;
      });
    });
    const addBtn = edEl('fpAddBubble');
    if (addBtn) addBtn.addEventListener('click', () => {
      const text = edEl('fpBubbleInput').value.trim();
      if (!text) { edToast('Escribe el texto'); return; }
      edAddBubble(text, bubbleStyle);
      edClosePanel();
    });
  }

  // ── DIBUJO ──
  if (tool === 'draw' || tool === 'eraser') {
    edEl('editorFloatPanel').querySelectorAll('[data-color]').forEach(dot => {
      dot.addEventListener('click', () => {
        edEl('editorFloatPanel').querySelectorAll('[data-color]').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        edState.drawColor = dot.dataset.color;
      });
    });
    const slider = edEl('fpSizeSlider');
    if (slider) slider.addEventListener('input', e => {
      edState.drawSize = +e.target.value;
      edEl('fpSizeVal').textContent = e.target.value + 'px';
    });
  }

  // ── EDITAR CAPA ──
  if (tool === 'edit') {
    const sel = edState.selected >= 0 ? edState.layers[edState.selected] : null;
    if (!sel) return;

    const applyText = edEl('fpApplyText');
    if (applyText) applyText.addEventListener('click', () => {
      const t = edEl('fpEditText').value.trim();
      if (!t) return;
      edSaveHistory();
      sel.text = t;
      if (sel.type === 'text') { const c = edEl('editorCanvas'); sel.autoSize(c.width, c.height); }
      edRedraw(); edRenderStrip();
      edToast('Actualizado');
    });

    edEl('editorFloatPanel').querySelectorAll('[data-editcolor]').forEach(dot => {
      dot.addEventListener('click', () => {
        edEl('editorFloatPanel').querySelectorAll('[data-editcolor]').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        sel.color = dot.dataset.editcolor;
        edRedraw();
      });
    });

    edEl('editorFloatPanel').querySelectorAll('[data-editstyle]').forEach(btn => {
      btn.addEventListener('click', () => {
        edEl('editorFloatPanel').querySelectorAll('[data-editstyle]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sel.style = btn.dataset.editstyle;
        edSaveHistory(); edRedraw();
      });
    });

    const delBtn = edEl('fpDeleteLayer');
    if (delBtn) delBtn.addEventListener('click', edDeleteSelected);
  }

  // ── PÁGINAS ──
  if (tool === 'pages') {
    edEl('editorFloatPanel').querySelectorAll('[data-orient]').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = edState.pages[edState.current];
        page.orientation = btn.dataset.orient;
        edEl('editorFloatPanel').querySelectorAll('[data-orient]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        edResizeCanvas(); edRedraw();
      });
    });
    const addPage = edEl('fpAddPage');
    if (addPage) addPage.addEventListener('click', () => {
      const page = edState.pages[edState.current];
      edNewPage(page ? page.orientation : 'v');
      edClosePanel();
    });
    const delPage = edEl('fpDelPage');
    if (delPage) delPage.addEventListener('click', () => {
      if (edState.pages.length <= 1) { edToast('No puedes eliminar la única página'); return; }
      edState.pages.splice(edState.current, 1);
      edGoToPage(Math.min(edState.current, edState.pages.length - 1));
      edClosePanel();
    });
  }
}

/* ── GUARDAR / PUBLICAR ── */
function edSaveDraft() {
  const title = edEl('edTitleInput')?.value.trim() || 'Sin título';
  edState.project.title = title;
  const data = {
    project: edState.project,
    pages: edState.pages.map(p => ({
      orientation: p.orientation,
      drawData: p.drawData,
      layers: p.layers.map(l => l.serialize()),
    })),
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem('cx_editor_draft', JSON.stringify(data));
  edToast('Borrador guardado ✓');
}

function edPublish() {
  if (!Auth || !Auth.isLogged()) { edToast('Inicia sesión para publicar'); return; }
  const title = edEl('edTitleInput')?.value.trim();
  if (!title) { edToast('Ponle un título a la obra'); return; }

  // Exportar cada página como PNG
  const canvas = edEl('editorCanvas');
  const origPage = edState.current;
  const pngs = [];

  // Función para exportar página por página de forma síncrona
  function exportPage(i) {
    if (i >= edState.pages.length) {
      finishPublish(pngs); return;
    }
    edGoToPage(i);
    requestAnimationFrame(() => {
      pngs.push(canvas.toDataURL('image/jpeg', 0.85));
      exportPage(i + 1);
    });
  }
  exportPage(0);

  function finishPublish(pngs) {
    edGoToPage(origPage);
    const user = Auth.currentUser();
    const comic = {
      id: 'comic_' + Date.now(),
      userId: user.id,
      username: user.username,
      title: edState.project.title,
      desc: '',
      genre: '',
      navMode: edState.project.navMode || 'horizontal',
      panels: pngs.map((dataUrl, i) => ({
        id: 'panel_' + i,
        dataUrl,
        orientation: edState.pages[i].orientation,
      })),
      published: true,
      approved: false,  // espera moderación
      createdAt: new Date().toISOString(),
    };
    if (typeof ComicStore !== 'undefined') ComicStore.save(comic);
    edToast('¡Enviada a revisión! ✓', 3000);
    setTimeout(() => Router.go('home'), 1500);
  }
}

/* ── VISOR ── */
function edOpenViewer() {
  const viewer = edEl('editorViewer');
  const vc = edEl('viewerCanvas');
  if (!viewer || !vc || !edState.pages.length) return;
  viewer._idx = edState.current;
  edUpdateViewer();
  viewer.classList.add('open');
}
function edCloseViewer() { edEl('editorViewer')?.classList.remove('open'); }
function edUpdateViewer() {
  const viewer = edEl('editorViewer');
  const vc = edEl('viewerCanvas');
  if (!viewer || !vc) return;
  const page = edState.pages[viewer._idx];
  if (!page) return;
  const isV = page.orientation === 'v';
  vc.width  = ED.BASE_W;
  vc.height = isV ? ED.BASE_H_V : ED.BASE_H_H;
  const ctx = vc.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, vc.width, vc.height);
  page.layers.forEach(l => l.draw(ctx, vc.width, vc.height));
  if (page.drawData) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = page.drawData; }
  edEl('viewerCounter').textContent = `${viewer._idx + 1} / ${edState.pages.length}`;
}

/* ── SETEAR HERRAMIENTA ── */
function edSetTool(tool) {
  edState.tool = tool;
  document.querySelectorAll('.ed-tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`[data-edtool="${tool}"]`);
  if (btn) btn.classList.add('active');

  const canvas = edEl('editorCanvas');
  if (canvas) {
    canvas.className = '';
    if (tool === 'draw')   { canvas.classList.add('tool-draw'); edEl('edBrushCursor').style.display = 'block'; }
    else if (tool === 'eraser') { canvas.classList.add('tool-eraser'); edEl('edBrushCursor').style.display = 'block'; }
    else { edEl('edBrushCursor').style.display = 'none'; }
  }
}

/* ── INIT de la vista SPA ── */
function EditorView_init() {
  // Si no hay estado o es primera vez, resetear
  if (!edState) edReset();

  const canvas = edEl('editorCanvas');
  if (!canvas) return;

  // Restaurar borrador si existe
  const saved = localStorage.getItem('cx_editor_draft');
  if (saved && edState.pages.length === 0) {
    try {
      const data = JSON.parse(saved);
      edState.project = data.project || {};
      const input = edEl('edTitleInput');
      if (input) input.value = edState.project.title || '';
      // Reconstruir páginas (solo sync por ahora)
      data.pages.forEach(pd => {
        const page = { layers: [], orientation: pd.orientation || 'v', drawData: pd.drawData };
        pd.layers.forEach(d => {
          if (d.type === 'text')   page.layers.push(TextLayer.deserialize(d));
          if (d.type === 'bubble') page.layers.push(BubbleLayer.deserialize(d));
          // imágenes: async, se omiten en la restauración rápida
        });
        edState.pages.push(page);
      });
      edState.layers = edState.pages[0]?.layers || [];
    } catch(e) {}
  }

  if (!edState.pages.length) edReset(), edNewPage('v');
  else { edResizeCanvas(); edRedraw(); edRenderStrip(); }

  // Herramienta por defecto
  edSetTool('select');

  // ── EVENTOS DE CANVAS ──
  canvas.addEventListener('pointerdown',  edOnPointerDown,  { passive: false });
  canvas.addEventListener('pointermove',  edOnPointerMove,  { passive: false });
  canvas.addEventListener('pointerup',    edOnPointerUp);
  canvas.addEventListener('pointerleave', edOnPointerUp);

  // ── TOOLBAR BOTONES ──
  document.querySelectorAll('.ed-tool-btn[data-edtool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.edtool;
      if (['image','text','bubble','draw','eraser','edit','pages'].includes(t)) {
        edSetTool(t === 'select' ? 'select' : t);
        edTogglePanel(t);
      } else {
        edSetTool(t);
        edClosePanel();
      }
    });
  });

  // ── TOPBAR ──
  edEl('edUndoBtn')?.addEventListener('click', edUndo);
  edEl('edSaveBtn')?.addEventListener('click', edSaveDraft);
  edEl('edPublishBtn')?.addEventListener('click', edPublish);
  edEl('edViewerBtn')?.addEventListener('click', edOpenViewer);

  // ── FILES ──
  edEl('edFileCapture')?.addEventListener('change', e => { edAddImage(e.target.files[0]); e.target.value = ''; });
  edEl('edFileGallery')?.addEventListener('change', e => { edAddImage(e.target.files[0]); e.target.value = ''; });

  // ── VISOR ──
  edEl('viewerClose')?.addEventListener('click', edCloseViewer);
  edEl('viewerPrev')?.addEventListener('click', () => {
    const v = edEl('editorViewer');
    if (v._idx > 0) { v._idx--; edUpdateViewer(); }
  });
  edEl('viewerNext')?.addEventListener('click', () => {
    const v = edEl('editorViewer');
    if (v._idx < edState.pages.length - 1) { v._idx++; edUpdateViewer(); }
  });

  // ── CERRAR PANEL AL TOCAR CANVAS ──
  canvas.addEventListener('pointerdown', () => {
    if (_panelTool && !['draw','eraser'].includes(_panelTool)) edClosePanel();
  }, { capture: true, passive: true });

  // ── RESIZE ──
  window.addEventListener('resize', () => { edResizeCanvas(); edRedraw(); });
}
