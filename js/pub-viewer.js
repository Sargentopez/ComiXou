/* pub-viewer.js  v5.68 */

Router.register('read', {
  bodyClass: 'pv-page',
  css: [],
  hideHeader: true,
  html: () => `
    <div id="pubViewer">
      <div id="pvStage"></div>
      <div class="pv-controls hidden" id="pvControls">
        <button class="pv-btn" id="pvPrev">◄</button>
        <span id="pvCounter">1 / 1</span>
        <button class="pv-btn" id="pvNext">►</button>
        <button class="pv-btn" id="pvClose">✕</button>
      </div>
      <button class="pv-btn pv-close-touch" id="pvCloseMobile">✕</button>
    </div>`,
  init:    (params) => PubViewer._init(params.id),
  destroy: ()       => PubViewer._destroy(),
});

const PubViewer = (() => {
  let _comic=null, _panelIdx=0, _bubbleStep=0, _ac=null, _ro=null, _hideTimer=null;

  function open(comicId) { Router.go("read", { id: comicId }); }

  function _init(comicId) {
    const comic = ComicStore.getById(comicId);
    if (!comic || !comic.panels || !comic.panels.length) {
      if (typeof showToast==="function") showToast("No se encontro el comic");
      Router.go("home"); return;
    }
    _comic=comic; _panelIdx=0; _bubbleStep=0;
    _renderPanel(0); _bindListeners();
  }

  function _destroy() {
    if (_ac) { _ac.abort(); _ac=null; }
    if (_ro) { _ro.disconnect(); _ro=null; }
    clearTimeout(_hideTimer); _comic=null;
  }

  function close() { Router.go("home"); }

  function _renderPanel(idx) {
    _panelIdx=idx; _bubbleStep=0;
    const panel=_comic.panels[idx];
    const stage=document.getElementById('pvStage');
    if (!stage||!panel) return;
    stage.innerHTML='';
    const img=document.createElement('img');
    img.className='pv-panel-img'; img.draggable=false; img.src=panel.dataUrl||'';
    stage.appendChild(img);
    const textLayer=document.createElement('div');
    textLayer.className='pv-text-layer';
    _buildTexts(panel,textLayer);
    stage.appendChild(textLayer);
    const isSeq=(panel.textMode||'sequential')==='sequential';
    const bubbles=textLayer.querySelectorAll('.pv-bubble');
    function fitLayer() {
      const sw=stage.offsetWidth, sh=stage.offsetHeight;
      const iw=img.naturalWidth,  ih=img.naturalHeight;
      if (!iw||!ih||!sw||!sh) return;
      const scale=Math.min(sw/iw,sh/ih);
      const rw=iw*scale, rh=ih*scale;
      const rl=(sw-rw)/2, rt=(sh-rh)/2;
      textLayer.style.cssText='position:absolute;pointer-events:none;'+
        'left:'+rl+'px;top:'+rt+'px;width:'+rw+'px;height:'+rh+'px;';
    }
    function initBubbles() {
      if (isSeq && bubbles.length>0) {
        _bubbleStep=1; bubbles[0].classList.add('visible');
      } else {
        _bubbleStep=bubbles.length;
        bubbles.forEach(b=>b.classList.add('visible'));
      }
      _updateCounter(); _showControls();
    }
    if (_ro) _ro.disconnect();
    _ro=new ResizeObserver(()=>{ if (img.naturalWidth) fitLayer(); });
    _ro.observe(stage);
    if (img.complete && img.naturalWidth) { fitLayer(); initBubbles(); }
    else { img.onload=()=>{ fitLayer(); initBubbles(); }; img.onerror=()=>initBubbles(); }
  }

  function _buildTexts(panel,layer){
    if(!panel.texts||!panel.texts.length)return;
    const items=[...panel.texts].filter(t=>t.text).sort((a,b)=>(a.order??0)-(b.order??0));
    items.forEach((t,i)=>{
      const w=document.createElement('div');
      w.className='pv-bubble';
      w.style.cssText='left:'+t.x+'%;top:'+t.y+'%;width:'+(t.w||30)+'%';
      w.dataset.idx=i;
      const inn=document.createElement('div');
      inn.className='pv-bubble-inner';
      const br=t.style==='thought'?'border-radius:50%':t.style==='explosion'?'border-radius:4px;transform:rotate(-1deg)':'border-radius:14px';
      const bw=(t.border!=null)?t.border:2;
      inn.style.cssText=['font-family:'+(t.fontFamily||'"Comic Neue",cursive'),'font-size:'+Math.round((t.fontSize||18)*0.85)+'px','color:'+(t.color||'#000'),'background:'+(t.bg||'#fff'),'border:'+bw+'px solid '+(t.borderColor||'#000'),br].join(';');
      const sp=document.createElement('span'); sp.textContent=t.text; inn.appendChild(sp);
      if(t.type==='dialog'&&t.style!=='thought'&&t.style!=='radio'){
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('class','pv-tail tail-'+(t.tail||'bottom')); svg.setAttribute('viewBox','0 0 30 22');
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d','M0 0 L15 22 L30 0 Z'); path.setAttribute('fill',t.bg||'#fff');
        path.setAttribute('stroke',t.borderColor||'#000'); path.setAttribute('stroke-width','2.5'); path.setAttribute('stroke-linejoin','round');
        svg.appendChild(path); inn.appendChild(svg);
      }
      w.appendChild(inn); layer.appendChild(w);
    });
  }

  function _advance(){
    const panel=_comic.panels[_panelIdx];
    const isSeq=(panel.textMode||'sequential')==='sequential';
    const bubbles=document.querySelectorAll('#pvStage .pv-bubble');
    if(isSeq&&_bubbleStep<bubbles.length){
      bubbles[_bubbleStep].classList.add('visible');_bubbleStep++;_updateCounter();
    }else if(_panelIdx<_comic.panels.length-1){_renderPanel(_panelIdx+1);}
  }
  function _back(){
    const panel=_comic.panels[_panelIdx];
    const isSeq=(panel.textMode||'sequential')==='sequential';
    const bubbles=document.querySelectorAll('#pvStage .pv-bubble');
    if(isSeq&&_bubbleStep>1){
      _bubbleStep--;bubbles[_bubbleStep].classList.remove('visible');_updateCounter();
    }else if(_panelIdx>0){
      _renderPanel(_panelIdx-1);
      requestAnimationFrame(()=>{
        const prev=document.querySelectorAll('#pvStage .pv-bubble');
        prev.forEach(b=>b.classList.add('visible'));
        _bubbleStep=prev.length;_updateCounter();
      });
    }
  }
  function _updateCounter(){
    const panel=_comic.panels[_panelIdx];
    const isSeq=(panel.textMode||'sequential')==='sequential';
    const bubbles=document.querySelectorAll('#pvStage .pv-bubble');
    const cnt=document.getElementById('pvCounter');if(!cnt)return;
    cnt.textContent=(isSeq&&bubbles.length>0)
      ?(_panelIdx+1)+'/'+_comic.panels.length+' · 💬'+_bubbleStep+'/'+bubbles.length
      :(_panelIdx+1)+' / '+_comic.panels.length;
  }
  function _showControls(){
    const ctrl=document.getElementById('pvControls');if(!ctrl)return;
    ctrl.classList.remove('hidden');
    clearTimeout(_hideTimer);
    _hideTimer=setTimeout(()=>ctrl.classList.add('hidden'),3000);
  }

  function _bindListeners(){
    if(_ac)_ac.abort();
    _ac=new AbortController();
    const sig={signal:_ac.signal};
    const viewer=document.getElementById("pubViewer");
    if(!viewer)return;
    document.getElementById("pvClose")
      ?.addEventListener("pointerup",e=>{e.stopPropagation();close();},sig);
    document.getElementById("pvCloseMobile")
      ?.addEventListener("pointerup",e=>{e.stopPropagation();close();},sig);
    document.getElementById("pvNext")
      ?.addEventListener("pointerup",e=>{e.stopPropagation();_advance();},sig);
    document.getElementById("pvPrev")
      ?.addEventListener("pointerup",e=>{e.stopPropagation();_back();},sig);
    document.addEventListener("keydown",e=>{
      if(e.key==="ArrowRight"||e.key==="ArrowDown"){e.preventDefault();_advance();}
      if(e.key==="ArrowLeft"||e.key==="ArrowUp"){e.preventDefault();_back();}
      if(e.key==="Escape")close();
    },sig);
    let _sx=null,_sy=null,_scroll=false;
    viewer.addEventListener("touchstart",e=>{
      _sx=null;_sy=null;_scroll=false;
      if(e.touches.length!==1)return;
      _sx=e.touches[0].clientX;_sy=e.touches[0].clientY;
    },{passive:true,signal:_ac.signal});
    viewer.addEventListener("touchmove",e=>{
      if(_sx===null)return;
      const dx=e.touches[0].clientX-_sx,dy=e.touches[0].clientY-_sy;
      if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>10)_scroll=true;
    },{passive:true,signal:_ac.signal});
    viewer.addEventListener("touchend",e=>{
      if(_sx===null||_scroll){_sx=null;return;}
      if(e.changedTouches.length!==1){_sx=null;return;}
      const dx=e.changedTouches[0].clientX-_sx,dy=e.changedTouches[0].clientY-_sy;
      _sx=null;
      if(Math.abs(dx)<30||Math.abs(dx)<=Math.abs(dy))return;
      if(dx<0)_advance();else _back();
    },{passive:true,signal:_ac.signal});
    viewer.addEventListener("mousemove",()=>_showControls(),{passive:true,signal:_ac.signal});
    viewer.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse")_showControls();
    },{capture:true,passive:true,signal:_ac.signal});
  }
  return{open,_init,_destroy};
})();
