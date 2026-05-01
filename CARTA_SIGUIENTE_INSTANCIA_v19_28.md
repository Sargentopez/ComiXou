# SISTEMA DE ANIMACIONES APNG — ComiXou v19.28
## Documentación completa para futuras instancias

---

## 1. TIPOS DE ANIMACIÓN

Hay dos tipos de animación en ComiXou:

| Tipo | Clase | Origen | Campo clave |
|------|-------|--------|-------------|
| GIF importado | `GifLayer` (type='gif') | Archivo .gif | `gifKey` |
| APNG animado | `ImageLayer` (type='image') | Archivo .png / Editor GCP / Biblioteca | `_pngFramesKey` |

Este documento cubre únicamente el sistema APNG. El sistema GIF es independiente y funcionaba antes — no tocarlo.

---

## 2. ARQUITECTURA APNG EN EL EDITOR (editor.js)

### 2.1 Decodificador — ApngDecoder (definido en editor.js, expuesto como window.ApngDecoder)

```
window.ApngDecoder = {
  decode(input, delay)           // input: string dataUrl APNG o array de dataUrls PNG
  decodeFrameArray(urls, delay)  // decodifica array de PNG individuales
  decodeApng(dataUrl, delay)     // decodifica APNG completo con UPNG
}
```

- Si `input` es **string** → usa `decodeApng` (UPNG) → extrae todos los frames con delays reales
- Si `input` es **array** → usa `decodeFrameArray` → trata cada elemento como PNG estático

Requiere: `pako.min.js` y `UPNG.js` cargados antes en `index.html`

### 2.2 ImageLayer — campos de animación

```
l._pngFrames       // array de dataUrls PNG individuales (frames del editor GCP)
l._pngFramesKey    // clave IDB donde están guardados los frames (puesto por ComicStore.save)
l._apngSrc         // dataUrl APNG completo (descargado de nube o importado desde archivo)
l.animKey          // clave del bucket Supabase (generada al importar/crear)
l._animFrames      // array de {imageData, delay} — en memoria tras loadAnim()
l._animOc/_oc      // canvas offscreen con el frame actual pintado
l._animReady       // true cuando loadAnim() completó
l._fIdx            // índice del frame actual
l._gcpPlayCount    // contador de repeticiones
l._gcpFrameDelay   // ms por frame (default 100)
l._gcpRepeatCount  // 0 = infinito
l._gcpStopAtEnd    // true = parar en el último frame
l._gcpLayersData   // layers del editor GCP serializados (para re-edición)
l._gcpFramesData   // estados de frames por layer (para re-edición)
l._gcpLayerNames   // nombres de capas
```

### 2.3 loadAnim(input, cb)

```
ImageLayer.loadAnim(input, cb):
  - Si _animReady && _animFrames.length → reutiliza, llama cb() inmediatamente
  - Si input vacío → cb() y return
  - Si no hay ApngDecoder → warn y cb()
  - ApngDecoder.decode(input, delay) → result.{frames, width, height}
  - Crea _oc canvas, pinta frame 0, _animReady=true
  - cb()
```

### 2.4 _applyFrame(i)

Loop de animación con setTimeout. Comprueba stopAtEnd/repeatCount. Llama edRedraw() o edUpdateViewer() según si el visor está abierto.

### 2.5 stopAnim()

Cancela timer, _playing=false, _fIdx=0, _gcpPlayCount=0, pinta frame 0 en _oc.

### 2.6 _edGifSetPlaying(playing) — activa/desactiva animaciones en visor

Detecta layers animados con:
```js
l.type === 'image' && ((l._pngFrames && l._pngFrames.length > 1) || l._apngSrc)
```
Si `playing=true`: resetea _fIdx=0, _gcpPlayCount=0, llama loadAnim(_apngSrc || _pngFrames).
Si `playing=false`: stopAnim().

### 2.7 edSerLayer (serialización)

Para type='image' animado incluye:
- `_pngFrames` (si tiene contenido real, l._pngFrames[0] no vacío)
- `animKey`
- `_gcpLayersData`, `_gcpFramesData`, `_gcpLayerNames`
- `_gcpFrameDelay`, `_gcpRepeatCount`, `_gcpStopAtEnd`
- `src` = primer frame comprimido con _edCompressImageSrc
- **NO incluye**: `_apngSrc` (demasiado grande), `_animFrames`, `_oc`, `_animReady`

### 2.8 ComicStore.save() — externalización a IDB

Para cada layer con `_pngFrames`:
```
_edAnimIdbSave(projectId_pi_li, _pngFrames)  →  IDB cxAnims
delete _sl._pngFrames
_sl._pngFramesKey = 'projectId_pi_li'
```
El layer guardado en localStorage tiene `_pngFramesKey` en lugar de `_pngFrames`.

### 2.9 edDeserLayer — restauración

Prioridad de carga:
1. Si `d._apngSrc` → `loadAnim(d._apngSrc)` (string → decodeApng)
2. Si `d._pngFrames` con contenido real → `loadAnim(d._pngFrames)` (array → decodeFrameArray)
3. Si `d._pngFramesKey` (sin _pngFrames ni _apngSrc) → `_edAnimIdbLoad(key)`:
   - Si devuelve **string** → `l._apngSrc = data`, `loadAnim(string)`
   - Si devuelve **array** → `l._pngFrames = data`, `loadAnim(array)`

### 2.10 IDB del editor — _edAnimIdbLoad / _edAnimIdbSave

- BD: `cxAnims`, object store: `anims`
- Abre conexión propia (sin caché) — puede coexistir con _animDb de supabase-client
- Guarda arrays de frames PNG (sistema local)

---

## 3. SISTEMA IDB DE SUPABASE-CLIENT (supabase-client.js)

### 3.1 Conexión cacheada

```js
let _animDb = null;  // conexión cacheada — evita conflictos
_animIdbOpen()       // abre cxAnims/anims si no está abierta
_sbAnimIdbSave(key, data)  // guarda string dataUrl o array de frames
_sbAnimIdbLoad(key)         // lee lo guardado
window._sbAnimIdbSave = _sbAnimIdbSave  // expuesto globalmente
window._sbAnimIdbLoad = _sbAnimIdbLoad  // expuesto globalmente
```

**IMPORTANTE:** Usar siempre `window._sbAnimIdbSave` (nunca abrir cxAnims con conexión propia) para evitar conflictos de múltiples conexiones en Android.

### 3.2 _buildApngFromFrames(frameUrls, delayMs)

Convierte array de dataUrls PNG individuales → dataUrl APNG completo usando UPNG.
Usado en el upload cuando los datos en IDB son un array (sistema biblioteca).

### 3.3 _animUpload(key, dataUrl)

Sube blob PNG binario al bucket `anims` con `x-upsert:true`.
Path: `anims/KEY.png`
URL pública: `STORAGE/object/public/anims/KEY.png`

### 3.4 _animDownload(animUrl)

Descarga blob PNG del bucket → FileReader → dataUrl string.

---

## 4. FLUJO UPLOAD A SUPABASE (_uploadPanels)

Para cada layer `type='image'` con `_pngFramesKey || animKey`:

```
idbKey = l._pngFramesKey || l.animKey
bucketKey = 'anim_' + timestamp_random
_sbAnimIdbLoad(idbKey) → data
  si string → _animUpload(bucketKey, data) → animUrl
  si array  → _buildApngFromFrames(array) → _animUpload(bucketKey, apng) → animUrl
```

`layer_data` comprimido incluye: `animKey`, `_gcpLayersData`, `_gcpFramesData`, `_gcpLayerNames`, `gcpFrameDelay/RepeatCount/StopAtEnd`. **NO incluye** `_pngFrames`, `_pngFramesKey`, `_apngSrc`.

---

## 5. FLUJO DOWNLOAD DE SUPABASE (downloadDraftAsEditorData)

Para cada `panel_layer` con `type='image'` y `row.anim_url`:

```
_animDownload(row.anim_url) → apngDataUrl (string)
layerObj._apngSrc = apngDataUrl
layerObj.animKey  = layerObj.animKey || 'anim_' + timestamp_random
layerObj._pngFramesKey = layerObj.animKey
_sbAnimIdbSave(layerObj.animKey, apngDataUrl)  ← await
```

### 5.1 my-comics.js — procesamiento antes de ComicStore.save

Para layers con `_apngSrc`:
```
_sbAnimIdbSave(_pngFramesKey, _apngSrc)  ← en _idbWrites[]
delete lClean._apngSrc
lClean._pngFramesKey = _idbKey
```
`await Promise.all(_idbWrites)` antes de ComicStore.save — garantiza IDB listo.

### 5.2 edDeserLayer en dispositivo B

Lee `_pngFramesKey` → `_edAnimIdbLoad` → string dataUrl → `l._apngSrc` → `loadAnim` → animación lista.

---

## 6. SISTEMA DE BIBLIOTECA (bibSync / bibDownload)

### 6.1 Item de biblioteca animado (_gcpSaveToLib)

```js
{
  id: timestamp_gif,
  isGifAnim: true,
  gifDataUrl: pngFrames[0],    // primer frame PNG (thumbnail)
  pngFrames: [...],             // todos los frames PNG renderizados
  gcpLayersData: [...],         // layers del editor GCP (para re-edición)
  gcpFramesData: [...],         // estados de frames por layer
  gcpLayerNames: [...],         // nombres de capas
  normW, normH,                 // dimensiones normalizadas (fracción de página)
  gcpFrameDelay, gcpRepeatCount, gcpStopAtEnd,
  thumb: dataUrl80px
}
```

### 6.2 bibSync (upload biblioteca)

Para cada item `isGifAnim`:
1. Si `entry.apngSrc` → subir directamente al bucket
2. Si `entry.pngFrames.length > 1` → `_buildApngFromFrames` → subir al bucket
3. `anim_url` = URL del bucket
4. `layer_data` comprimido con: `{isGifAnim, gifDataUrl, gcpLayersData, gcpFramesData, gcpLayerNames, normW, normH, gcpFrameDelay, gcpRepeatCount, gcpStopAtEnd}`
5. `folder_id = supabaseId + '::' + folder.id`

### 6.3 bibDownload (download biblioteca)

- Filtra por `author_id` y `folder_id.startsWith(supabaseId + '::')`
- Para cada fila con `layer_type='gif'` OR `ld.isGifAnim`:
  - `_animDownload(row.anim_url)` → `apngSrc`
  - Reconstruye item con todos los campos de `ld`

### 6.4 my-comics.js — procesamiento biblioteca descargada

Para items con `apngSrc`:
```
_bibIdbKey = 'bib_' + item.id
_sbAnimIdbSave(_bibIdbKey, item.apngSrc)  ← en _bibIdbWrites[]
delete cleanItem.apngSrc
cleanItem._apngIdbKey = _bibIdbKey
```
`await Promise.all(_bibIdbWrites)` → `localStorage.setItem`

### 6.5 Inserción desde biblioteca en editor

Si item tiene `_apngIdbKey`:
```
_sbAnimIdbLoad(_apngIdbKey) → entry.apngSrc
→ inserción normal con loadAnim(apngSrc)
```
Si item tiene `apngSrc` directamente (dispositivo A):
```
la.src = entry.gifDataUrl  (primer frame PNG pequeño — no el APNG)
la._apngSrc = entry.apngSrc
la._gcpLayersData = entry.gcpLayersData
la._gcpFramesData = entry.gcpFramesData
...
loadAnim(apngSrc) → decodeApng → _animFrames
```

---

## 7. SUPABASE — ESTRUCTURA Y POLÍTICAS

### 7.1 Buckets Storage

| Bucket | Tipo | Políticas |
|--------|------|-----------|
| `gifs` | público | INSERT (auth+anon), SELECT público, UPDATE, DELETE auth |
| `anims` | público | INSERT (auth+anon), SELECT público, UPDATE, DELETE auth |

**IMPORTANTE:** Ambos buckets necesitan política UPDATE para que `x-upsert:true` funcione en re-guardados.

### 7.2 Tabla panel_layers

```
id, panel_id, layer_order, layer_type, layer_data (gz:text), gif_url, anim_url
```
- `layer_data` contiene JSON comprimido con gzip+base64 (prefijo `gz:`)
- `anim_url` = URL pública del bucket `anims`
- `layer_type = 'image'` para APNGs

### 7.3 Tabla biblioteca

```
id, author_id, layer_type, layer_data (gz:text), thumb, created_at,
folder_id, folder_name, anim_url
```
- `anim_url` añadida en v19.15
- `layer_type = 'gif'` para items animados
- `folder_id` formato: `supabaseId::folderLocalId`
- Políticas: INSERT, SELECT, UPDATE, DELETE con `auth.uid() = author_id`

### 7.4 Compresión layer_data

Función `_czCompress` / `_czDecompress` en supabase-client.js:
- Usa `CompressionStream('gzip')` nativo del browser
- Fallback: sin comprimir si API no disponible
- Prefijo `gz:` para detectar datos comprimidos
- Procesa por chunks de 8192 bytes (evita stack overflow en Android)
- Compresión típica: 252KB → 755 bytes (~0.3%)

---

## 8. FLUJO COMPLETO A→B (resumen)

```
DISPOSITIVO A:
  Importar APNG → _edTryLoadApng → _pngFrames + animKey + _apngSrc en IDB
  Editor GCP → _gcpSaveToLib → item con pngFrames+gcpLayersData en biblioteca local
  Guardar en nube:
    _uploadPanels → _sbAnimIdbLoad(_pngFramesKey) → _animUpload → anim_url ✓
    bibSync → _buildApngFromFrames(pngFrames) → _animUpload → bib anim_url ✓
    layer_data comprimido sin datos grandes ✓

DISPOSITIVO B:
  Abrir obra:
    downloadDraftAsEditorData → _animDownload(anim_url) → _apngSrc ✓
    my-comics.js → _sbAnimIdbSave(_pngFramesKey, apngSrc) await ✓
    edDeserLayer → _edAnimIdbLoad(_pngFramesKey) → string → loadAnim ✓
    bibDownload → _animDownload(bib anim_url) → apngSrc ✓
    my-comics.js → _sbAnimIdbSave('bib_id', apngSrc) await ✓
    biblioteca local con _apngIdbKey ✓
  
  Insertar desde biblioteca:
    _sbAnimIdbLoad(_apngIdbKey) → apngSrc → loadAnim → animación ✓
    la._gcpLayersData disponible para re-edición en editor GCP ✓
```

---

## 9. REGLAS CRÍTICAS — NO ROMPER

1. **Nunca abrir cxAnims con conexión propia** — siempre usar `window._sbAnimIdbSave/Load`
2. **Nunca serializar `_apngSrc`** en edSerLayer — va a IDB, no a localStorage
3. **Nunca borrar `_gcpLayersData/_gcpFramesData`** en _uploadPanels — son vectoriales, no imágenes
4. **Siempre `await Promise.all(_idbWrites)`** antes de ComicStore.save en my-comics.js
5. **`la.src` al insertar desde biblioteca = `gifDataUrl`** (primer frame PNG pequeño, no el APNG)
6. **Condición de detección en bibDownload**: `ld.isGifAnim || r.layer_type === 'gif'`
7. **Condición de detección en _edGifSetPlaying**: `l._pngFrames.length > 1 || l._apngSrc`
8. **Política UPDATE** en buckets `gifs` y `anims` — necesaria para re-guardados (upsert)
