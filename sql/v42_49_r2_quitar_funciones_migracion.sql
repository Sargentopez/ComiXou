-- ====================================================================================================================
-- v42.49 · Quitar de Supabase las 2 funciones de la migración a R2 (ya no se usan) · UN solo paso
-- Supabase → SQL Editor → New query → pega TODO → Run. Debe devolver una fila: funciones_que_quedan = 0. Cópiame el resultado.
-- · Si avisa de consulta «destructiva» (por el drop function): es lo que se pretende; solo borra estas 2 funciones, ni tablas ni datos.
-- · La migración (468 capas, 125,8 MB) terminó el 4-nov-2026 y la app ya no llama a estas funciones (se quitó el código en la v42.49).
--   Una función SECURITY DEFINER que puede escribir en panel_layers no debería quedarse instalada sin uso.
-- · El código de la herramienta está guardado en archivo/migracion-r2-v42-48/ por si hiciera falta otra migración: ese archivo vuelve a
--   instalar las 2 funciones (sql/v42_48_r2_migracion_1_instalar.sql dentro de esa carpeta).
-- · Se puede repetir sin problema (drop … if exists).
-- ====================================================================================================================

drop function if exists public.admin_xr_scan(int, boolean);
drop function if exists public.admin_xr_swap(uuid, text);

select pg_notify('pgrst', 'reload schema');      -- que la API deje de ofrecerlas ya, sin esperar

select count(*) as funciones_que_quedan
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('admin_xr_scan', 'admin_xr_swap');
