'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileCheck2, 
  PlusCircle, 
  Search, 
  Clock, 
  CheckCircle2, 
  Truck, 
  X, 
  Printer, 
  Package, 
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  UploadCloud,
  Layers,
  ArrowRight,
  GitMerge,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Filter,
  CheckSquare,
  BarChart3,
  Boxes,
  HelpCircle,
  RefreshCw,
  Trash2, 
  ExternalLink, 
  ChevronRight,
  ChevronDown,
  MapPin,
  ImageIcon,
  Eye,
  Upload,
  FileEdit,
  Ban
} from 'lucide-react';
import { RequestOrder, Outlet, ROItem, ROStatus } from '@/lib/supabase/types';
import { useRouter } from 'next/navigation';
import { getItemImageUrl, setItemImageOverride } from '@/lib/assetImageHelper';
import { getItemSpecification, setItemSpecificationOverride } from '@/lib/assetSpecHelper';
import UploadImageModal from '@/components/items/UploadImageModal';
import EditSpecModal from '@/components/items/EditSpecModal';
import ColumnVisibilityPicker, { ColumnItem } from '@/components/ui/ColumnVisibilityPicker';
import { Toast, ToastMessage } from '@/components/ui/Toast';

interface RoManagerViewProps {
  initialOrders?: RequestOrder[];
  outlets?: Outlet[];
}

type StageKey = 
  | 'ALL'
  | 'REQUEST_ORDER'
  | 'INPUT_DATA'
  | 'PILIH_PROSES'
  | 'KELOLA_PR'
  | 'READY_STOCK'
  | 'SURAT_JALAN'
  | 'ASET_SAMPAI'
  | 'CHECKLIST'
  | 'UPDATE_SLA'
  | 'SELESAI'
  | 'DIBATALKAN';

interface StageDefinition {
  key: StageKey;
  stepNum: number;
  label: string;
  sub: string;
  color: string;
  shape: 'pill' | 'rect' | 'diamond';
}

const WORKFLOW_STAGES: StageDefinition[] = [
  { key: 'REQUEST_ORDER', stepNum: 1, label: 'Request Order', sub: 'Order Masuk', color: 'border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-600 dark:bg-blue-950/50 dark:text-blue-200', shape: 'pill' },
  { key: 'INPUT_DATA', stepNum: 2, label: 'Input Sistem', sub: 'Record Sheet', color: 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-200', shape: 'rect' },
  { key: 'PILIH_PROSES', stepNum: 3, label: 'Pilih Proses', sub: 'Stok vs PR?', color: 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-200', shape: 'diamond' },
  { key: 'KELOLA_PR', stepNum: 4, label: 'Kelola PR & Kedatangan', sub: 'Vendor PO', color: 'border-orange-400 bg-orange-50 text-orange-950 dark:border-orange-600 dark:bg-orange-950/50 dark:text-orange-200', shape: 'rect' },
  { key: 'READY_STOCK', stepNum: 5, label: 'Ready Stock', sub: 'Gudang SCGA', color: 'border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-200', shape: 'rect' },
  { key: 'SURAT_JALAN', stepNum: 6, label: 'Surat Jalan & Kirim', sub: 'Armada Jalan', color: 'border-teal-400 bg-teal-50 text-teal-950 dark:border-teal-600 dark:bg-teal-950/50 dark:text-teal-200', shape: 'rect' },
  { key: 'ASET_SAMPAI', stepNum: 7, label: 'Aset Sampai?', sub: 'Cabang Outlet', color: 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-200', shape: 'diamond' },
  { key: 'CHECKLIST', stepNum: 8, label: 'Checklist Diterima', sub: 'Cek Fisik Toko', color: 'border-cyan-400 bg-cyan-50 text-cyan-950 dark:border-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-200', shape: 'rect' },
  { key: 'UPDATE_SLA', stepNum: 9, label: 'Update SLA', sub: 'Lead Time', color: 'border-purple-400 bg-purple-50 text-purple-950 dark:border-purple-600 dark:bg-purple-950/50 dark:text-purple-200', shape: 'rect' },
  { key: 'SELESAI', stepNum: 10, label: 'Selesai', sub: 'Operasional Toko', color: 'border-emerald-500 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-900/50 dark:text-emerald-100', shape: 'pill' },
  { key: 'DIBATALKAN', stepNum: 0, label: 'Dibatalkan', sub: 'RO Ditolak', color: 'border-rose-400 bg-rose-50 text-rose-950 dark:border-rose-600 dark:bg-rose-950/50 dark:text-rose-200', shape: 'pill' },
];

const RO_COLUMNS: ColumnItem[] = [
  { id: 'ro_number', label: 'No. RO / ID', alwaysVisible: true },
  { id: 'order_date', label: 'Tanggal Order' },
  { id: 'request_date', label: 'Tanggal Permintaan' },
  { id: 'branch', label: 'Cabang Outlet' },
  { id: 'items', label: 'Item & Alokasi' },
  { id: 'images', label: 'Gambar' },
  { id: 'stage', label: 'Tahapan Alur' },
  { id: 'actions', label: 'Aksi Alur Kerja', alwaysVisible: true },
];

export function getUniqueRoItems(items: ROItem[]): ROItem[] {
  const seen = new Set<string>();
  return (items || []).filter((it) => {
    const key = it.item_name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function RoManagerView({ initialOrders = [], outlets = [] }: RoManagerViewProps) {
  const router = useRouter();
  const [orders, setOrders] = useState<RequestOrder[]>(initialOrders);
  const [outletList, setOutletList] = useState<Outlet[]>(outlets);
  const [isLoading, setIsLoading] = useState(initialOrders.length === 0);
  const [search, setSearch] = useState('');
  const [selectedStage, setSelectedStage] = useState<StageKey>('ALL');
  const [showPipelineStepper, setShowPipelineStepper] = useState(false);
  const [smartFilter, setSmartFilter] = useState<'ALL' | 'CLEAN' | 'DUPLICATES'>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<'ALL' | 'JABODETABEK' | 'KALBAR'>('ALL');
  const [selectedSource, setSelectedSource] = useState<'ALL' | 'KALBAR_SHEET' | 'JABO_SHEET' | 'MANUAL'>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Column Visibility state
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ca_ro_columns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      ro_number: true,
      order_date: true,
      request_date: true,
      branch: true,
      items: true,
      images: true,
      stage: true,
      actions: true,
    };
  });

  const visibleColCount = RO_COLUMNS.filter((c) => visibleColumns[c.id] !== false).length;

  // Modals state
  const [isRoModalOpen, setIsRoModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelBranch, setExcelBranch] = useState('');
  const [excelText, setExcelText] = useState('');

  // Workflow Action Modals
  const [selectedRoForProcess, setSelectedRoForProcess] = useState<RequestOrder | null>(null);
  const [selectedRoForPr, setSelectedRoForPr] = useState<RequestOrder | null>(null);
  const [selectedRoForSj, setSelectedRoForSj] = useState<RequestOrder | null>(null);
  const [selectedRoForArrival, setSelectedRoForArrival] = useState<RequestOrder | null>(null);
  const [selectedRoForChecklist, setSelectedRoForChecklist] = useState<RequestOrder | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [uploadModalTarget, setUploadModalTarget] = useState<{ itemName: string; currentImageUrl?: string | null } | null>(null);
  const [editingSpecItem, setEditingSpecItem] = useState<{ itemName: string; specification: string } | null>(null);
  const [rejectReasonModalOpen, setRejectReasonModalOpen] = useState(false);
  const [rejectReasonText, setRejectReasonText] = useState('');
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const handleUploadSuccess = (updatedItemName: string, newImageUrl: string) => {
    setItemImageOverride(updatedItemName, newImageUrl);
    setSyncFeedback(`Foto "${updatedItemName}" berhasil diunggah & disimpan ke Supabase!`);
    setOrders((prev) => [...prev]);
  };

  const handleSpecSuccess = (updatedItemName: string, newSpec: string) => {
    setItemSpecificationOverride(updatedItemName, newSpec);
    setSyncFeedback(`Spesifikasi "${updatedItemName}" berhasil disimpan ke Supabase!`);
    setOrders((prev) => [...prev]);
  };

  // New RO form state
  const [branchName, setBranchName] = useState(outletList[0]?.branch_name || outletList[0]?.nama || 'CA - Grand Batam Mall');
  const [region, setRegion] = useState<'JABODETABEK' | 'KALBAR'>('JABODETABEK');
  const [requesterName, setRequesterName] = useState('Staff Logistik CA');
  const [targetDeliveryDate, setTargetDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [stockSource, setStockSource] = useState<'GUDANG_SCGA' | 'PR_VENDOR'>('GUDANG_SCGA');
  const [itemsList, setItemsList] = useState<ROItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // SJ Modal inputs
  const [driverName, setDriverName] = useState('Suryanto');
  const [vehicleNumber, setVehicleNumber] = useState('B 9482 SXZ');
  const [expedition, setExpedition] = useState('Armada Internal SCGA');

  // PR Modal inputs
  const [prVendor, setPrVendor] = useState('');
  const [prPoNo, setPrPoNo] = useState('');
  const [prArrivalTarget, setPrArrivalTarget] = useState('');

  // Checklist inputs
  const [picReceiver, setPicReceiver] = useState('Store Manager Toko');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [checklistNotes, setChecklistNotes] = useState('');
  const [checkedItems, setCheckedItems] = useState<Record<string, { qty: number; condition: string; checked: boolean }>>({});

  // Initial load
  useEffect(() => {
    if (orders.length === 0) {
      setIsLoading(true);
      fetch('/api/distribution/ro')
        .then((res) => res.json())
        .then((data) => {
          if (data.data) setOrders(data.data);
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
    if (outletList.length === 0) {
      fetch('/api/outlets')
        .then((res) => res.json())
        .then((data) => {
          if (data.data) setOutletList(data.data);
        })
        .catch(console.error);
    }
  }, []);

  // Helper to determine active stage of an RO
  const getRoStage = (ro: RequestOrder): StageKey => {
    if (ro.status === 'REJECTED' || (ro.status as string) === 'CANCELLED' || ro.current_stage === 'DIBATALKAN') return 'DIBATALKAN';
    const activeItems = (ro.items || []).filter(it => it.stock_source !== 'CANCELLED');
    if (ro.items && ro.items.length > 0 && activeItems.length === 0) return 'DIBATALKAN';
    if (ro.current_stage) return ro.current_stage;
    if (ro.status === 'COMPLETED') return 'SELESAI';
    if (ro.status === 'IN_DELIVERY') return 'SURAT_JALAN';
    if (ro.status === 'CHECKLIST_DONE') return 'UPDATE_SLA';
    if (ro.status === 'READY_STOCK' || (activeItems.length > 0 && activeItems.every(it => it.stock_source === 'GUDANG_SCGA'))) return 'READY_STOCK';
    if (activeItems.some(it => it.stock_source === 'PR_VENDOR')) return 'KELOLA_PR';
    if (ro.status === 'APPROVED') return 'PILIH_PROSES';
    return 'REQUEST_ORDER';
  };

  // Single-pass high performance analysis for deduplication, stages, and regions
  const { deduplicationMap, duplicateOrdersCount, stageCounts, regionStats, sourceStats } = useMemo(() => {
    const map = new Map<string, RequestOrder[]>();
    const counts: Record<StageKey, number> = {
      ALL: orders.length,
      REQUEST_ORDER: 0,
      INPUT_DATA: 0,
      PILIH_PROSES: 0,
      KELOLA_PR: 0,
      READY_STOCK: 0,
      SURAT_JALAN: 0,
      ASET_SAMPAI: 0,
      CHECKLIST: 0,
      UPDATE_SLA: 0,
      SELESAI: 0,
      DIBATALKAN: 0,
    };
    let jaboOrders = 0, jaboItems = 0;
    let kalbarOrders = 0, kalbarItems = 0;
    let kalbarSheetCount = 0, jaboSheetCount = 0, manualCount = 0;

    for (let i = 0; i < orders.length; i++) {
      const ro = orders[i];
      const key = (ro.raw_ro_id || ro.ro_number).toLowerCase().trim();
      let list = map.get(key);
      if (!list) {
        list = [];
        map.set(key, list);
      }
      list.push(ro);

      const st = getRoStage(ro);
      counts[st] = (counts[st] || 0) + 1;

      const itLen = ro.items?.length || 0;
      if (ro.region === 'JABODETABEK') {
        jaboOrders++;
        jaboItems += itLen;
      } else if (ro.region === 'KALBAR') {
        kalbarOrders++;
        kalbarItems += itLen;
      }

      if (ro.source_type === 'GOOGLE_SHEET') {
        if (ro.region === 'KALBAR') kalbarSheetCount++;
        else jaboSheetCount++;
      } else {
        manualCount++;
      }
    }

    let dupeCount = 0;
    for (const list of map.values()) {
      if (list.length > 1) dupeCount += list.length;
    }

    return {
      deduplicationMap: map,
      duplicateOrdersCount: dupeCount,
      stageCounts: counts,
      regionStats: {
        ALL: { orders: orders.length, items: jaboItems + kalbarItems },
        JABODETABEK: { orders: jaboOrders, items: jaboItems },
        KALBAR: { orders: kalbarOrders, items: kalbarItems },
      },
      sourceStats: {
        ALL: orders.length,
        KALBAR_SHEET: kalbarSheetCount,
        JABO_SHEET: jaboSheetCount,
        MANUAL: manualCount,
      },
    };
  }, [orders]);

  // Filtered orders dengan fast exit
  const filteredOrders = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    return orders.filter((o) => {
      if (selectedRegion !== 'ALL' && o.region !== selectedRegion) return false;

      if (selectedSource === 'KALBAR_SHEET') {
        if (o.source_type !== 'GOOGLE_SHEET' || o.region !== 'KALBAR') return false;
      } else if (selectedSource === 'JABO_SHEET') {
        if (o.source_type !== 'GOOGLE_SHEET' || o.region !== 'JABODETABEK') return false;
      } else if (selectedSource === 'MANUAL') {
        if (o.source_type === 'GOOGLE_SHEET') return false;
      }

      const roStage = getRoStage(o);
      if (selectedStage !== 'ALL' && roStage !== selectedStage) return false;

      const key = (o.raw_ro_id || o.ro_number).toLowerCase().trim();
      const isDupe = (deduplicationMap.get(key)?.length || 0) > 1;

      if (smartFilter === 'CLEAN' && isDupe) return false;
      if (smartFilter === 'DUPLICATES' && !isDupe) return false;

      if (searchLower) {
        const matchSearch =
          o.ro_number.toLowerCase().includes(searchLower) ||
          o.branch_name.toLowerCase().includes(searchLower) ||
          (o.raw_ro_id && o.raw_ro_id.toLowerCase().includes(searchLower)) ||
          o.requester_name.toLowerCase().includes(searchLower);
        if (!matchSearch) return false;
      }

      return true;
    });
  }, [orders, search, selectedStage, smartFilter, selectedRegion, selectedSource, deduplicationMap]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedStage, smartFilter, selectedRegion, selectedSource]);

  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = useMemo(() => {
    if (pageSize === -1) return filteredOrders;
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Handler: Sync Google Sheet with Smart Deduplication
  const handleSyncSheet = async () => {
    try {
      setIsSyncing(true);
      setSyncFeedback('Menghubungkan ke Google Spreadsheet & menjalankan filter pintar anti-duplikasi...');
      const res = await fetch('/api/distribution/ro/sync-sheet', { method: 'POST' });
      const json = await res.json();

      if (json.success) {
        setSyncFeedback(json.message);
        // Refresh orders
        const getRes = await fetch('/api/distribution/ro');
        const getData = await getRes.json();
        if (getData.data) setOrders(getData.data);
      } else {
        setSyncFeedback(`Gagal: ${json.message}`);
      }
    } catch (e: any) {
      setSyncFeedback(`Terjadi kesalahan: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handler: Clean Duplicate ROs
  const handleCleanDuplicates = async () => {
    if (!confirm('Bersihkan semua entri RO duplikat? Sistem akan menyisakan 1 dokumen RO unik per ID.')) return;
    try {
      setIsSyncing(true);
      const res = await fetch('/api/distribution/ro/sync-sheet', { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setSyncFeedback(json.message);
        const getRes = await fetch('/api/distribution/ro');
        const getData = await getRes.json();
        if (getData.data) setOrders(getData.data);
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e?.message || 'Gagal sinkronisasi data' });
    } finally {
      setIsSyncing(false);
    }
  };

  // Handler: Save Process Decision (Stok vs PR vs Batal)
  const handleSaveProcessDecision = async () => {
    if (!selectedRoForProcess) return;
    try {
      setIsSubmitting(true);
      const activeItems = selectedRoForProcess.items.filter(it => it.stock_source !== 'CANCELLED');
      const allCancelled = selectedRoForProcess.items.length > 0 && activeItems.length === 0;

      const readyItems = activeItems.filter(it => it.stock_source === 'GUDANG_SCGA');
      const prItems = activeItems.filter(it => it.stock_source === 'PR_VENDOR');

      // 1. Otomatis terbitkan Surat Jalan jika ada item Ready Stock
      let autoSjNumber = '';
      if (readyItems.length > 0) {
        const sjPayload = {
          ro_id: selectedRoForProcess.id,
          ro_number: selectedRoForProcess.ro_number,
          branch_name: selectedRoForProcess.branch_name,
          region: selectedRoForProcess.region,
          delivery_date: selectedRoForProcess.target_delivery_date || new Date().toISOString().split('T')[0],
          driver_name: driverName || 'Driver Armada Logistik',
          vehicle_number: vehicleNumber || 'B 9482 SXZ',
          expedition: expedition || 'Armada Internal SCGA',
          sender_name: 'Staff SCGA Warehouse',
          receiver_name: `PIC ${selectedRoForProcess.branch_name}`,
          status: 'SHIPPED',
          items: readyItems.map((it) => ({
            id: `sji-${Date.now()}-${Math.random().toString().slice(-4)}`,
            item_name: it.item_name,
            specification: it.specification,
            quantity: it.quantity_ordered,
            unit: it.unit || 'Unit',
            notes: 'Dari Stok Gudang SCGA (Alokasi Otomatis)',
          })),
          notes: `Diterbitkan otomatis dari alokasi ${selectedRoForProcess.ro_number}`,
        };

        try {
          const sjRes = await fetch('/api/distribution/surat-jalan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sjPayload),
          });
          const sjJson = await sjRes.json();
          if (sjJson.success && sjJson.data?.sj_number) {
            autoSjNumber = sjJson.data.sj_number;
          }
        } catch (sjErr) {
          console.error('Auto-generate Surat Jalan error:', sjErr);
        }
      }

      let nextStage: StageKey;
      let nextStatus: ROStatus;

      if (allCancelled) {
        nextStage = 'DIBATALKAN';
        nextStatus = 'REJECTED';
      } else if (prItems.length === 0 && readyItems.length > 0) {
        // Seluruh item Ready Stock -> otomatis langsung berpindah ke Surat Jalan (Armada Siap Kirim)
        nextStage = 'SURAT_JALAN';
        nextStatus = 'IN_DELIVERY';
      } else {
        // Ada item yang belum tersedia -> otomatis masuk ke tahap Kelola PR (Vendor PO)
        nextStage = 'KELOLA_PR';
        nextStatus = 'NEED_PR';
      }

      const roPatchRes = await fetch('/api/distribution/ro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRoForProcess.id,
          updates: {
            ro_number: selectedRoForProcess.ro_number,
            items: selectedRoForProcess.items,
            current_stage: nextStage,
            status: nextStatus,
          },
        }),
      });

      const roPatchJson = await roPatchRes.json();
      if (!roPatchJson.success) {
        throw new Error(roPatchJson.error || 'Gagal menyimpan perubahan alokasi ke Supabase');
      }

      setOrders(prev => prev.map(o => {
        const isMatch = o.id === selectedRoForProcess.id || o.ro_number === selectedRoForProcess.ro_number;
        return isMatch ? {
          ...o,
          items: selectedRoForProcess.items,
          current_stage: nextStage,
          status: nextStatus,
        } : o;
      }));

      if (allCancelled) {
        setToast({ type: 'info', message: `Dokumen ${selectedRoForProcess.ro_number} dibatalkan & tersimpan di Supabase.` });
      } else if (prItems.length === 0 && readyItems.length > 0) {
        setToast({
          type: 'success',
          message: `Semua item Ready Stock tersimpan di Supabase! Surat Jalan (${autoSjNumber || 'SJ Baru'}) otomatis diterbitkan dan RO berpindah ke Surat Jalan.`,
        });
      } else if (readyItems.length === 0 && prItems.length > 0) {
        setToast({
          type: 'info',
          message: `Seluruh item belum tersedia tersimpan di Supabase. ${prItems.length} item otomatis dialihkan ke antrean Fitur PR (Vendor PO).`,
        });
      } else {
        setToast({
          type: 'success',
          message: `Alokasi tersimpan di Supabase: ${readyItems.length} item Ready Stock masuk Surat Jalan (${autoSjNumber || 'SJ Baru'}), dan ${prItems.length} item Belum Tersedia masuk antrean Fitur PR.`,
        });
      }

      setSelectedRoForProcess(null);
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', message: 'Gagal memproses alokasi RO' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Confirm Reject Whole RO from Process Modal
  const handleConfirmRejectRo = async () => {
    if (!selectedRoForProcess) return;
    try {
      setIsSubmitting(true);
      const reason = rejectReasonText.trim() || 'Dibatalkan oleh logistik pada tahap Pilih Proses';
      const rejectedItems = selectedRoForProcess.items.map(it => ({
        ...it,
        stock_source: 'CANCELLED' as const,
      }));

      await fetch('/api/distribution/ro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRoForProcess.id,
          updates: {
            items: rejectedItems,
            current_stage: 'DIBATALKAN',
            status: 'REJECTED',
            rejection_reason: reason,
            rejected_at: new Date().toISOString(),
          },
        }),
      });

      setOrders(prev => prev.map(o => o.id === selectedRoForProcess.id ? {
        ...o,
        items: rejectedItems,
        current_stage: 'DIBATALKAN',
        status: 'REJECTED',
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
      } : o));

      setRejectReasonModalOpen(false);
      setRejectReasonText('');
      setToast({ type: 'info', message: `Dokumen ${selectedRoForProcess.ro_number} berhasil dibatalkan.` });
      setSelectedRoForProcess(null);
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', message: 'Gagal membatalkan RO' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Restore Canceled RO back to Pilih Proses
  const handleReactivateRo = async (ro: RequestOrder) => {
    if (!confirm(`Pulihkan dan buka kembali dokumen RO ${ro.ro_number} ke tahap Pilih Proses?`)) return;
    try {
      setIsSubmitting(true);
      const restoredItems = ro.items.map(it => ({
        ...it,
        stock_source: (it.stock_source === 'CANCELLED' ? 'GUDANG_SCGA' : it.stock_source) as any,
      }));

      await fetch('/api/distribution/ro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ro.id,
          updates: {
            items: restoredItems,
            current_stage: 'PILIH_PROSES',
            status: 'PENDING',
            rejection_reason: null,
            rejected_at: null,
          },
        }),
      });

      setOrders(prev => prev.map(o => o.id === ro.id ? {
        ...o,
        items: restoredItems,
        current_stage: 'PILIH_PROSES',
        status: 'PENDING',
        rejection_reason: null,
        rejected_at: null,
      } : o));
      setToast({ type: 'success', message: `Dokumen ${ro.ro_number} berhasil dipulihkan!` });
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', message: 'Gagal memulihkan RO' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Save PR & Arrival
  const handleSavePrArrival = async (isArrivedConfirm = false) => {
    if (!selectedRoForPr) return;
    try {
      setIsSubmitting(true);
      const updatedItems = selectedRoForPr.items.map(it => {
        if (it.stock_source === 'PR_VENDOR') {
          return {
            ...it,
            pr_vendor_name: prVendor || it.pr_vendor_name,
            pr_po_number: prPoNo || it.pr_po_number,
            pr_arrival_date: prArrivalTarget || it.pr_arrival_date,
            is_arrived_at_warehouse: isArrivedConfirm ? true : it.is_arrived_at_warehouse,
            quantity_fulfilled: isArrivedConfirm ? it.quantity_ordered : it.quantity_fulfilled,
          };
        }
        return it;
      });

      const nextStage: StageKey = isArrivedConfirm ? 'READY_STOCK' : 'KELOLA_PR';
      const nextStatus: ROStatus = isArrivedConfirm ? 'READY_STOCK' : 'NEED_PR';

      await fetch('/api/distribution/ro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRoForPr.id,
          updates: {
            items: updatedItems,
            pr_vendor_name: prVendor || selectedRoForPr.pr_vendor_name,
            pr_po_number: prPoNo || selectedRoForPr.pr_po_number,
            pr_estimated_arrival: prArrivalTarget || selectedRoForPr.pr_estimated_arrival,
            arrival_datetime: isArrivedConfirm ? new Date().toISOString() : selectedRoForPr.arrival_datetime,
            current_stage: nextStage,
            status: nextStatus,
          },
        }),
      });

      setOrders(prev => prev.map(o => o.id === selectedRoForPr.id ? {
        ...o,
        items: updatedItems,
        pr_vendor_name: prVendor || o.pr_vendor_name,
        pr_po_number: prPoNo || o.pr_po_number,
        pr_estimated_arrival: prArrivalTarget || o.pr_estimated_arrival,
        arrival_datetime: isArrivedConfirm ? new Date().toISOString() : o.arrival_datetime,
        current_stage: nextStage,
        status: nextStatus,
      } : o));

      setSelectedRoForPr(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Generate SJ
  const handleGenerateSuratJalan = async () => {
    if (!selectedRoForSj) return;
    try {
      setIsSubmitting(true);
      const payload = {
        ro_id: selectedRoForSj.id,
        ro_number: selectedRoForSj.ro_number,
        branch_name: selectedRoForSj.branch_name,
        region: selectedRoForSj.region,
        delivery_date: new Date().toISOString().split('T')[0],
        driver_name: driverName,
        vehicle_number: vehicleNumber,
        expedition: expedition,
        sender_name: 'Staff SCGA Warehouse',
        receiver_name: `PIC ${selectedRoForSj.branch_name}`,
        status: 'SHIPPED',
        items: selectedRoForSj.items
          .filter(it => it.stock_source !== 'CANCELLED')
          .map((it) => ({
            id: `sji-${Date.now()}-${Math.random().toString().slice(-4)}`,
            item_name: it.item_name,
            specification: it.specification,
            quantity: it.quantity_ordered,
            unit: it.unit || 'Unit',
            notes: it.stock_source === 'GUDANG_SCGA' ? 'Dari Stok Gudang SCGA' : 'Pengadaan PR Vendor (Aset Tiba)',
          })),
        notes: `Diterbitkan otomatis dari ${selectedRoForSj.ro_number}`,
      };

      const res = await fetch('/api/distribution/surat-jalan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success && json.data) {
        await fetch('/api/distribution/ro', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedRoForSj.id,
            updates: {
              status: 'IN_DELIVERY',
              current_stage: 'SURAT_JALAN',
            },
          }),
        });

        setOrders(prev => prev.map(o => o.id === selectedRoForSj.id ? {
          ...o,
          status: 'IN_DELIVERY',
          current_stage: 'SURAT_JALAN',
        } : o));

        setSelectedRoForSj(null);
        router.push(`/distribution/surat-jalan/print/${json.data.id}`);
      }
    } catch (err) {
      console.error('Failed to generate Surat Jalan:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Confirm Arrival (Belum vs Ya)
  const handleConfirmArrival = async (isArrived: boolean) => {
    if (!selectedRoForArrival) return;
    try {
      setIsSubmitting(true);
      if (!isArrived) {
        // Loopback branch: masih dalam perjalanan
        await fetch('/api/distribution/ro', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedRoForArrival.id,
            updates: {
              notes: `${selectedRoForArrival.notes || ''} [Loopback Kirim: Aset masih dalam perjalanan armada]`,
            },
          }),
        });
        setToast({ type: 'info', message: 'Status diperbarui: Armada masih dalam perjalanan menuju cabang.' });
        setSelectedRoForArrival(null);
      } else {
        // Ya -> Lanjut Checklist
        await fetch('/api/distribution/ro', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedRoForArrival.id,
            updates: {
              current_stage: 'CHECKLIST',
              arrival_datetime: new Date().toISOString(),
            },
          }),
        });

        setOrders(prev => prev.map(o => o.id === selectedRoForArrival.id ? {
          ...o,
          current_stage: 'CHECKLIST',
          arrival_datetime: new Date().toISOString(),
        } : o));

        const curr = selectedRoForArrival;
        setSelectedRoForArrival(null);
        // Open checklist directly
        openChecklistModal(curr);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openChecklistModal = (ro: RequestOrder) => {
    setSelectedRoForChecklist(ro);
    const initialChecked: Record<string, { qty: number; condition: string; checked: boolean }> = {};
    ro.items.forEach(it => {
      initialChecked[it.id] = {
        qty: it.quantity_ordered,
        condition: 'BAIK',
        checked: true,
      };
    });
    setCheckedItems(initialChecked);
    setPicReceiver(ro.pic_receiver || `Store Manager ${ro.branch_name}`);
  };

  // Handler: Save Checklist & SLA & Complete
  const handleSaveChecklistAndComplete = async () => {
    if (!selectedRoForChecklist) return;
    try {
      setIsSubmitting(true);

      // SLA calculation
      const reqDate = new Date(selectedRoForChecklist.request_date).getTime();
      const recDate = new Date(receivedDate).getTime();
      const leadTimeDays = Math.max(1, Math.round((recDate - reqDate) / (1000 * 60 * 60 * 24)));
      const isSlaOnTime = leadTimeDays <= 14;

      const updatedItems = selectedRoForChecklist.items.map(it => {
        const check = checkedItems[it.id];
        return {
          ...it,
          quantity_fulfilled: check?.qty || it.quantity_ordered,
          condition: check?.condition || 'BAIK',
        };
      });

      await fetch('/api/distribution/ro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRoForChecklist.id,
          updates: {
            items: updatedItems,
            status: 'COMPLETED',
            current_stage: 'SELESAI',
            received_date: receivedDate,
            pic_receiver: picReceiver,
            checklist_notes: checklistNotes,
            sla_lead_time_days: leadTimeDays,
            sla_status: isSlaOnTime ? 'ON_TIME' : 'DELAYED',
          },
        }),
      });

      setOrders(prev => prev.map(o => o.id === selectedRoForChecklist.id ? {
        ...o,
        items: updatedItems,
        status: 'COMPLETED',
        current_stage: 'SELESAI',
        received_date: receivedDate,
        pic_receiver: picReceiver,
        checklist_notes: checklistNotes,
        sla_lead_time_days: leadTimeDays,
        sla_status: isSlaOnTime ? 'ON_TIME' : 'DELAYED',
      } : o));

      setToast({
        type: 'success',
        message: `Alur Selesai! Aset telah diterima di ${selectedRoForChecklist.branch_name}. Lead time SLA: ${leadTimeDays} hari (${isSlaOnTime ? 'ON-TIME' : 'DELAYED'}).`,
      });
      setSelectedRoForChecklist(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Add Item to RO
  const handleAddItemToRo = () => {
    if (!itemName.trim()) return;
    setItemsList((prev) => [
      ...prev,
      {
        id: `roi-${Date.now()}`,
        item_name: itemName.trim(),
        quantity_ordered: itemQty,
        quantity_fulfilled: stockSource === 'GUDANG_SCGA' ? itemQty : 0,
        stock_source: stockSource,
      },
    ]);
    setItemName('');
    setItemQty(1);
  };

  const handleSubmitRo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemsList.length === 0) {
      setToast({ type: 'error', message: 'Tambahkan minimal 1 item untuk RO ini.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Partial<RequestOrder> = {
        ro_number: `RO-CA-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
        branch_name: branchName,
        region,
        requester_name: requesterName,
        request_date: new Date().toISOString().split('T')[0],
        target_delivery_date: targetDeliveryDate || undefined,
        status: 'INPUT_SYSTEM',
        current_stage: 'REQUEST_ORDER',
        source_type: 'MANUAL',
        items: itemsList,
        notes,
      };

      const res = await fetch('/api/distribution/ro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setOrders((prev) => [json.data, ...prev]);
        setIsRoModalOpen(false);
        setItemsList([]);
        setNotes('');
      }
    } catch (err) {
      console.error('Failed to create RO:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. TOP PIPELINE STEPPER BAR (9 TAHAP SESUAI DIAGRAM) - COLLAPSIBLE */}
      <div className="panel-card p-3.5 md:p-4 border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-xs transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0">
              <GitMerge className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-xs md:text-sm text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Alur Operasional RO (Pipeline 9-Tahap)
                </h3>
                {selectedStage !== 'ALL' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]">
                    Tahap: {WORKFLOW_STAGES.find((s) => s.key === selectedStage)?.label || selectedStage}
                  </span>
                ) : (
                  <span className="text-[11px] text-[#747775] dark:text-[#8e918f] hidden md:inline">
                    • Semua Tahap Aktif
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#747775] dark:text-[#8e918f] truncate">
                {showPipelineStepper ? 'Klik kotak tahapan untuk memfilter tabel' : 'Klik tombol di kanan untuk membuka visual diagram alur'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {selectedStage !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedStage('ALL')}
                className="text-xs font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline"
              >
                Reset Filter
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowPipelineStepper(!showPipelineStepper)}
              className="interactive-tap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#e9eef6] dark:hover:bg-[#35383a] transition-all shadow-2xs"
            >
              <span>{showPipelineStepper ? 'Sembunyikan Alur' : 'Buka Diagram Alur'}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-[#747775] dark:text-[#8e918f] transition-transform duration-200 ${
                  showPipelineStepper ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Collapsible Stepper Content */}
        {showPipelineStepper && (
          <div className="overflow-x-auto pt-3 mt-3 border-t border-[#e0e2ec] dark:border-[#35383a] custom-scrollbar animate-in fade-in duration-200">
            <div className="min-w-[980px] flex items-center justify-between gap-2 py-1">
              {WORKFLOW_STAGES.map((st, idx) => {
                const isActive = selectedStage === st.key;
                const count = stageCounts[st.key] || 0;
                const isPill = st.shape === 'pill';
                const isDiamond = st.shape === 'diamond';

                return (
                  <React.Fragment key={st.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedStage(isActive ? 'ALL' : st.key)}
                      className={`interactive-tap group relative flex flex-col items-center justify-center p-2 transition-all cursor-pointer text-center shrink-0 border-2 ${st.color} ${
                        isPill ? 'rounded-full px-3 py-1.5' : isDiamond ? 'rounded-lg w-[84px] h-[64px]' : 'rounded-xl w-[92px] h-[64px]'
                      } ${isActive ? 'ring-3 ring-blue-500 shadow-md scale-105' : 'hover:scale-102 hover:shadow-xs'}`}
                    >
                      <div className="flex items-center gap-1 font-bold text-[10px] leading-tight">
                        <span>{st.label}</span>
                      </div>
                      <div className="text-[9px] opacity-75">{st.sub}</div>
                      <span className="mt-0.5 inline-flex items-center justify-center px-1.5 rounded-full text-[9px] font-bold bg-slate-800 dark:bg-white text-white dark:text-slate-900">
                        {count}
                      </span>
                    </button>

                    {idx < WORKFLOW_STAGES.length - 1 && (
                      <div className="flex items-center justify-center text-[#c4c7c5] dark:text-[#444746] shrink-0">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. ACTIONS & SMART DEDUPLICATION TOOLBAR */}
      <div className="panel-card p-4 space-y-3 border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#747775] dark:text-[#8e918f]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor RO, ID, nama item, atau cabang..."
              className="w-full rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] pl-9 pr-4 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sync Official Google Sheet */}
            <button
              onClick={handleSyncSheet}
              disabled={isSyncing}
              className="interactive-tap flex items-center gap-1.5 rounded-full border border-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-3.5 py-2 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Tarik Spreadsheet RO'}</span>
            </button>

            {/* Tarik Data Excel Paste */}
            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="interactive-tap flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#282a2c] text-[#1f1f1f] dark:text-[#e3e3e3] px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>Import CSV/Excel</span>
            </button>

            {/* Column Visibility Picker */}
            <ColumnVisibilityPicker
              columns={RO_COLUMNS}
              visibleColumns={visibleColumns}
              onChange={setVisibleColumns}
              storageKey="ca_ro_columns"
            />

            {/* Buat RO Baru */}
            <button
              onClick={() => setIsRoModalOpen(true)}
              className="interactive-tap flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] px-4 py-2 text-xs font-semibold hover:bg-[#0842a0] transition-colors shadow-sm shrink-0"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Buat RO Baru</span>
            </button>
          </div>
        </div>

        {/* REGION, SOURCE & SMART DEDUPLICATION CONTROLS BAR */}
        <div className="flex flex-col gap-2.5 pt-2.5 border-t border-[#e0e2ec] dark:border-[#35383a] text-xs">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 flex-wrap">
            {/* Region Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[#747775] dark:text-[#8e918f] uppercase tracking-wider text-[10px] flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                Wilayah:
              </span>
              <div className="inline-flex rounded-lg border border-[#e0e2ec] dark:border-[#444746] p-0.5 bg-[#f8f9fa] dark:bg-[#282a2c]">
                {(['ALL', 'JABODETABEK', 'KALBAR'] as const).map((reg) => {
                  const stat = regionStats[reg] || { orders: 0, items: 0 };
                  return (
                    <button
                      key={reg}
                      onClick={() => setSelectedRegion(reg)}
                      className={`interactive-tap px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        selectedRegion === reg
                          ? 'bg-[#0b57d0] text-white shadow-xs'
                          : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
                      }`}
                    >
                      {reg === 'ALL' ? 'Semua Wilayah' : reg === 'JABODETABEK' ? 'Area Jabo' : 'Area Kalbar'}{' '}
                      ({stat.orders})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Source Filter Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[#747775] dark:text-[#8e918f] uppercase tracking-wider text-[10px] flex items-center gap-1">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                Sumber:
              </span>
              <div className="inline-flex rounded-lg border border-[#e0e2ec] dark:border-[#444746] p-0.5 bg-[#f8f9fa] dark:bg-[#282a2c] flex-wrap">
                <button
                  onClick={() => setSelectedSource('ALL')}
                  className={`interactive-tap px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    selectedSource === 'ALL' ? 'bg-white dark:bg-[#1a1c1e] text-[#0b57d0] font-bold shadow-xs' : 'text-[#747775]'
                  }`}
                >
                  Semua ({sourceStats.ALL})
                </button>
                <button
                  onClick={() => setSelectedSource('KALBAR_SHEET')}
                  className={`interactive-tap px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    selectedSource === 'KALBAR_SHEET' ? 'bg-white dark:bg-[#1a1c1e] text-emerald-600 font-bold shadow-xs' : 'text-[#747775]'
                  }`}
                >
                  Sheet Kalbar ({sourceStats.KALBAR_SHEET})
                </button>
                <button
                  onClick={() => setSelectedSource('JABO_SHEET')}
                  className={`interactive-tap px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    selectedSource === 'JABO_SHEET' ? 'bg-white dark:bg-[#1a1c1e] text-blue-600 font-bold shadow-xs' : 'text-[#747775]'
                  }`}
                >
                  Sheet Jabo ({sourceStats.JABO_SHEET})
                </button>
                <button
                  onClick={() => setSelectedSource('MANUAL')}
                  className={`interactive-tap px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    selectedSource === 'MANUAL' ? 'bg-white dark:bg-[#1a1c1e] text-purple-600 font-bold shadow-xs' : 'text-[#747775]'
                  }`}
                >
                  Manual ({sourceStats.MANUAL})
                </button>
              </div>
            </div>

            {/* Deduplication Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[#747775] dark:text-[#8e918f] uppercase tracking-wider text-[10px] flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Duplikasi:
              </span>
              <div className="inline-flex rounded-lg border border-[#e0e2ec] dark:border-[#444746] p-0.5 bg-[#f8f9fa] dark:bg-[#282a2c]">
                <button
                  onClick={() => setSmartFilter('ALL')}
                  className={`interactive-tap px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    smartFilter === 'ALL' ? 'bg-white dark:bg-[#1a1c1e] text-[#0b57d0] font-bold shadow-xs' : 'text-[#747775]'
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setSmartFilter('CLEAN')}
                  className={`interactive-tap px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    smartFilter === 'CLEAN' ? 'bg-white dark:bg-[#1a1c1e] text-emerald-600 font-bold shadow-xs' : 'text-[#747775]'
                  }`}
                >
                  Bersih ({orders.length - (duplicateOrdersCount > 0 ? duplicateOrdersCount - deduplicationMap.size : 0)})
                </button>
                <button
                  onClick={() => setSmartFilter('DUPLICATES')}
                  className={`interactive-tap px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    smartFilter === 'DUPLICATES' ? 'bg-white dark:bg-[#1a1c1e] text-amber-600 font-bold shadow-xs' : 'text-[#747775]'
                  }`}
                >
                  Duplikat ({duplicateOrdersCount})
                </button>
              </div>

              {duplicateOrdersCount > 0 && (
                <button
                  onClick={handleCleanDuplicates}
                  className="flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline ml-1"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Bersihkan</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sync Feedback Toast */}
        {syncFeedback && (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
              <span>{syncFeedback}</span>
            </div>
            <button onClick={() => setSyncFeedback(null)} className="p-1 hover:bg-blue-100 rounded">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 3. RO DATA TABLE */}
      <div className="panel-card overflow-hidden border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
            <thead className="bg-[#f0f4f9] dark:bg-[#202225] text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] border-b border-[#e0e2ec] dark:border-[#444746]">
              <tr>
                {visibleColumns.ro_number !== false && <th className="py-3.5 px-4">No. RO / ID</th>}
                {visibleColumns.order_date !== false && <th className="py-3.5 px-4">Tanggal Order</th>}
                {visibleColumns.request_date !== false && <th className="py-3.5 px-4">Tanggal Permintaan</th>}
                {visibleColumns.branch !== false && <th className="py-3.5 px-4">Cabang Outlet</th>}
                {visibleColumns.items !== false && <th className="py-3.5 px-4">Item &amp; Alokasi</th>}
                {visibleColumns.images !== false && <th className="py-3.5 px-4 text-center">Gambar</th>}
                {visibleColumns.stage !== false && <th className="py-3.5 px-4">Tahapan Alur Operasional</th>}
                {visibleColumns.actions !== false && <th className="py-3.5 px-4 text-right">Aksi Alur Kerja</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    {visibleColumns.ro_number !== false && <td className="py-4 px-4"><div className="h-4 w-20 bg-slate-200 dark:bg-slate-700/60 rounded"></div></td>}
                    {visibleColumns.order_date !== false && <td className="py-4 px-4"><div className="h-4 w-20 bg-slate-200 dark:bg-slate-700/60 rounded"></div></td>}
                    {visibleColumns.request_date !== false && <td className="py-4 px-4"><div className="h-4 w-20 bg-slate-200 dark:bg-slate-700/60 rounded"></div></td>}
                    {visibleColumns.branch !== false && <td className="py-4 px-4"><div className="h-4 w-36 bg-slate-200 dark:bg-slate-700/60 rounded"></div></td>}
                    {visibleColumns.items !== false && <td className="py-4 px-4"><div className="h-4 w-44 bg-slate-200 dark:bg-slate-700/60 rounded"></div></td>}
                    {visibleColumns.images !== false && <td className="py-4 px-4 text-center"><div className="h-10 w-10 bg-slate-200 dark:bg-slate-700/60 rounded-lg mx-auto"></div></td>}
                    {visibleColumns.stage !== false && <td className="py-4 px-4"><div className="h-6 w-28 bg-slate-200 dark:bg-slate-700/60 rounded-full"></div></td>}
                    {visibleColumns.actions !== false && <td className="py-4 px-4 text-right"><div className="h-7 w-24 bg-slate-200 dark:bg-slate-700/60 rounded-full ml-auto"></div></td>}
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={visibleColCount} className="py-12 text-center text-[#747775] dark:text-[#8e918f]">
                    Tidak ada dokumen Request Order (RO) yang cocok dengan filter aktif.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((o) => {
                  const stage = getRoStage(o);
                  const isCancelled = stage === 'DIBATALKAN';
                  const isCompleted = stage === 'SELESAI';
                  const isInDelivery = stage === 'SURAT_JALAN';
                  const isReadyStock = stage === 'READY_STOCK';
                  const isNeedPr = stage === 'KELOLA_PR';
                  const isPilihProses = stage === 'PILIH_PROSES' || stage === 'REQUEST_ORDER' || stage === 'INPUT_DATA';
                  const isChecklist = stage === 'CHECKLIST' || stage === 'ASET_SAMPAI';

                  const key = (o.raw_ro_id || o.ro_number).toLowerCase().trim();
                  const isDupe = (deduplicationMap.get(key)?.length || 0) > 1;
                  const uniqueItems = getUniqueRoItems(o.items);

                  return (
                    <tr key={o.id} className="hover:bg-[#f0f4f9]/50 dark:hover:bg-[#282a2c]/50 transition-colors">
                      {/* RO ID */}
                      {visibleColumns.ro_number !== false && (
                        <td className="py-3.5 px-4 font-mono font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                          <div>{o.ro_number}</div>
                          {o.source_type === 'GOOGLE_SHEET' && (
                            <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              Sheet Resmi
                            </span>
                          )}
                          {isDupe && (
                            <span className="inline-block mt-0.5 ml-1 text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold">
                              Duplikat ID
                            </span>
                          )}
                        </td>
                      )}

                      {/* Tanggal Order */}
                      {visibleColumns.order_date !== false && (
                        <td className="py-3.5 px-4 text-[#444746] dark:text-[#c4c7c5] whitespace-nowrap">
                          <div className="font-medium text-[#1f1f1f] dark:text-[#e3e3e3]">{o.request_date || '-'}</div>
                        </td>
                      )}

                      {/* Tanggal Permintaan (Data dari Sheet) */}
                      {visibleColumns.request_date !== false && (
                        <td className="py-3.5 px-4 text-[#444746] dark:text-[#c4c7c5] whitespace-nowrap">
                          <div className="font-medium text-[#1f1f1f] dark:text-[#e3e3e3]">{o.target_delivery_date || '-'}</div>
                        </td>
                      )}

                      {/* Branch & Region */}
                      {visibleColumns.branch !== false && (
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">{o.branch_name}</div>
                          <div className="text-[10px] text-[#747775]">{o.region} &bull; {o.requester_name}</div>
                        </td>
                      )}

                      {/* Items */}
                      {visibleColumns.items !== false && (
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="space-y-1">
                            {uniqueItems.slice(0, 3).map((it, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                                <Package className="h-3 w-3 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                                <span className={`font-medium truncate ${it.stock_source === 'CANCELLED' ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                                  {it.item_name}
                                </span>
                                <span className="text-[#747775] shrink-0">
                                  (x{it.quantity_ordered} {it.unit || 'unit'})
                                </span>
                                {it.stock_source === 'PR_VENDOR' && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                                    PR
                                  </span>
                                )}
                                {it.stock_source === 'CANCELLED' && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                    Ditolak
                                  </span>
                                )}
                              </div>
                            ))}
                            {uniqueItems.length > 3 && (
                              <span className="text-[10px] font-semibold text-[#0b57d0]">
                                +{uniqueItems.length - 3} item lainnya
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Kolom Gambar (Sesuai Master Aset) */}
                      {visibleColumns.images !== false && (
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap max-w-[130px]">
                            {uniqueItems.slice(0, 3).map((it, idx) => {
                              const imgUrl = getItemImageUrl(it.item_name);
                              return (
                                <div key={idx} className="relative group">
                                  {imgUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewImage({ url: imgUrl, title: it.item_name })}
                                      className="relative block w-10 h-10 rounded-lg border border-[#e0e2ec] dark:border-[#444746] overflow-hidden hover:ring-2 hover:ring-[#0b57d0] hover:scale-110 transition-all shadow-2xs bg-white dark:bg-[#282a2c] shrink-0"
                                      title={`Klik perbesar: ${it.item_name}`}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={imgUrl}
                                        alt={it.item_name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setUploadModalTarget({ itemName: it.item_name, currentImageUrl: null })}
                                      className="w-10 h-10 rounded-lg border border-dashed border-amber-300 dark:border-amber-700/80 bg-amber-50/60 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 flex flex-col items-center justify-center text-amber-700 dark:text-amber-400 text-[8px] shrink-0 transition group/upload"
                                      title={`Klik untuk upload foto ke Supabase (maks 100 KB): ${it.item_name}`}
                                    >
                                      <Upload className="h-3.5 w-3.5 mb-0.5 group-hover/upload:scale-110 transition-transform" />
                                      <span className="font-semibold text-[8px]">Upload</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            {uniqueItems.length > 3 && (
                              <span className="text-[10px] text-[#747775] font-semibold">
                                +{uniqueItems.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Stage Progress Badge */}
                      {visibleColumns.stage !== false && (
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isCancelled
                              ? 'bg-rose-100 text-rose-950 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800'
                              : isCompleted
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : isInDelivery
                              ? 'bg-teal-100 text-teal-900 border border-teal-300'
                              : isReadyStock
                              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                              : isNeedPr
                              ? 'bg-orange-100 text-orange-950 border border-orange-300'
                              : isChecklist
                              ? 'bg-cyan-100 text-cyan-950 border border-cyan-300'
                              : 'bg-blue-50 text-blue-900 border border-blue-200'
                          }`}>
                            {isCancelled ? <Ban className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" /> :
                             isCompleted ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> :
                             isInDelivery ? <Truck className="h-3.5 w-3.5 text-teal-600" /> :
                             isReadyStock ? <Boxes className="h-3.5 w-3.5 text-emerald-600" /> :
                             isNeedPr ? <Clock className="h-3.5 w-3.5 text-orange-600" /> :
                             <GitMerge className="h-3.5 w-3.5 text-blue-600" />}
                            <span>{WORKFLOW_STAGES.find(s => s.key === stage)?.label || stage}</span>
                          </span>
                          {isCancelled && o.rejection_reason && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 max-w-[200px] truncate" title={o.rejection_reason}>
                              Alasan: {o.rejection_reason}
                            </div>
                          )}
                        </td>
                      )}

                      {/* Contextual Action Buttons */}
                      {visibleColumns.actions !== false && (
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* 0. Tahap Dibatalkan -> Pulihkan / Buka Kembali */}
                            {isCancelled && (
                              <button
                                onClick={() => handleReactivateRo(o)}
                                className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 px-3 py-1 text-[11px] font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 shadow-xs flex items-center gap-1"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Pulihkan RO</span>
                              </button>
                            )}

                            {/* 1. Tahap Pilih Proses */}
                            {isPilihProses && (
                              <button
                                onClick={() => setSelectedRoForProcess({ ...o, items: uniqueItems })}
                                className="rounded-full bg-[#0b57d0] text-white px-3 py-1 text-[11px] font-semibold hover:bg-[#0842a0] shadow-xs flex items-center gap-1"
                              >
                                <GitMerge className="h-3 w-3" />
                                <span>Pilih Proses</span>
                              </button>
                            )}

                            {/* 2. Tahap Kelola PR */}
                            {isNeedPr && (
                              <button
                                onClick={() => {
                                  setSelectedRoForPr(o);
                                  setPrVendor(o.pr_vendor_name || '');
                                  setPrPoNo(o.pr_po_number || '');
                                  setPrArrivalTarget(o.pr_estimated_arrival || '');
                                }}
                                className="rounded-full bg-orange-600 text-white px-3 py-1 text-[11px] font-semibold hover:bg-orange-700 shadow-xs flex items-center gap-1"
                              >
                                <Clock className="h-3 w-3" />
                                <span>Kelola PR &amp; Kedatangan</span>
                              </button>
                            )}

                            {/* 3. Tahap Ready Stock -> Buat SJ */}
                            {isReadyStock && (
                              <button
                                onClick={() => setSelectedRoForSj(o)}
                                className="rounded-full bg-emerald-700 text-white px-3 py-1 text-[11px] font-semibold hover:bg-emerald-800 shadow-xs flex items-center gap-1"
                              >
                                <Printer className="h-3 w-3" />
                                <span>Terbitkan Surat Jalan</span>
                              </button>
                            )}

                            {/* 4. Tahap Dalam Kirim -> Konfirmasi Sampai? */}
                            {isInDelivery && (
                              <button
                                onClick={() => setSelectedRoForArrival(o)}
                                className="rounded-full bg-teal-700 text-white px-3 py-1 text-[11px] font-semibold hover:bg-teal-800 shadow-xs flex items-center gap-1"
                              >
                                <HelpCircle className="h-3 w-3" />
                                <span>Aset Sampai?</span>
                              </button>
                            )}

                            {/* 5. Tahap Checklist Penerimaan */}
                            {isChecklist && (
                              <button
                                onClick={() => openChecklistModal(o)}
                                className="rounded-full bg-cyan-700 text-white px-3 py-1 text-[11px] font-semibold hover:bg-cyan-800 shadow-xs flex items-center gap-1"
                              >
                                <CheckSquare className="h-3 w-3" />
                                <span>Checklist Diterima</span>
                              </button>
                            )}

                            {/* 6. Completed */}
                            {isCompleted && (
                              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Selesai</span>
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION BAR */}
        {filteredOrders.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 border-t border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#1a1c1e] text-xs">
            <div className="text-[#444746] dark:text-[#c4c7c5]">
              Menampilkan{' '}
              <strong className="text-[#1f1f1f] dark:text-white">
                {pageSize === -1 ? 1 : (currentPage - 1) * pageSize + 1}
              </strong>{' '}
              -{' '}
              <strong className="text-[#1f1f1f] dark:text-white">
                {pageSize === -1 ? filteredOrders.length : Math.min(currentPage * pageSize, filteredOrders.length)}
              </strong>{' '}
              dari <strong className="text-[#0b57d0] dark:text-[#a8c7fa]">{filteredOrders.length} Dokumen RO</strong>{' '}
              <span className="text-[#747775]">
                (Total {filteredOrders.reduce((sum, o) => sum + (o.items?.length || 0), 0)} Baris Item)
              </span>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#747775]">Tampilkan:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#202225] px-2 py-1 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none"
                >
                  <option value={25}>25 per hal</option>
                  <option value={50}>50 per hal</option>
                  <option value={100}>100 per hal</option>
                  <option value={250}>250 per hal</option>
                  <option value={-1}>Semua Data</option>
                </select>
              </div>

              {pageSize !== -1 && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 rounded-md border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#202225] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                  >
                    Sebelumnya
                  </button>
                  <span className="px-2 py-1 text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                    Hal {currentPage} dari {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 rounded-md border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#202225] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                  >
                    Selanjutnya
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: PILIH PROSES (STOK SCGA VS PR VENDOR) */}
      {/* ========================================================= */}
      {selectedRoForProcess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="spring-pop panel-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1e1f20] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#35383a] pb-3">
              <div className="flex items-center gap-2">
                <GitMerge className="h-5 w-5 text-[#0b57d0]" />
                <div>
                  <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Tahap 3: Pilih Proses Alokasi
                  </h3>
                  <p className="text-[11px] text-[#747775]">
                    Tentukan ketersediaan stok fisik di Gudang SCGA vs butuh Pengadaan PR baru
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedRoForProcess(null)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-[#e0e2ec] dark:border-[#35383a] space-y-1">
                <div className="flex justify-between items-center">
                  <div><strong>No. RO:</strong> {selectedRoForProcess.ro_number}</div>
                  <div className="text-[11px] text-[#747775]"><strong>Target Permintaan:</strong> {selectedRoForProcess.target_delivery_date || '-'}</div>
                </div>
                <div><strong>Cabang:</strong> {selectedRoForProcess.branch_name} ({selectedRoForProcess.region})</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs">Pilih Status Ketersediaan Tiap Item:</div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = selectedRoForProcess.items.map(it => ({ ...it, stock_source: 'GUDANG_SCGA' as const }));
                        setSelectedRoForProcess({ ...selectedRoForProcess, items: updated });
                      }}
                      className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 hover:bg-emerald-200"
                    >
                      Semua Stok
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = selectedRoForProcess.items.map(it => ({ ...it, stock_source: 'PR_VENDOR' as const }));
                        setSelectedRoForProcess({ ...selectedRoForProcess, items: updated });
                      }}
                      className="text-[10px] px-2 py-0.5 rounded font-semibold bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border border-orange-300 hover:bg-orange-200"
                    >
                      Semua PR
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = selectedRoForProcess.items.map(it => ({ ...it, stock_source: 'CANCELLED' as const }));
                        setSelectedRoForProcess({ ...selectedRoForProcess, items: updated });
                      }}
                      className="text-[10px] px-2 py-0.5 rounded font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 hover:bg-rose-200"
                    >
                      Semua Tolak
                    </button>
                  </div>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedRoForProcess.items.map((it, idx) => {
                    const imgUrl = getItemImageUrl(it.item_name);
                    return (
                      <div key={it.id || idx} className="flex items-center justify-between p-2.5 rounded-lg border border-[#e0e2ec] dark:border-[#35383a] bg-white dark:bg-[#282a2c]">
                        <div className="flex items-center gap-2.5 pr-2 min-w-0">
                          {imgUrl ? (
                            <button
                              type="button"
                              onClick={() => setPreviewImage({ url: imgUrl, title: it.item_name })}
                              className="shrink-0 w-10 h-10 rounded-lg border border-[#e0e2ec] dark:border-[#444746] overflow-hidden hover:scale-105 transition-transform"
                              title="Klik untuk memperbesar foto"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={imgUrl} alt={it.item_name} className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <div className="shrink-0 w-10 h-10 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-center text-slate-400">
                              <ImageIcon className="h-4 w-4 opacity-40" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className={`font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] truncate ${it.stock_source === 'CANCELLED' ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                              {it.item_name}
                            </div>
                            <div className="text-[10px] text-[#747775]">Jumlah: {it.quantity_ordered} {it.unit || 'unit'}</div>
                          </div>
                        </div>
                      <select
                        value={it.stock_source || 'GUDANG_SCGA'}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          const updated = [...selectedRoForProcess.items];
                          updated[idx] = { ...updated[idx], stock_source: val };
                          setSelectedRoForProcess({ ...selectedRoForProcess, items: updated });
                        }}
                        className={`rounded-lg border px-2 py-1 text-xs font-semibold outline-hidden transition-colors ${
                          it.stock_source === 'CANCELLED'
                            ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/50 dark:border-rose-700 dark:text-rose-200'
                            : it.stock_source === 'PR_VENDOR'
                            ? 'bg-orange-50 border-orange-300 text-orange-800 dark:bg-orange-950/50 dark:border-orange-700 dark:text-orange-200'
                            : 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-700 dark:text-emerald-200'
                        }`}
                      >
                        <option value="GUDANG_SCGA">Ready Stock (Gudang SCGA)</option>
                        <option value="PR_VENDOR">Belum Tersedia (Butuh PR)</option>
                        <option value="CANCELLED">Cancel / Tolak Item</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => {
                  setRejectReasonText('');
                  setRejectReasonModalOpen(true);
                }}
                className="rounded-full border border-rose-300 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Ban className="h-3.5 w-3.5 text-rose-600" />
                <span>Tolak / Batalkan RO</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRoForProcess(null)}
                  className="rounded-full border px-4 py-2 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveProcessDecision}
                  disabled={isSubmitting}
                  className="rounded-full bg-[#0b57d0] text-white px-5 py-2 text-xs font-semibold hover:bg-[#0842a0] flex items-center gap-1.5 shadow-xs"
                >
                  {isSubmitting ? 'Memproses Alur...' : 'Simpan & Lanjutkan Alur Otomatis'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL KONFIRMASI TOLAK / BATALKAN RO */}
      {/* ========================================================= */}
      {rejectReasonModalOpen && selectedRoForProcess && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="spring-pop panel-card w-full max-w-md p-5 space-y-4 border border-rose-200 dark:border-rose-900 rounded-2xl bg-white dark:bg-[#1e1f20] shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
                <Ban className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">Tolak &amp; Batalkan RO</h3>
                <p className="text-xs text-[#747775]">{selectedRoForProcess.ro_number} &bull; {selectedRoForProcess.branch_name}</p>
              </div>
            </div>

            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] leading-relaxed">
              Dokumen RO ini akan ditandai sebagai <strong className="text-rose-600 dark:text-rose-400">DIBATALKAN</strong> dan tidak akan dilanjutkan ke Surat Jalan maupun Pengadaan PR.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                Alasan Penolakan / Pembatalan:
              </label>
              <textarea
                value={rejectReasonText}
                onChange={(e) => setRejectReasonText(e.target.value)}
                placeholder="Contoh: Stok tidak dapat dipenuhi / dibatalkan oleh pihak outlet..."
                rows={3}
                className="w-full text-xs p-2.5 rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-slate-50 dark:bg-[#282a2c] focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e0e2ec] dark:border-[#35383a]">
              <button
                type="button"
                onClick={() => setRejectReasonModalOpen(false)}
                className="rounded-full border px-4 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectRo}
                disabled={isSubmitting}
                className="rounded-full bg-rose-600 text-white px-5 py-2 text-xs font-semibold hover:bg-rose-700 shadow-xs"
              >
                {isSubmitting ? 'Memproses...' : 'Ya, Batalkan RO Ini'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: KELOLA PR & INPUT TGL KEDATANGAN */}
      {/* ========================================================= */}
      {selectedRoForPr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="spring-pop panel-card w-full max-w-lg p-6 space-y-4 border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1e1f20] shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-600" />
                <div>
                  <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Tahap 4: Kelola PR &amp; Input Tgl Kedatangan
                  </h3>
                  <p className="text-[11px] text-[#747775]">
                    Pantau pengadaan vendor baru dan konfirmasi saat aset fisik telah tiba di gudang
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedRoForPr(null)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 space-y-1">
                <div><strong>No. RO:</strong> {selectedRoForPr.ro_number} &bull; {selectedRoForPr.branch_name}</div>
                <div><strong>Item Butuh PR:</strong> {selectedRoForPr.items.filter(it => it.stock_source === 'PR_VENDOR').length} barang</div>
              </div>

              <div>
                <label className="block font-bold mb-1">Nama Vendor / Supplier</label>
                <input
                  type="text"
                  value={prVendor}
                  onChange={(e) => setPrVendor(e.target.value)}
                  placeholder="Contoh: PT Dapur Stainless Utama"
                  className="w-full rounded-xl border p-2.5 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Nomor PO Pembelian</label>
                  <input
                    type="text"
                    value={prPoNo}
                    onChange={(e) => setPrPoNo(e.target.value)}
                    placeholder="PO-2026-088"
                    className="w-full rounded-xl border p-2.5 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Target Tgl Kedatangan Aset</label>
                  <input
                    type="date"
                    value={prArrivalTarget}
                    onChange={(e) => setPrArrivalTarget(e.target.value)}
                    className="w-full rounded-xl border p-2.5 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t">
              <button
                type="button"
                onClick={() => handleSavePrArrival(false)}
                disabled={isSubmitting}
                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold hover:bg-slate-50"
              >
                Simpan Data PR Saja
              </button>

              <button
                type="button"
                onClick={() => handleSavePrArrival(true)}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-full bg-emerald-700 text-white px-5 py-2 text-xs font-semibold hover:bg-emerald-800 shadow-sm"
              >
                <Boxes className="h-4 w-4" />
                <span>Aset Tiba di Gudang &rarr; Masuk Ready Stock</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: TERBITKAN SURAT JALAN (SJ) */}
      {/* ========================================================= */}
      {selectedRoForSj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="spring-pop panel-card w-full max-w-md p-6 space-y-4 border rounded-2xl bg-white dark:bg-[#1e1f20] shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-[#0b57d0]" />
                <h3 className="font-bold text-base">Tahap 6: Terbitkan Surat Jalan (SJ)</h3>
              </div>
              <button onClick={() => setSelectedRoForSj(null)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 space-y-1">
                <div><strong>No. RO:</strong> {selectedRoForSj.ro_number}</div>
                <div><strong>Tujuan:</strong> {selectedRoForSj.branch_name}</div>
                <div><strong>Total Item:</strong> {selectedRoForSj.items.length} macam barang siap kirim</div>
              </div>

              <div>
                <label className="block font-bold mb-1">Nama Driver / Pengemudi</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full rounded-xl border p-2 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Nomor Polisi Kendaraan</label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  className="w-full rounded-xl border p-2 bg-slate-50 dark:bg-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Nama Ekspedisi / Armada</label>
                <input
                  type="text"
                  value={expedition}
                  onChange={(e) => setExpedition(e.target.value)}
                  className="w-full rounded-xl border p-2 bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setSelectedRoForSj(null)}
                className="rounded-full border px-4 py-2 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleGenerateSuratJalan}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] text-white px-5 py-2 text-xs font-semibold hover:bg-[#0842a0]"
              >
                <Printer className="h-4 w-4" />
                <span>Terbitkan &amp; Cetak Dokumen SJ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: KONFIRMASI KEDATANGAN (ASET SAMPAI?) */}
      {/* ========================================================= */}
      {selectedRoForArrival && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="spring-pop panel-card w-full max-w-md p-6 space-y-4 border rounded-2xl bg-white dark:bg-[#1e1f20] shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-amber-600" />
                <div>
                  <h3 className="font-bold text-base">Tahap 7: Aset Sampai di Cabang?</h3>
                  <p className="text-[11px] text-[#747775]">Verifikasi kedatangan fisik armada di outlet tujuan</p>
                </div>
              </div>
              <button onClick={() => setSelectedRoForArrival(null)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 space-y-1">
                <div><strong>No. RO:</strong> {selectedRoForArrival.ro_number}</div>
                <div><strong>Tujuan Cabang:</strong> {selectedRoForArrival.branch_name}</div>
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                Apakah muatan barang telah sampai dan diterima secara fisik oleh Store Manager di lokasi outlet?
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t">
              <button
                type="button"
                onClick={() => handleConfirmArrival(false)}
                disabled={isSubmitting}
                className="flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 text-amber-900 px-4 py-2 text-xs font-semibold hover:bg-amber-100"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Belum (Loopback Kirim)</span>
              </button>

              <button
                type="button"
                onClick={() => handleConfirmArrival(true)}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-full bg-emerald-600 text-white px-5 py-2 text-xs font-semibold hover:bg-emerald-700 shadow-sm"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                <span>Ya, Sudah Tiba &rarr; Checklist</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: CHECKLIST PENERIMAAN TOKO & UPDATE SLA */}
      {/* ========================================================= */}
      {selectedRoForChecklist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="spring-pop panel-card w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4 border rounded-2xl bg-white dark:bg-[#1e1f20] shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-cyan-600" />
                <div>
                  <h3 className="font-bold text-base">Tahap 8 &amp; 9: Checklist Diterima &amp; Update SLA</h3>
                  <p className="text-[11px] text-[#747775]">Store Manager memeriksa fisik dan sistem mengupdate SLA</p>
                </div>
              </div>
              <button onClick={() => setSelectedRoForChecklist(null)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 space-y-1">
                <div><strong>No. RO:</strong> {selectedRoForChecklist.ro_number} &bull; {selectedRoForChecklist.branch_name}</div>
                <div><strong>Tgl Request:</strong> {selectedRoForChecklist.request_date}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Nama PIC Toko Penerima</label>
                  <input
                    type="text"
                    value={picReceiver}
                    onChange={(e) => setPicReceiver(e.target.value)}
                    className="w-full rounded-xl border p-2 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Tanggal Diterima Fisik</label>
                  <input
                    type="date"
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                    className="w-full rounded-xl border p-2 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold">Cek Fisik Item ({selectedRoForChecklist.items.length} Barang):</div>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {selectedRoForChecklist.items.map((it) => {
                    const chk = checkedItems[it.id] || { qty: it.quantity_ordered, condition: 'BAIK', checked: true };
                    return (
                      <div key={it.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-slate-50 dark:bg-slate-900">
                        <div>
                          <div className="font-semibold">{it.item_name}</div>
                          <div className="text-[10px] text-[#747775]">Dipesan: {it.quantity_ordered} {it.unit || 'unit'}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={it.quantity_ordered}
                            value={chk.qty}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 1;
                              setCheckedItems(prev => ({
                                ...prev,
                                [it.id]: { ...chk, qty: val },
                              }));
                            }}
                            className="w-16 rounded border px-2 py-1 text-xs text-center"
                          />

                          <select
                            value={chk.condition}
                            onChange={(e) => {
                              setCheckedItems(prev => ({
                                ...prev,
                                [it.id]: { ...chk, condition: e.target.value },
                              }));
                            }}
                            className="rounded border px-2 py-1 text-xs font-semibold"
                          >
                            <option value="BAIK">Baik &amp; Lengkap</option>
                            <option value="KURANG">Kuantiti Kurang</option>
                            <option value="RUSAK">Ada Kerusakan Fisik</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setSelectedRoForChecklist(null)}
                className="rounded-full border px-4 py-2 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveChecklistAndComplete}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-full bg-emerald-600 text-white px-5 py-2 text-xs font-semibold hover:bg-emerald-700 shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Selesaikan RO &amp; Catat ke Inventaris</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BUAT RO BARU */}
      {isRoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="spring-pop panel-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 border rounded-2xl bg-white dark:bg-[#1e1f20] shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-[#0b57d0]" />
                <h3 className="font-bold text-base">Buat Request Order (RO) Baru</h3>
              </div>
              <button onClick={() => setIsRoModalOpen(false)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRo} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Cabang Outlet</label>
                  <select
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="w-full rounded-xl border p-2 bg-slate-50 dark:bg-slate-900"
                  >
                    {outletList.map((o) => (
                      <option key={o.id} value={o.branch_name || o.nama}>
                        {o.branch_name || o.nama}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Target Kirim</label>
                  <input
                    type="date"
                    value={targetDeliveryDate}
                    onChange={(e) => setTargetDeliveryDate(e.target.value)}
                    className="w-full rounded-xl border p-2 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              {/* Items in RO */}
              <div className="rounded-xl border p-3 space-y-2">
                <div className="font-bold">Item Kebutuhan Outlet ({itemsList.length}):</div>
                <div className="grid grid-cols-12 gap-1.5 items-end">
                  <div className="col-span-6">
                    <label className="block text-[10px] text-[#747775]">Nama Item</label>
                    <input
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Contoh: Chiller, Meja Kasir"
                      className="w-full rounded border p-1.5 text-xs bg-slate-50 dark:bg-slate-900"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] text-[#747775]">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={itemQty}
                      onChange={(e) => setItemQty(parseInt(e.target.value) || 1)}
                      className="w-full rounded border p-1.5 text-xs text-center bg-slate-50 dark:bg-slate-900"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] text-[#747775]">Alokasi</label>
                    <select
                      value={stockSource}
                      onChange={(e: any) => setStockSource(e.target.value)}
                      className="w-full rounded border p-1.5 text-xs bg-slate-50 dark:bg-slate-900"
                    >
                      <option value="GUDANG_SCGA">Ready Stock</option>
                      <option value="PR_VENDOR">PR Vendor</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    <button
                      type="button"
                      onClick={handleAddItemToRo}
                      className="w-full flex items-center justify-center rounded bg-[#0b57d0] py-1.5 text-white"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {itemsList.map((it) => (
                  <div key={it.id} className="flex items-center justify-between py-1 text-xs border-b last:border-0">
                    <span>{it.item_name} &bull; x{it.quantity_ordered} ({it.stock_source})</span>
                    <button
                      type="button"
                      onClick={() => setItemsList(prev => prev.filter(x => x.id !== it.id))}
                      className="text-red-500 font-bold"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsRoModalOpen(false)}
                  className="rounded-full border px-4 py-2 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || itemsList.length === 0}
                  className="rounded-full bg-[#0b57d0] text-white px-5 py-2 font-semibold hover:bg-[#0842a0]"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Dokumen RO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TARIK DATA EXCEL PASTE */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="spring-pop panel-card w-full max-w-lg p-6 space-y-4 border rounded-2xl bg-white dark:bg-[#1e1f20] shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-base">Import Data RO by Excel / CSV</h3>
              </div>
              <button onClick={() => setIsExcelModalOpen(false)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block font-bold mb-1">Pilih Cabang Outlet</label>
                <select
                  value={excelBranch}
                  onChange={(e) => setExcelBranch(e.target.value)}
                  className="w-full rounded-xl border p-2 bg-slate-50 dark:bg-slate-900"
                >
                  {outletList.map((o) => (
                    <option key={o.id} value={o.branch_name || o.nama}>
                      {o.branch_name || o.nama}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">Tempel (Paste) Baris Tabel Spreadsheet</label>
                <textarea
                  rows={6}
                  value={excelText}
                  onChange={(e) => setExcelText(e.target.value)}
                  placeholder="Format: Nama Item [Tab/Koma] Kuantiti [Tab/Koma] Alokasi&#10;Contoh:&#10;Chiller 2 Pintu, 1, Ready Stock&#10;Deep Fryer 17L, 2, PR"
                  className="w-full font-mono text-[11px] rounded-xl border p-3 bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setIsExcelModalOpen(false)}
                className="rounded-full border px-4 py-2 font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!excelText.trim()) return;
                  const lines = excelText.trim().split('\n');
                  const parsed: ROItem[] = [];
                  lines.forEach((l) => {
                    const p = l.split(/[,\t]/).map(s => s.trim());
                    if (p[0] && !p[0].toLowerCase().includes('item')) {
                      const qty = parseInt(p[1]) || 1;
                      const isPr = (p[2] || '').toLowerCase().includes('pr');
                      parsed.push({
                        id: `roi-${Date.now()}-${Math.random().toString().slice(-4)}`,
                        item_name: p[0],
                        quantity_ordered: qty,
                        quantity_fulfilled: isPr ? 0 : qty,
                        stock_source: isPr ? 'PR_VENDOR' : 'GUDANG_SCGA',
                      });
                    }
                  });
                  if (parsed.length === 0) {
                    setToast({ type: 'error', message: 'Format teks Excel tidak valid.' });
                    return;
                  }

                  const branch = excelBranch || outletList[0]?.branch_name || 'Outlet';
                  const payload: Partial<RequestOrder> = {
                    ro_number: `RO-CA-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
                    branch_name: branch,
                    region: 'JABODETABEK',
                    requester_name: 'Import Excel Logistik',
                    request_date: new Date().toISOString().split('T')[0],
                    status: 'INPUT_SYSTEM',
                    current_stage: 'REQUEST_ORDER',
                    source_type: 'EXCEL_PASTE',
                    items: parsed,
                  };

                  const res = await fetch('/api/distribution/ro', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  const json = await res.json();
                  if (json.success && json.data) {
                    setOrders(prev => [json.data, ...prev]);
                    setIsExcelModalOpen(false);
                    setExcelText('');
                    setToast({ type: 'success', message: `Berhasil membuat ${json.data.ro_number} dengan ${parsed.length} item.` });
                  }
                }}
                className="flex items-center gap-1.5 rounded-full bg-emerald-600 text-white px-5 py-2 font-semibold hover:bg-emerald-700"
              >
                <UploadCloud className="h-4 w-4" />
                <span>Simpan Dokumen RO</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 6: LIGHTBOX PREVIEW GAMBAR ITEM (MASTER ASET)       */}
      {/* ========================================================= */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="spring-pop panel-card relative bg-white dark:bg-[#1e1f20] border border-[#e0e2ec] dark:border-[#444746] rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#e0e2ec] dark:border-[#35383a]">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <ImageIcon className="h-4 w-4 text-[#0b57d0] shrink-0" />
                <h4 className="font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3] truncate">
                  {previewImage.title}
                </h4>
              </div>
              <button 
                onClick={() => setPreviewImage(null)} 
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="w-full flex items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-black/50 p-2 border border-[#e0e2ec] dark:border-[#35383a]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={previewImage.url} 
                alt={previewImage.title} 
                className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-sm" 
              />
            </div>

            {/* Rincian Spesifikasi Item */}
            {(() => {
              const spec = getItemSpecification(previewImage.title);
              return (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#18191a] border border-[#e0e2ec] dark:border-[#35383a] text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-600 dark:text-amber-400">Rincian Spesifikasi:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const title = previewImage.title;
                        const currentSpec = getItemSpecification(title) || '';
                        setPreviewImage(null);
                        setEditingSpecItem({ itemName: title, specification: currentSpec });
                      }}
                      className="text-[11px] text-amber-600 hover:underline flex items-center gap-1 font-medium"
                    >
                      <FileEdit className="w-3 h-3" />
                      <span>{spec ? 'Edit Spek' : '+ Tambah Spek'}</span>
                    </button>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                    {spec || <span className="italic text-slate-400">Belum ada rincian spesifikasi untuk item ini.</span>}
                  </p>
                </div>
              );
            })()}

            <div className="flex items-center justify-between text-[11px] text-[#747775] pt-1">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Terhubung dari Sheet Master Aset
              </span>
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={() => {
                    const target = { itemName: previewImage.title, currentImageUrl: previewImage.url };
                    setPreviewImage(null);
                    setUploadModalTarget(target);
                  }} 
                  className="px-3 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  <span>Ganti Foto (&le; 100KB)</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setPreviewImage(null)} 
                  className="px-4 py-1.5 rounded-full bg-[#0b57d0] text-white text-xs font-semibold hover:bg-[#0842a0] transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Upload & Kompresi Supabase (< 100 KB) */}
      {uploadModalTarget && (
        <UploadImageModal
          isOpen={!!uploadModalTarget}
          onClose={() => setUploadModalTarget(null)}
          itemName={uploadModalTarget.itemName}
          currentImageUrl={uploadModalTarget.currentImageUrl}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {/* Modal Edit Spesifikasi Item */}
      {editingSpecItem && (
        <EditSpecModal
          isOpen={!!editingSpecItem}
          onClose={() => setEditingSpecItem(null)}
          itemName={editingSpecItem.itemName}
          currentSpecification={editingSpecItem.specification}
          onSuccess={handleSpecSuccess}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

export default RoManagerView;
