/* ============================================================
   editor-storage.js — Guardar, cargar, serializar, comprimir
   ============================================================ */

/* ══════════════════════════════════════════
   GUARDAR / CARGAR
   ══════════════════════════════════════════ */
function edSaveProject(){
  if(!edProjectId){edToast('Sin proyecto activo');return;}
  const existing=ComicStore.getById(edProjectId)||{};
  const panels=edPages.map((p,i)=>({
    id:'panel_'+i,
    dataUrl:p.drawData||edRenderPage(p),
    orientation:edOrientation,
  }));
  ComicStore.save({
    ...existing,
    id:edProjectId,
    ...edProjectMeta,
    panels,
    editorData:{
      orientation:edOrientation,
      pages:edPages.map(p=>({drawData:p.drawData,layers:p.layers.map(edSerLayer),textLayerOpacity:p.textLayerOpacity??1,textMode:p.textMode||'immediate'})),
    },
    updatedAt:new Date().toISOString(),
  });
  edToast('Guardado ✓');
}
function edRenderPage(page){
  const tmp=document.createElement('canvas');tmp.width=edCanvas.width;tmp.height=edCanvas.height;
  const ctx=tmp.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,tmp.width,tmp.height);
  page.layers.filter(l=>l.type==='image').forEach(l=>l.draw(ctx,tmp));
  page.layers.filter(l=>l.type!=='image').forEach(l=>l.draw(ctx,tmp));
  return tmp.toDataURL('image/jpeg',0.85);
}
function _edCompressImageSrc(src, maxPx=1080, quality=0.82){
  // Redimensiona y comprime una imagen a JPEG para ahorrar espacio en localStorage
  if(!src || src.startsWith('data:image/jpeg') && src.length < 200000) return src; // ya pequeña
  try {
    const img = new Image();
    img.src = src;
    if(!img.complete || img.naturalWidth === 0) return src; // no cargada aún
    const ratio = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth  * ratio);
    const h = Math.round(img.naturalHeight * ratio);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', quality);
  } catch(e) { return src; }
}

function edSerLayer(l){
  const op = l.opacity !== undefined ? {opacity:l.opacity} : {};
  if(l.type==='image'){
    const compressedSrc = _edCompressImageSrc(l.src || (l.img ? l.img.src : ''));
    return{type:'image',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,src:compressedSrc,...op};
  }
  if(l.type==='text')return{type:'text',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,...op};
  if(l.type==='bubble')return{type:'bubble',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,color:l.color,
    backgroundColor:l.backgroundColor,borderColor:l.borderColor,borderWidth:l.borderWidth,
    tail:l.tail,style:l.style,tailStart:{...l.tailStart},tailEnd:{...l.tailEnd},multipleCount:l.multipleCount,...op};
}
function edDeserLayer(d){
  if(d.type==='text'){const l=new TextLayer(d.text,d.x,d.y);Object.assign(l,d);return l;}
  if(d.type==='bubble'){const l=new BubbleLayer(d.text,d.x,d.y);Object.assign(l,d);
    if(d.tailStart)l.tailStart={...d.tailStart};if(d.tailEnd)l.tailEnd={...d.tailEnd};return l;}
  if(d.type==='image'){
    const l=new ImageLayer(null,d.x,d.y,d.width);
    l.height=d.height; l.rotation=d.rotation||0; l.src=d.src||'';
    if(d.opacity!==undefined) l.opacity=d.opacity;
    if(d.src){
      const img=new Image();
      img.onload=()=>{ l.img=img; l.src=img.src; edRedraw(); };
      img.onerror=()=>{ console.warn('edDeserLayer: failed to load image'); };
      img.src=d.src;
    }
    return l;
  }
  return null;
}
function edLoadProject(id){
  const comic=ComicStore.getById(id);if(!comic)return;
  edProjectId=id;
  edProjectMeta={title:comic.title||'',author:comic.author||comic.username||'',genre:comic.genre||'',navMode:comic.navMode||'horizontal'};
  const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title||'Sin título';
  if(comic.editorData){
    edOrientation=comic.editorData.orientation||'vertical';
    edPages=(comic.editorData.pages||[]).map(pd=>({
      drawData:pd.drawData||null,
      layers:(pd.layers||[]).map(edDeserLayer).filter(Boolean),
      textLayerOpacity:pd.textLayerOpacity??1,
      textMode:pd.textMode||'immediate',
    }));
  }else{
    edOrientation='vertical';edPages=[{layers:[],drawData:null,textLayerOpacity:1,textMode:'immediate'}];
  }
  if(!edPages.length)edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'immediate'});
  edCurrentPage=0;edLayers=edPages[0].layers;
}
