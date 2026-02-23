/* ============================================================
   router.js — SPA Router para ComiXow
   Gestiona navegación sin recarga de página.
   Uso: Router.go('home') | Router.go('editor') | Router.go('reader', {id:'...'})
   ============================================================ */

const Router = (() => {

  // ── Vistas registradas ──
  const views = {};
  let currentView = null;
  let currentParams = {};

  // El contenedor principal donde se inyectan las vistas
  const CONTAINER_ID = 'appView';

  // ── Registrar una vista ──
  function register(name, def) {
    // def = { css, html(), init(params), destroy() }
    views[name] = def;
  }

  // ── Navegar a una vista ──
  function go(name, params = {}) {
    const def = views[name];
    if (!def) { console.error('Router: vista no encontrada:', name); return; }

    // Destruir vista actual
    if (currentView && views[currentView] && views[currentView].destroy) {
      views[currentView].destroy();
    }

    // Actualizar history (para que el botón atrás funcione)
    const state = { view: name, params };
    history.pushState(state, '', '#' + name + (params.id ? '/' + params.id : ''));

    _render(name, params);
  }

  function _render(name, params) {
    const def = views[name];
    currentView   = name;
    currentParams = params;

    // Inyectar HTML de la vista en el contenedor
    const container = document.getElementById(CONTAINER_ID);
    if (!container) { console.error('Router: no existe #appView'); return; }

    container.innerHTML = def.html(params);

    // Aplicar clase CSS al body para estilos específicos de vista
    document.body.className = def.bodyClass || '';

    // Actualizar CSS dinámico si la vista lo necesita
    _loadCSS(def.css || []);

    // Reinicializar i18n para los nuevos elementos
    if (typeof I18n !== 'undefined') I18n.applyAll();

    // Reinicializar header para la nueva vista
    if (typeof Header !== 'undefined') Header.refresh();

    // Inicializar la vista
    if (def.init) def.init(params);

    // Scroll al top
    window.scrollTo(0, 0);
  }

  // ── Cargar CSS de vista (evita duplicados) ──
  const loadedCSS = new Set();
  function _loadCSS(hrefs) {
    hrefs.forEach(href => {
      if (loadedCSS.has(href)) return;
      loadedCSS.add(href);
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = href;
      document.head.appendChild(link);
    });
  }

  // ── Botón atrás del navegador ──
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
      _render(e.state.view, e.state.params || {});
    } else {
      _render('home', {});
    }
  });

  // ── Iniciar el router ──
  function start() {
    // Leer hash inicial
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const [name, id] = hash.split('/');
      const params = id ? { id } : {};
      if (views[name]) { _render(name, params); return; }
    }
    _render('home', {});
  }

  function getCurrent() { return { view: currentView, params: currentParams }; }

  return { register, go, start, getCurrent };
})();
