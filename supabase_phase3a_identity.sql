-- Phase 3A: stable person identity and project-assignment integrity.
-- Run only after the Phase 3A preflight returns no data-quality exceptions.
-- No person table is created: auth.users.id is reused through project_users.auth_user_id.

begin;

do $$
begin
  if exists (
    select 1 from project_users
    where auth_user_id is not null
    group by project_id, auth_user_id
    having count(*) > 1
  ) then
    raise exception 'Phase 3A cannot add assignment uniqueness while duplicate project/auth-user rows exist. Run the preflight and repair explicitly.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_users'::regclass
      and conname = 'project_users_project_auth_user_unique'
  ) then
    alter table project_users
      add constraint project_users_project_auth_user_unique unique (project_id, auth_user_id);
  end if;
end $$;

create index if not exists idx_project_users_auth_project_assignment
  on project_users(auth_user_id, project_id);

comment on column project_users.auth_user_id is
  'Stable BuildTrack Person ID. This references auth.users.id and does not change across project assignments.';
comment on table project_users is
  'Project-specific person assignment. Role and feature_permissions are scoped to this project; removing a row removes only this assignment.';

commit;
