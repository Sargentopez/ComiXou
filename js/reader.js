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

document.addEventListener('DOMContentLoaded', () => {
  const params  = new URLSearchParams(window.location.search);
  const comicId = params.get('id');
  if (!comicId) { window.location.href = '../index.html'; return; }

  const comic = ComicStore.getById(comicId);
  if (!comic || !comic.panels || comic.panels.length === 0) {
    showToast('Cómic no encontrado');
    setTimeout(() => window.location.href = '../index.html', 1500);
    return;
  }

  ReaderState.comic = comic;
  document.getElementById('readerComicTitle').textContent = comic.title || 'Cómic';

  buildPanelElements();
  goToPanel(0);
  setupControls();
  showSwipeHint();
  I18n.applyAll();
});

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
    img.src = panel.dataUrl;
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
  if (!panel.texts) return;

  // Cabecera y pie: siempre visibles
  panel.texts.filter(t => t.type !== 'dialog').forEach(t => {
    const block = document.createElement('div');
    block.className = 'reader-text-block ' + (t.type === 'header' ? 'header' : 'footer');
    block.textContent = t.text;
    layer.appendChild(block);
  });

  // Bocadillos ordenados, aparecen secuencialmente
  const dialogs = panel.texts
    .filter(t => t.type === 'dialog')
    .sort((a,b) => (a.order||0) - (b.order||0));

  dialogs.forEach((d, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'reader-bubble';
    wrapper.style.left = d.x + '%';
    wrapper.style.top  = d.y + '%';
    wrapper.dataset.bubbleIdx = i;

    wrapper.innerHTML = `
      <div class="reader-bubble-inner">
        <span>${escHtml(d.text)}</span>
        <svg class="reader-tail tail-${d.tail||'bottom'}" viewBox="0 0 30 22" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 0 L15 22 L30 0 Z" fill="white" stroke="black" stroke-width="2.5" stroke-linejoin="round"/>
        </svg>
      </div>
    `;
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
      showNextBubble();
      requestOrientationLock(nextOrient);
    }, 950);

  } else {
    // ── TRANSICIÓN NORMAL (sin cambio de orientación): fade ──
    if (prevEl) prevEl.classList.remove('active');
    if (nextEl) nextEl.classList.add('active');

    setTimeout(() => {
      ReaderState.animating = false;
      showNextBubble();
      requestOrientationLock(nextOrient);
    }, 100);
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
  // Primero mostrar siguiente bocadillo de la viñeta actual
  if (showNextBubble()) return;
  // Luego pasar a la siguiente viñeta
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

  // Teclado (PC)
  document.addEventListener('keydown', (e) => {
    if (['ArrowRight','Space','Enter'].includes(e.code)) { e.preventDefault(); advance(); }
    if (e.code === 'ArrowLeft') goBack();
    if (e.code === 'Escape') window.location.href = '../index.html';
  });

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

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
