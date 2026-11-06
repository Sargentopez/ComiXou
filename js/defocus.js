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

   REPRODUCCIÓN (v42.55) — el lector y el visor interno repintan la hoja ENTERA en cada fotograma de una animación; con
   desenfoque, cada repintado volvía a desenfocar todas las capas (medido en el lector real: 24 ms por repintado frente a 2,4 ms
   sin desenfoque; el filtro nativo cuesta según el área del LIENZO, casi con independencia del radio). Solución estándar (la
   «cacheAsBitmap» de Flash/Pixi y las capas del compositor de CSS): la capa desenfocada se guarda como bitmap y se reutiliza
   mientras no cambie nada salvo su posición/giro, que son rígidos (una gaussiana es isótropa: desplazar o girar el bitmap
   desenfocado da el mismo resultado). Además se guarda a MENOR resolución (un desenfoque es un paso bajo: con σ' ≥ 3 px a la
   resolución reducida el error medido frente al filtro a resolución completa es de 0,3–1,8/255 de media; mismo principio que el
   desenfoque «dual-filter»/Kawase y que el respaldo de este mismo módulo), así que cada entrada ocupa f² veces menos.
   MEMORIA — tope total según el dispositivo (navigator.deviceMemory: ≤1 GB 8 MB · 2 GB 16 MB · 4 GB 32 MB · ≥8 GB 64 MB ·
   desconocido, p. ej. iPhone, 16 MB); ninguna entrada puede ocupar más de ¼ del tope; se expulsa la menos usada y NUNCA una usada
   en los últimos 0,4 s (si el conjunto de trabajo no cabe, lo nuevo se pinta sin guardar, que sigue siendo más barato que antes);
   lo que lleva 4 s sin usarse se libera; al ocultarse la página se libera todo. No hay temporizadores permanentes.
   Solo se activa si quien llama lo pide (opt.cache): el editor y las exportaciones siguen pintando a resolución completa.

   PRECALENTADO (v42.56) — «el desenfoque, si lo hay, debe estar listo antes de que se vea la hoja». Con la caché sola, el primer
   fotograma —y cada fotograma NUEVO de una animación cuyo desenfoque cambia de un fotograma a otro— seguía pagando el cálculo en pleno
   movimiento. CxDefocus.warm(fn): dentro de fn, run() NO pinta nada: solo prepara la entrada de la caché (si falta) y vuelve. El lector lo
   llama al cargar cada hoja y sus contiguas, ANTES de marcarla «lista» (js: reader/reader.js, _plWarmBlur): durante la reproducción no
   queda ningún desenfoque por calcular. Las entradas llevan `group` (la hoja): no caducan por tiempo mientras la hoja esté en la ventana
   de memoria del lector y se sueltan todas juntas con release(group). El tope de memoria de arriba sigue mandando: lo que no cabe se
   calcula al pintar, como antes.
   OPACIDAD — si quien llama da cache.neutral(c) (pinta la capa con opacidad 1), el bitmap se guarda SIN opacidad y esta se aplica al
   pintarlo (blur(α·L) = α·blur(L): exacto en capas de un solo trazo). Así un fundido, o la opacidad de un objeto de animación que cambia
   en cada fotograma, no obliga a rehacer el bitmap.

   USO — CxDefocus.run(ctx, grado, function (c) { …pintar en c… }, union)
         CxDefocus.run(ctx, grado, drawFn, { union, bounds, blend, cache: { key, sig, src, alpha, x, y, rot, rigid, group, neutral } })
             cache.key   objeto que identifica la capa (WeakMap: no se retiene)
             cache.sig   texto con TODO lo que cambia los píxeles salvo posición/giro (fotograma, tamaño, imagen lista…)
             cache.src   imagen/lienzo de origen: su identidad va en la firma (por si se sustituye)
             cache.alpha opacidad con la que drawFn pinta (sin neutral va en la firma, cuantizada a 1/64; con neutral se aplica al pintar)
             cache.x/y/rot  pivote (px de usuario) y giro (grados) de la capa: sus cambios se aplican al bitmap, sin rehacerlo
             cache.rigid false → x/y/rot van a la firma (cualquier cambio rehace); sin opt.bounds también es así
             cache.group objeto (la hoja) al que pertenece la entrada: sin caducidad por tiempo, se suelta con release(group)
             cache.neutral función(c) que pinta la capa con opacidad 1 (ver OPACIDAD)
             opt.bounds  rectángulo de usuario que MÁS ocupa la capa (si se mueve, hace falta)
         CxDefocus.warm(function () { …run() con las mismas llamadas de siempre: solo preparan la caché… })  ·  warmCtx(w, h, a, d)
             contexto «de mentira» (lienzo w×h y transformación a,d) para precalentar sin reservar un lienzo de verdad
         CxDefocus.release(group) · suspend(function () { …horneado de un bitmap que luego se pintará con su propio desenfoque… })
         CxDefocus.cacheStats() · cacheClear() · setCache(false) · ?dfcache=0 en la dirección (interruptor de emergencia)
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

  // Caché de desenfoques (v42.55) — ver la cabecera
  var MB          = 1048576;
  var SIG_MIN     = 3;       // σ' mínimo (px) a la resolución reducida: con menos el error crece (medido: σ' 1,5 → hasta 47/255)
  var F_MAX       = 32;      // factor de reducción máximo (potencias de 2)
  var T_RECENT    = 400;     // ms: una entrada usada hace menos no se expulsa (forma parte del conjunto de trabajo)
  var T_STALE     = 4000;    // ms sin usarse → se libera
  var T_TIMER     = 5000;    // revisión de entradas viejas (solo mientras haya entradas; no hay temporizador permanente)
  var PER_KEY     = 240;     // entradas como máximo por capa (fotogramas de un GIF, un desenfoque distinto por fotograma de una animación…)
  var MAX_ENTRIES = 480;
  var MAX_SIDE    = 4096;
  var _cacheOn    = true;    // interruptor de emergencia (setCache / ?dfcache=0)
  var _pause      = false;   // pruebas: la caché se salta (sin vaciarse) para pintar la referencia a resolución completa
  var _warm       = 0;       // >0: dentro de warm(fn) — run() solo prepara la caché, no pinta
  var _budgetB    = 0;       // tope en bytes (0 = sin calcular)
  var _used       = 0;
  var _live       = [];      // entradas vivas (sin referencia a la capa)
  var _nUng       = 0;       // cuántas de ellas NO llevan grupo (las únicas que caducan por tiempo)
  var _recs       = (typeof WeakMap === 'function') ? new WeakMap() : null;   // capa → Map(firma → entrada)
  var _ids        = (typeof WeakMap === 'function') ? new WeakMap() : null;
  var _idN        = 0;
  var _timer      = 0;
  var _lastSweep  = 0;
  var _spool      = [];      // lienzos de trabajo (nítido a baja resolución) por profundidad
  var _tpool      = [];      // ídem para las pasadas que no se guardan
  var _st = { hits: 0, misses: 0, transient: 0, refused: 0, evicted: 0, swept: 0, builds: 0, buildMs: 0, maxBuildMs: 0, primed: 0 };
  try { if (/[?&]dfcache=0(?:&|$)/.test(String(root.location && root.location.search || ''))) _cacheOn = false; } catch (e) {}

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

  // ══ CACHÉ DE DESENFOQUES PARA REPRODUCCIÓN (v42.55) ═══════════════════════════════════════════════════════
  // Tope de memoria según el dispositivo. navigator.deviceMemory (Chrome/Edge/Android) da GB redondeados a potencia de 2;
  // Safari/iPhone y Firefox no lo exponen: se supone lo más prudente.
  function budget() {
    if (_budgetB) return _budgetB;
    var mb = 16, m = 0;
    try { m = +root.navigator.deviceMemory || 0; } catch (e) {}
    if (m) mb = m <= 1 ? 8 : m <= 2 ? 16 : m <= 4 ? 32 : 64;
    _budgetB = mb * MB;
    return _budgetB;
  }

  function idOf(o) {
    if (!_ids || !o || (typeof o !== 'object' && typeof o !== 'function')) return 0;
    var i = _ids.get(o);
    if (!i) { i = ++_idN; _ids.set(o, i); }
    return i;
  }

  // La transformación debe ser (casi) una semejanza —escala uniforme + giro + traslación— con determinante > 0: solo así un
  // desenfoque isótropo calculado en píxeles de pantalla sigue siendo correcto tras mover/girar el bitmap. Se tolera un 2 % en
  // los cuadrados (≈ 1 % de escala): el lienzo HD del lector se redondea a píxeles enteros y sus escalas X e Y difieren ~0,05 %.
  function similar(T) {
    var a = T.a, b = T.b, c = T.c, d = T.d, n1 = a * a + b * b, n2 = c * c + d * d, m = n1 > n2 ? n1 : n2;
    return m > 0 && Math.abs(n1 - n2) <= 0.02 * m && Math.abs(a * c + b * d) <= 0.02 * m && (a * d - b * c) > 0;
  }
  // Matrices [a,b,c,d,e,f] (convención de canvas): mmul(A,B) = primero B, luego A.
  function mmul(A, B) {
    return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
            A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  }
  function minv(A) {
    var i = 1 / (A[0] * A[3] - A[1] * A[2]), a = A[3] * i, b = -A[1] * i, c = -A[2] * i, d = A[0] * i;
    return [a, b, c, d, -(a * A[4] + c * A[5]), -(b * A[4] + d * A[5])];
  }

  function freeCv(cv) { try { cv.width = 1; cv.height = 1; } catch (e) {} }

  function drop(e) {
    var i = _live.indexOf(e);
    if (i >= 0) _live.splice(i, 1);
    if (e.map && e.map.get(e.sig) === e) e.map.delete(e.sig);
    _used -= e.bytes;
    if (!e.grp) _nUng--;
    freeCv(e.cv); e.cv = null; e.map = null;
  }
  function cacheClear() {
    while (_live.length) drop(_live[_live.length - 1]);
    _used = 0; _nUng = 0;
    for (var i = 0; i < _spool.length; i++) if (_spool[i]) freeCv(_spool[i]);
    for (i = 0; i < _tpool.length; i++) if (_tpool[i]) freeCv(_tpool[i]);
    _spool = []; _tpool = [];
    if (_timer) { clearTimeout(_timer); _timer = 0; }
  }
  // Suelta todo lo que pertenece a un grupo (la hoja que sale de la ventana de memoria). Devuelve cuántas entradas.
  function release(group) {
    var n = 0;
    if (!group) return 0;
    for (var i = _live.length - 1; i >= 0; i--) {
      if (_live[i].grp === group) { drop(_live[i]); n++; }
    }
    return n;
  }
  // Solo caducan por tiempo las entradas SIN grupo (las que no tienen dueño que las suelte).
  function sweep(now) {
    _lastSweep = now;
    for (var i = _live.length - 1; i >= 0; i--) {
      if (!_live[i].grp && now - _live[i].last > T_STALE) { drop(_live[i]); _st.swept++; }
    }
  }
  // Un solo aviso a los 5 s de la última construcción: caduca lo viejo y libera los lienzos de trabajo. Solo se vuelve a armar mientras
  // quede algo que pueda caducar (entradas sin grupo); no hay temporizadores permanentes.
  function arm() {
    if (_timer || typeof setTimeout !== 'function') return;
    _timer = setTimeout(function () {
      _timer = 0;
      sweep(root.performance.now());
      if (_nUng > 0) arm();
      else { _spool = []; _tpool = []; }
    }, T_TIMER);
  }
  // Hace sitio para `bytes`: expulsa las menos usadas, pero NUNCA una usada hace menos de T_RECENT (conjunto de trabajo actual) ni
  // otra de la MISMA capa (`protect`: su mapa): una animación que recorre cíclicamente más fotogramas de los que caben, con «la menos usada
  // primero» fallaría el 100 % de las veces; así se quedan los primeros y el resto se calcula al pintar.
  // false → no cabe sin pisar eso: la pasada se pinta sin guardar.
  function admit(bytes, now, protect) {
    var cap = budget();
    if (_live.length >= MAX_ENTRIES && !evictOne(now, protect)) return false;
    while (_used + bytes > cap) { if (!evictOne(now, protect)) return false; }
    return true;
  }
  function evictOne(now, protect) {
    var v = null;
    for (var i = 0; i < _live.length; i++) {
      var e = _live[i];
      if (protect && e.map === protect) continue;
      if (now - e.last > T_RECENT && (!v || e.last < v.last)) v = e;
    }
    if (!v) return false;
    drop(v); _st.evicted++;
    return true;
  }

  // Lienzo de trabajo por profundidad. Los grandes (> 1 Mpx) no se conservan entre llamadas.
  function work(pool, depth, w, h) {
    var c = pool[depth];
    if (!c) c = pool[depth] = mkCanvas(w, h);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }

  // Pinta la capa NÍTIDA a 1/f de resolución y la desenfoca con σ' = sp (px reducidos) en dst. T = transformación del contexto
  // de destino; R = región en px de destino (múltiplos de f); cw×ch = tamaño reducido.
  function buildLow(T, f, sp, R, cw, ch, native, galpha, drawFn, dst) {
    var sc = work(_spool, _depth, cw, ch), sx = sc.getContext('2d');
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over'; sx.filter = 'none';
    sx.clearRect(0, 0, cw, ch);
    sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high';
    sx.setTransform(T.a / f, T.b / f, T.c / f, T.d / f, (T.e - R.x0) / f, (T.f - R.y0) / f);
    sx.globalAlpha = galpha;
    _depth++;
    try { drawFn(sx, true); }
    catch (err) { freeCv(sc); _spool[_depth - 1] = null; throw err; }      // drawFn pudo dejar save() sin restore(): este lienzo de trabajo no se reutiliza
    finally { _depth--; }
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalAlpha = 1;
    var ex = dst.getContext('2d');
    ex.setTransform(1, 0, 0, 1, 0, 0);
    ex.globalAlpha = 1; ex.globalCompositeOperation = 'source-over'; ex.filter = 'none';
    ex.clearRect(0, 0, cw, ch);
    if (native) {
      ex.filter = 'blur(' + sp.toFixed(2) + 'px)';
      ex.drawImage(sc, 0, 0);
      ex.filter = 'none';
    } else {
      var id = null;
      try { id = sx.getImageData(0, 0, cw, ch); } catch (e) { id = null; }
      if (id && blurData(id.data, cw, ch, sp)) ex.putImageData(id, 0, 0);
      else ex.drawImage(sc, 0, 0);
    }
    if (cw * ch > 1e6) { freeCv(sc); _spool[_depth] = null; }
  }

  // Pinta una entrada con la matriz M (px de la región origen → px del destino actual). alpha: opacidad al pintarla (1 salvo en las
  // entradas «neutral», que se guardan sin opacidad).
  function blitEntry(ctx, e, M, blend, alpha) {
    if (alpha == null || alpha !== alpha) alpha = 1;
    var dw = e.cw * e.f, dh = e.ch * e.f, W = ctx.canvas.width, H = ctx.canvas.height;
    var xs = [e.x0, e.x0 + dw], ys = [e.y0, e.y0 + dh], mnx = 1e18, mny = 1e18, mxx = -1e18, mxy = -1e18;
    for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
      var X = M[0] * xs[i] + M[2] * ys[j] + M[4], Y = M[1] * xs[i] + M[3] * ys[j] + M[5];
      if (X < mnx) mnx = X; if (X > mxx) mxx = X; if (Y < mny) mny = Y; if (Y > mxy) mxy = Y;
    }
    if (mxx < 0 || mxy < 0 || mnx > W || mny > H) return;       // fuera del lienzo: nada que pintar
    if (alpha <= 0) return;                                      // opacidad 0: invisible
    ctx.save();
    try {
      ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
      ctx.globalAlpha = alpha > 1 ? 1 : alpha;
      if (blend) ctx.globalCompositeOperation = blend;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(e.cv, 0, 0, e.cw, e.ch, e.x0, e.y0, dw, dh);
    } finally { ctx.restore(); }
  }

  // Camino con caché. Devuelve true si ha pintado la capa (con la caché o en una pasada sin guardar); false → quien llama usa el
  // camino de siempre (a resolución completa). Nunca deja la capa a medias: solo devuelve false antes de llamar a drawFn.
  // prime (precalentado, dentro de warm()): no pinta nada en ctx; solo se asegura de que la entrada exista. true → ya existe (o se ha
  // construido y guardado); false → no se puede guardar (sin hueco, demasiado grande, no cacheable): se calculará al pintar.
  function runCached(ctx, p, drawFn, union, bounds, blend, C, prime) {
    if (!_cacheOn || _pause || !_recs || !C || !C.key || (typeof C.key !== 'object' && typeof C.key !== 'function')) return false;
    var T = ctx.getTransform();
    if (!similar(T)) return false;
    if (ctx.filter && ctx.filter !== 'none') return false;
    var native = supported(), now = root.performance.now();
    if (now - _lastSweep > 1000) sweep(now);

    var rigid = C.rigid !== false && !!bounds;                    // sin límites de la capa no se puede mover el bitmap
    var neutral = (typeof C.neutral === 'function') ? C.neutral : null;   // bitmap sin opacidad: esta se aplica al pintarlo
    var f = 1; while (f < F_MAX && p / (f * 2) >= SIG_MIN) f *= 2;
    var galpha = ctx.globalAlpha, ca = C.alpha == null ? 1 : +C.alpha;
    var sg = (C.sig == null ? '' : String(C.sig)) + '|' + idOf(C.src) + '|' + T.a.toFixed(3) + ',' + T.b.toFixed(3) + ',' + T.c.toFixed(3) + ',' + T.d.toFixed(3) +
             '|' + p.toFixed(2) + '|' + (union ? 'u' : 's') + (native ? 'n' : 'j') + (neutral ? '|o' : '|' + Math.round(ca * 64) + ',' + Math.round(galpha * 64));
    var bAlpha = neutral ? galpha * ca : 1;                       // opacidad al pintar la entrada
    var x1 = +C.x || 0, y1 = +C.y || 0, r1 = +C.rot || 0;
    if (!rigid) sg += '|' + Math.round(x1 * 8) + ',' + Math.round(y1 * 8) + ',' + Math.round(r1 * 8);

    var map = _recs.get(C.key);
    var e = map && map.get(sg);
    var T1 = [T.a, T.b, T.c, T.d, T.e, T.f];

    function pose(en) {                                           // bitmap de la entrada → destino actual
      var D = [1, 0, 0, 1, 0, 0];
      if (rigid) {
        var th = (r1 - en.rot) * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
        D = [c, s, -s, c, x1 - (c * en.px - s * en.py), y1 - (s * en.px + c * en.py)];
      }
      return mmul(T1, mmul(D, minv(en.T)));
    }

    if (e) {                                                      // ACIERTO: solo un desplazamiento/giro del bitmap
      e.last = now;
      if (prime) return true;
      _st.hits++;
      blitEntry(ctx, e, pose(e), blend, bAlpha);
      return true;
    }

    // FALLO: se construye. Región de la capa en px del destino (sin recortar al lienzo: puede entrar moviéndose)
    var W = ctx.canvas.width, H = ctx.canvas.height, mnx = 0, mny = 0, mxx = W, mxy = H;
    if (bounds) {
      var b = (typeof bounds === 'function') ? bounds() : bounds;
      if (!b || !(b.w >= 0) || !(b.h >= 0)) return false;
      var cs = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
      mnx = mny = 1e18; mxx = mxy = -1e18;
      for (var k = 0; k < 4; k++) {
        var X = T.a * cs[k][0] + T.c * cs[k][1] + T.e, Y = T.b * cs[k][0] + T.d * cs[k][1] + T.f;
        if (X < mnx) mnx = X; if (X > mxx) mxx = X; if (Y < mny) mny = Y; if (Y > mxy) mxy = Y;
      }
    }
    var sp = p / f, padLo = Math.ceil(3 * sp) + 1, padDev = padLo * f;
    var R = { x0: Math.floor((mnx - padDev) / f) * f, y0: Math.floor((mny - padDev) / f) * f };
    var cw = Math.ceil((mxx + padDev) / f) - R.x0 / f, ch = Math.ceil((mxy + padDev) / f) - R.y0 / f;
    if (!(cw >= 1 && ch >= 1)) return false;
    var bytes = cw * ch * 4;
    if (cw > MAX_SIDE || ch > MAX_SIDE || bytes > budget() / 4) { _st.refused++; return false; }   // demasiado grande para guardarse

    var t0 = root.performance.now();
    var keep = (!map || map.size < PER_KEY) && admit(bytes, now, map);   // una capa no acumula más de PER_KEY entradas
    if (prime && !keep) { _st.refused++; return false; }          // precalentar es guardar: sin hueco no se hace nada (se calculará al pintar)
    if (!keep && f < 2) { _st.refused++; return false; }          // sin hueco y sin ganancia por reducir: camino de siempre
    var bfn = neutral ? function (c) { neutral(c); } : drawFn, bga = neutral ? 1 : galpha;
    var ent;
    if (keep) {
      var cv = mkCanvas(cw, ch);
      buildLow(T, f, sp, R, cw, ch, native, bga, bfn, cv);
      ent = { cv: cv, cw: cw, ch: ch, f: f, x0: R.x0, y0: R.y0, T: T1, px: x1, py: y1, rot: r1, bytes: bytes, last: now, sig: sg, map: null, grp: C.group || null };
      if (!map) { map = new Map(); _recs.set(C.key, map); }
      ent.map = map; map.set(sg, ent); _live.push(ent); _used += bytes;
      if (!ent.grp) _nUng++;
      if (prime) _st.primed++; else _st.misses++;
      arm();
    } else {                                                      // pasada sin guardar: lienzo de trabajo, no retenido
      var tc = work(_tpool, _depth, cw, ch);
      buildLow(T, f, sp, R, cw, ch, native, bga, bfn, tc);
      ent = { cv: tc, cw: cw, ch: ch, f: f, x0: R.x0, y0: R.y0, T: T1, px: x1, py: y1, rot: r1 };
      _st.transient++;
    }
    var dt = root.performance.now() - t0;
    _st.builds++; _st.buildMs += dt; if (dt > _st.maxBuildMs) _st.maxBuildMs = dt;
    if (prime) return true;
    blitEntry(ctx, ent, pose(ent), blend, bAlpha);
    if (!keep && cw * ch > 1e6) { freeCv(tc); _tpool[_depth] = null; }
    return true;
  }

  function cacheStats() {
    return {
      on: _cacheOn, budgetMB: +(budget() / MB).toFixed(1), usedKB: Math.round(_used / 1024), entries: _live.length, pinned: _live.length - _nUng,
      hits: _st.hits, misses: _st.misses, primed: _st.primed, transient: _st.transient, refused: _st.refused, evicted: _st.evicted, swept: _st.swept,
      builds: _st.builds, buildMs: +_st.buildMs.toFixed(1), maxBuildMs: +_st.maxBuildMs.toFixed(1)
    };
  }
  // Precalentado (ver la cabecera): dentro de fn, run() solo prepara la entrada de la caché. fn debe ser SÍNCRONA (un contador global
  // no puede abarcar un await sin afectar a lo que se pinte entretanto). Devuelve lo que devuelva fn.
  function warm(fn) {
    _warm++;
    try { return fn(); } finally { _warm--; }
  }
  // Contexto «de mentira» para precalentar sin reservar un lienzo de verdad: solo lo que lee la caché (tamaño del lienzo, transformación
  // —semejanza de escala a, d—, opacidad y filtro). NO sirve para pintar.
  function warmCtx(w, h, a, d) {
    var m = { a: a || 1, b: 0, c: 0, d: d || a || 1, e: 0, f: 0 };
    return { canvas: { width: Math.max(1, w | 0), height: Math.max(1, h | 0) }, globalAlpha: 1, filter: 'none', getTransform: function () { return m; } };
  }
  function setCache(on) {
    _cacheOn = !!on;
    if (!_cacheOn) cacheClear();
    return _cacheOn;
  }
  // Al ocultarse la página no se retiene nada (memoria en móviles: una pestaña en segundo plano no debe costar bitmaps).
  try {
    if (root.document && root.document.addEventListener) {
      root.document.addEventListener('visibilitychange', function () { if (root.document.hidden) cacheClear(); });
    }
  } catch (e) {}

  // Pinta con grado de desenfoque `deg`. drawFn(c) pinta la capa en el contexto c que se le da (puede ser ctx mismo
  // o un auxiliar con la misma transformación). `opt` = true (capa de varios trazos: forma, línea, texto, bocadillo → «union») o
  // un objeto { union, bounds, blend }:  bounds = {x,y,w,h} (o función que lo da) en coordenadas de usuario de ctx con el
  // rectángulo que como MUCHO ocupa la capa (si no se da, se prepara todo el lienzo);  blend = modo de fusión de la capa;
  // cache = { key, sig, src, alpha, x, y, rot, rigid, group, neutral } → reproducción con caché de bitmaps (ver la cabecera). drawFn
  // recibe un 2.º argumento = true cuando se pinta para la caché (a 1/f de resolución).
  // Dentro de warm(): no pinta nada; solo asegura la entrada de la caché y devuelve true (existe) / false (no cacheable o sin hueco).
  function run(ctx, deg, drawFn, opt) {
    if (_warm > 0) {
      if (_off > 0 || !opt || !opt.cache) return false;
      var pw = px(ctx, deg);
      if (!pw) return false;
      return runCached(ctx, pw, drawFn, !!(opt === true || opt.union), opt.bounds, opt.blend, opt.cache, true);
    }
    if (_off > 0) return drawFn(ctx);
    var p = px(ctx, deg);
    if (!p) return drawFn(ctx);
    var union = !!(opt === true || (opt && opt.union)), bounds = opt && opt.bounds, blend = opt && opt.blend;
    if (opt && opt.cache && runCached(ctx, p, drawFn, union, bounds, blend, opt.cache)) return;
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
    cacheStats: cacheStats, cacheClear: cacheClear, setCache: setCache,
    warm: warm, warmCtx: warmCtx, release: release, isWarming: function () { return _warm > 0; },
    // solo para pruebas: tope de la caché en bytes (0 = el que toque por dispositivo) y vaciado de contadores
    _budget: function (b) { _budgetB = b > 0 ? +b : 0; return budget(); },
    _pause: function (on) { _pause = !!on; return _pause; },
    _resetStats: function () { for (var k in _st) _st[k] = 0; },
    // solo para pruebas: 'js' simula un navegador sin ctx.filter; null vuelve a la detección real
    _force: function (m) { _force = m || null; return _force; }
  };
})(window);
