/**
 * Inventory Calculation Engine for Daily Stock Opname (SO Harian)
 */

export interface VarianceResult {
  selisih: number | null;
  status: 'UNCHECKED' | 'MATCH' | 'MINUS' | 'PLUS';
}

export interface SOItem {
  id: string;
  kode_barang: string;
  nama_barang: string;
  kategori: string;
  satuan: string;
  lokasi: string;
  stok_awal: number;
  qty_penerimaan: number;
  qty_ro: number;
  stok_sistem: number;
  qty_fisik: number | null;
  selisih: number | null;
  status_selisih: 'UNCHECKED' | 'MATCH' | 'MINUS' | 'PLUS';
  catatan: string;
  /** Asal angka stok awal: hasil SO hari sebelumnya, master spreadsheet, atau input manual. */
  stok_awal_sumber?: 'SO_SEBELUMNYA' | 'MASTER' | 'MANUAL';
}

export interface CategorySummary {
  total: number;
  checked: number;
  match: number;
  minus: number;
  plus: number;
  akurasi: number;
}

export interface SessionSummary {
  totalItem: number;
  itemChecked: number;
  itemUnchecked: number;
  itemMatch: number;
  itemMinus: number;
  itemPlus: number;
  itemSelisih: number;
  akurasiPersen: number;
  byCategory: {
    Peralatan: CategorySummary;
    'Perlengkapan Tetap': CategorySummary;
  };
}

/**
 * Calculates system stock: Stok Awal + Penerimaan Harian - RO Harian
 */
export function calculateSystemStock(
  stokAwal: number | string,
  qtyPenerimaan: number | string,
  qtyRo: number | string
): number {
  const awal = Number(stokAwal) || 0;
  const masuk = Number(qtyPenerimaan) || 0;
  const keluar = Number(qtyRo) || 0;

  const hasil = awal + masuk - keluar;
  return Math.round((hasil + Number.EPSILON) * 10000) / 10000;
}

/**
 * Calculates variance (selisih) and status:
 * Selisih = Qty Fisik - Stok Sistem
 */
export function calculateVariance(
  qtyFisik: number | string | null | undefined,
  stokSistem: number | string
): VarianceResult {
  if (qtyFisik === null || qtyFisik === undefined || qtyFisik === '') {
    return {
      selisih: null,
      status: 'UNCHECKED',
    };
  }

  const fisik = Number(qtyFisik);
  if (isNaN(fisik)) {
    return {
      selisih: null,
      status: 'UNCHECKED',
    };
  }

  const sistem = Number(stokSistem) || 0;
  const selisihRaw = fisik - sistem;
  const selisih = Math.round((selisihRaw + Number.EPSILON) * 10000) / 10000;

  let status: 'MATCH' | 'MINUS' | 'PLUS' = 'MATCH';
  if (selisih < 0) {
    status = 'MINUS';
  } else if (selisih > 0) {
    status = 'PLUS';
  }

  return {
    selisih,
    status,
  };
}

/**
 * Aggregates transaction rows (RO or Penerimaan) by SKU / kode_barang
 */
export function aggregateTransactions(rows: any[] = []): Map<string, number> {
  const result = new Map<string, number>();

  for (const row of rows) {
    if (!row) continue;
    const rawCode = row.kode_barang || row.sku || row.kode || row.kode_item || row.nama_barang || row.nama || row.item || '';
    const code = String(rawCode).trim();
    if (!code) continue;

    const qty = Number(row.qty || row.jumlah || row.kuantiti || 0) || 0;
    const current = result.get(code) || 0;
    result.set(code, Math.round((current + qty + Number.EPSILON) * 10000) / 10000);
  }

  return result;
}

/**
 * Merges initial stock, RO, and Penerimaan into a unified list of items for SO
 */
export function mergeDailyInventory(
  initialStockMap: Map<string, number> = new Map(),
  roMap: Map<string, number> = new Map(),
  penerimaanMap: Map<string, number> = new Map(),
  itemDetailsMap: Map<string, any> = new Map(),
  initialSourceMap: Map<string, 'SO_SEBELUMNYA' | 'MASTER' | 'MANUAL'> = new Map()
): SOItem[] {
  const allCodes = new Set([
    ...Array.from(initialStockMap.keys()),
    ...Array.from(roMap.keys()),
    ...Array.from(penerimaanMap.keys()),
    ...Array.from(itemDetailsMap.keys()),
  ]);

  const merged: SOItem[] = [];

  for (const code of Array.from(allCodes)) {
    if (!code) continue;

    const details = itemDetailsMap.get(code) || {};
    const stokAwal = initialStockMap.get(code) || 0;
    const qtyPenerimaan = penerimaanMap.get(code) || 0;
    const qtyRo = roMap.get(code) || 0;

    const stokSistem = calculateSystemStock(stokAwal, qtyPenerimaan, qtyRo);

    merged.push({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      kode_barang: code,
      nama_barang: details.nama_barang || details.nama || details.deskripsi || code,
      kategori: details.kategori || 'Peralatan',
      satuan: details.satuan || details.uom || 'PCS',
      lokasi: details.lokasi || details.rak || 'Gudang Utama',
      stok_awal: stokAwal,
      qty_penerimaan: qtyPenerimaan,
      qty_ro: qtyRo,
      stok_sistem: stokSistem,
      qty_fisik: null,
      selisih: null,
      status_selisih: 'UNCHECKED',
      catatan: '',
      stok_awal_sumber: initialSourceMap.get(code) || 'MASTER',
    });
  }

  return merged.sort((a, b) => a.kode_barang.localeCompare(b.kode_barang));
}

/**
 * Calculates overall and per-category summary metrics from items list
 */
export function calculateSessionSummary(items: SOItem[] = []): SessionSummary {
  const totalItem = items.length;
  let itemMatch = 0;
  let itemMinus = 0;
  let itemPlus = 0;
  let itemUnchecked = 0;

  const catSummary: {
    Peralatan: CategorySummary;
    'Perlengkapan Tetap': CategorySummary;
  } = {
    Peralatan: { total: 0, checked: 0, match: 0, minus: 0, plus: 0, akurasi: 0 },
    'Perlengkapan Tetap': { total: 0, checked: 0, match: 0, minus: 0, plus: 0, akurasi: 0 },
  };

  for (const item of items) {
    const cat = item.kategori === 'Perlengkapan Tetap' ? 'Perlengkapan Tetap' : 'Peralatan';
    catSummary[cat].total++;

    if (item.status_selisih === 'MATCH') {
      itemMatch++;
      catSummary[cat].match++;
      catSummary[cat].checked++;
    } else if (item.status_selisih === 'MINUS') {
      itemMinus++;
      catSummary[cat].minus++;
      catSummary[cat].checked++;
    } else if (item.status_selisih === 'PLUS') {
      itemPlus++;
      catSummary[cat].plus++;
      catSummary[cat].checked++;
    } else {
      itemUnchecked++;
    }
  }

  for (const cat of ['Peralatan', 'Perlengkapan Tetap'] as const) {
    const checked = catSummary[cat].checked;
    catSummary[cat].akurasi = checked > 0 ? Math.round((catSummary[cat].match / checked) * 10000) / 100 : 0;
  }

  const itemChecked = totalItem - itemUnchecked;
  const akurasiPersen = itemChecked > 0 ? Math.round((itemMatch / itemChecked) * 10000) / 100 : 0;

  return {
    totalItem,
    itemChecked,
    itemUnchecked,
    itemMatch,
    itemMinus,
    itemPlus,
    itemSelisih: itemMinus + itemPlus,
    akurasiPersen,
    byCategory: catSummary,
  };
}
