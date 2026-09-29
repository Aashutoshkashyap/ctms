export const INVENTORY_MOVEMENT_TYPES = ['RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_IN', 'TRANSFER_OUT'] as const;

export type InventoryMovementType = typeof INVENTORY_MOVEMENT_TYPES[number];

export type InventoryMovement = {
  movement_type?: string | null;
  quantity?: number | string | null;
};

export function inventoryMovementDelta(movement: InventoryMovement) {
  const quantity = Number(movement.quantity || 0);
  if (!Number.isFinite(quantity) || quantity < 0) return 0;
  return ['RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN'].includes(movement.movement_type || '') ? quantity
    : ['ISSUE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT'].includes(movement.movement_type || '') ? -quantity : 0;
}

// inventory_opening_balance freezes the stock position that existed before the
// immutable ledger was introduced. Every later movement is reproducible here.
export function deriveInventoryBalance(openingBalance: unknown, movements: InventoryMovement[]) {
  const opening = Number(openingBalance || 0);
  const safeOpening = Number.isFinite(opening) ? opening : 0;
  return movements.reduce((total, movement) => total + inventoryMovementDelta(movement), safeOpening);
}
