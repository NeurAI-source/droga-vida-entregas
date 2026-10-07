create index deliveries_driver_id_idx on public.deliveries(driver_id);
create index deliveries_created_by_idx on public.deliveries(created_by);
create index deliveries_status_created_idx on public.deliveries(status, created_at desc);
create index delivery_events_delivery_id_idx on public.delivery_events(delivery_id);
create index delivery_events_driver_id_idx on public.delivery_events(driver_id);
