#!/usr/bin/env bash
# =============================================================================================================================
# backup.sh — copia de seguridad de la base de datos de Comxow (Supabase) a un bucket PRIVADO de Cloudflare R2   (v42.28)
#
# Qué guarda (todo en UN archivo .tar, cifrado si hay contraseña):
#   · public.dump  — todo el esquema «public»: tablas con sus datos, índices, políticas RLS, funciones, disparadores y permisos
#                    (works, panels, panel_layers, panel_texts, biblioteca, authors…). pg_dump en formato «custom».
#   · auth.dump    — los usuarios (auth.users y auth.identities): sin ellos nadie podría volver a iniciar sesión.
#   · meta.json / extensions.tsv / publications.tsv / counts.tsv — versión del servidor, extensiones, publicaciones de Realtime y nº de
#                    filas por tabla (antes y después del volcado, para comprobar la restauración).
#   · restore.sh y LEEME.txt — el propio guion de restauración, para que la copia se pueda restaurar sin el repositorio.
# NO guarda los archivos de R2 (imágenes, GIF/APNG, portadas): están en Cloudflare, no en Supabase.
#
# Cómo se ejecuta: lo lanza .github/workflows/backup.yml (programado y a mano). También puede ejecutarse en un PC con
# pg_dump/psql/pg_restore (versión ≥ la del servidor) y aws-cli.
#
# Variables de entorno
#   SUPABASE_DB_URL      (obligatoria) URI de conexión por el «Session pooler» de Supabase (IPv4), con la contraseña de la base de datos
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET   (obligatorias salvo BACKUP_LOCAL_DIR)
#   BACKUP_PASSPHRASE    (recomendada) contraseña con la que se cifra la copia (GnuPG simétrico, AES-256). Sin ella la copia va SIN cifrar.
#   BACKUP_KEEP          nº de copias que se conservan en el bucket (por defecto 8; mínimo 2)
#   R2_BACKUP_MAX_GB     tope de ocupación de TODO el bucket de copias, en GB (por defecto 4; admite decimales, «2.5» o «2,5»). Si el bucket ya lo alcanza, o la copia
#                        nueva lo haría pasar, el guion se detiene (en rojo) antes de pedir nada a Supabase / antes de subir nada. Cloudflare no corta al pasar los
#                        10 GB gratuitos de la cuenta: empieza a cobrar. Este tope es el freno de las copias (no vigila el bucket de la app, comxow-storage).
#   BACKUP_PREFIX       carpeta dentro del bucket (por defecto «db/»)
#   BACKUP_LOCAL_DIR     si se define, la copia queda en esa carpeta y NO se sube nada (pruebas / copia manual)
#   R2_JURISDICTION      «eu» si el bucket se creó con jurisdicción de la Unión Europea (su dirección S3 es <cuenta>.eu.r2.cloudflarestorage.com);
#                        «standard» si no. Si no se indica, el guion prueba las dos y usa la que responda (ver lib-r2.sh).
#   R2_ENDPOINT          sustituye a la dirección S3 de R2 (pruebas)
#   BACKUP_COPY_DIR      carpeta donde dejar además una copia del paquete tal como se sube (la usa el paso de comprobación del flujo)
#   PG_DUMP / PG_RESTORE / PSQL   rutas de los binarios (por defecto los del PATH)
#   BACKUP_REQUIRED_TABLES  tablas que DEBEN estar en la copia (por defecto: works panels panel_layers panel_texts biblioteca authors)
# =============================================================================================================================
set -Eeuo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_DUMP="${PG_DUMP:-pg_dump}"; PG_RESTORE="${PG_RESTORE:-pg_restore}"; PSQL="${PSQL:-psql}"
PREFIX="${BACKUP_PREFIX:-db/}"; case "$PREFIX" in */) ;; *) PREFIX="$PREFIX/";; esac
KEEP="${BACKUP_KEEP:-8}"
REQUIRED="${BACKUP_REQUIRED_TABLES:-works panels panel_layers panel_texts biblioteca authors}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-}"
T0=$(date +%s)

log() { printf '%s\n' "$*"; }
if [ -n "${GITHUB_ACTIONS:-}" ]; then   # en GitHub los avisos y errores salen como anotaciones; en un terminal, como texto normal
  warn() { printf '::warning::%s\n' "$*" >&2; }
  die()  { printf '::error::%s\n' "$*" >&2; exit 1; }
else
  warn() { printf 'AVISO: %s\n' "$*" >&2; }
  die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
fi
fmt_gb() { awk -v b="$1" 'BEGIN { printf "%.3f", b / 1000000000 }' | tr . ,; }   # bytes → «0,914» (GB decimales, como mide Cloudflare)

[ -n "${SUPABASE_DB_URL:-}" ] || die "Falta SUPABASE_DB_URL (la URI del «Session pooler» de Supabase, con la contraseña de la base de datos)."
case "$KEEP" in ''|*[!0-9]*) die "BACKUP_KEEP debe ser un número (es «$KEEP»).";; esac
[ "$KEEP" -ge 2 ] || KEEP=2

# Tope de ocupación del bucket de copias (GB decimales, como factura Cloudflare: 1 GB = 10^9 bytes). La cuota gratuita de R2 son 10 GB-mes por CUENTA (se reparte
# con comxow-storage, el bucket de la app) y al pasarla Cloudflare NO corta nada: empieza a cobrar. Este tope es el freno de las copias (ver §0 y §5b).
MAX_GB="${R2_BACKUP_MAX_GB:-4}"; MAX_GB="${MAX_GB//,/.}"
MAX_BYTES=0; USED_BEFORE=""; USED_AFTER=""; WARN_PCT=70      # a partir del 70 % del tope, aviso amarillo en la ejecución
if [ -z "$LOCAL_DIR" ]; then
  [[ "$MAX_GB" =~ ^[0-9]+([.][0-9]+)?$ ]] && MAX_BYTES="$(awk -v g="$MAX_GB" 'BEGIN { printf "%.0f", g * 1000000000 }')"
  [ "$MAX_BYTES" -ge 1000000 ] || die "R2_BACKUP_MAX_GB debe ser un número de GB mayor que 0 (admite decimales: 4 o 2.5); ahora vale «${R2_BACKUP_MAX_GB:-}»."
fi

for b in "$PG_DUMP" "$PG_RESTORE" "$PSQL" tar gzip; do command -v "$b" >/dev/null || die "No se encuentra «$b»."; done
[ -z "${BACKUP_PASSPHRASE:-}" ] || command -v gpg >/dev/null || die "No se encuentra «gpg», necesario para cifrar."

W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
chmod 700 "$W"

psql_q() { "$PSQL" -X -qAt -v ON_ERROR_STOP=1 -d "$SUPABASE_DB_URL" "$@"; }

# ── 0. Destino en R2: se comprueba ANTES de pedir nada a Supabase (una copia de ~150 MB gasta cuota de egress; no se malgasta si R2 no responde) ──
if [ -z "$LOCAL_DIR" ]; then
  # shellcheck source=lib-r2.sh
  . "$HERE/lib-r2.sh"
  r2_init
  PROBE="${PREFIX}.probe-$$"
  printf 'ok' | s3 s3 cp - "s3://$B/$PROBE" --only-show-errors 2>"$W/r2.err" || { cat "$W/r2.err" >&2; die "El token de R2 no puede ESCRIBIR en el bucket «$B» (hace falta el permiso «Object Read & Write» sobre ese bucket)."; }
  s3 s3 rm "s3://$B/$PROBE" --only-show-errors || true
  log "Destino R2 listo (bucket «$B»)."
  # Freno de tamaño (1/2): si el bucket YA está en el tope, se para aquí, antes de pedir nada a Supabase (cada copia gasta egress).
  # Si no se puede medir se avisa y se sigue: quedarse sin copia por un fallo del listado sería peor que pasarse unos céntimos.
  if USED_BEFORE="$(r2_used_bytes)"; then
    log "Ocupación del bucket «$B»: $(fmt_gb "$USED_BEFORE") GB de ${MAX_GB/./,} GB de tope ($(( USED_BEFORE * 100 / MAX_BYTES )) %)."
    [ "$USED_BEFORE" -lt "$MAX_BYTES" ] || die "El bucket de copias «$B» ya ocupa $(fmt_gb "$USED_BEFORE") GB y el tope es ${MAX_GB/./,} GB (variable R2_BACKUP_MAX_GB): no se hace la copia, para no llenar el almacenamiento gratuito de Cloudflare (10 GB por cuenta; al pasarlos, Cloudflare cobra, no corta). Borra a mano copias antiguas en Cloudflare (R2 → «$B» → carpeta «$PREFIX») o sube el tope en GitHub (Settings → Secrets and variables → Actions → Variables). Guía: backup/LEEME_BACKUP.md §7."
  else
    USED_BEFORE=""
    warn "No se pudo medir lo que ocupa el bucket «$B»: la copia sigue SIN comprobar el tope de ${MAX_GB/./,} GB."
  fi
fi

# ── 1. Conexión (con reintentos: el «pooler» a veces tarda) ──────────────────────────────────────────────────────────────────
SVER=""
for i in 1 2 3 4; do
  if SVER="$(psql_q -c 'show server_version_num' 2>"$W/conn.err")"; then break; fi
  SVER=""; [ "$i" -lt 4 ] && { log "  conexión fallida ($i/4), reintento en $((i*5)) s…"; sleep $((i*5)); }
done
if [ -z "$SVER" ]; then
  sed -E 's#(postgres(ql)?://[^:/@ ]+):[^@ ]*@#\1:***@#g' "$W/conn.err" >&2 || true
  die "No se pudo conectar a la base de datos. Revisa SUPABASE_DB_URL (debe ser la del «Session pooler», puerto 5432) y que el proyecto no esté restringido por cuota."
fi
SMAJ=$((SVER / 10000))
CMAJ="$("$PG_DUMP" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
log "Servidor PostgreSQL $SMAJ (num $SVER) · pg_dump $CMAJ"
[ "$CMAJ" -ge "$SMAJ" ] || die "pg_dump $CMAJ es más antiguo que el servidor ($SMAJ): se negaría a copiar. Instala postgresql-client-$SMAJ (el flujo de GitHub lo hace con backup/install-pg-client.sh)."

# ── 2. Metadatos y recuentos (para poder comprobar la restauración) ──────────────────────────────────────────────────────────
TS="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="comxow-db-$TS"
SQL_COUNTS="select format('%s.%s', table_schema, table_name), (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
            from information_schema.tables where table_type = 'BASE TABLE' and (table_schema = 'public' or (table_schema = 'auth' and table_name in ('users','identities')))
            order by 1"
psql_q -F $'\t' -c "$SQL_COUNTS" > "$W/counts_before.tsv"
cp "$W/counts_before.tsv" "$W/counts.tsv"
psql_q -F $'\t' -c "select e.extname, n.nspname, e.extversion from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1" > "$W/extensions.tsv"
psql_q -F $'\t' -c "select pubname, schemaname, tablename from pg_publication_tables where schemaname = 'public' order by 1, 2, 3" > "$W/publications.tsv"
[ -s "$W/counts.tsv" ] || die "No se pudieron leer las tablas (¿permisos de la cuenta de la base de datos?)."
TAB=$'\t'
for t in $REQUIRED; do grep -q "^public\.$t$TAB" "$W/counts.tsv" || die "La tabla public.$t no existe en la base de datos: algo no es como se esperaba, no se hace la copia."; done
if [ -n "${GITHUB_ACTIONS:-}" ]; then   # el repositorio es público y sus registros también: en GitHub no se escriben cifras de la base de datos
  log "Tablas: $(wc -l < "$W/counts.tsv")"
else
  log "Tablas: $(wc -l < "$W/counts.tsv") · filas (public.works=$(awk -F'\t' '$1=="public.works"{print $2}' "$W/counts.tsv"), panel_layers=$(awk -F'\t' '$1=="public.panel_layers"{print $2}' "$W/counts.tsv"), auth.users=$(awk -F'\t' '$1=="auth.users"{print $2}' "$W/counts.tsv"))"
fi

# ── 3. Volcados (primero «public» y después «auth»: así ningún autor de public puede faltar en auth) ─────────────────────────
log "Volcando public…"
"$PG_DUMP" --format=custom --compress=6 --schema=public --file="$W/public.dump" "$SUPABASE_DB_URL"
log "Volcando usuarios (auth.users, auth.identities)…"
"$PG_DUMP" --format=custom --compress=6 --table=auth.users --table=auth.identities --file="$W/auth.dump" "$SUPABASE_DB_URL"

# Recuento tras el volcado: si una tabla cambió mientras se copiaba, la restauración se comparará con el intervalo [antes, después]
psql_q -F $'\t' -c "$SQL_COUNTS" > "$W/counts_after.tsv"
awk -F'\t' 'NR == FNR { b[$1] = $2; next } { printf "%s\t%s\t%s\n", $1, ($1 in b ? b[$1] : $2), $2 }' "$W/counts_before.tsv" "$W/counts_after.tsv" > "$W/counts.tsv"

# ── 4. Comprobación de que los volcados se pueden leer y traen lo esperado ───────────────────────────────────────────────────
"$PG_RESTORE" --list "$W/public.dump" > "$W/toc_public.txt" || die "public.dump no se puede leer (¿volcado corrupto?)."
"$PG_RESTORE" --list "$W/auth.dump"   > "$W/toc_auth.txt"   || die "auth.dump no se puede leer (¿volcado corrupto?)."
for t in $REQUIRED; do
  grep -Eq "TABLE DATA public $t " "$W/toc_public.txt" || die "public.dump no trae los datos de «$t»."
done
grep -Eq "TABLE DATA auth users " "$W/toc_auth.txt" || die "auth.dump no trae los datos de auth.users."
PUB_SIZE=$(stat -c %s "$W/public.dump"); AUTH_SIZE=$(stat -c %s "$W/auth.dump")
[ "$PUB_SIZE" -gt 20000 ] || die "public.dump pesa solo $PUB_SIZE bytes: copia sospechosamente pequeña, no se sube."
log "public.dump $(( (PUB_SIZE + 524288) / 1048576 )) MB · auth.dump $(( (AUTH_SIZE + 524288) / 1048576 )) MB"

# ── 5. Paquete autosuficiente ────────────────────────────────────────────────────────────────────────────────────────────────
SVER_TXT="$(psql_q -c 'show server_version' | tr -d '"\\')"
ENC=false; [ -z "${BACKUP_PASSPHRASE:-}" ] || ENC=true
{
  printf '{"name":"%s","created_at":"%s","server_version":"%s","server_major":%s,"encrypted":%s,"public_dump_bytes":%s,"auth_dump_bytes":%s,"counts":{' \
    "$NAME" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SVER_TXT" "$SMAJ" "$ENC" "$PUB_SIZE" "$AUTH_SIZE"
  awk -F'\t' 'BEGIN{f=1} {printf "%s\"%s\":[%s,%s]", (f?"":","), $1, $2, $3; f=0}' "$W/counts.tsv"
  printf '}}\n'
} > "$W/meta.json"
cp "$HERE/restore.sh" "$W/restore.sh"
cat > "$W/LEEME.txt" <<EOF
Copia de seguridad de la base de datos de Comxow — $TS (UTC)
Servidor PostgreSQL $SMAJ.

Contenido:  public.dump (esquema public completo) · auth.dump (usuarios) · meta.json · extensions.tsv · publications.tsv · counts.tsv · restore.sh

Para restaurar en un proyecto de Supabase NUEVO y VACÍO:
  1. Descifrar (si el archivo termina en .gpg):   gpg --batch --pinentry-mode loopback --passphrase-file contraseña.txt -d -o copia.tar $NAME.tar.gpg
  2. Descomprimir:    tar -xf copia.tar
  3. Restaurar:       bash restore.sh "postgresql://postgres.<ref>:<contraseña>@<host-del-pooler>:5432/postgres"
  (con el repositorio, los pasos 1 y 2 los hace solo:   bash backup/restore.sh --bundle $NAME.tar.gpg "<URI>")
Necesita psql y pg_restore de la MISMA versión mayor que el servidor de destino (o superior). Guía completa en backup/LEEME_BACKUP.md del repositorio.
EOF
BUNDLE="$W/$NAME.tar"
tar -cf "$BUNDLE" -C "$W" public.dump auth.dump meta.json extensions.tsv publications.tsv counts.tsv LEEME.txt restore.sh
rm -f "$W/public.dump" "$W/auth.dump"

OUTFILE="$BUNDLE"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  log "Cifrando (GnuPG simétrico, AES-256)…"
  ( umask 077; printf '%s' "$BACKUP_PASSPHRASE" > "$W/pw" )
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$W/pw" --symmetric --cipher-algo AES256 \
      --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 --compress-algo none -o "$BUNDLE.gpg" "$BUNDLE"
  rm -f "$W/pw" "$BUNDLE"
  OUTFILE="$BUNDLE.gpg"
else
  warn "BACKUP_PASSPHRASE no está definida: la copia se guarda SIN cifrar (contiene los correos y las contraseñas cifradas de los usuarios)."
fi
OUTNAME="$(basename "$OUTFILE")"; OUTSIZE=$(stat -c %s "$OUTFILE")
log "Paquete: $OUTNAME ($(( (OUTSIZE + 524288) / 1048576 )) MB)"

# ── 5b. Freno de tamaño (2/2): ¿con esta copia el bucket pasaría del tope? Se comprueba ANTES de subir (se cuenta el pico: copias actuales + la nueva);
#        si pasaría, no se sube nada ni se borra ninguna copia. ──────────────────────────────────────────────────────────────────────────────────────
if [ -z "$LOCAL_DIR" ] && [ -n "$USED_BEFORE" ] && [ $(( USED_BEFORE + OUTSIZE )) -gt "$MAX_BYTES" ]; then
  die "Con esta copia (+$(fmt_gb "$OUTSIZE") GB) el bucket «$B» pasaría de $(fmt_gb "$USED_BEFORE") GB a $(fmt_gb $(( USED_BEFORE + OUTSIZE ))) GB, por encima del tope de ${MAX_GB/./,} GB (variable R2_BACKUP_MAX_GB). No se ha subido nada ni se ha borrado ninguna copia. Borra a mano copias antiguas en Cloudflare (R2 → «$B» → carpeta «$PREFIX») o sube el tope en GitHub (Settings → Secrets and variables → Actions → Variables). Guía: backup/LEEME_BACKUP.md §7."
fi

# ── 6a. Destino local (pruebas / copia manual) ───────────────────────────────────────────────────────────────────────────────
if [ -n "$LOCAL_DIR" ]; then
  mkdir -p "$LOCAL_DIR"; cp "$OUTFILE" "$LOCAL_DIR/$OUTNAME"; cp "$W/meta.json" "$LOCAL_DIR/$NAME.meta.json"
  log "Copia guardada en $LOCAL_DIR/$OUTNAME"
else
# ── 6b. Subida a R2 ───────────────────────────────────────────────────────────────────────────────────────────────────────
  log "Subiendo a R2 (bucket «$B», $PREFIX$OUTNAME)…"
  s3 s3 cp "$OUTFILE" "s3://$B/$PREFIX$OUTNAME" --only-show-errors
  GOT="$(s3 s3api head-object --bucket "$B" --key "$PREFIX$OUTNAME" --query ContentLength --output text)"
  [ "$GOT" = "$OUTSIZE" ] || die "La subida no coincide: el bucket tiene $GOT bytes y el archivo local $OUTSIZE."
  s3 s3 cp "$W/meta.json" "s3://$B/$PREFIX$NAME.meta.json" --only-show-errors --content-type application/json
  log "Subida verificada ($GOT bytes)."

  # ── 7. Retención: se conservan las KEEP más recientes (los nombres llevan la fecha, así que el orden alfabético es el cronológico) ──
  KEYS=(); while IFS= read -r k; do [ -n "$k" ] && KEYS+=("$k"); done < <(r2_list_backups)
  N=${#KEYS[@]}
  log "Copias en el bucket: $N (se conservan $KEEP)."
  if [ "$N" -gt "$KEEP" ]; then
    printf '%s\n' "${KEYS[@]}" | grep -qxF "$PREFIX$OUTNAME" || die "La copia recién subida no aparece en el listado: no se borra nada por seguridad."
    for ((i = 0; i < N - KEEP; i++)); do
      k="${KEYS[$i]}"; [ "$k" != "$PREFIX$OUTNAME" ] || continue
      log "  borrando la más antigua: $k"
      s3 s3 rm "s3://$B/$k" --only-show-errors
      s3 s3 rm "s3://$B/${k%.tar*}.meta.json" --only-show-errors || true
    done
  fi

  # Ocupación final (ya sin las copias antiguas): se muestra y, a partir del 70 % del tope, se avisa en amarillo con tiempo para actuar
  USED_AFTER="$(r2_used_bytes)" || USED_AFTER=""
  if [ -n "$USED_AFTER" ]; then
    PCT_AFTER=$(( USED_AFTER * 100 / MAX_BYTES ))
    log "Ocupación del bucket tras la copia: $(fmt_gb "$USED_AFTER") GB de ${MAX_GB/./,} GB ($PCT_AFTER %)."
    [ "$PCT_AFTER" -lt "$WARN_PCT" ] || warn "El bucket de copias está al $PCT_AFTER % de su tope ($(fmt_gb "$USED_AFTER") de ${MAX_GB/./,} GB). Al alcanzarlo, las copias se detendrán: borra las más antiguas, baja BACKUP_KEEP o sube R2_BACKUP_MAX_GB (guía §7)."
  fi
fi

DT=$(( $(date +%s) - T0 ))
log "Listo en ${DT} s."
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Copia de seguridad $TS"
    echo ""
    echo "| | |"; echo "|---|---|"
    echo "| Archivo | \`$OUTNAME\` ($(( (OUTSIZE + 524288) / 1048576 )) MB) |"
    echo "| Cifrada | $([ -n "${BACKUP_PASSPHRASE:-}" ] && echo sí || echo '**NO**') |"
    echo "| Servidor | PostgreSQL $SMAJ |"
    [ -z "$USED_AFTER" ] || echo "| Bucket de copias | $(fmt_gb "$USED_AFTER") GB de ${MAX_GB/./,} GB de tope ($PCT_AFTER %) |"
    echo "| Duración | ${DT} s |"
  } >> "$GITHUB_STEP_SUMMARY"
fi
# Para el paso siguiente del flujo (comprobación de restauración): copia del paquete, con su nombre, tal como se ha subido
if [ -n "${BACKUP_COPY_DIR:-}" ]; then mkdir -p "$BACKUP_COPY_DIR"; cp "$OUTFILE" "$BACKUP_COPY_DIR/$OUTNAME"; fi
