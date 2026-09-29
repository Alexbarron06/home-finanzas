alter table public.households
  add column service_period_budget_cents bigint
  check (service_period_budget_cents is null or service_period_budget_cents between 1 and 100000000);

update public.households
set service_period_budget_cents=service_budget_cents
where service_period_budget_cents is null
  and service_budget_cents is not null;

grant update(service_period_budget_cents) on public.households to authenticated;
