# Migración de capas pesadas de Supabase a R2 — archivo para futuras migraciones (v42.48)

> **Esta carpeta NO forma parte de la app**: nada la carga (ni `index.html` ni `sw.js`). Es el código de la herramienta que se usó el 4-nov-2026
> para mover a R2 las capas pesadas que ya estaban dentro de Supabase, guardado tal cual para poder reutilizarlo. Se quitó de la app en la v42.49.

## Qué se hizo y con qué resultado (4-nov-2026)
- Hasta la v42.47 solo iban a R2 las capas que se guardaban con el interruptor activado. Las que ya estaban dentro de `panel_layers.layer_data` (≥ 32 KB)
  seguían costando egress en cada lectura: **468 capas, 125,8 MB, 28 obras** (el 92 % del peso de la base).
- Se movieron con esta herramienta (simulacro de 5 → real de 5 → resto). Comprobación «a fondo» final: **522 referencias → 350 archivos distintos, todos en R2 con
  tamaño y SHA-256 exactos (82,0 MB); 0 capas pesadas dentro de la base.** (522 = 468 + las 54 que ya había guardado el editor; las capas idénticas comparten archivo.)
- Medido después: leer una obra y editar otra → Supabase +1,1 MB, R2 +34,3 MB (antes ≈ 35 MB de Supabase).

## La idea (técnica estándar de «claim check» / almacenamiento por contenido: Git LFS, Docker, Figma)
El texto grande se guarda en R2 con el nombre = su SHA-256 (`blobs/<sha256>`, ruta `/blobs/<sha>` del Worker `comxow-storage-worker`) y en la columna queda solo
la referencia `r2:<sha256>:<bytes>`. Por cada capa:
1. **SCAN** — `admin_xr_scan` (SQL, solo lectura): lista las capas ≥ N KB con su tamaño real en bytes (`octet_length`, sin descomprimir). Se pagina con `?limit=&offset=`.
2. **Leer** el texto de esa capa de Supabase (petición propia). Si pesa distinto de lo que decía el scan → la capa cambió: se salta (`changed`).
3. **SHA-256** del UTF-8 y **`_xrEnsure`** (HEAD → PUT): el Worker y R2 verifican que el contenido corresponde al hash; uno que no cuadre es rechazado (400).
4. **SWAP** (solo modo «Real») — `admin_xr_swap(id, sha)` (SQL): bloquea la fila, **recalcula el SHA-256 del texto que tiene AHORA** y solo si coincide lo sustituye por la
   referencia, en una transacción, guardando y restaurando `panels.nav` (un disparador lo pone a NULL con cualquier cambio en `panel_layers`).
   Resultados: `ok · already · gone · changed · small · empty`.
- **Simulacro** = pasos 1-3 sin tocar la base; apunta lo subido en un manifiesto local (`cx_xr_mig`, 14 días) para que el modo Real siguiente no vuelva a bajar nada de Supabase.
- **Comprobar** (`xrMigVerify`): relee la base con `p_ref = true` y mira que cada referencia tenga su archivo en R2 (HEAD; «a fondo»: baja el archivo y comprueba tamaño + hash).
- Seguridad: el archivo está en R2 (verificado por hash) ANTES de que cambie la base; la base se niega a cambiar una capa que ya no es la que se subió; nada se borra nunca;
  todo es repetible. Puerta en SQL: solo `authors.username = 'admin' and role = 'admin'` (ni siquiera otro administrador); `revoke … from public, anon`.

## Qué hay aquí
| Archivo | Qué es |
|---|---|
| `supabase-client.bloque-migracion.js` | Bloque literal de `js/supabase-client.js` (xrMigScan / xrMigRun / xrMigVerify + manifiesto + `_xrRpc`). Cabecera con cómo pegarlo |
| `admin-r2.v42.48.js` | La pestaña «R2» completa de la v42.48 (apartados 1-3 + apartado 4 «Mover a R2…») |
| `i18n.adminR2M.js` | Las 59 claves `adminR2M*` en ES y EN (una línea por clave; pegar en `TRANSLATIONS.es` y `.en`) |
| `sql/v42_48_r2_migracion_1_instalar.sql` | `admin_xr_scan` y `admin_xr_swap` + permisos + recarga de PostgREST (+ cómo deshacer) |
| `sql/v42_48_r2_migracion_2_comprobar.sql` | Recuento por cuenta/estado haciéndose pasar por `admin` (para ver qué se va a mover) |
| `pruebas/mig_test.mjs`, `mig_emu.js`, `cloud_emu.js` | 9 escenarios de navegador (Playwright) contra el Worker REAL en Miniflare + una Supabase simulada con las dos funciones SQL |
| `pruebas/pg_test.py`, `run_pg.sh`, `gen.mjs`, `mock_schema.sql`, `expect.json` | Pruebas de las dos funciones SQL en un PostgreSQL 16 local con un esquema que imita Supabase |

## Cómo reutilizarlo
1. **Copia de seguridad reciente** (pestaña «Copia») y **versión de la app ≥ la que entiende las referencias `r2:`** en todos los clientes (un cliente antiguo no las entiende).
2. Pegar el bloque en `supabase-client.js` (ver la cabecera del archivo) y exportarlo en `xr`; volver a poner la pestaña (`admin-r2.v42.48.js`) y los textos (`i18n.adminR2M.js`).
   Cuidado: `admin-r2.v42.48.js` es la pestaña de aquella versión; si la pestaña actual cambió, añadir solo el apartado 4 y sus funciones (`pintarMig`, `verifHtml`, `buscar`, `empezar`, `parar`, `verificar`, manejadores).
3. Ejecutar en Supabase (SQL Editor) `sql/v42_48_r2_migracion_1_instalar.sql` y comprobar con `..._2_comprobar.sql`.
4. En la pestaña R2: «Probar R2» → «Buscar capas pesadas» → **Simulacro** con «cuántas capas» = 5 → **Real** con 5 → comprobar en el editor y en el lector → Real con el resto → «Comprobar» con «A fondo».
5. Al terminar, quitar de nuevo el código y **borrar las funciones SQL** (`sql/v42_49_r2_quitar_funciones_migracion.sql`): una función `SECURITY DEFINER` que escribe en `panel_layers` no debe quedarse instalada sin uso.

## Cómo adaptarlo a otro contenido
- Otra tabla/columna: cambiar `public.panel_layers`/`layer_data` en las dos funciones SQL y la consulta de `_xrmGetLayer` (`panel_layers?id=eq.…&select=layer_data`).
- Otro umbral: `_XRM_MIN` (cliente) y `p_min` (SQL; el mínimo duro de la función es 1024 bytes y el del swap 4096).
- Otro formato de referencia: `_XR_RE` y la cadena que construye `admin_xr_swap` (`'r2:' || sha || ':' || bytes`).
- Lo que sigue en la app y hay que mantener coherente: lectura de referencias (`SupabaseClient.xr.fetchText`, `reader/reader.js`), escritura (`_xrMark`/`_xrFlushRows`), la huella
  alternativa de `_layerDelta` (si no, un dispositivo con R2 apagado devolvería a la base las capas ya migradas) y la expansión de referencias en `js/admin-backup.js`.

## Las pruebas
- Navegador: `APP_URL=http://127.0.0.1:8768/ WORKER_SRC=<Worker fusionado> NODE_PATH=$(npm root -g) node mig_test.mjs [escenario…]` (escenarios: `scan simreal race resilience verify delta backup ui ui_en shots`).
  Necesita `playwright` y `miniflare` globales, la app servida en ese puerto y el código del Worker (en los documentos del Proyecto: `claude/comxow-storage-worker.js`).
  `mig_emu.js` envuelve `cloud_emu.js` y reproduce la semántica de las dos funciones SQL (la prueba real de esas está en PostgreSQL).
- SQL: crear una base `t4247` con `mock_schema.sql`, ejecutar `node gen.mjs` (genera `data.sql` y `expect.json`) y luego `python3 pg_test.py` (o `run_pg.sh`). 35 comprobaciones.
- Resultado cuando se archivó: 120 ✓ (navegador, ES) + 20 ✓ (inglés) + 35 ✓ (PostgreSQL).
