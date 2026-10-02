alter table public.messages add column client_request_id text;
create unique index messages_chat_request_uidx on public.messages(chat_id, client_request_id) where client_request_id is not null;
create index messages_role_created_idx on public.messages(role, created_at desc);