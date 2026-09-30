-- Phase 1J read-only preflight. Run before supabase_phase1j_leave_workforce.sql.
select to_regclass('public.employee_leave_records') as employee_leave_records,
       to_regclass('public.employee_resource_allocations') as employee_resource_allocations;
select table_name, column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name in ('employee_records','employee_project_assignments','projects','project_users','daily_resource_usage','employee_leave_records','employee_resource_allocations') order by table_name, ordinal_position;
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename in ('employee_leave_records','employee_resource_allocations','employee_records','employee_project_assignments') order by tablename, policyname;
select c.conrelid::regclass::text as table_name, c.conname, pg_get_constraintdef(c.oid) as definition from pg_constraint c
where c.conrelid in (to_regclass('public.employee_leave_records'), to_regclass('public.employee_resource_allocations')) order by table_name, c.conname;
