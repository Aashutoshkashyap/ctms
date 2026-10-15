-- Phase 1G read-only preflight. Do not modify data with this file.
select table_name, column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('daily_reports','project_update_operations')
order by table_name, ordinal_position;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.daily_reports'::regclass, to_regclass('public.project_update_operations'))
order by table_name::text, conname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename in ('daily_reports','project_update_operations')
order by tablename, policyname;

select count(*) filter (where coalesce(nullif(to_jsonb(daily_reports)->>'revision','')::integer, 1) < 1) as invalid_revisions,
       count(*) as report_count
from daily_reports;

select project_id, report_date, count(*) as duplicate_reports
from daily_reports group by project_id, report_date having count(*) > 1;
