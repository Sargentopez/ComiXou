#!/usr/bin/env bash
# lib-r2.sh — acceso al bucket PRIVADO de copias en Cloudflare R2 (lo usan backup.sh y download.sh; no se ejecuta solo)   (v42.27)
#
# Variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET
#            R2_JURISDICTION («eu», «standard» o vacío = probar las dos) · R2_ENDPOINT (sustituye a la dirección S3; pruebas)
# Tras llamar a r2_init quedan definidos: $B (bucket), $EP (dirección S3 que responde) y la función s3 (aws … --endpoint-url "$EP").
# Necesita $W (carpeta temporal) y las funciones log/die del guion que lo carga.

r2_init() {
  local v c
  for v in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BACKUP_BUCKET; do
    [ -n "${!v:-}" ] || die "Falta $v (datos de acceso al bucket privado de R2)."
  done
  [ -n "${R2_ACCOUNT_ID:-}" ] || [ -n "${R2_ENDPOINT:-}" ] || die "Falta R2_ACCOUNT_ID (el ID de cuenta de Cloudflare)."
  command -v aws >/dev/null || die "No se encuentra «aws» (AWS CLI), necesario para hablar con R2."
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION="auto"
  export AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED AWS_RESPONSE_CHECKSUM_VALIDATION=WHEN_REQUIRED   # R2 no admite las sumas de verificación nuevas de aws-cli ≥ 2.23
  export AWS_PAGER=""
  B="$R2_BACKUP_BUCKET"
  # Dirección S3 del bucket: los buckets con jurisdicción UE usan <cuenta>.eu.r2.cloudflarestorage.com. Si no se indica, se prueban las dos.
  local cands
  if [ -n "${R2_ENDPOINT:-}" ]; then cands="$R2_ENDPOINT"
  else
    case "${R2_JURISDICTION:-auto}" in
      eu)       cands="https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com";;
      standard) cands="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com";;
      *)        cands="https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com";;
    esac
  fi
  EP=""
  for c in $cands; do
    if aws s3api head-bucket --bucket "$B" --endpoint-url "$c" >/dev/null 2>"$W/r2.err"; then EP="$c"; break; fi
  done
  if [ -z "$EP" ]; then
    sed -E 's/(AKIA|[A-Za-z0-9]{20,})[A-Za-z0-9\/+=]*/***/g' "$W/r2.err" >&2 || true
    die "No se pudo acceder al bucket «$B» de R2 (ID de cuenta, claves, nombre del bucket o permisos del token incorrectos; o el token no incluye ese bucket)."
  fi
}

s3() { aws "$@" --endpoint-url "$EP"; }

# Claves de copias del bucket (una por línea, ordenadas de la más antigua a la más reciente: los nombres llevan la fecha en UTC)
r2_list_backups() {
  local raw
  raw="$(s3 s3api list-objects-v2 --bucket "$B" --prefix "$PREFIX" --query "Contents[?ends_with(Key, '.tar') || ends_with(Key, '.tar.gpg')].Key" --output text 2>/dev/null || true)"
  printf '%s' "$raw" | tr '\t' '\n' | grep -v -x -e None -e '' | sort || true
}
