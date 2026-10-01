-- B6: organization-scoped OpenWA integration. CTMS remains authoritative for
-- membership, project access, notification recipients and business records.
begin;

create table if not exists organization_whatsapp_connections (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  openwa_session_id text not null,
  status text not null default 'NOT_CONNECTED' check (status in ('NOT_CONNECTED','WAITING_FOR_PAIRING','CONNECTED','DISCONNECTED','ERROR')),
  whatsapp_phone text,
  display_name text,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  last_status_at timestamptz not null default now(),
  last_error text,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id),
  unique (openwa_session_id)
);

create table if not exists whatsapp_inbound_events (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  connection_id text not null references organization_whatsapp_connections(id) on delete cascade,
  provider_event_id text not null,
  provider_event_type text not null,
  sender_phone text,
  sender_phone_normalized text,
  sender_match_status text not null check (sender_match_status in ('MATCHED','UNKNOWN','AMBIGUOUS')),
  employee_profile_id text references employee_profiles(id) on delete set null,
  person_id uuid references auth.users(id) on delete set null,
  project_id text references projects(id) on delete set null,
  department_key text,
  message_preview text,
  occurred_at timestamptz not null,
  processing_status text not null default 'RECEIVED' check (processing_status in ('RECEIVED','PROCESSED','FAILED')),
  workflow_event_id text references workflow_events(id) on delete set null,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_event_id)
);

create index if not exists organization_whatsapp_connections_status_idx on organization_whatsapp_connections(organization_id, status);
create index if not exists whatsapp_inbound_events_connection_time_idx on whatsapp_inbound_events(connection_id, occurred_at desc);
create index if not exists whatsapp_inbound_events_org_project_time_idx on whatsapp_inbound_events(organization_id, project_id, occurred_at desc);

create or replace function private.b6_validate_whatsapp_event_scope()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if not exists (select 1 from organization_whatsapp_connections connection where connection.id = new.connection_id and connection.organization_id = new.organization_id) then
    raise exception 'WhatsApp connection must belong to its organization';
  end if;
  if new.project_id is not null and not exists (select 1 from projects project where project.id = new.project_id and project.organization_id = new.organization_id) then
    raise exception 'WhatsApp event project must belong to its organization';
  end if;
  if new.workflow_event_id is not null and not exists (select 1 from workflow_events event where event.id = new.workflow_event_id and event.organization_id = new.organization_id and (new.project_id is null or event.project_id = new.project_id)) then
    raise exception 'WhatsApp event workflow reference must match its organization/project';
  end if;
  return new;
end;
$$;

drop trigger if exists b6_whatsapp_event_scope_guard on whatsapp_inbound_events;
create trigger b6_whatsapp_event_scope_guard before insert or update on whatsapp_inbound_events for each row execute function private.b6_validate_whatsapp_event_scope();

alter table organization_whatsapp_connections enable row level security;
alter table whatsapp_inbound_events enable row level security;
-- Browser clients have no policies. Company-admin routes and the verified
-- OpenWA webhook use the server-only Supabase service client.

commit;
