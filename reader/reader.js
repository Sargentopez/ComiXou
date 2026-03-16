/* ============================================================
   ComiXow Reader — Reproductor externo standalone
   Canvas idéntico al visor interno del editor.
   ============================================================ */

const SUPABASE_URL = 'https://qqgsbyylaugsagbxsetc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';

// Dimensiones del canvas — IDÉNTICAS al editor para render 1:1
// El escalado para ocupar la pantalla lo hace CSS (canvas.style.width/height)
const ED_PAGE_W = 360;
const ED_PAGE_H = 780;
// El workspace del editor es 5×ancho × 3×alto del panel vertical
// Necesario para reproducir el tamaño de las burbujas de cola "thought"
const ED_CANVAS_MIN = Math.min(ED_PAGE_W * 5, ED_PAGE_H * 3); // 1800

// ── ESTADO ──────────────────────────────────────────────────
const RS = {
  panels:       [],   // [{id, orientation, text_mode, data_url, texts:[]}]
  images:       [],   // Image objects precargados
  idx:          0,    // panel actual
  textStep:     0,    // bocadillo visible (sequential)
  fadeAlpha:    0,    // alpha bocadillo anterior
  fadeRaf:      null,
  canvas:       null,
  ctx:          null,
  ctrlTimer:    null,
  ac:           null,
  keyHandler:   null,
  resizeFn:     null,
  creditsShown: false, // true tras mostrarse la primera vez — no vuelve a aparecer
};

// ── ARRANQUE ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const id     = params.get('id');
  const draft  = params.get('draft');   // token de borrador (obra no publicada)
  const wantsFs = params.get('fs') === '1'; // heredar fullscreen de la app

  // Modo embed: incrustado en iframe desde admin/expositor
  RS.isEmbed = params.get('embed') === '1' || window.self !== window.top;

  const _doClose = () => {
    if (history.length > 1) { history.back(); return; }
    // Intentar cerrar la pestaña
    window.close();
    // Si seguimos aquí, el navegador bloqueó el cierre — mostrar instrucción
    setTimeout(() => {
      _readerToast('Cierra esta pestaña con el botón ✕ del navegador', 4000);
    }, 300);
  };

  const _closeAction = RS.isEmbed
    ? _embedClose
    : () => {
        // Salir de fullscreen primero si está activo, luego cerrar
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) { exit.call(document).then(_doClose).catch(_doClose); return; }
        }
        _doClose();
      };
  if (RS.isEmbed) document.body.classList.add('embed-mode');

  // Si la app estaba en fullscreen, entrar en fullscreen al primer gesto del usuario
  // (los navegadores exigen que requestFullscreen esté dentro de un evento de usuario)
  if (wantsFs && !RS.isEmbed) {
    const _enterFsOnce = () => {
      const req = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
      if (req) req.call(document.documentElement).catch(() => {});
      document.removeEventListener('click',     _enterFsOnce);
      document.removeEventListener('touchstart', _enterFsOnce);
      document.removeEventListener('keydown',    _enterFsOnce);
    };
    document.addEventListener('click',     _enterFsOnce, { once: true });
    document.addEventListener('touchstart', _enterFsOnce, { once: true });
    document.addEventListener('keydown',    _enterFsOnce, { once: true });
  }

  // Botón cerrar: siempre visible, pegado a la hoja por _positionBtns()
  const closeBtnEl = document.getElementById('closeBtn');
  if (closeBtnEl) {
    closeBtnEl.addEventListener('click', _closeAction);
    closeBtnEl.addEventListener('touchend', e => { e.stopPropagation(); _closeAction(); }, { passive: false });
  }

  // Botón fullscreen: listener directo en gesto de usuario (igual que header.js)
  const fsBtn = document.getElementById('fullscreenToggle');
  if (fsBtn) {
    fsBtn.addEventListener('touchend', e => { e.stopPropagation(); }, { passive: false });
    fsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (RS.isEmbed) {
        // En iframe: pedir al padre que ponga el iframe en fullscreen
        try { window.parent.postMessage({ type: 'reader:fullscreen' }, '*'); } catch(_) {}
        return;
      }
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
      } else {
        if (typeof Fullscreen !== 'undefined') {
          Fullscreen.enter().catch(() => {});
        } else {
          const el = document.documentElement;
          const req = el.requestFullscreen || el.webkitRequestFullscreen;
          if (req) req.call(el, { navigationUI: 'hide' }).catch(() => {});
        }
      }
    });
    document.addEventListener('fullscreenchange',       _onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', _onFullscreenChange);
  }

  if (draft) { loadDraft(draft); return; }
  if (id)    { loadWork(id);     return; }
  showError('No se indicó ninguna obra. Comprueba el enlace.');
});

function _toggleFullscreen() {
  if (RS.isEmbed) return;
  // Usar el mismo módulo Fullscreen que el editor de ComiXow
  if (typeof Fullscreen !== 'undefined') {
    Fullscreen.request();
  } else {
    // Fallback si el script no cargó
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFs) {
      (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
    } else {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el, { navigationUI: 'hide' }).catch(() => {});
    }
  }
}

function _onFullscreenChange() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const btn  = document.getElementById('fullscreenToggle');
  if (btn) btn.textContent = isFs ? '[ ✕ ]' : '[ ]';
}

function _embedClose() {
  history.back();
}

// ── CARGA DESDE SUPABASE ─────────────────────────────────────
async function loadWork(workId) {
  setLoadingMsg('Cargando obra...');
  try {
    const work = await sbGet('works?id=eq.' + workId + '&published=eq.true');
    if (!work || !work.length) { showError('Esta obra no existe o no está publicada.'); return; }

    setLoadingMsg('Cargando páginas...');
    await _loadPanels(workId);
    document.title = (work[0].title || 'Obra') + ' — ComiXow';
    RS._workAuthor = work[0].author_name || "";
    RS._workSocial = work[0].social      || "";
    RS._workTitle  = work[0].title       || '';
    // Añadir hoja de créditos como último panel — se trata como hoja normal
    const _lastPanel = RS.panels[RS.panels.length - 1];
    RS.panels.push({ id: 'credits', isCredits: true, orientation: _lastPanel?.orientation || 'v', layers: [], texts: [] });
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
    const work = await sbGet('works?id=eq.' + token);
    if (!work || !work.length) { showError('Borrador no encontrado o enlace caducado.'); return; }

    setLoadingMsg('Cargando páginas...');
    await _loadPanels(token);
    document.title = (work[0].title || 'Borrador') + ' — ComiXow';
    RS._workAuthor = work[0].author_name || "";
    RS._workSocial = work[0].social      || "";
    RS._workTitle  = work[0].title       || '';
    const _lastPanel = RS.panels[RS.panels.length - 1];
    RS.panels.push({ id: 'credits', isCredits: true, orientation: _lastPanel?.orientation || 'v', layers: [], texts: [] });
    setLoadingMsg('Preparando imágenes...');
    await preloadImages();
    startReader();
  } catch(err) {
    console.error('Error loadDraft:', err);
    showError('Error al cargar el borrador. Comprueba tu conexión.');
  }
}

// ── CARGA PANELES + CAPAS + TEXTOS ────────────────────────────
// Rellena RS.panels con capas del editor (panel_layers) y textos (panel_texts).
// panel_layers → render fiel por capas (imagen, draw, stroke, bubble, text)
// panel_texts  → lógica sequential (text_order, text_mode, contador)
async function _loadPanels(workId) {
  const panels = await sbGet('panels?work_id=eq.' + workId + '&order=panel_order.asc');
  if (!panels || !panels.length) { showError('Esta obra no tiene páginas guardadas.'); return; }

  const panelIds = panels.map(p => p.id).join(',');

  // Descargar capas del editor y textos del reader en paralelo
  const [layerRows, texts] = await Promise.all([
    sbGet('panel_layers?panel_id=in.(' + panelIds + ')&order=layer_order.asc'),
    sbGet('panel_texts?panel_id=in.('  + panelIds + ')&order=text_order.asc'),
  ]);

  RS.panels = panels.map(panel => {
    // Capas del editor: parsear layer_data JSON
    const layers = (layerRows || [])
      .filter(r => r.panel_id === panel.id)
      .sort((a, b) => a.layer_order - b.layer_order)
      .map(r => { try { return JSON.parse(r.layer_data); } catch(e) { return null; } })
      .filter(Boolean);

    // Textos para lógica sequential
    const panelTexts = (texts || [])
      .filter(t => t.panel_id === panel.id)
      .sort((a, b) => (a.text_order||0) - (b.text_order||0));

    return {
      ...panel,
      layers,
      texts: panelTexts,
    };
  });
}

async function preloadImages() {
  // Precargar todos los data base64 de capas image/draw/stroke de todos los paneles.
  // RS.panels[i].layerImgs[j] = Image | null para cada capa del panel i.
  RS.images = []; // legacy, ya no se usa para render pero se mantiene para no romper nada

  await Promise.all(RS.panels.map(async (panel, pi) => {
    panel.layerImgs = await Promise.all((panel.layers || []).map(layer => {
      const src = layer.src || layer.dataUrl;
      if (!src || (layer.type !== 'image' && layer.type !== 'draw' && layer.type !== 'stroke')) {
        return Promise.resolve(null);
      }
      return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }));
  }));

  // Fallback: si algún panel no tiene capas, precargar data_url como antes
  RS.panels.forEach((panel, i) => {
    if (!panel.layers || !panel.layers.length) {
      if (panel.data_url) {
        const img = new Image();
        img.src = panel.data_url;
        panel.layerImgs = [img];
        panel.layers    = [{ type: 'image', src: panel.data_url, x:0.5, y:0.5, width:1, height:1 }];
      } else {
        panel.layerImgs = [];
      }
    }
  });
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
  // Segunda pasada de posicionamiento: los botones ya son visibles y tienen dimensiones reales
  requestAnimationFrame(_positionBtns);

  // Registrar resize con delay para evitar que el resize inicial borre el canvas
  RS.resizeFn = () => { _resizeCanvas(); _render(); };
  setTimeout(() => window.addEventListener('resize', RS.resizeFn), 300);

  // Toast de instrucciones según dispositivo
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const msg = isTouch
    ? 'Desplázate tocando la pantalla  👆'
    : 'Desplázate con las flechas del teclado  ◀ ▶';
  _readerToast(msg, 4000);
}

// ── POSICIÓN DE BOTONES ───────────────────────────────────────
// Los botones se anclan a los bordes del canvas, no a la ventana.
// Se llama cada vez que el canvas cambia de tamaño o posición.
function _positionBtns() {
  const c = RS.canvas;
  if (!c) return;
  const cl  = parseInt(c.style.left)  || 0;
  const ct  = parseInt(c.style.top)   || 0;
  const cw  = parseInt(c.style.width) || 0;
  const PAD = 8;   // distancia al borde del canvas
  const OFY = 10;  // offset vertical desde el borde superior del canvas

  const fsBtn    = document.getElementById('fullscreenToggle');
  const closeBtn = document.getElementById('closeBtn');

  if (fsBtn) {
    fsBtn.style.left = (cl + PAD) + 'px';
    fsBtn.style.top  = (ct + OFY) + 'px';
  }
  if (closeBtn) {
    const btnW = closeBtn.getBoundingClientRect().width || 32;
    closeBtn.style.left = (cl + cw - PAD - btnW) + 'px';
    closeBtn.style.top  = (ct + OFY) + 'px';
  }
}

// ── TAMAÑO DEL CANVAS ─────────────────────────────────────────
function _panelDims(idx) {
  const isH = (RS.panels[idx]?.orientation || 'v') === 'h';
  return { pw: isH ? ED_PAGE_H : ED_PAGE_W, ph: isH ? ED_PAGE_W : ED_PAGE_H };
}

function _resizeCanvas() {
  const panel = RS.panels[RS.idx];
  const { pw, ph } = _panelDims(RS.idx);
  RS.canvas.width  = pw;
  RS.canvas.height = ph;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Panel de créditos: escalar como vertical normal (contain)
  // Hojas horizontales reales: llenar toda la altura
  const isHorizPanel = pw > ph && !panel?.isCredits;

  let scale;
  if (isHorizPanel) {
    scale = vh / ph;
    if (pw * scale > vw * 1.5) scale = vw / pw;
  } else {
    scale = Math.min(vw / pw, vh / ph);
  }

  const dw = Math.round(pw * scale), dh = Math.round(ph * scale);
  RS.canvas.style.width  = dw + 'px';
  RS.canvas.style.height = dh + 'px';
  RS.canvas.style.left   = Math.round((vw - dw) / 2) + 'px';
  RS.canvas.style.top    = Math.round((vh - dh) / 2) + 'px';
  _positionBtns();
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────
function _render() {
  const panel = RS.panels[RS.idx];
  if (!panel || !RS.ctx) return;

  // Panel de créditos — render especial con fade
  if (panel.isCredits) {
    RS.isCredits = true;
    const { pw, ph } = _panelDims(RS.idx);
    // Solo llamar _showCredits si no hay fade en marcha ni ya mostrado
    // para evitar el parpadeo al redibujar con alpha=0
    if (!RS.creditsTimer && !RS.fadeRaf) {
      _showCredits();
    } else {
      _renderCredits(pw, ph);
    }
    return;
  }

  // Si venimos de los créditos, resetear su estado
  if (RS.creditsTimer || RS.creditsAlpha > 0) _resetCredits();

  const { pw, ph } = _panelDims(RS.idx);
  const ctx = RS.ctx;

  ctx.clearRect(0, 0, pw, ph);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pw, ph);
  // Dibujar capas en orden: image/draw/stroke primero, bubble/text al final (via _drawTexts)
  const layers    = panel.layers    || [];
  const layerImgs = panel.layerImgs || [];

  layers.forEach((layer, j) => {
    const type = layer.type;
    if (type === 'image' || type === 'draw' || type === 'stroke') {
      const img = layerImgs[j];
      if (!img) return;
      ctx.save();
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      if (type === 'image' || type === 'stroke') {
        // Posición y tamaño en 0-1 relativo al panel; centro en (x, y)
        const x = (layer.x      || 0.5) * pw;
        const y = (layer.y      || 0.5) * ph;
        const w = (layer.width  || 1)   * pw;
        const h = (layer.height || 1)   * ph;
        const rot = layer.rotation || 0;
        ctx.translate(x, y);
        if (rot) ctx.rotate(rot * Math.PI / 180);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else {
        // draw: capa de dibujo libre — ocupa todo el panel, sin transformación
        ctx.drawImage(img, 0, 0, pw, ph);
      }
      ctx.restore();
    }
    // bubble/text: los gestiona _drawTexts con lógica sequential
  });

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
  // Detectar formato de coordenadas:
  // panel_texts: x,y,w,h en % (0-100) con campos w,h
  // panel_layers: x,y en 0-1 (centro), width,height en 0-1
  const _fromLayers = t.width !== undefined || t.height !== undefined;
  const _rawX = _fromLayers ? (t.x - (t.width  || 0.3) / 2) : (t.x / 100);
  const _rawY = _fromLayers ? (t.y - (t.height || 0.15)/ 2) : (t.y / 100);
  const _rawW = _fromLayers ? (t.width  || 0.3)              : ((t.w  || 30) / 100);
  const _rawH = _fromLayers ? (t.height || 0.15)             : ((t.h  || 15) / 100);
  const x = _rawX * pw;
  const y = _rawY * ph;
  const w = _rawW * pw;
  const h = _rawH * ph;
  // scale = 1: canvas lógico idéntico al editor, sin conversión
  const scale = 1;
  // Normalizar campos: panel_texts usa snake_case; panel_layers usa camelCase del editor
  const fontSize_  = t.font_size   || t.fontSize   || 30;
  const fontFamily_= t.font_family || t.fontFamily  || 'Patrick Hand';
  const fontBold_  = t.font_bold   ?? t.fontBold   ?? false;
  const fontItalic_= t.font_italic ?? t.fontItalic ?? false;
  const bgColor_   = t.bg          || t.backgroundColor || '#ffffff';
  const borderW_   = t.border !== undefined && t.border !== null ? t.border
                   : t.borderWidth !== undefined ? t.borderWidth : 2;
  const borderC_   = t.border_color || t.borderColor || '#000000';
  const textColor_ = t.color || '#000000';
  const padding_   = t.padding || 10;
  const fs = Math.max(10, Math.round(fontSize_ * scale));
  const bg     = bgColor_;
  const border = borderC_;
  const bw     = borderW_ * scale;
  const style  = t.style || 'conventional';
  const type   = t.type  || 'bubble';
  const cx = x + w / 2;
  const cy = y + h / 2;
  const isSingle = (t.text||'').trim().length===1 && /[a-zA-Z0-9]/.test((t.text||'').trim());
  // Normalizar cola: panel_texts usa snake_case + JSON string; panel_layers usa camelCase + array
  let tailStarts = t.tailStarts || t.tail_starts;
  let tailEnds   = t.tailEnds   || t.tail_ends;
  if (typeof tailStarts === 'string') { try { tailStarts = JSON.parse(tailStarts); } catch(e) { tailStarts = null; } }
  if (typeof tailEnds   === 'string') { try { tailEnds   = JSON.parse(tailEnds);   } catch(e) { tailEnds   = null; } }
  const hasTail    = t.hasTail    ?? t.has_tail    ?? true;
  const voiceCount = t.voiceCount ?? t.voice_count ?? 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (t.rotation) ctx.rotate(t.rotation * Math.PI / 180);

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
    // Cola de pensamiento: burbujas pequeñas — misma referencia que el editor (workspace completo)
    const canvasSize = ED_CANVAS_MIN * scale;
    const thoughtTailEnd = (tailEnds && tailEnds[0]) || {x:-0.4, y:0.6};
    [0.09,0.055,0.03].forEach((r, i) => {
      const f = 1 - i * 0.3;
      const tx = thoughtTailEnd.x * w * f, ty = thoughtTailEnd.y * h * f;
      ctx.beginPath(); ctx.arc(tx, ty, r * canvasSize, 0, Math.PI*2);
      ctx.fillStyle = bg; ctx.fill();
      ctx.strokeStyle = border; ctx.lineWidth = bw; ctx.stroke();
    });
    // Texto centrado
    ctx.font = (fontItalic_ ? 'italic ' : '') + (fontBold_ ? 'bold ' : '') + fs + 'px ' + fontFamily_;
    ctx.fillStyle = textColor_;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const padT = padding_ * scale;
    const linesT = _getLines(t.text || '');
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
  ctx.font = (fontItalic_ ? 'italic ' : '') + (fontBold_ ? 'bold ' : '') + fs + 'px ' + fontFamily_;
  const isPlaceholder = (t.text||'') === 'Escribe aquí';
  ctx.fillStyle = isPlaceholder ? '#999999' : textColor_;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = _getLines(t.text || '');
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

function _getLines(text) {
  // Idéntico al editor: solo divide por saltos de línea explícitos, sin wrap automático
  return String(text || '').split('\n');
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

// ── PANTALLA FINAL DE CRÉDITOS ────────────────────────────────
// Se llama desde _render() cuando el panel actual es el de créditos.
// La posición del canvas ya la gestiona _resizeCanvas() normalmente.
function _showCredits() {
  // Si ya se mostró antes: renderizar directamente con alpha=1, sin fade ni parpadeo
  if (RS.creditsShown) {
    RS.creditsAlpha = 1;
    const { pw, ph } = _panelDims(RS.idx);
    _renderCredits(pw, ph);
    return;
  }
  // Evitar relanzar si ya está en curso
  if (RS.creditsTimer || RS.creditsAlpha > 0) return;
  RS.creditsAlpha = 0;

  // Dibujar inmediatamente solo la parte estática (autor + social) sin parpadeo
  // El logo/eslogan/enlace aparecerán con fade tras 1 segundo
  const { pw: pw0, ph: ph0 } = _panelDims(RS.idx);
  _renderCredits(pw0, ph0);

  // Tras 1 segundo, iniciar fade-in del resto
  RS.creditsTimer = setTimeout(() => {
    const start = performance.now();
    const dur   = 1200;
    function fadeStep(now) {
      RS.creditsAlpha = Math.min(1, (now - start) / dur);
      const { pw, ph } = _panelDims(RS.idx);
      _renderCredits(pw, ph);
      if (RS.creditsAlpha < 1) RS.fadeRaf = requestAnimationFrame(fadeStep);
      else { RS.fadeRaf = null; RS.creditsShown = true; }
    }
    RS.fadeRaf = requestAnimationFrame(fadeStep);
  }, 1000);
}

function _resetCredits() {
  if (RS.creditsTimer) { clearTimeout(RS.creditsTimer); RS.creditsTimer = null; }
  if (RS.fadeRaf)      { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; }
  RS.creditsAlpha = 0;
  RS.isCredits    = false;
}

function _creditsClick() {
  if (RS.creditsTimer)  { clearTimeout(RS.creditsTimer);        RS.creditsTimer = null; }
  if (RS.fadeRaf)       { cancelAnimationFrame(RS.fadeRaf);     RS.fadeRaf = null; }
  RS.isCredits = false;
  RS.idx = 0; RS.textStep = _initTextStep(0); RS.fadeAlpha = 0;
  _resizeCanvas(); _render();
}

function _renderCredits(pw, ph) {
  const ctx   = RS.ctx;
  const alpha = RS.creditsAlpha || 0;
  ctx.clearRect(0, 0, pw, ph);

  // Fondo blanco limpio
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pw, ph);

  const isHoriz = pw > ph;
  const socialText = RS._workSocial || '';
  const authorText = RS._workAuthor || '';
  ctx.textBaseline = 'middle';

  // Función auxiliar: divide texto en líneas respetando \n explícitos y wrap por maxW.
  // Si una palabra sola supera maxW, se corta carácter a carácter.
  function wrapText(text, maxW) {
    const result = [];
    const paragraphs = text.split('\n');
    paragraphs.forEach(para => {
      if (!para.trim()) { result.push(''); return; }
      const words = para.split(' ');
      let cur = '';
      words.forEach(w => {
        // Si la palabra sola es más ancha que maxW, cortarla por caracteres
        if (ctx.measureText(w).width > maxW) {
          if (cur) { result.push(cur); cur = ''; }
          let chunk = '';
          for (const ch of w) {
            const test = chunk + ch;
            if (ctx.measureText(test).width > maxW && chunk) {
              result.push(chunk); chunk = ch;
            } else { chunk = test; }
          }
          if (chunk) {
            // intentar unir con lo que siga
            cur = chunk;
          }
          return;
        }
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && cur) { result.push(cur); cur = w; }
        else cur = test;
      });
      if (cur) result.push(cur);
    });
    return result;
  }

  if (isHoriz) {
    // ── LAYOUT HORIZONTAL: dos columnas ──────────────────────
    // Columna izquierda (55%): social + autor
    // Columna derecha (45%): logo + eslogan + enlace (con fade)
    const fRef   = ph;  // base de escala = altura (dimensión corta)
    const colGap = pw * 0.04;
    const leftW  = pw * 0.52;
    const rightW = pw * 0.44;
    const leftX  = pw * 0.04;
    const rightCX = leftW + colGap + rightW / 2;
    const padV   = ph * 0.08;

    // Separador vertical central
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#888888';
    ctx.fillRect(leftW + colGap * 0.4, ph * 0.1, 1, ph * 0.8);
    ctx.globalAlpha = 1;

    // ── Columna izquierda: social + autor ──
    const socialFS   = Math.round(fRef * 0.055);
    const authorFS   = Math.round(fRef * 0.072);
    const socialMaxW = leftW - leftX - pw * 0.02;  // ancho disponible desde leftX hasta borde columna

    let socialLines = [];
    if (socialText) {
      ctx.font      = `400 ${socialFS}px Patrick Hand, sans-serif`;
      socialLines   = wrapText(socialText, socialMaxW);
    }
    const socialLineH  = socialFS * 1.5;
    const totalSocialH = socialLines.length * socialLineH;
    const blockH       = totalSocialH + (socialText ? socialFS * 1.2 : 0) + authorFS * 1.5;
    let y = (ph - blockH) / 2 + socialLineH * 0.5;

    if (socialText) {
      ctx.font      = `400 ${socialFS}px Patrick Hand, sans-serif`;
      ctx.fillStyle = '#444444';
      ctx.textAlign = 'left';
      socialLines.forEach(line => {
        ctx.fillText(line, leftX, y);
        y += socialLineH;
      });
      y += socialFS * 0.8;
    }

    // Nombre del autor — centrado en columna izquierda
    ctx.font      = `600 ${authorFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.fillText(authorText, leftX + leftW / 2, y);

    // ── Columna derecha: logo + eslogan + enlace (con fade) ──
    // Mismas proporciones que el layout vertical, ancladas desde el centro vertical
    ctx.globalAlpha = alpha;

    const logoFS   = Math.round(fRef * 0.11);
    const sloganFS = Math.round(fRef * 0.042);
    const linkFS   = Math.round(fRef * 0.038);
    const lineH    = ph * 0.09;
    // Bloque centrado verticalmente en la columna derecha
    const rightBlockH = lineH * 1.3 + logoFS + sloganFS * 2 + sloganFS * 3 + linkFS;
    const rightStartY = (ph - rightBlockH) / 2 + logoFS * 0.5;

    ctx.font      = `900 ${logoFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#f5c400';
    ctx.textAlign = 'center';
    ctx.fillText('ComiXow', rightCX, rightStartY);

    const sloganY = rightStartY + sloganFS * 2;
    ctx.font      = `400 ${sloganFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#555555';
    ctx.fillText('Crea y Comparte', rightCX, sloganY);

    const linkY   = sloganY + sloganFS * 3;
    const linkText = 'Visita más obras del autor';
    ctx.font      = `400 ${linkFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#1a73e8';
    ctx.fillText(linkText, rightCX, linkY);
    const lw = ctx.measureText(linkText).width;
    ctx.beginPath();
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth   = Math.max(1, linkFS * 0.06);
    ctx.moveTo(rightCX - lw/2, linkY + linkFS * 0.6);
    ctx.lineTo(rightCX + lw/2, linkY + linkFS * 0.6);
    ctx.stroke();

    // Botón "Volver a leer"
    const restartFS   = Math.round(fRef * 0.038);
    const restartY    = linkY + linkFS * 2.2;
    const restartText = '↩ Volver a leer';
    ctx.font      = `600 ${restartFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText(restartText, rightCX, restartY);
    const rw = ctx.measureText(restartText).width;
    RS.creditsRestartArea = { x: rightCX - rw/2 - 10, y: restartY - restartFS, w: rw + 20, h: restartFS * 2.2 };

    ctx.globalAlpha = 1;
    RS.creditsLinkArea = { x: rightCX - lw/2, y: linkY - linkFS, w: lw, h: linkFS * 2 };

  } else {
    // ── LAYOUT VERTICAL: columna única ───────────────────────
    const fRef   = pw;
    const cx     = pw / 2;
    const marginX = pw * 0.09;
    const maxW    = pw * 0.82;

    // Social
    let authorY = ph * 0.11;
    if (socialText) {
      const socialFS    = Math.round(fRef * 0.038);
      ctx.font          = `400 ${socialFS}px Patrick Hand, sans-serif`;
      ctx.fillStyle     = '#444444';
      ctx.textAlign     = 'left';
      const socialLines = wrapText(socialText, maxW);
      const socialLineH = socialFS * 1.4;
      const socialStartY = ph * 0.26;
      socialLines.forEach((line, i) => ctx.fillText(line, marginX, socialStartY + i * socialLineH));
      authorY = socialStartY + socialLines.length * socialLineH + socialFS * 0.9;
    }

    // Autor
    ctx.font      = `600 ${Math.round(fRef * 0.055)}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.fillText(authorText, cx, authorY);

    // Resto con fade
    ctx.globalAlpha = alpha;

    const lineH    = ph * 0.09;
    const logoFS   = Math.round(fRef * 0.11);
    const logoY    = authorY + lineH * 1.3;
    ctx.font      = `900 ${logoFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#f5c400';
    ctx.fillText('ComiXow', cx, logoY);

    const sloganFS = Math.round(fRef * 0.042);
    const sloganY  = logoY + sloganFS * 2;
    ctx.font      = `400 ${sloganFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#555555';
    ctx.fillText('Crea y Comparte', cx, sloganY);

    const linkFS   = Math.round(fRef * 0.038);
    const linkY    = sloganY + sloganFS * 3;
    const linkText = 'Visita más obras del autor';
    ctx.font      = `400 ${linkFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#1a73e8';
    ctx.fillText(linkText, cx, linkY);
    const lw = ctx.measureText(linkText).width;
    ctx.beginPath();
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth   = Math.max(1, linkFS * 0.06);
    ctx.moveTo(cx - lw/2, linkY + linkFS * 0.6);
    ctx.lineTo(cx + lw/2, linkY + linkFS * 0.6);
    ctx.stroke();

    // Botón "Volver a leer"
    const restartFS   = Math.round(fRef * 0.038);
    const restartY    = linkY + linkFS * 2.2;
    const restartText = '↩ Volver a leer';
    ctx.font      = `600 ${restartFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText(restartText, cx, restartY);
    const rw = ctx.measureText(restartText).width;
    RS.creditsRestartArea = { x: cx - rw/2 - 10, y: restartY - restartFS, w: rw + 20, h: restartFS * 2.2 };

    ctx.globalAlpha = 1;
    RS.creditsLinkArea = { x: cx - lw/2, y: linkY - linkFS, w: lw, h: linkFS * 2 };
  }
}


// ── CONTROLES ─────────────────────────────────────────────────
function _updateCounter() { /* sin pastilla — no se muestra */ }

function _showControls() { /* botones de esquina siempre visibles */ }

// El navegador transforma las coordenadas táctiles al sistema del usuario.
// "Izquierda del usuario" es siempre endX < W/2, independientemente del ángulo.
function _isBackSide(endX, endY) {
  return endX < window.innerWidth / 2;
}

function _setupControls() {
  // closeBtn y fullscreenToggle configurados en DOMContentLoaded

  // Teclado PC
  RS.keyHandler = e => {
    if (['ArrowRight','ArrowDown','Space','Enter'].includes(e.code)) { e.preventDefault(); advance(); }
    if (['ArrowLeft','ArrowUp'].includes(e.code))                    { e.preventDefault(); goBack(); }
    if (e.key === 'Escape') {
      if (RS.isEmbed) { try { window.parent.postMessage({ type: 'reader:close' }, '*'); } catch(_) {} }
      else if (history.length > 1) history.back();
      else window.close();
    }
  };
  document.addEventListener('keydown', RS.keyHandler);

  // Click ratón en canvas: en créditos detecta enlace
  RS.canvas.addEventListener('click', e => {
    if (RS.isCredits) { _handleCreditsClick(e.clientX, e.clientY); }
  });

  // Swipe táctil con AbortController
  RS.ac = new AbortController();
  const sig = { signal: RS.ac.signal };
  let sx = null, sy = null, cancelled = false;

  RS.canvas.addEventListener('touchstart', e => {
    sx = null; sy = null; cancelled = false;
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true, ...sig });

  RS.canvas.addEventListener('touchmove', e => {
    if (sx === null) return;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dy) > 20) cancelled = true;
  }, { passive: true, ...sig });

  RS.canvas.addEventListener('touchend', e => {
    if (sx === null || cancelled) { sx = null; return; }
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dy   = Math.abs(endY - sy);
    sx = null;
    if (dy > 40) return;
    // En créditos: lado retroceder → goBack, lado avanzar → detecta enlace/botón
    if (RS.isCredits) {
      if (_isBackSide(endX, endY)) goBack();
      else _handleCreditsClick(endX, endY);
      return;
    }
    // Navegación normal
    if (_isBackSide(endX, endY)) goBack(); else advance();
  }, { passive: true, ...sig });
}

// ── UI HELPERS ────────────────────────────────────────────────
function _readerToast(msg, duration) {
  let el = document.getElementById('readerToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'readerToast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('rt-hide');
  el.classList.add('rt-show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('rt-show');
    el.classList.add('rt-hide');
  }, duration || 2500);
}


function _handleCreditsClick(clientX, clientY) {
  // Convertir coordenadas de pantalla a coordenadas del canvas lógico
  const rect   = RS.canvas.getBoundingClientRect();
  const scaleX = RS.canvas.width  / rect.width;
  const scaleY = RS.canvas.height / rect.height;
  const cx = (clientX - rect.left) * scaleX;
  const cy = (clientY - rect.top)  * scaleY;

  const la = RS.creditsLinkArea;
  if (la && cx >= la.x && cx <= la.x + la.w && cy >= la.y && cy <= la.y + la.h) {
    window.open('https://sargentopez.github.io/ComiXou/index.html', '_blank');
    return;
  }
  const ra = RS.creditsRestartArea;
  if (ra && cx >= ra.x && cx <= ra.x + ra.w && cy >= ra.y && cy <= ra.y + ra.h) {
    _creditsClick(); // Volver a leer → reinicia desde la primera hoja
  }
  // Tap fuera de ambas zonas → no hacer nada
}


function setLoadingMsg(msg) { const el = document.getElementById('loadingMsg'); if (el) el.textContent = msg; }
function showError(msg) {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('errorScreen').classList.remove('hidden');
  const el = document.getElementById('errorMsg');
  if (el) el.textContent = msg;
}
