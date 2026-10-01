-- Preserve exact line totals while keeping a calculated unit price for history.
alter table public.shopping_items
  add column estimated_total_price_cents bigint
    check(estimated_total_price_cents is null or estimated_total_price_cents between 0 and 100000000),
  add column total_price_cents bigint
    check(total_price_cents is null or total_price_cents between 0 and 100000000);

update public.shopping_items
set estimated_total_price_cents=round(quantity*estimated_unit_price_cents)::bigint
where estimated_unit_price_cents is not null;

update public.shopping_items
set total_price_cents=round(quantity*unit_price_cents)::bigint
where unit_price_cents is not null;

do $migration$
declare
 definition text;
 original text;
begin
 select pg_get_functiondef('private.smart_shopping_command(uuid,text,jsonb)'::regprocedure) into definition;
 original=definition;

 definition=replace(definition,
  $old$estimated_unit_price_cents=coalesce(nullif(p_data->>'estimated_unit_price_cents','')::bigint,estimated_unit_price_cents),fund_id=coalesce(nullif(p_data->>'fund_id','')::uuid,fund_id),$old$,
  $new$estimated_unit_price_cents=coalesce(nullif(p_data->>'estimated_unit_price_cents','')::bigint,estimated_unit_price_cents),
    estimated_total_price_cents=coalesce(nullif(p_data->>'estimated_total_price_cents','')::bigint,estimated_total_price_cents),fund_id=coalesce(nullif(p_data->>'fund_id','')::uuid,fund_id),$new$);

 definition=replace(definition,
  $old$insert into public.shopping_items(household_id,list_id,product_id,quantity,estimated_unit_price_cents,fund_id,state,automatic,priority,reason)
   values(p_household,listid,product_id,(p_data->>'quantity')::numeric,nullif(p_data->>'estimated_unit_price_cents','')::bigint,nullif(p_data->>'fund_id','')::uuid,'planned',false,coalesce(nullif(p_data->>'priority',''),'optional'),coalesce(nullif(p_data->>'reason',''),'Agregado manualmente'))$old$,
  $new$insert into public.shopping_items(household_id,list_id,product_id,quantity,estimated_unit_price_cents,estimated_total_price_cents,fund_id,state,automatic,priority,reason)
   values(p_household,listid,product_id,(p_data->>'quantity')::numeric,nullif(p_data->>'estimated_unit_price_cents','')::bigint,nullif(p_data->>'estimated_total_price_cents','')::bigint,nullif(p_data->>'fund_id','')::uuid,'planned',false,coalesce(nullif(p_data->>'priority',''),'optional'),coalesce(nullif(p_data->>'reason',''),'Agregado manualmente'))$new$);

 definition=replace(definition,
  $old$if state_value='in_cart' and (coalesce(nullif(p_data->>'unit_price_cents','')::bigint,0)<=0 or nullif(p_data->>'fund_id','') is null) then raise exception 'Registra un precio real mayor a cero y la fuente de pago'; end if;$old$,
  $new$if state_value='in_cart' and (coalesce(nullif(p_data->>'total_price_cents','')::bigint,round((p_data->>'quantity')::numeric*nullif(p_data->>'unit_price_cents','')::bigint)::bigint,0)<=0 or nullif(p_data->>'fund_id','') is null) then raise exception 'Registra un precio real mayor a cero y la fuente de pago'; end if;$new$);

 definition=replace(definition,
  $old$update public.shopping_items set quantity=(p_data->>'quantity')::numeric,unit_price_cents=nullif(p_data->>'unit_price_cents','')::bigint,
   estimated_unit_price_cents=coalesce(nullif(p_data->>'estimated_unit_price_cents','')::bigint,estimated_unit_price_cents),fund_id=nullif(p_data->>'fund_id','')::uuid,$old$,
  $new$update public.shopping_items set quantity=(p_data->>'quantity')::numeric,
   unit_price_cents=coalesce(nullif(p_data->>'unit_price_cents','')::bigint,round(nullif(p_data->>'total_price_cents','')::bigint/(p_data->>'quantity')::numeric)::bigint),
   total_price_cents=coalesce(nullif(p_data->>'total_price_cents','')::bigint,round((p_data->>'quantity')::numeric*nullif(p_data->>'unit_price_cents','')::bigint)::bigint),
   estimated_unit_price_cents=coalesce(nullif(p_data->>'estimated_unit_price_cents','')::bigint,estimated_unit_price_cents),
   estimated_total_price_cents=coalesce(nullif(p_data->>'estimated_total_price_cents','')::bigint,estimated_total_price_cents),fund_id=nullif(p_data->>'fund_id','')::uuid,$new$);

 definition=replace(definition,
  $old$if item.unit_price_cents is null or item.fund_id is null then raise exception 'Falta precio o fuente de pago'; end if;$old$,
  $new$if (item.total_price_cents is null and item.unit_price_cents is null) or item.fund_id is null then raise exception 'Falta precio o fuente de pago'; end if;$new$);

 definition=replace(definition,
  $old$line_total=round(item.quantity*item.unit_price_cents)::bigint;$old$,
  $new$line_total=coalesce(item.total_price_cents,round(item.quantity*item.unit_price_cents)::bigint);$new$);

 definition=replace(definition,
  $old$sum(round(s.quantity*s.unit_price_cents))::bigint as amount$old$,
  $new$sum(coalesce(s.total_price_cents,round(s.quantity*s.unit_price_cents)::bigint))::bigint as amount$new$);

 if definition=original then raise exception 'Unexpected smart_shopping_command definition'; end if;
 if position('total_price_cents=coalesce' in definition)=0 or position('estimated_total_price_cents' in definition)=0 then
  raise exception 'Could not add total price support to smart_shopping_command';
 end if;
 execute definition;
end
$migration$;
