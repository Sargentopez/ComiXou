# Copia de seguridad descargable del administrador  (v42.30)

Un botón, **solo para la cuenta `admin`**, que descarga **un archivo con todo lo que hay en la base de datos de Supabase** (todas las tablas de `public`,
las cuentas de usuario y la estructura) y un programa para **volver a montarlo todo** si algún día la base se pierde o se estropea.
Está pensada para hacerse **desde un PC**. No hay nada que configurar fuera de ejecutar **un SQL una sola vez** (§1) y no cuesta nada: el archivo se guarda donde tú elijas.

## 1. Puesta en marcha (una sola vez)

Supabase → **SQL Editor** → *New query*. Hay **tres archivos** en la carpeta `sql/`; ejecútalos **de uno en uno** y en este orden (copia el archivo **entero**, pégalo, pulsa *Run* y copia aquí el resultado):

1. `sql/v42_29_backup_admin_1_funcion.sql` — **la función** `public.admin_backup` (≈ 475 líneas; solo lee, no cambia ningún dato). Si el SQL editor avisa de «consulta destructiva» (por el `create or replace`), es normal; si avisa de *«Potential issue detected… creates a table without Row Level Security… `v_tables`»*, es un **falso positivo** (no se crea ninguna tabla): pulsa **«Run without RLS»**. Al final del archivo hay una comprobación que debe dar **una fila** con `caracteres = 25498` y `huella = 251652d0851b2d861b99f367a1402e56` (si no coincide, el pegado se cortó: repítelo entero).
2. `sql/v42_29_backup_admin_2_permisos.sql` — **los permisos** (solo cuentas con sesión pueden llamarla). Debe contestar *Success. No rows returned*.
3. `sql/v42_29_backup_admin_3_comprobar.sql` — **comprobación** (opcional, recomendable): lista las tablas que entrarán en la copia, con sus filas. Es el resultado que hay que copiar aquí.

Se puede hacer **ya**, aunque Supabase siga restringido por cuota (el SQL editor sigue funcionando). El botón de la web sí necesita que la API esté activa (§3).
**Hecho el 29-oct-2026** en el Supabase real: huella correcta, permisos aplicados y la comprobación (paso 3) listó 8 tablas / 3.465 filas (`auth.users`, `auth.identities`, `authors`, `biblioteca`, `panel_layers`, `panel_texts`, `panels`, `works`).

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
* No cuesta nada en Cloudflare ni en GitHub. Nada se sube a ninguna parte: el archivo va del navegador a tu disco.

## 4. Qué contiene y qué no

| Contiene | No contiene |
|---|---|
| **Todas** las tablas de `public` (las conozca o no el código: si mañana se crea otra, entra sola): obras, hojas, capas, textos, biblioteca, autores, seguidores, informes, ajustes… | Los **archivos de Cloudflare R2** (imágenes, GIF/APNG, portadas) y los *buckets* de Storage de Supabase: ya viven fuera de la base y no se tocan |
| Las cuentas: `auth.users` y `auth.identities` (correo, contraseña **cifrada con bcrypt**, metadatos) | Los **ajustes de Authentication** (URL del sitio, plantillas de correo, SMTP, proveedores), las claves del proyecto, Edge Functions, secretos |
| La **estructura**: tablas, columnas, claves, índices, funciones, disparadores, políticas RLS, permisos, vistas, publicaciones, secuencias, extensiones, comentarios | Las sesiones abiertas (cada usuario tendrá que iniciar sesión una vez) y las demás tablas internas de `auth` |
| Los contadores (secuencias), para que los números nuevos no repitan los viejos | Las políticas de Storage y la configuración del Worker de Cloudflare (no están en la base de datos) |

## 5. Comprobar un archivo

* En la pestaña **Copia** → «Comprobar un archivo de copia» → elige el `.ndjson.gz`: dice si está entero y qué tablas y filas contiene (no se envía a ningún sitio).
* Con el programa (más abajo): `node backup/restaurar-copia.mjs copia.ndjson.gz --info`.

Un archivo **cortado** (descarga interrumpida, copia a medias) se detecta porque le falta la línea de cierre: el restaurador **se niega a usarlo**.

## 6. Restaurar

### 6.1 Lo que necesitas (una vez)

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
| `--info` | Solo inspecciona: comprueba la integridad y lista el contenido |
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

## 10. Archivos

| Archivo | Para qué |
|---|---|
| `sql/v42_29_backup_admin_1_funcion.sql` | paso 1: la función `public.admin_backup` (solo lectura, solo `admin`) |
| `sql/v42_29_backup_admin_2_permisos.sql` | paso 2: permisos (solo cuentas con sesión) |
| `sql/v42_29_backup_admin_3_comprobar.sql` | paso 3: comprobación opcional (lista tablas y filas) |
| `js/admin-backup.js` | la pestaña «Copia»: descarga por páginas, reintentos, compresión (gzip), guardado en disco y comprobación |
| `js/supabase-client.js` (`adminBackupRpc`) | la llamada a la función; anota los bytes en el contador de egress |
| `backup/restaurar-copia.mjs` | el restaurador (Node ≥ 18, sin dependencias; escribe con `psql`) |
| `backup/LEEME_BACKUP.md` | la otra opción (copia semanal automática a Cloudflare R2): **pausada** por ahora |

*Técnicas estándar usadas: paginación por clave (*keyset*), NDJSON + gzip (`CompressionStream` del navegador, `pako` como alternativa), File System Access API (`showSaveFilePicker`) con descarga normal como alternativa,
Screen Wake Lock, `jsonb_populate_recordset` y `session_replication_role = replica` para cargar. El código de terceros usado (`pako`) está en la sección de créditos de la app.*
