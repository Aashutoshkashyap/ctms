import { deriveInventoryBalance, INVENTORY_MOVEMENT_TYPES, type InventoryMovementType } from '../../../../lib/inventory';
import { authorizeProjectRequest } from '../../../../lib/server/projectAuthorization';

export const dynamic = 'force-dynamic';

const movementTypes = new Set<string>(INVENTORY_MOVEMENT_TYPES);
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const fail = (error: string, status = 400) => Response.json({ error }, { status });

function numericQuantity(value: unknown) {
  const quantity = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(quantity) && quantity > 0 && Math.round(quantity * 1000) === quantity * 1000 ? quantity : null;
}

function movementInput(value: unknown) {
  const source = value as Record<string, unknown> | null;
  const movementType = text(source?.movementType, 40).toUpperCase();
  const quantity = numericQuantity(source?.quantity);
  const occurredAt = text(source?.occurredAt, 40) || new Date().toISOString();
  const reason = text(source?.reason, 1000);
  const reference = text(source?.reference, 300);
  const clientOperationId = text(source?.clientOperationId, 160);
  if (!movementTypes.has(movementType) || quantity === null || Number.isNaN(Date.parse(occurredAt)) ||
    ((movementType === 'ADJUSTMENT_IN' || movementType === 'ADJUSTMENT_OUT') && !reason) || !clientOperationId) return null;
  return { movementType: movementType as InventoryMovementType, quantity, occurredAt, reason: reason || null, reference: reference || null, clientOperationId };
}

function decorateItems(items: Record<string, unknown>[], events: Record<string, unknown>[]) {
  return items.map((item) => ({
    ...item,
    current_stock: deriveInventoryBalance(item.inventory_opening_balance, events.filter((event) => event.item_id === item.id)),
  }));
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  const actor = await authorizeProjectRequest(request, projectId, 'procurement', 'read');
  if ('error' in actor) return fail(actor.error, actor.status);
  const [items, movements] = await Promise.all([
    actor.admin.from('store_items').select('*').eq('project_id', projectId).order('item_code'),
    actor.admin.from('inventory_events').select('*').eq('project_id', projectId).not('movement_type', 'is', null).order('occurred_at', { ascending: false }),
  ]);
  if (items.error || movements.error) return fail('Inventory records could not be loaded.', 502);
  return Response.json({ items: decorateItems(items.data || [], movements.data || []), movements: movements.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = text(body?.projectId, 120);
  const itemId = text(body?.itemId, 160);
  const input = movementInput(body);
  const actor = await authorizeProjectRequest(request, projectId, 'procurement', 'write');
  if ('error' in actor) return fail(actor.error, actor.status);
  if (!itemId || !input) return fail('Choose a store item and enter a valid stock movement. Adjustments require a reason.');

  const item = await actor.admin.from('store_items').select('id,project_id').eq('id', itemId).eq('project_id', projectId).maybeSingle();
  if (item.error || !item.data) return fail('This store item is not available in the active project.', 404);
  const posted = await actor.admin.rpc('post_inventory_movement', {
    p_project_id: projectId,
    p_item_id: itemId,
    p_movement_type: input.movementType,
    p_quantity: input.quantity,
    p_occurred_at: input.occurredAt,
    p_actor_user_id: actor.userId,
    p_reference: input.reference,
    p_reason: input.reason,
    p_client_operation_id: input.clientOperationId,
  });
  if (posted.error) {
    const overIssue = /available stock|insufficient/i.test(posted.error.message || '');
    return fail(overIssue ? 'The issue quantity exceeds available stock.' : 'The inventory movement could not be posted.', overIssue ? 409 : 400);
  }
  const movement = Array.isArray(posted.data) ? posted.data[0] : posted.data;
  return Response.json({ movement }, { status: 201 });
}
