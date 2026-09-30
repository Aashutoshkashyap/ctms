-- Phase 1K additive payroll foundation. Apply manually only after preflight.
begin;
create table if not exists employee_payroll_configurations (
 id text primary key default gen_random_uuid()::text, organization_id text not null references organizations(id) on delete cascade, employee_id text not null references employee_records(id) on delete cascade,
 salary_basis text not null check (salary_basis in ('monthly')), base_salary numeric(14,2) not null check (base_salary >= 0), effective_from date not null, active boolean not null default true,
 leave_adjustment_enabled boolean not null default false, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(employee_id,effective_from)
);
create table if not exists payroll_periods (
 id text primary key default gen_random_uuid()::text, organization_id text not null references organizations(id) on delete cascade, name text not null, start_date date not null, end_date date not null,
 status text not null default 'draft' check(status in ('draft','open','review','approved','finalized')), created_by uuid references auth.users(id) on delete set null, approved_by uuid references auth.users(id) on delete set null, approved_at timestamptz, finalized_by uuid references auth.users(id) on delete set null, finalized_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,name), check(end_date >= start_date)
);
create table if not exists payroll_inputs (
 id text primary key default gen_random_uuid()::text, organization_id text not null references organizations(id) on delete cascade, payroll_period_id text not null references payroll_periods(id) on delete cascade, employee_id text not null references employee_records(id) on delete cascade,
 input_kind text not null check(input_kind in ('allowance','overtime','other_earning','tax','other_deduction','leave_adjustment')), amount numeric(14,2) not null check(amount >= 0), description text, status text not null default 'approved' check(status in ('draft','approved','rejected')), source_leave_id text references employee_leave_records(id) on delete set null, created_by uuid references auth.users(id) on delete set null, approved_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists payroll_results (
 id text primary key default gen_random_uuid()::text, organization_id text not null references organizations(id) on delete cascade, payroll_period_id text not null references payroll_periods(id) on delete cascade, employee_id text not null references employee_records(id) on delete cascade,
 status text not null default 'calculated' check(status in ('calculated','approved','finalized')), basic_salary numeric(14,2) not null, allowances numeric(14,2) not null, overtime numeric(14,2) not null, other_earnings numeric(14,2) not null, leave_adjustment numeric(14,2) not null, tax numeric(14,2) not null, other_deductions numeric(14,2) not null, gross_earnings numeric(14,2) not null, total_deductions numeric(14,2) not null, net_pay numeric(14,2) not null, calculation_snapshot jsonb not null default '{}'::jsonb, calculated_by uuid references auth.users(id) on delete set null, calculated_at timestamptz not null default now(), finalized_by uuid references auth.users(id) on delete set null, finalized_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(payroll_period_id,employee_id)
);
create index if not exists idx_payroll_config_employee_active on employee_payroll_configurations(organization_id,employee_id,effective_from desc) where active;
create index if not exists idx_payroll_period_status on payroll_periods(organization_id,status,start_date);
create index if not exists idx_payroll_inputs_period_employee on payroll_inputs(organization_id,payroll_period_id,employee_id,status);
create index if not exists idx_payroll_results_period on payroll_results(organization_id,payroll_period_id,status);
create or replace function private.phase1k_guard_payroll_child() returns trigger language plpgsql security definer set search_path=public,auth as $$ begin
 if not exists(select 1 from employee_records e where e.id=new.employee_id and e.organization_id=new.organization_id) then raise exception 'Payroll employee must belong to organization' using errcode='42501'; end if;
 if tg_table_name in ('payroll_inputs','payroll_results') and not exists(select 1 from payroll_periods p where p.id=new.payroll_period_id and p.organization_id=new.organization_id) then raise exception 'Payroll period must belong to organization' using errcode='42501'; end if;
 if tg_table_name='payroll_inputs' and new.source_leave_id is not null and not exists(select 1 from employee_leave_records l where l.id=new.source_leave_id and l.employee_id=new.employee_id and l.organization_id=new.organization_id and l.status='approved') then raise exception 'Payroll leave source must be approved and employee scoped' using errcode='42501'; end if;
 return new; end $$;
drop trigger if exists phase1k_config_guard on employee_payroll_configurations; create trigger phase1k_config_guard before insert or update on employee_payroll_configurations for each row execute function private.phase1k_guard_payroll_child();
drop trigger if exists phase1k_input_guard on payroll_inputs; create trigger phase1k_input_guard before insert or update on payroll_inputs for each row execute function private.phase1k_guard_payroll_child();
drop trigger if exists phase1k_result_guard on payroll_results; create trigger phase1k_result_guard before insert or update on payroll_results for each row execute function private.phase1k_guard_payroll_child();
alter table employee_payroll_configurations enable row level security; alter table payroll_periods enable row level security; alter table payroll_inputs enable row level security; alter table payroll_results enable row level security;
comment on table payroll_results is 'Phase 1K frozen payroll calculation/payslip data. Not attendance or GL.';
commit;
