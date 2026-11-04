-- Imitación de Supabase para la prueba de extremo a extremo de «Restaurar» (v42.50): columnas parecidas a las reales, ids de 64 bits, columna calculada.
drop schema if exists public cascade; create schema public;
drop schema if exists auth cascade; create schema auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
create table auth.users (id uuid primary key, email text unique, created_at timestamptz default now());
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, provider text, identity_data jsonb);
create table public.authors (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique, role text not null default 'user', display_name text, bio text,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table public.works (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  author_name text, title text not null default '', genre text, nav_mode text, social jsonb default '{}'::jsonb, panel_count int default 0,
  rules jsonb, palette jsonb, published boolean default false, pending_review boolean default false, cover_url text,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table public.panels (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  panel_order int not null default 0, orientation text, text_mode text, data_url text, nav jsonb);
create table public.panel_layers (
  id bigint generated always as identity primary key,
  panel_id uuid not null references public.panels(id) on delete cascade,
  layer_order int not null default 0, layer_type text, layer_data text, gif_url text, anim_url text,
  layer_sha text generated always as (md5(layer_data)) stored);
create table public.panel_texts (
  id bigint generated always as identity primary key,
  panel_id uuid not null references public.panels(id) on delete cascade,
  text_order int default 0, type text, style text, has_tail boolean, tail_starts text, x double precision, y double precision, w double precision, h double precision, text text);
create table public.biblioteca (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.authors(id) on delete cascade,
  name text, kind text, data text, created_at timestamptz default now());
create index panels_work on public.panels(work_id);
create index layers_panel on public.panel_layers(panel_id);
create index texts_panel on public.panel_texts(panel_id);
create or replace function public.panels_nav_invalidate() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then update public.panels set nav = null where id = old.panel_id and nav is not null;
  else update public.panels set nav = null where id = new.panel_id and nav is not null;
    if tg_op = 'UPDATE' and old.panel_id is distinct from new.panel_id then update public.panels set nav = null where id = old.panel_id and nav is not null; end if;
  end if; return null; end $$;
create trigger panel_layers_nav_invalidate after insert or update or delete on public.panel_layers for each row execute function public.panels_nav_invalidate();
alter table public.authors enable row level security; alter table public.works enable row level security;
alter table public.panels enable row level security; alter table public.panel_layers enable row level security;
alter table public.panel_texts enable row level security; alter table public.biblioteca enable row level security;
create policy sel_all on public.works for select using (true);
create policy sel_all on public.panels for select using (true);
create policy sel_all on public.panel_layers for select using (true);
create policy sel_all on public.panel_texts for select using (true);
create policy sel_all on public.authors for select using (true);
create policy sel_all on public.biblioteca for select using (true);
grant usage on schema public, auth to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','admin@x.test'),
 ('00000000-0000-4000-8000-000000000002','tutor@x.test'),
 ('00000000-0000-4000-8000-000000000003','user@x.test');
insert into public.authors(id,username,role,display_name) values
 ('00000000-0000-4000-8000-000000000001','admin','admin','Admin'),
 ('00000000-0000-4000-8000-000000000002','Tutor','admin','Tutor'),
 ('00000000-0000-4000-8000-000000000003','maria','user','María');
