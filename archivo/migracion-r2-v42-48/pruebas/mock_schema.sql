-- Esquema de imitación de Supabase para probar SQL en local
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
create table public.authors (id uuid primary key, username text, role text default 'user');
create table public.works (id uuid primary key default gen_random_uuid(), author_id uuid references public.authors(id), title text, published boolean default false);
create table public.panels (id uuid primary key default gen_random_uuid(), work_id uuid references public.works(id) on delete cascade, panel_order int, nav jsonb, data_url text);
create table public.panel_layers (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid references public.panels(id) on delete cascade,
  layer_order int, layer_type text, layer_data text, gif_url text, anim_url text
);
create or replace function public.layer_sha(p public.panel_layers) returns text language sql immutable as $$
  select encode(sha256(convert_to(p.layer_data, 'UTF8')), 'hex')
$$;
create or replace function public.is_admin() returns boolean language sql security definer stable set search_path='' as $$
  select exists (select 1 from public.authors where id = auth.uid() and role = 'admin');
$$;
-- el disparador de la v42.27
alter table public.panels add column if not exists nav jsonb;
create or replace function public.panels_nav_invalidate() returns trigger language plpgsql security definer set search_path = public as $$
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
end $$;
create or replace trigger panel_layers_nav_invalidate after insert or update or delete on public.panel_layers
for each row execute function public.panels_nav_invalidate();
alter table public.authors enable row level security;
alter table public.works enable row level security;
alter table public.panels enable row level security;
alter table public.panel_layers enable row level security;
create policy authors_sel on public.authors for select using (true);
create policy works_sel on public.works for select using (true);
create policy panels_sel on public.panels for select using (true);
create policy panel_layers_sel on public.panel_layers for select using (true);
create policy works_ins on public.works for insert with check (auth.uid() = author_id);
create policy works_upd on public.works for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy panels_ins on public.panels for insert with check (exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()));
create policy panels_upd on public.panels for update using (exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()));
create policy panel_layers_ins on public.panel_layers for insert with check (exists (select 1 from public.panels p join public.works w on w.id = p.work_id where p.id = panel_id and w.author_id = auth.uid()));
create policy panel_layers_del on public.panel_layers for delete using (exists (select 1 from public.panels p join public.works w on w.id = p.work_id where p.id = panel_id and w.author_id = auth.uid()));
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function public.layer_sha(public.panel_layers) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
