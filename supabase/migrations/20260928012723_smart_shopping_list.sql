-- Lista Inteligente: sesiones de compra, detalle por artículo y trazabilidad completa.

create table public.shopping_lists(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id),
 status text not null default 'active' check(status in('active','purchased','closed')),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 merchant text check(merchant is null or length(trim(merchant)) between 1 and 120),
 unique(id,household_id)
);
create unique index shopping_lists_one_active on public.shopping_lists(household_id) where status='active';
create index shopping_lists_household_status on public.shopping_lists(household_id,status,created_at desc);

create table public.purchases(
 id uuid primary key,
 household_id uuid not null references public.households(id),
 list_id uuid not null,
 purchased_on date not null,
 merchant text,
 salary_cents bigint not null default 0 check(salary_cents>=0),
 voucher_cents bigint not null default 0 check(voucher_cents>=0),
 total_cents bigint not null check(total_cents>0),
 item_count integer not null check(item_count>0),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique(list_id),
 unique(id,household_id),
 foreign key(list_id,household_id) references public.shopping_lists(id,household_id)
);
create index purchases_household_date on public.purchases(household_id,purchased_on desc);

alter table public.products
 add column usual_purchase_quantity numeric not null default 1 check(usual_purchase_quantity>0 and usual_purchase_quantity<=1000000),
 add column estimated_unit_price_cents bigint check(estimated_unit_price_cents is null or estimated_unit_price_cents between 0 and 100000000),
 add column last_unit_price_cents bigint check(last_unit_price_cents is null or last_unit_price_cents between 0 and 100000000),
 add column usual_fund_id uuid,
 add column recurring_days integer check(recurring_days is null or recurring_days between 1 and 3650),
 add column recurring_weekday smallint check(recurring_weekday is null or recurring_weekday between 1 and 7),
 add column essential boolean not null default false,
 add column last_purchase_on date,
 add foreign key(usual_fund_id,household_id) references public.funds(id,household_id);

alter table public.shopping_items drop constraint shopping_items_state_check;
alter table public.shopping_items
 add column list_id uuid,
 add column estimated_unit_price_cents bigint check(estimated_unit_price_cents is null or estimated_unit_price_cents between 0 and 100000000),
 add column fund_id uuid,
 add column priority text not null default 'optional' check(priority in('necessary','next','recurring','optional')),
 add column reason text check(reason is null or length(reason)<=200),
 add column payment_method text not null default 'card' check(payment_method in('cash','card'));
alter table public.shopping_items add constraint shopping_items_state_check
 check(state in('pending','cart','bought','removed','suggested','planned','in_cart','purchased','skipped'));
alter table public.shopping_items
 add foreign key(list_id,household_id) references public.shopping_lists(id,household_id),
 add foreign key(fund_id,household_id) references public.funds(id,household_id);

update public.shopping_items set state=case state when 'pending' then case when automatic then 'suggested' else 'planned' end when 'cart' then 'in_cart' when 'bought' then 'purchased' when 'removed' then 'skipped' else state end;
insert into public.shopping_lists(household_id,status,created_by,created_at)
select s.household_id,
 case when bool_or(s.state in('suggested','planned','in_cart')) then 'active' else 'closed' end,
 coalesce((select m.user_id from public.memberships m where m.household_id=s.household_id order by m.created_at limit 1),auth.uid()),
 min(s.updated_at)
from public.shopping_items s group by s.household_id;
update public.shopping_items s set list_id=l.id from public.shopping_lists l where l.household_id=s.household_id and s.list_id is null;

drop index public.shopping_active_product;
create unique index shopping_active_product on public.shopping_items(household_id,product_id)
 where state in('pending','cart','suggested','planned','in_cart');
create index shopping_items_list_state on public.shopping_items(list_id,state,updated_at desc);
create index shopping_items_fund on public.shopping_items(fund_id,household_id);

create table public.expense_items(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id),
 purchase_id uuid not null,
 expense_id uuid not null,
 shopping_item_id uuid not null unique references public.shopping_items(id),
 product_id uuid not null,
 fund_id uuid not null,
 product_name text not null,
 category text not null,
 unit text not null,
 quantity numeric not null check(quantity>0 and quantity<=1000000),
 unit_price_cents bigint not null check(unit_price_cents>=0 and unit_price_cents<=100000000),
 total_cents bigint not null check(total_cents>=0 and total_cents<=100000000),
 method text not null check(method in('cash','card')),
 created_at timestamptz not null default now(),
 unique(id,household_id),
 foreign key(purchase_id,household_id) references public.purchases(id,household_id),
 foreign key(expense_id,household_id) references public.expenses(id,household_id),
 foreign key(product_id,household_id) references public.products(id,household_id),
 foreign key(fund_id,household_id) references public.funds(id,household_id)
);
create index expense_items_purchase on public.expense_items(purchase_id,household_id);
create index expense_items_expense on public.expense_items(expense_id,household_id);
create index expense_items_product on public.expense_items(product_id,created_at desc);

create table public.product_price_history(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id),
 product_id uuid not null,
 purchase_id uuid not null,
 expense_item_id uuid not null unique,
 fund_id uuid not null,
 purchased_on date not null,
 quantity numeric not null check(quantity>0),
 unit_price_cents bigint not null check(unit_price_cents>=0),
 merchant text,
 created_at timestamptz not null default now(),
 foreign key(product_id,household_id) references public.products(id,household_id),
 foreign key(purchase_id,household_id) references public.purchases(id,household_id),
 foreign key(expense_item_id,household_id) references public.expense_items(id,household_id),
 foreign key(fund_id,household_id) references public.funds(id,household_id)
);
create index price_history_product_date on public.product_price_history(product_id,purchased_on desc);
create index price_history_household on public.product_price_history(household_id,purchased_on desc);

alter table public.shopping_lists enable row level security;
alter table public.purchases enable row level security;
alter table public.expense_items enable row level security;
alter table public.product_price_history enable row level security;
revoke all on public.shopping_lists,public.purchases,public.expense_items,public.product_price_history from anon,authenticated;
grant select on public.shopping_lists,public.purchases,public.expense_items,public.product_price_history to authenticated;
create policy shopping_lists_members on public.shopping_lists for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy purchases_members on public.purchases for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy expense_items_members on public.expense_items for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));
create policy price_history_members on public.product_price_history for select to authenticated using(household_id in(select household_id from public.memberships where user_id=(select auth.uid())));

create or replace function private.ensure_active_shopping_list(p_household uuid,p_uid uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 select id into result from public.shopping_lists where household_id=p_household and status='active' for update;
 if result is null then
  insert into public.shopping_lists(household_id,created_by) values(p_household,p_uid) returning id into result;
 end if;
 return result;
end $$;
revoke all on function private.ensure_active_shopping_list(uuid,uuid) from public,anon,authenticated;

create or replace function private.smart_shopping_command(p_household uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); actor text; listid uuid; product public.products; item public.shopping_items; fund public.funds;
 purchase public.purchases; expense public.expenses; detail public.expense_items; line jsonb; total bigint:=0; salary bigint:=0; voucher bigint:=0;
 line_total bigint; count_lines integer:=0; expense_id uuid; group_row record; new_list uuid; product_id uuid; state_value text;
begin
 if uid is null or not exists(select 1 from public.memberships where user_id=uid and household_id=p_household) then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text,0));
 select coalesce((select username from private.pin_accounts where user_id=uid),'Usuario') into actor;
 listid=private.ensure_active_shopping_list(p_household,uid);

 if p_action='sync' then
  update public.shopping_items set state=case when state='pending' then case when automatic then 'suggested' else 'planned' end when 'cart' then 'in_cart' when 'bought' then 'purchased' when 'removed' then 'skipped' else state end,
   list_id=coalesce(list_id,listid),version=version+1,updated_at=now()
  where household_id=p_household and (state in('pending','cart','bought','removed') or list_id is null);
  update public.shopping_items s set state='skipped',version=s.version+1,updated_at=now()
  from public.products p
  where s.household_id=p_household and s.product_id=p.id and s.automatic and s.state='suggested'
   and not(
    (p.on_hand=0 and p.target>0)
    or (p.on_hand<=p.minimum and p.target>p.on_hand)
    or (p.recurring_days is not null and (p.last_purchase_on is null or p.last_purchase_on+p.recurring_days<=current_date+3))
   );
  for product in select * from public.products where household_id=p_household loop
   if not exists(select 1 from public.shopping_items where household_id=p_household and product_id=product.id and state in('suggested','planned','in_cart')) then
    if product.on_hand=0 and product.target>0 then
     insert into public.shopping_items(household_id,list_id,product_id,quantity,estimated_unit_price_cents,fund_id,state,automatic,priority,reason)
     values(p_household,listid,product.id,greatest(product.target,product.usual_purchase_quantity),coalesce(product.estimated_unit_price_cents,product.last_unit_price_cents),product.usual_fund_id,'suggested',true,'necessary','Producto terminado');
    elsif product.on_hand<=product.minimum and product.target>product.on_hand then
     insert into public.shopping_items(household_id,list_id,product_id,quantity,estimated_unit_price_cents,fund_id,state,automatic,priority,reason)
     values(p_household,listid,product.id,greatest(product.target-product.on_hand,product.usual_purchase_quantity),coalesce(product.estimated_unit_price_cents,product.last_unit_price_cents),product.usual_fund_id,'suggested',true,'next','Stock bajo');
    elsif product.recurring_days is not null and (product.last_purchase_on is null or product.last_purchase_on+product.recurring_days<=current_date+3) then
     insert into public.shopping_items(household_id,list_id,product_id,quantity,estimated_unit_price_cents,fund_id,state,automatic,priority,reason)
     values(p_household,listid,product.id,product.usual_purchase_quantity,coalesce(product.estimated_unit_price_cents,product.last_unit_price_cents),product.usual_fund_id,'suggested',true,'recurring','Compra recurrente próxima');
    end if;
   end if;
  end loop;
  return jsonb_build_object('list_id',listid);

 elsif p_action='product_save' then
  product_id=(p_data->>'id')::uuid;
  select * into product from public.products where id=product_id and household_id=p_household for update;
  if found then
   if p_data->>'version' is null or product.version<>(p_data->>'version')::integer then raise exception 'El producto cambió. Actualiza antes de guardar.'; end if;
   update public.products set name=trim(p_data->>'name'),category=p_data->>'category',unit=p_data->>'unit',minimum=(p_data->>'minimum')::numeric,target=(p_data->>'target')::numeric,
    usual_purchase_quantity=(p_data->>'usual_purchase_quantity')::numeric,estimated_unit_price_cents=nullif(p_data->>'estimated_unit_price_cents','')::bigint,
    usual_fund_id=nullif(p_data->>'usual_fund_id','')::uuid,recurring_days=nullif(p_data->>'recurring_days','')::integer,recurring_weekday=nullif(p_data->>'recurring_weekday','')::smallint,
    essential=coalesce((p_data->>'essential')::boolean,false),version=version+1,updated_at=now()
   where id=product_id returning * into product;
  else
   insert into public.products(id,household_id,name,category,unit,on_hand,minimum,target,usual_purchase_quantity,estimated_unit_price_cents,usual_fund_id,recurring_days,recurring_weekday,essential)
   values(product_id,p_household,trim(p_data->>'name'),p_data->>'category',p_data->>'unit',(p_data->>'on_hand')::numeric,(p_data->>'minimum')::numeric,(p_data->>'target')::numeric,
    (p_data->>'usual_purchase_quantity')::numeric,nullif(p_data->>'estimated_unit_price_cents','')::bigint,nullif(p_data->>'usual_fund_id','')::uuid,nullif(p_data->>'recurring_days','')::integer,nullif(p_data->>'recurring_weekday','')::smallint,coalesce((p_data->>'essential')::boolean,false)) returning * into product;
   insert into public.inventory_events(household_id,product_id,delta,balance,reason,actor_id,actor_name) values(p_household,product_id,product.on_hand,product.on_hand,'Inventario inicial',uid,actor);
  end if;
  return to_jsonb(product);

 elsif p_action='add' then
  product_id=nullif(p_data->>'product_id','')::uuid;
  if product_id is null then
   select * into product from public.products where household_id=p_household and lower(trim(name))=lower(trim(p_data->>'name')) for update;
   if not found then
    insert into public.products(id,household_id,name,category,unit,on_hand,minimum,target,usual_purchase_quantity,estimated_unit_price_cents,usual_fund_id)
    values(coalesce(nullif(p_data->>'new_product_id','')::uuid,gen_random_uuid()),p_household,trim(p_data->>'name'),p_data->>'category',p_data->>'unit',0,0,0,(p_data->>'quantity')::numeric,nullif(p_data->>'estimated_unit_price_cents','')::bigint,nullif(p_data->>'fund_id','')::uuid)
    returning * into product;
    insert into public.inventory_events(household_id,product_id,delta,balance,reason,actor_id,actor_name) values(p_household,product.id,0,0,'Producto creado desde la lista',uid,actor);
   end if;
   product_id=product.id;
  else
   select * into product from public.products where id=product_id and household_id=p_household;
   if not found then raise exception 'Producto no encontrado'; end if;
  end if;
  select * into item from public.shopping_items where household_id=p_household and product_id=product_id and state in('suggested','planned','in_cart') for update;
  if found then
   update public.shopping_items set state='planned',automatic=false,quantity=(p_data->>'quantity')::numeric,
    estimated_unit_price_cents=coalesce(nullif(p_data->>'estimated_unit_price_cents','')::bigint,estimated_unit_price_cents),fund_id=coalesce(nullif(p_data->>'fund_id','')::uuid,fund_id),
    priority=coalesce(nullif(p_data->>'priority',''),'optional'),reason=coalesce(nullif(p_data->>'reason',''),'Agregado manualmente'),version=version+1,updated_at=now()
   where id=item.id returning * into item;
  else
   insert into public.shopping_items(household_id,list_id,product_id,quantity,estimated_unit_price_cents,fund_id,state,automatic,priority,reason)
   values(p_household,listid,product_id,(p_data->>'quantity')::numeric,nullif(p_data->>'estimated_unit_price_cents','')::bigint,nullif(p_data->>'fund_id','')::uuid,'planned',false,coalesce(nullif(p_data->>'priority',''),'optional'),coalesce(nullif(p_data->>'reason',''),'Agregado manualmente')) returning * into item;
  end if;
  return to_jsonb(item);

 elsif p_action='add_suggested' then
  update public.shopping_items set state='planned',automatic=false,version=version+1,updated_at=now()
  where household_id=p_household and list_id=listid and state='suggested' and (coalesce(p_data->>'id','')='' or id=(p_data->>'id')::uuid);
  return jsonb_build_object('updated',found);

 elsif p_action='edit' then
  select * into item from public.shopping_items where id=(p_data->>'id')::uuid and household_id=p_household for update;
  if not found or item.state not in('suggested','planned','in_cart') then raise exception 'El producto ya no está disponible en esta lista'; end if;
  if p_data->>'version' is null or item.version<>(p_data->>'version')::integer then raise exception 'La lista cambió en otro dispositivo. Actualiza y vuelve a intentar.'; end if;
  state_value=p_data->>'state';
  if state_value not in('planned','in_cart','skipped') then raise exception 'Estado no válido'; end if;
  if state_value='in_cart' and (coalesce(nullif(p_data->>'unit_price_cents','')::bigint,0)<=0 or nullif(p_data->>'fund_id','') is null) then raise exception 'Registra un precio real mayor a cero y la fuente de pago'; end if;
  select * into fund from public.funds where id=nullif(p_data->>'fund_id','')::uuid and household_id=p_household;
  if state_value='in_cart' and not found then raise exception 'Fuente de pago no válida'; end if;
  if state_value='in_cart' and fund.kind='voucher' and p_data->>'payment_method'<>'card' then raise exception 'Los Vales solo pueden pagarse con tarjeta'; end if;
  update public.shopping_items set quantity=(p_data->>'quantity')::numeric,unit_price_cents=nullif(p_data->>'unit_price_cents','')::bigint,
   estimated_unit_price_cents=coalesce(nullif(p_data->>'estimated_unit_price_cents','')::bigint,estimated_unit_price_cents),fund_id=nullif(p_data->>'fund_id','')::uuid,
   payment_method=coalesce(nullif(p_data->>'payment_method',''),'card'),state=state_value,automatic=false,version=version+1,updated_at=now()
  where id=item.id returning * into item;
  return to_jsonb(item);

 elsif p_action='checkout' then
  select * into purchase from public.purchases where id=(p_data->>'id')::uuid and household_id=p_household;
  if found then return to_jsonb(purchase); end if;
  if jsonb_typeof(p_data->'lines')<>'array' or jsonb_array_length(p_data->'lines') not between 1 and 300 then raise exception 'Selecciona productos en el carrito'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_data->'lines'))<>jsonb_array_length(p_data->'lines') then raise exception 'Productos duplicados'; end if;
  for line in select value from jsonb_array_elements(p_data->'lines') loop
   select * into item from public.shopping_items where id=(line->>'id')::uuid and household_id=p_household and list_id=listid for update;
   if not found or item.state<>'in_cart' or line->>'version' is null or item.version<>(line->>'version')::integer then raise exception 'El carrito cambió. Revisa los productos antes de pagar.'; end if;
   if item.unit_price_cents is null or item.fund_id is null then raise exception 'Falta precio o fuente de pago'; end if;
   select * into fund from public.funds where id=item.fund_id and household_id=p_household;
   if not found or (fund.kind='voucher' and item.payment_method<>'card') then raise exception 'Fuente o medio de pago no válido'; end if;
   line_total=round(item.quantity*item.unit_price_cents)::bigint;
   total=total+line_total; count_lines=count_lines+1;
   if fund.kind='voucher' then voucher=voucher+line_total; else salary=salary+line_total; end if;
  end loop;
  if total<=0 or total<>coalesce((p_data->>'total_cents')::bigint,-1) then raise exception 'Revisa el total del carrito'; end if;
  insert into public.purchases(id,household_id,list_id,purchased_on,merchant,salary_cents,voucher_cents,total_cents,item_count,created_by)
  values((p_data->>'id')::uuid,p_household,listid,(p_data->>'purchased_on')::date,nullif(trim(p_data->>'merchant'),''),salary,voucher,total,count_lines,uid) returning * into purchase;
  for group_row in
   select s.fund_id,s.payment_method,f.name as fund_name,sum(round(s.quantity*s.unit_price_cents))::bigint as amount
   from public.shopping_items s join public.funds f on f.id=s.fund_id and f.household_id=s.household_id
   where s.household_id=p_household and s.list_id=listid and s.state='in_cart' and s.id in(select (value->>'id')::uuid from jsonb_array_elements(p_data->'lines'))
   group by s.fund_id,s.payment_method,f.name
  loop
   expense_id=gen_random_uuid();
   insert into public.expenses(id,household_id,fund_id,description,amount_cents,category,method,occurred_on,created_by)
   values(expense_id,p_household,group_row.fund_id,'Compra del hogar · '||group_row.fund_name,group_row.amount,'Despensa',group_row.payment_method,purchase.purchased_on,uid) returning * into expense;
   for item in
    select s.* from public.shopping_items s where s.household_id=p_household and s.list_id=listid and s.state='in_cart' and s.fund_id=group_row.fund_id and s.payment_method=group_row.payment_method
     and s.id in(select (value->>'id')::uuid from jsonb_array_elements(p_data->'lines')) for update
   loop
    select * into product from public.products where id=item.product_id and household_id=p_household for update;
    line_total=round(item.quantity*item.unit_price_cents)::bigint;
    insert into public.expense_items(household_id,purchase_id,expense_id,shopping_item_id,product_id,fund_id,product_name,category,unit,quantity,unit_price_cents,total_cents,method)
    values(p_household,purchase.id,expense_id,item.id,product.id,item.fund_id,product.name,product.category,product.unit,item.quantity,item.unit_price_cents,line_total,item.payment_method) returning * into detail;
    insert into public.product_price_history(household_id,product_id,purchase_id,expense_item_id,fund_id,purchased_on,quantity,unit_price_cents,merchant)
    values(p_household,product.id,purchase.id,detail.id,item.fund_id,purchase.purchased_on,item.quantity,item.unit_price_cents,purchase.merchant);
    update public.products set on_hand=on_hand+item.quantity,last_unit_price_cents=item.unit_price_cents,estimated_unit_price_cents=item.unit_price_cents,
     last_purchase_on=purchase.purchased_on,usual_purchase_quantity=item.quantity,usual_fund_id=item.fund_id,version=version+1,updated_at=now()
    where id=product.id returning * into product;
    insert into public.inventory_events(household_id,product_id,delta,balance,reason,actor_id,actor_name,expense_id)
    values(p_household,product.id,item.quantity,product.on_hand,'Compra inteligente',uid,actor,expense_id);
    update public.shopping_items set state='purchased',expense_id=expense_id,version=version+1,updated_at=now() where id=item.id;
   end loop;
  end loop;
  update public.shopping_lists set status='purchased',completed_at=now(),merchant=purchase.merchant where id=listid;
  if exists(select 1 from public.shopping_items where list_id=listid and state in('suggested','planned')) then
   insert into public.shopping_lists(household_id,status,created_by) values(p_household,'active',uid) returning id into new_list;
   update public.shopping_items set list_id=new_list,version=version+1,updated_at=now() where list_id=listid and state in('suggested','planned');
  end if;
  return to_jsonb(purchase);
 end if;
 raise exception 'Acción no válida';
end $$;
revoke all on function private.smart_shopping_command(uuid,text,jsonb) from public,anon;
grant execute on function private.smart_shopping_command(uuid,text,jsonb) to authenticated;

create or replace function public.smart_shopping_command(p_household uuid,p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.smart_shopping_command(p_household,p_action,p_data); $$;
revoke all on function public.smart_shopping_command(uuid,text,jsonb) from public,anon;
grant execute on function public.smart_shopping_command(uuid,text,jsonb) to authenticated;

alter publication supabase_realtime add table public.shopping_lists,public.purchases,public.expense_items,public.product_price_history;
