-- BuildTrack client-onboarding upgrade
-- Adds Director-controlled per-feature access, completion evidence fields and
-- restrictive RLS gates without weakening the existing role policies.

begin;

alter table project_users add column if not exists feature_permissions jsonb not null default '{}'::jsonb;

alter table handover_checklists add column if not exists responsible_party text;
alter table handover_checklists add column if not exists due_date date;
alter table handover_checklists add column if not exists remarks text;
alter table handover_checklists add column if not exists completion_remarks text;
alter table handover_checklists add column if not exists evidence_document_path text;
alter table handover_checklists add column if not exists evidence_document_url text;

alter table defects_liability add column if not exists location text;
alter table defects_liability add column if not exists severity text check (severity is null or severity in ('low','medium','high','critical'));
alter table defects_liability add column if not exists activity_id text;
alter table defects_liability add column if not exists reported_document_path text;
alter table defects_liability add column if not exists reported_document_url text;
alter table defects_liability add column if not exists closure_document_path text;
alter table defects_liability add column if not exists closure_document_url text;
alter table defects_liability add column if not exists closure_remarks text;
alter table defects_liability add column if not exists verified_by text;
alter table defects_liability add column if not exists verified_date date;

create or replace function private.has_feature_access(target_project_id text, feature_name text, requested_access text default 'read')
returns boolean language sql stable security definer set search_path = public
as $$
  select private.is_business_admin(target_project_id) or exists (
    select 1
    from project_users pu
    join projects p on p.id = pu.project_id
    where pu.project_id = target_project_id
      and pu.auth_user_id = (select auth.uid())
      and private.has_active_subscription(p.organization_id)
      and (
        pu.role = 'project_director'
        or not (coalesce(pu.feature_permissions, '{}'::jsonb) ? feature_name)
        or (requested_access = 'read' and pu.feature_permissions->>feature_name in ('read','write'))
        or (requested_access = 'write' and pu.feature_permissions->>feature_name = 'write')
      )
  );
$$;

grant execute on function private.has_feature_access(text,text,text) to authenticated;

create or replace function private.director_controls_feature_permissions()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' and coalesce(new.feature_permissions, '{}'::jsonb) = '{}'::jsonb then return new; end if;
  if tg_op = 'UPDATE' and new.feature_permissions is not distinct from old.feature_permissions then return new; end if;
  if not private.has_project_role(new.project_id, array['project_director']) then
    raise exception 'Only the Project Director can change feature permissions.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists buildtrack_director_feature_permissions on project_users;
create trigger buildtrack_director_feature_permissions
before insert or update of feature_permissions on project_users
for each row execute function private.director_controls_feature_permissions();

do $$
declare mapping record;
begin
  for mapping in select * from (values
    ('wbs_items','schedule'),('activities','schedule'),('activity_dependencies','schedule'),
    ('daily_reports','daily_reports'),('daily_work_items','daily_reports'),('material_logs','daily_reports'),
    ('design_packages','design'),('design_comments','design'),
    ('budget_heads','budget'),('subcontractor_packages','budget'),
    ('ipc_submissions','ipc'),('ipc_payments','ipc'),
    ('variations_and_claims','claims'),('risk_register','claims'),
    ('procurement_orders','procurement'),('store_items','procurement'),('inventory_events','procurement'),
    ('contract_obligations','obligations'),
    ('qa_qc_inspections','qaqc'),('safety_logs','safety'),
    ('daily_expenses','expenses'),
    ('daily_resource_usage','operations'),('employee_visits','employee_tracking'),('employee_profiles','employee_tracking'),
    ('document_register','documents'),('uploaded_documents','documents'),
    ('handover_checklists','handover'),('defects_liability','defects')
  ) as access_map(table_name, feature_name)
  loop
    execute format('drop policy if exists "feature access read gate" on %I', mapping.table_name);
    execute format('drop policy if exists "feature access insert gate" on %I', mapping.table_name);
    execute format('drop policy if exists "feature access update gate" on %I', mapping.table_name);
    execute format('drop policy if exists "feature access delete gate" on %I', mapping.table_name);
    execute format('create policy "feature access read gate" on %I as restrictive for select to authenticated using (private.has_feature_access(project_id,%L,''read''))', mapping.table_name, mapping.feature_name);
    execute format('create policy "feature access insert gate" on %I as restrictive for insert to authenticated with check (private.has_feature_access(project_id,%L,''write''))', mapping.table_name, mapping.feature_name);
    execute format('create policy "feature access update gate" on %I as restrictive for update to authenticated using (private.has_feature_access(project_id,%L,''write'')) with check (private.has_feature_access(project_id,%L,''write''))', mapping.table_name, mapping.feature_name, mapping.feature_name);
    execute format('create policy "feature access delete gate" on %I as restrictive for delete to authenticated using (private.has_feature_access(project_id,%L,''write''))', mapping.table_name, mapping.feature_name);
  end loop;
end $$;

drop policy if exists "feature evidence read gate" on site_photos;
drop policy if exists "feature evidence insert gate" on site_photos;
drop policy if exists "feature evidence update gate" on site_photos;
drop policy if exists "feature evidence delete gate" on site_photos;
create policy "feature evidence read gate" on site_photos as restrictive for select to authenticated using (private.has_feature_access(project_id,'view_evidence','read'));
create policy "feature evidence insert gate" on site_photos as restrictive for insert to authenticated with check (private.has_feature_access(project_id,'upload_evidence','write'));
create policy "feature evidence update gate" on site_photos as restrictive for update to authenticated using (private.has_feature_access(project_id,'view_evidence','write')) with check (private.has_feature_access(project_id,'view_evidence','write'));
create policy "feature evidence delete gate" on site_photos as restrictive for delete to authenticated using (private.has_feature_access(project_id,'view_evidence','write'));

drop policy if exists "feature project files read gate" on storage.objects;
drop policy if exists "feature project files insert gate" on storage.objects;
drop policy if exists "feature project files update gate" on storage.objects;
drop policy if exists "feature project files delete gate" on storage.objects;
create policy "feature project files read gate" on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'project-documents' or private.has_feature_access((storage.foldername(name))[1],'documents','read'));
create policy "feature project files insert gate" on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'project-documents' or private.has_feature_access((storage.foldername(name))[1],'upload_evidence','write'));
create policy "feature project files update gate" on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'project-documents' or private.has_feature_access((storage.foldername(name))[1],'upload_evidence','write'))
with check (bucket_id <> 'project-documents' or private.has_feature_access((storage.foldername(name))[1],'upload_evidence','write'));
create policy "feature project files delete gate" on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'project-documents' or private.has_feature_access((storage.foldername(name))[1],'upload_evidence','write'));

commit;

select 'BuildTrack client onboarding upgrade complete' as status;
