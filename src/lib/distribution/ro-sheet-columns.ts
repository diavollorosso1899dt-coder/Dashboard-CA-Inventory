/**
 * Parser kolom spreadsheet RO.
 *
 * Dipisah dari server agar bisa diuji tanpa memuat modul Supabase/Next.
 * Header sheet Jabo pernah memakai sel gabungan "Jumlah Satuan" sehingga
 * jumlah kolom header lebih sedikit dari baris data. Saat itu terjadi, semua
 * kolom setelah sel gabungan harus digeser agar unit, harga, total, tipe,
 * outlet, dan gudang tidak terbaca dari kolom yang salah.
 */

export type RoSheetRegion = 'KALBAR' | 'JABODETABEK';

export interface RoSheetColumns {
  roIdIdx: number;
  skuIdx: number;
  itemNameIdx: number;
  qtyIdx: number;
  unitIdx: number;
  hargaIdx: number;
  totalIdx: number;
  tipeIdx: number;
  outletIdx: number;
  warehouseIdx: number;
  statusIdx: number;
  inputDateIdx: number;
  reqDateIdx: number;
}

export function parseRoCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

export function detectRoColumns(
  headerLine: string,
  defaultRegion: RoSheetRegion,
  sampleDataLine?: string
): RoSheetColumns {
  const headerParts = parseRoCsvLine(headerLine);
  const cols = headerParts.map((c) => c.toLowerCase().trim());

  let roIdIdx = cols.findIndex((c) => c === 'ro id' || c.includes('ro id') || c === 'id ro');
  let itemNameIdx = cols.findIndex((c) => c.includes('nama item') || c.includes('nama barang'));
  let qtyIdx = cols.findIndex((c) => c === 'jumlah' || c === 'qty');
  let unitIdx = cols.findIndex((c) => c.includes('satuan'));
  let hargaIdx = cols.findIndex((c) => c === 'harga');
  let totalIdx = cols.findIndex((c) => c === 'total');
  let tipeIdx = cols.findIndex((c) => c.includes('tipe'));
  let outletIdx = cols.findIndex((c) => c === 'outlet' || c.includes('cabang'));
  let warehouseIdx = cols.findIndex((c) => c === 'gudang');
  let statusIdx = cols.findIndex((c) => c === 'status');
  let skuIdx = cols.findIndex((c) => c === 'sku');
  let inputDateIdx = cols.findIndex((c) => c.includes('tgl input') || c.includes('tanggal input'));
  let reqDateIdx = cols.findIndex((c) => c.includes('tgl permintaan') || c.includes('tanggal permintaan'));

  // Simpan kolom yang benar-benar ditemukan di header. Fallback di bawah
  // memakai posisi baris data normal, jadi tidak boleh ikut digeser.
  const found = {
    sku: skuIdx !== -1,
    itemName: itemNameIdx !== -1,
    qty: qtyIdx !== -1,
    unit: unitIdx !== -1,
    harga: hargaIdx !== -1,
    total: totalIdx !== -1,
    tipe: tipeIdx !== -1,
    outlet: outletIdx !== -1,
    warehouse: warehouseIdx !== -1,
    status: statusIdx !== -1,
    inputDate: inputDateIdx !== -1,
    reqDate: reqDateIdx !== -1,
  };

  if (defaultRegion === 'KALBAR') {
    if (roIdIdx === -1) roIdIdx = 3;
    if (skuIdx === -1) skuIdx = 4;
    if (itemNameIdx === -1) itemNameIdx = 5;
    if (qtyIdx === -1) qtyIdx = 6;
    if (unitIdx === -1) unitIdx = 7;
    if (hargaIdx === -1) hargaIdx = 8;
    if (totalIdx === -1) totalIdx = 9;
    if (tipeIdx === -1) tipeIdx = 10;
    if (outletIdx === -1) outletIdx = 11;
    if (warehouseIdx === -1) warehouseIdx = 12;
    if (statusIdx === -1) statusIdx = 13;
    if (inputDateIdx === -1) inputDateIdx = 1;
    if (reqDateIdx === -1) reqDateIdx = 2;
  } else {
    // JABODETABEK format:
    // [0] Bulan, [1] tgl input, [2] tgl permintaan, [3] outlet/ro_id, [4] nama item, [5] qty, [6] unit, [7] harga, [8] total, [9] tipe, [10] outlet name, [11] gudang, [12] status
    if (roIdIdx === -1) roIdIdx = 3;
    if (itemNameIdx === -1) itemNameIdx = 4;
    if (qtyIdx === -1) qtyIdx = 5;
    if (unitIdx === -1) unitIdx = 6;
    if (hargaIdx === -1) hargaIdx = 7;
    if (totalIdx === -1) totalIdx = 8;
    if (tipeIdx === -1) tipeIdx = 9;
    if (outletIdx === 3 || outletIdx === -1) outletIdx = 10;
    if (warehouseIdx === -1) warehouseIdx = 11;
    if (statusIdx === -1) statusIdx = 12;
    if (inputDateIdx === -1) inputDateIdx = 1;
    if (reqDateIdx === -1) reqDateIdx = 2;
  }

  // Header dengan sel gabungan "Jumlah Satuan" punya satu kolom lebih sedikit
  // daripada baris data. Geser kolom setelah sel gabungan sebesar selisihnya.
  if (sampleDataLine) {
    const extraColumns = parseRoCsvLine(sampleDataLine).length - headerParts.length;
    const mergedQtyUnitIdx = cols.findIndex(
      (c) => c.includes('jumlah') && c.includes('satuan')
    );
    if (extraColumns > 0 && mergedQtyUnitIdx !== -1) {
      const shift = (idx: number, detected: boolean) =>
        detected && idx >= mergedQtyUnitIdx ? idx + extraColumns : idx;
      skuIdx = shift(skuIdx, found.sku);
      itemNameIdx = shift(itemNameIdx, found.itemName);
      qtyIdx = found.qty && qtyIdx > mergedQtyUnitIdx ? qtyIdx + extraColumns : qtyIdx;
      unitIdx = shift(unitIdx, found.unit);
      hargaIdx = shift(hargaIdx, found.harga);
      totalIdx = shift(totalIdx, found.total);
      tipeIdx = shift(tipeIdx, found.tipe);
      outletIdx = shift(outletIdx, found.outlet);
      warehouseIdx = shift(warehouseIdx, found.warehouse);
      statusIdx = shift(statusIdx, found.status);
      inputDateIdx = shift(inputDateIdx, found.inputDate);
      reqDateIdx = shift(reqDateIdx, found.reqDate);
    }
  }

  return {
    roIdIdx,
    skuIdx,
    itemNameIdx,
    qtyIdx,
    unitIdx,
    hargaIdx,
    totalIdx,
    tipeIdx,
    outletIdx,
    warehouseIdx,
    statusIdx,
    inputDateIdx,
    reqDateIdx,
  };
}

/**
 * Baris contoh/instruksi di sheet tidak boleh dianggap sebagai RO.
 * Contoh: RO ID "outlet", nama item "nama item".
 */
export function isRoSheetPlaceholderRow(
  rawRoId?: string | null,
  itemName?: string | null
): boolean {
  const id = String(rawRoId ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const name = String(itemName ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const placeholderIds = new Set(['outlet', 'ro id', 'id ro', 'id', 'no', 'no.']);
  const placeholderNames = new Set([
    'nama item',
    'nama barang',
    'nama item aset/perlengkapan',
    'nama item aset / perlengkapan',
    'item',
  ]);

  return placeholderIds.has(id) || placeholderNames.has(name);
}