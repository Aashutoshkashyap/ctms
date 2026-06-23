-- BuildTrack D&B — Supabase schema, authentication policies and storage.
-- Run this file once in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists projects (
  id text primary key,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  name text not null,
  contract_number text,
  contract_amount numeric(15,2) not null default 0,
  currency text not null default 'NPR',
  start_date date not null,
  contract_duration_days integer not null,
  target_completion_date date not null,
  jv_status text check (jv_status in ('solo','jv')),
  lead_partner text,
  other_partners text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists project_users (
  id text primary key default gen_random_uuid()::text,
  auth_user_id uuid references auth.users(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in (
    'super_admin','project_director','project_manager','planning_engineer','site_engineer',
    'qs_billing_engineer','design_coordinator','qa_qc_engineer','safety_officer',
    'store_officer','accountant','subcontractor','jv_partner','employer_viewer'
  )),
  created_at timestamptz default now(),
  unique(project_id,email)
);

create table if not exists wbs_items (
  id text primary key, project_id text references projects(id) on delete cascade,
  wbs_code text not null, name text not null, parent_code text, unique(project_id,wbs_code)
);
create table if not exists activities (
  id text primary key, project_id text references projects(id) on delete cascade,
  wbs_code text not null, name text not null, baseline_start date not null, baseline_finish date not null,
  planned_duration integer not null, actual_start date, actual_finish date, remaining_duration integer,
  planned_quantity numeric(14,2) default 0, actual_quantity numeric(14,2) default 0, unit text,
  weightage numeric(7,3) default 0, resource_required text, productivity_rate numeric(14,3),
  status text default 'not_started' check (status in ('not_started','in_progress','completed')),
  updated_at timestamptz default now()
);
create table if not exists activity_dependencies (
  id text primary key, project_id text references projects(id) on delete cascade,
  predecessor_id text references activities(id) on delete cascade,
  successor_id text references activities(id) on delete cascade,
  type text not null default 'FS' check(type in ('FS','SS','FF','SF')), lag integer default 0
);

create table if not exists design_packages (
  id text primary key, project_id text references projects(id) on delete cascade, wbs_code text,
  name text not null, category text, status text default 'pending',
  submitted_date date, review_due_date date, approved_date date, delay_days integer default 0,
  construction_impact text
);
create table if not exists design_comments (
  id text primary key, project_id text references projects(id) on delete cascade,
  design_package_id text references design_packages(id) on delete cascade,
  commenter_role text, commenter_name text, comment_text text not null, created_at timestamptz default now()
);

create table if not exists daily_reports (
  id text primary key, project_id text references projects(id) on delete cascade, report_date date not null,
  weather text, manpower_total integer default 0, equipment_total integer default 0,
  site_instructions text, obstruction_reasons text, next_day_plan text, submitted_by text,
  submitted_at timestamptz default now(), unique(project_id,report_date)
);
create table if not exists daily_work_items (
  id text primary key, project_id text references projects(id) on delete cascade,
  daily_report_id text references daily_reports(id) on delete cascade,
  activity_id text references activities(id) on delete set null, quantity_completed numeric(14,2) not null,
  manpower_count integer default 0, equipment_count integer default 0, delay_reason text, photo_url text
);
create table if not exists material_logs (
  id text primary key, project_id text references projects(id) on delete cascade,
  daily_report_id text references daily_reports(id) on delete cascade,
  material_name text not null, unit text not null, received_qty numeric(14,2) default 0,
  consumed_qty numeric(14,2) default 0, vendor text
);
create table if not exists site_photos (
  id text primary key, project_id text references projects(id) on delete cascade,
  daily_report_id text references daily_reports(id) on delete cascade, name text not null,
  url text not null, caption text, captured_at timestamptz default now()
);

create table if not exists budget_heads (
  id text primary key, project_id text references projects(id) on delete cascade, wbs_code text not null,
  name text not null, contract_value numeric(15,2) not null, internal_budget numeric(15,2) not null,
  actual_cost numeric(15,2) default 0, committed_cost numeric(15,2) default 0
);
create table if not exists subcontractor_packages (
  id text primary key, project_id text references projects(id) on delete cascade, wbs_code text,
  subcontractor_name text not null, package_name text not null, contract_value numeric(15,2) not null,
  actual_cost numeric(15,2) default 0, progress_percentage numeric(7,3) default 0
);
create table if not exists procurement_orders (
  id text primary key, project_id text references projects(id) on delete cascade, po_number text not null,
  vendor text not null, item text not null, quantity numeric(14,2) not null, unit text,
  unit_rate numeric(15,2) default 0, required_date date, expected_date date,
  delivered_quantity numeric(14,2) default 0,
  status text default 'draft' check(status in ('draft','approved','ordered','partially_delivered','delivered','cancelled')),
  unique(project_id,po_number)
);
create table if not exists store_items (
  id text primary key, project_id text references projects(id) on delete cascade, item_code text not null,
  item_name text not null, unit text, opening_stock numeric(14,2) default 0,
  received numeric(14,2) default 0, issued numeric(14,2) default 0,
  reorder_level numeric(14,2) default 0, location text, unique(project_id,item_code)
);

create table if not exists ipc_submissions (
  id text primary key, project_id text references projects(id) on delete cascade, ipc_number integer not null,
  claimed_amount numeric(15,2) not null, certified_amount numeric(15,2) default 0,
  paid_amount numeric(15,2) default 0, retention_deducted numeric(15,2) default 0,
  advance_recovered numeric(15,2) default 0, vat_amount numeric(15,2) default 0,
  status text default 'pending' check(status in ('pending','certified','paid','partially_paid')),
  submitted_date date not null, certified_date date, paid_date date, unique(project_id,ipc_number)
);
create table if not exists finance_rows (
  id text primary key, project_id text references projects(id) on delete cascade, row_key text not null,
  name text not null, category text check(category in ('revenue','cogs','opex')),
  monthly_values jsonb not null default '[]'::jsonb, unique(project_id,row_key)
);
create table if not exists daily_expenses (
  id text primary key, project_id text references projects(id) on delete cascade,
  expense_date date not null, category text not null check(category in (
    'labour','material','equipment','fuel','transport','site_overhead','subcontractor','other'
  )),
  description text not null, vendor text, amount numeric(15,2) not null default 0,
  payment_method text check(payment_method in ('cash','bank','credit','petty_cash')),
  reference text, wbs_code text,
  status text default 'submitted' check(status in ('draft','submitted','approved','rejected')),
  recorded_by text, created_at timestamptz default now()
);

create table if not exists qa_qc_inspections (
  id text primary key, project_id text references projects(id) on delete cascade,
  activity_id text references activities(id) on delete set null, qa_item text not null,
  inspection_date date not null, status text default 'pending' check(status in ('pending','passed','failed')),
  ncr_number text, ncr_open_days integer default 0, test_result_details text
);
create table if not exists safety_logs (
  id text primary key, project_id text references projects(id) on delete cascade, log_date date not null,
  toolbox_talks integer default 0, incidents integer default 0, near_misses integer default 0,
  permits_issued integer default 0, environmental_complaints integer default 0, unique(project_id,log_date)
);

create table if not exists variations_and_claims (
  id text primary key, project_id text references projects(id) on delete cascade,
  type text check(type in ('variation','claim_eot','claim_cost')), reference_id text not null,
  title text not null, event_date date, notice_date date, time_impact_days integer default 0,
  cost_impact_amount numeric(15,2) default 0,
  status text default 'registered' check(status in ('registered','submitted','negotiating','approved','rejected')),
  supporting_docs text[] default '{}', employer_decision_ref text
);
create table if not exists risk_register (
  id text primary key, project_id text references projects(id) on delete cascade, wbs_code text,
  risk_description text not null, category text, probability integer check(probability between 1 and 5),
  impact integer check(impact between 1 and 5), mitigation_action text,
  status text default 'open' check(status in ('open','monitoring','closed'))
);
create table if not exists contract_obligations (
  id text primary key, project_id text references projects(id) on delete cascade, reference text not null,
  title text not null, category text check(category in ('notice','security','insurance','approval','payment','reporting','handover')),
  responsible_party text, due_date date not null,
  status text default 'open' check(status in ('open','due_soon','overdue','complied','waived')),
  evidence text, notes text
);
create table if not exists document_register (
  id text primary key, project_id text references projects(id) on delete cascade, ref_number text not null,
  title text not null, category text, version text default 'Rev 0', submitted_date date not null,
  action_date date, status text default 'draft' check(status in ('draft','under_review','approved','rejected')),
  owner text, remarks text, unique(project_id,ref_number)
);
create table if not exists handover_checklists (
  id text primary key, project_id text references projects(id) on delete cascade,
  item_name text not null, category text, status text default 'pending',
  approved_by text, approved_date date
);
create table if not exists defects_liability (
  id text primary key, project_id text references projects(id) on delete cascade,
  defect_description text not null, reported_date date not null, responsible_team text not null,
  rectification_deadline date not null, status text default 'pending' check(status in ('pending','rectified','verified'))
);

create index if not exists idx_project_users_auth on project_users(auth_user_id);
create index if not exists idx_activities_project on activities(project_id);
create index if not exists idx_daily_reports_project on daily_reports(project_id,report_date);
create index if not exists idx_procurement_project on procurement_orders(project_id);
create index if not exists idx_obligations_project on contract_obligations(project_id,due_date);

-- Membership helper used by RLS policies. It lives outside exposed API schemas.
create schema if not exists private;
create or replace function private.is_project_member(target_project_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from projects p
    where p.id = target_project_id and p.created_by = (select auth.uid())
  ) or exists (
    select 1 from project_users pu
    where pu.project_id = target_project_id and pu.auth_user_id = (select auth.uid())
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_project_member(text) to authenticated;

create or replace function private.can_edit_project(target_project_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from projects p where p.id=target_project_id and p.created_by=(select auth.uid())
  ) or exists (
    select 1 from project_users pu
    where pu.project_id=target_project_id and pu.auth_user_id=(select auth.uid())
      and pu.role <> 'employer_viewer'
  );
$$;
grant execute on function private.can_edit_project(text) to authenticated;

create or replace function private.can_manage_project(target_project_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from projects p where p.id=target_project_id and p.created_by=(select auth.uid())
  ) or exists (
    select 1 from project_users pu
    where pu.project_id=target_project_id and pu.auth_user_id=(select auth.uid())
      and pu.role in ('super_admin','project_director','project_manager')
  );
$$;
grant execute on function private.can_manage_project(text) to authenticated;

alter table projects enable row level security;
alter table project_users enable row level security;
create policy "project members select projects" on projects for select to authenticated using (private.is_project_member(id));
create policy "users create projects" on projects for insert to authenticated with check (created_by = (select auth.uid()));
create policy "managers update projects" on projects for update to authenticated using (private.can_edit_project(id)) with check (private.can_edit_project(id));
create policy "users read memberships" on project_users for select to authenticated using (auth_user_id = (select auth.uid()) or private.is_project_member(project_id));
create policy "project managers manage memberships" on project_users for all to authenticated
using (private.can_manage_project(project_id))
with check (private.can_manage_project(project_id));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'wbs_items','activities','activity_dependencies','design_packages','daily_reports',
    'daily_work_items','material_logs','site_photos','budget_heads','subcontractor_packages',
    'procurement_orders','store_items','ipc_submissions','finance_rows','qa_qc_inspections',
    'daily_expenses',
    'safety_logs','variations_and_claims','risk_register','contract_obligations',
    'document_register','handover_checklists','defects_liability'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('create policy "members read %1$s" on %1$I for select to authenticated using (private.is_project_member(project_id))', table_name);
    execute format('create policy "editors manage %1$s" on %1$I for all to authenticated using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id))', table_name);
  end loop;
end $$;

alter table design_comments enable row level security;
create policy "members read design comments" on design_comments for select to authenticated using (private.is_project_member(project_id));
create policy "editors manage design comments" on design_comments for all to authenticated
using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));

grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage on schema public to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('site-photos','site-photos',true,6291456,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=6291456;

create policy "authenticated upload project photos" on storage.objects for insert to authenticated
with check (bucket_id='site-photos' and private.can_edit_project((storage.foldername(name))[1]));
create policy "members update project photos" on storage.objects for update to authenticated
using (bucket_id='site-photos' and private.can_edit_project((storage.foldername(name))[1]));
create policy "public read site photos" on storage.objects for select to public using (bucket_id='site-photos');
