-- v42.50 · Restaurar una copia desde el panel (solo la cuenta «admin») · UN SOLO PASO
-- Supabase → SQL Editor → pega TODO este archivo → Run. Debe salir UNA fila: caracteres = 5301 · huella = 56b32178e39a30d673eccb96a87c1a4f
-- (si el pegado se cortara, Postgres dice «unterminated dollar-quoted string» y no instala nada). Cópiame esa fila.
-- Avisos del editor («destructiva» por el create or replace, «tabla sin RLS»): son falsos, continúa. Repetible. No cambia ningún dato por sí
-- sola: solo actúa cuando la pestaña «Restaurar» la llama. La barrera está DENTRO (como admin_backup): solo la cuenta «admin»; el resto recibe 42501.
-- Solo escribe en tablas de «public», nunca en «auth». Cada llamada es una transacción; un lote que falla se reintenta fila a fila.
-- DESHACER (la web sigue igual): drop function if exists public.admin_restore(text, jsonb);

create or replace function public.admin_restore(op text, arg jsonb default '{}'::jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_t    text    := arg->>'t';
  v_rows jsonb   := coalesce(arg->'rows', '[]'::jsonb);
  v_oid  oid;
  v_pka  text[];
  v_cola text[];
  v_cols text;
  v_cmp  text;
  v_set  text;
  v_sql  text;
  v_ids  uuid[];
  v_n    int := 0;
  v_ins  int := 0;
  v_upd  int := 0;
  v_i    int;
  v_u    int;
  v_fail int := 0;
  v_err  jsonb := '[]'::jsonb;
  v_o    jsonb;
begin
  if auth.uid() is null or not exists (
       select 1 from public.authors a where a.id = auth.uid() and a.username = 'admin' and a.role = 'admin') then
    raise exception 'Solo la cuenta administradora principal puede restaurar copias.' using errcode = '42501';
  end if;

  if op = 'probe' then      -- {works:[ids], panels:[ids], detail:[ids de obras]} → los que existen + todas las hojas de las obras de «detail»
    return jsonb_build_object(
      'works',  coalesce((select jsonb_agg(w.id) from public.works w
                           where w.id = any (array(select jsonb_array_elements_text(coalesce(arg->'works', '[]'::jsonb)))::uuid[])), '[]'::jsonb),
      'panels', coalesce((select jsonb_agg(p.id) from public.panels p
                           where p.id = any (array(select jsonb_array_elements_text(coalesce(arg->'panels', '[]'::jsonb)))::uuid[])), '[]'::jsonb),
      'detail', coalesce((select jsonb_object_agg(d.w, d.ps)
                            from (select p.work_id::text as w, jsonb_agg(p.id) as ps from public.panels p
                                   where p.work_id = any (array(select jsonb_array_elements_text(coalesce(arg->'detail', '[]'::jsonb)))::uuid[])
                                   group by p.work_id) d), '{}'::jsonb))::text;
  end if;

  if op = 'wipe' then       -- {panels:[ids], dry} → capas, textos y hojas (en este orden; sin fiarse de la cascada)
    v_ids := array(select jsonb_array_elements_text(coalesce(arg->'panels', '[]'::jsonb)))::uuid[];
    if coalesce((arg->>'dry')::boolean, false) then
      return jsonb_build_object(
        'layers', (select count(*) from public.panel_layers where panel_id = any (v_ids)),
        'texts',  (select count(*) from public.panel_texts  where panel_id = any (v_ids)),
        'panels', (select count(*) from public.panels       where id = any (v_ids)))::text;
    end if;
    delete from public.panel_layers where panel_id = any (v_ids); get diagnostics v_i = row_count;
    delete from public.panel_texts  where panel_id = any (v_ids); get diagnostics v_u = row_count;
    delete from public.panels       where id = any (v_ids);       get diagnostics v_n = row_count;
    return jsonb_build_object('layers', v_i, 'texts', v_u, 'panels', v_n)::text;
  end if;

  if op = 'nav' then        -- {rows:[{id, nav}]} → solo donde ahora es NULL
    update public.panels p set nav = r.nav
      from jsonb_to_recordset(v_rows) as r(id uuid, nav jsonb)
     where p.id = r.id and p.nav is null and r.nav is not null;
    get diagnostics v_n = row_count;
    return jsonb_build_object('n', v_n)::text;
  end if;

  if op = 'rows' then       -- {t, mode:'add'|'upsert', dry, rows:[…]}
    select c.oid into v_oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_t and c.relkind = 'r'
       and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e');
    if v_oid is null then raise exception 'Tabla no admitida: %', coalesce(v_t, '(vacío)') using errcode = '22023'; end if;
    select array_agg(a.attname::text order by k.o) into v_pka
      from pg_constraint c
      cross join lateral unnest(c.conkey) with ordinality as k(n, o)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n
     where c.conrelid = v_oid and c.contype = 'p';
    -- columnas que se escriben: las no generadas (las calcula la base) y presentes en TODAS las filas (a las que falten, su valor por defecto)
    select array_agg(a.attname::text order by a.attnum) into v_cola from pg_attribute a
     where a.attrelid = v_oid and a.attnum > 0 and not a.attisdropped and a.attgenerated::text = ''
       and not exists (select 1 from jsonb_array_elements(v_rows) e where (e.value -> a.attname::text) is null);
    if v_pka is null or not (v_pka <@ coalesce(v_cola, '{}')) then
      raise exception 'La tabla % no tiene clave primaria o las filas no la traen.', v_t using errcode = '22023';
    end if;
    select string_agg(format('x.%1$I = r.%1$I', k), ' and ') into v_cmp from unnest(v_pka) k;

    if coalesce((arg->>'dry')::boolean, false) then      -- ensayo: cuántas de estas filas ya existen (misma clave); no se escribe nada
      execute format('select count(*)::int from jsonb_populate_recordset(null::public.%1$I, $1) r where exists (select 1 from public.%1$I x where %2$s)', v_t, v_cmp)
         into v_n using v_rows;
      return jsonb_build_object('n', jsonb_array_length(v_rows), 'ex', v_n)::text;
    end if;

    select string_agg(format('%I', c), ', ' order by o) into v_cols from unnest(v_cola) with ordinality as u(c, o);
    select string_agg(format('%1$I = excluded.%1$I', c), ', ' order by o) into v_set from unnest(v_cola) with ordinality as u(c, o) where c <> all (v_pka);
    if arg->>'mode' = 'upsert' and v_set is not null then
      v_sql := format('with i as (insert into public.%1$I (%2$s) overriding system value select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (%3$s) do update set %4$s returning (xmax = 0) as ins) select (count(*) filter (where ins))::int, (count(*) filter (where not ins))::int from i',
                      v_t, v_cols, (select string_agg(format('%I', k), ', ') from unnest(v_pka) k), v_set);
    else
      v_sql := format('with i as (insert into public.%1$I (%2$s) overriding system value select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict do nothing returning 1) select count(*)::int, 0 from i', v_t, v_cols);
    end if;
    begin
      execute v_sql into v_ins, v_upd using v_rows;
    exception when others then     -- el lote entero se deshizo: se prueba fila a fila para saber cuáles fallan (query_canceled no entra aquí: sube tal cual)
      v_ins := 0; v_upd := 0;
      for v_o in select value from jsonb_array_elements(v_rows) loop
        begin
          execute v_sql into v_i, v_u using jsonb_build_array(v_o);
          v_ins := v_ins + v_i; v_upd := v_upd + v_u;
        exception when others then
          v_fail := v_fail + 1;
          if jsonb_array_length(v_err) < 5 then v_err := v_err || jsonb_build_object('id', v_o->>'id', 'e', left(sqlerrm, 200)); end if;
        end;
      end loop;
    end;
    return jsonb_build_object('n', jsonb_array_length(v_rows), 'ins', v_ins, 'upd', v_upd, 'fail', v_fail, 'err', v_err)::text;
  end if;

  raise exception 'Operación desconocida: %', coalesce(op, '(vacía)') using errcode = '22023';
end
$fn$;

revoke all on function public.admin_restore(text, jsonb) from public, anon;
grant execute on function public.admin_restore(text, jsonb) to authenticated;
select pg_notify('pgrst', 'reload schema');

-- Comprobación de que se ha copiado entera: UNA fila con estos dos valores
select length(regexp_replace(prosrc, '\s', '', 'g')) as caracteres, md5(regexp_replace(prosrc, '\s', '', 'g')) as huella
  from pg_proc where proname = 'admin_restore' and pronamespace = 'public'::regnamespace;
