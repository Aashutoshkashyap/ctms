-- Phase 1O: controlled variations, claims and EOT using the existing commercial register.
begin;

alter table variations_and_claims add column if not exists organization_id text references organizations(id) on delete cascade;
alter table variations_and_claims add column if not exists description text;
alter table variations_and_claims add column if not exists reason_basis text;
alter table variations_and_claims add column if not exists affected_activity_id text references activities(id) on delete restrict;
alter table variations_and_claims add column if not exists proposed_quantity numeric(14,3);
alter table variations_and_claims add column if not exists proposed_rate numeric(15,2);
alter table variations_and_claims add column if not exists workflow_status text not null default 'draft' check (workflow_status in ('draft','submitted','under_review','approved','rejected','withdrawn'));
alter table variations_and_claims add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table variations_and_claims add column if not exists submitted_by uuid references auth.users(id) on delete set null;
alter table variations_and_claims add column if not exists submitted_at timestamptz;
alter table variations_and_claims add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table variations_and_claims add column if not exists reviewed_at timestamptz;
alter table variations_and_claims add column if not exists decided_by uuid references auth.users(id) on delete set null;
alter table variations_and_claims add column if not exists decided_at timestamptz;
alter table variations_and_claims add column if not exists decision_remarks text;
alter table variations_and_claims add column if not exists requested_completion_date date;
alter table variations_and_claims add column if not exists approved_extension_days integer check (approved_extension_days is null or approved_extension_days >= 0);
alter table variations_and_claims add column if not exists approved_completion_date date;
alter table projects add column if not exists original_target_completion_date date;
alter table projects add column if not exists approved_target_completion_date date;

create table if not exists commercial_action_history (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  commercial_record_id text not null references variations_and_claims(id) on delete cascade,
  action text not null check (action in ('created','updated','submitted','under_review','approved','rejected','withdrawn')),
  remarks text, actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_variations_claims_phase1o on variations_and_claims(organization_id, project_id, workflow_status, event_date desc);
create index if not exists idx_commercial_history_record on commercial_action_history(organization_id, commercial_record_id, created_at);

create or replace function private.phase1o_guard_commercial_record() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if new.organization_id is not null and not exists (select 1 from projects p where p.id = new.project_id and p.organization_id = new.organization_id) then raise exception 'Commercial record project must belong to organization' using errcode = '42501'; end if;
  if new.affected_activity_id is not null and not exists (select 1 from activities a where a.id = new.affected_activity_id and a.project_id = new.project_id) then raise exception 'Affected BOQ activity must belong to project' using errcode = '42501'; end if;
  if old is not null and old.workflow_status = 'approved' and (new.workflow_status is distinct from old.workflow_status or new.title is distinct from old.title or new.description is distinct from old.description or new.reason_basis is distinct from old.reason_basis or new.cost_impact_amount is distinct from old.cost_impact_amount or new.time_impact_days is distinct from old.time_impact_days or new.affected_activity_id is distinct from old.affected_activity_id or new.proposed_quantity is distinct from old.proposed_quantity or new.proposed_rate is distinct from old.proposed_rate or new.approved_extension_days is distinct from old.approved_extension_days or new.approved_completion_date is distinct from old.approved_completion_date) then raise exception 'Approved commercial records are immutable' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists phase1o_commercial_record_guard on variations_and_claims;
create trigger phase1o_commercial_record_guard before insert or update on variations_and_claims for each row execute function private.phase1o_guard_commercial_record();
create or replace function private.phase1o_guard_commercial_history() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from variations_and_claims c where c.id = new.commercial_record_id and c.project_id = new.project_id and c.organization_id = new.organization_id) then raise exception 'Commercial history must remain tenant and project scoped' using errcode = '42501'; end if; return new;
end $$;
drop trigger if exists phase1o_commercial_history_guard on commercial_action_history;
create trigger phase1o_commercial_history_guard before insert or update on commercial_action_history for each row execute function private.phase1o_guard_commercial_history();
alter table commercial_action_history enable row level security;
commit;
