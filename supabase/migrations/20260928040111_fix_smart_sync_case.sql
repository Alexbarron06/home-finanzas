-- Repair the searched CASE expression used by the sync action. The original
-- function treated the text literal "cart" as the boolean condition of WHEN.
do $$
declare
 definition text;
 broken text := 'state=case when state=''pending'' then case when automatic then';
 repaired text := 'state=case state when ''pending'' then case when automatic then';
begin
 select pg_get_functiondef('private.smart_shopping_command(uuid,text,jsonb)'::regprocedure) into definition;
 if position(broken in definition)>0 then
  execute replace(definition,broken,repaired);
 elsif position(repaired in definition)=0 then
  raise exception 'Unexpected smart_shopping_command definition';
 end if;
end $$;
