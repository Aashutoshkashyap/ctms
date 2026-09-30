-- Read-only preflight for supabase_document_vault.sql.
select table_name from information_schema.tables where table_schema = 'public' and table_name in ('document_references','document_reference_history','uploaded_documents','google_connections','projects','activities') order by table_name;
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('document_references','document_reference_history') order by tablename, indexname;
select tablename, policyname, cmd from pg_policies where schemaname = 'public' and tablename in ('document_references','document_reference_history') order by tablename, policyname;
