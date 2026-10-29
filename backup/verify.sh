#!/usr/bin/env bash
# =============================================================================================================================
# verify.sh — comprueba que una copia SE PUEDE RESTAURAR de verdad   (v42.27)
#
# Una copia que nunca se ha restaurado es una esperanza, no una copia. Este guion levanta un PostgreSQL TEMPORAL en la máquina que lo
# ejecuta (no toca Supabase ni gasta su cuota), le monta lo mínimo de un proyecto de Supabase (roles, esquema auth, auth.uid()) y
# restaura en él el archivo de copia tal como está en el bucket —descifrándolo con la contraseña— usando el mismo restore.sh que se
# usaría en una emergencia. Al final comprueba que cada tabla tiene las filas que tenía la base original al copiarla.
#
# Uso:   bash verify.sh <copia.tar | copia.tar.gpg>          (contraseña de cifrado en la variable BACKUP_PASSPHRASE)
# Necesita los programas del SERVIDOR de PostgreSQL de la misma versión mayor que la copia (install-pg-client.sh <N> --server),
# o la variable PGBIN apuntando a su carpeta «bin».
# =============================================================================================================================
set -Eeuo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  die() { printf '::error::%s\n' "$*" >&2; exit 1; }
else
  die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
fi
log() { printf '%s\n' "$*"; }

[ $# -eq 1 ] || die "Uso: verify.sh <copia.tar | copia.tar.gpg>"
IN="$1"; [ -f "$IN" ] || die "No existe «$IN»."
for b in tar sed awk; do command -v "$b" >/dev/null || die "No se encuentra «$b»."; done

V="$(mktemp -d)"
PGPID_STARTED=0
RUNAS=()
cleanup() {
  if [ "$PGPID_STARTED" = 1 ] && [ -n "${PGBIN:-}" ]; then "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$V/data" -m immediate -w stop >/dev/null 2>&1 || true; fi
  rm -rf "$V"
}
trap cleanup EXIT
chmod 755 "$V"
T0=$(date +%s)

# ── 1. Versión del servidor de la copia (hay que descifrar para leer meta.json) ───────────────────────────────────────────────
TAR="$IN"
case "$IN" in
  *.gpg)
    command -v gpg >/dev/null || die "Hace falta «gpg» para descifrar."
    [ -n "${BACKUP_PASSPHRASE:-}" ] || die "La copia está cifrada: define BACKUP_PASSPHRASE."
    export GNUPGHOME="$V/gnupg"; mkdir -m 700 "$GNUPGHOME"
    ( umask 077; printf '%s' "$BACKUP_PASSPHRASE" > "$V/pw" )
    gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$V/pw" -d -o "$V/bundle.tar" "$IN" || die "No se pudo descifrar la copia con la contraseña dada."
    rm -f "$V/pw"
    TAR="$V/bundle.tar";;
esac
tar -xOf "$TAR" meta.json > "$V/meta.json" || die "El archivo no parece una copia de Comxow (no trae meta.json)."
SMAJ="$(sed -n 's/.*"server_major":\([0-9]*\).*/\1/p' "$V/meta.json" | head -n1)"
NAME="$(sed -n 's/.*"name":"\([^"]*\)".*/\1/p' "$V/meta.json" | head -n1)"
[ -n "$SMAJ" ] || die "meta.json no trae la versión del servidor."
log "Verificando $NAME (PostgreSQL $SMAJ)…"

# ── 2. Servidor temporal ─────────────────────────────────────────────────────────────────────────────────────────────────────
if [ -z "${PGBIN:-}" ]; then
  for c in "/usr/lib/postgresql/$SMAJ/bin" "/usr/pgsql-$SMAJ/bin" "/opt/homebrew/opt/postgresql@$SMAJ/bin" "/usr/local/opt/postgresql@$SMAJ/bin"; do
    [ -x "$c/initdb" ] && { PGBIN="$c"; break; }
  done
fi
[ -n "${PGBIN:-}" ] && [ -x "$PGBIN/initdb" ] && [ -x "$PGBIN/pg_ctl" ] || die "No encuentro el servidor de PostgreSQL $SMAJ para la prueba (ejecuta: bash backup/install-pg-client.sh $SMAJ --server)."
PGMAJ="$("$PGBIN/postgres" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
[ "$PGMAJ" = "$SMAJ" ] || die "El servidor de pruebas es PostgreSQL $PGMAJ y la copia es de PostgreSQL $SMAJ: deben coincidir."
if [ "$(id -u)" -eq 0 ]; then   # initdb no se puede ejecutar como root
  id postgres >/dev/null 2>&1 || die "Se ejecuta como root y no existe el usuario «postgres» para el servidor de pruebas."
  RUNAS=(runuser -u postgres --); chown postgres "$V"
fi
PORT=$((50000 + RANDOM % 9000))
"${RUNAS[@]}" "$PGBIN/initdb" -D "$V/data" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 --no-sync >"$V/initdb.log" 2>&1 \
  || "${RUNAS[@]}" "$PGBIN/initdb" -D "$V/data" -U postgres --auth=trust -E UTF8 --locale=C --no-sync >"$V/initdb.log" 2>&1 \
  || { cat "$V/initdb.log" >&2; die "initdb falló."; }
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$V/data" -l "$V/pg.log" -w -t 90 \
  -o "-p $PORT -k $V -c listen_addresses= -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_wal_size=2GB -c autovacuum=off" start >/dev/null \
  || { tail -n 30 "$V/pg.log" >&2; die "No arrancó el servidor de pruebas."; }
PGPID_STARTED=1
URL="postgresql://postgres@/postgres?host=$V&port=$PORT"
export PSQL="$PGBIN/psql" PG_RESTORE="$PGBIN/pg_restore"

# ── 3. Lo mínimo de un proyecto de Supabase (el resto —tablas de auth, esquema public— sale de la propia copia) ────────────────
"$PSQL" -X -q -v ON_ERROR_STOP=1 -d "$URL" >/dev/null <<'SQL'
SET client_min_messages = error;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin','dashboard_user','pgbouncer'] LOOP
    EXECUTE format('CREATE ROLE %I NOLOGIN', r);
  END LOOP;
END $$;
CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $f$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$ select coalesce(current_setting('request.jwt.claim.role', true), 'anon') $f$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
CREATE PUBLICATION supabase_realtime;
SQL

# ── 4. Restauración con el restore.sh de siempre ─────────────────────────────────────────────────────────────────────────────
log "Restaurando en la base temporal…"
RC=0
bash "$HERE/restore.sh" --scratch --yes --bundle "$TAR" "$URL" > "$V/restore.out" 2>&1 || RC=$?
cat "$V/restore.out"
[ "$RC" = 0 ] || die "La copia NO se restauró correctamente (código $RC). Mira el registro de arriba."

# ── 5. Comprobaciones extra sobre lo restaurado ──────────────────────────────────────────────────────────────────────────────
BADIDX="$("$PSQL" -X -qAt -d "$URL" -c "select count(*) from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','auth') and not i.indisvalid")"
[ "$BADIDX" = 0 ] || die "Hay $BADIDX índice(s) inválido(s) tras restaurar."
NPOL="$("$PSQL" -X -qAt -d "$URL" -c "select count(*) from pg_policies where schemaname = 'public'")"
NFN="$("$PSQL" -X -qAt -d "$URL" -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')")"
DT=$(( $(date +%s) - T0 ))
log ""
log "✓ La copia $NAME se restaura sin errores y con todas las filas: $NPOL políticas RLS, $NFN funciones, índices válidos. (${DT} s)"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo ""
    echo "**Comprobación de restauración: correcta** — la copia \`$NAME\` se restauró en una base temporal (PostgreSQL $SMAJ) con todas las filas esperadas, $NPOL políticas RLS y $NFN funciones (${DT} s)."
  } >> "$GITHUB_STEP_SUMMARY"
fi
