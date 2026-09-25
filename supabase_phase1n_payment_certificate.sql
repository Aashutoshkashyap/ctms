-- Phase 1N additive payment-certificate foundation.
-- A payment certificate is downstream of a certified IPC valuation; it is not a payment execution record.
begin;

create table if not exists payment_certificates (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  valuation_period_id text not null references ipc_valuation_periods(id) on delete restrict,
  certificate_number text not null,
  certificate_date date not null,
  gross_certified_amount numeric(15,2) not null check (gross_certified_amount >= 0),
  total_deductions numeric(15,2) not null default 0 check (total_deductions >= 0),
  net_certified_amount numeric(15,2) not null check (net_certified_amount >= 0),
  status text not null default 'draft' check (status in ('draft','submitted','review','approved','certified','rejected')),
  valuation_snapshot jsonb not null default '{}'::jsonb,
  deduction_snapshot jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  certified_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  certified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (valuation_period_id),
  unique (project_id, certificate_number),
  check (net_certified_amount = gross_certified_amount - total_deductions)
);

create table if not exists payment_certificate_deductions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  payment_certificate_id text not null references payment_certificates(id) on delete cascade,
  deduction_kind text not null check (deduction_kind in ('retention','advance_recovery','other_contract_deduction')),
  amount numeric(15,2) not null check (amount >= 0),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_certificates_project_status on payment_certificates(organization_id, project_id, status, certificate_date desc);
create index if not exists idx_payment_certificate_deductions_certificate on payment_certificate_deductions(organization_id, payment_certificate_id);

create or replace function private.phase1n_guard_payment_certificate() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (
    select 1 from ipc_valuation_periods p
    where p.id = new.valuation_period_id
      and p.organization_id = new.organization_id
      and p.project_id = new.project_id
      and p.status = 'certified'
  ) then
    raise exception 'Payment certificate requires a certified same-project IPC valuation' using errcode = '42501';
  end if;
  if new.net_certified_amount <> new.gross_certified_amount - new.total_deductions then
    raise exception 'Payment certificate net amount must equal gross less deductions' using errcode = '22003';
  end if;
  if old is not null and old.status = 'certified' and (
    new.valuation_period_id is distinct from old.valuation_period_id
    or new.gross_certified_amount is distinct from old.gross_certified_amount
    or new.total_deductions is distinct from old.total_deductions
    or new.net_certified_amount is distinct from old.net_certified_amount
    or new.valuation_snapshot is distinct from old.valuation_snapshot
    or new.deduction_snapshot is distinct from old.deduction_snapshot
    or new.status is distinct from old.status
  ) then
    raise exception 'Certified payment certificates are financially immutable' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.phase1n_guard_payment_certificate_deduction() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from payment_certificates pc where pc.id = old.payment_certificate_id and pc.organization_id = old.organization_id and pc.status = 'certified') then
      raise exception 'Certified payment certificate deductions are immutable' using errcode = '42501';
    end if;
    return old;
  end if;
  if not exists (
    select 1 from payment_certificates pc
    where pc.id = new.payment_certificate_id
      and pc.organization_id = new.organization_id
      and pc.status <> 'certified'
  ) then
    raise exception 'Deductions require a mutable same-tenant payment certificate' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists phase1n_payment_certificate_guard on payment_certificates;
create trigger phase1n_payment_certificate_guard
before insert or update on payment_certificates
for each row execute function private.phase1n_guard_payment_certificate();

drop trigger if exists phase1n_payment_certificate_deduction_guard on payment_certificate_deductions;
create trigger phase1n_payment_certificate_deduction_guard
before insert or update or delete on payment_certificate_deductions
for each row execute function private.phase1n_guard_payment_certificate_deduction();

alter table payment_certificates enable row level security;
alter table payment_certificate_deductions enable row level security;

comment on table payment_certificates is 'Phase 1N financial authorization derived from certified progress valuation. It is not a payment, bank instruction, or ipc_submissions replacement.';
comment on table payment_certificate_deductions is 'Explicit certificate deductions only; no tax, retention percentage, or payment calculation is implied.';
commit;
