-- =====================================================================================================================
-- v42.29 · Copia de seguridad descargable (solo la cuenta «admin») · PASO 1 de 3 — la función
--
-- Supabase → SQL Editor → New query → pega TODO este archivo → Run. Copia aquí el resultado (una fila con la huella; ver más abajo).
-- Si el editor avisa de que la consulta es «destructiva» (por el «create or replace»), es normal: no borra nada; continúa.
-- Si avisa de «Potential issue detected… creates a table without Row Level Security… v_tables», es un FALSO POSITIVO (confunde el
-- «select … into v_tables» de PL/pgSQL con una tabla; aquí no se crea ninguna tabla): pulsa «Run without RLS».
-- Al final hay una comprobación de que la función se ha copiado entera: debe salir UNA fila con caracteres = 25498 y
-- huella = 251652d0851b2d861b99f367a1402e56 (si el pegado se corta, Postgres dice «unterminated dollar-quoted string» y no instala nada).
--
-- Qué hace: crea UNA función, public.admin_backup, que la pestaña «Copia» del panel de administración usa para leer TODAS las tablas de la
-- base (las de «public», sean cuales sean, y las cuentas de «auth») y montar el archivo de copia. Solo LEE: no cambia ninguna tabla ni dato.
--
-- Seguridad: la clave de la web es pública y cualquiera puede registrarse, así que el botón NO es la barrera. La barrera está DENTRO de la
-- función: comprueba en la base de datos que quien llama es la cuenta «admin» (rechaza también a otros administradores, como «Tutor»);
-- cualquier otra cosa recibe «403 · Solo la cuenta administradora principal…». El paso 2 quita además el permiso a «anon» y a «public».
--
-- Se puede repetir sin problema. Se puede ejecutar ya, aunque Supabase siga restringido por cuota (el SQL Editor sigue funcionando; el
-- botón de la web no podrá usarse hasta que se renueve la cuota, ≈ 3-nov-2026).
--
-- Orden: 1 (este) → 2 → 3.  Guía completa: backup/LEEME_COPIA_ADMIN.md
-- DESHACER (solo si hiciera falta; la web sigue igual, solo dejaría de funcionar el botón «Copia»):
--   drop function if exists public.admin_backup(text, jsonb);
-- =====================================================================================================================

create or replace function public.admin_backup(op text, arg jsonb default '{}'::jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_auth    boolean;
  v_tables  jsonb;
  t         jsonb;
  v_out     jsonb;
  v_cnt     bigint;
  v_stmts   jsonb := '[]'::jsonb;
  v_unsup   jsonb := '[]'::jsonb;
  v_tbl     text;
  v_after   text;
  v_limit   int;
  v_maxb    bigint;
  v_pkc     text[];
  v_order   text;
  v_keyex   text;
  v_cmpl    text;
  v_cmpr    text;
  v_al      text;
  v_sql     text;
  v_lines   text;
  v_n       int;
  v_bytes   bigint;
  v_last    text;
  v_more    boolean;
begin
  -- Puerta única: solo la cuenta administradora principal («admin»). Todo lo demás se rechaza aquí, en la base de datos.
  if v_uid is null or not exists (
       select 1 from public.authors a where a.id = v_uid and a.username = 'admin' and a.role = 'admin') then
    raise exception 'Solo la cuenta administradora principal puede descargar la copia de seguridad.' using errcode = '42501';
  end if;

  arg    := coalesce(arg, '{}'::jsonb);
  v_auth := coalesce((arg->>'auth')::boolean, true);

  -- Tablas que entran en la copia: TODAS las de «public» (las conozca o no este código) y, si se pide, las cuentas (auth.users y auth.identities).
  -- Se omiten las que pertenecen a una extensión. Para ir página a página se usa la clave primaria (o, si no hay, una clave única sin nulos; o, en último caso, ctid).
  select coalesce(jsonb_agg(x order by x->>'s', x->>'n'), '[]'::jsonb) into v_tables
  from (
    select jsonb_build_object(
             's', n.nspname, 'n', c.relname, 'oid', c.oid::bigint, 'kind', c.relkind::text, 'unlogged', c.relpersistence = 'u',
             'pk', coalesce(to_jsonb(k.cols), '[]'::jsonb),
             'pkk', case when k.cols is null then 'ctid' when k.isprimary then 'pk' else 'unique' end) as x
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join lateral (
        select i.indisprimary as isprimary,
               array(select a.attname::text
                       from unnest(i.indkey::int2[]) with ordinality as kk(attnum, ord)
                       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = kk.attnum
                      where kk.ord <= i.indnkeyatts
                      order by kk.ord) as cols
          from pg_index i
         where i.indrelid = c.oid and i.indisunique and i.indisvalid and i.indislive
           and i.indpred is null and i.indexprs is null
           and not exists (select 1 from unnest(i.indkey::int2[]) with ordinality as kk(attnum, ord)
                             join pg_attribute a on a.attrelid = i.indrelid and a.attnum = kk.attnum
                            where kk.ord <= i.indnkeyatts and not a.attnotnull)
         order by i.indisprimary desc, i.indexrelid
         limit 1
      ) k on true
     where c.relkind in ('r', 'p') and not c.relispartition
       and ( (n.nspname = 'public'
              and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'))
          or (v_auth and n.nspname = 'auth' and c.relname in ('users', 'identities')) )
  ) q;

  -- ════════════════════════════════════════════════════════════════════════════════════════════════
  -- op = 'plan'  →  qué hay que copiar (tablas, columnas, claves, filas, secuencias)
  -- ════════════════════════════════════════════════════════════════════════════════════════════════
  if op = 'plan' then
    v_out := '[]'::jsonb;
    for t in select x from jsonb_array_elements(v_tables) x loop
      execute format('select count(*) from %I.%I', t->>'s', t->>'n') into v_cnt;
      v_out := v_out || jsonb_build_array(
        t || jsonb_build_object(
          'rows',  v_cnt,
          'bytes', pg_table_size((t->>'oid')::oid),
          'cols',  (select coalesce(jsonb_agg(jsonb_build_object(
                                 'n', a.attname, 't', format_type(a.atttypid, a.atttypmod), 'nn', a.attnotnull,
                                 'g', a.attgenerated::text <> '', 'i', a.attidentity::text) order by a.attnum), '[]'::jsonb)
                      from pg_attribute a
                     where a.attrelid = (t->>'oid')::oid and a.attnum > 0 and not a.attisdropped),
          'fk',    (select coalesce(jsonb_agg(distinct (fn.nspname || '.' || fc.relname)), '[]'::jsonb)
                      from pg_constraint con
                      join pg_class fc on fc.oid = con.confrelid
                      join pg_namespace fn on fn.oid = fc.relnamespace
                     where con.conrelid = (t->>'oid')::oid and con.contype = 'f' and con.confrelid <> con.conrelid)));
    end loop;

    -- Lo que esta copia de estructura NO cubre (si hubiera algo, se avisa; los DATOS sí se copian siempre)
    select coalesce(jsonb_agg(u order by u), '[]'::jsonb) into v_unsup from (
      select 'agregado/ventana ' || p.oid::regprocedure::text as u from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prokind in ('a', 'w')
         and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      union all
      select 'operador ' || o.oid::regoperator::text from pg_operator o
       where o.oprnamespace = 'public'::regnamespace
         and not exists (select 1 from pg_depend d where d.classid = 'pg_operator'::regclass and d.objid = o.oid and d.deptype = 'e')
      union all
      select 'regla ' || r.rulename || ' en ' || c.relname from pg_rewrite r join pg_class c on c.oid = r.ev_class
       where c.relnamespace = 'public'::regnamespace and r.rulename <> '_RETURN'
      union all
      select 'tipo ' || ty.typname || ' (' || case ty.typtype when 'c' then 'compuesto' when 'r' then 'rango' else 'multirango' end || ')'
        from pg_type ty left join pg_class c on c.oid = ty.typrelid
       where ty.typnamespace = 'public'::regnamespace and (ty.typtype in ('r', 'm') or (ty.typtype = 'c' and c.relkind = 'c'))
         and not exists (select 1 from pg_depend d where d.classid = 'pg_type'::regclass and d.objid = ty.oid and d.deptype = 'e')
      union all
      select 'tabla particionada o heredada ' || c.relname from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
         and (c.relkind = 'p' or c.relispartition or exists (select 1 from pg_inherits h where h.inhrelid = c.oid or h.inhparent = c.oid))
      union all
      select 'tabla externa ' || c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'f'
      union all
      select 'disparador de evento ' || evtname from pg_event_trigger
      union all
      select 'ordenación ' || co.collname from pg_collation co
       where co.collnamespace = 'public'::regnamespace
         and not exists (select 1 from pg_depend d where d.classid = 'pg_collation'::regclass and d.objid = co.oid and d.deptype = 'e')
    ) z;

    return jsonb_build_object(
             'fmt', 1, 'now', now(), 'pg', version(), 'user', v_uid, 'auth', v_auth,
             'tables', v_out,
             'seqs', (select coalesce(jsonb_agg(jsonb_build_object('s', s.schemaname, 'n', s.sequencename, 'last', s.last_value::text)
                                                order by s.schemaname, s.sequencename), '[]'::jsonb)
                        from pg_sequences s where s.schemaname = 'public'),
             'unsupported', v_unsup)::text;

  -- ════════════════════════════════════════════════════════════════════════════════════════════════
  -- op = 'page'  →  una página de filas de una tabla (NDJSON: primera línea = cabecera con el cursor)
  -- ════════════════════════════════════════════════════════════════════════════════════════════════
  elsif op = 'page' then
    select x into t from jsonb_array_elements(v_tables) x where x->>'s' = arg->>'s' and x->>'n' = arg->>'n';
    if t is null then
      raise exception 'Esa tabla no forma parte de la copia.' using errcode = '42501';
    end if;
    v_tbl   := format('%I.%I', t->>'s', t->>'n');
    v_after := nullif(arg->>'after', '');
    v_limit := least(greatest(coalesce((arg->>'limit')::int, 200), 1), 2000);
    v_maxb  := least(greatest(coalesce((arg->>'bytes')::bigint, 2000000), 1000), 16000000);
    v_pkc   := array(select jsonb_array_elements_text(t->'pk'));
    -- Alias de la tabla en la consulta: si una columna se llamara igual, «select <alias> from tabla <alias>» daría la COLUMNA y no la fila entera.
    v_al := 'cx_r';
    while exists (select 1 from pg_attribute a where a.attrelid = (t->>'oid')::oid and a.attnum > 0 and not a.attisdropped and a.attname = v_al) loop
      v_al := v_al || '_';
    end loop;
    if cardinality(v_pkc) > 0 then
      v_order := (select string_agg(format('%I.%I', v_al, c), ', ' order by o) from unnest(v_pkc) with ordinality as u(c, o));
      v_keyex := (select 'jsonb_build_object(' || string_agg(format('%L, %I.%I', c, v_al, c), ', ' order by o) || ')::text'
                    from unnest(v_pkc) with ordinality as u(c, o));
      v_cmpl  := '(' || v_order || ')';
      v_cmpr  := '(select ' || (select string_agg(format('r.%I', c), ', ' order by o) from unnest(v_pkc) with ordinality as u(c, o))
                 || ' from jsonb_populate_record(null::' || v_tbl || ', $1::jsonb) r)';
    else
      v_order := format('%I.ctid', v_al);
      v_keyex := format('jsonb_build_object(''ctid'', %I.ctid::text)::text', v_al);
      v_cmpl  := format('%I.ctid', v_al);
      v_cmpr  := '(select (q.j->>''ctid'')::tid from (select $1::jsonb as j) q)';
    end if;
    v_sql := format($q$
      select coalesce(string_agg(l, E'\n' order by rn), ''), count(*)::int, coalesce(sum(octet_length(l)), 0)::bigint,
             (array_agg(k order by rn desc))[1]
        from (
          select '["R",' || line || ']' as l, k, rn, sum(octet_length(line)) over (order by rn) - octet_length(line) as before_b
            from (
              select replace(replace(to_json(w.r)::text, E'\n', ' '), E'\r', ' ') as line, w.k, row_number() over () as rn
                from (select %7$I as r, %1$s as k from %3$s %7$I %4$s order by %2$s limit %5$s) w
            ) p
        ) q
       where rn = 1 or before_b < %6$s
    $q$, v_keyex, v_order, v_tbl,
         case when v_after is null then '' else 'where ' || v_cmpl || ' > ' || v_cmpr end,
         v_limit, v_maxb, v_al);
    if v_after is null then
      execute v_sql into v_lines, v_n, v_bytes, v_last;
    else
      execute v_sql using v_after into v_lines, v_n, v_bytes, v_last;
    end if;
    if v_n > 0 then
      execute format('select exists (select 1 from %1$s %4$I where %2$s > %3$s)', v_tbl, v_cmpl, v_cmpr, v_al) using v_last into v_more;
    else
      v_more := false;
    end if;
    return json_build_object('n', v_n, 'b', v_bytes, 'next', case when v_more then v_last end)::text || E'\n' || v_lines;

  -- ════════════════════════════════════════════════════════════════════════════════════════════════
  -- op = 'schema'  →  guion SQL ordenado para reconstruir la estructura en un proyecto vacío
  -- ════════════════════════════════════════════════════════════════════════════════════════════════
  elsif op = 'schema' then
    -- 1) esquemas de las extensiones
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'schema', 'sql', format('create schema if not exists %I', s.nspname)) order by s.nspname)
        from (select distinct n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
               where e.extname <> 'plpgsql' and n.nspname not in ('public', 'pg_catalog', 'information_schema')) s), '[]'::jsonb);
    -- 2) extensiones
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'ext', 'sql',
               format('do $x$ begin create extension if not exists %I with schema %I; exception when others then raise warning ''No se pudo crear la extensión %%: %%'', %L, sqlerrm; end $x$', e.extname, n.nspname, e.extname))
               order by e.extname)
        from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql'), '[]'::jsonb);
    -- 3) tipos: enumerados y dominios
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'type', 'sql',
               format('do $x$ begin create type %I.%I as enum (%s); exception when duplicate_object then null; end $x$', n.nspname, ty.typname,
                      (select string_agg(quote_literal(en.enumlabel), ', ' order by en.enumsortorder) from pg_enum en where en.enumtypid = ty.oid)))
               order by ty.oid)
        from pg_type ty join pg_namespace n on n.oid = ty.typnamespace
       where n.nspname = 'public' and ty.typtype = 'e'
         and not exists (select 1 from pg_depend d where d.classid = 'pg_type'::regclass and d.objid = ty.oid and d.deptype = 'e')), '[]'::jsonb);
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'type', 'sql',
               format('do $x$ begin create domain %I.%I as %s%s%s%s; exception when duplicate_object then null; end $x$', n.nspname, ty.typname,
                      format_type(ty.typbasetype, ty.typtypmod),
                      case when ty.typdefault is not null then ' default ' || ty.typdefault else '' end,
                      case when ty.typnotnull then ' not null' else '' end,
                      coalesce((select string_agg(' constraint ' || quote_ident(con.conname) || ' ' || pg_get_constraintdef(con.oid, true), '' order by con.conname)
                                  from pg_constraint con where con.contypid = ty.oid), '')))
               order by ty.oid)
        from pg_type ty join pg_namespace n on n.oid = ty.typnamespace
       where n.nspname = 'public' and ty.typtype = 'd'
         and not exists (select 1 from pg_depend d where d.classid = 'pg_type'::regclass and d.objid = ty.oid and d.deptype = 'e')), '[]'::jsonb);
    -- 4) funciones que no dependen del tipo de ninguna tabla (las usan valores por defecto, columnas generadas…)
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'fn1', 'sql', pg_get_functiondef(p.oid) || ';') order by p.oid)
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
         and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
         and not exists (select 1 from pg_depend d
                          where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'n'
                            and (d.refclassid = 'pg_class'::regclass
                                 or (d.refclassid = 'pg_type'::regclass
                                     and exists (select 1 from pg_type ty join pg_class tc on tc.oid = ty.typrelid
                                                  where ty.oid = d.refobjid and tc.relkind in ('r', 'p', 'v', 'm', 'f')))))), '[]'::jsonb);
    -- 5) secuencias independientes y de «serial» (las de «identity» nacen con su columna)
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'seq', 'sql',
               format('create sequence if not exists %I.%I as %s increment by %s minvalue %s maxvalue %s start with %s cache %s %s',
                      n.nspname, c.relname, format_type(s.seqtypid, null), s.seqincrement, s.seqmin, s.seqmax, s.seqstart, s.seqcache,
                      case when s.seqcycle then 'cycle' else 'no cycle' end)) order by c.relname)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_sequence s on s.seqrelid = c.oid
       where n.nspname = 'public' and c.relkind = 'S'
         and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype in ('i', 'e'))), '[]'::jsonb);
    -- 6) tablas
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'table', 'sql',
               format('create %stable if not exists %I.%I (%s)%s',
                      case when c.relpersistence = 'u' then 'unlogged ' else '' end, n.nspname, c.relname,
                      (select string_agg(
                                format('%I %s%s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                                       case when a.attcollation <> ty.typcollation and a.attcollation <> 0
                                            then ' collate ' || (select quote_ident(cn.nspname) || '.' || quote_ident(co.collname)
                                                                   from pg_collation co join pg_namespace cn on cn.oid = co.collnamespace where co.oid = a.attcollation)
                                            else '' end,
                                       case when a.attidentity::text <> '' then ' generated ' || case a.attidentity::text when 'a' then 'always' else 'by default' end || ' as identity'
                                            when a.attgenerated::text <> '' then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid, true) || ') stored'
                                            when ad.adbin is not null then ' default ' || pg_get_expr(ad.adbin, ad.adrelid, true)
                                            else '' end,
                                       case when a.attnotnull then ' not null' else '' end), ', ' order by a.attnum)
                         from pg_attribute a
                         join pg_type ty on ty.oid = a.atttypid
                         left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
                        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
                      case when c.reloptions is not null then ' with (' || array_to_string(c.reloptions, ', ') || ')' else '' end))
               order by c.relname)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relispartition
         and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')), '[]'::jsonb);
    -- 7) funciones que dependen del tipo de fila de una tabla (p. ej. una «columna calculada» de PostgREST)
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'fn2', 'sql', pg_get_functiondef(p.oid) || ';') order by p.oid)
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
         and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
         and exists (select 1 from pg_depend d
                      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'n'
                        and (d.refclassid = 'pg_class'::regclass
                             or (d.refclassid = 'pg_type'::regclass
                                 and exists (select 1 from pg_type ty join pg_class tc on tc.oid = ty.typrelid
                                              where ty.oid = d.refobjid and tc.relkind in ('r', 'p', 'v', 'm', 'f')))))), '[]'::jsonb);
    -- 8) a qué columna pertenece cada secuencia de «serial»
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'seqown', 'sql',
               format('alter sequence %I.%I owned by %I.%I.%I', sn.nspname, sc.relname, tn.nspname, tc.relname, a.attname)) order by sc.relname)
        from pg_depend d
        join pg_class sc on sc.oid = d.objid and sc.relkind = 'S'
        join pg_namespace sn on sn.oid = sc.relnamespace
        join pg_class tc on tc.oid = d.refobjid
        join pg_namespace tn on tn.oid = tc.relnamespace
        join pg_attribute a on a.attrelid = tc.oid and a.attnum = d.refobjsubid
       where d.classid = 'pg_class'::regclass and d.refclassid = 'pg_class'::regclass and d.deptype = 'a' and d.refobjsubid > 0
         and sn.nspname = 'public'), '[]'::jsonb);
    -- 9) claves primarias, únicas, comprobaciones y exclusiones
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'con', 'sql',
               format('do $x$ begin alter table only %I.%I add constraint %I %s; exception when duplicate_object or duplicate_table or invalid_table_definition then null; end $x$',
                      n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid, true)))
               order by c.relname, case con.contype when 'p' then 0 when 'u' then 1 when 'x' then 2 else 3 end, con.conname)
        from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and con.contype in ('p', 'u', 'c', 'x')
         and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')), '[]'::jsonb);
    -- 10) índices de las tablas (los de las claves ya los crean las restricciones)
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'idx', 'sql',
               regexp_replace(pg_get_indexdef(i.indexrelid), '^CREATE (UNIQUE )?INDEX ', 'CREATE \1INDEX IF NOT EXISTS ')) order by ic.relname)
        from pg_index i join pg_class ic on ic.oid = i.indexrelid join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and i.indisvalid
         and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid and k.conrelid = i.indrelid and k.contype in ('p', 'u', 'x'))
         and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')), '[]'::jsonb);
    -- 11) claves ajenas
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'fk', 'sql',
               format('do $x$ begin alter table only %I.%I add constraint %I %s; exception when duplicate_object then null; end $x$',
                      n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid, true)))
               order by c.relname, con.conname)
        from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and con.contype = 'f'
         and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')), '[]'::jsonb);
    -- 12) vistas y vistas materializadas, en orden de dependencia (sin datos: se rellenan al final)
    v_stmts := v_stmts || coalesce((
      with recursive v as (
        select c.oid, c.relkind, n.nspname, c.relname, c.reloptions
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('v', 'm')
           and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
      ), dep as (
        select distinct r.ev_class as view_oid, d.refobjid as ref_oid
          from pg_rewrite r
          join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid and d.refclassid = 'pg_class'::regclass
         where r.ev_class in (select oid from v) and d.refobjid in (select oid from v) and d.refobjid <> r.ev_class
      ), lvl(oid, l) as (
        select v.oid, 0 from v where not exists (select 1 from dep where dep.view_oid = v.oid)
        union all
        select dep.view_oid, lvl.l + 1 from dep join lvl on lvl.oid = dep.ref_oid
      ), ord as (select oid, max(l) as l from lvl group by oid)
      select jsonb_agg(jsonb_build_object('k', 'view', 'sql',
               case when v.relkind = 'v'
                    then format('create or replace view %I.%I%s as %s;', v.nspname, v.relname,
                                case when v.reloptions is not null then ' with (' || array_to_string(v.reloptions, ', ') || ')' else '' end,
                                rtrim(pg_get_viewdef(v.oid, true), E'; \n\t'))
                    else format('create materialized view if not exists %I.%I%s as %s with no data;', v.nspname, v.relname,
                                case when v.reloptions is not null then ' with (' || array_to_string(v.reloptions, ', ') || ')' else '' end,
                                rtrim(pg_get_viewdef(v.oid, true), E'; \n\t')) end)
               order by ord.l, v.relname)
        from v join ord on ord.oid = v.oid), '[]'::jsonb);
    -- 12b) índices de las vistas materializadas
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'idx', 'sql',
               regexp_replace(pg_get_indexdef(i.indexrelid), '^CREATE (UNIQUE )?INDEX ', 'CREATE \1INDEX IF NOT EXISTS ')) order by ic.relname)
        from pg_index i join pg_class ic on ic.oid = i.indexrelid join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'm' and i.indisvalid
         and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')), '[]'::jsonb);
    -- 13) disparadores (los de «public» y los que enganchan funciones de «public» a tablas de otros esquemas, como auth.users)
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'trg', 'sql', s.sql) order by tg.oid, s.ord)
        from pg_trigger tg
        join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = tg.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
        cross join lateral unnest(array[
          format('drop trigger if exists %I on %I.%I', tg.tgname, n.nspname, c.relname),
          pg_get_triggerdef(tg.oid, true),
          case tg.tgenabled::text
            when 'D' then format('alter table %I.%I disable trigger %I', n.nspname, c.relname, tg.tgname)
            when 'R' then format('alter table %I.%I enable replica trigger %I', n.nspname, c.relname, tg.tgname)
            when 'A' then format('alter table %I.%I enable always trigger %I', n.nspname, c.relname, tg.tgname)
          end]) with ordinality as s(sql, ord)
       where not tg.tgisinternal and s.sql is not null and c.relkind in ('r', 'p') and (n.nspname = 'public' or pn.nspname = 'public')), '[]'::jsonb);
    -- 14) seguridad por filas: activación y políticas
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'rls', 'sql', s.sql) order by c.relname, s.ord)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        cross join lateral unnest(array[
          case when c.relrowsecurity then format('alter table %I.%I enable row level security', n.nspname, c.relname) end,
          case when c.relforcerowsecurity then format('alter table %I.%I force row level security', n.nspname, c.relname) end]) with ordinality as s(sql, ord)
       where n.nspname = 'public' and c.relkind in ('r', 'p') and s.sql is not null), '[]'::jsonb);
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'rls', 'sql', s.sql) order by c.relname, pol.polname, s.ord)
        from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
        cross join lateral unnest(array[
          format('drop policy if exists %I on %I.%I', pol.polname, n.nspname, c.relname),
          format('create policy %I on %I.%I as %s for %s to %s%s%s', pol.polname, n.nspname, c.relname,
                 case when pol.polpermissive then 'permissive' else 'restrictive' end,
                 case pol.polcmd::text when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end,
                 case when pol.polroles = '{0}'::oid[] then 'public'
                      else (select string_agg(quote_ident(ro.rolname), ', ' order by ro.rolname) from pg_roles ro where ro.oid = any (pol.polroles)) end,
                 case when pol.polqual is not null then ' using (' || pg_get_expr(pol.polqual, pol.polrelid, true) || ')' else '' end,
                 case when pol.polwithcheck is not null then ' with check (' || pg_get_expr(pol.polwithcheck, pol.polrelid, true) || ')' else '' end)
        ]) with ordinality as s(sql, ord)
       where n.nspname = 'public'), '[]'::jsonb);
    -- 15) permisos (tablas, vistas, secuencias y funciones) para los roles de la API: se deja exactamente lo que había
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'acl', 'sql',
               format('do $x$ begin %s; exception when others then raise warning ''Permisos de %%: %%'', %L, sqlerrm; end $x$', g.sql, g.what)) order by g.what, g.ord)
        from (
          select (n.nspname || '.' || c.relname) as what, 0 as ord,
                 format('revoke all on %s %I.%I from public, anon, authenticated, service_role',
                        case when c.relkind = 'S' then 'sequence' else 'table' end, n.nspname, c.relname) as sql
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
             and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
          union all
          select (n.nspname || '.' || c.relname), 1 + row_number() over (partition by c.oid order by gr.name, gr.grantable),
                 format('grant %s on %s %I.%I to %s%s', gr.privs, case when c.relkind = 'S' then 'sequence' else 'table' end, n.nspname, c.relname, gr.name,
                        case when gr.grantable then ' with grant option' else '' end)
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            cross join lateral (
              select case a.grantee when 0 then 'public' else ro.rolname end as name, a.is_grantable as grantable,
                     string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
                from aclexplode(coalesce(c.relacl, acldefault((case when c.relkind = 'S' then 'S' else 'r' end)::"char", c.relowner))) a
                left join pg_roles ro on ro.oid = a.grantee
               where a.grantee = 0 or ro.rolname in ('anon', 'authenticated', 'service_role')
               group by 1, 2) gr
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
             and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
          union all
          select p.oid::regprocedure::text, 0,
                 format('revoke all on function %s from public, anon, authenticated, service_role', p.oid::regprocedure::text)
            from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
             and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
          union all
          select p.oid::regprocedure::text, 1 + row_number() over (partition by p.oid order by gr.name, gr.grantable),
                 format('grant execute on function %s to %s%s', p.oid::regprocedure::text, gr.name, case when gr.grantable then ' with grant option' else '' end)
            from pg_proc p
            cross join lateral (
              select case a.grantee when 0 then 'public' else ro.rolname end as name, a.is_grantable as grantable
                from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                left join pg_roles ro on ro.oid = a.grantee
               where a.grantee = 0 or ro.rolname in ('anon', 'authenticated', 'service_role')) gr
           where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
             and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
        ) g), '[]'::jsonb);
    -- 16) publicaciones (Realtime)
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'pub', 'sql',
               format('do $x$ begin alter publication %I add table %I.%I; exception when duplicate_object or undefined_object then null; end $x$', pt.pubname, pt.schemaname, pt.tablename))
               order by pt.pubname, pt.tablename)
        from pg_publication_tables pt where pt.schemaname = 'public'), '[]'::jsonb);
    -- 17) comentarios
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'cmt', 'sql',
               format('do $x$ begin %s; exception when others then null; end $x$', s.sql)) order by s.ord)
        from (
          select 1 as ord, format('comment on %s %I.%I is %L', case c.relkind when 'v' then 'view' when 'm' then 'materialized view' else 'table' end, n.nspname, c.relname, obj_description(c.oid, 'pg_class')) as sql
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') and obj_description(c.oid, 'pg_class') is not null
          union all
          select 2, format('comment on column %I.%I.%I is %L', n.nspname, c.relname, a.attname, col_description(c.oid, a.attnum))
            from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
           where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') and a.attnum > 0 and not a.attisdropped and col_description(c.oid, a.attnum) is not null
          union all
          select 3, format('comment on %s %s is %L', case p.prokind when 'p' then 'procedure' else 'function' end, p.oid::regprocedure::text, obj_description(p.oid, 'pg_proc'))
            from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p') and obj_description(p.oid, 'pg_proc') is not null
             and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
        ) s), '[]'::jsonb);
    -- 18) DESPUÉS de cargar los datos: rellenar las vistas materializadas
    v_stmts := v_stmts || coalesce((
      select jsonb_agg(jsonb_build_object('k', 'post', 'sql', format('refresh materialized view %I.%I', n.nspname, c.relname)) order by c.relname)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'm'
         and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')), '[]'::jsonb);

    return jsonb_build_object('fmt', 1, 'stmts', v_stmts)::text;
  end if;

  raise exception 'Operación desconocida: %', op using errcode = '22023';
end
$fn$;

-- Comprobación de que la función se ha copiado entera (solo lee; no cambia nada)
select length(regexp_replace(prosrc, '\s', '', 'g')) as caracteres, md5(regexp_replace(prosrc, '\s', '', 'g')) as huella
  from pg_proc where oid = 'public.admin_backup(text,jsonb)'::regprocedure;
