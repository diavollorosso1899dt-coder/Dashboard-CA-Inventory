'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DispositionRequest } from '@/lib/supabase/types';
import { 
  Trash2, 
  RotateCcw, 
  Search, 
  Filter, 
  RefreshCw, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Package, 
  Building2, 
  AlertTriangle,
  ExternalLink,
  Calendar,
  User,
  Plus
} from 'lucide-react';

export default function DispositionStatusView() {
  const [requests, setRequests] = useState<DispositionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedReq, setSelectedReq] = useState<DispositionRequest | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDispositions = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/disposition');
      const json = await res.json();
      if (json.data) {
        setRequests(json.data);
      }
    } catch (err) {
      console.error('Failed to load dispositions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispositions();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/disposition', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: newStatus,
          catatan_admin: adminNote || `Status diubah menjadi ${newStatus}`
        })
      });
      const data = await res.json();
      if (data.success) {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus as any, catatan_admin: adminNote || r.catatan_admin } : r));
        if (selectedReq && selectedReq.id === id) {
          setSelectedReq({ ...selectedReq, status: newStatus as any, catatan_admin: adminNote || selectedReq.catatan_admin });
        }
        setAdminNote('');
      } else {
        alert(data.error || 'Gagal mengubah status');
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan');
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = requests.filter(r => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    const q = search.toLowerCase();
    const outlet = (r.outlet_nama || r.branch_name || '').toLowerCase();
    const assetName = (r.nama_aset || (r.items && r.items[0]?.item_name) || '').toLowerCase();
    const assetCode = (r.kode_aset || r.disposition_number || '').toLowerCase();
    const reason = (r.alasan || (r.items && r.items[0]?.reason) || '').toLowerCase();
    const pic = (r.diajukan_oleh || r.requester_name || '').toLowerCase();
    return (
      outlet.includes(q) ||
      assetName.includes(q) ||
      assetCode.includes(q) ||
      reason.includes(q) ||
      pic.includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Diajukan':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5" /> Menunggu Verifikasi
          </span>
        );
      case 'Disetujui':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <CheckCircle className="w-3.5 h-3.5" /> Disetujui Penjemputan
          </span>
        );
      case 'Diterima Gudang':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <Package className="w-3.5 h-3.5" /> Diterima di Gudang
          </span>
        );
      case 'Di-Scrap':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
            <Trash2 className="w-3.5 h-3.5" /> Aset Di-Scrap
          </span>
        );
      case 'Ditolak':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <XCircle className="w-3.5 h-3.5" /> Ditolak
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded-xl text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Monitoring Disposisi & Retur Aset</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pelacakan tiket pengembalian barang, verifikasi kondisi kerusakan, serta proses afkir/scrap
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDispositions}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/disposition/return-form"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Form Pengembalian Baru
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari No Tiket, Aset, Cabang, PIC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          {['ALL', 'Diajukan', 'Disetujui', 'Diterima Gudang', 'Di-Scrap', 'Ditolak'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                statusFilter === st
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {st === 'ALL' ? 'Semua' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3.5 px-4">No. Tiket / Tanggal</th>
                <th className="py-3.5 px-4">Cabang Pengaju</th>
                <th className="py-3.5 px-4">Nama & Kode Aset</th>
                <th className="py-3.5 px-4">Kondisi Aset</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-center">Aksi / Rincian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                    Memuat data tiket disposisi...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Tidak ada data permohonan disposisi yang sesuai kriteria.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                        DSP-{item.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.created_at).toLocaleDateString('id-ID')}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                      {item.outlet_nama || item.branch_name || 'Outlet'}
                      <div className="text-xs font-normal text-slate-400 flex items-center gap-1 mt-0.5">
                        <User className="w-3.5 h-3.5" /> PIC: {item.diajukan_oleh || item.requester_name || '-'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {item.nama_aset || (item.items && item.items[0]?.item_name) || 'Aset'}
                      </div>
                      <div className="text-xs font-mono text-slate-400">
                        {item.kode_aset || item.disposition_number || '-'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                        (item.kondisi === 'Rusak Berat' || item.kondisi === 'Tidak Layak Pakai' || item.kondisi === 'RUSAK_BERAT' || item.kondisi === 'TIDAK_LAYAK')
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}>
                        {item.kondisi || (item.items && item.items[0]?.condition) || 'Rusak Ringan'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {getStatusBadge(item.status)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedReq(item);
                          setAdminNote(item.catatan_admin || '');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-white bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-600 dark:hover:bg-indigo-600 rounded-lg transition"
                      >
                        <Eye className="w-3.5 h-3.5" /> Rincian Form
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rincian Form Modal (from mind map: Rincian Form) */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Rincian Form Disposisi</h3>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                    DSP-{selectedReq.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Diajukan pada {new Date(selectedReq.created_at).toLocaleString('id-ID')}
                </p>
              </div>
              <button
                onClick={() => setSelectedReq(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-2 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <span className="text-slate-400 block font-bold uppercase mb-1">Outlet Pengirim</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  {selectedReq.outlet_nama || selectedReq.branch_name || 'Outlet'}
                </span>
                <p className="text-slate-400 mt-1">
                  PIC: {selectedReq.diajukan_oleh || selectedReq.requester_name || '-'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <span className="text-slate-400 block font-bold uppercase mb-1">Aset Terkait</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  {selectedReq.nama_aset || (selectedReq.items && selectedReq.items[0]?.item_name) || 'Aset'}
                </span>
                <p className="font-mono text-slate-400 mt-1">
                  Tag: {selectedReq.kode_aset || selectedReq.disposition_number || '-'}
                </p>
              </div>
            </div>

            {/* Status & Condition */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-xs text-slate-400 block">Kondisi Fisik:</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {selectedReq.kondisi || (selectedReq.items && selectedReq.items[0]?.condition) || 'Rusak Ringan'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block text-right">Status Proses:</span>
                <div className="mt-1">{getStatusBadge(selectedReq.status)}</div>
              </div>
            </div>

            {/* Alasan */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Kronologi / Alasan Retur</label>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {selectedReq.alasan || (selectedReq.items && selectedReq.items[0]?.reason) || 'Tidak ada keterangan tambahan.'}
              </div>
            </div>

            {/* Foto Attachment if exists */}
            {selectedReq.foto_url && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Foto Bukti Kerusakan</label>
                <a
                  href={selectedReq.foto_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline bg-indigo-50 dark:bg-indigo-950/40 p-2.5 rounded-xl w-full"
                >
                  <ExternalLink className="w-4 h-4" /> Buka Lampiran Bukti: {selectedReq.foto_url}
                </a>
              </div>
            )}

            {/* Admin Note Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Catatan Verifikasi Admin / Logistik
              </label>
              <input
                type="text"
                placeholder="Tambahkan instruksi teknis atau alasan persetujuan/penolakan..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
              {selectedReq.status === 'Diajukan' && (
                <>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateStatus(selectedReq.id, 'Ditolak')}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 transition"
                  >
                    Tolak Pengajuan
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateStatus(selectedReq.id, 'Disetujui')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                  >
                    Setujui (Jadwalkan Tarik)
                  </button>
                </>
              )}

              {selectedReq.status === 'Disetujui' && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleUpdateStatus(selectedReq.id, 'Diterima Gudang')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  Konfirmasi Diterima di Gudang
                </button>
              )}

              {selectedReq.status === 'Diterima Gudang' && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleUpdateStatus(selectedReq.id, 'Di-Scrap')}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  Scrap / Hapus dari Aset Aktif
                </button>
              )}

              <button
                onClick={() => setSelectedReq(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-medium transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
