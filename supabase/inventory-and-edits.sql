-- Command-only writes keep inventory, checkout and history atomic.
alter table public.expenses add column revision integer not null default 1;
alter table public.expenses add column updated_at timestamptz not null default now();
alter table public.expenses add constraint expenses_id_household_unique unique(id,household_id);
create table public.expense_history(
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id),
 expense_id uuid not null, before_data jsonb not null, after_data jsonb not null,
 actor_id uuid not null references auth.users(id),actor_name text not null,created_at timestamptz not null default now(),
 foreign key(expense_id,household_id) references public.expenses(id,household_id)
);
create table public.products(
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id),
 name text not null check(length(trim(name)) between 1 and 120), category text not null default 'Despensa',
 unit text not null default 'unidad' check(length(unit) between 1 and 30),
 on_hand numeric(12,3) not null default 0 check(on_hand between 0 and 1000000),
 minimum numeric(12,3) not null default 0 check(minimum between 0 and 1000000),
 target numeric(12,3) not null default 0 check(target>=minimum and target<=1000000),
 version integer not null default 1, updated_at timestamptz not null default now(),unique(id,household_id)
);
create unique index products_name_unique on public.products(household_id,lower(trim(name)));
create table public.shopping_items(
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id),product_id uuid not null,
 quantity numeric(12,3) not null check(quantity>0 and quantity<=1000000),
 unit_price_cents bigint check(unit_price_cents between 0 and 100000000),
 state text not null default 'pending' check(state in('pending','cart','bought','removed')),
 automatic boolean not null default false, version integer not null default 1,
 expense_id uuid,updated_at timestamptz not null default now(),
 foreign key(product_id,household_id) references public.products(id,household_id),
 foreign key(expense_id,household_id) references public.expenses(id,household_id)
);
create unique index shopping_active_product on public.shopping_items(household_id,product_id) where state in('pending','cart');
create table public.inventory_events(
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id),product_id uuid not null,
 delta numeric(12,3) not null,balance numeric(12,3) not null,reason text not null,
 actor_id uuid not null references auth.users(id),actor_name text not null,expense_id uuid,
 created_at timestamptz not null default now(),
 foreign key(product_id,household_id) references public.products(id,household_id),
 foreign key(expense_id,household_id) references public.expenses(id,household_id)
);
create index expense_history_household on public.expense_history(household_id,created_at);
create index expense_history_expense on public.expense_history(expense_id,household_id);
create index expense_history_actor on public.expense_history(actor_id);
create index inventory_events_household on public.inventory_events(household_id,created_at);
create index inventory_events_product on public.inventory_events(product_id,household_id);
create index inventory_events_expense on public.inventory_events(expense_id,household_id);
create index inventory_events_actor on public.inventory_events(actor_id);
create index shopping_product on public.shopping_items(product_id,household_id);
create index shopping_expense on public.shopping_items(expense_id,household_id);
create index shopping_household on public.shopping_items(household_id,state);

alter table public.expense_history enable row level security;
alter table public.products enable row level security;
alter table public.shopping_items enable row level security;
alter table public.inventory_events enable row level security;
revoke all on public.expense_history,public.products,public.shopping_items,public.inventory_events from anon,authenticated;
grant select on public.expense_history,public.products,public.shopping_items,public.inventory_events to authenticated;
create policy history_members on public.expense_history for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy products_members on public.products for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy shopping_members on public.shopping_items for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy inventory_events_members on public.inventory_events for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));

-- Existing insert validation remains. Corrections may change the actual paid amount
-- without changing the original estimate of an already settled reservation.
create or replace function public.validate_expense() returns trigger language plpgsql security invoker set search_path='' as $$
declare f public.funds; r public.reservations;
begin
 select * into f from public.funds where id=new.fund_id and household_id=new.household_id;
 if not found then raise exception 'Fondo no disponible'; end if;
 if f.kind='voucher' and new.method<>'card' then raise exception 'Los vales solo permiten tarjeta'; end if;
 if new.occurred_on<f.starts_on then raise exception 'Fecha anterior al saldo inicial; requiere conciliación histórica'; end if;
 if new.reservation_id is not null then
  select * into r from public.reservations where id=new.reservation_id and fund_id=new.fund_id and household_id=new.household_id;
  if not found or (tg_op='INSERT' and r.amount_cents<>new.amount_cents) then raise exception 'El pago debe coincidir con la reserva'; end if;
 end if;
 return new;
end $$;
create trigger validate_expense_update before update on public.expenses for each row execute function public.validate_expense();

create function private.replenish_product(p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare p public.products;
begin
 select * into p from public.products where id=p_id;
 if p.on_hand<=p.minimum and p.target>p.on_hand then
  insert into public.shopping_items(household_id,product_id,quantity,automatic) values(p.household_id,p.id,p.target-p.on_hand,true)
  on conflict(household_id,product_id) where state in('pending','cart') do update
  set quantity=excluded.quantity,version=public.shopping_items.version+1,updated_at=now()
  where public.shopping_items.automatic and public.shopping_items.state='pending' and public.shopping_items.quantity<>excluded.quantity;
 else
  update public.shopping_items set state='removed',version=version+1,updated_at=now() where household_id=p.household_id and product_id=p.id and state='pending' and automatic;
 end if;
end $$;
revoke all on function private.replenish_product(uuid) from public,anon,authenticated;

create function private.market_command(p_household uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); actor text; e public.expenses; p public.products; s public.shopping_items;
 before_row jsonb; pid uuid; eid uuid; total bigint:=0; q numeric; delta numeric; line jsonb; count_lines integer:=0;
begin
 if uid is null or not exists(select 1 from public.memberships where user_id=uid and household_id=p_household) then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text,0));
 select coalesce((select username from private.pin_accounts where user_id=uid),'Usuario') into actor;
 if p_action='expense_edit' then
  select * into e from public.expenses where id=(p_data->>'id')::uuid and household_id=p_household for update;
  if not found then raise exception 'Gasto no encontrado'; end if;
  if p_data->>'version' is null or e.revision<>(p_data->>'version')::integer then raise exception 'Otro usuario modificó este gasto. Actualiza y revisa los cambios.'; end if;
  before_row=to_jsonb(e);
  update public.expenses set description=trim(p_data->>'description'),amount_cents=(p_data->>'amount_cents')::bigint,
   occurred_on=(p_data->>'occurred_on')::date,method=p_data->>'method',category=p_data->>'category',revision=revision+1,updated_at=now()
   where id=e.id returning * into e;
  insert into public.expense_history(household_id,expense_id,before_data,after_data,actor_id,actor_name) values(p_household,e.id,before_row,to_jsonb(e),uid,actor);
  return to_jsonb(e);
 elsif p_action='product_save' then
  pid=(p_data->>'id')::uuid;
  select * into p from public.products where id=pid and household_id=p_household for update;
  if found then
   if p_data->>'version' is null or p.version<>(p_data->>'version')::integer then raise exception 'El producto cambió. Actualiza antes de guardar.'; end if;
   update public.products set name=trim(p_data->>'name'),category=p_data->>'category',unit=p_data->>'unit',minimum=(p_data->>'minimum')::numeric,target=(p_data->>'target')::numeric,version=version+1,updated_at=now() where id=pid returning * into p;
  else
   if p_data->>'version' is not null then raise exception 'Producto no encontrado'; end if;
   insert into public.products(id,household_id,name,category,unit,on_hand,minimum,target) values(pid,p_household,trim(p_data->>'name'),p_data->>'category',p_data->>'unit',(p_data->>'on_hand')::numeric,(p_data->>'minimum')::numeric,(p_data->>'target')::numeric) returning * into p;
   insert into public.inventory_events(household_id,product_id,delta,balance,reason,actor_id,actor_name) values(p_household,pid,p.on_hand,p.on_hand,'Inventario inicial',uid,actor);
  end if;
  perform private.replenish_product(pid);return to_jsonb(p);
 elsif p_action='stock_adjust' then
  select * into p from public.products where id=(p_data->>'id')::uuid and household_id=p_household for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if p_data->>'version' is null or p.version<>(p_data->>'version')::integer then raise exception 'La existencia cambió. Actualiza y revisa la cantidad.'; end if;
  delta=(p_data->>'delta')::numeric;
  if delta is null or delta=0 or length(trim(coalesce(p_data->>'reason','')))=0 then raise exception 'Indica cantidad y motivo'; end if;
  update public.products set on_hand=on_hand+delta,version=version+1,updated_at=now() where id=p.id returning * into p;
  insert into public.inventory_events(household_id,product_id,delta,balance,reason,actor_id,actor_name) values(p_household,p.id,delta,p.on_hand,left(p_data->>'reason',200),uid,actor);
  perform private.replenish_product(p.id);return to_jsonb(p);
 elsif p_action='shopping_add' then
  select * into p from public.products where id=(p_data->>'product_id')::uuid and household_id=p_household;
  if not found then raise exception 'Producto no encontrado'; end if;
  select * into s from public.shopping_items where household_id=p_household and product_id=p.id and state in('pending','cart');
  if found then return to_jsonb(s); end if;
  insert into public.shopping_items(household_id,product_id,quantity,automatic) values(p_household,p.id,(p_data->>'quantity')::numeric,false) returning * into s;return to_jsonb(s);
 elsif p_action='shopping_edit' then
  select * into s from public.shopping_items where id=(p_data->>'id')::uuid and household_id=p_household for update;
  if not found or s.state not in('pending','cart') then raise exception 'El producto ya no está pendiente'; end if;
  if p_data->>'version' is null or s.version<>(p_data->>'version')::integer then raise exception 'La lista cambió en otro dispositivo. Actualiza y vuelve a intentar.'; end if;
  if p_data->>'state' is null or p_data->>'state' not in('pending','cart','removed') then raise exception 'Estado no válido'; end if;
  update public.shopping_items set quantity=(p_data->>'quantity')::numeric,unit_price_cents=(p_data->>'unit_price_cents')::bigint,state=p_data->>'state',automatic=false,version=version+1,updated_at=now() where id=s.id returning * into s;return to_jsonb(s);
 elsif p_action='checkout' then
  eid=(p_data->>'id')::uuid;
  select * into e from public.expenses where id=eid and household_id=p_household;
  if found then return to_jsonb(e); end if;
  if jsonb_typeof(p_data->'lines')<>'array' or jsonb_array_length(p_data->'lines') not between 1 and 300 then raise exception 'Selecciona productos en el carrito'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_data->'lines'))<>jsonb_array_length(p_data->'lines') then raise exception 'Productos duplicados'; end if;
  for line in select value from jsonb_array_elements(p_data->'lines') loop
   select * into s from public.shopping_items where id=(line->>'id')::uuid and household_id=p_household;
   if not found or s.state<>'cart' or line->>'version' is null or s.version<>(line->>'version')::integer then raise exception 'El carrito cambió. Revisa los productos antes de pagar.'; end if;
   if s.unit_price_cents is null then raise exception 'Falta el precio de un producto'; end if;
   total=total+round(s.quantity*s.unit_price_cents)::bigint;
   count_lines=count_lines+1;
  end loop;
  if p_data->>'total_cents' is null or total<>(p_data->>'total_cents')::bigint or total<=0 then raise exception 'Revisa el total del carrito'; end if;
  insert into public.expenses(id,household_id,fund_id,description,amount_cents,category,method,occurred_on,created_by)
   values(eid,p_household,(p_data->>'fund_id')::uuid,coalesce(nullif(trim(p_data->>'description'),''),'Compra de despensa'),total,'Despensa',p_data->>'method',(p_data->>'occurred_on')::date,uid) returning * into e;
  for line in select value from jsonb_array_elements(p_data->'lines') loop
   update public.shopping_items set state='bought',expense_id=eid,version=version+1,updated_at=now() where id=(line->>'id')::uuid and household_id=p_household returning * into s;
   update public.products set on_hand=on_hand+s.quantity,version=version+1,updated_at=now() where id=s.product_id and household_id=p_household returning * into p;
   insert into public.inventory_events(household_id,product_id,delta,balance,reason,actor_id,actor_name,expense_id) values(p_household,p.id,s.quantity,p.on_hand,'Compra',uid,actor,eid);
   perform private.replenish_product(p.id);
  end loop;
  return to_jsonb(e);
 end if;
 raise exception 'Acción no válida';
end $$;
revoke all on function private.market_command(uuid,text,jsonb) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.market_command(uuid,text,jsonb) to authenticated;
create function public.market_command(p_household uuid,p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.market_command(p_household,p_action,p_data); $$;
revoke all on function public.market_command(uuid,text,jsonb) from public,anon;
grant execute on function public.market_command(uuid,text,jsonb) to authenticated;

-- Only membership-filtered table events; PIN tables remain outside publication.
alter publication supabase_realtime add table public.products,public.shopping_items,public.expenses,public.reservations,public.inventory_events,public.expense_history;
