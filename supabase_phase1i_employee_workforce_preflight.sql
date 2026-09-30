-- Phase 1I read-only preflight. Run before supabase_phase1i_employee_workforce.sql.
select to_regclass('public.employee_records') as employee_records,
       to_regclass('public.employee_project_assignments') as employee_project_assignments,
       to_regclass('public.employee_employment_history') as employee_employment_history,
       to_regclass('public.employee_credentials') as employee_credentials,
       to_regclass('public.employee_documents') as employee_documents;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('organizations','projects','project_users','organization_members','employee_profiles','project_reporting_relationships')
order by table_name, ordinal_position;

select c.conrelid::regclass::text as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in ('public.projects'::regclass, 'public.project_users'::regclass, to_regclass('public.employee_records'), to_regclass('public.employee_project_assignments'))
order by table_name, c.conname;

select tablename, policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename in ('employee_profiles','employee_records','employee_project_assignments','employee_employment_history','employee_credentials','employee_documents','project_reporting_relationships')
order by tablename, policyname;

select id, name, public from storage.buckets where id = 'employee-documents';
