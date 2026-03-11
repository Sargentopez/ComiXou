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

  // ── DESCARGAR BORRADOR PARA EDITAR ──────────────────────────────────────
  // Descarga el contenido completo de Supabase y lo convierte en editorData
  // compatible con edLoadProject(). Cada panel se reconstruye como una página
  // con un ImageLayer (data_url) y los textos como capas serializadas.
  async function downloadDraftAsEditorData(supabaseId) {
    // 1. Metadatos de la obra
    const works = await _get(`works?id=eq.${supabaseId}&limit=1`);
    if (!works || !works.length) throw new Error('Obra no encontrada en la nube');
    const work = works[0];

    // 2. Paneles ordenados
    const panels = await _get(
      `panels?work_id=eq.${supabaseId}&order=panel_order.asc&select=id,panel_order,orientation,text_mode,data_url`
    ) || [];

    // 3. Para cada panel, descargar sus textos
    const pages = [];
    for (const panel of panels) {
      const texts = await _get(
        `panel_texts?panel_id=eq.${panel.id}&order=text_order.asc`
      ) || [];

      const layers = [];

      // Capa imagen (el data_url renderizado del panel)
      if (panel.data_url) {
        layers.push({
          type:     'image',
          src:      panel.data_url,
          x:        0,
          y:        0,
          width:    1,
          height:   1,
          rotation: 0,
          opacity:  1,
        });
      }

      // Capas de texto/bocadillo
      for (const t of texts) {
        let tailStarts, tailEnds;
        try { tailStarts = JSON.parse(t.tail_starts || 'null'); } catch(e) { tailStarts = null; }
        try { tailEnds   = JSON.parse(t.tail_ends   || 'null'); } catch(e) { tailEnds   = null; }

        layers.push({
          type:        t.type        || 'bubble',
          style:       t.style       || 'conventional',
          hasTail:     t.has_tail    ?? true,
          tailStarts:  tailStarts    || [{x:-0.4,y:0.4}],
          tailEnds:    tailEnds      || [{x:-0.4,y:0.6}],
          voiceCount:  t.voice_count ?? 1,
          x:           t.x           ?? 0,
          y:           t.y           ?? 0,
          w:           t.w           ?? 0.3,
          h:           t.h           ?? 0.15,
          text:        t.text        || '',
          fontFamily:  t.font_family || 'Comic Sans MS, cursive',
          fontSize:    t.font_size   ?? 18,
          color:       t.color       || '#000000',
          bg:          t.bg          || '#ffffff',
          border:      t.border      ?? 2,
          borderColor: t.border_color|| '#000000',
          rotation:    t.rotation    ?? 0,
          padding:     t.padding     ?? 15,
        });
      }

      // El editor usa 'vertical'/'horizontal'; Supabase almacena 'v'/'h'
      const orient = panel.orientation === 'h' ? 'horizontal' : 'vertical';
      pages.push({
        orientation:      orient,
        textMode:         panel.text_mode   || 'sequential',
        textLayerOpacity: 1,
        layers,
      });
    }

    return {
      work,
      editorData: {
        orientation: pages[0]?.orientation || 'vertical',
        pages,
      },
    };
  }

  return { saveDraft, submitForReview, approveWork, unpublishWork, deleteWork, downloadDraftAsEditorData };
})();
