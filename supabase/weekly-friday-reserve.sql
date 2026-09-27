-- Accumulated reserve for the recurring Friday payment and variable payroll deposits.
create table public.fund_deposits(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id),
 fund_id uuid not null,
 description text not null check(length(trim(description)) between 1 and 120),
 amount_cents bigint not null check(amount_cents between 1 and 100000000),
 received_on date not null,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(fund_id,household_id) references public.funds(id,household_id)
);
create index fund_deposits_household_date on public.fund_deposits(household_id,received_on);
create index fund_deposits_fund on public.fund_deposits(fund_id,household_id);

create table public.weekly_payment_plans(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null unique references public.households(id),
 fund_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 120),
 amount_cents bigint not null check(amount_cents between 1 and 100000000),
 reserve_starts_on date not null,
 first_payment_on date not null,
 transition_periods integer not null check(transition_periods between 1 and 24),
 transition_total_cents bigint not null check(transition_total_cents>0),
 regular_contribution_cents bigint not null check(regular_contribution_cents>0),
 active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,household_id),
 foreign key(fund_id,household_id) references public.funds(id,household_id),
 check(first_payment_on>=reserve_starts_on)
);

alter table public.expenses add column weekly_plan_id uuid;
alter table public.reservations add column weekly_plan_id uuid;
alter table public.expenses add constraint expenses_weekly_plan_fkey foreign key(weekly_plan_id,household_id) references public.weekly_payment_plans(id,household_id);
alter table public.reservations add constraint reservations_weekly_plan_fkey foreign key(weekly_plan_id,household_id) references public.weekly_payment_plans(id,household_id);
create index expenses_weekly_plan on public.expenses(weekly_plan_id,household_id);
create index reservations_weekly_plan on public.reservations(weekly_plan_id,household_id);

create table public.weekly_payment_entries(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id),
 plan_id uuid not null,
 entry_type text not null check(entry_type in('allocation','payment')),
 amount_cents bigint not null check(amount_cents between 1 and 100000000),
 effective_on date not null,
 expense_id uuid,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(plan_id,household_id) references public.weekly_payment_plans(id,household_id),
 foreign key(expense_id,household_id) references public.expenses(id,household_id),
 unique(plan_id,entry_type,effective_on),
 check((entry_type='allocation' and expense_id is null) or entry_type='payment')
);
create index weekly_entries_household_date on public.weekly_payment_entries(household_id,effective_on);
create index weekly_entries_plan on public.weekly_payment_entries(plan_id,household_id);

alter table public.fund_deposits enable row level security;
alter table public.weekly_payment_plans enable row level security;
alter table public.weekly_payment_entries enable row level security;
revoke all on public.fund_deposits,public.weekly_payment_plans,public.weekly_payment_entries from anon,authenticated;
grant select on public.fund_deposits,public.weekly_payment_plans,public.weekly_payment_entries to authenticated;
grant insert(id,household_id,fund_id,description,amount_cents,received_on,created_by) on public.fund_deposits to authenticated;

create policy fund_deposits_members on public.fund_deposits for select to authenticated
 using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy fund_deposits_insert on public.fund_deposits for insert to authenticated
 with check(created_by=(select auth.uid()) and household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy weekly_plans_members on public.weekly_payment_plans for select to authenticated
 using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy weekly_entries_members on public.weekly_payment_entries for select to authenticated
 using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));

create function private.sync_weekly_plan(p_household uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); p public.weekly_payment_plans; effective date; local_today date;
 period_index integer; contribution bigint; rounded bigint;
begin
 if uid is null or not exists(select 1 from public.memberships where user_id=uid and household_id=p_household) then
  raise exception 'Acceso no autorizado' using errcode='42501';
 end if;
 local_today=(now() at time zone 'America/Mexico_City')::date;
 for p in select * from public.weekly_payment_plans where household_id=p_household and active loop
  effective=p.reserve_starts_on;
  while effective<=local_today loop
   period_index=(effective-p.reserve_starts_on)/15;
   if period_index<p.transition_periods then
    rounded=ceil((p.transition_total_cents::numeric/p.transition_periods)/100)*100;
    contribution=case when period_index=p.transition_periods-1 then p.transition_total_cents-rounded*(p.transition_periods-1) else rounded end;
   else
    contribution=p.regular_contribution_cents;
   end if;
   insert into public.weekly_payment_entries(household_id,plan_id,entry_type,amount_cents,effective_on,created_by)
    values(p_household,p.id,'allocation',contribution,effective,uid)
    on conflict(plan_id,entry_type,effective_on) do nothing;
   effective=effective+15;
  end loop;
 end loop;
end $$;
revoke all on function private.sync_weekly_plan(uuid) from public,anon,authenticated;

create function public.sync_weekly_plan(p_household uuid) returns void
language sql security invoker set search_path='' as $$ select private.sync_weekly_plan(p_household); $$;
revoke all on function public.sync_weekly_plan(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function public.sync_weekly_plan(uuid) to authenticated;
grant execute on function private.sync_weekly_plan(uuid) to authenticated;

create function private.pay_weekly_plan(p_household uuid,p_plan uuid,p_method text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); p public.weekly_payment_plans; due_date date; local_today date;
 reservation uuid; paid_expense public.expenses; available bigint;
begin
 if uid is null or not exists(select 1 from public.memberships where user_id=uid and household_id=p_household) then
  raise exception 'Acceso no autorizado' using errcode='42501';
 end if;
 if p_method not in('cash','card') then raise exception 'Medio de pago no válido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_plan::text,0));
 select * into p from public.weekly_payment_plans where id=p_plan and household_id=p_household and active for update;
 if not found then raise exception 'Apartado no disponible'; end if;
 perform private.sync_weekly_plan(p_household);
 local_today=(now() at time zone 'America/Mexico_City')::date;
 select day::date into due_date
 from generate_series(p.first_payment_on::timestamptz,local_today::timestamptz,interval '7 days') day
 where not exists(select 1 from public.weekly_payment_entries e where e.plan_id=p.id and e.entry_type='payment' and e.effective_on=day::date)
 order by day limit 1;
 if due_date is null then raise exception 'Todavía no hay un pago pendiente'; end if;
 select coalesce(sum(case when entry_type='allocation' then amount_cents else -amount_cents end),0) into available
 from public.weekly_payment_entries where plan_id=p.id;
 if available<p.amount_cents then raise exception 'El apartado todavía no tiene saldo suficiente'; end if;
 select r.id into reservation from public.reservations r
 where r.household_id=p_household and r.fund_id=p.fund_id and r.due_on=due_date and r.amount_cents=p.amount_cents
 and not exists(select 1 from public.expenses e where e.reservation_id=r.id)
 order by r.created_at limit 1;
 insert into public.expenses(household_id,fund_id,description,amount_cents,category,method,occurred_on,reservation_id,weekly_plan_id,created_by)
 values(p_household,p.fund_id,p.name,p.amount_cents,'Servicios',p_method,due_date,reservation,p.id,uid)
 returning * into paid_expense;
 insert into public.weekly_payment_entries(household_id,plan_id,entry_type,amount_cents,effective_on,expense_id,created_by)
 values(p_household,p.id,'payment',p.amount_cents,due_date,paid_expense.id,uid);
 return to_jsonb(paid_expense);
end $$;
revoke all on function private.pay_weekly_plan(uuid,uuid,text) from public,anon,authenticated;

create function public.pay_weekly_plan(p_household uuid,p_plan uuid,p_method text) returns jsonb
language sql security invoker set search_path='' as $$ select private.pay_weekly_plan(p_household,p_plan,p_method); $$;
revoke all on function public.pay_weekly_plan(uuid,uuid,text) from public,anon;
grant execute on function public.pay_weekly_plan(uuid,uuid,text) to authenticated;
grant execute on function private.pay_weekly_plan(uuid,uuid,text) to authenticated;

insert into public.weekly_payment_plans(household_id,fund_id,name,amount_cents,reserve_starts_on,first_payment_on,transition_periods,transition_total_cents,regular_contribution_cents,created_by)
select f.household_id,f.id,'Pago de los viernes',140000,date '2026-09-29',date '2026-10-02',3,980000,305000,
 (select m.user_id from public.memberships m where m.household_id=f.household_id order by m.created_at limit 1)
from public.funds f where f.kind='salary'
on conflict(household_id) do nothing;

update public.reservations r set weekly_plan_id=p.id
from public.weekly_payment_plans p
where r.household_id=p.household_id and r.fund_id=p.fund_id and r.amount_cents=p.amount_cents
 and r.due_on>=p.first_payment_on and extract(isodow from r.due_on)=5;

alter publication supabase_realtime add table public.fund_deposits,public.weekly_payment_plans,public.weekly_payment_entries;
