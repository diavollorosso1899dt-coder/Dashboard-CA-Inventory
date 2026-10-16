import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const HEADER_KEYWORDS = [
  'no', 'cabang', 'item', 'barang', 'kode', 'sku', 'qty', 'jumlah',
  'terima', 'tanggal', 'tipe', 'seharusnya', 'satuan', 'uom', 'lokasi', 'rak'
];

/**
 * Finds the actual header row index in a 2D array of rows
 */
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

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL link spreadsheet diperlukan' }, { status: 400 });
    }

    let fetchUrl = url.trim();

    // Check if it's a Google Sheets link
    if (fetchUrl.includes('docs.google.com/spreadsheets')) {
      const matchId = fetchUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!matchId) {
        return NextResponse.json({ error: 'Format link Google Spreadsheet tidak valid' }, { status: 400 });
      }
      const sheetId = matchId[1];
      const matchGid = fetchUrl.match(/[#&?]gid=([0-9]+)/);
      const gidParam = matchGid ? `&gid=${matchGid[1]}` : '&gid=0';
      fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;
    }

    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Gagal menarik data (${res.status} ${res.statusText}). Pastikan link Spreadsheet dapat diakses publik ('Siapa saja yang memiliki link').`,
        },
        { status: 400 }
      );
    }

    const contentType = res.headers.get('content-type') || '';
    let gridRows: any[][] = [];

    if (
      contentType.includes('spreadsheet') ||
      contentType.includes('excel') ||
      fetchUrl.endsWith('.xlsx') ||
      fetchUrl.endsWith('.xls')
    ) {
      const arrayBuffer = await res.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (firstSheet) {
        gridRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: '' });
      }
    } else {
      const csvText = await res.text();
      const parsed = Papa.parse(csvText, {
        skipEmptyLines: true,
      });
      gridRows = parsed.data as any[][];
    }

    if (!gridRows || gridRows.length === 0) {
      return NextResponse.json({ error: 'Spreadsheet kosong atau tidak ada baris data' }, { status: 400 });
    }

    // Automatically locate true header row (skips title banners and empty top rows)
    const headerRowIdx = findHeaderRowIndex(gridRows);
    const rawHeaders = (gridRows[headerRowIdx] || []).map((h) => String(h || '').trim());
    const dataRows = gridRows.slice(headerRowIdx + 1);

    // Normalize keys: prioritize Column H (index 7 or 'jumlah_seharusnya') for quantity
    const normalized = dataRows
      .map((row) => {
        if (!Array.isArray(row) || row.length === 0) return null;

        let kode_barang = '';
        let nama_barang = '';
        let kategori = 'Peralatan';
        let satuan = 'PCS';
        let lokasi = 'Gudang Utama';
        let qty = 0;
        let qtyFromColH: number | null = null;
        let standardQty: number | null = null;
        let isRetur = false;

        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const rawHeader = rawHeaders[colIdx] || '';
          const cleanHeader = rawHeader
            .trim()
            .toLowerCase()
            .replace(/[\s\-_]+/g, '_')
            .replace(/[^a-z0-9_]/g, '');

          const cellVal = row[colIdx];
          if (cellVal === undefined || cellVal === null || cellVal === '') continue;
          const strVal = typeof cellVal === 'string' ? cellVal.trim() : String(cellVal);

          // Filter Retur: Check Column K (index 10) or 'catatan_tambahan', 'catatan', 'keterangan', 'status'
          if (
            colIdx === 10 ||
            cleanHeader === 'catatan_tambahan' ||
            cleanHeader === 'catatan' ||
            cleanHeader === 'keterangan' ||
            cleanHeader === 'status'
          ) {
            if (strVal.toLowerCase().includes('retur')) {
              isRetur = true;
            }
          }

          // User explicit request: Kolom H (Col index 7) or 'Jumlah Seharusnya' as receipt quantity (only if column is actually a quantity/receipt header, not an item name)
          const isColHQuantity =
            cleanHeader === 'jumlah_seharusnya' ||
            cleanHeader === 'kolom_h' ||
            cleanHeader.includes('seharusnya') ||
            (colIdx === 7 && (cleanHeader.includes('jumlah') || cleanHeader.includes('qty') || cleanHeader.includes('terima') || cleanHeader.includes('seharusnya')));

          if (isColHQuantity) {
            const parsedNum = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
            if (!isNaN(parsedNum)) {
              qtyFromColH = parsedNum;
            }
          }

          const isSku =
            ['kode', 'sku', 'kode_item', 'part_number', 'item_code', 'kode_barang', 'kode_aset', 'no_sku', 'barcode', 'id_item'].includes(cleanHeader) ||
            cleanHeader === 'no_sku' || cleanHeader === 'sku_barang' || cleanHeader === 'item_sku';

          const isItemName =
            cleanHeader === 'nama_item_barang' ||
            cleanHeader === 'nama_barang' ||
            cleanHeader === 'nama_item' ||
            cleanHeader === 'item_name' ||
            cleanHeader === 'item' ||
            cleanHeader === 'nama' ||
            cleanHeader.includes('nama_item') ||
            cleanHeader.includes('nama_barang') ||
            cleanHeader.includes('item_barang') ||
            cleanHeader.includes('gabungan') ||
            cleanHeader.includes('perlengkapan_dan_aset') ||
            cleanHeader.includes('nama_aset') ||
            ['item_yang_diajukan', 'nama_item_di_system', 'nama_aset', 'nama_produk', 'deskripsi', 'description', 'uraian', 'nama_alat', 'nama_peralatan', 'barang', 'spesifikasi_item'].includes(cleanHeader);

          const isCategory =
            ['kategori', 'category', 'klasifikasi', 'jenis', 'tipe', 'golongan', 'akun', 'pos', 'nama_akun'].includes(cleanHeader) ||
            cleanHeader.includes('kategori') || cleanHeader.includes('akun');

          const isSatuan =
            ['uom', 'unit', 'satuan', 'sat', 'satu'].includes(cleanHeader) ||
            cleanHeader.startsWith('satu');

          const isLocation =
            ['rak', 'gudang', 'lokasi', 'cabang', 'penyimpanan'].includes(cleanHeader) ||
            cleanHeader.includes('lokasi') || cleanHeader.includes('gudang');

          if (isSku) {
            if (!kode_barang) kode_barang = strVal;
          } else if (isItemName) {
            if (!nama_barang) nama_barang = strVal;
          } else if (isCategory) {
            const lower = strVal.toLowerCase();
            if (lower.includes('lengkap') || lower.includes('tetap') || lower.includes('furniture')) {
              kategori = 'Perlengkapan Tetap';
            } else if (lower.includes('alat') || lower.includes('mesin') || lower.includes('kendaraan') || lower.includes('bangunan')) {
              kategori = 'Peralatan';
            } else {
              kategori = strVal;
            }
          } else if (
            [
              'jumlah', 'kuantiti', 'quantity', 'qty', 'qty_keluar', 'qty_masuk', 'qty_ro',
              'qty_penerimaan', 'jumlah_terima', 'jumlah_kebutuhan', 'jumlah_stok', 'total_qty', 'stok_awal', 'stok'
            ].includes(cleanHeader) ||
            cleanHeader.startsWith('qty') ||
            cleanHeader.startsWith('jumlah')
          ) {
            const parsedQty = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
            if (!isNaN(parsedQty)) {
              standardQty = parsedQty;
            }
          } else if (isSatuan) {
            satuan = strVal;
          } else if (isLocation) {
            lokasi = strVal;
          }
        }

        // Apply Column H priority if present, otherwise standard Qty
        if (qtyFromColH !== null) {
          qty = qtyFromColH;
        } else if (standardQty !== null) {
          qty = standardQty;
        }

        if (!kode_barang && nama_barang) kode_barang = nama_barang;
        if (!nama_barang && kode_barang) nama_barang = kode_barang;

        // Skip items marked as Retur so they are not counted towards incoming assets
        if (isRetur) return null;

        if (!kode_barang && !nama_barang) return null;

        return {
          kode_barang,
          nama_barang,
          kategori,
          satuan,
          lokasi,
          qty,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return NextResponse.json({
      success: true,
      data: normalized,
      total: normalized.length,
      sourceUrl: url,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal memproses spreadsheet' }, { status: 500 });
  }
}
