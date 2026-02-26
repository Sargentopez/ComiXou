/* ============================================================
   editor.js — Orquestador: EditorView_init
   Las clases, canvas, historial, input, UI y storage están en
   editor-state / editor-canvas / editor-history / editor-input /
   editor-ui / editor-storage
   ============================================================ */

function EditorView_init(){
  // Limpiar estado de sesión anterior
  edHideGearIcon();
  const staleToast = $('edToast');
  if(staleToast){ staleToast.classList.remove('show'); clearTimeout(staleToast._t); }
  // Ocultar también el toast global (ej: "Bienvenido/a" del login)
  const globalToast = document.getElementById('toast');
  if(globalToast){ globalToast.classList.remove('show'); clearTimeout(globalToast._tid); }
  edCanvas=$('editorCanvas');
  // Habilitar botón Capas
  document.querySelector('[data-menu="layers"]')?.removeAttribute('disabled');
  document.querySelector('[data-menu="layers"]')?.style.removeProperty('opacity');
  document.querySelector('[data-menu="layers"]')?.style.removeProperty('cursor');
  edViewerCanvas=$('viewerCanvas');
  if(!edCanvas)return;
  edCtx=edCanvas.getContext('2d');
  if(edViewerCanvas)edViewerCtx=edViewerCanvas.getContext('2d');

  const editId=sessionStorage.getItem('cx_edit_id');
  if(!editId){Router.go('my-comics');return;}
  edLoadProject(editId);
  sessionStorage.removeItem('cx_edit_id');

  edSetOrientation(edOrientation);
  edActiveTool='select';
  const cur=$('edBrushCursor');if(cur)cur.style.display='none';

  // ── CANVAS ──
  edCanvas.addEventListener('pointerdown',edOnStart,{passive:false});
  edCanvas.addEventListener('pointermove',edOnMove, {passive:false});
  edCanvas.addEventListener('pointerup',  edOnEnd);
  edCanvas.addEventListener('pointerleave',edOnEnd);
  edCanvas.addEventListener('touchstart', edOnStart,{passive:false});
  edCanvas.addEventListener('touchmove',  edOnMove, {passive:false});
  edCanvas.addEventListener('touchend',   edOnEnd);

  // ── TOPBAR ──
  $('edBackBtn')?.addEventListener('click',()=>{edSaveProject();Router.go('my-comics');});
  $('edSaveBtn')?.addEventListener('click',edSaveProject);
  $('edPreviewBtn')?.addEventListener('click',edOpenViewer);

  // ── MENÚ: botones dropdown (excluir layers y nav que tienen overlays propios) ──
  document.querySelectorAll('[data-menu]').forEach(btn=>{
    const id = btn.dataset.menu;
    if(id === 'layers' || id === 'nav') return; // tienen su propio handler
    btn.addEventListener('pointerup',e=>{e.stopPropagation();edToggleMenu(id);});
  });

  // ── INSERTAR ──
  $('dd-gallery')?.addEventListener('click',()=>{$('edFileGallery').click();edCloseMenus();});
  $('dd-camera')?.addEventListener('click', ()=>{$('edFileCapture').click();edCloseMenus();});
  $('dd-textbox')?.addEventListener('click',()=>{edAddText();edCloseMenus();});
  $('dd-bubble')?.addEventListener('click', ()=>{edAddBubble();edCloseMenus();});
  $('edFileGallery')?.addEventListener('change',e=>{edAddImage(e.target.files[0]);e.target.value='';});
  $('edFileCapture')?.addEventListener('change',e=>{edAddImage(e.target.files[0]);e.target.value='';});

  // ── DIBUJAR ──
  $('dd-pen')?.addEventListener('click',()=>{
    edActiveTool='draw';
    edCanvas.className='tool-draw';
    if($('edBrushCursor'))$('edBrushCursor').style.display='block';
    edRenderOptionsPanel('draw');edCloseMenus();
  });
  $('dd-eraser')?.addEventListener('click',()=>{
    edActiveTool='eraser';
    edCanvas.className='tool-eraser';
    if($('edBrushCursor'))$('edBrushCursor').style.display='block';
    edRenderOptionsPanel('eraser');edCloseMenus();
  });
  $('dd-savedraw')?.addEventListener('click',()=>{
    edDeactivateDrawTool();
    edSaveDrawData();
    edToast('Dibujo guardado ✓');
    edCloseMenus();
  });
  $('dd-cleardraw')?.addEventListener('click',()=>{edClearDraw();edCloseMenus();});

  // ── NAVEGAR (Hoja → abre overlay) ──
  // El botón Hoja ▾ del menú abre el overlay de hojas
  const _navBtn = document.querySelector('[data-menu="nav"]');
  if(_navBtn){
    _navBtn.addEventListener('pointerup', e => {
      e.stopPropagation();
      edCloseMenus();
      edOpenPages();
    });
  }
  // Bindings del dropdown pequeño (ya no se usa, pero por si acaso)
  $('dd-addpage')?.addEventListener('click',()=>{edAddPage();edCloseMenus();});
  $('dd-delpage')?.addEventListener('click',()=>{edDeletePage();edCloseMenus();});
  $('dd-orientv')?.addEventListener('click',()=>{edSetOrientation('vertical');edCloseMenus();});
  $('dd-orienth')?.addEventListener('click',()=>{edSetOrientation('horizontal');edCloseMenus();});

  // ── PROYECTO ──
  $('dd-editproject')?.addEventListener('click',()=>{edOpenProjectModal();edCloseMenus();});
  $('dd-viewerjson')?.addEventListener('click',()=>{edOpenViewer();edCloseMenus();});
  $('dd-savejson')?.addEventListener('click',()=>{edDownloadJSON();edCloseMenus();});
  $('dd-loadjson')?.addEventListener('click',()=>{$('edLoadFile').click();edCloseMenus();});
  $('edLoadFile')?.addEventListener('change',e=>{edLoadFromJSON(e.target.files[0]);e.target.value='';});

  // ── CAPAS ──
  const _layersBtn = document.querySelector('[data-menu="layers"]');
  if(_layersBtn){
    _layersBtn.addEventListener('pointerup', e => {
      e.stopPropagation();
      edCloseMenus();
      edOpenLayers();
    });
  }

  // ── MINIMIZAR ──
  $('edUndoBtn')?.addEventListener('click', edUndo);
  $('edRedoBtn')?.addEventListener('click', edRedo);
  $('edMinimizeBtn')?.addEventListener('click',edMinimize);
  edPushHistory();
  edInitFloatDrag();

  // ── VISOR ──
  $('viewerClose')?.addEventListener('pointerup', e=>{ e.stopPropagation(); edCloseViewer(); });
  $('viewerPrev')?.addEventListener('pointerup', e=>{
    e.stopPropagation();
    edShowViewerCtrls();
    const page=edPages[edViewerIdx];
    if(page?.textMode==='sequential' && edViewerTextStep > 0){
      edViewerTextStep--; edUpdateViewer(); return;
    }
    if(edViewerIdx>0){
      edViewerIdx--;
      const prevPage=edPages[edViewerIdx];
      const prevTexts=prevPage?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
      edViewerTextStep = prevPage?.textMode==='sequential' ? prevTexts.length : 0;
      edUpdateViewer();
    }
  });
  $('viewerNext')?.addEventListener('pointerup', e=>{
    e.stopPropagation();
    edShowViewerCtrls();
    const page=edPages[edViewerIdx];
    const textLayers=page?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
    if(page?.textMode==='sequential' && edViewerTextStep < textLayers.length){
      edViewerTextStep++; edUpdateViewer(); return;
    }
    if(edViewerIdx<edPages.length-1){
      edViewerIdx++; edViewerTextStep=0; edUpdateViewer();
    }
  });

  // ── MODAL PROYECTO ──
  $('edMCancel')?.addEventListener('click',edCloseProjectModal);
  $('edMSave')?.addEventListener('click',edSaveProjectModal);

  // ── Ctrl+Z / Ctrl+Y: deshacer/rehacer en PC ──
  document.addEventListener('keydown', function _edKeyUndo(e){
    if(!document.getElementById('editorShell')) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if(!ctrl) return;
    if(!e.shiftKey && e.key.toLowerCase() === 'z'){ e.preventDefault(); edUndo(); }
    else if(e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')){ e.preventDefault(); edRedo(); }
  });

  // ── RESIZE ──
  window.addEventListener('resize',()=>{edFitCanvas();edUpdateCanvasFullscreen();});

  // Fit canvas con reintentos hasta que las medidas sean reales
  // (el CSS se carga dinámicamente y las fuentes tardan en aplicar)
  function _edInitFit(attemptsLeft) {
    const topbar = $('edTopbar');
    const menu   = $('edMenuBar');
    const topH   = topbar ? topbar.getBoundingClientRect().height : 0;
    const menuH  = menu   ? menu.getBoundingClientRect().height   : 0;
    // Si ambas barras tienen altura real, ya está listo
    if (topH > 10 && menuH > 10) {
      edFitCanvas(); edRedraw(); return;
    }
    if (attemptsLeft <= 0) {
      edFitCanvas(); edRedraw(); return; // último recurso
    }
    requestAnimationFrame(() => _edInitFit(attemptsLeft - 1));
  }
  // Primer intento tras doble rAF; si falla reintenta hasta 30 frames (~500ms)
  requestAnimationFrame(() => requestAnimationFrame(() => _edInitFit(30)));

  // ── DEACTIVATE DRAW WHEN CLICKING OUTSIDE CANVAS ──
  document.addEventListener('pointerdown', e => {
    if(['draw','eraser'].includes(edActiveTool)){
      if(!e.target.closest('#editorCanvas') && !e.target.closest('#edOptionsPanel')){
        edDeactivateDrawTool();
      }
    }
    // Cerrar menús al tocar fuera (los dropdowns pueden estar en body)
    if(!e.target.closest('#edMenuBar') && !e.target.closest('.ed-dropdown')){
      edCloseMenus();
    }
  });


  // ── FULLSCREEN CANVAS ON ORIENTATION MATCH ──
  edUpdateCanvasFullscreen();
  window.addEventListener('orientationchange', ()=>{
    setTimeout(()=>{edFitCanvas();edUpdateCanvasFullscreen();}, 200);
  });

  // Seguro extra: si después de 600ms el canvas sigue muy pequeño, refitear
  setTimeout(() => {
    if (edCanvas && parseInt(edCanvas.style.height || '0') < 50) {
      edFitCanvas(); edRedraw();
    }
  }, 600);
}

/* ── DESCARGAR / CARGAR JSON ── */
function edDownloadJSON(){
  edSaveProject();
  const data=localStorage.getItem('cs_comics');
  const comic=ComicStore.getById(edProjectId);if(!comic)return;
  const blob=new Blob([JSON.stringify(comic,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(edProjectMeta.title||'proyecto').replace(/\s+/g,'_')+'.json';
  a.click();
}
function edLoadFromJSON(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.editorData){
        edProjectMeta={title:data.title||'',author:data.author||'',genre:data.genre||'',navMode:data.navMode||'horizontal'};
        edOrientation=data.editorData.orientation||'vertical';
        edPages=(data.editorData.pages||[]).map(pd=>({
          drawData:pd.drawData||null,
          layers:(pd.layers||[]).map(edDeserLayer).filter(Boolean),
        }));
        if(!edPages.length)edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'immediate'});
        edCurrentPage=0;edLayers=edPages[0].layers;
        edSetOrientation(edOrientation);
        const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title;
        edToast('Proyecto cargado ✓');
      }
    }catch(err){edToast('Error al cargar el archivo');}
  };
  reader.readAsText(file);
}
