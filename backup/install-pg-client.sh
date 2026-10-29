#!/usr/bin/env bash
# =============================================================================================================================
# install-pg-client.sh — instala en el ejecutor de GitHub (Ubuntu) los programas de PostgreSQL de la MISMA versión mayor que Supabase  (v42.27)
#
# pg_dump se niega a copiar un servidor más NUEVO que él, y el Ubuntu de GitHub trae una versión fija; por eso se instala la correcta
# desde el repositorio oficial de PostgreSQL (PGDG, apt.postgresql.org — método manual documentado en su README).
#
# Uso:   bash install-pg-client.sh --detect [--server]    lee SUPABASE_DB_URL, averigua la versión del servidor e instala la misma
#        bash install-pg-client.sh <N> [--server]          instala la versión mayor N (p. ej. 17)
#   --server   instala además el servidor (postgresql-N): lo necesita verify.sh para restaurar la copia en una base temporal
#
# Escribe PGBIN, PG_DUMP, PG_RESTORE y PSQL en la salida y, si existe, en $GITHUB_ENV (para los pasos siguientes del flujo).
# =============================================================================================================================
set -Eeuo pipefail

log() { printf '%s\n' "$*" >&2; }
if [ -n "${GITHUB_ACTIONS:-}" ]; then die() { printf '::error::%s\n' "$*" >&2; exit 1; }; else die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }; fi

DETECT=0; SERVER=0; N=""
for a in "$@"; do
  case "$a" in
    --detect) DETECT=1;;
    --server) SERVER=1;;
    [0-9]*)   N="$a";;
    *)        die "Argumento desconocido: $a";;
  esac
done

if [ "$DETECT" = 1 ]; then
  [ -n "${SUPABASE_DB_URL:-}" ] || die "Falta SUPABASE_DB_URL (la URI del «Session pooler» de Supabase)."
  command -v psql >/dev/null || die "No hay psql para averiguar la versión del servidor."
  VNUM=""
  for i in 1 2 3 4; do
    if VNUM="$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$SUPABASE_DB_URL" -c 'show server_version_num' 2>/tmp/pg_detect.err)"; then break; fi
    VNUM=""; [ "$i" -lt 4 ] && { log "  conexión fallida ($i/4), reintento en $((i*5)) s…"; sleep $((i*5)); }
  done
  if [ -z "$VNUM" ]; then
    sed -E 's#(postgres(ql)?://[^:/@ ]+):[^@ ]*@#\1:***@#g' /tmp/pg_detect.err >&2 || true
    die "No se pudo conectar a la base de datos para averiguar su versión. Revisa SUPABASE_DB_URL (Session pooler, puerto 5432) y que el proyecto no esté restringido por cuota."
  fi
  N=$((VNUM / 10000))
  log "Servidor de Supabase: PostgreSQL $N"
fi
case "$N" in ''|*[!0-9]*) die "Indica la versión mayor de PostgreSQL (p. ej. 17) o usa --detect.";; esac

BIN="/usr/lib/postgresql/$N/bin"
have() { [ -x "$BIN/pg_dump" ] && [ -x "$BIN/pg_restore" ] && [ -x "$BIN/psql" ] && { [ "$SERVER" != 1 ] || { [ -x "$BIN/initdb" ] && [ -x "$BIN/pg_ctl" ] && [ -x "$BIN/postgres" ]; }; }; }

if have; then
  log "PostgreSQL $N ya está instalado."
else
  SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
  [ -r /etc/os-release ] || die "No se reconoce el sistema (falta /etc/os-release): este guion es para Ubuntu/Debian."
  # shellcheck disable=SC1091
  . /etc/os-release
  [ -n "${VERSION_CODENAME:-}" ] || die "No se pudo determinar la versión de Ubuntu/Debian."
  log "Instalando PostgreSQL $N desde el repositorio oficial de PostgreSQL (PGDG, $VERSION_CODENAME)…"
  export DEBIAN_FRONTEND=noninteractive
  $SUDO apt-get install -y --no-install-recommends ca-certificates curl >/dev/null
  $SUDO install -d /usr/share/postgresql-common/pgdg
  $SUDO curl -fsSL --retry 4 -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  printf 'Types: deb\nURIs: https://apt.postgresql.org/pub/repos/apt\nSuites: %s-pgdg\nComponents: main\nSigned-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc\n' "$VERSION_CODENAME" \
    | $SUDO tee /etc/apt/sources.list.d/pgdg.sources >/dev/null
  if [ "$SERVER" = 1 ]; then
    # que el paquete del servidor no cree ni arranque un clúster «main» que no se va a usar
    $SUDO install -d /etc/postgresql-common
    echo 'create_main_cluster = false' | $SUDO tee -a /etc/postgresql-common/createcluster.conf >/dev/null
    PKGS="postgresql-client-$N postgresql-$N"
  else
    PKGS="postgresql-client-$N"
  fi
  $SUDO apt-get update -qq
  # shellcheck disable=SC2086
  $SUDO apt-get install -y --no-install-recommends $PKGS >/dev/null
  have || die "Tras instalar $PKGS siguen sin aparecer los programas en $BIN."
fi

log "pg_dump: $("$BIN/pg_dump" --version)"
OUT="PGBIN=$BIN
PG_DUMP=$BIN/pg_dump
PG_RESTORE=$BIN/pg_restore
PSQL=$BIN/psql"
printf '%s\n' "$OUT"
if [ -n "${GITHUB_ENV:-}" ]; then printf '%s\n' "$OUT" >> "$GITHUB_ENV"; fi
