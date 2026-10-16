'use client';

import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Database,
  Code2,
  FileSpreadsheet,
  Workflow,
  Layers,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';

interface DocViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DocViewerModal({ isOpen, onClose }: DocViewerModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'FLOW' | 'SCHEMA' | 'FORMULA' | 'INTEGRATION'>('FLOW');

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const schemaSQL = `-- 1. Header Sesi SO Harian
CREATE TABLE IF NOT EXISTS public.so_sessions (
    id TEXT PRIMARY KEY,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    gudang VARCHAR(100) DEFAULT 'Gudang Utama',
    petugas VARCHAR(100) DEFAULT 'Petugas Gudang',
    total_items INTEGER DEFAULT 0,
    item_match INTEGER DEFAULT 0,
    item_selisih INTEGER DEFAULT 0,
    akurasi_persen NUMERIC(5,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Detail Item Barang SO Harian
CREATE TABLE IF NOT EXISTS public.so_details (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES public.so_sessions(id) ON DELETE CASCADE,
    kode_barang VARCHAR(100) NOT NULL,
    nama_barang VARCHAR(255),
    kategori VARCHAR(100) DEFAULT 'Peralatan', -- 'Peralatan' | 'Perlengkapan Tetap'
    satuan VARCHAR(50) DEFAULT 'PCS',
    stok_awal NUMERIC(12,2) DEFAULT 0,
    qty_penerimaan NUMERIC(12,2) DEFAULT 0,
    qty_ro NUMERIC(12,2) DEFAULT 0,
    stok_sistem NUMERIC(12,2) DEFAULT 0,
    qty_fisik NUMERIC(12,2),
    selisih NUMERIC(12,2),
    status_selisih VARCHAR(50) DEFAULT 'UNCHECKED', -- 'MATCH' | 'MINUS' | 'PLUS' | 'UNCHECKED'
    catatan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_so_sessions_tanggal ON public.so_sessions(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_so_details_session_id ON public.so_details(session_id);
CREATE INDEX IF NOT EXISTS idx_so_details_kode_barang ON public.so_details(kode_barang);`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 dark:bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">Panduan Struktur &amp; Integrasi Sistem SO Harian</h3>
              <p className="text-xs text-slate-400">Dokumentasi Teknis, Arsitektur Database &amp; Logika Bisnis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-6 pt-2 text-xs font-bold space-x-2">
          <button
            onClick={() => setActiveTab('FLOW')}
            className={`pb-3 px-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'FLOW'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Workflow className="w-4 h-4" />
            <span>1. Alur &amp; Flowchart</span>
          </button>

          <button
            onClick={() => setActiveTab('SCHEMA')}
            className={`pb-3 px-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'SCHEMA'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>2. Skema Database</span>
          </button>

          <button
            onClick={() => setActiveTab('FORMULA')}
            className={`pb-3 px-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'FORMULA'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>3. Formula Kalkulasi</span>
          </button>

          <button
            onClick={() => setActiveTab('INTEGRATION')}
            className={`pb-3 px-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'INTEGRATION'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>4. Panduan Integrasi</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-slate-700 dark:text-slate-300 text-xs">
          {activeTab === 'FLOW' && (
            <div className="space-y-4">
              <div className="p-4 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-xl">
                <h4 className="font-bold text-sky-900 dark:text-sky-300 text-sm mb-1">Alur Proses SO Harian Terotomatisasi</h4>
                <p className="text-sky-800 dark:text-sky-400 leading-relaxed">
                  Sistem mengotomatiskan rekonsiliasi data mutasi barang gudang dengan alur:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 block text-xs">Langkah 1: Tarik Data Transaksi</span>
                  <p className="text-slate-600 dark:text-slate-400">
                    - Upload Data RO Harian (Pengeluaran Barang)<br />
                    - Upload Data Penerimaan Harian (Barang Masuk)<br />
                    - Stok Awal Kategori (Peralatan &amp; Perlengkapan Tetap)
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 block text-xs">Langkah 2: Kompilasi &amp; Cek Fisik</span>
                  <p className="text-slate-600 dark:text-slate-400">
                    - Stok Sistem = Awal + Masuk - RO<br />
                    - Input Qty Fisik (Barcode Scanner Kamera HP/PC)<br />
                    - Kalkulasi Selisih: MATCH / MINUS / PLUS
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 block text-xs">Langkah 3: Laporan &amp; Berita Acara</span>
                  <p className="text-slate-600 dark:text-slate-400">
                    - Rekapitulasi Excel 2 Sheet (Summary &amp; Rincian)<br />
                    - Dokumen Berita Acara Resmi PDF Siap Tanda Tangan
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 block text-xs">Langkah 4: Auto Rollover &amp; Sync</span>
                  <p className="text-slate-600 dark:text-slate-400">
                    - Hasil SO otomatis menjadi Stok Awal hari berikutnya<br />
                    - Dukungan Sinkronisasi Multi-Device Cloud (Supabase)
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'SCHEMA' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-white">Skrip SQL PostgreSQL / Supabase</h4>
                  <p className="text-slate-500">Jalankan di Supabase SQL Editor jika ingin sinkronisasi multi-device</p>
                </div>
                <button
                  onClick={() => copyToClipboard(schemaSQL, 'sql')}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold rounded-lg flex items-center space-x-1"
                >
                  {copiedKey === 'sql' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'sql' ? 'Tersalin!' : 'Salin SQL'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] overflow-x-auto leading-relaxed max-h-96">
                {schemaSQL}
              </pre>
            </div>
          )}

          {activeTab === 'FORMULA' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-bold text-slate-800 dark:text-white text-sm">1. Formula Stok Sistem</h4>
                <p className="font-mono bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 font-bold">
                  Stok Sistem = Stok Awal + Penerimaan Harian - RO Harian
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-bold text-slate-800 dark:text-white text-sm">2. Formula Selisih &amp; Klasifikasi Status</h4>
                <p className="font-mono bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  Selisih = Qty Fisik SO - Stok Sistem<br />
                  - Selisih == 0 : <strong>MATCH</strong><br />
                  - Selisih &lt; 0 : <strong>MINUS (Kurang Fisik)</strong><br />
                  - Selisih &gt; 0 : <strong>PLUS (Lebih Fisik)</strong>
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-bold text-slate-800 dark:text-white text-sm">3. Formula Akurasi Stok (%)</h4>
                <p className="font-mono bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 font-bold">
                  Akurasi (%) = (Total Item MATCH / Total Item Terhitung) &times; 100%
                </p>
              </div>
            </div>
          )}

          {activeTab === 'INTEGRATION' && (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                <h4 className="font-bold text-indigo-900 dark:text-indigo-300 text-sm mb-1">Status Integrasi di Dashboard CA</h4>
                <p className="text-indigo-800 dark:text-indigo-300/80 leading-relaxed">
                  Modul ini telah terintegrasi penuh ke dalam sistem Dashboard CA di rute:
                  <code className="mx-1 px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded font-bold font-mono">/stock-opname</code>
                  dan dapat diakses langsung dari menu navigasi <strong>Utama &gt; Stock Opname Harian</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <h5 className="font-bold text-slate-800 dark:text-white">Daftar Modul &amp; File Terpasang:</h5>
                <ul className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  <li>- <strong>src/lib/so-harian/inventoryEngine.ts</strong>: Engine kalkulasi akurasi &amp; selisih</li>
                  <li>- <strong>src/lib/so-harian/excelService.ts</strong>: Parser Excel SheetJS &amp; export</li>
                  <li>- <strong>src/lib/so-harian/storageService.ts</strong>: Hybrid LocalStorage + Supabase</li>
                  <li>- <strong>src/components/so-harian/*</strong>: Komponen UI modul SO Harian</li>
                  <li>- <strong>src/app/stock-opname/page.tsx</strong>: Halaman utama modul SO</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs">
          <span className="text-slate-400">File sumber: DOKUMENTASI_STRUKTUR_DAN_INTEGRASI.md</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white font-bold rounded-lg transition-all"
          >
            Tutup Dokumentasi
          </button>
        </div>
      </div>
    </div>
  );
}
