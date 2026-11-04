-- ====================================================================================================================
-- v42.48 · Mover a R2 las capas pesadas · PASO 2 de 2 — comprobación (solo LEE; no cambia nada)
-- Supabase → SQL Editor → New query → pega TODO → Run. COPIA AQUÍ EL RESULTADO (una tabla pequeña).
-- Se hace pasar por la cuenta «admin» y cuenta, por autor, las capas de ≥ 32 KB que siguen dentro de Supabase.
-- Si da el error «Solo la cuenta administradora principal…», dímelo. Requiere haber ejecutado el paso 1.
-- ====================================================================================================================

with s as (
  select set_config('request.jwt.claims',
                    json_build_object('sub', (select id from public.authors where username = 'admin' and role = 'admin'), 'role', 'authenticated')::text,
                    true) as v
)
select case when grouping(r_author) = 1 then 'TOTAL' else coalesce(r_author, '(sin autor)') end as autor,
       case when grouping(r_published) = 1 then '' when r_published then 'publicada' else 'borrador' end as estado,
       count(*) as capas,
       count(distinct r_work) as obras,
       round(sum(r_bytes) / 1048576.0, 1) as mb
  from s, public.admin_xr_scan(case when s.v is null then 0 else 32768 end, false)
 group by grouping sets ((r_author, r_published), ())
 order by grouping(r_author), mb desc;
