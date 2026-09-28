-- UX-2 additive assignment metadata. This table never grants application access;
-- project_users and the established authorization boundary remain authoritative.
create table if not exists project_person_assignments (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  person_id uuid not null references auth.users(id) on delete cascade,
  project_role text not null,
  feature_access jsonb not null default '{}'::jsonb,
  start_date date not null,
  end_date date,
  reports_to_person_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_person_assignments_period check (end_date is null or end_date >= start_date),
  constraint project_person_assignments_no_self_report check (reports_to_person_id is null or reports_to_person_id <> person_id),
  unique(project_id, person_id)
);
create index if not exists idx_project_person_assignments_project on project_person_assignments(organization_id, project_id, start_date);
alter table project_person_assignments enable row level security;
-- Browser clients have no direct policy: the server-authorized route is the only mutation boundary.
