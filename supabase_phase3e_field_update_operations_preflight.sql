-- Phase 3E read-only preflight. Do not apply the Phase 3E migration automatically.

select table_name
from information_schema.tables
where table_schema = 'public' and table_name in ('field_update_operations', 'daily_reports', 'daily_work_items', 'activities', 'communication_identities')
order by table_name;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('daily_reports', 'daily_work_items', 'activities', 'communication_identities')
order by table_name, ordinal_position;

select policyname, tablename
from pg_policies
where schemaname = 'public' and tablename in ('daily_reports', 'daily_work_items', 'activities', 'communication_identities', 'field_update_operations')
order by tablename, policyname;

select to_regclass('public.field_update_operations') as field_update_operations_table;
