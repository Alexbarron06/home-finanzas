alter table public.households
  add column service_budget_cents bigint
  check (service_budget_cents is null or service_budget_cents between 1 and 100000000);

grant update(service_budget_cents) on public.households to authenticated;

create policy household_service_budget_update
on public.households
for update
to authenticated
using (
  id in (
    select household_id
    from public.memberships
    where user_id = (select auth.uid())
  )
)
with check (
  id in (
    select household_id
    from public.memberships
    where user_id = (select auth.uid())
  )
);
