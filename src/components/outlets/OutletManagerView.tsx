'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Outlet } from '@/lib/supabase/types';
import { 
  Building2, 
  MapPin, 
  Phone, 
  User, 
  Plus, 
  Search, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  Calendar,
  AlertCircle,
  Clock,
  Sparkles,
  Boxes,
  ArrowRight
} from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton';

export default function OutletManagerView() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<{
    id?: string;
    nama: string;
    region: 'JABO' | 'KALBAR';
    alamat: string;
    pic_nama: string;
    telepon: string;
    status: 'Aktif' | 'Persiapan Buka' | 'Renovasi' | 'Tutup';
    target_opening: string;
  }>({
    nama: '',
    region: 'JABO',
    alamat: '',
    pic_nama: '',
    telepon: '',
    status: 'Aktif',
    target_opening: ''
  });

  const fetchOutlets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/outlets');
      const json = await res.json();
      if (json.data) setOutlets(json.data);
    } catch (err) {
      console.error('Failed to load outlets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOutlets();
  }, []);

  const handleSaveOutlet = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/outlets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          branch_name: formData.nama,
          address: formData.alamat,
          pic_name: formData.pic_nama,
          pic_phone: formData.telepon,
          target_opening_date: formData.target_opening || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setIsModalOpen(false);
        fetchOutlets();
      } else {
        alert(json.error || 'Gagal menyimpan data outlet');
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredOutlets = outlets.filter((o) => {
    if (regionFilter !== 'ALL') {
      const isJabo =
        (regionFilter === 'JABO' || regionFilter === 'JABODETABEK') &&
        (o.region === 'JABO' || o.region === 'JABODETABEK');
      if (!isJabo && o.region !== regionFilter) return false;
    }
    const q = search.toLowerCase();
    const name = (o.nama || o.branch_name || '').toLowerCase();
    const address = (o.alamat || o.address || '').toLowerCase();
    const pic = (o.pic_nama || o.pic_name || '').toLowerCase();
    return (
      name.includes(q) ||
      address.includes(q) ||
      pic.includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Aktif':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> Operasional Aktif
          </span>
        );
      case 'Persiapan Buka':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
            <Clock className="w-3 h-3 animate-pulse" /> Persiapan Grand Opening
          </span>
        );
      case 'Renovasi':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400">
            Renovasi Toko
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400">
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
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Master Data Outlet & Cabang</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Daftar seluruh outlet Coffee Arabica (CA) regional JABO dan KALBAR serta status kesiapan operasional
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchOutlets}
            disabled={loading}
            className="interactive-tap inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              setFormData({
                nama: '',
                region: 'JABO',
                alamat: '',
                pic_nama: '',
                telepon: '',
                status: 'Aktif',
                target_opening: ''
              });
              setIsModalOpen(true);
            }}
            className="interactive-tap inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Tambah Outlet Baru
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama outlet, alamat, atau nama PIC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {['ALL', 'JABO', 'KALBAR'].map((rf) => (
            <button
              key={rf}
              onClick={() => setRegionFilter(rf)}
              className={`interactive-tap px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                regionFilter === rf
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {rf === 'ALL' ? 'Semua Region' : `Region ${rf}`}
            </button>
          ))}
        </div>
      </div>

      {/* Outlet Rows Table or Skeleton */}
      {loading ? (
        <TableSkeleton columns={7} rows={7} />
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/60 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
                  <th scope="col" className="py-3.5 px-4 font-semibold">Outlet / Cabang</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold">Region</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold">PIC / Manager</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold">Kontak</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold">Target Opening</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold">Status</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOutlets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Building2 className="w-12 h-12 mx-auto text-slate-400 mb-3 opacity-60" />
                    <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Outlet Tidak Ditemukan</h3>
                    <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                      Gunakan kata kunci lain atau tambahkan outlet baru menggunakan tombol di atas.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOutlets.map((outlet) => {
                  const outletName = outlet.nama || outlet.branch_name;
                  const outletAddress = outlet.alamat || outlet.address;
                  const picName = outlet.pic_nama || outlet.pic_name;
                  const picPhone = outlet.telepon || outlet.pic_phone;
                  const targetDate = outlet.target_opening || outlet.target_opening_date;

                  return (
                    <tr
                      key={outlet.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Outlet & Alamat */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {outletName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-start gap-1 max-w-xs">
                          <MapPin className="w-3 h-3 shrink-0 text-slate-400 mt-0.5" />
                          <span className="line-clamp-2">{outletAddress || 'Alamat cabang belum didaftarkan'}</span>
                        </div>
                      </td>

                      {/* Region */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
                          {outlet.region}
                        </span>
                      </td>

                      {/* PIC */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{picName || '-'}</span>
                        </div>
                      </td>

                      {/* Telepon */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{picPhone || '-'}</span>
                        </div>
                      </td>

                      {/* Target Opening */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        {targetDate ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/50">
                            <Calendar className="w-3 h-3" />
                            {new Date(targetDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        {getStatusBadge(outlet.status)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/monitoring/assets?branch=${encodeURIComponent(outletName || '')}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                            title="Lihat Aset Toko"
                          >
                            <Boxes className="w-3.5 h-3.5" />
                            <span>Aset</span>
                          </Link>
                          <Link
                            href={`/opening-readiness?branch=${encodeURIComponent(outletName || '')}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition"
                          >
                            <span>Kesiapan Buka</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
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
      )}

      {/* Modal Tambah / Edit Outlet */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="spring-pop bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tambah Outlet Baru</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOutlet} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                  Nama Outlet / Cabang <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: CA - Mall Kelapa Gading 3"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    Region <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value as any })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="JABO">JABODETABEK & BATAM (JABO)</option>
                    <option value="KALBAR">KALIMANTAN BARAT (KALBAR)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    Status Operasional <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="Aktif">Aktif Operasional</option>
                    <option value="Persiapan Buka">Persiapan Grand Opening</option>
                    <option value="Renovasi">Renovasi</option>
                    <option value="Tutup">Tutup</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                  Alamat Lengkap Outlet
                </label>
                <textarea
                  rows={2}
                  placeholder="Lantai, nama gedung mall, jalan, kota..."
                  value={formData.alamat}
                  onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    PIC / Store Manager
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Anton"
                    value={formData.pic_nama}
                    onChange={(e) => setFormData({ ...formData, pic_nama: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    No. Telepon / WA
                  </label>
                  <input
                    type="text"
                    placeholder="0812-..."
                    value={formData.telepon}
                    onChange={(e) => setFormData({ ...formData, telepon: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                  Target Tanggal Grand Opening (Opsional)
                </label>
                <input
                  type="date"
                  value={formData.target_opening}
                  onChange={(e) => setFormData({ ...formData, target_opening: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Data Outlet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
