create or replace function public.enforce_delivery_driver_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  is_admin boolean;
  is_seller boolean;
  is_driver boolean;
begin
  if uid is null then return new; end if;

  select exists(
    select 1 from public.team_members tm
    where tm.user_id=uid and tm.active=true and tm.role in ('owner','admin')
  ) into is_admin;
  if is_admin then return new; end if;

  select exists(
    select 1 from public.delivery_staff ds
    where ds.user_id=uid and ds.active=true and ds.role='vendedor'
  ) into is_seller;
  if is_seller then return new; end if;

  select exists(
    select 1 from public.delivery_drivers dd
    where dd.user_id=uid and dd.active=true
  ) into is_driver;
  if not is_driver then raise exception 'Usuário sem permissão para alterar entrega'; end if;

  if old.driver_id is distinct from uid or new.driver_id is distinct from uid then
    raise exception 'Entregador só pode alterar as próprias entregas';
  end if;

  if new.status is distinct from old.status then
    if old.status='atribuida' and new.status='aceita' then
      new.accepted_at := coalesce(new.accepted_at, now());
    elsif old.status in ('aceita','em_rota') and new.status in ('em_rota','entregue','nao_entregue') then
      if new.status in ('entregue','nao_entregue') then
        new.completed_at := coalesce(new.completed_at, now());
      end if;
    else
      raise exception 'Transição de status inválida';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists deliveries_enforce_driver_transition on public.deliveries;
create trigger deliveries_enforce_driver_transition
before update on public.deliveries
for each row execute function public.enforce_delivery_driver_transition();
