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
    await _delete('panels', `work_id=eq.${comic.supabaseId}`);
    if (!comic.panels || comic.panels.length === 0) return;
    for (let i = 0; i < comic.panels.length; i++) {
      const p = comic.panels[i];
      const ins = await _upsert('panels', {
        work_id:     comic.supabaseId,
        panel_order: i,
        orientation: p.orientation || 'v',
        text_mode:   p.textMode    || 'sequential',
        data_url:    p.dataUrl     || null,
      });
      const panelId = ins[0]?.id;
      if (!panelId || !p.texts || p.texts.length === 0) continue;
      await _upsert('panel_texts', p.texts.map((t, j) => ({
        panel_id:     panelId,
        text_order:   t.order              ?? j,
        type:         t.type              || 'bubble',
        style:        t.style             || 'conventional',
        has_tail:     t.hasTail           ?? true,
        tail_starts:  JSON.stringify(t.tailStarts || [{x:-0.4,y:0.4}]),
        tail_ends:    JSON.stringify(t.tailEnds   || [{x:-0.4,y:0.6}]),
        voice_count:  t.voiceCount        ?? 1,
        x:            t.x                 ?? 0,
        y:            t.y                 ?? 0,
        w:            t.w                 ?? t.width  ?? 0.3,
        h:            t.h                 ?? t.height ?? 0.15,
        text:         t.text              || '',
        font_family:  t.fontFamily        || 'Comic Sans MS, cursive',
        font_size:    t.fontSize          ?? 18,
        color:        t.color             || '#000000',
        bg:           t.bg || t.backgroundColor || '#ffffff',
        border:       t.border            ?? t.borderWidth ?? 2,
        border_color: t.borderColor       || '#000000',
        rotation:     t.rotation          ?? 0,
        padding:      t.padding           ?? 15,
      })));
    }
  }

  // ── BORRADOR EN NUBE ──────────────────────────────────────
  // Límite razonable: 50MB por obra (data_url de paneles son base64 JPEGs)
  // El campo published=false impide que aparezca en el reader público
  async function saveDraft(comic) {
    const sid = comic.supabaseId;
    if (!sid) throw new Error('Sin supabaseId para guardar borrador');

    // Calcular tamaño aproximado antes de subir
    const payload = JSON.stringify(comic);
    const sizeKB  = Math.round(payload.length * 0.75 / 1024); // base64 → bytes
    const LIMIT_KB = 50 * 1024; // 50 MB
    if (sizeKB > LIMIT_KB) {
      throw new Error(`La obra ocupa ~${Math.round(sizeKB/1024)}MB, supera el límite de 50MB. Reduce el número de páginas o el tamaño de las imágenes.`);
    }

    await _upsert('works', {
      id:          sid,
      title:       comic.title      || '',
      author_name: comic.author     || comic.username || '',
      genre:       comic.genre      || '',
      nav_mode:    comic.navMode    || 'fixed',
      published:   false,
      updated_at:  new Date().toISOString(),
    });
    await _uploadPanels(comic);
    return { sizeKB };
  }

  async function submitForReview(comic) {
    await _upsert('works', {
      id:          comic.supabaseId,
      title:       comic.title   || '',
      author_name: comic.author  || comic.username || '',
      genre:       comic.genre   || '',
      nav_mode:    comic.navMode || 'fixed',
      published:   false,
    });
    await _uploadPanels(comic);
  }

  async function approveWork(comic) {
    const sid = comic.supabaseId;
    if (!sid) throw new Error('Sin supabaseId');
    await _patch('works', `id=eq.${sid}`, { published: true });
  }

  async function unpublishWork(workId, supabaseId) {
    const sid = supabaseId || workId;
    await _patch('works', `id=eq.${sid}`, { published: false });
  }

  async function deleteWork(supabaseId) {
    // Borrar panel_texts → panels → work (en orden por FK)
    const panels = await _get(`panels?work_id=eq.${supabaseId}&select=id`);
    for (const p of (panels || [])) {
      await _delete('panel_texts', `panel_id=eq.${p.id}`);
    }
    await _delete('panels', `work_id=eq.${supabaseId}`);
    await _delete('works', `id=eq.${supabaseId}`);
  }

  return { saveDraft, submitForReview, approveWork, unpublishWork, deleteWork };
})();
