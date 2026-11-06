/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
/* ============================================================
   diag.js — INTERRUPTOR DE DIAGNÓSTICO DE ESTE DISPOSITIVO (v42.54)

   Módulo COMÚN de la aplicación (index.html) y del reproductor externo (reader/index.html): una sola decisión por
   dispositivo para todo lo que sirve para diagnosticar. No lleva código de terceros.

   ESTADO — localStorage 'cx_diag_on' = '1' → diagnóstico ACTIVADO en este dispositivo; cualquier otra cosa (lo normal)
   → DESACTIVADO. La aplicación y el lector son del mismo origen (comxow.com): comparten localStorage y, por tanto, el
   interruptor. Se cambia SOLO desde Administración → Diagnóstico (js/admin.js, cuenta «admin»), así que cada dispositivo
   lo decide por sí mismo y los demás no se enteran.

   DESACTIVADO (valor de serie, en todos los dispositivos):
     · no se ve ningún botón de diagnóstico: el 🩺 del editor, el 📊 «Consumo de datos» y el 🔍 de «Mis obras», el 🩺 del
       editor de textos y el de la matriz de animación, el «Diag BD» de las obras en Administración;
     · NO se registra ni se guarda ningún dato de diagnóstico: ni el libro de consumo de datos (localStorage cx_egress_v1,
       lo escribían la app y el lector), ni los incidentes del editor (_edFCIncidents), ni la grabadora del lector
       (cx_rd_flight, una muestra cada 5 s), ni los registros que el editor, el editor de textos y el bloqueo de giro
       llevaban en memoria, ni el monitor de rendimiento del editor (envolvía requestAnimationFrame/setInterval y sacaba
       la pila de llamadas en cada uno);
     · al arrancar se BORRA lo que dejaran las versiones anteriores, que lo guardaban en todos los dispositivos.
   ACTIVADO: aparecen los botones y los registros se acumulan donde siempre (mismo formato y mismos límites de siempre).
   Al desactivarlo se borran. La pestaña de Administración recarga la página tras cambiarlo para que el monitor de
   rendimiento del editor, que se instala al arrancar, empiece o termine limpio.

   CONVENCIÓN PARA CÓDIGO NUEVO — todo lo que sirva solo para diagnosticar debe cumplirla, o volvería a gastar memoria en todos
   los dispositivos: (1) un registro (matriz, contador, copia de estado, medición…) empieza con «if (!CxDiag.on()) return;»
   —el editor lo tiene como _edDgOn(), el editor de textos como _tdDgOn()—; (2) un dato guardado en el dispositivo se añade
   a STORED (abajo) para que se borre al apagar; una matriz de window se añade a LOGS, y el estado privado de un módulo se
   vacía con CxDiag.onOff(fn); (3) un botón de diagnóstico lleva la clase «cx-diag-only» (o se pinta solo si CxDiag.on()).

   USO — CxDiag.on()            ¿está activado en este dispositivo?  (síncrono; es una variable, vale para rutas calientes)
         CxDiag.set(true|false) lo cambia: guarda el interruptor, pone/quita la clase «cx-diag-on» de <html> (css/main.css
                                muestra con ella los elementos con la clase «cx-diag-only») y, al apagarlo, borra los datos
         CxDiag.purge()         borra los datos de diagnóstico guardados y los registros en memoria (sin tocar el interruptor)
         CxDiag.stored()        { clave: caracteres, total } de lo guardado en este dispositivo (lo enseña Administración)
         CxDiag.onOff(fn)       registra una función que vacía el estado propio de un módulo cuando se borra todo
   Evento: «cxdiagchange» en window ({ detail: { on } }) cuando cambia, también si lo cambió otra pestaña.
   ============================================================ */
(function (root) {
  'use strict';

  var KEY = 'cx_diag_on';
  // Datos de diagnóstico que se guardan en el dispositivo (localStorage). Ninguno es de la obra ni de la cuenta: solo registros.
  var STORED = [
    'cx_egress_v1',    // libro de consumo de datos (EgressLedger en js/supabase-client.js; el lector escribe en el mismo)
    '_edFCIncidents',  // incidentes de dibujo/relleno que detecta el editor (_edFCFlagIncident en js/editor.js)
    'cx_rd_flight',    // grabadora del lector (_frStart en reader/reader.js)
    'cx_rd_diag'       // «el informe del lector está abierto» (?diag=1 en el lector)
  ];
  // Registros que viven en memoria como matrices en window (se vacían en el sitio: nadie guarda otra referencia).
  var LOGS = [
    '_edFCLog', '_edHistDiag', '_edDragPerfLog', '_edFollowLog', '_edTickLog', '_edBackLogLines', '_edRestoreLog',
    '_edHideCheckLog', '_edRotateLog', '_edVecHealLog', '_edQualityLog', '_edJankLog', '_gcpSwapLog',
    '_tdImeLog', '_tdApplyLog', '_tdImgLog', '_tdScrollLog', '_tdBreakLog'
  ];
  var hooks = [];

  function read() { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; } }
  var on = read();

  function paint() {
    try { var h = root.document && root.document.documentElement; if (h) h.classList.toggle('cx-diag-on', on); } catch (_) {}
  }
  function purge() {
    try { STORED.forEach(function (k) { localStorage.removeItem(k); }); } catch (_) {}
    LOGS.forEach(function (n) { try { var a = root[n]; if (Array.isArray(a)) a.length = 0; } catch (_) {} });
    hooks.forEach(function (f) { try { f(); } catch (_) {} });
  }
  function apply(v) {
    var was = on;
    on = !!v;
    paint();
    if (!on) purge();
    if (was !== on) { try { root.dispatchEvent(new CustomEvent('cxdiagchange', { detail: { on: on } })); } catch (_) {} }
  }
  function set(v) {
    v = !!v;
    try { if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (_) {}
    apply(v);
  }
  function stored() {
    var r = {}, total = 0;
    STORED.forEach(function (k) {
      var s = null;
      try { s = localStorage.getItem(k); } catch (_) {}
      if (s != null) { r[k] = s.length; total += s.length; }
    });
    r.total = total;
    return r;
  }

  // Otra pestaña (la app o el lector) cambió el interruptor: esta se pone al día.
  try {
    root.addEventListener('storage', function (e) {
      if (e.key !== KEY && e.key !== null) return;
      var v = read();
      if (v !== on) apply(v);
    });
  } catch (_) {}

  paint();
  if (!on) purge();   // arranque desactivado: fuera lo que dejaran las versiones anteriores (que lo guardaban siempre)

  root.CxDiag = {
    KEY: KEY,
    on: function () { return on; },
    set: set,
    purge: purge,
    stored: stored,
    onOff: function (fn) { if (typeof fn === 'function') hooks.push(fn); }
  };
})(window);
