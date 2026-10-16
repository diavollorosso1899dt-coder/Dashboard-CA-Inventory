'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SuratJalan } from '@/lib/supabase/types';
import AreaFilterPills from '@/components/ui/AreaFilterPills';
import { normalizeRegion, matchesRegion, StandardRegion } from '@/lib/utils/region-helper';
import { 
  FileText, 
  Truck, 
  Printer, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Filter,
  RefreshCw,
  Calendar,
  User,
  PackageCheck,
  Package,
  ChevronDown,
  Eye,
  X,
  Boxes
} from 'lucide-react';

import { Toast, ToastMessage } from '@/components/ui/Toast';

interface SuratJalanListViewProps {
  isHistoryOnly?: boolean;
}

export function normalizeSjStatus(status?: string): 'PROCESSED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' {
  const s = (status || '').toUpperCase().trim();
  if (s === 'SELESAI' || s === 'DELIVERED') return 'DELIVERED';
  if (s === 'DALAM PENGIRIMAN' || s === 'SHIPPED') return 'SHIPPED';
  if (s === 'DIBATALKAN' || s === 'CANCELLED') return 'CANCELLED';
  return 'PROCESSED';
}

export default function SuratJalanListView({ isHistoryOnly = false }: SuratJalanListViewProps) {
  const searchParams = useSearchParams();
  const urlRegion = searchParams ? searchParams.get('region') : null;
  const [regionFilter, setRegionFilter] = useState<StandardRegion>(normalizeRegion(urlRegion));

  const [sjList, setSjList] = useState<SuratJalan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(isHistoryOnly ? 'Selesai' : 'ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [expandedSjIds, setExpandedSjIds] = useState<Record<string, boolean>>({});
  const [detailModalSj, setDetailModalSj] = useState<SuratJalan | null>(null);

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

  const handleUpdateStatus = async (id: string, newStatus: string, roRef?: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/distribution/surat-jalan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: newStatus,
          catatan: `Status diupdate ke ${newStatus} pada ${new Date().toLocaleTimeString('id-ID')}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSjList((prev) => prev.map((sj) => (sj.id === id ? { ...sj, status: newStatus as any } : sj)));
        setToast({
          type: 'success',
          message: `Surat Jalan berhasil diperbarui: ${newStatus === 'DELIVERED' || newStatus === 'Selesai' ? 'Diterima Cabang' : 'Sedang Dikirim'}!`,
        });

        // Auto-advance corresponding RO if reference exists
        if (roRef && (newStatus === 'DELIVERED' || newStatus === 'Selesai')) {
          fetch('/api/distribution/ro', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: roRef,
              updates: {
                status: 'CHECKLIST_DONE',
                current_stage: 'CHECKLIST',
                arrival_datetime: new Date().toISOString(),
              },
            }),
          }).catch((e) => console.warn('Could not auto-advance RO:', e));
        }
      } else {
        setToast({ type: 'error', message: data.error || 'Gagal mengubah status' });
      }
    } catch {
      setToast({ type: 'error', message: 'Terjadi kesalahan saat mengupdate status' });
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredList = sjList.filter((sj) => {
    const sjRegion = sj.region || (
      (sj.branch_name || sj.tujuan_outlet_nama || '').toLowerCase().includes('kalbar') ? 'KALBAR' : 'JABODETABEK'
    );
    if (!matchesRegion(sjRegion, regionFilter)) return false;

    const norm = normalizeSjStatus(sj.status);
    if (isHistoryOnly && norm !== 'DELIVERED' && norm !== 'CANCELLED') return false;
    if (!isHistoryOnly && statusFilter !== 'ALL') {
      if (statusFilter === 'Diproses' && norm !== 'PROCESSED') return false;
      if (statusFilter === 'Dalam Pengiriman' && norm !== 'SHIPPED') return false;
      if (statusFilter === 'Selesai' && norm !== 'DELIVERED') return false;
    }

    const query = search.toLowerCase();
    const noSj = (sj.nomor_sj || sj.sj_number || '').toLowerCase();
    const roNo = (sj.ro_nomor || sj.ro_number || '').toLowerCase();
    const dest = (sj.tujuan_outlet_nama || sj.branch_name || '').toLowerCase();
    const driver = (sj.driver_nama || sj.driver_name || '').toLowerCase();
    const plat = (sj.kendaraan_plat || sj.vehicle_number || '').toLowerCase();
    const itemsMatch = (sj.items || []).some((it: any) => {
      const itName = String(it.item_name || it.nama_barang || it.name || '').toLowerCase();
      return itName.includes(query);
    });

    return (
      noSj.includes(query) ||
      roNo.includes(query) ||
      dest.includes(query) ||
      driver.includes(query) ||
      plat.includes(query) ||
      itemsMatch
    );
  });

  const getStatusBadge = (status: string) => {
    const norm = normalizeSjStatus(status);
    switch (norm) {
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Diterima Cabang
          </span>
        );
      case 'SHIPPED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <Truck className="w-3.5 h-3.5 animate-pulse" /> Sedang Dikirim
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-3.5 h-3.5" /> Dibatalkan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5" /> Packing Gudang
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {isHistoryOnly ? 'Riwayat Surat Jalan Selesai' : 'Monitoring & Cetak Surat Jalan (SJ)'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {isHistoryOnly 
                  ? 'Arsip pengiriman aset yang telah berhasil diterima dan dikonfirmasi cabang'
                  : 'Dokumen legalitas pengiriman armada dan pelacakan fisik barang menuju outlet'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchSj}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {!isHistoryOnly && (
            <Link
              href="/distribution/ro"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all"
            >
              <PackageCheck className="w-4 h-4" />
              Generate dari RO
            </Link>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari No. SJ, RO, Outlet, Plat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 flex-wrap">
          <AreaFilterPills
            value={regionFilter}
            onChange={(r) => setRegionFilter(r)}
            syncUrl={true}
          />
          {!isHistoryOnly && (
            <>
              <Filter className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
              {['ALL', 'Diproses', 'Dalam Pengiriman', 'Selesai'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                    statusFilter === st
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {st === 'ALL' ? 'Semua Status' : st}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Surat Jalan Grid / List */}
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
              Surat Jalan akan otomatis tercipta ketika Request Order (RO) yang disetujui diproses untuk pengiriman armada.
            </p>
          </div>
        ) : (
          filteredList.map((sj) => (
            <div
              key={sj.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                      {sj.nomor_sj || sj.sj_number || 'SJ-CA-DRAFT'}
                    </span>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(sj.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                    <span>Ref RO: <strong className="font-mono text-slate-700 dark:text-slate-300">{sj.ro_nomor || sj.ro_number || '-'}</strong></span>
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
                      <span className="text-slate-700 dark:text-slate-300">{sj.driver_nama || sj.driver_name || 'Driver Reguler'}</span>
                    </div>
                    <span className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">
                      {sj.kendaraan_plat || sj.vehicle_number || 'B 9999 CA'}
                    </span>
                  </div>

                  {/* List Nama Item Yang Dikirim */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Daftar Item yang Dikirim:</span>
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
                        {(expandedSjIds[sj.id] ? sj.items : sj.items.slice(0, 3)).map((it: any, idx: number) => {
                          const itemName = it.item_name || it.nama_barang || it.name || 'Nama Item';
                          const qty = it.quantity ?? it.qty ?? it.jumlah ?? 1;
                          const unit = it.unit || it.satuan || 'UNIT';
                          return (
                            <div key={it.id || idx} className="flex items-start justify-between gap-2 py-0.5">
                              <div className="flex items-start gap-1.5 min-w-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                                <div className="min-w-0">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1 text-[11px]" title={itemName}>
                                    {itemName}
                                  </span>
                                  {it.notes && (
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate italic">
                                      {it.notes}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="shrink-0 font-mono font-bold text-[10px] bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 shadow-2xs">
                                {qty} {unit}
                              </span>
                            </div>
                          );
                        })}

                        {sj.items.length > 3 && (
                          <button
                            type="button"
                            onClick={() => setExpandedSjIds((prev) => ({ ...prev, [sj.id]: !prev[sj.id] }))}
                            className="w-full mt-1 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span>
                              {expandedSjIds[sj.id]
                                ? 'Sembunyikan Sebagian'
                                : `+${sj.items.length - 3} item lainnya (Lihat Semua)`}
                            </span>
                            <ChevronDown className={`w-3 h-3 transition-transform ${expandedSjIds[sj.id] ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] italic text-slate-400 p-2 bg-slate-50/50 dark:bg-slate-800/20 rounded-lg text-center">
                        Rincian item belum diisi
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Actions */}
              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <Link
                  href={`/distribution/surat-jalan/print/${sj.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" /> Cetak Lembar SJ
                </Link>

                {normalizeSjStatus(sj.status) === 'PROCESSED' && (
                  <button
                    onClick={() => handleUpdateStatus(sj.id, 'SHIPPED', sj.ro_id || sj.ro_nomor || sj.ro_number)}
                    disabled={updatingId === sj.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors cursor-pointer"
                  >
                    <Truck className="w-3.5 h-3.5" /> Kirimkan
                  </button>
                )}

                {normalizeSjStatus(sj.status) === 'SHIPPED' && (
                  <button
                    onClick={() => handleUpdateStatus(sj.id, 'DELIVERED', sj.ro_id || sj.ro_nomor || sj.ro_number)}
                    disabled={updatingId === sj.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Konfirmasi Diterima
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

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

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
