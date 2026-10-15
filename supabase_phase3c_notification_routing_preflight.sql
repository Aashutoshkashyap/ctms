-- Phase 3C read-only preflight. Run before supabase_phase3c_notification_routing.sql.
-- Existing app_notifications are preserved and extended; no delivery provider is activated.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('app_notifications', 'project_reporting_relationships', 'organization_notification_recipients')
order by table_name;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'app_notifications'
order by ordinal_position;

select n.id, n.project_id
from app_notifications n
left join projects p on p.id = n.project_id
where p.id is null;

select pu.project_id, pu.auth_user_id, count(*) as duplicate_memberships
from project_users pu
group by pu.project_id, pu.auth_user_id
having count(*) > 1;

select om.organization_id, om.auth_user_id, om.status, om.role
from organization_members om
where om.status <> 'active' or om.role not in ('business_admin', 'project_director');
