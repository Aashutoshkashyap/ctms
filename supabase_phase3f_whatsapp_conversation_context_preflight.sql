-- Phase 3F read-only preflight. Do not apply the migration automatically.
select to_regclass('public.field_update_conversation_contexts') as conversation_context_table;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('field_update_operations', 'communication_identities', 'field_update_conversation_contexts')
order by table_name, ordinal_position;

select policyname, tablename
from pg_policies
where schemaname = 'public' and tablename in ('field_update_operations', 'communication_identities', 'field_update_conversation_contexts')
order by tablename, policyname;
