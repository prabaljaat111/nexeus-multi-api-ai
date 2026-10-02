create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null default 'New chat' check (char_length(title) between 1 and 200),
  selected_connection_id uuid references public.connections(id) on delete set null,
  selected_model_id uuid references public.models(id) on delete set null,
  system_prompt text check (system_prompt is null or char_length(system_prompt) <= 20000),
  temperature numeric default 0.7 check (temperature is null or (temperature >= 0 and temperature <= 2)),
  max_tokens integer check (max_tokens is null or (max_tokens > 0 and max_tokens <= 1000000)),
  top_p numeric default 1 check (top_p is null or (top_p > 0 and top_p <= 1)),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chats_user_updated_idx on public.chats(user_id, updated_at desc);
create index chats_user_archived_updated_idx on public.chats(user_id, is_archived, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null check (role in ('system','user','assistant')),
  content text not null default '',
  model_id uuid references public.models(id) on delete set null,
  provider_message_id text,
  status text not null default 'complete' check (status in ('streaming','complete','error','stopped')),
  error_message text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index messages_chat_created_idx on public.messages(chat_id, created_at asc);

grant select, insert, update, delete on public.chats to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.chats to service_role;
grant all on public.messages to service_role;

alter table public.chats enable row level security;
alter table public.messages enable row level security;

create or replace function public.owns_chat(_chat_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chats where id = _chat_id and user_id = auth.uid())
$$;

create policy "Users manage own chats" on public.chats for all to authenticated
  using (user_id = auth.uid() and public.is_active_approved_user())
  with check (user_id = auth.uid() and public.is_active_approved_user());
create policy "Admins read all chats" on public.chats for select to authenticated using (public.is_admin());

create policy "Users manage messages in own chats" on public.messages for all to authenticated
  using (public.owns_chat(chat_id) and public.is_active_approved_user())
  with check (public.owns_chat(chat_id) and public.is_active_approved_user());
create policy "Admins read all messages" on public.messages for select to authenticated using (public.is_admin());

create or replace function public.chats_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end $$;
create trigger chats_touch before update on public.chats for each row execute function public.chats_touch();

create or replace function public.messages_touch_chat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  update public.chats set updated_at = now() where id = coalesce(new.chat_id, old.chat_id);
  return coalesce(new, old);
end $$;
create trigger messages_touch_chat before insert or update on public.messages for each row execute function public.messages_touch_chat();