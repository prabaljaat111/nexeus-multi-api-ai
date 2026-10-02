revoke all on public.connections from anon, authenticated;
grant select (id, owner_user_id, scope, name, provider_type, base_url, key_hint, enabled, last_tested_at, last_test_status, last_test_message, created_at, updated_at) on public.connections to authenticated;
grant all on public.connections to service_role;

revoke all on public.attachment_extractions from anon, authenticated;
grant select (id, attachment_id, user_id, extraction_status, error_message, created_at, updated_at) on public.attachment_extractions to authenticated;
grant all on public.attachment_extractions to service_role;

revoke all on public.models from anon, authenticated;
grant select on public.models to authenticated;
grant update (enabled, updated_at) on public.models to authenticated;
grant all on public.models to service_role;