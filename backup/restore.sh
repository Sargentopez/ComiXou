#!/usr/bin/env bash
# =============================================================================================================================
# restore.sh — restaura una copia de seguridad de Comxow (hecha con backup.sh) en una base de datos NUEVA y VACÍA   (v42.27)
#
# Uso:   bash restore.sh [opciones] <URI-de-la-base-de-datos-de-destino>
#        La URI es la del «Session pooler» (puerto 5432) del proyecto de Supabase NUEVO, con su contraseña de base de datos:
#          postgresql://postgres.<ref>:<contraseña>@<host-del-pooler>:5432/postgres      (también vale la variable RESTORE_DB_URL)
#
# Opciones
#   --bundle ARCHIVO        copia .tar o .tar.gpg (la que se descargó del bucket). Sin ella se usan los archivos que haya junto
#                           a este guion (public.dump, auth.dump, meta.json…), es decir, una copia ya descomprimida.
#   --passphrase-file ARCH  archivo con la contraseña de cifrado (si no, variable BACKUP_PASSPHRASE; si no, se pregunta)
#   --yes                   no pide confirmación (necesario si no hay terminal, p. ej. en GitHub Actions)
#   --scratch               destino de PRUEBAS sin GoTrue (lo usa verify.sh): crea también las tablas de auth y los roles que falten
#
# Qué hace (todo dentro de UNA transacción: o se restaura todo o no cambia nada):
#   1. Comprueba versiones y que el destino esté vacío (si no lo está, se niega: nunca pisa datos).
#   2. Crea las extensiones que usaba la base original (unaccent…), si el destino no las trae.
#   3. Carga los usuarios (auth.users, auth.identities), después el esquema «public» entero (tablas, datos, índices, claves,
#      políticas RLS, funciones, disparadores, permisos) y por último los disparadores de auth.users (el que da de alta al autor).
#      Con «session_replication_role = replica» (el método que documenta Supabase) los disparadores no se ejecutan durante la carga.
#   4. Compara el nº de filas de cada tabla con el de la copia y avisa de lo que debes rehacer a mano (ajustes de Auth, claves…).
# Requiere psql y pg_restore de la MISMA versión mayor que el servidor de destino, o superior.
# =============================================================================================================================
set -Eeuo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_RESTORE="${PG_RESTORE:-pg_restore}"; PSQL="${PSQL:-psql}"

log() { printf '%s\n' "$*"; }
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  warn() { printf '::warning::%s\n' "$*" >&2; }
  die()  { printf '::error::%s\n' "$*" >&2; exit 1; }
else
  warn() { printf 'AVISO: %s\n' "$*" >&2; }
  die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
fi
usage() { sed -n '2,/^# ====/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//' ; }
maskurl() { printf '%s' "$1" | sed -E 's#^([a-zA-Z]+://[^:/@]+):[^@]*@#\1:***@#'; }

# ── Argumentos ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
BUNDLE=""; PWFILE=""; YES=0; SCRATCH=0; URL="${RESTORE_DB_URL:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle)          [ $# -ge 2 ] || die "Falta el valor de --bundle."; BUNDLE="$2"; shift;;
    --passphrase-file) [ $# -ge 2 ] || die "Falta el valor de --passphrase-file."; PWFILE="$2"; shift;;
    --yes|-y)          YES=1;;
    --scratch)         SCRATCH=1;;
    -h|--help)         usage; exit 0;;
    -*)                die "Opción desconocida: $1 (usa --help).";;
    *)                 [ -z "${URL_ARG:-}" ] || die "Sobra el argumento «$1»."; URL_ARG="$1"; URL="$1";;
  esac
  shift
done
[ -n "$URL" ] || { usage >&2; die "Falta la URI de la base de datos de destino."; }
for b in "$PG_RESTORE" "$PSQL" tar awk sed grep; do command -v "$b" >/dev/null || die "No se encuentra «$b»."; done

W="$(mktemp -d)"; chmod 700 "$W"
trap 'rm -rf "$W"' EXIT

# ── 1. La copia: descifrar / descomprimir si hace falta ──────────────────────────────────────────────────────────────────────
SRC="$HERE"
if [ -n "$BUNDLE" ]; then
  [ -f "$BUNDLE" ] || die "No existe el archivo «$BUNDLE»."
  TARFILE="$BUNDLE"
  case "$BUNDLE" in
    *.gpg)
      command -v gpg >/dev/null || die "Hace falta «gpg» para descifrar «$BUNDLE»."
      export GNUPGHOME="$W/gnupg"; mkdir -m 700 "$GNUPGHOME"
      gpgargs=(--yes --quiet --pinentry-mode loopback)
      if [ -n "$PWFILE" ]; then
        [ -f "$PWFILE" ] || die "No existe el archivo de contraseña «$PWFILE»."
        gpgargs+=(--batch --passphrase-file "$PWFILE")
      elif [ -n "${BACKUP_PASSPHRASE:-}" ]; then
        ( umask 077; printf '%s' "$BACKUP_PASSPHRASE" > "$W/pw" )
        gpgargs+=(--batch --passphrase-file "$W/pw")
      fi
      log "Descifrando $(basename "$BUNDLE")…"
      gpg "${gpgargs[@]}" -d -o "$W/bundle.tar" "$BUNDLE" || die "No se pudo descifrar la copia (¿contraseña incorrecta o archivo dañado?)."
      TARFILE="$W/bundle.tar";;
  esac
  mkdir "$W/x"
  tar -xf "$TARFILE" -C "$W/x" public.dump auth.dump meta.json extensions.tsv counts.tsv || die "El archivo no parece una copia de Comxow (faltan piezas) o está dañado."
  tar -xf "$TARFILE" -C "$W/x" publications.tsv 2>/dev/null || true
  SRC="$W/x"
fi
for f in public.dump auth.dump meta.json extensions.tsv counts.tsv; do
  [ -s "$SRC/$f" ] || die "Falta «$f»: indica la copia con --bundle <archivo .tar o .tar.gpg>, o ejecuta este guion desde la carpeta donde descomprimiste la copia."
done

metaval() { sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p" "$SRC/meta.json" | head -n1; }
SMAJ="$(metaval server_major)"; NAME="$(metaval name)"; CREATED="$(metaval created_at)"; SVER_TXT="$(metaval server_version)"
case "$SMAJ" in ''|*[!0-9]*) die "meta.json no trae la versión del servidor de origen.";; esac
log "Copia: $NAME · hecha el $CREATED · PostgreSQL de origen $SVER_TXT"

"$PG_RESTORE" -l "$SRC/public.dump" > "$W/public.toc" 2>"$W/toc.err" || { cat "$W/toc.err" >&2; die "pg_restore no puede leer public.dump (¿versión de pg_restore demasiado antigua, o archivo dañado?)."; }
"$PG_RESTORE" -l "$SRC/auth.dump"   > "$W/auth.toc"   2>"$W/toc.err" || { cat "$W/toc.err" >&2; die "pg_restore no puede leer auth.dump."; }

# ── 2. El destino ───────────────────────────────────────────────────────────────────────────────────────────────────────────
psql_t() { "$PSQL" -X -qAt -v ON_ERROR_STOP=1 -d "$URL" "$@"; }
TVER="$(psql_t -c 'show server_version_num' 2>"$W/conn.err")" || { sed -E 's#(postgres(ql)?://[^:/@ ]+):[^@ ]*@#\1:***@#g' "$W/conn.err" >&2; die "No se pudo conectar a la base de datos de destino. Revisa la URI (la del «Session pooler», puerto 5432, usuario postgres.<ref>)."; }
TMAJ=$((TVER / 10000))
CMAJ="$("$PG_RESTORE" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
log "Destino: $(maskurl "$URL") · PostgreSQL $TMAJ · pg_restore $CMAJ"
[ "$CMAJ" -ge "$TMAJ" ] || die "pg_restore $CMAJ es más antiguo que el servidor de destino ($TMAJ). Instala postgresql-client-$TMAJ (o superior)."
[ "$CMAJ" -ge "$SMAJ" ] || die "pg_restore $CMAJ es más antiguo que el PostgreSQL de origen ($SMAJ). Instala postgresql-client-$SMAJ (o superior)."
[ "$TMAJ" -ge "$SMAJ" ] || die "El destino es PostgreSQL $TMAJ y la copia viene de PostgreSQL $SMAJ: crea el proyecto de destino con la misma versión o una superior."

HAS_AUTH="$(psql_t -c "select to_regclass('auth.users') is not null")"
if [ "$HAS_AUTH" != t ] && [ "$SCRATCH" != 1 ]; then
  die "El destino no tiene auth.users: no parece un proyecto de Supabase (usa un proyecto nuevo, no una base de datos cualquiera)."
fi
NOBJ="$(psql_t -c "select
   (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
        and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'))
 + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'))")"
NUSR=0; [ "$HAS_AUTH" != t ] || NUSR="$(psql_t -c 'select count(*) from auth.users')"
if [ "$NOBJ" != 0 ] || [ "$NUSR" != 0 ]; then
  die "El destino NO está vacío (public tiene $NOBJ objetos y auth.users tiene $NUSR usuarios). Por seguridad no se restaura encima de datos existentes: usa un proyecto de Supabase nuevo y vacío."
fi
# ¿se puede usar session_replication_role? (en Supabase el rol «postgres» tiene permiso; si no, se aborta antes de tocar nada)
psql_t -c "begin; set local session_replication_role = replica; rollback;" >/dev/null 2>"$W/srr.err" || { cat "$W/srr.err" >&2; die "El usuario de la conexión no puede usar session_replication_role (hace falta el usuario «postgres» del proyecto de Supabase)."; }

if [ "$YES" != 1 ]; then
  [ -t 0 ] || die "No hay terminal para pedir confirmación: añade --yes."
  printf '\nSe va a escribir la copia «%s» en %s.\nEscribe RESTAURAR para continuar: ' "$NAME" "$(maskurl "$URL")" >&2
  read -r ans </dev/tty || ans=""
  [ "$ans" = RESTAURAR ] || die "Cancelado."
fi
T0=$(date +%s)

# ── 3. Extensiones (las que usaba la base original y el destino no trae) ─────────────────────────────────────────────────────
log "Extensiones…"
while IFS=$'\t' read -r ext nsp _ver || [ -n "${ext:-}" ]; do
  [ -n "$ext" ] || continue
  case "$ext" in plpgsql) continue;; esac
  HAVE="$(psql_t -c "select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = '${ext//\'/\'\'}'")"
  if [ -n "$HAVE" ]; then
    [ "$HAVE" = "$nsp" ] || warn "La extensión «$ext» ya está en el esquema «$HAVE» del destino (en la base original estaba en «$nsp»): si la restauración falla por esto, bórrala y vuelve a empezar."
    continue
  fi
  if psql_t -c "create schema if not exists \"${nsp//\"/\"\"}\"" -c "create extension if not exists \"${ext//\"/\"\"}\" with schema \"${nsp//\"/\"\"}\"" >/dev/null 2>"$W/ext.err"; then
    log "  + $ext (esquema $nsp)"
  else
    warn "No se pudo crear la extensión «$ext» en «$nsp»: $(tr '\n' ' ' < "$W/ext.err")"
  fi
done < "$SRC/extensions.tsv"

# ── 4. Listas de objetos a restaurar ────────────────────────────────────────────────────────────────────────────────────────
ID='^[0-9]+; [0-9]+ [0-9]+ '
# public: todo salvo lo que un proyecto nuevo ya trae (el esquema, sus privilegios por defecto y las extensiones/publicaciones, que van aparte)
grep -Ev "^;|${ID}(SCHEMA - public |COMMENT - SCHEMA public |ACL - SCHEMA public |DEFAULT ACL |EXTENSION |COMMENT - EXTENSION |PUBLICATION |SUBSCRIPTION |EVENT TRIGGER )" "$W/public.toc" > "$W/public.list" || true
grep -Eq "${ID}TABLE DATA public " "$W/public.list" || die "La copia no trae datos del esquema public."
# Los permisos (GRANT/REVOKE) se aplican al final y por separado: un proyecto de Supabase concede por defecto ALL a anon/authenticated/service_role
# en cada tabla nueva, y pg_dump solo escribe los GRANT que existían, no los REVOKE: sin este paso, una tabla a la que se le habían quitado
# permisos en la base original los recuperaría al restaurar.
grep -E  "${ID}ACL " "$W/public.list" > "$W/public_acl.list"  || : > "$W/public_acl.list"
grep -Ev "${ID}ACL " "$W/public.list" > "$W/public_main.list" || true
if [ "$SCRATCH" = 1 ]; then
  grep -Ev "^;|${ID}TRIGGER auth " "$W/auth.toc" > "$W/auth_main.list" || true               # pruebas: tablas de auth completas
else
  grep -E "${ID}TABLE DATA auth (users|identities) " "$W/auth.toc" > "$W/auth_main.list" || true   # real: solo los datos (las tablas las crea GoTrue)
fi
grep -Eq "${ID}TABLE DATA auth users " "$W/auth_main.list" || die "La copia no trae los usuarios (auth.users)."
grep -E "${ID}TRIGGER auth " "$W/auth.toc" > "$W/auth_trg.list" || : > "$W/auth_trg.list"

# ── 5. Guion SQL (se genera entero ANTES de tocar la base: si pg_restore falla, no se ejecuta nada) ─────────────────────────────
log "Preparando la restauración…"
PRB=("$PG_RESTORE" --no-owner --no-tablespaces)
{
  echo "-- generado por restore.sh a partir de $NAME"
  echo "SET session_replication_role = replica;"
  "${PRB[@]}" -L "$W/auth_main.list"   -f - "$SRC/auth.dump"
  "${PRB[@]}" -L "$W/public_main.list" -f - "$SRC/public.dump"
  cat <<'SQL'
-- Quita los permisos que el destino concede por defecto a los objetos nuevos de public; enseguida se aplican los de la copia, tal cual.
DO $wipe$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relkind, format('%I.%I', n.nspname, c.relname) AS qn,
           CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS who
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL (SELECT DISTINCT e.grantee FROM aclexplode(c.relacl) e WHERE e.grantee <> c.relowner) x
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S') AND c.relacl IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON %s %s FROM %s', CASE WHEN r.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, r.qn, r.who);
  END LOOP;
  FOR r IN
    SELECT p.prokind, format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS qn,
           quote_ident(pg_get_userbyid(x.grantee)) AS who
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL (SELECT DISTINCT e.grantee FROM aclexplode(p.proacl) e WHERE e.grantee <> p.proowner AND e.grantee <> 0) x
    WHERE n.nspname = 'public' AND p.proacl IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON %s %s FROM %s', CASE WHEN r.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, r.qn, r.who);
  END LOOP;
END
$wipe$;
SQL
  if [ -s "$W/public_acl.list" ]; then "${PRB[@]}" -L "$W/public_acl.list" -f - "$SRC/public.dump"; fi
  if [ -s "$W/auth_trg.list" ]; then "${PRB[@]}" -L "$W/auth_trg.list" -f - "$SRC/auth.dump"; fi
} > "$W/restore.sql" || die "pg_restore no pudo preparar el guion de restauración."
log "  guion de $(( ($(stat -c %s "$W/restore.sql") + 524288) / 1048576 )) MB"

# ── 6. Ejecución (una sola transacción) ─────────────────────────────────────────────────────────────────────────────────────
log "Restaurando (usuarios → public → disparadores de auth)…"
TRIES=0
while :; do
  if "$PSQL" -X -q -v ON_ERROR_STOP=1 --single-transaction -d "$URL" -f "$W/restore.sql" >"$W/psql.out" 2>"$W/psql.err"; then break; fi
  ROLE="$(sed -n 's/.*role "\([^"]*\)" does not exist.*/\1/p' "$W/psql.err" | head -n1)"
  if [ "$SCRATCH" = 1 ] && [ -n "$ROLE" ] && [ "$TRIES" -lt 20 ]; then
    TRIES=$((TRIES + 1)); log "  (pruebas) creo el rol que falta: $ROLE"
    psql_t -c "create role \"${ROLE//\"/\"\"}\" nologin" >/dev/null
    continue
  fi
  { echo "──── errores de la restauración ────"; head -n 25 "$W/psql.err"; echo "────────────────────────────────────"; } >&2
  die "La restauración falló y se ha deshecho entera: la base de datos de destino no ha cambiado (salvo las extensiones). Corrige lo indicado arriba y vuelve a ejecutar."
done
log "  hecho."

# ── 7. Publicaciones de Realtime (informativo en la copia; si el destino ya las tiene, se vuelven a enlazar) ───────────────────
if [ -s "$SRC/publications.tsv" ]; then
  while IFS=$'\t' read -r pub sch tab || [ -n "${pub:-}" ]; do
    [ -n "$pub" ] || continue
    psql_t -c "do \$\$ begin
        if exists (select 1 from pg_publication where pubname = '${pub//\'/\'\'}')
           and not exists (select 1 from pg_publication_tables where pubname = '${pub//\'/\'\'}' and schemaname = '${sch//\'/\'\'}' and tablename = '${tab//\'/\'\'}')
        then execute format('alter publication %I add table %I.%I', '${pub//\'/\'\'}', '${sch//\'/\'\'}', '${tab//\'/\'\'}'); end if; end \$\$" >/dev/null 2>&1 \
      && log "  publicación «$pub»: $sch.$tab" || warn "No se pudo añadir $sch.$tab a la publicación «$pub» (Realtime): hazlo a mano en Database → Publications."
  done < "$SRC/publications.tsv"
fi
psql_t -c "analyze" >/dev/null 2>&1 || true

# ── 8. Comprobación: nº de filas por tabla ──────────────────────────────────────────────────────────────────────────────────
SQL_COUNTS="select format('%s.%s', table_schema, table_name), (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
            from information_schema.tables where table_type = 'BASE TABLE' and (table_schema = 'public' or (table_schema = 'auth' and table_name in ('users','identities')))
            order by 1"
psql_t -F $'\t' -c "$SQL_COUNTS" > "$W/counts_after.tsv"
awk -F'\t' '
  NR == FNR { got[$1] = $2; next }
  { lo = $2 + 0; hi = (NF >= 3 ? $3 + 0 : lo); if (lo > hi) { t = lo; lo = hi; hi = t }
    g = ($1 in got) ? got[$1] : "-"
    ok = (g != "-" && g + 0 >= lo && g + 0 <= hi)
    printf "%s\t%s\t%s\t%s\n", $1, (lo == hi ? lo : lo ".." hi), g, (ok ? "OK" : "DIFERENTE") }' "$W/counts_after.tsv" "$SRC/counts.tsv" > "$W/cmp.tsv"
BAD="$(grep -c 'DIFERENTE$' "$W/cmp.tsv" || true)"
log ""; log "Filas por tabla (copia → restaurado):"
if [ -n "${GITHUB_ACTIONS:-}" ]; then   # los registros de GitHub son públicos si el repositorio lo es: sin cifras
  awk -F'\t' '{ printf "  %-34s   %s\n", $1, ($4 == "OK" ? "✓" : "✗ DIFERENTE") }' "$W/cmp.tsv"
else
  awk -F'\t' '{ printf "  %-34s %12s %12s   %s\n", $1, $2, $3, ($4 == "OK" ? "✓" : "✗ DIFERENTE") }' "$W/cmp.tsv"
fi
NINV="$(psql_t -c "select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and not c.convalidated")"
[ "$NINV" = 0 ] || warn "Hay $NINV restricciones sin validar en public."

DT=$(( $(date +%s) - T0 ))
log ""
if [ "$BAD" != 0 ]; then
  warn "$BAD tabla(s) con un nº de filas distinto al de la copia (arriba, marcadas ✗). La base queda restaurada, pero revísalo antes de usarla."
else
  log "✓ Restauración completa y comprobada en ${DT} s: todas las tablas coinciden con la copia."
fi

if [ "$SCRATCH" != 1 ]; then
cat <<'EOF'

═══════════════ QUÉ HAY QUE REHACER A MANO TRAS RESTAURAR (la copia solo guarda la base de datos) ═══════════════
 1. Claves del proyecto nuevo: en js/supabase-client.js cambia la URL y la clave «anon» por las del proyecto nuevo,
    y la URL/clave de Supabase en el Worker de Cloudflare (comxow-storage-worker) y en los secretos de GitHub (SUPABASE_*).
 2. Authentication → URL Configuration: «Site URL» y «Redirect URLs» (https://comxow.com…); plantillas de correo, SMTP propio
    y proveedores externos (Google…) si los usabas. Nada de eso va en la base de datos.
 3. Los usuarios existen con sus contraseñas, pero sus sesiones no se copian: tendrán que iniciar sesión una vez.
 4. Realtime / cron / Edge Functions / buckets de Storage de Supabase: no están en la copia (los archivos pesados están en R2).
 5. Vuelve a ejecutar sql/v42_27_panels_nav.sql solo si la columna panels.nav no aparece en Table Editor (debería venir en la copia).
════════════════════════════════════════════════════════════════════════════════════════════════════════════════
EOF
fi
[ "$BAD" = 0 ] || exit 3
exit 0
