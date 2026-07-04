/* Comxow/COMXOW, creada por A. Gavina Costero  2026, albertobicho@gmail.com */
/*
 * Librerías y código de terceros utilizados en este proyecto:
 *
 * - omggif (GIF encoder/decoder)
 *     Autor: Dean McNamee <dean@gmail.com>
 *     Licencia: MIT
 *     https://github.com/deanm/omggif
 *
 * - pako (compresión zlib/gzip)
 *     Autores: Andrei Tuputcyn, Vitaly Puzrin y colaboradores (Nodeca project)
 *     Licencia: MIT
 *     https://github.com/nodeca/pako
 *
 * - UPNG.js (codificador/decodificador PNG)
 *     Autor: Ivan Kutskir
 *     Licencia: MIT
 *     https://github.com/photopea/UPNG.js
 *
 * - LZW decompression (puerto JavaScript de implementación Java)
 *     Referencia original: https://gist.github.com/devunwired/4479231
 *     Licencia: dominio público / uso libre
 */
/* ============================================================
   reader.js — Lector de cómics
   ============================================================ */

const ReaderState = {
  comic:           null,
  currentPanel:    0,
  currentBubbleIdx: -1,
  touchStartX:     0,
  touchStartY:     0,
  animating:       false,
  totalPanels:     0,   // panels reales + 1 (créditos)
  creditsShown:    false,
  creditsAlpha:    0,
  creditsTimer:    null,
  fadeRaf:         null,
  creditsCanvas:   null,
  creditsCtx:      null,
  creditsRestartArea: null,
};

// Franja blanca tras el título del lector — refuerza su legibilidad con la
// nueva tipografía (Arial Bold). Empieza en el borde izquierdo de la página
// (por eso también queda detrás del logo) y termina justo tras el texto del
// título, con el extremo derecho en semicírculo.
function _readerUpdateTitlePill(){
  const bar   = document.getElementById('readerTopbar');
  const pill  = document.getElementById('readerTitlePill');
  const title = document.getElementById('readerComicTitle');
  if(!bar || !pill || !title) return;
  const barRect   = bar.getBoundingClientRect();
  const titleRect = title.getBoundingClientRect();
  if(titleRect.width <= 0){ pill.style.width = '0px'; return; }
  const vPad = titleRect.height * 0.067; // relleno vertical alrededor del texto (1/3 menos alto que antes)
  pill.style.top    = (titleRect.top - barRect.top - vPad) + 'px';
  pill.style.height = (titleRect.height + vPad * 2) + 'px';
  pill.style.width  = Math.max(0, titleRect.right - barRect.left + 4) + 'px';
}
window.addEventListener('resize', () => {
  cancelAnimationFrame(window._readerTitlePillRaf);
  window._readerTitlePillRaf = requestAnimationFrame(_readerUpdateTitlePill);
});

function ReaderView_init(params) {
  const comicId = (params && params.id) ? params.id : new URLSearchParams(window.location.search).get('id');
  if (!comicId) { Router.go('home'); return; }

  const comic = ComicStore.getById(comicId);
  if (!comic || !comic.panels || comic.panels.length === 0) {
    showToast(I18n.t('workNotFound'));
    setTimeout(() => Router.go('home'), 1500);
    return;
  }

  ReaderState.comic = comic;
  ReaderState.totalPanels = comic.panels.length + 1;
  ReaderState.creditsShown = false;

  document.getElementById('readerComicTitle').textContent = comic.title || I18n.t('noWork');
  _readerUpdateTitlePill();

  buildPanelElements();
  goToPanel(0);
  setupControls();
  showSwipeHint();
  I18n.applyAll();
}

// ════════════════════════════════════════
// CONSTRUIR VIÑETAS
// ════════════════════════════════════════
function buildPanelElements() {
  const stage = document.getElementById('readerStage');
  stage.innerHTML = '';

  ReaderState.comic.panels.forEach((panel, idx) => {
    const div = document.createElement('div');
    div.className = 'reader-panel orient-' + (panel.orientation || 'h');
    div.id = 'rp_' + idx;

    const inner = document.createElement('div');
    inner.className = 'reader-panel-inner';

    const img = document.createElement('img');
    img.className = 'reader-panel-img';
    if(panel.dataUrl) img.src = panel.dataUrl;
    img.draggable = false;
    inner.appendChild(img);

    const textLayer = document.createElement('div');
    textLayer.className = 'reader-text-layer';
    buildReaderTexts(panel, textLayer);
    inner.appendChild(textLayer);

    div.appendChild(inner);
    stage.appendChild(div);
  });

  // Panel de créditos: último panel, hereda orientación del último panel real
  const lastPanel = ReaderState.comic.panels[ReaderState.comic.panels.length - 1];
  const creditsOrient = lastPanel?.orientation || 'v';
  const creditsIdx = ReaderState.comic.panels.length;

  const creditsDiv = document.createElement('div');
  creditsDiv.className = 'reader-panel orient-' + creditsOrient + ' reader-credits-panel';
  creditsDiv.id = 'rp_' + creditsIdx;

  const creditsInner = document.createElement('div');
  creditsInner.className = 'reader-panel-inner';

  // Imagen invisible de relleno para que reader-panel-inner tenga las dimensiones correctas
  // (igual que los paneles normales con su dataUrl)
  const placeholderImg = document.createElement('img');
  placeholderImg.className = 'reader-panel-img';
  placeholderImg.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  placeholderImg.draggable = false;
  creditsInner.appendChild(placeholderImg);

  const canvas = document.createElement('canvas');
  canvas.className = 'reader-credits-canvas';
  const ED_PAGE_W = 360, ED_PAGE_H = 780;
  canvas.width  = creditsOrient === 'h' ? ED_PAGE_H : ED_PAGE_W;
  canvas.height = creditsOrient === 'h' ? ED_PAGE_W : ED_PAGE_H;
  // El canvas ocupa todo el inner igual que la imagen de los demás paneles
  canvas.style.position = 'absolute';
  canvas.style.inset    = '0';
  canvas.style.width    = '100%';
  canvas.style.height   = '100%';

  ReaderState.creditsCanvas = canvas;
  ReaderState.creditsCtx    = canvas.getContext('2d');
  ReaderState.creditsAlpha  = 0;

  creditsInner.appendChild(canvas);
  creditsDiv.appendChild(creditsInner);
  stage.appendChild(creditsDiv);
}

function buildReaderTexts(panel, layer) {
  if (!panel.texts || panel.texts.length === 0) return;

  const items = panel.texts
    .filter(t => t.text)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  items.forEach((t, i) => {
    const wrapper = document.createElement('div');
    wrapper.dataset.textIdx  = i;
    wrapper.dataset.textType = t.type; // 'bubble' o 'text'

    if (t.type === 'bubble') {
      // ── BOCADILLO ────────────────────────────────────────────
      wrapper.className = 'reader-bubble';
      wrapper.style.left  = t.x + '%';
      wrapper.style.top   = t.y + '%';
      wrapper.style.width = (t.w || 30) + '%';

      const inner = document.createElement('div');
      inner.className = 'reader-bubble-inner';
      inner.style.fontFamily  = t.fontFamily  || 'Patrick Hand, sans-serif';
      inner.style.fontSize    = Math.round((t.fontSize || 30) * 0.85) + 'px';
      inner.style.fontWeight  = t.fontBold   ? '700' : '400';
      inner.style.fontStyle   = t.fontItalic ? 'italic' : 'normal';
      inner.style.color       = t.color      || '#000';
      inner.style.background  = t.bg         || '#fff';
      inner.style.borderWidth = (t.border    || 2) + 'px';
      inner.style.borderColor = t.borderColor || '#000';
      inner.style.borderStyle = t.style === 'lowvoice' ? 'dashed' : 'solid';
      if (t.style === 'explosion') {
        // Forma SVG blob de explosión/grito
        inner.style.background   = 'transparent';
        inner.style.border       = 'none';
        inner.style.boxShadow    = 'none';
        inner.style.borderRadius = '0';
        inner.style.overflow     = 'visible';
        inner.style.display      = 'flex';
        inner.style.alignItems   = 'center';
        inner.style.justifyContent = 'center';
        inner.style.padding      = '22% 14%';
        const _eSvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        _eSvg.setAttribute('viewBox','0 0 289 182');
        _eSvg.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible;z-index:0;pointer-events:none;';
        const _eG = document.createElementNS('http://www.w3.org/2000/svg','g');
        _eG.setAttribute('transform','translate(144.239 90.627)');
        const _eP = document.createElementNS('http://www.w3.org/2000/svg','path');
        _eP.setAttribute('d','M -112.632 34.020 L -141.239 6.082 L -114.174 -14.397 L -120.965 -67.353 L -65.757 -48.937 L -47.530 -87.627 L -2.478 -58.343 L 55.189 -75.913 L 79.067 -46.179 L 134.931 -70.056 L 114.207 -24.553 L 141.239 7.884 L 114.207 25.905 L 130.426 79.968 L 82.671 56.991 L 61.947 84.022 L 12.389 66.903 L -43.926 87.627 L -74.561 61.046 L -117.812 75.463 L -112.632 34.020 Z');
        _eP.setAttribute('fill', t.bg || '#ffffff');
        _eP.setAttribute('stroke', t.borderColor || '#000000');
        _eP.setAttribute('stroke-width', String(t.border || 2));
        _eP.setAttribute('stroke-linecap','round');
        _eP.setAttribute('stroke-linejoin','round');
        _eG.appendChild(_eP);
        _eSvg.appendChild(_eG);
        inner.appendChild(_eSvg);
      }
      else if (t.style === 'thought')   {
        // Forma SVG blob de pensamiento — reemplaza el antiguo borderRadius:50%
        inner.style.background   = 'transparent';
        inner.style.border       = 'none';
        inner.style.boxShadow    = 'none';
        inner.style.borderRadius = '0';
        inner.style.overflow     = 'visible';
        inner.style.display      = 'flex';
        inner.style.alignItems   = 'center';
        inner.style.justifyContent = 'center';
        inner.style.padding      = '18% 12%'; // margen interior para que el texto quede dentro del blob
        // Insertar SVG de fondo (se añade antes del span de texto)
        const _tSvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        _tSvg.setAttribute('viewBox','0 0 278 149');
        _tSvg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;z-index:0;pointer-events:none;';
        const _tG = document.createElementNS('http://www.w3.org/2000/svg','g');
        _tG.setAttribute('transform','translate(138.536 74.392)');
        const _tP = document.createElementNS('http://www.w3.org/2000/svg','path');
        _tP.setAttribute('d','M -107.781 48.879 Q -113.641 43.637 -113.339 35.780 L -113.024 27.601 L -122.608 23.419 Q -129.985 20.199 -132.761 12.644 L -132.761 12.644 Q -135.536 5.088 -133.693 -2.747 L -133.686 -2.775 Q -131.836 -10.639 -124.875 -14.741 L -114.566 -20.816 L -114.566 -31.918 Q -114.566 -43.020 -106.574 -50.726 L -103.299 -53.884 Q -97.296 -59.673 -88.970 -60.136 L -88.338 -60.171 Q -80.643 -60.598 -73.396 -57.977 L -66.149 -55.355 L -57.514 -61.215 Q -48.879 -67.074 -38.647 -69.121 L -38.031 -69.244 Q -27.292 -71.392 -16.499 -69.541 L -15.704 -69.405 Q -5.705 -67.691 1.696 -60.752 L 9.097 -53.814 L 16.882 -59.399 Q 23.283 -63.990 31.147 -64.453 L 32.001 -64.503 Q 39.011 -64.916 45.950 -63.836 L 45.950 -63.836 Q 52.888 -62.757 56.576 -56.781 L 61.832 -48.263 L 73.299 -51.514 Q 82.494 -54.122 91.899 -52.426 L 93.042 -52.220 Q 101.305 -50.730 107.319 -44.870 L 107.570 -44.625 Q 113.332 -39.011 111.636 -31.147 L 109.940 -23.283 L 123.221 -18.607 Q 131.836 -15.574 133.686 -6.630 L 133.865 -5.764 Q 135.536 2.313 132.606 10.023 L 132.225 11.027 Q 129.677 17.732 123.201 20.816 L 116.725 23.900 L 116.178 32.102 Q 115.799 37.777 112.716 42.557 L 112.716 42.557 Q 109.632 47.337 104.300 49.321 L 103.001 49.805 Q 96.371 52.272 89.561 50.356 L 76.634 46.721 L 71.854 52.272 Q 67.074 57.823 60.150 60.214 L 58.594 60.752 Q 50.113 63.682 41.144 63.429 L 39.165 63.374 Q 28.217 63.065 19.061 57.056 L 8.481 50.113 L 0.925 57.823 Q -6.630 65.532 -17.103 68.150 L -19.091 68.648 Q -30.068 71.392 -40.861 67.999 L -40.861 67.999 Q -51.655 64.607 -59.440 56.397 L -68.616 46.721 L -75.709 51.346 Q -82.802 55.972 -91.231 55.157 L -94.096 54.879 Q -101.922 54.122 -107.781 48.879 L -107.781 48.879 Z');
        _tP.setAttribute('fill', t.bg || '#ffffff');
        _tP.setAttribute('stroke', t.borderColor || '#000000');
        _tP.setAttribute('stroke-width', String(t.border || 2));
        _tP.setAttribute('stroke-linecap','round');
        _tP.setAttribute('stroke-linejoin','round');
        _tG.appendChild(_tP);
        _tSvg.appendChild(_tG);
        inner.appendChild(_tSvg);
      }
      else                              { inner.style.borderRadius = '14px'; }

      inner.appendChild(Object.assign(document.createElement('span'), { textContent: t.text }));

      // Cola SVG para estilos que la tienen
      if (t.style !== 'thought' && t.style !== 'radio') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'reader-tail tail-' + (t.tail || 'bottom'));
        svg.setAttribute('viewBox', '0 0 30 22');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M0 0 L15 22 L30 0 Z');
        p.setAttribute('fill',          t.bg          || 'white');
        p.setAttribute('stroke',        t.borderColor || 'black');
        p.setAttribute('stroke-width',  '2.5');
        p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
        inner.appendChild(svg);
      }
      wrapper.appendChild(inner);

    } else {
      // ── CAJA DE TEXTO — siempre visible, no secuencial ───────
      wrapper.className = 'reader-textbox reader-textbox-always';
      wrapper.style.left  = t.x + '%';
      wrapper.style.top   = t.y + '%';
      wrapper.style.width = (t.w || 25) + '%';

      const inner = document.createElement('div');
      inner.className = 'reader-bubble-inner reader-textbox-inner';
      inner.style.fontFamily  = t.fontFamily  || 'Patrick Hand, sans-serif';
      inner.style.fontSize    = Math.round((t.fontSize || 30) * 0.85) + 'px';
      inner.style.fontWeight  = t.fontBold   ? '700' : '400';
      inner.style.fontStyle   = t.fontItalic ? 'italic' : 'normal';
      inner.style.color       = t.color      || '#000';
      inner.style.background  = t.bg         || 'transparent';
      inner.style.borderWidth = (t.border    || 0) + 'px';
      inner.style.borderColor = t.borderColor || '#000';
      inner.style.borderStyle = 'solid';
      inner.style.borderRadius = '6px';
      inner.appendChild(Object.assign(document.createElement('span'), { textContent: t.text }));
      wrapper.appendChild(inner);
    }

    layer.appendChild(wrapper);
  });
}

// ════════════════════════════════════════
// BOTONES DE CAPA — HIT TEST (SPA reader)
// ════════════════════════════════════════
const _ED_PAGE_W = 360, _ED_PAGE_H = 780;

// Hit test en coordenadas de panel para botones almacenados en panel.buttons
function _rBtnHitSPA(buttons, tapPx, tapPy, pw, ph) {
  if (!buttons || !buttons.length) return null;
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (!b || !b.action) continue;
    const cx = b.x * pw, cy = b.y * ph;
    const hw = b.width * pw / 2;
    const hh = b.height * ph / 2;
    const dx = tapPx - cx, dy = tapPy - cy;
    const ang = -(b.rotation || 0) * Math.PI / 180;
    const lx = dx * Math.cos(ang) - dy * Math.sin(ang);
    const ly = dx * Math.sin(ang) + dy * Math.cos(ang);
    if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return b;
  }
  return null;
}

// Convierte coordenadas de ventana al sistema del panel activo y hace hit test
function _checkBtnAtPoint(winX, winY) {
  const idx = ReaderState.currentPanel;
  const panels = ReaderState.comic?.panels;
  if (!panels || idx >= panels.length) return false;
  const panel = panels[idx];
  if (!panel || !panel.buttons || !panel.buttons.length) return false;
  const panelEl = document.getElementById('rp_' + idx);
  const innerEl = panelEl?.querySelector('.reader-panel-inner');
  if (!innerEl) return false;
  const rect = innerEl.getBoundingClientRect();
  const isH = (panel.orientation || 'v') === 'h';
  const pw = isH ? _ED_PAGE_H : _ED_PAGE_W;
  const ph = isH ? _ED_PAGE_W : _ED_PAGE_H;
  const tapX = (winX - rect.left) * pw / rect.width;
  const tapY = (winY - rect.top)  * ph / rect.height;
  if (tapX < 0 || tapX > pw || tapY < 0 || tapY > ph) return false;
  const hit = _rBtnHitSPA(panel.buttons, tapX, tapY, pw, ph);
  if (!hit) return false;
  const action = hit.action;
  if (action.type === 'page') { goToPanel(action.pageIdx); return true; }
  if (action.type === 'url')  { window.open(action.url, '_blank', 'noopener'); return true; }
  return false;
}

// ════════════════════════════════════════
// NAVEGACIÓN
// ════════════════════════════════════════
// El navegador transforma las coordenadas táctiles al sistema del usuario.
// "Izquierda del usuario" es siempre endX < W/2, independientemente del ángulo.
function _isBackSide(endX, endY) {
  return endX < window.innerWidth / 2;
}

function goToPanel(idx) {
  if (ReaderState.animating) return;
  const panels = ReaderState.comic.panels;
  const creditsIdx = panels.length; // índice del panel de créditos
  if (idx < 0 || idx > creditsIdx) return;

  ReaderState.animating = true;

  const prevIdx    = ReaderState.currentPanel;
  const prevOrient = (idx === creditsIdx ? panels[prevIdx] : panels[prevIdx])?.orientation || 'h';
  const nextOrient = (idx === creditsIdx ? panels[panels.length-1] : panels[idx])?.orientation || 'h';
  const orientChanges = prevOrient !== nextOrient;

  const prevEl = document.getElementById('rp_' + prevIdx);
  const nextEl = document.getElementById('rp_' + idx);

  ReaderState.currentPanel     = idx;
  ReaderState.currentBubbleIdx = -1;

  // Contador: créditos no cuenta como hoja numerada
  const displayNum = Math.min(idx + 1, panels.length);
  document.getElementById('readerPanelNum').textContent = displayNum + ' / ' + panels.length;

  if (orientChanges) {
    if (prevEl) {
      prevEl.style.transition = 'opacity 0.2s ease';
      prevEl.style.opacity    = '0';
    }
    if (nextEl) {
      nextEl.classList.remove('active');
      nextEl.classList.remove('orient-h', 'orient-v');
      nextEl.classList.add('orient-' + prevOrient);
      nextEl.style.opacity    = '1';
      nextEl.style.transform  = 'rotate(0deg)';
      nextEl.style.transition = 'none';
      nextEl.style.pointerEvents = 'none';
    }
    setTimeout(() => {
      if (nextEl) {
        nextEl.classList.add('active');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const deg = nextOrient === 'v' ? 90 : -90;
            nextEl.style.transition = `transform 0.65s cubic-bezier(0.4, 0, 0.1, 1), opacity 0.15s ease`;
            nextEl.style.transform  = `rotate(${deg}deg)`;
          });
        });
      }
    }, 200);
    setTimeout(() => {
      if (nextEl) {
        nextEl.style.transition = 'none';
        nextEl.style.transform  = 'rotate(0deg)';
        nextEl.classList.remove('orient-' + prevOrient);
        nextEl.classList.add('orient-' + nextOrient);
        nextEl.style.pointerEvents = '';
        setTimeout(() => { nextEl.style.transition = ''; }, 50);
      }
      ReaderState.animating = false;
      if (idx === creditsIdx) _showCreditsPanel();
      else { _showBubblesForPanel(idx); requestOrientationLock(nextOrient); }
    }, 950);

  } else {
    if (prevEl) prevEl.classList.remove('active');
    if (nextEl) nextEl.classList.add('active');
    setTimeout(() => {
      ReaderState.animating = false;
      if (idx === creditsIdx) _showCreditsPanel();
      else { _showBubblesForPanel(idx); requestOrientationLock(nextOrient); }
    }, 100);
  }
}

// Inicializa bocadillos al entrar en un panel.
// Las cajas de texto (.reader-textbox-always) son siempre visibles por CSS — no se tocan.
// Solo se gestionan los .reader-bubble (bocadillos type='bubble').
// sequential: muestra el primero, oculta el resto
// immediate:  muestra todos
function _showBubblesForPanel(idx) {
  const panel   = ReaderState.comic.panels[idx];
  const mode    = panel?.textMode || 'sequential';
  const panelEl = document.getElementById('rp_' + idx);
  if (!panelEl) return;
  const bubbles = Array.from(panelEl.querySelectorAll('.reader-bubble'));

  // Resetear todos

  // Resetear todos
  bubbles.forEach(b => b.classList.remove('visible'));

  if (bubbles.length === 0) { ReaderState.currentBubbleIdx = -1; return; }

  if (mode === 'sequential') {
    bubbles[0].classList.add('visible');
    ReaderState.currentBubbleIdx = 0;
  } else {
    bubbles.forEach((b, i) => setTimeout(() => b.classList.add('visible'), i * 80));
    ReaderState.currentBubbleIdx = bubbles.length - 1;
  }
}

// Avanza al siguiente bocadillo. Solo muestra el actual, oculta el anterior (igual que editor).
// Devuelve true si había siguiente bocadillo.
function _advanceBubble() {
  const panel = ReaderState.comic.panels[ReaderState.currentPanel];
  if ((panel?.textMode || 'sequential') !== 'sequential') return false;
  const panelEl = document.getElementById('rp_' + ReaderState.currentPanel);
  if (!panelEl) return false;
  const bubbles = Array.from(panelEl.querySelectorAll('.reader-bubble'));
  const next = ReaderState.currentBubbleIdx + 1;
  if (next < bubbles.length) {
    // Ocultar el anterior, mostrar el siguiente (igual que editor)
    if (ReaderState.currentBubbleIdx >= 0) bubbles[ReaderState.currentBubbleIdx].classList.remove('visible');
    bubbles[next].classList.add('visible');
    ReaderState.currentBubbleIdx = next;
    return true;
  }
  return false;
}

// Retrocede al bocadillo anterior. Devuelve true si había anterior.
function _backBubble() {
  const panel = ReaderState.comic.panels[ReaderState.currentPanel];
  if ((panel?.textMode || 'sequential') !== 'sequential') return false;
  const panelEl = document.getElementById('rp_' + ReaderState.currentPanel);
  if (!panelEl) return false;
  const bubbles = Array.from(panelEl.querySelectorAll('.reader-bubble'));
  if (ReaderState.currentBubbleIdx > 0) {
    bubbles[ReaderState.currentBubbleIdx].classList.remove('visible');
    ReaderState.currentBubbleIdx--;
    bubbles[ReaderState.currentBubbleIdx].classList.add('visible');
    return true;
  }
  return false;
}

function advance() {
  const panels = ReaderState.comic.panels;
  const creditsIdx = panels.length;

  // En el panel de créditos: tap reinicia desde el principio
  if (ReaderState.currentPanel === creditsIdx) {
    if (!ReaderState.creditsShown) return;
    _resetCreditsState();
    goToPanel(0);
    return;
  }

  // Intentar avanzar bocadillo en modo sequential
  if (_advanceBubble()) return;

  // Sin más bocadillos → avanzar panel
  goToPanel(ReaderState.currentPanel + 1);
}

function goBack() {
  // Igual que _viewerBack del editor: retroceder bocadillo primero, luego panel
  if (_backBubble()) return;
  if (ReaderState.currentPanel > 0) goToPanel(ReaderState.currentPanel - 1);
}

// ════════════════════════════════════════
// HOJA DE CRÉDITOS
// ════════════════════════════════════════
function _showCreditsPanel() {
  if (ReaderState.creditsShown) {
    // Ya se mostró antes: renderizar directamente con alpha=1
    ReaderState.creditsAlpha = 1;
    _renderCreditsCanvas();
    return;
  }
  // Primera vez: fade-in del bloque logo/eslogan/enlace
  ReaderState.creditsAlpha = 0;
  _renderCreditsCanvas(); // dibuja social+autor inmediatamente
  const dur = 1000, start = performance.now();
  const fadeStep = (now) => {
    ReaderState.creditsAlpha = Math.min(1, (now - start) / dur);
    _renderCreditsCanvas();
    if (ReaderState.creditsAlpha < 1) ReaderState.fadeRaf = requestAnimationFrame(fadeStep);
    else { ReaderState.creditsShown = true; ReaderState.fadeRaf = null; }
  };
  ReaderState.fadeRaf = requestAnimationFrame(fadeStep);
}

function _resetCreditsState() {
  if (ReaderState.fadeRaf) { cancelAnimationFrame(ReaderState.fadeRaf); ReaderState.fadeRaf = null; }
  ReaderState.creditsAlpha = 0;
  // creditsShown NO se resetea — la hoja de créditos es persistente:
  // una vez mostrada, siempre aparece directamente sin fade
}

function _renderCreditsCanvas() {
  const canvas = ReaderState.creditsCanvas;
  const ctx    = ReaderState.creditsCtx;
  if (!canvas || !ctx) return;
  const pw = canvas.width, ph = canvas.height;
  const alpha = ReaderState.creditsAlpha || 0;
  const comic = ReaderState.comic;

  ctx.clearRect(0, 0, pw, ph);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pw, ph);

  const isHoriz    = pw > ph;
  const socialText = comic.social || '';
  const authorText = comic.author || comic.username || '';
  ctx.textBaseline = 'middle';

  // Función auxiliar wrap con \n explícitos.
  // Si una palabra sola supera maxW, se corta carácter a carácter.
  function wrapText(text, maxW) {
    const result = [];
    text.split('\n').forEach(para => {
      if (!para.trim()) { result.push(''); return; }
      const words = para.split(' ');
      let cur = '';
      words.forEach(w => {
        if (ctx.measureText(w).width > maxW) {
          if (cur) { result.push(cur); cur = ''; }
          let chunk = '';
          for (const ch of w) {
            const test = chunk + ch;
            if (ctx.measureText(test).width > maxW && chunk) {
              result.push(chunk); chunk = ch;
            } else { chunk = test; }
          }
          if (chunk) { cur = chunk; }
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
    // Layout dos columnas
    const fRef    = ph;
    const leftX   = pw * 0.04;
    const leftW   = pw * 0.52;
    const colGap  = pw * 0.04;
    const rightW  = pw * 0.44;
    const rightCX = leftW + colGap + rightW / 2;

    // Separador
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#888888';
    ctx.fillRect(leftW + colGap * 0.4, ph * 0.1, 1, ph * 0.8);
    ctx.globalAlpha = 1;

    const socialFS = Math.round(fRef * 0.055);
    const authorFS = Math.round(fRef * 0.072);
    let socialLines = [];
    if (socialText) {
      ctx.font = `400 ${socialFS}px Patrick Hand, sans-serif`;
      socialLines = wrapText(socialText, leftW - leftX - pw * 0.02);
    }
    const socialLineH  = socialFS * 1.5;
    const totalSocialH = socialLines.length * socialLineH;
    const blockH = totalSocialH + (socialText ? socialFS * 1.2 : 0) + authorFS * 1.5;
    let y = (ph - blockH) / 2 + socialLineH * 0.5;

    if (socialText) {
      ctx.font      = `400 ${socialFS}px Patrick Hand, sans-serif`;
      ctx.fillStyle = '#444444';
      ctx.textAlign = 'left';
      socialLines.forEach(line => { ctx.fillText(line, leftX, y); y += socialLineH; });
      y += socialFS * 0.8;
    }
    ctx.font      = `600 ${authorFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.fillText(authorText, leftX + leftW / 2, y);

    ctx.globalAlpha = alpha;
    const logoFS   = Math.round(fRef * 0.11);
    const sloganFS = Math.round(fRef * 0.042);
    const linkFS   = Math.round(fRef * 0.038);
    const lineH    = ph * 0.09;
    const rightBlockH = lineH * 1.3 + logoFS + sloganFS * 2 + sloganFS * 3 + linkFS;
    const rightStartY = (ph - rightBlockH) / 2 + logoFS * 0.5;

    // Logo imagen (síncrono via data URL precargada)
    if(typeof _LOGO_DATA_URL !== 'undefined') {
      const _limg = new Image();
      _limg.src = _LOGO_DATA_URL;
      const _lh = logoFS * 1.1;
      const _lw = _limg.naturalWidth > 0 ? _limg.naturalWidth * (_lh / _limg.naturalHeight) : _lh * (191/42);
      ctx.drawImage(_limg, rightCX - _lw/2, rightStartY - _lh * 0.8, _lw, _lh);
    }

    const sloganY = rightStartY + sloganFS * 2;
    ctx.font      = `400 ${sloganFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#555555';
    ctx.fillText('Crea y Comparte', rightCX, sloganY);

    const linkY    = sloganY + sloganFS * 3;
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
    const restartFS = Math.round(fRef * 0.038);
    const restartY  = linkY + linkFS * 2.2;
    const restartText = '↩ Volver a leer';
    ctx.font      = `600 ${restartFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText(restartText, rightCX, restartY);
    ReaderState.creditsRestartArea = { x: rightCX - ctx.measureText(restartText).width/2 - 10, y: restartY - restartFS, w: ctx.measureText(restartText).width + 20, h: restartFS * 2.2 };

    ctx.globalAlpha = 1;

  } else {
    // Layout vertical columna única
    const fRef    = pw;
    const cx      = pw / 2;
    const marginX = pw * 0.09;
    const maxW    = pw * 0.82;

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

    ctx.font      = `600 ${Math.round(fRef * 0.055)}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.fillText(authorText, cx, authorY);

    ctx.globalAlpha = alpha;
    const lineH    = ph * 0.09;
    const logoFS   = Math.round(fRef * 0.11);
    const logoY    = authorY + lineH * 1.3;
    // Logo imagen (síncrono via data URL precargada)
    if(typeof _LOGO_DATA_URL !== 'undefined') {
      const _limg2 = new Image();
      _limg2.src = _LOGO_DATA_URL;
      const _lh2 = logoFS * 1.1;
      const _lw2 = _limg2.naturalWidth > 0 ? _limg2.naturalWidth * (_lh2 / _limg2.naturalHeight) : _lh2 * (191/42);
      ctx.drawImage(_limg2, cx - _lw2/2, logoY - _lh2 * 0.8, _lw2, _lh2);
    }

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
    const restartFS = Math.round(fRef * 0.038);
    const restartY  = linkY + linkFS * 2.2;
    const restartText = '↩ Volver a leer';
    ctx.font      = `600 ${restartFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText(restartText, cx, restartY);
    ReaderState.creditsRestartArea = { x: cx - ctx.measureText(restartText).width/2 - 10, y: restartY - restartFS, w: ctx.measureText(restartText).width + 20, h: restartFS * 2.2 };

    ctx.globalAlpha = 1;
  }
}

// ════════════════════════════════════════
// CONTROLES
// ════════════════════════════════════════
function setupControls() {
  // Botones PC — solo responden a click, no a touch (evita doble disparo con el stage)
  document.getElementById('nextBtn')?.addEventListener('click', (e) => {
    if (e.pointerType === 'touch') return;
    advance();
  });
  document.getElementById('prevBtn')?.addEventListener('click', (e) => {
    if (e.pointerType === 'touch') return;
    goBack();
  });

  // Reiniciar
  document.getElementById('restartBtn')?.addEventListener('click', () => {
    document.getElementById('endOverlay').classList.add('hidden');
    goToPanel(0);
  });

  // Teclado (PC) — siempre fijo independientemente del navMode
  ReaderState._keyHandler = (e) => {
    if (['ArrowRight','Space','Enter'].includes(e.code)) { e.preventDefault(); advance(); }
    if (e.code === 'ArrowLeft') goBack();
    if (e.code === 'Escape') Router.go('home');
  };
  document.addEventListener('keydown', ReaderState._keyHandler);

  // Swipe táctil — AbortController para evitar acumulación en cada apertura
  if (ReaderState._stageAC) ReaderState._stageAC.abort();
  ReaderState._stageAC = new AbortController();
  const sig = { signal: ReaderState._stageAC.signal, passive: true };

  const stage = document.getElementById('readerStage');
  const navMode = ReaderState.comic?.navMode || 'fixed';
  let touchStartX = 0, touchStartY = 0;

  stage.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, sig);

  // RATÓN / PC: hit test de botones de capa
  let _rdPdX = null, _rdPdY = null;
  stage.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    _rdPdX = e.clientX; _rdPdY = e.clientY;
  }, sig);
  stage.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse' || _rdPdX === null) return;
    const _dx = Math.abs(e.clientX - _rdPdX), _dy = Math.abs(e.clientY - _rdPdY);
    _rdPdX = null; _rdPdY = null;
    if (_dx > 15 || _dy > 15) return;
    _checkBtnAtPoint(e.clientX, e.clientY);
  }, sig);

  stage.addEventListener('touchend', (e) => {
    if (e.target.closest('button, a, input, label')) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx   = endX - touchStartX;
    const dy   = endY - touchStartY;
    const adx  = Math.abs(dx), ady = Math.abs(dy);

    // Botones de capa: prioridad absoluta sobre navegación
    if (_checkBtnAtPoint(endX, endY)) return;

    // En créditos: detectar botón "Volver a leer"
    if (ReaderState.currentPanel === ReaderState.comic.panels.length) {
      const canvas = ReaderState.creditsCanvas;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = (endX - rect.left) * (canvas.width  / rect.width);
        const cy = (endY - rect.top)  * (canvas.height / rect.height);
        const ra = ReaderState.creditsRestartArea;
        if (ra && cx >= ra.x && cx <= ra.x + ra.w && cy >= ra.y && cy <= ra.y + ra.h) {
          goToPanel(0); return;
        }
      }
      if (_isBackSide(endX, endY)) goBack();
      return;
    }

    if (navMode === 'horizontal') {
      // Swipe horizontal: derecha→atrás, izquierda→adelante
      if (adx < 30) return; // sin movimiento suficiente
      if (adx < ady) return; // gesto más vertical que horizontal, ignorar
      if (dx > 0) goBack(); else advance();
    } else if (navMode === 'vertical') {
      // Swipe vertical: abajo→atrás, arriba→adelante
      if (ady < 30) return;
      if (ady < adx) return; // gesto más horizontal que vertical, ignorar
      if (dy > 0) goBack(); else advance();
    } else {
      // Modo fixed (o PC): tap en mitad izquierda/derecha
      if (ady > 40) return;
      if (_isBackSide(endX, endY)) goBack(); else advance();
    }
  }, sig);
}

// ════════════════════════════════════════
// ORIENTACIÓN AUTOMÁTICA
// ════════════════════════════════════════
function requestOrientationLock(orient) {
  if (!screen.orientation?.lock) return;
  screen.orientation.lock(orient === 'v' ? 'portrait' : 'landscape').catch(() => {});
}

// ════════════════════════════════════════
// SWIPE HINT
// ════════════════════════════════════════
function showSwipeHint() {
  const hint = document.getElementById('swipeHint');
  if (!hint) return;
  setTimeout(() => { hint.style.opacity = '0'; }, 2500);
  setTimeout(() => { hint.style.display = 'none'; }, 3200);
}

// ════════════════════════════════════════
// LIMPIEZA DE VISTA (obligatorio para SPA)
// ════════════════════════════════════════
function ReaderView_destroy() {
  if (ReaderState._keyHandler) {
    document.removeEventListener('keydown', ReaderState._keyHandler);
    ReaderState._keyHandler = null;
  }
  if (ReaderState._stageAC) { ReaderState._stageAC.abort(); ReaderState._stageAC = null; }
  if (ReaderState.fadeRaf) { cancelAnimationFrame(ReaderState.fadeRaf); ReaderState.fadeRaf = null; }
  ReaderState.creditsCanvas = null;
  ReaderState.creditsCtx    = null;
  ReaderState.comic = null;
}
