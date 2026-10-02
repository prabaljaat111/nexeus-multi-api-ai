create table public.connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid,
  scope text not null check (scope in ('personal','global')),
  name text not null check (char_length(name) between 1 and 100),
  provider_type text not null check (provider_type in ('openai','anthropic','gemini','openrouter','openai_compatible')),
  base_url text,
  encrypted_api_key text not null,
  key_hint text,
  enabled boolean not null default true,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connections_scope_owner check (
    (scope = 'personal' and owner_user_id is not null) or (scope = 'global' and owner_user_id is null)),
  constraint connections_compat_base_url check (provider_type <> 'openai_compatible' or base_url is not null)
);
create index connections_owner_idx on public.connections(owner_user_id);

-- Clients may read only safe metadata columns; the encrypted key is never selectable.
grant select (id, owner_user_id, scope, name, provider_type, base_url, key_hint, enabled,
  last_tested_at, last_test_status, last_test_message, created_at, updated_at)
  on public.connections to authenticated;
grant all on public.connections to service_role;

alter table public.connections enable row level security;

create policy "Owners read personal connections" on public.connections
  for select to authenticated
  using (scope = 'personal' and owner_user_id = auth.uid() and public.is_active_approved_user());

create policy "Approved users read global connections" on public.connections
  for select to authenticated
  using (scope = 'global' and public.is_active_approved_user());