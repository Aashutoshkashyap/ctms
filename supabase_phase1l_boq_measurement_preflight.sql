-- Phase 1L read-only preflight. Run before supabase_phase1l_boq_measurement.sql.
select to_regclass('public.boq_item_measurements') as boq_item_measurements;
select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name in ('activities','projects','project_users','boq_item_measurements') order by table_name,ordinal_position;
select tablename,policyname,cmd,roles from pg_policies where schemaname='public' and tablename in ('activities','boq_item_measurements') order by tablename,policyname;
