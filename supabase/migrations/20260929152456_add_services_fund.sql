alter table public.funds drop constraint funds_kind_check;
alter table public.funds
  add constraint funds_kind_check check (kind in ('salary','voucher','service'));

insert into public.funds(household_id,name,kind,opening_cents,starts_on)
select id,'Servicios','service',0,date_trunc('month',current_date)::date
from public.households
on conflict(household_id,kind) do update set name=excluded.name;

create temporary table service_expense_links on commit drop as
select e.id as expense_id,e.reservation_id,e.household_id
from public.expenses e
join public.reservations r
  on r.id=e.reservation_id
 and r.household_id=e.household_id
where r.service_type is not null
  and r.weekly_plan_id is null;

update public.expenses e
set reservation_id=null
from service_expense_links l
where e.id=l.expense_id;

update public.reservations r
set fund_id=f.id
from public.funds f
where f.household_id=r.household_id
  and f.kind='service'
  and r.service_type is not null
  and r.weekly_plan_id is null;

update public.expenses e
set fund_id=f.id,
    reservation_id=l.reservation_id
from service_expense_links l
join public.funds f
  on f.household_id=l.household_id
 and f.kind='service'
where e.id=l.expense_id;

create function public.validate_shopping_item_fund()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.fund_id is not null and exists(
    select 1 from public.funds
    where id=new.fund_id
      and household_id=new.household_id
      and kind='service'
  ) then
    raise exception 'El fondo Servicios no puede usarse para compras de despensa';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_shopping_item_fund() from public,anon,authenticated;
create trigger validate_shopping_item_fund
before insert or update of fund_id on public.shopping_items
for each row execute function public.validate_shopping_item_fund();

create function public.validate_product_fund()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.usual_fund_id is not null and exists(
    select 1 from public.funds
    where id=new.usual_fund_id
      and household_id=new.household_id
      and kind='service'
  ) then
    raise exception 'El fondo Servicios no puede ser la fuente habitual de un producto';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_product_fund() from public,anon,authenticated;
create trigger validate_product_fund
before insert or update of usual_fund_id on public.products
for each row execute function public.validate_product_fund();
