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

    // Destruir vista anterior
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

    // Inyectar HTML
    container.innerHTML = def.html(params);

    // Clase del body (sin tocar lo que añade el header)
    document.body.className = def.bodyClass || '';

    // CSS de la vista
    (def.css || []).forEach(href => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = href;
        document.head.appendChild(l);
      }
    });

    // i18n
    if (typeof I18n !== 'undefined') I18n.applyAll();

    // Inicializar vista
    if (def.init) def.init(params);

    // Scroll top
    window.scrollTo(0, 0);
  }

  // Botón atrás
  window.addEventListener('popstate', e => {
    const s = e.state;
    if (s && s.view) _render(s.view, s.params || {});
    else _render('home', {});
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
