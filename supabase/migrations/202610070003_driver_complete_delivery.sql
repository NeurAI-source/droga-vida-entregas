revoke update on public.deliveries from authenticated;
grant update(status, started_at, completed_at) on public.deliveries to authenticated;

create policy "deliveries_driver_update_status" on public.deliveries
for update to authenticated
using (driver_id = (select auth.uid()))
with check (
  driver_id = (select auth.uid())
  and status in ('em_rota','entregue','nao_entregue')
);
