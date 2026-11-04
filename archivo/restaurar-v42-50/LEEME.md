# Restaurar una copia desde el panel — pruebas archivadas (v42.50)

> **Esta carpeta NO forma parte de la app**: nada la carga (ni `index.html` ni `sw.js`). Guarda el banco de pruebas de extremo a extremo de la pestaña
> «Restaurar» para poder repetirlo cuando se toque `js/admin-restore.js`, `sql/v42_50_restaurar_admin_1_funcion.sql` o las funciones `xr.ensure / headFile / putFile`
> y `adminRestoreRpc` de `js/supabase-client.js`. La guía de uso está en `backup/LEEME_COPIA_ADMIN.md` §6.0.

## Qué se probó y cómo
Todo es **real** salvo la capa HTTP de PostgREST:

| Pieza | Real o simulada |
|---|---|
| La app (`js/admin-restore.js`, `supabase-client.js`, `admin.js`, `i18n.js`…) | **real**, en Chromium (Playwright) |
| El Worker de Cloudflare (`comxow-storage-worker`) y R2 | **real** en Miniflare (el código está en los documentos del Proyecto: `claude/comxow-storage-worker.js`) |
| Las funciones SQL `admin_backup` y `admin_restore` | **reales**, en un PostgreSQL 16 local con un esquema que imita Supabase (`mock_e2e.sql`: ids de 64 bits, columna calculada `layer_sha`, disparador `panel_layers_nav_invalidate`, claves ajenas) |
| PostgREST | **simulado** en `rs_lib.mjs`: un manejador de Playwright llama a Postgres con rol `authenticated`, `request.jwt.claims`, tope de **8 s** por sentencia y traduce los errores a los códigos HTTP de PostgREST (57014 → 500, 42501 → 403, función inexistente → 404…) |

## Archivos (`pruebas/`)
| Archivo | Qué es |
|---|---|
| `rs_test.mjs` | 17 escenarios de navegador: `core replace cancel r2down_retry r2down_inline errors damaged timeouts others badpaths nor2 big en tab fk wipe_timeout informe` |
| `rs_lib.mjs` | Banco: Worker, base, simulación de PostgREST, copia de seguridad real generada por la propia app, ganchos para inyectar fallos |
| `rs_data.mjs` | Datos de prueba: 5 obras parecidas a las reales (borrada, con hojas borradas, editada…), capas pesadas en línea y como `r2:…`, 5 archivos en R2, ids de 64 bits, texto con caracteres delicados |
| `cloud_emu.js` | Supabase simulada (la misma que usan otras pruebas; idéntica a `archivo/migracion-r2-v42-48/pruebas/cloud_emu.js`) |
| `sql_test.mjs`, `mock50.sql`, `prep_sql_test.sh` | 108 comprobaciones de `admin_restore` en PostgreSQL (puerta solo-admin, argumentos, `probe`, `wipe`, `rows` add/upsert/dry, `nav`, tiempos, permisos) |
| `mock_e2e.sql`, `inst.mjs` | Esquema de imitación de Supabase para el banco de navegador y su instalador (más las tres funciones del proyecto) |

## Cómo repetirlo
1. **Entorno**: PostgreSQL 16 local con una base `t4250` y un rol superusuario con el nombre del usuario del sistema (`su postgres -c "createdb t4250"` y `su postgres -c "psql -c 'create role root superuser login'"`),
   Node ≥ 18 con `playwright` y `miniflare` instalados globalmente, el módulo `pg` en `/tmp/t4250/node_modules` (`cd /tmp/t4250 && npm i pg`),
   el código del Worker en `/tmp/t4246/comxow-storage-worker.js` (o la variable `WORKER_SRC`) y el proyecto servido en estático en `http://127.0.0.1:8768/`
   (por ejemplo `cd <proyecto> && python3 -m http.server 8768`).
2. **Rutas escritas a mano** (si se usa otra disposición, cambiarlas): `/tmp/t4250/node_modules/pg` (en `rs_lib.mjs`, `sql_test.mjs`, `inst.mjs`), `/tmp/t4250/mock_e2e.sql` y `/home/claude/w/sql/…` (`SQL_FILES` en `rs_lib.mjs`, y `inst.mjs`),
   `/tmp/t4246/comxow-storage-worker.js` (`WORKER_SRC`) y `/tmp/t4249/out` (capturas de `rs_test.mjs`; crear la carpeta). `rs_lib.mjs` espera `cloud_emu.js` a su lado.
3. **Navegador**: `APP_URL=http://127.0.0.1:8768/ NODE_PATH=$(npm root -g) node rs_test.mjs [escenario…]` → al archivarlo: **203 ✓ 0 ✗** (17 escenarios), ≈ 100 s en total (cada escenario vuelve a montar la base).
4. **SQL**: `bash prep_sql_test.sh && node sql_test.mjs` → **108 ✓ 0 ✗**. (`prep_sql_test.sh` reinstala el esquema `mock50.sql`, que es distinto del del banco de navegador: ejecútalo siempre antes de `sql_test.mjs`.)

## Decisiones y lecciones (para no repetir caminos que no sirven)
* **Las filas viajan como texto exacto del archivo**, nunca analizadas y vueltas a serializar: `JSON.parse` redondea los enteros por encima de 2^53 (los ids de `panel_layers`/`panel_texts` son `bigint`) y se perdería el id. Las pruebas usan ids de 9007199254740993 en adelante y comparan fila a fila.
* **`xr.ensure` fuerza la subida (`fresh = true`)**: `_xrEnsure` recuerda en memoria lo que ya sabe que está en R2 (`_xrKnown`) y se saltaría la subida justo cuando R2 se ha vaciado, que es el caso de una restauración.
* **Un tope de tiempo (57014) no se reintenta: se parte el lote.** Reintentar la misma consulta lenta solo la repite. Igual con el borrado: trozos de 25 hojas y, si aun así pasa de 8 s, mitades recursivas. Una fila que falla sola se anota y el resto sigue; los fallos transitorios sí se reintentan (0,7 · 2,5 · 7 s).
* **R2 antes que la base**, y si falla una capa pesada se **para antes de escribir** (reintentar / continuar guardándolas en la base / cancelar). Nunca queda una referencia `r2:` en la base sin su archivo en R2.
* **`panels.nav`**: el disparador `panel_layers_nav_invalidate` lo anula con cualquier inserción de capas; por eso la operación `nav` va **al final** y solo rellena donde ahora es nulo.
* **Obras que existen: no se toca `works`** (ni `panel_count` ni `updated_at`): el editor usa `updated_at` como revisión de la nube y la compara por igualdad. «Reemplazar» sí la restaura de la copia.
* **Las secuencias de identidad no se reajustan**: restaurando en la misma base van por delante de los ids de la copia. Para un proyecto nuevo y vacío está `backup/restaurar-copia.mjs` (que sí ajusta los contadores y restaura las cuentas).
* **Una obra cuya autora ya no existe no entra** (clave ajena): se explica y se arregla marcando «las demás tablas» (las autoras se restauran antes que las obras).
* **«Copiar informe»** (escenario `informe`): texto plano con recuentos, errores, reintentos y lotes partidos por tiempo, sin contenido de capas; si el navegador no deja copiar, se enseña el texto. Es lo que hay que pedirle a Alberto si algo falla en su base real (donde hay disparadores propios, p. ej. `trg_prevent_self_publish` en `works`, que el banco no imita).
* La barra de pestañas del panel pasó a ser **desplazable en pantallas estrechas** (con seis pestañas desbordaba un móvil de 390 px).
