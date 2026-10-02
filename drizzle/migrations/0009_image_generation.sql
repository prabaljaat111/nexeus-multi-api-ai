alter table public.connections drop constraint connections_provider_type_check;
alter table public.connections add constraint connections_provider_type_check
  check (provider_type in ('openai','anthropic','gemini','openrouter','openai_compatible','stability','flux'));

create table public.image_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  connection_id uuid not null references public.connections(id) on delete cascade,
  model_id uuid references public.models(id) on delete set null,
  attachment_id uuid references public.chat_attachments(id) on delete set null,
  prompt text not null check (char_length(prompt) between 1 and 4000),
  negative_prompt text,
  revised_prompt text,
  size text,
  aspect_ratio text,
  quality text,
  style text,
  status text not null default 'queued' check (status in ('queued','generating','complete','failed','cancelled')),
  provider_job_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index image_jobs_user_created on public.image_generation_jobs(user_id, created_at desc);
create index image_jobs_chat_created on public.image_generation_jobs(chat_id, created_at desc);
create index image_jobs_message on public.image_generation_jobs(message_id);

grant select (id, user_id, chat_id, message_id, connection_id, model_id, attachment_id, prompt, negative_prompt, revised_prompt,
  size, aspect_ratio, quality, style, status, error_message, created_at, updated_at) on public.image_generation_jobs to authenticated;
grant all on public.image_generation_jobs to service_role;
alter table public.image_generation_jobs enable row level security;

create policy "Users read own image jobs" on public.image_generation_jobs for select to authenticated
  using (user_id = auth.uid() and public.is_active_approved_user());
create policy "Admins read all image jobs" on public.image_generation_jobs for select to authenticated
  using (public.is_admin());