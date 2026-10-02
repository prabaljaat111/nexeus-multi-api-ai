create table public.models (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  provider_model_id text not null,
  display_name text not null,
  capabilities jsonb not null default '{}'::jsonb,
  context_window integer,
  input_cost_per_million numeric,
  output_cost_per_million numeric,
  enabled boolean not null default true,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_model_id)
);
create index models_connection_idx on public.models(connection_id);

grant select on public.models to authenticated;
grant update (enabled, updated_at) on public.models to authenticated;
grant all on public.models to service_role;

alter table public.models enable row level security;

create or replace function public.can_view_connection(_connection_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_approved_user() and exists (
    select 1 from public.connections c where c.id = _connection_id and c.enabled and (
      (c.scope = 'personal' and c.owner_user_id = auth.uid()) or c.scope = 'global'))
$$;

create or replace function public.can_manage_connection(_connection_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_approved_user() and exists (
    select 1 from public.connections c where c.id = _connection_id and (
      (c.scope = 'personal' and c.owner_user_id = auth.uid()) or (c.scope = 'global' and public.is_admin())))
$$;

create policy "View models of accessible connections" on public.models
  for select to authenticated using (public.can_view_connection(connection_id) or public.can_manage_connection(connection_id));

create policy "Manage models of own or admin connections" on public.models
  for update to authenticated using (public.can_manage_connection(connection_id)) with check (public.can_manage_connection(connection_id));