'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  RotateCcw, 
  Building2, 
  AlertTriangle, 
  FileText, 
  Camera, 
  Send, 
  CheckCircle2, 
  ArrowLeft,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import Link from 'next/link';

export default function ReturnAssetForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<any[]>([]);
  const [success, setSuccess] = useState(false);
  const [ticketNumber, setTicketNumber] = useState('');

  const [formData, setFormData] = useState({
    outlet_nama: '',
    kode_aset: '',
    nama_aset: '',
    kondisi: 'Rusak Ringan',
    alasan: '',
    foto_url: '',
    diajukan_oleh: ''
  });

  useEffect(() => {
    async function loadOutlets() {
      try {
        const res = await fetch('/api/outlets');
        const json = await res.json();
        if (json.data && json.data.length > 0) {
          setOutlets(json.data);
          setFormData(prev => ({ ...prev, outlet_nama: json.data[0].nama }));
        }
      } catch (err) {
        console.error('Failed to load outlets:', err);
      }
    }
    loadOutlets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTicketNumber(data.data?.id ? `DSP-${data.data.id.slice(0, 6).toUpperCase()}` : 'DSP-OK');
      } else {
        alert(data.error || 'Gagal mengirimkan formulir permohonan');
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl text-center">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Form Pengembalian Terkirim!</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Permohonan pengembalian/disposisi aset Anda telah tersimpan dengan nomor tiket:
          </p>
          <div className="inline-block my-4 px-4 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono font-bold text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700">
            {ticketNumber}
          </div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
            Tim Central Asset & Gudang Pusat akan memverifikasi permohonan ini sebelum armada penjemputan atau surat jalan retur dijadwalkan.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/disposition/status"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition"
            >
              Lihat Monitoring Status
            </Link>
            <button
              onClick={() => {
                setSuccess(false);
                setFormData(prev => ({
                  ...prev,
                  kode_aset: '',
                  nama_aset: '',
                  alasan: '',
                  foto_url: ''
                }));
              }}
              className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition"
            >
              Input Form Baru
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded-xl text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Form Pengembalian Aset</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Formulir pengajuan retur, perbaikan, atau penarikan aset dari outlet ke gudang pusat
            </p>
          </div>
        </div>

        <Link
          href="/disposition/status"
          className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 flex items-center gap-1.5"
        >
          Lihat Status <ArrowLeft className="w-4 h-4 rotate-180" />
        </Link>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        {/* Cabang & Pelapor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
              Outlet / Cabang Pengirim <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                required
                value={formData.outlet_nama}
                onChange={(e) => setFormData({ ...formData, outlet_nama: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              >
                {outlets.length > 0 ? (
                  outlets.map((o) => (
                    <option key={o.id || o.nama} value={o.nama}>
                      {o.nama} ({o.region || 'Cabang'})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="CA - Grand Batam Mall">CA - Grand Batam Mall</option>
                    <option value="CA - Mega Mall Batam">CA - Mega Mall Batam</option>
                    <option value="CA - Ayani Pontianak">CA - Ayani Pontianak</option>
                    <option value="CA - Central Park Jakarta">CA - Central Park Jakarta</option>
                    <option value="CA - Gandaria City">CA - Gandaria City</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
              Nama Petugas / PIC Pengaju <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Rian (Store Supervisor)"
              value={formData.diajukan_oleh}
              onChange={(e) => setFormData({ ...formData, diajukan_oleh: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
        </div>

        {/* Informasi Aset */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
              Nama Aset / Perangkat <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Mesin Espresso La Marzocco Linea 2G"
              value={formData.nama_aset}
              onChange={(e) => setFormData({ ...formData, nama_aset: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
              Kode Aset / Tag / Serial Number (Bila ada)
            </label>
            <input
              type="text"
              placeholder="Contoh: AST-JABO-2024-0891"
              value={formData.kode_aset}
              onChange={(e) => setFormData({ ...formData, kode_aset: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
            />
          </div>
        </div>

        {/* Kondisi Aset */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
            Kondisi Aset Saat Ini <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Rusak Ringan', desc: 'Perlu servis/sparepart' },
              { label: 'Rusak Berat', desc: 'Mati total/tidak fungsi' },
              { label: 'Tidak Layak Pakai', desc: 'Sudah usang/korosi' },
              { label: 'Kelebihan Unit', desc: 'Tidak terpakai di toko' }
            ].map((k) => (
              <label
                key={k.label}
                className={`cursor-pointer border rounded-xl p-3 flex flex-col justify-between transition-all ${
                  formData.kondisi === k.label
                    ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 font-semibold ring-2 ring-amber-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="kondisi"
                  value={k.label}
                  checked={formData.kondisi === k.label}
                  onChange={(e) => setFormData({ ...formData, kondisi: e.target.value })}
                  className="sr-only"
                />
                <span className="text-sm font-bold">{k.label}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{k.desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Alasan & Deskripsi Kerusakan */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
            Rincian Alasan Pengembalian / Indikasi Kerusakan <span className="text-rose-500">*</span>
          </label>
          <textarea
            required
            rows={4}
            placeholder="Jelaskan secara detail kendala yang dialami, kronologi, serta tindakan penanganan awal yang sudah dilakukan..."
            value={formData.alasan}
            onChange={(e) => setFormData({ ...formData, alasan: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 leading-relaxed"
          />
        </div>

        {/* Lampiran Foto Dokumen / URL */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
            Link Lampiran Foto / Bukti Kerusakan (Google Drive / Image URL)
          </label>
          <div className="relative">
            <Camera className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="url"
              placeholder="https://drive.google.com/... atau link foto kerusakan"
              value={formData.foto_url}
              onChange={(e) => setFormData({ ...formData, foto_url: e.target.value })}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" /> Sertakan foto fisik jelas untuk mempercepat proses persetujuan verifikasi pusat.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
          <Link
            href="/disposition/status"
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium transition"
          >
            Batal
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-amber-600/20 transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {loading ? 'Mengirimkan...' : 'Kirim Pengajuan Disposisi'}
          </button>
        </div>
      </form>
    </div>
  );
}
