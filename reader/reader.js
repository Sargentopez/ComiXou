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
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { showError('No se indicó ninguna obra. Comprueba el enlace.'); return; }
  loadWork(id);
});

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
  const scale = Math.min(vw / pw, vh / ph);
  const dw = Math.round(pw * scale), dh = Math.round(ph * scale);
  RS.canvas.style.width  = dw + 'px';
  RS.canvas.style.height = dh + 'px';
  RS.canvas.style.left   = Math.round((vw - dw) / 2) + 'px';
  RS.canvas.style.top    = Math.round((vh - dh) / 2) + 'px';
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
  // Modo sequential: solo hasta textStep, con fade del anterior
  const toShow = texts.slice(0, RS.textStep);
  toShow.forEach((t, vi) => {
    const isCur  = vi === toShow.length - 1;
    const isPrev = vi === toShow.length - 2;
    if (isCur)                           _drawBubble(ctx, t, pw, ph, 1);
    else if (isPrev && RS.fadeAlpha > 0) _drawBubble(ctx, t, pw, ph, RS.fadeAlpha);
  });
}

function _drawBubble(ctx, t, pw, ph, alpha) {
  const x  = (t.x / 100) * pw;
  const y  = (t.y / 100) * ph;
  const w  = ((t.w || 30) / 100) * pw;
  const fs = Math.max(10, Math.round((t.font_size || 16) * (pw / ED_PAGE_W)));
  const bg     = t.bg           || '#ffffff';
  const border = t.border_color || '#000000';
  const bw     = (t.border !== undefined && t.border !== null) ? t.border : 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = fs + 'px ' + (t.font_family || 'Arial, sans-serif');

  const lines = _wrapText(ctx, t.text || '', w - 20);
  const lh    = fs * 1.38;
  const h     = lines.length * lh + 20;
  const r     = _bubbleRadius(t);

  // Fondo
  ctx.beginPath();
  _rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = bg;
  ctx.fill();

  // Borde
  if (bw > 0) {
    ctx.strokeStyle = border;
    ctx.lineWidth   = bw;
    if (t.style === 'lowvoice') ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Cola del bocadillo
  if (t.type === 'dialog' && t.style !== 'thought' && t.style !== 'radio') {
    _drawTail(ctx, t, x, y, w, h, bg, border, bw);
  }

  // Texto
  ctx.fillStyle    = t.color || '#000000';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, x + 10, y + 10 + i * lh));

  ctx.restore();
}

function _bubbleRadius(t) {
  if (t.type === 'text')        return 6;
  if (t.style === 'thought')    return 999;
  if (t.style === 'explosion')  return 4;
  return 14;
}

function _drawTail(ctx, t, x, y, w, h, bg, border, bw) {
  const tail = t.tail || 'bottom';
  const cx = x + w / 2;
  const tw = 18, th = 16;
  let p1, p2, p3;

  if      (tail === 'bottom') { p1=[cx-tw/2, y+h];      p2=[cx, y+h+th];       p3=[cx+tw/2, y+h];      }
  else if (tail === 'top')    { p1=[cx-tw/2, y];         p2=[cx, y-th];         p3=[cx+tw/2, y];         }
  else if (tail === 'left')   { p1=[x, y+h/2-tw/2];     p2=[x-th, y+h/2];     p3=[x, y+h/2+tw/2];     }
  else                        { p1=[x+w, y+h/2-tw/2];   p2=[x+w+th, y+h/2];   p3=[x+w, y+h/2+tw/2];   }

  ctx.beginPath();
  ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3);
  ctx.closePath();
  ctx.fillStyle = bg; ctx.fill();
  if (bw > 0) { ctx.strokeStyle = border; ctx.lineWidth = bw; ctx.stroke(); }
}

function _rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w/2, h/2);
  ctx.moveTo(x+rr, y);
  ctx.lineTo(x+w-rr, y);   ctx.arcTo(x+w, y,   x+w, y+rr,   rr);
  ctx.lineTo(x+w, y+h-rr); ctx.arcTo(x+w, y+h, x+w-rr, y+h, rr);
  ctx.lineTo(x+rr, y+h);   ctx.arcTo(x,   y+h, x, y+h-rr,   rr);
  ctx.lineTo(x, y+rr);     ctx.arcTo(x,   y,   x+rr, y,      rr);
  ctx.closePath();
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
  const ctrls = document.getElementById('viewerControls');
  if (!ctrls) return;
  ctrls.classList.remove('hidden');
  clearTimeout(RS.ctrlTimer);
  RS.ctrlTimer = setTimeout(() => ctrls.classList.add('hidden'), 3500);
}

function _setupControls() {
  document.getElementById('nextBtn')?.addEventListener('click',  advance);
  document.getElementById('prevBtn')?.addEventListener('click',  goBack);
  document.getElementById('closeBtn')?.addEventListener('click', () => history.back());
  document.getElementById('closeMobileBtn')?.addEventListener('click', () => history.back());
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

  // Mouse — mostrar controles al mover
  RS.canvas.addEventListener('mousemove',  () => _showControls(), { passive: true });
  RS.canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') _showControls(); }, { passive: true });

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
