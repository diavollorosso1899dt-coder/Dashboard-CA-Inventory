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
 * Normalizes SKU / item name for case-insensitive matching across Master, PR, and Outlet deliveries.
 */
export function normalizeInventoryKey(raw: unknown): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractIsoDatePrefix(raw: unknown): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/**
 * Filters transaction rows (PR Ready Stock or Terima Outlet) to only include
 * mutations that occurred strictly after `sinceDate` (the previous SO session date),
 * preventing double-counting when rolling over Hasil SO -> Stock Aset.
 */
export function filterTransactionsAfterDate<T extends Record<string, any>>(
  rows: T[] = [],
  sinceDate?: string | null
): T[] {
  const cutoff = extractIsoDatePrefix(sinceDate);
  if (!cutoff) return rows || [];

  return (rows || []).filter((row) => {
    if (!row) return false;
    const rowDate =
      extractIsoDatePrefix(row.tanggal) ||
      extractIsoDatePrefix(row.tgl_diterima) ||
      extractIsoDatePrefix(row.tgl_penerimaan) ||
      extractIsoDatePrefix(row.received_date);
    // Rows without a date (e.g. manual Excel upload without date column) are kept
    if (!rowDate) return true;
    return rowDate > cutoff;
  });
}

/**
 * Aggregates transaction rows (RO or Penerimaan) by SKU / kode_barang (case-insensitive)
 */
export function aggregateTransactions(rows: any[] = []): Map<string, number> {
  const result = new Map<string, number>();
  const canonicalByNorm = new Map<string, string>();

  for (const row of rows) {
    if (!row) continue;
    const rawCode =
      row.kode_barang || row.sku || row.kode || row.kode_item || row.nama_barang || row.nama || row.item || '';
    const code = String(rawCode).trim();
    const norm = normalizeInventoryKey(code);
    if (!norm) continue;

    let canonical = canonicalByNorm.get(norm);
    if (!canonical) {
      canonical = code;
      canonicalByNorm.set(norm, canonical);
    }

    const qty = Number(row.qty ?? row.qty_penerimaan ?? row.jumlah ?? row.kuantiti ?? 0) || 0;
    const current = result.get(canonical) || 0;
    result.set(canonical, Math.round((current + qty + Number.EPSILON) * 10000) / 10000);
  }

  return result;
}

/**
 * Merges initial stock, RO, and Penerimaan into a unified list of items for SO
 * with case-insensitive SKU and item-name reconciliation so items never duplicate.
 */
export function mergeDailyInventory(
  initialStockMap: Map<string, number> = new Map(),
  roMap: Map<string, number> = new Map(),
  penerimaanMap: Map<string, number> = new Map(),
  itemDetailsMap: Map<string, any> = new Map(),
  initialSourceMap: Map<string, 'SO_SEBELUMNYA' | 'MASTER' | 'MANUAL'> = new Map()
): SOItem[] {
  const canonicalByNorm = new Map<string, string>();
  const registerCanonical = (code: string) => {
    const clean = String(code || '').trim();
    const norm = normalizeInventoryKey(clean);
    if (!norm) return '';
    if (!canonicalByNorm.has(norm)) {
      canonicalByNorm.set(norm, clean);
    }
    return canonicalByNorm.get(norm)!;
  };

  // Priority order for canonical code casing: initialStock -> itemDetails -> penerimaan -> ro
  for (const k of Array.from(initialStockMap.keys())) registerCanonical(k);
  for (const k of Array.from(itemDetailsMap.keys())) registerCanonical(k);

  // Also map normalized item name -> canonical SKU code so transactions keyed by item_name match master SKU
  for (const [rawCode, details] of Array.from(itemDetailsMap.entries())) {
    const canonical = registerCanonical(rawCode);
    const nameNorm = normalizeInventoryKey(details?.nama_barang || details?.nama || details?.deskripsi);
    if (nameNorm && canonical && !canonicalByNorm.has(nameNorm)) {
      canonicalByNorm.set(nameNorm, canonical);
    }
  }

  for (const k of Array.from(penerimaanMap.keys())) registerCanonical(k);
  for (const k of Array.from(roMap.keys())) registerCanonical(k);

  const normStock = new Map<string, number>();
  for (const [k, v] of Array.from(initialStockMap.entries())) {
    const c = registerCanonical(k);
    if (!c) continue;
    normStock.set(c, Math.round(((normStock.get(c) || 0) + (Number(v) || 0) + Number.EPSILON) * 10000) / 10000);
  }

  const normPenerimaan = new Map<string, number>();
  for (const [k, v] of Array.from(penerimaanMap.entries())) {
    const c = registerCanonical(k);
    if (!c) continue;
    normPenerimaan.set(
      c,
      Math.round(((normPenerimaan.get(c) || 0) + (Number(v) || 0) + Number.EPSILON) * 10000) / 10000
    );
  }

  const normRo = new Map<string, number>();
  for (const [k, v] of Array.from(roMap.entries())) {
    const c = registerCanonical(k);
    if (!c) continue;
    normRo.set(c, Math.round(((normRo.get(c) || 0) + (Number(v) || 0) + Number.EPSILON) * 10000) / 10000);
  }

  const normDetails = new Map<string, any>();
  for (const [k, v] of Array.from(itemDetailsMap.entries())) {
    const c = registerCanonical(k);
    if (!c) continue;
    if (!normDetails.has(c)) {
      normDetails.set(c, { ...v });
    } else {
      const prev = normDetails.get(c);
      normDetails.set(c, { ...v, ...prev });
    }
  }

  const normSource = new Map<string, 'SO_SEBELUMNYA' | 'MASTER' | 'MANUAL'>();
  for (const [k, v] of Array.from(initialSourceMap.entries())) {
    const c = registerCanonical(k);
    if (c && !normSource.has(c)) normSource.set(c, v);
  }

  const allCodes = new Set<string>([
    ...Array.from(normStock.keys()),
    ...Array.from(normRo.keys()),
    ...Array.from(normPenerimaan.keys()),
    ...Array.from(normDetails.keys()),
  ]);

  const merged: SOItem[] = [];

  for (const code of Array.from(allCodes)) {
    if (!code) continue;

    const details = normDetails.get(code) || {};
    const stokAwal = normStock.get(code) || 0;
    const qtyPenerimaan = normPenerimaan.get(code) || 0;
    const qtyRo = normRo.get(code) || 0;

    const stokSistem = calculateSystemStock(stokAwal, qtyPenerimaan, qtyRo);

    merged.push({
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      stok_awal_sumber: normSource.get(code) || 'MASTER',
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
