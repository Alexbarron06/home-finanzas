-- Server-only PIN credentials. No identities or activation tokens in source control.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
grant usage on schema private to service_role;
create table private.pin_accounts (
 username text primary key check(username ~ '^[a-z0-9_]{2,32}$'),
 email text not null unique,
 user_id uuid unique references auth.users(id),
 household_id uuid not null references public.households(id),
 pin_hash text,
 activation_hash text,
 activation_expires timestamptz,
 failed_attempts integer not null default 0,
 lock_count integer not null default 0,
 locked_until timestamptz,
 activated_at timestamptz
);
create index pin_accounts_household on private.pin_accounts(household_id);
alter table private.pin_accounts enable row level security;
create table private.pin_bootstrap (
 token_hash text primary key,
 expires_at timestamptz not null
);
alter table private.pin_bootstrap enable row level security;
grant select,insert,update,delete on private.pin_accounts,private.pin_bootstrap to service_role;

create function public.pin_provision(p_token text,p_action text,p_username text default null,p_user_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a private.pin_accounts;
begin
 if not exists(select 1 from private.pin_bootstrap where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now()) then
  return jsonb_build_object('ok',false);
 end if;
 if p_action='list' then
  return jsonb_build_object('ok',true,'accounts',coalesce((select jsonb_agg(jsonb_build_object('username',username,'email',email,'user_id',user_id)) from private.pin_accounts),'[]'::jsonb));
 elsif p_action='bind' then
  select * into a from private.pin_accounts where username=p_username for update;
  if not found or p_user_id is null then return jsonb_build_object('ok',false); end if;
  if a.user_id is not null and a.user_id<>p_user_id then return jsonb_build_object('ok',false); end if;
  update private.pin_accounts set user_id=p_user_id where username=p_username;
  insert into public.memberships(user_id,household_id) values(p_user_id,a.household_id) on conflict(user_id) do nothing;
  return jsonb_build_object('ok',true);
 elsif p_action='finish' then
  if exists(select 1 from private.pin_accounts where user_id is null) then return jsonb_build_object('ok',false); end if;
  delete from private.pin_bootstrap where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('ok',false);
end $$;
revoke all on function public.pin_provision(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.pin_provision(text,text,text,uuid) to service_role;

create function public.pin_authenticate(p_action text,p_username text,p_pin text,p_token text default null,p_user_id uuid default null,p_new_pin text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a private.pin_accounts; n integer;
begin
 if p_action not in('login','activate','change') or p_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false); end if;
 select * into a from private.pin_accounts where username=lower(trim(p_username)) for update;
 if not found or a.user_id is null then return jsonb_build_object('ok',false); end if;
 if p_action='activate' then
  if a.pin_hash is not null or a.activation_hash is null or a.activation_expires<=now() or
     p_token is null or a.activation_hash<>encode(extensions.digest(p_token,'sha256'),'hex') then return jsonb_build_object('ok',false); end if;
  update private.pin_accounts set pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',10)),activation_hash=null,activation_expires=null,activated_at=now(),failed_attempts=0,locked_until=null where username=a.username;
  return jsonb_build_object('ok',true,'email',a.email,'user_id',a.user_id);
 end if;
 if p_action='change' and (p_user_id is null or p_user_id<>a.user_id or p_new_pin is null or p_new_pin !~ '^[0-9]{4}$') then return jsonb_build_object('ok',false); end if;
 if a.pin_hash is null then return jsonb_build_object('ok',false); end if;
 if a.locked_until>now() then return jsonb_build_object('ok',false,'locked',true); end if;
 if extensions.crypt(p_pin,a.pin_hash)<>a.pin_hash then
  n=a.failed_attempts+1;
  update private.pin_accounts set failed_attempts=case when n>=5 then 0 else n end,
   locked_until=case when n>=5 then now()+make_interval(mins=>least(1440,15*power(2,least(a.lock_count,7))::integer)) else null end,
   lock_count=case when n>=5 then a.lock_count+1 else a.lock_count end where username=a.username;
  return jsonb_build_object('ok',false,'locked',n>=5);
 end if;
 update private.pin_accounts set failed_attempts=0,locked_until=null,lock_count=0,
  pin_hash=case when p_action='change' then extensions.crypt(p_new_pin,extensions.gen_salt('bf',10)) else pin_hash end where username=a.username;
 return jsonb_build_object('ok',true,'email',a.email,'user_id',a.user_id);
end $$;
revoke all on function public.pin_authenticate(text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.pin_authenticate(text,text,text,text,uuid,text) to service_role;

create policy pin_server_only on private.pin_accounts for all to service_role using(true) with check(true);
create policy bootstrap_server_only on private.pin_bootstrap for all to service_role using(true) with check(true);
