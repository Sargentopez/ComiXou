// ─── ComiXow Unit Tests ───────────────────────────────────────────────────
// Ejecutar con: node tests/unit.test.js
// No requiere navegador — prueba lógica pura extraída de editor.js

let passed = 0, failed = 0;
function test(name, fn){
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e){ console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(cond, msg){ if(!cond) throw new Error(msg||'assertion failed'); }
function approx(a,b,eps=0.001){ assert(Math.abs(a-b)<eps, `${a} ≠ ${b} (±${eps})`); }

// ── Constantes ──────────────────────────────────────────────────────────
const ED_PAGE_W=360, ED_PAGE_H=780, ED_CANVAS_W=1800, ED_CANVAS_H=2340;

// ── Funciones puras extraídas de editor.js ──────────────────────────────
const edPageW = o => o==='horizontal' ? ED_PAGE_H : ED_PAGE_W;
const edPageH = o => o==='horizontal' ? ED_PAGE_W : ED_PAGE_H;
const edMarginX = o => (ED_CANVAS_W - edPageW(o)) / 2;
const edMarginY = o => (ED_CANVAS_H - edPageH(o)) / 2;

function edZoomAt(cam, sx, sy, factor){
  const newZ = Math.min(Math.max(cam.z*factor, 0.05), 8);
  const fReal = newZ/cam.z;
  return {x:sx-(sx-cam.x)*fReal, y:sy-(sy-cam.y)*fReal, z:newZ};
}

function resolveRadii(rawCR, pts, closed, activeIdx=-1){
  const pw=ED_PAGE_W, ph=ED_PAGE_H;
  const px2 = p => ({x:p.x*pw, y:p.y*ph});
  const n=pts.length, rr=pts.map((_,i)=>rawCR[i]||0);
  for(let s=0;s<(closed?n:n-1);s++){
    const a=s, b=(s+1)%n;
    const pa=px2(pts[a]), pb=px2(pts[b]);
    const len=Math.hypot(pb.x-pa.x,pb.y-pa.y);
    if(len<2) continue;
    const sum=rr[a]+rr[b];
    if(sum>len-2){
      if(activeIdx===a){rr[a]=Math.min(rr[a],len-2);rr[b]=Math.max(0,len-2-rr[a]);}
      else if(activeIdx===b){rr[b]=Math.min(rr[b],len-2);rr[a]=Math.max(0,len-2-rr[b]);}
      else{const sc=(len-2)/sum;rr[a]*=sc;rr[b]*=sc;}
    }
  }
  return rr;
}

function scaleRadii(radii, sw, sh, newW, newH, pw, ph){
  const scR=Math.min(sw,sh), maxR=Math.min(newW*pw,newH*ph)/2;
  if(Array.isArray(radii)) return radii.map(r=>r?Math.min(r*scR,maxR):0);
  const out={}; for(const k in radii) out[k]=radii[k]?Math.min(radii[k]*scR,maxR):0; return out;
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n── Página y márgenes ──');
test('edPageW vertical=360',  ()=>assert(edPageW()===360));
test('edPageH vertical=780',  ()=>assert(edPageH()===780));
test('edPageW horizontal=780',()=>assert(edPageW('horizontal')===780));
test('edPageH horizontal=360',()=>assert(edPageH('horizontal')===360));
test('margen X centrado',     ()=>approx(edMarginX(),(ED_CANVAS_W-360)/2));
test('margen Y centrado',     ()=>approx(edMarginY(),(ED_CANVAS_H-780)/2));

console.log('\n── Cámara / Zoom ──');
test('zoom preserva punto de pivote',()=>{
  const cam={x:0,y:0,z:1}, c2=edZoomAt(cam,400,300,2);
  approx((400-cam.x)/cam.z,(400-c2.x)/c2.z);
});
test('zoom respeta máximo (8)',()=>assert(edZoomAt({x:0,y:0,z:7},0,0,5).z<=8));
test('zoom respeta mínimo (0.05)',()=>assert(edZoomAt({x:0,y:0,z:0.1},0,0,0.1).z>=0.05));
test('zoom factor 1 no mueve cámara',()=>{
  const cam={x:100,y:200,z:1.5}, c2=edZoomAt(cam,0,0,1);
  approx(c2.x,cam.x); approx(c2.y,cam.y); approx(c2.z,cam.z);
});

console.log('\n── Radios de curva: resolución de conflictos ──');
// Segmento horizontal de 360px (pts en coords normalizadas de página)
const pts2=[{x:0,y:0},{x:1,y:0}]; // 1.0 * 360px = 360px
test('sin conflicto: radios inalterados',()=>{
  const rr=resolveRadii({0:10,1:10},pts2,false);
  approx(rr[0],10); approx(rr[1],10);
});
test('conflicto sin activo: escala proporcional',()=>{
  const rr=resolveRadii({0:200,1:200},pts2,false);
  assert(rr[0]+rr[1]<=358.01,'suma ≤358');
  approx(rr[0],rr[1],1);
});
test('conflicto activo=0: activo no se recorta primero',()=>{
  const rr=resolveRadii({0:300,1:300},pts2,false,0);
  assert(rr[0]+rr[1]<=358.01,'suma ≤358');
  assert(rr[0]>=rr[1]-0.01,'activo ≥ no-activo');
});
test('conflicto activo=1: activo tiene prioridad',()=>{
  const rr=resolveRadii({0:300,1:300},pts2,false,1);
  assert(rr[0]+rr[1]<=358.01,'suma ≤358');
  assert(rr[1]>=rr[0]-0.01,'activo ≥ no-activo');
});
test('radio 0 no afectado',()=>{
  const rr=resolveRadii({0:0,1:50},pts2,false);
  approx(rr[0],0); approx(rr[1],50);
});

console.log('\n── Escalado de radios en resize ──');
test('resize proporcional x2: radios x2',()=>{
  const rr=scaleRadii([20,20,20,20],2,2,0.5,0.5,360,780);
  rr.forEach(r=>approx(r,40,1));
});
test('resize asimétrico usa min(sw,sh)',()=>{
  const rr=scaleRadii([40],2,0.5,0.1,0.1,360,780);
  approx(rr[0],18,1); // min(sw,sh)=0.5 → 40*0.5=20, clampado a maxR=18
});
test('radio clampado al máximo del nuevo tamaño',()=>{
  const rr=scaleRadii([1000],1,1,0.01,0.01,360,780);
  assert(rr[0]<=Math.min(0.01*360,0.01*780)/2+0.1,'radio clampado');
});
test('radios cero se mantienen cero',()=>{
  const rr=scaleRadii([0,0,0,0],2,2,1,1,360,780);
  rr.forEach(r=>assert(r===0,'debe ser 0'));
});

console.log('\n── Geometría de capas ──');
test('BBox de capa cubre su posición',()=>{
  const la={x:0.5,y:0.5,width:0.2,height:0.1};
  assert(la.x-la.width/2<=la.x && la.x<=la.x+la.width/2,'x en bbox');
});
test('escala de puntos LineLayer en resize',()=>{
  const pts=[{x:0,y:0},{x:0.5,y:0.5},{x:-0.5,y:0.5}];
  const sw=2, sh=1.5;
  const scaled=pts.map(p=>({x:p.x*sw,y:p.y*sh}));
  approx(scaled[1].x, 1.0);
  approx(scaled[1].y, 0.75);
});

// ─────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`);
console.log(`Resultado: ${passed} ✓  ${failed} ✗  (total ${passed+failed})`);
if(failed>0){ console.error('\n⚠ HAY FALLOS — revisar antes de empaquetar\n'); process.exit(1); }
else { console.log('\n✓ Todos los tests pasaron\n'); }
