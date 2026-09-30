-- Phase 3F narrowly scoped pending field-update clarification state.
-- Apply manually after the Phase 3F preflight. No client write policy is added.
begin;

create table if not exists field_update_conversation_contexts (
  id text primary key default gen_random_uuid()::text,
  provider text not null,
  origin_provider_message_id text not null,
  last_provider_message_id text not null,
  person_id uuid not null references auth.users(id) on delete cascade,
  organization_id text references organizations(id) on delete cascade,
  pending_question text not null check (pending_question in ('organization', 'project', 'activity')),
  candidate_input jsonb not null default '{}'::jsonb,
  options jsonb not null default '[]'::jsonb,
  state text not null default 'pending' check (state in ('pending', 'resolved', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, origin_provider_message_id)
);

create index if not exists idx_field_update_conversation_active
  on field_update_conversation_contexts(provider, person_id, state, expires_at);
alter table field_update_conversation_contexts enable row level security;
comment on table field_update_conversation_contexts is 'Phase 3F narrow pending clarification state only; not a message history, inbox, or chat framework.';

commit;
