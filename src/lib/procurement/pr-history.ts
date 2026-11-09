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
  const isItemCompleted =
    item.procurement_status === 'selesai' ||
    Boolean(item.item_delivery_status?.toLowerCase().includes('ready')) ||
    Boolean(item.stock_status?.toLowerCase().includes('ready stock'));

  if (includeCompleted) {
    return isItemCompleted;
  }

  if (isItemCompleted) return false;

  return (
    item.quantity_pr > 0 ||
    item.stock_status?.includes('Not Ready') ||
    Boolean(item.procurement_status)
  );
}

export function filterPurchaseRequirementHistory<
  T extends {
    procurement_status?: string | null;
    stock_status?: string | null;
    item_delivery_status?: string | null;
  },
>(items: T[]): T[] {
  return items.filter(
    (item) =>
      item.procurement_status === 'selesai' ||
      Boolean(item.item_delivery_status?.toLowerCase().includes('ready')) ||
      Boolean(item.stock_status?.toLowerCase().includes('ready stock'))
  );
}

export type PrProcurementStatus = 'selesai' | 'proses' | 'belum' | 'po';

/**
 * Status pengadaan untuk item PR yang berasal dari Request Order.
 *
 * Dihitung per item. Tahap RO `READY_STOCK` tidak lagi otomatis membuat semua
 * item PR-nya "selesai", karena RO campuran (sebagian Ready Stock, sebagian PR)
 * memang berakhir di tahap itu. Item baru dianggap selesai bila item itu sendiri
 * sudah diterima/dipenuhi, ditandai selesai manual, atau RO sudah final.
 */
export function resolveRoPrItemStatus(
  item: {
    quantity_ordered?: number | null;
    quantity_fulfilled?: number | null;
    is_arrived_at_warehouse?: boolean;
    procurement_status?: PrProcurementStatus | null;
    pr_arrival_date?: string | null;
    stock_source?: string | null;
  },
  ro: {
    current_stage?: string | null;
    pr_po_number?: string | null;
    received_date?: string | null;
    arrival_datetime?: string | null;
  }
): { procurement_status: PrProcurementStatus; received_date: string | null } {
  const storedStatus = item.procurement_status || undefined;

  const isCompleted =
    item.is_arrived_at_warehouse === true ||
    Boolean(item.pr_arrival_date) ||
    storedStatus === 'selesai' ||
    (item.stock_source === 'GUDANG_SCGA' && Boolean(storedStatus));

  const procurement_status: PrProcurementStatus = isCompleted
    ? 'selesai'
    : storedStatus || (ro.pr_po_number ? 'po' : 'belum');

  const received_date =
    item.pr_arrival_date ||
    (isCompleted ? ro.received_date || ro.arrival_datetime || null : null);

  return { procurement_status, received_date };
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

export interface SoPrReadyStockItem {
  id: string;
  kode_barang: string;
  nama_barang: string;
  qty: number;
  qty_penerimaan: number;
  satuan: string;
  kategori: string;
  no_rab_ro: string;
  cabang_tujuan: string;
  wilayah: string;
  tgl_penerimaan: string;
  status_pr: string;
  status_stok: string;
  tanggal: string;
  keterangan: string;
}

/**
 * Mengekstrak daftar item PR yang sudah berstatus Ready Stock / Selesai PR
 * untuk digunakan sebagai sumber Data Penerimaan Harian pada fitur Stock Opname.
 * Jumlah yang diambil adalah `quantity_pr` (fallback ke `quantity_needed`).
 */
export function extractPrReadyStockItemsForSo(
  items: Partial<AssetRequest>[],
  options: { sinceDate?: string | null } = {}
): { items: SoPrReadyStockItem[]; totalQty: number } {
  const extracted: SoPrReadyStockItem[] = [];
  let totalQty = 0;
  const cutoff =
    options.sinceDate && /^\d{4}-\d{2}-\d{2}/.test(String(options.sinceDate).trim())
      ? String(options.sinceDate).trim().slice(0, 10)
      : null;

  for (let i = 0; i < (items || []).length; i++) {
    const it = items[i];
    if (!it) continue;

    const isCompletedPr = it.procurement_status === 'selesai';
    const hasPrQty = (Number(it.quantity_pr) || 0) > 0;
    const isMarkedReady =
      Boolean(it.stock_status?.toLowerCase().includes('ready stock')) ||
      Boolean(it.item_delivery_status?.toLowerCase().includes('ready'));

    if (!isCompletedPr && !(hasPrQty && isMarkedReady)) {
      continue;
    }

    const itemName = String(it.item_name || it.system_item_name || '').trim();
    if (!itemName) continue;

    const qtyPr =
      Number(it.quantity_pr) > 0
        ? Number(it.quantity_pr)
        : Number(it.quantity_needed) || 0;

    if (qtyPr <= 0) continue;

    const tglTerima =
      (it.received_date && String(it.received_date).split('T')[0]) ||
      (it.updated_at && String(it.updated_at).split('T')[0]) ||
      (it.pr_datetime && String(it.pr_datetime).split('T')[0]) ||
      (it.order_datetime && String(it.order_datetime).split('T')[0]) ||
      new Date().toISOString().split('T')[0];

    if (cutoff && tglTerima <= cutoff) {
      continue;
    }

    totalQty += qtyPr;

    const rawClass = String(it.classification || it.category || '').toLowerCase();
    const kategori =
      rawClass.includes('lengkap') || rawClass.includes('tetap') || rawClass.includes('plk')
        ? 'Perlengkapan Tetap'
        : 'Peralatan';

    extracted.push({
      id: it.id || `pr-ready-${i}`,
      kode_barang: itemName,
      nama_barang: itemName,
      qty: qtyPr,
      qty_penerimaan: qtyPr,
      satuan: 'UNIT',
      kategori,
      no_rab_ro: it.rab_number || it.external_id || '-',
      cabang_tujuan: it.branch_name || '-',
      wilayah: it.region || '-',
      tgl_penerimaan: tglTerima,
      status_pr: it.procurement_status || 'selesai',
      status_stok: it.stock_status || 'Ready Stock (Gudang SCGA)',
      tanggal: tglTerima,
      keterangan: `PR Ready Stock: ${it.rab_number || '-'} (${qtyPr} Unit) -> ${it.branch_name || '-'}`,
    });
  }

  return { items: extracted, totalQty };
}
