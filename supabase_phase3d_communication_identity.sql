-- Phase 3D: person-scoped, provider-neutral communication identity foundation.
-- Run supabase_phase3d_communication_identity_preflight.sql first. Apply manually.

begin;

create table if not exists communication_identities (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  person_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('WHATSAPP')),
  provider text not null default 'GENERIC' check (provider in ('GENERIC')),
  normalized_address text not null,
  pairing_state text not null default 'UNVERIFIED' check (pairing_state in ('UNVERIFIED','PENDING','VERIFIED','REVOKED')),
  created_by uuid references auth.users(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(normalized_address) between 7 and 32)
);

create unique index if not exists communication_identity_active_address_unique
  on communication_identities(organization_id, channel, provider, normalized_address)
  where pairing_state <> 'REVOKED';
create unique index if not exists communication_identity_active_person_channel_unique
  on communication_identities(organization_id, person_id, channel, provider)
  where pairing_state <> 'REVOKED';
create index if not exists idx_communication_identity_person on communication_identities(organization_id, person_id);

create or replace function private.phase3d_guard_communication_identity()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (
    select 1 from projects p join project_users pu on pu.project_id = p.id
    where p.organization_id = new.organization_id and pu.auth_user_id = new.person_id
  ) then
    raise exception 'Communication identity person must be assigned within its organization' using errcode = '42501';
  end if;
  if new.channel = 'WHATSAPP' and new.normalized_address !~ '^\\+9779[78][0-9]{8}$' then
    raise exception 'WhatsApp identity must use the canonical Nepal mobile format' using errcode = '22023';
  end if;
  if new.pairing_state = 'VERIFIED' and (new.verified_at is null or new.verified_by is null) then
    raise exception 'Verified identities require provider-confirmed verification metadata' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger phase3d_communication_identity_guard
before insert or update on communication_identities
for each row execute function private.phase3d_guard_communication_identity();

alter table communication_identities enable row level security;
create policy "communication identity owner read" on communication_identities for select to authenticated
using (person_id = (select auth.uid()));
-- No client write policy: server routes first enforce Phase 1A manage_users.

comment on table communication_identities is 'Phase 3D person-scoped communication identity. It is not an authentication account or provider session store.';
comment on column communication_identities.provider_metadata is 'Provider-neutral, non-secret metadata only. Do not store credentials, session tokens, or messages.';

commit;
