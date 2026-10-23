/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
/* ============================================================
   orient-lock.js — GIRO NATIVO DE LA PANTALLA SEGÚN LA HOJA (solo teléfono)   v42.10
   Compartido por el lector externo (reader/reader.js) y el visor interno del editor (js/editor.js).
   Sin código de terceros: solo APIs estándar (referencias al final de este comentario).

   QUÉ HACE (pedido de Alberto, 2026-10-23)
   En un TELÉFONO (nunca PC ni tablet), cada vez que se ACCEDE a una hoja —avanzando, retrocediendo, por un botón «ir a
   hoja», con la barra de hojas o desplazando— se comprueba la orientación de la hoja y, si no coincide con la de la
   pantalla, se pide al sistema el giro NATIVO de Android (Screen Orientation API, lock()). No se gira ni se anima NADA por
   código: el usuario gira el teléfono con la mano y el sistema ya lo tiene bloqueado en la familia correcta (un solo giro,
   sin «doble giro»). Esto NO repite el intento antiguo (RR-block, v40.63–v41.28, revertido por Alberto): aquel giraba la
   hoja por CSS además del giro nativo.
     · hoja HORIZONTAL → 'landscape'        (cualquiera de los dos sentidos horizontales, el que dé el sensor)
     · hoja VERTICAL   → 'portrait-primary' (la parte de arriba del teléfono es la de arriba de la hoja)

   REGLAS DEL NAVEGADOR (investigadas, no supuestas)
   · Chrome para Android solo concede lock() con la página en pantalla completa (Fullscreen API) o instalada como app, y lo
     SUELTA al salir de pantalla completa. Errores: SecurityError (Chrome) / NotAllowedError (especificación) = exige pantalla
     completa; NotSupportedError = el dispositivo no lo soporta (se desiste); AbortError = superada por otra petición.
   · En una pestaña normal NO existe ninguna vía estándar para girar sin pantalla completa. Lo que sí se puede (v42.10):
     entrar en pantalla completa sola cuando hace falta girar, con el gesto del propio usuario (requestFullscreen exige
     «activación transitoria»: la dan el toque —pointerup sin desplazamiento— y las teclas, durante unos 5 s; un deslizamiento
     que hace scroll NO cuenta; touchstart tampoco). Se intenta justo tras el toque que llevó a la hoja y, si no hay gesto
     reciente, se queda a la espera del siguiente toque (con un aviso). Si el usuario sale de pantalla completa NO se vuelve
     a entrar sola. Interruptor: ?autofs=0 / ?autofs=1. Al cerrar el visor interno, la pantalla completa que abrió él se cierra con
     él (como hace el lector al cerrarse); la que ya tenía el usuario se respeta.
   · El giro lo hace el sistema; esperar a que la hoja se encaje es cosa de los manejadores de resize de cada visor.

   ESPERA DE LAS ANIMACIONES HASTA QUE EL USUARIO GIRA EL TELÉFONO (v42.10, pedido de Alberto)
   Con el bloqueo, el sistema gira la pantalla al instante pero el usuario aún tiene el teléfono como antes: las
   animaciones empezaban «giradas» (de lado). Ahora, si hay un giro pendiente, las animaciones y trayectorias de la hoja
   NO arrancan hasta que se detecta que el usuario ha girado el aparato. La detección usa el acelerómetro: DeviceMotionEvent
   .accelerationIncludingGravity va en el sistema de coordenadas del DISPOSITIVO (no cambia con la orientación de la pantalla),
   así que da la orientación física aunque la pantalla esté bloqueada. Se compara solo la FAMILIA (vertical/horizontal) con
   histéresis y filtro, sin depender del signo de los ejes. Sin sensor, o con el teléfono plano (la gravedad no indica nada),
   se espera solo a que el sistema termine de girar la pantalla. Tope de seguridad de espera: HOLD_MAX_MS.

   Registro de todo lo ocurrido en el informe del modo ?diag=1 de cada visor. Interruptor general: ?giro=0 / ?giro=1.

   Referencias: W3C Screen Orientation (https://www.w3.org/TR/screen-orientation/) · MDN ScreenOrientation.lock() ·
   WHATWG HTML «activation triggering input event» y WPT html/user-activation/activation-trigger-touch (un scroll no activa) ·
   W3C Device Orientation and Motion (DeviceMotionEvent) · Android «Sensors overview → coordinate system».
   ============================================================ */

const OrientLock = (() => {
  'use strict';

  const HOLD_MAX_MS        = 12000; // tope de la espera de animaciones (si el usuario no gira, se sueltan)
  const READY_MS           = 350;   // pantalla y teléfono ya coinciden con la hoja, estables este tiempo
  const READY_NOSENSOR_MS  = 1000;  // sin información del sensor: margen tras girar la pantalla (animación del sistema)
  const ARR_WINDOW_MS      = 4000;  // tras llegar a una hoja, plazo en que una consecuencia del giro aún puede abrir la espera
  const GRANT_STALL_MS     = 2500;  // bloqueo concedido pero la pantalla no gira: no esperar más
  const FS_MAX_FAILS       = 4;     // intentos fallidos de pantalla completa automática antes de desistir

  // ── utilidades ─────────────────────────────────────────────
  const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function dispMode() {
    return ['fullscreen', 'standalone', 'minimal-ui', 'browser'].find(x => { try { return matchMedia('(display-mode: ' + x + ')').matches; } catch (_) { return false; } }) || '?';
  }
  // App instalada (WebAPK / pantalla de inicio): Chrome concede el bloqueo sin Fullscreen API
  function pwaMode() {
    try { return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || !!navigator.standalone; } catch (_) { return false; }
  }
  function screenFam() {
    const t = window.screen && screen.orientation && screen.orientation.type;
    if (t) return t.indexOf('landscape') === 0 ? 'landscape' : 'portrait';
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }
  // Interruptor persistente: ?param=0 lo desactiva en este dispositivo (queda guardado), ?param=1 lo reactiva.
  function wanted(param, key) {
    let q = null;
    try { q = new URLSearchParams(location.search).get(param); } catch (_) {}
    try {
      if (q === '0') { localStorage.setItem(key, '1'); return false; }
      if (q === '1') { localStorage.removeItem(key); return true; }
      return localStorage.getItem(key) !== '1';
    } catch (_) { return q !== '0'; }
  }
  // ¿Teléfono? Mismo criterio que IS_MOBILE_PHONE de reader/reader.js (ver el razonamiento allí): nunca la capacidad
  // táctil. Client Hints → iPad → iPhone/iPod → Android con «Mobile». Ante cualquier duda: false.
  function isPhone() {
    try {
      if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') return navigator.userAgentData.mobile;
      const ua = navigator.userAgent || '';
      if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return false;
      if (/iPhone|iPod/.test(ua)) return true;
      if (/Android/.test(ua)) return /Mobile/.test(ua);
      return false;
    } catch (_) { return false; }
  }

  // ══════════════════════════════════════════════════════════
  // SENSOR DE GIRO FÍSICO (acelerómetro) — compartido por todos los controladores
  // ══════════════════════════════════════════════════════════
  // Teléfono (orientación natural vertical, Android/Chrome): en reposo, vertical y derecho ≈ (0, +9,8, 0); horizontal ≈ (±9,8, 0, 0);
  // plano sobre la mesa ≈ (0, 0, 9,8). Se usa el ángulo entre el eje X y el Y: atan2(|x|, |y|) → 0° vertical, 90° horizontal.
  const Sense = (() => {
    const FLAT_IN = 2.5, FLAT_OUT = 3.4; // m/s² de gravedad sobre el plano de la pantalla: por debajo, teléfono casi plano (sin información)
    const BAND = 8;                      // grados de histéresis a cada lado de los 45° (zona muerta de 37° a 53°)
    const TAU = 90;                      // ms del filtro paso bajo
    let users = 0, listening = false, fam = null, since = 0, gx = 0, gy = 0, has = false, last = 0, n = 0, bad = 0, ang = null, hm = 0;
    const subs = [];
    const emit = () => subs.slice().forEach(f => { try { f(fam); } catch (_) {} });
    function onMotion(e) {
      const a = e && e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null) { bad++; return; }
      const x = +a.x, y = +a.y;
      if (!isFinite(x) || !isFinite(y)) { bad++; return; }
      const t = performance.now();
      if (!has) { gx = x; gy = y; has = true; }
      else { const k = 1 - Math.exp(-Math.min(200, Math.max(1, t - last)) / TAU); gx += (x - gx) * k; gy += (y - gy) * k; }
      last = t; n++;
      hm = Math.hypot(gx, gy);
      let nf = fam;
      if (hm < (fam ? FLAT_IN : FLAT_OUT)) nf = null;                  // casi plano: la gravedad no dice nada del giro
      else {
        ang = Math.atan2(Math.abs(gx), Math.abs(gy)) * 180 / Math.PI;
        if (!fam) nf = ang < 45 ? 'portrait' : 'landscape';
        else if (fam === 'portrait' && ang > 45 + BAND) nf = 'landscape';
        else if (fam === 'landscape' && ang < 45 - BAND) nf = 'portrait';
      }
      if (nf !== fam) { fam = nf; since = t; emit(); }
    }
    return {
      use() {
        users++;
        if (listening) return;
        listening = true;
        try { window.addEventListener('devicemotion', onMotion, { passive: true }); } catch (_) {}
      },
      free() {
        users = Math.max(0, users - 1);
        if (users > 0 || !listening) return;
        listening = false;
        try { window.removeEventListener('devicemotion', onMotion); } catch (_) {}
        has = false; fam = null; n = 0; bad = 0; ang = null;
      },
      get fam() { return fam; },                                                      // 'portrait' | 'landscape' | null (plano / sin datos)
      get ok() { return n >= 3 && (performance.now() - last) < 1500; },              // hay lecturas recientes
      get stableMs() { return fam ? performance.now() - since : 0; },
      onChange(f) { subs.push(f); return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; },
      describe() {
        if (!listening) return 'apagado';
        if (!n) return 'sin lecturas' + (bad ? ' (' + bad + ' vacías: sensor bloqueado o sin permiso)' : '') + ' → se espera solo al giro de la pantalla';
        return (fam || 'plano/indeciso') + ' · ' + (ang == null ? '?' : Math.round(ang) + '°') + ' · gravedad en pantalla ' + hm.toFixed(1) + ' m/s² · ' +
          (this.ok ? Math.round(this.stableMs) + ' ms estable' : 'SIN lecturas recientes') + ' · ' + n + ' lecturas';
      },
      _feed: onMotion,  // pruebas
    };
  })();

  // ══════════════════════════════════════════════════════════
  // CONTROLADOR (uno por visor)
  // ══════════════════════════════════════════════════════════
  // cfg: {
  //   name:        'lector' | 'visor' (prefijo del registro)
  //   eligible():  '' si el visor puede usar la función; si no, el motivo (se muestra en el informe)
  //   sheetFamily(idx): 'landscape' | 'portrait' de la hoja idx (null = aún no se sabe)
  //   getIdx():    hoja visible ahora (la que cuenta cuando salta el temporizador)
  //   onHold(on, why): la espera de animaciones empieza (on=true: congelar la hoja actual) o acaba (on=false: arrancarlas)
  //   hint(kind):  muestra un aviso al usuario ('tap' = «toca la pantalla para girarla»)
  // }
  function create(cfg) {
    cfg = cfg || {};
    const tag = cfg.name ? cfg.name + ' · ' : '';
    const S = {
      on: false, why: '', off: false, idx: -1, timer: 0, type: null, seq: 0, touching: 0, touchAt: 0, t0: performance.now(), log: [], lastSize: '',
      // pantalla completa automática
      fsAuto: false, fsUserOff: false, fsArmed: false, fsBusy: false, fsFails: 0, fsWas: false, fsTimer: 0, hints: 0, fsByUs: false,
      // espera de animaciones
      hold: false, holdIdx: -1, holdAt: 0, holdWhy: '', readyAt: 0, holdIv: 0, holds: 0, arrAt: 0, grantAt: 0, grantIdx: -1, noRot: -1, everLocked: false,
    };
    let ac = null, offSense = null;

    function log(m) {
      const o = window.screen && screen.orientation;
      S.log.push(((performance.now() - S.t0) / 1000).toFixed(1) + 's ' + tag + m + ' [pantalla ' + (o ? o.type + '/' + o.angle : '?') +
        ' · ventana ' + window.innerWidth + 'x' + window.innerHeight + ' · pantalla completa ' + (fsOn() ? 'sí' : 'no') + ']');
      if (S.log.length > 80) S.log.shift();
    }

    // ¿Hay algo que pueda girar la pantalla ahora? (bloqueo ya concedido, pantalla completa o app instalada)
    const canRotate = () => !S.off && !!(S.type || fsOn() || pwaMode());

    // ── Pantalla completa automática ────────────────────────
    function fsAllowed() {
      if (!S.on || !S.fsAuto || S.fsUserOff || S.fsFails >= FS_MAX_FAILS || document.hidden) return false;
      if (fsOn() || pwaMode()) return false;
      const el = document.documentElement;
      return !!(el.requestFullscreen || el.webkitRequestFullscreen);
    }
    function tryFs(why) {
      if (!fsAllowed() || S.fsBusy) return Promise.resolve(false);
      S.fsBusy = true;
      log('PIDE pantalla completa (' + why + ')');
      const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
      let pr; try { pr = req.call(el, { navigationUI: 'hide' }); } catch (e) { pr = Promise.reject(e); }
      return Promise.resolve(pr).then(() => true, e => { log('pantalla completa RECHAZADA ' + ((e && e.name) || e) + (e && e.name === 'TypeError' ? ' (sin gesto reciente del usuario)' : '')); return false; })
        .then(ok => {
          S.fsBusy = false;
          if (ok) { S.fsArmed = false; S.fsByUs = true; log('pantalla completa CONCEDIDA'); }
          else if (S.on) { S.fsFails++; arm(); }
          return ok;
        });
    }
    // Sin gesto utilizable: se espera al siguiente toque y se avisa (máx. 2 veces) de que hay que tocar
    function arm() {
      if (!fsAllowed()) return;
      if (!S.fsArmed) { S.fsArmed = true; log('a la espera de un toque para entrar en pantalla completa'); }
      if (S.hints < 2 && typeof cfg.hint === 'function') { S.hints++; try { cfg.hint('tap'); } catch (_) {} }
    }
    // La pantalla completa solo se pide si la hoja de ahora necesita girar la pantalla
    function wantFs(why) {
      if (!fsAllowed()) return;
      const fam = cfg.sheetFamily(typeof cfg.getIdx === 'function' ? cfg.getIdx() : S.idx);
      if (!fam || screenFam() === fam) return;
      tryFs(why);
    }
    function onGesture() { // pointerup: solo llega en toques que NO han hecho scroll (los mismos que dan activación al navegador)
      if (!S.fsArmed) return;
      clearTimeout(S.fsTimer);
      // Con un pequeño retardo: que los manejadores del propio toque (botón de enlace, créditos…) usen primero la activación
      // (requestFullscreen la consume y window.open la necesita)
      S.fsTimer = setTimeout(() => {
        if (!S.fsArmed) return;
        const fam = cfg.sheetFamily(typeof cfg.getIdx === 'function' ? cfg.getIdx() : S.idx);
        if (!fam || screenFam() === fam) { S.fsArmed = false; return; } // ya no hace falta
        tryFs('toque del usuario');
      }, 80);
    }

    // ── Espera de animaciones ───────────────────────────────
    // '' = no hay que esperar; si no, el motivo
    function holdNeed(idx) {
      if (!S.on || idx < 0 || !canRotate() || S.noRot === idx) return '';
      const fam = cfg.sheetFamily(idx);
      if (!fam) return '';
      const sf = screenFam();
      if (sf !== fam) return 'pantalla ' + sf + ', hoja ' + fam;
      if (Sense.ok && Sense.fam && Sense.fam !== fam) return 'teléfono en ' + Sense.fam + ', hoja ' + fam;
      return '';
    }
    function holdStart(why) {
      S.hold = true; S.holdIdx = S.idx; S.holdAt = performance.now(); S.holdWhy = why; S.readyAt = 0; S.holds++;
      log('ESPERA de animaciones: ' + why);
      clearInterval(S.holdIv); S.holdIv = setInterval(holdTick, 120);
      try { if (cfg.onHold) cfg.onHold(true, why); } catch (e) { console.warn('[OrientLock] onHold(true):', e); }
    }
    function holdEnd(why) {
      if (!S.hold) return;
      S.hold = false; clearInterval(S.holdIv); S.holdIv = 0;
      log('ANIMACIONES liberadas: ' + why + ' (' + Math.round(performance.now() - S.holdAt) + ' ms)');
      try { if (cfg.onHold) cfg.onHold(false, why); } catch (e) { console.warn('[OrientLock] onHold(false):', e); }
    }
    // Una consecuencia de pedir el giro (bloqueo concedido, pantalla completa recién entrada) puede abrir la espera, pero solo poco
    // después de llegar a la hoja: nunca porque el usuario incline el teléfono más tarde.
    function holdTryStart(why) {
      if (!S.on || S.hold || S.idx < 0 || (performance.now() - S.arrAt) > ARR_WINDOW_MS) return;
      const need = holdNeed(S.idx);
      if (need) holdStart(need + ' (' + why + ')');
    }
    function holdTick() {
      if (!S.hold) return;
      if (!S.on) { holdEnd('desactivado'); return; }
      if (document.hidden) { S.holdAt = performance.now(); return; } // en segundo plano no corre el tiempo máximo
      const now = performance.now(), idx = S.holdIdx;
      if (!canRotate())             { holdEnd('el giro ya no es posible (sin pantalla completa)'); return; }
      if (S.noRot === idx)          { holdEnd('el bloqueo fue rechazado'); return; }
      if (now - S.holdAt > HOLD_MAX_MS) { holdEnd('tiempo máximo (' + (HOLD_MAX_MS / 1000) + ' s)'); return; }
      const fam = cfg.sheetFamily(idx);
      if (!fam) return;
      const screenOk = screenFam() === fam;
      const known = Sense.ok && !!Sense.fam;
      const physOk = !known || Sense.fam === fam;
      if (S.grantIdx === idx && !screenOk && (now - S.grantAt) > GRANT_STALL_MS) { holdEnd('la pantalla no giró'); return; }
      if (screenOk && physOk) {
        if (!S.readyAt) S.readyAt = now;
        if (now - S.readyAt >= (known ? READY_MS : READY_NOSENSOR_MS)) holdEnd(known ? 'el teléfono ya está girado' : 'giro de la pantalla completado (sin lectura del sensor)');
      } else S.readyAt = 0;
    }

    // ── Bloqueo de orientación ──────────────────────────────
    function schedule(ms, why) {
      if (!S.on || S.off) return;
      clearTimeout(S.timer);
      S.timer = setTimeout(() => apply(why), ms);
    }
    function apply(why) {
      S.timer = 0;
      if (!S.on || S.off) return;
      if (document.hidden) { log('en segundo plano: se pedirá al volver'); return; }
      if (S.touching > 0 && (performance.now() - S.touchAt) < 3000) { schedule(150, why); return; } // no girar a mitad de un gesto
      const idx = typeof cfg.getIdx === 'function' ? cfg.getIdx() : S.idx;
      const fam = cfg.sheetFamily(idx);
      if (!fam) return;
      const want = fam === 'landscape' ? 'landscape' : 'portrait-primary';
      if (S.type === want && screenFam() === fam) return; // ya concedido y la pantalla ya está así: nada que pedir
      const seq = ++S.seq;
      S.everLocked = true;
      log('PIDE ' + want + ' · hoja ' + (idx + 1) + ' (' + why + ')');
      let pr;
      try { pr = screen.orientation.lock(want); } catch (e) { pr = Promise.reject(e); }
      Promise.resolve(pr).then(() => {
        if (seq !== S.seq) return;
        S.type = want; S.grantAt = performance.now(); S.grantIdx = idx; S.noRot = -1;
        log('CONCEDIDO ' + want);
        holdTryStart('bloqueo concedido');
      }, e => {
        if (seq !== S.seq) return; // superada por una petición posterior (AbortError): su respuesta es la que cuenta
        S.type = null;
        const n = (e && e.name) || String(e);
        if (n === 'NotSupportedError') S.off = true;
        const needsFs = n === 'SecurityError' || n === 'NotAllowedError';
        log('RECHAZADO ' + n + (needsFs ? ' (el navegador exige pantalla completa)' : ''));
        S.noRot = idx; // sin giro posible para esta hoja: nada que esperar
        if (S.hold) holdEnd('bloqueo rechazado (' + n + ')');
        if (needsFs) wantFs('bloqueo rechazado');
      });
    }

    // ── API ─────────────────────────────────────────────────
    // Se llama al ACCEDER a una hoja (avanzar, retroceder, salto, barra, scroll, arranque). Solo actúa si cambia la hoja.
    function onSheet(idx, o) {
      if (!S.on || idx === S.idx) return;
      o = o || {};
      const first = S.idx < 0;
      S.idx = idx; S.arrAt = performance.now(); S.noRot = -1; S.grantIdx = -1;
      if (!(S.fsArmed && screenFam() !== cfg.sheetFamily(idx))) S.fsArmed = false; // el aviso de «toca» era de otra hoja
      // 1) espera de animaciones: se decide AHORA, antes de que arranquen
      const need = holdNeed(idx);
      if (need) {
        if (S.hold) { S.holdIdx = idx; S.holdAt = S.arrAt; S.readyAt = 0; S.holdWhy = need; log('ESPERA de animaciones (otra hoja): ' + need); try { if (cfg.onHold) cfg.onHold(true, need); } catch (e) { console.warn('[OrientLock] onHold:', e); } }
        else holdStart(need);
      } else if (S.hold) holdEnd('hoja ' + (idx + 1) + ' sin giro pendiente');
      // 2) giro: se programa (los visores se enganchan al resize un instante después de abrir)
      schedule(o.delay != null ? o.delay : (first ? 500 : 40), 'hoja ' + (idx + 1));
    }

    function init() {
      S.on = false;
      const hasApi = !!(window.screen && screen.orientation && typeof screen.orientation.lock === 'function');
      const why = typeof cfg.eligible === 'function' ? cfg.eligible() : '';
      if (why)                           S.why = why;
      else if (!hasApi)                  S.why = 'este navegador no implementa screen.orientation.lock()';
      else if (!wanted('giro', 'cx_rd_norot')) S.why = 'desactivado con ?giro=0';
      else S.why = '';
      if (S.why) return false;
      S.on = true; S.off = false; S.idx = -1; S.type = null; S.noRot = -1; S.fsArmed = false; S.fsUserOff = false; S.fsFails = 0; S.hints = 0; S.fsByUs = false;
      S.fsAuto = wanted('autofs', 'cx_rd_noautofs');
      S.fsWas = fsOn();
      ac = new AbortController();
      const sig = { signal: ac.signal };
      const touch = e => { S.touching = e.touches ? e.touches.length : 0; S.touchAt = performance.now(); };
      ['touchstart', 'touchend', 'touchcancel'].forEach(ev => document.addEventListener(ev, touch, { capture: true, passive: true, signal: ac.signal }));
      document.addEventListener('pointerup', onGesture, { capture: true, passive: true, signal: ac.signal });
      // Chrome suelta el bloqueo al salir de pantalla completa (se queda con la orientación que tuviera) y solo vuelve a
      // concederlo dentro de ella: al cambiar el estado, se olvida lo concedido y, al entrar, se vuelve a pedir.
      const onFs = () => {
        const on = fsOn();
        log('pantalla completa ' + (on ? 'ACTIVADA' : 'DESACTIVADA'));
        if (!on) S.fsByUs = false; // ya se salió (el usuario o el sistema): al cerrar el visor no hay nada que soltar
        if (S.fsWas && !on) { S.fsUserOff = true; S.fsArmed = false; log('salida de pantalla completa: no se vuelve a entrar sola'); }
        if (!S.fsWas && on)  { S.fsUserOff = false; S.fsArmed = false; }
        S.fsWas = on;
        S.type = null; S.noRot = -1;
        if (on) { schedule(0, 'pantalla completa'); holdTryStart('pantalla completa'); }
        else if (S.hold) holdTick();
      };
      document.addEventListener('fullscreenchange', onFs, sig);
      document.addEventListener('webkitfullscreenchange', onFs, sig);
      document.addEventListener('visibilitychange', () => {
        log(document.hidden ? 'página oculta' : 'página visible');
        if (!document.hidden) { S.type = null; S.holdAt = performance.now(); schedule(50, 'visible'); }
      }, sig);
      window.addEventListener('pageshow', e => { if (e.persisted) { S.type = null; schedule(50, 'pageshow'); } }, sig);
      try { screen.orientation.addEventListener('change', () => { log('screen.orientation change'); if (S.hold) holdTick(); }, sig); } catch (_) {}
      window.addEventListener('resize', () => {
        const sz = window.innerWidth + 'x' + window.innerHeight;
        if (sz !== S.lastSize) { S.lastSize = sz; log('resize'); }
      }, sig);
      Sense.use();
      offSense = Sense.onChange(() => { if (S.hold) holdTick(); });
      log('activo · ' + (cfg.name || '') + ' · pantalla completa automática ' + (S.fsAuto ? 'sí' : 'no (?autofs=0)'));
      return true;
    }

    // Visor interno: al cerrarlo se suelta el bloqueo (el editor vuelve a girar libre). El lector nunca llama a esto.
    function stop() {
      if (!S.on) return;
      const leaveFs = S.fsByUs && fsOn(); // ¿la pantalla completa actual la abrió este visor (y nadie la ha tocado desde entonces)?
      S.on = false;
      clearTimeout(S.timer); S.timer = 0; clearTimeout(S.fsTimer); S.fsTimer = 0;
      if (S.hold) { S.hold = false; clearInterval(S.holdIv); S.holdIv = 0; }
      if (ac) { ac.abort(); ac = null; }
      if (offSense) { offSense(); offSense = null; }
      Sense.free();
      S.seq++; S.idx = -1; S.fsArmed = false;
      if (S.everLocked) { try { screen.orientation.unlock(); } catch (_) {} S.everLocked = false; }
      S.type = null; S.fsByUs = false;
      // La pantalla completa que abrió el propio visor se cierra con él (igual que el lector, que sale de ella al cerrarse);
      // la que ya tenía el usuario, o la que activó él a mano después, se respeta.
      if (leaveFs) { try { const ex = document.exitFullscreen || document.webkitExitFullscreen; const p = ex && ex.call(document); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch (_) {} }
      log('detenido' + (leaveFs ? ' · sale de la pantalla completa que abrió el visor' : ''));
    }

    function report() {
      const out = ['— giro nativo de la pantalla — ' + (S.on ? 'ACTIVO' : 'inactivo: ' + S.why) + (S.off ? ' (el dispositivo dijo NotSupportedError)' : '') +
        ' · modo de visualización ' + dispMode() + ' · bloqueo concedido ' + (S.type || 'ninguno')];
      if (S.on) {
        out.push('   pantalla completa automática: ' + (!S.fsAuto ? 'desactivada (?autofs=0)' : S.fsUserOff ? 'en pausa (el usuario salió de pantalla completa)' : S.fsFails >= FS_MAX_FAILS ? 'desistida (' + S.fsFails + ' intentos fallidos)' : S.fsArmed ? 'a la espera de un toque' : 'lista') + ' · intentos fallidos ' + S.fsFails + (S.fsByUs ? ' · abierta por el propio visor (se cierra con él)' : ''));
        out.push('   sensor de giro: ' + Sense.describe());
        out.push('   espera de animaciones: ' + (S.hold ? 'EN CURSO desde hace ' + Math.round((performance.now() - S.holdAt) / 1000) + ' s (' + S.holdWhy + ')' : 'no') + ' · esperas hechas ' + S.holds);
      }
      S.log.slice(-25).forEach(l => out.push(l));
      return out.join('\n');
    }

    return { state: S, init, stop, onSheet, report, holding: () => S.hold, tryFs, _apply: apply, _holdTick: holdTick };
  }

  return { create, isPhone, sense: Sense, pwaMode, fsOn, screenFam };
})();
