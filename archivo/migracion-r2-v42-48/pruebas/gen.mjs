// Genera datos de prueba (con Unicode multibyte) y las huellas SHA-256 calculadas en JS, igual que hace la web.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const sha = s => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const mk = (n, seed) => { let body = ''; let i = 0; while (body.length < n) body += 'AbC' + (i++ % 97) + '😀é+/'; return '{"type":"stroke","seed":"' + seed + '","d":"' + body + '"}'; };
const L1 = mk(40000, 'L1'), L2 = mk(2000, 'L2'), L3 = mk(300000, 'L3'), L5 = mk(50000, 'L5'), L6 = mk(6000, 'L6');
const ids = { L1: '00000000-0000-4000-8000-0000000000a1', L2: '00000000-0000-4000-8000-0000000000a2', L3: '00000000-0000-4000-8000-0000000000a3', L4: '00000000-0000-4000-8000-0000000000a4', L5: '00000000-0000-4000-8000-0000000000a5', L6: '00000000-0000-4000-8000-0000000000a6' };
const ptr4 = 'r2:' + sha('x') + ':1234';
const q = s => "$q$" + s + "$q$";
const sql = `
truncate public.panel_layers, public.panels, public.works, public.authors cascade;
insert into public.authors (id, username, role) values
 ('00000000-0000-4000-8000-000000000001','admin','admin'),
 ('00000000-0000-4000-8000-000000000002','Tutor','admin'),
 ('00000000-0000-4000-8000-000000000003','user1','user');
insert into public.works (id, author_id, title, published) values
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000001','Obra publicada',true),
 ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-000000000003','Borrador de user1',false);
insert into public.panels (id, work_id, panel_order, nav) values
 ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000b1',0,'{"x":1}'),
 ('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000b1',1,'{"y":2}'),
 ('00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000b2',0,null);
alter table public.panel_layers disable trigger panel_layers_nav_invalidate;
insert into public.panel_layers (id, panel_id, layer_order, layer_type, layer_data) values
 ('${ids.L1}','00000000-0000-4000-8000-0000000000c1',0,'stroke',${q(L1)}),
 ('${ids.L2}','00000000-0000-4000-8000-0000000000c1',1,'text',${q(L2)}),
 ('${ids.L3}','00000000-0000-4000-8000-0000000000c2',0,'image',${q(L3)}),
 ('${ids.L4}','00000000-0000-4000-8000-0000000000c2',1,'fill','${ptr4}'),
 ('${ids.L5}','00000000-0000-4000-8000-0000000000c3',0,'image',${q(L5)}),
 ('${ids.L6}','00000000-0000-4000-8000-0000000000c3',1,'stroke',${q(L6)});
alter table public.panel_layers enable trigger panel_layers_nav_invalidate;
`;
writeFileSync('data.sql', sql);
writeFileSync('expect.json', JSON.stringify({ ids, sha: { L1: sha(L1), L2: sha(L2), L3: sha(L3), L5: sha(L5), L6: sha(L6) }, bytes: { L1: Buffer.byteLength(L1), L3: Buffer.byteLength(L3), L5: Buffer.byteLength(L5), L6: Buffer.byteLength(L6) }, chars: { L3: L3.length } }, null, 1));
console.log('ok', Buffer.byteLength(L3), L3.length);
