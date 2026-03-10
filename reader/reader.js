/* ============================================================
   ComiXow Reader — Reproductor externo standalone
   Lee datos de Supabase. No depende del SPA.
   ============================================================ */

// ── CONFIGURACIÓN SUPABASE ──────────────────────────────────
const SUPABASE_URL = 'https://qqgsbyylaugsagbxsetc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';

// ── ESTADO DEL REPRODUCTOR ──────────────────────────────────
const RS = {
  work:            null,   // datos de la obra (title, author_name, nav_mode)
  panels:          [],     // array de paneles con sus textos
  currentPanel:    0,
  currentBubbleIdx: -1,
  animating:       false,
  _keyHandler:     null,
};

// ── ARRANQUE ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { showError('No se indicó ninguna obra. Comprueba el enlace.'); return; }
  loadWork(id);
});

// ── CARGA DESDE SUPABASE ────────────────────────────────────
async function loadWork(workId) {
  setLoadingMsg('Cargando obra...');
  try {
    // 1. Datos de la obra
    const work = await sbGet(`works?id=eq.${workId}&published=eq.true`);
    if (!work || work.length === 0) { showError('Esta obra no existe o no está publicada.'); return; }
    RS.work = work[0];

    // 2. Paneles ordenados
    setLoadingMsg('Cargando páginas...');
    const panels = await sbGet(`panels?work_id=eq.${workId}&order=panel_order.asc`);
    if (!panels || panels.length === 0) { showError('Esta obra no tiene páginas publicadas.'); return; }

    // 3. Textos de todos los paneles (una sola petición)
    const panelIds = panels.map(p => p.id).join(',');
    const texts = await sbGet(`panel_texts?panel_id=in.(${panelIds})&order=text_order.asc`);

    // 4. Combinar: asignar los textos a cada panel
    RS.panels = panels.map(panel => ({
      ...panel,
      texts: (texts || []).filter(t => t.panel_id === panel.id),
    }));

    startReader();

  } catch (err) {
    console.error('Error cargando obra:', err);
    showError('Error de conexión. Comprueba tu internet e inténtalo de nuevo.');
  }
}

// Helper: fetch a la API REST de Supabase
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── INICIAR REPRODUCTOR ─────────────────────────────────────
function startReader() {
  // Ocultar carga, mostrar reproductor
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('readerApp').classList.remove('hidden');

  // Título y autor en la barra
  document.getElementById('readerTitle').textContent  = RS.work.title || 'Sin título';
  document.getElementById('readerAuthor').textContent = RS.work.author_name ? `por ${RS.work.author_name}` : '';

  // Título de la pestaña del navegador
  document.title = `${RS.work.title || 'Obra'} — ComiXow`;

  buildPanelElements();
  goToPanel(0);
  setupControls();
  showSwipeHint();
}

// ── CONSTRUIR ELEMENTOS HTML DE CADA PANEL ──────────────────
function buildPanelElements() {
  const stage = document.getElementById('readerStage');
  stage.innerHTML = '';

  RS.panels.forEach((panel, idx) => {
    const div = document.createElement('div');
    div.className = 'reader-panel orient-' + (panel.orientation || 'v');
    div.id = 'rp_' + idx;

    const inner = document.createElement('div');
    inner.className = 'reader-panel-inner';

    const img = document.createElement('img');
    img.className = 'reader-panel-img';
    if (panel.data_url) img.src = panel.data_url;
    img.draggable = false;
    inner.appendChild(img);

    const textLayer = document.createElement('div');
    textLayer.className = 'reader-text-layer';
    buildTexts(panel, textLayer);
    inner.appendChild(textLayer);

    div.appendChild(inner);
    stage.appendChild(div);
  });
}

function buildTexts(panel, layer) {
  if (!panel.texts || panel.texts.length === 0) return;

  const items = panel.texts
    .filter(t => t.text)
    .sort((a, b) => (a.text_order || 0) - (b.text_order || 0));

  items.forEach((t, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'reader-bubble' + (t.type !== 'dialog' ? ' reader-textbox' : '');
    wrapper.style.left  = t.x + '%';
    wrapper.style.top   = t.y + '%';
    wrapper.style.width = (t.w || 30) + '%';
    wrapper.dataset.bubbleIdx = i;

    const inner = document.createElement('div');
    inner.className = 'reader-bubble-inner' + (t.type !== 'dialog' ? ' reader-textbox-inner' : '');
    inner.style.fontFamily   = t.font_family || 'Arial';
    inner.style.fontSize     = Math.round((t.font_size || 18) * 0.85) + 'px';
    inner.style.color        = t.color || '#000';
    inner.style.background   = t.bg || '#fff';
    inner.style.borderWidth  = (t.border || 2) + 'px';
    inner.style.borderColor  = t.border_color || '#000';
    inner.style.borderStyle  = t.style === 'lowvoice' ? 'dashed' : 'solid';

    if      (t.style === 'explosion') { inner.style.borderRadius = '4px'; inner.style.transform = 'rotate(-1deg)'; }
    else if (t.style === 'thought')   { inner.style.borderRadius = '50%'; }
    else if (t.type !== 'dialog')     { inner.style.borderRadius = '6px'; }
    else                              { inner.style.borderRadius = '14px'; }

    inner.appendChild(Object.assign(document.createElement('span'), { textContent: t.text }));

    // Cola del bocadillo (solo para dialog que no sea thought ni radio)
    if (t.type === 'dialog' && t.style !== 'thought' && t.style !== 'radio') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'reader-tail tail-' + (t.tail || 'bottom'));
      svg.setAttribute('viewBox', '0 0 30 22');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M0 0 L15 22 L30 0 Z');
      p.setAttribute('fill', t.bg || 'white');
      p.setAttribute('stroke', t.border_color || 'black');
      p.setAttribute('stroke-width', '2.5');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
      inner.appendChild(svg);
    }

    wrapper.appendChild(inner);
    layer.appendChild(wrapper);
  });
}

// ── NAVEGACIÓN ───────────────────────────────────────────────
function goToPanel(idx) {
  if (RS.animating) return;
  if (idx < 0 || idx >= RS.panels.length) return;

  RS.animating = true;

  const prevIdx    = RS.currentPanel;
  const prevOrient = RS.panels[prevIdx]?.orientation || 'v';
  const nextOrient = RS.panels[idx]?.orientation     || 'v';
  const orientChanges = prevOrient !== nextOrient;

  const prevEl = document.getElementById('rp_' + prevIdx);
  const nextEl = document.getElementById('rp_' + idx);

  RS.currentPanel      = idx;
  RS.currentBubbleIdx  = -1;
  document.getElementById('readerPanelNum').textContent = (idx + 1) + ' / ' + RS.panels.length;

  if (orientChanges) {
    if (prevEl) { prevEl.style.transition = 'opacity 0.2s ease'; prevEl.style.opacity = '0'; }
    if (nextEl) {
      nextEl.classList.remove('active');
      nextEl.classList.remove('orient-h', 'orient-v');
      nextEl.classList.add('orient-' + prevOrient);
      nextEl.style.opacity = '1'; nextEl.style.transform = 'rotate(0deg)';
      nextEl.style.transition = 'none'; nextEl.style.pointerEvents = 'none';
    }
    setTimeout(() => {
      if (nextEl) {
        nextEl.classList.add('active');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const deg = nextOrient === 'v' ? 90 : -90;
          nextEl.style.transition = `transform 0.65s cubic-bezier(0.4,0,0.1,1), opacity 0.15s ease`;
          nextEl.style.transform  = `rotate(${deg}deg)`;
        }));
      }
    }, 200);
    setTimeout(() => {
      if (nextEl) {
        nextEl.style.transition = 'none'; nextEl.style.transform = 'rotate(0deg)';
        nextEl.classList.remove('orient-' + prevOrient);
        nextEl.classList.add('orient-' + nextOrient);
        nextEl.style.pointerEvents = '';
        setTimeout(() => { nextEl.style.transition = ''; }, 50);
      }
      RS.animating = false;
      _showBubblesForPanel(idx);
      requestOrientationLock(nextOrient);
    }, 950);

  } else {
    if (prevEl) prevEl.classList.remove('active');
    if (nextEl) nextEl.classList.add('active');
    setTimeout(() => {
      RS.animating = false;
      _showBubblesForPanel(idx);
      requestOrientationLock(nextOrient);
    }, 100);
  }
}

function _showBubblesForPanel(idx) {
  const panel  = RS.panels[idx];
  const mode   = panel?.text_mode || 'sequential';
  const panelEl = document.getElementById('rp_' + idx);
  if (!panelEl) return;
  const bubbles = panelEl.querySelectorAll('.reader-bubble');
  if (bubbles.length === 0) return;

  if (mode === 'sequential') {
    bubbles[0].classList.add('visible');
    RS.currentBubbleIdx = 0;
  } else {
    bubbles.forEach((b, i) => setTimeout(() => b.classList.add('visible'), i * 80));
    RS.currentBubbleIdx = bubbles.length - 1;
  }
}

function showNextBubble() {
  const panelEl = document.getElementById('rp_' + RS.currentPanel);
  if (!panelEl) return false;
  const bubbles = panelEl.querySelectorAll('.reader-bubble');
  const next    = RS.currentBubbleIdx + 1;
  if (next < bubbles.length) {
    bubbles[next].classList.add('visible');
    RS.currentBubbleIdx = next;
    return true;
  }
  return false;
}

function advance() {
  const panel = RS.panels[RS.currentPanel];
  const isSeq = (panel?.text_mode || 'sequential') === 'sequential';
  if (isSeq && showNextBubble()) return;

  const next = RS.currentPanel + 1;
  if (next >= RS.panels.length) {
    document.getElementById('endOverlay').classList.remove('hidden');
    return;
  }
  goToPanel(next);
}

function goBack() {
  if (RS.currentPanel > 0) goToPanel(RS.currentPanel - 1);
}

// ── CONTROLES ────────────────────────────────────────────────
function setupControls() {
  document.getElementById('nextBtn')?.addEventListener('click', advance);
  document.getElementById('prevBtn')?.addEventListener('click', goBack);
  document.getElementById('restartBtn')?.addEventListener('click', () => {
    document.getElementById('endOverlay').classList.add('hidden');
    goToPanel(0);
  });

  RS._keyHandler = (e) => {
    if (['ArrowRight', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); advance(); }
    if (e.code === 'ArrowLeft') goBack();
  };
  document.addEventListener('keydown', RS._keyHandler);

  // Swipe y tap en móvil
  const stage = document.getElementById('readerStage');
  let tx = 0, ty = 0, tt = 0;
  stage.addEventListener('touchstart', (e) => {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
    tt = Date.now();
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    const dx   = e.changedTouches[0].clientX - tx;
    const dy   = e.changedTouches[0].clientY - ty;
    const dt   = Date.now() - tt;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dt < 300 && dist < 15) { advance(); return; }
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) advance(); else goBack();
    }
  }, { passive: true });
}

// ── ORIENTACIÓN ──────────────────────────────────────────────
function requestOrientationLock(orient) {
  if (!screen.orientation?.lock) return;
  screen.orientation.lock(orient === 'v' ? 'portrait' : 'landscape').catch(() => {});
}

// ── SWIPE HINT ───────────────────────────────────────────────
function showSwipeHint() {
  const hint = document.getElementById('swipeHint');
  if (!hint) return;
  setTimeout(() => { hint.style.opacity = '0'; }, 2500);
  setTimeout(() => { hint.style.display = 'none'; }, 3200);
}

// ── UI HELPERS ───────────────────────────────────────────────
function setLoadingMsg(msg) {
  const el = document.getElementById('loadingMsg');
  if (el) el.textContent = msg;
}

function showError(msg) {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('errorScreen').classList.remove('hidden');
  const el = document.getElementById('errorMsg');
  if (el) el.textContent = msg;
}
