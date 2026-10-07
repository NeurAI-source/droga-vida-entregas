grant update(driver_id, route_position, status, started_at, completed_at)
on public.deliveries to authenticated;

create index if not exists deliveries_queue_idx
on public.deliveries(status, driver_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='deliveries'
  ) then
    alter publication supabase_realtime add table public.deliveries;
  end if;
end $$;
