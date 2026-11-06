/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
/* ============================================================
   defocus.js — DESENFOQUE DE CAPAS (v42.51)

   Módulo COMÚN del editor (index.html) y del reproductor externo (reader/index.html): un solo sitio decide
   cuánto se desenfoca una capa y cómo, para que el editor, el visor interno, las exportaciones y el lector
   pinten exactamente lo mismo. No lleva código de terceros.

   DATO — layer.defocus = grado 0…100 (0 o ausente = nítido), igual que layer.opacity = 0…1. En las animaciones
   cada fotograma guarda el suyo junto a la opacidad (_frames[fi].defocus) y se interpola igual.
   El grado no depende de la resolución: el radio real (σ de una gaussiana) se mide en píxeles de HOJA (la hoja
   mide 360×780) → grado 100 = σ 40 px de hoja. Al dibujar se multiplica por la escala del lienzo de destino
   (zoom del editor, resolución del lector, exportaciones…) y se ve igual en todos.

   DIBUJO — ctx.filter = 'blur(Npx)' (estándar del lienzo 2D: Chrome/Android, Edge, Firefox). Ojo: ese radio está
   en píxeles del BITMAP; NO se escala con ctx.setTransform (medido en Chromium) → aquí se multiplica por la
   escala actual del contexto. Safari/iOS aún no lo implementa (WebKit bug 275436): se comprueba con una PRUEBA DE
   COMPORTAMIENTO (que exista la propiedad no basta: en WebKit con la opción activada existe y no hace nada) y,
   si no funciona, se usa un respaldo propio: la capa se pinta en un lienzo auxiliar y se desenfoca con tres
   desenfoques de caja, que es exactamente la aproximación de la gaussiana que fija la especificación W3C
   «Filter Effects» para feGaussianBlur (https://www.w3.org/TR/filter-effects-1/#feGaussianBlurElement),
   a menor resolución cuando el radio es grande (el resultado no cambia: es un paso bajo).

   CAPAS DE UN SOLO TRAZO (imagen, gif, dibujo, relleno…) → ctx.filter directo sobre el propio drawImage (GPU).
   CAPAS DE VARIOS TRAZOS (forma, línea, texto, bocadillo) → «union»: se pintan enteras en un lienzo auxiliar
   y se desenfoca el conjunto UNA vez (una caja de texto con 300 palabras son 300 operaciones: desenfocar cada
   una por separado sería lento y distinto del respaldo).

   USO — CxDefocus.run(ctx, grado, function (c) { …pintar en c… }, union)
         CxDefocus.suspend(function () { …horneado de un bitmap que luego se pintará con su propio desenfoque… })
   ============================================================ */
(function (root) {
  'use strict';

  var MAX      = 100;     // grado máximo del deslizador
  var UNIT     = 0.4;     // σ (px de hoja) por grado → 100 = 40 px
  var PX_MIN   = 0.15;    // por debajo no se aprecia: se pinta nítido
  var PX_MAX   = 400;     // tope de seguridad (zoom 8 × grado 100 = 320)
  var PAD_MAX  = 320;     // margen máximo del lienzo auxiliar (px de bitmap)

  var _off    = 0;        // >0: no desenfocar (se está horneando un bitmap)
  var _force  = null;     // pruebas: 'js' = simular un navegador sin ctx.filter · 'native' = exigirlo
  var _okMemo = null;     // resultado de la prueba de comportamiento
  var _pool   = [];       // lienzos auxiliares por profundidad de anidamiento
  var _depth  = 0;

  function clamp(v) {
    v = +v;
    if (!(v > 0)) return 0;
    return v > MAX ? MAX : v;
  }

  // σ de la gaussiana en píxeles de hoja
  function sigma(deg) { return clamp(deg) * UNIT; }

  // Escala (px de bitmap por px de hoja) de la transformación actual del contexto
  function scaleOf(ctx) {
    try {
      var m = ctx.getTransform();
      var s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      return s > 0 ? s : 1;
    } catch (e) { return 1; }
  }

  // Radio en píxeles de bitmap para pintar con grado `deg` en ctx (0 = nítido)
  function px(ctx, deg) {
    var d = clamp(deg);
    if (!d) return 0;
    var p = d * UNIT * scaleOf(ctx);
    if (p < PX_MIN) return 0;
    return p > PX_MAX ? PX_MAX : p;
  }

  // ¿ctx.filter = 'blur()' funciona de verdad? Prueba: un píxel negro en un lienzo de 5×5 desenfocado
  // debe repartir su alfa a los vecinos. Se hace una sola vez.
  function supported() {
    if (_force === 'js') return false;
    if (_force === 'native') return true;
    if (_okMemo !== null) return _okMemo;
    var ok = false;
    try {
      var c = document.createElement('canvas'); c.width = 5; c.height = 5;
      var x = c.getContext('2d');
      if (x && 'filter' in x) {
        x.filter = 'blur(1px)';
        if (x.filter && x.filter !== 'none') {
          x.fillStyle = '#000'; x.fillRect(2, 2, 1, 1);
          var a = x.getImageData(1, 2, 1, 1).data[3];
          ok = a > 0 && a < 255;
        }
      }
    } catch (e) { ok = false; }
    _okMemo = ok;
    return ok;
  }

  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    return c;
  }

  // ── Respaldo: desenfoque de caja ×3 sobre píxeles con alfa premultiplicado (ping-pong 8 bits) ───────────────
  // Ventana [x-a, x+b] con a+b+1 = tamaño; fuera del lienzo = transparente (no se renormaliza).
  function boxH(src, dst, w, h, a, b) {
    var size = a + b + 1, inv = 1 / size;
    for (var y = 0; y < h; y++) {
      var row = y * w * 4;
      var s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      var kmax = b < w - 1 ? b : w - 1;
      for (var k = 0; k <= kmax; k++) { var q = row + k * 4; s0 += src[q]; s1 += src[q + 1]; s2 += src[q + 2]; s3 += src[q + 3]; }
      for (var x = 0; x < w; x++) {
        var o = row + x * 4;
        dst[o] = s0 * inv; dst[o + 1] = s1 * inv; dst[o + 2] = s2 * inv; dst[o + 3] = s3 * inv;   // Uint8ClampedArray ya redondea al más cercano
        var add = x + b + 1, sub = x - a;
        if (add < w) { var qa = row + add * 4; s0 += src[qa]; s1 += src[qa + 1]; s2 += src[qa + 2]; s3 += src[qa + 3]; }
        if (sub >= 0) { var qs = row + sub * 4; s0 -= src[qs]; s1 -= src[qs + 1]; s2 -= src[qs + 2]; s3 -= src[qs + 3]; }
      }
    }
  }
  function boxV(src, dst, w, h, a, b) {
    var size = a + b + 1, inv = 1 / size, stride = w * 4;
    for (var x = 0; x < w; x++) {
      var col = x * 4;
      var s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      var kmax = b < h - 1 ? b : h - 1;
      for (var k = 0; k <= kmax; k++) { var q = col + k * stride; s0 += src[q]; s1 += src[q + 1]; s2 += src[q + 2]; s3 += src[q + 3]; }
      for (var y = 0; y < h; y++) {
        var o = col + y * stride;
        dst[o] = s0 * inv; dst[o + 1] = s1 * inv; dst[o + 2] = s2 * inv; dst[o + 3] = s3 * inv;   // Uint8ClampedArray ya redondea al más cercano
        var add = y + b + 1, sub = y - a;
        if (add < h) { var qa = col + add * stride; s0 += src[qa]; s1 += src[qa + 1]; s2 += src[qa + 2]; s3 += src[qa + 3]; }
        if (sub >= 0) { var qs = col + sub * stride; s0 -= src[qs]; s1 -= src[qs + 1]; s2 -= src[qs + 2]; s3 -= src[qs + 3]; }
      }
    }
  }

  // Tres cajas según W3C: d = floor(σ·3·√(2π)/4 + 0.5). d impar → tres cajas de d centradas; d par → dos de d
  // (una desplazada a la izquierda, otra a la derecha) y una de d+1 centrada.
  function boxPlan(s) {
    var d = Math.floor(s * 3 * Math.sqrt(2 * Math.PI) / 4 + 0.5);
    if (d < 2) return null;
    if (d % 2) { var r = (d - 1) / 2; return [[r, r], [r, r], [r, r]]; }
    var h = d / 2;
    return [[h, h - 1], [h - 1, h], [h, h]];
  }

  // Desenfoca `data` (Uint8ClampedArray RGBA, NO premultiplicado) w×h con σ en píxeles. Devuelve true si cambió algo.
  function blurData(data, w, h, s) {
    var plan = boxPlan(s);
    if (!plan) return false;
    var n = w * h * 4, i, a;
    var A = new Uint8ClampedArray(n), B = new Uint8ClampedArray(n);
    for (i = 0; i < n; i += 4) {                       // premultiplicar
      a = data[i + 3];
      if (a === 255) { A[i] = data[i]; A[i + 1] = data[i + 1]; A[i + 2] = data[i + 2]; A[i + 3] = 255; }
      else if (a) { var f = a / 255; A[i] = data[i] * f; A[i + 1] = data[i + 1] * f; A[i + 2] = data[i + 2] * f; A[i + 3] = a; }
    }
    var src = A, dst = B, t;
    for (i = 0; i < 3; i++) { boxH(src, dst, w, h, plan[i][0], plan[i][1]); t = src; src = dst; dst = t; }
    for (i = 0; i < 3; i++) { boxV(src, dst, w, h, plan[i][0], plan[i][1]); t = src; src = dst; dst = t; }
    for (i = 0; i < n; i += 4) {                       // des-premultiplicar
      a = src[i + 3];
      if (!a) { data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0; continue; }
      if (a === 255) { data[i] = src[i]; data[i + 1] = src[i + 1]; data[i + 2] = src[i + 2]; data[i + 3] = 255; continue; }
      var g = 255 / a;
      data[i] = src[i] * g; data[i + 1] = src[i + 1] * g; data[i + 2] = src[i + 2] * g; data[i + 3] = a;
    }
    return true;
  }

  // Desenfoca EN SITIO un lienzo con σ = s píxeles (respaldo para navegadores sin ctx.filter).
  function blurCanvas(cv, s) {
    var W = cv.width, H = cv.height;
    if (!(s >= 0.4) || W < 2 || H < 2) return cv;
    // Se trabaja a menor resolución (σ' entre 1,5 y 3 px): un paso bajo no conserva detalle más fino que su radio, así que
    // el resultado es el mismo y cuesta f² veces menos.
    var f = 1; while (s / f > 3 && f < 32) f *= 2;
    var small = cv, sw = W, sh = H, step = f, t, tx;
    while (step > 1) {                                  // reducción por mitades (suaviza sin aliasing)
      var nw = Math.max(1, Math.ceil(sw / 2)), nh = Math.max(1, Math.ceil(sh / 2));
      t = mkCanvas(nw, nh); tx = t.getContext('2d');
      tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = 'high';
      tx.drawImage(small, 0, 0, sw, sh, 0, 0, nw, nh);
      small = t; sw = nw; sh = nh; step /= 2;
    }
    var sx = small.getContext('2d', { willReadFrequently: true });
    var id;
    try { id = sx.getImageData(0, 0, sw, sh); } catch (e) { return cv; }
    if (!blurData(id.data, sw, sh, s / f)) return cv;
    sx.putImageData(id, 0, 0);
    if (small !== cv) {
      var cx = cv.getContext('2d');
      cx.save();
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'copy';
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(small, 0, 0, sw, sh, 0, 0, W, H);
      cx.restore();
    } else {
      // sin reducción: ya está en cv
    }
    return cv;
  }

  // ── Lienzo auxiliar por profundidad (un desenfoque dentro de otro no pisa al de fuera) ─────────────────────
  function aux(depth, w, h) {
    var c = _pool[depth];
    if (!c) c = _pool[depth] = mkCanvas(w, h);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }

  // Región del lienzo destino (en píxeles de bitmap) que hay que preparar: todo el lienzo + margen, o —si quien llama conoce el
  // rectángulo que ocupa la capa— solo ese rectángulo + margen. Sin esto, en un lienzo grande (el espacio de trabajo de 2700×2340
  // al exportar) cada capa desenfocada reservaría y desenfocaría ~10 Mpx aunque la capa mida 100×100.
  function region(ctx, pad, bounds) {
    var W = ctx.canvas.width, H = ctx.canvas.height;
    var r = { x0: -pad, y0: -pad, x1: W + pad, y1: H + pad };
    var b = (typeof bounds === 'function') ? bounds() : bounds;
    if (b && b.w >= 0 && b.h >= 0) {
      var T = ctx.getTransform(), xs = [], ys = [], k, q;
      var cs = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
      for (k = 0; k < 4; k++) { q = cs[k]; xs.push(T.a * q[0] + T.c * q[1] + T.e); ys.push(T.b * q[0] + T.d * q[1] + T.f); }
      r.x0 = Math.max(r.x0, Math.floor(Math.min(xs[0], xs[1], xs[2], xs[3]) - pad));
      r.y0 = Math.max(r.y0, Math.floor(Math.min(ys[0], ys[1], ys[2], ys[3]) - pad));
      r.x1 = Math.min(r.x1, Math.ceil(Math.max(xs[0], xs[1], xs[2], xs[3]) + pad));
      r.y1 = Math.min(r.y1, Math.ceil(Math.max(ys[0], ys[1], ys[2], ys[3]) + pad));
    }
    return r;
  }

  // Pinta con desenfoque mediante lienzo auxiliar: drawFn recibe un contexto con la MISMA transformación y alfa que ctx
  // (desplazada al origen de la región), y después el resultado se desenfoca UNA vez y se compone sobre ctx.
  function runAux(ctx, p, drawFn, native, bounds, blend) {
    var pad = Math.min(PAD_MAX, Math.ceil(p * 3));
    pad = Math.ceil(pad / 16) * 16;                      // cuantizado: arrastrar el deslizador no realoca el lienzo cada vez
    var R = region(ctx, pad, bounds);
    var rw = R.x1 - R.x0, rh = R.y1 - R.y0;
    if (rw < 1 || rh < 1) return drawFn(ctx);            // la capa cae fuera del lienzo: se pinta sin más (no se ve; así conserva sus efectos secundarios)
    var sc = aux(_depth, rw, rh);
    var sx = sc.getContext('2d');
    var T = ctx.getTransform();
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over'; sx.filter = 'none';
    sx.clearRect(0, 0, sc.width, sc.height);
    sx.setTransform(T.a, T.b, T.c, T.d, T.e - R.x0, T.f - R.y0);
    sx.globalAlpha = ctx.globalAlpha;
    _depth++;
    try { drawFn(sx); } finally { _depth--; }
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.globalAlpha = 1;
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      if (blend) ctx.globalCompositeOperation = blend;   // el modo de fusión de la capa (la imagen lo fija dentro de su draw, que aquí pinta sobre vacío)
      if (native) {
        var prev = ctx.filter;
        ctx.filter = (prev && prev !== 'none' ? prev + ' ' : '') + 'blur(' + p.toFixed(2) + 'px)';
        ctx.drawImage(sc, R.x0, R.y0);
      } else {
        blurCanvas(sc, p);
        ctx.drawImage(sc, R.x0, R.y0);
      }
    } finally { ctx.restore(); }
    if (sc.width * sc.height > 6e6) { sc.width = 1; sc.height = 1; }   // lienzos enormes (≥ 6 Mpx): no se retienen entre llamadas (memoria en iOS)
  }

  // Pinta con grado de desenfoque `deg`. drawFn(c) pinta la capa en el contexto c que se le da (puede ser ctx mismo
  // o un auxiliar con la misma transformación). `opt` = true (capa de varios trazos: forma, línea, texto, bocadillo → «union») o
  // un objeto { union, bounds, blend }:  bounds = {x,y,w,h} (o función que lo da) en coordenadas de usuario de ctx con el
  // rectángulo que como MUCHO ocupa la capa (si no se da, se prepara todo el lienzo);  blend = modo de fusión de la capa.
  function run(ctx, deg, drawFn, opt) {
    if (_off > 0) return drawFn(ctx);
    var p = px(ctx, deg);
    if (!p) return drawFn(ctx);
    var union = !!(opt === true || (opt && opt.union)), bounds = opt && opt.bounds, blend = opt && opt.blend;
    if (supported()) {
      if (union) return runAux(ctx, p, drawFn, true, bounds, blend);
      ctx.save();
      try {
        var prev = ctx.filter;
        ctx.filter = (prev && prev !== 'none' ? prev + ' ' : '') + 'blur(' + p.toFixed(2) + 'px)';
        return drawFn(ctx);
      } finally { ctx.restore(); }
    }
    return runAux(ctx, p, drawFn, false, bounds, blend);
  }

  // Dentro de fn() nada se desenfoca: para hornear un bitmap (renderDataUrl, rasterizar, texto a dibujo…) que luego se pinta
  // con su propio grado — si no, el desenfoque quedaría aplicado dos veces.
  function suspend(fn) {
    _off++;
    try { return fn(); } finally { _off--; }
  }

  root.CxDefocus = {
    MAX: MAX, UNIT: UNIT,
    clamp: clamp, sigma: sigma, px: px,
    supported: supported,
    run: run, suspend: suspend,
    isSuspended: function () { return _off > 0; },
    blurCanvas: blurCanvas,
    // solo para pruebas: 'js' simula un navegador sin ctx.filter; null vuelve a la detección real
    _force: function (m) { _force = m || null; return _force; }
  };
})(window);
