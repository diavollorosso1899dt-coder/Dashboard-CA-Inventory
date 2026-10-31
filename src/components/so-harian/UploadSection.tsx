'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload,
  Download,
  FileCheck,
  Eye,
  Trash2,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Package,
  Wrench,
  Armchair,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  Globe,
  FileSpreadsheet,
  RefreshCw,
  Truck,
  Sparkles,
} from 'lucide-react';
import { parseExcelFile, generateSampleTemplate, downloadBlob } from '@/lib/so-harian/excelService';
import { aggregateTransactions, mergeDailyInventory, SOItem } from '@/lib/so-harian/inventoryEngine';
import {
  buildCarryForwardEntries,
  CarryForwardEntry,
  mergeOpeningStock,
  OpeningStockDetail,
} from '@/lib/so-harian/rollover';
import DataPreviewModal from './DataPreviewModal';

interface UploadSectionProps {
  onCompilationSuccess: (compiledItems: SOItem[], metadata: any) => void;
  previousSessionStock?: Map<string, number>;
  previousSessionItems?: SOItem[];
  previousSessionDate?: string | null;
  previousSessionStatus?: string | null;
}

// Default permanent URLs from ENV with reliable fallbacks
const DEFAULT_SHEET_URLS: Record<string, string> = {
  RO: '',
  PENERIMAAN:
    process.env.NEXT_PUBLIC_SO_SHEET_PENERIMAAN_URL ||
    'https://docs.google.com/spreadsheets/d/1neWHHRIjYm3Q4gsoV6Id258jcj5QvOFwhS84PMJL0lE/edit?gid=352107216#gid=352107216',
  PERALATAN:
    process.env.NEXT_PUBLIC_SO_SHEET_PERALATAN_URL ||
    'https://docs.google.com/spreadsheets/d/1fiRhYHPDgSadKIDLlnqyD9K-ZBXg2_3vlyqI-4jdNfc/edit?gid=1727080084#gid=1727080084',
  PERLENGKAPAN:
    process.env.NEXT_PUBLIC_SO_SHEET_PERLENGKAPAN_URL ||
    'https://docs.google.com/spreadsheets/d/1fiRhYHPDgSadKIDLlnqyD9K-ZBXg2_3vlyqI-4jdNfc/edit?gid=1129207194#gid=1129207194',
};

export default function UploadSection({
  onCompilationSuccess,
  previousSessionStock = new Map(),
  previousSessionItems = [],
  previousSessionDate = null,
  previousSessionStatus = null,
}: UploadSectionProps) {
  // Input Modes: 'MONITORING_SLA' | 'PR_READY_STOCK' | 'INTERNAL_SJ' | 'FILE' | 'LINK'
  // Default to MONITORING_SLA for RO and PR_READY_STOCK for PENERIMAAN!
  const [inputModes, setInputModes] = useState<
    Record<string, 'MONITORING_SLA' | 'PR_READY_STOCK' | 'INTERNAL_SJ' | 'FILE' | 'LINK'>
  >({
    RO: 'MONITORING_SLA',
    PENERIMAAN: 'PR_READY_STOCK',
    PERALATAN: 'LINK',
    PERLENGKAPAN: 'LINK',
  });

  // Monitoring SLA Filter Options (Jumlah QTY Monitoring SLA sebagai sumber RO)
  const [slaFilterMode, setSlaFilterMode] = useState<'fulfilled' | 'received' | 'all'>('fulfilled');
  const [isSlaLoading, setIsSlaLoading] = useState(false);
  const [isPrReadyLoading, setIsPrReadyLoading] = useState(false);

  // Surat Jalan Filter Options
  const [sjFilterStatus, setSjFilterStatus] = useState<'DELIVERED' | 'ALL_OUT'>('DELIVERED');
  const [isSjLoading, setIsSjLoading] = useState(false);

  // Sheet URLs for LINK mode with localStorage persistence (no need to re-paste every time app opens)
  const [sheetUrls, setSheetUrls] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('so_sheet_urls');
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            RO: parsed.RO ?? DEFAULT_SHEET_URLS.RO,
            PENERIMAAN: parsed.PENERIMAAN || DEFAULT_SHEET_URLS.PENERIMAAN,
            PERALATAN: parsed.PERALATAN || DEFAULT_SHEET_URLS.PERALATAN,
            PERLENGKAPAN: parsed.PERLENGKAPAN || DEFAULT_SHEET_URLS.PERLENGKAPAN,
          };
        }
      } catch (e) {
        // fallback
      }
    }
    return DEFAULT_SHEET_URLS;
  });

  const updateSheetUrl = (type: string, url: string) => {
    setSheetUrls((prev) => {
      const updated = { ...prev, [type]: url };
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('so_sheet_urls', JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });
  };

  const resetToDefaultUrl = (type: string) => {
    const defaultUrl = DEFAULT_SHEET_URLS[type] || '';
    updateSheetUrl(type, defaultUrl);
  };

  const [isUrlLoading, setIsUrlLoading] = useState<Record<string, boolean>>({});

  // RO State
  const [roFile, setRoFile] = useState<File | null>(null);
  const [roData, setRoData] = useState<any[]>([]);
  const [isRoLoading, setIsRoLoading] = useState(false);

  // Penerimaan State
  const [penerimaanFile, setPenerimaanFile] = useState<File | null>(null);
  const [penerimaanData, setPenerimaanData] = useState<any[]>([]);
  const [isPenerimaanLoading, setIsPenerimaanLoading] = useState(false);

  // Stok Awal PERALATAN State
  const [stokPeralatanFile, setStokPeralatanFile] = useState<File | null>(null);
  const [stokPeralatanData, setStokPeralatanData] = useState<any[]>([]);

  // Stok Awal PERLENGKAPAN TETAP State
  const [stokPerlengkapanFile, setStokPerlengkapanFile] = useState<File | null>(null);
  const [stokPerlengkapanData, setStokPerlengkapanData] = useState<any[]>([]);

  // Sumber stok awal: hasil SO hari sebelumnya (default) atau reset ke master.
  // Master spreadsheet hanya jadi acuan pertama / saat reset.
  const carryForwardMap = useMemo(() => {
    const fromItems = buildCarryForwardEntries(previousSessionItems || []);
    if (fromItems.size > 0) return fromItems;

    const fallback = new Map<string, CarryForwardEntry>();
    for (const [code, qty] of Array.from(previousSessionStock.entries())) {
      fallback.set(code, {
        kode_barang: code,
        nama_barang: code,
        kategori: 'Peralatan',
        satuan: 'PCS',
        lokasi: 'Gudang Utama',
        qty,
        counted: true,
      });
    }
    return fallback;
  }, [previousSessionItems, previousSessionStock]);

  const carryForwardCounted = useMemo(
    () => Array.from(carryForwardMap.values()).filter((entry) => entry.counted).length,
    [carryForwardMap]
  );

  const [openingSourceMode, setOpeningSourceMode] = useState<'SO_SEBELUMNYA' | 'MASTER'>('MASTER');
  const openingSourceTouched = useRef(false);

  useEffect(() => {
    // Otomatis pakai hasil SO sebelumnya begitu data tersedia, kecuali user
    // sudah memilih sumber lain secara manual.
    if (!openingSourceTouched.current && carryForwardMap.size > 0) {
      setOpeningSourceMode('SO_SEBELUMNYA');
    }
  }, [carryForwardMap.size]);

  const chooseOpeningSource = (mode: 'SO_SEBELUMNYA' | 'MASTER') => {
    openingSourceTouched.current = true;
    setOpeningSourceMode(mode);
  };

  const [previewModal, setPreviewModal] = useState<{ isOpen: boolean; title: string; data: any[] }>({
    isOpen: false,
    title: '',
    data: [],
  });
  const [errorMessage, setErrorMessage] = useState('');

  const roInputRef = useRef<HTMLInputElement>(null);
  const penerimaanInputRef = useRef<HTMLInputElement>(null);
  const peralatanInputRef = useRef<HTMLInputElement>(null);
  const perlengkapanInputRef = useRef<HTMLInputElement>(null);

  const setMode = (
    type: string,
    mode: 'MONITORING_SLA' | 'PR_READY_STOCK' | 'INTERNAL_SJ' | 'FILE' | 'LINK'
  ) => {
    setInputModes((prev) => ({ ...prev, [type]: mode }));
  };

  const handleUpload = async (file: File | undefined, type: string) => {
    if (!file) return;
    setErrorMessage('');

    try {
      if (type === 'RO') {
        setIsRoLoading(true);
        const parsed = await parseExcelFile(file);
        if (parsed.length === 0) throw new Error('File RO kosong atau format kolom tidak sesuai');
        setRoFile(file);
        setRoData(parsed);
      } else if (type === 'PENERIMAAN') {
        setIsPenerimaanLoading(true);
        const parsed = await parseExcelFile(file);
        if (parsed.length === 0) throw new Error('File Penerimaan kosong atau format kolom tidak sesuai');
        setPenerimaanFile(file);
        setPenerimaanData(parsed);
      } else if (type === 'PERALATAN') {
        const parsed = await parseExcelFile(file);
        if (parsed.length === 0) throw new Error('File Stok Awal Peralatan kosong atau format kolom tidak sesuai');
        setStokPeralatanFile(file);
        setStokPeralatanData(parsed);
      } else if (type === 'PERLENGKAPAN') {
        const parsed = await parseExcelFile(file);
        if (parsed.length === 0) throw new Error('File Stok Awal Perlengkapan Tetap kosong atau format kolom tidak sesuai');
        setStokPerlengkapanFile(file);
        setStokPerlengkapanData(parsed);
      }
    } catch (err: any) {
      setErrorMessage(`Gagal membaca file: ${err.message}`);
    } finally {
      setIsRoLoading(false);
      setIsPenerimaanLoading(false);
    }
  };

  const handleFetchFromLink = async (type: string) => {
    const url = sheetUrls[type];
    if (!url || !url.trim()) {
      setErrorMessage('Silakan tempel (paste) link Google Spreadsheet / online CSV terlebih dahulu');
      return;
    }

    setErrorMessage('');
    setIsUrlLoading((prev) => ({ ...prev, [type]: true }));

    try {
      const res = await fetch('/api/stock-opname/fetch-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal mengambil data dari link spreadsheet');
      }

      if (type === 'RO') {
        const mockFile = { name: `[Google Sheets] ${json.total} baris data` } as File;
        setRoFile(mockFile);
        setRoData(json.data);
      } else if (type === 'PENERIMAAN') {
        const mockFile = { name: `[Google Sheets] ${json.total} baris data` } as File;
        setPenerimaanFile(mockFile);
        setPenerimaanData(json.data);
      } else if (type === 'PERALATAN') {
        const hasCategories = json.data.some((d: any) => d.kategori === 'Peralatan');
        const items = hasCategories ? json.data.filter((d: any) => d.kategori === 'Peralatan') : json.data;
        const mockFile = {
          name: `[Google Sheets] ${items.length} item Peralatan${items.length !== json.total ? ` (difilter dari ${json.total} master aset)` : ''}`,
        } as File;
        setStokPeralatanFile(mockFile);
        setStokPeralatanData(items);
      } else if (type === 'PERLENGKAPAN') {
        const hasCategories = json.data.some((d: any) => d.kategori === 'Perlengkapan Tetap');
        const items = hasCategories ? json.data.filter((d: any) => d.kategori === 'Perlengkapan Tetap') : json.data;
        const mockFile = {
          name: `[Google Sheets] ${items.length} item Perlengkapan Tetap${items.length !== json.total ? ` (difilter dari ${json.total} master aset)` : ''}`,
        } as File;
        setStokPerlengkapanFile(mockFile);
        setStokPerlengkapanData(items);
      }
    } catch (err: any) {
      setErrorMessage(`Gagal menarik link: ${err.message}`);
    } finally {
      setIsUrlLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  // 1-Click Pull for Both Peralatan & Perlengkapan
  const handleFetchAllMasterStock = async () => {
    const urlPeralatan = sheetUrls.PERALATAN || DEFAULT_SHEET_URLS.PERALATAN;
    const urlPerlengkapan = sheetUrls.PERLENGKAPAN || DEFAULT_SHEET_URLS.PERLENGKAPAN;

    if (!urlPeralatan && !urlPerlengkapan) {
      setErrorMessage('Link Stok Awal Peralatan atau Perlengkapan belum ditentukan');
      return;
    }

    setErrorMessage('');
    setIsUrlLoading((prev) => ({ ...prev, MASTER: true, PERALATAN: true, PERLENGKAPAN: true }));

    try {
      if (urlPeralatan === urlPerlengkapan) {
        // Single combined master sheet
        const res = await fetch('/api/stock-opname/fetch-sheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlPeralatan.trim() }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Gagal mengambil data dari link spreadsheet');
        }

        const hasPeralatan = json.data.some((d: any) => d.kategori === 'Peralatan');
        const hasPerlengkapan = json.data.some((d: any) => d.kategori === 'Perlengkapan Tetap');

        const peralatanItems = hasPeralatan ? json.data.filter((d: any) => d.kategori === 'Peralatan') : json.data;
        const perlengkapanItems = hasPerlengkapan ? json.data.filter((d: any) => d.kategori === 'Perlengkapan Tetap') : json.data;

        setStokPeralatanFile({ name: `[Google Sheets] ${peralatanItems.length} item Peralatan` } as File);
        setStokPeralatanData(peralatanItems);

        setStokPerlengkapanFile({ name: `[Google Sheets] ${perlengkapanItems.length} item Perlengkapan Tetap` } as File);
        setStokPerlengkapanData(perlengkapanItems);
      } else {
        // Dedicated separate sheets for Peralatan & Perlengkapan
        const [resPeralatan, resPerlengkapan] = await Promise.all([
          urlPeralatan
            ? fetch('/api/stock-opname/fetch-sheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: urlPeralatan.trim() }),
              }).then((r) => r.json())
            : Promise.resolve(null),
          urlPerlengkapan
            ? fetch('/api/stock-opname/fetch-sheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: urlPerlengkapan.trim() }),
              }).then((r) => r.json())
            : Promise.resolve(null),
        ]);

        if (resPeralatan && resPeralatan.success) {
          setStokPeralatanFile({ name: `[Google Sheets] ${resPeralatan.data.length} item Peralatan` } as File);
          setStokPeralatanData(resPeralatan.data);
        }

        if (resPerlengkapan && resPerlengkapan.success) {
          setStokPerlengkapanFile({ name: `[Google Sheets] ${resPerlengkapan.data.length} item Perlengkapan` } as File);
          setStokPerlengkapanData(resPerlengkapan.data);
        }
      }
    } catch (err: any) {
      setErrorMessage(`Gagal menarik stok awal: ${err.message}`);
    } finally {
      setIsUrlLoading((prev) => ({ ...prev, MASTER: false, PERALATAN: false, PERLENGKAPAN: false }));
    }
  };

  const handleFetchFromSuratJalan = async () => {
    setErrorMessage('');
    setIsSjLoading(true);

    try {
      const res = await fetch('/api/distribution/surat-jalan');
      const json = await res.json();
      if (!res.ok || !json.data) {
        throw new Error(json.error || 'Gagal mengambil data Surat Jalan');
      }

      const allSj: any[] = json.data;
      const filteredSj = allSj.filter((sj) => {
        const st = (sj.status || '').toUpperCase();
        if (sjFilterStatus === 'DELIVERED') {
          return st === 'DELIVERED' || st === 'SELESAI';
        }
        return st === 'DELIVERED' || st === 'SELESAI' || st === 'SHIPPED' || st === 'DALAM PENGIRIMAN';
      });

      if (filteredSj.length === 0) {
        throw new Error(
          `Tidak ditemukan Surat Jalan dengan status ${
            sjFilterStatus === 'DELIVERED' ? 'DELIVERED / Selesai (Diterima Cabang)' : 'SHIPPED / DELIVERED'
          }.`
        );
      }

      const extractedRows: any[] = [];
      for (const sj of filteredSj) {
        if (!sj.items || !Array.isArray(sj.items)) continue;
        for (const it of sj.items) {
          const itemName = String(it.item_name || it.nama_barang || '').trim();
          if (!itemName) continue;
          const qty = Number(it.quantity || it.qty || 0);
          if (qty <= 0) continue;

          extractedRows.push({
            kode_barang: itemName,
            nama_barang: itemName,
            qty: qty,
            satuan: it.unit || it.satuan || 'UNIT',
            no_sj: sj.sj_number || sj.nomor_sj || sj.id,
            no_ro: sj.ro_number || sj.ro_nomor || '-',
            cabang_tujuan: sj.branch_name || sj.tujuan_outlet_nama || '-',
            status_sj: sj.status,
            penerima: sj.receiver_name || sj.penerima_nama || '-',
            tanggal: sj.received_at || sj.delivery_date || sj.created_at || new Date().toISOString().split('T')[0],
            keterangan: `SJ: ${sj.sj_number || sj.id} (${sj.status}) -> ${sj.branch_name || ''}`,
          });
        }
      }

      if (extractedRows.length === 0) {
        throw new Error('Dokumen Surat Jalan ditemukan tetapi rincian item barang kosong.');
      }

      const statusLabel = sjFilterStatus === 'DELIVERED' ? 'Diterima Cabang (DELIVERED)' : 'Keluar Gudang (SHIPPED & DELIVERED)';
      const mockFile = {
        name: `[Surat Jalan: ${statusLabel}] ${extractedRows.length} item dari ${filteredSj.length} dokumen SJ`,
      } as File;

      setRoFile(mockFile);
      setRoData(extractedRows);
    } catch (err: any) {
      setErrorMessage(`Gagal memuat Surat Jalan: ${err.message}`);
    } finally {
      setIsSjLoading(false);
    }
  };

  const handleFetchFromMonitoringSla = async (filterOverride?: 'fulfilled' | 'received' | 'all') => {
    setErrorMessage('');
    setIsSlaLoading(true);
    const filter = filterOverride || slaFilterMode;

    try {
      const res = await fetch(`/api/stock-opname/sla-items?filter=${filter}`);
      const json = await res.json();
      if (!res.ok || !json.data) {
        throw new Error(json.error || 'Gagal mengambil data dari fitur Monitoring SLA');
      }

      const items: any[] = json.data;
      if (items.length === 0) {
        throw new Error(
          filter === 'received'
            ? 'Belum ada item berstatus diterima outlet pada fitur Monitoring SLA.'
            : 'Belum ada item dengan QTY terpenuhi pada fitur Monitoring SLA.'
        );
      }

      const filterLabel =
        filter === 'received'
          ? 'Hanya Diterima Outlet'
          : filter === 'all'
          ? 'Semua Permintaan RO'
          : 'Jumlah QTY Terpenuhi/Lengkap';

      const mockFile = {
        name: `[Monitoring SLA: ${filterLabel}] ${items.length} item (Total Qty: ${json.totalQty})`,
      } as File;

      setRoFile(mockFile);
      setRoData(items);
    } catch (err: any) {
      setErrorMessage(`Gagal memuat data Monitoring SLA: ${err.message}`);
    } finally {
      setIsSlaLoading(false);
    }
  };

  const handleFetchFromPrReadyStock = async () => {
    setErrorMessage('');
    setIsPrReadyLoading(true);

    try {
      const res = await fetch('/api/stock-opname/pr-ready-items', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.data) {
        throw new Error(json.error || 'Gagal mengambil data PR yang sudah Ready Stock');
      }

      const items: any[] = json.data;
      if (items.length === 0) {
        throw new Error('Belum ada item PR yang berstatus Selesai / Ready Stock.');
      }

      const mockFile = {
        name: `[PR Ready Stock] ${items.length} item (Total Qty PR: ${json.totalQty})`,
      } as File;

      setPenerimaanFile(mockFile);
      setPenerimaanData(items);
    } catch (err: any) {
      setErrorMessage(`Gagal memuat data PR Ready Stock: ${err.message}`);
    } finally {
      setIsPrReadyLoading(false);
    }
  };

  // Auto-fetch SLA monitoring items & PR Ready Stock items on initial load
  React.useEffect(() => {
    if (inputModes.RO === 'MONITORING_SLA' && roData.length === 0) {
      handleFetchFromMonitoringSla('fulfilled');
    }
    if (inputModes.PENERIMAAN === 'PR_READY_STOCK' && penerimaanData.length === 0) {
      handleFetchFromPrReadyStock();
    }
  }, []);

  const handleDownloadTemplate = (type: string) => {
    const blob = generateSampleTemplate(type);
    let filename = `Template_${type}_Harian.xlsx`;
    if (type === 'STOK_AWAL_PERALATAN') filename = 'Template_Stok_Awal_Peralatan.xlsx';
    if (type === 'STOK_AWAL_PERLENGKAPAN') filename = 'Template_Stok_Awal_Perlengkapan_Tetap.xlsx';
    downloadBlob(blob, filename);
  };

  const handleCompile = () => {
    setErrorMessage('');

    const masterStock = new Map<string, number>();
    const masterDetails = new Map<string, OpeningStockDetail>();
    const nameToSkuMap = new Map<string, string>();

    for (const row of stokPeralatanData) {
      const sku = String(row.kode_barang || row.sku || row.kode || row.nama_barang || row.item || '').trim();
      const nama = String(
        row.nama_item_barang ||
        row.nama_barang ||
        row.nama_item ||
        row.item ||
        row.item_yang_diajukan ||
        row.nama_item_di_system ||
        row.nama ||
        sku
      ).trim();
      if (sku) {
        const qty = Number(row.stok_awal || row.qty || 0) || 0;
        masterStock.set(sku, qty);
        masterDetails.set(sku, {
          nama_barang: nama || sku,
          satuan: row.satuan || 'UNIT',
          lokasi: row.lokasi || 'Ruang Peralatan',
          kategori: 'Peralatan',
        });
        if (nama && nama.toLowerCase() !== sku.toLowerCase()) {
          nameToSkuMap.set(nama.toLowerCase(), sku);
        }
      }
    }

    for (const row of stokPerlengkapanData) {
      const sku = String(row.kode_barang || row.sku || row.kode || row.nama_barang || row.item || '').trim();
      const nama = String(
        row.nama_item_barang ||
        row.nama_barang ||
        row.nama_item ||
        row.item ||
        row.item_yang_diajukan ||
        row.nama_item_di_system ||
        row.nama ||
        sku
      ).trim();
      if (sku) {
        const qty = Number(row.stok_awal || row.qty || 0) || 0;
        masterStock.set(sku, qty);
        masterDetails.set(sku, {
          nama_barang: nama || sku,
          satuan: row.satuan || 'UNIT',
          lokasi: row.lokasi || 'Gedung / Kantor',
          kategori: 'Perlengkapan Tetap',
        });
        if (nama && nama.toLowerCase() !== sku.toLowerCase()) {
          nameToSkuMap.set(nama.toLowerCase(), sku);
        }
      }
    }

    // Nama barang dari hasil SO sebelumnya ikut dipakai untuk mencocokkan
// baris RO/Penerimaan yang hanya berisi nama tanpa SKU, supaya tidak
// muncul baris ganda untuk item yang sama.
    for (const entry of carryForwardMap.values()) {
      const nameLower = (entry.nama_barang || '').toLowerCase().trim();
      if (nameLower && nameLower !== entry.kode_barang.toLowerCase() && !nameToSkuMap.has(nameLower)) {
        nameToSkuMap.set(nameLower, entry.kode_barang);
      }
    }

    // Hasil SO hari sebelumnya menjadi acuan stok awal; master hanya
    // melengkapi SKU baru yang belum ada di hasil SO tersebut.
    const preferCarryForward = openingSourceMode === 'SO_SEBELUMNYA' && carryForwardMap.size > 0;
    const opening = mergeOpeningStock({
      master: masterStock,
      masterDetails,
      carryForward: carryForwardMap,
      preferCarryForward,
    });

    const initialStockMap = opening.stock;
    const initialSourceMap = opening.sources;
    const itemDetailsMap = new Map<string, OpeningStockDetail>(opening.details);

    // Remap roData and penerimaanData with nameToSkuMap if row uses item name instead of SKU
    const normalizedRoData = roData.map((r) => {
      const rawCode = String(r.kode_barang || r.sku || r.nama_barang || '').trim();
      const rawName = String(r.nama_barang || r.nama_item_barang || rawCode).trim();
      const matchedSku = nameToSkuMap.get(rawName.toLowerCase()) || nameToSkuMap.get(rawCode.toLowerCase());
      if (matchedSku && rawCode !== matchedSku) {
        return { ...r, kode_barang: matchedSku };
      }
      return r;
    });

    const normalizedPenerimaanData = penerimaanData.map((r) => {
      const rawCode = String(r.kode_barang || r.sku || r.nama_barang || '').trim();
      const rawName = String(r.nama_barang || r.nama_item_barang || rawCode).trim();
      const matchedSku = nameToSkuMap.get(rawName.toLowerCase()) || nameToSkuMap.get(rawCode.toLowerCase());
      if (matchedSku && rawCode !== matchedSku) {
        return { ...r, kode_barang: matchedSku };
      }
      return r;
    });

    const roMap = aggregateTransactions(normalizedRoData);
    const penerimaanMap = aggregateTransactions(normalizedPenerimaanData);

    for (const row of [...normalizedPenerimaanData, ...normalizedRoData]) {
      const sku = String(row.kode_barang || row.sku || row.kode || row.nama_barang || row.item || '').trim();
      const nama = String(
        row.nama_item_barang ||
        row.nama_barang ||
        row.nama_item ||
        row.item ||
        row.item_yang_diajukan ||
        row.nama_item_di_system ||
        row.nama ||
        sku
      ).trim();
      if (sku) {
        let cat = row.kategori || '';
        if (cat) {
          const lower = cat.toLowerCase();
          if (lower.includes('lengkap') || lower.includes('tetap')) cat = 'Perlengkapan Tetap';
          else cat = 'Peralatan';
        }

        const existing = itemDetailsMap.get(sku);
        if (!existing) {
          itemDetailsMap.set(sku, {
            nama_barang: nama || sku,
            satuan: row.satuan || 'PCS',
            lokasi: row.lokasi || 'Gudang Utama',
            kategori: cat || 'Peralatan',
          });
        } else if ((!existing.nama_barang || existing.nama_barang === sku) && nama && nama !== sku) {
          existing.nama_barang = nama;
        }
      }
    }

    if (roMap.size === 0 && penerimaanMap.size === 0 && initialStockMap.size === 0) {
      setErrorMessage('Silakan upload file atau tautkan link spreadsheet minimal salah satu data (Stok Awal, RO, atau Penerimaan) untuk melanjutkan.');
      return;
    }

    const compiledItems = mergeDailyInventory(
      initialStockMap,
      roMap,
      penerimaanMap,
      itemDetailsMap,
      initialSourceMap
    );
    onCompilationSuccess(compiledItems, {
      roTotalRows: roData.length,
      penerimaanTotalRows: penerimaanData.length,
      peralatanCount: stokPeralatanData.length,
      perlengkapanCount: stokPerlengkapanData.length,
      openingSource: preferCarryForward ? 'SO_SEBELUMNYA' : 'MASTER',
      openingFromPrevious: opening.stats.fromPrevious,
      openingFromMaster: opening.stats.fromMaster,
      previousSessionDate,
      previousSessionStatus,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Banner / Guide */}
      <div className="bg-gradient-to-r from-sky-600 via-sky-700 to-indigo-800 text-white rounded-2xl p-6 shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Langkah 1: Penarikan Data (File Excel / Google Sheets)</span>
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">Tarik Data Harian &amp; Stok Awal 2 Kategori</h2>
          <p className="text-sky-100 text-sm mt-1 max-w-2xl leading-relaxed">
            Master / Spreadsheet di tab ini hanya menjadi <strong>sumber awal</strong>. Setelah hari
            pertama, stok awal otomatis mengikuti <strong>hasil SO hari sebelumnya</strong>; master
            hanya dipakai untuk menambah SKU baru.
          </p>
        </div>
        <div className="absolute -right-8 -bottom-10 opacity-10 pointer-events-none">
          <Package className="w-64 h-64" />
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-800 dark:text-rose-300 flex items-center space-x-3 text-sm animate-shake">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* Grid: 2 Transaksi Harian (RO & Penerimaan) */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center space-x-2">
          <span>Mutasi Harian (File Excel atau Link Spreadsheet Hari Ini)</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: RO Harian */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white text-sm">Data RO Harian</h4>
                    <span className="text-[11px] text-slate-400 block">Pengeluaran / Release Order (-)</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadTemplate('RO')}
                  className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800/60 flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template</span>
                </button>
              </div>

              {/* Source Mode Switcher */}
              <div className="grid grid-cols-4 bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-lg mb-3 text-[10px] md:text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setMode('RO', 'MONITORING_SLA')}
                  className={`py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                    inputModes.RO === 'MONITORING_SLA'
                      ? 'bg-rose-600 text-white shadow-xs font-black'
                      : 'text-slate-500 hover:text-rose-600'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span className="truncate">Monitoring SLA</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('RO', 'INTERNAL_SJ')}
                  className={`py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                    inputModes.RO === 'INTERNAL_SJ'
                      ? 'bg-rose-600 text-white shadow-xs font-black'
                      : 'text-slate-500 hover:text-rose-600'
                  }`}
                >
                  <Truck className="w-3 h-3" />
                  <span className="truncate">Surat Jalan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('RO', 'FILE')}
                  className={`py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                    inputModes.RO === 'FILE'
                      ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  <span className="truncate">File Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('RO', 'LINK')}
                  className={`py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                    inputModes.RO === 'LINK'
                      ? 'bg-rose-600 text-white shadow-xs font-black'
                      : 'text-slate-500 hover:text-rose-600'
                  }`}
                >
                  <LinkIcon className="w-3 h-3" />
                  <span className="truncate">Link Sheet</span>
                </button>
              </div>

              {inputModes.RO === 'MONITORING_SLA' ? (
                <div className="space-y-3 p-3.5 bg-gradient-to-br from-rose-50/60 to-indigo-50/40 dark:from-rose-950/30 dark:to-indigo-950/20 border border-rose-200/90 dark:border-rose-900/50 rounded-xl">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-rose-950 dark:text-rose-200 flex items-center space-x-1.5">
                      <Sparkles className="w-4 h-4 text-rose-600" />
                      <span>Sumber: Fitur Monitoring SLA (Jumlah QTY)</span>
                    </span>
                    <span className="text-[10px] bg-rose-100 dark:bg-rose-900/70 text-rose-800 dark:text-rose-200 px-2 py-0.5 rounded-full font-bold">
                      Data Realtime SLA
                    </span>
                  </div>

                  {/* Filter selector */}
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setSlaFilterMode('fulfilled');
                        handleFetchFromMonitoringSla('fulfilled');
                      }}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        slaFilterMode === 'fulfilled'
                          ? 'bg-white dark:bg-slate-800 border-rose-500 ring-2 ring-rose-500/20 font-bold text-slate-900 dark:text-white'
                          : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px] text-emerald-600 dark:text-emerald-400">✓ QTY Terpenuhi</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">Jumlah Qty &gt; 0</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSlaFilterMode('received');
                        handleFetchFromMonitoringSla('received');
                      }}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        slaFilterMode === 'received'
                          ? 'bg-white dark:bg-slate-800 border-rose-500 ring-2 ring-rose-500/20 font-bold text-slate-900 dark:text-white'
                          : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px] text-blue-600 dark:text-blue-400">🏢 Diterima Outlet</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">Tiba di outlet</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSlaFilterMode('all');
                        handleFetchFromMonitoringSla('all');
                      }}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        slaFilterMode === 'all'
                          ? 'bg-white dark:bg-slate-800 border-rose-500 ring-2 ring-rose-500/20 font-bold text-slate-900 dark:text-white'
                          : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px] text-amber-600 dark:text-amber-400">📋 Semua Item</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">Semua item RO</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleFetchFromMonitoringSla()}
                    disabled={isSlaLoading}
                    className="w-full py-2.5 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center space-x-2 active:scale-98 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSlaLoading ? 'animate-spin' : ''}`} />
                    <span>{isSlaLoading ? 'Menarik Data Monitoring SLA...' : 'Tarik Jumlah QTY dari Monitoring SLA'}</span>
                  </button>

                  <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between px-1">
                    <span>💡 Mengambil Jumlah QTY pada tabel SLA sebagai pengurang stok gudang</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">Sync Otomatis</span>
                  </div>
                </div>
              ) : inputModes.RO === 'INTERNAL_SJ' ? (
                <div className="space-y-3 p-3.5 bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 rounded-xl">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-rose-950 dark:text-rose-200 flex items-center space-x-1.5">
                      <Truck className="w-4 h-4 text-rose-600" />
                      <span>Filter Status Surat Jalan:</span>
                    </span>
                    <span className="text-[10px] bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 px-2 py-0.5 rounded-full font-semibold">
                      Validasi Sistem
                    </span>
                  </div>

                  {/* Status selector buttons */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSjFilterStatus('DELIVERED')}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        sjFilterStatus === 'DELIVERED'
                          ? 'bg-white dark:bg-slate-800 border-rose-500 ring-2 ring-rose-500/20 font-bold text-slate-900 dark:text-white'
                          : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px] text-emerald-600 dark:text-emerald-400">✓ Hanya DELIVERED</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Sudah diterima fisik oleh outlet</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSjFilterStatus('ALL_OUT')}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        sjFilterStatus === 'ALL_OUT'
                          ? 'bg-white dark:bg-slate-800 border-rose-500 ring-2 ring-rose-500/20 font-bold text-slate-900 dark:text-white'
                          : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px] text-amber-600 dark:text-amber-400">🚚 SHIPPED &amp; DELIVERED</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Semua item keluar dari gudang</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleFetchFromSuratJalan}
                    disabled={isSjLoading}
                    className="w-full py-2.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center space-x-2 active:scale-98 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSjLoading ? 'animate-spin' : ''}`} />
                    <span>{isSjLoading ? 'Menarik Item Surat Jalan...' : 'Tarik Item dari Surat Jalan'}</span>
                  </button>
                </div>
              ) : inputModes.RO === 'FILE' ? (
                <>
                  <input
                    ref={roInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files?.[0], 'RO')}
                  />
                  <div
                    onClick={() => roInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                      roFile
                        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-600 bg-slate-50/50 dark:bg-slate-900/40'
                    }`}
                  >
                    {roFile ? (
                      <div className="flex items-center justify-center space-x-2 text-emerald-700 dark:text-emerald-400">
                        <FileCheck className="w-5 h-5" />
                        <span className="text-xs font-bold truncate max-w-[200px]">{roFile.name}</span>
                      </div>
                    ) : (
                      <div className="text-slate-400 dark:text-slate-500 space-y-1">
                        <Upload className="w-6 h-6 mx-auto text-slate-400" />
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Pilih / Drag &amp; Drop File RO</p>
                        <p className="text-[10px]">Mendukung file .XLSX, .XLS, atau .CSV</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <div className="flex items-center space-x-1.5 text-[11px] text-slate-500">
                    <Globe className="w-3.5 h-3.5 text-rose-500" />
                    <span>Link Google Sheets Publik (Anyone with link):</span>
                  </div>
                  <input
                    type="url"
                    value={sheetUrls.RO}
                    onChange={(e) => setSheetUrls((prev) => ({ ...prev, RO: e.target.value }))}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleFetchFromLink('RO')}
                    disabled={isUrlLoading.RO}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isUrlLoading.RO ? 'animate-spin' : ''}`} />
                    <span>{isUrlLoading.RO ? 'Menarik Data...' : 'Tarik Data RO dari Link'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Action Bar */}
            {roData.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center space-x-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                  <span>{roData.length} baris RO termuat</span>
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPreviewModal({ isOpen: true, title: 'Pratinjau Data RO Harian', data: roData })}
                    className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center space-x-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Intip</span>
                  </button>
                  <button
                    onClick={() => {
                      setRoFile(null);
                      setRoData([]);
                    }}
                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Penerimaan Harian */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white text-sm">Data Penerimaan Harian</h4>
                    <span className="text-[11px] text-slate-400 block">Barang Masuk / Mutasi Masuk (+)</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadTemplate('PENERIMAAN')}
                  className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60 flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template</span>
                </button>
              </div>

              {/* Source Mode Switcher */}
              <div className="grid grid-cols-3 bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-lg mb-3 text-[10px] md:text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setMode('PENERIMAAN', 'PR_READY_STOCK')}
                  className={`py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                    inputModes.PENERIMAAN === 'PR_READY_STOCK'
                      ? 'bg-emerald-600 text-white shadow-xs font-black'
                      : 'text-slate-500 hover:text-emerald-600'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span className="truncate">PR Ready Stock</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('PENERIMAAN', 'FILE')}
                  className={`py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                    inputModes.PENERIMAAN === 'FILE'
                      ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  <span className="truncate">File Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('PENERIMAAN', 'LINK')}
                  className={`py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                    inputModes.PENERIMAAN === 'LINK'
                      ? 'bg-emerald-600 text-white shadow-xs font-black'
                      : 'text-slate-500 hover:text-emerald-600'
                  }`}
                >
                  <LinkIcon className="w-3 h-3" />
                  <span className="truncate">Link Sheet</span>
                </button>
              </div>

              {inputModes.PENERIMAAN === 'PR_READY_STOCK' ? (
                <div className="space-y-3 p-3.5 bg-gradient-to-br from-emerald-50/70 to-teal-50/40 dark:from-emerald-950/30 dark:to-teal-950/20 border border-emerald-200/90 dark:border-emerald-900/50 rounded-xl">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-emerald-950 dark:text-emerald-200 flex items-center space-x-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>Sumber: Fitur PR (QTY PR Ready Stock)</span>
                    </span>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-full font-bold">
                      Data Realtime PR
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-800/80 border border-emerald-200/80 dark:border-emerald-800/60 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 block mb-0.5">
                      ✓ Jumlah Quantity PR yang Sudah Ready Stock
                    </span>
                    <span>
                      Mengambil kolom <strong>QTY PR</strong> dari seluruh item pengadaan PR yang telah berstatus{' '}
                      <strong>Selesai / Ready Stock</strong> sebagai penambah stok gudang (+).
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleFetchFromPrReadyStock}
                    disabled={isPrReadyLoading}
                    className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center space-x-2 active:scale-98 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPrReadyLoading ? 'animate-spin' : ''}`} />
                    <span>
                      {isPrReadyLoading ? 'Menarik Data PR Ready Stock...' : 'Tarik Jumlah QTY dari PR Ready Stock'}
                    </span>
                  </button>

                  <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between px-1">
                    <span>💡 Otomatis terhubung dengan fitur PR &amp; Riwayat PR</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Sync Otomatis</span>
                  </div>
                </div>
              ) : inputModes.PENERIMAAN === 'FILE' ? (
                <>
                  <input
                    ref={penerimaanInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files?.[0], 'PENERIMAAN')}
                  />
                  <div
                    onClick={() => penerimaanInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                      penerimaanFile
                        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600 bg-slate-50/50 dark:bg-slate-900/40'
                    }`}
                  >
                    {penerimaanFile ? (
                      <div className="flex items-center justify-center space-x-2 text-emerald-700 dark:text-emerald-400">
                        <FileCheck className="w-5 h-5" />
                        <span className="text-xs font-bold truncate max-w-[200px]">{penerimaanFile.name}</span>
                      </div>
                    ) : (
                      <div className="text-slate-400 dark:text-slate-500 space-y-1">
                        <Upload className="w-6 h-6 mx-auto text-slate-400" />
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Pilih / Drag &amp; Drop File Penerimaan</p>
                        <p className="text-[10px]">Mendukung file .XLSX, .XLS, atau .CSV</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex items-center space-x-1.5">
                      <Globe className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Link Penerimaan Tetap (ENV / Saved):</span>
                    </div>
                    {sheetUrls.PENERIMAAN !== DEFAULT_SHEET_URLS.PENERIMAAN && (
                      <button
                        type="button"
                        onClick={() => resetToDefaultUrl('PENERIMAAN')}
                        className="text-[10px] text-emerald-600 hover:underline font-bold"
                      >
                        Reset ke ENV
                      </button>
                    )}
                  </div>
                  <input
                    type="url"
                    value={sheetUrls.PENERIMAAN}
                    onChange={(e) => updateSheetUrl('PENERIMAAN', e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ <strong>Kolom H</strong> (Jumlah Seharusnya) otomatis dihitung, item <strong>Retur</strong> (Kolom K) otomatis dikecualikan
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFetchFromLink('PENERIMAAN')}
                    disabled={isUrlLoading.PENERIMAAN}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isUrlLoading.PENERIMAAN ? 'animate-spin' : ''}`} />
                    <span>{isUrlLoading.PENERIMAAN ? 'Menarik Data...' : 'Tarik Data Masuk dari Link'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Action Bar */}
            {penerimaanData.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center space-x-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                  <span>{penerimaanData.length} baris masuk termuat</span>
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() =>
                      setPreviewModal({ isOpen: true, title: 'Pratinjau Data Penerimaan Harian', data: penerimaanData })
                    }
                    className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center space-x-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Intip</span>
                  </button>
                  <button
                    onClick={() => {
                      setPenerimaanFile(null);
                      setPenerimaanData([]);
                    }}
                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid: 2 Stok Awal Terpisah (Peralatan & Perlengkapan Tetap) */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center space-x-2">
            <span>Stok Awal: Total Perlengkapan &amp; Peralatan</span>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
              Sumber Data Tetap (ENV)
            </span>
          </h3>
          <button
            type="button"
            onClick={handleFetchAllMasterStock}
            disabled={isUrlLoading.MASTER || isUrlLoading.PERALATAN || isUrlLoading.PERLENGKAPAN}
            className="self-start sm:self-auto text-xs font-bold text-white bg-linear-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 px-3 py-1.5 rounded-lg shadow-xs flex items-center space-x-1.5 disabled:opacity-50 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUrlLoading.MASTER ? 'animate-spin' : ''}`} />
            <span>Tarik Sekaligus (Peralatan &amp; Perlengkapan dari Master)</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Stok Awal PERALATAN */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-amber-200/90 dark:border-amber-800/50 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white text-sm">Stok Awal: Peralatan</h4>
                  <span className="text-[11px] text-slate-400 block">Tools, Mesin, Perkakas Kerja</span>
                </div>
              </div>
              <button
                onClick={() => handleDownloadTemplate('STOK_AWAL_PERALATAN')}
                className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Template</span>
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-lg mb-3 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setMode('PERALATAN', 'FILE')}
                className={`flex-1 py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                  inputModes.PERALATAN === 'FILE'
                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Upload className="w-3 h-3" />
                <span>File Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('PERALATAN', 'LINK')}
                className={`flex-1 py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                  inputModes.PERALATAN === 'LINK'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-500 hover:text-amber-600'
                }`}
              >
                <LinkIcon className="w-3 h-3" />
                <span>Link Sheets</span>
              </button>
            </div>

            {inputModes.PERALATAN === 'FILE' ? (
              <>
                <input
                  ref={peralatanInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files?.[0], 'PERALATAN')}
                />
                <div
                  onClick={() => peralatanInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                    stokPeralatanFile
                      ? 'border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-600 bg-slate-50/50 dark:bg-slate-900/40'
                  }`}
                >
                  {stokPeralatanFile ? (
                    <div className="flex items-center justify-center space-x-2 text-amber-800 dark:text-amber-300">
                      <FileCheck className="w-5 h-5" />
                      <span className="text-xs font-bold truncate max-w-[200px]">{stokPeralatanFile.name}</span>
                    </div>
                  ) : (
                    <div className="text-slate-400 dark:text-slate-500 space-y-1">
                      <Upload className="w-5 h-5 mx-auto text-slate-400" />
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Upload Stok Awal Peralatan</p>
                      <p className="text-[10px]">Opsional jika ada data master peralatan</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Link Tetap (ENV / Saved):</span>
                  {sheetUrls.PERALATAN !== DEFAULT_SHEET_URLS.PERALATAN && (
                    <button
                      type="button"
                      onClick={() => resetToDefaultUrl('PERALATAN')}
                      className="text-[10px] text-amber-600 hover:underline font-bold"
                    >
                      Reset ke ENV
                    </button>
                  )}
                </div>
                <input
                  type="url"
                  value={sheetUrls.PERALATAN}
                  onChange={(e) => updateSheetUrl('PERALATAN', e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleFetchFromLink('PERALATAN')}
                  disabled={isUrlLoading.PERALATAN}
                  className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isUrlLoading.PERALATAN ? 'animate-spin' : ''}`} />
                  <span>{isUrlLoading.PERALATAN ? 'Menarik Data...' : 'Tarik Stok Peralatan dari Link'}</span>
                </button>
              </div>
            )}

            {stokPeralatanData.length > 0 && (
              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="text-amber-800 dark:text-amber-300 font-semibold">{stokPeralatanData.length} item peralatan</span>
                <button
                  onClick={() => {
                    setStokPeralatanFile(null);
                    setStokPeralatanData([]);
                  }}
                  className="text-rose-500 hover:underline"
                >
                  Hapus
                </button>
              </div>
            )}
          </div>

          {/* Stok Awal PERLENGKAPAN TETAP */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-200/90 dark:border-indigo-800/50 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Armchair className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white text-sm">Stok Awal: Perlengkapan Tetap</h4>
                  <span className="text-[11px] text-slate-400 block">Meja, Kursi, Lemari, Fixture</span>
                </div>
              </div>
              <button
                onClick={() => handleDownloadTemplate('STOK_AWAL_PERLENGKAPAN')}
                className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 px-2.5 py-1 rounded-lg border border-indigo-300 dark:border-indigo-700 flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Template</span>
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-lg mb-3 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setMode('PERLENGKAPAN', 'FILE')}
                className={`flex-1 py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                  inputModes.PERLENGKAPAN === 'FILE'
                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Upload className="w-3 h-3" />
                <span>File Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('PERLENGKAPAN', 'LINK')}
                className={`flex-1 py-1 rounded-md transition-all flex items-center justify-center space-x-1 ${
                  inputModes.PERLENGKAPAN === 'LINK'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-indigo-600'
                }`}
              >
                <LinkIcon className="w-3 h-3" />
                <span>Link Sheets</span>
              </button>
            </div>

            {inputModes.PERLENGKAPAN === 'FILE' ? (
              <>
                <input
                  ref={perlengkapanInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files?.[0], 'PERLENGKAPAN')}
                />
                <div
                  onClick={() => perlengkapanInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                    stokPerlengkapanFile
                      ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 bg-slate-50/50 dark:bg-slate-900/40'
                  }`}
                >
                  {stokPerlengkapanFile ? (
                    <div className="flex items-center justify-center space-x-2 text-indigo-800 dark:text-indigo-300">
                      <FileCheck className="w-5 h-5" />
                      <span className="text-xs font-bold truncate max-w-[200px]">{stokPerlengkapanFile.name}</span>
                    </div>
                  ) : (
                    <div className="text-slate-400 dark:text-slate-500 space-y-1">
                      <Upload className="w-5 h-5 mx-auto text-slate-400" />
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Upload Stok Awal Perlengkapan</p>
                      <p className="text-[10px]">Opsional jika ada data master perlengkapan</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Link Tetap (ENV / Saved):</span>
                  {sheetUrls.PERLENGKAPAN !== DEFAULT_SHEET_URLS.PERLENGKAPAN && (
                    <button
                      type="button"
                      onClick={() => resetToDefaultUrl('PERLENGKAPAN')}
                      className="text-[10px] text-indigo-600 hover:underline font-bold"
                    >
                      Reset ke ENV
                    </button>
                  )}
                </div>
                <input
                  type="url"
                  value={sheetUrls.PERLENGKAPAN}
                  onChange={(e) => updateSheetUrl('PERLENGKAPAN', e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleFetchFromLink('PERLENGKAPAN')}
                  disabled={isUrlLoading.PERLENGKAPAN}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isUrlLoading.PERLENGKAPAN ? 'animate-spin' : ''}`} />
                  <span>{isUrlLoading.PERLENGKAPAN ? 'Menarik Data...' : 'Tarik Stok Perlengkapan dari Link'}</span>
                </button>
              </div>
            )}

            {stokPerlengkapanData.length > 0 && (
              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="text-indigo-800 dark:text-indigo-300 font-semibold">{stokPerlengkapanData.length} item perlengkapan</span>
                <button
                  onClick={() => {
                    setStokPerlengkapanFile(null);
                    setStokPerlengkapanData([]);
                  }}
                  className="text-rose-500 hover:underline"
                >
                  Hapus
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sumber Stok Awal: hasil SO sebelumnya vs master */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-sky-100 dark:bg-sky-950/60 rounded-lg text-sky-700 dark:text-sky-300">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                Sumber Stok Awal
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Master / Spreadsheet hanya dipakai sebagai data awal. Setelah hari pertama, hasil SO
                harian otomatis menjadi acuan stok awal hari berikutnya.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
            Auto Rollover
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => chooseOpeningSource('SO_SEBELUMNYA')}
            disabled={carryForwardMap.size === 0}
            className={`text-left p-3 rounded-xl border transition-all ${
              openingSourceMode === 'SO_SEBELUMNYA' && carryForwardMap.size > 0
                ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 dark:border-sky-700 ring-1 ring-sky-300 dark:ring-sky-800'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-sky-300'
            } ${carryForwardMap.size === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Hasil SO {previousSessionDate || 'sebelumnya'}
              </span>
              {openingSourceMode === 'SO_SEBELUMNYA' && carryForwardMap.size > 0 && (
                <CheckCircle2 className="w-4 h-4 text-sky-600" />
              )}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              {carryForwardMap.size > 0
                ? `${carryForwardMap.size} SKU · ${carryForwardCounted} sudah dihitung fisik. Master hanya menambah SKU baru.`
                : 'Belum ada hasil SO sebelumnya. Kompilasi memakai master.'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => chooseOpeningSource('MASTER')}
            className={`text-left p-3 rounded-xl border transition-all ${
              openingSourceMode === 'MASTER'
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-700 ring-1 ring-amber-300 dark:ring-amber-800'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Master / Spreadsheet
              </span>
              {openingSourceMode === 'MASTER' && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              Reset stok awal dari file master. Gunakan hanya untuk hari pertama atau koreksi awal.
            </p>
          </button>
        </div>

        {openingSourceMode === 'SO_SEBELUMNYA' &&
          carryForwardMap.size > 0 &&
          previousSessionStatus &&
          previousSessionStatus !== 'COMPLETED' && (
            <div className="flex items-start space-x-2 text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Sesi SO {previousSessionDate} berstatus <strong>{previousSessionStatus}</strong>. Item
                yang belum dihitung memakai stok sistem hari itu sebagai stok awal.
              </span>
            </div>
          )}
      </div>

      {/* Compile button */}
      <div className="pt-2 flex justify-end">
        <button
          onClick={handleCompile}
          className="w-full md:w-auto px-8 py-3.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2"
        >
          <span>Kompilasi Data SO Harian &amp; Masuk ke Form Fisik</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Data preview modal */}
      <DataPreviewModal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal({ isOpen: false, title: '', data: [] })}
        title={previewModal.title}
        data={previewModal.data}
      />
    </div>
  );
}
