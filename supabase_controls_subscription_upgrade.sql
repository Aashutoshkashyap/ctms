-- BuildTrack controls, BS-calendar support metadata, IPC payment history,
-- compliance evidence, and subscription renewal automation.
-- Idempotent: safe to run after supabase_final_product.sql.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

-- --------------------------------------------------------------------------
-- Project control evidence and auditable IPC payment history
-- --------------------------------------------------------------------------
alter table ipc_submissions add column if not exists billing_period_start date;
alter table ipc_submissions add column if not exists billing_period_end date;
alter table ipc_submissions add column if not exists invoice_reference text;
alter table ipc_submissions add column if not exists claim_remarks text;
alter table ipc_submissions add column if not exists claim_document_path text;
alter table ipc_submissions add column if not exists claim_document_url text;
alter table ipc_submissions add column if not exists certificate_reference text;
alter table ipc_submissions add column if not exists certified_by text;
alter table ipc_submissions add column if not exists certification_remarks text;
alter table ipc_submissions add column if not exists certificate_document_path text;
alter table ipc_submissions add column if not exists certificate_document_url text;

create table if not exists ipc_payments (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  ipc_id text not null references ipc_submissions(id) on delete cascade,
  payment_date date not null,
  amount numeric(15,2) not null check (amount > 0),
  tax_deducted numeric(15,2) not null default 0 check (tax_deducted >= 0),
  payment_method text not null default 'bank_transfer' check (payment_method in ('bank_transfer','cheque','cash','other')),
  bank_reference text not null,
  paid_by text,
  received_in_account text,
  remarks text,
  proof_storage_path text,
  proof_url text,
  recorded_by text,
  recorded_by_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ipc_payments_project on ipc_payments(project_id, payment_date desc);
create index if not exists idx_ipc_payments_ipc on ipc_payments(ipc_id, payment_date desc);

alter table document_register add column if not exists period_start date;
alter table document_register add column if not exists period_end date;
alter table document_register add column if not exists due_date date;
alter table document_register add column if not exists expiry_date date;
alter table document_register add column if not exists issued_by text;
alter table document_register add column if not exists responsible_person text;
alter table document_register add column if not exists linked_record_id text;
alter table document_register add column if not exists storage_path text;
alter table document_register add column if not exists url text;
alter table document_register add column if not exists uploaded_by text;
alter table document_register add column if not exists uploaded_by_email text;

alter table contract_obligations add column if not exists complied_date date;
alter table contract_obligations add column if not exists compliance_remarks text;
alter table contract_obligations add column if not exists evidence_document_path text;
alter table contract_obligations add column if not exists evidence_document_url text;

alter table qa_qc_inspections add column if not exists report_storage_path text;
alter table qa_qc_inspections add column if not exists report_url text;
alter table safety_logs add column if not exists compliance_report_path text;
alter table safety_logs add column if not exists compliance_report_url text;

-- --------------------------------------------------------------------------
-- Platform subscription transactions, notifications, email delivery history
-- --------------------------------------------------------------------------
alter table subscription_transactions add column if not exists payment_method text;
alter table subscription_transactions add column if not exists notes text;
alter table subscription_transactions add column if not exists proof_storage_path text;
alter table subscription_transactions add column if not exists proof_name text;

create table if not exists organization_notifications (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  kind text not null default 'subscription',
  title text not null,
  message text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical','success')),
  alert_for_date date not null,
  days_before integer,
  visible_until date,
  created_at timestamptz not null default now(),
  unique (organization_id, kind, alert_for_date, days_before)
);
create index if not exists idx_org_notifications_recent on organization_notifications(organization_id, created_at desc);

create table if not exists subscription_email_deliveries (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  notification_id text references organization_notifications(id) on delete cascade,
  recipient text not null,
  subject text not null,
  scheduled_for date not null,
  days_before integer,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  provider text,
  provider_message_id text,
  error_message text,
  attempt_count integer not null default 0,
  sent_at timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, recipient, scheduled_for, days_before)
);
create index if not exists idx_subscription_email_queue on subscription_email_deliveries(status, scheduled_for);

create table if not exists platform_email_connections (
  id text primary key default 'platform-gmail',
  connected_by uuid references auth.users(id) on delete set null,
  google_email text,
  encrypted_refresh_token text,
  status text not null default 'connected' check (status in ('connected','revoked','error')),
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The payment aggregation remains correct even with multiple partial payments.
create or replace function private.refresh_ipc_payment_total(target_ipc_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  total_paid numeric(15,2);
  net_certified numeric(15,2);
begin
  select coalesce(sum(amount), 0) into total_paid from ipc_payments where ipc_id = target_ipc_id;
  select greatest(coalesce(certified_amount,0) - coalesce(retention_deducted,0) - coalesce(advance_recovered,0), 0)
    into net_certified from ipc_submissions where id = target_ipc_id;
  update ipc_submissions
  set paid_amount = total_paid,
      paid_date = (select max(payment_date) from ipc_payments where ipc_id = target_ipc_id),
      status = case
        when total_paid <= 0 then case when certified_amount > 0 then 'certified' else 'pending' end
        when total_paid >= net_certified then 'paid'
        else 'partially_paid'
      end
  where id = target_ipc_id;
end;
$$;

create or replace function private.sync_ipc_payment_total()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform private.refresh_ipc_payment_total(coalesce(new.ipc_id, old.ipc_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists buildtrack_ipc_payment_total on ipc_payments;
create trigger buildtrack_ipc_payment_total
after insert or update or delete on ipc_payments
for each row execute function private.sync_ipc_payment_total();

-- --------------------------------------------------------------------------
-- RLS. Platform email and billing-delivery internals remain server-only.
-- --------------------------------------------------------------------------
alter table ipc_payments enable row level security;
alter table organization_notifications enable row level security;
alter table subscription_email_deliveries enable row level security;
alter table platform_email_connections enable row level security;

drop policy if exists "finance read ipc payments" on ipc_payments;
drop policy if exists "finance manage ipc payments" on ipc_payments;
create policy "finance read ipc payments" on ipc_payments for select to authenticated
using (private.has_project_role(project_id,array['project_director','project_manager','qs_billing_engineer','accountant']));
create policy "finance manage ipc payments" on ipc_payments for all to authenticated
using (private.has_project_role(project_id,array['project_director','qs_billing_engineer','accountant']))
with check (private.has_project_role(project_id,array['project_director','qs_billing_engineer','accountant']));

drop policy if exists "project manager submits ipc claims" on ipc_submissions;
create policy "project manager submits ipc claims" on ipc_submissions for insert to authenticated
with check (private.has_project_role(project_id,array['project_director','project_manager','qs_billing_engineer']));

drop policy if exists "discipline roles register documents" on document_register;
drop policy if exists "discipline roles update own documents" on document_register;
create policy "discipline roles register documents" on document_register for insert to authenticated
with check (
  private.is_business_admin(project_id)
  or private.has_project_role(project_id,array['project_director','project_manager','planning_engineer','site_engineer','design_coordinator','qs_billing_engineer','qa_qc_engineer','safety_officer','store_officer','accountant'])
);
create policy "discipline roles update own documents" on document_register for update to authenticated
using (
  lower(uploaded_by_email) = lower(auth.jwt()->>'email')
  and private.has_project_role(project_id,array['planning_engineer','site_engineer','design_coordinator','qs_billing_engineer','qa_qc_engineer','safety_officer','store_officer','accountant'])
)
with check (
  lower(uploaded_by_email) = lower(auth.jwt()->>'email')
  and private.has_project_role(project_id,array['planning_engineer','site_engineer','design_coordinator','qs_billing_engineer','qa_qc_engineer','safety_officer','store_officer','accountant'])
);

-- Tenant notifications are returned through a server route after user and
-- tenant membership verification. No browser policy exposes platform queues,
-- delivery logs, or encrypted Gmail refresh tokens.
grant select,insert,update,delete on ipc_payments to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('subscription-payments','subscription-payments',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'];

commit;
