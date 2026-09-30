-- Additive Google Drive document reference/index layer. File bytes remain in Google Drive.
create extension if not exists pgcrypto;

create table if not exists document_references (
  id uuid primary key default gen_random_uuid(),
  document_group_id uuid not null default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete restrict,
  project_id text not null references projects(id) on delete restrict,
  module text not null,
  record_type text,
  record_id text,
  title text not null,
  description text,
  document_number text,
  revision text,
  version_number integer not null default 1 check (version_number > 0),
  is_current boolean not null default true,
  category text not null default 'Other',
  sub_category text,
  tags text[] not null default '{}',
  site_name text,
  task_id text references activities(id) on delete set null,
  wbs_code text,
  document_date date,
  effective_date date,
  expiry_date date,
  status text not null default 'COMPLETED' check (status in ('REQUESTED','IN_PROCESS','UNDER_REVIEW','APPROVED','COMPLETED','REJECTED','ARCHIVED')),
  source text not null default 'WEB' check (source in ('WEB','MODULE','WHATSAPP','API')),
  file_name text not null,
  file_extension text,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0 check (file_size >= 0),
  file_sha256 text,
  google_drive_file_id text not null,
  google_drive_folder_id text,
  google_drive_web_view_link text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text not null,
  uploaded_by_role text,
  uploaded_by_department text,
  uploaded_at timestamptz not null default now(),
  idempotency_key text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (document_group_id, version_number)
);

create table if not exists document_reference_history (
  id uuid primary key default gen_random_uuid(),
  document_reference_id uuid not null references document_references(id) on delete restrict,
  organization_id text not null references organizations(id) on delete restrict,
  project_id text not null references projects(id) on delete restrict,
  action text not null check (action in ('UPLOADED','UPDATED','REVISION_CREATED','LINKED','UNLINKED','STATUS_CHANGED','ARCHIVED','RESTORED','CANCELLED')),
  previous_value jsonb,
  next_value jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_document_references_project_recent on document_references(organization_id, project_id, uploaded_at desc);
create index if not exists idx_document_references_lookup on document_references(organization_id, project_id, module, record_type, record_id);
create index if not exists idx_document_references_search on document_references using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(file_name,'') || ' ' || coalesce(document_number,'') || ' ' || coalesce(description,'')));
create index if not exists idx_document_history_reference on document_reference_history(document_reference_id, created_at desc);

alter table document_references enable row level security;
alter table document_reference_history enable row level security;
-- Mutations and signed/open links are only served through /api/documents after
-- project authorization. No browser write policy is created.
