import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { Client } = require('/tmp/t4250/node_modules/pg');
const c = new Client({ host: '/var/run/postgresql', user: 'root', database: 't4250' });
await c.connect();
for (const f of ['/tmp/t4250/mock_e2e.sql', '/home/claude/w/sql/v42_29_backup_admin_1_funcion.sql', '/home/claude/w/sql/v42_29_backup_admin_2_permisos.sql', '/home/claude/w/sql/v42_50_restaurar_admin_1_funcion.sql']) {
  try { const r = await c.query(readFileSync(f, 'utf8')); const last = Array.isArray(r) ? r[r.length - 1] : r; console.log('OK', f.split('/').pop(), last && last.rows && last.rows[0] ? JSON.stringify(last.rows[0]) : ''); }
  catch (e) { console.log('FALLO', f.split('/').pop(), e.message); }
}
await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: '00000000-0000-4000-8000-000000000001', role: 'authenticated' })]);
try { const r = await c.query("select public.admin_backup('plan', '{}'::jsonb) as r"); const p = JSON.parse(JSON.parse(JSON.stringify(r.rows[0].r))); console.log('plan: tablas', p.tables.map(t => t.s + '.' + t.n).join(', '), 'unsupported', JSON.stringify(p.unsupported)); } catch (e) { console.log('plan FALLO', e.message); }
await c.query('rollback'); await c.end();
