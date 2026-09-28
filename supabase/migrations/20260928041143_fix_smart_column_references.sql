-- Qualify shopping item columns that share names with PL/pgSQL variables.
do $$
declare
 definition text;
begin
 select pg_get_functiondef('private.smart_shopping_command(uuid,text,jsonb)'::regprocedure) into definition;
 definition=replace(
  definition,
  'not exists(select 1 from public.shopping_items where household_id=p_household and product_id=product.id and state in(''suggested'',''planned'',''in_cart''))',
  'not exists(select 1 from public.shopping_items si where si.household_id=p_household and si.product_id=product.id and si.state in(''suggested'',''planned'',''in_cart''))'
 );
 definition=replace(
  definition,
  'select * into item from public.shopping_items where household_id=p_household and product_id=product_id and state in(''suggested'',''planned'',''in_cart'') for update',
  'select si.* into item from public.shopping_items si where si.household_id=p_household and si.product_id=product.id and si.state in(''suggested'',''planned'',''in_cart'') for update'
 );
 definition=replace(
  definition,
  'update public.shopping_items set state=''purchased'',expense_id=expense_id,version=version+1,updated_at=now() where id=item.id',
  'update public.shopping_items set state=''purchased'',expense_id=expense.id,version=version+1,updated_at=now() where id=item.id'
 );
 if position('si.product_id=product.id' in definition)=0
  or position('si.product_id=product.id and si.state' in definition)=0
  or position('expense_id=expense.id' in definition)=0 then
  raise exception 'Unexpected smart_shopping_command definition';
 end if;
 execute definition;
end $$;
