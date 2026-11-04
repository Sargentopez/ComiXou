#!/bin/bash
# Pruebas de las funciones SQL de la v42.48 en un PostgreSQL 16 local (esquema imitando Supabase)
DB=t4247
ADMIN=00000000-0000-4000-8000-000000000001
TUTOR=00000000-0000-4000-8000-000000000002
USER1=00000000-0000-4000-8000-000000000003
pass=0; fail=0
ok(){ if [ "$1" = "1" ]; then echo "  ✓ $2"; pass=$((pass+1)); else echo "  ✗ $2"; fail=$((fail+1)); fi; }
q(){ su postgres -c "psql -d $DB -v ON_ERROR_STOP=0 -X -A -t -F '|' -c \"$1\"" 2>&1; }
# $1 = uid, $2 = SQL
as(){ su postgres -c "psql -d $DB -X -A -t -F '|' <<'SQL' 2>&1
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, false);
$2
SQL"; }
J=$(cat expect.json)
sha(){ echo "$J" | python3 -c "import sys,json; print(json.load(sys.stdin)['sha']['$1'])"; }
bytes(){ echo "$J" | python3 -c "import sys,json; print(json.load(sys.stdin)['bytes']['$1'])"; }
ID(){ echo "$J" | python3 -c "import sys,json; print(json.load(sys.stdin)['ids']['$1'])"; }

echo "== 1. scan como admin (sin referencias)"
out=$(as $ADMIN "select r_layer, r_bytes, r_type, r_ref is null as inline, r_title, r_author, r_published from public.admin_xr_scan();")
echo "$out" | sed 's/^/     /'
n=$(echo "$out" | grep -c '|')
ok $([ "$n" = "2" ] && echo 1 || echo 0) "devuelve 2 capas pesadas (≥32 KB): la L3 y la L5 (la L1 pesa 52 KB en bytes → son 3)" 
