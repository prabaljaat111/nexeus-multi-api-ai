create table public.attachment_extractions (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null unique references public.chat_attachments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  extracted_text text,
  structured_metadata jsonb not null default '{}'::jsonb,
  source_map jsonb not null default '{}'::jsonb,
  extraction_status text not null check (extraction_status in ('queued','processing','complete','unsupported','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attachment_extractions_user on public.attachment_extractions(user_id);
grant select (id, attachment_id, user_id, structured_metadata, extraction_status, error_message, created_at, updated_at) on public.attachment_extractions to authenticated;
grant all on public.attachment_extractions to service_role;
alter table public.attachment_extractions enable row level security;
create policy "Users read own extractions" on public.attachment_extractions for select to authenticated
  using (user_id = auth.uid() and public.is_active_approved_user());
create policy "Admins read all extractions" on public.attachment_extractions for select to authenticated
  using (public.is_admin());

create table public.tool_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  tool_name text not null check (char_length(tool_name) between 1 and 60),
  status text not null check (status in ('queued','running','complete','failed','cancelled')),
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tool_runs_user_created on public.tool_runs(user_id, created_at desc);
create index tool_runs_chat on public.tool_runs(chat_id, created_at desc);
grant select on public.tool_runs to authenticated;
grant all on public.tool_runs to service_role;
alter table public.tool_runs enable row level security;
create policy "Users read own tool runs" on public.tool_runs for select to authenticated
  using (user_id = auth.uid() and public.is_active_approved_user());
create policy "Admins read all tool runs" on public.tool_runs for select to authenticated
  using (public.is_admin());

alter table public.messages add column if not exists citations jsonb;