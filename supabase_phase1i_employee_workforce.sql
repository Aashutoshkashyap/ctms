-- Phase 1I additive organization HR/workforce foundation. Apply manually only after preflight.
begin;

create table if not exists employee_records (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  person_id uuid references auth.users(id) on delete set null,
  employee_code text not null,
  full_name text not null,
  email text,
  phone text,
  employment_status text not null default 'active' check (employment_status in ('active','probation','on_leave','suspended','separated','inactive')),
  employment_type text check (employment_type in ('full_time','part_time','contract','casual','consultant','other')),
  department text, designation text, joining_date date, exit_date date,
  trade_skill text, location text, emergency_contact text, notes text,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, employee_code), unique (organization_id, person_id),
  check (exit_date is null or joining_date is null or exit_date >= joining_date)
);

create table if not exists employee_project_assignments (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  employee_id text not null references employee_records(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  project_role text, manager_person_id uuid references auth.users(id) on delete set null,
  project_user_id text references project_users(id) on delete set null,
  start_date date, end_date date, status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (employee_id, project_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists employee_employment_history (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  employee_id text not null references employee_records(id) on delete cascade,
  event_type text not null check (event_type in ('joined','designation_change','department_transfer','status_change','project_transfer','separated','note')),
  effective_date date, previous_value jsonb not null default '{}'::jsonb, next_value jsonb not null default '{}'::jsonb,
  notes text, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);

create table if not exists employee_credentials (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  employee_id text not null references employee_records(id) on delete cascade,
  credential_type text not null check (credential_type in ('skill','certification','license','training','other')),
  title text not null, issuer text, reference_number text, issued_date date, expiry_date date,
  status text not null default 'active' check (status in ('active','expired','revoked','pending')), metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists employee_documents (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  employee_id text not null references employee_records(id) on delete cascade,
  document_type text not null, original_filename text not null, mime_type text, size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  storage_provider text not null default 'SUPABASE_STORAGE' check (storage_provider in ('SUPABASE_STORAGE','GOOGLE_DRIVE')),
  storage_path text not null, status text not null default 'uploaded' check (status in ('pending','uploaded','failed','removed')),
  uploaded_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, storage_provider, storage_path)
);

create index if not exists idx_employee_records_org_active on employee_records(organization_id, active, full_name);
create index if not exists idx_employee_assignments_project on employee_project_assignments(organization_id, project_id, status);
create index if not exists idx_employee_history_employee on employee_employment_history(organization_id, employee_id, effective_date desc);
create index if not exists idx_employee_credentials_employee on employee_credentials(organization_id, employee_id, expiry_date);
create index if not exists idx_employee_documents_employee on employee_documents(organization_id, employee_id);

create or replace function private.phase1i_guard_employee_assignment() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from employee_records e where e.id = new.employee_id and e.organization_id = new.organization_id) then raise exception 'Employee must belong to assignment organization' using errcode = '42501'; end if;
  if not exists (select 1 from projects p where p.id = new.project_id and p.organization_id = new.organization_id) then raise exception 'Project must belong to assignment organization' using errcode = '42501'; end if;
  if new.manager_person_id is not null and not exists (select 1 from project_users pu where pu.project_id = new.project_id and pu.auth_user_id = new.manager_person_id) then raise exception 'Assignment manager must be a project member' using errcode = '42501'; end if;
  if new.project_user_id is not null and not exists (select 1 from project_users pu join employee_records e on e.person_id = pu.auth_user_id where pu.id = new.project_user_id and pu.project_id = new.project_id and e.id = new.employee_id) then raise exception 'Linked project membership must belong to employee and project' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists phase1i_employee_assignment_guard on employee_project_assignments;
create trigger phase1i_employee_assignment_guard before insert or update on employee_project_assignments for each row execute function private.phase1i_guard_employee_assignment();

create or replace function private.phase1i_guard_employee_child() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin if not exists (select 1 from employee_records e where e.id = new.employee_id and e.organization_id = new.organization_id) then raise exception 'Employee record must belong to organization' using errcode = '42501'; end if; return new; end $$;
drop trigger if exists phase1i_employee_history_guard on employee_employment_history;
create trigger phase1i_employee_history_guard before insert or update on employee_employment_history for each row execute function private.phase1i_guard_employee_child();
drop trigger if exists phase1i_employee_credential_guard on employee_credentials;
create trigger phase1i_employee_credential_guard before insert or update on employee_credentials for each row execute function private.phase1i_guard_employee_child();
drop trigger if exists phase1i_employee_document_guard on employee_documents;
create trigger phase1i_employee_document_guard before insert or update on employee_documents for each row execute function private.phase1i_guard_employee_child();

alter table employee_records enable row level security;
alter table employee_project_assignments enable row level security;
alter table employee_employment_history enable row level security;
alter table employee_credentials enable row level security;
alter table employee_documents enable row level security;
insert into storage.buckets (id, name, public) values ('employee-documents','employee-documents',false) on conflict (id) do nothing;
comment on table employee_records is 'Organization HR master. It does not create an application login.';
comment on table employee_project_assignments is 'Workforce deployment; project_users remains the sole capability-granting membership.';
commit;
