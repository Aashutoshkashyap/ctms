-- Read-only B6 preflight. Run before the additive migration.
select to_regclass('public.organization_whatsapp_connections') as connections_table,
       to_regclass('public.whatsapp_inbound_events') as inbound_events_table,
       to_regclass('public.organizations') as organizations_table,
       to_regclass('public.workflow_events') as workflow_events_table,
       to_regclass('public.employee_profiles') as employee_profiles_table;

select table_name, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('organization_whatsapp_connections','whatsapp_inbound_events','workflow_events','employee_profiles')
order by table_name;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in (coalesce(to_regclass('public.organization_whatsapp_connections'), 'public.workflow_events'::regclass), coalesce(to_regclass('public.whatsapp_inbound_events'), 'public.workflow_events'::regclass))
order by table_name::text, conname;

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('organization_whatsapp_connections','whatsapp_inbound_events')
order by tablename, policyname;
