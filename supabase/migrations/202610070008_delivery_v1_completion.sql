alter table public.deliveries
  add column if not exists failure_reason text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists deliveries_completed_at_idx on public.deliveries(completed_at desc);
create index if not exists deliveries_accepted_at_idx on public.deliveries(accepted_at desc);

grant update(status, accepted_at, started_at, completed_at, failure_reason, proof_photo_path, route_position)
on public.deliveries to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proofs',
  'delivery-proofs',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public=false,
    file_size_limit=5242880,
    allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "delivery_proofs_driver_insert" on storage.objects;
create policy "delivery_proofs_driver_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id='delivery-proofs'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.delivery_drivers dd
    where dd.user_id=(select auth.uid()) and dd.active=true
  )
);

drop policy if exists "delivery_proofs_driver_select" on storage.objects;
create policy "delivery_proofs_driver_select" on storage.objects
for select to authenticated
using (
  bucket_id='delivery-proofs'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "delivery_proofs_admin_select" on storage.objects;
create policy "delivery_proofs_admin_select" on storage.objects
for select to authenticated
using (
  bucket_id='delivery-proofs'
  and exists (
    select 1 from public.team_members tm
    where tm.user_id=(select auth.uid())
      and tm.active=true
      and tm.role in ('owner','admin')
  )
);
