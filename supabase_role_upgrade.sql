-- BuildTrack role/evidence/operations upgrade for an existing Supabase project.
-- Run once after the original supabase_schema.sql has already been applied.

alter table site_photos add column if not exists storage_path text;
alter table site_photos add column if not exists uploaded_by text;
alter table site_photos add column if not exists evidence_type text default 'progress';
alter table site_photos alter column url set default '';

create table if not exists daily_resource_usage (
  id text primary key, project_id text references projects(id) on delete cascade,
  usage_date date not null, activity_id text references activities(id) on delete set null,
  location text, manpower_skilled integer default 0, manpower_unskilled integer default 0,
  equipment_name text, equipment_hours numeric(10,2) default 0, fuel_litres numeric(12,2) default 0,
  work_quantity numeric(14,2) default 0, work_unit text,
  excavator_start_meter numeric(14,2) default 0, excavator_end_meter numeric(14,2) default 0,
  excavator_output numeric(14,2) default 0, downtime_hours numeric(10,2) default 0,
  remarks text, recorded_by text, created_at timestamptz default now()
);

create table if not exists employee_visits (
  id text primary key, project_id text references projects(id) on delete cascade,
  visit_date date not null, employee_name text not null, employee_role text,
  site_location text not null, check_in time, check_out time, purpose text,
  vehicle_number text, status text default 'planned' check(status in ('planned','on_site','completed','cancelled')),
  recorded_by text, created_at timestamptz default now()
);

create or replace function private.has_project_role(target_project_id text, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from project_users pu
    where pu.project_id=target_project_id and pu.auth_user_id=(select auth.uid())
      and pu.role = any(allowed_roles)
  );
$$;
grant execute on function private.has_project_role(text,text[]) to authenticated;

alter table daily_resource_usage enable row level security;
alter table employee_visits enable row level security;

drop policy if exists "members read resource usage" on daily_resource_usage;
drop policy if exists "operations roles manage resource usage" on daily_resource_usage;
create policy "members read resource usage" on daily_resource_usage for select to authenticated using (private.is_project_member(project_id));
create policy "operations roles manage resource usage" on daily_resource_usage for all to authenticated
using (private.has_project_role(project_id,array['project_director','project_manager','planning_engineer','site_engineer','store_officer','subcontractor']))
with check (private.has_project_role(project_id,array['project_director','project_manager','planning_engineer','site_engineer','store_officer','subcontractor']));

drop policy if exists "tracking roles read visits" on employee_visits;
drop policy if exists "tracking roles manage visits" on employee_visits;
create policy "tracking roles read visits" on employee_visits for select to authenticated
using (private.has_project_role(project_id,array['project_director','project_manager','site_engineer','safety_officer']));
create policy "tracking roles manage visits" on employee_visits for all to authenticated
using (private.has_project_role(project_id,array['project_director','project_manager','site_engineer','safety_officer']))
with check (private.has_project_role(project_id,array['project_director','project_manager','site_engineer','safety_officer']));

drop policy if exists "members read site_photos" on site_photos;
drop policy if exists "editors manage site_photos" on site_photos;
drop policy if exists "director reads evidence records" on site_photos;
drop policy if exists "field roles submit evidence records" on site_photos;
drop policy if exists "director manages evidence records" on site_photos;
drop policy if exists "director deletes evidence records" on site_photos;
create policy "director reads evidence records" on site_photos for select to authenticated
using (private.has_project_role(project_id,array['project_director']));
create policy "field roles submit evidence records" on site_photos for insert to authenticated
with check (private.has_project_role(project_id,array['project_director','project_manager','site_engineer','design_coordinator','qa_qc_engineer','safety_officer','subcontractor']));
create policy "director manages evidence records" on site_photos for update to authenticated
using (private.has_project_role(project_id,array['project_director']))
with check (private.has_project_role(project_id,array['project_director']));
create policy "director deletes evidence records" on site_photos for delete to authenticated
using (private.has_project_role(project_id,array['project_director']));

update storage.buckets set public=false where id='site-photos';
drop policy if exists "public read site photos" on storage.objects;
drop policy if exists "members update project photos" on storage.objects;
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

grant select,insert,update,delete on daily_resource_usage,employee_visits to authenticated;
