-- Phase 3E: server-side idempotency ledger for canonical field-update commands.
-- Run the Phase 3E preflight first. Apply manually; no client policy is added.

begin;

create table if not exists field_update_operations (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  operation_key text not null,
  person_id uuid not null references auth.users(id) on delete cascade,
  project_id text references projects(id) on delete set null,
  source text not null check (source in ('WEB','MOBILE','WHATSAPP','FUTURE')),
  state text not null default 'PENDING' check (state in ('PENDING','ACCEPTED','FAILED','CONFLICT')),
  canonical_record_id text,
  outcome_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, operation_key)
);

create index if not exists idx_field_update_operations_person on field_update_operations(organization_id, person_id, created_at desc);
alter table field_update_operations enable row level security;
-- Server commands use the service role after Phase 1A authorization. No browser
-- policy is intentionally supplied, so an operation key cannot expose updates.

comment on table field_update_operations is 'Phase 3E server idempotency ledger; not a second client mutation queue or message history.';

commit;
