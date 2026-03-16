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
  ReaderState.totalPanels = comic.panels.length + 1; // +1 para créditos
  ReaderState.creditsShown = false;

  // Garantizar que todos los paneles tienen texts generados desde editorData.
  // El visor del editor usa page.layers directamente; el reproductor usa panel.texts.
  // Si la obra es antigua o texts está vacío, lo regeneramos aquí.
  _ensurePanelTexts(comic);

  // DIAGNÓSTICO TEMPORAL
  const _p0 = comic.panels[0];
  alert('Panel 0: ' + (_p0.texts?.length||0) + ' texts\n' +
    (_p0.texts||[]).map((t,i)=>i+': type='+t.type+' "'+String(t.text).slice(0,20)+'"').join('\n'));

  document.getElementById('readerComicTitle').textContent = comic.title || I18n.t('noWork');

  buildPanelElements();
  goToPanel(0);
  setupControls();
  showSwipeHint();
  I18n.applyAll();
}

// Regenera panel.texts desde editorData.pages[i].layers si está vacío o ausente.
// Replica exactamente la lógica de edSaveProject en editor.js.
function _ensurePanelTexts(comic) {
  const edPages = comic.editorData?.pages;
  if (!edPages) return; // sin editorData no podemos hacer nada

  comic.panels.forEach((panel, i) => {
    // Si ya tiene texts con contenido, no tocar
    if (panel.texts && panel.texts.length > 0) return;

    const page = edPages[i];
    if (!page?.layers) return;

    const texts = [];
    let seqOrder = 0;
    page.layers.forEach(l => {
      const rawText = (l.type === 'text' || l.type === 'bubble') ? l.text : null;
      if (!rawText || rawText === 'Escribe aquí') return;

      const xPct = Math.round((l.x - (l.width||0)/2)  * 100 * 10) / 10;
      const yPct = Math.round((l.y - (l.height||0)/2) * 100 * 10) / 10;
      const wPct = Math.round((l.width||0.3)  * 100 * 10) / 10;
      const hPct = Math.round((l.height||0.15) * 100 * 10) / 10;

      if (l.type === 'bubble') {
        texts.push({
          type:        'bubble',
          text:        rawText,
          x: xPct, y: yPct, w: wPct, h: hPct,
          style:       l.style       || 'conventional',
          order:       seqOrder++,
          fontSize:    l.fontSize    || 30,
          fontFamily:  l.fontFamily  || 'Patrick Hand',
          fontBold:    l.fontBold    || false,
          fontItalic:  l.fontItalic  || false,
          color:       l.color       || '#000000',
          bg:          l.backgroundColor || '#ffffff',
          border:      l.borderWidth ?? 2,
          borderColor: l.borderColor || '#000000',
        });
      } else if (l.type === 'text') {
        texts.push({
          type:        'text',
          text:        rawText,
          x: xPct, y: yPct, w: wPct, h: hPct,
          order:       seqOrder++,
          fontSize:    l.fontSize    || 30,
          fontFamily:  l.fontFamily  || 'Patrick Hand',
          fontBold:    l.fontBold    || false,
          fontItalic:  l.fontItalic  || false,
          color:       l.color       || '#000000',
          bg:          l.backgroundColor || '#ffffff',
          border:      l.borderWidth ?? 0,
          borderColor: l.borderColor || '#000000',
        });
      }
    });
    panel.texts    = texts;
    panel.textMode = page.textMode || 'sequential';
  });
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
      if      (t.style === 'explosion') { inner.style.borderRadius = '4px'; inner.style.transform = 'rotate(-1deg)'; }
      else if (t.style === 'thought')   { inner.style.borderRadius = '50%'; }
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
// NAVEGACIÓN
// ════════════════════════════════════════
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

  // DIAGNÓSTICO
  alert('Panel ' + idx + ': ' + bubbles.length + ' .reader-bubble encontrados\ntextMode=' + mode);

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
  ReaderState.creditsShown = false;
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

    ctx.font      = `900 ${logoFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#f5c400';
    ctx.textAlign = 'center';
    ctx.fillText('ComiXow', rightCX, rightStartY);

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
    ctx.globalAlpha = 1;
  }
}

// ════════════════════════════════════════
// CONTROLES
// ════════════════════════════════════════
function setupControls() {
  // Botones PC — solo responden a click, no a touch (evita doble disparo con el stage)
  document.getElementById('nextBtn')?.addEventListener('click', (e) => {
    if (e.pointerType === 'touch') return; // el stage ya lo maneja
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

  // Teclado (PC) — guardar referencia para cleanup en ReaderView_destroy
  ReaderState._keyHandler = (e) => {
    if (['ArrowRight','Space','Enter'].includes(e.code)) { e.preventDefault(); advance(); }
    if (e.code === 'ArrowLeft') goBack();
    if (e.code === 'Escape') Router.go('home');
  };
  document.addEventListener('keydown', ReaderState._keyHandler);

  // Swipe (móvil) — AbortController para evitar acumulación en cada apertura del reproductor
  if (ReaderState._stageAC) ReaderState._stageAC.abort();
  ReaderState._stageAC = new AbortController();
  const sig = { signal: ReaderState._stageAC.signal, passive: true };

  const stage = document.getElementById('readerStage');
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;

  stage.addEventListener('touchstart', (e) => {
    touchStartX    = e.touches[0].clientX;
    touchStartY    = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, sig);

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
