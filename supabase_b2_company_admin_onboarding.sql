-- B2: additive organization profile and server-authorized invitation foundation.
begin;
alter table organizations add column if not exists legal_name text;
alter table organizations add column if not exists phone text;
alter table organizations add column if not exists address text;
alter table organizations add column if not exists website text;
create table if not exists organization_invitations (
 id text primary key default gen_random_uuid()::text, organization_id text not null references organizations(id) on delete cascade,
 email text not null, name text not null, role text not null check(role in ('business_admin','project_director')),
 token_hash text not null, status text not null default 'invited' check(status in ('invited','accepted','revoked','expired')),
 expires_at timestamptz not null, invited_by uuid references auth.users(id) on delete set null, accepted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,email), unique(token_hash)
);
create index if not exists idx_organization_invitations_lookup on organization_invitations(organization_id,status,expires_at);
alter table organization_invitations enable row level security;
commit;
