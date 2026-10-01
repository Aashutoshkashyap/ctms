-- CTMS B1: additive platform administration and subscription lifecycle controls.
-- Prerequisites: the established organizations, projects, project_users,
-- platform_admins, subscription_transactions, organization_notifications and
-- subscription_email_deliveries tables. No construction finance table is used.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

-- Versioned plan definitions keep pricing out of browser code. Existing
-- organizations retain their `plan` text as the stable plan code.
create table if not exists subscription_plan_versions (
  plan_code text not null,
  version integer not null default 1 check (version > 0),
  display_name text not null,
  description text,
  price numeric(15,2) not null default 0 check (price >= 0),
  currency text not null default 'NPR' check (char_length(currency) = 3),
  billing_period text not null default 'monthly' check (billing_period in ('monthly','quarterly','annual','custom')),
  effective_from date not null default current_date,
  effective_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, version),
  check (effective_until is null or effective_until >= effective_from)
);

alter table organizations add column if not exists plan_version integer not null default 1;

insert into subscription_plan_versions (plan_code, version, display_name, description, price, currency, billing_period, effective_from, active)
values
  ('trial', 1, 'Free Trial', 'Initial BuildTrack evaluation plan.', 0, 'NPR', 'monthly', current_date, true),
  ('starter', 1, 'Starter', 'BuildTrack starter plan.', 0, 'NPR', 'monthly', current_date, true),
  ('project_pro', 1, 'Project Pro', 'BuildTrack project controls plan.', 0, 'NPR', 'monthly', current_date, true),
  ('enterprise', 1, 'Enterprise', 'BuildTrack enterprise plan.', 0, 'NPR', 'monthly', current_date, true)
on conflict (plan_code, version) do nothing;

insert into subscription_plan_versions (plan_code, version, display_name, description, price, currency, billing_period, effective_from, active)
select distinct
  coalesce(nullif(trim(plan), ''), 'trial'),
  1,
  initcap(replace(coalesce(nullif(trim(plan), ''), 'trial'), '_', ' ')),
  'Migrated existing BuildTrack plan definition.',
  0,
  'NPR',
  'monthly',
  current_date,
  true
from organizations
on conflict (plan_code, version) do nothing;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_plan_version_fk') then
    alter table organizations
      add constraint organizations_plan_version_fk
      foreign key (plan, plan_version)
      references subscription_plan_versions(plan_code, version)
      not valid;
  end if;
end $$;

-- These are B2B product entitlements, deliberately separate from staff
-- feature_permissions and project authorization. B1 does not change UI access.
create table if not exists subscription_plan_module_entitlements (
  plan_code text not null,
  plan_version integer not null,
  module_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, plan_version, module_key),
  foreign key (plan_code, plan_version)
    references subscription_plan_versions(plan_code, version) on delete cascade
);

create table if not exists organization_module_entitlements (
  organization_id text not null references organizations(id) on delete cascade,
  module_key text not null,
  enabled boolean not null,
  source text not null default 'platform_override' check (source in ('platform_override','migration')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, module_key)
);

insert into subscription_plan_module_entitlements (plan_code, plan_version, module_key, enabled)
select p.plan_code, p.version, module_key, true
from subscription_plan_versions p
cross join unnest(array[
  'home','projects','people','work','fleet','inventory','purchases',
  'commercial','quality_safety','document_vault','reports','settings'
]) as module_key
on conflict (plan_code, plan_version, module_key) do nothing;

create or replace function private.has_organization_module_entitlement(target_organization_id text, requested_module_key text)
returns boolean language sql stable security definer set search_path = public, private
as $$
  select coalesce(
    (select ome.enabled from organization_module_entitlements ome
      where ome.organization_id = target_organization_id and ome.module_key = requested_module_key),
    (select spme.enabled
      from organizations o
      join subscription_plan_module_entitlements spme
        on spme.plan_code = o.plan and spme.plan_version = o.plan_version
      where o.id = target_organization_id and spme.module_key = requested_module_key),
    false
  );
$$;

grant execute on function private.has_organization_module_entitlement(text,text) to authenticated;

-- The only authoritative verification transition. The server route calls this
-- through the service role after explicit platform-admin authorization.
create or replace function private.verify_subscription_payment(
  target_transaction_id text,
  verifier_user_id uuid,
  requested_access_until date
)
returns jsonb language plpgsql security definer set search_path = public, private
as $$
declare
  transaction_row subscription_transactions%rowtype;
  organization_row organizations%rowtype;
  effective_access_until date;
  notice_id text;
  delivery_id text;
begin
  if requested_access_until is null or requested_access_until < current_date then
    raise exception 'A current or future subscription access date is required.' using errcode = '22007';
  end if;
  if not exists (select 1 from platform_admins where auth_user_id = verifier_user_id) then
    raise exception 'Platform Superadmin access is required.' using errcode = '42501';
  end if;

  select * into transaction_row from subscription_transactions
    where id = target_transaction_id for update;
  if not found then
    raise exception 'Subscription transaction was not found.' using errcode = 'P0002';
  end if;
  if transaction_row.status = 'verified' then
    return jsonb_build_object('result', 'already_verified', 'transaction_id', transaction_row.id,
      'organization_id', transaction_row.organization_id, 'access_until', transaction_row.period_end);
  end if;
  if transaction_row.status <> 'pending' then
    raise exception 'Only pending subscription payments can be verified.' using errcode = '23514';
  end if;

  select * into organization_row from organizations where id = transaction_row.organization_id for update;
  if not found then
    raise exception 'Subscription organization was not found.' using errcode = '23503';
  end if;
  effective_access_until := greatest(coalesce(organization_row.access_until, requested_access_until), requested_access_until);

  update subscription_transactions
  set status = 'verified', verified_by = verifier_user_id, verified_at = now()
  where id = transaction_row.id and status = 'pending';
  if not found then
    raise exception 'Subscription payment was already processed.' using errcode = '40001';
  end if;

  update organizations
  set subscription_status = 'active', access_until = effective_access_until, updated_at = now()
  where id = organization_row.id;
  update projects
  set access_until = effective_access_until
  where organization_id = organization_row.id;

  notice_id := 'payment-verified-' || transaction_row.id;
  insert into organization_notifications (id, organization_id, kind, title, message, severity, alert_for_date, visible_until)
  values (
    notice_id, organization_row.id, 'payment_verified', 'Subscription payment verified',
    format('Payment %s was verified and business access was extended through %s.', transaction_row.reference, effective_access_until),
    'success', effective_access_until, effective_access_until
  ) on conflict (id) do update
    set title = excluded.title, message = excluded.message, severity = excluded.severity, visible_until = excluded.visible_until;

  if organization_row.contact_email is not null and organization_row.contact_email ~ '^\\S+@\\S+\\.\\S+$' then
    delivery_id := 'payment-receipt-' || transaction_row.id;
    insert into subscription_email_deliveries (id, organization_id, notification_id, recipient, subject, scheduled_for, days_before, status)
    values (delivery_id, organization_row.id, notice_id, lower(organization_row.contact_email),
      'BuildTrack subscription payment verified', current_date, null, 'queued')
    on conflict (id) do nothing;
  end if;

  return jsonb_build_object('result', 'verified', 'transaction_id', transaction_row.id,
    'organization_id', organization_row.id, 'access_until', effective_access_until,
    'email_delivery_id', delivery_id);
end;
$$;

revoke all on function private.verify_subscription_payment(text,uuid,date) from public, anon, authenticated;
grant execute on function private.verify_subscription_payment(text,uuid,date) to service_role;

-- Existing quota rules are retained, but now also protect project reactivation
-- and reassignment. No project or member record is removed.
create or replace function private.enforce_project_quota()
returns trigger language plpgsql security definer set search_path = public, private
as $$
declare
  allowed_projects integer;
  active_projects integer;
begin
  if coalesce(new.status, 'active') = 'archived' then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.status, 'active') <> 'archived' and old.organization_id = new.organization_id then return new; end if;
  if not private.has_active_subscription(new.organization_id) then
    raise exception 'Business subscription is inactive or expired.' using errcode = '42501';
  end if;
  select project_limit into allowed_projects from organizations where id = new.organization_id;
  if allowed_projects is null then raise exception 'Business tenant is missing.' using errcode = '23503'; end if;
  select count(*) into active_projects from projects where organization_id = new.organization_id and status <> 'archived';
  if active_projects >= allowed_projects then
    raise exception 'Active project limit reached for this subscription.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists buildtrack_project_quota on projects;
create trigger buildtrack_project_quota before insert or update of status, organization_id on projects
for each row execute function private.enforce_project_quota();

create or replace function private.enforce_tenant_seat_quota()
returns trigger language plpgsql security definer set search_path = public, private
as $$
declare
  target_organization_id text;
  allowed_seats integer;
  used_seats integer;
begin
  if new.auth_user_id is null then raise exception 'A verified authentication user is required.' using errcode = '23502'; end if;
  select organization_id into target_organization_id from projects where id = new.project_id;
  if target_organization_id is null then raise exception 'Project business tenant is missing.' using errcode = '23503'; end if;
  if not private.has_active_subscription(target_organization_id) then raise exception 'Business subscription is inactive or expired.' using errcode = '42501'; end if;
  if exists (select 1 from project_users existing join projects existing_project on existing_project.id = existing.project_id
    where existing.auth_user_id = new.auth_user_id and existing_project.organization_id is distinct from target_organization_id
      and (tg_op = 'INSERT' or existing.id <> old.id)) then
    raise exception 'This user already belongs to another business tenant.' using errcode = '23514';
  end if;
  if not exists (select 1 from project_users existing join projects existing_project on existing_project.id = existing.project_id
    where existing.auth_user_id = new.auth_user_id and existing_project.organization_id = target_organization_id
      and (tg_op = 'INSERT' or existing.id <> old.id)) then
    select seat_limit into allowed_seats from organizations where id = target_organization_id;
    select count(distinct existing.auth_user_id) into used_seats from project_users existing
      join projects existing_project on existing_project.id = existing.project_id
      where existing_project.organization_id = target_organization_id and existing.auth_user_id is not null
        and (tg_op = 'INSERT' or existing.id <> old.id);
    if used_seats >= allowed_seats then raise exception 'Employee seat limit reached for this subscription.' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists buildtrack_tenant_seat_quota on project_users;
create trigger buildtrack_tenant_seat_quota before insert or update of project_id, auth_user_id on project_users
for each row execute function private.enforce_tenant_seat_quota();

commit;
