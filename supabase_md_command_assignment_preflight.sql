-- Read-only preflight for MD Command & Assignment.
-- No data or schema is modified by this script.
select
  to_regclass('public.project_person_assignments') as assignment_table,
  to_regclass('public.procurement_orders') as procurement_table,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_person_assignments' and column_name = 'department_key') as assignment_department_exists,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'procurement_orders' and column_name = 'responsible_person_id') as procurement_responsible_person_exists,
  exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'project_person_assignments' and rowsecurity) as assignment_rls_enabled;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.project_person_assignments'::regclass, 'public.procurement_orders'::regclass)
order by conrelid::regclass::text, conname;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'project_person_assignments'
order by policyname;
