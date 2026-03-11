/* ============================================================
   ComiXow Reader — Reproductor externo standalone
   Canvas idéntico al visor interno del editor.
   ============================================================ */

const SUPABASE_URL = 'https://qqgsbyylaugsagbxsetc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';

// Dimensiones canónicas (igual que el editor)
const ED_PAGE_W = 720;
const ED_PAGE_H = 1280;

// ── ESTADO ──────────────────────────────────────────────────
const RS = {
  panels:     [],   // [{id, orientation, text_mode, data_url, texts:[]}]
  images:     [],   // Image objects precargados
  idx:        0,    // panel actual
  textStep:   0,    // bocadillo visible (sequential)
  fadeAlpha:  0,    // alpha bocadillo anterior
  fadeRaf:    null,
  canvas:     null,
  ctx:        null,
  ctrlTimer:  null,
  ac:         null,
  keyHandler: null,
  resizeFn:   null,
};

// ── ARRANQUE ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const id     = params.get('id');
  const draft  = params.get('draft');   // token de borrador (obra no publicada)

  // Modo embed: incrustado en iframe desde admin/expositor
  RS.isEmbed = params.get('embed') === '1' || window.self !== window.top;

  if (RS.isEmbed) {
    document.body.classList.add('embed-mode');
    // El botón cerrar manda mensaje al padre en lugar de navegar
    document.getElementById('closeBtn')?.addEventListener('click', _embedClose);
    document.getElementById('endBackBtn')?.addEventListener('click', _embedClose);
  } else {
    document.getElementById('closeBtn')?.addEventListener('click',   () => history.back());
    document.getElementById('endBackBtn')?.addEventListener('click', () => history.back());
  }

  if (draft) { loadDraft(draft); return; }
  if (id)    { loadWork(id);     return; }
  showError('No se indicó ninguna obra. Comprueba el enlace.');
});

function _embedClose() {
  // Si está en iframe, notifica al padre. Si no, navega atrás.
  try { window.parent.postMessage({ type: 'reader:close' }, '*'); } catch(e) {}
  if (window.self === window.top) history.back();
}

// ── CARGA DESDE SUPABASE ─────────────────────────────────────
async function loadWork(workId) {
  setLoadingMsg('Cargando obra...');
  try {
    const work = await sbGet('works?id=eq.' + workId + '&published=eq.true');
    if (!work || !work.length) { showError('Esta obra no existe o no está publicada.'); return; }

    setLoadingMsg('Cargando páginas...');
    const panels = await sbGet('panels?work_id=eq.' + workId + '&order=panel_order.asc');
    if (!panels || !panels.length) { showError('Esta obra no tiene páginas publicadas.'); return; }

    const panelIds = panels.map(p => p.id).join(',');
    const texts    = await sbGet('panel_texts?panel_id=in.(' + panelIds + ')&order=text_order.asc');

    RS.panels = panels.map(panel => ({
      ...panel,
      texts: (texts || [])
        .filter(t => t.panel_id === panel.id)
        .sort((a,b) => (a.text_order||0) - (b.text_order||0)),
    }));

    document.title = (work[0].title || 'Obra') + ' — ComiXow';

    setLoadingMsg('Preparando imágenes...');
    await preloadImages();
    startReader();

  } catch(err) {
    console.error('Error:', err);
    showError('Error de conexión. Comprueba tu internet e inténtalo de nuevo.');
  }
}

// ── CARGA BORRADOR (obra no publicada, acceso por token) ─────
async function loadDraft(token) {
  setLoadingMsg('Cargando borrador...');
  try {
    // El token es el supabaseId de la obra, que solo conoce quien tiene el link
    const work = await sbGet('works?id=eq.' + token);
    if (!work || !work.length) { showError('Borrador no encontrado o enlace caducado.'); return; }

    setLoadingMsg('Cargando páginas...');
    const panels = await sbGet('panels?work_id=eq.' + token + '&order=panel_order.asc');
    if (!panels || !panels.length) { showError('Esta obra no tiene páginas guardadas.'); return; }

    const panelIds = panels.map(p => p.id).join(',');
    const texts    = await sbGet('panel_texts?panel_id=in.(' + panelIds + ')&order=text_order.asc');

    RS.panels = panels.map(panel => ({
      ...panel,
      texts: (texts || [])
        .filter(t => t.panel_id === panel.id)
        .sort((a,b) => (a.text_order||0) - (b.text_order||0)),
    }));

    document.title = (work[0].title || 'Borrador') + ' — ComiXow';
    setLoadingMsg('Preparando imágenes...');
    await preloadImages();
    startReader();
  } catch(err) {
    console.error('Error loadDraft:', err);
    showError('Error al cargar el borrador. Comprueba tu conexión.');
  }
}

async function preloadImages() {
  RS.images = await Promise.all(RS.panels.map(p => new Promise(resolve => {
    if (!p.data_url) { resolve(null); return; }
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = p.data_url;
  })));
}

async function sbGet(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return res.json();
}

// ── INICIAR ───────────────────────────────────────────────────
function startReader() {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('readerApp').classList.remove('hidden');

  RS.canvas = document.getElementById('readerCanvas');
  RS.ctx    = RS.canvas.getContext('2d');
  RS.idx    = 0;
  RS.textStep = _initTextStep(0);

  _resizeCanvas();
  _render();
  _showControls();
  _setupControls();

  RS.resizeFn = () => { _resizeCanvas(); _render(); };
  window.addEventListener('resize', RS.resizeFn);
}

// ── TAMAÑO DEL CANVAS ─────────────────────────────────────────
function _panelDims(idx) {
  const isH = (RS.panels[idx]?.orientation || 'v') === 'h';
  return { pw: isH ? ED_PAGE_H : ED_PAGE_W, ph: isH ? ED_PAGE_W : ED_PAGE_H };
}

function _resizeCanvas() {
  const { pw, ph } = _panelDims(RS.idx);
  RS.canvas.width  = pw;
  RS.canvas.height = ph;
  const vw = window.innerWidth, vh = window.innerHeight;
  // Reservar espacio para controles inferiores (~80px) y margen mínimo (8px)
  const CTRL_H = 80, MARGIN = 8;
  const availW = vw  - MARGIN * 2;
  const availH = vh  - CTRL_H - MARGIN;
  // Escala uniforme que respeta la proporción original siempre
  const scale = Math.min(availW / pw, availH / ph);
  const dw = Math.round(pw * scale), dh = Math.round(ph * scale);
  RS.canvas.style.width  = dw + 'px';
  RS.canvas.style.height = dh + 'px';
  RS.canvas.style.left   = Math.round((vw - dw) / 2) + 'px';
  RS.canvas.style.top    = Math.round(MARGIN + (availH - dh) / 2) + 'px';
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────
function _render() {
  const panel = RS.panels[RS.idx];
  if (!panel || !RS.ctx) return;
  const { pw, ph } = _panelDims(RS.idx);
  const ctx = RS.ctx;

  ctx.clearRect(0, 0, pw, ph);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pw, ph);

  const img = RS.images[RS.idx];
  if (img) ctx.drawImage(img, 0, 0, pw, ph);

  _drawTexts(ctx, panel, pw, ph);
  _updateCounter();
}

// ── TEXTOS / BOCADILLOS ───────────────────────────────────────
function _drawTexts(ctx, panel, pw, ph) {
  const texts = panel.texts || [];
  if (!texts.length) return;

  const isSeq = (panel.text_mode || 'sequential') === 'sequential';
  if (!isSeq) {
    texts.forEach(t => _drawBubble(ctx, t, pw, ph, 1));
    return;
  }
  // Modo sequential — replica exacta del visor interno del editor (edUpdateViewer):
  // - type 'text' (cajas): siempre al 100% cuando reveladas, permanecen visibles
  // - type 'bubble': el actual al 100%, el anterior con fade-out, los más viejos desaparecen
  const toShow = texts.slice(0, RS.textStep);
  toShow.forEach((t, vi) => {
    if (t.type === 'text') {
      _drawBubble(ctx, t, pw, ph, 1);
    } else {
      const isCurrent  = vi === toShow.length - 1;
      const isPrevious = vi === toShow.length - 2;
      if (isCurrent) {
        _drawBubble(ctx, t, pw, ph, 1);
      } else if (isPrevious && RS.fadeAlpha > 0) {
        _drawBubble(ctx, t, pw, ph, RS.fadeAlpha);
      }
      // Bocadillos más antiguos: ya desaparecieron
    }
  });
}

function _drawBubble(ctx, t, pw, ph, alpha) {
  const x  = (t.x / 100) * pw;
  const y  = (t.y / 100) * ph;
  const w  = ((t.w  || 30) / 100) * pw;
  const h  = ((t.h  || 15) / 100) * ph;
  const scale = pw / ED_PAGE_W;
  const fs = Math.max(10, Math.round((t.font_size || 16) * scale));
  const bg     = t.bg           || '#ffffff';
  const border = t.border_color || '#000000';
  const bw     = ((t.border !== undefined && t.border !== null) ? t.border : 2) * scale;
  const style  = t.style || 'conventional';
  const type   = t.type  || 'bubble';
  const cx = x + w / 2;
  const cy = y + h / 2;
  const isSingle = (t.text||'').trim().length===1 && /[a-zA-Z0-9]/.test((t.text||'').trim());
  // Parsear cola (llega como string JSON desde Supabase)
  let tailStarts = t.tail_starts;
  let tailEnds   = t.tail_ends;
  if (typeof tailStarts === 'string') { try { tailStarts = JSON.parse(tailStarts); } catch(e) { tailStarts = null; } }
  if (typeof tailEnds   === 'string') { try { tailEnds   = JSON.parse(tailEnds);   } catch(e) { tailEnds   = null; } }
  const hasTail    = t.has_tail ?? true;
  const voiceCount = t.voice_count ?? 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);

  if (style === 'thought') {
    // Nube de pensamiento: 4 círculos solapados
    const circles = [{x:0,y:-h/4,r:w/3},{x:w/4,y:0,r:w/3},{x:-w/4,y:0,r:w/3},{x:0,y:h/4,r:w/3}];
    ctx.fillStyle = bg; ctx.strokeStyle = border; ctx.lineWidth = bw;
    circles.forEach(c => {
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    });
    function ci(c1, c2) {
      const dx=c2.x-c1.x, dy=c2.y-c1.y, d=Math.hypot(dx,dy);
      if (d>c1.r+c2.r||d<Math.abs(c1.r-c2.r)||d===0) return [];
      const a=(c1.r*c1.r-c2.r*c2.r+d*d)/(2*d), h2=c1.r*c1.r-a*a;
      if (h2<0) return []; const hh=Math.sqrt(h2), x0=c1.x+a*dx/d, y0=c1.y+a*dy/d;
      const rx=-dy*(hh/d), ry=dx*(hh/d);
      return [{x:x0+rx,y:y0+ry},{x:x0-rx,y:y0-ry}];
    }
    let maxDist = 0;
    [[0,1],[0,2],[1,3],[2,3],[0,3],[1,2]].forEach(([a,b]) => {
      ci(circles[a],circles[b]).forEach(p => { maxDist = Math.max(maxDist, Math.hypot(p.x,p.y)); });
    });
    if (maxDist === 0) maxDist = Math.min(w,h)*0.4;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0,0,maxDist,0,Math.PI*2); ctx.fill();
    // Cola de pensamiento: burbujas pequeñas
    const canvasSize = Math.min(pw, ph);
    const thoughtTailEnd = (tailEnds && tailEnds[0]) || {x:-0.4, y:0.6};
    [0.09,0.055,0.03].forEach((r, i) => {
      const f = 1 - i * 0.3;
      const tx = thoughtTailEnd.x * w * f, ty = thoughtTailEnd.y * h * f;
      ctx.beginPath(); ctx.arc(tx, ty, r * canvasSize, 0, Math.PI*2);
      ctx.fillStyle = bg; ctx.fill();
      ctx.strokeStyle = border; ctx.lineWidth = bw; ctx.stroke();
    });
    // Texto centrado
    ctx.font = fs + 'px ' + (t.font_family || 'Arial, sans-serif');
    ctx.fillStyle = t.color || '#000000';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const padT = (t.padding || 15) * scale;
    const linesT = _wrapText(ctx, t.text || '', w * 0.7 - padT * 2);
    const lhT = fs * 1.2, totalHT = linesT.length * lhT;
    linesT.forEach((line, i) => ctx.fillText(line, 0, -totalHT/2 + lhT/2 + i*lhT));
    ctx.restore();
    return;
  }

  if (style === 'explosion') {
    const pts = 12, step = (2*Math.PI)/pts;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const angle = i * step;
      const rr = (0.8+0.3*Math.sin(i*1.5)+0.2*Math.cos(i*2.3)) * (isSingle ? Math.min(w,h)/2 : (i%2===0?w/2:h/2));
      i===0 ? ctx.moveTo(Math.cos(angle)*rr, Math.sin(angle)*rr) : ctx.lineTo(Math.cos(angle)*rr, Math.sin(angle)*rr);
    }
    ctx.closePath();
  } else if (type === 'text') {
    // Caja de texto: rectángulo con esquinas ligeramente redondeadas
    const rr = Math.min(6 * scale, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(-w/2+rr, -h/2);
    ctx.lineTo( w/2-rr, -h/2); ctx.arcTo( w/2,-h/2,  w/2,-h/2+rr, rr);
    ctx.lineTo( w/2,    h/2-rr); ctx.arcTo( w/2, h/2,  w/2-rr, h/2, rr);
    ctx.lineTo(-w/2+rr, h/2); ctx.arcTo(-w/2,  h/2, -w/2, h/2-rr, rr);
    ctx.lineTo(-w/2,   -h/2+rr); ctx.arcTo(-w/2,-h/2, -w/2+rr,-h/2, rr);
    ctx.closePath();
  } else if (isSingle) {
    ctx.beginPath(); ctx.arc(0, 0, Math.min(w,h)/2, 0, Math.PI*2);
  } else {
    // Elipse — igual que el editor
    ctx.beginPath(); ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI*2);
  }

  ctx.fillStyle = bg; ctx.fill();
  if (bw > 0) {
    ctx.strokeStyle = border; ctx.lineWidth = bw;
    if (style === 'lowvoice') ctx.setLineDash([5*scale, 3*scale]); else ctx.setLineDash([]);
    ctx.stroke(); ctx.setLineDash([]);
  }

  // Cola (solo bocadillos, no cajas de texto)
  if (type === 'bubble' && hasTail && style !== 'radio') {
    const vc = voiceCount;
    const starts = tailStarts || [{x:-0.4, y:0.4}];
    const ends   = tailEnds   || [{x:-0.4, y:0.6}];
    for (let v = 0; v < vc; v++) {
      const ts = starts[v] || starts[0];
      const te = ends[v]   || ends[0];
      _drawTail(ctx, ts, te, w, h, bg, border, bw, scale);
    }
  } else if (type === 'bubble' && style === 'radio') {
    const te = (tailEnds && tailEnds[0]) || {x:0, y:0.5};
    const ex = te.x * w, ey = te.y * h;
    ctx.save(); ctx.strokeStyle = border; ctx.lineWidth = 1 * scale;
    for (let r = 5*scale; r < 25*scale; r += 5*scale) { ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI*2); ctx.stroke(); }
    ctx.restore();
  }

  // Texto centrado
  ctx.font = fs + 'px ' + (t.font_family || 'Arial, sans-serif');
  const isPlaceholder = (t.text||'') === 'Escribe aquí';
  ctx.fillStyle = isPlaceholder ? '#999999' : (t.color || '#000000');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const pad = (t.padding || 10) * scale;
  const lines = _wrapText(ctx, t.text || '', w - pad * 2);
  const lh = fs * 1.2, totalH = lines.length * lh;
  lines.forEach((line, i) => ctx.fillText(line, 0, -totalH/2 + lh/2 + i*lh));

  ctx.restore();
}

// Cola — coordenadas relativas al centro del bocadillo (ctx ya tiene translate)
function _drawTail(ctx, ts, te, w, h, bg, border, bw, scale) {
  const sx = ts.x * w, sy = ts.y * h;
  const ex = te.x * w, ey = te.y * h;
  const tailW = 10 * (scale||1);
  const angle = Math.atan2(ey-sy, ex-sx);
  const perp = {x:-Math.sin(angle), y:Math.cos(angle)};
  const left  = {x: sx+perp.x*tailW/2, y: sy+perp.y*tailW/2};
  const right = {x: sx-perp.x*tailW/2, y: sy-perp.y*tailW/2};
  ctx.beginPath(); ctx.moveTo(left.x,left.y); ctx.lineTo(ex,ey); ctx.lineTo(right.x,right.y);
  ctx.closePath();
  ctx.fillStyle = bg; ctx.fill();
  if (bw > 0) { ctx.strokeStyle = border; ctx.lineWidth = bw; ctx.stroke(); }
  // Línea de cobertura en la base del triángulo
  const extra = 1 * (scale||1);
  const extL = {x:left.x +perp.x*extra, y:left.y +perp.y*extra};
  const extR = {x:right.x-perp.x*extra, y:right.y-perp.y*extra};
  ctx.beginPath(); ctx.moveTo(extL.x,extL.y); ctx.lineTo(extR.x,extR.y);
  ctx.strokeStyle = bg; ctx.lineWidth = bw*2+2*(scale||1); ctx.lineCap='round'; ctx.stroke(); ctx.lineCap='butt';
}

function _wrapText(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w => {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else { cur = test; }
  });
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// ── NAVEGACIÓN ────────────────────────────────────────────────
function _initTextStep(idx) {
  const p = RS.panels[idx];
  return ((p?.text_mode || 'sequential') === 'sequential' && (p?.texts || []).length > 0) ? 1 : 0;
}

function advance() {
  if (RS.fadeRaf) { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; RS.fadeAlpha = 0; }
  const panel = RS.panels[RS.idx];
  const tl    = panel?.texts || [];
  const isSeq = (panel?.text_mode || 'sequential') === 'sequential';

  if (isSeq && RS.textStep < tl.length) {
    _startFade(); RS.textStep++; _render(); return;
  }
  if (RS.idx < RS.panels.length - 1) {
    RS.idx++; RS.textStep = _initTextStep(RS.idx); RS.fadeAlpha = 0;
    _resizeCanvas(); _render();
  } else {
    document.getElementById('endOverlay').classList.remove('hidden');
  }
}

function goBack() {
  if (RS.fadeRaf) { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; RS.fadeAlpha = 0; }
  const panel = RS.panels[RS.idx];
  const isSeq = (panel?.text_mode || 'sequential') === 'sequential';

  if (isSeq && RS.textStep > 1) { RS.textStep--; RS.fadeAlpha = 0; _render(); return; }
  if (RS.idx > 0) {
    RS.idx--;
    const pp = RS.panels[RS.idx];
    RS.textStep  = (pp?.text_mode || 'sequential') === 'sequential' ? (pp?.texts || []).length : 0;
    RS.fadeAlpha = 0;
    _resizeCanvas(); _render();
  }
}

function _startFade() {
  if (RS.fadeRaf) { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; }
  RS.fadeAlpha   = 1;
  const start    = performance.now();
  const duration = 400;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    RS.fadeAlpha = 1 - t;
    _render();
    if (t < 1) RS.fadeRaf = requestAnimationFrame(step);
    else { RS.fadeRaf = null; RS.fadeAlpha = 0; _render(); }
  }
  RS.fadeRaf = requestAnimationFrame(step);
}

// ── CONTROLES ─────────────────────────────────────────────────
function _updateCounter() {
  const el    = document.getElementById('readerCounter');
  if (!el) return;
  const panel = RS.panels[RS.idx];
  const tl    = panel?.texts || [];
  const isSeq = (panel?.text_mode || 'sequential') === 'sequential';
  el.textContent = (isSeq && tl.length)
    ? (RS.idx+1) + '/' + RS.panels.length + ' · \uD83D\uDCAC' + RS.textStep + '/' + tl.length
    : (RS.idx+1) + ' / ' + RS.panels.length;
}

function _showControls() {
  // En PC (sin táctil): controles siempre visibles, no se ocultan solos
  // En táctil: se muestran al tocar y se ocultan tras 3.5s
  const ctrls = document.getElementById('viewerControls');
  if (!ctrls) return;
  ctrls.classList.remove('ctrl-hidden');
  clearTimeout(RS.ctrlTimer);
  if (RS.isTouch) {
    RS.ctrlTimer = setTimeout(() => ctrls.classList.add('ctrl-hidden'), 3500);
  }
}

function _setupControls() {
  document.getElementById('nextBtn')?.addEventListener('click', advance);
  document.getElementById('prevBtn')?.addEventListener('click',  goBack);
  // closeBtn y endBackBtn ya se configuran en DOMContentLoaded según modo embed/normal
  document.getElementById('restartBtn')?.addEventListener('click', () => {
    document.getElementById('endOverlay').classList.add('hidden');
    RS.idx = 0; RS.textStep = _initTextStep(0); RS.fadeAlpha = 0;
    _resizeCanvas(); _render();
  });

  // Teclado PC
  RS.keyHandler = e => {
    if (['ArrowRight','ArrowDown','Space','Enter'].includes(e.code)) { e.preventDefault(); advance(); }
    if (['ArrowLeft','ArrowUp'].includes(e.code))                    { e.preventDefault(); goBack(); }
    if (e.key === 'Escape') history.back();
  };
  document.addEventListener('keydown', RS.keyHandler);

  // Detectar si es dispositivo táctil para la lógica de auto-ocultar controles
  RS.isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  _showControls(); // Mostrar al inicio (en PC se quedan fijos, en táctil se ocultan solos)

  // Swipe táctil con AbortController (evita acumulación de listeners)
  RS.ac = new AbortController();
  const sig = { signal: RS.ac.signal };
  let sx = null, sy = null, cancelled = false;

  RS.canvas.addEventListener('touchstart', e => {
    sx = null; sy = null; cancelled = false;
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    _showControls();
  }, { passive: true, ...sig });

  RS.canvas.addEventListener('touchmove', e => {
    if (sx === null) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) cancelled = true;
  }, { passive: true, ...sig });

  RS.canvas.addEventListener('touchend', e => {
    if (sx === null || cancelled) { sx = null; return; }
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) { advance(); return; } // tap
    if (Math.abs(dx) < 30 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) advance(); else goBack();
  }, { passive: true, ...sig });
}

// ── UI HELPERS ────────────────────────────────────────────────
function setLoadingMsg(msg) { const el = document.getElementById('loadingMsg'); if (el) el.textContent = msg; }
function showError(msg) {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('errorScreen').classList.remove('hidden');
  const el = document.getElementById('errorMsg');
  if (el) el.textContent = msg;
}
