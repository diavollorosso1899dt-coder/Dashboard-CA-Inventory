'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  FileSpreadsheet,
  Printer,
  Trash2,
  FolderOpen,
  Award,
  CheckCircle2,
  AlertTriangle,
  Search,
  RefreshCw,
} from 'lucide-react';
import { getAllSessions, deleteSession, loadSession, SOSession } from '@/lib/so-harian/storageService';
import { exportSoReportToExcel, downloadBlob } from '@/lib/so-harian/excelService';

interface HistorySectionProps {
  onOpenSession: (sessionId: string) => void;
  onPrintSession: (session: SOSession, items: any[]) => void;
}

export default function HistorySection({ onOpenSession, onPrintSession }: HistorySectionProps) {
  const [sessions, setSessions] = useState<SOSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const data = await getAllSessions();
      setSessions(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDelete = async (id: string, tanggal: string) => {
    if (!window.confirm(`Yakin ingin menghapus riwayat SO tanggal ${tanggal}?`)) return;
    await deleteSession(id);
    fetchSessions();
  };

  const handleExportExcel = async (session: SOSession) => {
    const { items } = await loadSession(session.id);
    const blob = exportSoReportToExcel(session, items);
    downloadBlob(blob, `Laporan_SO_${session.tanggal || 'Harian'}_${session.gudang || 'Gudang'}.xlsx`);
  };

  const filteredSessions = sessions.filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (s.tanggal || '').toLowerCase().includes(term) ||
      (s.gudang || '').toLowerCase().includes(term) ||
      (s.petugas || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Header and Search */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Arsip Riwayat SO Harian</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Daftar sesi stock opname yang tersimpan di sistem</p>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari tanggal / petugas..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button
            onClick={fetchSessions}
            className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Session Cards */}
      {filteredSessions.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-12 text-center text-slate-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
          <p className="text-sm font-semibold">Belum ada riwayat sesi SO</p>
          <p className="text-xs mt-1">Sesi SO yang Anda simpan akan muncul di halaman ini.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredSessions.map((s) => (
            <div
              key={s.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-4 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="flex items-center space-x-3.5">
                <div className="p-3 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 rounded-xl">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-slate-800 dark:text-white text-sm">{s.tanggal}</h3>
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold px-2 py-0.5 rounded-full">
                      {s.gudang}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Petugas: {s.petugas}</p>
                </div>
              </div>

              {/* Stats Metrics */}
              <div className="flex items-center space-x-6 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Total SKU</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{s.total_items ?? 0}</span>
                </div>
                <div>
                  <span className="text-emerald-600 block text-[10px] uppercase font-bold">Match</span>
                  <span className="font-extrabold text-emerald-600">{s.item_match ?? 0}</span>
                </div>
                <div>
                  <span className="text-rose-600 block text-[10px] uppercase font-bold">Selisih</span>
                  <span className="font-extrabold text-rose-600">{s.item_selisih ?? 0}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Akurasi</span>
                  <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">
                    {s.akurasi_persen ?? 0}%
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-700">
                <button
                  onClick={() => onOpenSession(s.id)}
                  className="px-3 py-1.5 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 rounded-xl text-xs font-bold flex items-center space-x-1 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Buka</span>
                </button>
                <button
                  onClick={async () => {
                    const { items } = await loadSession(s.id);
                    onPrintSession(s, items);
                  }}
                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                  title="Cetak Berita Acara PDF"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleExportExcel(s)}
                  className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl transition-colors"
                  title="Export Excel .xlsx"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(s.id, s.tanggal)}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                  title="Hapus Sesi"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
