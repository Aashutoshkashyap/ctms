-- Phase 1J additive leave and planned workforce allocation foundation. Apply manually after preflight.
begin;
create table if not exists employee_leave_records (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  employee_id text not null references employee_records(id) on delete cascade,
  project_id text references projects(id) on delete set null,
  leave_type text not null, start_date date not null, end_date date not null, number_of_days numeric(8,2) not null check (number_of_days > 0),
  reason text, status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','cancelled')),
  submitted_by uuid references auth.users(id) on delete set null, reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz, review_notes text, cancelled_by uuid references auth.users(id) on delete set null, cancelled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date >= start_date), check ((status not in ('approved','rejected')) or reviewed_by is not null)
);
create table if not exists employee_resource_allocations (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  employee_id text not null references employee_records(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  activity_id text, start_date date not null, end_date date not null, planned_role text, work_function text,
  planned_quantity numeric(10,2) not null default 1 check (planned_quantity > 0), status text not null default 'planned' check (status in ('planned','active','completed','cancelled')),
  notes text, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_employee_leave_availability on employee_leave_records(organization_id, employee_id, status, start_date, end_date);
create index if not exists idx_employee_leave_project on employee_leave_records(organization_id, project_id, status, start_date);
create index if not exists idx_employee_allocations_availability on employee_resource_allocations(organization_id, employee_id, status, start_date, end_date);
create index if not exists idx_employee_allocations_project on employee_resource_allocations(organization_id, project_id, status, start_date);
create or replace function private.phase1j_guard_leave() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
 if not exists(select 1 from employee_records e where e.id = new.employee_id and e.organization_id = new.organization_id) then raise exception 'Leave employee must belong to organization' using errcode='42501'; end if;
 if new.project_id is not null and not exists(select 1 from projects p where p.id = new.project_id and p.organization_id = new.organization_id) then raise exception 'Leave project must belong to organization' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists phase1j_leave_guard on employee_leave_records;
create trigger phase1j_leave_guard before insert or update on employee_leave_records for each row execute function private.phase1j_guard_leave();
create or replace function private.phase1j_guard_allocation() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
 if not exists(select 1 from employee_records e where e.id = new.employee_id and e.organization_id = new.organization_id) then raise exception 'Allocation employee must belong to organization' using errcode='42501'; end if;
 if not exists(select 1 from projects p where p.id = new.project_id and p.organization_id = new.organization_id) then raise exception 'Allocation project must belong to organization' using errcode='42501'; end if;
 if not exists(select 1 from employee_project_assignments a where a.employee_id = new.employee_id and a.project_id = new.project_id and a.organization_id = new.organization_id and a.status='active' and (a.start_date is null or a.start_date <= new.start_date) and (a.end_date is null or a.end_date >= new.end_date)) then raise exception 'Allocation requires an active project workforce assignment' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists phase1j_allocation_guard on employee_resource_allocations;
create trigger phase1j_allocation_guard before insert or update on employee_resource_allocations for each row execute function private.phase1j_guard_allocation();
alter table employee_leave_records enable row level security;
alter table employee_resource_allocations enable row level security;
comment on table employee_leave_records is 'Phase 1J HR absence records. It is not attendance or payroll.';
comment on table employee_resource_allocations is 'Phase 1J planned workforce deployment. It never grants BuildTrack access.';
commit;
