/* ============================================================
   i18n.js — Internacionalización
   Detecta idioma del dispositivo automáticamente.
   Soporta: es, en
   ============================================================ */

const TRANSLATIONS = {
  es: {
    // Cabecera
    tagline:          "La creatividad es la inteligencia divirtiéndose",
    register:         "Regístrate",
    login:            "Entrar",
    myComics:         "Mis creaciones",
    logout:           "Cerrar sesión",
    adminPanel:       "⚙️ Panel admin",
    deleteAccount:    "Eliminar mi cuenta",
    moreOptions:      "Más opciones",

    // Index / filtros
    filterBtn:        "Filtros ▾",
    novedades:        "Novedades",
    create:           "Crear",
    byGenre:          "Género ›",
    byAuthor:         "Autor ›",
    noGenres:         "Sin géneros disponibles",
    noAuthors:        "Sin autores disponibles",
    noComics:         "Aún no hay obras publicadas.",
    beFirst:          "¡Sé el primero en crear uno!",
    read:             "Leer",
    edit:             "Editar",
    unpublish:        "Dejar de publicar",
    delete:           "Eliminar",

    // Confirmaciones
    confirmUnpublish: "¿Retirar esta obra del índice?\n\nPodrás seguir editándola desde \"Crear\" → \"Mis creaciones\".",
    confirmDelete:    "Si eliminas este proyecto, ya no podrás acceder a él.\n\nSi solo quieres que no esté publicado pero quieres seguir editándolo, elige \"Dejar de publicar\".",
    confirmDeleteAccount: "Si eliminas tu cuenta se borrarán todos tus datos y cómics.\n\nEsta acción no se puede deshacer.",
    unpublishOk:      "Obra retirada del índice",
    deleteOk:         "Obra eliminada",

    // Auth
    pageLogin:        "Iniciar sesión",
    pageRegister:     "Crear cuenta",
    email:            "Email",
    password:         "Contraseña",
    passwordConf:     "Confirmar contraseña",
    username:         "Nombre de usuario",
    submitLogin:      "Entrar",
    submitRegister:   "Crear cuenta",
    noAccount:        "¿No tienes cuenta?",
    hasAccount:       "¿Ya tienes cuenta?",
    forgotPass:       "¿Olvidaste tu contraseña?",
    errRequired:      "Este campo es obligatorio",
    errEmail:         "Email no válido",
    errPassLen:       "Mínimo 6 caracteres",
    errPassMatch:     "Las contraseñas no coinciden",
    errUserExists:    "El usuario ya existe",
    errUserNotFound:  "Usuario o contraseña incorrectos",
    loginOk:          "¡Bienvenido/a de vuelta!",
    registerOk:       "¡Cuenta creada! Ya puedes entrar.",
    logoutOk:         "Sesión cerrada",

    // Editor
    newProject:       "Nuevo proyecto",
    comicTitle:       "Título",
    comicDesc:        "Descripción (opcional)",
    comicGenre:       "Género",
    genrePlaceholder: "Escribe uno nuevo...",
    genreSelect:      "— Elige un género —",
    genreOr:          "o",
    createProject:    "Crear proyecto",
    saveBtn:          "Guardar",
    publishBtn:       "📖 Publicar",
    publishOk:        "¡Obra publicada!",
    saveOk:           "Guardado",
    addDialog:        "💬 Bocadillo",
    addHeader:        "📋 Cabecera",
    addFooter:        "📝 Pie",
    writeText:        "Escribe tu texto",
    tailTitle:        "Cola del bocadillo",
    tailPrompt:       "¿Desde qué lado sale la cola?",
    tailTop:          "↑ Arriba",
    tailRight:        "→ Derecha",
    tailBottom:       "↓ Abajo",
    tailLeft:         "← Izquierda",

    // Reader
    endOfComic:       "¡Fin del cómic!",

    // Admin
    pendingTab:       "Pendientes de aprobación",
    publishedTab:     "Publicados",
    usersTab:         "Usuarios",
    approve:          "✓ Aprobar",
    unpublishAdmin:   "Retirar",
    deleteAdmin:      "Eliminar",
    noPending:        "No hay obras pendientes de aprobación.",
    noPublished:      "No hay obras publicadas.",
    noUsers:          "No hay usuarios registrados.",
    noWork:           "Sin título",
    workNotFound:     "Obra no encontrada",
    panelOf:          "Viñeta {n} de {total}",
    draft:            "Borrador",
    published2:       "Publicada",
    panelWord:        "viñeta",
    panelsWord:       "viñetas",
    noPermission:     "No tienes permiso para editar esta obra",
    writeTitle:       "Escribe un título",
    selectPanelFirst: "Selecciona una viñeta primero",
    blockExists:      "Ya existe un bloque de ese tipo en esta viñeta",
    newWorkEmpty:     "Aún no tienes ninguna obra.\n¡Crea la primera!",
    workRemovedHome:  "Obra retirada",
    workDeleted:      "Obra eliminada",
    approveOk:        "Obra aprobada y publicada",
    retireOk:         "Obra retirada del índice",
    userDeleted:      "Usuario eliminado",
    by:               "por",
  },
  en: {
    tagline:          "Creativity is intelligence having fun",
    register:         "Sign Up",
    login:            "Sign In",
    myComics:         "My Works",
    logout:           "Sign Out",
    adminPanel:       "⚙️ Admin panel",
    deleteAccount:    "Delete my account",
    moreOptions:      "More options",

    filterBtn:        "Filters ▾",
    novedades:        "Latest",
    create:           "Create",
    byGenre:          "Genre ›",
    byAuthor:         "Author ›",
    noGenres:         "No genres available",
    noAuthors:        "No authors available",
    noComics:         "No works published yet.",
    beFirst:          "Be the first to create one!",
    read:             "Read",
    edit:             "Edit",
    unpublish:        "Unpublish",
    delete:           "Delete",

    confirmUnpublish: "Remove this comic from the index?\n\nYou can keep editing it from \"Create\" → \"My comics\".",
    confirmDelete:    "If you delete this project you won\'t be able to access it anymore.\n\nIf you just want it unlisted but still editable, choose \"Unpublish\".",
    confirmDeleteAccount: "Deleting your account will remove all your data and comics.\n\nThis action cannot be undone.",
    unpublishOk:      "Work removed from index",
    deleteOk:         "Work deleted",

    pageLogin:        "Sign In",
    pageRegister:     "Create Account",
    email:            "Email",
    password:         "Password",
    passwordConf:     "Confirm password",
    username:         "Username",
    submitLogin:      "Sign In",
    submitRegister:   "Create account",
    noAccount:        "Don\'t have an account?",
    hasAccount:       "Already have an account?",
    forgotPass:       "Forgot your password?",
    errRequired:      "This field is required",
    errEmail:         "Invalid email",
    errPassLen:       "Minimum 6 characters",
    errPassMatch:     "Passwords do not match",
    errUserExists:    "User already exists",
    errUserNotFound:  "Wrong user or password",
    loginOk:          "Welcome back!",
    registerOk:       "Account created! You can now sign in.",
    logoutOk:         "Signed out",

    newProject:       "New project",
    comicTitle:       "Title",
    comicDesc:        "Description (optional)",
    comicGenre:       "Genre",
    genrePlaceholder: "Type a new one...",
    genreSelect:      "— Choose a genre —",
    genreOr:          "or",
    createProject:    "Create project",
    saveBtn:          "Save",
    publishBtn:       "📖 Publish",
    publishOk:        "Work published!",
    saveOk:           "Saved",
    addDialog:        "💬 Speech bubble",
    addHeader:        "📋 Header",
    addFooter:        "📝 Footer",
    writeText:        "Write your text",
    tailTitle:        "Speech bubble tail",
    tailPrompt:       "Which side does the tail come from?",
    tailTop:          "↑ Top",
    tailRight:        "→ Right",
    tailBottom:       "↓ Bottom",
    tailLeft:         "← Left",

    endOfComic:       "End of comic!",

    pendingTab:       "Pending approval",
    publishedTab:     "Published",
    usersTab:         "Users",
    approve:          "✓ Approve",
    unpublishAdmin:   "Unpublish",
    deleteAdmin:      "Delete",
    noPending:        "No works pending approval.",
    noPublished:      "No published works.",
    noUsers:          "No registered users.",
    noWork:           "Untitled",
    workNotFound:     "Work not found",
    panelOf:          "Panel {n} of {total}",
    draft:            "Draft",
    published2:       "Published",
    panelWord:        "panel",
    panelsWord:       "panels",
    noPermission:     "You don't have permission to edit this work",
    writeTitle:       "Write a title",
    selectPanelFirst: "Select a panel first",
    blockExists:      "A block of that type already exists in this panel",
    newWorkEmpty:     "You have no works yet.\nCreate your first one!",
    workRemovedHome:  "Work removed",
    workDeleted:      "Work deleted",
    approveOk:        "Work approved and published",
    retireOk:         "Work removed from index",
    userDeleted:      "User deleted",
    by:               "by",
  }
};

const I18n = (() => {
  // Detectar idioma del dispositivo, guardar preferencia
  function detectLang() {
    const saved = localStorage.getItem('cs_lang');
    if (saved && TRANSLATIONS[saved]) return saved;
    const nav = (navigator.language || navigator.userLanguage || 'es').slice(0, 2).toLowerCase();
    return TRANSLATIONS[nav] ? nav : 'es';
  }

  let lang = detectLang();

  function t(key) {
    return (TRANSLATIONS[lang]?.[key]) || (TRANSLATIONS['es']?.[key]) || key;
  }

  function applyAll() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = t(key);
      } else {
        el.textContent = t(key);
      }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
  }

  function setLang(l) {
    if (!TRANSLATIONS[l]) return;
    lang = l;
    localStorage.setItem('cs_lang', l);
    applyAll();
  }

  function getLang() { return lang; }

  document.addEventListener('DOMContentLoaded', applyAll);

  return { t, setLang, getLang, applyAll };
})();
