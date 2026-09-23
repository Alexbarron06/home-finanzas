-- Initial schema. Contains no household data or credentials.
create table public.households (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100), created_at timestamptz not null default now()
);
create table public.memberships (
 user_id uuid primary key references auth.users(id), household_id uuid not null references public.households(id), created_at timestamptz not null default now()
);
create index memberships_household_idx on public.memberships(household_id);
create table public.funds (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id), name text not null,
 kind text not null check(kind in ('salary','voucher')), opening_cents bigint not null check(opening_cents between 0 and 100000000),
 starts_on date not null, created_at timestamptz not null default now(), unique(id,household_id), unique(household_id,kind)
);
create table public.reservations (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id), fund_id uuid not null,
 description text not null check(length(trim(description)) between 1 and 160), amount_cents bigint not null check(amount_cents between 1 and 100000000),
 due_on date not null, created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 foreign key(fund_id,household_id) references public.funds(id,household_id), unique(id,fund_id,household_id)
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id), fund_id uuid not null,
 description text not null check(length(trim(description)) between 1 and 160), amount_cents bigint not null check(amount_cents between 1 and 100000000),
 category text not null check(length(category) between 1 and 80), method text not null check(method in ('cash','card')), occurred_on date not null,
 reservation_id uuid unique, created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 foreign key(fund_id,household_id) references public.funds(id,household_id),
 foreign key(reservation_id,fund_id,household_id) references public.reservations(id,fund_id,household_id)
);
create index reservations_household_due_idx on public.reservations(household_id,due_on);
create index expenses_household_date_idx on public.expenses(household_id,occurred_on);
create index reservations_fund_idx on public.reservations(fund_id,household_id);
create index expenses_fund_idx on public.expenses(fund_id,household_id);
create index expenses_author_idx on public.expenses(created_by);
create index reservations_author_idx on public.reservations(created_by);

alter table public.households enable row level security;
alter table public.memberships enable row level security;
alter table public.funds enable row level security;
alter table public.reservations enable row level security;
alter table public.expenses enable row level security;
revoke all on public.households,public.memberships,public.funds,public.reservations,public.expenses from anon,authenticated;
grant select on public.households,public.memberships,public.funds,public.reservations,public.expenses to authenticated;
grant insert(id,household_id,fund_id,description,amount_cents,due_on,created_by) on public.reservations to authenticated;
grant insert(id,household_id,fund_id,description,amount_cents,category,method,occurred_on,reservation_id,created_by) on public.expenses to authenticated;
create policy own_membership on public.memberships for select to authenticated using(user_id=(select auth.uid()));
create policy household_read on public.households for select to authenticated using(id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy funds_read on public.funds for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy reservations_read on public.reservations for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy expenses_read on public.expenses for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy reservations_insert on public.reservations for insert to authenticated with check(created_by=(select auth.uid()) and household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy expenses_insert on public.expenses for insert to authenticated with check(created_by=(select auth.uid()) and household_id in(select household_id from public.memberships where user_id=(select auth.uid())));

create function public.validate_expense() returns trigger language plpgsql security invoker set search_path='' as $$
declare f public.funds; r public.reservations;
begin
 select * into f from public.funds where id=new.fund_id and household_id=new.household_id;
 if not found then raise exception 'Fondo no disponible'; end if;
 if f.kind='voucher' and new.method <> 'card' then raise exception 'Los vales solo permiten tarjeta'; end if;
 if new.occurred_on<f.starts_on then raise exception 'Fecha anterior al saldo inicial; requiere conciliación histórica'; end if;
 if new.reservation_id is not null then
  select * into r from public.reservations where id=new.reservation_id and fund_id=new.fund_id and household_id=new.household_id;
  if not found or r.amount_cents<>new.amount_cents then raise exception 'El pago debe coincidir con la reserva'; end if;
 end if;
 return new;
end; $$;
revoke all on function public.validate_expense() from public,anon,authenticated;
create trigger validate_expense before insert on public.expenses for each row execute function public.validate_expense();
