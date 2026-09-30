-- Phase 3A read-only preflight. Run before supabase_phase3a_identity.sql.
-- auth.users.id / project_users.auth_user_id is the stable BuildTrack Person ID.

select project_id, auth_user_id, count(*) as duplicate_assignment_count
from project_users
where auth_user_id is not null
group by project_id, auth_user_id
having count(*) > 1;

select lower(email) as email, count(distinct auth_user_id) as auth_identity_count
from project_users
where auth_user_id is not null
group by lower(email)
having count(distinct auth_user_id) > 1;

select pu.auth_user_id, array_agg(distinct p.organization_id) as organization_ids
from project_users pu
join projects p on p.id = pu.project_id
where pu.auth_user_id is not null
group by pu.auth_user_id
having count(distinct p.organization_id) > 1;

select pu.id, pu.project_id, pu.email
from project_users pu
left join auth.users u on u.id = pu.auth_user_id
where pu.auth_user_id is null or u.id is null or lower(pu.email) <> lower(u.email);

select constraint_name
from information_schema.table_constraints
where table_schema = 'public' and table_name = 'project_users' and constraint_type = 'UNIQUE';
