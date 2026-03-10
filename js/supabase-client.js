/* ============================================================
   supabase-client.js — Comunicación con Supabase
   Thin wrapper sobre fetch. Sin SDK externo.
   ============================================================ */

const SupabaseClient = (() => {
  const BASE = 'https://qqgsbyylaugsagbxsetc.supabase.co/rest/v1';
  const KEY  = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';

  const hdrs = {
    'apikey':        KEY,
    'Authorization': `Bearer ${KEY}`,
    'Content-Type':  'application/json',
  };

  async function _get(path) {
    const r = await fetch(`${BASE}/${path}`, { headers: hdrs });
    if (!r.ok) throw new Error(`GET ${path}: ${r.status}`);
    return r.json();
  }

  async function _upsert(table, data) {
    const r = await fetch(`${BASE}/${table}`, {
      method:  'POST',
      headers: { ...hdrs, 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body:    JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`UPSERT ${table}: ${r.status} ${await r.text()}`);
    return r.json();
  }

  async function _delete(table, filter) {
    const r = await fetch(`${BASE}/${table}?${filter}`, { method: 'DELETE', headers: hdrs });
    if (!r.ok) throw new Error(`DELETE ${table}: ${r.status}`);
  }

  async function _patch(table, filter, data) {
    const r = await fetch(`${BASE}/${table}?${filter}`, {
      method:  'PATCH',
      headers: { ...hdrs, 'Prefer': 'return=minimal' },
      body:    JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`PATCH ${table}: ${r.status}`);
  }

  async function _uploadPanels(comic) {
    await _delete('panels', `work_id=eq.${comic.id}`);
    if (!comic.panels || comic.panels.length === 0) return;
    for (let i = 0; i < comic.panels.length; i++) {
      const p = comic.panels[i];
      const ins = await _upsert('panels', {
        work_id:     comic.id,
        panel_order: i,
        orientation: p.orientation || 'v',
        text_mode:   p.textMode    || 'sequential',
        data_url:    p.dataUrl     || null,
      });
      const panelId = ins[0]?.id;
      if (!panelId || !p.texts || p.texts.length === 0) continue;
      await _upsert('panel_texts', p.texts.map((t, j) => ({
        panel_id:     panelId,
        text_order:   t.order       ?? j,
        type:         t.type        || 'dialog',
        style:        t.style       || 'conventional',
        tail:         t.tail        || 'bottom',
        x:            t.x           ?? 0,
        y:            t.y           ?? 0,
        w:            t.w           ?? 30,
        h:            t.h           ?? 0,
        text:         t.text        || '',
        font_family:  t.fontFamily  || 'Arial',
        font_size:    t.fontSize    || 16,
        color:        t.color       || '#000000',
        bg:           t.bg          || '#ffffff',
        border:       t.border      ?? 2,
        border_color: t.borderColor || '#000000',
      })));
    }
  }

  async function submitForReview(comic) {
    await _upsert('works', {
      id:          comic.id,
      title:       comic.title    || '',
      author_name: comic.author   || comic.username || '',
      genre:       comic.genre    || '',
      nav_mode:    comic.navMode  || 'fixed',
      username:    comic.username || '',
      user_id:     comic.userId   || '',
      published:   false,
    });
    await _uploadPanels(comic);
  }

  async function approveWork(comic) {
    await _patch('works', `id=eq.${comic.id}`, { published: true });
  }

  async function unpublishWork(workId) {
    await _patch('works', `id=eq.${workId}`, { published: false });
  }

  return { submitForReview, approveWork, unpublishWork };
})();
