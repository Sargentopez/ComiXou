-- =====================================================================================================================
-- v42.27 — resumen de navegación por hoja (panels.nav)            Ejecutar en Supabase → SQL Editor, UNA SENTENCIA CADA VEZ
--
-- Para qué sirve: hasta ahora el lector, para saber a qué hojas puede saltar desde la hoja actual (botones «ir a hoja»), tenía que
-- descargar las capas de TODAS las hojas de la obra. Con este resumen (un jsonb diminuto por hoja, que escribe el editor al guardar)
-- solo baja las hojas que va a mostrar. Si no se ejecuta, todo sigue funcionando como antes (el lector escanea las hojas).
--
-- Orden: 1 → 2 → 3 → 4. Cada una se puede repetir sin problema. Pega solo UNA, pulsa Run y copia aquí el resultado.
-- =====================================================================================================================

-- 1) La columna
alter table public.panels add column if not exists nav jsonb;

-- 2) La función que anula el resumen cuando cambia cualquier capa de la hoja (así nunca queda un resumen viejo)
create or replace function public.panels_nav_invalidate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.panels set nav = null where id = old.panel_id and nav is not null;
  else
    update public.panels set nav = null where id = new.panel_id and nav is not null;
    if tg_op = 'UPDATE' and old.panel_id is distinct from new.panel_id then
      update public.panels set nav = null where id = old.panel_id and nav is not null;
    end if;
  end if;
  return null;
end
$$;

-- 3) El disparador que la llama al insertar, modificar o borrar capas
create or replace trigger panel_layers_nav_invalidate
after insert or update or delete on public.panel_layers
for each row execute function public.panels_nav_invalidate();

-- 4) Nadie puede llamar a la función a mano desde la API (solo la usa el disparador)
revoke all on function public.panels_nav_invalidate() from public, anon, authenticated;


-- =====================================================================================================================
-- DESHACER (solo si alguna vez hiciera falta; también de una en una). La app sigue funcionando sin el resumen.
-- =====================================================================================================================
-- drop trigger if exists panel_layers_nav_invalidate on public.panel_layers;
-- drop function if exists public.panels_nav_invalidate();
-- alter table public.panels drop column if exists nav;
