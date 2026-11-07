/**
 * Tanggal RO berasal dari spreadsheet, bukan data kerja user.
 *
 * Merge RO sengaja mempertahankan data aplikasi (status, tahap, catatan, item)
 * agar tidak kembali ke kondisi sheet. Khusus tanggal, sheet adalah sumber
 * kebenaran: koreksi tanggal di spreadsheet harus ikut terpakai, dan tanggal
 * lama yang sempat salah tidak boleh terus dipertahankan.
 */

export interface RoSheetDateFields {
  request_date?: string | null;
  target_delivery_date?: string | null;
}

/**
 * Terapkan tanggal dari baris sheet ke baris hasil merge.
 *
 * - `request_date` = kolom "Tanggal Input" pada sheet.
 * - `target_delivery_date` = kolom "Tanggal Permintaan" pada sheet.
 * - Tanggal sheet yang kosong tidak menghapus nilai lama.
 */
export function applySheetRoDates<T extends RoSheetDateFields>(
  merged: T,
  sheet: RoSheetDateFields
): T {
  const result: RoSheetDateFields = { ...merged };

  if (sheet.request_date) {
    result.request_date = sheet.request_date;
  }
  if (sheet.target_delivery_date) {
    result.target_delivery_date = sheet.target_delivery_date;
  }

  return result as T;
}