/**
 * Menentukan apakah sebuah RO masih ditampilkan di daftar Kelola RO.
 *
 * RO yang itemnya sudah dialokasikan (Ready Stock / PR Vendor) tetap harus
 * terlihat supaya data alokasinya tidak "hilang" dari Kelola RO. Yang
 * disembunyikan hanya RO yang benar-benar selesai atau dibatalkan.
 */
export interface RoVisibilityInput {
  status?: string | null;
  current_stage?: string | null;
  items?: Array<{ stock_source?: string | null }> | null;
}

const FINAL_STAGES = new Set(['SELESAI', 'COMPLETED', 'DIBATALKAN', 'REJECTED', 'CANCELLED']);

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