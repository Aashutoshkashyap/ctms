-- Phase 3I additive OpenWA provider configuration. Apply only after preflight.
begin;

create table if not exists openwa_provider_configurations (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('OPENWA')),
  state text not null default 'DISABLED' check (state in ('DISABLED', 'CONFIGURED', 'ENABLED', 'ERROR')),
  endpoint_base_url text,
  webhook_secret_ref text,
  last_health_at timestamptz,
  last_health_state text check (last_health_state in ('UNKNOWN', 'HEALTHY', 'ERROR')),
  last_error_code text,
  configured_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider),
  check (state <> 'ENABLED' or (endpoint_base_url is not null and webhook_secret_ref is not null)),
  check (webhook_secret_ref is null or webhook_secret_ref !~* '^(https?|data):')
);

create index if not exists idx_openwa_provider_configurations_state
  on openwa_provider_configurations (organization_id, provider, state, updated_at desc);

alter table openwa_provider_configurations enable row level security;
comment on table openwa_provider_configurations is 'Phase 3I server-managed OpenWA transport metadata. No secret material or browser write policy is stored here.';

commit;
