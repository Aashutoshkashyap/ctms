-- Phase 3I read-only preflight. Do not modify data.
select to_regclass('public.openwa_provider_configurations') as openwa_provider_configurations;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('organizations', 'openwa_provider_configurations', 'communication_identities', 'field_update_operations', 'field_update_conversation_contexts', 'evidence_media')
order by table_name, ordinal_position;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('openwa_provider_configurations', 'communication_identities', 'field_update_operations', 'field_update_conversation_contexts', 'evidence_media')
order by tablename, policyname;
