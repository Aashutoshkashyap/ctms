-- Phase 3C: additive responsibility and provider-neutral notification routing foundation.
-- Run supabase_phase3c_notification_routing_preflight.sql first.
-- This does not send email, WhatsApp, or any other external delivery.

begin;

create table if not exists project_reporting_relationships (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  person_id uuid not null references auth.users(id) on delete cascade,
  supervisor_person_id uuid references auth.users(id) on delete set null,
  is_project_responsible boolean not null default false,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, person_id),
  check (person_id is distinct from supervisor_person_id)
);

create table if not exists organization_notification_recipients (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  person_id uuid not null references auth.users(id) on delete cascade,
  event_types text[] not null default '{}',
  channels text[] not null default array['BUILDTRACK'],
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, person_id),
  check (channels <@ array['BUILDTRACK','EMAIL','WHATSAPP','OTHER'])
);

-- Preserve existing project-wide activity entries. Recipient-specific rows use
-- these nullable columns and are visible only to the addressed identity.
alter table app_notifications add column if not exists organization_id text references organizations(id) on delete cascade;
alter table app_notifications add column if not exists event_id text;
alter table app_notifications add column if not exists event_type text;
alter table app_notifications add column if not exists actor_person_id uuid references auth.users(id) on delete set null;
alter table app_notifications add column if not exists recipient_person_id uuid references auth.users(id) on delete cascade;
alter table app_notifications add column if not exists record_id text;
alter table app_notifications add column if not exists source text;
alter table app_notifications add column if not exists delivery_channel text;
alter table app_notifications add column if not exists delivery_status text;

update app_notifications n
set organization_id = p.organization_id
from projects p
where n.project_id = p.id and n.organization_id is null;

create unique index if not exists app_notifications_event_recipient_channel_unique
  on app_notifications(event_id, recipient_person_id, delivery_channel)
  where event_id is not null and recipient_person_id is not null and delivery_channel is not null;
create index if not exists idx_reporting_relationships_project on project_reporting_relationships(project_id, person_id);
create index if not exists idx_reporting_relationships_supervisor on project_reporting_relationships(project_id, supervisor_person_id);
create index if not exists idx_org_notification_recipients on organization_notification_recipients(organization_id, person_id);
create index if not exists idx_notifications_recipient_recent on app_notifications(recipient_person_id, created_at desc) where recipient_person_id is not null;

alter table project_reporting_relationships enable row level security;
alter table organization_notification_recipients enable row level security;

drop policy if exists "reporting relationships read" on project_reporting_relationships;
drop policy if exists "reporting relationships manage" on project_reporting_relationships;
create policy "reporting relationships read" on project_reporting_relationships for select to authenticated
using (person_id = (select auth.uid()) or supervisor_person_id = (select auth.uid()) or private.can_manage_project(project_id));
create policy "reporting relationships manage" on project_reporting_relationships for all to authenticated
using (private.can_manage_project(project_id)) with check (
  private.can_manage_project(project_id)
  and exists (select 1 from projects p where p.id = project_id and p.organization_id = organization_id)
  and exists (select 1 from project_users pu where pu.project_id = project_id and pu.auth_user_id = person_id)
  and (supervisor_person_id is null or exists (select 1 from project_users pu where pu.project_id = project_id and pu.auth_user_id = supervisor_person_id))
);

drop policy if exists "organization notification recipients read" on organization_notification_recipients;
drop policy if exists "organization notification recipients manage" on organization_notification_recipients;
create policy "organization notification recipients read" on organization_notification_recipients for select to authenticated
using (person_id = (select auth.uid()) or private.is_org_leader(organization_id));
create policy "organization notification recipients manage" on organization_notification_recipients for all to authenticated
using (private.is_org_leader(organization_id)) with check (
  private.is_org_leader(organization_id)
  and exists (
    select 1 from organization_members om
    where om.organization_id = organization_id and om.auth_user_id = person_id
      and om.status = 'active' and om.role in ('business_admin', 'project_director')
  )
);

-- Recipient-specific records do not widen project access. Legacy records with
-- no recipient retain the pre-existing project-member visibility behavior.
drop policy if exists "notifications read" on app_notifications;
create policy "notifications read" on app_notifications for select to authenticated
using (
  recipient_person_id = (select auth.uid())
  or (recipient_person_id is null and private.is_project_member(project_id))
);

comment on table project_reporting_relationships is 'Phase 3C operational project-specific reporting/responsibility; not an HR hierarchy.';
comment on table organization_notification_recipients is 'Explicit company leadership recipients. Visibility and notification subscription remain separate.';
comment on column app_notifications.delivery_channel is 'Provider-neutral routing target. Phase 3C writes BUILDTRACK only; it sends nothing externally.';

commit;
