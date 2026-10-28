import type { AssetRequest } from '../supabase/types';

type PurchaseRequirementFilterItem = Pick<
  AssetRequest,
  'procurement_status' | 'item_delivery_status' | 'stock_status' | 'quantity_pr'
>;

/**
 * Active PR rows exclude items that have already been completed or moved to
 * Ready Stock. History mode includes completed rows regardless of their later
 * distribution status.
 */
export function matchesPurchaseRequirementFilter(
  item: PurchaseRequirementFilterItem,
  includeCompleted = false
): boolean {
  if (item.procurement_status === 'selesai') {
    return includeCompleted;
  }

  return (
    !item.item_delivery_status?.toLowerCase().includes('ready') &&
    !item.stock_status?.toLowerCase().includes('ready stock') &&
    (item.quantity_pr > 0 ||
      item.stock_status.includes('Not Ready') ||
      Boolean(item.procurement_status))
  );
}

export function filterPurchaseRequirementHistory<
  T extends Pick<AssetRequest, 'procurement_status'>,
>(items: T[]): T[] {
  return items.filter((item) => item.procurement_status === 'selesai');
}
