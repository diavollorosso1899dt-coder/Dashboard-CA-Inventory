'use client';

import React, { useState, useEffect } from 'react';
import {
  Boxes,
  UploadCloud,
  ClipboardCheck,
  History,
  Save,
  FileSpreadsheet,
  Printer,
  Cloud,
  CloudOff,
  Settings,
  Calendar,
  Building2,
  User,
  CheckCircle2,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import UploadSection from './UploadSection';
import PhysicalCountTable from './PhysicalCountTable';
import SummaryCards from './SummaryCards';
import HistorySection from './HistorySection';
import CloudSettingsModal from './CloudSettingsModal';
import ReportPrintView from './ReportPrintView';
import DocViewerModal from './DocViewerModal';
import {
  saveSession,
  loadSession,
  getAllSessions,
  getSupabaseConfig,
  SOSession,
} from '@/lib/so-harian/storageService';
import { exportSoReportToExcel, downloadBlob } from '@/lib/so-harian/excelService';
import { calculateSessionSummary, SOItem } from '@/lib/so-harian/inventoryEngine';
import { buildCarryForwardEntries, pickPreviousSession } from '@/lib/so-harian/rollover';

export function StockOpnameView() {
  const [activeTab, setActiveTab] = useState<'UPLOAD' | 'SO_TABLE' | 'HISTORY'>('UPLOAD');
  const [sessionData, setSessionData] = useState<Partial<SOSession>>({
    id: `so-${new Date().toISOString().split('T')[0]}`,
    tanggal: new Date().toISOString().split('T')[0],
    gudang: 'Gudang Utama',
    petugas: 'Petugas Gudang',
    status: 'DRAFT',
  });

  const [items, setItems] = useState<SOItem[]>([]);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isCloudConfigured, setIsCloudConfigured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [previousSessionStock, setPreviousSessionStock] = useState<Map<string, number>>(new Map());
  const [previousSessionItems, setPreviousSessionItems] = useState<SOItem[]>([]);
  const [previousSessionDate, setPreviousSessionDate] = useState<string | null>(null);
  const [previousSessionStatus, setPreviousSessionStatus] = useState<string | null>(null);
  // Sesi yang dibuka dari arsip; dipakai agar simpan tidak menimpa tanggal lain.
  const [loadedSessionMeta, setLoadedSessionMeta] = useState<{ id: string; tanggal: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    setIsCloudConfigured(getSupabaseConfig().isConfigured);
  }, []);

  // Stok awal hari ini = hasil SO hari sebelumnya (bukan master spreadsheet).
  // Sesi diambil dari cache lokal DAN cloud agar rollover tetap jalan di
  // perangkat/browser lain. Sesi di tanggal yang sama tidak dipakai.
  useEffect(() => {
    let active = true;

    async function loadPreviousSession() {
      try {
        const sessions = await getAllSessions();
        const previous = pickPreviousSession(sessions, sessionData.tanggal);
        if (!previous) {
          if (active) {
            setPreviousSessionStock(new Map());
            setPreviousSessionItems([]);
            setPreviousSessionDate(null);
            setPreviousSessionStatus(null);
          }
          return;
        }

        const { session, items: prevItems } = await loadSession(previous.id);
        if (!active) return;

        const entries = buildCarryForwardEntries(prevItems);
        setPreviousSessionStock(new Map(Array.from(entries, ([code, entry]) => [code, entry.qty])));
        setPreviousSessionItems(prevItems);
        setPreviousSessionDate(session?.tanggal || previous.tanggal || null);
        setPreviousSessionStatus(session?.status || previous.status || null);
      } catch (err) {
        console.warn('Gagal memuat hasil SO sebelumnya:', err);
      }
    }

    loadPreviousSession();
    return () => {
      active = false;
    };
  }, [sessionData.tanggal]);

  const handleCompilationSuccess = (compiledItems: SOItem[], metadata: any) => {
    setItems(compiledItems);
    setLoadedSessionMeta(null);
    setActiveTab('SO_TABLE');

    if (metadata?.openingSource === 'SO_SEBELUMNYA') {
      const prevDate = metadata.previousSessionDate || 'hari sebelumnya';
      const extra =
        metadata.openingFromMaster > 0
          ? ` + ${metadata.openingFromMaster} SKU baru dari master`
          : '';
      showToast(
        `Stok awal memakai hasil SO ${prevDate} (${metadata.openingFromPrevious} SKU)${extra}.`,
        'success'
      );
    } else {
      showToast(
        `Stok awal memakai master spreadsheet (${metadata?.openingFromMaster ?? compiledItems.length} SKU).`,
        'success'
      );
    }
  };

  const handleSaveSession = async () => {
    if (items.length === 0) {
      showToast('Belum ada data barang untuk disimpan.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const summary = calculateSessionSummary(items);
      // Satu tanggal = satu sesi. Jika user mengubah tanggal (mis. tab dibiarkan
      // terbuka melewati tengah malam), simpan ke id tanggal yang dipilih agar
      // hasil SO hari lain tidak tertimpa.
      const dateKey =
        String(sessionData.tanggal || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
      const sameAsLoaded =
        loadedSessionMeta && String(loadedSessionMeta.tanggal || '').slice(0, 10) === dateKey;
      const targetId = sameAsLoaded ? loadedSessionMeta.id : `so-${dateKey}`;

      const payload: Partial<SOSession> = {
        ...sessionData,
        id: targetId,
        tanggal: dateKey,
        akurasi_persen: summary.akurasiPersen,
        status: summary.itemUnchecked === 0 ? 'COMPLETED' : 'IN_PROGRESS',
      };

      const savedId = await saveSession(payload, items);
      setSessionData((prev) => ({ ...prev, id: savedId, tanggal: dateKey }));
      setLoadedSessionMeta({ id: savedId, tanggal: dateKey });
      showToast('Sesi SO harian berhasil disimpan ke sistem!', 'success');
    } catch (err: any) {
      showToast(`Gagal menyimpan: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportExcel = () => {
    if (items.length === 0) {
      showToast('Tidak ada data item untuk diekspor.', 'error');
      return;
    }
    const blob = exportSoReportToExcel(sessionData, items);
    downloadBlob(blob, `Rekap_SO_${sessionData.tanggal || 'Harian'}_${sessionData.gudang || 'Gudang'}.xlsx`);
    showToast('Laporan SO Excel berhasil diunduh.', 'success');
  };

  const handlePrint = () => {
    if (items.length === 0) {
      showToast('Tidak ada data item untuk dicetak.', 'error');
      return;
    }
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
  };

  const handleOpenFromHistory = async (sessionId: string) => {
    const { session, items: loadedItems } = await loadSession(sessionId);
    if (session) {
      setSessionData(session);
      setItems(loadedItems);
      setLoadedSessionMeta({ id: session.id, tanggal: session.tanggal });
      setActiveTab('SO_TABLE');
      showToast(`Memuat sesi SO tanggal ${session.tanggal}`, 'success');
    }
  };

  const handlePrintFromHistory = (session: SOSession, histItems: SOItem[]) => {
    setSessionData(session);
    setItems(histItems);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 250);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center space-x-2 text-xs font-bold transition-all animate-bounce ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Banner / Breadcrumb */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 dark:text-slate-500 mb-1">
            <span>Dashboard</span>
            <span>/</span>
            <span>Utama</span>
            <span>/</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Stock Opname Harian</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-xl text-white shadow-sm">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 dark:text-white flex items-center space-x-2">
                <span>Sistem SO Harian (Stock Opname)</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Dual Kategori
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rekonsiliasi mutasi harian RO, Penerimaan, dan fisik rak gudang
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Documentation Modal Button */}
          <button
            onClick={() => setIsDocModalOpen(true)}
            className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
          >
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Panduan &amp; Struktur (.md)</span>
          </button>

          {/* Cloud Sync Button */}
          <button
            onClick={() => setIsCloudModalOpen(true)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center space-x-1.5 transition-all ${
              isCloudConfigured
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {isCloudConfigured ? (
              <>
                <Cloud className="w-4 h-4 text-emerald-600" />
                <span>Cloud Sync ON</span>
              </>
            ) : (
              <>
                <CloudOff className="w-4 h-4 text-slate-400" />
                <span>Offline Cache</span>
              </>
            )}
            <Settings className="w-3.5 h-3.5 opacity-60" />
          </button>

          {/* Export Excel */}
          <button
            onClick={handleExportExcel}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>

          {/* Print PDF */}
          <button
            onClick={handlePrint}
            className="px-3 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Cetak PDF</span>
          </button>

          {/* Save Button */}
          <button
            onClick={handleSaveSession}
            disabled={isSaving}
            className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan SO'}</span>
          </button>
        </div>
      </div>

      {/* Session Metadata Inputs Bar */}
      <div className="bg-slate-100/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-2.5 flex flex-wrap gap-4 items-center text-xs">
        <div className="flex items-center space-x-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-semibold">Tanggal:</span>
          <input
            type="date"
            value={sessionData.tanggal}
            onChange={(e) => setSessionData((prev) => ({ ...prev, tanggal: e.target.value }))}
            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs font-bold focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center space-x-1.5">
          <Building2 className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-semibold">Gudang:</span>
          <input
            type="text"
            value={sessionData.gudang}
            onChange={(e) => setSessionData((prev) => ({ ...prev, gudang: e.target.value }))}
            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs font-semibold focus:ring-1 focus:ring-sky-500 w-36"
          />
        </div>

        <div className="flex items-center space-x-1.5">
          <User className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-semibold">Petugas:</span>
          <input
            type="text"
            value={sessionData.petugas}
            onChange={(e) => setSessionData((prev) => ({ ...prev, petugas: e.target.value }))}
            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs font-semibold focus:ring-1 focus:ring-sky-500 w-36"
          />
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="px-4 md:px-8 pt-4">
        <div className="flex space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('UPLOAD')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all ${
              activeTab === 'UPLOAD'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>1. Tarik Data &amp; Upload</span>
          </button>

          <button
            onClick={() => setActiveTab('SO_TABLE')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all ${
              activeTab === 'SO_TABLE'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>2. Form Hitung Fisik SO ({items.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all ${
              activeTab === 'HISTORY'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>3. Arsip Riwayat SO</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 px-4 md:px-8 py-6 space-y-6">
        {/* Summary KPI Cards shown when items exist */}
        {items.length > 0 && activeTab === 'SO_TABLE' && (
          <div className="max-w-6xl mx-auto">
            <SummaryCards items={items} />
          </div>
        )}

        {/* Tab 1: Upload */}
        {activeTab === 'UPLOAD' && (
          <UploadSection
            onCompilationSuccess={handleCompilationSuccess}
            previousSessionStock={previousSessionStock}
            previousSessionItems={previousSessionItems}
            previousSessionDate={previousSessionDate}
            previousSessionStatus={previousSessionStatus}
          />
        )}

        {/* Tab 2: Physical Count Table */}
        {activeTab === 'SO_TABLE' && (
          items.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 p-12 text-center text-slate-400 max-w-2xl mx-auto space-y-3">
              <UploadCloud className="w-12 h-12 mx-auto text-sky-400 opacity-80" />
              <h3 className="font-bold text-slate-800 dark:text-white text-base">Belum Ada Data Transaksi yang Dikompilasi</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Silakan upload file RO, Penerimaan, atau Stok Awal di tab <strong>1. Tarik Data &amp; Upload</strong> untuk memulai proses Stock Opname.
              </p>
              <button
                onClick={() => setActiveTab('UPLOAD')}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-colors inline-block"
              >
                Ke Tab Tarik Data
              </button>
            </div>
          ) : (
            <PhysicalCountTable items={items} onUpdateItems={setItems} />
          )
        )}

        {/* Tab 3: History */}
        {activeTab === 'HISTORY' && (
          <HistorySection
            onOpenSession={handleOpenFromHistory}
            onPrintSession={handlePrintFromHistory}
          />
        )}
      </main>

      {/* Print View for official report PDF */}
      <ReportPrintView session={sessionData} items={items} isPrinting={isPrinting} />

      {/* Modals */}
      <CloudSettingsModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        onConfigSaved={(configured) => setIsCloudConfigured(configured)}
      />

      <DocViewerModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
      />
    </div>
  );
}
