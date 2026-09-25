-- Read-only Phase 1O deployment preflight. Do not modify data.
select table_name from information_schema.tables where table_schema = 'public' and table_name in ('variations_and_claims','activities','projects','commercial_action_history') order by table_name;
select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name in ('variations_and_claims','projects') order by table_name, ordinal_position;
select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition from pg_constraint where conrelid in ('variations_and_claims'::regclass, 'projects'::regclass) order by table_name, conname;
select relname as table_name, relrowsecurity as rls_enabled from pg_class where relnamespace = 'public'::regnamespace and relname in ('variations_and_claims','projects');
select policyname, tablename, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename in ('variations_and_claims','projects') order by tablename, policyname;
select count(*) filter (where project_id is null) as missing_project, count(*) filter (where type not in ('variation','claim_eot','claim_cost')) as unsupported_type from variations_and_claims;
