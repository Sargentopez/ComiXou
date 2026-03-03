/* ============================================================
   pub-viewer.js — Visor de publicaciones
   Overlay sobre el index. Mismas mecánicas que el visor del editor:
   - AbortController para limpieza de listeners
   - Swipe izquierda/derecha: avanzar bocadillo o página
   - Botones ◀▶✕ en desktop, solo ✕ en táctil
   - Modo secuencial: bocadillos revelados uno a uno
   ============================================================ */

const PubViewer = (() => {

  // ── Estado ──────────────────────────────────────────────────
  let _comic    = null;
  let _panelIdx = 0;
  let _bubbleStep = 0;   // nº de bocadillos revelados (1 = primero visible)
  let _ac       = null;

  // ── Abrir ───────────────────────────────────────────────────
  function open(comicId) {
    const comic = ComicStore.getById(comicId);
    if (!comic || !comic.panels?.length) {
      showToast('No se encontró el cómic'); return;
    }
    _comic    = comic;
    _panelIdx = 0;
    document.getElementById('pubViewer').classList.add('open');
    _renderPanel(0);
    _bindListeners();
  }

  // ── Cerrar ──────────────────────────────────────────────────
  function close() {
    document.getElementById('pubViewer')?.classList.remove('open');
    if (_ac) { _ac.abort(); _ac = null; }
    if (window._pvRO) { window._pvRO.disconnect(); window._pvRO = null; }
    const stage = document.getElementById('pvStage');
    if (stage) stage.innerHTML = '';
    _comic = null;
    // Volver al index (el visor se abre desde home, al cerrar regresamos ahí)
    if (typeof Router !== 'undefined') Router.go('home');
  }

  // ── Renderizar panel ────────────────────────────────────────
  function _renderPanel(idx) {
    _panelIdx = idx;
    const panel = _comic.panels[idx];
    const stage = document.getElementById('pvStage');
    if (!stage || !panel) return;

    stage.innerHTML = '';

    // Imagen del panel
    const img = document.createElement('img');
    img.className = 'pv-panel-img';
    img.draggable = false;
    stage.appendChild(img);

    // Capa de textos: se posiciona encima de la imagen con sus mismas dimensiones
    const textLayer = document.createElement('div');
    textLayer.className = 'pv-text-layer';
    _buildTexts(panel, textLayer);
    stage.appendChild(textLayer);

    // textMode: leer de panel.textMode, con 'sequential' como valor por defecto real
    // (el editor puede guardar 'immediate' como fallback erróneo — tratarlo como sequential)
    const isSeq = !panel.textMode || panel.textMode === 'sequential' || panel.textMode === 'immediate';
    const bubbles = textLayer.querySelectorAll('.pv-bubble');

    function _initBubbles() {
      if (isSeq && bubbles.length > 0) {
        _bubbleStep = 1;
        bubbles[0].classList.add('visible');
      } else {
        _bubbleStep = bubbles.length;
        bubbles.forEach(b => b.classList.add('visible'));
      }
      _updateCounter();
      _showControls();
    }

    // Ajustar text-layer al tamaño real de la imagen renderizada.
    // Usa offsetWidth/offsetHeight del stage (coords relativas al padre),
    // NO getBoundingClientRect que devuelve coords absolutas de pantalla.
    function _fitTextLayer() {
      const sw = stage.offsetWidth,  sh = stage.offsetHeight;
      const iw = img.naturalWidth  || sw;
      const ih = img.naturalHeight || sh;
      if (!iw || !ih) return;
      const scale = Math.min(sw / iw, sh / ih);
      const rw = iw * scale,    rh = ih * scale;
      const rl = (sw - rw) / 2, rt = (sh - rh) / 2;
      textLayer.style.cssText =
        `position:absolute;pointer-events:none;` +
        `left:${rl}px;top:${rt}px;width:${rw}px;height:${rh}px;`;
    }

    let _ready = false;
    function _onReady() { if (_ready) return; _ready = true; _fitTextLayer(); _initBubbles(); }
    img.onload  = () => _onReady();
    img.onerror = () => { if (!_ready) { _ready = true; _initBubbles(); } };
    img.src = panel.dataUrl || '';
    if (img.complete && img.naturalWidth) _onReady();

    // ResizeObserver: reajustar si cambia el tamaño de pantalla (rotación, etc.)
    if (window._pvRO) { window._pvRO.disconnect(); window._pvRO = null; }
    window._pvRO = new ResizeObserver(() => { if (img.naturalWidth) _fitTextLayer(); });
    window._pvRO.observe(stage);
  }

  // ── Construir textos HTML ────────────────────────────────────
  function _buildTexts(panel, layer) {
    if (!panel.texts?.length) return;
    const items = [...panel.texts]
      .filter(t => t.text)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    items.forEach((t, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'pv-bubble';
      wrap.style.cssText = `left:${t.x}%;top:${t.y}%;width:${t.w || 30}%`;
      wrap.dataset.idx = i;

      const inner = document.createElement('div');
      inner.className = 'pv-bubble-inner';
      inner.style.cssText = [
        `font-family:${t.fontFamily || '"Comic Neue",cursive'}`,
        `font-size:${Math.round((t.fontSize || 18) * 0.85)}px`,
        `color:${t.color || '#000'}`,
        `background:${t.bg || '#fff'}`,
        `border:${t.border || 2}px solid ${t.borderColor || '#000'}`,
        t.style === 'thought'    ? 'border-radius:50%'  :
        t.style === 'explosion'  ? 'border-radius:4px;transform:rotate(-1deg)' :
                                   'border-radius:14px',
      ].join(';');

      inner.appendChild(Object.assign(document.createElement('span'), { textContent: t.text }));

      // Cola del bocadillo
      if (t.type === 'dialog' && t.style !== 'thought' && t.style !== 'radio') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('class', 'pv-tail tail-' + (t.tail || 'bottom'));
        svg.setAttribute('viewBox','0 0 30 22');
        const path = document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d','M0 0 L15 22 L30 0 Z');
        path.setAttribute('fill', t.bg || '#fff');
        path.setAttribute('stroke', t.borderColor || '#000');
        path.setAttribute('stroke-width','2.5');
        path.setAttribute('stroke-linejoin','round');
        svg.appendChild(path);
        inner.appendChild(svg);
      }

      wrap.appendChild(inner);
      layer.appendChild(wrap);
    });
  }

  // ── Avanzar ─────────────────────────────────────────────────
  function _advance() {
    const panel   = _comic.panels[_panelIdx];
    const isSeq   = (panel.textMode || 'sequential') === 'sequential';
    const bubbles = document.querySelectorAll('#pvStage .pv-bubble');

    if (isSeq && _bubbleStep < bubbles.length) {
      bubbles[_bubbleStep].classList.add('visible');
      _bubbleStep++;
      _updateCounter();
    } else if (_panelIdx < _comic.panels.length - 1) {
      _renderPanel(_panelIdx + 1);
    }
  }

  // ── Retroceder ──────────────────────────────────────────────
  function _back() {
    const panel   = _comic.panels[_panelIdx];
    const isSeq   = (panel.textMode || 'sequential') === 'sequential';
    const bubbles = document.querySelectorAll('#pvStage .pv-bubble');

    if (isSeq && _bubbleStep > 1) {
      _bubbleStep--;
      bubbles[_bubbleStep].classList.remove('visible');
      _updateCounter();
    } else if (_panelIdx > 0) {
      _renderPanel(_panelIdx - 1);
      // Al retroceder, mostrar todos los bocadillos del panel anterior
      requestAnimationFrame(() => {
        const prevBubbles = document.querySelectorAll('#pvStage .pv-bubble');
        prevBubbles.forEach(b => b.classList.add('visible'));
        _bubbleStep = prevBubbles.length;
        _updateCounter();
      });
    }
  }

  // ── Contador ─────────────────────────────────────────────────
  function _updateCounter() {
    const panel   = _comic.panels[_panelIdx];
    const isSeq   = (panel.textMode || 'sequential') === 'sequential';
    const total   = _comic.panels.length;
    const bubbles = document.querySelectorAll('#pvStage .pv-bubble');
    const cnt = document.getElementById('pvCounter');
    if (!cnt) return;
    cnt.textContent = (isSeq && bubbles.length > 0)
      ? `${_panelIdx + 1}/${total} · 💬${_bubbleStep}/${bubbles.length}`
      : `${_panelIdx + 1} / ${total}`;
  }

  // ── Mostrar controles ────────────────────────────────────────
  function _showControls() {
    const ctrl = document.getElementById('pvControls');
    if (!ctrl) return;
    ctrl.classList.remove('hidden');
    clearTimeout(PubViewer._hideTimer);
    PubViewer._hideTimer = setTimeout(() => ctrl.classList.add('hidden'), 3000);
  }

  // ── Listeners con AbortController ───────────────────────────
  function _bindListeners() {
    if (_ac) _ac.abort();
    _ac = new AbortController();
    const sig = { signal: _ac.signal };
    const viewer = document.getElementById('pubViewer');

    // Botones
    ['click','pointerup'].forEach(ev => {
      document.getElementById('pvClose')
        ?.addEventListener(ev, e => { e.stopPropagation(); close(); }, sig);
      document.getElementById('pvCloseMobile')
        ?.addEventListener(ev, e => { e.stopPropagation(); close(); }, sig);
      document.getElementById('pvNext')
        ?.addEventListener(ev, e => { e.stopPropagation(); _advance(); }, sig);
      document.getElementById('pvPrev')
        ?.addEventListener(ev, e => { e.stopPropagation(); _back(); }, sig);
    });

    // Teclado
    document.addEventListener('keydown', e => {
      if (!document.getElementById('pubViewer')?.classList.contains('open')) return;
      if (e.key==='ArrowRight'||e.key==='ArrowDown') { e.preventDefault(); _advance(); }
      if (e.key==='ArrowLeft' ||e.key==='ArrowUp')   { e.preventDefault(); _back(); }
      if (e.key==='Escape') close();
    }, sig);

    // Swipe táctil
    let _sx = null, _sy = null, _sc = false;
    viewer.addEventListener('touchstart', e => {
      _sx = null; _sy = null; _sc = false;
      if (e.touches.length !== 1) return;
      _sx = e.touches[0].clientX;
      _sy = e.touches[0].clientY;
    }, { passive:true, ...sig });

    viewer.addEventListener('touchmove', e => {
      if (_sx === null) return;
      const dx = e.touches[0].clientX - _sx;
      const dy = e.touches[0].clientY - _sy;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) _sc = true;
    }, { passive:true, ...sig });

    viewer.addEventListener('touchend', e => {
      if (_sx === null || _sc) { _sx = null; return; }
      if (e.changedTouches.length !== 1) { _sx = null; return; }
      const dx = e.changedTouches[0].clientX - _sx;
      const dy = e.changedTouches[0].clientY - _sy;
      _sx = null;
      if (Math.abs(dx) < 30 || Math.abs(dx) <= Math.abs(dy)) return;
      if (dx < 0) _advance(); else _back();
    }, { passive:true, ...sig });

    // Mouse: mostrar pastilla
    viewer.addEventListener('mousemove', () => _showControls(), { passive:true, ...sig });
    viewer.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') _showControls();
    }, { capture:true, passive:true, ...sig });
  }

  return { open, close };
})();
