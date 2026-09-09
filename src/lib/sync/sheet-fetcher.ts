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

  const directDate = new Date(str);
  if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 2000 && directDate.getFullYear() < 2100) {
    return directDate.toISOString();
  }

  const regex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
  const match = str.match(regex);
  if (match) {
    let [, p1, p2, p3, hour, min, sec] = match;
    let year = parseInt(p3);
    if (year < 100) year += 2000;
    
    let n1 = parseInt(p1);
    let n2 = parseInt(p2);
    if (n2 > 12) {
      const temp = n1;
      n1 = n2;
      n2 = temp;
    }

    const h = hour ? parseInt(hour) : 0;
    const m = min ? parseInt(min) : 0;
    const s = sec ? parseInt(sec) : 0;

    const d = new Date(Date.UTC(year, n2 - 1, n1, h, m, s));
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
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
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AssetControlDashboard/1.0',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch spreadsheet: ${response.status} ${response.statusText}`);
  }

  return await response.text();
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

/**
 * Ingest data from Sheet JABODETABEK (gid=0)
 * Kolom G (indeks CSV 6) = NAMA OUTLET
 * Kolom I (indeks CSV 8) = ITEM YANG DIAJUKAN
 * Kolom AA (indeks CSV 26) = Terima Outlet (TRUE = Selesai / Lengkap).
 * Rentang kolom AB s/d AO (indeks CSV 27 s/d 40) TIDAK DIGUNAKAN.
 */
export async function fetchJaboData(): Promise<{ items: AssetRequest[]; rawText: string }> {
  const rawText = await fetchSheetRawCsv(JABO_URL);
  const rows = parseCsvRows(rawText);
  if (rows.length < 2) return { items: [], rawText };

  const dataRows = rows.slice(1);
  const results: AssetRequest[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const itemName = row[8]?.trim(); // Col I di CSV / Col H di Sheet: ITEM YANG DIAJUKAN (idx 8)
    if (!itemName) continue; // Skip blank template rows

    // Kolom G (idx 6): NAMA OUTLET
    let branchName = row[6]?.trim();
    if (!branchName || branchName === '-') {
      branchName = 'Tanpa Nama Outlet';
    }

    // Kolom A s/d AA (idx 1 s/d 26)
    const orderDt = parseDateTime(row[1]); // Col B di CSV / Col A di Sheet: TANGGAL ORDER USER (idx 1)
    const requesterName = row[2]?.trim() || 'Tim BusDev'; // Col C di CSV / Col B di Sheet: NAMA PENGAJUAN (idx 2)
    const requesterDivision = row[3]?.trim() || 'BusDev'; // Col D di CSV / Col C di Sheet: DIVISI PENGAJUAN (idx 3)
    const rabNumber = row[4]?.trim() || ''; // Col E di CSV / Col D di Sheet: No RAB (idx 4)
    const category = row[5]?.trim() || 'New Outlet JABO'; // Col F di CSV / Col E di Sheet: KATEGORI PENGAJUAN (idx 5)
    const classification = row[7]?.trim() || 'General'; // Col H di CSV / Col G di Sheet: KLASIFIKASI (idx 7)
    const specification = row[9]?.trim() || ''; // Col J di CSV / Col I di Sheet: SPESIFIKASI ITEM (idx 9)
    const photoUrl = row[10]?.startsWith('http') ? row[10] : null; // Col K di CSV / Col J di Sheet: FOTO ITEM (idx 10)
    const quantityNeeded = parseInt(row[11]) || 1; // Col L di CSV / Col K di Sheet: JUMLAH KEBUTUHAN (idx 11)
    const rabLink = row[12]?.trim() || ''; // Col M di CSV / Col L di Sheet: LINK RAB (idx 12)
    const rabPrice = parseCurrency(row[13]); // Col N di CSV / Col M di Sheet: Harga (RAB) (idx 13)
    const rabTotal = parseCurrency(row[14]) || rabPrice * quantityNeeded; // Col O di CSV / Col N di Sheet: Total (idx 14)
    const accKadiv = String(row[15]).toLowerCase() === 'true'; // Col P di CSV / Col O di Sheet: ACC KADIV PENGAJUAN (idx 15)
    const systemItemName = row[17]?.trim() || itemName; // Col R di CSV / Col Q di Sheet: NAMA ITEM DI SYSTEM (idx 17)
    const quantityStock = parseInt(row[18]) || 0; // Col S di CSV / Col R di Sheet: JUMLAH STOK (idx 18)
    const quantityPr = parseInt(row[19]) || 0; // Col T di CSV / Col S di Sheet: JUMLAH PR (idx 19)
    const prDt = parseDateTime(row[20]); // Col U di CSV / Col T di Sheet: Waktu PR (idx 20)
    const openingDt = parseDateOnly(row[21]); // Col V di CSV / Col U di Sheet: Tanggal Opening Outlet (idx 21)
    const stockStatus = row[22]?.trim() || (quantityStock > 0 ? 'Ready (Spek Sesuai)' : 'Not Ready (Stok Kosong)'); // Col W di CSV / Col V di Sheet: STATUS STOK ITEM (idx 22)
    const isDirectShipment = String(row[25]).toLowerCase() === 'true'; // Col Z di CSV / Col Y di Sheet: Pengiriman Aset (idx 25)
    const isReceivedAtOutlet = String(row[26]).toLowerCase() === 'true'; // Col AA di CSV & Sheet: Terima Outlet (idx 26)

    const agingDays = calculateAgingDays(orderDt, null);

    // KETENTUAN STATUS BARANG:
    // 1. Jika Kolom AA (Terima Outlet) = TRUE -> Status Selesai / Lengkap
    // 2. Jika Kolom Y (Pengiriman Aset) = TRUE -> Status Dalam Pengiriman / Ready SCGA
    // 3. Jika Stok Gudang >= Kebutuhan -> Status Ready Gudang SCGA
    // 4. Jika Stok Gudang > 0 -> Status Diterima Sebagian
    // 5. Lainnya -> Status On Proses PR
    let initialDeliveryStatus = 'On Proses PR';
    if (isReceivedAtOutlet) {
      initialDeliveryStatus = 'Lengkap';
    } else if (isDirectShipment) {
      initialDeliveryStatus = 'Dalam Pengiriman (SCGA)';
    } else if (quantityStock >= quantityNeeded && quantityNeeded > 0) {
      initialDeliveryStatus = 'Ready Gudang SCGA';
    } else if (quantityStock > 0) {
      initialDeliveryStatus = 'Diterima Sebagian';
    }

    const req: AssetRequest = {
      id: `jabo-${i + 2}`,
      external_id: `JABO-ROW-${i + 2}`,
      region: 'JABODETABEK',
      sheet_row_index: i + 2,

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

      po_date: null,

      order_type: 'OFFLINE',
      initial_price: 0,
      deal_price: 0,
      vendor_name: '',
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

    results.push(req);
  }

  return { items: results, rawText };
}

/**
 * Ingest data from Sheet KALBAR (gid=1713589401)
 * Kolom G (indeks CSV 6) = NAMA OUTLET
 * Kolom H (indeks CSV 7) = ITEM YANG DIAJUKAN
 * Kolom W (indeks CSV 22) = Terima Outlet / Divisi (TRUE = Selesai / Lengkap).
 * Rentang kolom X s/d AM (indeks CSV 23 s/d 38) TIDAK DIGUNAKAN.
 */
export async function fetchKalbarData(): Promise<{ items: AssetRequest[]; rawText: string }> {
  const rawText = await fetchSheetRawCsv(KALBAR_URL);
  const rows = parseCsvRows(rawText);
  if (rows.length < 2) return { items: [], rawText };

  const dataRows = rows.slice(1);
  const results: AssetRequest[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const itemName = row[7]?.trim(); // Col H di CSV / Col G di Sheet: Item (idx 7)
    if (!itemName) continue;

    // Kolom G (idx 6): NAMA OUTLET
    let branchName = row[6]?.trim();
    if (!branchName || branchName === '-') {
      branchName = 'Tanpa Nama Outlet';
    }

    // Kolom A s/d W (idx 1 s/d 22)
    const orderDt = parseDateTime(row[1]); // Col B di CSV / Col A di Sheet: Tgl Pengajuan (idx 1)
    const requesterName = row[2]?.trim() || 'Tim BusDev'; // Col C di CSV / Col B di Sheet: Nama (idx 2)
    const requesterDivision = row[3]?.trim() || 'BusDev'; // Col D di CSV / Col C di Sheet: Divisi (idx 3)
    const category = row[4]?.trim() || 'New Brand KALBAR'; // Col E di CSV / Col D di Sheet: kategori (idx 4)
    const rabNumber = row[5]?.trim() || ''; // Col F di CSV / Col E di Sheet: No RAB (idx 5)
    const classification = row[8]?.trim() || 'ASET'; // Col I di CSV / Col H di Sheet: Klasifikasi (idx 8)
    const specification = row[9]?.trim() || ''; // Col J di CSV / Col I di Sheet: Spesifikasi (idx 9)
    const photoUrl = row[10]?.startsWith('http') ? row[10] : null; // Col K di CSV / Col J di Sheet: Foto Item (idx 10)
    const quantityNeeded = parseInt(row[11]) || 1; // Col L di CSV / Col K di Sheet: Jumlah Kebutuhan (idx 11)
    const rabPrice = parseCurrency(row[12]); // Col M di CSV / Col L di Sheet: Harga (RAB) (idx 12)
    const rabTotal = parseCurrency(row[13]) || rabPrice * quantityNeeded; // Col N di CSV / Col M di Sheet: Total (idx 13)
    const accKadiv = String(row[14]).toLowerCase() === 'true'; // Col O di CSV / Col N di Sheet: ACC Kadiv (idx 14)
    const stockStatus = row[15]?.trim() || 'Not Ready (Stok Kosong)'; // Col P di CSV / Col O di Sheet: Status Stok (idx 15)
    const quantityStock = parseInt(row[16]) || 0; // Col Q di CSV / Col P di Sheet: Jumlah Stok (idx 16)
    const quantityPr = parseInt(row[17]) || 0; // Col R di CSV / Col Q di Sheet: Jumlah PR (idx 17)
    const systemItemName = row[18]?.trim() || itemName; // Col S di CSV / Col R di Sheet: Spesifikasi terupdate / System item (idx 18)
    const prDt = parseDateTime(row[19]); // Col T di CSV / Col S di Sheet: Tanggal PR (idx 19)
    const isDirectShipment = String(row[21]).toLowerCase() === 'true'; // Col V di CSV / Col U di Sheet: Pengiriman Aset (idx 21)
    const isReceivedAtOutlet = String(row[22]).toLowerCase() === 'true'; // Col W di CSV / Col V di Sheet: Terima Outlet / Divisi (idx 22)

    const agingDays = calculateAgingDays(orderDt, null);

    let initialDeliveryStatus = 'On Proses PR';
    if (isReceivedAtOutlet) {
      initialDeliveryStatus = 'Lengkap';
    } else if (isDirectShipment) {
      initialDeliveryStatus = 'Dalam Pengiriman (SCGA)';
    } else if (quantityStock >= quantityNeeded && quantityNeeded > 0) {
      initialDeliveryStatus = 'Ready Gudang SCGA';
    } else if (quantityStock > 0) {
      initialDeliveryStatus = 'Diterima Sebagian';
    }

    const req: AssetRequest = {
      id: `kalbar-${i + 2}`,
      external_id: `KALBAR-ROW-${i + 2}`,
      region: 'KALBAR',
      sheet_row_index: i + 2,

      order_datetime: orderDt,
      requester_name: requesterName,
      requester_division: requesterDivision,
      category: category,
      rab_number: rabNumber,
      rab_link: '',
      branch_name: branchName,
      item_name: itemName,
      classification: classification,
      specification: specification,
      photo_url: photoUrl,
      quantity_needed: quantityNeeded,

      rab_price: rabPrice,
      rab_total: rabTotal,
      acc_kadiv_request: accKadiv,

      stock_status: stockStatus,
      quantity_stock_allocated: quantityStock,
      quantity_pr: quantityPr,
      system_item_name: systemItemName,
      pr_datetime: prDt,
      opening_date: null,
      is_direct_shipment: isDirectShipment,

      po_date: null,

      vendor_name: '',
      order_type: 'OFFLINE',
      initial_price: 0,
      deal_price: 0,
      realized_price: 0,
      negotiation_proof: null,
      acc_kadiv_procurement: false,
      procurement_status: isReceivedAtOutlet || quantityStock >= quantityNeeded ? 'selesai' : 'proses',
      item_delivery_status: initialDeliveryStatus,
      pic_receiver: '',
      notes: '',
      received_date: isReceivedAtOutlet ? new Date().toISOString() : null,
      lead_time_days: agingDays,

      is_manually_edited: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    results.push(req);
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
