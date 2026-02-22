/* ============================================================
   storage.js — Persistencia de cómics en localStorage
   ============================================================ */

const ComicStore = (() => {
  const KEY = 'cs_comics';

  function getAll() {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  }
  function saveAll(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  // Obtener cómic por ID
  function getById(id) {
    return getAll().find(c => c.id === id) || null;
  }

  // Guardar o actualizar cómic
  function save(comic) {
    const list = getAll();
    const idx = list.findIndex(c => c.id === comic.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...comic, updatedAt: new Date().toISOString() };
    } else {
      list.push({ ...comic, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    saveAll(list);
    return comic;
  }

  // Eliminar
  function remove(id) {
    saveAll(getAll().filter(c => c.id !== id));
  }

  // Generar nuevo cómic vacío
  function createNew(userId, username) {
    return {
      id:       'comic_' + Date.now(),
      userId,
      username,
      title:    '',
      desc:     '',
      panels:   [],   // [{id, dataUrl, orientation:'h'|'v', texts:[]}]
      published: false
    };
  }

  // Publicar/despublicar
  function publish(id, bool=true) {
    const c = getById(id);
    if (c) { c.published = bool; save(c); }
  }

  // Cómics del usuario
  function getByUser(userId) {
    return getAll().filter(c => c.userId === userId);
  }

  // Solo publicados
  function getPublished() {
    return getAll().filter(c => c.published);
  }

  return { getAll, getById, save, remove, createNew, publish, getByUser, getPublished };
})();
