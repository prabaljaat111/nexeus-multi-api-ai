create table public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 52428800),
  attachment_type text not null default 'upload' check (attachment_type in ('upload','generated_image','generated_document')),
  processing_status text not null default 'uploaded' check (processing_status in ('uploading','uploaded','processing','ready','failed','blocked','deleted')),
  safe_preview_type text check (safe_preview_type in ('image','pdf','plain_text','csv','audio','video','none') or safe_preview_type is null),
  extraction_status text not null default 'not_requested' check (extraction_status in ('not_requested','queued','processing','complete','unsupported','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_attachments_user_created on public.chat_attachments(user_id, created_at desc);
create index chat_attachments_chat_created on public.chat_attachments(chat_id, created_at desc);
create index chat_attachments_message on public.chat_attachments(message_id);

grant select on public.chat_attachments to authenticated;
grant all on public.chat_attachments to service_role;
alter table public.chat_attachments enable row level security;

create policy "Users read own attachments" on public.chat_attachments for select to authenticated
  using (user_id = auth.uid() and public.is_active_approved_user());
create policy "Admins read all attachments" on public.chat_attachments for select to authenticated
  using (public.is_admin());

create or replace function public.chat_attachments_validate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.chat_id is not null and not exists (select 1 from public.chats where id = new.chat_id and user_id = new.user_id) then
    raise exception 'attachment_chat_mismatch';
  end if;
  if new.message_id is not null and not exists (
    select 1 from public.messages m join public.chats c on c.id = m.chat_id
    where m.id = new.message_id and c.user_id = new.user_id and (new.chat_id is null or m.chat_id = new.chat_id)) then
    raise exception 'attachment_message_mismatch';
  end if;
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.storage_path := old.storage_path; new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.chat_attachments_validate() from public, anon, authenticated;
create trigger chat_attachments_validate before insert or update on public.chat_attachments
  for each row execute function public.chat_attachments_validate();