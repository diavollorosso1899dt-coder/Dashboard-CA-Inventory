'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { SuratJalan } from '@/lib/supabase/types';
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
  PackageCheck
} from 'lucide-react';

interface SuratJalanListViewProps {
  isHistoryOnly?: boolean;
}

export default function SuratJalanListView({ isHistoryOnly = false }: SuratJalanListViewProps) {
  const [sjList, setSjList] = useState<SuratJalan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(isHistoryOnly ? 'Selesai' : 'ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSj();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/distribution/surat-jalan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: newStatus,
          catatan: `Status diupdate ke ${newStatus} pada ${new Date().toLocaleTimeString('id-ID')}`
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSjList(prev => prev.map(sj => sj.id === id ? { ...sj, status: newStatus as any } : sj));
      } else {
        alert(data.error || 'Gagal mengubah status');
      }
    } catch (err) {
      alert('Terjadi kesalahan saat mengupdate status');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredList = sjList.filter(sj => {
    if (isHistoryOnly && sj.status !== 'Selesai' && sj.status !== 'Dibatalkan') return false;
    if (!isHistoryOnly && statusFilter !== 'ALL' && sj.status !== statusFilter) return false;
    
    const query = search.toLowerCase();
    const noSj = (sj.nomor_sj || sj.sj_number || '').toLowerCase();
    const roNo = (sj.ro_nomor || sj.ro_number || '').toLowerCase();
    const dest = (sj.tujuan_outlet_nama || sj.branch_name || '').toLowerCase();
    const driver = (sj.driver_nama || sj.driver_name || '').toLowerCase();
    const plat = (sj.kendaraan_plat || sj.vehicle_number || '').toLowerCase();

    return (
      noSj.includes(query) ||
      roNo.includes(query) ||
      dest.includes(query) ||
      driver.includes(query) ||
      plat.includes(query)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Selesai':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Diterima Cabang
          </span>
        );
      case 'Dalam Pengiriman':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <Truck className="w-3.5 h-3.5 animate-pulse" /> Sedang Dikirim
          </span>
        );
      case 'Diproses':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5" /> Packing Gudang
          </span>
        );
      case 'Dibatalkan':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-3.5 h-3.5" /> Dibatalkan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            {status}
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

        {!isHistoryOnly && (
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
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
          </div>
        )}
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
                    <span>{sj.items?.length || 0} Jenis Item</span>
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

                {sj.status === 'Diproses' && (
                  <button
                    onClick={() => handleUpdateStatus(sj.id, 'Dalam Pengiriman')}
                    disabled={updatingId === sj.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors"
                  >
                    <Truck className="w-3.5 h-3.5" /> Kirimkan
                  </button>
                )}

                {sj.status === 'Dalam Pengiriman' && (
                  <button
                    onClick={() => handleUpdateStatus(sj.id, 'Selesai')}
                    disabled={updatingId === sj.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Konfirmasi Diterima
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
