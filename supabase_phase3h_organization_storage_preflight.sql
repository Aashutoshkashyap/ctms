-- Phase 3H preflight: read-only inspection before adding organization storage.
select to_regclass('public.organization_storage_connections') as organization_storage_connections,
       to_regclass('public.organization_storage_project_folders') as organization_storage_project_folders;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('organizations', 'projects', 'google_connections', 'organization_storage_connections', 'organization_storage_project_folders')
order by table_name, ordinal_position;

select c.conrelid::regclass::text as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in ('public.google_connections'::regclass, to_regclass('public.organization_storage_connections'), to_regclass('public.organization_storage_project_folders'))
order by table_name, c.conname;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('google_connections', 'organization_storage_connections', 'organization_storage_project_folders')
order by tablename, policyname;
