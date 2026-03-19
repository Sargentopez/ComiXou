# Manual Técnico — ComiXow
**Versión activa:** v9.66  
**Mantenedor:** Alberto Gaviña Costero  
**URL producción:** https://sargentopez.github.io/ComiXou  
**Última actualización:** 2026-03-19

---

## 1. Visión general

ComiXow es una PWA (Progressive Web App) para crear y compartir obras ilustradas. Está construida en **vanilla JavaScript**, alojada en **GitHub Pages** y usa **Supabase** como backend. No tiene servidor Node — son archivos estáticos puros.

El nombre de los contenidos es siempre **obra / creación / publicación**. Nunca usar "comic" o "cómic" en código nuevo.

---

## 2. Stack tecnológico

| Componente | Tecnología |
|---|---|
| Frontend | Vanilla JS, HTML5, CSS3 — sin frameworks |
| Hosting | GitHub Pages (rama `main`) |
| Backend/BD | Supabase (PostgreSQL + PostgREST + Auth) |
| PWA | Service Worker propio (`sw.js`) |
| Autenticación | Supabase Auth (JWT) + fallback de usuarios fijos |
| Almacenamiento local | localStorage (`cs_comics`, `cs_session`) |

---

## 3. Estructura de archivos

```
ComiXou/
├── index.html              — SPA shell, carga todo
├── sw.js                   — Service Worker (cache + offline)
├── manifest.json           — PWA manifest
├── icon-192.png / icon-512.png
├── og-banner.png           — Open Graph
│
├── css/
│   ├── main.css            — Estilos globales, índice, auth
│   ├── editor.css          — Estilos del editor
│   └── reader.css          — Estilos del reproductor externo
│
├── js/
│   ├── router.js           — SPA router (hash routing)
│   ├── views.js            — Definición de vistas + versión visible
│   ├── auth.js             — Autenticación híbrida Supabase/local
│   ├── utils.js            — Helpers globales (escHtml, openShareModal)
│   ├── storage.js          — Wrapper localStorage (ComicStore)
│   ├── home.js             — Vista índice: fichas de obras publicadas
│   ├── my-comics.js        — Vista autor: gestión de obras propias
│   ├── admin.js            — Panel de administración
│   ├── editor.js           — Editor (~7500 líneas, núcleo principal)
│   ├── editor-pages.js     — Gestión de hojas del editor
│   ├── editor-layers.js    — Serialización/deserialización de capas
│   ├── supabase-client.js  — CRUD Supabase (thin wrapper sobre fetch)
│   ├── reader.js           — Visor interno del SPA
│   ├── header.js           — Cabecera común
│   ├── genres.js           — Lista de géneros
│   ├── i18n.js             — Internacionalización (ES)
│   ├── fullscreen.js       — API Fullscreen
│   ├── pwa.js              — Instalación PWA
│   ├── auth-pages.js       — Páginas de login/registro
│   └── seed.js             — Datos de prueba (DESACTIVADO en producción)
│
├── reader/                 — Reproductor externo standalone
│   ├── index.html
│   ├── reader.css
│   └── reader.js
│
├── pages/                  — Assets de páginas estáticas
│
└── tests/
    ├── unit.test.js        — Tests unitarios (Node, sin navegador)
    └── checklist.md        — Checklist de regresión manual
```

---

## 4. Credenciales y configuración Supabase

**Proyecto:** `qqgsbyylaugsagbxsetc.supabase.co`  
**URL REST:** `https://qqgsbyylaugsagbxsetc.supabase.co/rest/v1`  
**Anon key:** `sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd`

La key es la clave pública (`anon`/`publishable`) — es segura para estar en el código cliente. Las políticas RLS de Supabase controlan el acceso real.

Ambas se definen en **dos sitios** (mantener sincronizadas):
- `js/auth.js` → constantes `SB_URL` y `SB_KEY`
- `js/supabase-client.js` → constantes `BASE` y `KEY`

### ⚠️ Confirmación de email

**Estado actual:** DESACTIVADA (desarrollo/pruebas).  
**Activar al pasar a producción:**  
Supabase Dashboard → Authentication → Sign In / Providers → Email → activar "Confirm email"

---

## 5. Schema de base de datos

### Tabla `works`
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Generado por Supabase |
| author_id | UUID | FK → auth.users |
| author_name | TEXT | Nombre visible del autor |
| title | TEXT | Título de la obra |
| genre | TEXT | Género/categoría |
| nav_mode | TEXT | `fixed` / `horizontal` / `vertical` |
| published | BOOLEAN | Visible en el índice público |
| social | TEXT | Redes y comentarios del autor |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### Tabla `panels`
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| work_id | UUID | FK → works |
| panel_order | INTEGER | Orden de la hoja |
| orientation | TEXT | `v` (vertical) / `h` (horizontal) |
| text_mode | TEXT | `sequential` / `immediate` |
| data_url | TEXT | Miniatura base64 (fallback/thumbnail) |
| transition_type | TEXT | `cut` (por defecto) |
| scroll_speed | NUMERIC | Para scroll continuo |

### Tabla `panel_texts`
Textos y bocadillos serializados para el reproductor (lógica sequential).

| Columna | Tipo |
|---|---|
| id | UUID PK |
| panel_id | UUID FK |
| text_order | INTEGER |
| type | TEXT (`bubble`/`text`) |
| style | TEXT (estilo bocadillo) |
| x, y, w, h | NUMERIC (coords en % de la hoja) |
| text | TEXT |
| font_family | TEXT |
| font_size | INTEGER |
| color, bg, border_color | TEXT |
| rotation, padding | NUMERIC/INTEGER |
| font_bold, font_italic | BOOLEAN |
| has_tail, tail_starts, tail_ends | BOOLEAN/TEXT |

### Tabla `panel_layers`
Capas del editor serializadas como JSON. Permite editar obras de la nube sin pérdida.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| panel_id | UUID FK | |
| layer_order | INTEGER | |
| layer_type | TEXT | `image`/`draw`/`stroke`/`bubble`/`text`/`shape`/`line` |
| layer_data | TEXT | JSON completo de `edSerLayer()` |

### Tabla `authors`
Perfiles de usuario. Se crea/actualiza automáticamente al hacer login.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | Mismo UUID que auth.users |
| username | TEXT | Nombre visible |
| email | TEXT | |
| role | TEXT | `admin` / `author` |

---

## 6. Autenticación

Sistema híbrido en `js/auth.js`:

1. **Login normal:** email + contraseña → Supabase Auth → JWT → se cachea en `localStorage` (`cs_session`)
2. **Fallback offline:** usuarios fijos `admin@comixow.com` / `macario@yo.com` (contraseña: `123456`) — funcionan sin conexión

### Roles
| Rol | Acceso |
|---|---|
| `admin` | Panel de administración completo, aprobar/retirar/eliminar obras |
| `author` | Crear, editar, publicar sus propias obras |

### Compatibilidad de IDs
Las obras antiguas guardadas localmente usan IDs tipo `u_macario`. Las nuevas usan UUID de Supabase. El sistema acepta ambos mediante `canManage()`:
```js
comic.userId === u.id || comic.username === u.username
```

---

## 7. Router SPA

Hash routing en `js/router.js`. Las vistas registradas son:

| Hash | Vista | Archivo |
|---|---|---|
| `#home` | Índice público | `home.js` |
| `#login` | Login | `auth-pages.js` |
| `#register` | Registro | `auth-pages.js` |
| `#my-comics` | Vista del autor | `my-comics.js` |
| `#editor` | Editor | `editor.js` |
| `#admin` | Panel admin | `admin.js` |
| `#reader` | Visor interno | `reader.js` |

El reproductor **externo** (`reader/index.html`) es una página independiente, no una vista del SPA.

---

## 8. Editor — arquitectura interna

### Constantes de lienzo
```js
ED_PAGE_W  = 360   // ancho hoja vertical (px workspace)
ED_PAGE_H  = 780   // alto hoja vertical
ED_CANVAS_W = 1800 // workspace total ancho
ED_CANVAS_H = 2340 // workspace total alto
```
La hoja siempre está centrada en el workspace con márgenes calculados por `edMarginX()` / `edMarginY()`.

### Sistema de capas (Layer System)

Cada hoja tiene un array `page.layers`. Los tipos de capa son:

| Clase | Tipo | Descripción |
|---|---|---|
| `ImageLayer` | `image` | Foto o imagen importada |
| `DrawLayer` | `draw` | Dibujo libre (canvas propio, cubre workspace completo) |
| `StrokeLayer` | `stroke` | Trazos vectorizados (canvas recortado al bbox) |
| `TextLayer` | `text` | Caja de texto |
| `BubbleLayer` | `bubble` | Bocadillo con cola y estilos |
| `ShapeLayer` | `shape` | Rectángulo o elipse editable |
| `LineLayer` | `line` | Polígono/recta con vértices arrastrables |

**Orden de render:** imagen → stroke → draw → shapes/lines → textos/bocadillos (siempre al final).  
**Selección:** pixel-hit real en cada clase. Jamás solo bbox. Textos/bocadillos tienen prioridad.

### Cámara
```js
edCamera = { x, y, z }  // posición y zoom del workspace
```
La cámara **solo se resetea** en:
- Primera carga del editor
- Cambio de hoja
- Carga de proyecto
- Cambio de orientación del dispositivo
- Botón 🔍 (usuario explícito)

Nunca se resetea por eventos de touch, resize de ventana o apertura de paneles.

### Historia (Undo/Redo)
- **Global:** `edHistory[]` — snapshots de todas las capas
- **Local shape/line:** `_edShapeHistory[]` — solo mientras el panel está abierto
- **Local draw:** `edDrawHistory[]` — trazos del dibujo libre

### Bloqueo de menús durante edición (`draw-active`)
Cuando se abre un panel de herramienta (dibujo, shape, line, texto, bocadillo), el shell añade la clase `draw-active` que bloquea la barra de menús con `pointer-events:none`.

Cuando el panel de texto/bocadillo está abierto, el overlay `#_edPropsOverlay` (un div transparente dentro de `#edMenuBar`) absorbe los clicks sobre la barra bloqueada para que no atraviesen al canvas.

### Serialización de capas
- `edSerLayer(la)` → objeto JSON plano
- `edDeserLayer(obj)` → instancia de clase correcta
- Se usa para: historial local, guardado localStorage, subida a Supabase (`panel_layers.layer_data`)

---

## 9. Flujo de datos — subir/bajar obras

### Subir obra (autor → nube)
```
edCloudSave()
  → edSerLayer() por cada capa → panel_layers (JSON)
  → panel_texts (coordenadas %, para reproductor)
  → panels.data_url (miniatura renderizada)
  → works (metadatos)
```

### Bajar obra para editar (nube → editor)
```
downloadDraftAsEditorData(supabaseId)
  → panel_layers → JSON.parse → edDeserLayer()
  → capas restauradas en el editor sin conversión
  Fallback: si no hay panel_layers, usa data_url como ImageLayer
```

### Publicar obra
```
my-comics.js: botón "Publicar"
  → SupabaseClient.publishWork()
  → PATCH works SET published=true
  → Estado cambia a "En revisión" hasta aprobación del admin
Admin aprueba:
  → No hay paso adicional en esta versión
  → published=true ya la hace visible en el índice
```

---

## 10. Reproductor externo

Ubicación: `reader/index.html` — página independiente del SPA.

Parámetros URL: `reader/?id=SUPABASE_ID`

El reproductor:
1. Lee `works` + `panels` + `panel_texts` de Supabase
2. Renderiza capas de `panel_layers` en canvas (misma lógica que el editor)
3. Añade un panel sintético de créditos al final (hereda orientación de la última hoja)
4. Soporta modo `embed=1` para uso como iframe

**Regla permanente:** el reproductor externo debe tener funcionalidad idéntica al visor interno del editor. Cualquier cambio en uno se aplica al otro.

---

## 11. Service Worker y caché

`sw.js` implementa estrategia **network-first** para HTML/JS/CSS y **cache-first** para imágenes.

El nombre de caché sigue el patrón `comixow-vX-XX` (ej: `comixow-v9-66`).

### Actualizar la versión (obligatorio en cada entrega)
Actualizar en exactamente **dos sitios**:
```bash
# En js/views.js — versión visible en el footer
sed -i 's/v9\.66/v9.67/g' js/views.js

# En sw.js — nombre del cache (invalida la caché anterior)
sed -i 's/comixow-v9-66/comixow-v9-67/' sw.js
```

---

## 12. Empaquetado y despliegue

### Flujo completo antes de cada entrega

```bash
# 1. Ejecutar tests unitarios
node tests/unit.test.js
# → Debe terminar con 0 fallos. Si falla, no empaquetar.

# 2. Verificar sintaxis JS
node --check js/editor.js && echo "OK"

# 3. Actualizar versión (dos sitios)
sed -i 's/comixow-vX-XX/comixow-vX-XY/' sw.js
sed -i 's/vX\.XX/vX.XY/g' js/views.js

# 4. Empaquetar
rm -rf /tmp/pkg && mkdir -p /tmp/pkg/ComiXou
cp -r css js pages reader tests /tmp/pkg/ComiXou/
cp index.html sw.js manifest.json icon-192.png icon-512.png og-banner.png /tmp/pkg/ComiXou/

# 5. Crear ZIP
cd /tmp/pkg && zip -qr ComiXou_vX.XY.zip ComiXou/

# 6. Verificar estructura (debe haber exactamente 5 directorios)
unzip -l ComiXou_vX.XY.zip | grep "/$"
```

### Despliegue en GitHub Pages
Subir los archivos del ZIP a la rama `main` del repositorio. GitHub Pages despliega automáticamente. Si el despliegue se queda atascado, cancelar y volver a hacer push desde GitHub Actions.

---

## 13. Tests automatizados

### Tests unitarios (`tests/unit.test.js`)
Se ejecutan con Node puro, sin navegador:
```bash
node tests/unit.test.js
```

Cubren:
- Dimensiones de página y márgenes del workspace
- Sistema de cámara/zoom (pivote, límites, factor neutro)
- Resolución de conflictos entre radios de curva adyacentes
- Escalado de radios en resize proporcional y asimétrico
- Geometría de capas y escalado de vértices LineLayer

**Si algún test falla, no se entrega el ZIP.** Se corrige primero.

### Ampliar los tests
Añadir casos en `tests/unit.test.js` siguiendo el patrón:
```js
test('descripción del caso', () => {
  // preparar datos
  assert(condición, 'mensaje si falla');
  approx(valorObtenido, valorEsperado, tolerancia);
});
```

### Checklist de regresión manual (`tests/checklist.md`)
40 pruebas organizadas por área para ejecutar en PC y Android antes de aprobar una versión. Revisar especialmente las secciones afectadas por los cambios de cada entrega.

---

## 14. Bugs conocidos y decisiones de diseño

### Decisiones permanentes (no revertir)
- **Selección por pixel-hit real:** `StrokeLayer.contains()`, `DrawLayer.contains()`, `LineLayer.contains()` implementan hit-testing con lectura de alpha. Nunca reemplazar por bbox puro.
- **Reproductor = Visor interno:** cualquier cambio en uno se aplica al otro.
- **Canvas 720×1280:** nunca usar en el reproductor (eliminado en v6.89).
- **Cámara inmutable:** solo se resetea en los 6 casos documentados en §8.

### Compatibilidad hacia atrás
- Obras locales antiguas usan `userId: 'u_macario'`. Las funciones `getByUser()` y `canManage()` aceptan ambos formatos (UUID y username string).
- `panel_layers` puede estar vacío en obras muy antiguas → fallback a `data_url` como `ImageLayer`.

### seed.js
Contiene datos de prueba. **Debe estar comentado** en `index.html` en producción. Activo solo durante desarrollo.

---

## 15. Variables de entorno y configuración por entorno

No hay sistema de variables de entorno (es un sitio estático). Los cambios entre desarrollo y producción son:

| Acción | Desarrollo | Producción |
|---|---|---|
| Confirmación email | Desactivada | **Activar en Supabase** |
| seed.js | Puede estar activo | **Comentar en index.html** |
| Usuarios fijos | admin@comixow.com / macario@yo.com | Mantener como fallback |

---

## 16. Mantenimiento de Supabase

### Backups
Supabase Free tier no incluye backups automáticos. Exportar periódicamente desde el panel:
Dashboard → Project Settings → Database → Backups (o pg_dump manual).

### Añadir columnas al schema
Usar `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Incluir siempre `DEFAULT` para no romper filas existentes. Documentar el SQL en la carta de sesión correspondiente.

### Políticas RLS
Las tablas tienen RLS activo. Las operaciones de lectura pública usan la anon key. Las escrituras requieren JWT válido. Si se crean tablas nuevas, recordar añadir las políticas correspondientes.

---

*Documento generado el 2026-03-19. Actualizar con cada cambio significativo de arquitectura.*
