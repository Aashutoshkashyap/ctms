-- Phase 1N read-only preflight: payment certificates remain separate from ipc_submissions.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('ipc_submissions', 'ipc_valuation_periods', 'payment_certificates', 'payment_certificate_deductions')
order by table_name, ordinal_position;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ipc_valuation_periods', 'payment_certificates', 'payment_certificate_deductions')
order by c.relname;

-- The next two checks intentionally use catalog metadata so this preflight is safe
-- before the additive tables have been created.
select c.relname as existing_certificate_structure
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('payment_certificates', 'payment_certificate_deductions');
