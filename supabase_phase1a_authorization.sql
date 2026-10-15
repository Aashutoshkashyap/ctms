-- PHASE 1A ONLY. REVIEW/APPLY MANUALLY AFTER DEPLOYED-SCHEMA PREFLIGHT.
-- Prerequisites: final_product -> controls_subscription -> client_onboarding.
-- No rows are rewritten/deleted. Existing permissive policies remain ceilings.
begin;
set local lock_timeout = '5s';

-- SQL counterpart of permissions.ts. The parity test checks every role/feature.
create or replace function private.phase1a_baseline(role_name text, feature_name text)
returns text language sql immutable set search_path = '' as $$
  select case
    when role_name = 'project_director' then 'write'
    when coalesce((
      '{"super_admin":[],"business_admin":["procurement","obligations","documents","reports","subscription","settings","manage_users","manage_projects","upload_evidence"],"project_manager":["schedule","forecast","daily_reports","operations","employee_tracking","design","budget","ipc","claims","procurement","obligations","qaqc","safety","expenses","documents","reports","handover","defects","ai","upload_evidence"],"planning_engineer":["schedule","forecast","daily_reports","operations","reports","ai"],"site_engineer":["schedule","daily_reports","operations","employee_tracking","qaqc","safety","expenses","upload_evidence"],"qs_billing_engineer":["budget","ipc","claims","finance","expenses","documents","reports","approve_expenses","upload_evidence"],"design_coordinator":["schedule","design","documents","daily_reports","upload_evidence"],"qa_qc_engineer":["daily_reports","operations","qaqc","documents","handover","defects","upload_evidence"],"safety_officer":["daily_reports","operations","employee_tracking","safety","documents","upload_evidence"],"store_officer":["operations","procurement","expenses","documents","upload_evidence"],"accountant":["budget","ipc","finance","expenses","reports","approve_expenses","upload_evidence"],"subcontractor":["schedule","daily_reports","operations","upload_evidence"],"jv_partner":["executive","schedule","forecast","reports"],"employer_viewer":["executive","schedule","forecast","reports","handover"],"field_employee":["daily_reports","operations","expenses","upload_evidence"]}'::jsonb -> role_name
    ) ? feature_name, false)
    then case when role_name in ('jv_partner','employer_viewer') or feature_name in ('executive','view_evidence') then 'read' else 'write' end
    else 'none'
  end;
$$;

-- Replaces the permissive *feature gate*, NOT underlying role/owner policies.
-- Missing overrides now use a known role baseline; explicit values only narrow it.
create or replace function private.has_feature_access(target_project_id text, feature_name text, requested_access text default 'read')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare member_role text; overrides jsonb; baseline text; tenant_id text;
begin
  if auth.uid() is null or private.is_platform_admin() or requested_access not in ('read','write') then return false; end if;
  select organization_id into tenant_id from projects where id = target_project_id;
  if tenant_id is null or not private.has_active_subscription(tenant_id) then return false; end if;
  if exists(select 1 from organization_members where organization_id=tenant_id and auth_user_id=auth.uid() and status <> 'active') then return false; end if;
  select role, feature_permissions into member_role, overrides from project_users where project_id=target_project_id and auth_user_id=auth.uid();
  -- Preserve legitimate organization Business Admin administration when no
  -- project membership exists; never infer Director operational membership.
  if member_role is null and private.is_business_admin(target_project_id) then member_role := 'business_admin'; end if;
  baseline := private.phase1a_baseline(member_role, feature_name);
  if baseline = 'none' then return false; end if;
  if member_role = 'project_director' then return true; end if;
  if requested_access = 'write' and baseline <> 'write' then return false; end if;
  if coalesce(overrides,'{}'::jsonb) ? feature_name then
    return coalesce(overrides->>feature_name = 'write' or (requested_access='read' and overrides->>feature_name='read'), false);
  end if;
  return true;
end;
$$;

-- Authority is checked for OLD and NEW state, independent of API/UI behavior.
create or replace function private.phase1a_guard_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare row_project text; target_user uuid; actor_role text; tenant_id text; target_email text;
begin
  if tg_op='DELETE' then row_project:=old.project_id; target_user:=old.auth_user_id;
  else row_project:=new.project_id; target_user:=new.auth_user_id; end if;
  select organization_id into tenant_id from projects where id=row_project;
  -- Cascading project/auth deletion is handled by the original FK policies.
  if tg_op='DELETE' and (tenant_id is null or not exists(select 1 from auth.users where id=target_user)) then return old; end if;
  if tg_op='UPDATE' and (new.project_id is distinct from old.project_id or new.auth_user_id is distinct from old.auth_user_id or new.id is distinct from old.id or new.email is distinct from old.email) then
    raise exception 'Membership identity and project are immutable' using errcode='42501';
  end if;
  if tg_op <> 'DELETE' then
    select lower(email) into target_email from auth.users where id=target_user;
    if target_user is null or tenant_id is null or target_email is null or lower(new.email) is distinct from target_email or new.role='super_admin' or exists(select 1 from platform_admins where auth_user_id=target_user) then
      raise exception 'Invalid tenant membership target' using errcode='42501';
    end if;
    if exists(select 1 from project_users pu join projects p on p.id=pu.project_id where pu.auth_user_id=target_user and p.organization_id<>tenant_id)
       or exists(select 1 from organization_members where auth_user_id=target_user and (organization_id<>tenant_id or status<>'active')) then
      raise exception 'Target belongs to another or inactive organization' using errcode='42501';
    end if;
  end if;
  -- Privileged provisioning routes separately authenticate and check actor/target.
  if auth.role()='service_role' then if tg_op='DELETE' then return old; else return new; end if; end if;
  if auth.uid() is null or private.is_platform_admin() or not private.has_active_subscription(tenant_id) then
    raise exception 'Tenant membership authority required' using errcode='42501';
  end if;
  if exists(select 1 from organization_members where organization_id=tenant_id and auth_user_id=auth.uid() and status<>'active') then
    raise exception 'Organization membership inactive' using errcode='42501';
  end if;
  -- Sole exception for self-insertion: bootstrap a NEW project with the exact
  -- existing organization leader role. Ownership alone cannot grant Director.
  if tg_op='INSERT' and target_user=auth.uid()
     and not exists(select 1 from project_users where project_id=row_project)
     and exists(select 1 from projects p join organization_members om on om.organization_id=p.organization_id where p.id=row_project and p.created_by=auth.uid() and om.auth_user_id=auth.uid() and om.status='active' and om.role=new.role and om.role in ('business_admin','project_director'))
     and coalesce(new.feature_permissions,'{}'::jsonb)='{}'::jsonb then return new; end if;
  if target_user=auth.uid() then raise exception 'Cannot change own authorization' using errcode='42501'; end if;
  select role into actor_role from project_users where project_id=row_project and auth_user_id=auth.uid();
  if private.is_business_admin(row_project) and actor_role is null then actor_role:='business_admin'; end if;
  if actor_role not in ('business_admin','project_director') or actor_role is null or not private.has_feature_access(row_project,'manage_users','write') then
    raise exception 'Project membership authority required' using errcode='42501';
  end if;
  if actor_role='business_admin' then
    if tg_op='DELETE' then
      if old.role in ('business_admin','project_director','super_admin') then raise exception 'Cannot remove privileged membership' using errcode='42501'; end if;
    elsif tg_op='INSERT' then
      if new.role in ('business_admin','project_director','super_admin') or coalesce(new.feature_permissions,'{}'::jsonb)<>'{}'::jsonb then raise exception 'Cannot grant privileged role or overrides' using errcode='42501'; end if;
    else
      if old.role in ('business_admin','project_director','super_admin') or new.role is distinct from old.role or new.feature_permissions is distinct from old.feature_permissions then raise exception 'Only Director may change staff authorization' using errcode='42501'; end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists phase1a_membership_guard on project_users;
create trigger phase1a_membership_guard before insert or update or delete on project_users for each row execute function private.phase1a_guard_membership();

-- Additional restrictive membership visibility; original policies still apply.
drop policy if exists "phase1a membership visibility" on project_users;
create policy "phase1a membership visibility" on project_users as restrictive for select to authenticated
using (not private.is_platform_admin() and (auth_user_id=auth.uid() or private.has_feature_access(project_id,'manage_users','read')));

-- Organization authority remains platform-managed. No browser write policy may
-- accidentally expose it, including policies left over from an older SQL chain.
drop policy if exists "phase1a organization membership insert" on organization_members;
drop policy if exists "phase1a organization membership update" on organization_members;
drop policy if exists "phase1a organization membership delete" on organization_members;
create policy "phase1a organization membership insert" on organization_members as restrictive for insert to authenticated with check(false);
create policy "phase1a organization membership update" on organization_members as restrictive for update to authenticated using(false) with check(false);
create policy "phase1a organization membership delete" on organization_members as restrictive for delete to authenticated using(false);

-- Prevent using parent/row movement to evade the membership/tenant boundaries.
create or replace function private.phase1a_immutable_scope()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name='projects' then
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.created_by is distinct from old.created_by then
      raise exception 'Project ownership and identity are immutable' using errcode='42501';
    end if;
  elsif new.id is distinct from old.id or new.project_id is distinct from old.project_id then
    raise exception 'Record identity and project are immutable' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists phase1a_project_scope on projects;
create trigger phase1a_project_scope before update on projects for each row execute function private.phase1a_immutable_scope();

create or replace function private.phase1a_tenant_access(target_project_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and not private.is_platform_admin() and exists(
    select 1 from projects p where p.id=target_project_id
      and private.has_active_subscription(p.organization_id)
      and (private.is_project_member(p.id) or private.is_business_admin(p.id))
      and not exists(select 1 from organization_members om where om.organization_id=p.organization_id and om.auth_user_id=auth.uid() and om.status<>'active')
  );
$$;
revoke all on function private.phase1a_tenant_access(text) from public;
grant execute on function private.phase1a_tenant_access(text) to authenticated,service_role;
drop policy if exists "phase1a project read" on projects;
drop policy if exists "phase1a project update" on projects;
drop policy if exists "phase1a project delete" on projects;
create policy "phase1a project read" on projects as restrictive for select to authenticated using(private.phase1a_tenant_access(id));
create policy "phase1a project update" on projects as restrictive for update to authenticated using(private.phase1a_tenant_access(id)) with check(private.phase1a_tenant_access(id));
create policy "phase1a project delete" on projects as restrictive for delete to authenticated using(private.phase1a_tenant_access(id));

-- The existing permissive policies are never replaced; add missing feature gates.
do $$ declare m record; begin
  for m in select * from (values
    ('finance_rows','finance')
  ) as t(table_name,feature_name) loop
    if m.table_name='finance_rows' then
      execute format('drop policy if exists "phase1a finance feature" on %I',m.table_name);
      execute format('drop policy if exists "phase1a finance insert" on %I',m.table_name);
      execute format('drop policy if exists "phase1a finance update" on %I',m.table_name);
      execute format('drop policy if exists "phase1a finance delete" on %I',m.table_name);
      execute format('create policy "phase1a finance feature" on %I as restrictive for select to authenticated using(private.has_feature_access(project_id,%L,''read''))',m.table_name,m.feature_name);
      execute format('create policy "phase1a finance insert" on %I as restrictive for insert to authenticated with check(private.has_feature_access(project_id,%L,''write''))',m.table_name,m.feature_name);
      execute format('create policy "phase1a finance update" on %I as restrictive for update to authenticated using(private.has_feature_access(project_id,%L,''write'')) with check(private.has_feature_access(project_id,%L,''write''))',m.table_name,m.feature_name,m.feature_name);
      execute format('create policy "phase1a finance delete" on %I as restrictive for delete to authenticated using(private.has_feature_access(project_id,%L,''write''))',m.table_name,m.feature_name);
    end if;
  end loop;
end $$;

-- These concrete tenant/parent identities are known; unlike polymorphic document
-- links, they can be checked without guessing the meaning of stored IDs.
create unique index if not exists phase1a_projects_tenant_key on projects(id,organization_id);
create unique index if not exists phase1a_notice_tenant_key on organization_notifications(id,organization_id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='phase1a_google_tenant' and conrelid='google_connections'::regclass) then
    alter table google_connections add constraint phase1a_google_tenant foreign key(project_id,organization_id) references projects(id,organization_id) deferrable initially deferred not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='phase1a_google_tenant_required' and conrelid='google_connections'::regclass) then
    alter table google_connections add constraint phase1a_google_tenant_required check(organization_id is not null) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='phase1a_delivery_notice_tenant' and conrelid='subscription_email_deliveries'::regclass) then
    alter table subscription_email_deliveries add constraint phase1a_delivery_notice_tenant foreign key(notification_id,organization_id) references organization_notifications(id,organization_id) deferrable initially deferred not valid;
  end if;
end $$;

-- Concrete same-project references. NOT VALID preserves old rows while checking
-- new/updated references. Validate only after the read-only preflight is clean.
-- Original single-column FK delete actions remain in place.
do $$ declare r record; parent_table text; begin
  foreach parent_table in array array['activities','daily_reports','design_packages','ipc_submissions'] loop
    execute format('create unique index if not exists %I on %I(id,project_id)','phase1a_'||parent_table||'_scope_key',parent_table);
  end loop;
  for r in select * from (values
    ('activity_dependencies','predecessor_id','activities'),
    ('activity_dependencies','successor_id','activities'),
    ('design_comments','design_package_id','design_packages'),
    ('daily_work_items','daily_report_id','daily_reports'),
    ('daily_work_items','activity_id','activities'),
    ('material_logs','daily_report_id','daily_reports'),
    ('site_photos','daily_report_id','daily_reports'),
    ('daily_resource_usage','activity_id','activities'),
    ('daily_expenses','activity_id','activities'),
    ('qa_qc_inspections','activity_id','activities'),
    ('defects_liability','activity_id','activities'),
    ('ipc_payments','ipc_id','ipc_submissions')
  ) as refs(child_table,child_column,parent_table) loop
    if not exists(select 1 from pg_constraint where conname='phase1a_'||r.child_table||'_'||r.child_column and conrelid=r.child_table::regclass) then
      execute format('alter table %I add constraint %I foreign key (%I,project_id) references %I(id,project_id) deferrable initially deferred not valid',r.child_table,'phase1a_'||r.child_table||'_'||r.child_column,r.child_column,r.parent_table);
    end if;
  end loop;
  foreach parent_table in array array['wbs_items','activities','activity_dependencies','design_packages','design_comments','daily_reports','daily_work_items','material_logs','site_photos','budget_heads','subcontractor_packages','ipc_submissions','ipc_payments','finance_rows','daily_expenses','daily_resource_usage','employee_visits','employee_profiles','qa_qc_inspections','safety_logs','variations_and_claims','risk_register','contract_obligations','document_register','uploaded_documents','procurement_orders','store_items','inventory_events','handover_checklists','defects_liability','app_notifications'] loop
    execute format('drop trigger if exists phase1a_scope on %I',parent_table);
    execute format('create trigger phase1a_scope before update on %I for each row execute function private.phase1a_immutable_scope()',parent_table);
    if not exists(select 1 from pg_constraint where conname='phase1a_project_required' and conrelid=parent_table::regclass) then
      execute format('alter table %I add constraint phase1a_project_required check(project_id is not null) not valid',parent_table);
    end if;
    execute format('drop policy if exists "phase1a tenant scope" on %I',parent_table);
    execute format('create policy "phase1a tenant scope" on %I as restrictive for all to authenticated using(private.phase1a_tenant_access(project_id)) with check(private.phase1a_tenant_access(project_id))',parent_table);
  end loop;
end $$;

-- Restrictive gates cover the blob as well as its metadata record.
drop policy if exists "phase1a photo read" on storage.objects;
drop policy if exists "phase1a photo upload" on storage.objects;
drop policy if exists "phase1a photo update" on storage.objects;
drop policy if exists "phase1a photo delete" on storage.objects;
drop policy if exists "phase1a slip read" on storage.objects;
drop policy if exists "phase1a slip upload" on storage.objects;
drop policy if exists "phase1a slip update" on storage.objects;
drop policy if exists "phase1a slip delete" on storage.objects;
create policy "phase1a photo read" on storage.objects as restrictive for select to authenticated
using(bucket_id<>'site-photos' or private.has_feature_access((storage.foldername(name))[1],'view_evidence','read'));
create policy "phase1a photo upload" on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'site-photos' or private.has_feature_access((storage.foldername(name))[1],'upload_evidence','write'));
create policy "phase1a photo update" on storage.objects as restrictive for update to authenticated
using(bucket_id<>'site-photos' or private.has_feature_access((storage.foldername(name))[1],'view_evidence','write'))
with check(bucket_id<>'site-photos' or private.has_feature_access((storage.foldername(name))[1],'view_evidence','write'));
create policy "phase1a photo delete" on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'site-photos' or private.has_feature_access((storage.foldername(name))[1],'view_evidence','write'));
create policy "phase1a slip read" on storage.objects as restrictive for select to authenticated
using(bucket_id<>'payment-slips' or private.has_feature_access((storage.foldername(name))[1],'expenses','read'));
create policy "phase1a slip upload" on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'payment-slips' or private.has_feature_access((storage.foldername(name))[1],'upload_evidence','write'));
create policy "phase1a slip update" on storage.objects as restrictive for update to authenticated
using(bucket_id<>'payment-slips' or private.has_feature_access((storage.foldername(name))[1],'upload_evidence','write'))
with check(bucket_id<>'payment-slips' or private.has_feature_access((storage.foldername(name))[1],'upload_evidence','write'));
create policy "phase1a slip delete" on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'payment-slips' or private.has_feature_access((storage.foldername(name))[1],'upload_evidence','write'));

revoke all on function private.phase1a_guard_membership() from public;
revoke all on function private.phase1a_immutable_scope() from public;
revoke all on function private.phase1a_baseline(text,text) from public;
grant execute on function private.phase1a_baseline(text,text) to authenticated, service_role;
commit;
