-- Phase 3G read-only preflight. Do not apply the migration automatically.
select to_regclass('public.evidence_media') as evidence_media_table;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('evidence_media', 'field_update_operations', 'communication_identities', 'site_photos', 'uploaded_documents')
order by table_name, ordinal_position;

select policyname, tablename
from pg_policies
where schemaname = 'public' and tablename in ('evidence_media', 'field_update_operations', 'communication_identities', 'site_photos', 'uploaded_documents')
order by tablename, policyname;
