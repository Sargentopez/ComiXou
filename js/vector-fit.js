/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
/* ============================================================
   vector-fit.js — «MODO LIBRE» del dibujo vectorial: de un trazo a mano alzada a NODOS + CURVATURA   (v42.61)

   El usuario dibuja como en el dibujo a mano; al soltar, este módulo calcula solo los nodos y la curvatura de
   cada nodo que mejor reproducen el trazo, dentro del MODELO de LineLayer del editor:
       polilínea de nodos  +  radio de curvatura (cornerRadii) por nodo
   — cada nodo redondeado se sustituye por un empalme (curva cuadrática simétrica) que arranca a r px del nodo por
   cada lado, y r se recorta a la mitad del tramo más corto de los dos que llegan al nodo (ver LineLayer.draw).
   Ese modelo NO tiene tiradores Bézier, así que no se puede reutilizar un ajustador de Béziers tal cual: el ajuste
   se hace directamente sobre lo que el editor dibuja (se calcula la distancia contra la MISMA curva que se pinta,
   recorte incluido), y el resultado se puede seguir editando con NODOS y «Curvatura» como cualquier otro objeto.

   MÉTODO (implementación PROPIA; técnicas estándar, ver créditos abajo)
     1. Limpieza y remuestreo uniforme del trazo (≈ cada 2 px).
     2. ¿Cerrado? Si el final cae junto al principio y el trazo rodea un área, el objeto se cierra (se recorta el
        solape si el usuario se pasó de vuelta).
     3. ESQUINAS: puntos donde el trazo gira bruscamente en una ventana corta (ángulo de giro ≥ ~50° y concentrado:
        en una curva cerrada el giro crece al ampliar la ventana, en una esquina no). Son nodos con curvatura 0,
        colocados en el vértice real (cruce de las rectas de ambos lados) y validados contra los puntos crudos.
     4. Cada tramo suave entre esquinas se ajusta por MÍNIMOS CUADRADOS no lineales (Levenberg–Marquardt) con la
        distancia punto–curva (la correspondencia punto↔curva se recalcula en cada paso), con extremos fijos y
        parámetros = posición de cada nodo + su radio de curvatura. Se parte de una recta y se INSERTAN nodos donde
        el error es mayor, hasta que ningún punto del trazo se separa de la curva más que la tolerancia.
     5. PODA: se prueba a quitar nodos sobrantes (los que menos daño hacen primero) y a reajustar el resto; un grupo
        de nodos se queda fuera si el trazo sigue a menos de 0,9·tol de la curva. Menos nodos = más fácil de editar.
     6. Comprobación final contra la curva exacta que dibuja el editor (en los dos sentidos: trazo→curva y
        curva→trazo). Si el ajuste no llega (tiempo, nodos máximos), se devuelve una polilínea que sí cumple.

   CRÉDITOS — técnicas de referencia (no se ha copiado código de ningún proyecto):
     · Ajuste de curvas digitalizadas con tolerancia por error máximo y división en el punto de mayor error:
         Philip J. Schneider, «An Algorithm for Automatically Fitting Digitized Curves», Graphics Gems (Academic Press, 1990).
         Es el método estándar de los editores vectoriales de código abierto (Paper.js Path.simplify, Inkscape/Karbon, fit-curve).
         https://github.com/erich666/GraphicsGems  ·  http://paperjs.org/  ·  https://github.com/soswow/fit-curve
     · Mínimos cuadrados con distancia punto–curva y amortiguación Levenberg–Marquardt:
         K. Levenberg (1944), D. W. Marquardt (1963); aplicado al ajuste de curvas por minimización de distancia punto–curva
         (W. Wang, H. Pottmann, Y. Liu, «Fitting B-spline curves to point clouds by curvature-based squared distance minimization»,
         ACM Transactions on Graphics, 2006).
     · Detección de esquinas por ángulo de giro en una ventana (estándar en vectorización de trazos).
     · Orden de la poda de nodos por el área del triángulo que forma cada nodo con sus vecinos:
         M. Visvalingam, J. D. Whyatt, «Line generalisation by repeated elimination of points», The Cartographic Journal, 1993.
     · Simplificación inicial por Ramer–Douglas–Peucker (U. Ramer 1972; D. Douglas, T. Peucker 1973).
     · Fidelidad/tolerancia en píxeles de pantalla, como el «Fidelity» del Lápiz de Illustrator y el «Smoothing» del de Inkscape.

   USO
     CxFit.fit(puntos, { tol })  →  { nodes:[{x,y}], radii:[r…], closed, maxErr, K, ms, … }  |  null (toque sin trazo)
     Los puntos y el resultado están en las MISMAS unidades (en el editor: píxeles de página).
   ============================================================ */
(function (root) {
'use strict';

const DEF = {
  tol: 2.0,          // error máximo trazo↔curva (en las unidades de los puntos: px de página)
  step: 2.0,         // separación del remuestreo uniforme
  maxSamples: 900,   // tope de muestras de un trazo (los largos se remuestrean más espaciados)
  minLength: 3,      // por debajo de esta longitud total es un toque, no un trazo
  rCap: 80,          // radio máximo de curvatura que se produce (el deslizador «Curvatura» del editor llega a 80)
  rMin: 0.3,         // radio mínimo durante el ajuste (por debajo de 0,75 acaba como esquina viva, r = 0)
  cornerDeg: 50,     // giro mínimo (a escala 2·ventana) para considerar esquina
  cornerWin: 7,      // ventana (en unidades) con la que se mide el giro; se amplía con la tolerancia
  smooth: 1,         // pasadas de suavizado ligero [¼ ½ ¼] del trazo remuestreado (ruido del puntero); extremos y esquinas quedan fijos
  allowClose: true,  // cerrar el objeto cuando el final cae junto al principio
  closeDist: 14,     // distancia máxima entre final y principio para cerrar
  closeFrac: 0.12,   // …y como mucho esta fracción de la longitud del trazo
  closeArea: 0.02,   // área encerrada / longitud² mínima para considerar que el trazo rodea algo
  maxNodes: 200,     // nodos máximos por tramo
  timeMs: 500,       // presupuesto de tiempo del ajuste
  wTan: 0.3,         // peso de la componente tangencial en el paso de Levenberg–Marquardt
  wNode: 0.5,        // rigidez tangencial de cada nodo (evita que los nodos se deslicen y se amontonen)
  initEps: 8.0,      // ε de la simplificación inicial (unidades internas, tol = 2)
  wRev: 1.0,         // peso del término curva→trazo (impide que el ajuste invente desvíos que el trazo no tiene)
  maxIns: 4,         // nodos que se insertan como mucho por ronda
  prune: true,       // poda de nodos sobrantes tras el ajuste
  pruneErr: 0.9,     // la poda solo acepta quitar nodos si el trazo sigue a menos de esta fracción de tol
  pruneFrac: 0.4,    // fracción del presupuesto de tiempo que puede gastar la poda
  pruneIter: 9,      // iteraciones de Levenberg–Marquardt por prueba de poda
  pruneMaxK: 40      // por encima de estos nodos (trazos muy largos) no se poda
};

const now = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
const sqrt = Math.sqrt, abs = Math.abs, min = Math.min, max = Math.max;

/* ───────────────────────── utilidades geométricas ───────────────────────── */
function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return sqrt(dx * dx + dy * dy); }
function pathLen(P) { let s = 0; for (let i = 1; i < P.length; i++) s += dist(P[i - 1], P[i]); return s; }
function dedupe(P, minD) {
  const out = [{ x: P[0].x, y: P[0].y }];
  for (let i = 1; i < P.length; i++) {
    const q = out[out.length - 1];
    const dx = P[i].x - q.x, dy = P[i].y - q.y;
    if (dx * dx + dy * dy >= minD * minD) out.push({ x: P[i].x, y: P[i].y });
  }
  const l = P[P.length - 1], q = out[out.length - 1];
  if (q.x !== l.x || q.y !== l.y) {
    if (out.length > 1 && dist(out[out.length - 2], l) < minD) out[out.length - 1] = { x: l.x, y: l.y };
    else out.push({ x: l.x, y: l.y });
  }
  return out;
}
// Remuestreo a separación uniforme h a lo largo de la poligonal (conserva el primer y el último punto exactos).
function resample(P, h) {
  const out = [{ x: P[0].x, y: P[0].y }];
  let acc = 0, px = P[0].x, py = P[0].y;
  for (let i = 1; i < P.length; i++) {
    const qx = P[i].x, qy = P[i].y;
    let dx = qx - px, dy = qy - py, seg = sqrt(dx * dx + dy * dy);
    while (acc + seg >= h && seg > 0) {
      const t = (h - acc) / seg;
      px += dx * t; py += dy * t;
      out.push({ x: px, y: py });
      dx = qx - px; dy = qy - py; seg = sqrt(dx * dx + dy * dy); acc = 0;
    }
    acc += seg; px = qx; py = qy;
  }
  const last = P[P.length - 1], lo = out[out.length - 1];
  if (out.length === 1 || dist(last, lo) > 0.35 * h) out.push({ x: last.x, y: last.y });
  else out[out.length - 1] = { x: last.x, y: last.y };
  return out;
}
function polyArea(P) {   // área con signo → valor absoluto (el polígono se cierra solo)
  let a = 0;
  for (let i = 0, n = P.length; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; a += p.x * q.y - q.x * p.y; }
  return abs(a) / 2;
}
function turnAngle(a, b, c) {   // ángulo entre (b−a) y (c−b), 0…π
  const v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const l1 = sqrt(v1x * v1x + v1y * v1y), l2 = sqrt(v2x * v2x + v2y * v2y);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  let c_ = (v1x * v2x + v1y * v2y) / (l1 * l2);
  return Math.acos(c_ > 1 ? 1 : c_ < -1 ? -1 : c_);
}
// distancia de un punto a una poligonal (abierta o cerrada)
function distToPoly(px, py, P, closed) {
  let best = Infinity;
  const n = P.length, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a.x + t * dx - px, qy = a.y + t * dy - py, d = qx * qx + qy * qy;
    if (d < best) best = d;
  }
  return sqrt(best);
}

/* ───────────────────────── MODELO: cadena de nodos + radios ─────────────────────────
   chain = { K, X[], Y[], R[] (radio PEDIDO), A[] (ancla: índice del dato junto al que nació el nodo), fixed[], closed }
   Radio efectivo (idéntico a LineLayer.draw): r_i = min(R_i, d_entrada/2, d_salida/2); los extremos de un abierto no se redondean. */
function makeChain(X, Y, R, A, fixed, closed) { return { K: X.length, X, Y, R, A, fixed, closed }; }
function cloneChain(c) { return { K: c.K, X: c.X.slice(), Y: c.Y.slice(), R: c.R.slice(), A: c.A.slice(), fixed: c.fixed.slice(), closed: c.closed }; }

function segLens(ch) {
  const K = ch.K, S = ch.closed ? K : K - 1, L = new Float64Array(S);
  for (let s = 0; s < S; s++) {
    const b = (s + 1) % K, dx = ch.X[b] - ch.X[s], dy = ch.Y[b] - ch.Y[s];
    L[s] = sqrt(dx * dx + dy * dy);
  }
  return L;
}
function effRadii(ch, L) {
  const K = ch.K, eff = new Float64Array(K);
  for (let i = 0; i < K; i++) {
    if (!ch.closed && (i === 0 || i === K - 1)) continue;
    const din = ch.closed ? L[(i - 1 + K) % K] : L[i - 1], dout = L[i];
    const lim = min(din, dout) / 2, r = ch.R[i];
    eff[i] = r < lim ? (r > 0 ? r : 0) : lim;
  }
  return eff;
}
// Trozos de la curva en el orden en que se recorre: líneas (k=0) y empalmes cuadráticos (k=1).
function buildPieces(ch) {
  const K = ch.K, closed = ch.closed, X = ch.X, Y = ch.Y;
  const L = segLens(ch), eff = effRadii(ch, L), pcs = [];
  const pushLine = (s, l0, l1) => {
    const d = L[s], b = (s + 1) % K, ux = (X[b] - X[s]) / d, uy = (Y[b] - Y[s]) / d;
    const ax = X[s] + ux * l0, ay = Y[s] + uy * l0, bx = X[s] + ux * l1, by = Y[s] + uy * l1;
    pcs.push({ k: 0, s, a: s, b, d, l0, len: l1 - l0, vx: ux, vy: uy, ax, ay, bx, by,
      x0: min(ax, bx), x1: max(ax, bx), y0: min(ay, by), y1: max(ay, by) });
  };
  const pushQuad = (i) => {
    const r = eff[i], a = closed ? (i - 1 + K) % K : i - 1, b = closed ? (i + 1) % K : i + 1;
    const din = closed ? L[(i - 1 + K) % K] : L[i - 1], dout = L[i];
    const ux = (X[i] - X[a]) / din, uy = (Y[i] - Y[a]) / din, vx = (X[b] - X[i]) / dout, vy = (Y[b] - Y[i]) / dout;
    const p1x = X[i] - r * ux, p1y = Y[i] - r * uy, p2x = X[i] + r * vx, p2y = Y[i] + r * vy;
    const lim = min(din, dout) / 2;
    const cm = ch.R[i] < lim ? 0 : (din <= dout ? 1 : 2);   // 0: manda el radio pedido · 1/2: lo recorta el tramo de entrada/salida
    pcs.push({ k: 1, i, a, b, r, ux, uy, vx, vy, din, dout, cm, p1x, p1y, nx: X[i], ny: Y[i], p2x, p2y,
      x0: min(p1x, X[i], p2x), x1: max(p1x, X[i], p2x), y0: min(p1y, Y[i], p2y), y1: max(p1y, Y[i], p2y) });
  };
  if (!closed) {
    let curL = 0;
    for (let i = 1; i <= K - 1; i++) {
      const s = i - 1, d = L[s], r = eff[i];
      const endL = r > 1e-9 ? d - r : d;
      if (endL - curL > 1e-9) pushLine(s, curL, endL);
      if (r > 1e-9) { pushQuad(i); curL = r; } else curL = 0;
    }
  } else {
    for (let i = 0; i < K; i++) {
      const r = eff[i], rn = eff[(i + 1) % K], d = L[i];
      if (r > 1e-9) pushQuad(i);
      const l0 = r > 1e-9 ? r : 0, l1 = rn > 1e-9 ? d - rn : d;
      if (l1 - l0 > 1e-9) pushLine(i, l0, l1);
    }
  }
  return { pcs, L, eff };
}

/* ── punto más cercano de un trozo ── (devuelven la distancia²; la posición y el parámetro quedan en _cx,_cy,_t) */
let _cx = 0, _cy = 0, _t = 0;
function nearLine(pc, px, py) {
  const dx = pc.bx - pc.ax, dy = pc.by - pc.ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - pc.ax) * dx + (py - pc.ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  _cx = pc.ax + t * dx; _cy = pc.ay + t * dy; _t = pc.l0 + t * pc.len;   // _t = distancia desde el nodo de partida del tramo
  const ex = _cx - px, ey = _cy - py;
  return ex * ex + ey * ey;
}
function nearQuad(pc, px, py) {
  const x0 = pc.p1x, y0 = pc.p1y, x1 = pc.nx, y1 = pc.ny, x2 = pc.p2x, y2 = pc.p2y;
  const M = 8;
  let bk = 0, bd = Infinity;
  for (let k = 0; k <= M; k++) {
    const t = k / M, s = 1 - t, w0 = s * s, w1 = 2 * s * t, w2 = t * t;
    const ex = w0 * x0 + w1 * x1 + w2 * x2 - px, ey = w0 * y0 + w1 * y1 + w2 * y2 - py, d = ex * ex + ey * ey;
    if (d < bd) { bd = d; bk = k; }
  }
  let t = bk / M, bt = t;
  const d2x = 2 * (x2 - 2 * x1 + x0), d2y = 2 * (y2 - 2 * y1 + y0);
  for (let it = 0; it < 4; it++) {
    const s = 1 - t, w0 = s * s, w1 = 2 * s * t, w2 = t * t;
    const bx = w0 * x0 + w1 * x1 + w2 * x2, by = w0 * y0 + w1 * y1 + w2 * y2;
    const d1x = 2 * (s * (x1 - x0) + t * (x2 - x1)), d1y = 2 * (s * (y1 - y0) + t * (y2 - y1));
    const ex = bx - px, ey = by - py;
    const f = ex * d1x + ey * d1y, fp = d1x * d1x + d1y * d1y + ex * d2x + ey * d2y;
    if (fp <= 1e-12) break;
    let nt = t - f / fp; nt = nt < 0 ? 0 : nt > 1 ? 1 : nt;
    if (abs(nt - t) < 1e-7) { t = nt; break; }
    t = nt;
  }
  // el mejor entre la muestra y el refinado
  let s = 1 - t, bx = s * s * x0 + 2 * s * t * x1 + t * t * x2, by = s * s * y0 + 2 * s * t * y1 + t * t * y2;
  let dd = (bx - px) * (bx - px) + (by - py) * (by - py);
  if (dd > bd) {
    t = bk / M; s = 1 - t; bx = s * s * x0 + 2 * s * t * x1 + t * t * x2; by = s * s * y0 + 2 * s * t * y1 + t * t * y2;
    dd = (bx - px) * (bx - px) + (by - py) * (by - py);
  }
  _cx = bx; _cy = by; _t = t;
  return dd;
}

/* ── rejilla espacial de la polilínea del trazo (para «curva → trazo») ── */
function buildGrid(D, closed, cell0) {
  const n = D.length, nS = closed ? n : n - 1;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const p = D[i]; if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  let cell = cell0;
  const area = (x1 - x0 + 2 * cell) * (y1 - y0 + 2 * cell);
  if (area / (cell * cell) > 20000) cell = sqrt(area / 20000);
  x0 -= cell; y0 -= cell; x1 += cell; y1 += cell;
  const nx = max(1, Math.ceil((x1 - x0) / cell)), ny = max(1, Math.ceil((y1 - y0) / cell));
  const cells = new Array(nx * ny);
  for (let s = 0; s < nS; s++) {
    const a = D[s], b = D[(s + 1) % n];
    const cx0 = Math.floor((min(a.x, b.x) - x0) / cell), cx1 = Math.floor((max(a.x, b.x) - x0) / cell);
    const cy0 = Math.floor((min(a.y, b.y) - y0) / cell), cy1 = Math.floor((max(a.y, b.y) - y0) / cell);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const id = cy * nx + cx; (cells[id] || (cells[id] = [])).push(s);
    }
  }
  return { D, n, nS, closed, x0, y0, cell, nx, ny, cells };
}
let _gx = 0, _gy = 0, _gd2 = 0;
function segNearest(G, s, px, py) {
  const D = G.D, a = D[s], b = D[(s + 1) % G.n], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = a.x + t * dx, qy = a.y + t * dy, ex = qx - px, ey = qy - py, d2 = ex * ex + ey * ey;
  if (d2 < _gd2) { _gd2 = d2; _gx = qx; _gy = qy; }
}
// Punto del trazo más cercano a (px,py) → _gx,_gy,_gd2 (distancia²)
function nearestOnGrid(G, px, py) {
  _gd2 = Infinity;
  const cx = Math.floor((px - G.x0) / G.cell), cy = Math.floor((py - G.y0) / G.cell);
  if (cx < 0 || cy < 0 || cx >= G.nx || cy >= G.ny) { for (let s = 0; s < G.nS; s++) segNearest(G, s, px, py); return; }
  const rMax = max(G.nx, G.ny);
  for (let r = 0; r <= rMax; r++) {
    const x0 = cx - r, x1 = cx + r, y0 = cy - r, y1 = cy + r;
    for (let yy = y0; yy <= y1; yy++) {
      if (yy < 0 || yy >= G.ny) continue;
      if (yy === y0 || yy === y1) {
        for (let xx = max(0, x0); xx <= min(G.nx - 1, x1); xx++) { const c = G.cells[yy * G.nx + xx]; if (c) for (let q = 0; q < c.length; q++) segNearest(G, c[q], px, py); }
      } else {
        if (x0 >= 0) { const c = G.cells[yy * G.nx + x0]; if (c) for (let q = 0; q < c.length; q++) segNearest(G, c[q], px, py); }
        if (x1 < G.nx && x1 !== x0) { const c = G.cells[yy * G.nx + x1]; if (c) for (let q = 0; q < c.length; q++) segNearest(G, c[q], px, py); }
      }
    }
    const lim = r * G.cell;
    if (_gd2 <= lim * lim) break;
  }
}

// Muestras de la curva (a parámetro fijo) para el término «curva → trazo»
const SPR = 2.0;
function curveSamples(pcs) {
  const out = [];
  for (let q = 0; q < pcs.length; q++) {
    const pc = pcs[q], m = pc.k === 0 ? max(1, Math.ceil(pc.len / SPR)) : max(3, Math.ceil(2 * pc.r / SPR));
    for (let z = 0; z < m; z++) out.push(q, (z + 0.5) / m);
  }
  return out;
}

const FULLSCAN2 = 3.0 * 3.0;   // d² (unidades internas, tol = 2) por encima de la cual se busca el trozo más cercano en toda la curva
// Asigna a cada punto del trazo su punto más cercano de la curva (trazo→curva) y, si hay rejilla, mide también curva→trazo.
// cost = Σ d²(trazo→curva) + wRev · Σ d²(curva→trazo)
function evaluate(ch, D, G, wRev) {
  const bp = buildPieces(ch), pcs = bp.pcs, np = pcs.length, n = D.length;
  const pi = new Int32Array(n), pt = new Float64Array(n), cx = new Float64Array(n), cy = new Float64Array(n), dd = new Float64Array(n);
  let cost = 0, maxE = 0, maxI = 0, prev = 0;
  for (let j = 0; j < n; j++) {
    const px = D[j].x, py = D[j].y;
    let best = Infinity, bi = 0, bt = 0, bx = 0, by = 0;
    const tryPiece = (q) => {
      const pc = pcs[q];
      const d = pc.k === 0 ? nearLine(pc, px, py) : nearQuad(pc, px, py);
      if (d < best) { best = d; bi = q; bt = _t; bx = _cx; by = _cy; }
    };
    // el trazo se recorre en orden: el trozo más cercano suele estar junto al del punto anterior (ventana ±4); solo si ahí el error es
    // grande se busca en toda la curva (así los bucles y espirales que pasan cerca de sí mismos siguen bien)
    const q0 = prev > 4 ? prev - 4 : 0, q1 = prev + 4 < np ? prev + 4 : np - 1;
    for (let q = q0; q <= q1; q++) tryPiece(q);
    if (best > FULLSCAN2) {
      for (let q = 0; q < np; q++) {
        if (q >= q0 && q <= q1) continue;
        const pc = pcs[q];
        const ex = px < pc.x0 ? pc.x0 - px : px > pc.x1 ? px - pc.x1 : 0, ey = py < pc.y0 ? pc.y0 - py : py > pc.y1 ? py - pc.y1 : 0;
        if (ex * ex + ey * ey >= best) continue;
        tryPiece(q);
      }
    }
    prev = bi;
    pi[j] = bi; pt[j] = bt; cx[j] = bx; cy[j] = by;
    const d = sqrt(best); dd[j] = d; cost += best;
    if (d > maxE) { maxE = d; maxI = j; }
  }
  const ev = { pcs, L: bp.L, eff: bp.eff, pi, pt, cx, cy, dist: dd, fcost: cost, cost, maxErr: maxE, maxIdx: maxI, rcost: 0, rs: null };
  if (G && wRev > 0) {
    const sm = curveSamples(pcs), ns = sm.length / 2;
    const rp = new Int32Array(ns), rt = new Float64Array(ns), rcx = new Float64Array(ns), rcy = new Float64Array(ns), rqx = new Float64Array(ns), rqy = new Float64Array(ns);
    let rc = 0;
    for (let z = 0; z < ns; z++) {
      const pc = pcs[sm[2 * z]], u = sm[2 * z + 1];
      let x, y, par;
      if (pc.k === 0) { par = pc.l0 + u * pc.len; x = pc.ax + (pc.bx - pc.ax) * u; y = pc.ay + (pc.by - pc.ay) * u; }
      else { par = u; const s = 1 - u; x = s * s * pc.p1x + 2 * s * u * pc.nx + u * u * pc.p2x; y = s * s * pc.p1y + 2 * s * u * pc.ny + u * u * pc.p2y; }
      nearestOnGrid(G, x, y);
      rp[z] = sm[2 * z]; rt[z] = par; rcx[z] = x; rcy[z] = y; rqx[z] = _gx; rqy[z] = _gy; rc += _gd2;
    }
    ev.rs = { n: ns, p: rp, t: rt, cx: rcx, cy: rcy, qx: rqx, qy: rqy };
    ev.rcost = rc; ev.cost = cost + wRev * rc;
  }
  return ev;
}

/* ───────────────────────── Levenberg–Marquardt ───────────────────────── */
// Resuelve (A + diag) x = g con Cholesky en banda (bw = ancho de banda; bw ≥ P−1 = denso).
function cholSolve(A, g, P, bw) {
  const x = new Float64Array(P);
  for (let k = 0; k < P; k++) {
    const j0 = max(0, k - bw);
    let s = A[k * P + k];
    for (let j = j0; j < k; j++) s -= A[k * P + j] * A[k * P + j];
    if (!(s > 1e-14)) return null;
    const d = sqrt(s); A[k * P + k] = d;
    const i1 = min(P - 1, k + bw);
    for (let i = k + 1; i <= i1; i++) {
      let v = A[i * P + k];
      for (let j = max(0, i - bw); j < k; j++) v -= A[i * P + j] * A[k * P + j];
      A[i * P + k] = v / d;
    }
  }
  for (let i = 0; i < P; i++) {            // L y = g
    let v = g[i];
    for (let j = max(0, i - bw); j < i; j++) v -= A[i * P + j] * x[j];
    x[i] = v / A[i * P + i];
  }
  for (let i = P - 1; i >= 0; i--) {       // Lᵀ x = y
    let v = x[i];
    for (let j = i + 1, j1 = min(P - 1, i + bw); j <= j1; j++) v -= A[j * P + i] * x[j];
    x[i] = v / A[i * P + i];
  }
  return x;
}

// Jacobiano de un punto de la curva respecto a los parámetros (nodos vecinos y radio) a parámetro de pie FIJO.
// t: línea → distancia desde el nodo de partida del tramo · cuadrática → 0…1.  Deja en _PJ los resultados (sin reservar memoria).
const _PJ = { nodes: [0, 0, 0], J: [new Float64Array(4), new Float64Array(4), new Float64Array(4)], Jr: new Float64Array(2), nN: 0, hasRho: false, tx: 0, ty: 0 };
function pieceJac(pc, t) {
  const J = _PJ.J, nodes = _PJ.nodes;
  if (pc.k === 0) {
    const d = pc.d, l = t, vx = pc.vx, vy = pc.vy;
    _PJ.tx = vx; _PJ.ty = vy;
    // C = N_a + l·v  →  ∂C/∂N_a = I − (l/d)(I − vvᵀ),  ∂C/∂N_b = (l/d)(I − vvᵀ)
    const pxx = (1 - vx * vx) / d, pxy = -vx * vy / d, pyy = (1 - vy * vy) / d;
    nodes[0] = pc.a; nodes[1] = pc.b; _PJ.nN = 2; _PJ.hasRho = false;
    let m = J[0]; m[0] = 1 - l * pxx; m[1] = -l * pxy; m[2] = -l * pxy; m[3] = 1 - l * pyy;
    m = J[1]; m[0] = l * pxx; m[1] = l * pxy; m[2] = l * pxy; m[3] = l * pyy;
    return;
  }
  const s = 1 - t, aa = s * s, bb = t * t, r = pc.r, ux = pc.ux, uy = pc.uy, vx = pc.vx, vy = pc.vy;
  const wx = -aa * ux + bb * vx, wy = -aa * uy + bb * vy;
  const sx = s * ux + t * vx, sy = s * uy + t * vy, sl = sqrt(sx * sx + sy * sy);
  if (sl > 1e-9) { _PJ.tx = sx / sl; _PJ.ty = sy / sl; } else { _PJ.tx = -uy; _PJ.ty = ux; }
  const pux = (1 - ux * ux) / pc.din, puxy = -ux * uy / pc.din, puy = (1 - uy * uy) / pc.din;
  const pvx = (1 - vx * vx) / pc.dout, pvxy = -vx * vy / pc.dout, pvy = (1 - vy * vy) / pc.dout;
  // dr/dN según qué recorte manda
  let dri0 = 0, dri1 = 0, dra0 = 0, dra1 = 0, drb0 = 0, drb1 = 0;
  if (pc.cm === 1) { dri0 = ux / 2; dri1 = uy / 2; dra0 = -ux / 2; dra1 = -uy / 2; }
  else if (pc.cm === 2) { dri0 = -vx / 2; dri1 = -vy / 2; drb0 = vx / 2; drb1 = vy / 2; }
  nodes[0] = pc.a; nodes[1] = pc.i; nodes[2] = pc.b; _PJ.nN = 3;
  let m = J[0];   // N_{i−1}
  m[0] = r * aa * pux + wx * dra0; m[1] = r * aa * puxy + wx * dra1; m[2] = r * aa * puxy + wy * dra0; m[3] = r * aa * puy + wy * dra1;
  m = J[1];       // N_i
  m[0] = 1 - r * aa * pux - r * bb * pvx + wx * dri0; m[1] = -r * aa * puxy - r * bb * pvxy + wx * dri1;
  m[2] = -r * aa * puxy - r * bb * pvxy + wy * dri0;  m[3] = 1 - r * aa * puy - r * bb * pvy + wy * dri1;
  m = J[2];       // N_{i+1}
  m[0] = r * bb * pvx + wx * drb0; m[1] = r * bb * pvxy + wx * drb1; m[2] = r * bb * pvxy + wy * drb0; m[3] = r * bb * pvy + wy * drb1;
  if (pc.cm === 0) { _PJ.hasRho = true; _PJ.Jr[0] = wx; _PJ.Jr[1] = wy; } else _PJ.hasRho = false;
}

// Monta las ecuaciones normales del paso (JᵀJ δ = Jᵀ e): filas «normal» y «tangente» de cada punto del trazo + fila «normal» de cada
// muestra de la curva (curva→trazo, peso wRev).
function assemble(ch, D, ev, o) {
  const K = ch.K;
  const pb = new Int32Array(K).fill(-1);
  let P = 0;
  for (let i = 0; i < K; i++) if (!ch.fixed[i]) { pb[i] = P; P += 3; }
  if (!P) return null;
  const A = new Float64Array(P * P), g = new Float64Array(P);
  const wt2 = o.wTan * o.wTan, wRev = o.wRev || 0;
  const ix = new Int32Array(8), vl = new Float64Array(8);
  const addRow = (qx, qy, w2, rhs) => {
    const J = _PJ.J, nodes = _PJ.nodes;
    let c = 0;
    for (let n = 0; n < _PJ.nN; n++) {
      const base = pb[nodes[n]];
      if (base < 0) continue;
      const m = J[n];
      ix[c] = base;     vl[c++] = qx * m[0] + qy * m[2];
      ix[c] = base + 1; vl[c++] = qx * m[1] + qy * m[3];
      if (n === 1 && _PJ.hasRho) { ix[c] = base + 2; vl[c++] = qx * _PJ.Jr[0] + qy * _PJ.Jr[1]; }
    }
    for (let a = 0; a < c; a++) {
      const va = vl[a] * w2, ia = ix[a];
      g[ia] += va * rhs;
      for (let b = 0; b <= a; b++) {
        const ib = ix[b];
        if (ib <= ia) A[ia * P + ib] += va * vl[b]; else A[ib * P + ia] += va * vl[b];
      }
    }
  };
  for (let j = 0; j < D.length; j++) {
    const pc = ev.pcs[ev.pi[j]];
    pieceJac(pc, ev.pt[j]);
    const ex = D[j].x - ev.cx[j], ey = D[j].y - ev.cy[j], tx = _PJ.tx, ty = _PJ.ty;
    addRow(-ty, tx, 1, -ty * ex + tx * ey);       // normal
    addRow(tx, ty, wt2, tx * ex + ty * ey);       // tangente (peso pequeño: estabiliza)
  }
  if (ev.rs && wRev > 0) {
    const rs = ev.rs;
    for (let z = 0; z < rs.n; z++) {
      const pc = ev.pcs[rs.p[z]];
      pieceJac(pc, rs.t[z]);
      let nx = rs.cx[z] - rs.qx[z], ny = rs.cy[z] - rs.qy[z];
      const dl = sqrt(nx * nx + ny * ny);
      if (dl > 1e-6) { nx /= dl; ny /= dl; } else { nx = -_PJ.ty; ny = _PJ.tx; }
      addRow(nx, ny, wRev, -dl);                  // objetivo: que la distancia a la polilínea del trazo sea 0
    }
  }
  // Rigidez a lo largo de la curva: la posición tangencial de un nodo apenas cambia la curva (dirección casi singular) y, sin esto, los
  // nodos se deslizan y se amontonan. Se penaliza el desplazamiento tangencial (término proximal), el normal queda libre.
  const wn2 = o.wNode || 0;
  if (wn2 > 0) {
    for (let i = 0; i < K; i++) {
      const b = pb[i]; if (b < 0) continue;
      const a = ch.closed ? (i - 1 + K) % K : max(0, i - 1), c = ch.closed ? (i + 1) % K : min(K - 1, i + 1);
      let tx = ch.X[c] - ch.X[a], ty = ch.Y[c] - ch.Y[a]; const tl = sqrt(tx * tx + ty * ty) || 1; tx /= tl; ty /= tl;
      A[b * P + b] += wn2 * tx * tx; A[(b + 1) * P + b] += wn2 * tx * ty; A[(b + 1) * P + b + 1] += wn2 * ty * ty;
    }
  }
  return { P, pb, A, g, bw: ch.closed ? P : 8 };
}

// Un paso: resuelve con amortiguación mu y devuelve la cadena nueva (o null si es inviable).
function stepChain(ch, sys, mu, o) {
  const { P, pb, A, g, bw } = sys;
  const B = new Float64Array(A);
  let tr = 0;
  for (let i = 0; i < P; i++) tr += A[i * P + i];
  const lam = 1e-9 + 1e-7 * tr / P;
  for (let i = 0; i < P; i++) B[i * P + i] += mu * A[i * P + i] + lam;
  const x = cholSolve(B, g, P, bw);
  if (!x) return null;
  const K = ch.K, nc = cloneChain(ch);
  // límite de paso: ningún nodo se desplaza más de una fracción del tramo corto vecino
  const L = segLens(ch);
  let scale = 1;
  for (let i = 0; i < K; i++) {
    const b = pb[i]; if (b < 0) continue;
    const dl = sqrt(x[b] * x[b] + x[b + 1] * x[b + 1]);
    const near = ch.closed ? min(L[(i - 1 + K) % K], L[i]) : min(i > 0 ? L[i - 1] : Infinity, i < K - 1 ? L[i] : Infinity);
    const lim = max(2.5, 0.5 * near);
    if (dl > lim) scale = min(scale, lim / dl);
  }
  for (let i = 0; i < K; i++) {
    const b = pb[i]; if (b < 0) continue;
    nc.X[i] += x[b] * scale; nc.Y[i] += x[b + 1] * scale;
    let r = nc.R[i] + x[b + 2] * scale;
    nc.R[i] = r < o.rMin ? o.rMin : r > o.rCap ? o.rCap : r;
    if (!isFinite(nc.X[i]) || !isFinite(nc.Y[i]) || !isFinite(nc.R[i])) return null;
  }
  // tramos degenerados
  const L2 = segLens(nc), minSeg = 3.0;
  for (let s = 0; s < L2.length; s++) if (L2[s] < minSeg) return null;
  // el radio pedido no puede quedarse por encima de lo que el recorte deja usar (si no, deriva sin efecto)
  const eff = effRadii(nc, L2);
  for (let i = 0; i < K; i++) if (!nc.fixed[i] && nc.R[i] > eff[i]) nc.R[i] = max(eff[i], o.rMin);
  return nc;
}

// Varias iteraciones de LM sobre la cadena. Devuelve { ch, ev }.
function refine(ch, D, o, maxIter, deadline, stopErr, G) {
  let ev = evaluate(ch, D, G, o.wRev), mu = 1e-3, calm = 0;
  for (let it = 0; it < maxIter; it++) {
    if (now() > deadline) break;
    if (stopErr && ev.maxErr <= stopErr) break;
    const sys = assemble(ch, D, ev, o);
    if (!sys) break;
    let ok = false;
    for (let tries = 0; tries < 7; tries++) {
      const nc = stepChain(ch, sys, mu, o);
      if (!nc) { mu *= 5; continue; }
      const ev2 = evaluate(nc, D, G, o.wRev);
      if (ev2.cost < ev.cost * (1 - 1e-6) - 1e-12) {
        const rel = (ev.cost - ev2.cost) / (ev.cost + 1e-12);
        ch = nc; ev = ev2; ok = true; mu = max(mu / 4, 1e-7);
        calm = rel < 2e-3 ? calm + 1 : 0;
        break;
      }
      mu *= 5;
    }
    if (!ok || calm >= 3) break;
  }
  return { ch, ev };
}

/* ───────────────────────── ajuste de un tramo (abierto con extremos fijos, o cerrado periódico) ───────────────────────── */
function insertNode(ch, pos, x, y, R, anchor) {
  ch.X.splice(pos, 0, x); ch.Y.splice(pos, 0, y); ch.R.splice(pos, 0, R); ch.A.splice(pos, 0, anchor); ch.fixed.splice(pos, 0, false);
  ch.K++;
}
function limitRadius(ch, i) {   // radio máximo utilizable de un nodo según sus vecinos
  const K = ch.K, pa = ch.closed ? (i - 1 + K) % K : i - 1, nb = ch.closed ? (i + 1) % K : i + 1;
  const din = hypot2(ch.X[i] - ch.X[pa], ch.Y[i] - ch.Y[pa]), dout = hypot2(ch.X[nb] - ch.X[i], ch.Y[nb] - ch.Y[i]);
  return min(din, dout) / 2;
}
function hypot2(a, b) { return sqrt(a * a + b * b); }

function pickInsertions(ch, ev, n, o, gapMin, banned) {
  const err = ev.dist, tol = o.tol, res = [];
  let j = 0;
  while (j < n) {
    if (err[j] <= tol) { j++; continue; }
    let e = j; while (e + 1 < n && err[e + 1] > tol) e++;
    // mejor punto del intervalo que no caiga pegado a un nodo existente
    let bj = -1, be = 0;
    for (let q = j; q <= e; q++) {
      let ok = !(banned && banned.has(q));
      for (let a = 0; ok && a < ch.K; a++) if (abs(ch.A[a] - q) < gapMin) ok = false;
      if (ok && err[q] > be) { be = err[q]; bj = q; }
    }
    if (bj >= 0) res.push({ j: bj, e: be });
    j = e + 1;
  }
  res.sort((a, b) => b.e - a.e);
  const top = res.length ? res[0].e : 0;
  const lim = min(o.maxIns, max(1, Math.floor(ch.K / 4)));   // pocas inserciones por ronda: así el ajuste converge antes de decidir la siguiente
  return res.filter(r => r.e >= 0.75 * top).slice(0, lim);
}

// Cadena inicial: vértices de una simplificación gruesa (Ramer–Douglas–Peucker, ε = o.initEps) — ya están sobre el trazo, así que el ajuste
// arranca en el régimen de errores pequeños (donde Gauss–Newton es fiable) en lugar de en una recta lejana.
function initChain(D, closed, o) {
  const n = D.length;
  const idxOf = (poly) => {   // índices de los vértices del polígono dentro de D (los vértices son puntos de D)
    const out = []; let j = 0;
    for (const v of poly) { while (j < n && (D[j].x !== v.x || D[j].y !== v.y)) j++; if (j < n) { out.push(j); j++; } }
    return out;
  };
  let idx;
  if (!closed) {
    idx = idxOf(rdp(D, o.initEps));
    if (idx.length < 2 || idx[0] !== 0 || idx[idx.length - 1] !== n - 1) idx = [0, n - 1];
  } else {
    idx = idxOf(rdpClosed(D, o.initEps));
    if (idx.length < 4) idx = [0, n >> 2, n >> 1, (3 * n) >> 2];
  }
  const X = idx.map(i => D[i].x), Y = idx.map(i => D[i].y), K = idx.length;
  const fixed = idx.map((_, q) => !closed && (q === 0 || q === K - 1));
  const ch = makeChain(X, Y, new Array(K).fill(0), idx.slice(), fixed, closed);
  for (let i = 0; i < K; i++) if (!fixed[i]) ch.R[i] = min(o.rCap, max(o.rMin, limitRadius(ch, i)));
  return ch;
}

function fitChain(D, closed, o, deadline, info) {
  const n = D.length;
  let ch;
  if (!closed && dist(D[0], D[n - 1]) < 0.75 && n >= 6) {
    // bucle cerrado con una sola esquina: los dos extremos coinciden → arranca con un nodo intermedio
    const m = n >> 1;
    ch = makeChain([D[0].x, D[m].x, D[n - 1].x], [D[0].y, D[m].y, D[n - 1].y], [0, 0, 0], [0, m, n - 1], [true, false, true], false);
    ch.R[1] = min(o.rCap, max(o.rMin, limitRadius(ch, 1)));
  } else ch = initChain(D, closed, o);
  const gapMin = max(2, Math.ceil(4 / o.h));
  const G = buildGrid(D, closed, 3 * o.tol);
  let ev = evaluate(ch, D, G, o.wRev);
  if (closed) { const r = refine(ch, D, o, 25, deadline, o.tol * 0.9, G); ch = r.ch; ev = r.ev; }
  let guard = 0, fails = 0;
  const banned = new Set();
  while (ev.maxErr > o.tol && ch.K < o.maxNodes && now() < deadline && guard++ < 120) {
    const ins = pickInsertions(ch, ev, n, o, gapMin, banned);
    if (!ins.length) break;
    const base = { ch, ev };
    ch = cloneChain(ch);
    // los nodos nuevos entran donde toca según su ancla (orden del trazo)
    ins.sort((a, b) => a.j - b.j);
    for (const it of ins) {
      let pos = 0;
      while (pos < ch.K && ch.A[pos] < it.j) pos++;
      if (!closed) pos = min(max(pos, 1), ch.K - 1);
      // el nodo nace en el punto del trazo, algo desplazado hacia fuera (el empalme redondea y se queda dentro); si el error es grande, poco
      const kx = D[it.j].x - ev.cx[it.j], ky = D[it.j].y - ev.cy[it.j], kl = sqrt(kx * kx + ky * ky) || 1, s = min(0.5, 6 / kl);
      insertNode(ch, pos, D[it.j].x + kx * s, D[it.j].y + ky * s, o.rCap, it.j);
      ch.R[pos] = min(o.rCap, max(o.rMin, limitRadius(ch, pos)));
      const nb = closed ? (pos + 1) % ch.K : pos + 1; if (nb < ch.K) ch.R[nb] = min(ch.R[nb], max(o.rMin, limitRadius(ch, nb)));
    }
    const r = refine(ch, D, o, 25, deadline, o.tol * 0.8, G);
    if (r.ev.cost > base.ev.cost && r.ev.maxErr > base.ev.maxErr) {
      // la inserción, ya convergida, empeora el ajuste (cambio de vuelta, pico espurio…): se deshace y se veta ese punto
      for (const it of ins) banned.add(it.j);
      ch = base.ch; ev = base.ev;
      if (++fails > 6) break;
      continue;
    }
    ch = r.ch; ev = r.ev;
  }
  // pulido final
  if (ev.maxErr <= o.tol && now() < deadline) {
    const r = refine(ch, D, o, 15, deadline, 0, G);
    if (r.ev.maxErr <= o.tol * 1.001 || r.ev.maxErr <= ev.maxErr) { ch = r.ch; ev = r.ev; }
  }
  // poda: menos nodos con la misma fidelidad (solo si el ajuste ya cumple y queda tiempo)
  if (o.prune && ev.maxErr <= o.tol && ch.K > 2 && ch.K <= o.pruneMaxK && now() < deadline) {
    const r = pruneChain(ch, ev, D, G, o, min(deadline, now() + o.pruneFrac * o.timeMs));
    ch = r.ch; ev = r.ev;
  }
  if (info) info.nodes = ch.K;
  return { ch, ev };
}

/* ───────────────────────── poda de nodos ───────────────────────── */
// El ajuste parte de una simplificación gruesa que casi siempre trae nodos de más (un círculo grande sale con 12–16 en vez de 6–8).
// Se prueba a QUITAR nodos —primero los que menos daño hacen— y se reajusta el resto: un grupo de nodos se queda fuera si el trazo sigue a
// menos de pruneErr·tol de la curva (y la curva a menos de tol del trazo). Es lo que hacen los editores con su «fidelidad»: menos nodos
// = objeto más fácil de editar después.
function removeNodes(ch, drop) {
  const keep = []; for (let i = 0; i < ch.K; i++) if (!drop.has(i)) keep.push(i);
  const c = { K: keep.length, X: keep.map(i => ch.X[i]), Y: keep.map(i => ch.Y[i]), R: keep.map(i => ch.R[i]), A: keep.map(i => ch.A[i]), fixed: keep.map(i => ch.fixed[i]), closed: ch.closed };
  // los vecinos de lo quitado heredan tramos más largos: sus radios pueden crecer hasta lo que ahora permiten
  for (let q = 0; q < c.K; q++) {
    const prevDropped = drop.has(keep[q] - 1) || (ch.closed && keep[q] === 0 && drop.has(ch.K - 1));
    const nextDropped = drop.has(keep[q] + 1) || (ch.closed && keep[q] === ch.K - 1 && drop.has(0));
    if (!c.fixed[q] && (prevDropped || nextDropped)) c.R[q] = min(c.R[q] * 1.6 + 0.5, max(c.R[q], limitRadius(c, q)));
  }
  return c;
}
function revMax(ev) {
  const r = ev.rs; if (!r) return 0;
  let m = 0;
  for (let z = 0; z < r.n; z++) { const dx = r.cx[z] - r.qx[z], dy = r.cy[z] - r.qy[z], d = dx * dx + dy * dy; if (d > m) m = d; }
  return sqrt(m);
}
function pruneChain(ch0, ev0, D, G, o, end) {
  let ch = ch0, ev = ev0;
  const goal = o.pruneErr * o.tol, minK = ch.closed ? 3 : 2;
  let free = 0; for (let i = 0; i < ch.K; i++) if (!ch.fixed[i]) free++;
  let m = max(1, Math.floor(free / 2));
  let guard = 0;
  while (ch.K > minK && free > 0 && now() < end && guard++ < 40) {
    // orden de menor a mayor daño: área del triángulo que forma cada nodo con sus vecinos (criterio de Visvalingam–Whyatt, 1993)
    const K = ch.K, rank = [];
    for (let i = 0; i < K; i++) {
      if (ch.fixed[i]) continue;
      const a = ch.closed ? (i - 1 + K) % K : i - 1, b = ch.closed ? (i + 1) % K : i + 1;
      if (a < 0 || b >= K) continue;
      rank.push({ i, f: abs((ch.X[i] - ch.X[a]) * (ch.Y[b] - ch.Y[a]) - (ch.X[b] - ch.X[a]) * (ch.Y[i] - ch.Y[a])) / 2 });
    }
    if (!rank.length) break;
    rank.sort((p, q) => p.f - q.f || p.i - q.i);
    const tryDrop = (idxs) => {
      const c2 = removeNodes(ch, new Set(idxs));
      if (c2.K < minK) return null;
      const r = refine(c2, D, o, o.pruneIter, end, goal * 0.75, G);
      return (r.ev.maxErr <= goal && revMax(r.ev) <= o.tol) ? r : null;
    };
    // grupo de m nodos no contiguos
    const pick = [];
    for (const c of rank) {
      if (pick.length >= m) break;
      let adj = false;
      for (const p of pick) { const d = abs(p - c.i); if (d === 1 || (ch.closed && d === K - 1)) { adj = true; break; } }
      if (!adj) pick.push(c.i);
    }
    let r = tryDrop(pick);
    if (!r && m === 1) {   // a un solo nodo: se prueba el siguiente de la lista antes de rendirse
      for (let q = 1; q < min(2, rank.length) && !r && now() < end; q++) r = tryDrop([rank[q].i]);
      if (!r) break;
    }
    if (r) {
      ch = r.ch; ev = r.ev; free -= pick.length;
      if (m > 1) m = min(m, max(1, Math.floor(free / 2)));
    } else m = Math.floor(m / 2);
  }
  return { ch, ev };
}

/* ───────────────────────── esquinas y cierre ───────────────────────── */
// Esquinas: giros que NO crecen al ampliar la escala. En una curva el giro es proporcional a la escala (arco/radio); en una esquina el
// giro se «aplana» en cuanto la ventana la abarca. Se mide con ventanas de w, 2w y 3w muestras (w ≈ 7 px).
function detectCorners(S, closed, h, o) {
  const n = S.length;
  const w = max(2, Math.round(max(o.cornerWin, 3.5 * o.tol) / h));
  const wrap = (i) => ((i % n) + n) % n;
  const lo = closed ? 0 : w, hi = closed ? n - 1 : n - 1 - w;
  if (hi < lo) return [];
  const at = (i, s) => {
    if (closed) return turnAngle(S[wrap(i - s)], S[i], S[wrap(i + s)]);
    const ss = min(s, i, n - 1 - i);
    return ss >= 1 ? turnAngle(S[i - ss], S[i], S[i + ss]) : 0;
  };
  const a2 = new Float64Array(n);
  for (let i = lo; i <= hi; i++) a2[i] = at(i, 2 * w);
  const thr = o.cornerDeg * Math.PI / 180, ten = 8 * Math.PI / 180;
  const cand = [];
  for (let i = lo; i <= hi; i++) {
    if (a2[i] < thr) continue;
    let isMax = true;
    for (let k = -w; k <= w && isMax; k++) {
      if (k === 0) continue;
      const jj = closed ? wrap(i + k) : i + k;
      if (jj < lo || jj > hi) continue;
      if (a2[jj] > a2[i] || (a2[jj] === a2[i] && k < 0)) isMax = false;
    }
    if (!isMax) continue;
    if (at(i, 3 * w) > 1.25 * a2[i] + ten) continue;   // el giro sigue creciendo con la escala → curva cerrada, no esquina
    cand.push({ i, a: a2[i] });
  }
  // separación mínima entre esquinas: gana la más marcada
  const sep = Math.round(1.5 * w);
  cand.sort((a, b) => b.a - a.a);
  const kept = [];
  for (const c of cand) {
    let ok = true;
    for (const k of kept) {
      let d = abs(k.i - c.i); if (closed) d = min(d, n - d);
      if (d < sep) { ok = false; break; }
    }
    if (ok) kept.push(c);
  }
  return kept.map(k => k.i).sort((a, b) => a - b);
}

// Recta de mínimos cuadrados totales por un tramo de puntos → {cx,cy,dx,dy}
function lineFit(pts) {
  let mx = 0, my = 0; for (const p of pts) { mx += p.x; my += p.y; } mx /= pts.length; my /= pts.length;
  let sxx = 0, sxy = 0, syy = 0; for (const p of pts) { const x = p.x - mx, y = p.y - my; sxx += x * x; sxy += x * y; syy += y * y; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), dx = Math.cos(th), dy = Math.sin(th);
  let ss = 0; for (const p of pts) { const e = (p.x - mx) * -dy + (p.y - my) * dx; ss += e * e; }
  return { cx: mx, cy: my, dx, dy, rms: sqrt(ss / pts.length) };
}
// Posición exacta de una esquina. Candidatos: el cruce de las rectas que siguen los dos lados y los vértices del trazo crudo junto a la
// esquina. Gana el que mejor explica los puntos crudos de la zona (menor distancia máxima a la poligonal  lado → candidato → lado):
// así una esquina viva queda en su vértice, una punta fina en su extremo real y una esquina redondeada en el vértice más cercano.
function cornerApex(S1, ci, w, closed, prevC, nextC, P, o) {
  const n = S1.length, wrap = (i) => ((i % n) + n) % n;
  const idx = (i) => closed ? wrap(i) : i;
  const inside = (i) => closed || (i >= 0 && i < n);
  // tramos de datos a cada lado, sin invadir la esquina vecina
  const L = [], R = [];
  const halfL = prevC == null ? 3 * w : min(3 * w, Math.floor(((closed ? (ci - prevC + n) % n : ci - prevC)) / 2));
  const halfR = nextC == null ? 3 * w : min(3 * w, Math.floor(((closed ? (nextC - ci + n) % n : nextC - ci)) / 2));
  for (let q = w; q <= halfL; q++) { if (!inside(ci - q)) break; L.push(S1[idx(ci - q)]); }
  for (let q = w; q <= halfR; q++) { if (!inside(ci + q)) break; R.push(S1[idx(ci + q)]); }
  const c0 = S1[ci];
  const zone = [], cand = [];
  const cr = 1.5 * w * o.h;
  for (let q = 0; q < P.length; q++) {
    const p = P[q];
    if (abs(p.x - c0.x) > cr || abs(p.y - c0.y) > cr) continue;
    const d = dist(p, c0);
    if (d <= cr) { zone.push(p); if (cand.length < 30) cand.push(p); }
  }
  let X = null;
  if (L.length >= 3 && R.length >= 3) {
    const l1 = lineFit(L), l2 = lineFit(R);
    const den = l1.dx * l2.dy - l1.dy * l2.dx;
    if (abs(den) > 0.2) {
      const t = ((l2.cx - l1.cx) * l2.dy - (l2.cy - l1.cy) * l2.dx) / den;
      const C = { x: l1.cx + t * l1.dx, y: l1.cy + t * l1.dy };
      if (dist(C, c0) <= cr) {
        // el cruce solo vale si el trazo real pasa por él. Un muestreo disperso recorta una esquina con UNA cuerda larga c: para un giro φ el
        // recorte máximo es (c/2)·tan(φ/2); si el cruce queda más lejos que eso del trazo, el pico real es redondeado y el cruce sobresale.
        const vin = { x: L[0].x - L[L.length - 1].x, y: L[0].y - L[L.length - 1].y }, vout = { x: R[R.length - 1].x - R[0].x, y: R[R.length - 1].y - R[0].y };
        const phi = turnAngle({ x: -vin.x, y: -vin.y }, { x: 0, y: 0 }, vout), tanH = Math.tan(min(phi, 3.0) / 2);
        let near = Infinity, chord = 0;
        for (let q = 0; q + 1 < P.length; q++) {
          const a = P[q], b = P[q + 1];
          if (abs(a.x - c0.x) > 3 * w * o.h && abs(b.x - c0.x) > 3 * w * o.h) continue;
          const dx = b.x - a.x, dy = b.y - a.y, l2s = dx * dx + dy * dy;
          let t2 = l2s > 0 ? ((C.x - a.x) * dx + (C.y - a.y) * dy) / l2s : 0; t2 = t2 < 0 ? 0 : t2 > 1 ? 1 : t2;
          const d = Math.hypot(a.x + t2 * dx - C.x, a.y + t2 * dy - C.y);
          if (d < near) { near = d; chord = sqrt(l2s); }
        }
        // lados rectos → el recorte de la cuerda es creíble y se admite hasta 2,6·tol; lados curvos → el pico real es redondeado (máx. 1,2·tol)
        const straight = max(l1.rms, l2.rms) <= 0.4 * o.tol;
        const allow = min(max(1.2 * o.tol, 0.575 * tanH * chord), straight ? 2.6 * o.tol : 1.2 * o.tol);
        if (near <= allow) X = C;
      }
    }
  }
  if (!cand.length && !X) return { x: c0.x, y: c0.y, cost: Infinity };
  const Af = L.length ? L[L.length - 1] : S1[idx(max(0, ci - 2 * w))], Bf = R.length ? R[R.length - 1] : S1[idx(min(n - 1, ci + 2 * w))];
  const cost = (C) => {
    let m = 0;
    for (const p of zone) {
      const d = min(distSeg(p.x, p.y, Af, C), distSeg(p.x, p.y, C, Bf));
      if (d > m) m = d;
    }
    return m;
  };
  let bestV = null, bcV = Infinity;
  for (const c of cand) { const cc = cost(c); if (cc < bcV) { bcV = cc; bestV = c; } }
  if (X) { const cx = cost(X); if (!bestV || cx <= bcV + 0.3 * o.tol) return { x: X.x, y: X.y, cost: cx }; }
  return { x: bestV.x, y: bestV.y, cost: bcV };
}
function distSeg(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(a.x + t * dx - px, a.y + t * dy - py);
}

// Suavizado ligero [¼ ½ ¼]; los índices de `pin` (y los extremos de un abierto) no se mueven.
function smoothPath(P, closed, passes, pin) {
  let cur = P;
  for (let k = 0; k < passes; k++) {
    const n = cur.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      if ((!closed && (i === 0 || i === n - 1)) || (pin && pin.has(i))) { out[i] = cur[i]; continue; }
      const a = cur[(i - 1 + n) % n], b = cur[i], c = cur[(i + 1) % n];
      out[i] = { x: 0.25 * a.x + 0.5 * b.x + 0.25 * c.x, y: 0.25 * a.y + 0.5 * b.y + 0.25 * c.y };
    }
    cur = out;
  }
  return cur;
}

function decideClosed(S, L, o) {
  const m = S.length - 1;
  if (!o.allowClose || m < 12) return null;
  const closeMax = min(o.closeDist, o.closeFrac * L);
  const gap = dist(S[0], S[m]);
  if (gap <= closeMax && polyArea(S) / (L * L) >= o.closeArea) return { S, trimmed: 0 };
  // el usuario se pasó de vuelta: el final solapa el principio → se recorta el solape
  const tr = max(3, Math.floor(o.closeFrac * m));   // el solape que se recorta es pequeño (≤ closeFrac del trazo por cada extremo)
  const iMax = tr, jMin = m - tr;
  let bd = Infinity;
  for (let i = 0; i <= iMax; i++) for (let j = jMin; j <= m; j++) { const d = dist(S[i], S[j]); if (d < bd) bd = d; }
  if (bd > closeMax * 0.6) return null;
  let bi = -1, bj = -1, bt = Infinity;
  for (let i = 0; i <= iMax; i++) for (let j = jMin; j <= m; j++) {
    if (dist(S[i], S[j]) > max(bd * 1.25, o.tol)) continue;
    const trimmed = i + (m - j);
    if (trimmed < bt) { bt = trimmed; bi = i; bj = j; }
  }
  if (bi < 0) return null;
  const T = S.slice(bi, bj + 1);
  if (T.length < 12 || polyArea(T) / (pathLen(T) ** 2) < o.closeArea) return null;
  return { S: T, trimmed: bt };
}

/* ───────────────────────── tubería completa ───────────────────────── */
// Radios «máximos» para los vértices suaves de una polilínea (la curva que se dibuja los recorta a media longitud de tramo).
function smoothRadii(poly, closed, o) {
  const n = poly.length, R = new Array(n).fill(0), thr = o.cornerDeg * Math.PI / 180;
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const a = poly[(i - 1 + n) % n], c = poly[(i + 1) % n];
    R[i] = turnAngle(a, poly[i], c) >= thr ? 0 : o.rCap;
  }
  return R;
}
function effOf(poly, R, closed) {
  const ch = makeChain(poly.map(p => p.x), poly.map(p => p.y), R.slice(), poly.map((_, i) => i), poly.map(() => false), closed);
  return Array.from(effRadii(ch, segLens(ch)));
}

function fit(raw0, opts) {
  const u = Object.assign({}, DEF, opts || {});
  if (!raw0 || raw0.length < 2) return null;
  const raw = raw0.filter(p => p && isFinite(p.x) && isFinite(p.y));   // un NaN/Infinity suelto no debe tumbar el ajuste
  if (raw.length < 2) return null;
  const t0 = now(), deadline = t0 + u.timeMs;
  // Las constantes internas están ajustadas para tol = 2: se trabaja en una escala interna k = tol/2 (en el editor, tol = 2 px de PANTALLA
  // expresados en px de página, así que el ajuste se ve igual con cualquier zoom). rCap es absoluto (px de página) y se escala a parte.
  const tolU = u.tol > 0 ? u.tol : 2, k = tolU / 2, ik = 1 / k;
  const o = Object.assign({}, u, { tol: 2.0, rCap: u.rCap * ik });
  const P = dedupe(raw.map(p => ({ x: p.x * ik, y: p.y * ik })), 0.2);
  if (P.length < 2) return null;
  const Ltot = pathLen(P);
  if (Ltot < o.minLength) return null;
  const h = max(o.step, Ltot / o.maxSamples);
  o.h = h;
  let S = resample(P, h);
  if (S.length < 2) return null;

  // — ¿cerrado? —
  let closed = false, trimmed = 0;
  const dc = decideClosed(S, pathLen(S), o);
  if (dc) {
    closed = true; S = dc.S; trimmed = dc.trimmed;
    // el último punto cae junto al primero: se quita el duplicado (el cierre es el propio polígono)
    if (dist(S[0], S[S.length - 1]) < 0.5 * h && S.length > 3) S = S.slice(0, S.length - 1);
  }

  const info = { runs: 0, corners: 0, closedTrimmed: trimmed };
  let nodes = [], radii = [];
  let fallback = 0;

  // — esquinas (con el nodo colocado en el vértice real) y suavizado del ruido —
  const S1 = o.smooth > 0 ? smoothPath(S, closed, 1) : S;
  const cand0 = S.length >= 7 ? detectCorners(S1, closed, h, o) : [];
  const wC = max(2, Math.round(max(o.cornerWin, 3.5 * o.tol) / h));
  const apexAll = cand0.map((ci, q) => cornerApex(S1, ci, wC, closed, q > 0 ? cand0[q - 1] : (closed && cand0.length > 1 ? cand0[cand0.length - 1] : null),
    q + 1 < cand0.length ? cand0[q + 1] : (closed && cand0.length > 1 ? cand0[0] : null), P, o));
  // una esquina es de verdad si un vértice vivo explica los puntos crudos de su entorno; si no (extremo de elipse, pico redondeado…), la
  // curva suave con un nodo curvado lo reproduce mejor
  const corners = [], apexes = [];
  cand0.forEach((ci, q) => { if (apexAll[q].cost <= 1.1 * o.tol) { corners.push(ci); apexes.push(apexAll[q]); } });
  info.corners = corners.length; info.cornerCand = cand0.length;
  const pin = new Set(corners);
  const Sx = S.slice(); corners.forEach((ci, q) => { Sx[ci] = { x: apexes[q].x, y: apexes[q].y }; });
  S = o.smooth > 0 ? smoothPath(Sx, closed, o.smooth, pin) : Sx;   // los datos del ajuste (y de la comprobación) son estos

  const runFit = (D) => {   // tramo abierto con extremos fijos
    info.runs++;
    if (D.length <= 2) return { X: [D[0].x, D[D.length - 1].x], Y: [D[0].y, D[D.length - 1].y], R: [0, 0] };
    const r = fitChain(D, false, o, deadline, null);
    return { X: r.ch.X, Y: r.ch.Y, R: Array.from(effRadii(r.ch, segLens(r.ch))) };
  };

  if (!closed) {
    const cuts = [0].concat(corners, [S.length - 1]);
    for (let q = 0; q + 1 < cuts.length; q++) {
      const r = runFit(S.slice(cuts[q], cuts[q + 1] + 1));
      for (let i = (q === 0 ? 0 : 1); i < r.X.length; i++) { nodes.push({ x: r.X[i], y: r.Y[i] }); radii.push(r.R[i]); }
    }
  } else if (!corners.length) {
    const r = fitChain(S, true, o, deadline, null);
    info.runs = 1;
    const eff = effRadii(r.ch, segLens(r.ch));
    for (let i = 0; i < r.ch.K; i++) { nodes.push({ x: r.ch.X[i], y: r.ch.Y[i] }); radii.push(eff[i]); }
  } else {
    // cerrado con esquinas: se parte en tramos entre esquinas (recorrido cíclico)
    const n = S.length;
    for (let q = 0; q < corners.length; q++) {
      const a = corners[q], b = corners[(q + 1) % corners.length];
      const D = [];
      let i = a;
      for (;;) { D.push(S[i]); if (i === b && D.length > 1) break; i = (i + 1) % n; if (D.length > n + 1) break; }
      const r = runFit(D);
      for (let z = 0; z < r.X.length - 1; z++) { nodes.push({ x: r.X[z], y: r.Y[z] }); radii.push(r.R[z]); }
    }
  }

  // — comprobación contra la curva EXACTA del editor (trazo→curva y curva→trazo), ya con los radios pequeños a 0 —
  const snapR = (arr) => arr.map(r => r < 0.75 ? 0 : r);
  radii = snapR(radii);
  const okFit = (c) => c.fwd <= o.tol * 1.4 && c.rev <= o.tol * 1.5;
  let chk = nodes.length >= 2 ? verify(nodes, radii, closed, S, o) : { fwd: Infinity, rev: Infinity };
  info.pre = { K: nodes.length, fwd: chk.fwd * k, rev: chk.rev * k };
  if (!okFit(chk)) {
    // el ajuste no ha llegado (tiempo, nodos máximos): polilínea simplificada con la mayor suavidad que sigue cumpliendo
    fallback = 1;
    const poly = closed ? rdpClosed(S, o.tol * 0.6) : rdp(S, o.tol * 0.6);
    const R0 = smoothRadii(poly, closed, o), R1 = effOf(poly, R0, closed);
    nodes = poly.map(p => ({ x: p.x, y: p.y })); radii = snapR(R1);
    chk = verify(nodes, radii, closed, S, o);
    if (!okFit(chk)) { fallback = 2; radii = radii.map(() => 0); chk = verify(nodes, radii, closed, S, o); }
  }

  // — red de seguridad estructural contra el trazo CRUDO (holgada: el ruido del puntero y el suavizado no deben dispararla) —
  if (fallback < 2) {
    const cr = verify(nodes, radii, closed, P, o);
    if (cr.fwd > 2.5 * o.tol || cr.rev > 2.5 * o.tol) {
      fallback = 3;
      const poly = closed ? rdpClosed(P, o.tol * 0.6) : rdp(P, o.tol * 0.6);
      nodes = poly.map(p => ({ x: p.x, y: p.y })); radii = nodes.map(() => 0);
      chk = verify(nodes, radii, closed, P, o);
    }
  }

  // — salida en las unidades de entrada —
  const outNodes = nodes.map(p => ({ x: Math.round(p.x * k * 100) / 100, y: Math.round(p.y * k * 100) / 100 }));
  const outRadii = radii.map(r => r > 0 ? Math.round(r * k * 10) / 10 : 0);
  return { nodes: outNodes, radii: outRadii, closed, maxErr: chk.fwd * k, maxErrRev: chk.rev * k, K: outNodes.length, ms: now() - t0, fallback, info, samples: S.length };
}

// Distancias máximas trazo→curva y curva→trazo con la curva EXACTA del modelo.
function verify(nodes, radii, closed, S, o) {
  if (nodes.length < 2) return { fwd: Infinity, rev: Infinity };
  const ch = makeChain(nodes.map(p => p.x), nodes.map(p => p.y), radii.slice(), nodes.map((_, i) => i), nodes.map(() => false), closed);
  const ev = evaluate(ch, S);
  const pts = curvePointsChain(ch, max(1, o.tol / 2)), G = buildGrid(S, closed, 3 * o.tol);
  let rev = 0;
  for (const p of pts) { nearestOnGrid(G, p.x, p.y); if (_gd2 > rev) rev = _gd2; }
  return { fwd: ev.maxErr, rev: sqrt(rev) };
}
function curvePointsChain(ch, step) {
  const bp = buildPieces(ch), out = [];
  for (const pc of bp.pcs) {
    if (pc.k === 0) {
      const n = max(1, Math.ceil(pc.len / step));
      for (let q = 0; q <= n; q++) { const t = q / n; out.push({ x: pc.ax + (pc.bx - pc.ax) * t, y: pc.ay + (pc.by - pc.ay) * t }); }
    } else {
      const n = max(6, Math.ceil(pc.r * 3 / step));
      for (let q = 0; q <= n; q++) {
        const t = q / n, s = 1 - t;
        out.push({ x: s * s * pc.p1x + 2 * s * t * pc.nx + t * t * pc.p2x, y: s * s * pc.p1y + 2 * s * t * pc.ny + t * t * pc.p2y });
      }
    }
  }
  return out;
}
function curvePoints(nodes, radii, closed, step) {
  const ch = makeChain(nodes.map(p => p.x), nodes.map(p => p.y), radii.slice(), nodes.map((_, i) => i), nodes.map(() => false), !!closed);
  return curvePointsChain(ch, step || 1);
}

// Ramer–Douglas–Peucker (respaldo)
function rdp(P, eps) {
  if (P.length < 3) return P.slice();
  const a = P[0], b = P[P.length - 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let bd = 0, bi = 0;
  for (let i = 1; i < P.length - 1; i++) {
    let t = l2 > 0 ? ((P[i].x - a.x) * dx + (P[i].y - a.y) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = a.x + t * dx - P[i].x, ey = a.y + t * dy - P[i].y, d = sqrt(ex * ex + ey * ey);
    if (d > bd) { bd = d; bi = i; }
  }
  if (bd <= eps) return [a, b];
  return rdp(P.slice(0, bi + 1), eps).slice(0, -1).concat(rdp(P.slice(bi), eps));
}
function rdpClosed(P, eps) {
  // se parte por el punto más alejado del primero para que ningún vértice «obligatorio» quede en el corte
  let bi = 0, bd = 0;
  for (let i = 1; i < P.length; i++) { const d = dist(P[0], P[i]); if (d > bd) { bd = d; bi = i; } }
  const A = rdp(P.slice(0, bi + 1), eps), B = rdp(P.slice(bi).concat([P[0]]), eps);
  return A.slice(0, -1).concat(B.slice(0, -1));
}

const CxFit = { DEFAULTS: DEF, fit, curvePoints, verify, _t: { resample, dedupe, detectCorners, decideClosed, fitChain, evaluate, buildPieces, makeChain, segLens, effRadii, rdp, assemble, stepChain, refine, cholSolve, cloneChain, smoothPath, cornerApex, lineFit, buildGrid } };
if (typeof module !== 'undefined' && module.exports) module.exports = CxFit;
root.CxFit = CxFit;
})(typeof window !== 'undefined' ? window : globalThis);
