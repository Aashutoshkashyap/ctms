-- Read-only B1 preflight. Run before supabase_b1_platform_subscription.sql.
select table_name from information_schema.tables
where table_schema = 'public' and table_name in (
  'organizations','platform_admins','organization_members','projects','project_users',
  'subscription_transactions','organization_notifications','subscription_email_deliveries'
) order by table_name;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'organizations'
  and column_name in ('id','plan','plan_version','subscription_status','access_until','seat_limit','project_limit')
order by column_name;

select trigger_name, event_manipulation, event_object_table
from information_schema.triggers
where event_object_schema = 'public' and event_object_table in ('projects','project_users')
order by event_object_table, trigger_name;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('organizations'::regclass, 'projects'::regclass, 'project_users'::regclass)
order by conrelid::regclass::text, conname;

select plan, count(*) as organizations
from organizations group by plan order by plan;

select status, count(*) as transactions
from subscription_transactions group by status order by status;
