-- =====================================================================================================================
-- v42.29 · Copia de seguridad descargable · PASO 2 de 3 — permisos
--
-- Supabase → SQL Editor → New query → pega TODO este archivo → Run. Copia aquí el resultado (debe decir «Success. No rows returned»).
--
-- Qué hace: solo las cuentas con sesión iniciada pueden llamar a la función (se le quita el permiso a «anon» y a «public»); aun así, la
-- puerta de dentro (paso 1) deja pasar únicamente a la cuenta «admin». También avisa a la API para que vea la función sin esperar.
-- Se puede repetir sin problema. Requiere haber ejecutado el paso 1.
-- =====================================================================================================================

do $$
begin
  revoke all on function public.admin_backup(text, jsonb) from public, anon;
  grant execute on function public.admin_backup(text, jsonb) to authenticated;
  perform pg_notify('pgrst', 'reload schema');      -- que la API la vea ya, sin esperar
end $$;
