-- UX-5A read-only deployment preflight. Run before the additive migration.
select to_regclass('public.workflow_events') as workflow_events_table,
       to_regclass('public.app_notifications') as app_notifications_table,
       to_regclass('public.project_person_assignments') as assignments_table;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('app_notifications', 'workflow_events')
order by table_name, ordinal_position;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('app_notifications', 'workflow_events')
order by tablename, policyname;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.app_notifications'::regclass, coalesce(to_regclass('public.workflow_events'), 'public.app_notifications'::regclass))
order by conrelid::regclass::text, conname;

select indexrelid::regclass as index_name, pg_get_indexdef(indexrelid) as definition
from pg_index
where indrelid in ('public.app_notifications'::regclass, coalesce(to_regclass('public.workflow_events'), 'public.app_notifications'::regclass))
order by index_name::text;

select count(*) filter (where project_id is null) as legacy_rows_without_project,
       count(*) as existing_notification_rows
from app_notifications;
