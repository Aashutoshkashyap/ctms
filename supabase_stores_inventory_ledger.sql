-- CTMS Stores & Inventory: reuse inventory_events as the immutable authority.
-- Existing events remain legacy/informational unless they have a movement_type;
-- no historical values are fabricated or removed.
begin;

alter table store_items add column if not exists inventory_opening_balance numeric(14,3);
update store_items
set inventory_opening_balance = coalesce(opening_stock, 0) + coalesce(received, 0) - coalesce(issued, 0)
where inventory_opening_balance is null;
alter table store_items alter column inventory_opening_balance set default 0;
alter table store_items drop constraint if exists store_items_id_project_unique;
alter table store_items add constraint store_items_id_project_unique unique (id, project_id);

alter table inventory_events add column if not exists movement_type text;
alter table inventory_events add column if not exists occurred_at timestamptz;
alter table inventory_events add column if not exists actor_user_id uuid references auth.users(id) on delete set null;
alter table inventory_events add column if not exists reference text;
alter table inventory_events add column if not exists reason text;
alter table inventory_events add column if not exists client_operation_id text;
alter table inventory_events add column if not exists posted_at timestamptz;
alter table inventory_events drop constraint if exists inventory_events_item_project_fk;
alter table inventory_events add constraint inventory_events_item_project_fk
  foreign key (item_id, project_id) references store_items(id, project_id) not valid;

alter table inventory_events drop constraint if exists inventory_events_movement_type_check;
alter table inventory_events add constraint inventory_events_movement_type_check
  check (movement_type is null or movement_type in ('RECEIPT','ISSUE','ADJUSTMENT_IN','ADJUSTMENT_OUT','TRANSFER_IN','TRANSFER_OUT')) not valid;
alter table inventory_events drop constraint if exists inventory_events_posted_quantity_check;
alter table inventory_events add constraint inventory_events_posted_quantity_check
  check (movement_type is null or quantity > 0) not valid;
alter table inventory_events drop constraint if exists inventory_events_posted_item_check;
alter table inventory_events add constraint inventory_events_posted_item_check
  check (movement_type is null or item_id is not null) not valid;

create unique index if not exists inventory_events_project_operation_unique
  on inventory_events(project_id, client_operation_id)
  where client_operation_id is not null;
create index if not exists inventory_events_project_item_occurred_idx
  on inventory_events(project_id, item_id, occurred_at desc)
  where movement_type is not null;

create or replace function public.prevent_inventory_movement_mutation()
returns trigger language plpgsql as $$
begin
  if old.posted_at is not null then
    raise exception 'Posted inventory movements are immutable; post a compensating movement instead.';
  end if;
  return old;
end;
$$;

drop trigger if exists inventory_events_immutable_posted on inventory_events;
create trigger inventory_events_immutable_posted
before update or delete on inventory_events
for each row execute function public.prevent_inventory_movement_mutation();

create or replace function public.post_inventory_movement(
  p_project_id text,
  p_item_id text,
  p_movement_type text,
  p_quantity numeric,
  p_occurred_at timestamptz,
  p_actor_user_id uuid,
  p_reference text default null,
  p_reason text default null,
  p_client_operation_id text default null
)
returns inventory_events
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item store_items;
  v_event inventory_events;
  v_available numeric(14,3);
  v_event_type text;
begin
  if p_movement_type not in ('RECEIPT','ISSUE','ADJUSTMENT_IN','ADJUSTMENT_OUT','TRANSFER_IN','TRANSFER_OUT') then
    raise exception 'Unsupported inventory movement type';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 3) then
    raise exception 'Inventory quantity must be positive and use no more than three decimal places';
  end if;
  if p_movement_type in ('ADJUSTMENT_IN','ADJUSTMENT_OUT') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Inventory adjustments require a reason';
  end if;
  if coalesce(btrim(p_client_operation_id), '') = '' then
    raise exception 'Inventory operation identity is required';
  end if;

  select * into v_event from inventory_events
  where project_id = p_project_id and client_operation_id = p_client_operation_id;
  if found then return v_event; end if;

  select * into v_item from store_items
  where id = p_item_id and project_id = p_project_id for update;
  if not found then raise exception 'Store item is not in the requested project'; end if;

  select coalesce(v_item.inventory_opening_balance, 0) + coalesce(sum(
    case movement_type
      when 'RECEIPT' then quantity when 'ADJUSTMENT_IN' then quantity when 'TRANSFER_IN' then quantity
      when 'ISSUE' then -quantity when 'ADJUSTMENT_OUT' then -quantity when 'TRANSFER_OUT' then -quantity
      else 0 end), 0)
  into v_available
  from inventory_events
  where project_id = p_project_id and item_id = p_item_id and movement_type is not null;
  if p_movement_type in ('ISSUE','ADJUSTMENT_OUT','TRANSFER_OUT') and p_quantity > v_available then
    raise exception 'Insufficient available stock';
  end if;

  v_event_type := case
    when p_movement_type = 'RECEIPT' then 'received'
    when p_movement_type = 'ISSUE' then 'issued'
    when p_movement_type like 'ADJUSTMENT%' then 'adjusted'
    else 'moved' end;
  insert into inventory_events (
    id, project_id, item_id, event_date, event_type, quantity, recorded_by,
    movement_type, occurred_at, actor_user_id, reference, reason, client_operation_id, posted_at, remarks
  ) values (
    'inventory-' || gen_random_uuid()::text, p_project_id, p_item_id, p_occurred_at::date, v_event_type, p_quantity, p_actor_user_id::text,
    p_movement_type, p_occurred_at, p_actor_user_id, nullif(btrim(p_reference), ''), nullif(btrim(p_reason), ''), p_client_operation_id, now(), nullif(btrim(p_reason), '')
  ) returning * into v_event;
  return v_event;
end;
$$;

revoke all on function public.post_inventory_movement(text,text,text,numeric,timestamptz,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.post_inventory_movement(text,text,text,numeric,timestamptz,uuid,text,text,text) to service_role;

alter table inventory_events enable row level security;
drop policy if exists "admin manage" on inventory_events;
drop policy if exists "admin roles manage inventory_events" on inventory_events;
drop policy if exists "inventory events write" on inventory_events;
drop policy if exists "feature access insert gate" on inventory_events;
drop policy if exists "feature access update gate" on inventory_events;
drop policy if exists "feature access delete gate" on inventory_events;
drop policy if exists "phase1a tenant scope" on inventory_events;
-- Browser clients may read authorized history but cannot insert, edit, or delete it.
drop policy if exists "inventory events read" on inventory_events;
create policy "inventory events read" on inventory_events for select to authenticated
using (private.is_business_admin(project_id) or private.has_project_role(project_id,array['project_director','project_manager','store_officer','site_engineer','qs_billing_engineer']));
create policy "inventory events tenant read" on inventory_events for select to authenticated
using (private.phase1a_tenant_access(project_id));

commit;
