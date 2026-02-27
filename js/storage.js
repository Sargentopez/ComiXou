/* ============================================================
   storage.js  v4.7
   Persistencia en localStorage + eventos reactivos para
   que cualquier vista (home, my-comics) se actualice al instante
   cuando cambian datos (publish, unpublish, delete).
   ============================================================ */

const ComicStore = (() => {
  const KEY  = 'cs_comics';
  const CH   = 'cx_comics_change'; // BroadcastChannel name

  /* ── Canal de difusión entre pestañas / vistas ── */
  let _bc = null;
  try { _bc = new BroadcastChannel(CH); } catch(e) {}

  /* Emitir cambio — notifica otras pestañas Y la propia (via CustomEvent) */
  function _emit(type, id) {
    // Mismo tab
    window.dispatchEvent(new CustomEvent('cx:store', { detail: { type, id } }));
    // Otras pestañas
    try { _bc && _bc.postMessage({ type, id }); } catch(e) {}
  }

  /* Escuchar cambios desde otras pestañas */
  if (_bc) {
    _bc.onmessage = (e) => {
      window.dispatchEvent(new CustomEvent('cx:store', { detail: e.data }));
    };
  }

  /* ── CRUD ── */
  function getAll()       { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  function saveAll(list)  { localStorage.setItem(KEY, JSON.stringify(list)); }
  function getById(id)    { return getAll().find(c => c.id === id) || null; }

  function save(comic) {
    const list = getAll();
    const idx  = list.findIndex(c => c.id === comic.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...comic, updatedAt: new Date().toISOString() };
    } else {
      list.push({ ...comic, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    saveAll(list);
    _emit('save', comic.id);
    return comic;
  }

  function remove(id) {
    saveAll(getAll().filter(c => c.id !== id));
    _emit('remove', id);
  }

  function createNew(userId, username) {
    return {
      id:        'comic_' + Date.now(),
      userId,
      username,
      title:     '',
      desc:      '',
      panels:    [],
      published: false
    };
  }

  function getByUser(userId)  { return getAll().filter(c => c.userId === userId); }
  function getPublished()     { return getAll().filter(c => c.published); }

  return { getAll, getById, save, remove, createNew, getByUser, getPublished };
})();
