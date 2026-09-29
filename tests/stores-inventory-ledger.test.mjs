import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const route = fs.readFileSync('src/app/api/stores/inventory/route.ts', 'utf8');
const migration = fs.readFileSync('supabase_stores_inventory_ledger.sql', 'utf8');
const dashboard = fs.readFileSync('src/components/ProcurementStoresDashboard.tsx', 'utf8');
const procurement = fs.readFileSync('src/app/api/procurement/route.ts', 'utf8');
const inventory = fs.readFileSync('src/lib/inventory.ts', 'utf8');

test('inventory API is a narrow, server-authorized project endpoint', () => {
  assert.match(route, /authorizeProjectRequest\(request, projectId, 'procurement', 'read'\)/);
  assert.match(route, /authorizeProjectRequest\(request, projectId, 'procurement', 'write'\)/);
  assert.match(route, /eq\('id', itemId\)\.eq\('project_id', projectId\)/);
  assert.match(route, /clientOperationId/);
  assert.match(route, /rpc\('post_inventory_movement'/);
  assert.match(route, /quantity exceeds available stock/);
});

test('posted movements use controlled positive quantities and adjustments require a reason', () => {
  for (const type of ['RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_IN', 'TRANSFER_OUT']) assert.match(inventory, new RegExp(type));
  assert.match(route, /quantity > 0/);
  assert.match(route, /Math\.round\(quantity \* 1000\)/);
  assert.match(route, /ADJUSTMENT_IN.*ADJUSTMENT_OUT.*!reason/);
});

test('ledger is additive, immutable, idempotent, and protects stock availability atomically', () => {
  assert.match(migration, /add column if not exists inventory_opening_balance/);
  assert.match(migration, /inventory_events_project_operation_unique/);
  assert.match(migration, /for update/);
  assert.match(migration, /Insufficient available stock/);
  assert.match(migration, /Posted inventory movements are immutable/);
  assert.match(migration, /revoke all on function public\.post_inventory_movement/);
  assert.match(migration, /grant execute .* to service_role/);
  assert.match(migration, /drop policy if exists "admin manage" on inventory_events/);
  assert.match(migration, /drop policy if exists "feature access insert gate" on inventory_events/);
  assert.match(migration, /drop policy if exists "phase1a tenant scope" on inventory_events/);
  assert.doesNotMatch(migration, /drop table|truncate\s/i);
});

test('store item edits no longer accept browser-controlled received or issued totals', () => {
  assert.match(procurement, /function storeInput\(value: unknown, creating = false\)/);
  assert.match(procurement, /creating\?\{\.\.\.shared,opening_stock:openingStock,received:0,issued:0,inventory_opening_balance:openingStock\}:shared/);
  assert.doesNotMatch(dashboard, /storage\.saveInventoryEvent/);
  assert.match(dashboard, /\/api\/stores\/inventory/);
  assert.match(dashboard, /clientOperationId: crypto\.randomUUID\(\)/);
  assert.match(dashboard, /body:JSON\.stringify\(\{projectId,itemId:movementItem\.id,\.\.\.movement\}\)/);
  assert.match(dashboard, /Receive stock/);
  assert.match(dashboard, /Issue stock/);
  assert.match(dashboard, /Recent stock movements/);
});

test('balance is rendered from server inventory data and the active project is always included', () => {
  assert.match(route, /deriveInventoryBalance/);
  assert.match(dashboard, /projectId,itemId:movementItem\.id/);
  assert.match(dashboard, /useEffect\(\(\)=>\{void load\(\);\},\[projectId\]\)/);
  assert.match(dashboard, /current_stock/);
});
