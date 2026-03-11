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

    // editorData.pages[] contiene las capas editables (edSerLayer).
    // comic.panels[] contiene el render plano + textos para el reader.
    const edPages = (comic.editorData && comic.editorData.pages) ? comic.editorData.pages : [];

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
      if (!panelId) continue;

      // Capas del editor: image, draw, stroke, bubble, text — formato edSerLayer
      const edPage = edPages[i];
      if (edPage && edPage.layers && edPage.layers.length > 0) {
        await _upsert('panel_layers', edPage.layers.map((l, j) => ({
          panel_id:    panelId,
          layer_order: j,
          layer_type:  l.type,
          layer_data:  JSON.stringify(l),
        })));
      }

      // Textos para el reader (panel_texts sin cambios)
      if (!p.texts || p.texts.length === 0) continue;
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

  // ── DESCARGAR BORRADOR PARA EDITAR ──────────────────────────────────────────────────────────────────
  // Descarga panel_layers (capas del editor, formato edSerLayer) y las devuelve
  // como editorData listo para edLoadProject(). El editor las pasa por edDeserLayer
  // sin ninguna conversion — es el mismo formato que guardo edSaveProject.
  async function downloadDraftAsEditorData(supabaseId) {
    const works = await _get(`works?id=eq.${supabaseId}&limit=1`);
    if (!works || !works.length) throw new Error('Obra no encontrada en la nube');
    const work = works[0];

    const panels = await _get(
      `panels?work_id=eq.${supabaseId}&order=panel_order.asc&select=id,panel_order,orientation,text_mode,data_url`
    ) || [];

    const pages = [];
    for (const panel of panels) {
      // Capas del editor guardadas por edSerLayer
      const layerRows = await _get(
        `panel_layers?panel_id=eq.${panel.id}&order=layer_order.asc`
      ) || [];

      const layers = layerRows.map(row => {
        try { return JSON.parse(row.layer_data); }
        catch(e) { return null; }
      }).filter(Boolean);

      // Si no hay panel_layers (obra subida antes de esta version), usar data_url
      // como ImageLayer de fallback para que al menos se vea algo
      if (layers.length === 0 && panel.data_url) {
        layers.push({
          type: 'image', src: panel.data_url,
          x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1,
        });
      }

      const orient = panel.orientation === 'h' ? 'horizontal' : 'vertical';
      pages.push({
        orientation:      orient,
        textMode:         panel.text_mode || 'sequential',
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

  // ── ADMIN: LISTAR OBRAS DESDE SUPABASE ──────────────────────
  // Devuelven obras en formato compatible con buildAdminRow del admin.
  async function fetchPendingWorks() {
    const works = await _get('works?published=eq.false&order=updated_at.desc&select=id,title,author_name,genre,nav_mode,published,updated_at');
    return (works || []).map(w => _workToComic(w, false));
  }

  async function fetchPublishedWorks() {
    const works = await _get('works?published=eq.true&order=updated_at.desc&select=id,title,author_name,genre,nav_mode,published,updated_at');
    return (works || []).map(w => _workToComic(w, true));
  }

  // Convierte una fila de Supabase al formato mínimo que necesita buildAdminRow
  function _workToComic(w, published) {
    return {
      id:           w.id,          // usamos el supabaseId como id local también
      supabaseId:   w.id,
      title:        w.title        || '(sin título)',
      author:       w.author_name  || '',
      genre:        w.genre        || '',
      navMode:      w.nav_mode     || 'fixed',
      published:    published,
      approved:     published,
      pendingReview: !published,
      updatedAt:    w.updated_at,
      // panels vacío — se carga bajo demanda al pulsar Leer
      panels:       [],
    };
  }

  return { saveDraft, submitForReview, approveWork, unpublishWork, deleteWork, downloadDraftAsEditorData, fetchPendingWorks, fetchPublishedWorks };
})();
