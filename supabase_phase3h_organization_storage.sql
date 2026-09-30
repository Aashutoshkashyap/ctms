-- Phase 3H additive, server-managed organization storage foundation.
-- Do not apply until the Phase 3H preflight is reviewed.
begin;

create table if not exists organization_storage_connections (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('GOOGLE_DRIVE', 'FUTURE')),
  ownership_type text not null check (ownership_type in ('PERSONAL_DRIVE', 'SHARED_DRIVE', 'ORGANIZATION_CONTROLLED')),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONNECTED', 'VERIFICATION_REQUIRED', 'ERROR', 'INACTIVE')),
  is_active boolean not null default false,
  root_object_id text not null check (root_object_id !~* '^(https?|data):'),
  shared_drive_id text check (shared_drive_id is null or shared_drive_id !~* '^(https?|data):'),
  provider_account_hint text,
  encrypted_refresh_token text,
  connected_by uuid references auth.users(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((ownership_type = 'SHARED_DRIVE') = (shared_drive_id is not null)),
  check (ownership_type <> 'ORGANIZATION_CONTROLLED' or verified_at is not null)
);

create unique index if not exists organization_storage_one_active_provider
  on organization_storage_connections (organization_id, provider) where is_active;
create index if not exists idx_organization_storage_connections_status
  on organization_storage_connections (organization_id, provider, status, updated_at desc);

create table if not exists organization_storage_project_folders (
  id text primary key default gen_random_uuid()::text,
  connection_id text not null references organization_storage_connections(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  project_folder_id text not null check (project_folder_id !~* '^(https?|data):'),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONNECTED', 'ERROR', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, project_id)
);

create index if not exists idx_organization_storage_project_folders_resolution
  on organization_storage_project_folders (organization_id, project_id, connection_id, status);

create or replace function private.phase3h_guard_organization_storage()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if new.is_active and new.status <> 'CONNECTED' then
    raise exception 'Only connected storage can be active' using errcode = '23514';
  end if;
  if new.ownership_type = 'ORGANIZATION_CONTROLLED' and new.verified_by is null then
    raise exception 'Organization-controlled storage requires an explicit verifier' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger phase3h_organization_storage_guard
before insert or update on organization_storage_connections
for each row execute function private.phase3h_guard_organization_storage();

create or replace function private.phase3h_guard_organization_storage_folder()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'Storage project must belong to storage organization' using errcode = '42501';
  end if;
  if not exists (select 1 from organization_storage_connections c where c.id = new.connection_id and c.organization_id = new.organization_id) then
    raise exception 'Storage connection must belong to storage organization' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger phase3h_organization_storage_folder_guard
before insert or update on organization_storage_project_folders
for each row execute function private.phase3h_guard_organization_storage_folder();

alter table organization_storage_connections enable row level security;
alter table organization_storage_project_folders enable row level security;
comment on table organization_storage_connections is 'Phase 3H server-managed organization storage metadata. Browser clients receive no direct write policy or OAuth token access.';

commit;
