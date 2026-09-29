-- Read-only preflight for the authoritative Stores inventory ledger.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('store_items', 'inventory_events')
order by table_name, ordinal_position;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.store_items'::regclass, 'public.inventory_events'::regclass)
order by conrelid::regclass::text, conname;

select policyname, tablename, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('store_items', 'inventory_events')
order by tablename, policyname;

select id, project_id, item_id, event_type, quantity, event_date
from inventory_events
where item_id is null
   or not exists (select 1 from store_items where store_items.id = inventory_events.item_id and store_items.project_id = inventory_events.project_id)
limit 50;
