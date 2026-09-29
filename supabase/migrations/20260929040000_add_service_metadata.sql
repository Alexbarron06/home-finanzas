alter table public.reservations
  add column service_type text,
  add column service_provider text,
  add column cutoff_on date,
  add constraint reservations_service_type_check
    check (service_type is null or service_type in ('electricity','water','telephone','internet','gas','streaming','other')),
  add constraint reservations_service_provider_check
    check (service_provider is null or length(trim(service_provider)) between 1 and 120),
  add constraint reservations_service_cutoff_check
    check (service_type is null or cutoff_on is not null),
  add constraint reservations_service_dates_check
    check (cutoff_on is null or cutoff_on <= due_on);

grant insert(service_type,service_provider,cutoff_on) on public.reservations to authenticated;

create index reservations_household_service_due_idx
  on public.reservations(household_id,service_type,due_on)
  where service_type is not null;
