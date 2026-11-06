# Copia de seguridad descargable del administrador  (v42.30; archivos de R2 desde la v42.49; restaurar desde el panel desde la v42.50)

Un botón, **solo para la cuenta `admin`**, que descarga **un archivo con todo lo que hay en la base de datos de Supabase** (todas las tablas de `public`,
las cuentas de usuario y la estructura) y un programa para **volver a montarlo todo** si algún día la base se pierde o se estropea.
Desde la **v42.50**, la pestaña **Restaurar** del mismo panel recupera **obras concretas** (o las hojas que les faltan) desde ese archivo sin salir de la web (§6.0).
Está pensada para hacerse **desde un PC**. No hay nada que configurar fuera de ejecutar **un SQL una sola vez** (§1) y no cuesta nada: el archivo se guarda donde tú elijas.

## 1. Puesta en marcha (una sola vez)

Supabase → **SQL Editor** → *New query*. Hay **tres archivos** en la carpeta `sql/`; ejecútalos **de uno en uno** y en este orden (copia el archivo **entero**, pégalo, pulsa *Run* y copia aquí el resultado):

1. `sql/v42_29_backup_admin_1_funcion.sql` — **la función** `public.admin_backup` (≈ 475 líneas; solo lee, no cambia ningún dato). Si el SQL editor avisa de «consulta destructiva» (por el `create or replace`), es normal; si avisa de *«Potential issue detected… creates a table without Row Level Security… `v_tables`»*, es un **falso positivo** (no se crea ninguna tabla): pulsa **«Run without RLS»**. Al final del archivo hay una comprobación que debe dar **una fila** con `caracteres = 25498` y `huella = 251652d0851b2d861b99f367a1402e56` (si no coincide, el pegado se cortó: repítelo entero).
2. `sql/v42_29_backup_admin_2_permisos.sql` — **los permisos** (solo cuentas con sesión pueden llamarla). Debe contestar *Success. No rows returned*.
3. `sql/v42_29_backup_admin_3_comprobar.sql` — **comprobación** (opcional, recomendable): lista las tablas que entrarán en la copia, con sus filas. Es el resultado que hay que copiar aquí.

Se puede hacer **ya**, aunque Supabase siga restringido por cuota (el SQL editor sigue funcionando). El botón de la web sí necesita que la API esté activa (§3).
**Hecho el 29-oct-2026** en el Supabase real: huella correcta, permisos aplicados y la comprobación (paso 3) listó 8 tablas / 3.465 filas (`auth.users`, `auth.identities`, `authors`, `biblioteca`, `panel_layers`, `panel_texts`, `panels`, `works`).

**Para restaurar desde el panel (v42.50)** hay **un cuarto archivo**, también de un solo pegado (≈ 8,4 KB): `sql/v42_50_restaurar_admin_1_funcion.sql` — la función `public.admin_restore`. Misma rutina: pégalo **entero** → *Run* → debe salir **una fila** con `caracteres = 5301` y `huella = 56b32178e39a30d673eccb96a87c1a4f` (si el pegado se cortara, Postgres dice «unterminated dollar-quoted string» y no instala nada: repítelo). Los avisos del editor («consulta destructiva» por el `create or replace`, «tabla sin RLS») son falsos. **A diferencia de la copia, esta función sí escribe** (solo cuando la pestaña «Restaurar» la llama, y solo en tablas de `public`, nunca en `auth`); la barrera es la misma: solo la cuenta `admin`. Sin este archivo la pestaña lee y comprueba el archivo de copia, pero al compararlo con la base avisa de que falta instalarlo (404) y no sigue. *Estado: instalada en el Supabase real (6-nov-2026; la comprobación `admin_restore` devolvió `true`). Pendiente: la primera restauración real (ver §6).*

**La barrera de seguridad está dentro de la base de datos**, no en el botón: la clave de la web es pública y cualquiera puede registrarse, así que la función
comprueba por sí misma que quien llama es la cuenta `admin`. Cualquier otra cuenta (también otro administrador, como `Tutor`), un usuario normal o un anónimo recibe
«403 · Solo la cuenta administradora principal…» y no sale ni una fila.

## 2. Hacer una copia

1. Entra con la cuenta **`admin`** → **Panel de administración** → pestaña **Copia** (solo la ve esa cuenta).
2. (Opcional) quita la casilla **«Incluir las cuentas de usuario»** si no quieres correos ni contraseñas cifradas en el archivo. **Sin ellas, tras una restauración nadie podría entrar con su contraseña de siempre.**
3. **Descargar copia de seguridad** → la pantalla enseña qué tablas y cuántas filas entrarán y el tamaño aproximado → **Empezar la descarga**.
4. Elige dónde guardarlo. **Chrome y Edge** abren la ventana de «guardar como» y el archivo se va escribiendo en disco a medida que llega, comprimido (apenas usa memoria, aunque la base crezca).
   Firefox y Safari no pueden hacerlo: arman el archivo en memoria (con la base actual, hasta ≈ 1 GB de RAM durante la descarga) y lo descargan al final a su carpeta de descargas; en un PC con poca memoria usa Chrome o Edge.
5. Espera a **«Copia terminada y comprobada»**. No cierres la pestaña (el navegador avisaría); mientras dura, el equipo no se pone en reposo. Se puede **Cancelar** en cualquier momento.
   Si la conexión se corta, reintenta solo (3 veces por página, con pausas); si no hay manera, termina con un mensaje y **no deja un archivo a medias dado por bueno**.

El archivo se llama `comxow-copia-AAAA-MM-DD_HHMM.ndjson.gz`. Al terminar, la propia pestaña lo **relee y lo comprueba** (cada tabla, el recuento de filas y el cierre del archivo).

**Dónde guardarlo:** en un sitio **privado** y, mejor, en dos (disco + almacenamiento en la nube cifrado). **Nunca en el repositorio de GitHub** (es público).

**Cuándo:** antes de cualquier cambio grande de SQL o de versión de la base, y de vez en cuando (p. ej. una vez al mes). Lo ideal es hacerla cuando nadie esté guardando obras (de madrugada):
la copia no bloquea a nadie, pero se lee tabla a tabla en unos minutos, así que si alguien guarda justo en ese rato la copia puede quedar con filas de dos instantes distintos (§7).

## 3. Cuánto gasta

Cada copia **lee toda la base por la API de Supabase, y eso cuenta como *egress***. Con el tamaño actual (≈ 190 MB de datos, de ellos ≈ 134 MB son capas) una copia completa
transfiere **unos 180 MB ≈ 3,5 % de los 5 GB mensuales** del plan gratuito (el contador de egress de la propia app lo apunta como `rpc/admin_backup`). La pantalla de confirmación te da el
tamaño real antes de empezar. El archivo comprimido pesa **≈ 70 % de eso (unos 130 MB)**: casi todo son imágenes en base64, que ya vienen comprimidas.

* Con la cuota agotada (como ahora, hasta que se renueve el periodo ≈ **3-nov-2026**) Supabase responde `402` y la pestaña lo explica; no se guarda nada.
* **Desde la v42.49, archivos de R2:** si dejas marcada la casilla «Incluir los archivos de R2» (lo está de serie), la copia baja además las animaciones, GIF y portadas que citan las obras. Eso **no gasta transferencia de Supabase** (sale de Cloudflare) y cuesta una petición al Worker por archivo (el plan gratuito da 100.000 al día); la copia pesa más (los archivos ya vienen comprimidos, así que ocupan casi lo mismo que en R2).
* **Desde la v42.48:** las capas pesadas que ya viven en R2 (en la base solo queda una referencia `r2:<hash>:<bytes>`) se **leen de R2, que no cobra salida**, y se escriben en la copia con su contenido. Desde el 4-nov-2026 las ≈ 126 MB de capas pesadas que había ya están en R2 y las nuevas se guardan allí de serie (v42.49), así que cada copia gasta unos 50-60 MB de egress de Supabase en vez de ≈ 180 MB.
* No cuesta nada en Cloudflare ni en GitHub. Nada se sube a ninguna parte: el archivo va del navegador a tu disco.

## 4. Qué contiene y qué no

| Contiene | No contiene |
|---|---|
| **Todas** las tablas de `public` (las conozca o no el código: si mañana se crea otra, entra sola): obras, hojas, capas, textos, biblioteca, autores, seguidores, informes, ajustes… | Los **archivos antiguos de los *buckets* de Storage de Supabase** (si queda alguno, la pantalla de resultado dice cuántos; bajarlos gastaría la transferencia de Supabase). Los de Cloudflare R2 **sí** entran con la casilla de la v42.49 (ver más abajo) |
| Las cuentas: `auth.users` y `auth.identities` (correo, contraseña **cifrada con bcrypt**, metadatos) | Los **ajustes de Authentication** (URL del sitio, plantillas de correo, SMTP, proveedores), las claves del proyecto, Edge Functions, secretos |
| La **estructura**: tablas, columnas, claves, índices, funciones, disparadores, políticas RLS, permisos, vistas, publicaciones, secuencias, extensiones, comentarios | Las sesiones abiertas (cada usuario tendrá que iniciar sesión una vez) y las demás tablas internas de `auth` |
| Los contadores (secuencias), para que los números nuevos no repitan los viejos | Las políticas de Storage y la configuración del Worker de Cloudflare (no están en la base de datos) |

**Archivos de R2 (v42.49):** con la casilla marcada, tras las tablas la copia añade una línea `["F",{k,t,b,h,d}]` por cada archivo de `anims/`, `gifs/` o `covers/` que citan las filas (`k` = ruta en R2, `t` = tipo, `b` = bytes, `h` = SHA-256, `d` = contenido en base64). Se encuentran leyendo las URL del Worker dentro de las filas (columnas `anim_url`, `gif_url`, `cover_url` y cualquier otra), sin repetir ninguno. Si R2 dice que uno **no existe** (404) se anota en el cierre (`files.missing`) y la copia sigue, porque la fila cita algo que ya no está; **cualquier otro fallo la detiene** con un error claro (una copia a la que le faltan archivos sin saberlo parecería buena). La comprobación de §5 vuelve a leer cada archivo y verifica tamaño y SHA-256. Las capas pesadas guardadas por contenido (`blobs/<hash>`) **no** van como archivos aparte: ya entran dentro de su fila (párrafo siguiente).

**Capas pesadas en R2 (v42.48):** el texto de las capas pesadas que la app guarda en R2 **sí entra** (`panel_layers.layer_data` = `r2:<hash>:<bytes>`): la copia las baja de R2 y las escribe **con su contenido**, de modo que el archivo es autosuficiente y `restaurar-copia.mjs` no necesita acceso a R2. Si un archivo de R2 faltara o no coincidiera con su tamaño, la copia **se detiene con un error claro** en lugar de guardar un hueco. Al restaurar con `restaurar-copia.mjs`, esas capas vuelven a la base **como texto** (no como referencia); para devolverlas a R2 haría falta repetir la migración (la herramienta está guardada, sin usar, en `archivo/migracion-r2-v42-48/`). Desde la pestaña «Restaurar» (v42.50) **sí vuelven a R2** y en la base queda solo la referencia (§6.0). La caché de fuentes de Google (`fonts/` en R2) **no** entra: no es un dato tuyo y el buscador de fuentes del editor la vuelve a crear.

## 5. Comprobar un archivo

* En la pestaña **Copia** → «Comprobar un archivo de copia» → elige el `.ndjson.gz`: dice si está entero y qué tablas y filas contiene (no se envía a ningún sitio).
* Con el programa (más abajo): `node backup/restaurar-copia.mjs copia.ndjson.gz --info`.

Un archivo **cortado** (descarga interrumpida, copia a medias) se detecta porque le falta la línea de cierre: el restaurador (el programa **y** la pestaña «Restaurar») **se niega a usarlo**.

## 6. Restaurar

Hay **dos vías**, según lo que haya pasado:

| Qué ha pasado | Vía |
|---|---|
| Se ha borrado o estropeado **una obra** (o le faltan hojas) y el resto de la base está bien | **Pestaña «Restaurar» del panel** (§6.0): sin instalar nada en el PC, solo lo que elijas |
| Se perdió **la base entera** (proyecto nuevo y vacío), o hay que devolver **cuentas** o la **estructura** | **Programa `restaurar-copia.mjs`** (§6.1-6.5): todo en una transacción, con `psql` |

### 6.0 Desde el panel de administración (pestaña «Restaurar», v42.50)

**Qué hace.** Lee un archivo de copia en el navegador (no se envía a ningún sitio) y devuelve a la base las **obras que elijas**, siempre enteras en su estructura **obra → hojas → capas y textos**.
Cada obra se restaura como un bloque (primero la obra, después sus hojas, capas y textos); lo que no pueda entrar se anota con el motivo. **No restaura** las cuentas de usuario (`auth.*`) ni la estructura de la base: para eso, §6.1-6.5.
Solo la ve y la puede usar la cuenta `admin` (la base lo comprueba por sí misma; otro administrador como `Tutor` recibe 403 y ni siquiera ve la pestaña).

**Antes de nada (una vez):** ejecutar en Supabase `sql/v42_50_restaurar_admin_1_funcion.sql` (§1).

**Paso a paso**
1. **Panel de administración → Restaurar → elegir el archivo** `.ndjson.gz`. Se lee y se comprueba entero (manifiesto, cada tabla contra el recuento del cierre, archivos de R2). Si está dañado o cortado se explica **y no deja continuar**: restaurar desde él podría dejar obras a medias.
2. Compara con lo que hay ahora en la base y lista las obras de la copia con su estado: **borrada** (ya no existe), **hojas que faltan: N** o **ya está completa**. Hay buscador por título o autor y un botón «Marcar las que faltan».
3. Para cada obra se elige una acción:
   * **No tocar** (por defecto).
   * **Añadir lo que falta**: si la obra no existe, la crea entera; si existe, le devuelve **solo las hojas que ya no están** (con sus capas y textos) y **no toca nada de lo que hay**.
   * **Reemplazar por la copia**: **borra lo actual de esa obra** (hojas, capas y textos) y deja la versión de la copia. Lo que se hiciera en ella después de la copia se pierde.
4. Opciones: «Añadir también lo que falte en las demás tablas (autoras, biblioteca…)» (apagada de serie; solo añade filas que no existen, **nunca sobrescribe**, y ojo: también devolvería lo que se borró a propósito después de la copia) y, si la copia lleva archivos de R2, restaurar los que citan las filas restauradas o todos los que falten.
5. **«Revisar y restaurar…» abre un ensayo obligatorio, sin cambiar nada**: por obra, hojas/capas/textos que ya existen y que se añaden; lo que se borraría; cuántas capas pesadas (≥ 32 KB) irán a R2 y cuántas ya están; cuántos archivos de R2 se subirán. Si hay obras a reemplazar, hay que marcar «Entiendo que se borrará lo actual…».
6. **«Restaurar ahora»**: barra de progreso por fases y botón Cancelar. Al final, un resumen por tabla (nuevas · actualizadas · ya estaban · con problema), lo borrado, las capas pesadas y los archivos de R2, y las obras o filas que no pudieron entrar y por qué.
7. **«Copiar informe»** (en todas las pantallas menos el reposo y el progreso): copia al portapapeles un texto plano con la versión, el archivo, la integridad, la selección, el ensayo y la ejecución (recuentos por tabla, reintentos, lotes partidos por tiempo, capas pesadas, archivos de R2, obras que no entraron y filas rechazadas con su motivo). **No lleva contenido de las capas.** Si el navegador no deja copiar, enseña el texto para copiarlo a mano. Es lo que hay que pegar si algo falla.

**El orden de trabajo (por dentro)**
1. **R2 primero.** Las capas pesadas (≥ 32 KB) se guardan **por contenido** en `blobs/<sha256>` (como hace el editor) y en la base quedará solo la referencia `r2:<hash>:<bytes>`; los archivos (`anims/`, `gifs/`, `covers/`) se suben solo si no existen ya, comprobando tamaño y SHA-256, y las rutas se validan (solo esas tres carpetas, sin `..`). Si R2 falla para alguna capa pesada, **se detiene antes de tocar la base** y pregunta: *Reintentar* · *Continuar guardándolas en la base* (como antes de R2: engordan la base y gastan transferencia al leerse) · *Cancelar*.
2. **Base de datos.** En «Reemplazar», primero se borra lo actual de esa obra (por trozos de 25 hojas; si la base tarda más de 8 s, se divide más). Luego se escribe obra → hojas → capas y textos en lotes de ≤ 200 filas / ≈ 600 KB, con el **texto exacto** del archivo (sin volver a serializar el JSON: los identificadores de 64 bits y los caracteres raros llegan idénticos). Antes de escribir los hijos de una obra se comprueba que la obra existe; si no pudo entrar, sus hojas, capas y textos se omiten y se cuentan.
3. **Resumen de navegación.** El disparador `panel_layers_nav_invalidate` anula `panels.nav` al insertar una capa; al final se devuelve el valor guardado en la copia a las hojas restauradas (solo donde ahora es nulo), así el lector no tiene que recalcularlo.
4. Todo es **repetible**: un lote que falla por un corte transitorio se reintenta (0,7 · 2,5 · 7 s); uno que choca con el tope de tiempo se parte en mitades; una fila imposible se anota y el resto sigue. Cancelar o perder la conexión deja restaurado solo lo ya hecho, y **volver a lanzar la restauración no duplica nada**.

**Límites que conviene conocer**
* «Añadir» trabaja **por hoja**: si una hoja existe pero le falta alguna capa o texto, no se detecta; para eso usa «Reemplazar».
* Al añadir hojas a una obra que existe **no se toca `works.panel_count`** (el editor lo corrige solo en su próximo guardado). Es deliberado: tocar la obra cambiaría `works.updated_at`, que el editor usa como «revisión en la nube» y compara por igualdad.
* «Reemplazar» **restaura también `updated_at`** de la copia: un editor que tuviera esa obra abierta verá otra revisión; que recargue.
* Si se volvieron a añadir hojas a una obra después de borrarlas, «Añadir» puede dejar dos hojas con el mismo `panel_order`; es inofensivo para el lector, pero conviene revisarlo en el editor.
* Para que unas obras entren hace falta que **su autora exista** (clave ajena). Si falta, se explica («Parece que falta la autora…») y basta volver a lanzar marcando «Añadir también lo que falte en las demás tablas»: las autoras se restauran antes que sus obras.
* Las cuentas (`auth.users`, `auth.identities`) **nunca** se restauran desde el panel (§6.1-6.5).
* La copia es una instantánea «difusa» (§7): una obra que se guardaba mientras se hacía la copia puede traer una hoja a medias.

**Qué se ha probado.** En un PostgreSQL 16 local con las funciones **reales** `admin_backup` y `admin_restore`, el Worker **real** (Miniflare) y la app **real** en Chromium: lectura e integridad, lista y marcas, ensayo sin escribir, restauración exacta (ids de 64 bits, texto con comillas/barras/ñ/✓, resumen de navegación, capas pesadas → referencias en R2, archivos de R2 con los mismos bytes), «Reemplazar» con confirmación, cancelar y repetir, R2 caído (pausa antes de escribir, reintento, continuar en la base), SQL sin instalar (404), cuenta no admin (403, también `Tutor`), cuota 402, cortes de red, error de servidor a mitad, archivos dañados/cortados/manipulados, topes de tiempo en el borrado y en las inserciones, una fila imposible, tablas «otras» solo-añadir, rutas de R2 maliciosas, hashes que no cuadran, una obra grande (30 hojas, 123 capas), interfaz en inglés y móvil. Las pruebas están archivadas en `archivo/restaurar-v42-50/`.

**Sin probar todavía una restauración real** (la función `admin_restore` ya está instalada en el Supabase real desde el 6-nov-2026, pero aún no se ha restaurado nada con ella). La base real tiene disparadores propios que el banco de pruebas no imita (p. ej. `trg_prevent_self_publish` en `works`; la cuenta `admin` debería pasarlos). Por eso la **primera vez**, restaura **una sola obra borrada** (así no se toca nada de lo que existe), abre la obra para comprobarla y, si algo no cuadra, pulsa **«Copiar informe»** y pásalo.

### 6.1 Con el programa — lo que necesitas (una vez)

* **Node.js 18 o superior** (nodejs.org, versión LTS). El programa `backup/restaurar-copia.mjs` no necesita instalar nada más.
* **`psql`** (el cliente de PostgreSQL) para escribir en una base:
  Windows → instalador de PostgreSQL de EnterpriseDB (postgresql.org/download/windows), marcando **solo «Command Line Tools»**; luego usa `--psql "C:\Program Files\PostgreSQL\16\bin\psql.exe"`.
  macOS → `brew install libpq` (ruta: `--psql /opt/homebrew/opt/libpq/bin/psql`). Debian/Ubuntu → `sudo apt install postgresql-client`.
* La **dirección de conexión** de Supabase (como en `LEEME_BACKUP.md` §3.2): proyecto → **Connect** → **Session pooler** (puerto 5432) →
  `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<región>.pooler.supabase.com:5432/postgres`. Sustituye `[YOUR-PASSWORD]` por la contraseña de la base
  (Project Settings → Database → *Reset database password* si no la recuerdas; no afecta a la app). Si lleva símbolos, escríbelos codificados (`@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `?` → `%3F`).
  **Usa el usuario `postgres`** (es el que tiene permiso para cargar sin disparadores, imprescindible: §7).

> Primero siempre `--info` (¿el archivo está entero?) y luego `--probar` (ensayo: hace todo y **lo deshace al final**; así ves que entra sin errores sin cambiar nada).

### 6.2 Caso A — la base existe pero se han perdido o estropeado datos

```bash
node backup/restaurar-copia.mjs copia.ndjson.gz --db "postgresql://postgres.<ref>:<clave>@<host-pooler>:5432/postgres" --probar     # ensayo
node backup/restaurar-copia.mjs copia.ndjson.gz --db "…"                      # añade las filas que faltan; NO toca las que ya existen
node backup/restaurar-copia.mjs copia.ndjson.gz --db "…" --modo actualizar    # además devuelve las filas existentes al estado de la copia
node backup/restaurar-copia.mjs copia.ndjson.gz --db "…" --solo works,panels,panel_layers   # solo algunas tablas
```

### 6.3 Caso B — proyecto nuevo y vacío (se perdió el proyecto)

1. Supabase → **New project** (si la organización actual está restringida por cuota, créalo en otra). Región UE; versión de Postgres igual o superior.
2. Copia su **Session pooler** (§6.1) y restaura **con la estructura**:
   ```bash
   node backup/restaurar-copia.mjs copia.ndjson.gz --db "<conexión del proyecto NUEVO>" --esquema --probar   # ensayo
   node backup/restaurar-copia.mjs copia.ndjson.gz --db "<conexión del proyecto NUEVO>" --esquema
   ```
   `--esquema` crea tablas, funciones, políticas, permisos… y luego carga los datos y ajusta los contadores. **Solo para un proyecto nuevo y vacío.**
3. Hay que **rehacer a mano** lo que la copia no incluye: en el código, cambiar la URL y la clave pública (*anon/publishable*) del proyecto nuevo en
   `js/supabase-client.js`, `js/auth.js` (2 sitios), `js/admin.js`, `js/my-works.js` y `reader/reader.js` (buscar `qqgsbyylaugsagbxsetc`) y subir la versión; lo mismo en el **Worker de Cloudflare**
   (`comxow-storage-worker`; su código no está en este repositorio) y en los secretos de GitHub que usen Supabase; en *Authentication → URL Configuration*: *Site URL* y *Redirect URLs*, plantillas de correo y SMTP;
   y ejecutar de nuevo los dos primeros archivos de `sql/` (`v42_29_backup_admin_1_funcion.sql` y `_2_permisos.sql`) si quieres seguir usando el botón (la función viaja dentro de la copia, pero comprueba los permisos).
4. Los usuarios **conservan su contraseña** (viaja en `auth.users`), pero tendrán que iniciar sesión una vez.

### 6.4 Sin conexión directa: `--sql`

`node backup/restaurar-copia.mjs copia.ndjson.gz --sql salida.sql [--esquema]` no toca ninguna base: escribe el guion, que ejecutas después con `psql "<conexión>" -f salida.sql`.
(El *SQL Editor* de Supabase **no sirve** para guiones grandes: usa `psql`.)

### 6.5 Todas las opciones

| Opción | Qué hace |
|---|---|
| `--info` | Solo inspecciona: comprueba la integridad (incluidos los archivos de R2) y lista el contenido |
| `--extraer-r2 <carpeta>` | Escribe en esa carpeta los archivos de R2 de la copia (`anims/…`, `gifs/…`, `covers/…`) y un `_tipos.json`; sirve para volver a subirlos a un bucket de R2 nuevo (p. ej. `rclone copy carpeta r2:bucket --exclude _tipos.json`). Solo escribe dentro de esa carpeta y rechaza rutas raras |
| `--db "<conexión>"` | Restaura en esa base (pide confirmación; `--si` para no preguntar) |
| `--sql <archivo>` | Escribe el guion en vez de conectar |
| `--esquema` | Crea antes la estructura (solo proyecto nuevo y vacío) |
| `--modo insertar` *(defecto)* / `actualizar` | Insertar solo lo que falta / sobrescribir lo existente con la misma clave |
| `--solo t1,t2` | Solo esas tablas (`works`, `public.works`, `auth.users`…) |
| `--sin-cuentas` | No restaura `auth.users` ni `auth.identities` |
| `--probar` | Ensayo: se hace todo y se **deshace** |
| `--lote-mb N` | Tamaño aproximado de cada `INSERT` (4 por defecto) |
| `--psql <ruta>` | Ruta de `psql` si no está en el PATH |

Todo ocurre en **una sola transacción**: o se restaura todo o no cambia nada. Si una tabla no tiene clave única (`notes_nopk`, por ejemplo) solo se carga si en el destino está vacía (si no, se duplicarían filas).

## 7. Lo que conviene saber (límites reales)

* **Es una instantánea «difusa»**, no una foto exacta de un instante: la base se lee tabla a tabla, página a página, mientras la gente puede seguir guardando. Lo que cambie durante esos minutos puede quedar a medias
  (una hoja nueva sin sus capas, p. ej.). El archivo lo **anota** (`drift`: tablas cuyo recuento cambió) y el restaurador lo muestra. Para la mejor copia, hazla cuando nadie esté guardando.
* **Se carga sin disparadores ni comprobación de claves ajenas** (`session_replication_role = replica`, la técnica estándar de `pg_dump --disable-triggers` y de `supabase db dump`): imprescindible, porque si no
  los disparadores de la app (`handle_new_user`, `panels_nav_invalidate`…) alterarían los datos al cargarlos. Si tu usuario no tiene permiso, el programa se detiene con un mensaje claro y sin cambiar nada: usa el usuario `postgres`.
* **Columnas `json` (no `jsonb`)** vuelven con el mismo contenido pero con los espacios normalizados; un `null` JSON suelto dentro de una columna `json`/`jsonb` vuelve como `NULL` de SQL. (En este proyecto no afecta.)
* **La estructura se captura con las funciones del propio Postgres** (`pg_get_functiondef`, `pg_get_constraintdef`, `pg_get_indexdef`…): cubre lo que usa Comxow y se ha comprobado idéntica; los objetos poco corrientes que no cubre
  (agregados, operadores, reglas, tipos compuestos o de rango, tablas particionadas o heredadas, tablas externas, disparadores de evento propios, ordenaciones propias) se listan en el archivo (`unsupported`) y en el informe; **sus datos sí se copian**.
  Los seis disparadores de evento que crea la propia Supabase (`issue_*`, `pgrst_*`) **no se avisan** (los recrea ella en cualquier proyecto; el archivo los anota aparte, en `plan.platform`).
* **Tiempo por consulta:** en Supabase el rol de tu sesión tiene un tope de **8 s por consulta**, y la base convierte en texto las filas a ≈ **3 MB/s** (medido el 29-oct en tu base real). Por eso las páginas no son de tamaño fijo:
  la primera de cada tabla es prudente y las siguientes se ajustan al **peso real** de las filas ya leídas y a lo que tarda cada llamada (con un máximo de 250 filas o ≈ 2 MB), de modo que cada llamada dure
  del orden de 1 s. Si aun así una se pasara del tope, se reintenta con páginas 4 veces más pequeñas y se va recuperando el tamaño.
* **Un proyecto de Supabase nuevo puede traer columnas distintas** en `auth.users` si GoTrue cambia: el restaurador carga solo las columnas que existen en ambos lados, así que tolera esa diferencia.
* **Qué se ha probado:** en un Postgres 16 local con la estructura de producción: copia desde el navegador → restauración en una base vacía con `--esquema` → comparación de estructura (tablas, columnas, índices, funciones,
  políticas RLS, permisos, disparadores, publicaciones, secuencias), cuentas y **datos de todas las tablas: idéntico**; también con 190 MB de datos (restaurados en ≈ 6 s), con tipos raros (NaN, infinito, enteros de 64 bits, `bytea`,
  `tsvector`, intervalos, emoji), con cortes de red, error 402, cancelación, modos `insertar`/`actualizar`, `--solo` y archivos cortados. **El SQL ya se ejecutó en el Supabase real** (29-oct-2026: la función, los permisos, la lista de tablas, la estructura —12 tipos de objeto— y la primera página de cada tabla, todo correcto); **el botón en sí aún no**
  (la cuota está agotada hasta ≈ 3-nov-2026): en cuanto se renueve, haz una primera copia, pásale `--info` y, si quieres tranquilidad total, un ensayo en un proyecto de prueba (gratuito) con `--esquema --probar`.

## 8. Seguridad y privacidad

* El archivo contiene **correos y contraseñas cifradas (bcrypt)** de los usuarios, y todas las obras no publicadas. Trátalo como un secreto: no lo subas a GitHub, a un chat ni a un servicio sin cifrar; bórralo cuando ya no haga falta.
* La clave de la web es pública: **no ayuda a nadie a descargar la copia**. Hace falta iniciar sesión como `admin` y la comprobación la hace la base de datos.
* Si quieres retirar la función del todo: `drop function if exists public.admin_backup(text, jsonb);` (también está, comentada, en la cabecera de `sql/v42_29_backup_admin_1_funcion.sql`). La web sigue funcionando igual.
* La función de la pestaña «Restaurar» **escribe** en la base. Está protegida igual que la de la copia (solo `admin`, comprobado dentro de la base; `revoke … from public, anon`), solo toca tablas de `public` con clave primaria (nunca `auth`, ni vistas, ni tablas de extensiones) y cada llamada es una transacción. Si no la vas a usar durante un tiempo, retírala: `drop function if exists public.admin_restore(text, jsonb);` (también en la cabecera de `sql/v42_50_restaurar_admin_1_funcion.sql`; para volver a usarla, vuelve a ejecutar ese archivo).

## 9. Si algo falla

| Mensaje en la pestaña / el programa | Qué pasa | Qué hacer |
|---|---|---|
| «Esta cuenta no puede descargar la copia: solo la cuenta administradora principal («admin»)» (403) | has entrado con otra cuenta (p. ej. `Tutor`) | entra con `admin` |
| «Falta instalar en Supabase la función de la copia…» (404) | no se han ejecutado los archivos 1 y 2 de `sql/` (o la API aún no ve la función) | ejecútalos (§1); espera un minuto y reintenta |
| «Supabase ha restringido el proyecto por superar la cuota de transferencia (error 402)…» | cuota de egress agotada | espera a que se renueve (≈ 3-nov-2026) y reintenta |
| «La sesión ha caducado…» (401) | token caducado y no se pudo renovar | cierra sesión, entra de nuevo como `admin` y repite |
| «Se perdió la conexión y no se pudo recuperar tras varios intentos» | la red se cortó más veces de las que se reintenta | repite con mejor conexión; no se ha guardado nada |
| «Supabase ha respondido con un error…» / «La respuesta de la base no es la esperada…» | fallo temporal de Supabase, un tope de tiempo de la consulta (la pestaña reintenta con páginas más pequeñas) o la función instalada es de otra versión | espera unos minutos y reintenta; si persiste, vuelve a ejecutar el paso 1 de §1 |
| «No se pudo escribir el archivo…» | disco lleno o permiso denegado | elige otra carpeta |
| `psql` no se encuentra | falta el cliente de PostgreSQL | §6.1; o `--psql <ruta>` |
| «el usuario de la conexión no puede desactivar los disparadores durante la carga» | usuario sin privilegios | conéctate como `postgres` (Session pooler) |
| «La tabla … no existe en la base de destino» | la base destino no tiene la estructura | usa `--esquema` (solo en un proyecto nuevo y vacío) |
| «La base de datos ha dado N aviso(s); la restauración sigue su curso» (`WARNING: No se pudo crear la extensión…`, `Permisos de…`) | la estructura tolera una extensión o un permiso que el destino no admite y continúa | casi siempre es una extensión que Supabase ya trae o que no hace falta; si el aviso es de permisos, comprueba en la app que todo se ve |
| «Un archivo con problemas no se restaura» | archivo cortado o dañado | vuelve a descargar la copia |
| «Falta instalar en Supabase la función de restauración…» (pestaña Restaurar, 404) | no se ha ejecutado `sql/v42_50_restaurar_admin_1_funcion.sql` (o la API aún no ve la función) | ejecútalo (§1); espera un minuto y reintenta |
| «Esta cuenta no puede restaurar: solo la cuenta administradora principal («admin»)» (403) | has entrado con otra cuenta | entra con `admin` |
| «R2 no ha respondido para algunas capas pesadas» (pausa antes de escribir) | el Worker o R2 fallan o están en pausa (cortacircuitos) | *Reintentar*; o *Continuar guardándolas en la base*; o *Cancelar* y mirar la pestaña «R2». No se ha cambiado nada en la base |
| «Se perdió la conexión y no se pudo recuperar tras varios intentos» (pestaña Restaurar) | la red se cortó más veces de las que se reintenta | vuelve a lanzar la restauración: lo ya hecho está en la base y no se duplica |
| «Parece que falta la autora de esas obras en la base…» | las obras citan una autora (`authors`) que ya no existe (clave ajena) | repite marcando «Añadir también lo que falte en las demás tablas (autoras, biblioteca…)» |
| «La base ha rechazado la petición (…)» / «Filas que la base ha rechazado» | una fila concreta no entra (dato, clave ajena…) | el mensaje trae la tabla, el id y el motivo; el resto de la obra sigue. Pásamelo |

## 10. Archivos

| Archivo | Para qué |
|---|---|
| `sql/v42_29_backup_admin_1_funcion.sql` | paso 1: la función `public.admin_backup` (solo lectura, solo `admin`) |
| `sql/v42_29_backup_admin_2_permisos.sql` | paso 2: permisos (solo cuentas con sesión) |
| `sql/v42_29_backup_admin_3_comprobar.sql` | paso 3: comprobación opcional (lista tablas y filas) |
| `js/admin-backup.js` | la pestaña «Copia»: descarga por páginas, reintentos, compresión (gzip), guardado en disco y comprobación |
| `js/supabase-client.js` (`adminBackupRpc`) | la llamada a la función; anota los bytes en el contador de egress |
| `backup/restaurar-copia.mjs` | el restaurador (Node ≥ 18, sin dependencias; escribe con `psql`) |
| `sql/v42_50_restaurar_admin_1_funcion.sql` | v42.50: la función `public.admin_restore` (**escribe**; solo `admin`) para la pestaña «Restaurar» |
| `js/admin-restore.js` | la pestaña «Restaurar»: lectura e integridad, lista de obras, ensayo, R2, escritura por lotes, reintentos, resumen e informe para pegar |
| `js/supabase-client.js` (`adminRestoreRpc`, `xr.ensure/headFile/putFile`) | la llamada a la función y las subidas a R2 por contenido y de archivos |
| `archivo/restaurar-v42-50/` | las pruebas de la restauración (no forma parte de la app): ver su `LEEME.md` |
| `backup/LEEME_BACKUP.md` | la otra opción (copia semanal automática a Cloudflare R2): **pausada** por ahora |

*Técnicas estándar usadas: paginación por clave (*keyset*), NDJSON + gzip (`CompressionStream` del navegador, `pako` como alternativa), File System Access API (`showSaveFilePicker`) con descarga normal como alternativa,
Screen Wake Lock, `jsonb_populate_recordset` y `session_replication_role = replica` para cargar. El código de terceros usado (`pako`) está en la sección de créditos de la app.*
