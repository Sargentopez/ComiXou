-- ====================================================================================================================
-- v42.48 · Mover a R2 las capas pesadas que ya están en Supabase · PASO 1 de 2 — instalar (2 funciones + permisos)
-- Supabase → SQL Editor → New query → pega TODO → Run. Debe decir «Success. No rows returned». Cópiame el resultado.
-- · Si avisa de consulta «destructiva» (por el create or replace) o de «tabla sin RLS»: son falsos avisos, no borra ni crea tablas.
-- · Nada cambia hasta que la pestaña «R2» del panel las llame. Se puede repetir sin problema.
-- · La barrera de seguridad está DENTRO de cada función: solo deja pasar a la cuenta «admin» (ni siquiera a «Tutor»).
-- · admin_xr_scan(p_min, p_ref): SOLO LEE. Lista las capas de ≥ p_min bytes que siguen en Supabase (y, con p_ref, las que ya son
--   referencia a R2). octet_length no descomprime nada: milisegundos aunque haya cientos de MB.
-- · admin_xr_swap(p_id, p_sha): cambia UNA capa por la referencia «r2:<huella>:<bytes>», pero SOLO si la huella SHA-256 del texto
--   que hay ahora en la base es p_sha (la del archivo que la web acaba de dejar en R2). Restaura panels.nav, que el disparador borra.
-- DESHACER las funciones: drop function if exists public.admin_xr_scan(int, boolean); drop function if exists public.admin_xr_swap(uuid, text);
-- ====================================================================================================================

create or replace function public.admin_xr_scan(p_min int default 32768, p_ref boolean default false)
returns table (
  r_layer uuid, r_panel uuid, r_work uuid, r_panel_order int, r_layer_order int, r_type text,
  r_bytes bigint, r_ref text, r_title text, r_author text, r_published boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is null or not exists (
       select 1 from public.authors a where a.id = auth.uid() and a.username = 'admin' and a.role = 'admin') then
    raise exception 'Solo la cuenta administradora principal puede usar esta función' using errcode = '42501';
  end if;
  return query
    select l.id, l.panel_id, p.work_id, p.panel_order, l.layer_order, l.layer_type,
           octet_length(l.layer_data)::bigint,
           case when octet_length(l.layer_data) < 128 and left(l.layer_data, 3) = 'r2:' then l.layer_data end,
           w.title, a.username, w.published
      from public.panel_layers l
      join public.panels p on p.id = l.panel_id
      left join public.works w on w.id = p.work_id
      left join public.authors a on a.id = w.author_id
     where octet_length(l.layer_data) >= greatest(coalesce(p_min, 32768), 1024)
        or (coalesce(p_ref, false)
            and case when octet_length(l.layer_data) < 128 then left(l.layer_data, 3) = 'r2:' else false end)
     order by octet_length(l.layer_data) desc, l.id;
end
$fn$;

create or replace function public.admin_xr_swap(p_id uuid, p_sha text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_panel uuid;
  v_data  text;
  v_len   bigint;
  v_sha   text;
  v_nav   jsonb;
  v_n     int;
begin
  if auth.uid() is null or not exists (
       select 1 from public.authors a where a.id = auth.uid() and a.username = 'admin' and a.role = 'admin') then
    raise exception 'Solo la cuenta administradora principal puede usar esta función' using errcode = '42501';
  end if;
  if p_sha is null or p_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'huella no válida' using errcode = '22023';
  end if;
  select l.panel_id, l.layer_data into v_panel, v_data
    from public.panel_layers l where l.id = p_id for update;
  if not found then return 'gone'; end if;                                  -- la capa ya no existe (se borró al guardar la obra)
  if v_data is null then return 'empty'; end if;
  v_len := octet_length(v_data);
  if v_len < 128 and v_data ~ '^r2:[0-9a-f]{64}:[0-9]+$' then return 'already'; end if;   -- ya es una referencia
  if v_len < 4096 then return 'small'; end if;                              -- no tiene sentido sacar de la base una capa tan pequeña
  v_sha := encode(sha256(convert_to(v_data, 'UTF8')), 'hex');
  if v_sha <> p_sha then return 'changed'; end if;                          -- la capa ya no es la que se subió a R2: no se toca
  select p.nav into v_nav from public.panels p where p.id = v_panel for update;
  update public.panel_layers set layer_data = 'r2:' || v_sha || ':' || v_len::text where id = p_id;   -- el disparador pone nav = null…
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'la capa no se pudo actualizar (filas: %)', v_n using errcode = 'P0001'; end if;
  if v_nav is not null then
    update public.panels set nav = v_nav where id = v_panel and nav is null;    -- …y aquí se restaura (el contenido de la hoja no ha cambiado)
  end if;
  return 'ok';
end
$fn$;

do $$
begin
  revoke all on function public.admin_xr_scan(int, boolean) from public, anon;
  grant execute on function public.admin_xr_scan(int, boolean) to authenticated;
  revoke all on function public.admin_xr_swap(uuid, text) from public, anon;
  grant execute on function public.admin_xr_swap(uuid, text) to authenticated;
  perform pg_notify('pgrst', 'reload schema');      -- que la API las vea ya, sin esperar
end $$;
-- fin del paso 1
