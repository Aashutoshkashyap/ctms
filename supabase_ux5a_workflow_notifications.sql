-- UX-5A: forward-only server-side workflow event ledger and personal inbox.
-- Existing legacy notification rows are preserved but intentionally excluded
-- from the server-authoritative inbox until a future, explicit migration.
begin;

create table if not exists workflow_events (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  department_key text,
  event_type text not null,
  source_type text not null,
  source_id text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);

alter table app_notifications add column if not exists event_id text references workflow_events(id) on delete cascade;
alter table app_notifications add column if not exists recipient_user_id uuid references auth.users(id) on delete cascade;
alter table app_notifications add column if not exists read_at timestamptz;
create unique index if not exists app_notifications_event_recipient_unique on app_notifications(event_id, recipient_user_id) where event_id is not null and recipient_user_id is not null;
create index if not exists workflow_events_project_time on workflow_events(organization_id, project_id, occurred_at desc);
create index if not exists app_notifications_recipient_time on app_notifications(recipient_user_id, project_id, created_at desc);

create or replace function private.ux5a_validate_workflow_event_project()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if not exists (select 1 from projects where id = new.project_id and organization_id = new.organization_id) then
    raise exception 'workflow event project must belong to its organization';
  end if;
  return new;
end;
$$;

create or replace function private.ux5a_validate_notification_event()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.event_id is not null and not exists (
    select 1 from workflow_events event where event.id = new.event_id and event.project_id = new.project_id
  ) then
    raise exception 'notification project must match its workflow event';
  end if;
  return new;
end;
$$;

drop trigger if exists ux5a_workflow_event_project_guard on workflow_events;
create trigger ux5a_workflow_event_project_guard before insert or update on workflow_events for each row execute function private.ux5a_validate_workflow_event_project();
drop trigger if exists ux5a_notification_event_guard on app_notifications;
create trigger ux5a_notification_event_guard before insert or update on app_notifications for each row execute function private.ux5a_validate_notification_event();

alter table workflow_events enable row level security;
alter table app_notifications enable row level security;
-- Revoke browser mutation paths from legacy local-storage synchronization.
drop policy if exists "notifications read" on app_notifications;
drop policy if exists "notifications add" on app_notifications;
drop policy if exists "notifications update" on app_notifications;
drop policy if exists "members read app_notifications" on app_notifications;
drop policy if exists "editors manage app_notifications" on app_notifications;
drop policy if exists "phase1a tenant scope" on app_notifications;
-- No browser policies are intentionally created. Server routes use the secret
-- service client after token, tenant and project-membership verification.

commit;
