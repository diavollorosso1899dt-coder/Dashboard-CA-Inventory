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

/**
 * Removes client-only properties (like `item_notes` or `id`) that are not
 * columns in `public.asset_requests` so PostgREST does not reject updates
 * with PGRST204.
 */
export function sanitizeAssetRequestDbPayload(
  payload: Partial<AssetRequest>,
  updatedAt = new Date().toISOString()
): Record<string, unknown> {
  const { item_notes, id: _id, ...rest } = payload;
  const dbPayload: Record<string, unknown> = {
    ...rest,
    is_manually_edited: true,
    updated_at: updatedAt,
  };

  if (item_notes !== undefined && dbPayload.notes === undefined) {
    dbPayload.notes = item_notes;
  }

  return dbPayload;
}

/**
 * Preserves manual dashboard edits (including PR status and dates) when
 * syncing Google Sheets rows back into Supabase.
 */
export function mergeManualAssetEdit<T extends Record<string, any>>(
  sheetItem: T,
  manualEdit?: Partial<AssetRequest> | null
): T {
  if (!manualEdit) return sheetItem;

  return {
    ...sheetItem,
    item_delivery_status:
      manualEdit.item_delivery_status ?? sheetItem.item_delivery_status,
    stock_status: manualEdit.stock_status ?? sheetItem.stock_status,
    pic_receiver: manualEdit.pic_receiver ?? sheetItem.pic_receiver,
    notes: manualEdit.notes ?? sheetItem.notes,
    procurement_status:
      manualEdit.procurement_status ?? sheetItem.procurement_status,
    pr_datetime: manualEdit.pr_datetime ?? sheetItem.pr_datetime,
    po_date: manualEdit.po_date ?? sheetItem.po_date,
    received_date: manualEdit.received_date ?? sheetItem.received_date,
    order_datetime: manualEdit.order_datetime ?? sheetItem.order_datetime,
    vendor_name: manualEdit.vendor_name ?? sheetItem.vendor_name,
    is_system_transfer:
      manualEdit.is_system_transfer ?? sheetItem.is_system_transfer,
    is_manually_edited: true,
  };
}
