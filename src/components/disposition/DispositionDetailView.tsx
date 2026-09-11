'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DispositionRequest } from '@/lib/supabase/types';
import { 
  FileText, 
  Search, 
  RotateCcw, 
  CheckCircle, 
  Clock, 
  XCircle, 
  Building2, 
  Calendar, 
  User, 
  Package, 
  Eye, 
  X,
  ExternalLink,
  PlusCircle
} from 'lucide-react';

export default function DispositionDetailView() {
  const [requests, setRequests] = useState<DispositionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedReq, setSelectedReq] = useState<DispositionRequest | null>(null);

  const fetchDispositions = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/disposition');
      const json = await res.json();
      if (json.data) setRequests(json.data);
    } catch (err) {
      console.error('Failed to load dispositions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispositions();
  }, []);

  const filtered = requests.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    const q = search.toLowerCase();
    const docNo = (r.disposition_number || '').toLowerCase();
    const branch = (r.branch_name || r.outlet_nama || '').toLowerCase();
    const userPic = (r.requester_name || r.diajukan_oleh || '').toLowerCase();
    const reason = (r.items && r.items[0]?.reason ? r.items[0].reason : r.alasan || '').toLowerCase();
    return docNo.includes(q) || branch.includes(q) || userPic.includes(q) || reason.includes(q);
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DISETUJUI':
      case 'SELESAI':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5" /> Disetujui
          </span>
        );
      case 'DITOLAK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400">
            <XCircle className="w-3.5 h-3.5" /> Ditolak
          </span>
        );
      case 'DIPROSES':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400">
            <Clock className="w-3.5 h-3.5" /> Diproses
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5 animate-pulse" /> Menunggu Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Rincian Formulir Pengembalian &amp; Disposisi Aset
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Arsip rincian seluruh dokumen permohonan retur aset, barang rusak, perbaikan, dan disposisi afkir.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/disposition/return-form"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Form Pengembalian Aset</span>
          </Link>
          <Link
            href="/disposition/status"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
          >
            <RotateCcw className="w-4 h-4 text-emerald-600" />
            <span>Monitoring Status</span>
          </Link>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari no form, cabang, pemohon, alasan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {['ALL', 'DIAJUKAN', 'DIPROSES', 'DISETUJUI', 'DITOLAK'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                statusFilter === st
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? 'Semua' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Disposition Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400">
            Memuat rincian formulir disposisi...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400">
            Tidak ada dokumen disposisi yang ditemukan.
          </div>
        ) : (
          filtered.map((r) => {
            const itemCount = r.items?.length || 1;
            const primaryItemName = r.items && r.items[0]?.item_name ? r.items[0].item_name : r.nama_aset || 'Item Aset';
            const reason = r.items && r.items[0]?.reason ? r.items[0].reason : r.alasan || 'Pengembalian Aset';

            return (
              <div
                key={r.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-900/50">
                      {r.disposition_number}
                    </span>
                    {getStatusBadge(r.status)}
                  </div>

                  <h3 className="font-bold text-base text-slate-900 dark:text-white mt-2">
                    {r.branch_name || r.outlet_nama}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                    <strong>Alasan:</strong> {reason}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" /> Item:
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {primaryItemName} {itemCount > 1 ? `(+${itemCount - 1} lainnya)` : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> Pemohon:
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {r.requester_name || r.diajukan_oleh}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" /> Tanggal:
                      </span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {r.submission_date || r.created_at?.split('T')[0]}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {r.approval_notes || r.catatan_admin ? 'Ada catatan review' : 'Belum direview'}
                  </span>
                  <button
                    onClick={() => setSelectedReq(r)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Lihat Rincian</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Detail Rincian Form */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Rincian Formulir Disposisi
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedReq.disposition_number}
                </h3>
              </div>
              <button onClick={() => setSelectedReq(null)} className="p-1 rounded-full text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl">
                <div>
                  <span className="text-slate-500">Cabang / Outlet:</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">{selectedReq.branch_name || selectedReq.outlet_nama}</div>
                </div>
                <div>
                  <span className="text-slate-500">Wilayah:</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">{selectedReq.region}</div>
                </div>
                <div>
                  <span className="text-slate-500">Diajukan Oleh:</span>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{selectedReq.requester_name || selectedReq.diajukan_oleh}</div>
                </div>
                <div>
                  <span className="text-slate-500">Tanggal Pengajuan:</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{selectedReq.submission_date}</div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2">Daftar Item yang Diajukan:</h4>
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {(selectedReq.items && selectedReq.items.length > 0 ? selectedReq.items : [
                    {
                      item_name: (selectedReq as any).nama_aset || 'Item Aset',
                      quantity: (selectedReq as any).jumlah || 1,
                      condition: (selectedReq as any).kondisi || 'PERLU_PERBAIKAN',
                      reason: (selectedReq as any).alasan || 'Pengembalian Aset'
                    }
                  ]).map((it: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{it.item_name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Alasan: {it.reason}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{it.quantity} Unit</span>
                        <div className="text-[11px] text-amber-600 font-semibold">{it.condition}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedReq.approval_notes && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 rounded-xl">
                  <span className="font-bold text-amber-800 dark:text-amber-400">Catatan Verifikasi / Admin:</span>
                  <p className="mt-1 text-slate-700 dark:text-slate-300">{selectedReq.approval_notes}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
              <button
                onClick={() => setSelectedReq(null)}
                className="px-5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-semibold text-xs"
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
