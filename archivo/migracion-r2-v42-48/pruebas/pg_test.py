#!/usr/bin/env python3
# Pruebas de admin_xr_scan / admin_xr_swap en PostgreSQL 16 local (esquema que imita Supabase)
import json, os, subprocess, sys, threading, time
DB = 't4247'
ADMIN = '00000000-0000-4000-8000-000000000001'
TUTOR = '00000000-0000-4000-8000-000000000002'
USER1 = '00000000-0000-4000-8000-000000000003'
E = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'expect.json')))
IDS, SHA, BYTES = E['ids'], E['sha'], E['bytes']
passed = failed = 0
def ok(c, m):
    global passed, failed
    print(('  ✓ ' if c else '  ✗ ') + m)
    if c: passed += 1
    else: failed += 1
def psql(sql, uid=None, timeout=60):
    pre = ''
    if uid is not None:
        pre = "set role authenticated;\nselect set_config('request.jwt.claims', json_build_object('sub','%s','role','authenticated')::text, false) \\g /dev/null\n" % uid
    p = subprocess.run(['su', 'postgres', '-c', "psql -d %s -X -A -t -F '|' -v ON_ERROR_STOP=0" % DB], input=pre + sql, capture_output=True, text=True, timeout=timeout)
    return (p.stdout + p.stderr).strip()
def reset():
    subprocess.run(['su', 'postgres', '-c', ('psql -q -d %s -v ON_ERROR_STOP=1 -f ' % DB) + os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data.sql')], check=True, capture_output=True)

reset()
print('== 1. admin_xr_scan')
o = psql("select r_layer, r_bytes, r_type, r_ref is null, r_title, r_author, r_published from public.admin_xr_scan();", ADMIN)
rows = [l.split('|') for l in o.splitlines() if l.count('|') == 6]
ok([r[0] for r in rows] == [IDS['L3'], IDS['L5'], IDS['L1']], 'sin referencias: L3, L5, L1 (de mayor a menor) → ' + ', '.join(r[0][-2:] + ':' + r[1] for r in rows))
ok(rows and int(rows[0][1]) == BYTES['L3'], 'los bytes son los UTF-8 reales de la capa (L3 = %s, JS = %s) y no los caracteres' % (rows[0][1] if rows else '?', BYTES['L3']))
ok(rows and rows[0][4] == 'Obra publicada' and rows[0][5] == 'admin' and rows[0][6] == 't', 'trae título, autor y si está publicada')
ok(rows and rows[1][4] == 'Borrador de user1' and rows[1][5] == 'user1' and rows[1][6] == 'f', 'incluye las obras de otras cuentas (borrador de user1)')
o = psql("select r_layer, r_bytes, r_ref from public.admin_xr_scan(32768, true) order by r_bytes;", ADMIN)
rows = [l.split('|') for l in o.splitlines() if l.count('|') == 2]
refs = [r for r in rows if r[2]]
ok(len(rows) == 4 and len(refs) == 1 and refs[0][0] == IDS['L4'], 'con p_ref = true añade la capa que ya es referencia (L4) y solo esa → ' + str(len(rows)) + ' filas')
o = psql("select count(*) from public.admin_xr_scan(1000000);", ADMIN)
ok(o.splitlines()[-1] == '0', 'con p_min = 1.000.000 no sale ninguna')
o = psql("select count(*) from public.admin_xr_scan(1);", ADMIN)
ok(o.splitlines()[-1] == '5', 'p_min tiene un suelo de 1 KB: con p_min = 1 salen las 5 capas ≥ 1 KB (L1, L2, L3, L5, L6), nunca las minúsculas ni la referencia → ' + o.splitlines()[-1])
for nombre, uid in (('Tutor (otro administrador)', TUTOR), ('user1 (usuario normal)', USER1)):
    o = psql("select count(*) from public.admin_xr_scan();", uid)
    ok('puede usar esta función' in o and '42501' in o or 'Solo la cuenta administradora principal' in o, nombre + ' recibe «Solo la cuenta administradora principal…»')
o = psql("select count(*) from public.admin_xr_scan();", None)
ok('Solo la cuenta administradora principal' in o, 'sin sesión (auth.uid() nulo, como el SQL Editor sin suplantar) también se rechaza')

print('== 2. admin_xr_swap: casos')
def swap(lid, sha, uid=ADMIN): return psql("select public.admin_xr_swap('%s', '%s');" % (lid, sha), uid).splitlines()[-1]
ok(swap(IDS['L1'], SHA['L1']) == 'ok', 'L1 (52 KB, huella correcta) → ok')
o = psql("select layer_data from public.panel_layers where id='%s'" % IDS['L1'])
exp = 'r2:%s:%d' % (SHA['L1'], BYTES['L1'])
ok(o.strip() == exp, 'la fila queda como %s… (huella de JS, bytes UTF-8) → %s' % (exp[:20], o.strip()[:90]))
ok(len(exp) == 3 + 64 + 1 + len(str(BYTES['L1'])) and __import__('re').fullmatch(r'r2:[0-9a-f]{64}:\d+', o.strip()) is not None, 'y cumple el formato que lee la web (/^r2:[0-9a-f]{64}:\\d+$/)')
nav = psql("select nav from public.panels where id='00000000-0000-4000-8000-0000000000c1'")
ok(nav.strip() == '{"x": 1}', 'el resumen de navegación de la hoja se conserva tras el disparador → ' + nav.strip())
ok(swap(IDS['L1'], SHA['L1']) == 'already', 'repetirlo → already (ya es una referencia)')
ok(swap(IDS['L3'], SHA['L5']) == 'changed', 'L3 con la huella de otra capa → changed, sin tocar nada')
o = psql("select left(layer_data, 12), octet_length(layer_data) from public.panel_layers where id='%s'" % IDS['L3'])
ok(o.strip() == '{"type":"str|%d' % BYTES['L3'], 'L3 sigue intacta tras el changed')
ok(swap('00000000-0000-4000-8000-0000000000ff', SHA['L3']) == 'gone', 'capa inexistente → gone')
ok(swap(IDS['L2'], SHA['L2']) == 'small', 'L2 (2 KB) → small (no se saca de la base)')
ok(swap(IDS['L4'], SHA['L1']) == 'already', 'una referencia previa (L4) → already, aunque la huella no coincida')
o = psql("select public.admin_xr_swap('%s', 'no-es-una-huella');" % IDS['L3'], ADMIN)
ok('huella no válida' in o, 'huella con formato inválido → error «huella no válida»')
o = psql("select public.admin_xr_swap('%s', '%s');" % (IDS['L3'], SHA['L3'].upper()), ADMIN)
ok('huella no válida' in o, 'huella en mayúsculas → inválida (la web siempre manda minúsculas)')
for nombre, uid in (('Tutor', TUTOR), ('user1', USER1)):
    o = psql("select public.admin_xr_swap('%s', '%s');" % (IDS['L3'], SHA['L3']), uid)
    ok('Solo la cuenta administradora principal' in o, nombre + ' no puede cambiar capas')
o = psql("select octet_length(layer_data) from public.panel_layers where id='%s'" % IDS['L3'])
ok(o.strip() == str(BYTES['L3']), 'y la L3 sigue entera después de esos intentos (%s bytes)' % o.strip())

print('== 3. nav: hoja con nav = null no se inventa nada; hoja con nav se restaura')
ok(swap(IDS['L3'], SHA['L3']) == 'ok', 'L3 (390 KB, con emoji y acentos) → ok')
nav = psql("select nav from public.panels where id='00000000-0000-4000-8000-0000000000c2'")
ok(nav.strip() == '{"y": 2}', 'hoja 2: nav conservado → ' + nav.strip())
ok(swap(IDS['L5'], SHA['L5']) == 'ok', 'L5 (hoja sin nav) → ok')
nav = psql("select coalesce(nav::text,'NULL') from public.panels where id='00000000-0000-4000-8000-0000000000c3'")
ok(nav.strip() == 'NULL', 'hoja 3: nav sigue siendo null')
# sin la restauración, el disparador sí lo anula: lo comprobamos con un UPDATE normal (lo que hace cualquier guardado)
psql("update public.panel_layers set layer_data = layer_data || ' ' where id='%s'" % IDS['L6'])
nav3 = psql("select coalesce(nav::text,'NULL') from public.panels where id='00000000-0000-4000-8000-0000000000c3'")
psql("update public.panels set nav = '{\"z\":3}' where id='00000000-0000-4000-8000-0000000000c3'")
psql("update public.panel_layers set layer_data = layer_data || ' ' where id='%s'" % IDS['L6'])
nav3b = psql("select coalesce(nav::text,'NULL') from public.panels where id='00000000-0000-4000-8000-0000000000c3'")
ok(nav3b.strip() == 'NULL', 'control: un UPDATE normal de una capa SÍ anula el nav (el disparador funciona), por eso hace falta restaurarlo')

print('== 4. concurrencia: la capa cambia entre la comprobación y el cambio')
reset()
# Sesión A: abre una transacción, cambia la capa L3 y la mantiene 3 s antes de confirmar. La sesión B llama a swap con la huella antigua.
a_sql = "begin; update public.panel_layers set layer_data = layer_data || 'X' where id='%s'; select pg_sleep(3); commit;" % IDS['L3']
res = {}
def sesA(): res['a'] = psql(a_sql)
t = threading.Thread(target=sesA); t.start(); time.sleep(1)
t0 = time.time()
r = swap(IDS['L3'], SHA['L3'])
dt = time.time() - t0
t.join()
ok(r == 'changed', 'swap con la huella antigua, mientras otra transacción cambia la capa → changed (espera su turno por el bloqueo) → ' + r)
ok(dt > 1.5, 'esperó al bloqueo de fila (%.1f s) en vez de pisar el cambio' % dt)
o = psql("select right(layer_data, 3), octet_length(layer_data) from public.panel_layers where id='%s'" % IDS['L3'])
ok(o.strip().startswith('"}X|'), 'el cambio de la otra transacción se conserva (la capa acaba en «"}X»)')

print('== 5. borrado concurrente: la capa desaparece mientras se espera')
reset()
a_sql = "begin; delete from public.panel_layers where id='%s'; select pg_sleep(2.5); commit;" % IDS['L3']
t = threading.Thread(target=lambda: res.__setitem__('a', psql(a_sql))); t.start(); time.sleep(1)
r = swap(IDS['L3'], SHA['L3'])
t.join()
ok(r == 'gone', 'capa borrada por un guardado mientras tanto → gone → ' + r)

print('== 6. rendimiento de scan con 3000 capas (solo octet_length)')
reset()
psql("insert into public.panel_layers (panel_id, layer_order, layer_type, layer_data) select '00000000-0000-4000-8000-0000000000c1', 100 + g, 'stroke', repeat('{\"a\":\"' || md5(g::text) || '\"}', 100 + (g % 700)) from generate_series(1, 3000) g;")
t0 = time.time()
o = psql("select count(*), sum(r_bytes) from public.admin_xr_scan();", ADMIN)
dt = time.time() - t0
print('     ', o.splitlines()[-1], '%.0f ms' % (dt * 1000))
ok(dt < 3, 'el scan de 3000 filas tarda %.0f ms' % (dt * 1000))
print('\nRESULTADO: %d ✓  %d ✗' % (passed, failed))
sys.exit(1 if failed else 0)
