/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
/* ============================================================
   anim-clock.js — Motor CENTRALIZADO de control de tiempos para
   animaciones con trayectoria (motion paths).

   Por qué existe este archivo (v38.06):
   Antes de esta versión, el cálculo de "qué fotograma toca mostrar y en
   qué punto de la trayectoria está el objeto en este instante" vivía
   copiado, casi letra por letra, en TRES sitios distintos:
     · js/editor.js      → _edViewerMpTick   (visor interno del editor)
     · js/editor.js      → _edMpPreviewTick  (previsualización en vivo
                                               del editor de trayectorias)
     · reader/reader.js  → _readerGifTick    (reproductor externo)
   Cada copia se ha ido corrigiendo por separado, sesión a sesión, y ya
   iban varias rondas de "el mismo bug estaba en editor.js y en
   reader.js" (ver cartas de sesiones anteriores). Este archivo es la
   ÚNICA fuente de verdad para esa matemática: editor.js y reader.js ya
   NO mantienen su propia copia — llaman aquí. Un arreglo futuro se
   escribe UNA vez y se aplica automáticamente en los tres sitios.

   Se carga como script normal (sin módulos ES, para mantener el estilo
   del proyecto — sin bundler) tanto en index.html como en
   reader/index.html, ANTES de editor.js/reader.js. Expone un único
   objeto global: window.AnimClock.

   Contiene dos capas:
     1. Matemática pura de trayectoria/tiempo (sin efectos secundarios,
        sin tocar el DOM ni disparar redibujados) — recibe datos, devuelve
        datos.
     2. AnimClock.applyPathOffset(): la única función que SÍ muta capas
        (escribe _pathCurX/_pathCurY/_pathCurRotDeg), porque mover un
        grupo de objetos junto con sus capas de dibujo asociadas es
        inherentemente una operación de escritura — pero sigue sin tocar
        el DOM ni disparar redibujados; eso es responsabilidad de quien
        llama.
   ============================================================ */

const AnimClock = (() => {

  // ── Bezier sampling para trayectorias cerradas ─────────────────────────
  // Genera numSamples puntos sobre la curva bezier de punto medio (igual
  // que el render). Garantiza que la animación siga la misma curva suave
  // que se dibuja visualmente.
  function bezierSampleClosed(pts, numSamples) {
    const n = pts.length;
    const result = [];
    for (let s = 0; s < numSamples; s++) {
      // +0.5: sin este desplazamiento, s=0 caería en u=0 del segmento 0 — el
      // límite ENTRE segmentos, que con la técnica de "punto medio" es el
      // punto medio entre el último punto y pts[0], NUNCA pts[0] exacto (el
      // punto solo se visita tal cual en u=0.5, sea cual sea su segmento).
      // Como pts[0] es el origen de la trayectoria (debe coincidir con la.x/la.y
      // al empezar/terminar cada vuelta), sin este ajuste la reproducción de
      // una trayectoria CERRADA arrancaba y cerraba en ese punto medio en vez
      // del origen real — un salto visible hacia un lado al cerrar el bucle.
      const tFull = (s / numSamples) * n + 0.5;
      const seg   = Math.floor(tFull) % n;
      const u     = tFull - Math.floor(tFull);
      const prev  = (seg - 1 + n) % n;
      const next  = (seg + 1) % n;
      const mp0x  = (pts[prev].x + pts[seg].x) / 2, mp0y = (pts[prev].y + pts[seg].y) / 2;
      const mp1x  = (pts[seg].x + pts[next].x)  / 2, mp1y = (pts[seg].y + pts[next].y)  / 2;
      if (pts[seg].sharp || seg === 0) {
        // Esquina dura (o el punto de origen, que SIEMPRE se trata así,
        // tenga o no guía marcada): pasar EXACTAMENTE por este punto, con
        // dos tramos rectos, en vez de la curva bezier suave.
        if (u < 0.5) {
          const uu = u / 0.5;
          result.push({ x: mp0x + (pts[seg].x - mp0x) * uu, y: mp0y + (pts[seg].y - mp0y) * uu });
        } else {
          const uu = (u - 0.5) / 0.5;
          result.push({ x: pts[seg].x + (mp1x - pts[seg].x) * uu, y: pts[seg].y + (mp1y - pts[seg].y) * uu });
        }
      } else {
        result.push({
          x: (1-u)*(1-u)*mp0x + 2*(1-u)*u*pts[seg].x + u*u*mp1x,
          y: (1-u)*(1-u)*mp0y + 2*(1-u)*u*pts[seg].y + u*u*mp1y
        });
      }
    }
    result.push({ x: result[0].x, y: result[0].y }); // cerrar el bucle
    return result;
  }

  // ── Motion path: interpolación por longitud de arco en espacio píxel ────
  // pw/ph: dimensiones reales del lienzo en px (corrige anisotropía horizontal/vertical)
  function pathPositionAt(points, closed, t, pw, ph) {
    if (!points || points.length === 0) return null;
    if (points.length === 1) return { x: points[0].x, y: points[0].y };
    const _pw = pw || 360, _ph = ph || 780;
    const pts = (closed && points.length >= 3)
      ? bezierSampleClosed(points, 200)
      : (closed ? [...points, points[0]] : points);
    const dists = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot((pts[i].x - pts[i-1].x) * _pw, (pts[i].y - pts[i-1].y) * _ph);
      dists.push(d);
      total += d;
    }
    if (total === 0) return { x: pts[0].x, y: pts[0].y };
    // t=1 en una trayectoria CERRADA equivale a t=0 (se completó la vuelta) — el
    // envolvente módulo es correcto ahí. En una ABIERTA, t=1 es el final real
    // y NO debe envolver a t=0: en JS, 1 % 1 da 0, así que sin esta distinción
    // pedir la posición justo en el final devolvía la del INICIO — de ahí un
    // giro/salto extraño al llegar al final de trayectorias abiertas, más
    // notorio aún al rebobinar (que sí llega a t=1 exacto en el pico del
    // rebote, no solo de forma transitoria como el muestreo de la tangente).
    const _t = closed ? (((t % 1) + 1) % 1) : Math.max(0, Math.min(1, t));
    const target = _t * total;
    let cum = 0;
    for (let i = 0; i < dists.length; i++) {
      if (cum + dists[i] >= target) {
        const f = dists[i] > 0 ? (target - cum) / dists[i] : 0;
        return { x: pts[i].x + (pts[i+1].x - pts[i].x) * f,
                 y: pts[i].y + (pts[i+1].y - pts[i].y) * f };
      }
      cum += dists[i];
    }
    return { x: pts[pts.length-1].x, y: pts[pts.length-1].y };
  }

  // Longitud total de la trayectoria en píxeles — usa bezier sample para bucles
  // cerrados (misma base que pathPositionAt, garantizando velocidad constante)
  function pathArcLengthPx(points, closed, pw, ph) {
    if (!points || points.length < 2) return 1;
    const _pw = pw || 360, _ph = ph || 780;
    const pts = (closed && points.length >= 3)
      ? bezierSampleClosed(points, 200)
      : (closed ? [...points, points[0]] : points);
    let total = 0;
    for (let i = 1; i < pts.length; i++)
      total += Math.hypot((pts[i].x - pts[i-1].x) * _pw, (pts[i].y - pts[i-1].y) * _ph);
    return total || 1;
  }

  // ── Motion path: ángulo de la tangente (grados) en el punto t de la trayectoria ──
  // Deriva la dirección local de la curva mediante diferencia finita sobre la misma
  // función de posición que usa el render (pathPositionAt), garantizando que la
  // orientación siga exactamente la curva visible (incluido el suavizado bezier de
  // los bucles cerrados). En los bordes de un trayecto abierto usa diferencia
  // hacia delante/atrás (sin envolver) para no mezclar con el extremo opuesto.
  function pathTangentDeg(points, closed, t, pw, ph) {
    if (!points || points.length < 2) return 0;
    const dt = 0.0015;
    const t0 = closed ? t - dt : Math.max(0, t - dt);
    const t1 = closed ? t + dt : Math.min(1, t + dt);
    const pA = pathPositionAt(points, closed, t0, pw, ph);
    const pB = pathPositionAt(points, closed, t1, pw, ph);
    if (!pA || !pB) return 0;
    const dx = (pB.x - pA.x) * pw, dy = (pB.y - pA.y) * ph;
    if (!dx && !dy) return 0;
    return Math.atan2(dy, dx) * 180 / Math.PI;
  }

  // Delta de rotación (grados) para orientar el objeto según la tangente de la
  // trayectoria en el instante t, relativo a la tangente inicial (t=0). Al ser
  // relativo, la orientación propia del objeto se conserva como punto de partida.
  function pathOrientDelta(points, closed, t, pw, ph) {
    return pathTangentDeg(points, closed, t, pw, ph) - pathTangentDeg(points, closed, 0, pw, ph);
  }

  // ── Easing para trayectorias: reasigna t dentro de [0,1] sin cambiar la duración ─
  // Easing Hermite por tramos: rápido lineal + frenado/arrancada cortos.
  // kt=0.75, kp=3kt/(1+2kt)=0.9 → derivada fase frenado P'(u)=0.3(u-1)²≥0 (monótona)
  function easeT(t, accel) {
    if (!accel || accel === 'none') return t;
    const c = t < 0 ? 0 : t > 1 ? 1 : t;
    const _eo = (x) => {
      const kt = 0.75, kp = 0.9, sl = kp / kt; // sl=1.2
      if (x < kt) return sl * x;
      const u = (x - kt) / (1 - kt), m = sl * (1 - kt); // m=0.3=3*(1-kp): garantía monotonía
      return (2*u*u*u - 3*u*u + 1)*kp + (u*u*u - 2*u*u + u)*m + (-2*u*u*u + 3*u*u);
    };
    if (accel === 'start')  return _eo(c);
    if (accel === 'end')    return 1 - _eo(1 - c);
    if (accel === 'middle') return c < 0.5 ? (1 - _eo(1 - 2*c)) / 2 : (1 + _eo(2*c - 1)) / 2;
    return t;
  }

  // ── Sincronización trayectoria↔animación respetando pausas por frame (T) ──────
  // Tiempo acumulado (ms) de una capa GCP/APNG/GIF. GIF: cada frame ya trae su
  // propio delay real (formato GIF), se usa tal cual. GCP/APNG: delay uniforme
  // salvo pausas explícitas por frame (holds, botón T).
  function layerCumTimeMs(la, totalF) {
    const cum = [0];
    if (la && la._gifFrames && la._gifFrames.length) {
      for (let fi = 0; fi < totalF; fi++) cum.push(cum[fi] + ((la._gifFrames[fi] && la._gifFrames[fi].delay) || 100));
    } else {
      const delayMs = (la && la._gcpFrameDelay) || 100;
      const holds = la && la._gcpFrameHolds;
      for (let fi = 0; fi < totalF; fi++) cum.push(cum[fi] + ((holds && holds[fi]) || delayMs));
    }
    return cum;
  }

  // Duración total de UN ciclo de animación (ms) para una capa ya insertada
  // (fuera de una sesión activa del editor de animación) — mismo criterio que
  // _gcpBuildCumTimeMs (editor.js, usado durante la propia edición), pero
  // leyendo los datos ya guardados en la capa.
  function getCycleDurationMs(la) {
    if (!la) return 0;
    if (la._gifFrames && la._gifFrames.length)
      return la._gifFrames.reduce((s, f) => s + (f.delay || 100), 0);
    if (la._gcpFramesData && la._gcpFramesData[0] && la._gcpFramesData[0].length) {
      const totalF = la._gcpFramesData[0].length;
      return layerCumTimeMs(la, totalF)[totalF];
    }
    if (la._pngFrames && la._pngFrames.length) {
      const totalF = la._pngFrames.length;
      return layerCumTimeMs(la, totalF)[totalF];
    }
    return 0;
  }

  // Nº total de frames "vivos" de una capa ya insertada (GIF/APNG/GCP), para
  // calcular su cumTime sin necesitar una sesión de edición GCP activa.
  function layerTotalFrames(la) {
    if (!la) return 0;
    if (la._gifFrames && la._gifFrames.length) return la._gifFrames.length;
    if (la._gcpFramesData && la._gcpFramesData[0]) return la._gcpFramesData[0].length;
    if (la._pngFrames && la._pngFrames.length) return la._pngFrames.length;
    if (la._animFrames && la._animFrames.length) return la._animFrames.length;
    return 0;
  }

  // Posición fraccional dentro de la secuencia de frames en el instante tMs,
  // respetando pausas: dentro de un frame con pausa, se queda fija en su índice
  // entero (sin parte fraccional) durante toda la duración de la pausa — no
  // avanza hacia el siguiente frame hasta que esta termine.
  function frameProgressAt(cumTime, totalF, tMs, holds) {
    if (totalF <= 0) return 0;
    const totalMs = cumTime[totalF];
    if (tMs <= 0 || totalMs <= 0) return 0;
    if (tMs >= totalMs) return totalF;
    for (let fi = 0; fi < totalF; fi++) {
      if (tMs >= cumTime[fi] && tMs < cumTime[fi + 1]) {
        const holdMs = (holds && holds[fi]) || 0;
        if (holdMs > 0) return fi; // congelado — sin parte fraccional durante la pausa
        const dur = cumTime[fi + 1] - cumTime[fi];
        return fi + (dur > 0 ? (tMs - cumTime[fi]) / dur : 0);
      }
    }
    return totalF;
  }

  // Convierte una fracción 0-1 de UN traversal completo de la trayectoria (que
  // puede abarcar varios ciclos de animación) en la fracción equivalente
  // respetando pausas — se aplica a la fracción "cruda" de cada modo de fin de
  // trayectoria (stop/rewind/restart) ANTES de la curva de aceleración, así la
  // trayectoria se congela exactamente cuando la animación se detiene, y ambos
  // retoman el avance juntos al terminar la pausa.
  function applyHoldFreeze(cumTime, totalF, holds, cycles, pathFrac01) {
    if (!(cycles > 0) || totalF <= 0 || !cumTime) return pathFrac01;
    const totalMs = cumTime[totalF];
    if (!(totalMs > 0)) return pathFrac01;
    const cycleUnits  = pathFrac01 * cycles;
    const cycleIdx    = Math.floor(cycleUnits);
    const fracInCycle = cycleUnits - cycleIdx;
    const warped      = frameProgressAt(cumTime, totalF, fracInCycle * totalMs, holds) / totalF;
    return (cycleIdx + warped) / cycles;
  }

  // Calcula el frame sincronizado al progreso del path, respetando el comportamiento
  // de la animación (stopAtEnd, repeatCount) — igual a lo que haría la animación
  // si empezara exactamente cuando empieza el path.
  //   rawT      : progreso del path 0→1 (crece más allá de 1 en restart/rewind)
  //   cycles    : ciclos de animación por traversal completo
  //   totalF    : total de frames de la animación
  //   stopAtEnd : detener en último frame tras 1 ciclo
  //   repeatCnt : detener en último frame tras N ciclos (0 = infinito)
  //   pathEnd   : comportamiento del path ('stop'|'restart'|'rewind')
  //   cumTime, holds: tiempo acumulado y pausas por frame — si se omiten, se
  //   asume velocidad uniforme.
  function mpSyncFrame(rawT, cycles, totalF, stopAtEnd, repeatCnt, pathEnd, circularEnd, cumTime, holds) {
    if (totalF < 1 || cycles <= 0) return 0;
    // En stop mode con repeticiones finitas, el path recorre repeatCnt veces (una por repetición).
    // _stopLimit indica hasta dónde puede llegar rawT antes de que todo se detenga.
    const _stopLimit = (pathEnd === 'stop' && repeatCnt > 1) ? repeatCnt : 1;
    // Caso especial: stop + circularEnd + fin alcanzado → frame 0 (estado inicial)
    if (pathEnd === 'stop' && rawT >= _stopLimit && circularEnd && repeatCnt > 0 && !stopAtEnd) return 0;
    // BUG CORREGIDO EN v37.96 (reportado por Alberto: trayectoria con "detener
    // al final del recorrido" + animación con reproducciones INFINITAS — al
    // llegar al final del recorrido, el objeto deja de moverse (correcto, lo
    // gestiona el llamante) pero la animación TAMBIÉN dejaba de reproducirse,
    // pese a estar configurada como infinita). Causa: en modo 'stop', iterT se
    // recortaba SIEMPRE a _stopLimit (aquí, 1, cuando repeatCnt es 0/infinito —
    // _stopLimit solo crece con repeticiones FINITAS mayores que 1, ver arriba)
    // — así que, pasado ese punto, cycleUnits/animProgress dejaban de crecer
    // para SIEMPRE, y el frame devuelto quedaba fijo aunque el propio
    // repeatCnt=0 más abajo diga expresamente "sigue en bucle sin límite".
    // Pedido explícito de Alberto: el recorrido y la reproducción de la
    // animación son dos contadores independientes — el recorrido se detiene
    // según SU propio fin configurado, la animación sigue reproduciéndose
    // hasta agotar SUS propias repeticiones (o para siempre, si son
    // infinitas), y solo coinciden si Alberto hace coincidir a propósito el
    // número de repeticiones con el número de ciclos del recorrido. Con
    // repeticiones infinitas no hay ningún límite que aplicar aquí: iterT
    // sigue creciendo sin recorte, igual que en modo 'restart'.
    // NO REPETIR: no volver a igualar _stopLimit/el recorte de iterT a
    // repeatCnt de forma incondicional — esa fue precisamente la versión
    // rota. Y NO volver a usar "vueltas completas == repeticiones" como
    // criterio de "recorrido terminado" (bug de v37.99/v37.100): el
    // recorrido SIEMPRE se detiene tras una sola vuelta completa (rawT>=1),
    // sea cual sea el nº de repeticiones de la animación — son contadores
    // independientes salvo que Alberto los haga coincidir a propósito.
    const iterT = (pathEnd === 'stop') ? (repeatCnt > 0 ? Math.min(rawT, _stopLimit - 1e-9) : rawT)
                : (pathEnd === 'rewind') ? (rawT % 2 < 1 ? rawT % 2 : 2 - rawT % 2)
                : (rawT % 1);  // restart: fracción dentro del traversal actual
    // Posición dentro del ciclo actual — respeta pausas por frame si se dispone
    // de cumTime (ver frameProgressAt); si no, reparto uniforme.
    const cycleUnits  = iterT * cycles;
    const cycleIdx    = Math.floor(cycleUnits);
    const fracInCycle = cycleUnits - cycleIdx;
    const _totalMsMp  = cumTime ? cumTime[totalF] : 0;
    const fiInCycle   = (cumTime && _totalMsMp > 0)
      ? frameProgressAt(cumTime, totalF, fracInCycle * _totalMsMp, holds)
      : fracInCycle * totalF;
    const animProgress = cycleIdx * totalF + fiInCycle;
    if (stopAtEnd) return Math.min(Math.floor(animProgress), totalF - 1);
    if (repeatCnt > 0) {
      const _done = (pathEnd === 'stop' && rawT >= _stopLimit)
                 || animProgress >= repeatCnt * totalF;
      return _done ? (circularEnd ? 0 : totalF - 1) : Math.floor(animProgress) % totalF;
    }
    return Math.floor(animProgress) % totalF;
  }

  // ── Fase de la trayectoria (stop/rewind/restart) → parámetro t con easing ──────
  // Único punto de verdad para "dado el progreso crudo rawT y el modo de fin de
  // trayectoria, ¿qué punto t (0-1, ya con easing) toca mostrar ahora?".
  // No muta nada ni programa temporizadores — quien llama decide qué hacer con
  // justStopped (marcar la capa, programar el reinicio, etc.), porque esa parte
  // sí difiere legítimamente entre editor y lector (uno usa setTimeout propio,
  // el otro un campo que consume su mismo ticker más adelante).
  //   pathEnd   : 'stop' | 'rewind' | 'restart' (por defecto)
  //   accel     : 'none' | 'start' | 'end' | 'middle'
  //   isSyncPth : true si hay animación sincronizada (aplica congelado por pausas)
  //   freezeFn  : función f(frac01) → frac01 congelada durante pausas (o identidad)
  // Devuelve { relT, justStopped }.
  function pathPhaseAt(rawT, pathEnd, accel, isSyncPth, freezeFn) {
    const freeze = freezeFn || (f => f);
    if (pathEnd === 'stop') {
      if (rawT >= 1) {
        return { relT: 0.9999, justStopped: true };
      }
      const frac = isSyncPth ? freeze(rawT % 1) : rawT;
      return { relT: easeT(frac, accel), justStopped: false };
    }
    if (pathEnd === 'rewind') {
      const cycle = rawT % 2;
      const posT0 = cycle <= 1 ? cycle : (2 - cycle);
      const posT  = isSyncPth ? freeze(posT0) : posT0;
      const isRwd = cycle > 1;
      const rwdAccel = (isRwd && accel === 'start') ? 'end'
                     : (isRwd && accel === 'end')   ? 'start'
                     : accel;
      return { relT: easeT(posT, rwdAccel), justStopped: false };
    }
    // restart (por defecto): loop, congelado durante pausas
    const frac = isSyncPth ? freeze(rawT % 1) : (rawT % 1);
    return { relT: easeT(frac, accel), justStopped: false };
  }

  // ── Aplica el desplazamiento de trayectoria a una capa (y, si forma parte de
  // un grupo, a TODOS sus compañeros de grupo — con o sin orientación
  // automática) más sus capas de dibujo asociadas (fill/pencil/watercolor).
  //
  // layers     : el array real donde viven las capas del grupo — la página que
  //              se está reproduciendo (page.layers en el visor / panel.layers
  //              en el lector / edLayers en el editor de trayectorias). SIEMPRE
  //              debe ser el array de la hoja/panel que se está reproduciendo
  //              AHORA MISMO, nunca una referencia global a "la página abierta
  //              para edición" — dos cosas que pueden no coincidir.
  // l          : la capa que lleva la trayectoria (l._motionPath).
  // memberIdxs : índices dentro de `layers` de los compañeros de grupo de l
  //              (incluye a l mismo), o null/[ ] si l va suelta.
  // rel        : { x, y } — desplazamiento en espacio de página (fracción).
  // angleDeg   : grados de rotación por orientación automática, o null.
  function applyPathOffset(layers, l, memberIdxs, rel, angleDeg, pw, ph) {
    if (!rel) return false;
    const arr = layers || [];
    const propagate = (m) => {
      const uid = m._uid || m._fillLayerId;
      if (!uid) return;
      arr.forEach(lk => {
        if ((lk.type === 'fill' || lk.type === 'pencil' || lk.type === 'watercolor') && lk._drawLayerId === uid) {
          lk._pathCurX = m._pathCurX; lk._pathCurY = m._pathCurY;
          if (m._pathCurRotDeg != null) lk._pathCurRotDeg = m._pathCurRotDeg; else delete lk._pathCurRotDeg;
        }
      });
    };
    const isGroup = memberIdxs && memberIdxs.length > 1;
    if (angleDeg != null && isGroup) {
      // Grupo con orientación automática activa: el grupo entero rota como un
      // solo objeto rígido — cada miembro ORBITA alrededor del centro común del
      // grupo, en vez de girar cada uno sobre su propio centro.
      let pivX = 0, pivY = 0, pivN = 0;
      memberIdxs.forEach(gi => {
        const m = arr[gi];
        if (!m || m.type === 'draw') return;
        pivX += m.x; pivY += m.y; pivN++;
      });
      if (!pivN) return false;
      pivX /= pivN; pivY /= pivN;
      const rad = angleDeg * Math.PI / 180, cosA = Math.cos(rad), sinA = Math.sin(rad);
      const pivCurX = pivX + rel.x, pivCurY = pivY + rel.y;
      memberIdxs.forEach(gi => {
        const m = arr[gi];
        if (!m) return;
        if (m.type === 'draw') {
          // No soporta rotación propia — se traslada con el grupo, sin orbitar.
          m._pathCurX = (m.x || 0.5) + rel.x;
          m._pathCurY = (m.y || 0.5) + rel.y;
          propagate(m);
          return;
        }
        const offX = (m.x - pivX) * pw, offY = (m.y - pivY) * ph;
        m._pathCurX = pivCurX + (offX * cosA - offY * sinA) / pw;
        m._pathCurY = pivCurY + (offX * sinA + offY * cosA) / ph;
        m._pathCurRotDeg = angleDeg;
        propagate(m);
      });
      return true;
    }
    if (isGroup) {
      // Grupo SIN orientación automática activa: aun así hay que mover a TODOS
      // los miembros, no solo a `l` — la traslación relativa es la misma para
      // cada uno (sin rotación/órbita, no hace falta). Sin este bloque el resto
      // del grupo se queda quieto (bug histórico ya corregido en la
      // previsualización del editor de trayectorias, ahora también aquí para
      // el visor y el lector, que hasta v38.06 lo tenían incompleto).
      memberIdxs.forEach(gi => {
        const m = arr[gi];
        if (!m) return;
        m._pathCurX = (m.x || 0.5) + rel.x;
        m._pathCurY = (m.y || 0.5) + rel.y;
        delete m._pathCurRotDeg;
        propagate(m);
      });
      return true;
    }
    // Objeto suelto (o grupo de 1, o sin memberIdxs resuelto).
    l._pathCurX = (l.x || 0.5) + rel.x;
    l._pathCurY = (l.y || 0.5) + rel.y;
    if (angleDeg != null) l._pathCurRotDeg = angleDeg; else delete l._pathCurRotDeg;
    propagate(l);
    return true;
  }

  return {
    bezierSampleClosed, pathPositionAt, pathTangentDeg, pathOrientDelta, pathArcLengthPx,
    easeT, layerCumTimeMs, getCycleDurationMs, layerTotalFrames, frameProgressAt,
    applyHoldFreeze, mpSyncFrame, pathPhaseAt, applyPathOffset
  };
})();

if (typeof window !== 'undefined') window.AnimClock = AnimClock;
