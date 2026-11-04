#!/bin/bash
# Prepara la base de pruebas t4250 para sql_test.mjs: esquema que imita Supabase (mock50.sql) + la función de la v42.50.
# Uso:  bash prep_sql_test.sh && node sql_test.mjs        (PostgreSQL 16 local; la base t4250 ya creada; PROJ = carpeta del proyecto)
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
PROJ=${PROJ:-/home/claude/w}
psql -q -v ON_ERROR_STOP=1 -d t4250 -f "$DIR/mock50.sql" -f "$PROJ/sql/v42_50_restaurar_admin_1_funcion.sql" > /dev/null
echo "base t4250 lista para sql_test.mjs"
