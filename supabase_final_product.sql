-- BuildTrack D&B final product migration
-- Idempotent upgrade for B2B tenancy, role isolation, operational records,
-- private evidence/payment storage, subscription administration and RLS.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

-- --------------------------------------------------------------------------
-- Tenant and platform metadata. Platform admins intentionally have no policy
-- path into project operational tables.
-- --------------------------------------------------------------------------
create table if not exists organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  contact_email text,
  plan text not null default 'trial',
  subscription_status text not null default 'trial',
  access_until date,
  seat_limit integer not null default 25 check (seat_limit > 0),
  project_limit integer not null default 5 check (project_limit > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table organizations add column if not exists seat_limit integer not null default 25;
alter table organizations add column if not exists project_limit integer not null default 5;
alter table organizations add column if not exists updated_at timestamptz not null default now();

create table if not exists platform_admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('business_admin','project_director')),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  created_at timestamptz not null default now(),
  unique (organization_id, auth_user_id),
  unique (organization_id, email)
);

create table if not exists business_inquiries (
  id text primary key default gen_random_uuid()::text,
  business_name text not null,
  contact_name text not null,
  contact_email text not null,
  phone text,
  message text,
  status text not null default 'new' check (status in ('new','open','contacted','converted','closed')),
  created_at timestamptz not null default now()
);

create table if not exists subscription_transactions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  reference text not null,
  amount numeric(15,2) not null default 0,
  currency text not null default 'NPR',
  paid_at timestamptz,
  period_start date,
  period_end date,
  status text not null default 'pending' check (status in ('pending','verified','rejected','refunded')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);

alter table projects add column if not exists organization_id text references organizations(id) on delete restrict;
alter table projects add column if not exists organization_name text;
alter table projects add column if not exists status text not null default 'active';
alter table projects add column if not exists access_until date;
update projects set status = 'active' where status is null;
alter table projects alter column status set default 'active';
alter table projects alter column status set not null;

insert into organizations (id, name, contact_email, plan, subscription_status, access_until, seat_limit, project_limit)
values ('org-buildtrack-demo', 'BuildTrack Demo Construction Group', 'director@buildtrack.com', 'enterprise_trial', 'trial', current_date + 30, 100, 20)
on conflict (id) do update set updated_at = now();

update projects
set organization_id = 'org-buildtrack-demo',
    organization_name = coalesce(organization_name, 'BuildTrack Demo Construction Group')
where organization_id is null;

-- Extend project roles without trusting client metadata to grant them.
alter table project_users drop constraint if exists project_users_role_check;
alter table project_users add constraint project_users_role_check check (role in (
  'super_admin','business_admin','project_director','project_manager','planning_engineer','site_engineer',
  'qs_billing_engineer','design_coordinator','qa_qc_engineer','safety_officer','store_officer',
  'accountant','subcontractor','jv_partner','employer_viewer','field_employee'
));

-- Move the platform owner out of tenant memberships before policies are rebuilt.
insert into platform_admins (auth_user_id, email, name)
select id, lower(email), coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1))
from auth.users
where lower(email) = 'admin@buildtrack.com'
on conflict (auth_user_id) do update set email = excluded.email, name = excluded.name;

delete from project_users
where role = 'super_admin'
   or auth_user_id in (select auth_user_id from platform_admins);

insert into organization_members (organization_id, auth_user_id, email, name, role, status)
select distinct p.organization_id, pu.auth_user_id, lower(pu.email), pu.name,
       case when pu.role = 'business_admin' then 'business_admin' else 'project_director' end,
       'active'
from project_users pu
join projects p on p.id = pu.project_id
where pu.auth_user_id is not null
  and pu.role in ('business_admin','project_director')
  and p.organization_id is not null
on conflict (organization_id, auth_user_id) do update
set email = excluded.email, name = excluded.name, role = excluded.role, status = 'active';

-- --------------------------------------------------------------------------
-- Operational upgrade tables and fields
-- --------------------------------------------------------------------------
create table if not exists employee_profiles (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  employee_id text not null,
  name text not null,
  email text,
  phone text,
  role text,
  trade text,
  site_location text,
  daily_rate numeric(15,2) not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  assigned_to text,
  created_at timestamptz not null default now(),
  unique (project_id, employee_id)
);

create table if not exists inventory_events (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  item_id text,
  event_date date not null,
  event_type text not null check (event_type in ('received','issued','adjusted','moved')),
  quantity numeric(14,2) not null default 0,
  vendor text,
  location text,
  remarks text,
  recorded_by text,
  created_at timestamptz not null default now()
);

create table if not exists uploaded_documents (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  storage_path text,
  url text,
  linked_record_id text,
  uploaded_by text,
  uploaded_by_email text,
  uploaded_at timestamptz not null default now(),
  remarks text
);
alter table uploaded_documents add column if not exists uploaded_by_email text;

create table if not exists google_connections (
  id text primary key default gen_random_uuid()::text,
  organization_id text references organizations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  connected_by uuid references auth.users(id) on delete set null default auth.uid(),
  google_email text,
  root_folder_id text,
  project_folder_id text,
  daily_folder_id text,
  expense_folder_id text,
  employee_folder_id text,
  document_folder_id text,
  photo_folder_id text,
  sheet_id text,
  encrypted_refresh_token text,
  status text not null default 'connected' check (status in ('connected','revoked','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create table if not exists app_notifications (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  actor text,
  action text not null,
  module text not null,
  detail text,
  created_at timestamptz not null default now(),
  read boolean not null default false
);

alter table daily_expenses add column if not exists activity_id text references activities(id) on delete set null;
alter table daily_expenses add column if not exists employee_id text;
alter table daily_expenses add column if not exists employee_name text;
alter table daily_expenses add column if not exists payment_slip_url text;
alter table daily_expenses add column if not exists payment_slip_path text;
alter table daily_expenses add column if not exists recorded_by_email text;
alter table daily_reports add column if not exists submitted_by_email text;
alter table daily_work_items add column if not exists rework_quantity numeric(14,2) not null default 0;
alter table daily_resource_usage add column if not exists crew_name text;
alter table daily_resource_usage add column if not exists equipment_type text not null default 'other';
alter table daily_resource_usage add column if not exists machinery_day numeric(10,2) not null default 0;
alter table procurement_orders add column if not exists order_date date;
alter table procurement_orders add column if not exists delivery_date date;
alter table procurement_orders add column if not exists remarks text;
alter table store_items add column if not exists vendor text;
alter table store_items add column if not exists status text not null default 'available';
alter table variations_and_claims add column if not exists variation_item text;
alter table variations_and_claims add column if not exists quantity numeric(14,2) not null default 0;
alter table variations_and_claims add column if not exists previous_rate numeric(15,2) not null default 0;
alter table variations_and_claims add column if not exists new_rate numeric(15,2) not null default 0;
alter table variations_and_claims add column if not exists rate_difference numeric(15,2) not null default 0;
alter table qa_qc_inspections add column if not exists ncr_code text;
alter table qa_qc_inspections add column if not exists sample_collection_date date;
alter table qa_qc_inspections add column if not exists tested_date date;

create index if not exists idx_projects_organization on projects(organization_id);
create index if not exists idx_org_members_auth on organization_members(auth_user_id, organization_id);
create index if not exists idx_employee_profiles_project on employee_profiles(project_id);
create index if not exists idx_uploaded_documents_project on uploaded_documents(project_id);
create index if not exists idx_inventory_events_project on inventory_events(project_id, event_date desc);
create index if not exists idx_notifications_project on app_notifications(project_id, created_at desc);
create index if not exists idx_google_connections_project on google_connections(project_id);

-- --------------------------------------------------------------------------
-- Authorization helpers
-- --------------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from platform_admins pa where pa.auth_user_id = (select auth.uid()));
$$;

create or replace function private.has_active_subscription(target_organization_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from organizations o
    where o.id = target_organization_id
      and o.subscription_status in ('trial','active','past_due')
      and (o.access_until is null or o.access_until >= current_date)
  );
$$;

create or replace function private.is_organization_member(target_organization_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select (not private.is_platform_admin())
    and private.has_active_subscription(target_organization_id)
    and exists (
    select 1 from organization_members om
    where om.organization_id = target_organization_id
      and om.auth_user_id = (select auth.uid())
      and om.status = 'active'
  );
$$;

create or replace function private.is_org_leader(target_organization_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select (not private.is_platform_admin())
    and private.has_active_subscription(target_organization_id)
    and exists (
    select 1 from organization_members om
    where om.organization_id = target_organization_id
      and om.auth_user_id = (select auth.uid())
      and om.role in ('business_admin','project_director')
      and om.status = 'active'
  );
$$;

create or replace function private.is_business_admin(target_project_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select (not private.is_platform_admin()) and exists (
    select 1
    from projects p
    join organization_members om on om.organization_id = p.organization_id
    where p.id = target_project_id
      and om.auth_user_id = (select auth.uid())
      and om.role = 'business_admin'
      and om.status = 'active'
      and private.has_active_subscription(p.organization_id)
  );
$$;

create or replace function private.is_project_member(target_project_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select (not private.is_platform_admin())
    and exists (
      select 1 from projects active_project
      where active_project.id = target_project_id
        and private.has_active_subscription(active_project.organization_id)
    )
    and (
    exists (select 1 from projects p where p.id = target_project_id and p.created_by = (select auth.uid()))
    or exists (
      select 1 from project_users pu
      where pu.project_id = target_project_id
        and pu.auth_user_id = (select auth.uid())
        and pu.role not in ('super_admin','business_admin')
    )
  );
$$;

create or replace function private.has_project_role(target_project_id text, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$
  select (not private.is_platform_admin()) and exists (
    select 1 from project_users pu
    join projects p on p.id = pu.project_id
    where pu.project_id = target_project_id
      and pu.auth_user_id = (select auth.uid())
      and pu.role = any(allowed_roles)
      and private.has_active_subscription(p.organization_id)
  );
$$;

create or replace function private.can_manage_project(target_project_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select (not private.is_platform_admin())
    and exists (
      select 1 from projects active_project
      where active_project.id = target_project_id
        and private.has_active_subscription(active_project.organization_id)
    )
    and (
    private.is_business_admin(target_project_id)
    or exists (select 1 from projects p where p.id = target_project_id and p.created_by = (select auth.uid()))
    or private.has_project_role(target_project_id, array['project_director'])
  );
$$;

create or replace function private.can_edit_project(target_project_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select private.has_project_role(target_project_id, array[
    'project_director','project_manager','planning_engineer','site_engineer','design_coordinator',
    'qa_qc_engineer','safety_officer','store_officer','qs_billing_engineer','accountant','subcontractor'
  ]);
$$;

create or replace function private.owns_daily_report(target_report_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from daily_reports dr
    where dr.id = target_report_id
      and lower(dr.submitted_by_email) = lower(auth.jwt()->>'email')
      and private.has_project_role(dr.project_id,array['field_employee','subcontractor'])
  );
$$;

create or replace function private.enforce_project_quota()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  allowed_projects integer;
  active_projects integer;
begin
  if not private.has_active_subscription(new.organization_id) then
    raise exception 'Business subscription is inactive or expired.' using errcode = '42501';
  end if;
  select project_limit into allowed_projects from organizations where id = new.organization_id;
  if allowed_projects is null then
    raise exception 'Business tenant is missing.' using errcode = '23503';
  end if;
  if coalesce(new.status, 'active') <> 'archived' then
    select count(*) into active_projects
    from projects
    where organization_id = new.organization_id and status <> 'archived';
    if active_projects >= allowed_projects then
      raise exception 'Active project limit reached for this subscription.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists buildtrack_project_quota on projects;
create trigger buildtrack_project_quota
before insert on projects
for each row execute function private.enforce_project_quota();

create or replace function private.enforce_tenant_seat_quota()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  target_organization_id text;
  allowed_seats integer;
  used_seats integer;
begin
  if new.auth_user_id is null then
    raise exception 'A verified authentication user is required.' using errcode = '23502';
  end if;
  select p.organization_id into target_organization_id from projects p where p.id = new.project_id;
  if target_organization_id is null then
    raise exception 'Project business tenant is missing.' using errcode = '23503';
  end if;
  if not private.has_active_subscription(target_organization_id) then
    raise exception 'Business subscription is inactive or expired.' using errcode = '42501';
  end if;
  if exists (
    select 1 from project_users existing
    join projects existing_project on existing_project.id = existing.project_id
    where existing.auth_user_id = new.auth_user_id
      and existing_project.organization_id is distinct from target_organization_id
  ) then
    raise exception 'This user already belongs to another business tenant.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from project_users existing
    join projects existing_project on existing_project.id = existing.project_id
    where existing.auth_user_id = new.auth_user_id
      and existing_project.organization_id = target_organization_id
  ) then
    select seat_limit into allowed_seats from organizations where id = target_organization_id;
    select count(distinct existing.auth_user_id) into used_seats
    from project_users existing
    join projects existing_project on existing_project.id = existing.project_id
    where existing_project.organization_id = target_organization_id
      and existing.auth_user_id is not null;
    if used_seats >= allowed_seats then
      raise exception 'Employee seat limit reached for this subscription.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists buildtrack_tenant_seat_quota on project_users;
create trigger buildtrack_tenant_seat_quota
before insert on project_users
for each row execute function private.enforce_tenant_seat_quota();

grant usage on schema private to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.has_active_subscription(text) to authenticated;
grant execute on function private.is_organization_member(text) to authenticated;
grant execute on function private.is_org_leader(text) to authenticated;
grant execute on function private.is_business_admin(text) to authenticated;
grant execute on function private.is_project_member(text) to authenticated;
grant execute on function private.has_project_role(text,text[]) to authenticated;
grant execute on function private.can_manage_project(text) to authenticated;
grant execute on function private.can_edit_project(text) to authenticated;
grant execute on function private.owns_daily_report(text) to authenticated;

-- --------------------------------------------------------------------------
-- RLS: platform metadata
-- --------------------------------------------------------------------------
alter table organizations enable row level security;
alter table platform_admins enable row level security;
alter table organization_members enable row level security;
alter table business_inquiries enable row level security;
alter table subscription_transactions enable row level security;

drop policy if exists "super admins manage organizations" on organizations;
drop policy if exists "tenant admins read organization" on organizations;
create policy "tenant admins read organization" on organizations for select to authenticated
using (private.is_organization_member(id));

drop policy if exists "platform admin reads own profile" on platform_admins;
create policy "platform admin reads own profile" on platform_admins for select to authenticated
using (auth_user_id = (select auth.uid()));

drop policy if exists "tenant admins read memberships" on organization_members;
drop policy if exists "tenant directors manage memberships" on organization_members;
create policy "tenant admins read memberships" on organization_members for select to authenticated
using (auth_user_id = (select auth.uid()) or private.is_org_leader(organization_id));

-- No authenticated client policies are created for business_inquiries or
-- subscription_transactions. Platform APIs use the server secret and return
-- subscription metadata only after a platform-admin check.

-- --------------------------------------------------------------------------
-- RLS: projects and memberships
-- --------------------------------------------------------------------------
alter table projects enable row level security;
alter table project_users enable row level security;

drop policy if exists "project members select projects" on projects;
drop policy if exists "users create projects" on projects;
drop policy if exists "managers update projects" on projects;
drop policy if exists "managers delete projects" on projects;
drop policy if exists "tenant users select projects" on projects;
drop policy if exists "tenant leaders create projects" on projects;
drop policy if exists "tenant leaders update projects" on projects;
drop policy if exists "tenant directors delete projects" on projects;
create policy "tenant users select projects" on projects for select to authenticated
using (private.is_project_member(id) or private.is_business_admin(id));
create policy "tenant leaders create projects" on projects for insert to authenticated
with check (
  created_by = (select auth.uid())
  and not private.is_platform_admin()
  and private.is_org_leader(organization_id)
);
create policy "tenant leaders update projects" on projects for update to authenticated
using (private.can_manage_project(id)) with check (private.can_manage_project(id));
create policy "tenant directors delete projects" on projects for delete to authenticated
using (private.can_manage_project(id));

drop policy if exists "users read memberships" on project_users;
drop policy if exists "project managers manage memberships" on project_users;
drop policy if exists "tenant users read project memberships" on project_users;
drop policy if exists "tenant leaders manage project memberships" on project_users;
create policy "tenant users read project memberships" on project_users for select to authenticated
using (auth_user_id = (select auth.uid()) or private.is_project_member(project_id) or private.is_business_admin(project_id));
create policy "tenant leaders manage project memberships" on project_users for all to authenticated
using (private.can_manage_project(project_id)) with check (private.can_manage_project(project_id) and role <> 'super_admin');

-- Helper block for replacing broad legacy policies.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'wbs_items','activities','activity_dependencies','design_packages','design_comments','daily_reports',
    'daily_work_items','material_logs','qa_qc_inspections','safety_logs','variations_and_claims',
    'risk_register','handover_checklists','defects_liability','budget_heads','subcontractor_packages',
    'ipc_submissions','finance_rows','daily_expenses','daily_resource_usage','employee_visits',
    'procurement_orders','store_items','inventory_events','contract_obligations','document_register',
    'employee_profiles','uploaded_documents','app_notifications','google_connections','site_photos'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('drop policy if exists "members read %1$s" on %1$I', table_name);
    execute format('drop policy if exists "editors manage %1$s" on %1$I', table_name);
  end loop;
end $$;

-- Schedule / WBS
do $$
declare table_name text;
begin
  foreach table_name in array array['wbs_items','activities','activity_dependencies'] loop
    execute format('drop policy if exists "schedule read" on %I', table_name);
    execute format('drop policy if exists "schedule manage" on %I', table_name);
    execute format('create policy "schedule read" on %I for select to authenticated using (private.is_project_member(project_id))', table_name);
    execute format('create policy "schedule manage" on %I for all to authenticated using (private.has_project_role(project_id,array[''project_director'',''project_manager'',''planning_engineer''])) with check (private.has_project_role(project_id,array[''project_director'',''project_manager'',''planning_engineer'']))', table_name);
  end loop;
end $$;

-- Daily reporting
do $$
declare table_name text;
begin
  foreach table_name in array array['daily_reports','daily_work_items','material_logs'] loop
    execute format('drop policy if exists "daily read" on %I', table_name);
    execute format('drop policy if exists "daily manage" on %I', table_name);
    execute format('create policy "daily read" on %I for select to authenticated using (private.is_project_member(project_id))', table_name);
    execute format('create policy "daily manage" on %I for all to authenticated using (private.has_project_role(project_id,array[''project_director'',''project_manager'',''planning_engineer'',''site_engineer'',''field_employee'',''subcontractor''])) with check (private.has_project_role(project_id,array[''project_director'',''project_manager'',''planning_engineer'',''site_engineer'',''field_employee'',''subcontractor'']))', table_name);
  end loop;
end $$;

-- Field employees and subcontractors can change only reports they submitted.
drop policy if exists "daily manage" on daily_reports;
drop policy if exists "daily leaders manage" on daily_reports;
drop policy if exists "daily field insert" on daily_reports;
drop policy if exists "daily field update" on daily_reports;
drop policy if exists "daily field delete" on daily_reports;
create policy "daily leaders manage" on daily_reports for all to authenticated
using (private.has_project_role(project_id,array['project_director','project_manager','planning_engineer','site_engineer']))
with check (private.has_project_role(project_id,array['project_director','project_manager','planning_engineer','site_engineer']));
create policy "daily field insert" on daily_reports for insert to authenticated
with check (private.has_project_role(project_id,array['field_employee','subcontractor']) and lower(submitted_by_email) = lower(auth.jwt()->>'email'));
create policy "daily field update" on daily_reports for update to authenticated
using (private.has_project_role(project_id,array['field_employee','subcontractor']) and lower(submitted_by_email) = lower(auth.jwt()->>'email'))
with check (private.has_project_role(project_id,array['field_employee','subcontractor']) and lower(submitted_by_email) = lower(auth.jwt()->>'email'));
create policy "daily field delete" on daily_reports for delete to authenticated
using (private.has_project_role(project_id,array['field_employee','subcontractor']) and lower(submitted_by_email) = lower(auth.jwt()->>'email'));

do $$
declare table_name text;
begin
  foreach table_name in array array['daily_work_items','material_logs'] loop
    execute format('drop policy if exists "daily manage" on %I', table_name);
    execute format('drop policy if exists "daily leaders manage" on %I', table_name);
    execute format('drop policy if exists "daily field manage own" on %I', table_name);
    execute format('create policy "daily leaders manage" on %I for all to authenticated using (private.has_project_role(project_id,array[''project_director'',''project_manager'',''planning_engineer'',''site_engineer''])) with check (private.has_project_role(project_id,array[''project_director'',''project_manager'',''planning_engineer'',''site_engineer'']))', table_name);
    execute format('create policy "daily field manage own" on %I for all to authenticated using (private.owns_daily_report(daily_report_id)) with check (private.owns_daily_report(daily_report_id))', table_name);
  end loop;
end $$;

-- Design, quality, safety, commercial and completion records
do $$
declare table_name text;
begin
  foreach table_name in array array['design_packages','design_comments'] loop
    execute format('drop policy if exists "discipline read" on %I', table_name);
    execute format('drop policy if exists "discipline manage" on %I', table_name);
    execute format('create policy "discipline read" on %I for select to authenticated using (private.is_project_member(project_id))', table_name);
    execute format('create policy "discipline manage" on %I for all to authenticated using (private.has_project_role(project_id,array[''project_director'',''project_manager'',''design_coordinator''])) with check (private.has_project_role(project_id,array[''project_director'',''project_manager'',''design_coordinator'']))', table_name);
  end loop;
  foreach table_name in array array['qa_qc_inspections','handover_checklists','defects_liability'] loop
    execute format('drop policy if exists "discipline read" on %I', table_name);
    execute format('drop policy if exists "discipline manage" on %I', table_name);
    execute format('create policy "discipline read" on %I for select to authenticated using (private.is_project_member(project_id))', table_name);
    execute format('create policy "discipline manage" on %I for all to authenticated using (private.has_project_role(project_id,array[''project_director'',''project_manager'',''qa_qc_engineer''])) with check (private.has_project_role(project_id,array[''project_director'',''project_manager'',''qa_qc_engineer'']))', table_name);
  end loop;
end $$;

drop policy if exists "safety read" on safety_logs;
drop policy if exists "safety manage" on safety_logs;
create policy "safety read" on safety_logs for select to authenticated using (private.is_project_member(project_id));
create policy "safety manage" on safety_logs for all to authenticated
using (private.has_project_role(project_id,array['project_director','project_manager','safety_officer']))
with check (private.has_project_role(project_id,array['project_director','project_manager','safety_officer']));

do $$
declare table_name text;
begin
  foreach table_name in array array['variations_and_claims','risk_register'] loop
    execute format('drop policy if exists "commercial read" on %I', table_name);
    execute format('drop policy if exists "commercial manage" on %I', table_name);
    execute format('create policy "commercial read" on %I for select to authenticated using (private.has_project_role(project_id,array[''project_director'',''project_manager'',''qs_billing_engineer'',''employer_viewer'']))', table_name);
    execute format('create policy "commercial manage" on %I for all to authenticated using (private.has_project_role(project_id,array[''project_director'',''project_manager'',''qs_billing_engineer''])) with check (private.has_project_role(project_id,array[''project_director'',''project_manager'',''qs_billing_engineer'']))', table_name);
  end loop;
end $$;

-- Finance. Employees can submit and read only their own daily expense rows.
do $$
declare table_name text;
begin
  foreach table_name in array array['budget_heads','subcontractor_packages','ipc_submissions','finance_rows'] loop
    execute format('drop policy if exists "finance roles read %1$s" on %1$I', table_name);
    execute format('drop policy if exists "finance roles manage %1$s" on %1$I', table_name);
    execute format('drop policy if exists "finance read" on %I', table_name);
    execute format('drop policy if exists "finance manage" on %I', table_name);
    execute format('create policy "finance read" on %I for select to authenticated using (private.has_project_role(project_id,array[''project_director'',''project_manager'',''qs_billing_engineer'',''accountant'']))', table_name);
    execute format('create policy "finance manage" on %I for all to authenticated using (private.has_project_role(project_id,array[''project_director'',''qs_billing_engineer'',''accountant''])) with check (private.has_project_role(project_id,array[''project_director'',''qs_billing_engineer'',''accountant'']))', table_name);
  end loop;
end $$;

drop policy if exists "finance roles read daily_expenses" on daily_expenses;
drop policy if exists "finance roles manage daily_expenses" on daily_expenses;
drop policy if exists "expense read" on daily_expenses;
drop policy if exists "expense submit" on daily_expenses;
drop policy if exists "expense approve" on daily_expenses;
create policy "expense read" on daily_expenses for select to authenticated using (
  private.has_project_role(project_id,array['project_director','project_manager','qs_billing_engineer','accountant'])
  or (private.has_project_role(project_id,array['site_engineer','field_employee','subcontractor']) and lower(recorded_by_email) = lower(auth.jwt()->>'email'))
);
create policy "expense submit" on daily_expenses for insert to authenticated with check (
  private.has_project_role(project_id,array['project_director','project_manager','qs_billing_engineer','accountant'])
  or (private.has_project_role(project_id,array['site_engineer','field_employee','subcontractor']) and lower(recorded_by_email) = lower(auth.jwt()->>'email') and status in ('draft','submitted'))
);
create policy "expense approve" on daily_expenses for update to authenticated
using (private.has_project_role(project_id,array['project_director','qs_billing_engineer','accountant']))
with check (private.has_project_role(project_id,array['project_director','qs_billing_engineer','accountant']));

-- Resources, people movement and employee directory
drop policy if exists "members read resource usage" on daily_resource_usage;
drop policy if exists "operations roles manage resource usage" on daily_resource_usage;
drop policy if exists "resources read" on daily_resource_usage;
drop policy if exists "resources manage" on daily_resource_usage;
create policy "resources read" on daily_resource_usage for select to authenticated using (private.is_project_member(project_id));
create policy "resources manage" on daily_resource_usage for all to authenticated
using (private.has_project_role(project_id,array['project_director','project_manager','planning_engineer','site_engineer','store_officer','field_employee','subcontractor']))
with check (private.has_project_role(project_id,array['project_director','project_manager','planning_engineer','site_engineer','store_officer','field_employee','subcontractor']));

drop policy if exists "tracking roles read visits" on employee_visits;
drop policy if exists "tracking roles manage visits" on employee_visits;
drop policy if exists "visits read" on employee_visits;
drop policy if exists "visits manage" on employee_visits;
create policy "visits read" on employee_visits for select to authenticated
using (private.has_project_role(project_id,array['project_director','project_manager','site_engineer','safety_officer']));
create policy "visits manage" on employee_visits for all to authenticated
using (private.has_project_role(project_id,array['project_director','project_manager','site_engineer','safety_officer']))
with check (private.has_project_role(project_id,array['project_director','project_manager','site_engineer','safety_officer']));

drop policy if exists "employees read" on employee_profiles;
drop policy if exists "employees manage" on employee_profiles;
create policy "employees read" on employee_profiles for select to authenticated
using (private.is_business_admin(project_id) or private.has_project_role(project_id,array['project_director','project_manager','site_engineer','safety_officer','qs_billing_engineer','accountant']));
create policy "employees manage" on employee_profiles for all to authenticated
using (private.is_business_admin(project_id) or private.has_project_role(project_id,array['project_director','project_manager']))
with check (private.is_business_admin(project_id) or private.has_project_role(project_id,array['project_director','project_manager']));

-- Administration, procurement and documents
do $$
declare table_name text;
begin
  foreach table_name in array array['procurement_orders','store_items','inventory_events'] loop
    execute format('drop policy if exists "admin roles read %1$s" on %1$I', table_name);
    execute format('drop policy if exists "admin roles manage %1$s" on %1$I', table_name);
    execute format('drop policy if exists "admin read" on %I', table_name);
    execute format('drop policy if exists "admin manage" on %I', table_name);
    execute format('create policy "admin read" on %I for select to authenticated using (private.is_business_admin(project_id) or private.has_project_role(project_id,array[''project_director'',''project_manager'',''store_officer'',''site_engineer'',''qs_billing_engineer'']))', table_name);
    execute format('create policy "admin manage" on %I for all to authenticated using (private.is_business_admin(project_id) or private.has_project_role(project_id,array[''project_director'',''project_manager'',''store_officer''])) with check (private.is_business_admin(project_id) or private.has_project_role(project_id,array[''project_director'',''project_manager'',''store_officer'']))', table_name);
  end loop;
  foreach table_name in array array['contract_obligations','document_register'] loop
    execute format('drop policy if exists "admin roles read %1$s" on %1$I', table_name);
    execute format('drop policy if exists "admin roles manage %1$s" on %1$I', table_name);
    execute format('drop policy if exists "admin read" on %I', table_name);
    execute format('drop policy if exists "admin manage" on %I', table_name);
    execute format('create policy "admin read" on %I for select to authenticated using (private.is_business_admin(project_id) or private.has_project_role(project_id,array[''project_director'',''project_manager'',''qs_billing_engineer'',''design_coordinator'',''qa_qc_engineer'',''employer_viewer'']))', table_name);
    execute format('create policy "admin manage" on %I for all to authenticated using (private.is_business_admin(project_id) or private.has_project_role(project_id,array[''project_director'',''project_manager'',''store_officer''])) with check (private.is_business_admin(project_id) or private.has_project_role(project_id,array[''project_director'',''project_manager'',''store_officer'']))', table_name);
  end loop;
end $$;

drop policy if exists "documents read" on uploaded_documents;
drop policy if exists "documents manage" on uploaded_documents;
create policy "documents read" on uploaded_documents for select to authenticated
using (private.is_project_member(project_id) or private.is_business_admin(project_id));
create policy "documents manage" on uploaded_documents for all to authenticated
using (private.is_business_admin(project_id) or private.has_project_role(project_id,array['project_director','project_manager','qs_billing_engineer','accountant','design_coordinator','qa_qc_engineer','store_officer']))
with check (private.is_business_admin(project_id) or private.has_project_role(project_id,array['project_director','project_manager','qs_billing_engineer','accountant','design_coordinator','qa_qc_engineer','store_officer','site_engineer','field_employee','subcontractor']));

drop policy if exists "notifications read" on app_notifications;
drop policy if exists "notifications add" on app_notifications;
drop policy if exists "notifications update" on app_notifications;
create policy "notifications read" on app_notifications for select to authenticated using (private.is_project_member(project_id));
create policy "notifications add" on app_notifications for insert to authenticated with check (private.is_project_member(project_id));
create policy "notifications update" on app_notifications for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));

drop policy if exists "tenant leaders manage google" on google_connections;
-- Google refresh tokens are encrypted and accessed only through authenticated
-- server routes using the service role. No client policy is intentionally
-- created, including for platform superadmins and business administrators.

-- Evidence: field roles can submit; only a Director can read or manage it.
drop policy if exists "members read site_photos" on site_photos;
drop policy if exists "editors manage site_photos" on site_photos;
drop policy if exists "director reads evidence records" on site_photos;
drop policy if exists "field roles submit evidence records" on site_photos;
drop policy if exists "director manages evidence records" on site_photos;
drop policy if exists "director deletes evidence records" on site_photos;
create policy "director reads evidence records" on site_photos for select to authenticated
using (private.has_project_role(project_id,array['project_director']));
create policy "field roles submit evidence records" on site_photos for insert to authenticated
with check (private.has_project_role(project_id,array['project_director','project_manager','site_engineer','design_coordinator','qa_qc_engineer','safety_officer','field_employee','subcontractor']));
create policy "director manages evidence records" on site_photos for update to authenticated
using (private.has_project_role(project_id,array['project_director'])) with check (private.has_project_role(project_id,array['project_director']));
create policy "director deletes evidence records" on site_photos for delete to authenticated
using (private.has_project_role(project_id,array['project_director']));

grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage on schema public to authenticated;

-- --------------------------------------------------------------------------
-- Private storage buckets
-- --------------------------------------------------------------------------
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('site-photos','site-photos',false,6291456,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=6291456,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('project-documents','project-documents',false,20971520,null)
on conflict (id) do update set public=false,file_size_limit=20971520,allowed_mime_types=null;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('payment-slips','payment-slips',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "authenticated upload project photos" on storage.objects;
drop policy if exists "director reads project photos" on storage.objects;
drop policy if exists "director updates project photos" on storage.objects;
drop policy if exists "director deletes project photos" on storage.objects;
create policy "authenticated upload project photos" on storage.objects for insert to authenticated
with check (bucket_id='site-photos' and private.has_project_role((storage.foldername(name))[1],array['project_director','project_manager','site_engineer','design_coordinator','qa_qc_engineer','safety_officer','field_employee','subcontractor']));
create policy "director reads project photos" on storage.objects for select to authenticated
using (bucket_id='site-photos' and private.has_project_role((storage.foldername(name))[1],array['project_director']));
create policy "director updates project photos" on storage.objects for update to authenticated
using (bucket_id='site-photos' and private.has_project_role((storage.foldername(name))[1],array['project_director']));
create policy "director deletes project photos" on storage.objects for delete to authenticated
using (bucket_id='site-photos' and private.has_project_role((storage.foldername(name))[1],array['project_director']));

drop policy if exists "members upload project documents" on storage.objects;
drop policy if exists "members read project documents" on storage.objects;
drop policy if exists "editors update project documents" on storage.objects;
drop policy if exists "editors delete project documents" on storage.objects;
create policy "members upload project documents" on storage.objects for insert to authenticated
with check (bucket_id='project-documents' and (private.is_project_member((storage.foldername(name))[1]) or private.is_business_admin((storage.foldername(name))[1])));
create policy "members read project documents" on storage.objects for select to authenticated
using (bucket_id='project-documents' and (private.is_project_member((storage.foldername(name))[1]) or private.is_business_admin((storage.foldername(name))[1])));
create policy "editors update project documents" on storage.objects for update to authenticated
using (bucket_id='project-documents' and (private.can_edit_project((storage.foldername(name))[1]) or private.is_business_admin((storage.foldername(name))[1])));
create policy "editors delete project documents" on storage.objects for delete to authenticated
using (bucket_id='project-documents' and (private.can_edit_project((storage.foldername(name))[1]) or private.is_business_admin((storage.foldername(name))[1])));

drop policy if exists "users upload own payment slips" on storage.objects;
drop policy if exists "finance or owner reads payment slips" on storage.objects;
drop policy if exists "finance or owner updates payment slips" on storage.objects;
drop policy if exists "finance or owner deletes payment slips" on storage.objects;
create policy "users upload own payment slips" on storage.objects for insert to authenticated
with check (
  bucket_id='payment-slips'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.has_project_role((storage.foldername(name))[1],array['project_director','project_manager','qs_billing_engineer','accountant','site_engineer','field_employee','subcontractor'])
);
create policy "finance or owner reads payment slips" on storage.objects for select to authenticated
using (
  bucket_id='payment-slips' and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or private.has_project_role((storage.foldername(name))[1],array['project_director','qs_billing_engineer','accountant'])
  )
);
create policy "finance or owner updates payment slips" on storage.objects for update to authenticated
using (bucket_id='payment-slips' and ((storage.foldername(name))[2] = (select auth.uid())::text or private.has_project_role((storage.foldername(name))[1],array['project_director','qs_billing_engineer','accountant'])));
create policy "finance or owner deletes payment slips" on storage.objects for delete to authenticated
using (bucket_id='payment-slips' and ((storage.foldername(name))[2] = (select auth.uid())::text or private.has_project_role((storage.foldername(name))[1],array['project_director','qs_billing_engineer','accountant'])));

commit;

-- Apply the idempotent controls and subscription automation upgrade after this
-- base migration. The standalone file is kept separate so existing deployments
-- can be upgraded without replaying the full schema:
--   supabase_controls_subscription_upgrade.sql
--   supabase_client_onboarding_upgrade.sql

select
  'BuildTrack final product migration complete' as status,
  (select count(*) from organizations) as businesses,
  exists(select 1 from storage.buckets where id='site-photos') as site_photos,
  exists(select 1 from storage.buckets where id='project-documents') as project_documents,
  exists(select 1 from storage.buckets where id='payment-slips') as payment_slips;
