'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SuratJalan } from '@/lib/supabase/types';
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
  ArrowRight
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
  { id: 'items', label: 'Item', defaultVisible: true },
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
  const [detailModalSj, setDetailModalSj] = useState<SuratJalan | null>(null);
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

  const formatSjDocText = (sj: SuratJalan) => {
    const sjNo = sj.nomor_sj || sj.sj_number || sj.id;
    const dest = sj.tujuan_outlet_nama || sj.branch_name || 'Outlet Cabang';
    const itemsStr = (sj.items || [])
      .map((it: any, idx: number) => `  ${idx + 1}. ${it.item_name || it.nama_barang} (${it.quantity ?? it.qty ?? 1} ${it.unit || it.satuan || 'Unit'})`)
      .join('\n');

    return [
      `📄 *SURAT JALAN DISTRIBUSI: ${sjNo}*`,
      `• Tanggal: ${formatDateOnly(sj.delivery_date || sj.tanggal_kirim || sj.created_at)}`,
      `• Rute: Gudang Pusat SCGA ➔ ${dest}`,
      `• Kurir / Armada: ${sj.expedition || sj.driver_nama || sj.driver_name || 'Armada Internal'} (${sj.kendaraan_plat || sj.vehicle_number || '-'})`,
      `• Pengirim: ${sj.sender_name || sj.pengirim_nama || 'Staff Logistik SCGA'}`,
      `• Penerima: ${sj.receiver_name || sj.penerima_nama || 'Menunggu konfirmasi cabang'}`,
      `• Status: ${sj.status}`,
      `• Daftar Barang:`,
      itemsStr || '  (Belum ada rincian item)',
      sj.catatan || sj.notes ? `• Catatan: ${sj.catatan || sj.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const formatAllTransfersText = () => {
    if (filteredList.length === 0) return 'Tidak ada data Surat Jalan.';
    return [
      `📋 *DAFTAR DOKUMEN SURAT JALAN DISTRIBUSI (${filteredList.length})*`,
      `Dicetak/Disalin pada: ${new Date().toLocaleString('id-ID')}`,
      '',
      ...filteredList.map((sj, i) => {
        const sjNo = sj.nomor_sj || sj.sj_number || sj.id;
        const dest = sj.tujuan_outlet_nama || sj.branch_name || 'Cabang';
        const itemCount = sj.items?.length || 0;
        return `${i + 1}. ${sjNo} | ${dest} | Status: ${sj.status} | ${itemCount} Item`;
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

  const handleDeleteSingle = async (sj: SuratJalan) => {
    const sjNo = sj.nomor_sj || sj.sj_number || sj.id;
    if (!window.confirm(`Hapus dokumen Surat Jalan ${sjNo}? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    try {
      setUpdatingId(sj.id);
      const res = await fetch(`/api/distribution/surat-jalan?id=${encodeURIComponent(sj.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setSjList((prev) => prev.filter((s) => s.id !== sj.id && s.sj_number !== sj.id));
        setToast({ type: 'success', message: `Dokumen ${sjNo} berhasil dihapus.` });
      } else {
        setToast({ type: 'error', message: data.error || 'Gagal menghapus dokumen' });
      }
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

  const filteredList = useMemo(() => {
    return sjList.filter((sj) => {
      const sjRegion = sj.region || (
        (sj.branch_name || sj.tujuan_outlet_nama || '').toLowerCase().includes('kalbar') ? 'KALBAR' : 'JABODETABEK'
      );
      if (!matchesRegion(sjRegion, regionFilter)) return false;

      const norm = normalizeSjStatus(sj.status);

      // Status filter logic: Dokumen yang sudah diterima outlet keluar dari daftar aktif
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

          <div className="relative flex-1 min-w-[220px]">
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

        {/* View Mode Toggle: Tabel (Utama) vs Kartu */}
        <div className="flex items-center gap-1.5 self-end md:self-auto">
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

      {/* TAMPILAN UTAMA: TABLE DOKUMEN DISTRIBUSI (PERSIS SESUAI SPESIFIKASI USER) */}
      {viewMode === 'table' ? (
        <div className="panel-card overflow-hidden border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] rounded-2xl shadow-xs">
          {/* Table Header Bar */}
          <div className="p-3 px-4 border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#1e1f20] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#444746] dark:text-[#c4c7c5]">
                Daftar Dokumen Distribusi {statusFilter === 'ACTIVE' ? 'Aktif' : statusFilter === 'DELIVERED' ? 'Diterima di Outlet (SLA)' : ''} ({filteredList.length})
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
              {filteredList.length > 0 && (
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
                  {isVisible('items') && <th className="py-3.5 px-3 text-center">Item</th>}
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
                ) : filteredList.length === 0 ? (
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
                  filteredList.map((sj) => {
                    const norm = normalizeSjStatus(sj.status);
                    const isInTransit = norm === 'SHIPPED' || norm === 'PROCESSED';
                    const isReceived = norm === 'DELIVERED';
                    const sjNo = sj.nomor_sj || sj.sj_number || sj.id;
                    const roNo = sj.ro_nomor || sj.ro_number;
                    const dest = sj.tujuan_outlet_nama || sj.branch_name || 'Outlet Cabang';
                    const driver = sj.driver_nama || sj.driver_name || sj.expedition || 'Armada Internal SCGA';
                    const plate = sj.kendaraan_plat || sj.vehicle_number;

                    return (
                      <tr key={sj.id} className="hover:bg-[#f8fafd] dark:hover:bg-[#282a2c]/60 transition-colors">
                        {/* No. Dokumen & Surat Jalan */}
                        {isVisible('doc_number') && (
                          <td className="py-3 px-3">
                            <div className="font-mono font-bold text-xs text-[#0b57d0] dark:text-[#a8c7fa]">
                              {sjNo}
                            </div>
                            {roNo && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Ref: {roNo}
                              </div>
                            )}
                            <Link
                              href={`/distribution/surat-jalan/print/${sj.id}`}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline mt-0.5"
                              title="Klik untuk cetak Surat Jalan Distribusi"
                            >
                              <Printer className="h-3 w-3" />
                              <span>Cetak SJ</span>
                            </Link>
                          </td>
                        )}

                        {/* Route */}
                        {isVisible('route') && (
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 font-semibold text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
                              <span className="text-[#444746] dark:text-[#c4c7c5]">Gudang Pusat SCGA</span>
                              <span className="text-[#0b57d0] dark:text-[#a8c7fa]">&rarr;</span>
                              <span className="text-[#0b57d0] dark:text-[#a8c7fa]">{dest}</span>
                            </div>
                            <div className="text-[10px] text-[#747775] dark:text-[#8e918f] mt-0.5">
                              Gudang Pusat &rarr; Outlet Cabang
                            </div>
                          </td>
                        )}

                        {/* Tanggal & Kurir */}
                        {isVisible('dates_courier') && (
                          <td className="py-3 px-3">
                            <div className="text-xs font-medium text-[#1f1f1f] dark:text-[#e3e3e3]">
                              Kirim: {formatDateOnly(sj.delivery_date || sj.tanggal_kirim || sj.created_at)}
                            </div>
                            {sj.received_at && (
                              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                Tiba: {formatDateOnly(sj.received_at)}
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
                              {sj.sender_name || sj.pengirim_nama || 'Staff Logistik SCGA'}
                            </div>
                            <div className="text-xs text-[#1f1f1f] dark:text-[#e3e3e3] mt-0.5">
                              <span className="text-[#747775] dark:text-[#8e918f]">Penerima:</span>{' '}
                              {sj.receiver_name || sj.penerima_nama ? (
                                <strong className="text-emerald-700 dark:text-emerald-300">
                                  {sj.receiver_name || sj.penerima_nama}
                                </strong>
                              ) : (
                                <span className="italic text-[#747775]">Menunggu konfirmasi outlet</span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Items */}
                        {isVisible('items') && (
                          <td className="py-3 px-3">
                            <div className="space-y-1.5 min-w-[200px] max-w-[300px]">
                              {sj.items && sj.items.length > 0 ? (
                                sj.items.slice(0, 3).map((it: any, idx: number) => {
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
                                })
                              ) : (
                                <span className="text-xs text-[#747775] italic">0 Unit</span>
                              )}

                              {sj.items && sj.items.length > 3 && (
                                <button
                                  type="button"
                                  onClick={() => setDetailModalSj(sj)}
                                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  <span>+ {sj.items.length - 3} item lainnya...</span>
                                </button>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Status */}
                        {isVisible('status') && (
                          <td className="py-3 px-3 text-center">
                            {getStatusBadge(sj.status)}
                          </td>
                        )}

                        {/* Actions */}
                        {isVisible('actions') && (
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isInTransit && (
                                <button
                                  onClick={() => setDeliveryProofTargetSj(sj)}
                                  className="flex items-center gap-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                                  title="Konfirmasi Kedatangan Barang & Tanda Tangan Digital"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Konfirmasi Tiba</span>
                                </button>
                              )}

                              <button
                                onClick={() => copyToClipboard(formatSjDocText(sj), `Surat Jalan ${sjNo}`, `doc-${sj.id}`)}
                                className="p-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] text-[#444746] dark:text-[#c4c7c5] transition-colors cursor-pointer"
                                title="Salin ringkasan surat jalan ini"
                              >
                                {copiedId === `doc-${sj.id}` ? (
                                  <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>

                              <Link
                                href={`/distribution/surat-jalan/print/${sj.id}`}
                                className="p-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] text-[#444746] dark:text-[#c4c7c5] transition-colors cursor-pointer"
                                title="Cetak Surat Jalan Distribusi"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Link>

                              <button
                                onClick={() => setDetailModalSj(sj)}
                                className="p-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] text-[#444746] dark:text-[#c4c7c5] transition-colors cursor-pointer"
                                title="Lihat Detail Distribusi"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeleteSingle(sj)}
                                disabled={updatingId === sj.id}
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
          ) : filteredList.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-slate-900 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800">
              <FileText className="w-12 h-12 mx-auto text-slate-400 mb-3 opacity-60" />
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Belum ada Surat Jalan</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                Surat Jalan akan otomatis tercipta ketika Request Order (RO) yang disetujui diproses atau diterbitkan langsung dari Gudang SCGA.
              </p>
            </div>
          ) : (
            filteredList.map((sj) => {
              const sjNo = sj.nomor_sj || sj.sj_number || 'SJ-CA-DRAFT';
              const norm = normalizeSjStatus(sj.status);
              const isInTransit = norm === 'SHIPPED' || norm === 'PROCESSED';

              return (
                <div
                  key={sj.id}
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
                          {formatDateOnly(sj.delivery_date || sj.tanggal_kirim || sj.created_at)}
                        </div>
                      </div>
                      {getStatusBadge(sj.status)}
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-sm">
                      <div>
                        <div className="text-xs text-slate-400">Outlet Tujuan:</div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {sj.tujuan_outlet_nama || sj.branch_name || 'Outlet Tujuan'}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                        <span>
                          Ref RO: <strong className="font-mono text-slate-700 dark:text-slate-300">{sj.ro_nomor || sj.ro_number || '-'}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setDetailModalSj(sj)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Boxes className="w-3.5 h-3.5" />
                          <span>{sj.items?.length || 0} Jenis Item</span>
                        </button>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-700 dark:text-slate-300">{sj.driver_nama || sj.driver_name || 'Driver Pengantar'}</span>
                        </div>
                        <span className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">
                          {sj.kendaraan_plat || sj.vehicle_number || '-'}
                        </span>
                      </div>

                      {/* List Nama Item */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Daftar Item:</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setDetailModalSj(sj)}
                            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Rincian</span>
                          </button>
                        </div>

                        {sj.items && sj.items.length > 0 ? (
                          <div className="space-y-1.5 bg-slate-50/80 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs">
                            {sj.items.slice(0, 3).map((it: any, idx: number) => {
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
                        onClick={() => copyToClipboard(formatSjDocText(sj), `Surat Jalan ${sjNo}`, `grid-${sj.id}`)}
                        className="p-2 text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Salin ringkasan surat jalan"
                      >
                        {copiedId === `grid-${sj.id}` ? (
                          <CheckCheck className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <Link
                        href={`/distribution/surat-jalan/print/${sj.id}`}
                        className="p-2 text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Cetak Surat Jalan"
                      >
                        <Printer className="w-4 h-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteSingle(sj)}
                        className="p-2 text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Hapus Surat Jalan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isInTransit && (
                      <button
                        type="button"
                        onClick={() => setDeliveryProofTargetSj(sj)}
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
      {detailModalSj && (
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
                      Rincian Item Surat Jalan
                    </h3>
                    <span className="font-mono text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded">
                      {detailModalSj.nomor_sj || detailModalSj.sj_number}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Tujuan: <strong>{detailModalSj.tujuan_outlet_nama || detailModalSj.branch_name}</strong> • Ref RO: <strong>{detailModalSj.ro_nomor || detailModalSj.ro_number}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalSj(null)}
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
                  <strong className="text-slate-800 dark:text-slate-200">{detailModalSj.driver_nama || detailModalSj.driver_name || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Plat Nomor:</span>
                  <strong className="font-mono text-slate-800 dark:text-slate-200">{detailModalSj.kendaraan_plat || detailModalSj.vehicle_number || '-'}</strong>
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
                    {detailModalSj.items && detailModalSj.items.length > 0 ? (
                      detailModalSj.items.map((it: any, idx: number) => {
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
                              {it.notes || '-'}
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
                </table>
              </div>

              {/* Bukti Serah Terima & TTD Cabang */}
              {(detailModalSj.tanda_tangan_url || detailModalSj.foto_bukti_url || detailModalSj.catatan_penerimaan) && (
                <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-3 mt-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Bukti Serah Terima &amp; Tanda Tangan Digital Cabang</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {detailModalSj.tanda_tangan_url && (
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                          Tanda Tangan ({detailModalSj.receiver_name || detailModalSj.penerima_nama || 'PIC Penerima'})
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={detailModalSj.tanda_tangan_url} 
                          alt="Tanda Tangan Penerima" 
                          className="h-20 max-w-full object-contain mx-auto"
                        />
                      </div>
                    )}

                    {detailModalSj.foto_bukti_url && (
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                          Foto Fisik Barang Tiba
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={detailModalSj.foto_bukti_url} 
                          alt="Foto Bukti Barang" 
                          className="h-20 w-full object-cover rounded-lg"
                        />
                      </div>
                    )}
                  </div>

                  {detailModalSj.catatan_penerimaan && (
                    <div className="text-[11px] text-emerald-900 dark:text-emerald-200 bg-white/70 dark:bg-slate-900/60 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                      <strong>Catatan Penerima:</strong> {detailModalSj.catatan_penerimaan}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                Total: <strong>{detailModalSj.items?.length || 0} Jenis Barang</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailModalSj(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Tutup
                </button>
                <Link
                  href={`/distribution/surat-jalan/print/${detailModalSj.id}`}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Surat Jalan</span>
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
