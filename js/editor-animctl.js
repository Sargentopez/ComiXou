/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
/* ============================================================
   editor-animctl.js — «Ver control de animaciones» del editor (v41.60, tiempo por hoja v41.61)

   Qué es
   ──────
   Opción del menú Animar (checkbox «Ver control de animaciones»). Al activarla aparece una botonera
   centrada abajo, bajo el canvas, con ◀ (retroceder), un RELOJ y ▶ (avanzar). Mantener pulsado ▶/◀
   (dedo en Android, botón del ratón en PC) hace avanzar/retroceder el tiempo a 10 fotogramas por
   segundo (+100 ms / −100 ms por fotograma, es decir a velocidad real) y el canvas muestra la hoja
   en ese instante: los objetos animados con su fotograma, los de trayectoria en su punto, con sus
   pausas, retardos, invisibilidades y finales de recorrido. El 0 del reloj es EXACTAMENTE lo que se
   ve al iniciarse la reproducción de la hoja en el visor (p. ej. un objeto con «Invisibilidad antes
   del inicio» aparece oculto en el 0). Sin duración máxima: avanza mientras se mantenga pulsado.
   Al desmarcar el checkbox todo vuelve a verse en su fotograma inicial, como siempre.

   v41.61 — CADA HOJA TIENE SU PROPIO INSTANTE. El tiempo se guarda por hoja (WeakMap hoja→ms): al cambiar de
   hoja la anterior se queda congelada donde estaba y la nueva empieza en su propio 0 (o en el instante que
   ya se le hubiera fijado); al volver a una hoja se recupera el suyo. Con el papel cebolla (transparencia de
   hojas contiguas) el fantasma de cada vecina se pinta en SU instante congelado (ghostStates / ghostFrames,
   ver _edOnionRenderPage en editor.js). Desmarcar el checkbox (o salir del editor) descarta todos los instantes.

   Cómo está hecho (y por qué así)
   ───────────────────────────────
   El visor real es un motor GUIADO POR TEMPORIZADORES (setTimeout/RAF + Date.now()): para llegar al
   instante t habría que esperar t. Aquí el estado de cada capa es una FUNCIÓN PURA DEL TIEMPO
   —evaluate(página, t)—, calculada con las mismas fórmulas del visor:
     · fotogramas propios     ← ImageLayer._applyFrame / GifLayer._applyFrame / _edStartPageAnims
                                 (retardo de inicio, retardo por fotograma —incluidas las pausas T—,
                                 repeticiones, «detener al final», fin circular, invisibilidad antes/
                                 al final con aparición 300 ms / desvanecimiento 150 ms, reinicio)
     · trayectoria/orientación← _edViewerMpTick (Temporizador, velocidad, aceleración, detener/
                                 rebobinar/reiniciar, modo sincronizado por ciclos, grupos)
   usando AnimClock (js/anim-clock.js) —la misma matemática que el visor y el lector externo— para
   fases de recorrido, posición, orientación, congelado por pausas y fotograma sincronizado.
   Si se cambia la semántica de esos motores, hay que reflejarla aquí (hay una prueba diferencial
   contra el visor real, ver el bench de la sesión v41.60).

   NADA de esto toca las capas ni se guarda: el resultado vive en un Map capa→estado que solo lee el
   dibujo del canvas del editor mientras _edRenderFrame (y el arrastre de una capa) pintan — ver
   _edAnimCtlBegin/_edAnimCtlEnd y los helpers _edCurX/_edCurY/_edPathCurX/_edACS en editor.js.
   Miniaturas, exportación, autoguardado, deshacer, copiar/pegar, visor y lector no pasan por ahí:
   siguen viendo SIEMPRE el estado real (fotograma inicial). Los fotogramas se pintan en un lienzo
   propio por capa (nunca en el _oc real) y la botonera es DOM fuera del canvas.

   La selección y los tiradores siguen en la posición base del objeto (como la vista previa de
   trayectorias): el reloj es una vista, no cambia dónde "vive" cada objeto.
   ============================================================ */

const EdAnimCtl = (() => {
  const STEP_MS     = 100;   // 10 fotogramas por segundo
  const FADE_IN_MS  = 300;   // = _edStartPageAnims: aparición gradual tras «Invisibilidad antes del inicio»
  const FADE_OUT_MS = 150;   // = ImageLayer._applyFrame/_edViewerMpTick: desvanecimiento «Invisibilidad al final»

  let _on = false;           // ¿control activo (checkbox marcado)?
  // v41.61 — instante de CADA hoja: hoja (objeto de edPages) → ms desde que «empieza» (0 = lo que se ve al iniciarse la
  // reproducción de la hoja). Sin entrada = 0. Vive aquí, nunca en la hoja: no se guarda, no se serializa, no se copia.
  let _times = new WeakMap();
  let _shown = null;         // hoja cuyo instante se está mostrando en el reloj (para detectar el cambio de hoja)
  let _pv = new WeakMap();   // capa → { oc, arr, idx }: lienzo PROPIO con el fotograma mostrado (nunca se toca el _oc real)
  let _hold = null;          // pulsación sostenida en curso { dir, t0, n, timer }
  let _els = null;           // elementos del DOM { chk, bar, back, fwd, clock }

  const _pos = v => { v = +v; return v > 0 ? v : 0; };

  // ── Fuente de fotogramas (mismas condiciones que _edStartPageAnims para arrancar una animación) ──
  // ov (v41.61, opcional): Map capa→fotogramas leídos aparte para las animaciones de una hoja contigua cuyos
  // fotogramas no están en memoria (ver ghostFrames). Los fotogramas ya cargados de la capa mandan siempre.
  function frameSource(l, ov) {
    if (l.type === 'gif') {
      return (l._ready && l._frames && l._frames.length) ? { arr: l._frames, gif: true } : null;
    }
    if (l.type === 'image') {
      if (l._animReady && l._animFrames && l._animFrames.length) return { arr: l._animFrames, gif: false };
      const pf = ov && ov.get(l);
      return (pf && pf.length) ? { arr: pf, gif: false } : null;
    }
    return null;
  }

  // ── Parámetros de la línea de tiempo PROPIA de una animación (los que lee el visor) ──
  function animParams(l, fs) {
    const arr = fs.arr, n = arr.length, gif = fs.gif;
    const cum = new Array(n + 1); cum[0] = 0;
    for (let i = 0; i < n; i++) {
      const fr = arr[i];
      const d = gif ? ((fr && fr.delay) || 100)
                    : ((fr && fr.delay) || l._gcpFrameDelay || window._gcpFrameDelay || 100);
      cum[i + 1] = cum[i] + d;
    }
    const P = { n, cum, C: cum[n], gif };
    // Un GIF no tiene ninguna de estas opciones (solo bucle infinito con el retardo de cada fotograma).
    P.S    = gif ? 0 : _pos(l._gcpStartDelay) * 1000;            // retardo de inicio
    P.invB = !gif && !!l._gcpInvisBeforeStart;                   // invisible hasta el inicio
    P.grad = l._gcpInvisGradual !== false;                       // gradual (false = inmediato)
    P.stopAtEnd = !gif && !!l._gcpStopAtEnd;                     // detener tras 1 pasada
    P.R    = gif ? 0 : (+l._gcpRepeatCount || 0);                // repeticiones (0 = ∞)
    P.circ = !gif && !!l._gcpCircularEnd;
    P.invE = !gif && !!l._gcpInvisAtEnd;                         // invisible al final (solo con repeticiones)
    P.RD   = gif ? 0 : _pos(l._gcpRestartDelay) * 1000;          // reinicio automático tras N s (0 = no)
    P.SD2  = (P.invB && P.S > 0) ? P.S : 0;                      // en los reinicios el retardo solo se repite si hay invisibilidad
    P.K    = P.stopAtEnd ? 1 : (P.R > 0 ? Math.ceil(P.R) : Infinity); // pasadas hasta el final
    P.KC   = P.K * P.C;                                          // ms de reproducción hasta el final (Infinity si ∞)
    P.circEnd = !P.stopAtEnd && P.R > 0 && P.circ;               // al acabar vuelve al fotograma 0
    return P;
  }

  // Fotograma que toca u ms después de empezar a reproducir (bucle sobre los retardos por fotograma).
  function frameAtU(P, u) {
    const x = u % P.C;
    let lo = 0, hi = P.n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (P.cum[mid] <= x) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // ── Animación NO sincronizada con trayectoria: fotograma, opacidad relativa y reloj de la trayectoria ──
  // Devuelve { idx, fade, pe }: fotograma; factor de opacidad (null = natural, 0 = invisible, 0..1 = aparición/
  // desvanecimiento); y pe = ms transcurridos en el reloj de la trayectoria (que arranca con cada reproducción y
  // se congela mientras espera el reinicio — ver _edViewerMpTick: «if (l._restartTimer) return»).
  function animState(P, t) {
    const S = P.S, KC = P.KC, RD = P.RD;
    let j = 0, playStart = S, fireJ = 0;
    if (RD > 0 && isFinite(KC)) {
      const fire1 = S + KC + RD;                    // primer reinicio (fin + espera)
      if (t >= fire1) {
        const Pd = P.SD2 + KC + RD;                 // periodo de los ciclos siguientes
        j = 1 + Math.floor((t - fire1) / Pd);
        fireJ = fire1 + (j - 1) * Pd;
        playStart = fireJ + P.SD2;
      }
    }
    let idx = 0, fade = null, pe;
    if (t < playStart) {                            // esperando el inicio
      // Ciclo 0: fotograma 0. Reinicios con retardo de inicio: el visor no repinta hasta que acaba la espera, así que
      // sigue en el fotograma final del ciclo anterior (invisible: fade 0).
      idx = (j === 0) ? 0 : (P.circEnd ? 0 : P.n - 1);
      fade = (j === 0) ? ((S > 0 && P.invB) ? 0 : null) : 0;
      // ciclo 0: la trayectoria aún no ha arrancado; ciclos siguientes con retardo: sigue con el reloj anterior
      pe = (j === 0) ? 0 : KC + (t - (fireJ - RD));
    } else {
      const u = t - playStart;
      if (u < KC) {                                 // reproduciendo
        idx = frameAtU(P, u);
        const fadeIn = (j === 0) ? (S > 0 && P.invB) : (P.SD2 > 0);
        if (fadeIn && P.grad && u < FADE_IN_MS) fade = u / FADE_IN_MS;
        pe = u;
      } else {                                      // terminada (repeticiones agotadas / detener al final)
        idx = P.circEnd ? 0 : P.n - 1;
        if (P.invE && P.R > 0) fade = P.grad ? Math.max(0, 1 - (u - KC) / FADE_OUT_MS) : 0;
        else {                                      // la aparición gradual sigue aunque la animación sea más corta que ella
          const fadeIn = (j === 0) ? (S > 0 && P.invB) : (P.SD2 > 0);
          if (fadeIn && P.grad && u < FADE_IN_MS) fade = u / FADE_IN_MS;
        }
        pe = RD > 0 ? KC : u;                       // con reinicio pendiente la trayectoria se congela
      }
    }
    return { idx, fade, pe };
  }

  // ── Trayectoria SINCRONIZADA con la animación (ciclos): el recorrido dirige el fotograma ──
  // G = { cycleDurMs, cycles }. P puede ser null (capa con ciclos guardados pero sin fotogramas cargados).
  // Devuelve { idx, fade, e, totalMs }: e = ms del recorrido en este ciclo (ya acotado en el congelado).
  function syncState(l, P, G, t) {
    const S = P ? P.S : 0;
    const totalMs = G.cycles * G.cycleDurMs;        // rawT = 1
    const pathEnd = l._motionPathEnd || 'restart';
    const RD = P ? P.RD : 0;
    // En modo «Detener» con reinicio automático: al terminar el recorrido todo queda congelado RD ms y vuelve a empezar.
    const frozen = pathEnd === 'stop' && RD > 0;
    let x = 0, j = 0, e = 0;
    if (t >= S) {
      x = t - S;
      if (frozen) { const Pd = totalMs + RD; j = Math.floor(x / Pd); x -= j * Pd; }
      e = frozen ? Math.min(x, totalMs) : x;
    }
    let idx = null, fade = null;
    if (P) {
      idx = 0;
      if (t < S) {
        fade = (S > 0 && P.invB) ? 0 : null;
      } else {
        if (j === 0 && S > 0 && P.invB && P.grad && (t - S) < FADE_IN_MS) fade = (t - S) / FADE_IN_MS;
        // «Invisibilidad al final» en modo sincronizado: se dispara cuando las repeticiones de la animación
        // (ciclos de recorrido × ciclos por recorrido) se completan, y dura hasta el reinicio.
        if (P.invE && P.R > 0) {
          const Tinv = P.R * G.cycleDurMs;
          if (x >= Tinv && (!frozen || Tinv <= totalMs)) {
            fade = P.grad ? Math.max(0, 1 - (x - Tinv) / FADE_OUT_MS) : 0;
          }
        }
        const rawT = totalMs > 0 ? e / totalMs : 0;
        idx = AnimClock.mpSyncFrame(rawT, G.cycles, P.n, !!P.stopAtEnd, P.R, pathEnd, !!P.circ,
                                    AnimClock.layerCumTimeMs(l, P.n), l._gcpFrameHolds);
      }
    }
    return { idx, fade, e, totalMs };
  }

  // Lienzo propio con el fotograma idx (se reutiliza mientras no cambie el fotograma ni el array de fotogramas).
  // store: dónde se guarda (por defecto _pv, el de la hoja en vigor; el fantasma de una hoja contigua usa uno
  // desechable para no retener lienzos de fotograma de otras hojas).
  function ensureOc(l, fs, idx, store) {
    const fr = fs.arr[idx];
    const id = fr && fr.imageData;
    if (!id) return null;
    store = store || _pv;
    let pv = store.get(l);
    if (!pv) { pv = { oc: document.createElement('canvas'), arr: null, idx: -1 }; store.set(l, pv); }
    if (pv.oc.width !== id.width || pv.oc.height !== id.height) { pv.oc.width = id.width; pv.oc.height = id.height; pv.idx = -1; }
    if (pv.arr !== fs.arr || pv.idx !== idx) {
      pv.oc.getContext('2d').putImageData(id, 0, 0);
      pv.arr = fs.arr; pv.idx = idx;
    }
    return pv.oc;
  }

  // ── EVALUACIÓN DE LA HOJA EN EL INSTANTE t (ms) ───────────────────────────────────────────────
  // Devuelve Map<capa, { idx, fade, px, py, rot, oc }> solo para las capas con animación de fotogramas o
  // trayectoria (el resto no se menciona: se pintan como siempre). pw/ph: dimensiones del lienzo en px.
  //   idx/oc : fotograma a mostrar y su lienzo (null si la capa no es animación)
  //   fade   : factor de opacidad (null = la natural)
  //   px/py  : posición de la capa (fracción de hoja) por trayectoria / grupo — null si no se mueve
  //   rot    : grados extra de la orientación automática (null = 0)
  // opts (v41.61, solo el fantasma de una hoja contigua): { frames: Map capa→fotogramas leídos aparte, store: almacén
  // desechable de lienzos de fotograma }.
  function evaluate(page, t, pw, ph, withCanvases, opts) {
    const layers = (page && page.layers) || [];
    const ov = (opts && opts.frames) || null;
    const store = (opts && opts.store) || null;
    const map = new Map();
    const owners = [];
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      if (!l) continue;
      const hasPath = !!(l._motionPath && l._motionPath.length >= 2);
      const fs = frameSource(l, ov);
      if (!hasPath && !fs) continue;
      const st = { idx: null, fade: null, px: null, py: null, rot: null, oc: null };
      map.set(l, st);
      const P = fs ? animParams(l, fs) : null;
      if (!hasPath) {
        const a = animState(P, t);
        st.idx = a.idx; st.fade = a.fade;
      } else {
        const closed = l._motionPathClosed || false;
        // Misma regla que _edViewerMpTick: ciclos guardados → recorrido sincronizado con la animación.
        const cycleDurMs = (AnimClock.getCycleDurationMs(l)) || l._motionCyclesDur || 0;
        const cycles = l._motionCycles || 0;
        const isSync = cycleDurMs > 0 && cycles > 0;
        let rawT, freezeFn = null;
        if (isSync) {
          const G = { cycleDurMs, cycles };
          const a = syncState(l, P, G, t);
          st.idx = a.idx; st.fade = a.fade;
          rawT = a.totalMs > 0 ? a.e / a.totalMs : 0;
          if (P) {
            const cumTime = AnimClock.layerCumTimeMs(l, P.n), holds = l._gcpFrameHolds, nF = P.n;
            freezeFn = f => AnimClock.applyHoldFreeze(cumTime, nF, holds, cycles, f);
          }
        } else {
          let pe;
          if (P) {
            const a = animState(P, t);
            st.idx = a.idx; st.fade = a.fade; pe = a.pe;
          } else {
            // Sin fotogramas cargados: una animación aún sin montar espera su retardo de inicio; un objeto
            // normal espera su «Temporizador» (_motionPathDelay), ver _edMpDelayMs.
            const isAnim = (typeof _edMpIsAnim === 'function') && _edMpIsAnim(l);
            const start = isAnim ? (l.type === 'image' ? _pos(l._gcpStartDelay) * 1000 : 0)
                                 : ((typeof _edMpDelayMs === 'function') ? _edMpDelayMs(l, layers) : 0);
            pe = Math.max(0, t - start);
          }
          const totalPx = AnimClock.pathArcLengthPx(l._motionPath, closed, pw, ph);
          rawT = (pe / 1000) * (l._motionSpeed || 100) / totalPx;
        }
        const phase = AnimClock.pathPhaseAt(rawT, l._motionPathEnd || 'restart', l._motionPathAccel || 'none', isSync, freezeFn);
        const rel = AnimClock.pathPositionAt(l._motionPath, closed, phase.relT, pw, ph);
        const ang = l._motionPathOrient ? AnimClock.pathOrientDelta(l._motionPath, closed, phase.relT, pw, ph) : null;
        if (rel) owners.push({ l, i, rel, ang });
      }
    }
    // Traslación/rotación por trayectoria: AnimClock.applyPathOffset ESCRIBE en las capas que recibe (mueve el
    // grupo entero y sus capas de dibujo asociadas), así que se le pasan copias mínimas — nunca las capas reales.
    if (owners.length) {
      const proxies = layers.map(l => l
        ? { type: l.type, x: l.x, y: l.y, _uid: l._uid, _fillLayerId: l._fillLayerId, _drawLayerId: l._drawLayerId }
        : {});
      owners.forEach(o => {
        const l = o.l;
        const gidx = l.groupId
          ? layers.reduce((acc, l2, i2) => { if (l2 && l2.groupId === l.groupId) acc.push(i2); return acc; }, [])
          : null;
        AnimClock.applyPathOffset(proxies, proxies[o.i], gidx, o.rel, o.ang, pw, ph);
      });
      proxies.forEach((p, i) => {
        if (p._pathCurX == null) return;
        const l = layers[i];
        if (!l) return;
        let st = map.get(l);
        if (!st) { st = { idx: null, fade: null, px: null, py: null, rot: null, oc: null }; map.set(l, st); }
        st.px = p._pathCurX; st.py = p._pathCurY;
        st.rot = (p._pathCurRotDeg != null) ? p._pathCurRotDeg : null;
      });
    }
    if (withCanvases !== false) {
      map.forEach((st, l) => {
        if (st.idx == null) return;
        const fs = frameSource(l, ov);
        if (fs) st.oc = ensureOc(l, fs, st.idx, store);
      });
    }
    return map;
  }

  // ── Interfaz con el compositor del editor (_edAnimCtlBegin en editor.js) ──
  function isActive() { return _on; }

  // Hoja en vigor (la que se edita y se pinta en el canvas).
  function _curPage() {
    return (typeof edPages !== 'undefined' && typeof edCurrentPage !== 'undefined') ? (edPages[edCurrentPage] || null) : null;
  }
  // Instante (ms) de una hoja: el que se le fijó con la botonera, o 0 si nunca se le ha fijado ninguno.
  function timeOf(page) { return (page && _times.get(page)) || 0; }
  // Instante de la hoja en vigor (el del reloj).
  function getTime() { return timeOf(_curPage()); }

  // Estados de la hoja en vigor en SU instante, o null si no hay nada que animar / control inactivo.
  function statesFor(page) {
    if (!_on || !page) return null;
    if (page !== _shown) {
      // Cambio de hoja: el reloj pasa a mostrar el instante de ESA hoja (0 si no se le ha fijado ninguno; la hoja que
      // se deja conserva el suyo) y una pulsación sostenida no puede seguir moviendo el tiempo de la hoja nueva.
      _shown = page;
      _holdStop();
      _syncClock();
    }
    const map = evaluate(page, timeOf(page), edPageW(), edPageH(), true);
    return map.size ? map : null;
  }

  // ── Hojas contiguas (papel cebolla) en SU instante congelado — v41.61 ──────────────────────────────────────────
  // Estados de OTRA hoja (no la de vigor) en el instante que tiene fijado (0 si ninguno). pw/ph: dimensiones de ESA hoja
  // (su orientación). frames: ver ghostFrames. null si el control está inactivo o no hay nada que animar en la hoja.
  function ghostStates(page, pw, ph, frames) {
    if (!_on || !page) return null;
    const map = evaluate(page, timeOf(page), pw, ph, true, { frames: frames || null, store: new Map() });
    return map.size ? map : null;
  }

  // Una animación de fotogramas cuyos fotogramas NO están en memoria (se sueltan al salir de una hoja, ver
  // _edUnloadPageAnims) pero de la que hay datos para leerlos.
  function _needsFrames(l) {
    return !!l && l.type === 'image' && !(l._animReady && l._animFrames && l._animFrames.length) &&
      !!(l._animDeferred || l._apngSrc || (l._pngFrames && l._pngFrames.length) || l._pngFramesKey || l.animKey);
  }
  function ghostNeedsFrames(page) {
    return !!(_on && page && page.layers && page.layers.some(_needsFrames));
  }

  // Datos de una animación aún sin decodificar: los mismos orígenes y el mismo orden que _edLoadPageAnims.
  async function _frameInput(l) {
    if (l._apngSrc) return l._apngSrc;
    if (l._pngFrames && l._pngFrames.length) return l._pngFrames;
    const key = l._pngFramesKey || l.animKey;
    if (!key || typeof _edAnimIdbLoad !== 'function') return null;
    const data = await _edAnimIdbLoad(key);
    return (typeof data === 'string') ? data : ((Array.isArray(data) && data.length) ? data : null);
  }

  // Fotogramas de las animaciones de una hoja contigua, leídos y decodificados APARTE (ApngDecoder.decode no comparte
  // estado): no se toca ningún campo de las capas (_animFrames/_animReady/_animDeferred/_oc, ni la caja del objeto), así
  // que no interfiere con la carga real que hará la hoja cuando se entre en ella ni con el visor. El resultado solo vive
  // lo que tarde en pintarse el fantasma. isStale(): ¿ya no hace falta (se cambió de hoja, se desactivó el control…)?
  // Devuelve Map capa→fotogramas, o null si dejó de hacer falta a mitad.
  async function ghostFrames(page, isStale) {
    const out = new Map();
    if (!_on || !page || !page.layers || !window.ApngDecoder) return out;
    for (const l of page.layers) {
      if (!_needsFrames(l)) continue;
      if (isStale && isStale()) return null;
      try {
        const input = await _frameInput(l);
        if (!input) continue;
        if (isStale && isStale()) return null;
        // Mismo retardo por fotograma que ImageLayer.loadAnim (uniforme, o por fotograma con las pausas T de la Matriz).
        const uni = l._gcpFrameDelay || window._gcpFrameDelay || 100;
        const delay = (Array.isArray(input) && l._gcpFrameHolds && l._gcpFrameHolds.length)
          ? input.map((_, fi) => l._gcpFrameHolds[fi] || uni) : uni;
        const res = await window.ApngDecoder.decode(input, delay);
        if (res && res.frames && res.frames.length) out.set(l, res.frames);
      } catch (_) { /* una animación ilegible se queda como está en el fantasma; el resto sigue */ }
    }
    if (isStale && isStale()) return null;
    return out;
  }

  // ── Reloj ──
  function fmt(ms) {
    const ds = Math.floor(Math.max(0, ms) / 100);        // décimas de segundo
    const d = ds % 10, s = Math.floor(ds / 10) % 60, m = Math.floor(ds / 600) % 60, h = Math.floor(ds / 36000);
    const ss = (s < 10 ? '0' : '') + s;
    return h > 0 ? (h + ':' + (m < 10 ? '0' : '') + m + ':' + ss + '.' + d) : (m + ':' + ss + '.' + d);
  }
  function _syncClock() {
    if (_els && _els.clock) _els.clock.textContent = fmt(getTime());
  }

  function _invalidateCaches() {
    // Las cachés estáticas del arrastre/trazo incluyen el estado de las demás capas en el instante en que se
    // construyeron: al cambiar el tiempo hay que rehacerlas.
    if (typeof _edDragStatic !== 'undefined') _edDragStatic.valid = false;
    if (typeof _edPaintStatic !== 'undefined') _edPaintStatic.valid = false;
  }

  // Fija el instante de la HOJA EN VIGOR (cada hoja guarda el suyo).
  function setTime(ms) {
    const pg = _curPage();
    if (!pg) return;
    ms = Math.max(0, Math.round(+ms || 0));
    if (ms === timeOf(pg)) return;
    if (ms > 0) _times.set(pg, ms); else _times.delete(pg);
    _shown = pg;
    _syncClock();
    if (!_on) return;
    _invalidateCaches();
    if (typeof edRedraw === 'function') edRedraw();
  }

  function setActive(on) {
    on = !!on;
    if (on === _on) return;
    _on = on;
    _holdStop();
    _times = new WeakMap();                   // al activarlo o desactivarlo, todas las hojas vuelven a su 0
    _shown = on ? _curPage() : null;
    if (!on) _pv = new WeakMap();             // libera los lienzos de fotograma
    if (_els) {
      if (_els.chk && _els.chk.checked !== on) _els.chk.checked = on;
      _els.bar.classList.toggle('visible', on);
    }
    _syncClock();
    _invalidateCaches();
    // El fantasma del papel cebolla depende de este control (instante de cada hoja contigua): se rehace.
    if (typeof _edOnionAnimCtlChanged === 'function') _edOnionAnimCtlChanged();
    if (typeof edRedraw === 'function') edRedraw();
  }

  // ── Pulsación sostenida: +/−100 ms por fotograma, 10 fotogramas por segundo ──
  // El primer paso es inmediato (un toque corto = un fotograma). Después se cuenta contra el reloj real para que el
  // avance mantenga la velocidad real aunque algún temporizador llegue tarde (se aplican de golpe los pasos debidos).
  function _holdStart(dir) {
    _holdStop();
    _hold = { dir, t0: performance.now(), n: 0, timer: 0, page: _curPage() };
    const b = _els && (dir < 0 ? _els.back : _els.fwd);
    if (b) b.classList.add('held');                         // se ve «pulsado» mientras dure la pulsación
    _holdTick();
  }
  function _holdTick() {
    const h = _hold;
    if (!h) return;
    // v41.61: si se cambia de hoja con el botón aún pulsado (p. ej. con otro dedo en Android), la pulsación no sigue
    // moviendo el reloj de la hoja nueva (cada hoja tiene el suyo): hay que soltar y volver a pulsar.
    if (_curPage() !== h.page) { _holdStop(); return; }
    try {
      const now = performance.now();
      const due = Math.floor((now - h.t0) / STEP_MS) + 1;     // el +1 es el paso inmediato del instante 0
      const steps = due - h.n;
      if (steps > 0) {
        h.n = due;
        setTime(getTime() + h.dir * steps * STEP_MS);
      }
    } finally {
      // Se reprograma siempre (aunque el redibujado fallara) salvo que la pulsación ya se haya cancelado.
      if (_hold === h) h.timer = setTimeout(_holdTick, Math.max(1, h.t0 + h.n * STEP_MS - performance.now()));
    }
  }
  function _holdStop() {
    if (_hold) { clearTimeout(_hold.timer); _hold = null; }
    if (_els) {
      if (_els.back) _els.back.classList.remove('held');
      if (_els.fwd)  _els.fwd.classList.remove('held');
    }
  }

  function _bindHold(btn, dir) {
    if (btn.dataset.animctlInit === '1') return;           // ya enlazado (misma apertura del editor)
    btn.dataset.animctlInit = '1';
    let lastPtrAt = 0;                                     // último evento de puntero (para distinguir el clic "sintético" del teclado)
    btn.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      lastPtrAt = performance.now();
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      _holdStart(dir);
    });
    const end = e => {
      lastPtrAt = performance.now();
      _holdStop();
      try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', () => { lastPtrAt = performance.now(); _holdStop(); });
    // Pulsación larga en Android = menú contextual del navegador: fuera.
    btn.addEventListener('contextmenu', e => e.preventDefault());
    // Teclado (Enter/Espacio sobre el botón enfocado): un fotograma. Los clics que genera un toque o el ratón ya los
    // gestionó pointerdown (en algunos navegadores llegan con detail===0 y pointerType 'touch'/'mouse'), así que solo se
    // atiende el clic del teclado: sin pointerType y sin actividad de puntero en este botón en los últimos instantes.
    btn.addEventListener('click', e => {
      if (e.detail > 0 || e.pointerType) return;
      if (performance.now() - lastPtrAt < 250) return;          // el clic de un puntero llega a los pocos ms del pointerup
      setTime(getTime() + dir * STEP_MS);
    });
  }

  function initUI() {
    destroy();                                // restos de una apertura anterior del editor
    const chk = document.getElementById('dd-animctl-check');
    const bar = document.getElementById('edAnimCtlBar');
    if (!chk || !bar) return;
    _els = {
      chk, bar,
      back: document.getElementById('edAnimCtlBack'),
      fwd: document.getElementById('edAnimCtlFwd'),
      clock: document.getElementById('edAnimCtlClock')
    };
    chk.checked = false;
    if (chk.dataset.animctlInit !== '1') {
      chk.dataset.animctlInit = '1';
      chk.addEventListener('change', () => {
        setActive(chk.checked);
        if (typeof edCloseMenus === 'function') edCloseMenus();
      });
    }
    // La botonera recoge sus toques: sin esto llegarían a los listeners globales del editor sobre `document`
    // (deseleccionar el objeto, arrastrar guías…). Ver edStopCanvasLeak en utils.js.
    if (typeof edStopCanvasLeak === 'function') edStopCanvasLeak(bar);
    if (_els.back) _bindHold(_els.back, -1);
    if (_els.fwd)  _bindHold(_els.fwd, +1);
    document.addEventListener('visibilitychange', _onHidden);
    window.addEventListener('blur', _holdStop);
    _syncClock();
  }
  function _onHidden() { if (document.hidden) _holdStop(); }

  function destroy() {
    _holdStop();
    document.removeEventListener('visibilitychange', _onHidden);
    window.removeEventListener('blur', _holdStop);
    _on = false; _times = new WeakMap(); _shown = null;
    _pv = new WeakMap();
    if (_els && _els.bar) _els.bar.classList.remove('visible');
    _els = null;
  }

  return { STEP_MS, evaluate, statesFor, isActive, getTime, timeOf, setTime, setActive, initUI, destroy, fmt,
           ghostStates, ghostNeedsFrames, ghostFrames };
})();

if (typeof window !== 'undefined') window.EdAnimCtl = EdAnimCtl;
