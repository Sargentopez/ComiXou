/* ============================================================
   supabase-client.js — Comunicación con Supabase
   Thin wrapper sobre fetch. Sin SDK externo.
   ============================================================ */

// ── Compresión gzip de layer_data (CompressionStream W3C nativo) ──────────────
// Comprime JSON strings grandes antes de subir a Supabase.
// Prefijo 'gz:' + base64 identifica datos comprimidos. Sin prefijo = sin comprimir (legado).
// Solo se comprimen strings mayores de 512 bytes — por debajo no merece la pena.
const _CZ_MIN = 512;
const _CZ_PFX = 'gz:';

async function _czCompress(jsonStr) {
  // No comprimir si las APIs no están disponibles en este navegador
  if (!jsonStr || jsonStr.length < _CZ_MIN ||
      typeof CompressionStream === 'undefined' ||
      typeof DecompressionStream === 'undefined') return jsonStr;
  try {
    const bytes = new TextEncoder().encode(jsonStr);
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const reader = cs.readable.getReader();
    let done, value;
    while (!({ done, value } = await reader.read(), done)) chunks.push(value);
    const merged = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    // btoa por chunks de 8192 bytes — evita stack overflow en Android con arrays grandes
    let b64 = '';
    const CHUNK = 8192;
    for (let i = 0; i < merged.length; i += CHUNK) {
      b64 += btoa(String.fromCharCode(...merged.subarray(i, i + CHUNK)));
    }
    return _CZ_PFX + b64;
  } catch(e) { return jsonStr; } // fallback: sin comprimir
}

async function _czDecompress(str) {
  if (!str || !str.startsWith(_CZ_PFX)) return str;
  if (typeof DecompressionStream === 'undefined') return str;
  try {
    const b64 = str.slice(_CZ_PFX.length);
    // atob por chunks de 8192 chars — evita fallo en Android con b64 muy largo
    const CHUNK = 8192;
    let byteLen = 0;
    const parts = [];
    for (let i = 0; i < b64.length; i += CHUNK) {
      const bin = atob(b64.slice(i, i + CHUNK));
      const part = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) part[j] = bin.charCodeAt(j);
      parts.push(part);
      byteLen += part.length;
    }
    const bytes = new Uint8Array(byteLen);
    let off2 = 0;
    for (const p of parts) { bytes.set(p, off2); off2 += p.length; }
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    let done, value;
    while (!({ done, value } = await reader.read(), done)) chunks.push(value);
    const total = chunks.reduce((a,c)=>a+c.length,0);
    const merged = new Uint8Array(total);
    let off=0; for(const c of chunks){merged.set(c,off);off+=c.length;}
    return new TextDecoder().decode(merged);
  } catch(e) { return str; }
}

const SupabaseClient = (() => {
  const BASE    = 'https://qqgsbyylaugsagbxsetc.supabase.co/rest/v1';
  const STORAGE = 'https://qqgsbyylaugsagbxsetc.supabase.co/storage/v1';
  const KEY     = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';

  const hdrs = {
    'apikey':        KEY,
    'Authorization': `Bearer ${KEY}`,
    'Content-Type':  'application/json',
  };

  // Cabeceras con JWT del usuario autenticado (necesario para tablas con RLS estricto)
  function _hdrsUser() {
    try {
      const session = JSON.parse(localStorage.getItem('cs_session') || 'null');
      if (session && session.token) {
        return { 'apikey': KEY, 'Authorization': `Bearer ${session.token}`, 'Content-Type': 'application/json' };
      }
    } catch(e) {}
    return hdrs; // fallback a anon key
  }

  async function _get(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // 8s timeout
    try {
      const r = await fetch(`${BASE}/${path}`, { headers: _hdrsUser(), signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
      return r.json();
    } catch(e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error(`Timeout en GET ${path}`);
      throw e;
    }
  }

  async function _upsert(table, data) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${BASE}/${table}`, {
      method:  'POST',
      headers: { ..._hdrsUser(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body:    JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`UPSERT ${table}: ${r.status} ${await r.text()}`);
    return r.json();
  }

  async function _delete(table, filter) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${BASE}/${table}?${filter}`, { method: 'DELETE', headers: _hdrsUser() });
    if (!r.ok) throw new Error(`DELETE ${table}: ${r.status} ${await r.text()}`);
  }

  async function _patch(table, filter, data) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${BASE}/${table}?${filter}`, {
      method:  'PATCH',
      headers: { ..._hdrsUser(), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`PATCH ${table}: ${r.status}`);
  }

  // ── STORAGE: GIFs en bucket 'gifs' ────────────────────────────────────────
  // Mini IDB propio para leer GIFs — mismo DB que editor.js (cxGifs)
  function _sbGifIdbLoad(key) {
    // Usar la función cacheada del editor si está disponible (evita doble conexión a cxGifs)
    if (window._gifIdbLoad) return window._gifIdbLoad(key).catch(() => null);
    return new Promise((res) => {
      const req = indexedDB.open('cxGifs', 1);
      req.onsuccess = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('gifs')) { res(null); return; }
        const r = db.transaction('gifs').objectStore('gifs').get(key);
        r.onsuccess = e2 => res(e2.target.result || null);
        r.onerror   = () => res(null);
      };
      req.onerror = () => res(null);
    });
  }

  // ── STORAGE: APNGs animados en bucket 'anims' — patrón idéntico al de GIFs ──
  // IDB cacheado (misma conexión para toda la sesión — evita conflictos de apertura múltiple)
  let _animDb = null;
  function _animIdbOpen() {
    if (_animDb) return Promise.resolve(_animDb);
    return new Promise((res, rej) => {
      const req = indexedDB.open('cxAnims', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('anims');
      req.onsuccess = e => { _animDb = e.target.result; res(_animDb); };
      req.onerror   = e => rej(e.target.error);
    });
  }
  // Guarda dataUrl PNG (APNG completo) en IDB por animKey
  function _sbAnimIdbSave(key, dataUrl) {
    return _animIdbOpen().then(db => new Promise((res, rej) => {
      const tx = db.transaction('anims', 'readwrite');
      tx.objectStore('anims').put(dataUrl, key);
      tx.oncomplete = () => res();
      tx.onerror    = e => rej(e.target.error);
    }));
  }
  // Lee dataUrl PNG (APNG completo) de IDB por animKey
  function _sbAnimIdbLoad(key) {
    return _animIdbOpen().then(db => new Promise((res, rej) => {
      const r = db.transaction('anims').objectStore('anims').get(key);
      r.onsuccess = e => res(e.target.result || null);
      r.onerror   = e => rej(e.target.error);
    }));
  }
  // Exponer para que editor.js pueda guardar el APNG completo en IDB al importar
  window._sbAnimIdbSave = _sbAnimIdbSave;
  window._sbAnimIdbLoad = _sbAnimIdbLoad;

  // Reconstruye un APNG desde array de PNG dataUrls individuales usando UPNG
  async function _buildApngFromFrames(frameUrls, delayMs) {
    if (typeof UPNG === 'undefined') { console.warn('APNG build: UPNG no disponible'); return null; }
    if (!window.ApngDecoder) { console.warn('APNG build: ApngDecoder no disponible'); return null; }
    if (!frameUrls || !frameUrls.length) { console.warn('APNG build: array vacío'); return null; }
    console.warn('APNG build: ' + frameUrls.length + ' frames, frame[0] type=' + typeof frameUrls[0] + ' len=' + (frameUrls[0]||'').length);
    try {
      const result = await window.ApngDecoder.decodeFrameArray(frameUrls, delayMs || 100);
      console.warn('APNG decode OK: ' + result.frames.length + ' frames ' + result.width + 'x' + result.height);
      const dels = new Array(result.frames.length).fill(delayMs || 100);
      const bufs = result.frames.map(f => f.imageData.data.buffer);
      const apngBuf = UPNG.encode(bufs, result.width, result.height, 0, dels, true);
      console.warn('APNG encode OK: ' + apngBuf.byteLength + ' bytes');
      const blob = new Blob([apngBuf], {type: 'image/png'});
      return new Promise(res => {
        const fr = new FileReader();
        fr.onload = e => { console.warn('APNG dataUrl OK: ' + e.target.result.length + ' chars'); res(e.target.result); };
        fr.onerror = (e) => { console.warn('APNG FileReader error: ' + e); res(null); };
        fr.readAsDataURL(blob);
      });
    } catch(e) { console.warn('APNG build ERROR: ' + e.message); return null; }
  }

  // Sube un dataUrl APNG al bucket 'anims' como blob PNG binario (= patrón GIF)
  async function _animUpload(animKey, dataUrl) {
    if (window._authTryRefresh) await window._authTryRefresh();
    const b64 = dataUrl.split(',')[1];
    const bin = atob(b64);
    const u8  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const blob = new Blob([u8], { type: 'image/png' });
    const path = animKey + '.png';
    const r = await fetch(`${STORAGE}/object/anims/${path}`, {
      method:  'POST',
      headers: { ..._hdrsUser(), 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body:    blob,
    });
    if (!r.ok) throw new Error(`animUpload: ${r.status} ${await r.text()}`);
    return `${STORAGE}/object/public/anims/${path}`;
  }
  // _animDownload definida más abajo
  // Borra un APNG del bucket por su URL pública (= patrón GIF)
  async function _animDelete(animUrl) {
    if (!animUrl) return;
    const path = animUrl.replace(`${STORAGE}/object/public/anims/`, '');
    await fetch(`${STORAGE}/object/anims/${path}`, {
      method: 'DELETE', headers: _hdrsUser(),
    }).catch(() => {});
  }

  // Sube un dataUrl GIF al bucket y devuelve la URL pública
  async function _gifUpload(gifKey, dataUrl) {
    if (window._authTryRefresh) await window._authTryRefresh();
    // dataUrl → Blob binario (sin fetch, compatible con todos los navegadores)
    const b64  = dataUrl.split(',')[1];
    const bin  = atob(b64);
    const u8   = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const blob = new Blob([u8], { type: 'image/gif' });
    const path = gifKey + '.gif';
    const r = await fetch(`${STORAGE}/object/gifs/${path}`, {
      method:  'POST',
      headers: { ..._hdrsUser(), 'Content-Type': 'image/gif', 'x-upsert': 'true' },
      body:    blob,
    });
    if (!r.ok) throw new Error(`GIF upload: ${r.status} ${await r.text()}`);
    return `${STORAGE}/object/public/gifs/${path}`;
  }

  // Borra un GIF del bucket por su URL pública
  async function _gifDelete(gifUrl) {
    if (!gifUrl) return;
    const path = gifUrl.replace(`${STORAGE}/object/public/gifs/`, '');
    await fetch(`${STORAGE}/object/gifs/${path}`, {
      method:  'DELETE',
      headers: _hdrsUser(),
    }).catch(() => {});
  }

  // _animUpload antigua eliminada — usar la nueva (blob PNG con .png)

  // Descarga APNG del bucket 'anims' y devuelve dataUrl PNG — patrón idéntico al GIF
  async function _animDownload(animUrl) {
    if (!animUrl) return null;
    const r = await fetch(animUrl);
    if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise(res => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.onerror = () => res(null);
      reader.readAsDataURL(blob);
    });
  }

  async function _uploadPanels(comic) {
    await _delete('panels', `work_id=eq.${comic.supabaseId}`);

    // comic.panels[] son renders planos (pueden estar vacíos para obras cloudOnly)
    // Usar editorData.pages como fuente de verdad para las capas
    const edPages = (comic.editorData && comic.editorData.pages) ? comic.editorData.pages : [];
    const panels  = comic.panels && comic.panels.length ? comic.panels : edPages.map((p, i) => ({
      dataUrl:     null,
      orientation: p.orientation === 'horizontal' ? 'h' : 'v',
      textMode:    p.textMode || 'sequential',
      texts:       p.texts || [],
    }));

    if (!panels.length) return;

    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const ins = await _upsert('panels', {
        work_id:     comic.supabaseId,
        panel_order: i,
        orientation: p.orientation || 'v',
        text_mode:   p.textMode    || 'sequential',
        data_url:    p.dataUrl     || null,
      });
      const panelId = ins[0]?.id;
      if (!panelId) continue;

      // Borrar capas y textos anteriores por si el CASCADE no actuó
      await _delete('panel_layers', `panel_id=eq.${panelId}`);
      await _delete('panel_texts',  `panel_id=eq.${panelId}`);

      // Capas del editor: image, draw, stroke, bubble, text, gif — formato edSerLayer
      const edPage = edPages[i];
      if (edPage && edPage.layers && edPage.layers.length > 0) {
        const layerRows = [];
        for (let j = 0; j < edPage.layers.length; j++) {
          const l = edPage.layers[j];
          let gifUrl = null;
          // GIF: subir binario a Storage; layer_data solo guarda metadatos (sin dataUrl)
          if (l.type === 'gif' && l.gifKey) {
            try {
              // Diagnóstico del token
              const _sess = JSON.parse(localStorage.getItem('cs_session')||'null');
              const _tok = _sess && _sess.token;
              const _tokInfo = _tok ? ('token=' + _tok.substring(0,20) + '... role=' + (JSON.parse(atob(_tok.split('.')[1])).role||'?')) : 'NO TOKEN';
              console.warn('GIF attempt: ' + l.gifKey + ' | ' + _tokInfo);
              const dataUrl = await _sbGifIdbLoad(l.gifKey);
              if (!dataUrl) { console.warn('GIF IDB null: gifKey=' + l.gifKey); }
              else { gifUrl = await _gifUpload(l.gifKey, dataUrl); console.warn('GIF OK: ' + gifUrl); }
            } catch(e) { console.warn('GIF upload ERROR: ' + e.message); }
          }
          // Serializar la capa — excluir campos de re-edición que el reader no necesita
          const _lClean = {...l};
          // _gcpLayersData/_gcpFramesData/_gcpLayerNames son datos vectoriales (no imágenes)
          // Se mantienen en layer_data para que el editor GCP funcione en dispositivo B
          delete _lClean._pngFrames;     // nunca en layer_data — van al bucket
          delete _lClean._pngFramesKey;  // clave IDB local — no tiene sentido en Supabase
          delete _lClean._animFrames;    // datos en memoria — no serializar
          delete _lClean._animReady;
          delete _lClean._oc;
          delete _lClean._apngSrc;     // dataUrl enorme — ya está en bucket por animKey

          // APNG animado → bucket 'anims' — patrón idéntico al GIF
          let animUrl = null;
          if (l.type === 'image' && (l._pngFramesKey || l.animKey)) {
            const _idbKey = l._pngFramesKey || l.animKey;
            const _bucketKey = 'anim_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
            try {
              const _animData = await _sbAnimIdbLoad(_idbKey);
              if (_animData) {
                let _apngDataUrl = null;
                if (typeof _animData === 'string') {
                  _apngDataUrl = _animData;
                } else if (Array.isArray(_animData) && _animData.length) {
                  _apngDataUrl = await _buildApngFromFrames(_animData, l._gcpFrameDelay || 100);
                }
                if (_apngDataUrl) animUrl = await _animUpload(_bucketKey, _apngDataUrl);
              }
            } catch(e) { console.warn('APNG upload error:', e.message); }
          }

          const _ld = await _czCompress(JSON.stringify(_lClean));
          layerRows.push({
            panel_id:    panelId,
            layer_order: j,
            layer_type:  l.type,
            layer_data:  _ld,
            gif_url:     gifUrl,
            anim_url:    animUrl,
          });
        } // end for j
        if(layerRows.length > 0) await _upsert('panel_layers', layerRows);
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
        font_family:  t.fontFamily        || 'Patrick Hand',
        font_size:    t.fontSize          ?? 30,
        font_bold:    t.fontBold          ?? false,
        font_italic:  t.fontItalic        ?? false,
        color:        t.color             || '#000000',
        bg:           t.bg || t.backgroundColor || '#ffffff',
        bg_opacity:   t.bgOpacity         ?? 1,
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
      id:             sid,
      title:          comic.title      || '',
      author_name:    comic.author     || comic.username || '',
      author_id:      comic.userId     || null,
      genre:          comic.genre      || '',
      nav_mode:       comic.navMode    || 'fixed',
      social:         comic.social     || '',
      panel_count:    comic.panels?.length || 0,
      rules:          JSON.stringify(comic.editorData?._rules || []),
      published:      comic.approved   ? true  : false,
      pending_review: comic.pendingReview ? true : false,
      updated_at:     new Date().toISOString(),
    });
    await _uploadPanels(comic);
    return { sizeKB };
  }

  async function submitForReview(comic) {
    await _upsert('works', {
      id:             comic.supabaseId,
      title:          comic.title   || '',
      author_name:    comic.author  || comic.username || '',
      author_id:      comic.userId  || null,
      genre:          comic.genre   || '',
      nav_mode:       comic.navMode || 'fixed',
      social:         comic.social  || '',
      panel_count:    comic.panels?.length || 0,
      published:      false,
      pending_review: true,
    });
    await _uploadPanels(comic);
  }

  async function approveWork(comic) {
    const sid = comic.supabaseId;
    if (!sid) throw new Error('Sin supabaseId');
    await _patch('works', `id=eq.${sid}`, { published: true, pending_review: false });
  }

  async function unpublishWork(workId, supabaseId) {
    const sid = supabaseId || workId;
    await _patch('works', `id=eq.${sid}`, { published: false, pending_review: false });
  }

  async function deleteWork(supabaseId) {
    // Borrar en orden FK: panel_layers → panel_texts → panels → works
    const panels = await _get(`panels?work_id=eq.${supabaseId}&select=id`);
    for (const p of (panels || [])) {
      // Borrar GIFs del bucket antes de borrar las capas
      try {
        const gifLayers = await _get(`panel_layers?panel_id=eq.${p.id}&layer_type=eq.gif&select=gif_url`);
        for (const gl of (gifLayers || [])) { await _gifDelete(gl.gif_url); }
      } catch(e) {}
      await _delete('panel_layers', `panel_id=eq.${p.id}`);
      await _delete('panel_texts',  `panel_id=eq.${p.id}`);
    }
    await _delete('panels', `work_id=eq.${supabaseId}`);
    await _delete('works',  `id=eq.${supabaseId}`);
  }

  // Borrar todas las obras de un autor y su perfil de authors
  async function deleteAuthorData(authorId) {
    const works = await _get(`works?author_id=eq.${authorId}&select=id`).catch(() => []);
    for (const w of (works || [])) {
      await deleteWork(w.id).catch(() => {});
    }
    await _delete('authors', `id=eq.${authorId}`);
  }

  // ── DESCARGAR BORRADOR PARA EDITAR ──────────────────────────────────────────────────────────────────
  // Descarga panel_layers (capas del editor, formato edSerLayer) y las devuelve
  // como editorData listo para edLoadProject(). El editor las pasa por edDeserLayer
  // sin ninguna conversion — es el mismo formato que guardo edSaveProject.
  async function downloadDraftAsEditorData(supabaseId) {
    const works = await _get(`works?id=eq.${supabaseId}&limit=1&select=*,rules`);
    if (!works || !works.length) throw new Error('Obra no encontrada en la nube');
    const work = works[0];
    let _projectRules = [];
    try { _projectRules = work.rules ? JSON.parse(work.rules) : []; } catch(e) { _projectRules = []; }

    const panels = await _get(
      `panels?work_id=eq.${supabaseId}&order=panel_order.asc&select=id,panel_order,orientation,text_mode,data_url`
    ) || [];

    const pages = [];
    for (const panel of panels) {
      const layerRows = await _get(
        `panel_layers?panel_id=eq.${panel.id}&order=layer_order.asc`
      ) || [];

      const layers = [];
      for (const row of layerRows) {
        let layerObj = null;
        try {
          const _raw = await _czDecompress(row.layer_data);
          layerObj = JSON.parse(_raw);
        } catch(e) {}
        if (!layerObj) continue;
        // APNG animado — patrón idéntico al GIF:
        // APNG: descargar si hay anim_url — sin depender de animKey
        if (layerObj.type === 'image' && row.anim_url) {
          try {
            const _apngDataUrl = await _animDownload(row.anim_url);
            if (_apngDataUrl) {
              layerObj._apngSrc = _apngDataUrl;
              const _idbKey = 'anim_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
              layerObj._pngFramesKey = _idbKey;
              await _sbAnimIdbSave(_idbKey, _apngDataUrl).catch(() => {});
            }
          } catch(e) { console.warn('APNG cloud download:', e); }
        }
        // GIF: descargar de Storage y meter en IndexedDB local
        if (layerObj.type === 'gif' && row.gif_url) {
          try {
            const gifResp = await fetch(row.gif_url);
            if (gifResp.ok) {
              const blob   = await gifResp.blob();
              const reader = new FileReader();
              const dataUrl = await new Promise(res => {
                reader.onload = e => res(e.target.result);
                reader.readAsDataURL(blob);
              });
              if (window._gifIdbSave && layerObj.gifKey) {
                await window._gifIdbSave(layerObj.gifKey, dataUrl).catch(() => {});
              }
            }
          } catch(e) { console.warn('GIF cloud download:', e); }
        }
        layers.push(layerObj);
      }

      // Fallback: si no hay panel_layers (obra antigua), usar data_url como ImageLayer
      if (layers.length === 0 && panel.data_url) {
        layers.push({ type: 'image', src: panel.data_url, x: 0.5, y: 0.5, width: 1.0, height: 1.0, _keepSize: true });
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
        _rules: _projectRules,
        pages,
      },
    };
  }

  // ── ADMIN: LISTAR OBRAS DESDE SUPABASE ──────────────────────
  // Devuelven obras en formato compatible con buildAdminRow del admin.
  // Fetch genérico de obras + thumbnail del primer panel (dos queries, sin join).
  async function _fetchWorks(filter) {
    const works = await _get(
      `works?${filter}&order=updated_at.desc` +
      `&select=id,title,author_name,genre,nav_mode,social,published,pending_review,updated_at`
    );
    if (!works || !works.length) return [];

    // Pedir solo el panel_order=0 de cada obra para el thumbnail
    const ids = works.map(w => w.id).join(',');
    let thumbMap = {};
    try {
      const panels = await _get(
        `panels?work_id=in.(${ids})&panel_order=eq.0&select=work_id,data_url`
      );
      (panels || []).forEach(p => { thumbMap[p.work_id] = p.data_url; });
    } catch(e) { /* sin thumbnails */ }

    return works.map(w => _workToComic(w, w.published, thumbMap[w.id] || ''));
  }

  async function fetchPendingWorks() {
    return _fetchWorks('pending_review=eq.true&published=eq.false');
  }

  async function fetchPublishedWorks() {
    return _fetchWorks('published=eq.true');
  }

  // Convierte una fila de Supabase al formato compatible con home/admin/my-comics
  function _workToComic(w, published, thumb) {
    return {
      id:            w.id,
      supabaseId:    w.id,
      title:         w.title        || '(sin título)',
      author:        w.author_name  || '',
      username:      w.author_name  || '',
      genre:         w.genre        || '',
      navMode:       w.nav_mode     || 'fixed',
      social:        w.social       || '',
      published:     published,
      approved:      published,
      // pending_review viene de Supabase — fuente de verdad definitiva
      pendingReview: published ? false : (w.pending_review || false),
      updatedAt:     w.updated_at,
      panels:        thumb ? [{ dataUrl: thumb }] : [],
    };
  }

  // Devuelve metadatos básicos de obras por array de supabaseIds (para sync multi-dispositivo)
  async function fetchWorksByIds(ids) {
    if (!ids || !ids.length) return [];
    const list = ids.join(',');
    const r = await _get(`works?id=in.(${list})&select=id,updated_at,title,genre,nav_mode,published,pending_review`);
    return r || [];
  }

  // ── BIBLIOTECA ────────────────────────────────────────────────
  async function bibFetch(authorId, workId) {
    // Filtrar por author_id — el filtrado por folder_id se hace en JS
    // para evitar problemas de encoding del wildcard % en la URL
    const filter = `author_id=eq.${authorId}&order=created_at.asc`;
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${BASE}/biblioteca?${filter}`, {
      headers: _hdrsUser(),
    });
    if (!r.ok) throw new Error(`bibFetch: ${r.status} ${await r.text()}`);
    const rows = await r.json();
    // Filtrar en JS por workId si se especificó
    if (!workId) return rows;
    return rows.filter(row => row.folder_id && row.folder_id.startsWith(workId + '::'));
  }

  // Sincronización completa: sube todos los items locales a Supabase.
  // folder_id se prefixa con workId:: para aislar por proyecto.
  async function bibSync(authorId, bibData, workId) {
    const prefix = workId ? workId + '::' : '';
    const folders = (bibData && bibData.folders) ? bibData.folders : [];
    const rows = [];
    for (const folder of folders) {
      for (const entry of (folder.items || [])) {
        let _animUrl = null;
        // APNG animado de biblioteca: subir al bucket 'anims'
        if (entry.isGifAnim) {
          try {
            let _apngDataUrl = null;
            if (entry.apngSrc) {
              // Ya es un dataUrl APNG completo — subir directamente
              _apngDataUrl = entry.apngSrc;
            } else if (entry.pngFrames && entry.pngFrames.length > 1) {
              // Array de frames individuales — reconstruir APNG
              _apngDataUrl = await _buildApngFromFrames(entry.pngFrames, entry.gcpFrameDelay || 100);
            }
            if (_apngDataUrl) {
              const _bucketKey = 'bib_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
              _animUrl = await _animUpload(_bucketKey, _apngDataUrl);
            }
          } catch(e) { console.warn('bibSync APNG upload:', e); }
        }
        // Payload: para GIF/APNG incluir todo lo necesario para re-edición
        // pngFrames van al bucket (anim_url), gifDataUrl/thumb son pequeños
        // gcpLayersData/gcpFramesData son vectoriales — se comprimen bien
        const _payload = entry.isGifAnim
          ? { isGifAnim:      true,
              gifDataUrl:     entry.gifDataUrl,
              gcpFrameDelay:  entry.gcpFrameDelay,
              gcpRepeatCount: entry.gcpRepeatCount,
              gcpStopAtEnd:   entry.gcpStopAtEnd,
              gcpLayersData:  entry.gcpLayersData  || null,
              gcpFramesData:  entry.gcpFramesData  || null,
              gcpLayerNames:  entry.gcpLayerNames  || null,
              normW:          entry.normW           || null,
              normH:          entry.normH           || null }
          : entry.layerData;
        const _ld = await _czCompress(JSON.stringify(_payload));
        rows.push({
          id:          entry.id,
          author_id:   authorId,
          layer_type:  entry.isGifAnim ? 'gif' : ((entry.layerData && entry.layerData.type) || 'unknown'),
          layer_data:  _ld,
          anim_url:    _animUrl,
          thumb:       entry.thumb,
          folder_id:   prefix + folder.id,
          folder_name: folder.name,
        });
      }
    }
    if (!rows.length) return;
    if (window._authTryRefresh) await window._authTryRefresh();
    const r = await fetch(`${BASE}/biblioteca`, {
      method:  'POST',
      headers: { ..._hdrsUser(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(`bibSync: ${r.status} ${await r.text()}`);
  }

  // Descarga biblioteca desde Supabase y reconstruye la estructura de carpetas.
  async function bibDownload(authorId, workId) {
    const rows = await bibFetch(authorId, workId);
    const prefix = workId ? workId + '::' : '';
    const folderMap = new Map();
    for (const r of rows) {
      const rawFid = r.folder_id || '__root__';
      const fid  = prefix && rawFid.startsWith(prefix) ? rawFid.slice(prefix.length) : rawFid;
      const fname = r.folder_name || 'General';
      if (!folderMap.has(fid)) folderMap.set(fid, { id: fid, name: fname, items: [] });
      let ld = null;
      try {
        const _rld = await _czDecompress(r.layer_data);
        ld = JSON.parse(_rld);
      } catch(e) {}
      if (!ld) continue;
      // Reconstruir item: GIF o layer normal
      if (ld.isGifAnim) {
        // Descargar APNG desde bucket si tiene anim_url
        let _pngFrames = ld.pngFrames || null;
        let _apngSrc = null;
        if (r.anim_url) {
          try {
            _apngSrc = await _animDownload(r.anim_url);
          } catch(e) { console.warn('bibDownload APNG:', e); }
        }
        folderMap.get(fid).items.push({
          id:             r.id,
          timestamp:      new Date(r.created_at).getTime(),
          isGroup:        false,
          isGifAnim:      true,
          gifDataUrl:     ld.gifDataUrl,
          pngFrames:      _pngFrames,
          apngSrc:        _apngSrc,
          gcpFrameDelay:  ld.gcpFrameDelay  || 100,
          gcpRepeatCount: ld.gcpRepeatCount || 0,
          gcpStopAtEnd:   ld.gcpStopAtEnd   || false,
          gcpLayersData:  ld.gcpLayersData  || null,
          gcpFramesData:  ld.gcpFramesData  || null,
          gcpLayerNames:  ld.gcpLayerNames  || null,
          normW:          ld.normW           || null,
          normH:          ld.normH           || null,
          layerData:      null,
          thumb:          r.thumb,
        });
      } else {
        folderMap.get(fid).items.push({
          id:        r.id,
          timestamp: new Date(r.created_at).getTime(),
          layerData: ld,
          thumb:     r.thumb,
        });
      }
    }
    return { folders: [...folderMap.values()] };
  }

  // Lista todas las obras de un autor en Supabase (para sync multi-dispositivo)
  async function fetchWorksByAuthor(authorId) {
    if(!authorId) return [];
    const works = await _get(
      `works?author_id=eq.${authorId}&order=updated_at.desc` +
      `&select=id,title,author_name,genre,nav_mode,social,published,pending_review,updated_at`
    ).catch(() => []);
    if(!works || !works.length) return [];
    const ids = works.map(w => w.id).join(',');
    let thumbMap = {};
    try {
      const panels = await _get(`panels?work_id=in.(${ids})&panel_order=eq.0&select=work_id,data_url`);
      (panels || []).forEach(p => { thumbMap[p.work_id] = p.data_url; });
    } catch(_) {}
    return works.map(w => _workToComic(w, w.published, thumbMap[w.id] || ''));
  }

    // Test de compresión/descompresión — accessible desde consola o botón
  async function testCompression() {
    const results = [];
    // Test 1: string corto (no se comprime por _CZ_MIN)
    const short = JSON.stringify({test:'short', val:123});
    const c1 = await _czCompress(short);
    const d1 = await _czDecompress(c1);
    results.push('SHORT: input=' + short.length + 'b compressed=' + c1.length + 'b match=' + (d1===short));
    // Test 2: string largo con datos reales tipo gcpLayersData
    const big = JSON.stringify({isGifAnim:true, gcpLayersData: new Array(50).fill({type:'draw',dataUrl:'data:image/png;base64,' + 'A'.repeat(5000)}), gcpFramesData: new Array(10).fill([{x:0.5,y:0.5,scale:1}]), normW:0.4, normH:0.3});
    const c2 = await _czCompress(big);
    const d2 = await _czDecompress(c2);
    results.push('BIG: input=' + big.length + 'b compressed=' + c2.length + 'b ratio=' + Math.round(c2.length/big.length*100) + '% match=' + (d2===big));
    // Test 3: roundtrip doble
    const c3 = await _czCompress(c2);
    const d3 = await _czDecompress(c3);
    results.push('DOUBLE: compressed=' + c3.length + 'b match=' + (d3===c2));
    return results;
  }
  window._czTest = testCompression;

  return { saveDraft, submitForReview, approveWork, unpublishWork, deleteWork, deleteAuthorData, downloadDraftAsEditorData, fetchPendingWorks, fetchPublishedWorks, fetchWorksByIds, fetchWorksByAuthor, bibSync, bibDownload };
})();
