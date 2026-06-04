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
   editor-layers.js — Panel de capas v4
   ============================================================ */

let _lyDragIdx  = null;
let _lyDragOver = null;
let _lyDragType = null; // 'text' | 'image'
let _lyUidCounter = 0;  // IDs únicos estables para animación FLIP
// UIDs de grupos de dibujo con sub-capas colapsadas (por defecto todos colapsados)
const _lyExpandedGroups = new Set(); // UIDs explícitamente expandidos; vacío = todos colapsados

/* ── Doble tap en miniatura ──
   lastTapTime/lastTapEl se comparten por closure en cada listener.
   Se detecta como dos pointerup sobre el mismo elemento en < 350 ms. */
function _lyBindThumbDoubleTap(thumb, realIdxGetter) {
  let _lastTime = 0;
  thumb.addEventListener('pointerup', e => {
    const now = Date.now();
    const isDbl = now - _lastTime < 350;
    _lastTime = now;
    if (!isDbl) return;
    // Evitar que el simple-tap handler cierre el overlay también
    e.stopImmediatePropagation();
    const idx = typeof realIdxGetter === 'function' ? realIdxGetter() : realIdxGetter;
    edSelectedIdx = idx;
    edRedraw();
    // Cerrar panel de capas (con animación) y, al terminar, abrir panel del objeto
    const ov = document.getElementById('edLayersOverlay');
    if (ov) {
      ov.classList.remove('open');
      setTimeout(() => {
        ov.remove();
        _lySetCanvasTouch(true);
        if (typeof edRedraw === 'function') edRedraw();
        if (typeof _edHandleDoubleTap === 'function') _edHandleDoubleTap(idx);
      }, 250);
    } else {
      if (typeof _edHandleDoubleTap === 'function') _edHandleDoubleTap(idx);
    }
  });
}

/* ──────────────────────────────────────────
   ABRIR / CERRAR
────────────────────────────────────────── */
/* Abre el panel de propiedades del objeto idx tras cerrar el overlay de capas */
function _lyOpenLayerPanel(idx) {
  const la = typeof edLayers !== 'undefined' ? edLayers[idx] : null;
  if (!la) return;
  edSelectedIdx = idx;
  edRedraw();
  if (la.type === 'draw' || la.type === 'stroke' || la.type === 'shape' || la.type === 'line') {
    // Para tipos editables: usar _edHandleDoubleTap para abrir el panel correcto
    if (typeof _edHandleDoubleTap === 'function') _edHandleDoubleTap(idx);
  } else {
    // image, text, bubble → panel de propiedades estándar
    if (typeof _edDrawLockUI === 'function') _edDrawLockUI();
    if (typeof _edPropsOverlayShow === 'function') _edPropsOverlayShow();
    if (typeof edRenderOptionsPanel === 'function') edRenderOptionsPanel('props');
  }
}

function edOpenLayers() {
  if (document.getElementById('edLayersOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'edLayersOverlay';
  overlay.className = 'ed-fulloverlay';
  overlay.innerHTML = `
    <div class="ed-fulloverlay-box">
      <div class="ed-fulloverlay-header">
        <h2 class="ed-fulloverlay-title">Capas</h2>
        <button class="ed-fulloverlay-close" id="edLayersClose">✕</button>
      </div>
      <div class="ed-layers-list" id="edLayersList"></div>
    </div>`;

  document.body.appendChild(overlay);
  _lyRender();
  overlay.querySelector('#edLayersClose').addEventListener('click', edCloseLayers);
  // Cerrar también al tocar el fondo oscuro (fuera del box)
  overlay.addEventListener('pointerdown', e => {
    if (e.target === overlay) edCloseLayers();
  });
  requestAnimationFrame(() => overlay.classList.add('open'));

  // Desactivar touch del canvas mientras el overlay está abierto
  _lySetCanvasTouch(false);
}

function edCloseLayers() {
  const ov = document.getElementById('edLayersOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  setTimeout(() => {
    ov.remove();
    _lySetCanvasTouch(true);
    // Refrescar la hoja vigente al cerrar el panel de capas
    if (typeof edRedraw === 'function') edRedraw();
    if (typeof edRenderOptionsPanel === 'function') edRenderOptionsPanel();
  }, 250);
}

// Activa/desactiva los listeners de touch del canvas
function _lySetCanvasTouch(enabled) {
  const shell = document.getElementById('editorShell');
  if (!shell) return;
  if (enabled) {
    shell.style.touchAction = '';          // restaurar
    shell.removeEventListener('touchstart', _lyBlockTouch, {passive:false});
    shell.removeEventListener('touchmove',  _lyBlockTouch, {passive:false});
  } else {
    shell.style.touchAction = 'none';      // bloquear scroll del compositor
    shell.addEventListener('touchstart', _lyBlockTouch, {passive:false});
    shell.addEventListener('touchmove',  _lyBlockTouch, {passive:false});
  }
}
function _lyBlockTouch(e) {
  // Permitir scroll dentro del overlay y toques en el modal de confirmación
  if (!e.target.closest('#edLayersOverlay') &&
      !e.target.closest('#edPagesOverlay') &&
      !e.target.closest('#edConfirmModal')) {
    e.preventDefault();
  }
}

/* ──────────────────────────────────────────
   RENDER PRINCIPAL
────────────────────────────────────────── */
function _lyRender() {
  const list = document.getElementById('edLayersList');
  if (!list) return;
  list.innerHTML = '';

  // Garantizar que cada DrawLayer tiene su FillLayer vinculado
  const _lrPage = edPages?.[edCurrentPage];
  if (_lrPage?.layers) {
    _lrPage.layers.filter(l=>l.type==='draw'||l.type==='stroke').forEach(dl => {
      if (dl._fillLayerId) return; // ya vinculado
      // Buscar FillLayer huérfano o crear uno nuevo
      let fl = _lrPage.layers.find(l => l.type==='fill' && !l._drawLayerId);
      if (!fl) {
        fl = new FillLayer();
        const dlIdx = _lrPage.layers.indexOf(dl);
        _lrPage.layers.splice(dlIdx, 0, fl);
        if (typeof edLayers !== 'undefined') edLayers = _lrPage.layers;
      }
      const uid = 'dl_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
      dl._uid = dl._uid || uid;
      dl._fillLayerId = dl._uid;
      fl._drawLayerId = dl._uid;
      fl._uid = 'fl_' + dl._uid;
    });
    // Reasignar edLayers para asegurar que refleja los cambios del splice
    if (typeof edLayers !== 'undefined') edLayers = _lrPage.layers;
  }

  const page     = edPages[edCurrentPage];
  if(!page.textMode) page.textMode = 'immediate'; // fallback para proyectos antiguos
  const isSeq    = page.textMode === 'sequential';
  const imgPairs = edLayers.map((l,i) => ({l,i})).filter(({l}) => l.type==='image'); // mantenido por compatibilidad
  const textObjs = edLayers.filter(l => l.type==='text' || l.type==='bubble');

  /* ══ SECCIÓN TEXTOS ══ */

  /* Título */
  const tTitle = document.createElement('div');
  tTitle.className = 'ed-ly-section-title';
  tTitle.textContent = 'Textos';
  list.appendChild(tTitle);

  /* Botones inmediatos / secuenciales — estilo barra de herramientas */
  const modeRow = document.createElement('div');
  modeRow.className = 'ed-ly-mode-row';

  const btnImm = document.createElement('button');
  btnImm.className = 'ed-menu-btn' + (!isSeq ? ' open' : '');
  btnImm.textContent = 'Inmediatos';
  btnImm.addEventListener('pointerup', () => {
    page.textMode = 'immediate';
    _lyRender();
  });

  const modeSep = document.createElement('div');
  modeSep.className = 'ed-menu-sep';

  const btnSeq = document.createElement('button');
  btnSeq.className = 'ed-menu-btn' + (isSeq ? ' open' : '');
  btnSeq.textContent = 'Secuenciales';
  btnSeq.addEventListener('pointerup', () => {
    page.textMode = 'sequential';
    _lyRender();
  });

  modeRow.appendChild(btnImm);
  modeRow.appendChild(modeSep);
  modeRow.appendChild(btnSeq);
  list.appendChild(modeRow);

  /* Hint de arrastre — gris/azul según modo */
  const dragHint = document.createElement('div');
  dragHint.className = 'ed-ly-drag-hint' + (isSeq ? ' active' : '');
  dragHint.textContent = 'Arrastra para establecer orden de aparición';
  list.appendChild(dragHint);

  /* Lista textos */
  if (textObjs.length === 0) {
    const e = document.createElement('p');
    e.className = 'ed-layer-sub-empty';
    e.textContent = 'Sin textos ni bocadillos';
    list.appendChild(e);
  } else {
    textObjs.forEach((la, vi) => {
      const realIdx = edLayers.indexOf(la);
      list.appendChild(_lyBuildTextRow(la, realIdx, vi, realIdx === edSelectedIdx, isSeq));
    });
  }

  /* ══ SEPARADOR ══ */
  const sep2 = document.createElement('div');
  sep2.className = 'ed-layer-sep';
  list.appendChild(sep2);

  /* ══ SECCIÓN IMÁGENES Y DIBUJOS (combinada) ══ */
  const iTitle = document.createElement('div');
  iTitle.className = 'ed-ly-section-title';
  iTitle.textContent = 'Imágenes y dibujos';
  list.appendChild(iTitle);

  const imgHint = document.createElement('div');
  imgHint.className = 'ed-ly-drag-hint active';
  imgHint.textContent = 'Arrastra para ordenar visualización';
  list.appendChild(imgHint);

  // Combinar imágenes y dibujos (stroke/draw) en una sola lista
  const visualPairs = edLayers
    .map((l,i)=>({l,i}))
    .filter(({l})=>l.type==='image'||l.type==='gif'||l.type==='stroke'||l.type==='draw'||l.type==='shape'||l.type==='line'||l.type==='fill');
  // pencil y watercolor se muestran como sub-filas, no como items principales

  if (visualPairs.length === 0) {
    const e = document.createElement('p');
    e.className = 'ed-layer-sub-empty';
    e.textContent = 'Sin imágenes ni dibujos';
    list.appendChild(e);
  } else {
    // El primero del array edLayers aparece el último en la lista (más abajo visualmente)
    [...visualPairs].reverse().forEach(({l, i}) => {
      if (l.type === 'fill' || l.type === 'pencil' || l.type === 'watercolor') return; // sub-filas
      const item = _lyBuildVisualItem(l, i, i === edSelectedIdx);
      list.appendChild(item);
      // Sub-filas para capas vinculadas: fill, watercolor, pencil
      if ((l.type === 'draw' || l.type === 'stroke')) {
        const _lyUid = l._uid || l._fillLayerId;
        if (_lyUid) {
          // Solo mostrar sub-filas si está en _lyExpandedGroups (colapsado por defecto)
          if (_lyExpandedGroups.has(_lyUid)) {
            const _lyFlPair = edLayers.find(la => la.type==='fill'       && la._drawLayerId===_lyUid);
            const _lyPencil = edLayers.find(la => la.type==='pencil'     && la._drawLayerId===_lyUid);
            const _lyWc     = edLayers.find(la => la.type==='watercolor' && la._drawLayerId===_lyUid);
            // Sub-fila de la capa de tinta (solo su propio canvas, no el compuesto)
            list.appendChild(_lyBuildGroupSubRow(l, i, l.type==='stroke' ? `<img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIgogICAgIHdpZHRoPSIyNiIgaGVpZ2h0PSIzNyIgdmlld0JveD0iMCAwIDI2IDM3Ij4KICA8aW1hZ2UgaHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFCb0FBQUFsQ0FZQUFBQmNadm0yQUFBRTgwbEVRVlI0QWF4V1dVeWNWUlQrQnNvQWhXbHA2V0pwbFM2MENJbFJrWFJRRm1zRUVWc0kwbENEdExROHVDUStOYUg2SUdtTnFZa21HdU9MVGRDWTBJWEVFTnVVS3EwRWJVcHRCWWFsaUZxMk1vYTlRR0RDdmhUd08zZVlLV1htQjJiU3lmbk9PZis1NTl4dnpyMzNYenpnM2krSFpYT3V3RjJpR0pKZ2VLZ2ZrK1A5cUNvNWlwKytnUU95VWlSTDRZdzdSSDRzVlVRNlRFUHZFNGllLzY0eTVDZ2x0KzB4dDRpRUpEQXBJUUoraGlmUTMzbURYZlhhWjdRNU5mOENQZjNxNmpwMXZUc2RDUkVPSFh5RjlaeE1vNXVyTjlXd3FPOUZ1VTBVRTJzaktwWjVIa0h2QUNBZE1kaElGQkJ3bFNpSVJiRUJhNENROFAyWW5ocUJwYStlb1VmbGlpeVdOWFRlYXVBeTBSOHM5QXplOFN5TVJpUDAzZ2FrSHdjeWNvRGpud05mY0pGK3VBZ1Vsd0U2SFVZQm5DV1V1TnFSV3FmMmRqUE01aVo0ZTNzUmVzek1lcUt0RzZoa2M3L2NVUE5pYmc2bDlOb0lKYTRTN1pHcWs2ZU80WDV2RWNZbmZrUDJrU3k4azUyTkN3V244SEZ1bGd3TDdsR2xFblp4aFdnWHF4SUlaR1c5TGdaM2FxMS9PREhwR1dSa3ZJcUtjcDVwTllLVFZ2TlF1MEtVSm1XSmlYc1JFT0F2TGt6bHJjcStGQnVDMHRJcUJRYXFDSFhTYU8zaUN0RitxVG95MzgzZzRCaHFhOXJ3UW1Rd05tNDA0THU4S3pJc3NCOEF1YkJocFVSUHN1QmxBbWxwY1dKUThhZHNBeEFUdHdlM2J0V2pzRkNkYVRNSDh3a0hXU25SUWFrOGZQZzErUGpveFlXcHdvenRPellnTkd3THpwMzlWY1dvcEpzaFdnZFpLWkhhbjlRM3JkMDAzTzFHZDVkRmRXTXlOU0F2cjBnbUZnS24zY2pnU29qa3BNV3VYNy9Hdm15VnRrTVFFNEtDQ3lVeWowQklaT25FZDhCU1JNOHpXLzZxbW1sZ1lBZ2V1amhFR2Q5RFMyc2JJaUszb2E2dUJmbjUxK1FGeUZUSXNvbDFDaTBpNlVLT1ViTFhxbFd6MnpadHd0RUVDZkh1cjd5TDA2ZlA0TjMzUDBIeWdZOWdzWXpvT0hNQkljZWF4cms0STlyR1ZPbGk2d0dqRWVkemNqeUtjbk1SWURBZ0pUb2EyN2RzZ2JlWEYxT0FqbzQrWmFtc1I1Q09samdqZWxHU1U2S2k4R2xtSm5ZSEJlRm1Rd042TEJiNGVudkRHQmFHMU5oWXZNSHhEV3ZYU3FwQUoyb3BPQ09LbDRMZ3padkZvR3RnQU9WTlRjcGZxQXlyVjJQWDFxMjIwSE0yUjhzNkkxSVB6blgrL3FxbXZMa1pzN096eWwrc0F0Znd4V1FOeXNHeGVocmFHZEZHeWZYejhSRUR5Nmk4VnBUcm9LUXJUdzgxaGJRbWNNaXhCVlNXN1dMZTdoWnI4UFVWZzlISlNXVzFWT0REZlhwS0swZmlpNG5DR2RRVGtJNm1aMll3dGd5UjVNNkRyNzU1ejRsWlRCUW1PZjdzeGsrdlg3WWJ5OGdJQm9lR1psaHpuK2dpTkdVeFVZaGs3ZzBOUlZCZ0lNWW1KdVJTRTMrYnpXRFhua3c0UjB3Um1yS1FhQjJ6amhGNGU5OCsrUENtTk4zVHZnOU52TGM2Kyt3M3JCQkpxU1lXRXVVdzYrbXMrSGhFN055Snl5WVRHam83R1hLVU95MHRhTzJ5cjlRaFp2eEZMQ2syb2tobW5URDQrczVsc2hzdGtvbXBLZnpENVdwc3MzNHJzRVpJQ21tWEZSdVJkT1AxWVhxNjduWmpvOU5PbXRyYlVWcGREZG1YK1ZsWFRDTDVRdlFCbmJlaXc4UG5KaDg4c0pOTTArOGRISVFzVTNGNU9XcjVoQmdkSDJjcWZxYVNGVmhSSjh4VklrUmZpOWR0c2VoK0xDdkQ3elUxdUVSN2tiaGVXd3RacHVHeE1Va1I1RklsRTlXRVN5SkU2cGt2bTl2YzBZRStpd1ZUN0lhenlKR3FvUDJTa0k5QmVjUjhSdDh0RWFKcnJQeVdrSDJTYndONUVzdlRjaE5qVWNRSjRqSmhQMmIwWFJZaFNtS1Y3Tk5YdEplSU9tS1llS3p5UHdBQUFQLy9VN1ZvU1FBQUFBWkpSRUZVQXdDUWZJOWFZV3dua0FBQUFBQkpSVTVFcmtKZ2dnPT0iIHg9IjAiIHk9IjAiIHdpZHRoPSIyNiIgaGVpZ2h0PSIzNyIvPgo8L3N2Zz4=" width="12" height="17" style="image-rendering:pixelated;vertical-align:middle"/> Tinta` : `<img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIgogICAgIHdpZHRoPSIyNiIgaGVpZ2h0PSIzNyIgdmlld0JveD0iMCAwIDI2IDM3Ij4KICA8aW1hZ2UgaHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFCb0FBQUFsQ0FZQUFBQmNadm0yQUFBRTgwbEVRVlI0QWF4V1dVeWNWUlQrQnNvQWhXbHA2V0pwbFM2MENJbFJrWFJRRm1zRUVWc0kwbENEdExROHVDUStOYUg2SUdtTnFZa21HdU9MVGRDWTBJWEVFTnVVS3EwRWJVcHRCWWFsaUZxMk1vYTlRR0RDdmhUd08zZVlLV1htQjJiU3lmbk9PZis1NTl4dnpyMzNYenpnM2krSFpYT3V3RjJpR0pKZ2VLZ2ZrK1A5cUNvNWlwKytnUU95VWlSTDRZdzdSSDRzVlVRNlRFUHZFNGllLzY0eTVDZ2x0KzB4dDRpRUpEQXBJUUoraGlmUTMzbURYZlhhWjdRNU5mOENQZjNxNmpwMXZUc2RDUkVPSFh5RjlaeE1vNXVyTjlXd3FPOUZ1VTBVRTJzaktwWjVIa0h2QUNBZE1kaElGQkJ3bFNpSVJiRUJhNENROFAyWW5ocUJwYStlb1VmbGlpeVdOWFRlYXVBeTBSOHM5QXplOFN5TVJpUDAzZ2FrSHdjeWNvRGpud05mY0pGK3VBZ1Vsd0U2SFVZQm5DV1V1TnFSV3FmMmRqUE01aVo0ZTNzUmVzek1lcUt0RzZoa2M3L2NVUE5pYmc2bDlOb0lKYTRTN1pHcWs2ZU80WDV2RWNZbmZrUDJrU3k4azUyTkN3V244SEZ1bGd3TDdsR2xFblp4aFdnWHF4SUlaR1c5TGdaM2FxMS9PREhwR1dSa3ZJcUtjcDVwTllLVFZ2TlF1MEtVSm1XSmlYc1JFT0F2TGt6bHJjcStGQnVDMHRJcUJRYXFDSFhTYU8zaUN0RitxVG95MzgzZzRCaHFhOXJ3UW1Rd05tNDA0THU4S3pJc3NCOEF1YkJocFVSUHN1QmxBbWxwY1dKUThhZHNBeEFUdHdlM2J0V2pzRkNkYVRNSDh3a0hXU25SUWFrOGZQZzErUGpveFlXcHdvenRPellnTkd3THpwMzlWY1dvcEpzaFdnZFpLWkhhbjlRM3JkMDAzTzFHZDVkRmRXTXlOU0F2cjBnbUZnS24zY2pnU29qa3BNV3VYNy9Hdm15VnRrTVFFNEtDQ3lVeWowQklaT25FZDhCU1JNOHpXLzZxbW1sZ1lBZ2V1amhFR2Q5RFMyc2JJaUszb2E2dUJmbjUxK1FGeUZUSXNvbDFDaTBpNlVLT1ViTFhxbFd6MnpadHd0RUVDZkh1cjd5TDA2ZlA0TjMzUDBIeWdZOWdzWXpvT0hNQkljZWF4cms0STlyR1ZPbGk2d0dqRWVkemNqeUtjbk1SWURBZ0pUb2EyN2RzZ2JlWEYxT0FqbzQrWmFtc1I1Q09samdqZWxHU1U2S2k4R2xtSm5ZSEJlRm1Rd042TEJiNGVudkRHQmFHMU5oWXZNSHhEV3ZYU3FwQUoyb3BPQ09LbDRMZ3padkZvR3RnQU9WTlRjcGZxQXlyVjJQWDFxMjIwSE0yUjhzNkkxSVB6blgrL3FxbXZMa1pzN096eWwrc0F0Znd4V1FOeXNHeGVocmFHZEZHeWZYejhSRUR5Nmk4VnBUcm9LUXJUdzgxaGJRbWNNaXhCVlNXN1dMZTdoWnI4UFVWZzlISlNXVzFWT0REZlhwS0swZmlpNG5DR2RRVGtJNm1aMll3dGd5UjVNNkRyNzU1ejRsWlRCUW1PZjdzeGsrdlg3WWJ5OGdJQm9lR1psaHpuK2dpTkdVeFVZaGs3ZzBOUlZCZ0lNWW1KdVJTRTMrYnpXRFhua3c0UjB3Um1yS1FhQjJ6amhGNGU5OCsrUENtTk4zVHZnOU52TGM2Kyt3M3JCQkpxU1lXRXVVdzYrbXMrSGhFN055Snl5WVRHam83R1hLVU95MHRhTzJ5cjlRaFp2eEZMQ2syb2tobW5URDQrczVsc2hzdGtvbXBLZnpENVdwc3MzNHJzRVpJQ21tWEZSdVJkT1AxWVhxNjduWmpvOU5PbXRyYlVWcGREZG1YK1ZsWFRDTDVRdlFCbmJlaXc4UG5KaDg4c0pOTTArOGRISVFzVTNGNU9XcjVoQmdkSDJjcWZxYVNGVmhSSjh4VklrUmZpOWR0c2VoK0xDdkQ3elUxdUVSN2tiaGVXd3RacHVHeE1Va1I1RklsRTlXRVN5SkU2cGt2bTl2YzBZRStpd1ZUN0lhenlKR3FvUDJTa0k5QmVjUjhSdDh0RWFKcnJQeVdrSDJTYndONUVzdlRjaE5qVWNRSjRqSmhQMmIwWFJZaFNtS1Y3Tk5YdEplSU9tS1llS3p5UHdBQUFQLy9VN1ZvU1FBQUFBWkpSRUZVQXdDUWZJOWFZV3dua0FBQUFBQkpSVTVFcmtKZ2dnPT0iIHg9IjAiIHk9IjAiIHdpZHRoPSIyNiIgaGVpZ2h0PSIzNyIvPgo8L3N2Zz4=" width="12" height="17" style="image-rendering:pixelated;vertical-align:middle"/> Tinta`, '#374151'));
            // Resto de sub-capas en orden visual (de arriba a abajo)
            if (_lyPencil) list.appendChild(_lyBuildGroupSubRow(_lyPencil, edLayers.indexOf(_lyPencil), '✏️ Lápiz',    '#c4b5fd'));
            if (_lyWc)     list.appendChild(_lyBuildGroupSubRow(_lyWc,     edLayers.indexOf(_lyWc),     '💧 Acuarela', '#6ee7b7'));
            if (_lyFlPair) list.appendChild(_lyBuildGroupSubRow(_lyFlPair, edLayers.indexOf(_lyFlPair), '🧪 Relleno',  '#93c5fd'));
          }
        }
      }
    });
  }
}


/* ── Botón ojo: ocultar/mostrar capa en el canvas (mismo icono que matriz de frames) ── */
function _lyBuildEyeBtn(la) {
  const btn = document.createElement('button');
  btn.className = 'ed-layer-del';
  btn.title = la.hidden ? 'Mostrar capa' : 'Ocultar capa';
  btn.style.opacity = la.hidden ? '0.4' : '';
  btn.textContent = '👁';
  btn.addEventListener('pointerup', e => {
    e.stopPropagation();
    la.hidden = !la.hidden;
    edRedraw();
    _lyRender();
  });
  return btn;
}

/* ──────────────────────────────────────────
   FILA DE TEXTO/BOCADILLO
────────────────────────────────────────── */

/* -- Sub-fila genérica para capas del grupo (fill/pencil/watercolor) en el panel de capas -- */
function _lyBuildGroupSubRow(la, realIdx, label, borderColor) {
  const row = document.createElement('div');
  row.className = 'ed-layer-item';
  row.style.cssText = 'margin-left:18px;border-style:dashed;border-color:'+borderColor+';opacity:'+(la.hidden?'0.45':'1')+';';
  row.dataset.realIdx = realIdx;

  // Miniatura
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb';
  thumb.width = 80; thumb.height = 60;
  const tctx = thumb.getContext('2d');
  tctx.fillStyle = '#f0f8ff';
  tctx.fillRect(0, 0, 80, 60);
  if (la._canvas && la._canvas.width > 0) {
    const pw = (typeof edPageW==='function')?edPageW():800;
    const ph = (typeof edPageH==='function')?edPageH():1100;
    const mx = (typeof edMarginX==='function')?edMarginX():0;
    const my = (typeof edMarginY==='function')?edMarginY():0;
    const scX = 80 / pw, scY = 60 / ph;
    tctx.save();
    tctx.setTransform(scX, 0, 0, scY, -mx * scX, -my * scY);
    if (typeof la.draw === 'function') la.draw(tctx);
    tctx.restore();
  }
  tctx.strokeStyle = borderColor; tctx.lineWidth = 2;
  tctx.setLineDash([4,3]); tctx.strokeRect(1,1,78,58); tctx.setLineDash([]);
  row.appendChild(thumb);

  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  name.innerHTML = label;
  info.appendChild(name); row.appendChild(info);

  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';

  const eyeBtn = document.createElement('button');
  eyeBtn.className = 'ed-layer-del';
  eyeBtn.textContent = '👁';
  eyeBtn.style.opacity = la.hidden ? '0.4' : '';
  eyeBtn.title = la.hidden ? 'Mostrar' : 'Ocultar';
  eyeBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    la.hidden = !la.hidden;
    edRedraw(); _lyRender();
  });
  acts.appendChild(eyeBtn);

  const clrBtn = document.createElement('button');
  clrBtn.className = 'ed-layer-del';
  clrBtn.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  clrBtn.title = 'Eliminar esta sub-capa';
  clrBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm('¿Eliminar esta sub-capa?', () => {
      const _flIdx = edLayers.indexOf(la);
      if (_flIdx >= 0) edLayers.splice(_flIdx, 1);
      const _pair = edLayers.find(l => l._uid && (l._fillLayerId===la._drawLayerId ||
                                                    l._pencilLayerId===la._drawLayerId ||
                                                    l._watercolorLayerId===la._drawLayerId));
      if (_pair) {
        if (la.type==='fill')       delete _pair._fillLayerId;
        if (la.type==='pencil')     delete _pair._pencilLayerId;
        if (la.type==='watercolor') delete _pair._watercolorLayerId;
      }
      edPushHistory(); edRedraw(); _lyRender();
    });
  });
  acts.appendChild(clrBtn);
  row.appendChild(acts);
  return row;
}

/* -- Sub-fila del FillLayer en el panel de capas (alias por compatibilidad) -- */
function _lyBuildFillSubRow(la, realIdx) {
  return _lyBuildGroupSubRow(la, realIdx, '🧪 Relleno', '#93c5fd');
}

/* -- Sub-fila real (conservada por si se usa desde algún otro lugar) -- */
function _lyBuildFillSubRowOld(la, realIdx) {
  const row = document.createElement('div');
  row.className = 'ed-layer-item';
  row.style.cssText = 'margin-left:18px;border-style:dashed;border-color:#93c5fd;opacity:'+(la.hidden?'0.45':'1')+';';
  row.dataset.realIdx = realIdx;

  // Miniatura
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb';
  thumb.width = 80; thumb.height = 60;
  const tctx = thumb.getContext('2d');
  tctx.fillStyle = '#f0f8ff';
  tctx.fillRect(0, 0, 80, 60);
  if (la._canvas && la._canvas.width > 0) {
    const pw = (typeof edPageW==='function')?edPageW():800;
    const ph = (typeof edPageH==='function')?edPageH():1100;
    const mx = (typeof edMarginX==='function')?edMarginX():0;
    const my = (typeof edMarginY==='function')?edMarginY():0;
    // Usar draw() que maneja tanto canvas workspace como canvas local (bbox)
    // Escalar para que la página entera quepa en el thumb 80×60
    const scX = 80 / pw, scY = 60 / ph;
    tctx.save();
    // Transformar: mover origen para que la página empiece en (0,0) del thumb, escalada
    tctx.setTransform(scX, 0, 0, scY, -mx * scX, -my * scY);
    if (typeof la.draw === 'function') la.draw(tctx);
    tctx.restore();
  }
  tctx.strokeStyle = '#93c5fd'; tctx.lineWidth = 2;
  tctx.setLineDash([4,3]); tctx.strokeRect(1,1,78,58); tctx.setLineDash([]);
  row.appendChild(thumb);

  // Nombre
  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  name.textContent = '🧪 Relleno';
  info.appendChild(name); row.appendChild(info);

  // Acciones: ojo + limpiar
  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';

  // Ojo
  const eyeBtn = document.createElement('button');
  eyeBtn.className = 'ed-layer-del';
  eyeBtn.textContent = '👁';
  eyeBtn.style.opacity = la.hidden ? '0.4' : '';
  eyeBtn.title = la.hidden ? 'Mostrar relleno' : 'Ocultar relleno';
  eyeBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    la.hidden = !la.hidden;
    edRedraw(); _lyRender();
  });
  acts.appendChild(eyeBtn);

  // Eliminar relleno (igual que el ✕ del resto de capas)
  const clrBtn = document.createElement('button');
  clrBtn.className = 'ed-layer-del';
  clrBtn.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  clrBtn.title = 'Eliminar relleno';
  clrBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm('¿Eliminar el relleno?', () => {
      const _flIdx = edLayers.indexOf(la);
      if (_flIdx >= 0) edLayers.splice(_flIdx, 1);
      // Desconectar el vínculo en la capa de dibujo
      const _pair = edLayers.find(l => l._fillLayerId && l._fillLayerId === la._drawLayerId);
      if (_pair) { delete _pair._fillLayerId; delete _pair._uid; }
      edPushHistory(); edRedraw(); _lyRender();
    });
  });
  acts.appendChild(clrBtn);

  row.appendChild(acts);

  // Tap en la sub-fila de relleno: si la herramienta de dibujo está activa, ofrecer dibujar en ella
  row.addEventListener('pointerup', e => {
    if (e.target.closest('.ed-layer-actions')) return; // toques en botones: ya manejados
    const _isTool = typeof edActiveTool !== 'undefined' &&
                    ['draw','eraser'].includes(edActiveTool);
    const _panelDraw = typeof _edDrawLayerTarget !== 'undefined';
    if (!_isTool || !_panelDraw) return;

    // Encontrar el DrawLayer vinculado para saber el índice a seleccionar
    const _drawLa = (typeof edLayers !== 'undefined')
      ? edLayers.find(l => l._fillLayerId && l._fillLayerId === la._drawLayerId)
      : null;

    edConfirm('¿Quieres usar las herramientas de dibujo en la capa de relleno?', () => {
      // Seleccionar el DrawLayer vinculado en el editor
      if (_drawLa && typeof edSelectedIdx !== 'undefined') {
        edSelectedIdx = edLayers.indexOf(_drawLa);
      }
      // Activar capa de relleno como destino de dibujo
      if (typeof _edDrawLayerTarget !== 'undefined') _edDrawLayerTarget = 'fill';
      // Cerrar panel de capas y abrir panel de dibujo
      edCloseLayers();
      if (typeof edRenderOptionsPanel === 'function') {
        edRenderOptionsPanel(edActiveTool === 'eraser' ? 'eraser' : 'draw');
      }
    }, 'Sí');
  });

  return row;
}

function _lyBuildTextRow(la, realIdx, seqPos, selected, draggable) {
  const row = document.createElement('div');
  row.className = 'ed-layer-text-row' + (selected ? ' selected' : '') + (draggable ? ' draggable' : '');
  if (la.hidden) row.style.opacity = '0.45'; // capa oculta: item atenuado
  row.dataset.realIdx = realIdx;
  if (!la._uid) la._uid = ++_lyUidCounter;
  row.dataset.uid = la._uid;

  /* Número de secuencia (solo en modo secuencial) */
  if (draggable) {
    const badge = document.createElement('span');
    badge.className = 'ed-ly-seq-badge';
    badge.textContent = seqPos + 1;
    row.appendChild(badge);
  }

  /* Miniatura — es el handle de arrastre en modo secuencial */
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb-sm' + (draggable ? ' drag-handle' : '');
  thumb.width = 56; thumb.height = 42;
  _lyDrawThumb(thumb, la);
  thumb.title = draggable ? 'Arrastra para reordenar · toca para seleccionar' : 'Seleccionar';
  thumb.addEventListener('pointerup', e => {
    // Solo seleccionar si no hubo drag
    if (!row.classList.contains('was-dragged')) {
      const _idx = realIdx;
      const ov = document.getElementById('edLayersOverlay');
      if (ov) {
        ov.classList.remove('open');
        setTimeout(() => { ov.remove(); _lySetCanvasTouch(true); _lyOpenLayerPanel(_idx); }, 250);
      } else {
        _lyOpenLayerPanel(_idx);
      }
    }
    row.classList.remove('was-dragged');
  });
  _lyBindThumbDoubleTap(thumb, () => realIdx);
  row.appendChild(thumb);

  /* Nombre */
  const lbl = document.createElement('span');
  lbl.className = 'ed-layer-name';
  lbl.textContent = (la.type === 'bubble' ? '💬 ' : 'T ') + (la.text || '').substring(0, 22);
  row.appendChild(lbl);

  /* Flechas subir/bajar nivel */
  const textObjs = edLayers.filter(l => l.type==='text' || l.type==='bubble');
  const viIdx = textObjs.indexOf(la);
  const upBtn = document.createElement('button');
  upBtn.className = 'ed-layer-arrow';
  upBtn.title = 'Subir nivel';
  upBtn.textContent = '▲';
  upBtn.disabled = viIdx <= 0;
  upBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    const prevTxt = textObjs[viIdx - 1];
    const toIdx = edLayers.indexOf(prevTxt);
    if (toIdx >= 0) _lyReorderTexts(realIdx, toIdx);
  });
  const dnBtn = document.createElement('button');
  dnBtn.className = 'ed-layer-arrow';
  dnBtn.title = 'Bajar nivel';
  dnBtn.textContent = '▼';
  dnBtn.disabled = viIdx >= textObjs.length - 1;
  dnBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    const nextTxt = textObjs[viIdx + 1];
    const toIdx = edLayers.indexOf(nextTxt);
    if (toIdx >= 0) _lyReorderTexts(realIdx, toIdx);
  });
  /* Eliminar */
  const del = document.createElement('button');
  del.className = 'ed-layer-del';
  del.title = 'Eliminar';
  del.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  del.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm('¿Eliminar esta capa?', ()=>{
      // Eliminar FillLayer vinculado si existe
      if (la._fillLayerId) {
        const _flDV=edLayers.findIndex(l=>l.type==='fill'&&l._drawLayerId===la._fillLayerId);
        if(_flDV>=0){ edLayers.splice(_flDV,1); if(_flDV<realIdx) realIdx--; }
      }
      edLayers.splice(realIdx, 1);
      if (edSelectedIdx >= edLayers.length) edSelectedIdx = edLayers.length - 1;
      edPushHistory(); edRedraw(); _lyRender();
    });
  });
  // Agrupar controles en un div que nunca se comprime
  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';
  acts.appendChild(upBtn);
  acts.appendChild(dnBtn);
  acts.appendChild(_lyBuildEyeBtn(la));
  acts.appendChild(del);
  row.appendChild(acts);

  /* Drag — solo si modo secuencial, desde la miniatura */
  if (draggable) {
    _lyBindTextDrag(row, thumb, realIdx);
  }

  return row;
}

/* ──────────────────────────────────────────
   ITEM DE IMAGEN — drag desde miniatura
────────────────────────────────────────── */
/* ──────────────────────────────────────────
   ELEMENTO VISUAL (imagen O dibujo) — sección combinada
────────────────────────────────────────── */
function _lyBuildVisualItem(la, realIdx, selected) {
  const isDrawType = la.type === 'stroke' || la.type === 'draw';
  const isShapeType = la.type === 'shape' || la.type === 'line';
  const isGroup = false; // obsoleto
  const item = document.createElement('div');
  item.className = 'ed-layer-item' + (selected ? ' selected' : '');
  if (la.hidden) item.style.opacity = '0.45';
  item.dataset.realIdx = realIdx;
  if (!la._uid) la._uid = ++_lyUidCounter;
  item.dataset.uid = la._uid;

  /* Miniatura */
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb drag-handle';
  thumb.width = 80; thumb.height = 60;
  if (isDrawType) {
    _lyDrawStrokeThumb(thumb, la);
  } else if (isShapeType) {
    _lyDrawShapeThumb(thumb, la);
  } else if (isGroup) {
    _lyDrawGroupThumb(thumb, la);
  } else {
    _lyDrawThumb(thumb, la);
  }
  thumb.title = isDrawType ? 'Dibujo · toca para seleccionar' : isShapeType ? 'Objeto · toca para seleccionar' : 'Arrastra para reordenar · toca para seleccionar';
  thumb.addEventListener('pointerup', () => {
    if (!item.classList.contains('was-dragged')) {
      const _idx = realIdx;
      const ov = document.getElementById('edLayersOverlay');
      if (ov) {
        ov.classList.remove('open');
        setTimeout(() => { ov.remove(); _lySetCanvasTouch(true); _lyOpenLayerPanel(_idx); }, 250);
      } else {
        _lyOpenLayerPanel(_idx);
      }
    }
    item.classList.remove('was-dragged');
  });
  _lyBindThumbDoubleTap(thumb, () => realIdx);
  item.appendChild(thumb);

  /* Info */
  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  const _grpTag = la.groupId ? ' 🔗' : '';
  if (isDrawType) {
    name.textContent = (la.type === 'draw' ? '✏️ Dibujando…' : '✏️ Dibujo') + _grpTag;
  } else if (la.type === 'shape') {
    name.textContent = (la.shape === 'ellipse' ? '◯ Elipse' : '▭ Rectángulo') + _grpTag;
  } else if (la.type === 'line') {
    name.textContent = (la.closed ? '⬠ Polígono' : '╱ Recta') + _grpTag;
  } else if (la.type === 'gif') {
    name.textContent = '🎬 GIF ' + (realIdx + 1) + _grpTag;
  } else {
    const _isApng = la.animKey || la._pngFramesKey || la._apngIdbKey || la._apngSrc || (la._pngFrames && la._pngFrames.length);
    name.textContent = (_isApng ? '📽️ APNG ' : 'Imagen ') + (realIdx + 1) + _grpTag;
  }
  info.appendChild(name);
  item.appendChild(info);

  /* Flechas subir/bajar — dentro de los elementos visuales */
  const visualAll = edLayers.map((l,i)=>({l,i}))
    .filter(({l})=>l.type==='image'||l.type==='gif'||l.type==='stroke'||l.type==='draw'||l.type==='shape'||l.type==='line');
  const posInList = visualAll.findIndex(({i})=>i===realIdx);

  const upBtn = document.createElement('button');
  upBtn.className = 'ed-layer-arrow';
  upBtn.title = 'Subir nivel';
  upBtn.textContent = '▲';
  // Con groupId: deshabilitar si todos los vecinos superiores son del mismo grupo
  const _grpAbove = la.groupId
    ? visualAll.slice(posInList + 1).every(({l: _l}) => _l.groupId === la.groupId)
    : false;
  upBtn.disabled = posInList >= visualAll.length - 1 || _grpAbove;
  upBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    if (la.groupId) {
      _lyReorderGroup(la.groupId, +1);
    } else {
      const next = visualAll[posInList + 1];
      if (next) {
        // Si la capa destino tiene un FillLayer por debajo, insertar sobre el fill
        const _nextFl = next.l._fillLayerId
          ? edLayers.findIndex(l=>l.type==='fill'&&l._drawLayerId===next.l._fillLayerId)
          : -1;
        const _dest = _nextFl >= 0 ? Math.max(next.i, _nextFl) + 1 : next.i + 1;
        _lyReorderLayers(realIdx, _dest);
      }
    }
  });

  const dnBtn = document.createElement('button');
  dnBtn.className = 'ed-layer-arrow';
  dnBtn.title = 'Bajar nivel';
  dnBtn.textContent = '▼';
  const _grpBelow = la.groupId
    ? visualAll.slice(0, posInList).every(({l: _l}) => _l.groupId === la.groupId)
    : false;
  dnBtn.disabled = posInList <= 0 || _grpBelow;
  dnBtn.addEventListener('pointerup', e => {
    e.stopPropagation();
    if (la.groupId) {
      _lyReorderGroup(la.groupId, -1);
    } else {
      const prev = visualAll[posInList - 1];
      if (prev) {
        // Insertar debajo del pair fill+stroke anterior completo
        const _prevFl = prev.l._fillLayerId
          ? edLayers.findIndex(l=>l.type==='fill'&&l._drawLayerId===prev.l._fillLayerId)
          : -1;
        const _dest = _prevFl >= 0 ? Math.min(prev.i, _prevFl) : prev.i;
        _lyReorderLayers(realIdx, _dest);
      }
    }
  });

  /* Eliminar */
  const del = document.createElement('button');
  del.className = 'ed-layer-del';
  del.title = 'Eliminar';
  del.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  del.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm('¿Eliminar esta capa?', ()=>{
      // T3: si la capa es draw/stroke/shape/line con panel abierto, limpiar UI primero
      const _delLa = edLayers[realIdx];
      const _delType = _delLa ? _delLa.type : '';
      if (_delType === 'draw' || _delType === 'stroke' || _delType === 'shape' || _delType === 'line') {
        // Cerrar panel de herramienta y desbloquear UI antes del splice
        const _panel = document.getElementById('edOptionsPanel');
        if (_panel) { _panel.classList.remove('open'); delete _panel.dataset.mode; }
        if (typeof edDrawBarHide === 'function') edDrawBarHide();
        if (typeof edShapeBarHide === 'function') edShapeBarHide();
        if (typeof _edDrawUnlockUI === 'function') _edDrawUnlockUI();
        if (typeof _edShapeClearHistory === 'function') _edShapeClearHistory();
        if (window._edLineLayer) window._edLineLayer = null;
        if (window._edLineFusionId) window._edLineFusionId = null;
        edActiveTool = 'select';
        if (typeof edCanvas !== 'undefined') edCanvas.className = '';
        const _cur = document.getElementById('edBrushCursor');
        if (_cur) _cur.style.display = 'none';
        if (edSelectedIdx === realIdx) edSelectedIdx = -1;
      }
      // Para draw/stroke: eliminar también fill, pencil y watercolor vinculados
      if (isDrawType) {
        const _delUid = la._uid || la._fillLayerId;
        if (_delUid) {
          // Eliminar de mayor a menor índice para no desplazar los índices
          const _subIdxs = edLayers
            .map((l, idx) => ({ l, idx }))
            .filter(({ l }) =>
              (l.type==='fill'||l.type==='pencil'||l.type==='watercolor') && l._drawLayerId===_delUid)
            .map(({ idx }) => idx)
            .sort((a, b) => b - a); // mayor a menor
          _subIdxs.forEach(idx => { edLayers.splice(idx, 1); });
        }
      }
      // Actualizar realIdx por si los splices anteriores lo desplazaron
      const _newRealIdx = edLayers.indexOf(la);
      if (_newRealIdx >= 0) edLayers.splice(_newRealIdx, 1);
      if (edSelectedIdx >= edLayers.length) edSelectedIdx = edLayers.length - 1;
      edPushHistory(); edRedraw(); _lyRender();
    });
  });

  const acts = document.createElement('div');
  acts.className = 'ed-layer-actions';
  acts.appendChild(upBtn);
  acts.appendChild(dnBtn);
  // Ojo: para draw/stroke afecta a TODAS las sub-capas vinculadas
  if (isDrawType) {
    const _eyeGroupUid = la._uid || la._fillLayerId;
    const _eyeBtn = document.createElement('button');
    _eyeBtn.className = 'ed-layer-del';
    _eyeBtn.textContent = '👁';
    const _eyeAllHidden = () => {
      if (la.hidden) return true;
      if (!_eyeGroupUid) return false;
      const _subs = edLayers.filter(l =>
        (l.type==='fill'||l.type==='pencil'||l.type==='watercolor') && l._drawLayerId===_eyeGroupUid);
      return _subs.length > 0 && _subs.every(l => l.hidden);
    };
    _eyeBtn.title  = _eyeAllHidden() ? 'Mostrar grupo' : 'Ocultar grupo';
    _eyeBtn.style.opacity = _eyeAllHidden() ? '0.4' : '';
    _eyeBtn.addEventListener('pointerup', e => {
      e.stopPropagation();
      const _newHidden = !la.hidden;
      la.hidden = _newHidden;
      if (_eyeGroupUid) {
        edLayers.forEach(l => {
          if ((l.type==='fill'||l.type==='pencil'||l.type==='watercolor') && l._drawLayerId===_eyeGroupUid)
            l.hidden = _newHidden;
        });
      }
      edRedraw(); _lyRender();
    });
    acts.appendChild(_eyeBtn);
  } else {
    acts.appendChild(_lyBuildEyeBtn(la));
  }
  // Botón colapsar/expandir sub-capas solo para stroke/draw con capas vinculadas
  if (isDrawType) {
    const _colUid = la._uid || la._fillLayerId;
    const _hasSubs = _colUid && (typeof edLayers !== 'undefined') && edLayers.some(l =>
      (l.type==='fill'||l.type==='pencil'||l.type==='watercolor') && l._drawLayerId===_colUid);
    if (_hasSubs) {
      const _colBtn = document.createElement('button');
      _colBtn.className = 'ed-layer-del';
      _colBtn.title = _lyExpandedGroups.has(_colUid) ? 'Colapsar sub-capas' : 'Mostrar sub-capas';
      _colBtn.textContent = _lyExpandedGroups.has(_colUid) ? '▼' : '▶';
      _colBtn.style.cssText = 'font-size:0.7rem;padding:2px 5px;opacity:0.7;';
      _colBtn.addEventListener('pointerup', e => {
        e.stopPropagation();
        if (_lyExpandedGroups.has(_colUid)) _lyExpandedGroups.delete(_colUid);
        else _lyExpandedGroups.add(_colUid);
        _lyRender();
      });
      acts.appendChild(_colBtn);
    }
  }
  acts.appendChild(del);
  item.appendChild(acts);

  /* Drag solo para imágenes (stroke/draw se reordenan con flechas) */
  if (!isDrawType) _lyBindImgDrag(item, thumb, realIdx);
  return item;
}

function _lyDrawStrokeThumb(canvas, la) {
  const ctx = canvas.getContext('2d');
  const tw = canvas.width, th = canvas.height;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, tw, th);
  if (la.type === 'stroke' && la._canvas && la._canvas.width > 0) {
    const pw = edPageW() || ED_PAGE_W, ph = edPageH() || ED_PAGE_H;
    const mx = edMarginX ? edMarginX() : 0, my = edMarginY ? edMarginY() : 0;
    // Escalar página completa al thumb
    const scX = tw / pw, scY = th / ph;
    ctx.save();
    ctx.setTransform(scX, 0, 0, scY, -mx * scX, -my * scY);
    // Primero el fill vinculado (si existe)
    const _thumbUid = la._uid || la._fillLayerId;
    const _flS      = (typeof edLayers !== 'undefined' && _thumbUid) ? edLayers.find(f => f && f.type==='fill'       && f._drawLayerId===_thumbUid) : null;
    const _wcS      = (typeof edLayers !== 'undefined' && _thumbUid) ? edLayers.find(f => f && f.type==='watercolor' && f._drawLayerId===_thumbUid) : null;
    const _pencilS  = (typeof edLayers !== 'undefined' && _thumbUid) ? edLayers.find(f => f && f.type==='pencil'     && f._drawLayerId===_thumbUid) : null;
    if (_flS     && typeof _flS.draw     === 'function') _flS.draw(ctx);
    if (_wcS     && typeof _wcS.draw     === 'function') _wcS.draw(ctx);
    if (_pencilS && typeof _pencilS.draw === 'function') _pencilS.draw(ctx);
    // Luego el stroke encima
    if (typeof la.draw === 'function') la.draw(ctx);
    ctx.restore();
  } else if (la.type === 'draw' && la._canvas) {
    const pw = edPageW() || ED_PAGE_W, ph = edPageH() || ED_PAGE_H;
    const mx = edMarginX ? edMarginX() : 0, my = edMarginY ? edMarginY() : 0;
    const scX = tw / pw, scY = th / ph;
    ctx.save();
    ctx.setTransform(scX, 0, 0, scY, -mx * scX, -my * scY);
    // Capas vinculadas al DrawLayer (en orden de render)
    const _thumbDlUid = la._uid || la._fillLayerId;
    const _flD     = (typeof edLayers !== 'undefined' && _thumbDlUid) ? edLayers.find(f => f && f.type==='fill'       && f._drawLayerId===_thumbDlUid) : null;
    const _wcD     = (typeof edLayers !== 'undefined' && _thumbDlUid) ? edLayers.find(f => f && f.type==='watercolor' && f._drawLayerId===_thumbDlUid) : null;
    const _pencilD = (typeof edLayers !== 'undefined' && _thumbDlUid) ? edLayers.find(f => f && f.type==='pencil'     && f._drawLayerId===_thumbDlUid) : null;
    if (_flD     && typeof _flD.draw     === 'function') _flD.draw(ctx);
    if (_wcD     && typeof _wcD.draw     === 'function') _wcD.draw(ctx);
    if (_pencilD && typeof _pencilD.draw === 'function') _pencilD.draw(ctx);
    la.draw(ctx);
    ctx.restore();
  } else {
    ctx.fillStyle = '#ddd';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✏️', tw/2, th/2);
  }
}

function _lyBuildImgItem(la, realIdx, selected) {
  const item = document.createElement('div');
  item.className = 'ed-layer-item' + (selected ? ' selected' : '');
  item.dataset.realIdx = realIdx;
  if (!la._uid) la._uid = ++_lyUidCounter;
  item.dataset.uid = la._uid;

  /* Miniatura — handle de arrastre */
  const thumb = document.createElement('canvas');
  thumb.className = 'ed-layer-thumb drag-handle';
  thumb.width = 80; thumb.height = 60;
  _lyDrawThumb(thumb, la);
  thumb.title = 'Arrastra para reordenar · toca para seleccionar';
  thumb.addEventListener('pointerup', () => {
    if (!item.classList.contains('was-dragged')) {
      edSelectedIdx = realIdx;
      edRedraw();
      edCloseLayers();
    }
    item.classList.remove('was-dragged');
  });
  item.appendChild(thumb);

  /* Info + opacidad (solo desktop) */
  const info = document.createElement('div');
  info.className = 'ed-layer-info';
  const name = document.createElement('span');
  name.className = 'ed-layer-name';
  const _isApngPanel = la.animKey || la._pngFramesKey || la._apngIdbKey || la._apngSrc || (la._pngFrames && la._pngFrames.length);
  name.textContent = (_isApngPanel ? '📽️ APNG ' : 'Imagen ') + (realIdx + 1);
  info.appendChild(name);

  // Opacidad ahora en el panel de propiedades de imagen (⚙)
  item.appendChild(info);

  /* Flechas subir/bajar nivel */
  const imgPairsAll = edLayers.map((l,i)=>({l,i})).filter(({l})=>l.type==='image');
  const imgPosInList = imgPairsAll.findIndex(({i})=>i===realIdx);
  // La lista se muestra invertida (primero = encima), así ▲ = índice más alto en edLayers
  const upBtnI = document.createElement('button');
  upBtnI.className = 'ed-layer-arrow';
  upBtnI.title = 'Subir nivel';
  upBtnI.textContent = '▲';
  upBtnI.disabled = imgPosInList >= imgPairsAll.length - 1; // ya es el último (más arriba visualmente)
  upBtnI.addEventListener('pointerup', e => {
    e.stopPropagation();
    // Subir = mover hacia índice mayor en edLayers (más arriba en la pila)
    const nextImg = imgPairsAll[imgPosInList + 1];
    if (nextImg) _lyReorderImages(realIdx, nextImg.i + 1);
  });
  const dnBtnI = document.createElement('button');
  dnBtnI.className = 'ed-layer-arrow';
  dnBtnI.title = 'Bajar nivel';
  dnBtnI.textContent = '▼';
  dnBtnI.disabled = imgPosInList <= 0; // ya es el primero (más abajo visualmente)
  dnBtnI.addEventListener('pointerup', e => {
    e.stopPropagation();
    const prevImg = imgPairsAll[imgPosInList - 1];
    if (prevImg) _lyReorderImages(realIdx, prevImg.i);
  });
  /* Eliminar */
  const del = document.createElement('button');
  del.className = 'ed-layer-del';
  del.title = 'Eliminar';
  del.innerHTML = '<span style="color:#e63030;font-weight:900;font-size:1rem">✕</span>';
  del.addEventListener('pointerup', e => {
    e.stopPropagation();
    edConfirm('¿Eliminar esta capa?', ()=>{
      edLayers.splice(realIdx, 1);
      if (edSelectedIdx >= edLayers.length) edSelectedIdx = edLayers.length - 1;
      edPushHistory(); edRedraw(); _lyRender();
    });
  });
  const actsI = document.createElement('div');
  actsI.className = 'ed-layer-actions';
  actsI.appendChild(upBtnI);
  actsI.appendChild(dnBtnI);
  actsI.appendChild(del);
  item.appendChild(actsI);

  /* Drag desde miniatura */
  _lyBindImgDrag(item, thumb, realIdx);
  return item;
}

/* ──────────────────────────────────────────
   DRAG TEXTOS (solo en modo secuencial)
────────────────────────────────────────── */
function _lyBindTextDrag(row, handle, realIdx) {
  let startY, startIdx, active = false;

  function onMove(y) {
    if (!active) return;
    const rows = [...document.querySelectorAll('.ed-layer-text-row.draggable')];
    document.querySelectorAll('.ed-layer-text-row').forEach(r => r.classList.remove('drag-over'));
    const target = rows.find(r => {
      if (r === row) return false;
      const rect = r.getBoundingClientRect();
      return y >= rect.top && y <= rect.bottom;
    });
    if (target) {
      target.classList.add('drag-over');
      _lyDragOver = parseInt(target.dataset.realIdx);
    } else {
      _lyDragOver = null;
    }
  }

  function end() {
    if (!active) return;
    active = false;
    row.classList.remove('dragging');
    document.querySelectorAll('.ed-layer-text-row').forEach(r => r.classList.remove('drag-over'));
    if (_lyDragOver !== null && _lyDragOver !== startIdx) {
      row.classList.add('was-dragged');
      _lyReorderTexts(startIdx, _lyDragOver);
    }
    _lyDragIdx = _lyDragOver = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) { onMove(e.clientY); }
  function onPointerUp() { end(); }

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    startIdx = realIdx;
    startY = e.clientY;
    active = false;
    _lyDragType = 'text';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Activar drag solo si hay movimiento real (>4px)
    function checkStart(ev) {
      if (Math.abs(ev.clientY - startY) > 4) {
        active = true;
        row.classList.add('dragging');
        window.removeEventListener('pointermove', checkStart);
      }
    }
    window.addEventListener('pointermove', checkStart);
  });
}

/* ──────────────────────────────────────────
   DRAG IMÁGENES desde miniatura
────────────────────────────────────────── */
function _lyBindImgDrag(item, handle, realIdx) {
  let startY, startIdx, active = false;

  function onMove(y) {
    if (!active) return;
    const items = [...document.querySelectorAll('.ed-layer-item')];
    document.querySelectorAll('.ed-layer-item').forEach(i => i.classList.remove('drag-over'));
    const target = items.find(i => {
      if (i === item) return false;
      const rect = i.getBoundingClientRect();
      return y >= rect.top && y <= rect.bottom;
    });
    if (target) {
      target.classList.add('drag-over');
      _lyDragOver = parseInt(target.dataset.realIdx);
    } else {
      _lyDragOver = null;
    }
  }

  function end() {
    if (!active) return;
    active = false;
    item.classList.remove('dragging');
    document.querySelectorAll('.ed-layer-item').forEach(i => i.classList.remove('drag-over'));
    if (_lyDragOver !== null && _lyDragOver !== startIdx) {
      // Si la capa dragged tiene groupId, mover el bloque entero
      const _draggedLayer = typeof edLayers !== 'undefined' ? edLayers[startIdx] : null;
      const _dragGid = _draggedLayer ? _draggedLayer.groupId : null;
      // Si el destino es miembro del mismo grupo → cancelar
      const _destLayer = typeof edLayers !== 'undefined' ? edLayers[_lyDragOver] : null;
      const _destGid = _destLayer ? _destLayer.groupId : null;
      if (_dragGid && _destGid && _dragGid === _destGid) {
        // Mismo grupo: no hacer nada
      } else if (_dragGid) {
        // Determinar dirección: destino por encima o por debajo del bloque
        const _memberIdxs = [];
        for (let _i = 0; _i < edLayers.length; _i++) {
          if (edLayers[_i] && edLayers[_i].groupId === _dragGid) _memberIdxs.push(_i);
        }
        const _maxMember = _memberIdxs[_memberIdxs.length - 1];
        const _minMember = _memberIdxs[0];
        const _dir = _lyDragOver > _maxMember ? +1 : (_lyDragOver < _minMember ? -1 : 0);
        if (_dir !== 0) {
          item.classList.add('was-dragged');
          _lyReorderGroup(_dragGid, _dir);
        }
      } else {
        item.classList.add('was-dragged');
        _lyReorderImages(startIdx, _lyDragOver);
      }
    }
    _lyDragIdx = _lyDragOver = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) { onMove(e.clientY); }
  function onPointerUp() { end(); }

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    startIdx = realIdx;
    startY = e.clientY;
    active = false;

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    function checkStart(ev) {
      if (Math.abs(ev.clientY - startY) > 4) {
        active = true;
        item.classList.add('dragging');
        window.removeEventListener('pointermove', checkStart);
      }
    }
    window.addEventListener('pointermove', checkStart);
  });
}

/* ──────────────────────────────────────────
   REORDENAR
────────────────────────────────────────── */
/* ──────────────────────────────────────────
   ANIMACIÓN DE REORDENACIÓN — FLIP completo
   Anima TODOS los items que cambien de posición
────────────────────────────────────────── */
function _lyAnimatedReorder(layerObj, doReorder) {
  const list = document.getElementById('edLayersList');
  if (!list) { doReorder(); _lyRender(); return; }

  // Asegurar UID en el objeto principal
  if (!layerObj._uid) layerObj._uid = ++_lyUidCounter;
  const movedUid = layerObj._uid;

  // ── FIRST: capturar posición de TODOS los items animables ──
  const snapBefore = new Map();
  list.querySelectorAll('[data-uid]').forEach(el => {
    snapBefore.set(el.dataset.uid, el.getBoundingClientRect().top);
  });

  if (snapBefore.size === 0) { doReorder(); _lyRender(); return; }

  // ── Ejecutar reorder + reconstruir lista ──
  doReorder();
  _lyRender();

  // ── LAST: capturar posiciones nuevas y calcular deltas ──
  const toAnimate = [];
  list.querySelectorAll('[data-uid]').forEach(el => {
    const uid = el.dataset.uid;
    if (!snapBefore.has(uid)) return;
    const delta = snapBefore.get(uid) - el.getBoundingClientRect().top;
    if (Math.abs(delta) < 2) return;
    toAnimate.push({ el, delta, isMoved: uid === String(movedUid) });
  });

  if (toAnimate.length === 0) return;

  // ── INVERT: colocar todos en posición anterior sin transición ──
  toAnimate.forEach(({ el, delta, isMoved }) => {
    el.style.transition = 'none';
    el.style.transform  = 'translateY(' + delta + 'px)';
    el.style.opacity    = isMoved ? '0.5' : '0.72';
  });

  // ── PLAY: doble rAF para forzar paint antes de animar ──
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toAnimate.forEach(({ el, isMoved }) => {
        const dur = isMoved ? 360 : 280;
        el.style.transition = 'transform ' + dur + 'ms cubic-bezier(.4,0,.2,1), opacity ' + dur + 'ms ease';
        el.style.transform  = 'translateY(0)';
        el.style.opacity    = '1';
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
          el.style.transform  = '';
          el.style.opacity    = '';
        }, { once: true });
      });
    });
  });
}

/* Mueve todo el bloque de un grupo una posición arriba (+1) o abajo (-1) en la lista visual.
   "Arriba" en la lista visual = índice mayor en edLayers (se dibuja encima).
   dir: +1 = subir un nivel visual, -1 = bajar un nivel visual. */
function _lyReorderGroup(groupId, dir) {
  // Índices de miembros del grupo, ordenados ascendente
  const memberIdxs = [];
  for (let i = 0; i < edLayers.length; i++) {
    if (edLayers[i] && edLayers[i].groupId === groupId) memberIdxs.push(i);
  }
  if (memberIdxs.length < 1) return;

  // Todos los índices visuales (imagen/dibujo/shape/line)
  const visualAll = edLayers.map((l, i) => ({ l, i }))
    .filter(({ l }) => l.type === 'image' || l.type === 'gif' || l.type === 'stroke' ||
                       l.type === 'draw' || l.type === 'shape' || l.type === 'line');

  const minIdx = memberIdxs[0];
  const maxIdx = memberIdxs[memberIdxs.length - 1];

  if (dir === +1) {
    // Subir: el vecino inmediatamente por encima del bloque (índice mayor en visualAll)
    const above = visualAll.find(({ i }) => i > maxIdx && !memberIdxs.includes(i));
    if (!above) return; // ya está en la cima
    const movedLayer = edLayers[memberIdxs[0]];
    _lyAnimatedReorder(movedLayer, () => {
      // Extraer miembros (de mayor a menor para no desplazar índices)
      const extracted = [];
      for (let k = memberIdxs.length - 1; k >= 0; k--) {
        extracted.unshift(edLayers.splice(memberIdxs[k], 1)[0]);
      }
      // Posición de inserción: justo después del vecino superior (que ahora está desplazado)
      // Calcular nuevo índice del vecino superior después de los splices
      let insertAt = above.i - memberIdxs.filter(mi => mi < above.i).length;
      insertAt++; // insertar después de él
      for (let k = extracted.length - 1; k >= 0; k--) {
        edLayers.splice(insertAt, 0, extracted[k]);
      }
      if (memberIdxs.includes(edSelectedIdx)) {
        const delta = insertAt - minIdx;
        edSelectedIdx += delta;
      }
      edPushHistory(); edRedraw();
    });
  } else {
    // Bajar: el vecino inmediatamente por debajo del bloque (índice menor en visualAll)
    const belowArr = visualAll.filter(({ i }) => i < minIdx && !memberIdxs.includes(i));
    if (!belowArr.length) return; // ya está en el fondo
    const below = belowArr[belowArr.length - 1];
    const movedLayer = edLayers[memberIdxs[0]];
    _lyAnimatedReorder(movedLayer, () => {
      // Extraer miembros de mayor a menor
      const extracted = [];
      for (let k = memberIdxs.length - 1; k >= 0; k--) {
        extracted.unshift(edLayers.splice(memberIdxs[k], 1)[0]);
      }
      // El vecino inferior no se ve afectado por los splices (está debajo de todos los miembros)
      const insertAt = below.i; // insertar en su posición (empujándolo hacia abajo)
      for (let k = extracted.length - 1; k >= 0; k--) {
        edLayers.splice(insertAt, 0, extracted[k]);
      }
      if (memberIdxs.includes(edSelectedIdx)) {
        const delta = insertAt - minIdx;
        edSelectedIdx += delta;
      }
      edPushHistory(); edRedraw();
    });
  }
}

function _lyReorderTexts(fromRealIdx, toRealIdx) {
  const textIdxs = edLayers.map((l,i) => ({l,i}))
    .filter(({l}) => l.type==='text' || l.type==='bubble')
    .map(({i}) => i);
  const fromPos = textIdxs.indexOf(fromRealIdx);
  const toPos   = textIdxs.indexOf(toRealIdx);
  if (fromPos < 0 || toPos < 0) return;

  const _movedLayerTxt = edLayers[fromRealIdx];
  _lyAnimatedReorder(_movedLayerTxt, () => {
    const moved = edLayers.splice(fromRealIdx, 1)[0];
    const adjustedTo = fromRealIdx < toRealIdx ? toRealIdx : toRealIdx;
    edLayers.splice(adjustedTo, 0, moved);
    if (edSelectedIdx === fromRealIdx) edSelectedIdx = adjustedTo;
    edPushHistory(); edRedraw();
  });
}

function _lyReorderLayers(fromRealIdx, toRealIdx) {
  const _moved = edLayers[fromRealIdx];
  _lyAnimatedReorder(_moved, () => {
    // Recoger todas las capas del grupo vinculadas (fill, pencil, watercolor)
    const _uid = _moved._uid || _moved._fillLayerId;
    const _groupLayers = _uid ? edLayers.filter(l =>
      l !== _moved &&
      (l.type==='fill' || l.type==='pencil' || l.type==='watercolor') &&
      l._drawLayerId === _uid
    ) : [];
    // Quitar la capa principal + grupo (de mayor a menor índice para no desplazar)
    const _removeIdxs = [fromRealIdx, ..._groupLayers.map(l=>edLayers.indexOf(l))]
      .filter(i=>i>=0).sort((a,b)=>b-a);
    _removeIdxs.forEach(i => edLayers.splice(i, 1));
    // Calcular destino ajustado
    const _removed = _removeIdxs.length;
    const _toAdj = Math.max(0, toRealIdx - (fromRealIdx < toRealIdx ? _removed : 0));
    // Reinsertar en orden: fill → watercolor → pencil → stroke
    const _fl     = _groupLayers.find(l=>l.type==='fill');
    const _wc     = _groupLayers.find(l=>l.type==='watercolor');
    const _pencil = _groupLayers.find(l=>l.type==='pencil');
    const _toInsert = [_fl, _wc, _pencil, _moved].filter(Boolean);
    edLayers.splice(_toAdj, 0, ..._toInsert);
    if (edSelectedIdx === fromRealIdx) edSelectedIdx = _toAdj + _toInsert.length - 1;
    edPushHistory(); edRedraw();
  });
}

function _lyReorderImages(fromRealIdx, toRealIdx) {
  const _movedLayerImg = edLayers[fromRealIdx];
  _lyAnimatedReorder(_movedLayerImg, () => {
    const moved = edLayers.splice(fromRealIdx, 1)[0];
    const to = fromRealIdx < toRealIdx ? toRealIdx - 1 : toRealIdx;
    edLayers.splice(to, 0, moved);
    if (edSelectedIdx === fromRealIdx) edSelectedIdx = to;
    edPushHistory(); edRedraw();
  });
}

/* ──────────────────────────────────────────
   OPACIDAD (solo desktop)
────────────────────────────────────────── */
function _lyMakeOpRow(initVal, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'ed-layer-op-row';
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = 0; slider.max = 100;
  slider.value = Math.round(initVal * 100);
  slider.className = 'ed-layer-slider';
  const val = document.createElement('span');
  val.className = 'ed-layer-op-val';
  val.textContent = slider.value + '%';
  slider.addEventListener('input', () => {
    val.textContent = slider.value + '%';
    onChange(slider.value / 100);
  });
  wrap.appendChild(slider);
  wrap.appendChild(val);
  return wrap;
}

/* ──────────────────────────────────────────
   MINIATURA
────────────────────────────────────────── */
function _lyDrawThumb(canvas, la) {
  const ctx = canvas.getContext('2d');
  const sw = canvas.width, sh = canvas.height;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, sw, sh);
  ctx.save();
  ctx.globalAlpha = la.opacity ?? 1;
  if (la.type === 'gif' && la._oc && la._ready) {
    ctx.drawImage(la._oc, (la.x-la.width/2)*sw, (la.y-la.height/2)*sh, la.width*sw, la.height*sh);
  } else if (la.type === 'image' && la.img && la.img.complete && la.img.naturalWidth > 0) {
    ctx.drawImage(la.img, (la.x-la.width/2)*sw, (la.y-la.height/2)*sh, la.width*sw, la.height*sh);
  } else if (la.type === 'text' || la.type === 'bubble') {
    const x=(la.x-la.width/2)*sw, y=(la.y-la.height/2)*sh, w=la.width*sw, h=la.height*sh;
    ctx.fillStyle = la.backgroundColor || '#fff';
    ctx.fillRect(x,y,w,h);
    ctx.strokeStyle = la.borderColor || '#bbb';
    ctx.lineWidth = 1;
    ctx.strokeRect(x,y,w,h);
    ctx.fillStyle = la.color || '#222';
    ctx.font = Math.max(7, Math.round(sw*0.13)) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((la.text||'').substring(0,14), sw/2, sh/2);
  }
  ctx.restore();
}

/* ──────────────────────────────────────────
   MINIATURA SHAPE / LINE
────────────────────────────────────────── */
function _lyDrawGroupThumb(canvas, la) {
  const ctx = canvas.getContext('2d');
  const sw = canvas.width, sh = canvas.height;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, sw, sh);
  if (la._cache && la._cache.width > 0) {
    ctx.save();
    ctx.globalAlpha = la.opacity ?? 1;
    const pad = 4;
    const scale = Math.min((sw-pad*2)/la._cache.width, (sh-pad*2)/la._cache.height);
    const dx = pad + (sw-pad*2 - la._cache.width*scale)/2;
    const dy = pad + (sh-pad*2 - la._cache.height*scale)/2;
    ctx.drawImage(la._cache, dx, dy, la._cache.width*scale, la._cache.height*scale);
    ctx.restore();
  } else {
    ctx.fillStyle = '#bbb';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⊞', sw/2, sh/2);
  }
}

function _lyDrawShapeThumb(canvas, la) {
  const ctx = canvas.getContext('2d');
  const sw = canvas.width, sh = canvas.height;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, sw, sh);
  ctx.save();
  ctx.globalAlpha = la.opacity ?? 1;
  const pad = 6;

  // Usar el render real (la.draw) en un canvas workspace auxiliar para ambos tipos,
  // igual que con LineLayer — garantiza fidelidad exacta con cornerRadii y V/C
  const ED_W = typeof ED_CANVAS_W !== 'undefined' ? ED_CANVAS_W : 1800;
  const ED_H = typeof ED_CANVAS_H !== 'undefined' ? ED_CANVAS_H : 2340;
  const pw = typeof edPageW === 'function' ? edPageW() : 360;
  const ph = typeof edPageH === 'function' ? edPageH() : 780;
  const mx = typeof edMarginX === 'function' ? edMarginX() : (ED_W-pw)/2;
  const my = typeof edMarginY === 'function' ? edMarginY() : (ED_H-ph)/2;
  const aux = document.createElement('canvas');
  aux.width = ED_W; aux.height = ED_H;
  la.draw(aux.getContext('2d'));
  // Bbox del objeto en coords workspace
  const ocx = mx + la.x*pw, ocy = my + la.y*ph;
  const ohw = la.width*pw/2+4, ohh = la.height*ph/2+4;
  const bx=Math.max(0,ocx-ohw), by=Math.max(0,ocy-ohh);
  const bw=Math.min(ED_W-bx,ohw*2), bh=Math.min(ED_H-by,ohh*2);
  if(bw>0 && bh>0){
    const scale=Math.min((sw-pad*2)/bw,(sh-pad*2)/bh);
    const dx=pad+(sw-pad*2-bw*scale)/2, dy=pad+(sh-pad*2-bh*scale)/2;
    ctx.drawImage(aux,bx,by,bw,bh,dx,dy,bw*scale,bh*scale);
  }
  ctx.restore();
}
