# Copia de seguridad de la base de datos de Comxow  (v42.27)

Una copia automática, cifrada y **comprobada** de la base de datos de Supabase (obras, hojas, capas, biblioteca, autores y usuarios),
guardada fuera de Supabase, en un bucket **privado** de Cloudflare R2. **No cuesta nada** y no necesita ningún plan de pago de Supabase.

## 1. Qué hace y qué no

Cada domingo (03:17 UTC) y cuando tú quieras, un flujo de GitHub Actions:

1. comprueba que puede escribir en el bucket de R2 (**antes** de pedir nada a Supabase, para no gastar cuota si algo está mal configurado);
2. se conecta a Supabase, vuelca el esquema `public` entero y los usuarios (`auth.users` y `auth.identities`);
3. lo empaqueta (con el guion para restaurarlo dentro), lo **cifra con tu contraseña** (GnuPG, AES-256) y lo sube a R2;
4. conserva las 8 copias más recientes y borra las más antiguas;
5. **restaura la copia que acaba de subir en una base de datos temporal** (en la máquina de GitHub, sin tocar Supabase) y comprueba que
   cada tabla tiene las mismas filas. Si la restauración fallase, el flujo sale en rojo y GitHub te manda un correo.

**Qué NO incluye** (hay que rehacerlo a mano si alguna vez se pierde el proyecto de Supabase):
los archivos de R2 (imágenes, GIF/APNG, portadas: ya viven en Cloudflare, no en Supabase), los ajustes de *Authentication* (URL del sitio,
plantillas de correo, SMTP, proveedores externos), las claves del proyecto, las sesiones abiertas (los usuarios tendrán que iniciar sesión
una vez), Edge Functions y *buckets* de Storage de Supabase. Es una copia «lógica» semanal: entre dos copias puedes perder hasta una
semana de cambios (además, la biblioteca local de la app guarda lo que editas en el dispositivo).

## 2. Coste

| Pieza | Coste |
|---|---|
| GitHub Actions | 0 €: el repositorio es público (minutos ilimitados). |
| Cloudflare R2 | 0 €: 10 GB gratis al mes; 8 copias ocupan menos de 1 GB. Descargar de R2 no cobra salida. |
| Supabase | 0 €, pero **cada copia gasta egress**: pg_dump lee toda la base por la conexión (≈ el tamaño de los datos sin comprimir, **unos 0,15 GB con el tamaño actual**). Semanal ≈ 0,6 GB/mes (≈ 12 % de los 5 GB gratuitos). Si andas justo de cuota, cambia a mensual (≈ 0,15 GB/mes, ver §7). La comprobación de restauración y las restauraciones de emergencia **no** gastan egress de Supabase. |

## 3. Puesta en marcha (una sola vez, ≈ 15 minutos, todo desde el navegador)

### 3.1 Cloudflare R2: bucket privado + token

1. Cloudflare → **R2 Object Storage** → **Create bucket**. Nombre: `comxow-backups`. En *Jurisdiction* elige **European Union (EU)**, igual que
   `comxow-storage` (los datos de usuarios no deben salir de la UE). **No actives** el acceso público ni dominios personalizados: el bucket debe ser privado.
2. R2 → **Manage API tokens** → **Create API token**. *Permissions*: **Object Read & Write**. *Specify bucket(s)*: solo `comxow-backups`.
   Crea el token y **apunta ya** (solo se muestran una vez): *Access Key ID* y *Secret Access Key*.
3. Apunta también tu **Account ID** (está en la página principal de R2 y en la dirección del bucket: `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`).

### 3.2 Supabase: dirección de conexión «Session pooler»

1. Supabase → tu proyecto → botón **Connect** → pestaña de cadena de conexión → método **Session pooler** (puerto 5432).
   Es la que funciona desde GitHub: la «Direct connection» solo admite IPv6 y los ejecutores de GitHub usan IPv4.
2. Copia la URI, que tiene esta forma: `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<región>.pooler.supabase.com:5432/postgres`
3. Sustituye `[YOUR-PASSWORD]` por la **contraseña de la base de datos** (Project Settings → Database → *Reset database password* si no la recuerdas;
   no afecta a la app). Si la contraseña lleva símbolos, escríbelos codificados (`@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `?` → `%3F`, espacio → `%20`);
   lo más cómodo es elegir una contraseña solo con letras y números.

### 3.3 La contraseña de cifrado

Inventa una frase larga (≥ 20 caracteres) y **guárdala en tu gestor de contraseñas**. Sin ella las copias no se pueden abrir —nadie puede, ni tú ni yo—.
No hace falta que recuerdes nada más: el resto está en GitHub.

### 3.4 GitHub: secretos y archivos

Repositorio → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Crea estos 6 (el nombre, exacto):

| Nombre | Valor |
|---|---|
| `SUPABASE_DB_URL` | la URI del §3.2, con la contraseña puesta |
| `R2_ACCOUNT_ID` | el Account ID del §3.1 |
| `R2_ACCESS_KEY_ID` | el *Access Key ID* |
| `R2_SECRET_ACCESS_KEY` | el *Secret Access Key* |
| `R2_BACKUP_BUCKET` | `comxow-backups` |
| `BACKUP_PASSPHRASE` | la frase de cifrado del §3.3 |

(Opcional, en la pestaña **Variables**: `R2_JURISDICTION` = `eu` si quieres fijarlo —si no, el guion prueba solo y encuentra la dirección correcta—,
y `BACKUP_KEEP` = nº de copias que se conservan, 8 por defecto.)

Sube al repositorio, como siempre, el contenido del ZIP: trae `backup/` (los guiones y esta guía) y `.github/workflows/` (`backup.yml` y `restore.yml`).
Si tu forma de subir no incluye carpetas que empiezan por punto, hay copias idénticas en `backup/workflows/`: en GitHub pulsa **Add file → Create new file**,
escribe como nombre `.github/workflows/backup.yml` (las barras crean las carpetas), pega el contenido y haz *Commit*; repite con `restore.yml`.

### 3.5 La primera copia

Repositorio → **Actions** → «Copia de seguridad de la base de datos» → **Run workflow**. Tarda unos 3–6 minutos. Al terminar:

* la página de la ejecución enseña una tabla (archivo, tamaño, «Cifrada: sí», duración) y la línea «Comprobación de restauración: correcta»;
* en Cloudflare → R2 → `comxow-backups` → carpeta `db/` hay un `comxow-db-AAAAMMDDTHHMMSSZ.tar.gpg` y su `.meta.json`.

Puedes lanzarla ya aunque Supabase siga restringido por cuota: los primeros pasos (secretos, R2) se validan igualmente y, si la conexión a la base de datos
se rechaza, el mensaje lo dirá; repítela cuando se levante la restricción.

## 4. Día a día

No hay que hacer nada. Si una copia falla, GitHub te envía un correo (*Actions → «Copia de seguridad…» failed*). Conviene echar un vistazo a la pestaña
**Actions** de vez en cuando. **Ojo:** GitHub desactiva los flujos programados de un repositorio público si pasan **60 días sin actividad** (GitHub suele avisar por correo);
si ocurre, en *Actions* pulsa **Enable workflow**.

## 5. Restaurar (en una emergencia)

La restauración **nunca pisa datos**: se niega si la base de destino no está vacía. Por eso se restaura en un proyecto de Supabase **nuevo**.

### 5.1 Desde GitHub (sin ordenador)

1. Supabase → crea un proyecto nuevo (mismo tipo de versión de Postgres o superior). Las cuotas se cuentan **por organización**: si la actual está
   restringida, créalo en otra organización.
2. Copia su URI del *Session pooler* (como en §3.2) y guárdala como secreto **`RESTORE_DB_URL`** en GitHub.
3. Actions → «Restaurar una copia de seguridad» → **Run workflow**: en *copia* pon `latest` (la más reciente) o el nombre exacto, y en *confirmar* escribe `RESTAURAR`.
4. Al terminar verás la tabla de comprobación (✓ en cada tabla) y la lista de **cosas que hay que rehacer a mano**:
   * cambiar en `js/supabase-client.js` la URL y la clave *anon* del proyecto nuevo (y subir la versión), y lo mismo en el Worker de Cloudflare
     (`comxow-storage-worker`) y en los secretos de GitHub que usen Supabase;
   * *Authentication → URL Configuration* (Site URL y Redirect URLs), plantillas de correo, SMTP y proveedores externos;
   * los usuarios conservan su contraseña, pero tendrán que iniciar sesión una vez.

### 5.2 Desde un ordenador (Linux/macOS/WSL)

```bash
# necesitas psql y pg_restore de la misma versión mayor que el servidor de destino (o superior), gpg y aws-cli
export R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BACKUP_BUCKET=comxow-backups BACKUP_PASSPHRASE='tu frase'
bash backup/download.sh --list                              # qué copias hay
bash backup/download.sh latest ./copias                     # descarga la más reciente
bash backup/restore.sh --bundle ./copias/comxow-db-….tar.gpg 'postgresql://postgres.<ref>:<contraseña>@<host-pooler>:5432/postgres'
```

También sirve sin el repositorio: cada copia lleva dentro su `restore.sh`. Descífrala (`gpg -d -o copia.tar archivo.tar.gpg`), descomprímela (`tar -xf copia.tar`) y ejecuta `bash restore.sh "<URI>"`.

### 5.3 Recuperar solo una tabla o mirar dentro de una copia

```bash
gpg -d -o copia.tar comxow-db-….tar.gpg && tar -xf copia.tar          # deja public.dump, auth.dump, meta.json…
pg_restore -l public.dump                                              # contenido del volcado
pg_restore --data-only --no-owner -t works -f works.sql public.dump    # los datos de una tabla, en SQL, para revisarlos o importarlos
```

## 6. Si algo falla

| Mensaje | Qué pasa | Qué hacer |
|---|---|---|
| «Falta el secreto …» | no está creado en GitHub | créalo (§3.4); el nombre es exacto |
| «No se pudo acceder al bucket … de R2» | Account ID, claves o nombre del bucket mal, o el token no incluye ese bucket | revisa §3.1; si cambias la jurisdicción, fija la variable `R2_JURISDICTION` |
| «El token de R2 no puede ESCRIBIR…» | token creado como *Object Read only* | crea otro con **Object Read & Write** |
| «No se pudo conectar a la base de datos» | URI mal copiada, contraseña errónea, se usó «Direct connection», proyecto pausado o restringido por cuota | vuelve a copiar la URI del **Session pooler** (§3.2); si pone «Tenant or user not found», el usuario o la región de la URI no son los del proyecto |
| «pg_dump … más antiguo que el servidor» | no se instaló el cliente correcto | vuelve a lanzar; si persiste, pásame el registro |
| «No se pudo descifrar la copia» / `Bad session key` | frase de cifrado distinta de la usada al crear esa copia | usa la frase que había entonces (si la cambias, apunta desde qué fecha) |
| «El destino NO está vacío» | intentas restaurar sobre datos existentes | usa un proyecto nuevo y vacío |
| «Comprobación de restauración» en rojo | la copia se subió, pero no se pudo restaurar o faltan filas | pásame el registro: no te fíes de esa copia hasta entenderlo |

## 7. Ajustes

* **Frecuencia**: edita la línea `cron:` de `.github/workflows/backup.yml` (UTC). `'17 3 * * 0'` = domingos; `'17 3 1,15 * *'` = días 1 y 15; `'17 3 1 * *'` = día 1 de cada mes.
* **Cuántas copias**: variable `BACKUP_KEEP` (mínimo 2).
* **Copia a mano cuando quieras**: Actions → «Copia de seguridad…» → Run workflow (útil antes de un cambio grande).
* **Cambiar la frase de cifrado**: cambia el secreto `BACKUP_PASSPHRASE`; las copias antiguas siguen necesitando la frase antigua.
* **Rotar el token de R2**: crea uno nuevo, cambia los dos secretos `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` y borra el viejo en Cloudflare.

## 8. Seguridad

* La copia contiene correos y contraseñas (cifradas con bcrypt) de los usuarios: por eso va **cifrada** y en un bucket **privado** con un token que solo ve ese bucket.
* El repositorio es público y **sus registros también**: los guiones no escriben cifras de la base de datos ni contraseñas en ellos (GitHub oculta además el valor de los secretos).
* Nunca pegues la URI de la base de datos, las claves de R2 ni la frase de cifrado en el código, en un issue ni en un chat: solo en *Secrets*.

## 9. Archivos de esta carpeta

| Archivo | Para qué |
|---|---|
| `backup.sh` | hace la copia (lo lanza `backup.yml`; también sirve en un PC con `BACKUP_LOCAL_DIR=./copias`, sin R2) |
| `verify.sh` | restaura la copia en una base temporal y comprueba filas, índices y políticas |
| `restore.sh` | restaura una copia en un Postgres/Supabase vacío (viaja dentro de cada copia) |
| `download.sh` | lista o descarga copias del bucket |
| `install-pg-client.sh` | instala en GitHub el PostgreSQL de la misma versión que Supabase (repositorio oficial de PostgreSQL) |
| `lib-r2.sh` | funciones comunes para hablar con R2 |
| `workflows/` | copias de los flujos de `.github/workflows/` (por si hay que crearlos a mano) |
