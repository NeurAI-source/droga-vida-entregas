alter table public.deliveries
add column if not exists accepted_at timestamptz;

drop policy if exists "deliveries_driver_update_status" on public.deliveries;

create policy "deliveries_driver_update_status" on public.deliveries
for update to authenticated
using (driver_id = (select auth.uid()))
with check (
  driver_id = (select auth.uid())
  and status in ('aceita','em_rota','entregue','nao_entregue')
);

grant update(status, accepted_at, started_at, completed_at)
on public.deliveries to authenticated;
