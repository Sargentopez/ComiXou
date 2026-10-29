#!/usr/bin/env bash
# =============================================================================================================================
# download.sh — lista o descarga copias de seguridad del bucket privado de R2   (v42.27)
#
# Uso:   bash download.sh --list                    muestra las copias que hay (nombre y tamaño)
#        bash download.sh latest   <carpeta>        descarga la más reciente en <carpeta>
#        bash download.sh <nombre> <carpeta>        descarga una concreta (p. ej. comxow-db-20261101T031700Z.tar.gpg)
# Imprime la ruta del archivo descargado (última línea). Variables de R2: las mismas que backup.sh (ver lib-r2.sh).
# =============================================================================================================================
set -Eeuo pipefail
umask 077
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log() { printf '%s\n' "$*" >&2; }
if [ -n "${GITHUB_ACTIONS:-}" ]; then die() { printf '::error::%s\n' "$*" >&2; exit 1; }; else die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }; fi

PREFIX="${BACKUP_PREFIX:-db/}"; case "$PREFIX" in */) ;; *) PREFIX="$PREFIX/";; esac
[ $# -ge 1 ] || die "Uso: download.sh --list | download.sh latest|<nombre> <carpeta>"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
# shellcheck source=lib-r2.sh
. "$HERE/lib-r2.sh"
r2_init

if [ "$1" = "--list" ]; then
  KEYS="$(r2_list_backups)"
  [ -n "$KEYS" ] || { log "No hay copias en s3://$B/$PREFIX"; exit 0; }
  while IFS= read -r k; do
    SZ="$(s3 s3api head-object --bucket "$B" --key "$k" --query ContentLength --output text 2>/dev/null || echo '?')"
    printf '%s\t%s MB\n' "${k#"$PREFIX"}" "$(( (${SZ//[!0-9]/0} + 524288) / 1048576 ))"
  done <<< "$KEYS"
  exit 0
fi

[ $# -eq 2 ] || die "Uso: download.sh latest|<nombre> <carpeta>"
WHICH="$1"; DEST="$2"; mkdir -p "$DEST"
if [ "$WHICH" = latest ]; then
  KEY="$(r2_list_backups | tail -n 1)"
  [ -n "$KEY" ] || die "No hay ninguna copia en s3://$B/$PREFIX"
else
  case "$WHICH" in */*|*..*) die "Nombre de copia no válido: $WHICH";; esac
  KEY="$PREFIX$WHICH"
  s3 s3api head-object --bucket "$B" --key "$KEY" >/dev/null 2>&1 || die "No existe la copia «$WHICH» en el bucket (usa --list para ver las que hay)."
fi
OUT="$DEST/$(basename "$KEY")"
log "Descargando ${KEY#"$PREFIX"}…"
s3 s3 cp "s3://$B/$KEY" "$OUT" --only-show-errors
WANT="$(s3 s3api head-object --bucket "$B" --key "$KEY" --query ContentLength --output text)"
[ "$(stat -c %s "$OUT")" = "$WANT" ] || die "La descarga está incompleta ($(stat -c %s "$OUT") de $WANT bytes)."
printf '%s\n' "$OUT"
