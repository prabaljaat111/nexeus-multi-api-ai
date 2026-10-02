alter table public.profiles add column if not exists is_approved boolean not null default false;
alter table public.user_roles add column if not exists created_at timestamptz not null default now();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') $$;

create or replace function public.is_active_approved_user()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and is_approved and not is_disabled) $$;

revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_active_approved_user() from anon;

-- Protect admin-only profile fields
create or replace function public.protect_profile_admin_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Profile id cannot change';
  end if;
  if (new.is_disabled is distinct from old.is_disabled or new.is_approved is distinct from old.is_approved)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only admins can change approval or account status';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

-- Race-safe first-admin signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  first_user boolean;
begin
  perform pg_advisory_xact_lock(hashtext('uaw_first_admin'));
  select not exists (select 1 from public.user_roles where role = 'admin') into first_user;

  insert into public.profiles (id, display_name, avatar_url, is_approved)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url',
          first_user);
  insert into public.user_roles (user_id, role) values (new.id, case when first_user then 'admin'::public.app_role else 'user'::public.app_role end);
  return new;
end $$;

-- Backfill: if no admin exists yet, the earliest existing user becomes the approved admin
insert into public.user_roles (user_id, role)
select p.id, 'admin'::public.app_role from public.profiles p
where not exists (select 1 from public.user_roles where role = 'admin')
order by p.created_at asc limit 1
on conflict (user_id, role) do nothing;
update public.profiles set is_approved = true
where id in (select user_id from public.user_roles where role = 'admin');

-- Admin role management enforced in the database
grant insert, delete on public.user_roles to authenticated;
create policy "Admins insert roles" on public.user_roles for insert to authenticated with check (public.is_admin());
create policy "Admins delete roles" on public.user_roles for delete to authenticated using (public.is_admin() and user_id <> auth.uid());