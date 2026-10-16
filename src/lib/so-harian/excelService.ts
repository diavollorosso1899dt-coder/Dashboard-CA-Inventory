import * as XLSX from 'xlsx';
import { SOItem } from './inventoryEngine';

/**
 * Excel Parser and Template Generator Service for SO Harian
 */

const HEADER_KEYWORDS = [
  'no', 'cabang', 'item', 'barang', 'kode', 'sku', 'qty', 'jumlah',
  'terima', 'tanggal', 'tipe', 'seharusnya', 'satuan', 'uom', 'lokasi', 'rak'
];

function findHeaderRowIndex(rows: any[][]): number {
  let bestIdx = 0;
  let maxScore = -1;

  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    let score = 0;
    for (const cell of row) {
      const val = String(cell || '').trim().toLowerCase();
      if (!val) continue;
      if (HEADER_KEYWORDS.some((k) => val.includes(k))) {
        score++;
      }
    }
    if (score > maxScore && score >= 2) {
      maxScore = score;
      bestIdx = r;
    }
  }

  return bestIdx;
}

export async function parseExcelFile(fileOrBuffer: File | ArrayBuffer): Promise<any[]> {
  let arrayBuffer: ArrayBuffer;

  if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  } else {
    throw new Error('Invalid file or buffer provided to parseExcelFile');
  }

  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const gridRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!gridRows || gridRows.length === 0) return [];

  const headerRowIdx = findHeaderRowIndex(gridRows);
  const rawHeaders = (gridRows[headerRowIdx] || []).map((h) => String(h || '').trim());
  const dataRows = gridRows.slice(headerRowIdx + 1);

  return dataRows.map((row) => {
    const normalized: Record<string, any> = {};
    let qtyFromColH: number | null = null;
    let standardQty: number | null = null;
    let isRetur = false;

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const rawHeader = rawHeaders[colIdx] || '';
      const cleanKey = rawHeader
        .trim()
        .toLowerCase()
        .replace(/[\s\-_]+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      const value = row[colIdx];
      if (value === undefined || value === null || value === '') continue;
      const strVal = typeof value === 'string' ? value.trim() : String(value);

      // Filter Retur: Check Column K (index 10) or 'catatan_tambahan', 'catatan', 'keterangan', 'status'
      if (
        colIdx === 10 ||
        cleanKey === 'catatan_tambahan' ||
        cleanKey === 'catatan' ||
        cleanKey === 'keterangan' ||
        cleanKey === 'status'
      ) {
        if (strVal.toLowerCase().includes('retur')) {
          isRetur = true;
        }
      }

      // Prioritize Column H (index 7) or 'Jumlah Seharusnya'
      if (
        colIdx === 7 ||
        cleanKey === 'jumlah_seharusnya' ||
        cleanKey === 'kolom_h' ||
        cleanKey.includes('seharusnya')
      ) {
        const parsed = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
        if (!isNaN(parsed)) qtyFromColH = parsed;
      }

      const isSku =
        ['kode', 'sku', 'kode_item', 'part_number', 'item_code', 'kode_barang', 'kode_aset', 'no_sku', 'barcode', 'id_item'].includes(cleanKey) ||
        cleanKey === 'no_sku' || cleanKey === 'sku_barang' || cleanKey === 'item_sku';

      const isItemName =
        cleanKey === 'nama_item_barang' ||
        cleanKey === 'nama_barang' ||
        cleanKey === 'nama_item' ||
        cleanKey === 'item_name' ||
        cleanKey === 'item' ||
        cleanKey === 'nama' ||
        cleanKey.includes('nama_item') ||
        cleanKey.includes('nama_barang') ||
        cleanKey.includes('item_barang') ||
        ['item_yang_diajukan', 'nama_item_di_system', 'nama_aset', 'nama_produk', 'deskripsi', 'description', 'uraian', 'nama_alat', 'nama_peralatan', 'barang', 'spesifikasi_item'].includes(cleanKey);

      const isCategory =
        ['kategori', 'category', 'klasifikasi', 'jenis', 'tipe', 'golongan', 'akun', 'pos', 'nama_akun'].includes(cleanKey) ||
        cleanKey.includes('kategori') || cleanKey.includes('akun');

      const isSatuan =
        ['uom', 'unit', 'satuan', 'sat', 'satu'].includes(cleanKey) ||
        cleanKey.startsWith('satu');

      const isLocation =
        ['rak', 'gudang', 'lokasi', 'cabang', 'penyimpanan'].includes(cleanKey) ||
        cleanKey.includes('lokasi') || cleanKey.includes('gudang');

      let standardKey = cleanKey;
      if (isSku) {
        standardKey = 'kode_barang';
      } else if (isItemName) {
        standardKey = 'nama_barang';
      } else if (isCategory) {
        standardKey = 'kategori';
      } else if (isSatuan) {
        standardKey = 'satuan';
      } else if (isLocation) {
        standardKey = 'lokasi';
      } else if (
        [
          'jumlah', 'kuantiti', 'quantity', 'qty', 'qty_keluar', 'qty_masuk', 'qty_ro',
          'qty_penerimaan', 'jumlah_terima', 'jumlah_kebutuhan', 'jumlah_stok', 'total_qty', 'stok_awal', 'stok',
          'jumlah_qty', 'qty_fulfilled'
        ].includes(cleanKey) ||
        cleanKey.startsWith('qty') ||
        cleanKey.startsWith('jumlah')
      ) {
        standardKey = 'qty';
        let parsed = NaN;
        const slashMatch = strVal.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
        if (slashMatch) {
          parsed = parseFloat(slashMatch[1]);
        } else {
          parsed = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
        }
        if (!isNaN(parsed)) standardQty = parsed;
      }

      normalized[standardKey] = strVal;
    }

    if (qtyFromColH !== null) {
      normalized['qty'] = qtyFromColH;
    } else if (standardQty !== null) {
      normalized['qty'] = standardQty;
    }

    const finalName =
      normalized.nama_barang ||
      normalized.nama_item_barang ||
      normalized.nama_item ||
      normalized.item ||
      normalized.deskripsi ||
      '';

    const finalCode =
      normalized.kode_barang ||
      normalized.sku ||
      normalized.kode ||
      '';

    if (finalName) {
      normalized.nama_barang = finalName;
    }
    if (finalCode) {
      normalized.kode_barang = finalCode;
    }

    if (!normalized.kode_barang && normalized.nama_barang) {
      normalized.kode_barang = normalized.nama_barang;
    } else if (!normalized.nama_barang && normalized.kode_barang) {
      normalized.nama_barang = normalized.kode_barang;
    }

    if (normalized.kategori) {
      const lowerCat = String(normalized.kategori).toLowerCase();
      if (lowerCat.includes('lengkap') || lowerCat.includes('tetap') || lowerCat.includes('furniture')) {
        normalized.kategori = 'Perlengkapan Tetap';
      } else {
        normalized.kategori = 'Peralatan';
      }
    }

    // Skip items marked as Retur so they are not counted towards incoming assets
    if (isRetur) return null;

    return normalized;
  }).filter((r): r is NonNullable<typeof r> => r !== null && (!!r.kode_barang || !!r.nama_barang));
}

/**
 * Generates sample template (.xlsx) for user download
 * Types: 'RO' | 'PENERIMAAN' | 'STOK_AWAL_PERALATAN' | 'STOK_AWAL_PERLENGKAPAN'
 */
export function generateSampleTemplate(type: string = 'RO'): Blob {
  let headers: string[] = [];
  let sampleData: any[] = [];
  let sheetName = 'Template';

  if (type === 'RO') {
    sheetName = 'Data_RO_Harian';
    headers = ['kode_barang', 'nama_barang', 'kategori', 'satuan', 'qty', 'tanggal', 'no_ro', 'keterangan'];
    sampleData = [
      {
        kode_barang: 'PRL-001',
        nama_barang: 'Mesin Bor Portable',
        kategori: 'Peralatan',
        satuan: 'UNIT',
        qty: 2,
        tanggal: new Date().toISOString().split('T')[0],
        no_ro: 'RO-2026-001',
        keterangan: 'Peminjaman Teknisi',
      },
      {
        kode_barang: 'PLK-001',
        nama_barang: 'Kursi Kerja Ergonomis',
        kategori: 'Perlengkapan Tetap',
        satuan: 'UNIT',
        qty: 4,
        tanggal: new Date().toISOString().split('T')[0],
        no_ro: 'RO-2026-002',
        keterangan: 'Pindah ke Ruang Rapat',
      },
    ];
  } else if (type === 'PENERIMAAN') {
    sheetName = 'Data_Penerimaan_Harian';
    headers = ['kode_barang', 'nama_barang', 'kategori', 'satuan', 'qty', 'tanggal', 'no_surat_jalan', 'supplier'];
    sampleData = [
      {
        kode_barang: 'PRL-001',
        nama_barang: 'Mesin Bor Portable',
        kategori: 'Peralatan',
        satuan: 'UNIT',
        qty: 5,
        tanggal: new Date().toISOString().split('T')[0],
        no_surat_jalan: 'SJ-SUPP-8821',
        supplier: 'PT Perkakas Presisi',
      },
      {
        kode_barang: 'PLK-001',
        nama_barang: 'Kursi Kerja Ergonomis',
        kategori: 'Perlengkapan Tetap',
        satuan: 'UNIT',
        qty: 10,
        tanggal: new Date().toISOString().split('T')[0],
        no_surat_jalan: 'SJ-SUPP-8822',
        supplier: 'CV Furnitur Mandiri',
      },
    ];
  } else if (type === 'STOK_AWAL_PERLENGKAPAN') {
    sheetName = 'Stok_Awal_Perlengkapan';
    headers = ['kode_barang', 'nama_barang', 'satuan', 'stok_awal', 'lokasi', 'kategori'];
    sampleData = [
      {
        kode_barang: 'PLK-001',
        nama_barang: 'Kursi Kerja Ergonomis Staff',
        satuan: 'UNIT',
        stok_awal: 45,
        lokasi: 'Lantai 1 - Kantor',
        kategori: 'Perlengkapan Tetap',
      },
      {
        kode_barang: 'PLK-002',
        nama_barang: 'Meja Rapat Kayu Jati 3M',
        satuan: 'UNIT',
        stok_awal: 4,
        lokasi: 'Ruang Rapat Utama',
        kategori: 'Perlengkapan Tetap',
      },
      {
        kode_barang: 'PLK-003',
        nama_barang: 'Lemari Arsip Besi 4 Pintu',
        satuan: 'UNIT',
        stok_awal: 12,
        lokasi: 'Gudang Dokumen',
        kategori: 'Perlengkapan Tetap',
      },
    ];
  } else {
    sheetName = 'Stok_Awal_Peralatan';
    headers = ['kode_barang', 'nama_barang', 'satuan', 'stok_awal', 'lokasi', 'kategori'];
    sampleData = [
      {
        kode_barang: 'PRL-001',
        nama_barang: 'Mesin Bor Impact Cordless',
        satuan: 'UNIT',
        stok_awal: 15,
        lokasi: 'Rak Peralatan A-01',
        kategori: 'Peralatan',
      },
      {
        kode_barang: 'PRL-002',
        nama_barang: 'Tang Kombinasi Heavy Duty',
        satuan: 'PCS',
        stok_awal: 25,
        lokasi: 'Rak Perkakas B-03',
        kategori: 'Peralatan',
      },
      {
        kode_barang: 'PRL-003',
        nama_barang: 'Multitester Digital Fluke',
        satuan: 'UNIT',
        stok_awal: 8,
        lokasi: 'Lemari Instrumen C-02',
        kategori: 'Peralatan',
      },
    ];
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });

  worksheet['!cols'] = headers.map(() => ({ wch: 24 }));

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Exports complete SO reconciliation report to Excel (.xlsx)
 */
export function exportSoReportToExcel(session: any = {}, items: SOItem[] = []): Blob {
  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    { Informasi: 'Tanggal SO', Nilai: session.tanggal || new Date().toISOString().split('T')[0] },
    { Informasi: 'Gudang', Nilai: session.gudang || 'Gudang Utama' },
    { Informasi: 'Petugas Pemeriksa', Nilai: session.petugas || 'Petugas Gudang' },
    { Informasi: 'Waktu Cetak', Nilai: new Date().toLocaleString('id-ID') },
    { Informasi: 'Total SKU', Nilai: items.length },
    { Informasi: 'Item Match (Cocok)', Nilai: items.filter(i => i.status_selisih === 'MATCH').length },
    { Informasi: 'Item Minus (Kurang)', Nilai: items.filter(i => i.status_selisih === 'MINUS').length },
    { Informasi: 'Item Plus (Lebih)', Nilai: items.filter(i => i.status_selisih === 'PLUS').length },
    { Informasi: 'Akurasi Stok (%)', Nilai: `${session.akurasi_persen || 0}%` },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan SO');

  const detailRows = items.map((item, idx) => ({
    'No': idx + 1,
    'Kode Barang (SKU)': item.kode_barang,
    'Nama Barang': item.nama_barang,
    'Kategori': item.kategori || 'Peralatan',
    'Satuan': item.satuan,
    'Lokasi': item.lokasi || '-',
    'Stok Awal': item.stok_awal,
    'Total Masuk (+)': item.qty_penerimaan,
    'Total RO (-)': item.qty_ro,
    'Stok Sistem': item.stok_sistem,
    'Fisik SO': item.qty_fisik !== null && item.qty_fisik !== undefined ? item.qty_fisik : 'Belum Cek',
    'Selisih (Varian)': item.selisih !== null && item.selisih !== undefined ? item.selisih : '-',
    'Status': item.status_selisih,
    'Catatan / Alasan Selisih': item.catatan || '',
  }));

  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  detailSheet['!cols'] = [
    { wch: 5 },
    { wch: 18 },
    { wch: 32 },
    { wch: 20 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 35 },
  ];
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Rincian SO Harian');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Triggers file download in browser
 */
export function downloadBlob(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
