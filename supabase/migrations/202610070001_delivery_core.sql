-- Droga Vida Entregas: núcleo de logística.
-- Usa public.team_members já existente para reconhecer owner/admin.
-- Entregadores ficam em uma tabela própria e só compartilham localização
-- enquanto o recurso estiver explicitamente ligado no aplicativo.

create type public.delivery_status as enum (
  'aguardando','atribuida','em_rota','entregue','nao_entregue','cancelada'
);

create table public.delivery_drivers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_code text,
  customer_name text,
  customer_phone text,
  address_text text not null,
  street text,
  street_number text,
  neighborhood text,
  city text not null default 'São José do Rio Preto',
  latitude double precision,
  longitude double precision,
  status public.delivery_status not null default 'aguardando',
  driver_id uuid references public.delivery_drivers(user_id),
  route_position integer,
  notes text,
  proof_photo_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table public.driver_locations (
  driver_id uuid primary key references public.delivery_drivers(user_id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  heading double precision,
  speed_mps double precision,
  sharing boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.delivery_events (
  id bigint generated always as identity primary key,
  delivery_id uuid references public.deliveries(id) on delete cascade,
  driver_id uuid references public.delivery_drivers(user_id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.delivery_drivers enable row level security;
alter table public.deliveries enable row level security;
alter table public.driver_locations enable row level security;
alter table public.delivery_events enable row level security;

-- A partir de 30/10/2026, tabelas novas não ficam automaticamente
-- expostas à Data API. Concedemos apenas os privilégios necessários
-- ao cliente autenticado; RLS continua decidindo quais linhas são acessíveis.
grant select on public.delivery_drivers to authenticated;
grant select, insert, update on public.deliveries to authenticated;
grant select, insert, update on public.driver_locations to authenticated;
grant select, insert on public.delivery_events to authenticated;
grant usage, select on sequence public.delivery_events_id_seq to authenticated;

create policy "delivery_drivers_self_select" on public.delivery_drivers
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "delivery_drivers_admin_select" on public.delivery_drivers
for select to authenticated
using (exists (
  select 1 from public.team_members tm
  where tm.user_id = (select auth.uid())
    and tm.active = true
    and tm.role in ('owner','admin')
));

create policy "delivery_drivers_admin_insert" on public.delivery_drivers
for insert to authenticated
with check (exists (
  select 1 from public.team_members tm
  where tm.user_id = (select auth.uid())
    and tm.active = true
    and tm.role in ('owner','admin')
));

create policy "delivery_drivers_admin_update" on public.delivery_drivers
for update to authenticated
using (exists (
  select 1 from public.team_members tm
  where tm.user_id = (select auth.uid()) and tm.active = true and tm.role in ('owner','admin')
))
with check (exists (
  select 1 from public.team_members tm
  where tm.user_id = (select auth.uid()) and tm.active = true and tm.role in ('owner','admin')
));

create policy "deliveries_driver_select" on public.deliveries
for select to authenticated
using (driver_id = (select auth.uid()));

create policy "deliveries_admin_select" on public.deliveries
for select to authenticated
using (exists (
  select 1 from public.team_members tm
  where tm.user_id = (select auth.uid()) and tm.active = true and tm.role in ('owner','admin')
));

create policy "deliveries_admin_insert" on public.deliveries
for insert to authenticated
with check (exists (
  select 1 from public.team_members tm
  where tm.user_id = (select auth.uid()) and tm.active = true and tm.role in ('owner','admin')
));

create policy "deliveries_admin_update" on public.deliveries
for update to authenticated
using (exists (
  select 1 from public.team_members tm
  where tm.user_id = (select auth.uid()) and tm.active = true and tm.role in ('owner','admin')
))
with check (exists (
  select 1 from public.team_members tm
  where tm.user_id = (select auth.uid()) and tm.active = true and tm.role in ('owner','admin')
));

create policy "driver_locations_self_select" on public.driver_locations
for select to authenticated using (driver_id = (select auth.uid()));

create policy "driver_locations_self_insert" on public.driver_locations
for insert to authenticated with check (driver_id = (select auth.uid()));

create policy "driver_locations_self_update" on public.driver_locations
for update to authenticated
using (driver_id = (select auth.uid()))
with check (driver_id = (select auth.uid()));

create policy "driver_locations_admin_select" on public.driver_locations
for select to authenticated
using (exists (
  select 1 from public.team_members tm
  where tm.user_id = (select auth.uid()) and tm.active = true and tm.role in ('owner','admin')
));

create policy "delivery_events_driver_insert" on public.delivery_events
for insert to authenticated
with check (driver_id = (select auth.uid()));

create policy "delivery_events_admin_select" on public.delivery_events
for select to authenticated
using (exists (
  select 1 from public.team_members tm
  where tm.user_id = (select auth.uid()) and tm.active = true and tm.role in ('owner','admin')
));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='driver_locations'
  ) then
    alter publication supabase_realtime add table public.driver_locations;
  end if;
end $$;
