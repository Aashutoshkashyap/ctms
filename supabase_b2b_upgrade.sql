-- BuildTrack D&B B2B/employee/document upgrade.
-- Run this in Supabase SQL Editor after the original supabase_schema.sql.

create extension if not exists pgcrypto;

alter table projects add column if not exists organization_id text;
alter table projects add column if not exists organization_name text;
alter table projects add column if not exists status text default 'active';
alter table projects add column if not exists access_until date;

create table if not exists organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  contact_email text,
  plan text default 'trial',
  subscription_status text default 'trial',
  access_until date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz default now()
);

create table if not exists employee_profiles (
  id text primary key,
  project_id text references projects(id) on delete cascade,
  employee_id text not null,
  name text not null,
  email text,
  phone text,
  role text,
  trade text,
  site_location text,
  daily_rate numeric(15,2) default 0,
  status text default 'active' check(status in ('active','inactive')),
  assigned_to text,
  created_at timestamptz default now(),
  unique(project_id, employee_id)
);

alter table daily_expenses add column if not exists activity_id text references activities(id) on delete set null;
alter table daily_expenses add column if not exists employee_id text;
alter table daily_expenses add column if not exists employee_name text;
alter table daily_expenses add column if not exists payment_slip_url text;
alter table daily_expenses add column if not exists payment_slip_path text;

alter table daily_work_items add column if not exists rework_quantity numeric(14,2) default 0;

alter table daily_resource_usage add column if not exists crew_name text;
alter table daily_resource_usage add column if not exists equipment_type text default 'other';
alter table daily_resource_usage add column if not exists machinery_day numeric(10,2) default 0;

alter table procurement_orders add column if not exists order_date date;
alter table procurement_orders add column if not exists delivery_date date;
alter table procurement_orders add column if not exists remarks text;

alter table store_items add column if not exists vendor text;
alter table store_items add column if not exists status text default 'available';

create table if not exists inventory_events (
  id text primary key,
  project_id text references projects(id) on delete cascade,
  item_id text,
  event_date date not null,
  event_type text not null check(event_type in ('received','issued','adjusted','moved')),
  quantity numeric(14,2) default 0,
  vendor text,
  location text,
  remarks text,
  recorded_by text,
  created_at timestamptz default now()
);

alter table variations_and_claims add column if not exists variation_item text;
alter table variations_and_claims add column if not exists quantity numeric(14,2) default 0;
alter table variations_and_claims add column if not exists previous_rate numeric(15,2) default 0;
alter table variations_and_claims add column if not exists new_rate numeric(15,2) default 0;
alter table variations_and_claims add column if not exists rate_difference numeric(15,2) default 0;

alter table qa_qc_inspections add column if not exists ncr_code text;
alter table qa_qc_inspections add column if not exists sample_collection_date date;
alter table qa_qc_inspections add column if not exists tested_date date;

create table if not exists uploaded_documents (
  id text primary key,
  project_id text references projects(id) on delete cascade,
  name text not null,
  category text default 'other',
  storage_path text,
  url text,
  linked_record_id text,
  uploaded_by text,
  uploaded_at timestamptz default now(),
  remarks text
);

create table if not exists google_connections (
  id text primary key default gen_random_uuid()::text,
  organization_id text references organizations(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  connected_by uuid references auth.users(id) on delete set null default auth.uid(),
  google_email text,
  root_folder_id text,
  project_folder_id text,
  daily_folder_id text,
  expense_folder_id text,
  employee_folder_id text,
  document_folder_id text,
  photo_folder_id text,
  sheet_id text,
  encrypted_refresh_token text,
  status text default 'connected' check(status in ('connected','revoked','error')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id)
);

create table if not exists app_notifications (
  id text primary key,
  project_id text references projects(id) on delete cascade,
  actor text,
  action text not null,
  module text not null,
  detail text,
  created_at timestamptz default now(),
  read boolean default false
);

create index if not exists idx_employee_profiles_project on employee_profiles(project_id);
create index if not exists idx_uploaded_documents_project on uploaded_documents(project_id);
create index if not exists idx_google_connections_project on google_connections(project_id);
create index if not exists idx_notifications_project on app_notifications(project_id, created_at desc);
create index if not exists idx_inventory_events_project on inventory_events(project_id, event_date desc);

alter table organizations enable row level security;
drop policy if exists "super admins manage organizations" on organizations;
create policy "super admins manage organizations" on organizations for all to authenticated
using (exists (select 1 from project_users pu where pu.auth_user_id = auth.uid() and pu.role = 'super_admin'))
with check (exists (select 1 from project_users pu where pu.auth_user_id = auth.uid() and pu.role = 'super_admin'));

do $$
declare table_name text;
begin
  foreach table_name in array array['employee_profiles','uploaded_documents','inventory_events','app_notifications','google_connections'] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('drop policy if exists "members read %1$s" on %1$I', table_name);
    execute format('drop policy if exists "editors manage %1$s" on %1$I', table_name);
    execute format('create policy "members read %1$s" on %1$I for select to authenticated using (private.is_project_member(project_id))', table_name);
    execute format('create policy "editors manage %1$s" on %1$I for all to authenticated using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id))', table_name);
  end loop;
end $$;

grant select,insert,update,delete on all tables in schema public to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('project-documents','project-documents',false,20971520,null)
on conflict (id) do update set public=false,file_size_limit=20971520,allowed_mime_types=null;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('site-photos','site-photos',false,6291456,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=6291456,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "authenticated upload project photos" on storage.objects;
drop policy if exists "director reads project photos" on storage.objects;
drop policy if exists "director updates project photos" on storage.objects;
drop policy if exists "director deletes project photos" on storage.objects;
create policy "authenticated upload project photos" on storage.objects for insert to authenticated
with check (
  bucket_id='site-photos' and
  private.has_project_role((storage.foldername(name))[1],array['project_director','project_manager','site_engineer','design_coordinator','qa_qc_engineer','safety_officer','subcontractor'])
);
create policy "director reads project photos" on storage.objects for select to authenticated
using (bucket_id='site-photos' and private.has_project_role((storage.foldername(name))[1],array['project_director']));
create policy "director updates project photos" on storage.objects for update to authenticated
using (bucket_id='site-photos' and private.has_project_role((storage.foldername(name))[1],array['project_director']));
create policy "director deletes project photos" on storage.objects for delete to authenticated
using (bucket_id='site-photos' and private.has_project_role((storage.foldername(name))[1],array['project_director']));

drop policy if exists "members upload project documents" on storage.objects;
drop policy if exists "members read project documents" on storage.objects;
drop policy if exists "editors update project documents" on storage.objects;
drop policy if exists "editors delete project documents" on storage.objects;
create policy "members upload project documents" on storage.objects for insert to authenticated
with check (bucket_id='project-documents' and private.can_edit_project((storage.foldername(name))[1]));
create policy "members read project documents" on storage.objects for select to authenticated
using (bucket_id='project-documents' and private.is_project_member((storage.foldername(name))[1]));
create policy "editors update project documents" on storage.objects for update to authenticated
using (bucket_id='project-documents' and private.can_edit_project((storage.foldername(name))[1]));
create policy "editors delete project documents" on storage.objects for delete to authenticated
using (bucket_id='project-documents' and private.can_edit_project((storage.foldername(name))[1]));

select
  'b2b upgrade ready' as status,
  exists(select 1 from storage.buckets where id='site-photos') as site_photos_bucket,
  exists(select 1 from storage.buckets where id='project-documents') as project_documents_bucket;
