# Capas pesadas en R2 — qué hay que hacer en el Worker (v42.45)

## Qué es
Las capas con imagen (tinta HD, dibujos…) pesan megas y hoy viven dentro de Supabase (`panel_layers.layer_data`), que cobra la salida de datos. Con esto, el texto de cada capa pesada (≥ 32 KB) se guarda en R2 con **su SHA-256 como nombre** (`blobs/<sha>`) y en Supabase queda solo una referencia corta `r2:<sha>:<bytes>` (~75 caracteres). R2 no cobra la salida de datos.

## Rutas nuevas del Worker (`comxow-storage-worker`)
| Método | Ruta | Quién | Respuesta |
|---|---|---|---|
| `GET` / `HEAD` | `/blobs/<sha>` | público (la URL es el secreto) | 200 texto, caché de 1 año inmutable · 404 |
| `PUT` | `/blobs/<sha>` | con sesión (JWT de Supabase) | 201 creado · 200 ya existía · 400 el contenido no coincide con el hash · 401 · 411 · 413 (> 32 MB) |
| `OPTIONS` | `/blobs/*` | — | pre-vuelo CORS (solo `https://comxow.com` y `https://www.comxow.com` para escribir) |

- R2 **comprueba el SHA-256** del cuerpo (opción `sha256` de `put`): nadie puede guardar contenido distinto bajo un hash. No gasta CPU del Worker (plan gratuito: 10 ms).
- **No hay `DELETE`**: un mismo archivo puede estar en varias obras. Los huérfanos se limpiarán aparte, solo con permiso de administrador.

## Qué necesita el Worker
- Un *binding* de R2 (en `blobs-worker.js` se llama `BUCKET`; cámbialo por el nombre real si es otro).
- Variables `SUPABASE_URL` y `SUPABASE_ANON` (las mismas que ya usa para validar la sesión en `/anims` y `/gifs`).
- Opcional: la variable `MODO_MANTENIMIENTO` (`VERDADERO` → 503), igual que el resto de rutas.

## Cómo integrarlo
`worker/blobs-worker.js` es un Worker completo **solo para pruebas en local**. Para producción hay que llevar su contenido al Worker existente:
1. Copiar las constantes y las funciones `_json`, `_corsWrite`, `_authUser` y `handleBlobs` (si el Worker ya tiene su propia versión de alguna, usar la existente).
2. En el `fetch` principal, antes del resto de rutas: `if (new URL(request.url).pathname.startsWith('/blobs/')) return handleBlobs(request, env);`
3. Desplegar: Cloudflare → Workers y Pages → `comxow-storage-worker` → Editar código → pegar → Desplegar (y «Promocionar versión» si lo pide).

Lo más cómodo: pásame el código actual del Worker y te lo devuelvo ya fusionado, con sus nombres reales de variables, CORS y mantenimiento.

## Orden de activación (nada cambia hasta el paso 4)
1. Desplegar el Worker con las rutas `/blobs`.
2. Subir la app v42.45 (leer capas guardadas en R2 funciona siempre, con o sin interruptor).
3. Administración → pestaña **R2** → **Probar R2**: tiene que salir todo ✓ (comprueba sesión, subida, lectura idéntica, caché inmutable y rechazo de un hash falso).
4. Activar el interruptor «Guardar las capas pesadas (desde 32 KB) en R2» **en un dispositivo**. Es por dispositivo y está apagado de serie.
5. Guardar una obra pequeña de prueba, abrirla con **Editar** y con el **lector**, y mirar el 🩺 (cuántas capas fueron a R2 y cuántas volvieron a la base).
6. Más adelante (v42.46): migrar las capas pesadas que ya están en Supabase, con copia de seguridad previa.

## Garantías de seguridad
- Si R2 no responde al guardar, esa capa se guarda en Supabase como siempre: **guardar nunca falla por culpa de R2**.
- El archivo se sube a R2 **antes** de escribir la fila en Supabase. Una referencia nunca apunta a un archivo que no existe.
- Si al leer no se puede bajar un archivo, la descarga **falla** (aviso «Obra no disponible» / «No se pudo bajar una capa pesada…»): jamás se abre la obra sin esa capa en silencio, porque un guardado posterior la habría borrado de la nube.
- Las copias de seguridad del panel (pestaña Copia) llevan la **referencia**, no el texto de la capa. Hará falta copiar también el bucket (se tratará en el espejo de R2).
