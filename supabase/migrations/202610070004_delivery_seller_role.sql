create table public.delivery_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('vendedor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.delivery_staff enable row level security;
grant select on public.delivery_staff to authenticated;

create policy "delivery_staff_self_select" on public.delivery_staff
for select to authenticated
using (user_id = (select auth.uid()));

create policy "delivery_staff_admin_select" on public.delivery_staff
for select to authenticated
using (exists (
  select 1 from public.team_members tm
  where tm.user_id=(select auth.uid())
    and tm.active=true
    and tm.role in ('owner','admin')
));

create policy "deliveries_seller_select_own" on public.deliveries
for select to authenticated
using (
  created_by=(select auth.uid())
  and exists (
    select 1 from public.delivery_staff ds
    where ds.user_id=(select auth.uid()) and ds.active=true and ds.role='vendedor'
  )
);

create policy "deliveries_seller_insert" on public.deliveries
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and exists (
    select 1 from public.delivery_staff ds
    where ds.user_id=(select auth.uid()) and ds.active=true and ds.role='vendedor'
  )
);

create policy "deliveries_seller_update_own" on public.deliveries
for update to authenticated
using (
  created_by=(select auth.uid())
  and status not in ('entregue','cancelada')
  and exists (
    select 1 from public.delivery_staff ds
    where ds.user_id=(select auth.uid()) and ds.active=true and ds.role='vendedor'
  )
)
with check (
  created_by=(select auth.uid())
  and exists (
    select 1 from public.delivery_staff ds
    where ds.user_id=(select auth.uid()) and ds.active=true and ds.role='vendedor'
  )
);

grant update(driver_id, route_position, status) on public.deliveries to authenticated;

create policy "delivery_drivers_seller_select" on public.delivery_drivers
for select to authenticated
using (
  active = true
  and exists (
    select 1 from public.delivery_staff ds
    where ds.user_id=(select auth.uid())
      and ds.active=true
      and ds.role='vendedor'
  )
);
