'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Zap,
  ShieldOff,
  Undo2,
} from 'lucide-react';
import { SyncSourceCard, type SyncSourceView } from '@/components/sync/SyncSourceCard';
import {
  SyncHistoryTable,
  SYNC_HISTORY_COLUMNS,
  type SyncRunView,
} from '@/components/sync/SyncHistoryTable';
import ColumnVisibilityPicker, {
  type ColumnItem,
  useColumnVisibility,
} from '@/components/ui/ColumnVisibilityPicker';

export const dynamic = 'force-dynamic';

const SYNC_TOMBSTONE_COLUMNS: ColumnItem[] = [
  { id: 'ro_number', label: 'Nomor RO', defaultVisible: true, alwaysVisible: true },
  { id: 'deleted_by', label: 'Dihapus oleh', defaultVisible: true },
  { id: 'time', label: 'Waktu', defaultVisible: true },
  { id: 'reason', label: 'Alasan', defaultVisible: true },
  { id: 'actions', label: 'Aksi', defaultVisible: true, alwaysVisible: true },
];

interface TombstoneView {
  id: string;
  row_key: string;
  display_key: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

const DEFAULT_SOURCES: SyncSourceView[] = [
  { key: 'asset-requests', label: 'Aset (JABO + KALBAR)' },
  { key: 'request-orders', label: 'Request Order (JABO + KALBAR)' },
  { key: 'master-catalog', label: 'Master Katalog Item' },
];

export default function SyncPage() {
  const [sources, setSources] = useState<SyncSourceView[]>(DEFAULT_SOURCES);
  const [runs, setRuns] = useState<SyncRunView[]>([]);
  const [running, setRunning] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [tombstones, setTombstones] = useState<TombstoneView[]>([]);
  const [releasingTombstone, setReleasingTombstone] = useState<string | null>(null);

  const {
    visibleColumns: visibleHistoryColumns,
    setVisibleColumns: setVisibleHistoryColumns,
  } = useColumnVisibility('ca_sync_history_columns', SYNC_HISTORY_COLUMNS);

  const {
    visibleColumns: visibleTombstoneColumns,
    setVisibleColumns: setVisibleTombstoneColumns,
    isVisible: isTombstoneColumnVisible,
  } = useColumnVisibility('ca_sync_tombstone_columns', SYNC_TOMBSTONE_COLUMNS);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, historyRes, tombstoneRes] = await Promise.all([
        fetch('/api/sync/status', { cache: 'no-store' }),
        fetch('/api/sync/history?limit=20', { cache: 'no-store' }),
        fetch('/api/sync/tombstones', { cache: 'no-store' }),
      ]);
      const status = await statusRes.json();
      const history = await historyRes.json();
      const tombstoneData = await tombstoneRes.json().catch(() => ({}));

      const latest = new Map<string, any>();
      for (const row of status.sources || []) {
        if (!latest.has(row.source_key)) latest.set(row.source_key, row);
      }
      setSources((prev) =>
        prev.map((s) => {
          const row = latest.get(s.key);
          return row
            ? {
                ...s,
                status: row.status,
                rowsFetched: row.rows_fetched,
                rowsInserted: row.rows_inserted,
                rowsUpdated: row.rows_updated,
                rowsStale: row.rows_stale,
                durationMs: row.duration_ms,
                message: row.error_message || undefined,
              }
            : s;
        })
      );
      setRuns(history.runs || []);
      setTombstones(Array.isArray(tombstoneData.tombstones) ? tombstoneData.tombstones : []);
      setRunning(Boolean(status.running));
    } catch (error) {
      console.error('Gagal memuat status sync:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyResultSources = (data: any) => {
    if (!Array.isArray(data?.sources) || data.sources.length === 0) return;
    setSources((prev) =>
      prev.map((s) => {
        const row = data.sources.find((item: any) => item.key === s.key);
        return row
          ? {
              ...s,
              status: row.status,
              rowsFetched: row.rowsFetched,
              rowsInserted: row.rowsInserted,
              rowsUpdated: row.rowsUpdated,
              rowsStale: row.rowsStale,
              durationMs: row.durationMs,
              message: row.message || undefined,
            }
          : s;
      })
    );
  };

  const run = async (keys?: string[]) => {
    try {
      setRunning(true);
      setResult(null);
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: keys, dryRun, trigger: 'MANUAL' }),
      });
      const data = await res.json();
      setResult(data);
      applyResultSources(data);
      if (!dryRun) await refresh();
    } catch (error: any) {
      setResult({ success: false, message: error?.message || 'Gagal sync' });
    } finally {
      setRunning(false);
    }
  };

  const handleTriggerSync = () => run();

  const releaseTombstone = async (id: string) => {
    try {
      setReleasingTombstone(id);
      const res = await fetch(`/api/sync/tombstones/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        setResult({ success: false, message: data.message || 'Gagal melepas blokir' });
      }
      await refresh();
    } catch (error: any) {
      setResult({ success: false, message: error?.message || 'Gagal melepas blokir' });
    } finally {
      setReleasingTombstone(null);
    }
  };

  const webhookScriptCode = `// ==== KONFIGURASI: ISI DUA BARIS INI ====
// Domain dashboard Anda, tanpa garis miring di akhir.
var WEBHOOK_URL = "https://your-dashboard-domain.com/api/sync";
// Samakan dengan env SYNC_TOKEN di server.
var SYNC_TOKEN = "ISI_TOKEN_RAHASIA";

/**
 * Kirim sinyal sync ke dashboard.
 * Dipanggil oleh trigger On edit, On change, dan timer 5 menit.
 * Server men-debounce webhook, jadi aman dipanggil berkali-kali.
 */
function syncKeHantaran(e) {
  var options = {
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      "x-sync-token": SYNC_TOKEN
    },
    "payload": JSON.stringify({
      "trigger": "WEBHOOK",
      "sources": ["asset-requests", "request-orders"]
    }),
    "muteHttpExceptions": true
  };

  try {
    var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    Logger.log("Sync HTTP " + response.getResponseCode() + ": " + response.getContentText());
  } catch (err) {
    Logger.log("Sync error: " + err);
  }
}

/**
 * Jalankan SEKALI dari editor Apps Script setelah konfigurasi diisi.
 * Memasang tiga trigger:
 *   1. On edit    - setiap sel diedit
 *   2. On change  - baris ditambah/dihapus atau perubahan struktur
 *   3. Timer 5 menit - jaring pengaman bila trigger edit terlewat
 */
function pasangTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Hindari trigger ganda bila fungsi ini dijalankan ulang.
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "syncKeHantaran") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("syncKeHantaran").forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger("syncKeHantaran").forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger("syncKeHantaran").timeBased().everyMinutes(5).create();

  Logger.log("Trigger syncKeHantaran terpasang: On edit, On change, timer 5 menit.");
}`;

  return (
    <div className="space-y-6 pb-12">
      {/* Google M3 Header */}
      <div className="border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
            Sinkronisasi dan Basis Data
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
          Engine terpusat: Google Sheets → Supabase → HANTARAN. Satu arah, tanpa tulis balik ke sheet.
        </p>
      </div>

      {/* Sync Engine Card */}
      <div className="panel-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
              Sinkronisasi Google Sheets ke Supabase
            </h2>
            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-1 max-w-2xl">
              Membaca sheet aset, RO, dan master item. Data yang sudah diubah di dashboard tidak
              ditimpa; baris yang hilang dari sheet hanya ditandai stale, tidak dihapus.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#444746] dark:text-[#c4c7c5]">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Dry-run (tidak menulis)
            </label>
            <button
              onClick={handleTriggerSync}
              disabled={running}
              className="flex items-center justify-center gap-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-5 py-2 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
              {running ? 'Sedang Sinkronisasi...' : 'Run Semua Sumber'}
            </button>
          </div>
        </div>

        {/* Sync Result Banner */}
        {result && (
          <div
            className={`rounded-2xl p-3.5 text-xs border ${
              result.success
                ? 'bg-[#e6f4ea] dark:bg-[#0f5223]/50 border-[#ceead6] dark:border-[#0f5223] text-[#137333] dark:text-[#6dd58c]'
                : 'bg-[#fce8e6] dark:bg-[#601410]/50 border-[#f9dedc] dark:border-[#601410] text-[#b3261e] dark:text-[#f2b8b5]'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold mb-0.5">
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {result.success ? 'Sinkronisasi Berhasil' : 'Sinkronisasi Gagal'}
              {result.skipped ? ` (${result.reason})` : ''}
            </div>
            <p>{result.message}</p>
            <p className="mt-0.5 text-[10px] opacity-80">
              Status: {result.status} • Durasi: {result.durationMs ?? 0} ms
              {result.dryRun ? ' • Dry-run' : ''}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {sources.map((source) => (
            <SyncSourceCard
              key={source.key}
              source={source}
              running={running}
              onRun={(key) => run([key])}
            />
          ))}
        </div>
      </div>

      {/* Riwayat */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
            Riwayat 20 Run Terakhir
          </h2>
          <ColumnVisibilityPicker
            columns={SYNC_HISTORY_COLUMNS}
            visibleColumns={visibleHistoryColumns}
            onChange={setVisibleHistoryColumns}
            storageKey="ca_sync_history_columns"
          />
        </div>
        <SyncHistoryTable runs={runs} visibleColumns={visibleHistoryColumns} />
      </div>

      {/* RO yang diblokir */}
      <div className="panel-card p-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2">
            <ShieldOff className="h-4 w-4 mt-0.5 text-[#b3261e] dark:text-[#f2b8b5]" />
            <div>
              <h2 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                RO yang Diblokir ({tombstones.length})
              </h2>
              <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-1 max-w-2xl">
                RO yang Anda hapus manual dicatat di sini dan tidak akan dimasukkan lagi oleh sync,
                termasuk setelah aplikasi di-deploy ulang. Lepas blokir bila RO tersebut memang masih
                berlaku.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <ColumnVisibilityPicker
              columns={SYNC_TOMBSTONE_COLUMNS}
              visibleColumns={visibleTombstoneColumns}
              onChange={setVisibleTombstoneColumns}
              storageKey="ca_sync_tombstone_columns"
            />
          </div>
        </div>

        {tombstones.length === 0 ? (
          <p className="rounded-xl bg-[#f0f4f9] dark:bg-[#282a2c] px-3 py-2.5 text-xs text-[#444746] dark:text-[#c4c7c5]">
            Belum ada RO yang diblokir.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#e0e2ec] dark:border-[#333538]">
            <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
              <thead className="bg-[#f0f4f9] dark:bg-[#282a2c] text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] border-b border-[#e0e2ec] dark:border-[#333538]">
                <tr>
                  <th className="py-2 px-3">Nomor RO</th>
                  {isTombstoneColumnVisible('deleted_by') && (
                    <th className="py-2 px-3">Dihapus oleh</th>
                  )}
                  {isTombstoneColumnVisible('time') && (
                    <th className="py-2 px-3">Waktu</th>
                  )}
                  {isTombstoneColumnVisible('reason') && (
                    <th className="py-2 px-3">Alasan</th>
                  )}
                  <th className="py-2 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {tombstones.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#f0f4f9] dark:border-[#282a2c] last:border-0"
                  >
                    <td className="py-2 px-3 font-semibold">
                      {row.display_key || row.row_key}
                    </td>
                    {isTombstoneColumnVisible('deleted_by') && (
                      <td className="py-2 px-3">{row.created_by || '-'}</td>
                    )}
                    {isTombstoneColumnVisible('time') && (
                      <td className="py-2 px-3 whitespace-nowrap">
                        {row.created_at ? new Date(row.created_at).toLocaleString('id-ID') : '-'}
                      </td>
                    )}
                    {isTombstoneColumnVisible('reason') && (
                      <td className="py-2 px-3">{row.reason || '-'}</td>
                    )}
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => releaseTombstone(row.id)}
                        disabled={releasingTombstone === row.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] px-3 py-1 text-[11px] font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c] transition-colors disabled:opacity-50"
                      >
                        <Undo2 className="h-3 w-3" />
                        {releasingTombstone === row.id ? 'Melepas...' : 'Pulihkan'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supabase Connection Setup Guide */}
      <div className="panel-card p-5 space-y-3.5">
        <div className="flex items-center gap-2 text-[#1f1f1f] dark:text-[#e3e3e3] font-bold text-sm">
          <Database className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <span>Panduan Setup Supabase Database</span>
        </div>
        <p className="text-xs text-[#444746] dark:text-[#c4c7c5] leading-relaxed">
          Struktur konfigurasi integrasi Supabase pada proyek:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-4 border border-[#e0e2ec] dark:border-[#444746] space-y-1.5">
            <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-xs">
              1. Skema Tabel PostgreSQL
            </div>
            <p className="text-[#444746] dark:text-[#c4c7c5] text-[11px]">
              Jalankan{' '}
              <code className="text-[#1f1f1f] dark:text-[#e3e3e3]">supabase/sync-engine.sql</code>{' '}
              setelah disetujui. Tabel{' '}
              <code className="text-[#0b57d0] dark:text-[#a8c7fa] font-semibold">sync_runs</code>{' '}
              dan{' '}
              <code className="text-[#0b57d0] dark:text-[#a8c7fa] font-semibold">
                sync_run_sources
              </code>{' '}
              menyimpan riwayat engine.
            </p>
          </div>

          <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-4 border border-[#e0e2ec] dark:border-[#444746] space-y-1.5">
            <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-xs">
              2. Kredensial API
            </div>
            <p className="text-[#444746] dark:text-[#c4c7c5] text-[11px]">
              Isi{' '}
              <code className="text-[#1f1f1f] dark:text-[#e3e3e3]">SYNC_TOKEN</code> dan{' '}
              <code className="text-[#1f1f1f] dark:text-[#e3e3e3]">CRON_SECRET</code> di Vercel.
              Cron berjalan 19.00 UTC = 02.00 WIB.
            </p>
          </div>

          <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-4 border border-[#e0e2ec] dark:border-[#444746] space-y-1.5">
            <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-xs">
              3. Status Terkoneksi
            </div>
            <p className="text-[#444746] dark:text-[#c4c7c5] text-[11px]">
              Database Supabase aktif membaca dan menyimpan pembaruan status barang, PIC penerima,
              dan catatan dari dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Webhook Google Apps Script Snippet */}
      <div className="panel-card p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#1f1f1f] dark:text-[#e3e3e3] font-bold text-sm">
            <Zap className="h-4 w-4 text-[#b06000] dark:text-[#ffb951]" />
            <span>Skrip Push Otomatis Google Apps Script</span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(webhookScriptCode);
              setCopiedWebhook(true);
              setTimeout(() => setCopiedWebhook(false), 2000);
            }}
            className="flex items-center gap-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] px-3.5 py-1.5 text-xs text-[#444746] dark:text-[#c4c7c5] hover:bg-[#f0f4f9] dark:hover:bg-[#333537]"
          >
            {copiedWebhook ? (
              <Check className="h-3.5 w-3.5 text-[#137333] dark:text-[#6dd58c]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedWebhook ? 'Tersalin' : 'Salin Skrip'}
          </button>
        </div>
        <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
          Jika ingin Google Sheets mendorong pembaruan otomatis, tempel skrip ini pada
          menu <strong>Extensions &gt; Apps Script</strong>, isi <code>WEBHOOK_URL</code> dan{' '}
          <code>SYNC_TOKEN</code>, lalu jalankan fungsi <code>pasangTrigger</code> sekali.
          Fungsi itu memasang trigger <em>On edit</em>, <em>On change</em>, dan timer 5 menit
          sebagai jaring pengaman:
        </p>

        <pre className="rounded-2xl bg-[#1e1f20] dark:bg-[#131314] p-3.5 text-[11px] text-[#6dd58c] font-mono overflow-x-auto border border-[#444746]">
          {webhookScriptCode}
        </pre>
      </div>
    </div>
  );
}