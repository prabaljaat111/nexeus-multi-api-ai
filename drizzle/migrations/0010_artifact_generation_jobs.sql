create table public.artifact_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete set null,
  output_message_id uuid references public.messages(id) on delete set null,
  model_id uuid references public.models(id) on delete set null,
  attachment_id uuid references public.chat_attachments(id) on delete set null,
  output_format text not null check (output_format in ('csv','xlsx','docx','pdf')),
  context_mode text not null default 'conversation' check (context_mode in ('conversation','message','instruction')),
  requested_filename text,
  instruction text not null check (char_length(instruction) between 1 and 4000),
  summary jsonb,
  status text not null default 'queued' check (status in ('queued','generating','complete','failed','cancelled')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index artifact_jobs_user_created on public.artifact_generation_jobs(user_id, created_at desc);
create index artifact_jobs_chat_created on public.artifact_generation_jobs(chat_id, created_at desc);
create index artifact_jobs_output_message on public.artifact_generation_jobs(output_message_id);

grant select on public.artifact_generation_jobs to authenticated;
grant all on public.artifact_generation_jobs to service_role;
alter table public.artifact_generation_jobs enable row level security;
create policy "Users read own artifact jobs" on public.artifact_generation_jobs for select to authenticated
  using (user_id = auth.uid() and public.is_active_approved_user());
create policy "Admins read all artifact jobs" on public.artifact_generation_jobs for select to authenticated
  using (public.is_admin());