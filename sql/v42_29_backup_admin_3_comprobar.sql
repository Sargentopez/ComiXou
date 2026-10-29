-- =====================================================================================================================
-- v42.29 · Copia de seguridad descargable · PASO 3 de 3 — comprobación (opcional, muy recomendable)
--
-- Supabase → SQL Editor → New query → pega TODO este archivo → Run. COPIA AQUÍ EL RESULTADO (una tabla con una fila por cada tabla de la base).
--
-- Qué hace: se hace pasar por la cuenta «admin» y pide la lista de tablas que entrarán en la copia, con su nº de filas y cómo se recorre
-- cada una. Solo LEE; no cambia nada. Sirve para comprobar, antes de que vuelva la API, que la función funciona en tu base real.
-- Si da el error «Solo la cuenta administradora principal…», dímelo: significa que en «authors» no hay una cuenta con username «admin» y role «admin».
-- Requiere haber ejecutado los pasos 1 y 2.
-- =====================================================================================================================

with s as (
  select set_config('request.jwt.claims',
                    json_build_object('sub', (select id from public.authors where username = 'admin' and role = 'admin'), 'role', 'authenticated')::text,
                    true) as v
)
select t->>'s' as esquema, t->>'n' as tabla, t->>'rows' as filas, t->>'pkk' as clave
  from s, jsonb_array_elements(public.admin_backup('plan', jsonb_build_object('_', s.v))::jsonb -> 'tables') as t
 order by 1, 2;
