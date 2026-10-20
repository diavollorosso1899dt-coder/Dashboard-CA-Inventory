'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SuratJalan, SJItem } from '@/lib/supabase/types';
import AreaFilterPills from '@/components/ui/AreaFilterPills';
import ColumnVisibilityPicker, { ColumnItem, useColumnVisibility } from '@/components/ui/ColumnVisibilityPicker';
import { normalizeRegion, matchesRegion, StandardRegion } from '@/lib/utils/region-helper';
import { formatDateOnly } from '@/lib/utils/date-formatter';
import { 
  FileText, 
  Truck, 
  Printer, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  RefreshCw,
  Calendar,
  User,
  PackageCheck,
  Package,
  Eye,
  X,
  Boxes,
  Trash2,
  Copy,
  CheckCheck,
  LayoutGrid,
  Table as TableIcon,
  PlusCircle,
  ArrowRight,
  Layers
} from 'lucide-react';

import { Toast, ToastMessage } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth/AuthContext';
import DeliveryProofModal from './DeliveryProofModal';

interface SuratJalanListViewProps {
  isHistoryOnly?: boolean;
}

const SJ_COLUMNS: ColumnItem[] = [
  { id: 'doc_number', label: 'No. Dokumen & Surat Jalan', defaultVisible: true, alwaysVisible: true },
  { id: 'route', label: 'Rute Distribusi (Asal → Tujuan)', defaultVisible: true },
  { id: 'dates_courier', label: 'Tanggal & Kurir', defaultVisible: true },
  { id: 'pics', label: 'PIC Pengirim / Penerima', defaultVisible: true },
  { id: 'items', label: 'Item & Rincian', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'actions', label: 'Aksi', defaultVisible: true, alwaysVisible: true },
];

export function normalizeSjStatus(status?: string): 'PROCESSED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' {
  const s = (status || '').toUpperCase().trim();
  if (s === 'SELESAI' || s === 'DELIVERED' || s === 'DITERIMA DI OUTLET') return 'DELIVERED';
  if (s === 'DALAM PENGIRIMAN' || s === 'SHIPPED' || s === 'IN_TRANSIT') return 'SHIPPED';
  if (s === 'DIBATALKAN' || s === 'CANCELLED') return 'CANCELLED';
  return 'PROCESSED';
}

export interface GroupedSuratJalanRow {
  key: string;
  outletName: string;
  docs: SuratJalan[];
  items: any[];
  primarySj: SuratJalan;
  sjNumbers: string[];
  roNumbers: string[];
  totalUnits: number;
}

export default function SuratJalanListView({ isHistoryOnly = false }: SuratJalanListViewProps) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const urlRegion = searchParams ? searchParams.get('region') : null;
  const [regionFilter, setRegionFilter] = useState<StandardRegion>(normalizeRegion(urlRegion));

  const [sjList, setSjList] = useState<SuratJalan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(isHistoryOnly ? 'DELIVERED' : 'ACTIVE');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [groupByOutlet, setGroupByOutlet] = useState<boolean>(true);
  const [detailModalGroup, setDetailModalGroup] = useState<GroupedSuratJalanRow | null>(null);
  const [deliveryProofTargetSj, setDeliveryProofTargetSj] = useState<SuratJalan | null>(null);

  // Column visibility
  const { visibleColumns, setVisibleColumns, isVisible } = useColumnVisibility(
    'ca_surat_jalan_columns',
    SJ_COLUMNS
  );
  const visibleColCount = SJ_COLUMNS.filter((c) => isVisible(c.id)).length;

  // Sync regionFilter when URL parameter changes
  useEffect(() => {
    setRegionFilter(normalizeRegion(searchParams ? searchParams.get('region') : null));
  }, [searchParams]);

  const fetchSj = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/distribution/surat-jalan');
      const json = await res.json();
      if (json.data) {
        setSjList(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch Surat Jalan:', err);
      setToast({ type: 'error', message: 'Gagal memuat daftar Surat Jalan' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSj();
  }, []);

  const copyToClipboard = async (text: string, title: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setToast({ type: 'success', message: `${title} berhasil disalin ke clipboard!` });
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      setToast({ type: 'error', message: 'Gagal menyalin teks' });
    }
  };

  const formatSjDocText = (group: GroupedSuratJalanRow) => {
    const sjNo = group.sjNumbers.join(', ');
    const dest = group.outletName;
    const itemsStr = (group.items || [])
      .map((it: any, idx: number) => `  ${idx + 1}. ${it.item_name || it.nama_barang} (${it.quantity ?? it.qty ?? 1} ${it.unit || it.satuan || 'Unit'})`)
      .join('\n');

    return [
      `📄 *SURAT JALAN DISTRIBUSI: ${sjNo}*`,
      `• Tanggal: ${formatDateOnly(group.primarySj.delivery_date || group.primarySj.tanggal_kirim || group.primarySj.created_at)}`,
      `• Rute: Gudang Pusat SCGA ➔ ${dest}`,
      `• Kurir / Armada: ${group.primarySj.expedition || group.primarySj.driver_nama || group.primarySj.driver_name || 'Armada Internal'} (${group.primarySj.kendaraan_plat || group.primarySj.vehicle_number || '-'})`,
      `• Pengirim: ${group.primarySj.sender_name || group.primarySj.pengirim_nama || 'Staff Logistik SCGA'}`,
      `• Penerima: ${group.primarySj.receiver_name || group.primarySj.penerima_nama || 'Menunggu konfirmasi cabang'}`,
      `• Status: ${group.primarySj.status}`,
      `• Jumlah Dokumen Terkumpul: ${group.docs.length}`,
      `• Total Fisik Barang: ${group.totalUnits} Unit (${group.items.length} Baris)`,
      `• Daftar Barang:`,
      itemsStr || '  (Belum ada rincian item)',
      group.primarySj.catatan || group.primarySj.notes ? `• Catatan: ${group.primarySj.catatan || group.primarySj.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const formatAllTransfersText = () => {
    if (groupedList.length === 0) return 'Tidak ada data Surat Jalan.';
    return [
      `📋 *DAFTAR DOKUMEN SURAT JALAN DISTRIBUSI (${groupedList.length} Outlet)*`,
      `Dicetak/Disalin pada: ${new Date().toLocaleString('id-ID')}`,
      '',
      ...groupedList.map((g, i) => {
        const sjNo = g.sjNumbers.join(', ');
        const dest = g.outletName;
        const itemCount = g.items?.length || 0;
        return `${i + 1}. ${dest} | SJ: ${sjNo} | Status: ${g.primarySj.status} | Total ${g.totalUnits} Unit (${itemCount} Item)`;
      }),
    ].join('\n');
  };

  const handleConfirmDeliveryWithProof = async (proofData: {
    receiverName: string;
    signatureUrl: string;
    photoUrl?: string;
    notes: string;
  }) => {
    if (!deliveryProofTargetSj) return;
    const sjId = deliveryProofTargetSj.id;
    const roRef = deliveryProofTargetSj.ro_nomor || deliveryProofTargetSj.ro_number;

    setUpdatingId(sjId);
    try {
      const res = await fetch('/api/distribution/surat-jalan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sjId,
          status: 'DELIVERED',
          receiver_name: proofData.receiverName,
          penerima_nama: proofData.receiverName,
          signature_url: proofData.signatureUrl,
          photo_url: proofData.photoUrl,
          notes: proofData.notes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSjList((prev) =>
          prev.map((s) =>
            s.id === sjId
              ? {
                  ...s,
                  status: 'DELIVERED',
                  receiver_name: proofData.receiverName,
                  penerima_nama: proofData.receiverName,
                  tanda_tangan_url: proofData.signatureUrl,
                  foto_bukti_url: proofData.photoUrl,
                  catatan_penerimaan: proofData.notes,
                  received_at: new Date().toISOString(),
                }
              : s
          )
        );
        setToast({
          type: 'success',
          message: 'Surat Jalan berhasil diselesaikan dengan TTD digital & bukti serah terima!',
        });

        // Auto-advance corresponding RO if reference exists
        if (roRef) {
          fetch('/api/distribution/ro', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: roRef,
              updates: {
                status: 'CHECKLIST_DONE',
                current_stage: 'CHECKLIST',
                arrival_datetime: new Date().toISOString(),
                pic_receiver: proofData.receiverName,
              },
            }),
          }).catch((e) => console.warn('Could not auto-advance RO:', e));
        }
      } else {
        setToast({ type: 'error', message: data.error || 'Gagal menyimpan bukti serah terima' });
      }
    } catch {
      setToast({ type: 'error', message: 'Terjadi kesalahan jaringan saat menyimpan bukti serah terima' });
    } finally {
      setUpdatingId(null);
      setDeliveryProofTargetSj(null);
    }
  };

  const handleDeleteGroup = async (group: GroupedSuratJalanRow) => {
    const confirmMsg = group.docs.length > 1
      ? `Hapus SEMUA (${group.docs.length}) dokumen Surat Jalan untuk outlet ${group.outletName}?\n\nTindakan ini tidak dapat dibatalkan.`
      : `Hapus dokumen Surat Jalan ${group.sjNumbers[0]}? Tindakan ini tidak dapat dibatalkan.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setUpdatingId(group.key);
      const deletePromises = group.docs.map((doc) =>
        fetch(`/api/distribution/surat-jalan?id=${encodeURIComponent(doc.id)}`, { method: 'DELETE' })
      );
      await Promise.all(deletePromises);

      const deletedIds = new Set(group.docs.map((d) => d.id));
      setSjList((prev) => prev.filter((s) => !deletedIds.has(s.id)));
      setToast({
        type: 'success',
        message: `Dokumen untuk outlet ${group.outletName} berhasil dihapus.`,
      });
    } catch {
      setToast({ type: 'error', message: 'Terjadi kesalahan jaringan saat menghapus dokumen' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('PERINGATAN: Apakah Anda yakin ingin menghapus SEMUA data Surat Jalan?\n\nTindakan ini akan mengosongkan seluruh riwayat dokumen Surat Jalan.')) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/distribution/surat-jalan', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setSjList([]);
        setToast({
          type: 'success',
          message: data.message || 'Semua data Surat Jalan berhasil dibersihkan.',
        });
      } else {
        setToast({ type: 'error', message: data.error || 'Gagal menghapus data Surat Jalan' });
      }
    } catch {
      setToast({ type: 'error', message: 'Terjadi kesalahan jaringan' });
    } finally {
      setLoading(false);
    }
  };

  // 1. Raw Filtered List berdasarkan Region, Status, & Search
  const filteredList = useMemo(() => {
    return sjList.filter((sj) => {
      const sjRegion = sj.region || (
        (sj.branch_name || sj.tujuan_outlet_nama || '').toLowerCase().includes('kalbar') ? 'KALBAR' : 'JABODETABEK'
      );
      if (!matchesRegion(sjRegion, regionFilter)) return false;

      const norm = normalizeSjStatus(sj.status);

      // Status filter logic
      if (statusFilter === 'ACTIVE') {
        if (norm === 'DELIVERED' || norm === 'CANCELLED') return false;
      } else if (statusFilter === 'DELIVERED') {
        if (norm !== 'DELIVERED') return false;
      }

      if (search.trim()) {
        const query = search.toLowerCase();
        const noSj = (sj.nomor_sj || sj.sj_number || '').toLowerCase();
        const roNo = (sj.ro_nomor || sj.ro_number || '').toLowerCase();
        const dest = (sj.tujuan_outlet_nama || sj.branch_name || '').toLowerCase();
        const driver = (sj.driver_nama || sj.driver_name || '').toLowerCase();
        const plat = (sj.kendaraan_plat || sj.vehicle_number || '').toLowerCase();
        const sender = (sj.sender_name || sj.pengirim_nama || '').toLowerCase();
        const receiver = (sj.receiver_name || sj.penerima_nama || '').toLowerCase();
        const itemsMatch = (sj.items || []).some((it: any) => {
          const itName = String(it.item_name || it.nama_barang || it.name || '').toLowerCase();
          return itName.includes(query);
        });

        const match =
          noSj.includes(query) ||
          roNo.includes(query) ||
          dest.includes(query) ||
          driver.includes(query) ||
          plat.includes(query) ||
          sender.includes(query) ||
          receiver.includes(query) ||
          itemsMatch;

        if (!match) return false;
      }

      return true;
    });
  }, [sjList, regionFilter, statusFilter, search]);

  // 2. KELOMPOKKAN JIKA ADA NAMA OUTLET YANG SAMA DALAM 1 DAFTAR CETAK
  const groupedList = useMemo<GroupedSuratJalanRow[]>(() => {
    if (!groupByOutlet) {
      return filteredList.map((sj) => {
        const outName = sj.tujuan_outlet_nama || sj.branch_name || 'Outlet Cabang';
        const units = (sj.items || []).reduce(
          (acc: number, it: any) => acc + Number(it.quantity ?? it.qty ?? 1),
          0
        );
        return {
          key: sj.id,
          outletName: outName,
          docs: [sj],
          items: sj.items || [],
          primarySj: sj,
          sjNumbers: [sj.nomor_sj || sj.sj_number || sj.id],
          roNumbers: (sj.ro_nomor || sj.ro_number ? [sj.ro_nomor || sj.ro_number] : []).filter(Boolean) as string[],
          totalUnits: units,
        };
      });
    }

    const map = new Map<string, GroupedSuratJalanRow>();

    filteredList.forEach((sj) => {
      const outName = (sj.tujuan_outlet_nama || sj.branch_name || 'Outlet Cabang').trim();
      const cleanKey = outName.toLowerCase();
      const sjNo = sj.nomor_sj || sj.sj_number || sj.id;
      const roNo = sj.ro_nomor || sj.ro_number;
      const sjUnits = (sj.items || []).reduce(
        (acc: number, it: any) => acc + Number(it.quantity ?? it.qty ?? 1),
        0
      );

      if (!map.has(cleanKey)) {
        map.set(cleanKey, {
          key: cleanKey,
          outletName: outName,
          docs: [sj],
          items: [...(sj.items || [])],
          primarySj: sj,
          sjNumbers: sjNo ? [sjNo] : [],
          roNumbers: (roNo ? [roNo] : []) as string[],
          totalUnits: sjUnits,
        });
      } else {
        const existing = map.get(cleanKey)!;
        existing.docs.push(sj);
        existing.items.push(...(sj.items || []));
        if (sjNo && !existing.sjNumbers.includes(sjNo)) existing.sjNumbers.push(sjNo);
        if (roNo && !existing.roNumbers.includes(roNo)) existing.roNumbers.push(roNo);
        existing.totalUnits += sjUnits;
      }
    });

    return Array.from(map.values());
  }, [filteredList, groupByOutlet]);

  const getStatusBadge = (status: string) => {
    const norm = normalizeSjStatus(status);
    switch (norm) {
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Diterima di Outlet
          </span>
        );
      case 'SHIPPED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            <Truck className="h-3 w-3" /> Dalam Perjalanan
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-3 w-3" /> Dibatalkan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            <Clock className="h-3 w-3" /> Packing Gudang
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="panel-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] rounded-2xl shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 shadow-2xs">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {isHistoryOnly ? 'Riwayat Dokumen Surat Jalan Selesai' : 'Surat Jalan (SJ) & Ekspedisi Distribusi'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Pencatatan resmi dokumen pendistribusian aset ke outlet cabang, cetak surat jalan legal, hingga konfirmasi serah terima fisik.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={fetchSj}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-all cursor-pointer"
            title="Refresh data Surat Jalan"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {sjList.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 rounded-full transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Hapus seluruh data dokumen Surat Jalan"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua</span>
            </button>
          )}

          <Link
            href="/monitoring/transfer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0b57d0] dark:bg-[#a8c7fa] dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] rounded-full transition-all shadow-sm active:scale-95"
            title="Buka antrean siap distribusi di Pemantauan Distribusi"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Antrean Ready Antar</span>
          </Link>

          <Link
            href="/distribution/ro"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-full transition-all"
            title="Buka Kelola RO"
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span>Kelola RO</span>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="panel-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] rounded-2xl shadow-xs">
        <div className="flex items-center gap-2 flex-1 max-w-2xl flex-wrap">
          <AreaFilterPills
            value={regionFilter}
            onChange={(r) => setRegionFilter(r)}
            syncUrl={true}
          />

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#747775] dark:text-[#8e918f]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari No. Distribusi, No. Surat Jalan, Asal, Tujuan, Kurir, Resi..."
              className="w-full rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] pl-10 pr-4 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none transition-all shadow-xs"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#f0f4f9] dark:bg-[#1e1f20] p-1 rounded-full border border-[#e0e2ec] dark:border-[#444746] text-xs">
            {[
              { id: 'ACTIVE', label: 'Dalam Perjalanan (Aktif)' },
              { id: 'DELIVERED', label: 'Diterima Outlet (SLA)' },
              { id: 'ALL', label: 'Semua' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode & Grouping Toggles */}
        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          {/* Tombol Pengelompokan Outlet */}
          <button
            onClick={() => setGroupByOutlet(!groupByOutlet)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
              groupByOutlet
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 shadow-2xs'
                : 'bg-white dark:bg-[#1e1f20] text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
            }`}
            title="Kumpulkan dan gabungkan seluruh dokumen pengiriman dengan nama outlet yang sama"
          >
            <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Gabung per Outlet ({groupedList.length})</span>
          </button>

          {/* View Mode Toggle: Tabel (Utama) vs Kartu */}
          <div className="flex items-center gap-0.5 bg-[#f0f4f9] dark:bg-[#1e1f20] p-1 rounded-full border border-[#e0e2ec] dark:border-[#444746]">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#0b57d0]'
              }`}
              title="Tampilan Tabel Lengkap (Tampilan Utama)"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabel</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#0b57d0]'
              }`}
              title="Tampilan Kartu Ringkas (Grid)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kartu</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAMPILAN UTAMA: TABLE DOKUMEN DISTRIBUSI (TERKUMPUL PER OUTLET) */}
      {viewMode === 'table' ? (
        <div className="panel-card overflow-hidden border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] rounded-2xl shadow-xs">
          {/* Table Header Bar */}
          <div className="p-3 px-4 border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#1e1f20] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#444746] dark:text-[#c4c7c5]">
                Daftar Dokumen Distribusi {statusFilter === 'ACTIVE' ? 'Aktif' : statusFilter === 'DELIVERED' ? 'Diterima di Outlet (SLA)' : ''} ({groupedList.length} Outlet{groupByOutlet ? ', Tergabung' : ''})
              </span>
              {statusFilter === 'ACTIVE' && (
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                  Item diterima otomatis keluar &amp; masuk ke SLA
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/distribution/sla"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-xs font-semibold transition-colors shadow-2xs"
                title="Buka Monitoring SLA untuk melihat ketepatan waktu pengiriman vs permintaan"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Monitoring SLA</span>
              </Link>
              {groupedList.length > 0 && (
                <button
                  onClick={() => copyToClipboard(formatAllTransfersText(), 'Semua Dokumen Distribusi', 'all-docs')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1f20] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors shadow-xs cursor-pointer group"
                  title="Salin semua rekap dokumen surat jalan"
                >
                  {copiedId === 'all-docs' ? (
                    <>
                      <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700 dark:text-emerald-300 font-bold">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                      <span>Salin Dokumen</span>
                    </>
                  )}
                </button>
              )}
              <ColumnVisibilityPicker
                columns={SJ_COLUMNS}
                visibleColumns={visibleColumns}
                onChange={setVisibleColumns}
                storageKey="ca_surat_jalan_columns"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
              <thead className="bg-[#f0f4f9] dark:bg-[#1e1f20] text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] border-b border-[#e0e2ec] dark:border-[#444746]">
                <tr>
                  {isVisible('doc_number') && <th className="py-3.5 px-3">No. Dokumen &amp; Surat Jalan</th>}
                  {isVisible('route') && <th className="py-3.5 px-3">Rute Distribusi (Asal &rarr; Tujuan)</th>}
                  {isVisible('dates_courier') && <th className="py-3.5 px-3">Tanggal &amp; Kurir</th>}
                  {isVisible('pics') && <th className="py-3.5 px-3">PIC Pengirim / Penerima</th>}
                  {isVisible('items') && <th className="py-3.5 px-3 text-center">Item &amp; Rincian</th>}
                  {isVisible('status') && <th className="py-3.5 px-3 text-center">Status</th>}
                  {isVisible('actions') && <th className="py-3.5 px-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]">
                {loading ? (
                  <tr>
                    <td colSpan={visibleColCount} className="text-center py-12 text-[#747775]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="h-6 w-6 animate-spin text-[#0b57d0]" />
                        <span className="text-xs font-semibold">Memuat dokumen surat jalan...</span>
                      </div>
                    </td>
                  </tr>
                ) : groupedList.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColCount} className="text-center py-12 text-[#747775] dark:text-[#8e918f]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Truck className="h-8 w-8 text-[#c4c7c5] dark:text-[#5e6062]" />
                        <div className="font-semibold text-sm">Belum Ada Dokumen Pendistribusian Aset</div>
                        <p className="text-xs max-w-md text-[#747775] dark:text-[#8e918f]">
                          Klik tombol <strong>&quot;Buat Surat Jalan Distribusi&quot;</strong> atau proses item dari antrean <strong>Ready Antar</strong> di atas untuk menerbitkan Surat Jalan Distribusi resmi.
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Link
                            href="/monitoring/transfer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#0b57d0] text-white hover:bg-[#0842a0] transition-colors"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>Buka Antrean Ready Antar</span>
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  groupedList.map((group) => {
                    const norm = normalizeSjStatus(group.primarySj.status);
                    const isInTransit = norm === 'SHIPPED' || norm === 'PROCESSED';
                    const isReceived = norm === 'DELIVERED';
                    const driver = group.primarySj.driver_nama || group.primarySj.driver_name || group.primarySj.expedition || 'Armada Internal SCGA';
                    const plate = group.primarySj.kendaraan_plat || group.primarySj.vehicle_number;
                    const printUrl = `/distribution/surat-jalan/print/${encodeURIComponent(group.primarySj.id)}?outlet=${encodeURIComponent(group.outletName)}`;

                    return (
                      <tr key={group.key} className="hover:bg-[#f8fafd] dark:hover:bg-[#282a2c]/60 transition-colors">
                        {/* No. Dokumen & Surat Jalan */}
                        {isVisible('doc_number') && (
                          <td className="py-3 px-3">
                            <div className="font-mono font-bold text-xs text-[#0b57d0] dark:text-[#a8c7fa] flex items-center gap-1.5 flex-wrap">
                              <span>{group.sjNumbers[0]}</span>
                              {group.docs.length > 1 && (
                                <span className="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-1.5 py-0.2 rounded font-sans font-semibold">
                                  +{group.docs.length - 1} Dokumen
                                </span>
                              )}
                            </div>
                            {group.roNumbers.length > 0 && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[200px]">
                                Ref: {group.roNumbers.join(', ')}
                              </div>
                            )}
                            <Link
                              href={printUrl}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline mt-0.5"
                              title="Klik untuk cetak seluruh item Surat Jalan outlet ini"
                            >
                              <Printer className="h-3 w-3" />
                              <span>Cetak SJ ({group.items.length} Item)</span>
                            </Link>
                          </td>
                        )}

                        {/* Route */}
                        {isVisible('route') && (
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
                              <span className="text-[#444746] dark:text-[#c4c7c5]">Gudang Pusat SCGA</span>
                              <span className="text-[#0b57d0] dark:text-[#a8c7fa]">&rarr;</span>
                              <span className="text-[#0b57d0] dark:text-[#a8c7fa]">{group.outletName}</span>
                            </div>
                            <div className="text-[10px] text-[#747775] dark:text-[#8e918f] mt-0.5 flex items-center gap-1.5">
                              <span>Gudang Pusat &rarr; Outlet Cabang</span>
                              {group.docs.length > 1 && (
                                <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded font-semibold text-[9px] border border-emerald-200 dark:border-emerald-800">
                                  {group.docs.length} Dokumen Digabung
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Tanggal & Kurir */}
                        {isVisible('dates_courier') && (
                          <td className="py-3 px-3">
                            <div className="text-xs font-medium text-[#1f1f1f] dark:text-[#e3e3e3]">
                              Kirim: {formatDateOnly(group.primarySj.delivery_date || group.primarySj.tanggal_kirim || group.primarySj.created_at)}
                            </div>
                            {group.primarySj.received_at && (
                              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                Tiba: {formatDateOnly(group.primarySj.received_at)}
                              </div>
                            )}
                            <div className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-0.5">
                              {driver} {plate ? `(${plate})` : ''}
                            </div>
                          </td>
                        )}

                        {/* PICs */}
                        {isVisible('pics') && (
                          <td className="py-3 px-3">
                            <div className="text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
                              <span className="text-[#747775] dark:text-[#8e918f]">Pengirim:</span>{' '}
                              {group.primarySj.sender_name || group.primarySj.pengirim_nama || 'Staff Logistik SCGA'}
                            </div>
                            <div className="text-xs text-[#1f1f1f] dark:text-[#e3e3e3] mt-0.5">
                              <span className="text-[#747775] dark:text-[#8e918f]">Penerima:</span>{' '}
                              {group.primarySj.receiver_name || group.primarySj.penerima_nama ? (
                                <strong className="text-emerald-700 dark:text-emerald-300">
                                  {group.primarySj.receiver_name || group.primarySj.penerima_nama}
                                </strong>
                              ) : (
                                <span className="italic text-[#747775]">Menunggu konfirmasi outlet</span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Items (Seluruh Item Outlet Terkumpul) */}
                        {isVisible('items') && (
                          <td className="py-3 px-3">
                            <div className="space-y-1.5 min-w-[210px] max-w-[320px]">
                              {group.items && group.items.length > 0 ? (
                                <>
                                  {group.items.slice(0, 3).map((it: any, idx: number) => {
                                    const itName = it.item_name || it.nama_barang || 'Barang';
                                    const qty = it.quantity ?? it.qty ?? 1;
                                    const unit = it.unit || it.satuan || 'Unit';
                                    return (
                                      <div
                                        key={it.id || idx}
                                        className="flex items-center justify-between gap-1.5 p-1.5 rounded-lg border border-[#e0e2ec] dark:border-[#333538] bg-[#f8fafd] dark:bg-[#282a2c]/60 text-xs shadow-2xs"
                                      >
                                        <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">
                                          {itName}
                                        </span>
                                        <span className="font-bold text-[#0b57d0] dark:text-[#a8c7fa] font-mono shrink-0">
                                          {qty} {unit}
                                        </span>
                                      </div>
                                    );
                                  })}

                                  <div className="flex items-center justify-between pt-0.5">
                                    <span className="text-[10px] font-bold text-slate-500">
                                      Total: {group.totalUnits} Unit ({group.items.length} Item)
                                    </span>
                                    {group.items.length > 3 && (
                                      <button
                                        type="button"
                                        onClick={() => setDetailModalGroup(group)}
                                        className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                                      >
                                        <span>+{group.items.length - 3} item lainnya...</span>
                                      </button>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <span className="text-xs text-[#747775] italic">0 Unit</span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Status */}
                        {isVisible('status') && (
                          <td className="py-3 px-3 text-center">
                            {getStatusBadge(group.primarySj.status)}
                          </td>
                        )}

                        {/* Actions */}
                        {isVisible('actions') && (
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isInTransit && (
                                <button
                                  onClick={() => setDeliveryProofTargetSj(group.primarySj)}
                                  className="flex items-center gap-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                                  title="Konfirmasi Kedatangan Barang & Tanda Tangan Digital"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Konfirmasi Tiba</span>
                                </button>
                              )}

                              <button
                                onClick={() => copyToClipboard(formatSjDocText(group), `Surat Jalan ${group.outletName}`, `doc-${group.key}`)}
                                className="p-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] text-[#444746] dark:text-[#c4c7c5] transition-colors cursor-pointer"
                                title="Salin ringkasan surat jalan outlet ini"
                              >
                                {copiedId === `doc-${group.key}` ? (
                                  <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>

                              <Link
                                href={printUrl}
                                className="p-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] text-[#444746] dark:text-[#c4c7c5] transition-colors cursor-pointer"
                                title="Cetak Surat Jalan Terpadu Outlet Ini"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Link>

                              <button
                                onClick={() => setDetailModalGroup(group)}
                                className="p-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] text-[#444746] dark:text-[#c4c7c5] transition-colors cursor-pointer"
                                title="Lihat Detail Rincian Barang"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeleteGroup(group)}
                                disabled={updatingId === group.key}
                                className="p-1.5 rounded-full border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                                title="Hapus dokumen surat jalan ini"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
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
        </div>
      ) : (
        /* TAMPILAN KARTU (GRID VIEW ALTERNATIF) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading ? (
            <div className="col-span-full py-16 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-500" />
              Memuat daftar Surat Jalan...
            </div>
          ) : groupedList.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-slate-900 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800">
              <FileText className="w-12 h-12 mx-auto text-slate-400 mb-3 opacity-60" />
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Belum ada Surat Jalan</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                Surat Jalan akan otomatis tercipta ketika Request Order (RO) yang disetujui diproses atau diterbitkan langsung dari Gudang SCGA.
              </p>
            </div>
          ) : (
            groupedList.map((group) => {
              const sjNo = group.sjNumbers.join(' / ');
              const norm = normalizeSjStatus(group.primarySj.status);
              const isInTransit = norm === 'SHIPPED' || norm === 'PROCESSED';
              const printUrl = `/distribution/surat-jalan/print/${encodeURIComponent(group.primarySj.id)}?outlet=${encodeURIComponent(group.outletName)}`;

              return (
                <div
                  key={group.key}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                          {sjNo}
                        </span>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDateOnly(group.primarySj.delivery_date || group.primarySj.tanggal_kirim || group.primarySj.created_at)}
                        </div>
                      </div>
                      {getStatusBadge(group.primarySj.status)}
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-sm">
                      <div>
                        <div className="text-xs text-slate-400">Outlet Tujuan:</div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{group.outletName}</span>
                          {group.docs.length > 1 && (
                            <span className="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold px-2 py-0.2 rounded-full">
                              {group.docs.length} Dokumen
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                        <span>
                          Ref RO: <strong className="font-mono text-slate-700 dark:text-slate-300">{group.roNumbers.join(', ') || '-'}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setDetailModalGroup(group)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Boxes className="w-3.5 h-3.5" />
                          <span>{group.items?.length || 0} Jenis Item ({group.totalUnits} Unit)</span>
                        </button>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-700 dark:text-slate-300">{group.primarySj.driver_nama || group.primarySj.driver_name || 'Driver Pengantar'}</span>
                        </div>
                        <span className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">
                          {group.primarySj.kendaraan_plat || group.primarySj.vehicle_number || '-'}
                        </span>
                      </div>

                      {/* List Nama Item */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Daftar Item ({group.totalUnits} Unit):</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setDetailModalGroup(group)}
                            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Rincian</span>
                          </button>
                        </div>

                        {group.items && group.items.length > 0 ? (
                          <div className="space-y-1.5 bg-slate-50/80 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs">
                            {group.items.slice(0, 3).map((it: any, idx: number) => {
                              const itemName = it.item_name || it.nama_barang || it.name || 'Nama Item';
                              const qty = it.quantity ?? it.qty ?? 1;
                              const unit = it.unit || it.satuan || 'UNIT';
                              return (
                                <div key={it.id || idx} className="flex items-center justify-between">
                                  <span className="truncate pr-2 font-medium text-slate-700 dark:text-slate-300">
                                    {itemName}
                                  </span>
                                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                                    {qty} {unit}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 italic">Tidak ada rincian item</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer Card Actions */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 mt-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(formatSjDocText(group), `Surat Jalan ${group.outletName}`, `grid-${group.key}`)}
                        className="p-2 text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Salin ringkasan surat jalan"
                      >
                        {copiedId === `grid-${group.key}` ? (
                          <CheckCheck className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <Link
                        href={printUrl}
                        className="p-2 text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Cetak Surat Jalan Outlet Ini"
                      >
                        <Printer className="w-4 h-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(group)}
                        className="p-2 text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Hapus Surat Jalan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isInTransit && (
                      <button
                        type="button"
                        onClick={() => setDeliveryProofTargetSj(group.primarySj)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer shadow-2xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Konfirmasi Tiba</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL DETAIL RINCIAN ITEM SURAT JALAN */}
      {detailModalGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="spring-pop panel-card w-full max-w-xl max-h-[85vh] flex flex-col p-6 space-y-4 border rounded-2xl bg-white dark:bg-[#1e1f20] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">
                      Rincian Item Surat Jalan: {detailModalGroup.outletName}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    SJ: <strong>{detailModalGroup.sjNumbers.join(', ')}</strong> • Ref RO: <strong>{detailModalGroup.roNumbers.join(', ') || '-'}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalGroup(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Table */}
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 mb-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Pengemudi (Driver):</span>
                  <strong className="text-slate-800 dark:text-slate-200">{detailModalGroup.primarySj.driver_nama || detailModalGroup.primarySj.driver_name || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Plat Nomor:</span>
                  <strong className="font-mono text-slate-800 dark:text-slate-200">{detailModalGroup.primarySj.kendaraan_plat || detailModalGroup.primarySj.vehicle_number || '-'}</strong>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                      <th className="py-2.5 px-3">Nama Item / Barang</th>
                      <th className="py-2.5 px-3 text-center w-24">Jumlah</th>
                      <th className="py-2.5 px-3">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detailModalGroup.items && detailModalGroup.items.length > 0 ? (
                      detailModalGroup.items.map((it: any, idx: number) => {
                        const itemName = it.item_name || it.nama_barang || it.name || 'Barang';
                        const qty = it.quantity ?? it.qty ?? it.jumlah ?? 1;
                        const unit = it.unit || it.satuan || 'UNIT';
                        return (
                          <tr key={it.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2.5 px-3 text-center font-medium text-slate-500">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              {itemName}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              {qty} {unit}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px] italic">
                              {it.notes || it.specification || '-'}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400 italic">
                          Tidak ada rincian item dalam dokumen ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {detailModalGroup.items && detailModalGroup.items.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 font-bold border-t border-slate-200 dark:border-slate-700">
                        <td colSpan={2} className="py-2 px-3 text-right">Total Fisik:</td>
                        <td className="py-2 px-3 text-center font-mono text-indigo-600 dark:text-indigo-400">{detailModalGroup.totalUnits} UNIT</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Bukti Serah Terima & TTD Cabang */}
              {(detailModalGroup.primarySj.tanda_tangan_url || detailModalGroup.primarySj.foto_bukti_url || detailModalGroup.primarySj.catatan_penerimaan) && (
                <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-3 mt-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Bukti Serah Terima &amp; Tanda Tangan Digital Cabang</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {detailModalGroup.primarySj.tanda_tangan_url && (
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                          Tanda Tangan ({detailModalGroup.primarySj.receiver_name || detailModalGroup.primarySj.penerima_nama || 'PIC Penerima'})
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={detailModalGroup.primarySj.tanda_tangan_url} 
                          alt="Tanda Tangan Penerima" 
                          className="h-20 max-w-full object-contain mx-auto"
                        />
                      </div>
                    )}

                    {detailModalGroup.primarySj.foto_bukti_url && (
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                          Foto Fisik Barang Tiba
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={detailModalGroup.primarySj.foto_bukti_url} 
                          alt="Foto Bukti Barang" 
                          className="h-20 w-full object-cover rounded-lg"
                        />
                      </div>
                    )}
                  </div>

                  {detailModalGroup.primarySj.catatan_penerimaan && (
                    <div className="text-[11px] text-emerald-900 dark:text-emerald-200 bg-white/70 dark:bg-slate-900/60 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                      <strong>Catatan Penerima:</strong> {detailModalGroup.primarySj.catatan_penerimaan}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                Total: <strong>{detailModalGroup.items?.length || 0} Jenis Barang ({detailModalGroup.totalUnits} Unit)</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailModalGroup(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Tutup
                </button>
                <Link
                  href={`/distribution/surat-jalan/print/${encodeURIComponent(detailModalGroup.primarySj.id)}?outlet=${encodeURIComponent(detailModalGroup.outletName)}`}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Surat Jalan ({detailModalGroup.items?.length || 0} Item)</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BUKTI SERAH TERIMA & TTD DIGITAL */}
      {deliveryProofTargetSj && (
        <DeliveryProofModal
          isOpen={Boolean(deliveryProofTargetSj)}
          onClose={() => setDeliveryProofTargetSj(null)}
          suratJalan={deliveryProofTargetSj}
          defaultReceiverName={user?.full_name || ''}
          onConfirm={handleConfirmDeliveryWithProof}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
