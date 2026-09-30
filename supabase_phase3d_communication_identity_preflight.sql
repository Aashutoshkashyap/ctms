-- Phase 3D read-only preflight. Do not apply the Phase 3D migration automatically.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('communication_identities', 'employee_profiles', 'project_users', 'organization_members', 'project_reporting_relationships', 'organization_notification_recipients')
order by table_name;

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'employee_profiles' and column_name in ('phone','email','project_id'))
    or (table_name = 'project_users' and column_name in ('project_id','auth_user_id','email')))
order by table_name, ordinal_position;

select policyname, tablename
from pg_policies
where schemaname = 'public'
  and tablename in ('project_users', 'organization_members', 'project_reporting_relationships', 'organization_notification_recipients', 'communication_identities')
order by tablename, policyname;

-- The table will normally be absent before this phase. Dynamic inspection keeps
-- the preflight genuinely read-only and safe in both absent/present states.
select to_regclass('public.communication_identities') as communication_identity_table;

select case when to_regclass('public.communication_identities') is null then 0 else coalesce((xpath('/table/row/count/text()', query_to_xml(
  'select count(*) from communication_identities ci where ci.organization_id is null or ci.person_id is null or not exists (select 1 from projects p join project_users pu on pu.project_id = p.id where p.organization_id = ci.organization_id and pu.auth_user_id = ci.person_id)',
  true, false, '')))[1]::text::integer, 0) end as invalid_person_tenant_references;

select case when to_regclass('public.communication_identities') is null then 0 else coalesce((xpath('/table/row/count/text()', query_to_xml(
  'select count(*) from (select organization_id, channel, provider, normalized_address from communication_identities where pairing_state <> ''REVOKED'' group by organization_id, channel, provider, normalized_address having count(*) > 1) duplicates',
  true, false, '')))[1]::text::integer, 0) end as duplicate_active_mappings;
