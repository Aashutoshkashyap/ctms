-- READ ONLY. Run against a reviewed staging copy first; save results with the
-- deployment review. Counts only; no credentials or employee records are output.
begin read only;
select version();
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname;
select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname;
select p.proname,pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private' and p.proname in ('has_feature_access','can_manage_project','is_project_member','is_business_admin','has_project_role','is_org_leader','enforce_tenant_seat_quota','director_controls_feature_permissions','sync_ipc_payment_total','refresh_ipc_payment_total');
select conrelid::regclass as child,conname,convalidated,pg_get_constraintdef(oid)
from pg_constraint where connamespace='public'::regnamespace order by conrelid::regclass::text,conname;
select tgrelid::regclass as table_name,tgname,pg_get_triggerdef(oid)
from pg_trigger where not tgisinternal order by tgrelid::regclass::text,tgname;
select count(*) as duplicate_auth_project_memberships from (
  select project_id,auth_user_id from project_users group by project_id,auth_user_id having count(*)>1
) duplicates;
select count(*) as invalid_membership_identities from project_users pu left join auth.users u on u.id=pu.auth_user_id
where u.id is null or lower(u.email) is distinct from lower(pu.email) or pu.role='super_admin';
select count(*) as platform_users_with_project_memberships from project_users pu join platform_admins pa using(auth_user_id);
select count(*) as multi_tenant_users from (
  select pu.auth_user_id from project_users pu join projects p on p.id=pu.project_id
  group by pu.auth_user_id having count(distinct p.organization_id)>1
) conflicts;

do $$ declare r record; invalid_count bigint; begin
  for r in select * from (values
    ('activity_dependencies','predecessor_id','activities'),('activity_dependencies','successor_id','activities'),
    ('design_comments','design_package_id','design_packages'),('daily_work_items','daily_report_id','daily_reports'),
    ('daily_work_items','activity_id','activities'),('material_logs','daily_report_id','daily_reports'),
    ('site_photos','daily_report_id','daily_reports'),('daily_resource_usage','activity_id','activities'),
    ('daily_expenses','activity_id','activities'),('qa_qc_inspections','activity_id','activities'),
    ('defects_liability','activity_id','activities'),('ipc_payments','ipc_id','ipc_submissions')
  ) as refs(child_table,child_column,parent_table) loop
    execute format('select count(*) from %I c left join %I p on p.id=c.%I where c.%I is not null and (p.id is null or p.project_id is distinct from c.project_id)',r.child_table,r.parent_table,r.child_column,r.child_column) into invalid_count;
    raise notice '%.% -> %: % invalid references',r.child_table,r.child_column,r.parent_table,invalid_count;
  end loop;
end $$;
select count(*) as invalid_google_tenant_links from google_connections g left join projects p on p.id=g.project_id
where p.id is null or g.organization_id is distinct from p.organization_id;
select count(*) as invalid_email_notice_links from subscription_email_deliveries d join organization_notifications n on n.id=d.notification_id
where d.organization_id is distinct from n.organization_id;
select table_name,column_name,data_type,is_nullable from information_schema.columns
where table_schema='public' and column_name in ('project_id','organization_id','feature_permissions','linked_record_id','item_id','employee_id')
order by table_name,column_name;
commit;
