export interface DistributionQueueKeyParams {
  roId?: string | null;
  roNumber?: string | null;
  branchName?: string | null;
  itemId?: string | null;
  itemName: string;
}

/**
 * Generates all candidate keys used by Pemantauan Distribusi (`ca_received_qty_map`)
 * so that Monitoring SLA and Pemantauan Distribusi resolve the exact same item.
 */
export function buildDistributionQueueKeys({
  roId,
  roNumber,
  branchName,
  itemId,
  itemName,
}: DistributionQueueKeyParams): string[] {
  const keys: string[] = [];
  const cleanName = (itemName || '').trim();
  const lowerName = cleanName.toLowerCase();

  if (roId) {
    if (itemId) {
      keys.push(`ro-${roId}-${itemId}`);
    }
    keys.push(`ro-${roId}-${encodeURIComponent(cleanName)}`);
  }

  if (itemId) {
    keys.push(itemId);
  }

  if (branchName) {
    keys.push(`${branchName.trim()}:::${cleanName}`);
    keys.push(`${branchName.toLowerCase().trim()}:::${lowerName}`);
  }

  if (roNumber) {
    keys.push(`${roNumber.trim()}:::${cleanName}`);
    keys.push(`${roNumber.toLowerCase().trim()}:::${lowerName}`);
  }

  return Array.from(new Set(keys.filter(Boolean)));
}

export interface ResolveReceivedQuantityParams {
  orderedQty: number;
  itemReceivedQty?: number | null;
  itemFulfilledQty?: number | null;
  stockSource?: string | null;
  transferReceivedQty?: number | null;
  transferQty?: number | null;
  isTransferredAndReceived?: boolean;
  receivedQtyMap?: Record<string, number> | null;
  candidateKeys?: string[];
}

function toFiniteNonNegative(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Resolves the received quantity for an item based on Pemantauan Distribusi:
 * 1. User-entered quantity in Pemantauan Distribusi queue (`ca_received_qty_map`)
 * 2. `received_quantity` recorded on the distribution transfer / Surat Jalan
 * 3. `received_qty` persisted on the RO item
 * 4. Default ordered/transferred quantity when item is in Ready Stock / received
 * 5. Otherwise `itemFulfilledQty` or `0`
 */
export function resolveReceivedQuantity({
  orderedQty,
  itemReceivedQty,
  itemFulfilledQty,
  stockSource,
  transferReceivedQty,
  transferQty,
  isTransferredAndReceived = false,
  receivedQtyMap,
  candidateKeys = [],
}: ResolveReceivedQuantityParams): number {
  if (receivedQtyMap) {
    for (const key of candidateKeys) {
      const stored = toFiniteNonNegative(receivedQtyMap[key]);
      if (stored !== null) return stored;
    }
  }

  const fromTransferReceived = toFiniteNonNegative(transferReceivedQty);
  if (fromTransferReceived !== null) return fromTransferReceived;

  const fromItemReceived = toFiniteNonNegative(itemReceivedQty);
  if (fromItemReceived !== null) return fromItemReceived;

  if (isTransferredAndReceived || stockSource === 'GUDANG_SCGA') {
    const fromTransferQty = toFiniteNonNegative(transferQty);
    if (fromTransferQty !== null && fromTransferQty > 0) return fromTransferQty;

    const fromFulfilled = toFiniteNonNegative(itemFulfilledQty);
    if (fromFulfilled !== null && fromFulfilled > 0) return fromFulfilled;

    return Math.max(0, Math.floor(Number(orderedQty) || 0));
  }

  return toFiniteNonNegative(itemFulfilledQty) ?? 0;
}
