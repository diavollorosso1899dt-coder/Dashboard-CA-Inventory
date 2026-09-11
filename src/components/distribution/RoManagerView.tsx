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
  ChevronRight
} from 'lucide-react';
import { RequestOrder, Outlet, ROItem, ROStatus } from '@/lib/supabase/types';
import { useRouter } from 'next/navigation';

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
  | 'SELESAI';

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
];

export function RoManagerView({ initialOrders = [], outlets = [] }: RoManagerViewProps) {
  const router = useRouter();
  const [orders, setOrders] = useState<RequestOrder[]>(initialOrders);
  const [outletList, setOutletList] = useState<Outlet[]>(outlets);
  const [search, setSearch] = useState('');
  const [selectedStage, setSelectedStage] = useState<StageKey>('ALL');
  const [smartFilter, setSmartFilter] = useState<'ALL' | 'CLEAN' | 'DUPLICATES'>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

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
      fetch('/api/distribution/ro')
        .then((res) => res.json())
        .then((data) => { if (data.data) setOrders(data.data); })
        .catch(console.error);
    }
    if (outletList.length === 0) {
      fetch('/api/outlets')
        .then((res) => res.json())
        .then((data) => { if (data.data) setOutletList(data.data); })
        .catch(console.error);
    }
  }, []);

  // Helper to determine active stage of an RO
  const getRoStage = (ro: RequestOrder): StageKey => {
    if (ro.current_stage) return ro.current_stage;
    if (ro.status === 'COMPLETED') return 'SELESAI';
    if (ro.status === 'IN_DELIVERY') return 'SURAT_JALAN';
    if (ro.status === 'CHECKLIST_DONE') return 'UPDATE_SLA';
    if (ro.status === 'READY_STOCK' || ro.items.every(it => it.stock_source === 'GUDANG_SCGA')) return 'READY_STOCK';
    if (ro.items.some(it => it.stock_source === 'PR_VENDOR')) return 'KELOLA_PR';
    if (ro.status === 'APPROVED') return 'PILIH_PROSES';
    return 'REQUEST_ORDER';
  };

  // Smart deduplication analysis
  const deduplicationMap = useMemo(() => {
    const map = new Map<string, RequestOrder[]>();
    for (const ro of orders) {
      const key = (ro.raw_ro_id || ro.ro_number).toLowerCase().trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ro);
    }
    return map;
  }, [orders]);

  const duplicateOrdersCount = useMemo(() => {
    let count = 0;
    for (const [_, list] of deduplicationMap.entries()) {
      if (list.length > 1) count += list.length;
    }
    return count;
  }, [deduplicationMap]);

  // Stage counts
  const stageCounts = useMemo(() => {
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
    };
    for (const ro of orders) {
      const st = getRoStage(ro);
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        o.ro_number.toLowerCase().includes(search.toLowerCase()) ||
        o.branch_name.toLowerCase().includes(search.toLowerCase()) ||
        (o.raw_ro_id && o.raw_ro_id.toLowerCase().includes(search.toLowerCase())) ||
        o.requester_name.toLowerCase().includes(search.toLowerCase());

      const roStage = getRoStage(o);
      const matchStage = selectedStage === 'ALL' || roStage === selectedStage;

      // Smart deduplication filter
      const key = (o.raw_ro_id || o.ro_number).toLowerCase().trim();
      const isDupe = (deduplicationMap.get(key)?.length || 0) > 1;

      let matchDeduplication = true;
      if (smartFilter === 'CLEAN') {
        matchDeduplication = !isDupe;
      } else if (smartFilter === 'DUPLICATES') {
        matchDeduplication = isDupe;
      }

      return matchSearch && matchStage && matchDeduplication;
    });
  }, [orders, search, selectedStage, smartFilter, deduplicationMap]);

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
      alert(e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handler: Save Process Decision (Stok vs PR)
  const handleSaveProcessDecision = async () => {
    if (!selectedRoForProcess) return;
    try {
      setIsSubmitting(true);
      const allReady = selectedRoForProcess.items.every(it => it.stock_source === 'GUDANG_SCGA');
      const nextStage: StageKey = allReady ? 'READY_STOCK' : 'KELOLA_PR';
      const nextStatus: ROStatus = allReady ? 'READY_STOCK' : 'NEED_PR';

      await fetch('/api/distribution/ro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRoForProcess.id,
          updates: {
            items: selectedRoForProcess.items,
            current_stage: nextStage,
            status: nextStatus,
          },
        }),
      });

      setOrders(prev => prev.map(o => o.id === selectedRoForProcess.id ? {
        ...o,
        items: selectedRoForProcess.items,
        current_stage: nextStage,
        status: nextStatus,
      } : o));

      setSelectedRoForProcess(null);
    } catch (e) {
      console.error(e);
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
        items: selectedRoForSj.items.map((it) => ({
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
        alert('Status diperbarui: Armada masih dalam perjalanan menuju cabang (Loopback Kirim).');
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

      alert(`Alur Selesai! Aset telah diterima di ${selectedRoForChecklist.branch_name}. Lead time SLA: ${leadTimeDays} hari (${isSlaOnTime ? 'SLA ON-TIME' : 'SLA DELAYED'}).`);
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
      alert('Tambahkan minimal 1 item untuk RO ini.');
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
      {/* 1. TOP PIPELINE STEPPER BAR (9 TAHAP SESUAI DIAGRAM) */}
      <div className="panel-card p-4 md:p-5 border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3 border-b border-[#e0e2ec] dark:border-[#35383a] pb-3">
          <div className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <div>
              <h3 className="font-bold text-sm md:text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                Alur Operasional Request Order (Pipeline 9-Tahap)
              </h3>
              <p className="text-[11px] text-[#444746] dark:text-[#c4c7c5]">
                Klik tahapan diagram di bawah untuk menyaring daftar RO sesuai posisi antreannya saat ini:
              </p>
            </div>
          </div>

          {selectedStage !== 'ALL' && (
            <button
              onClick={() => setSelectedStage('ALL')}
              className="text-xs font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline self-start md:self-auto"
            >
              Reset Filter Tahap (Tampilkan Semua)
            </button>
          )}
        </div>

        {/* Horizontal scrollable stepper */}
        <div className="overflow-x-auto pb-2 -mx-2 px-2 custom-scrollbar">
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

        {/* SMART DEDUPLICATION CONTROLS BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#e0e2ec] dark:border-[#35383a] text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#747775] dark:text-[#8e918f] uppercase tracking-wider text-[10px] flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Filter Pintar Duplikasi:
            </span>
            <div className="inline-flex rounded-lg border border-[#e0e2ec] dark:border-[#444746] p-0.5 bg-[#f8f9fa] dark:bg-[#282a2c]">
              <button
                onClick={() => setSmartFilter('ALL')}
                className={`interactive-tap px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  smartFilter === 'ALL' ? 'bg-white dark:bg-[#1a1c1e] text-[#0b57d0] font-bold shadow-xs' : 'text-[#747775]'
                }`}
              >
                Semua ({orders.length})
              </button>
              <button
                onClick={() => setSmartFilter('CLEAN')}
                className={`interactive-tap px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  smartFilter === 'CLEAN' ? 'bg-white dark:bg-[#1a1c1e] text-emerald-600 font-bold shadow-xs' : 'text-[#747775]'
                }`}
              >
                Data Bersih Unik ({orders.length - (duplicateOrdersCount > 0 ? duplicateOrdersCount - deduplicationMap.size : 0)})
              </button>
              <button
                onClick={() => setSmartFilter('DUPLICATES')}
                className={`interactive-tap px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  smartFilter === 'DUPLICATES' ? 'bg-white dark:bg-[#1a1c1e] text-amber-600 font-bold shadow-xs' : 'text-[#747775]'
                }`}
              >
                Data Terduplikasi ({duplicateOrdersCount})
              </button>
            </div>
          </div>

          {duplicateOrdersCount > 0 && (
            <button
              onClick={handleCleanDuplicates}
              className="flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline"
            >
              <Trash2 className="h-3 w-3" />
              <span>Bersihkan Duplikat Otomatis</span>
            </button>
          )}
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
                <th className="py-3.5 px-4">No. RO / ID</th>
                <th className="py-3.5 px-4">Tanggal Order</th>
                <th className="py-3.5 px-4">Cabang Outlet</th>
                <th className="py-3.5 px-4">Item &amp; Alokasi</th>
                <th className="py-3.5 px-4">Tahapan Alur Operasional</th>
                <th className="py-3.5 px-4 text-right">Aksi Alur Kerja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#747775] dark:text-[#8e918f]">
                    Tidak ada dokumen Request Order (RO) yang cocok dengan filter aktif.
                  </td>
                </tr>
              ) : (
                filteredOrders.slice(0, 100).map((o) => {
                  const stage = getRoStage(o);
                  const isCompleted = stage === 'SELESAI';
                  const isInDelivery = stage === 'SURAT_JALAN';
                  const isReadyStock = stage === 'READY_STOCK';
                  const isNeedPr = stage === 'KELOLA_PR';
                  const isPilihProses = stage === 'PILIH_PROSES' || stage === 'REQUEST_ORDER' || stage === 'INPUT_DATA';
                  const isChecklist = stage === 'CHECKLIST' || stage === 'ASET_SAMPAI';

                  const key = (o.raw_ro_id || o.ro_number).toLowerCase().trim();
                  const isDupe = (deduplicationMap.get(key)?.length || 0) > 1;

                  return (
                    <tr key={o.id} className="hover:bg-[#f0f4f9]/50 dark:hover:bg-[#282a2c]/50 transition-colors">
                      {/* RO ID */}
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

                      {/* Dates */}
                      <td className="py-3.5 px-4 text-[#444746] dark:text-[#c4c7c5] whitespace-nowrap">
                        <div>{o.request_date}</div>
                        <div className="text-[10px] text-[#747775]">Target: {o.target_delivery_date || '-'}</div>
                      </td>

                      {/* Branch & Region */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">{o.branch_name}</div>
                        <div className="text-[10px] text-[#747775]">{o.region} &bull; {o.requester_name}</div>
                      </td>

                      {/* Items */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="space-y-1">
                          {o.items.slice(0, 3).map((it, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                              <Package className="h-3 w-3 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                              <span className="font-medium truncate">{it.item_name}</span>
                              <span className="text-[#747775] shrink-0">
                                (x{it.quantity_ordered} {it.unit || 'unit'})
                              </span>
                              <span className={`text-[9px] px-1 rounded font-bold ${
                                it.stock_source === 'GUDANG_SCGA'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-orange-100 text-orange-800'
                              }`}>
                                {it.stock_source === 'GUDANG_SCGA' ? 'Stok' : 'PR'}
                              </span>
                            </div>
                          ))}
                          {o.items.length > 3 && (
                            <span className="text-[10px] font-semibold text-[#0b57d0]">
                              +{o.items.length - 3} item lainnya
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Stage Progress Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          isCompleted
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
                          {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> :
                           isInDelivery ? <Truck className="h-3.5 w-3.5 text-teal-600" /> :
                           isReadyStock ? <Boxes className="h-3.5 w-3.5 text-emerald-600" /> :
                           isNeedPr ? <Clock className="h-3.5 w-3.5 text-orange-600" /> :
                           <GitMerge className="h-3.5 w-3.5 text-blue-600" />}
                          <span>{WORKFLOW_STAGES.find(s => s.key === stage)?.label || stage}</span>
                        </span>
                      </td>

                      {/* Contextual Action Buttons */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1. Tahap Pilih Proses */}
                          {isPilihProses && (
                            <button
                              onClick={() => setSelectedRoForProcess(o)}
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border space-y-1">
                <div><strong>No. RO:</strong> {selectedRoForProcess.ro_number}</div>
                <div><strong>Cabang:</strong> {selectedRoForProcess.branch_name} ({selectedRoForProcess.region})</div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-xs">Atur Alokasi Sumber Tiap Item:</div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedRoForProcess.items.map((it, idx) => (
                    <div key={it.id || idx} className="flex items-center justify-between p-2.5 rounded-lg border bg-white dark:bg-[#282a2c]">
                      <div>
                        <div className="font-semibold">{it.item_name}</div>
                        <div className="text-[10px] text-[#747775]">Jumlah: {it.quantity_ordered} {it.unit || 'unit'}</div>
                      </div>
                      <select
                        value={it.stock_source}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          const updated = [...selectedRoForProcess.items];
                          updated[idx] = { ...updated[idx], stock_source: val };
                          setSelectedRoForProcess({ ...selectedRoForProcess, items: updated });
                        }}
                        className="rounded-lg border px-2 py-1 text-xs font-semibold"
                      >
                        <option value="GUDANG_SCGA">Ready Stock (Gudang SCGA)</option>
                        <option value="PR_VENDOR">Belum Tersedia (Butuh PR)</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
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
                className="rounded-full bg-[#0b57d0] text-white px-5 py-2 text-xs font-semibold hover:bg-[#0842a0]"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan Alur Keputusan'}
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
                  if (parsed.length === 0) return alert('Format tidak valid');

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
                    alert(`Berhasil membuat ${json.data.ro_number} dengan ${parsed.length} item.`);
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
    </div>
  );
}

export default RoManagerView;
