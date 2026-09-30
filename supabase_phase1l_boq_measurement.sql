-- Phase 1L additive executed-quantity ledger against existing activities/BOQ items. Apply manually after preflight.
begin;
create table if not exists boq_item_measurements (
 id text primary key default gen_random_uuid()::text, organization_id text not null references organizations(id) on delete cascade, project_id text not null references projects(id) on delete cascade,
 activity_id text not null references activities(id) on delete restrict, measurement_date date not null, quantity numeric(14,3) not null check(quantity>=0),
 description text, reference text, source text not null default 'site_measurement' check(source in ('site_measurement','daily_report','engineer_measurement','contractor_submission','other')),
 status text not null default 'draft' check(status in ('draft','submitted','approved','rejected')), entered_by uuid references auth.users(id) on delete set null, submitted_by uuid references auth.users(id) on delete set null, submitted_at timestamptz, reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz, rejection_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((status not in ('approved','rejected')) or reviewed_by is not null)
);
create index if not exists idx_boq_measurements_project_activity on boq_item_measurements(organization_id,project_id,activity_id,status,measurement_date);
create or replace function private.phase1l_guard_measurement() returns trigger language plpgsql security definer set search_path=public,auth as $$ begin
 if not exists(select 1 from projects p where p.id=new.project_id and p.organization_id=new.organization_id) then raise exception 'Measurement project must belong to organization' using errcode='42501'; end if;
 if not exists(select 1 from activities a where a.id=new.activity_id and a.project_id=new.project_id) then raise exception 'Measurement BOQ item must belong to project' using errcode='42501'; end if;
 if old is not null and old.status='approved' and (new.quantity is distinct from old.quantity or new.activity_id is distinct from old.activity_id or new.project_id is distinct from old.project_id) then raise exception 'Approved measurements are immutable' using errcode='42501'; end if;
 return new; end $$;
drop trigger if exists phase1l_measurement_guard on boq_item_measurements;create trigger phase1l_measurement_guard before insert or update on boq_item_measurements for each row execute function private.phase1l_guard_measurement();
alter table boq_item_measurements enable row level security;
comment on table boq_item_measurements is 'Phase 1L executed quantity ledger. Approved quantities are valuation inputs; this table does not create IPC or variation records.';
commit;
