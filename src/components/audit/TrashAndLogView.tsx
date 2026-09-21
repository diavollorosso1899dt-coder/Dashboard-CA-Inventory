'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Trash2, 
  History, 
  RotateCcw, 
  AlertTriangle, 
  Search, 
  CheckCircle2, 
  ShieldAlert, 
  RefreshCw, 
  Download, 
  SlidersHorizontal,
  CheckSquare,
  Square,
  Clock,
  User,
  Package,
  Store,
  FileText,
  Eye,
  X,
  AlertCircle
} from 'lucide-react';
import { TrashItem, AuditLogEntry, TrashEntityType, AuditActionType } from '@/lib/supabase/types';
import { useAuth } from '@/components/auth/AuthContext';

interface TrashAndLogViewProps {
  initialTrash?: TrashItem[];
  initialLogs?: AuditLogEntry[];
}

export function TrashAndLogView({ 
  initialTrash = [], 
  initialLogs = [] 
}: TrashAndLogViewProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'trash' | 'logs'>('trash');

  // Trash State
  const [trashItems, setTrashItems] = useState<TrashItem[]>(initialTrash);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashSearch, setTrashSearch] = useState('');
  const [trashFilterType, setTrashFilterType] = useState<string>('ALL');
  const [selectedTrashIds, setSelectedTrashIds] = useState<string[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [previewPayloadItem, setPreviewPayloadItem] = useState<TrashItem | null>(null);

  // Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(initialLogs);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState<string>('ALL');
  const [revertingLog, setRevertingLog] = useState<AuditLogEntry | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  // Feedback banner
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  // Fetch trash items
  const loadTrash = async () => {
    setTrashLoading(true);
    try {
      const res = await fetch('/api/audit/trash');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTrashItems(json.data);
      }
    } catch {
      // Ignored
    } finally {
      setTrashLoading(false);
    }
  };

  // Fetch audit logs
  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/audit/logs');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAuditLogs(json.data);
      }
    } catch {
      // Ignored
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
    loadLogs();
  }, []);

  // Filtered Trash Items
  const filteredTrash = useMemo(() => {
    return trashItems.filter((item) => {
      const matchType = trashFilterType === 'ALL' || item.entity_type === trashFilterType;
      const s = trashSearch.toLowerCase();
      const matchSearch =
        !s ||
        item.title.toLowerCase().includes(s) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(s)) ||
        item.deleted_by.toLowerCase().includes(s);
      return matchType && matchSearch;
    });
  }, [trashItems, trashFilterType, trashSearch]);

  // Filtered Audit Logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchAction = logActionFilter === 'ALL' || log.action_type === logActionFilter;
      const s = logSearch.toLowerCase();
      const matchSearch =
        !s ||
        log.entity_title.toLowerCase().includes(s) ||
        log.details.toLowerCase().includes(s) ||
        log.actor_name.toLowerCase().includes(s);
      return matchAction && matchSearch;
    });
  }, [auditLogs, logActionFilter, logSearch]);

  // -------------------------------------------------------------------
  // TRASH ACTIONS
  // -------------------------------------------------------------------
  const handleRestore = async (item: TrashItem) => {
    if (!confirm(`Pulihkan "${item.title}" kembali ke sistem aktif?`)) return;
    setActionLoadingId(item.id);
    try {
      const res = await fetch('/api/audit/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          action: 'restore',
          actorName: user?.full_name || 'Super User',
          actorRole: user?.role || 'Super User',
        }),
      });
      const json = await res.json();
      if (json.success) {
        showFeedback(`"${item.title}" berhasil dipulihkan ke daftar aktif.`);
        setTrashItems((prev) => prev.filter((t) => t.id !== item.id));
        setSelectedTrashIds((prev) => prev.filter((id) => id !== item.id));
        loadLogs();
        router.refresh();
      } else {
        showFeedback(json.error || 'Gagal memulihkan item', 'error');
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePermanentDelete = async (item: TrashItem) => {
    if (!confirm(`PERINGATAN: Tindakan ini permanen!\n\nApakah Anda yakin ingin MENGHAPUS SELAMANYA data "${item.title}"? Data ini TIDAK DAPAT dipulihkan lagi.`)) {
      return;
    }
    setActionLoadingId(item.id);
    try {
      const res = await fetch(`/api/audit/trash?id=${item.id}&actorName=${encodeURIComponent(user?.full_name || 'Super User')}&actorRole=${encodeURIComponent(user?.role || 'Super User')}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        showFeedback(`"${item.title}" telah dihapus secara permanen.`, 'success');
        setTrashItems((prev) => prev.filter((t) => t.id !== item.id));
        setSelectedTrashIds((prev) => prev.filter((id) => id !== item.id));
        loadLogs();
      } else {
        showFeedback(json.error || 'Gagal menghapus permanen', 'error');
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEmptyTrash = async () => {
    if (trashItems.length === 0) return;
    if (!confirm(`PERINGATAN BAHAYA!\n\nAnda akan MENGOSONGKAN SELURUH TEMPAT SAMPAH (${trashItems.length} item).\nSemua data di sampah akan dimusnahkan secara permanen dan tidak bisa dikembalikan.\n\nLanjutkan?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/audit/trash?emptyAll=true&actorName=${encodeURIComponent(user?.full_name || 'Super User')}&actorRole=${encodeURIComponent(user?.role || 'Super User')}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        showFeedback(`Tempat Sampah berhasil dikosongkan (${json.count} item dimusnahkan).`);
        setTrashItems([]);
        setSelectedTrashIds([]);
        loadLogs();
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    }
  };

  const handleBulkRestore = async () => {
    if (selectedTrashIds.length === 0) return;
    if (!confirm(`Pulihkan ${selectedTrashIds.length} item terpilih kembali ke sistem aktif?`)) return;

    for (const id of selectedTrashIds) {
      const item = trashItems.find((t) => t.id === id);
      if (item) {
        await fetch('/api/audit/trash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            action: 'restore',
            actorName: user?.full_name || 'Super User',
            actorRole: user?.role || 'Super User',
          }),
        });
      }
    }

    showFeedback(`${selectedTrashIds.length} item berhasil dipulihkan.`);
    setTrashItems((prev) => prev.filter((t) => !selectedTrashIds.includes(t.id)));
    setSelectedTrashIds([]);
    loadLogs();
    router.refresh();
  };

  // Export logs to CSV
  const handleExportLogsCsv = () => {
    const headers = ['Waktu', 'Aktor', 'Peran', 'Aksi', 'Modul', 'Judul Entitas', 'Rincian'];
    const rows = filteredLogs.map((l) => [
      `"${new Date(l.timestamp).toLocaleString('id-ID')}"`,
      `"${l.actor_name}"`,
      `"${l.actor_role}"`,
      `"${l.action_type}"`,
      `"${l.entity_type}"`,
      `"${l.entity_title.replace(/"/g, '""')}"`,
      `"${l.details.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `Audit_Log_HANTARAN_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadge = (action: AuditActionType) => {
    switch (action) {
      case 'CREATE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200">TAMBAH</span>;
      case 'STATUS_CHANGE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200">UBAH STATUS</span>;
      case 'UPDATE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-200">EDIT DATA</span>;
      case 'DELETE_TO_TRASH':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200">KE SAMPAH</span>;
      case 'RESTORE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-400 border border-teal-200">DIPULIHKAN</span>;
      case 'REVERT':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200">DIKEMBALIKAN (REVERT)</span>;
      case 'PERMANENT_DELETE':
      case 'EMPTY_TRASH':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200">HAPUS PERMANEN</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{action}</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {feedbackMessage && (
        <div 
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border animate-in slide-in-from-bottom-3 text-xs font-semibold ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Main Header Banner */}
      <div className="rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 shadow-xs shrink-0">
            <Trash2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
                Manajemen Sampah &amp; Audit Log
              </h1>
              <span className="rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold px-2.5 py-0.5 border border-rose-200 dark:border-rose-800">
                Otorisasi Khusus
              </span>
            </div>
            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-1">
              Pusat pemulihan data terhapus (*recycle bin*), penghapusan permanen, dan jejak digital aktivitas sistem HANTARAN.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1.5 bg-[#f0f4f9] dark:bg-[#282a2c] rounded-2xl shrink-0">
          <button
            onClick={() => setActiveTab('trash')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'trash'
                ? 'bg-white dark:bg-[#1e1f20] text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f]'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Tempat Sampah</span>
            <span className="ml-1 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 text-[10px] font-bold px-2 py-0.2">
              {trashItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'logs'
                ? 'bg-white dark:bg-[#1e1f20] text-[#0b57d0] dark:text-[#a8c7fa] shadow-sm'
                : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Log Perubahan</span>
            <span className="ml-1 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-2 py-0.2">
              {auditLogs.length}
            </span>
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* TAB 1: TEMPAT SAMPAH (RECYCLE BIN) */}
      {/* ================================================================= */}
      {activeTab === 'trash' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#747775] dark:text-[#8e918f] font-semibold">Total Item di Sampah</span>
                <Trash2 className="w-4 h-4 text-rose-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                {trashItems.length} <span className="text-xs font-normal text-slate-500">item</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Dapat dipulihkan kapan saja ke tabel utama</p>
            </div>

            <div className="p-4 rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#747775] dark:text-[#8e918f] font-semibold">Tipe Entitas Terbanyak</span>
                <Package className="w-4 h-4 text-[#0b57d0]" />
              </div>
              <div className="mt-2 text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                Aset Permohonan
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Meliputi item pengadaan &amp; barang outlet</p>
            </div>

            <div className="p-4 rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#747775] dark:text-[#8e918f] font-semibold">Keamanan Data</span>
                <ShieldAlert className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-lg font-bold text-emerald-600 dark:text-emerald-400">
                Perlindungan Soft-Delete
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Mencegah data hilang tidak sengaja</p>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-4 rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] shadow-xs">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari item di sampah atau pengubah..."
                value={trashSearch}
                onChange={(e) => setTrashSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none focus:border-[#0b57d0]"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end flex-wrap">
              {/* Type Filter */}
              <select
                value={trashFilterType}
                onChange={(e) => setTrashFilterType(e.target.value)}
                className="rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-3 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none"
              >
                <option value="ALL">Semua Modul</option>
                <option value="ASET">Modul Aset</option>
                <option value="OUTLET">Modul Outlet</option>
                <option value="ITEM">Katalog Item</option>
                <option value="DISPOSISI">Disposisi</option>
              </select>

              <button
                onClick={loadTrash}
                disabled={trashLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#e0e2ec] dark:border-[#444746] hover:bg-[#f0f4f9] text-xs font-semibold"
                title="Muat Ulang"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${trashLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              {/* Danger Action: Empty Trash */}
              <button
                onClick={handleEmptyTrash}
                disabled={trashItems.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950 border border-rose-200 dark:border-rose-900 text-xs font-bold disabled:opacity-40 transition-colors"
                title="Hapus seluruh item di tempat sampah secara permanen"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Kosongkan Sampah</span>
              </button>
            </div>
          </div>

          {/* Multi-selection Bulk Bar */}
          {selectedTrashIds.length > 0 && (
            <div className="flex items-center justify-between p-3.5 px-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">
                  {selectedTrashIds.length}
                </span>
                <span>Item dipilih dari Tempat Sampah</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkRestore}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Pulihkan ({selectedTrashIds.length}) Item</span>
                </button>
                <button
                  onClick={() => setSelectedTrashIds([])}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {/* Trash Table */}
          <div className="rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f0f4f9] dark:bg-[#282a2c] text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] border-b border-[#e0e2ec] dark:border-[#444746]">
                  <tr>
                    <th className="py-3.5 px-3 w-8 text-center">
                      <button
                        onClick={() => {
                          if (selectedTrashIds.length === filteredTrash.length) {
                            setSelectedTrashIds([]);
                          } else {
                            setSelectedTrashIds(filteredTrash.map((t) => t.id));
                          }
                        }}
                      >
                        {selectedTrashIds.length === filteredTrash.length && filteredTrash.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-[#0b57d0]" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="py-3.5 px-4">Nama Item &amp; Keterangan</th>
                    <th className="py-3.5 px-3">Modul</th>
                    <th className="py-3.5 px-3">Dihapus Oleh</th>
                    <th className="py-3.5 px-3">Waktu Penghapusan</th>
                    <th className="py-3.5 px-4 text-right">Opsi Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
                  {filteredTrash.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-slate-400">
                        <Trash2 className="w-10 h-10 mx-auto opacity-30 mb-2 text-rose-500" />
                        <div className="font-semibold text-sm text-slate-600 dark:text-slate-300">
                          Tempat Sampah Bersih
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Tidak ada data yang dihapus saat ini.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredTrash.map((item) => {
                      const isSelected = selectedTrashIds.includes(item.id);
                      const isActing = actionLoadingId === item.id;

                      return (
                        <tr 
                          key={item.id}
                          className={`hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c] transition-colors ${
                            isSelected ? 'bg-[#e8f0fe] dark:bg-[#004a77]/30' : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedTrashIds(selectedTrashIds.filter((id) => id !== item.id));
                                } else {
                                  setSelectedTrashIds([...selectedTrashIds, item.id]);
                                }
                              }}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#0b57d0]" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-sm">
                              {item.title}
                            </div>
                            {item.subtitle && (
                              <div className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-0.5">
                                {item.subtitle}
                              </div>
                            )}
                            {item.notes && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 italic mt-0.5">
                                Catatan: &quot;{item.notes}&quot;
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              {item.entity_type}
                            </span>
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.deleted_by}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {item.deleted_by_role || 'Staff'}
                            </div>
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="text-slate-800 dark:text-slate-200">
                              {new Date(item.deleted_at).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {new Date(item.deleted_at).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })} WIB
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Preview Payload */}
                              <button
                                type="button"
                                onClick={() => setPreviewPayloadItem(item)}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Lihat Data Lengkap"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Restore Button */}
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleRestore(item)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                title="Kembalikan ke sistem aktif"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Pulihkan</span>
                              </button>

                              {/* Permanent Delete Button */}
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handlePermanentDelete(item)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold hover:bg-rose-100 transition-colors disabled:opacity-50"
                                title="Hapus permanen tanpa bisa dikembalikan"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Musnahkan</span>
                              </button>
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
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: AUDIT LOG PERUBAHAN */}
      {/* ================================================================= */}
      {activeTab === 'logs' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-4 rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] shadow-xs">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari log: nama entitas, rincian, aktor..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none focus:border-[#0b57d0]"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end flex-wrap">
              {/* Action Filter */}
              <select
                value={logActionFilter}
                onChange={(e) => setLogActionFilter(e.target.value)}
                className="rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-3 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none"
              >
                <option value="ALL">Semua Tipe Aksi</option>
                <option value="CREATE">Pembuatan Baru (CREATE)</option>
                <option value="UPDATE">Pembaruan Data (UPDATE)</option>
                <option value="STATUS_CHANGE">Ubah Status</option>
                <option value="REVERT">Pengembalian Nilai (REVERT)</option>
                <option value="DELETE_TO_TRASH">Hapus ke Sampah</option>
                <option value="RESTORE">Pemulihan (RESTORE)</option>
                <option value="PERMANENT_DELETE">Hapus Permanen</option>
              </select>

              <button
                onClick={loadLogs}
                disabled={logsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#e0e2ec] dark:border-[#444746] hover:bg-[#f0f4f9] text-xs font-semibold"
                title="Segarkan Log"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={handleExportLogsCsv}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] text-xs font-bold shadow-xs hover:bg-[#0842a0] transition-colors"
                title="Ekspor Seluruh Log Perubahan ke CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh CSV Log</span>
              </button>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f0f4f9] dark:bg-[#282a2c] text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] border-b border-[#e0e2ec] dark:border-[#444746]">
                  <tr>
                    <th className="py-3.5 px-4">Waktu Kejadian</th>
                    <th className="py-3.5 px-4">Aktor Pengubah</th>
                    <th className="py-3.5 px-3">Tipe Aksi</th>
                    <th className="py-3.5 px-3">Modul / Entitas</th>
                    <th className="py-3.5 px-4">Rincian Perubahan</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-slate-400">
                        <History className="w-10 h-10 mx-auto opacity-30 mb-2 text-[#0b57d0]" />
                        <div className="font-semibold text-sm text-slate-600 dark:text-slate-300">
                          Tidak Ada Catatan Log
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Belum ada aktivitas yang sesuai dengan filter pencarian.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c] transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                            {new Date(log.timestamp).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {new Date(log.timestamp).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })} WIB
                          </div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                            {log.actor_name}
                          </div>
                          <span className="inline-block mt-0.5 px-2 py-0.2 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {log.actor_role}
                          </span>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          {getActionBadge(log.action_type)}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {log.entity_title}
                          </span>
                          <div className="text-[10px] text-slate-400">
                            [{log.entity_type}]
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                            {log.details}
                          </p>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {log.previous_state && Object.keys(log.previous_state).length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setRevertingLog(log)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 text-xs font-bold transition-colors shadow-xs"
                              title="Kembalikan perubahan ini ke kondisi sebelumnya"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Kembalikan</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Payload Inspection Modal */}
      {previewPayloadItem && (
        <div 
          onClick={() => setPreviewPayloadItem(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="w-full max-w-2xl bg-white dark:bg-[#1e1f20] rounded-3xl border border-[#e0e2ec] dark:border-[#444746] overflow-hidden shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                  Rincian Data: {previewPayloadItem.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Dihapus oleh {previewPayloadItem.deleted_by} pada {new Date(previewPayloadItem.deleted_at).toLocaleString('id-ID')}
                </p>
              </div>
              <button
                onClick={() => setPreviewPayloadItem(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-2xl bg-slate-50 dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-800 dark:text-slate-200 leading-relaxed">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(previewPayloadItem.original_data, null, 2)}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPreviewPayloadItem(null)}
                className="px-4 py-2 rounded-xl border text-xs font-semibold"
              >
                Tutup
              </button>
              <button
                onClick={() => {
                  const it = previewPayloadItem;
                  setPreviewPayloadItem(null);
                  handleRestore(it);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
              >
                Pulihkan Item Ini
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert Audit Log Confirmation Modal */}
      {revertingLog && (
        <div 
          onClick={() => !isReverting && setRevertingLog(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="w-full max-w-xl bg-white dark:bg-[#1e1f20] rounded-3xl border border-[#e0e2ec] dark:border-[#444746] overflow-hidden shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Kembalikan Perubahan (Revert / Undo)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pulihkan data ke nilai sebelum diubah untuk memperbaiki kesalahan input
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRevertingLog(null)}
                disabled={isReverting}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Entitas info */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div>Entitas: <strong className="text-[#0b57d0] dark:text-[#a8c7fa]">{revertingLog.entity_title}</strong> <span className="text-[11px] text-slate-500">({revertingLog.entity_type})</span></div>
              <div>Diubah oleh: <strong>{revertingLog.actor_name}</strong> ({revertingLog.actor_role}) pada {new Date(revertingLog.timestamp).toLocaleString('id-ID')} WIB</div>
              <div>Keterangan perubahan: <span className="italic text-slate-600 dark:text-slate-400">{revertingLog.details}</span></div>
            </div>

            {/* Perbandingan Nilai Sebelum vs Sesudah */}
            <div>
              <div className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-2">
                Perbandingan Nilai (Sebelum vs Sesudah):
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                <div className="grid grid-cols-3 bg-slate-100 dark:bg-slate-800/80 p-2.5 font-bold text-[11px] text-slate-600 dark:text-slate-300 uppercase">
                  <div>Parameter / Field</div>
                  <div className="text-emerald-700 dark:text-emerald-400">Nilai Sebelumnya (Dipulihkan)</div>
                  <div className="text-rose-600 dark:text-rose-400">Nilai Saat Ini (Dibatalkan)</div>
                </div>
                {Object.entries(revertingLog.previous_state || {}).map(([key, oldVal]) => {
                  const newVal = (revertingLog.new_state || {})[key];
                  return (
                    <div key={key} className="grid grid-cols-3 p-2.5 items-center">
                      <div className="font-mono text-slate-600 dark:text-slate-400">{key}</div>
                      <div className="font-bold text-emerald-700 dark:text-emerald-300">
                        {typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal ?? '-')}
                      </div>
                      <div className="text-slate-400 line-through">
                        {typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal ?? '-')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={isReverting}
                onClick={() => setRevertingLog(null)}
                className="px-4 py-2 rounded-xl border text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isReverting}
                onClick={async () => {
                  if (!revertingLog) return;
                  try {
                    setIsReverting(true);
                    const res = await fetch('/api/audit/logs/revert', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        logId: revertingLog.id,
                        actorName: user?.full_name || 'Super User',
                        actorRole: user?.role || 'Super User',
                      }),
                    });
                    const json = await res.json();
                    if (json.success) {
                      showFeedback(json.message || `Perubahan pada "${revertingLog.entity_title}" berhasil dikembalikan.`);
                      setRevertingLog(null);
                      loadLogs();
                      router.refresh();
                    } else {
                      showFeedback(json.error || 'Gagal mengembalikan perubahan data.', 'error');
                    }
                  } catch (err: any) {
                    showFeedback(`Terjadi kesalahan: ${err.message}`, 'error');
                  } finally {
                    setIsReverting(false);
                  }
                }}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors disabled:opacity-50 shadow-sm"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isReverting ? 'animate-spin' : ''}`} />
                <span>{isReverting ? 'Mengembalikan...' : 'Ya, Kembalikan ke Sebelumnya'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
