-- Read-only B2 preflight.
select table_name from information_schema.tables where table_schema = 'public' and table_name in ('organizations','organization_members','project_users','organization_invitations') order by table_name;
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'organizations' and column_name in ('legal_name','phone','address','website') order by column_name;
select policyname from pg_policies where schemaname = 'public' and tablename in ('organization_members','organization_invitations') order by tablename, policyname;
