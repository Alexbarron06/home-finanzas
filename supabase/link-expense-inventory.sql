-- Attach stock to an existing expense once. The expense and its financial balance stay unchanged.
create function private.link_expense_inventory(p_household uuid,p_expense uuid,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); actor text; e public.expenses; p public.products; line jsonb; q numeric; result jsonb:='[]'::jsonb;
begin
 if uid is null or not exists(select 1 from public.memberships where household_id=p_household and user_id=uid) then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text,0));
 select * into e from public.expenses where household_id=p_household and id=p_expense;
 if not found then raise exception 'Gasto no encontrado'; end if;
 if exists(select 1 from public.inventory_events where household_id=p_household and expense_id=p_expense) then raise exception 'Este gasto ya tiene productos vinculados. Actualiza el inventario y revisa el historial.'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 productos'; end if;
 if (select count(distinct value->>'product_id') from jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines) then raise exception 'No repitas un producto'; end if;
 select coalesce((select username from private.pin_accounts where user_id=uid),'Usuario') into actor;
 for line in select value from jsonb_array_elements(p_lines) loop
  if (line->>'product_id') is null or (line->>'quantity') is null or (line->>'quantity') !~ '^([0-9]+)([.][0-9]{1,3})?$' then raise exception 'Revisa las cantidades'; end if;
  q=(line->>'quantity')::numeric;
  if q<=0 or q>1000000 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  select * into p from public.products where household_id=p_household and id=(line->>'product_id')::uuid for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  update public.products set on_hand=on_hand+q,version=version+1,updated_at=now() where id=p.id returning * into p;
  insert into public.inventory_events(household_id,product_id,delta,balance,reason,actor_id,actor_name,expense_id)
   values(p_household,p.id,q,p.on_hand,'Vinculado a gasto',uid,actor,p_expense);
  perform private.replenish_product(p.id);
  result=result||jsonb_build_object('product_id',p.id,'quantity',q);
 end loop;
 return result;
end $$;
revoke all on function private.link_expense_inventory(uuid,uuid,jsonb) from public,anon;
grant execute on function private.link_expense_inventory(uuid,uuid,jsonb) to authenticated;
create function public.link_expense_inventory(p_household uuid,p_expense uuid,p_lines jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.link_expense_inventory(p_household,p_expense,p_lines); $$;
revoke all on function public.link_expense_inventory(uuid,uuid,jsonb) from public,anon;
grant execute on function public.link_expense_inventory(uuid,uuid,jsonb) to authenticated;
