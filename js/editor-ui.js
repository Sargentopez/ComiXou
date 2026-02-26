/* ============================================================
   editor-ui.js — Menús, panel opciones, minimize, viewer, modal, toast
   ============================================================ */

function edCloseMenus(){
  document.querySelectorAll('.ed-dropdown').forEach(d=>{
    d.classList.remove('open');
    // Devolver al padre original si fue movido a body
    if(d._origParent && d.parentNode === document.body){
      d._origParent.appendChild(d);
    }
    d.style.removeProperty('position');
    d.style.removeProperty('top');
    d.style.removeProperty('left');
    d.style.removeProperty('right');
    d.style.removeProperty('z-index');
  });
  document.querySelectorAll('.ed-menu-btn').forEach(b=>b.classList.remove('open'));
  edMenuOpen=null;
}

function edToggleMenu(id){
  if(edMenuOpen===id){edCloseMenus();return;}
  edCloseMenus();
  if(['draw','eraser'].includes(edActiveTool)) edDeactivateDrawTool();
  const dd=$('dd-'+id);if(!dd)return;
  const btn=document.querySelector(`[data-menu="${id}"]`);
  if(!btn)return;

  // Mover el dropdown a body para escapar de cualquier overflow/stacking context
  dd._origParent = dd._origParent || dd.parentNode;
  document.body.appendChild(dd);

  // Posicionar con fixed relativo al botón
  const r = btn.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top  = r.bottom + 'px';
  dd.style.left = r.left   + 'px';
  dd.style.right = 'auto';
  dd.style.zIndex = '9999';

  dd.classList.add('open');
  btn.classList.add('open');
  edMenuOpen = id;
  if(id === 'nav') edUpdateNavPages();

  // Corrección de desbordamiento lateral (tras render)
  requestAnimationFrame(() => {
    const ddR = dd.getBoundingClientRect();
    if(ddR.right > window.innerWidth - 4){
      dd.style.left = Math.max(4, r.right - ddR.width) + 'px';
    }
  });
}

function edDeactivateDrawTool(){
  edActiveTool='select';
  edCanvas.className='';
  const cur=$('edBrushCursor');if(cur)cur.style.display='none';
  // Close the options panel if it was showing draw options
  const panel=$('edOptionsPanel');
  if(panel)panel.classList.remove('open');
  requestAnimationFrame(edFitCanvas);
}

/* ══════════════════════════════════════════
   PANEL DE OPCIONES
   ══════════════════════════════════════════ */
function edCloseOptionsPanel(){
  const panel=$('edOptionsPanel');
  if(panel){ panel.classList.remove('open'); panel.innerHTML=''; }
  edPanelUserClosed = true;   // usuario cerró → no reabrir al seleccionar
  requestAnimationFrame(edFitCanvas);
}
function edRenderOptionsPanel(mode){
  const panel=$('edOptionsPanel');if(!panel)return;

  // Sin objeto: cerrar panel
  if(!mode||(mode==='props'&&edSelectedIdx<0)){
    panel.classList.remove('open');panel.innerHTML='';
    requestAnimationFrame(edFitCanvas);return;
  }

  if(mode==='draw'){
    panel.innerHTML=`
      <div class="op-row" style="align-items:center">
        <span style="font-size:.7rem;font-weight:900;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em">Color</span>
        <input type="color" class="op-color" id="op-dcolor" value="${edDrawColor}">
        <span class="op-sep"></span>
        <span style="font-size:.7rem;font-weight:900;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em">Grosor</span>
        <input type="range" id="op-dsize" min="1" max="48" value="${edDrawSize}" style="width:90px;accent-color:var(--black)">
        <span id="op-dsizeval" style="font-size:.75rem;font-weight:900;color:var(--gray-600);min-width:26px">${edDrawSize}px</span>
        <button id="op-draw-ok" style="margin-left:auto;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 10px;font-weight:900;font-size:.8rem;cursor:pointer;flex-shrink:0">✓</button>
      </div>`;
    panel.classList.add('open');
    $('op-dcolor')?.addEventListener('input',e=>edDrawColor=e.target.value);
    $('op-dsize')?.addEventListener('input',e=>{edDrawSize=+e.target.value;const v=$('op-dsizeval');if(v)v.textContent=e.target.value+'px';});
    $('op-draw-ok')?.addEventListener('click',()=>{ edCloseOptionsPanel(); });
    requestAnimationFrame(edFitCanvas);return;
  }

  if(mode==='eraser'){
    panel.innerHTML=`
      <div class="op-row" style="align-items:center">
        <span style="font-size:.7rem;font-weight:900;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em">Tamaño</span>
        <input type="range" id="op-esize" min="4" max="80" value="${edEraserSize}" style="width:110px;accent-color:var(--black)">
        <span id="op-esizeval" style="font-size:.75rem;font-weight:900;color:var(--gray-600);min-width:26px">${edEraserSize}px</span>
        <button id="op-eraser-ok" style="margin-left:auto;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 10px;font-weight:900;font-size:.8rem;cursor:pointer;flex-shrink:0">✓</button>
      </div>`;
    panel.classList.add('open');
    $('op-esize')?.addEventListener('input',e=>{edEraserSize=+e.target.value;const v=$('op-esizeval');if(v)v.textContent=e.target.value+'px';});
    $('op-eraser-ok')?.addEventListener('click',()=>{ edCloseOptionsPanel(); });
    requestAnimationFrame(edFitCanvas);return;
  }

  if(mode==='props'){
    if(edSelectedIdx<0||edSelectedIdx>=edLayers.length){
      panel.classList.remove('open');panel.innerHTML='';requestAnimationFrame(edFitCanvas);return;
    }
    const la=edLayers[edSelectedIdx];
    let html='';

    if(la.type==='text'||la.type==='bubble'){
      html+=`
      <div class="op-prop-row"><span class="op-prop-label">Texto</span>
        <textarea id="pp-text" style="border-radius:8px;resize:vertical;min-height:40px;flex:1;border:2px solid var(--gray-300);padding:4px 8px;font-family:var(--font-body);font-size:.84rem;">${la.text.replace(/</g,'&lt;')}</textarea></div>
      <div class="op-prop-row"><span class="op-prop-label">Fuente</span>
        <select id="pp-font">
          <option value="Arial" ${la.fontFamily==='Arial'?'selected':''}>Arial</option>
          <option value="Bangers" ${la.fontFamily==='Bangers'?'selected':''}>Bangers</option>
          <option value="Comic Sans MS, cursive" ${la.fontFamily==='Comic Sans MS, cursive'?'selected':''}>Comic Sans</option>
          <option value="Verdana" ${la.fontFamily==='Verdana'?'selected':''}>Verdana</option>
        </select>
        <span class="op-prop-label" style="min-width:auto;margin-left:8px">Tamaño</span>
        <input type="number" id="pp-fs" value="${la.fontSize}" min="8" max="120">
        <input type="color" id="pp-color" value="${la.color}">
        <input type="color" id="pp-bg" value="${la.backgroundColor.startsWith('#')?la.backgroundColor:'#ffffff'}">
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Marco</span>
        <select id="pp-bw">
          ${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${la.borderWidth===n?'selected':''}>${n===0?'Sin borde':n+'px'}</option>`).join('')}
        </select>
        <input type="color" id="pp-bc" value="${la.borderColor}">
        <span class="op-prop-label" style="min-width:auto;margin-left:8px">Rot.</span>
        <input type="number" id="pp-rot" value="${la.rotation}" min="-180" max="180">°
      </div>`;
      if(la.type==='bubble'){
        html+=`
        <div class="op-prop-row"><span class="op-prop-label">Estilo</span>
          <select id="pp-style">
            <option value="conventional" ${la.style==='conventional'?'selected':''}>Convencional</option>
            <option value="lowvoice" ${la.style==='lowvoice'?'selected':''}>Voz baja</option>
            <option value="multiple" ${la.style==='multiple'?'selected':''}>Varias voces</option>
            <option value="thought" ${la.style==='thought'?'selected':''}>Pensamiento</option>
            <option value="radio" ${la.style==='radio'?'selected':''}>Radio/Tele</option>
            <option value="explosion" ${la.style==='explosion'?'selected':''}>Explosión</option>
          </select>
          <span id="pp-mcwrap" ${la.style!=='multiple'?'style="display:none"':''}>
            <span class="op-prop-label" style="min-width:auto">Voces</span>
            <input type="number" id="pp-mc" value="${la.multipleCount||3}" min="1" max="5">
          </span>
          <label style="display:flex;align-items:center;gap:4px;font-size:.75rem;font-weight:700">
            <input type="checkbox" id="pp-tail" ${la.tail?'checked':''}> Cola
          </label>
        </div>`;
      }
    } else if(la.type==='image'){
      html+=`
      <div class="op-prop-row"><span class="op-prop-label">Rotación</span>
        <input type="number" id="pp-rot" value="${la.rotation}" min="-180" max="180"> °
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Opacidad</span>
        <input type="range" id="pp-opacity" min="0" max="100" value="${Math.round((la.opacity??1)*100)}" style="flex:1;accent-color:var(--black)">
        <span id="pp-opacity-val" style="font-size:.75rem;font-weight:900;min-width:32px;text-align:right">${Math.round((la.opacity??1)*100)}%</span>
      </div>`;
    }
    html+=`<div class="op-row" style="margin-top:2px;justify-content:space-between">
      <button class="op-btn danger" id="pp-del"><span style="color:#e63030;font-weight:900">✕</span> Eliminar objeto</button>
      <button id="pp-ok" style="background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 12px;font-weight:900;font-size:.82rem;cursor:pointer">✓ OK</button>
    </div>`;

    panel.innerHTML=html;
    panel.classList.add('open');

    // Estilo → mostrar/ocultar voces
    $('pp-style')?.addEventListener('change',e=>{
      const w=$('pp-mcwrap');if(w)w.style.display=e.target.value==='multiple'?'':'none';
    });
    // Live update
    panel.querySelectorAll('input,select,textarea').forEach(inp=>{
      inp.addEventListener('input',e=>{
        if(edSelectedIdx<0)return;
        const la=edLayers[edSelectedIdx],id=e.target.id;
        if(id==='pp-text'){
          // Borrar placeholder al empezar a escribir
          if(la.text==='Escribe aquí' && e.target.value.length > 'Escribe aquí'.length){
            la.text = e.target.value.replace('Escribe aquí','');
            e.target.value = la.text;
          } else {
            la.text=e.target.value;
          }
          la.resizeToFitText(edCanvas);
        }
        else if(id==='pp-font'){la.fontFamily=e.target.value;la.resizeToFitText(edCanvas);}
        else if(id==='pp-fs'){la.fontSize=parseInt(e.target.value)||12;la.resizeToFitText(edCanvas);}
        else if(id==='pp-color')  la.color=e.target.value;
        else if(id==='pp-bg')     la.backgroundColor=e.target.value;
        else if(id==='pp-bc')     la.borderColor=e.target.value;
        else if(id==='pp-bw')     la.borderWidth=parseInt(e.target.value);
        else if(id==='pp-style')  {la.style=e.target.value;la.resizeToFitText(edCanvas);}
        else if(id==='pp-mc')     la.multipleCount=parseInt(e.target.value)||3;
        else if(id==='pp-tail')   la.tail=e.target.checked;
        else if(id==='pp-rot')    la.rotation=parseInt(e.target.value)||0;
        edRedraw();
      });
    });
    $('pp-del')?.addEventListener('click',edDeleteSelected);
    $('pp-ok')?.addEventListener('click',()=>{ edCloseOptionsPanel(); });
    $('pp-opacity')?.addEventListener('input',e=>{
      la.opacity = e.target.value/100;
      const v=$('pp-opacity-val'); if(v) v.textContent=e.target.value+'%';
      edRedraw();
    });
    // Si el texto es placeholder, seleccionar todo para sobreescribir directamente
    const ppText = $('pp-text');
    if(ppText && (edLayers[edSelectedIdx]?.text === 'Escribe aquí')){
      requestAnimationFrame(()=>{ ppText.select(); });
    }
    requestAnimationFrame(edFitCanvas);return;
  }

  panel.classList.remove('open');panel.innerHTML='';requestAnimationFrame(edFitCanvas);
}

/* ══════════════════════════════════════════
   MINIMIZAR / BOTÓN FLOTANTE
   ══════════════════════════════════════════ */
function edMinimize(){
  edMinimized=true;
  const menu=$('edMenuBar'),top=$('edTopbar');
  if(menu)menu.style.display='none';
  if(top)top.style.display='none';
  const btn=$('edFloatBtn');
  if(btn){
    btn.classList.add('visible');
    btn.style.left=edFloatX+'px';
    btn.style.top=edFloatY+'px';
  }
  edFitCanvas();
}
function edMaximize(){
  edMinimized=false;
  const menu=$('edMenuBar'),top=$('edTopbar');
  if(menu)menu.style.display='';
  if(top)top.style.display='';
  $('edFloatBtn')?.classList.remove('visible');
  edFitCanvas();
}
function edInitFloatDrag(){
  const btn=$('edFloatBtn');if(!btn)return;
  let dragging=false,startX=0,startY=0,startLeft=0,startTop=0;
  function onDown(e){
    dragging=true;
    const src=e.touches?e.touches[0]:e;
    startX=src.clientX;startY=src.clientY;
    startLeft=parseInt(btn.style.left)||edFloatX;
    startTop=parseInt(btn.style.top)||edFloatY;
    e.preventDefault();
  }
  function onMove(e){
    if(!dragging)return;
    const src=e.touches?e.touches[0]:e;
    const dx=src.clientX-startX,dy=src.clientY-startY;
    edFloatX=Math.max(0,Math.min(window.innerWidth-48,startLeft+dx));
    edFloatY=Math.max(0,Math.min(window.innerHeight-48,startTop+dy));
    btn.style.left=edFloatX+'px';btn.style.top=edFloatY+'px';
    e.preventDefault();
  }
  function onUp(e){
    if(!dragging)return;
    dragging=false;
    // Si apenas se movió, es un click
    const src=e.changedTouches?e.changedTouches[0]:e;
    if(Math.hypot(src.clientX-startX,src.clientY-startY)<8)edMaximize();
  }
  btn.addEventListener('pointerdown',onDown,{passive:false});
  window.addEventListener('pointermove',onMove,{passive:false});
  window.addEventListener('pointerup',onUp);
  btn.addEventListener('touchstart',onDown,{passive:false});
  window.addEventListener('touchmove',onMove,{passive:false});
  window.addEventListener('touchend',onUp);
}

/* ══════════════════════════════════════════
   GUARDAR / CARGAR
   ══════════════════════════════════════════ */

/* ══════════════════════════════════════════
   VISOR
   ══════════════════════════════════════════ */
let edViewerIdx=0;
function edUpdateCanvasFullscreen(){ edFitCanvas(); }

function edOpenViewer(){
  edHideGearIcon();  // ocultar gear al abrir visor
  edViewerIdx=edCurrentPage;
  edViewerTextStep=0;
  $('editorViewer')?.classList.add('open');
  edUpdateViewerSize();
  edUpdateViewer();
  edInitViewerTap();
  // Teclado PC
  if(_viewerKeyHandler) document.removeEventListener('keydown', _viewerKeyHandler);
  _viewerKeyHandler = _edViewerKey;
  document.addEventListener('keydown', _viewerKeyHandler);
}
function edUpdateViewerSize(){
  if(!edViewerCanvas) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  // Dimensiones internas del canvas (resolución de dibujo)
  edViewerCanvas.width  = edCanvas.width;
  edViewerCanvas.height = edCanvas.height;
  // Escala: llenar el viewport manteniendo proporción (contain, no cover)
  const scale = Math.min(vw / edCanvas.width, vh / edCanvas.height);
  const displayW = Math.round(edCanvas.width  * scale);
  const displayH = Math.round(edCanvas.height * scale);
  edViewerCanvas.style.width  = displayW + 'px';
  edViewerCanvas.style.height = displayH + 'px';
  // Centrar en el viewer
  edViewerCanvas.style.position = 'absolute';
  edViewerCanvas.style.left = Math.round((vw - displayW) / 2) + 'px';
  edViewerCanvas.style.top  = Math.round((vh - displayH) / 2) + 'px';
}

// Teclado en visor (PC)
let _viewerKeyHandler = null;
function _edViewerKey(e){
  const v = $('editorViewer');
  if(!v || !v.classList.contains('open')) return;
  if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){
    e.preventDefault();
    const page=edPages[edViewerIdx];
    const tl=page?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
    if(page?.textMode==='sequential' && edViewerTextStep < tl.length){
      edViewerTextStep++; edUpdateViewer();
    } else if(edViewerIdx < edPages.length-1){
      edViewerIdx++; edViewerTextStep=0; edUpdateViewer();
    }
  } else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
    e.preventDefault();
    const page=edPages[edViewerIdx];
    if(page?.textMode==='sequential' && edViewerTextStep > 0){
      edViewerTextStep--; edUpdateViewer();
    } else if(edViewerIdx > 0){
      edViewerIdx--;
      const pp=edPages[edViewerIdx];
      const ptl=pp?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
      edViewerTextStep = pp?.textMode==='sequential' ? ptl.length : 0;
      edUpdateViewer();
    }
  } else if(e.key === 'Escape'){
    e.preventDefault();
    edCloseViewer();
  }
}

// Tap en el visor → mostrar/ocultar controles
let _viewerTapBound = false, _viewerHideTimer;
function edShowViewerCtrls(){
  const ctrls = $('viewerControls');
  if(!ctrls) return;
  ctrls.classList.remove('hidden');
  clearTimeout(_viewerHideTimer);
  _viewerHideTimer = setTimeout(()=>ctrls.classList.add('hidden'), 3500);
}
function edInitViewerTap(){
  const viewer = $('editorViewer');
  if(!viewer) return;
  edShowViewerCtrls();
  if(!_viewerTapBound){
    _viewerTapBound = true;
    viewer.addEventListener('pointerup', e=>{
      if(!e.target.closest('.viewer-controls')) edShowViewerCtrls();
    });
  }
}
function edCloseViewer(){
  $('editorViewer')?.classList.remove('open');
  // Restaurar gear si hay objeto seleccionado
  if(edSelectedIdx >= 0){
    clearTimeout(window._edGearDelay);
    window._edGearDelay = setTimeout(() => {
      if(edSelectedIdx >= 0) edShowGearIcon(edSelectedIdx);
    }, 200);
  }
  if(_viewerKeyHandler){
    document.removeEventListener('keydown', _viewerKeyHandler);
    _viewerKeyHandler = null;
  }
}
function edUpdateViewer(){
  const page=edPages[edViewerIdx];if(!page||!edViewerCanvas)return;
  const ctx=edViewerCtx;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,edViewerCanvas.width,edViewerCanvas.height);

  // Imágenes siempre
  page.layers.filter(l=>l.type==='image').forEach(l=>l.draw(ctx,edViewerCanvas));

  // Dibujo libre
  if(page.drawData){
    const img=new Image();
    img.onload=()=>{
      ctx.drawImage(img,0,0);
      _edViewerDrawTexts(page, ctx);
    };
    img.src=page.drawData;
  } else {
    _edViewerDrawTexts(page, ctx);
  }

  // Contador
  const textLayers = page.layers.filter(l=>l.type==='text'||l.type==='bubble');
  const isSeq = page.textMode === 'sequential';
  const cnt=$('viewerCounter');
  if(cnt){
    if(isSeq && textLayers.length > 0){
      cnt.textContent=`${edViewerIdx+1}/${edPages.length} · 💬${edViewerTextStep}/${textLayers.length}`;
    } else {
      cnt.textContent=`${edViewerIdx+1} / ${edPages.length}`;
    }
  }
}

function _edViewerDrawTexts(page, ctx){
  const textLayers = page.layers.filter(l=>l.type==='text'||l.type==='bubble');
  const isSeq = page.textMode === 'sequential';
  const toShow = isSeq ? textLayers.slice(0, edViewerTextStep) : textLayers;
  toShow.forEach(l=>l.draw(ctx, edViewerCanvas));
}

/* ══════════════════════════════════════════
   MODAL DATOS PROYECTO
   ══════════════════════════════════════════ */
function edOpenProjectModal(){
  $('edMTitle').value=edProjectMeta.title;
  $('edMAuthor').value=edProjectMeta.author;
  $('edMGenre').value=edProjectMeta.genre;
  $('edMNavMode').value=edProjectMeta.navMode;
  $('edProjectModal')?.classList.add('open');
}
function edCloseProjectModal(){$('edProjectModal')?.classList.remove('open');}
function edSaveProjectModal(){
  edProjectMeta.title  =$('edMTitle').value.trim()||edProjectMeta.title;
  edProjectMeta.author =$('edMAuthor').value.trim();
  edProjectMeta.genre  =$('edMGenre').value.trim();
  edProjectMeta.navMode=$('edMNavMode').value;
  const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title||'Sin título';
  edCloseProjectModal();edSaveProject();
}

/* ══════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════ */
function edToast(msg,ms=2000){
  const t=$('edToast');if(!t)return;
  t.classList.remove('show');          // forzar reset antes de reanimar
  t.textContent=msg;
  // Pequeño frame para que el remove surta efecto antes del add
  requestAnimationFrame(()=>{
    t.classList.add('show');
    clearTimeout(t._t);
    t._t=setTimeout(()=>t.classList.remove('show'),ms);
  });
}

/* ══════════════════════════════════════════
   INIT
   ══════════════════════════════════════════ */
