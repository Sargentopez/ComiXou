/* ============================================================
   i18n.js — Sistema de internacionalización
   ============================================================ */

const TRANSLATIONS = {
  es: {
    tagline:       "Crea y comparte tus cómics",
    register:      "Regístrate",
    login:         "Inicia sesión",
    myComics:      "Mis Cómics",
    logout:        "Cerrar sesión",
    heroTitle:     "ComicShow",
    heroSubtitle:  "Crea y comparte tus cómics",
    createComic:   "🎨 Crea tu cómic",
    allComics:     "Todos los cómics",
    filterAll:     "Todos",
    filterRecent:  "Recientes",
    noComics:      "Aún no hay cómics publicados.",
    beFirst:       "¡Sé el primero en crear uno!",
    createFirst:   "Crear mi primer cómic",
    footerTagline: "Hecho con viñetas y pasión",
    read:          "Leer",
    edit:          "Editar",
    by:            "por",
    pageLogin:     "Iniciar Sesión",
    pageRegister:  "Crear Cuenta",
    email:         "Email",
    password:      "Contraseña",
    passwordConf:  "Confirmar contraseña",
    username:      "Nombre de usuario",
    submitLogin:   "Entrar",
    submitRegister:"Crear cuenta",
    noAccount:     "¿No tienes cuenta?",
    hasAccount:    "¿Ya tienes cuenta?",
    forgotPass:    "¿Olvidaste tu contraseña?",
    errRequired:   "Este campo es obligatorio",
    errEmail:      "Email no válido",
    errPassLen:    "Mínimo 6 caracteres",
    errPassMatch:  "Las contraseñas no coinciden",
    errUserExists: "El usuario ya existe",
    errUserNotFound:"Usuario o contraseña incorrectos",
    loginOk:       "¡Bienvenido/a de vuelta!",
    registerOk:    "¡Cuenta creada! Ya puedes entrar.",
    logoutOk:      "Sesión cerrada",
    panelTitle:    "Editor de Cómics",
    tabPanels:     "Viñetas",
    tabTexts:      "Textos",
    newProject:    "Nuevo proyecto",
    comicTitle:    "Título del cómic",
    comicDesc:     "Descripción / subtítulo",
    saveProject:   "Guardar proyecto",
    uploadPanel:   "Subir viñeta",
    addPanel:      "Añadir viñeta",
    noProjectYet:  "Crea un proyecto primero",
    readerBack:    "Inicio",
    readerPrev:    "← Anterior",
    readerNext:    "Siguiente →",
    readerRestart: "Volver al inicio",
    readerExit:    "Salir",
    endOfComic:    "¡Fin del cómic!",
    panelOrientation:"Orientación",
    horizontal:    "Horizontal",
    vertical:      "Vertical",
    addDialog:     "💬 Bocadillo",
    addHeader:     "📋 Cabecera",
    addFooter:     "📝 Pie",
    writeText:     "Escribe tu texto",
    save:          "Guardar",
    editBtn:       "Editar",
    deleteBtn:     "Eliminar",
    tailLeft:      "Cola izquierda",
    tailRight:     "Cola derecha",
    tailTop:       "Cola arriba",
    tailBottom:    "Cola abajo",
    dialogOrder:   "Orden de aparición",
    publishComic:  "📖 Publicar",
    publishOk:     "¡Cómic publicado!",
    saveOk:        "Guardado",
  },
  en: {
    tagline:       "Create and share your comics",
    register:      "Sign Up",
    login:         "Sign In",
    myComics:      "My Comics",
    logout:        "Sign Out",
    heroTitle:     "ComicShow",
    heroSubtitle:  "Create and share your comics",
    createComic:   "🎨 Create your comic",
    allComics:     "All Comics",
    filterAll:     "All",
    filterRecent:  "Recent",
    noComics:      "No comics published yet.",
    beFirst:       "Be the first to create one!",
    createFirst:   "Create my first comic",
    footerTagline: "Made with panels and passion",
    read:          "Read",
    edit:          "Edit",
    by:            "by",
    pageLogin:     "Sign In",
    pageRegister:  "Create Account",
    email:         "Email",
    password:      "Password",
    passwordConf:  "Confirm password",
    username:      "Username",
    submitLogin:   "Sign In",
    submitRegister:"Create account",
    noAccount:     "Don't have an account?",
    hasAccount:    "Already have an account?",
    forgotPass:    "Forgot your password?",
    errRequired:   "This field is required",
    errEmail:      "Invalid email",
    errPassLen:    "Minimum 6 characters",
    errPassMatch:  "Passwords do not match",
    errUserExists: "User already exists",
    errUserNotFound:"Wrong user or password",
    loginOk:       "Welcome back!",
    registerOk:    "Account created! You can now sign in.",
    logoutOk:      "Signed out",
    panelTitle:    "Comic Editor",
    tabPanels:     "Panels",
    tabTexts:      "Texts",
    newProject:    "New project",
    comicTitle:    "Comic title",
    comicDesc:     "Description / subtitle",
    saveProject:   "Save project",
    uploadPanel:   "Upload panel",
    addPanel:      "Add panel",
    noProjectYet:  "Create a project first",
    readerBack:    "Home",
    readerPrev:    "← Previous",
    readerNext:    "Next →",
    readerRestart: "Back to start",
    readerExit:    "Exit",
    endOfComic:    "End of comic!",
    panelOrientation:"Orientation",
    horizontal:    "Horizontal",
    vertical:      "Vertical",
    addDialog:     "💬 Speech bubble",
    addHeader:     "📋 Header",
    addFooter:     "📝 Footer",
    writeText:     "Write your text",
    save:          "Save",
    editBtn:       "Edit",
    deleteBtn:     "Delete",
    tailLeft:      "Tail left",
    tailRight:     "Tail right",
    tailTop:       "Tail top",
    tailBottom:    "Tail bottom",
    dialogOrder:   "Appearance order",
    publishComic:  "📖 Publish",
    publishOk:     "Comic published!",
    saveOk:        "Saved",
  }
};

const I18n = (() => {
  let lang = localStorage.getItem('cs_lang') || navigator.language.slice(0,2) || 'es';
  if (!TRANSLATIONS[lang]) lang = 'es';

  function t(key) {
    return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || key;
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
  }

  function setLang(l) {
    if (!TRANSLATIONS[l]) return;
    lang = l;
    localStorage.setItem('cs_lang', l);
    applyAll();
  }

  function getLang() { return lang; }

  // Auto-apply on DOM ready
  document.addEventListener('DOMContentLoaded', applyAll);

  return { t, setLang, getLang, applyAll };
})();
