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
};

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
  document.getElementById('readerComicTitle').textContent = comic.title || I18n.t('noWork');

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
}

function buildReaderTexts(panel, layer) {
  if (!panel.texts || panel.texts.length === 0) return;

  // ── CAJAS DE TEXTO (header / footer / caption) ─────────────────
  // Siempre visibles, posicionadas exactamente igual que en el editor
  panel.texts.filter(t => t.type !== 'dialog').forEach(t => {
    if (!t.text) return;
    const block = document.createElement('div');
    if (t.type === 'header' || t.type === 'footer') {
      // Header/footer: banda completa arriba o abajo
      block.className = 'reader-text-block ' + t.type;
      block.textContent = t.text;
    } else {
      // Caption: posicionado exactamente como en el editor
      block.className = 'reader-text-caption';
      block.style.left   = t.x + '%';
      block.style.top    = t.y + '%';
      block.style.width  = (t.w || 20) + '%';
      block.style.fontSize = (t.fontSize || 20) + 'px';
      block.style.fontFamily = t.fontFamily || 'Arial';
      block.style.color  = t.color || '#000';
      block.style.background = t.bg || '#fff';
      if (t.border) block.style.border = t.border + 'px solid ' + (t.borderColor || '#000');
      block.textContent = t.text;
    }
    layer.appendChild(block);
  });

  // ── BOCADILLOS (dialog) ─────────────────────────────────────────
  // Aparecen uno a uno al tap/clic, en el orden definido por el editor.
  // La posición y tamaño coinciden exactamente con lo que se ve en el editor.
  const dialogs = panel.texts
    .filter(t => t.type === 'dialog' && t.text)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  dialogs.forEach((d, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'reader-bubble';
    // Posición: esquina superior-izquierda del bocadillo en % del panel
    wrapper.style.left   = d.x + '%';
    wrapper.style.top    = d.y + '%';
    wrapper.style.width  = (d.w || 30) + '%';
    wrapper.dataset.bubbleIdx = i;

    // Estilos del bocadillo copiados del editor
    const inner = document.createElement('div');
    inner.className = 'reader-bubble-inner';
    inner.style.fontFamily  = d.fontFamily || 'Comic Sans MS, cursive';
    inner.style.fontSize    = Math.round((d.fontSize || 18) * 0.85) + 'px'; // escalar para el reader
    inner.style.color       = d.color || '#000';
    inner.style.background  = d.bg || '#fff';
    inner.style.borderWidth = (d.border || 2) + 'px';
    inner.style.borderColor = d.borderColor || '#000';
    inner.style.borderStyle = d.style === 'lowvoice' ? 'dashed' : 'solid';
    // Forma según estilo
    if (d.style === 'explosion') {
      inner.style.borderRadius = '4px';
      inner.style.transform = 'rotate(-1deg)';
    } else if (d.style === 'thought') {
      inner.style.borderRadius = '50%';
    } else {
      inner.style.borderRadius = '14px';
    }

    const span = document.createElement('span');
    span.textContent = d.text;
    inner.appendChild(span);

    // Cola del bocadillo (SVG)
    if (d.style !== 'thought' && d.style !== 'radio') {
      const tail = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      tail.setAttribute('class', 'reader-tail tail-' + (d.tail || 'bottom'));
      tail.setAttribute('viewBox', '0 0 30 22');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0 0 L15 22 L30 0 Z');
      path.setAttribute('fill', d.bg || 'white');
      path.setAttribute('stroke', d.borderColor || 'black');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('stroke-linejoin', 'round');
      tail.appendChild(path);
      inner.appendChild(tail);
    }

    wrapper.appendChild(inner);
    layer.appendChild(wrapper);
  });
}

// ════════════════════════════════════════
// NAVEGACIÓN
// ════════════════════════════════════════
function goToPanel(idx) {
  if (ReaderState.animating) return;
  const panels = ReaderState.comic.panels;
  if (idx < 0 || idx >= panels.length) return;

  ReaderState.animating = true;

  const prevIdx    = ReaderState.currentPanel;
  const prevOrient = panels[prevIdx]?.orientation || 'h';
  const nextOrient = panels[idx]?.orientation     || 'h';
  const orientChanges = prevOrient !== nextOrient;

  const prevEl = document.getElementById('rp_' + prevIdx);
  const nextEl = document.getElementById('rp_' + idx);

  ReaderState.currentPanel     = idx;
  ReaderState.currentBubbleIdx = -1;
  document.getElementById('readerPanelNum').textContent = (idx+1) + ' / ' + panels.length;

  if (orientChanges) {
    // ── GIRO DE ORIENTACIÓN ──
    // 1. Fade out de la viñeta anterior
    if (prevEl) {
      prevEl.style.transition = 'opacity 0.2s ease';
      prevEl.style.opacity    = '0';
    }

    // 2. Preparar la nueva viñeta: empieza con la orientación ANTERIOR
    //    y visible pero rotada 0º (se verá como si tuviese la forma equivocada)
    if (nextEl) {
      nextEl.classList.remove('active');
      // Forzar orientación previa temporalmente para que el canvas tenga la forma anterior
      nextEl.classList.remove('orient-h', 'orient-v');
      nextEl.classList.add('orient-' + prevOrient);
      nextEl.style.opacity    = '1';
      nextEl.style.transform  = 'rotate(0deg)';
      nextEl.style.transition = 'none';
      nextEl.style.pointerEvents = 'none';
    }

    setTimeout(() => {
      // 3. Mostrar la nueva viñeta y lanzar el giro
      if (nextEl) {
        nextEl.classList.add('active');
        // Pequeña pausa para que el browser pinte el estado inicial antes de animar
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const deg = nextOrient === 'v' ? 90 : -90;
            nextEl.style.transition = `transform 0.65s cubic-bezier(0.4, 0, 0.1, 1),
                                       opacity   0.15s ease`;
            nextEl.style.transform  = `rotate(${deg}deg)`;
          });
        });
      }
    }, 200);

    // 4. Al terminar el giro: quitar rotación, aplicar orientación correcta
    setTimeout(() => {
      if (nextEl) {
        nextEl.style.transition = 'none';
        nextEl.style.transform  = 'rotate(0deg)';
        nextEl.classList.remove('orient-' + prevOrient);
        nextEl.classList.add('orient-' + nextOrient);
        nextEl.style.pointerEvents = '';
        // Restaurar transición de opacidad normal para el futuro
        setTimeout(() => {
          nextEl.style.transition = '';
        }, 50);
      }
      ReaderState.animating = false;
      _showBubblesForPanel(idx);
      requestOrientationLock(nextOrient);
    }, 950);

  } else {
    // ── TRANSICIÓN NORMAL (sin cambio de orientación): fade ──
    if (prevEl) prevEl.classList.remove('active');
    if (nextEl) nextEl.classList.add('active');

    setTimeout(() => {
      ReaderState.animating = false;
      _showBubblesForPanel(idx);
      requestOrientationLock(nextOrient);
    }, 100);
  }
}

function _showBubblesForPanel(idx) {
  const panel = ReaderState.comic.panels[idx];
  const mode  = panel?.textMode || 'immediate';
  const panelEl = document.getElementById('rp_' + idx);
  if (!panelEl) return;
  const bubbles = panelEl.querySelectorAll('.reader-bubble');
  if (bubbles.length === 0) return;

  if (mode === 'sequential') {
    // Mostrar solo el primero, el resto aparecen con advance()
    bubbles[0].classList.add('visible');
    ReaderState.currentBubbleIdx = 0;
  } else {
    // Immediate: todos visibles de una vez, escalonados levemente
    bubbles.forEach((b, i) => {
      setTimeout(() => b.classList.add('visible'), i * 80);
    });
    ReaderState.currentBubbleIdx = bubbles.length - 1;
  }
}

function showNextBubble() {
  const panelEl = document.getElementById('rp_' + ReaderState.currentPanel);
  if (!panelEl) return false;
  const bubbles = panelEl.querySelectorAll('.reader-bubble');
  const next    = ReaderState.currentBubbleIdx + 1;
  if (next < bubbles.length) {
    bubbles[next].classList.add('visible');
    ReaderState.currentBubbleIdx = next;
    return true;
  }
  return false;
}

function advance() {
  const panel = ReaderState.comic.panels[ReaderState.currentPanel];
  const isSequential = (panel?.textMode || 'immediate') === 'sequential';

  if (isSequential) {
    // Modo secuencial: un bocadillo por tap
    if (showNextBubble()) return;
  }
  // Avanzar a la siguiente viñeta
  const next = ReaderState.currentPanel + 1;
  if (next >= ReaderState.comic.panels.length) {
    document.getElementById('endOverlay').classList.remove('hidden');
    return;
  }
  goToPanel(next);
}

function goBack() {
  if (ReaderState.currentPanel > 0) goToPanel(ReaderState.currentPanel - 1);
}

// ════════════════════════════════════════
// CONTROLES
// ════════════════════════════════════════
function setupControls() {
  // Botones PC
  document.getElementById('nextBtn')?.addEventListener('click', advance);
  document.getElementById('prevBtn')?.addEventListener('click', goBack);

  // Reiniciar
  document.getElementById('restartBtn')?.addEventListener('click', () => {
    document.getElementById('endOverlay').classList.add('hidden');
    goToPanel(0);
  });

  // Teclado (PC) — guardar referencia para cleanup en ReaderView_destroy
  ReaderState._keyHandler = (e) => {
    if (['ArrowRight','Space','Enter'].includes(e.code)) { e.preventDefault(); advance(); }
    if (e.code === 'ArrowLeft') goBack();
    if (e.code === 'Escape') Router.go('home');
  };
  document.addEventListener('keydown', ReaderState._keyHandler);

  // Swipe (móvil)
  const stage = document.getElementById('readerStage');
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;

  stage.addEventListener('touchstart', (e) => {
    touchStartX    = e.touches[0].clientX;
    touchStartY    = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    const dx   = e.changedTouches[0].clientX - touchStartX;
    const dy   = e.changedTouches[0].clientY - touchStartY;
    const dt   = Date.now() - touchStartTime;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // Tap rápido (< 300ms, < 15px movimiento) → avanzar
    if (dt < 300 && dist < 15) { advance(); return; }

    // Swipe horizontal
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) advance();  // swipe izquierda → avanzar
      else        goBack();   // swipe derecha → retroceder
    }
  }, { passive: true });
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
  // Eliminar el listener de teclado para evitar acumulación
  // (setupControls lo registra; cada visita al reader añadiría uno más sin esto)
  if (ReaderState._keyHandler) {
    document.removeEventListener('keydown', ReaderState._keyHandler);
    ReaderState._keyHandler = null;
  }
  // Liberar referencias al cómic para que el GC pueda limpiar
  ReaderState.comic = null;
}
