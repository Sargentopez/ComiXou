/* ============================================================
   router.js — SPA Router ComiXow
   ============================================================ */

const Router = (() => {
  const views = {};
  let currentView = null;

  function register(name, def) {
    views[name] = def;
  }

  function go(name, params = {}) {
    if (!views[name]) { console.error('Vista no encontrada:', name); return; }
    if (currentView && views[currentView] && views[currentView].destroy) {
      views[currentView].destroy();
    }
    history.pushState({ view: name, params }, '', '#' + name + (params.id ? '/' + params.id : ''));
    _render(name, params);
  }

  function _render(name, params = {}) {
    if (!views[name]) return;
    const def = views[name];
    currentView = name;

    const container = document.getElementById('appView');
    if (!container) return;

    container.innerHTML = def.html(params);
    document.body.className = def.bodyClass || '';

    // Cargar CSS de la vista
    (def.css || []).forEach(href => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = href;
        document.head.appendChild(l);
      }
    });

    // i18n
    if (typeof I18n !== 'undefined') I18n.applyAll();

    // Ajustar espaciado bajo el header — siempre, en toda vista
    _adjustSpacing(name);

    // Inicializar vista
    if (def.init) def.init(params);

    window.scrollTo(0, 0);
  }

  // Calcula la altura real del header y ajusta el contenido
  function _adjustSpacing(viewName) {
    function recalc() {
      const header  = document.getElementById('siteHeader');
      const pageNav = document.getElementById('pageNav');   // solo en home
      const appView = document.getElementById('appView');
      if (!header || !appView) return;

      const hh = header.getBoundingClientRect().height;

      if (pageNav) {
        // Home: pageNav debajo del header, appView debajo de ambos
        const nh = pageNav.getBoundingClientRect().height;
        pageNav.style.top = hh + 'px';
        // El padding va al comicsGrid, no al appView
        const list = document.getElementById('comicsGrid');
        if (list) list.style.paddingTop = (hh + nh) + 'px';
        appView.style.paddingTop = '0';
      } else {
        // Resto de vistas: appView empuja hacia abajo del header
        appView.style.paddingTop = hh + 'px';
      }
    }

    // Tres pasadas para pillar fuentes y layout finales
    recalc();
    document.fonts && document.fonts.ready.then(recalc);
    setTimeout(recalc, 200);
  }

  window.addEventListener('popstate', e => {
    const s = e.state;
    if (s && s.view) _render(s.view, s.params || {});
    else _render('home', {});
  });

  window.addEventListener('resize', () => {
    if (currentView) _adjustSpacing(currentView);
  });

  function start() {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const [name, id] = hash.split('/');
      if (views[name]) { _render(name, id ? { id } : {}); return; }
    }
    _render('home', {});
  }

  return { register, go, start };
})();
