-- Mark a product as finished and optionally plan its replacement atomically.
do $migration$
declare
 definition text;
 needle text:=$needle$
 elsif p_action='add' then$needle$;
 replacement text:=$branch$
 elsif p_action='finish_and_plan' then
  product_id=(p_data->>'id')::uuid;
  select * into product from public.products where id=product_id and household_id=p_household for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if p_data->>'version' is null or product.version<>(p_data->>'version')::integer then raise exception 'La existencia cambió. Actualiza antes de continuar.'; end if;
  if coalesce((p_data->>'add_to_list')::boolean,true) and (
   p_data->>'quantity' is null or (p_data->>'quantity')::numeric<=0 or (p_data->>'quantity')::numeric>1000000
  ) then raise exception 'Indica una cantidad para comprar mayor a cero'; end if;
  if product.on_hand>0 then
   insert into public.inventory_events(household_id,product_id,delta,balance,reason,actor_id,actor_name)
   values(p_household,product.id,-product.on_hand,0,'Producto terminado',uid,actor);
   update public.products set on_hand=0,version=version+1,updated_at=now() where id=product.id returning * into product;
  end if;
  if coalesce((p_data->>'add_to_list')::boolean,true) then
   select si.* into item from public.shopping_items si
   where si.household_id=p_household and si.product_id=product.id and si.state in('suggested','planned','in_cart') for update;
   if found then
    update public.shopping_items set
     list_id=listid,state=case when item.state='in_cart' then 'in_cart' else 'planned' end,automatic=false,
     quantity=(p_data->>'quantity')::numeric,
     estimated_unit_price_cents=coalesce(estimated_unit_price_cents,product.estimated_unit_price_cents,product.last_unit_price_cents),
     fund_id=coalesce(fund_id,product.usual_fund_id),priority='necessary',reason='Producto terminado',version=version+1,updated_at=now()
    where id=item.id returning * into item;
   else
    insert into public.shopping_items(household_id,list_id,product_id,quantity,estimated_unit_price_cents,fund_id,state,automatic,priority,reason)
    values(p_household,listid,product.id,(p_data->>'quantity')::numeric,coalesce(product.estimated_unit_price_cents,product.last_unit_price_cents),product.usual_fund_id,'planned',false,'necessary','Producto terminado')
    returning * into item;
   end if;
  end if;
  return jsonb_build_object('product',to_jsonb(product),'item',to_jsonb(item));

 elsif p_action='add' then$branch$;
begin
 select pg_get_functiondef('private.smart_shopping_command(uuid,text,jsonb)'::regprocedure) into definition;
 if position('p_action=''finish_and_plan''' in definition)>0 then return; end if;
 if position(needle in definition)=0 then raise exception 'Unexpected smart_shopping_command definition'; end if;
 definition=replace(definition,needle,replacement);
 execute definition;
end $migration$;
