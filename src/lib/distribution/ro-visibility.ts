/**
 * Menentukan apakah sebuah RO masih ditampilkan di daftar Kelola RO.
 *
 * RO yang itemnya sudah dialokasikan (Ready Stock / PR Vendor) tetap harus
 * terlihat supaya data alokasinya tidak "hilang" dari Kelola RO. Yang
 * disembunyikan adalah RO yang sudah sampai di outlet (Aset Sampai, Checklist,
 * Update SLA) karena proses gudang sudah selesai, ditambah RO yang benar-benar
 * selesai atau dibatalkan.
 */
export interface RoVisibilityInput {
  status?: string | null;
  current_stage?: string | null;
  items?: Array<{ stock_source?: string | null; quantity_fulfilled?: number | null }> | null;
}

export interface RoStaleVisibilityInput {
  source_type?: string | null;
  is_stale?: boolean | null;
  status?: string | null;
  current_stage?: string | null;
  items?: Array<{ stock_source?: string | null; quantity_fulfilled?: number | null }> | null;
}

const FINAL_STAGES = new Set([
  'ASET_SAMPAI',
  'CHECKLIST',
  'CHECKLIST_DONE',
  'UPDATE_SLA',
  'SELESAI',
  'COMPLETED',
  'DIBATALKAN',
  'REJECTED',
  'CANCELLED',
]);
const UNPROCESSED_STAGES = new Set(['INPUT_SYSTEM', 'REQUEST_ORDER']);

export function isRoFinalizedForActiveList(ro: RoVisibilityInput): boolean {
  const stage = ro.current_stage || ro.status;
  if (stage && FINAL_STAGES.has(String(stage))) return true;
  if (ro.status && FINAL_STAGES.has(String(ro.status))) return true;

  const items = Array.isArray(ro.items) ? ro.items : [];
  if (items.length > 0 && items.every((it) => it.stock_source === 'CANCELLED')) {
    return true;
  }

  return false;
}

/**
 * RO dari Google Sheet yang sudah tidak ada di sheet (stale) dan belum pernah
 * diproses user tidak perlu memenuhi Kelola RO.
 *
 * Baris tetap disimpan di database untuk riwayat. RO stale yang sudah punya
 * progres (Ready Stock, PR, qty terpenuhi, atau status lanjut) tetap tampil
 * supaya pekerjaan user tidak "hilang" hanya karena barisnya dihapus dari sheet.
 */
export function isStaleUnprocessedSheetRo(ro: RoStaleVisibilityInput): boolean {
  if (ro.source_type !== 'GOOGLE_SHEET' || ro.is_stale !== true) return false;

  const statusAdvanced = Boolean(
    ro.status && !UNPROCESSED_STAGES.has(String(ro.status))
  );
  const stageAdvanced = Boolean(
    ro.current_stage && !UNPROCESSED_STAGES.has(String(ro.current_stage))
  );
  if (statusAdvanced || stageAdvanced) return false;

  const items = Array.isArray(ro.items) ? ro.items : [];
  return !items.some(
    (it) =>
      (Number(it.quantity_fulfilled) || 0) > 0 ||
      (it.stock_source && it.stock_source !== 'ON_PROSES')
  );
}