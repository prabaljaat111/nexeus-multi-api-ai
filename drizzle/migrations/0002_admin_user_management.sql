create or replace function public.admin_set_approval(_user_id uuid, _approved boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  update public.profiles set is_approved = _approved where id = _user_id;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
end $$;

create or replace function public.admin_set_disabled(_user_id uuid, _disabled boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if _disabled and _user_id = auth.uid() then raise exception 'cannot_disable_self' using errcode = 'P0001'; end if;
  update public.profiles set is_disabled = _disabled where id = _user_id;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
end $$;

create or replace function public.admin_set_admin(_user_id uuid, _grant boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = _user_id) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('uaw_admin_roles'));
  if _grant then
    insert into public.user_roles (user_id, role) values (_user_id, 'admin') on conflict (user_id, role) do nothing;
  else
    if exists (select 1 from public.user_roles where user_id = _user_id and role = 'admin')
       and (select count(*) from public.user_roles where role = 'admin') <= 1 then
      raise exception 'last_admin' using errcode = 'P0001';
    end if;
    delete from public.user_roles where user_id = _user_id and role = 'admin';
  end if;
end $$;

revoke execute on function public.admin_set_approval(uuid, boolean) from public, anon;
revoke execute on function public.admin_set_disabled(uuid, boolean) from public, anon;
revoke execute on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_approval(uuid, boolean) to authenticated;
grant execute on function public.admin_set_disabled(uuid, boolean) to authenticated;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;