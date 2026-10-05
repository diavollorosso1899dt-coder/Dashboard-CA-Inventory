import Papa from 'papaparse';
import { AssetRequest } from '../supabase/types';

const JABO_URL = process.env.GOOGLE_SHEET_JABO_URL || 'https://docs.google.com/spreadsheets/d/1j2gO8I1I-93cvbR5zHZTg87xImqL-99tv3jiIzP-n_o/export?format=csv&gid=0';
const KALBAR_URL = process.env.GOOGLE_SHEET_KALBAR_URL || 'https://docs.google.com/spreadsheets/d/1j2gO8I1I-93cvbR5zHZTg87xImqL-99tv3jiIzP-n_o/export?format=csv&gid=1713589401';

/**
 * Fast checksum string helper
 */
export function computeStringHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Clean currency string like " Rp. 450.000 " or "Rp5.000" or "450.000" into number
 */
function parseCurrency(val: any): number {
  if (!val) return 0;
  let str = String(val).trim();
  if (str === '-' || str === 'Rp -' || str === 'Rp. -' || str === '#REF!' || str.toLowerCase() === 'true' || str.toLowerCase() === 'false') {
    return 0;
  }
  str = str.replace(/rp\.?/gi, '').trim();
  str = str.replace(/\./g, '').replace(/,/g, '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse Indonesian / Excel dates into ISO string
 * Examples: "10/24/2025 11:09:57", "03/11/25 15:12:01", "04/03/2026", "9/10/2025 13:53:56"
 */
function parseDateTime(val: any): string | null {
  if (!val) return null;
  const str = String(val).trim();
  if (
    !str ||
    str === '-' ||
    str.includes('1899') ||
    str.includes('1900') ||
    str.startsWith('30/12/99') ||
    str.startsWith('12/30/1899')
  ) {
    return null;
  }

  // 1. First priority: DD/MM/YYYY, DD-MM-YYYY, or MM/DD/YYYY
  const regex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
  const match = str.match(regex);
  if (match) {
    let [, p1, p2, p3, hour, min, sec] = match;
    let year = parseInt(p3, 10);
    if (year < 100) year += 2000;
    
    let n1 = parseInt(p1, 10);
    let n2 = parseInt(p2, 10);
    let day = n1;
    let month = n2;

    // If second number > 12, it is impossible for it to be a month, so it's MM/DD/YYYY (e.g. 10/24/2025)
    if (n2 > 12) {
      month = n1;
      day = n2;
    } else {
      // Standard Indonesian date: Day is ALWAYS first (n1 = Day, n2 = Month)
      // Handles 11-09-2026, 12/01/2026, 7/9/2026, 22-06-2026, etc.
      day = n1;
      month = n2;
    }

    const h = hour ? parseInt(hour, 10) : 0;
    const m = min ? parseInt(min, 10) : 0;
    const s = sec ? parseInt(sec, 10) : 0;

    const d = new Date(Date.UTC(year, month - 1, day, h, m, s));
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  // 2. Second priority: YYYY-MM-DD
  const ymdRegex = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
  const ymdMatch = str.match(ymdRegex);
  if (ymdMatch) {
    const [, y, m, d, hour, min, sec] = ymdMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    const h = hour ? parseInt(hour, 10) : 0;
    const minVal = min ? parseInt(min, 10) : 0;
    const s = sec ? parseInt(sec, 10) : 0;

    const dateObj = new Date(Date.UTC(year, month - 1, day, h, minVal, s));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString();
    }
  }

  // 3. Fallback to direct Date parse only if it did not match regex
  const directDate = new Date(str);
  if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 2000 && directDate.getFullYear() < 2100) {
    return directDate.toISOString();
  }

  return null;
}

/**
 * Format Opening / PO Date as YYYY-MM-DD
 */
function parseDateOnly(val: any): string | null {
  const iso = parseDateTime(val);
  return iso ? iso.split('T')[0] : null;
}

/**
 * Calculate duration / aging in days from order datetime
 */
function calculateAgingDays(orderDt: string | null, receivedDt: string | null): number {
  if (!orderDt) return 0;
  const start = new Date(orderDt).getTime();
  const end = receivedDt ? new Date(receivedDt).getTime() : Date.now();
  if (!isNaN(start) && end >= start) {
    return Math.round(((end - start) / (1000 * 60 * 60 * 24)) * 10) / 10;
  }
  return 0;
}

/**
 * Fetch raw CSV text from Google Sheet
 */
async function fetchSheetRawCsv(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AssetControlDashboard/1.0',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch spreadsheet: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse CSV text into array rows
 */
function parseCsvRows(csvText: string): string[][] {
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: true,
  });
  return parsed.data;
}

interface SheetColumnMap {
  orderDt?: number;
  requesterName?: number;
  requesterDivision?: number;
  rabNumber?: number;
  category?: number;
  branchName?: number;
  classification?: number;
  itemName?: number;
  specification?: number;
  photoUrl?: number;
  quantityNeeded?: number;
  rabLink?: number;
  rabPrice?: number;
  rabTotal?: number;
  accKadiv?: number;
  systemItemName?: number;
  quantityStock?: number;
  quantityPr?: number;
  prDt?: number;
  openingDt?: number;
  stockStatus?: number;
  isDirectShipment?: number;
  isReceivedAtOutlet?: number;
  poDate?: number;
  vendorName?: number;
}

/**
 * Dynamically discover column indexes based on header row names
 * Prevents errors from shifted/missing columns in Google Sheets
 */
export function createColumnMap(headerRow: string[]): SheetColumnMap {
  const colMap: SheetColumnMap = {};
  headerRow.forEach((col, idx) => {
    const raw = col.trim().toLowerCase();
    if (!raw) return;
    if (raw.includes('terima outlet')) {
      colMap.isReceivedAtOutlet = idx;
    } else if (raw === 'divisi' || raw.includes('divisi pengajuan')) {
      colMap.requesterDivision = idx;
    } else if (raw.includes('tanggal order') || raw.includes('tgl pengajuan')) {
      colMap.orderDt = idx;
    } else if (raw.includes('nama pengajuan') || raw === 'nama') {
      colMap.requesterName = idx;
    } else if (raw.includes('rab') && raw.includes('no')) {
      colMap.rabNumber = idx;
    } else if (raw.includes('kategori')) {
      colMap.category = idx;
    } else if (raw.includes('cabang')) {
      colMap.branchName = idx;
    } else if (raw.includes('klasifikasi')) {
      colMap.classification = idx;
    } else if (raw.includes('item yang diajukan') || raw === 'item') {
      colMap.itemName = idx;
    } else if (raw.includes('spesifikasi terupdate') || raw.includes('di system')) {
      colMap.systemItemName = idx;
    } else if (raw.includes('spesifikasi item') || raw === 'spesifikasi') {
      colMap.specification = idx;
    } else if (raw.includes('foto item') || raw.includes('foto')) {
      colMap.photoUrl = idx;
    } else if (raw.includes('kebutuhan')) {
      colMap.quantityNeeded = idx;
    } else if (raw.includes('link rab')) {
      colMap.rabLink = idx;
    } else if (raw.includes('harga (rab)') || raw.includes('harga rab')) {
      colMap.rabPrice = idx;
    } else if (raw === 'total' || raw.includes('total')) {
      if (colMap.rabTotal === undefined) colMap.rabTotal = idx;
    } else if (raw.includes('acc kadiv')) {
      colMap.accKadiv = idx;
    } else if (raw.includes('jumlah stok')) {
      colMap.quantityStock = idx;
    } else if (raw.includes('jumlah pr')) {
      colMap.quantityPr = idx;
    } else if (raw.includes('waktu pr') || raw.includes('tanggal pr') || raw.includes('tgl pr')) {
      colMap.prDt = idx;
    } else if (raw.includes('opening')) {
      colMap.openingDt = idx;
    } else if (raw.includes('status stok')) {
      colMap.stockStatus = idx;
    } else if (raw.includes('pengiriman aset')) {
      colMap.isDirectShipment = idx;
    } else if (raw.includes('vendor')) {
      colMap.vendorName = idx;
    } else if (raw.includes('tgl po') || raw.includes('tanggal po')) {
      colMap.poDate = idx;
    }
  });
  return colMap;
}

/**
 * Universal row parser using the dynamic column map
 */
function parseRowWithMap(
  row: string[],
  colMap: SheetColumnMap,
  region: 'JABODETABEK' | 'KALBAR',
  rowIndex: number
): AssetRequest | null {
  const rawItem = (colMap.itemName !== undefined ? row[colMap.itemName] : '')?.trim();
  const rawSysItem = (colMap.systemItemName !== undefined ? row[colMap.systemItemName] : '')?.trim();
  const rawSpec = (colMap.specification !== undefined ? row[colMap.specification] : '')?.trim();
  
  // Fallback to system item name or spec if user left the ITEM column empty
  const itemName = rawItem || rawSysItem || rawSpec;
  if (!itemName) return null; // Skip truly blank template rows

  let branchName = (colMap.branchName !== undefined ? row[colMap.branchName] : '')?.trim();
  if (!branchName || branchName === '-') {
    branchName = 'Tanpa Nama Outlet';
  }

  const orderDtRaw = colMap.orderDt !== undefined ? row[colMap.orderDt] : null;
  const orderDt = parseDateTime(orderDtRaw);

  const requesterName = (colMap.requesterName !== undefined ? row[colMap.requesterName] : '')?.trim() || 'Tim BusDev';
  const requesterDivision = (colMap.requesterDivision !== undefined ? row[colMap.requesterDivision] : '')?.trim() || 'BusDev';
  const rabNumber = (colMap.rabNumber !== undefined ? row[colMap.rabNumber] : '')?.trim() || '';
  const category = (colMap.category !== undefined ? row[colMap.category] : '')?.trim() || (region === 'KALBAR' ? 'New Brand KALBAR' : 'New Outlet JABO');
  const classification = (colMap.classification !== undefined ? row[colMap.classification] : '')?.trim() || (region === 'KALBAR' ? 'ASET' : 'General');
  const specification = (colMap.specification !== undefined ? row[colMap.specification] : '')?.trim() || '';
  const photoUrlRaw = (colMap.photoUrl !== undefined ? row[colMap.photoUrl] : '')?.trim();
  const photoUrl = photoUrlRaw && photoUrlRaw.startsWith('http') ? photoUrlRaw : null;

  const quantityNeeded = (colMap.quantityNeeded !== undefined ? parseInt(row[colMap.quantityNeeded]) : 0) || 1;
  const rabLink = (colMap.rabLink !== undefined ? row[colMap.rabLink] : '')?.trim() || '';
  const rabPrice = colMap.rabPrice !== undefined ? parseCurrency(row[colMap.rabPrice]) : 0;
  const rabTotal = (colMap.rabTotal !== undefined ? parseCurrency(row[colMap.rabTotal]) : 0) || rabPrice * quantityNeeded;
  const accKadiv = colMap.accKadiv !== undefined ? String(row[colMap.accKadiv]).toLowerCase() === 'true' : false;

  const systemItemName = (colMap.systemItemName !== undefined ? row[colMap.systemItemName] : '')?.trim() || itemName;
  const quantityStock = (colMap.quantityStock !== undefined ? parseInt(row[colMap.quantityStock]) : 0) || 0;
  const quantityPr = (colMap.quantityPr !== undefined ? parseInt(row[colMap.quantityPr]) : 0) || 0;
  const prDt = colMap.prDt !== undefined ? parseDateTime(row[colMap.prDt]) : null;
  const openingDt = colMap.openingDt !== undefined ? parseDateOnly(row[colMap.openingDt]) : null;
  const stockStatus = (colMap.stockStatus !== undefined ? row[colMap.stockStatus] : '')?.trim() || (quantityStock > 0 ? 'Ready (Spek Sesuai)' : 'Not Ready (Stok Kosong)');
  const isDirectShipment = colMap.isDirectShipment !== undefined ? String(row[colMap.isDirectShipment]).toLowerCase() === 'true' : false;
  const isReceivedAtOutlet = colMap.isReceivedAtOutlet !== undefined ? String(row[colMap.isReceivedAtOutlet]).toLowerCase() === 'true' : false;
  const poDate = colMap.poDate !== undefined ? parseDateOnly(row[colMap.poDate]) : null;
  const vendorName = (colMap.vendorName !== undefined ? row[colMap.vendorName] : '')?.trim() || '';

  const agingDays = calculateAgingDays(orderDt, null);

  // KETENTUAN STATUS BARANG SESUAI STANDAR SHEET:
  // 1. Jika Kolom Terima Outlet = TRUE -> Status Terima Outlet
  // 2. Jika Kolom Pengiriman Aset = TRUE -> Status Dalam Pengiriman (SCGA)
  // 3. Jika Stok Gudang >= Kebutuhan -> Status Ready Gudang SCGA
  // 4. Jika Stok Gudang > 0 -> Status Diterima Sebagian
  // 5. Lainnya -> Status On Proses PR
  let initialDeliveryStatus = 'On Proses PR';
  if (isReceivedAtOutlet) {
    initialDeliveryStatus = 'Terima Outlet';
  } else if (isDirectShipment) {
    initialDeliveryStatus = 'Dalam Pengiriman (SCGA)';
  } else if (quantityStock >= quantityNeeded && quantityNeeded > 0) {
    initialDeliveryStatus = 'Ready Gudang SCGA';
  } else if (quantityStock > 0) {
    initialDeliveryStatus = 'Diterima Sebagian';
  }

  const prefix = region === 'KALBAR' ? 'kalbar' : 'jabo';
  const extPrefix = region === 'KALBAR' ? 'KALBAR' : 'JABO';

  return {
    id: `${prefix}-${rowIndex}`,
    external_id: `${extPrefix}-ROW-${rowIndex}`,
    region: region,
    sheet_row_index: rowIndex,

    order_datetime: orderDt,
    requester_name: requesterName,
    requester_division: requesterDivision,
    rab_number: rabNumber,
    category: category,
    branch_name: branchName,
    classification: classification,
    item_name: itemName,
    specification: specification,
    photo_url: photoUrl,
    quantity_needed: quantityNeeded,

    rab_link: rabLink,
    rab_price: rabPrice,
    rab_total: rabTotal,
    acc_kadiv_request: accKadiv,

    system_item_name: systemItemName,
    quantity_stock_allocated: quantityStock,
    quantity_pr: quantityPr,
    pr_datetime: prDt,
    opening_date: openingDt,
    stock_status: stockStatus,
    is_direct_shipment: isDirectShipment,

    po_date: poDate,

    order_type: 'OFFLINE',
    initial_price: 0,
    deal_price: 0,
    vendor_name: vendorName,
    negotiation_proof: null,
    realized_price: 0,
    acc_kadiv_procurement: false,
    procurement_status: isReceivedAtOutlet || quantityStock >= quantityNeeded ? 'selesai' : 'proses',
    item_delivery_status: initialDeliveryStatus,
    received_date: isReceivedAtOutlet ? new Date().toISOString() : null,
    lead_time_days: agingDays,
    pic_receiver: '',
    notes: '',

    is_manually_edited: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Ingest data from Sheet JABODETABEK (gid=0) with dynamic header mapping
 */
export async function fetchJaboData(): Promise<{ items: AssetRequest[]; rawText: string }> {
  const rawText = await fetchSheetRawCsv(JABO_URL);
  const rows = parseCsvRows(rawText);
  if (rows.length < 2) return { items: [], rawText };

  const colMap = createColumnMap(rows[0]);
  const dataRows = rows.slice(1);
  const results: AssetRequest[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const req = parseRowWithMap(dataRows[i], colMap, 'JABODETABEK', i + 2);
    if (req) results.push(req);
  }

  return { items: results, rawText };
}

/**
 * Ingest data from Sheet KALBAR (gid=1713589401) with dynamic header mapping
 */
export async function fetchKalbarData(): Promise<{ items: AssetRequest[]; rawText: string }> {
  const rawText = await fetchSheetRawCsv(KALBAR_URL);
  const rows = parseCsvRows(rawText);
  if (rows.length < 2) return { items: [], rawText };

  const colMap = createColumnMap(rows[0]);
  const dataRows = rows.slice(1);
  const results: AssetRequest[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const req = parseRowWithMap(dataRows[i], colMap, 'KALBAR', i + 2);
    if (req) results.push(req);
  }

  return { items: results, rawText };
}

/**
 * Fetch all data combined from both Google Sheets with checksum hash
 */
export async function fetchAllSheetsData(): Promise<{
  items: AssetRequest[];
  stats: { jaboCount: number; kalbarCount: number; totalCount: number };
  contentHash: string;
}> {
  const [jaboRes, kalbarRes] = await Promise.all([
    fetchJaboData().catch((err) => {
      console.error('Error fetching JABO sheet:', err);
      return { items: [] as AssetRequest[], rawText: '' };
    }),
    fetchKalbarData().catch((err) => {
      console.error('Error fetching KALBAR sheet:', err);
      return { items: [] as AssetRequest[], rawText: '' };
    }),
  ]);

  const combined = [...jaboRes.items, ...kalbarRes.items];
  const contentHash = computeStringHash(jaboRes.rawText + '::' + kalbarRes.rawText);

  return {
    items: combined,
    stats: {
      jaboCount: jaboRes.items.length,
      kalbarCount: kalbarRes.items.length,
      totalCount: combined.length,
    },
    contentHash,
  };
}
