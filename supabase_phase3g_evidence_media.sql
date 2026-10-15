-- Phase 3G provider-neutral, server-managed evidence ledger.
-- Apply manually after the Phase 3G preflight. No browser/client write policy is added.
begin;

create table if not exists evidence_media (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  operation_key text not null,
  canonical_record_id text,
  field_update_operation_id text references field_update_operations(id) on delete set null,
  uploader_person_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('WEB', 'MOBILE', 'WHATSAPP', 'FUTURE')),
  media_type text not null check (media_type in ('IMAGE', 'AUDIO', 'DOCUMENT')),
  storage_provider text not null check (storage_provider in ('SUPABASE_STORAGE', 'GOOGLE_DRIVE', 'WHATSAPP_PROVIDER', 'FUTURE')),
  provider_object_id text not null check (provider_object_id !~* '^(https?|data):'),
  original_filename text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  captured_at timestamptz,
  status text not null default 'PENDING' check (status in ('PENDING', 'INGESTED', 'ATTACHED', 'FAILED')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, operation_key),
  unique (organization_id, storage_provider, provider_object_id)
);

create index if not exists idx_evidence_media_project_status on evidence_media(organization_id, project_id, status, created_at desc);
create index if not exists idx_evidence_media_field_update on evidence_media(field_update_operation_id) where field_update_operation_id is not null;

create or replace function private.phase3g_guard_evidence_media()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'Evidence project must belong to evidence organization' using errcode = '42501';
  end if;
  if new.field_update_operation_id is not null and not exists (
    select 1 from field_update_operations o
    where o.id = new.field_update_operation_id and o.organization_id = new.organization_id
      and (o.project_id is null or o.project_id = new.project_id)
  ) then
    raise exception 'Evidence operation must belong to evidence tenant/project' using errcode = '42501';
  end if;
  if new.status = 'ATTACHED' and new.canonical_record_id is null then
    raise exception 'Attached evidence requires a canonical record reference' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger phase3g_evidence_media_guard
before insert or update on evidence_media
for each row execute function private.phase3g_guard_evidence_media();

alter table evidence_media enable row level security;
comment on table evidence_media is 'Phase 3G canonical evidence ledger. Storage URLs are not authorization; server adapters resolve opaque provider object IDs.';

commit;
