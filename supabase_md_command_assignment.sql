-- MD Command & Assignment: additive department context and authoritative
-- responsibility reference on existing purchase orders. Neither column grants
-- BuildTrack access; server-side authorization remains authoritative.
begin;

alter table project_person_assignments
  add column if not exists department_key text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'project_person_assignments_department_key_check' and conrelid = 'public.project_person_assignments'::regclass) then
    alter table project_person_assignments
      add constraint project_person_assignments_department_key_check
      check (department_key is null or department_key in ('site', 'procurement', 'stores', 'finance', 'hr', 'equipment', 'commercial', 'documents', 'qaqc', 'safety')) not valid;
  end if;
end $$;

create index if not exists idx_project_person_assignments_department
  on project_person_assignments(organization_id, project_id, department_key, start_date desc);

alter table procurement_orders
  add column if not exists responsible_person_id uuid references auth.users(id) on delete set null;

create index if not exists idx_procurement_orders_project_responsible
  on procurement_orders(project_id, responsible_person_id)
  where responsible_person_id is not null;

alter table project_person_assignments enable row level security;

commit;
